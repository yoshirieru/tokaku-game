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
      '<span class="hud-badge">' + (Game.GovView.active(cr) ? Game.GovView.badge(cr) : cr.status === 'member' ? Game.Balance.ranks[cr.rank || 0].name + '・当選' + cr.wins + '回' : '浪人中') + '</span></div>' +
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
      '<span class="wind-text">' + text + '</span><span class="wind-left">' + (left > 0 ? '任期満了まで あと' + left + '会期' : '') + '</span></section>';
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
    } else if (p.type === 'dissolve') {
      const lines = p.lines.length ? '<ul class="m-lines">' + p.lines.map(function (l) { return '<li class="ml-' + l.kind + '">' + UI.esc(l.text) + '</li>'; }).join('') + '</ul>'
        : '<p>背負った約束は残っていない。</p>';
      UI.modal('<p class="m-kicker">' + UI.esc(p.session) + '</p><h2>' + (p.full ? '任期満了' : '衆議院解散') + '</h2>' +
        '<p>' + (p.full ? '4年の任期が終わった。総選挙が行われる。' : '首相が衆議院を解散した。総選挙が始まる。') + '</p>' + lines +
        (p.stars ? '<p>党への貢献が認められ、党幹部の応援が ' + p.stars + '枚 増える。</p>' : '') +
        (p.unity ? '<p>党のために働いてきたことで、党がまとまっている。総選挙は全ブロックの支持が +' + p.unity + ' から始まる。</p>' : ''),
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
      UI.modal('<h2>メニュー</h2><p>ここまでは自動で記録されている。タイトルの「つづきから」で再開できる。</p>',
        [{ label: 'とじる' }, { label: '政界を引退する', onClick: askRetire }, { label: 'タイトルへ', primary: true, onClick: Game.toTitle }]);
    };

    if (cr.pending.length) showPending(app);
    else flushFx();
  }

  return { render: render };
})();
