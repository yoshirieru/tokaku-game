// タイトルと、立候補の準備(名前・選挙区・政党を選ぶ)
window.Game = window.Game || {};

Game.Screens = (function () {
  const UI = Game.UI;
  let draft = { name: '相田 翔', party: 'minsei', seat: 'hokuyo3' };

  function renderTitle(app) {
    Game.Effects.Title.render(app, {
      hasSave: Game.hasSave(),
      // はじめから・2人で対戦・つづきからは、まずセーブの枠を選ぶ
      onNew: function () { Game.slotMode = 'new'; Game.view = 'slots'; Game.render(); },
      onContinue: function () { Game.slotMode = 'load'; Game.view = 'slots'; Game.render(); },
      onHall: function () { Game.view = 'hall'; Game.render(); },
      onVersus: function () { Game.slotMode = 'versus'; Game.view = 'slots'; Game.render(); },
      onLegacy: function () { location.href = 'legacy/index.html'; },
      note: '登場する政党・政治家・選挙区はすべて架空です',
    });
  }

  // ---------- セーブの枠を選ぶ(はじめから・2人で対戦・つづきから)----------
  // 枠の中身のひとこと:名前・党・選挙区と、いまどこまで進んだか
  function slotInfo(s) {
    const D = Game.Data, cr = s.career, sc = s.scenario ? Game.Scenario.find(s.scenario.id) : null;
    const partyName = function (p) {
      if (cr && cr.np && p === 'shinto') return cr.np.short;
      if (sc && sc.names && sc.names[p]) return sc.names[p].short;
      return D.PARTIES[p] ? D.PARTIES[p].short : '';
    };
    const seat = D.SEATS[s.player.seat] ? D.SEATS[s.player.seat].name : '';
    let who = UI.esc(s.player.name || '') + '<small>' + UI.esc(partyName(s.player.party)) + (seat ? '・' + seat : '') + '</small>';
    let where;
    if (s.mode === 'versus') {
      who = UI.esc((s.camp && s.camp.vs ? s.camp.vs.names.join(' 対 ') : s.player.name) || '') + '<small>' + seat + '</small>';
      where = '2人で対戦';
    } else if (s.screen === 'ending') where = 'エンディング' + (s.ending && s.ending.grade ? '・評価 ' + s.ending.grade : '');
    else if (sc) where = '史実シナリオ「' + sc.title + '」';
    else if (cr && cr.leader) where = '党首' + (cr.gov ? '(' + { pm: '首相', junior: '連立与党', opposition: '野党' }[cr.gov.role] + ')' : '');
    else if (cr) where = (cr.status === 'ronin' ? '浪人' : Game.Balance.ranks[cr.rank || 0].name) + '・当選' + (cr.wins || 0) + '回';
    else where = '新人';
    const step = s.screen === 'campaign' && s.camp ? '選挙戦 ' + s.camp.day + '日目'
      : s.screen === 'term' && cr ? (cr.status === 'ronin' ? '浪人中' : '任期 ' + D.sessionName(cr.turn || 1))
        : s.screen === 'count' || s.screen === 'result' ? '開票' : s.screen === 'coalition' ? '政権づくり' : '';
    return { who: who, where: where + (step ? '・' + step : '') };
  }
  function slotDate(t) {
    if (!t) return '';
    const d = new Date(t), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function renderSlots(app) {
    const mode = Game.slotMode, load = mode === 'load', list = Game.listSaves();
    if (load && !list.some(function (x) { return x.state; })) { Game.view = 'title'; return Game.render(); }
    const rows = list.map(function (x) {
      const s = x.state, info = s ? slotInfo(s) : null;
      return '<li class="slot' + (s ? '' : ' empty') + '">' +
        '<button type="button" class="slot-pick" data-n="' + x.slot + '"' + (load && !s ? ' disabled' : '') + '>' +
          '<span class="slot-no">' + x.slot + '</span>' +
          (s ? '<span class="slot-body"><b>' + info.who + '</b><span>' + UI.esc(info.where) + '</span></span><span class="slot-date">' + slotDate(s.savedAt) + '</span>'
            : '<span class="slot-body"><b class="slot-none">空き</b><span>' + (load ? '記録はない' : 'ここに新しく記録する') + '</span></span>') +
        '</button>' +
        (s ? '<button type="button" class="slot-del" data-del="' + x.slot + '" aria-label="枠' + x.slot + 'の記録を消す">消す</button>' : '') +
        '</li>';
    }).join('');
    const head = load ? 'つづきから' : mode === 'versus' ? '2人で対戦:記録する枠' : 'はじめから:記録する枠';
    const lead = load ? 'つづきから遊ぶ記録を選ぶ。' : '新しいゲームを記録する枠を選ぶ。記録のある枠を選ぶと、ゲームを始めたときに上書きされる。';
    app.innerHTML = '<div class="setup slots">' +
      '<h1 class="page-title">' + head + '</h1><p class="lead">' + lead + '(セーブの枠は ' + list.length + 'つ。殿堂の記録は枠と別に残る)</p>' +
      '<ul class="slot-list">' + rows + '</ul>' +
      '<div class="setup-btns"><button type="button" class="btn btn-primary btn-lg" id="back">もどる</button></div></div>';
    app.querySelector('#back').onclick = function () { Game.view = 'title'; Game.render(); };
    const go = function (n) {
      Game.slot = n;
      if (load) return Game.continueGame(n);
      Game.view = mode === 'versus' ? 'versus' : 'setup';
      Game.render();
    };
    app.querySelectorAll('.slot-pick').forEach(function (b) {
      b.onclick = function () {
        const n = +b.dataset.n, x = list[n - 1];
        UI.sound('decide');
        if (load || !x.state) return go(n);
        UI.modal('<h2>枠' + n + 'に記録しなおす</h2><p>枠' + n + 'には「' + slotInfo(x.state).who.replace(/<[^>]+>/g, ' ') + '」の記録がある。新しいゲームを始めると、この記録は消える(準備の画面でもどれば残る)。</p>',
          [{ label: 'やめておく' }, { label: 'この枠で始める', primary: true, onClick: function () { go(n); } }]);
      };
    });
    app.querySelectorAll('.slot-del').forEach(function (b) {
      b.onclick = function () {
        const n = +b.dataset.del;
        UI.modal('<h2>枠' + n + 'の記録を消す</h2><p>この記録は消えて、もとには戻せない。殿堂の記録は消えない。</p>',
          [{ label: 'やめておく' }, { label: '消す', primary: true, onClick: function () { Game.deleteSave(n); renderSlots(app); } }]);
      };
    });
  }

  // 選挙区の小さな地図。地区は、党の地力がいちばん強い党の色
  function seatMap(S) {
    const base = Game.Balance.seats[S.id].base;
    const polys = S.regions.map(function (r) {
      const b = base[r.id], top = Object.keys(b).sort(function (x, y) { return b[y] - b[x]; })[0];
      return '<polygon class="rg" points="' + r.pts + '" style="--lead:' + Game.Data.PARTIES[top].color + ';--mix:50%"/>';
    }).join('');
    return '<svg class="seat-map" viewBox="0 0 600 430" aria-hidden="true"><rect class="outland" x="-900" y="-600" width="2400" height="1630"/>' +
      '<polygon class="sea" points="' + S.seaPts + '"/>' + polys + '</svg>';
  }
  // 相手の顔ぶれ(党の札に出す)
  function matchup(S, party) {
    const roles = S.roles[party];
    return '相手は ' + Object.keys(roles).map(function (p) {
      return Game.Data.PARTIES[p].short + 'の' + Game.Data.ROLE_NAMES[roles[p]] + '・' + S.people[p].short;
    }).join('、') + '。';
  }

  // 選挙区の小さな地図は、対戦の準備の画面でも使う(seatMap)
  function renderSetup(app) {
    const D = Game.Data.setHome(draft.seat);
    const P = Game.Data.PARTIES, guide = Game.Balance.seats[D.id].guide;
    const roles = D.roles[draft.party];
    const voters = D.regions.reduce(function (a, r) { return a + r.voters; }, 0);
    const seats = Game.Data.SEAT_ORDER.map(function (id) {
      const S = Game.Data.SEATS[id], on = id === D.id;
      return '<button type="button" class="seat-card' + (on ? ' on' : '') + '" data-seat="' + id + '" aria-pressed="' + on + '">' + seatMap(S) +
        '<span class="sc-type">' + UI.esc(S.type) + '</span><b class="sc-name">' + UI.esc(S.name) + '</b><span class="sc-block">' + UI.esc(S.block) + '</span></button>';
    }).join('');
    const rivals = Object.keys(roles).map(function (p) {
      const who = D.people[p];
      return '<li>' + UI.partyChip({ party: p }) + ' <b>' + UI.esc(who.name) + '</b>(' + who.age + ')' +
        '<span class="sub">' + Game.Data.ROLE_NAMES[roles[p]] + '・「' + UI.esc(who.slogan) + '」</span></li>';
    }).join('');
    const C = Game.Balance.campaign;
    app.innerHTML =
      '<div class="setup">' +
        '<h1 class="page-title">立候補の準備</h1>' +
        '<p class="lead">衆議院選挙に、新人として立候補する。' + C.days + '日間の選挙戦で、現職たちを追い上げよう。</p>' +
        '<label class="field"><span>候補者名</span><input id="pname" type="text" maxlength="12" value="' + UI.esc(draft.name) + '"></label>' +
        '<h2 class="sec">どこから出る?</h2>' +
        '<div class="seat-grid">' + seats + '</div>' +
        '<p class="seat-info"><b>' + UI.esc(D.name) + '</b><span class="sub">' + UI.esc(D.block) + '・有権者 ' + Math.round(voters / 10000) + '万人</span>' + UI.esc(D.summary) +
        '<span class="seat-regions">' + D.regions.map(function (r) { return UI.esc(r.name); }).join('・') + '</span></p>' +
        '<h2 class="sec">どの党から出る?</h2>' +
        '<div class="party-grid">' + Object.keys(P).map(function (id) {
          const p = P[id];
          return '<button type="button" class="party-card' + (id === draft.party ? ' on' : '') + '" data-party="' + id + '" style="--pc:' + p.color + '" aria-pressed="' + (id === draft.party) + '">' +
            '<span class="pc-diff">' + Game.Data.seatLevel(guide[id]) + '</span>' +
            '<b class="pc-name">' + p.name + '</b><span class="pc-pos">' + p.position + '</span>' +
            '<span class="pc-desc">' + p.description + UI.esc(matchup(D, id)) + '</span></button>';
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
        '<p class="quick-note">近道:議員の時代をとばして、この党の<b>党首</b>として全国の総選挙から始めることもできる。' +
        '<button type="button" class="btn" id="quick">党首として総選挙から</button></p>' +
        '<p class="quick-note">史実シナリオ:実際にあった総選挙の局面に、実在の党の党首として立つ。<button type="button" class="btn" id="scenario">史実シナリオ</button></p>' +
        '<div class="setup-btns"><button type="button" class="btn" id="back">もどる</button>' +
        '<button type="button" class="btn btn-primary btn-lg" id="go">立候補する</button></div>' +
      '</div>';
    const input = app.querySelector('#pname');
    input.oninput = function () { draft.name = input.value; };
    app.querySelectorAll('.party-card').forEach(function (b) {
      b.onclick = function () { draft.party = b.dataset.party; renderSetup(app); };
    });
    app.querySelectorAll('.seat-card').forEach(function (b) {
      b.onclick = function () { draft.seat = b.dataset.seat; renderSetup(app); };
    });
    app.querySelector('#back').onclick = function () { Game.view = 'title'; Game.render(); };
    app.querySelector('#quick').onclick = function () {
      UI.sound('decide');
      Game.startLeader((draft.name || '').trim() || '相田 翔', draft.party, draft.seat);
    };
    app.querySelector('#scenario').onclick = function () { UI.sound('decide'); Game.view = 'scenario'; Game.render(); };
    app.querySelector('#go').onclick = function () {
      UI.sound('decide');
      Game.startNew((draft.name || '').trim() || '相田 翔', draft.party, draft.seat);
    };
  }

  return { renderTitle: renderTitle, renderSlots: renderSlots, renderSetup: renderSetup, seatMap: seatMap, draft: function () { return draft; } };
})();
