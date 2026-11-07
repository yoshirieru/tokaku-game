// エンディングとレガシー評価の画面
window.Game = window.Game || {};
Game.UI = Game.UI || {};

(function (UI) {
  const esc = (s) => UI.esc(s);

  UI.renderEnding = function (app) {
    const st = Game.state;
    const e = st.ending;
    if (!e) { Game.showScreen('title'); return; }
    const party = UI.party(e.party);
    const rows = e.items
      .map((it) => `<tr class="${it.points < 0 ? 'minus' : ''}"><th>${esc(it.label)}</th><td>${esc(it.value)}</td><td class="num"><b>${it.points > 0 ? '+' : ''}${it.points}</b></td></tr>`)
      .join('');
    const label = { smd: '小選挙区で当選', pr: '比例復活', lost: '落選' };
    const hist = (st.career.elections || [])
      .map((x, i) => `<li><span class="muted">${x.year}年</span> ${i + 1}回目の衆院選:${label[x.result] || x.result}(${UI.formatVotes(x.votes)}票)</li>`)
      .join('');
    const govHist = st.gov && st.gov.pmTurns ? `<li><span class="muted">首相</span> 在任 ${(st.gov.pmTurns / 4).toFixed(1)}年、成立した法案 ${st.gov.billsPassed}本</li>` : '';
    app.innerHTML = `
      <div class="end-screen ending">
        <div class="ending-hero" style="--pc:${party.color}">
          <p class="modal-kicker">${e.year || ''}年 ・ ${esc(party.name)} ・ ${esc(st.player.name)}</p>
          <h2 class="ending-title">${esc(e.title)}</h2>
          <p>${esc(e.text)}</p>
          <div class="grade-box grade-${e.grade}">
            <span class="grade-label">レガシー評価</span>
            <span class="grade">${e.grade}</span>
            <span class="grade-score">${e.score}点</span>
          </div>
        </div>
        ${UI.hallNews ? UI.hallNews(e.hall) : ''}
        <section class="panel">
          <h3>評価の内訳</h3>
          <table class="result-table legacy-table"><tbody>${rows}</tbody><tfoot><tr><th colspan="2">合計</th><td class="num"><b>${e.score}</b></td></tr></tfoot></table>
          <p class="small muted">${Game.Balance.legacy.grades.filter((x) => x.g !== 'D').map((x) => `${x.g}:${x.min}点以上`).join(' / ')} / D:それ未満</p>
        </section>
        <section class="panel">
          <h3>政治家としての歩み</h3>
          <ul class="career-list">${hist}${govHist}</ul>
        </section>
        <div class="setup-actions">
          <button class="btn" data-act="title">タイトルへ</button>
          <button class="btn" data-act="hall">殿堂を見る</button>
          <button class="btn btn-primary btn-lg" data-act="again">はじめから遊ぶ</button>
        </div>
      </div>`;
    app.querySelector('[data-act="title"]').onclick = () => Game.showScreen('title');
    app.querySelector('[data-act="hall"]').onclick = () => Game.showScreen('hall');
    app.querySelector('[data-act="again"]').onclick = () => Game.showScreen('setup');
  };
})(Game.UI);
