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
  UI.mapHtml = function (fill, sel, extra) {
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
      polys + '<path class="rail" d="' + D.rail + '"/>' + (extra || '') +
      (sel ? '<polygon class="sel-ring" points="' + Game.Data.REGION[sel].pts + '"/>' : '') +
      labels + '</svg><div id="pins"></div></div>';
  };
  // 有権者の点(R18):地区ごとに決まった人たちを、いまの投票先の党の色で打つ。ゆうべの口コミで投票先が変わった人は、前の色から変わって、輪がつく
  // 点の場所は地区の形の中に、札(地区の名前)を避けて決まった並びで置く(舞台と地区ごとに一度だけ計算)
  const dotPos = {};
  function dotPlaces(D, r, n) {
    const key = D.id + ':' + r.id + ':' + n;
    if (dotPos[key]) return dotPos[key];
    const pts = r.pts.trim().split(/\s+/).map(function (p) { const xy = p.split(','); return [+xy[0], +xy[1]]; });
    const inside = function (x, y) {
      let c = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i], b = pts[j];
        if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
      }
      return c;
    };
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    pts.forEach(function (p) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
    const px = r.x / 100 * D.viewBox[0], py = r.y / 100 * D.viewBox[1], P = Game.Balance.ui.voterDots;
    let seed = 0;
    for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) >>> 0;
    const rnd = function () { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const out = [];
    for (let tries = 0; out.length < n && tries < n * 400; tries++) {
      const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0);
      if (!inside(x, y)) continue;
      const strict = tries < n * 200;   // はじめは札のまわりと、ほかの点のそばを避ける
      if (strict && Math.abs(x - px) < P.pinW && Math.abs(y - py) < P.pinH) continue;
      if (strict && out.some(function (q) { return (q[0] - x) * (q[0] - x) + (q[1] - y) * (q[1] - y) < P.gap * P.gap; })) continue;
      out.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
    }
    return (dotPos[key] = out);
  }
  UI.voterDots = function (camp) {
    if (!camp || !camp.voters || !Game.Voters.active(camp)) return '';
    const D = Game.Data.DISTRICT, P = Game.Balance.ui.voterDots;
    const color = function (id) { const c = camp.cands.filter(function (x) { return x.id === id; })[0]; return c ? UI.color(c) : 'var(--sub)'; };
    let html = '<g class="vdots" aria-hidden="true">', k = 0;
    D.regions.forEach(function (r) {
      const list = Game.Voters.dots(camp, r.id);
      if (!list) return;
      const pos = dotPlaces(D, r, list.length);
      list.forEach(function (d, i) {
        if (!pos[i]) return;
        const flip = d.from ? ' flip" style="--from:' + color(d.from) + ';--to:' + color(d.who) + ';animation-delay:' + ((k++ % 12) * 0.12).toFixed(2) + 's' : '';
        html += '<circle class="vdot' + flip + '" cx="' + pos[i][0] + '" cy="' + pos[i][1] + '" r="' + P.r + '" fill="' + color(d.who) + '"/>';
      });
    });
    return html + '</g>';
  };
  // 点の見方(地図の左下)。ゆうべの口コミで投票先が変わった人の数も
  UI.dotLegend = function (camp) {
    if (!camp || !camp.voters) return '';
    let n = 0, all = 0;
    Game.Data.DISTRICT.regions.forEach(function (r) { (Game.Voters.dots(camp, r.id) || []).forEach(function (d) { all++; if (d.from) n++; }); });
    if (!all) return '';
    return '<div class="dot-legend"><i class="lg-dot"></i>有権者' + (n ? '<i class="lg-dot flip"></i>ゆうべの口コミで ' + n + '人が投票先を変えた' : '(点の色は、いま入れそうな候補)') + '</div>';
  };
  // 「この人の一票」(R18):開票特番の候補の欄の下に、開いた地区の有権者1人の票を出す。t ごとに入れ替わる
  //   e.ballots は vote.js が Voters.ballot から受け取ったもの({ age, job, region, who, party, why })。national なら党の名前で
  UI.ballotCard = function (e, cands, t, opened, national) {
    const list = (e.ballots || []).filter(function (b) { return opened(b.region); });
    if (!list.length || t <= 0) return '';
    const b = list[(t * 7) % list.length], c = cands.filter(function (x) { return x.id === b.who; })[0];
    if (!c) return '';
    const name = national ? Game.Data.PARTIES[c.party].name : c.name + '候補';
    const reg = Game.Data.REGION[b.region] ? Game.Data.REGION[b.region].name : '';
    return '<aside class="vote-card" style="--pc:' + UI.color(c) + '"><span class="vc-lab">この人の一票</span>' +
      '<p><b>' + b.age + '歳・' + UI.esc(b.job) + '・' + UI.esc(reg) + '</b>' + UI.esc(b.why) + '、<em>' + UI.esc(name) + '</em>に投票</p></aside>';
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
