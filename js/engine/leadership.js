// 党首選。推薦人20人で立候補し、3ラウンドの選挙戦のあと、議員票+党員票で決める。
// 過半数がいなければ上位2人の決選投票(議員票 + 都道府県ごとの党員票47)。DOMには触らない。
//
// state.leaderRace = {
//   party, reason, round, actionsLeft,
//   cands: [{ id, name, title, isPlayer, mp, member }],   // mp / member は支持の強さ(得票はこの比)
//   log: [], result: null | { first, runoff, winner },
// }
window.Game = window.Game || {};

Game.Leadership = (function () {
  const LB = () => Game.Balance.leadership;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand = (state) => Game.Career._rand(state.career);

  const ACTIONS = {
    mps:    { name: '議員への支持固め', icon: '🤝', desc: '同僚議員を一人ずつ回る。議員票が伸びる。' },
    boss:   { name: '派閥の長と会談',   icon: '🏯', desc: '派閥の領袖に支援を頼む。議員票が大きく伸びるが、「密室の談合」と党員の印象は悪くなる。' },
    tour:   { name: '党員への全国遊説', icon: '🚄', desc: '全国の党員集会を回る。党員票が伸びる。' },
    debate: { name: '公開討論会',       icon: '🎙', desc: '候補者どうしの討論会。うまくいけば党員票が大きく伸びるが、外すこともある。' },
    vision: { name: '政策ビジョン発表', icon: '📘', desc: '党首として何をするかを示す。党員票と議員票が少しずつ伸びる。' },
    media:  { name: 'メディア出演',     icon: '📺', desc: 'テレビの討論番組に出る。党員票が伸びるが、失言のリスクがある。' },
  };

  // 党首選があるか(毎ターンの始まりに career.js が呼ぶ)
  function scheduled(state) {
    const w = state.world;
    if (state.party && state.party.custom) return null;
    if (w.pendingResign && state.player.party === Game.Data.RULING_PARTY) return 'resign';
    if (w.turnIndex === Game.Balance.term.promotion.turnIndex && (w.year - LB().firstYear) % LB().everyYears === 0) return 'term';
    return null;
  }

  function eligible(state) {
    const c = state.career;
    if (c.status !== 'member') return { ok: false, reason: '議員でないと立候補できない' };
    const need = endorsersNeeded(state);
    if (c.allies < need) return { ok: false, reason: `推薦人が足りない(仲間の議員 ${Math.floor(c.allies)}人 / ${need}人)` };
    return { ok: true, reason: '' };
  }

  // 推薦人の数:20人。ただし小さい党は議員数の一定割合まで
  function endorsersNeeded(state) {
    const mps = Game.Data.PARTY_MPS[state.player.party] || 30;
    return Math.min(LB().endorsersNeeded, Math.ceil(mps * LB().endorsersShare));
  }

  function start(state, reason) {
    const c = state.career;
    const P = LB().player;
    const party = state.player.party;
    const cands = [{
      id: 'player', name: state.player.name, title: Game.Career.postName(state), isPlayer: true,
      // 仲間の議員は党の大きさに対する割合で効く(どの党でも、上限まで集めれば同じ強さ)。党内評価の効きには上限
      mp: P.mpBase + Math.min(1, c.allies / Game.Career.alliesCap(state)) * P.mpAllyFull + c.postLevel * P.mpPerPost + Math.min(P.evalCap, c.partyEval) * P.mpPerEval,
      member: P.memberBase + (c.nationalRecog || 0) * P.memberPerRecog + c.achievements * P.memberPerAchievement,
    }];
    (Game.Data.LEADER_RIVALS[party] || []).forEach((r, i) => {
      const base = LB().rivals[i] || LB().rivals[LB().rivals.length - 1];
      // 相手の強さは党首選ごとに違う
      const k = () => 1 + (rand(state) - 0.5) * LB().rivalSpread;
      // 大きい党ほど実力者がひしめいていて、党首選は激しい
      const pm = ((LB().rivalMultByParty || {})[party] || 1) * (state.difficulty === 'easy' ? Game.Balance.easy.leadershipRival : 1);
      cands.push({ id: 'r' + i, name: r.name, title: r.title, isPlayer: false, mp: base.mp * pm * k(), member: base.member * pm * k() });
    });
    state.leaderRace = { party, reason, round: 1, actionsLeft: LB().actionsPerRound, cands, log: [], result: null };
    // 派閥(faction.js):どの派閥が誰を推すか。自分の派閥の長に挑むなら派閥を飛び出す
    for (const t of Game.Faction.raceSetup(state, state.leaderRace)) state.leaderRace.log.push({ round: 1, text: '🏯 ' + t });
    return state.leaderRace;
  }

  function me(race) {
    return race.cands.find((x) => x.isPlayer);
  }

  function shares(race) {
    const sum = (k) => race.cands.reduce((s, x) => s + Math.max(1, x[k]), 0);
    const mpSum = sum('mp');
    const memSum = sum('member');
    const out = {};
    for (const x of race.cands) out[x.id] = { mp: Math.max(1, x.mp) / mpSum, member: Math.max(1, x.member) / memSum };
    return out;
  }

  function act(state, id) {
    const race = state.leaderRace;
    if (!race || race.actionsLeft <= 0 || race.result) return { ok: false, text: '' };
    const A = LB().actions[id];
    const p = me(race);
    let text = '';
    if (id === 'mps') { p.mp += A.mp; text = '同僚議員を回り、支持を固めた。'; }
    else if (id === 'boss') {
      // 派閥のある党は、キングメーカーの推しを取りに行く(faction.js)。報道は「密室の談合」と書き、党員の印象は悪くなる
      const t = race.factions ? Game.Faction.bossMeet(state, race, () => rand(state)) : null;
      if (!t) p.mp += A.mp;
      p.member += A.member;
      text = t || '派閥の領袖と会談し、支援を取りつけた。報道は「密室の談合」と書いた。';
    }
    else if (id === 'tour') { p.member += A.member; text = '地方の党員集会を回った。熱心な党員が集まった。'; }
    else if (id === 'debate') {
      const g = A.memberMin + rand(state) * (A.memberMax - A.memberMin);
      p.member += g;
      text = g >= 6 ? '討論会で存在感を示した。党員の評価が大きく上がった。' : g >= 0 ? '討論会は互角だった。' : '討論会で答えに詰まり、評価を落とした。';
    } else if (id === 'vision') { p.mp += A.mp; p.member += A.member; text = '政策ビジョンを発表した。'; }
    else if (id === 'media') {
      if (rand(state) < A.gaffeChance) { p.member += A.gaffeMember; text = '討論番組で失言し、批判を浴びた。'; }
      else { p.member += A.member; text = '討論番組で政策を訴えた。'; }
    }
    race.actionsLeft--;
    race.log.push({ round: race.round, text: `${ACTIONS[id].icon} ${text}` });
    return { ok: true, text };
  }

  // ラウンドを終える。最後のラウンドなら投票する
  function endRound(state) {
    const race = state.leaderRace;
    const G = LB().rivalGrowth;
    for (const x of race.cands) {
      if (x.isPlayer) continue;
      x.mp += G.mp + (rand(state) - 0.5) * 2 * G.noise;
      x.member += G.member + (rand(state) - 0.5) * 2 * G.noise;
    }
    if (race.round >= LB().rounds) {
      // 投票の直前の寝返り(faction.js)
      race.betrayals = Game.Faction.betrayAtVote(state, race, () => rand(state));
      for (const t of race.betrayals) race.log.push({ round: race.round, text: '🗡 ' + t });
      race.result = vote(state);
      return race.result;
    }
    race.round++;
    race.actionsLeft = LB().actionsPerRound;
    return null;
  }

  function vote(state) {
    const race = state.leaderRace;
    const mps = Game.Data.PARTY_MPS[race.party] || 100;
    const sh = shares(race);
    const first = race.cands.map((x) => {
      const mp = Math.round(mps * sh[x.id].mp);
      const member = Math.round(mps * sh[x.id].member);
      return { id: x.id, name: x.name, mp, member, total: mp + member };
    }).sort((a, b) => b.total - a.total);
    const total = mps * 2;
    let winner = first[0].id;
    let runoff = null;
    if (first[0].total <= total / 2) {
      // 決選投票:上位2人。議員は支持の強さの比で、党員票は47
      const top = first.slice(0, 2).map((f) => race.cands.find((x) => x.id === f.id));
      const mpSum = top.reduce((s, x) => s + Math.max(1, x.mp), 0);
      const memSum = top.reduce((s, x) => s + Math.max(1, x.member), 0);
      runoff = top.map((x) => {
        const mp = Math.round(mps * Math.max(1, x.mp) / mpSum);
        const member = Math.round(LB().runoffMemberVotes * Math.max(1, x.member) / memSum);
        return { id: x.id, name: x.name, mp, member, total: mp + member };
      }).sort((a, b) => b.total - a.total);
      winner = runoff[0].id;
    }
    return { first, runoff, winner, totalFirst: total };
  }

  // 結果を反映する。戻り値:プレイヤーが勝ったか
  function finish(state) {
    const race = state.leaderRace;
    const c = state.career;
    const res = race.result;
    const won = res.winner === 'player';
    const winner = race.cands.find((x) => x.id === res.winner);
    if (won) {
      Game.Legacy.stats(state).wasLeader = true;
      state.leader = {
        party: race.party, since: state.world.year, isPM: race.party === Game.Data.RULING_PARTY, via: 'election',
      };
    } else {
      const f = res.first.find((x) => x.id === 'player');
      const shareFirst = f.total / res.totalFirst;
      c.partyEval += shareFirst >= LB().closeShare ? LB().loseEval.close : LB().loseEval.far;
      if (race.party === Game.Data.RULING_PARTY) state.world.pmName = winner.name;
    }
    if (race.party === Game.Data.RULING_PARTY) {
      state.world.pendingResign = false;
      state.world.approval = Math.max(state.world.approval, 50);   // 新しい首相の「ご祝儀相場」
    }
    c.lastLeaderRace = { year: state.world.year, won, winner: winner.name };
    Game.Faction.afterRace(state, race, res.winner);   // 勝った人を推した派閥が主流派になる
    return won;
  }

  // プレイヤーが出ない党首選の結果(ニュースだけ)
  function aiRace(state) {
    const party = state.player.party;
    const list = Game.Data.LEADER_RIVALS[party] || [];
    // 派閥のある党は、派閥の大きさとキングメーカーの推しで決まる(faction.js)
    const idx = Game.Faction.aiRaceWinner(state, () => rand(state));
    const w = list[idx === null ? Math.floor(rand(state) * list.length) : idx] || { name: '新党首' };
    if (party === Game.Data.RULING_PARTY) {
      state.world.pmName = w.name;
      state.world.pendingResign = false;
      state.world.approval = Math.max(state.world.approval, 50);
    }
    return w.name;
  }

  return { ACTIONS, scheduled, eligible, endorsersNeeded, start, shares, act, endRound, finish, aiRace, me };
})();
