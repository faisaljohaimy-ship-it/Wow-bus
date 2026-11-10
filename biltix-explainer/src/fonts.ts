/**
 * Local fonts from @fontsource (bundled by Remotion's webpack; no network).
 * `waitForFonts()` blocks rendering until every face used in the video is
 * decoded, so no frame is ever captured with a fallback font.
 */
import '@fontsource/ibm-plex-sans-arabic/400.css';
import '@fontsource/ibm-plex-sans-arabic/500.css';
import '@fontsource/ibm-plex-sans-arabic/600.css';
import '@fontsource/ibm-plex-sans-arabic/700.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import { cancelRender, continueRender, delayRender } from 'remotion';

const FACES: Array<[string, number, string]> = [];
for (const w of [400, 500, 600, 700]) {
  FACES.push(['IBM Plex Sans Arabic', w, 'بلتكس إغلاق موثّق 0123456789']);
  FACES.push(['IBM Plex Sans', w, 'BILTIX Risk AI 0123456789']);
}
for (const w of [400, 500, 600]) FACES.push(['IBM Plex Mono', w, 'AIR-1020 MT-0214 0123456789']);

let started = false;
export function waitForFonts(): void {
  if (started || typeof document === 'undefined') return;
  started = true;
  const handle = delayRender('Loading IBM Plex fonts', { timeoutInMilliseconds: 60000 });
  Promise.all(FACES.map(([family, weight, sample]) => document.fonts.load(`${weight} 32px "${family}"`, sample)))
    .then((sets) => {
      const missing = FACES.filter((_, i) => sets[i].length === 0).map(([f, w]) => `${f} ${w}`);
      if (missing.length) throw new Error(`Font faces not loaded: ${missing.join(', ')}`);
      continueRender(handle);
    })
    // Fail loudly instead of rendering with a fallback font.
    .catch((err) => cancelRender(err));
}
