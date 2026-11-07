// 党首モード(後半の土台)。党首として会期ごとにターンを進める。
// M5.5:党内の結束と分裂、合流・合併(merger.js)。M6 で全国の総選挙、M7 で政権運営を足す。
// DOMには触らない。
//
// state.leader = {
//   party, since, isPM, via, role: '代表' | '共同代表' | '幹事長',
//   mode: 'leader', cohesion: 0〜100, lowTurns, friction, supportBonus,
//   actionsLeft, postsCooldown, merges: [{ partner, partnerName, seats, year, drop }],
//   cooldowns: { 政党: 交渉できないターン数 }, pending, report, log,
// }
// state.world.parties = { 政党: { seats } }   … 衆議院の勢力図(合流・分裂で動く)
// state.partyOverrides = { 政党: { name, short } } … 合流で党名を変えた既存の党
window.Game = window.Game || {};

Game.Leader = (function () {
  const LB = () => Game.Balance.partyLeader;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand = (state) => Game.Career._rand(state.career);
  const ORGS = () => Game.Data.ORGANIZATIONS;

  const ACTIONS = {
    harmony: { name: '党内の融和', icon: '🍵', target: 'none', desc: '議員懇談会を開き、不満を聞いて回る。党内の結束が上がる。' },
    posts:   { name: '人事で処遇', icon: '🎖', target: 'none', desc: '党の役職を配り直して、不満のある議員を処遇する。結束が大きく上がる(4ターンに1回)。' },
    tour:    { name: '党勢拡大の全国行脚', icon: '🚄', target: 'none', desc: '全国を回って党の政策を訴える。党の支持率が上がる。' },
    press:   { name: '記者会見', icon: '🎤', target: 'none', desc: '党首として記者会見を開く。支持率と全国での知名度が少し上がる。発言が切り抜かれることも。' },
    debate:  { name: '党首討論', icon: '⚔', target: 'policy', desc: '国会で党首どうしが論戦するカードバトル。首相なら答弁、野党なら追及する。結果は内閣支持率と党の支持率に響く。失言はSNSで炎上する。国会の会期中に1回。' },
    research: { name: '政策調査', icon: '🔎', target: 'none', desc: '党の政策調査会で資料を集める。論戦の手札に強いカード(★)が加わる(首相なら答弁、野党なら追及のカード)。' },
    sns:     { name: '党首のSNS発信', icon: '📱', target: 'post', desc: '投稿の種類を選ぶ。話題度は知名度に、好感度は党の支持率(首相なら内閣支持率)につながる。炎上することもある。' },
    orgs:    { name: '支援団体との関係づくり', icon: '🏛', target: 'org', desc: '支援団体を訪ねる。関係度が上がる。' },
    policy:  { name: '政策協議', icon: '📘', target: 'policy', desc: '党の政策として具体化を進める。団体との約束が前に進む。' },
    fund:    { name: '資金集め', icon: '💴', target: 'none', desc: '党の資金を集める。' },
    merge:   { name: '合流・合併の交渉', icon: '🤝', target: 'merge', desc: 'ほかの党に合流を持ちかける。議席は増えるが、党内の結束は下がる。' },
    successor: { name: '後継を指名して退く', icon: '🎌', target: 'none', desc: '党首を退いてゲームを終える(エンディング)。首相のうちに支持が高ければ「名宰相」、レガシー評価にボーナス。' },
  };

  const SESSIONS = () => Game.Data.SESSIONS;
  function when(state) {
    return `${state.world.year}年 ${SESSIONS()[state.world.turnIndex]}`;
  }
  function addLog(state, text, kind) {
    const ld = state.leader;
    ld.log.push({ when: when(state), text, kind: kind || 'info' });
    if (ld.log.length > 120) ld.log.shift();
  }

  // ---------------- 党の情報 ----------------
  function partyInfo(id) {
    return Game.Data.PARTIES[id] || Game.Data.MINOR_PARTIES[id] || Game.Data.PARTIES_EXTRA[id] || { id, name: id, short: id, color: '#999' };
  }
  function seatsOf(state, id) {
    return (state.world.parties[id] || { seats: 0 }).seats;
  }
  function baseSupport(id) {
    if (Game.Balance.parties[id]) return Game.Balance.parties[id].support;
    return Game.Balance.proportional.minorSupport[id] || 0;
  }
  // 党の支持率(%)
  function supportOf(state, id) {
    const w = state.world;
    let v = baseSupport(id) + ((w.partyShift && w.partyShift[id]) || 0);
    const ld = state.leader;
    if (ld && id === ld.party) {
      v += ld.supportBonus || 0;
      if (state.sns) v += state.sns.favor * Game.Balance.sns.leader.favorToSupport;   // SNSの好感度
      v -= Math.max(0, 60 - ld.cohesion) * LB().cohesionToSupport;   // 内紛は支持を下げる
    }
    const extra = w.parties[id] && w.parties[id].supportBonus;
    if (extra) v += extra;
    return Math.max(0.1, v);
  }

  // セーブを読み込んだとき:合流で変えた党名を戻す
  function applyOverrides(state) {
    for (const id in state.partyOverrides || {}) {
      if (Game.Data.PARTIES[id]) Object.assign(Game.Data.PARTIES[id], state.partyOverrides[id]);
    }
    // 分裂でできた党
    for (const id in (state.world && state.world.parties) || {}) {
      const p = state.world.parties[id];
      if (p.splinter && !Game.Data.PARTIES_EXTRA[id]) {
        Game.Data.PARTIES_EXTRA[id] = { id, name: p.name, short: p.short, color: p.color };
      }
    }
  }

  // ---------------- 党首モードを始める ----------------
  function init(state) {
    if (state.leader && state.leader.mode === 'leader') return state.leader;
    const w = state.world;
    const custom = Game.Career.isCustom(state);
    const party = state.player.party;
    w.parties = {};
    for (const id in Game.Data.PARTY_SEATS) w.parties[id] = { seats: Game.Data.PARTY_SEATS[id] };
    if (custom) {
      const mps = state.party.mps;
      w.parties[party] = { seats: mps };
      w.parties.indep.seats = Math.max(0, w.parties.indep.seats - mps);
    }
    w.partyShift = w.partyShift || {};
    // 衆議院の任期の経過は議員任期から引き継ぐ
    if (w.termElapsed === undefined) w.termElapsed = state.career && state.career.turn ? state.career.turn.elapsed : 0;
    const prev = state.leader || {};
    const via = custom ? 'newparty' : prev.via || 'election';
    state.leader = {
      party, since: prev.since || w.year, isPM: !!prev.isPM, via, role: '代表',
      mode: 'leader',
      cohesion: LB().cohesionStart[via === 'newparty' ? 'newparty' : 'election'],
      lowTurns: 0, friction: 0, supportBonus: 0,
      actionsLeft: LB().actionsPerTurn, postsCooldown: 0,
      merges: [], cooldowns: {}, pending: null, report: null, log: [],
    };
    const ld = state.leader;
    const p = partyInfo(party);
    const lines = [];
    if (custom) {
      const n = state.party.national;
      lines.push(`${p.name}の党首として、党を率いていく。`);
      const u = state.party.upper;
      if (u) lines.push(`${u.year}年の参院選:比例の得票率 ${(u.share * 100).toFixed(1)}%で${u.seats}議席。参議院議員は${state.party.upperMps || 0}人。`);
      if (n) lines.push(`前回の総選挙:全国で${n.fielded}人を擁立し、${n.mps}議席。比例の得票率 ${(n.share * 100).toFixed(1)}%。${n.requirement ? '政党要件を満たした。' : '政党要件には届かなかった。'}`);
    } else {
      lines.push(ld.isPM ? `${p.name}の党首選に勝ち、内閣総理大臣に就任した。` : `${p.name}の党首に就任した。政権交代をめざす。`);
    }
    lines.push(`衆議院は${Game.Data.HOUSE_SEATS}議席、過半数は${Game.Data.MAJORITY}。${p.name}は${seatsOf(state, party)}議席。`);
    lines.push('党首として党内をまとめ、ほかの党との合流も探ろう。解散があれば全国11ブロックの総選挙になる。政権運営は M7 で実装する。');
    ld.report = { title: custom ? `${p.name} 党首` : ld.isPM ? '内閣総理大臣' : `${p.name} 党首`, lines, event: null };
    addLog(state, '党首モードを開始。', 'news');
    Game.Legacy.stats(state).wasLeader = true;
    ld.termStart = ld.since;   // 党首の任期(1期3年、連続2期まで)
    ld.terms = 1;
    if (Game.Gov) {
      const g = Game.Gov.ensure(state);   // いまの政権と参議院
      if (g.role === 'pm') lines.splice(lines.length - 1, 1, '首相として政権を運営する。重要法案、予算、外交、そして解散権。参院選で負ければ「ねじれ」になる。');
      else lines.splice(lines.length - 1, 1, `政権は${partyInfo(g.pmParty).name}(${g.pmName}首相)。野党として追及し、政権交代をめざす。`);
    }
    return ld;
  }

  // ---------------- 行動 ----------------
  function availableActions(state) {
    const ld = state.leader;
    const c = state.career;
    const A = LB().actions;
    return Object.keys(ACTIONS).map((id) => {
      const a = Object.assign({ id }, ACTIONS[id]);
      a.money = A[id].money || 0;
      let enabled = ld.actionsLeft > 0 && !ld.pending;
      let reason = '';
      if (a.money > c.money) { enabled = false; reason = '資金が足りない'; }
      if (id === 'posts' && ld.postsCooldown > 0) { enabled = false; reason = `あと${ld.postsCooldown}ターン`; }
      if (id === 'policy' && !openPromises(state).length && !(state.support && state.support.pledges.length)) { enabled = false; reason = '進める政策がない'; }
      if (id === 'merge' && ld.role === '幹事長') { enabled = false; reason = '代表でないと交渉できない'; }
      if (id === 'debate') {
        if (!Game.Data.SESSION_OPEN[state.world.turnIndex]) { enabled = false; reason = '国会が閉会中'; }
        else if (ld.debated) { enabled = false; reason = 'この国会ではもう討論した'; }
        else if (state.gov && state.gov.role === 'partner') { enabled = false; reason = '連立与党の党首は討論に立たない'; }
      }
      a.enabled = enabled;
      a.reason = reason;
      if (id === 'fund') a.gain = A.fund.moneyGain;
      return a;
    }).concat(Game.Gov ? Game.Gov.actions(state) : []);   // 首相・与党・野党としての行動(government.js)
  }

  function openPromises(state) {
    return state.support ? state.support.promises.filter((p) => p.status === 'open') : [];
  }
  function policyTargets(state) {
    const open = openPromises(state).map((p) => p.policy);
    return [...new Set(open.concat(state.support ? state.support.pledges : []))];
  }
  function advancePromise(state, policy, amount) {
    const sup = state.support;
    const done = [];
    for (const p of sup.promises) {
      if (p.status !== 'open' || p.policy !== policy) continue;
      p.progress = (p.progress || 0) + amount;
      if (p.progress >= Game.Balance.term.promiseGoal) {
        p.status = 'kept';
        sup.relations[p.org] = clamp(sup.relations[p.org] + Game.Balance.term.promiseKept, 0, 100);
        state.career.promiseStats.kept++;
        done.push(ORGS()[p.org].name);
      }
    }
    return done;
  }

  function doAction(state, id, target) {
    const ld = state.leader;
    const c = state.career;
    if (Game.Gov && Game.Gov.ACTIONS[id]) return Game.Gov.doAction(state, id, target);
    const act = availableActions(state).find((a) => a.id === id);
    if (!act || !act.enabled) return { ok: false, text: act ? act.reason : 'その行動はできない' };
    const A = LB().actions[id];
    let text = '';
    if (id === 'harmony') {
      ld.cohesion = clamp(ld.cohesion + A.cohesion, 0, 100);
      text = '議員懇談会を開き、若手やベテランの不満に耳を傾けた。';
    } else if (id === 'posts') {
      ld.cohesion = clamp(ld.cohesion + A.cohesion, 0, 100);
      ld.postsCooldown = A.cooldown;
      text = '党の役職を配り直し、不満のある議員を処遇した。';
      const fr = Game.Faction.postsReward(state);   // 派閥(faction.js)
      if (fr) text += fr;
    } else if (id === 'tour') {
      ld.supportBonus += A.support;
      text = '全国を回り、党の政策を訴えた。';
    } else if (id === 'press') {
      ld.supportBonus += A.support;
      c.nationalRecog = Math.min(100, (c.nationalRecog || 0) + A.nationalRecog);
      text = '記者会見を開き、党の方針を説明した。';
      const cl = Game.Sns.clip(Game.Sns.ensure(state), () => rand(state), 'press');
      if (cl) text += ' ' + cl.line;
    } else if (id === 'debate') {
      // 国会論戦バトル(debate.js)。首相なら答弁、野党なら追及
      if (!Game.Data.POLICIES[target]) return { ok: false, text: '政策を選んでください' };
      const g = state.gov || {};
      const pm = g.role === 'pm';
      let oppName = `${g.pmName || Game.Career.pmName(state)}首相`;
      if (pm) {
        const w = state.world;
        const opp = Object.keys(w.parties).filter((id2) => id2 !== 'indep' && !(g.coalition || [ld.party]).includes(id2)).sort((a, b) => w.parties[b].seats - w.parties[a].seats)[0];
        oppName = `${partyInfo(opp).name}の党首`;
      }
      ld.debated = true;
      Game.Debate.start(state, {
        kind: 'leaders', side: pm ? 'answer' : 'ask', role: pm ? 'pm' : 'opposition', topic: target, back: 'leaderHub',
        opponentName: oppName, opponentType: pm ? 'opposition' : 'pm', seed: Math.floor(rand(state) * 4294967296),
      });
      text = `党首討論で「${Game.Data.POLICIES[target].name}」を取り上げた。`;
    } else if (id === 'research') {
      const side = state.gov && state.gov.role === 'pm' ? 'answer' : 'ask';
      text = `党の政策調査会で資料を集めた。${Game.Debate.research(state, side, () => rand(state))}`;
    } else if (id === 'sns') {
      if (!Game.Data.SNS_POST_TYPES[target]) return { ok: false, text: '投稿の種類を選んでください' };
      const custom = Game.Career.isCustom(state);
      const r = Game.Sns.post(Game.Sns.ensure(state), target, () => rand(state), {
        pledges: state.support ? state.support.pledges : [], newness: custom ? state.party.newness : 0,
      });
      c.nationalRecog = Math.min(100, (c.nationalRecog || 0) + r.buzz * Game.Balance.sns.leader.nationalRecog);
      text = r.text;
      if (custom && r.viral) state.party.newness = Math.min(100, state.party.newness + Game.Balance.newParty.actions.partySns.newnessOnViral);
    } else if (id === 'orgs') {
      const org = ORGS()[target];
      if (!org || !state.support) return { ok: false, text: '団体を選んでください' };
      const v = Game.Balance.orgs.visit;
      state.support.relations[target] = clamp(state.support.relations[target] + v, 0, 100);
      text = `${org.name}を訪ね、意見を交わした。(関係度+${v})`;
    } else if (id === 'policy') {
      if (!Game.Data.POLICIES[target]) return { ok: false, text: '政策を選んでください' };
      const kept = advancePromise(state, target, A.promise);
      text = `党の政策調査会で「${Game.Data.POLICIES[target].name}」の具体化を進めた。`;
      if (kept.length) text += `${kept.join('・')}との約束を果たした!`;
    } else if (id === 'fund') {
      c.money += A.moneyGain;
      text = `党の資金パーティーを開いた。${A.moneyGain}万円が集まった。`;
    } else if (id === 'successor') {
      state.pendingEnding = 'successor';
      addLog(state, '🎌 後継を指名して退くことを表明した。', 'news');
      return { ok: true, text: '後継を指名して退くことを表明した。', ending: 'successor' };
    } else if (id === 'merge') {
      return { ok: false, text: '合流の交渉は交渉画面から行う' };
    }
    c.money -= act.money;
    ld.actionsLeft--;
    addLog(state, `${ACTIONS[id].icon} ${text}`, 'action');
    return { ok: true, text, debate: id === 'debate' };
  }

  // 合流の交渉で行動を1回使う(merger.js から呼ぶ)
  function spendAction(state) {
    state.leader.actionsLeft = Math.max(0, state.leader.actionsLeft - 1);
  }

  // ---------------- ターンの終わり ----------------
  function advanceWorld(state) {
    const w = state.world;
    w.turnIndex++;
    if (w.turnIndex >= Game.Balance.term.turnsPerYear) {
      w.turnIndex = 0;
      w.year++;
    }
  }

  function endTurn(state) {
    const ld = state.leader;
    if (ld.pending) return;
    const L = LB();
    const lines = [];
    // 結束:しこりの分だけ下がり、少しずつ戻る
    const before = ld.cohesion;
    ld.cohesion = clamp(ld.cohesion - ld.friction + L.cohesionRecovery, 0, 100);
    ld.friction *= L.frictionDecay;
    if (ld.friction < 0.2) ld.friction = 0;
    if (ld.cohesion < before - 0.5) lines.push(`合流のしこりが残り、党内の結束が下がった(${Math.round(before)} → ${Math.round(ld.cohesion)})。`);
    ld.supportBonus *= L.supportShiftDecay;
    if (ld.postsCooldown > 0) ld.postsCooldown--;
    for (const p in ld.cooldowns) if (ld.cooldowns[p] > 0) ld.cooldowns[p]--;
    // 新党は「新しさ」が減り、要件があれば交付金
    Game.NewParty.turnUpdate(state, lines);
    // SNS:話題度・好感度が薄れる。トレンドが変わる
    const sns = Game.Sns.ensure(state);
    lines.push(...Game.Sns.tick(sns, 'turn'));
    Game.Sns.newTrend(sns, () => rand(state));

    // 解散・任期満了 → 総選挙(national.js)
    const w = state.world;
    w.termElapsed = (w.termElapsed || 0) + 1;
    const GA = Game.Balance.gov.approval;
    // 内閣支持率は平均へ戻ろうとするが、長期政権の「飽き」の分だけその平均が下がる
    // 経済の指標(M14):プレイヤーが首相でなければ AI の政府が法案を通す。指標の「気分」で支持率の戻る水準が上下する
    lines.push(...Game.Economy.turn(state, () => rand(state), state.gov && state.gov.role !== 'pm' ? state.gov.pmParty : null));
    const mean = GA.mean + Game.Economy.approvalShift(state) - ((state.gov && state.gov.role === 'pm' && state.gov.fatigue) || 0);
    // 首相の SNS の好感度は内閣支持率にも少し効く
    const snsPush = state.gov && state.gov.role === 'pm' ? sns.favor * Game.Balance.sns.leader.favorToApproval : 0;
    w.approval = clamp((w.approval || GA.mean) + (rand(state) - 0.5) * 2 * GA.drift + (mean - (w.approval || GA.mean)) * GA.meanRevert + snsPush, GA.min, GA.max);
    const full = w.termElapsed >= Game.Balance.term.termTurns;
    // プレイヤーが首相なら、解散は自分で決める(解散権)。任期満了だけは避けられない
    const pmIsPlayer = state.gov && state.gov.role === 'pm';
    if (full || (!pmIsPlayer && rand(state) < dissolveChance(state))) {
      advanceWorld(state);
      ld.actionsLeft = L.actionsPerTurn;
      ld.debated = false;
      ld.report = {
        title: full ? '任期満了' : '衆議院解散',
        lines: full
          ? ['衆議院議員の任期が満了した。総選挙が行われる。']
          : [`${Game.Career.pmName(state)}首相が衆議院を解散した。総選挙が始まる。`, '全国11ブロック、465議席をめぐる戦いだ。'],
        event: null,
        dissolution: true,
      };
      if (ld.isPM) ld.report.lines[0] = full ? '衆議院議員の任期が満了した。首相として総選挙に臨む。' : '党の情勢を見て、衆議院を解散した。首相として総選挙に臨む。';
      addLog(state, full ? '任期満了。総選挙へ。' : '衆議院解散。総選挙へ。', 'news');
      return;
    }

    advanceWorld(state);
    ld.actionsLeft = L.actionsPerTurn;
    ld.debated = false;

    // 分裂の判定
    let ev = null;
    if (ld.cohesion < L.split.threshold) ld.lowTurns++;
    else ld.lowTurns = 0;
    if (ld.lowTurns >= L.split.turns && rand(state) < L.split.chance) {
      ev = split(state);
    } else if (ld.lowTurns >= 1) {
      lines.push(`党内の結束が危険な水準(${Math.round(ld.cohesion)})。このままだと分裂しかねない。`);
    }
    // 党首の任期(1期3年・連続2期まで)
    if (!ev && Game.Gov && Game.Gov.termDue(state)) {
      ev = Game.Gov.leaderTermEvent(state);
      ld.pending = ev;
    }
    // 政権運営(予算・参院選・退陣要求・連立相手など)
    if (!ev && Game.Gov) {
      ev = Game.Gov.turn(state, lines);
      if (ev && ev.choices) ld.pending = ev;
    }
    // SNSの炎上(前のターンの切り抜き・投稿)に対応する
    if (!ev && sns.queue.length) {
      ev = Game.Sns.surface(sns, { money: state.career.money, unit: 'ターン' });
      ld.pending = ev;
      addLog(state, `🔥 ${ev.title}`, 'news');
    }
    // 補欠選挙・地方選挙(local.js)。党首の求心力が問われる
    if (!ev) {
      const lev = Game.Local.roll(state);
      if (lev) { ev = lev; ld.pending = ev; }
    }
    if (!ev) ev = rollEvent(state);
    ld.report = { title: when(state), lines, event: ev };
  }

  // 解散の確率(内閣支持率が高いほど、任期の後半ほど高い。career.js と同じ考え方)
  function dissolveChance(state) {
    const T = Game.Balance.term;
    const w = state.world;
    let p = T.dissolveBase + Math.max(0, (w.approval || 45) - 40) * T.dissolvePerApproval;
    const lateFrom = T.turnsPerYear * 2;
    if ((w.termElapsed || 0) >= lateFrom) p += ((w.termElapsed || 0) - lateFrom + 1) * T.dissolveLateTerm;
    return Math.min(T.dissolveMax, p);
  }

  // ---------------- 分裂 ----------------
  function split(state) {
    const ld = state.leader;
    const S = LB().split;
    const w = state.world;
    const party = ld.party;
    const mine = w.parties[party];
    let text;
    const last = ld.merges.filter((m) => !m.left).pop();
    if (mine.seats <= 1) {
      // 割れるほどの議員がいない:騒ぎだけで収まる
      ld.cohesion = S.cohesionAfter;
      ld.lowTurns = 0;
      return { id: 'defectorRumor', title: '党内の混乱', text: '党内の対立が表に出て、党の支持が落ちた。' };
    } else if (last) {
      // 合流してきたグループが出ていき、元の党をつくり直す
      const keep = S.groupKeepMin + rand(state) * (1 - S.groupKeepMin);
      const leaving = Math.min(mine.seats - 1, Math.max(1, Math.round(last.seats * keep)));
      mine.seats -= leaving;
      w.parties[last.partner] = { seats: (w.parties[last.partner] ? w.parties[last.partner].seats : 0) + leaving };
      last.left = true;
      // 引き継いだ支持母体との関係も冷える
      for (const org of last.backers || []) {
        if (state.support && state.support.relations[org] !== undefined) state.support.relations[org] = clamp(state.support.relations[org] + S.orgRelation, 0, 100);
        if (state.support) for (const p of state.support.promises) if (p.org === org && p.status === 'open') p.status = 'void';
      }
      text = `合流してきた旧${last.partnerName}のグループ${leaving}人が離党し、${partyInfo(last.partner).name}をつくり直した。合流は事実上の失敗に終わった。`;
    } else {
      // 反主流派が離党して新党をつくる
      const [lo, hi] = S.dissidentShare;
      const leaving = Math.max(1, Math.round(mine.seats * (lo + rand(state) * (hi - lo))));
      mine.seats -= leaving;
      const names = Game.Data.SPLINTER_NAMES;
      const id = 'splinter' + Object.keys(w.parties).filter((k) => k.startsWith('splinter')).length;
      const name = names[Math.floor(rand(state) * names.length)];
      w.parties[id] = { seats: leaving, splinter: true, name, short: name.slice(0, 2), color: '#7f8c8d', supportBonus: 1 };
      Game.Data.PARTIES_EXTRA[id] = { id, name, short: name.slice(0, 2), color: '#7f8c8d' };
      const wf = Game.Faction.weakest(state);   // いちばん信頼の低い派閥が中心になって出ていく(faction.js)
      text = `${wf ? wf.name + 'を中心に、' : ''}執行部に反発する議員${leaving}人が離党し、新党「${name}」を結成した。`;
    }
    ld.supportBonus += S.support;
    ld.cohesion = S.cohesionAfter;
    ld.friction = 0;
    ld.lowTurns = 0;
    if (state.party && state.party.custom && party === Game.NewParty.ID) state.party.mps = mine.seats;
    addLog(state, `💥 党が分裂:${text}`, 'news');
    return { id: 'split', title: '党が分裂', text: text + ` 結束が下がったまま放置した結果だ。(${Game.Data.MERGER_EXAMPLE})` };
  }

  // ---------------- 出来事 ----------------
  function rollEvent(state) {
    const ld = state.leader;
    const E = LB().events;
    if (rand(state) >= LB().eventChance) return null;
    const keys = Object.keys(E).filter((k) => !(k === 'orgDemand' && !openPromises(state).length));
    const total = keys.reduce((s, k) => s + E[k].weight, 0);
    let r = rand(state) * total;
    let kind = keys[keys.length - 1];
    for (const k of keys) { r -= E[k].weight; if (r <= 0) { kind = k; break; } }
    let ev = null;
    if (kind === 'infighting') {
      ld.cohesion = clamp(ld.cohesion + E.infighting.cohesion, 0, 100);
      ev = {
        id: 'infighting', title: '両院議員総会が紛糾',
        text: '党の方針をめぐって両院議員総会が紛糾した。執行部への不満の声が上がっている。',
        choices: [
          { id: 'lead', label: '執行部一任で押し切る', note: '方針は通り支持率は少し上がるが、結束はさらに下がる' },
          { id: 'compromise', label: '両論を併記して収める', note: '結束は戻るが、党の主張がぼやけて支持率が下がる' },
        ],
      };
    } else if (kind === 'defectorRumor') {
      ld.cohesion = clamp(ld.cohesion + E.defectorRumor.cohesion, 0, 100);
      ev = { id: 'defectorRumor', title: '離党の噂', text: '党内の一部の議員が離党を検討していると報じられた。結束が下がった。' };
    } else if (kind === 'snsHoax') {
      Game.Sns.hoax(Game.Sns.ensure(state), () => rand(state));
      ev = Game.Sns.surface(state.sns, { money: state.career.money, unit: 'ターン' });
    } else if (kind === 'goodNews') {
      ld.supportBonus += E.goodNews.support;
      ev = { id: 'goodNews', title: '党の政策に好評価', text: '党の政策提言が専門家に評価され、支持率が上がった。' };
    } else if (kind === 'orgDemand') {
      const p = openPromises(state)[Math.floor(rand(state) * openPromises(state).length)];
      const org = ORGS()[p.org];
      ev = {
        id: 'orgDemand', org: p.org, policy: p.policy, title: `${org.name}からの要望`,
        text: `${org.name}が、約束した「${Game.Data.POLICIES[p.policy].name}」の実現を急ぐよう求めている。`,
        choices: [
          { id: 'act', label: 'すぐに政策協議を進める', note: '行動を1回使って約束を前に進める', disabled: ld.actionsLeft < 1 },
          { id: 'delay', label: '先送りする', note: '団体との関係度が下がり、党内からも不満が出る' },
        ],
      };
    }
    if (ev && ev.choices) ld.pending = ev;
    if (ev) addLog(state, `📰 ${ev.title}`, 'news');
    return ev;
  }

  function resolveEvent(state, choice) {
    const ld = state.leader;
    const ev = ld.pending;
    if (!ev) return null;
    const ch = ev.choices.find((x) => x.id === choice);
    if (!ch || ch.disabled) return null;
    const I = LB().infighting;
    let text = '';
    if (ev.id.startsWith('gov')) {
      // 政権運営のイベント(government.js)
      const res = Game.Gov.resolve(state, ev, choice);
      text = res.text;
      ld.pending = null;
      if (ld.report && ld.report.event === ev) ld.report.result = text;
      addLog(state, `📨 ${text}`, 'news');
      if (res.ending) {
        state.pendingEnding = res.ending;   // 画面がエンディングへ進む(legacy.js)
      } else if (res.followup) {
        // 続けて選ぶイベント(参院選の敗北 → 退陣要求など)
        ld.pending = res.followup;
        ld.report = { title: ld.report ? ld.report.title : when(state), lines: [text], event: res.followup };
      } else if (res.dissolution) {
        ld.report = Object.assign({}, ld.report, { dissolution: true, lines: [text] });
      }
      return text;
    }
    if (ev.id === 'snsFlame') {
      const r = Game.Sns.resolveFlame(Game.Sns.ensure(state), ev, choice, () => rand(state));
      state.career.money = Math.max(0, state.career.money - r.money);
      text = r.text;
    } else if (ev.id === 'local') {
      text = Game.Local.choose(state, ev, choice).text;   // 「応援に入る」なら短期決戦の画面へ
    } else if (ev.id === 'infighting') {
      if (choice === 'lead') {
        ld.cohesion = clamp(ld.cohesion + I.leadCohesion, 0, 100);
        ld.supportBonus += I.leadSupport;
        text = '執行部一任で押し切った。方針は通ったが、しこりが残った。';
      } else {
        ld.cohesion = clamp(ld.cohesion + I.compromiseCohesion, 0, 100);
        ld.supportBonus += I.compromiseSupport;
        text = '両論を併記して収めた。報道は「玉虫色の決着」と書いた。';
      }
    } else if (ev.id === 'orgDemand') {
      if (choice === 'act') {
        ld.actionsLeft--;
        const kept = advancePromise(state, ev.policy, LB().actions.policy.promise);
        text = `「${Game.Data.POLICIES[ev.policy].name}」の具体化を急いだ。${kept.length ? kept.join('・') + 'との約束を果たした!' : ''}`;
      } else {
        state.support.relations[ev.org] = clamp(state.support.relations[ev.org] - 10, 0, 100);
        ld.cohesion = clamp(ld.cohesion - 2, 0, 100);
        text = `${ORGS()[ev.org].name}の要望を先送りした。関係が冷えた。`;
      }
    }
    ld.pending = null;
    if (ld.report && ld.report.event === ev) ld.report.result = text;
    addLog(state, `📨 ${text}`, 'news');
    return text;
  }

  return {
    ACTIONS, init, applyOverrides, partyInfo, seatsOf, supportOf, dissolveChance,
    availableActions, policyTargets, doAction, spendAction, endTurn, resolveEvent, addLog, when,
  };
})();
