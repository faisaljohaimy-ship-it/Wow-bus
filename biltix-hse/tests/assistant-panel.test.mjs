/** Browser request boundary: no live API calls, credentials persisted nowhere. */
import assert from 'node:assert/strict';
import { requestAssistant } from '../js/ui/gpt-assistant.js';
import dict from '../js/i18n/assistant.js';

const token = 'owner-access-token-for-offline-unit-test';
const base = { token, prompt: 'Review a delivery risk.', lang: 'en' };
const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const rejectsCode = (promise, code) => assert.rejects(promise, (error) => error.code === code && error.message === code);

export const tests = [
  {
    name: 'only the typed prompt and selected language are sent to the same-origin API; token stays in authorization',
    async fn() {
      let seen;
      const controller = new AbortController();
      const result = await requestAssistant({ ...base, prompt: '  Explain this risk.  ', signal: controller.signal, ignoredProjectData: { secret: 'not sent' } }, {
        fetchImpl: async (...args) => {
          seen = args;
          return response({ ok: true, status: 'live', text: 'Consider the lead time.', model: 'configured-model' });
        },
      });
      assert.equal(seen[0], '/api/assistant');
      const options = seen[1];
      assert.equal(options.method, 'POST');
      assert.equal(options.headers.Authorization, `Bearer ${token}`);
      assert.deepEqual(JSON.parse(options.body), { prompt: 'Explain this risk.', lang: 'en' });
      assert.equal(options.credentials, 'omit');
      assert.equal(options.cache, 'no-store');
      assert.equal(options.redirect, 'error');
      assert.equal(options.referrerPolicy, 'no-referrer');
      assert.equal(options.signal, controller.signal);
      assert.deepEqual(result, { text: 'Consider the lead time.', status: 'live', model: 'configured-model' });
      assert.equal(JSON.stringify(result).includes(token), false);
    },
  },
  {
    name: 'rejects API keys, missing owner access, empty or oversized prompts before issuing a request',
    async fn() {
      let calls = 0;
      const options = { fetchImpl: async () => { calls += 1; throw new Error('must not fetch'); } };
      await rejectsCode(requestAssistant({ ...base, token: '' }, options), 'TOKEN_REQUIRED');
      await rejectsCode(requestAssistant({ ...base, token: 'sk-test-value-must-never-leave-browser' }, options), 'OPENAI_KEY_NOT_ALLOWED');
      await rejectsCode(requestAssistant({ ...base, token: 'short' }, options), 'UNAUTHORIZED');
      await rejectsCode(requestAssistant({ ...base, token: `${token}\ninjected` }, options), 'UNAUTHORIZED');
      await rejectsCode(requestAssistant({ ...base, prompt: ' ' }, options), 'PROMPT_REQUIRED');
      await rejectsCode(requestAssistant({ ...base, prompt: 'x'.repeat(6001) }, options), 'INVALID_REQUEST');
      await rejectsCode(requestAssistant({ ...base, lang: 'unknown' }, options), 'INVALID_REQUEST');
      assert.equal(calls, 0);
    },
  },
  {
    name: 'configuration and provider errors keep distinct safe codes and discard upstream error details',
    async fn() {
      for (const code of ['AI_NOT_CONFIGURED', 'UNAUTHORIZED', 'UPSTREAM_AUTH', 'UPSTREAM_RATE_LIMIT', 'UPSTREAM_TIMEOUT', 'UPSTREAM_INCOMPLETE']) {
        await rejectsCode(requestAssistant(base, { fetchImpl: async () => response({ ok: false, error: { code, message: 'sensitive-provider-response' } }, 503) }), code);
      }
      await rejectsCode(requestAssistant(base, { fetchImpl: async () => response({ ok: false, error: { code: 'unexpected-sensitive-message' } }, 500) }), 'GENERIC');
      await rejectsCode(requestAssistant(base, { fetchImpl: async () => { throw new Error('secret network internals'); } }), 'NETWORK_ERROR');
    },
  },
  {
    name: 'a static hosting 404 is not mistaken for a working assistant',
    async fn() {
      await rejectsCode(requestAssistant(base, { fetchImpl: async () => ({ ok: false, status: 404, json: () => { throw new Error('HTML body must not be read'); } }) }), 'AI_NOT_CONFIGURED');
      await rejectsCode(requestAssistant(base, { fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new Error('not JSON'); } }) }), 'UPSTREAM_INVALID_RESPONSE');
    },
  },
  {
    name: 'invalid or fabricated success responses never become a live result',
    async fn() {
      for (const body of [
        { ok: true, status: 'live', text: '' },
        { ok: true, status: 'demo', text: 'A canned answer.' },
        { ok: true, status: 'live', text: { html: '<script>' } },
        { ok: true, status: 'live', text: 'x'.repeat(32001) },
      ]) {
        await rejectsCode(requestAssistant(base, { fetchImpl: async () => response(body) }), 'UPSTREAM_INVALID_RESPONSE');
      }
    },
  },
  {
    name: 'a real refusal stays distinguishable from a generated answer',
    async fn() {
      const result = await requestAssistant({ ...base, lang: 'ar' }, { fetchImpl: async () => response({ ok: true, status: 'refused', text: 'لا أستطيع المساعدة في هذا الطلب.' }) });
      assert.deepEqual(result, { status: 'refused', text: 'لا أستطيع المساعدة في هذا الطلب.', model: '' });
    },
  },
  {
    name: 'user cancellation and the bounded wait have separate safe outcomes',
    async fn() {
      for (const [reason, expected] of [['cancelled', 'CANCELLED'], ['unmounted', 'CANCELLED'], ['timeout', 'UPSTREAM_TIMEOUT']]) {
        const controller = new AbortController();
        const pending = requestAssistant({ ...base, signal: controller.signal }, { fetchImpl: (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted secret request')), { once: true })) });
        controller.abort(reason);
        await rejectsCode(pending, expected);
      }
    },
  },
  {
    name: 'every owner-facing assistant message and error is available in Arabic and English',
    fn() {
      const paths = (value, prefix = '') => Object.entries(value).flatMap(([key, item]) => typeof item === 'object' ? paths(item, `${prefix}${key}.`) : [`${prefix}${key}`]).sort();
      assert.deepEqual(paths(dict.ar), paths(dict.en));
      for (const lang of ['ar', 'en']) {
        for (const path of paths(dict[lang])) assert.ok(path.split('.').reduce((object, key) => object[key], dict[lang]).trim(), `${lang}:${path}`);
      }
    },
  },
];
