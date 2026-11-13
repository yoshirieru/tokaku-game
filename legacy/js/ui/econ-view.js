// 経済と暮らしのパネル(M14)。議員任期と党首モードの画面に出す。
// 5つの指標(値・前のターンからの動き・最近の流れ)、これから効いてくる政策、内閣支持率への響き。
window.Game = window.Game || {};
Game.UI = Game.UI || {};

(function (UI) {
  const esc = (s) => UI.esc(s);
  const E = () => Game.Economy;

  // 最近の流れ(小さな折れ線)
  function spark(hist, k) {
    const vals = hist.map((h) => h[k]);
    if (vals.length < 2) return '';
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min || 1;
    const pts = vals.map((v, i) => `${((i / (vals.length - 1)) * 60).toFixed(1)},${(16 - ((v - min) / span) * 14 - 1).toFixed(1)}`).join(' ');
    return `<svg class="econ-spark" viewBox="0 0 60 16" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}"/></svg>`;
  }

  // 効果の向きを矢印で(物価は上がるほうが悪い)
  UI.econEffectChips = function (effects) {
    return effects
      .map((f) => {
        const unit = f.k === 'growth' || f.k === 'prices' ? 0.4 : 4;
        const n = Math.max(1, Math.min(3, Math.round(f.size / unit)));
        const good = f.k === 'prices' ? !f.up : f.up;
        return `<span class="econ-chip ${good ? 'good' : 'bad'}">${esc(E().LABEL[f.k])}${(f.up ? '↑' : '↓').repeat(n)}</span>`;
      })
      .join('');
  };
  // 法案を選ぶ画面に出す、政策の効果のあらまし
  UI.econPreview = function (policy) {
    const pv = E().preview(policy);
    if (!pv.length) return '';
    const later = pv.filter((f) => f.delay >= 3).map((f) => E().LABEL[f.k]);
    return `<span class="econ-preview">${UI.econEffectChips(pv)}${later.length ? `<span class="small muted">(${esc(later.join('・'))}は${Math.min(...pv.filter((f) => f.delay >= 3).map((f) => f.delay))}ターン後から)</span>` : ''}</span>`;
  };

  UI.econPanel = function (st) {
    const e = E().ensure(st);
    if (!e) return '';
    const mood = E().mood(st);
    const cards = E().KEYS.map((k) => {
      const [word, cls] = E().status(st, k);
      const d = e[k] - (e.prev[k] ?? e[k]);
      const unit = k === 'growth' || k === 'prices' ? 0.05 : 0.5;
      const arrow = Math.abs(d) < unit ? '' : d > 0 ? '▲' : '▼';
      const arrowGood = k === 'prices' ? d < 0 : d > 0;
      return `
        <div class="econ-card">
          <span class="econ-label">${esc(E().LABEL[k])}</span>
          <b class="econ-val">${esc(E().format(k, e[k]))}${arrow ? `<small class="${arrowGood ? 'good-text' : 'warn-text'}">${arrow}</small>` : ''}</b>
          <span class="econ-word ${cls === 'good' ? 'good-text' : cls === 'bad' ? 'warn-text' : 'muted'}">${esc(word)}</span>
          ${spark(e.history, k)}
        </div>`;
    }).join('');
    const up = E().upcoming(st).sort((a, b) => a.wait - b.wait).slice(0, 5);
    const rows = up.map((u) => {
      const effects = Object.keys(u.effects).map((k) => ({ k, up: u.effects[k] > 0, size: Math.abs(u.effects[k]) }));
      const when = u.wait > 0 ? `あと${u.wait}ターンで効きはじめる` : `効いている(あと${u.left}ターン)`;
      const who = u.by === 'ai' ? '政府' : u.by === 'member' ? 'あなたの議員立法' : 'あなたの政権';
      return `<li><span class="econ-up-name">${esc(u.label)}<small class="muted"> ・ ${esc(who)}</small></span><span>${UI.econEffectChips(effects)}</span><span class="small muted">${esc(when)}</span></li>`;
    }).join('');
    const shift = E().approvalShift(st);
    return `
      <section class="panel econ-panel">
        <div class="panel-head">
          <h3>経済と暮らし</h3>
          <span class="small ${shift >= 1 ? 'good-text' : shift <= -1 ? 'warn-text' : 'muted'}">世の中の気分:内閣支持率に ${shift >= 0 ? '+' : ''}${shift.toFixed(1)}</span>
        </div>
        <div class="econ-cards">${cards}</div>
        <h4 class="econ-sub">これから効いてくる政策</h4>
        ${rows ? `<ul class="econ-up">${rows}</ul>` : '<p class="small muted">いま効きはじめを待っている政策はない。</p>'}
        <p class="small muted">法案は成立してすぐには効かない。減税や給付はすぐ景気や暮らしに効くが、財政のつけはあとまで残る。指標は内閣支持率と、選挙での与党の追い風・逆風になる。</p>
      </section>`;
  };
})(Game.UI);
