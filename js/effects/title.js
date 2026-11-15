// タイトル画面の演出(開票速報のオープニング)。絵は SVG と CSS だけで描き、音は Web Audio API で合成する。
// 左にロゴとメニュー、右に「情勢ボード」(選挙区の地図に色がつき、票が積み上がって当確が出る)。
// ゲームの状態には触らない。画面の切り替えは呼び出し側(screens.js の renderTitle)から渡された関数で行う。
//   Game.Effects.Title.render(app, { hasSave, onNew, onContinue, onVersus, onHall, onLegacy, note })
// 演出の設定(通常 / 速い / スキップ、BGM、効果音)はこの画面だけのもので、localStorage に別に保存する。
window.Game = window.Game || {};
Game.Effects = Game.Effects || {};

Game.Effects.Title = (function () {
  const SETTINGS_KEY = 'kokusei-title-settings';
  const SPEED = { normal: 1, fast: 0.4, skip: 0 };
  // 演出の流れ(通常の速さでの秒)。CSS の --d に掛ける
  const T = { board: 0.4, lights: 1.3, kicker: 2.0, logo: 2.3, pin: 3.05, sub: 3.45, menu: 3.8, menuStep: 0.1 };
  const TICKER = [
    '本日投開票', '午後8時、投票が締め切られました', '北陽3区、現職に新人が挑む', '出口調査では大接戦',
    '開票は農村部から進む見込み', '各陣営の事務所に支持者が集まっています', '投票率は前回をやや上回る見込み',
    '約束は、次の選挙で返ってくる',
  ];

  let started = false;     // このページで一度でも演出を見せたか(2回目以降はすぐに最後の形で出す)
  let cleanup = null;

  // ---------------- 設定 ----------------
  function loadSettings() {
    const def = { speed: 'normal', bgm: true, sfx: true };
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? Object.assign(def, JSON.parse(raw)) : def;
    } catch (e) {
      return def;
    }
  }
  function saveSettings(s) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { /* 保存できなくても遊べる */ }
  }
  const reducedMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ---------------- 音(Web Audio API) ----------------
  // BGM は「選挙特番のテーマ」:2小節のファンファーレのあと、ニ短調・8小節のループ(BPM 104)。
  // 弦の刻み、低音、持続音、ニュースの信号音、ティンパニ。1周おきに主旋律が乗る。
  const Audio = (function () {
    let ctx = null, master = null, noiseBuf = null;
    let bus = null, timer = null, step = 0, nextTime = 0;

    function ensure() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      if (!ctx) {
        ctx = new AC();
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -16; comp.ratio.value = 4;
        comp.connect(ctx.destination);
        master = ctx.createGain();
        master.gain.value = 0.85;
        master.connect(comp);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    const ready = () => !!ctx && ctx.state === 'running';

    function tone(dest, { type = 'sine', freq, freqEnd, t, dur, vol, attack = 0.005, filter, detune = 0 }) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
      if (detune) o.detune.value = detune;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let node = o;
      if (filter) {
        const f = ctx.createBiquadFilter();
        f.type = filter.type || 'lowpass';
        f.frequency.setValueAtTime(filter.freq, t);
        if (filter.freqEnd) f.frequency.exponentialRampToValueAtTime(filter.freqEnd, t + dur);
        f.Q.value = filter.q || 1;
        o.connect(f);
        node = f;
      }
      node.connect(g);
      g.connect(dest);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    function noise(dest, { t, dur, vol, type = 'highpass', freq = 6000, q = 1 }) {
      const s = ctx.createBufferSource();
      s.buffer = noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f);
      f.connect(g);
      g.connect(dest);
      s.start(t);
      s.stop(t + dur + 0.05);
    }

    // ---- 効果音 ----
    // 決定音:テロップが出るときのチャイム(上がる2音)
    function decide() {
      if (!ensure()) return;
      const t = ctx.currentTime + 0.01;
      tone(master, { type: 'sine', freq: 1318.5, t, dur: 0.2, vol: 0.14 });
      tone(master, { type: 'triangle', freq: 659.25, t, dur: 0.12, vol: 0.05 });
      tone(master, { type: 'sine', freq: 1975.5, t: t + 0.085, dur: 0.38, vol: 0.12 });
    }
    // 地区に色がつくときの小さな音(だんだん上がる)
    function blip(i) {
      if (!ready()) return;
      const t = ctx.currentTime + 0.01;
      tone(master, { type: 'sine', freq: [587.33, 698.46, 880, 1046.5, 1174.66][i % 5], t, dur: 0.16, vol: 0.07 });
    }
    // 当確の「ドン」:低い打音と、紙をたたく音、上で鳴る金属音
    function stamp() {
      if (!ready()) return;
      const t = ctx.currentTime + 0.01;
      tone(master, { type: 'sine', freq: 150, freqEnd: 34, t, dur: 0.6, vol: 0.95, attack: 0.003 });
      tone(master, { type: 'triangle', freq: 96, freqEnd: 44, t, dur: 0.3, vol: 0.4, attack: 0.002 });
      noise(master, { t, dur: 0.14, vol: 0.5, type: 'lowpass', freq: 1100 });
      noise(master, { t, dur: 0.03, vol: 0.25, type: 'highpass', freq: 4000 });
      tone(master, { type: 'triangle', freq: 1760, t: t + 0.01, dur: 0.5, vol: 0.05 });
      tone(master, { type: 'triangle', freq: 2637, t: t + 0.01, dur: 0.35, vol: 0.03 });
    }

    // ---- BGM ----
    const BPM = 104;
    const S16 = 60 / BPM / 4;
    const N = {
      G1: 49.0, A1: 55.0, Bb1: 58.27, C2: 65.41, D2: 73.42,
      G2: 98.0, A2: 110.0, Bb2: 116.54, C3: 130.81, Cs3: 138.59, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0, Bb3: 233.08,
      C4: 261.63, Cs4: 277.18, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, Bb4: 466.16,
      C5: 523.25, Cs5: 554.37, D5: 587.33, E5: 659.26, F5: 698.46, G5: 783.99, A5: 880.0, Bb5: 932.33,
    };
    // 8小節:Dm → Dm/C → B♭ → A → Gm → B♭ → C → A。mel は [8分音符の位置, 高さ, 長さ(8分)]
    const BARS = [
      { bass: N.D2, pad: [N.D3, N.F3, N.A3], arp: [N.D4, N.A4, N.D5, N.A4], mel: [[0, N.D5, 3], [3, N.F5, 1], [4, N.E5, 2], [6, N.D5, 2]] },
      { bass: N.C2, pad: [N.C3, N.F3, N.A3], arp: [N.C4, N.A4, N.D5, N.A4], mel: [[0, N.A4, 4], [4, N.C5, 2], [6, N.D5, 2]] },
      { bass: N.Bb1, pad: [N.Bb2, N.D3, N.F3], arp: [N.Bb3, N.F4, N.Bb4, N.F4], mel: [[0, N.F5, 3], [3, N.G5, 1], [4, N.F5, 2], [6, N.D5, 2]] },
      { bass: N.A1, pad: [N.A2, N.Cs3, N.E3], arp: [N.A3, N.E4, N.A4, N.E4], mel: [[0, N.E5, 6], [6, N.Cs5, 2]] },
      { bass: N.G1, pad: [N.G2, N.Bb2, N.D3], arp: [N.G3, N.D4, N.G4, N.D4], mel: [[0, N.D5, 3], [3, N.G5, 1], [4, N.Bb5, 2], [6, N.A5, 2]] },
      { bass: N.Bb1, pad: [N.Bb2, N.D3, N.F3], arp: [N.Bb3, N.F4, N.Bb4, N.F4], mel: [[0, N.F5, 4], [4, N.D5, 2], [6, N.F5, 2]] },
      { bass: N.C2, pad: [N.C3, N.E3, N.G3], arp: [N.C4, N.G4, N.C5, N.G4], mel: [[0, N.G5, 3], [3, N.E5, 1], [4, N.C5, 2], [6, N.E5, 2]] },
      { bass: N.A1, pad: [N.A2, N.Cs3, N.E3, N.G3], arp: [N.A3, N.E4, N.Cs5, N.E4], mel: [[0, N.A5, 6]] },
    ];
    const PING = [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0];   // ニュースの信号音のリズム
    // ファンファーレ(ループの前の2小節):[16分音符の位置, 和音, 長さ(16分)]
    const INTRO = 32;
    const FANFARE = [
      [0, [N.D4, N.A4], 3], [4, [N.D4, N.A4], 1.5], [6, [N.F4, N.A4], 1.5], [8, [N.A4, N.D5], 7],
      [16, [N.Bb3, N.D4, N.F4], 3.5], [20, [N.C4, N.E4, N.G4], 3.5], [24, [N.A3, N.Cs4, N.E4, N.A4], 8],
    ];
    function brass(f, t, dur, vol) {
      const fl = { freq: 700, freqEnd: 1900, q: 1.2 };
      tone(bus, { type: 'sawtooth', freq: f, t, dur, vol, attack: 0.03, filter: fl, detune: -7 });
      tone(bus, { type: 'sawtooth', freq: f, t, dur, vol, attack: 0.03, filter: fl, detune: 7 });
    }
    function timpani(f, t, vol) { tone(bus, { type: 'sine', freq: f * 2, freqEnd: f * 0.9, t, dur: 0.45, vol, attack: 0.004 }); }

    function scheduleStep(i, t) {
      if (i < 0) {   // ファンファーレ
        const k = i + INTRO;
        FANFARE.forEach((n) => { if (n[0] === k) n[1].forEach((f) => brass(f, t, S16 * n[2], 0.06)); });
        if (k === 0 || k === 8 || k === 16) timpani(N.D2, t, 0.4);
        if (k >= 24) {   // ティンパニと小太鼓のロールで盛り上げる
          timpani(N.A1, t, 0.14 + (k - 24) * 0.035);
          noise(bus, { t, dur: 0.06, vol: 0.02 + (k - 24) * 0.008, type: 'bandpass', freq: 1900, q: 0.8 });
        }
        return;
      }
      const pass = Math.floor(i / 128);
      const b = Math.floor(i / 16) % 8, bar = BARS[b], s = i % 16;
      if (s === 0) {
        // 持続音(ゆっくりふくらむ和音)
        bar.pad.forEach((f) => {
          tone(bus, { type: 'sawtooth', freq: f, t, dur: S16 * 16.5, vol: 0.02, attack: S16 * 5, filter: { freq: 750, freqEnd: 480 }, detune: 6 });
          tone(bus, { type: 'sawtooth', freq: f, t, dur: S16 * 16.5, vol: 0.02, attack: S16 * 5, filter: { freq: 750, freqEnd: 480 }, detune: -6 });
        });
        timpani(bar.bass, t, 0.3);
        if (b === 0) noise(bus, { t, dur: 1.4, vol: 0.05, type: 'highpass', freq: 5200 });   // シンバル
      }
      // 低音(4分。小節の終わりに経過音)
      if (s % 4 === 0) tone(bus, { type: 'triangle', freq: bar.bass, t, dur: S16 * 3.4, vol: 0.24, filter: { freq: 320 } });
      if (s === 14) tone(bus, { type: 'triangle', freq: bar.bass, t, dur: S16 * 1.6, vol: 0.14, filter: { freq: 320 } });
      // 弦の刻み(8分)
      if (s % 2 === 0) {
        tone(bus, { type: 'sawtooth', freq: bar.arp[(s / 2) % 4], t, dur: S16 * 1.5, vol: s % 8 === 0 ? 0.05 : 0.034, attack: 0.012, filter: { freq: 1700, freqEnd: 800, q: 1.5 } });
      }
      // ニュースの信号音
      if (PING[s]) tone(bus, { type: 'sine', freq: 1760, t, dur: 0.07, vol: 0.02 });
      // 主旋律(1周おき)
      if (pass % 2 === 1 && s % 2 === 0) {
        bar.mel.forEach((m) => {
          if (m[0] !== s / 2) return;
          const dur = S16 * 2 * m[2] * 0.96;
          tone(bus, { type: 'square', freq: m[1], t, dur, vol: 0.036, attack: 0.02, filter: { freq: 2100, freqEnd: 1300 } });
          tone(bus, { type: 'triangle', freq: m[1] / 2, t, dur, vol: 0.03, attack: 0.02 });
        });
      }
      // 刻みの金物と、節目のティンパニ・小太鼓
      if (s % 4 === 2) noise(bus, { t, dur: 0.03, vol: 0.03, freq: 7000 });
      if ((b === 3 || b === 7) && (s === 12 || s === 14)) timpani(bar.bass, t, 0.22);
      if (b === 7 && s >= 8) noise(bus, { t, dur: 0.06, vol: 0.02 + (s - 8) * 0.007, type: 'bandpass', freq: 1900, q: 0.8 });
    }
    function startBgm() {
      if (!ensure() || timer) return;
      const now = ctx.currentTime;
      bus = ctx.createGain();
      bus.gain.setValueAtTime(0.0001, now);
      bus.gain.exponentialRampToValueAtTime(0.6, now + 0.25);
      bus.connect(master);
      // 少しだけ残響(やまびこ)をつける
      const delay = ctx.createDelay(1), fb = ctx.createGain(), wet = ctx.createGain();
      delay.delayTime.value = S16 * 3;
      fb.gain.value = 0.26;
      wet.gain.value = 0.2;
      bus.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(master);
      bus._tail = [delay, fb, wet];
      step = -INTRO;
      nextTime = now + 0.08;
      timer = setInterval(() => {
        while (nextTime < ctx.currentTime + 0.15) {
          scheduleStep(step, nextTime);
          step++;
          nextTime += S16;
        }
      }, 25);
    }
    function stopBgm() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
      const g = bus;
      bus = null;
      if (g && ctx) {
        const t = ctx.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
        setTimeout(() => { g.disconnect(); g._tail.forEach((n) => n.disconnect()); }, 1500);
      }
    }
    return { ensure, ready, decide, blip, stamp, startBgm, stopBgm, playing: () => !!timer };
  })();

  // ---------------- 絵 ----------------
  // 情勢ボード:ゲームと同じ選挙区の地図(Game.Data.DISTRICT)を使う
  function boardHtml() {
    const D = Game.Data.DISTRICT, P = Game.Data.PARTIES;
    const polys = D.regions.map((r) => `<polygon class="tl-rg" points="${r.pts}"/>`).join('');
    const names = D.regions.map((r) => `<text class="tl-rg-name" x="${(r.x * D.viewBox[0] / 100).toFixed(0)}" y="${(r.y * D.viewBox[1] / 100 + 5).toFixed(0)}" text-anchor="middle">${r.name}</text>`).join('');
    const rows = Object.keys(P).map((id) => `
      <div class="tl-bar-row" data-p="${id}" style="--pc:${P[id].color}">
        <span class="pchip">${P[id].short}</span><span class="tl-bar"><i></i></span><span class="tl-bar-num">0</span><span class="tl-called">当確</span>
      </div>`).join('');
    return `
      <div class="tl-board" aria-hidden="true">
        <div class="tl-board-head"><span class="tl-live">LIVE</span><span>開票速報</span><span class="tl-board-seat">${D.name}</span><span class="tl-board-pct">開票率 <b>0</b>%</span></div>
        <svg class="tl-map" viewBox="0 0 ${D.viewBox[0]} ${D.viewBox[1]}">
          <defs><pattern id="tl-scan" width="6" height="6" patternUnits="userSpaceOnUse"><line x1="0" y1="1" x2="6" y2="1" class="scanline"/></pattern></defs>
          <rect class="outland" x="0" y="0" width="${D.viewBox[0]}" height="${D.viewBox[1]}"/>
          <polygon class="sea" points="${D.seaPts}"/><polygon points="${D.seaPts}" fill="url(#tl-scan)"/>
          ${polys}<path class="rail" d="${D.rail}"/>${names}
        </svg>
        <div class="tl-bars">${rows}</div>
      </div>`;
  }
  // ボードを動かす:地区に色がつき、票が積み上がり、当確が出て、また次の開票が始まる
  function startBoard(stage, still, delayMs, onLight) {
    const ids = Object.keys(Game.Data.PARTIES), P = Game.Data.PARTIES;
    const regs = Array.from(stage.querySelectorAll('.tl-rg'));
    const rows = ids.map((id) => stage.querySelector(`.tl-bar-row[data-p="${id}"]`));
    const pctEl = stage.querySelector('.tl-board-pct b');
    let tick = null, hold = null, cycle = 0;

    function plan() {
      const base = [96000, 84000, 41000].sort(() => Math.random() - 0.5);
      const totals = {}, wob = {};
      ids.forEach((id, i) => { totals[id] = Math.round(base[i] * (0.9 + Math.random() * 0.2)); wob[id] = (Math.random() - 0.5) * 0.5; });
      const sum = ids.reduce((a, id) => a + totals[id], 0);
      const winners = regs.map(() => { let x = Math.random() * sum; for (const id of ids) { x -= totals[id]; if (x < 0) return id; } return ids[0]; });
      const order = regs.map((_, i) => i).sort(() => Math.random() - 0.5);
      const th = [];
      order.forEach((ri, k) => { th[ri] = 8 + k * (70 / regs.length) + Math.random() * 6; });
      const leader = ids.slice().sort((a, b) => totals[b] - totals[a])[0];
      return { totals, wob, winners, th, leader, max: totals[leader] };
    }
    function paint(p, pct, quiet) {
      pctEl.textContent = Math.round(pct);
      regs.forEach((el, i) => {
        const on = pct >= p.th[i];
        if (on && !el.classList.contains('lit')) {
          el.style.setProperty('--c', P[p.winners[i]].color);
          if (!quiet && onLight) onLight(i, cycle);
        }
        el.classList.toggle('lit', on);
      });
      rows.forEach((row, i) => {
        const id = ids[i];
        const v = p.totals[id] * (pct / 100) * (1 + p.wob[id] * (1 - pct / 100));
        row.querySelector('i').style.width = (v / p.max * 96) + '%';
        row.querySelector('.tl-bar-num').textContent = Math.round(v).toLocaleString('ja-JP');
        row.classList.toggle('called', pct >= 100 && id === p.leader);
      });
    }
    function run() {
      cycle += 1;
      const p = plan();
      let pct = 0;
      paint(p, 0, true);
      tick = setInterval(() => {
        pct = Math.min(100, pct + 1.2);
        paint(p, pct, false);
        if (pct >= 100) { clearInterval(tick); tick = null; hold = setTimeout(run, 4200); }
      }, 90);
    }
    if (still) { paint(plan(), 100, true); return () => {}; }
    hold = setTimeout(run, delayMs);
    return () => { clearInterval(tick); clearTimeout(hold); };
  }

  // 当選の花(事務所のボードにつける赤いバラ)
  function rosetteSvg() {
    const petals = (n, cy, rx, ry, cls, off) => Array.from({ length: n }, (_, i) =>
      `<ellipse class="${cls}" cx="60" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${(360 / n * i + off).toFixed(1)} 60 60)"/>`).join('');
    return `
      <svg class="tl-rosette" viewBox="0 0 120 156" aria-hidden="true">
        <polygon class="tl-ros-d" points="44,84 28,152 48,138 60,154 62,90"/>
        <polygon class="tl-ros-d" points="76,84 92,152 72,138 60,154 58,90"/>
        ${petals(14, 24, 13, 24, 'tl-ros-a', 0)}${petals(11, 34, 11, 19, 'tl-ros-b', 16)}
        <circle class="tl-ros-a" cx="60" cy="60" r="26"/><circle class="tl-ros-c" cx="60" cy="60" r="20"/>
        <text class="tl-ros-t" x="60" y="71" text-anchor="middle">当</text>
      </svg>`;
  }

  // ---------------- 画面 ----------------
  function render(app, opts) {
    if (cleanup) cleanup();
    const settings = loadSettings();
    const reduced = reducedMotion();
    // 2回目以降(ゲームからタイトルに戻ったとき)は演出を流さず最後の形で出す
    const s = reduced || started ? 0 : SPEED[settings.speed] ?? 1;
    const first = !started;
    started = true;
    const esc = (v) => Game.UI.esc(v);

    const buttons = [
      { id: 'new', label: 'はじめから', nav: true },
      opts.hasSave ? { id: 'continue', label: 'つづきから', nav: true } : null,
      opts.onVersus ? { id: 'versus', label: '2人で対戦', nav: true } : null,
      opts.onHall ? { id: 'hall', label: '殿堂', nav: true } : null,
      opts.onLegacy ? { id: 'legacy', label: '前作で遊ぶ', nav: true } : null,
      { id: 'settings', label: '設定' },
    ].filter(Boolean);
    const tickerText = TICKER.map((t) => `<span>${esc(t)}</span>`).join('<i>◆</i>');
    const d = (sec) => `style="--d:${sec.toFixed(2)}s"`;

    app.innerHTML = `
      <div class="tl-stage ${reduced ? 'tl-reduced' : ''}" style="--s:${s}">
        <div class="tl-bg"><div class="tl-floor"></div><div class="tl-sweep"></div></div>
        ${boardHtml()}
        <div class="tl-main">
          <p class="tl-kicker" ${d(T.kicker)}>衆議院総選挙 開票特番</p>
          <h1 class="tl-logo"><span class="tl-logo-text" ${d(T.logo)}>当確<i>!</i><b class="tl-two">2</b></span><span class="tl-pin" ${d(T.pin)}>${rosetteSvg()}</span></h1>
          <p class="tl-sub"><span ${d(T.sub)}>新人候補から総理へ</span></p>
          <nav class="tl-menu" aria-label="メニュー">
            ${buttons.map((b, i) => `<button type="button" class="tl-btn" data-act="${b.id}" ${b.nav ? 'data-nav' : ''} ${d(T.menu + i * T.menuStep)}>${esc(b.label)}</button>`).join('')}
          </nav>
        </div>
        <p class="tl-note">${esc(opts.note || '')}</p>
        <div class="tl-ticker" role="marquee" aria-label="ニュース">
          <span class="tl-ticker-label">速報</span>
          <div class="tl-ticker-window"><div class="tl-ticker-track">${tickerText}<i>◆</i>${tickerText}<i>◆</i></div></div>
          <span class="tl-sound-hint" ${Audio.playing() || !settings.bgm ? 'hidden' : ''}>♪ クリックかキーで音が鳴ります</span>
        </div>
        <div class="tl-flash" ${d(T.pin)}></div>
        <div class="tl-settings" hidden></div>
      </div>`;

    const stage = app.querySelector('.tl-stage');
    const timers = [];
    const sfx = (fn, arg) => { if (loadSettings().sfx) fn(arg); };

    // 花をつける「ドン」:演出のときだけ(最初のクリックより前は音が出せないので鳴らない)
    if (first && s > 0) timers.push(setTimeout(() => sfx(Audio.stamp), T.pin * s * 1000 + 60));
    // 情勢ボード。最初の開票のあいだだけ、地区に色がつくたびに小さな音
    const stopBoard = startBoard(stage, reduced, first ? T.lights * s * 1000 : 300, (i, cycle) => { if (cycle === 1) sfx(Audio.blip, i); });

    // 最初のクリックかキー入力で BGM(画面を移るボタンを押したときは鳴らさない)
    const hint = stage.querySelector('.tl-sound-hint');
    const onGesture = (e) => {
      const panel = stage.querySelector('.tl-settings');
      if (e.key === 'Escape' && !panel.hidden) { panel.querySelector('[data-close]').click(); return; }   // Esc で設定を閉じる
      const target = e.type === 'keydown' ? document.activeElement : e.target;
      Audio.ensure();
      if (target && target.closest && target.closest('[data-nav]')) return;
      if (loadSettings().bgm) Audio.startBgm();
      if (hint) hint.hidden = true;
    };
    stage.addEventListener('pointerdown', onGesture);
    window.addEventListener('keydown', onGesture);

    // 画面を離れるとき:BGM とボードを止めて後始末
    cleanup = () => {
      timers.forEach(clearTimeout);
      stopBoard();
      stage.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
      Audio.stopBgm();
      cleanup = null;
    };
    const leave = (fn) => () => {
      sfx(Audio.decide);
      if (cleanup) cleanup();
      fn();
    };

    stage.querySelector('[data-act="new"]').onclick = leave(opts.onNew);
    const cont = stage.querySelector('[data-act="continue"]');
    if (cont) cont.onclick = leave(opts.onContinue);
    const vsb = stage.querySelector('[data-act="versus"]');
    if (vsb) vsb.onclick = leave(opts.onVersus);
    const hl = stage.querySelector('[data-act="hall"]');
    if (hl) hl.onclick = leave(opts.onHall);
    const lg = stage.querySelector('[data-act="legacy"]');
    if (lg) lg.onclick = leave(opts.onLegacy);
    stage.querySelector('[data-act="settings"]').onclick = () => { sfx(Audio.decide); openSettings(stage); };
  }

  // 設定:演出の速さ、BGM、効果音
  function openSettings(stage) {
    const panel = stage.querySelector('.tl-settings');
    const draw = () => {
      const st = loadSettings();
      const opt = (key, val, label) => `<button type="button" class="tl-opt ${st[key] === val ? 'on' : ''}" data-key="${key}" data-val="${String(val)}" aria-pressed="${st[key] === val}">${label}</button>`;
      panel.innerHTML = `
        <div class="tl-settings-box" role="dialog" aria-label="設定">
          <h2 class="tl-settings-title">設定</h2>
          <div class="tl-set-row"><span>タイトルの演出</span><div>${opt('speed', 'normal', '通常')}${opt('speed', 'fast', '速い')}${opt('speed', 'skip', 'スキップ')}</div></div>
          ${reducedMotion() ? '<p class="tl-set-note">端末の「視差効果を減らす」設定がオンのため、演出は流さずに表示します。</p>' : '<p class="tl-set-note">次にタイトルを開いたときから変わります。</p>'}
          <div class="tl-set-row"><span>BGM</span><div>${opt('bgm', true, 'オン')}${opt('bgm', false, 'オフ')}</div></div>
          <div class="tl-set-row"><span>効果音</span><div>${opt('sfx', true, 'オン')}${opt('sfx', false, 'オフ')}</div></div>
          <div class="tl-set-actions"><button type="button" class="btn btn-primary" data-close>閉じる</button></div>
        </div>`;
      panel.querySelectorAll('[data-key]').forEach((b) => {
        b.onclick = () => {
          const cur = loadSettings();
          const v = b.dataset.val;
          cur[b.dataset.key] = v === 'true' ? true : v === 'false' ? false : v;
          saveSettings(cur);
          if (b.dataset.key === 'bgm') { if (cur.bgm) Audio.startBgm(); else Audio.stopBgm(); }
          if (cur.sfx) Audio.decide();
          draw();
        };
      });
      panel.querySelector('[data-close]').onclick = () => {
        if (loadSettings().sfx) Audio.decide();
        panel.hidden = true;
        stage.querySelector('[data-act="settings"]').focus();
      };
    };
    draw();
    panel.hidden = false;
    panel.querySelector('.tl-opt.on').focus();
  }

  // ゲーム中の効果音(開票特番の当確のハンコなど)。設定で効果音を切っていれば鳴らさない
  function sound(name) {
    if (!loadSettings().sfx || !Audio.ensure()) return;
    if (name === 'stamp') Audio.stamp(); else Audio.decide();
  }

  return { render, sound, settings: loadSettings, reducedMotion: () => reducedMotion() };   // 設定は、エンディングの新聞の演出でも使う(R14)
})();
