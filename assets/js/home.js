// Interações da nova home (Aurora Bento). Só roda em index.html,
// onde existe #hb-page; nas outras páginas este arquivo não é incluído.
(() => {
  const page = document.getElementById('hb-page');
  if (!page) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- utilitário genérico de abas (botão + painel por data-key) ----------
  function wireTabs({ buttons, panels, onSelect }) {
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        buttons.forEach((b) => {
          const active = b === btn;
          b.classList.toggle('is-on', active);
          if (b.hasAttribute('aria-pressed')) b.setAttribute('aria-pressed', String(active));
          if (b.hasAttribute('aria-expanded')) b.setAttribute('aria-expanded', String(active));
        });
        panels.forEach((p) => {
          p.hidden = p.dataset.key !== key;
        });
        if (onSelect) onSelect(key);
      });
    });
  }

  // Competências
  wireTabs({
    buttons: Array.from(page.querySelectorAll('.hb-ctiles .hb-ctile')),
    panels: Array.from(page.querySelectorAll('[data-skill-panel]')).map((el) => {
      el.dataset.key = el.dataset.skillPanel;
      return el;
    }),
  });
  page.querySelectorAll('.hb-ctiles .hb-ctile').forEach((b) => { b.dataset.key = b.dataset.skill; });

  // ---------- Depoimentos: seleção por avatar, setas e avanço automático ----------
  const testAvatars = Array.from(page.querySelectorAll('.hb-tav'));
  const testDots = Array.from(page.querySelectorAll('.hb-qdot'));
  const testPanels = Array.from(page.querySelectorAll('[data-test-panel]'));
  const total = testPanels.length;
  let current = 0;
  let userInteracted = false;

  function showTestimonial(i) {
    current = ((i % total) + total) % total;
    testAvatars.forEach((el, idx) => el.classList.toggle('is-on', idx === current));
    testDots.forEach((el, idx) => el.classList.toggle('is-on', idx === current));
    testPanels.forEach((el, idx) => { el.hidden = idx !== current; });
  }

  testAvatars.forEach((el, idx) => el.addEventListener('click', () => { userInteracted = true; showTestimonial(idx); }));
  testDots.forEach((el, idx) => el.addEventListener('click', () => { userInteracted = true; showTestimonial(idx); }));
  const prevBtn = page.querySelector('#hb-q-prev');
  const nextBtn = page.querySelector('#hb-q-next');
  if (prevBtn) prevBtn.addEventListener('click', () => { userInteracted = true; showTestimonial(current - 1); });
  if (nextBtn) nextBtn.addEventListener('click', () => { userInteracted = true; showTestimonial(current + 1); });

  if (total > 1 && !reduceMotion) {
    setInterval(() => {
      if (userInteracted) return;
      showTestimonial(current + 1);
    }, 8000);
  }

  // ---------- Lightbox de projetos: abre o dashboard interativo em 95% da tela ----------
  const lightbox = page.querySelector('#hb-lightbox');
  if (lightbox) {
    const frame = lightbox.querySelector('iframe');
    const titleEl = lightbox.querySelector('.hb-lightbox-title');
    let lastFocused = null;

    const openLightbox = (src, title) => {
      lastFocused = document.activeElement;
      frame.src = src;
      titleEl.textContent = title || '';
      lightbox.hidden = false;
      document.documentElement.style.overflow = 'hidden';
      lightbox.querySelector('.hb-lightbox-close').focus();
    };
    const closeLightbox = () => {
      lightbox.hidden = true;
      frame.src = 'about:blank';
      document.documentElement.style.overflow = '';
      if (lastFocused) lastFocused.focus();
    };

    page.querySelectorAll('[data-embed]').forEach((btn) => {
      btn.addEventListener('click', () => openLightbox(btn.dataset.embed, btn.dataset.embedTitle));
    });
    lightbox.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', closeLightbox));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !lightbox.hidden) closeLightbox();
    });
  }

  // ---------- Certificações: setas do carrossel de cada prateleira ----------
  page.querySelectorAll('.hb-shelf-scroll').forEach((scroller) => {
    const row = scroller.querySelector('.hb-shelf-row');
    const prev = scroller.querySelector('.hb-shelf-arrow--prev');
    const next = scroller.querySelector('.hb-shelf-arrow--next');
    if (!row || !prev || !next) return;
    const step = () => Math.max(row.clientWidth * 0.9, 240);
    const update = () => {
      prev.disabled = row.scrollLeft <= 4;
      next.disabled = row.scrollLeft >= row.scrollWidth - row.clientWidth - 4;
    };
    prev.addEventListener('click', () => row.scrollBy({ left: -step(), behavior: 'smooth' }));
    next.addEventListener('click', () => row.scrollBy({ left: step(), behavior: 'smooth' }));
    row.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    update();
  });

  // ---------- CTA holofote: gradiente segue o mouse ----------
  const spot = page.querySelector('#hb-spotlight');
  if (spot && !reduceMotion) {
    spot.addEventListener('mousemove', (e) => {
      const r = spot.getBoundingClientRect();
      if (!r.width || !r.height) return;
      spot.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(2) + '%');
      spot.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(2) + '%');
    });
  }
})();
