// 政治とカネ・選挙違反・区割り改定(R9〜R11)。DOM には触らない。数値は balance.js の slush / fraud / redistrict。
// 状態は state.scandal(選挙戦と任期をまたいで持つ。対戦モードでは2人それぞれが持ち、versus.js が入れ替える)
//   hidden 収支報告書に載せなかった資金の合計(万円)/ exposure 発覚度(0〜100)/ stage 取材・告発の段階 / clean クリーンの評判 / found 発覚した回数
//   probe この選挙の捜査ゲージ(買収の黙認)/ ban 連座制で立てない選挙区 { seat, turns } / redistricted 区割り改定が起きたか
//   next 次の選挙に持ち越すもの { start(全地区の始まりの支持), unendorsed(公認取り消し), moved(国替えした選挙区), merged(合区), found(発覚の重さ) }
//   meritDue 選挙戦の最中に発覚したときの党内評価(任期が始まるときに差し引く)
window.Game = window.Game || {};

Game.Scandal = (function () {
  const R = Game.Rng;
  const SL = function () { return Game.Balance.slush; };
  const FR = function () { return Game.Balance.fraud; };
  const RD = function () { return Game.Balance.redistrict; };
  const regions = function () { return Game.Data.DISTRICT.regions; };

  function empty() {
    return { hidden: 0, exposure: 0, stage: 0, clean: 0, found: 0, everHid: false, probe: 0, ban: null, redistricted: false,
      next: { start: 0, unendorsed: false, moved: null, merged: false, found: null }, meritDue: 0 };
  }
  function get(state) {
    if (!state.scandal) state.scandal = empty();
    return state.scandal;
  }

  // ================= R9 裏金 =================
  function isFund(id, B) { return B.money < 0; }
  // 資金のカードの記載。opt 'hide' なら一部を載せない(資金が上乗せされ、発覚度がたまる)。返り値 { money(上乗せ), note(知らせに足す文) }
  function record(state, opt) {
    const sc = get(state), L = SL();
    if (state.scenario) opt = 'honest';   // 史実シナリオ(実名)では、収入はいつも正直に記載する
    if (opt === 'hide') {
      sc.hidden += L.extra;
      sc.exposure = Math.min(100, sc.exposure + L.gain);
      sc.clean = 0;
      sc.everHid = true;
      return { money: L.extra, note: 'うち ' + L.extra + '万円は、収支報告書に載せなかった(発覚度 ' + Math.round(sc.exposure) + ')。' };
    }
    const before = sc.clean;
    sc.clean = Math.min(L.cleanMax, sc.clean + 1);
    return { money: 0, note: sc.clean > before ? '収入は正直に記載した。「クリーン」の評判が上がった(' + sc.clean + ' / ' + L.cleanMax + ')。' : '収入は正直に記載した。' };
  }
  // 発覚の重さ
  function tier(hidden) { const L = SL(); return hidden <= L.dropUpTo ? 'drop' : hidden <= L.unendorsedUpTo ? 'unendorsed' : 'resign'; }

  // 発覚する。where 'term' | 'campaign'。返り値は知らせ { title, text, fx, retire }
  function expose(state, how, where) {
    const sc = get(state), L = SL(), cr = state.career;
    let t = tier(sc.hidden);
    const amount = sc.hidden;
    const head = how === 'probe' ? '検察が政治資金規正法違反の疑いで、事務所を捜索した。' : how === 'pvp' ? '相手の追及をきっかけに、報道が一気に広がった。' : '週刊誌が「収支報告書に載らない ' + amount + '万円」を報じた。';
    let text, fx = [], retire = null;
    const leader = cr && cr.leader, pm = cr && cr.gov && cr.gov.role === 'pm' && leader;
    if (where === 'campaign') {
      regions().forEach(function (r) { fx.push({ region: r.id, who: 'me', gain: Math.round(Game.Campaign.applyGain(state.camp, r.id, 'me', L.campaignHit, 'sns')) }); });
      if (state.camp.voters) Game.Voters.rumor(state.camp, 'me', -1, 'sns');   // SNSで炎上し、口コミで広がる(R18)
      if (t === 'resign') t = 'unendorsed';   // 選挙戦の最中は辞職できない。選挙のあとに公認を失う
      text = head + 'SNSで炎上し、全地区で支持が ' + (-L.campaignHit) + ' 下がった。' +
        (state.camp.vs ? '' : t === 'drop' ? '党内の評価も下がる。' : '党は「次の選挙では公認しない」と表明した。');
      if (!state.camp.vs) {
        sc.meritDue += t === 'drop' ? L.dropMerit : L.unendorsedMerit;
        if (t === 'unendorsed') { sc.next.unendorsed = true; sc.next.start += L.unendorsedStart; }
      }
    } else if (pm) {
      Game.Career.changeApproval(cr, L.pmApproval);
      text = head + '首相の政治資金に疑惑。内閣支持率が ' + (-L.pmApproval) + ' 下がった。';
      if (t !== 'drop') { retire = 'scandal'; text += '党内から辞任を求める声が噴き出し、首相を辞して政界を去る。'; }
    } else if (t === 'resign' && cr && cr.status === 'member') {
      retire = 'scandal';
      text = head + '隠した額は ' + amount + '万円。言い逃れはできず、議員を辞職する。';
    } else if (t === 'drop') {
      sc.next.start += L.dropStart;
      if (cr) cr.merit = Math.max(0, cr.merit + L.dropMerit);
      text = head + 'SNSで炎上し、地元の評判が落ちた。次の選挙は全地区の始まりの支持が ' + L.dropStart + '。党内評価も ' + L.dropMerit + '。';
    } else {
      sc.next.start += L.unendorsedStart;
      sc.next.unendorsed = true;
      if (cr) { cr.merit = Math.max(0, cr.merit + L.unendorsedMerit); if (!leader) cr.rank = 0; }
      if (leader) { retire = 'scandal'; text = head + '党首の疑惑に、党内の離反が止まらない。党首を辞し、政界を去る。'; } else {
        text = head + '党は公認を取り消し、役職も外した。次の選挙は党の後ろ盾なしで戦う(党幹部の応援なし、全地区の始まりの支持 ' + L.unendorsedStart + ')。';
      }
    }
    sc.next.found = t;
    sc.hidden = 0; sc.exposure = 0; sc.stage = 0; sc.clean = 0; sc.found += 1;
    return { title: where === 'campaign' ? '裏金疑惑で炎上' : '裏金の発覚', text: text, fx: fx, retire: retire };
  }

  // 任期の会期の始まり:発覚度が上がり、段階ごとに取材・告発(選ぶ)、捜査(発覚)。漏れることもある。知らせを積んだら true
  function termSlush(state) {
    const sc = get(state), L = SL(), cr = state.career;
    if (sc.hidden <= 0) return false;
    sc.exposure = Math.min(100, sc.exposure + L.drift);
    for (let k = 0; k < L.stages.length; k++) {
      if (sc.exposure >= L.stages[k] && sc.stage <= k) {
        sc.stage = k + 1;
        if (k < L.stages.length - 1) { cr.pending.push({ type: 'slush', step: k }); return true; }
        const ev = expose(state, 'probe', 'term');
        cr.pending.push({ type: 'event', title: ev.title, text: ev.text, retire: ev.retire });
        return true;
      }
    }
    if (R.next(state) < sc.exposure * L.leak) {
      const ev = expose(state, 'leak', 'term');
      cr.pending.push({ type: 'event', title: ev.title, text: ev.text, retire: ev.retire });
      return true;
    }
    return false;
  }
  // 取材・告発への答え。correct 記載を訂正して返す / それ以外は否定する
  function answerSlush(state, correct) {
    const sc = get(state), L = SL(), cr = state.career, p = cr.pending[0];
    if (!p || p.type !== 'slush') return null;
    let text;
    if (correct) {
      const back = sc.hidden;
      cr.money = Math.max(0, cr.money - back);
      sc.hidden = 0; sc.exposure = Math.max(0, sc.exposure + L.correct); sc.stage = 0; sc.clean = 0;
      cr.merit = Math.max(0, cr.merit + L.correctMerit);
      text = '収支報告書を訂正し、載せていなかった ' + back + '万円を返した。「記載漏れ」として頭を下げた。党内評価 ' + L.correctMerit + '。';
    } else {
      sc.exposure = Math.min(100, sc.exposure + L.deny);
      text = '「事実無根」と否定した。記者はまだ追っている(発覚度 ' + Math.round(sc.exposure) + ')。';
    }
    cr.pending.shift();
    cr.news = text;
    return { text: text };
  }
  // 選挙戦の朝:発覚度があれば、報道で漏れることがある。討論会の日は、相手が疑惑を追及してくる(1人用)
  function campaignSlush(state) {
    const sc = get(state), L = SL(), camp = state.camp, B = Game.Balance;
    if (camp.day > 1 && sc.hidden > 0 && R.next(state) < sc.exposure * L.leakCampaign) {
      const ev = expose(state, 'leak', 'campaign');
      camp.pending.push({ type: 'event', id: 'slush', title: ev.title, text: ev.text, fx: ev.fx });
      return;
    }
    if (!camp.vs && camp.day === B.debateDay && sc.hidden > 0 && sc.exposure >= L.attackAt) {
      const rv = Game.Campaign.cand(camp, Game.Campaign.topRival(camp)), fx = [];
      regions().forEach(function (r) { fx.push({ region: r.id, who: 'me', gain: Math.round(Game.Campaign.applyGain(camp, r.id, 'me', L.attackHit, 'interest')) }); });
      if (camp.voters) Game.Voters.rumor(camp, 'me', -1, 'interest');
      sc.exposure = Math.min(100, sc.exposure + L.attackExposure);
      camp.pending.unshift({ type: 'event', id: 'slushAttack', title: '討論会で疑惑を追及された', fx: fx,
        text: rv.short + '候補が「収支報告書に載らないお金があるのでは」と切り込んできた。答えに詰まり、全地区で支持が ' + (-L.attackHit) + ' 下がった(発覚度 ' + Math.round(sc.exposure) + ')。' });
    }
  }
  // 対戦モード:相手に裏金のうわさがあるか(公開討論会で「裏金を追及する」が選べる)
  function rivalRumor(state) { const vs = state.camp && state.camp.vs; return !!(vs && vs.stash.scandal && vs.stash.scandal.hidden > 0); }
  // 対戦モード:公開討論会で、もう1人の人間の裏金を追及する(相手の視点に切り替えて当てる)
  function pvpAttack(state) {
    const L = SL(), camp = state.camp, fx = [];
    regions().forEach(function (r) { fx.push({ region: r.id, who: 'vs', gain: Math.round(Game.Campaign.applyGain(camp, r.id, 'vs', L.pvpHit, 'interest')) }); });
    if (camp.voters) Game.Voters.rumor(camp, 'vs', -1, 'interest');
    const other = camp.vs.stash.scandal;
    other.exposure = Math.min(100, other.exposure + L.pvpExposure);
    const name = Game.Campaign.cand(camp, 'vs').short;
    return { fx: fx, text: name + '候補の政治資金を追及した。「載っていないお金がある」。会場がざわつき、' + name + '候補の支持が全地区で ' + (-L.pvpHit) + ' 下がった。' };
  }

  // 次の選挙の始まり:クリーンの評判と、発覚・公認取り消しの響き。newCampaign が読み、持ち越しを空にする
  function startOfElection(state) {
    const sc = get(state), L = SL();
    const top = sc.clean >= L.cleanMax;
    const out = { clean: top ? L.cleanStart : 0, penalty: sc.next.start, unendorsed: sc.next.unendorsed, found: sc.next.found, moved: sc.next.moved, merged: sc.next.merged,
      sns: top ? L.sns : 0 };
    sc.next = { start: 0, unendorsed: false, moved: null, merged: false, found: null };
    sc.probe = 0;
    if (top) sc.cleanTops = (sc.cleanTops || 0) + 1;   // 殿堂の「清廉潔白」のため、最高に届いた任期の数を覚えておく
    sc.clean = 0;   // 評判は任期ごと。次の任期で、また積み上げる
    return out;
  }

  // ================= R10 選挙違反 =================
  function risk() {
    const D = Game.Data.DISTRICT;
    if (D.national) return 0;
    const S = Game.Balance.seats[D.id];
    return S && S.fraud != null ? S.fraud : FR().defaultRisk;
  }
  // 選挙戦の朝の、違反がらみの出来事(1人用の選挙区だけ)。積んだら true
  function campaignFraud(state) {
    const camp = state.camp, F = FR();
    if (camp.vs || Game.Data.DISTRICT.national) return false;
    if (R.next(state) >= F.eventChance * risk()) return false;
    const kind = R.weighted(state, ['bribe', 'smear'], function (k) { return F[k].weight; });
    if (kind === 'bribe') {
      // 組織票の地区で、いちばん有権者の多いところ
      const orgs = regions().filter(function (r) { return r.tags.indexOf('org') >= 0; });
      const reg = (orgs.length ? orgs : regions()).slice().sort(function (a, b) { return b.voters - a.voters; })[0];
      camp.pending.push({ type: 'fraud', kind: 'bribe', region: reg.id });
    } else {
      camp.pending.push({ type: 'fraud', kind: 'smear', who: Game.Campaign.topRival(camp) });
    }
    return true;
  }
  // 違反がらみの出来事への答え。bribe: 'accept' 黙認 / 'refuse' 断る。smear: 'fight' 反撃 / 'fair' 正々堂々
  function answerFraud(state, opt) {
    const camp = state.camp, F = FR(), p = camp.pending[0], C = Game.Campaign, sc = get(state);
    if (!p || p.type !== 'fraud') return null;
    const fx = [];
    let text;
    if (p.kind === 'bribe') {
      const reg = Game.Data.REGION[p.region];
      if (opt === 'accept') {
        fx.push({ region: p.region, who: 'me', gain: Math.round(C.applyGain(camp, p.region, 'me', F.bribe.gain, 'few')) });   // 買収:少数に強く(R18)
        sc.probe += F.bribe.probe;
        text = '見て見ぬふりをした。' + reg.name + 'で票がまとまりはじめた(+' + F.bribe.gain + ')。だが、捜査当局の目が陣営に向いている(捜査ゲージ ' + sc.probe + ')。';
      } else {
        text = 'きっぱり断った。「お金で票は買わない」。陣営の空気が引き締まった。';
      }
    } else {
      const rv = C.cand(camp, p.who);
      if (opt === 'fight') {
        regions().forEach(function (r) {
          fx.push({ region: r.id, who: p.who, gain: Math.round(C.applyGain(camp, r.id, p.who, F.smear.hit, 'seed')) });
          fx.push({ region: r.id, who: 'me', gain: Math.round(C.applyGain(camp, r.id, 'me', F.smear.self, 'seed')) });
        });
        if (camp.voters) { Game.Voters.rumor(camp, p.who, -1, 'seed'); Game.Voters.rumor(camp, 'me', -1, 'seed'); }   // 泥仕合の噂が広がる(R18)
        text = rv.short + '陣営のしわざだと訴え、言い返した。相手は全地区 ' + F.smear.hit + '。泥仕合に有権者はうんざりし、こちらも全地区 ' + F.smear.self + '。';
      } else {
        regions().forEach(function (r) { if (r.tags.indexOf('float') >= 0) fx.push({ region: r.id, who: 'me', gain: Math.round(C.applyGain(camp, r.id, 'me', F.smear.fair)) }); });
        text = '何も言い返さず、破られたポスターを貼り直して回った。その姿が共感を呼び、浮動票の地区で +' + F.smear.fair + '。';
      }
    }
    camp.pending[0] = { type: 'event', id: 'fraudResult', title: p.kind === 'bribe' ? '買収の申し出' : '怪文書とポスター破り', text: text, fx: fx };
    camp.news = text;
    return { text: text, fx: fx };
  }
  // 開票立会人を送る(資金だけ使う。体力は要らない)
  function sendWitness(state) {
    const camp = state.camp, F = FR();
    if (camp.witness) return { ok: false, reason: 'もう送ってある。' };
    if (camp.money < F.witness) return { ok: false, reason: '資金が足りない。' };
    camp.money -= F.witness;
    camp.witness = true;
    camp.news = '開票所に立会人を送ることにした(' + F.witness + '万円)。不審な動きがあれば、その場で再集計を求められる。';
    return { ok: true, msg: camp.news };
  }
  // 開票所の不審な動き(vote.js が票を数えたあと、勝ち負けを決める前に呼ぶ)。regions / totals は書きかえる
  function countFraud(state, regionsVotes, totals) {
    const camp = state.camp, F = FR();
    if (camp.vs || Game.Data.DISTRICT.national) return null;
    if (R.next(state) >= F.countChance * risk()) return null;
    const rid = Object.keys(regionsVotes).sort(function (a, b) { return regionsVotes[b].votes.me - regionsVotes[a].votes.me; })[0];
    if (camp.witness) return { caught: true, region: rid };
    const to = Object.keys(totals).filter(function (k) { return k !== 'me'; }).sort(function (a, b) { return totals[b] - totals[a]; })[0];
    const n = Math.round(regionsVotes[rid].votes.me * F.steal);
    regionsVotes[rid].votes.me -= n; regionsVotes[rid].votes[to] += n;
    totals.me -= n; totals[to] += n;
    return { caught: false, region: rid, to: to, votes: n };
  }
  // 連座制:選挙のあと、陣営幹部が有罪になるか。なれば当選無効と、その選挙区から立てなくなる。返り値 true で当選無効
  function rensa(state) {
    const sc = get(state), F = FR();
    const probe = sc.probe;
    sc.probe = 0;
    if (probe <= 0 || R.next(state) >= probe * F.convict) return false;
    sc.ban = { seat: state.player.seat || 'hokuyo3', turns: F.banTurns };
    return true;
  }

  // ================= 任期の出来事(補欠選挙・区割り改定)=================
  // 会期の始まりに呼ぶ(career.js の startTurn)。積んだら true
  function termEvents(state) {
    const sc = get(state), cr = state.career, F = FR(), RDB = RD();
    if (sc.ban && sc.ban.turns > 0) sc.ban.turns -= 1;
    if (sc.ban && sc.ban.turns <= 0) sc.ban = null;
    if (termSlush(state)) return true;
    if (cr.leader) return false;
    // 補欠選挙:浪人のとき、選挙区の議員が逮捕され、議席が空く
    if (cr.status === 'ronin' && R.next(state) < F.by.chance * Math.min(F.by.riskMax, risk() / F.defaultRisk)) {
      cr.pending.push({ type: 'byElection' });
      return true;
    }
    // 区割り改定:一票の格差訴訟で違憲状態の判決
    if (!sc.redistricted && cr.turn > 1 && R.next(state) < RDB.chance) {
      sc.redistricted = true;
      const kind = R.next(state) < RDB.vanish ? 'vanish' : 'merge';
      const names = Game.Data.SAME_PARTY_RIVALS;
      cr.pending.push({ type: 'redistrict', kind: kind, rival: names[Math.floor(R.next(state) * names.length)], rivalStr: Math.round(RDB.race.rival + R.normal(state) * RDB.race.noise) });
      return true;
    }
    return false;
  }
  // 補欠選挙の見込み
  function byChance(cr) {
    const F = FR().by, sum = Object.keys(cr.base || {}).reduce(function (a, k) { return a + (cr.base[k] || 0); }, 0);
    return Math.min(F.max, F.base + sum * F.perBase);
  }
  // 公認争いの自分の強さ
  function raceStrength(cr) {
    const Rc = RD().race, sum = Object.keys(cr.base || {}).reduce(function (a, k) { return a + (cr.base[k] || 0); }, 0);
    return Math.round(Rc.base + (cr.merit || 0) * Rc.merit + (cr.wins || 0) * Rc.win + sum * Rc.perBase);
  }
  // その選挙区で、党 party が議席を持っているか(ほかの党から見て、その党が現職)
  function heldBy(seat, party) {
    const roles = Game.Data.SEATS[seat].roles;
    return Object.keys(roles).some(function (p) { return p !== party && roles[p][party] === 'incumbent'; });
  }
  // 移れる選挙区(いまの選挙区、連座制で立てない選挙区、自分の党の現職がいる選挙区を除く)
  function movableSeats(state) {
    const sc = get(state), now = state.player.seat || 'hokuyo3', party = state.player.party;
    return Game.Data.SEAT_ORDER.filter(function (k) { return k !== now && !(sc.ban && sc.ban.seat === k) && !heldBy(k, party); });
  }
  // 国替え:選挙区を移る。地盤は keep の割合だけ残る(地区の id は選挙区どうしで同じ)。相手は新しい選挙区の顔ぶれになる
  function moveSeat(state, seat, keep) {
    const cr = state.career, sc = get(state);
    state.player.seat = seat;
    Game.Data.setHome(seat);
    Game.Data.useArena(cr.leader ? 'nation' : 'home');
    Object.keys(cr.base || {}).forEach(function (k) { cr.base[k] = Math.round(cr.base[k] * keep); });
    cr.rivalRoles = null; cr.rivalSolid = {}; cr.lastShare = {};
    sc.next.moved = seat;
    return Game.Data.SEATS[seat].name + 'に移った。' + (keep > 0 ? '前の地盤の一部は、新しい選挙区にもついてくる。' : '地盤はゼロからだ。');
  }

  return {
    get: get, empty: empty, isFund: isFund, record: record, expose: expose, answerSlush: answerSlush, campaignSlush: campaignSlush,
    rivalRumor: rivalRumor, pvpAttack: pvpAttack, startOfElection: startOfElection,
    risk: risk, campaignFraud: campaignFraud, answerFraud: answerFraud, sendWitness: sendWitness, countFraud: countFraud, rensa: rensa,
    termEvents: termEvents, byChance: byChance, raceStrength: raceStrength, movableSeats: movableSeats, moveSeat: moveSeat,
  };
})();
