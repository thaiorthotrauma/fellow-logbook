// Classifies free-text diagnosis/Q7(other classification)/memo entries into
// an AO/OTA anatomical region+bone(+segment) bucket, via an LLM call, for
// cases that have no structured Q6 (aoCode) answer to resolve
// deterministically — see resolveStructuredRegion in
// src/lib/pdf/regionCategory.ts, which always wins when aoCode is present.
// This function only ever runs on the leftover free text, and only ever
// returns one of the caller-supplied `regions` labels (the closed list from
// allRegionLabelOptions()) — anything else is discarded server-side, and
// again client-side in classifyRegion.ts.
//
// Laterality (left/right/bilateral/Lt/Rt) must be ignored entirely — the
// region categories carry no side information. Patient age must also be
// ignored here; pediatric tagging is handled separately, client-side, by a
// deterministic regex (isPediatric in regionCategory.ts), not by this call.
//
// Input is deliberately just the distinct combined-text entries the client
// already deduplicated (see uniqueUnclassifiedTexts in regionCategory.ts) —
// no case dates, hospital numbers, or fellow names ever reach this function
// or the AI provider.
//
// Called by the app right before building a PDF summary page, alongside
// cluster-labels. Advisory: any failure here must fall back to
// "Unclassified" (i.e. an empty assignments map) — never block the export.
//
// POST body: { texts: string[], regions: string[] }
// Response:  { assignments: Record<string, string> }  (text -> one of `regions`, omitted if unclear)
//
// Deployed like the other functions (JWT verified):
//   npx supabase functions deploy classify-region
//
// Required secret: DEEPSEEK_API_KEY (from https://platform.deepseek.com)
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// Keeps a pathological input (and the resulting prompt) bounded — a
// logbook's distinct unclassified wordings never come close to this in
// practice.
const MAX_TEXTS = 200;

const TOOL_NAME = 'classify_regions';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const user = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await user.auth.getUser();
    if (userError || !userData.user) return json({ error: 'not authenticated' }, 401);

    const payload = await req.json();
    const texts = payload?.texts;
    const regions = payload?.regions;
    if (!Array.isArray(texts) || texts.some((t: unknown) => typeof t !== 'string')) {
      return json({ error: 'texts must be a string array' }, 400);
    }
    if (!Array.isArray(regions) || regions.length === 0 || regions.some((r: unknown) => typeof r !== 'string')) {
      return json({ error: 'regions must be a non-empty string array' }, 400);
    }

    const trimmed = [...new Set(texts.map((t: string) => t.trim()).filter(Boolean))].slice(0, MAX_TEXTS);
    if (trimmed.length === 0) return json({ assignments: {} });

    const apiKey = (Deno.env.get('DEEPSEEK_API_KEY') ?? '').trim();
    if (!apiKey) return json({ assignments: {} });

    const assignments = await classifyWithDeepSeek(trimmed, regions as string[], apiKey);

    // Belt-and-braces: only ever hand back an assignment that is one of the
    // caller's own allowed labels, even though the prompt already constrains
    // the model to them.
    const validRegions = new Set(regions as string[]);
    const out: Record<string, string> = {};
    for (const [text, region] of Object.entries(assignments)) {
      if (validRegions.has(region)) out[text] = region;
    }

    return json({ assignments: out });
  } catch (err) {
    console.error(err);
    // Advisory: every case falls back to "Unclassified" on any failure here,
    // never a broken export.
    return json({ assignments: {} });
  }
});

/** DeepSeek's API is OpenAI-compatible: chat completions with function-calling
 *  tools, at https://api.deepseek.com (no /v1 prefix — see their docs). */
async function classifyWithDeepSeek(
  texts: string[],
  regions: string[],
  apiKey: string,
): Promise<Record<string, string>> {
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'user',
          content:
            'These are free-text orthopaedic diagnosis/classification/memo entries from a surgical logbook, ' +
            'each missing a structured AO/OTA region code. Assign each entry to exactly one anatomical region ' +
            'from the closed list below, based on the bone or joint it names. Ignore laterality entirely ' +
            '(left, right, bilateral, Lt, Rt) — it never affects the assigned region. Ignore patient age ' +
            'entirely. If an entry gives no identifiable anatomical region, omit it from your answer rather ' +
            'than guessing.\n\n' +
            `Allowed regions (choose one, verbatim, per entry):\n${JSON.stringify(regions)}\n\n` +
            `Entries:\n${JSON.stringify(texts)}`,
        },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: TOOL_NAME,
            description: 'Report the region assignment for each entry.',
            parameters: {
              type: 'object',
              properties: {
                assignments: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      text: { type: 'string' },
                      region: { type: 'string' },
                    },
                    required: ['text', 'region'],
                  },
                },
              },
              required: ['assignments'],
            },
          },
        },
      ],
      tool_choice: { type: 'function', function: { name: TOOL_NAME } },
    }),
  });

  if (!res.ok) throw new Error(`DeepSeek API error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0] as
    | { function?: { arguments?: string } }
    | undefined;
  const rawArgs = toolCall?.function?.arguments;
  if (typeof rawArgs !== 'string') throw new Error('malformed tool response');
  const parsed = JSON.parse(rawArgs) as { assignments?: unknown };
  if (!Array.isArray(parsed.assignments)) throw new Error('malformed tool response');

  const out: Record<string, string> = {};
  for (const a of parsed.assignments as { text?: unknown; region?: unknown }[]) {
    if (typeof a.text === 'string' && typeof a.region === 'string') out[a.text] = a.region;
  }
  return out;
}
