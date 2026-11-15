// 起動、画面切り替え、セーブ・ロード、行動の取り消し。
// ゲーム状態はすべて Game.state(1つのオブジェクト)にまとめ、localStorage に保存する。
window.Game = window.Game || {};

(function () {
  const SAVE_KEY = 'tokaku2-save';   // 旧版(legacy/)のセーブ(kokusei-campaign-save-*)とは別
  const SAVE_VERSION = 2;

  Game.state = null;
  Game.view = 'title';      // ゲームを始める前の画面:'title' | 'setup'
  Game.ui = { card: null }; // 保存しない画面だけの状態(選んでいるカードなど)
  let undoStack = [];       // 行動の直前の state(その日のうちだけ)

  Game.save = function () {
    if (!Game.state) return;
    Game.state.savedAt = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(Game.state)); } catch (e) { console.warn('セーブできませんでした', e); }
  };
  Game.loadSave = function () {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      return s && s.version === SAVE_VERSION ? s : null;
    } catch (e) { return null; }
  };
  Game.hasSave = function () { return !!Game.loadSave(); };

  Game.startNew = function (name, party, seat) {
    const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) | 0;
    const state = { version: SAVE_VERSION, screen: 'campaign', player: { name: name, party: party, seat: seat }, rng: seed };
    Game.Campaign.newCampaign(state);
    Game.state = state;
    Game.ui = { card: null };
    undoStack = [];
    Game.save();
    Game.render();
  };
  // 近道:はじめから党首として総選挙を戦う
  Game.startLeader = function (name, party, seat) {
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
  // いまの画面に合う舞台(選挙区か全国)にする
  function syncArena(s) {
    const camp = s && (s.screen === 'campaign' || s.screen === 'count' || s.screen === 'result' || s.screen === 'coalition') ? s.camp : null;
    const leaderTerm = s && s.screen === 'term' && s.career && s.career.leader;   // 党首の任期は全国の地図
    if (s) Game.Data.setHome(s.player.seat);   // 立候補している選挙区(R6 より前のセーブは北陽3区)
    Game.Data.useArena((camp && camp.arena === 'nation') || leaderTerm ? 'nation' : 'home');
  }
  Game.continueGame = function () {
    Game.state = Game.loadSave();
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
  Game.pushUndo = function () { undoStack.push(JSON.stringify(Game.state)); };
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
      if (Game.view === 'setup') return Game.Screens.renderSetup(app);
      return Game.Screens.renderTitle(app);
    }
    const nat = s.election && s.election.national;
    if (s.screen === 'count') return nat ? Game.NationalView.render(app) : Game.CountView.render(app);
    if (s.screen === 'result') return nat ? Game.NationalView.renderResult(app) : Game.CountView.renderResult(app);
    if (s.screen === 'coalition') return Game.GovView.renderCoalition(app);
    if (s.screen === 'term') return Game.TermView.render(app);
    if (s.screen === 'ending') return Game.EndingView.render(app);
    return Game.CampaignView.render(app);
  };

  window.addEventListener('DOMContentLoaded', function () { Game.render(); });
})();
