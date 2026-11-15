// 政権づくり(R5)。総選挙のあと、過半数を持つ組み合わせが政権を担う。DOM には触らない。
// 党は3つなので、どの党も単独過半数でなければ、2党が組めば必ず過半数になる。誰と組むかで、首相・連立与党・野党が決まる。
// 決まった政権は state.career.gov に入れる:
//   role 'pm' 首相 / 'junior' 連立与党(首相は相手の党首)/ 'opposition' 野党
//   pm 首相の党 / partner 組んだ相手の党 / posts 渡した大臣ポスト / adopted 受け入れた相手の公約
//   approval 内閣支持率(自分の内閣でも相手の内閣でも)/ sat 連立相手の満足度 / low 支持率が低い会期の続いた数
window.Game = window.Game || {};

Game.Gov = (function () {
  const G = function () { return Game.Balance.gov; };

  function affinity(a, b) { return G().affinity[[a, b].sort().join('-')] || 0; }
  // 党ごとの議席(総選挙の結果から)
  function seatsByParty(state) {
    const out = {};
    state.camp.cands.forEach(function (c) { out[c.party] = state.election.seats[c.id]; });
    return out;
  }
  // プレイヤーが選べる道。type: 'alone' 単独政権 / 'lead' 連立を組んで首相 / 'join' 相手の政権に入る / 'opposition' 野党
  function options(state) {
    const NB = Game.Balance.nation, me = state.player.party, seats = seatsByParty(state);
    const others = Object.keys(seats).filter(function (p) { return p !== me; }).sort(function (a, b) { return seats[b] - seats[a]; });
    const top = Object.keys(seats).sort(function (a, b) { return seats[b] - seats[a]; })[0];
    if (seats[me] >= NB.majority) return [{ type: 'alone' }];
    if (seats[top] >= NB.majority) return [{ type: 'opposition', pm: top, partner: null }];
    const out = [];
    others.forEach(function (x) {
      if (seats[me] + seats[x] < NB.majority) return;
      if (seats[me] >= seats[x]) out.push({ type: 'lead', partner: x, seats: seats[me] + seats[x] });
      else out.push({ type: 'join', partner: x, seats: seats[me] + seats[x], ok: affinity(me, x) >= G().juniorNeed });
    });
    // 野党に回ると、ほかの2党が組む(首相は議席の多いほう)
    out.push({ type: 'opposition', pm: others[0], partner: others[1] });
    return out;
  }
  function needsChoice(state) { return options(state).length > 1; }
  // 連立を申し入れたときの前向き度。offer: { posts 大臣ポスト(0〜postMax), pledge 相手の看板の公約を受け入れるか }
  function score(state, partner, offer) {
    const g = G(), me = state.player.party, seats = seatsByParty(state);
    const v = affinity(me, partner) + Math.min(g.postMax, offer.posts || 0) * g.post + (offer.pledge ? g.pledge : 0);
    // こちらが第1党でなければ、第1党も同じ相手に声をかけている。議席の差が大きいほど、こちらには乗りにくい
    const other = Object.keys(seats).filter(function (p) { return p !== me && p !== partner; })[0];
    const gap = seats[other] - seats[me];
    const need = Math.round(g.need + (gap > 0 ? g.rivalEdge + gap * g.gapWeight : 0));
    return { score: v, need: need, ok: v >= need, rival: gap > 0 ? other : null, gap: gap };
  }
  // 政権を決める。choice: options の1つに、'lead' なら posts と pledge を足したもの
  function form(state, choice) {
    const g = G(), cr = state.career, me = state.player.party, prev = cr.gov;
    const wasPM = !!(prev && prev.role === 'pm');
    let gov;
    if (choice.type === 'alone' || choice.type === 'lead') {
      const lead = choice.type === 'lead';
      if (lead && !score(state, choice.partner, choice).ok) return null;
      const posts = lead ? Math.min(g.postMax, choice.posts || 0) : 0;
      gov = {
        role: 'pm', pm: me, partner: lead ? choice.partner : null, posts: posts,
        adopted: lead && choice.pledge ? g.pledgeOf[choice.partner] : null,
        // 続投:前の支持率を少し上げて引き継ぐ。ただし長期政権は飽きられる(続投を重ねるほど上限が下がる)
        approval: wasPM ? Math.max(g.approvalKeep[0], Math.min(Math.max(g.keepFloor, g.approvalKeep[1] - g.keepFade * ((cr.pmStreak || 1) - 1)), prev.approval + 5)) : g.approvalStart,
        sat: lead ? g.satStart + posts * g.satPost + (choice.pledge ? g.satPledge : 0) : 0, low: 0,
      };
    } else if (choice.type === 'join') {
      if (!choice.ok) return null;
      gov = { role: 'junior', pm: choice.partner, partner: choice.partner, posts: 0, adopted: null, approval: g.aiMean, sat: 0, low: 0 };
    } else {
      gov = { role: 'opposition', pm: choice.pm, partner: choice.partner || null, posts: 0, adopted: null, approval: g.aiMean, sat: 0, low: 0 };
    }
    gov.lostPower = wasPM && gov.role !== 'pm';
    cr.pmStreak = gov.role === 'pm' ? (wasPM ? (cr.pmStreak || 1) + 1 : 1) : 0;   // 続けて首相を務めている回数
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
  // いまの世の中の政権(党首になったとき。まだ総選挙を戦っていない):民政が政権を担っている
  function initial(state) {
    const g = G(), me = state.player.party;
    return me === 'minsei'
      ? { role: 'pm', pm: 'minsei', partner: null, posts: 0, adopted: null, approval: g.aiMean, sat: 0, low: 0 }
      : { role: 'opposition', pm: 'minsei', partner: null, posts: 0, adopted: null, approval: g.aiMean, sat: 0, low: 0 };
  }
  // 総選挙への響き(全ブロックの始まりの支持)。首相はそのまま、連立与党は半分、野党は逆向き
  function electionBonus(gov) {
    const g = G();
    const raw = (gov.approval - 50) / g.electionPer * (gov.role === 'pm' ? 1 : gov.role === 'junior' ? 0.5 : -1);
    return Math.round(Math.max(-g.electionMax, Math.min(g.electionMax, raw)));
  }

  return {
    affinity: affinity, seatsByParty: seatsByParty, options: options, needsChoice: needsChoice, score: score, form: form,
    autoChoose: autoChoose, initial: initial, electionBonus: electionBonus,
  };
})();
