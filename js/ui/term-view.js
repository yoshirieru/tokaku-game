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
  const ROLE_TEXT = { incumbent: '現職として', revived: '比例復活の現職として', former: '元職として', newcomer: '新人として' };

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
      '<span class="hud-badge">' + (Game.GovView.active(cr) ? Game.GovView.badge(cr) : cr.np ? UI.esc(cr.np.short) + '代表・' + (cr.status === 'member' ? '当選' + cr.wins + '回' : '浪人中') : cr.status === 'member' ? Game.Balance.ranks[cr.rank || 0].name + '・当選' + cr.wins + '回' : '浪人中') + '</span></div>' +
      '<ol class="days" aria-label="任期の会期">' + dots + '</ol>' +
      '<div class="res"><span class="lab">資金</span><b>' + cr.money + '</b><small>万円</small></div>' +
      '<div class="ticker"><span class="tk-lab">' + UI.esc(Game.Data.sessionName(cr.turn)) + '</span><span id="news">' + UI.esc(cr.news) + '</span></div>' +
      '<button type="button" class="icon-btn" id="menu" aria-label="メニュー">' + UI.icon('menu') + '</button>' +
      '</header>';
  }
  function windHtml(cr) {
    if (Game.GovView.active(cr)) return Game.GovView.barHtml(Game.state);   // 党首:内閣支持率の帯
    const T = Game.Balance.term, pct = Math.round(K.dissolveChance(cr) * 100), left = T.turns - cr.turn;
    const text = cr.turn >= T.turns ? 'この会期で<b>任期満了</b>。総選挙になる'
      : pct ? 'この会期のあとに解散する見込み <b>' + pct + '%</b>' : '選挙の直後。この会期のあとの解散は<b>ない</b>';
    return '<section class="race panel wind" aria-label="解散風"><span class="race-lab">解散風</span>' +
      '<div class="wind-bar"><i style="width:' + pct + '%"></i></div>' +
      '<span class="wind-text">' + text + '</span><span class="wind-left">' + (left > 0 ? '任期満了まで あと' + left + '会期・' : '') + upperLeft() + '</span></section>';
  }
  // 次の参院選まで(R12)
  function upperLeft() {
    const u = Game.Upper.get(Game.state);
    return u.next > 0 ? '参院選まで あと' + u.next + '会期' : 'この会期に参院選';
  }
  function pinsHtml(cr, sel, kind) {
    if (Game.GovView.active(cr)) return Game.GovView.pinsHtml(Game.state);
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
    if (Game.GovView.active(s.career)) return Game.GovView.sideHtml(s, sel, kind);
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
    const nx = K.nextRank(cr);
    const need = nx ? [nx.wins ? '当選あと' + nx.wins + '回' : '', nx.merit ? '評価あと' + nx.merit : ''].filter(Boolean).join('・') : '';
    const rankNote = cr.status !== 'member' ? '議席を取り戻せば、また人事がある' : !nx ? 'いちばん上の役職にいる' : '次は' + nx.rank.name + '(' + (need || '次の人事で') + ')';
    let prep = '<section class="panel" id="prep"><h2>次の選挙への備え<small>' + ROLE_TEXT[cr.role] + '戦う</small></h2>' +
      '<div class="prep-row"><span>党内評価</span><b>' + (cr.merit || 0) + '</b><small>' + rankNote + '</small></div>' +
      '<div class="prep-row"><span>地盤の合計</span><b>' + baseSum + '</b><small>始まりの支持に、地区ごとに足される</small></div>' +
      '<div class="prep-row"><span>推薦のカード</span><b>' + cr.next.endorse.length + '枚</b><small>守った約束の数</small></div>' +
      '<div class="prep-row"><span>党幹部の応援</span><b>' + (1 + stars) + '枚</b><small>' +
      (stars >= CB.starExtraMax ? 'これ以上は増えない' : '党への貢献 ' + cr.contrib + '(あと' + toNext + 'で +1枚)') + '</small></div>' +
      '<div class="prep-row"><span>持ち込む資金</span><b>' + Math.min(CB.moneyCarryMax, cr.money) + '万円</b><small>上限 ' + CB.moneyCarryMax + '万円</small></div>' + ethicRow(s) + '</section>';
    if (cr.leader) {   // 党首:次は全国の総選挙。党をまとめ、約束を守ることが全ブロックの支持になる
      const NB = Game.Balance.nation, unity = Math.min(NB.unityMax, Math.floor(cr.contrib / NB.unityPer));
      prep = '<section class="panel" id="prep"><h2>次の総選挙への備え<small>党首として全国を戦う</small></h2>' +
        '<div class="prep-row"><span>党の議席</span><b>' + cr.partySeats + '</b><small>過半数は ' + NB.majority + '</small></div>' +
        '<div class="prep-row"><span>党の結束</span><b>+' + unity + '</b><small>' + (unity >= NB.unityMax ? 'これ以上は増えない' : '党への貢献 ' + cr.contrib + '(あと' + (NB.unityPer - cr.contrib % NB.unityPer) + 'で +1)') + '</small></div>' +
        '<div class="prep-row"><span>守った約束</span><b>+' + Math.min(NB.keptMax, cr.next.endorse.length) * NB.keptAll + '</b><small>1つにつき全ブロック +' + NB.keptAll + '</small></div>' +
        '<div class="prep-row"><span>破ると</span><b>' + NB.brokenAll + '</b><small>党首の約束破りは、全ブロックに響く</small></div>' +
        '<div class="prep-row"><span>持ち込む資金</span><b>' + Math.min(CB.moneyCarryMax, cr.money) + '万円</b><small>上限 ' + CB.moneyCarryMax + '万円</small></div>' + ethicRow(s) + '</section>';
    }

    // 地区
    const r = Game.Data.REGION[cr.sel], n = cr.base[r.id] || 0;
    const tags = r.tags.map(function (t) { return '<span class="tag-chip">' + Game.Data.TAGS[t] + '</span>'; }).join('');
    const detail = '<section class="panel" id="detail"><div class="d-head"><h2>' + r.name + '</h2><span class="mk">地盤 ' + n + ' / ' + CB.baseMax + '</span>' +
      '<span class="voters">' + (cr.lastShare[r.id] != null ? '前回の得票率 ' + Math.round(cr.lastShare[r.id]) + '%' : 'まだ戦ったことのない地区') + '</span></div><p class="d-desc">' + r.desc + '</p><div class="tags">' + tags + '</div></section>';
    return promises + prep + detail;
  }
  // 政治とカネ(R9)の行
  function ethicRow(s) {
    const t = UI.ethicText(s);
    return '<div class="prep-row' + (t.bad ? ' warn' : '') + '"><span>政治とカネ</span><b>' + t.value + '</b><small>' + t.note + '</small></div>';
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
      prompt = cr.hand.some(function (c) { return K.canPlay(cr, c.id).ok; }) ? (Game.GovView.active(cr) ? 'カードを選ぶ。' + (cr.gov.role === 'opposition' ? '政権を追及するか、党をまとめるか。' : '公約を進めるか、支持率を上げるか、党をまとめるか。') : 'カードを選ぶ。約束を進めるか、地元を固めるか、党で働くか。') + 'ダブルクリックですぐ使える。' : 'この会期はここまで。会期を終えよう。';
    } else if (kind === 'promise') {
      prompt = '<b>「' + Game.Data.TERM_CARDS[sel.id].name + '」</b>で進める約束を、右の欄から選ぶ。<small>ダブルクリックなら「' + Game.Data.PROMISES[K.autoPromise(cr)].policy + '」を進める</small>';
    } else if (kind === 'region') {
      prompt = '<b>「' + Game.Data.TERM_CARDS[sel.id].name + '」</b>で回る地区を地図で選ぶ。<small>ダブルクリックなら' + Game.Data.REGION[cr.sel].name + 'を回る</small>';
    } else {
      prompt = '<b>「' + Game.Data.TERM_CARDS[sel.id].name + '」</b><button type="button" class="btn-go" id="playNow">使う</button>';
    }
    return '<footer class="hand"><div class="turn panel">' +
      '<div class="energy"><span class="e-lab">この会期の体力</span><span class="pips">' + pips(cr.energy, T.energy, 'pip') + '</span><span class="deck-n">山札 ' + cr.deck.length + '・捨て札 ' + cr.discard.length + '</span></div>' +
      '<div class="prompt" id="prompt">' + prompt + '</div>' +
      '<div class="turn-btns"><button type="button" class="btn btn-undo" id="undo" title="カードを使う前に戻す(Ctrl+Z)"' + (Game.canUndo() ? '' : ' disabled') + '>' + UI.icon('undo') + '<span>取り消す</span></button>' +
      '<button type="button" class="btn-main" id="endTurn">会期を終える</button></div>' +
      '</div><div class="cards" id="cards" aria-label="手札">' + cards + '</div></footer>';
  }

  // ---------- 新党(R16)----------
  // 結党の窓:名前を選ぶ。done は結党したあと(またはやめたとき)に呼ぶ
  function foundModal(s, done, cancelLabel) {
    const cr = s.career, NP = Game.Balance.newParty, from = Game.Data.PARTIES[s.player.party];
    const lost = cr.rank ? Game.Balance.ranks[cr.rank].name + 'の役職を失う。' : '';
    let name = null, short = null, color = Game.Data.NEW_PARTY_COLORS[0], shortTouched = false;
    const found = function () { const r = K.foundParty(s, { name: name.value, short: short.value, color: color }); Game.clearUndo(); Game.ui.card = null; Game.save(); UI.sound('stamp'); done(r); };
    const swatches = Game.Data.NEW_PARTY_COLORS.map(function (c, i) { return '<button type="button" class="np-sw' + (i === 0 ? ' on' : '') + '" data-c="' + c + '" style="--pc:' + c + '" aria-label="色 ' + (i + 1) + '"></button>'; }).join('');
    const examples = Game.Data.NEW_PARTIES.map(function (n, i) { return '<button type="button" class="np-ex" data-i="' + i + '">' + UI.esc(n.name) + '</button>'; }).join('');
    UI.modal('<p class="m-kicker">' + UI.esc(Game.Data.sessionName(cr.turn)) + '・党を割る</p><h2>新党を立ち上げる</h2>' +
      '<p>' + from.name + 'を離れ、自分の旗を揚げる。同志 <b>' + K.matesOf(cr) + '人</b>がついてくる。</p>' +
      '<ul class="m-lines">' +
        '<li class="ml-broken">' + lost + '党内評価は半分になる。' + from.short + 'は次の選挙で、あなたの選挙区に<b>刺客</b>を立てる(小選挙区は4人の争い)。</li>' +
        '<li class="ml-broken">党の組織は離れる(地力は元の党の ' + Math.round(NP.carry * 100) + '%)。比例復活はほぼ望めない。</li>' +
        '<li class="ml-kept">最初の選挙は<b>新党ブーム</b>。浮動票・若者の地区ほど伸びる。地盤と、地元の団体との約束はそのまま。</li>' +
        '<li class="ml-kept">議席を積めば、ほかの党から<b>合流</b>の誘いが来る。持ってきた議席しだいで、合流先の役職が決まる。</li>' +
      '</ul>' +
      '<div class="np-form">' +
        '<label class="field np-name">党の名前<input id="npName" maxlength="' + NP.nameMax + '" placeholder="' + UI.esc(Game.Data.NEW_PARTIES[0].name) + '" autocomplete="off"></label>' +
        '<label class="field np-short">略称(' + NP.shortMax + '文字まで)<input id="npShort" maxlength="' + NP.shortMax + '" placeholder="' + UI.esc(Game.Data.NEW_PARTIES[0].short) + '" autocomplete="off"></label>' +
        '<div class="np-colors"><span>党の色</span>' + swatches + '</div>' +
        '<div class="np-exs"><span>例</span>' + examples + '</div>' +
        '<p class="np-preview"><span class="pchip" id="npChip" style="--pc:' + color + '">' + UI.esc(Game.Data.NEW_PARTIES[0].short) + '</span> <b id="npPrev">' + UI.esc(Game.Data.NEW_PARTIES[0].name) + '</b></p>' +
      '</div>',
      [{ label: cancelLabel || 'やめておく', onClick: function () { done(null); } }, { label: 'この名前で旗を揚げる', primary: true, onClick: found }]);
    // 入力:略称は、自分で書きかえるまで名前の頭2文字。プレビューを打つたびに更新
    const box = document.querySelector('.modal-back:last-child .modal');
    name = box.querySelector('#npName'); short = box.querySelector('#npShort');
    const chip = box.querySelector('#npChip'), prev = box.querySelector('#npPrev');
    const preview = function () {
      const c = K.cleanName({ name: name.value, short: short.value, color: color });
      chip.textContent = c.short; chip.style.setProperty('--pc', c.color); prev.textContent = c.name;
    };
    name.oninput = function () { if (!shortTouched) short.value = name.value.replace(/\s/g, '').slice(0, 2); preview(); };
    short.oninput = function () { shortTouched = short.value !== ''; preview(); };
    box.querySelectorAll('.np-sw').forEach(function (b) {
      b.onclick = function () { color = b.dataset.c; box.querySelectorAll('.np-sw').forEach(function (x) { x.classList.toggle('on', x === b); }); preview(); };
    });
    box.querySelectorAll('.np-ex').forEach(function (b) {
      b.onclick = function () {
        const ex = Game.Data.NEW_PARTIES[+b.dataset.i];
        name.value = ex.name; short.value = ex.short; shortTouched = true; color = ex.color;
        box.querySelectorAll('.np-sw').forEach(function (x) { x.classList.toggle('on', x.dataset.c === color); });
        preview();
      };
    });
    name.focus();
  }

  // ---------- 知らせ ----------
  function showPending(app) {
    const s = Game.state, cr = s.career, p = cr.pending[0], T = Game.Balance.term;
    const next = function () { K.dismiss(s); Game.save(); if (s.screen === 'term') render(app); else Game.render(); };   // 裏金の発覚で辞職すれば、エンディングへ
    const after = function () { Game.clearUndo(); Game.save(); render(app); };
    if (Game.GovView.active(cr) && Game.GovView.pending(app, p, next, render)) return;   // 党首の任期の始まり・解散
    if (p.type === 'start') {
      if (cr.status === 'member') {
        const list = cr.promises.length ? '<ul class="m-list">' + cr.promises.map(function (x) {
          return '<li><b>' + P(x.id).policy + '</b>(' + P(x.id).org + ')' + (x.progress ? ' — 前の任期からの持ち越し' : '') + '</li>';
        }).join('') + '</ul>' : '<p>背負っている約束はない。地元と党のために動ける。</p>';
        UI.modal('<p class="m-kicker">' + (cr.role === 'revived' ? '比例復活・' : '') + (cr.wins === 1 ? '初登院' : cr.wins + '回目の当選') + '</p><h2>議員の任期が始まる</h2>' +
          '<p>' + (cr.leader ? '党首として国会に戻った。党をまとめ、次の総選挙に備える。' : '選挙で背負った約束を、この任期のうちに果たす。') + '</p>' + list +
          '<ul class="m-list"><li>1会期(半年)に体力は' + T.energy + '。会期の終わりに、上の帯の見込みで衆議院が解散する。</li>' +
          '<li>約束してから' + T.graceTurns + '会期たたないうちの解散なら、破ったことにはならず持ち越せる。</li></ul>',
          [{ label: '国会へ', primary: true, onClick: next }]);
      } else {
        UI.modal('<p class="m-kicker">浪人</p><h2>次の選挙をめざす</h2>' +
          '<p>議席には届かなかった。' + (cr.dropped ? '背負った約束は白紙に戻った。' : '') + '次の解散まで、地元を歩いて地盤を固め、資金を集める。</p>' +
          '<ul class="m-list"><li>浪人中は国会で動けない(約束を進めるカードは出ない)。</li><li>解散の見込みは、上の帯に出ている。</li></ul>',
          [{ label: '地元へ', primary: true, onClick: next }]);
      }
    } else if (p.type === 'leaderRace') {
      const L = Game.Balance.leaderRace, top = Math.max(p.me, p.rivals[0].str, p.rivals[1].str);
      const bar = function (name, sub, v, me) {
        return '<div class="row' + (me ? ' me' : '') + '" style="--pc:' + (me ? 'var(--gold)' : 'var(--sub)') + '"><span class="pchip" style="--pc:' + (me ? 'var(--accent)' : 'var(--panel-2)') + '">' + sub + '</span><span class="nm">' + UI.esc(name) + '</span><span class="bar"><i style="width:' + (v / top * 100) + '%"></i></span><span class="pct">' + v + '</span></div>';
      };
      const third = p.rivals[0].str <= p.rivals[1].str ? p.rivals[0] : p.rivals[1];
      const pick = function (a) { return function () { K.runRace(s, a); Game.clearUndo(); Game.save(); render(app); }; };
      UI.modal('<p class="m-kicker">' + UI.esc(Game.Data.sessionName(cr.turn)) + '・党首選</p><h2>党首選に立つか</h2>' +
        '<p>党三役として、党首の座に挑める。いまの票読み(強さ)はこうだ。過半数を取る人がいなければ、上位2人の決選投票になる。</p>' +
        bar(s.player.name, 'あなた', p.me, true) + bar(p.rivals[0].name, p.rivals[0].title, p.rivals[0].str) + bar(p.rivals[1].name, p.rivals[1].title, p.rivals[1].str),
        [
          { label: '<b>党内融和を訴える</b><span>確実に、強さ +' + L.unity + '</span>', onClick: pick('unity') },
          { label: '<b>世代交代を訴える</b><span>' + Math.round(L.reform.chance * 100) + '%で強さ +' + L.reform.hit + '。外すと ' + L.reform.miss + '</span>', onClick: pick('reform') },
          { label: '<b>' + UI.esc(third.short) + '陣営と組む</b><span>' + UI.esc(third.short) + '氏の強さの ' + Math.round(L.deal.share * 100) + '% を受け取る。ポストの約束で党内評価 ' + L.deal.merit + '</span>', onClick: pick('deal') },
          { label: '<b>今回は見送る</b><span>次の総選挙のあとに、また機会がある</span>', onClick: pick('skip') },
        ], 'choices');
    } else if (p.type === 'leaderResult') {
      const nm = { me: s.player.name, r0: p.rivals[0].name, r1: p.rivals[1].name };
      const row = function (k, v, digits) {   // 決選投票は僅差になるので、小数1けたまで出す
        return '<div class="row' + (k === 'me' ? ' me' : '') + '" style="--pc:' + (k === 'me' ? 'var(--gold)' : 'var(--sub)') + '"><span class="pchip" style="--pc:' + (k === 'me' ? 'var(--accent)' : 'var(--panel-2)') + '">' + (k === 'me' ? 'あなた' : '相手') + '</span><span class="nm">' + UI.esc(nm[k]) + '</span><span class="bar"><i style="width:' + v + '%"></i></span><span class="pct">' + v.toFixed(digits || 0) + '%</span></div>';
      };
      const firstRows = ['me', 'r0', 'r1'].sort(function (a, b) { return p.first[b] - p.first[a]; }).map(function (k) { return row(k, p.first[k]); }).join('');
      const runoff = p.runoff ? '<p class="m-kicker">決選投票</p>' + row(p.runoff.a, p.runoff.pa, 1) + row(p.runoff.b, p.runoff.pb, 1) : '';
      UI.modal('<p class="m-kicker">党首選・開票</p><h2>' + (p.won ? '新しい党首に選ばれた' : '党首選に敗れた') + '</h2>' +
        '<p>' + UI.esc(p.note) + '</p><p class="m-kicker">1回目の投票' + (p.runoff ? '(過半数なし)' : '') + '</p>' + firstRows + runoff +
        '<p>' + (p.won ? '次の総選挙は、党首として全国の11ブロックを戦う。公務が増え、地元に帰る時間は減る。' : '党内評価が ' + Game.Balance.leaderRace.loseMerit + '。次の総選挙のあとに、また機会がある。') + '</p>',
        [{ label: p.won ? '党首として立つ' : '出直す', primary: true, onClick: function () { if (p.won) UI.sound('stamp'); next(); } }]);
    } else if (p.type === 'npOffer') {   // R16:党首選に敗れたあと、党を割ろうという声
      UI.modal('<p class="m-kicker">' + UI.esc(Game.Data.sessionName(cr.turn)) + '・党首選のあと</p><h2>「党を割りましょう」</h2>' +
        '<p>党首選で戦った陣営の議員たちが、事務所に集まってきた。「この党にいても、もう目はない。新しい旗を揚げるなら、ついていく」。同志は <b>' + p.mates + '人</b>。</p>',
        [{ label: '<b>話を聞く</b><span>新党の名前と、割ったあとのことを見て決める</span>', onClick: function () {
          K.answerNp(s, 'stay'); Game.save();   // 知らせは閉じ、結党の窓で決める(やめれば党に残る)
          foundModal(s, function () { render(app); }, '党に残る');
        } },
        { label: '<b>党に残る</b><span>次の党首選をめざす</span>', onClick: function () { K.answerNp(s, 'stay'); after(); } }], 'choices');
    } else if (p.type === 'npResult') {   // R16:新党の選挙結果
      const L = p.last, np = cr.np, d = L.prev != null ? L.seats - L.prev : null;
      UI.modal('<p class="m-kicker">新党の選挙結果</p><h2>「' + UI.esc(np.name) + '」' + L.seats + '議席</h2>' +
        '<ul class="m-lines">' +
          '<li class="ml-' + (L.me ? 'kept' : 'broken') + '">' + (L.me ? 'あなたは議席を守った。' : 'あなたは議席に届かなかった。') + '</li>' +
          '<li class="ml-' + (L.mateSeats ? 'kept' : 'light') + '">同志 ' + L.mates + '人のうち、小選挙区で ' + L.mateSeats + '人が勝った。比例代表で ' + L.pr + '議席。</li>' +
          (L.boom > 0 ? '<li class="ml-kept">新党ブームが追い風になった。</li>' : '') +
          (d != null ? '<li class="ml-' + (d >= 0 ? 'kept' : 'broken') + '">前の選挙から ' + UI.signed(d) + '議席。</li>' : '') +
          (L.seats > Game.Balance.newParty.dissolveAt ? '<li>議席を積めば、ほかの党から合流の誘いが来る(合流先の役職は議席しだい)。</li>' : '<li class="ml-broken">党として立ち行かない。解党して、どこかの党に合流するしかない。</li>') +
        '</ul>',
        [{ label: 'わかった', primary: true, onClick: function () { K.answerNp(s); after(); } }]);
    } else if (p.type === 'npMerge') {   // R16:合流の誘い
      const to = Game.Data.PARTIES[p.party], rejoin = p.party === cr.np.from, rk = Game.Balance.ranks[p.rank];
      UI.modal('<p class="m-kicker">' + UI.esc(Game.Data.sessionName(cr.turn)) + '・' + (rejoin ? '復党の誘い' : '合流の誘い') + '</p><h2>' + to.name + 'から' + (rejoin ? '「戻ってこないか」' : '「一緒にやらないか」') + '</h2>' +
        '<p>「' + UI.esc(cr.np.name) + '」の ' + p.seats + '議席を、' + to.short + 'は欲しがっている。' + (rejoin ? '割って出た党に、頭を下げて戻る道だ。' : '') + '</p>' +
        '<ul class="m-lines"><li class="ml-kept">' + (cr.status === 'member' ? (p.rank ? '<b>' + rk.name + '</b>として迎えられる。' : '役職はない(平議員から)。') : '浪人なので、役職はない。') + '党内評価 +' + p.seats * Game.Balance.newParty.merge.meritPerSeat + '。' + to.short + 'の党首選にも、いずれ立てる。</li>' +
          '<li class="ml-' + (rejoin ? 'kept' : 'light') + '">' + (rejoin ? '刺客はいなくなり、' + to.short + 'の組織がまた味方につく。' : to.short + 'の公認で戦う。' + Game.Data.PARTIES[cr.np.from].short + 'の候補は、相手として残る。') + '</li>' +
          '<li class="ml-light">新党の旗は降ろす。</li></ul>',
        [{ label: '<b>' + (rejoin ? '復党する' : '合流する') + '</b><span>' + to.name + 'の一員になる</span>', onClick: function () { K.answerNp(s, true); UI.sound('stamp'); after(); } },
          { label: '<b>断る</b><span>新党の旗を守る</span>', onClick: function () { K.answerNp(s, false); after(); } }], 'choices');
    } else if (p.type === 'npDissolve') {   // R16:解党
      const P3 = Game.Data.PARTIES;
      UI.modal('<p class="m-kicker">解党</p><h2>「' + UI.esc(cr.np.name) + '」を解党する</h2><p>議席がほとんど残らず、党として立ち行かなくなった。どこかの党に身を寄せるか、ここで政界を去るか。</p>',
        Object.keys(P3).map(function (k) {
          return { label: '<b>' + P3[k].name + 'に' + (k === cr.np.from ? '復党する' : '合流する') + '</b><span>役職はない。' + UI.esc(Game.Data.DISTRICT.name) + 'では' + P3[k].short + 'の候補として戦う</span>', onClick: function () { K.answerNp(s, k); after(); } };
        }).concat([{ label: '<b>政界を去る</b><span>ここで歩みを終え、評価を受ける</span>', onClick: function () { K.answerNp(s, 'retire'); Game.clearUndo(); Game.save(); Game.render(); } }]), 'choices');
    } else if (p.type === 'promotion') {
      const rk = Game.Balance.ranks[p.rank], li = [];
      if (rk.startAll) li.push('役職の重みで、次の選挙は全地区の始まりの支持が +' + rk.startAll + '。');
      const dutyAdd = rk.duty - Game.Balance.ranks[p.rank - 1].duty;
      if (dutyAdd > 0) li.push('公務が増える。山札の「地元回り」' + dutyAdd + '枚が「公務」に入れ替わり、地元に帰る時間が減る。');
      if (!Game.Balance.ranks[p.rank + 1]) li.push('党三役。次にめざすのは党首の座だ(党首選は、これから作っていく部分)。');
      UI.modal('<p class="m-kicker">' + UI.esc(Game.Data.sessionName(cr.turn)) + '・人事</p><h2>' + rk.name + 'に就任</h2>' +
        '<p>当選を重ね、党のために働いてきたことが認められた。</p>' + (li.length ? '<ul class="m-list">' + li.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>' : ''),
        [{ label: '拝命する', primary: true, onClick: next }]);
    } else if (p.type === 'petition') {
      const q = P(p.id), E = T.events.petition, reg = Game.Data.REGION[q.region].name;
      const answer = function (yes) { return function () { const r = K.respond(s, yes); Game.clearUndo(); pendingFx = r.fx; Game.save(); render(app); }; };
      UI.modal('<p class="m-kicker">' + UI.esc(Game.Data.sessionName(cr.turn)) + '・要望</p><h2>' + q.org + 'が訪ねてきた</h2>' +
        '<p>「<b>' + q.policy + '</b>を、あなたの手で進めてほしい」。' + reg + 'に根を張る団体だ。</p>',
        [
          { label: '<b>約束する</b><span>' + reg + 'の地盤 +' + E.base + '。新しい約束を背負う</span>', onClick: answer(true) },
          { label: '<b>断る</b><span>' + reg + 'の地盤 ' + E.refuse + '。できない約束はしない</span>', onClick: answer(false) },
        ], 'choices');
    } else if (p.type === 'slush') {   // R9:記者の取材・元秘書の告発
      const sc = Game.Scandal.get(s), L = Game.Balance.slush;
      const answer = function (fix) { return function () { Game.Scandal.answerSlush(s, fix); after(); }; };
      UI.modal('<p class="m-kicker">' + UI.esc(Game.Data.sessionName(cr.turn)) + '・政治とカネ</p><h2>' + (p.step ? '元秘書が告発した' : '記者が取材に来た') + '</h2>' +
        '<p>' + (p.step ? '辞めた秘書が「パーティー券の収入の一部が、裏金になっていた」と週刊誌に語った。検察が動くのも時間の問題だ。' : '「パーティーの収入と、収支報告書の額が合わないのでは」。記者が事務所の周りを嗅ぎ回っている。') + '</p>' +
        '<p class="pr-note">載せていないお金 ' + sc.hidden + '万円・発覚度 ' + Math.round(sc.exposure) + '(' + L.stages[2] + 'で検察の捜査)</p>',
        [
          { label: '<b>記載を訂正して返す</b><span>' + sc.hidden + '万円を返す(資金は ' + cr.money + '万円)。発覚度 ' + L.correct + '。党内評価 ' + L.correctMerit + '</span>', onClick: answer(true) },
          { label: '<b>否定する</b><span>発覚度 +' + L.deny + '。隠したお金はそのまま</span>', onClick: answer(false) },
        ], 'choices');
    } else if (p.type === 'byElection') {   // R10:補欠選挙
      const pct = Math.round(Game.Scandal.byChance(cr) * 100);
      const answer = function (run) { return function () { const r = K.answerBy(s, run); if (r && r.won) UI.sound('stamp'); after(); }; };
      UI.modal('<p class="m-kicker">' + UI.esc(Game.Data.sessionName(cr.turn)) + '・補欠選挙</p><h2>議席が空いた</h2>' +
        '<p>' + UI.esc(Game.Data.DISTRICT.name) + 'の議員が、地方議員への買収の疑いで逮捕され、辞職した。補欠選挙が行われる。地元を歩いてきた今なら、勝てるかもしれない。</p>' +
        '<p class="pr-note">勝つ見込み およそ ' + pct + '%(地盤が厚いほど高い)</p>',
        [
          { label: '<b>立候補する</b><span>勝てば、その場で議員に戻る</span>', onClick: answer(true) },
          { label: '<b>見送る</b><span>次の解散を待つ</span>', onClick: answer(false) },
        ], 'choices');
    } else if (p.type === 'redistrict') {   // R11:区割り改定
      const RD = Game.Balance.redistrict, me = Game.Scandal.raceStrength(cr);
      const answer = function (c) { return function () { K.answerRedistrict(s, c); after(); }; };
      const head = '一票の格差をめぐる裁判で、最高裁が「違憲状態」と判断した。国会は区割りを改め、次の選挙から新しい区割りになる。';
      if (p.kind === 'merge') {
        UI.modal('<p class="m-kicker">' + UI.esc(Game.Data.sessionName(cr.turn)) + '・区割り改定</p><h2>隣の区と合わさる</h2>' +
          '<p>' + head + UI.esc(Game.Data.DISTRICT.name) + 'は隣の区と合わさり、同じ党の現職・' + UI.esc(p.rival) + '氏と公認を争うことになった。</p>' +
          '<p class="pr-note">強さ:あなた ' + me + '(党内評価・当選回数・地盤)/ ' + UI.esc(p.rival) + '氏 ' + p.rivalStr + '(勝負のときに ±' + RD.race.noise + 'ほどぶれる)</p>',
          [
            { label: '<b>公認を争う</b><span>勝てば残る(地盤は半分)。負ければ、ほかの選挙区に移る</span>', onClick: answer('race') },
            { label: '<b>ほかの選挙区に移る</b><span>国替え。地盤はゼロから</span>', onClick: answer('move') },
          ], 'choices');
      } else {
        UI.modal('<p class="m-kicker">' + UI.esc(Game.Data.sessionName(cr.turn)) + '・区割り改定</p><h2>選挙区がなくなる</h2>' +
          '<p>' + head + UI.esc(Game.Data.DISTRICT.name) + 'は分割され、なくなる。地元の一部を連れて、ほかの選挙区に移るしかない(地盤は半分)。</p>',
          [{ label: '移る先を選ぶ', primary: true, onClick: answer('move') }]);
      }
    } else if (p.type === 'moveSeat') {   // R10・R11:国替え
      const P2 = s.player.party, guide = function (k) { return Game.Data.seatLevel(Game.Balance.seats[k].guide[P2]); };
      const pick = function (k) { return function () { K.chooseSeat(s, k); Game.clearUndo(); Game.save(); Game.render(); }; };
      UI.modal('<p class="m-kicker">国替え</p><h2>どの選挙区に移る?</h2>' + (p.note ? '<p>' + UI.esc(p.note) + '</p>' : '') +
        '<p>' + (p.keep ? '地盤の半分を持っていける。' : '地盤はゼロから。') + '相手の顔ぶれは、移った先の選挙区のものになる。</p>',
        Game.Scandal.movableSeats(s).map(function (k) {
          const S2 = Game.Data.SEATS[k];
          return { label: '<b>' + UI.esc(S2.name) + '(' + UI.esc(S2.type) + ')</b><span>' + UI.esc(S2.block) + '・' + Game.Data.PARTIES[P2].short + 'なら「' + guide(k) + '」</span>', onClick: pick(k) };
        }), 'choices');
    } else if (p.type === 'budget') {   // R14:予算編成(すぐ出る効果と、長い目で出る効果)
      const FB = Game.Balance.future, D2 = Game.Data, r = Game.Future.role(s);
      const head = { pm: '来年度の予算、何に重点を置く?', member: '党の部会で、何を要望する?', junior: '連立与党として、予算に何を求める?', opposition: '野党の対案で、何を掲げる?' }[r];
      const longText = function (id) {
        const L = FB.budget[id].long;
        return Object.keys(L).sort(function (a, b) { return L[b] - L[a]; }).map(function (k) { return D2.INDICATORS[k].short + ' ' + (L[k] > 0 ? '+' : '−') + Math.abs(L[k]); }).join('・');
      };
      const pick = function (id) { return function () { Game.Future.answerBudget(s, id); after(); }; };
      UI.modal('<p class="m-kicker">' + UI.esc(Game.Data.sessionName(cr.turn)) + '・予算編成</p><h2>' + head + '</h2>' +
        '<p>決定には、すぐ出る効果と、数年から数十年かけて国に出る効果がある。どの道にも、良いところと痛いところがある。' + (r === 'pm' ? '' : '(首相ほどの力はないので、国への効き目は小さい)') + '</p>',
        p.options.map(function (id) {
          return { label: '<b>' + D2.BUDGET[id].name + '</b><span>すぐ:' + Game.Future.nowText(s, id) + ' / 長い目で:' + longText(id) + '</span>', onClick: pick(id) };
        }), 'choices');
    } else if (p.type === 'upperElection') {   // R12:参院選
      const U = Game.Balance.upper, rs = Game.Upper.rulingSeats(s), names = { tour: '全国を応援で回る', manifesto: '果たした公約を訴える', none: '党の候補に任せる', support: '党の候補の応援に回る', local: '地元を固める' };
      const rul = Game.Upper.ruling(s).map(function (k) { return Game.Data.PARTIES[k].short; }).join('・');
      const run = function (c) { return function () { Game.Upper.run(s, c); after(); }; };
      UI.modal('<p class="m-kicker">' + UI.esc(Game.Data.sessionName(cr.turn)) + '・参議院選挙</p><h2>参院選が始まる</h2>' +
        '<p>3年に一度の参院選。' + U.seats + '議席のうち ' + U.contested + '議席を争う。いまの与党(' + rul + ')は参院で ' + rs + '議席(過半数は ' + U.majority + ')。' +
        (cr.gov ? '内閣支持率 ' + Math.round(cr.gov.approval) + '% が、与党の追い風にも逆風にもなる。' : '') + '</p>' +
        (cr.gov && cr.gov.role !== 'opposition' ? '<p class="pr-note">過半数を割ると「ねじれ国会」。首相の重要法案が参院で進みにくくなる。</p>' : cr.gov ? '<p class="pr-note">与党を過半数割れに追い込めば、国会での追及がよく効く。</p>' : '<p class="pr-note">党が議席を伸ばせば、次の衆院選に勢いがつく。</p>'),
        Game.Upper.choices(s).map(function (c) { return { label: '<b>' + names[c.id] + '</b><span>' + c.note + '</span>', onClick: run(c.id) }; }), 'choices');
    } else if (p.type === 'upperResult') {   // R12:参院選の結果
      const U = Game.Balance.upper, P3 = Game.Data.PARTIES, me = s.player.party;
      const rows = Object.keys(P3).sort(function (a, b) { return p.won[b] - p.won[a]; }).map(function (k) {
        const d = p.won[k] - p.old[k];
        return '<div class="up-row' + (k === me ? ' me' : '') + '">' + UI.partyChip({ party: k }) + '<span class="nm">' + P3[k].name + (p.ruling.indexOf(k) >= 0 ? '<small>与党</small>' : '') + '</span>' +
          '<b>' + p.won[k] + '</b><small>改選前 ' + p.old[k] + '(' + UI.signed(d) + ')</small><span class="up-total">合計 ' + p.after[k] + '</span></div>';
      }).join('');
      const head = p.twisted ? '与党が過半数を割った' : p.ruling.indexOf(me) >= 0 ? '与党が過半数を守った' : p.rulingSeats >= U.majority ? '与党が過半数を守った' : '与党を過半数割れに追い込んだ';
      const li = [];
      if (p.twisted && !p.wasTwisted) li.push('ねじれ国会になった。重要法案は参院で止まりやすく、進みが 1 減る。');
      if (!p.twisted && p.wasTwisted) li.push('ねじれ国会が解消した。法案は元どおり進む。');
      if (p.hit) li.push('首相の党の大敗に、責任を問う声。内閣支持率 ' + p.hit + '。');
      if (p.wind) li.push(P3[me].short + 'の勢いは、次の衆院選の始まりの支持になる(' + UI.signed(p.wind) + ')。');
      UI.modal('<p class="m-kicker">参議院選挙・開票</p><h2>' + head + '</h2><p>' + UI.esc(p.note) + '与党は参院で <b>' + p.rulingSeats + '</b> / ' + U.seats + '議席(過半数 ' + U.majority + ')。</p>' + rows +
        (li.length ? '<ul class="m-list">' + li.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>' : ''),
        [{ label: 'わかった', primary: true, onClick: function () { if (p.won[me] > p.old[me]) UI.sound('stamp'); next(); } }]);
    } else if (p.type === 'dissolve') {
      const lines = p.lines.length ? '<ul class="m-lines">' + p.lines.map(function (l) { return '<li class="ml-' + l.kind + '">' + UI.esc(l.text) + '</li>'; }).join('') + '</ul>'
        : '<p>背負った約束は残っていない。</p>';
      UI.modal('<p class="m-kicker">' + UI.esc(p.session) + '</p><h2>' + (p.full ? '任期満了' : '衆議院解散') + '</h2>' +
        '<p>' + (p.full ? '4年の任期が終わった。総選挙が行われる。' : '首相が衆議院を解散した。総選挙が始まる。') + '</p>' + lines +
        (p.stars ? '<p>党への貢献が認められ、党幹部の応援が ' + p.stars + '枚 増える。</p>' : '') +
        (p.unity ? '<p>党のために働いてきたことで、党がまとまっている。総選挙は全ブロックの支持が +' + p.unity + ' から始まる。</p>' : ''),
        [{ label: '選挙戦へ', primary: true, onClick: function () { K.toCampaign(s); Game.clearUndo(); Game.ui.card = null; Game.save(); Game.render(); } }]);
    } else {
      UI.modal('<p class="m-kicker">' + UI.esc(Game.Data.sessionName(cr.turn)) + (p.kicker ? '・' + UI.esc(p.kicker) : '') + '</p><h2>' + UI.esc(p.title) + '</h2><p>' + UI.esc(p.text) + '</p>',
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
    const lead = Game.GovView.active(cr);   // 党首:全国の地図と、政権の部品
    Game.Data.useArena(cr.leader ? 'nation' : 'home');
    app.innerHTML = '<div class="game term' + (lead ? ' nat' : '') + '">' + hudHtml(s) + windHtml(cr) +
      '<main class="board"><div class="map-cell">' +
      UI.mapHtml(lead ? Game.GovView.mapFill(s) : function (rid) { return { color: color, mix: 10 + (cr.base[rid] || 0) / max * 55 }; }, lead ? null : cr.sel) +
      '</div><aside class="side">' + sideHtml(s, sel, kind) + '</aside></main>' + handHtml(cr, sel, kind) + '</div>';
    app.querySelector('#pins').innerHTML = pinsHtml(cr, sel, kind);

    const say = function (text) { cr.news = text; Game.ui.card = null; render(app); };
    // card を使う(ダブルクリックでは選んでいるカードでなくてもよい)。使う前の state を取り消し用に積む
    const doPlay = function (target, card, opt) {
      card = card || sel;
      const ok = K.canPlay(cr, card.id);
      if (!ok.ok) return say(ok.reason);
      // 資金パーティー(R9):先に、収入をどう記載するかを選ぶ
      if (!opt && Game.Balance.term.cards[card.id].money < 0) return UI.ledgerChoice(function (o) { doPlay(target, card, o); });
      Game.pushUndo();
      const res = K.play(s, card.uid, target, opt);
      Game.ui.card = null;
      pendingFx = res.fx || [];
      Game.save();
      render(app);
    };
    app.querySelector('.map').addEventListener('click', function (e) {
      const t = e.target.closest('[data-id]');
      if (!t || lead) return;
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
      const dbl = UI.doubleTap('term' + uid);
      const ok = K.canPlay(cr, card.id);
      if (!ok.ok) return say(ok.reason);
      // ダブルクリック:地区を選ぶカードは、いま選んでいる地区で。約束を選ぶカードは、果たすのにいちばん近い約束で使う
      if (dbl) {
        const k = K.targetKind(cr, card.id);
        return doPlay(k === 'region' ? cr.sel : k === 'promise' ? K.autoPromise(cr) : null, card);
      }
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
      Game.render();   // 退陣でエンディングに移ることもある
    };
    if (lead) Game.GovView.wire(app, s);
    app.querySelector('#endTurn').onclick = function () {
      const idle = cr.energy > 0 && cr.hand.some(function (c) { return K.canPlay(cr, c.id).ok; });
      if (!idle) return finish();
      UI.modal('<h2>まだ動ける</h2><p>体力が ' + cr.energy + ' 残っていて、使えるカードがある。この会期を終える?</p>',
        [{ label: 'もどる' }, { label: '終える', primary: true, onClick: finish }]);
    };
    app.querySelector('#menu').onclick = function () {
      const askRetire = function () {
        UI.modal('<h2>政界を引退する</h2><p>ここで政治家としての歩みを終え、評価を受ける。取り消すことはできない。</p>',
          [{ label: 'やめておく' }, { label: '引退する', primary: true, onClick: function () { K.retire(s, 'retire'); Game.clearUndo(); Game.ui.card = null; Game.save(); Game.render(); } }]);
      };
      const split = K.canFound(s) && !cr.pending.length ? [{ label: '党を割る(新党)', onClick: function () { foundModal(s, function () { render(app); }); } }] : [];   // R16
      UI.modal('<h2>メニュー</h2><p>ここまでは自動で記録されている。タイトルの「つづきから」で再開できる。</p>' +
        (!cr.leader && !cr.np && !K.canFound(s) && (cr.wins || 0) < Game.Balance.newParty.minWins ? '<p class="pr-note">当選 ' + Game.Balance.newParty.minWins + '回からは、党を割って新党を作れる。</p>' : ''),
        [{ label: 'とじる' }].concat(split, [{ label: '政界を引退する', onClick: askRetire }, { label: 'タイトルへ', primary: true, onClick: Game.toTitle }]));
    };

    if (cr.pending.length) showPending(app);
    else flushFx();
  }

  return { render: render };
})();
