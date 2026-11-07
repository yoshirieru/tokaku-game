// 党首モードの総選挙の画面:準備(擁立・名簿・候補者調整)、全国の選挙戦、開票特番、結果
window.Game = window.Game || {};
Game.UI = Game.UI || {};

(function (UI) {
  const esc = (s) => UI.esc(s);
  const N = () => Game.National;
  const NB = () => Game.Balance.national;
  const BLOCKS = () => Game.Data.BLOCKS;
  const chip = (id) => UI.partyChip(id);

  // ---------------- 選挙の準備 ----------------
  UI.renderNationalPrep = function (app) {
    const st = Game.state;
    const prep = st.nationalPrep;
    const me = st.leader.party;
    const party = UI.party(me);
    const inc = N().incumbents(st, me);
    const cost = N().prepCost(st, prep);
    const nat = { requirement: Game.Career.isCustom(st) ? !!st.party.requirement : true };
    const rows = BLOCKS()
      .map((b) => {
        const n = prep.coverage[b.id];
        const cel = prep.celebrities[b.id] || 0;
        const prOk = nat.requirement || n >= Math.ceil(b.pr * NB().prRequirementShare);
        return `
          <tr>
            <th>${esc(b.name)}<small class="muted"> 選挙区${b.smd}・比例${b.pr}</small></th>
            <td class="num">${inc[b.id]}</td>
            <td class="stepper"><button class="btn small" data-cov="${b.id}" data-d="-1" ${n <= inc[b.id] || (b.id === Game.Data.HOME_BLOCK && n <= 1) ? 'disabled' : ''}>−</button><b>${n}</b><button class="btn small" data-cov="${b.id}" data-d="1" ${n >= b.smd ? 'disabled' : ''}>+</button></td>
            <td class="stepper"><button class="btn small" data-cel="${b.id}" data-d="-1" ${cel <= 0 ? 'disabled' : ''}>−</button><b>${cel}</b><button class="btn small" data-cel="${b.id}" data-d="1" ${cel >= NB().celebrityMax ? 'disabled' : ''}>+</button></td>
            <td>${prOk ? '<span class="tag win">比例に出る</span>' : `<span class="tag">比例に出られない(あと${Math.ceil(b.pr * NB().prRequirementShare) - n}人)</span>`}</td>
          </tr>`;
      })
      .join('');
    const partners = N().coopPartners(st)
      .map((p) => {
        const cur = prep.coops.find((c) => c.partner === p.id);
        const rejected = (prep.rejected || []).includes(p.id);
        const btns = Object.keys(N().COOP_TYPES)
          .map((t) => {
            const on = cur && cur.type === t;
            const w = p.will[t];
            return `<button class="policy-pick ${on ? 'on' : ''}" data-coop="${p.id}" data-type="${t}" ${rejected || (cur && !on) ? 'disabled' : ''} title="${esc(N().COOP_TYPES[t].desc)}">${esc(N().COOP_TYPES[t].name)}<small> ${w >= 15 ? '◎' : w >= 0 ? '○' : '×'}</small></button>`;
          })
          .join('');
        return `
          <li class="coop-row">
            <span>${chip(p.id)} <b>${esc(p.name)}</b> <span class="muted small">${p.seats}議席${p.conflicts.length ? ' ・ 政策がぶつかる' : ''}${rejected ? ' ・ 今回は断られた' : ''}</span></span>
            <div class="policy-picks">${btns}${cur ? `<button class="btn btn-ghost small" data-uncoop="${p.id}">取り消す</button>` : ''}</div>
          </li>`;
      })
      .join('');
    app.innerHTML = `
      <div class="setup-screen national-prep">
        <p class="modal-kicker">${esc(party.name)} ・ 総選挙の準備</p>
        <h2 class="screen-title">候補者を立てる</h2>
        <div class="stat-cards compact">
          <div class="stat-card"><span>選挙資金</span><b>${cost.funds}</b><small>万円</small></div>
          <div class="stat-card"><span>擁立の費用</span><b>${cost.cost}</b><small>万円</small></div>
          <div class="stat-card"><span>選挙戦に回せる資金</span><b class="${cost.remain < 0 ? 'warn-text' : ''}">${cost.remain}</b><small>万円</small></div>
          <div class="stat-card"><span>小選挙区の候補</span><b>${Object.values(prep.coverage).reduce((a, b) => a + b, 0)}</b><small>/ 289人</small></div>
        </div>
        <section class="setup-section">
          <h3 class="field-label">ブロックごとの擁立</h3>
          <p class="small muted">現職はそのまま立つ(費用なし)。新人は1人${NB().candidateCost}万円、有名人は1人${NB().celebrityCost}万円(そのブロックの知名度と支持が上がる)。候補を立てない選挙区では勝てない。${nat.requirement ? '' : '政党要件がないので、ブロック定数の2割以上の候補を立てないとそのブロックの比例に出られない。'}</p>
          <div class="list-wrap">
            <table class="result-table prep-table">
              <thead><tr><th>ブロック</th><th class="num">現職</th><th>小選挙区の候補</th><th>有名人</th><th>比例</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          <div class="move-buttons">
            <button class="btn small" data-all="inc">現職だけ</button>
            <button class="btn small" data-all="half">半分の選挙区に</button>
            <button class="btn small" data-all="full">全選挙区に</button>
          </div>
        </section>
        <section class="setup-section">
          <h3 class="field-label">比例名簿の方針</h3>
          <div class="policy-picks">
            <button class="policy-pick ${prep.listPolicy === 'dup' ? 'on' : ''}" data-list="dup">重複立候補を中心に</button>
            <button class="policy-pick ${prep.listPolicy === 'solo' ? 'on' : ''}" data-list="solo">比例単独の有名人を上位に</button>
          </div>
          <p class="small muted">重複中心:小選挙区の候補が比例で復活でき、選挙区の士気が保たれる。単独上位:比例の票は少し伸びるが、選挙区の候補の士気が少し下がる。</p>
        </section>
        <section class="setup-section">
          <h3 class="field-label">他党との候補者調整</h3>
          <p class="small muted">◎前向き ○応じそう ×断られそう。選ぶとその場で申し入れる。断られた相手とは今回は組めない。</p>
          <ul class="coop-list">${partners}</ul>
        </section>
        <div class="setup-actions">
          <button class="btn btn-primary btn-lg" data-act="go" ${cost.remain < 0 ? 'disabled' : ''}>公示 ― 選挙戦へ</button>
        </div>
      </div>`;

    const commit = () => Game.commit();
    app.querySelectorAll('[data-cov]').forEach((b) => (b.onclick = () => { prep.coverage[b.dataset.cov] += +b.dataset.d; commit(); }));
    app.querySelectorAll('[data-cel]').forEach((b) => (b.onclick = () => { prep.celebrities[b.dataset.cel] += +b.dataset.d; commit(); }));
    app.querySelectorAll('[data-all]').forEach((b) => (b.onclick = () => {
      for (const bl of BLOCKS()) {
        const v = b.dataset.all === 'inc' ? inc[bl.id] : b.dataset.all === 'half' ? Math.max(inc[bl.id], Math.round(bl.smd / 2)) : bl.smd;
        prep.coverage[bl.id] = Math.max(bl.id === Game.Data.HOME_BLOCK ? 1 : 0, v);
      }
      commit();
    }));
    app.querySelectorAll('[data-list]').forEach((b) => (b.onclick = () => { prep.listPolicy = b.dataset.list; commit(); }));
    app.querySelectorAll('[data-coop]').forEach((b) => (b.onclick = () => {
      const partner = b.dataset.coop;
      const type = b.dataset.type;
      const w = N().coopWillingness(st, partner, type);
      if (w >= 0) prep.coops.push({ partner, type });
      else prep.rejected = (prep.rejected || []).concat(partner);
      st.ui.lastResult = w >= 0 ? `${UI.party(partner).name}と「${N().COOP_TYPES[type].name}」で合意した。` : `${UI.party(partner).name}に申し入れを断られた。`;
      commit();
    }));
    app.querySelectorAll('[data-uncoop]').forEach((b) => (b.onclick = () => { prep.coops = prep.coops.filter((c) => c.partner !== b.dataset.uncoop); commit(); }));
    app.querySelector('[data-act="go"]').onclick = () => Game.startNationalCampaign();
  };

  // ---------------- 全国の選挙戦 ----------------
  UI.renderNationalCampaign = function (app, modalRoot) {
    const st = Game.state;
    const camp = st.campaign;
    const C = Game.Campaign;
    if (!C.regionById(camp, st.ui.selectedRegion)) st.ui.selectedRegion = Game.Data.HOME_BLOCK;
    const me = camp.candidates.find((c) => c.isPlayer);
    const party = UI.party(me.party);
    const P = camp.player;
    const B = Game.Balance.campaign;
    const O = camp.outlook;
    const proj = N().project(camp, Object.fromEntries(Object.entries(O.regions).map(([k, v]) => [k, v.shares])));
    const days = Array.from({ length: camp.days }, (_, i) => `<span class="day-dot ${i + 1 < camp.day ? 'past' : i + 1 === camp.day ? 'now' : ''}${B.pollDays.includes(i + 1) ? ' poll' : ''}"></span>`).join('');
    const acts = Array.from({ length: B.actionsPerDay }, (_, i) => `<span class="act-pip ${i < camp.actionsLeft ? 'on' : ''}"></span>`).join('');
    const staminaPct = Math.round((P.stamina / B.staminaMax) * 100);
    const myProj = proj[me.party];

    // ブロックの地図
    const tiles = BLOCKS().map((b) => {
      const s = O.regions[b.id].shares;
      const ranked = camp.candidates.slice().sort((x, y) => s[y.id] - s[x.id]);
      const lead = ranked[0];
      const mine = s[me.id];
      const rank = ranked.findIndex((c) => c.isPlayer) + 1;
      return `
        <button class="block-tile ${b.id === st.ui.selectedRegion ? 'selected' : ''}" data-region="${b.id}" style="grid-column:${b.map.x + 1};grid-row:${b.map.y + 1};--lc:${UI.party(lead.party).color}">
          <span class="tile-name">${esc(b.name)}</span>
          <span class="tile-voters">${b.smd + b.pr}議席</span>
          <span class="tile-outlook">${Math.round(mine * 100)}%<small> ${rank}位</small></span>
        </button>`;
    }).join('');
    const partyRows = camp.candidates
      .slice()
      .sort((a, b) => proj[b.party].total - proj[a.party].total)
      .map((c) => `<li class="${c.isPlayer ? 'me' : ''}"><span>${chip(c.party)} ${esc(c.name)}</span><span class="small muted">${Math.round(O.overall.shares[c.id] * 100)}%</span><b>${proj[c.party].total}</b></li>`)
      .join('');
    const sel = BLOCKS().find((b) => b.id === st.ui.selectedRegion);
    const ss = O.regions[sel.id].shares;
    const selRows = camp.candidates
      .slice()
      .sort((a, b) => ss[b.id] - ss[a.id])
      .map((c) => `<li style="--pc:${UI.party(c.party).color}"><span class="dot"></span>${esc(c.name)}<span class="num">${Math.round(ss[c.id] * 100)}%</span><span class="small muted">候補${camp.national.coverage[c.party][sel.id]}人</span></li>`)
      .join('');
    const coops = camp.national.coops.map((c) => `${UI.party(c.partner).name}:${N().COOP_TYPES[c.type].name}`).join('、');
    const buttons = C.availableActions(camp)
      .map((a) => {
        const costs = [];
        if (a.stamina) costs.push(`体力${a.stamina}`);
        if (a.money) costs.push(`${a.money}万円`);
        if (a.gain && a.id === 'fund') costs.push(`+${a.gain}万円`);
        if (a.gain && a.id === 'rest') costs.push(`体力+${a.gain}`);
        const target = a.target === 'region' ? `→ ${sel.name}` : a.target === 'all' ? '→ 全ブロック' : a.target === 'org' ? '→ 団体を選ぶ' : a.target === 'post' ? '→ 投稿を選ぶ' : '';
        return `
          <button class="action-btn" data-action="${a.id}" ${a.enabled ? '' : 'disabled'} title="${esc(a.desc)}">
            <span class="action-icon">${a.icon}</span>
            <span class="action-body">
              <span class="action-name">${esc(a.name)} <span class="action-target">${target}</span></span>
              <span class="action-desc">${esc(a.desc)}</span>
              <span class="action-cost">${costs.join(' / ')}${!a.enabled && a.reason ? ` <em>${esc(a.reason)}</em>` : ''}</span>
            </span>
          </button>`;
      })
      .join('');
    const log = camp.log.slice(-14).reverse().map((l) => `<li class="log-${l.kind}"><span class="log-day">${l.day}日目</span>${esc(l.text)}</li>`).join('');
    const src = O.source === 'poll' ? `情勢調査(${O.day}日目夜)` : '陣営の感触(誤差大)';

    app.innerHTML = `
      <div class="campaign national">
        <header class="hud" style="--pc:${party.color}">
          <div class="hud-title">
            <span class="hud-district">衆議院総選挙 ・ 全国11ブロック</span>
            <span class="hud-name">${chip(me.party)} ${esc(party.name)}<small class="post-tag">党首 ${esc(st.player.name)}</small></span>
          </div>
          <div class="hud-day"><span class="hud-day-num">${camp.day}<small>日目 / ${camp.days}</small></span><span class="day-dots">${days}</span></div>
          <div class="hud-stats">
            <div class="stat"><span class="stat-label">行動</span><span class="act-pips">${acts}</span></div>
            <div class="stat"><span class="stat-label">選挙資金</span><span class="stat-val ${P.broke ? 'warn' : ''}">${Math.round(P.money)}<small>万円</small></span></div>
            <div class="stat"><span class="stat-label">体力</span><span class="meter"><span class="meter-fill ${staminaPct < B.staminaLowThreshold ? 'low' : ''}" style="width:${staminaPct}%"></span></span><span class="stat-num">${Math.round(P.stamina)}</span></div>
            <div class="stat"><span class="stat-label">議席の見込み</span><span class="stat-val ${myProj.total >= Game.Data.MAJORITY ? 'good-text' : ''}">${myProj.total}<small>/ 過半数${Game.Data.MAJORITY}</small></span></div>
          </div>
          <button class="btn btn-ghost hud-menu" data-act="menu" title="メニュー(セーブしてタイトルへ・政界を引退する)">≡</button>
        </header>
        <div class="campaign-main">
          <div class="col-left">
            <section class="panel">
              <div class="panel-head"><h3>全国の情勢</h3><span class="muted small">${src}</span></div>
              <div class="block-map">${tiles}</div>
              <p class="small muted">色はそのブロックで先行している党。数字はあなたの党の得票率の見込みと順位。</p>
            </section>
            <section class="panel">
              <div class="panel-head"><h3>議席の見込み</h3><span class="muted small">得票率 / 議席</span></div>
              <ul class="house-list proj-list">${partyRows}</ul>
              ${coops ? `<p class="small muted">候補者調整:${esc(coops)}</p>` : ''}
            </section>
            ${UI.snsPanel(camp.sns, { note: '党首のSNS。好感度は全ブロックの得票に少し効く(若い世代・都市部ほど)。組織票には効かない。' })}
          </div>
          <div class="col-right">
            <section class="panel">
              <div class="panel-head"><h3>${esc(sel.name)}ブロック</h3><span class="muted small">小選挙区${sel.smd}・比例${sel.pr}</span></div>
              <ul class="share-legend block-shares small">${selRows}</ul>
            </section>
            <section class="panel actions-panel">
              <div class="panel-head"><h3>今日の行動 <span class="muted small">残り${camp.actionsLeft}回</span></h3>${camp.today.mods.rain ? '<span class="today-notes small">☔ 雨:遊説の効果ダウン</span>' : ''}</div>
              <div class="action-grid">${buttons}</div>
              <div class="end-day">
                <button class="btn" data-act="undo" ${Game.canUndo() ? '' : 'disabled'}>↶ 取り消す</button>
                <button class="btn ${camp.actionsLeft === 0 ? 'btn-primary btn-lg pulse' : ''}" data-act="end-day">${camp.day === camp.days ? '選挙戦を終える' : `${camp.day}日目を終える`}</button>
              </div>
            </section>
          </div>
        </div>
        <section class="panel log-panel">
          ${st.ui.lastResult ? `<div class="last-result">${esc(st.ui.lastResult)}</div>` : ''}
          <ul class="log-list">${log}</ul>
        </section>
      </div>`;

    app.querySelectorAll('[data-region]').forEach((el) => (el.onclick = () => { st.ui.selectedRegion = el.dataset.region; Game.commit(); }));
    app.querySelectorAll('[data-action]').forEach((el) => {
      el.onclick = () => {
        const aid = el.dataset.action;
        const run = (target) => {
          Game.pushUndo();
          const res = C.doPlayerAction(camp, aid, target);
          if (!res.ok) Game.dropUndo();
          st.ui.lastResult = res.text;
          Game.commit();
        };
        if (C.ACTIONS[aid].target === 'org') UI.openOrgModal({ camp, pick: run });
        else if (C.ACTIONS[aid].target === 'post') UI.openPostModal({ sns: camp.sns, pledges: camp.support ? camp.support.pledges[camp.player.id] : [], pick: run });
        else run(st.ui.selectedRegion);
      };
    });
    app.querySelector('[data-act="undo"]').onclick = () => Game.undo();
    app.querySelector('[data-act="end-day"]').onclick = () => {
      if (camp.actionsLeft > 0 && !confirm(`行動があと${camp.actionsLeft}回残っています。1日を終えますか?`)) return;
      C.endDay(camp);
      Game.clearUndo();
      st.ui.lastResult = null;
      st.ui.showMorning = true;
      Game.commit();
    };
    app.querySelector('[data-act="menu"]').onclick = () => { Game.save(); Game.showScreen('title'); };
    if (st.ui.showMorning && camp.morning) UI.renderCampaignMorning(modalRoot, camp);
  };

  // ---------------- 開票特番(全国) ----------------
  let timer = null;
  const STEP_MS = 1800;
  function stopTimer() {
    if (timer) clearTimeout(timer);
    timer = null;
  }
  const prevStop = UI.stopCountTimer;
  UI.stopCountTimer = () => { if (prevStop) prevStop(); stopTimer(); };

  UI.renderNationalCount = function (app) {
    stopTimer();
    const st = Game.state;
    const el = st.election;
    const steps = el.timeline.steps;
    const i = Math.min(st.ui.countStep || 0, steps.length - 1);
    const step = steps[i];
    const last = i === steps.length - 1;
    const me = el.me;
    const total = Game.Data.HOUSE_SEATS;
    // 並びは選挙前の議席の多い順で固定(結果が並びで分からないように)
    const order = el.parties.slice().sort((a, b) => (el.prev[b] || 0) - (el.prev[a] || 0));
    // 対戦モードは2人の党に名前を出す
    const tag = {};
    if (st.versus) st.versus.players.forEach((P) => (tag[P.party] = P.name));
    else tag[me] = 'あなたの党';
    const rows = order
      .map((p) => {
        const c = step.counted[p];
        const t = c.smd + c.pr;
        const sure = t >= Game.Data.MAJORITY;
        return `
          <li class="tv-row ${tag[p] ? 'me' : ''} ${sure ? 'called' : ''}" style="--pc:${UI.party(p).color}">
            <span class="tv-party">${esc(UI.party(p).short)}</span>
            <span class="tv-name">${esc(UI.party(p).name)}${tag[p] ? `<span class="you">${esc(tag[p])}</span>` : ''}<small>選挙前 ${el.prev[p] || 0}</small></span>
            <span class="tv-bar seats"><span style="width:${(t / total) * 100 * 1.6}%"></span><i style="left:${(Game.Data.MAJORITY / total) * 100 * 1.6}%"></i></span>
            <span class="tv-votes">${t}<small> 区${c.smd} 比${c.pr}</small></span>
            ${sure ? '<span class="tv-stamp">過半数</span>' : ''}
          </li>`;
      })
      .join('');
    const meNow = step.counted[me].smd + step.counted[me].pr;
    let ticker;
    if (i === 0) ticker = `投票が締め切られた。出口調査の予測では、${UI.party(order[0]).name}が第1党の勢い。`;
    else if (step.leaderCalled && !steps[i - 1].leaderCalled) ticker = el.leaderWon ? `党首の${st.player.name}が${Game.Data.DISTRICT_NAME}で当選確実。` : `党首の${st.player.name}が${Game.Data.DISTRICT_NAME}で苦戦している。`;
    else if (step.prOpened.length && (!steps[i - 1] || !steps[i - 1].prOpened.length)) ticker = '比例代表の開票が始まった。';
    else if (last && st.versus) ticker = `すべての議席が確定した。${st.versus.players.map((P) => `${UI.party(P.party).name} ${step.counted[P.party].smd + step.counted[P.party].pr}`).join('、')}。`;
    else if (last) ticker = `すべての議席が確定した。${UI.party(me).name}は${meNow}議席。`;
    else ticker = `小選挙区 ${step.smdCounted}/${step.smdTotal} 確定。${UI.party(me).name}は${meNow}議席を獲得。`;
    app.innerHTML = `
      <div class="tv">
        <header class="tv-head">
          <div class="tv-title"><span class="tv-live">LIVE</span> 衆院選 開票速報 <b>全国</b></div>
          <div class="tv-clock">${esc(step.time)}</div>
        </header>
        <div class="tv-body">
          <div class="tv-progress"><span>小選挙区</span><span class="tv-progress-bar"><span style="width:${(step.smdCounted / step.smdTotal) * 100}%"></span></span><b>${step.smdCounted}/${step.smdTotal}</b></div>
          <div class="tv-progress"><span>比例</span><span class="tv-progress-bar"><span style="width:${(step.prOpened.length / 11) * 100}%"></span></span><b>${step.prOpened.length}/11</b></div>
          <ul class="tv-rows">${rows}</ul>
          <div class="tv-ticker">${esc(ticker)}</div>
          <div class="tv-meta small">投票日の天気:${esc(el.weather.label)} ・ 過半数 ${Game.Data.MAJORITY}</div>
        </div>
        <div class="tv-controls">
          ${last ? '<button class="btn btn-primary btn-lg" data-act="result">選挙結果へ</button>' : '<button class="btn" data-act="skip">最後までとばす</button><button class="btn btn-primary" data-act="next">次へ</button>'}
        </div>
      </div>`;
    const next = () => { st.ui.countStep = i + 1; Game.commit(); };
    const nb = app.querySelector('[data-act="next"]');
    if (nb) nb.onclick = next;
    const sb = app.querySelector('[data-act="skip"]');
    if (sb) sb.onclick = () => { st.ui.countStep = steps.length - 1; Game.commit(); };
    const rb = app.querySelector('[data-act="result"]');
    if (rb) rb.onclick = () => Game.finishElection();
    if (!last) timer = setTimeout(next, STEP_MS);
  };

  // ---------------- 結果(全国) ----------------
  UI.renderNationalResult = function (app) {
    const st = Game.state;
    const el = st.election;
    const me = el.me;
    const order = el.parties.slice().sort((a, b) => el.seats[b].total - el.seats[a].total);
    const mine = el.seats[me].total;
    const prev = el.prev[me] || 0;
    const majority = mine >= Game.Data.MAJORITY;
    const rows = order
      .map((p) => {
        const s = el.seats[p];
        const d = s.total - (el.prev[p] || 0);
        return `<tr class="${p === me ? 'me' : ''}"><th>${chip(p)} ${esc(UI.party(p).name)}</th><td class="num">${s.smd}</td><td class="num">${s.pr}</td><td class="num"><b>${s.total}</b></td><td class="num ${d > 0 ? 'good-text' : d < 0 ? 'warn-text' : ''}">${d > 0 ? '+' : ''}${d}</td><td class="num">${(el.prShareNational[p] * 100).toFixed(1)}%</td></tr>`;
      })
      .join('');
    const blockRows = BLOCKS()
      .map((b) => {
        const r = el.blocks[b.id];
        return `<tr><th>${esc(b.name)}</th><td class="num">${r.smdSeats[me] || 0}/${b.smd}</td><td class="num">${r.prSeats[me] || 0}/${b.pr}</td><td class="num">${(r.share[me] * 100).toFixed(1)}%</td></tr>`;
      })
      .join('');
    const coops = st.campaign.national.coops;
    const title = majority ? '過半数を獲得' : mine > prev ? '議席を伸ばした' : mine < prev ? '議席を減らした' : '現状維持';
    const bar = order.filter((p) => el.seats[p].total > 0).map((p) => `<div class="seat-seg" style="flex:${el.seats[p].total};background:${UI.party(p).color}" title="${esc(UI.party(p).name)} ${el.seats[p].total}">${el.seats[p].total >= 18 ? el.seats[p].total : ''}</div>`).join('')
      + UI.seatFiller(order.reduce((s, p) => s + el.seats[p].total, 0), Game.Data.HOUSE_SEATS);
    app.innerHTML = `
      <div class="end-screen">
        <div class="result-hero ${majority ? 'result-win' : mine >= prev ? 'result-pr' : 'result-lost'}" style="--pc:${UI.party(me).color}">
          <p class="modal-kicker">${st.world.year}年 衆議院総選挙 ・ ${esc(UI.party(me).name)}</p>
          <h2 class="result-title">${esc(title)}</h2>
          <p>${esc(UI.party(me).name)}は${mine}議席(選挙前 ${prev})。${majority ? '単独で過半数を確保した。' : `過半数(${Game.Data.MAJORITY})まであと${Game.Data.MAJORITY - mine}議席。${order.some((p) => el.seats[p].total >= Game.Data.MAJORITY) ? '' : 'どの党も過半数に届かず、連立交渉になる。'}`}</p>
          <p>党首の${esc(st.player.name)}は${esc(Game.Data.DISTRICT_NAME)}で${el.leaderWon ? '当選' : '落選'}。</p>
        </div>
        <div class="house-bar"><div class="seat-bar">${bar}</div><i class="majority-line" style="left:${(Game.Data.MAJORITY / Game.Data.HOUSE_SEATS) * 100}%"></i></div>
        <div class="list-wrap">
          <table class="result-table">
            <thead><tr><th>政党</th><th class="num">小選挙区</th><th class="num">比例</th><th class="num">計</th><th class="num">増減</th><th class="num">比例得票率</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        ${coops.length ? `<p class="small muted">候補者調整:${esc(coops.map((c) => `${UI.party(c.partner).name}(${N().COOP_TYPES[c.type].name})`).join('、'))}</p>` : ''}
        <h3 class="list-title">ブロック別(${esc(UI.party(me).name)})</h3>
        <div class="list-wrap">
          <table class="result-table compact">
            <thead><tr><th>ブロック</th><th class="num">小選挙区</th><th class="num">比例</th><th class="num">得票率</th></tr></thead>
            <tbody>${blockRows}</tbody>
          </table>
        </div>
        <div class="setup-actions">
          <button class="btn btn-primary btn-lg" data-act="back">党本部へ</button>
        </div>
      </div>`;
    app.querySelector('[data-act="back"]').onclick = () => Game.backToLeader();
  };
})(Game.UI);
