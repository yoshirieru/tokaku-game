// 新党(スタート時・離党)と移籍。DOMには触らない。
//
// state.party = {
//   custom: true, id: 'newparty', name, short, color, ideology, pledges,
//   origin: 'start' | 'defect', founded: 年,
//   mps: 所属の衆議院議員の数, upperMps: 所属の参議院議員の数, requirement: 政党要件を満たしているか,
//   candidates: 公募した候補者の数, newness: 新しさ(0〜100), buzz: SNSの盛り上がり, press: 記者会見の露出,
//   national: 最初の総選挙の全国の結果(M6 で本格的な全国選挙に置き換える),
//   upper: 結党準備中の参院選の結果(M13), upperShare: その得票率(政党要件に数える),
// }
// 新党は Game.Data.PARTIES / Game.Balance.parties などに 'newparty' として登録して、既存の仕組みに乗せる。
window.Game = window.Game || {};

Game.NewParty = (function () {
  const NB = () => Game.Balance.newParty;
  const ID = 'newparty';
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function supportOf(p) {
    const B = NB();
    const v = B.baseSupport + p.newness * B.newnessToSupport + p.buzz * B.buzzToSupport + p.press * B.pressToSupport
      + p.candidates * B.candidateToSupport + (p.mps + (p.upperMps || 0)) * B.mpsToSupport;
    return clamp(v, 0.3, B.supportMax);
  }

  // セーブを読み込んだときにも呼ぶ
  function register(p) {
    const ide = Game.Data.IDEOLOGIES[p.ideology];
    Game.Data.PARTIES[ID] = {
      id: ID, name: p.name, short: p.short, color: p.color,
      position: `新党(${ide.name})`, difficulty: '', difficultyNote: '',
      description: `${p.founded}年に結成された新党。理念は${ide.name}。`,
      playable: false, custom: true,
    };
    Game.Balance.parties[ID] = { support: supportOf(p), lean: ide.lean, orgStrength: 0, orgLean: {} };
    Game.Balance.orgs.partyBase[ID] = {};   // 支援団体との関係は白紙から
    Game.Data.PARTY_PLATFORMS[ID] = p.pledges.slice();
    Game.Data.PARTY_MPS[ID] = Math.max(1, p.mps);
    const lists = Game.Balance.proportional.lists;
    if (p.requirement) {
      const N = NB().national;
      lists[ID] = {
        topSolo: 0,
        smdCandidates: clamp(Math.round(p.candidates * Game.Data.DISTRICT_BLOCK.districts / 289) + 1, 1, Game.Data.DISTRICT_BLOCK.districts),
        smdWinRate: smdWinChance(supportOf(p)),
        ratioMean: 0.4, ratioSd: 0.15,
      };
    } else {
      delete lists[ID];
    }
  }

  function smdWinChance(support) {
    const N = NB().national;
    return clamp(N.smdWinBase + (support - 2) * N.smdWinPerSupport, N.smdWinBase, N.smdWinMax);
  }

  // opts: { name, short, color, ideology, pledges, origin, mps, year }
  function create(state, opts) {
    const p = {
      custom: true, id: ID,
      name: opts.name, short: opts.short, color: opts.color, ideology: opts.ideology, pledges: opts.pledges.slice(),
      origin: opts.origin, founded: opts.year,
      mps: opts.mps || 0, upperMps: 0, requirement: false, candidates: 0,
      newness: NB().newnessStart, buzz: 0, press: 0, national: null,
    };
    p.requirement = p.mps >= NB().requirement.mps;
    state.party = p;
    register(p);
    return p;
  }

  // 毎ターン:新しさ・盛り上がりが薄れる、政党交付金、候補者の不祥事のリスク
  function turnUpdate(state, lines) {
    const p = state.party;
    if (!p || !p.custom) return null;
    const B = NB();
    p.newness = Math.max(0, p.newness - B.newnessDecay);
    p.buzz *= B.buzzDecay;
    p.press *= B.pressDecay;
    if (p.requirement) {
      state.career.money += B.subsidyPerTurn;
      lines.push(`政党交付金 ${B.subsidyPerTurn}万円が入った。`);
    }
    register(p);
    return null;
  }

  function supportNow(state) {
    return state.party && state.party.custom ? supportOf(state.party) : null;
  }

  // ---------------- 党としての行動(career.js から呼ぶ) ----------------
  function act(state, id, target) {
    const p = state.party;
    const A = NB().actions[id];
    const c = state.career;
    if (id === 'recruit') {
      p.candidates += A.candidates;
      register(p);
      return `候補者を公募し、${A.candidates}人を新たに擁立した(計${p.candidates}人)。`;
    }
    if (id === 'partySns') {
      // 投稿の種類を選ぶ(sns.js)。党の盛り上がりは投稿の伸びに比例し、バズれば「新しさ」が少し戻る
      const r = Game.Sns.post(Game.Sns.ensure(state), target, () => Game.Career._rand(c), { pledges: p.pledges, newness: p.newness });
      p.buzz += A.buzz * (r.buzz / Game.Balance.sns.posts[target].buzz);
      for (const rid in c.home.recog) c.home.recog[rid] = Math.min(100, (c.home.recog[rid] || 0) + A.recog * r.recogMult);
      let text = '党の' + r.text;
      if (r.viral) {
        p.newness = Math.min(100, p.newness + A.newnessOnViral);
        text += '「新しい政党」として改めて注目を集めた。';
      }
      register(p);
      return text;
    }
    if (id === 'press') {
      p.press += A.press;
      c.nationalRecog = Math.min(100, (c.nationalRecog || 0) + A.nationalRecog);
      register(p);
      return '記者会見を開き、党の方針を説明した。';
    }
    return '';
  }

  // 公募した候補者の失言・不祥事(人数が多いほど起きやすい)
  function candidateScandalChance(state) {
    const p = state.party;
    return p && p.custom ? Math.min(0.4, p.candidates * NB().actions.recruit.scandalRisk) : 0;
  }
  function applyCandidateScandal(state) {
    const p = state.party;
    p.buzz = Math.max(-10, p.buzz + NB().candidateScandal.support / NB().buzzToSupport);
    register(p);
  }

  // ---------------- 最初の総選挙の全国の結果(簡易。M6 で置き換える) ----------------
  function nationalTally(state) {
    const p = state.party;
    const c = state.career;
    const N = NB().national;
    const rand = () => Game.Career._rand(c);
    const support = supportOf(p);
    const leaderWon = state.election.player.result !== 'lost';

    // 小選挙区:党首以外の候補者
    let smdWins = 0;
    const others = Math.max(0, p.candidates);
    const pWin = smdWinChance(support);
    for (let i = 0; i < others; i++) if (rand() < pWin) smdWins++;
    // 離党でついてきた現職
    let followersKept = 0;
    const followers = p.origin === 'defect' ? Math.max(0, p.mps - 1) : 0;
    for (let i = 0; i < followers; i++) if (rand() < N.followerKeep) followersKept++;
    // 比例
    const share = (support / 100) * (0.85 + rand() * 0.3);
    const canPR = p.requirement || p.candidates >= N.prMinCandidates;
    const prSeats = canPR ? Math.round(N.prSeatsTotal * share * N.prEfficiency) : 0;

    const mps = (leaderWon ? 1 : 0) + smdWins + followersKept + prSeats;
    const R = NB().requirement;
    // 参院選の得票率2%以上・参議院議員も政党要件に数える
    const requirement = mps + (p.upperMps || 0) >= R.mps || share >= R.share || (p.upperShare || 0) >= R.share;
    p.national = {
      year: state.world.year, fielded: others + 1 + followers, smdWins: smdWins + followersKept + (leaderWon ? 1 : 0),
      prSeats, canPR, share, mps, requirement, wasRequirement: p.requirement,
    };
    p.mps = mps;
    p.requirement = requirement;
    p.firstElectionDone = true;
    register(p);
    return p.national;
  }

  // ---------------- 結党準備中の参院選(M13) ----------------
  // 参院選は3年ごとの夏(government.js と同じ日程)。結党準備のあいだに来たら、比例に候補を立てて挑める
  function nextUpperYear(state) {
    const w = state.world;
    if (w.upper) return w.upper.nextYear;
    let y = Game.Data.UPPER_FIRST_ELECTION;
    while (y < w.year || (y === w.year && w.turnIndex > 1)) y += 3;
    return y;
  }
  function upperDue(state) {
    const c = state.career;
    const w = state.world;
    return !!(c && c.status === 'founder' && state.party && state.party.custom && w.turnIndex === 1 && w.year === nextUpperYear(state));
  }
  // 比例の名簿に載せる人数(公募した候補者から回す)と、かかるお金
  function upperList(state) {
    const U = NB().upper;
    return Math.min(state.party.candidates, U.listMax);
  }
  function upperCost(state, strategy) {
    const U = NB().upper;
    return upperList(state) * U.depositPer + ((U.strategy[strategy] || {}).money || 0);
  }
  function upperEvent(state) {
    const U = NB().upper;
    const p = state.party;
    const n = upperList(state);
    const money = state.career.money;
    const short = n < U.prMinCandidates;
    const R = NB().requirement;
    const choices = Object.keys(U.strategy).map((k) => {
      const S = U.strategy[k];
      const cost = upperCost(state, k);
      return {
        id: k, label: S.label,
        note: short ? `比例に出るには候補者${U.prMinCandidates}人以上が要る(いま${p.candidates}人)` : money < cost ? `資金が足りない(${cost}万円かかる)` : `${S.note}(${cost}万円)`,
        disabled: short || money < cost,
      };
    });
    choices.push({ id: 'skip', label: '今回は見送る', note: '次の衆院選に力を集める' });
    return {
      id: 'npUpper', kicker: '参院選', title: `${state.world.year}年 参議院選挙`,
      text: `参議院の半数の改選。比例代表(全国で${Game.Balance.gov.upper.prSeats}議席)は全国の得票で議席が決まるので、組織のない新党でも狙いやすい。得票率${R.share * 100}%以上か、国会議員${R.mps}人以上で政党要件を満たす。名簿には公募した候補者から${n}人を載せる(1人${U.depositPer}万円)。党首のあなたは出ず、次の衆院選に備える。`,
      choices,
    };
  }

  // 参院選の計算(半数改選)。strategy が null なら新党は出ない(ほかの党だけで議席を分ける)
  function runUpper(state, strategy) {
    const U = NB().upper;
    const G = Game.Balance.gov.upper;
    const w = state.world;
    const p = state.party;
    const c = state.career;
    const rand = () => Game.Career._rand(c);
    if (!w.upper) {
      const year = nextUpperYear(state);   // 参議院を作る前に決める(作ったあとは w.upper.nextYear を読むため)
      w.upper = JSON.parse(JSON.stringify(Game.Data.UPPER_INITIAL));
      w.upper.nextClass = 'A';
      w.upper.nextYear = year;
    }
    const lognorm = (sd) => Math.exp((rand() - 0.5) * 2 * sd * 1.7);
    const ids = Object.keys(Game.Data.PARTY_SEATS).filter((id) => id !== 'indep' && Game.Balance.parties[id]);
    const share = {};
    for (const id of ids) share[id] = Math.max(0.1, (Game.Balance.parties[id].support + ((w.partyShift || {})[id] || 0)) * lognorm(G.noise));
    let issueHit = null;
    if (strategy) {
      const S = U.strategy[strategy];
      let mult = S.mult || 1;
      if (strategy === 'sns') mult += (p.newness / 100) * S.newnessMult;
      if (strategy === 'issue') { issueHit = rand() >= S.risk; mult = issueHit ? S.win : S.lose; }
      share[ID] = Math.max(0.1, supportOf(p) * U.voteMult * mult * lognorm(U.noise));
      c.money = Math.max(0, c.money - upperCost(state, strategy));
    }
    const all = Object.keys(share);
    const total = all.reduce((s, id) => s + share[id], 0);
    const list = strategy ? upperList(state) : 0;
    const pr = Game.Vote.dhondt(share, G.prSeats, strategy ? { [ID]: list } : undefined);
    // 選挙区(1人区が多いので大政党に有利。組織のない新党はほとんど取れない)
    const weights = {};
    let sum = 0;
    for (const id of all) { weights[id] = Math.pow(share[id], G.districtPower) * (id === ID ? U.districtMult : 1); sum += weights[id]; }
    const dist = {};
    let given = 0;
    const rema = [];
    for (const id of all) {
      const exact = (G.districtSeats * weights[id]) / sum;
      dist[id] = Math.floor(exact);
      given += dist[id];
      rema.push([id, exact - dist[id]]);
    }
    rema.sort((a, b) => b[1] - a[1]);
    for (let i = 0; given < G.districtSeats; i++, given++) dist[rema[i % rema.length][0]]++;
    const seats = {};
    for (const id of all) seats[id] = (pr[id] || 0) + (dist[id] || 0);
    const cls = w.upper.nextClass;
    w.upper[cls] = seats;
    w.upper.nextClass = cls === 'A' ? 'B' : 'A';
    w.upper.nextYear += 3;
    if (!strategy) return { ran: false, seats, cls };

    const R = NB().requirement;
    const myShare = share[ID] / total;
    const mine = seats[ID] || 0;
    const wasRequirement = p.requirement;
    p.upperMps = (p.upperMps || 0) + mine;
    p.upperShare = myShare;   // 参院選の得票率(次の衆院選のときも政党要件に数える)
    p.requirement = p.requirement || myShare >= R.share || p.mps + p.upperMps >= R.mps;
    if (mine > 0) p.press += U.winPress;   // 議席を取ると「新党が国会へ」と報じられる
    p.upper = {
      year: w.year, strategy, issueHit, share: myShare, prSeats: pr[ID] || 0, districtSeats: dist[ID] || 0, seats: mine, list,
      shares: Object.fromEntries(all.map((id) => [id, share[id] / total])), allSeats: seats,
      requirement: p.requirement, wasRequirement,
    };
    register(p);
    return Object.assign({ ran: true }, p.upper);
  }

  // ---------------- 刺客 ----------------
  function assassin(state, party) {
    const c = state.career;
    const used = new Set([state.player.name].concat(c.rivals.map((r) => r.name)));
    const title = Game.Data.ASSASSIN_TITLES[Math.floor(Game.Career._rand(c) * Game.Data.ASSASSIN_TITLES.length)];
    return { party, name: Game.Career._newName(c, used), role: 'assassin', title, wins: 0, home: null };
  }

  // ---------------- 離党して新党 ----------------
  function canDefect(state) {
    const c = state.career;
    return c.status === 'member' && !(state.party && state.party.custom) && c.wins >= NB().defect.minWins;
  }
  function defectFollowers(state) {
    return Math.floor(state.career.allies * NB().defect.followRate);
  }
  function defect(state, opts) {
    const c = state.career;
    const oldParty = state.player.party;
    const followers = defectFollowers(state);
    create(state, Object.assign({}, opts, { origin: 'defect', mps: 1 + followers, year: state.world.year }));
    state.player.party = ID;
    c.allies = Math.max(0, c.allies - followers);
    c.partyEval = 0;
    c.postLevel = 0;
    c.leftParty = oldParty;
    // 支援団体の関係度は半減
    if (state.support) {
      for (const id in state.support.relations) state.support.relations[id] *= NB().defect.relationMult;
      state.support.endorsedLast = [];
    }
    // 元の党は刺客を立てる
    c.rivals = c.rivals.filter((r) => r.party !== oldParty).concat([assassin(state, oldParty)]);
    return { followers, requirement: state.party.requirement };
  }

  // ---------------- 移籍 ----------------
  function canMigrate(state) {
    const c = state.career;
    return c.status === 'member' && !(state.party && state.party.custom) && c.wins >= NB().migrate.minWins;
  }
  function migrate(state, target) {
    const c = state.career;
    const oldParty = state.player.party;
    state.player.party = target;
    c.partyEval = 0;
    c.postLevel = 0;
    c.migratedPenalty = true;
    c.leftParty = oldParty;
    if (state.support) state.support.endorsedLast = [];
    // 移籍先の党の候補はこの選挙区から降り、元の党は刺客を立てる
    c.rivals = c.rivals.filter((r) => r.party !== target && r.party !== oldParty).concat([assassin(state, oldParty)]);
  }

  return {
    ID,
    register,
    create,
    supportOf,
    supportNow,
    turnUpdate,
    act,
    candidateScandalChance,
    applyCandidateScandal,
    nationalTally,
    nextUpperYear,
    upperDue,
    upperEvent,
    runUpper,
    canDefect,
    defectFollowers,
    defect,
    canMigrate,
    migrate,
  };
})();
