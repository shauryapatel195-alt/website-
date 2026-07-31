/* ==========================================================================
   STANFLEX — UI logic
   Navigation, GSAP scroll animations, catalogue table rendering/filtering,
   and the control bindings for the 3D lab (talks to window.STANFLEX3D,
   exposed by js/three-scene.js).

   Design decision: the page is fully readable with JavaScript disabled or
   failed — animations only *hide* elements after `gsap-ready` is set on
   <body>, and the tables/3D are progressive enhancements on top of the
   complete catalogue copy.
   ========================================================================== */
(function () {
  'use strict';

  const D = window.STANFLEX_DATA;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const prefersReducedMotion =
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ================= Header & mobile nav ================= */
  const header = $('#site-header');
  const nav = $('#site-nav');
  const navToggle = $('#nav-toggle');

  addEventListener('scroll', () => {
    header.classList.toggle('is-scrolled', scrollY > 12);
  }, { passive: true });

  navToggle.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    navToggle.setAttribute('aria-expanded', String(open));
  });
  nav.addEventListener('click', e => {
    if (e.target.matches('a')) {
      nav.classList.remove('is-open');
      navToggle.setAttribute('aria-expanded', 'false');
    }
  });

  // highlight the nav link of the section in view
  const sectionForLink = {};
  $$('.site-nav a').forEach(a => {
    const id = a.getAttribute('href').slice(1);
    const sec = document.getElementById(id);
    if (sec) sectionForLink[id] = a;
  });
  const navIO = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (en.isIntersecting && sectionForLink[en.target.id]) {
        $$('.site-nav a').forEach(a => a.classList.remove('is-active'));
        sectionForLink[en.target.id].classList.add('is-active');
      }
    });
  }, { rootMargin: '-40% 0px -55% 0px' });
  Object.keys(sectionForLink).forEach(id => navIO.observe(document.getElementById(id)));

  /* ================= GSAP scroll animations ================= */
  if (window.gsap && !prefersReducedMotion) {
    gsap.registerPlugin(ScrollTrigger);
    document.body.classList.add('gsap-ready'); // CSS may now hide pre-reveal

    // single-element reveals
    $$('.reveal').forEach(el => {
      gsap.fromTo(el,
        { y: 30, opacity: 0 },
        {
          y: 0, opacity: 1, duration: 0.8, ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 88%', once: true },
          onStart: () => el.classList.add('is-shown')
        });
    });

    // staggered child reveals (cards, chips, list items…)
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

    // hero headline: staggered rise of the two lines + sub
    gsap.from('.hero-title .line', {
      y: 60, opacity: 0, duration: 1, ease: 'power4.out', stagger: 0.12, delay: 0.15
    });

    // stat counters
    $$('.count').forEach(el => {
      const end = Number(el.dataset.count);
      gsap.fromTo(el, { textContent: 0 }, {
        textContent: end, duration: 1.6, ease: 'power1.out',
        snap: { textContent: 1 },
        scrollTrigger: { trigger: el, start: 'top 92%', once: true }
      });
    });

    // corrugation cross-section draws itself as it scrolls into view
    const plyPath = $('#corr-ply-outer');
    if (plyPath) {
      const len = plyPath.getTotalLength();
      $$('.c-ply').forEach((el, i) => {
        el.style.strokeDasharray = len;
        el.style.strokeDashoffset = len;
        gsap.to(el, {
          strokeDashoffset: 0, duration: 1.8, delay: i * 0.25, ease: 'power2.inOut',
          scrollTrigger: { trigger: '.corrugation-fig', start: 'top 80%', once: true }
        });
      });
    }
  } else {
    // no GSAP / reduced motion: everything stays visible, counters jump to value
    $$('.count').forEach(el => { el.textContent = el.dataset.count; });
  }

  /* ================= Range table ================= */
  const tbody = $('#range-table tbody');
  const nbFilter = $('#nb-filter');
  const searchBox = $('#range-search');
  const countOut = $('#range-count');
  const pressureWord = $('#range-pressure-word');
  let series = 'p6';

  function fmt(n) { return n.toLocaleString('en-IN'); }

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

  /* ================= Support spacing table ================= */
  $('#support-table tbody').innerHTML = D.supportSpacing.map(r =>
    '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td><td>' + r[2] +
    '</td><td>' + r[3].toFixed(1) + '</td></tr>'
  ).join('');

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

  /* ================= 3D lab controls ================= */
  function bindLab() {
    const api = window.STANFLEX3D;
    if (!api || !api.ok) return;

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

    cfgSeg.addEventListener('click', e => {
      const btn = e.target.closest('button[data-cfg]');
      if (!btn) return;
      config = btn.dataset.cfg;
      setActive(cfgSeg, btn);
      stopCycle();
      api.setConfig(config);
      api.setMovement(0);
      moveRange.value = 0; moveOut.textContent = '0%'; paintRange(moveRange);
      moveLabel.textContent = D.moveLabels[config];
      note.textContent = D.configNotes[config];
      updateHud();
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

    // the running cycle drives the slider so the UI mirrors the model
    api.onCycle(m => {
      moveRange.value = Math.round(m * 100);
      moveOut.textContent = Math.round(m * 100) + '%';
      paintRange(moveRange);
    });

    $('#lab-reset').addEventListener('click', () => api.resetView());

    // configuration cards: jump into the lab with the matching model loaded
    $$('.config-card').forEach(card => {
      const open = $('.cfg-open', card);
      if (!open) return;
      open.addEventListener('click', () => {
        const cfg = card.dataset.lab;
        const btn = $('#cfg-seg button[data-cfg="' + cfg + '"]');
        if (btn) btn.click();
        document.getElementById('lab').scrollIntoView({
          behavior: prefersReducedMotion ? 'auto' : 'smooth'
        });
      });
    });
  }

  if (window.STANFLEX3D) bindLab();
  else addEventListener('stanflex3d-ready', bindLab, { once: true });
})();
