// 選挙戦(選挙区モード)の画面
window.Game = window.Game || {};
Game.UI = Game.UI || {};

(function (UI) {
  const esc = (s) => UI.esc(s);

  UI.renderCampaign = function (app, modalRoot) {
    const st = Game.state;
    const camp = st.campaign;
    if (camp.mode === 'national') return UI.renderNationalCampaign(app, modalRoot);   // 全国モード(national-view.js)
    const C = Game.Campaign;
    if (!C.regionById(camp, st.ui.selectedRegion)) st.ui.selectedRegion = camp.regionList[0].id;
    const me = camp.candidates.find((c) => c.isPlayer);

    app.innerHTML = `
      <div class="campaign">
        ${hud(camp, me)}
        <div class="campaign-main">
          <div class="col-left">
            ${mapPanel(camp, st.ui.selectedRegion)}
            ${candidatesPanel(camp)}
            ${UI.snsPanel(camp.sns)}
            ${camp.support ? UI.supportPanel(camp) : ''}
          </div>
          <div class="col-right">
            ${regionPanel(camp, st.ui.selectedRegion)}
            ${actionsPanel(camp, st.ui.selectedRegion)}
          </div>
        </div>
        ${logPanel(camp, st.ui.lastResult)}
      </div>`;

    // 地区の選択
    app.querySelectorAll('[data-region]').forEach((el) => {
      el.onclick = () => {
        st.ui.selectedRegion = el.dataset.region;
        Game.commit();
      };
    });
    // 行動(支援団体回りは行き先の団体を選ぶ)
    app.querySelectorAll('[data-action]').forEach((el) => {
      el.onclick = () => {
        const aid = el.dataset.action;
        const run = (target) => {
          Game.pushUndo();   // その日のうちなら取り消せる
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
    // 支援団体の紹介
    app.querySelectorAll('[data-org], [data-act="org-info"]').forEach((el) => {
      el.onclick = () => UI.openOrgModal({ camp });
    });
    const endBtn = app.querySelector('[data-act="end-day"]');
    if (endBtn) {
      endBtn.onclick = () => {
        if (camp.actionsLeft > 0 && !confirm(`行動があと${camp.actionsLeft}回残っています。1日を終えますか?`)) return;
        C.endDay(camp);
        Game.clearUndo();   // 日が変わったら取り消せない
        st.ui.lastResult = null;
        st.ui.showMorning = true;
        Game.commit();
      };
    }
    const undoBtn = app.querySelector('[data-act="undo"]');
    if (undoBtn) undoBtn.onclick = () => Game.undo();
    const menuBtn = app.querySelector('[data-act="menu"]');
    if (menuBtn) {
      menuBtn.onclick = () => {
        Game.save();
        Game.showScreen('title');
      };
    }

    if (st.ui.showMorning && camp.morning) renderMorning(modalRoot, camp);
  };

  // ---------------- 上部の状況表示 ----------------
  function hud(camp, me) {
    const P = camp.player;
    const B = Game.Balance.campaign;
    const days = Array.from({ length: camp.days }, (_, i) => {
      const d = i + 1;
      const cls = d < camp.day ? 'past' : d === camp.day ? 'now' : '';
      const poll = B.pollDays.includes(d) ? ' poll' : '';
      return `<span class="day-dot ${cls}${poll}" title="${d}日目${poll ? '(夜に情勢調査)' : ''}"></span>`;
    }).join('');
    const acts = Array.from({ length: B.actionsPerDay }, (_, i) => `<span class="act-pip ${i < camp.actionsLeft ? 'on' : ''}"></span>`).join('');
    const mom = camp.momentum[P.id];
    const momLabel = mom >= 1.08 ? '勢いあり ↑' : mom >= 1.02 ? 'やや上向き ↗' : mom <= 0.92 ? '失速 ↓' : mom <= 0.98 ? 'やや下向き ↘' : 'ふつう →';
    const staminaPct = Math.round((P.stamina / B.staminaMax) * 100);
    const party = UI.party(me.party);
    const support = Game.Campaign.partySupport(camp, me.party);
    return `
      <header class="hud" style="--pc:${party.color}">
        <div class="hud-title">
          <span class="hud-district">${esc(camp.sub ? camp.sub.title : Game.Data.DISTRICT_NAME)}</span>
          <span class="hud-name">${UI.partyChip(me.party)} ${esc(me.name)}</span>
        </div>
        <div class="hud-day">
          <span class="hud-day-num">${camp.day}<small>日目 / ${camp.days}</small></span>
          <span class="day-dots">${days}</span>
        </div>
        <div class="hud-stats">
          <div class="stat"><span class="stat-label">行動</span><span class="act-pips">${acts}</span></div>
          <div class="stat"><span class="stat-label">資金</span><span class="stat-val ${P.broke ? 'warn' : ''}">${Math.round(P.money)}<small>万円</small></span></div>
          <div class="stat"><span class="stat-label">体力</span><span class="meter"><span class="meter-fill ${staminaPct < B.staminaLowThreshold ? 'low' : ''}" style="width:${staminaPct}%"></span></span><span class="stat-num">${Math.round(P.stamina)}</span></div>
          <div class="stat"><span class="stat-label">勢い</span><span class="stat-val small">${momLabel}</span></div>
          <div class="stat"><span class="stat-label">${esc(party.short)}支持率</span><span class="stat-val">${support.toFixed(1)}<small>%</small></span></div>
        </div>
        <button class="btn btn-ghost hud-menu" data-act="menu" title="メニュー(セーブしてタイトルへ・政界を引退する)">≡</button>
      </header>`;
  }

  // ---------------- 地図 ----------------
  function mapPanel(camp, selected) {
    const O = camp.outlook;
    const pid = camp.player.id;
    const fest = camp.today.mods.festival;
    // 地区は選挙戦が持っているもの(補選・首長選はほかの選挙区のこともある)。古いセーブは今の選挙区
    const districts = camp.regionList[0] && camp.regionList[0].map ? camp.regionList : Game.Data.DISTRICTS;
    const tiles = districts.map((d) => {
      const o = O.regions[d.id];
      const recog = Math.round(camp.regions[d.id].recog[pid]);
      return `
        <button class="map-tile outlook-${o.key} ${d.id === selected ? 'selected' : ''}" data-region="${d.id}"
          style="grid-column:${d.map.x + 1} / span ${d.map.w};grid-row:${d.map.y + 1} / span ${d.map.h}">
          <span class="tile-name">${esc(d.name)}${fest === d.id ? ' 🏮' : ''}</span>
          <span class="tile-voters">有権者 ${(d.voters / 10000).toFixed(1)}万人</span>
          <span class="tile-outlook"><b>${UI.OUTLOOK_MARK[o.key]}</b> ${o.label}</span>
          <span class="tile-recog">知名度 ${recog}</span>
        </button>`;
    }).join('');
    const src = O.source === 'poll' ? `情勢調査(${O.day}日目夜)` : '陣営の感触(誤差大)';
    return `
      <section class="panel map-panel">
        <div class="panel-head">
          <h3>選挙区の情勢</h3>
          <span class="muted small">${src}</span>
        </div>
        <div class="district-map">
          ${tiles}
          <div class="map-sea" style="grid-column:3;grid-row:1">${esc(camp.sub && camp.sub.sea ? camp.sub.sea : Game.Data.SEA_NAME)}</div>
        </div>
        <div class="map-legend small muted">◎優勢 ○やや優勢 ▲接戦 △やや劣勢 ×劣勢</div>
      </section>`;
  }

  // ---------------- 候補者 ----------------
  function candidatesPanel(camp) {
    const O = camp.outlook.overall;
    const rows = camp.candidates
      .slice()
      .sort((a, b) => O.shares[b.id] - O.shares[a.id])
      .map((c) => {
        const p = UI.party(c.party);
        const sup = Game.Campaign.localSupport(camp, c.party);   // 選挙区での党の地力を含む
        return `
          <li class="cand-row ${c.isPlayer ? 'me' : ''}" style="--pc:${p.color}">
            <span class="cand-name">${UI.partyChip(c.party)} ${esc(c.name)}${c.isPlayer ? `<span class="you">${camp.sub && camp.sub.proxy ? '応援する候補' : 'あなた'}</span>` : ''}</span>
            <span class="cand-meta muted small">${UI.ROLE_LABEL[c.role] || ''}・${esc(p.name)}(支持率 ${sup.toFixed(1)}%)</span>
            <span class="cand-share">約${Math.round(O.shares[c.id] * 100)}%</span>
          </li>`;
      })
      .join('');
    return `
      <section class="panel">
        <div class="panel-head">
          <h3>候補者</h3>
          <span class="overall outlook-${O.key}">全体:<b>${UI.OUTLOOK_MARK[O.key]} ${O.label}</b></span>
        </div>
        ${UI.shareBar(O.shares, camp.candidates)}
        <ul class="cand-list">${rows}</ul>
      </section>`;
  }

  // ---------------- 選択中の地区 ----------------
  function regionPanel(camp, rid) {
    const d = (camp.regionList[0] && camp.regionList[0].map ? camp.regionList : Game.Data.DISTRICTS).find((x) => x.id === rid);
    const o = camp.outlook.regions[rid];
    const pid = camp.player.id;
    const reg = camp.regions[rid];
    const traits = Object.keys(UI.TRAIT_LABEL)
      .map((k) => `<span class="trait"><span class="trait-label">${UI.TRAIT_LABEL[k]}</span><span class="trait-bar"><span style="width:${Math.round(d.traits[k] * 100)}%"></span></span></span>`)
      .join('');
    const shares = UI.byShare(camp.candidates, o.shares)
      .map((c) => `<li style="--pc:${UI.party(c.party).color}"><span class="dot"></span>${esc(c.name)}<span class="num">約${Math.round(o.shares[c.id] * 100)}%</span></li>`)
      .join('');
    const turnout = Math.round(Game.Campaign.turnout(d) * 100);
    return `
      <section class="panel region-panel">
        <div class="panel-head">
          <h3>${esc(d.name)}</h3>
          <span class="outlook-badge outlook-${o.key}">${UI.OUTLOOK_MARK[o.key]} ${o.label}</span>
        </div>
        <p class="region-desc">${esc(d.description)}</p>
        <div class="region-facts small">
          <span>有権者 <b>${UI.formatVotes(d.voters)}</b>人</span>
          <span>投票率の見込み <b>${turnout}%</b></span>
          <span>${camp.sub && camp.sub.proxy ? "候補" : "あなた"}の知名度 <b>${Math.round(reg.recog[pid])}</b></span>
        </div>
        <div class="traits">${traits}</div>
        ${UI.shareBar(o.shares, camp.candidates)}
        <ul class="share-legend small">${shares}</ul>
      </section>`;
  }

  // ---------------- 行動 ----------------
  function actionsPanel(camp, rid) {
    const regName = Game.Campaign.regionById(camp, rid).name;
    const acts = Game.Campaign.availableActions(camp);
    const buttons = acts
      .map((a) => {
        const costs = [];
        if (a.stamina) costs.push(`体力${a.stamina}`);
        if (a.money) costs.push(`${a.money}万円`);
        if (a.gain && a.id === 'fund') costs.push(`+${a.gain}万円`);
        if (a.gain && a.id === 'rest') costs.push(`体力+${a.gain}`);
        if (a.id === 'leader') costs.push(`残り${a.left}回`);
        const target = a.target === 'region' ? `→ ${regName}` : a.target === 'all' ? '→ 全地区' : a.target === 'org' ? '→ 団体を選ぶ' : a.target === 'post' ? '→ 投稿を選ぶ' : '';
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
    const done = camp.actionsLeft === 0;
    const mods = camp.today.mods;
    const todayNotes = [];
    if (camp.day === 1) todayNotes.push('出陣式:効果アップ');
    if (camp.day === camp.days) todayNotes.push('最終日:効果アップ');
    if (mods.rain) todayNotes.push('☔ 雨:街頭演説・集会の効果ダウン');
    if (mods.festival) todayNotes.push(`🏮 ${Game.Campaign.regionById(camp, mods.festival).name}で祭り`);
    if (mods.heat) todayNotes.push('☀ 暑さ:体力消費アップ');
    return `
      <section class="panel actions-panel">
        <div class="panel-head">
          <h3>今日の行動 <span class="muted small">残り${camp.actionsLeft}回</span></h3>
          ${todayNotes.length ? `<span class="today-notes small">${todayNotes.join(' ・ ')}</span>` : ''}
        </div>
        <div class="action-grid">${buttons}</div>
        <div class="end-day">
          <button class="btn" data-act="undo" ${Game.canUndo() ? '' : 'disabled'} title="今日の行動を1つ取り消す">↶ 取り消す</button>
          <button class="btn ${done ? 'btn-primary btn-lg pulse' : ''}" data-act="end-day">
            ${camp.day === camp.days ? '選挙戦を終える' : `${camp.day}日目を終える`}
          </button>
        </div>
      </section>`;
  }

  // ---------------- ログ ----------------
  function logPanel(camp, lastResult) {
    const items = camp.log
      .slice(-14)
      .reverse()
      .map((l) => `<li class="log-${l.kind}"><span class="log-day">${l.day}日目</span>${esc(l.text)}</li>`)
      .join('');
    return `
      <section class="panel log-panel">
        ${lastResult ? `<div class="last-result">${esc(lastResult)}</div>` : ''}
        <ul class="log-list">${items}</ul>
      </section>`;
  }

  // ---------------- 朝のニュース(モーダル) ----------------
  UI.renderCampaignMorning = (root, camp) => renderMorning(root, camp);
  function renderMorning(root, camp) {
    const st = Game.state;
    const m = camp.morning;
    const ev = m.event;
    const eventResult = st.ui.eventResult;
    let eventHtml = '';
    if (ev) {
      let choices = '';
      if (ev.choices && camp.pending) {
        choices = `<div class="choices">${ev.choices
          .map((c) => `<button class="btn choice-btn" data-choice="${c.id}" ${c.disabled ? 'disabled' : ''}><b>${esc(c.label)}</b><span class="small muted">${esc(c.note)}</span></button>`)
          .join('')}</div>`;
      } else if (ev.choices && eventResult) {
        choices = `<p class="event-result">${esc(eventResult)}</p>`;
      }
      eventHtml = `
        <div class="event-card">
          <span class="event-kicker">${ev.kicker ? esc(ev.kicker) : ev.org ? '支援団体' : ev.choices ? 'イベント' : 'ニュース'}</span>
          <h4>${esc(ev.title)}</h4>
          <p>${esc(ev.text)}</p>
          ${choices}
        </div>`;
    }
    const lines = (m.lines || []).map((l) => `<p>${esc(l)}</p>`).join('');
    const rivals = (m.rivals || []).length
      ? `<details class="rival-moves"><summary>昨日のライバル陣営の動き</summary><ul>${m.rivals.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></details>`
      : '';
    let poll = '';
    if (m.poll || m.final) {
      const O = camp.outlook.overall;
      const rows = camp.candidates
        .slice()
        .sort((a, b) => O.shares[b.id] - O.shares[a.id])
        .map((c) => `<li style="--pc:${UI.party(c.party).color}"><span class="dot"></span>${esc(c.name)}<span class="num">約${Math.round(O.shares[c.id] * 100)}%</span></li>`)
        .join('');
      poll = `
        <div class="poll-card">
          <span class="event-kicker">${m.final ? '最終情勢' : '情勢調査'}</span>
          <p>あなたの情勢:<b class="outlook-text outlook-${O.key}">${UI.OUTLOOK_MARK[O.key]} ${O.label}</b></p>
          ${UI.shareBar(O.shares, camp.candidates)}
          <ul class="share-legend small">${rows}</ul>
        </div>`;
    }
    const blocked = !!camp.pending;
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal">
          <p class="modal-kicker">${m.final ? '投票日前夜' : `${m.day}日目`}</p>
          <h2>${esc(m.title)}</h2>
          ${lines}
          ${eventHtml}
          ${poll}
          ${rivals}
          <div class="modal-actions">
            <button class="btn btn-primary btn-lg" data-act="close-morning" ${blocked ? 'disabled' : ''}>
              ${m.final ? '投票日へ' : '選挙戦へ'}
            </button>
          </div>
        </div>
      </div>`;
    root.querySelectorAll('[data-choice]').forEach((b) => {
      b.onclick = () => {
        st.ui.eventResult = Game.Campaign.resolveEvent(camp, b.dataset.choice);
        Game.commit();
      };
    });
    root.querySelector('[data-act="close-morning"]').onclick = () => {
      st.ui.showMorning = false;
      st.ui.eventResult = null;
      if (m.final) return Game.startElection();
      Game.commit();
    };
  }

})(Game.UI);
