import { Fragment } from 'react';
import { Document } from '@react-pdf/renderer';
import { ContentPage, SummaryPage } from './LogbookPdf';
import type { CaseEntry } from '../../types';

export interface FellowGroup {
  fellowName: string;
  /** Already filtered to the range and sorted oldest → newest. */
  cases: CaseEntry[];
}

export interface StaffLogbookPdfProps {
  institution: string;
  yearLabel: string;
  rangeLabel: string;
  /** One summary + content page pair per fellow, in this order. */
  fellows: FellowGroup[];
  /** AI-derived region and pediatric classification, computed once over every
   *  fellow's cases in range and shared across each fellow's summary page —
   *  see classifyRegion.ts. */
  regionMap?: ReadonlyMap<string, string>;
  pediatricMap?: ReadonlyMap<string, boolean>;
}

/** The "by fellow" export: each fellow gets their own summary page followed
 *  immediately by their own content page(s), back to back, then the next
 *  fellow's pair — same page shapes as a single fellow's own export
 *  (SummaryPage/ContentPage are shared, not reimplemented), just repeated
 *  once per fellow instead of rendered once for everyone pooled together. */
export default function StaffLogbookPdf({
  institution,
  yearLabel,
  rangeLabel,
  fellows,
  regionMap,
  pediatricMap,
}: StaffLogbookPdfProps) {
  return (
    <Document title={`TOTS Logbook — ${institution}`} author={institution}>
      {fellows.map(f => (
        <Fragment key={f.fellowName}>
          <SummaryPage
            headingName={f.fellowName}
            institution={institution}
            yearLabel={yearLabel}
            rangeLabel={rangeLabel}
            cases={f.cases}
            regionMap={regionMap}
            pediatricMap={pediatricMap}
          />
          <ContentPage runHeaderName={`${f.fellowName}, ${institution}`} cases={f.cases} />
        </Fragment>
      ))}
    </Document>
  );
}
