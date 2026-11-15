// 画面共通の部品(エスケープ、アイコン、政党チップ、情勢の印、地図、知らせの窓)
window.Game = window.Game || {};
Game.UI = Game.UI || {};

(function (UI) {
  UI.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  UI.icon = function (name) {
    return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + Game.Data.ICONS[name] + '</svg>';
  };
  UI.color = function (cand) { return Game.Data.PARTIES[cand.party].color; };
  UI.partyChip = function (cand) {
    const p = Game.Data.PARTIES[cand.party];
    return '<span class="pchip" style="--pc:' + p.color + '">' + UI.esc(p.short) + '</span>';
  };
  UI.markHtml = function (m) {
    const k = Game.Campaign.mark(m);
    return '<span class="mk mk-' + k.level + '">' + k.sym + '<span class="mk-word"> ' + k.word + '</span></span>';
  };
  UI.signed = function (n) { return (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n); };

  // 同じもの(key)を続けて2回押したか(ダブルクリック・ダブルタップ)。描き直しで要素が入れ替わっても数えられるよう、自分で時間を測る
  let lastTap = { key: null, at: 0 };
  UI.doubleTap = function (key) {
    const now = Date.now(), hit = lastTap.key === key && now - lastTap.at <= Game.Balance.ui.doubleClick;
    lastTap = hit ? { key: null, at: 0 } : { key: key, at: now };
    return hit;
  };

  // 資金のカードを使うときの、収支報告書への記載(R9)。onPick('honest' | 'hide')
  UI.ledgerChoice = function (onPick) {
    const L = Game.Balance.slush, sc = Game.Scandal.get(Game.state);
    UI.modal('<p class="m-kicker">政治資金</p><h2>収入を、どう記載する?</h2>' +
      '<p>集まったお金は、収支報告書に載せなければならない。載せない分は自由に使えるが、いつか表に出るかもしれない。</p>' +
      (sc.hidden > 0 ? '<p class="pr-note">いま載せていないお金 ' + sc.hidden + '万円・発覚度 ' + Math.round(sc.exposure) + '</p>' : ''),
      [
        { label: '<b>正直に記載する</b><span>「クリーン」の評判 +1(' + Math.min(L.cleanMax, sc.clean + 1) + ' / ' + L.cleanMax + '。' + L.cleanMax + 'なら次の選挙で全地区 +' + L.cleanStart + '・SNS +' + L.sns + ')</span>', onClick: function () { onPick('honest'); } },
        { label: '<b>一部を載せない</b><span>資金 +' + L.extra + '万円。発覚度 +' + L.gain + '。クリーンの評判は 0 に戻る</span>', onClick: function () { onPick('hide'); } },
      ], 'choices');
  };
  // 政治とカネのいまの様子(短い文)
  UI.ethicText = function (state) {
    const sc = Game.Scandal.get(state), L = Game.Balance.slush;
    if (sc.hidden > 0) return { value: '載せていない ' + sc.hidden + '万円', note: '発覚度 ' + Math.round(sc.exposure) + '(' + L.stages.join('・') + ' で取材・告発・捜査)', bad: true };
    return { value: 'クリーン ' + sc.clean + ' / ' + L.cleanMax, note: sc.clean >= L.cleanMax ? '次の選挙で全地区 +' + L.cleanStart + '・SNS +' + L.sns : '資金を正直に記載すると上がる(' + L.cleanMax + 'で選挙に効く)' };
  };

  // 選挙区の地図。fill(regionId) は { color, mix(%) } を返す(color がなければ地の色)
  // sel は金色の枠で囲む地区。札(pins)は呼び出し側が #pins に入れる
  UI.mapHtml = function (fill, sel) {
    const D = Game.Data.DISTRICT;
    const polys = D.regions.map(function (r) {
      const f = fill(r.id) || {};
      return '<polygon class="rg" data-id="' + r.id + '" points="' + r.pts + '" style="--lead:' + (f.color || 'var(--land)') + ';--mix:' + Math.round(f.mix || 0) + '%"/>';
    }).join('');
    const labels = D.labels.map(function (l) {
      return '<text class="map-lbl' + (l.big ? '' : ' small') + '" x="' + l.x + '" y="' + l.y + '" text-anchor="middle">' + UI.esc(l.text) + '</text>';
    }).join('');
    return '<div class="map">' +
      '<svg viewBox="0 0 ' + D.viewBox[0] + ' ' + D.viewBox[1] + '" role="img" aria-label="' + UI.esc(D.name) + 'の地図">' +
      '<defs><pattern id="scan" width="6" height="6" patternUnits="userSpaceOnUse"><line x1="0" y1="1" x2="6" y2="1" class="scanline"/></pattern></defs>' +
      '<rect class="outland" x="-900" y="-600" width="2400" height="1630"/>' +
      '<polygon class="sea" points="' + D.seaPts + '"/><polygon class="sea-tex" points="' + D.seaPts + '"/>' +
      polys + '<path class="rail" d="' + D.rail + '"/>' +
      (sel ? '<polygon class="sel-ring" points="' + Game.Data.REGION[sel].pts + '"/>' : '') +
      labels + '</svg><div id="pins"></div></div>';
  };
  // 支持の割合から、地図の塗り(リードしている候補の色と濃さ)を決める
  UI.leadFill = function (cands, shares) {
    const ord = Object.keys(shares).sort(function (a, b) { return shares[b] - shares[a]; });
    const c = cands.filter(function (x) { return x.id === ord[0]; })[0];
    const total = ord.reduce(function (a, k) { return a + shares[k]; }, 0) || 1;   // 票数でも割合でも受けられるように
    return { color: UI.color(c), mix: Math.max(20, Math.min(80, 20 + (shares[ord[0]] - shares[ord[1]]) / total * 100 * 2.4)) };
  };
  // 札の上に、伸びた量を浮かべる
  UI.floatOn = function (regionId, text, color) {
    const pin = document.querySelector('.pin[data-id="' + regionId + '"]');
    if (!pin) return;
    const el = document.createElement('span');
    el.className = 'float';
    el.textContent = text;
    if (color) el.style.color = color;
    pin.appendChild(el);
    el.addEventListener('animationend', function () { el.remove(); });
  };

  // 知らせの窓。buttons: [{ label, primary, onClick }]。閉じるのは呼び出し側が描き直すことで行う
  UI.modal = function (html, buttons, cls) {
    const wrap = document.createElement('div');
    wrap.className = 'modal-back';
    wrap.innerHTML = '<div class="modal ' + (cls || '') + '" role="dialog" aria-modal="true">' + html + '<div class="modal-btns"></div></div>';
    const row = wrap.querySelector('.modal-btns');
    buttons.forEach(function (b) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'btn' + (b.primary ? ' btn-primary' : '');
      el.innerHTML = b.label;
      el.onclick = function () { wrap.remove(); b.onClick && b.onClick(); };
      row.appendChild(el);
    });
    document.getElementById('app').appendChild(wrap);
    const first = row.querySelector('.btn-primary') || row.querySelector('.btn');
    if (first) first.focus();
    return wrap;
  };
  UI.sound = function (name) {
    try { Game.Effects.Title.sound(name); } catch (e) { /* 音が出せなくても遊べる */ }
  };
})(Game.UI);
