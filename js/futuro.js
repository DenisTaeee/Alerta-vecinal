/* AlertaVecinal · FUTURO 2026 · interactividad (cargar al final, después de enhancements.js) */
(function () {
  'use strict';
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* 1. Barra de progreso de scroll + topbar que reacciona */
  var bar = document.createElement('div');
  bar.className = 'fx-progress';
  document.body.appendChild(bar);
  function onScroll() {
    var h = document.documentElement;
    var max = h.scrollHeight - h.clientHeight;
    bar.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + '%';
    var tb = document.querySelector('.topbar');
    if (tb) tb.classList.toggle('is-scrolled', h.scrollTop > 12);
  }
  addEventListener('scroll', onScroll, { passive: true });

  /* 2. Revelado progresivo de tarjetas */
  var SEL = '.panel,.stat-card,.welcome-card,.quick-action,.incident-row,.notification-card,.page-heading,.police-banner';
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (e.isIntersecting) { e.target.classList.add('fx-in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.12 }) : null;

  /* 3. Contadores animados en los números grandes */
  function countUp(el) {
    var raw = el.textContent.trim();
    var n = parseFloat(raw.replace(/[^\d.]/g, ''));
    if (!isFinite(n) || reduce || el.dataset.counted) return;
    el.dataset.counted = '1';
    var suffix = raw.replace(/[\d.\s]/g, ''), t0 = performance.now(), dur = 900;
    (function tick(t) {
      var p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(n * e) + suffix;
      if (p < 1) requestAnimationFrame(tick); else el.textContent = raw;
    })(t0);
  }

  function enhance(root) {
    (root || document).querySelectorAll(SEL).forEach(function (el, i) {
      if (el.dataset.fx) return;
      el.dataset.fx = '1';
      if (reduce || !io) return;
      el.classList.add('fx-reveal');
      el.style.setProperty('--d', Math.min(i, 8) * 70 + 'ms');
      io.observe(el);
    });
    (root || document).querySelectorAll('.stat-value').forEach(countUp);
  }

  /* 4. Foco de luz que sigue al cursor + inclinación 3D suave */
  document.addEventListener('pointermove', function (ev) {
    var c = ev.target.closest && ev.target.closest('.panel,.stat-card,.quick-action');
    if (!c) return;
    var r = c.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
    c.style.setProperty('--mx', x + 'px');
    c.style.setProperty('--my', y + 'px');
    if (!reduce && c.classList.contains('stat-card')) {
      var rx = ((y / r.height) - 0.5) * -8, ry = ((x / r.width) - 0.5) * 8;
      c.style.transform = 'perspective(900px) rotateX(' + rx + 'deg) rotateY(' + ry + 'deg) translateY(-8px)';
    }
  }, { passive: true });
  document.addEventListener('pointerout', function (ev) {
    var c = ev.target.closest && ev.target.closest('.stat-card');
    if (c) c.style.transform = '';
  });

  /* 5. La app pinta con innerHTML: observar cambios y re-aplicar */
  function watch() {
    var pc = document.getElementById('pageContent');
    if (!pc) return;
    new MutationObserver(function () { enhance(pc); }).observe(pc, { childList: true });
    enhance(pc);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
  onScroll();
})();
