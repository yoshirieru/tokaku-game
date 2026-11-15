// 投票日の計算と、開票特番で見せる開票の進み方。結果は state.election に1回だけ作る(選挙戦と同じ種の乱数)。
window.Game = window.Game || {};

Game.Vote = (function () {
  const R = Game.Rng;

  // ---------- 全国の総選挙:ブロックごとの得票の割合から、議席を配る ----------
  // 端数は、余りの大きい順に配る
  function largestRemainder(n, weights) {
    const ids = Object.keys(weights), sum = ids.reduce(function (a, k) { return a + weights[k]; }, 0);
    const out = {}, rest = [];
    let used = 0;
    ids.forEach(function (k) { const q = n * weights[k] / sum; out[k] = Math.floor(q); used += out[k]; rest.push([k, q - out[k]]); });
    rest.sort(function (a, b) { return b[1] - a[1]; });
    for (let i = 0; used < n; i++, used++) out[rest[i % rest.length][0]] += 1;
    return out;
  }
  // 比例代表(ドント式)
  function dhondt(n, votes) {
    const ids = Object.keys(votes), out = {};
    ids.forEach(function (k) { out[k] = 0; });
    for (let i = 0; i < n; i++) {
      let best = ids[0];
      ids.forEach(function (k) { if (votes[k] / (out[k] + 1) > votes[best] / (out[best] + 1)) best = k; });
      out[best] += 1;
    }
    return out;
  }
  function runNational(state) {
    const camp = state.camp, B = Game.Balance, V = B.vote, NB = B.nation, C = B.count;
    const ids = camp.cands.map(function (c) { return c.id; });
    const weather = R.weighted(state, V.weather, function (w) { return w.weight; });
    const swing = {};
    ids.forEach(function (id) { swing[id] = R.normal(state) * V.swingAll; });
    const byBlock = {}, seats = {}, votes = {};
    ids.forEach(function (id) { seats[id] = 0; votes[id] = 0; });
    let total = 0;
    Game.Data.DISTRICT.regions.forEach(function (r) {
      const p = {}, w = {};
      let sum = 0;
      ids.forEach(function (id) {
        let v = camp.shares[r.id][id] + swing[id] + R.normal(state) * V.swingRegion;
        if (id === 'me') v += (camp.shields[r.id] || 0) * (weather.id === 'rain' ? V.shieldRain : V.shieldVote);
        if (id === 'vs' && camp.vs) v += (camp.vs.stash.shields[r.id] || 0) * (weather.id === 'rain' ? V.shieldRain : V.shieldVote);   // 対戦モードの2P
        p[id] = Math.max(1, v);
        sum += p[id];
      });
      ids.forEach(function (id) { p[id] = p[id] / sum; w[id] = Math.pow(p[id], NB.cube); });
      const turnout = Math.max(20, NB.turnout + weather.turnout + R.normal(state) * NB.turnoutNoise) / 100;
      const ballots = Math.round(r.voters * turnout);
      const smd = largestRemainder(r.smd, w), pr = dhondt(r.pr, p);
      const st = {}, share = {};
      ids.forEach(function (id) {
        st[id] = smd[id] + pr[id]; seats[id] += st[id];
        share[id] = p[id] * 100;
        const n = Math.round(ballots * p[id]); votes[id] += n; total += n;
      });
      byBlock[r.id] = { share: share, smd: smd, pr: pr, seats: st, turnout: turnout };
    });
    const order = ids.slice().sort(function (a, b) { return seats[b] - seats[a]; });
    // 開票の進み方:ブロックごとに開きはじめる時刻がちがう。開いた割合のぶんだけ議席が積み上がる
    const ticks = C.ticks.map(function (time, t) {
      const shown = {}, regionPct = {};
      ids.forEach(function (id) { shown[id] = 0; });
      let done = 0, all = 0;
      Object.keys(byBlock).forEach(function (rid) {
        const f = Math.max(0, Math.min(1, (t - NB.countStart[rid]) / NB.countSpan));
        regionPct[rid] = f;
        ids.forEach(function (id) { const n = Math.round(byBlock[rid].seats[id] * f); shown[id] += n; done += n; all += byBlock[rid].seats[id]; });
      });
      return { time: time, seats: shown, pct: done / all, regionPct: regionPct };
    });
    // 「過半数」が出る時刻(どの党も届かなければ、開票の終わり)
    let callTick = ticks.length - 1;
    for (let t = 0; t < ticks.length; t++) {
      if (ids.some(function (id) { return ticks[t].seats[id] >= NB.majority; })) { callTick = t; break; }
    }
    const cr = state.career;
    state.election = {
      national: true, weather: weather.id, byBlock: byBlock, seats: seats, votes: votes, total: total, order: order,
      winner: order[0], won: order[0] === 'me', majority: seats[order[0]] >= NB.majority, meMajority: seats.me >= NB.majority,
      prevMine: cr && cr.partySeats != null ? cr.partySeats : null,
      ticks: ticks, callTick: callTick, zeroCall: false, shown: 0, lossRatio: 100, pr: null,
    };
    return state.election;
  }

  // いまの支持のままなら何議席か(投票日のぶれは入れない)。選挙戦の画面の「議席の見込み」
  function project(camp) {
    const NB = Game.Balance.nation, ids = camp.cands.map(function (c) { return c.id; }), seats = {};
    ids.forEach(function (id) { seats[id] = 0; });
    Game.Data.DISTRICT.regions.forEach(function (r) {
      const p = {}, w = {};
      ids.forEach(function (id) { p[id] = camp.shares[r.id][id] / 100; w[id] = Math.pow(p[id], NB.cube); });
      const smd = largestRemainder(r.smd, w), pr = dhondt(r.pr, p);
      ids.forEach(function (id) { seats[id] += smd[id] + pr[id]; });
    });
    return seats;
  }

  function run(state) {
    if (Game.Data.DISTRICT.national) return runNational(state);
    const camp = state.camp, B = Game.Balance, V = B.vote, C = B.count;
    const ids = camp.cands.map(function (c) { return c.id; });
    const weather = R.weighted(state, V.weather, function (w) { return w.weight; });

    // 候補ごとの、選挙区全体のぶれ
    const swing = {};
    ids.forEach(function (id) { swing[id] = R.normal(state) * V.swingAll; });

    const regions = {}, totals = {};
    ids.forEach(function (id) { totals[id] = 0; });
    let total = 0;
    const boost = Game.Campaign.closeBoost(camp);
    Game.Data.DISTRICT.regions.forEach(function (r) {
      const s = {};
      let sum = 0;
      ids.forEach(function (id) {
        let v = camp.shares[r.id][id] + swing[id] + R.normal(state) * V.swingRegion;
        if (id === 'me') v += (camp.shields[r.id] || 0) * (weather.id === 'rain' ? V.shieldRain : V.shieldVote);
        if (id === 'vs' && camp.vs) v += (camp.vs.stash.shields[r.id] || 0) * (weather.id === 'rain' ? V.shieldRain : V.shieldVote);   // 対戦モードの2P
        s[id] = Math.max(1, v);
        sum += s[id];
      });
      // 接戦が続くと、関心が高まって投票率が上がる(R13)。浮動票・若者の地区ほど大きく、組織票の地区は小さく
      const cm = r.tags.some(function (t) { return t === 'float' || t === 'youth'; }) ? V.close.high : r.tags.indexOf('org') >= 0 ? V.close.low : 1;
      const turnout = Math.max(20, Math.min(95, Game.Campaign.turnoutOf(r.id) + weather.turnout + R.normal(state) * V.turnoutNoise + boost * cm)) / 100;
      const ballots = Math.round(r.voters * turnout);
      const votes = {};
      ids.forEach(function (id) { votes[id] = Math.round(ballots * s[id] / sum); totals[id] += votes[id]; total += votes[id]; });
      regions[r.id] = { turnout: turnout, votes: votes };
    });

    // 開票所の不審な動き(R10):立会人を送っていなければ、票が相手に流れることがある
    const recount = Game.Scandal.countFraud(state, regions, totals);
    if (recount && !recount.caught) total = ids.reduce(function (a, id) { return a + totals[id]; }, 0);
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
    const pr = camp.vs ? null : { line: prLine, revived: winner !== 'me' && lossRatio >= prLine };   // 対戦モードは比例復活なし

    state.election = {
      weather: weather.id, regions: regions, totals: totals, total: total, order: order,
      winner: winner, won: winner === 'me', marginPct: marginPct,
      lossRatio: lossRatio,   // 惜敗率
      pr: pr, recount: recount, closeBoost: boost, closeDays: camp.close || 0,
      ticks: ticks, callTick: callTick, zeroCall: callTick === 0, shown: 0,
    };
    return state.election;
  }

  return { run: run, project: project };
})();
