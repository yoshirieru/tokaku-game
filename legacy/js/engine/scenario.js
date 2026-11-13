// 史実シナリオ(M19)。データは js/data/scenarios.js。DOMには触らない。
//
// state.scenario = { id, role, startElections, created: { 政党: 定義 }, flags: { ... } }
// state.world.era = 制度(Game.Data.ERAS のキー)
//
// シナリオの政党・制度は Game.Data / Game.Balance に差し込む(apply)。ほかのモード(はじめから・対戦)では元に戻す。
window.Game = window.Game || {};

Game.Scenario = (function () {
  const SB = () => Game.Balance.scenario;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const LD = () => Game.Leader;
  const D = Game.Data;

  // ---------------- 元の値を覚えておき、差し込みの前に戻す ----------------
  let base = null;
  let added = [];   // 差し込んだ政党 id(元からある党は上書き前の値を base.overrides に持つ)
  function snapshot() {
    if (base) return;
    const B = Game.Balance;
    base = {
      house: D.HOUSE_SEATS, majority: D.MAJORITY, upperSeats: D.UPPER_SEATS, upperMajority: D.UPPER_MAJORITY,
      blocks: D.BLOCKS.map((b) => ({ smd: b.smd, pr: b.pr })),
      upperPr: B.gov.upper.prSeats, upperDistrict: B.gov.upper.districtSeats,
      econTrend: Object.assign({}, B.econ.trend),
      overrides: {},
    };
  }
  function restore() {
    snapshot();
    const B = Game.Balance;
    for (const id of added) {
      const o = base.overrides[id];
      if (o) {
        if (o.party) D.PARTIES[id] = o.party; else delete D.PARTIES[id];
        if (o.bal) B.parties[id] = o.bal; else delete B.parties[id];
        if (o.platform) D.PARTY_PLATFORMS[id] = o.platform; else delete D.PARTY_PLATFORMS[id];
        if (o.backers) D.PARTY_BACKERS[id] = o.backers; else delete D.PARTY_BACKERS[id];
        if (o.cov !== undefined) B.national.aiCoverage[id] = o.cov; else delete B.national.aiCoverage[id];
      }
    }
    added = [];
    base.overrides = {};
    applyEra('now');
    Object.assign(B.econ.trend, base.econTrend);
  }

  // 制度(衆議院の議席・選挙制度・参議院)を差し込む
  function applyEra(eraId) {
    snapshot();
    const E = D.ERAS[eraId] || D.ERAS.now;
    D.HOUSE_SEATS = E.house;
    D.MAJORITY = E.majority;
    D.ELECTION_SYSTEM = E.system;
    D.SMD_LABEL = E.system === 'mmd' ? '中選挙区' : '小選挙区';
    D.UPPER_SEATS = E.upper.seats;
    D.UPPER_MAJORITY = E.upper.majority;
    Game.Balance.gov.upper.prSeats = E.upper.pr;
    Game.Balance.gov.upper.districtSeats = E.upper.district;
    // ブロックの定数:今の区割りを、その時代の総数に比例させる(端数は大きい順に配る)
    const spread = (key, total) => {
      const cur = base.blocks.map((b) => b[key]);
      const sum = cur.reduce((a, b) => a + b, 0);
      if (!total) return cur.map(() => 0);
      const exact = cur.map((v) => (v * total) / sum);
      const out = exact.map(Math.floor);
      let left = total - out.reduce((a, b) => a + b, 0);
      exact.map((v, i) => [i, v - out[i]]).sort((a, b) => b[1] - a[1]).forEach(([i]) => { if (left > 0) { out[i]++; left--; } });
      return out;
    };
    const smd = eraId === 'now' ? base.blocks.map((b) => b.smd) : spread('smd', E.smd);
    const pr = eraId === 'now' ? base.blocks.map((b) => b.pr) : spread('pr', E.pr);
    D.BLOCKS.forEach((b, i) => { b.smd = smd[i]; b.pr = pr[i]; });
  }

  function defOf(sc, state, id) {
    return (state && state.scenario && state.scenario.created && state.scenario.created[id]) || (sc.parties && sc.parties[id]) || null;
  }
  function register(id, def) {
    const B = Game.Balance;
    const X = Object.assign({}, D.SCENARIO_PARTY_DEFAULTS, def);
    if (!base.overrides[id]) {
      base.overrides[id] = {
        party: D.PARTIES[id], bal: B.parties[id], platform: D.PARTY_PLATFORMS[id], backers: D.PARTY_BACKERS[id], cov: B.national.aiCoverage[id],
      };
      added.push(id);
    }
    const prev = base.overrides[id].party;
    // 元からある実名の党(公明党)は名前などを残し、強さだけ差し替える
    D.PARTIES[id] = Object.assign({}, prev || {}, {
      id, name: X.name || (prev && prev.name) || id, short: X.short || (prev && prev.short) || id, color: X.color || (prev && prev.color) || '#999',
      position: X.position || (prev && prev.position) || '', description: X.position || (prev && prev.description) || '',
      playable: false, real: true, scenario: true,
    });
    B.parties[id] = { support: X.support, lean: X.lean, orgStrength: X.org, orgLean: X.orgLean };
    if (X.platform.length || !D.PARTY_PLATFORMS[id]) D.PARTY_PLATFORMS[id] = X.platform.slice();
    if (X.backers.length || !D.PARTY_BACKERS[id]) D.PARTY_BACKERS[id] = X.backers.slice();
    B.national.aiCoverage[id] = X.cov;
  }

  // セーブを読み込んだとき・始めるとき:シナリオの政党と制度を差し込む(シナリオでなければ元に戻す)
  function apply(state) {
    restore();
    const sc = state && state.scenario && D.scenarioById(state.scenario.id);
    if (!sc) return;
    for (const id in sc.parties || {}) register(id, sc.parties[id]);
    for (const id in state.scenario.created || {}) register(id, state.scenario.created[id]);
    for (const id in state.scenario.supports || {}) if (Game.Balance.parties[id]) Game.Balance.parties[id].support = state.scenario.supports[id];   // 党名変更などで変わった強さ
    for (const id in state.partyOverrides || {}) if (D.PARTIES[id]) Object.assign(D.PARTIES[id], state.partyOverrides[id]);
    applyEra((state.world && state.world.era) || sc.era);
    if (sc.econTrend) Object.assign(Game.Balance.econ.trend, sc.econTrend);
  }

  const current = (state) => (state && state.scenario ? D.scenarioById(state.scenario.id) : null);
  const roleOf = (state) => { const sc = current(state); return sc ? sc.roles[state.scenario.role] : null; };

  // ---------------- 始める ----------------
  // opts: { id, role(index), name, seed }
  function start(opts) {
    const sc = D.scenarioById(opts.id);
    const role = sc.roles[opts.role] || sc.roles[0];
    const party = role.party;
    const st = {
      screen: 'leaderHub', difficulty: 'normal', tutorial: null, seat: null,
      player: { name: opts.name || role.historical, party },
      ui: {},
      scenario: { id: sc.id, role: sc.roles.indexOf(role), startElections: 0, created: {}, flags: {} },
    };
    Game.Data.applySeat(null);
    Game.Data.applyRuling(null);
    const w = {
      year: sc.year, turnIndex: sc.turnIndex, approval: sc.approval, partyShift: {},
      parties: {}, era: sc.era, termElapsed: sc.termElapsed || 0,
      leaderNames: Object.assign({}, sc.leaders), pmName: sc.pmName || sc.leaders[sc.gov.pmParty],
      generalElections: 0, coopPacts: [],
      upper: JSON.parse(JSON.stringify(sc.upper)),
    };
    for (const id in sc.seats) w.parties[id] = { seats: sc.seats[id] };
    st.world = w;
    apply(st);
    // 経済の指標
    Game.Economy.ensure(st);
    if (sc.econ) { Object.assign(w.econ, sc.econ); w.econ.prev = Object.assign({}, sc.econ); }
    // 議員としての経歴(党首モードで使う分)
    const c = Game.Career.ensure(st);
    c.rng = (opts.seed >>> 0) || 7;
    c.wins = role.wins || 5;
    c.status = 'member';
    c.partyEval = SB().start.partyEval;
    c.allies = SB().start.allies;
    c.money = SB().start.money;
    c.nationalRecog = SB().start.nationalRecog;
    c.turn.elapsed = w.termElapsed;
    // 支援団体:党の支持母体とは最初から近い
    const pledges = (D.PARTY_PLATFORMS[party] || []).slice(0, 3);
    const rel = Game.Support.initialRelations(party, pledges);
    for (const org of D.PARTY_BACKERS[party] || []) if (rel[org] !== undefined) rel[org] = Math.max(rel[org], SB().start.backerRelation);
    st.support = { pledges, relations: rel, promises: [], banned: [], endorsedBy: [], endorsedLast: (D.PARTY_BACKERS[party] || []).slice() };
    // 党首として始める(党首選・新党を経ない)
    Game.Legacy.stats(st).wasLeader = true;
    st.leader = { party, since: sc.year, isPM: sc.gov.pmParty === party, via: 'scenario' };
    Game.Leader.init(st);
    const ld = st.leader;
    if (sc.cohesion) ld.cohesion = sc.cohesion;
    // 政権(史実の首相の党と連立)。プレイヤーが首相の党の党首なら、首相はプレイヤー
    Game.Gov.setGov(st, sc.gov.pmParty, sc.gov.coalition, {});
    if (sc.gov.coalition.includes(party) && sc.gov.pmParty !== party) st.gov.role = 'partner';
    if (sc.gov.pmParty !== party) st.gov.pmName = sc.pmName || sc.leaders[sc.gov.pmParty];   // 史実の首相(1993年は宮沢喜一)
    Game.Gov.syncRuling(st);
    w.pmName = st.gov.pmName;
    ld.report = {
      title: sc.title,
      lines: sc.briefing.concat([`あなたは${role.title}。${role.intro}`, `目標:${role.goals.map((g) => g.label).join(' / ')}`]),
      event: null,
    };
    st.ui.showLeaderReport = true;
    if (sc.id === 's1994') st.scenario.flags.reform = true;   // 政治改革関連法は1994年1月に成立している
    // 始まりの画面
    if (sc.start === 'coalition') {
      st.gov.formation = { offers: {}, rejected: [] };
      st.screen = 'coalition';
    } else if (sc.start === 'election') {
      st.screen = 'nationalPrep';
      st.nationalPrep = Game.National.defaultPrep(st);
    }
    track(st);
    return st;
  }

  // ---------------- 毎ターン ----------------
  // 目標の判定に使う記録(首相になった、与党になった、参院選の結果)
  function track(state) {
    const f = state.scenario.flags;
    const g = state.gov;
    const me = state.leader && state.leader.party;
    // 連立交渉の最中(首班指名の前)は数えない
    if (g && !g.formation && g.role === 'pm') f.wasPM = true;
    if (g && !g.formation && me && g.coalition.includes(me)) f.wasRuling = true;
    const u = state.world.upper;
    if (u && f.upperYear === undefined) f.upperYear = u.nextYear;
    if (u && u.nextYear !== f.upperYear) {
      f.upperYear = u.nextYear;
      f.upperDone = true;
      f.upperTwisted = Game.Gov.twisted(state);
    }
  }

  // ターンの始まり(leader.js の endTurn から)。選ぶ出来事があれば返す
  // busy:ほかの出来事(予算・参院選など)がこのターンに出ている。選ぶ出来事は次のターンに回す
  function turn(state, lines, busy) {
    const sc = current(state);
    if (!sc) return null;
    const w = state.world;
    const f = state.scenario.flags;
    track(state);
    let ev = null;
    const now = w.year * 4 + w.turnIndex;
    for (const e of sc.events || []) {
      if (e.year * 4 + e.turn > now) continue;
      const key = `${e.type}-${e.year}-${e.turn}-${e.id || e.party || ''}`;
      if (f['done_' + key]) continue;
      if (CHOICE_EVENTS.includes(e.type) && (busy || ev)) continue;   // 次のターンに
      f['done_' + key] = true;
      const r = runEvent(state, sc, e, lines);
      if (r && !ev) ev = r;
    }
    // 2012年:「近いうちに信を問う」と約束したのに解散しない
    if (f.kinchi && !f.kinchiDone) {
      if ((w.generalElections || 0) > f.kinchi.elections) f.kinchiDone = true;
      else if (w.year * 4 + w.turnIndex > f.kinchi.deadline) {
        const K = SB().kinchi;
        w.approval = clamp(w.approval + K.lateApproval, 5, 90);
        state.leader.cohesion = clamp(state.leader.cohesion + K.lateCohesion, 0, 100);
        lines.push('「近いうちとはいつなのか」。解散の約束を守らない首相に、野党も与党内も反発を強めている。(内閣支持率・結束が下がった)');
      }
    }
    return ev;
  }

  const CHOICE_EVENTS = ['reformBill', 'kinchi'];
  function runEvent(state, sc, e, lines) {
    const w = state.world;
    const me = state.leader.party;
    const info = (id) => LD().partyInfo(id);
    if (e.type === 'aiMerge') {
      const parts = (e.parts || [e.a, e.b]).filter((p) => w.parties[p]);
      if (parts.length < 2) return null;
      if (parts.includes(me)) {
        lines.push(`${parts.filter((p) => p !== me).map((p) => info(p).name).join('・')}との合流を求める声が高まっている(合流・合併の交渉で決める)。`);
        return null;
      }
      const defs = parts.map((p) => defOf(sc, state, p) || { name: info(p).name });
      const uniq = (k) => [...new Set(defs.reduce((a, d) => a.concat(d[k] || []), []))];
      state.scenario.created[e.id] = {
        name: e.name, short: e.short, color: e.color, position: `${defs.map((d) => d.name).join('・')}が合流した党`,
        platform: uniq('platform').slice(0, 4), backers: uniq('backers'),
        support: e.support, lean: defs[0].lean || {}, org: Math.max(...defs.map((d) => d.org || 0)), orgLean: defs[0].orgLean || {}, cov: Math.max(...defs.map((d) => d.cov || 0)),
      };
      w.parties[e.id] = { seats: parts.reduce((t, p) => t + w.parties[p].seats, 0) };
      for (const p of parts) delete w.parties[p];
      for (const cls of ['A', 'B']) {
        const u = w.upper[cls];
        const n = parts.reduce((t, p) => t + (u[p] || 0), 0);
        for (const p of parts) delete u[p];
        if (n) u[e.id] = (u[e.id] || 0) + n;
      }
      w.leaderNames[e.id] = e.leader;
      const g = state.gov;
      if (g) {
        if (parts.includes(g.pmParty)) { g.pmParty = e.id; g.pmName = e.leader; w.pmName = e.leader; }
        g.coalition = [...new Set(g.coalition.map((p) => (parts.includes(p) ? e.id : p)))];
        for (const p of parts) delete g.partners[p];
        if (g.coalition.includes(e.id) && g.pmParty !== e.id && !g.partners[e.id]) g.partners[e.id] = { ministers: 1, policies: [], coop: false, satisfaction: Game.Balance.gov.coalition.satisfactionStart };
      }
      apply(state);
      Game.Gov.syncRuling(state);
      lines.push(`${e.text}衆議院${w.parties[e.id].seats}議席。`);
      LD().addLog(state, `🏛 ${e.text}`, 'news');
      return null;
    }
    if (e.type === 'newParty') {
      let n = 0;
      for (const p in e.from) {
        if (!w.parties[p]) continue;
        const k = Math.min(e.from[p], w.parties[p].seats);
        w.parties[p].seats -= k;
        n += k;
        if (p === me) state.leader.cohesion = clamp(state.leader.cohesion - SB().newPartyCohesion, 0, 100);
      }
      w.parties[e.id] = { seats: n };
      w.leaderNames[e.id] = e.leader;
      lines.push(`${e.text}(衆議院${n}議席)`);
      LD().addLog(state, `🏛 ${e.text}`, 'news');
      return null;
    }
    if (e.type === 'rename') {
      if (!w.parties[e.party]) return null;
      state.partyOverrides = state.partyOverrides || {};
      state.partyOverrides[e.party] = { name: e.name, short: e.short };
      Object.assign(D.PARTIES[e.party], state.partyOverrides[e.party]);
      if (e.support !== undefined) { state.scenario.supports = state.scenario.supports || {}; state.scenario.supports[e.party] = e.support; apply(state); }
      lines.push(e.text);
      LD().addLog(state, `📰 ${e.text}`, 'news');
      return null;
    }
    if (e.type === 'leaderChange') {
      if (e.party === me || !w.parties[e.party]) return null;
      w.leaderNames[e.party] = e.name;
      if (state.gov && state.gov.pmParty === e.party) { state.gov.pmName = e.name; w.pmName = e.name; }
      lines.push(e.text);
      LD().addLog(state, `📰 ${e.text}`, 'news');
      return null;
    }
    if (e.type === 'econShock') {
      const ec = Game.Economy.ensure(state);
      ec.growth += e.growth || 0;
      ec.life = clamp(ec.life + (e.life || 0), 0, 100);
      LD().addLog(state, `📉 ${e.title}`, 'news');
      lines.push(`【${e.title}】${e.text}`);
      return null;
    }
    if (e.type === 'mood') {
      // 世の中の空気:党の支持率が動く(world.partyShift)
      for (const p in e.shifts) w.partyShift[p] = (w.partyShift[p] || 0) + e.shifts[p];
      lines.push(`【${e.title}】${e.text}`);
      LD().addLog(state, `📰 ${e.title}`, 'news');
      return null;
    }
    if (e.type === 'reformBill') {
      if (state.gov && state.gov.role === 'pm') {
        return {
          id: 'sc_reform', kicker: '政治改革', title: '政治改革関連法案',
          text: '衆議院に小選挙区比例代表並立制を入れる政治改革関連法案が山場を迎えた。与党の中にも反対がある。',
          choices: [
            { id: 'pass', label: '成立させる', note: '支持率が上がるが、党内の結束は下がる。次の総選挙から小選挙区比例代表並立制' },
            { id: 'shelve', label: '先送りする', note: '支持率が下がる。総選挙は中選挙区制のまま' },
          ],
        };
      }
      state.scenario.flags.reform = true;
      lines.push('政治改革関連法が成立した。次の総選挙から小選挙区比例代表並立制になる。');
      return null;
    }
    if (e.type === 'kinchi') {
      const K = SB().kinchi;
      if (state.gov && state.gov.role === 'pm') {
        return {
          id: 'sc_kinchi', kicker: '三党合意', title: '「近いうちに国民に信を問う」',
          text: '消費税を引き上げる法案を参議院で通すには、自民・公明の賛成が要る。両党の党首は、見返りに早い解散を約束するよう迫っている。',
          choices: [
            { id: 'promise', label: '「近いうちに信を問う」と約束する', note: `法案が成立して支持率が少し上がる。${K.deadlineTurns}ターンのうちに解散しないと、支持率と結束が毎ターン下がる` },
            { id: 'refuse', label: '解散の約束はしない', note: '法案は宙に浮き、支持率が下がる。野党は対決姿勢を強める' },
          ],
        };
      }
      w.termElapsed = Math.max(w.termElapsed || 0, K.aiTermElapsed);   // AIの首相は解散に傾く
      lines.push(`${w.pmName}首相が、自民・公明の党首と「近いうちに国民に信を問う」と合意した。消費税を引き上げる法案は成立した。`);
      return null;
    }
    return null;
  }

  // 選ぶ出来事の結果(leader.js の resolveEvent から)
  function resolve(state, ev, choice) {
    const w = state.world;
    const ld = state.leader;
    const f = state.scenario.flags;
    if (ev.id === 'sc_reform') {
      const R = SB().reform;
      if (choice === 'pass') {
        f.reform = true;
        w.approval = clamp(w.approval + R.approval, 5, 90);
        ld.cohesion = clamp(ld.cohesion + R.cohesion, 0, 100);
        return '政治改革関連法が成立した。次の総選挙から小選挙区比例代表並立制になる。';
      }
      f.reform = false;
      w.approval = clamp(w.approval + R.shelveApproval, 5, 90);
      return '政治改革を先送りした。「改革の看板はどうした」と批判が強まった。';
    }
    if (ev.id === 'sc_kinchi') {
      const K = SB().kinchi;
      if (choice === 'promise') {
        f.kinchi = { deadline: w.year * 4 + w.turnIndex + K.deadlineTurns, elections: w.generalElections || 0 };
        w.approval = clamp(w.approval + K.promiseApproval, 5, 90);
        ld.cohesion = clamp(ld.cohesion + K.promiseCohesion, 0, 100);
        return '自民・公明の党首と「近いうちに国民に信を問う」と合意し、法案は成立した。解散の時期が問われる。';
      }
      w.approval = clamp(w.approval + K.refuseApproval, 5, 90);
      return '解散の約束を拒んだ。法案は参議院で宙に浮き、野党は内閣不信任案をちらつかせている。';
    }
    return '';
  }

  // ---------------- 交渉の加減 ----------------
  function formationBonus(state, partner) {
    const sc = current(state);
    const t = sc && sc.formationBonus && sc.formationBonus[state.leader.party];
    if (!t) return 0;
    return t[partner] !== undefined ? t[partner] : t.all || 0;
  }
  function mergeBonus(state, partner) {
    const sc = current(state);
    const t = sc && sc.mergeBonus && sc.mergeBonus[state.leader.party];
    return (t && t[partner]) || 0;
  }
  function coopBlocked(state, partner) {
    const sc = current(state);
    return !!(sc && (sc.noCoopWith || []).includes(partner) && state.leader.party === 'ldp');
  }
  function kofukuRuns(state) {
    const sc = current(state);
    if (!sc) return true;
    if (sc.noKofuku) return false;
    return !sc.kofukuFrom || state.world.year >= sc.kofukuFrom;
  }
  // プレイヤーが連立を組めなかったときの、史実の政権(1回だけ)
  function altGov(state) {
    const sc = current(state);
    const a = sc && sc.altGov && sc.altGov[state.leader.party];
    if (!a || state.scenario.flags.altUsed) return null;
    if (!a.coalition.every((p) => state.world.parties[p])) return null;
    state.scenario.flags.altUsed = true;
    return a;
  }
  const noSns = (state) => !!(current(state) && current(state).noSns);

  // 総選挙の前(解散のとき):制度が変わっていれば差し込む
  function beforeElection(state) {
    const sc = current(state);
    if (!sc) return;
    const w = state.world;
    const f = state.scenario.flags;
    f.pmAtElection = !!(state.gov && state.gov.role === 'pm');
    if (sc.nextEra && w.year >= sc.nextEra.fromYear && f.reform !== false && w.era !== sc.nextEra.era) {
      w.era = sc.nextEra.era;
      applyEra(w.era);
    }
  }

  // ---------------- 終わりと結果 ----------------
  function isOver(state) {
    const sc = current(state);
    if (!sc || state.screen === 'ending') return false;
    const w = state.world;
    if (state.gov && state.gov.formation) return false;
    if ((w.generalElections || 0) - state.scenario.startElections >= sc.end.elections) return true;
    return w.year > sc.end.maxYear;
  }

  function goalDone(state, g) {
    const f = state.scenario.flags;
    const w = state.world;
    const ld = state.leader;
    const me = (ld && ld.party) || state.player.party;
    const gov = state.gov;
    const elected = (w.generalElections || 0) > state.scenario.startElections;
    const last = (w.lastGeneralElection && w.lastGeneralElection.seats) || {};
    switch (g.type) {
      case 'merged': return !!(ld && ld.merges.some((m) => m.partner === g.arg));
      case 'majority': return elected && (last[me] || 0) >= D.MAJORITY;
      case 'firstParty': return elected && Object.keys(last).every((p) => p === me || (last[p] || 0) < (last[me] || 0));
      case 'pm': return !!(gov && gov.role === 'pm' && (elected || !state.scenario.needElection));
      case 'becamePM': return !!f.wasPM;
      case 'pmTurns': return Game.Legacy.pmTurns(state) >= g.arg;
      case 'pmUntilElection': return !!f.pmAtElection;
      case 'ruling': return !!f.wasRuling;
      case 'twisted': return !!(f.upperDone && f.upperTwisted);
      case 'notTwisted': return !!(f.upperDone && !f.upperTwisted);
      default: return false;
    }
  }

  function result(state) {
    const sc = current(state);
    const role = roleOf(state);
    if (state.leader) track(state);
    const goals = role.goals.map((g) => ({ label: g.label, done: goalDone(state, g) }));
    const n = goals.filter((g) => g.done).length;
    const title = n === goals.length ? `${sc.title}:目標を達成` : n ? `${sc.title}:目標の一部を達成` : `${sc.title}:目標に届かず`;
    const text = n === goals.length ? `${role.title}として、史実の大きな転換点を乗り切った。` : n ? '思いどおりにはいかなかったが、歴史の流れに爪あとを残した。' : '歴史の流れは、思いどおりには動かなかった。';
    return { id: sc.id, title, scenarioTitle: sc.title, role: role.title, historical: role.historical, text, goals, history: sc.history };
  }

  return {
    apply, applyEra, start, turn, resolve, track, formationBonus, mergeBonus, coopBlocked, kofukuRuns, noSns,
    beforeElection, isOver, result, current, roleOf, altGov,
  };
})();
