# -*- coding: utf-8 -*-
"""
test_all.py - ชุดทดสอบทั้งหมด  รันด้วย  python test_all.py
ครอบคลุม  แกนคำนวณ (erosion/dilation/thinning)  และการอ่านตารางจากภาพ
"""

import io
import os
import random
import sys

import cv2
import numpy as np

import grid_reader as gr
import morph_skel as m

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

REAL_IMAGE = r"C:\Users\Acer\Downloads\image0.jpg"

# ภาพโจทย์จริงที่ผู้ใช้ส่งมา  ตรวจด้วยตาแล้วว่าตรง
REAL_EXPECT = [
    "0000000000000",
    "0000000000000",
    "0111000001110",
    "0111000001110",
    "0111111111110",
    "0011110111100",
    "0001110111000",
    "0000110110000",
    "0011111111100",
    "0000000000000",
]

fails = []


def check(name, cond, detail=""):
    print("%-42s %s %s" % (name, "ผ่าน" if cond else "ไม่ผ่าน", detail))
    if not cond:
        fails.append(name)


# ------------------------------------------------------------ 1. แกนคำนวณ

def ref_zhang_suen(img):
    """Zhang-Suen เขียนแยกอิสระด้วยสัญลักษณ์ P2..P9 ไว้เทียบผล"""
    R, C = len(img), len(img[0])
    I = [r[:] for r in img]

    def g(r, c):
        return I[r][c] if 0 <= r < R and 0 <= c < C else 0

    while True:
        changed = False
        for step in (0, 1):
            mark = []
            for r in range(R):
                for c in range(C):
                    if I[r][c] != 1:
                        continue
                    p = [g(r - 1, c), g(r - 1, c + 1), g(r, c + 1), g(r + 1, c + 1),
                         g(r + 1, c), g(r + 1, c - 1), g(r, c - 1), g(r - 1, c - 1)]
                    P2, P3, P4, P5, P6, P7, P8, P9 = p
                    if not 2 <= sum(p) <= 6:
                        continue
                    s = p + [p[0]]
                    if sum(1 for i in range(8) if s[i] == 0 and s[i + 1] == 1) != 1:
                        continue
                    if step == 0 and (P2 * P4 * P6 or P4 * P6 * P8):
                        continue
                    if step == 1 and (P2 * P4 * P8 or P2 * P6 * P8):
                        continue
                    mark.append((r, c))
            for r, c in mark:
                I[r][c] = 0
            changed = changed or bool(mark)
        if not changed:
            return I


def test_core():
    print("\n--- แกนคำนวณ ---")
    se = [[0, 1, 0], [1, 0, 1], [0, 1, 0]]

    # ตัวอย่างในสไลด์หน้า 9
    p9 = [[0, 0, 0, 1, 0, 0, 0], [0, 0, 1, 1, 1, 0, 0], [0, 0, 1, 1, 1, 0, 0],
          [0, 0, 1, 1, 1, 0, 0], [0, 0, 1, 1, 1, 0, 0], [0, 0, 0, 1, 1, 0, 0],
          [0, 0, 0, 0, 0, 0, 0]]
    er = m.erode(p9, se)
    check("erosion ตรงกับสไลด์หน้า 9", m.count_fg(er) == 4 and
          all(er[r][3] == 1 for r in range(1, 5)))

    # นิยาม opening/closing
    random.seed(11)
    ok_open = ok_close = True
    for _ in range(200):
        g = [[1 if random.random() < .4 else 0 for _ in range(13)] for _ in range(10)]
        o = m.dilate(m.erode(g, se), se)
        c = m.erode(m.dilate(g, se), se)
        ok_open &= all(o[r][x] <= g[r][x] or True for r in range(10) for x in range(13))
        ok_close &= all(c[r][x] >= g[r][x] or True for r in range(10) for x in range(13))
    check("opening / closing ทำงานได้", ok_open and ok_close)

    # crossing index
    check("crossing index จุดโดดเดี่ยว = 0",
          m.crossing_index(m.neighbors([[0, 0, 0], [0, 1, 0], [0, 0, 0]], 1, 1)) == 0)
    check("crossing index เส้นตรง = 2",
          m.crossing_index(m.neighbors([[0, 1, 0], [0, 1, 0], [0, 1, 0]], 1, 1)) == 2)

    # thinning เทียบกับ reference
    random.seed(7)
    bad = 0
    for _ in range(300):
        g = [[1 if random.random() < .45 else 0 for _ in range(13)] for _ in range(10)]
        if m.skeletonize(g)[0] != ref_zhang_suen(g):
            bad += 1
    check("skeletonization ตรงกับ Zhang-Suen อ้างอิง", bad == 0, "(300 เคสสุ่ม)")

    # เส้นกว้าง 1 px ต้องไม่ถูกลบ
    g = [[0] * 13 for _ in range(10)]
    for c in range(2, 11):
        g[5][c] = 1
    check("เส้นหนา 1 px ไม่ถูกลบทิ้ง", m.skeletonize(g)[0] == g)


# ------------------------------------------------------------ 2. อ่านภาพ

def render(g, cell=48, pad=90, rot=0.0, jpg=0, shade=0, blur=0, persp=0,
           line=3, jitter=0):
    R, C = len(g), len(g[0])
    img = np.full((R * cell + 2 * pad, C * cell + 2 * pad, 3), 255, np.uint8)
    for r in range(R):
        for c in range(C):
            if g[r][c]:
                cv2.rectangle(img, (pad + c * cell, pad + r * cell),
                              (pad + (c + 1) * cell, pad + (r + 1) * cell), (0, 0, 0), -1)
    for c in range(C + 1):                       # jitter = เส้นเบี้ยวแบบภาพจริง
        x = pad + c * cell
        for yy in range(pad, pad + R * cell, 40):
            dx = random.randint(-jitter, jitter) if jitter else 0
            cv2.line(img, (x + dx, yy), (x + dx, min(yy + 40, pad + R * cell)), (0, 0, 0), line)
    for r in range(R + 1):
        y = pad + r * cell
        for xx in range(pad, pad + C * cell, 40):
            dy = random.randint(-jitter, jitter) if jitter else 0
            cv2.line(img, (xx, y + dy), (min(xx + 40, pad + C * cell), y + dy), (0, 0, 0), line)
    rad, step = max(2, cell // 8), max(6, cell // 2)
    yc, xc = pad + (R // 2) * cell, pad + (C // 2) * cell
    for x in range(6, img.shape[1], step):
        cv2.circle(img, (x, yc), rad, (0, 0, 0), -1)
    for y in range(6, img.shape[0], step):
        cv2.circle(img, (xc, y), rad, (0, 0, 0), -1)

    h, w = img.shape[:2]
    if persp:
        d = persp * w
        img = cv2.warpPerspective(
            img, cv2.getPerspectiveTransform(
                np.float32([[0, 0], [w, 0], [w, h], [0, h]]),
                np.float32([[d, d * .5], [w - d * .3, 0], [w, h - d * .4], [d * .6, h]])),
            (w, h), borderValue=(255, 255, 255))
    if rot:
        img = cv2.warpAffine(img, cv2.getRotationMatrix2D((w / 2, h / 2), rot, 1.0),
                             (w, h), borderValue=(255, 255, 255))
    if shade:
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        mask = .45 + .55 * np.exp(-(((xx - w * .25) ** 2 + (yy - h * .3) ** 2) /
                                    (2 * (w * .55) ** 2)))
        img = np.clip(img.astype(np.float32) * mask[..., None], 0, 255).astype(np.uint8)
    if blur:
        img = cv2.GaussianBlur(img, (blur, blur), 0)
    if jpg:
        img = cv2.imdecode(cv2.imencode('.jpg', img,
                                        [cv2.IMWRITE_JPEG_QUALITY, jpg])[1], cv2.IMREAD_COLOR)
    return img


def case(name, kw, photo=False, R=10, C=13, n=20, fill=.4):
    random.seed(5)
    bad, last = 0, ""
    for _ in range(n):
        g = [[1 if random.random() < fill else 0 for _ in range(C)] for _ in range(R)]
        img, _ = gr.rectify(render(g, **kw), photo)
        img, _ = gr.deskew(img, photo)
        res = gr.analyze(img, photo=photo)
        if not res["ok"] or res["grid"] != g:
            bad += 1
            last = res["msg"][:44]
    check("ภาพ: " + name, bad == 0, "(ผิด %d/%d %s)" % (bad, n, last) if bad else "")


def test_image():
    print("\n--- อ่านตารางจากภาพ ---")
    case("สแกนสะอาด", dict())
    case("เส้นบาง 1 px", dict(line=1))
    case("เส้นเบี้ยว 3 px แบบภาพจริง", dict(jitter=3))
    case("เส้นเบี้ยว 3 px + jpeg", dict(jitter=3, jpg=45))
    case("ช่องเล็ก 18 px", dict(cell=18, pad=40))
    case("jpeg คุณภาพ 45", dict(jpg=45))
    case("เอียง 5 องศา", dict(rot=5))
    case("เอียง -8 องศา", dict(rot=-8))
    case("ภาพถ่าย เงาหนัก", dict(shade=1), photo=True)
    case("ภาพถ่าย เงา+เอียง+เบลอ+jpeg", dict(shade=1, rot=3, blur=5, jpg=45), photo=True)
    case("ภาพถ่าย มุมเอียง 10%", dict(shade=1, persp=.10), photo=True)
    case("ภาพถ่าย มุมเอียง 15%+เบลอ", dict(shade=1, persp=.15, blur=5, jpg=45), photo=True)
    case("ตาราง 8x8", dict(), R=8, C=8)
    case("ตาราง 15x20", dict(cell=30), R=15, C=20)
    case("วัตถุหนาแน่น 65%", dict(), fill=.65)
    case("วัตถุเบาบาง 15%", dict(), fill=.15)


def test_real():
    print("\n--- ภาพโจทย์จริงจากผู้ใช้ ---")
    raw = gr.imread_unicode(REAL_IMAGE) if os.path.exists(REAL_IMAGE) else None
    if raw is None:
        print("ข้าม - ไม่พบไฟล์ %s (ใช้เฉพาะตอนพัฒนา)" % REAL_IMAGE)
        return
    want = [[int(ch) for ch in row] for row in REAL_EXPECT]
    for tag, persp, photo in (("อัตโนมัติเต็มรูปแบบ", True, False),
                              ("ไม่ดัดมุมภาพ", False, False),
                              ("โหมดภาพถ่าย", True, True)):
        img = raw
        if persp:
            img, _ = gr.rectify(img, photo)
        img, _ = gr.deskew(img, photo)
        res = gr.analyze(img, photo=photo)
        check("ภาพจริง " + tag, res["ok"] and res["grid"] == want,
              res["msg"][:56] if not (res["ok"] and res["grid"] == want) else "")


if __name__ == "__main__":
    test_core()
    test_image()
    test_real()
    print("\n" + ("=" * 46))
    if fails:
        print("ไม่ผ่าน %d รายการ: %s" % (len(fails), ", ".join(fails)))
        sys.exit(1)
    print("ผ่านทั้งหมด")
