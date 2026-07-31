/* ==========================================================================
   STANFLEX — UI logic (multi-page)
   --------------------------------------------------------------------------
   Every feature block guards on its own elements, so this single file safely
   serves all pages (index, lab, range, quote, admin, …). The quote form and
   staff inbox live in js/enquiries.js.

   SPA note: the single-file artifact bundle sets body[data-spa] and swaps
   "pages" client-side. In that mode scroll-triggered reveals are replaced by
   an instant show + route transition (see initAnimations), and one-shot
   animations re-run when their route first becomes visible via the
   'stanflex-route' event dispatched by the bundle's router.
   ========================================================================== */
(function () {
  'use strict';

  const D = window.STANFLEX_DATA;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const prefersReducedMotion =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SPA = !!document.body.dataset.spa;

  /* ================= Header & mobile nav ================= */
  const header = $('#site-header');
  const nav = $('#site-nav');
  const navToggle = $('#nav-toggle');

  if (header) {
    addEventListener('scroll', () => {
      header.classList.toggle('is-scrolled', scrollY > 12);
    }, { passive: true });
  }
  if (navToggle && nav) {
    navToggle.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(open));
    });
    nav.addEventListener('click', e => {
      if (e.target.closest('a')) {
        nav.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ================= Scroll animations ================= */
  function drawCorrugation(immediateDelay) {
    const plyPath = $('#corr-ply-outer');
    if (!plyPath) return;
    const len = plyPath.getTotalLength();
    $$('.c-ply').forEach((el, i) => {
      el.style.strokeDasharray = len;
      el.style.strokeDashoffset = len;
      gsap.to(el, immediateDelay !== undefined
        ? { strokeDashoffset: 0, duration: 1.8, delay: immediateDelay + i * 0.25, ease: 'power2.inOut' }
        : {
            strokeDashoffset: 0, duration: 1.8, delay: i * 0.25, ease: 'power2.inOut',
            scrollTrigger: { trigger: '.corrugation-fig', start: 'top 80%', once: true }
          });
    });
  }

  function runCounters(withScrollTrigger) {
    $$('.count').forEach(el => {
      const end = Number(el.dataset.count);
      const vars = {
        textContent: end, duration: 1.6, ease: 'power1.out',
        snap: { textContent: 1 }
      };
      if (withScrollTrigger) {
        vars.scrollTrigger = { trigger: el, start: 'top 92%', once: true };
      }
      gsap.fromTo(el, { textContent: 0 }, vars);
    });
  }

  if (window.gsap && !prefersReducedMotion && !SPA) {
    gsap.registerPlugin(ScrollTrigger);
    document.body.classList.add('gsap-ready'); // CSS may now hide pre-reveal

    $$('.reveal').forEach(el => {
      gsap.fromTo(el,
        { y: 30, opacity: 0 },
        {
          y: 0, opacity: 1, duration: 0.8, ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 88%', once: true },
          onStart: () => el.classList.add('is-shown')
        });
    });

    $$('[data-stagger]').forEach(wrap => {
      const items = Array.from(wrap.children);
      gsap.fromTo(items,
        { y: 26, opacity: 0 },
        {
          y: 0, opacity: 1, duration: 0.65, ease: 'power3.out', stagger: 0.09,
          scrollTrigger: { trigger: wrap, start: 'top 88%', once: true },
          onStart: () => items.forEach(i => i.classList.add('is-shown'))
        });
    });

    if ($('.hero-title')) {
      gsap.from('.hero-title .line', {
        y: 60, opacity: 0, duration: 1, ease: 'power4.out', stagger: 0.12, delay: 0.15
      });
    }

    runCounters(true);
    drawCorrugation();
  } else if (window.gsap && !prefersReducedMotion && SPA) {
    // SPA bundle: routes appear instantly (CSS transition on the route
    // container). One-shot animations fire when their route first shows.
    if ($('.hero-title')) {
      gsap.from('.hero-title .line', {
        y: 60, opacity: 0, duration: 1, ease: 'power4.out', stagger: 0.12, delay: 0.15
      });
    }
    runCounters(false);
    let corrDone = false;
    addEventListener('stanflex-route', e => {
      if (e.detail.route === 'engineering' && !corrDone) {
        corrDone = true;
        drawCorrugation(0.2);
      }
    });
  } else {
    $$('.count').forEach(el => { el.textContent = el.dataset.count; });
  }

  /* ================= Range table (range.html) ================= */
  const tbody = $('#range-table tbody');
  if (tbody && D) {
    const nbFilter = $('#nb-filter');
    const searchBox = $('#range-search');
    const countOut = $('#range-count');
    const pressureWord = $('#range-pressure-word');
    let series = 'p6';

    const fmt = n => n.toLocaleString('en-IN');

    function populateNbFilter() {
      const nbs = [...new Set(D[series].map(r => r[1]))];
      const current = nbFilter.value;
      nbFilter.length = 1; // keep the "All" option
      nbs.forEach(nb => nbFilter.add(new Option('NB ' + nb + ' mm', nb)));
      if ([...nbFilter.options].some(o => o.value === current)) nbFilter.value = current;
    }

    function renderTable() {
      const nb = nbFilter.value;
      const q = searchBox.value.trim().toLowerCase();
      const rows = D[series].filter(r =>
        (!nb || String(r[1]) === nb) &&
        (!q || r[0].toLowerCase().includes(q)));

      let lastNb = null;
      tbody.innerHTML = rows.map(r => {
        const first = r[1] !== lastNb;
        lastNb = r[1];
        return '<tr' + (first ? ' class="nb-first"' : '') + '>' +
          '<td>' + r[0] + '</td>' +
          r.slice(1).map(fmt).map(v => '<td>' + v + '</td>').join('') +
          '</tr>';
      }).join('');
      countOut.textContent = rows.length + ' of ' + D[series].length + ' joints shown';
    }

    $('#pressure-seg').addEventListener('click', e => {
      const btn = e.target.closest('button[data-series]');
      if (!btn) return;
      series = btn.dataset.series;
      $$('#pressure-seg button').forEach(b => b.classList.toggle('is-active', b === btn));
      pressureWord.textContent = series === 'p6' ? '6' : '10';
      populateNbFilter();
      renderTable();
    });
    nbFilter.addEventListener('change', renderTable);
    searchBox.addEventListener('input', renderTable);
    populateNbFilter();
    renderTable();
  }

  /* ================= Support spacing table (installation.html) ========== */
  const supportBody = $('#support-table tbody');
  if (supportBody && D) {
    supportBody.innerHTML = D.supportSpacing.map(r =>
      '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td><td>' + r[2] +
      '</td><td>' + r[3].toFixed(1) + '</td></tr>'
    ).join('');
  }

  /* ================= Segmented buttons: expose state to AT ================ */
  // .is-active is visual only; mirror it as aria-pressed and keep the two in
  // sync on every click (covers lab config/ends/plies and range pressure segs)
  $$('.seg').forEach(seg => {
    const sync = () => $$('button', seg).forEach(b =>
      b.setAttribute('aria-pressed', String(b.classList.contains('is-active'))));
    sync();
    seg.addEventListener('click', () => requestAnimationFrame(sync));
  });

  /* ================= Range sliders: orange fill tracks the thumb ========= */
  function paintRange(input) {
    const min = Number(input.min), max = Number(input.max), v = Number(input.value);
    const pct = ((v - min) / (max - min)) * 100;
    input.style.background =
      'linear-gradient(to right, var(--orange) ' + pct + '%, var(--line-dark) ' + pct + '%)';
  }
  $$('input[type="range"]').forEach(r => {
    paintRange(r);
    r.addEventListener('input', () => paintRange(r));
  });

  /* ================= 3D lab controls (lab.html) ================= */
  function bindLab() {
    const api = window.STANFLEX3D;
    if (!api || !api.ok || !$('#cfg-seg')) return;

    const cfgSeg = $('#cfg-seg');
    const endsSeg = $('#ends-seg');
    const pliesSeg = $('#plies-seg');
    const convRange = $('#conv-range');
    const convOut = $('#conv-out');
    const moveRange = $('#move-range');
    const moveOut = $('#move-out');
    const moveLabel = $('#move-label');
    const cutCheck = $('#cutaway-check');
    const cycleBtn = $('#cycle-btn');
    const note = $('#cfg-note');
    const hudName = $('#lab-model-name');

    let config = 'axial';
    let ends = 'flanged';

    function setActive(seg, btn) {
      $$('button', seg).forEach(b => b.classList.toggle('is-active', b === btn));
    }
    function updateHud() {
      hudName.textContent = D.configTitles[config] + ' · ' +
        (ends === 'flanged' ? 'flanged ends' : 'weld ends');
    }
    function stopCycle() {
      if (cycleBtn.getAttribute('aria-pressed') === 'true') {
        cycleBtn.setAttribute('aria-pressed', 'false');
        cycleBtn.textContent = '▶ Run movement cycle';
        api.setCycle(false);
        moveRange.value = 0;
        moveOut.textContent = '0%';
        paintRange(moveRange);
      }
    }
    function applyConfig(c) {
      const btn = $('#cfg-seg button[data-cfg="' + c + '"]');
      if (!btn) return;
      config = c;
      setActive(cfgSeg, btn);
      stopCycle();
      api.setConfig(config);
      api.setMovement(0);
      moveRange.value = 0; moveOut.textContent = '0%'; paintRange(moveRange);
      moveLabel.textContent = D.moveLabels[config];
      note.textContent = D.configNotes[config];
      updateHud();
    }

    cfgSeg.addEventListener('click', e => {
      const btn = e.target.closest('button[data-cfg]');
      if (btn) applyConfig(btn.dataset.cfg);
    });

    endsSeg.addEventListener('click', e => {
      const btn = e.target.closest('button[data-ends]');
      if (!btn) return;
      ends = btn.dataset.ends;
      setActive(endsSeg, btn);
      api.setEnds(ends);
      updateHud();
    });

    pliesSeg.addEventListener('click', e => {
      const btn = e.target.closest('button[data-plies]');
      if (!btn) return;
      setActive(pliesSeg, btn);
      api.setPlies(Number(btn.dataset.plies));
    });

    convRange.addEventListener('input', () => {
      convOut.textContent = convRange.value;
      api.setConvolutions(Number(convRange.value));
    });

    moveRange.addEventListener('input', () => {
      stopCycle();
      moveOut.textContent = moveRange.value + '%';
      api.setMovement(Number(moveRange.value) / 100);
    });

    cutCheck.addEventListener('change', () => api.setCutaway(cutCheck.checked));

    cycleBtn.addEventListener('click', () => {
      const on = cycleBtn.getAttribute('aria-pressed') !== 'true';
      cycleBtn.setAttribute('aria-pressed', String(on));
      cycleBtn.textContent = on ? '■ Stop cycle' : '▶ Run movement cycle';
      api.setCycle(on);
    });

    api.onCycle(m => {
      moveRange.value = Math.round(m * 100);
      moveOut.textContent = Math.round(m * 100) + '%';
      paintRange(moveRange);
    });

    $('#lab-reset').addEventListener('click', () => api.resetView());

    // deep link: lab.html?cfg=universal (the SPA router forwards its own
    // hash query through the same event)
    const param = new URLSearchParams(location.search).get('cfg');
    if (param) applyConfig(param);
    addEventListener('stanflex-route', e => {
      if (e.detail.route === 'lab' && e.detail.query.get('cfg')) {
        applyConfig(e.detail.query.get('cfg'));
      }
    });
  }

  if (window.STANFLEX3D) bindLab();
  else addEventListener('stanflex3d-ready', bindLab, { once: true });
})();
