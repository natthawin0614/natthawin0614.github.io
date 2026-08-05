/*
 * gridreader.js - อ่าน "ภาพตารางแบบฝึกหัด" ด้วย OpenCV.js แล้วแปลงกลับเป็นเมทริกซ์ 0/1
 * พอร์ตมาจาก grid_reader.py แบบตรงตัว ใช้ฟังก์ชันชื่อเดียวกันกับฝั่ง Python
 *
 * ขั้นตอน
 *  1. แปลงเป็นภาพระดับเทา แล้ว binarize (Otsu / ชดเชยแสงสำหรับภาพถ่าย)
 *  2. หาบริเวณตาราง = connected component ที่ใหญ่ที่สุด
 *  3. หาขอบตารางจริงจาก profile ของแต่ละหลัก/แถว
 *  4. ลองสมมุติจำนวนช่องไล่ขึ้นไป เลือกจำนวนที่มากที่สุดที่เส้นแบ่งทุกเส้นมีหมึกรองรับ
 *  5. อ่านพื้นที่ตรงกลางของแต่ละช่อง เทียบเกณฑ์ => 0 หรือ 1
 */
(function (root) {
  'use strict';

  let cv = null;
  function setCv(instance) { cv = instance; }

  // ---------------------------------------------------------------- binarize

  /**
   * ลบเงา/แสงไม่สม่ำเสมอออกจากภาพถ่าย
   * ประมาณ "สีกระดาษ" ด้วย morphological closing บนภาพย่อ แล้วหารกลับ
   * k ต้องใหญ่กว่าก้อนสีดำที่ใหญ่ที่สุด ไม่งั้นใจกลางก้อนดำจะกลายเป็นรูโหว่
   */
  function flattenLight(gray, small) {
    small = small || 240;
    const h = gray.rows, w = gray.cols;
    const s = Math.min(1.0, small / Math.max(h, w));
    const tiny = new cv.Mat();
    cv.resize(gray, tiny, new cv.Size(Math.max(1, Math.round(w * s)),
                                      Math.max(1, Math.round(h * s))), 0, 0, cv.INTER_AREA);
    let k = Math.max(15, Math.max(tiny.rows, tiny.cols) / 3 | 0);
    if (k % 2 === 0) k += 1;
    const ker = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(k, k));
    const bgSmall = new cv.Mat();
    cv.morphologyEx(tiny, bgSmall, cv.MORPH_CLOSE, ker);
    const bg = new cv.Mat();
    cv.resize(bgSmall, bg, new cv.Size(w, h), 0, 0, cv.INTER_LINEAR);
    const one = new cv.Mat(h, w, cv.CV_8UC1, new cv.Scalar(1));
    cv.max(bg, one, bg);                       // กันหารด้วยศูนย์
    const out = new cv.Mat();
    cv.divide(gray, bg, out, 255);
    tiny.delete(); ker.delete(); bgSmall.delete(); bg.delete(); one.delete();
    return out;
  }

  /** คืนภาพขาวดำที่ "หมึก" (ส่วนที่เข้ม) = 255 */
  function toInk(src, photo) {
    let gray = new cv.Mat();
    if (src.channels() === 1) src.copyTo(gray);
    else cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    if (photo) {
      const flat = flattenLight(gray);
      gray.delete();
      gray = flat;
    }
    // หา threshold จากภาพเบลอ (ทนสัญญาณรบกวน) แต่ไปใช้กับภาพคมชัด
    // ถ้า threshold ภาพเบลอตรง ๆ เส้นตารางบาง 1 px จะจางจนหลุดหายไปทั้งเส้น
    const blur = new cv.Mat(), tmp = new cv.Mat();
    cv.GaussianBlur(gray, blur, new cv.Size(3, 3), 0);
    const t = cv.threshold(blur, tmp, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
    const bw = new cv.Mat();
    cv.threshold(gray, bw, t, 255, cv.THRESH_BINARY_INV);
    gray.delete(); blur.delete(); tmp.delete();
    return bw;
  }

  // ---------------------------------------------------------------- ROI

  /** ขยายเล็กน้อยเพื่อเชื่อมเส้นที่ขาดเป็นรู ใช้เฉพาะตอนหา "บริเวณตาราง" */
  function roiMask(bw) {
    const ker = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
    const out = new cv.Mat();
    cv.dilate(bw, out, ker);
    ker.delete();
    return out;
  }

  function profileTol(rows, cols) {
    return Math.min(8, Math.max(2, Math.round(Math.min(rows, cols) * 0.008)));
  }

  /** หา connected component ที่ใหญ่ที่สุด คืน {idx, x, y, w, h, labels, stats} */
  function largestComponent(bw, minFrac) {
    minFrac = minFrac === undefined ? 0.02 : minFrac;
    const labels = new cv.Mat(), stats = new cv.Mat(), cent = new cv.Mat();
    const n = cv.connectedComponentsWithStats(bw, labels, stats, cent, 8, cv.CV_32S);
    const total = bw.rows * bw.cols;
    let best = -1, bestArea = 0, box = null;
    for (let i = 1; i < n; i++) {
      const x = stats.intAt(i, cv.CC_STAT_LEFT), y = stats.intAt(i, cv.CC_STAT_TOP);
      const w = stats.intAt(i, cv.CC_STAT_WIDTH), h = stats.intAt(i, cv.CC_STAT_HEIGHT);
      const area = w * h;
      if (area < total * minFrac || w < 20 || h < 20) continue;
      if (area > bestArea) { best = i; bestArea = area; box = { x, y, w, h }; }
    }
    cent.delete(); stats.delete();
    if (best < 0) { labels.delete(); return null; }
    return { idx: best, box, labels };
  }

  function largestBox(bw) {
    const c = largestComponent(bw);
    if (!c) return null;
    c.labels.delete();
    return c.box;
  }

  /**
   * เส้นขอบนอกของ component ที่ใหญ่ที่สุด คืน {contour, box} หรือ null
   * ใช้แทน findNonZero ซึ่ง opencv.js บาง build ไม่มีมาให้
   * minAreaRect / convexHull ของเส้นขอบให้ผลเท่ากับของทุกพิกเซลอยู่แล้ว
   */
  function componentOuter(bw) {
    const comp = largestComponent(bw);
    if (!comp) return null;

    const cmp = new cv.Mat(comp.labels.rows, comp.labels.cols, cv.CV_32S, new cv.Scalar(comp.idx));
    const mask = new cv.Mat();
    cv.compare(comp.labels, cmp, mask, cv.CMP_EQ);
    cmp.delete(); comp.labels.delete();

    const cnts = new cv.MatVector(), hier = new cv.Mat();
    cv.findContours(mask, cnts, hier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    mask.delete(); hier.delete();
    if (cnts.size() === 0) { cnts.delete(); return null; }

    let big = 0, bigArea = -1;
    for (let i = 0; i < cnts.size(); i++) {
      const a = cv.contourArea(cnts.get(i));
      if (a > bigArea) { bigArea = a; big = i; }
    }
    const contour = cnts.get(big).clone();
    cnts.delete();
    return { contour, box: comp.box };
  }

  // ---------------------------------------------------------------- profiles

  /**
   * สัดส่วน "ความยาวที่มีหมึก" ของแต่ละหลัก (axis 'v') หรือแต่ละแถว (axis 'h')
   * ขยายภาพในแนวขวางกับเส้นก่อน เส้นที่เบี้ยว 1-3 px จะกลับมาเต็มแนว
   */
  function axisProfile(bw, axis, tol) {
    if (tol === undefined) tol = profileTol(bw.rows, bw.cols);
    const ker = cv.getStructuringElement(cv.MORPH_RECT,
      axis === 'v' ? new cv.Size(2 * tol + 1, 1) : new cv.Size(1, 2 * tol + 1));
    const d = new cv.Mat();
    cv.dilate(bw, d, ker);
    const sum = new cv.Mat();
    cv.reduce(d, sum, axis === 'v' ? 0 : 1, cv.REDUCE_SUM, cv.CV_32F);
    const len = axis === 'v' ? d.rows : d.cols;
    const n = axis === 'v' ? d.cols : d.rows;
    const prof = new Float32Array(n);
    for (let i = 0; i < n; i++) prof[i] = sum.floatAt(axis === 'v' ? 0 : i, axis === 'v' ? i : 0) / 255 / len;
    ker.delete(); d.delete(); sum.delete();
    return prof;
  }

  /** สไลด์หาค่าสูงสุดในรัศมี rad */
  function maxFilter(prof, rad) {
    rad = rad | 0;
    if (rad <= 0) return prof;
    const n = prof.length, out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let m = 0;
      const a = Math.max(0, i - rad), b = Math.min(n - 1, i + rad);
      for (let j = a; j <= b; j++) if (prof[j] > m) m = prof[j];
      out[i] = m;
    }
    return out;
  }

  /**
   * หาขอบนอกสุดของตาราง = เส้นที่ลากเต็มแนวเส้นแรกและเส้นสุดท้าย
   * profile ถูกขยายไว้แล้วข้างละ tol จึงต้องหักออก
   * ระวังกรณีแถวติดขอบถูกระบายดำทั้งแถว แถบแรกจะเป็น เส้นขอบ+ช่องดำ ติดกัน
   */
  function borderRange(prof, strong, tol) {
    strong = strong === undefined ? 0.9 : strong;
    tol = tol === undefined ? 2 : tol;
    let mx = 0;
    for (const v of prof) if (v > mx) mx = v;
    strong = Math.min(strong, Math.max(0.7, 0.95 * mx));

    const idx = [];
    for (let i = 0; i < prof.length; i++) if (prof[i] >= strong) idx.push(i);
    if (idx.length < 2) return null;

    let end = idx[0];
    for (const v of idx) { if (v <= end + 1) end = v; else break; }
    let start = idx[idx.length - 1];
    for (let i = idx.length - 1; i >= 0; i--) { const v = idx[i]; if (v >= start - 1) start = v; else break; }

    const wide = 2 * tol + 6;
    const first = idx[0], last = idx[idx.length - 1];
    const lo = (end - first <= wide) ? (first + end) / 2 : first + tol;
    const hi = (last - start <= wide) ? (start + last) / 2 : last - tol;
    return (hi - lo >= 4) ? [lo, hi] : null;
  }

  function edges(lo, hi, n) {
    const out = [];
    for (let i = 0; i <= n; i++) out.push(lo + (hi - lo) * i / n);
    return out;
  }

  /**
   * หาจำนวนช่องบนแกนหนึ่ง ๆ
   * ลองสมมุติจำนวนช่อง n ไล่ขึ้นไป ตรวจว่าเส้นแบ่งทุกเส้นมีหมึกจริงรองรับครบไหม
   * ถ้าครบถือว่าใช้ได้ แล้วเลือก n ที่ใหญ่ที่สุดที่ยังใช้ได้
   */
  function countCells(prof, lo, hi, opt) {
    opt = opt || {};
    const thr = opt.thr === undefined ? 0.85 : opt.thr;
    const tol = opt.tol === undefined ? 2 : opt.tol;
    const nmax = opt.nmax || 60;
    const span = hi - lo;
    if (span < 4) return null;
    // ช่องต้องใหญ่กว่าระยะเผื่อพอสมควร ไม่งั้นตำแหน่งไหนก็ "ผ่าน" หมด
    const minCell = Math.max(opt.minCell === undefined ? 8 : opt.minCell, 2.5 * (2 * tol + 1));

    let best = null;
    for (let n = 2; n <= nmax; n++) {
      const cell = span / n;
      if (cell < minCell) break;
      const pm = maxFilter(prof, Math.max(2, Math.round(cell * 0.18)));
      let ok = true;
      for (let i = 1; i < n; i++) {
        if (pm[Math.round(lo + span * i / n)] < thr) { ok = false; break; }
      }
      if (!ok) continue;
      // กันกรณีภาพดำเกือบทั้งแผ่น ซึ่งจำนวนช่องไหนก็ผ่านหมด
      let allMid = true;
      for (let i = 0; i < n; i++) {
        if (pm[Math.round(lo + span * (i + 0.5) / n)] < thr) { allMid = false; break; }
      }
      if (allMid) continue;
      best = n;
    }
    return best;
  }

  // ---------------------------------------------------------------- quad

  function orderQuad(p) {
    const sum = p.map(q => q[0] + q[1]);
    const dif = p.map(q => q[1] - q[0]);
    const argmin = a => a.indexOf(Math.min(...a));
    const argmax = a => a.indexOf(Math.max(...a));
    return [p[argmin(sum)], p[argmin(dif)], p[argmax(sum)], p[argmax(dif)]];
  }

  /**
   * หาสี่เหลี่ยมรอบนอกของตาราง คืน 4 มุม หรือ null
   * ตรวจสองชั้น สี่เหลี่ยมต้องกินพื้นที่เกือบเท่า convex hull
   * และกรอบต้องเกือบเท่ากรอบของก้อนหมึกจริง
   * ถ้าภาพขาดบางมุมจะได้สี่เหลี่ยมคางหมูเบี้ยว ปล่อยผ่านแล้ว warp จะพังหนักกว่าไม่ทำ
   */
  function findQuad(bw, minFill, boxCover) {
    minFill = minFill === undefined ? 0.75 : minFill;
    boxCover = boxCover === undefined ? 0.9 : boxCover;
    const outer = componentOuter(bw);
    if (!outer) return null;

    const hull = new cv.Mat();
    cv.convexHull(outer.contour, hull, false, true);
    outer.contour.delete();

    const area = cv.contourArea(hull);
    if (area < 400) { hull.delete(); return null; }
    const boxArea = outer.box.w * outer.box.h;
    const peri = cv.arcLength(hull, true);

    let result = null;
    for (const eps of [0.01, 0.02, 0.03, 0.04, 0.05, 0.07, 0.09]) {
      const ap = new cv.Mat();
      cv.approxPolyDP(hull, ap, eps * peri, true);
      if (ap.rows === 4) {
        const pts = [];
        for (let i = 0; i < 4; i++) pts.push([ap.intAt(i, 0), ap.intAt(i, 1)]);
        const qArea = Math.abs(cv.contourArea(ap));
        const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
        const qw = Math.max(...xs) - Math.min(...xs), qh = Math.max(...ys) - Math.min(...ys);
        if (qArea >= minFill * area && !(boxArea > 0 && qw * qh < boxCover * boxArea)) {
          result = orderQuad(pts);
          ap.delete();
          break;
        }
      }
      ap.delete();
    }
    hull.delete();
    return result;
  }

  // ---------------------------------------------------------------- deskew / rectify

  /** หมุนภาพให้ตารางตั้งตรง คืน {mat, angle} */
  function deskew(src, photo, maxAngle) {
    maxAngle = maxAngle || 15;
    const ink = toInk(src, photo), rm = roiMask(ink);
    ink.delete();
    const outer = componentOuter(rm);
    rm.delete();
    if (!outer) return { mat: src.clone(), angle: 0 };
    if (outer.contour.rows < 8) { outer.contour.delete(); return { mat: src.clone(), angle: 0 }; }

    const rect = cv.minAreaRect(outer.contour);
    outer.contour.delete();
    let ang = rect.angle;
    if (ang > 45) ang -= 90; else if (ang < -45) ang += 90;
    if (Math.abs(ang) < 0.25 || Math.abs(ang) > maxAngle) return { mat: src.clone(), angle: 0 };

    const m = cv.getRotationMatrix2D(new cv.Point(src.cols / 2, src.rows / 2), ang, 1);
    const out = new cv.Mat();
    cv.warpAffine(src, out, m, new cv.Size(src.cols, src.rows), cv.INTER_CUBIC,
                  cv.BORDER_CONSTANT, new cv.Scalar(255, 255, 255, 255));
    m.delete();
    return { mat: out, angle: ang };
  }

  /** แก้ภาพที่ถ่ายเอียงเป็นมุม คืน {mat, warped} */
  function rectify(src, photo, margin) {
    margin = margin === undefined ? 12 : margin;
    const ink = toInk(src, photo), rm = roiMask(ink);
    ink.delete();
    const quad = findQuad(rm);
    rm.delete();
    if (!quad) return { mat: src.clone(), warped: false };

    const [tl, tr, br, bl] = quad;
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const w = Math.max(dist(br, bl), dist(tr, tl));
    const h = Math.max(dist(tr, br), dist(tl, bl));
    if (w < 40 || h < 40 || w > 6000 || h > 6000) return { mat: src.clone(), warped: false };

    // ตารางตรงอยู่แล้ว -> ครอบตัดเฉย ๆ ห้าม warp
    // การ resample ทำให้เส้นตารางบาง 1 px จางลงจนหลุด threshold ได้
    const skew = Math.max(Math.abs(tl[1] - tr[1]), Math.abs(bl[1] - br[1]),
                          Math.abs(tl[0] - bl[0]), Math.abs(tr[0] - br[0]));
    const xs = quad.map(p => p[0]), ys = quad.map(p => p[1]);
    if (skew <= Math.max(2, 0.01 * Math.max(w, h))) {
      const x0 = Math.max(0, Math.min(...xs) - margin), y0 = Math.max(0, Math.min(...ys) - margin);
      const x1 = Math.min(src.cols, Math.max(...xs) + margin + 1);
      const y1 = Math.min(src.rows, Math.max(...ys) + margin + 1);
      if (x1 - x0 > 40 && y1 - y0 > 40) {
        return { mat: src.roi(new cv.Rect(x0, y0, x1 - x0, y1 - y0)).clone(), warped: false };
      }
    }

    const m = margin;
    const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2,
      [tl[0], tl[1], tr[0], tr[1], br[0], br[1], bl[0], bl[1]]);
    const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2,
      [m, m, w + m, m, w + m, h + m, m, h + m]);
    const M = cv.getPerspectiveTransform(srcTri, dstTri);
    const out = new cv.Mat();
    cv.warpPerspective(src, out, M, new cv.Size(Math.round(w + 2 * m), Math.round(h + 2 * m)),
                       cv.INTER_CUBIC, cv.BORDER_CONSTANT, new cv.Scalar(255, 255, 255, 255));
    srcTri.delete(); dstTri.delete(); M.delete();
    return { mat: out, warped: true };
  }

  // ---------------------------------------------------------------- sampling

  /** อ่านค่าแต่ละช่อง โดยดูเฉพาะพื้นที่ตรงกลาง เว้นขอบกันโดนเส้นตาราง */
  function sampleCells(bw, xs, ys, thresh, margin) {
    thresh = thresh === undefined ? 0.5 : thresh;
    margin = margin === undefined ? 0.25 : margin;
    const H = bw.rows, W = bw.cols;
    const data = bw.data;
    const grid = [], ratio = [];
    for (let r = 0; r + 1 < ys.length; r++) {
      const rowG = [], rowR = [];
      for (let c = 0; c + 1 < xs.length; c++) {
        const mx = (xs[c + 1] - xs[c]) * margin, my = (ys[r + 1] - ys[r]) * margin;
        const a = Math.max(0, Math.round(xs[c] + mx));
        const b = Math.min(W, Math.max(a + 1, Math.round(xs[c + 1] - mx)));
        const u = Math.max(0, Math.round(ys[r] + my));
        const v = Math.min(H, Math.max(u + 1, Math.round(ys[r + 1] - my)));
        let sum = 0, cnt = 0;
        for (let y = u; y < v; y++) {
          const off = y * W;
          for (let x = a; x < b; x++) { sum += data[off + x]; cnt++; }
        }
        const f = cnt ? sum / cnt / 255 : 0;
        rowR.push(f);
        rowG.push(f >= thresh ? 1 : 0);
      }
      grid.push(rowG); ratio.push(rowR);
    }
    return { grid, ratio };
  }

  // ---------------------------------------------------------------- main

  function fitGrid(bw, box, rows, cols, padFrac) {
    padFrac = padFrac === undefined ? 0.015 : padFrac;
    const H = bw.rows, W = bw.cols;
    let { x, y, w, h } = box;
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    const p = Math.max(4, Math.round(padFrac * Math.max(w, h)));
    const x0 = Math.max(0, x - p), y0 = Math.max(0, y - p);
    const x1 = Math.min(W, x + w + p), y1 = Math.min(H, y + h + p);
    if (x1 - x0 < 8 || y1 - y0 < 8) return { ok: false, detR: null, detC: null };

    const sub = bw.roi(new cv.Rect(x0, y0, x1 - x0, y1 - y0));
    const tol = profileTol(sub.rows, sub.cols);
    const px = axisProfile(sub, 'v', tol), py = axisProfile(sub, 'h', tol);
    const brx = borderRange(px, 0.9, tol) || [0, sub.cols - 1];
    const bry = borderRange(py, 0.9, tol) || [0, sub.rows - 1];
    sub.delete();

    const detC = countCells(px, brx[0], brx[1], { tol });
    const detR = countCells(py, bry[0], bry[1], { tol });
    const nCols = cols ? (cols | 0) : detC;
    const nRows = rows ? (rows | 0) : detR;

    const roi = { x: Math.round(x0 + brx[0]), y: Math.round(y0 + bry[0]),
                  w: Math.max(2, Math.round(brx[1] - brx[0])),
                  h: Math.max(2, Math.round(bry[1] - bry[0])) };
    if (!nCols || !nRows) return { ok: false, roi, detR, detC };

    return {
      ok: true, roi, rows: nRows, cols: nCols, detR, detC,
      xs: edges(brx[0], brx[1], nCols).map(v => x0 + v),
      ys: edges(bry[0], bry[1], nRows).map(v => y0 + v)
    };
  }

  /**
   * วิเคราะห์ภาพตาราง (src เป็น cv.Mat RGBA หรือ BGR)
   * คืน {ok, msg, roi, rows, cols, xs, ys, grid, ratio}
   */
  function analyze(src, opt) {
    opt = opt || {};
    const out = { ok: false, msg: '', roi: null, rows: 0, cols: 0,
                  xs: [], ys: [], grid: [], ratio: [] };

    let bw = toInk(src, opt.photo);
    if (opt.invert) { const t = new cv.Mat(); cv.bitwise_not(bw, t); bw.delete(); bw = t; }

    const autoRoi = !opt.roi;
    let boxes = [];
    if (autoRoi) {
      const rm = roiMask(bw);
      const quad = findQuad(rm);
      if (quad) {
        const xs = quad.map(p => p[0]), ys = quad.map(p => p[1]);
        boxes.push({ x: Math.min(...xs), y: Math.min(...ys),
                     w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) });
      }
      const lb = largestBox(rm);
      rm.delete();
      if (lb && !boxes.some(b => b.x === lb.x && b.y === lb.y && b.w === lb.w && b.h === lb.h)) boxes.push(lb);
      if (!boxes.length) {
        bw.delete();
        out.msg = 'หาบริเวณตารางไม่พบ  ลองลากนิ้วหรือเมาส์เลือกกรอบตารางเอง';
        return out;
      }
    } else {
      boxes = [opt.roi];
    }

    let fit = null;
    for (const box of boxes) {                   // ลองทีละกรอบ ใช้อันแรกที่อ่านได้
      const f = fitGrid(bw, box, opt.rows, opt.cols);
      if (!fit || (f.ok && !fit.ok)) fit = f;
      if (f.ok) break;
    }

    out.roi = fit.roi || null;
    if (!fit.ok) {
      bw.delete();
      out.msg = 'ตรวจจำนวนช่องอัตโนมัติไม่ได้  กรุณาระบุจำนวนแถว/หลักเอง' +
                '  หรือเลือกกรอบตารางเอง  (ตรวจได้ ' + fit.detR + ' x ' + fit.detC + ')';
      return out;
    }

    const s = sampleCells(bw, fit.xs, fit.ys, opt.thresh === undefined ? 0.5 : opt.thresh);
    bw.delete();

    let fuzzy = 0, total = 0;
    for (const row of s.ratio) for (const v of row) { if (v > 0.35 && v < 0.65) fuzzy++; total += 0; }
    for (const row of s.grid) for (const v of row) total += v;

    Object.assign(out, {
      ok: true, rows: fit.rows, cols: fit.cols, xs: fit.xs, ys: fit.ys,
      grid: s.grid, ratio: s.ratio,
      msg: `อ่านได้ ${fit.rows} แถว x ${fit.cols} หลัก   จุดวัตถุ ${total} ช่อง` +
           (autoRoi ? '' : '   (ใช้กรอบที่เลือกเอง)') +
           (fuzzy ? `   *มี ${fuzzy} ช่องที่ก้ำกึ่ง ลองปรับเกณฑ์ดู` : '')
    });
    return out;
  }

  /** ภาพที่ 1 พิกเซล = 1 ช่อง เช่น p1.png ที่เซฟจาก MATLAB */
  function isPixelImage(src, limit) {
    limit = limit || 64;
    return src.rows <= limit && src.cols <= limit;
  }

  function readPixelImage(src, invert) {
    const gray = new cv.Mat();
    if (src.channels() === 1) src.copyTo(gray); else cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    const grid = [];
    let dark = 0;
    for (let r = 0; r < gray.rows; r++) {
      const row = [];
      for (let c = 0; c < gray.cols; c++) { const d = gray.ucharPtr(r, c)[0] < 128 ? 1 : 0; row.push(d); dark += d; }
      grid.push(row);
    }
    gray.delete();
    if (invert === undefined || invert === null) invert = dark > (grid.length * grid[0].length) / 2;
    return invert ? grid.map(row => row.map(v => 1 - v)) : grid;
  }

  const api = { setCv, get cv() { return cv; }, flattenLight, toInk, roiMask, profileTol,
                largestBox, largestComponent, componentOuter, axisProfile, maxFilter, borderRange, edges,
                countCells, findQuad, deskew, rectify, sampleCells, fitGrid, analyze,
                isPixelImage, readPixelImage };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GridReader = api;
})(typeof window !== 'undefined' ? window : globalThis);
