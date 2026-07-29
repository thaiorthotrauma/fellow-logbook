import { describe, expect, it, vi } from 'vitest';
import type { CaseEntry } from '../../types';

// The real fonts module imports .ttf assets through Vite's asset pipeline,
// which resolves to a URL react-pdf can't fetch under Node. Register the same
// TTFs from disk instead, so the document still renders with the real Thai
// face rather than silently falling back to Helvetica.
vi.mock('./fonts', async () => {
  const { Font } = await import('@react-pdf/renderer');
  // .pathname rather than node:url's fileURLToPath, so this file needs no
  // Node type definitions to typecheck under the app's tsconfig.
  const dir = new URL('../../assets/fonts/', import.meta.url).pathname;
  return {
    PDF_FONT: 'IBM Plex Sans Thai',
    registerPdfFonts: () => {
      Font.register({
        family: 'IBM Plex Sans Thai',
        fonts: [
          { src: `${dir}IBMPlexSansThai-Regular.ttf`, fontWeight: 400 },
          { src: `${dir}IBMPlexSansThai-SemiBold.ttf`, fontWeight: 600 },
          { src: `${dir}IBMPlexSansThai-Bold.ttf`, fontWeight: 700 },
        ],
      });
      Font.registerHyphenationCallback(word => [word]);
    },
  };
});

import { generateLogbookBlob } from './generate';

function makeCase(over: Partial<CaseEntry> & { id: string; date: string }): CaseEntry {
  return {
    timing: 'in',
    place: 'own',
    staff: 'Staff A',
    hn: '12345',
    diagnosis: 'Femoral shaft fracture',
    otherClassification: '',
    approach: 'Lateral',
    position: 'Supine',
    procedure: 'ORIF',
    procedureType: 'primary',
    role: 'primary_surgeon',
    opTime: '1-2',
    memo: '',
    aoCode: '32A1',
    aoRegionLabel: 'Femur',
    imagePaths: [],
    ...over,
  } as CaseEntry;
}

const cases: CaseEntry[] = [
  makeCase({ id: '1', date: '2026-07-02' }),
  makeCase({ id: '2', date: '2026-07-11', diagnosis: 'Tibial plateau fracture', procedure: 'Plating', aoCode: '41B2', aoRegionLabel: 'Tibia' }),
  makeCase({ id: '3', date: '2026-07-20', diagnosis: 'Distal radius fracture', procedure: 'K-wire fixation', role: 'primary_assistant', aoCode: '23A2', aoRegionLabel: 'Radius' }),
];

/** The PDF decoded as latin1, so byte offsets map 1:1 onto characters for the
 *  ASCII structure markers asserted below. */
async function render(over: Parameters<typeof generateLogbookBlob>[0]): Promise<string> {
  const blob = await generateLogbookBlob(over);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return new TextDecoder('latin1').decode(bytes);
}

/** Page objects in the output — the honest signal that case rows actually
 *  paginated. Raw byte length is not: font embedding alone puts even a
 *  zero-case document over 20 kB. */
function pageCount(pdf: string): number {
  return pdf.match(/\/Type\s*\/Page[^s]/g)?.length ?? 0;
}

function embeddedFonts(pdf: string): string[] {
  const seen = pdf.match(/\/BaseFont\s*\/[A-Z]{6}\+[\w-]+/g) ?? [];
  return [...new Set(seen.map(m => m.replace(/.*\+/, '')))];
}

const base = {
  fellowName: 'Test Fellow',
  institution: 'Test Institute',
  yearLabel: '2026–2027',
  rangeLabel: 'July 2026',
  regionMap: new Map<string, string>(),
};

function bulkCases(n: number): CaseEntry[] {
  return Array.from({ length: n }, (_, i) =>
    makeCase({ id: String(i), date: `2026-07-${String((i % 27) + 1).padStart(2, '0')}`, diagnosis: `Dx ${i}`, procedure: `Proc ${i}` }),
  );
}

describe('generateLogbookBlob (fellow export)', () => {
  it('produces a structurally valid, non-trivial PDF', async () => {
    const pdf = await render({
      fellowName: 'ปองสิทธิ์ โพธิคุณ',
      institution: 'Test Institute',
      yearLabel: '2026–2027',
      rangeLabel: 'July 2026',
      cases,
      regionMap: new Map(),
    });

    expect(pdf.startsWith('%PDF-')).toBe(true);
    expect(pdf.slice(-1024)).toContain('%%EOF');
    expect(pageCount(pdf)).toBeGreaterThan(0);
  }, 30_000);

  it('paginates as cases are added, so case rows really reach the document', async () => {
    // The load-bearing assertion in this file. Byte size and a nonzero page
    // count both pass on a zero-case render (font embedding alone exceeds
    // 20 kB), so neither proves the cases rendered — page growth does.
    const [empty, few, many] = await Promise.all([
      render({ ...base, cases: [] }).then(pageCount),
      render({ ...base, cases: bulkCases(3) }).then(pageCount),
      render({ ...base, cases: bulkCases(60) }).then(pageCount),
    ]);

    expect(few).toBeGreaterThanOrEqual(empty);
    expect(many).toBeGreaterThan(few);
  }, 60_000);

  it('embeds the Thai face, which is what renders a Thai fellow name', async () => {
    const pdf = await render({
      ...base,
      fellowName: 'ปองสิทธิ์ โพธิคุณ',
      institution: 'โรงพยาบาลทดสอบ',
      cases,
    });

    expect(pdf.startsWith('%PDF-')).toBe(true);
    // Asserting the actual embedded face, not just "it didn't throw": a
    // silent fallback to Helvetica would drop every Thai glyph.
    expect(embeddedFonts(pdf).join(' ')).toContain('IBMPlexSansThai');
  }, 30_000);

  it('renders with a null institution, as demo/unlinked fellows have', async () => {
    const pdf = await render({ ...base, institution: null, cases });
    expect(pdf.startsWith('%PDF-')).toBe(true);
    expect(pageCount(pdf)).toBeGreaterThan(0);
  }, 30_000);

  it('renders on both AI outcomes — empty (DeepSeek failed) and populated', async () => {
    // clustersFor degrades to empty maps on failure, so the export has to be
    // fine either way; clustering/classification only refine the summary
    // rankings. The region map is keyed to the one case below with no aoCode,
    // so the populated path is actually exercised rather than looked up and
    // missed.
    const withUnclassified = [
      ...cases,
      makeCase({ id: '4', date: '2026-07-25', diagnosis: 'Tibial plateau fracture', aoCode: '', aoRegionLabel: '' }),
    ];
    const withoutClusters = await render({ ...base, cases: withUnclassified });
    const withClusters = await render({
      ...base,
      cases: withUnclassified,
      regionMap: new Map([['tibial plateau fracture', 'Tibia / Fibula (Leg) – Tibia – Proximal']]),
    });

    for (const pdf of [withoutClusters, withClusters]) {
      expect(pdf.startsWith('%PDF-')).toBe(true);
      expect(pageCount(pdf)).toBeGreaterThan(0);
    }
  }, 60_000);
});
