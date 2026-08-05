# -*- coding: utf-8 -*-
"""
grid_reader.py
อ่าน "ภาพตารางแบบฝึกหัด" ด้วย OpenCV แล้วแปลงกลับเป็นเมทริกซ์ 0/1

หลักการ (ไม่ต้องใช้โมเดล AI  ใช้ image processing ล้วน ๆ จึงได้ผลแน่นอนและเร็ว)
  1. แปลงเป็นภาพระดับเทา แล้ว binarize (Otsu สำหรับภาพสแกน / adaptive สำหรับภาพถ่าย)
  2. หาบริเวณตาราง = connected component ที่ใหญ่ที่สุด (เส้นตารางกับช่องดำเชื่อมกันเป็นก้อนเดียว)
  3. หาตำแหน่งเส้นตาราง โดย morphological opening ด้วยแกนยาว ๆ
     ให้เหลือเฉพาะเส้นที่พาดยาวเกือบเต็มตาราง  ช่องที่ระบายดำจะถูกตัดทิ้ง
  4. ปรับตำแหน่งเส้นให้เป็นระยะเท่ากัน (ใช้ median ของระยะห่าง) => ได้จำนวนแถว/หลักอัตโนมัติ
  5. สุ่มอ่านพื้นที่ตรงกลางของแต่ละช่อง (เว้นขอบกันโดนเส้นตาราง) แล้วเทียบเกณฑ์ => 0 หรือ 1

รองรับอีกโหมดหนึ่ง คือภาพที่ 1 พิกเซล = 1 ช่อง (เช่น p1.png ขนาด 10x13 ที่เซฟจาก MATLAB)
"""

import cv2
import numpy as np


# ------------------------------------------------------------------ io

def imread_unicode(path):
    """cv2.imread อ่านพาธภาษาไทยไม่ได้บน Windows จึงอ่านผ่าน numpy แทน"""
    data = np.fromfile(path, dtype=np.uint8)
    if data.size == 0:
        return None
    return cv2.imdecode(data, cv2.IMREAD_COLOR)


# ------------------------------------------------------------------ binarize

def flatten_light(gray, small=240, k=None):
    """
    ลบเงา/แสงไม่สม่ำเสมอออกจากภาพถ่าย
    ประมาณ 'สีกระดาษ' ด้วย morphological closing บนภาพย่อ (เร็ว) แล้วหารกลับ
    ข้อดีกว่า adaptive threshold คือช่องที่ระบายดำทึบทั้งช่องจะไม่กลวง

    หัวใจอยู่ที่ขนาด k ต้องใหญ่กว่าก้อนสีดำที่ใหญ่ที่สุดในภาพ
    ไม่งั้นใจกลางก้อนดำจะถูกมองว่าเป็น 'สีกระดาษ' แล้วกลายเป็นรูโหว่
    """
    h, w = gray.shape
    s = min(1.0, float(small) / max(h, w))
    tiny = cv2.resize(gray, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
    if k is None:
        k = max(15, (max(tiny.shape) // 3) | 1)
    ker = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k))
    bg = cv2.morphologyEx(tiny, cv2.MORPH_CLOSE, ker)
    bg = cv2.resize(bg, (w, h), interpolation=cv2.INTER_LINEAR)
    bg[bg < 1] = 1
    return cv2.divide(gray, bg, scale=255)


def to_ink(bgr, photo=False):
    """คืนภาพขาวดำที่ 'หมึก' (ส่วนที่เข้ม) = 255"""
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    if photo:
        # ห้าม medianBlur ก่อน  มันกัดเส้นตารางบาง ๆ ให้ขาดเป็นท่อน
        # การย่อภาพด้วย INTER_AREA ใน flatten_light กรองสัญญาณรบกวนให้อยู่แล้ว
        gray = flatten_light(gray)
    # หาค่า threshold จากภาพที่เบลอแล้ว (ทนสัญญาณรบกวน) แต่ไปใช้กับภาพคมชัด
    # ถ้า threshold ภาพเบลอตรง ๆ เส้นตารางบาง 1 px จะจางจนหลุดหายไปทั้งเส้น
    blur = cv2.GaussianBlur(gray, (3, 3), 0)
    t, _ = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
    _, bw = cv2.threshold(gray, t, 255, cv2.THRESH_BINARY_INV)
    return bw


# ------------------------------------------------------------------ ROI

def largest_box(bw, min_frac=0.02):
    """
    หากรอบของ connected component ที่ใหญ่ที่สุด = บริเวณตาราง
    คืน (x, y, w, h) หรือ None
    """
    n, _, stats, _ = cv2.connectedComponentsWithStats(bw, 8)
    if n <= 1:
        return None
    best, best_area = None, 0
    total = bw.shape[0] * bw.shape[1]
    for i in range(1, n):
        x, y, w, h, _ = stats[i]
        area = w * h
        if area < total * min_frac:
            continue
        if w < 20 or h < 20:
            continue
        if area > best_area:
            best, best_area = (int(x), int(y), int(w), int(h)), area
    return best


# ------------------------------------------------------------------ grid lines

def roi_mask(bw):
    """
    หน้ากากสำหรับหา 'บริเวณตาราง' เท่านั้น  ขยายเล็กน้อยเพื่อเชื่อมเส้นที่ขาดเป็นรู
    ถ้าเส้นตารางขาดแม้แต่จุดเดียว connected component จะแตกเป็นหลายก้อนทันที
    (การอ่านค่าแต่ละช่องยังใช้ภาพต้นฉบับ ไม่ได้ใช้หน้ากากนี้)
    """
    return cv2.dilate(bw, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)))


def profile_tol(shape):
    """ระยะเผื่อ (พิกเซล) สำหรับเส้นตารางที่เบี้ยวไปมา"""
    return int(min(8, max(2, round(min(shape[0], shape[1]) * 0.008))))


def axis_profile(bw, axis, tol=None):
    """
    สัดส่วน 'ความยาวที่มีหมึก' ของแต่ละหลัก (axis='v') หรือแต่ละแถว (axis='h')
    เส้นตารางที่ลากเต็มความสูง/ความกว้าง จะได้ค่าใกล้ 1.0

    ภาพจริงเส้นมักเบี้ยวไปมาระดับ 1-3 พิกเซล ทำให้ไม่มีหลักไหนมีหมึกครบทั้งแนว
    จึงขยายภาพในแนวขวางกับเส้นก่อน (tol พิกเซล) เส้นที่เบี้ยวจะกลับมาเต็มแนว
    """
    if tol is None:
        tol = profile_tol(bw.shape)
    ker = (2 * tol + 1, 1) if axis == 'v' else (1, 2 * tol + 1)
    b = cv2.dilate(bw, cv2.getStructuringElement(cv2.MORPH_RECT, ker)) > 0
    return (b.mean(axis=0) if axis == 'v' else b.mean(axis=1)).astype(np.float32)


def _max_filter(prof, rad):
    """สไลด์หาค่าสูงสุดในรัศมี rad  เผื่อกรณีเส้นเบี้ยวไปมาไม่กี่พิกเซล"""
    rad = int(rad)
    if rad <= 0:
        return prof
    k = cv2.getStructuringElement(cv2.MORPH_RECT, (2 * rad + 1, 1))
    a = np.clip(prof * 255.0, 0, 255).astype(np.uint8).reshape(1, -1)
    return cv2.dilate(a, k).reshape(-1).astype(np.float32) / 255.0


def border_range(prof, strong=0.9, tol=2):
    """
    หาขอบนอกสุดของตาราง = เส้นที่ลากเต็มแนวเส้นแรกและเส้นสุดท้าย
    ช่วยตัดสิ่งแปลกปลอมที่ติดมากับกรอบ เช่น จุดของเส้นแกนประ

    axis_profile ขยายภาพไว้แล้ว แถบที่ได้จึงกว้างกว่าเส้นจริงข้างละ tol
    ต้องหักออก ไม่งั้นความกว้างตารางจะเกินจริงแล้วเส้นแบ่งเลื่อนสะสมไปทางท้าย

    ระวังกรณีแถวติดขอบถูกระบายดำทั้งแถว  แถบแรกจะกลายเป็น เส้นขอบ+ช่องดำ ติดกัน
    ถ้าใช้จุดกึ่งกลางแถบจะเพี้ยนไปครึ่งช่อง จึงใช้กึ่งกลางเฉพาะตอนแถบแคบพอ
    """
    # ปรับเกณฑ์ตามเส้นที่ดีที่สุดที่มีจริง  เผื่อภาพที่เส้นขาดวิ่นบ้าง
    strong = min(strong, max(0.7, 0.95 * float(prof.max())))
    idx = np.flatnonzero(prof >= strong)
    if idx.size < 2:
        return None

    end = idx[0]                       # ปลายของแถบแรก
    for v in idx:
        if v <= end + 1:
            end = v
        else:
            break
    start = idx[-1]                    # ต้นของแถบสุดท้าย
    for v in idx[::-1]:
        if v >= start - 1:
            start = v
        else:
            break

    wide = 2 * tol + 6
    lo = (idx[0] + end) / 2.0 if end - idx[0] <= wide else idx[0] + tol
    hi = (start + idx[-1]) / 2.0 if idx[-1] - start <= wide else idx[-1] - tol
    return (float(lo), float(hi)) if hi - lo >= 4 else None


def count_cells(prof, lo, hi, thr=0.85, min_cell=8.0, nmax=60, tol=2):
    """
    หาจำนวนช่องบนแกนหนึ่ง ๆ

    ใช้ข้อเท็จจริงว่าตารางแบ่งช่องเท่ากันหมด  จึงลองสมมุติจำนวนช่อง n ไล่ขึ้นไป
    แล้วตรวจว่า 'เส้นแบ่งทุกเส้น' ที่ n นั้นทำนายไว้ มีเส้นหมึกจริงรองรับครบหรือไม่
    ถ้าครบทุกเส้นถือว่าใช้ได้ แล้วเลือก n ที่ใหญ่ที่สุดที่ยังใช้ได้

    วิธีนี้ทนกว่าการไล่จับเส้นทีละเส้นมาก เพราะไม่ต้องพึ่งว่าจะจับเส้นได้ครบ
    """
    span = hi - lo
    if span < 4:
        return None
    # ช่องต้องใหญ่กว่าระยะเผื่อพอสมควร ไม่งั้นแถบเส้นจะกว้างจนตำแหน่งไหนก็ 'ผ่าน' หมด
    min_cell = max(min_cell, 2.5 * (2 * tol + 1))
    best = None
    for n in range(2, nmax + 1):
        cell = span / n
        if cell < min_cell:
            break
        pm = _max_filter(prof, max(2, int(round(cell * 0.18))))
        inner = [lo + span * i / n for i in range(1, n)]
        if any(pm[int(round(p))] < thr for p in inner):
            continue
        # กันกรณีภาพดำเกือบทั้งแผ่น ซึ่งจำนวนช่องไหนก็ 'ผ่าน' หมด
        mids = [lo + span * (i + 0.5) / n for i in range(n)]
        if all(pm[int(round(p))] >= thr for p in mids):
            continue
        best = n
    return best


# ------------------------------------------------------------------ deskew

def deskew(bgr, photo=False, max_angle=15.0):
    """
    หมุนภาพให้ตารางตั้งตรง โดยดูมุมของกรอบสี่เหลี่ยมที่พอดีกับตาราง
    คืน (ภาพที่หมุนแล้ว, มุมที่หมุนเป็นองศา)
    """
    bw = roi_mask(to_ink(bgr, photo))
    n, labels, stats, _ = cv2.connectedComponentsWithStats(bw, 8)
    if n <= 1:
        return bgr, 0.0
    idx = 1 + int(np.argmax([stats[i, 2] * stats[i, 3] for i in range(1, n)]))
    pts = cv2.findNonZero((labels == idx).astype(np.uint8))
    if pts is None or len(pts) < 8:
        return bgr, 0.0

    ang = cv2.minAreaRect(pts)[-1]
    if ang > 45:
        ang -= 90
    elif ang < -45:
        ang += 90
    if abs(ang) < 0.25 or abs(ang) > max_angle:
        return bgr, 0.0

    h, w = bgr.shape[:2]
    m = cv2.getRotationMatrix2D((w / 2.0, h / 2.0), ang, 1.0)
    out = cv2.warpAffine(bgr, m, (w, h), flags=cv2.INTER_CUBIC,
                         borderMode=cv2.BORDER_CONSTANT,
                         borderValue=(255, 255, 255))
    return out, float(ang)


# ------------------------------------------------------------------ perspective

def _order_quad(p):
    """เรียงมุมเป็น ซ้ายบน, ขวาบน, ขวาล่าง, ซ้ายล่าง"""
    s, d = p.sum(axis=1), np.diff(p, axis=1).ravel()
    return np.array([p[np.argmin(s)], p[np.argmin(d)],
                     p[np.argmax(s)], p[np.argmax(d)]], dtype=np.float32)


def find_quad(bw, min_fill=0.75, box_cover=0.9):
    """
    หาสี่เหลี่ยมรอบนอกของตาราง  คืน 4 มุม หรือ None

    ตรวจสองชั้น  ชั้นแรก สี่เหลี่ยมต้องกินพื้นที่เกือบเท่า convex hull
    ชั้นสอง กรอบของสี่เหลี่ยมต้องเกือบเท่ากรอบของก้อนหมึกจริง
    ถ้าภาพขาดหายไปบางมุม จะได้สี่เหลี่ยมคางหมูเบี้ยว ๆ ที่กรอบเล็กกว่าของจริงชัดเจน
    ปล่อยผ่านไปจะทำให้ warp ภาพเพี้ยนหนักกว่าไม่ทำอะไรเลย
    """
    n, labels, stats, _ = cv2.connectedComponentsWithStats(bw, 8)
    if n <= 1:
        return None
    idx = 1 + int(np.argmax([stats[i, 2] * stats[i, 3] for i in range(1, n)]))
    cnts, _ = cv2.findContours((labels == idx).astype(np.uint8),
                               cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return None
    hull = cv2.convexHull(max(cnts, key=cv2.contourArea))
    area = cv2.contourArea(hull)
    if area < 400:
        return None
    box_area = float(stats[idx, 2] * stats[idx, 3])

    peri = cv2.arcLength(hull, True)
    for eps in (0.01, 0.02, 0.03, 0.04, 0.05, 0.07, 0.09):
        ap = cv2.approxPolyDP(hull, eps * peri, True)
        if len(ap) != 4:
            continue
        quad = ap.reshape(4, 2).astype(np.float32)
        if cv2.contourArea(quad) < min_fill * area:
            continue
        qw = quad[:, 0].max() - quad[:, 0].min()
        qh = quad[:, 1].max() - quad[:, 1].min()
        if box_area > 0 and qw * qh < box_cover * box_area:
            continue
        return _order_quad(quad)
    return None


def rectify(bgr, photo=False, margin=12):
    """
    แก้ภาพที่ถ่ายเอียงเป็นมุม (perspective) ให้ตารางกลับมาเป็นสี่เหลี่ยมตรง
    คืน (ภาพที่แก้แล้ว, สำเร็จหรือไม่)
    """
    quad = find_quad(roi_mask(to_ink(bgr, photo)))
    if quad is None:
        return bgr, False
    tl, tr, br, bl = quad
    w = max(np.linalg.norm(br - bl), np.linalg.norm(tr - tl))
    h = max(np.linalg.norm(tr - br), np.linalg.norm(tl - bl))
    if w < 40 or h < 40 or w > 6000 or h > 6000:
        return bgr, False

    # ตารางตรงอยู่แล้ว -> ครอบตัดเฉย ๆ ห้าม warp
    # การ resample ทำให้เส้นตารางบาง 1 px จางลงจนหลุด threshold ได้
    skew = max(abs(tl[1] - tr[1]), abs(bl[1] - br[1]),
               abs(tl[0] - bl[0]), abs(tr[0] - br[0]))
    if skew <= max(2.0, 0.01 * max(w, h)):
        x0 = int(max(0, quad[:, 0].min() - margin))
        y0 = int(max(0, quad[:, 1].min() - margin))
        x1 = int(min(bgr.shape[1], quad[:, 0].max() + margin + 1))
        y1 = int(min(bgr.shape[0], quad[:, 1].max() + margin + 1))
        if x1 - x0 > 40 and y1 - y0 > 40:
            return bgr[y0:y1, x0:x1].copy(), False

    m = float(margin)
    dst = np.array([[m, m], [w + m, m], [w + m, h + m], [m, h + m]],
                   dtype=np.float32)
    out = cv2.warpPerspective(bgr, cv2.getPerspectiveTransform(quad, dst),
                              (int(w + 2 * m), int(h + 2 * m)),
                              flags=cv2.INTER_CUBIC,
                              borderMode=cv2.BORDER_CONSTANT,
                              borderValue=(255, 255, 255))
    return out, True


def edges(lo, hi, n):
    """แบ่งช่วง lo..hi ออกเป็น n ช่องเท่า ๆ กัน คืนขอบทั้ง n+1 เส้น"""
    return [lo + (hi - lo) * i / n for i in range(n + 1)]


# ------------------------------------------------------------------ sampling

def sample_cells(bw, xs, ys, thresh=0.5, margin=0.25):
    """
    อ่านค่าแต่ละช่อง โดยดูเฉพาะพื้นที่ตรงกลาง (เว้นขอบ margin กันโดนเส้นตาราง)
    คืน (grid 0/1, ratio ความเข้มของแต่ละช่อง)
    """
    H, W = bw.shape
    grid, ratio = [], []
    for r in range(len(ys) - 1):
        row_g, row_r = [], []
        for c in range(len(xs) - 1):
            x0, x1 = xs[c], xs[c + 1]
            y0, y1 = ys[r], ys[r + 1]
            mx, my = (x1 - x0) * margin, (y1 - y0) * margin
            a = max(0, int(round(x0 + mx)))
            b = min(W, max(a + 1, int(round(x1 - mx))))
            u = max(0, int(round(y0 + my)))
            v = min(H, max(u + 1, int(round(y1 - my))))
            patch = bw[u:v, a:b]
            f = float(patch.mean()) / 255.0 if patch.size else 0.0
            row_r.append(f)
            row_g.append(1 if f >= thresh else 0)
        grid.append(row_g)
        ratio.append(row_r)
    return grid, ratio


# ------------------------------------------------------------------ pixel mode

def is_pixel_image(bgr, limit=64):
    h, w = bgr.shape[:2]
    return h <= limit and w <= limit


def read_pixel_image(bgr, invert=None):
    """
    ภาพที่ 1 พิกเซล = 1 ช่อง เช่น p1.png ที่เซฟจาก MATLAB
    invert=None คือเดาให้เอง โดยถือว่า 'วัตถุ' คือสีที่มีจำนวนน้อยกว่า
    """
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    dark = (gray < 128).astype(int)
    if invert is None:
        invert = dark.sum() > dark.size / 2      # ถ้าดำเยอะเกินครึ่ง วัตถุน่าจะเป็นสีขาว
    fg = 1 - dark if invert else dark
    return fg.tolist()


# ------------------------------------------------------------------ main entry

def _fit_grid(bw, box, rows=None, cols=None, pad_frac=0.015):
    """
    วางตารางลงบนกรอบ box  หาขอบตารางจริงและจำนวนช่อง
    คืน (ok, x, y, w, h, xs, ys, n_rows, n_cols, det_r, det_c)

    ที่ต้องเผื่อขอบออกไปก่อน (pad) เพราะ bounding box บางทีกินเส้นกรอบนอกไม่ครบ
    ไปหนึ่งถึงสองพิกเซล  ทำให้หาเส้นขอบด้านนั้นไม่เจอแล้วนับช่องขาดไปหนึ่งช่อง
    """
    H, W = bw.shape
    x, y, w, h = [int(round(v)) for v in box]
    p = max(4, int(round(pad_frac * max(w, h))))
    x0, y0 = max(0, x - p), max(0, y - p)
    x1, y1 = min(W, x + w + p), min(H, y + h + p)
    if x1 - x0 < 8 or y1 - y0 < 8:
        return (False, x, y, max(2, w), max(2, h), [], [], 0, 0, None, None)

    sub = bw[y0:y1, x0:x1]
    tol = profile_tol(sub.shape)
    px, py = axis_profile(sub, 'v', tol), axis_profile(sub, 'h', tol)
    lox, hix = border_range(px, tol=tol) or (0.0, float(sub.shape[1] - 1))
    loy, hiy = border_range(py, tol=tol) or (0.0, float(sub.shape[0] - 1))

    det_c = count_cells(px, lox, hix, tol=tol)
    det_r = count_cells(py, loy, hiy, tol=tol)
    n_cols = int(cols) if cols else det_c
    n_rows = int(rows) if rows else det_r

    bx, by = int(round(x0 + lox)), int(round(y0 + loy))
    bwid, bhei = max(2, int(round(hix - lox))), max(2, int(round(hiy - loy)))
    if not n_cols or not n_rows:
        return (False, bx, by, bwid, bhei, [], [], 0, 0, det_r, det_c)

    xs = [x0 + v for v in edges(lox, hix, n_cols)]
    ys = [y0 + v for v in edges(loy, hiy, n_rows)]
    return (True, bx, by, bwid, bhei, xs, ys, n_rows, n_cols, det_r, det_c)


def analyze(bgr, roi=None, rows=None, cols=None, photo=False,
            thresh=0.5, invert=False):
    """
    วิเคราะห์ภาพตาราง คืน dict
      ok      True/False
      msg     ข้อความอธิบายผล
      roi     (x, y, w, h) บริเวณตารางที่ใช้
      rows    จำนวนแถว
      cols    จำนวนหลัก
      xs, ys  พิกัดเส้นตาราง (พิกัดของภาพเต็ม)
      grid    เมทริกซ์ 0/1
      ratio   สัดส่วนความเข้มของแต่ละช่อง ใช้ดูว่าช่องไหนก้ำกึ่ง
    """
    out = {"ok": False, "msg": "", "roi": None, "rows": 0, "cols": 0,
           "xs": [], "ys": [], "grid": [], "ratio": []}

    bw = to_ink(bgr, photo)
    if invert:
        bw = cv2.bitwise_not(bw)

    auto_roi = roi is None
    if auto_roi:
        rm = roi_mask(bw)
        quad = find_quad(rm)
        boxes = []
        if quad is not None:                     # กรอบจาก 4 มุม มักแม่นกว่า
            ax, ay = quad[:, 0].min(), quad[:, 1].min()
            boxes.append((ax, ay, quad[:, 0].max() - ax, quad[:, 1].max() - ay))
        lb = largest_box(rm)
        if lb is not None and lb not in boxes:
            boxes.append(lb)
        if not boxes:
            out["msg"] = "หาบริเวณตารางไม่พบ  ลองลากเมาส์เลือกกรอบตารางเอง"
            return out
    else:
        boxes = [roi]

    fit = None
    for box in boxes:                            # ลองทีละกรอบ ใช้อันแรกที่อ่านได้
        f = _fit_grid(bw, box, rows, cols)
        if fit is None or (f[0] and not fit[0]):
            fit = f
        if f[0]:
            break

    ok, x, y, w, h, xs, ys, n_rows, n_cols, det_r, det_c = fit
    out["roi"] = (x, y, w, h)
    if not ok:
        out["msg"] = ("ตรวจจำนวนช่องอัตโนมัติไม่ได้  กรุณาระบุจำนวนแถว/หลักเอง"
                      "  หรือลากเมาส์เลือกกรอบตาราง  (ตรวจได้ %s x %s)"
                      % (det_r, det_c))
        return out
    grid, ratio = sample_cells(bw, xs, ys, thresh)

    flat = [v for row in ratio for v in row]
    fuzzy = sum(1 for v in flat if 0.35 < v < 0.65)

    out.update(ok=True, rows=n_rows, cols=n_cols, xs=xs, ys=ys,
               grid=grid, ratio=ratio,
               msg="อ่านได้ %d แถว x %d หลัก   จุดวัตถุ %d ช่อง%s%s"
                   % (n_rows, n_cols, sum(sum(r) for r in grid),
                      "" if auto_roi else "   (ใช้กรอบที่เลือกเอง)",
                      "   *มี %d ช่องที่ก้ำกึ่ง ลองปรับเกณฑ์ดู" % fuzzy if fuzzy else ""))
    return out


def prepare(path, auto_deskew=True, photo=False):
    """
    เปิดไฟล์ภาพ ย่อให้ขนาดพอเหมาะ และหมุนแก้เอียงให้อัตโนมัติ
    คืน (ภาพ BGR ที่พร้อมวิเคราะห์, ข้อมูลประกอบ) หรือ (None, ข้อความ error)
    """
    bgr = imread_unicode(path)
    if bgr is None:
        return None, "เปิดไฟล์ภาพไม่ได้ (ไฟล์เสียหรือไม่ใช่ไฟล์ภาพ)"

    info = {"pixel": is_pixel_image(bgr), "angle": 0.0,
            "size": (bgr.shape[1], bgr.shape[0]), "scale": 1.0}
    if info["pixel"]:
        return bgr, info

    big = max(bgr.shape[:2])
    if big > 1600:                      # ย่อลงเพื่อความเร็ว ความแม่นยำไม่เสีย
        s = 1600.0 / big
        bgr = cv2.resize(bgr, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
        info["scale"] = s
    if auto_deskew:
        bgr, info["angle"] = deskew(bgr, photo)
    return bgr, info


def read_file(path, auto_deskew=True, pixel_invert=None, **kw):
    """อ่านไฟล์ภาพแล้ววิเคราะห์  เลือกโหมดพิกเซลอัตโนมัติถ้าภาพเล็กมาก"""
    bgr, info = prepare(path, auto_deskew, kw.get("photo", False))
    if bgr is None:
        return {"ok": False, "msg": info, "grid": []}, None
    if info["pixel"]:
        grid = read_pixel_image(bgr, pixel_invert)
        return {"ok": True, "pixel": True, "grid": grid,
                "rows": len(grid), "cols": len(grid[0]),
                "xs": [], "ys": [], "ratio": [], "roi": None,
                "msg": "ภาพเล็กมาก (%dx%d) อ่านแบบ 1 พิกเซล = 1 ช่อง"
                       % (bgr.shape[0], bgr.shape[1])}, bgr
    res = analyze(bgr, **kw)
    res["pixel"] = False
    if info["angle"]:
        res["msg"] += "   (หมุนแก้เอียง %.1f องศา)" % info["angle"]
    return res, bgr
