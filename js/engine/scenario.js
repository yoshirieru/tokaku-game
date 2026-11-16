// 史実シナリオ(R17)。実際にあった選挙の局面から、党首として始める。シナリオの総選挙(と政権づくり)が終わったら、エンディング。DOM には触らない。
// 状態は state.scenario = { id, elections(シナリオで戦った総選挙の数), swung(最初の総選挙の上げ下げを入れたか) }
window.Game = window.Game || {};

Game.Scenario = (function () {
  const R = Game.Rng;
  const S = function () { return Game.Balance.scenario; };
  function find(id) { return Game.Data.SCENARIOS.filter(function (x) { return x.id === id; })[0] || null; }
  function get(state) { return state && state.scenario ? find(state.scenario.id) : null; }

  // 参議院:半数ずつ2つの組に分ける。次の参院選は、シナリオのあいだには来ない
  function setUpper(state, seats) {
    const a = {}, b = {};
    Object.keys(seats).forEach(function (p) { a[p] = Math.ceil(seats[p] / 2); b[p] = seats[p] - a[p]; });
    state.upper = { classes: [a, b], next: S().upperNext, wind: {}, twisted: false };
  }

  // シナリオを始める(state は player.name・rng が入ったもの)。画面は 'campaign' か 'term'
  function start(state, id) {
    const sc = find(id);
    if (!sc) return null;
    Game.Data.applyScenarioNames(sc);   // このモードだけ実名
    state.player.party = sc.party;
    state.player.seat = state.player.seat || 'hokuyo3';
    state.scenario = { id: sc.id, elections: 0, swung: false };
    const cr = Game.Career.quickLeader(state);
    // 当選回数・守った約束は、シナリオで積んだぶんだけ数える(評価の内訳に、はじめから持っている分を出さない)
    cr.wins = 0; cr.elections = 0; cr.districtWins = 0; cr.kept = 0; cr.quickStart = { wins: 0, kept: 0 };
    const G = Game.Balance.gov;
    cr.gov = { role: sc.gov.role, pm: sc.gov.pm, partner: sc.gov.partner || null, posts: sc.gov.partner ? 2 : 0, adopted: null, approval: sc.approval, sat: sc.gov.sat || 0, low: 0 };
    cr.wasPM = sc.gov.role === 'pm'; cr.pmTerms = cr.wasPM ? 1 : 0; cr.pmStreak = cr.wasPM ? 1 : 0;
    cr.partySeats = sc.seats[sc.party];
    cr.nationSeats = Object.assign({}, sc.seats);
    setUpper(state, sc.upper);
    cr.promises = [];
    // 任期の地図(全国):ブロックごとに、党の地力がいちばん強い党の色
    cr.blocks = {};
    Object.keys(Game.Balance.partyBase).forEach(function (rid) {
      const b = Game.Balance.partyBase[rid];
      const top = Object.keys(b).sort(function (x, y) { return b[y] - b[x]; })[0];
      cr.blocks[rid] = { lead: top, mine: 0 };
    });
    const intro = { type: 'event', id: 'scenario', title: sc.title, kicker: sc.model, text: sc.lead };
    if (sc.start === 'term') {
      Game.Career.beginScenarioTerm(state, sc.turn, intro);
    } else {
      Game.Campaign.newCampaign(state);
      state.camp.pending.unshift(intro);
      state.screen = 'campaign';
    }
    return sc;
  }

  // 最初の総選挙だけ:党ごとの始まりの支持の上げ下げ(newNational から呼ぶ)。動いた量の目安を返す
  function swing(state, camp, applyGain) {
    const sc = get(state);
    if (!sc || state.scenario.swung || !sc.swing) return null;
    state.scenario.swung = true;
    const k = S().swingScale, out = {};
    camp.cands.forEach(function (c) {
      const sw = sc.swing[c.party];
      if (!sw) return;
      let sum = 0, n = 0;
      Game.Data.DISTRICT.regions.forEach(function (r) {
        let g = sw.all || 0;
        (r.tags || []).forEach(function (t) { g += sw[t] || 0; });
        if (g) applyGain(camp, r.id, c.id, g * k);
        sum += g * k; n += 1;
      });
      out[c.party] = Math.round(sum / n * 10) / 10;
    });
    return out;
  }

  // 目標ごとの達成(総選挙と政権づくりのあと)
  function goals(state) {
    const sc = get(state), e = state.election, cr = state.career, NB = Game.Balance.nation;
    if (!sc) return [];
    const ok = state.scenario.elections > 0 && e && e.national;
    const seatsOf = function (party) { return ok ? Game.Gov.seatsByParty(state)[party] : 0; };
    return sc.goals.map(function (g) {
      let hit = false;
      if (ok) {
        if (g.type === 'majority') hit = e.seats.me >= NB.majority;
        else if (g.type === 'seats') hit = e.seats.me >= g.n;
        else if (g.type === 'first') hit = e.won;
        else if (g.type === 'noMajority') hit = seatsOf(g.party) < NB.majority;
        else if (g.type === 'notRuling') hit = !!cr.gov && Game.Gov.members(cr.gov, state.player.party).indexOf(g.party) < 0;
        else if (g.type === 'inGov') hit = !!cr.gov && cr.gov.role !== 'opposition';
        else if (g.type === 'pm') hit = !!cr.gov && cr.gov.role === 'pm';
      }
      return { text: g.text, ok: hit };
    });
  }
  // シナリオの総選挙が終わったか(afterNational が政権づくりのあとに見る)
  function over(state) { return !!(state.scenario && state.scenario.elections >= 1); }
  // エンディングに足すもの
  function ending(state) {
    const sc = get(state);
    if (!sc) return null;
    const gl = goals(state), hit = gl.filter(function (g) { return g.ok; }).length;
    const e = state.election, seats = state.scenario.elections > 0 && e && e.national ? Game.Gov.seatsByParty(state) : null;
    return {
      id: sc.id, title: sc.title, model: sc.model, history: sc.history, goals: gl, hit: hit,
      verdict: hit === gl.length ? '目標を達成' : hit ? '目標の一部を達成' : '目標に届かず',
      seats: seats, before: sc.seats, gov: state.career.gov ? state.career.gov.role : null,
    };
  }

  return { find: find, get: get, start: start, swing: swing, goals: goals, over: over, ending: ending };
})();
