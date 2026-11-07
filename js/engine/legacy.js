// エンディングとレガシー評価(S〜D)。DOMには触らない。
//
// 途中の記録は state.stats に集める:
//   { scandals, coalitionBreaks, twistedFails, careerBills, maxPostLevel, wasLeader, wasPM }
// 終わったら state.ending = { type, reason, score, grade, items: [{ label, value, points }], ... } を作る。
window.Game = window.Game || {};

Game.Legacy = (function () {
  const LB = () => Game.Balance.legacy;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const ENDINGS = {
    greatPM:          { title: '名宰相として退陣', text: '支持の高いうちに後進に道を譲った。人々は長くその名を語り継ぐだろう。' },
    longPM:           { title: '長期政権の末に退陣', text: '長い政権を担い、時代に名を刻んだ。その功罪は、これから歴史が判断する。' },
    lostPower:        { title: '政権交代', text: '総選挙で政権を失い、首相の座を去った。民意は新しい顔を選んだ。' },
    replaced:         { title: '党首交代', text: '党の顔の座を退いた。政治の世界では、去る者があれば来る者がある。' },
    oppositionLeader: { title: '野党党首のまま', text: '党首として戦い抜いたが、政権には手が届かなかった。' },
    minister:         { title: '大臣どまり', text: '大臣まで上りつめたが、党の頂点には届かなかった。' },
    governor:         { title: '知事に転身', text: '国政を離れ、知事として地元の政治を担う道を選んだ。永田町では見えなかった景色が、そこにはある。' },
    backbencher:      { title: '陣笠議員どまり', text: '議員として地元に尽くした。表舞台に立つことは少なかったが、その仕事は確かに残った。' },
  };

  function stats(state) {
    if (!state.stats) state.stats = { scandals: 0, coalitionBreaks: 0, twistedFails: 0, careerBills: 0, maxPostLevel: 0, wasLeader: false, wasPM: false };
    return state.stats;
  }
  function add(state, key, n) {
    const s = stats(state);
    s[key] = (s[key] || 0) + (n === undefined ? 1 : n);
  }

  // 到達した地位
  function rankKey(state) {
    const s = stats(state);
    if (s.wasPM || (state.gov && state.gov.pmTurns > 0)) return 'pm';
    if (s.wasLeader || state.leader) return 'leader';
    const lvl = Math.max(s.maxPostLevel || 0, (state.career && state.career.postLevel) || 0);
    return ['backbencher', 'seimukan', 'fukudaijin', 'minister', 'executive'][lvl] || 'backbencher';
  }
  const RANK_LABEL = { backbencher: '平議員', seimukan: '政務官', fukudaijin: '副大臣・委員長', minister: '大臣', executive: '党役員', leader: '党首', pm: '内閣総理大臣' };

  // エンディングの種類を決める(reason: 'successor' | 'retire' | 'forcedResign' | 'noConfidence' | 'lostPower' | 'replaced')
  function classify(state, reason) {
    const g = state.gov;
    const L = LB();
    if (reason === 'lostPower') return 'lostPower';
    if (reason === 'replaced') return 'replaced';
    if (reason === 'governor') return 'governor';
    const pmYears = g ? g.pmTurns / 4 : 0;
    const isPM = g && g.role === 'pm';
    if (isPM || pmYears > 0) {
      if (pmYears >= L.longPMYears) return 'longPM';
      if ((reason === 'successor' || reason === 'retire') && state.world.approval >= L.greatPMApproval) return 'greatPM';
      if (reason === 'forcedResign' || reason === 'noConfidence') return 'replaced';
      return isPM ? 'replaced' : 'oppositionLeader';
    }
    if (state.leader) return 'oppositionLeader';
    const lvl = Math.max(stats(state).maxPostLevel || 0, (state.career && state.career.postLevel) || 0);
    return lvl >= 3 ? 'minister' : 'backbencher';
  }

  // 点数の内訳
  function score(state, reason) {
    const L = LB();
    const s = stats(state);
    const g = state.gov;
    const c = state.career;
    const items = [];
    const push = (label, value, points) => items.push({ label, value, points: Math.round(points * 10) / 10 });

    const pmYears = g ? g.pmTurns / 4 : 0;
    push('首相の在任期間', `${pmYears.toFixed(1)}年`, Math.min(L.pmYears.max, pmYears * L.pmYears.per));
    if (g && g.approvalTurns) {
      const avg = g.approvalSum / g.approvalTurns;
      push('平均内閣支持率', `${Math.round(avg)}%`, clamp((avg - L.approval.from) * L.approval.per, 0, L.approval.max));
    } else {
      push('平均内閣支持率', '—', 0);
    }
    const bills = (g ? g.billsPassed : 0) + (s.careerBills || 0);
    push('成立させた法案', `${bills}本`, Math.min(L.bills.max, bills * L.bills.per));
    const kept = c.promiseStats.kept;
    const broken = c.promiseStats.broken;
    const ratio = kept + broken ? kept / (kept + broken) : null;
    push('約束を守った割合', ratio === null ? '約束なし' : `${Math.round(ratio * 100)}%(${kept}/${kept + broken})`, ratio === null ? L.promises.none : ratio * L.promises.max);
    push('当選回数', `${c.wins}回`, Math.min(L.wins.max, c.wins * L.wins.per));
    const rk = rankKey(state);
    push('到達した地位', RANK_LABEL[rk], L.rank[rk]);
    const successor = reason === 'successor' && state.world.approval >= L.successor.minApproval;
    if (successor) push('支持の高いうちに後継を指名', `支持率${Math.round(state.world.approval)}%`, L.successor.bonus);
    if (reason === 'governor' && state.governor) push('知事に当選', `${state.governor.place}(得票率${Math.round(state.governor.share * 100)}%)`, Game.Balance.local.legacyGovernor);
    // 経済と暮らし(M14):首相のあいだの指標の「気分」の平均、辞めるときの財政
    for (const it of Game.Economy.legacyItems(state)) push(it.label, it.value, it.points);
    // 減点
    if (s.scandals) push('不祥事', `${s.scandals}件`, -s.scandals * L.scandal);
    if (s.coalitionBreaks) push('連立の崩壊', `${s.coalitionBreaks}回`, -s.coalitionBreaks * L.coalitionBreak);
    if (s.twistedFails) push('ねじれでの廃案', `${s.twistedFails}本`, -Math.min(L.twistedFailMax, s.twistedFails * L.twistedFail));
    const total = Math.round(items.reduce((a, b) => a + b.points, 0));
    const grade = L.grades.find((x) => total >= x.min).g;
    return { items, total, grade };
  }

  // ゲームを終える
  function finish(state, reason) {
    const type = classify(state, reason);
    const sc = score(state, reason);
    const g = state.gov;
    state.ending = {
      type, reason, title: ENDINGS[type].title, text: ENDINGS[type].text,
      year: state.world ? state.world.year : null,
      score: sc.total, grade: sc.grade, items: sc.items,
      party: state.player.party,
      pmYears: g ? g.pmTurns / 4 : 0,
      elections: (state.career.elections || []).length,
      wins: state.career.wins,
    };
    state.screen = 'ending';
    return state.ending;
  }

  return { ENDINGS, RANK_LABEL, stats, add, classify, score, finish, rankKey };
})();
