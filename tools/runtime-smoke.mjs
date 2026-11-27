import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const port = "4187";
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [".output/server/index.mjs"], {
  env: { ...process.env, HOST: "127.0.0.1", PORT: port },
  stdio: ["ignore", "pipe", "pipe"],
});
let startupError;
server.on("error", (error) => { startupError = error; });
const exited = new Promise((resolve) => server.once("exit", resolve));

try {
  let response;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (startupError) throw startupError;
    assert.equal(server.exitCode, null, "Production server exited during startup");
    try {
      response = await fetch(origin, { signal: AbortSignal.timeout(1000) });
      break;
    } catch {
      await delay(100);
    }
  }
  assert.ok(response, "Production server did not start within 15 seconds");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Saudi Energy Transportation/);
  assert.match(html, /The application shell is up and running/);
  assert.doesNotMatch(html, /id="bookingForm"/);
  console.log("PASS React SSR identity, without the static booking template");

  const stylesheet = html.match(/href="([^" ]+\.css)"/);
  assert.ok(stylesheet, "SSR response must include its compiled stylesheet");
  const css = await fetch(new URL(stylesheet[1], origin));
  assert.equal(css.status, 200);
  assert.match(css.headers.get("content-type"), /text\/css/);
  assert.ok((await css.text()).length > 1000);
  console.log("PASS Compiled CSS is served as CSS");

  const manifestResponse = await fetch(`${origin}/manifest.webmanifest`);
  assert.equal(manifestResponse.status, 200);
  const manifest = await manifestResponse.json();
  for (const icon of manifest.icons) {
    const asset = await fetch(new URL(icon.src, origin));
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get("content-type"), /image\/svg\+xml/);
  }
  console.log("PASS Manifest and its declared icons exist");

  const missing = await fetch(`${origin}/__runtime_missing_route__`);
  assert.equal(missing.status, 404);
  assert.match(await missing.text(), /Page not found/);
  console.log("PASS Unknown route returns the application 404");
} finally {
  if (server.exitCode === null) server.kill("SIGTERM");
  await Promise.race([exited, delay(2000)]);
}
