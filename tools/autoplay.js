// バランス確認用の自動プレイ。ゲーム本体からは読み込まない。
//   node tools/autoplay.js 300                      党ごと・ボットごとの当選率
//   BOTS=中級 PARTIES=minsei node tools/autoplay.js 500
//   node tools/autoplay.js 300 "B.roles.player.mult=0.8;"   ファイルを変えずに数値を試す(B は Game.Balance)
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const sandbox = { console };
sandbox.window = sandbox;
vm.createContext(sandbox);
['js/data/balance.js', 'js/data/district.js', 'js/data/cards.js', 'js/engine/rng.js', 'js/engine/campaign.js', 'js/engine/vote.js'].forEach((f) => {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f });
});
const Game = sandbox.Game;
const B = Game.Balance;
const N = +process.argv[2] || 200;
if (process.argv[3]) vm.runInContext('(function(B){' + process.argv[3] + '})(Game.Balance)', sandbox);

const regions = Game.Data.DISTRICT.regions;
const totalVoters = regions.reduce((a, r) => a + r.voters, 0);
// カードを地区で使ったときの値打ち(選挙区全体での伸び)。useTurnout なら投票率も見る
function worth(camp, id, regionId, useTurnout) {
  const list = Game.Campaign.isTarget(id) ? [Game.Data.REGION[regionId]] : regions;
  let v = 0;
  list.forEach((r) => {
    const w = useTurnout ? r.voters * B.vote.turnout[r.id] / 55 : r.voters;
    v += Game.Campaign.cardGain(camp, id, r.id) * w / totalVoters;
  });
  return v;
}

const BOTS = {
  // でたらめに出す
  ランダム(state, rnd) {
    const camp = state.camp;
    for (let guard = 0; guard < 10; guard++) {
      const ok = camp.hand.filter((c) => Game.Campaign.canPlay(camp, c.id).ok);
      if (!ok.length || rnd() < 0.15) break;
      const c = ok[Math.floor(rnd() * ok.length)];
      Game.Campaign.play(state, c.uid, regions[Math.floor(rnd() * regions.length)].id);
    }
    return 'policy';
  },
  // 目の前でいちばん伸びる手を選ぶ(相手の動きは見ない)
  中級(state) {
    const camp = state.camp;
    for (let guard = 0; guard < 10; guard++) {
      let best = null;
      camp.hand.forEach((c) => {
        if (!Game.Campaign.canPlay(camp, c.id).ok) return;
        const b = B.cards[c.id];
        if (b.promise && camp.promises.length >= B.campaign.promiseFree) return;
        if (b.money < 0) { if (camp.money < 25) best = best && best.v > 5 ? best : { c, v: 5 }; return; }
        (Game.Campaign.isTarget(c.id) ? regions : [regions[0]]).forEach((r) => {
          const v = worth(camp, c.id, r.id, false) / (b.cost || 0.4);
          if (v > 0 && (!best || v > best.v)) best = { c, r: r.id, v };
        });
      });
      if (!best) break;
      Game.Campaign.play(state, best.c.uid, best.r);
    }
    return 'policy';
  },
  // 相手の予告を見て、先回りと固い票も使う。投票率の低い地区を割り引く
  上級(state) {
    const camp = state.camp;
    const threat = {};
    camp.intents.forEach((it) => { threat[it.region] = (threat[it.region] || 0) + it.gain * Game.Data.REGION[it.region].voters / totalVoters; });
    for (let guard = 0; guard < 10; guard++) {
      let best = null;
      camp.hand.forEach((c) => {
        if (!Game.Campaign.canPlay(camp, c.id).ok) return;
        const b = B.cards[c.id];
        if (b.promise && camp.promises.length >= B.campaign.promiseFree) return;
        if (b.money < 0) { if (camp.money < 30) best = best && best.v > 5 ? best : { c, v: 5 }; return; }
        (Game.Campaign.isTarget(c.id) ? regions : [regions[0]]).forEach((r) => {
          let v = worth(camp, c.id, r.id, true);
          if (b.block && !camp.blocked[r.id]) v += threat[r.id] || 0;
          if (b.shield && !camp.blocked[r.id] && !(camp.shields[r.id] > 0)) v += (threat[r.id] || 0) * B.campaign.shieldBlock + 0.15;
          v /= (b.cost || 0.4);
          if (v > 0 && (!best || v > best.v)) best = { c, r: r.id, v };
        });
      });
      if (!best) break;
      Game.Campaign.play(state, best.c.uid, best.r);
    }
    return 'local';
  },
};

function runOne(party, botName, seed) {
  const state = { version: 2, screen: 'campaign', player: { name: '自動 太郎', party }, rng: seed };
  let x = seed ^ 0x9e3779b9;
  const rnd = () => { x = (x * 1664525 + 1013904223) | 0; return (x >>> 0) / 4294967296; };   // ボットの気まぐれ用(ゲームの乱数とは別)
  Game.Campaign.newCampaign(state);
  const start = Game.Campaign.overall(state.camp);
  for (let guard = 0; guard < 40 && state.screen === 'campaign'; guard++) {
    const camp = state.camp;
    let debate = null;
    while (camp.pending.length) {
      if (camp.pending[0].type === 'debate') { debate = true; Game.Campaign.chooseDebate(state, botName === '上級' ? 'local' : 'policy'); }
      else Game.Campaign.dismiss(state);
    }
    BOTS[botName](state, rnd);
    Game.Campaign.endDay(state);
  }
  const o = Game.Campaign.overall(state.camp);
  return { won: state.election.won, start: Game.Campaign.margin(start), end: Game.Campaign.margin(o), zero: state.election.zeroCall, callTick: state.election.callTick, marginPct: state.election.marginPct, promises: state.camp.promises.length };
}

const parties = (process.env.PARTIES || 'minsei,kyowa,mirai').split(',');
const bots = (process.env.BOTS || 'ランダム,中級,上級').split(',');
console.log(`各 ${N} 回。当選率 / 始まりの差 → 投票前の差(ポイント) / ゼロ打ち / 当確の出る時刻の平均`);
parties.forEach((p) => {
  bots.forEach((b) => {
    let win = 0, s = 0, e = 0, zero = 0, tick = 0;
    for (let i = 0; i < N; i++) {
      const r = runOne(p, b, (i + 1) * 7919 + p.length * 104729);
      win += r.won ? 1 : 0; s += r.start; e += r.end; zero += r.zero ? 1 : 0; tick += r.callTick;
    }
    console.log(`${Game.Data.PARTIES[p].short} ${b.padEnd(4, ' ')} 当選 ${(win / N * 100).toFixed(0).padStart(3)}%  差 ${(s / N).toFixed(1)} → ${(e / N).toFixed(1)}  ゼロ打ち ${(zero / N * 100).toFixed(0)}%  当確 ${B.count.ticks[Math.round(tick / N)]}ごろ`);
  });
});
