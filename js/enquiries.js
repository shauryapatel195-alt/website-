/* ==========================================================================
   STANFLEX — enquiry backend client (quote form + staff inbox)
   --------------------------------------------------------------------------
   Two modes, decided by js/config.js:

   LIVE  — Supabase configured. The form INSERTs into the `enquiries` table
           through Supabase's REST API using the public anon key (row-level
           security only allows inserts). The admin inbox signs in with
           Supabase Auth (email + password) and reads rows as an
           authenticated user. See SETUP-SUPABASE.md for the one-time setup.

   DEMO  — No configuration (or the network is unreachable, e.g. in the
           hosted preview sandbox). Enquiries are stored in the visitor's
           own browser (localStorage) and the admin page displays those,
           clearly labelled, so the whole flow can be tried end-to-end.

   No frameworks, no SDK — plain fetch against Supabase's REST endpoints,
   so the site stays dependency-free.
   ========================================================================== */
(function () {
  'use strict';

  const cfg = window.STANFLEX_CONFIG || {};
  const BASE = (cfg.SUPABASE_URL || '').replace(/\/+$/, '');
  const KEY = cfg.SUPABASE_ANON_KEY || '';
  const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(BASE) && KEY.length > 20;

  const LS_ENQUIRIES = 'stanflex-enquiries';
  const SS_SESSION = 'stanflex-admin-session';

  const $ = (sel, root) => (root || document).querySelector(sel);

  /* ---------------- local (demo) storage ---------------- */
  function localEnquiries() {
    try { return JSON.parse(localStorage.getItem(LS_ENQUIRIES)) || []; }
    catch { return []; }
  }
  function saveLocal(data) {
    const all = localEnquiries();
    all.unshift(Object.assign({ created_at: new Date().toISOString() }, data));
    localStorage.setItem(LS_ENQUIRIES, JSON.stringify(all.slice(0, 200)));
  }

  /* ---------------- Supabase REST helpers ---------------- */
  function sbHeaders(token) {
    return {
      'apikey': KEY,
      'Authorization': 'Bearer ' + (token || KEY),
      'Content-Type': 'application/json'
    };
  }

  async function sbInsert(data) {
    const res = await fetch(BASE + '/rest/v1/enquiries', {
      method: 'POST',
      headers: Object.assign(sbHeaders(), { 'Prefer': 'return=minimal' }),
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('Insert failed (HTTP ' + res.status + ')');
  }

  async function sbSignIn(email, password) {
    const res = await fetch(BASE + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: sbHeaders(),
      body: JSON.stringify({ email, password })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.error_description || body.msg || 'Sign-in failed');
    }
    return body.access_token;
  }

  async function sbList(token) {
    const res = await fetch(
      BASE + '/rest/v1/enquiries?select=*&order=created_at.desc&limit=200',
      { headers: sbHeaders(token) });
    if (res.status === 401 || res.status === 403) throw Object.assign(new Error('unauthorized'), { auth: true });
    if (!res.ok) throw new Error('Load failed (HTTP ' + res.status + ')');
    return res.json();
  }

  /* =========================================================
     QUOTE FORM (quote.html)
     ========================================================= */
  const form = $('#quote-form');
  if (form) {
    const statusEl = $('#quote-status');
    const successEl = $('#quote-success');
    const successText = $('#quote-success-text');
    const submitBtn = $('#quote-submit');

    form.addEventListener('submit', async e => {
      e.preventDefault();
      statusEl.textContent = '';

      // native validation with a readable message instead of silent failure
      if (!form.reportValidity()) return;

      const data = {};
      new FormData(form).forEach((v, k) => { data[k] = String(v).trim().slice(0, 2000); });

      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';
      let mode = 'demo';
      try {
        if (configured) {
          await sbInsert(data);
          mode = 'live';
        } else {
          saveLocal(data);
        }
      } catch (err) {
        // network blocked or backend misconfigured — keep the enquiry anyway
        console.warn('Live submit failed, stored locally:', err);
        saveLocal(data);
      }
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send enquiry';

      successText.textContent = mode === 'live'
        ? 'Thank you — your enquiry is in our inbox. We will come back to you with a recommendation and price.'
        : 'Thank you — your enquiry has been recorded in this preview (demo mode: it is stored in this browser and shown on the staff inbox page here). Once the site’s database is connected, enquiries reach STANFLEX directly.';
      form.hidden = true;
      successEl.hidden = false;
      successEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    $('#quote-again').addEventListener('click', () => {
      form.reset();
      form.hidden = false;
      successEl.hidden = true;
    });
  }

  /* =========================================================
     STAFF INBOX (admin.html)
     ========================================================= */
  const adminRoot = $('#admin-root');
  if (adminRoot) {
    const banner = $('#admin-banner');
    const loginForm = $('#admin-login');
    const loginStatus = $('#login-status');
    const toolbar = $('#admin-toolbar');
    const countEl = $('#admin-count');
    const listEl = $('#enquiry-list');

    const esc = s => String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    function render(rows, demo) {
      countEl.textContent = rows.length
        ? rows.length + ' enquir' + (rows.length === 1 ? 'y' : 'ies')
        : 'No enquiries yet';
      listEl.innerHTML = rows.map(r => {
        const specs = [
          ['NB / line size', r.nb_size], ['Medium', r.medium],
          ['Pressure', r.pressure], ['Temperature', r.temperature],
          ['Movement', r.movement], ['Quantity', r.quantity]
        ].filter(p => p[1]);
        const when = r.created_at
          ? new Date(r.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
          : '';
        return '<article class="enquiry-card">' +
          '<header><h3>' + esc(r.name || 'Unnamed') +
          (r.company ? ' <span class="enq-company">· ' + esc(r.company) + '</span>' : '') +
          '</h3><time>' + esc(when) + (demo ? ' · this browser' : '') + '</time></header>' +
          '<p class="enq-contact">' +
          (r.email ? '<a href="mailto:' + esc(r.email) + '">' + esc(r.email) + '</a>' : '') +
          (r.phone ? ' · <a href="tel:' + esc(r.phone) + '">' + esc(r.phone) + '</a>' : '') + '</p>' +
          (specs.length
            ? '<dl class="enq-specs">' + specs.map(p =>
                '<div><dt>' + p[0] + '</dt><dd>' + esc(p[1]) + '</dd></div>').join('') + '</dl>'
            : '') +
          (r.message ? '<p class="enq-message">' + esc(r.message) + '</p>' : '') +
          '</article>';
      }).join('');
    }

    async function showInbox(token) {
      loginForm.hidden = true;
      toolbar.hidden = false;
      try {
        render(await sbList(token), false);
      } catch (err) {
        if (err.auth) { // token expired — back to sign-in
          sessionStorage.removeItem(SS_SESSION);
          toolbar.hidden = true;
          loginForm.hidden = false;
          loginStatus.textContent = 'Session expired — please sign in again.';
        } else {
          countEl.textContent = '';
          listEl.innerHTML = '<p class="notice">Could not load enquiries: ' + esc(err.message) + '</p>';
        }
      }
    }

    function showDemo() {
      banner.hidden = false;
      banner.textContent = 'Demo mode — the database is not connected yet, so this inbox shows enquiries submitted from this browser only. Follow SETUP-SUPABASE.md to go live.';
      toolbar.hidden = false;
      $('#admin-signout').hidden = true;
      render(localEnquiries(), true);
    }

    if (!configured) {
      showDemo();
      // SPA bundle: re-read storage each time the admin route is opened,
      // so an enquiry submitted moments ago shows up without a reload
      addEventListener('stanflex-route', e => {
        if (e.detail.route === 'admin') render(localEnquiries(), true);
      });
    } else {
      const saved = sessionStorage.getItem(SS_SESSION);
      if (saved) showInbox(saved);
      else loginForm.hidden = false;

      loginForm.addEventListener('submit', async e => {
        e.preventDefault();
        loginStatus.textContent = 'Signing in…';
        const fd = new FormData(loginForm);
        try {
          const token = await sbSignIn(fd.get('email'), fd.get('password'));
          sessionStorage.setItem(SS_SESSION, token);
          loginStatus.textContent = '';
          showInbox(token);
        } catch (err) {
          loginStatus.textContent = err.message === 'Failed to fetch'
            ? 'Could not reach the database (network blocked here?). Try from the deployed site.'
            : err.message;
        }
      });

      $('#admin-signout').addEventListener('click', () => {
        sessionStorage.removeItem(SS_SESSION);
        listEl.innerHTML = '';
        countEl.textContent = '';
        toolbar.hidden = true;
        loginForm.hidden = false;
      });
    }

    $('#admin-refresh').addEventListener('click', () => {
      if (!configured) render(localEnquiries(), true);
      else showInbox(sessionStorage.getItem(SS_SESSION));
    });
  }
})();
