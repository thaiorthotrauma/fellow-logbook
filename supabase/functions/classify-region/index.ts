// Reads free-text diagnosis/Q7(other classification)/memo entries from a
// surgical logbook via an LLM call, answering two questions per entry:
//
//  1. Which AO/OTA anatomical region+bone(+segment) it describes — only for
//     cases with no structured Q6 (aoCode) to resolve deterministically. See
//     resolveStructuredRegion in src/lib/pdf/regionCategory.ts, which always
//     wins when the code parses. Only ever one of the caller-supplied
//     `regions` labels (the closed list from allRegionLabelOptions()) —
//     anything else is discarded server-side, and again client-side.
//  2. Whether the patient is pediatric — only for entries stating no
//     explicit age. detectAge in regionCategory.ts settles anything with a
//     numeric age marker ("12 YO", "65 YO") deterministically and is never
//     overridden; this call exists for the half a number-anchored regex
//     structurally cannot read, where a child is named in words alone
//     ("infant", "toddler", "เด็กชาย").
//
// Laterality (left/right/bilateral/Lt/Rt) must be ignored entirely — the
// region categories carry no side information.
//
// Input is deliberately just the distinct combined-text entries the client
// already deduplicated (see uniqueAiTexts in regionCategory.ts) — no case
// dates, hospital numbers, or fellow names ever reach this function or the
// AI provider.
//
// Called by the app right before building a PDF summary page, alongside
// cluster-labels. Advisory: any failure here must fall back to empty maps,
// leaving every case where the deterministic passes put it — never block
// the export.
//
// POST body: { texts: string[], regions: string[] }
// Response:  { assignments: Record<string, string>,   (text -> one of `regions`, omitted if unclear)
//              pediatric:   Record<string, boolean> }  (text -> is the patient a child)
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
    if (trimmed.length === 0) return json({ assignments: {}, pediatric: {} });

    const apiKey = (Deno.env.get('DEEPSEEK_API_KEY') ?? '').trim();
    if (!apiKey) return json({ assignments: {}, pediatric: {} });

    const rows = await classifyWithDeepSeek(trimmed, regions as string[], apiKey);

    // Belt-and-braces: only ever hand back a region that is one of the
    // caller's own allowed labels, even though the prompt already constrains
    // the model to them.
    const validRegions = new Set(regions as string[]);
    const assignments: Record<string, string> = {};
    const pediatric: Record<string, boolean> = {};
    for (const row of rows) {
      if (typeof row.text !== 'string') continue;
      if (typeof row.region === 'string' && validRegions.has(row.region)) assignments[row.text] = row.region;
      if (typeof row.pediatric === 'boolean') pediatric[row.text] = row.pediatric;
    }

    return json({ assignments, pediatric });
  } catch (err) {
    console.error(err);
    // Advisory: on any failure here every case stays exactly where the
    // client's deterministic passes put it, never a broken export.
    return json({ assignments: {}, pediatric: {} });
  }
});

/** DeepSeek's API is OpenAI-compatible: chat completions with function-calling
 *  tools, at https://api.deepseek.com (no /v1 prefix — see their docs). */
interface ClassifiedRow {
  text?: unknown;
  region?: unknown;
  pediatric?: unknown;
}

async function classifyWithDeepSeek(
  texts: string[],
  regions: string[],
  apiKey: string,
): Promise<ClassifiedRow[]> {
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
            'written in English, Thai, or a mix. Report one row per entry, copying "text" verbatim, with ' +
            'two judgements:\n\n' +
            '1. "region": the single anatomical region the entry names, chosen verbatim from the closed ' +
            'list below, based on the bone or joint involved. Ignore laterality entirely (left, right, ' +
            'bilateral, Lt, Rt) — it never affects the region. If the entry names no identifiable ' +
            'anatomical region, omit "region" for that row rather than guessing.\n\n' +
            '2. "pediatric": true when the entry describes a child under 16 years old, false otherwise. ' +
            'Judge this from the words actually present — a child may be named without any number ' +
            '("infant", "newborn", "toddler", "child", "boy", "girl", "adolescent", "เด็ก", "เด็กชาย", ' +
            '"เด็กหญิง", "ทารก"). Be careful with durations: a bare month or year count is usually time ' +
            'elapsed, not an age, so "ORIF 12 months post-op", "6 เดือน post op" and "2 years after ' +
            'injury" are all pediatric=false. When the entry gives no indication of the patient\'s age at ' +
            'all, answer false.\n\n' +
            `Allowed regions:\n${JSON.stringify(regions)}\n\n` +
            `Entries:\n${JSON.stringify(texts)}`,
        },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: TOOL_NAME,
            description: 'Report the region and pediatric judgement for each entry.',
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
                      pediatric: { type: 'boolean' },
                    },
                    required: ['text', 'pediatric'],
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
  return parsed.assignments as ClassifiedRow[];
}
