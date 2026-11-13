// 支援団体の紹介と、支援団体回りの行き先選び
window.Game = window.Game || {};
Game.UI = Game.UI || {};

(function (UI) {
  const esc = (s) => UI.esc(s);
  const ORGS = () => Game.Data.ORGANIZATIONS;
  const polName = (id) => Game.Data.POLICIES[id].name;

  // 政策のチップ。pledges を渡すと一致(✓)・矛盾(✗)を示す
  UI.policyChips = function (policies, pledges) {
    return policies
      .map((p) => {
        let cls = '';
        let mark = '';
        if (pledges) {
          if (pledges.includes(p)) { cls = 'match'; mark = '✓ '; }
          else if (pledges.some((q) => Game.Support.conflicts(p, q))) { cls = 'clash'; mark = '✗ '; }
        }
        return `<span class="policy-chip ${cls}">${mark}${esc(polName(p))}</span>`;
      })
      .join('');
  };

  // 推薦の状況の文
  UI.endorsementLabel = function (camp, orgId) {
    const S = camp.support;
    if ((S.banned || []).includes(orgId)) return { text: '次回は推薦見送り', cls: 'rival' };
    if (S.ownCandidate[orgId]) {
      const c = camp.candidates.find((x) => x.id === S.ownCandidate[orgId]);
      return { text: `独自候補(${c.name})`, cls: 'own' };
    }
    const cid = S.endorsements[orgId];
    if (!cid) return { text: '推薦なし', cls: 'none' };
    const c = camp.candidates.find((x) => x.id === cid);
    return c.isPlayer ? { text: 'あなたを推薦', cls: 'mine' } : { text: `${c.name}を推薦`, cls: 'rival' };
  };

  function orgCard(org, camp, opts) {
    const pid = camp && camp.player.id;
    const pledges = camp ? camp.support.pledges[pid] : opts.pledges;
    let status = '';
    let relation = '';
    let pickBtn = '';
    if (camp) {
      const rel = Math.round(camp.support.relations[pid][org.id]);
      const th = Game.Balance.orgs.endorseThreshold;
      const e = UI.endorsementLabel(camp, org.id);
      const clash = Game.Support.conflictPairs(pledges, org.policies);
      status = `<span class="endorse-badge ${e.cls}">${esc(e.text)}</span>`;
      relation = `
        <div class="relation">
          <span class="small muted">関係度</span>
          <span class="relation-bar"><span style="width:${rel}%"></span><i style="left:${th}%" title="推薦のしきい値"></i></span>
          <b>${rel}</b>
        </div>
        ${clash.length ? `<p class="small warn-text">公約の「${esc(polName(clash[0][0]))}」が「${esc(polName(clash[0][1]))}」とぶつかるため、推薦はもらえない。</p>` : ''}`;
      if (opts.pick) {
        pickBtn = `<button class="btn btn-primary" data-pick="${org.id}">この団体を回る</button>`;
      }
    }
    const party = org.party ? Game.Data.PARTIES[org.party] : null;
    return `
      <article class="org-card ${org.kind}">
        <header class="org-head">
          <h4>${esc(org.name)}</h4>
          ${org.real ? '<span class="real-tag">実在の団体</span>' : '<span class="real-tag generic">一般名</span>'}
          ${status}
        </header>
        <p class="small"><b>強み:</b>${esc(org.strength)}</p>
        <div class="policy-row"><span class="small muted">求める政策</span>${UI.policyChips(org.policies, pledges)}</div>
        ${party ? `<p class="small muted">支持する政党:${esc(party.name)}</p>` : ''}
        ${opts.facts !== false ? `<ul class="org-facts">${org.facts.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
        ${relation}
        ${pickBtn ? `<div class="org-actions">${pickBtn}</div>` : ''}
      </article>`;
  }

  // opts: { camp, pick: (orgId) => void, pledges }
  UI.openOrgModal = function (opts) {
    opts = opts || {};
    const root = document.getElementById('modal-root');
    const camp = opts.camp;
    const cards = Object.values(ORGS()).map((o) => orgCard(o, camp, opts)).join('');
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal modal-wide">
          <p class="modal-kicker">${opts.pick ? '支援団体回り' : '支援団体の紹介'}</p>
          <h2>${opts.pick ? 'どの団体を回る?' : '支援団体'}</h2>
          <p class="small muted">団体の情報は${esc(Game.Data.ORG_INFO_DATE)}のものです。実在の団体は、公開されている事実(支持関係、公称の規模、掲げる政策)だけを載せています。</p>
          <p class="small muted">関係度が${Game.Balance.orgs.endorseThreshold}以上で、公約が団体の政策とぶつからなければ推薦がもらえます。1つの団体が推薦するのは1人だけです。</p>
          <div class="org-grid">${cards}</div>
          <div class="modal-actions"><button class="btn" data-act="close-org">閉じる</button></div>
        </div>
      </div>`;
    root.querySelector('[data-act="close-org"]').onclick = () => {
      root.innerHTML = '';
      if (opts.onClose) opts.onClose();
    };
    root.querySelectorAll('[data-pick]').forEach((b) => {
      b.onclick = () => {
        root.innerHTML = '';
        opts.pick(b.dataset.pick);
      };
    });
  };

  // 選挙戦の画面に置く支援団体の一覧
  UI.supportPanel = function (camp) {
    const pid = camp.player.id;
    const S = camp.support;
    const th = Game.Balance.orgs.endorseThreshold;
    const rows = Object.values(ORGS())
      .map((o) => {
        const rel = Math.round(S.relations[pid][o.id]);
        const e = UI.endorsementLabel(camp, o.id);
        const clash = Game.Support.conflictPairs(S.pledges[pid], o.policies).length > 0;
        return `
          <li class="org-row" data-org="${o.id}" title="クリックで団体の紹介">
            <span class="org-name">${esc(o.name)}${clash ? ' <span class="clash-mark" title="公約とぶつかる">✗</span>' : ''}</span>
            <span class="relation-bar small-bar"><span style="width:${rel}%"></span><i style="left:${th}%"></i></span>
            <span class="org-rel">${rel}</span>
            <span class="endorse-badge ${e.cls}">${esc(e.text)}</span>
          </li>`;
      })
      .join('');
    const pledges = S.pledges[pid].map((p) => `<span class="policy-chip match">${esc(polName(p))}</span>`).join('');
    const promises = S.promises.length ? `<p class="small muted">団体との約束:${S.promises.length}件(当選後に守れるかが問われる)</p>` : '';
    return `
      <section class="panel support-panel">
        <div class="panel-head">
          <h3>支援団体</h3>
          <button class="btn btn-ghost small" data-act="org-info">団体の紹介 ›</button>
        </div>
        <div class="policy-row"><span class="small muted">あなたの公約</span>${pledges}</div>
        ${promises}
        <ul class="org-list">${rows}</ul>
      </section>`;
  };
})(Game.UI);
