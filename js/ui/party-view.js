// 党首モードの画面(国会の勢力図、党内の結束、合流・合併の交渉)
window.Game = window.Game || {};
Game.UI = Game.UI || {};

(function (UI) {
  const esc = (s) => UI.esc(s);
  const LD = () => Game.Leader;
  const polName = (id) => Game.Data.POLICIES[id].name;

  function chip(id) {
    const p = LD().partyInfo(id);
    return `<span class="party-chip" style="--pc:${p.color}">${esc(p.short)}</span>`;
  }

  UI.renderLeaderMode = function (app, modalRoot) {
    const st = Game.state;
    const fresh = !(st.leader && st.leader.mode === 'leader');
    LD().init(st);
    if (fresh) {
      st.ui.showLeaderReport = true;   // はじめて党首モードに入ったときの知らせ
      Game.clearUndo();
      Game.save();
    }
    const ld = st.leader;
    const c = st.career;
    const w = st.world;
    const party = LD().partyInfo(ld.party);
    const seats = LD().seatsOf(st, ld.party);
    const support = LD().supportOf(st, ld.party);
    const acts = Array.from({ length: Game.Balance.partyLeader.actionsPerTurn }, (_, i) => `<span class="act-pip ${i < ld.actionsLeft ? 'on' : ''}"></span>`).join('');
    const roleLabel = ld.isPM && ld.role === '代表' ? '内閣総理大臣・党首' : ld.role === '代表' ? '党首' : ld.role;

    app.innerHTML = `
      <div class="campaign leader-mode">
        <header class="hud" style="--pc:${party.color}">
          <div class="hud-title">
            <span class="hud-district">${esc(party.name)}</span>
            <span class="hud-name">${chip(ld.party)} ${esc(st.player.name)}<small class="post-tag">${esc(roleLabel)}</small></span>
          </div>
          <div class="hud-day"><span class="hud-day-num">${w.year}<small>年 ${esc(Game.Data.SESSIONS[w.turnIndex])}</small></span></div>
          <div class="hud-stats">
            <div class="stat"><span class="stat-label">行動</span><span class="act-pips">${acts}</span></div>
            <div class="stat"><span class="stat-label">党の資金</span><span class="stat-val">${Math.round(c.money)}<small>万円</small></span></div>
            <div class="stat"><span class="stat-label">衆院の議席</span><span class="stat-val">${seats}</span></div>
            <div class="stat"><span class="stat-label">支持率</span><span class="stat-val">${support.toFixed(1)}<small>%</small></span></div>
            <div class="stat"><span class="stat-label">党内の結束</span><span class="stat-val ${ld.cohesion < Game.Balance.partyLeader.split.threshold ? 'warn' : ''}">${Math.round(ld.cohesion)}</span></div>
          </div>
          <button class="btn btn-ghost hud-menu" data-act="menu" title="メニュー(セーブしてタイトルへ・政界を引退する)">≡</button>
        </header>
        <div class="campaign-main">
          <div class="col-left">
            ${UI.govPanel(st)}
            ${UI.econPanel(st)}
            ${housePanel(st)}
            ${cohesionPanel(st)}
            ${UI.debateDeckPanel(st, st.gov && st.gov.role === 'pm' ? 'answer' : 'ask')}
            ${UI.snsPanel(Game.Sns.ensure(st), { unit: 'ターン', note: '党首のSNS。好感度は党の支持率に、首相なら内閣支持率にも少し効く。記者会見の発言は切り抜かれることがある。' })}
          </div>
          <div class="col-right">
            ${actionsPanel(st)}
            ${promisePanel(st)}
          </div>
        </div>
        ${logPanel(st)}
      </div>`;

    app.querySelectorAll('[data-action]').forEach((el) => {
      el.onclick = () => {
        const id = el.dataset.action;
        const run = (target) => {
          Game.pushUndo();
          const res = LD().doAction(st, id, target);
          if (!res.ok) Game.dropUndo();
          if (res.debate) Game.clearUndo();   // 論戦は取り消せない
          if (res.dissolution) { Game.clearUndo(); st.ui.showLeaderReport = true; }
          if (res.ending) return Game.goEnding(res.ending);
          st.ui.lastResult = res.text;
          Game.commit();
        };
        const gov = Game.Gov.ACTIONS[id];
        const target = (gov || LD().ACTIONS[id]).target;
        if (gov && target !== 'none') UI.openGovTarget(st, id, run);   // 法案・連立相手・共闘相手(gov-view.js)
        else if (gov && id === 'dissolve' && !confirm('衆議院を解散して総選挙に打って出ますか?')) return;
        else if (id === 'successor' && !confirm('後継を指名して党首を退き、ゲームを終えますか?')) return;
        else if (gov) run(null);
        else if (target === 'merge') openMergeModal(st);
        else if (target === 'org') UI.openOrgModal({ camp: orgView(st), pick: run });
        else if (target === 'policy') openPolicyPick(st, run);
        else if (target === 'post') UI.openPostModal({ sns: Game.Sns.ensure(st), pledges: st.support ? st.support.pledges : [], pick: run, title: LD().ACTIONS[id].name });
        else run(null);
      };
    });
    app.querySelector('[data-act="undo"]').onclick = () => Game.undo();
    app.querySelector('[data-act="end-turn"]').onclick = () => {
      if (ld.actionsLeft > 0 && !confirm(`行動があと${ld.actionsLeft}回残っています。ターンを終えますか?`)) return;
      LD().endTurn(st);
      Game.clearUndo();
      st.ui.lastResult = null;
      st.ui.showLeaderReport = true;
      Game.commit();
    };
    app.querySelector('[data-act="menu"]').onclick = () => {
      Game.save();
      Game.showScreen('title');
    };
    const orgInfo = app.querySelector('[data-act="org-info"]');
    if (orgInfo) orgInfo.onclick = () => UI.openOrgModal({ camp: orgView(st) });

    if (st.gov && st.gov.invite) UI.renderGovInvite(modalRoot, st);   // 連立入りの打診
    else if ((st.ui.showLeaderReport || ld.pending) && ld.report) renderReport(modalRoot, st);
  };

  // 支援団体モーダルに渡す形
  function orgView(st) {
    const sup = st.support;
    return {
      player: { id: 'player' },
      candidates: [{ id: 'player', name: st.player.name, isPlayer: true }],
      support: { relations: { player: sup.relations }, pledges: { player: sup.pledges }, endorsements: {}, ownCandidate: {}, banned: [], promises: sup.promises },
    };
  }

  // ---------------- 国会の勢力図 ----------------
  function housePanel(st) {
    const w = st.world;
    const ids = Object.keys(w.parties).filter((id) => w.parties[id].seats > 0).sort((a, b) => (a === st.leader.party ? -1 : b === st.leader.party ? 1 : w.parties[b].seats - w.parties[a].seats));
    const total = Game.Data.HOUSE_SEATS;
    const bar = ids.map((id) => `<div class="seat-seg" style="flex:${w.parties[id].seats};background:${LD().partyInfo(id).color}" title="${esc(LD().partyInfo(id).name)} ${w.parties[id].seats}">${w.parties[id].seats >= 18 ? w.parties[id].seats : ''}</div>`).join('') + UI.seatFiller(ids.reduce((s, id) => s + w.parties[id].seats, 0), total);
    const rows = ids
      .map((id) => `<li class="${id === st.leader.party ? 'me' : ''}"><span>${chip(id)} ${esc(LD().partyInfo(id).name)}</span><b>${w.parties[id].seats}</b></li>`)
      .join('');
    const mine = LD().seatsOf(st, st.leader.party);
    return `
      <section class="panel">
        <div class="panel-head"><h3>衆議院の勢力図</h3><span class="muted small">${total}議席・過半数${Game.Data.MAJORITY}</span></div>
        <div class="house-bar"><div class="seat-bar">${bar}</div><i class="majority-line" style="left:${(Game.Data.MAJORITY / total) * 100}%" title="過半数"></i></div>
        <ul class="house-list">${rows}</ul>
        <p class="small muted">${mine >= Game.Data.MAJORITY ? '単独で過半数を持っている。' : `過半数まであと${Game.Data.MAJORITY - mine}議席。`}</p>
      </section>`;
  }

  // ---------------- 党内の結束 ----------------
  function cohesionPanel(st) {
    const ld = st.leader;
    const S = Game.Balance.partyLeader.split;
    const v = Math.round(ld.cohesion);
    const lvl = v >= 60 ? 'good' : v >= S.threshold ? 'mid' : 'bad';
    const merges = ld.merges
      .map((m) => `<li>${m.year}年:旧${esc(m.partnerName)}(${m.seats}議席)と合流 ${m.left ? '<span class="tag">分裂して離脱</span>' : ''}</li>`)
      .join('');
    return `
      <section class="panel">
        <div class="panel-head"><h3>党内の結束</h3><span class="muted small">${S.threshold}未満が${S.turns}ターン続くと分裂のおそれ</span></div>
        <div class="cohesion-meter cohesion-${lvl}"><span style="width:${v}%"></span><i style="left:${S.threshold}%"></i></div>
        <p class="small">${v} / 100${ld.friction > 0.5 ? ` ・ 合流のしこりで毎ターン約${ld.friction.toFixed(1)}ずつ下がる` : ''}${ld.lowTurns > 0 ? ' ・ <b class="warn-text">分裂の危険</b>' : ''}</p>
        <p class="small muted">結束が低いと党の支持率も下がる。党内の融和や人事で立て直せる。</p>
        ${merges ? `<ul class="promise-list">${merges}</ul>` : ''}
      </section>`;
  }

  // ---------------- 行動 ----------------
  function actionsPanel(st) {
    const ld = st.leader;
    const buttons = LD().availableActions(st)
      .map((a) => {
        const costs = [];
        if (a.money) costs.push(`${a.money}万円`);
        if (a.id === 'fund') costs.push(`+${a.gain}万円`);
        const target = a.target === 'org' ? '→ 団体を選ぶ' : a.target === 'post' ? '→ 投稿を選ぶ' : a.target === 'policy' ? (a.gov ? '→ 法案を選ぶ' : '→ 政策を選ぶ') : a.target === 'merge' || a.target === 'partner' || a.target === 'party' ? '→ 相手を選ぶ' : '';
        if (a.id === 'bill') costs.push(`成立の見込み ${Math.round(a.passChance * 100)}%前後`);
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
    return `
      <section class="panel actions-panel">
        <div class="panel-head">
          <h3>このターンの行動 <span class="muted small">残り${ld.actionsLeft}回</span></h3>
          <span class="today-notes small">${st.gov && st.gov.role === 'pm' ? '首相として' : st.gov && st.gov.role === 'partner' ? '連立与党として' : '野党として'}</span>
        </div>
        <div class="action-grid">${buttons}</div>
        <div class="end-day">
          <button class="btn" data-act="undo" ${Game.canUndo() ? '' : 'disabled'} title="このターンの行動を1つ取り消す(合流の提案は取り消せない)">↶ 取り消す</button>
          <button class="btn ${ld.actionsLeft === 0 ? 'btn-primary btn-lg pulse' : ''}" data-act="end-turn">ターンを終える</button>
        </div>
      </section>`;
  }

  function promisePanel(st) {
    if (!st.support) return '';
    const ORGS = Game.Data.ORGANIZATIONS;
    const goal = Game.Balance.term.promiseGoal;
    const open = st.support.promises.filter((p) => p.status === 'open');
    const rows = open
      .map((p) => `<li><span>${esc(ORGS[p.org].name)}:「${esc(polName(p.policy))}」${p.inherited ? '<span class="tag">合流で引き継ぎ</span>' : ''}</span><span class="promise-progress">${'●'.repeat(Math.min(goal, p.progress || 0))}${'○'.repeat(Math.max(0, goal - (p.progress || 0)))}</span></li>`)
      .join('');
    const pledges = st.support.pledges.map((p) => `<span class="policy-chip match">${esc(polName(p))}</span>`).join('');
    return `
      <section class="panel">
        <div class="panel-head"><h3>党の政策と約束</h3><button class="btn btn-ghost small" data-act="org-info">支援団体 ›</button></div>
        <div class="policy-row"><span class="small muted">政策</span>${pledges}</div>
        ${open.length ? `<ul class="promise-list open">${rows}</ul><p class="small muted">約束は「政策協議」で進める。</p>` : '<p class="small muted">いま果たすべき約束はない。</p>'}
      </section>`;
  }

  function logPanel(st) {
    const items = st.leader.log.slice(-14).reverse().map((l) => `<li class="log-${l.kind}"><span class="log-day">${esc(l.when)}</span>${esc(l.text)}</li>`).join('');
    return `
      <section class="panel log-panel">
        ${st.ui.lastResult ? `<div class="last-result">${esc(st.ui.lastResult)}</div>` : ''}
        <ul class="log-list">${items}</ul>
      </section>`;
  }

  function openPolicyPick(st, run) {
    const root = document.getElementById('modal-root');
    const ORGS = Game.Data.ORGANIZATIONS;
    const open = st.support.promises.filter((p) => p.status === 'open');
    const rows = LD().policyTargets(st)
      .map((id) => {
        const tied = open.filter((p) => p.policy === id).map((p) => ORGS[p.org].name);
        return `<button class="btn choice-btn" data-policy="${id}"><b>${esc(polName(id))}</b><span class="small muted">${tied.length ? `約束:${esc(tied.join('・'))}` : '党の政策'}</span></button>`;
      })
      .join('');
    root.innerHTML = `
      <div class="modal-backdrop"><div class="modal">
        <p class="modal-kicker">政策協議</p><h2>どの政策を進める?</h2>
        <div class="choices">${rows}</div>
        <div class="modal-actions"><button class="btn" data-act="close">やめる</button></div>
      </div></div>`;
    root.querySelector('[data-act="close"]').onclick = () => (root.innerHTML = '');
    root.querySelectorAll('[data-policy]').forEach((b) => (b.onclick = () => { root.innerHTML = ''; run(b.dataset.policy); }));
  }

  // ---------------- 合流・合併の交渉 ----------------
  function openMergeModal(st) {
    const root = document.getElementById('modal-root');
    const list = Game.Merger.partners(st);
    const ORGS = Game.Data.ORGANIZATIONS;
    const rows = list
      .map((p) => {
        const backers = p.backers.map((o) => ORGS[o].name).join('・');
        const clash = p.conflicts.map(([a, b]) => `「${polName(a)}」と「${polName(b)}」`).join('、');
        return `
          <button class="btn choice-btn partner-btn" data-partner="${p.id}" ${p.cooldown ? 'disabled' : ''}>
            <b>${chip(p.id)} ${esc(p.name)} <span class="muted small">${p.seats}議席</span></b>
            <span class="small muted">${backers ? `支持母体:${esc(backers)}` : '支持母体なし'}${clash ? ` ・ 政策がぶつかる:${esc(clash)}` : ' ・ 政策は近い'}${p.cooldown ? ` ・ 交渉決裂から間がない(あと${p.cooldown}ターン)` : ''}</span>
          </button>`;
      })
      .join('');
    root.innerHTML = `
      <div class="modal-backdrop"><div class="modal modal-wide">
        <p class="modal-kicker">合流・合併</p><h2>どの党と交渉する?</h2>
        <p class="small muted">合流すると議席は増えるが、党内の結束が下がる。政策がぶつかる相手ほど、もめやすい。相手の支持母体(宗教団体を含む)の要望も引き継ぐ。</p>
        <p class="small muted">${esc(Game.Data.MERGER_EXAMPLE)}</p>
        <div class="choices">${rows || '<p class="muted">交渉できる相手がいない。</p>'}</div>
        <div class="modal-actions"><button class="btn" data-act="close">やめる</button></div>
      </div></div>`;
    root.querySelector('[data-act="close"]').onclick = () => (root.innerHTML = '');
    root.querySelectorAll('[data-partner]').forEach((b) => (b.onclick = () => openTerms(st, b.dataset.partner)));
  }

  function openTerms(st, partner) {
    const root = document.getElementById('modal-root');
    const terms = Game.Merger.defaultTerms(st, partner);
    const ORGS = Game.Data.ORGANIZATIONS;
    const info = LD().partyInfo(partner);
    const ours = LD().partyInfo(st.leader.party);

    function opt(group, value, label) {
      return `<button class="policy-pick ${terms[group] === value ? 'on' : ''}" data-term="${group}" data-value="${value}">${esc(label)}</button>`;
    }
    function draw() {
      const ev = Game.Merger.evaluate(st, partner, terms);
      const smaller = ev.smaller;
      const willingLabel = ev.willing >= 15 ? '前向き' : ev.willing >= 0 ? '条件しだいで応じそう' : '拒否されそう';
      const after = Math.max(0, Math.round(st.leader.cohesion - ev.drop));
      const backers = (Game.Data.PARTY_BACKERS[partner] || []).map((o) => `${ORGS[o].name}(${ORGS[o].policies.map(polName).join('・')})`).join('、');
      const freshName = root.querySelector('#mg-name')?.value ?? '';
      const freshShort = root.querySelector('#mg-short')?.value ?? '';
      root.innerHTML = `
        <div class="modal-backdrop"><div class="modal modal-wide">
          <p class="modal-kicker">合流交渉</p>
          <h2>${esc(ours.name)} × ${esc(info.name)}</h2>
          <p class="small muted">${esc(ours.name)} ${ev.ours}議席 / ${esc(info.name)} ${ev.theirs}議席。${smaller ? '相手のほうが大きい。相手は代表の座を求めている。' : 'こちらが大きい。相手は代表の座を譲るかわりに、要職を求めている。'}</p>
          <div class="terms">
            <div class="term-row"><span class="field-label">党名</span><div class="policy-picks">${opt('name', 'ours', `「${ours.name}」のまま`)}${opt('name', 'theirs', `「${info.name}」にする`)}${opt('name', 'fresh', '新しい党名')}</div></div>
            ${terms.name === 'fresh' ? `<div class="term-row"><span class="field-label">新しい党名</span><div class="np-fields inline"><input id="mg-name" class="text-input" maxlength="12" placeholder="${esc(ours.short)}・${esc(info.short)}連合" value="${esc(freshName)}"><input id="mg-short" class="text-input short" maxlength="2" placeholder="略称" value="${esc(freshShort)}"></div></div>` : ''}
            <div class="term-row"><span class="field-label">代表</span><div class="policy-picks">${smaller
              ? opt('leader', 'keep', '代表は譲らない') + opt('leader', 'co', '共同代表にする') + opt('leader', 'yield', '代表を譲り、自分は幹事長に')
              : opt('leader', 'keep', 'ポストは渡さない') + opt('leader', 'posts', '幹事長など要職を渡す')}</div></div>
            <div class="term-row"><span class="field-label">政策</span><div class="policy-picks">${opt('policy', 'ours', 'こちらの政策で')}${opt('policy', 'theirs', '相手の政策に合わせる')}${opt('policy', 'both', '両方を併記する')}</div></div>
            <div class="term-row"><span class="field-label">候補者調整</span><div class="policy-picks">${opt('candidates', 'ours', 'こちらの候補を優先')}${opt('candidates', 'theirs', '相手の候補を優先')}${opt('candidates', 'incumbent', '現職を優先')}</div></div>
          </div>
          <div class="merge-eval">
            <div><span class="small muted">相手の前向き度</span><div class="willing-meter ${ev.willing >= 0 ? 'ok' : 'ng'}"><span style="width:${Math.max(4, Math.min(100, 50 + ev.willing))}%"></span><i></i></div><b>${esc(willingLabel)}</b></div>
            <div><span class="small muted">党内の結束</span><p><b>${Math.round(st.leader.cohesion)} → ${after}</b>(${ev.drop}下がる。しこりもしばらく残る)</p></div>
            <div><span class="small muted">合流後の議席</span><p><b>${ev.ours + ev.theirs}</b>議席</p></div>
          </div>
          ${ev.conflicts.length ? `<p class="small warn-text">政策がぶつかる:${ev.conflicts.map(([a, b]) => `「${esc(polName(a))}」と「${esc(polName(b))}」`).join('、')}</p>` : ''}
          ${backers ? `<p class="small muted">引き継ぐ支持母体の要望:${esc(backers)}${ev.backerClash.length ? '。<span class="warn-text">あなたの公約とぶつかる団体があり、党内がもめやすい</span>' : ''}</p>` : ''}
          <p class="small muted">${esc(Game.Data.MERGER_EXAMPLE)}</p>
          <div class="modal-actions">
            <button class="btn" data-act="back">相手を選び直す</button>
            <button class="btn btn-primary" data-act="propose" ${st.leader.actionsLeft > 0 ? '' : 'disabled'}>この条件で提案する(行動1回)</button>
          </div>
        </div></div>`;
      root.querySelectorAll('[data-term]').forEach((b) => (b.onclick = () => { terms[b.dataset.term] = b.dataset.value; draw(); }));
      root.querySelector('[data-act="back"]').onclick = () => openMergeModal(st);
      root.querySelector('[data-act="propose"]').onclick = () => {
        if (terms.name === 'fresh') {
          terms.freshName = (root.querySelector('#mg-name').value || '').trim();
          terms.freshShort = (root.querySelector('#mg-short').value || '').trim();
        }
        const res = Game.Merger.propose(st, partner, terms);
        Game.clearUndo();   // 合流の提案は取り消せない
        st.leader.report = { title: res.accepted ? '合流が決まった' : '交渉決裂', lines: [res.text], event: null };
        st.ui.showLeaderReport = true;
        Game.commit();
      };
    }
    draw();
  }

  // ---------------- ターンの知らせ ----------------
  function renderReport(root, st) {
    const ld = st.leader;
    const r = ld.report;
    const ev = r.event;
    let evHtml = '';
    if (ev) {
      let choices = '';
      if (ev.choices && ld.pending === ev) {
        choices = `<div class="choices">${ev.choices.map((ch) => `<button class="btn choice-btn" data-choice="${ch.id}" ${ch.disabled ? 'disabled' : ''}><b>${esc(ch.label)}</b><span class="small muted">${esc(ch.note)}</span></button>`).join('')}</div>`;
      } else if (r.result) {
        choices = `<p class="event-result">${esc(r.result)}</p>`;
      }
      evHtml = `<div class="event-card ${ev.id === 'split' ? 'event-split' : ''}"><span class="event-kicker">${ev.id === 'split' ? '分裂' : ev.kicker ? esc(ev.kicker) : ev.org ? '支援団体' : ev.choices ? 'イベント' : 'ニュース'}</span><h4>${esc(ev.title)}</h4><p>${esc(ev.text)}</p>${choices}</div>`;
    }
    const pending = !!ld.pending;
    root.innerHTML = `
      <div class="modal-backdrop"><div class="modal">
        <p class="modal-kicker">${esc(LD().partyInfo(ld.party).name)}</p>
        <h2>${esc(r.title)}</h2>
        ${r.lines.map((l) => `<p>${esc(l)}</p>`).join('')}
        ${evHtml}
        <div class="modal-actions"><button class="btn btn-primary btn-lg" data-act="close-report" ${pending ? 'disabled' : ''}>${r.dissolution ? '総選挙の準備へ' : '党本部へ'}</button></div>
      </div></div>`;
    root.querySelectorAll('[data-choice]').forEach((b) => (b.onclick = () => {
      LD().resolveEvent(st, b.dataset.choice);
      if (st.pendingEnding) return Game.goEnding(st.pendingEnding);   // 退陣・党首交代・政権交代など
      Game.commit();
    }));
    root.querySelector('[data-act="close-report"]').onclick = () => {
      st.ui.showLeaderReport = false;
      if (r.dissolution) { r.dissolution = false; return Game.startNationalPrep(); }
      Game.commit();
    };
  }
})(Game.UI);
