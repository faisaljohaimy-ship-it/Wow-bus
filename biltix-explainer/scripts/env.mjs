/**
 * Shared environment for the Node render scripts (the CLI reads remotion.config.ts).
 * - browserExecutable: preinstalled Chromium (Google storage is blocked in the sandbox)
 * - ffmpegBin / ffprobeBin: the binaries shipped in Remotion's compositor package
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const CANDIDATES = [
  process.env.REMOTION_BROWSER,
  '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell',
  '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome',
].filter(Boolean);

export const browserExecutable = CANDIDATES.find((p) => existsSync(p)) || null;
export const chromeMode = browserExecutable && !browserExecutable.includes('headless') ? 'chrome-for-testing' : 'headless-shell';

const require = createRequire(import.meta.url);
const compositorDir = (() => {
  for (const pkg of ['@remotion/compositor-linux-x64-gnu', '@remotion/compositor-linux-x64-musl', '@remotion/compositor-darwin-arm64', '@remotion/compositor-darwin-x64', '@remotion/compositor-linux-arm64-gnu']) {
    try {
      return dirname(require.resolve(`${pkg}/package.json`));
    } catch {
      /* not installed for this platform */
    }
  }
  return null;
})();

export const ffmpegBin = compositorDir ? join(compositorDir, 'ffmpeg') : 'ffmpeg';
export const ffprobeBin = compositorDir ? join(compositorDir, 'ffprobe') : 'ffprobe';
// The compositor's ffmpeg links its own libav* shared objects next to the binary.
if (compositorDir) process.env.LD_LIBRARY_PATH = [compositorDir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
