// 選挙戦の画面:上の帯、全体の情勢、地図、右の列(地区・相手の動き・約束)、手札。朝の知らせの窓もここ。
window.Game = window.Game || {};

Game.CampaignView = (function () {
  const UI = Game.UI, C = Game.Campaign;
  let pendingFx = [];   // 次に画面を描いたあと、地図の札の上に浮かべる数字

  const man = function (n) { return (n / 10000).toFixed(1) + '万人'; };

  // ---------- 部品 ----------
  function hudHtml(s) {
    const camp = s.camp, B = Game.Balance, days = B.campaign.days;
    const special = {};
    special[B.pollDay] = '情勢調査'; special[B.debateDay] = '討論会'; special[days] = '最終日';
    let dots = '';
    for (let d = 1; d <= days; d++) {
      const cls = d < camp.day ? 'done' : d === camp.day ? 'now' : 'todo';
      dots += special[d] && d > camp.day
        ? '<li class="' + cls + ' tag" title="' + d + '日目:' + special[d] + '">' + d + '<small>' + special[d] + '</small></li>'
        : '<li class="' + cls + '" title="' + d + '日目"' + (d === camp.day ? ' aria-current="true"' : '') + '>' + d + '</li>';
    }
    const me = C.cand(camp, 'me');
    return '<header class="hud panel">' +
      '<div class="who"><span class="seat">' + UI.esc(Game.Data.DISTRICT.name) + '</span>' + UI.partyChip(me) + '<b class="pname">' + UI.esc(me.name) + '</b></div>' +
      '<ol class="days" aria-label="選挙戦の日程">' + dots + '</ol>' +
      '<div class="res"><span class="lab">資金</span><b>' + camp.money + '</b><small>万円</small></div>' +
      '<div class="ticker"><span class="tk-lab">速報</span><span id="news">' + UI.esc(camp.news) + '</span></div>' +
      '<button type="button" class="icon-btn" id="menu" aria-label="メニュー">' + UI.icon('menu') + '</button>' +
      '</header>';
  }
  function raceHtml(camp) {
    const o = C.overall(camp);
    const segs = C.ranking(o).map(function (id) {
      const c = C.cand(camp, id);
      return '<span class="seg" style="flex:' + o[id].toFixed(1) + ' 1 0;background:' + UI.color(c) + '"><b>' + UI.esc(c.short) + '</b>' + Math.round(o[id]) + '%</span>';
    }).join('');
    return '<section class="race panel" aria-label="全体の情勢"><span class="race-lab">全体の情勢</span><div class="race-bar">' + segs + '</div>' +
      '<span class="race-mark">' + UI.markHtml(C.margin(o)) + '</span></section>';
  }
  // 相手の今日の動きが、いまのままだとどれだけ効くか(先回り・固い票を見込む)
  function intentPreview(camp) {
    const B = Game.Balance.campaign, left = Object.assign({}, camp.shields);
    return camp.intents.map(function (it) {
      if (camp.blocked[it.region]) return { it: it, gain: 0, state: 'blocked' };
      let g = C.saturated(camp, it.region, it.who) ? Math.round(it.gain * B.saturatedMult) : it.gain, st = '';
      if (left[it.region] > 0) { g = Math.round(g * (1 - B.shieldBlock)); left[it.region] -= 1; st = 'shield'; }
      return { it: it, gain: g, state: st };
    });
  }
  function pinsHtml(camp, selCard) {
    const prev = intentPreview(camp);
    return Game.Data.DISTRICT.regions.map(function (r) {
      const s = camp.shares[r.id];
      const top = C.ranking(s).filter(function (id) { return id !== 'me'; })[0];
      let pred = '';
      if (selCard) {
        const g = C.cardGain(camp, selCard.id, r.id);
        if (g > 0) pred = '<span class="pred' + (C.saturated(camp, r.id, 'me') ? ' half' : '') + '">+' + g + '</span>';
      }
      const shield = camp.shields[r.id] > 0 ? '<span class="shield" title="固い票">' + UI.icon('shield') + camp.shields[r.id] + '</span>' : '';
      const foes = prev.filter(function (p) { return p.it.region === r.id; }).map(function (p) {
        const c = C.cand(camp, p.it.who);
        return '<span class="foe' + (p.state === 'blocked' ? ' stopped' : '') + '" style="--pc:' + UI.color(c) + '">' + UI.esc(c.short) + '</span>';
      }).join('');
      return '<button type="button" class="pin' + (r.id === camp.sel ? ' sel' : '') + '" data-id="' + r.id + '" style="left:' + r.x + '%;top:' + r.y + '%">' +
        '<b>' + r.name + '</b>' + UI.markHtml(C.margin(s)) +
        '<span class="mini"><i style="width:' + s.me + '%;background:' + UI.color(C.cand(camp, 'me')) + '"></i><i style="width:' + s[top] + '%;background:' + UI.color(C.cand(camp, top)) + ';margin-left:auto"></i></span>' +
        pred + shield + (foes ? '<span class="foes">' + foes + '</span>' : '') + '</button>';
    }).join('');
  }
  function sideHtml(camp, selCard) {
    const B = Game.Balance.campaign;
    const r = Game.Data.REGION[camp.sel], s = camp.shares[r.id];
    const sat = C.saturated(camp, r.id, 'me');
    let hint = '';
    if (selCard && C.isTarget(selCard.id)) {
      hint = '「' + Game.Data.CARDS[selCard.id].name + '」をここで使うと <em>+' + C.cardGain(camp, selCard.id, r.id) + '</em>' + (sat ? '(◎優勢の地区なので半分)' : '');
    } else if (sat) {
      hint = '◎優勢の地区では、カードの効果が半分になる。';
    }
    const tags = r.tags.map(function (t) { return '<span class="tag-chip">' + Game.Data.TAGS[t] + '</span>'; }).join('') +
      (camp.shields[r.id] > 0 ? '<span class="tag-chip solid">' + UI.icon('shield') + '固い票 ' + camp.shields[r.id] + '</span>' : '');
    const rows = C.ranking(s).map(function (id) {
      const c = C.cand(camp, id);
      return '<div class="row' + (c.player ? ' me' : '') + '" style="--pc:' + UI.color(c) + '">' + UI.partyChip(c) + '<span class="nm">' + UI.esc(c.short) + '</span>' +
        '<span class="bar"><i style="width:' + s[id] + '%"></i></span><span class="pct">' + Math.round(s[id]) + '%</span></div>';
    }).join('');
    const detail = '<section class="panel" id="detail" aria-live="polite">' +
      '<div class="d-head"><h2>' + r.name + '</h2>' + UI.markHtml(C.margin(s)) + '<span class="voters">有権者 ' + man(r.voters) + '</span></div>' +
      '<p class="d-desc">' + r.desc + '</p><div class="tags">' + tags + '</div>' + rows +
      (hint ? '<div class="d-hint">' + hint + '</div>' : '') + '</section>';

    const foe = '<section class="panel" id="foe"><h2>相手の今日の動き<small>この日の終わりに効く</small></h2>' +
      intentPreview(camp).map(function (p) {
        const c = C.cand(camp, p.it.who);
        const eff = p.state === 'blocked' ? '<span class="eff stop">止めた</span>'
          : '<span class="eff">+' + p.gain + (p.state === 'shield' ? '<small>固い票で半減</small>' : '') + '</span>';
        return '<div class="foe-line">' + UI.partyChip(c) + '<span>' + UI.esc(c.short) + ' → <b>' + Game.Data.REGION[p.it.region].name + '</b>で' + p.it.what + '</span>' + eff + '</div>';
      }).join('') + '</section>';

    const free = B.promiseFree - camp.promises.length;
    const promise = '<section class="panel" id="promise"><h2>背負っている約束<small>' +
      (free > 0 ? 'あと' + free + 'つまで不利なし' : 'これ以上は全地区 −' + B.promisePenalty) + '</small></h2>' +
      (camp.promises.length ? camp.promises.map(function (id) {
        const p = Game.Data.PROMISES[id];
        return '<div class="pr-line"><span class="pr-dot">約</span><span><b>' + p.policy + '</b>(' + p.org + ')</span></div>';
      }).join('') : '<p class="pr-note">まだ何も約束していない。</p>') +
      '<p class="pr-note">約束は、当選したあとの任期までついてくる。果たせば次の選挙で推薦に、破れば「破った約束」になって返ってくる。</p></section>';
    return detail + foe + promise;
  }
  function handHtml(camp, selCard) {
    const B = Game.Balance;
    let pips = '';
    for (let i = 0; i < B.campaign.energy; i++) pips += '<i class="pip' + (i < camp.energy ? ' on' : '') + '"></i>';
    const cards = camp.hand.map(function (c) {
      const d = Game.Data.CARDS[c.id], b = B.cards[c.id], t = Game.Data.cardText(c.id);
      let cost = '';
      for (let i = 0; i < b.cost; i++) cost += '<i></i>';
      if (!b.cost) cost = '<span class="free">体力0</span>';
      const money = b.money > 0 ? '資金 ' + b.money + '万円' : b.money < 0 ? '' : '資金いらず';
      return '<button type="button" class="card' + (selCard && selCard.uid === c.uid ? ' sel' : '') + (C.canPlay(camp, c.id).ok ? '' : ' off') + '" data-type="' + d.type + '" data-uid="' + c.uid + '">' +
        '<span class="c-top"><span class="c-icon">' + UI.icon(d.icon) + '</span><span class="c-type">' + Game.Data.CARD_TYPES[d.type] + '</span>' +
        '<span class="c-cost" title="体力 ' + b.cost + '">' + cost + '</span></span>' +
        '<b class="c-name">' + d.name + '</b><span class="c-fx">' + t.fx + '</span><span class="c-note">' + t.note + '</span><span class="c-money">' + money + '</span></button>';
    }).join('');
    let prompt;
    if (!selCard) {
      const playable = camp.hand.some(function (c) { return C.canPlay(camp, c.id).ok; });
      prompt = playable ? 'カードを選ぶと、どの地区でどれだけ伸びるかが地図に出る。' : '今日はここまで。この日を終えよう。';
    } else if (C.isTarget(selCard.id)) {
      prompt = '<b>「' + Game.Data.CARDS[selCard.id].name + '」</b>を使う地区を地図で選ぶ。';
    } else {
      prompt = '<b>「' + Game.Data.CARDS[selCard.id].name + '」</b><button type="button" class="btn-go" id="playNow">' + (B.cards[selCard.id].curse ? '謝りに行く' : '使う') + '</button>';
    }
    const last = camp.day >= B.campaign.days;
    return '<footer class="hand"><div class="turn panel">' +
      '<div class="energy"><span class="e-lab">今日の体力</span><span class="pips">' + pips + '</span><span class="deck-n">山札 ' + camp.deck.length + '・捨て札 ' + camp.discard.length + '</span></div>' +
      '<div class="prompt" id="prompt">' + prompt + '</div>' +
      '<div class="turn-btns"><button type="button" class="btn btn-undo" id="undo"' + (Game.canUndo() ? '' : ' disabled') + '>' + UI.icon('undo') + '<span>取り消す</span></button>' +
      '<button type="button" class="btn-main" id="endDay">' + (last ? '投票日へ' : 'この日を終える') + '</button></div>' +
      '</div><div class="cards" id="cards" aria-label="手札">' + cards + '</div></footer>';
  }

  // ---------- 朝の知らせ ----------
  function showPending(app) {
    const s = Game.state, camp = s.camp, p = camp.pending[0], B = Game.Balance;
    const next = function () { C.dismiss(s); Game.save(); render(app); };
    if (p.type === 'intro') {
      const rv = C.cand(camp, C.topRival(camp));
      UI.modal('<p class="m-kicker">1日目・公示</p><h2>選挙戦が始まった</h2>' +
        '<p>' + UI.esc(Game.Data.DISTRICT.name) + 'の議席を、' + UI.esc(rv.name) + '候補(' + Game.Data.PARTIES[rv.party].short + '・' + Game.Data.ROLE_NAMES[rv.role] + ')たちと争う。いまは大きく離されている。</p>' +
        '<ul class="m-list"><li>手札のカードを選び、地図の地区を押して使う。1日の体力は' + B.campaign.energy + '。</li>' +
        '<li>相手の今日の動きは、地図の札の下と右の欄に出ている。</li><li>使ったカードは、その日のうちなら取り消せる。</li></ul>',
        [{ label: '選挙戦へ', primary: true, onClick: next }]);
    } else if (p.type === 'again') {
      // 2回目からの選挙:任期の結果が返ってくる
      const cr = s.career, cb = camp.comeback, me = C.cand(camp, 'me');
      const org = function (id) { return Game.Data.PROMISES[id].org; };
      const li = [];
      li.push(['', '今回は<b>' + Game.Data.ROLE_NAMES[me.role] + '</b>として戦う。']);
      if (cb.base) li.push(['kept', '任期のあいだに固めた地盤が、始まりの支持になった(地区の合計 +' + cb.base + ')。']);
      cb.endorse.forEach(function (id) { li.push(['kept', org(id) + 'との約束を守った。<b>推薦のカード</b>が山札に入っている。']); });
      cb.broken.forEach(function (id) { li.push(['broken', org(id) + 'との約束を破った。' + Game.Data.REGION[Game.Data.PROMISES[id].region].name + 'の支持が下がり、<b>「破った約束」のカード</b>が山札に混ざっている。']); });
      cb.light.forEach(function (id) { li.push(['light', org(id) + 'との約束は途中までだった。' + Game.Data.REGION[Game.Data.PROMISES[id].region].name + 'の支持が少し下がっている。']); });
      cb.carried.forEach(function (id) { li.push(['carried', org(id) + 'との約束は、持ち越したまま背負っている。']); });
      if (cb.stars) li.push(['kept', '党への貢献が認められ、党幹部の応援が ' + cb.stars + '枚 増えた。']);
      if (cb.money) li.push(['', '任期で集めた資金 ' + cb.money + '万円を持ち込んだ。']);
      UI.modal('<p class="m-kicker">' + (cr.elections + 1) + '回目の選挙・公示</p><h2>' + (cr.status === 'member' ? '議席を守る戦い' : '議席を取り戻す戦い') + '</h2>' +
        '<ul class="m-lines">' + li.map(function (x) { return '<li class="ml-' + x[0] + '">' + x[1] + '</li>'; }).join('') + '</ul>',
        [{ label: '選挙戦へ', primary: true, onClick: next }]);
    } else if (p.type === 'poll') {
      const rows = C.ranking(p.overall).map(function (id) {
        const c = C.cand(camp, id);
        return '<div class="row" style="--pc:' + UI.color(c) + '">' + UI.partyChip(c) + '<span class="nm">' + UI.esc(c.short) + '</span><span class="bar"><i style="width:' + p.overall[id] + '%"></i></span><span class="pct">' + Math.round(p.overall[id]) + '%</span></div>';
      }).join('');
      UI.modal('<p class="np-name">北陽新聞<span>' + camp.day + '日目・朝刊</span></p><h2 class="np-head">' + UI.esc(p.headline) + '</h2>' +
        '<p class="np-sub">' + UI.esc(Game.Data.DISTRICT.name) + ' 中盤の情勢調査</p>' + rows +
        '<p class="np-foot">投票日には、どの候補にも地区ごとに数ポイントのぶれが出る。</p>',
        [{ label: '新聞を閉じる', primary: true, onClick: next }], 'paper');
    } else if (p.type === 'debate') {
      const D = B.debate, rv = C.cand(camp, C.topRival(camp));
      const choose = function (opt) { return function () { C.chooseDebate(s, opt); Game.clearUndo(); Game.save(); render(app); }; };
      UI.modal('<p class="m-kicker">' + camp.day + '日目・公開討論会</p><h2>何を前に出して話す?</h2>' +
        '<p>候補者がそろう討論会。会場とテレビの前で、有権者が見ている。</p>',
        [
          { label: '<b>相手の弱点を突く</b><span>' + Math.round(D.attack.chance * 100) + '%で' + UI.esc(rv.short) + '候補が全地区 ' + D.attack.hit + '。外すと自分が全地区 ' + D.attack.miss + '</span>', onClick: choose('attack') },
          { label: '<b>政策を語る</b><span>確実に、全地区で +' + D.policy.all + '</span>', onClick: choose('policy') },
          { label: '<b>地元の暮らしを語る</b><span>高齢層・子育て世帯の地区で +' + D.local.gain + '</span>', onClick: choose('local') },
        ], 'choices');
    } else {
      UI.modal('<p class="m-kicker">' + camp.day + '日目</p><h2>' + UI.esc(p.title) + '</h2><p>' + UI.esc(p.text) + '</p>',
        [{ label: 'わかった', primary: true, onClick: function () { pendingFx = pendingFx.concat(p.fx || []); next(); } }]);
    }
  }
  function flushFx(camp) {
    const seen = {};
    pendingFx.forEach(function (f) {
      const n = seen[f.region] = (seen[f.region] || 0) + 1;
      const c = C.cand(camp, f.who);
      const text = f.blocked ? '止めた' : UI.signed(f.gain);
      setTimeout(function () { UI.floatOn(f.region, text, c.player ? null : UI.color(c)); }, (n - 1) * 380);
    });
    pendingFx = [];
  }

  // ---------- 操作 ----------
  function render(app) {
    const s = Game.state, camp = s.camp;
    const selCard = camp.hand.filter(function (c) { return c.uid === Game.ui.card; })[0] || null;
    app.innerHTML = '<div class="game">' + hudHtml(s) + raceHtml(camp) +
      '<main class="board"><div class="map-cell">' +
      UI.mapHtml(function (rid) { return UI.leadFill(camp.cands, camp.shares[rid]); }, camp.sel) +
      '</div><aside class="side">' + sideHtml(camp, selCard) + '</aside></main>' + handHtml(camp, selCard) + '</div>';
    app.querySelector('#pins').innerHTML = pinsHtml(camp, selCard);

    const say = function (text) { camp.news = text; Game.ui.card = null; render(app); };
    const doPlay = function (regionId) {
      const ok = C.canPlay(camp, selCard.id);
      if (!ok.ok) return say(ok.reason);
      Game.pushUndo();
      const res = C.play(s, selCard.uid, regionId);
      Game.ui.card = null;
      pendingFx = res.fx || [];
      Game.save();
      render(app);
    };
    app.querySelector('.map').addEventListener('click', function (e) {
      const t = e.target.closest('[data-id]');
      if (!t) return;
      if (selCard && C.isTarget(selCard.id)) return doPlay(t.dataset.id);
      camp.sel = t.dataset.id;
      render(app);
    });
    app.querySelector('#cards').addEventListener('click', function (e) {
      const b = e.target.closest('.card');
      if (!b) return;
      const uid = +b.dataset.uid;
      const card = camp.hand.filter(function (c) { return c.uid === uid; })[0];
      const ok = C.canPlay(camp, card.id);
      if (!ok.ok) return say(ok.reason);
      Game.ui.card = Game.ui.card === uid ? null : uid;
      render(app);
    });
    const now = app.querySelector('#playNow');
    if (now) now.onclick = function () { doPlay(null); };
    app.querySelector('#undo').onclick = function () { pendingFx = []; Game.undo(); };
    const finish = function () {
      const res = C.endDay(s);
      if (!res.ok) return;
      Game.clearUndo();
      Game.ui.card = null;
      pendingFx = res.over ? [] : res.fx;
      Game.save();
      Game.render();
    };
    app.querySelector('#endDay').onclick = function () {
      const idle = camp.energy > 0 && camp.hand.some(function (c) { return C.canPlay(camp, c.id).ok && Game.Balance.cards[c.id].cost <= camp.energy; });
      if (!idle) return finish();
      UI.modal('<h2>まだ動ける</h2><p>体力が ' + camp.energy + ' 残っていて、使えるカードがある。この日を終える?</p>',
        [{ label: 'もどる' }, { label: '終える', primary: true, onClick: finish }]);
    };
    app.querySelector('#menu').onclick = function () {
      UI.modal('<h2>メニュー</h2><p>ここまでの選挙戦は自動で記録されている。タイトルの「つづきから」で再開できる。</p>',
        [{ label: 'とじる' }, { label: 'タイトルへ', primary: true, onClick: Game.toTitle }]);
    };

    if (camp.pending.length) showPending(app);
    else flushFx(camp);
  }

  return { render: render };
})();
