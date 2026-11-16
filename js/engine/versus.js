// 対戦モード(R8)。1台の画面で2人が交互に操作し、同じ選挙区の議席を争う。3人目の候補(残りの党)はAI。DOM には触らない。
//
// 選挙戦のエンジン(campaign.js)は「いま操作している候補 = 'me'」として書かれている。対戦では手番のたびに視点を入れ替える:
//   手番の人の候補が 'me'、もう1人が 'vs'。入れ替えるときに、支持(shares)の 'me' と 'vs'、候補の id と player、
//   手番の人だけが持つもの(PRIVATE:手札・山札・捨て札・体力・資金・約束・固い票・知らせ・選んでいる地区)を camp.vs.stash と取り替える。
//   こうすると、カードの効果・討論会・情勢の印は1人用と同じ仕組みのまま、2人それぞれの視点で動く。
// 1日の流れ:その日の先手(日ごとに交代)→ 交代の画面 → 後手 → AIの動きが効く → 次の日。最終日のあとは 1P の視点に戻して投票。
// 数値は balance.js の versus。
window.Game = window.Game || {};

Game.Versus = (function () {
  const R = Game.Rng, C = Game.Campaign;
  const bal = function () { return Game.Balance; };
  const regions = function () { return Game.Data.DISTRICT.regions; };
  const PRIVATE = ['hand', 'deck', 'discard', 'energy', 'money', 'promises', 'shields', 'pending', 'sel', 'played'];
  const short = function (n) { return n.split(/[ 　]/)[0]; };

  // 対戦を始める。o = { seat, players: [{ name, party }, { name, party }], offset, handicap }
  //   2人は別の党。offset 1 なら1日目の先手が 2P。handicap なら、2人の始まりの支持(選挙区全体)をそろえる
  function newMatch(state, o) {
    const B = bal(), VS = B.versus;
    const p = o.players;
    state.mode = 'versus';
    state.player = { name: p[0].name, party: p[0].party, seat: o.seat };
    Game.Data.setHome(o.seat);
    const D = Game.Data.useArena('home');
    const S = B.seats[D.id];
    // 3人目は残りの党。立場は、2人それぞれから見た立場のうち強いほう(現職 > 元職 > 新人)
    const third = Object.keys(Game.Data.PARTIES).filter(function (k) { return k !== p[0].party && k !== p[1].party; })[0];
    const roleA = D.roles[p[0].party][third], roleB = D.roles[p[1].party][third];
    const aiRole = B.roles[roleA].mult >= B.roles[roleB].mult ? roleA : roleB;
    const cands = [
      { id: 'me', party: p[0].party, name: p[0].name, short: short(p[0].name), role: 'newcomer', player: true, human: true, tag: '1P' },
      { id: 'vs', party: p[1].party, name: p[1].name, short: short(p[1].name), role: 'newcomer', human: true, tag: '2P' },
      { id: third, party: third, name: D.people[third].name, short: D.people[third].short, role: aiRole },
    ];
    // 始まりの支持:2人とも新人(1人用の新人と同じ倍率)。AIは選挙区の相手の強さに、対戦の倍率をかける
    const shares = {};
    regions().forEach(function (r) {
      const raw = {};
      let sum = 0;
      cands.forEach(function (c) {
        raw[c.id] = C.baseOf(r.id)[c.party] * (c.human ? B.playerRoles.newcomer : B.roles[c.role].mult * (S.rivalMult || 1) * VS.aiMult);
        sum += raw[c.id];
      });
      shares[r.id] = {};
      cands.forEach(function (c) { shares[r.id][c.id] = raw[c.id] / sum * 100; });
    });
    const own = function (party) {
      return { hand: [], deck: R.shuffle(state, B.deck.concat(B.partyPromises[party])), discard: [], energy: 0, money: B.campaign.startMoney,
        promises: [], shields: {}, pending: [], sel: 'downtown', played: 0, scandal: Game.Scandal.empty() };
    };
    const camp = {
      arena: D.id, day: 0, uid: 0, cands: cands, shares: shares,
      intents: [], blocked: {}, today: {}, news: '', comeback: null,
      vs: { names: [p[0].name, p[1].name], parties: [p[0].party, p[1].party], offset: o.offset || 0, active: 0, done: [false, false], handoff: true, stash: own(p[1].party), log: [] },
    };
    const first = own(p[0].party);
    state.scandal = first.scandal;
    delete first.scandal;
    Object.assign(camp, first);
    state.camp = camp;
    C.planSurge(state, camp);   // 奔流(R15):ハンデのあとの支持で決める(下で、もう一度決め直す)
    // ハンデ:始まりの見込みの票(有権者 × 投票率 × 支持)が少ないほうに、全地区で同じだけ足して、2人の見込みの票をそろえる
    camp.vs.handicap = null;
    if (o.handicap) {
      const expected = function () {
        const v = { me: 0, vs: 0 };
        regions().forEach(function (r) { const w = r.voters * C.turnoutOf(r.id); v.me += w * camp.shares[r.id].me; v.vs += w * camp.shares[r.id].vs; });
        const all = regions().reduce(function (a, r) { return a + r.voters * C.turnoutOf(r.id); }, 0);
        return { me: v.me / all, vs: v.vs / all };
      };
      const o0 = expected(), who = o0.me < o0.vs ? 'me' : 'vs', other = who === 'me' ? 'vs' : 'me';
      let add = 0;
      for (let k = 0; k < VS.handicapSteps; k++) {
        const ov = expected(), g = (ov[other] - ov[who]) * VS.handicapRate;   // 足すと相手も少し下がるので、差の一部ずつ足して近づける
        if (g < VS.handicapDone) break;
        regions().forEach(function (r) { C.applyGain(camp, r.id, who, g); });
        add += g;
      }
      camp.vs.handicap = { slot: who === 'me' ? 0 : 1, pts: Math.round(add * 10) / 10 };
      if (camp.surge) { const o2 = C.overall(camp); camp.surge.target = Object.keys(o2).sort(function (a, b) { return o2[a] - o2[b]; })[0]; camp.surge.party = C.cand(camp, camp.surge.target).party; }
    }
    if (camp.surge) camp.surge.slot = camp.surge.target === 'me' ? 0 : camp.surge.target === 'vs' ? 1 : -1;   // 視点を入れ替えても追えるように
    Game.Voters.create(state, camp);   // 1万人の有権者(R18。ハンデのあとの支持で)
    state.screen = 'campaign';
    startDay(state);
    return camp;
  }

  // 視点を入れ替える(手番の人を 'me' にする)
  function swap(state) {
    const camp = state.camp, vs = camp.vs;
    PRIVATE.forEach(function (k) { const t = camp[k]; camp[k] = vs.stash[k]; vs.stash[k] = t; });
    const sc = state.scandal; state.scandal = vs.stash.scandal; vs.stash.scandal = sc;   // 裏金(R9)も2人それぞれ
    Object.keys(camp.shares).forEach(function (rid) { const s = camp.shares[rid], t = s.me; s.me = s.vs; s.vs = t; });
    camp.cands.forEach(function (c) {
      if (c.id === 'me') { c.id = 'vs'; c.player = false; } else if (c.id === 'vs') { c.id = 'me'; c.player = true; }
    });
    camp.cands.sort(function (a, b) { return (b.id === 'me') - (a.id === 'me'); });   // 'me' を先頭に(1人用と同じ並び)
    Game.Voters.swapIds(camp);   // 有権者の好みの列の名前も入れ替える(R18)
    if (camp.surge && (camp.surge.target === 'me' || camp.surge.target === 'vs')) camp.surge.target = camp.surge.target === 'me' ? 'vs' : 'me';
    vs.active = 1 - vs.active;
    state.player.name = vs.names[vs.active];
    state.player.party = vs.parties[vs.active];
  }
  function activate(state, who) { if (state.camp.vs.active !== who) swap(state); }

  // その日の先手(1日目は 1P。offset 1 なら 2P。あとは1日ごとに交代)
  function firstOf(camp) { return (camp.day - 1 + (camp.vs.offset || 0)) % 2; }

  // 次の日の朝:2人とも手札を配り直し、AIの予告と朝の出来事を決める。先手の視点で始める
  function startDay(state) {
    const camp = state.camp, vs = camp.vs, B = bal();
    camp.day += 1;
    camp.blocked = {};
    camp.today = {};
    vs.done = [false, false];
    vs.log = [];
    const first = firstOf(camp);
    [1 - first, first].forEach(function (who) {   // 後手 → 先手の順に配り、先手の視点で終える
      activate(state, who);
      camp.energy = B.campaign.energy;
      C.draw(state);
      camp.pending = [];
      if (camp.day === 1) camp.pending.push({ type: 'vsIntro' });
      if (camp.day === B.debateDay) camp.pending.push({ type: 'debate' });
      Game.Scandal.campaignSlush(state);   // 裏金の報道(R9)。その人の視点で
    });
    C.planIntents(state);
    const ai = C.cand(camp, camp.intents[0].who);
    camp.news = camp.day + '日目の朝。' + ai.short + '陣営は今日、' + Game.Data.REGION[camp.intents[0].region].name + 'に入るもよう。';
    // 朝の出来事は、先手の視点で1回だけ起こし、後手にも同じ知らせを出す(先手の陣営のことだと分かるように)
    if (camp.day !== 1 && camp.day !== B.pollDay && camp.day !== B.debateDay) {
      const before = camp.pending.length;
      C.morningEvent(state);
      const ev = camp.pending[before];
      if (ev) {
        const copy = JSON.parse(JSON.stringify(ev));
        if (['tailwind', 'headwind', 'donation'].indexOf(ev.id) >= 0) copy.text = '(' + short(vs.names[first]) + '陣営のこと)' + ev.text;
        copy.fx = [];
        vs.stash.pending.push(copy);
      }
    }
    // 奔流の朝(R15):先手の視点で起こし、後手にも同じ知らせ
    const sg = C.surgeMorning(camp);
    if (sg) {
      const copy = JSON.parse(JSON.stringify(sg));
      if (camp.surge.slot >= 0) copy.text = copy.text.replace(/^誰もまだ気づいていなかった。あなたの/, '誰もまだ気づいていなかった。' + vs.names[camp.surge.slot] + 'さんの');
      vs.stash.pending.push(copy);
    }
    if (camp.day === B.campaign.days) {
      const last = { type: 'event', id: 'lastday', title: '最終日', text: '「最後のお願い」に声がかれる。今日は、地区を選ぶカードの効果がすべて +' + B.campaign.lastDayBonus + '。', fx: [] };
      camp.pending.push(last);
      vs.stash.pending.push(JSON.parse(JSON.stringify(last)));
    }
    vs.handoff = true;
  }

  // 交代の画面を閉じて、手番を始める。情勢調査の日は、その人の視点の新聞を出す
  function beginTurn(state) {
    const camp = state.camp, B = bal();
    camp.vs.handoff = false;
    if (camp.day === B.pollDay) camp.pending.unshift({ type: 'poll', headline: C.pollHeadline(camp), overall: C.overall(camp) });
  }
  // 手番の人が使ったカードを、交代のときに相手に見せる
  function note(state, msg) {
    const vs = state.camp.vs;
    if (msg) vs.log.push({ who: vs.active, msg: msg });
  }

  // 手番を終える。後手がまだなら交代、2人とも終えたらAIの動きが効いて次の日へ(最終日のあとは投票)
  function endTurn(state) {
    const camp = state.camp, vs = camp.vs, B = bal();
    if (camp.pending.length) return { ok: false, reason: '先に知らせを確かめよう。' };
    camp.hand.forEach(function (c) { camp.discard.push(c.id); });
    camp.hand = [];
    vs.done[vs.active] = true;
    if (!vs.done[1 - vs.active]) {
      swap(state);
      vs.handoff = true;
      return { ok: true, handoff: true, fx: [] };
    }
    // AIの動き。固い票は2人どちらのものでも、AIの伸びを減らす(持っている人は1つずつ使う)
    const fx = [];
    camp.intents.forEach(function (it) {
      if (camp.blocked[it.region]) { fx.push({ region: it.region, who: it.who, gain: 0, blocked: true }); return; }
      let g = C.saturated(camp, it.region, it.who) ? Math.round(it.gain * B.campaign.saturatedMult) : it.gain, shielded = false;
      const mine = camp.shields[it.region] || 0, theirs = vs.stash.shields[it.region] || 0;
      if (mine > 0 || theirs > 0) {
        g = Math.round(g * (1 - B.campaign.shieldBlock));
        if (mine > 0) camp.shields[it.region] -= 1;
        if (theirs > 0) vs.stash.shields[it.region] -= 1;
        shielded = true;
      }
      fx.push({ region: it.region, who: it.who, gain: Math.round(C.applyGain(camp, it.region, it.who, g, it.what === '戸別訪問' ? 'few' : 'interest')), shielded: shielded });
    });
    C.surgeTick(camp, fx);   // 奔流の候補が伸びる(R15)
    C.mouth(camp, fx);   // 口コミ(R18)
    C.trackClose(camp);   // 接戦が続くと投票率が上がる(R13)
    if (camp.day >= B.campaign.days) {
      camp.intents = [];
      activate(state, 0);   // 投票と開票は 1P の視点で(2P の固い票は vote.js が stash から読む)
      Game.Vote.run(state);
      state.screen = 'count';
      return { ok: true, fx: fx, over: true };
    }
    startDay(state);
    return { ok: true, fx: fx, over: false };
  }

  // 結果:2人のうち票の多いほうが対戦の勝ち(slot 0 = 1P / 1 = 2P)。議席は3人で争うので、AIが取ることもある(seat が -1)
  //   開票は 1P の視点で行う('me' = 1P、'vs' = 2P)
  function outcome(state) {
    const e = state.election, vs = state.camp.vs;
    const slot = e.totals.me >= e.totals.vs ? 0 : 1;
    const seat = e.winner === 'me' ? 0 : e.winner === 'vs' ? 1 : -1;
    return { slot: slot, seat: seat, name: vs.names[slot], seatName: C.cand(state.camp, e.winner).name, votes: [e.totals.me, e.totals.vs], gap: Math.abs(e.totals.me - e.totals.vs) };
  }
  // 同じ顔ぶれで、もう一度(1日目の先手を入れ替える)
  function rematch(state) {
    const vs = state.camp.vs;
    return newMatch(state, { seat: state.player.seat, offset: 1 - (vs.offset || 0), handicap: !!vs.handicap, players: [{ name: vs.names[0], party: vs.parties[0] }, { name: vs.names[1], party: vs.parties[1] }] });
  }

  return { newMatch: newMatch, beginTurn: beginTurn, endTurn: endTurn, note: note, outcome: outcome, rematch: rematch, swap: swap };
})();
