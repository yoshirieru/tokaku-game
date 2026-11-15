// 30年後の新聞(R14)。エンディングで、未来日報の1面を見せる。中身は js/engine/future.js の paper(state.ending.paper)。
// 演出:昔の映画のように、新聞が回転しながら飛んできて止まる。タイトルの演出設定(通常 / 速い / スキップ)と、端末の「動きを減らす」に従う
window.Game = window.Game || {};

Game.PaperView = (function () {
  const UI = Game.UI;
  const SPEED = { normal: 1, fast: 0.4, skip: 0 };

  // 指標の小さなグラフ(始まり・政界を去った年・30年後の3点)
  function spark(p, k) {
    const I = p.ind[k], N = Game.Data.INDICATORS[k];
    const xs = [4, 4 + 72 * (p.retired - p.from) / (p.year - p.from), 76];
    // 縦は始まりの値を真ん中に、±16 ポイントを枠いっぱいに(数ポイントの動きも見えるように)
    const yOf = function (v) { return Math.max(3, Math.min(35, 19 - (v - I.start) * 1)); };
    const ys = [I.start, I.now, I.then].map(yOf);
    const d = I.then - I.start, cls = d >= 3 ? 'up' : d <= -3 ? 'down' : 'flat';
    return '<div class="np-ind ' + cls + '"><span class="np-ind-name">' + N.name + '</span>' +
      '<svg viewBox="0 0 80 38" aria-hidden="true"><line x1="0" y1="19" x2="80" y2="19" class="np-base"/>' +
      '<polyline points="' + xs.map(function (x, i) { return x.toFixed(1) + ',' + ys[i].toFixed(1); }).join(' ') + '"/>' +
      '<circle cx="' + xs[2] + '" cy="' + ys[2].toFixed(1) + '" r="2.4"/></svg>' +
      '<b>' + I.then + '</b><small>' + (d > 0 ? '+' : '') + Math.round(d) + '</small></div>';
  }
  function html(p) {
    const D = Game.Data;
    const inds = D.INDICATOR_ORDER.map(function (k) { return spark(p, k); }).join('');
    const items = p.column.items.length ? '<ol>' + p.column.items.map(function (t) { return '<li>' + UI.esc(t) + '</li>'; }).join('') + '</ol>'
      : '<p>在任中、30年後まで響くような決定は、ほとんど残さなかった。良くも悪くも、時代の流れに任せた政治家だった。</p>';
    const letters = p.letters.map(function (l) { return '<li><p>「' + UI.esc(l.text) + '」</p><cite>' + UI.esc(l.who) + '</cite></li>'; }).join('');
    return '<article class="np-paper np-' + p.tone + '" aria-label="' + UI.esc(p.name) + '">' +
      '<header class="np-mast"><span class="np-date">' + p.year + '年' + p.month + '月' + p.day + '日(' + p.weekday + ')</span>' +
      '<h1 class="np-title">' + UI.esc(p.name) + '</h1><span class="np-ed">朝刊 ・ 1面</span></header>' +
      '<h2 class="np-headline">' + UI.esc(p.headline) + '</h2>' +
      (p.subs.length ? '<ul class="np-subs">' + p.subs.map(function (t) { return '<li>' + UI.esc(t) + '</li>'; }).join('') + '</ul>' : '') +
      '<div class="np-cols">' +
        '<section class="np-graph"><h3>国の指標 ' + p.from + '→' + p.year + '</h3><div class="np-inds">' + inds + '</div>' +
          '<p class="np-legend">線は ' + p.from + '年・' + p.retired + '年(政界を去った年)・' + p.year + '年。点線は ' + p.from + '年の水準。数字は0〜100、高いほど良い</p></section>' +
        '<section class="np-column"><h3>' + UI.esc(p.column.title) + '</h3>' +
          '<p class="np-lead">政界を去って30年。在任中の決定は ' + p.column.count + ' 件。いまの暮らしに、どう響いているのか。</p>' + items + '</section>' +
      '</div>' +
      '<section class="np-letters"><h3>読者の声</h3><ul>' + letters + '</ul></section>' +
      '<p class="np-note">' + UI.esc(p.note) + '</p>' +
      '</article>';
  }

  // 新聞を出す。onClose は閉じたとき
  function show(p, onClose) {
    if (!p) return;
    const st = Game.Effects && Game.Effects.Title ? Game.Effects.Title.settings() : { speed: 'normal', sfx: true };
    const reduced = Game.Effects && Game.Effects.Title && Game.Effects.Title.reducedMotion();
    const s = reduced ? 0 : (SPEED[st.speed] != null ? SPEED[st.speed] : 1);
    const back = document.createElement('div');
    back.className = 'np-back' + (s ? ' film' : '');
    back.style.setProperty('--np-s', String(s || 0.0001));
    back.innerHTML = '<div class="np-grain" aria-hidden="true"></div><div class="np-stage">' + html(p) +
      '<div class="np-btns"><button type="button" class="btn btn-primary" id="npClose">新聞をたたむ</button></div></div>';
    document.getElementById('app').appendChild(back);
    const close = function () { back.remove(); document.removeEventListener('keydown', onKey); if (onClose) onClose(); };
    const onKey = function (e) { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    back.querySelector('#npClose').onclick = close;
    // 止まった瞬間に「ドン」(演出のときだけ)
    if (s) setTimeout(function () { if (back.isConnected && st.sfx !== false) UI.sound('stamp'); }, 1500 * s);
    back.querySelector('#npClose').focus({ preventScroll: true });
  }

  return { show: show, html: html };
})();
