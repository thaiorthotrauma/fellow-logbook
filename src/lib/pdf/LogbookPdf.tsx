import { Document, Page, Text, View } from '@react-pdf/renderer';
import PieChart from './PieChart';
import { distribution, topN, type RankItem } from './stats';
import { topRegions } from './regionCategory';
import { s, formatPdfDate, pdfFooter } from './pdfShared';
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
import { formatBulletedField, formatClassification } from '../textFormat';
import type { CaseEntry } from '../../types';

export interface LogbookPdfProps {
  fellowName: string;
  institution: string | null;
  yearLabel: string;
  rangeLabel: string;
  /** Already filtered to the range and sorted oldest → newest. A case that
   *  carries a `fellowName` (i.e. a StaffCaseEntry, used for the institution-
   *  wide month-range export) shows it as a chip in the content page — a
   *  single fellow's own export never needs this, since every case is theirs. */
  cases: (CaseEntry & { fellowName?: string })[];
  /** AI region classification for cases Q6 could not resolve, and AI
   *  pediatric judgement for cases stating no explicit age — see
   *  classifyRegion.ts. Omitted or empty leaves each case where the
   *  deterministic passes in regionCategory.ts put it. */
  regionMap?: ReadonlyMap<string, string>;
  pediatricMap?: ReadonlyMap<string, boolean>;
  /** AI-clustered synonym groupings for the summary page's top-5 procedures
   *  ranking (see clusterLabels.ts). Omitted or empty falls back to
   *  exact-text ranking. */
  procClusters?: ReadonlyMap<string, string>;
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

export interface SummaryPageProps {
  headingName: string;
  institution: string | null;
  yearLabel: string;
  rangeLabel: string;
  cases: CaseEntry[];
  /** AI-derived region/age/synonym data — see LogbookPdfProps above. */
  regionMap?: ReadonlyMap<string, string>;
  pediatricMap?: ReadonlyMap<string, boolean>;
  procClusters?: ReadonlyMap<string, string>;
}

/** Page 1 of a logbook: case count, top diagnoses/procedures, distribution
 *  charts. `headingName` is a fellow's name for a single-fellow export, or
 *  the institution for the staff by-month-range export — the page itself
 *  doesn't care which, it just needs a heading and a case set to summarize. */
export function SummaryPage({
  headingName,
  institution,
  yearLabel,
  rangeLabel,
  cases,
  regionMap,
  pediatricMap,
  procClusters,
}: SummaryPageProps) {
  const topRegionsList = topRegions(cases, 5, regionMap, pediatricMap);
  const topProc = topN(cases, c => c.procedure, 5, procClusters);
  const typeDist = distribution(cases, c => c.procedureType, PROC_TYPE);
  const roleDist = distribution(cases, c => c.role, ROLES);
  const placeDist = distribution(cases, c => c.place, PLACE);

  return (
    <Page size="A4" style={s.page}>
      <View style={s.titleBand}>
        <Text style={s.titleMain}>TOTS Fellow Logbook</Text>
        <Text style={s.titleSub}>Operative case summary</Text>
      </View>

      <Text style={s.fellowName}>{headingName || '—'}</Text>
      {institution ? <Text style={s.metaLine}>Institution : {institution}</Text> : null}
      <Text style={s.metaLine}>Fellowship year {yearLabel}</Text>

      <View style={s.rangeRow}>
        <View>
          <Text style={s.metaLine}>Range</Text>
          <Text style={{ fontSize: 14, fontWeight: 600 }}>{rangeLabel}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.bigCount}>{cases.length}</Text>
          <Text style={s.metaLine}>{cases.length === 1 ? 'case' : 'cases'}</Text>
        </View>
      </View>

      <View style={s.sectionRow}>
        <RankTable title="Top 5 Operated Regions" items={topRegionsList} />
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

      <View style={s.footer} fixed render={pdfFooter} />
    </Page>
  );
}

export interface ContentPageProps {
  /** Shown top-right on every page of this section. */
  runHeaderName: string;
  cases: (CaseEntry & { fellowName?: string })[];
}

/** One block per case, oldest → newest. `cases` may carry `fellowName` (the
 *  institution-wide export), in which case it's shown as a chip — a single
 *  fellow's own export never sets it, since every case is already theirs. */
export function ContentPage({ runHeaderName, cases }: ContentPageProps) {
  return (
    <Page size="A4" style={s.page}>
      <View style={s.runHeader} fixed>
        <Text>{runHeaderName}</Text>
      </View>

      <Text style={{ fontSize: 13, fontWeight: 700, marginBottom: 7, marginTop: 6 }}>
        Recorded Cases (total of {cases.length})
      </Text>

      {cases.map((c, i) => {
        const outside = c.place === 'outside';
        return (
          <View key={c.id} style={s.caseBlock} wrap={false}>
            <View style={s.caseHead}>
              <Text style={s.caseNum}>#{i + 1}</Text>
              <Text style={s.caseDate}>{formatPdfDate(c.date)}</Text>
              <Text style={outside ? s.chipOutside : s.chipPlace}>{PLACE_MAP[c.place ?? ''] ?? '—'}</Text>
              {c.timing ? <Text style={s.chip}>{TIMING_MAP[c.timing] ?? c.timing}</Text> : null}
              {c.fellowName ? <Text style={s.chipFellow}>{c.fellowName}</Text> : null}
            </View>

            <View style={s.fieldRow}><Text style={s.fieldKey}>Diagnosis</Text><Text style={s.fieldVal}>{formatBulletedField(c.diagnosis) || '—'}</Text></View>
            {(() => {
              const classification = formatClassification(c.aoCode, c.otherClassification);
              return classification ? (
                <View style={s.fieldRow}><Text style={s.fieldKey}>Classification</Text><Text style={s.fieldVal}>{classification}</Text></View>
              ) : null;
            })()}
            {c.approach ? (
              <View style={s.fieldRow}><Text style={s.fieldKey}>Approach</Text><Text style={s.fieldVal}>{formatBulletedField(c.approach)}</Text></View>
            ) : null}
            <View style={s.fieldRow}><Text style={s.fieldKey}>Procedure</Text><Text style={s.fieldVal}>{formatBulletedField(c.procedure) || '—'}</Text></View>

            <Text style={s.metaRow}>
              {(PROC_MAP[c.procedureType ?? ''] ?? '—')} · {(ROLE_MAP[c.role ?? ''] ?? '—')} · {(OPTIME_MAP[c.opTime ?? ''] ?? '—')}
            </Text>
          </View>
        );
      })}

      <View style={s.footer} fixed render={pdfFooter} />
    </Page>
  );
}

export default function LogbookPdf({
  fellowName,
  institution,
  yearLabel,
  rangeLabel,
  cases,
  regionMap,
  pediatricMap,
  procClusters,
}: LogbookPdfProps) {
  const runHeaderName = institution ? `${fellowName}, ${institution}` : fellowName;
  return (
    <Document title={`TOTS Logbook — ${fellowName}`} author={fellowName}>
      <SummaryPage
        headingName={fellowName}
        institution={institution}
        yearLabel={yearLabel}
        rangeLabel={rangeLabel}
        cases={cases}
        regionMap={regionMap}
        pediatricMap={pediatricMap}
        procClusters={procClusters}
      />
      <ContentPage runHeaderName={runHeaderName} cases={cases} />
    </Document>
  );
}
