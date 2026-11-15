// バランス確認用の自動プレイ。ゲーム本体からは読み込まない。
//   node tools/autoplay.js 300                        最初の選挙で議席を得る割合(党ごと・ボットごと)
//   BOTS=中級 PARTIES=minsei node tools/autoplay.js 500
//   CAREER=1 ELECTIONS=6 node tools/autoplay.js 200   任期をはさんで選挙をくり返す(議席、役職、党首、評価の分布)
//   CAREER=1 TERMBOT=放置 node tools/autoplay.js 200   任期で約束に手をつけないボット
//   NATION=1 node tools/autoplay.js 200               党首として戦う総選挙(各党の議席、過半数・第1党の割合)
//   VERSUS=1 node tools/autoplay.js 300               対戦モード(2人ともボット。BOTS=中級,上級 で 1P と 2P のボット。党の組み合わせごとに 1P・2P・AI の勝ち)
//   URA=1 で資金のカードの収入を載せない(裏金。R9)、DIRTY=1 で買収を黙認し怪文書に反撃する(選挙違反。R10)。立会人は上級ボットが送る
//   SURGE=1 node tools/autoplay.js 300                最初の選挙で、奔流の起きた割合・投票率・だれが勝ったか(R15)
//   CAREER=1 NEWPARTY=1 node tools/autoplay.js 200     当選2回で党を割り、合流の誘いは受ける(NEWPARTY=stay は断る、race は党首選に敗れたときだけ割る)(R16)
//   SEATS=all node tools/autoplay.js 300              選挙区ごとに(SEATS=touou7,biyou2 のように選べる。ないときは北陽3区だけ)
//   node tools/autoplay.js 300 "B.playerRoles.newcomer=0.7;"   ファイルを変えずに数値を試す(B は Game.Balance)
//     ※ 推薦・破った約束のカードの数値(B.comeback.endorse / curse)は読み込み時に写すので、ここからは変えられない
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
['js/data/balance.js', 'js/data/district.js', 'js/data/seats.js', 'js/data/nation.js', 'js/data/cards.js', 'js/engine/rng.js', 'js/engine/scandal.js', 'js/engine/campaign.js', 'js/engine/vote.js', 'js/engine/government.js', 'js/data/future.js', 'js/engine/future.js', 'js/engine/upper.js', 'js/engine/career.js', 'js/engine/versus.js', 'js/data/achievements.js', 'js/engine/hall.js'].forEach((f) => {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f });
});
const Game = sandbox.Game;
const B = Game.Balance;
// 資金のカードの記載(R9):ボットは URA=1 なら載せない、それ以外は正直に記載する
['Campaign', 'Career'].forEach((k) => {
  const play = Game[k].play;
  Game[k].play = (state, uid, target, opt) => play(state, uid, target, opt || (process.env.URA ? 'hide' : 'honest'));
});
const ethics = { found: 0, resigned: 0, voided: 0, stolen: 0, caught: 0, by: 0, byWon: 0, redistrict: 0, moved: 0, upper: 0, upperWon: 0, twist: 0, pmUpper: 0, windUp: 0, windDown: 0 };
const N = +process.argv[2] || 200;
if (process.argv[3]) vm.runInContext('(function(B){' + process.argv[3] + '})(Game.Balance)', sandbox);

// いまの舞台(選挙区か全国)の地区
const regs = () => Game.Data.DISTRICT.regions;
const votersAll = () => regs().reduce((a, r) => a + r.voters, 0);
const turnoutOf = (r) => (Game.Data.DISTRICT.national ? B.nation.turnout : Game.Campaign.turnoutOf(r.id));
// カードを地区で使ったときの値打ち(全体での伸び)。useTurnout なら投票率も見る
function worth(camp, id, regionId, useTurnout) {
  const list = Game.Campaign.isTarget(id) ? [Game.Data.REGION[regionId]] : regs();
  const total = votersAll();
  let v = 0;
  list.forEach((r) => {
    const w = useTurnout ? r.voters * turnoutOf(r) / 55 : r.voters;
    v += Game.Campaign.cardGain(camp, id, r.id) * w / total;
  });
  return v;
}

// ---- 選挙戦のボット ----
const BOTS = {
  // でたらめに出す
  ランダム(state, rnd) {
    const camp = state.camp, regions = regs();
    for (let guard = 0; guard < 10; guard++) {
      const ok = camp.hand.filter((c) => Game.Campaign.canPlay(camp, c.id).ok);
      if (!ok.length || rnd() < 0.15) break;
      const c = ok[Math.floor(rnd() * ok.length)];
      Game.Campaign.play(state, c.uid, regions[Math.floor(rnd() * regions.length)].id);
    }
  },
  // 目の前でいちばん伸びる手を選ぶ(相手の動きは見ない)
  中級(state) { greedy(state, false); },
  // 相手の予告を見て、先回りと固い票も使う。投票率の低い地区を割り引く
  上級(state) { greedy(state, true); },
};
function greedy(state, smart) {
  const camp = state.camp, regions = regs(), total = votersAll();
  const threat = {};
  camp.intents.forEach((it) => { threat[it.region] = (threat[it.region] || 0) + it.gain * Game.Data.REGION[it.region].voters / total; });
  for (let guard = 0; guard < 10; guard++) {
    let best = null;
    camp.hand.forEach((c) => {
      if (!Game.Campaign.canPlay(camp, c.id).ok) return;
      const b = B.cards[c.id];
      if (b.promise && camp.promises.length >= B.campaign.promiseFree) return;
      if (b.curse) { if (camp.day <= 5 && (!best || best.v < 0.5)) best = { c, v: 0.5 }; return; }   // 早いうちに謝って取り除く
      if (b.money < 0) { if (camp.money < (smart ? 30 : 25)) best = best && best.v > 5 ? best : { c, v: 5 }; return; }
      (Game.Campaign.isTarget(c.id) ? regions : [regions[0]]).forEach((r) => {
        let v = worth(camp, c.id, r.id, smart);
        if (smart && b.block && !camp.blocked[r.id]) v += threat[r.id] || 0;
        if (smart && b.shield && !camp.blocked[r.id] && !(camp.shields[r.id] > 0)) v += (threat[r.id] || 0) * B.campaign.shieldBlock + 0.15;
        v /= (b.cost || 0.4);
        if (v > 0 && (!best || v > best.v)) best = { c, r: r.id, v };
      });
    });
    if (!best) break;
    Game.Campaign.play(state, best.c.uid, best.r);
  }
}

// ---- 任期のボット ----
const TERM_BOTS = {
  // 約束を先に果たし、残りで党の仕事と地元回り
  まじめ(state) { termPlay(state, true); },
  // 約束には手をつけず、地元だけを回る
  放置(state) { termPlay(state, false); },
};
function termPlay(state, keep) {
  const cr = state.career, T = B.term, regions = regs(), total = votersAll();
  for (let guard = 0; guard < 10; guard++) {
    let best = null;
    cr.hand.forEach((c) => {
      if (!Game.Career.canPlay(cr, c.id).ok) return;
      const b = T.cards[c.id], kind = Game.Career.targetKind(cr, c.id);
      let v = 0, target = null;
      if (kind === 'promise') {
        if (!keep) return;
        const p = cr.promises.slice().sort((x, y) => y.progress - x.progress)[0];
        target = p.id; v = 10 / b.cost;
      } else if (kind === 'region') {
        const r = regions.slice().sort((x, y) => (Game.Career.baseGain(cr, c.id, y.id) * y.voters) - (Game.Career.baseGain(cr, c.id, x.id) * x.voters))[0];
        target = r.id; v = Game.Career.baseGain(cr, c.id, r.id) * r.voters / total / b.cost;
      } else if (b.grumble) {
        v = 0.6;                                                         // 党内の不満は、なだめて消す
      } else if (b.promise && b.idle) {
        v = b.idle * 0.5 / b.cost;                                       // 公約がなければ、支持率のために
      } else if (b.sat) {
        v = cr.gov.sat < 50 ? 4 : 0.1;                                   // 連立相手の満足度が下がってきたら
      } else if (b.approval) {
        v = Math.abs(b.approval) * 0.5 / b.cost;
      } else if (b.money < 0) {
        v = cr.money < 20 ? 3 : 0.05;
      } else if (b.baseAll) {
        v = regions.reduce((a, r) => a + Game.Career.baseGain(cr, c.id, r.id) * r.voters / total, 0) / b.cost;
      } else {
        v = cr.leader || Game.Career.extraStars(cr) < B.comeback.starExtraMax ? 0.45 : 0.01;   // 党への貢献
      }
      if (cr.leader && (kind === 'region' || b.baseAll)) v *= 0.2;   // 党首は地元より党
      if (v > 0 && (!best || v > best.v)) best = { c, target, v };
    });
    if (!best) break;
    Game.Career.play(state, best.c.uid, best.target);
  }
}

function playCampaign(state, botName, rnd) {
  for (let guard = 0; guard < 40 && state.screen === 'campaign'; guard++) {
    const camp = state.camp;
    if (botName === '上級' && camp.day === 1 && !camp.vs && Game.Scandal.risk() >= 0.5) Game.Scandal.sendWitness(state);   // 違反の多い選挙区では立会人を送る
    while (camp.pending.length) {
      const p = camp.pending[0];
      if (p.type === 'debate') Game.Campaign.chooseDebate(state, botName === '上級' ? 'local' : 'policy');
      else if (p.type === 'fraud') Game.Scandal.answerFraud(state, p.kind === 'bribe' ? (process.env.DIRTY ? 'accept' : 'refuse') : (process.env.DIRTY ? 'fight' : 'fair'));
      else { if (p.id === 'slush') ethics.found++; Game.Campaign.dismiss(state); }
    }
    BOTS[botName](state, rnd);
    Game.Campaign.endDay(state);
  }
}
// 対戦モード:手番の人のボットが動き、交代をくり返す(ボットは手番の視点 'me' で動くので、1人用と同じものが使える)
function playVersus(state, bots, rnd) {
  for (let guard = 0; guard < 80 && state.screen === 'campaign'; guard++) {
    const camp = state.camp;
    if (camp.vs.handoff) Game.Versus.beginTurn(state);
    while (camp.pending.length) {
      if (camp.pending[0].type === 'debate') Game.Campaign.chooseDebate(state, bots[camp.vs.active] === '上級' ? 'local' : 'policy');
      else Game.Campaign.dismiss(state);
    }
    BOTS[bots[camp.vs.active]](state, rnd);
    Game.Versus.endTurn(state);
  }
}
// 任期を解散まで進める。党首選は RACE(unity / reform / deal / skip。省くと unity)で立候補する
function playTerm(state, termBot) {
  const cr = state.career;
  let turns = 0;
  for (let guard = 0; guard < 40; guard++) {
    while (cr.pending.length && cr.pending[0].type !== 'dissolve' && state.screen === 'term') {
      const p = cr.pending[0], t = p.type;
      if (t === 'petition') Game.Career.respond(state, termBot === 'まじめ' && cr.promises.length < 2 && cr.turn <= 4);
      else if (t === 'leaderRace') { stats.races++; Game.Career.runRace(state, process.env.RACE || 'unity'); if (cr.leader) stats.raceWins++; }
      else if (t === 'slush') Game.Scandal.answerSlush(state, !!process.env.FIX);   // FIX=1 なら訂正して返す
      else if (t === 'byElection') { ethics.by++; if (Game.Career.answerBy(state, true).won) ethics.byWon++; }
      else if (t === 'budget') {   // 予算編成(R14):BUDGET=defense などで決め打ち、ないときは順ぐりに
        const want = process.env.BUDGET;
        let pickB = want && p.options.indexOf(want) >= 0 ? want : p.options[cr.turn % p.options.length];
        if (want === 'smart') {   // いちばん下がりそうな指標を支える重点を選ぶ(30年後の見込みで)
          const FB = B.future, y = Game.Future.year(state) + FB.horizon;
          const worst = Game.Data.INDICATOR_ORDER.slice().sort((a, b) => (Game.Future.value(state, a, y) - FB.start[a]) - (Game.Future.value(state, b, y) - FB.start[b]))[0];
          pickB = p.options.slice().sort((a, b) => (FB.budget[b].long[worst] || 0) - (FB.budget[a].long[worst] || 0))[0];
        }
        Game.Future.answerBudget(state, pickB);
      }
      // 新党(R16):NEWPARTY=1 なら党を割り、合流の誘いは受ける(NEWPARTY=stay なら断る)。解党のときは、その選挙区でいちばん強い党へ
      else if (t === 'npOffer') Game.Career.answerNp(state, process.env.NEWPARTY ? 'found' : 'stay', 0);
      else if (t === 'npMerge') { npStats.offers++; const yes = process.env.NEWPARTY !== 'stay'; if (yes) npStats.merges++; Game.Career.answerNp(state, yes); }
      else if (t === 'npDissolve') { npStats.dissolved++; const seat = state.player.seat || 'hokuyo3'; const to = Object.keys(Game.Data.PARTIES).sort((a, b) => B.seats[seat].guide[b] - B.seats[seat].guide[a])[0]; Game.Career.answerNp(state, to); }
      else if (t === 'npResult') { npStats.results++; npStats.seats += p.last.seats; npStats.me += p.last.me ? 1 : 0; Game.Career.answerNp(state); }
      else if (t === 'redistrict') { ethics.redistrict++; Game.Career.answerRedistrict(state, 'race'); }
      else if (t === 'upperElection') {   // 参院選(R12):党首は UPPER(tour / manifesto / none。省くと tour)、議員は応援
        const r = Game.Upper.run(state, cr.leader ? (process.env.UPPER || 'tour') : 'support');
        ethics.upper++; ethics.upperWon += r.won[state.player.party] || 0;
        if (cr.gov && cr.gov.role === 'pm') { ethics.pmUpper++; if (r.twisted) ethics.twist++; }
        if (r.wind > 0) ethics.windUp++; else if (r.wind < 0) ethics.windDown++;
        Game.Career.dismiss(state);
      }
      else if (t === 'moveSeat') {   // 国替え:いちばん勝ちやすい選挙区へ
        ethics.moved++;
        const gp = cr.np ? cr.np.from : state.player.party;
        const best = Game.Scandal.movableSeats(state).sort((a, b) => B.seats[b].guide[gp] - B.seats[a].guide[gp])[0];
        Game.Career.chooseSeat(state, best);
      } else {
        if (/裏金/.test(p.title || '')) { ethics.found++; if (p.retire) ethics.resigned++; }
        if (/連座制/.test(p.title || '')) ethics.voided++;
        Game.Career.dismiss(state);
      }
    }
    if (state.screen !== 'term' || cr.pending.length) break;
    if (process.env.NEWPARTY && process.env.NEWPARTY !== 'race' && !cr.npFounded && Game.Career.canFound(state)) { Game.Career.foundParty(state, 0); npStats.founded++; }   // 当選2回で党を割る(NEWPARTY=race なら、党首選に敗れたときだけ)
    TERM_BOTS[termBot](state);
    turns += 1;
    if (Game.Career.canDissolve(cr) && cr.turn >= 4 && cr.gov.approval >= 55 && !cr.promises.length) { Game.Career.dissolve(state); break; }
    const r = Game.Career.endTurn(state);
    if (r.ended) break;   // 退陣
  }
  return turns;
}
const stats = { races: 0, raceWins: 0 };
const npStats = { founded: 0, results: 0, seats: 0, me: 0, offers: 0, merges: 0, dissolved: 0 };   // 新党(R16)
let curSeat = 'hokuyo3';
function newState(party, seed) {
  Game.Data.setHome(curSeat);
  return { version: 2, screen: 'campaign', player: { name: '自動 太郎', party, seat: curSeat }, rng: seed };
}
function botRnd(seed) {
  let x = seed ^ 0x9e3779b9;
  return () => { x = (x * 1664525 + 1013904223) | 0; return (x >>> 0) / 4294967296; };   // ボットの気まぐれ用(ゲームの乱数とは別)
}
const pct = (a, b) => (b ? (a / b * 100).toFixed(0) : '—') + '%';
const parties = (process.env.PARTIES || 'minsei,kyowa,mirai').split(',');
const seatList = process.env.SEATS === 'all' ? Game.Data.SEAT_ORDER : (process.env.SEATS || 'hokuyo3').split(',');

seatList.forEach((seat) => {
curSeat = seat;
if (seatList.length > 1 || seat !== 'hokuyo3') console.log(`
== ${Game.Data.SEATS[seat].name}(${Game.Data.SEATS[seat].type})==`);
if (process.env.VERSUS) {
  // ---- 対戦モード(1回の選挙)----
  const bots = (process.env.BOTS || '中級,中級').split(',');
  console.log(`各 ${N} 回。1P(${bots[0]})と 2P(${bots[1] || bots[0]})。ハンデ${process.env.NOHANDI ? 'なし' : 'あり'}。対戦の勝ち(2人のうち票の多いほう)/ 議席を取った人 / 2人の得票率の差の平均(1P − 2P)`);
  const P = Object.keys(Game.Data.PARTIES);
  P.forEach((a) => P.forEach((b) => {
    if (a === b) return;
    const win = [0, 0], seat = [0, 0, 0]; let gap = 0;
    for (let i = 0; i < N; i++) {
      const seed = (i + 1) * 7919 + a.length * 104729 + b.length * 31;
      const state = { version: 2, screen: 'campaign', player: { name: '1P 太郎', party: a, seat: curSeat }, rng: seed };
      Game.Versus.newMatch(state, { seat: curSeat, offset: i % 2, handicap: !process.env.NOHANDI, players: [{ name: '1P 太郎', party: a }, { name: '2P 花子', party: b }] });
      playVersus(state, [bots[0], bots[1] || bots[0]], botRnd(seed));
      const o = Game.Versus.outcome(state), e = state.election;
      win[o.slot]++; seat[o.seat >= 0 ? o.seat : 2]++;
      gap += (e.totals.me - e.totals.vs) / e.total * 100;
    }
    const ai = Game.Data.PARTIES[P.filter((k) => k !== a && k !== b)[0]].short;
    console.log(`${Game.Data.PARTIES[a].short}(1P)対 ${Game.Data.PARTIES[b].short}(2P):対戦の勝ち 1P ${pct(win[0], N)}・2P ${pct(win[1], N)}  議席 1P ${pct(seat[0], N)}・2P ${pct(seat[1], N)}・AI(${ai})${pct(seat[2], N)}  得票率の差 ${(gap / N).toFixed(1)}`);
  }));
} else if (process.env.NATION) {
  // ---- 党首として戦う総選挙(1回)----
  const bots = (process.env.BOTS || 'ランダム,中級,上級').split(',');
  console.log(`各 ${N} 回。党首として戦う総選挙:自分の党の議席(平均と幅)/ 相手の党の平均 / 単独過半数・第1党の割合 / 党首を辞める割合`);
  parties.forEach((p) => {
    bots.forEach((b) => {
      const sum = {}, roles = {}; let maj = 0, first = 0, resign = 0; const mine = [];
      const sgN = {}, sgS = {}, noN = {}, noS = {};   // 奔流(R15):対象の党の議席(奔流のとき / ないとき)
      for (let i = 0; i < N; i++) {
        const seed = (i + 1) * 7919 + p.length * 104729;
        const state = newState(p, seed);
        Game.Career.quickLeader(state);
        Game.Campaign.newCampaign(state);
        playCampaign(state, b, botRnd(seed));
        const e = state.election;
        state.camp.cands.forEach((c) => { sum[c.party] = (sum[c.party] || 0) + e.seats[c.id]; });
        mine.push(e.seats.me); maj += e.meMajority ? 1 : 0; first += e.won ? 1 : 0;
        state.camp.cands.forEach((c) => { const on = e.surge && e.surge.target === c.id, N1 = on ? sgN : noN, S1 = on ? sgS : noS; N1[c.party] = (N1[c.party] || 0) + 1; S1[c.party] = (S1[c.party] || 0) + e.seats[c.id]; });
        Game.Career.afterElection(state);
        if (state.screen === 'ending') resign++;
        roles[state.career.gov.role] = (roles[state.career.gov.role] || 0) + 1;
      }
      mine.sort((x, y) => x - y);
      const others = Object.keys(sum).filter((k) => k !== p).map((k) => Game.Data.PARTIES[k].short + ' ' + (sum[k] / N).toFixed(0)).join('・');
      if (process.env.SURGE) console.log(`      奔流 ${Object.keys(sgN).map((k) => Game.Data.PARTIES[k].short + ' ' + sgN[k] + '回 平均 ' + (sgS[k] / sgN[k]).toFixed(0) + '議席(ないとき ' + (noS[k] / noN[k]).toFixed(0) + ')').join('・')}`);
      console.log(`${Game.Data.PARTIES[p].short} ${b.padEnd(4, ' ')} ${(sum[p] / N).toFixed(0).padStart(3)}議席(${mine[Math.floor(N * 0.1)]}〜${mine[Math.floor(N * 0.9)]})  相手 ${others}  過半数 ${pct(maj, N)}  第1党 ${pct(first, N)}  首相 ${pct(roles.pm || 0, N)}・連立与党 ${pct(roles.junior || 0, N)}・野党 ${pct(roles.opposition || 0, N)}  辞任 ${pct(resign, N)}`);
    });
  });
} else if (process.env.CAREER) {
  // ---- 任期をはさんで選挙をくり返す ----
  const E = +process.env.ELECTIONS || 5;
  const bot = process.env.BOTS || '中級';
  const termBot = process.env.TERMBOT || 'まじめ';
  console.log(`各 ${N} 人 × 選挙 ${E} 回(選挙戦:${bot}、任期:${termBot})。議席 = 小選挙区の当選 + 比例復活`);
  parties.forEach((p) => {
    const seat = Array(E).fill(0), dist = Array(E).fill(0);
    const ranks = B.ranks.map(() => 0), grades = {};
    let inc = 0, incSeat = 0, out = 0, outSeat = 0, kept = 0, broken = 0, light = 0, carried = 0, turns = 0, terms = 0, base = 0, stars = 0, dropped = 0, score = 0;
    let natN = 0, natSeats = 0, natMaj = 0, resigned = 0, pmEver = 0, pmTurns = 0, ousted = 0;
    const ach = {};   // 1回の歩みで達成した実績(セーブデータをまたぐものは数えない)
    const papers = { tone: {}, delta: {}, decisions: 0, heads: {} };   // 30年後の新聞(R14)
    stats.races = 0; stats.raceWins = 0;
    Object.keys(npStats).forEach((k) => { npStats[k] = 0; }); let npPM = 0, npEnd = 0;
    for (let i = 0; i < N; i++) {
      const seed = (i + 1) * 7919 + p.length * 104729;
      const state = newState(p, seed);
      const rnd = botRnd(seed);
      Game.Campaign.newCampaign(state);
      for (let e = 0; e < E; e++) {
        const role = state.camp.cands[0].role;
        playCampaign(state, bot, rnd);
        const el = state.election;
        if (el.national) {
          natN++; natSeats += el.seats.me; natMaj += el.meMajority ? 1 : 0; seat[e]++; dist[e]++;
        } else {
          const got = Game.Career.seated(el);
          seat[e] += got ? 1 : 0; dist[e] += el.won ? 1 : 0;
          if (e > 0) { if (role === 'incumbent' || role === 'revived') { inc++; incSeat += got ? 1 : 0; } else { out++; outSeat += got ? 1 : 0; } }
        }
        Game.Career.afterElection(state);
        if (state.screen === 'ending') { if (state.ending.reason === 'resigned') resigned++; else dropped++; break; }
        if (e === E - 1) break;
        turns += playTerm(state, termBot); terms++;
        if (state.screen === 'ending') { if (state.ending.reason === 'ousted') ousted++; break; }   // 支持率の低迷で退陣(裏金で辞職も、ここで終わる)
        const nx = state.career.next;
        kept += nx.endorse.length; broken += nx.broken.length; light += nx.light.length; carried += nx.carried.length;
        base += Game.Data.ARENAS[curSeat].regions.reduce((a, r) => a + (state.career.base[r.id] || 0), 0); stars += Game.Career.extraStars(state.career);
        Game.Career.toCampaign(state);
      }
      const end = state.ending || Game.Career.retire(state, 'retire');
      ranks[state.career.bestRank || 0]++; grades[end.grade] = (grades[end.grade] || 0) + 1; score += end.score;
      Game.Hall.earned(Game.Hall.facts(state), Game.Hall.empty()).forEach((id) => { ach[id] = (ach[id] || 0) + 1; });
      const pp = end.paper;
      if (pp) {
        papers.tone[pp.tone] = (papers.tone[pp.tone] || 0) + 1; papers.decisions += pp.column.count; papers.heads[pp.headline] = 1;
        Object.keys(pp.ind).forEach((k) => { papers.delta[k] = (papers.delta[k] || 0) + pp.ind[k].delta; });
      }
      if (state.career.wasPM) { pmEver++; pmTurns += state.career.pmTurns || 0; }
      if (state.career.npPast && state.career.wasPM) npPM++;
      if (state.career.np) npEnd++;
    }
    console.log(`${Game.Data.PARTIES[p].short}: 回ごとの議席 ${seat.map((w) => pct(w, N)).join(' / ')}(うち小選挙区 ${dist.map((w) => pct(w, N)).join(' / ')})`);
    console.log(`      現職が議席を守る ${pct(incSeat, inc)}  落選からの返り咲き ${pct(outSeat, out)}  公認を失って引退 ${pct(dropped, N)}  任期の平均 ${(turns / terms).toFixed(1)}会期`);
    console.log(`      1任期あたり:守った ${(kept / terms).toFixed(2)}  途中まで ${(light / terms).toFixed(2)}  破った ${(broken / terms).toFixed(2)}  持ち越し ${(carried / terms).toFixed(2)}  地盤の合計 ${(base / terms).toFixed(1)}  応援の追加 ${(stars / terms).toFixed(2)}`);
    console.log(`      到達した役職 ${B.ranks.map((r, k) => r.name + ' ' + pct(ranks[k], N)).join(' / ')}  評価 ${['S', 'A', 'B', 'C', 'D'].map((g) => g + ' ' + pct(grades[g] || 0, N)).join(' ')}(平均 ${(score / N).toFixed(0)}点)`);
    if (process.env.NEWPARTY) console.log(`      新党:結党 ${npStats.founded}回  新党で戦った選挙 ${npStats.results}回(自分が議席 ${pct(npStats.me, npStats.results)}・党の議席 平均 ${npStats.results ? (npStats.seats / npStats.results).toFixed(1) : '—'})  合流の誘い ${npStats.offers}回・合流 ${npStats.merges}回  解党 ${npStats.dissolved}回  新党のまま引退 ${pct(npEnd, N)}  合流して首相 ${pct(npPM, N)}`);
    console.log(`      党首選 ${stats.races}回のうち勝ち ${pct(stats.raceWins, stats.races)}  党首としての総選挙 ${natN}回:平均 ${natN ? (natSeats / natN).toFixed(0) : '—'}議席・過半数 ${pct(natMaj, natN)}  議席を減らして辞任 ${pct(resigned, N)}`);
    console.log(`      首相になった ${pct(pmEver, N)}(平均の在任 ${pmEver ? (pmTurns / pmEver / 2).toFixed(1) : '—'}年)  支持率の低迷で退陣 ${pct(ousted, N)}`);
    console.log(`      参院選 ${ethics.upper}回(自分の党の改選の平均 ${ethics.upper ? (ethics.upperWon / ethics.upper).toFixed(1) : '—'}議席、次の衆院選に追い風 ${pct(ethics.windUp, ethics.upper)}・逆風 ${pct(ethics.windDown, ethics.upper)})  首相のときの参院選 ${ethics.pmUpper}回のうち、ねじれ ${pct(ethics.twist, ethics.pmUpper)}`);
    console.log(`      政治とカネ・選挙違反:裏金の発覚 ${ethics.found}回(うち辞職 ${ethics.resigned})・連座制で当選無効 ${ethics.voided}・補欠選挙 ${ethics.by}回(勝ち ${ethics.byWon})・区割り改定 ${ethics.redistrict}回・国替え ${ethics.moved}回`);
    Object.keys(ethics).forEach((k) => { ethics[k] = 0; });
    console.log(`      30年後の新聞:良い ${pct(papers.tone.good || 0, N)}・悪い ${pct(papers.tone.bad || 0, N)}・まだら ${pct(papers.tone.mixed || 0, N)}・変化なし ${pct(papers.tone.quiet || 0, N)}  見出しの種類 ${Object.keys(papers.heads).length}  決定の数 平均 ${(papers.decisions / N).toFixed(1)}  指標の動き ${Game.Data.INDICATOR_ORDER.map((k) => Game.Data.INDICATORS[k].short + ' ' + ((papers.delta[k] || 0) / N).toFixed(1)).join(' ')}`);
    console.log(`      実績 ${Game.Data.ACHIEVEMENTS.filter((a) => !a.cross).map((a) => a.title + ' ' + pct(ach[a.id] || 0, N)).join(' / ')}`);
  });
} else {
  // ---- 最初の選挙 ----
  const bots = (process.env.BOTS || 'ランダム,中級,上級').split(',');
  console.log(`各 ${N} 回。小選挙区の当選 + 比例復活 = 議席 / 始まりの差 → 投票前の差(ポイント) / ゼロ打ち / 当確の出る時刻の平均`);
  parties.forEach((p) => {
    bots.forEach((b) => {
      let win = 0, pr = 0, s = 0, e = 0, zero = 0, tick = 0;
      const sg = { n: 0, me: 0, meWin: 0, ai: 0, aiWin: 0, aiMeWin: 0, turnout: 0, fc: 0, fcMe: 0 };   // 奔流(R15)
      for (let i = 0; i < N; i++) {
        const seed = (i + 1) * 7919 + p.length * 104729;
        const state = newState(p, seed);
        Game.Campaign.newCampaign(state);
        const start = Game.Campaign.margin(Game.Campaign.overall(state.camp));
        playCampaign(state, b, botRnd(seed));
        win += state.election.won ? 1 : 0; pr += state.election.pr.revived ? 1 : 0; s += start; e += Game.Campaign.margin(Game.Campaign.overall(state.camp));
        zero += state.election.zeroCall ? 1 : 0; tick += state.election.callTick;
        const el = state.election;
        if (el.surge) {
          sg.n++;
          let tv = 0, vv = 0;
          Game.Data.DISTRICT.regions.forEach((r) => { tv += r.voters * el.regions[r.id].turnout; vv += r.voters; });
          sg.turnout += tv / vv * 100;
          if (el.falseCall) { sg.fc++; sg.fcMe += el.falseCall.who === 'me' ? 1 : 0; }
          if (el.surge.target === 'me') { sg.me++; sg.meWin += el.won ? 1 : 0; } else { sg.ai++; sg.aiWin += el.winner === el.surge.target ? 1 : 0; sg.aiMeWin += el.won ? 1 : 0; }
        }
      }
      const f = (n) => (n / N * 100).toFixed(0).padStart(3);
      console.log(`${Game.Data.PARTIES[p].short} ${b.padEnd(4, ' ')} 当選 ${f(win)}% + 復活 ${f(pr)}% = ${f(win + pr)}%  差 ${(s / N).toFixed(1)} → ${(e / N).toFixed(1)}  ゼロ打ち ${(zero / N * 100).toFixed(0)}%  当確 ${B.count.ticks[Math.round(tick / N)]}ごろ`);
      if (process.env.SURGE) console.log(`      奔流 ${pct(sg.n, N)}(投票率 ${sg.n ? (sg.turnout / sg.n).toFixed(1) : '—'}%)  自分に ${sg.me}回 → 当選 ${pct(sg.meWin, sg.me)}  相手に ${sg.ai}回 → その相手が当選 ${pct(sg.aiWin, sg.ai)}・自分が当選 ${pct(sg.aiMeWin, sg.ai)}  当確の取り消し ${pct(sg.fc, sg.n)}(自分の当確 ${sg.fcMe}回)`);
    });
  });
}
});
