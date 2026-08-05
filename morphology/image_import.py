# -*- coding: utf-8 -*-
"""
image_import.py
หน้าต่าง "อ่านตารางจากภาพ"  อัปโหลดภาพ -> OpenCV จับเส้นตาราง -> ระบายลงตารางให้อัตโนมัติ

ใช้คู่กับ morph_skel.py  แต่แยกไฟล์ไว้เพื่อให้โปรแกรมหลักยังเปิดได้
ถึงแม้เครื่องจะไม่ได้ติดตั้ง opencv / pillow
"""

import os
import tkinter as tk
from tkinter import ttk, filedialog, messagebox

import grid_reader as gr

try:
    import cv2
    import numpy as np
    from PIL import Image, ImageTk
    HAVE_CV = True
    CV_ERROR = ""
except Exception as exc:                                  # pragma: no cover
    HAVE_CV = False
    CV_ERROR = str(exc)

FONT = ("Tahoma", 10)
FONT_B = ("Tahoma", 10, "bold")

MAX_SIDE = 1600
FILETYPES = [("ไฟล์ภาพ", "*.png *.jpg *.jpeg *.bmp *.tif *.tiff *.webp"),
             ("ทุกไฟล์", "*.*")]


def available():
    return HAVE_CV


class ImportDialog(tk.Toplevel):
    """เลือกไฟล์ภาพ ปรับพารามิเตอร์ ดูผลแบบเรียลไทม์ แล้วส่งเมทริกซ์ 0/1 กลับ"""

    CW, CH = 660, 500          # ขนาดพื้นที่แสดงภาพ

    def __init__(self, parent, path=None):
        super().__init__(parent)
        self.title("อ่านตารางจากภาพ ด้วย OpenCV")
        self.resizable(False, False)

        self.result = None           # เมทริกซ์ 0/1 ที่จะส่งกลับ
        self.path = None
        self.raw = None              # ภาพต้นฉบับ (ย่อแล้ว)
        self.src = None              # ภาพที่ผ่าน deskew แล้ว ใช้วิเคราะห์จริง
        self.res = None
        self.roi = None              # กรอบที่ผู้ใช้ลากเลือกเอง (พิกัดในภาพ)
        self._busy = False
        self._drag = None
        self._imgtk = None

        self.v_auto = tk.BooleanVar(value=True)
        self.v_rows = tk.IntVar(value=10)
        self.v_cols = tk.IntVar(value=13)
        self.v_photo = tk.BooleanVar(value=False)
        self.v_persp = tk.BooleanVar(value=True)
        self.v_deskew = tk.BooleanVar(value=True)
        self.v_invert = tk.BooleanVar(value=False)
        self.v_thresh = tk.IntVar(value=50)

        self._build()
        self.protocol("WM_DELETE_WINDOW", self._cancel)
        self.transient(parent)
        self.grab_set()
        self.update_idletasks()
        x = parent.winfo_rootx() + max(0, (parent.winfo_width() - self.winfo_width()) // 2)
        self.geometry("+%d+%d" % (max(x, 0), max(parent.winfo_rooty() + 20, 0)))

        if path:
            self._load(path)
        else:
            self.after(100, self.choose_file)
        self.wait_window(self)

    # -------------------------------------------------- layout
    def _build(self):
        body = tk.Frame(self)
        body.pack(fill="both", expand=True, padx=10, pady=10)

        # ---- ซ้าย : ภาพ
        left = tk.Frame(body)
        left.grid(row=0, column=0, sticky="n")
        tk.Label(left, text="ภาพที่อัปโหลด   ลากเมาส์เพื่อเลือกกรอบตารางเอง",
                 font=FONT_B, anchor="w").pack(fill="x", pady=(0, 4))
        self.cv = tk.Canvas(left, width=self.CW, height=self.CH, bg="#2b2f36",
                            highlightthickness=1, highlightbackground="#9aa4ae",
                            cursor="cross")
        self.cv.pack()
        self.cv.bind("<Button-1>", self._drag_start)
        self.cv.bind("<B1-Motion>", self._drag_move)
        self.cv.bind("<ButtonRelease-1>", self._drag_end)

        self.status = tk.Label(left, text="ยังไม่ได้เลือกไฟล์", font=FONT,
                               anchor="w", fg="#334", wraplength=self.CW,
                               justify="left")
        self.status.pack(fill="x", pady=(5, 0))

        # ---- ขวา : ตัวควบคุม
        right = tk.Frame(body)
        right.grid(row=0, column=1, sticky="n", padx=(12, 0))

        tk.Button(right, text="เลือกไฟล์ภาพ...", font=FONT_B, width=26,
                  command=self.choose_file).pack(fill="x")
        self.lbl_file = tk.Label(right, text="-", font=("Tahoma", 8), fg="#667",
                                 anchor="w", wraplength=230, justify="left")
        self.lbl_file.pack(fill="x", pady=(3, 8))

        f = tk.LabelFrame(right, text=" การตรวจจับ ", font=FONT_B)
        f.pack(fill="x")

        tk.Checkbutton(f, text="ตรวจจำนวนแถว/หลัก อัตโนมัติ", font=FONT,
                       variable=self.v_auto, command=self._toggle_auto
                       ).pack(anchor="w", padx=6, pady=(4, 0))

        sz = tk.Frame(f)
        sz.pack(fill="x", padx=22, pady=(2, 4))
        tk.Label(sz, text="แถว", font=FONT).pack(side="left")
        self.sp_r = tk.Spinbox(sz, from_=2, to=60, width=4, font=FONT,
                               textvariable=self.v_rows, command=self.analyze)
        self.sp_r.pack(side="left", padx=(3, 10))
        tk.Label(sz, text="หลัก", font=FONT).pack(side="left")
        self.sp_c = tk.Spinbox(sz, from_=2, to=60, width=4, font=FONT,
                               textvariable=self.v_cols, command=self.analyze)
        self.sp_c.pack(side="left", padx=3)

        for txt, var in (("ภาพถ่าย  แสงไม่สม่ำเสมอ มีเงา", self.v_photo),
                         ("ดัดภาพถ่ายมุมเอียง  perspective", self.v_persp),
                         ("หมุนแก้เอียงอัตโนมัติ", self.v_deskew),
                         ("สลับขาว-ดำ  วัตถุเป็นสีขาว", self.v_invert)):
            tk.Checkbutton(f, text=txt, font=FONT, variable=var,
                           command=self._reprocess).pack(anchor="w", padx=6)

        tk.Label(f, text="เกณฑ์ความดำของช่อง (%)", font=FONT,
                 anchor="w").pack(fill="x", padx=6, pady=(6, 0))
        tk.Scale(f, from_=5, to=95, orient="horizontal", variable=self.v_thresh,
                 command=lambda _=None: self.analyze(), showvalue=True,
                 font=("Tahoma", 8)).pack(fill="x", padx=6)

        tk.Button(f, text="ล้างกรอบที่เลือก  กลับไปใช้อัตโนมัติ", font=("Tahoma", 9),
                  command=self._clear_roi).pack(fill="x", padx=6, pady=(2, 6))

        pv = tk.LabelFrame(right, text=" ผลที่จะได้ ", font=FONT_B)
        pv.pack(fill="x", pady=8)
        self.mini = tk.Canvas(pv, width=236, height=190, bg="#f4f6f8",
                              highlightthickness=1, highlightbackground="#9aa4ae")
        self.mini.pack(padx=6, pady=6)

        btn = tk.Frame(right)
        btn.pack(fill="x")
        self.ok_btn = tk.Button(btn, text="ตกลง  ใส่ลงตาราง", font=FONT_B,
                                bg="#2f6fed", fg="white", state="disabled",
                                command=self._ok)
        self.ok_btn.pack(fill="x", pady=(0, 4))
        tk.Button(btn, text="ยกเลิก", font=FONT, command=self._cancel).pack(fill="x")

        self._toggle_auto()

    # -------------------------------------------------- file
    def choose_file(self):
        p = filedialog.askopenfilename(parent=self, title="เลือกไฟล์ภาพตาราง",
                                       filetypes=FILETYPES)
        if p:
            self._load(p)

    def _load(self, path):
        img = gr.imread_unicode(path)
        if img is None:
            messagebox.showerror("เปิดไฟล์ไม่ได้",
                                 "อ่านไฟล์นี้ไม่ได้ อาจไม่ใช่ไฟล์ภาพ", parent=self)
            return
        big = max(img.shape[:2])
        if big > MAX_SIDE:
            s = MAX_SIDE / float(big)
            img = cv2.resize(img, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
        self.path = path
        self.raw = img
        self.roi = None
        self.lbl_file.config(text=os.path.basename(path) +
                             "   (%d x %d px)" % (img.shape[1], img.shape[0]))
        self._reprocess()

    # -------------------------------------------------- pipeline
    def _reprocess(self):
        """ทำ deskew ใหม่ แล้ววิเคราะห์"""
        if self.raw is None:
            return
        self.roi = None
        self.angle = 0.0
        self.warped = False
        img = self.raw
        if not gr.is_pixel_image(img):
            if self.v_persp.get():
                img, self.warped = gr.rectify(img, self.v_photo.get())
            if self.v_deskew.get():
                img, self.angle = gr.deskew(img, self.v_photo.get())
        self.src = img
        self.analyze()

    def analyze(self, *_):
        if self.src is None or self._busy:
            return
        self._busy = True
        try:
            if gr.is_pixel_image(self.src):
                grid = gr.read_pixel_image(self.src,
                                           self.v_invert.get() or None)
                self.res = {"ok": True, "pixel": True, "grid": grid,
                            "rows": len(grid), "cols": len(grid[0]),
                            "xs": [], "ys": [], "ratio": [], "roi": None,
                            "msg": "ภาพขนาด %dx%d px  อ่านแบบ 1 พิกเซล = 1 ช่อง"
                                   % (self.src.shape[0], self.src.shape[1])}
            else:
                auto = self.v_auto.get()
                self.res = gr.analyze(
                    self.src, roi=self.roi,
                    rows=None if auto else self.v_rows.get(),
                    cols=None if auto else self.v_cols.get(),
                    photo=self.v_photo.get(),
                    thresh=self.v_thresh.get() / 100.0,
                    invert=self.v_invert.get())
                self.res["pixel"] = False

            if self.res["ok"]:
                self.v_rows.set(self.res["rows"])
                self.v_cols.set(self.res["cols"])
            msg = self.res["msg"]
            if getattr(self, "warped", False):
                msg += "   (ดัดมุมภาพแล้ว)"
            if getattr(self, "angle", 0.0):
                msg += "   (หมุนแก้เอียง %.1f องศา)" % self.angle
            self.status.config(text=msg,
                               fg="#1a6b2a" if self.res["ok"] else "#b02020")
            self.ok_btn.config(state="normal" if self.res["ok"] else "disabled")
        finally:
            self._busy = False
        self._render()

    def _toggle_auto(self):
        st = "disabled" if self.v_auto.get() else "normal"
        self.sp_r.config(state=st)
        self.sp_c.config(state=st)
        self.analyze()

    def _clear_roi(self):
        self.roi = None
        self.analyze()

    # -------------------------------------------------- drawing
    def _render(self):
        cv_ = self.cv
        cv_.delete("all")
        if self.src is None:
            return

        h, w = self.src.shape[:2]
        s = min(self.CW / float(w), self.CH / float(h))
        if gr.is_pixel_image(self.src):
            s = min(s, 40)                      # ภาพจิ๋ว ขยายให้เห็น
        self.scale = s
        dw, dh = max(1, int(w * s)), max(1, int(h * s))
        disp = cv2.resize(self.src, (dw, dh),
                          interpolation=cv2.INTER_NEAREST if s > 2
                          else cv2.INTER_AREA)
        self._imgtk = ImageTk.PhotoImage(
            Image.fromarray(cv2.cvtColor(disp, cv2.COLOR_BGR2RGB)))
        self.ox = (self.CW - dw) // 2
        self.oy = (self.CH - dh) // 2
        cv_.create_image(self.ox, self.oy, anchor="nw", image=self._imgtk)

        r = self.res
        if r and r["ok"] and not r["pixel"]:
            xs, ys = r["xs"], r["ys"]
            x0, x1 = self.ox + xs[0] * s, self.ox + xs[-1] * s
            y0, y1 = self.oy + ys[0] * s, self.oy + ys[-1] * s
            for x in xs:
                cv_.create_line(self.ox + x * s, y0, self.ox + x * s, y1,
                                fill="#00e07a")
            for y in ys:
                cv_.create_line(x0, self.oy + y * s, x1, self.oy + y * s,
                                fill="#00e07a")
            for rr in range(r["rows"]):
                for cc in range(r["cols"]):
                    if r["grid"][rr][cc]:
                        a = self.ox + xs[cc] * s
                        b = self.oy + ys[rr] * s
                        cv_.create_rectangle(a, b, self.ox + xs[cc + 1] * s,
                                             self.oy + ys[rr + 1] * s,
                                             outline="", fill="#ff3b3b",
                                             stipple="gray25")
            cv_.create_rectangle(x0, y0, x1, y1, outline="#ffcc00", width=2)

        if self._drag:
            cv_.create_rectangle(*self._drag, outline="#ffffff", dash=(4, 3))

        self._render_mini()

    def _render_mini(self):
        m = self.mini
        m.delete("all")
        r = self.res
        if not (r and r["ok"]):
            return
        rows, cols = r["rows"], r["cols"]
        cell = max(4, min(18, int(230 / max(cols, 1)), int(184 / max(rows, 1))))
        ox = (236 - cols * cell) // 2
        oy = (190 - rows * cell) // 2
        for rr in range(rows):
            for cc in range(cols):
                x, y = ox + cc * cell, oy + rr * cell
                m.create_rectangle(x, y, x + cell, y + cell,
                                   fill="#111111" if r["grid"][rr][cc] else "#ffffff",
                                   outline="#c2c8cf")

    # -------------------------------------------------- roi drag
    def _drag_start(self, e):
        if self.src is None:
            return
        self._drag = (e.x, e.y, e.x, e.y)

    def _drag_move(self, e):
        if self._drag:
            self._drag = (self._drag[0], self._drag[1], e.x, e.y)
            self._render()

    def _drag_end(self, e):
        if not self._drag:
            return
        x0, y0, x1, y1 = self._drag
        self._drag = None
        if abs(x1 - x0) < 12 or abs(y1 - y0) < 12:
            self._render()
            return
        s = self.scale
        ax = (min(x0, x1) - self.ox) / s
        ay = (min(y0, y1) - self.oy) / s
        bx = (max(x0, x1) - self.ox) / s
        by = (max(y0, y1) - self.oy) / s
        self.roi = (int(ax), int(ay), int(bx - ax), int(by - ay))
        self.analyze()

    # -------------------------------------------------- close
    def _ok(self):
        if self.res and self.res["ok"]:
            self.result = [row[:] for row in self.res["grid"]]
        self.destroy()

    def _cancel(self):
        self.result = None
        self.destroy()


def ask_grid_from_image(parent, path=None):
    """เปิดหน้าต่างนำเข้า คืนเมทริกซ์ 0/1 หรือ None ถ้ายกเลิก"""
    if not HAVE_CV:
        messagebox.showerror(
            "ยังไม่ได้ติดตั้งไลบรารี",
            "ฟังก์ชันอ่านภาพต้องใช้ opencv-python, numpy และ pillow\n\n"
            "ติดตั้งด้วยคำสั่ง\n    pip install opencv-python numpy pillow\n\n"
            "รายละเอียด: " + CV_ERROR, parent=parent)
        return None
    return ImportDialog(parent, path).result
