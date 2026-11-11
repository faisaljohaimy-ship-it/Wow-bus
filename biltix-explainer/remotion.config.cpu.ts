/**
 * Film v2 render config (FilmAR / FilmEN): the same settings as remotion.config.ts WITHOUT the SwANGLE GL renderer.
 * The film is 2D only (no WebGL, no CSS 3D), and Chromium's CPU rasteriser renders it about 10x faster than GL emulated
 * by SwiftShader on a machine without a GPU (measured: ~7.8 frames/s against ~0.7 on 4 cores, identical stills).
 *
 *   npx remotion render src/index.ts FilmAR out/film-ar-1080p.mp4 --config=remotion.config.cpu.ts --concurrency=4 \
 *       --image-format=jpeg --jpeg-quality=92 --audio-codec=aac --audio-bitrate=192k
 *   node scripts/film-mix.mjs --video out/film-ar-1080p.mp4 --out out/BILTIX-Film-Arabic.mp4 --lang ar
 */
/**
 * Remotion CLI config (applies to `npx remotion studio|render|still`).
 *
 * Google storage is unreachable from the build sandbox, so Remotion must not
 * download its own Chrome Headless Shell: we point it at a preinstalled
 * Chromium. Override with REMOTION_BROWSER=/path/to/chrome-headless-shell.
 */
import { existsSync } from 'node:fs';
import { Config } from '@remotion/cli/config';

const CANDIDATES = [
  process.env.REMOTION_BROWSER,
  '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell',
  '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',
].filter(Boolean) as string[];

const browser = CANDIDATES.find((p) => existsSync(p));
if (browser) {
  Config.setBrowserExecutable(browser);
  // A full Chrome binary needs the "chrome-for-testing" mode; the headless shell is the default.
  if (!browser.includes('headless')) Config.setChromeMode('chrome-for-testing');
}

Config.setEntryPoint('src/index.ts');
Config.setVideoImageFormat('png'); // lossless frames: no JPEG ringing on the 2–4 % blueprint grid
Config.setCodec('h264');
Config.setPixelFormat('yuv420p');
Config.setCrf(20);
Config.setX264Preset('slow');
Config.setOverwriteOutput(true);
Config.setConcurrency('100%'); // all cores (the CLI default is half)
