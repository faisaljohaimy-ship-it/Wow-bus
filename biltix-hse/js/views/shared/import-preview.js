/**
 * BILTIX Risk AI — shared import preview (js/views/shared/import-preview.js). Owner: B-PLATFORM.
 *
 *   openImportPreview(ctx, { source, onCommitted, returnFocus }) → { close }
 *
 * `source` is what sources.importPreview() accepts (CONTRACT §8 / AC-11):
 *   • a local file:   { text, fileName, format? }        → validated in this browser (synchronous)
 *   • a remote source: { type: 'json'|'sheets'|'supabase', url, apiKey, table } → a REAL request (Promise)
 *
 * Flow: loading (cancellable for a remote request) → error with retry | per-row preview: counts
 * (total / valid / with errors / warnings), recognised and ignored columns, a filterable table with every
 * row's errors and warnings (field + message in the active language) → "Import N valid rows" commits ONLY
 * the valid rows through sources.commitImport(preview, { store, bus }) into the safety risk register.
 * Nothing is stored before the user confirms. A remote preview records its real outcome on the data
 * source (store.recordDataSourceResult) so status.js can report Live / Error honestly.
 *
 * Data reaches the DOM only through textContent / components.h. Strings: dictionary 'import'
 * (js/i18n/import.js), registered here at import time.
 */

import { i18n } from '../../core/i18n.js';
import dict from '../../i18n/import.js';

i18n.register('import', dict);

const STYLE_ID = 'view-import-preview-style';
const STYLE_TEXT = `
.imp { display: flex; flex-direction: column; gap: var(--space-4); min-inline-size: 0; }
.imp-counts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-2); margin: 0; }
.imp-count { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border-radius: var(--radius-md); background: var(--bg-2); border: 1px solid var(--line); min-inline-size: 0; }
.imp-count dt { font-size: var(--fs-xs); color: var(--ink-2); display: flex; align-items: center; gap: 6px; }
.imp-count dt > svg { flex: none; inline-size: 14px; block-size: 14px; }
.imp-count dd { margin: 0; font-size: var(--fs-xl); font-weight: 600; font-variant-numeric: tabular-nums; color: var(--ink-1); line-height: 1.2; }
.imp-count.tone-good dt > svg { color: var(--good-text); }
.imp-count.tone-critical dt > svg { color: var(--critical-text); }
.imp-count.tone-warning dt > svg { color: var(--warning-text); }
.imp-mapping { display: flex; flex-direction: column; gap: 4px; font-size: var(--fs-sm); color: var(--ink-2); }
.imp-mapping .imp-cols { color: var(--ink-1); overflow-wrap: anywhere; }
.imp-toolbar { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); flex-wrap: wrap; }
.imp-status { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; font-size: var(--fs-sm); font-weight: 500; }
.imp-status > svg { flex: none; }
.imp-status.is-valid { color: var(--good-text); }
.imp-status.is-invalid { color: var(--critical-text); }
.imp-issues { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; min-inline-size: 12rem; }
.imp-issue { display: grid; grid-template-columns: 14px minmax(0, 1fr); gap: 6px; align-items: start; font-size: var(--fs-xs); line-height: 1.5; color: var(--ink-2); }
.imp-issue > svg { margin-block-start: 2px; }
.imp-issue.is-error > svg { color: var(--critical-text); }
.imp-issue.is-warning > svg { color: var(--warning-text); }
.imp-issue strong { color: var(--ink-1); font-weight: 600; }
.imp-hazard { display: block; min-inline-size: 10rem; max-inline-size: 26rem; overflow-wrap: anywhere; }
.imp-num { font-variant-numeric: tabular-nums; white-space: nowrap; unicode-bidi: isolate; }
.imp-note { font-size: var(--fs-sm); color: var(--ink-2); line-height: 1.55; }
.imp .table-wrap { max-block-size: min(52vh, 520px); }
@container main (max-width: 560px) { .imp-counts { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 599.98px) { .imp-counts { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
`;

const LOCAL_TYPES = new Set(['text', 'records']);
const TYPE_LABEL = { json: 'JSON API', sheets: 'Google Sheets CSV', supabase: 'Supabase' };
const FETCH_OK_REASONS = new Set(['ok', 'no-valid-rows', 'noRows']);

function ensureStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = STYLE_TEXT;
  document.head.appendChild(style);
}

const arr = (v) => (Array.isArray(v) ? v : []);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function isRemote(source) {
  if (!isObj(source)) return false;
  if (typeof source.text === 'string' || Array.isArray(source.records)) return false;
  return Boolean(source.type) && !LOCAL_TYPES.has(source.type);
}

/**
 * Open the preview dialog. Returns { close }.
 * @param {object} ctx view context (components, sources, store, bus, fmt, router)
 * @param {{ source: object, onCommitted?: Function, returnFocus?: Element }} opts
 */
export function openImportPreview(ctx, { source = {}, onCommitted = null, returnFocus = null } = {}) {
  const { components, store, bus, fmt, router } = ctx || {};
  const sources = (ctx && ctx.sources) || {};
  if (!components || typeof components.modal !== 'function') return { close() {} };
  const { h, modal, button, glyph, svgIcon, toast, dataTable, segmented, loadingState, errorState, emptyState } = components;
  const t = (k, p) => i18n.t(k, p);
  const tn = (k, n, p) => i18n.tn(k, n, p);
  const en = () => i18n.lang() === 'en';
  const msgOf = (r) => String((en() ? (r && (r.messageEn || r.message)) : (r && (r.message || r.messageEn))) || '');
  const num = (n) => (fmt && typeof fmt.num === 'function' ? fmt.num(n) : String(n));
  ensureStyle();

  const remote = isRemote(source);
  const subtitle = remote
    ? t('import.subtitleSource', { type: TYPE_LABEL[String(source.type)] || String(source.type) })
    : (source && source.fileName ? t('import.subtitleFile', { name: String(source.fileName) }) : t('import.subtitleData'));

  const body = h('div', { class: 'imp', 'aria-live': 'polite' });
  let preview = null;
  let filter = 'all';
  let token = 0;
  let closed = false;
  let table = null;

  const commitBtn = button(tn('import.commit', 0), { variant: 'primary', icon: svgIcon('import', 16), onClick: () => { commit(); }, attrs: { disabled: true } });
  const cancelBtn = button(t('import.cancel'), { variant: 'ghost', onClick: () => dialog.close('cancel') });

  const dialog = modal({
    title: t('import.title'),
    subtitle,
    size: 'lg',
    body,
    actions: [cancelBtn, commitBtn],
    returnFocus,
    onClose: () => { closed = true; token += 1; },
  });

  /* ── helpers ── */

  const sites = () => arr(store && store.state && store.state.sites);
  function siteText(id) {
    if (!id) return '—';
    const s = sites().find((x) => x && x.id === id);
    if (!s) return String(id);
    const name = i18n.L(s, 'name', 'sites') || s.name || id;
    return s.code ? `${name} · ${s.code}` : name;
  }
  const fieldLabel = (f) => (i18n.has(`import.fields.${f}`) ? t(`import.fields.${f}`) : String(f || ''));

  function setCommit(count, busy = false) {
    const lab = commitBtn.querySelector('.btn-label');
    if (lab) lab.textContent = busy ? t('import.committing') : tn('import.commit', count);
    commitBtn.disabled = busy || !(count > 0);
    if (busy) commitBtn.setAttribute('aria-busy', 'true'); else commitBtn.removeAttribute('aria-busy');
  }

  /* ── states ── */

  function showLoading() {
    setCommit(0);
    body.replaceChildren(loadingState({
      title: t('import.loadingTitle'),
      text: remote ? t('import.loadingRemote', { seconds: num(8) }) : t('import.loadingLocal'),
      lines: 3,
      onCancel: remote ? () => { token += 1; body.replaceChildren(emptyState({ icon: glyph('neutral', 28), title: t('import.cancelled') })); } : null,
    }));
  }

  function showError(result) {
    setCommit(0);
    body.replaceChildren(errorState({
      title: t('import.errorTitle'),
      text: msgOf(result) || undefined,
      retry: remote ? () => run() : null,
      retryLabel: t('import.errorRetry'),
    }));
  }

  function countCell(label, value, tone, icon) {
    return h('div', { class: ['imp-count', tone ? `tone-${tone}` : null] },
      h('dt', {}, icon, h('span', {}, label)),
      h('dd', {}, num(value)));
  }

  function issuesCell(r) {
    const list = [
      ...arr(r.errors).map((e) => ({ ...e, kind: 'error' })),
      ...arr(r.warnings).map((w) => ({ ...w, kind: 'warning' })),
    ];
    if (!list.length) return h('span', { class: 'muted text-xs' }, t('import.table.none'));
    return h('ul', { class: 'imp-issues' }, ...list.map((e) => h('li', { class: ['imp-issue', `is-${e.kind}`] },
      glyph(e.kind === 'error' ? 'critical' : 'warning', 14),
      h('span', {},
        h('span', { class: 'sr-only' }, `${e.kind === 'error' ? t('import.issueError') : t('import.issueWarning')}: `),
        h('strong', {}, fieldLabel(e.field)), ' — ', msgOf(e)))));
  }

  function statusCell(r) {
    if (r.valid) return h('span', { class: 'imp-status is-valid' }, glyph('good', 14), h('span', {}, t('import.rowValid')));
    return h('span', { class: 'imp-status is-invalid' }, glyph('critical', 14), h('span', {}, tn('import.rowErrors', arr(r.errors).length)));
  }

  function rowsFor(f) {
    const all = arr(preview && preview.rows).map((r) => ({ ...r, id: `row-${r.row}` }));
    if (f === 'valid') return all.filter((r) => r.valid);
    if (f === 'invalid') return all.filter((r) => !r.valid);
    return all;
  }

  function showResult(p) {
    preview = p;
    const total = Number(p.total) || 0;
    if (!total) {
      setCommit(0);
      body.replaceChildren(emptyState({ icon: glyph('empty', 28), title: t('import.emptyTitle'), text: msgOf(p) }));
      return;
    }
    const validCount = Number(p.validCount) || 0;
    const invalidCount = Number(p.invalidCount) || 0;
    const warnCount = arr(p.warnings).length;
    const counts = h('dl', { class: 'imp-counts', 'aria-label': t('import.countsAria') },
      countCell(t('import.counts.total'), total, null, svgIcon('table', 14)),
      countCell(t('import.counts.valid'), validCount, 'good', glyph('good', 14)),
      countCell(t('import.counts.invalid'), invalidCount, invalidCount ? 'critical' : null, glyph(invalidCount ? 'critical' : 'neutral', 14)),
      countCell(t('import.counts.warnings'), warnCount, warnCount ? 'warning' : null, glyph(warnCount ? 'warning' : 'neutral', 14)));

    const m = p.mapping || null;
    const labels = m ? arr(en() ? (m.labelsEn || m.labels) : m.labels) : [];
    const sep = en() ? ', ' : '، ';
    const mapping = h('div', { class: 'imp-mapping' },
      h('span', {}, labels.length ? t('import.mapping.recognised', { list: '' }) : t('import.mapping.none'), labels.length ? h('span', { class: 'imp-cols' }, labels.join(sep)) : null),
      m && arr(m.unknown).length ? h('span', {}, t('import.mapping.ignored', { list: '' }), h('bdi', { class: 'imp-cols' }, arr(m.unknown).slice(0, 12).join(sep))) : null,
      Number.isFinite(Number(p.latencyMs)) && p.real ? h('span', { class: 'muted text-xs' }, t('import.latency', { ms: t('import.ms', { n: num(Number(p.latencyMs)) }) })) : null);

    const seg = segmented({
      options: [
        { value: 'all', label: `${t('import.filter.all')} · ${num(total)}` },
        { value: 'valid', label: `${t('import.filter.valid')} · ${num(validCount)}` },
        { value: 'invalid', label: `${t('import.filter.invalid')} · ${num(invalidCount)}` },
      ],
      value: filter,
      ariaLabel: t('import.filter.aria'),
      onChange: (v) => { filter = v; if (table) table.update(rowsFor(v), { resetPage: true }); },
    });
    seg.el.classList.add('seg-sm');

    table = dataTable({
      dense: true,
      pageSize: 8,
      caption: t('import.table.caption'),
      emptyText: t('import.table.empty'),
      columns: [
        { key: 'row', label: t('import.table.row'), align: 'end', priority: 'high', render: (r) => h('span', { class: 'imp-num mono' }, num(r.row)), sortValue: (r) => r.row },
        { key: 'valid', label: t('import.table.status'), priority: 'high', render: statusCell, sortValue: (r) => (r.valid ? 1 : 0) },
        { key: 'hazard', label: t('import.table.hazard'), priority: 'high', render: (r) => h('span', { class: 'imp-hazard', dir: 'auto' }, (r.data && r.data.hazard) || '—'), sortValue: (r) => (r.data && r.data.hazard) || '' },
        { key: 'site', label: t('import.table.site'), priority: 'medium', render: (r) => siteText(r.data && r.data.siteId), sortValue: (r) => (r.data && r.data.siteId) || '' },
        { key: 'category', label: t('import.table.category'), priority: 'low', render: (r) => (r.data && r.data.categoryId ? i18n.label('hseCategory', r.data.categoryId) : '—'), sortable: false },
        { key: 'score', label: t('import.table.score'), priority: 'medium', sortable: false, render: (r) => {
          const L = r.data && r.data.likelihood; const S = r.data && r.data.severity;
          return h('span', { class: 'imp-num', dir: 'ltr' }, `${L ? num(L) : '—'} × ${S ? num(S) : '—'}`);
        } },
        { key: 'due', label: t('import.table.due'), priority: 'low', render: (r) => (r.data && r.data.dueDate && fmt ? h('span', { class: 'imp-num' }, fmt.date(r.data.dueDate)) : '—'), sortValue: (r) => (r.data && r.data.dueDate) || '' },
        { key: 'owner', label: t('import.table.owner'), priority: 'low', render: (r) => (r.data && r.data.owner ? i18n.term(r.data.owner) : '—'), sortable: false },
        { key: 'issues', label: t('import.table.issues'), priority: 'high', sortable: false, render: issuesCell },
      ],
      rows: rowsFor(filter),
      initialSort: { key: 'row', dir: 'asc' },
    });

    body.replaceChildren(
      counts,
      mapping,
      m && m.ok === false ? h('div', { class: 'note', role: 'note', style: { '--tone': 'var(--warning)' } }, msgOf(m)) : null,
      h('div', { class: 'imp-toolbar' }, seg.el),
      table.el,
      h('p', { class: 'imp-note' }, t('import.rule'), ' ', t('import.target')),
    );
    setCommit(validCount);
  }

  /* ── run / commit ── */

  function record(p) {
    if (!remote || !store || typeof store.recordDataSourceResult !== 'function' || !p || p.real !== true) return;
    const ok = FETCH_OK_REASONS.has(String(p.reason));
    try { store.recordDataSourceResult(ok ? { ok: true } : { ok: false, reason: p.reason, message: p.message, messageEn: p.messageEn }); } catch { /* status stays as it was */ }
  }

  function run() {
    const my = ++token;
    if (typeof sources.importPreview !== 'function') { showError({ message: t('import.unavailable'), messageEn: t('import.unavailable') }); return Promise.resolve(); }
    showLoading();
    let result;
    try { result = sources.importPreview(source); } catch (err) { result = { ok: false, total: 0, message: String(err && err.message || err), messageEn: String(err && err.message || err) }; }
    return Promise.resolve(result).then((p) => {
      if (closed || my !== token) return;
      record(p);
      if (!p || (p.ok === false && !(Number(p.total) > 0) && !FETCH_OK_REASONS.has(String(p.reason)))) { showError(p || {}); return; }
      showResult(p);
    }, (err) => {
      if (closed || my !== token) return;
      showError({ message: String(err && err.message || err), messageEn: String(err && err.message || err) });
    });
  }

  async function commit() {
    if (!preview || !(Number(preview.validCount) > 0)) return;
    if (typeof sources.commitImport !== 'function') { toast(t('import.unavailable'), { tone: 'warning' }); return; }
    setCommit(Number(preview.validCount) || 0, true);
    cancelBtn.disabled = true;
    let r = null;
    try { r = await sources.commitImport(preview, { store, bus }); } catch (err) { r = { ok: false, message: String(err && err.message || err), messageEn: String(err && err.message || err) }; }
    cancelBtn.disabled = false;
    if (r && r.ok) {
      const skipped = Number(r.skipped) || 0;
      const text = `${tn('import.done', Number(r.count) || 0)}${skipped ? ` ${tn('import.doneSkipped', skipped)}` : ''}`;
      toast(text, { tone: 'good', action: router && typeof router.navigate === 'function' ? { label: t('import.openRegister'), onClick: () => router.navigate('risks') } : null });
      dialog.close('committed');
      if (typeof onCommitted === 'function') { try { onCommitted(r); } catch { /* caller owns its refresh */ } }
      return;
    }
    setCommit(Number(preview.validCount) || 0);
    const note = h('div', { class: 'note', role: 'alert', style: { '--tone': 'var(--critical)' } }, h('strong', {}, t('import.commitFailed')), ' ', msgOf(r || {}));
    body.insertBefore(note, body.firstChild);
  }

  dialog.open();
  run();
  return { close: () => dialog.close('close') };
}

export default openImportPreview;
