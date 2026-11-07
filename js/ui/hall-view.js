// 殿堂の画面(M17):実績、歴代の記録、自己ベスト。エンディング画面の「新しく達成した実績」
window.Game = window.Game || {};
Game.UI = Game.UI || {};

(function (UI) {
  const esc = (s) => UI.esc(s);
  const fmtDate = (t) => new Date(t).toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' });
  const A = () => Game.Data.ACHIEVEMENTS;

  UI.renderHall = function (app) {
    const hall = Game.loadHall();
    const b = Game.Hall.bests(hall);
    const tab = Game.hallTab || 'achievements';
    const badges = A().map((a) => {
      const got = hall.achievements[a.id];
      return `
        <li class="ach ${got ? 'got' : ''}">
          <span class="ach-icon">${got ? a.icon : '?'}</span>
          <span class="ach-body">
            <b>${esc(a.title)}</b>
            <span class="small muted">${esc(a.desc)}</span>
            ${got ? `<span class="small ach-when">${esc(fmtDate(got.at))} ・ ${esc(got.name)}(${esc(got.party)})</span>` : ''}
          </span>
        </li>`;
    }).join('');
    const rows = hall.records.map((r, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td><b>${esc(r.name)}</b><br><span class="small muted">${esc(fmtDate(r.at))}</span></td>
        <td><span class="party-chip" style="--pc:${esc(r.partyColor || '#999')}">${esc((r.partyName || '').slice(0, 2))}</span> ${esc(r.partyName)}<br><span class="small muted">${esc(r.seatName || '')}</span></td>
        <td>${esc(r.title)}${r.pmYears ? `<br><span class="small muted">首相 ${r.pmYears.toFixed(1)}年</span>` : ''}</td>
        <td class="num"><b class="grade-mini grade-${esc(r.grade)}">${esc(r.grade)}</b> ${r.score}点</td>
      </tr>`).join('');
    const gradeLine = ['S', 'A', 'B', 'C', 'D'].map((g) => `${g}:${b.grades[g] || 0}`).join(' ・ ');
    const bestHtml = `
      <div class="stat-cards">
        <div class="stat-card"><span>終えたゲーム</span><b>${b.plays}</b><small>回</small></div>
        <div class="stat-card"><span>最高のレガシー評価</span><b>${b.bestScore === null ? '—' : b.bestScore}</b><small>点</small></div>
        <div class="stat-card"><span>首相の在任(最長)</span><b>${b.pmYears.toFixed(1)}</b><small>年</small></div>
        <div class="stat-card"><span>当選回数(最多)</span><b>${b.wins}</b><small>回</small></div>
        <div class="stat-card"><span>総選挙の最多議席</span><b>${b.maxSeats}</b><small>議席</small></div>
        <div class="stat-card"><span>実績</span><b>${b.unlocked}</b><small>/ ${b.total}</small></div>
      </div>
      <p class="small muted">評価の分布 ${esc(gradeLine)}</p>
      <p class="small muted">当選したことのある選挙区:${hall.seatsWon.length ? hall.seatsWon.map((id) => esc(Game.Data.seatById(id).name)).join('・') : 'まだない'}(${hall.seatsWon.length} / ${Game.Data.SEATS.length})</p>
      <p class="small muted">首相になったことのある党:${hall.pmParties.length ? hall.pmParties.map((p) => esc(UI.party(p).name)).join('・') : 'まだない'}</p>`;
    const body = tab === 'records'
      ? (rows ? `<div class="list-wrap"><table class="result-table hall-table"><thead><tr><th>順位</th><th>名前</th><th>党・選挙区</th><th>終わり方</th><th>評価</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">まだ記録がない。エンディングを迎えると、ここに残る。</p>')
      : tab === 'bests' ? bestHtml
      : `<ul class="ach-list">${badges}</ul>`;
    const tabBtn = (id, label) => `<button class="mode-pick hall-tab ${tab === id ? 'on' : ''}" data-tab="${id}"><b>${label}</b></button>`;
    app.innerHTML = `
      <div class="setup-screen hall">
        <h2 class="screen-title">殿堂</h2>
        <p class="small muted">エンディングを迎えるたびに記録が残る。セーブデータとは別に保存しているので、セーブデータを消しても消えない。</p>
        <div class="hall-tabs">${tabBtn('achievements', `実績 ${b.unlocked}/${b.total}`)}${tabBtn('records', '歴代の記録')}${tabBtn('bests', '自己ベスト')}</div>
        <section class="panel">${body}</section>
        <div class="setup-actions">
          <button class="btn btn-ghost small" data-act="clear">殿堂の記録を消す</button>
          <button class="btn btn-primary" data-act="back">タイトルへ</button>
        </div>
      </div>`;
    app.querySelectorAll('[data-tab]').forEach((x) => (x.onclick = () => { Game.hallTab = x.dataset.tab; UI.renderHall(app); }));
    app.querySelector('[data-act="back"]').onclick = () => Game.showScreen('title');
    app.querySelector('[data-act="clear"]').onclick = () => {
      if (!confirm('殿堂の記録(歴代の記録と実績)をすべて消しますか?(元に戻せません。セーブデータは消えません)')) return;
      Game.clearHall();
      UI.renderHall(app);
    };
  };

  // エンディング画面:新しく達成した実績と、歴代の順位
  UI.hallNews = function (info) {
    if (!info) return '';
    const items = (info.newly || []).map((id) => A().find((a) => a.id === id)).filter(Boolean);
    if (!items.length && !info.rank) return '';
    return `
      <section class="panel hall-news">
        <h3>殿堂</h3>
        ${info.rank ? `<p>歴代の記録で <b class="gold-text">${info.rank}位</b> に入った。</p>` : ''}
        ${items.length ? `<p class="small muted">新しく達成した実績</p><ul class="ach-list compact">${items.map((a) => `<li class="ach got new"><span class="ach-icon">${a.icon}</span><span class="ach-body"><b>${esc(a.title)}</b><span class="small muted">${esc(a.desc)}</span></span></li>`).join('')}</ul>` : ''}
      </section>`;
  };
})(Game.UI);
