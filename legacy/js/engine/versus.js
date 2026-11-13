// 対戦モード:2人が別々の党を率いて、同じ総選挙と政権争いを戦う(1台の画面で交互に操作)。DOMには触らない。
// 選挙戦は campaign.js の全国モード(人が操作する候補が2人)、投票は vote.js、論戦は debate.js の2人用を使う。
//
// state.versus = {
//   rng, victory: 'seats' | 'govern' | 'legacy', players: [P, P], customParty: 新党(1人だけ),
//   turnOf: いま選んでいる人(0|1), cover: 手番の切り替え画面を出すか,
//   plans: [[{ aid, target }], ...], flames: [その人がまだ対応していない炎上], reveal: 前の公開の結果,
//   debate: 2人の論戦, debateTurn: 'ask'|'answer', debateCtx: 'campaign'|'gov', spreadable: [失言を拡散できる人],
//   formation: { order, step, offer }, gov: { pm: 0|1|null(AI), pmParty, coalition, partner: 0|1|null },
//   pendingElection, elections, turns, startYear, winner, scores, log,
// }
// P = { idx, name, party, pledges, support, sns, deck, money, supportBonus, trust: { AI政党: 信用 }, pact,
//       stats: { pmTurns, bills, approvalSum, approvalTurns, debatesWon, gaffes, brokenPacts, seats: [] } }
window.Game = window.Game || {};

Game.Versus = (function () {
  const VB = () => Game.Balance.versus;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const LD = () => Game.Leader;
  const C = () => Game.Campaign;

  function rand(v) {
    let t = (v.rng = (v.rng + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const seed32 = (v) => Math.floor(rand(v) * 4294967296);
  function addLog(st, text) {
    const v = st.versus;
    v.log.push({ when: `${st.world.year}年`, text });
    if (v.log.length > 150) v.log.shift();
  }

  // ---------------- 始める ----------------
  // opts: { players: [{ name, party, pledges, custom: { name, short, color, ideology } | null }], victory, seed }
  function start(opts) {
    const T = Game.Balance.term;
    const world = { year: T.startYear, turnIndex: 0, approval: VB().gov.mean, partyShift: {}, parties: {}, termElapsed: 0 };
    for (const id in Game.Data.PARTY_SEATS) world.parties[id] = { seats: Game.Data.PARTY_SEATS[id] };
    const v = {
      rng: opts.seed >>> 0 || 1, victory: opts.victory, players: [], customParty: null,
      turnOf: 0, cover: true, plans: [[], []], flames: [null, null], reveal: null,
      debate: null, debateTurn: null, debateCtx: null, spreadable: [],
      formation: null, gov: null, pendingElection: null, elections: 0, turns: 0, startYear: T.startYear,
      winner: null, scores: null, log: [],
    };
    opts.players.forEach((o, i) => {
      if (o.custom) {
        // 新党:第1党から何人かの議員が移ってきて始まる
        const tmp = {};
        const n = VB().newPartySeats;
        Game.NewParty.create(tmp, Object.assign({}, o.custom, { pledges: o.pledges, origin: 'versus', mps: n, year: T.startYear }));
        v.customParty = tmp.party;
        const big = Object.keys(world.parties).filter((id) => id !== 'indep').sort((a, b) => world.parties[b].seats - world.parties[a].seats)[0];
        world.parties[big].seats -= n;
        world.parties[Game.NewParty.ID] = { seats: n };
      }
      const party = o.custom ? Game.NewParty.ID : o.party;
      const trust = {};
      for (const id of aiParties({ parties: world.parties }, [])) trust[id] = VB().trust.start;
      v.players.push({
        idx: i, name: o.name, party, pledges: o.pledges.slice(),
        support: { relations: Game.Support.initialRelations(party, o.pledges), pledges: o.pledges.slice(), promises: [], banned: [], endorsedLast: [] },
        sns: Game.Sns.create(null), deck: Game.Debate.ensureDeck({}),
        money: o.custom ? VB().handicap.money : 0, supportBonus: 0, trust, pact: null,
        stats: { pmTurns: 0, bills: 0, approvalSum: 0, approvalTurns: 0, debatesWon: 0, gaffes: 0, brokenPacts: 0, seats: [] },
      });
    });
    const st = {
      version: 1, mode: 'versus', screen: 'vsPrep',
      player: { name: v.players[0].name, party: v.players[0].party },   // 1人用の画面部品のため
      world, versus: v, ui: {},
    };
    addLog(st, `${v.players[0].name}(${partyName(v.players[0].party)})と${v.players[1].name}(${partyName(v.players[1].party)})の対戦が始まった。`);
    return st;
  }

  const partyName = (id) => LD().partyInfo(id).name;
  // プレイヤーの党でもなく、無所属でもない、議席のある党(AI政党)
  function aiParties(world, exclude) {
    return Object.keys(world.parties).filter((id) => id !== 'indep' && !exclude.includes(id) && (world.parties[id].seats > 0 || id === 'kofuku'));
  }
  function aiOf(st) {
    return aiParties(st.world, st.versus.players.map((p) => p.party)).filter((id) => st.world.parties[id].seats > 0);
  }
  function seats(st, party) {
    return (st.world.parties[party] || { seats: 0 }).seats;
  }

  // 1人用のエンジン(national.js など)に渡す、その人から見た state
  function view(st, i) {
    const v = st.versus;
    const P = v.players[i];
    return {
      versusView: true,
      player: { name: P.name, party: P.party },
      world: st.world,
      leader: { party: P.party, supportBonus: P.supportBonus, cohesion: 70 },
      support: P.support,
      career: { money: P.money, postLevel: 3, nationalRecog: 50 },
      party: P.party === Game.NewParty.ID ? v.customParty : null,
      sns: P.sns, debateDeck: P.deck, difficulty: 'normal',
    };
  }
  function supportOf(st, i) {
    return LD().supportOf(view(st, i), st.versus.players[i].party);
  }

  // ---------------- 選挙前:AI政党との選挙協力 ----------------
  function pactOptions(st, i) {
    const P = st.versus.players[i];
    return aiOf(st).map((id) => ({
      id, name: partyName(id), seats: seats(st, id), trust: Math.round(P.trust[id] ?? VB().trust.start),
      ok: (P.trust[id] ?? VB().trust.start) >= VB().trust.min,
    }));
  }
  // 選挙前の準備:選んだら次の人へ。2人そろったら公開して、同じ相手を選んでいたら議席の多い党と組む
  function submitPrep(st, i, partner) {
    const v = st.versus;
    v.plans[i] = partner ? [{ aid: 'pact', target: partner }] : [];
    if (i === 0) { v.turnOf = 1; v.cover = true; return null; }
    const lines = [];
    const want = v.plans.map((p) => (p[0] ? p[0].target : null));
    for (const k of [0, 1]) {
      const P = v.players[k];
      const x = want[k];
      if (!x) { lines.push(`${P.name}:選挙協力はしない。`); continue; }
      const rival = want[1 - k] === x ? v.players[1 - k] : null;
      if (rival && seats(st, rival.party) > seats(st, P.party)) { lines.push(`${P.name}:${partyName(x)}に選挙協力を申し込んだが、${partyName(x)}は${rival.name}の党を選んだ。`); continue; }
      if ((P.trust[x] ?? 0) < VB().trust.min) { lines.push(`${P.name}:${partyName(x)}に断られた(信用が足りない)。`); continue; }
      P.pact = x;
      lines.push(`${P.name}:${partyName(x)}と選挙協力(候補者の一本化)。選挙のあと、連立が必要なら組む約束だ。`);
    }
    v.plans = [[], []];
    lines.forEach((l) => addLog(st, l));
    startCampaign(st, lines);
    return lines;
  }

  // ---------------- 選挙戦 ----------------
  function cidOf(st, i) {
    return i === 0 ? 'player' : 'party_' + st.versus.players[1].party;
  }
  function flagsOf(st, i) {
    const v = st.versus;
    const P = v.players[i];
    if (P.party !== Game.NewParty.ID) return null;
    return { newness: v.customParty.newness + VB().handicap.newness, noRequirement: !v.customParty.requirement };
  }

  function startCampaign(st, lines) {
    const v = st.versus;
    const [A, B] = v.players;
    // 首相の党の支持率は内閣支持率につられる
    if (v.gov && v.gov.pmParty) st.world.partyShift[v.gov.pmParty] = (st.world.approval - VB().gov.mean) * VB().gov.approvalToShift;
    const vA = view(st, 0);
    vA.alsoRun = [B.party];   // 議席がゼロになっても、もう1人の党は候補を立てる
    const vB = view(st, 1);
    // 選挙資金は funds(党の資金 P.money + 議席 + 支持率)から、候補者の擁立の費用を引いた残り
    const prepA = Game.National.defaultPrep(vA);
    const prepB = Game.National.defaultPrep(vB);
    prepA.coops = [];
    const camp = Game.National.newNationalCampaign(vA, prepA, seed32(v));
    const bid = cidOf(st, 1);
    camp.national.coverage[B.party] = prepB.coverage;
    camp.national.coops = [A, B].filter((P) => P.pact && seats(st, P.pact) > 0).map((P) => ({ partner: P.pact, type: 'unify', owner: P.party }));
    camp.national.leaders = { [A.party]: 0, [B.party]: 1 };
    camp.national.requirement = true;
    camp.national.noRequirement = [A, B].filter((P) => P.party === Game.NewParty.ID && !v.customParty.requirement).map((P) => P.party);
    // B の支持率は B から見た値で(SNSの好感度や党の勢い)
    const supB = Math.max(0.3, supportOf(st, 1) + ((Game.Balance.national.supportAdjust || {})[B.party] || 0));
    camp.partyShift[B.party] = supB - Game.Balance.parties[B.party].support;
    const capB = Game.National.capacity(supB);
    camp.humans = ['player', bid];
    camp.humanState = {
      player: { player: camp.player, sns: camp.sns, flags: flagsOf(st, 0) },   // camp.sns は create が A の SNS から作り、今日のトレンドも入っている
      [bid]: {
        player: { id: bid, money: Math.max(0, Game.National.prepCost(vB, prepB).remain), stamina: Game.Balance.campaign.staminaStart, fundUses: 0, broke: false, capacity: capB },
        sns: Game.Sns.create(B.sns), flags: flagsOf(st, 1),
      },
    };
    camp.humanState[bid].sns.trend = Object.assign({}, camp.humanState.player.sns.trend);
    if (camp.support) {
      camp.support.relations[bid] = Object.assign({}, B.support.relations);
      camp.support.pledges[bid] = B.pledges.slice();
    }
    C().activate(camp, 'player');
    camp.morning = null;
    st.campaign = camp;
    refreshPoll(st);
    st.election = null;
    v.plans = [[], []];
    v.reveal = { title: '公示', actions: [], lines: (lines || []).concat([`${camp.days}日間の選挙戦が始まった。毎日それぞれ2回ずつ行動を選び、同時に公開する。`]) };
    st.screen = 'vsReveal';
    v.cover = false;
    addLog(st, '総選挙の公示。');
  }

  // 2人が見る情勢:ふだんは誤差の大きい感触、情勢調査の日の翌朝は誤差の小さい調査
  function refreshPoll(st) {
    const camp = st.campaign;
    const B = Game.Balance.campaign;
    const polled = B.pollDays.includes(camp.day - 1);
    camp.vsPoll = { day: camp.day, polled, regions: C()._internal.takePoll(camp, polled ? B.pollNoise : B.feelNoise).regions };
  }
  // 議席の見込み(2人が見る情勢から)
  function projection(st) {
    return Game.National.project(st.campaign, st.campaign.vsPoll.regions);
  }

  // その人の手番の始まり:前の日・ターンの炎上があれば、まず対応を選ぶ
  function beginTurn(st, i) {
    const v = st.versus;
    const sns = snsOf(st, i);
    if (!v.flames[i] && sns.queue.length) v.flames[i] = Game.Sns.surface(sns, { money: moneyOf(st, i), unit: st.screen === 'vsGov' ? 'ターン' : '日' });
  }
  function snsOf(st, i) {
    return st.screen === 'vsPlan' && st.campaign ? st.campaign.humanState[cidOf(st, i)].sns : st.versus.players[i].sns;
  }
  function moneyOf(st, i) {
    return st.screen === 'vsPlan' && st.campaign ? st.campaign.humanState[cidOf(st, i)].player.money : st.versus.players[i].money;
  }
  function resolveFlame(st, i, choice) {
    const v = st.versus;
    const ev = v.flames[i];
    if (!ev) return null;
    const ch = ev.choices.find((c) => c.id === choice);
    if (!ch || ch.disabled) return null;
    const r = Game.Sns.resolveFlame(snsOf(st, i), ev, choice, () => rand(v));
    if (st.screen === 'vsPlan') {
      const camp = st.campaign;
      const h = camp.humanState[cidOf(st, i)];
      h.player.money = Math.max(0, h.player.money - r.money);
      if (r.momentum) C()._internal.gainMomentum(camp, cidOf(st, i), r.momentum);
    } else {
      v.players[i].money = Math.max(0, v.players[i].money - r.money);
    }
    v.flames[i] = null;
    return r.text;
  }

  // 選んだ行動を仮に当てはめた選挙戦の写しで、次に選べる行動を調べる(本当の効果は公開のときに出る)
  function campaignChoices(st, i) {
    const src = st.campaign;
    const camp = JSON.parse(JSON.stringify(src));
    const cid = cidOf(st, i);
    C().activate(camp, cid);
    for (const a of st.versus.plans[i]) {
      camp.actionsLeft = 1;
      C().doPlayerAction(camp, a.aid, a.target);
    }
    camp.actionsLeft = Game.Balance.campaign.actionsPerDay - st.versus.plans[i].length;
    return { actions: C().availableActions(camp), player: camp.player };
  }
  function addPlan(st, i, aid, target) {
    const v = st.versus;
    if (v.plans[i].length >= Game.Balance.campaign.actionsPerDay) return { ok: false, text: '今日の行動はもう選んだ' };
    const act = campaignChoices(st, i).actions.find((a) => a.id === aid);
    if (!act || !act.enabled) return { ok: false, text: act ? act.reason : 'その行動はできない' };
    v.plans[i].push({ aid, target: target || null });
    return { ok: true };
  }
  function removePlan(st, i, k) {
    st.versus.plans[i].splice(k, 1);
  }
  // その日の行動を決めた。2人そろったら公開して1日を進める
  function submitPlan(st, i) {
    const v = st.versus;
    if (i === 0) { v.turnOf = 1; v.cover = true; return null; }
    return resolveDay(st);
  }

  function actionLabel(aid, target) {
    const A = C().ACTIONS[aid];
    let t = '';
    if (A.target === 'region' && target) t = (Game.Data.BLOCKS.find((b) => b.id === target) || {}).name || '';
    if (A.target === 'org' && target) t = Game.Data.ORGANIZATIONS[target].name;
    if (A.target === 'post' && target) t = Game.Data.SNS_POST_TYPES[target].name;
    return `${A.icon} ${A.name}${t ? '(' + t + ')' : ''}`;
  }

  function resolveDay(st) {
    const v = st.versus;
    const camp = st.campaign;
    const ids = [cidOf(st, 0), cidOf(st, 1)];
    const tours = (i) => v.plans[i].filter((a) => a.aid === 'tour').map((a) => a.target);
    const clash = tours(0).filter((b) => tours(1).includes(b));
    const day = camp.day;
    const actions = [];
    const order = day % 2 ? [0, 1] : [1, 0];   // 先に動く人は日ごとに入れ替える
    for (let k = 0; k < Game.Balance.campaign.actionsPerDay; k++) {
      for (const i of order) {
        const a = v.plans[i][k];
        if (!a) continue;
        C().activate(camp, ids[i]);
        camp.actionsLeft = 1;
        const hit = a.aid === 'tour' && clash.includes(a.target);
        if (hit) camp.player.tempMult = VB().clashMult;
        const r = C().doPlayerAction(camp, a.aid, a.target);
        delete camp.player.tempMult;
        actions.push({ player: i, label: actionLabel(a.aid, a.target), text: r.ok ? r.text : `行動できなかった(${r.text})`, clash: hit });
      }
    }
    camp.actionsLeft = 0;
    C().activate(camp, ids[0]);
    C().endDay(camp);
    // トレンドは2人で同じものを見る
    camp.humanState[ids[1]].sns.trend = Object.assign({}, camp.humanState[ids[0]].sns.trend);
    refreshPoll(st);
    v.plans = [[], []];
    const m = camp.morning || {};
    const lines = (m.lines || []).slice();
    if (m.event) lines.unshift(`📰 ${m.event.title}:${m.event.text}`);
    if (clash.length) lines.unshift(`同じブロックで遊説がぶつかった(${clash.map((b) => Game.Data.BLOCKS.find((x) => x.id === b).name).join('・')})。どちらの効果も半分になった。`);
    v.reveal = { title: `${day}日目の結果`, actions, lines, rivals: m.rivals || [], final: !!camp.finished };
    st.screen = 'vsReveal';
    v.cover = false;
    return v.reveal;
  }

  // 公開の画面から次へ
  function afterReveal(st) {
    const v = st.versus;
    const camp = st.campaign;
    if (st.screen === 'vsReveal' && camp && camp.finished) return 'election';
    if (st.screen === 'vsReveal' && camp && camp.day === Game.Balance.campaign.debateDay && !camp.vsDebated) {
      camp.vsDebated = true;
      startDebate(st, 'campaign');
      return 'debate';
    }
    st.screen = st.screen === 'vsGovReveal' ? 'vsGov' : 'vsPlan';
    v.turnOf = 0;
    v.cover = true;
    return 'plan';
  }

  // ---------------- 2人の党首討論 ----------------
  // 選挙戦:議席の少ない党が追及、多い党が答弁。政権運営:野党が追及、首相が答弁
  function startDebate(st, ctx) {
    const v = st.versus;
    let ask;
    let ans;
    if (ctx === 'gov') { ans = v.gov.pm; ask = 1 - ans; }
    else { ask = seats(st, v.players[0].party) <= seats(st, v.players[1].party) ? 0 : 1; ans = 1 - ask; }
    const P = v.players;
    const topicPool = P[ans].pledges.length ? P[ans].pledges : Object.keys(Game.Data.POLICIES);
    v.debate = Game.Debate.startPvp({
      kind: 'leaders', topic: topicPool[Math.floor(rand(v) * topicPool.length)], seed: seed32(v),
      ask: { player: ask, name: `${P[ask].name}(${LD().partyInfo(P[ask].party).short})`, deck: P[ask].deck.ask },
      answer: { player: ans, name: `${P[ans].name}(${LD().partyInfo(P[ans].party).short})`, deck: P[ans].deck.answer },
    });
    v.debateCtx = ctx;
    v.debateTurn = 'ask';
    v.debateShow = null;
    v.spreadable = [];
    v.turnOf = ask;
    v.cover = true;
    st.screen = 'vsDebate';
  }
  // 手札を出す。両方そろったら公開(v.debateShow にそのやりとり)
  function debateChoose(st, index) {
    const v = st.versus;
    const d = v.debate;
    const k = v.debateTurn;
    const rec = Game.Debate.choosePvp(d, k, index);
    if (!rec) {
      v.debateTurn = k === 'ask' ? 'answer' : 'ask';
      v.turnOf = d.sides[v.debateTurn].player;
      v.cover = true;
      return null;
    }
    v.debateShow = rec;
    v.cover = false;
    if (rec.gaffe) {
      const who = d.sides[rec.gaffe].player;
      v.players[who].stats.gaffes++;
      if (!v.spreadable.includes(1 - who)) v.spreadable.push(1 - who);   // 相手は失言をSNSで拡散できる
      Game.Sns.startFlame(debateSns(st, who), 'gaffe', () => rand(v));
    }
    if (d.finished) finishDebate(st);
    return rec;
  }
  function debateSns(st, i) {
    return st.versus.debateCtx === 'campaign' ? st.campaign.humanState[cidOf(st, i)].sns : st.versus.players[i].sns;
  }
  // 次のやりとりへ(追及側から選ぶ)
  function debateNext(st) {
    const v = st.versus;
    v.debateShow = null;
    v.debateTurn = 'ask';
    v.turnOf = v.debate.sides.ask.player;
    v.cover = true;
  }
  function finishDebate(st) {
    const v = st.versus;
    const d = v.debate;
    const out = d.result.outcome;
    const ask = d.sides.ask.player;
    const ans = d.sides.answer.player;
    const lines = [];
    const winner = out === 'ask' ? ask : out === 'answer' ? ans : null;
    if (winner !== null) v.players[winner].stats.debatesWon++;
    if (v.debateCtx === 'campaign') {
      const camp = st.campaign;
      const B = VB().campaignDebate;
      if (winner !== null) {
        C()._internal.gainMomentum(camp, cidOf(st, winner), B.win);
        C()._internal.gainMomentum(camp, cidOf(st, 1 - winner), B.lose);
        lines.push(`${v.players[winner].name}の党に勢いがついた。`);
      }
    } else {
      const E = Game.Balance.debate.effects;
      const pmOut = out === 'answer' ? 'win' : out === 'ask' ? 'lose' : 'draw';
      const opOut = out === 'ask' ? 'win' : out === 'answer' ? 'lose' : 'draw';
      const dA = E.pm[pmOut].approval + E.opposition[opOut].approval + d.apologies * E.apologyApproval;
      st.world.approval = clamp(st.world.approval + dA, 5, 90);
      v.players[ans].supportBonus += E.pm[pmOut].support;
      v.players[ask].supportBonus += E.opposition[opOut].support;
      lines.push(`内閣支持率 ${dA >= 0 ? '+' : ''}${Math.round(dA * 10) / 10}`);
    }
    const head = winner === null ? `${d.sides.ask.name}と${d.sides.answer.name}、党首討論は互角` : `${v.players[winner].name}、党首討論で${v.players[1 - winner].name}を圧倒`;
    d.result.headline = head;
    d.result.lines = lines;
    d.result.winner = winner;
    addLog(st, `⚔ 党首討論:「${head}」`);
  }
  // 相手の失言をSNSで拡散する
  function spread(st, i) {
    const v = st.versus;
    if (!v.spreadable.includes(i)) return null;
    v.spreadable = v.spreadable.filter((x) => x !== i);
    const S = VB().spread;
    const target = debateSns(st, 1 - i);
    const mine = debateSns(st, i);
    Game.Sns.addFavor(target, -S.favor);
    Game.Sns.addBuzz(target, S.buzz);
    Game.Sns.addBuzz(mine, S.buzz);
    let text = `${v.players[i].name}陣営が${v.players[1 - i].name}の失言の動画を拡散した(相手の好感度 −${S.favor})。`;
    if (rand(v) < S.backlash) {
      Game.Sns.addFavor(mine, S.backlashFavor);
      text += `「揚げ足取りだ」という声も上がった(自分の好感度 ${S.backlashFavor})。`;
    }
    addLog(st, text);
    return text;
  }
  // 論戦を終えて元の流れへ
  function closeDebate(st) {
    const v = st.versus;
    const ctx = v.debateCtx;
    v.debate = null;
    v.debateCtx = null;
    v.spreadable = [];
    if (ctx === 'campaign') {
      st.screen = 'vsPlan';
      v.turnOf = 0;
      v.cover = true;
    } else {
      endGovTurn(st);
    }
  }

  // ---------------- 選挙のあと ----------------
  function afterElection(st) {
    const v = st.versus;
    const el = st.election;
    const camp = st.campaign;
    const w = st.world;
    const before = v.players.map((P) => seats(st, P.party));
    const parties = {};
    for (const id in el.seats) if (el.seats[id].total > 0 || w.parties[id]) parties[id] = { seats: el.seats[id].total };
    parties.indep = { seats: Math.max(0, Game.Data.HOUSE_SEATS - Object.values(parties).reduce((s, p) => s + p.seats, 0)) };
    w.parties = parties;
    w.termElapsed = 0;
    v.elections++;
    v.players.forEach((P, i) => {
      const h = camp.humanState[cidOf(st, i)];
      P.sns = Game.Sns.create(h.sns);
      P.money = Math.max(0, Math.round(h.player.money * 0.5));
      if (camp.support) P.support.relations = Object.assign({}, camp.support.relations[cidOf(st, i)]);
      P.stats.seats.push(seats(st, P.party));
      P.supportBonus = 0;
    });
    if (v.customParty) {
      const share = el.prShareNational[Game.NewParty.ID] || 0;
      v.customParty.mps = seats(st, Game.NewParty.ID);
      v.customParty.requirement = v.customParty.mps >= Game.Balance.newParty.requirement.mps || share >= Game.Balance.newParty.requirement.share;
      Game.NewParty.register(v.customParty);
    }
    Game.Sns.newTrend(v.players[0].sns, () => rand(v));   // 政権運営のトレンドは2人で同じ
    v.players[1].sns.trend = Object.assign({}, v.players[0].sns.trend);
    v.lastElection = { before, after: v.players.map((P) => seats(st, P.party)) };
    v.pendingElection = null;
    st.campaign = null;
    addLog(st, `🗳 総選挙:${v.players.map((P, i) => `${P.name}の党 ${v.lastElection.after[i]}議席(${before[i]})`).join('、')}`);
    st.screen = 'vsResult';
  }

  // 結果の画面から次へ:議席数で勝負なら決着、そうでなければ政権づくり
  function afterResult(st) {
    const v = st.versus;
    if (v.victory === 'seats') {
      const gain = v.players.map((P, i) => v.lastElection.after[i] - v.lastElection.before[i]);
      const w = gain[0] !== gain[1] ? (gain[0] > gain[1] ? 0 : 1) : v.lastElection.after[0] !== v.lastElection.after[1] ? (v.lastElection.after[0] > v.lastElection.after[1] ? 0 : 1) : null;
      return finish(st, w, v.players.map((P, i) => ({ label: '議席の増減', value: gain[i], seats: v.lastElection.after[i] })));
    }
    startFormation(st);
  }

  // ---------------- 政権づくり ----------------
  function startFormation(st) {
    const v = st.versus;
    const MAJ = Game.Data.MAJORITY;
    const w = st.world;
    const all = Object.keys(w.parties).filter((id) => id !== 'indep');
    const top = all.sort((a, b) => w.parties[b].seats - w.parties[a].seats)[0];
    v.formation = null;
    if (w.parties[top].seats >= MAJ) return setGov(st, top, [top]);
    const order = [0, 1].sort((a, b) => seats(st, v.players[b].party) - seats(st, v.players[a].party));
    v.formation = { order, step: 0, offer: null, notes: [] };
    v.turnOf = order[0];
    v.cover = true;
    st.screen = 'vsFormation';
  }
  // AI政党がその人と組んでくれるか
  function aiWilling(st, i, id) {
    const P = st.versus.players[i];
    return (P.trust[id] ?? VB().trust.start) >= VB().trust.min;
  }
  function formationOptions(st, i) {
    return aiOf(st).map((id) => ({ id, name: partyName(id), seats: seats(st, id), willing: aiWilling(st, i, id), trust: Math.round(st.versus.players[i].trust[id] ?? VB().trust.start) }));
  }
  // kind: 'rival'(相手プレイヤーと。AI政党も足せる)| 'ai' | 'pass'
  function propose(st, i, kind, ais) {
    const v = st.versus;
    const f = v.formation;
    const P = v.players[i];
    const MAJ = Game.Data.MAJORITY;
    ais = (ais || []).filter((id) => aiWilling(st, i, id));
    if (kind === 'pass') return nextFormation(st, `${P.name}は政権づくりを見送った。`);
    const coalition = [P.party].concat(ais).concat(kind === 'rival' ? [v.players[1 - i].party] : []);
    const total = coalition.reduce((s, id) => s + seats(st, id), 0);
    if (total < MAJ) return { ok: false, text: `過半数(${MAJ})に届かない(${total}議席)` };
    if (kind === 'rival') {
      f.offer = { from: i, ais, total };
      v.turnOf = 1 - i;
      v.cover = true;
      return { ok: true, text: `${v.players[1 - i].name}に連立を申し込んだ。` };
    }
    setGov(st, P.party, coalition);
    return { ok: true };
  }
  function answerOffer(st, accept) {
    const v = st.versus;
    const f = v.formation;
    const from = f.offer.from;
    if (accept) {
      setGov(st, v.players[from].party, [v.players[from].party, v.players[1 - from].party].concat(f.offer.ais));
      return { ok: true };
    }
    f.offer = null;
    return nextFormation(st, `${v.players[1 - from].name}は連立の申し込みを断った。`);
  }
  function nextFormation(st, note) {
    const v = st.versus;
    const f = v.formation;
    f.notes.push(note);
    addLog(st, note);
    f.step++;
    if (f.step >= 2) {
      // 2人とも組めなかった:第1党が少数与党で政権を担う
      const w = st.world;
      const top = Object.keys(w.parties).filter((id) => id !== 'indep').sort((a, b) => w.parties[b].seats - w.parties[a].seats)[0];
      setGov(st, top, [top]);
      return { ok: true, text: note };
    }
    v.turnOf = f.order[f.step];
    v.cover = true;
    return { ok: true, text: note };
  }

  function setGov(st, pmParty, coalition) {
    const v = st.versus;
    const idx = v.players.findIndex((P) => P.party === pmParty);
    const partnerIdx = v.players.findIndex((P, i) => i !== idx && coalition.includes(P.party));
    v.gov = { pm: idx >= 0 ? idx : null, pmParty, coalition: coalition.slice(), partner: partnerIdx >= 0 ? partnerIdx : null };
    // 選挙協力の約束:単独で過半数に届かず連立が要るのに、組んだ相手を外して政権を作ったら、約束を破ったことになる
    v.players.forEach((P, i) => {
      if (P.pact && v.gov.pm === i && seats(st, P.party) < Game.Data.MAJORITY && !coalition.includes(P.pact) && seats(st, P.pact) > 0) {
        P.trust[P.pact] = (P.trust[P.pact] ?? VB().trust.start) - VB().trust.breakPenalty;
        P.stats.brokenPacts++;
        addLog(st, `${P.name}は${partyName(P.pact)}との約束を破って政権を作った。${partyName(P.pact)}の信用を失った。`);
      }
      P.pact = null;
    });
    const pmName = v.gov.pm !== null ? v.players[v.gov.pm].name : `${partyName(pmParty)}の党首`;
    const MAJ = Game.Data.MAJORITY;
    const total = coalition.reduce((s, id) => s + seats(st, id), 0);
    v.gov.minority = total < MAJ;
    addLog(st, `🏛 ${pmName}が首相に。与党:${coalition.map(partyName).join('・')}(${total}議席${total < MAJ ? '・少数与党' : ''})`);
    v.formation = null;
    st.screen = 'vsGov';
    v.turnOf = 0;
    v.cover = true;
    v.plans = [[], []];
  }

  // ---------------- 政権運営 ----------------
  const GOV_ACTIONS = {
    bill:      { name: '重要法案を提出', icon: '📜', role: 'pm', desc: '成立すれば内閣支持率が上がる。少数与党だと通りにくい。' },
    diplomacy: { name: '外交・首脳会談', icon: '🌏', role: 'pm', desc: 'うまくいけば支持率が大きく上がる。' },
    dissolve:  { name: '衆議院を解散', icon: '⚡', role: 'pm', desc: 'このターンの終わりに総選挙になる。' },
    grill:     { name: '国会で追及', icon: '🔍', role: 'opposition', session: true, desc: '内閣支持率を下げ、党の存在感を示す。空振りすると逆効果。' },
    debate:    { name: '党首討論を求める', icon: '⚔', role: 'opposition', session: true, desc: '首相(相手プレイヤー)と2人の論戦をする。勝てば支持率が大きく動く。' },
    noConf:    { name: '内閣不信任案', icon: '🗳', role: 'opposition', desc: '少数与党なら通りやすい。可決されると総選挙。' },
    leave:     { name: '連立を離脱', icon: '🚪', role: 'partner', desc: '連立から抜けて野党になる。' },
    press:     { name: '記者会見', icon: '🎤', role: 'any', desc: '党の支持率が少し上がる(首相なら内閣支持率も)。失言のリスクあり。' },
    sns:       { name: 'SNS発信', icon: '📱', role: 'any', target: 'post', desc: '好感度は次の総選挙の票につながる。' },
    research:  { name: '政策調査', icon: '🔎', role: 'any', desc: '論戦の手札に★のカードが加わる。' },
    pact:      { name: '選挙協力の約束', icon: '🤝', role: 'any', target: 'ai', desc: '次の総選挙でAI政党と候補者を一本化する。選挙後に組まないと信用を失う。' },
    fund:      { name: '資金集め', icon: '💴', role: 'any', desc: '党の資金を集める。' },
  };
  function roleOf(st, i) {
    const g = st.versus.gov;
    if (!g) return 'opposition';
    if (g.pm === i) return 'pm';
    if (g.partner === i) return 'partner';
    return 'opposition';
  }
  function govActions(st, i) {
    const v = st.versus;
    const role = roleOf(st, i);
    const G = VB().gov;
    const P = v.players[i];
    const planned = v.plans[i].map((a) => a.aid);
    const spent = v.plans[i].reduce((s, a) => s + costOf(a.aid), 0);
    const open = Game.Data.SESSION_OPEN[st.world.turnIndex];
    return Object.keys(GOV_ACTIONS)
      .filter((id) => GOV_ACTIONS[id].role === 'any' || GOV_ACTIONS[id].role === role)
      .map((id) => {
        const a = Object.assign({ id }, GOV_ACTIONS[id]);
        a.money = costOf(id);
        let reason = '';
        if (v.plans[i].length >= Game.Balance.campaign.actionsPerDay) reason = 'もう2つ選んだ';
        else if (planned.includes(id)) reason = '選んである';
        else if (a.money > P.money - spent) reason = '資金が足りない';
        else if (a.session && !open) reason = '国会が閉会中';
        else if (id === 'debate' && v.gov.pm === null) reason = '首相がAIの党首';
        else if (id === 'pact' && P.pact) reason = `${partyName(P.pact)}と約束ずみ`;
        a.enabled = !reason;
        a.reason = reason;
        if (id === 'fund') a.gain = G.fundGain;
        return a;
      });
  }
  function costOf(id) {
    const G = VB().gov;
    return { bill: G.billMoney, diplomacy: G.diplomacyMoney, research: G.researchMoney }[id] || 0;
  }
  function addGovPlan(st, i, aid, target) {
    const a = govActions(st, i).find((x) => x.id === aid);
    if (!a || !a.enabled) return { ok: false, text: a ? a.reason : 'その行動はできない' };
    if (a.target === 'post' && !Game.Data.SNS_POST_TYPES[target]) return { ok: false, text: '投稿の種類を選んでください' };
    if (a.target === 'ai' && !aiOf(st).includes(target)) return { ok: false, text: '相手を選んでください' };
    st.versus.plans[i].push({ aid, target: target || null });
    return { ok: true };
  }
  function submitGov(st, i) {
    const v = st.versus;
    if (i === 0) { v.turnOf = 1; v.cover = true; return null; }
    return resolveGov(st);
  }

  function resolveGov(st) {
    const v = st.versus;
    const G = VB().gov;
    const w = st.world;
    const actions = [];
    let debateBy = null;
    for (let k = 0; k < 2; k++) {
      for (const i of [0, 1]) {
        const a = v.plans[i][k];
        if (!a) continue;
        const P = v.players[i];
        const O = GOV_ACTIONS[a.aid];
        let text = '';
        P.money -= costOf(a.aid);
        const appr = (d) => { w.approval = clamp(w.approval + d, 5, 90); return `内閣支持率 ${d >= 0 ? '+' : ''}${Math.round(d * 10) / 10}`; };
        if (a.aid === 'bill') {
          const chance = G.passBase * (v.gov.minority ? G.minorityMult : 1);
          if (rand(v) < chance) { P.stats.bills++; text = `重要法案が成立した。${appr(G.billWin)}`; }
          else text = `重要法案は成立しなかった。${appr(G.billLose)}`;
        } else if (a.aid === 'diplomacy') {
          text = `首脳会談に臨んだ。${appr(G.diplomacy[0] + rand(v) * (G.diplomacy[1] - G.diplomacy[0]))}`;
        } else if (a.aid === 'dissolve') {
          v.pendingElection = 'dissolve';
          text = '衆議院を解散した。総選挙になる。';
        } else if (a.aid === 'grill') {
          if (rand(v) < G.grillChance) { P.supportBonus += G.grillSupport; text = `予算委員会で政権を追い詰めた。${appr(G.grillWin)}`; }
          else { P.supportBonus -= G.grillSupport / 2; text = `追及は空振りに終わった。${appr(G.grillLose)}`; }
        } else if (a.aid === 'debate') {
          debateBy = i;
          text = '党首討論を求めた。';
        } else if (a.aid === 'noConf') {
          if (rand(v) < (v.gov.minority ? G.noConfMinority : G.noConfMajority)) { v.pendingElection = 'noConf'; text = '内閣不信任案が可決された!首相は解散を選んだ。'; }
          else text = '内閣不信任案は否決された。';
        } else if (a.aid === 'leave') {
          v.gov.coalition = v.gov.coalition.filter((id) => id !== P.party);
          v.gov.partner = null;
          v.gov.minority = v.gov.coalition.reduce((s, id) => s + seats(st, id), 0) < Game.Data.MAJORITY;
          text = `連立を離脱した。${v.gov.minority ? '政権は少数与党になった。' : ''}`;
        } else if (a.aid === 'press') {
          P.supportBonus += G.pressSupport;
          text = `記者会見を開いた。${roleOf(st, i) === 'pm' ? appr(G.pressApproval) : ''}`;
          if (rand(v) < G.pressGaffe) { Game.Sns.startFlame(P.sns, 'gaffe', () => rand(v)); text += ' ……失言があり、SNSで拡散され始めた。'; }
        } else if (a.aid === 'sns') {
          const custom = P.party === Game.NewParty.ID;
          text = Game.Sns.post(P.sns, a.target, () => rand(v), { pledges: P.pledges, newness: custom ? v.customParty.newness : 0 }).text;
        } else if (a.aid === 'research') {
          text = Game.Debate.research({ debateDeck: P.deck }, roleOf(st, i) === 'pm' ? 'answer' : 'ask', () => rand(v));
        } else if (a.aid === 'pact') {
          const other = v.players[1 - i];
          if (other.pact === a.target) text = `${partyName(a.target)}はすでに${other.name}の党と約束している。`;
          else if (!aiWilling(st, i, a.target)) text = `${partyName(a.target)}に断られた(信用が足りない)。`;
          else { P.pact = a.target; text = `${partyName(a.target)}と次の総選挙での選挙協力を約束した。`; }
        } else if (a.aid === 'fund') {
          P.money += G.fundGain;
          text = `資金パーティーを開いた。${G.fundGain}万円が集まった。`;
        }
        actions.push({ player: i, label: `${O.icon} ${O.name}`, text });
      }
    }
    v.plans = [[], []];
    v.reveal = { title: `${w.year}年 ${Game.Data.SESSIONS[w.turnIndex]}の結果`, actions, lines: [] };
    st.screen = 'vsGovReveal';
    v.cover = false;
    v.pendingDebate = debateBy !== null && v.gov.pm !== null && !v.pendingElection;
    return v.reveal;
  }

  // 政権運営の公開の画面から次へ:党首討論 → ターンの終わり
  function afterGovReveal(st) {
    const v = st.versus;
    if (v.pendingDebate) {
      v.pendingDebate = false;
      startDebate(st, 'gov');
      return 'debate';
    }
    return endGovTurn(st);
  }

  function endGovTurn(st) {
    const v = st.versus;
    const G = VB().gov;
    const w = st.world;
    const g = v.gov;
    // 内閣支持率:ゆらぎ、平均への戻り、長期政権の「飽き」
    const pmP = g && g.pm !== null ? v.players[g.pm] : null;
    const fatigue = pmP && pmP.stats.pmTurns >= G.fatigueFrom ? G.fatigue : 0;
    w.approval = clamp(w.approval + (rand(v) - 0.5) * 2 * G.drift + (G.mean - w.approval) * G.meanRevert - fatigue, 5, 90);
    if (g) w.partyShift[g.pmParty] = (w.approval - G.mean) * G.approvalToShift;
    if (pmP) {
      pmP.stats.pmTurns++;
      pmP.stats.approvalSum += w.approval;
      pmP.stats.approvalTurns++;
    }
    const lines = [];
    v.players.forEach((P) => {
      P.supportBonus *= G.supportDecay;
      P.money += Math.round(G.income + seats(st, P.party) * G.incomePerSeat);
      lines.push(...Game.Sns.tick(P.sns, 'turn'));
      Game.Sns.newTrend(P.sns, () => rand(v));
    });
    v.players[1].sns.trend = Object.assign({}, v.players[0].sns.trend);
    if (v.customParty) {
      v.customParty.newness = Math.max(0, v.customParty.newness - Game.Balance.newParty.newnessDecay);
      Game.NewParty.register(v.customParty);
    }
    v.turns++;
    w.turnIndex++;
    if (w.turnIndex >= Game.Balance.term.turnsPerYear) { w.turnIndex = 0; w.year++; }
    w.termElapsed++;
    // 勝負の判定
    const end = checkVictory(st);
    if (end) return 'end';
    if (v.pendingElection || w.termElapsed >= Game.Balance.term.termTurns) {
      const why = v.pendingElection === 'noConf' ? '内閣不信任案の可決による解散' : v.pendingElection === 'dissolve' ? '首相による解散' : '任期満了';
      addLog(st, `⚡ ${why}。総選挙へ。`);
      v.pendingElection = null;
      st.screen = 'vsPrep';
      v.turnOf = 0;
      v.cover = true;
      v.plans = [[], []];
      return 'election';
    }
    st.screen = 'vsGov';
    v.turnOf = 0;
    v.cover = true;
    v.turnLines = lines;
    return 'next';
  }

  // ---------------- 勝負の判定 ----------------
  function yearsPlayed(st) {
    return st.world.year - st.versus.startYear + st.world.turnIndex / 4;
  }
  function checkVictory(st) {
    const v = st.versus;
    const K = VB().victory;
    if (v.victory === 'govern') {
      const done = v.players.findIndex((P) => P.stats.pmTurns >= K.governTurns);
      if (done >= 0) return finish(st, done, scoreRows(st, 'govern'));
      if (yearsPlayed(st) >= K.governMaxYears) {
        const t = v.players.map((P) => P.stats.pmTurns);
        return finish(st, t[0] === t[1] ? null : t[0] > t[1] ? 0 : 1, scoreRows(st, 'govern'));
      }
    } else if (v.victory === 'legacy' && yearsPlayed(st) >= K.legacyYears) {
      const rows = scoreRows(st, 'legacy');
      return finish(st, rows[0].total === rows[1].total ? null : rows[0].total > rows[1].total ? 0 : 1, rows);
    }
    return null;
  }
  // レガシー評価(対戦モード版)。govern のときは首相の在任期間だけを見る
  function scoreRows(st, kind) {
    const v = st.versus;
    const L = VB().legacy;
    return v.players.map((P) => {
      const s = P.stats;
      const pmYears = s.pmTurns / 4;
      if (kind === 'govern') return { label: '首相の在任', value: `${pmYears.toFixed(2)}年`, total: s.pmTurns };
      const avg = s.approvalTurns ? s.approvalSum / s.approvalTurns : 0;
      const items = [
        ['首相の在任', `${pmYears.toFixed(1)}年`, Math.min(L.pmMax, pmYears * L.pmYear)],
        ['平均内閣支持率', s.approvalTurns ? `${Math.round(avg)}%` : '—', s.approvalTurns ? clamp((avg - L.approvalFrom) * L.approvalPer, 0, L.approvalMax) : 0],
        ['成立した法案', `${s.bills}本`, Math.min(L.billMax, s.bills * L.bill)],
        ['いまの議席', `${seats(st, P.party)}`, (seats(st, P.party) / Game.Data.HOUSE_SEATS) * L.seatShare],
        ['党首討論の勝ち', `${s.debatesWon}回`, s.debatesWon * L.debate],
        ['失言', `${s.gaffes}回`, s.gaffes * L.gaffe],
        ['破った約束', `${s.brokenPacts}回`, s.brokenPacts * L.broken],
      ].map(([label, value, points]) => ({ label, value, points: Math.round(points * 10) / 10 }));
      return { items, total: Math.round(items.reduce((a, b) => a + b.points, 0)) };
    });
  }
  function finish(st, winner, rows) {
    const v = st.versus;
    v.winner = winner;
    v.scores = rows;
    st.screen = 'vsEnd';
    v.cover = false;
    addLog(st, winner === null ? '🏁 引き分け' : `🏁 ${v.players[winner].name}の勝ち`);
    return true;
  }

  return {
    GOV_ACTIONS, start, view, supportOf, seats, partyName, aiOf, pactOptions, submitPrep,
    cidOf, projection, beginTurn, resolveFlame, campaignChoices, addPlan, removePlan, submitPlan, afterReveal, actionLabel,
    debateChoose, debateNext, spread, closeDebate,
    afterElection, afterResult, formationOptions, propose, answerOffer,
    roleOf, govActions, addGovPlan, submitGov, afterGovReveal, scoreRows, yearsPlayed,
  };
})();
