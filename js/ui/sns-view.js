// SNSの画面部品:話題度・好感度のパネル、投稿の種類を選ぶ画面(選挙戦・任期・党首モードで共用)
window.Game = window.Game || {};
Game.UI = Game.UI || {};

(function (UI) {
  const esc = (s) => UI.esc(s);
  const SB = () => Game.Balance.sns;

  // 好感度のメーター:真ん中が0、左が批判的、右が好意的
  function favorMeter(v) {
    const max = SB().favorMax;
    const w = (Math.abs(v) / max) * 50;
    const left = v >= 0 ? 50 : 50 - w;
    return `<span class="favor-meter"><span class="${v >= 0 ? 'pos' : 'neg'}" style="left:${left}%;width:${w}%"></span><i></i></span>`;
  }

  // s: SNSの状態。opts.note: 補足の一文
  UI.snsPanel = function (s, opts) {
    if (!s) return '';
    opts = opts || {};
    const buzz = Math.round(s.buzz);
    const favor = Math.round(s.favor * 10) / 10;
    const trend = s.trend ? `<span class="trend-tag">#${esc(s.trend.word)}</span>${s.trend.serious ? '<span class="small muted">(まじめな話題)</span>' : ''}` : '<span class="muted small">—</span>';
    const pending = s.queue && s.queue.length ? `<p class="small warn-text">🔥 炎上が広がっている。次の${opts.unit || '朝'}に対応を決める。</p>` : '';
    const waiting = s.delayed && s.delayed.length ? '<p class="small muted">ファクトチェックの結果を待っている。</p>' : '';
    return `
      <section class="panel sns-panel">
        <div class="panel-head"><h3>SNS</h3><span class="muted small">投稿 ${s.posts || 0}回・炎上 ${s.flames || 0}回</span></div>
        <div class="sns-row"><span class="sns-label">話題度</span><span class="meter"><span class="meter-fill" style="width:${buzz}%"></span></span><span class="sns-val">${buzz}<small> ${esc(Game.Sns.buzzLabel(s.buzz))}</small></span></div>
        <div class="sns-row"><span class="sns-label">好感度</span>${favorMeter(s.favor)}<span class="sns-val ${favor > 0 ? 'good-text' : favor < 0 ? 'warn-text' : ''}">${favor > 0 ? '+' : ''}${favor}<small> ${esc(Game.Sns.favorLabel(s.favor))}</small></span></div>
        <div class="sns-row"><span class="sns-label">トレンド</span><span class="sns-trend">${trend}</span></div>
        ${pending}${waiting}
        <p class="small muted">${esc(opts.note || '話題度は知名度に、好感度は票につながる。若い世代と都市部に効きやすく、組織票にはほとんど影響しない。')}</p>
      </section>`;
  };

  // opts: { sns, pledges, pick: (type) => void, title }
  UI.openPostModal = function (opts) {
    const root = document.getElementById('modal-root');
    const s = opts.sns || Game.Sns.create(null);   // M9 より前のセーブで選挙戦の途中なら、SNS の状態がない
    const B = SB();
    const fitLabel = {
      sure: '<span class="fit-badge sure">公約どおり。トレンドに確実に乗れる</span>',
      fit: `<span class="fit-badge fit">トレンドに乗れる(${Math.round(B.trend.hitChance * 100)}%で拡散、外すと空振り)</span>`,
      risky: '<span class="fit-badge risky">まじめな話題にネタは不謹慎と取られやすい</span>',
    };
    const cards = Object.keys(Game.Data.SNS_POST_TYPES)
      .map((id) => {
        const t = Game.Data.SNS_POST_TYPES[id];
        const P = B.posts[id];
        const favor = P.favorMin !== undefined ? `${P.favorMin}〜+${P.favorMax}` : `+${P.favor}`;
        const fit = Game.Sns.trendFit(s, id, opts.pledges);
        const risk = P.flameChance ? `炎上 ${Math.round(P.flameChance * 100)}%` : '炎上ほぼなし';
        return `
          <button class="btn choice-btn post-card" data-post="${id}">
            <b>${t.icon} ${esc(t.name)} <span class="small muted">${esc(t.platform)}</span></b>
            <span class="small">${esc(t.desc)}</span>
            <span class="small muted">話題度 +${P.buzz} ・ 好感度 ${favor} ・ ${risk}</span>
            ${fit ? fitLabel[fit] : ''}
          </button>`;
      })
      .join('');
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal">
          <p class="modal-kicker">${esc(opts.title || 'SNS発信')}</p>
          <h2>どんな投稿をする?</h2>
          <p>今日のトレンド:${s.trend ? `<span class="trend-tag">#${esc(s.trend.word)}</span>` : '—'}</p>
          <div class="choices">${cards}</div>
          <div class="modal-actions"><button class="btn" data-act="close-post">やめる</button></div>
        </div>
      </div>`;
    root.querySelector('[data-act="close-post"]').onclick = () => (root.innerHTML = '');
    root.querySelectorAll('[data-post]').forEach((b) => {
      b.onclick = () => {
        root.innerHTML = '';
        opts.pick(b.dataset.post);
      };
    });
  };
})(Game.UI);
