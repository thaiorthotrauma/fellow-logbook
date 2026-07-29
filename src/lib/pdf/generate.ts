import { createElement, type ReactElement } from 'react';
import { pdf, type DocumentProps } from '@react-pdf/renderer';
import LogbookPdf, { type LogbookPdfProps } from './LogbookPdf';
import StaffLogbookPdf, { type StaffLogbookPdfProps } from './StaffLogbookPdf';
import { registerPdfFonts } from './fonts';
import { liff } from '../liff';

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

export type DeliveryResult = 'shared' | 'opened' | 'downloaded';

/** Hands the PDF to the user, in the order that actually works inside LINE's
 *  in-app browser on iOS:
 *
 *  1. The native share sheet (Save to Files / send into a chat). This is the
 *     path that works, but iOS only allows it while the export tap still
 *     counts as transient user activation — hence clusterCache prefetching
 *     the DeepSeek round-trips instead of awaiting them inside the click.
 *  2. liff.openWindow, which at least renders the PDF for the user to save.
 *  3. An anchor download — last resort only: iOS WKWebView ignores the
 *     `download` attribute, so this silently no-ops there (it is kept for
 *     desktop/Android, where it does work). */
export async function deliverPdf(blob: Blob, filename: string): Promise<DeliveryResult> {
  const file = new File([blob], filename, { type: 'application/pdf' });
  const nav = navigator as Navigator & { canShare?: (data: unknown) => boolean };
  const canShareFiles = typeof navigator.share === 'function' && nav.canShare?.({ files: [file] });
  console.log(`[pdf] delivering ${filename} (${blob.size} bytes), canShareFiles=${canShareFiles}`);

  if (canShareFiles) {
    try {
      await navigator.share({ files: [file], title: filename });
      console.log('[pdf] delivered via share sheet');
      return 'shared';
    } catch (err) {
      // User dismissed the sheet — treat as done, don't fall back.
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('[pdf] share sheet dismissed by user');
        return 'shared';
      }
      // Most likely NotAllowedError: the user activation from the tap expired
      // while the PDF was being built. Logged so the cause is visible.
      console.error('[pdf] share failed, falling back:', err);
    }
  }

  const url = URL.createObjectURL(blob);
  const revokeSoon = () => setTimeout(() => URL.revokeObjectURL(url), 60_000);

  try {
    if (liff?.openWindow) {
      console.log('[pdf] falling back to liff.openWindow');
      liff.openWindow({ url, external: true });
      revokeSoon();
      return 'opened';
    }
  } catch (err) {
    console.error('[pdf] liff.openWindow failed:', err);
  }

  console.log('[pdf] falling back to anchor download (no-op on iOS WKWebView)');
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  revokeSoon();
  return 'downloaded';
}
