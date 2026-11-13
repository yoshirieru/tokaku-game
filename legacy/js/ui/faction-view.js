// 党内の派閥の画面(M16):議員任期のパネル、会合に出る派閥を選ぶ画面、党首選の「派閥の推し」
window.Game = window.Game || {};
Game.UI = Game.UI || {};

(function (UI) {
  const esc = (s) => UI.esc(s);
  const FA = () => Game.Faction;

  function debtText(d) {
    if (d > 0) return `<span class="good-text">貸し ${d}</span>`;
    if (d < 0) return `<span class="warn-text">借り ${-d}</span>`;
    return '<span class="muted">貸し借りなし</span>';
  }
  function row(st, f, F) {
    const rel = Math.round(F.rel[f.id]);
    const main = F.mainstream.includes(f.id);
    return `
      <li class="fac-row ${F.joined === f.id ? 'joined' : ''}">
        <div class="fac-head">
          <b>${esc(f.name)}</b>
          ${F.joined === f.id ? '<span class="fac-tag mine">所属</span>' : ''}
          <span class="fac-tag ${main ? 'main' : ''}">${main ? '主流派' : '非主流派'}</span>
          <span class="small muted">${Math.round(f.share * 100)}%</span>
        </div>
        <div class="small">領袖:${esc(f.boss)}(${esc(f.title)}) ・ ${esc(Game.Data.FACTION_STYLE_LABEL[f.style])} ・ ${f === FA().kingmaker(F.party) ? '党首選に出ないキングメーカー' : '党首選の有力候補'}</div>
        <div class="fac-meter"><span class="small muted">信頼</span><span class="relation-bar small-bar"><span style="width:${rel}%"></span></span><b>${rel}</b><span class="small">${debtText(F.debt[f.id])}</span></div>
      </li>`;
  }

  // 議員任期のパネル
  UI.factionPanel = function (st) {
    const F = FA().ensure(st);
    if (!F) return '';
    const rows = FA().list(st).map((f) => row(st, f, F)).join('');
    const delta = FA().promotionDelta(st);
    return `
      <section class="panel faction-panel">
        <div class="panel-head">
          <h3>党内の派閥</h3>
          <span class="small ${delta > 0 ? 'good-text' : delta < 0 ? 'warn-text' : 'muted'}">${F.joined ? `人事の見込み ${delta >= 0 ? '+' : ''}${Math.round(delta * 100)}%` : 'どの派閥にも入っていない'}</span>
        </div>
        <ul class="fac-list">${rows}</ul>
        <p class="small muted">主流派の派閥にいると昇進しやすく、非主流派だと冷や飯を食う。派閥の長に挑む党首選では派閥を飛び出すことになる。キングメーカーの推しが党首選を左右する。貸しがあれば裏切られにくく、借りはいつか返せと言われる。</p>
      </section>`;
  };

  // 「派閥・政策グループ活動」:どの派閥の会合に出るか
  UI.openFactionPick = function (st, run) {
    const F = FA().ensure(st);
    const root = document.getElementById('modal-root');
    const rows = FA().list(st).map((f) => {
      const note = !F.joined ? `入会する ・ ${esc(f.desc)}` : f.id === F.joined ? '所属する派閥の会合に出る(信頼が大きく上がる)' : `ほかの派閥にも顔を出す(信頼が少し上がるが、${esc(FA().byId(F.party, F.joined).name)}は不満)`;
      return `<button class="btn choice-btn" data-f="${f.id}"><b>${esc(f.name)}(${esc(f.boss)})${F.mainstream.includes(f.id) ? ' ・ 主流派' : ''}</b><span class="small muted">${note}</span></button>`;
    }).join('');
    root.innerHTML = `
      <div class="modal-backdrop"><div class="modal">
        <p class="modal-kicker">派閥・政策グループ活動</p>
        <h2>${F.joined ? 'どの派閥の会合に出る?' : 'どの派閥に入る?'}</h2>
        <div class="choices">${rows}</div>
        <div class="modal-actions"><button class="btn" data-act="close">やめる</button></div>
      </div></div>`;
    root.querySelector('[data-act="close"]').onclick = () => (root.innerHTML = '');
    root.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { root.innerHTML = ''; run(b.dataset.f); }));
  };

  // 党首選:派閥の推し
  UI.raceFactionPanel = function (race) {
    if (!race.factions) return '';
    const name = (id) => (race.cands.find((x) => x.id === id) || { name: '—' }).name;
    const rows = race.factions.map((f) => `<li class="${f.backs === 'player' ? 'me' : ''}"><span><b>${esc(f.name)}</b><small class="muted">(${esc(f.boss)})</small></span><span>→ ${esc(f.backs === 'player' ? 'あなた' : name(f.backs) + '氏')}${f.betrayed ? ' <span class="warn-text">寝返り</span>' : ''}</span></li>`).join('');
    return `
      <section class="panel">
        <div class="panel-head"><h3>派閥の推し</h3><span class="muted small">議員票を左右する</span></div>
        <ul class="house-list partner-list race-factions">${rows}</ul>
        <p class="small muted">「派閥の長と会談」でキングメーカーの推しを取りに行ける(党員の印象は悪くなる)。こちらを推す派閥も、投票の直前に寝返ることがある。</p>
      </section>`;
  };
})(Game.UI);
