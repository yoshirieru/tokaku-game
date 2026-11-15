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
      '<div class="who"><span class="seat">' + UI.esc(Game.Data.DISTRICT.name) + '</span>' + (me.tag ? '<span class="vs-tag">' + me.tag + '</span>' : '') + UI.partyChip(me) + '<b class="pname">' + UI.esc(me.name) + '</b></div>' +
      '<ol class="days" aria-label="選挙戦の日程">' + dots + '</ol>' +
      '<div class="res"><span class="lab">資金</span><b>' + camp.money + '</b><small>万円</small></div>' +
      '<div class="ticker"><span class="tk-lab">速報</span><span id="news">' + UI.esc(camp.news) + '</span></div>' +
      '<button type="button" class="icon-btn" id="menu" aria-label="メニュー">' + UI.icon('menu') + '</button>' +
      '</header>';
  }
  function raceHtml(camp) {
    if (Game.Data.DISTRICT.national) {   // 全国:いまの支持から見た議席の見込み
      const seats = Game.Vote.project(camp), NB = Game.Balance.nation;
      const ord = C.ranking(seats);
      const segs = ord.map(function (id) {
        const c = C.cand(camp, id);
        return '<span class="seg" style="flex:' + seats[id] + ' 1 0;background:' + UI.color(c) + '"><b>' + Game.Data.PARTIES[c.party].short + '</b>' + seats[id] + '</span>';
      }).join('');
      const lv = seats.me >= NB.majority ? 'good' : ord[0] === 'me' ? 'even' : 'bad';
      return '<section class="race panel" aria-label="議席の見込み"><span class="race-lab">議席の見込み</span><div class="race-bar">' + segs + '</div>' +
        '<span class="race-mark"><span class="mk mk-' + lv + '">' + seats.me + '議席</span><small class="maj-small">過半数 ' + NB.majority + '</small></span></section>';
    }
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
      '<div class="d-head"><h2>' + r.name + '</h2>' + UI.markHtml(C.margin(s)) + '<span class="voters">' + (r.smd ? '小選挙区 ' + r.smd + '・比例 ' + r.pr : '有権者 ' + man(r.voters)) + '</span></div>' +
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
      '<p class="pr-note">' + (Game.Data.DISTRICT.national ? '公約は、政権に入れば任期のうちに果たすことになる。野党に回れば白紙。' : '約束は、当選したあとの任期までついてくる。果たせば次の選挙で推薦に、破れば「破った約束」になって返ってくる。') + '</p>' + ethicHtml(camp) + '</section>';
    return detail + foe + promise;
  }
  // 政治とカネ(R9)と、開票立会人(R10)
  function ethicHtml(camp) {
    const t = UI.ethicText(Game.state), F = Game.Balance.fraud;
    // 1画面に収めるため、1行ずつ(説明は title に)
    let html = '<p class="ethic' + (t.bad ? ' warn' : '') + '" title="' + UI.esc(t.note) + '"><span>政治とカネ</span><b>' + t.value + (t.bad ? '・発覚度 ' + Math.round(Game.Scandal.get(Game.state).exposure) : '') + '</b></p>';
    if (!Game.Data.DISTRICT.national && !camp.vs) {
      html += '<p class="ethic witness" title="開票所の不審な動きに備える。送っていれば、その場で再集計させられる"><span>開票立会人' + (Game.Scandal.risk() >= 0.5 ? '(違反の多い土地柄)' : '') + '</span>' +
        (camp.witness ? '<b>送った</b>' : '<button type="button" class="btn-go" id="witness">送る ' + F.witness + '万円</button>') + '</p>';
    }
    return html;
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
      prompt = playable ? 'カードを選ぶと、どの地区でどれだけ伸びるかが地図に出る。ダブルクリックですぐ使える。' : '今日はここまで。この日を終えよう。';
    } else if (C.isTarget(selCard.id)) {
      prompt = '<b>「' + Game.Data.CARDS[selCard.id].name + '」</b>を使う地区を地図で選ぶ。<small>ダブルクリックなら' + Game.Data.REGION[camp.sel].name + 'で使う</small>';
    } else {
      prompt = '<b>「' + Game.Data.CARDS[selCard.id].name + '」</b><button type="button" class="btn-go" id="playNow">' + (B.cards[selCard.id].curse ? '謝りに行く' : '使う') + '</button>';
    }
    const last = camp.day >= B.campaign.days;
    return '<footer class="hand"><div class="turn panel">' +
      '<div class="energy"><span class="e-lab">今日の体力</span><span class="pips">' + pips + '</span><span class="deck-n">山札 ' + camp.deck.length + '・捨て札 ' + camp.discard.length + '</span></div>' +
      '<div class="prompt" id="prompt">' + prompt + '</div>' +
      '<div class="turn-btns"><button type="button" class="btn btn-undo" id="undo" title="カードを使う前に戻す(Ctrl+Z)"' + (Game.canUndo() ? '' : ' disabled') + '>' + UI.icon('undo') + '<span>取り消す</span></button>' +
      '<button type="button" class="btn-main" id="endDay">' + (camp.vs && !camp.vs.done[1 - camp.vs.active] ? '番を終えて交代' : last ? '投票日へ' : 'この日を終える') + '</button></div>' +
      '</div><div class="cards" id="cards" aria-label="手札">' + cards + '</div></footer>';
  }

  // 政治とカネ(R9)・国替え(R10・R11)の持ち越しを、知らせの行にする
  function ethicLines(e, li, where) {
    if (!e) return;
    const L = Game.Balance.slush;
    if (e.moved) li.push(['', Game.Data.SEATS[e.moved].name + 'に移って、初めての選挙。相手も地元も新しい。']);
    if (e.merged) li.push(['light', '区割り改定で選挙区が広がった。新しい地域は、一から回ることになる。']);
    if (e.clean) li.push(['kept', '「クリーン」の評判で、' + where + 'の支持が +' + e.clean + '。' + (e.sns ? 'SNSのカードも +' + e.sns + '。' : '')]);
    if (e.penalty) li.push(['broken', '裏金の発覚の余波が残っている(' + where + ' ' + e.penalty + ')。']);
    if (e.unendorsed) li.push(['broken', '党の公認を取り消された。党幹部の応援は来ない。']);
  }

  // ---------- 朝の知らせ ----------
  function showPending(app) {
    const s = Game.state, camp = s.camp, p = camp.pending[0], B = Game.Balance;
    const next = function () { C.dismiss(s); Game.save(); render(app); };
    if (p.type === 'vsIntro') {   // 対戦モードの1日目
      const vs = camp.vs, other = C.cand(camp, 'vs'), ai = camp.cands.filter(function (c) { return !c.human; })[0];
      UI.modal('<p class="m-kicker">1日目・公示</p><h2>対戦が始まった</h2>' +
        '<p>' + UI.esc(Game.Data.DISTRICT.name) + 'で、' + UI.esc(other.name) + 'さん(' + other.tag + '・' + Game.Data.PARTIES[other.party].short + ')と票を競う。議席には、' + UI.esc(ai.name) + '候補(' + Game.Data.PARTIES[ai.party].short + '・' + Game.Data.ROLE_NAMES[ai.role] + ')も挑んでいる。</p>' +
        '<ul class="m-list"><li>手札のカードを選び、地図の地区を押して使う(ダブルクリックですぐ使える)。1日の体力は' + B.campaign.energy + '。</li>' +
        '<li>使い終えたら「番を終えて交代」。相手には、あなたが使ったカードが知らされる。</li>' +
        '<li>2人とも落選しても、票の多いほうが対戦の勝ち。</li></ul>',
        [{ label: '選挙戦へ', primary: true, onClick: next }]);
    } else if (p.type === 'intro') {
      const rv = C.cand(camp, C.topRival(camp));
      UI.modal('<p class="m-kicker">1日目・公示</p><h2>選挙戦が始まった</h2>' +
        '<p>' + UI.esc(Game.Data.DISTRICT.name) + 'の議席を、' + UI.esc(rv.name) + '候補(' + Game.Data.PARTIES[rv.party].short + '・' + Game.Data.ROLE_NAMES[rv.role] + ')たちと争う。いまは大きく離されている。</p>' +
        '<ul class="m-list"><li>手札のカードを選び、地図の地区を押して使う。1日の体力は' + B.campaign.energy + '。</li>' +
        '<li>相手の今日の動きは、地図の札の下と右の欄に出ている。</li><li>使ったカードは、その日のうちなら取り消せる。</li></ul>',
        [{ label: '選挙戦へ', primary: true, onClick: next }]);
    } else if (p.type === 'again' && camp.comeback && camp.comeback.national) {
      // 党首として戦う総選挙
      const cb = camp.comeback, NB = B.nation, party = Game.Data.PARTIES[s.player.party].name, li = [];
      li.push(['', NB.seats + '議席を争う。過半数は <b>' + NB.majority + '</b>。' + party + 'のいまの議席は <b>' + cb.prevMine + '</b>。']);
      if (cb.wind) li.push([cb.wind > 0 ? 'kept' : 'broken', '今回の選挙は、' + party + 'に<b>' + (cb.wind > 0 ? '追い風' : '逆風') + '</b>が吹いている(全ブロック ' + UI.signed(cb.wind) + ')。']);
      if (cb.govBonus) {
        const gw = cb.govRole === 'pm' ? 'あなたの内閣の支持率は ' + cb.approval + '%。' : cb.govRole === 'junior' ? '連立与党として、内閣支持率 ' + cb.approval + '% の響きを半分受ける。' : '相手の内閣の支持率は ' + cb.approval + '%。';
        li.push([cb.govBonus > 0 ? 'kept' : 'broken', gw + (cb.govBonus > 0 ? '追い風になっている' : '逆風になっている') + '(全ブロック ' + UI.signed(cb.govBonus) + ')。']);
      }
      if (cb.fatigue) li.push(['broken', '長く政権を担ってきたことに、飽きが出ている(全ブロック ' + UI.signed(cb.fatigue) + ')。']);
      if (cb.unity) li.push(['kept', '党のために働いてきたことで、党がまとまっている(全ブロック +' + cb.unity + ')。']);
      if (cb.kept) li.push(['kept', '党首が約束を守ってきたことが、信頼になっている(全ブロック +' + cb.kept + ')。']);
      if (cb.broken) li.push(['broken', '党首が約束を破ったことが、全国で報じられている(全ブロック ' + cb.broken + ')。']);
      ethicLines(cb.ethic, li, '全ブロック');
      li.push(['', 'カードは全国用。選ぶのは11のブロック。上の帯に、いまの支持から見た<b>議席の見込み</b>が出る。']);
      UI.modal('<p class="m-kicker">総選挙・公示</p><h2>党首として、全国を戦う</h2>' +
        '<ul class="m-lines">' + li.map(function (x) { return '<li class="ml-' + x[0] + '">' + x[1] + '</li>'; }).join('') + '</ul>',
        [{ label: '選挙戦へ', primary: true, onClick: next }]);
    } else if (p.type === 'again') {
      // 2回目からの選挙:任期の結果が返ってくる
      const cr = s.career, cb = camp.comeback, me = C.cand(camp, 'me');
      const org = function (id) { return Game.Data.PROMISES[id].org; };
      const li = [];
      li.push(['', '今回は<b>' + Game.Data.ROLE_NAMES[me.role] + '</b>として戦う。']);
      if (cb.wind) li.push([cb.wind > 0 ? 'kept' : 'broken', '今回の選挙は、' + Game.Data.PARTIES[me.party].name + 'に<b>' + (cb.wind > 0 ? '追い風' : '逆風') + '</b>が吹いている(全地区 ' + UI.signed(cb.wind) + ')。']);
      if (cb.rank) li.push(['kept', cb.rank.name + 'の重みで、全地区の支持が +' + cb.rank.gain + '。']);
      if (cb.base) li.push(['kept', '任期のあいだに固めた地盤が、始まりの支持になった(地区の合計 +' + cb.base + ')。']);
      cb.endorse.forEach(function (id) { li.push(['kept', org(id) + 'との約束を守った。<b>推薦のカード</b>が山札に入っている。']); });
      cb.broken.forEach(function (id) { li.push(['broken', org(id) + 'との約束を破った。' + Game.Data.REGION[Game.Data.PROMISES[id].region].name + 'の支持が下がり、<b>「破った約束」のカード</b>が山札に混ざっている。']); });
      cb.light.forEach(function (id) { li.push(['light', org(id) + 'との約束は途中までだった。' + Game.Data.REGION[Game.Data.PROMISES[id].region].name + 'の支持が少し下がっている。']); });
      cb.carried.forEach(function (id) { li.push(['carried', org(id) + 'との約束は、持ち越したまま背負っている。']); });
      if (cb.stars) li.push(['kept', '党への貢献が認められ、党幹部の応援が ' + cb.stars + '枚 増えた。']);
      if (cb.money) li.push(['', '任期で集めた資金 ' + cb.money + '万円を持ち込んだ。']);
      ethicLines(cb.ethic, li, '全地区');
      UI.modal('<p class="m-kicker">' + (cr.elections + 1) + '回目の選挙・公示</p><h2>' + (me.role === 'revived' ? '選挙区を取りにいく戦い' : cr.status === 'member' ? '議席を守る戦い' : '議席を取り戻す戦い') + '</h2>' +
        '<ul class="m-lines">' + li.map(function (x) { return '<li class="ml-' + x[0] + '">' + x[1] + '</li>'; }).join('') + '</ul>',
        [{ label: '選挙戦へ', primary: true, onClick: next }]);
    } else if (p.type === 'poll') {
      const rows = C.ranking(p.overall).map(function (id) {
        const c = C.cand(camp, id);
        return '<div class="row" style="--pc:' + UI.color(c) + '">' + UI.partyChip(c) + '<span class="nm">' + UI.esc(c.short) + '</span><span class="bar"><i style="width:' + p.overall[id] + '%"></i></span><span class="pct">' + Math.round(p.overall[id]) + '%</span></div>';
      }).join('');
      UI.modal('<p class="np-name">' + UI.esc(Game.Data.DISTRICT.name.replace(/\d+区$/, '')) + '新聞<span>' + camp.day + '日目・朝刊</span></p><h2 class="np-head">' + UI.esc(p.headline) + '</h2>' +
        '<p class="np-sub">' + UI.esc(Game.Data.DISTRICT.name) + ' 中盤の情勢調査</p>' + rows +
        '<p class="np-foot">投票日には、どの候補にも地区ごとに数ポイントのぶれが出る。</p>',
        [{ label: '新聞を閉じる', primary: true, onClick: next }], 'paper');
    } else if (p.type === 'fraud') {   // R10:買収の提案・怪文書
      const F = B.fraud, answer = function (o) { return function () { const r = Game.Scandal.answerFraud(s, o); Game.clearUndo(); Game.save(); render(app); return r; }; };
      if (p.kind === 'bribe') {
        const reg = Game.Data.REGION[p.region].name;
        UI.modal('<p class="m-kicker">' + camp.day + '日目・選挙違反のにおい</p><h2>支援者が耳打ちしてきた</h2>' +
          '<p>「' + reg + 'の顔役たちに、ちょっと包んでおけば票はまとまりますよ。先生は知らなかったことにしておけばいい」</p>',
          [
            { label: '<b>きっぱり断る</b><span>何も起きない</span>', onClick: answer('refuse') },
            { label: '<b>黙認する</b><span>' + reg + 'の支持 +' + F.bribe.gain + '。捜査ゲージ +' + F.bribe.probe + '(陣営幹部が有罪になると連座制で当選無効)</span>', onClick: answer('accept') },
          ], 'choices');
      } else {
        const rv = C.cand(camp, p.who);
        UI.modal('<p class="m-kicker">' + camp.day + '日目・選挙妨害</p><h2>怪文書が出回り、ポスターが破られた</h2>' +
          '<p>「' + UI.esc(s.player.name) + 'の後援会長に借金がある」という出どころ不明の文書が配られ、掲示板のポスターが何枚も破られていた。' + UI.esc(rv.short) + '陣営のしわざだといううわさもある。</p>',
          [
            { label: '<b>反撃する</b><span>' + UI.esc(rv.short) + '候補が全地区 ' + F.smear.hit + '。泥仕合で自分も全地区 ' + F.smear.self + '</span>', onClick: answer('fight') },
            { label: '<b>正々堂々を貫く</b><span>浮動票の地区で +' + F.smear.fair + '(好感度が上がる)</span>', onClick: answer('fair') },
          ], 'choices');
      }
    } else if (p.type === 'debate') {
      const D = B.debate, rv = C.cand(camp, C.topRival(camp));
      const choose = function (opt) { return function () { C.chooseDebate(s, opt); Game.clearUndo(); Game.save(); render(app); }; };
      UI.modal('<p class="m-kicker">' + camp.day + '日目・公開討論会</p><h2>何を前に出して話す?</h2>' +
        '<p>候補者がそろう討論会。会場とテレビの前で、有権者が見ている。</p>',
        [
          { label: '<b>相手の弱点を突く</b><span>' + Math.round(D.attack.chance * 100) + '%で' + UI.esc(rv.short) + '候補が全地区 ' + D.attack.hit + '。外すと自分が全地区 ' + D.attack.miss + '</span>', onClick: choose('attack') },
          { label: '<b>政策を語る</b><span>確実に、全地区で +' + D.policy.all + '</span>', onClick: choose('policy') },
          { label: '<b>地元の暮らしを語る</b><span>高齢層・子育て世帯の地区で +' + D.local.gain + '</span>', onClick: choose('local') },
        ].concat(Game.Scandal.rivalRumor(s) ? [{ label: '<b>裏金を追及する</b><span>' + UI.esc(C.cand(camp, 'vs').short) + '候補の政治資金にうわさがある。確実に全地区 ' + B.slush.pvpHit + '、相手の発覚度 +' + B.slush.pvpExposure + '</span>', onClick: choose('slush') }] : []), 'choices');
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
      setTimeout(function () {
        if (Game.state && Game.state.screen === 'campaign') UI.floatOn(f.region, text, c.player ? null : UI.color(c));   // 画面が変わっていたら出さない
      }, (n - 1) * 380);
    });
    pendingFx = [];
  }

  // ---------- 操作 ----------
  function render(app) {
    const s = Game.state, camp = s.camp;
    if (camp.vs && camp.vs.handoff) return Game.VersusView.renderHandoff(app);   // 対戦モード:交代の画面(手札を見せない)
    const selCard = camp.hand.filter(function (c) { return c.uid === Game.ui.card; })[0] || null;
    app.innerHTML = '<div class="game' + (Game.Data.DISTRICT.national ? ' nat' : '') + '">' + hudHtml(s) + raceHtml(camp) +
      '<main class="board"><div class="map-cell">' +
      UI.mapHtml(function (rid) { return UI.leadFill(camp.cands, camp.shares[rid]); }, camp.sel) +
      '</div><aside class="side">' + sideHtml(camp, selCard) + '</aside></main>' + handHtml(camp, selCard) + '</div>';
    app.querySelector('#pins').innerHTML = pinsHtml(camp, selCard);

    const say = function (text) { camp.news = text; Game.ui.card = null; render(app); };
    // card を使う(ダブルクリックでは選んでいるカードでなくてもよい)。使う前の state を取り消し用に積む
    const doPlay = function (regionId, card, opt) {
      card = card || selCard;
      const ok = C.canPlay(camp, card.id);
      if (!ok.ok) return say(ok.reason);
      // 資金集め(R9):先に、収入をどう記載するかを選ぶ
      if (!opt && Game.Balance.cards[card.id].money < 0) return UI.ledgerChoice(function (o) { doPlay(regionId, card, o); });
      Game.pushUndo();
      const res = C.play(s, card.uid, regionId, opt);
      if (camp.vs && res.ok) Game.Versus.note(s, res.msg);   // 対戦モード:交代のときに相手に知らせる
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
      const dbl = UI.doubleTap('camp' + uid);
      const ok = C.canPlay(camp, card.id);
      if (!ok.ok) return say(ok.reason);
      // ダブルクリック:地区を選ぶカードは、いま選んでいる地区(金の枠)で使う
      if (dbl) return doPlay(C.isTarget(card.id) ? camp.sel : null, card);
      Game.ui.card = Game.ui.card === uid ? null : uid;
      render(app);
    });
    const now = app.querySelector('#playNow');
    if (now) now.onclick = function () { doPlay(null); };
    const wit = app.querySelector('#witness');
    if (wit) wit.onclick = function () {
      Game.pushUndo();
      const r = Game.Scandal.sendWitness(s);
      if (!r.ok) { Game.undo(); return say(r.reason); }
      Game.save(); render(app);
    };
    app.querySelector('#undo').onclick = function () { pendingFx = []; Game.undo(); };
    const finish = function () {
      const res = camp.vs ? Game.Versus.endTurn(s) : C.endDay(s);
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
      UI.modal('<h2>まだ動ける</h2><p>体力が ' + camp.energy + ' 残っていて、使えるカードがある。' + (camp.vs ? 'この番を終える?' : 'この日を終える?') + '</p>',
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
