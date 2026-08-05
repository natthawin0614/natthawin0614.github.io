/*
 * morph.js - แกนคำนวณ Erosion / Dilation / Skeletonization
 * พอร์ตมาจาก morph_skel.py แบบตรงตัว ผลลัพธ์ต้องเท่ากันทุกกรณี
 *
 * นิยามที่ใช้ (ตามสไลด์)
 *   Erosion  ผลเป็น 1 เมื่อ "ทุกจุด" ที่เป็น 1 ของ SE ชนกับวัตถุ
 *   Dilation ผลเป็น 1 เมื่อ "จุดใดจุดหนึ่ง" ที่เป็น 1 ของ SE ชนกับวัตถุ
 *
 * เลขเพื่อนบ้าน 8 ทิศ เรียงตามเข็มนาฬิกาเริ่มที่ด้านบน
 *        8  1  2
 *        7  P  3
 *        6  5  4
 */
(function (root) {
  'use strict';

  function empty(rows, cols) {
    const out = [];
    for (let r = 0; r < rows; r++) out.push(new Array(cols).fill(0));
    return out;
  }

  function clone(img) {
    return img.map(row => row.slice());
  }

  function get(img, r, c) {
    if (r < 0 || r >= img.length || c < 0 || c >= img[0].length) return 0;  // นอกขอบ = background
    return img[r][c];
  }

  function countFg(img) {
    let n = 0;
    for (const row of img) for (const v of row) n += v;
    return n;
  }

  /** ตำแหน่ง offset ของจุดที่เป็น 1 ใน SE โดยยึดจุดกึ่งกลางเป็น origin */
  function sePoints(se) {
    const pts = [];
    for (let dr = 0; dr < 3; dr++)
      for (let dc = 0; dc < 3; dc++)
        if (se[dr][dc]) pts.push([dr - 1, dc - 1]);
    return pts;
  }

  function erode(img, se) {
    const pts = sePoints(se);
    if (!pts.length) return clone(img);
    const out = empty(img.length, img[0].length);
    for (let r = 0; r < img.length; r++) {
      for (let c = 0; c < img[0].length; c++) {
        let all = 1;
        for (const [dr, dc] of pts) if (!get(img, r + dr, c + dc)) { all = 0; break; }
        out[r][c] = all;
      }
    }
    return out;
  }

  function dilate(img, se, reflect) {
    let pts = sePoints(se);
    if (!pts.length) return clone(img);
    if (reflect) pts = pts.map(([dr, dc]) => [-dr, -dc]);   // แบบเดียวกับ imdilate ของ MATLAB
    const out = empty(img.length, img[0].length);
    for (let r = 0; r < img.length; r++) {
      for (let c = 0; c < img[0].length; c++) {
        let any = 0;
        for (const [dr, dc] of pts) if (get(img, r + dr, c + dc)) { any = 1; break; }
        out[r][c] = any;
      }
    }
    return out;
  }

  // เพื่อนบ้าน 1..8 ตามเข็มนาฬิกาเริ่มที่ด้านบน
  const NB = { 1: [-1, 0], 2: [-1, 1], 3: [0, 1], 4: [1, 1],
               5: [1, 0], 6: [1, -1], 7: [0, -1], 8: [-1, -1] };

  function neighbors(img, r, c) {
    const n = {};
    for (let k = 1; k <= 8; k++) n[k] = get(img, r + NB[k][0], c + NB[k][1]);
    return n;
  }

  /** จำนวนการเปลี่ยน 0 -> 1 เมื่อไล่เพื่อนบ้าน 1,2,...,8 แล้ววนกลับมาที่ 1 */
  function crossingIndex(n) {
    const seq = [n[1], n[2], n[3], n[4], n[5], n[6], n[7], n[8], n[1]];
    let a = 0;
    for (let i = 0; i < 8; i++) if (seq[i] === 0 && seq[i + 1] === 1) a++;
    return a;
  }

  /**
   * ทำ thinning หนึ่ง pass (which = 1 หรือ 2)
   * ตรวจทุกจุดจากภาพตั้งต้นก่อน แล้วจึงลบพร้อมกันทีเดียว
   */
  function thinPass(img, which) {
    const out = clone(img);
    const removed = [];
    for (let r = 0; r < img.length; r++) {
      for (let c = 0; c < img[0].length; c++) {
        if (img[r][c] !== 1) continue;
        const n = neighbors(img, r, c);

        let b = 0;
        for (let k = 1; k <= 8; k++) b += n[k];
        if (b < 2 || b > 6) continue;                 // 1) 8-Connected 2..6
        if (crossingIndex(n) !== 1) continue;         // 2) Crossing index == 1

        if (which === 1) {                            // 3) 7,5,3 => 5,3,1
          if (n[3] * n[5] * n[7] !== 0) continue;
          if (n[1] * n[3] * n[5] !== 0) continue;
        } else {                                      // 3) 5,7,1 => 7,1,3
          if (n[1] * n[5] * n[7] !== 0) continue;
          if (n[1] * n[3] * n[7] !== 0) continue;
        }
        out[r][c] = 0;
        removed.push([r, c]);
      }
    }
    return { img: out, removed };
  }

  /** วน Pass one + Pass two จนไม่มีจุดถูกลบอีก */
  function skeletonize(img, maxRound) {
    maxRound = maxRound || 100;
    let cur = clone(img);
    const history = [];
    for (let rnd = 1; rnd <= maxRound; rnd++) {
      const a = thinPass(cur, 1);
      const b = thinPass(a.img, 2);
      history.push({ round: rnd, p1: a.removed.length, p2: b.removed.length });
      cur = b.img;
      if (!a.removed.length && !b.removed.length) break;
    }
    return { img: cur, history };
  }

  function matrixText(img) {
    return img.map(row => row.join(' ')).join('\n');
  }

  function matlabText(img, se, name) {
    name = name || 'p1';
    const body = img.map(row => row.join(' ')).join(';\n     ');
    const seBody = se.map(row => row.join(' ')).join(';');
    return `%% ภาพขนาด ${img.length}x${img[0].length}  (แถว x หลัก)\n` +
           `${name} = [${body}];\n` +
           `se = [${seBody}];\n` +
           `${name}_bw = imbinarize(${name});\n` +
           `${name}_er = imerode(${name}_bw, se);\n` +
           `${name}_di = imdilate(${name}_bw, se);\n`;
  }

  const api = { empty, clone, get, countFg, sePoints, erode, dilate,
                neighbors, crossingIndex, thinPass, skeletonize,
                matrixText, matlabText, NB };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Morph = api;
})(typeof window !== 'undefined' ? window : globalThis);
