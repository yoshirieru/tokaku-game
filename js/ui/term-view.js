// 議員の任期(と浪人)の画面:上の帯、解散風、地盤の地図、右の列(約束・次の選挙への備え・地区)、手札。
// 骨組みと部品のクラスは選挙戦の画面(campaign-view.js)と同じものを使う。
window.Game = window.Game || {};

Game.TermView = (function () {
  const UI = Game.UI, K = Game.Career;
  let pendingFx = [];

  const pips = function (n, max, cls) {
    let h = '';
    for (let i = 0; i < max; i++) h += '<i class="' + cls + (i < n ? ' on' : '') + '"></i>';
    return h;
  };
  const P = function (id) { return Game.Data.PROMISES[id]; };
  const ROLE_TEXT = { incumbent: '現職として', former: '元職として', newcomer: '新人として' };

  // ---------- 部品 ----------
  function hudHtml(s) {
    const cr = s.career, T = Game.Balance.term;
    let dots = '';
    for (let t = 1; t <= T.turns; t++) {
      const cls = t < cr.turn ? 'done' : t === cr.turn ? 'now' : 'todo';
      dots += '<li class="' + cls + '" title="' + Game.Data.sessionName(t) + '"' + (t === cr.turn ? ' aria-current="true"' : '') + '>' + t + '</li>';
    }
    const me = { party: s.player.party };
    return '<header class="hud panel">' +
      '<div class="who"><span class="seat">' + UI.esc(Game.Data.DISTRICT.name) + '</span>' + UI.partyChip(me) + '<b class="pname">' + UI.esc(s.player.name) + '</b>' +
      '<span class="hud-badge">' + (cr.status === 'member' ? '当選' + cr.wins + '回' : '浪人中') + '</span></div>' +
      '<ol class="days" aria-label="任期の会期">' + dots + '</ol>' +
      '<div class="res"><span class="lab">資金</span><b>' + cr.money + '</b><small>万円</small></div>' +
      '<div class="ticker"><span class="tk-lab">' + UI.esc(Game.Data.sessionName(cr.turn)) + '</span><span id="news">' + UI.esc(cr.news) + '</span></div>' +
      '<button type="button" class="icon-btn" id="menu" aria-label="メニュー">' + UI.icon('menu') + '</button>' +
      '</header>';
  }
  function windHtml(cr) {
    const T = Game.Balance.term, pct = Math.round(K.dissolveChance(cr) * 100), left = T.turns - cr.turn;
    const text = cr.turn >= T.turns ? 'この会期で<b>任期満了</b>。総選挙になる'
      : pct ? 'この会期のあとに解散する見込み <b>' + pct + '%</b>' : '選挙の直後。この会期のあとの解散は<b>ない</b>';
    return '<section class="race panel wind" aria-label="解散風"><span class="race-lab">解散風</span>' +
      '<div class="wind-bar"><i style="width:' + pct + '%"></i></div>' +
      '<span class="wind-text">' + text + '</span><span class="wind-left">' + (left > 0 ? '任期満了まで あと' + left + '会期' : '') + '</span></section>';
  }
  function pinsHtml(cr, sel, kind) {
    const max = Game.Balance.comeback.baseMax;
    return Game.Data.DISTRICT.regions.map(function (r) {
      const n = cr.base[r.id] || 0;
      let pred = '';
      if (sel && kind === 'region') {
        const g = K.baseGain(cr, sel.id, r.id);
        pred = g > 0 ? '<span class="pred">+' + g + '</span>' : '<span class="pred half">上限</span>';
      }
      return '<button type="button" class="pin' + (r.id === cr.sel ? ' sel' : '') + '" data-id="' + r.id + '" style="left:' + r.x + '%;top:' + r.y + '%">' +
        '<b>' + r.name + '</b><span class="mk">地盤 ' + n + '</span><span class="base-pips">' + pips(n, max, 'bp') + '</span>' + pred + '</button>';
    }).join('');
  }
  function sideHtml(s, sel, kind) {
    const cr = s.career, T = Game.Balance.term, CB = Game.Balance.comeback;
    // 約束
    let pr;
    if (cr.status !== 'member') {
      pr = '<p class="pr-note">浪人中は国会で動けない。地元を回り、資金を集めて、次の選挙に備える。</p>';
    } else {
      const open = cr.promises.map(function (p) {
        const safe = p.turns < T.graceTurns;
        const tag = safe ? '<span class="pr-tag safe">いま解散なら持ち越し</span>'
          : p.progress > 0 ? '<span class="pr-tag warn">途中まで</span>' : '<span class="pr-tag bad">手つかず</span>';
        const add = sel && kind === 'promise' ? '<span class="pred">+' + T.cards[sel.id].promise + '</span>' : '';
        return '<button type="button" class="pr-item' + (sel && kind === 'promise' ? ' pick' : '') + '" data-promise="' + p.id + '">' +
          '<span class="pr-dot">約</span><span class="pr-body"><b>' + P(p.id).policy + '</b><small>' + P(p.id).org + '・' + Game.Data.REGION[P(p.id).region].name + '</small></span>' +
          '<span class="pr-prog">' + pips(p.progress, T.promiseGoal, 'pp') + '</span>' + tag + add + '</button>';
      }).join('');
      const kept = cr.next.endorse.map(function (id) {
        return '<div class="pr-line kept"><span class="pr-dot ok">済</span><span><b>' + P(id).policy + '</b>(' + P(id).org + ')→ 次の選挙で推薦</span></div>';
      }).join('');
      pr = (open || kept) ? open + kept : '<p class="pr-note">いま果たすべき約束はない。</p>';
      if (cr.promises.length) pr += '<p class="pr-note">「委員会質問」「議員立法」で進める。手つかずのまま解散すると、次の選挙で「破った約束」として返ってくる。</p>';
    }
    const promises = '<section class="panel" id="promises"><h2>約束<small>' + (cr.status === 'member' ? '守った ' + cr.kept + '・破った ' + cr.broken : '') + '</small></h2>' + pr + '</section>';

    // 次の選挙への備え
    const stars = K.extraStars(cr), toNext = CB.starPer - (cr.contrib % CB.starPer);
    const baseSum = Game.Data.DISTRICT.regions.reduce(function (a, r) { return a + (cr.base[r.id] || 0); }, 0);
    const prep = '<section class="panel" id="prep"><h2>次の選挙への備え<small>' + ROLE_TEXT[cr.role] + '戦う</small></h2>' +
      '<div class="prep-row"><span>地盤の合計</span><b>' + baseSum + '</b><small>始まりの支持に、地区ごとに足される</small></div>' +
      '<div class="prep-row"><span>推薦のカード</span><b>' + cr.next.endorse.length + '枚</b><small>守った約束の数</small></div>' +
      '<div class="prep-row"><span>党幹部の応援</span><b>' + (1 + stars) + '枚</b><small>' +
      (stars >= CB.starExtraMax ? 'これ以上は増えない' : '党への貢献 ' + cr.contrib + '(あと' + toNext + 'で +1枚)') + '</small></div>' +
      '<div class="prep-row"><span>持ち込む資金</span><b>' + Math.min(CB.moneyCarryMax, cr.money) + '万円</b><small>上限 ' + CB.moneyCarryMax + '万円</small></div></section>';

    // 地区
    const r = Game.Data.REGION[cr.sel], n = cr.base[r.id] || 0;
    const tags = r.tags.map(function (t) { return '<span class="tag-chip">' + Game.Data.TAGS[t] + '</span>'; }).join('');
    const detail = '<section class="panel" id="detail"><div class="d-head"><h2>' + r.name + '</h2><span class="mk">地盤 ' + n + ' / ' + CB.baseMax + '</span>' +
      '<span class="voters">前回の得票率 ' + Math.round(cr.lastShare[r.id]) + '%</span></div><p class="d-desc">' + r.desc + '</p><div class="tags">' + tags + '</div></section>';
    return promises + prep + detail;
  }
  function handHtml(cr, sel, kind) {
    const T = Game.Balance.term;
    const cards = cr.hand.map(function (c) {
      const d = Game.Data.TERM_CARDS[c.id], b = T.cards[c.id], t = Game.Data.termCardText(c.id);
      let cost = '';
      for (let i = 0; i < b.cost; i++) cost += '<i></i>';
      const money = b.money > 0 ? '資金 ' + b.money + '万円' : b.money < 0 ? '' : '資金いらず';
      return '<button type="button" class="card' + (sel && sel.uid === c.uid ? ' sel' : '') + (K.canPlay(cr, c.id).ok ? '' : ' off') + '" data-type="' + d.type + '" data-uid="' + c.uid + '">' +
        '<span class="c-top"><span class="c-icon">' + UI.icon(d.icon) + '</span><span class="c-type">' + Game.Data.CARD_TYPES[d.type] + '</span>' +
        '<span class="c-cost" title="体力 ' + b.cost + '">' + cost + '</span></span>' +
        '<b class="c-name">' + d.name + '</b><span class="c-fx">' + t.fx + '</span><span class="c-note">' + t.note + '</span><span class="c-money">' + money + '</span></button>';
    }).join('');
    let prompt;
    if (!sel) {
      prompt = cr.hand.some(function (c) { return K.canPlay(cr, c.id).ok; }) ? 'カードを選ぶ。約束を進めるか、地元を固めるか、党で働くか。' : 'この会期はここまで。会期を終えよう。';
    } else if (kind === 'promise') {
      prompt = '<b>「' + Game.Data.TERM_CARDS[sel.id].name + '」</b>で進める約束を、右の欄から選ぶ。';
    } else if (kind === 'region') {
      prompt = '<b>「' + Game.Data.TERM_CARDS[sel.id].name + '」</b>で回る地区を地図で選ぶ。';
    } else {
      prompt = '<b>「' + Game.Data.TERM_CARDS[sel.id].name + '」</b><button type="button" class="btn-go" id="playNow">使う</button>';
    }
    return '<footer class="hand"><div class="turn panel">' +
      '<div class="energy"><span class="e-lab">この会期の体力</span><span class="pips">' + pips(cr.energy, T.energy, 'pip') + '</span><span class="deck-n">山札 ' + cr.deck.length + '・捨て札 ' + cr.discard.length + '</span></div>' +
      '<div class="prompt" id="prompt">' + prompt + '</div>' +
      '<div class="turn-btns"><button type="button" class="btn btn-undo" id="undo"' + (Game.canUndo() ? '' : ' disabled') + '>' + UI.icon('undo') + '<span>取り消す</span></button>' +
      '<button type="button" class="btn-main" id="endTurn">会期を終える</button></div>' +
      '</div><div class="cards" id="cards" aria-label="手札">' + cards + '</div></footer>';
  }

  // ---------- 知らせ ----------
  function showPending(app) {
    const s = Game.state, cr = s.career, p = cr.pending[0], T = Game.Balance.term;
    const next = function () { K.dismiss(s); Game.save(); render(app); };
    if (p.type === 'start') {
      if (cr.status === 'member') {
        const list = cr.promises.length ? '<ul class="m-list">' + cr.promises.map(function (x) {
          return '<li><b>' + P(x.id).policy + '</b>(' + P(x.id).org + ')' + (x.progress ? ' — 前の任期からの持ち越し' : '') + '</li>';
        }).join('') + '</ul>' : '<p>背負っている約束はない。地元と党のために動ける。</p>';
        UI.modal('<p class="m-kicker">' + (cr.wins === 1 ? '初登院' : cr.wins + '回目の当選') + '</p><h2>議員の任期が始まる</h2>' +
          '<p>選挙で背負った約束を、この任期のうちに果たす。</p>' + list +
          '<ul class="m-list"><li>1会期(半年)に体力は' + T.energy + '。会期の終わりに、上の帯の見込みで衆議院が解散する。</li>' +
          '<li>約束してから' + T.graceTurns + '会期たたないうちの解散なら、破ったことにはならず持ち越せる。</li></ul>',
          [{ label: '国会へ', primary: true, onClick: next }]);
      } else {
        UI.modal('<p class="m-kicker">浪人</p><h2>次の選挙をめざす</h2>' +
          '<p>議席には届かなかった。' + (cr.dropped ? '背負った約束は白紙に戻った。' : '') + '次の解散まで、地元を歩いて地盤を固め、資金を集める。</p>' +
          '<ul class="m-list"><li>浪人中は国会で動けない(約束を進めるカードは出ない)。</li><li>解散の見込みは、上の帯に出ている。</li></ul>',
          [{ label: '地元へ', primary: true, onClick: next }]);
      }
    } else if (p.type === 'petition') {
      const q = P(p.id), E = T.events.petition, reg = Game.Data.REGION[q.region].name;
      const answer = function (yes) { return function () { const r = K.respond(s, yes); Game.clearUndo(); pendingFx = r.fx; Game.save(); render(app); }; };
      UI.modal('<p class="m-kicker">' + UI.esc(Game.Data.sessionName(cr.turn)) + '・要望</p><h2>' + q.org + 'が訪ねてきた</h2>' +
        '<p>「<b>' + q.policy + '</b>を、あなたの手で進めてほしい」。' + reg + 'に根を張る団体だ。</p>',
        [
          { label: '<b>約束する</b><span>' + reg + 'の地盤 +' + E.base + '。新しい約束を背負う</span>', onClick: answer(true) },
          { label: '<b>断る</b><span>' + reg + 'の地盤 ' + E.refuse + '。できない約束はしない</span>', onClick: answer(false) },
        ], 'choices');
    } else if (p.type === 'dissolve') {
      const lines = p.lines.length ? '<ul class="m-lines">' + p.lines.map(function (l) { return '<li class="ml-' + l.kind + '">' + UI.esc(l.text) + '</li>'; }).join('') + '</ul>'
        : '<p>背負った約束は残っていない。</p>';
      UI.modal('<p class="m-kicker">' + UI.esc(p.session) + '</p><h2>' + (p.full ? '任期満了' : '衆議院解散') + '</h2>' +
        '<p>' + (p.full ? '4年の任期が終わった。総選挙が行われる。' : '首相が衆議院を解散した。総選挙が始まる。') + '</p>' + lines +
        (p.stars ? '<p>党への貢献が認められ、党幹部の応援が ' + p.stars + '枚 増える。</p>' : ''),
        [{ label: '選挙戦へ', primary: true, onClick: function () { K.toCampaign(s); Game.clearUndo(); Game.ui.card = null; Game.save(); Game.render(); } }]);
    } else {
      UI.modal('<p class="m-kicker">' + UI.esc(Game.Data.sessionName(cr.turn)) + '</p><h2>' + UI.esc(p.title) + '</h2><p>' + UI.esc(p.text) + '</p>',
        [{ label: 'わかった', primary: true, onClick: next }]);
    }
  }
  function flushFx() {
    pendingFx.forEach(function (f) { UI.floatOn(f.region, UI.signed(f.gain)); });
    pendingFx = [];
  }

  // ---------- 操作 ----------
  function render(app) {
    const s = Game.state, cr = s.career;
    const sel = cr.hand.filter(function (c) { return c.uid === Game.ui.card; })[0] || null;
    const kind = sel ? K.targetKind(cr, sel.id) : null;
    const color = Game.Data.PARTIES[s.player.party].color, max = Game.Balance.comeback.baseMax;
    app.innerHTML = '<div class="game term">' + hudHtml(s) + windHtml(cr) +
      '<main class="board"><div class="map-cell">' +
      UI.mapHtml(function (rid) { return { color: color, mix: 10 + (cr.base[rid] || 0) / max * 55 }; }, cr.sel) +
      '</div><aside class="side">' + sideHtml(s, sel, kind) + '</aside></main>' + handHtml(cr, sel, kind) + '</div>';
    app.querySelector('#pins').innerHTML = pinsHtml(cr, sel, kind);

    const say = function (text) { cr.news = text; Game.ui.card = null; render(app); };
    const doPlay = function (target) {
      const ok = K.canPlay(cr, sel.id);
      if (!ok.ok) return say(ok.reason);
      Game.pushUndo();
      const res = K.play(s, sel.uid, target);
      Game.ui.card = null;
      pendingFx = res.fx || [];
      Game.save();
      render(app);
    };
    app.querySelector('.map').addEventListener('click', function (e) {
      const t = e.target.closest('[data-id]');
      if (!t) return;
      if (sel && kind === 'region') return doPlay(t.dataset.id);
      cr.sel = t.dataset.id;
      render(app);
    });
    app.querySelectorAll('.pr-item').forEach(function (b) {
      b.onclick = function () { if (sel && kind === 'promise') doPlay(b.dataset.promise); };
    });
    app.querySelector('#cards').addEventListener('click', function (e) {
      const b = e.target.closest('.card');
      if (!b) return;
      const uid = +b.dataset.uid;
      const card = cr.hand.filter(function (c) { return c.uid === uid; })[0];
      const ok = K.canPlay(cr, card.id);
      if (!ok.ok) return say(ok.reason);
      Game.ui.card = Game.ui.card === uid ? null : uid;
      render(app);
    });
    const now = app.querySelector('#playNow');
    if (now) now.onclick = function () { doPlay(null); };
    app.querySelector('#undo').onclick = function () { pendingFx = []; Game.undo(); };
    const finish = function () {
      const res = K.endTurn(s);
      if (!res.ok) return;
      Game.clearUndo();
      Game.ui.card = null;
      pendingFx = [];
      Game.save();
      render(app);
    };
    app.querySelector('#endTurn').onclick = function () {
      const idle = cr.energy > 0 && cr.hand.some(function (c) { return K.canPlay(cr, c.id).ok; });
      if (!idle) return finish();
      UI.modal('<h2>まだ動ける</h2><p>体力が ' + cr.energy + ' 残っていて、使えるカードがある。この会期を終える?</p>',
        [{ label: 'もどる' }, { label: '終える', primary: true, onClick: finish }]);
    };
    app.querySelector('#menu').onclick = function () {
      UI.modal('<h2>メニュー</h2><p>ここまでは自動で記録されている。タイトルの「つづきから」で再開できる。</p>',
        [{ label: 'とじる' }, { label: 'タイトルへ', primary: true, onClick: Game.toTitle }]);
    };

    if (cr.pending.length) showPending(app);
    else flushFx();
  }

  return { render: render };
})();
