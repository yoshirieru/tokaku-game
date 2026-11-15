// 国の指標と「30年後の新聞」(R14)。DOM には触らない。数値は balance.js の future、文面は js/data/future.js。
// 状態は state.future = { turns(任期の会期の数。年を数える), decisions: [決定] }
//   決定 = { kind 'budget' 予算編成 | 'policy' 約束・公約を果たした, id, year, weight(立場による重み), role, now(すぐ出た効果の説明) }
//   すぐ出る効果(内閣支持率・地盤・党への貢献)はその場で効き、長い効き目は決定として記録して、指標は年ごとに計算する(value)
window.Game = window.Game || {};

Game.Future = (function () {
  const R = Game.Rng;
  const F = function () { return Game.Balance.future; };
  const KEYS = function () { return Game.Data.INDICATOR_ORDER; };

  function get(state) {
    if (!state.future) state.future = { turns: 0, decisions: [] };
    return state.future;
  }
  function year(state) { return F().startYear + Math.floor(get(state).turns / 2); }
  // 決定するときの立場
  function role(state) {
    const cr = state.career;
    if (cr && cr.leader && cr.gov) return cr.gov.role === 'pm' ? 'pm' : cr.gov.role === 'junior' ? 'junior' : 'opposition';
    return 'member';
  }
  function longOf(d) { return d.kind === 'budget' ? F().budget[d.id].long : F().policies[d.id] || {}; }
  function titleOf(d) { return d.kind === 'budget' ? Game.Data.BUDGET[d.id].title : Game.Data.POLICY_TITLES[d.id] || d.id; }
  function record(state, kind, id, weight, now) {
    if (!weight) return;
    // 同じ決定をくり返すほど、新しく足される効き目は小さくなる(repeat 倍ずつ)
    const same = get(state).decisions.filter(function (d) { return d.kind === kind && d.id === id; }).length;
    weight *= Math.pow(F().repeat, same);
    get(state).decisions.push({ kind: kind, id: id, year: year(state), weight: Math.round(weight * 100) / 100, role: role(state), now: now || '' });
  }
  // 約束・公約を果たしたとき(career.js)。全国の公約は立場の重み、地元の約束は local
  function recordPolicy(state, id) {
    const nat = Game.Data.PROMISES[id] && Game.Data.PROMISES[id].national;
    record(state, 'policy', id, nat ? F().weight[role(state)] : F().local);
  }

  // 会期の始まり(career.js の startTurn):年を進め、議員なら毎年の通常国会で予算編成の知らせ
  function tick(state) {
    const fu = get(state), cr = state.career;
    fu.turns += 1;
    if (cr.status !== 'member' || cr.turn % 2 !== 1) return false;
    const ids = Object.keys(F().budget), opts = [];
    while (opts.length < Math.min(F().budgetOffer, ids.length)) {
      const id = ids[Math.floor(R.next(state) * ids.length)];
      if (opts.indexOf(id) < 0) opts.push(id);
    }
    cr.pending.push({ type: 'budget', options: opts, role: role(state) });
    return true;
  }
  // 予算編成のすぐ出る効果の説明
  function nowText(state, id) {
    const r = role(state), b = F().budget[id];
    if (r === 'pm') return '内閣支持率 ' + (b.approval > 0 ? '+' : '') + b.approval;
    if (r === 'member' && id === 'local') return '選んでいる地区の地盤 +1';
    return '党への貢献 +1';
  }
  // 予算編成の重点を決める
  function answerBudget(state, id) {
    const cr = state.career, p = cr.pending[0];
    if (!p || p.type !== 'budget' || p.options.indexOf(id) < 0) return null;
    const r = role(state), b = F().budget[id];
    if (r === 'pm') Game.Career.changeApproval(cr, b.approval);
    else if (r === 'member' && id === 'local') cr.base[cr.sel] = Math.min(Game.Balance.comeback.baseMax, (cr.base[cr.sel] || 0) + 1);
    else { cr.contrib += 1; cr.merit += 1; }
    record(state, 'budget', id, F().weight[r], nowText(state, id));
    cr.pending.shift();
    const head = r === 'pm' ? '予算案を閣議決定した' : r === 'member' ? '党の部会で予算の要望を通した' : r === 'junior' ? '連立与党として予算に注文をつけた' : '野党の対案として示した';
    cr.news = head + ':「' + Game.Data.BUDGET[id].name + '」(' + nowText(state, id) + ')。効き目の多くは、数年から数十年かけて出る。';
    return { text: cr.news };
  }

  // 指標の値(年 y の時点)。始まりの値 + 傾き + 決定の効き目(遅れて出る)+ ほかの指標とのつながり(link)
  function raw(state, k, y) {
    const B = F();
    let v = B.start[k] + B.trend[k] * (y - B.startYear);
    get(state).decisions.forEach(function (d) {
      const e = longOf(d)[k];
      if (!e) return;
      v += d.weight * e * Math.max(0, Math.min(1, (y - d.year) / B.lag[k]));
    });
    return v;
  }
  function value(state, k, y) {
    const B = F(), L = (B.link || {})[k] || {};
    let v = raw(state, k, y);
    Object.keys(L).forEach(function (j) { v += (raw(state, j, y) - B.start[j]) * L[j]; });
    return Math.max(0, Math.min(100, v));
  }
  // 決定の、年 y の時点での効き目(指標ごと)
  function impact(d, k, y) {
    const e = longOf(d)[k];
    return e ? d.weight * e * Math.max(0, Math.min(1, (y - d.year) / F().lag[k])) : 0;
  }

  // 30年後の新聞を組み立てる(retire で1回だけ。state.ending.paper に持つ)
  function paper(state) {
    const B = F(), D = Game.Data, fu = get(state), cr = state.career || {};
    // 紙面の偶然は、ゲームの乱数を使わず、種から作る(読み直しても同じ紙面)
    let x = (Math.abs(state.rng | 0) ^ 0x5bd1e995) | 0;
    const rnd = function () { x = (x * 1103515245 + 12345) | 0; return ((x >>> 8) & 0xffff) / 65536; };
    const pick = function (a) { return a[Math.floor(rnd() * a.length)]; };
    const now = year(state), then = now + B.horizon;
    const ind = {};
    KEYS().forEach(function (k) {
      const v0 = B.start[k], v1 = value(state, k, now), v2 = value(state, k, then);
      ind[k] = { start: Math.round(v0), now: Math.round(v1), then: Math.round(v2), delta: v2 - v0 };
    });
    const byMove = KEYS().slice().sort(function (a, b) { return Math.abs(ind[b].delta) - Math.abs(ind[a].delta); });
    const goods = KEYS().filter(function (k) { return ind[k].delta >= B.big; }).sort(function (a, b) { return ind[b].delta - ind[a].delta; });
    const bads = KEYS().filter(function (k) { return ind[k].delta <= -B.big; }).sort(function (a, b) { return ind[a].delta - ind[b].delta; });
    let tone, headline, lead = [];
    if (goods.length && bads.length) {
      tone = 'mixed';
      headline = pick(D.MIXED_HEADLINES).replace('{good}', D.INDICATORS[goods[0]].name).replace('{bad}', D.INDICATORS[bads[0]].name);
      lead = [goods[0], bads[0]];
    } else if (goods.length) {
      tone = 'good'; headline = pick(D.HEADLINES[goods[0]].good); lead = [goods[0]];
    } else if (bads.length) {
      tone = 'bad'; headline = pick(D.HEADLINES[bads[0]].bad); lead = [bads[0]];
    } else {
      tone = 'quiet'; headline = pick(D.QUIET_HEADLINES);
    }
    const subs = byMove.filter(function (k) { return lead.indexOf(k) < 0; }).slice(0, 2).map(function (k) {
      const i = ind[k], N = D.INDICATORS[k];
      return N.name + 'は' + (i.delta >= 0 ? N.up : N.down) + '(' + i.start + ' → ' + i.then + ')';
    });
    // コラム:30年後に効いた決定を3つ
    const rank = ['平議員', '政務官', '副大臣', '大臣', '党三役', '党首'][cr.bestRank || 0];
    const who = cr.wasPM ? '元首相' : cr.leader ? '元党首' : (cr.bestRank || 0) >= 3 ? '元' + rank : cr.wins ? '元衆院議員' : '元候補';
    const decided = fu.decisions.map(function (d) {
      let pos = null, neg = null, sum = 0;
      KEYS().forEach(function (k) {
        const v = impact(d, k, then);
        sum += Math.abs(v);
        if (v > 0 && (!pos || v > pos.v)) pos = { k: k, v: v };
        if (v < 0 && (!neg || v < neg.v)) neg = { k: k, v: v };
      });
      return { d: d, sum: sum, pos: pos, neg: neg };
    }).sort(function (a, b) { return b.sum - a.sum; }).slice(0, 3).map(function (o) {
      const t = '「' + titleOf(o.d) + '」(' + o.d.year + '年)は、';
      const p = o.pos ? D.COLUMN_PHRASES.good.replace('{k}', D.INDICATORS[o.pos.k].name) : '';
      const n = o.neg ? D.COLUMN_PHRASES.bad.replace('{k}', D.INDICATORS[o.neg.k].name) : '';
      return t + (p && n ? p + '一方で、' + n : p || n) + '。';
    });
    // 読者の投稿:良い声・悪い声・もう1つ
    const seat = Game.Data.SEATS[state.player.seat || 'hokuyo3'], area = seat.name.replace(/\d+区$/, '');
    const voiceKeys = [];
    if (goods[0]) voiceKeys.push([goods[0], 'good']);
    if (bads[0]) voiceKeys.push([bads[0], 'bad']);
    byMove.forEach(function (k) { if (voiceKeys.length < 3 && !voiceKeys.some(function (v) { return v[0] === k; })) voiceKeys.push([k, ind[k].delta >= 0 ? 'good' : 'bad']); });
    const used = {};
    const letters = voiceKeys.map(function (v) {
      let person;
      do { person = pick(D.LETTER_PEOPLE); } while (used[person[0]] && Object.keys(used).length < D.LETTER_PEOPLE.length);
      used[person[0]] = true;
      const place = area + '・' + pick(seat.regions).name;
      return { text: D.LETTERS[v[0]][v[1]], who: place + '・' + person[0] + '・' + person[1] + '歳', tone: v[1] };
    });
    const month = 1 + Math.floor(rnd() * 12), day = 1 + Math.floor(rnd() * 28);
    const wd = '日月火水木金土'[new Date(then, month - 1, day).getDay()];
    return {
      name: D.PAPER_NAME, note: D.PAPER_NOTE, year: then, month: month, day: day, weekday: wd, from: B.startYear, retired: now,
      tone: tone, headline: headline, subs: subs, ind: ind,
      column: { title: state.player.name + who + 'の時代を振り返る', items: decided, count: fu.decisions.length },
      letters: letters,
    };
  }

  return { get: get, year: year, role: role, record: record, recordPolicy: recordPolicy, tick: tick, nowText: nowText, answerBudget: answerBudget, value: value, impact: impact, paper: paper, longOf: longOf };
})();
