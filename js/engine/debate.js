// 国会論戦バトル。予算委員会の質疑(議員として追及)と党首討論(首相として答弁 / 野党党首として追及)。
// DOMには触らない。論戦の途中の状態は state.debate、手持ちのカードは state.debateDeck に置く。
//
// state.debate = {
//   rng, kind: 'committee'|'leaders', side: 'ask'|'answer'(あなたの側), role: 'term'|'pm'|'opposition',
//   topic, opponent: { name, composure, tell }, me: { composure }, meter: 説得力(0〜100、あなたの側),
//   time, timeMax, deck, hand, discard, round, next: 相手が次に出すカード, tell: 相手の様子,
//   log: [やりとり], gaffes: { me, opp }, apologies, finished, result, back: 戻る画面,
// }
// state.debateDeck = { ask: [{ id, strong }], answer: [{ id, strong }] }
window.Game = window.Game || {};

Game.Debate = (function () {
  const DB = () => Game.Balance.debate;
  const CARDS = () => Game.Data.DEBATE_CARDS;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function rand(d) {
    let t = (d.rng = (d.rng + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function pickLine(d, card) {
    const L = CARDS()[card].lines;
    return L[Math.floor(rand(d) * L.length)];
  }
  function weightedPick(d, weights) {
    const keys = Object.keys(weights);
    const total = keys.reduce((s, k) => s + weights[k], 0);
    let r = rand(d) * total;
    for (const k of keys) {
      r -= weights[k];
      if (r <= 0) return k;
    }
    return keys[keys.length - 1];
  }

  // ---------------- 手持ちのカード ----------------
  function ensureDeck(state) {
    if (!state.debateDeck) {
      const S = DB().startDeck;
      state.debateDeck = { ask: S.ask.map((id) => ({ id, strong: false })), answer: S.answer.map((id) => ({ id, strong: false })) };
    }
    return state.debateDeck;
  }
  // カードを1枚加える。いっぱいなら同じカードを★に強くする(なければ別のカードを★に)
  function addCard(state, id, strong) {
    const deck = ensureDeck(state);
    const side = CARDS()[id].side;
    const list = deck[side];
    if (list.length < DB().deckMax) {
      list.push({ id, strong: !!strong });
      return `論戦の手札に「${CARDS()[id].name}${strong ? '★' : ''}」が加わった。`;
    }
    const weak = list.find((c) => c.id === id && !c.strong) || list.find((c) => !c.strong);
    if (!weak) return '論戦の手札はもう十分に強い。';
    weak.strong = true;
    return `論戦の手札の「${CARDS()[weak.id].name}」が★に強くなった。`;
  }
  // 調査・資料集め:★のカードが手に入る
  function research(state, side, rng) {
    const R = DB().research;
    const pool = side === 'answer' ? R.strongAnswer : R.strongAsk;
    return addCard(state, pool[Math.floor(rng() * pool.length)], true);
  }
  // 政策の勉強会(任期中の出来事):カードが1枚増える(ときどき★)
  function studyGroup(state, rng) {
    const ids = Object.keys(CARDS()).filter((id) => CARDS()[id].side === 'ask');
    return addCard(state, ids[Math.floor(rng() * ids.length)], rng() < DB().studyGroup.strongChance);
  }
  function deckSummary(state, side) {
    const list = ensureDeck(state)[side];
    const n = {};
    for (const c of list) {
      const k = c.id + (c.strong ? '★' : '');
      n[k] = (n[k] || 0) + 1;
    }
    return Object.keys(n).map((k) => ({ id: k.replace('★', ''), strong: k.endsWith('★'), count: n[k] }));
  }

  // ---------------- 始める ----------------
  // opts: { kind, side, role, topic, opponentName, opponentType, back, seed }
  function start(state, opts) {
    const deck = ensureDeck(state)[opts.side];
    const O = DB().opponents[opts.opponentType];
    const post = state.career ? state.career.postLevel || 0 : 0;
    const K = Game.Data.DEBATE_KINDS[opts.kind];
    const d = {
      rng: opts.seed >>> 0 || 1,
      kind: opts.kind, side: opts.side, role: opts.role, topic: opts.topic || null,
      opponent: { name: opts.opponentName, composure: O.composure, tell: O.tell },
      me: { composure: clamp(DB().composure.start + post * DB().composure.perPost, 0, 100) },
      meter: DB().meterStart,
      time: K.minutes, timeMax: K.minutes,
      deck: deck.map((c) => Object.assign({}, c)), hand: [], discard: [],
      round: 0, next: null, tell: null, log: [], gaffes: { me: 0, opp: 0 }, apologies: 0,
      finished: false, result: null, back: opts.back,
    };
    shuffle(d, d.deck);
    draw(d);
    aiChoose(d);
    state.debate = d;
    state.screen = 'debate';
    return d;
  }

  function shuffle(d, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand(d) * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
  function draw(d) {
    while (d.hand.length < DB().handSize) {
      if (!d.deck.length) {
        if (!d.discard.length) break;
        d.deck = d.discard;
        d.discard = [];
        shuffle(d, d.deck);
      }
      d.hand.push(d.deck.pop());
    }
  }

  // 相手(AI)が次に出すカードを決め、様子(予告)を見せる。予告は opponent.tell の確率で当たる
  function aiChoose(d) {
    const W = DB().aiWeights;
    const aiSide = d.side === 'ask' ? 'answer' : 'ask';
    const w = Object.assign({}, W[aiSide]);
    const aiAhead = d.meter < DB().meterStart - 8;   // 説得力はあなたの側なので、低いほど相手が優勢
    if (aiSide === 'answer') {
      if (aiAhead) { w.dodge *= W.aheadBurn; w.consider *= W.aheadBurn; }
      if (d.opponent.composure < 35) w.apologize *= W.lowComposureApologize;
    } else if (d.me.composure < 40) {
      w.nitpick *= 2;   // こちらが動揺していると、揚げ足を取りに来る
    }
    d.next = weightedPick(d, w);
    let shown = d.next;
    if (rand(d) >= d.opponent.tell) {
      const others = Object.keys(W[aiSide]).filter((id) => id !== d.next);
      shown = others[Math.floor(rand(d) * others.length)];
    }
    d.tell = CARDS()[shown].tell;
  }

  // ---------------- 1回のやりとり ----------------
  // 手札の index 番目を出す。戻り値: やりとりの記録
  function play(state, index) {
    const d = state.debate;
    if (!d || d.finished) return null;
    const mine = d.hand[index];
    if (!mine) return null;
    const B = DB();
    d.hand.splice(index, 1);
    d.discard.push(mine);
    d.round++;
    const opp = d.next;
    const atk = d.side === 'ask' ? mine.id : opp;
    const def = d.side === 'ask' ? opp : mine.id;
    const ask = d.side === 'ask';
    const delta = clash(d, atk, def, ask && mine.strong, !ask && mine.strong, ask ? d.me : d.opponent, ask ? d.opponent : d.me);
    const good = ask ? delta > 0 : delta < 0;
    if (def === 'apologize' && !ask) d.apologies++;
    const meBefore = d.meter;
    d.meter = clamp(d.meter + (ask ? delta : -delta), 0, 100);

    const rec = {
      round: d.round, mine: mine.id, strong: mine.strong, opp, delta: Math.round((d.meter - meBefore) * 10) / 10,
      atkLine: pickLine(d, atk), defLine: pickLine(d, def), gaffe: null,
      verdict: Math.abs(delta) < 2 ? 'even' : good ? 'good' : 'bad',
    };
    // 失言:冷静さが低いほど起きやすい
    const G = B.gaffe;
    if (gaffeRoll(d, d.me.composure)) {
      d.gaffes.me++;
      d.meter = clamp(d.meter - G.swing, 0, 100);
      rec.gaffe = 'me';
      // 失言はSNSで炎上する(1回の論戦で炎上は1件まで)
      if (Game.Sns && d.gaffes.me === 1) Game.Sns.startFlame(Game.Sns.ensure(state), 'gaffe', () => rand(d));
    } else if (gaffeRoll(d, d.opponent.composure)) {
      d.gaffes.opp++;
      d.meter = clamp(d.meter + G.swing, 0, 100);
      rec.gaffe = 'opp';
    }
    d.log.push(rec);

    if (d.time <= 0 || d.meter <= 0 || d.meter >= 100) {
      d.time = Math.max(0, d.time);
      finish(state);
    } else {
      draw(d);
      aiChoose(d);
    }
    return rec;
  }

  // 1回のやりとりの核(1人用・2人用で共通):説得力の動き(+ は追及側)を返し、冷静さと持ち時間を動かす
  // ★のカードは、出した側に有利な動きが大きくなる
  function clash(d, atk, def, strongAtk, strongDef, atkSide, defSide) {
    const B = DB();
    const C = B.composure;
    let delta = B.matrix[atk][def];
    if ((strongAtk && delta > 0) || (strongDef && delta < 0)) delta *= B.strongMult;
    // 冷静さ:押された側が削れる。揚げ足取りは大きく削る。謝罪すると戻る
    defSide.composure -= Math.max(0, delta) * C.hitPerPoint;
    atkSide.composure -= Math.max(0, -delta) * C.hitPerPoint;
    if (atk === 'nitpick' && def !== 'dodge' && def !== 'consider') defSide.composure -= C.nitpick;
    if (def === 'apologize') defSide.composure += C.apologize;
    atkSide.composure = clamp(atkSide.composure - C.perRound, 0, 100);
    defSide.composure = clamp(defSide.composure - C.perRound, 0, 100);
    d.time -= CARDS()[atk].time + CARDS()[def].time;
    return delta;
  }
  // 冷静さが低いほど失言しやすい
  function gaffeRoll(d, composure) {
    const G = DB().gaffe;
    return composure < G.line && rand(d) < (G.line - composure) * G.perPoint;
  }

  // ---------------- 2人の論戦(対戦モード) ----------------
  // 2人がそれぞれ手札から1枚を選び(相手には見せない)、そろったら同時に公開する。説得力は追及側から見た値。
  // opts: { kind, topic, ask: { player, name, deck, composure }, answer: { ... }, seed }
  // d.sides[ask|answer] = { player, name, composure, deck, hand, discard, choice }
  function startPvp(opts) {
    const K = Game.Data.DEBATE_KINDS[opts.kind];
    const d = {
      pvp: true, rng: opts.seed >>> 0 || 1, kind: opts.kind, topic: opts.topic || null,
      meter: DB().meterStart, time: K.minutes, timeMax: K.minutes, round: 0, log: [],
      gaffes: { ask: 0, answer: 0 }, apologies: 0, finished: false, result: null, sides: {},
    };
    for (const k of ['ask', 'answer']) {
      const o = opts[k];
      const side = { player: o.player, name: o.name, composure: o.composure || DB().composure.start, deck: o.deck.map((c) => Object.assign({}, c)), hand: [], discard: [], choice: null };
      shuffle(d, side.deck);
      drawSide(side);
      d.sides[k] = side;
    }
    return d;
  }
  function drawSide(side) {
    while (side.hand.length < DB().handSize) {
      if (!side.deck.length) {
        if (!side.discard.length) break;
        side.deck = side.discard;
        side.discard = [];
      }
      side.hand.push(side.deck.pop());
    }
  }
  // k: 'ask' | 'answer'。両方そろったら公開して1回のやりとりを処理し、その記録を返す(そろっていなければ null)
  function choosePvp(d, k, index) {
    if (d.finished) return null;
    const side = d.sides[k];
    if (!side.hand[index]) return null;
    side.choice = index;
    const A = d.sides.ask;
    const N = d.sides.answer;
    if (A.choice === null || N.choice === null) return null;
    const a = A.hand.splice(A.choice, 1)[0];
    const n = N.hand.splice(N.choice, 1)[0];
    A.discard.push(a);
    N.discard.push(n);
    A.choice = null;
    N.choice = null;
    d.round++;
    const delta = clash(d, a.id, n.id, a.strong, n.strong, A, N);
    if (n.id === 'apologize') d.apologies++;
    const before = d.meter;
    d.meter = clamp(d.meter + delta, 0, 100);
    const rec = { round: d.round, ask: a.id, answer: n.id, askStrong: a.strong, answerStrong: n.strong, atkLine: pickLine(d, a.id), defLine: pickLine(d, n.id), gaffe: null };
    const G = DB().gaffe;
    if (gaffeRoll(d, A.composure)) { d.gaffes.ask++; d.meter = clamp(d.meter - G.swing, 0, 100); rec.gaffe = 'ask'; }
    else if (gaffeRoll(d, N.composure)) { d.gaffes.answer++; d.meter = clamp(d.meter + G.swing, 0, 100); rec.gaffe = 'answer'; }
    rec.delta = Math.round((d.meter - before) * 10) / 10;
    d.log.push(rec);
    if (d.time <= 0 || d.meter <= 0 || d.meter >= 100) {
      d.time = Math.max(0, d.time);
      d.finished = true;
      const B = DB();
      d.result = { outcome: d.meter >= B.winLine ? 'ask' : d.meter <= B.loseLine ? 'answer' : 'draw' };
    } else {
      drawSide(A);
      drawSide(N);
    }
    return rec;
  }

  // ---------------- 決着と反映 ----------------
  function meLabel(state, d) {
    const n = state.player.name;
    if (d.role === 'pm') return `${n}首相`;
    if (d.role === 'opposition') return `${n}代表`;
    return `${n}議員`;
  }
  function headline(state, d, outcome) {
    const H = Game.Data.DEBATE_HEADLINES;
    const fill = (t) => t.replace(/\{me\}/g, meLabel(state, d)).replace(/\{opp\}/g, d.opponent.name).replace(/\{n\}/g, d.apologies);
    if (d.gaffes.me) return fill(H.gaffeMe);
    if (d.gaffes.opp && outcome === 'win') return fill(H.gaffeOpp);
    const list = H[d.side][outcome];
    return fill(list[Math.floor(rand(d) * list.length)]);
  }

  function finish(state) {
    const d = state.debate;
    const B = DB();
    const E = B.effects;
    d.finished = true;
    const outcome = d.meter >= B.winLine ? 'win' : d.meter <= B.loseLine ? 'lose' : 'draw';
    const w = state.world;
    const c = state.career;
    const lines = [];
    const addApproval = (v) => {
      if (!v || !w) return;
      w.approval = clamp((w.approval || 45) + v, 5, 90);
      lines.push(`内閣支持率 ${v > 0 ? '+' : ''}${v}`);
    };
    if (d.role === 'term') {
      const X = E.term[outcome];
      c.partyEval += X.partyEval + d.gaffes.me * E.term.gaffeEval;
      c.nationalRecog = Math.min(100, (c.nationalRecog || 0) + X.nationalRecog);
      c.achievements += X.achievements;
      for (const rid in c.home.recog) c.home.recog[rid] = Math.min(100, (c.home.recog[rid] || 0) + X.recogAll);
      lines.push(`党内評価 ${X.partyEval + d.gaffes.me * E.term.gaffeEval >= 0 ? '+' : ''}${X.partyEval + d.gaffes.me * E.term.gaffeEval}`, `全国の知名度 +${X.nationalRecog}`);
      if (X.achievements) lines.push(`実績 +${X.achievements}`);
      // 野党の議員が政府を追い詰めると内閣支持率が下がる
      if (!Game.Career.isRuling(state)) addApproval(X.approval + d.gaffes.opp * E.oppGaffeApproval);
      // 約束した政策なら約束が前に進む
      if (d.topic && X.promise && state.support) {
        const done = advancePromise(state, d.topic, X.promise);
        if (done.length) lines.push(`${done.join('・')}との約束を果たした`);
      }
    } else if (d.role === 'pm') {
      const X = E.pm[outcome];
      addApproval(Math.round((X.approval + d.apologies * E.apologyApproval) * 10) / 10);
      state.leader.supportBonus = (state.leader.supportBonus || 0) + X.support;
      if (X.support) lines.push(`党の支持率 ${X.support > 0 ? '+' : ''}${X.support}`);
    } else {
      const X = E.opposition[outcome];
      addApproval(X.approval + d.gaffes.opp * E.oppGaffeApproval);
      state.leader.supportBonus = (state.leader.supportBonus || 0) + X.support;
      c.nationalRecog = Math.min(100, (c.nationalRecog || 0) + X.nationalRecog);
      lines.push(`党の支持率 ${X.support > 0 ? '+' : ''}${X.support}`, `全国の知名度 +${X.nationalRecog}`);
    }
    if (d.gaffes.me) lines.push(`失言 ${d.gaffes.me}回(SNSで炎上。次のターンに対応を決める)`);
    if (d.gaffes.opp) lines.push(`相手の失言 ${d.gaffes.opp}回`);
    const head = headline(state, d, outcome);
    d.result = { outcome, headline: head, lines };
    const log = d.role === 'term' ? (t, k) => Game.Career.addLogPublic(state, t, k) : (t, k) => Game.Leader.addLog(state, t, k);
    log(`📰 ${Game.Data.DEBATE_KINDS[d.kind].name}:「${head}」`, 'news');
    return d.result;
  }

  function advancePromise(state, policy, amount) {
    const sup = state.support;
    const done = [];
    for (const p of sup.promises || []) {
      if (p.status !== 'open' || p.policy !== policy) continue;
      p.progress = (p.progress || 0) + amount;
      if (p.progress >= Game.Balance.term.promiseGoal) {
        p.status = 'kept';
        sup.relations[p.org] = clamp(sup.relations[p.org] + Game.Balance.term.promiseKept, 0, 100);
        state.career.promiseStats.kept++;
        done.push(Game.Data.ORGANIZATIONS[p.org].name);
      }
    }
    return done;
  }

  // 結果を見たあと、元の画面へ戻る
  function close(state) {
    const d = state.debate;
    if (!d) return;
    state.screen = d.back;
    state.debate = null;
  }

  // カードの相性(画面のヒント用):このカードが強い相手・弱い相手
  function matchups(id) {
    const M = DB().matrix;
    const side = CARDS()[id].side;
    const strong = [];
    const weak = [];
    if (side === 'ask') {
      for (const def in M[id]) {
        if (M[id][def] >= 3) strong.push(def);
        else if (M[id][def] < 0) weak.push(def);
      }
    } else {
      for (const atk in M) {
        if (M[atk][id] < 0) strong.push(atk);
        else if (M[atk][id] >= 3) weak.push(atk);
      }
    }
    return { strong, weak };
  }

  return { ensureDeck, addCard, research, studyGroup, deckSummary, start, play, finish, close, matchups, startPvp, choosePvp, _rand: rand };
})();
