// 党首モードの総選挙(全国11ブロック)。準備(擁立・名簿・候補者調整)と、全国モードの選挙戦の組み立て、
// 議席の見込み、選挙のあとの反映。投票と開票は vote.js(runNationalElection)。DOMには触らない。
//
// 選挙戦は campaign.js を「全国モード」で使う:地域 = ブロック、候補 = 政党。
// camp.national = {
//   coverage: { 政党: { ブロック: 小選挙区の候補者数 } },
//   celebrities: { ブロック: 人数 }(プレイヤーの党),
//   listPolicy: 'dup' | 'solo', coops: [{ partner, type }], prev: 選挙前の議席, leaderParty,
// }
window.Game = window.Game || {};

Game.National = (function () {
  const NB = () => Game.Balance.national;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const BLOCKS = () => Game.Data.BLOCKS;
  const LD = () => Game.Leader;

  // 総選挙に候補を立てる党(プレイヤーの党を先頭に)
  function contestants(state) {
    const w = state.world;
    const me = state.leader.party;
    // 議席のない党は立てない。ただしプレイヤーの党と、対戦モードのもう1人の党(state.alsoRun)は必ず立てる
    const ids = Object.keys(w.parties).filter((id) => id !== 'indep' && (w.parties[id].seats > 0 || id === me || (state.alsoRun || []).includes(id)));
    if (!ids.includes('kofuku')) ids.push('kofuku');   // 幸福実現党は議席がなくても候補を立てる
    return [me].concat(ids.filter((id) => id !== me));
  }

  // 全国モードで使う政党の強さがない党(分裂でできた党など)に、仮の値を入れる
  function ensureBalance(state) {
    for (const id of contestants(state)) {
      if (!Game.Balance.parties[id]) {
        const p = state.world.parties[id] || {};
        Game.Balance.parties[id] = { support: 1 + (p.supportBonus || 0), lean: {}, orgStrength: 0.2, orgLean: {} };
      }
    }
  }

  // 党の規模による選挙戦の届く範囲(支持率から)
  function capacity(support) {
    const K = NB().capacity;
    return clamp(K.base + support * K.perSupport, K.min, K.max);
  }

  function aiCoverageRate(id) {
    const C = NB().aiCoverage;
    if (C[id] !== undefined) return C[id];
    return id.startsWith('splinter') ? C.splinter : 0.2;
  }

  // 党の今の議席のうち小選挙区の分を、ブロックの大きさに応じて割り振る(現職の数)
  function incumbents(state, party) {
    const seats = LD().seatsOf(state, party);
    const smdShare = Math.round(seats * 289 / 465);
    const out = {};
    let left = smdShare;
    BLOCKS().forEach((b, i) => {
      const n = i === BLOCKS().length - 1 ? left : Math.round(smdShare * b.smd / 289);
      out[b.id] = clamp(n, 0, b.smd);
      left -= out[b.id];
    });
    return out;
  }

  function defaultPrep(state) {
    const me = state.leader.party;
    const rate = aiCoverageRate(me);
    const inc = incumbents(state, me);
    const coverage = {};
    const celebrities = {};
    for (const b of BLOCKS()) {
      coverage[b.id] = clamp(Math.max(inc[b.id], Math.round(b.smd * rate)), 0, b.smd);
      celebrities[b.id] = 0;
    }
    if (coverage[Game.Data.HOME_BLOCK] < 1) coverage[Game.Data.HOME_BLOCK] = 1;   // 党首本人
    // 野党共闘などで前もって結んだ候補者調整を入れておく
    const coops = (state.world.coopPacts || []).filter((c) => LD().seatsOf(state, c.partner) > 0 && c.partner !== me);
    return { coverage, celebrities, listPolicy: 'dup', coops: coops.map((c) => Object.assign({}, c)) };
  }

  function funds(state) {
    const F = NB().funds;
    const me = state.leader.party;
    return Math.round(F.base + state.career.money + LD().seatsOf(state, me) * F.perSeat + LD().supportOf(state, me) * F.perSupport);
  }

  // 準備にかかる費用(現職の分はかからない)
  function prepCost(state, prep) {
    const inc = incumbents(state, state.leader.party);
    let cost = 0;
    for (const b of BLOCKS()) {
      cost += Math.max(0, prep.coverage[b.id] - inc[b.id]) * NB().candidateCost;
      cost += (prep.celebrities[b.id] || 0) * NB().celebrityCost;
    }
    const total = funds(state);
    return { funds: total, cost, remain: total - cost };
  }

  // ---------------- 候補者調整 ----------------
  const COOP_TYPES = {
    unify:   { name: '候補者を一本化', desc: '両党が立てる選挙区では、弱いほうが降りて票を譲り合う' },
    smdUs:   { name: '選挙区はこちら、比例は相手', desc: '相手はこちらの選挙区で候補を降ろし、こちらの支持者は比例で相手に入れる' },
    smdThem: { name: '選挙区は相手、比例はこちら', desc: 'こちらが相手の選挙区で候補を降ろし、相手の支持者は比例でこちらに入れる' },
  };

  function coopWillingness(state, partner, type) {
    const C = NB().coop;
    const me = state.leader.party;
    const conf = Game.Merger.conflicts(state, partner).length;
    const mine = LD().seatsOf(state, me);
    const theirs = LD().seatsOf(state, partner);
    const ratio = Math.min(C.ratioCap, theirs / Math.max(1, mine));
    let w = C.base - conf * C.conflictPenalty;
    // 政権を争う大政党どうしは組まない
    if (mine >= C.rivalSeats && theirs >= C.rivalSeats) w -= C.rivalPenalty;
    // 大きい相手に「選挙区を降りて」と頼むほど難しい
    if (type === 'smdUs') w -= C.biggerAskPenalty * ratio;
    if (type === 'unify' && theirs > mine) w -= (C.biggerAskPenalty / 2) * ratio;
    if (type === 'smdThem') w += C.favorPartnerBonus;
    return Math.round(w);
  }

  function coopPartners(state) {
    const me = state.leader.party;
    return contestants(state).filter((id) => id !== me && LD().seatsOf(state, id) > 0).map((id) => ({
      id, name: LD().partyInfo(id).name, seats: LD().seatsOf(state, id), conflicts: Game.Merger.conflicts(state, id),
      will: Object.fromEntries(Object.keys(COOP_TYPES).map((t) => [t, coopWillingness(state, id, t)])),
    }));
  }

  // ---------------- 全国モードの選挙戦を組み立てる ----------------
  function newNationalCampaign(state, prep, seed) {
    ensureBalance(state);
    const S = NB().start;
    const me = state.leader.party;
    const ids = contestants(state);
    // 小選挙区の擁立
    const coverage = {};
    for (const id of ids) {
      coverage[id] = {};
      const rate = aiCoverageRate(id);
      const inc = incumbents(state, id);
      for (const b of BLOCKS()) coverage[id][b.id] = id === me ? prep.coverage[b.id] : clamp(Math.max(inc[b.id], Math.round(b.smd * rate)), 0, b.smd);
    }
    // 選挙区は相手に譲る約束なら、こちらの擁立をその分減らす(相手が立てる選挙区で降ろす)
    for (const c of prep.coops) {
      if (c.type === 'smdUs') for (const b of BLOCKS()) coverage[c.partner][b.id] = 0;
    }
    const shift = {};
    const candidates = ids.map((id) => {
      const info = LD().partyInfo(id);
      // 全国選挙だけの補正(選挙区モードの調整を崩さないため、政党の強さそのものは変えない)
      // 首相が早すぎる解散をしたら「党利党略」批判(world.dissolvePenalty)
      const penalty = id === me ? state.world.dissolvePenalty || 0 : 0;
      const easy = id === me && state.difficulty === 'easy' ? Game.Balance.easy.nationalSupport : 0;   // イージーモード
      const econ = state.gov && state.gov.coalition.includes(id) ? Game.Economy.windForRuling(state) : 0;   // 経済の指標の「気分」(M14)
      const support = Math.max(0.3, LD().supportOf(state, id) + ((NB().supportAdjust || {})[id] || 0) - penalty + easy + econ);
      shift[id] = support - Game.Balance.parties[id].support;
      const seats = LD().seatsOf(state, id);
      const recogBase = clamp(S.recogBase + support * S.recogPerSupport + (seats >= S.recogBigSeats ? S.recogBigParty : 0), 15, S.recogMax);
      const recog = {};
      const personal = {};
      for (const b of BLOCKS()) {
        const covFrac = coverage[id][b.id] / b.smd;
        const presence = S.coverageMin + (1 - S.coverageMin) * covFrac;
        recog[b.id] = recogBase;
        personal[b.id] = (S.personalBase + (seats / Game.Data.HOUSE_SEATS) * S.personalPerSeatShare + support * S.personalPerSupport) * presence;
        if (id === me && prep.celebrities[b.id]) {
          recog[b.id] = Math.min(100, recog[b.id] + prep.celebrities[b.id] * NB().celebrity.recog);
          personal[b.id] += prep.celebrities[b.id] * NB().celebrity.personal;
        }
      }
      return {
        id: id === me ? 'player' : 'party_' + id, name: info.name, party: id, isPlayer: id === me, role: 'party',
        recog, personal, skill: id === me ? 1 : (NB().aiSkillOverride[id] ?? NB().aiSkill * capacity(support)), leaderVisits: 0,
      };
    });
    const remain = prepCost(state, prep).remain;
    const sup = state.support || {};
    const camp = Game.Campaign.create({
      mode: 'national', seed, candidates,
      player: { money: Math.max(0, remain) + (state.difficulty === 'easy' ? Game.Balance.easy.money : 0) },
      support: { pledges: (sup.pledges || []).slice(), carried: { relations: sup.relations, promises: (sup.promises || []).filter((p) => p.status === 'open'), banned: [] } },
      partyShift: shift,
      sns: Game.Sns.ensure(state),   // 党首のSNSの話題度・好感度を一部持ち越す
    });
    camp.player.capacity = capacity(LD().supportOf(state, me));
    camp.national = {
      coverage, celebrities: Object.assign({}, prep.celebrities), listPolicy: prep.listPolicy, coops: prep.coops.slice(),
      prev: Object.fromEntries(ids.map((id) => [id, LD().seatsOf(state, id)])),
      leaderParty: me,
      requirement: Game.Career.isCustom(state) ? !!state.party.requirement : true,
    };
    return camp;
  }

  // ---------------- 議席の見込み(画面の表示用) ----------------
  // 小選挙区は得票率の k 乗の比で配る(小選挙区は大きい党に有利)。比例はドント式
  function project(camp, sharesMap) {
    const sh = sharesMap || Game.Campaign.shares(camp);
    const out = {};
    camp.candidates.forEach((c) => (out[c.party] = { smd: 0, pr: 0 }));
    for (const b of BLOCKS()) {
      const s = sh[b.id];
      let sum = 0;
      const w = {};
      for (const c of camp.candidates) {
        const cov = camp.national.coverage[c.party][b.id] / b.smd;
        w[c.party] = Math.pow(s[c.id], 2.6) * cov;
        sum += w[c.party];
      }
      for (const p in w) out[p].smd += sum > 0 ? (b.smd * w[p]) / sum : 0;
      const votes = {};
      for (const c of camp.candidates) votes[c.party] = s[c.id];
      const pr = Game.Vote.dhondt(votes, b.pr);
      for (const p in pr) out[p].pr += pr[p];
    }
    for (const p in out) {
      out[p].smd = Math.round(out[p].smd);
      out[p].total = out[p].smd + out[p].pr;
    }
    return out;
  }

  // ---------------- 選挙のあと ----------------
  function afterElection(state) {
    const el = state.election;
    const w = state.world;
    const ld = state.leader;
    const me = ld.party;
    const before = LD().seatsOf(state, me);
    const parties = {};
    for (const id in el.seats) if (el.seats[id].total > 0 || w.parties[id]) parties[id] = { seats: el.seats[id].total };
    // 無所属などは選挙で消える(全員が政党の候補として戦ったとみなす)
    for (const id in w.parties) if (!(id in parties) && id !== 'indep' && w.parties[id].splinter) parties[id] = { seats: 0, splinter: true, name: w.parties[id].name, short: w.parties[id].short, color: w.parties[id].color };
    parties.indep = { seats: Math.max(0, Game.Data.HOUSE_SEATS - Object.values(parties).reduce((s, p) => s + p.seats, 0)) };
    w.parties = parties;
    const after = LD().seatsOf(state, me);
    Game.Legacy.stats(state).maxSeats = Math.max(Game.Legacy.stats(state).maxSeats || 0, after);   // 殿堂(hall.js)
    const A = NB().afterCohesion;
    ld.cohesion = clamp(ld.cohesion + (after >= before ? A.gain : A.loss), 0, 100);
    if (Game.Career.isCustom(state)) {
      state.party.mps = after;
      const share = el.prShareNational[me] || 0;
      state.party.requirement = after >= Game.Balance.newParty.requirement.mps || share >= Game.Balance.newParty.requirement.share;
      Game.NewParty.register(state.party);
    }
    w.termElapsed = 0;
    w.lastGeneralElection = { year: w.year, seats: Object.fromEntries(Object.keys(el.seats).map((id) => [id, el.seats[id].total])) };
    state.career.money = Math.max(0, Math.round(state.campaign.player.money * 0.5));
    if (state.campaign.support) state.support = Object.assign(state.support || {}, Game.Support.exportState(state.campaign));
    if (state.campaign.sns) state.sns = Game.Sns.create(state.campaign.sns);
    const total = el.seats[me] ? el.seats[me].total : 0;
    const majority = total >= Game.Data.MAJORITY;
    // 選挙協力の約束と「党利党略」批判は、この選挙で使い終わり
    w.coopPacts = [];
    w.dissolvePenalty = 0;
    // 政権の行方(government.js)
    const wasPM = state.gov && state.gov.role === 'pm';
    const phase = Game.Gov.afterElection(state);
    const g = state.gov;
    const lines = [`${LD().partyInfo(me).name}は${total}議席(選挙前 ${before})。`];
    if (phase === 'negotiate') {
      lines.push('どの党も過半数に届かなかった。連立交渉が始まる。');
    } else if (g.role === 'pm') {
      lines.push(wasPM ? '単独で過半数を確保し、政権を維持した。' : '単独で過半数を確保した。政権交代だ!首班指名を経て、内閣総理大臣に就任した。');
    } else {
      lines.push(`${LD().partyInfo(g.pmParty).name}が単独で過半数を取った。${wasPM ? '政権を失い、野党になった。' : '野党として政権を追及していく。'}`);
    }
    // 政権交代・敗北の責任論(government.js)
    const aftermath = Game.Gov.electionAftermath(state, wasPM, before);
    if (aftermath) ld.pending = aftermath;
    ld.report = { title: `${w.year}年 総選挙の結果`, lines, event: aftermath };
    LD().addLog(state, `🗳 総選挙:${total}議席(選挙前 ${before})。`, 'news');
    return { before, after, majority, phase };
  }

  return {
    COOP_TYPES, contestants, ensureBalance, incumbents, defaultPrep, funds, prepCost,
    coopWillingness, coopPartners, newNationalCampaign, project, afterElection, capacity,
  };
})();
