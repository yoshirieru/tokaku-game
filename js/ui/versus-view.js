// 対戦モードの画面(R8):対戦の準備、手番の交代の画面、結果。選挙戦と開票特番は1人用の画面(campaign-view・count-view)をそのまま使う。
// 仕組みは js/engine/versus.js
window.Game = window.Game || {};

Game.VersusView = (function () {
  const UI = Game.UI, V = function () { return Game.Versus; };
  const num = function (n) { return Math.round(n).toLocaleString('ja-JP'); };
  let draft = { names: ['相田 翔', '早川 葵'], parties: ['minsei', 'kyowa'], seat: 'hokuyo3', handicap: true };

  // ---------- 対戦の準備 ----------
  function renderSetup(app) {
    const P = Game.Data.PARTIES, D = Game.Data.setHome(draft.seat);
    const seats = Game.Data.SEAT_ORDER.map(function (id) {
      const S = Game.Data.SEATS[id], on = id === draft.seat;
      return '<button type="button" class="seat-card' + (on ? ' on' : '') + '" data-seat="' + id + '" aria-pressed="' + on + '">' + Game.Screens.seatMap(S) +
        '<span class="sc-type">' + UI.esc(S.type) + '</span><b class="sc-name">' + UI.esc(S.name) + '</b><span class="sc-block">' + UI.esc(S.block) + '</span></button>';
    }).join('');
    const third = Object.keys(P).filter(function (k) { return draft.parties.indexOf(k) < 0; })[0];
    const roleA = D.roles[draft.parties[0]][third], roleB = D.roles[draft.parties[1]][third];
    const aiRole = Game.Balance.roles[roleA].mult >= Game.Balance.roles[roleB].mult ? roleA : roleB;
    const player = function (i) {
      return '<section class="panel vs-player"><h2><span class="vs-tag">' + (i ? '2P' : '1P') + '</span>' + (i ? '後手から' : '先手から') + '</h2>' +
        '<label class="field"><span>候補者名</span><input class="vs-name" data-i="' + i + '" type="text" maxlength="12" value="' + UI.esc(draft.names[i]) + '"></label>' +
        '<div class="vs-parties">' + Object.keys(P).map(function (id) {
          const on = draft.parties[i] === id;
          return '<button type="button" class="vs-party' + (on ? ' on' : '') + '" data-i="' + i + '" data-party="' + id + '" style="--pc:' + P[id].color + '" aria-pressed="' + on + '">' + P[id].name + '</button>';
        }).join('') + '</div></section>';
    };
    app.innerHTML = '<div class="setup vs-setup">' +
      '<h1 class="page-title">2人で対戦</h1>' +
      '<p class="lead">1台の画面で、2人が交互に操作する。同じ選挙区で、別々の党の新人として8日間を戦い、<b>票の多いほうの勝ち</b>。3人目の候補(残りの党)はコンピューターが動かす。</p>' +
      '<div class="setup-cols vs-players">' + player(0) + player(1) + '</div>' +
      '<h2 class="sec">どこで戦う?</h2><div class="seat-grid">' + seats + '</div>' +
      '<p class="seat-info"><b>' + UI.esc(D.name) + '</b><span class="sub">3人目:' + P[third].short + 'の' + Game.Data.ROLE_NAMES[aiRole] + '・' + UI.esc(D.people[third].name) + '</span>' + UI.esc(D.summary) + '</p>' +
      '<label class="vs-check"><input type="checkbox" id="handicap"' + (draft.handicap ? ' checked' : '') + '><span><b>ハンデをつける</b>(おすすめ)始まりの見込みの票が少ないほうに支持を足して、2人をそろえる。選挙区と党の組み合わせで、最初から大きな差がつかないようにする。</span></label>' +
      '<section class="panel"><h2>対戦の決まり</h2><ol class="howto">' +
        '<li>毎日、2人が順番にカードを使う。先手は1日ごとに入れ替わる。交代の画面が出たら、もう1人は画面を見ない。</li>' +
        '<li>相手が使ったカードは、交代の画面と地図で分かる。公開討論会では、相手を追及することもできる。</li>' +
        '<li>コンピューターの候補は、1人用と同じように朝に動きを予告する。「先回り遊説」と固い票は、どちらが使っても効く。</li>' +
        '<li>議席は3人で争う。2人とも落選しても、票の多いほうが対戦の勝ち。</li>' +
      '</ol></section>' +
      '<div class="setup-btns"><button type="button" class="btn" id="back">もどる</button>' +
      '<button type="button" class="btn btn-primary btn-lg" id="go">対戦を始める</button></div>' +
    '</div>';
    app.querySelectorAll('.vs-name').forEach(function (inp) { inp.oninput = function () { draft.names[+inp.dataset.i] = inp.value; }; });
    app.querySelectorAll('.vs-party').forEach(function (b) {
      b.onclick = function () {
        const i = +b.dataset.i, o = 1 - i;
        if (draft.parties[o] === b.dataset.party) draft.parties[o] = draft.parties[i];   // 相手と同じ党を選んだら、入れ替える
        draft.parties[i] = b.dataset.party;
        renderSetup(app);
      };
    });
    app.querySelectorAll('.seat-card').forEach(function (b) { b.onclick = function () { draft.seat = b.dataset.seat; renderSetup(app); }; });
    app.querySelector('#handicap').onchange = function (e) { draft.handicap = e.target.checked; };
    app.querySelector('#back').onclick = function () { Game.view = 'title'; Game.render(); };
    app.querySelector('#go').onclick = function () {
      UI.sound('decide');
      const names = draft.names.map(function (n, i) { return (n || '').trim() || (i ? '早川 葵' : '相田 翔'); });
      Game.startVersus({ seat: draft.seat, handicap: draft.handicap, players: [{ name: names[0], party: draft.parties[0] }, { name: names[1], party: draft.parties[1] }] });
    };
  }

  // ---------- 手番の交代 ----------
  function renderHandoff(app) {
    const s = Game.state, camp = s.camp, vs = camp.vs, a = vs.active, o = 1 - a;
    const P = Game.Data.PARTIES;
    const me = Game.Campaign.cand(camp, 'me');
    const log = vs.log.filter(function (l) { return l.who === o; });
    const firstTurn = camp.day === 1 && !vs.done[o];
    const handi = vs.handicap && camp.day === 1 && vs.handicap.pts > 0 && !vs.done[0] && !vs.done[1]
      ? '<p class="pr-note">ハンデ:' + UI.esc(vs.names[vs.handicap.slot]) + 'さんの始まりの支持に、全地区 +' + vs.handicap.pts + '。</p>' : '';
    app.innerHTML = '<div class="handoff">' +
      '<div class="panel ho-card">' +
        '<p class="m-kicker">' + camp.day + '日目 ・ ' + (vs.done[o] ? '後手' : '先手') + '</p>' +
        '<h1><span class="vs-tag">' + me.tag + '</span>' + UI.esc(vs.names[a]) + 'さんの番</h1>' +
        '<p class="ho-party">' + UI.partyChip(me) + ' ' + P[vs.parties[a]].name + '</p>' +
        '<p class="ho-hide">' + UI.esc(vs.names[o]) + 'さんは、画面を見ないでください。</p>' +
        (log.length ? '<div class="ho-log"><h2>' + UI.esc(vs.names[o]) + 'さんが今日したこと</h2><ul>' + log.map(function (l) { return '<li>' + UI.esc(l.msg) + '</li>'; }).join('') + '</ul></div>'
          : vs.done[o] ? '<p class="pr-note">' + UI.esc(vs.names[o]) + 'さんは、今日はカードを使わなかった。</p>' : firstTurn ? '' : '') +
        handi +
        '<button type="button" class="btn btn-primary btn-lg" id="start">' + UI.esc(vs.names[a]) + 'さんの番を始める</button>' +
      '</div></div>';
    app.querySelector('#start').onclick = function () {
      UI.sound('decide');
      V().beginTurn(s);
      Game.clearUndo();
      Game.save();
      Game.render();
    };
  }

  // ---------- 結果 ----------
  function renderResult(app) {
    const s = Game.state, e = s.election, camp = s.camp, vs = camp.vs;
    const out = V().outcome(s), cands = camp.cands;
    const byId = function (id) { return Game.Campaign.cand(camp, id); };
    const w = byId(e.winner);
    const seatLine = out.seat >= 0 ? (out.seat === out.slot ? '議席も手にした。' : '議席は' + UI.esc(vs.names[out.seat]) + 'さんが取ったが、票で上回った。')
      : '議席は' + UI.esc(w.name) + '氏(' + Game.Data.PARTIES[w.party].short + ')に取られた。2人のうちでは、票で上回った。';
    const rows = e.order.map(function (id, i) {
      const c = byId(id);
      return '<div class="rs-row' + (c.human ? ' me' : '') + '" style="--pc:' + UI.color(c) + '"><span class="rs-mark">' + (i === 0 ? '当' : '') + '</span>' +
        UI.partyChip(c) + '<b>' + UI.esc(c.name) + '</b><span class="sub">' + (c.human ? c.tag : 'コンピューター') + '</span>' +
        '<span class="rs-votes">' + num(e.totals[id]) + '票</span><span class="rs-pct">' + (e.totals[id] / e.total * 100).toFixed(1) + '%</span></div>';
    }).join('');
    const fill = function (rid) { return UI.leadFill(cands, e.regions[rid].votes); };
    const pins = Game.Data.DISTRICT.regions.map(function (r) {
      const v = e.regions[r.id].votes;
      const top = Object.keys(v).sort(function (a, b) { return v[b] - v[a]; })[0];
      const sum = Object.keys(v).reduce(function (a, k) { return a + v[k]; }, 0);
      return '<div class="pin static" data-id="' + r.id + '" style="left:' + r.x + '%;top:' + r.y + '%"><b>' + r.name + '</b>' +
        '<span class="mk">' + UI.esc(byId(top).short) + '</span><span class="ct-open">1P ' + (v.me / sum * 100).toFixed(0) + '%・2P ' + (v.vs / sum * 100).toFixed(0) + '%</span></div>';
    }).join('');
    app.innerHTML = '<div class="result">' +
      '<header class="rs-head won">' + (e.resultSeen ? '' : '<span class="stamp big new">勝利</span>') + '<h1><span class="vs-tag">' + (out.slot ? '2P' : '1P') + '</span>' + UI.esc(out.name) + 'さんの勝ち</h1>' +
      '<p>' + num(out.gap) + '票差。' + seatLine + '</p></header>' +
      '<div class="rs-body"><div class="rs-left"><section class="panel"><h2>開票結果<small>' + UI.esc(Game.Data.DISTRICT.name) + '</small></h2>' + rows + '</section></div>' +
      '<div class="map-cell">' + UI.mapHtml(fill, null) + '</div></div>' +
      '<footer class="ct-btns"><button type="button" class="btn" id="title">タイトルへ</button>' +
      '<button type="button" class="btn" id="setup">準備にもどる</button>' +
      '<button type="button" class="btn btn-primary btn-lg" id="again">もう一度(先手を入れ替えて)</button></footer></div>';
    app.querySelector('#pins').innerHTML = pins;
    if (!e.resultSeen) UI.sound('stamp');
    e.resultSeen = true;
    Game.save();
    app.querySelector('#title').onclick = Game.toTitle;
    app.querySelector('#setup').onclick = function () {
      draft = { names: vs.names.slice(), parties: vs.parties.slice(), seat: s.player.seat, handicap: !!vs.handicap };
      Game.state = null; Game.view = 'versus'; Game.render();
    };
    app.querySelector('#again').onclick = function () {
      UI.sound('decide');
      V().rematch(s);
      Game.clearUndo(); Game.ui = { card: null };
      Game.save(); Game.render();
    };
  }

  return { renderSetup: renderSetup, renderHandoff: renderHandoff, renderResult: renderResult };
})();
