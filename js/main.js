// 起動、画面切り替え、セーブ・ロード、行動の取り消し。
// ゲーム状態はすべて Game.state(1つのオブジェクト)にまとめ、localStorage に保存する。
window.Game = window.Game || {};

(function () {
  // セーブの枠(balance.js の ui.saveSlots。5つ)。枠 n は tokaku2-save-n。旧版(legacy/)のセーブ(kokusei-campaign-save-*)とは別
  // 枠を作る前のセーブ(tokaku2-save)は、はじめて読むときに枠1へ移す
  const OLD_KEY = 'tokaku2-save', SLOT_KEY = 'tokaku2-save-';
  const SAVE_VERSION = 2;
  const slotCount = function () { return Game.Balance.ui.saveSlots; };

  Game.state = null;
  Game.view = 'title';      // ゲームを始める前の画面:'title' | 'slots'(セーブの枠を選ぶ)| 'setup' | 'hall' | 'versus'(対戦の準備)
  Game.slot = 1;            // いま遊んでいるセーブの枠(1〜5)
  Game.slotMode = 'new';    // 枠を選ぶ画面の使いみち:'new' はじめから / 'versus' 2人で対戦 / 'load' つづきから
  Game.ui = { card: null }; // 保存しない画面だけの状態(選んでいるカードなど)
  let undoStack = [];       // 行動の直前の state(その日のうちだけ)

  function migrate() {
    try {
      const old = localStorage.getItem(OLD_KEY);
      if (old == null) return;
      if (localStorage.getItem(SLOT_KEY + 1) == null) localStorage.setItem(SLOT_KEY + 1, old);
      localStorage.removeItem(OLD_KEY);
    } catch (e) { /* 読めなくても遊べる */ }
  }
  Game.save = function () {
    if (!Game.state) return;
    Game.state.savedAt = Date.now();
    if (Game.state.camp) Game.Voters.persist(Game.state.camp);   // 有権者の変わった値を書く(R18)
    try { localStorage.setItem(SLOT_KEY + Game.slot, JSON.stringify(Game.state)); } catch (e) { console.warn('セーブできませんでした', e); }
  };
  Game.loadSave = function (n) {
    migrate();
    try {
      const s = JSON.parse(localStorage.getItem(SLOT_KEY + (n || Game.slot)));
      return s && s.version === SAVE_VERSION ? s : null;
    } catch (e) { return null; }
  };
  // すべての枠:[{ slot, state(なければ null) }]
  Game.listSaves = function () {
    const out = [];
    for (let n = 1; n <= slotCount(); n++) out.push({ slot: n, state: Game.loadSave(n) });
    return out;
  };
  Game.hasSave = function () { return Game.listSaves().some(function (x) { return x.state; }); };
  Game.deleteSave = function (n) {
    try { localStorage.removeItem(SLOT_KEY + n); } catch (e) { /* 消せなくても遊べる */ }
  };

  // ---- 殿堂(R7):セーブデータとは別に残す。セーブを消しても、はじめから遊んでも消えない ----
  const HALL_KEY = 'tokaku2-hall';
  Game.loadHall = function () {
    try { return Game.Hall.normalize(JSON.parse(localStorage.getItem(HALL_KEY))); } catch (e) { return Game.Hall.empty(); }
  };
  Game.saveHall = function (h) {
    try { localStorage.setItem(HALL_KEY, JSON.stringify(h)); } catch (e) { console.warn('殿堂を保存できませんでした', e); }
  };
  Game.clearHall = function () {
    try { localStorage.removeItem(HALL_KEY); } catch (e) { /* 消せなくても遊べる */ }
  };
  // エンディングを迎えたら、殿堂に1件記録する。結果は state.ending.hall に持ち、読み直しても二重に記録しない
  function recordHall(s) {
    if (!s || s.screen !== 'ending' || !s.ending || s.ending.hall || s.scenario) return;   // 史実シナリオ(R17)は殿堂に記録しない
    const h = Game.loadHall();
    s.ending.hall = Game.Hall.record(h, s, Date.now());
    Game.saveHall(h);
    Game.save();
  }

  Game.startNew = function (name, party, seat) {
    Game.Data.applyScenarioNames(null);
    const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) | 0;
    const state = { version: SAVE_VERSION, screen: 'campaign', player: { name: name, party: party, seat: seat }, rng: seed };
    Game.Campaign.newCampaign(state);
    Game.state = state;
    Game.ui = { card: null };
    undoStack = [];
    Game.save();
    Game.render();
  };
  // 対戦モード(R8):2人で同じ選挙区を戦う。o は Versus.newMatch と同じ
  Game.startVersus = function (o) {
    Game.Data.applyScenarioNames(null);
    const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) | 0;
    const state = { version: SAVE_VERSION, screen: 'campaign', player: {}, rng: seed };
    Game.Versus.newMatch(state, o);
    Game.state = state;
    Game.ui = { card: null };
    undoStack = [];
    Game.save();
    Game.render();
  };
  // 近道:はじめから党首として総選挙を戦う
  Game.startLeader = function (name, party, seat) {
    Game.Data.applyScenarioNames(null);
    const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) | 0;
    const state = { version: SAVE_VERSION, screen: 'campaign', player: { name: name, party: party, seat: seat }, rng: seed };
    Game.Career.quickLeader(state);
    Game.Campaign.newCampaign(state);
    Game.state = state;
    Game.ui = { card: null };
    undoStack = [];
    Game.save();
    Game.render();
  };
  // 史実シナリオ(R17)
  Game.startScenario = function (name, id) {
    const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) | 0;
    const state = { version: SAVE_VERSION, screen: 'campaign', player: { name: name, party: 'minsei', seat: 'hokuyo3' }, rng: seed };
    Game.Data.setNewParty(null);
    Game.Scenario.start(state, id);
    Game.state = state;
    Game.ui = { card: null };
    undoStack = [];
    Game.save();
    Game.render();
  };
  // いまの画面に合う舞台(選挙区か全国)にする
  function syncArena(s) {
    const camp = s && (s.screen === 'campaign' || s.screen === 'count' || s.screen === 'result' || s.screen === 'coalition') ? s.camp : null;
    const leaderTerm = s && s.screen === 'term' && s.career && s.career.leader;   // 党首の任期は全国の地図
    if (s) Game.Data.setHome(s.player.seat);   // 立候補している選挙区(R6 より前のセーブは北陽3区)
    if (s) Game.Data.setNewParty(s.career && s.career.np);   // 新党(R16)の名前と色
    Game.Data.applyScenarioNames(s && s.scenario ? Game.Scenario.find(s.scenario.id) : null);   // 史実シナリオ(R17)だけ実名
    Game.Data.useArena((camp && camp.arena === 'nation') || leaderTerm ? 'nation' : 'home');
  }
  Game.continueGame = function (n) {
    if (n) Game.slot = n;
    Game.state = Game.loadSave(Game.slot);
    if (!Game.state) { Game.view = 'title'; return Game.render(); }
    syncArena(Game.state);
    Game.ui = { card: null };
    undoStack = [];
    Game.render();
  };
  // タイトルへ(セーブは残る)
  Game.toTitle = function () {
    Game.save();
    Game.state = null;
    Game.view = 'title';
    Game.render();
  };

  // ---- 行動の取り消し:その日のうちなら、カードを使う前に戻せる。乱数の状態も戻るので結果は変わらない ----
  Game.pushUndo = function () { if (Game.state && Game.state.camp) Game.Voters.persist(Game.state.camp); undoStack.push(JSON.stringify(Game.state)); };
  Game.canUndo = function () { return undoStack.length > 0; };
  Game.clearUndo = function () { undoStack = []; };
  Game.undo = function () {
    if (!undoStack.length) return;
    Game.state = JSON.parse(undoStack.pop());
    syncArena(Game.state);
    Game.ui.card = null;
    Game.save();
    Game.render();
  };

  Game.render = function () {
    const app = document.getElementById('app');
    const s = Game.state;
    if (!s) {
      Game.Data.applyScenarioNames(null);   // タイトルや準備の画面は、架空の名前
      // 舞台は選挙区に戻す。党首の総選挙(全国)のあとでタイトルに戻ると、全国の地図のままで、準備の画面がエラーになり「はじめから」が効かなかった
      Game.Data.setNewParty(null);
      Game.Data.useArena('home');
      if (Game.view === 'slots') return Game.Screens.renderSlots(app);
      if (Game.view === 'setup') return Game.Screens.renderSetup(app);
      if (Game.view === 'hall') return Game.HallView.render(app);
      if (Game.view === 'scenario') return Game.ScenarioView.render(app);   // 史実シナリオ(R17)
      if (Game.view === 'versus') return Game.VersusView.renderSetup(app);
      return Game.Screens.renderTitle(app);
    }
    const nat = s.election && s.election.national;
    if (s.screen === 'count') return nat ? Game.NationalView.render(app) : Game.CountView.render(app);
    if (s.screen === 'result') return s.mode === 'versus' ? Game.VersusView.renderResult(app) : nat ? Game.NationalView.renderResult(app) : Game.CountView.renderResult(app);
    if (s.screen === 'coalition') return Game.GovView.renderCoalition(app);
    if (s.screen === 'term') return Game.TermView.render(app);
    if (s.screen === 'ending') { recordHall(s); return Game.EndingView.render(app); }
    return Game.CampaignView.render(app);
  };

  // Ctrl+Z(Mac は ⌘+Z)で「取り消す」。知らせの窓が出ているときと、文字を打っているときは効かない
  window.addEventListener('keydown', function (e) {
    if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') return;
    if (document.querySelector('.modal-back') || /^(INPUT|TEXTAREA)$/.test((document.activeElement || {}).tagName)) return;
    const b = document.getElementById('undo');
    if (!b || b.disabled) return;
    e.preventDefault();
    b.click();
  });

  window.addEventListener('DOMContentLoaded', function () { Game.render(); });
})();
