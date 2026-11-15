// 議員の任期(と、落選したあとの浪人)。選挙で背負った約束を果たし、地盤を耕し、党で働いて、次の選挙に備える。DOM には触らない。
// 1ターン = 国会の1会期(半年)。会期の終わりに、見えている確率で衆議院が解散する。8ターンで任期満了。
// 任期の結果は state.career.next にまとめ、次の選挙戦(campaign.js の newCampaign)が読む:
//   endorse 守った約束 → 推薦のカード / broken 破った約束 → 使えないカードと始まりの支持の低下
//   light 少しは進めた約束 → 小さな低下だけ / carried 果たす時間がなかった約束 → 持ち越し
// 出世(R3):党内評価(merit)と当選回数で役職(rank)が上がる。引退・公認を失うとエンディング(state.ending)。
window.Game = window.Game || {};

Game.Career = (function () {
  const R = Game.Rng;
  const T = function () { return Game.Balance.term; };
  const CB = function () { return Game.Balance.comeback; };
  const regions = function () { return Game.Data.DISTRICT.regions; };
  const P = function (id) { return Game.Data.PROMISES[id]; };

  // 議席を得たか(小選挙区の当選か、比例復活)
  function seated(e) { return e.won || !!(e.pr && e.pr.revived); }

  // ---------- 選挙のあと:任期を始める(続けて落選すると、ここで引退になる) ----------
  function afterElection(state) {
    if (state.election.national) return afterNational(state);
    const B = Game.Balance, e = state.election, camp = state.camp;
    const cr = state.career || { wins: 0, elections: 0, kept: 0, broken: 0, base: {}, history: [] };
    ['districtWins', 'prWins', 'lossStreak', 'merit', 'rank', 'bestRank'].forEach(function (k) { cr[k] = cr[k] || 0; });   // R2 までのセーブにも足す
    const got = seated(e);
    cr.elections += 1;
    if (got) cr.wins += 1;
    if (e.won) cr.districtWins += 1; else if (got) cr.prWins += 1;
    cr.lossStreak = got ? 0 : cr.lossStreak + 1;
    cr.merit += e.won ? B.merit.winDistrict : got ? B.merit.winPr : 0;
    cr.status = got ? 'member' : 'ronin';
    // 次の選挙での自分の立場:小選挙区で勝てば現職、比例復活なら「比例復活の現職」、落選した元議員は元職
    cr.role = e.won ? 'incumbent' : got ? 'revived' : (cr.wins > 0 ? 'former' : 'newcomer');
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
    // 約束:議席を得れば任期に持ち込む(持ち越していた約束は進み具合もそのまま)。落選すれば白紙
    const old = {};
    ((cr.next && cr.next.carriedFull) || []).forEach(function (p) { old[p.id] = p; });
    cr.promises = got ? camp.promises.map(function (id) { return old[id] ? { id: id, progress: old[id].progress, turns: old[id].turns } : { id: id, progress: 0, turns: 0 }; }) : [];
    cr.dropped = got ? 0 : camp.promises.length;
    cr.next = { endorse: [], broken: [], light: [], carried: [], carriedFull: [] };
    cr.history.push({ won: e.won, revived: got && !e.won, votes: e.totals.me, lossRatio: e.lossRatio, role: camp.cands[0].role });
    state.career = cr;

    // 続けて議席を得られなければ、党の公認を失って引退
    if (!got && cr.lossStreak >= B.retire.lossStreak) return retire(state, 'dropped');

    if (!got) cr.rank = 0;   // 落選すると役職は外れる(党内評価は残る)
    return beginTerm(state, got);
  }
  function beginTerm(state, got) {
    const cr = state.career;
    Game.Data.setHome(state.player.seat);
    Game.Data.useArena(cr.leader ? 'nation' : 'home');   // 任期の地図は地元の選挙区。党首は全国
    cr.turn = 0; cr.wind = 0; cr.contrib = 0; cr.money = T().startMoney;
    cr.sel = Game.Data.REGION[cr.sel] && !Game.Data.REGION[cr.sel].smd ? cr.sel : 'downtown';
    cr.discard = []; cr.hand = []; cr.uid = 0;
    cr.pending = [{ type: 'start' }]; cr.news = ''; cr.over = false;
    if (got) personnel(cr);
    cr.deck = R.shuffle(state, termDeck(cr));
    state.screen = 'term';
    startTurn(state);
    return cr;
  }

  // ---------- 党首として戦った総選挙のあと ----------
  function afterNational(state) {
    const B = Game.Balance, e = state.election, cr = state.career;
    const prev = cr.partySeats;
    cr.elections += 1; cr.wins += 1; cr.districtWins += 1; cr.lossStreak = 0;   // 党首は地元の議席を守ったものとする
    cr.merit += B.merit.winDistrict;
    cr.partySeats = e.seats.me;
    cr.bestSeats = Math.max(cr.bestSeats || 0, e.seats.me);
    if (e.meMajority) cr.wonMajority = true;
    // 政権づくり:画面(連立の画面)か自動プレイが先に決めている。決まっていなければ、ここで自動で決める
    if (!cr.govFresh) Game.Gov.form(state, Game.Gov.autoChoose(state));
    cr.govFresh = false;
    const gov = cr.gov;
    cr.blocks = {};   // 任期の地図に出す、ブロックごとの結果
    Object.keys(e.byBlock).forEach(function (rid) {
      const st = e.byBlock[rid].seats;
      const top = Object.keys(st).sort(function (a, b) { return st[b] - st[a]; })[0];
      cr.blocks[rid] = { lead: top === 'me' ? state.player.party : top, mine: st.me };
    });
    cr.status = 'member'; cr.role = 'incumbent';
    // 公約:与党(首相・連立与党)なら、任期のうちに果たす。野党に回れば白紙
    const ids = gov.role === 'opposition' ? [] : state.camp.promises.slice();
    if (gov.adopted && ids.indexOf(gov.adopted) < 0) ids.push(gov.adopted);
    cr.promises = ids.map(function (id) { return { id: id, progress: 0, turns: 0 }; });
    cr.dropped = gov.role === 'opposition' ? state.camp.promises.length : 0;
    cr.next = { endorse: [], broken: [], light: [], carried: [], carriedFull: [] };
    if (gov.role === 'pm') { cr.wasPM = true; cr.pmTerms = (cr.pmTerms || 0) + 1; }
    cr.history.push({ national: true, seats: e.seats.me, prev: prev, first: e.won, majority: e.meMajority, role: 'leader', gov: gov.role, won: true, votes: e.votes.me });
    // 議席を大きく減らし、政権にも入れなかったら、責任をとって党首を辞める
    if (prev != null && gov.role === 'opposition' && e.seats.me <= prev * (1 - B.nation.resignDrop)) return retire(state, 'resigned');
    return beginTerm(state, true);
  }

  // ---------- 党首選 ----------
  function raceStrength(cr) {
    const L = Game.Balance.leaderRace;
    return Math.max(5, Math.round(L.base + cr.merit * L.merit + cr.kept * L.kept + cr.broken * L.broken + cr.wins * L.win));
  }
  // 党三役なら、任期の決まった会期に党首選の知らせが来る(相手の強さは、このとき決まる)
  function offerRace(state) {
    const cr = state.career, L = Game.Balance.leaderRace;
    const rv = Game.Data.LEADER_RIVALS[state.player.party];
    cr.pending.push({
      type: 'leaderRace', me: raceStrength(cr),
      rivals: [
        { name: rv[0].name, short: rv[0].short, title: rv[0].title, str: Math.max(10, Math.round(L.incumbent + R.normal(state) * L.noise)) },
        { name: rv[1].name, short: rv[1].short, title: rv[1].title, str: Math.max(10, Math.round(L.challenger + R.normal(state) * L.noise)) },
      ],
    });
  }
  // appeal: 'unity' 党内融和 / 'reform' 世代交代 / 'deal' 3番手と組む / 'skip' 見送る
  function runRace(state, appeal) {
    const cr = state.career, L = Game.Balance.leaderRace, ev = cr.pending[0];
    if (!ev || ev.type !== 'leaderRace') return null;
    if (appeal === 'skip') {
      cr.pending.shift();
      cr.news = '今回の党首選は見送った。次の総選挙のあとに、また機会がある。';
      return { skipped: true };
    }
    const names = ['me', 'r0', 'r1'];
    const str = { me: ev.me, r0: ev.rivals[0].str, r1: ev.rivals[1].str };
    let note = '';
    if (appeal === 'unity') {
      str.me += L.unity;
      note = '党内融和を訴え、着実に支持を広げた。';
    } else if (appeal === 'reform') {
      const hit = R.next(state) < L.reform.chance;
      str.me += hit ? L.reform.hit : L.reform.miss;
      note = hit ? '「世代交代」の訴えが若手と地方の党員に響いた。' : '「世代交代」の訴えは、ベテランの反発を招いた。';
    } else {
      const third = str.r0 <= str.r1 ? 'r0' : 'r1';
      const move = Math.round(str[third] * L.deal.share);
      str[third] -= move; str.me += move;
      addMerit(cr, L.deal.merit);
      note = ev.rivals[third === 'r0' ? 0 : 1].short + '陣営と手を組み、票の一部を受け取った。ポストの約束は高くついた。';
    }
    const sum = str.me + str.r0 + str.r1;
    const first = {};
    names.forEach(function (k) { first[k] = str[k] / sum * 100; });
    const ord = names.slice().sort(function (a, b) { return first[b] - first[a]; });
    let winner = ord[0], runoff = null;
    if (first[ord[0]] < 50) {
      // 決選投票:3位の票は、上位2人にほぼ半々で流れる
      const k = Math.max(0.3, Math.min(0.7, 0.5 + R.normal(state) * 0.08));
      const a = first[ord[0]] + first[ord[2]] * k, b = first[ord[1]] + first[ord[2]] * (1 - k);
      runoff = { a: ord[0], b: ord[1], pa: a, pb: b };
      winner = a >= b ? ord[0] : ord[1];
    }
    const won = winner === 'me';
    if (won) {
      cr.leader = true;
      cr.rank = Game.Balance.ranks.length - 1;
      cr.bestRank = Math.max(cr.bestRank, cr.rank);
      cr.partySeats = Game.Balance.nation.startSeats[state.player.party];
      // 政権を担っている党の党首になれば、そのまま首相。山札を党首のものに入れ替える(手札はこの会期のあいだ、そのまま使える)
      cr.gov = Game.Gov.initial(state);
      if (cr.gov.role === 'pm') { cr.wasPM = true; cr.pmTerms = (cr.pmTerms || 0) + 1; }
      cr.promises = [];   // 地元の団体との約束は、党首になって手を離れる
      cr.deck = R.shuffle(state, termDeck(cr));
      cr.discard = [];
      cr.news = cr.gov.role === 'pm' ? '党首選に勝った。与党の党首として、首相に指名された。' : '党首選に勝った。次の総選挙は、党首として全国を戦う。';
    } else {
      addMerit(cr, L.loseMerit);
      cr.news = '党首選に敗れた。次の総選挙のあとに、また機会がある。';
    }
    cr.pending[0] = { type: 'leaderResult', appeal: appeal, note: note, first: first, runoff: runoff, won: won, rivals: ev.rivals };
    return cr.pending[0];
  }
  // 近道:はじめから党首として総選挙を戦う(立候補の準備の画面から)
  function quickLeader(state) {
    const B = Game.Balance;
    state.career = {
      wins: 5, elections: 5, districtWins: 5, prWins: 0, lossStreak: 0, kept: 6, broken: 0, merit: 60,
      rank: B.ranks.length - 1, bestRank: B.ranks.length - 1, leader: true, quick: true,
      status: 'member', role: 'incumbent', base: {}, history: [], contrib: 0, money: 0,
      partySeats: B.nation.startSeats[state.player.party],
      next: { endorse: [], broken: [], light: [], carried: [], carriedFull: [] },
    };
    state.career.gov = Game.Gov.initial(state);
    if (state.career.gov.role === 'pm') { state.career.wasPM = true; state.career.pmTerms = 1; }
    return state.career;
  }

  // ---------- 出世 ----------
  // 次の役職と、足りないもの
  function nextRank(cr) {
    const ranks = Game.Balance.ranks, nx = ranks[cr.rank + 1];
    if (!nx || nx.leader) return null;   // 党首には、人事では就けない
    return { rank: nx, wins: Math.max(0, nx.wins - cr.wins), merit: Math.max(0, nx.merit - cr.merit) };
  }
  // 人事:条件(当選回数と党内評価)を満たしていれば、1つ上の役職に就く
  function personnel(cr) {
    const nx = nextRank(cr);
    if (cr.status !== 'member' || !nx || nx.wins > 0 || nx.merit > 0) return false;
    cr.rank += 1;
    cr.bestRank = Math.max(cr.bestRank, cr.rank);
    cr.pending.push({ type: 'promotion', rank: cr.rank });
    return true;
  }
  // 任期の山札。役職が上がると、公務が「地元回り」と入れ替わる(地元に帰る時間が減る)
  function termDeck(cr) {
    if (cr.leader && cr.gov) {   // 党首:政権での立場ごとの山札
      const d = T().deck[cr.gov.role].slice();
      if (cr.gov.role === 'pm' && cr.gov.partner) d.push('pmCoal', 'pmCoal');
      for (let i = 0; i < (cr.gov.posts || 0); i++) d.push('grumble');
      return d;
    }
    const deck = T().deck[cr.status].slice();
    let duty = cr.status === 'member' ? Game.Balance.ranks[cr.rank].duty : 0;
    for (let i = 0; i < deck.length && duty > 0; i++) if (deck[i] === 'local') { deck[i] = 'duty'; duty -= 1; }
    return deck;
  }
  function addMerit(cr, n) { cr.merit = Math.max(0, cr.merit + n); }

  // ---------- 計算 ----------
  function dissolveChance(cr) {
    const base = T().dissolve[Math.min(cr.turn, T().turns) - 1];
    if (cr.turn >= T().turns) return 1;
    if (isPM(cr)) return 0;   // 首相は、解散を自分で決める
    if (base <= 0) return 0;
    return Math.max(T().dissolveMin, Math.min(T().dissolveMax, base + cr.wind));
  }
  function isPM(cr) { return !!(cr.leader && cr.gov && cr.gov.role === 'pm'); }
  function changeApproval(cr, n) {
    const g = Game.Balance.gov;
    cr.gov.approval = Math.max(g.approvalMin, Math.min(g.approvalMax, cr.gov.approval + n));
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
  function addContrib(cr, n) { cr.contrib += n; addMerit(cr, n); }

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
      const nat = !!P(p.id).national;   // 全国の公約(党首)
      msg = name + '。' + (nat ? '公約「' : P(p.id).org + 'との約束「') + P(p.id).policy + '」を進めた。';
      if (p.progress >= T().promiseGoal) {
        cr.promises = cr.promises.filter(function (x) { return x !== p; });
        cr.next.endorse.push(p.id);
        cr.kept += 1;
        addMerit(cr, Game.Balance.merit.kept);
        if (nat) {
          msg = name + '。公約「' + P(p.id).policy + '」を果たした。';
          if (isPM(cr)) { changeApproval(cr, Game.Balance.gov.keptApproval); msg += '内閣支持率が上がった。'; }
          if (cr.gov && cr.gov.adopted === p.id) { cr.gov.sat = Math.min(100, cr.gov.sat + Game.Balance.gov.satKept); msg += '連立相手も満足している。'; }
        } else {
          const d = addBase(cr, P(p.id).region, T().keptBase);
          if (d) fx.push({ region: P(p.id).region, gain: d });
          msg = name + '。' + P(p.id).org + 'との約束「' + P(p.id).policy + '」を果たした。次の選挙で推薦がもらえる。';
        }
      }
    } else if (kind === 'region') {
      if (!Game.Data.REGION[target]) return { ok: false, reason: '回る地区を選ぼう。' };
      const d = addBase(cr, target, b.base);
      fx.push({ region: target, gain: d });
      cr.sel = target;
      msg = Game.Data.REGION[target].name + 'で' + name + '。地盤が ' + d + ' 固まった。';
    } else if (b.promise && b.idle) {
      changeApproval(cr, b.idle);
      msg = name + '。公約はすべて果たしている。着実な国会運営で、内閣支持率が ' + b.idle + ' 上がった。';
    } else if (b.promise) {
      addContrib(cr, b.contrib);
      msg = name + '。果たすべき約束がないので、党の方針に沿って働いた(党への貢献 +' + b.contrib + ')。';
    } else if (b.grumble) {
      msg = Game.Data.TERM_CARDS[id].say;
    } else if (b.approval || b.sat) {
      if (b.approval) changeApproval(cr, b.approval);
      if (b.sat) cr.gov.sat = Math.min(100, cr.gov.sat + b.sat);
      if (b.contrib) addContrib(cr, b.contrib);
      msg = name + '。' + Game.Data.TERM_CARDS[id].say;
    } else if (b.baseAll) {
      regions().forEach(function (r) { const d = addBase(cr, r.id, b.baseAll); if (d) fx.push({ region: r.id, gain: d }); });
      msg = name + '。地元でも顔が売れた。';
    } else if (b.contrib) {
      addContrib(cr, b.contrib);
      msg = name + '。党への貢献が ' + b.contrib + ' 増えた。';
    } else {
      msg = name + '。' + (-b.money) + '万円が集まった。';
    }
    cr.money -= b.money;
    cr.energy -= b.cost;
    cr.hand = cr.hand.filter(function (c) { return c.uid !== uid; });
    if (!b.grumble) cr.discard.push(id);   // なだめた不満は、この任期のあいだ山札に戻らない
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
    if (isPM(cr)) {   // 首相:内閣支持率が動く出来事
      const GE = Game.Balance.gov.events;
      if (R.next(state) >= GE.chance) return;
      const up = R.next(state) < 0.5;
      changeApproval(cr, up ? GE.up : GE.down);
      cr.pending.push({
        type: 'event',
        title: up ? '外交の成果' : '閣僚の不祥事',
        text: up ? '首脳会談で前進があり、政権の評価が上がった。内閣支持率 +' + GE.up + '。' : '閣僚の失言が報じられ、任命した首相の責任が問われている。内閣支持率 ' + GE.down + '。',
      });
      return;
    }
    if (R.next(state) >= E.chance) return;
    const open = {};
    cr.promises.forEach(function (p) { open[p.id] = true; });
    cr.next.endorse.forEach(function (id) { open[id] = true; });
    const asks = Object.keys(Game.Data.PROMISES).filter(function (id) { return !open[id] && !Game.Data.PROMISES[id].national; });   // 全国の公約は、要望には出ない
    const kinds = ['windUp', 'windDown'];
    if (cr.status === 'member' && !cr.leader && asks.length && cr.promises.length < E.petition.maxOpen) kinds.push('petition');
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
    // 任期の途中の人事(内閣改造)。役職が変わると、公務のカードが山札に入る
    if (cr.turn === Game.Balance.reshuffleTurn && personnel(cr)) {
      let duty = Game.Balance.ranks[cr.rank].duty - Game.Balance.ranks[cr.rank - 1].duty;
      ['deck', 'discard'].forEach(function (pile) {
        for (let i = 0; i < cr[pile].length && duty > 0; i++) if (cr[pile][i] === 'local') { cr[pile][i] = 'duty'; duty -= 1; }
      });
    }
    // 党首選:党三役なら立候補できる
    if (cr.turn === Game.Balance.leaderRace.turn && cr.status === 'member' && !cr.leader && Game.Balance.ranks[cr.rank + 1] && Game.Balance.ranks[cr.rank + 1].leader) offerRace(state);
    if (cr.turn > 1) rollEvent(state);
    const pct = Math.round(dissolveChance(cr) * 100);
    cr.news = Game.Data.sessionName(cr.turn) + '。' + (cr.turn >= T().turns ? 'この会期で任期満了。総選挙になる。'
      : isPM(cr) ? '内閣支持率は ' + Math.round(cr.gov.approval) + '%。解散の時期は、首相が決める。'
        : pct ? 'この会期のあとに解散する見込みは ' + pct + '%。' : '選挙が終わったばかりで、解散はまだない。');
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
      if (P(p.id).national) {   // 全国の公約:果たせなければ、次の総選挙で全ブロックに響く
        const nm = '公約「' + P(p.id).policy + '」';
        if (p.turns < T().graceTurns) {
          lines.push({ kind: 'carried', text: nm + 'は、解散が早く、果たす時間がなかった。' });
        } else {
          (p.progress > 0 ? cr.next.light : cr.next.broken).push(p.id);
          cr.broken += 1;
          addMerit(cr, Game.Balance.merit.broken);
          if (isPM(cr)) changeApproval(cr, Game.Balance.gov.brokenApproval);
          lines.push({ kind: 'broken', text: nm + 'を果たせなかった。次の総選挙で、全ブロックの支持に響く。' });
        }
        return;
      }
      const name = P(p.id).org + 'との約束「' + P(p.id).policy + '」';
      if (p.turns < T().graceTurns) {
        cr.next.carried.push(p.id);
        cr.next.carriedFull.push({ id: p.id, progress: p.progress, turns: p.turns });
        lines.push({ kind: 'carried', text: name + 'は、解散が早く、果たす時間がなかった。事情をくんでもらい、次の任期に持ち越す。' });
      } else if (p.progress > 0) {
        cr.next.light.push(p.id);
        cr.broken += 1;
        addMerit(cr, Game.Balance.merit.broken);
        lines.push({ kind: 'light', text: name + 'は、途中までしか進められなかった。' + Game.Data.REGION[P(p.id).region].name + 'の支持が少し下がる。' });
      } else {
        cr.next.broken.push(p.id);
        cr.broken += 1;
        addMerit(cr, Game.Balance.merit.broken);
        lines.push({ kind: 'broken', text: name + 'に、手をつけられなかった。次の選挙で「破った約束」として返ってくる。' });
      }
    });
    cr.next.endorse.forEach(function (id) {
      lines.push({ kind: 'kept', text: P(id).national ? '公約「' + P(id).policy + '」を果たした。次の総選挙で、信頼になって返ってくる。'
        : P(id).org + 'との約束「' + P(id).policy + '」を果たした。次の選挙で推薦がもらえる。' });
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
    if (cr.leader && cr.gov) {
      const g = Game.Balance.gov, gov = cr.gov;
      if (gov.role === 'pm') {
        cr.pmTurns = (cr.pmTurns || 0) + 1;
        changeApproval(cr, -g.approvalDecay + R.normal(state) * g.approvalNoise);
        // 連立相手の満足度が尽きると、連立を離れて内閣が倒れる
        if (gov.partner) {
          gov.sat = Math.max(0, gov.sat - g.satDecay);
          if (gov.sat < g.satLeave) { changeApproval(cr, g.collapseApproval); return dissolveNow(state, 'collapse'); }
        }
        // 支持率の低い会期が続くと、退陣に追い込まれる
        gov.low = gov.approval < g.lowApproval ? gov.low + 1 : 0;
        if (gov.low >= g.lowTurns) { retire(state, 'ousted'); return { ok: true, ended: true }; }
      } else {
        changeApproval(cr, (g.aiMean - gov.approval) * g.aiRevert + R.normal(state) * g.aiNoise);
      }
    }
    if (full || R.next(state) < dissolveChance(cr)) return dissolveNow(state, full ? 'full' : 'dissolve');
    startTurn(state);
    return { ok: true, dissolved: false };
  }
  // 解散(任期満了も)。reason: 'dissolve' 首相が解散 / 'full' 任期満了 / 'collapse' 連立が壊れた / 'pm' 自分(首相)が解散を決めた
  function dissolveNow(state, reason) {
    const cr = state.career;
    cr.over = true;
    const lines = settle(state);
    cr.pending.push({
      type: 'dissolve', full: reason === 'full', reason: reason, session: Game.Data.sessionName(cr.turn), lines: lines,
      stars: cr.leader ? 0 : extraStars(cr),
      unity: cr.leader ? Math.min(Game.Balance.nation.unityMax, Math.floor(cr.contrib / Game.Balance.nation.unityPer)) : 0,
      govBonus: cr.leader && cr.gov ? Game.Gov.electionBonus(cr.gov) : 0, approval: cr.leader && cr.gov ? Math.round(cr.gov.approval) : null,
    });
    return { ok: true, dissolved: true };
  }
  // 首相の解散権:決めた会期から、いつでも総選挙に打って出られる
  function canDissolve(cr) { return isPM(cr) && !cr.over && !cr.pending.length && cr.turn >= Game.Balance.gov.dissolveFrom; }
  function dissolve(state) {
    const cr = state.career;
    if (!canDissolve(cr)) return { ok: false };
    cr.promises.forEach(function (p) { p.turns += 1; });
    cr.hand.forEach(function (c) { cr.discard.push(c.id); });
    cr.hand = [];
    cr.pmTurns = (cr.pmTurns || 0) + 1;
    return dissolveNow(state, 'pm');
  }
  // 解散の知らせを閉じたら、次の選挙戦へ
  function toCampaign(state) {
    state.career.pending = [];
    state.election = null;
    Game.Campaign.newCampaign(state);
    state.screen = 'campaign';
  }

  // ---------- 引退とエンディング ----------
  // reason: 'retire' 自分で引退 / 'dropped' 続けて落選し、党の公認を失った / 'resigned' 総選挙で議席を大きく減らし、党首を辞めた
  //         'ousted' 内閣支持率の低迷で、首相を退陣に追い込まれた
  function retire(state, reason) {
    const cr = state.career, B = Game.Balance, L = B.legacy;
    const rank = B.ranks[cr.bestRank || 0];
    const lines = [
      { label: '当選回数', value: cr.wins + '回(小選挙区 ' + (cr.districtWins || 0) + '・比例復活 ' + (cr.prWins || 0) + ')', pts: Math.min(L.winMax, cr.wins * L.win) },
      { label: '到達した役職', value: cr.wins ? rank.name : '—', pts: (cr.bestRank || 0) * L.rank },
      { label: '守った約束', value: cr.kept + '個', pts: Math.min(L.keptMax, cr.kept * L.kept) },
      { label: '破った約束', value: cr.broken + '個', pts: cr.broken * L.broken },
    ];
    if (cr.leader) {
      lines.push({ label: '総選挙の最多議席', value: (cr.bestSeats || 0) + '議席', pts: Math.min(L.seatsMax, Math.floor((cr.bestSeats || 0) / L.seatsPer)) });
      lines.push({ label: '単独過半数', value: cr.wonMajority ? '取った' : '届かず', pts: cr.wonMajority ? L.majority : 0 });
    }
    if (cr.wasPM) {
      lines.push({ label: '首相に就任', value: (cr.pmTerms || 1) + '回、政権を担った', pts: L.pm });
      lines.push({ label: '首相の在任', value: ((cr.pmTurns || 0) / 2).toFixed(1).replace('.0', '') + '年', pts: Math.min(L.pmTurnMax, (cr.pmTurns || 0) * L.pmTurn) });
    }
    const score = Math.max(0, lines.reduce(function (a, l) { return a + l.pts; }, 0));
    let grade = 'D';
    for (let i = 0; i < L.grades.length; i++) if (score >= L.grades[i][1]) { grade = L.grades[i][0]; break; }
    const pmNow = isPM(cr);
    const title = reason === 'ousted' ? '支持を失い、首相の座を追われる'
      : pmNow ? (cr.gov.approval >= 50 ? '名宰相として惜しまれつつ、政界を去る' : '首相を務めあげて、政界を去る')
      : cr.wasPM ? '元首相として、政界を去る'
      : cr.leader ? (cr.wonMajority ? '総選挙に勝った党首として、政界を去る' : '党首として、政界を去る')
      : !cr.wins ? '国会に届かないまま、政界を去る'
      : (cr.bestRank || 0) >= 4 ? '党の重鎮として、政界を去る'
        : cr.bestRank === 3 ? '大臣を務めあげて、政界を去る'
          : cr.bestRank >= 1 ? rank.name + 'まで務めて、政界を去る' : '陣笠議員のまま、政界を去る';
    state.ending = { reason: reason, title: title, score: score, grade: grade, lines: lines, elections: cr.elections, history: cr.history.slice() };
    state.screen = 'ending';
    return state.ending;
  }

  return {
    afterElection: afterElection, play: play, canPlay: canPlay, endTurn: endTurn, dismiss: dismiss, respond: respond, toCampaign: toCampaign,
    dissolveChance: dissolveChance, extraStars: extraStars, targetKind: targetKind, baseGain: baseGain,
    seated: seated, nextRank: nextRank, retire: retire, raceStrength: raceStrength, runRace: runRace, quickLeader: quickLeader,
    isPM: isPM, canDissolve: canDissolve, dissolve: dissolve,
  };
})();
