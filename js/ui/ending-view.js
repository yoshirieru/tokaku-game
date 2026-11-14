// エンディングの画面:政界を去ったあとの評価(S〜D)、内訳、政治家としての歩み。中身は career.js の retire が作る(state.ending)。
window.Game = window.Game || {};

Game.EndingView = (function () {
  const UI = Game.UI;
  const num = function (n) { return Math.round(n).toLocaleString('ja-JP'); };

  function render(app) {
    const s = Game.state, en = s.ending;
    const kicker = en.reason === 'dropped' ? '続けて議席を得られず、党の公認を失った' : '自分の意思で、身を引いた';
    const rows = en.lines.map(function (l) {
      return '<div class="en-row"><span>' + l.label + '</span><b>' + UI.esc(l.value) + '</b><span class="en-pts' + (l.pts < 0 ? ' minus' : '') + '">' + UI.signed(l.pts) + '</span></div>';
    }).join('');
    const history = en.history.map(function (h, i) {
      const res = h.won ? ['当選', 'won'] : h.revived ? ['比例復活', 'pr'] : ['落選', 'lost'];
      return '<li><span class="en-no">' + (i + 1) + '回目</span><span class="sub">' + Game.Data.ROLE_NAMES[h.role || 'newcomer'] + 'として</span>' +
        '<b class="en-res ' + res[1] + '">' + res[0] + '</b><span class="en-votes">' + num(h.votes) + '票</span></li>';
    }).join('');
    app.innerHTML = '<div class="ending">' +
      '<header class="en-head"><p class="m-kicker">' + kicker + '</p><h1>' + UI.esc(s.player.name) + '、' + UI.esc(en.title) + '</h1>' +
      '<div class="en-grade"><span>評価</span><b>' + en.grade + '</b><small>' + en.score + '点</small></div></header>' +
      '<div class="en-body"><section class="panel"><h2>評価の内訳</h2>' + rows +
      '<p class="pr-note">党首・総理への道は、これから作っていく部分です。いまは党三役までが出世の上限です。</p></section>' +
      '<section class="panel"><h2>政治家としての歩み<small>選挙 ' + en.elections + '回</small></h2><ol class="en-history">' + history + '</ol></section></div>' +
      '<footer class="ct-btns"><button type="button" class="btn" id="title">タイトルへ</button>' +
      '<button type="button" class="btn btn-primary btn-lg" id="again">はじめから遊ぶ</button></footer></div>';
    app.querySelector('#title').onclick = Game.toTitle;
    app.querySelector('#again').onclick = function () { Game.state = null; Game.view = 'setup'; Game.render(); };
  }

  return { render: render };
})();
