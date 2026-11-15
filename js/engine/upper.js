// 参議院(R12)。3年ごとの参院選(半数を改選)と、ねじれ国会。DOM には触らない。数値は balance.js の upper。
// 状態は state.upper(議員の歩みをまたいで持つ。対戦モードでは使わない)
//   classes 改選の組ごとの議席 [3年前に選ばれた組, 6年前に選ばれた組(次に改選)] / next 次の参院選までの会期 / wind 次の衆院選の勢い(党ごと)
//   last この前の参院選の結果(ねじれ国会かどうかは、いまの議席と政権から twisted で決める)
window.Game = window.Game || {};

Game.Upper = (function () {
  const R = Game.Rng;
  const U = function () { return Game.Balance.upper; };
  const PARTIES = function () { return Object.keys(Game.Data.PARTIES); };

  function get(state) {
    if (!state.upper) {
      const u = U(), a = {}, b = {};
      PARTIES().forEach(function (p) { a[p] = Math.ceil(u.start[p] / 2); b[p] = u.start[p] - a[p]; });
      state.upper = { classes: [a, b], next: u.firstIn, wind: {}, twisted: false, last: null };
    }
    return state.upper;
  }
  function total(u) {
    const t = {};
    PARTIES().forEach(function (p) { t[p] = u.classes[0][p] + u.classes[1][p]; });
    return t;
  }
  // いまの与党(首相の党と連立相手)。党首でなければ、世の中は民政の政権
  function ruling(state) {
    const g = state.career && state.career.gov, me = state.player.party;
    if (!g) return [U().worldRuling];
    if (g.role === 'pm') return g.partner ? [me, g.partner] : [me];
    if (g.role === 'junior') return [g.pm, me];
    return g.partner ? [g.pm, g.partner] : [g.pm];   // 野党:相手の党(と、その連立相手)が与党
  }
  function rulingSeats(state) {
    const t = total(get(state));
    return ruling(state).reduce(function (a, p) { return a + t[p]; }, 0);
  }
  // ねじれ国会:自分が与党(首相・連立与党)なのに、与党が参院の過半数を持っていない。いつでも、いまの議席と政権から決める
  function twisted(state) {
    const g = state.career && state.career.gov;
    return !!(g && g.role !== 'opposition' && rulingSeats(state) < U().majority);
  }

  // 会期の始まりに呼ぶ(career.js の startTurn)。参院選の会期なら知らせを積んで true
  function tick(state) {
    const u = get(state), cr = state.career;
    if (u.next > 0) u.next -= 1;
    if (u.next > 0 || cr.turn <= 1) return false;   // 衆院選の直後の会期は、次の会期に回す
    cr.pending.push({ type: 'upperElection' });
    return true;
  }

  // 参院選の選び方。党首:'tour' 全国を応援で回る / 'manifesto' 公約を前に出す / 'none' 任せる。議員:'support' 党の候補の応援 / 'local' 地元を固める
  function choices(state) {
    const cr = state.career, u = U();
    if (cr.leader) {
      const kept = (cr.next && cr.next.endorse || []).length;
      return [
        { id: 'tour', share: u.tour, note: '党の得票 +' + Math.round(u.tour * 100) + '%。この会期の体力 −' + u.tourEnergy },
        { id: 'manifesto', share: kept ? u.manifesto : 0, note: kept ? '果たした公約を訴える。党の得票 +' + Math.round(u.manifesto * 100) + '%' : '果たした公約がまだない(効き目なし)' },
        { id: 'none', share: 0, note: '党の候補に任せ、国会に専念する' },
      ];
    }
    if (cr.np) return [   // 新党(R16)は参院に候補を立てていない
      { id: 'support', share: 0, note: '他党の候補の応援で顔をつなぐ。同志が1人増える' },
      { id: 'local', share: 0, note: '選んでいる地区の地盤 +' + u.local },
    ];
    return [
      { id: 'support', share: cr.status === 'member' ? u.memberShare : u.memberShare / 2, note: '党への貢献 +' + u.support + '。党の得票も少し上がる' },
      { id: 'local', share: 0, note: '選んでいる地区の地盤 +' + u.local },
    ];
  }

  // 参院選を行う。choice は choices の id。知らせ(upperResult)に置き換える
  function run(state, choice) {
    const cr = state.career, u = get(state), B = U(), p0 = cr.pending[0];
    if (!p0 || p0.type !== 'upperElection') return null;
    const me = state.player.party, ch = choices(state).filter(function (c) { return c.id === choice; })[0] || choices(state)[choices(state).length - 1];
    // 自分の動き
    let note = '';
    if (choice === 'tour') { cr.energy = Math.max(0, cr.energy - B.tourEnergy); note = '全国の候補を応援して回った。'; }
    else if (choice === 'manifesto') note = ch.share ? '果たした公約を前に出して戦った。' : '公約を訴えたが、まだ実績がない。';
    else if (choice === 'support' && cr.np) { cr.np.mates = Math.min(Game.Balance.newParty.mates.max, cr.np.mates + 1); note = '他党の候補の応援に回り、新党に加わる議員が1人増えた。'; }
    else if (choice === 'support') { cr.contrib += B.support; cr.merit = Math.max(0, cr.merit + B.support); note = '党の候補の応援に回った(党への貢献 +' + B.support + ')。'; }
    else if (choice === 'local') { const r = cr.sel; cr.base[r] = Math.min(Game.Balance.comeback.baseMax, (cr.base[r] || 0) + B.local); note = '自分の地元を固めた。'; }
    else note = '党の候補に任せ、国会に専念した。';
    // 得票の割合:党の地力 + 内閣支持率(与党は上がり下がり、野党は逆)+ ぶれ + 自分の動き
    const rul = ruling(state);
    const approval = cr.gov ? cr.gov.approval : Game.Balance.gov.aiMean + R.normal(state) * Game.Balance.gov.aiNoise;
    const share = {};
    let sum = 0;
    PARTIES().forEach(function (p) {
      let v = B.base[p] + (rul.indexOf(p) >= 0 ? 1 : -1) * (approval - 50) * B.approvalWeight / (rul.indexOf(p) >= 0 ? rul.length : PARTIES().length - rul.length);
      v += R.normal(state) * B.noise;
      if (p === me) v += ch.share;
      share[p] = Math.max(0.03, v);
      sum += share[p];
    });
    PARTIES().forEach(function (p) { share[p] /= sum; });
    // 改選の議席は、割合で配る(最大剰余)
    const won = {}, rest = [];
    let given = 0;
    PARTIES().forEach(function (p) { const x = share[p] * B.contested; won[p] = Math.floor(x); given += won[p]; rest.push([p, x - won[p]]); });
    rest.sort(function (a, b) { return b[1] - a[1]; });
    for (let i = 0; given < B.contested; i++, given++) won[rest[i % rest.length][0]] += 1;
    const before = total(u), old = u.classes[1], wasTwisted = twisted(state);
    u.classes = [won, u.classes[0]];
    const after = total(u);
    const rs = rul.reduce(function (a, p) { return a + after[p]; }, 0);
    u.twisted = twisted(state);
    // 次の衆院選の勢い(自分の党):改選前の組と比べて、議席が増えたか
    const delta = won[me] != null ? won[me] - old[me] : 0;   // 新党(R16)は参院に議席がない
    const w = Math.max(-B.wind.max, Math.min(B.wind.max, Math.round(delta / B.wind.per)));
    u.wind[me] = w;
    // 首相の党が大きく負けると、内閣支持率が下がる
    let hit = 0;
    if (cr.gov && cr.gov.role === 'pm' && won[cr.gov.pm] - old[cr.gov.pm] <= -B.bigLoss) { hit = B.lossApproval; Game.Career.changeApproval(cr, hit); }
    u.next = B.every;
    u.last = { won: won, old: old, before: before, after: after, ruling: rul, rulingSeats: rs, twisted: u.twisted, wasTwisted: wasTwisted, wind: w, hit: hit, note: note, approval: Math.round(approval) };
    cr.pending[0] = Object.assign({ type: 'upperResult' }, u.last);
    cr.news = '参院選の結果:' + (won[me] != null ? Game.Data.PARTIES[me].short + 'は ' + won[me] + '議席(改選前 ' + old[me] + ')。' : '') + (u.twisted ? '与党は参院の過半数を失い、ねじれ国会になった。' : '');
    return u.last;
  }

  // ねじれ国会のときの、首相の法案の進み(重要法案が参院で止まり、進みが減る)
  function lawProgress(state, n) {
    if (!twisted(state) || n <= 1) return n;
    return Math.max(1, n - U().twist.law);
  }
  // 野党党首の追及は、参院で野党が多数ならよく効く
  function attackBonus(state) {
    const cr = state.career;
    if (!cr || !cr.gov || cr.gov.role !== 'opposition') return 0;
    return rulingSeats(state) < U().majority ? U().twist.attack : 0;
  }
  // 次の衆院選の始まりの支持(全地区・全ブロック)。読んだら消す
  function takeWind(state) {
    const u = state.upper;
    if (!u) return 0;
    const w = u.wind[state.player.party] || 0;
    u.wind = {};
    return w;
  }

  return { get: get, total: total, ruling: ruling, rulingSeats: rulingSeats, twisted: twisted, tick: tick, choices: choices, run: run, lawProgress: lawProgress, attackBonus: attackBonus, takeWind: takeWind };
})();
