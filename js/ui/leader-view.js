// 党首選の画面(党首になったあとは party-view.js の党首モード)
window.Game = window.Game || {};
Game.UI = Game.UI || {};

(function (UI) {
  const esc = (s) => UI.esc(s);
  const L = () => Game.Leadership;

  // ---------------- 党首選 ----------------
  UI.renderLeaderRace = function (app) {
    const st = Game.state;
    const race = st.leaderRace;
    if (!race) {
      st.screen = 'term';
      return Game.commit();
    }
    const party = UI.party(race.party);
    if (race.result) return renderResult(app, st, race, party);

    const LB = Game.Balance.leadership;
    const sh = L().shares(race);
    const rows = race.cands
      .map((x) => `
        <li class="lr-row ${x.isPlayer ? 'me' : ''}">
          <span class="lr-name"><b>${esc(x.name)}</b>${x.isPlayer ? '<span class="you">あなた</span>' : ''}<small>${esc(x.title || '')}</small></span>
          <span class="lr-bar-wrap"><span class="small muted">議員票</span><span class="lr-bar"><span style="width:${(sh[x.id].mp * 100).toFixed(1)}%"></span></span><b>${Math.round(sh[x.id].mp * 100)}%</b></span>
          <span class="lr-bar-wrap"><span class="small muted">党員票</span><span class="lr-bar member"><span style="width:${(sh[x.id].member * 100).toFixed(1)}%"></span></span><b>${Math.round(sh[x.id].member * 100)}%</b></span>
        </li>`)
      .join('');
    const buttons = Object.keys(L().ACTIONS)
      .map((id) => {
        const a = L().ACTIONS[id];
        return `
          <button class="action-btn" data-lr="${id}" ${race.actionsLeft > 0 ? '' : 'disabled'}>
            <span class="action-icon">${a.icon}</span>
            <span class="action-body"><span class="action-name">${esc(a.name)}</span><span class="action-desc">${esc(a.desc)}</span></span>
          </button>`;
      })
      .join('');
    const log = race.log.slice().reverse().map((l) => `<li><span class="log-day">第${l.round}ラウンド</span>${esc(l.text)}</li>`).join('');
    const mps = Game.Data.PARTY_MPS[race.party];
    const isLast = race.round >= LB.rounds;
    app.innerHTML = `
      <div class="campaign leader-race">
        <header class="hud" style="--pc:${party.color}">
          <div class="hud-title">
            <span class="hud-district">${esc(party.name)} 党首選${race.party === Game.Data.RULING_PARTY ? '(勝てば首相)' : ''}</span>
            <span class="hud-name">${esc(st.player.name)}</span>
          </div>
          <div class="hud-day"><span class="hud-day-num">第${race.round}<small>ラウンド / ${LB.rounds}</small></span></div>
          <div class="hud-stats">
            <div class="stat"><span class="stat-label">行動</span><span class="act-pips">${Array.from({ length: LB.actionsPerRound }, (_, i) => `<span class="act-pip ${i < race.actionsLeft ? 'on' : ''}"></span>`).join('')}</span></div>
            <div class="stat"><span class="stat-label">議員票</span><span class="stat-val">${mps}<small>票</small></span></div>
            <div class="stat"><span class="stat-label">党員票</span><span class="stat-val">${mps}<small>票に換算</small></span></div>
          </div>
        </header>
        <div class="campaign-main">
          <div class="col-left">
            <section class="panel">
              <div class="panel-head"><h3>支持の見込み</h3><span class="muted small">報道各社の調べ</span></div>
              <ul class="lr-list">${rows}</ul>
              <p class="small muted">議員票と党員票の合計で過半数を取れば当選。誰も過半数に届かなければ、上位2人の決選投票(議員票 ${mps} + 都道府県ごとの党員票 ${LB.runoffMemberVotes})。決選投票は議員票が重い。</p>
            </section>
            ${UI.raceFactionPanel(race)}
            <section class="panel log-panel"><ul class="log-list">${log || '<li class="muted small">告示。選挙戦が始まった。</li>'}</ul></section>
          </div>
          <div class="col-right">
            <section class="panel actions-panel">
              <div class="panel-head"><h3>このラウンドの行動 <span class="muted small">残り${race.actionsLeft}回</span></h3></div>
              ${st.ui.lastResult ? `<div class="last-result">${esc(st.ui.lastResult)}</div>` : ''}
              <div class="action-grid">${buttons}</div>
              <div class="end-day">
                <button class="btn" data-act="undo" ${Game.canUndo() ? '' : 'disabled'} title="このラウンドの行動を取り消す">↶ 取り消す</button>
                <button class="btn ${race.actionsLeft === 0 ? 'btn-primary btn-lg pulse' : ''}" data-act="end-round">${isLast ? '投票へ' : 'ラウンドを終える'}</button>
              </div>
            </section>
          </div>
        </div>
      </div>`;
    app.querySelectorAll('[data-lr]').forEach((b) => {
      b.onclick = () => {
        Game.pushUndo();
        const res = L().act(st, b.dataset.lr);
        if (!res.ok) Game.dropUndo();
        st.ui.lastResult = res.text;
        Game.commit();
      };
    });
    app.querySelector('[data-act="undo"]').onclick = () => Game.undo();
    app.querySelector('[data-act="end-round"]').onclick = () => {
      if (race.actionsLeft > 0 && !confirm(`行動があと${race.actionsLeft}回残っています。進みますか?`)) return;
      L().endRound(st);
      Game.clearUndo();
      st.ui.lastResult = null;
      Game.commit();
    };
  };

  function voteTable(rows, title, total) {
    const body = rows
      .map((r, i) => `<tr class="${r.id === 'player' ? 'me' : ''}"><td>${i + 1}</td><td>${esc(r.name)}</td><td class="num">${r.mp}</td><td class="num">${r.member}</td><td class="num"><b>${r.total}</b></td></tr>`)
      .join('');
    return `
      <h3 class="list-title">${esc(title)} <span class="muted small">過半数 ${Math.floor(total / 2) + 1}</span></h3>
      <table class="result-table list-table">
        <thead><tr><th></th><th>候補</th><th class="num">議員票</th><th class="num">党員票</th><th class="num">計</th></tr></thead>
        <tbody>${body}</tbody>
      </table>`;
  }

  function renderResult(app, st, race, party) {
    const res = race.result;
    const won = res.winner === 'player';
    const winner = race.cands.find((x) => x.id === res.winner);
    const runoffTotal = res.runoff ? res.runoff.reduce((s, r) => s + r.total, 0) : 0;
    app.innerHTML = `
      <div class="tv">
        <header class="tv-head">
          <div class="tv-title"><span class="tv-live">LIVE</span> ${esc(party.name)} 党首選 <b>開票</b></div>
        </header>
        <div class="tv-body light">
          ${(race.betrayals || []).map((t) => `<p class="verdict verdict-lost">${esc(t)}</p>`).join('')}
          ${voteTable(res.first, '1回目の投票', res.totalFirst)}
          ${res.runoff ? `<p class="small muted">誰も過半数に届かず、上位2人の決選投票へ。</p>${voteTable(res.runoff, '決選投票', runoffTotal)}` : ''}
          <div class="verdict ${won ? 'verdict-pr' : 'verdict-lost'}">
            ${won ? `${esc(st.player.name)}が新しい党首に選ばれた!${race.party === Game.Data.RULING_PARTY ? '首班指名を経て、内閣総理大臣に就任する。' : ''}` : `${esc(winner.name)}が党首に選ばれた。あなたは及ばなかった。`}
          </div>
        </div>
        <div class="tv-controls">
          <button class="btn btn-primary btn-lg" data-act="finish">${won ? '党首に就任する' : '議員生活に戻る'}</button>
        </div>
      </div>`;
    app.querySelector('[data-act="finish"]').onclick = () => Game.finishLeaderRace();
  }

})(Game.UI);
