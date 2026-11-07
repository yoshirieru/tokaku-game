// 合流・合併の交渉。党名・代表・政策・候補者調整を決めて相手に持ちかける。
// 議席は増えるが党内の結束が下がる。相手の支持母体(宗教団体を含む)の要望も引き継ぐ。DOMには触らない。
//
// terms = {
//   name: 'ours' | 'theirs' | 'fresh', freshName, freshShort,
//   leader: 'keep' | 'posts'(自分が大きいとき) / 'keep' | 'co' | 'yield'(自分が小さいとき),
//   policy: 'ours' | 'theirs' | 'both',
//   candidates: 'ours' | 'theirs' | 'incumbent',
// }
window.Game = window.Game || {};

Game.Merger = (function () {
  const MB = () => Game.Balance.merger;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const L = () => Game.Leader;

  function platformOf(state, id) {
    if (id === state.leader.party && state.support) return state.support.pledges;
    return Game.Data.PARTY_PLATFORMS[id] || [];
  }

  // 基本政策がぶつかる組
  function conflicts(state, partner) {
    const ours = platformOf(state, state.leader.party);
    const theirs = platformOf(state, partner);
    const out = [];
    for (const a of ours) for (const b of theirs) if (Game.Support.conflicts(a, b)) out.push([a, b]);
    return out;
  }

  // 交渉できる相手
  function partners(state) {
    const ld = state.leader;
    const w = state.world;
    return Object.keys(w.parties)
      .filter((id) => id !== ld.party && id !== 'indep' && w.parties[id].seats > 0 && !w.parties[id].splinter)
      .map((id) => {
        const info = L().partyInfo(id);
        return {
          id, name: info.name, color: info.color, seats: w.parties[id].seats,
          conflicts: conflicts(state, id), backers: Game.Data.PARTY_BACKERS[id] || [],
          cooldown: ld.cooldowns[id] || 0, real: !!info.real,
        };
      })
      .sort((a, b) => b.seats - a.seats);
  }

  function isSmaller(state, partner) {
    return L().seatsOf(state, state.leader.party) < L().seatsOf(state, partner);
  }

  function defaultTerms(state, partner) {
    return { name: 'fresh', freshName: '', freshShort: '', leader: isSmaller(state, partner) ? 'co' : 'posts', policy: 'both', candidates: 'incumbent' };
  }

  // 相手の前向き度と、結束への影響を見積もる
  function evaluate(state, partner, terms) {
    const B = MB();
    const T = B.terms;
    const ours = L().seatsOf(state, state.leader.party);
    const theirs = L().seatsOf(state, partner);
    const smaller = ours < theirs;
    const conf = conflicts(state, partner);
    let willing = B.baseWillingness - Math.min(B.sizePenaltyMax, (theirs / Math.max(1, ours)) * B.sizePenalty) - conf.length * B.conflictPenalty;
    let drop = B.baseCohesionDrop + (theirs / (ours + theirs)) * B.sizeCohesion + conf.length * B.conflictCohesion;
    const add = (t) => { willing += t.willing; drop -= t.cohesion; };
    add(T.name[terms.name]);
    add((smaller ? T.leader.smaller : T.leader.bigger)[terms.leader]);
    add(T.policy[terms.policy]);
    add(T.candidates[terms.candidates]);
    // 支持母体の要望が自分の公約とぶつかると、党内がもめる
    const pledges = state.support ? state.support.pledges : [];
    const backerClash = (Game.Data.PARTY_BACKERS[partner] || []).filter((org) => Game.Support.conflictPairs(pledges, Game.Data.ORGANIZATIONS[org].policies).length > 0);
    drop += backerClash.length * 4;
    return { willing: Math.round(willing), drop: Math.max(0, Math.round(drop)), smaller, conflicts: conf, ours, theirs, backerClash };
  }

  // 提案する。受け入れられれば合流する
  function propose(state, partner, terms) {
    const ld = state.leader;
    const info = L().partyInfo(partner);
    const ev = evaluate(state, partner, terms);
    L().spendAction(state);
    if (ev.willing < 0) {
      ld.cooldowns[partner] = MB().cooldownTurns;
      const text = `${info.name}との合流交渉は決裂した。「条件が折り合わない」と先方は席を立った。`;
      L().addLog(state, `🤝 ${text}`, 'news');
      return { accepted: false, text };
    }
    return { accepted: true, text: merge(state, partner, terms, ev) };
  }

  function merge(state, partner, terms, ev) {
    const ld = state.leader;
    const w = state.world;
    const B = MB();
    const ourId = ld.party;
    const ourInfo = L().partyInfo(ourId);
    const theirInfo = L().partyInfo(partner);
    const oldName = ourInfo.name;
    const seats = w.parties[partner].seats;

    // 議席と支持率:合流後の支持率 =(自分 + 相手)× supportSynergy
    const supportUs = L().supportOf(state, ourId);
    const supportThem = L().supportOf(state, partner);
    ld.supportBonus += supportThem * B.supportSynergy - supportUs * (1 - B.supportSynergy);
    w.parties[ourId].seats += seats;
    if (Game.Gov) Game.Gov.mergeUpper(state, partner, ourId);   // 参議院の議席も合流
    delete w.parties[partner];
    if (Game.Career.isCustom(state)) state.party.mps = w.parties[ourId].seats;

    // 党名
    let newName = oldName;
    let newShort = ourInfo.short;
    if (terms.name === 'theirs') { newName = theirInfo.name; newShort = theirInfo.short; }
    if (terms.name === 'fresh') { newName = terms.freshName || `${oldName}・${theirInfo.short}連合`; newShort = terms.freshShort || newName.slice(0, 2); }
    if (newName !== oldName) {
      if (Game.Career.isCustom(state)) {
        state.party.name = newName;
        state.party.short = newShort;
        Game.NewParty.register(state.party);
      } else {
        state.partyOverrides = state.partyOverrides || {};
        state.partyOverrides[ourId] = { name: newName, short: newShort };
        Object.assign(Game.Data.PARTIES[ourId], state.partyOverrides[ourId]);
      }
    }

    // 代表
    if (ev.smaller && terms.leader === 'co') ld.role = '共同代表';
    if (ev.smaller && terms.leader === 'yield') ld.role = '幹事長';

    // 政策
    if (state.support) {
      const theirs = Game.Data.PARTY_PLATFORMS[partner] || [];
      if (terms.policy === 'theirs') state.support.pledges = theirs.slice(0, 3);
      if (terms.policy === 'both') state.support.pledges = [...new Set(state.support.pledges.concat(theirs))];
    }

    // 相手の支持母体の要望を引き継ぐ
    const backers = (Game.Data.PARTY_BACKERS[partner] || []).filter((org) => Game.Data.ORGANIZATIONS[org]);
    const inherited = [];
    if (state.support) {
      for (const org of backers) {
        const o = Game.Data.ORGANIZATIONS[org];
        state.support.relations[org] = Math.max(state.support.relations[org] || 0, B.backerRelation);
        const policy = o.policies.find((p) => !state.support.promises.some((q) => q.org === org && q.policy === p && q.status === 'open'));
        if (policy) {
          state.support.promises.push({ org, policy, year: w.year, status: 'open', progress: 0, inherited: true });
          inherited.push(`${o.name}「${Game.Data.POLICIES[policy].name}」`);
        }
      }
    }

    // 結束
    ld.cohesion = clamp(ld.cohesion - ev.drop, 0, 100);
    ld.friction += ev.drop * 0.15;   // 合流のしこりはしばらく残る
    ld.merges.push({ partner, partnerName: theirInfo.name, seats, year: w.year, drop: ev.drop, backers, terms: Object.assign({}, terms) });

    const parts = [`${theirInfo.name}(${seats}議席)との合流が決まった。新しい党は「${newName}」、衆議院${w.parties[ourId].seats}議席。`];
    if (ld.role !== '代表') parts.push(ld.role === '共同代表' ? 'あなたは共同代表に就いた。' : '代表の座を譲り、あなたは幹事長に就いた。');
    if (inherited.length) parts.push(`支持母体の要望も引き継いだ:${inherited.join('、')}。`);
    parts.push(`党内の結束は ${ev.drop} 下がった。`);
    const text = parts.join('');
    L().addLog(state, `🤝 ${text}`, 'news');
    return text;
  }

  return { partners, conflicts, isSmaller, defaultTerms, evaluate, propose };
})();
