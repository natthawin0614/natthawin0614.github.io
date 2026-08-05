/* app.js - หน้าจอทั้งหมดของเวอร์ชันเว็บ  ใช้ morph.js + gridreader.js */
(function () {
  'use strict';
  const M = window.Morph, GR = window.GridReader;
  const $ = id => document.getElementById(id);

  const state = {
    rows: 10, cols: 13,
    se: [[0, 1, 0], [1, 0, 1], [0, 1, 0]],
    reflect: false
  };

  const css = k => getComputedStyle(document.documentElement).getPropertyValue(k).trim();

  // ============================================================ ตารางบน canvas

  class GridView {
    constructor(canvasId, metaId, titleId, editable) {
      this.cv = $(canvasId); this.meta = $(metaId); this.title = $(titleId);
      this.editable = editable;
      this.img = M.empty(state.rows, state.cols);
      this.marks = new Set();
      if (editable) this._bind();
      window.addEventListener('resize', () => this.draw());
    }

    /** เส้นแบ่งแกน ตาราง 13 หลักได้เส้นที่ 7 คือขอบขวาของช่องที่ 7 เหมือนแบบฝึกหัด */
    dividerCol() { return (this.cols + 1) >> 1; }
    get rows() { return this.img.length; }
    get cols() { return this.img[0].length; }

    setImage(img, marks, title) {
      this.img = M.clone(img);
      this.marks = new Set((marks || []).map(p => p[0] + ',' + p[1]));
      if (title !== undefined) this.title.textContent = title;
      this.draw();
    }
    getImage() { return M.clone(this.img); }
    resize(rows, cols) { this.img = M.empty(rows, cols); this.marks = new Set(); this.draw(); }

    _geom() {
      const pad = 20;
      const w = this.cv.clientWidth || 300;
      const cell = Math.max(9, Math.floor((w - pad - 2) / this.cols));
      return { pad, cell, w: pad + cell * this.cols + 2, h: pad + cell * this.rows + 2 };
    }

    _cellAt(ev) {
      const r = this.cv.getBoundingClientRect();
      const g = this._geom();
      const scale = g.w / r.width;                 // canvas ถูก CSS ย่อ ต้องแปลงพิกัดกลับ
      const x = (ev.clientX - r.left) * scale, y = (ev.clientY - r.top) * scale;
      const c = Math.floor((x - g.pad) / g.cell), rr = Math.floor((y - g.pad) / g.cell);
      return (rr >= 0 && rr < this.rows && c >= 0 && c < this.cols) ? [rr, c] : null;
    }

    _bind() {
      let painting = false, val = 1;
      const set = p => { if (p && this.img[p[0]][p[1]] !== val) { this.img[p[0]][p[1]] = val; this.draw(); } };
      this.cv.addEventListener('pointerdown', e => {
        const p = this._cellAt(e); if (!p) return;
        e.preventDefault();
        val = this.img[p[0]][p[1]] ? 0 : 1;       // แตะช่องดำ = ลบ  แตะช่องขาว = ระบาย
        painting = true; this.marks.clear(); set(p);
        this.cv.setPointerCapture(e.pointerId);
      });
      this.cv.addEventListener('pointermove', e => { if (painting) set(this._cellAt(e)); });
      const stop = () => { painting = false; };
      this.cv.addEventListener('pointerup', stop);
      this.cv.addEventListener('pointercancel', stop);
    }

    draw() {
      const g = this._geom(), dpr = window.devicePixelRatio || 1;
      const cv = this.cv, ctx = cv.getContext('2d');
      cv.width = g.w * dpr; cv.height = g.h * dpr;
      cv.style.height = g.h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const C_BG = css('--card'), C_FG = css('--fg'), C_LINE = css('--line'),
            C_LINE2 = css('--line2'), C_DIM = css('--dim'), C_MARK = css('--mark');
      ctx.clearRect(0, 0, g.w, g.h);

      // เลขแกน
      ctx.fillStyle = C_DIM;
      ctx.font = Math.max(8, Math.min(11, g.cell * 0.42)) + 'px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (g.cell >= 14) {
        for (let c = 0; c < this.cols; c++) ctx.fillText(c, g.pad + c * g.cell + g.cell / 2, g.pad / 2);
        for (let r = 0; r < this.rows; r++) ctx.fillText(r, g.pad / 2, g.pad + r * g.cell + g.cell / 2);
      }

      // ช่อง
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          ctx.fillStyle = this.img[r][c] ? C_FG : C_BG;
          ctx.fillRect(g.pad + c * g.cell, g.pad + r * g.cell, g.cell, g.cell);
          if (this.marks.has(r + ',' + c)) {
            ctx.fillStyle = C_MARK;
            ctx.beginPath();
            ctx.arc(g.pad + c * g.cell + g.cell / 2, g.pad + r * g.cell + g.cell / 2,
                    g.cell * 0.22, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // เส้นตารางบางเท่ากันหมด หนาเฉพาะกรอบนอก
      for (let c = 0; c <= this.cols; c++) {
        const edge = c === 0 || c === this.cols;
        ctx.strokeStyle = edge ? C_LINE2 : C_LINE; ctx.lineWidth = edge ? 2 : 1;
        const x = g.pad + c * g.cell;
        ctx.beginPath(); ctx.moveTo(x, g.pad); ctx.lineTo(x, g.pad + this.rows * g.cell); ctx.stroke();
      }
      for (let r = 0; r <= this.rows; r++) {
        const edge = r === 0 || r === this.rows;
        ctx.strokeStyle = edge ? C_LINE2 : C_LINE; ctx.lineWidth = edge ? 2 : 1;
        const y = g.pad + r * g.cell;
        ctx.beginPath(); ctx.moveTo(g.pad, y); ctx.lineTo(g.pad + this.cols * g.cell, y); ctx.stroke();
      }

      // เส้นแบ่งแกนแบบจุดไข่ปลา เส้นเดียวแนวตั้ง เหมือนที่แบบฝึกหัดใช้
      const d = this.dividerCol();
      if (d > 0 && d < this.cols) {
        const x = g.pad + d * g.cell;
        const rad = Math.max(1.4, g.cell * 0.10), step = Math.max(4.5, g.cell * 0.42);
        ctx.fillStyle = '#000'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1;
        for (let y = g.pad + rad; y <= g.pad + this.rows * g.cell - rad; y += step) {
          ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
      }

      const n = M.countFg(this.img);
      this.meta.textContent = `จุดวัตถุ (1) = ${n} จุด` +
        (this.marks.size ? `   ลบรอบนี้ ${this.marks.size} จุด` : '');
    }
  }

  const gIn = new GridView('gIn', 'mIn', 'tIn', true);
  const gMid = new GridView('gMid', 'mMid', 'tMid', false);
  const gOut = new GridView('gOut', 'mOut', 'tOut', false);
  const allGrids = [gIn, gMid, gOut];

  const say = t => { $('log').textContent = t; };
  const blank = () => M.empty(state.rows, state.cols);
  const seStr = () => state.se.map(r => r.join(' ')).join(';');

  function setSize(rows, cols, keep) {
    state.rows = Math.max(2, Math.min(60, rows | 0));
    state.cols = Math.max(2, Math.min(60, cols | 0));
    allGrids.forEach(g => g.resize(state.rows, state.cols));
    gMid.title.textContent = 'ขั้นกลาง (Step 1)';
    gOut.title.textContent = 'ผลลัพธ์ (Result)';
    $('inRows').value = state.rows; $('inCols').value = state.cols;
    if (keep) gIn.setImage(keep);
  }

  function report(head, res, extra) {
    const txt = [`=== ${head} ===`, `SE = [${seStr()}]`,
      `จุดวัตถุ  ก่อน = ${M.countFg(gIn.getImage())}   หลัง = ${M.countFg(res)}`];
    if (extra) txt.push(extra);
    txt.push('', `ผลลัพธ์ (แถว 0-${res.length - 1} x หลัก 0-${res[0].length - 1}):`, M.matrixText(res));
    say(txt.join('\n'));
  }

  /**
   * เตือนกรณีผล Erosion มีจุดโผล่นอกรูปเดิม
   * เกิดได้จริงเมื่อ SE ไม่มีจุดกึ่งกลาง เพราะการตัดสินแต่ละช่องไม่ได้ดูตัวมันเอง
   */
  function growNote(src, res) {
    const grew = [];
    for (let r = 0; r < res.length; r++)
      for (let c = 0; c < res[0].length; c++)
        if (res[r][c] && !src[r][c]) grew.push(`(แถว ${r}, หลัก ${c})`);
    if (!grew.length) return '';
    return `หมายเหตุ: มี ${grew.length} จุดที่ต้นฉบับเป็นสีขาวแต่ผลเป็นสีดำ  ` +
      grew.slice(0, 6).join('  ') + (grew.length > 6 ? '  ...' : '') +
      '\n  ไม่ใช่ความผิดพลาด  เพราะ SE ตัวนี้จุดกึ่งกลางเป็น 0 การตัดสินแต่ละช่องจึงไม่ได้ดูตัวมันเอง' +
      '\n  ถ้าอยากให้ผลหดอยู่ในรูปเดิมเสมอ ให้แก้ SE ใส่จุดกึ่งกลางเป็น 1';
  }

  function checkSe() {
    if (M.countFg(state.se) === 0) { alert('SE ยังไม่มีจุดสีดำเลย กรุณากดปุ่ม แก้ไข SE ก่อน'); return false; }
    return true;
  }

  // ============================================================ การคำนวณ

  const actions = {
    erode() {
      if (!checkSe()) return;
      const src = gIn.getImage(), res = M.erode(src, state.se);
      gMid.setImage(blank(), [], 'ขั้นกลาง (ไม่ใช้)');
      gOut.setImage(res, [], 'ผลลัพธ์ : หลัง Erosion');
      report('Erosion', res, growNote(src, res));
    },
    dilate() {
      if (!checkSe()) return;
      const res = M.dilate(gIn.getImage(), state.se, state.reflect);
      gMid.setImage(blank(), [], 'ขั้นกลาง (ไม่ใช้)');
      gOut.setImage(res, [], 'ผลลัพธ์ : หลัง Dilation');
      report('Dilation', res);
    },
    open() {
      if (!checkSe()) return;
      const src = gIn.getImage();
      const mid = M.erode(src, state.se), res = M.dilate(mid, state.se, state.reflect);
      gMid.setImage(mid, [], 'ขั้นที่ 1 : หลัง Erosion');
      gOut.setImage(res, [], 'ขั้นที่ 2 : หลัง Dilation (Opening)');
      report('Opening  =  Erosion -> Dilation', res,
        `ระหว่างทาง หลัง Erosion เหลือ ${M.countFg(mid)} จุด\n${growNote(src, mid)}`);
    },
    close() {
      if (!checkSe()) return;
      const src = gIn.getImage();
      const mid = M.dilate(src, state.se, state.reflect), res = M.erode(mid, state.se);
      gMid.setImage(mid, [], 'ขั้นที่ 1 : หลัง Dilation');
      gOut.setImage(res, [], 'ขั้นที่ 2 : หลัง Erosion (Closing)');
      report('Closing  =  Dilation -> Erosion', res,
        `ระหว่างทาง หลัง Dilation ได้ ${M.countFg(mid)} จุด`);
    },
    p1() { pass(1); }, p2() { pass(2); },
    p12() {
      const src = gIn.getImage();
      const a = M.thinPass(src, 1), b = M.thinPass(a.img, 2);
      gMid.setImage(a.img, a.removed, 'หลัง Pass one (จุดแดง = ที่ลบ)');
      gOut.setImage(b.img, b.removed, 'หลัง Pass two (จุดแดง = ที่ลบ)');
      say(`=== Pass one + Pass two  (1 รอบ) ===\n` +
        `Pass one ลบ ${a.removed.length} จุด   ->  เหลือ ${M.countFg(a.img)} จุด\n` +
        `Pass two ลบ ${b.removed.length} จุด   ->  เหลือ ${M.countFg(b.img)} จุด\n\n` +
        `ผลหลัง Pass one:\n${M.matrixText(a.img)}\n\nผลหลัง Pass two:\n${M.matrixText(b.img)}`);
    },
    full() {
      const src = gIn.getImage();
      const { img: res, history } = M.skeletonize(src);
      const a = M.thinPass(src, 1);
      gMid.setImage(a.img, a.removed, 'รอบที่ 1 : หลัง Pass one');
      gOut.setImage(res, [], 'เส้นกระดูก (Skeleton) สุดท้าย');
      const lines = ['=== Skeletonization  วน Pass one + Pass two จนนิ่ง ===',
        `จุดวัตถุเริ่มต้น ${M.countFg(src)} จุด`, '',
        'รอบที่ | Pass one ลบ | Pass two ลบ', '-------+--------------+--------------'];
      for (const h of history)
        lines.push(String(h.round).padStart(6) + ' | ' + String(h.p1).padStart(12) + ' | ' + String(h.p2).padStart(12));
      lines.push('', `รวม ${history.length} รอบ  เหลือจุดวัตถุ ${M.countFg(res)} จุด`,
        '', 'เส้นกระดูก:', M.matrixText(res));
      say(lines.join('\n'));
    },
    clear() {
      gIn.setImage(blank()); gMid.setImage(blank(), [], 'ขั้นกลาง (Step 1)');
      gOut.setImage(blank(), [], 'ผลลัพธ์ (Result)');
      say('ล้างตารางแล้ว');
    },
    feedback() { gIn.setImage(gOut.getImage()); say('คัดลอกผลลัพธ์มาเป็น Input แล้ว'); },
    matlab() {
      const code = M.matlabText(gIn.getImage(), state.se);
      const done = () => say('คัดลอกโค้ด MATLAB ไปที่คลิปบอร์ดแล้ว\n\n' + code);
      if (navigator.clipboard) navigator.clipboard.writeText(code).then(done, () => say(code));
      else say(code);
    },
    resize() {
      const r = +$('inRows').value, c = +$('inCols').value;
      if (!(r >= 2 && c >= 2)) { alert('จำนวนแถว/หลักต้องเป็นตัวเลขตั้งแต่ 2 ขึ้นไป'); return; }
      const old = gIn.getImage();
      const keep = [];
      for (let y = 0; y < Math.min(60, r); y++) {
        const row = [];
        for (let x = 0; x < Math.min(60, c); x++)
          row.push(y < old.length && x < old[0].length ? old[y][x] : 0);
        keep.push(row);
      }
      setSize(r, c, keep);
      say(`เปลี่ยนขนาดตารางเป็น ${state.rows} แถว x ${state.cols} หลัก แล้ว`);
    }
  };

  function pass(which) {
    const src = gIn.getImage();
    const { img: res, removed } = M.thinPass(src, which);
    const rule = which === 1 ? '3*5*7 = 0  และ  1*3*5 = 0' : '1*5*7 = 0  และ  1*3*7 = 0';
    gMid.setImage(src, removed, `จุดสีแดง = จุดที่ Pass ${which} ลบได้`);
    gOut.setImage(res, [], `ผลลัพธ์ : หลัง Pass ${which === 1 ? 'one' : 'two'} (1 รอบ)`);
    say(`=== Pass ${which === 1 ? 'one' : 'two'}  (1 รอบ) ===\n` +
      `เงื่อนไข : 8-Connected 2..6 , Crossing index == 1 , ${rule}\n` +
      `ลบไป ${removed.length} จุด   เหลือจุดวัตถุ ${M.countFg(res)} จุด\n\n` +
      `ผลลัพธ์:\n${M.matrixText(res)}`);
  }

  document.querySelectorAll('[data-act]').forEach(b =>
    b.addEventListener('click', () => actions[b.dataset.act]()));
  $('cbReflect').addEventListener('change', e => { state.reflect = e.target.checked; });

  // ============================================================ ป็อปอัพ SE

  function drawSe(canvas, se, size) {
    const dpr = window.devicePixelRatio || 1, cell = size / 3;
    canvas.width = size * dpr; canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      ctx.fillStyle = se[r][c] ? css('--fg') : css('--card');
      ctx.fillRect(c * cell, r * cell, cell, cell);
      ctx.strokeStyle = css('--line2'); ctx.lineWidth = 1;
      ctx.strokeRect(c * cell + .5, r * cell + .5, cell - 1, cell - 1);
      if (size > 120) {
        ctx.fillStyle = se[r][c] ? '#fff' : css('--dim');
        ctx.font = (cell * 0.3) + 'px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(se[r][c], c * cell + cell / 2, r * cell + cell / 2);
      }
    }
    ctx.strokeStyle = css('--mark'); ctx.lineWidth = 2;
    ctx.strokeRect(cell + 1, cell + 1, cell - 2, cell - 2);      // กรอบแดง = จุดกึ่งกลาง
  }

  function refreshSe() {
    drawSe($('seMini'), state.se, 78);
    drawSe($('seBig'), state.se, Math.min(230, Math.round(window.innerWidth * 0.7)));
    $('seTxt').textContent = 'se = [' + seStr() + ']';
    $('seBigTxt').textContent = 'se = [' + seStr() + ']';
  }

  $('btnSe').addEventListener('click', () => { refreshSe(); $('dlgSe').showModal(); });
  $('seBig').addEventListener('pointerdown', e => {
    const rect = $('seBig').getBoundingClientRect();
    const c = Math.floor((e.clientX - rect.left) / (rect.width / 3));
    const r = Math.floor((e.clientY - rect.top) / (rect.height / 3));
    if (r >= 0 && r < 3 && c >= 0 && c < 3) { state.se[r][c] ^= 1; refreshSe(); }
  });
  document.querySelectorAll('[data-se]').forEach(b => b.addEventListener('click', () => {
    const v = b.dataset.se.split(',').map(Number);
    state.se = [v.slice(0, 3), v.slice(3, 6), v.slice(6, 9)];
    refreshSe();
  }));
  document.querySelectorAll('[data-close]').forEach(b =>
    b.addEventListener('click', () => b.closest('dialog').close()));

  // ============================================================ อ่านภาพ

  const IMG = { raw: null, src: null, res: null, roi: null, angle: 0, warped: false,
                busy: false, drag: null, scale: 1, ox: 0, oy: 0, cvReady: false };

  const CV_URLS = ['https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js',
                   'https://docs.opencv.org/4.x/opencv.js'];

  function loadCv() {
    if (IMG.cvReady) return Promise.resolve();
    if (IMG.cvLoading) return IMG.cvLoading;
    IMG.cvLoading = new Promise((resolve, reject) => {
      let i = 0;
      const tryNext = () => {
        if (i >= CV_URLS.length) { reject(new Error('โหลด OpenCV ไม่สำเร็จ')); return; }
        const s = document.createElement('script');
        s.src = CV_URLS[i++];
        s.onerror = tryNext;
        s.onload = () => {
          const ready = () => { GR.setCv(window.cv); IMG.cvReady = true; resolve(); };
          if (window.cv && window.cv.Mat) ready();
          else if (window.cv) window.cv.onRuntimeInitialized = ready;
          else tryNext();
        };
        document.head.appendChild(s);
      };
      tryNext();
    });
    return IMG.cvLoading;
  }

  function status(msg, kind) {
    const el = $('imgStatus');
    el.textContent = msg;
    el.className = 'status' + (kind ? ' ' + kind : '');
  }

  $('btnImg').addEventListener('click', async () => {
    $('dlgImg').showModal();
    if (!IMG.cvReady) {
      status('กำลังโหลด OpenCV (ประมาณ 10 MB) รอสักครู่…');
      try { await loadCv(); status('โหลด OpenCV เสร็จแล้ว เลือกรูปได้เลย', 'ok'); }
      catch (e) { status('โหลด OpenCV ไม่สำเร็จ ตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่', 'err'); }
    }
  });
  $('btnPick').addEventListener('click', () => $('filePick').click());

  $('filePick').addEventListener('change', async e => {
    const f = e.target.files[0];
    if (!f) return;
    $('fileName').textContent = f.name;
    try { await loadCv(); } catch (_) { status('ยังโหลด OpenCV ไม่ได้', 'err'); return; }

    const bmp = await createImageBitmap(f);
    const MAX = 1600;
    const s = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s));
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    off.getContext('2d').drawImage(bmp, 0, 0, w, h);
    bmp.close && bmp.close();

    if (IMG.raw) IMG.raw.delete();
    IMG.raw = window.cv.imread(off);
    IMG.roi = null;
    $('fileName').textContent = f.name + `  (${w} × ${h} px)`;
    reprocess();
  });

  function reprocess() {
    if (!IMG.raw) return;
    if (IMG.src && IMG.src !== IMG.raw) IMG.src.delete();
    IMG.roi = null; IMG.angle = 0; IMG.warped = false;

    let cur = IMG.raw;
    const photo = $('cbPhoto').checked;
    if (!GR.isPixelImage(IMG.raw)) {
      if ($('cbPersp').checked) {
        const r = GR.rectify(cur, photo);
        if (cur !== IMG.raw) cur.delete();
        cur = r.mat; IMG.warped = r.warped;
      }
      if ($('cbDeskew').checked) {
        const d = GR.deskew(cur, photo);
        if (cur !== IMG.raw) cur.delete();
        cur = d.mat; IMG.angle = d.angle;
      }
    }
    IMG.src = cur;
    analyze();
  }

  function analyze() {
    if (!IMG.src || IMG.busy) return;
    IMG.busy = true;
    try {
      if (GR.isPixelImage(IMG.src)) {
        const grid = GR.readPixelImage(IMG.src, $('cbInvert').checked || null);
        IMG.res = { ok: true, pixel: true, grid, rows: grid.length, cols: grid[0].length,
                    xs: [], ys: [], msg: `ภาพขนาด ${IMG.src.cols}×${IMG.src.rows} px  อ่านแบบ 1 พิกเซล = 1 ช่อง` };
      } else {
        const auto = $('cbAuto').checked;
        IMG.res = GR.analyze(IMG.src, {
          roi: IMG.roi || undefined,
          rows: auto ? undefined : +$('imRows').value,
          cols: auto ? undefined : +$('imCols').value,
          photo: $('cbPhoto').checked,
          thresh: +$('rgThresh').value / 100,
          invert: $('cbInvert').checked
        });
        IMG.res.pixel = false;
      }
      if (IMG.res.ok) { $('imRows').value = IMG.res.rows; $('imCols').value = IMG.res.cols; }
      let msg = IMG.res.msg;
      if (IMG.warped) msg += '   (ดัดมุมภาพแล้ว)';
      if (IMG.angle) msg += `   (หมุนแก้เอียง ${IMG.angle.toFixed(1)} องศา)`;
      status(msg, IMG.res.ok ? 'ok' : 'err');
      $('btnUse').disabled = !IMG.res.ok;
    } catch (err) {
      status('เกิดข้อผิดพลาดตอนอ่านภาพ: ' + err.message, 'err');
      $('btnUse').disabled = true;
    } finally { IMG.busy = false; }
    render();
  }

  function render() {
    const cvEl = $('imgPrev'), ctx = cvEl.getContext('2d');
    if (!IMG.src) { ctx.clearRect(0, 0, cvEl.width, cvEl.height); return; }

    const W = IMG.src.cols, H = IMG.src.rows;
    const boxW = cvEl.clientWidth || 320;
    const s = Math.min(boxW / W, 460 / H);
    IMG.scale = s; IMG.ox = 0; IMG.oy = 0;
    const dw = Math.round(W * s), dh = Math.round(H * s);
    const dpr = window.devicePixelRatio || 1;
    cvEl.width = dw * dpr; cvEl.height = dh * dpr;
    cvEl.style.height = dh + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // วาดภาพจาก cv.Mat ลง canvas
    const tmp = document.createElement('canvas');
    tmp.width = W; tmp.height = H;
    window.cv.imshow(tmp, IMG.src);
    ctx.drawImage(tmp, 0, 0, dw, dh);

    const r = IMG.res;
    if (r && r.ok && !r.pixel) {
      const x0 = r.xs[0] * s, x1 = r.xs[r.xs.length - 1] * s;
      const y0 = r.ys[0] * s, y1 = r.ys[r.ys.length - 1] * s;
      ctx.fillStyle = 'rgba(255,59,59,.42)';
      for (let rr = 0; rr < r.rows; rr++)
        for (let cc = 0; cc < r.cols; cc++)
          if (r.grid[rr][cc])
            ctx.fillRect(r.xs[cc] * s, r.ys[rr] * s,
                         (r.xs[cc + 1] - r.xs[cc]) * s, (r.ys[rr + 1] - r.ys[rr]) * s);
      ctx.strokeStyle = '#00e07a'; ctx.lineWidth = 1;
      for (const x of r.xs) { ctx.beginPath(); ctx.moveTo(x * s, y0); ctx.lineTo(x * s, y1); ctx.stroke(); }
      for (const y of r.ys) { ctx.beginPath(); ctx.moveTo(x0, y * s); ctx.lineTo(x1, y * s); ctx.stroke(); }
      ctx.strokeStyle = '#ffcc00'; ctx.lineWidth = 2;
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    }
    if (IMG.drag) {
      const [a, b, c, d] = IMG.drag;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
      ctx.strokeRect(Math.min(a, c), Math.min(b, d), Math.abs(c - a), Math.abs(d - b));
      ctx.setLineDash([]);
    }
  }

  // ลากเลือกกรอบเอง
  (function () {
    const el = $('imgPrev');
    const pos = e => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    el.addEventListener('pointerdown', e => {
      if (!IMG.src) return;
      e.preventDefault();
      const [x, y] = pos(e); IMG.drag = [x, y, x, y];
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', e => {
      if (!IMG.drag) return;
      const [x, y] = pos(e); IMG.drag[2] = x; IMG.drag[3] = y; render();
    });
    el.addEventListener('pointerup', () => {
      if (!IMG.drag) return;
      const [a, b, c, d] = IMG.drag; IMG.drag = null;
      if (Math.abs(c - a) < 12 || Math.abs(d - b) < 12) { render(); return; }
      const s = IMG.scale;
      IMG.roi = { x: Math.min(a, c) / s, y: Math.min(b, d) / s,
                  w: Math.abs(c - a) / s, h: Math.abs(d - b) / s };
      analyze();
    });
  })();

  ['cbPhoto', 'cbPersp', 'cbDeskew', 'cbInvert'].forEach(id =>
    $(id).addEventListener('change', reprocess));
  $('cbAuto').addEventListener('change', e => {
    $('imRows').disabled = e.target.checked;
    $('imCols').disabled = e.target.checked;
    analyze();
  });
  ['imRows', 'imCols'].forEach(id => $(id).addEventListener('change', analyze));
  $('rgThresh').addEventListener('input', e => { $('thTxt').textContent = e.target.value + '%'; analyze(); });
  $('btnClearRoi').addEventListener('click', () => { IMG.roi = null; analyze(); });

  $('btnUse').addEventListener('click', () => {
    const r = IMG.res;
    if (!r || !r.ok) return;
    const grid = r.grid.map(row => row.slice());
    $('dlgImg').close();
    const note = (grid.length !== state.rows || grid[0].length !== state.cols)
      ? `   (ปรับขนาดตารางเป็น ${grid.length} x ${grid[0].length} ให้อัตโนมัติ)` : '';
    setSize(grid.length, grid[0].length, grid);
    gMid.setImage(blank(), [], 'ขั้นกลาง (Step 1)');
    gOut.setImage(blank(), [], 'ผลลัพธ์ (Result)');
    say(`นำเข้าจากภาพสำเร็จ  ${grid.length} แถว x ${grid[0].length} หลัก  ` +
        `จุดวัตถุ ${M.countFg(grid)} ช่อง${note}\n\nภาพที่อ่านได้:\n${M.matrixText(grid)}`);
  });

  $('dlgImg').addEventListener('close', () => { if (IMG.drag) { IMG.drag = null; render(); } });

  // ============================================================ เริ่มต้น

  setSize(10, 13);
  refreshSe();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    allGrids.forEach(g => g.draw()); refreshSe();
  });
})();
