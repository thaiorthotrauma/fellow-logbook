import { Font } from '@react-pdf/renderer';
import regular from '../../assets/fonts/IBMPlexSansThai-Regular.ttf';
import semibold from '../../assets/fonts/IBMPlexSansThai-SemiBold.ttf';
import bold from '../../assets/fonts/IBMPlexSansThai-Bold.ttf';

export const PDF_FONT = 'IBM Plex Sans Thai';

let registered = false;

/** Registers the bundled IBM Plex Sans Thai TTFs with react-pdf. This face
 *  covers both Thai (fellow name/institution) and Latin, so one family renders
 *  the whole document. Idempotent; the TTFs are self-hosted assets (no CDN). */
export function registerPdfFonts(): void {
  if (registered) return;
  Font.register({
    family: PDF_FONT,
    fonts: [
      { src: regular, fontWeight: 400 },
      { src: semibold, fontWeight: 600 },
      { src: bold, fontWeight: 700 },
    ],
  });
  // Thai has no inter-word spaces and clinical terms shouldn't hyphenate —
  // return the word unbroken so react-pdf never inserts a hyphen mid-word.
  Font.registerHyphenationCallback(word => [word]);
  registered = true;
}
