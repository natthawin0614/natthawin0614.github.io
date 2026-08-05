# -*- coding: utf-8 -*-
"""
โปรแกรมคำนวณ Erosion / Dilation / Opening / Closing และ Skeletonization
(Pass one / Pass two ตามสไลด์ 2.4.3 Skeletonization)

การทำงานแบ่งเป็น 2 ส่วนตามที่กำหนด
  ส่วนที่ 1  ป็อปอัพตาราง 3x3  ใช้เมาส์คลิกเลือกช่องที่เป็นสีดำ  = Structuring Element (SE)
  ส่วนที่ 2  ตารางภาพ 13 ช่องแนวนอน x 10 ช่องแนวตั้ง  วาดวัตถุด้วยเมาส์ แล้วเลือกวิธีประมวลผล

นิยามที่ใช้ (ตามสไลด์)
  Erosion  ผลเป็น 1 เมื่อ "ทุกจุด" ที่เป็น 1 ของ SE ชนกับวัตถุ  มิฉะนั้นเป็น 0
  Dilation ผลเป็น 1 เมื่อ "จุดใดจุดหนึ่ง" ที่เป็น 1 ของ SE ชนกับวัตถุ
  Opening  = Erosion แล้วตามด้วย Dilation
  Closing  = Dilation แล้วตามด้วย Erosion

เลขเพื่อนบ้าน 8 ทิศ เรียงตามเข็มนาฬิกาเริ่มที่ด้านบน (ตามสไลด์หน้า 20)
        8  1  2
        7  P  3
        6  5  4

Pass one : 8-Connected 2..6 , Crossing index == 1 , 3*5*7 == 0 , 1*3*5 == 0
Pass two : 8-Connected 2..6 , Crossing index == 1 , 1*5*7 == 0 , 1*3*7 == 0

รัน:  python morph_skel.py
"""

import tkinter as tk
from tkinter import ttk, messagebox

try:
    import image_import
except Exception:                       # เปิดโปรแกรมได้แม้ยังไม่ได้ลง opencv
    image_import = None

ROWS, COLS = 10, 13          # แนวตั้ง 10 ช่อง , แนวนอน 13 ช่อง

FONT = ("Tahoma", 10)
FONT_B = ("Tahoma", 10, "bold")
FONT_T = ("Tahoma", 12, "bold")

C_FG = "#111111"             # foreground = 1 = สีดำ
C_BG = "#ffffff"
C_LINE = "#b9c0c8"
C_LINE5 = "#7d8894"
C_MARK = "#e23b3b"           # จุดที่เพิ่งถูกลบในรอบนั้น


# ------------------------------------------------------------------ core

def empty(rows=ROWS, cols=COLS):
    return [[0] * cols for _ in range(rows)]


def clone(img):
    return [row[:] for row in img]


def get(img, r, c):
    """นอกขอบภาพถือเป็น background (0)"""
    if 0 <= r < len(img) and 0 <= c < len(img[0]):
        return img[r][c]
    return 0


def se_points(se):
    """คืนตำแหน่ง offset ของจุดที่เป็น 1 ใน SE โดยยึดจุดกึ่งกลางเป็น origin"""
    return [(dr - 1, dc - 1) for dr in range(3) for dc in range(3) if se[dr][dc]]


def erode(img, se):
    pts = se_points(se)
    if not pts:
        return clone(img)
    out = empty(len(img), len(img[0]))
    for r in range(len(img)):
        for c in range(len(img[0])):
            out[r][c] = 1 if all(get(img, r + dr, c + dc) for dr, dc in pts) else 0
    return out


def dilate(img, se, reflect=False):
    pts = se_points(se)
    if not pts:
        return clone(img)
    if reflect:                       # แบบเดียวกับ imdilate ของ MATLAB
        pts = [(-dr, -dc) for dr, dc in pts]
    out = empty(len(img), len(img[0]))
    for r in range(len(img)):
        for c in range(len(img[0])):
            out[r][c] = 1 if any(get(img, r + dr, c + dc) for dr, dc in pts) else 0
    return out


# เลขเพื่อนบ้าน ตามเข็มนาฬิกา เริ่มที่ด้านบน
NB = {1: (-1, 0), 2: (-1, 1), 3: (0, 1), 4: (1, 1),
      5: (1, 0), 6: (1, -1), 7: (0, -1), 8: (-1, -1)}


def neighbors(img, r, c):
    return {k: get(img, r + dr, c + dc) for k, (dr, dc) in NB.items()}


def crossing_index(n):
    """จำนวนการเปลี่ยน 0 -> 1 เมื่อไล่เพื่อนบ้าน 1,2,...,8 แล้ววนกลับมาที่ 1"""
    seq = [n[i] for i in range(1, 9)] + [n[1]]
    return sum(1 for i in range(8) if seq[i] == 0 and seq[i + 1] == 1)


def thin_pass(img, which):
    """
    ทำ thinning หนึ่ง pass  (which = 1 หรือ 2)
    ตรวจทุกจุดจากภาพตั้งต้นก่อน แล้วจึงลบพร้อมกันทีเดียว
    คืนค่า (ภาพผลลัพธ์, รายการจุดที่ถูกลบ)
    """
    out = clone(img)
    removed = []
    for r in range(len(img)):
        for c in range(len(img[0])):
            if img[r][c] != 1:
                continue
            n = neighbors(img, r, c)

            b = sum(n.values())                       # 1) 8-Connected 2..6
            if not (2 <= b <= 6):
                continue
            if crossing_index(n) != 1:                # 2) Crossing index == 1
                continue

            if which == 1:                            # 3) 7,5,3 => 5,3,1
                if n[3] * n[5] * n[7] != 0:
                    continue
                if n[1] * n[3] * n[5] != 0:
                    continue
            else:                                     # 3) 5,7,1 => 7,1,3
                if n[1] * n[5] * n[7] != 0:
                    continue
                if n[1] * n[3] * n[7] != 0:
                    continue

            out[r][c] = 0
            removed.append((r, c))
    return out, removed


def skeletonize(img, max_round=100):
    """วน Pass one + Pass two จนไม่มีจุดถูกลบอีก"""
    cur = clone(img)
    history = []
    for rnd in range(1, max_round + 1):
        a, r1 = thin_pass(cur, 1)
        b, r2 = thin_pass(a, 2)
        history.append((rnd, len(r1), len(r2)))
        cur = b
        if not r1 and not r2:
            break
    return cur, history


def count_fg(img):
    return sum(sum(row) for row in img)


def matrix_text(img):
    return "\n".join(" ".join(str(v) for v in row) for row in img)


def matlab_text(img, se, name="p1"):
    body = ";\n     ".join(" ".join(str(v) for v in row) for row in img)
    se_body = ";".join(" ".join(str(v) for v in row) for row in se)
    return ("%% ภาพขนาด %dx%d  (แถว x หลัก)\n"
            "%s = [%s];\n"
            "se = [%s];\n"
            "%s_bw = imbinarize(%s);\n"
            "%s_er = imerode(%s_bw, se);\n"
            "%s_di = imdilate(%s_bw, se);\n"
            % (len(img), len(img[0]), name, body, se_body,
               name, name, name, name, name, name))


# ------------------------------------------------------------------ widgets

class GridView(tk.Frame):
    """ตารางภาพ วาดด้วย Canvas  คลิกซ้าย = ระบายดำ  คลิกขวา = ลบ"""

    def __init__(self, parent, rows, cols, cell=26, editable=False,
                 title="", show_axis=True, on_change=None):
        super().__init__(parent, bd=0)
        self.rows, self.cols, self.cell = rows, cols, cell
        self.editable = editable
        self.on_change = on_change
        self.img = empty(rows, cols)
        self.marks = set()
        self.pad = 22 if show_axis else 2
        self.show_axis = show_axis

        self.title_var = tk.StringVar(value=title)
        tk.Label(self, textvariable=self.title_var, font=FONT_B,
                 anchor="w").pack(fill="x", pady=(0, 3))

        w = self.pad + cols * cell + 2
        h = self.pad + rows * cell + 2
        self.cv = tk.Canvas(self, width=w, height=h, bg="#f4f6f8",
                            highlightthickness=1, highlightbackground="#9aa4ae")
        self.cv.pack()

        self.info = tk.Label(self, text="", font=("Tahoma", 9),
                             fg="#556", anchor="w")
        self.info.pack(fill="x", pady=(2, 0))

        if editable:
            self.cv.bind("<Button-1>", lambda e: self._paint(e, 1))
            self.cv.bind("<B1-Motion>", lambda e: self._paint(e, 1))
            self.cv.bind("<Button-3>", lambda e: self._paint(e, 0))
            self.cv.bind("<B3-Motion>", lambda e: self._paint(e, 0))
        self.redraw()

    # -- coordinate helpers
    def _cell_at(self, x, y):
        c = (x - self.pad) // self.cell
        r = (y - self.pad) // self.cell
        if 0 <= r < self.rows and 0 <= c < self.cols:
            return int(r), int(c)
        return None

    def _paint(self, event, value):
        pos = self._cell_at(event.x, event.y)
        if not pos:
            return
        r, c = pos
        if self.img[r][c] != value:
            self.img[r][c] = value
            self.redraw()
            if self.on_change:
                self.on_change()

    # -- data
    def set_image(self, img, marks=None, title=None):
        self.img = clone(img)
        self.marks = set(marks or ())
        if title is not None:
            self.title_var.set(title)
        self.redraw()

    def get_image(self):
        return clone(self.img)

    def clear(self):
        self.img = empty(self.rows, self.cols)
        self.marks = set()
        self.redraw()
        if self.on_change:
            self.on_change()

    def resize(self, rows, cols, cell=None):
        """เปลี่ยนขนาดตาราง (ใช้ตอนนำเข้าภาพที่ขนาดไม่ใช่ 13x10)"""
        self.rows, self.cols = rows, cols
        if cell:
            self.cell = cell
        self.img = empty(rows, cols)
        self.marks = set()
        self.cv.config(width=self.pad + cols * self.cell + 2,
                       height=self.pad + rows * self.cell + 2)
        self.redraw()

    # -- drawing
    def divider_col(self):
        """
        ตำแหน่งเส้นแบ่งแกน  นับเป็นเส้นที่เท่าไรจากซ้าย (0 = ขอบซ้ายสุด)
        ตาราง 13 หลักจะได้เส้นที่ 7 คือขอบขวาของช่องที่ 7 เหมือนในแบบฝึกหัด
        """
        return (self.cols + 1) // 2

    def _draw_divider(self):
        """เส้นแบ่งแกนแบบจุดไข่ปลา เส้นเดียวแนวตั้ง เหมือนที่แบบฝึกหัดใช้"""
        d = self.divider_col()
        if not 0 < d < self.cols:
            return
        cv, cell, pad = self.cv, self.cell, self.pad
        x = pad + d * cell
        rad = max(1.6, cell * 0.10)
        step = max(5.0, cell * 0.42)
        y, end = pad + rad, pad + self.rows * cell - rad
        while y <= end:
            # ขอบสีขาวไว้ให้มองเห็นจุดตอนที่ทับช่องที่ระบายดำ
            cv.create_oval(x - rad, y - rad, x + rad, y + rad,
                           fill="#000000", outline="#ffffff", width=1)
            y += step

    def redraw(self):
        cv, cell, pad = self.cv, self.cell, self.pad
        cv.delete("all")

        if self.show_axis:
            for c in range(self.cols):
                cv.create_text(pad + c * cell + cell / 2, pad / 2 + 1,
                               text=str(c), font=("Tahoma", 8), fill="#667")
            for r in range(self.rows):
                cv.create_text(pad / 2, pad + r * cell + cell / 2,
                               text=str(r), font=("Tahoma", 8), fill="#667")

        for r in range(self.rows):
            for c in range(self.cols):
                x0, y0 = pad + c * cell, pad + r * cell
                fill = C_FG if self.img[r][c] else C_BG
                cv.create_rectangle(x0, y0, x0 + cell, y0 + cell,
                                    fill=fill, outline="")
                if (r, c) in self.marks:
                    cv.create_oval(x0 + cell * 0.28, y0 + cell * 0.28,
                                   x0 + cell * 0.72, y0 + cell * 0.72,
                                   fill=C_MARK, outline="")

        # เส้นตารางบางเท่ากันหมด  หนาเฉพาะกรอบนอก
        for c in range(self.cols + 1):
            x = pad + c * cell
            edge = c in (0, self.cols)
            cv.create_line(x, pad, x, pad + self.rows * cell,
                           fill=C_LINE5 if edge else C_LINE,
                           width=2 if edge else 1)
        for r in range(self.rows + 1):
            y = pad + r * cell
            edge = r in (0, self.rows)
            cv.create_line(pad, y, pad + self.cols * cell, y,
                           fill=C_LINE5 if edge else C_LINE,
                           width=2 if edge else 1)

        self._draw_divider()

        n = count_fg(self.img)
        extra = "   ลบรอบนี้ %d จุด" % len(self.marks) if self.marks else ""
        self.info.config(text="จุดวัตถุ (1) = %d จุด%s" % (n, extra))


class SEDialog(tk.Toplevel):
    """ส่วนที่ 1 : ป็อปอัพตาราง 3x3 คลิกเลือกช่องที่เป็นสีดำ"""

    PRESETS = {
        "กากบาท + (ตามสไลด์)": [[0, 1, 0], [1, 0, 1], [0, 1, 0]],
        "กากบาท + (มีจุดกลาง)": [[0, 1, 0], [1, 1, 1], [0, 1, 0]],
        "เต็ม 3x3": [[1, 1, 1], [1, 1, 1], [1, 1, 1]],
        "ตามเอกสาร [0 1 0;1 0 0;0 1 0]": [[0, 1, 0], [1, 0, 0], [0, 1, 0]],
    }

    def __init__(self, parent, se=None):
        super().__init__(parent)
        self.title("ส่วนที่ 1 : เลือก Structuring Element (SE) 3x3")
        self.resizable(False, False)
        self.result = None
        self.se = clone(se) if se else [[0, 1, 0], [1, 0, 1], [0, 1, 0]]

        tk.Label(self, text="คลิกเมาส์ที่ช่องเพื่อสลับเป็นสีดำ (=1) / สีขาว (=0)",
                 font=FONT).pack(padx=14, pady=(12, 6))

        self.cell = 66
        cv = tk.Canvas(self, width=3 * self.cell + 3, height=3 * self.cell + 3,
                       bg="#f4f6f8", highlightthickness=1,
                       highlightbackground="#9aa4ae")
        cv.pack(padx=14)
        cv.bind("<Button-1>", self._click)
        self.cv = cv

        self.lbl = tk.Label(self, text="", font=("Consolas", 11), fg="#334")
        self.lbl.pack(pady=(6, 0))

        pf = tk.LabelFrame(self, text="รูปแบบสำเร็จรูป", font=FONT)
        pf.pack(fill="x", padx=14, pady=8)
        for name, val in self.PRESETS.items():
            tk.Button(pf, text=name, font=("Tahoma", 9), relief="groove",
                      command=lambda v=val: self._set(v)).pack(fill="x",
                                                               padx=6, pady=2)

        bf = tk.Frame(self)
        bf.pack(fill="x", padx=14, pady=(0, 12))
        tk.Button(bf, text="ล้างทั้งหมด", font=FONT, width=12,
                  command=lambda: self._set([[0] * 3 for _ in range(3)])
                  ).pack(side="left")
        tk.Button(bf, text="ตกลง", font=FONT_B, width=14, bg="#2f6fed",
                  fg="white", command=self._ok).pack(side="right")

        self._draw()
        self.protocol("WM_DELETE_WINDOW", self._ok)
        self.transient(parent)
        self.grab_set()
        self.update_idletasks()
        x = parent.winfo_rootx() + (parent.winfo_width() - self.winfo_width()) // 2
        y = parent.winfo_rooty() + 60
        self.geometry("+%d+%d" % (max(x, 0), max(y, 0)))
        self.wait_window(self)

    def _set(self, v):
        self.se = clone(v)
        self._draw()

    def _click(self, e):
        c, r = int(e.x // self.cell), int(e.y // self.cell)
        if 0 <= r < 3 and 0 <= c < 3:
            self.se[r][c] ^= 1
            self._draw()

    def _draw(self):
        cv, cell = self.cv, self.cell
        cv.delete("all")
        for r in range(3):
            for c in range(3):
                x0, y0 = c * cell + 2, r * cell + 2
                cv.create_rectangle(x0, y0, x0 + cell, y0 + cell,
                                    fill=C_FG if self.se[r][c] else C_BG,
                                    outline="#7d8894")
                cv.create_text(x0 + cell / 2, y0 + cell / 2,
                               text=str(self.se[r][c]), font=("Consolas", 13),
                               fill="#ffffff" if self.se[r][c] else "#99a")
        cv.create_rectangle(2 + cell, 2 + cell, 2 + 2 * cell, 2 + 2 * cell,
                            outline="#e23b3b", width=2)
        self.lbl.config(text="se = [%s]" %
                        ";".join(" ".join(str(v) for v in row) for row in self.se))

    def _ok(self):
        self.result = clone(self.se)
        self.destroy()


# ------------------------------------------------------------------ app

class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Erosion / Dilation / Skeletonization  -  ตาราง 13 x 10")
        self.configure(bg="#eef1f4")
        self.se = [[0, 1, 0], [1, 0, 1], [0, 1, 0]]
        self.reflect = tk.BooleanVar(value=False)
        self.rows, self.cols = ROWS, COLS

        self._build()
        self.after(120, self.edit_se)          # ส่วนที่ 1 เด้งขึ้นก่อน

    # ---------- layout
    def _build(self):
        head = tk.Frame(self, bg="#eef1f4")
        head.pack(fill="x", padx=12, pady=(10, 4))
        tk.Label(head, text="ส่วนที่ 2 : วาดวัตถุลงตาราง 13 ช่อง (แนวนอน) x 10 ช่อง (แนวตั้ง)",
                 font=FONT_T, bg="#eef1f4").pack(side="left")
        tk.Label(head, text="   คลิกซ้าย = ระบายดำ   คลิกขวา = ลบ",
                 font=FONT, fg="#667", bg="#eef1f4").pack(side="left")

        grids = tk.Frame(self, bg="#eef1f4")
        grids.pack(fill="x", padx=12)

        self.g_in = GridView(grids, ROWS, COLS, cell=26, editable=True,
                             title="ภาพต้นฉบับ (Input)")
        self.g_in.grid(row=0, column=0, padx=(0, 14), sticky="n")

        self.g_mid = GridView(grids, ROWS, COLS, cell=26,
                              title="ขั้นกลาง (Step 1)")
        self.g_mid.grid(row=0, column=1, padx=(0, 14), sticky="n")

        self.g_out = GridView(grids, ROWS, COLS, cell=26,
                              title="ผลลัพธ์ (Result)")
        self.g_out.grid(row=0, column=2, sticky="n")

        # ----- แถบควบคุม
        ctl = tk.Frame(self, bg="#eef1f4")
        ctl.pack(fill="x", padx=12, pady=8)

        # SE
        f1 = tk.LabelFrame(ctl, text=" Structuring Element ", font=FONT_B,
                           bg="#eef1f4")
        f1.pack(side="left", fill="y", padx=(0, 10))
        self.se_cv = tk.Canvas(f1, width=76, height=76, bg="#f4f6f8",
                               highlightthickness=1,
                               highlightbackground="#9aa4ae")
        self.se_cv.pack(padx=8, pady=(6, 4))
        tk.Button(f1, text="แก้ไข SE (3x3)", font=FONT,
                  command=self.edit_se).pack(padx=8, pady=(0, 4), fill="x")
        tk.Checkbutton(f1, text="สะท้อน SE ตอน Dilation\n(ให้ตรงกับ imdilate)",
                       font=("Tahoma", 8), variable=self.reflect, bg="#eef1f4",
                       justify="left").pack(padx=6, pady=(0, 6))

        # ขั้นพื้นฐาน
        f2 = tk.LabelFrame(ctl, text=" Morphology ", font=FONT_B, bg="#eef1f4")
        f2.pack(side="left", fill="y", padx=(0, 10))
        for txt, cmd in (("Erosion", self.do_erode),
                         ("Dilation", self.do_dilate),
                         ("Opening  (Erosion -> Dilation)", self.do_open),
                         ("Closing  (Dilation -> Erosion)", self.do_close)):
            tk.Button(f2, text=txt, font=FONT, width=30, anchor="w",
                      command=cmd).pack(padx=8, pady=2, fill="x")

        # skeleton
        f3 = tk.LabelFrame(ctl, text=" Skeletonization ", font=FONT_B,
                           bg="#eef1f4")
        f3.pack(side="left", fill="y", padx=(0, 10))
        for txt, cmd in (("Pass one อย่างเดียว (1 รอบ)", lambda: self.do_pass(1)),
                         ("Pass two อย่างเดียว (1 รอบ)", lambda: self.do_pass(2)),
                         ("Pass one + Pass two (1 รอบ)", self.do_both_once),
                         ("คำนวณเต็ม  วนจนได้เส้นกระดูก", self.do_skel_full)):
            tk.Button(f3, text=txt, font=FONT, width=30, anchor="w",
                      command=cmd).pack(padx=8, pady=2, fill="x")

        # เครื่องมือ
        f4 = tk.LabelFrame(ctl, text=" เครื่องมือ ", font=FONT_B, bg="#eef1f4")
        f4.pack(side="left", fill="both", expand=True)

        tk.Button(f4, text="อ่านตารางจากภาพ (OpenCV)...", font=FONT_B,
                  bg="#2f6fed", fg="white", anchor="w",
                  command=self.do_import).pack(padx=8, pady=(4, 3), fill="x")
        for txt, cmd in (("ล้างตาราง", self.do_clear),
                         ("ใช้ผลลัพธ์เป็น Input", self.do_feedback),
                         ("คัดลอกเป็นโค้ด MATLAB", self.do_matlab)):
            tk.Button(f4, text=txt, font=FONT, width=24, anchor="w",
                      command=cmd).pack(padx=8, pady=2, fill="x")

        sz = tk.Frame(f4, bg="#eef1f4")
        sz.pack(fill="x", padx=8, pady=(4, 6))
        tk.Label(sz, text="ขนาดตาราง แถว", font=("Tahoma", 9),
                 bg="#eef1f4").pack(side="left")
        self.sp_rows = tk.Spinbox(sz, from_=2, to=60, width=3, font=("Tahoma", 9))
        self.sp_rows.pack(side="left", padx=3)
        tk.Label(sz, text="x หลัก", font=("Tahoma", 9),
                 bg="#eef1f4").pack(side="left")
        self.sp_cols = tk.Spinbox(sz, from_=2, to=60, width=3, font=("Tahoma", 9))
        self.sp_cols.pack(side="left", padx=3)
        tk.Button(sz, text="ตั้งค่า", font=("Tahoma", 9),
                  command=self.do_resize).pack(side="left", padx=(4, 0))
        self.sp_rows.delete(0, "end")
        self.sp_rows.insert(0, str(ROWS))
        self.sp_cols.delete(0, "end")
        self.sp_cols.insert(0, str(COLS))

        # ----- log
        lf = tk.LabelFrame(self, text=" ผลลัพธ์ / รายละเอียด ", font=FONT_B,
                           bg="#eef1f4")
        lf.pack(fill="both", expand=True, padx=12, pady=(0, 10))
        self.log = tk.Text(lf, height=11, font=("Consolas", 10), wrap="none",
                           bg="#ffffff", fg="#223")
        sb = ttk.Scrollbar(lf, orient="vertical", command=self.log.yview)
        self.log.configure(yscrollcommand=sb.set)
        sb.pack(side="right", fill="y")
        self.log.pack(fill="both", expand=True, padx=4, pady=4)

        self._draw_se()
        self._say("พร้อมใช้งาน  ตั้งค่า SE แล้ววาดวัตถุลงตาราง Input ได้เลย")

    def _draw_se(self):
        cv = self.se_cv
        cv.delete("all")
        cell = 24
        for r in range(3):
            for c in range(3):
                x0, y0 = c * cell + 2, r * cell + 2
                cv.create_rectangle(x0, y0, x0 + cell, y0 + cell,
                                    fill=C_FG if self.se[r][c] else C_BG,
                                    outline="#7d8894")
        cv.create_rectangle(2 + cell, 2 + cell, 2 + 2 * cell, 2 + 2 * cell,
                            outline="#e23b3b", width=2)

    # ---------- helpers
    def _blank(self):
        return empty(self.rows, self.cols)

    def set_grid_size(self, rows, cols, keep=None):
        """เปลี่ยนขนาดตารางทั้งสามช่อง  keep = ภาพที่จะใส่ลง Input หลังเปลี่ยน"""
        rows = max(2, min(60, int(rows)))
        cols = max(2, min(60, int(cols)))
        cell = 26 if cols <= 13 else max(11, int(338 / cols))
        for g in (self.g_in, self.g_mid, self.g_out):
            g.resize(rows, cols, cell)
        self.rows, self.cols = rows, cols
        self.g_mid.title_var.set("ขั้นกลาง (Step 1)")
        self.g_out.title_var.set("ผลลัพธ์ (Result)")
        for sp, v in ((self.sp_rows, rows), (self.sp_cols, cols)):
            sp.delete(0, "end")
            sp.insert(0, str(v))
        if keep is not None:
            self.g_in.set_image(keep)

    def _say(self, text, clear=True):
        if clear:
            self.log.delete("1.0", "end")
        self.log.insert("end", text + "\n")
        self.log.see("1.0")

    def _report(self, head, result, extra=""):
        se_s = ";".join(" ".join(str(v) for v in row) for row in self.se)
        txt = ["=== %s ===" % head,
               "SE = [%s]" % se_s,
               "จุดวัตถุ  ก่อน = %d   หลัง = %d" %
               (count_fg(self.g_in.get_image()), count_fg(result))]
        if extra:
            txt.append(extra)
        txt.append("")
        txt.append("ผลลัพธ์ (แถว 0-9 x หลัก 0-12):")
        txt.append(matrix_text(result))
        self._say("\n".join(txt))

    def _check_se(self):
        if count_fg(self.se) == 0:
            messagebox.showwarning("SE ว่าง",
                                   "SE ยังไม่มีจุดสีดำเลย กรุณากดปุ่ม แก้ไข SE ก่อน")
            return False
        return True

    # ---------- ส่วนที่ 1
    def edit_se(self):
        dlg = SEDialog(self, self.se)
        if dlg.result is not None:
            self.se = dlg.result
            self._draw_se()
            self._say("ตั้งค่า SE ใหม่แล้ว  se = [%s]" %
                      ";".join(" ".join(str(v) for v in row) for row in self.se))

    # ---------- Morphology
    def _grow_note(self, src, res):
        """
        เตือนกรณีผล Erosion มีจุดโผล่นอกรูปเดิม
        เกิดได้จริงเมื่อ SE ไม่มีจุดกึ่งกลาง (se[1][1] = 0) เพราะการตัดสินแต่ละช่อง
        ไม่ได้ดูตัวมันเองเลย ดูแต่เพื่อนบ้าน  กฎ "Erosion ต้องเล็กลงเสมอ"
        ใช้ได้เฉพาะตอน SE มีจุดกึ่งกลางเป็น 1 เท่านั้น
        """
        grew = [(r, c) for r in range(self.rows) for c in range(self.cols)
                if res[r][c] and not src[r][c]]
        if not grew:
            return ""
        pos = "  ".join("(แถว %d, หลัก %d)" % p for p in grew[:6])
        return ("หมายเหตุ: มี %d จุดที่ต้นฉบับเป็นสีขาวแต่ผลเป็นสีดำ  %s%s\n"
                "  ไม่ใช่ความผิดพลาด  เพราะ SE ตัวนี้จุดกึ่งกลางเป็น 0 "
                "การตัดสินแต่ละช่องจึงไม่ได้ดูตัวมันเอง\n"
                "  ถ้าอยากให้ผลหดอยู่ในรูปเดิมเสมอ ให้แก้ SE ใส่จุดกึ่งกลางเป็น 1"
                % (len(grew), pos, "  ..." if len(grew) > 6 else ""))

    def do_erode(self):
        if not self._check_se():
            return
        src = self.g_in.get_image()
        res = erode(src, self.se)
        self.g_mid.set_image(self._blank(), title="ขั้นกลาง (ไม่ใช้)")
        self.g_out.set_image(res, title="ผลลัพธ์ : หลัง Erosion")
        self._report("Erosion", res, self._grow_note(src, res))

    def do_dilate(self):
        if not self._check_se():
            return
        src = self.g_in.get_image()
        res = dilate(src, self.se, self.reflect.get())
        self.g_mid.set_image(self._blank(), title="ขั้นกลาง (ไม่ใช้)")
        self.g_out.set_image(res, title="ผลลัพธ์ : หลัง Dilation")
        self._report("Dilation", res)

    def do_open(self):
        if not self._check_se():
            return
        src = self.g_in.get_image()
        mid = erode(src, self.se)
        res = dilate(mid, self.se, self.reflect.get())
        self.g_mid.set_image(mid, title="ขั้นที่ 1 : หลัง Erosion")
        self.g_out.set_image(res, title="ขั้นที่ 2 : หลัง Dilation  (Opening)")
        self._report("Opening  =  Erosion -> Dilation", res,
                     "ระหว่างทาง หลัง Erosion เหลือ %d จุด\n%s"
                     % (count_fg(mid), self._grow_note(src, mid)))

    def do_close(self):
        if not self._check_se():
            return
        src = self.g_in.get_image()
        mid = dilate(src, self.se, self.reflect.get())
        res = erode(mid, self.se)
        self.g_mid.set_image(mid, title="ขั้นที่ 1 : หลัง Dilation")
        self.g_out.set_image(res, title="ขั้นที่ 2 : หลัง Erosion  (Closing)")
        self._report("Closing  =  Dilation -> Erosion", res,
                     "ระหว่างทาง หลัง Dilation ได้ %d จุด" % count_fg(mid))

    # ---------- Skeletonization
    def do_pass(self, which):
        src = self.g_in.get_image()
        res, removed = thin_pass(src, which)
        rule = ("3*5*7 = 0  และ  1*3*5 = 0" if which == 1
                else "1*5*7 = 0  และ  1*3*7 = 0")
        self.g_mid.set_image(src, marks=removed,
                             title="จุดสีแดง = จุดที่ Pass %d ลบได้" % which)
        self.g_out.set_image(res, title="ผลลัพธ์ : หลัง Pass %s (1 รอบ)" %
                             ("one" if which == 1 else "two"))
        self._say("=== Pass %s  (1 รอบ) ===\n"
                  "เงื่อนไข : 8-Connected 2..6 , Crossing index == 1 , %s\n"
                  "ลบไป %d จุด   เหลือจุดวัตถุ %d จุด\n\n"
                  "ผลลัพธ์ (แถว 0-9 x หลัก 0-12):\n%s"
                  % ("one" if which == 1 else "two", rule,
                     len(removed), count_fg(res), matrix_text(res)))

    def do_both_once(self):
        src = self.g_in.get_image()
        a, r1 = thin_pass(src, 1)
        b, r2 = thin_pass(a, 2)
        self.g_mid.set_image(a, marks=r1, title="หลัง Pass one  (จุดแดง = ที่ลบ)")
        self.g_out.set_image(b, marks=r2, title="หลัง Pass two  (จุดแดง = ที่ลบ)")
        self._say("=== Pass one + Pass two  (1 รอบ) ===\n"
                  "Pass one ลบ %d จุด   ->  เหลือ %d จุด\n"
                  "Pass two ลบ %d จุด   ->  เหลือ %d จุด\n\n"
                  "ผลหลัง Pass one:\n%s\n\n"
                  "ผลหลัง Pass two:\n%s"
                  % (len(r1), count_fg(a), len(r2), count_fg(b),
                     matrix_text(a), matrix_text(b)))

    def do_skel_full(self):
        src = self.g_in.get_image()
        res, hist = skeletonize(src)
        a, r1 = thin_pass(src, 1)
        self.g_mid.set_image(a, marks=r1, title="รอบที่ 1 : หลัง Pass one")
        self.g_out.set_image(res, title="เส้นกระดูก (Skeleton) สุดท้าย")
        lines = ["=== Skeletonization  วน Pass one + Pass two จนนิ่ง ===",
                 "จุดวัตถุเริ่มต้น %d จุด" % count_fg(src), "",
                 "รอบที่ | Pass one ลบ | Pass two ลบ",
                 "-------+--------------+--------------"]
        for rnd, n1, n2 in hist:
            lines.append("%6d | %12d | %12d" % (rnd, n1, n2))
        lines += ["", "รวม %d รอบ  เหลือจุดวัตถุ %d จุด" % (len(hist), count_fg(res)),
                  "", "เส้นกระดูก (แถว 0-9 x หลัก 0-12):", matrix_text(res)]
        self._say("\n".join(lines))

    # ---------- tools
    def do_clear(self):
        self.g_in.clear()
        self.g_mid.set_image(self._blank(), title="ขั้นกลาง (Step 1)")
        self.g_out.set_image(self._blank(), title="ผลลัพธ์ (Result)")
        self._say("ล้างตารางแล้ว")

    def do_resize(self):
        try:
            r, c = int(self.sp_rows.get()), int(self.sp_cols.get())
        except ValueError:
            messagebox.showwarning("ค่าไม่ถูกต้อง", "จำนวนแถว/หลักต้องเป็นตัวเลข")
            return
        old = self.g_in.get_image()
        keep = [[old[y][x] if y < len(old) and x < len(old[0]) else 0
                 for x in range(max(2, min(60, c)))]
                for y in range(max(2, min(60, r)))]
        self.set_grid_size(r, c, keep=keep)
        self._say("เปลี่ยนขนาดตารางเป็น %d แถว x %d หลัก แล้ว" % (self.rows, self.cols))

    def do_import(self):
        """อัปโหลดภาพ แล้วให้ OpenCV จับเส้นตารางและระบายสีให้อัตโนมัติ"""
        if image_import is None:
            messagebox.showerror("เปิดฟังก์ชันนี้ไม่ได้",
                                 "โหลดโมดูล image_import.py ไม่สำเร็จ\n"
                                 "ตรวจว่าไฟล์ image_import.py และ grid_reader.py "
                                 "อยู่โฟลเดอร์เดียวกับ morph_skel.py")
            return
        grid = image_import.ask_grid_from_image(self)
        if not grid:
            return
        r, c = len(grid), len(grid[0])
        if (r, c) != (self.rows, self.cols):
            self.set_grid_size(r, c, keep=grid)
            note = "   (ปรับขนาดตารางเป็น %d x %d ให้อัตโนมัติ)" % (r, c)
        else:
            self.g_in.set_image(grid)
            note = ""
        self.g_mid.set_image(self._blank(), title="ขั้นกลาง (Step 1)")
        self.g_out.set_image(self._blank(), title="ผลลัพธ์ (Result)")
        self._say("นำเข้าจากภาพสำเร็จ  %d แถว x %d หลัก  จุดวัตถุ %d ช่อง%s\n\n"
                  "ภาพที่อ่านได้ (แถว 0-%d x หลัก 0-%d):\n%s"
                  % (r, c, count_fg(grid), note, r - 1, c - 1, matrix_text(grid)))

    def do_feedback(self):
        self.g_in.set_image(self.g_out.get_image())
        self._say("คัดลอกผลลัพธ์มาเป็น Input แล้ว")

    def do_matlab(self):
        code = matlab_text(self.g_in.get_image(), self.se)
        self.clipboard_clear()
        self.clipboard_append(code)
        self._say("คัดลอกโค้ด MATLAB ไปที่คลิปบอร์ดแล้ว\n\n" + code)


if __name__ == "__main__":
    App().mainloop()
