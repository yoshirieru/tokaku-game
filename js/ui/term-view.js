// 議員任期(浪人中を含む)の画面
window.Game = window.Game || {};
Game.UI = Game.UI || {};

(function (UI) {
  const esc = (s) => UI.esc(s);
  const K = () => Game.Career;
  const polName = (id) => Game.Data.POLICIES[id].name;

  // 支援団体モーダル(org-view.js)に渡すため、任期中の支援団体の状態を選挙戦と同じ形にする
  function supportView(state) {
    const sup = state.support;
    const endorsements = {};
    for (const id of sup.endorsedLast || []) endorsements[id] = 'player';
    return {
      player: { id: 'player' },
      candidates: [{ id: 'player', name: state.player.name, isPlayer: true }],
      support: {
        relations: { player: sup.relations },
        pledges: { player: sup.pledges },
        endorsements,
        ownCandidate: {},
        banned: sup.banned || [],
        promises: sup.promises,
      },
    };
  }

  UI.renderTerm = function (app, modalRoot) {
    const st = Game.state;
    const c = st.career;
    if (!st.ui.termRegion) st.ui.termRegion = Game.Data.DISTRICTS[0].id;

    app.innerHTML = `
      <div class="campaign term">
        ${hud(st)}
        <div class="campaign-main">
          <div class="col-left">
            ${homePanel(st)}
            ${promisePanel(st)}
            ${rivalPanel(st)}
            ${c.status !== 'founder' ? UI.factionPanel(st) : ''}
          </div>
          <div class="col-right">
            ${actionsPanel(st)}
            ${K().isCustom(st) ? partyPanel(st) : statusPanel(st)}
            ${UI.econPanel(st)}
            ${c.status === 'member' ? UI.debateDeckPanel(st, 'ask') : ''}
            ${UI.snsPanel(Game.Sns.ensure(st), { unit: 'ターン', note: '話題度は知名度に、好感度は次の選挙の票につながる(若い世代・都市部ほど)。組織票には効かない。国会や番組での発言は切り抜かれて拡散されることがある。' })}
            ${movePanel(st)}
          </div>
        </div>
        ${logPanel(st)}
      </div>`;

    app.querySelectorAll('[data-region]').forEach((el) => {
      el.onclick = () => {
        st.ui.termRegion = el.dataset.region;
        Game.commit();
      };
    });
    app.querySelectorAll('[data-action]').forEach((el) => {
      el.onclick = () => {
        const id = el.dataset.action;
        const run = (target) => {
          Game.pushUndo();   // そのターンのうちなら取り消せる
          const res = K().doAction(st, id, target);
          if (!res.ok) Game.dropUndo();
          if (res.debate) Game.clearUndo();   // 論戦は取り消せない
          st.ui.lastResult = res.text;
          Game.commit();
        };
        const target = K().ACTIONS[id].target;
        if (target === 'region') run(st.ui.termRegion);
        else if (target === 'org') UI.openOrgModal({ camp: supportView(st), pick: run });
        else if (target === 'policy') openPolicyModal(st, id, run);
        else if (target === 'post') UI.openPostModal({ sns: Game.Sns.ensure(st), pledges: st.support ? st.support.pledges : [], pick: run, title: K().ACTIONS[id].name });
        else if (target === 'faction' && Game.Faction.ensure(st)) UI.openFactionPick(st, run);   // 派閥(faction-view.js)
        else run(null);
      };
    });
    app.querySelectorAll('[data-act="org-info"]').forEach((el) => {
      el.onclick = () => UI.openOrgModal({ camp: supportView(st) });
    });
    const endBtn = app.querySelector('[data-act="end-turn"]');
    if (endBtn) {
      endBtn.onclick = () => {
        if (c.turn.actionsLeft > 0 && !confirm(`行動があと${c.turn.actionsLeft}回残っています。ターンを終えますか?`)) return;
        K().endTurn(st);
        Game.clearUndo();   // ターンが変わったら取り消せない
        st.ui.lastResult = null;
        st.ui.showTermReport = true;
        Game.commit();
      };
    }
    const undoBtn = app.querySelector('[data-act="undo"]');
    if (undoBtn) undoBtn.onclick = () => Game.undo();
    // 離党・移籍
    const defectBtn = app.querySelector('[data-act="defect"]');
    if (defectBtn) defectBtn.onclick = () => openDefectModal(st);
    const migrateBtn = app.querySelector('[data-act="migrate"]');
    if (migrateBtn) migrateBtn.onclick = () => openMigrateModal(st);
    const retireBtn = app.querySelector('[data-act="retire"]');
    if (retireBtn) retireBtn.onclick = () => {
      if (confirm('政界を引退して、ゲームを終えますか?')) Game.goEnding('retire');
    };
    const menuBtn = app.querySelector('[data-act="menu"]');
    if (menuBtn) {
      menuBtn.onclick = () => {
        Game.save();
        Game.showScreen('title');
      };
    }

    if (st.ui.showTermReport && c.report) renderReport(modalRoot, st);
  };

  // ---------------- 上部 ----------------
  function hud(st) {
    const c = st.career;
    const w = st.world;
    const party = UI.party(st.player.party);
    const T = Game.Balance.term;
    const acts = Array.from({ length: T.actionsPerTurn }, (_, i) => `<span class="act-pip ${i < c.turn.actionsLeft ? 'on' : ''}"></span>`).join('');
    const termPct = Math.round((c.turn.elapsed / T.termTurns) * 100);
    const dc = K().dissolveChance(st);
    const mood = dc >= 0.25 ? { t: '解散風が強い', cls: 'warn' } : dc >= 0.12 ? { t: '解散の噂', cls: '' } : { t: '静か', cls: '' };
    const status = c.status === 'member' ? `衆議院議員 当選${c.wins}回` : c.status === 'founder' ? '新党の党首(議席なし)' : '浪人中';
    return `
      <header class="hud" style="--pc:${party.color}">
        <div class="hud-title">
          <span class="hud-district">${esc(Game.Data.DISTRICT_NAME)} ・ ${esc(status)}</span>
          <span class="hud-name">${UI.partyChip(st.player.party)} ${esc(st.player.name)}<small class="post-tag">${esc(c.status === 'member' || K().isCustom(st) ? K().postName(st) : '前職')}</small></span>
        </div>
        <div class="hud-day">
          <span class="hud-day-num">${w.year}<small>年 ${esc(K().sessionName(st))}</small></span>
          <span class="term-bar" title="任期の経過"><span style="width:${termPct}%"></span></span>
        </div>
        <div class="hud-stats">
          <div class="stat"><span class="stat-label">行動</span><span class="act-pips">${acts}</span></div>
          <div class="stat"><span class="stat-label">資金</span><span class="stat-val">${Math.round(c.money)}<small>万円</small></span></div>
          <div class="stat"><span class="stat-label">実績</span><span class="stat-val">${Math.round(c.achievements)}</span></div>
          <div class="stat"><span class="stat-label">党内評価</span><span class="stat-val">${Math.round(c.partyEval)}</span></div>
          <div class="stat"><span class="stat-label">内閣支持率</span><span class="stat-val">${Math.round(w.approval)}<small>%</small></span></div>
          <div class="stat"><span class="stat-label">永田町</span><span class="stat-val small ${mood.cls}">${mood.t}</span></div>
        </div>
        <button class="btn btn-ghost hud-menu" data-act="menu" title="メニュー(セーブしてタイトルへ・政界を引退する)">≡</button>
      </header>`;
  }

  // ---------------- 地元の地盤 ----------------
  function homePanel(st) {
    const h = st.career.home;
    const sel = st.ui.termRegion;
    const tiles = Game.Data.DISTRICTS.map((d) => {
      const p = h.personal[d.id] || 0;
      const lvl = p >= 30 ? 'strong' : p >= 20 ? 'lean' : p >= 12 ? 'toss' : p >= 6 ? 'behind' : 'weak';
      const dis = st.career.turn.mods.disaster === d.id;
      return `
        <button class="map-tile outlook-${lvl} ${d.id === sel ? 'selected' : ''}" data-region="${d.id}"
          style="grid-column:${d.map.x + 1} / span ${d.map.w};grid-row:${d.map.y + 1} / span ${d.map.h}">
          <span class="tile-name">${esc(d.name)}${dis ? ' ⚠' : ''}</span>
          <span class="tile-voters">有権者 ${(d.voters / 10000).toFixed(1)}万人</span>
          <span class="tile-recog">知名度 ${Math.round(h.recog[d.id] || 0)} ・ 支持 ${Math.round(p)}</span>
          <span class="tile-recog">後援会 ${Math.round(h.solid[d.id] || 0)}</span>
        </button>`;
    }).join('');
    return `
      <section class="panel map-panel">
        <div class="panel-head">
          <h3>地元の地盤</h3>
          <span class="muted small">放っておくと少しずつ薄れる。選んだ地区で地元回り</span>
        </div>
        <div class="district-map">
          ${tiles}
          <div class="map-sea" style="grid-column:3;grid-row:1">${esc(Game.Data.SEA_NAME)}</div>
        </div>
      </section>`;
  }

  // ---------------- 約束 ----------------
  function promisePanel(st) {
    if (!st.support) return '';
    const ORGS = Game.Data.ORGANIZATIONS;
    const goal = Game.Balance.term.promiseGoal;
    const open = st.support.promises.filter((p) => p.status === 'open');
    const rows = open
      .map((p) => `<li><span>${esc(ORGS[p.org].name)}:「${esc(polName(p.policy))}」</span><span class="promise-progress">${'●'.repeat(Math.min(goal, p.progress || 0))}${'○'.repeat(Math.max(0, goal - (p.progress || 0)))}</span></li>`)
      .join('');
    const ps = st.career.promiseStats;
    const pledges = st.support.pledges.map((p) => `<span class="policy-chip match">${esc(polName(p))}</span>`).join('');
    return `
      <section class="panel">
        <div class="panel-head">
          <h3>公約と約束</h3>
          <button class="btn btn-ghost small" data-act="org-info">支援団体 ›</button>
        </div>
        <div class="policy-row"><span class="small muted">公約</span>${pledges}</div>
        ${open.length
          ? `<p class="small muted">団体との約束は、その政策で委員会質問(+1)や議員立法(成立で+2)をすると果たせる。果たせないまま解散すると、その団体の推薦は見送られる。</p><ul class="promise-list open">${rows}</ul>`
          : '<p class="small muted">いま果たすべき約束はない。</p>'}
        <p class="small muted">これまで:守った約束 ${ps.kept} ・ 破った約束 ${ps.broken}</p>
      </section>`;
  }

  // ---------------- 次の選挙のライバル ----------------
  function rivalPanel(st) {
    const rows = st.career.rivals
      .map((r) => `<li>${UI.partyChip(r.party)} <b>${esc(r.name)}</b><span class="muted small">${UI.ROLE_LABEL[r.role] || ''}${r.wins ? `・当選${r.wins}回` : ''}</span></li>`)
      .join('');
    return `
      <section class="panel">
        <div class="panel-head"><h3>次の選挙の相手(予想)</h3></div>
        <ul class="rival-list">${rows || '<li class="muted small">未定</li>'}</ul>
      </section>`;
  }

  // ---------------- 行動 ----------------
  function actionsPanel(st) {
    const c = st.career;
    const acts = K().availableActions(st);
    const regName = Game.Data.DISTRICTS.find((d) => d.id === st.ui.termRegion).name;
    const buttons = acts
      .map((a) => {
        const costs = [];
        if (a.money) costs.push(`${a.money}万円`);
        if (a.id === 'fund') costs.push(`+${a.gain}万円`);
        if (a.id === 'bill') costs.push(`成立の見込み ${Math.round(a.passChance * 100)}%`);
        const target = a.target === 'region' ? `→ ${regName}` : a.target === 'policy' ? '→ 政策を選ぶ' : a.target === 'org' ? '→ 団体を選ぶ' : a.target === 'post' ? '→ 投稿を選ぶ' : a.target === 'faction' && Game.Faction.ensure(st) ? '→ 派閥を選ぶ' : '';
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
    const notes = [];
    notes.push(K().sessionOpen(st) ? '国会開会中' : '閉会中(委員会質問・議員立法はできない)');
    if (c.status === 'ronin') notes.push('浪人中:地元回りだけ');
    return `
      <section class="panel actions-panel">
        <div class="panel-head">
          <h3>このターンの行動 <span class="muted small">残り${c.turn.actionsLeft}回</span></h3>
          <span class="today-notes small">${esc(notes.join(' ・ '))}</span>
        </div>
        <div class="action-grid">${buttons}</div>
        <div class="end-day">
          <button class="btn" data-act="undo" ${Game.canUndo() ? '' : 'disabled'} title="このターンの行動を1つ取り消す">↶ 取り消す</button>
          <button class="btn ${c.turn.actionsLeft === 0 ? 'btn-primary btn-lg pulse' : ''}" data-act="end-turn">ターンを終える</button>
        </div>
      </section>`;
  }

  // ---------------- 出世の見通し ----------------
  function statusPanel(st) {
    const c = st.career;
    const PR = Game.Balance.term.promotion;
    const list = K().isRuling(st) ? Game.Data.POSTS.ruling : Game.Data.POSTS.opposition;
    const ladder = list
      .map((name, i) => {
        const step = PR.steps[i - 1];
        const cond = step ? `当選${step.wins}回・党内評価${step.eval}` : '';
        const cls = i < c.postLevel ? 'done' : i === c.postLevel ? 'now' : '';
        return `<li class="${cls}"><b>${esc(name)}</b><span class="small muted">${cond}</span></li>`;
      })
      .join('');
    return `
      <section class="panel">
        <div class="panel-head">
          <h3>出世の階段</h3>
          <span class="muted small">人事は毎年の${esc(Game.Data.SESSIONS[PR.turnIndex])}。${K().isRuling(st) ? '与党は人数が多く、選ばれにくい' : '野党の党内ポスト'}</span>
        </div>
        <ol class="ladder">${ladder}</ol>
        <p class="small muted">仲間の議員:${Math.round(c.allies)}人(党首選の推薦人や離党に使う:M5)</p>
      </section>`;
  }

  // ---------------- 新党の状況 ----------------
  function partyPanel(st) {
    const p = st.party;
    const NB = Game.Balance.newParty;
    const sup = Game.NewParty.supportOf(p);
    return `
      <section class="panel party-panel" style="--pc:${p.color}">
        <div class="panel-head">
          <h3>${UI.partyChip(Game.NewParty.ID)} ${esc(p.name)}</h3>
          <span class="muted small">${esc(Game.Data.IDEOLOGIES[p.ideology].name)} ・ ${p.founded}年結成</span>
        </div>
        <div class="stat-cards compact">
          <div class="stat-card"><span>支持率</span><b>${sup.toFixed(1)}</b><small>%</small></div>
          <div class="stat-card"><span>所属議員</span><b>${p.mps + (p.upperMps || 0)}</b><small>人${p.upperMps ? `(参${p.upperMps})` : ''}</small></div>
          <div class="stat-card"><span>公認候補</span><b>${p.candidates}</b><small>人</small></div>
          <div class="stat-card"><span>新しさ</span><b>${Math.round(p.newness)}</b><small>/ 100</small></div>
        </div>
        <p class="small">${p.requirement
          ? `<b class="good-text">政党要件を満たしている</b>(政党交付金 ${NB.subsidyPerTurn}万円/ターン、比例との重複立候補ができる)`
          : `<b class="warn-text">政党要件なし</b>:重複立候補ができず、ポスター・選挙カーも少ない。議員${NB.requirement.mps}人以上か、国政選挙で得票率${NB.requirement.share * 100}%以上で満たす。`}</p>
        ${upperHint(st)}
        <p class="small muted">「新しさ」は時間とともに減る。あるうちはSNSと浮動票に強い。公認候補が多いほど露出は増えるが、失言・不祥事のリスクも増える。</p>
      </section>`;
  }

  // 結党準備中の次の参院選(M13)
  function upperHint(st) {
    if (st.career.status !== 'founder') return '';
    const NP = Game.NewParty;
    const U = Game.Balance.newParty.upper;
    const w = st.world;
    const y = NP.nextUpperYear(st);
    const turns = (y - w.year) * Game.Balance.term.turnsPerYear + (1 - w.turnIndex);
    if (turns < 0 || turns > 12) return '';
    const p = st.party;
    const ok = p.candidates >= U.prMinCandidates;
    return `<p class="small upper-hint">🗳 次の参院選は<b>${y}年夏</b>(${turns === 0 ? 'このターン' : `あと${turns}ターン`})。比例に出るには候補者${U.prMinCandidates}人以上:<b class="${ok ? 'good-text' : 'warn-text'}">いま${p.candidates}人</b>${p.upper ? `(前回 ${p.upper.year}年は${p.upper.seats}議席・得票率${(p.upper.share * 100).toFixed(1)}%)` : ''}</p>`;
  }

  // ---------------- 進退(離党・移籍) ----------------
  function movePanel(st) {
    const NP = Game.NewParty;
    const NB = Game.Balance.newParty;
    // 引退(エンディング)は議員でも浪人でも選べる
    const retire = `<button class="btn btn-ghost" data-act="retire">政界を引退する</button>`;
    if (st.career.status === 'ronin') {
      return `<section class="panel move-panel"><div class="panel-head"><h3>進退</h3></div><div class="move-buttons">${retire}</div><p class="small muted">引退するとゲームが終わり、エンディングとレガシー評価が出る。</p></section>`;
    }
    if (K().isCustom(st) || st.career.status !== 'member') return '';
    const canD = NP.canDefect(st);
    const canM = NP.canMigrate(st);
    return `
      <section class="panel move-panel">
        <div class="panel-head"><h3>進退</h3><span class="muted small">大きな決断。取り消せない</span></div>
        <div class="move-buttons">
          <button class="btn" data-act="defect" ${canD ? '' : 'disabled'}>離党して新党を作る</button>
          <button class="btn" data-act="migrate" ${canM ? '' : 'disabled'}>ほかの党へ移籍する</button>
          ${retire}
        </div>
        <p class="small muted">離党:当選${NB.defect.minWins}回以上。仲間の議員の一部がついてくる(今なら${NP.defectFollowers(st)}人)。5人そろえば政党要件。元の党は刺客を立て、支援団体との関係度は半減。</p>
        <p class="small muted">移籍:当選${NB.migrate.minWins}回以上。知名度と地盤は残り、党内評価と役職はゼロから。「渡り鳥」批判で次の選挙は支持が少し減り、元の党から刺客が来る。</p>
      </section>`;
  }

  function openDefectModal(st) {
    const root = document.getElementById('modal-root');
    const followers = Game.NewParty.defectFollowers(st);
    const colors = Game.Data.CUSTOM_COLORS;
    let color = colors[0];
    let ideology = 'reform';
    const pledges = st.support.pledges.slice(0, Game.Balance.newParty.pledgeCount);
    function draw() {
      root.innerHTML = `
        <div class="modal-backdrop">
          <div class="modal">
            <p class="modal-kicker">離党</p>
            <h2>新党を立ち上げる</h2>
            <p>${esc(UI.party(st.player.party).name)}を離党し、新党を結成する。仲間の議員 ${followers}人がついてくる(所属議員は計${followers + 1}人)。${followers + 1 >= Game.Balance.newParty.requirement.mps ? '<b>結党と同時に政党要件を満たす。</b>' : ''}</p>
            ${newPartyFields(color, ideology)}
            <p class="small muted">公約は今の公約を引き継ぐ:${pledges.map((p) => esc(polName(p))).join('・')}</p>
            <div class="modal-actions">
              <button class="btn" data-act="close">やめる</button>
              <button class="btn btn-primary" data-act="ok">離党して結党する</button>
            </div>
          </div>
        </div>`;
      bindNewPartyFields(root, (c) => { color = c; draw(); }, (i) => { ideology = i; draw(); });
      root.querySelector('[data-act="close"]').onclick = () => (root.innerHTML = '');
      root.querySelector('[data-act="ok"]').onclick = () => {
        const name = root.querySelector('#np-name').value.trim();
        const short = root.querySelector('#np-short').value.trim();
        if (!name || !short) return alert('党名と略称を入れてください');
        root.innerHTML = '';
        const res = Game.NewParty.defect(st, { name, short, color, ideology, pledges });
        Game.clearUndo();
        st.career.report = {
          title: `新党「${name}」結成`,
          lines: [
            `${name}を結成し、党首に就いた。仲間の議員${res.followers}人が行動をともにした。`,
            res.requirement ? '所属議員が5人以上となり、政党要件を満たした。' : '政党要件(議員5人以上)にはまだ届かない。',
            '元の党は次の選挙で、あなたの選挙区に刺客を立てると表明した。',
          ],
          event: null,
        };
        st.ui.showTermReport = true;
        Game.commit();
      };
    }
    draw();
  }

  function openMigrateModal(st) {
    const root = document.getElementById('modal-root');
    const targets = Object.values(Game.Data.PARTIES).filter((p) => p.playable && p.id !== st.player.party);
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal">
          <p class="modal-kicker">移籍</p>
          <h2>どの党へ移る?</h2>
          <p class="small muted">知名度と地盤は残る。党内評価と役職はゼロから。次の選挙は「渡り鳥」批判で支持が少し減り、元の党は刺客を立てる。</p>
          <div class="choices">${targets.map((p) => `<button class="btn choice-btn" data-target="${p.id}"><b>${UI.partyChip(p.id)} ${esc(p.name)}</b><span class="small muted">${esc(p.position)}</span></button>`).join('')}</div>
          <div class="modal-actions"><button class="btn" data-act="close">やめる</button></div>
        </div>
      </div>`;
    root.querySelector('[data-act="close"]').onclick = () => (root.innerHTML = '');
    root.querySelectorAll('[data-target]').forEach((b) => {
      b.onclick = () => {
        const from = UI.party(st.player.party).name;
        Game.NewParty.migrate(st, b.dataset.target);
        Game.clearUndo();
        root.innerHTML = '';
        st.career.report = {
          title: `${UI.party(st.player.party).name}へ移籍`,
          lines: [`${from}を離れ、${UI.party(st.player.party).name}に移籍した。党内では新顔として一からのスタートになる。`, '報道は「渡り鳥」と書いた。元の党は刺客を立てる構えだ。'],
          event: null,
        };
        st.ui.showTermReport = true;
        Game.commit();
      };
    });
  }

  // 新党の名前・色・理念の入力欄(準備画面の新党ルートでも使う)
  function newPartyFields(color, ideology) {
    const colors = Game.Data.CUSTOM_COLORS.map((c) => `<button class="swatch ${c === color ? 'on' : ''}" data-color="${c}" style="background:${c}" title="${c}"></button>`).join('');
    const ides = Object.keys(Game.Data.IDEOLOGIES).map((id) => `<button class="policy-pick ${id === ideology ? 'on' : ''}" data-ideology="${id}">${esc(Game.Data.IDEOLOGIES[id].name)}</button>`).join('');
    const nameVal = document.querySelector('#np-name')?.value ?? '';
    const shortVal = document.querySelector('#np-short')?.value ?? '';
    return `
      <div class="np-fields">
        <label class="field-label">党名 <input id="np-name" class="text-input" maxlength="12" placeholder="例:日本刷新の会" value="${esc(nameVal)}"></label>
        <label class="field-label">略称(2文字) <input id="np-short" class="text-input short" maxlength="2" placeholder="刷新" value="${esc(shortVal)}"></label>
        <div class="field-label">党の色 <div class="swatches">${colors}</div></div>
        <div class="field-label">理念 <div class="policy-picks">${ides}</div></div>
      </div>`;
  }
  function bindNewPartyFields(root, onColor, onIdeology) {
    root.querySelectorAll('[data-color]').forEach((b) => (b.onclick = () => onColor(b.dataset.color)));
    root.querySelectorAll('[data-ideology]').forEach((b) => (b.onclick = () => onIdeology(b.dataset.ideology)));
  }
  UI.newPartyFields = newPartyFields;
  UI.bindNewPartyFields = bindNewPartyFields;

  function logPanel(st) {
    const items = st.career.log
      .slice(-14)
      .reverse()
      .map((l) => `<li class="log-${l.kind}"><span class="log-day">${esc(l.when)}</span>${esc(l.text)}</li>`)
      .join('');
    return `
      <section class="panel log-panel">
        ${st.ui.lastResult ? `<div class="last-result">${esc(st.ui.lastResult)}</div>` : ''}
        <ul class="log-list">${items}</ul>
      </section>`;
  }

  // ---------------- 政策を選ぶ ----------------
  function openPolicyModal(st, actionId, run) {
    const root = document.getElementById('modal-root');
    const ORGS = Game.Data.ORGANIZATIONS;
    const open = (st.support ? st.support.promises : []).filter((p) => p.status === 'open');
    const targets = K().policyTargets(st);
    const rows = targets
      .map((id) => {
        const tied = open.filter((p) => p.policy === id).map((p) => ORGS[p.org].name);
        return `<button class="btn choice-btn" data-policy="${id}"><b>${esc(polName(id))}</b><span class="small muted">${tied.length ? `約束:${esc(tied.join('・'))}` : '公約'}</span></button>`;
      })
      .join('');
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal">
          <p class="modal-kicker">${esc(K().ACTIONS[actionId].name)}</p>
          <h2>どの政策で?</h2>
          <div class="choices">${rows}</div>
          <div class="modal-actions"><button class="btn" data-act="close">やめる</button></div>
        </div>
      </div>`;
    root.querySelector('[data-act="close"]').onclick = () => (root.innerHTML = '');
    root.querySelectorAll('[data-policy]').forEach((b) => {
      b.onclick = () => {
        root.innerHTML = '';
        run(b.dataset.policy);
      };
    });
  }

  // 参院選の結果(得票率の帯と、改選124議席の内訳)
  function upperResultHtml(st, u) {
    const ids = Object.keys(u.shares).sort((a, b) => u.shares[b] - u.shares[a]);
    const bar = ids.map((id) => `<div class="seg" style="width:${(u.shares[id] * 100).toFixed(1)}%;background:${UI.party(id).color}" title="${esc(UI.party(id).name)} ${(u.shares[id] * 100).toFixed(1)}%"></div>`).join('');
    const rows = ids.map((id) => `<li class="${id === Game.NewParty.ID ? 'me' : ''}">${UI.partyChip(id)} <span>${esc(UI.party(id).name)}</span><span class="muted">${(u.shares[id] * 100).toFixed(1)}%</span><b>${u.allSeats[id] || 0}</b></li>`).join('');
    const R = Game.Balance.newParty.requirement;
    return `
      <div class="upper-result">
        <p class="upper-result-head">参院選 比例の得票率 ・ 改選124議席</p>
        <div class="share-bar">${bar}</div>
        <ul class="upper-rows">${rows}</ul>
        <p class="small">${u.requirement ? '<b class="good-text">政党要件を満たしている</b>' : `<b class="warn-text">政党要件まであと少し</b>(得票率${R.share * 100}%以上か国会議員${R.mps}人以上)`}</p>
      </div>`;
  }

  // ---------------- ターンの始まり(モーダル) ----------------
  function renderReport(root, st) {
    const c = st.career;
    const r = c.report;
    const ev = r.event;
    let evHtml = '';
    if (ev) {
      let choices = '';
      if (ev.choices && c.pending === ev) {
        choices = `<div class="choices">${ev.choices
          .map((ch) => `<button class="btn choice-btn" data-choice="${ch.id}" ${ch.disabled ? 'disabled' : ''}><b>${esc(ch.label)}</b><span class="small muted">${esc(ch.note)}</span></button>`)
          .join('')}</div>`;
      } else if (r.result) {
        choices = `<p class="event-result">${esc(r.result)}</p>`;
      }
      evHtml = `
        <div class="event-card">
          <span class="event-kicker">${ev.kicker ? esc(ev.kicker) : ev.org ? '支援団体' : ev.choices ? 'イベント' : 'ニュース'}</span>
          <h4>${esc(ev.title)}</h4>
          <p>${esc(ev.text)}</p>
          ${choices}
        </div>`;
    }
    const pending = !!c.pending && (!ev || c.pending === ev);
    if (r.upperResult) evHtml += upperResultHtml(st, r.upperResult);
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal ${r.dissolution ? 'modal-dissolve' : ''}">
          <p class="modal-kicker">${r.dissolution ? '速報' : esc(c.status === 'member' ? `当選${c.wins}回 ・ ${K().postName(st)}` : c.status === 'founder' ? `${st.party.name} 党首` : '浪人中')}</p>
          <h2>${esc(r.title)}</h2>
          ${r.lines.map((l) => `<p>${esc(l)}</p>`).join('')}
          ${evHtml}
          <div class="modal-actions">
            <button class="btn btn-primary btn-lg" data-act="close-report" ${pending ? 'disabled' : ''}>${r.dissolution ? '総選挙へ' : '国会へ'}</button>
          </div>
        </div>
      </div>`;
    root.querySelectorAll('[data-choice]').forEach((b) => {
      b.onclick = () => {
        K().resolveEvent(st, b.dataset.choice);
        // 党首選に立候補したら、党首選の画面へ
        if (st.leaderRace && !st.leaderRace.result) {
          st.ui.showTermReport = false;
          st.ui.lastResult = null;
          Game.clearUndo();
          st.screen = 'leaderRace';
        }
        Game.commit();
      };
    });
    root.querySelector('[data-act="close-report"]').onclick = () => {
      st.ui.showTermReport = false;
      if (r.dissolution) return Game.startNextCampaign();
      Game.commit();
    };
  }
})(Game.UI);
