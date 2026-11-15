// 殿堂の画面(R7):実績、歴代の記録、自己ベスト。エンディングの画面に出す「歴代の何位・新しい実績」の帯もここ。
// 殿堂の中身は js/engine/hall.js、出し入れは main.js(Game.loadHall / saveHall / clearHall)
window.Game = window.Game || {};

Game.HallView = (function () {
  const UI = Game.UI;
  const day = function (t) { const d = new Date(t); return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate(); };
  const years = function (turns) { return (turns / 2).toFixed(1).replace('.0', '') + '年'; };
  const seatName = function (id) { return (Game.Data.SEATS[id] || Game.Data.SEATS.hokuyo3).name; };

  // 実績のハンコ(達成していれば朱、まだなら灰)
  function seal(a, on) {
    return '<span class="ach-seal' + (on ? ' on' : '') + '" aria-hidden="true">' + a.mark + '</span>';
  }
  function achHtml(hall) {
    return Game.Data.ACHIEVEMENTS.map(function (a) {
      const g = hall.achievements[a.id];
      return '<li class="ach' + (g ? ' on' : '') + '">' + seal(a, !!g) +
        '<span class="ach-body"><b>' + a.title + '</b><small>' + a.desc + '</small>' +
        (g ? '<span class="ach-when">' + day(g.at) + '・' + UI.esc(g.name) + '</span>' : '') + '</span></li>';
    }).join('');
  }
  function recordsHtml(hall) {
    if (!hall.records.length) return '<p class="pr-note">まだ記録がない。政界を去ると、ここに歩みが残る。</p>';
    return '<ol class="hall-rec">' + hall.records.map(function (r, i) {
      return '<li><span class="hr-no">' + (i + 1) + '</span><span class="hr-grade g-' + r.grade + '">' + r.grade + '</span>' +
        '<span class="hr-who">' + UI.partyChip({ party: r.party }) + '<b>' + UI.esc(r.name) + '</b>' + (r.quick ? '<span class="hr-quick">近道</span>' : '') +
        '<small>' + seatName(r.seat) + '・' + UI.esc(r.title) + '</small></span><span class="hr-score">' + r.score + '<small>点</small></span></li>';
    }).join('') + '</ol>';
  }
  function bestsHtml(hall) {
    const b = Game.Hall.bests(hall);
    const grades = ['S', 'A', 'B', 'C', 'D'].map(function (g) { return '<span class="hb-g g-' + g + '">' + g + '<small>' + (b.grades[g] || 0) + '回</small></span>'; }).join('');
    const seats = Game.Data.SEAT_ORDER.map(function (k) { return '<span class="hb-chip' + (hall.seatsWon[k] ? ' on' : '') + '">' + seatName(k) + '</span>'; }).join('');
    const pms = Object.keys(Game.Data.PARTIES).map(function (k) {
      const p = Game.Data.PARTIES[k];
      return '<span class="hb-chip' + (hall.pmParties[k] ? ' on' : '') + '" style="--pc:' + p.color + '">' + p.short + '</span>';
    }).join('');
    const row = function (label, value) { return '<div class="prep-row"><span>' + label + '</span><b>' + value + '</b></div>'; };
    return row('政界を去った回数', b.plays + '回') + row('最高点', b.score + '点') + row('最も多く議席を得た', b.seats + '回') +
      row('首相の最長在任', b.pmTurns ? years(b.pmTurns) : '—') + row('総選挙の最多議席', b.bestSeats ? b.bestSeats + '議席' : '—') +
      '<div class="hb-line"><span>評価</span><div>' + grades + '</div></div>' +
      '<div class="hb-line"><span>議席を得た選挙区</span><div>' + seats + '</div></div>' +
      '<div class="hb-line"><span>首相になった党</span><div>' + pms + '</div></div>';
  }

  function render(app) {
    const hall = Game.loadHall();
    const n = Game.Data.ACHIEVEMENTS.filter(function (a) { return hall.achievements[a.id]; }).length;
    app.innerHTML = '<div class="setup hall">' +
      '<h1 class="page-title">殿堂</h1>' +
      '<p class="lead">政界を去った政治家の記録と、達成した実績。セーブデータとは別に残る。</p>' +
      '<section class="panel"><h2>実績<small>' + n + ' / ' + Game.Data.ACHIEVEMENTS.length + '</small></h2><ul class="ach-grid">' + achHtml(hall) + '</ul></section>' +
      '<div class="setup-cols hall-cols">' +
        '<section class="panel"><h2>歴代の記録<small>点数の高い順に ' + Game.Balance.hall.maxRecords + '件まで</small></h2>' + recordsHtml(hall) + '</section>' +
        '<section class="panel"><h2>自己ベスト</h2>' + bestsHtml(hall) + '</section>' +
      '</div>' +
      '<div class="setup-btns"><button type="button" class="btn" id="clear"' + (hall.plays ? '' : ' disabled') + '>記録を消す</button>' +
      '<button type="button" class="btn btn-primary btn-lg" id="back">タイトルへ</button></div>' +
    '</div>';
    app.querySelector('#back').onclick = function () { Game.view = 'title'; Game.render(); };
    app.querySelector('#clear').onclick = function () {
      UI.modal('<h2>殿堂の記録を消す</h2><p>歴代の記録・実績・自己ベストをすべて消す。もとには戻せない。セーブデータ(つづきから)は消えない。</p>',
        [{ label: 'やめておく' }, { label: '消す', primary: true, onClick: function () { Game.clearHall(); render(app); } }]);
    };
  }

  // エンディングの画面の帯:歴代の何位か、新しく達成した実績
  function endingStrip(res) {
    if (!res) return '';
    const rank = res.rank ? '殿堂の歴代の記録で <b>' + res.rank + '位</b>' : '殿堂の歴代の記録には届かなかった';
    const newly = res.newly.map(function (id) {
      const a = Game.Data.ACHIEVEMENTS.filter(function (x) { return x.id === id; })[0];
      return '<li class="ach on">' + seal(a, true) + '<span class="ach-body"><b>' + a.title + '</b><small>' + a.desc + '</small></span></li>';
    }).join('');
    return '<section class="panel en-hall"><h2>殿堂<small>' + rank + '</small></h2>' +
      (newly ? '<p class="en-hall-lab">新しく達成した実績</p><ul class="ach-grid">' + newly + '</ul>' : '<p class="pr-note">今回は、新しく達成した実績はない。</p>') + '</section>';
  }

  return { render: render, endingStrip: endingStrip };
})();
