// 史実シナリオ(M19)の画面:シナリオと立場を選ぶ画面、党本部の「シナリオ」パネル、エンディングの「史実では」
window.Game = window.Game || {};
Game.UI = Game.UI || {};

(function (UI) {
  const esc = (s) => UI.esc(s);
  const SC = () => Game.Data.SCENARIOS;

  // 政党の名前と色(シナリオの政党はまだ差し込んでいないので、データから直接読む)
  function partyOf(sc, id) {
    const p = (sc.parties && sc.parties[id]) || {};
    const base = Game.Data.PARTIES[id] || {};
    return { name: p.name || base.name || id, short: p.short || base.short || id, color: p.color || base.color || '#999' };
  }
  function chip(sc, id) {
    const p = partyOf(sc, id);
    return `<span class="party-chip" style="--pc:${p.color}">${esc(p.short)}</span>`;
  }
  function seatBar(sc) {
    const total = Object.values(sc.seats).reduce((a, b) => a + b, 0);
    const ids = Object.keys(sc.seats).sort((a, b) => sc.seats[b] - sc.seats[a]);
    const segs = ids.map((id) => {
      const p = id === 'indep' ? { color: '#9aa0a6', name: '無所属など' } : partyOf(sc, id);
      return `<div class="seat-seg" style="flex:${sc.seats[id]};background:${p.color}" title="${esc(p.name)} ${sc.seats[id]}">${sc.seats[id] >= total * 0.06 ? sc.seats[id] : ''}</div>`;
    }).join('');
    const era = Game.Data.ERAS[sc.era];
    return `<div class="house-bar"><div class="seat-bar">${segs}</div><i class="majority-line" style="left:${(era.majority / total) * 100}%"></i></div>
      <p class="small muted">${ids.filter((id) => id !== 'indep').map((id) => `${esc(partyOf(sc, id).name)} ${sc.seats[id]}`).join('・')}${sc.seats.indep ? `・無所属など ${sc.seats.indep}` : ''}(${total}議席、過半数${era.majority})</p>`;
  }

  // ---------------- シナリオと立場を選ぶ ----------------
  UI.renderScenarioSelect = function (app) {
    let sel = (Game.ui && Game.ui.scenarioPick) || SC()[0].id;
    let role = 0;
    let name = '';
    let showHistory = false;
    function draw() {
      const sc = Game.Data.scenarioById(sel);
      const list = SC().map((s) => `
        <button class="scenario-card ${s.id === sel ? 'selected' : ''}" data-sc="${s.id}">
          <span class="scenario-year">${s.year}</span>
          <span class="scenario-name">${esc(s.title.replace(/^\S+\s/, ''))}</span>
          <span class="small muted">${esc(s.subtitle)}</span>
        </button>`).join('');
      const roles = sc.roles.map((r, i) => `
        <button class="party-card ${i === role ? 'selected' : ''}" data-role="${i}" style="--pc:${partyOf(sc, r.party).color}">
          <span class="party-card-name">${esc(r.title)}</span>
          <span class="party-card-pos">${chip(sc, r.party)} ${esc(partyOf(sc, r.party).name)} ・ 史実では ${esc(r.historical)}</span>
          <span class="party-card-desc">${esc(r.intro)}</span>
          <span class="party-card-desc"><b>目標</b>:${r.goals.map((g) => esc(g.label)).join(' / ')}</span>
        </button>`).join('');
      const r = sc.roles[role];
      app.innerHTML = `
        <div class="setup-screen scenario-screen">
          <h2 class="screen-title">史実シナリオ</h2>
          <p class="small muted">日本で実際に起きた政局を、実名の政党で遊ぶ。あなたは史実の人物の立場に立つが、名前は自由に決められる。実在の政治家は公開されている事実(役職や選挙の結果)でだけ登場し、不祥事や失言の出来事は起きない。</p>
          <div class="scenario-list">${list}</div>
          <section class="panel scenario-brief">
            <div class="panel-head"><h3>${esc(sc.title)}</h3><span class="muted small">${sc.year}年 ${esc(Game.Data.SESSIONS[sc.turnIndex])} ・ ${esc(Game.Data.ERAS[sc.era].label)}</span></div>
            ${sc.briefing.map((p) => `<p>${esc(p)}</p>`).join('')}
            <h4 class="field-label">衆議院の勢力</h4>
            ${seatBar(sc)}
            <p class="small muted">${esc(sc.note)}</p>
            <button class="btn btn-ghost small" data-act="history">${showHistory ? '史実の結末を隠す' : '史実の結末を見る(ネタバレ)'}</button>
            ${showHistory ? `<p class="scenario-history">${esc(sc.history)}</p>` : ''}
          </section>
          <section class="setup-section">
            <label class="field-label">立場を選ぶ</label>
            <div class="party-cards">${roles}</div>
          </section>
          <section class="setup-section">
            <label class="field-label" for="sc-name">あなたの名前</label>
            <input id="sc-name" class="text-input" maxlength="12" value="${esc(name)}" placeholder="空欄なら ${esc(r.historical)}">
          </section>
          <div class="setup-actions">
            <button class="btn" data-act="back">もどる</button>
            <button class="btn btn-primary btn-lg" data-act="start">このシナリオで始める</button>
          </div>
        </div>`;
      const nameInput = app.querySelector('#sc-name');
      nameInput.oninput = () => (name = nameInput.value);
      app.querySelectorAll('[data-sc]').forEach((b) => (b.onclick = () => { sel = b.dataset.sc; role = 0; showHistory = false; draw(); }));
      app.querySelectorAll('[data-role]').forEach((b) => (b.onclick = () => { role = +b.dataset.role; draw(); }));
      app.querySelector('[data-act="history"]').onclick = () => { showHistory = !showHistory; draw(); };
      app.querySelector('[data-act="back"]').onclick = () => Game.showScreen('title');
      app.querySelector('[data-act="start"]').onclick = () => Game.startScenario({ id: sel, role, name: name.trim() });
    }
    draw();
  };

  // ---------------- 党本部の「シナリオ」パネル ----------------
  UI.scenarioPanel = function (st) {
    if (!st.scenario) return '';
    const sc = Game.Scenario.current(st);
    if (!sc) return '';
    const r = Game.Scenario.result(st);
    const goals = r.goals.map((g) => `<li class="${g.done ? 'done' : ''}">${g.done ? '✔' : '□'} ${esc(g.label)}</li>`).join('');
    const end = sc.end.elections ? `次の総選挙のあとで決着(遅くとも${sc.end.maxYear}年まで)` : `${sc.end.maxYear}年まで`;
    return `
      <section class="panel scenario-panel">
        <div class="panel-head"><h3>${esc(sc.title)}</h3><span class="muted small">${esc(r.role)} ・ 史実では ${esc(r.historical)}</span></div>
        <ul class="scenario-goals">${goals}</ul>
        <p class="small muted">${esc(end)}。${esc(Game.Data.ERAS[st.world.era] ? Game.Data.ERAS[st.world.era].label : '')}</p>
      </section>`;
  };

  // ---------------- エンディングの「史実では」 ----------------
  UI.scenarioEnding = function (e) {
    const r = e && e.scenario;
    if (!r) return '';
    return `
      <section class="panel scenario-panel">
        <h3>${esc(r.scenarioTitle)} ・ ${esc(r.role)}</h3>
        <ul class="scenario-goals">${r.goals.map((g) => `<li class="${g.done ? 'done' : ''}">${g.done ? '✔' : '□'} ${esc(g.label)}:${g.done ? '達成' : '未達'}</li>`).join('')}</ul>
        <h4 class="field-label">史実では</h4>
        <p>${esc(r.history)}</p>
        <p class="small muted">史実シナリオの結果は殿堂には記録しない。</p>
      </section>`;
  };
})(Game.UI);
