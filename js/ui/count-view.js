// 開票特番(20:00〜0:00を30分刻みで進める)と、選挙結果の画面。
window.Game = window.Game || {};

Game.CountView = (function () {
  const UI = Game.UI;
  let auto = false, timer = null, prevShown = -1, prJust = false;

  const num = function (n) { return Math.round(n).toLocaleString('ja-JP'); };
  const WEATHER = { sunny: '晴れ', cloudy: 'くもり', rain: '雨' };
  // 並びは開票中ずっと固定:現職 → 元職 → 新人(並びで結果が分からないように)
  function fixedOrder(cands) {
    const ord = Game.Data.ROLE_ORDER;
    return cands.slice().sort(function (a, b) { return ord.indexOf(a.role) - ord.indexOf(b.role); });
  }
  function turnoutAll(e) {
    const total = Game.Data.DISTRICT.regions.reduce(function (a, r) { return a + r.voters; }, 0);
    return e.total / total * 100;
  }
  function byId(cands, id) { return cands.filter(function (c) { return c.id === id; })[0]; }

  // 開票所の不審な動き(R10)
  function recountText(e) {
    const r = e.recount;
    if (!r) return '';
    const reg = Game.Data.REGION[r.region].name;
    return r.caught ? '' + reg + 'の開票所で票の束に不審な点があり、立会人の求めで数え直しました。'
      : reg + 'の開票所では、' + num(r.votes) + '票が別の候補に数えられた疑いがあります。立会人がおらず、確かめられませんでした。';
  }
  function narration(s, t) {
    const e = s.election, tick = e.ticks[t], cands = s.camp.cands;
    const w = byId(cands, e.winner), fc = e.falseCall, fw = fc ? byId(cands, fc.who) : null;
    // 奔流(R15):先に出た当確の取り消し
    if (fc && t === fc.retract) {
      return '【速報】' + fw.name + '氏の当選確実を取り消します。開票の終盤、' + w.short + '氏の票が一気に開いています。' + (t === e.callTick ? w.name + '氏に当選確実。' : '');
    }
    if (fc && t === fc.tick && t > 0) return fw.name + '氏に当選確実が出ました。開票率 ' + Math.round(tick.pct * 100) + '%。';
    if (t === 0) {
      const head = '午後8時、投票が締め切られました。天気は' + WEATHER[e.weather] + '、投票率は ' + turnoutAll(e).toFixed(1) + '%。' + (e.surge ? '「奔流」――ふだん投票に行かない人たちが、投票所に押し寄せました。' : e.closeBoost >= 3 ? '激戦への関心から、投票所には長い列ができました。' : '');
      return head + (e.zeroCall ? '出口調査の結果、' + w.name + '氏の当選が確実になりました。' : fc && fc.tick === 0 ? '出口調査の結果、' + fw.name + '氏の当選が確実になりました。' : '出口調査では競り合っています。開票を待ちます。');
    }
    const ord = Object.keys(tick.counted).sort(function (a, b) { return tick.counted[b] - tick.counted[a]; });
    const lead = byId(cands, ord[0]), second = byId(cands, ord[1]);
    const diff = tick.counted[ord[0]] - tick.counted[ord[1]];
    if (t === e.callTick) return w.name + '氏に当選確実が出ました。開票率 ' + Math.round(tick.pct * 100) + '%。' + (fc ? 'いったん当確が出た' + fw.short + '氏を、奔流の票が逆転しました。' : '');
    if (t === e.ticks.length - 1) return '開票が終わりました。' + w.name + '氏が ' + num(e.totals[e.winner]) + '票で当選。' + recountText(e);
    return '開票率 ' + Math.round(tick.pct * 100) + '%。' + lead.short + '氏がリード、' + second.short + '氏が ' + num(diff) + '票差で追っています。';
  }

  function render(app) {
    const s = Game.state, e = s.election, cands = s.camp.cands;
    const t = e.shown, tick = e.ticks[t], last = e.ticks.length - 1;
    if (t === 0) prevShown = -1;
    const prev = e.ticks[Math.max(0, prevShown >= 0 && prevShown < t ? prevShown : t)];
    const called = t >= e.callTick;
    const justCalled = t === e.callTick && prevShown < t;
    const fc = e.falseCall;   // 奔流(R15)で取り消される当確
    const fcOn = fc && t >= fc.tick && t < fc.retract, fcOff = fc && t >= fc.retract;
    const justFalse = fc && t === fc.tick && prevShown < t, justRetract = fc && t === fc.retract && prevShown < t;
    const max = e.totals[e.winner] * 1.04;
    // 比例代表:小選挙区で負けたときだけ、開票のあと(午前1時30分)に復活できたかが分かる
    const pr = !e.won && e.pr ? e.pr : null;
    const prShown = !!pr && !!e.prShown;
    let prBox = '', prText = '';
    if (prShown) {
      const me = byId(cands, 'me');
      const pos = function (v) { return Math.max(0, Math.min(100, (v - 80) / 20 * 100)); };
      prBox = '<div class="pr-box' + (pr.revived ? ' ok' : '') + '"><div class="pr-head"><span class="ct-live">比例代表</span><b>' + Game.Data.DISTRICT.block + '</b>' +
        '<span class="sub">' + Game.Data.PARTIES[s.player.party].name + 'の復活ライン</span>' + (pr.revived ? '<span class="stamp' + (prJust ? ' new' : '') + '">比例復活</span>' : '') + '</div>' +
        '<div class="pr-meter"><i style="width:' + pos(e.lossRatio) + '%"></i><span class="pr-mark" style="left:' + pos(pr.line) + '%"></span></div>' +
        '<p class="pr-text">あなたの惜敗率 <b>' + e.lossRatio.toFixed(1) + '%</b> / 復活ライン <b>' + pr.line.toFixed(1) + '%</b></p></div>';
      prText = pr.revived ? '午前1時30分。比例代表の議席が決まり、' + me.name + '氏が復活当選を果たしました。'
        : '午前1時30分。比例代表の議席が決まりました。' + me.name + '氏の惜敗率は、復活ラインに届きませんでした。';
    }

    const rows = fixedOrder(cands).map(function (c) {
      const v = tick.counted[c.id], pv = prev.counted[c.id];
      const sum = Object.keys(tick.counted).reduce(function (a, k) { return a + tick.counted[k]; }, 0);
      const stamp = called && c.id === e.winner ? '<span class="stamp' + (justCalled ? ' new' : '') + '">当確</span>'
        : fc && c.id === fc.who && fcOn ? '<span class="stamp' + (justFalse ? ' new' : '') + '">当確</span>'
          : fc && c.id === fc.who && fcOff ? '<span class="stamp void' + (justRetract ? ' new' : '') + '">当確取消</span>' : '';
      return '<div class="ct-row' + (c.player || c.human ? ' me' : '') + '" style="--pc:' + UI.color(c) + '">' +
        '<div class="ct-name">' + UI.partyChip(c) + '<b>' + UI.esc(c.name) + '</b><span class="sub">' + Game.Data.ROLE_NAMES[c.role] + (c.tag ? '・' + c.tag : c.player ? '・あなた' : '') + '</span>' + stamp + '</div>' +
        '<div class="ct-bar"><i style="width:' + (pv / max * 100) + '%" data-w="' + (v / max * 100) + '"></i></div>' +
        '<div class="ct-votes"><b data-from="' + pv + '" data-to="' + v + '">' + num(pv) + '</b>票<small>' + (sum ? (v / sum * 100).toFixed(1) + '%' : '—') + '</small></div></div>';
    }).join('');

    const fill = function (rid) {
      if (!tick.regionPct[rid]) return null;
      return UI.leadFill(cands, tick.byRegion[rid]);
    };
    const pins = Game.Data.DISTRICT.regions.map(function (r) {
      const f = tick.regionPct[r.id];
      let lead = '開票待ち';
      if (f) {
        const b = tick.byRegion[r.id];
        const top = Object.keys(b).sort(function (x, y) { return b[y] - b[x]; })[0];
        lead = UI.esc(byId(cands, top).short) + ' リード';
      }
      return '<div class="pin static" data-id="' + r.id + '" style="left:' + r.x + '%;top:' + r.y + '%"><b>' + r.name + '</b>' +
        '<span class="mk">' + lead + '</span><span class="ct-open">開票率 ' + Math.round(f * 100) + '%</span></div>';
    }).join('');

    const canResult = called || t === last;
    app.innerHTML = '<div class="count">' +
      '<header class="ct-head panel"><span class="ct-live">開票速報</span><h1>' + UI.esc(Game.Data.DISTRICT.name) + '</h1>' +
      '<span class="ct-clock">' + (prShown ? '1:30' : tick.time) + '</span><span class="ct-pct">開票率 <b>' + Math.round(tick.pct * 100) + '</b>%</span></header>' +
      '<div class="ct-body"><section class="ct-cands panel' + (prShown || cands.length > 3 ? ' compact' : '') + '">' + rows + prBox + '</section>' +
      '<div class="map-cell">' + UI.mapHtml(fill, null) + '</div></div>' +
      '<div class="ct-ticker panel' + (fc && t === fc.retract && !prShown ? ' alert' : '') + '"><span class="tk-lab">速報</span><span>' + UI.esc(prShown ? prText : narration(s, t)) + '</span></div>' +
      '<footer class="ct-btns">' +
      (t < last ? '<button type="button" class="btn" id="auto">' + (auto ? '止める' : '自動で進める') + '</button>' +
        '<button type="button" class="btn btn-primary btn-lg" id="next">' + e.ticks[t + 1].time + ' へ進む</button>' : '') +
      (canResult ? '<button type="button" class="btn' + (t === last ? ' btn-primary btn-lg' : '') + '" id="result">' + (pr && !prShown ? '比例代表の結果へ' : '結果を見る') + '</button>' : '') +
      '</footer></div>';
    app.querySelector('#pins').innerHTML = pins;
    if (prShown) { const pc = app.querySelector('.ct-cands'); pc.scrollTop = pc.scrollHeight; }   // 比例代表の結果が欄に入りきらなければ、そこまで送る

    // 棒と票数を、前の時刻からなめらかに動かす
    requestAnimationFrame(function () {
      app.querySelectorAll('.ct-bar i').forEach(function (i) { i.style.width = i.dataset.w + '%'; });
    });
    app.querySelectorAll('.ct-votes b').forEach(function (b) {
      const from = +b.dataset.from, to = +b.dataset.to, t0 = performance.now();
      if (from === to) return;
      (function step(now) {
        const k = Math.min(1, (now - t0) / 700);
        b.textContent = num(from + (to - from) * k);
        if (k < 1 && b.isConnected) requestAnimationFrame(step);
      })(t0);
    });
    if (justCalled || justFalse || justRetract || (prJust && pr && pr.revived)) UI.sound('stamp');
    prJust = false;
    prevShown = t;

    const advance = function () {
      if (e.shown >= last) return;
      e.shown += 1;
      Game.save();
      render(app);
    };
    clearTimeout(timer);
    if (auto && t < last) {
      timer = setTimeout(function () { if (Game.state && Game.state.screen === 'count') advance(); }, 1900);
    } else {
      auto = false;
    }
    const nextBtn = app.querySelector('#next');
    if (nextBtn) nextBtn.onclick = function () { auto = false; advance(); };
    const autoBtn = app.querySelector('#auto');
    if (autoBtn) autoBtn.onclick = function () { auto = !auto; render(app); };
    const resBtn = app.querySelector('#result');
    if (resBtn) resBtn.onclick = function () {
      auto = false; clearTimeout(timer);
      if (pr && !e.prShown) {   // 先に比例代表の結果を見せる
        e.shown = last; e.prShown = true; prJust = true;
        Game.save();
        return render(app);
      }
      prevShown = -1;
      e.shown = last;
      s.screen = 'result';
      Game.save();
      Game.render();
    };
  }

  function renderResult(app) {
    const s = Game.state, e = s.election, camp = s.camp, cands = camp.cands;
    const me = byId(cands, 'me'), w = byId(cands, e.winner);
    const diff = e.totals[e.order[0]] - e.totals[e.order[1]];
    let head, sub;
    // 結果の画面のあいだ、s.career はまだこの選挙を数えていない(「任期へ」を押したときに afterElection が数える)
    const winsBefore = s.career ? s.career.wins : 0;
    const got = Game.Career.seated(e), revived = got && !e.won;
    const willDrop = !got && (s.career ? s.career.lossStreak || 0 : 0) + 1 >= Game.Balance.retire.lossStreak;
    if (e.won) {
      head = UI.esc(me.name) + '、' + (winsBefore === 0 ? '初当選' : me.role === 'incumbent' ? (winsBefore + 1) + '回目の当選' : '返り咲き');
      sub = num(e.totals.me) + '票。次点の' + UI.esc(byId(cands, e.order[1]).name) + '氏に ' + num(diff) + '票差。';
    } else {
      head = revived ? UI.esc(me.name) + '、比例復活' : e.lossRatio >= 90 ? 'あと一歩、届かず' : '落選';
      sub = num(e.totals.me) + '票。当選した' + UI.esc(w.name) + '氏に ' + num(e.totals[e.winner] - e.totals.me) + '票およばなかった(惜敗率 ' + e.lossRatio.toFixed(1) + '%)。';
      if (e.pr) sub += revived ? '比例代表の復活ライン(' + e.pr.line.toFixed(1) + '%)を上回り、議席を得た。' : '比例代表の復活ライン(' + e.pr.line.toFixed(1) + '%)にも届かなかった。';
    }
    const table = e.order.map(function (id, i) {
      const c = byId(cands, id);
      return '<div class="rs-row' + (c.player ? ' me' : '') + '" style="--pc:' + UI.color(c) + '"><span class="rs-mark' + (c.player && revived ? ' pr' : '') + '">' + (i === 0 ? '当' : c.player && revived ? '比' : '') + '</span>' +
        UI.partyChip(c) + '<b>' + UI.esc(c.name) + '</b><span class="sub">' + Game.Data.ROLE_NAMES[c.role] + '</span>' +
        '<span class="rs-votes">' + num(e.totals[id]) + '票</span><span class="rs-pct">' + (e.totals[id] / e.total * 100).toFixed(1) + '%</span></div>';
    }).join('');
    const pins = Game.Data.DISTRICT.regions.map(function (r) {
      const v = e.regions[r.id].votes;
      const sum = Object.keys(v).reduce(function (a, k) { return a + v[k]; }, 0);
      const top = Object.keys(v).sort(function (x, y) { return v[y] - v[x]; })[0];
      return '<div class="pin static" data-id="' + r.id + '" style="left:' + r.x + '%;top:' + r.y + '%"><b>' + r.name + '</b>' +
        '<span class="mk ' + (top === 'me' ? 'mk-good' : 'mk-bad') + '">' + UI.esc(byId(cands, top).short) + '</span>' +
        '<span class="ct-open">あなた ' + (v.me / sum * 100).toFixed(0) + '%</span></div>';
    }).join('');
    const promises = camp.promises.map(function (id) {
      const p = Game.Data.PROMISES[id];
      return '<div class="pr-line"><span class="pr-dot">約</span><span><b>' + p.policy + '</b>(' + p.org + ')</span></div>';
    }).join('');
    const promiseText = !camp.promises.length ? '<p class="pr-note">誰にも約束をせずに戦い抜いた。</p>'
      : got ? promises + '<p class="pr-note">この約束は、任期のあいだに果たすことになる。果たせば次の選挙で推薦に、破れば「破った約束」になって返ってくる。</p>'
        : promises + '<p class="pr-note">議席に届かず、約束を果たす場は得られなかった。</p>';

    app.innerHTML = '<div class="result">' +
      '<header class="rs-head ' + (got ? 'won' : 'lost') + '">' + (got ? '<span class="stamp big new">' + (e.won ? '当選' : '比例復活') + '</span>' : '') +
      '<h1>' + head + '</h1><p>' + sub + '</p>' +
      '<p class="sub">' + (e.recount ? UI.esc(recountText(e)) + '<br>' : '') + '投票日の天気は' + WEATHER[e.weather] + '、投票率 ' + turnoutAll(e).toFixed(1) + '%' + (e.surge ? '(奔流:眠っていた票が動いた)' : e.closeBoost >= 3 ? '(激戦への関心で、ふだんより +' + e.closeBoost.toFixed(1).replace('.0', '') + 'ポイント)' : '') + '。' + (e.falseCall ? 'いったん' + UI.esc(byId(cands, e.falseCall.who).name) + '氏に当確が出たが、' + e.ticks[e.falseCall.retract].time + 'に取り消された。' + UI.esc(w.short) + '氏に当確が出たのは ' + e.ticks[e.callTick].time + '。' : e.zeroCall ? '午後8時ちょうどに当確が出た。' : '当確が出たのは ' + e.ticks[e.callTick].time + '。') + '</p></header>' +
      '<div class="rs-body"><div class="rs-left"><section class="panel"><h2>開票結果</h2>' + table + '</section>' +
      '<section class="panel"><h2>背負った約束</h2>' + promiseText + '</section>' +
      '<section class="panel"><h2>この先</h2><p class="pr-note">' + (e.won ? '議員として任期に入る。約束を果たし、地盤を固め、次の選挙に備える。' : revived ? '比例復活の議員として任期に入る。次の選挙でも、選挙区には現職の相手がいる。' : willDrop ? '続けて' + Game.Balance.retire.lossStreak + '回、議席を得られなかった。党は、次の選挙に別の候補を立てる。' : '浪人として地元を歩き、次の解散を待つ。') + '</p></section></div>' +
      '<div class="map-cell">' + UI.mapHtml(function (rid) { return UI.leadFill(cands, e.regions[rid].votes); }, null) + '</div></div>' +
      '<footer class="ct-btns"><button type="button" class="btn" id="title">タイトルへ</button>' +
      '<button type="button" class="btn btn-primary btn-lg" id="again">' + (got ? '議員の任期へ' : willDrop ? '政界を去る' : '浪人として次をめざす') + '</button></footer></div>';
    app.querySelector('#pins').innerHTML = pins;
    if (got && !e.resultSeen) UI.sound('stamp');
    e.resultSeen = true;
    Game.save();
    app.querySelector('#title').onclick = Game.toTitle;
    app.querySelector('#again').onclick = function () { Game.Career.afterElection(s); Game.ui.card = null; Game.clearUndo(); Game.save(); Game.render(); };
  }

  return { render: render, renderResult: renderResult };
})();
