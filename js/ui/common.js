// 画面共通の小さな部品
window.Game = window.Game || {};
Game.UI = Game.UI || {};

(function (UI) {
  UI.esc = function (s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  };

  // 既存の党・小政党・分裂でできた党など、どの党でも表示できるようにする
  UI.party = (id) => Game.Data.PARTIES[id] || (Game.Data.MINOR_PARTIES || {})[id] || (Game.Data.PARTIES_EXTRA || {})[id] || { id, name: id, short: String(id).slice(0, 2), color: '#999' };

  UI.partyChip = function (id) {
    const p = UI.party(id);
    return `<span class="party-chip" style="--pc:${p.color}">${UI.esc(p.short)}</span>`;
  };

  UI.ROLE_LABEL = {
    incumbentStrong: '現職',
    incumbent: '現職',
    former: '元職',
    newcomer: '新人',
    assassin: '刺客',
  };

  // 新聞の情勢記事ふうの印
  UI.OUTLOOK_MARK = {
    strong: '◎',
    lean: '○',
    toss: '▲',
    behind: '△',
    weak: '×',
  };

  UI.TRAIT_LABEL = {
    urban: '都市度',
    youth: '若者',
    elderly: '高齢者',
    industry: '工業',
    farm: '農業',
  };

  UI.pct = (v) => (v * 100).toFixed(1) + '%';

  // 現職 → 元職 → 新人・刺客の順(同じなら元の順)
  UI.ROLE_ORDER = { incumbentStrong: 0, incumbent: 0, former: 1, newcomer: 2, assassin: 2 };
  UI.byRole = (candidates) => candidates.map((c, i) => [c, i]).sort((a, b) => ((UI.ROLE_ORDER[a[0].role] ?? 3) - (UI.ROLE_ORDER[b[0].role] ?? 3)) || a[1] - b[1]).map((x) => x[0]);

  // シェアの大きい順に並べた候補
  UI.byShare = (candidates, shares) => candidates.slice().sort((a, b) => shares[b.id] - shares[a.id]);

  UI.formatVotes = (v) => Math.round(v).toLocaleString('ja-JP');

  // 議席の帯の残り(定数に足りない分)を灰色で埋める
  UI.seatFiller = (sum, total) => (sum < total ? `<div class="seat-seg" style="flex:${total - sum};background:#3a4670" title="欠員など ${total - sum}"></div>` : '');

  // ---------------- ≡ メニュー ----------------
  // 画面の ≡ ボタンを押すとメニューを出す。≡ のない画面でも、引退できる画面なら右下にボタンを置く
  UI.bindGameMenu = function (app) {
    if (!Game.state || Game.screen === 'title' || Game.screen === 'setup' || Game.screen === 'versusSetup' || Game.screen === 'slots' || Game.screen === 'hall') return;
    const btns = app.querySelectorAll('[data-act="menu"]');
    if (!btns.length && Game.canRetire()) {
      const b = document.createElement('button');
      b.className = 'btn float-menu';
      b.dataset.act = 'menu';
      b.textContent = '≡ メニュー';
      app.appendChild(b);
    }
    app.querySelectorAll('[data-act="menu"]').forEach((b) => (b.onclick = () => UI.openGameMenu()));
  };
  UI.openGameMenu = function () {
    const root = document.getElementById('modal-root');
    const retire = Game.canRetire();
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal">
          <p class="modal-kicker">メニュー ・ セーブデータ ${Game.slot}</p>
          <h2>どうする?</h2>
          <div class="choices">
            <button class="btn choice-btn" data-menu="title"><b>セーブしてタイトルへ</b><span class="small muted">いつでもこのセーブデータから続きを遊べる</span></button>
            ${retire ? '<button class="btn choice-btn" data-menu="retire"><b>政界を引退する</b><span class="small muted">ここでゲームを終え、エンディングとレガシー評価を見る(取り消せない)</span></button>' : ''}
          </div>
          <div class="modal-actions"><button class="btn" data-menu="close">とじる</button></div>
        </div>
      </div>`;
    root.querySelector('[data-menu="close"]').onclick = () => (root.innerHTML = '');
    root.querySelector('[data-menu="title"]').onclick = () => {
      root.innerHTML = '';
      Game.save();
      Game.showScreen('title');
    };
    const r = root.querySelector('[data-menu="retire"]');
    if (r) r.onclick = () => {
      if (!confirm('政界を引退して、ゲームを終えますか?(取り消せません)')) return;
      root.innerHTML = '';
      Game.retire();
    };
  };

  // セーブデータの中身をひとことで(セーブデータを選ぶ画面)
  UI.saveSummary = function (s) {
    if (!s) return null;
    const p = UI.party(s.player && s.player.party).name;
    const when = s.world ? `${s.world.year}年` : '';
    let where = '';
    if (s.versus) where = `2人で対戦(${s.versus.players.map((P) => P.name).join(' 対 ')})`;
    else if (s.screen === 'ending') where = `エンディング:${s.ending ? s.ending.title : ''}`;
    else if (s.leader && s.leader.mode === 'leader') where = s.gov && s.gov.role === 'pm' ? '首相' : '党首';
    else if (s.career) where = s.career.status === 'ronin' ? '浪人中' : s.career.status === 'founder' ? '結党準備中' : `衆議院議員(当選${s.career.wins}回)`;
    else if (s.campaign) where = `はじめての選挙戦 ${s.campaign.day}日目`;
    const saved = s.savedAt ? new Date(s.savedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    if (!s.versus && Game.Data.seatById) where = `${Game.Data.seatById(s.seat).name} ・ ${where}`;   // 選挙区(古いセーブは北陽3区)
    return { title: s.versus ? '対戦' : `${s.player.name}(${p})`, where, when, saved, easy: s.difficulty === 'easy' };
  };

  // 候補ごとのシェア帯グラフ(シェアの大きい順に左から)
  UI.shareBar = function (shares, candidates) {
    const segs = UI.byShare(candidates, shares)
      .map((c) => {
        const p = UI.party(c.party);
        const w = (shares[c.id] * 100).toFixed(1);
        return `<div class="seg" style="width:${w}%;background:${p.color}" title="${UI.esc(c.name)} ${w}%"></div>`;
      })
      .join('');
    return `<div class="share-bar">${segs}</div>`;
  };
})(Game.UI);
