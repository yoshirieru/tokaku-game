// 起動、画面切り替え、セーブ・ロード。
// ゲーム状態はすべて Game.state(1つのオブジェクト)にまとめ、localStorage に保存する。
window.Game = window.Game || {};

(function () {
  const OLD_SAVE_KEY = 'kokusei-campaign-save';      // セーブが1つだった頃の場所(スロット1へ移す)
  const SLOT_PREFIX = 'kokusei-campaign-save-';
  const LAST_SLOT_KEY = 'kokusei-campaign-last-slot';
  const SAVE_VERSION = 1;
  Game.SLOTS = 5;   // セーブデータの数

  Game.state = null;
  Game.slot = 1;    // いま遊んでいるセーブデータの番号

  function slotKey(n) {
    return SLOT_PREFIX + n;
  }
  function storage(fn, fallback) {
    try { return fn(); } catch (e) { return fallback; }
  }
  // 古いセーブ(1つだけ)があれば、空いているスロット1へ移す
  function migrateOldSave() {
    storage(() => {
      const old = localStorage.getItem(OLD_SAVE_KEY);
      if (old && !localStorage.getItem(slotKey(1))) localStorage.setItem(slotKey(1), old);
      if (old) localStorage.removeItem(OLD_SAVE_KEY);
    });
  }
  Game.slot = storage(() => +localStorage.getItem(LAST_SLOT_KEY) || 1, 1);

  // opts: { easy: イージーモード, tutorial: チュートリアルを見せる, seat: 選挙区(districts.js の SEATS) }
  function newState(playerName, partyId, pledges, opts) {
    opts = opts || {};
    const seat = Game.Data.applySeat(opts.seat).id;
    const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    return {
      version: SAVE_VERSION,
      screen: 'campaign',
      difficulty: opts.easy ? 'easy' : 'normal',
      tutorial: opts.tutorial ? { done: {} } : null,
      seat,
      player: { name: playerName, party: partyId },
      campaign: Game.Campaign.newDistrictCampaign(playerName, partyId, seed, { pledges, easy: !!opts.easy }),
      ui: { selectedRegion: Game.Data.DISTRICTS[0].id, showMorning: true },
    };
  }

  Game.save = function () {
    if (!Game.state) return;
    Game.state.savedAt = Date.now();
    try {
      localStorage.setItem(slotKey(Game.slot), JSON.stringify(Game.state));
      localStorage.setItem(LAST_SLOT_KEY, String(Game.slot));
    } catch (e) {
      console.warn('セーブできませんでした', e);
    }
  };

  // n を省くと、いま遊んでいるスロット
  Game.loadSave = function (n) {
    migrateOldSave();
    try {
      const raw = localStorage.getItem(slotKey(n || Game.slot));
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || s.version !== SAVE_VERSION) return null;
      return s;
    } catch (e) {
      return null;
    }
  };

  // どれかのスロットにセーブがあるか
  Game.hasSave = function () {
    for (let n = 1; n <= Game.SLOTS; n++) if (Game.loadSave(n)) return true;
    return false;
  };

  Game.deleteSave = function (n) {
    storage(() => localStorage.removeItem(slotKey(n || Game.slot)));
  };

  // スロットの一覧(画面の表示用):{ n, state | null }
  Game.listSlots = function () {
    const out = [];
    for (let n = 1; n <= Game.SLOTS; n++) out.push({ n, state: Game.loadSave(n) });
    return out;
  };
  // 新しく遊ぶスロットを決める
  Game.useSlot = function (n) {
    Game.slot = n;
    storage(() => localStorage.setItem(LAST_SLOT_KEY, String(n)));
  };

  Game.startNew = function (playerName, partyId, pledges, opts) {
    Game.state = newState(playerName, partyId, pledges, opts);
    Game.screen = null;
    Game.save();
    Game.render();
  };

  // 新党ルート(スタート時):議席のない党首として結党準備から始める
  // opts: { name, short, color, ideology, pledges }
  Game.startNewParty = function (playerName, opts, mode) {
    mode = mode || {};
    const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    const st = {
      version: SAVE_VERSION,
      screen: 'term',
      difficulty: mode.easy ? 'easy' : 'normal',
      tutorial: mode.tutorial ? { done: {} } : null,
      seat: Game.Data.applySeat(mode.seat).id,
      player: { name: playerName, party: Game.NewParty.ID },
      ui: { showTermReport: true },
    };
    const upperRoute = mode.firstTarget === 'upper';   // 参院選から挑む(M13)
    Game.NewParty.create(st, Object.assign({}, opts, { origin: 'start', mps: 0, year: upperRoute ? Game.Balance.newParty.upperRoute.startYear : Game.Balance.term.startYear }));
    Game.Career.startFounder(st, seed, { firstTarget: mode.firstTarget });
    Game.state = st;
    Game.screen = null;
    Game.save();
    Game.render();
  };

  // 新党は実行時に政党一覧へ登録するので、セーブを読み込んだら登録し直す
  function restoreRuntime(s) {
    Game.Data.applySeat(s.seat);   // 選んだ選挙区(古いセーブは北陽3区)
    if (s.party && s.party.custom) Game.NewParty.register(s.party);
    if (s.versus && s.versus.customParty) Game.NewParty.register(s.versus.customParty);   // 対戦モードの新党
    if (s.world && s.world.parties) Game.Leader.applyOverrides(s);
  }

  Game.continueGame = function (n) {
    if (n) Game.useSlot(n);
    const s = Game.loadSave();
    if (!s) return;
    restoreRuntime(s);
    Game.state = s;
    Game.screen = null;
    Game.render();
  };

  // 対戦モード(versus.js):2人の設定から始める
  Game.startVersus = function (opts) {
    const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    Game.Data.applySeat(null);   // 対戦モードの党首の地元は北陽3区(既定の選挙区)
    Game.state = Game.Versus.start(Object.assign({ seed }, opts));
    Game.state.version = SAVE_VERSION;
    Game.screen = null;
    Game.save();
    Game.render();
  };

  // 選挙戦が終わったら投票日の結果を1回だけ計算し、開票特番へ
  Game.startElection = function () {
    const st = Game.state;
    if (!st.election) st.election = st.campaign.mode === 'national' ? Game.Vote.runNationalElection(st.campaign) : Game.Vote.runDistrictElection(st.campaign);
    st.screen = 'count';
    st.ui.countStep = 0;
    st.ui.countPhase = 'smd';
    Game.commit();
  };

  // 開票が終わったら結果を記録し、地盤・ライバル・支援団体を次の任期へ引き継ぐ
  Game.finishElection = function () {
    const st = Game.state;
    const el = st.election;
    if (st.versus) {
      if (!el.recorded) { el.recorded = true; Game.Versus.afterElection(st); }
      return Game.commit();
    }
    // 補欠選挙・地方選挙(local.js):結果を反映して、任期・党首モードの画面へ戻る
    if (st.campaign && st.campaign.sub) {
      Game.Local.after(st);
      if (st.pendingEnding) return Game.goEnding(st.pendingEnding);   // 知事に転身
      Game.clearUndo();
      return Game.commit();
    }
    if (!el.recorded) {
      if (el.kind === 'national') Game.National.afterElection(st);
      else Game.Career.afterElection(st);
      el.recorded = true;
    }
    st.screen = 'result';
    Game.commit();
  };

  // 結果画面から議員生活(または浪人生活)へ。新党の最初の総選挙のあとは「後半への入口」へ
  Game.startTerm = function () {
    const st = Game.state;
    if (st.party && st.party.custom && st.party.firstElectionDone) {
      st.screen = 'leaderHub';
      Game.commit();
      return;
    }
    st.screen = 'term';
    st.ui.showTermReport = true;
    Game.commit();
  };

  // 解散:引き継ぎを入れて次の選挙戦を始める
  Game.startNextCampaign = function () {
    const st = Game.state;
    const seed = (Date.now() ^ st.career.rng) >>> 0;
    st.campaign = Game.Campaign.newDistrictCampaign(st.player.name, st.player.party, seed, Game.Career.campaignExtra(st));
    st.election = null;
    st.screen = 'campaign';
    st.ui.showMorning = true;
    st.ui.lastResult = null;
    st.ui.selectedRegion = Game.Data.DISTRICTS[0].id;
    Game.commit();
  };

  // ---------------- 党首モードの総選挙 ----------------
  Game.startNationalPrep = function () {
    const st = Game.state;
    st.nationalPrep = Game.National.defaultPrep(st);
    st.screen = 'nationalPrep';
    Game.clearUndo();
    Game.commit();
  };
  Game.startNationalCampaign = function () {
    const st = Game.state;
    const seed = (Date.now() ^ st.career.rng) >>> 0;
    st.campaign = Game.National.newNationalCampaign(st, st.nationalPrep, seed);
    st.election = null;
    st.screen = 'campaign';
    st.ui.showMorning = true;
    st.ui.lastResult = null;
    st.ui.selectedRegion = Game.Data.HOME_BLOCK;
    Game.clearUndo();
    Game.commit();
  };
  // 総選挙の結果画面から党本部へ
  Game.backToLeader = function () {
    const st = Game.state;
    st.nationalPrep = null;
    // 過半数の党がなければ連立交渉の画面へ(government.js)
    st.screen = st.gov && st.gov.formation ? 'coalition' : 'leaderHub';
    st.ui.showLeaderReport = true;
    Game.commit();
  };

  // ゲームを終える:エンディングとレガシー評価(legacy.js)
  // 途中で政界を引退できる画面(エンディングへ)。対戦モードと、開票・論戦の最中は除く
  const RETIRE_SCREENS = ['campaign', 'term', 'leaderRace', 'leaderHub', 'nationalPrep', 'coalition', 'result'];
  Game.canRetire = function () {
    const st = Game.state;
    return !!(st && !st.versus && RETIRE_SCREENS.includes(st.screen));
  };
  Game.retire = function () {
    const st = Game.state;
    if (!Game.canRetire()) return;
    if (!st.career) Game.Career.ensure(st);   // 最初の選挙の前でも評価が出せるように
    Game.clearUndo();
    // 党首なら党首として退く(首相で支持が高ければ「名宰相」もある)
    Game.goEnding(st.leader && st.leader.mode === 'leader' ? 'successor' : 'retire');
  };

  // reason: 'successor' | 'retire' | 'forcedResign' | 'noConfidence' | 'lostPower' | 'replaced'
  Game.goEnding = function (reason) {
    const st = Game.state;
    st.pendingEnding = null;
    Game.Legacy.finish(st, reason);
    Game.recordHall(st);   // 殿堂に記録する(セーブデータとは別に残る)
    Game.clearUndo();
    Game.commit();
  };

  // 党首選の結果を反映する。勝てば「後半への入口」、負ければ任期に戻る
  Game.finishLeaderRace = function () {
    const st = Game.state;
    const race = st.leaderRace;
    const won = Game.Leadership.finish(st);
    const winner = race.cands.find((x) => x.id === race.result.winner);
    st.leaderRace = null;
    Game.clearUndo();
    if (won) {
      st.screen = 'leaderHub';
    } else {
      st.screen = 'term';
      st.career.report = {
        title: '党首選の結果',
        lines: [`党首選は${winner.name}が制した。`, '次の機会に向けて、仲間を増やし、実績を積もう。'],
        event: null,
      };
      st.ui.showTermReport = true;
    }
    Game.commit();
  };

  // ---------------- 行動の取り消し ----------------
  // 行動の直前の状態(乱数を含む)を積んでおき、その日・そのターンのうちなら戻せる。
  // 乱数も戻るので、同じ行動を選び直すと結果も同じになる(やり直しで良い結果を引くことはできない)
  const UNDO_MAX = 6;
  Game.pushUndo = function () {
    const st = Game.state;
    const stack = st.ui.undo || [];
    st.ui.undo = undefined;
    const snap = JSON.stringify(st);
    st.ui.undo = stack;
    stack.push(snap);
    if (stack.length > UNDO_MAX) stack.shift();
  };
  // 行動が失敗したときに、積んだ分を捨てる
  Game.dropUndo = function () {
    const stack = Game.state.ui.undo;
    if (stack && stack.length) stack.pop();
  };
  Game.canUndo = function () {
    return !!(Game.state && Game.state.ui.undo && Game.state.ui.undo.length);
  };
  Game.undo = function () {
    const stack = Game.state.ui.undo || [];
    if (!stack.length) return;
    const prev = JSON.parse(stack.pop());
    prev.ui.undo = stack;
    prev.ui.lastResult = '↶ 行動を取り消した。';
    restoreRuntime(prev);
    Game.state = prev;
    Game.commit();
  };
  Game.clearUndo = function () {
    if (Game.state && Game.state.ui) Game.state.ui.undo = [];
  };

  // ---------------- 殿堂(hall.js)。セーブデータとは別の場所に残し、スロットを消しても消えない ----------------
  const HALL_KEY = 'kokusei-hall';
  Game.loadHall = function () {
    return Game.Hall.normalize(storage(() => JSON.parse(localStorage.getItem(HALL_KEY) || 'null'), null));
  };
  Game.saveHall = function (hall) {
    storage(() => localStorage.setItem(HALL_KEY, JSON.stringify(hall)));
  };
  Game.clearHall = function () {
    storage(() => localStorage.removeItem(HALL_KEY));
  };
  // エンディングのとき1回だけ記録する(エンディング画面を読み直しても二重にならない)
  Game.recordHall = function (st) {
    if (!st.ending || st.ending.hall) return;
    const r = Game.Hall.record(Game.loadHall(), st);
    Game.saveHall(r.hall);
    st.ending.hall = { newly: r.newly, rank: r.rank };
  };

  // 状態を持たない画面(タイトル・準備)へ移る
  Game.showScreen = function (name) {
    Game.screen = name;
    Game.render();
  };

  // 状態を変えたあとに呼ぶ:保存して描き直す
  Game.commit = function () {
    Game.save();
    Game.render();
  };

  Game.render = function () {
    const app = document.getElementById('app');
    const modal = document.getElementById('modal-root');
    modal.innerHTML = '';
    if (Game.UI.stopCountTimer) Game.UI.stopCountTimer();
    if (!Game.state || Game.screen === 'title' || Game.screen === 'setup' || Game.screen === 'versusSetup' || Game.screen === 'slots' || Game.screen === 'hall') {
      if (Game.screen === 'setup') Game.UI.renderSetup(app);
      else if (Game.screen === 'hall') Game.UI.renderHall(app);   // 殿堂(hall-view.js)
      else if (Game.screen === 'versusSetup') Game.UI.renderVersusSetup(app);
      else if (Game.screen === 'slots') Game.UI.renderSlots(app);
      else Game.UI.renderTitle(app);
      return;
    }
    switch (Game.state.screen) {
      case 'campaign':
        Game.UI.renderCampaign(app, modal);
        break;
      case 'campaignEnd':   // M1 のセーブ:選挙戦が終わったところから開票へ
        Game.startElection();
        break;
      case 'count':
        Game.UI.renderCount(app);
        break;
      case 'result':
        Game.UI.renderResult(app);
        break;
      case 'term':
        Game.UI.renderTerm(app, modal);
        break;
      case 'leaderRace':
        Game.UI.renderLeaderRace(app);
        break;
      case 'nationalPrep':
        Game.UI.renderNationalPrep(app);
        break;
      case 'coalition':   // 総選挙のあとの連立交渉(gov-view.js)
        Game.UI.renderCoalition(app);
        break;
      case 'retired':   // M7 のセーブ(退陣した直後)
        Game.goEnding('forcedResign');
        break;
      case 'ending':
        Game.UI.renderEnding(app);
        break;
      case 'debate':   // 国会論戦バトル(debate-view.js)
        Game.UI.renderDebate(app);
        break;
      case 'vsPrep': case 'vsPlan': case 'vsReveal': case 'vsGovReveal': case 'vsDebate':
      case 'vsResult': case 'vsFormation': case 'vsGov': case 'vsEnd':   // 対戦モード(versus-view.js)
        Game.UI.renderVersus(app);
        break;
      case 'leaderHub':   // 党首モード(後半の土台)
        Game.UI.renderLeaderMode(app, modal);
        break;
      default:
        Game.UI.renderTitle(app);
    }
    Game.UI.bindGameMenu(app);   // ≡ メニュー(セーブしてタイトルへ・政界を引退する)
    if (Game.UI.maybeTutorial) Game.UI.maybeTutorial(modal);   // チュートリアル(tutorial.js)
  };

  document.addEventListener('DOMContentLoaded', function () {
    Game.screen = 'title';
    Game.render();
  });
})();
