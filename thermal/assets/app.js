/* ============================================================
   Thermal & Statistics Physics — ชุดทบทวนสอบกลางภาค
   ปรับขนาดตัวอักษร · ธีม · บันทึกความคืบหน้า · ค้นหา
   ============================================================ */
(function () {
  'use strict';

  /* ---------- localStorage แบบปลอดภัย (เผื่อเปิดจาก file:// แล้วถูกบล็อก) ---------- */
  var mem = {};
  var store = {
    get: function (k) {
      try { return localStorage.getItem(k); } catch (e) { return mem[k] !== undefined ? mem[k] : null; }
    },
    set: function (k, v) {
      try { localStorage.setItem(k, v); } catch (e) { mem[k] = v; }
    }
  };

  var root = document.documentElement;

  /* ---------- วัดความสูงแถบบนจริง แล้วส่งให้ CSS ----------
     แถบบนสูงขึ้นตามขนาดตัวอักษร ถ้า hardcode ไว้ ช่องค้นหาจะถูกบัง
     และการกดสารบัญจะกระโดดไปหยุดใต้แถบบน */
  function syncHeaderHeight() {
    var h = document.querySelector('header.top');
    if (h) root.style.setProperty('--hdr', Math.round(h.getBoundingClientRect().height) + 'px');
  }
  window.addEventListener('resize', syncHeaderHeight);

  /* ============================================================
     1. ขนาดตัวอักษร  (A−  A  A+)  — ช่วง 85% ถึง 200%
     ============================================================ */
  var STEPS = [0.85, 0.925, 1.0, 1.1, 1.2, 1.35, 1.5, 1.7, 2.0];
  var fsIndex = parseInt(store.get('tp_fs'), 10);
  if (isNaN(fsIndex) || fsIndex < 0 || fsIndex >= STEPS.length) fsIndex = 2;

  function applyFontSize() {
    root.style.setProperty('--fs', STEPS[fsIndex]);
    store.set('tp_fs', fsIndex);
    var lbl = document.getElementById('fsLabel');
    if (lbl) lbl.textContent = Math.round(STEPS[fsIndex] * 100) + '%';
    // แถบบนสูงเปลี่ยนตามขนาดตัวอักษร ต้องวัดใหม่ทุกครั้ง
    requestAnimationFrame(syncHeaderHeight);
  }
  function bumpFont(dir) {
    fsIndex = Math.max(0, Math.min(STEPS.length - 1, fsIndex + dir));
    applyFontSize();
  }
  applyFontSize();

  /* ============================================================
     2. ธีม สว่าง / มืด / ตามระบบ
     ============================================================ */
  var THEMES = ['auto', 'light', 'dark'];
  var THEME_LABEL = { auto: 'ตามระบบ', light: 'สว่าง', dark: 'มืด' };
  var theme = store.get('tp_theme') || 'auto';

  function applyTheme() {
    if (theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    store.set('tp_theme', theme);
    var b = document.getElementById('themeBtn');
    if (b) b.textContent = THEME_LABEL[theme];
  }
  function cycleTheme() {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    applyTheme();
  }
  applyTheme();

  /* ============================================================
     3. บันทึกว่าทำข้อไหนไปแล้ว
     ============================================================ */
  function doneKey(id) { return 'tp_done_' + id; }

  function markProblem(el, on) {
    el.classList.toggle('done', on);
    var id = el.id;
    store.set(doneKey(id), on ? '1' : '0');
    document.querySelectorAll('.tocgrid a[href="#' + id + '"]').forEach(function (a) {
      a.classList.toggle('done', on);
    });
    updateCounter();
  }

  function updateCounter() {
    var probs = document.querySelectorAll('details.prob[id]');
    if (!probs.length) return;
    var done = document.querySelectorAll('details.prob.done').length;
    var c = document.getElementById('progCount');
    if (c) c.textContent = done + ' / ' + probs.length;
  }

  function initProgress() {
    document.querySelectorAll('details.prob[id]').forEach(function (p) {
      var was = store.get(doneKey(p.id)) === '1';
      if (was) {
        p.classList.add('done');
        document.querySelectorAll('.tocgrid a[href="#' + p.id + '"]').forEach(function (a) {
          a.classList.add('done');
        });
      }
      var box = p.querySelector('.chk input[type="checkbox"]');
      if (box) {
        box.checked = was;
        box.addEventListener('click', function (e) { e.stopPropagation(); });
        box.addEventListener('change', function () { markProblem(p, box.checked); });
      }
      // กันไม่ให้กดที่ label แล้วไปพับ/กาง details
      var lab = p.querySelector('.chk');
      if (lab) lab.addEventListener('click', function (e) { e.stopPropagation(); });
    });
    updateCounter();
  }

  /* ============================================================
     4. กาง / พับ ทั้งหมด
     ============================================================ */
  var allOpen = true;
  function toggleAll() {
    allOpen = !allOpen;
    document.querySelectorAll('details.prob').forEach(function (d) { d.open = allOpen; });
    var b = document.getElementById('toggleAll');
    if (b) b.textContent = allOpen ? 'พับทั้งหมด' : 'กางทั้งหมด';
  }

  /* ============================================================
     5. ค้นหา / กรองข้อ
     ============================================================ */
  function initSearch() {
    var input = document.getElementById('searchBox');
    if (!input) return;

    // กล่องแจ้งเมื่อค้นหาไม่พบ (เดิมหน้าจะว่างเปล่าเฉย ๆ)
    var none = document.createElement('div');
    none.className = 'noresult';
    none.id = 'noResult';
    var bar = document.querySelector('.searchbar');
    if (bar && bar.parentNode) bar.parentNode.insertBefore(none, bar.nextSibling);

    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      var shownSections = {};
      var hits = 0;
      document.querySelectorAll('details.prob').forEach(function (p) {
        var hit = !q || p.textContent.toLowerCase().indexOf(q) !== -1;
        p.classList.toggle('hidden', !hit);
        if (hit) {
          hits++;
          var s = p.closest('section');
          if (s) shownSections[s.id] = true;
        }
      });
      // ซ่อนหัวข้อที่ไม่มีข้อเหลืออยู่เลย
      document.querySelectorAll('section[data-group]').forEach(function (s) {
        s.classList.toggle('hidden', !!q && !shownSections[s.id]);
      });
      // สารบัญก็ควรซ่อนตอนกำลังค้นหา
      var toc = document.getElementById('toc');
      if (toc) toc.classList.toggle('hidden', !!q);

      none.classList.toggle('show', !!q && hits === 0);
      if (q && hits === 0) {
        none.innerHTML = 'ไม่พบข้อที่ตรงกับ <b>“' + q.replace(/[<>&]/g, '') +
          '”</b><br>ลองใช้คำสั้นลง หรือค้นด้วยรหัสโจทย์ เช่น <b>P3-21</b> หรือหมายเลข <b>HW1-15</b>';
      }
    });
  }

  /* ============================================================
     6. เชื่อมปุ่มและคีย์ลัด
     ============================================================ */
  function bind(id, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  }

  document.addEventListener('DOMContentLoaded', function () {
    bind('fsUp', function () { bumpFont(1); });
    bind('fsDown', function () { bumpFont(-1); });
    bind('themeBtn', cycleTheme);
    bind('toggleAll', toggleAll);
    bind('printBtn', function () { window.print(); });

    applyFontSize();
    applyTheme();
    initProgress();
    initSearch();
    syncHeaderHeight();
    // ฟอนต์ระบบอาจโหลดเสร็จทีหลัง ทำให้ความสูงแถบบนเปลี่ยน
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(syncHeaderHeight);

    // ทำเครื่องหมายลิงก์หน้าปัจจุบัน
    var here = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('nav.pages a').forEach(function (a) {
      if (a.getAttribute('href') === here) a.classList.add('on');
    });

    // กางเฉลยทั้งหมดก่อนสั่งพิมพ์
    window.addEventListener('beforeprint', function () {
      document.querySelectorAll('details.prob').forEach(function (d) { d.open = true; });
    });
  });

  // คีย์ลัด:  Ctrl +  /  Ctrl −  ปรับขนาด,  /  โฟกัสช่องค้นหา
  document.addEventListener('keydown', function (e) {
    var typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
    if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); bumpFont(1); }
    else if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); bumpFont(-1); }
    else if (e.key === '/' && !typing) {
      var s = document.getElementById('searchBox');
      if (s) { e.preventDefault(); s.focus(); }
    }
  });
})();
