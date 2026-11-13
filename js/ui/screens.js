// タイトルと、立候補の準備(名前と政党を選ぶ)
window.Game = window.Game || {};

Game.Screens = (function () {
  const UI = Game.UI;
  let draft = { name: '相田 翔', party: 'minsei' };

  function renderTitle(app) {
    Game.Effects.Title.render(app, {
      hasSave: Game.hasSave(),
      onNew: function () { Game.view = 'setup'; Game.render(); },
      onContinue: function () { Game.continueGame(); },
      onLegacy: function () { location.href = 'legacy/index.html'; },
      note: '登場する政党・政治家・選挙区はすべて架空です',
    });
  }

  function renderSetup(app) {
    const P = Game.Data.PARTIES, D = Game.Data.DISTRICT;
    const roles = Game.Data.ROLES[draft.party];
    const rivals = Object.keys(roles).map(function (p) {
      const who = Game.Data.PEOPLE[p];
      return '<li>' + UI.partyChip({ party: p }) + ' <b>' + UI.esc(who.name) + '</b>(' + who.age + ')' +
        '<span class="sub">' + Game.Data.ROLE_NAMES[roles[p]] + '・「' + UI.esc(who.slogan) + '」</span></li>';
    }).join('');
    const C = Game.Balance.campaign;
    app.innerHTML =
      '<div class="setup">' +
        '<h1 class="page-title">立候補の準備</h1>' +
        '<p class="lead">' + UI.esc(D.name) + 'から衆議院選挙に立候補する。' + C.days + '日間の選挙戦で、現職たちを追い上げよう。</p>' +
        '<label class="field"><span>候補者名</span><input id="pname" type="text" maxlength="12" value="' + UI.esc(draft.name) + '"></label>' +
        '<h2 class="sec">どの党から出る?</h2>' +
        '<div class="party-grid">' + Object.keys(P).map(function (id) {
          const p = P[id];
          return '<button type="button" class="party-card' + (id === draft.party ? ' on' : '') + '" data-party="' + id + '" style="--pc:' + p.color + '" aria-pressed="' + (id === draft.party) + '">' +
            '<span class="pc-diff">' + p.difficulty + '</span>' +
            '<b class="pc-name">' + p.name + '</b><span class="pc-pos">' + p.position + '</span>' +
            '<span class="pc-desc">' + p.description + '</span></button>';
        }).join('') + '</div>' +
        '<div class="setup-cols">' +
          '<section class="panel"><h2>対立候補</h2><ul class="rival-list">' + rivals + '</ul></section>' +
          '<section class="panel"><h2>遊び方</h2><ol class="howto">' +
            '<li>毎朝、手札が' + C.handSize + '枚配られる。体力' + C.energy + 'のぶんだけカードを使える。</li>' +
            '<li>カードを選ぶと、どの地区でどれだけ伸びるかが地図に出る。地区を押すと使う。</li>' +
            '<li>相手の今日の動きは朝に予告される。「先回り遊説」や固い票で防げる。</li>' +
            '<li>「約束」のカードは強いが、約束は当選したあともついてくる。</li>' +
          '</ol></section>' +
        '</div>' +
        '<div class="setup-btns"><button type="button" class="btn" id="back">もどる</button>' +
        '<button type="button" class="btn btn-primary btn-lg" id="go">立候補する</button></div>' +
      '</div>';
    const input = app.querySelector('#pname');
    input.oninput = function () { draft.name = input.value; };
    app.querySelectorAll('.party-card').forEach(function (b) {
      b.onclick = function () { draft.party = b.dataset.party; renderSetup(app); };
    });
    app.querySelector('#back').onclick = function () { Game.view = 'title'; Game.render(); };
    app.querySelector('#go').onclick = function () {
      UI.sound('decide');
      Game.startNew((draft.name || '').trim() || '相田 翔', draft.party);
    };
  }

  return { renderTitle: renderTitle, renderSetup: renderSetup, draft: function () { return draft; } };
})();
