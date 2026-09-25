// Menu de navegação no mobile.
document.addEventListener('click', (e) => {
  const toggle = e.target.closest('.topbar__toggle');
  if (!toggle) return;

  const nav = document.querySelector('.topbar__nav');
  const open = nav.dataset.open === 'true';
  nav.dataset.open = String(!open);
  toggle.setAttribute('aria-expanded', String(!open));
});

// Iframes de dashboards web: renderizados em 1440px e reduzidos para caber.
if ('ResizeObserver' in window) {
  const ro = new ResizeObserver((entries) => {
    entries.forEach(({ target }) => {
      target.style.setProperty('--embed-scale', target.clientWidth / 1440);
    });
  });
  document.querySelectorAll('.embed--scaled').forEach((el) => ro.observe(el));
}

// Sidebar de competências: destaca o item correspondente à seção lida.
(() => {
  const sections = document.querySelectorAll('.story__section');
  const links = document.querySelectorAll('.story__nav-link');
  if (!sections.length || !links.length) return;

  const setActive = (id) => {
    links.forEach((link) => {
      const active = link.getAttribute('href') === `#${id}`;
      link.classList.toggle('is-active', active);
      if (!active) return;

      const list = link.closest('ul');
      if (list && list.scrollWidth > list.clientWidth) {
        const target = link.offsetLeft - (list.clientWidth - link.clientWidth) / 2;
        list.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
      }
    });
  };

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) setActive(entry.target.id);
      });
    },
    { rootMargin: '-40% 0px -55% 0px', threshold: 0 }
  );

  sections.forEach((section) => observer.observe(section));
})();
