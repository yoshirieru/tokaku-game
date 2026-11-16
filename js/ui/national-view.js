// 党首として戦った総選挙の開票特番(議席が積み上がる)と、結果の画面。部品のクラスは選挙区の開票特番(count-view.js)と共用。
window.Game = window.Game || {};

Game.NationalView = (function () {
  const UI = Game.UI;
  let auto = false, timer = null, prevShown = -1;
  const WEATHER = { sunny: '晴れ', cloudy: 'くもり', rain: '雨' };

  function byId(cands, id) { return cands.filter(function (c) { return c.id === id; })[0]; }
  // 並びは開票中ずっと固定(党の並び)
  function fixedOrder(cands) {
    const ord = Game.Data.partyOrder();   // 3党、小さな党(R19)
    return cands.slice().sort(function (a, b) { return ord.indexOf(a.party) - ord.indexOf(b.party); });
  }
  const pname = function (c) { return Game.Data.PARTIES[c.party].name; };
  function leadOf(seats) { return Object.keys(seats).sort(function (a, b) { return seats[b] - seats[a]; }); }

  // ---------- 結果の画面の部品(テレビの選挙特番の「獲得議席」と「小選挙区 当選一覧」)----------
  const mark = function (party) { return Game.Data.PARTIES[party].short.charAt(0); };
  // 党ごとの議席(候補の id → 党)
  function seatsByParty(e, cands) {
    const out = {};
    cands.forEach(function (c) { out[c.party] = e.seats[c.id]; });
    return out;
  }
  // 選挙前勢力:この前の総選挙の結果(はじめての総選挙は、党首になったときの議席)
  function prevSeats(s) { return (s.career && s.career.nationSeats) || Game.Balance.nation.startSeats; }
  // 半円の帯(角度は左 180° から右 0° へ)
  function arc(cx, cy, r0, r1, f0, f1) {
    const a0 = Math.PI * (1 - f0), a1 = Math.PI * (1 - f1), large = 0;   // 半円の中の帯は 180° を超えないので、いつも小さいほうの弧
    const p = function (r, a) { return (cx + r * Math.cos(a)).toFixed(1) + ' ' + (cy - r * Math.sin(a)).toFixed(1); };
    return 'M' + p(r1, a0) + ' A' + r1 + ' ' + r1 + ' 0 ' + large + ' 1 ' + p(r1, a1) + ' L' + p(r0, a1) + ' A' + r0 + ' ' + r0 + ' 0 ' + large + ' 0 ' + p(r0, a0) + ' Z';
  }
  // 獲得議席:与党と野党・他の合計、党ごとの箱、半円のグラフ(外:与党と野党、中:党ごと、内:選挙前勢力)、過半数の線
  function seatChart(s, e, cands) {
    const NB = Game.Balance.nation, P = Game.Data.PARTIES, total = NB.seats;
    const now = seatsByParty(e, cands), before = prevSeats(s), me = s.player.party;
    const ruling = Game.Upper.ruling(s).filter(function (k) { return now[k] != null; });   // この選挙に出た党だけ(閣外協力の党を含む。R19)
    const order = ruling.slice().sort(function (a, b) { return now[b] - now[a]; })
      .concat(Object.keys(now).filter(function (k) { return ruling.indexOf(k) < 0; }).sort(function (a, b) { return now[b] - now[a]; }));
    const sum = function (obj, keys) { return keys.reduce(function (a, k) { return a + (obj[k] || 0); }, 0); };
    const opp = order.filter(function (k) { return ruling.indexOf(k) < 0; });
    const rN = sum(now, ruling), oN = sum(now, opp), rB = sum(before, ruling), oB = sum(before, opp);
    const cx = 200, cy = 206;
    let f = 0, mid = '', inner = '', fb = 0;
    order.forEach(function (k) {
      const w = now[k] / total, wb = (before[k] || 0) / total;
      mid += '<path d="' + arc(cx, cy, 104, 168, f, f + w) + '" fill="' + P[k].color + '"><title>' + P[k].name + ' ' + now[k] + '</title></path>';
      inner += '<path d="' + arc(cx, cy, 64, 92, fb, fb + wb) + '" fill="' + P[k].color + '" class="sc-before"/>';
      f += w; fb += wb;
    });
    const outer = '<path d="' + arc(cx, cy, 176, 192, 0, rN / total) + '" class="sc-ruling"/><path d="' + arc(cx, cy, 176, 192, rN / total, 1) + '" class="sc-opp"/>';
    const half = NB.majority / total, ma = Math.PI * (1 - half);
    const line = '<line x1="' + (cx + 56 * Math.cos(ma)).toFixed(1) + '" y1="' + (cy - 56 * Math.sin(ma)).toFixed(1) + '" x2="' + (cx + 200 * Math.cos(ma)).toFixed(1) + '" y2="' + (cy - 200 * Math.sin(ma)).toFixed(1) + '" class="sc-line"/>';
    const box = function (k) {
      return '<div class="sc-box' + (k === me ? ' me' : '') + '" style="--pc:' + P[k].color + '"><span>' + P[k].short + (k === me ? '<small>あなた</small>' : '') + '</span><b>' + now[k] + '</b>' +
        '<small class="sc-diff">' + UI.signed(now[k] - (before[k] || 0)) + '</small></div>';
    };
    return '<section class="panel seat-chart"><h2>獲得議席<small>小選挙区 ' + Object.keys(e.byBlock).reduce(function (a, r) { return a + Game.Data.REGION[r].smd; }, 0) + '・比例 ' + Object.keys(e.byBlock).reduce(function (a, r) { return a + Game.Data.REGION[r].pr; }, 0) + '</small></h2>' +
      '<div class="sc-top"><div class="sc-side ruling"><span class="sc-lab">与党</span><b>' + rN + '</b><small>選挙前勢力 ' + rB + '</small><div class="sc-boxes">' + ruling.map(box).join('') + '</div></div>' +
      '<div class="sc-arc"><svg viewBox="0 0 400 214" role="img" aria-label="議席の半円グラフ。与党 ' + rN + '、野党・他 ' + oN + '、過半数 ' + NB.majority + '">' +
        outer + mid + inner + line +
        '<text x="' + cx + '" y="10" class="sc-maj" text-anchor="middle">過半数 ' + NB.majority + '</text>' +
        '<text x="' + cx + '" y="' + (cy - 6) + '" class="sc-mid" text-anchor="middle">選挙前勢力</text></svg></div>' +
      '<div class="sc-side opp"><span class="sc-lab">野党・他</span><b>' + oN + '</b><small>選挙前勢力 ' + oB + '</small><div class="sc-boxes">' + opp.map(box).join('') + '</div></div></div>' +
      '<p class="sc-note">外の帯:与党(選挙前の政権の党)と野党。中:党ごとの議席。内:選挙前勢力。残り 0 / ' + total + ' 議席</p></section>';
  }
  // 小選挙区 当選一覧:ブロックをおおよその地理に並べ、小選挙区の議席を1つずつ党の印で
  function seatTiles(e, cands) {
    const P = Game.Data.PARTIES;
    const tiles = Game.Data.DISTRICT.regions.map(function (r) {
      const b = e.byBlock[r.id];
      const parts = leadOf(b.smd).filter(function (id) { return b.smd[id] > 0; });
      const sq = parts.map(function (id) {
        const party = byId(cands, id).party;
        let out = '';
        for (let i = 0; i < b.smd[id]; i++) out += '<i style="--pc:' + P[party].color + '">' + mark(party) + '</i>';
        return out;
      }).join('');
      const pr = leadOf(b.pr).filter(function (id) { return b.pr[id] > 0; }).map(function (id) { return mark(byId(cands, id).party) + b.pr[id]; }).join('・');
      const col = r.at[0] + 1, row = Math.floor(r.at[1]) + 1, span = r.at[1] % 1 ? 2 : 1;
      return '<div class="sm-tile" style="grid-column:' + col + ';grid-row:' + row + ' / span ' + span + '"><b>' + r.name + '<small>(' + r.smd + ')</small></b>' +
        '<div class="sm-seats">' + sq + '</div><small class="sm-pr">比例 ' + pr + '</small></div>';
    }).join('');
    const legend = Game.Data.partyOrder().filter(function (k) { return cands.some(function (c) { return c.party === k; }); }).map(function (k) { return '<span><i style="--pc:' + P[k].color + '">' + mark(k) + '</i>' + P[k].short + '</span>'; }).join('');
    return '<section class="panel seat-tiles"><h2>小選挙区 当選一覧<small>( )内は小選挙区の数</small></h2><div class="sm-grid">' + tiles + '</div><div class="sm-legend">' + legend + '</div></section>';
  }

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
    const sgJump = e.surge && t > 0 && t < last ? tick.seats[e.surge.target] - e.ticks[t - 1].seats[e.surge.target] : 0;
    if (t === 0) text = '午後8時、全国で投票が締め切られました。天気は' + WEATHER[e.weather] + '。' + (e.surge ? '「奔流」――投票率は8割を超えました。' : '') +
      (e.exit && e.exit.majority ? '出口調査では、' + pname(byId(cands, e.exit.lead)) + 'が単独過半数をうかがう勢いです。' : NB.seats + '議席の行方は、過半数の ' + NB.majority + ' が分かれ目です。');
    else if (sgJump >= 8 && !(hasMajority && prev.seats[ord[0]] < NB.majority)) {
      // 奔流(R15):隠れた票の党が、開票の後半に一気に伸びる。はじめて伸びたとき・第1党に出たとき・そのあとで言い方を変える
      const sp = pname(byId(cands, e.surge.target)), before = e.ticks[t - 1].seats, tg = e.surge.target;
      const firstJump = !e.ticks.slice(1, t).some(function (k, i) { return k.seats[tg] - e.ticks[i].seats[tg] >= 8; });
      const nowTop = ord[0] === tg && leadOf(before)[0] !== tg;
      text = nowTop ? '【速報】' + sp + 'が第1党に躍り出ました(この30分で +' + sgJump + '議席)。奔流が、開票の夜をひっくり返しています。'
        : firstJump ? '【速報】' + sp + 'の票が一気に開きはじめました(この30分で +' + sgJump + '議席)。' + (e.exit && e.exit.majority && !e.majority ? '出口調査の見立てが崩れはじめています。' : '奔流の正体が見えてきました。')
          : sp + 'の勢いが止まりません。この30分で +' + sgJump + '議席、いま ' + tick.seats[tg] + '議席。';
    }
    else if (hasMajority && prev.seats[ord[0]] < NB.majority) text = pname(lead) + 'が ' + NB.majority + ' 議席を超え、単独過半数を確実にしました。';
    else if (t === last) text = '全議席が確定しました。' + pname(byId(cands, e.winner)) + 'が ' + e.seats[e.winner] + '議席で第1党' + (e.majority ? '、単独過半数です。' : '。過半数には届きませんでした。');
    else text = '開票率 ' + Math.round(tick.pct * 100) + '%。' + pname(lead) + 'が ' + tick.seats[ord[0]] + '議席でリード、' + pname(byId(cands, ord[1])) + 'は ' + tick.seats[ord[1]] + '議席。';

    app.innerHTML = '<div class="count national">' +
      '<header class="ct-head panel"><span class="ct-live">開票速報</span><h1>衆議院総選挙</h1>' +
      '<span class="ct-clock">' + tick.time + '</span><span class="ct-pct">開票率 <b>' + Math.round(tick.pct * 100) + '</b>%</span></header>' +
      '<div class="ct-body"><section class="ct-cands panel' + (cands.length > 4 ? ' compact many' : '') + '">' + rows + '<p class="maj-note">縦の線が過半数(' + NB.majority + '議席)</p>' + UI.ballotCard(e, cands, t, function (rid) { return tick.regionPct[rid] > 0; }, true) + '</section>' +
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

    const promises = camp.promises.map(function (id) { return Game.Data.PROMISES[id].policy; }).join('・');
    const nextText = willResign ? '選挙前の議席を ' + Math.round(NB.resignDrop * 100) + '% 以上減らし、政権にも届かなかった。責任をとって、党首を辞する。'
      : e.meMajority ? '単独過半数。国会で首相に指名され、政権を担う。'
        : choose ? 'どの党も単独過半数に届かなかった。誰と組むかで、政権が決まる。'
          : '野党党首として国会に戻り、次の総選挙に備える。';

    app.innerHTML = '<div class="result national">' +
      '<header class="rs-head ' + (stamp ? 'won' : 'lost') + '">' + (stamp ? '<span class="stamp big new">' + stamp + '</span>' : '') +
      '<h1>' + head + '</h1><p>' + sub + '</p>' +
      '<p class="sub">投票日の天気は' + WEATHER[e.weather] + '。' + (e.surge ? '奔流:投票率は8割を超え、' + Game.Data.PARTIES[e.surge.party].short + 'に票が流れ込んだ。' : '') + (e.majority ? '過半数が決まったのは ' + e.ticks[e.callTick].time + '。' : 'どの党も単独過半数に届かなかった。') + '</p></header>' +
      '<div class="rs-body nat-body"><div class="rs-left">' + seatChart(s, e, cands) +
      '<section class="panel nat-next"><h2>この先</h2><p class="pr-note">' + nextText + '</p>' +
      '<p class="pr-note">掲げた公約:' + (promises ? '<b>' + promises + '</b>(政権に入れば任期のうちに果たす。野党に回れば白紙)' : 'なし') + '</p></section></div>' +
      seatTiles(e, cands) + '</div>' +
      '<footer class="ct-btns"><button type="button" class="btn" id="title">タイトルへ</button>' +
      '<button type="button" class="btn btn-primary btn-lg" id="again">' + (s.scenario && !choose ? 'シナリオの結末へ' : willResign ? '党首を辞する' : e.meMajority ? '首相として政権を担う' : choose ? '政権づくりへ' : '野党党首として国会へ') + '</button></footer></div>';
    app.querySelector('.result').classList.add('nat');
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
