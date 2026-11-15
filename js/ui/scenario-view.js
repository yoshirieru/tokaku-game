// 史実シナリオ(R17)を選ぶ画面と、エンディングの画面に差し込む「シナリオの結末」の欄。
window.Game = window.Game || {};

Game.ScenarioView = (function () {
  const UI = Game.UI;
  let pick = null, customName = null;   // 名前の欄:書きかえるまで、そのシナリオの党首の実名
  const chip = function (x, k) { return '<span class="pchip" style="--pc:' + Game.Data.PARTIES[k].color + '">' + UI.esc(x.names[k].short) + '</span>'; };

  // 選挙前勢力の帯(3党)
  function seatBar(sc) {
    const P = Game.Data.PARTIES, total = Game.Balance.nation.seats, seats = sc.seats;
    return '<div class="scn-bar" aria-label="選挙前勢力">' + Object.keys(P).map(function (k) {
      return '<span style="flex:' + seats[k] + ' 1 0;--pc:' + P[k].color + '"><b>' + UI.esc(sc.names[k].short) + '</b>' + seats[k] + '</span>';
    }).join('') + '<i class="scn-maj" style="left:' + (Game.Balance.nation.majority / total * 100) + '%"></i></div>';
  }

  function render(app) {
    const list = Game.Data.SCENARIOS, P = Game.Data.PARTIES;
    if (!pick || !Game.Scenario.find(pick)) pick = list[0].id;
    const sc = Game.Scenario.find(pick);
    const cards = list.map(function (x) {
      const on = x.id === pick;
      return '<button type="button" class="scn-card' + (on ? ' on' : '') + '" data-id="' + x.id + '" aria-pressed="' + on + '" style="--pc:' + P[x.party].color + '">' +
        '<span class="scn-year">' + x.year + '</span><b class="scn-title">' + UI.esc(x.title) + '</b>' +
        '<span class="scn-role">' + chip(x, x.party) + ' ' + UI.esc(x.role) + '</span></button>';
    }).join('');
    const goals = sc.goals.map(function (g) { return '<li>' + UI.esc(g.text) + '</li>'; }).join('');
    app.innerHTML = '<div class="setup scenario">' +
      '<h1 class="page-title">史実シナリオ</h1>' +
      '<p class="lead">実際にあった総選挙の局面に、党首として立つ。歴史の一戦の結末を変えられるか。</p>' +
      '<div class="scn-grid">' + cards + '</div>' +
      '<section class="panel scn-detail">' +
        '<p class="m-kicker">' + UI.esc(sc.model) + '</p><h2>' + UI.esc(sc.title) + '</h2>' +
        '<p>' + UI.esc(sc.lead) + '</p>' +
        '<div class="scn-cols"><div><h3>選挙前勢力<small>(過半数 ' + Game.Balance.nation.majority + ')</small></h3>' + seatBar(sc) +
          '<p class="pr-note">' + '与党:' + UI.esc(sc.names[sc.gov.pm].short) + (sc.gov.partner ? '・' + UI.esc(sc.names[sc.gov.partner].short) : '') + (sc.gov.role === 'pm' ? '' : '(あなたは野党)') + '。内閣支持率 ' + sc.approval + '%。' +
          (sc.start === 'term' ? '任期の残り' + (Game.Balance.term.turns - sc.turn + 1) + '会期から始まる。' : 'いきなり総選挙から始まる。') + '</p></div>' +
        '<div><h3>目標</h3><ul class="scn-goals">' + goals + '</ul></div></div>' +
      '</section>' +
      '<p class="pr-note">各党は実名。議席は、その時期の主な3党の争いに置きかえた目安(ほかの党は近い党にまとめた)。実在の人物に、失言や不祥事の出来事は起こらない。</p>' +
      '<label class="field"><span>党首の名前</span><input id="pname" type="text" maxlength="12" value="' + UI.esc(customName != null ? customName : sc.person) + '"></label>' +
      '<div class="setup-btns"><button type="button" class="btn" id="back">もどる</button>' +
      '<button type="button" class="btn btn-primary btn-lg" id="go">このシナリオで始める</button></div>' +
      '</div>';
    const input = app.querySelector('#pname');
    input.oninput = function () { customName = input.value; };
    app.querySelectorAll('.scn-card').forEach(function (b) { b.onclick = function () { if (pick !== b.dataset.id) customName = null; pick = b.dataset.id; render(app); }; });
    app.querySelector('#back').onclick = function () { Game.view = 'setup'; Game.render(); };
    app.querySelector('#go').onclick = function () {
      UI.sound('decide');
      Game.startScenario((customName != null ? customName : sc.person).trim() || sc.person, pick);
    };
  }

  // エンディングの「シナリオの結末」
  function endingPanel(sx) {
    if (!sx) return '';
    const P = Game.Data.PARTIES;
    const goals = sx.goals.map(function (g) { return '<li class="' + (g.ok ? 'ok' : 'ng') + '"><span>' + (g.ok ? '達成' : '届かず') + '</span>' + UI.esc(g.text) + '</li>'; }).join('');
    const seats = sx.seats ? '<div class="scn-after">' + Object.keys(P).map(function (k) {
      const d = sx.seats[k] - (sx.before[k] || 0);
      return '<span>' + UI.partyChip({ party: k }) + ' <b>' + sx.seats[k] + '</b><small>(' + UI.signed(d) + ')</small></span>';
    }).join('') + '</div>' : '';
    return '<section class="panel scn-end"><h2>シナリオの結末<small>' + UI.esc(sx.model) + '</small></h2>' +
      '<ul class="scn-goals done">' + goals + '</ul>' + seats +
      '<p class="scn-history"><b>史実では</b>' + UI.esc(sx.history) + '</p></section>';
  }

  return { render: render, endingPanel: endingPanel };
})();
