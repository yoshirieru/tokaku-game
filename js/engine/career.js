// 議員の任期(と、落選したあとの浪人)。選挙で背負った約束を果たし、地盤を耕し、次の選挙に備える。DOM には触らない。
// 1ターン = 国会の1会期(半年)。会期の終わりに、見えている確率で衆議院が解散する。8ターンで任期満了。
// 任期の結果は state.career.next にまとめ、次の選挙戦(campaign.js の newCampaign)が読む:
//   endorse 守った約束 → 推薦のカード / broken 破った約束 → 使えないカードと始まりの支持の低下
//   light 少しは進めた約束 → 小さな低下だけ / carried 果たす時間がなかった約束 → 持ち越し
window.Game = window.Game || {};

Game.Career = (function () {
  const R = Game.Rng;
  const T = function () { return Game.Balance.term; };
  const CB = function () { return Game.Balance.comeback; };
  const regions = function () { return Game.Data.DISTRICT.regions; };
  const P = function (id) { return Game.Data.PROMISES[id]; };

  // ---------- 選挙のあと:任期を始める ----------
  function afterElection(state) {
    const e = state.election, camp = state.camp;
    const cr = state.career || { wins: 0, elections: 0, kept: 0, broken: 0, base: {}, history: [] };
    const won = e.won;
    cr.elections += 1;
    if (won) cr.wins += 1;
    cr.status = won ? 'member' : 'ronin';
    cr.role = won ? 'incumbent' : (cr.wins > 0 ? 'former' : 'newcomer');   // 次の選挙での自分の立場
    // 次の選挙での相手の立場:勝った人は現職。議席を失った現職は、巻き返しをねらう元職(challenger)
    cr.rivalRoles = {};
    cr.rivalSolid = {};   // 現職のまま勝った相手は、次の選挙までに地盤を固める
    camp.cands.forEach(function (c) {
      if (!c.player && c.id === e.winner && c.role === 'incumbent') cr.rivalSolid[c.party] = true;
      if (!c.player) cr.rivalRoles[c.party] = c.id === e.winner ? 'incumbent' : (c.role === 'incumbent' ? 'challenger' : c.role);
    });
    // 地盤は一部だけ残る。前回の得票率は画面に出す
    cr.lastShare = {};
    regions().forEach(function (r) {
      cr.base[r.id] = Math.round((cr.base[r.id] || 0) * CB().baseCarry);
      const v = e.regions[r.id].votes;
      const sum = Object.keys(v).reduce(function (a, k) { return a + v[k]; }, 0);
      cr.lastShare[r.id] = v.me / sum * 100;
    });
    // 約束:当選すれば任期に持ち込む(持ち越していた約束は進み具合もそのまま)。落選すれば白紙
    const old = {};
    ((cr.next && cr.next.carriedFull) || []).forEach(function (p) { old[p.id] = p; });
    cr.promises = won ? camp.promises.map(function (id) { return old[id] ? { id: id, progress: old[id].progress, turns: old[id].turns } : { id: id, progress: 0, turns: 0 }; }) : [];
    cr.dropped = won ? 0 : camp.promises.length;
    cr.next = { endorse: [], broken: [], light: [], carried: [], carriedFull: [] };
    cr.history.push({ won: won, votes: e.totals.me, lossRatio: e.lossRatio });
    cr.turn = 0; cr.wind = 0; cr.contrib = 0; cr.money = T().startMoney; cr.sel = cr.sel || 'downtown';
    cr.deck = R.shuffle(state, T().deck[cr.status]); cr.discard = []; cr.hand = []; cr.uid = 0;
    cr.pending = [{ type: 'start' }]; cr.news = ''; cr.over = false;
    state.career = cr;
    state.screen = 'term';
    startTurn(state);
    return cr;
  }

  // ---------- 計算 ----------
  function dissolveChance(cr) {
    const base = T().dissolve[Math.min(cr.turn, T().turns) - 1];
    if (cr.turn >= T().turns) return 1;
    if (base <= 0) return 0;
    return Math.max(T().dissolveMin, Math.min(T().dissolveMax, base + cr.wind));
  }
  // 次の選挙で増える「党幹部の応援」の枚数
  function extraStars(cr) { return Math.min(CB().starExtraMax, Math.floor(cr.contrib / CB().starPer)); }
  // そのカードが選ぶもの:'promise' 約束 / 'region' 地区 / 'none' 選ばない
  function targetKind(cr, id) {
    const b = T().cards[id];
    if (b.promise) return cr.promises.length ? 'promise' : 'none';
    return b.base ? 'region' : 'none';
  }
  // 地区を選ぶカードの、実際に伸びる地盤(上限で止まる)
  function baseGain(cr, id, regionId) {
    const b = T().cards[id], n = b.base || b.baseAll || 0;
    return Math.max(0, Math.min(n, CB().baseMax - (cr.base[regionId] || 0)));
  }
  function canPlay(cr, id) {
    const b = T().cards[id];
    if (cr.pending.length) return { ok: false, reason: '先に知らせを確かめよう。' };
    if (cr.energy < b.cost) return { ok: false, reason: '体力が足りない。この会期を終えると回復する。' };
    if (b.money > 0 && cr.money < b.money) return { ok: false, reason: '資金が足りない。「資金パーティー」で集めよう。' };
    return { ok: true };
  }
  function addBase(cr, regionId, n) {
    const old = cr.base[regionId] || 0;
    cr.base[regionId] = Math.max(0, Math.min(CB().baseMax, old + n));
    return cr.base[regionId] - old;
  }

  // ---------- カード ----------
  // target は、約束を選ぶカードなら約束の id、地区を選ぶカードなら地区の id
  function play(state, uid, target) {
    const cr = state.career;
    const card = cr.hand.filter(function (c) { return c.uid === uid; })[0];
    if (!card) return { ok: false, reason: 'そのカードは手札にない。' };
    const id = card.id, b = T().cards[id], name = Game.Data.TERM_CARDS[id].name;
    const ok = canPlay(cr, id);
    if (!ok.ok) return ok;
    const kind = targetKind(cr, id);
    const fx = [];
    let msg;
    if (kind === 'promise') {
      const p = cr.promises.filter(function (x) { return x.id === target; })[0];
      if (!p) return { ok: false, reason: '進める約束を選ぼう。' };
      p.progress += b.promise;
      msg = name + '。' + P(p.id).org + 'との約束「' + P(p.id).policy + '」を進めた。';
      if (p.progress >= T().promiseGoal) {
        cr.promises = cr.promises.filter(function (x) { return x !== p; });
        cr.next.endorse.push(p.id);
        cr.kept += 1;
        const d = addBase(cr, P(p.id).region, T().keptBase);
        if (d) fx.push({ region: P(p.id).region, gain: d });
        msg = name + '。' + P(p.id).org + 'との約束「' + P(p.id).policy + '」を果たした。次の選挙で推薦がもらえる。';
      }
    } else if (kind === 'region') {
      if (!Game.Data.REGION[target]) return { ok: false, reason: '回る地区を選ぼう。' };
      const d = addBase(cr, target, b.base);
      fx.push({ region: target, gain: d });
      cr.sel = target;
      msg = Game.Data.REGION[target].name + 'で' + name + '。地盤が ' + d + ' 固まった。';
    } else if (b.promise) {
      cr.contrib += b.contrib;
      msg = name + '。果たすべき約束がないので、党の方針に沿って働いた(党への貢献 +' + b.contrib + ')。';
    } else if (b.baseAll) {
      regions().forEach(function (r) { const d = addBase(cr, r.id, b.baseAll); if (d) fx.push({ region: r.id, gain: d }); });
      msg = name + '。地元でも顔が売れた。';
    } else if (b.contrib) {
      cr.contrib += b.contrib;
      msg = name + '。党への貢献が ' + b.contrib + ' 増えた。';
    } else {
      msg = name + '。' + (-b.money) + '万円が集まった。';
    }
    cr.money -= b.money;
    cr.energy -= b.cost;
    cr.hand = cr.hand.filter(function (c) { return c.uid !== uid; });
    cr.discard.push(id);
    cr.news = msg;
    return { ok: true, fx: fx, msg: msg };
  }

  // ---------- 会期の流れ ----------
  function draw(state) {
    const cr = state.career;
    while (cr.hand.length < T().handSize) {
      if (!cr.deck.length) {
        if (!cr.discard.length) break;
        cr.deck = R.shuffle(state, cr.discard);
        cr.discard = [];
      }
      cr.hand.push({ id: cr.deck.pop(), uid: ++cr.uid });
    }
  }
  function rollEvent(state) {
    const cr = state.career, E = T().events;
    if (R.next(state) >= E.chance) return;
    const open = {};
    cr.promises.forEach(function (p) { open[p.id] = true; });
    cr.next.endorse.forEach(function (id) { open[id] = true; });
    const asks = Object.keys(Game.Data.PROMISES).filter(function (id) { return !open[id]; });
    const kinds = ['windUp', 'windDown'];
    if (cr.status === 'member' && asks.length && cr.promises.length < E.petition.maxOpen) kinds.push('petition');
    const k = R.weighted(state, kinds, function (x) { return E[x].weight; });
    if (k === 'petition') {
      cr.pending.push({ type: 'petition', id: R.pick(state, asks) });
    } else {
      cr.wind += E[k].wind;
      cr.pending.push({
        type: 'event',
        title: k === 'windUp' ? '解散風が強まる' : '解散風が弱まる',
        text: k === 'windUp' ? '内閣支持率が上がり、与党の中で「いまなら勝てる」という声が広がっている。解散の見込みが上がった。'
          : '内閣支持率が下がり、首相は解散に踏み切れそうにない。解散の見込みが下がった。',
      });
    }
  }
  function startTurn(state) {
    const cr = state.career;
    cr.turn += 1;
    cr.energy = T().energy;
    draw(state);
    if (cr.turn > 1) rollEvent(state);
    const pct = Math.round(dissolveChance(cr) * 100);
    cr.news = Game.Data.sessionName(cr.turn) + '。' + (cr.turn >= T().turns ? 'この会期で任期満了。総選挙になる。' : pct ? 'この会期のあとに解散する見込みは ' + pct + '%。' : '選挙が終わったばかりで、解散はまだない。');
  }
  function dismiss(state) { state.career.pending.shift(); }
  // 団体からの要望に答える
  function respond(state, accept) {
    const cr = state.career, ev = cr.pending[0], E = T().events.petition;
    if (!ev || ev.type !== 'petition') return null;
    const p = P(ev.id);
    const fx = [];
    let text;
    if (accept) {
      cr.promises.push({ id: ev.id, progress: 0, turns: 0 });
      fx.push({ region: p.region, gain: addBase(cr, p.region, E.base) });
      text = p.org + 'に「' + p.policy + '」を約束した。' + Game.Data.REGION[p.region].name + 'の地盤が固まった。約束は、この任期のうちに果たしたい。';
    } else {
      fx.push({ region: p.region, gain: addBase(cr, p.region, E.refuse) });
      text = p.org + 'の要望を断った。できない約束はしない。' + Game.Data.REGION[p.region].name + 'の地盤が少し冷えた。';
    }
    cr.pending.shift();
    cr.news = text;
    return { text: text, fx: fx };
  }
  // 解散のとき:果たせなかった約束に決着をつける
  function settle(state) {
    const cr = state.career, lines = [];
    cr.promises.forEach(function (p) {
      const name = P(p.id).org + 'との約束「' + P(p.id).policy + '」';
      if (p.turns < T().graceTurns) {
        cr.next.carried.push(p.id);
        cr.next.carriedFull.push({ id: p.id, progress: p.progress, turns: p.turns });
        lines.push({ kind: 'carried', text: name + 'は、解散が早く、果たす時間がなかった。事情をくんでもらい、次の任期に持ち越す。' });
      } else if (p.progress > 0) {
        cr.next.light.push(p.id);
        cr.broken += 1;
        lines.push({ kind: 'light', text: name + 'は、途中までしか進められなかった。' + Game.Data.REGION[P(p.id).region].name + 'の支持が少し下がる。' });
      } else {
        cr.next.broken.push(p.id);
        cr.broken += 1;
        lines.push({ kind: 'broken', text: name + 'に、手をつけられなかった。次の選挙で「破った約束」として返ってくる。' });
      }
    });
    cr.next.endorse.forEach(function (id) {
      lines.push({ kind: 'kept', text: P(id).org + 'との約束「' + P(id).policy + '」を果たした。次の選挙で推薦がもらえる。' });
    });
    cr.promises = [];
    return lines;
  }
  // この会期を終える:解散するか、次の会期へ
  function endTurn(state) {
    const cr = state.career;
    if (cr.pending.length) return { ok: false, reason: '先に知らせを確かめよう。' };
    cr.promises.forEach(function (p) { p.turns += 1; });
    cr.hand.forEach(function (c) { cr.discard.push(c.id); });
    cr.hand = [];
    const full = cr.turn >= T().turns;
    if (full || R.next(state) < dissolveChance(cr)) {
      cr.over = true;
      cr.pending.push({ type: 'dissolve', full: full, session: Game.Data.sessionName(cr.turn), lines: settle(state), stars: extraStars(cr) });
      return { ok: true, dissolved: true };
    }
    startTurn(state);
    return { ok: true, dissolved: false };
  }
  // 解散の知らせを閉じたら、次の選挙戦へ
  function toCampaign(state) {
    state.career.pending = [];
    state.election = null;
    Game.Campaign.newCampaign(state);
    state.screen = 'campaign';
  }

  return {
    afterElection: afterElection, play: play, canPlay: canPlay, endTurn: endTurn, dismiss: dismiss, respond: respond, toCampaign: toCampaign,
    dissolveChance: dissolveChance, extraStars: extraStars, targetKind: targetKind, baseGain: baseGain,
  };
})();
