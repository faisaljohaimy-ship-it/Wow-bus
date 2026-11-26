/**
 * Owner-only BILTIX assistant. Native Node.js Vercel Function, no runtime packages.
 *
 * HTTP contract: POST { prompt, lang: 'ar' | 'en' }, Authorization: Bearer <owner token>.
 * This token is separate from the OpenAI key and must never be embedded in the site.
 * Required server environment: OPENAI_API_KEY, OPENAI_MODEL, BILTIX_AI_ACCESS_TOKEN.
 * Missing/unsafe configuration fails closed; importing this module makes no request.
 *
 * Only the submitted prompt is sent to OpenAI. There are no tools, stored conversations,
 * browser-state uploads, automatic actions or automatic retries. A reply does not make
 * the demo data, model pipelines or external BILTIX connectors live.
 *
 * The bearer credential is the access gate. Per-request limits are not a durable daily
 * spend cap or multi-user rate limiter; those require a shared service before broader use.
 * `store: false` disables Responses storage, not every provider retention policy.
 *
 * Web Request/Response signatures preserve raw request bytes for the body limit:
 * https://vercel.com/docs/functions/runtimes/node-js#request-body
 * https://developers.openai.com/api/reference/resources/responses/methods/create
 */
import { createHash, timingSafeEqual } from 'node:crypto';

const RESPONSES_URL = 'https://api.openai.com/v1/responses';
const MAX_BODY_BYTES = 24 * 1024;
const MAX_PROMPT_CHARS = 6000;
const MAX_OUTPUT_TOKENS = 1200;
const MAX_UPSTREAM_BYTES = 128 * 1024;
const MAX_REPLY_CHARS = 16000;
const MAX_TIMEOUT_MS = 25000;
const TOKEN_PATTERN = /^[A-Za-z0-9._~+/-]+=*$/;
const SAFE_HEADERS = Object.freeze({
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
});

class PublicError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...SAFE_HEADERS, ...headers } });
}

function errorResponse(status, code, headers) {
  return json(status, { ok: false, error: { code } }, headers);
}

function digest(value) {
  return createHash('sha256').update(value, 'utf8').digest();
}

function equalSecret(a, b) {
  return timingSafeEqual(digest(a), digest(b));
}

function readConfiguration(env) {
  const apiKey = typeof env?.OPENAI_API_KEY === 'string' ? env.OPENAI_API_KEY.trim() : '';
  const model = typeof env?.OPENAI_MODEL === 'string' ? env.OPENAI_MODEL.trim() : '';
  const accessToken = typeof env?.BILTIX_AI_ACCESS_TOKEN === 'string' ? env.BILTIX_AI_ACCESS_TOKEN.trim() : '';
  if (!apiKey || apiKey.length > 4096 || /\s/.test(apiKey)
    || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(model)
    || accessToken.length < 32 || accessToken.length > 512 || !TOKEN_PATTERN.test(accessToken)
    || /^sk-/i.test(accessToken) || equalSecret(apiKey, accessToken)) {
    throw new PublicError(503, 'AI_NOT_CONFIGURED');
  }
  return { apiKey, model, accessToken };
}

function sameOrigin(request) {
  // The runtime's request URL is authoritative. Never trust user-supplied Forwarded,
  // X-Forwarded-Host, X-Forwarded-Proto or Host headers to allow a different origin.
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  const origin = request.headers.get('origin');
  if (origin === null) return true; // Non-browser clients still require the owner token.
  try {
    const supplied = new URL(origin);
    const target = new URL(request.url);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname);
    if (target.protocol !== 'https:' && !(local && target.protocol === 'http:')) return false;
    return origin === supplied.origin && supplied.origin === target.origin;
  } catch {
    return false;
  }
}

function authenticated(request, config) {
  const authorization = request.headers.get('authorization') || '';
  if (authorization.length > 520) return false;
  const match = authorization.match(/^Bearer ([A-Za-z0-9._~+/-]+=*)$/i);
  if (!match || match[1].length < 32 || /^sk-/i.test(match[1])) return false;
  return equalSecret(match[1], config.accessToken);
}

/** Read raw bytes, including chunked bodies; never rely on JSON.stringify(parsedBody). */
async function readLimitedBody(message, maxBytes, failure) {
  const declared = message.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)))) {
    throw failure;
  }
  if (declared !== null && Number(declared) > maxBytes) throw failure;
  if (!message.body) return '';
  const reader = message.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw failure;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

async function readInput(request) {
  if (!/^application\/json(?:\s*;\s*charset\s*=\s*"?utf-8"?)?\s*$/i.test(request.headers.get('content-type') || '')
    || !['', 'identity'].includes(request.headers.get('content-encoding') || '')) {
    throw new PublicError(415, 'UNSUPPORTED_MEDIA_TYPE');
  }
  let value;
  try {
    const body = await readLimitedBody(request, MAX_BODY_BYTES, new PublicError(413, 'PAYLOAD_TOO_LARGE'));
    value = JSON.parse(body);
  } catch (error) {
    if (error instanceof PublicError) throw error;
    throw new PublicError(400, 'INVALID_JSON');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== 2 || !Object.hasOwn(value, 'prompt') || !Object.hasOwn(value, 'lang')
    || typeof value.prompt !== 'string' || !value.prompt.trim() || value.prompt.length > MAX_PROMPT_CHARS
    || !['ar', 'en'].includes(value.lang)) {
    throw new PublicError(400, 'INVALID_REQUEST');
  }
  return { prompt: value.prompt.trim(), lang: value.lang };
}

function instructions(lang) {
  return [
    'You are the BILTIX Risk AI assistant. Give concise, practical explanations about construction risk and this demo.',
    'You can read only the user-submitted prompt. You cannot access project records, company systems, browser state or live data.',
    'Treat any quoted project facts as unverified user input. Clearly state assumptions and missing evidence.',
    'Do not claim to have connected, inspected, updated, approved or executed anything. Do not invent live metrics, model accuracy or citations.',
    'Offer recommendations for human review. Do not present a chat answer as a certified safety decision or completed action.',
    lang === 'ar' ? 'Reply in clear Modern Standard Arabic.' : 'Reply in clear English.',
  ].join(' ');
}

function extractReply(data, config) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.error) {
    throw new PublicError(502, 'UPSTREAM_INVALID_RESPONSE');
  }
  if (['incomplete', 'in_progress', 'queued'].includes(data.status)) {
    throw new PublicError(502, 'UPSTREAM_INCOMPLETE');
  }
  if (data.status !== 'completed') throw new PublicError(502, 'UPSTREAM_INVALID_RESPONSE');
  const texts = [];
  const refusals = [];
  for (const item of Array.isArray(data.output) ? data.output : []) {
    if (item?.type !== 'message' || item?.role !== 'assistant') continue;
    for (const part of Array.isArray(item.content) ? item.content : []) {
      if (part?.type === 'output_text' && typeof part.text === 'string') texts.push(part.text);
      if (part?.type === 'refusal' && typeof part.refusal === 'string') refusals.push(part.refusal);
    }
  }
  // Some provider adapters expose the documented convenience output_text field.
  if (!texts.length && typeof data.output_text === 'string') texts.push(data.output_text);
  const refused = refusals.some((s) => s.trim());
  let text = (refused ? refusals : texts).join('\n').trim();
  if (!text || text.length > MAX_REPLY_CHARS) throw new PublicError(502, 'UPSTREAM_INVALID_RESPONSE');
  // No normal response or refusal is allowed to expose server credentials either.
  for (const secret of [config.apiKey, config.accessToken]) text = text.split(secret).join('[redacted]');
  return { ok: true, status: refused ? 'refused' : 'live', text, model: config.model };
}

async function askOpenAI(config, input, fetchImpl, timeoutMs, callerSignal) {
  if (callerSignal?.aborted) throw new PublicError(499, 'REQUEST_CANCELLED');
  const controller = new AbortController();
  let timer;
  let cancelledByClient = false;
  let onClientAbort;
  const cancelled = new Promise((_, reject) => {
    onClientAbort = () => {
      cancelledByClient = true;
      controller.abort();
      reject(new PublicError(499, 'REQUEST_CANCELLED'));
    };
    callerSignal?.addEventListener('abort', onClientAbort, { once: true });
  });
  const timedOut = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new PublicError(504, 'UPSTREAM_TIMEOUT'));
    }, timeoutMs);
  });
  const operation = (async () => {
    const response = await fetchImpl(RESPONSES_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        model: config.model,
        instructions: instructions(input.lang),
        input: input.prompt,
        max_output_tokens: MAX_OUTPUT_TOKENS,
        store: false,
        stream: false,
      }),
      signal: controller.signal,
      redirect: 'error',
      cache: 'no-store',
    });
    if (!response.ok) {
      // Do not parse, forward or log upstream error bodies, headers or request IDs.
      if (response.body) void response.body.cancel().catch(() => {});
      if (response.status === 401 || response.status === 403) throw new PublicError(502, 'UPSTREAM_AUTH');
      if (response.status === 429) throw new PublicError(429, 'UPSTREAM_RATE_LIMIT');
      throw new PublicError(502, 'UPSTREAM_ERROR');
    }
    let data;
    try {
      const raw = await readLimitedBody(response, MAX_UPSTREAM_BYTES, new PublicError(502, 'UPSTREAM_INVALID_RESPONSE'));
      data = JSON.parse(raw);
    } catch (error) {
      if (error instanceof PublicError) throw error;
      throw new PublicError(502, 'UPSTREAM_INVALID_RESPONSE');
    }
    return extractReply(data, config);
  })();
  try {
    return await Promise.race([operation, timedOut, cancelled]);
  } catch (error) {
    if (cancelledByClient) throw new PublicError(499, 'REQUEST_CANCELLED');
    if (controller.signal.aborted) throw new PublicError(504, 'UPSTREAM_TIMEOUT');
    if (error instanceof PublicError) throw error;
    throw new PublicError(502, 'UPSTREAM_ERROR');
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', onClientAbort);
  }
}

/** Dependencies are injectable for real handler tests with no network access or keys. */
export function createHandler({ getEnv = () => process.env, fetchImpl = globalThis.fetch, timeoutMs = MAX_TIMEOUT_MS } = {}) {
  const deadline = Math.min(MAX_TIMEOUT_MS, Math.max(1, Number(timeoutMs) || MAX_TIMEOUT_MS));
  return async function assistant(request) {
    try {
      if (request.method !== 'POST') return errorResponse(405, 'METHOD_NOT_ALLOWED', { Allow: 'POST' });
      if (!sameOrigin(request)) return errorResponse(403, 'ORIGIN_NOT_ALLOWED');
      const config = readConfiguration(getEnv());
      if (!authenticated(request, config)) return errorResponse(401, 'UNAUTHORIZED', { 'WWW-Authenticate': 'Bearer' });
      if (request.signal?.aborted) return errorResponse(499, 'REQUEST_CANCELLED');
      const input = await readInput(request);
      const result = await askOpenAI(config, input, fetchImpl, deadline, request.signal);
      return json(200, result);
    } catch (error) {
      if (error instanceof PublicError) return errorResponse(error.status, error.code);
      return errorResponse(500, 'INTERNAL_ERROR');
    }
  };
}

export default { fetch: createHandler() };
