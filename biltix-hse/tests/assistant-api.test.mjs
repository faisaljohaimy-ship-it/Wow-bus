/** Handler acceptance tests. All credentials are inert fixtures; every upstream call is mocked. */
import assert from 'node:assert/strict';
import { createHandler } from '../api/assistant.mjs';

const TOKEN = 'fixture_owner_access_token_0123456789abcdef';
const KEY = 'sk-fixture-only-does-not-authenticate-0123456789';
const ORIGIN = 'https://biltix-risk-ai.vercel.app';
const ENV = Object.freeze({ OPENAI_API_KEY: KEY, OPENAI_MODEL: 'fixture-model', BILTIX_AI_ACCESS_TOKEN: TOKEN });
const DEFAULT_INPUT = Object.freeze({ prompt: 'Explain this risk assumption.', lang: 'en' });

function request({ body = DEFAULT_INPUT, raw, method = 'POST', headers = {}, origin = ORIGIN, url = `${ORIGIN}/api/assistant`, signal } = {}) {
  const allHeaders = { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}`, ...headers };
  if (origin !== null) allHeaders.origin = origin;
  const options = { method, headers: allHeaders, signal };
  if (!['GET', 'HEAD'].includes(method)) {
    options.body = raw !== undefined ? raw : JSON.stringify(body);
    if (options.body instanceof ReadableStream) options.duplex = 'half';
  }
  return new Request(url, options);
}

function success(text = 'The assumption needs evidence.') {
  return Response.json({
    status: 'completed',
    output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }],
  });
}

function setup({ env = ENV, fetch, timeoutMs } = {}) {
  const calls = [];
  const handler = createHandler({
    getEnv: () => env,
    timeoutMs,
    fetchImpl: async (...args) => {
      calls.push(args);
      return fetch ? fetch(...args) : success();
    },
  });
  return { handler, calls };
}

async function result(handler, req = request()) {
  const response = await handler(req);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('cdn-cache-control'), 'no-store');
  assert.equal(response.headers.get('vercel-cdn-cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  return { response, body: await response.json() };
}

async function failure(handler, req, status, code) {
  const found = await result(handler, req);
  assert.equal(found.response.status, status);
  assert.deepEqual(found.body, { ok: false, error: { code } });
  return found;
}

export const tests = [
  { name: 'assistant only allows POST and does not make upstream calls on other methods', async fn() {
    const { handler, calls } = setup();
    for (const method of ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']) {
      const { response } = await failure(handler, request({ method }), 405, 'METHOD_NOT_ALLOWED');
      assert.equal(response.headers.get('allow'), 'POST');
    }
    assert.equal(calls.length, 0);
  } },
  { name: 'assistant fails closed when any required server configuration is missing or unsafe', async fn() {
    const envs = [
      {}, { ...ENV, OPENAI_API_KEY: '' }, { ...ENV, OPENAI_MODEL: '' }, { ...ENV, BILTIX_AI_ACCESS_TOKEN: '' },
      { ...ENV, BILTIX_AI_ACCESS_TOKEN: 'too-short' }, { ...ENV, BILTIX_AI_ACCESS_TOKEN: KEY },
      { ...ENV, BILTIX_AI_ACCESS_TOKEN: `sk-${TOKEN}` }, { ...ENV, OPENAI_MODEL: 'bad\nmodel' },
      { ...ENV, BILTIX_AI_ACCESS_TOKEN: `${TOKEN} illegal-space` },
    ];
    for (const env of envs) {
      const { handler, calls } = setup({ env });
      await failure(handler, request(), 503, 'AI_NOT_CONFIGURED');
      assert.equal(calls.length, 0);
    }
  } },
  { name: 'assistant owner authentication rejects absent, wrong, duplicated and OpenAI-key credentials', async fn() {
    const { handler, calls } = setup();
    for (const authorization of ['', `Bearer ${TOKEN}wrong`, `Basic ${TOKEN}`, `Bearer ${KEY}`, `Bearer ${TOKEN}, Bearer ${TOKEN}`]) {
      await failure(handler, request({ headers: { authorization } }), 401, 'UNAUTHORIZED');
    }
    assert.equal(calls.length, 0);
  } },
  { name: 'assistant rejects cross-origin, null and malformed origins and ignores forged forwarded host', async fn() {
    const { handler, calls } = setup();
    for (const origin of ['https://evil.example', 'https://biltix-risk-ai.vercel.app.evil.example', 'null', `${ORIGIN}/path`, `${ORIGIN}/`, 'http://biltix-risk-ai.vercel.app', `${ORIGIN}, https://evil.example`]) {
      await failure(handler, request({ origin, headers: { 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https', host: 'evil.example' } }), 403, 'ORIGIN_NOT_ALLOWED');
    }
    await failure(handler, request({ origin: null, headers: { 'sec-fetch-site': 'cross-site' } }), 403, 'ORIGIN_NOT_ALLOWED');
    assert.equal(calls.length, 0);
  } },
  { name: 'assistant permits same-origin and authenticated non-browser callers without trusting Host overrides', async fn() {
    const { handler, calls } = setup();
    for (const req of [request(), request({ origin: null }), request({ headers: { host: 'evil.example', 'x-forwarded-host': 'evil.example' } }), request({ url: 'http://localhost:8080/api/assistant', origin: 'http://localhost:8080' })]) {
      const { response } = await result(handler, req);
      assert.equal(response.status, 200);
    }
    assert.equal(calls.length, 4);
  } },
  { name: 'assistant rejects non-JSON content types and compressed bodies before upstream use', async fn() {
    const { handler, calls } = setup();
    for (const headers of [{ 'content-type': 'text/plain' }, { 'content-type': 'application/x-www-form-urlencoded' }, { 'content-type': 'application/json; charset=utf-16' }, { 'content-encoding': 'gzip' }]) {
      await failure(handler, request({ headers }), 415, 'UNSUPPORTED_MEDIA_TYPE');
    }
    assert.equal(calls.length, 0);
  } },
  { name: 'assistant enforces the exact prompt/language schema and rejects caller-controlled model or tools', async fn() {
    const { handler, calls } = setup();
    const bodies = [null, [], {}, 'plain string', { prompt: 'x' }, { lang: 'en' }, { prompt: '', lang: 'ar' }, { prompt: '   ', lang: 'ar' }, { prompt: 12, lang: 'ar' }, { prompt: 'x', lang: 'fr' }, { ...DEFAULT_INPUT, model: 'other-model' }, { ...DEFAULT_INPUT, tools: [] }, { ...DEFAULT_INPUT, state: {} }, { prompt: 'x'.repeat(6001), lang: 'en' }];
    for (const body of bodies) await failure(handler, request({ body }), 400, 'INVALID_REQUEST');
    for (const raw of ['{', '', new Uint8Array([0xc3, 0x28])]) await failure(handler, request({ raw }), 400, 'INVALID_JSON');
    assert.equal(calls.length, 0);
  } },
  { name: 'assistant caps raw bytes even for whitespace, false content length and chunked bodies', async fn() {
    const { handler, calls } = setup();
    await failure(handler, request({ headers: { 'content-length': '24577' } }), 413, 'PAYLOAD_TOO_LARGE');
    const large = `${' '.repeat(24576)}${JSON.stringify(DEFAULT_INPUT)}`;
    await failure(handler, request({ raw: large, headers: { 'content-length': '1' } }), 413, 'PAYLOAD_TOO_LARGE');
    let cancelled = false;
    const stream = new ReadableStream({
      start(c) { c.enqueue(new Uint8Array(14000)); c.enqueue(new Uint8Array(14000)); },
      cancel() { cancelled = true; },
    });
    await failure(handler, request({ raw: stream }), 413, 'PAYLOAD_TOO_LARGE');
    assert.equal(cancelled, true);
    assert.equal(calls.length, 0);
  } },
  { name: 'assistant requests only the configured model with capped output, storage disabled and no tools or redirects', async fn() {
    const { handler, calls } = setup();
    const { response, body } = await result(handler, request({ body: { prompt: '  فسّر هذا الافتراض.  ', lang: 'ar' } }));
    assert.equal(response.status, 200);
    assert.deepEqual(body, { ok: true, status: 'live', text: 'The assumption needs evidence.', model: ENV.OPENAI_MODEL });
    assert.equal(calls.length, 1);
    const [url, options] = calls[0];
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, `Bearer ${KEY}`);
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    const sent = JSON.parse(options.body);
    assert.deepEqual(Object.keys(sent).sort(), ['input', 'instructions', 'max_output_tokens', 'model', 'store', 'stream']);
    assert.equal(sent.input, 'فسّر هذا الافتراض.');
    assert.equal(sent.model, ENV.OPENAI_MODEL);
    assert.equal(sent.max_output_tokens, 1200);
    assert.equal(sent.store, false);
    assert.equal(sent.stream, false);
    assert.match(sent.instructions, /Modern Standard Arabic/);
    assert.equal(options.body.includes(TOKEN), false);
    assert.equal(options.body.includes(KEY), false);
  } },
  { name: 'assistant supports the prompt limit and English instruction without sending browser state', async fn() {
    const { handler, calls } = setup();
    const { response } = await result(handler, request({ body: { prompt: 'x'.repeat(6000), lang: 'en' } }));
    assert.equal(response.status, 200);
    const sent = JSON.parse(calls[0][1].body);
    assert.equal(sent.input.length, 6000);
    assert.match(sent.instructions, /Reply in clear English/);
    assert.match(sent.instructions, /cannot access project records/);
  } },
  { name: 'assistant returns model refusals distinctly from a successful answer', async fn() {
    const { handler } = setup({ fetch: () => Response.json({ status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'refusal', refusal: 'I cannot help with that request.' }] }] }) });
    const { response, body } = await result(handler);
    assert.equal(response.status, 200);
    assert.deepEqual(body, { ok: true, status: 'refused', text: 'I cannot help with that request.', model: ENV.OPENAI_MODEL });
  } },
  { name: 'assistant maps upstream auth, quota and server failures without forwarding sensitive errors or retrying', async fn() {
    for (const [upstream, status, code] of [[401, 502, 'UPSTREAM_AUTH'], [403, 502, 'UPSTREAM_AUTH'], [429, 429, 'UPSTREAM_RATE_LIMIT'], [400, 502, 'UPSTREAM_ERROR'], [500, 502, 'UPSTREAM_ERROR'], [503, 502, 'UPSTREAM_ERROR']]) {
      const { handler, calls } = setup({ fetch: () => new Response(`private upstream details ${KEY} ${TOKEN}`, { status: upstream, headers: { 'x-request-id': KEY } }) });
      const { response } = await failure(handler, request(), status, code);
      assert.equal(response.headers.get('x-request-id'), null);
      assert.equal(calls.length, 1);
    }
  } },
  { name: 'assistant aborts a slow request and returns a safe timeout even when a mock ignores cancellation', async fn() {
    let signal;
    const { handler, calls } = setup({ timeoutMs: 10, fetch: (_url, options) => { signal = options.signal; return new Promise(() => {}); } });
    await failure(handler, request(), 504, 'UPSTREAM_TIMEOUT');
    assert.equal(signal.aborted, true);
    assert.equal(calls.length, 1);
  } },
  { name: 'assistant deadline also covers an upstream response body that never finishes', async fn() {
    let signal;
    const { handler } = setup({ timeoutMs: 10, fetch: (_url, options) => {
      signal = options.signal;
      return new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{')); } }));
    } });
    await failure(handler, request(), 504, 'UPSTREAM_TIMEOUT');
    assert.equal(signal.aborted, true);
  } },
  { name: 'assistant propagates client cancellation and never starts a request already cancelled', async fn() {
    const cancelled = new AbortController();
    cancelled.abort();
    const first = setup();
    await failure(first.handler, request({ signal: cancelled.signal }), 499, 'REQUEST_CANCELLED');
    assert.equal(first.calls.length, 0);
    const active = new AbortController();
    let upstreamSignal;
    const second = setup({ fetch: (_url, options) => {
      upstreamSignal = options.signal;
      active.abort();
      return new Promise(() => {});
    } });
    await failure(second.handler, request({ signal: active.signal }), 499, 'REQUEST_CANCELLED');
    assert.equal(upstreamSignal.aborted, true);
    assert.equal(second.calls.length, 1);
  } },
  { name: 'assistant rejects empty, malformed, incomplete or non-message upstream results without inventing success', async fn() {
    const payloads = [
      {}, { status: 'completed', output: [] }, { status: 'completed', error: { message: KEY } },
      { status: 'completed', output: [{ type: 'reasoning', text: KEY }] },
      { status: 'completed', output: [{ type: 'message', role: 'user', content: [{ type: 'output_text', text: KEY }] }] },
      { status: 'completed', output_text: 'x'.repeat(16001) },
    ];
    for (const payload of payloads) {
      const { handler } = setup({ fetch: () => Response.json(payload) });
      await failure(handler, request(), 502, 'UPSTREAM_INVALID_RESPONSE');
    }
    for (const state of ['incomplete', 'queued', 'in_progress']) {
      const { handler } = setup({ fetch: () => Response.json({ status: state, output_text: 'partial text' }) });
      await failure(handler, request(), 502, 'UPSTREAM_INCOMPLETE');
    }
    const { handler } = setup({ fetch: () => new Response('private non-JSON error') });
    await failure(handler, request(), 502, 'UPSTREAM_INVALID_RESPONSE');
  } },
  { name: 'assistant bounds upstream response bodies and strips credentials from accepted text', async fn() {
    const large = setup({ fetch: () => new Response('x'.repeat(128 * 1024 + 1)) });
    await failure(large.handler, request(), 502, 'UPSTREAM_INVALID_RESPONSE');
    const redacted = setup({ fetch: () => success(`Do not expose ${KEY} or ${TOKEN}`) });
    const { body } = await result(redacted.handler);
    assert.equal(body.text, 'Do not expose [redacted] or [redacted]');
  } },
  { name: 'assistant accepts convenience output_text while ignoring unrelated provider fields', async fn() {
    const { handler } = setup({ fetch: () => Response.json({ status: 'completed', output_text: 'A concise answer.', model: KEY, usage: { private: TOKEN }, id: KEY }) });
    const { body } = await result(handler);
    assert.deepEqual(body, { ok: true, status: 'live', text: 'A concise answer.', model: ENV.OPENAI_MODEL });
  } },
  { name: 'assistant never forwards exception messages or environment configuration details', async fn() {
    const network = setup({ fetch: () => { throw new Error(`network failure with ${KEY} ${TOKEN}`); } });
    await failure(network.handler, request(), 502, 'UPSTREAM_ERROR');
    const internal = createHandler({ getEnv: () => { throw new Error(`private ${KEY}`); }, fetchImpl: () => { throw new Error('unexpected upstream request'); } });
    await failure(internal, request(), 500, 'INTERNAL_ERROR');
  } },
];
