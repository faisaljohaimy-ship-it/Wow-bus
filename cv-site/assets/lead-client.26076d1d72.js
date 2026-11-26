 

export const PRIVACY = {
  ar: {
    title: 'إشعار الخصوصية',
    items: [
      'ما نحفظه: الاسم والجهة والمنصب والبريد الإلكتروني والهاتف والدولة ونص الطلب والميزانية والجدول الزمني إن أدخلتها، ووقت الإرسال، وبصمة مشفّرة غير قابلة للعكس لعنوان الشبكة (IP) لمنع إساءة الاستخدام. لا نحفظ عنوان IP نفسه.',
      'لماذا: للرد على طلبك وإعداد العرض التوضيحي أو العرض الفني والمالي فقط. لا نستخدمه للتسويق ولا نبيعه.',
      'أين: في تخزين Vercel Blob الخاص ضمن مشروع الشركة على Vercel (مزوّد خدمة يعالج البيانات نيابةً عنا)، وغير متاح للعامة. وإذا فُعّل التنبيه بالبريد فقد يُرسل ملخص الطلب إلى صندوق بريد الشركة عبر مزوّد الإرسال Resend.',
      'المدة: نقترح الاحتفاظ بالبيانات 12 شهرًا من آخر تواصل ثم حذفها، أو قبل ذلك عند طلبك.',
      'حقوقك: لطلب الاطلاع على بياناتك أو تصحيحها أو حذفها، راسلنا عبر صفحة التواصل في هذا الموقع مع ذكر رقم الطلب الذي يظهر لك بعد الإرسال.',
    ],
    consent: 'أوافق على معالجة بياناتي وفق إشعار الخصوصية أعلاه.',
  },
  en: {
    title: 'Privacy notice',
    items: [
      'What we store: your name, organisation, role, e-mail, phone, country, message, budget and timeline if you give them, the time of submission, and a one-way hash of your network (IP) address used only to limit abuse. The IP address itself is not stored.',
      'Why: only to answer your request and prepare the demo or the technical and financial proposal. Not used for marketing and never sold.',
      'Where: private Vercel Blob storage in the company\'s Vercel project (a service provider acting on our behalf), not publicly accessible. If e-mail alerts are enabled, a summary of the request may be sent to the company mailbox through the sending provider Resend.',
      'Retention: we suggest keeping data for 12 months after the last contact, then deleting it, or sooner on request.',
      'Your rights: to access, correct or delete your data, contact us through the Contact page of this site and quote the reference number shown after you submit.',
    ],
    consent: 'I agree to the processing of my data as described in the privacy notice above.',
  },
};

const COPY = {
  ar: {
    sending: 'جارٍ الإرسال...', send: 'إرسال الطلب',
    ok: 'تم استلام طلبك. رقم المرجع: ',
    summary: 'لم يُرسل الطلب. يرجى تصحيح الحقول التالية:',
    required: 'هذا الحقل مطلوب.', email: 'أدخل بريدًا إلكترونيًا صحيحًا.', short: 'النص قصير جدًا.',
    consent: 'يلزم الموافقة على إشعار الخصوصية.',
    network: 'تعذر الاتصال بالخادم ولم يُرسل طلبك. تحقق من الاتصال وحاول مجددًا.',
    generic: 'تعذر إرسال الطلب. حاول لاحقًا.',
  },
  en: {
    sending: 'Sending...', send: 'Send request',
    ok: 'Your request was received. Reference: ',
    summary: 'Your request was not sent. Please fix the following fields:',
    required: 'This field is required.', email: 'Enter a valid e-mail address.', short: 'This text is too short.',
    consent: 'Consent to the privacy notice is required.',
    network: 'Could not reach the server and your request was NOT sent. Check your connection and try again.',
    generic: 'The request could not be sent. Please try later.',
  },
};
const FIELDS = ['name', 'organisation', 'role', 'email', 'phone', 'country', 'message', 'budgetRange', 'timeline'];

function langOf(form) {
  const l = form.dataset.lang || document.documentElement.lang || 'ar';
  return l.toLowerCase().startsWith('en') ? 'en' : 'ar';
}
function el(tag, attrs, text) {
  const e = document.createElement(tag);
  for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
  if (text) e.textContent = text;
  return e;
}

export function initLeadForm(form, opts = {}) {
  if (form.dataset.leadReady) return;
  form.dataset.leadReady = '1';
  const lang = langOf(form);
  const t = COPY[lang];
  const endpoint = opts.endpoint || form.dataset.endpoint || '/api/lead';
  const startedAt = Date.now();

  
  if (!form.querySelector('[name=website]')) {
    const w = el('div', { 'aria-hidden': 'true', style: 'position:absolute;inset-inline-start:-9999px;width:1px;height:1px;overflow:hidden' });
    const i = el('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off' });
    w.appendChild(i); form.appendChild(w);
  }
  
  const priv = form.querySelector('[data-lead-privacy]');
  if (priv && !priv.childElementCount) {
    const p = PRIVACY[lang];
    priv.appendChild(el('h3', {}, p.title));
    const ul = el('ul'); p.items.forEach((x) => ul.appendChild(el('li', {}, x))); priv.appendChild(ul);
  }
  const consent = form.querySelector('[name=consent]');
  const btn = form.querySelector('[type=submit]');
  let status = form.querySelector('[data-lead-status]');
  if (!status) { status = el('div', { 'data-lead-status': '' }); form.appendChild(status); }
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.tabIndex = -1;
  const sync = () => { if (btn) btn.disabled = !(consent && consent.checked); };
  if (consent) consent.addEventListener('change', sync);
  sync();

  const clearErrors = () => {
    form.querySelectorAll('[data-lead-error]').forEach((n) => n.remove());
    form.querySelectorAll('[aria-invalid]').forEach((n) => { n.removeAttribute('aria-invalid'); n.removeAttribute('aria-describedby'); });
  };
  const showErrors = (errs, summary) => {
    clearErrors();
    const names = Object.keys(errs);
    const ul = el('ul');
    let first = null;
    names.forEach((n) => {
      const f = form.querySelector(`[name="${n}"]`);
      const id = `lead-err-${n}`;
      if (f) {
        f.setAttribute('aria-invalid', 'true'); f.setAttribute('aria-describedby', id);
        const m = el('div', { id, 'data-lead-error': '', class: 'lead-error' }, errs[n]);
        (f.closest('[data-field]') || f.parentNode).appendChild(m);
        if (!first) first = f;
      }
      ul.appendChild(el('li', {}, errs[n]));
    });
    status.className = 'lead-status lead-status--error';
    status.setAttribute('role', 'alert');
    status.textContent = summary || t.summary;
    status.appendChild(ul);
    (first || status).focus();
  };
  const localValidate = (v) => {
    const e = {};
    const need = (k, min) => { if (!v[k] || v[k].length < (min || 1)) e[k] = v[k] ? t.short : t.required; };
    need('name', 2); need('organisation', 2); need('message', 10);
    if (!v.email) e.email = t.required; else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) e.email = t.email;
    if (!consent || !consent.checked) e.consent = t.consent;
    return e;
  };

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (btn && btn.disabled && !(consent && consent.checked)) return; 
    const fd = new FormData(form);
    const v = {};
    FIELDS.forEach((k) => { const x = (fd.get(k) || '').toString().trim(); if (x) v[k] = x; });
    const local = localValidate(v);
    if (Object.keys(local).length) return showErrors(local);
    clearErrors();
    status.setAttribute('role', 'status'); status.className = 'lead-status';
    const label = btn && btn.textContent;
    if (btn) { btn.disabled = true; btn.textContent = t.sending; }
    form.setAttribute('aria-busy', 'true');
    status.textContent = t.sending;
    try {
      const res = await fetch(endpoint, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(Object.assign({}, v, {
          type: form.dataset.type === 'proposal' ? 'proposal' : 'demo', lang, consent: true,
          website: (fd.get('website') || '').toString(), startedAt,
        })),
      });
      let data = {};
      try { data = await res.json(); } catch {   }
      if (res.ok && data.ok) {
        status.className = 'lead-status lead-status--ok';
        status.textContent = (data.message || t.ok) + (data.id ? ' ' + t.ok + data.id : '');
        form.reset(); form.dataset.leadDone = '1';
        status.focus();
        if (opts.onSuccess) opts.onSuccess(data);
      } else if (res.status === 422 && data.errors) {
        const errs = {}; Object.keys(data.errors).forEach((k) => { errs[k] = data.errors[k].message; });
        showErrors(errs, data.message);
      } else {
        status.className = 'lead-status lead-status--error'; status.setAttribute('role', 'alert');
        status.textContent = data.message || t.generic; status.focus();
      }
    } catch {
      status.className = 'lead-status lead-status--error'; status.setAttribute('role', 'alert');
      status.textContent = t.network; status.focus();
    } finally {
      form.removeAttribute('aria-busy');
      if (btn) { btn.textContent = label; sync(); }
    }
  });
}

export function initLeadForms(opts) {
  document.querySelectorAll('form[data-lead-form]').forEach((f) => initLeadForm(f, opts));
}
