// Groups synonymous free-text diagnosis/procedure labels (e.g. "ORIF" and
// "open reduction internal fixation", "LCP" and "locking compression plate")
// via an LLM call, so the PDF export's top-5 ranking (src/lib/pdf/stats.ts,
// topN's `clusters` argument) counts synonyms together instead of splitting
// them by exact wording.
//
// Input is deliberately just the distinct label strings the client already
// deduplicated (see uniqueLabels in stats.ts) — no case dates, hospital
// numbers, or fellow names ever reach this function or the AI provider.
//
// Called by the app right before building a PDF summary page. Advisory, like
// notify-case: any failure here must fall back to identity grouping (which
// makes topN's ranking exact-text, same as before this feature existed) —
// never block the export.
//
// POST body: { labels: string[] }         (deduplicated diagnosis OR procedure text)
// Response:  { groups: Record<string, string> }   (each input label -> canonical label)
//
// Deployed like the other functions (JWT verified):
//   npx supabase functions deploy cluster-labels
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

// Keeps a pathological input (and the resulting prompt) bounded — a logbook's
// distinct diagnosis/procedure wordings never come close to this in practice.
const MAX_LABELS = 200;

const TOOL_NAME = 'group_labels';

interface LabelGroup {
  canonical: string;
  members: string[];
}

/** Read per call, not at module load, so a secret set after a warm isolate
 *  started still takes effect immediately (see telegram.ts for the same
 *  reasoning). */
function deepseekKey(): string {
  return (Deno.env.get('DEEPSEEK_API_KEY') ?? '').trim();
}

/** No secret set → every label is its own group, i.e. today's exact-text
 *  ranking. Keeps the app working before AI clustering is configured. */
function identityGroups(labels: string[]): Record<string, string> {
  return Object.fromEntries(labels.map(l => [l, l]));
}

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
    const labels = payload?.labels;
    if (!Array.isArray(labels) || labels.some(l => typeof l !== 'string')) {
      return json({ error: 'labels must be a string array' }, 400);
    }

    const trimmed = [...new Set(labels.map(l => l.trim()).filter(Boolean))].slice(0, MAX_LABELS);
    if (trimmed.length < 2) return json({ groups: identityGroups(trimmed) });

    const apiKey = deepseekKey();
    if (!apiKey) return json({ groups: identityGroups(trimmed) });

    const groups = await groupWithDeepSeek(trimmed, apiKey);
    const map: Record<string, string> = {};
    for (const g of groups) {
      for (const m of g.members) map[m] = g.canonical;
    }
    // Anything the model dropped from its groups still ranks, just ungrouped.
    for (const l of trimmed) if (!(l in map)) map[l] = l;

    return json({ groups: map });
  } catch (err) {
    console.error(err);
    // Advisory: identity grouping on any failure, never a broken export.
    return json({ groups: {} });
  }
});

/** DeepSeek's API is OpenAI-compatible: chat completions with function-calling
 *  tools, at https://api.deepseek.com (no /v1 prefix — see their docs). */
async function groupWithDeepSeek(labels: string[], apiKey: string): Promise<LabelGroup[]> {
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
            'These are free-text orthopaedic diagnosis or procedure entries from a surgical logbook. ' +
            'Group entries that refer to the same clinical concept, including abbreviation/full-name pairs ' +
            '(e.g. "ORIF" and "open reduction internal fixation", "LCP" and "locking compression plate"). ' +
            'Do not merge entries that differ in a clinically meaningful way (different bone, side, or ' +
            'fracture pattern stays separate). Every input label must appear in exactly one group\'s ' +
            '"members", copied verbatim. Each group\'s "canonical" must be one of its own members — the ' +
            'clearest, most complete wording already present in the input — never invented text.\n\n' +
            `Labels:\n${JSON.stringify(labels)}`,
        },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: TOOL_NAME,
            description: 'Report the grouping of the given labels.',
            parameters: {
              type: 'object',
              properties: {
                groups: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      canonical: { type: 'string' },
                      members: { type: 'array', items: { type: 'string' } },
                    },
                    required: ['canonical', 'members'],
                  },
                },
              },
              required: ['groups'],
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
  const parsed = JSON.parse(rawArgs) as { groups?: unknown };
  if (!Array.isArray(parsed.groups)) throw new Error('malformed tool response');
  return parsed.groups as LabelGroup[];
}
