import { createElement, type ReactElement } from 'react';
import { pdf, type DocumentProps } from '@react-pdf/renderer';
import LogbookPdf, { type LogbookPdfProps } from './LogbookPdf';
import StaffLogbookPdf, { type StaffLogbookPdfProps } from './StaffLogbookPdf';
import { registerPdfFonts } from './fonts';

/** Renders the logbook document to a PDF Blob, on-device. */
export async function generateLogbookBlob(props: LogbookPdfProps): Promise<Blob> {
  registerPdfFonts();
  // LogbookPdf returns a <Document>; pdf() types the root as a Document element,
  // so present the wrapper element as one.
  const element = createElement(LogbookPdf, props) as unknown as ReactElement<DocumentProps>;
  return await pdf(element).toBlob();
}

/** Same idea as generateLogbookBlob, for the staff "by fellow" export. */
export async function generateStaffLogbookBlob(props: StaffLogbookPdfProps): Promise<Blob> {
  registerPdfFonts();
  const element = createElement(StaffLogbookPdf, props) as unknown as ReactElement<DocumentProps>;
  return await pdf(element).toBlob();
}

export type DeliveryResult = 'shared' | 'downloaded';

/** Hands the PDF to the user. Prefers the native share sheet (Save to Files /
 *  send into a LINE chat); otherwise triggers a same-context anchor download.
 *
 *  Deliberately does NOT hand the file off via liff.openWindow: that opens a
 *  separate browser context (e.g. Safari on iOS), and neither blob: nor
 *  data: URLs survive that handoff — blob: URLs only resolve in the document
 *  that created them (confirmed: cross-context load fails with
 *  net::ERR_FILE_NOT_FOUND), and data: URLs are blocked outright for
 *  top-level/new-window navigation by Chromium's and WebKit's anti-phishing
 *  policy. Both failed silently with no error to surface. An anchor download
 *  never navigates anywhere, so it never crosses that boundary. */
export async function deliverPdf(blob: Blob, filename: string): Promise<DeliveryResult> {
  const file = new File([blob], filename, { type: 'application/pdf' });
  const nav = navigator as Navigator & { canShare?: (data: unknown) => boolean };

  if (typeof navigator.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    } catch (err) {
      // User dismissed the sheet — treat as done, don't fall back.
      if (err instanceof Error && err.name === 'AbortError') return 'shared';
      // Any other share failure falls through to the download below.
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'downloaded';
}
