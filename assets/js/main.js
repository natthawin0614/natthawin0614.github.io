/* ============================================================
   Portfolio — interactions
   ============================================================ */
(function () {
  'use strict';

  var root = document.documentElement;

  /* ---------- Theme toggle (persisted + system aware) ---------- */
  var STORAGE_KEY = 'nt-theme';
  var toggle = document.getElementById('themeToggle');

  function applyTheme(theme) {
    if (theme === 'light' || theme === 'dark') {
      root.setAttribute('data-theme', theme);
    } else {
      root.removeAttribute('data-theme'); // fall back to system
    }
  }

  var saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) {}
  applyTheme(saved || 'light'); // default site look is light/cream

  if (toggle) {
    toggle.addEventListener('click', function () {
      var current = root.getAttribute('data-theme');
      if (!current) {
        // currently following system — pick the opposite of what's shown
        current = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      var next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try { localStorage.setItem(STORAGE_KEY, next); } catch (e) {}
    });
  }

  /* ---------- Nav shadow on scroll ---------- */
  var nav = document.getElementById('nav');
  function onScroll() {
    if (window.scrollY > 12) nav.classList.add('scrolled');
    else nav.classList.remove('scrolled');
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Mobile menu ---------- */
  var navToggle = document.getElementById('navToggle');
  var sheet = document.getElementById('mobileSheet');
  function closeSheet() { sheet.classList.remove('open'); document.body.style.overflow = ''; }
  if (navToggle && sheet) {
    navToggle.addEventListener('click', function () {
      var open = sheet.classList.toggle('open');
      document.body.style.overflow = open ? 'hidden' : '';
    });
    sheet.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', closeSheet);
    });
  }

  /* ---------- Scroll reveal ---------- */
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach(function (el, i) {
      // small stagger for grids
      el.style.transitionDelay = (Math.min(i % 4, 3) * 60) + 'ms';
      io.observe(el);
    });
  } else {
    reveals.forEach(function (el) { el.classList.add('in'); });
  }

  /* ---------- Lightbox ---------- */
  var lb = document.getElementById('lightbox');
  var lbImg = document.getElementById('lbImg');
  var lbCap = document.getElementById('lbCap');
  var items = Array.prototype.slice.call(document.querySelectorAll('[data-full]'));
  var current = 0;

  function openAt(i) {
    current = (i + items.length) % items.length;
    var el = items[current];
    lbImg.src = el.getAttribute('data-full');
    lbImg.alt = el.getAttribute('data-cap') || '';
    lbCap.textContent = el.getAttribute('data-cap') || '';
    lb.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeLb() { lb.classList.remove('open'); document.body.style.overflow = ''; lbImg.src = ''; }

  items.forEach(function (el, i) {
    el.addEventListener('click', function () { openAt(i); });
  });

  document.getElementById('lbClose').addEventListener('click', closeLb);
  document.getElementById('lbPrev').addEventListener('click', function () { openAt(current - 1); });
  document.getElementById('lbNext').addEventListener('click', function () { openAt(current + 1); });
  lb.addEventListener('click', function (e) { if (e.target === lb) closeLb(); });
  document.addEventListener('keydown', function (e) {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') closeLb();
    else if (e.key === 'ArrowLeft') openAt(current - 1);
    else if (e.key === 'ArrowRight') openAt(current + 1);
  });

  /* ---------- Footer year ---------- */
  var yearEls = document.querySelectorAll('[data-year]');
  yearEls.forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
