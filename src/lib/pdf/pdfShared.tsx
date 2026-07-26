import { StyleSheet, Text } from '@react-pdf/renderer';
import { PDF_FONT } from './fonts';

// Styles, constants and pure helpers shared between LogbookPdf and
// StaffLogbookPdf. Kept out of LogbookPdf.tsx itself (which otherwise would
// export only components) so React Fast Refresh isn't disabled for that file.

export const FOOTER_ORG = 'RCOST Orthopaedic Trauma Fellowship Program';

const TEAL = '#0d6e64';
const INK = '#16231f';
const MUTED = '#6b7674';
const LINE = '#e5e9e7';

export const s = StyleSheet.create({
  page: { fontFamily: PDF_FONT, fontSize: 11, color: INK, paddingTop: 34, paddingBottom: 42, paddingHorizontal: 34 },

  // Front-page header band — intentionally left at its original sizes.
  titleBand: { backgroundColor: TEAL, borderRadius: 6, padding: 14, marginBottom: 16 },
  titleMain: { color: '#fff', fontSize: 15, fontWeight: 700 },
  titleSub: { color: 'rgba(255,255,255,0.85)', fontSize: 9, marginTop: 2 },

  fellowName: { fontSize: 18, fontWeight: 700, marginBottom: 2 },
  metaLine: { fontSize: 11.5, color: MUTED, marginBottom: 1.5 },
  rangeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 8, marginBottom: 16 },
  bigCount: { fontSize: 24, fontWeight: 700, color: TEAL },

  sectionRow: { flexDirection: 'row', gap: 18, marginBottom: 18 },
  col: { flex: 1 },
  sectionTitle: { fontSize: 12.5, fontWeight: 700, color: INK, marginBottom: 7, paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: LINE },

  rankRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 5 },
  rankNum: { width: 16, fontSize: 11, fontWeight: 700, color: TEAL },
  // Capped to 2 lines so one very long diagnosis/procedure can't push the
  // pie charts further down the page — it truncates with an ellipsis instead.
  rankLabel: { flex: 1, fontSize: 11, color: '#24302e', paddingRight: 6, maxLines: 2, textOverflow: 'ellipsis' },
  rankCount: { fontSize: 11, fontWeight: 600 },
  emptyNote: { fontSize: 10.5, color: '#8a938f' },

  chartsWrap: { marginTop: 4 },
  chartsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },

  runHeader: { position: 'absolute', top: 14, left: 34, right: 34, flexDirection: 'row', justifyContent: 'flex-end', color: MUTED, fontSize: 9 },
  footer: { position: 'absolute', bottom: 18, left: 34, right: 34, flexDirection: 'row', justifyContent: 'space-between', color: MUTED, fontSize: 9, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 5 },

  caseBlock: { borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 9 },
  caseHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 5, gap: 6 },
  caseNum: { fontSize: 11, fontWeight: 700, color: TEAL },
  caseDate: { fontSize: 11.5, fontWeight: 700 },
  chip: { fontSize: 9, color: '#5f6b6a', backgroundColor: '#f0f2f1', paddingVertical: 1.5, paddingHorizontal: 5, borderRadius: 3 },
  chipPlace: { fontSize: 9, color: TEAL, backgroundColor: '#eaf4f2', paddingVertical: 1.5, paddingHorizontal: 5, borderRadius: 3 },
  chipOutside: { fontSize: 9, color: '#b5651d', backgroundColor: '#fdf1e7', paddingVertical: 1.5, paddingHorizontal: 5, borderRadius: 3 },
  chipFellow: { fontSize: 9, color: '#4a5568', backgroundColor: '#eef0f4', paddingVertical: 1.5, paddingHorizontal: 5, borderRadius: 3 },

  fieldRow: { flexDirection: 'row', marginBottom: 2.5 },
  fieldKey: { width: 74, fontSize: 10, color: MUTED },
  fieldVal: { flex: 1, fontSize: 10.5, color: '#24302e' },
  metaRow: { fontSize: 10, color: MUTED, marginTop: 3 },
});

export function formatPdfDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso || '—';
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

/** The footer render prop shared by every page — react-pdf passes
 *  totalPages to a View's render at runtime, but its View type omits it
 *  (only Text's type lists it), so it's read via cast. */
export function pdfFooter(props: unknown) {
  const { pageNumber, totalPages } = props as { pageNumber: number; totalPages: number };
  return (
    <>
      <Text>{FOOTER_ORG}</Text>
      <Text>Page {pageNumber} of {totalPages}</Text>
    </>
  );
}
