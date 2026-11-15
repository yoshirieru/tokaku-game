// 党首として戦った総選挙の開票特番(議席が積み上がる)と、結果の画面。部品のクラスは選挙区の開票特番(count-view.js)と共用。
window.Game = window.Game || {};

Game.NationalView = (function () {
  const UI = Game.UI;
  let auto = false, timer = null, prevShown = -1;
  const WEATHER = { sunny: '晴れ', cloudy: 'くもり', rain: '雨' };

  function byId(cands, id) { return cands.filter(function (c) { return c.id === id; })[0]; }
  // 並びは開票中ずっと固定(党の並び)
  function fixedOrder(cands) {
    const ord = Object.keys(Game.Data.PARTIES);
    return cands.slice().sort(function (a, b) { return ord.indexOf(a.party) - ord.indexOf(b.party); });
  }
  const pname = function (c) { return Game.Data.PARTIES[c.party].name; };
  function leadOf(seats) { return Object.keys(seats).sort(function (a, b) { return seats[b] - seats[a]; }); }

  function render(app) {
    const s = Game.state, e = s.election, cands = s.camp.cands, NB = Game.Balance.nation;
    const t = e.shown, tick = e.ticks[t], last = e.ticks.length - 1;
    if (t === 0) prevShown = -1;
    const prev = e.ticks[Math.max(0, prevShown >= 0 && prevShown < t ? prevShown : t)];
    const ord = leadOf(tick.seats);
    const hasMajority = tick.seats[ord[0]] >= NB.majority;
    const justCalled = prevShown < t && ((hasMajority && prev.seats[ord[0]] < NB.majority) || (t === last && !e.majority));
    const scale = function (n) { return n / (NB.seats * 0.68) * 100; };

    const rows = fixedOrder(cands).map(function (c) {
      const v = tick.seats[c.id], pv = prev.seats[c.id];
      let stamp = '';
      if (v >= NB.majority) stamp = '<span class="stamp' + (justCalled ? ' new' : '') + '">過半数</span>';
      else if (t === last && c.id === e.winner) stamp = '<span class="stamp' + (justCalled ? ' new' : '') + '">第1党</span>';
      return '<div class="ct-row' + (c.player ? ' me' : '') + '" style="--pc:' + UI.color(c) + '">' +
        '<div class="ct-name">' + UI.partyChip(c) + '<b>' + pname(c) + '</b><span class="sub">' + UI.esc(c.name) + (c.player ? '・あなた' : '') + '</span>' + stamp + '</div>' +
        '<div class="ct-bar seats"><i style="width:' + scale(pv) + '%" data-w="' + scale(v) + '"></i><span class="maj-mark" style="left:' + scale(NB.majority) + '%"></span></div>' +
        '<div class="ct-votes"><b data-from="' + pv + '" data-to="' + v + '">' + pv + '</b>議席</div></div>';
    }).join('');

    const fill = function (rid) {
      if (!tick.regionPct[rid]) return null;
      return UI.leadFill(cands, e.byBlock[rid].seats);
    };
    const pins = Game.Data.DISTRICT.regions.map(function (r) {
      const f = tick.regionPct[r.id];
      const top = f ? UI.esc(Game.Data.PARTIES[byId(cands, leadOf(e.byBlock[r.id].seats)[0]).party].short) + ' 優位' : '開票待ち';
      return '<div class="pin static" data-id="' + r.id + '" style="left:' + r.x + '%;top:' + r.y + '%"><b>' + r.name + '</b>' +
        '<span class="mk">' + top + '</span><span class="ct-open">' + Math.round(f * 100) + '%</span></div>';
    }).join('');

    let text;
    const lead = byId(cands, ord[0]);
    if (t === 0) text = '午後8時、全国で投票が締め切られました。天気は' + WEATHER[e.weather] + '。' + NB.seats + '議席の行方は、過半数の ' + NB.majority + ' が分かれ目です。';
    else if (hasMajority && prev.seats[ord[0]] < NB.majority) text = pname(lead) + 'が ' + NB.majority + ' 議席を超え、単独過半数を確実にしました。';
    else if (t === last) text = '全議席が確定しました。' + pname(byId(cands, e.winner)) + 'が ' + e.seats[e.winner] + '議席で第1党' + (e.majority ? '、単独過半数です。' : '。過半数には届きませんでした。');
    else text = '開票率 ' + Math.round(tick.pct * 100) + '%。' + pname(lead) + 'が ' + tick.seats[ord[0]] + '議席でリード、' + pname(byId(cands, ord[1])) + 'は ' + tick.seats[ord[1]] + '議席。';

    app.innerHTML = '<div class="count national">' +
      '<header class="ct-head panel"><span class="ct-live">開票速報</span><h1>衆議院総選挙</h1>' +
      '<span class="ct-clock">' + tick.time + '</span><span class="ct-pct">開票率 <b>' + Math.round(tick.pct * 100) + '</b>%</span></header>' +
      '<div class="ct-body"><section class="ct-cands panel">' + rows + '<p class="maj-note">縦の線が過半数(' + NB.majority + '議席)</p></section>' +
      '<div class="map-cell">' + UI.mapHtml(fill, null) + '</div></div>' +
      '<div class="ct-ticker panel"><span class="tk-lab">速報</span><span>' + UI.esc(text) + '</span></div>' +
      '<footer class="ct-btns">' +
      (t < last ? '<button type="button" class="btn" id="auto">' + (auto ? '止める' : '自動で進める') + '</button>' +
        '<button type="button" class="btn btn-primary btn-lg" id="next">' + e.ticks[t + 1].time + ' へ進む</button>'
        : '<button type="button" class="btn btn-primary btn-lg" id="result">結果を見る</button>') +
      '</footer></div>';
    app.querySelector('.count').classList.add('nat');
    app.querySelector('#pins').innerHTML = pins;

    requestAnimationFrame(function () {
      app.querySelectorAll('.ct-bar i').forEach(function (i) { i.style.width = i.dataset.w + '%'; });
    });
    app.querySelectorAll('.ct-votes b').forEach(function (b) {
      const from = +b.dataset.from, to = +b.dataset.to, t0 = performance.now();
      if (from === to) return;
      (function step(now) {
        const k = Math.min(1, (now - t0) / 700);
        b.textContent = Math.round(from + (to - from) * k);
        if (k < 1 && b.isConnected) requestAnimationFrame(step);
      })(t0);
    });
    if (justCalled) UI.sound('stamp');
    prevShown = t;

    const advance = function () {
      if (e.shown >= last) return;
      e.shown += 1;
      Game.save();
      render(app);
    };
    clearTimeout(timer);
    if (auto && t < last) timer = setTimeout(function () { if (Game.state && Game.state.screen === 'count') advance(); }, 1900);
    else auto = false;
    const nextBtn = app.querySelector('#next');
    if (nextBtn) nextBtn.onclick = function () { auto = false; advance(); };
    const autoBtn = app.querySelector('#auto');
    if (autoBtn) autoBtn.onclick = function () { auto = !auto; render(app); };
    const resBtn = app.querySelector('#result');
    if (resBtn) resBtn.onclick = function () {
      auto = false; clearTimeout(timer); prevShown = -1;
      s.screen = 'result';
      Game.save();
      Game.render();
    };
  }

  function renderResult(app) {
    const s = Game.state, e = s.election, camp = s.camp, cands = camp.cands, NB = Game.Balance.nation;
    const me = byId(cands, 'me'), mine = e.seats.me, prev = e.prevMine;
    const diff = prev == null ? null : mine - prev;
    const choose = Game.Gov.needsChoice(s);   // どの党も単独過半数でなければ、誰と組むかを選ぶ
    const willResign = !choose && prev != null && !e.meMajority && mine <= prev * (1 - NB.resignDrop);
    let head, stamp = '';
    if (e.meMajority) { head = pname(me) + '、単独過半数'; stamp = '過半数'; }
    else if (e.won) { head = pname(me) + '、第1党に'; stamp = '第1党'; }
    else if (willResign) head = '議席を大きく減らす';
    else head = diff != null && diff > 0 ? '議席を伸ばす' : diff != null && diff < 0 ? '議席を減らす' : '議席は横ばい';
    const sub = mine + '議席(' + (prev == null ? '' : '選挙前 ' + prev + '議席から ' + UI.signed(diff) + '。') + '過半数は ' + NB.majority + ')。' +
      (e.meMajority ? '国会で首相に指名される数を、単独で手にした。' : e.won ? '第1党だが、単独では政権を組めない。' : '第1党は' + pname(byId(cands, e.winner)) + '(' + e.seats[e.winner] + '議席)。');

    const table = e.order.map(function (id, i) {
      const c = byId(cands, id);
      let smd = 0, pr = 0;
      Object.keys(e.byBlock).forEach(function (rid) { smd += e.byBlock[rid].smd[id]; pr += e.byBlock[rid].pr[id]; });
      return '<div class="rs-row nat' + (c.player ? ' me' : '') + '" style="--pc:' + UI.color(c) + '"><span class="rs-mark">' + (i === 0 ? '1' : '') + '</span>' +
        UI.partyChip(c) + '<b>' + pname(c) + '</b><span class="sub">小 ' + smd + '・比 ' + pr + '</span>' +
        '<span class="rs-votes">' + e.seats[id] + '議席</span></div>';
    }).join('');
    const pins = Game.Data.DISTRICT.regions.map(function (r) {
      const b = e.byBlock[r.id], top = leadOf(b.seats)[0];
      return '<div class="pin static" data-id="' + r.id + '" style="left:' + r.x + '%;top:' + r.y + '%"><b>' + r.name + '</b>' +
        '<span class="mk ' + (top === 'me' ? 'mk-good' : 'mk-bad') + '">' + UI.esc(Game.Data.PARTIES[byId(cands, top).party].short) + '</span>' +
        '<span class="ct-open">あなた ' + b.seats.me + ' / ' + (r.smd + r.pr) + '</span></div>';
    }).join('');
    const promises = camp.promises.map(function (id) {
      const p = Game.Data.PROMISES[id];
      return '<div class="pr-line"><span class="pr-dot">約</span><span><b>' + p.policy + '</b></span></div>';
    }).join('');
    const nextText = willResign ? '選挙前の議席を ' + Math.round(NB.resignDrop * 100) + '% 以上減らし、政権にも届かなかった。責任をとって、党首を辞する。'
      : e.meMajority ? '単独過半数。国会で首相に指名され、政権を担う。'
        : choose ? 'どの党も単独過半数に届かなかった。誰と組むかで、政権が決まる。'
          : '野党党首として国会に戻り、次の総選挙に備える。';

    app.innerHTML = '<div class="result national">' +
      '<header class="rs-head ' + (stamp ? 'won' : 'lost') + '">' + (stamp ? '<span class="stamp big new">' + stamp + '</span>' : '') +
      '<h1>' + head + '</h1><p>' + sub + '</p>' +
      '<p class="sub">投票日の天気は' + WEATHER[e.weather] + '。' + (e.majority ? '過半数が決まったのは ' + e.ticks[e.callTick].time + '。' : 'どの党も単独過半数に届かなかった。') + '</p></header>' +
      '<div class="rs-body"><div class="rs-left"><section class="panel"><h2>各党の議席<small>小選挙区 289・比例 176</small></h2>' + table + '</section>' +
      '<section class="panel"><h2>掲げた公約</h2>' + (promises || '<p class="pr-note">公約のカードは使わなかった。</p>') +
      '<p class="pr-note">政権に入れば、この公約を任期のうちに果たすことになる。野党に回れば白紙になる。</p></section>' +
      '<section class="panel"><h2>この先</h2><p class="pr-note">' + nextText + '</p></section></div>' +
      '<div class="map-cell">' + UI.mapHtml(function (rid) { return UI.leadFill(cands, e.byBlock[rid].seats); }, null) + '</div></div>' +
      '<footer class="ct-btns"><button type="button" class="btn" id="title">タイトルへ</button>' +
      '<button type="button" class="btn btn-primary btn-lg" id="again">' + (willResign ? '党首を辞する' : e.meMajority ? '首相として政権を担う' : choose ? '政権づくりへ' : '野党党首として国会へ') + '</button></footer></div>';
    app.querySelector('.result').classList.add('nat');
    app.querySelector('#pins').innerHTML = pins;
    if (stamp && !e.resultSeen) UI.sound('stamp');
    e.resultSeen = true;
    Game.save();
    app.querySelector('#title').onclick = Game.toTitle;
    app.querySelector('#again').onclick = function () {
      if (choose) { s.screen = 'coalition'; Game.save(); return Game.render(); }
      Game.Gov.form(s, Game.Gov.options(s)[0]);   // 道は1つ(単独政権か、単独過半数の相手に対する野党)
      Game.Career.afterElection(s); Game.ui.card = null; Game.clearUndo(); Game.save(); Game.render();
    };
  }

  return { render: render, renderResult: renderResult };
})();
