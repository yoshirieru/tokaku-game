// 補欠選挙・地方選挙(M15)。DOMには触らない。
//
// 議員任期(議員・浪人・新党の結党準備)と党首モードのターンの始まりに、ときどき選挙が起きる:
//   byelection … ほかの選挙区の衆院補欠選挙(党の候補を応援する)
//   homeBy     … 地元の選挙区の補欠選挙(浪人中だけ。現職が知事選へ転身して空いた。自分が出られる)
//   governor   … 地元の県の知事選(党の候補を応援する。議員・浪人なら自分が出ることもできる → 勝てば知事に転身してエンディング)
//   mayor      … 地元の市の市長選(党の候補を応援する)
// 「応援に入る」「自分が出る」を選ぶと、選挙区モードのエンジンで6日間の短期決戦を戦う(state.campaign に camp.sub をつけて入れる。
// 任期・党首モードのあいだ state.campaign は使っていないので、本番の選挙戦の画面と開票特番をそのまま使える)。
// 結果は after() で反映し、任期・党首モードの知らせに書いて元の画面に戻る。数値は balance.js の Game.Balance.local。
window.Game = window.Game || {};

Game.Local = (function () {
  const LB = () => Game.Balance.local;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand = (state) => Game.Career._rand(state.career);
  const KIND_TITLE = { byelection: '衆院補欠選挙', homeBy: '衆院補欠選挙', governor: '知事選挙', mayor: '市長選挙' };
  const TITLES = ['元県議', '元市議', '元官僚', '元アナウンサー', '弁護士', '元副知事', '会社経営者', '医師'];

  function mode(state) {
    if (state.leader && state.leader.mode === 'leader') return 'leader';
    return state.career ? state.career.status : null;
  }
  function ourParty(state) {
    return state.leader && state.leader.mode === 'leader' ? state.leader.party : state.player.party;
  }
  function newName(state, used) {
    const N = Game.Data.NAME_POOL;
    for (let i = 0; i < 50; i++) {
      const n = N.family[Math.floor(rand(state) * N.family.length)] + ' ' + N.given[Math.floor(rand(state) * N.given.length)];
      if (!used.has(n)) { used.add(n); return n; }
    }
    return '候補 ' + used.size;
  }
  function pick(state, arr) {
    return arr[Math.floor(rand(state) * arr.length)];
  }
  function supportOf(state, party) {
    if (state.leader && state.leader.mode === 'leader' && state.world.parties) return Game.Leader.supportOf(state, party);
    const b = Game.Balance.parties[party];
    return (b ? b.support : 1) + ((state.world.partyShift || {})[party] || 0);
  }
  // 相手の党:主要3党のうち、こちら以外で支持率の高い2党
  function majorRivals(state, ours) {
    return ['minsei', 'kyowa', 'mirai'].filter((p) => p !== ours).sort((a, b) => supportOf(state, b) - supportOf(state, a)).slice(0, 2);
  }
  const pref = () => Game.Data.DISTRICT_BLOCK.prefectures[0];

  // ---------------- 起きるかどうか ----------------
  function roll(state) {
    const m = mode(state);
    const ch = LB().chance[m];
    if (!ch || state.localPending) return null;
    if (rand(state) >= ch) return null;
    const kinds = m === 'ronin'
      ? (rand(state) < LB().homeByShare && (state.career.rivals || []).some((r) => r.role.startsWith('incumbent')) ? ['homeBy'] : ['byelection', 'governor', 'mayor'])
      : m === 'leader' ? ['byelection', 'governor'] : m === 'founder' ? ['byelection', 'mayor'] : ['byelection', 'governor', 'mayor'];
    return makeEvent(state, pick(state, kinds));
  }

  // 選挙の中身を決めて、出来事をつくる
  function makeEvent(state, kind) {
    const m = mode(state);
    const ours = ourParty(state);
    const used = new Set([state.player.name]);
    const L = LB();
    let place;
    let seatId = Game.Data.SEAT_ID;
    let rivals;
    if (kind === 'byelection') {
      const others = Game.Data.SEATS.filter((s) => s.id !== Game.Data.SEAT_ID);
      const seat = pick(state, others);
      seatId = seat.id;
      place = seat.name;
      const key = Game.Data.PARTIES[ours] && Game.Data.PARTIES[ours].custom ? 'newparty' : ours;
      const roles = (seat.roles || Game.Data.BASE_RIVAL_ROLES)[key];
      const people = Object.assign({}, Game.Data.BASE_RIVALS, seat.people || {});
      rivals = roles
        ? Object.keys(roles).map((p) => ({ party: p, name: (people[p] && people[p].name) || newName(state, used), role: roles[p].startsWith('incumbent') ? L.rivalRole : roles[p] }))
        : majorRivals(state, ours).map((p, i) => ({ party: p, name: newName(state, used), role: i === 0 ? L.rivalRole : 'newcomer' }));
    } else if (kind === 'homeBy') {
      place = Game.Data.DISTRICT_NAME;
      // 現職(前回勝ったライバル)が知事選へ転身して空いた。その党は新人を立てる
      rivals = state.career.rivals.map((r) => (r.role.startsWith('incumbent') ? { party: r.party, name: newName(state, used), role: L.homeBySuccessorRole, home: null, wins: 0, replaced: r.name } : Object.assign({}, r)));
    } else {
      place = kind === 'governor' ? `${pref()}県` : `${pref()}市`;
      rivals = majorRivals(state, ours).map((p, i) => ({ party: p, name: newName(state, used), role: i === 0 ? L.rivalRole : 'newcomer', title: pick(state, TITLES) }));
    }
    const candidate = { name: newName(state, used), title: pick(state, TITLES) };
    const sub = { kind, place, seatId, title: `${place} ${KIND_TITLE[kind]}`, ours, candidate, rivals, year: state.world.year, mode: m };
    const pInfo = Game.Data.PARTIES[ours] || { name: ours };
    const rivalText = rivals.map((r) => `${(Game.Data.PARTIES[r.party] || Game.Data.MINOR_PARTIES[r.party] || { name: r.party }).name}の${r.name}氏`).join('、');
    let text;
    if (kind === 'homeBy') {
      const gone = rivals.find((r) => r.replaced);
      text = `${place}の${gone ? gone.replaced + '議員' : '現職'}が知事選に転じるため辞職し、補欠選挙が行われる。浪人中のあなたにとって、国会に戻る好機だ。相手は${rivalText}。`;
    } else if (kind === 'byelection') {
      text = `${place}で議員の辞職にともなう補欠選挙。${pInfo.name}は${candidate.title}の${candidate.name}氏を立てた。相手は${rivalText}。国政の行方を占う選挙として注目されている。`;
    } else {
      text = `${place}の${kind === 'governor' ? '知事' : '市長'}が引退を表明し、選挙が行われる。${pInfo.name}は${candidate.title}の${candidate.name}氏を推す。相手は${rivalText}。${m === 'leader' ? '党首の求心力が問われる。' : '地元の首長選は、次の選挙の足場にもなる。'}`;
    }
    const choices = [];
    const c = state.career;
    if (kind === 'homeBy') {
      choices.push({ id: 'run', label: '出馬する', note: `${L.days}日間の短期決戦。勝てば国会に戻れる` });
    } else {
      choices.push({ id: 'campaign', label: '応援に入る', note: `${L.days}日間の短期決戦を自分の手で戦う(資金は党が${L.supportMoney}万円)。勝てば${m === 'leader' ? '党首の求心力' : '党内評価'}が大きく上がり、負ければ下がる` });
      const S = L.speech;
      choices.push({ id: 'speech', label: '応援演説だけ', note: `${S.money}万円。結果は党の地力しだい。効き目は小さい`, disabled: c.money < S.money });
      if (kind === 'governor' && (m === 'member' || m === 'ronin')) {
        const ok = m === 'ronin' || c.wins >= L.governorRun.minWins;
        choices.push({ id: 'run', label: '自分が知事選に出る', note: ok ? (m === 'member' ? '議員を辞めて挑む。勝てば知事に転身(エンディング)、負ければ浪人' : '勝てば知事に転身(エンディング)') : `当選${L.governorRun.minWins}回以上で出られる`, disabled: !ok });
      }
    }
    choices.push({ id: 'skip', label: kind === 'homeBy' ? '見送る' : '関わらない', note: kind === 'homeBy' ? '次の総選挙を待つ' : m === 'leader' ? '党首が動かないと、党内に不満が残る' : '党の要請に応えず、評価が少し下がる' });
    state.localPending = sub;
    return { id: 'local', kicker: kind === 'governor' || kind === 'mayor' ? '地方選挙' : '補欠選挙', title: sub.title, text, choices, sub };
  }

  // ---------------- 選ぶ ----------------
  // 戻り値:{ text, started }。started なら state.campaign に短期決戦が入り、state.screen = 'campaign'
  function choose(state, ev, choice) {
    const sub = ev.sub;
    const m = sub.mode;
    const L = LB();
    state.localPending = null;
    if (choice === 'skip') {
      apply(state, m, 'skip');
      return { text: sub.kind === 'homeBy' ? '補欠選挙は見送った。' : `${sub.title}には関わらなかった。` };
    }
    if (choice === 'speech') {
      const S = L.speech;
      state.career.money -= S.money;
      const theirs = Math.max(...sub.rivals.map((r) => supportOf(state, r.party)));
      const p = clamp(S.base + (supportOf(state, sub.ours) - theirs) * S.perSupport, S.min, S.max);
      const won = rand(state) < p;
      apply(state, m, won ? 'speechWin' : 'speechLose');
      record(state, sub, won, 'speech');
      return { text: `${sub.title}で応援演説に立った。${sub.candidate.name}氏は${won ? '当選した' : '敗れた'}。` };
    }
    sub.role = choice === 'run' ? 'run' : 'campaign';
    // 知事選に自分が出るなら、相手の本命は県政に通じた有力候補になる
    if (sub.kind === 'governor' && sub.role === 'run' && sub.rivals[0]) sub.rivals[0].role = L.governorRun.rivalRole;
    startCampaign(state, sub);
    return { text: sub.role === 'run' ? `${sub.title}への出馬を表明した。` : `${sub.title}の応援に入る。${sub.candidate.name}氏を勝たせよう。`, started: true };
  }

  // 短期決戦を組み立てる
  function startCampaign(state, sub) {
    const L = LB();
    const c = state.career;
    const seat = Game.Data.seatById(sub.seatId);
    const regions = seat.districts;
    const run = sub.role === 'run';
    const home = sub.seatId === Game.Data.SEAT_ID;
    const at = (obj, rid, d) => (obj && obj[rid] !== undefined ? obj[rid] : d);
    const recog = {};
    const personal = {};
    const solidBonus = {};
    for (const r of regions) {
      if (run) {
        const G = L.governorRun;
        const share = sub.kind === 'governor' ? G.homeShare : 1;
        recog[r.id] = at(c.home.recog, r.id, 0) * share + (sub.kind === 'governor' ? G.recogBonus : 0);
        personal[r.id] = at(c.home.personal, r.id, 0) * share + (sub.kind === 'governor' ? G.personalBonus : 0);
        solidBonus[r.id] = at(c.home.solid, r.id, 0) * share;
      } else {
        recog[r.id] = L.candidate.recog + (home ? at(c.home.recog, r.id, 0) * L.homeCarry : 0);
        personal[r.id] = L.candidate.personal;
      }
    }
    const me = {
      id: 'player', name: run ? state.player.name : sub.candidate.name, party: sub.ours, isPlayer: true, role: run ? 'former' : 'newcomer',
      recog, personal, solidBonus, leaderVisits: 1,
    };
    const AI = Game.Balance.ai;
    const cands = [me].concat(sub.rivals.map((r) => {
      const base = Game.Balance.rivals[r.role] || Game.Balance.rivals.newcomer;
      return {
        id: 'rival_' + r.party, name: r.name, party: r.party, isPlayer: false, role: r.role,
        // 地元の補選では、地盤を持つライバル(前回からの続き・辞めた現職の後継)はその地盤で戦う(役割の基準値は下回らない)
        recog: r.home ? Object.fromEntries(regions.map((g) => [g.id, Math.max(base.recog, r.home.recog[g.id] || 0)])) : base.recog,
        personal: r.home ? Object.fromEntries(regions.map((g) => [g.id, Math.max(base.personal, r.home.personal[g.id] || 0)])) : base.personal,
        skill: r.role.startsWith('incumbent') ? AI.skill.incumbent : AI.skill.challenger,
        leaderVisits: AI.leaderVisits[r.party] || 0,
      };
    }));
    const lean = Game.Balance.seats[sub.seatId] || {};
    const pledges = run && state.support ? state.support.pledges.slice() : (Game.Data.PARTY_PLATFORMS[sub.ours] || []).slice(0, 2);
    const seed = ((c.rng || 7) ^ 0x2f6b) >>> 0;
    const camp = Game.Campaign.newSubCampaign({
      seed, regions, days: L.days, candidates: cands,
      money: run ? c.money : L.supportMoney,
      sub: Object.assign({ sea: seat.sea, proxy: !run }, sub),
      support: { pledges, carried: state.support ? { relations: state.support.relations } : null },
      partyShift: state.world.partyShift ? Object.assign({}, state.world.partyShift) : {},
      localShift: Object.assign({}, lean.support), localSolid: Object.assign({}, lean.solid),
      sns: Game.Sns.ensure(state),
    });
    state.campaign = camp;
    state.election = null;
    state.screen = 'campaign';
    state.ui.showMorning = true;
    state.ui.lastResult = null;
    state.ui.selectedRegion = regions[0].id;
    state.ui.showTermReport = false;
    state.ui.showLeaderReport = false;
  }

  // ---------------- 結果の反映 ----------------
  function apply(state, m, key) {
    const L = LB();
    if (m === 'leader') {
      const E = L.leader[key] || {};
      const ld = state.leader;
      if (E.cohesion) ld.cohesion = clamp(ld.cohesion + E.cohesion, 0, 100);
      if (E.support) ld.supportBonus = (ld.supportBonus || 0) + E.support;
      return;
    }
    const E = L.career[key] || {};
    const c = state.career;
    if (E.partyEval && c.status === 'member') c.partyEval = Math.max(0, c.partyEval + E.partyEval);
    if (E.allies) c.allies += E.allies;
    if (E.nationalRecog) c.nationalRecog = Math.min(100, (c.nationalRecog || 0) + E.nationalRecog);
  }
  function record(state, sub, won, how) {
    state.localElections = state.localElections || [];
    state.localElections.push({ year: sub.year, title: sub.title, kind: sub.kind, how, won });
  }

  // 開票のあと(main.js の finishElection から)。知らせの行を返し、元の画面に戻す
  function after(state) {
    const camp = state.campaign;
    const sub = camp.sub;
    const el = state.election;
    const won = el.winner === camp.player.id;
    const L = LB();
    const c = state.career;
    const m = sub.mode;
    const lines = [];
    const votes = `得票率 ${(el.player.share * 100).toFixed(1)}%`;
    if (sub.kind === 'homeBy') c.money = Math.max(0, camp.player.money);
    if (sub.role === 'campaign') {
      apply(state, m, won ? 'campaignWin' : 'campaignLose');
      lines.push(won ? `${sub.title}:応援した${sub.candidate.name}氏が当選した(${votes})。` : `${sub.title}:応援した${sub.candidate.name}氏は敗れた(${votes})。`);
      if (m === 'leader') lines.push(won ? '「党首の応援が効いた」と党内の評価が上がった。' : '党内から党首の責任を問う声が出ている。');
      else if (won && (sub.kind === 'governor' || sub.kind === 'mayor')) {
        for (const rid in c.home.solid) c.home.solid[rid] = Math.min(Game.Balance.term.homeCap.solid, (c.home.solid[rid] || 0) + L.career.localSolid);
        lines.push('地元の首長が味方になった。後援会の結びつきが強まった。');
      }
    } else if (sub.kind === 'homeBy') {
      if (won) {
        c.status = 'member';
        c.wins++;
        c.partyEval += L.career.homeByWin.partyEval;
        for (const reg of camp.regionList) {
          c.home.recog[reg.id] = camp.regions[reg.id].recog[camp.player.id];
          c.home.personal[reg.id] = Math.min(Game.Balance.term.homeCap.personal, camp.regions[reg.id].personal[camp.player.id]);
        }
        c.elections.push({ year: state.world.year, party: state.player.party, district: `${Game.Data.DISTRICT_NAME}(補選)`, result: 'smd', votes: el.player.votes, share: el.player.share, ratio: 1 });
        lines.push(`${sub.title}に当選し、国会に戻った(当選${c.wins}回、${votes})。`);
      } else {
        lines.push(`${sub.title}に挑んだが、敗れた(${votes})。浪人生活が続く。`);
      }
      // ライバルの顔ぶれ:辞めた現職の代わりに立った新人が、勝てば現職になる
      c.rivals = sub.rivals.map((r) => {
        const cand = camp.candidates.find((x) => x.party === r.party && !x.isPlayer);
        const isWinner = cand && el.winner === cand.id;
        return { party: r.party, name: r.name, role: isWinner ? 'incumbent' : r.role, wins: (r.wins || 0) + (isWinner ? 1 : 0), home: r.home || null };
      });
    } else {
      // 知事選に自分が出た(使った選挙資金を持ち帰る)
      c.money = Math.max(0, camp.player.money);
      if (won) {
        lines.push(`${sub.title}に当選し、${sub.place}知事に就任する(${votes})。国政を離れ、地方から政治を動かす道を選んだ。`);
        state.pendingEnding = 'governor';
        state.governor = { place: sub.place, year: state.world.year, share: el.player.share };
      } else {
        if (c.status === 'member') {
          c.status = 'ronin';
          c.postLevel = 0;
        }
        c.partyEval = Math.max(0, c.partyEval + L.career.governorLose.partyEval);
        lines.push(`${sub.title}に挑んだが、敗れた(${votes})。議席も失い、浪人として出直すことになった。`);
      }
    }
    record(state, sub, won, sub.role);
    // 元の画面へ。短期決戦の選挙戦は片づける
    state.campaign = null;
    state.election = null;
    if (state.pendingEnding) return lines;
    if (m === 'leader') {
      const ld = state.leader;
      ld.report = { title: sub.title, lines, event: null };
      state.screen = 'leaderHub';
      state.ui.showLeaderReport = true;
    } else {
      c.report = { title: sub.title, lines, event: null };
      state.screen = 'term';
      state.ui.showTermReport = true;
    }
    return lines;
  }

  return { roll, makeEvent, choose, after };
})();
