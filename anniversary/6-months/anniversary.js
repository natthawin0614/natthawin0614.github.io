/* ============================================================
   6 MONTHS WITH YOU — sticker book
   Sections, in order:
     1. sticker list + saved state
     2. sound effects (Web Audio, no files) + background song
     3. the isometric room (drawn as SVG)
     4. particles + background hearts
     5. tray, stickers, drag & drop
     6. book cover, finale, poem, voice note, save picture
   ============================================================ */
(() => {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ==========================================================
     1. STICKERS + STATE
     w = sticker width as a fraction of the room's width.
     ========================================================== */
  const STICKERS = [
    { id: 'us-opor-gaming-sofa',   tab: 'char',  w: .30, meow: true },
    { id: 'us-opor-holding-hands', tab: 'char',  w: .23 },
    { id: 'opor-pouting',          tab: 'char',  w: .20 },
    { id: 'us-giving-heart',       tab: 'char',  w: .20 },
    { id: 'us-chibi-sunglasses',   tab: 'char',  w: .25, meow: true },
    { id: 'chibi-belly-rub',       tab: 'char',  w: .21, meow: true },
    { id: 'chibi-in-box',          tab: 'char',  w: .22, meow: true },
    { id: 'us-opor-eating-cake',   tab: 'char',  w: .29 },
    { id: 'heart',                 tab: 'decor', w: .12 },
    { id: 'kuromi-cake',           tab: 'decor', w: .14 },
    { id: 'boba-tea',              tab: 'decor', w: .10 },
    { id: 'game-controller',       tab: 'decor', w: .14 },
    { id: 'kuromi-cat-bed',        tab: 'decor', w: .20 },
    { id: 'plant',                 tab: 'decor', w: .13 },
    { id: 'lamp',                  tab: 'decor', w: .12 },
    { id: 'sparkles',              tab: 'decor', w: .12 },
    { id: 'paw-prints',            tab: 'decor', w: .14 },
  ];
  STICKERS.forEach(s => {
    s.src = `./assets/${s.tab === 'char' ? 'stickers' : 'decor'}/${s.id}.png`;
  });
  const byId = Object.fromEntries(STICKERS.map(s => [s.id, s]));

  const GOAL = 8;
  const STORE_KEY = 'sixMonths.stickerBook.v1';
  // placed: { id: {x, y, z} } — x/y are 0..1 of the room box, z is stacking order
  let state = { placed: {}, sound: true, finaleSeen: false };

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (raw && typeof raw === 'object') {
        state = { ...state, ...raw, placed: {} };
        for (const [id, p] of Object.entries(raw.placed || {})) {
          if (byId[id] && isFinite(p.x) && isFinite(p.y)) state.placed[id] = { x: +p.x, y: +p.y, z: +p.z || 1 };
        }
      }
    } catch (_) { /* private mode / corrupt data: just start fresh */ }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) {}
  }
  load();
  let zTop = Math.max(0, ...Object.values(state.placed).map(p => p.z));

  /* ==========================================================
     2. SOUND — everything synthesised, soft and round
     ========================================================== */
  const Sfx = (() => {
    let ctx = null, master = null, noiseBuf = null;

    function unlock() {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = state.sound ? .6 : 0;
      const soften = ctx.createBiquadFilter();        // shave the harsh top off everything
      soften.type = 'lowpass'; soften.frequency.value = 6000;
      master.connect(soften); soften.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    function setOn(on) {
      if (master) master.gain.setTargetAtTime(on ? .6 : 0, ctx.currentTime, .02);
    }

    function env(g, t, d, peak, attack = .008) {
      g.gain.setValueAtTime(.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + attack);
      g.gain.exponentialRampToValueAtTime(.0001, t + d);
    }
    function tone({ f, f2, at = 0, d = .15, type = 'sine', g = .2, attack }) {
      if (!ctx) return;
      const t = ctx.currentTime + at;
      const o = ctx.createOscillator(), gn = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d * .9);
      env(gn, t, d, g, attack);
      o.connect(gn); gn.connect(master);
      o.start(t); o.stop(t + d + .05);
    }
    function noise({ at = 0, d = .2, g = .2, type = 'bandpass', f = 1000, f2, q = 1, attack }) {
      if (!ctx) return;
      const t = ctx.currentTime + at;
      const src = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), gn = ctx.createGain();
      src.buffer = noiseBuf; src.loop = true;
      flt.type = type; flt.Q.value = q;
      flt.frequency.setValueAtTime(f, t);
      if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t + d);
      env(gn, t, d, g, attack);
      src.connect(flt); flt.connect(gn); gn.connect(master);
      src.start(t, Math.random() * .5); src.stop(t + d + .05);
    }

    return {
      unlock, setOn,
      ctx: () => ctx,
      /* a page being turned: one long soft swish with a couple of flutters in it */
      paper() {
        noise({ d: .55, g: .22, f: 500, f2: 2600, q: .7, attack: .12 });
        noise({ at: .10, d: .12, g: .10, type: 'highpass', f: 2500 });
        noise({ at: .24, d: .10, g: .08, type: 'highpass', f: 3000 });
        noise({ at: .40, d: .18, g: .12, f: 1400, f2: 500, q: .8 });
      },
      /* a sticker coming off its backing: short rising tear */
      peel() {
        noise({ d: .14, g: .13, type: 'bandpass', f: 1500, f2: 4800, q: 1.4, attack: .02 });
        tone({ f: 620, f2: 980, d: .08, g: .05 });
      },
      /* stuck down: a round "pop" and two tiny bells */
      pop() {
        tone({ f: 640, f2: 210, d: .11, g: .32, attack: .004 });
        tone({ f: 1318.5, at: .05, d: .28, g: .07, type: 'triangle' });
        tone({ f: 1760,   at: .12, d: .34, g: .055, type: 'triangle' });
      },
      boing() {
        tone({ f: 330, f2: 620, d: .11, g: .16 });
        tone({ f: 620, f2: 440, at: .1, d: .12, g: .12 });
      },
      /* a short "mew": bright formant, pitch up then falling away */
      meow() {
        if (!ctx) return;
        const t = ctx.currentTime, d = .42;
        const o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain();
        const f1 = ctx.createBiquadFilter(), gn = ctx.createGain();
        o.type = 'sawtooth';
        const base = rand(.94, 1.1);
        o.frequency.setValueAtTime(560 * base, t);
        o.frequency.linearRampToValueAtTime(900 * base, t + .09);
        o.frequency.linearRampToValueAtTime(820 * base, t + .22);
        o.frequency.exponentialRampToValueAtTime(470 * base, t + d);
        lfo.frequency.value = 26; lg.gain.value = 10;
        lfo.connect(lg); lg.connect(o.frequency);
        f1.type = 'bandpass'; f1.Q.value = 2.2;
        f1.frequency.setValueAtTime(900, t);
        f1.frequency.linearRampToValueAtTime(1900, t + .12);     // mouth opening: "m-eh"
        f1.frequency.linearRampToValueAtTime(1100, t + d);       // closing: "-w"
        gn.gain.setValueAtTime(.0001, t);
        gn.gain.exponentialRampToValueAtTime(.2, t + .06);
        gn.gain.setValueAtTime(.2, t + .2);
        gn.gain.exponentialRampToValueAtTime(.0001, t + d);
        o.connect(f1); f1.connect(gn); gn.connect(master);
        o.start(t); lfo.start(t); o.stop(t + d + .05); lfo.stop(t + d + .05);
      },
      tick()  { tone({ f: 880, f2: 1180, d: .06, g: .08 }); },
      back()  { tone({ f: 720, f2: 260, d: .2, g: .14 }); },
      /* finale: a little rising music-box run */
      chime() {
        [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568].forEach((f, i) => {
          tone({ f, at: i * .11, d: .7, g: .09, type: 'triangle' });
          tone({ f: f * 2, at: i * .11, d: .4, g: .025 });
        });
      },
    };
  })();

  /* ---- background song ----
     Plays quietly under the game from the moment the cover opens. It stops on
     the last page (the voice note there has its own music), when the sound
     button is off, and when the tab is hidden. */
  const Bgm = (() => {
    const el = $('#bgm'), LEVEL = .22;
    let gain = null, hooked = false, want = false, quiet = false, vol = 0, raf = 0;

    // iOS ignores audio.volume, so on a real site the song is routed through a
    // gain node instead. From file:// that route is silent, so fall back there.
    function hook() {
      if (hooked) return;
      hooked = true;
      const ctx = Sfx.ctx();
      if (!ctx || location.protocol === 'file:') return;
      try {
        gain = ctx.createGain(); gain.gain.value = 0;
        ctx.createMediaElementSource(el).connect(gain);
        gain.connect(ctx.destination);
      } catch (_) { gain = null; }
    }
    function setVol(v) { vol = v; if (gain) gain.gain.value = v; else el.volume = v; }
    function fadeTo(target, ms, done) {
      cancelAnimationFrame(raf);
      const from = vol, t0 = performance.now();
      const step = now => {
        const k = Math.min(1, (now - t0) / ms);
        setVol(from + (target - from) * k);
        if (k < 1) raf = requestAnimationFrame(step); else if (done) done();
      };
      raf = requestAnimationFrame(step);
    }
    function sync() {
      if (!el) return;
      if (want && state.sound && !quiet && !document.hidden) {
        hook();
        if (el.paused) { setVol(0); const p = el.play(); if (p && p.catch) p.catch(() => {}); }
        fadeTo(LEVEL, 1400);
      } else if (!el.paused) {
        if (document.hidden) { cancelAnimationFrame(raf); el.pause(); }   // no frames while hidden
        else fadeTo(0, 450, () => el.pause());
      }
    }
    document.addEventListener('visibilitychange', sync);
    return {
      start() { want = true; sync(); },
      quiet(on) { quiet = on; sync(); },
      sync,
    };
  })();

  /* ==========================================================
     3. THE ROOM — isometric, drawn from scratch as SVG
     Room space is a 10 × 10 floor, walls 7 high.
       x runs along the right-hand wall, y along the left-hand wall, z is up.
     ========================================================== */
  const ROOM_W = 920, ROOM_H = 820;          // the part of the drawing that is shown

  function buildRoomSvg() {
    const A = 42, OX = 500, OY = 392, H = 7;
    const P = (x, y, z = 0) => [OX + (x - y) * A, OY + (x + y) * A / 2 - z * A];
    const pts = ps => ps.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    const LINE = '#6b4fa8';
    const poly = (fill, ps, extra = `stroke="${LINE}" stroke-width="2"`) =>
      `<polygon points="${pts(ps)}" fill="${fill}" ${extra}/>`;
    const flat = 'stroke="none"';
    // a box; c = [top, face toward +y (reads as the left side), face toward +x (the right side)]
    const box = (x, y, z, dx, dy, dz, c) =>
      poly(c[1], [P(x, y + dy, z), P(x + dx, y + dy, z), P(x + dx, y + dy, z + dz), P(x, y + dy, z + dz)]) +
      poly(c[2], [P(x + dx, y, z), P(x + dx, y + dy, z), P(x + dx, y + dy, z + dz), P(x + dx, y, z + dz)]) +
      poly(c[0], [P(x, y, z + dz), P(x + dx, y, z + dz), P(x + dx, y + dy, z + dz), P(x, y + dy, z + dz)]);
    // rectangles lying flat against a wall
    const onR = (x0, x1, z0, z1, fill, extra) => poly(fill, [P(x0, 0, z0), P(x1, 0, z0), P(x1, 0, z1), P(x0, 0, z1)], extra);
    const onL = (y0, y1, z0, z1, fill, extra) => poly(fill, [P(0, y0, z0), P(0, y1, z0), P(0, y1, z1), P(0, y0, z1)], extra);
    const heart = 'M0,15 C-34,-9 -15,-32 0,-15 C15,-32 34,-9 0,15Z';
    const at = p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;

    const WOOD = ['#ffe6d3', '#f5cdb6', '#eebfa6'];
    const LILAC = ['#efe6ff', '#cdbcf8', '#b9a3f2'];
    const DARK = ['#6a5699', '#4c3c78', '#3d2f63'];
    const WHITE = ['#ffffff', '#ece3ff', '#ddd0fb'];

    let s = `<defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#7d6bd6"/><stop offset=".55" stop-color="#c49be8"/><stop offset="1" stop-color="#ffc9dd"/>
      </linearGradient>
      <linearGradient id="tv" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#b79cf5"/><stop offset="1" stop-color="#7d5fd6"/>
      </linearGradient>
    </defs>`;

    /* --- soft shadow under the whole room, then the floor slab --- */
    s += `<ellipse cx="500" cy="${OY + 10 * A + 22}" rx="400" ry="34" fill="#8f6fe0" opacity=".18"/>`;
    s += poly('#c9a892', [P(0, 10), P(10, 10), P(10, 10, -.6), P(0, 10, -.6)]);
    s += poly('#b8957f', [P(10, 0), P(10, 10), P(10, 10, -.6), P(10, 0, -.6)]);
    s += poly(WOOD[0], [P(0, 0), P(10, 0), P(10, 10), P(0, 10)]);
    for (let i = 1; i < 10; i++) {                     // floorboards
      const a = P(0, i), b = P(10, i);
      s += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${WOOD[1]}" stroke-width="1.6"/>`;
      for (let k = 0; k < 3; k++) {
        const x = (i * 3.7 + k * 3.3) % 10, c = P(x, i - 1), e = P(x, i);
        s += `<line x1="${c[0]}" y1="${c[1]}" x2="${e[0]}" y2="${e[1]}" stroke="${WOOD[1]}" stroke-width="1.2"/>`;
      }
    }

    /* --- walls --- */
    s += poly('#dcd0ff', [P(0, 0), P(0, 10), P(0, 10, H), P(0, 0, H)]);          // left
    s += poly('#ebe3ff', [P(0, 0), P(10, 0), P(10, 0, H), P(0, 0, H)]);          // right
    for (let i = 1; i < 10; i++) {                     // faint wallpaper stripes
      const a = P(0, i, .4), b = P(0, i, H), c = P(i, 0, .4), e = P(i, 0, H);
      s += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#fff" stroke-width="5" opacity=".28"/>`;
      s += `<line x1="${c[0]}" y1="${c[1]}" x2="${e[0]}" y2="${e[1]}" stroke="#fff" stroke-width="5" opacity=".4"/>`;
    }
    s += onL(0, 10, 0, .4, '#b9a3f2'); s += onR(0, 10, 0, .4, '#c9b6f8');       // skirting
    // wall thickness: caps along the top and at the two open ends
    s += poly('#a58be8', [P(0, 0, H), P(0, 10, H), P(-.45, 10, H), P(-.45, -.45, H)]);
    s += poly('#b49cf0', [P(0, 0, H), P(10, 0, H), P(10, -.45, H), P(-.45, -.45, H)]);
    s += poly('#9479dc', [P(0, 10, -.6), P(-.45, 10, -.6), P(-.45, 10, H), P(0, 10, H)]);
    s += poly('#8a6fd4', [P(10, 0, -.6), P(10, -.45, -.6), P(10, -.45, H), P(10, 0, H)]);

    /* --- right wall: window with an evening sky, curtains, frames --- */
    s += onR(2.0, 5.6, 2.5, 5.9, '#fff');
    s += onR(2.15, 5.45, 2.65, 5.75, 'url(#sky)');
    [[2.5, .7], [3.0, 1.1], [3.5, .6], [4.3, 1.3], [4.8, .8]].forEach(([x, h]) => {   // skyline
      s += onR(x, x + .45, 2.65, 2.65 + h, '#6d59b8', flat + ' opacity=".55"');
    });
    const moon = P(4.7, 0, 5.1);
    s += `<circle cx="${moon[0]}" cy="${moon[1]}" r="11" fill="#fff6d6"/>`;
    [[2.6, 5.2], [3.4, 5.4], [3.9, 4.7], [2.9, 4.4]].forEach(([x, z]) => {
      const p = P(x, 0, z); s += `<circle cx="${p[0]}" cy="${p[1]}" r="2.4" fill="#fff"/>`;
    });
    s += onR(3.75, 3.85, 2.65, 5.75, '#fff', flat); s += onR(2.15, 5.45, 4.15, 4.25, '#fff', flat);
    s += onR(1.9, 5.7, 2.35, 2.5, '#fff');                                         // sill
    const rodA = P(1.4, 0, 6.2), rodB = P(6.2, 0, 6.2);
    s += `<line x1="${rodA[0]}" y1="${rodA[1]}" x2="${rodB[0]}" y2="${rodB[1]}" stroke="${LINE}" stroke-width="5" stroke-linecap="round"/>`;
    [[1.6, 2.5], [5.1, 6.0]].forEach(([x0, x1]) => {                                // curtains
      s += onR(x0, x1, 2.0, 6.15, '#b79cf5');
      for (let x = x0 + .22; x < x1 - .05; x += .22) {
        const a = P(x, 0, 2.1), b = P(x, 0, 6.05);
        s += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#9c80e6" stroke-width="2"/>`;
      }
    });
    s += onR(6.8, 7.8, 3.9, 5.3, '#fff'); s += onR(6.92, 7.68, 4.02, 5.18, '#ffd6f2', flat);
    s += `<path d="${heart}" fill="#ff8fd0" transform="matrix(.62,.31,0,.62,${at(P(7.3, 0, 4.6))})"/>`;
    s += onR(8.2, 9.3, 4.2, 5.1, '#fff'); s += onR(8.32, 9.18, 4.32, 4.98, '#cbbaf8', flat);
    s += `<path d="${heart}" fill="#fff" transform="matrix(.45,.22,0,.45,${at(P(8.75, 0, 4.65))})"/>`;

    /* --- left wall: fairy lights, a neon heart, polaroids, a shelf --- */
    let wire = '';
    const bulbs = [];
    for (let i = 0; i <= 44; i++) {
      const y = .5 + i * .2, z = 6.45 - .42 * Math.abs(Math.sin(Math.PI * i / 22));
      const p = P(0, y, z);
      wire += (i ? 'L' : 'M') + at(p);
      if (i % 3 === 1) bulbs.push(p);
    }
    s += `<path d="${wire}" fill="none" stroke="${LINE}" stroke-width="2"/>`;
    bulbs.forEach((p, i) => {
      const c = ['#fff2a8', '#ffc4ec', '#ffffff'][i % 3];
      s += `<circle cx="${p[0]}" cy="${p[1] + 6}" r="9" fill="${c}" opacity=".35"/>`;
      s += `<circle cx="${p[0]}" cy="${p[1] + 6}" r="4.5" fill="${c}" stroke="${LINE}" stroke-width="1.2"/>`;
    });
    const neon = `matrix(1.9,-.95,0,1.9,${at(P(0, 2.9, 4.5))})`;
    s += `<path d="${heart}" fill="none" stroke="#ff9de6" stroke-width="7" opacity=".35" transform="${neon}"/>`;
    s += `<path d="${heart}" fill="none" stroke="#ffb8ee" stroke-width="3.2" stroke-linejoin="round" transform="${neon}"/>`;
    s += `<path d="${heart}" fill="none" stroke="#fff" stroke-width="1" transform="${neon}"/>`;
    [[5.3, 4.2, '#ffd6f2'], [6.4, 4.7, '#cbbaf8'], [7.6, 4.6, '#fff2c4'], [8.7, 4.3, '#ffd6f2']].forEach(([y, z, c]) => {   // polaroids
      s += onL(y, y + .8, z, z + 1.0, '#fff', `stroke="${LINE}" stroke-width="1.5"`);
      s += onL(y + .1, y + .7, z + .28, z + .9, c, flat);
    });
    s += box(0, 6.2, 3.1, .7, 3.0, .14, WHITE);                                     // shelf
    s += box(.1, 6.5, 3.24, .45, .22, .7, ['#ffb8ea', '#ff9ddc', '#f08acb']);
    s += box(.1, 6.78, 3.24, .45, .2, .85, ['#b79cf5', '#9c80e6', '#8468d4']);
    s += box(.1, 7.04, 3.24, .45, .24, .6, ['#fff2a8', '#f7e08a', '#ecd070']);
    s += box(.12, 8.2, 3.24, .45, .5, .4, WHITE);
    const pot = P(.35, 8.45, 3.64);
    s += `<ellipse cx="${pot[0] - 8}" cy="${pot[1] - 12}" rx="7" ry="15" fill="#7fb883" stroke="${LINE}" stroke-width="1.5" transform="rotate(-24 ${pot[0] - 8} ${pot[1] - 12})"/>`;
    s += `<ellipse cx="${pot[0] + 8}" cy="${pot[1] - 13}" rx="7" ry="15" fill="#93c896" stroke="${LINE}" stroke-width="1.5" transform="rotate(24 ${pot[0] + 8} ${pot[1] - 13})"/>`;

    /* --- rug --- */
    const rug = P(6.1, 6.3);
    s += `<ellipse cx="${rug[0]}" cy="${rug[1]}" rx="176" ry="88" fill="#d9ccff" stroke="${LINE}" stroke-width="2"/>`;
    s += `<ellipse cx="${rug[0]}" cy="${rug[1]}" rx="150" ry="75" fill="none" stroke="#fff" stroke-width="4" stroke-dasharray="3 11" stroke-linecap="round"/>`;
    s += `<ellipse cx="${rug[0]}" cy="${rug[1]}" rx="122" ry="61" fill="#c4b0f7"/>`;
    s += `<path d="${heart}" fill="#efe6ff" transform="translate(${rug[0]},${rug[1] + 4}) scale(2.3,1.15)"/>`;

    /* --- bed, tucked into the back corner along the left wall --- */
    s += box(.3, .3, 0, 3.1, .3, 2.3, DARK);                                        // headboard
    s += box(.3, .6, 0, 3.1, 4.9, .8, DARK);                                        // frame
    s += box(.4, .6, .8, 2.9, 4.8, .5, WHITE);                                      // mattress
    s += box(.8, .85, 1.3, 2.1, 1.0, .3, WHITE);                                    // pillow
    s += box(.33, 2.3, .8, 3.04, 3.15, .62, LILAC);                                 // duvet
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if ((i + j) % 2 === 0) {
      const x = .33 + i * 3.04 / 3, y = 2.3 + j * 3.15 / 3, w = 3.04 / 3, h = 3.15 / 3;
      s += poly('#d6c6ff', [P(x, y, 1.42), P(x + w, y, 1.42), P(x + w, y + h, 1.42), P(x, y + h, 1.42)], flat);
    }
    s += `<path d="${heart}" fill="#ffb8ea" transform="matrix(1.1,.55,-1.1,.55,${at(P(1.85, 3.9, 1.42))})"/>`;

    /* --- bedside table --- */
    s += box(3.75, .35, 0, 1.2, 1.2, 1.25, WHITE);
    s += poly('none', [P(3.85, 1.55, .7), P(4.85, 1.55, .7), P(4.85, 1.55, 1.1), P(3.85, 1.55, 1.1)], `stroke="${LINE}" stroke-width="1.5"`);

    /* --- TV unit along the right wall --- */
    s += box(6.2, .3, 0, 3.4, 1.15, 1.05, DARK);
    s += poly('none', [P(6.4, 1.45, .2), P(7.8, 1.45, .2), P(7.8, 1.45, .85), P(6.4, 1.45, .85)], 'stroke="#8f7cc4" stroke-width="1.5"');
    s += poly('none', [P(8.0, 1.45, .2), P(9.4, 1.45, .2), P(9.4, 1.45, .85), P(8.0, 1.45, .85)], 'stroke="#8f7cc4" stroke-width="1.5"');
    s += box(7.6, .7, 1.05, .6, .3, .12, DARK);
    s += box(6.6, .75, 1.17, 2.6, .16, 1.65, ['#4c3c78', '#2f244f', '#2f244f']);
    s += poly('url(#tv)', [P(6.72, .91, 1.29), P(9.08, .91, 1.29), P(9.08, .91, 2.7), P(6.72, .91, 2.7)], flat);
    s += `<path d="${heart}" fill="#fff" opacity=".9" transform="matrix(.85,.42,0,.85,${at(P(7.9, .91, 2.0))})"/>`;

    /* --- desk under the shelf --- */
    s += box(.35, 8.35, 0, 1.5, 1.2, 1.35, LILAC);
    s += box(.4, 6.35, 0, .16, .16, 1.35, WHITE); s += box(1.64, 6.35, 0, .16, .16, 1.35, WHITE);
    s += box(.3, 6.25, 1.35, 1.65, 3.4, .14, WHITE);
    s += box(.5, 7.1, 1.49, .14, 1.5, 1.0, ['#4c3c78', '#2f244f', '#2f244f']);
    s += poly('url(#tv)', [P(.64, 7.2, 1.58), P(.64, 8.5, 1.58), P(.64, 8.5, 2.4), P(.64, 7.2, 2.4)], flat);

    /* --- a little tea table on the rug --- */
    s += box(7.1, 5.1, 0, 1.1, 1.1, .6, DARK);
    s += box(6.75, 4.75, .6, 1.8, 1.8, .16, WHITE);

    return `<svg class="room__svg" xmlns="http://www.w3.org/2000/svg" viewBox="40 48 ${ROOM_W} ${ROOM_H}" ` +
           `width="${ROOM_W}" height="${ROOM_H}" stroke-linejoin="round" aria-hidden="true">${s}</svg>`;
  }

  /* ==========================================================
     4. PARTICLES + BACKGROUND HEARTS
     ========================================================== */
  const HEART = '<svg viewBox="0 0 32 30"><path fill="currentColor" d="M16 29C-8 14 4-6 16 6 28-6 40 14 16 29Z"/></svg>';
  const SPARK = '<svg viewBox="0 0 32 32"><path fill="currentColor" d="M16 0c2 10 6 14 16 16-10 2-14 6-16 16C14 22 10 18 0 16 10 14 14 10 16 0Z"/></svg>';
  const PURPLES = ['#8f6fe0', '#b79cf5', '#c9b4ff', '#a487f0', '#ffb8ea', '#ffffff'];
  const fx = $('#fx'), sky = $('#sky');

  function particle(cls, vars, html, color) {
    const el = document.createElement('i');
    el.className = 'p ' + cls;
    el.innerHTML = html;
    el.style.color = color;
    for (const k in vars) el.style.setProperty(k, vars[k]);
    el.addEventListener('animationend', () => el.remove(), { once: true });
    fx.appendChild(el);
  }
  function burst(x, y, n = 12) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-.3, .3), r = rand(46, 100);
      particle('p--burst', {
        '--x': x + 'px', '--y': y + 'px',
        '--dx': Math.cos(a) * r + 'px', '--dy': Math.sin(a) * r - 22 + 'px',
        '--s': rand(11, 22) + 'px', '--r': rand(-120, 120) + 'deg', '--d': rand(.6, .95) + 's',
      }, i % 2 ? HEART : SPARK, PURPLES[i % PURPLES.length]);
    }
  }
  function celebrate() {
    const w = innerWidth;
    for (let i = 0; i < 54; i++) {
      particle('p--rise', {
        '--x': rand(0, w) + 'px', '--dx': rand(-60, 60) + 'px',
        '--s': rand(16, 44) + 'px', '--r': rand(-40, 40) + 'deg',
        '--d': rand(2.0, 3.2) + 's', '--delay': rand(0, 1.3) + 's',
      }, i % 3 ? HEART : SPARK, PURPLES[i % PURPLES.length]);
    }
  }
  // the quiet hearts that are always drifting up behind the book
  setInterval(() => {
    if (document.hidden || sky.childElementCount > 12) return;
    const el = document.createElement('i');
    el.className = 'floaty';
    el.innerHTML = HEART;
    el.style.cssText = `left:${rand(2, 96)}%;--s:${rand(14, 34)}px;--d:${rand(9, 15)}s;--o:${rand(.18, .4)};--sway:${rand(-40, 40)}px`;
    el.addEventListener('animationend', () => el.remove(), { once: true });
    sky.appendChild(el);
  }, 1300);

  /* ==========================================================
     5. TRAY + STICKERS + DRAG
     ========================================================== */
  const room = $('#room'), roomWrap = $('#roomWrap'), tray = $('#tray');
  const dragLayer = $('#dragLayer'), hint = $('#roomHint');
  room.insertAdjacentHTML('afterbegin', buildRoomSvg());

  function fitRoom() {
    // client sizes are untransformed, so this is right even while the book is closed and scaled
    const W = roomWrap.clientWidth - 12, Hh = roomWrap.clientHeight - 4;
    if (W <= 0 || Hh <= 0) return;
    const w = Math.min(W, Hh * ROOM_W / ROOM_H);
    room.style.width = w + 'px';
    room.style.height = w * ROOM_H / ROOM_W + 'px';
  }
  new ResizeObserver(fitRoom).observe(roomWrap);
  fitRoom();

  /* ---- tray ---- */
  const slots = {};
  STICKERS.forEach(st => {
    const grid = $('#grid-' + st.tab);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'slot';
    b.setAttribute('aria-label', st.id.replace(/-/g, ' '));
    const img = new Image();
    img.src = st.src; img.alt = ''; img.className = 'slot__img'; img.draggable = false;
    img.style.setProperty('--i', grid.childElementCount);
    b.appendChild(img);
    b.addEventListener('pointerdown', e => onDown(e, st, 'tray'));
    grid.appendChild(b);
    slots[st.id] = b;
    st.img = img;
  });
  document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
    Sfx.tick();
    document.querySelectorAll('.tab').forEach(t => {
      const on = t === tab;
      t.classList.toggle('is-on', on); t.setAttribute('aria-selected', on);
    });
    document.querySelectorAll('.tray__grid').forEach(g => {
      g.hidden = g.dataset.tab !== tab.dataset.tab;
      if (!g.hidden) g.querySelectorAll('.slot__img').forEach(i => {   // replay the pop-in
        i.style.animation = 'none'; void i.offsetWidth; i.style.animation = '';
      });
    });
  }));

  /* ---- sticker elements ---- */
  function makeStk(st) {
    const el = document.createElement('div');
    el.className = 'stk';
    el.innerHTML = '<div class="stk__lift"><div class="stk__idle"><img alt="" draggable="false"></div></div>';
    $('img', el).src = st.src;
    // every sticker breathes on its own clock, so the room never moves in unison
    el.style.setProperty('--idle-d', rand(2.6, 4.2).toFixed(2) + 's');
    el.style.setProperty('--idle-delay', (-rand(0, 4)).toFixed(2) + 's');
    el.style.setProperty('--idle-r', (rand(1.1, 2.2) * (Math.random() < .5 ? -1 : 1)).toFixed(2) + 'deg');
    el.addEventListener('pointerdown', e => onDown(e, st, 'room'));
    st.el = el;
    return el;
  }
  function putInRoom(st) {
    const p = state.placed[st.id], el = st.el || makeStk(st);
    el.style.left = (p.x * 100).toFixed(2) + '%';
    el.style.top = (p.y * 100).toFixed(2) + '%';
    el.style.width = st.w * 100 + '%';
    el.style.zIndex = p.z;
    el.style.transform = '';
    room.appendChild(el);
    slots[st.id].classList.add('is-used');
  }
  function replay(node, cls) {
    node.classList.remove('is-pop', 'is-hop'); void node.offsetWidth; node.classList.add(cls);
    node.addEventListener('animationend', () => node.classList.remove(cls), { once: true });
  }

  /* ---- progress ---- */
  const progressEl = $('#progress'), fillEl = $('#progressFill'), countEl = $('#progressCount');
  const count = () => Object.keys(state.placed).length;
  function updateProgress(bump) {
    const n = count();
    countEl.textContent = n;
    fillEl.style.transform = `scaleX(${Math.min(1, n / GOAL)})`;
    hint.classList.toggle('is-off', n > 0);
    if (bump) { progressEl.classList.remove('is-bump'); void progressEl.offsetWidth; progressEl.classList.add('is-bump'); }
  }

  /* ---- drag ---- */
  const HOLD_MS = 650, SLOP = 7;
  let drag = null;

  function onDown(e, st, from) {
    if (drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (from === 'tray' && slots[st.id].classList.contains('is-used')) return;
    e.preventDefault();
    Sfx.unlock();
    drag = { st, from, pid: e.pointerId, x0: e.clientX, y0: e.clientY, lastX: e.clientX, tilt: 0, started: false, touch: e.pointerType !== 'mouse' };
    if (from === 'room') drag.hold = setTimeout(holdToReturn, HOLD_MS);
    addEventListener('pointermove', onMove, { passive: false });
    addEventListener('pointerup', onUp);
    addEventListener('pointercancel', onCancel);
  }
  function endDrag() {
    clearTimeout(drag && drag.hold);
    removeEventListener('pointermove', onMove);
    removeEventListener('pointerup', onUp);
    removeEventListener('pointercancel', onCancel);
    room.classList.remove('is-target');
    drag = null;
  }

  function startDrag(e) {
    const { st } = drag;
    clearTimeout(drag.hold);
    drag.started = true;
    const w = st.w * room.offsetWidth * roomScale();
    let el, cx, cy;
    if (drag.from === 'room') {
      el = st.el;
      const r = el.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2;
    } else {
      el = st.el || makeStk(st);
      // under a finger the sticker would be hidden, so carry it just above the fingertip
      cx = e.clientX; cy = e.clientY - (drag.touch ? w * .45 : 0);
    }
    drag.el = el;
    drag.offX = cx - e.clientX; drag.offY = cy - e.clientY;
    el.style.left = el.style.top = ''; el.style.zIndex = '';
    el.style.width = w + 'px';
    dragLayer.appendChild(el);
    moveTo(e);
    void el.offsetWidth;                     // so the lift pose animates in
    el.classList.add('is-lifted');
    Sfx.peel();
    if (navigator.vibrate) navigator.vibrate(8);
  }
  // the room is drawn at scale 1 once the book is open; this keeps sizes right regardless
  function roomScale() { return room.offsetWidth ? room.getBoundingClientRect().width / room.offsetWidth : 1; }

  function moveTo(e) {
    const x = e.clientX + drag.offX, y = e.clientY + drag.offY;
    drag.cx = x; drag.cy = y;
    drag.el.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%)`;
    // lean into the direction of travel
    drag.tilt = drag.tilt * .7 + clamp((e.clientX - drag.lastX) * 1.2, -16, 16) * .3;
    drag.lastX = e.clientX;
    drag.el.style.setProperty('--tilt', drag.tilt.toFixed(1) + 'deg');
    room.classList.toggle('is-target', inside(room.getBoundingClientRect(), x, y, 0));
  }
  const inside = (r, x, y, pad) => x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;

  function onMove(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    e.preventDefault();
    if (!drag.started) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < SLOP) return;
      startDrag(e);
    } else moveTo(e);
  }

  function onUp(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    const { st, from, started, el, cx, cy } = drag;
    endDrag();
    if (!started) return tap(st, from);

    const overTray = inside(tray.getBoundingClientRect(), cx, cy, 0);
    const rr = room.getBoundingClientRect();
    if (overTray || (from === 'tray' && !inside(rr, cx, cy, 24))) return sendToTray(st, el);

    // stick it down
    state.placed[st.id] = {
      x: clamp((cx - rr.left) / rr.width, .04, .96),
      y: clamp((cy - rr.top) / rr.height, .05, .95),
      z: ++zTop,                              // the latest sticker always lands on top
    };
    el.classList.remove('is-lifted');
    el.style.removeProperty('--tilt');
    putInRoom(st);
    replay($('img', el), 'is-pop');
    const p = state.placed[st.id];
    burst(rr.left + p.x * rr.width, rr.top + p.y * rr.height);
    Sfx.pop();
    if (navigator.vibrate) navigator.vibrate(12);
    save();
    updateProgress(from === 'tray');
    if (from === 'tray' && count() >= GOAL && !state.finaleSeen) setTimeout(showFinale, 1100);
  }

  function onCancel(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    const { st, from, started, el } = drag;
    endDrag();
    if (!started) return;
    el.classList.remove('is-lifted');
    if (from === 'room') putInRoom(st); else { el.remove(); }
  }

  function tap(st, from) {
    if (from === 'room') {
      replay($('img', st.el), 'is-hop');
      if (st.meow) Sfx.meow(); else Sfx.boing();
      const r = st.el.getBoundingClientRect();
      burst(r.left + r.width / 2, r.top + r.height * .25, 5);
    } else {
      const slot = slots[st.id];
      slot.classList.remove('is-wiggle'); void slot.offsetWidth; slot.classList.add('is-wiggle');
      Sfx.tick();
      toast('ลากขึ้นไปแปะในห้องได้เลย~ 💜');
    }
  }

  function holdToReturn() {
    if (!drag || drag.started) return;
    const { st } = drag;
    endDrag();
    if (navigator.vibrate) navigator.vibrate(18);
    sendToTray(st, st.el);
  }

  function sendToTray(st, el) {
    const wasPlaced = !!state.placed[st.id];
    delete state.placed[st.id];
    showTab(st.tab);
    const slot = slots[st.id];
    const from = el.getBoundingClientRect(), to = slot.getBoundingClientRect();
    // fly home from wherever it is now
    el.classList.remove('is-lifted');
    el.style.left = el.style.top = el.style.zIndex = '';
    el.style.width = from.width + 'px';
    el.style.transform = `translate3d(${from.left + from.width / 2}px,${from.top + from.height / 2}px,0) translate(-50%,-50%)`;
    dragLayer.appendChild(el);
    void el.offsetWidth;
    el.classList.add('is-leaving');
    el.style.transform = `translate3d(${to.left + to.width / 2}px,${to.top + to.height / 2}px,0) translate(-50%,-50%) scale(.35)`;
    setTimeout(() => {
      el.remove(); el.classList.remove('is-leaving');
      slot.classList.remove('is-used');
      slot.classList.remove('is-wiggle'); void slot.offsetWidth; slot.classList.add('is-wiggle');
    }, 300);
    Sfx.back();
    if (wasPlaced) { save(); updateProgress(false); }
  }
  function showTab(name) {
    const tab = $(`.tab[data-tab="${name}"]`);
    if (!tab.classList.contains('is-on')) tab.click();
  }

  // long-press must never open the browser's image / selection menu
  addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('dragstart', e => e.preventDefault());
  // iOS Safari ignores touch-action on some ancestors; this is the belt to those braces
  document.addEventListener('touchmove', e => { if (drag) e.preventDefault(); }, { passive: false });

  // restore what was stuck last time
  Object.keys(state.placed)
    .sort((a, b) => state.placed[a].z - state.placed[b].z)
    .forEach(id => putInRoom(byId[id]));
  updateProgress(false);

  /* ---- toast ---- */
  const toastEl = $('#toast');
  let toastT;
  function toast(msg, ms = 2200) {
    toastEl.textContent = msg;
    toastEl.classList.add('is-on');
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove('is-on'), ms);
  }

  /* ---- sound + reset buttons ---- */
  const soundBtn = $('#soundBtn');
  function paintSound() {
    soundBtn.textContent = state.sound ? '🔊' : '🔇';
    soundBtn.setAttribute('aria-pressed', state.sound);
  }
  paintSound();
  soundBtn.addEventListener('click', () => {
    state.sound = !state.sound;
    Sfx.unlock(); Sfx.setOn(state.sound); Bgm.sync();
    paintSound(); save();
    if (state.sound) Sfx.tick();
  });

  const confirmEl = $('#confirm');
  $('#resetBtn').addEventListener('click', () => {
    Sfx.tick();
    if (!count()) return toast('ห้องยังว่างอยู่เลยน้า');
    confirmEl.hidden = false;
  });
  $('#confirmNo').addEventListener('click', () => { Sfx.tick(); confirmEl.hidden = true; });
  confirmEl.addEventListener('click', e => { if (e.target === confirmEl) confirmEl.hidden = true; });
  $('#confirmYes').addEventListener('click', () => {
    confirmEl.hidden = true;
    Object.keys(state.placed).forEach(id => {
      const st = byId[id];
      st.el.remove();
      slots[id].classList.remove('is-used');
    });
    state.placed = {}; state.finaleSeen = false; zTop = 0;
    save(); updateProgress(true);
    Sfx.back();
    toast('เริ่มใหม่แล้ว~ ✨');
  });

  /* ==========================================================
     6. COVER, FINALE, POEM, VOICE, SAVE
     ========================================================== */
  const book = $('#book'), bookFloat = $('#bookFloat'), cover = $('#cover');
  const roomPage = $('#roomPage'), endPage = $('#endPage');
  bookFloat.classList.add('is-floating');

  cover.addEventListener('click', () => {
    if (cover.classList.contains('is-open')) return;
    Sfx.unlock(); Sfx.paper(); Bgm.start();
    bookFloat.classList.remove('is-floating');
    book.classList.remove('is-closed');
    cover.classList.add('is-open');
    const r = cover.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2, 14);
    setTimeout(() => { cover.classList.add('is-gone'); fitRoom(); }, 1600);
  });

  /* ---- finale ---- */
  let finaleBusy = false;
  function showFinale() {
    if (finaleBusy || roomPage.classList.contains('is-turned') || drag) return;
    finaleBusy = true;
    state.finaleSeen = true; save();
    celebrate();
    Sfx.chime();
    setTimeout(() => {
      Sfx.paper();
      Bgm.quiet(true);
      resetPoem();
      endPage.setAttribute('aria-hidden', 'false');
      roomPage.classList.add('is-turned');
      $('.end').scrollTop = 0;
      setTimeout(() => { finaleBusy = false; typePoem(); }, 1100);
    }, 1700);
  }
  $('#doneBtn').addEventListener('click', () => {
    Sfx.tick();
    if (!count()) return toast('แปะสติกเกอร์สักชิ้นก่อนน้า 💜');
    showFinale();
  });
  $('#backBtn').addEventListener('click', () => {
    Sfx.paper();
    stopVoice();
    clearTimeout(typeT);
    roomPage.classList.remove('is-turned');
    Bgm.quiet(false);
    endPage.setAttribute('aria-hidden', 'true');
  });

  /* ---- poem: each line fades in, then is "typed" grapheme by grapheme ----
     The text stays in the HTML untouched; it is only split into spans so the
     layout is already final and nothing jumps while it types. Thai vowels and
     tone marks must stay glued to their consonant, hence the segmenter. */
  const poem = $('#poem');
  const lines = [...poem.querySelectorAll('.poem__line')];
  const split = text => {
    if (window.Intl && Intl.Segmenter) return [...new Intl.Segmenter('th', { granularity: 'grapheme' }).segment(text)].map(s => s.segment);
    return text.match(/[\s\S][ัิ-ฺ็-๎️‍]*/gu) || [];
  };
  lines.forEach(line => {
    const text = line.textContent;
    line.setAttribute('aria-label', text);
    line.textContent = '';
    split(text).forEach(g => {
      const sp = document.createElement('span');
      sp.className = 'ch'; sp.textContent = g; sp.setAttribute('aria-hidden', 'true');
      line.appendChild(sp);
    });
  });
  const CHAR_MS = 70, LINE_PAUSE = 650;
  let typeT;
  function resetPoem() {
    clearTimeout(typeT);
    poem.querySelectorAll('.is-on').forEach(n => n.classList.remove('is-on'));
  }
  function typePoem() {
    let li = 0, ci = 0;
    const step = () => {
      const line = lines[li];
      if (!line) return;
      if (ci === 0) line.classList.add('is-on');
      const ch = line.children[ci];
      if (ch) {
        ch.classList.add('is-on'); ci++;
        typeT = setTimeout(step, CHAR_MS);
      } else {
        li++; ci = 0;
        typeT = setTimeout(step, LINE_PAUSE);
      }
    };
    step();
  }
  poem.addEventListener('click', () => {           // tap the poem to show it all at once
    clearTimeout(typeT);
    poem.querySelectorAll('.poem__line, .ch').forEach(n => n.classList.add('is-on'));
  });

  /* ---- voice note ---- */
  const audio = $('#voiceAudio'), voiceEl = $('#voice');
  const playBtn = $('#voicePlay'), voiceFill = $('#voiceFill'), voiceTime = $('#voiceTime'), voiceBar = $('#voiceBar');
  const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function paintVoice() {
    const playing = !audio.paused && !audio.ended;
    voiceEl.classList.toggle('is-playing', playing);
    playBtn.textContent = playing ? 'พักก่อน ⏸' : (audio.currentTime > 0 && !audio.ended ? 'ฟังต่อ ▶' : 'ฟังเสียงจากเรา 🎧');
    const d = audio.duration, t = audio.currentTime || 0;
    const k = isFinite(d) && d > 0 ? t / d : 0;
    voiceFill.style.transform = `scaleX(${k})`;
    voiceBar.setAttribute('aria-valuenow', Math.round(k * 100));
    voiceTime.textContent = fmt(t);
  }
  function stopVoice() { audio.pause(); try { audio.currentTime = 0; } catch (_) {} paintVoice(); }
  playBtn.addEventListener('click', () => {
    if (audio.paused) {
      const p = audio.play();
      if (p && p.catch) p.catch(() => toast('เล่นเสียงไม่ได้ ลองกดอีกทีน้า'));
    } else audio.pause();
  });
  $('#voiceStop').addEventListener('click', stopVoice);
  ['play', 'pause', 'ended', 'timeupdate', 'loadedmetadata'].forEach(ev => audio.addEventListener(ev, paintVoice));
  audio.addEventListener('error', () => toast('โหลดไฟล์เสียงไม่ได้'), true);
  voiceBar.addEventListener('pointerdown', e => {
    const r = voiceBar.getBoundingClientRect();
    if (isFinite(audio.duration)) { audio.currentTime = clamp((e.clientX - r.left) / r.width, 0, 1) * audio.duration; paintVoice(); }
  });

  /* ---- save the decorated room as a picture ----
     Drawn by hand onto a canvas (room SVG, then each sticker in stacking order)
     so there is no library to load and the result is sharp on any phone. */
  const loadImg = src => new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im); im.onerror = rej; im.src = src;
  });
  async function saveImage() {
    const W = 1400, PADT = 150, RH = Math.round(W * ROOM_H / ROOM_W), Hh = PADT + RH + 40;
    const c = document.createElement('canvas');
    c.width = W; c.height = Hh;
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, Hh);
    bg.addColorStop(0, '#f6f0ff'); bg.addColorStop(1, '#d6c8ff');
    g.fillStyle = bg; g.fillRect(0, 0, W, Hh);

    const svg = $('.room__svg', room).outerHTML;
    g.drawImage(await loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)), 0, PADT, W, RH);

    const ids = Object.keys(state.placed).sort((a, b) => state.placed[a].z - state.placed[b].z);
    for (const id of ids) {
      const st = byId[id], p = state.placed[id], im = st.img;
      if (!im.complete || !im.naturalWidth) continue;
      const w = st.w * W, h = w * im.naturalHeight / im.naturalWidth;
      g.drawImage(im, p.x * W - w / 2, PADT + p.y * RH - h / 2, w, h);
    }

    g.textAlign = 'center';
    g.lineJoin = 'round';
    g.font = '700 70px Fredoka, Mali, sans-serif';
    g.strokeStyle = '#8f6fe0'; g.lineWidth = 12; g.strokeText('6 Months with you', W / 2, 84);
    g.fillStyle = '#fff'; g.fillText('6 Months with you', W / 2, 84);
    g.font = '600 32px Fredoka, Mali, sans-serif';
    g.fillStyle = '#6b4fa8'; g.fillText('Us & Opor  ·  01.04.2026 → 01.10.2026', W / 2, 134);

    const blob = await new Promise(res => c.toBlob(res, 'image/png'));   // throws if the canvas is tainted
    if (!blob) throw new Error('no blob');
    const file = new File([blob], 'our-room-6-months.png', { type: 'image/png' });
    // phones: the share sheet has "Save Image"; everywhere else: a plain download
    if (matchMedia('(pointer:coarse)').matches && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; }
      catch (err) { if (err && err.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('บันทึกภาพแล้ว 📸');
  }
  $('#saveBtn').addEventListener('click', () => {
    Sfx.tick();
    saveImage().catch(() => toast(
      location.protocol === 'file:'
        ? 'เปิดจากไฟล์ตรงๆ บันทึกภาพไม่ได้ — ต้องเปิดผ่านลิงก์เว็บน้า'
        : 'บันทึกไม่สำเร็จ ลองแคปหน้าจอแทนน้า', 3600));
  });

  // any first touch anywhere is enough to wake the audio engine
  addEventListener('pointerdown', () => Sfx.unlock(), { once: true });
})();
