// 政権運営:連立交渉、首相・与党・野党の行動、解散権、予算、参院選とねじれ、長期政権批判、退陣、内閣不信任案。
// 党首モード(leader.js)の上で動く。DOMには触らない。
//
// state.gov = {
//   pmParty, coalition: [政党], role: 'pm' | 'partner' | 'opposition',
//   partners: { 政党: { ministers, policies: [約束した政策], coop, satisfaction } },
//   pmTurns(プレイヤーが首相の在任ターン), billsPassed, billsFailed, approvalSum, approvalTurns,
//   reshuffleCooldown, noConfCooldown, lowTurns, pmName, history: [],
//   formation: null | { offers, rejected }(総選挙のあとの連立交渉中), invite: null | { pmParty }(連立入りの打診)
// }
// state.world.upper = { A: {政党: 議席}, B: {...}, nextClass: 'A' | 'B', nextYear }
// state.world.coopPacts = [{ partner, type }](野党共闘で結んだ、次の総選挙の候補者調整)
window.Game = window.Game || {};

Game.Gov = (function () {
  const GB = () => Game.Balance.gov;
  const LD = () => Game.Leader;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand = (state) => Game.Career._rand(state.career);
  const MAJ = () => Game.Data.MAJORITY;
  const UMAJ = () => Game.Data.UPPER_MAJORITY;
  const POL = (id) => Game.Data.POLICIES[id].name;

  const ACTIONS = {
    // 首相
    bill:      { name: '重要法案を提出', icon: '📜', target: 'policy', role: 'pm', desc: '政策を法案にして国会に出す。成立すれば内閣支持率が上がり、約束も前に進む。ねじれや少数与党だと通りにくい。' },
    stimulus:  { name: '経済対策(補正予算)', icon: '💹', target: 'none', role: 'pm', desc: '補正予算を組んで景気を下支えする。すぐに効くが、財政が悪くなる。外からの出来事で景気が落ちたときに。' },
    fiscalReform: { name: '財政再建', icon: '🧮', target: 'none', role: 'pm', desc: '増税と歳出の見直しで財政を立て直す。財政はよくなるが、景気と暮らしが冷え、支持率と党内の結束が下がる。' },
    reshuffle: { name: '内閣改造', icon: '🔄', target: 'none', role: 'pm', desc: '閣僚を入れ替えて人心を一新する。支持率と党内の結束が上がるが、新閣僚の失言のリスクもある。' },
    diplomacy: { name: '外交・首脳会談', icon: '🌏', target: 'none', role: 'pm', desc: '外国の首脳と会談する。うまくいけば支持率が大きく上がる。' },
    pressPM:   { name: '首相記者会見', icon: '🎙', target: 'none', role: 'pm', desc: '国民に直接語りかける。支持率が少し上がるが、失言のリスクがある。' },
    consult:   { name: '連立相手との協議', icon: '🤝', target: 'partner', role: 'pm', desc: '連立を組む党の党首と会う。相手の満足度が上がる。' },
    dissolve:  { name: '衆議院を解散する', icon: '⚡', target: 'none', role: 'pm', desc: '解散権を使って総選挙に打って出る。早すぎる解散は「党利党略」と批判され、支持が少し減る。' },
    // 連立与党(首相でない)
    leaveCoalition: { name: '連立を離脱する', icon: '🚪', target: 'none', role: 'partner', desc: '連立政権から抜けて野党になる。' },
    // 野党
    grill:     { name: '国会で追及', icon: '🔍', target: 'none', role: 'opposition', desc: '予算委員会で政権を追及する。内閣支持率を下げ、党の存在感を示す。空振りすると逆効果。' },
    noConf:    { name: '内閣不信任案を提出', icon: '🗳', target: 'none', role: 'opposition', desc: '可決には衆議院の過半数が要る。与党から造反が出れば通ることもある。可決なら解散か総辞職。' },
    pact:      { name: '野党共闘の協議', icon: '🤝', target: 'party', role: 'opposition', desc: '次の総選挙の候補者調整を前もって結ぶ。' },
  };

  // ---------------- 議席 ----------------
  function lower(state, parties) {
    return parties.reduce((s, p) => s + LD().seatsOf(state, p), 0);
  }
  function upperOf(state, party) {
    const u = state.world.upper;
    return ((u.A[party] || 0) + (u.B[party] || 0));
  }
  function upper(state, parties) {
    return parties.reduce((s, p) => s + upperOf(state, p), 0);
  }
  function twisted(state) {
    return upper(state, state.gov.coalition) < UMAJ();
  }
  function minority(state) {
    return lower(state, state.gov.coalition) < MAJ();
  }
  function conflictsBetween(a, b) {
    const pa = Game.Data.PARTY_PLATFORMS[a] || [];
    const pb = Game.Data.PARTY_PLATFORMS[b] || [];
    let n = 0;
    for (const x of pa) for (const y of pb) if (Game.Support.conflicts(x, y)) n++;
    return n;
  }

  // ---------------- はじめの政権 ----------------
  function ensure(state) {
    const w = state.world;
    if (!w.upper) {
      w.upper = JSON.parse(JSON.stringify(Game.Data.UPPER_INITIAL));
      w.upper.nextClass = 'A';
      w.upper.nextYear = Game.Data.UPPER_FIRST_ELECTION;
      while (w.upper.nextYear < w.year || (w.upper.nextYear === w.year && w.turnIndex > 1)) w.upper.nextYear += 3;
    }
    // 次の参院選の年が壊れたセーブ(M13 の初版)を直す:直近の改選年から3年ごとに数え直す
    if (!Number.isFinite(w.upper.nextYear)) {
      let y = Game.Data.UPPER_FIRST_ELECTION;
      while (y < w.year || (y === w.year && w.turnIndex > 1)) y += 3;
      w.upper.nextYear = y;
    }
    if (!w.coopPacts) w.coopPacts = [];
    if (state.gov) return state.gov;
    const f = aiForm(state, null);
    setGov(state, f.pmParty, f.coalition, {});
    if (f.coalition.includes(state.leader.party) && f.pmParty !== state.leader.party) state.gov.role = 'partner';
    return state.gov;
  }

  function setGov(state, pmParty, coalition, partners) {
    const me = state.leader.party;
    const prev = state.gov || {};
    const sameGov = prev.pmParty === pmParty && prev.role === 'pm' && pmParty === me;
    const parts = {};
    for (const p of coalition) {
      if (p === pmParty) continue;
      parts[p] = Object.assign({ ministers: 1, policies: [], coop: false, satisfaction: GB().coalition.satisfactionStart }, partners[p] || {});
    }
    state.gov = {
      pmParty, coalition: coalition.slice(), role: pmParty === me ? 'pm' : coalition.includes(me) ? 'partner' : 'opposition',
      partners: parts,
      pmTurns: sameGov ? prev.pmTurns : 0,
      billsPassed: prev.billsPassed || 0, billsFailed: prev.billsFailed || 0,
      approvalSum: prev.approvalSum || 0, approvalTurns: prev.approvalTurns || 0,
      reshuffleCooldown: 0, noConfCooldown: 0, lowTurns: 0,
      pmName: pmParty === me ? state.player.name : aiPmName(state, pmParty),
      history: (prev.history || []).concat([{ year: state.world.year, pmParty, coalition: coalition.slice() }]),
      formation: null, invite: null,
      pmSince: sameGov ? prev.pmSince : state.world.year,
    };
    state.leader.isPM = state.gov.role === 'pm';
    if (state.gov.role === 'pm') Game.Legacy.stats(state).wasPM = true;
    if (pmParty !== me) state.world.pmName = state.gov.pmName;
    return state.gov;
  }

  function aiPmName(state, party) {
    if (party === 'minsei') return state.world.pmName || Game.Data.PRIME_MINISTER.name;
    const r = (Game.Data.LEADER_RIVALS[party] || [])[0];
    return r ? r.name : `${LD().partyInfo(party).name}の党首`;
  }

  // AI の第1党が連立を組む(exclude の党は除く)。足りなければプレイヤーの党の力が要る
  function aiForm(state, exclude) {
    const w = state.world;
    const ids = Object.keys(w.parties).filter((id) => id !== 'indep' && w.parties[id].seats > 0);
    ids.sort((a, b) => w.parties[b].seats - w.parties[a].seats);
    const me = state.leader.party;
    const lead = ids.find((id) => id !== exclude) || ids[0];
    const coalition = [lead];
    let seats = w.parties[lead].seats;
    const others = ids.filter((id) => id !== lead && id !== exclude && id !== me)
      .sort((a, b) => conflictsBetween(lead, a) - conflictsBetween(lead, b) || w.parties[b].seats - w.parties[a].seats);
    for (const p of others) {
      if (seats >= MAJ()) break;
      if (w.parties[p].seats >= GB().coalition.rivalSeats && w.parties[lead].seats >= GB().coalition.rivalSeats) continue;
      if (conflictsBetween(lead, p) >= 2) continue;
      coalition.push(p);
      seats += w.parties[p].seats;
    }
    const needsPlayer = seats < MAJ() && lead !== me && exclude !== me && seats + LD().seatsOf(state, me) >= MAJ();
    return { pmParty: lead, coalition, seats, needsPlayer };
  }

  // ---------------- 総選挙のあと ----------------
  // 戻り値: 'single'(だれかが単独過半数)/ 'negotiate'(連立交渉へ)
  function afterElection(state) {
    ensure(state);
    const w = state.world;
    const me = state.leader.party;
    const ids = Object.keys(w.parties).filter((id) => id !== 'indep');
    const top = ids.sort((a, b) => w.parties[b].seats - w.parties[a].seats)[0];
    if (w.parties[top].seats >= MAJ()) {
      const wasPm = state.gov.role === 'pm';
      setGov(state, top, [top], {});
      if (top !== me && wasPm) state.gov.history.push({ year: w.year, event: '政権交代' });
      return 'single';
    }
    state.gov.formation = { offers: {}, rejected: [] };
    return 'negotiate';
  }

  // ---------------- 連立交渉(プレイヤーが組む) ----------------
  function willingness(state, partner, offer) {
    const C = GB().coalition;
    const me = state.leader.party;
    const w = state.world;
    let v = C.base - conflictsBetween(me, partner) * C.conflictPenalty;
    const conf = Game.Merger.conflicts(state, partner).length;   // プレイヤー自身の公約とも比べる
    v -= Math.max(0, conf - conflictsBetween(me, partner)) * C.conflictPenalty / 2;
    if (LD().seatsOf(state, me) >= C.rivalSeats && LD().seatsOf(state, partner) >= C.rivalSeats) v -= C.rivalPenalty;
    // 自分より大きい党に「首相はこちらで」と頼むのは難しい
    const ratio = LD().seatsOf(state, partner) / Math.max(1, LD().seatsOf(state, me));
    if (ratio > 1) v -= Math.min(C.biggerRatioCap, ratio) * C.biggerPartnerPenalty;
    const largest = Object.keys(w.parties).filter((id) => id !== 'indep').sort((a, b) => w.parties[b].seats - w.parties[a].seats)[0];
    if (largest !== me) v -= C.notLargestPenalty;
    v += (offer.ministers || 0) * C.perMinister + (offer.policies || []).length * C.perPolicy + (offer.coop ? C.coopBonus : 0);
    return Math.round(v);
  }

  function formationPartners(state) {
    const w = state.world;
    const me = state.leader.party;
    return Object.keys(w.parties)
      .filter((id) => id !== me && id !== 'indep' && w.parties[id].seats > 0)
      .sort((a, b) => w.parties[b].seats - w.parties[a].seats)
      .map((id) => ({ id, name: LD().partyInfo(id).name, seats: w.parties[id].seats, platform: Game.Data.PARTY_PLATFORMS[id] || [], conflicts: conflictsBetween(me, id) }));
  }

  // 選んだ相手に申し入れる。全員が受け入れ、過半数に届けば政権を組む
  function proposeCoalition(state, chosen) {
    const f = state.gov.formation;
    const me = state.leader.party;
    const accepted = [];
    const rejected = [];
    for (const p of chosen) {
      const offer = f.offers[p] || {};
      if (willingness(state, p, offer) >= 0) accepted.push(p);
      else rejected.push(p);
    }
    f.rejected = [...new Set(f.rejected.concat(rejected))];
    const coalition = [me].concat(accepted);
    const seats = lower(state, coalition);
    if (!rejected.length && seats >= MAJ()) {
      const partners = {};
      let ministers = 0;
      for (const p of accepted) {
        const o = f.offers[p] || {};
        partners[p] = { ministers: o.ministers || 0, policies: (o.policies || []).slice(), coop: !!o.coop };
        ministers += o.ministers || 0;
        if (o.coop) state.world.coopPacts.push({ partner: p, type: 'unify' });
      }
      const ld = state.leader;
      ld.cohesion = clamp(ld.cohesion + ministers * GB().coalition.ministerCohesion, 0, 100);
      setGov(state, me, coalition, partners);
      return { formed: true, accepted, rejected, seats };
    }
    return { formed: false, accepted, rejected, seats };
  }

  // 連立をあきらめる:単独少数与党(第1党のとき)か、AI に任せる
  function giveUpFormation(state, minorityGov) {
    const me = state.leader.party;
    state.gov.formation = null;
    if (minorityGov) {
      setGov(state, me, [me], {});
      return 'minority';
    }
    const f = aiForm(state, null);
    if (f.needsPlayer && f.pmParty !== me) {
      setGov(state, f.pmParty, f.coalition, {});
      state.gov.invite = { pmParty: f.pmParty };
      return 'invite';
    }
    setGov(state, f.pmParty, f.coalition.includes(me) ? f.coalition : f.coalition, {});
    return 'ai';
  }

  // 連立入りの打診に答える
  function answerInvite(state, accept) {
    const g = state.gov;
    const me = state.leader.party;
    if (!g.invite) return;
    if (accept) {
      const coalition = g.coalition.concat([me]);
      setGov(state, g.pmParty, coalition, {});
    }
    g.invite = null;
    if (state.gov) state.gov.invite = null;
  }

  // ---------------- 行動 ----------------
  function actions(state) {
    const g = ensure(state);
    const ld = state.leader;
    const c = state.career;
    const A = GB().actions;
    return Object.keys(ACTIONS).filter((id) => ACTIONS[id].role === g.role).map((id) => {
      const a = Object.assign({ id, gov: true }, ACTIONS[id]);
      a.money = (A[id] || {}).money || 0;
      let enabled = ld.actionsLeft > 0 && !ld.pending;
      let reason = '';
      if (a.money > c.money) { enabled = false; reason = '資金が足りない'; }
      if (id === 'reshuffle' && g.reshuffleCooldown > 0) { enabled = false; reason = `あと${g.reshuffleCooldown}ターン`; }
      if (id === 'noConf' && g.noConfCooldown > 0) { enabled = false; reason = `あと${g.noConfCooldown}ターン`; }
      if (id === 'consult' && !Object.keys(g.partners).length) { enabled = false; reason = '連立相手がいない'; }
      if (id === 'bill') a.passChance = billChance(state, null);
      if (id === 'stimulus' || id === 'fiscalReform') {
        a.money = Game.Balance.econ[id].money;
        const cd = Game.Economy.ensure(state).cooldowns[id];
        if (a.money > c.money) { enabled = false; reason = '資金が足りない'; }
        if (cd > 0) { enabled = false; reason = `あと${cd}ターン`; }
      }
      a.enabled = enabled;
      a.reason = reason;
      return a;
    });
  }

  function billChance(state, policy) {
    const B = GB().actions.bill;
    const g = state.gov;
    let p = B.passBase * (state.leader.cohesion / 100 * 0.4 + 0.8);
    if (twisted(state)) p *= B.twisted;
    if (minority(state)) p *= B.minority;
    if (policy) for (const pt of Object.keys(g.partners)) if ((Game.Data.PARTY_PLATFORMS[pt] || []).some((x) => Game.Support.conflicts(x, policy))) p -= B.conflictPenalty;
    return clamp(p, 0.05, 0.95);
  }

  function billTargets(state) {
    const g = state.gov;
    const promised = [];
    for (const p in g.partners) promised.push(...g.partners[p].policies);
    const sup = state.support || { pledges: [], promises: [] };
    const open = sup.promises.filter((x) => x.status === 'open').map((x) => x.policy);
    return [...new Set(promised.concat(open, sup.pledges))];
  }

  function setApproval(state, delta) {
    const A = GB().approval;
    state.world.approval = clamp(state.world.approval + delta, A.min, A.max);
  }

  // 戻り値: { ok, text, dissolution? }
  function doAction(state, id, target) {
    const g = ensure(state);
    const ld = state.leader;
    const c = state.career;
    const act = actions(state).find((a) => a.id === id);
    if (!act || !act.enabled) return { ok: false, text: act ? act.reason : 'その行動はできない' };
    const A = GB().actions[id] || {};
    let text = '';
    if (id === 'bill') {
      if (!Game.Data.POLICIES[target]) return { ok: false, text: '政策を選んでください' };
      const name = Game.Data.BILL_NAMES[target] || `${POL(target)}法案`;
      const chance = billChance(state, target);
      // 連立相手の政策とぶつかる法案は相手の不満を買う
      for (const pt of Object.keys(g.partners)) {
        if ((Game.Data.PARTY_PLATFORMS[pt] || []).some((x) => Game.Support.conflicts(x, target))) g.partners[pt].satisfaction += GB().partner.billConflict;
      }
      if (rand(state) < chance) {
        g.billsPassed++;
        setApproval(state, A.approvalWin);
        Game.Economy.enact(state, target, 'pm');   // 指標に効くのはこれから(M14)
        // 約束の実現(支援団体・連立相手)
        const kept = keepPolicy(state, target);
        text = `${name}が成立した。${kept.length ? kept.join('・') + 'との約束を果たした。' : ''}`;
      } else {
        g.billsFailed++;
        if (twisted(state)) Game.Legacy.add(state, 'twistedFails');
        setApproval(state, A.approvalLose);
        text = `${name}は${twisted(state) ? '参議院で否決された(ねじれ国会)' : '審議が行き詰まり、廃案になった'}。`;
      }
    } else if (id === 'stimulus') {
      const E = Game.Balance.econ.stimulus;
      Game.Economy.stimulus(state);
      setApproval(state, E.approval);
      text = '補正予算を組み、経済対策を打ち出した。景気は持ち直しそうだが、財政は悪くなる。';
    } else if (id === 'fiscalReform') {
      const E = Game.Balance.econ.fiscalReform;
      Game.Economy.fiscalReform(state, 'pm');
      setApproval(state, E.approval);
      ld.cohesion = clamp(ld.cohesion + E.cohesion, 0, 100);
      text = '増税と歳出の見直しを決めた。財政は立て直しに向かうが、「負担増」への反発も出ている。';
    } else if (id === 'reshuffle') {
      setApproval(state, A.approval);
      ld.cohesion = clamp(ld.cohesion + A.cohesion, 0, 100);
      g.reshuffleCooldown = A.cooldown;
      g.scandalPending = rand(state) < A.scandalRisk;
      for (const p in g.partners) g.partners[p].satisfaction += 3;
      text = '内閣を改造し、人心の一新を図った。';
    } else if (id === 'diplomacy') {
      const d = A.approvalMin + rand(state) * (A.approvalMax - A.approvalMin);
      setApproval(state, d);
      text = d >= 2 ? '首脳会談で成果を挙げた。各紙が「外交の成果」と報じた。' : d >= 0 ? '首脳会談は無難に終わった。' : '首脳会談で目立った成果は出ず、批判を浴びた。';
    } else if (id === 'pressPM') {
      if (rand(state) < A.gaffeChance) { setApproval(state, A.gaffeApproval); text = '記者会見での発言が失言と受け取られ、批判が広がった。'; }
      else { setApproval(state, A.approval); text = '記者会見で政策を丁寧に説明した。'; }
    } else if (id === 'consult') {
      const p = g.partners[target];
      if (!p) return { ok: false, text: '相手を選んでください' };
      p.satisfaction = clamp(p.satisfaction + GB().partner.consult, 0, 100);
      text = `${LD().partyInfo(target).name}の党首と会談し、連立の結束を確かめた。`;
    } else if (id === 'dissolve') {
      const early = g.pmTurns < A.earlyTurns;
      state.world.dissolvePenalty = early ? A.earlyPenalty : 0;
      ld.actionsLeft = 0;
      ld.report = {
        title: '衆議院解散',
        lines: [
          `${state.player.name}首相は衆議院を解散した。`,
          early ? '野党は「党利党略の解散だ」と批判している。浮動票が少し離れそうだ。' : '「信を問う」解散。総選挙が始まる。',
        ],
        event: null,
        dissolution: true,
      };
      LD().addLog(state, '⚡ 衆議院を解散した。', 'news');
      return { ok: true, text: '衆議院を解散した。', dissolution: true };
    } else if (id === 'leaveCoalition') {
      g.coalition = g.coalition.filter((p) => p !== ld.party);
      g.role = 'opposition';
      ld.isPM = false;
      text = '連立政権から離脱し、野党になった。';
    } else if (id === 'grill') {
      if (rand(state) < A.backfireChance) { ld.supportBonus += A.backfireSupport; text = '追及が空回りし、「批判ばかり」と報じられた。'; }
      else { setApproval(state, A.approval); ld.supportBonus += A.support; text = '予算委員会で政権を厳しく追及した。'; }
    } else if (id === 'noConf') {
      g.noConfCooldown = A.cooldown;
      const res = noConfidence(state, 'player');
      text = res.text;
      if (res.dissolution) {
        c.money -= act.money;
        ld.actionsLeft = 0;
        return { ok: true, text, dissolution: true };
      }
      if (!res.passed) ld.supportBonus += A.failSupport;
    } else if (id === 'pact') {
      const w = state.world;
      if (!w.parties[target]) return { ok: false, text: '相手を選んでください' };
      const will = Game.National.coopWillingness(state, target, 'unify');
      if (will >= 0) {
        w.coopPacts = w.coopPacts.filter((x) => x.partner !== target).concat([{ partner: target, type: 'unify' }]);
        text = `${LD().partyInfo(target).name}と、次の総選挙で候補者を一本化することで合意した。`;
      } else {
        text = `${LD().partyInfo(target).name}は野党共闘に乗らなかった。`;
      }
    }
    c.money -= act.money;
    ld.actionsLeft--;
    LD().addLog(state, `${ACTIONS[id].icon} ${text}`, 'action');
    return { ok: true, text };
  }

  // 法案が通った政策の約束を果たす
  function keepPolicy(state, policy) {
    const g = state.gov;
    const kept = [];
    for (const p in g.partners) {
      const part = g.partners[p];
      if (part.policies.includes(policy)) {
        part.policies = part.policies.filter((x) => x !== policy);
        part.satisfaction = clamp(part.satisfaction + GB().partner.keptPromise, 0, 100);
        state.career.promiseStats.kept++;
        kept.push(LD().partyInfo(p).name);
      }
    }
    const sup = state.support;
    if (sup) {
      for (const pr of sup.promises) {
        if (pr.status !== 'open' || pr.policy !== policy) continue;
        pr.progress = (pr.progress || 0) + GB().actions.bill.promise;
        if (pr.progress >= Game.Balance.term.promiseGoal) {
          pr.status = 'kept';
          sup.relations[pr.org] = clamp(sup.relations[pr.org] + Game.Balance.term.promiseKept, 0, 100);
          state.career.promiseStats.kept++;
          kept.push(Game.Data.ORGANIZATIONS[pr.org].name);
        }
      }
    }
    return kept;
  }

  // ---------------- 内閣不信任案 ----------------
  // by: 'player'(プレイヤーが野党として出す)/ 'ai'(野党が首相のプレイヤーに出す)
  function noConfidence(state, by) {
    const g = state.gov;
    const w = state.world;
    const ruling = g.coalition;
    let rulingVotes = lower(state, ruling);
    const defectors = [];
    for (const p in g.partners) {
      if (g.partners[p].satisfaction < GB().noConfidenceDefectAt) {
        rulingVotes -= LD().seatsOf(state, p);
        defectors.push(LD().partyInfo(p).name);
      }
    }
    const passed = rulingVotes < MAJ();
    if (!passed) {
      return { passed: false, text: `内閣不信任案は否決された(与党 ${rulingVotes}票)。` };
    }
    const text = `内閣不信任案が可決された!${defectors.length ? defectors.join('・') + 'が賛成に回った。' : ''}`;
    if (by === 'player') {
      // AI の首相は解散か総辞職
      if (rand(state) < GB().aiDissolveAfterNoConf) {
        state.leader.report = { title: '衆議院解散', lines: [text, `${g.pmName}首相は衆議院を解散した。総選挙で政権交代を狙う。`], event: null, dissolution: true };
        LD().addLog(state, '🗳 ' + text + '首相は解散を選んだ。', 'news');
        return { passed: true, text, dissolution: true };
      }
      LD().addLog(state, '🗳 ' + text + '内閣は総辞職した。', 'news');
      const f = aiForm(state, null);
      setGov(state, f.pmParty, f.coalition, {});
      return { passed: true, text: text + '内閣は総辞職し、新しい首相が選ばれた。' };
    }
    return { passed: true, text };
  }

  // ---------------- 毎ターン ----------------
  // 選択イベントを返すことがある(leader.js が pending にする)
  function turn(state, lines) {
    const g = ensure(state);
    const w = state.world;
    const ld = state.leader;
    const A = GB().approval;
    if (g.reshuffleCooldown > 0) g.reshuffleCooldown--;
    if (g.noConfCooldown > 0) g.noConfCooldown--;

    if (g.role === 'pm') {
      g.pmTurns++;
      Game.Economy.recordPM(state);   // 首相のあいだの経済と暮らし(レガシー評価)
      g.approvalSum += w.approval;
      g.approvalTurns++;
      // 長期政権の飽き
      let fat = 0;
      for (const f of A.fatigue) if (g.pmTurns >= f.from) fat = f.perTurn;
      if (fat) {
        setApproval(state, -fat);
        g.fatigue = Math.min(A.fatigueCap, (g.fatigue || 0) + fat);   // 支持率が戻っていく水準も下がる
        if (g.pmTurns % 4 === 0) lines.push(`長期政権への「飽き」が広がっている(支持率 毎ターン −${fat})。`);
      }
      // 内閣支持率は党の支持率にも響く
      ld.supportBonus += (w.approval - A.mean) * A.toSupport;
      // 改造後の失言
      if (g.scandalPending) {
        g.scandalPending = false;
        setApproval(state, GB().actions.reshuffle.scandalApproval);
        Game.Legacy.add(state, 'scandals');
        lines.push('改造で入閣した大臣の失言が問題になり、支持率が下がった。');
      }
      // 連立相手の満足度
      for (const p of Object.keys(g.partners)) {
        const part = g.partners[p];
        part.satisfaction -= GB().partner.decay + part.policies.length * GB().partner.unkeptPromise;
        if (part.satisfaction < GB().partner.leaveAt) {
          lines.push(`${LD().partyInfo(p).name}が「約束が守られていない」として連立を離脱した。`);
          g.coalition = g.coalition.filter((x) => x !== p);
          Game.Legacy.add(state, 'coalitionBreaks');
          state.career.promiseStats.broken += part.policies.length;   // 果たせなかった約束
          delete g.partners[p];
          LD().addLog(state, `💔 ${LD().partyInfo(p).name}が連立を離脱。`, 'news');
        }
      }
      if (minority(state)) lines.push(`与党は衆議院で過半数を割っている(少数与党)。法案が通りにくい。`);
    }

    // 参院選(3年ごと・夏)
    let ev = null;
    if (w.turnIndex === 1 && w.year === w.upper.nextYear) ev = upperElectionEvent(state);
    // 予算(通常国会)
    if (!ev && g.role === 'pm' && w.turnIndex === 0) ev = budgetEvent(state, lines);
    // 退陣要求
    if (g.role === 'pm') {
      g.lowTurns = w.approval < A.lowForResign ? g.lowTurns + 1 : 0;
      if (!ev && g.lowTurns >= A.lowTurns) ev = resignEvent(state, `内閣支持率が${Math.round(w.approval)}%に落ち込み、党内から退陣を求める声が上がっている。`);
      // 野党が不信任案を出す(支持率が低いとき)
      if (!ev && w.approval < 30 && rand(state) < 0.25) {
        const res = noConfidence(state, 'ai');
        lines.push(`野党が内閣不信任案を提出した。${res.text}`);
        if (res.passed) ev = noConfPassedEvent(state);
      }
    }
    return ev;
  }

  function budgetEvent(state, lines) {
    if (!twisted(state)) {
      lines.push('予算が成立した。');
      return null;
    }
    return {
      id: 'govBudget', title: '予算案の審議(ねじれ国会)',
      text: '参議院で野党が多数を握っている。予算関連法案が通らなければ政権運営は行き詰まる。',
      choices: [
        { id: 'compromise', label: '野党と修正協議する', note: '成立するが、首相の指導力が問われる(結束 −3)' },
        { id: 'force', label: '衆議院の優越で押し切る', note: '予算は成立するが、支持率が下がる' },
      ],
    };
  }

  function upperElectionEvent(state) {
    const S = GB().upper.strategy;
    return {
      id: 'govUpper', title: `${state.world.year}年 参議院選挙`,
      text: `参議院の半数(124議席)の改選。与党が参議院で過半数(${UMAJ()})を割ると「ねじれ」になり、法案が通りにくくなる。どう戦う?`,
      choices: Object.keys(S).map((k) => ({ id: k, label: S[k].label, note: k === 'single' ? '選挙区で議席を取りやすい' : k === 'pr' ? '比例の票が伸びる' : '当たれば大きく伸びるが、外すと逆効果' })),
    };
  }

  function resignEvent(state, why) {
    return {
      id: 'govResign', title: '退陣要求', text: why,
      choices: [
        { id: 'stay', label: '続投する', note: '党内の結束が下がり、支持率も少し下がる' },
        { id: 'resign', label: '退陣する', note: '首相を辞める(エンディング)' },
      ],
    };
  }

  function noConfPassedEvent(state) {
    return {
      id: 'govNoConf', title: '内閣不信任案が可決',
      text: '連立相手の造反で、内閣不信任案が可決された。10日以内に衆議院を解散するか、内閣総辞職かを選ばなければならない。',
      choices: [
        { id: 'dissolve', label: '衆議院を解散する', note: '総選挙で信を問う' },
        { id: 'resign', label: '内閣総辞職', note: '首相を辞める(エンディング)' },
      ],
    };
  }

  // 参院選の計算(半数改選)
  function runUpperElection(state, strategy) {
    const U = GB().upper;
    const w = state.world;
    const g = state.gov;
    const me = state.leader.party;
    const S = U.strategy[strategy] || {};
    const ids = Object.keys(w.parties).filter((id) => id !== 'indep' && w.parties[id].seats > 0);
    const lognorm = (sd) => Math.exp((rand(state) - 0.5) * 2 * sd * 1.7);
    const share = {};
    for (const p of ids) {
      let s = LD().supportOf(state, p) * lognorm(U.noise);
      if (p === me) {
        if (strategy === 'issue') s += rand(state) < S.risk ? -S.support : S.support * 1.6;
        else s += S.support || 0;
      }
      share[p] = Math.max(0.1, s);
    }
    // 政権与党は内閣支持率にも左右される
    for (const p of g.coalition) if (share[p]) share[p] *= 1 + (w.approval - 45) / 150;
    const prShare = Object.assign({}, share);
    if (strategy === 'pr' && prShare[me]) prShare[me] *= S.prMult;
    const pr = Game.Vote.dhondt(prShare, U.prSeats);
    const weights = {};
    let sum = 0;
    for (const p of ids) { weights[p] = Math.pow(share[p], U.districtPower); sum += weights[p]; }
    const dist = {};
    let given = 0;
    const rema = [];
    for (const p of ids) {
      const exact = (U.districtSeats * weights[p]) / sum;
      dist[p] = Math.floor(exact);
      given += dist[p];
      rema.push([p, exact - dist[p]]);
    }
    rema.sort((a, b) => b[1] - a[1]);
    for (let i = 0; given < U.districtSeats; i++, given++) dist[rema[i % rema.length][0]]++;
    const cls = w.upper.nextClass;
    const before = upper(state, g.coalition);
    const seats = {};
    for (const p of ids) seats[p] = (pr[p] || 0) + (dist[p] || 0);
    w.upper[cls] = seats;
    w.upper.nextClass = cls === 'A' ? 'B' : 'A';
    w.upper.nextYear += 3;
    const after = upper(state, g.coalition);
    return { seats, before, after, mine: seats[me] || 0, twisted: after < UMAJ() };
  }

  function resolve(state, ev, choice) {
    const g = state.gov;
    const ld = state.leader;
    let text = '';
    const out = { text, retire: false, dissolution: false };
    if (ev.id === 'govBudget') {
      const B = GB().budget;
      if (choice === 'compromise') { ld.cohesion = clamp(ld.cohesion - 3, 0, 100); text = '野党と修正協議を重ね、予算を成立させた。'; }
      else { setApproval(state, B.forceApproval); text = '衆議院の優越で予算を押し切った。「強行」と批判された。'; }
    } else if (ev.id === 'govUpper') {
      const r = runUpperElection(state, choice);
      const me = state.leader.party;
      const top = Object.entries(r.seats).sort((a, b) => b[1] - a[1]).map(([p, n]) => `${LD().partyInfo(p).short}${n}`).join('・');
      text = `参院選の結果:${LD().partyInfo(me).name}は${r.mine}議席(${top})。与党の参議院の議席は${r.before}→${r.after}。`;
      if (r.twisted && r.before >= UMAJ()) {
        text += '与党は参議院の過半数を失い、「ねじれ国会」になった。';
        if (g.role === 'pm') {
          ld.cohesion = clamp(ld.cohesion + GB().upper.lossCohesion, 0, 100);
          out.followup = resignEvent(state, '参院選で与党が過半数を割った。首相の責任を問う声が党内から上がっている。');
        }
      } else if (!r.twisted && r.before < UMAJ()) {
        text += '与党が参議院の過半数を回復し、ねじれが解消した。';
      }
      g.lastUpper = { year: state.world.year - 0, seats: r.seats, after: r.after };
    } else if (ev.id === 'govResign') {
      if (choice === 'stay') {
        ld.cohesion = clamp(ld.cohesion + GB().resign.continueCohesion, 0, 100);
        setApproval(state, GB().resign.continueApproval);
        g.lowTurns = 0;
        text = '続投を表明した。党内には不満がくすぶっている。';
      } else {
        text = '首相を辞任することを表明した。';
        out.ending = 'forcedResign';
      }
    } else if (ev.id === 'govNoConf') {
      if (choice === 'dissolve') {
        ld.report = { title: '衆議院解散', lines: ['内閣不信任案の可決を受けて、衆議院を解散した。'], event: null, dissolution: true };
        text = '衆議院を解散した。';
        out.dissolution = true;
      } else {
        text = '内閣総辞職を決めた。';
        out.ending = 'noConfidence';
      }
    } else if (ev.id === 'govLeaderTerm') {
      if (choice === 'run') {
        const p = reelectChance(state);
        const rival = (Game.Data.LEADER_RIVALS[ld.party] || [{ name: '党内の対抗馬' }])[0].name;
        if (rand(state) < p) {
          ld.terms = (ld.terms || 1) + 1;
          ld.termStart = state.world.year;
          ld.cohesion = clamp(ld.cohesion + 5, 0, 100);
          text = `党首選で${rival}らの挑戦を退け、再選された(${ld.terms}期目)。`;
        } else {
          text = `党首選で${rival}に敗れ、党首の座を明け渡した。`;
          out.ending = 'replaced';
        }
      } else {
        text = '党首選には出ず、後継を指名して退くことを表明した。';
        out.ending = 'successor';
      }
    } else if (ev.id === 'govLostPower') {
      if (choice === 'retire') {
        text = '政権を失った責任をとって党首を辞任し、政界を退くことを表明した。';
        out.ending = 'lostPower';
      } else {
        ld.cohesion = clamp(ld.cohesion + Game.Balance.leaderTerm.blameCohesion, 0, 100);
        text = '野党党首として再起を期すことを表明した。党内には責任を問う声もくすぶる。';
      }
    } else if (ev.id === 'govBlame') {
      if (choice === 'resign') {
        text = '総選挙の敗北の責任をとって党首を辞任した。';
        out.ending = 'replaced';
      } else {
        ld.cohesion = clamp(ld.cohesion + Game.Balance.leaderTerm.blameCohesion, 0, 100);
        text = '続投を表明した。党内には不満がくすぶっている。';
      }
    }
    out.text = text;
    return out;
  }

  // ---------------- 党首の任期(1期3年、連続2期まで) ----------------
  function reelectChance(state) {
    const R = Game.Balance.leaderTerm.reelect;
    const ld = state.leader;
    let p = R.base + (ld.cohesion - 50) * R.perCohesion + (ld.supportBonus || 0) * R.perSupport;
    if (state.gov && state.gov.role === 'pm') p += (state.world.approval - 35) * R.perApproval;
    p += Game.Faction.reelectDelta(state);   // 派閥の信頼(faction.js)
    return clamp(p, R.min, R.max);
  }
  function termDue(state) {
    const ld = state.leader;
    const T = Game.Balance.leaderTerm;
    return state.world.turnIndex === Game.Balance.term.promotion.turnIndex && ld.termStart !== undefined && state.world.year - ld.termStart >= T.years;
  }
  function leaderTermEvent(state) {
    const ld = state.leader;
    const T = Game.Balance.leaderTerm;
    const canRun = (ld.terms || 1) < T.maxTerms;
    const choices = [];
    if (canRun) choices.push({ id: 'run', label: '再選をめざして党首選に出る', note: `党内のライバルが挑戦してくる(再選の見込み 約${Math.round(reelectChance(state) * 100)}%)。負ければ党首交代` });
    choices.push({ id: 'successor', label: '後継を指名して退く', note: state.gov && state.gov.role === 'pm' && state.world.approval >= Game.Balance.legacy.successor.minApproval ? '支持の高いうちに退けばレガシー評価にボーナス' : '党首を退き、ゲームを終える' });
    return {
      id: 'govLeaderTerm', title: '党首の任期満了',
      text: canRun ? `党首としての任期(${T.years}年)が満了する。` : `党首として連続${T.maxTerms}期を務め上げた。党の規則で、もう党首選には出られない。`,
      choices,
    };
  }

  // 総選挙のあとの責任論(national.js から呼ぶ)
  function electionAftermath(state, wasPM, before) {
    const g = state.gov;
    const me = state.leader.party;
    const after = LD().seatsOf(state, me);
    if (wasPM && g.role !== 'pm' && !g.formation) {
      return {
        id: 'govLostPower', title: '政権交代',
        text: `総選挙で政権を失った。${LD().partyInfo(g.pmParty).name}の${g.pmName}が首相に就く。`,
        choices: [
          { id: 'stay', label: '野党党首として再起を期す', note: '党内の結束が下がる' },
          { id: 'retire', label: '責任をとって退く', note: 'エンディング:政権交代' },
        ],
      };
    }
    if (!wasPM && before > 0 && (before - after) / before >= Game.Balance.leaderTerm.blameLossShare) {
      return {
        id: 'govBlame', title: '敗北の責任論',
        text: `総選挙で議席を${before}から${after}に減らした。党内から党首の責任を問う声が上がっている。`,
        choices: [
          { id: 'stay', label: '続投する', note: '党内の結束が下がる' },
          { id: 'resign', label: '責任をとって辞任する', note: 'エンディング:党首交代' },
        ],
      };
    }
    return null;
  }

  // 合流したら参議院の議席も移す(merger.js から呼ぶ)
  function mergeUpper(state, from, to) {
    const u = state.world.upper;
    if (!u) return;
    for (const cls of ['A', 'B']) {
      if (u[cls][from]) { u[cls][to] = (u[cls][to] || 0) + u[cls][from]; delete u[cls][from]; }
    }
    if (state.gov) {
      const g = state.gov;
      if (g.coalition.includes(from)) {
        g.coalition = g.coalition.filter((p) => p !== from);
        delete g.partners[from];
      }
    }
  }

  return {
    ACTIONS, ensure, setGov, aiForm, afterElection, willingness, formationPartners, proposeCoalition, giveUpFormation, answerInvite,
    actions, billChance, billTargets, doAction, turn, resolve, mergeUpper, noConfidence,
    reelectChance, termDue, leaderTermEvent, electionAftermath,
    lower, upper, upperOf, twisted, minority, conflictsBetween,
  };
})();
