// 国会論戦バトルの画面(予算委員会・党首討論)
window.Game = window.Game || {};
Game.UI = Game.UI || {};

(function (UI) {
  const esc = (s) => UI.esc(s);
  const CARDS = () => Game.Data.DEBATE_CARDS;
  const DB = () => Game.Balance.debate;
  const cardName = (id) => CARDS()[id].name;

  UI.renderDebate = function (app) {
    const st = Game.state;
    const d = st.debate;
    if (!d) {
      st.screen = st.leader && st.leader.mode === 'leader' ? 'leaderHub' : 'term';
      return Game.commit();
    }
    const K = Game.Data.DEBATE_KINDS[d.kind];
    const party = UI.party(st.player.party);
    const meLabel = d.role === 'pm' ? `${st.player.name}首相` : d.role === 'opposition' ? `${st.player.name}代表` : `${st.player.name}議員`;
    const topic = d.topic ? Game.Data.POLICIES[d.topic].name : '';
    const B = DB();

    // 説得力の綱引き(左があなた)
    const meter = `
      <div class="tug">
        <span class="tug-name me">${esc(meLabel)}</span>
        <div class="tug-bar" style="--pc:${party.color}">
          <span class="tug-fill" style="width:${d.meter}%"></span>
          <i class="tug-line" style="left:${B.loseLine}%"></i><i class="tug-line" style="left:${B.winLine}%"></i>
          <b class="tug-mark" style="left:${d.meter}%">${Math.round(d.meter)}</b>
        </div>
        <span class="tug-name opp">${esc(d.opponent.name)}</span>
      </div>
      <p class="small muted center">説得力:${B.winLine}以上で勝ち、${B.loseLine}以下で負け、その間は互角。0か100になればその場で決着。</p>`;
    const gauge = (v) => `<span class="meter wide"><span class="meter-fill ${v < B.gaffe.line ? 'low' : ''}" style="width:${v}%"></span></span><span class="stat-num">${Math.round(v)}</span>`;
    const fighters = `
      <div class="debate-sides">
        <div class="debate-side me">
          <b>${esc(meLabel)}</b><span class="small muted">${d.side === 'ask' ? '追及する側' : '答弁する側'}</span>
          <div class="small">冷静さ ${gauge(d.me.composure)}</div>
          ${d.me.composure < B.gaffe.line ? '<p class="small warn-text">動揺している。失言に注意</p>' : ''}
        </div>
        <div class="debate-side opp">
          <b>${esc(d.opponent.name)}</b><span class="small muted">${d.side === 'ask' ? '答弁する側' : '追及する側'}</span>
          <div class="small">冷静さ ${gauge(d.opponent.composure)}</div>
          ${!d.finished ? `<p class="tell">👀 相手の様子:${esc(d.tell)}</p>` : ''}
        </div>
      </div>`;

    // やりとりの記録(新しい順)
    const log = d.log
      .slice()
      .reverse()
      .map((r) => {
        const atkName = d.side === 'ask' ? meLabel : d.opponent.name;
        const defName = d.side === 'ask' ? d.opponent.name : meLabel;
        const atkCard = d.side === 'ask' ? r.mine : r.opp;
        const defCard = d.side === 'ask' ? r.opp : r.mine;
        const badge = r.delta > 0 ? `<span class="delta good">説得力 +${r.delta}</span>` : r.delta < 0 ? `<span class="delta bad">説得力 ${r.delta}</span>` : '<span class="delta">互角</span>';
        const gaffe = r.gaffe === 'me' ? '<p class="gaffe">💥 失言してしまった! 発言の切り抜きがSNSで拡散され始めた……</p>' : r.gaffe === 'opp' ? `<p class="gaffe good">💥 ${esc(d.opponent.name)}が失言! 議場がどよめいた</p>` : '';
        return `
          <li class="exchange">
            <div class="ex-head"><span class="muted small">${r.round}回目</span>${badge}</div>
            <p><b>${esc(atkName)}</b> <span class="card-tag">${CARDS()[atkCard].icon} ${esc(cardName(atkCard))}${d.side === 'ask' && r.strong ? '★' : ''}</span><br>「${esc(r.atkLine)}」</p>
            <p><b>${esc(defName)}</b> <span class="card-tag">${CARDS()[defCard].icon} ${esc(cardName(defCard))}${d.side === 'answer' && r.strong ? '★' : ''}</span><br>「${esc(r.defLine)}」</p>
            ${gaffe}
          </li>`;
      })
      .join('');

    let bottom;
    if (d.finished) {
      const R = d.result;
      const label = { win: '論戦に勝った', draw: '論戦は互角', lose: '論戦に負けた' }[R.outcome];
      bottom = `
        <section class="panel debate-result result-${R.outcome}">
          <h2>${label}</h2>
          <div class="newspaper">
            <span class="newspaper-kicker">翌朝の新聞</span>
            <p class="newspaper-head">${esc(R.headline)}</p>
          </div>
          <ul class="effect-list">${R.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
          <div class="setup-actions"><button class="btn btn-primary btn-lg" data-act="debate-close">戻る</button></div>
        </section>`;
    } else {
      const hand = d.hand
        .map((c, i) => {
          const info = CARDS()[c.id];
          const m = Game.Debate.matchups(c.id);
          return `
            <button class="action-btn debate-card ${c.strong ? 'strong' : ''}" data-card="${i}">
              <span class="action-icon">${info.icon}</span>
              <span class="action-body">
                <span class="action-name">${esc(info.name)}${c.strong ? ' <b class="star">★</b>' : ''} <span class="action-target">${info.time}分</span></span>
                <span class="action-desc">${esc(info.desc)}</span>
                <span class="action-cost">${[m.strong.length ? `強い:${m.strong.map(cardName).join('・')}` : '', m.weak.length ? `弱い:${m.weak.map(cardName).join('・')}` : ''].filter(Boolean).join(' / ')}</span>
              </span>
            </button>`;
        })
        .join('');
      bottom = `
        <section class="panel">
          <div class="panel-head"><h3>手札</h3><span class="muted small">山札 ${d.deck.length}枚・使った札 ${d.discard.length}枚</span></div>
          <div class="action-grid">${hand}</div>
          <details class="small"><summary>相性の早見表</summary>${matrixTable()}</details>
        </section>`;
    }

    app.innerHTML = `
      <div class="debate">
        <header class="hud" style="--pc:${party.color}">
          <div class="hud-title">
            <span class="hud-district">${esc(K.name)}${topic ? ` ・ ${esc(topic)}` : ''}</span>
            <span class="hud-name">⚔ ${esc(meLabel)} 対 ${esc(d.opponent.name)}</span>
          </div>
          <div class="hud-stats">
            <div class="stat"><span class="stat-label">持ち時間</span><span class="meter"><span class="meter-fill" style="width:${(Math.max(0, d.time) / d.timeMax) * 100}%"></span></span><span class="stat-num">残り${Math.max(0, d.time)}分</span></div>
          </div>
        </header>
        <section class="panel">${meter}${fighters}</section>
        ${bottom}
        ${log ? `<section class="panel"><h3>やりとり</h3><ul class="exchange-list">${log}</ul></section>` : ''}
      </div>`;

    app.querySelectorAll('[data-card]').forEach((b) => {
      b.onclick = () => {
        Game.Debate.play(st, +b.dataset.card);
        Game.commit();
      };
    });
    const cb = app.querySelector('[data-act="debate-close"]');
    if (cb) cb.onclick = () => {
      Game.Debate.close(st);
      Game.commit();
    };
  };

  // 任期・党首モードの画面に置く、論戦の手札の一覧
  UI.debateDeckPanel = function (st, side) {
    const list = Game.Debate.deckSummary(st, side)
      .map((c) => `<span class="policy-chip ${c.strong ? 'match' : ''}" title="${esc(CARDS()[c.id].desc)}">${CARDS()[c.id].icon} ${esc(cardName(c.id))}${c.strong ? '★' : ''}${c.count > 1 ? ' ×' + c.count : ''}</span>`)
      .join('');
    return `
      <section class="panel">
        <div class="panel-head"><h3>論戦の手札</h3><span class="muted small">${side === 'ask' ? '追及' : '答弁'}のカード ${Game.Debate.ensureDeck(st)[side].length}枚</span></div>
        <div class="policy-row">${list}</div>
        <p class="small muted">調査や政策の勉強会でカードが増え、★の強いカードが手に入る。</p>
      </section>`;
  };

  // 相性の早見表(追及側 × 答弁側。+ は追及側が押す)
  function matrixTable() {
    const M = DB().matrix;
    const defs = Object.keys(M.evidence);
    const head = defs.map((d) => `<th>${esc(cardName(d))}</th>`).join('');
    const rows = Object.keys(M)
      .map((a) => `<tr><th>${esc(cardName(a))}</th>${defs.map((d) => `<td class="num ${M[a][d] > 0 ? 'warn-text' : M[a][d] < 0 ? 'good-text' : ''}">${M[a][d] > 0 ? '+' : ''}${M[a][d]}</td>`).join('')}</tr>`)
      .join('');
    return `<table class="result-table matrix-table"><thead><tr><th>追及 \\ 答弁</th>${head}</tr></thead><tbody>${rows}</tbody></table>
      <p class="small muted">数字は追及する側の説得力の動き(+ は追及側、− は答弁側が有利)。★のカードは有利な動きが${DB().strongMult}倍。謝罪はどんな攻撃も止めるが、首相なら支持率が少し下がる。</p>`;
  }
})(Game.UI);
