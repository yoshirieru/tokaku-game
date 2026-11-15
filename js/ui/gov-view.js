// 政権の画面(R5):総選挙のあとの政権づくり(誰と組むか)と、党首の任期(首相・連立与党・野党)で任期の画面に差し込む部品。
// 任期の画面の骨組み・手札・操作は term-view.js のまま。党首のときだけ、上の帯・地図・右の列・知らせをここが描く。
window.Game = window.Game || {};

Game.GovView = (function () {
  const UI = Game.UI, K = Game.Career;
  const P = function (id) { return Game.Data.PROMISES[id]; };
  const party = function (id) { return Game.Data.PARTIES[id]; };
  const leaderOf = function (s, id) { return id === s.player.party ? s.player.name.split(/[ 　]/)[0] : Game.Data.LEADERS[id].short; };
  const pips = function (n, max, cls) { let h = ''; for (let i = 0; i < max; i++) h += '<i class="' + cls + (i < n ? ' on' : '') + '"></i>'; return h; };
  const ROLE = { pm: '首相', junior: '党首・連立与党', opposition: '党首・野党' };

  function active(cr) { return !!(cr && cr.leader && cr.gov); }
  function badge(cr) { return ROLE[cr.gov.role]; }

  // ---------- 任期の画面に差し込む部品 ----------
  // 上の帯:内閣支持率。首相は解散のボタン、ほかは解散の見込み
  function barHtml(s) {
    const cr = s.career, gov = cr.gov, g = Game.Balance.gov, T = Game.Balance.term;
    const a = Math.round(gov.approval), bonus = Game.Gov.electionBonus(gov);
    const whose = gov.role === 'pm' ? 'あなたの内閣' : leaderOf(s, gov.pm) + '内閣';
    let right;
    if (gov.role === 'pm') {
      const can = K.canDissolve(cr);
      right = '<button type="button" class="btn btn-dissolve" id="dissolve"' + (can ? '' : ' disabled') + ' title="' +
        (cr.turn < g.dissolveFrom ? g.dissolveFrom + '会期目から解散できる' : '総選挙に打って出る') + '">解散する</button>';
    } else {
      const pct = Math.round(K.dissolveChance(cr) * 100);
      right = '<span class="wind-left">' + (cr.turn >= T.turns ? 'この会期で任期満了' : '解散の見込み ' + pct + '%') + '</span>';
    }
    return '<section class="race panel wind gov-bar" aria-label="内閣支持率"><span class="race-lab">内閣支持率</span>' +
      '<div class="wind-bar appr"><i style="width:' + a + '%"></i>' + (gov.role === 'pm' ? '<span class="maj-mark" style="left:' + g.lowApproval + '%" title="退陣ライン"></span>' : '') + '</div>' +
      '<span class="wind-text">' + whose + ' <b>' + a + '%</b><small class="gov-eff">総選挙に ' + UI.signed(bonus) + '</small></span>' + right + '</section>';
  }
  // 地図:この前の総選挙で、どの党がそのブロックを取ったか
  function mapFill(s) {
    const cr = s.career;
    return function (rid) {
      const b = cr.blocks && cr.blocks[rid];
      return b ? { color: party(b.lead).color, mix: 48 } : null;
    };
  }
  function pinsHtml(s) {
    const cr = s.career;
    return Game.Data.DISTRICT.regions.map(function (r) {
      const b = cr.blocks && cr.blocks[r.id];
      return '<div class="pin static" style="left:' + r.x + '%;top:' + r.y + '%"><b>' + r.name + '</b>' +
        (b ? '<span class="mk">' + party(b.lead).short + '</span><span class="ct-open">' + b.mine + ' / ' + (r.smd + r.pr) + '</span>' : '<span class="ct-open">' + (r.smd + r.pr) + '議席</span>') + '</div>';
    }).join('');
  }
  // 右の列:公約、総選挙への備え、政権
  function sideHtml(s, sel, kind) {
    const cr = s.career, gov = cr.gov, g = Game.Balance.gov, T = Game.Balance.term, NB = Game.Balance.nation;
    let pr;
    if (gov.role === 'opposition') {
      pr = '<p class="pr-note">野党では、公約を法律にできない。政権の弱いところを突き、党をまとめて、次の総選挙に備える。</p>';
    } else {
      const open = cr.promises.map(function (p) {
        const safe = p.turns < T.graceTurns;
        const tag = safe ? '<span class="pr-tag safe">いま解散なら責めなし</span>'
          : p.progress > 0 ? '<span class="pr-tag warn">途中まで</span>' : '<span class="pr-tag bad">手つかず</span>';
        const add = sel && kind === 'promise' ? '<span class="pred">+' + T.cards[sel.id].promise + '</span>' : '';
        const whose = gov.adopted === p.id ? party(gov.partner).short + 'の公約(連立の条件)' : P(p.id).national ? 'あなたの公約' : P(p.id).org;
        return '<button type="button" class="pr-item' + (sel && kind === 'promise' ? ' pick' : '') + '" data-promise="' + p.id + '">' +
          '<span class="pr-dot">約</span><span class="pr-body"><b>' + P(p.id).policy + '</b><small>' + whose + '</small></span>' +
          '<span class="pr-prog">' + pips(p.progress, T.promiseGoal, 'pp') + '</span>' + tag + add + '</button>';
      }).join('');
      const kept = cr.next.endorse.map(function (id) {
        return '<div class="pr-line kept"><span class="pr-dot ok">済</span><span><b>' + P(id).policy + '</b> を果たした</span></div>';
      }).join('');
      pr = (open || kept) ? open + kept : '<p class="pr-note">果たすべき公約はない。</p>';
    }
    const promises = '<section class="panel" id="promises"><h2>公約<small>' + (cr.promises.length && gov.role !== 'opposition' ? '解散までに果たせないと、総選挙で全ブロック ' + NB.brokenAll : '守った ' + cr.kept + '・破った ' + cr.broken) + '</small></h2>' + pr + '</section>';

    const bonus = Game.Gov.electionBonus(gov), unity = Math.min(NB.unityMax, Math.floor(cr.contrib / NB.unityPer));
    const keptN = Math.min(NB.keptMax, cr.next.endorse.length) * NB.keptAll;
    const fatigue = gov.role === 'pm' ? Math.min(g.fatigueMax, Math.max(0, (cr.pmStreak || 1) - 1)) * g.fatiguePer : 0;
    const why = gov.role === 'pm' ? '50%より高いほど追い風' : gov.role === 'junior' ? '与党として、半分だけ響く' : '相手の支持率が低いほど追い風';
    const prep = '<section class="panel" id="prep"><h2>次の総選挙への備え<small>全ブロックの始まりの支持</small></h2>' +
      '<div class="prep-row"><span>党の議席</span><b>' + cr.partySeats + '</b><small>過半数は ' + NB.majority + '</small></div>' +
      '<div class="prep-row"><span>内閣支持率</span><b>' + UI.signed(bonus) + '</b><small>' + why + '</small></div>' +
      '<div class="prep-row"><span>党の結束</span><b>+' + unity + '</b><small>' + (unity >= NB.unityMax ? 'これ以上は増えない' : '党への貢献 ' + cr.contrib + '(あと' + (NB.unityPer - cr.contrib % NB.unityPer) + 'で +1)') + '</small></div>' +
      '<div class="prep-row"><span>守った公約</span><b>+' + keptN + '</b><small>1つにつき +' + NB.keptAll + '(' + NB.keptMax + 'まで)</small></div>' +
      (fatigue ? '<div class="prep-row"><span>政権への飽き</span><b>−' + fatigue + '</b><small>続けて ' + cr.pmStreak + '期目の政権</small></div>' : '') + '</section>';

    let body;
    if (gov.role === 'pm') {
      body = gov.partner
        ? '<div class="pr-line">' + UI.partyChip({ party: gov.partner }) + '<span><b>' + party(gov.partner).name + '</b>と連立</span></div>' +
          '<div class="sat"><span>満足度</span><div class="wind-bar"><i style="width:' + gov.sat + '%"></i><span class="maj-mark" style="left:' + g.satLeave + '%"></span></div><b>' + Math.round(gov.sat) + '</b></div>' +
          ''
        : '<p class="pr-note">単独過半数の政権。連立相手に気をつかう必要はない。</p>';
      body += '<p class="pr-note' + (gov.approval < g.lowApproval ? ' warn' : '') + '">' + (gov.partner ? '満足度は会期ごとに −' + g.satDecay + '。' + g.satLeave + ' を切ると連立が壊れる。' : '') + '支持率 ' + g.lowApproval + '% 未満(帯の線)が ' + g.lowTurns + ' 会期続くと、退陣。' + (gov.low ? 'いま ' + gov.low + ' 会期目。' : '') + '</p>';
    } else if (gov.role === 'junior') {
      body = '<div class="pr-line">' + UI.partyChip({ party: gov.pm }) + '<span><b>' + leaderOf(s, gov.pm) + '内閣</b>の連立与党</span></div>' +
        '<p class="pr-note">与党として公約を進められる。解散の時期は、首相が決める。</p>';
    } else {
      body = '<div class="pr-line">' + UI.partyChip({ party: gov.pm }) + '<span>政権は<b>' + party(gov.pm).name + '</b>' + (gov.partner ? 'と' + party(gov.partner).name : '') + '</span></div>' +
        '<p class="pr-note">「国会で追及」で相手の内閣の支持率を下げると、次の総選挙で追い風になる。</p>';
    }
    return promises + prep + '<section class="panel" id="govpanel"><h2>政権</h2>' + body + '</section>';
  }

  // ---------- 知らせ(党首のときの、任期の始まりと解散)。扱ったら true ----------
  function pending(app, p, next, rerender) {
    const s = Game.state, cr = s.career, gov = cr.gov, g = Game.Balance.gov, T = Game.Balance.term;
    if (p.type === 'start') {
      const list = cr.promises.length ? '<ul class="m-list">' + cr.promises.map(function (x) {
        return '<li><b>' + P(x.id).policy + '</b>' + (gov.adopted === x.id ? '(' + party(gov.partner).short + 'の公約。連立の条件)' : '') + '</li>';
      }).join('') + '</ul>' : '';
      if (gov.role === 'pm') {
        UI.modal('<p class="m-kicker">' + ((cr.pmStreak || 1) > 1 ? '続投' : '首班指名') + '</p><h2>内閣総理大臣に就任</h2>' +
          '<p>' + (gov.partner ? party(gov.partner).name + 'との連立政権を率いる。' : '単独過半数の政権を率いる。') + (cr.promises.length ? '掲げた公約を、この任期のうちに果たす。' : '') + '</p>' + list +
          '<ul class="m-list"><li>内閣支持率は会期ごとに少しずつ下がる。次の総選挙の始まりの支持になって返ってくる。</li>' +
          '<li>' + g.dissolveFrom + '会期目から、好きなときに衆議院を解散できる(上の帯の「解散する」)。</li>' +
          (gov.partner ? '<li>連立相手の満足度が ' + g.satLeave + ' を下回ると、連立を離れて内閣が倒れる。</li>' : '') +
          (gov.posts ? '<li>大臣ポストを渡したので、山札に「党内の不満」が ' + gov.posts + '枚 入っている。</li>' : '') + '</ul>',
          [{ label: '官邸へ', primary: true, onClick: function () { UI.sound('stamp'); next(); } }]);
      } else if (gov.role === 'junior') {
        UI.modal('<p class="m-kicker">連立与党</p><h2>' + leaderOf(s, gov.pm) + '内閣に加わる</h2>' +
          '<p>首相は' + party(gov.pm).name + 'の党首。こちらは与党として、掲げた公約を進められる。</p>' + list +
          '<ul class="m-list"><li>内閣支持率の響きは、首相の党の半分だけ受ける。</li><li>解散の時期は首相が決める(上の帯の見込み)。</li></ul>',
          [{ label: '国会へ', primary: true, onClick: next }]);
      } else {
        UI.modal('<p class="m-kicker">' + (gov.lostPower ? '政権交代' : '野党') + '</p><h2>' + (gov.lostPower ? '政権を失った' : '野党党首として') + '</h2>' +
          '<p>政権は' + party(gov.pm).name + (gov.partner ? 'と' + party(gov.partner).name : '') + '。' + (cr.dropped ? '掲げた公約は、果たす場がなく白紙になった。' : '') + '次の総選挙で政権をねらう。</p>' +
          '<ul class="m-list"><li>「国会で追及」で相手の内閣の支持率を下げると、総選挙で追い風になる。</li><li>「党内融和」「全国行脚」で党をまとめると、全ブロックの支持が上がる。</li></ul>',
          [{ label: '国会へ', primary: true, onClick: next }]);
      }
      return true;
    }
    if (p.type === 'dissolve') {
      const lines = p.lines.length ? '<ul class="m-lines">' + p.lines.map(function (l) { return '<li class="ml-' + l.kind + '">' + UI.esc(l.text) + '</li>'; }).join('') + '</ul>' : '';
      const head = p.reason === 'collapse' ? '連立が壊れ、内閣が倒れた' : p.reason === 'pm' ? '衆議院を解散した' : p.full ? '任期満了' : '衆議院解散';
      const text = p.reason === 'collapse' ? party(gov.partner).name + 'が連立を離れた。過半数を失い、総選挙で信を問うしかない。内閣支持率も下がった。'
        : p.reason === 'pm' ? '首相として、総選挙に打って出る。' : p.full ? '4年の任期が終わった。総選挙が行われる。' : leaderOf(s, gov.pm) + '首相が衆議院を解散した。総選挙が始まる。';
      UI.modal('<p class="m-kicker">' + UI.esc(p.session) + '</p><h2>' + head + '</h2><p>' + text + '</p>' + lines +
        '<ul class="m-list"><li>内閣支持率 ' + p.approval + '% → 総選挙は全ブロックの支持が ' + UI.signed(p.govBonus) + ' から。</li>' +
        (p.unity ? '<li>党の結束で、さらに +' + p.unity + '。</li>' : '') + '</ul>',
        [{ label: '総選挙へ', primary: true, onClick: function () { K.toCampaign(s); Game.clearUndo(); Game.ui.card = null; Game.save(); Game.render(); } }]);
      return true;
    }
    return false;
  }
  // 首相の「解散する」
  function wire(app, s) {
    const b = app.querySelector('#dissolve');
    if (!b) return;
    b.onclick = function () {
      const cr = s.career, bonus = Game.Gov.electionBonus(cr.gov), open = cr.promises.length;
      const late = cr.promises.filter(function (p) { return p.turns + 1 >= Game.Balance.term.graceTurns; }).length;   // 解散すると「果たせなかった」ことになる公約
      UI.modal('<h2>衆議院を解散する</h2><p>いま総選挙に打って出る。内閣支持率は ' + Math.round(cr.gov.approval) + '%(全ブロック ' + UI.signed(bonus) + ')。</p>' +
        '<p>' + (late ? '果たしていない公約が ' + late + ' つある。このまま解散すると、1つにつき内閣支持率 ' + Game.Balance.gov.brokenApproval + '、総選挙で全ブロック ' + Game.Balance.nation.brokenAll + '。'
          : open ? '残っている公約は、まだ日が浅いので責められない。' : '公約はすべて果たしている。') + '</p>',
        [{ label: 'やめておく' }, { label: '解散する', primary: true, onClick: function () { K.dissolve(s); Game.clearUndo(); Game.ui.card = null; Game.save(); Game.render(); } }]);
    };
  }

  // ---------- 政権づくりの画面(総選挙で、どの党も単独過半数に届かなかったとき) ----------
  let draft = {};
  function renderCoalition(app) {
    const s = Game.state, e = s.election, g = Game.Balance.gov, NB = Game.Balance.nation;
    const me = s.player.party, seats = Game.Gov.seatsByParty(s), opts = Game.Gov.options(s);
    const order = Object.keys(seats).sort(function (a, b) { return seats[b] - seats[a]; });
    const segs = order.map(function (p) {
      return '<span class="seg" style="flex:' + seats[p] + ' 1 0;background:' + party(p).color + '"><b>' + party(p).short + '</b>' + seats[p] + '</span>';
    }).join('');
    const prev = e.prevMine, wouldResign = prev != null && seats[me] <= prev * (1 - NB.resignDrop);

    const cards = opts.map(function (o, i) {
      if (o.type === 'lead') {
        const d = draft[o.partner] = draft[o.partner] || { posts: 0, pledge: false };
        const sc = Game.Gov.score(s, o.partner, d), pl = P(g.pledgeOf[o.partner]);
        return '<section class="panel co-card" style="--pc:' + party(o.partner).color + '"><h2>' + party(o.partner).name + 'と連立を組む</h2>' +
          '<p class="co-sub">あなたが<b>首相</b>。合わせて ' + o.seats + '議席(過半数 ' + NB.majority + ')</p>' +
          '<div class="co-meter"><div class="wind-bar"><i style="width:' + Math.min(100, sc.score) + '%"></i><span class="maj-mark" style="left:' + Math.min(100, sc.need) + '%"></span></div>' +
          '<span>前向き度 <b>' + sc.score + '</b> / 要る数 ' + sc.need + '</span></div>' +
          (sc.rival ? '<p class="pr-note">第1党の' + party(sc.rival).name + 'も、' + party(o.partner).short + 'に声をかけている。議席の差(' + sc.gap + ')のぶん、こちらには乗りにくい。</p>' : '') +
          '<div class="co-ctl"><span>大臣ポストを渡す</span><button type="button" class="btn co-step" data-p="' + o.partner + '" data-d="-1">−</button><b>' + d.posts + '</b>' +
          '<button type="button" class="btn co-step" data-p="' + o.partner + '" data-d="1">+</button><small>1つにつき +' + g.post + '。任期の山札に「党内の不満」が1枚</small></div>' +
          '<label class="co-ctl"><input type="checkbox" class="co-pledge" data-p="' + o.partner + '"' + (d.pledge ? ' checked' : '') + '><span>公約「' + pl.policy + '」を受け入れる</span><small>+' + g.pledge + '。果たすべき公約が1つ増える</small></label>' +
          '<button type="button" class="btn btn-primary co-go" data-i="' + i + '"' + (sc.ok ? '' : ' disabled') + '>' + (sc.ok ? '連立を申し入れる' : 'この条件では応じない') + '</button></section>';
      }
      if (o.type === 'join') {
        return '<section class="panel co-card" style="--pc:' + party(o.partner).color + '"><h2>' + party(o.partner).name + 'の政権に入る</h2>' +
          '<p class="co-sub">首相は' + leaderOf(s, o.partner) + '氏。あなたは<b>連立与党</b>の党首。合わせて ' + o.seats + '議席</p>' +
          '<p class="pr-note">与党として、掲げた公約を進められる。内閣支持率の響きは、首相の党の半分。</p>' +
          '<button type="button" class="btn btn-primary co-go" data-i="' + i + '"' + (o.ok ? '' : ' disabled') + '>' + (o.ok ? '連立に入る' : '考えが遠く、組めない') + '</button></section>';
      }
      return '<section class="panel co-card" style="--pc:var(--sub)"><h2>野党として戦う</h2>' +
        '<p class="co-sub">政権は' + party(o.pm).name + (o.partner ? 'と' + party(o.partner).name : '') + 'が担う</p>' +
        '<p class="pr-note">掲げた公約は白紙になる。' + (wouldResign ? '<b>議席を ' + Math.round(NB.resignDrop * 100) + '% 以上減らしたので、政権に入らなければ党首を辞することになる。</b>' : '次の総選挙で政権をねらう。') + '</p>' +
        '<button type="button" class="btn co-go" data-i="' + i + '">' + (wouldResign ? '野党に回り、党首を辞する' : '野党に回る') + '</button></section>';
    }).join('');

    app.innerHTML = '<div class="coalition">' +
      '<header class="co-head"><p class="m-kicker">総選挙のあと・政権づくり</p><h1>誰と組むか</h1>' +
      '<p>どの党も、単独では過半数(' + NB.majority + ')に届かなかった。2つの党が組めば政権ができる。</p>' +
      '<div class="co-seats"><div class="race-bar">' + segs + '</div><span class="maj-mark" style="left:' + (NB.majority / NB.seats * 100) + '%"></span></div></header>' +
      '<div class="co-grid">' + cards + '</div></div>';

    app.querySelectorAll('.co-step').forEach(function (b) {
      b.onclick = function () { const d = draft[b.dataset.p]; d.posts = Math.max(0, Math.min(g.postMax, d.posts + (+b.dataset.d))); renderCoalition(app); };
    });
    app.querySelectorAll('.co-pledge').forEach(function (c) {
      c.onchange = function () { draft[c.dataset.p].pledge = c.checked; renderCoalition(app); };
    });
    app.querySelectorAll('.co-go').forEach(function (b) {
      b.onclick = function () {
        const o = opts[+b.dataset.i];
        const choice = o.type === 'lead' ? Object.assign({}, o, draft[o.partner]) : o;
        if (!Game.Gov.form(s, choice)) return;
        draft = {};
        UI.sound('decide');
        Game.Career.afterElection(s);
        Game.ui.card = null; Game.clearUndo(); Game.save(); Game.render();
      };
    });
  }

  return { active: active, badge: badge, barHtml: barHtml, mapFill: mapFill, pinsHtml: pinsHtml, sideHtml: sideHtml, pending: pending, wire: wire, renderCoalition: renderCoalition };
})();
