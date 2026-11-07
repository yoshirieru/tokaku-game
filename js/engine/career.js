// 議員任期、解散、出世、再選への引き継ぎ。(党首選は M5)
// state.career を読み書きする。DOMには触らない。
//
// state.career = {
//   rng, elections: [...], wins, partyEval, achievements, allies, money,
//   status: 'member' | 'ronin', postLevel: 0〜4,
//   home: { recog: {地区}, personal: {地区}, solid: {地区} },   // 地元の地盤
//   rivals: [{ party, name, role, wins, home }],               // 次の選挙の対立候補(home は地盤の持ち越し)
//   turn: { elapsed, actionsLeft, mods },                       // 今の任期の進み
//   pending: 選択イベント | null, report: ターンの始まりの知らせ, log: [],
//   promiseStats: { kept, broken },
// }
// state.world = { year, turnIndex(0〜3), approval, partyShift: { 政党: 増減 } }
window.Game = window.Game || {};

Game.Career = (function () {
  const T = () => Game.Balance.term;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const ORGS = () => Game.Data.ORGANIZATIONS;

  // ---------------- 乱数(セーブに乗る種つき) ----------------
  function rand(career) {
    let t = (career.rng = (career.rng + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function gauss(career) {
    const u = Math.max(rand(career), 1e-9);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand(career));
  }
  function pick(career, arr) {
    return arr[Math.floor(rand(career) * arr.length)];
  }

  const ACTIONS = {
    question: { name: '委員会質問', icon: '🎙', target: 'policy', session: true, desc: '委員会で政府に質問する。実績と党内評価が上がる。約束した政策なら約束が進む。' },
    bill:     { name: '議員立法',   icon: '📜', target: 'policy', session: true, desc: '法案を出す。成立すれば大きな実績。与党のほうが通りやすい。約束した政策なら大きく進む。' },
    local:    { name: '地元回り',   icon: '🏘', target: 'region', desc: '地元の行事や会合に顔を出す。次の選挙の地盤(知名度・支持・後援会)を固める。' },
    faction:  { name: '派閥・政策グループ活動', icon: '🤝', target: 'faction', desc: '派閥の会合に出る(入っていなければ入会する)。党内評価が上がり、仲間の議員が増え、派閥の信頼が上がる。' },
    orgs:     { name: '支援団体との関係づくり', icon: '🏛', target: 'org', desc: '支援団体を訪ねる。関係度が上がる。' },
    fund:     { name: '資金集め',   icon: '💴', target: 'none', desc: '政治資金パーティーなどで資金を集める。次の選挙の資金になる。' },
    media:    { name: 'メディア出演', icon: '📺', target: 'none', desc: 'テレビや討論番組に出る。知名度が上がるが、失言のリスクもある。失言はSNSで拡散される。' },
    debate:   { name: '予算委員会で論戦', icon: '⚔', target: 'policy', session: true, desc: '予算委員会で政府を追及するカードバトル。勝てば党内評価・知名度・実績が大きく上がる。失言はSNSで炎上する。1つの国会で1回。' },
    research: { name: '調査・資料集め', icon: '🔎', target: 'none', desc: '政府の資料や現場を調べる。論戦の手札に強いカード(★)が加わる。' },
    sns:      { name: 'SNS発信', icon: '📱', target: 'post', desc: '投稿の種類を選ぶ。話題度は知名度に、好感度は次の選挙の票につながる。炎上することもある。' },
    // 新党の党首だけの行動(newparty.js)
    recruit:  { name: '候補者の公募', icon: '📝', target: 'none', party: true, desc: '次の総選挙に立てる候補者を公募する。候補者が多いほど党の露出は増えるが、失言・不祥事のリスクも増える。' },
    partySns: { name: '党のSNS発信', icon: '📱', target: 'post', party: true, desc: '投稿の種類を選んで党の政策を発信する。「新しさ」があるうちはよく伸び、バズれば新しさが少し戻る。' },
    press:    { name: '記者会見', icon: '🎤', target: 'none', party: true, desc: '党首として記者会見を開く。党の支持率と全国での知名度が上がる。' },
  };
  // 立場ごとにできる行動
  const ALLOWED = {
    member:  ['question', 'bill', 'debate', 'research', 'local', 'faction', 'orgs', 'fund', 'media', 'sns'],
    ronin:   ['local', 'sns'],
    founder: ['local', 'orgs', 'fund', 'recruit', 'partySns', 'press'],
  };
  const PARTY_LEADER_EXTRA = ['recruit', 'partySns', 'press'];

  function isRuling(state) {
    return state.player.party === Game.Data.RULING_PARTY;
  }
  function isCustom(state) {
    return !!(state.party && state.party.custom && state.player.party === Game.NewParty.ID);
  }
  function pmName(state) {
    return state.world.pmName || Game.Data.PRIME_MINISTER.name;
  }
  function postName(state, level) {
    if (isCustom(state)) return '党首';
    const list = isRuling(state) ? Game.Data.POSTS.ruling : Game.Data.POSTS.opposition;
    return list[level ?? state.career.postLevel];
  }
  function sessionName(state) {
    return Game.Data.SESSIONS[state.world.turnIndex];
  }
  function sessionOpen(state) {
    return Game.Data.SESSION_OPEN[state.world.turnIndex];
  }
  function addLog(state, text, kind) {
    const c = state.career;
    c.log.push({ when: `${state.world.year}年 ${sessionName(state)}`, text, kind: kind || 'info' });
    if (c.log.length > 120) c.log.shift();
  }
  // 仲間の議員:党の議員数の一定割合が上限で、上限に近いほど増えにくい
  function alliesCap(state) {
    const mps = Game.Data.PARTY_MPS[state.player.party] || 30;
    return Math.max(5, mps * Game.Balance.leadership.alliesCapShare);
  }
  function addAllies(state, n) {
    const c = state.career;
    c.allies += n * Math.max(0, 1 - c.allies / alliesCap(state));
  }
  function districtIds() {
    return Game.Data.DISTRICTS.map((d) => d.id);
  }

  // ---------------- はじめての当落のあと ----------------
  function ensure(state) {
    if (!state.world) {
      state.world = { year: T().startYear, turnIndex: 2, approval: T().approvalStart, partyShift: {} };
    }
    if (!state.career || state.career.status === undefined) {
      const prev = state.career || {};
      state.career = {
        rng: ((state.campaign && state.campaign.rng) ^ 0x5bd1e995) >>> 0 || 7,
        elections: prev.elections || [],
        wins: prev.wins || 0,
        partyEval: prev.partyEval || 0,
        achievements: 0,
        allies: 0,
        money: 0,
        status: 'member',
        postLevel: 0,
        home: { recog: {}, personal: {}, solid: {} },
        rivals: [],
        turn: { elapsed: 0, actionsLeft: T().actionsPerTurn, mods: {} },
        pending: null,
        report: null,
        log: [],
        promiseStats: { kept: 0, broken: 0 },
        nationalRecog: 5,
      };
    }
    if (state.career.nationalRecog === undefined) state.career.nationalRecog = 5;
    return state.career;
  }

  // 新党ルート(スタート時):議席のない党首として、結党準備から始める
  // opts.firstTarget:'lower'(衆議院の解散を待つ)| 'upper'(参院選の前の年から始め、まず参院選の比例に挑む)
  function startFounder(state, seed, opts) {
    const NB = Game.Balance.newParty;
    const upperRoute = opts && opts.firstTarget === 'upper';
    const UR = NB.upperRoute;
    state.world = upperRoute
      ? { year: UR.startYear, turnIndex: UR.turnIndex, approval: T().approvalStart, partyShift: {} }
      : { year: T().startYear, turnIndex: 2, approval: T().approvalStart, partyShift: {} };
    state.career = null;
    const c = ensure(state);
    c.rng = seed >>> 0 || 7;
    c.status = 'founder';
    c.money = NB.startMoney;
    for (const d of Game.Data.DISTRICTS) {
      c.home.recog[d.id] = Game.Balance.start.playerRecog;
      c.home.personal[d.id] = 0;
      c.home.solid[d.id] = 0;
    }
    const [lo, hi] = NB.startElapsed;
    c.turn.elapsed = upperRoute ? UR.elapsed : lo + Math.floor(rand(c) * (hi - lo + 1));   // 今の衆議院はもう何年か経っている
    c.waitUpper = upperRoute;   // 参院選が終わるまで解散しない
    c.rivals = Object.keys(Game.Data.RIVAL_ROLES.newparty).map((party) => ({
      party, name: Game.Data.RIVALS[party].name, role: Game.Data.RIVAL_ROLES.newparty[party], wins: 0, home: null,
    }));
    const rel = Game.Support.initialRelations(Game.NewParty.ID, state.party.pledges);   // 支援団体とは白紙から(公約の一致の分だけ)
    state.support = { relations: rel, pledges: state.party.pledges.slice(), endorsedBy: [], endorsedLast: [], promises: [], banned: [] };
    const req = NB.requirement;
    c.report = {
      title: state.party.name + ' 結党',
      lines: [
        `${state.world.year}年、${state.player.name}は新党「${state.party.name}」を立ち上げた。議席はゼロ、資金もわずか。`,
        upperRoute
          ? `まずは${Game.NewParty.nextUpperYear(state)}年夏の参院選。比例代表なら組織のない新党でも議席を狙える。候補者を${NB.upper.prMinCandidates}人以上集め、党を知ってもらおう。`
          : '次の総選挙(解散はいつ来るか分からない)に向けて、候補者を集め、党を知ってもらおう。',
        `政党要件(国会議員${req.mps}人以上、または得票率${req.share * 100}%以上)を満たすまでは、比例との重複立候補ができない。`,
      ],
      event: null,
    };
    addLog(state, `新党「${state.party.name}」を結成。`, 'news');
    return c;
  }

  // 選挙の結果を記録し、地盤・ライバル・役職を更新して新しい任期(または浪人)を始める
  function afterElection(state) {
    const c = ensure(state);
    const camp = state.campaign;
    const el = state.election;
    const P = el.player;
    const pid = camp.player.id;

    c.elections.push({ year: state.world.year, party: state.player.party, district: Game.Data.DISTRICT_NAME, result: P.result, votes: P.votes, share: P.share, ratio: P.ratio });
    const won = P.result !== 'lost';
    if (won) c.wins++;
    c.partyEval += Game.Balance.career.partyEval[P.result];

    // 地盤:選挙が終わった時点の値を引き継ぐ(後援会は党の組織票を除いた分)
    const baseSolid = Game.Campaign._internal.baseSolid;
    for (const reg of camp.regionList) {
      const st = camp.regions[reg.id];
      c.home.recog[reg.id] = st.recog[pid];
      c.home.personal[reg.id] = Math.min(T().homeCap.personal, st.personal[pid]);
      c.home.solid[reg.id] = clamp(st.solid[pid] - baseSolid(state.player.party, reg), 0, T().homeCap.solid);
    }
    c.money = Math.max(0, camp.player.money);
    if (camp.sns) state.sns = Game.Sns.create(camp.sns);   // 選挙戦のSNSの評判を任期へ持ち越す

    // ライバルの入れ替わり
    const RT = Game.Balance.rivalTurnover;
    const used = new Set([state.player.name]);
    const next = [];
    for (const cand of camp.candidates) {
      if (cand.isPlayer || (Game.Data.PARTIES[cand.party] && Game.Data.PARTIES[cand.party].real)) continue;
      const prev = (c.rivals.find((r) => r.party === cand.party) || { wins: cand.role && cand.role.startsWith('incumbent') ? 1 : 0 });
      // 同じ人がまた出るなら、選挙が終わった時点の地盤を持ち越す
      const home = { recog: {}, personal: {} };
      for (const reg of camp.regionList) {
        home.recog[reg.id] = camp.regions[reg.id].recog[cand.id];
        home.personal[reg.id] = Math.min(T().homeCap.personal, camp.regions[reg.id].personal[cand.id]);
      }
      let r = { party: cand.party, name: cand.name, role: cand.role, wins: prev.wins || 0, home };
      if (el.winner === cand.id) {
        r.wins++;
        r.role = r.wins >= RT.maxWinsForStrong ? 'incumbentStrong' : 'incumbent';
      } else if (!el.pr.revived[cand.id] && rand(c) < RT.retireChance) {
        r = { party: cand.party, name: newName(c, used), role: 'newcomer', wins: 0, home: null };
      } else if (r.role.startsWith('incumbent') || el.pr.revived[cand.id]) {
        r.role = el.pr.revived[cand.id] ? 'incumbent' : 'former';
      }
      used.add(r.name);
      next.push(r);
    }
    c.rivals = next;

    // 支援団体:関係度・公約・約束を引き継ぐ。推薦停止は1回の選挙で解ける
    state.support = Game.Support.exportState(camp);
    state.support.banned = [];
    state.support.endorsedLast = state.support.endorsedBy.slice();

    c.status = won ? 'member' : 'ronin';
    if (!won) c.postLevel = 0;   // 落選すると政府・党の役職は外れる
    c.migratedPenalty = false;
    // 新党:全国の結果(M6 で本格的な全国選挙に置き換える)
    if (isCustom(state) && !state.party.firstElectionDone) Game.NewParty.nationalTally(state);
    c.turn = { elapsed: 0, actionsLeft: T().actionsPerTurn, mods: {} };
    c.pending = null;
    advanceWorld(state);   // 選挙のあと、次のターンから任期が始まる
    c.report = {
      title: won ? `${state.world.year}年 ${sessionName(state)}` : '浪人生活のはじまり',
      lines: won
        ? [`当選${c.wins}回の衆議院議員として国会へ。`, `役職:${postName(state)}`]
        : ['議席を失った。次の解散まで、地元回りで地盤を固めるしかない。'],
      event: null,
    };
    addLog(state, won ? `当選(${c.wins}回目)。` : '落選。浪人生活が始まった。', 'news');
  }

  function newName(c, used) {
    const N = Game.Data.NAME_POOL;
    for (let i = 0; i < 50; i++) {
      const n = pick(c, N.family) + ' ' + pick(c, N.given);
      if (!used.has(n)) return n;
    }
    return '新人候補';
  }

  // ---------------- 行動 ----------------
  function availableActions(state) {
    const c = state.career;
    const B = T().actions;
    let allowed = (ALLOWED[c.status] || ALLOWED.member).concat(isCustom(state) && c.status !== 'founder' ? PARTY_LEADER_EXTRA : []);
    if (allowed.includes('partySns')) allowed = allowed.filter((id) => id !== 'sns');   // 新党の党首は党のSNSで発信する
    // 浪人中は議員の行動を(選べない状態で)見せる。新党の行動は党首のときだけ見せる
    const shown = Object.keys(ACTIONS).filter((id) => allowed.includes(id) || (c.status === 'ronin' && !ACTIONS[id].party && id !== 'sns'));
    return shown.map((id) => {
      const a = Object.assign({ id }, ACTIONS[id]);
      a.money = ((ACTIONS[id].party ? Game.Balance.newParty.actions[id] : B[id]) || {}).money || 0;
      let enabled = c.turn.actionsLeft > 0 && !c.pending;
      let reason = '';
      if (!allowed.includes(id)) { enabled = false; reason = '浪人中は地元回りとSNSだけ'; }
      else if (a.session && !sessionOpen(state)) { enabled = false; reason = '国会が閉会中'; }
      else if (a.money > c.money) { enabled = false; reason = '資金が足りない'; }
      else if (id === 'debate' && c.turn.debated) { enabled = false; reason = 'この国会ではもう論戦した'; }
      a.enabled = enabled;
      a.reason = reason;
      if (id === 'fund') a.gain = fundGain(c);
      if (id === 'bill') a.passChance = billChance(state);
      return a;
    });
  }

  function fundGain(c) {
    if (c.status === 'founder') return Game.Balance.newParty.actions.fund.moneyGain;
    const F = T().actions.fund;
    return F.moneyGain + F.postBonus * c.postLevel;
  }
  function billChance(state) {
    const B = T().actions.bill;
    return Math.min(B.passMax, B.passBase + (isRuling(state) ? B.passRuling : 0) + state.career.achievements * B.passPerAchievement);
  }

  // 政策の対象:公約と約束の政策(約束が先)
  function policyTargets(state) {
    const sup = state.support || { pledges: [], promises: [] };
    const open = sup.promises.filter((p) => p.status === 'open').map((p) => p.policy);
    return [...new Set(open.concat(sup.pledges))];
  }

  function advancePromise(state, policy, amount) {
    const sup = state.support;
    if (!sup) return [];
    const done = [];
    for (const p of sup.promises) {
      if (p.status !== 'open' || p.policy !== policy) continue;
      p.progress = (p.progress || 0) + amount;
      if (p.progress >= T().promiseGoal) {
        p.status = 'kept';
        sup.relations[p.org] = clamp(sup.relations[p.org] + T().promiseKept, 0, 100);
        state.career.promiseStats.kept++;
        done.push(ORGS()[p.org].name);
      }
    }
    return done;
  }

  function addHome(state, rid, g) {
    const h = state.career.home;
    h.recog[rid] = clamp((h.recog[rid] || 0) + g.recog * (1 - (h.recog[rid] || 0) / 100), 0, 100);
    h.personal[rid] = clamp((h.personal[rid] || 0) + g.personal, 0, T().homeCap.personal);
    h.solid[rid] = clamp((h.solid[rid] || 0) + g.solid, 0, T().homeCap.solid);
  }
  function addRecogAll(state, v) {
    for (const rid of districtIds()) addHome(state, rid, { recog: v, personal: 0, solid: 0 });
  }

  // target: 政策id / 地区id / 団体id
  function doAction(state, id, target) {
    const c = state.career;
    const act = availableActions(state).find((a) => a.id === id);
    if (!act || !act.enabled) return { ok: false, text: act ? act.reason : 'その行動はできない' };
    const B = T().actions[id] || {};
    c.money -= act.money;
    if (ACTIONS[id].target === 'post' && !(Game.Data.SNS_POST_TYPES[target])) { c.money += act.money; return { ok: false, text: '投稿の種類を選んでください' }; }
    if (ACTIONS[id].party) {
      const ptext = Game.NewParty.act(state, id, target);
      c.turn.actionsLeft--;
      addLog(state, `${ACTIONS[id].icon} ${ptext}`, 'action');
      return { ok: true, text: ptext };
    }
    let text = '';
    let debate = false;
    const pol = target && Game.Data.POLICIES[target] ? Game.Data.POLICIES[target].name : '';

    if (id === 'question') {
      if (!pol) return { ok: false, text: '政策を選んでください' };
      c.achievements += B.achievement;
      c.partyEval += B.partyEval;
      c.nationalRecog = Math.min(100, c.nationalRecog + T().nationalRecog.question);
      addRecogAll(state, B.recogAll);
      const kept = advancePromise(state, target, B.promise);
      text = `委員会で「${pol}」について質問した。`;
      if (kept.length) text += `${kept.join('・')}との約束を果たした!`;
      const cl = Game.Sns.clip(Game.Sns.ensure(state), () => rand(c), 'question');
      if (cl) text += ' ' + cl.line;
    } else if (id === 'bill') {
      if (!pol) return { ok: false, text: '政策を選んでください' };
      const passed = rand(c) < billChance(state);
      if (passed) {
        Game.Legacy.add(state, 'careerBills');
        Game.Economy.enact(state, target, 'member');   // 議員立法も小さく指標に効く(M14)
        c.nationalRecog = Math.min(100, c.nationalRecog + T().nationalRecog.bill);
        c.achievements += B.achievement;
        c.partyEval += B.partyEval;
        addRecogAll(state, B.recogAll);
      }
      const kept = advancePromise(state, target, passed ? B.promisePass : B.promiseFail);
      text = passed ? `「${pol}」の議員立法が成立した!大きな実績になった。` : `「${pol}」の法案を出したが、審議入りできずに終わった。`;
      if (kept.length) text += `${kept.join('・')}との約束を果たした!`;
    } else if (id === 'local') {
      const reg = Game.Data.DISTRICTS.find((d) => d.id === target);
      if (!reg) return { ok: false, text: '地区を選んでください' };
      let m = c.status === 'ronin' ? T().roninMult : 1;
      if (c.turn.mods.disaster === target) m *= T().events.disaster.localMult;
      for (const rid of districtIds()) {
        const f = rid === target ? 1 : B.spill;
        addHome(state, rid, { recog: B.recog * m * f, personal: B.personal * m * f, solid: B.solid * m * f });
      }
      text = c.turn.mods.disaster === target ? `被災した${reg.name}を回り、片付けを手伝った。地元の信頼が深まった。` : `${reg.name}の行事や会合を回った。`;
    } else if (id === 'faction') {
      c.partyEval += B.partyEval;
      addAllies(state, B.allies);
      // 派閥のある党なら、選んだ派閥に入会する・会合に顔を出す(faction.js)
      text = Game.Faction.attend(state, target) || '派閥・政策グループの会合に出た。仲間の議員との結びつきが強まった。';
    } else if (id === 'orgs') {
      const org = ORGS()[target];
      if (!org || !state.support) return { ok: false, text: '団体を選んでください' };
      const v = Game.Balance.orgs.visit;
      state.support.relations[target] = clamp(state.support.relations[target] + v, 0, 100);
      text = `${org.name}を訪ね、意見を交わした。(関係度+${v})`;
    } else if (id === 'fund') {
      const g = fundGain(c);
      c.money += g;
      text = `政治資金パーティーを開いた。${g}万円が集まった。`;
    } else if (id === 'media') {
      c.nationalRecog = Math.min(100, c.nationalRecog + T().nationalRecog.media);
      addRecogAll(state, B.recogAll);
      c.partyEval += B.partyEval;
      if (rand(c) < B.gaffeChance) {
        for (const rid of districtIds()) addHome(state, rid, { recog: B.gaffeRecog, personal: B.gaffePersonal, solid: 0 });
        c.partyEval += B.gaffeEval;
        Game.Sns.startFlame(Game.Sns.ensure(state), 'gaffe', () => rand(c));   // 失言 → SNSで炎上(次のターンに対応)
        text = '討論番組で失言してしまった。翌日の新聞で大きく取り上げられ、SNSでも拡散され始めた。';
      } else {
        text = '討論番組に出演した。顔と名前が売れた。';
        const cl = Game.Sns.clip(Game.Sns.ensure(state), () => rand(c), 'media');
        if (cl) text += ' ' + cl.line;
      }
    } else if (id === 'debate') {
      // 国会論戦バトル(debate.js)。画面が論戦に切り替わる
      if (!pol) { c.money += act.money; return { ok: false, text: '政策を選んでください' }; }
      c.turn.debated = true;
      Game.Debate.start(state, {
        kind: 'committee', side: 'ask', role: 'term', topic: target, back: 'term',
        opponentName: `${pol}担当大臣`, opponentType: 'minister', seed: Math.floor(rand(c) * 4294967296),
      });
      debate = true;
      text = `予算委員会で「${pol}」について質問に立った。`;
    } else if (id === 'research') {
      c.achievements += B.achievement;
      text = `政府の資料や現場を調べ上げた。${Game.Debate.research(state, 'ask', () => rand(c))}`;
    } else if (id === 'sns') {
      const sup = state.support || {};
      const r = Game.Sns.post(Game.Sns.ensure(state), target, () => rand(c), { pledges: sup.pledges || [] });
      c.nationalRecog = Math.min(100, c.nationalRecog + r.buzz * Game.Balance.sns.term.nationalRecog);
      addRecogAll(state, Game.Balance.sns.term.recogAll * r.recogMult);
      text = r.text;
    }
    c.turn.actionsLeft--;
    addLog(state, `${ACTIONS[id].icon} ${text}`, 'action');
    return { ok: true, text, debate };
  }

  // ---------------- ターンの終わり ----------------
  function advanceWorld(state) {
    const w = state.world;
    w.turnIndex++;
    if (w.turnIndex >= T().turnsPerYear) {
      w.turnIndex = 0;
      w.year++;
    }
  }

  function dissolveChance(state) {
    const c = state.career;
    const w = state.world;
    // 新党ルートで「参院選から挑む」ときは、参院選が終わるまで解散しない(首相は参院選を前に解散を見送る)
    if (c.status === 'founder' && c.waitUpper) return 0;
    let p = T().dissolveBase + Math.max(0, w.approval - 40) * T().dissolvePerApproval;
    const lateFrom = T().turnsPerYear * 2;
    if (c.turn.elapsed >= lateFrom) p += (c.turn.elapsed - lateFrom + 1) * T().dissolveLateTerm;
    return Math.min(T().dissolveMax, p);
  }

  // 戻り値: { dissolved: bool }。新しいターンの知らせは career.report に入る
  function endTurn(state) {
    const c = state.career;
    const w = state.world;
    if (c.pending) return { dissolved: false };
    const lines = [];

    // 地盤は少しずつ薄れる
    const D = T().homeDecay;
    for (const rid of districtIds()) {
      c.home.recog[rid] = (c.home.recog[rid] || 0) * D.recog;
      c.home.personal[rid] = (c.home.personal[rid] || 0) * D.personal;
      c.home.solid[rid] = (c.home.solid[rid] || 0) * D.solid;
    }
    // 支援団体との関係は、付き合いを続けないと党の基準の水準へ戻っていく
    if (state.support) {
      const base = Game.Balance.orgs.partyBase[state.player.party] || {};
      for (const id in state.support.relations) {
        const floor = (base[id] || 0) * Game.Balance.orgs.playerFactor;
        const v = state.support.relations[id];
        if (v > floor) state.support.relations[id] = Math.max(floor, v - T().relationDecay);
      }
    }
    // 役職の効果
    const PR = T().promotion;
    if (c.status === 'member' && !isCustom(state)) {
      c.partyEval += PR.postEval[c.postLevel];
      if (PR.postRecog[c.postLevel]) addRecogAll(state, PR.postRecog[c.postLevel]);
      addAllies(state, c.postLevel * Game.Balance.leadership.alliesPerPostTurn);
      c.nationalRecog = Math.min(100, c.nationalRecog + c.postLevel * T().nationalRecog.perPostTurn);
    }
    const npLines = [];
    Game.NewParty.turnUpdate(state, npLines);
    npLines.push(...snsTurn(state, () => rand(c)));
    // 内閣支持率と党の支持率
    // 経済の指標(M14):AI の政府(与党)が法案を通し、指標が動く。指標の「気分」で内閣支持率の戻る水準が上下する
    npLines.push(...Game.Economy.turn(state, () => rand(c), Game.Data.RULING_PARTY));
    const approvalMean = T().approvalStart + Game.Economy.approvalShift(state);
    w.approval = clamp(w.approval + gauss(c) * T().approvalDrift + (approvalMean - w.approval) * T().approvalMeanRevert, T().approvalMin, T().approvalMax);
    for (const p in w.partyShift) w.partyShift[p] *= T().partyShiftDecay;
    // 内閣支持率が低すぎると首相が退陣し、与党の党首選になる
    if (w.approval < Game.Balance.leadership.resignApproval && !w.pendingResign) w.pendingResign = true;
    // ライバルの地盤もプレイヤーと同じように薄れ、ライバル自身の地元回りで積み上がる
    const RA = Game.Balance.rivalTurnover.activity;
    for (const r of c.rivals) {
      if (!r.home) continue;
      const act = r.role.startsWith('incumbent') ? RA.incumbent : RA.challenger;
      for (const rid of districtIds()) {
        r.home.recog[rid] = Math.min(RA.recogCap, r.home.recog[rid] * D.recog + act.recog);
        r.home.personal[rid] = Math.min(T().homeCap.personal, r.home.personal[rid] * D.personal + act.personal);
      }
    }

    // 解散の判定
    c.turn.elapsed++;
    const full = c.turn.elapsed >= T().termTurns;
    if (full || rand(c) < dissolveChance(state)) {
      advanceWorld(state);
      // 選挙の「風」:政党ごとに支持率が大きく振れる(選挙のたびに違う)
      w.wind = {};
      for (const p of Object.keys(Game.Data.PARTIES)) if (Game.Data.PARTIES[p].playable || Game.Data.PARTIES[p].custom) w.wind[p] = gauss(c) * T().electionWind;
      // 経済の指標の「気分」は与党への追い風・逆風になる(M14)
      const econWind = Game.Economy.windForRuling(state);
      w.wind[Game.Data.RULING_PARTY] = (w.wind[Game.Data.RULING_PARTY] || 0) + econWind;
      w.econWind = econWind;
      const pm = pmName(state);
      c.report = {
        title: full ? '任期満了' : '衆議院解散',
        lines: full
          ? ['4年の任期が満了した。総選挙が行われる。']
          : [`${pm}首相が衆議院を解散した(内閣支持率 ${Math.round(w.approval)}%)。`, '「解散は首相の専権事項」。突然の総選挙が始まる。'],
        event: null,
        dissolution: true,
      };
      if (Math.abs(econWind) >= Game.Balance.econ.mood.windNotice) {
        c.report.lines.push(econWind > 0 ? `景気と暮らしの手応えから、与党の${Game.Data.PARTIES[Game.Data.RULING_PARTY].name}に追い風が吹いている。` : `景気や暮らしへの不満が、与党の${Game.Data.PARTIES[Game.Data.RULING_PARTY].name}への逆風になっている。`);
      }
      settlePromises(state, c.report.lines);
      addLog(state, full ? '任期満了。総選挙へ。' : '衆議院が解散された。総選挙へ。', 'news');
      return { dissolved: true };
    }

    advanceWorld(state);
    c.turn.actionsLeft = T().actionsPerTurn;
    c.turn.mods = {};
    c.turn.debated = false;

    lines.push(...npLines);
    // 党首選(あれば、その年の人事より先)
    let ev = null;
    const lr = Game.Leadership.scheduled(state);
    if (lr) ev = leaderElectionEvent(state, lr);
    // 人事
    if (w.turnIndex === PR.turnIndex && c.status === 'member' && !isCustom(state)) lines.push(...personnel(state));
    // 結党準備中の参院選(新党ルート。比例に挑むか選ぶ)
    if (!ev && Game.NewParty.upperDue(state)) {
      ev = Game.NewParty.upperEvent(state);
      c.pending = ev;
    }
    // 補欠選挙・地方選挙(local.js)
    if (!ev) {
      const lev = Game.Local.roll(state);
      if (lev) { ev = lev; c.pending = ev; }
    }
    // 派閥の頼みごと(faction.js)
    Game.Faction.turn(state);
    if (!ev) {
      const fev = Game.Faction.requestEvent(state, () => rand(c));
      if (fev) { ev = fev; c.pending = ev; }
    }
    // 出来事
    if (!ev) ev = rollEvent(state);
    c.report = { title: `${w.year}年 ${sessionName(state)}`, lines, event: ev };
    return { dissolved: false };
  }

  // SNS:話題度・好感度が薄れ、あとで効く結果(ファクトチェック)が出る。団体との近さが話題になることも。トレンドが変わる
  function snsTurn(state, rng) {
    const s = Game.Sns.ensure(state);
    const lines = Game.Sns.tick(s, 'turn');
    if (state.support && rng() < Game.Balance.sns.orgTopic.chanceTurn) {
      const org = Game.Sns.closeOrg(state.support.relations, state.support.endorsedLast, rng);
      if (org) lines.push(Game.Sns.orgTopic(s, rng, org));
    }
    Game.Sns.newTrend(s, rng);
    return lines;
  }

  function personnel(state) {
    const c = state.career;
    const PR = T().promotion;
    const step = PR.steps[c.postLevel];
    if (!step) return [];
    const ruling = isRuling(state);
    const label = ruling ? '内閣改造・党役員人事' : '党の役員人事';
    if (c.wins < step.wins || c.partyEval < step.eval) {
      return [`${label}が行われた。今回は声がかからなかった(次の段階:当選${step.wins}回・党内評価${step.eval})。`];
    }
    // 派閥(faction.js):主流派なら昇進しやすく、非主流派だと「冷や飯」。ポストを譲る約束をしていれば昇進しにくい
    const chance = Math.max(0.02, (PR.chanceByParty[state.player.party] ?? 0.7) + Game.Faction.promotionDelta(state));
    if (rand(c) >= chance) {
      const note = Game.Faction.afterPersonnel(state, false);
      return [`${label}が行われた。候補に名前は挙がったが、ほかの議員に決まった。`].concat(note ? [note] : []);
    }
    c.postLevel++;
    Game.Legacy.stats(state).maxPostLevel = Math.max(Game.Legacy.stats(state).maxPostLevel || 0, c.postLevel);
    addAllies(state, Game.Balance.leadership.alliesPerPromotion);
    const out = [`${label}で、${postName(state)}に就いた!`];
    const fnote = Game.Faction.afterPersonnel(state, true);
    if (fnote) out.push(fnote);
    if (c.postLevel >= PR.steps.length) out.push('党の中枢に入った。次の党首選に名乗りを上げる準備はできている。');
    addLog(state, `${postName(state)}に就任。`, 'news');
    return out;
  }

  function leaderElectionEvent(state, reason) {
    const c = state.career;
    const party = Game.Data.PARTIES[state.player.party];
    const el = Game.Leadership.eligible(state);
    const why = reason === 'resign' ? `内閣支持率の低迷を受けて${pmName(state)}首相が退陣を表明した。` : '党首の任期満了に伴い、';
    const pmNote = state.player.party === Game.Data.RULING_PARTY ? '勝てば首相になる。' : '';
    const ev = {
      id: 'leaderElection', reason,
      title: `${party.name}の党首選`,
      text: `${why}${party.name}の党首選が告示される。${pmNote}立候補には推薦人${Game.Leadership.endorsersNeeded(state)}人が必要だ。`,
      choices: [
        { id: 'run', label: '立候補する', note: el.ok ? `推薦人がそろった(仲間の議員 ${Math.floor(c.allies)}人)` : el.reason, disabled: !el.ok },
        { id: 'skip', label: '今回は見送る', note: 'ほかの候補を支持する' },
      ],
    };
    c.pending = ev;
    addLog(state, `📰 ${ev.title}`, 'news');
    return ev;
  }

  // 解散のときに、果たせなかった約束を「破った」にする
  // 浪人中は国会で動けないので、約束はそのまま持ち越す(破ったことにはしない)
  function settlePromises(state, lines) {
    const sup = state.support;
    if (!sup) return;
    if (state.career.status !== 'member') {
      if (sup.promises.some((p) => p.status === 'open')) lines.push('浪人中だったため、団体との約束は持ち越しになった。');
      return;
    }
    sup.banned = sup.banned || [];
    for (const p of sup.promises) {
      if (p.status !== 'open') continue;
      p.status = 'broken';
      sup.relations[p.org] = clamp(sup.relations[p.org] + T().promiseBroken, 0, 100);
      if (!sup.banned.includes(p.org)) sup.banned.push(p.org);
      state.career.promiseStats.broken++;
      lines.push(`${ORGS()[p.org].name}との約束「${Game.Data.POLICIES[p.policy].name}」を果たせなかった。今回の選挙では推薦を見送られる。`);
    }
  }

  // ---------------- 任期中の出来事 ----------------
  function rollEvent(state) {
    const c = state.career;
    const E = T().events;
    // SNSの炎上(前のターンの失言・切り抜き・投稿)に対応する
    const s = Game.Sns.ensure(state);
    if (s.queue.length) {
      const fev = Game.Sns.surface(s, { money: c.money, unit: 'ターン' });
      c.pending = fev;
      addLog(state, `🔥 ${fev.title}`, 'news');
      return fev;
    }
    // 新党:公募した候補者の失言・不祥事
    if (isCustom(state) && rand(c) < Game.NewParty.candidateScandalChance(state)) {
      Game.NewParty.applyCandidateScandal(state);
      const sev = { id: 'candidateScandal', title: '公認候補の失言', text: `${state.party.name}が公認した候補者の過去のSNS投稿が問題視された。党の支持率が下がった。` };
      addLog(state, `📰 ${sev.title}`, 'news');
      return sev;
    }
    if (rand(c) >= T().eventChance) return null;
    const keys = Object.keys(E).filter((k) => !(k === 'orgRequest' && !state.support) && !(c.status === 'founder' && (k === 'scandal' || k === 'studyGroup')));
    const total = keys.reduce((s, k) => s + E[k].weight, 0);
    let r = rand(c) * total;
    let kind = keys[keys.length - 1];
    for (const k of keys) { r -= E[k].weight; if (r <= 0) { kind = k; break; } }
    const w = state.world;
    const isReal = (p) => !!(Game.Data.PARTIES[p] && Game.Data.PARTIES[p].real);
    let ev = null;

    if (kind === 'orgRequest') {
      const sup = state.support;
      const ids = Object.keys(ORGS()).filter((id) => sup.relations[id] >= Game.Balance.orgs.request.minRelation && ORGS()[id].party !== state.player.party);
      if (!ids.length) return null;
      const id = pick(c, ids);
      const org = ORGS()[id];
      const policy = pick(c, org.policies);
      const pol = Game.Data.POLICIES[policy].name;
      const conflict = sup.pledges.some((p) => Game.Support.conflicts(p, policy));
      const endorsed = (sup.endorsedLast || []).includes(id);
      ev = {
        id: 'orgRequest', org: id, policy, title: `${org.name}からの要望`,
        text: `${org.name}が「${pol}」に関わる法案への協力を求めている。${endorsed ? '前回の選挙で推薦を受けた団体だ。' : ''}`,
        choices: [
          { id: 'accept', label: '協力を約束する', note: conflict ? 'あなたの公約と矛盾するため約束できない' : `関係度が上がる。任期中に質問や議員立法で果たす約束になる(行動1回)`, disabled: conflict || c.turn.actionsLeft < 1 },
          { id: 'decline', label: '協力できないと伝える', note: endorsed ? '関係度が下がり、次の選挙では推薦を見送られる' : '関係度が下がる' },
        ],
      };
    } else if (kind === 'scandal') {
      ev = {
        id: 'scandal', title: '事務所の会計に指摘', text: '週刊誌が、あなたの事務所の政治資金収支報告書の記載漏れを報じた。',
        choices: [
          { id: 'apologize', label: 'すぐに謝罪して訂正する', note: '党内評価と地元の支持が少し下がる' },
          { id: 'deny', label: '「問題ない」と突っぱねる', note: 'うまくいけば無傷。続報が出ると大きく下がる' },
        ],
      };
    } else if (kind === 'disaster') {
      const reg = pick(c, Game.Data.DISTRICTS);
      c.turn.mods.disaster = reg.id;
      ev = { id: 'disaster', title: `${reg.name}で大雨の被害`, text: `${reg.name}で大雨による被害が出た。今ターンはこの地区での地元回りの効果が大きい。` };
    } else if (kind === 'partyScandal') {
      const parties = Object.keys(Game.Data.PARTIES).filter((p) => Game.Data.PARTIES[p].playable && !isReal(p));
      const p = pick(c, parties);
      w.partyShift[p] = (w.partyShift[p] || 0) + E.partyScandal.support;
      if (p === Game.Data.RULING_PARTY) w.approval = clamp(w.approval + E.partyScandal.approval, T().approvalMin, T().approvalMax);
      ev = { id: 'partyScandal', title: '党の不祥事', text: `${Game.Data.PARTIES[p].name}の議員の政治資金問題が報じられた。${Game.Data.PARTIES[p].name}の支持率が下がった。` };
    } else if (kind === 'cabinetUp' || kind === 'cabinetDown') {
      w.approval = clamp(w.approval + E[kind].approval, T().approvalMin, T().approvalMax);
      ev = kind === 'cabinetUp'
        ? { id: kind, title: '内閣支持率が上昇', text: '首脳会談の成果が評価され、内閣支持率が上がった。解散の噂がささやかれ始めた。' }
        : { id: kind, title: '内閣支持率が下落', text: '物価高への対応が批判され、内閣支持率が下がった。' };
    } else if (kind === 'snsHoax') {
      Game.Sns.hoax(Game.Sns.ensure(state), () => rand(c));
      ev = Game.Sns.surface(state.sns, { money: c.money, unit: 'ターン' });
    } else if (kind === 'studyGroup') {
      c.achievements += E.studyGroup.achievement;
      c.partyEval += E.studyGroup.partyEval;
      ev = { id: 'studyGroup', title: '政策の勉強会', text: `超党派の政策勉強会で発表した。実績と党内評価が少し上がった。${Game.Debate.studyGroup(state, () => rand(c))}` };
    }
    if (ev && ev.choices) c.pending = ev;
    if (ev) addLog(state, `📰 ${ev.title}`, 'news');
    return ev;
  }

  function resolveEvent(state, choice) {
    const c = state.career;
    const ev = c.pending;
    if (!ev) return null;
    const ch = ev.choices.find((x) => x.id === choice);
    if (!ch || ch.disabled) return null;
    let text = '';
    if (ev.id === 'snsFlame') {
      const r = Game.Sns.resolveFlame(Game.Sns.ensure(state), ev, choice, () => rand(c));
      c.money = Math.max(0, c.money - r.money);
      text = r.text;
    } else if (ev.id === 'faction') {
      text = Game.Faction.resolveRequest(state, ev, choice);
    } else if (ev.id === 'local') {
      text = Game.Local.choose(state, ev, choice).text;   // 「応援に入る」「出馬する」なら短期決戦の画面へ
    } else if (ev.id === 'npUpper') {
      const r = Game.NewParty.runUpper(state, choice === 'skip' ? null : choice);
      c.waitUpper = false;
      const R = Game.Balance.newParty.requirement;
      if (!r.ran) {
        text = '今回の参院選は見送った。次の衆院選に力を集める。';
      } else {
        const issue = r.strategy === 'issue' ? (r.issueHit ? '絞った争点が当たり、' : '絞った争点は響かず、') : '';
        text = `${issue}比例の得票率 ${(r.share * 100).toFixed(1)}%で${r.seats ? `${r.seats}議席を獲得した(比例${r.prSeats}・選挙区${r.districtSeats})` : '議席には届かなかった'}。`;
        if (r.requirement && !r.wasRequirement) text += `政党要件を満たした(${r.share >= R.share ? `得票率${R.share * 100}%以上` : `国会議員${R.mps}人以上`})。次のターンから政党交付金が入り、次の衆院選では比例との重複立候補ができる。`;
        else if (!r.requirement) text += '政党要件には届かなかった。次の衆院選で巻き返したい。';
        c.report.upperResult = r;
      }
      addLog(state, `🗳 参院選:${r.ran ? `${state.party.name}は${r.seats}議席(得票率${(r.share * 100).toFixed(1)}%)` : '見送り'}`, 'news');
    } else if (ev.id === 'leaderElection') {
      if (choice === 'run') {
        Game.Leadership.start(state, ev.reason);
        text = '党首選への立候補を表明した。推薦人がそろい、届け出を済ませた。';
      } else {
        const wn = Game.Leadership.aiRace(state);
        text = `党首選には出なかった。${wn}が新しい党首に選ばれた。`;
      }
    } else if (ev.id === 'orgRequest') {
      const sup = state.support;
      const R = T().orgRequest;
      const org = ORGS()[ev.org];
      if (choice === 'accept') {
        c.turn.actionsLeft--;
        sup.relations[ev.org] = clamp(sup.relations[ev.org] + R.attendRelation, 0, 100);
        const existing = sup.promises.find((p) => p.org === ev.org && p.policy === ev.policy && p.status === 'open');
        if (!existing) sup.promises.push({ org: ev.org, policy: ev.policy, day: null, year: state.world.year, status: 'open', progress: 0 });
        if (!sup.pledges.includes(ev.policy)) sup.pledges.push(ev.policy);
        text = `${org.name}に協力を約束した。質問や議員立法で果たす必要がある。`;
      } else {
        sup.relations[ev.org] = clamp(sup.relations[ev.org] + R.declineRelation, 0, 100);
        if ((sup.endorsedLast || []).includes(ev.org)) {
          sup.banned = sup.banned || [];
          if (!sup.banned.includes(ev.org)) sup.banned.push(ev.org);
          text = `${org.name}の要望を断った。次の選挙では推薦を見送ると通告された。`;
        } else {
          text = `${org.name}の要望を断った。関係が冷えた。`;
        }
      }
    } else if (ev.id === 'scandal') {
      const S = T().events.scandal;
      const hit = (personal, recog) => { for (const rid of districtIds()) addHome(state, rid, { recog: recog || 0, personal, solid: 0 }); };
      if (choice === 'apologize') {
        c.partyEval += S.apologizeEval;
        Game.Legacy.add(state, 'scandals');
        hit(S.apologizePersonal, S.recog / 2);
        text = 'すぐに謝罪し、報告書を訂正した。騒ぎは数日で収まった。';
      } else if (rand(c) < S.denyRisk) {
        hit(S.denyPersonal, S.recog);
        Game.Legacy.add(state, 'scandals');
        c.partyEval += S.apologizeEval * 2;
        text = '突っぱねたが、続報が出て大きな批判を浴びた。地元の支持が大きく離れた。';
      } else {
        text = '突っぱねたところ、続報は出ず、話題は立ち消えになった。';
      }
    }
    c.pending = null;
    if (c.report && c.report.event === ev) c.report.result = text;
    addLog(state, `📨 ${text}`, 'news');
    return text;
  }

  // ---------------- 次の選挙へ ----------------
  // newDistrictCampaign に渡す引き継ぎ
  function campaignExtra(state) {
    const c = state.career;
    const sup = state.support || {};
    const pers = {};
    const bonus = Math.min(T().achievementToPersonalCap, c.achievements * T().achievementToPersonal);
    // 地盤は選挙戦の始まりの時点では一部しか表に出ない(有権者は選挙のたびに改めて判断する)
    const K = T().carryToCampaign;
    const recog = {};
    const solid = {};
    for (const rid of districtIds()) {
      pers[rid] = (c.home.personal[rid] || 0) * K.personal + bonus;
      recog[rid] = Math.max(Game.Balance.start.playerRecog, (c.home.recog[rid] || 0) * K.recog);
      solid[rid] = (c.home.solid[rid] || 0) * K.solid;
    }
    const start = Game.Balance.start.byParty[state.player.party] || { money: 0, leaderVisits: 0 };
    // 移籍した直後の選挙は「渡り鳥」批判で支持が少し減る
    if (c.migratedPenalty) for (const rid of districtIds()) pers[rid] = Math.max(0, pers[rid] - Game.Balance.newParty.migrate.personalPenalty);
    return {
      pledges: (sup.pledges || []).slice(),
      carried: {
        relations: sup.relations,
        promises: (sup.promises || []).filter((p) => p.status === 'open'),
        banned: (sup.banned || []).slice(),
      },
      player: {
        role: c.status === 'member' ? (c.wins >= 3 ? 'incumbentStrong' : 'incumbent') : c.status === 'founder' ? 'newcomer' : 'former',
        recog,
        personal: pers,
        solidBonus: solid,
        money: start.money + c.money,
        leaderVisitsBonus: T().promotion.postLeaderVisits[c.postLevel],
      },
      // ライバルの地盤も一部だけ初期値にする(AIは選挙戦がプレイヤーほどうまくないので割合は高め)
      rivals: c.rivals.map((r) => Object.assign({}, r, {
        home: r.home && {
          recog: Object.fromEntries(Object.entries(r.home.recog).map(([k, v]) => [k, v * T().rivalCarryToCampaign.recog])),
          personal: Object.fromEntries(Object.entries(r.home.personal).map(([k, v]) => [k, v * T().rivalCarryToCampaign.personal])),
        },
      })),
      partyShift: rulingShift(state),
      // 新党:新しさ(SNSに強い)と、政党要件がないことの不利
      partyFlags: isCustom(state) ? { newness: state.party.newness, noRequirement: !state.party.requirement } : null,
      sns: Game.Sns.ensure(state),
      easy: state.difficulty === 'easy',
    };
  }

  // 与党の支持率は内閣支持率につられて動く
  function rulingShift(state) {
    const w = state.world;
    const shift = Object.assign({}, w.partyShift);
    const r = Game.Data.RULING_PARTY;
    shift[r] = (shift[r] || 0) + (w.approval - T().approvalStart) * T().partyDriftFromApproval;
    for (const p in w.wind || {}) shift[p] = (shift[p] || 0) + w.wind[p];
    return shift;
  }

  return {
    ACTIONS,
    ensure,
    startFounder,
    alliesCap,
    isCustom,
    pmName,
    _rand: rand,
    addLogPublic: addLog,
    _newName: newName,
    afterElection,
    availableActions,
    policyTargets,
    doAction,
    endTurn,
    resolveEvent,
    campaignExtra,
    dissolveChance,
    billChance,
    isRuling,
    postName,
    sessionName,
    sessionOpen,
  };
})();
