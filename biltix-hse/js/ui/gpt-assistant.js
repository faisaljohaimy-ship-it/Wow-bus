/** A manually invoked, owner-access assistant. No store, automatic requests, or persisted credentials. */
import { i18n } from '../core/i18n.js';
import dict from '../i18n/assistant.js';

i18n.register('assistant', dict);

const ERROR_CODES = new Set([
  'AI_NOT_CONFIGURED', 'UNAUTHORIZED', 'ORIGIN_NOT_ALLOWED', 'INVALID_REQUEST', 'PAYLOAD_TOO_LARGE',
  'UPSTREAM_AUTH', 'UPSTREAM_RATE_LIMIT', 'UPSTREAM_TIMEOUT', 'UPSTREAM_INCOMPLETE', 'UPSTREAM_INVALID_RESPONSE',
]);
const fail = (code) => Object.assign(new Error(code), { code });

/** Single-turn browser client; injectable fetch keeps its privacy and failure contract testable offline. */
export async function requestAssistant({ prompt, token, lang, signal }, { fetchImpl = globalThis.fetch } = {}) {
  const question = typeof prompt === 'string' ? prompt.trim() : '';
  const access = typeof token === 'string' ? token.trim() : '';
  if (!access) throw fail('TOKEN_REQUIRED');
  if (/^sk-/i.test(access)) throw fail('OPENAI_KEY_NOT_ALLOWED');
  if (access.length < 32 || access.length > 512 || /[\r\n]/.test(access)) throw fail('UNAUTHORIZED');
  if (!question) throw fail('PROMPT_REQUIRED');
  if (question.length > 6000 || !['ar', 'en'].includes(lang)) throw fail('INVALID_REQUEST');
  let response;
  let payload;
  try {
    response = await fetchImpl('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access}` },
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      body: JSON.stringify({ prompt: question, lang }),
      signal,
    });
    // A static host can return an HTML 404; never display its response body as an error.
    if (response.status === 404) throw fail('AI_NOT_CONFIGURED');
    try { payload = await response.json(); } catch { throw fail('UPSTREAM_INVALID_RESPONSE'); }
  } catch (error) {
    if (signal?.aborted) throw fail(signal.reason === 'timeout' ? 'UPSTREAM_TIMEOUT' : 'CANCELLED');
    if (['AI_NOT_CONFIGURED', 'UPSTREAM_INVALID_RESPONSE'].includes(error?.code)) throw error;
    throw fail('NETWORK_ERROR');
  }
  if (!response.ok || payload?.ok !== true) {
    const code = payload?.error?.code;
    throw fail(ERROR_CODES.has(code) ? code : 'GENERIC');
  }
  if (!['live', 'refused'].includes(payload.status) || typeof payload.text !== 'string' || !payload.text.trim() || payload.text.length > 32000) {
    throw fail('UPSTREAM_INVALID_RESPONSE');
  }
  return {
    text: payload.text,
    status: payload.status,
    model: typeof payload.model === 'string' && payload.model.length <= 120 ? payload.model : '',
  };
}

export function createAssistantPanel({ components }) {
  const { h, card, button, formField, statusBadge } = components;
  const t = (key, params) => i18n.t(`assistant.${key}`, params);
  let active = null;
  let destroyed = false;

  const tokenField = formField({ label: t('token'), name: 'assistant-access', type: 'password', hint: t('tokenHint'), autocomplete: 'off' });
  const token = tokenField.querySelector('input');
  token.maxLength = 512;
  token.spellcheck = false;
  const promptField = formField({ label: t('prompt'), name: 'assistant-question', type: 'textarea', rows: 4, hint: t('promptHint'), placeholder: t('placeholder') });
  const prompt = promptField.querySelector('textarea');
  prompt.maxLength = 6000;
  const status = h('div', { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const feedback = h('p', { class: 'text-sm muted', role: 'status', 'aria-live': 'polite', style: { margin: '0', overflowWrap: 'anywhere' } });
  const answer = h('div', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }, dir: 'auto' });
  const model = h('p', { class: 'text-xs muted', style: { margin: '0', overflowWrap: 'anywhere' } });
  const answerSection = h('section', { class: 'stack gap-2', hidden: true, 'aria-label': t('response') },
    h('h3', { class: 't-card' }, t('response')), answer, model, h('p', { class: 'text-xs muted' }, t('review')));
  const send = button(t('send'), { attrs: { type: 'submit' } });
  const cancel = button(t('cancel'), { variant: 'outline', attrs: { hidden: true }, onClick: () => active?.abort('cancelled') });
  const clear = button(t('clear'), { variant: 'ghost', onClick: () => {
    prompt.value = '';
    answer.textContent = '';
    model.textContent = '';
    answerSection.hidden = true;
    feedback.textContent = '';
    paintStatus('not_connected', 'idle');
    prompt.focus();
  } });
  const form = h('form', { class: 'stack gap-3', autocomplete: 'off' },
    h('p', { class: 'text-sm muted', style: { margin: '0' } }, t('privacy')),
    tokenField, promptField,
    h('div', { class: 'row gap-2 wrap' }, send, cancel, clear), feedback, answerSection);
  const el = card({
    id: 'engine-assistant', title: t('title'), subtitle: t('subtitle'), actions: [status],
    body: form, footer: h('p', { class: 'text-xs muted', style: { margin: '0' } }, t('scope')),
  });

  function paintStatus(state, label) {
    status.replaceChildren(statusBadge(state, { label: t(label), title: false }));
  }
  function busy(value) {
    send.disabled = value;
    clear.disabled = value;
    token.disabled = value;
    prompt.disabled = value;
    cancel.hidden = !value;
    form.setAttribute('aria-busy', String(value));
  }
  async function submit(event) {
    event.preventDefault();
    if (destroyed || active) return;
    const controller = new AbortController();
    active = controller;
    busy(true);
    answerSection.hidden = true;
    answer.textContent = '';
    model.textContent = '';
    feedback.textContent = '';
    paintStatus('not_connected', 'pending');
    const timer = setTimeout(() => controller.abort('timeout'), 30000);
    try {
      const result = await requestAssistant({ prompt: prompt.value, token: token.value, lang: i18n.lang(), signal: controller.signal });
      if (destroyed || controller.signal.aborted) return;
      answer.textContent = result.text;
      model.textContent = result.model ? t('model', { model: result.model }) : '';
      model.hidden = !result.model;
      answerSection.hidden = false;
      paintStatus(result.status === 'live' ? 'live' : 'not_connected', result.status === 'live' ? 'received' : 'refused');
    } catch (error) {
      if (destroyed) return;
      if (error.code === 'CANCELLED') {
        paintStatus('not_connected', 'cancelled');
        feedback.textContent = t('cancelHint');
      } else {
        paintStatus(error.code === 'AI_NOT_CONFIGURED' ? 'not_connected' : 'error', 'failed');
        const key = Object.hasOwn(dict.en.errors, error.code) ? error.code : 'GENERIC';
        feedback.textContent = t(`errors.${key}`);
      }
    } finally {
      clearTimeout(timer);
      if (active === controller) active = null;
      if (!destroyed) busy(false);
    }
  }
  form.addEventListener('submit', submit);
  paintStatus('not_connected', 'idle');

  return {
    el,
    destroy() {
      destroyed = true;
      active?.abort('unmounted');
      active = null;
      form.removeEventListener('submit', submit);
      token.value = '';
      prompt.value = '';
      answer.textContent = '';
      model.textContent = '';
    },
  };
}
