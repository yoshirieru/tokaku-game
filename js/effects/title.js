// タイトル画面の演出(開票特番の夜)。絵は SVG と CSS だけで描き、音は Web Audio API で合成する。
// ゲームの状態には触らない。画面の切り替えは呼び出し側(screens.js の renderTitle)から渡された関数で行う。
//   Game.Effects.Title.render(app, { hasSave, onNew, onContinue, onVersus, onHall, onOrgs, note })
// 演出の設定(通常 / 速い / スキップ、BGM、効果音)はこの画面だけのもので、localStorage に別に保存する。
window.Game = window.Game || {};
Game.Effects = Game.Effects || {};

Game.Effects.Title = (function () {
  const SETTINGS_KEY = 'kokusei-title-settings';
  const SPEED = { normal: 1, fast: 0.4, skip: 0 };
  // 演出の流れ(通常の速さでの秒)。CSS の --d に掛ける
  const T = { bg: 0, windows: 0.8, windowsSpan: 1.5, logo: 2.3, stamp: 3.1, sub: 3.45, menu: 3.7, menuStep: 0.12, ticker: 3.7 };
  const TICKER = [
    '本日投開票', '全国で開票作業が進んでいます', '午後8時、投票が締め切られました',
    '投票率は前回をやや上回る見込み', '東央7区、大接戦', '備陽2区、開票作業はじまる',
    '各党の選挙事務所に支持者が集まっています', '比例代表の開票は深夜から', '浪央5区、出口調査の結果が出ています',
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
  const Audio = (function () {
    let ctx = null;
    let master = null;
    let bgmGain = null;
    let noiseBuf = null;
    let timer = null;
    let step = 0;
    let nextTime = 0;

    function ensure() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      if (!ctx) {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.9;
        master.connect(ctx.destination);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    const ready = () => !!ctx && ctx.state === 'running';

    function tone(dest, { type = 'sine', freq, freqEnd, t, dur, vol, attack = 0.005, filter }) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
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
    function noise(dest, { t, dur, vol, type = 'highpass', freq = 6000 }) {
      const s = ctx.createBufferSource();
      s.buffer = noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f);
      f.connect(g);
      g.connect(dest);
      s.start(t);
      s.stop(t + dur + 0.05);
    }

    // 決定音:短い2音
    function decide() {
      if (!ensure()) return;
      const t = ctx.currentTime + 0.01;
      tone(master, { type: 'square', freq: 988, t, dur: 0.07, vol: 0.12, filter: { freq: 3000 } });
      tone(master, { type: 'square', freq: 1480, t: t + 0.07, dur: 0.12, vol: 0.1, filter: { freq: 3500 } });
    }
    // ハンコの「ドン」
    function stamp() {
      if (!ready()) return;
      const t = ctx.currentTime + 0.01;
      tone(master, { type: 'sine', freq: 140, freqEnd: 38, t, dur: 0.45, vol: 0.9, attack: 0.003 });
      tone(master, { type: 'triangle', freq: 90, freqEnd: 50, t, dur: 0.25, vol: 0.35, attack: 0.002 });
      noise(master, { t, dur: 0.12, vol: 0.45, type: 'lowpass', freq: 900 });
    }

    // BGM:BPM 132、16分音符 × 4小節のループ(Am → Am → F → E)。低いパルス、刻み、ティンパニ風、持続音
    const BPM = 132;
    const S16 = 60 / BPM / 4;
    const BARS = [
      { bass: 55.0, pad: [220.0, 261.63, 329.63], arp: [440.0, 659.26, 523.25, 659.26] },   // Am
      { bass: 55.0, pad: [220.0, 261.63, 329.63], arp: [440.0, 659.26, 523.25, 783.99] },   // Am
      { bass: 43.65, pad: [174.61, 220.0, 261.63], arp: [349.23, 523.25, 440.0, 523.25] },  // F
      { bass: 41.2, pad: [164.81, 207.65, 246.94], arp: [329.63, 493.88, 415.3, 493.88] },  // E(導音の G# で緊張)
    ];
    function scheduleStep(i, t) {
      const bar = BARS[Math.floor(i / 16) % BARS.length];
      const s = i % 16;
      // 持続音(小節の頭で、ゆっくりふくらむ和音)
      if (s === 0) {
        for (const f of bar.pad) {
          tone(bgmGain, { type: 'sawtooth', freq: f, t, dur: S16 * 16, vol: 0.035, attack: S16 * 6, filter: { freq: 900, freqEnd: 500 } });
        }
      }
      // 低いパルス(8分)
      if (s % 2 === 0) tone(bgmGain, { type: 'sawtooth', freq: bar.bass, t, dur: S16 * 1.6, vol: 0.22, filter: { freq: 420, freqEnd: 140, q: 4 } });
      // 刻み(16分のアルペジオ。2拍目と4拍目の裏で少し強く)
      const v = s % 4 === 3 ? 0.06 : 0.035;
      tone(bgmGain, { type: 'triangle', freq: bar.arp[s % 4], t, dur: S16 * 0.9, vol: v });
      // ティンパニ風(1拍目・3拍目)
      if (s === 0 || s === 8) tone(bgmGain, { type: 'sine', freq: 110, freqEnd: 45, t, dur: 0.35, vol: 0.4 });
      if (s === 14 && Math.floor(i / 16) % BARS.length === 3) tone(bgmGain, { type: 'sine', freq: 120, freqEnd: 50, t, dur: 0.2, vol: 0.3 });
      // ハイハット(裏拍)
      if (s % 4 === 2) noise(bgmGain, { t, dur: 0.05, vol: 0.08 });
    }
    function startBgm() {
      if (!ensure() || timer) return;
      bgmGain = ctx.createGain();
      bgmGain.gain.setValueAtTime(0.0001, ctx.currentTime);
      bgmGain.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 1.2);
      bgmGain.connect(master);
      step = 0;
      nextTime = ctx.currentTime + 0.08;
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
      const g = bgmGain;
      bgmGain = null;
      if (g && ctx) {
        const t = ctx.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
        setTimeout(() => g.disconnect(), 800);
      }
    }
    return { ensure, ready, decide, stamp, startBgm, stopBgm, playing: () => !!timer };
  })();

  // ---------------- 絵(SVG) ----------------
  // 同じ並びになるよう、種つきの乱数で窓やビルを決める
  function rng(seed) {
    let t = seed >>> 0;
    return () => {
      t = (t + 0x6d2b79f5) | 0;
      let r = Math.imul(t ^ (t >>> 15), t | 1);
      r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function sceneSvg() {
    const R = rng(20261104);
    const W = 1600;
    const GROUND = 822;
    const parts = [];

    // 星
    const stars = [];
    for (let i = 0; i < 70; i++) {
      const x = (R() * W).toFixed(0);
      const y = (R() * 430).toFixed(0);
      const r = (0.6 + R() * 1.3).toFixed(1);
      stars.push(`<circle class="tl-star" cx="${x}" cy="${y}" r="${r}" style="--tw:${(2.5 + R() * 4).toFixed(2)}s;--twd:${(R() * 4).toFixed(2)}s"/>`);
    }

    // サーチライト(建物の後ろから2本)
    const beam = (x, cls) => `
      <g transform="translate(${x} ${GROUND - 120})"><g class="tl-beam ${cls}">
        <polygon points="0,0 -46,-980 46,-980" fill="url(#tl-beam-grad)"/>
      </g></g>`;

    // 窓の明かり:d = 点灯の遅れ(通常の速さの秒)。blink = あとで点滅する
    const windows = [];
    const addWindow = (shape, d, blink) => {
      const b = blink ? ` tl-blink" style="--d:${d.toFixed(2)}s;--bd:${(d + 1.2 + R() * 5).toFixed(2)}s;--bl:${(3 + R() * 6).toFixed(2)}s"` : `" style="--d:${d.toFixed(2)}s"`;
      windows.push(shape.replace('CLASS', `class="tl-win${b}`));
    };

    // ビル群(左右)。中央から外に向かって順に点灯する
    const buildings = [];
    const city = (x0, x1, side) => {
      let x = x0;
      while (x < x1) {
        const w = 40 + Math.floor(R() * 70);
        const nearCenter = side === 'left' ? (x - x0) / (x1 - x0) : 1 - (x - x0) / (x1 - x0);
        const h = 90 + Math.floor(R() * 260) - nearCenter * 40;
        const top = GROUND - h;
        const shade = R() < 0.5 ? '#0a1130' : '#0c143a';
        buildings.push(`<rect x="${x}" y="${top}" width="${w}" height="${h}" fill="${shade}"/>`);
        if (R() < 0.25) buildings.push(`<rect x="${x + w / 2 - 1}" y="${top - 26}" width="2" height="26" fill="${shade}"/><circle class="tl-aviation" cx="${x + w / 2}" cy="${top - 27}" r="2.5"/>`);
        // 窓
        for (let wy = top + 12; wy < GROUND - 14; wy += 16) {
          for (let wx = x + 7; wx < x + w - 8; wx += 12) {
            if (R() < 0.42) {
              const dist = side === 'left' ? (x1 - wx) / (x1 - x0) : (wx - x0) / (x1 - x0);
              const d = T.windows + 0.35 + dist * (T.windowsSpan - 0.35) + R() * 0.15;
              addWindow(`<rect CLASS x="${wx}" y="${wy}" width="5" height="7"/>`, d, R() < 0.12);
            }
          }
        }
        x += w + Math.floor(R() * 8);
      }
    };
    city(-10, 470, 'left');
    city(1130, 1610, 'right');

    // 架空の議事堂風の建物(左右対称。中央に塔、左右に翼)
    const C = 800;
    const sil = '#050918';
    const diet = [
      // 左右の翼と端の棟
      `<rect x="480" y="${GROUND - 112}" width="640" height="112" fill="${sil}"/>`,
      `<rect x="460" y="${GROUND - 136}" width="88" height="136" fill="${sil}"/>`,
      `<rect x="1052" y="${GROUND - 136}" width="88" height="136" fill="${sil}"/>`,
      // 中央棟と列柱の前廊
      `<rect x="${C - 120}" y="${GROUND - 170}" width="240" height="170" fill="${sil}"/>`,
      `<polygon points="${C - 140},${GROUND - 168} ${C},${GROUND - 214} ${C + 140},${GROUND - 168}" fill="${sil}"/>`,
      // 塔(段を重ねた屋根)
      `<rect x="${C - 54}" y="${GROUND - 300}" width="108" height="100" fill="${sil}"/>`,
      `<rect x="${C - 44}" y="${GROUND - 330}" width="88" height="32" fill="${sil}"/>`,
      `<rect x="${C - 34}" y="${GROUND - 354}" width="68" height="26" fill="${sil}"/>`,
      `<polygon points="${C - 30},${GROUND - 352} ${C},${GROUND - 400} ${C + 30},${GROUND - 352}" fill="${sil}"/>`,
      `<rect x="${C - 1.5}" y="${GROUND - 428}" width="3" height="30" fill="${sil}"/>`,
      `<circle class="tl-aviation" cx="${C}" cy="${GROUND - 430}" r="3"/>`,
    ];
    // 議事堂の窓(点を並べる。中央から外へ順に点灯)
    const dotRow = (xs, xe, y, gap) => {
      for (let x = xs; x <= xe; x += gap) {
        const d = T.windows + (Math.abs(x - C) / 340) * 0.35 + (GROUND - y) * 0.0006;
        addWindow(`<circle CLASS cx="${x}" cy="${y}" r="2.6"/>`, d, false);
      }
    };
    for (const y of [GROUND - 92, GROUND - 68, GROUND - 44]) {
      dotRow(498, C - 132, y, 20);
      dotRow(C + 132, 1102, y, 20);
    }
    for (const y of [GROUND - 118, GROUND - 92, GROUND - 68]) {
      dotRow(474, 534, y, 20);
      dotRow(1066, 1126, y, 20);
    }
    for (const y of [GROUND - 140, GROUND - 112, GROUND - 84, GROUND - 56]) dotRow(C - 100, C + 100, y, 20);
    for (const y of [GROUND - 280, GROUND - 255, GROUND - 230]) dotRow(C - 38, C + 38, y, 19);

    parts.push(`
      <defs>
        <linearGradient id="tl-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#02040f"/>
          <stop offset=".45" stop-color="#071434"/>
          <stop offset=".78" stop-color="#14265c"/>
          <stop offset=".92" stop-color="#2b3c7a"/>
          <stop offset="1" stop-color="#121c44"/>
        </linearGradient>
        <radialGradient id="tl-glow" cx=".5" cy="1" r=".6">
          <stop offset="0" stop-color="#5a6fc0" stop-opacity=".45"/>
          <stop offset="1" stop-color="#5a6fc0" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="tl-beam-grad" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stop-color="#e8f0ff" stop-opacity=".55"/>
          <stop offset=".6" stop-color="#cfdcff" stop-opacity=".12"/>
          <stop offset="1" stop-color="#cfdcff" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <rect width="${W}" height="900" fill="url(#tl-sky)"/>
      <ellipse cx="${C}" cy="${GROUND}" rx="900" ry="300" fill="url(#tl-glow)"/>
      <g class="tl-stars">${stars.join('')}</g>
      <g class="tl-beams">${beam(C - 150, 'tl-beam-a')}${beam(C + 150, 'tl-beam-b')}</g>
      <g class="tl-city">${buildings.join('')}</g>
      <g class="tl-diet">${diet.join('')}</g>
      <g class="tl-windows">${windows.join('')}</g>
      <rect x="0" y="${GROUND}" width="${W}" height="${900 - GROUND}" fill="#03050f"/>
      <rect x="0" y="${GROUND}" width="${W}" height="2" fill="#24346e" opacity=".6"/>`);
    return `<svg class="tl-scene" viewBox="0 0 ${W} 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${parts.join('')}</svg>`;
  }

  // 朱色のハンコ(縁がかすれた丸)
  function stampSvg() {
    return `
      <svg class="tl-stamp-svg" viewBox="0 0 120 120" aria-hidden="true">
        <defs>
          <filter id="tl-rough" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n"/>
            <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2"/>
          </filter>
        </defs>
        <g filter="url(#tl-rough)" fill="none" stroke="#e0412b">
          <circle cx="60" cy="60" r="54" stroke-width="7"/>
          <circle cx="60" cy="60" r="44" stroke-width="2"/>
          <text x="60" y="76" text-anchor="middle" fill="#e0412b" stroke="none" font-size="42" font-weight="800" class="tl-stamp-text">当選</text>
        </g>
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
      { id: 'versus', label: '対戦モード', nav: true },
      opts.onHall ? { id: 'hall', label: '殿堂', nav: true } : null,
      { id: 'settings', label: '設定' },
    ].filter(Boolean);
    const tickerText = TICKER.map((t) => `<span>${esc(t)}</span>`).join('<i>◆</i>');

    app.innerHTML = `
      <div class="tl-stage ${reduced ? 'tl-reduced' : ''}" style="--s:${s}">
        <div class="tl-frame">
          ${sceneSvg()}
          <div class="tl-top">
            <p class="tl-note">${esc(opts.note || '')}</p>
            <div class="tl-top-actions">
              <span class="tl-sound-hint" ${Audio.playing() || !settings.bgm ? 'hidden' : ''}>♪ クリックかキーで音が鳴ります</span>
              <button class="tl-mini" data-act="orgs">支援団体の紹介</button>
            </div>
          </div>
          <div class="tl-logo-wrap">
            <h1 class="tl-logo"><span class="tl-logo-text">当確!</span><span class="tl-stamp">${stampSvg()}</span></h1>
            <p class="tl-sub"><span>新人候補から総理へ</span></p>
          </div>
          <nav class="tl-menu" aria-label="メニュー">
            ${buttons.map((b, i) => `<button class="tl-btn" data-act="${b.id}" ${b.nav ? 'data-nav' : ''} style="--d:${(T.menu + i * T.menuStep).toFixed(2)}s">${esc(b.label)}</button>`).join('')}
          </nav>
          <div class="tl-ticker" role="marquee" aria-label="ニュース">
            <span class="tl-ticker-label">速報</span>
            <div class="tl-ticker-window"><div class="tl-ticker-track">${tickerText}<i>◆</i>${tickerText}<i>◆</i></div></div>
          </div>
          <div class="tl-settings" hidden></div>
        </div>
      </div>`;

    const stage = app.querySelector('.tl-stage');
    const timers = [];
    const sfx = (fn) => { if (loadSettings().sfx) fn(); };

    // ハンコの「ドン」:演出のときだけ(最初のクリックより前は音が出せないので鳴らない)
    if (first && s > 0) {
      timers.push(setTimeout(() => sfx(Audio.stamp), T.stamp * s * 1000 + 60));
    }

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

    // 画面を離れるとき:BGM を止めて後始末
    cleanup = () => {
      timers.forEach(clearTimeout);
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
    stage.querySelector('[data-act="versus"]').onclick = leave(opts.onVersus);
    const hb = stage.querySelector('[data-act="hall"]');
    if (hb) hb.onclick = leave(opts.onHall);
    stage.querySelector('[data-act="orgs"]').onclick = () => { sfx(Audio.decide); opts.onOrgs(); };
    stage.querySelector('[data-act="settings"]').onclick = () => { sfx(Audio.decide); openSettings(stage); };
  }

  // 設定:演出の速さ、BGM、効果音
  function openSettings(stage) {
    const panel = stage.querySelector('.tl-settings');
    const draw = () => {
      const st = loadSettings();
      const opt = (key, val, label) => `<button class="tl-opt ${st[key] === val ? 'on' : ''}" data-key="${key}" data-val="${String(val)}" aria-pressed="${st[key] === val}">${label}</button>`;
      panel.innerHTML = `
        <div class="tl-settings-box" role="dialog" aria-label="設定">
          <h2 class="tl-settings-title">設定</h2>
          <div class="tl-set-row"><span>タイトルの演出</span><div>${opt('speed', 'normal', '通常')}${opt('speed', 'fast', '速い')}${opt('speed', 'skip', 'スキップ')}</div></div>
          ${reducedMotion() ? '<p class="tl-set-note">端末の「視差効果を減らす」設定がオンのため、演出は流さずに表示します。</p>' : '<p class="tl-set-note">次にタイトルを開いたときから変わります。</p>'}
          <div class="tl-set-row"><span>BGM</span><div>${opt('bgm', true, 'オン')}${opt('bgm', false, 'オフ')}</div></div>
          <div class="tl-set-row"><span>効果音</span><div>${opt('sfx', true, 'オン')}${opt('sfx', false, 'オフ')}</div></div>
          <div class="tl-set-actions"><button class="tl-btn tl-btn-close" data-close>閉じる</button></div>
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

  return { render };
})();
