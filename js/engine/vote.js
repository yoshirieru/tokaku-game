// 投票日の計算と、開票特番で見せる開票の進み方。結果は state.election に1回だけ作る(選挙戦と同じ種の乱数)。
window.Game = window.Game || {};

Game.Vote = (function () {
  const R = Game.Rng;

  function run(state) {
    const camp = state.camp, B = Game.Balance, V = B.vote, C = B.count;
    const ids = camp.cands.map(function (c) { return c.id; });
    const weather = R.weighted(state, V.weather, function (w) { return w.weight; });

    // 候補ごとの、選挙区全体のぶれ
    const swing = {};
    ids.forEach(function (id) { swing[id] = R.normal(state) * V.swingAll; });

    const regions = {}, totals = {};
    ids.forEach(function (id) { totals[id] = 0; });
    let total = 0;
    Game.Data.DISTRICT.regions.forEach(function (r) {
      const s = {};
      let sum = 0;
      ids.forEach(function (id) {
        let v = camp.shares[r.id][id] + swing[id] + R.normal(state) * V.swingRegion;
        if (id === 'me') v += (camp.shields[r.id] || 0) * (weather.id === 'rain' ? V.shieldRain : V.shieldVote);
        s[id] = Math.max(1, v);
        sum += s[id];
      });
      const turnout = Math.max(20, V.turnout[r.id] + weather.turnout + R.normal(state) * V.turnoutNoise) / 100;
      const ballots = Math.round(r.voters * turnout);
      const votes = {};
      ids.forEach(function (id) { votes[id] = Math.round(ballots * s[id] / sum); totals[id] += votes[id]; total += votes[id]; });
      regions[r.id] = { turnout: turnout, votes: votes };
    });

    const order = ids.slice().sort(function (a, b) { return totals[b] - totals[a]; });
    const winner = order[0];
    const marginPct = (totals[order[0]] - totals[order[1]]) / total * 100;

    // 開票の進み方。はじめのうちは候補ごとに偏りがあり、開票率100%でぴったり最終結果になる
    const skew = {};
    Object.keys(regions).forEach(function (rid) {
      skew[rid] = {};
      ids.forEach(function (id) { skew[rid][id] = R.normal(state) * C.earlySkew; });
    });
    const ticks = C.ticks.map(function (time, t) {
      const counted = {}, regionPct = {}, byRegion = {};
      ids.forEach(function (id) { counted[id] = 0; });
      let sum = 0;
      Object.keys(regions).forEach(function (rid) {
        const f = C.progress[rid][t];
        regionPct[rid] = f;
        byRegion[rid] = {};
        ids.forEach(function (id) {
          const n = Math.round(regions[rid].votes[id] * f * (1 + skew[rid][id] * (1 - f)));
          byRegion[rid][id] = n;
          counted[id] += n; sum += n;
        });
      });
      return { time: time, counted: counted, pct: Math.min(1, sum / total), regionPct: regionPct, byRegion: byRegion };
    });
    // 当確が出る時刻:大差なら20時ちょうど(ゼロ打ち)。そうでなければ、開票済みの差が残りの票に対して十分になったとき
    let callTick = ticks.length - 1;
    if (marginPct >= C.zeroCallMargin) {
      callTick = 0;
    } else {
      for (let t = 1; t < ticks.length; t++) {
        const c = ticks[t].counted;
        const ord = ids.slice().sort(function (a, b) { return c[b] - c[a]; });
        const sum = ids.reduce(function (a, id) { return a + c[id]; }, 0);
        if (ord[0] === winner && c[ord[0]] - c[ord[1]] > (total - sum) * C.callRatio) { callTick = t; break; }
      }
    }

    // 比例復活:惜敗率が、その選挙での党の復活ラインに届いたか(乱数は開票の計算のあとに引く)
    const lossRatio = totals.me / totals[winner] * 100;
    const prLine = B.pr.line[state.player.party] + R.normal(state) * B.pr.noise;
    const pr = { line: prLine, revived: winner !== 'me' && lossRatio >= prLine };

    state.election = {
      weather: weather.id, regions: regions, totals: totals, total: total, order: order,
      winner: winner, won: winner === 'me', marginPct: marginPct,
      lossRatio: lossRatio,   // 惜敗率
      pr: pr,
      ticks: ticks, callTick: callTick, zeroCall: callTick === 0, shown: 0,
    };
    return state.election;
  }

  return { run: run };
})();
