// バランス確認用の自動プレイ(Node で実行)。ゲーム本体からは読み込まない。
//   node tools/autoplay.js [試行回数=100] ["B.ai.skill.incumbent=0.95" のような調整コード(試すだけ。ファイルは変えない)]
//   環境変数 BOTS=中級 でボットを絞れる。EASY=1 でイージーモード。CAREER=1 で議員キャリア、FULL=1 でゲーム全体(首相到達率)
// 3種類のボット(最善手 / 中級 / ランダム)で各党 N 回ずつ選挙戦を戦い、
// 小選挙区当選・比例復活・合計(初当選率)の割合を出す。投票日は vote.js で計算する。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

global.window = global;
const root = path.join(__dirname, '..', 'js');
for (const f of ['data/balance.js', 'data/parties.js', 'data/organizations.js', 'data/districts.js', 'data/factions.js', 'data/achievements.js', 'data/blocks.js', 'data/sns.js', 'data/debate.js', 'engine/support.js', 'engine/sns.js', 'engine/debate.js', 'engine/campaign.js', 'engine/vote.js', 'engine/career.js', 'engine/newparty.js', 'engine/leadership.js', 'engine/leader.js', 'engine/merger.js', 'engine/national.js', 'engine/government.js', 'engine/legacy.js', 'engine/economy.js', 'engine/local.js', 'engine/faction.js', 'engine/hall.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f });
}
const C = Game.Campaign;
if (process.env.SEAT) Game.Data.applySeat(process.env.SEAT);   // SEAT=biyou2 などで選挙区を選ぶ(districts.js の SEATS)
if (require.main === module && process.argv[3]) new Function('B', 'D', process.argv[3])(Game.Balance, Game.Data);

function margin(camp) {
  const t = C.estimateVotes(camp).total;
  let o = 0;
  for (const k in t) if (k !== camp.player.id) o = Math.max(o, t[k]);
  return t[camp.player.id] - o;
}

// 1手ずつ全行動を試し、得票差が最も広がるものを選ぶ(本当の数字が見えている上級者)
function greedyStep(camp) {
  const acts = C.availableActions(camp).filter((a) => a.enabled);
  const P = camp.player;
  if (P.stamina < 30 && acts.find((a) => a.id === 'rest')) return C.doPlayerAction(camp, 'rest');
  if (P.money < 15 && acts.find((a) => a.id === 'fund')) return C.doPlayerAction(camp, 'fund');
  const base = margin(camp);
  let best = null;
  let bm = -Infinity;
  for (const a of acts) {
    if (a.id === 'rest' || a.id === 'fund') continue;
    if (a.id === 'leader' && camp.day < 9) continue;
    const regs = a.target === 'region' ? camp.regionList.map((r) => r.id) : a.target === 'org' ? Object.keys(Game.Data.ORGANIZATIONS) : a.target === 'post' ? Object.keys(Game.Data.SNS_POST_TYPES) : [null];
    for (const r of regs) {
      const cl = JSON.parse(JSON.stringify(camp));
      C.doPlayerAction(cl, a.id, r);
      const m = margin(cl) - base - (a.money || 0) * 12 - a.stamina * 15;
      if (m > bm) { bm = m; best = [a.id, r]; }
    }
  }
  if (!best) return C.doPlayerAction(camp, acts[0].id);
  return C.doPlayerAction(camp, best[0], best[1]);
}

// 半分は最善手、半分は大きい地区を好むなんとなくの手(ふつうのプレイヤーの目安)
function mediumStep(camp) {
  if (Math.random() < 0.5) return greedyStep(camp);
  const P = camp.player;
  if (P.stamina < 30) return C.doPlayerAction(camp, 'rest');
  if (P.money < 15) return C.doPlayerAction(camp, 'fund');
  const acts = C.availableActions(camp).filter((a) => a.enabled && a.id !== 'rest');
  const a = acts[Math.floor(Math.random() * acts.length)];
  const regs = camp.regionList.slice().sort((x, y) => y.voters - x.voters);
  if (a.target === 'org') return C.doPlayerAction(camp, a.id, randomOrg());
  if (a.target === 'post') return C.doPlayerAction(camp, a.id, randomPost());
  return C.doPlayerAction(camp, a.id, regs[Math.floor(Math.random() * Math.random() * regs.length)].id);
}

function randomPost() {
  const ids = Object.keys(Game.Data.SNS_POST_TYPES);
  return ids[Math.floor(Math.random() * ids.length)];
}

function randomOrg() {
  const ids = Object.keys(Game.Data.ORGANIZATIONS);
  return ids[Math.floor(Math.random() * ids.length)];
}

function randomStep(camp) {
  const acts = C.availableActions(camp).filter((a) => a.enabled);
  const a = acts[Math.floor(Math.random() * acts.length)];
  if (a.target === 'org') return C.doPlayerAction(camp, a.id, randomOrg());
  if (a.target === 'post') return C.doPlayerAction(camp, a.id, randomPost());
  return C.doPlayerAction(camp, a.id, camp.regionList[Math.floor(Math.random() * camp.regionList.length)].id);
}

function play(party, step, seed) {
  const camp = C.newDistrictCampaign('自動', party, seed, process.env.EASY ? { easy: true } : undefined);   // EASY=1 でイージーモード
  while (!camp.finished) {
    // 朝の選択イベントは、選べる最初の選択肢を選ぶ
    while (camp.pending) {
      const ev = camp.pending.event;
      C.resolveEvent(camp, ev ? ev.choices.find((c) => !c.disabled).id : 'policy');
    }
    let guard = 0;
    while (camp.actionsLeft > 0 && guard++ < 10) step(camp);
    C.endDay(camp);
  }
  const el = Game.Vote.runDistrictElection(camp);
  return { result: el.player.result, ratio: el.player.ratio };
}

const N = +process.argv[2] || 100;
const botsAll = [['最善手', greedyStep], ['中級', mediumStep], ['ランダム', randomStep]].filter(([n]) => !process.env.BOTS || process.env.BOTS.split(',').includes(n));
const isMain = require.main === module;   // require() したときは何も実行しない
const bots = !isMain || process.env.CAREER || process.env.FULL ? [] : botsAll;
if (bots.length) console.log(`各 ${N} 回。初当選率 = 小選挙区当選 + 比例復活`);
for (const [name, step] of bots) {
  const cells = [];
  for (const p of ['minsei', 'kyowa', 'mirai']) {
    const n = { smd: 0, pr: 0, lost: 0 };
    for (let i = 0; i < N; i++) n[play(p, step, i * 7919 + 13).result]++;
    const pc = (v) => String(Math.round((v / N) * 100)).padStart(3) + '%';
    cells.push(`${Game.Data.PARTIES[p].short} ${pc(n.smd + n.pr)}(区${pc(n.smd)} 復活${pc(n.pr)})`);
  }
  console.log(name.padEnd(5, ' '), cells.join('  '));
}

// ---------------- 議員キャリア(CAREER=1 で実行) ----------------
// 中級ボットで選挙を戦い、任期中は約束を果たしつつ地元回り・派閥活動をするボットで、
// 選挙を最大 ELECTIONS 回(既定5回)まで続ける。再選率と到達した役職を出す。
function termBot(state) {
  const K = Game.Career;
  const c = state.career;
  let guard = 0;
  while (guard++ < 10) {
    if (c.pending) {
      // 補選・地方選挙(M15)は短期決戦の画面に移らないよう、応援演説だけ(できなければ関わらない)
      const loc = c.pending.id === 'local' ? c.pending.choices.find((x) => x.id === 'speech' && !x.disabled) || c.pending.choices.find((x) => x.id === 'skip') : null;
      K.resolveEvent(state, (loc || c.pending.choices.find((x) => !x.disabled) || c.pending.choices[c.pending.choices.length - 1]).id);
      continue;
    }
    if (c.turn.actionsLeft <= 0) break;
    const acts = K.availableActions(state).filter((a) => a.enabled);
    if (!acts.length) break;
    const has = (id) => acts.find((a) => a.id === id);
    const open = (state.support.promises || []).filter((p) => p.status === 'open');
    const weakest = Game.Data.DISTRICTS.slice().sort((a, b) => (c.home.personal[a.id] || 0) * 1e5 / a.voters - (c.home.personal[b.id] || 0) * 1e5 / b.voters)[0].id;
    const r = Math.random();
    if (open.length && has('question')) K.doAction(state, 'question', open[0].policy);
    else if (c.money < 40 && has('fund')) K.doAction(state, 'fund');
    else if (r < 0.5 && has('local')) K.doAction(state, 'local', weakest);
    else if (r < 0.75 && has('faction')) K.doAction(state, 'faction');
    else if (has('question')) K.doAction(state, 'question', state.support.pledges[0]);
    else if (has('local')) K.doAction(state, 'local', weakest);
    else break;
  }
}

function playCampaign(camp, step) {
  while (!camp.finished) {
    while (camp.pending) {
      const ev = camp.pending.event;
      C.resolveEvent(camp, ev ? ev.choices.find((c) => !c.disabled).id : 'policy');
    }
    let guard = 0;
    while (camp.actionsLeft > 0 && guard++ < 10) step(camp);
    C.endDay(camp);
  }
}

function playCareer(party, seed, maxElections) {
  const state = { player: { name: '自動', party }, ui: {} };
  state.campaign = C.newDistrictCampaign('自動', party, seed);
  const results = [];
  let maxPost = 0;
  let turns = 0;
  for (let e = 0; e < maxElections; e++) {
    playCampaign(state.campaign, mediumStep);
    state.election = Game.Vote.runDistrictElection(state.campaign);
    Game.Career.afterElection(state);
    results.push(state.election.player.result);
    if (e === maxElections - 1) break;
    let dissolved = false;
    while (!dissolved) {
      termBot(state);
      dissolved = Game.Career.endTurn(state).dissolved;
      while (state.career.pending) termBot(state);
      maxPost = Math.max(maxPost, state.career.postLevel);
      turns++;
    }
    state.campaign = C.newDistrictCampaign('自動', party, seed + e + 1, Game.Career.campaignExtra(state));
  }
  return { results, maxPost, turns, promises: state.career.promiseStats };
}

if (isMain && process.env.CAREER) {
  const M = +process.env.ELECTIONS || 5;
  console.log(`議員キャリア 各 ${N} 人 × 選挙 ${M} 回(中級ボット)`);
  for (const p of ['minsei', 'kyowa', 'mirai']) {
    const byIdx = Array.from({ length: M }, () => 0);
    const posts = [0, 0, 0, 0, 0];
    let incWins = 0, incRuns = 0, roninWins = 0, roninRuns = 0, turns = 0, kept = 0, broken = 0;
    for (let i = 0; i < N; i++) {
      const r = playCareer(p, i * 7919 + 13, M);
      r.results.forEach((x, k) => {
        if (x !== 'lost') byIdx[k]++;
        if (k > 0) {
          if (r.results[k - 1] !== 'lost') { incRuns++; if (x !== 'lost') incWins++; }
          else { roninRuns++; if (x !== 'lost') roninWins++; }
        }
      });
      posts[r.maxPost]++;
      turns += r.turns;
      kept += r.promises.kept;
      broken += r.promises.broken;
    }
    const pc = (v, n) => (n ? Math.round((v / n) * 100) : 0) + '%';
    console.log(`${Game.Data.PARTIES[p].short}: 回ごとの当選率 ${byIdx.map((v) => pc(v, N)).join(' / ')}  現職の再選率 ${pc(incWins, incRuns)}  浪人の返り咲き ${pc(roninWins, roninRuns)}`);
    console.log(`      到達した役職 ${posts.map((v, k) => `${k}:${pc(v, N)}`).join(' ')}  平均任期 ${(turns / N / 4).toFixed(1)}年(${M - 1}期分)  約束 守${kept} 破${broken}`);
  }
}

// ---------------- ゲーム全体(FULL=1 で実行) ----------------
// 「上手なプレイ」のボット:選挙区は中級ボット、任期中は約束を果たしつつ派閥活動で仲間(推薦人)を集め、
// 党首選に出られれば出る。党首になったら党首モードで総選挙を戦い、宙づり国会なら連立を組む。
// 首相に届いた割合(首相到達率)と、党首に届いた割合を出す。
function skilledTermBot(state) {
  const K = Game.Career;
  const c = state.career;
  let guard = 0;
  while (guard++ < 10) {
    if (c.pending) {
      const loc = c.pending.id === 'local' ? c.pending.choices.find((x) => x.id === 'speech' && !x.disabled) || c.pending.choices.find((x) => x.id === 'skip') : null;   // 補選・地方選挙(M15)
      const ch = loc || c.pending.choices.find((x) => !x.disabled) || c.pending.choices[c.pending.choices.length - 1];
      K.resolveEvent(state, ch.id);
      continue;
    }
    if (c.turn.actionsLeft <= 0) break;
    const acts = K.availableActions(state).filter((a) => a.enabled);
    if (!acts.length) break;
    const has = (id) => acts.find((a) => a.id === id);
    const open = (state.support.promises || []).filter((p) => p.status === 'open');
    const weakest = Game.Data.DISTRICTS.slice().sort((a, b) => (c.home.personal[a.id] || 0) * 1e5 / a.voters - (c.home.personal[b.id] || 0) * 1e5 / b.voters)[0].id;
    const r = Math.random();
    // 解散が近そうなら地元、それ以外は派閥(推薦人)と実績を重視
    const late = c.turn.elapsed >= 8;
    if (open.length && has('question')) K.doAction(state, 'question', open[0].policy);
    else if (c.money < 40 && has('fund')) K.doAction(state, 'fund');
    else if ((late ? r < 0.55 : r < 0.3) && has('local')) K.doAction(state, 'local', weakest);
    else if (r < 0.7 && has('faction')) K.doAction(state, 'faction');
    else if (has('media') && r < 0.8) K.doAction(state, 'media');
    else if (has('question')) K.doAction(state, 'question', state.support.pledges[0]);
    else if (has('local')) K.doAction(state, 'local', weakest);
    else break;
  }
}

function raceBot(state) {
  const L = Game.Leadership;
  const race = state.leaderRace;
  while (!race.result) {
    while (race.actionsLeft > 0) {
      const sh = L.shares(race).player;
      // キングメーカーの推しがなければ、まず会談に行く(M16)
      const km = race.factions && race.factions[2];
      if (km && km.backs !== 'player' && race.actionsLeft === Game.Balance.leadership.actionsPerRound) L.act(state, 'boss');
      else L.act(state, sh.mp < sh.member ? 'mps' : 'tour');
    }
    L.endRound(state);
  }
  return L.finish(state);
}

function leaderTurnBot(state) {
  const LD = Game.Leader;
  const ld = state.leader;
  let guard = 0;
  while (guard++ < 10) {
    if (ld.pending) {
      const p = ld.pending;
      const pref = { govResign: 'stay', govLostPower: 'stay', govBlame: 'stay', govLeaderTerm: 'run', govNoConf: 'dissolve', local: 'speech' }[p.id];
      const ch = (pref && p.choices.find((c) => c.id === pref && !c.disabled)) || p.choices.find((c) => !c.disabled);
      LD.resolveEvent(state, ch.id);
      continue;
    }
    if (ld.actionsLeft <= 0) break;
    const acts = LD.availableActions(state).filter((a) => a.enabled);
    const has = (id) => acts.find((a) => a.id === id);
    const g = state.gov;
    let r;
    const econ = Game.Economy.ensure(state);   // 経済の指標(M14):財政が悪ければ立て直し、景気が落ちたら経済対策
    const targets = Game.Gov.billTargets(state);
    if (ld.cohesion < 45 && has('harmony')) r = LD.doAction(state, 'harmony');
    else if (g.role === 'pm' && econ.fiscal < 30 && has('fiscalReform')) r = LD.doAction(state, 'fiscalReform');
    else if (g.role === 'pm' && econ.growth < 0 && econ.fiscal > 35 && has('stimulus')) r = LD.doAction(state, 'stimulus');
    else if (g.role === 'pm' && has('bill')) r = LD.doAction(state, 'bill', targets[Math.floor(Math.random() * targets.length)]);
    else if (g.role === 'pm' && has('diplomacy') && Math.random() < 0.5) r = LD.doAction(state, 'diplomacy');
    else if (g.role === 'opposition' && has('grill') && Math.random() < 0.4) r = LD.doAction(state, 'grill');
    else if (has('tour')) r = LD.doAction(state, 'tour');
    else if (has('fund')) r = LD.doAction(state, 'fund');
    else break;
    if (!r || !r.ok) { if (has('fund')) LD.doAction(state, 'fund'); else break; }
  }
}

function nationalBot(camp) {
  while (camp.pending) {
    const ev = camp.pending.event;
    C.resolveEvent(camp, ev ? ev.choices.find((c) => !c.disabled).id : 'policy');
  }
  let guard = 0;
  while (camp.actionsLeft > 0 && guard++ < 6) {
    const P = camp.player;
    let r;
    if (camp.day === 1 && !(camp.manifestoUsed)) r = C.doPlayerAction(camp, 'manifesto');
    else if (P.stamina < 30) r = C.doPlayerAction(camp, 'rest');
    else {
      const blocks = camp.regionList.slice().sort((a, b) => b.voters - a.voters);
      r = C.doPlayerAction(camp, 'tour', blocks[(camp.day + guard) % 5].id);
    }
    if (!r.ok) C.doPlayerAction(camp, 'rest');
  }
}

function nationalElection(state, seed) {
  const prep = Game.National.defaultPrep(state);
  // 組めそうな相手と候補者を一本化する
  for (const p of Game.National.coopPartners(state)) {
    if (p.will.unify >= 0 && prep.coops.length < 2 && !prep.coops.some((c) => c.partner === p.id)) prep.coops.push({ partner: p.id, type: 'unify' });
  }
  const camp = Game.National.newNationalCampaign(state, prep, seed);
  state.campaign = camp;
  while (!camp.finished) { nationalBot(camp); C.endDay(camp); }
  state.election = Game.Vote.runNationalElection(camp);
  Game.National.afterElection(state);
  const g = state.gov;
  if (g.formation) {
    // 前向きな相手から順に、大臣1つと相手の政策1つを差し出して過半数をめざす
    const partners = Game.Gov.formationPartners(state);
    const chosen = [];
    let seats = Game.Leader.seatsOf(state, state.leader.party);
    for (const p of partners) {
      if (seats >= Game.Data.MAJORITY) break;
      // 受け入れてもらえるまで条件を上げる(大臣は最大3、政策は2つまで、選挙協力)
      const ok = p.platform.filter((x) => !state.support.pledges.some((y) => Game.Support.conflicts(x, y)));
      const tries = [[1, 1, false], [2, 1, false], [2, 2, false], [2, 2, true], [3, 2, true]];
      let offer = null;
      for (const [m, n, coop] of tries) {
        const o = { ministers: m, policies: ok.slice(0, n), coop };
        if (Game.Gov.willingness(state, p.id, o) >= 0) { offer = o; break; }
      }
      if (!offer) continue;
      g.formation.offers[p.id] = offer;
      chosen.push(p.id);
      seats += p.seats;
    }
    const res = seats >= Game.Data.MAJORITY ? Game.Gov.proposeCoalition(state, chosen) : { formed: false };
    if (!res.formed) {
      const largest = Object.keys(state.world.parties).filter((id) => id !== 'indep').sort((a, b) => state.world.parties[b].seats - state.world.parties[a].seats)[0];
      Game.Gov.giveUpFormation(state, largest === state.leader.party);
      if (state.gov.invite) Game.Gov.answerInvite(state, false);
    }
  }
}

function playFull(party, seed, maxYears) {
  const state = { player: { name: '自動', party }, ui: {} };
  state.campaign = C.newDistrictCampaign('自動', party, seed);
  const out = { leader: false, pm: false, pmYears: 0, years: 0, ending: null, firstWin: null };
  let e = 0;
  // 前半:議員キャリア
  while (!state.leader) {
    playCampaign(state.campaign, mediumStep);
    state.election = Game.Vote.runDistrictElection(state.campaign);
    Game.Career.afterElection(state);
    if (out.firstWin === null) out.firstWin = state.election.player.result !== 'lost';
    if (state.world.year - Game.Balance.term.startYear >= maxYears) break;
    let dissolved = false;
    while (!dissolved && !state.leader) {
      skilledTermBot(state);
      if (state.leaderRace && !state.leaderRace.result) {
        if (raceBot(state)) { out.leader = true; state.leaderRace = null; break; }
        state.leaderRace = null;
      }
      dissolved = Game.Career.endTurn(state).dissolved;
      if (state.career.pending) skilledTermBot(state);
      if (state.leaderRace && !state.leaderRace.result) {
        if (raceBot(state)) { out.leader = true; state.leaderRace = null; break; }
        state.leaderRace = null;
      }
      if (state.world.year - Game.Balance.term.startYear >= maxYears) break;
    }
    if (state.leader || state.world.year - Game.Balance.term.startYear >= maxYears) break;
    e++;
    state.campaign = C.newDistrictCampaign('自動', party, seed + e, Game.Career.campaignExtra(state));
  }
  // 後半:党首モード
  if (state.leader) {
    Game.Leader.init(state);
    let guard = 0;
    while (guard++ < 200 && state.world.year - Game.Balance.term.startYear < maxYears && !state.pendingEnding) {
      if (state.gov.role === 'pm') out.pm = true;
      leaderTurnBot(state);
      if (state.pendingEnding) break;
      Game.Leader.endTurn(state);
      if (state.leader.report && state.leader.report.dissolution) {
        state.leader.report.dissolution = false;
        nationalElection(state, seed + 1000 + guard);
        if (state.gov.role === 'pm') out.pm = true;
      }
      leaderTurnBot(state);
    }
    if (state.gov.role === 'pm') out.pm = true;
    out.pmYears = state.gov.pmTurns / 4;
  }
  out.years = state.world.year - Game.Balance.term.startYear;
  out.ending = Game.Legacy.finish(state, state.pendingEnding || (state.leader ? 'successor' : 'retire'));
  return out;
}

if (isMain && process.env.FULL) {
  const Y = +process.env.YEARS || 30;
  console.log(`ゲーム全体 各 ${N} 人(上手なプレイのボット、最長 ${Y} 年)`);
  for (const p of (process.env.PARTIES || 'minsei,kyowa,mirai').split(',')) {
    let leader = 0, pm = 0, first = 0, pmYears = 0;
    const grades = {};
    const endings = {};
    const scoreSum = {};
    for (let i = 0; i < N; i++) {
      const r = playFull(p, i * 7919 + 13, Y);
      if (r.leader) leader++;
      if (r.pm) { pm++; pmYears += r.pmYears; }
      if (r.firstWin) first++;
      grades[r.ending.grade] = (grades[r.ending.grade] || 0) + 1;
      endings[r.ending.title] = (endings[r.ending.title] || 0) + 1;
      scoreSum[r.ending.title] = (scoreSum[r.ending.title] || 0) + r.ending.score;
    }
    const pc = (v) => Math.round((v / N) * 100) + '%';
    console.log(`${Game.Data.PARTIES[p].short}: 初当選 ${pc(first)}  党首到達 ${pc(leader)}  首相到達 ${pc(pm)}(首相の平均在任 ${pm ? (pmYears / pm).toFixed(1) : 0}年)`);
    console.log(`      評価 ${['S', 'A', 'B', 'C', 'D'].map((g) => `${g}:${grades[g] || 0}`).join(' ')}  エンディング ${Object.keys(endings).map((k) => `${k} ${endings[k]}人(平均${Math.round(scoreSum[k] / endings[k])}点)`).join('、')}`);
  }
}

module.exports = { C, play, greedyStep, mediumStep, randomStep, termBot, playCampaign, playCareer, playFull };
