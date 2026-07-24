import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { PDF_FONT } from './fonts';
import PieChart from './PieChart';
import { distribution, topN, type RankItem } from './stats';
import {
  OPTIME_MAP,
  PLACE,
  PLACE_MAP,
  PROC_MAP,
  PROC_TYPE,
  ROLE_MAP,
  ROLES,
  TIMING_MAP,
} from '../../data';
import type { CaseEntry } from '../../types';

export interface LogbookPdfProps {
  fellowName: string;
  institution: string | null;
  yearLabel: string;
  rangeLabel: string;
  generatedLabel: string;
  /** Already filtered to the range and sorted oldest → newest. */
  cases: CaseEntry[];
}

const TEAL = '#0d6e64';
const INK = '#16231f';
const MUTED = '#6b7674';
const LINE = '#e5e9e7';

const s = StyleSheet.create({
  page: { fontFamily: PDF_FONT, fontSize: 9, color: INK, paddingTop: 34, paddingBottom: 40, paddingHorizontal: 34 },

  titleBand: { backgroundColor: TEAL, borderRadius: 6, padding: 14, marginBottom: 16 },
  titleMain: { color: '#fff', fontSize: 15, fontWeight: 700 },
  titleSub: { color: 'rgba(255,255,255,0.85)', fontSize: 9, marginTop: 2 },

  fellowName: { fontSize: 16, fontWeight: 700, marginBottom: 2 },
  metaLine: { fontSize: 10, color: MUTED, marginBottom: 1 },
  rangeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 8, marginBottom: 16 },
  bigCount: { fontSize: 22, fontWeight: 700, color: TEAL },

  sectionRow: { flexDirection: 'row', gap: 18, marginBottom: 18 },
  col: { flex: 1 },
  sectionTitle: { fontSize: 10, fontWeight: 700, color: INK, marginBottom: 6, paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: LINE },

  rankRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  rankNum: { width: 14, fontSize: 9, fontWeight: 700, color: TEAL },
  rankLabel: { flex: 1, fontSize: 9, color: '#24302e', paddingRight: 6 },
  rankCount: { fontSize: 9, fontWeight: 600 },
  emptyNote: { fontSize: 8.5, color: '#8a938f' },

  chartsWrap: { marginTop: 4 },
  chartsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },

  runHeader: { position: 'absolute', top: 14, left: 34, right: 34, flexDirection: 'row', justifyContent: 'space-between', color: MUTED, fontSize: 7.5 },
  footer: { position: 'absolute', bottom: 18, left: 34, right: 34, flexDirection: 'row', justifyContent: 'space-between', color: MUTED, fontSize: 7.5, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 5 },

  caseBlock: { borderBottomWidth: 1, borderBottomColor: LINE, paddingVertical: 8 },
  caseHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 6 },
  caseNum: { fontSize: 9, fontWeight: 700, color: TEAL },
  caseDate: { fontSize: 9.5, fontWeight: 700 },
  chip: { fontSize: 7.5, color: '#5f6b6a', backgroundColor: '#f0f2f1', paddingVertical: 1.5, paddingHorizontal: 5, borderRadius: 3 },
  chipPlace: { fontSize: 7.5, color: TEAL, backgroundColor: '#eaf4f2', paddingVertical: 1.5, paddingHorizontal: 5, borderRadius: 3 },
  chipOutside: { fontSize: 7.5, color: '#b5651d', backgroundColor: '#fdf1e7', paddingVertical: 1.5, paddingHorizontal: 5, borderRadius: 3 },

  fieldRow: { flexDirection: 'row', marginBottom: 1.5 },
  fieldKey: { width: 62, fontSize: 8, color: MUTED },
  fieldVal: { flex: 1, fontSize: 8.5, color: '#24302e' },
  metaRow: { fontSize: 8, color: MUTED, marginTop: 2 },
});

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso || '—';
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function RankTable({ title, items }: { title: string; items: RankItem[] }) {
  return (
    <View style={s.col}>
      <Text style={s.sectionTitle}>{title}</Text>
      {items.length === 0 ? (
        <Text style={s.emptyNote}>No entries.</Text>
      ) : (
        items.map((it, i) => (
          <View key={i} style={s.rankRow}>
            <Text style={s.rankNum}>{i + 1}.</Text>
            <Text style={s.rankLabel}>{it.label}</Text>
            <Text style={s.rankCount}>{it.count}</Text>
          </View>
        ))
      )}
    </View>
  );
}

export default function LogbookPdf({ fellowName, institution, yearLabel, rangeLabel, generatedLabel, cases }: LogbookPdfProps) {
  const topDx = topN(cases, c => c.diagnosis, 5);
  const topProc = topN(cases, c => c.procedure, 5);
  const typeDist = distribution(cases, c => c.procedureType, PROC_TYPE);
  const roleDist = distribution(cases, c => c.role, ROLES);
  const placeDist = distribution(cases, c => c.place, PLACE);

  return (
    <Document title={`TOTS Logbook — ${fellowName}`} author={fellowName}>
      {/* ── Page 1 · Summary ─────────────────────────────────────────────── */}
      <Page size="A4" style={s.page}>
        <View style={s.titleBand}>
          <Text style={s.titleMain}>TOTS Fellow Logbook</Text>
          <Text style={s.titleSub}>Operative case summary</Text>
        </View>

        <Text style={s.fellowName}>{fellowName || '—'}</Text>
        {institution ? <Text style={s.metaLine}>Institution : {institution}</Text> : null}
        <Text style={s.metaLine}>Fellowship year {yearLabel}</Text>

        <View style={s.rangeRow}>
          <View>
            <Text style={s.metaLine}>Range</Text>
            <Text style={{ fontSize: 12, fontWeight: 600 }}>{rangeLabel}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.bigCount}>{cases.length}</Text>
            <Text style={s.metaLine}>{cases.length === 1 ? 'case' : 'cases'}</Text>
          </View>
        </View>

        <View style={s.sectionRow}>
          <RankTable title="Top 5 Diagnoses" items={topDx} />
          <RankTable title="Top 5 Procedures" items={topProc} />
        </View>

        <View style={s.chartsWrap}>
          <Text style={s.sectionTitle}>Case distribution</Text>
          <View style={s.chartsRow}>
            <PieChart title="Type of procedure" slices={typeDist} />
            <PieChart title="Role" slices={roleDist} />
            <PieChart title="Place" slices={placeDist} />
          </View>
        </View>

        <View
          style={s.footer}
          fixed
          render={props => {
            // react-pdf passes totalPages to a View's render at runtime, but its
            // View type omits it (only Text's type lists it), so read it via cast.
            const { pageNumber, totalPages } = props as unknown as { pageNumber: number; totalPages: number };
            return (
              <>
                <Text>{generatedLabel}</Text>
                <Text>Page {pageNumber} of {totalPages}</Text>
              </>
            );
          }}
        />
      </Page>

      {/* ── Content · one block per case, oldest → newest ────────────────── */}
      <Page size="A4" style={s.page}>
        <View style={s.runHeader} fixed>
          <Text>{fellowName}</Text>
          <Text>{rangeLabel}</Text>
        </View>

        <Text style={{ fontSize: 11, fontWeight: 700, marginBottom: 6, marginTop: 6 }}>
          Cases ({cases.length})
        </Text>

        {cases.map((c, i) => {
          const outside = c.place === 'outside';
          return (
            <View key={c.id} style={s.caseBlock} wrap={false}>
              <View style={s.caseHead}>
                <Text style={s.caseNum}>#{i + 1}</Text>
                <Text style={s.caseDate}>{formatDate(c.date)}</Text>
                {c.timing ? <Text style={s.chip}>{TIMING_MAP[c.timing] ?? c.timing}</Text> : null}
                <Text style={outside ? s.chipOutside : s.chipPlace}>{PLACE_MAP[c.place ?? ''] ?? '—'}</Text>
                {c.aoCode ? <Text style={s.chip}>{c.aoCode}</Text> : null}
              </View>

              <View style={s.fieldRow}><Text style={s.fieldKey}>Diagnosis</Text><Text style={s.fieldVal}>{c.diagnosis || '—'}</Text></View>
              {c.otherClassification ? (
                <View style={s.fieldRow}><Text style={s.fieldKey}>Other class.</Text><Text style={s.fieldVal}>{c.otherClassification}</Text></View>
              ) : null}
              {c.approach ? (
                <View style={s.fieldRow}><Text style={s.fieldKey}>Approach</Text><Text style={s.fieldVal}>{c.approach}</Text></View>
              ) : null}
              <View style={s.fieldRow}><Text style={s.fieldKey}>Procedure</Text><Text style={s.fieldVal}>{c.procedure || '—'}</Text></View>

              <Text style={s.metaRow}>
                {(PROC_MAP[c.procedureType ?? ''] ?? '—')} · {(ROLE_MAP[c.role ?? ''] ?? '—')} · {(OPTIME_MAP[c.opTime ?? ''] ?? '—')}
              </Text>
            </View>
          );
        })}

        <View
          style={s.footer}
          fixed
          render={props => {
            // react-pdf passes totalPages to a View's render at runtime, but its
            // View type omits it (only Text's type lists it), so read it via cast.
            const { pageNumber, totalPages } = props as unknown as { pageNumber: number; totalPages: number };
            return (
              <>
                <Text>{generatedLabel}</Text>
                <Text>Page {pageNumber} of {totalPages}</Text>
              </>
            );
          }}
        />
      </Page>
    </Document>
  );
}
