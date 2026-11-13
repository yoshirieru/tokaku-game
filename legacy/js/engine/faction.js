// 党内の派閥(M16)。DOMには触らない。
//
// state.factions = {
//   party,                        // どの党の派閥か(移籍・離党で党が変わると作り直す。新党には派閥はない)
//   rel: { 派閥: 0〜100 },         // 信頼
//   debt: { 派閥: 数 },            // 貸し借り(+ は貸し:相手が恩を感じている。− は借り:こちらが恩を受けている)
//   joined: 派閥 | null,           // 入っている派閥
//   mainstream: [派閥],            // 主流派(いまの党首を支えている派閥)
//   yieldNext: bool,               // 次の人事のポストを派閥に譲ると約束した
// }
// 派閥の長は党首選のライバル(0番・1番)と、党首選に出ない長老のキングメーカー(2番)。
// 人事(昇進のしやすさ)、党首選(派閥ごとの推しと寝返り)、党首モード(処遇・再選)に効く。数値は balance.js の Game.Balance.faction。
window.Game = window.Game || {};

Game.Faction = (function () {
  const FB = () => Game.Balance.faction;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function defs(party) {
    return (Game.Data.FACTIONS || {})[party] || null;
  }
  function byId(party, fid) {
    return (defs(party) || []).find((f) => f.id === fid) || null;
  }

  // 党の派閥の状態(派閥のない党なら null)
  function ensure(state) {
    const party = state.leader && state.leader.mode === 'leader' ? state.leader.party : state.player.party;
    const list = defs(party);
    if (!list) return null;
    if (!state.factions || state.factions.party !== party) {
      const B = FB();
      const main = Game.Data.FACTION_MAINSTREAM.map((i) => list[i].id);
      state.factions = { party, rel: {}, debt: {}, joined: null, mainstream: main, yieldNext: false };
      for (const f of list) {
        state.factions.rel[f.id] = main.includes(f.id) ? B.relStartMainstream : B.relStart;
        state.factions.debt[f.id] = 0;
      }
    }
    return state.factions;
  }
  function list(state) {
    const F = ensure(state);
    return F ? defs(F.party) : [];
  }
  const isMainstream = (state, fid) => { const F = ensure(state); return !!F && F.mainstream.includes(fid); };
  function addRel(F, fid, d) {
    if (fid && F.rel[fid] !== undefined) F.rel[fid] = clamp(F.rel[fid] + d, 0, 100);
  }
  function addDebt(F, fid, d) {
    const B = FB();
    if (fid && F.debt[fid] !== undefined) F.debt[fid] = clamp(F.debt[fid] + d, B.debtMin, B.debtMax);
  }
  // キングメーカー(党首選に出ない長老の派閥)
  const kingmaker = (party) => (defs(party) || [])[2] || null;

  // ---------------- 議員任期 ----------------
  // 「派閥・政策グループ活動」:入っていなければ入会、入っていれば会合に顔を出す。ほかの派閥にも顔を出せる
  function attend(state, fid) {
    const F = ensure(state);
    if (!F) return '';
    const B = FB();
    const f = byId(F.party, fid) || byId(F.party, F.joined) || kingmaker(F.party);
    if (!F.joined) {
      F.joined = f.id;
      addRel(F, f.id, B.join.rel);
      return `${f.name}に入会した。${f.boss}${f.title ? `(${f.title})` : ''}に「よろしく頼む」と肩をたたかれた。`;
    }
    if (f.id === F.joined) {
      addRel(F, f.id, B.attend.rel);
      return `${f.name}の会合に顔を出した。${f.boss}の覚えがよくなった。`;
    }
    addRel(F, f.id, B.attend.otherRel);
    addRel(F, F.joined, B.attend.joinedPenalty);
    return `${f.name}の会合にも顔を出した。${byId(F.party, F.joined).name}の中には、それを快く思わない者もいる。`;
  }

  // 人事:昇進のしやすさの上げ下げ
  function promotionDelta(state) {
    const F = ensure(state);
    if (!F || !F.joined) return 0;
    const P = FB().promotion;
    let d = isMainstream(state, F.joined) ? P.mainstream : P.nonMainstream;
    if (F.rel[F.joined] >= P.relHigh) d += P.relHighBonus;
    if (F.yieldNext) d -= FB().request.yieldPost.promotionPenalty;
    return d;
  }
  // 人事が行われたあと。主流派の口利きで昇進したら借りができる
  function afterPersonnel(state, promoted) {
    const F = ensure(state);
    if (!F) return null;
    const usedYield = F.yieldNext;
    F.yieldNext = false;
    if (promoted && F.joined && isMainstream(state, F.joined)) {
      addDebt(F, F.joined, FB().promotion.owe);
      return `${byId(F.party, F.joined).name}の後押しがあった。${byId(F.party, F.joined).boss}に借りができた。`;
    }
    if (usedYield) return '約束どおり、今回のポストは派閥の議員に譲った。';
    return null;
  }

  // 毎ターン:信頼は50に少しずつ戻る
  function turn(state) {
    const F = ensure(state);
    if (!F) return;
    for (const fid in F.rel) F.rel[fid] += (50 - F.rel[fid]) * FB().relDrift;
  }

  // 頼みごと(議員任期のターンの始まり)
  function requestEvent(state, rng) {
    const F = ensure(state);
    if (!F || !F.joined || state.career.status !== 'member') return null;
    const R = FB().request;
    if (rng() >= R.chance) return null;
    const f = byId(F.party, F.joined);
    let kind;
    if (F.debt[f.id] < 0 && rng() < R.yieldShare) kind = 'yieldPost';
    else kind = rng() < R.partyShare ? 'party' : 'speech';
    const c = state.career;
    const T = {
      party: { title: `${f.name}の政治資金パーティー`, text: `${f.boss}から「派閥のパーティー券を引き受けてくれないか」と頼まれた。`, accept: `${R.party.money}万円で引き受ける`, note: '派閥に貸しができ、信頼が上がる', disabled: c.money < R.party.money },
      speech: { title: `${f.name}の若手の応援`, text: `${f.boss}から「うちの若手の地元で応援演説をしてほしい」と頼まれた。`, accept: '応援に行く(このターンの行動を1つ使う)', note: '派閥に貸しができ、信頼が上がる', disabled: c.turn.actionsLeft < 1 },
      yieldPost: { title: `${f.boss}からの頼み`, text: `${f.boss}に呼ばれた。「この前の借りは覚えているな。次の人事のポストは、うちの若手に譲ってくれ」`, accept: '次のポストを譲る', note: '借りを返す(次の人事では昇進しにくい)' },
    }[kind];
    return {
      id: 'faction', kicker: '派閥', title: T.title, text: T.text, fid: f.id, kind,
      choices: [
        { id: 'accept', label: T.accept, note: T.note, disabled: !!T.disabled },
        { id: 'refuse', label: '断る', note: kind === 'yieldPost' ? '借りを踏み倒すと、派閥の信頼が大きく下がる' : '派閥の信頼が下がる' },
      ],
    };
  }
  function resolveRequest(state, ev, choice) {
    const F = ensure(state);
    const R = FB().request;
    const f = byId(F.party, ev.fid);
    const c = state.career;
    if (choice === 'refuse') {
      addRel(F, f.id, R[ev.kind].refuse);
      return `${f.boss}の頼みを断った。「覚えておく」と言われた。`;
    }
    if (ev.kind === 'party') { c.money -= R.party.money; addRel(F, f.id, R.party.rel); addDebt(F, f.id, R.party.lend); return `パーティー券を引き受けた。${f.boss}に貸しができた。`; }
    if (ev.kind === 'speech') { c.turn.actionsLeft = Math.max(0, c.turn.actionsLeft - 1); addRel(F, f.id, R.speech.rel); addDebt(F, f.id, R.speech.lend); return `派閥の若手の応援に入った。${f.boss}に貸しができた。`; }
    addRel(F, f.id, R.yieldPost.rel);
    addDebt(F, f.id, R.yieldPost.repay);
    F.yieldNext = true;
    return `次のポストを派閥に譲ると約束した。${f.boss}への借りを返した。`;
  }

  // ---------------- 党首選 ----------------
  // 派閥の推しを割り当てる。race.factions = [{ fid, name, boss, mp, backs }]。推しの強さは候補の mp に直接足す
  function setBacking(race, fid, candId) {
    const f = race.factions.find((x) => x.fid === fid);
    if (!f || f.backs === candId) return;
    const from = race.cands.find((x) => x.id === f.backs);
    if (from) from.mp -= f.mp;
    const to = race.cands.find((x) => x.id === candId);
    if (to) to.mp += f.mp;
    f.backs = candId;
  }
  function strongestRival(race) {
    return race.cands.filter((x) => !x.isPlayer).sort((a, b) => b.mp - a.mp)[0];
  }
  // 党首選が始まったとき(leadership.js)。戻り値:知らせの行
  function raceSetup(state, race) {
    const F = ensure(state);
    if (!F) return [];
    const B = FB().race;
    const L = defs(F.party);
    const lines = [];
    race.factions = L.map((f) => ({ fid: f.id, name: f.name, boss: f.boss, mp: f.share * B.mpPerShare, backs: null }));
    // 0番・1番の派閥は自分の長を推す
    L.slice(0, 2).forEach((f, i) => setBacking(race, f.id, 'r' + i));
    // 自分の派閥の長に挑む → 派閥を飛び出す
    const bossIdx = L.slice(0, 2).findIndex((f) => f.id === F.joined);
    if (race.cands.some((x) => x.isPlayer) && bossIdx >= 0) {
      const f = L[bossIdx];
      addRel(F, f.id, B.leaveOwn.rel);
      state.career.allies *= B.leaveOwn.alliesMult;
      F.joined = null;
      lines.push(`${f.boss}に挑むため、${f.name}を飛び出した。派閥の仲間の一部は離れていった。`);
    }
    // キングメーカー:入っていて信頼があればこちらを推す。そうでなければ強いほうのライバル
    const km = L[2];
    if (race.cands.some((x) => x.isPlayer) && F.joined === km.id && F.rel[km.id] >= B.ownMinRel) {
      setBacking(race, km.id, 'player');
      lines.push(`${km.name}(${km.boss})があなたを推すと決めた。`);
    } else {
      setBacking(race, km.id, strongestRival(race).id);
    }
    return lines;
  }
  // 「派閥の長と会談」:キングメーカーの推しを取りに行く
  function bossMeet(state, race, rng) {
    const F = ensure(state);
    if (!F || !race.factions) return null;
    const B = FB().race.bossMeet;
    const km = kingmaker(F.party);
    const rf = race.factions.find((x) => x.fid === km.id);
    if (rf.backs === 'player') return `${km.boss}と会い、支援を確かめ合った。`;
    const p = clamp(B.base + F.rel[km.id] * B.perRel + Math.max(0, F.debt[km.id]) * B.perLend, 0.05, 0.95);
    if (rng() < p) {
      setBacking(race, km.id, 'player');
      addDebt(F, km.id, B.owe);
      return `${km.boss}と料亭で会談し、${km.name}の支援を取りつけた。大きな借りができた。`;
    }
    return `${km.boss}と会談したが、「まだ決めておらん」とはぐらかされた。`;
  }
  // 投票の直前:こちらを推す派閥が寝返ることがある。戻り値:知らせの行
  function betrayAtVote(state, race, rng) {
    const F = ensure(state);
    if (!F || !race.factions) return [];
    const B = FB().race.betray;
    const lines = [];
    for (const rf of race.factions) {
      if (rf.backs !== 'player') continue;
      const f = byId(F.party, rf.fid);
      let p = B[f.style] || B.hard;
      if (F.rel[f.id] < B.lowRel) p += (B.lowRel - F.rel[f.id]) * B.perLowRel;
      if (F.debt[f.id] > 0) p -= B.lendSafe;
      p = clamp(p, B.min, B.max);
      if (rng() < p) {
        const to = strongestRival(race);
        setBacking(race, rf.fid, to.id);
        addRel(F, f.id, B.relLoss);
        lines.push(`投票の直前、${f.name}が${to.name}氏の支持に回った!(寝返り)`);
        rf.betrayed = true;
      }
    }
    return lines;
  }
  // 党首選が終わったあと:勝った人を推した派閥が主流派になる
  function afterRace(state, race, winnerId) {
    const F = ensure(state);
    if (!F || !race.factions) return;
    F.mainstream = race.factions.filter((x) => x.backs === winnerId).map((x) => x.fid);
    if (winnerId === 'player') for (const fid of F.mainstream) addRel(F, fid, FB().leader.mainstreamRel);
    if (winnerId === 'player' && F.mainstream.includes(kingmaker(F.party).id)) Game.Legacy.stats(state).kingmakerWin = true;   // 殿堂の実績(hall.js)
  }
  // プレイヤーが出ない党首選:派閥の大きさとキングメーカーの推しで決まる。戻り値:勝った人の番号
  function aiRaceWinner(state, rng) {
    const F = ensure(state);
    if (!F) return null;
    const L = defs(F.party);
    const A = FB().aiRace;
    // キングメーカーはどちらか一方を推す(大きい派閥のほうを推しやすい)。推した側が負ければ、キングメーカーも非主流派になる
    const kmBacks = rng() < L[0].share / (L[0].share + L[1].share) ? 0 : 1;
    const w0 = L[0].share + (kmBacks === 0 ? L[2].share * A.kingmakerWeight : 0) + (rng() - 0.5) * A.noise;
    const w1 = L[1].share + (kmBacks === 1 ? L[2].share * A.kingmakerWeight : 0) + (rng() - 0.5) * A.noise;
    const win = w0 >= w1 ? 0 : 1;
    F.mainstream = kmBacks === win ? [L[win].id, L[2].id] : [L[win].id];
    return win;
  }

  // ---------------- 党首モード ----------------
  // 人事で処遇:いちばん不満の強い派閥に要職を配る
  function postsReward(state) {
    const F = ensure(state);
    if (!F) return '';
    const L = FB().leader;
    const worst = defs(F.party).slice().sort((a, b) => F.rel[a.id] - F.rel[b.id])[0];
    for (const f of defs(F.party)) addRel(F, f.id, f.id === worst.id ? L.postsRel : L.postsOtherRel);
    if (!F.mainstream.includes(worst.id)) F.mainstream.push(worst.id);
    return `いちばん不満の強かった${worst.name}に要職を配り、主流派に取り込んだ。`;
  }
  // 党首の再選の見込みの上げ下げ(派閥の信頼の平均)
  function reelectDelta(state) {
    const F = ensure(state);
    if (!F) return 0;
    const vals = Object.values(F.rel);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return (avg - 50) * FB().leader.reelectPerRel;
  }
  // いちばん信頼の低い派閥(分裂のときの名前)
  function weakest(state) {
    const F = ensure(state);
    if (!F) return null;
    return defs(F.party).slice().sort((a, b) => F.rel[a.id] - F.rel[b.id])[0];
  }

  return { defs, byId, ensure, list, isMainstream, attend, promotionDelta, afterPersonnel, turn, requestEvent, resolveRequest, raceSetup, bossMeet, betrayAtVote, afterRace, aiRaceWinner, postsReward, reelectDelta, weakest, kingmaker };
})();
