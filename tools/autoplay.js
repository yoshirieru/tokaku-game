// バランス確認用の自動プレイ。ゲーム本体からは読み込まない。
//   node tools/autoplay.js 300                        最初の選挙で議席を得る割合(党ごと・ボットごと)
//   BOTS=中級 PARTIES=minsei node tools/autoplay.js 500
//   CAREER=1 ELECTIONS=6 node tools/autoplay.js 200   任期をはさんで選挙をくり返す(議席、役職、党首、評価の分布)
//   CAREER=1 TERMBOT=放置 node tools/autoplay.js 200   任期で約束に手をつけないボット
//   NATION=1 node tools/autoplay.js 200               党首として戦う総選挙(各党の議席、過半数・第1党の割合)
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
['js/data/balance.js', 'js/data/district.js', 'js/data/seats.js', 'js/data/nation.js', 'js/data/cards.js', 'js/engine/rng.js', 'js/engine/campaign.js', 'js/engine/vote.js', 'js/engine/government.js', 'js/engine/career.js'].forEach((f) => {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f });
});
const Game = sandbox.Game;
const B = Game.Balance;
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
    while (camp.pending.length) {
      if (camp.pending[0].type === 'debate') Game.Campaign.chooseDebate(state, botName === '上級' ? 'local' : 'policy');
      else Game.Campaign.dismiss(state);
    }
    BOTS[botName](state, rnd);
    Game.Campaign.endDay(state);
  }
}
// 任期を解散まで進める。党首選は RACE(unity / reform / deal / skip。省くと unity)で立候補する
function playTerm(state, termBot) {
  const cr = state.career;
  let turns = 0;
  for (let guard = 0; guard < 40; guard++) {
    while (cr.pending.length && cr.pending[0].type !== 'dissolve') {
      const t = cr.pending[0].type;
      if (t === 'petition') Game.Career.respond(state, termBot === 'まじめ' && cr.promises.length < 2 && cr.turn <= 4);
      else if (t === 'leaderRace') { stats.races++; Game.Career.runRace(state, process.env.RACE || 'unity'); if (cr.leader) stats.raceWins++; }
      else Game.Career.dismiss(state);
    }
    if (cr.pending.length) break;
    TERM_BOTS[termBot](state);
    turns += 1;
    if (Game.Career.canDissolve(cr) && cr.turn >= 4 && cr.gov.approval >= 55 && !cr.promises.length) { Game.Career.dissolve(state); break; }
    const r = Game.Career.endTurn(state);
    if (r.ended) break;   // 退陣
  }
  return turns;
}
const stats = { races: 0, raceWins: 0 };
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
if (process.env.NATION) {
  // ---- 党首として戦う総選挙(1回)----
  const bots = (process.env.BOTS || 'ランダム,中級,上級').split(',');
  console.log(`各 ${N} 回。党首として戦う総選挙:自分の党の議席(平均と幅)/ 相手の党の平均 / 単独過半数・第1党の割合 / 党首を辞める割合`);
  parties.forEach((p) => {
    bots.forEach((b) => {
      const sum = {}, roles = {}; let maj = 0, first = 0, resign = 0; const mine = [];
      for (let i = 0; i < N; i++) {
        const seed = (i + 1) * 7919 + p.length * 104729;
        const state = newState(p, seed);
        Game.Career.quickLeader(state);
        Game.Campaign.newCampaign(state);
        playCampaign(state, b, botRnd(seed));
        const e = state.election;
        state.camp.cands.forEach((c) => { sum[c.party] = (sum[c.party] || 0) + e.seats[c.id]; });
        mine.push(e.seats.me); maj += e.meMajority ? 1 : 0; first += e.won ? 1 : 0;
        Game.Career.afterElection(state);
        if (state.screen === 'ending') resign++;
        roles[state.career.gov.role] = (roles[state.career.gov.role] || 0) + 1;
      }
      mine.sort((x, y) => x - y);
      const others = Object.keys(sum).filter((k) => k !== p).map((k) => Game.Data.PARTIES[k].short + ' ' + (sum[k] / N).toFixed(0)).join('・');
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
    stats.races = 0; stats.raceWins = 0;
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
        if (state.screen === 'ending') { ousted++; break; }   // 支持率の低迷で退陣
        const nx = state.career.next;
        kept += nx.endorse.length; broken += nx.broken.length; light += nx.light.length; carried += nx.carried.length;
        base += Game.Data.ARENAS[curSeat].regions.reduce((a, r) => a + (state.career.base[r.id] || 0), 0); stars += Game.Career.extraStars(state.career);
        Game.Career.toCampaign(state);
      }
      const end = state.ending || Game.Career.retire(state, 'retire');
      ranks[state.career.bestRank || 0]++; grades[end.grade] = (grades[end.grade] || 0) + 1; score += end.score;
      if (state.career.wasPM) { pmEver++; pmTurns += state.career.pmTurns || 0; }
    }
    console.log(`${Game.Data.PARTIES[p].short}: 回ごとの議席 ${seat.map((w) => pct(w, N)).join(' / ')}(うち小選挙区 ${dist.map((w) => pct(w, N)).join(' / ')})`);
    console.log(`      現職が議席を守る ${pct(incSeat, inc)}  落選からの返り咲き ${pct(outSeat, out)}  公認を失って引退 ${pct(dropped, N)}  任期の平均 ${(turns / terms).toFixed(1)}会期`);
    console.log(`      1任期あたり:守った ${(kept / terms).toFixed(2)}  途中まで ${(light / terms).toFixed(2)}  破った ${(broken / terms).toFixed(2)}  持ち越し ${(carried / terms).toFixed(2)}  地盤の合計 ${(base / terms).toFixed(1)}  応援の追加 ${(stars / terms).toFixed(2)}`);
    console.log(`      到達した役職 ${B.ranks.map((r, k) => r.name + ' ' + pct(ranks[k], N)).join(' / ')}  評価 ${['S', 'A', 'B', 'C', 'D'].map((g) => g + ' ' + pct(grades[g] || 0, N)).join(' ')}(平均 ${(score / N).toFixed(0)}点)`);
    console.log(`      党首選 ${stats.races}回のうち勝ち ${pct(stats.raceWins, stats.races)}  党首としての総選挙 ${natN}回:平均 ${natN ? (natSeats / natN).toFixed(0) : '—'}議席・過半数 ${pct(natMaj, natN)}  議席を減らして辞任 ${pct(resigned, N)}`);
    console.log(`      首相になった ${pct(pmEver, N)}(平均の在任 ${pmEver ? (pmTurns / pmEver / 2).toFixed(1) : '—'}年)  支持率の低迷で退陣 ${pct(ousted, N)}`);
  });
} else {
  // ---- 最初の選挙 ----
  const bots = (process.env.BOTS || 'ランダム,中級,上級').split(',');
  console.log(`各 ${N} 回。小選挙区の当選 + 比例復活 = 議席 / 始まりの差 → 投票前の差(ポイント) / ゼロ打ち / 当確の出る時刻の平均`);
  parties.forEach((p) => {
    bots.forEach((b) => {
      let win = 0, pr = 0, s = 0, e = 0, zero = 0, tick = 0;
      for (let i = 0; i < N; i++) {
        const seed = (i + 1) * 7919 + p.length * 104729;
        const state = newState(p, seed);
        Game.Campaign.newCampaign(state);
        const start = Game.Campaign.margin(Game.Campaign.overall(state.camp));
        playCampaign(state, b, botRnd(seed));
        win += state.election.won ? 1 : 0; pr += state.election.pr.revived ? 1 : 0; s += start; e += Game.Campaign.margin(Game.Campaign.overall(state.camp));
        zero += state.election.zeroCall ? 1 : 0; tick += state.election.callTick;
      }
      const f = (n) => (n / N * 100).toFixed(0).padStart(3);
      console.log(`${Game.Data.PARTIES[p].short} ${b.padEnd(4, ' ')} 当選 ${f(win)}% + 復活 ${f(pr)}% = ${f(win + pr)}%  差 ${(s / N).toFixed(1)} → ${(e / N).toFixed(1)}  ゼロ打ち ${(zero / N * 100).toFixed(0)}%  当確 ${B.count.ticks[Math.round(tick / N)]}ごろ`);
    });
  });
}
});
