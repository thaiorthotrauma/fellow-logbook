import { createElement, type ReactElement } from 'react';
import { pdf, type DocumentProps } from '@react-pdf/renderer';
import LogbookPdf, { type LogbookPdfProps } from './LogbookPdf';
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

export type DeliveryResult = 'shared' | 'opened' | 'downloaded';

/** Hands the PDF to the user. Prefers the native share sheet (Save to Files /
 *  send into a LINE chat), falling back to opening it in the external browser,
 *  then to a plain download. The file never leaves the device unless the user
 *  chooses to share it. */
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
      // Any other share failure falls through to a fallback below.
    }
  }

  const url = URL.createObjectURL(blob);
  const revokeSoon = () => setTimeout(() => URL.revokeObjectURL(url), 60_000);

  try {
    if (liff?.openWindow) {
      liff.openWindow({ url, external: true });
      revokeSoon();
      return 'opened';
    }
  } catch {
    // fall through to anchor download
  }

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  revokeSoon();
  return 'downloaded';
}
