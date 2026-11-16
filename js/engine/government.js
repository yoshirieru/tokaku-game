// 政権づくり(R5)。総選挙のあと、過半数を持つ組み合わせが政権を担う。DOM には触らない。
// どの党も単独過半数でなければ、2つの党が組んで政権をつくる。2党で過半数に届かなければ、小さな党(R19)が閣外協力で加わる。
// 誰と組むかで、首相・連立与党・野党が決まる。
// 決まった政権は state.career.gov に入れる:
//   role 'pm' 首相 / 'junior' 連立与党(首相は相手の党首)/ 'opposition' 野党
//   pm 首相の党 / partner 組んだ相手の党 / allies 閣外協力の党(R19)/ posts 渡した大臣ポスト / adopted 受け入れた相手の公約
//   approval 内閣支持率(自分の内閣でも相手の内閣でも)/ sat 連立相手の満足度 / low 支持率が低い会期の続いた数
window.Game = window.Game || {};

Game.Gov = (function () {
  const G = function () { return Game.Balance.gov; };
  const maj = function () { return Game.Balance.nation.majority; };

  function affinity(a, b) { return G().affinity[[a, b].sort().join('-')] || 0; }
  // 党ごとの議席(総選挙の結果から)
  function seatsByParty(state) {
    const out = {};
    state.camp.cands.forEach(function (c) { out[c.party] = state.election.seats[c.id]; });
    return out;
  }
  // lead(首相の党)と partner で組む。2党で過半数に届かなければ、首相の党と近い党(近さ allyNeed 以上)が近い順に閣外協力で加わる。
  // 加われるのは、2党のどちらよりも議席の少ない党だけ(組む相手は、首相の党のほかで議席がいちばん多い党になる)。届かなければ null
  function build(seats, lead, partner, exclude) {
    const g = G();
    let total = seats[lead] + seats[partner];
    const allies = [];
    if (total >= maj()) return { allies: allies, total: total };
    const cap = Math.min(seats[lead], seats[partner]);
    const pool = Object.keys(seats).filter(function (p) {
      return p !== lead && p !== partner && exclude.indexOf(p) < 0 && seats[p] > 0 && seats[p] <= cap && affinity(lead, p) >= g.allyNeed;
    }).sort(function (a, b) { return affinity(lead, b) - affinity(lead, a) || seats[b] - seats[a]; });
    for (let i = 0; i < pool.length; i++) {
      allies.push(pool[i]); total += seats[pool[i]];
      if (total >= maj()) return { allies: allies, total: total };
    }
    return null;
  }
  // プレイヤー抜きで決まる政権:いちばん大きい党が、組める相手と組む(近さ juniorNeed 以上の相手を議席の多い順に。
  // それで届かなければ近さを問わず。それでもだめなら少数与党)
  function aiGov(seats, exclude) {
    const g = G();
    const others = Object.keys(seats).filter(function (p) { return exclude.indexOf(p) < 0 && seats[p] > 0; }).sort(function (a, b) { return seats[b] - seats[a]; });
    const top = others[0];
    if (seats[top] >= maj()) return { pm: top, partner: null, allies: [] };
    const rest = others.slice(1);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < rest.length; i++) {
        if (pass === 0 && affinity(top, rest[i]) < g.juniorNeed) continue;
        const c = build(seats, top, rest[i], exclude);
        if (c) return { pm: top, partner: rest[i], allies: c.allies };
      }
    }
    return { pm: top, partner: null, allies: [] };
  }
  // プレイヤーが選べる道。type: 'alone' 単独政権 / 'lead' 連立を組んで首相 / 'join' 相手の政権に入る / 'opposition' 野党
  function options(state) {
    const me = state.player.party, seats = seatsByParty(state);
    const others = Object.keys(seats).filter(function (p) { return p !== me; }).sort(function (a, b) { return seats[b] - seats[a]; });
    const top = Object.keys(seats).sort(function (a, b) { return seats[b] - seats[a]; })[0];
    if (seats[me] >= maj()) return [{ type: 'alone' }];
    if (seats[top] >= maj()) return [{ type: 'opposition', pm: top, partner: null, allies: [] }];
    const out = [];
    others.forEach(function (x) {
      if (!(seats[x] > 0)) return;
      const leadMe = seats[me] >= seats[x];
      const c = leadMe ? build(seats, me, x, []) : build(seats, x, me, []);
      if (!c) return;
      if (leadMe) out.push({ type: 'lead', partner: x, allies: c.allies, seats: c.total });
      else out.push({ type: 'join', partner: x, allies: c.allies, seats: c.total, ok: affinity(me, x) >= G().juniorNeed });
    });
    // 野党に回ると、ほかの党が組む(首相は議席のいちばん多い党)
    out.push(Object.assign({ type: 'opposition' }, aiGov(seats, [me])));
    return out;
  }
  function needsChoice(state) { return options(state).length > 1; }
  // 連立を申し入れたときの前向き度。offer: { posts 大臣ポスト(0〜postMax), pledge 相手の看板の公約を受け入れるか }
  function score(state, partner, offer) {
    const g = G(), me = state.player.party, seats = seatsByParty(state);
    const c = build(seats, me, partner, []) || { allies: [] };
    const v = affinity(me, partner) + Math.min(g.postMax, offer.posts || 0) * g.post + (offer.pledge ? g.pledge : 0);
    // こちらが第1党でなければ、第1党も同じ相手に声をかけている。議席の差が大きいほど、こちらには乗りにくい
    const inside = [me, partner].concat(c.allies);
    const other = Object.keys(seats).filter(function (p) { return inside.indexOf(p) < 0; }).sort(function (a, b) { return seats[b] - seats[a]; })[0];
    const gap = other ? seats[other] - seats[me] : 0;
    // 閣外協力の党が多いほど、まとめるのが難しい(R19)
    const gw = Object.keys(seats).length <= 3 ? g.gapWeight3 : g.gapWeight;   // 3党だけ(史実シナリオ)は R19 より前の重み
    const need = Math.round(g.need + c.allies.length * g.allyCost + (gap > 0 ? g.rivalEdge + gap * gw : 0));
    return { score: v, need: need, ok: v >= need, rival: gap > 0 ? other : null, gap: gap, allies: c.allies };
  }
  // 政権を決める。choice: options の1つに、'lead' なら posts と pledge を足したもの
  function form(state, choice) {
    const g = G(), cr = state.career, me = state.player.party, prev = cr.gov;
    const wasPM = !!(prev && prev.role === 'pm');
    let gov;
    if (choice.type === 'alone' || choice.type === 'lead') {
      const lead = choice.type === 'lead';
      const sc = lead ? score(state, choice.partner, choice) : null;
      if (lead && !sc.ok) return null;
      const posts = lead ? Math.min(g.postMax, choice.posts || 0) : 0;
      gov = {
        role: 'pm', pm: me, partner: lead ? choice.partner : null, allies: lead ? sc.allies : [], posts: posts,
        adopted: lead && choice.pledge ? g.pledgeOf[choice.partner] : null,
        // 続投:前の支持率を少し上げて引き継ぐ。ただし長期政権は飽きられる(続投を重ねるほど上限が下がる)
        approval: wasPM ? Math.max(g.approvalKeep[0], Math.min(Math.max(g.keepFloor, g.approvalKeep[1] - g.keepFade * ((cr.pmStreak || 1) - 1)), prev.approval + 5)) : g.approvalStart,
        sat: lead ? g.satStart + posts * g.satPost + (choice.pledge ? g.satPledge : 0) : 0, low: 0,
      };
    } else if (choice.type === 'join') {
      if (!choice.ok) return null;
      gov = { role: 'junior', pm: choice.partner, partner: choice.partner, allies: choice.allies || [], posts: 0, adopted: null, approval: g.aiMean, sat: 0, low: 0 };
    } else {
      gov = { role: 'opposition', pm: choice.pm, partner: choice.partner || null, allies: choice.allies || [], posts: 0, adopted: null, approval: g.aiMean, sat: 0, low: 0 };
    }
    gov.lostPower = wasPM && gov.role !== 'pm';
    cr.pmStreak = gov.role === 'pm' ? (wasPM ? (cr.pmStreak || 1) + 1 : 1) : 0;   // 続けて首相を務めている回数
    if (gov.role === 'pm' && gov.partner) cr.coalPM = true;   // 連立を組んで首相になった(殿堂の実績)
    cr.gov = gov;
    cr.govFresh = true;
    return gov;
  }
  // 自動プレイ用:首相になれるなら、いちばん安い条件で組む。だめなら連立与党、それもだめなら野党
  function autoChoose(state) {
    const g = G(), opts = options(state);
    if (opts.length === 1) return opts[0];
    const leads = opts.filter(function (o) { return o.type === 'lead'; });
    for (let i = 0; i < leads.length; i++) {
      for (let cost = 0; cost <= g.postMax + 1; cost++) {
        for (let posts = Math.min(cost, g.postMax); posts >= 0; posts--) {
          const pledge = cost - posts === 1;
          if (cost - posts > 1) continue;
          if (score(state, leads[i].partner, { posts: posts, pledge: pledge }).ok) return Object.assign({}, leads[i], { posts: posts, pledge: pledge });
        }
      }
    }
    const join = opts.filter(function (o) { return o.type === 'join' && o.ok; })[0];
    return join || opts[opts.length - 1];
  }
  // いまの世の中の政権(党首になったとき。まだ総選挙を戦っていない):民政と公正の連立(balance.js の gov.world)
  function initial(state) {
    const g = G(), w = g.world, me = state.player.party;
    return me === w.pm
      ? { role: 'pm', pm: me, partner: w.partner, allies: [], posts: w.posts, adopted: null, approval: g.aiMean, sat: g.satStart + w.posts * g.satPost, low: 0 }
      : { role: 'opposition', pm: w.pm, partner: w.partner, allies: [], posts: 0, adopted: null, approval: g.aiMean, sat: 0, low: 0 };
  }
  // 与党の党(首相の党、組んだ相手、閣外協力の党)
  function members(gov, me) {
    const out = gov.role === 'pm' ? [me] : gov.role === 'junior' ? [gov.pm, me] : [gov.pm];
    if (gov.partner && out.indexOf(gov.partner) < 0) out.push(gov.partner);
    (gov.allies || []).forEach(function (p) { if (out.indexOf(p) < 0) out.push(p); });
    return out;
  }
  // 総選挙への響き(全ブロックの始まりの支持)。首相はそのまま、連立与党は半分、野党は逆向き
  function electionBonus(gov) {
    const g = G();
    const raw = (gov.approval - 50) / g.electionPer * (gov.role === 'pm' ? 1 : gov.role === 'junior' ? 0.5 : -1);
    return Math.round(Math.max(-g.electionMax, Math.min(g.electionMax, raw)));
  }

  return {
    affinity: affinity, seatsByParty: seatsByParty, options: options, needsChoice: needsChoice, score: score, form: form,
    autoChoose: autoChoose, initial: initial, members: members, electionBonus: electionBonus,
  };
})();
