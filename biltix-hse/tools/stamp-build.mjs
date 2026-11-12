#!/usr/bin/env node
// Stamp index.html with a new build id before a publish: <meta name="biltix-build" content="<version>+<UTC yyyymmddHHMM>">.
// Open pages compare it with the published index.html and offer a reload (js/app.js watchForNewBuild).
// Usage: node tools/stamp-build.mjs [version]   (default: the APP_VERSION in js/app.js)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const app = readFileSync(`${root}js/app.js`, 'utf8');
const version = process.argv[2] || (app.match(/const APP_VERSION = '([^']+)'/) || [])[1] || '0.0.0';
const d = new Date();
const p = (n) => String(n).padStart(2, '0');
const stamp = `${version}+${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
const file = `${root}index.html`;
const html = readFileSync(file, 'utf8');
if (!/<meta name="biltix-build" content="[^"]*">/.test(html)) { console.error('index.html has no biltix-build meta'); process.exit(1); }
writeFileSync(file, html.replace(/<meta name="biltix-build" content="[^"]*">/, `<meta name="biltix-build" content="${stamp}">`));
console.log(stamp);
