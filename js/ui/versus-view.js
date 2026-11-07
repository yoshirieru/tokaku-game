// 対戦モードの画面(2人、1台の画面で交互に操作)。手番の切り替え画面で相手の選んだ行動を隠す
window.Game = window.Game || {};
Game.UI = Game.UI || {};

(function (UI) {
  const esc = (s) => UI.esc(s);
  const V = () => Game.Versus;
  const pname = (id) => Game.Leader.partyInfo(id).name;
  const chip = (id) => UI.partyChip(id);
  const VICTORY = {
    seats: { name: '総選挙1回の議席', desc: '最初の総選挙で、選挙前から議席を多く増やした人の勝ち(大きい党がそのまま勝たないように増減で比べる)。' },
    govern: { name: '政権を3年保つ', desc: '首相として通算3年(12ターン)を先に達成した人の勝ち。9年たっても決まらなければ在任の長いほう。2人とも小さい党だと、AIの第1党が政権を握り続けて引き分けになりやすい。' },
    legacy: { name: 'レガシー評価', desc: '6年間戦って、首相の在任・支持率・法案・議席・党首討論の勝ち・約束を守ったかで点数を比べる。' },
  };

  // ---------------- 対戦の準備 ----------------
  UI.renderVersusSetup = function (app) {
    const NEW = 'newparty';
    const parties = Object.values(Game.Data.PARTIES).filter((p) => p.playable);
    const pick = [
      { name: 'プレイヤー1', party: 'minsei' },
      { name: 'プレイヤー2', party: 'kyowa' },
    ];
    let victory = 'seats';
    let custom = { name: '新しい風の会', short: '新風', color: Game.Data.CUSTOM_COLORS[0], ideology: 'reform' };

    function draw() {
      const col = (i) => {
        const p = pick[i];
        const other = pick[1 - i].party;
        const cards = parties
          .concat([{ id: NEW, name: '新党', position: '議席5からのスタート(ハンデつき)', color: custom.color }])
          .map((x) => {
            const taken = x.id === other;
            return `<button class="party-card small-card ${x.id === p.party ? 'selected' : ''}" data-p="${i}" data-party="${x.id}" ${taken ? 'disabled' : ''} style="--pc:${x.color}">
              <span class="party-card-name">${esc(x.name)}</span><span class="party-card-pos">${esc(x.position)}</span></button>`;
          })
          .join('');
        return `
          <section class="setup-section vs-col">
            <h3 class="field-label">プレイヤー${i + 1}</h3>
            <input class="text-input" data-name="${i}" maxlength="12" value="${esc(p.name)}">
            <div class="party-cards vs-cards">${cards}</div>
            ${p.party === NEW ? `
              <div class="vs-newparty">
                <label class="small">党名 <input class="text-input" id="vs-np-name" maxlength="12" value="${esc(custom.name)}"></label>
                <label class="small">略称 <input class="text-input" id="vs-np-short" maxlength="3" value="${esc(custom.short)}"></label>
                <p class="small muted">ハンデ:初期資金 +${Game.Balance.versus.handicap.money}万円、SNSの「新しさ」の上乗せ。</p>
              </div>` : ''}
          </section>`;
      };
      const vic = Object.keys(VICTORY)
        .map((k) => `<button class="mode-pick ${victory === k ? 'on' : ''}" data-victory="${k}"><b>${esc(VICTORY[k].name)}</b><span class="small muted">${esc(VICTORY[k].desc)}</span></button>`)
        .join('');
      app.innerHTML = `
        <div class="setup-screen">
          <h2 class="screen-title">2人で対戦</h2>
          <p class="small muted">1台の画面を2人で交互に使います。自分の番では、相手に画面を見せないでください。毎日(毎ターン)それぞれが行動を選び、2人そろったら同時に公開します。同じブロックに遊説すると効果が打ち消し合い、1つの支援団体は1人にしか推薦を出しません。</p>
          <div class="vs-setup">${col(0)}${col(1)}</div>
          <section class="setup-section">
            <h3 class="field-label">勝利条件</h3>
            <div class="mode-picks vs-victory">${vic}</div>
          </section>
          <div class="setup-actions">
            <button class="btn" data-act="back">もどる</button>
            <button class="btn btn-primary btn-lg" data-act="start">対戦を始める</button>
          </div>
        </div>`;
      app.querySelectorAll('[data-name]').forEach((el) => (el.oninput = () => (pick[+el.dataset.name].name = el.value)));
      app.querySelectorAll('[data-party]').forEach((b) => {
        b.onclick = () => {
          pick[+b.dataset.p].party = b.dataset.party;
          draw();
        };
      });
      app.querySelectorAll('[data-victory]').forEach((b) => (b.onclick = () => { victory = b.dataset.victory; draw(); }));
      const nn = app.querySelector('#vs-np-name');
      if (nn) {
        nn.oninput = () => (custom.name = nn.value);
        app.querySelector('#vs-np-short').oninput = (e) => (custom.short = e.target.value);
      }
      app.querySelector('[data-act="back"]').onclick = () => Game.showScreen('title');
      app.querySelector('[data-act="start"]').onclick = () => {
        if (pick[0].party === pick[1].party) return alert('2人は別々の党を選んでください');
        if (pick.some((p) => p.party === NEW) && (!custom.name.trim() || !custom.short.trim())) return alert('党名と略称を入れてください');
        const players = pick.map((p, i) => {
          const isNew = p.party === NEW;
          const pledges = isNew ? Game.Data.IDEOLOGIES[custom.ideology].suggest.slice(0, Game.Balance.newParty.pledgeCount) : Game.Data.PARTY_PLATFORMS[p.party].slice(0, 2);
          return { name: p.name.trim() || `プレイヤー${i + 1}`, party: isNew ? null : p.party, pledges, custom: isNew ? Object.assign({}, custom) : null };
        });
        Game.startVersus({ players, victory });
      };
    }
    draw();
  };

  // ---------------- 対戦の画面 ----------------
  UI.renderVersus = function (app) {
    const st = Game.state;
    const v = st.versus;
    if (v.cover) return renderCover(app, st);
    const body = {
      vsPrep: prepView, vsPlan: planView, vsReveal: revealView, vsGovReveal: revealView, vsDebate: debateView,
      vsResult: resultView, vsFormation: formationView, vsGov: govView, vsEnd: endView,
    }[st.screen];
    app.innerHTML = `<div class="versus">${header(st)}${body(st)}${logPanel(st)}</div>`;
    bind(app, st);
  };

  function header(st) {
    const v = st.versus;
    const w = st.world;
    const cells = v.players
      .map((P, i) => `
        <div class="vs-player ${v.turnOf === i ? 'turn' : ''}" style="--pc:${Game.Leader.partyInfo(P.party).color}">
          <span class="small muted">プレイヤー${i + 1}</span>
          <b>${chip(P.party)} ${esc(P.name)}</b>
          <span class="small">${esc(pname(P.party))} ${V().seats(st, P.party)}議席${v.gov && v.gov.pm === i ? ' ・ <b>首相</b>' : v.gov && v.gov.partner === i ? ' ・ 連立与党' : ''}</span>
        </div>`)
      .join('<span class="vs-vs">VS</span>');
    const phase = st.campaign ? `総選挙 ${st.campaign.day}日目 / ${st.campaign.days}` : `${w.year}年 ${Game.Data.SESSIONS[w.turnIndex]} ・ 内閣支持率 ${Math.round(w.approval)}%`;
    return `
      <header class="vs-head">
        <div class="vs-players">${cells}</div>
        <div class="vs-meta small"><span>${esc(phase)}</span><span>勝利条件:${esc(VICTORY[v.victory].name)}</span><button class="btn btn-ghost small" data-act="menu">セーブしてタイトルへ</button></div>
      </header>`;
  }

  function renderCover(app, st) {
    const v = st.versus;
    const P = v.players[v.turnOf];
    const other = v.players[1 - v.turnOf];
    const what = st.screen === 'vsDebate' ? '党首討論のカードを選ぶ番' : st.screen === 'vsFormation' ? '政権づくりの番' : st.screen === 'vsPrep' ? '選挙協力を決める番' : '行動を選ぶ番';
    app.innerHTML = `
      <div class="vs-cover" style="--pc:${Game.Leader.partyInfo(P.party).color}">
        <p class="small">手番の交代</p>
        <h2>${esc(P.name)}さんの${what}です</h2>
        <p>${esc(other.name)}さんは画面を見ないでください。</p>
        <button class="btn btn-primary btn-lg" data-act="uncover">${esc(P.name)}です。始める</button>
      </div>`;
    app.querySelector('[data-act="uncover"]').onclick = () => {
      v.cover = false;
      if (st.screen === 'vsPlan' || st.screen === 'vsGov') V().beginTurn(st, v.turnOf);
      Game.commit();
    };
  }

  // 炎上の対応(その人の手番の最初)
  function flameBox(st, i) {
    const ev = st.versus.flames[i];
    if (!ev) return '';
    return `
      <section class="panel event-card">
        <span class="event-kicker">${esc(ev.kicker)}</span>
        <h4>${esc(ev.title)}</h4><p>${esc(ev.text)}</p>
        <div class="choices">${ev.choices.map((c) => `<button class="btn choice-btn" data-flame="${c.id}" ${c.disabled ? 'disabled' : ''}><b>${esc(c.label)}</b><span class="small muted">${esc(c.note)}</span></button>`).join('')}</div>
      </section>`;
  }

  // ---------------- 選挙前 ----------------
  function prepView(st) {
    const v = st.versus;
    const i = v.turnOf;
    const P = v.players[i];
    const opts = V().pactOptions(st, i)
      .map((o) => `<button class="btn choice-btn" data-pact="${o.id}" ${o.ok ? '' : 'disabled'}><b>${chip(o.id)} ${esc(o.name)}(${o.seats}議席)</b><span class="small muted">信用 ${o.trust}${o.ok ? '' : '(足りないので組んでくれない)'}</span></button>`)
      .join('');
    return `
      <section class="panel">
        <h3>${esc(P.name)}:総選挙の前に、AI政党と選挙協力を結ぶ?</h3>
        <p class="small muted">候補者を一本化して票を譲り合う。代わりに「選挙のあと、連立が必要なら組む」約束になり、破ると信用を失って組んでくれなくなる。2人が同じ党を選んだら、議席の多い党が選ばれる。</p>
        <div class="choices">${opts}<button class="btn choice-btn" data-pact=""><b>選挙協力はしない</b></button></div>
      </section>`;
  }

  // ---------------- 選挙戦(行動を選ぶ) ----------------
  function planView(st) {
    const v = st.versus;
    const i = v.turnOf;
    const camp = st.campaign;
    const cid = V().cidOf(st, i);
    const ch = V().campaignChoices(st, i);
    const P = ch.player;
    const B = Game.Balance.campaign;
    if (!st.ui.vsBlock) st.ui.vsBlock = Game.Data.BLOCKS[0].id;
    const proj = V().projection(st);
    const parties = camp.candidates.map((c) => c.party).sort((a, b) => proj[b].total - proj[a].total);
    const rows = parties
      .map((p) => `<tr class="${p === v.players[0].party || p === v.players[1].party ? 'me' : ''}"><th>${chip(p)} ${esc(pname(p))}</th><td class="num">${Math.round(camp.vsPoll.regions[st.ui.vsBlock][camp.candidates.find((c) => c.party === p).id] * 100)}%</td><td class="num"><b>${proj[p].total}</b></td></tr>`)
      .join('');
    const blockOpts = Game.Data.BLOCKS.map((b) => `<option value="${b.id}" ${b.id === st.ui.vsBlock ? 'selected' : ''}>${esc(b.name)}(小選挙区${b.smd}・比例${b.pr})</option>`).join('');
    const buttons = ch.actions
      .map((a) => {
        const costs = [];
        if (a.stamina) costs.push(`体力${a.stamina}`);
        if (a.money) costs.push(`${a.money}万円`);
        if (a.gain && a.id === 'fund') costs.push(`+${a.gain}万円`);
        const tgt = a.target === 'region' ? '→ 選んだブロック' : a.target === 'org' ? '→ 団体を選ぶ' : a.target === 'post' ? '→ 投稿を選ぶ' : '';
        return `<button class="action-btn" data-plan="${a.id}" ${a.enabled ? '' : 'disabled'} title="${esc(a.desc)}">
          <span class="action-icon">${a.icon}</span>
          <span class="action-body"><span class="action-name">${esc(a.name)} <span class="action-target">${tgt}</span></span>
          <span class="action-cost">${costs.join(' / ')}${!a.enabled && a.reason ? ` <em>${esc(a.reason)}</em>` : ''}</span></span></button>`;
      })
      .join('');
    const planned = v.plans[i].map((a, k) => `<li>${esc(V().actionLabel(a.aid, a.target))} <button class="btn btn-ghost small" data-unplan="${k}">取り消す</button></li>`).join('');
    const sns = camp.humanState[cid].sns;
    return `
      ${flameBox(st, i)}
      <div class="campaign-main">
        <div class="col-left">
          <section class="panel">
            <div class="panel-head"><h3>情勢と議席の見込み</h3><span class="muted small">${camp.vsPoll.polled ? '情勢調査(誤差小)' : '感触(誤差大)'}</span></div>
            <select class="text-input" data-block>${blockOpts}</select>
            <table class="result-table"><thead><tr><th>党</th><th>このブロックの得票率</th><th>議席の見込み</th></tr></thead><tbody>${rows}</tbody></table>
          </section>
          ${UI.snsPanel(sns)}
        </div>
        <div class="col-right">
          <section class="panel">
            <div class="panel-head"><h3>${esc(v.players[i].name)}の行動(${B.actionsPerDay}つまで)</h3><span class="small">資金 ${Math.round(P.money)}万円 ・ 体力 ${Math.round(P.stamina)}</span></div>
            <div class="action-grid">${buttons}</div>
            <ol class="vs-planned">${planned || '<li class="muted">まだ選んでいない</li>'}</ol>
            <div class="end-day"><button class="btn btn-primary btn-lg" data-act="submit-plan" ${v.flames[i] ? 'disabled' : ''}>決定して${i === 0 ? '次の人へ' : '公開する'}</button></div>
            <p class="small muted">選んだ行動は、2人そろってから同時に処理されます。同じブロックに2人とも遊説すると、どちらも効果が半分になります。</p>
          </section>
        </div>
      </div>`;
  }

  // ---------------- 公開 ----------------
  function revealView(st) {
    const v = st.versus;
    const R = v.reveal || { title: '', actions: [], lines: [] };
    const acts = [0, 1]
      .map((i) => {
        const list = R.actions.filter((a) => a.player === i).map((a) => `<li><b>${esc(a.label)}</b>${a.clash ? ' <span class="warn-text small">(ぶつかった)</span>' : ''}<br><span class="small">${esc(a.text)}</span></li>`).join('');
        return `<div class="vs-reveal-col" style="--pc:${Game.Leader.partyInfo(v.players[i].party).color}"><h4>${esc(v.players[i].name)}</h4><ul>${list || '<li class="muted">行動なし</li>'}</ul></div>`;
      })
      .join('');
    const lines = (R.lines || []).map((l) => `<p>${esc(l)}</p>`).join('');
    const camp = st.campaign;
    let next = '次へ';
    if (st.screen === 'vsReveal' && camp && camp.finished) next = '投票日へ';
    else if (st.screen === 'vsReveal' && camp && camp.day === Game.Balance.campaign.debateDay && !camp.vsDebated) next = '党首討論へ';
    else if (st.screen === 'vsGovReveal' && v.pendingDebate) next = '党首討論へ';
    return `
      <section class="panel">
        <h3>${esc(R.title)}(同時に公開)</h3>
        <div class="vs-reveal">${acts}</div>
        ${lines ? `<div class="vs-news">${lines}</div>` : ''}
        <div class="setup-actions"><button class="btn btn-primary btn-lg" data-act="after-reveal">${next}</button></div>
      </section>`;
  }

  // ---------------- 党首討論(2人) ----------------
  function debateView(st) {
    const v = st.versus;
    const d = v.debate;
    const B = Game.Balance.debate;
    const A = d.sides.ask;
    const N = d.sides.answer;
    const gauge = (x) => `<span class="meter wide"><span class="meter-fill ${x < B.gaffe.line ? 'low' : ''}" style="width:${x}%"></span></span>${Math.round(x)}`;
    const askColor = Game.Leader.partyInfo(v.players[A.player].party).color;
    const top = `
      <section class="panel">
        <div class="panel-head"><h3>⚔ 党首討論 ${d.topic ? '・ ' + esc(Game.Data.POLICIES[d.topic].name) : ''}</h3><span class="small">残り${Math.max(0, d.time)}分</span></div>
        <div class="tug">
          <span class="tug-name">${esc(A.name)}(追及)</span>
          <div class="tug-bar" style="--pc:${askColor}"><span class="tug-fill" style="width:${d.meter}%"></span><i class="tug-line" style="left:${B.loseLine}%"></i><i class="tug-line" style="left:${B.winLine}%"></i><b class="tug-mark" style="left:${d.meter}%">${Math.round(d.meter)}</b></div>
          <span class="tug-name">${esc(N.name)}(答弁)</span>
        </div>
        <div class="debate-sides"><div class="debate-side small">冷静さ ${gauge(A.composure)}</div><div class="debate-side small">冷静さ ${gauge(N.composure)}</div></div>
      </section>`;
    if (d.finished) {
      const R = d.result;
      const spread = v.spreadable.map((i) => `<button class="btn" data-spread="${i}">${esc(v.players[i].name)}:相手の失言をSNSで拡散する</button>`).join('');
      return `${top}
        <section class="panel debate-result">
          <div class="newspaper"><span class="newspaper-kicker">翌朝の新聞</span><p class="newspaper-head">${esc(R.headline)}</p></div>
          <ul class="effect-list">${(R.lines || []).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
          ${spread ? `<p class="small muted">失言の動画を拡散すると相手の好感度が下がるが、「揚げ足取り」と言われることもある。</p><div class="choices">${spread}</div>` : ''}
          <div class="setup-actions"><button class="btn btn-primary btn-lg" data-act="debate-close">つづける</button></div>
        </section>${exchanges(d)}`;
    }
    if (v.debateShow) {
      return `${top}${exchanges(d, 1)}<div class="setup-actions"><button class="btn btn-primary btn-lg" data-act="debate-next">次のやりとりへ</button></div>`;
    }
    const k = v.debateTurn;
    const side = d.sides[k];
    const hand = side.hand
      .map((c, idx) => {
        const info = Game.Data.DEBATE_CARDS[c.id];
        const m = Game.Debate.matchups(c.id);
        const nm = (id) => Game.Data.DEBATE_CARDS[id].name;
        return `<button class="action-btn debate-card ${c.strong ? 'strong' : ''}" data-dcard="${idx}"><span class="action-icon">${info.icon}</span><span class="action-body">
          <span class="action-name">${esc(info.name)}${c.strong ? ' <b class="star">★</b>' : ''} <span class="action-target">${info.time}分</span></span>
          <span class="action-desc">${esc(info.desc)}</span>
          <span class="action-cost">${[m.strong.length ? `強い:${m.strong.map(nm).join('・')}` : '', m.weak.length ? `弱い:${m.weak.map(nm).join('・')}` : ''].filter(Boolean).join(' / ')}</span></span></button>`;
      })
      .join('');
    return `${top}
      <section class="panel">
        <h3>${esc(side.name)}(${k === 'ask' ? '追及' : '答弁'})の手札</h3>
        <p class="small muted">相手の出すカードを読んで選ぶ。2人が選んだら同時に公開する。</p>
        <div class="action-grid">${hand}</div>
      </section>${exchanges(d)}`;
  }
  function exchanges(d, limit) {
    const C = Game.Data.DEBATE_CARDS;
    const list = d.log.slice().reverse().slice(0, limit || 99)
      .map((r) => `
        <li class="exchange">
          <div class="ex-head"><span class="muted small">${r.round}回目</span><span class="delta ${r.delta > 0 ? 'good' : r.delta < 0 ? 'bad' : ''}">追及側の説得力 ${r.delta > 0 ? '+' : ''}${r.delta}</span></div>
          <p><b>${esc(d.sides.ask.name)}</b> <span class="card-tag">${C[r.ask].icon} ${esc(C[r.ask].name)}${r.askStrong ? '★' : ''}</span><br>「${esc(r.atkLine)}」</p>
          <p><b>${esc(d.sides.answer.name)}</b> <span class="card-tag">${C[r.answer].icon} ${esc(C[r.answer].name)}${r.answerStrong ? '★' : ''}</span><br>「${esc(r.defLine)}」</p>
          ${r.gaffe ? `<p class="gaffe">💥 ${esc(d.sides[r.gaffe].name)}が失言! SNSで拡散され始めた</p>` : ''}
        </li>`)
      .join('');
    return list ? `<section class="panel"><h3>やりとり</h3><ul class="exchange-list">${list}</ul></section>` : '';
  }

  // ---------------- 選挙結果 ----------------
  function resultView(st) {
    const v = st.versus;
    const w = st.world;
    const ids = Object.keys(w.parties).filter((id) => w.parties[id].seats > 0).sort((a, b) => w.parties[b].seats - w.parties[a].seats);
    const total = Game.Data.HOUSE_SEATS;
    const bar = ids.map((id) => `<div class="seat-seg" style="flex:${w.parties[id].seats};background:${Game.Leader.partyInfo(id).color}" title="${esc(pname(id))} ${w.parties[id].seats}">${w.parties[id].seats >= 18 ? w.parties[id].seats : ''}</div>`).join('')
      + UI.seatFiller(ids.reduce((s, id) => s + w.parties[id].seats, 0), total);
    const L = v.lastElection;
    const mine = v.players.map((P, i) => `<li>${chip(P.party)} <b>${esc(P.name)}</b>:${L.after[i]}議席(選挙前 ${L.before[i]}、${L.after[i] - L.before[i] >= 0 ? '+' : ''}${L.after[i] - L.before[i]})</li>`).join('');
    return `
      <section class="panel">
        <h3>総選挙の結果</h3>
        <div class="house-bar"><div class="seat-bar">${bar}</div><i class="majority-line" style="left:${(Game.Data.MAJORITY / total) * 100}%"></i></div>
        <ul class="house-list">${ids.map((id) => `<li><span>${chip(id)} ${esc(pname(id))}</span><b>${w.parties[id].seats}</b></li>`).join('')}</ul>
        <ul class="vs-mine">${mine}</ul>
        <div class="setup-actions"><button class="btn btn-primary btn-lg" data-act="after-result">${v.victory === 'seats' ? '勝敗を見る' : '政権づくりへ'}</button></div>
      </section>`;
  }

  // ---------------- 政権づくり ----------------
  function formationView(st) {
    const v = st.versus;
    const f = v.formation;
    const i = v.turnOf;
    const P = v.players[i];
    const MAJ = Game.Data.MAJORITY;
    const notes = f.notes.map((n) => `<p class="small">${esc(n)}</p>`).join('');
    if (f.offer) {
      const from = v.players[f.offer.from];
      return `
        <section class="panel">
          <h3>${esc(from.name)}から連立の申し込み</h3>
          <p>首相は${esc(from.name)}。与党:${[from.party, P.party].concat(f.offer.ais).map((id) => esc(pname(id))).join('・')}(${f.offer.total}議席)。あなたの党は連立与党として政権に入る。</p>
          <div class="setup-actions"><button class="btn" data-answer="0">断る</button><button class="btn btn-primary" data-answer="1">受ける</button></div>
        </section>`;
    }
    const opts = V().formationOptions(st, i)
      .map((o) => `<label class="vs-ai ${o.willing ? '' : 'muted'}"><input type="checkbox" data-ai="${o.id}" ${o.willing ? '' : 'disabled'} ${(st.ui.vsAis || []).includes(o.id) ? 'checked' : ''}> ${chip(o.id)} ${esc(o.name)} ${o.seats}議席 <span class="small">信用 ${o.trust}${o.willing ? '' : '(組んでくれない)'}</span></label>`)
      .join('');
    const ais = (st.ui.vsAis || []).filter((id) => V().formationOptions(st, i).find((o) => o.id === id && o.willing));
    const mine = V().seats(st, P.party) + ais.reduce((s, id) => s + V().seats(st, id), 0);
    const withRival = mine + V().seats(st, v.players[1 - i].party);
    return `
      <section class="panel">
        <h3>${esc(P.name)}:どの党も過半数(${MAJ})に届かなかった。政権をつくる?</h3>
        ${notes}
        ${P.pact ? `<p class="small warn-text">${esc(pname(P.pact))}と選挙協力の約束がある。連立が要るのに外すと、信用を失う。</p>` : ''}
        <div class="vs-ais">${opts}</div>
        <p>選んだAI政党と合わせて <b>${mine}</b>議席(相手プレイヤーも入れると ${withRival}議席)</p>
        <div class="setup-actions">
          <button class="btn" data-propose="pass">見送る</button>
          <button class="btn" data-propose="rival" ${withRival >= MAJ ? '' : 'disabled'}>${esc(v.players[1 - i].name)}に連立を申し込む(首相は自分)</button>
          <button class="btn btn-primary" data-propose="ai" ${mine >= MAJ ? '' : 'disabled'}>AI政党と連立を組む</button>
        </div>
      </section>`;
  }

  // ---------------- 政権運営 ----------------
  function govView(st) {
    const v = st.versus;
    const i = v.turnOf;
    const P = v.players[i];
    const g = v.gov;
    const role = V().roleOf(st, i);
    const roleName = { pm: '首相', partner: '連立与党', opposition: '野党' }[role];
    const acts = V().govActions(st, i)
      .map((a) => `<button class="action-btn" data-gplan="${a.id}" ${a.enabled ? '' : 'disabled'} title="${esc(a.desc)}">
        <span class="action-icon">${a.icon}</span><span class="action-body"><span class="action-name">${esc(a.name)}${a.target === 'post' ? ' <span class="action-target">→ 投稿を選ぶ</span>' : a.target === 'ai' ? ' <span class="action-target">→ 相手を選ぶ</span>' : ''}</span>
        <span class="action-desc">${esc(a.desc)}</span><span class="action-cost">${a.money ? a.money + '万円' : ''}${a.gain ? `+${a.gain}万円` : ''}${!a.enabled && a.reason ? ` <em>${esc(a.reason)}</em>` : ''}</span></span></button>`)
      .join('');
    const planned = v.plans[i].map((a, k) => `<li>${esc(V().GOV_ACTIONS[a.aid].name)}${a.target ? '(' + esc(Game.Data.SNS_POST_TYPES[a.target] ? Game.Data.SNS_POST_TYPES[a.target].name : pname(a.target)) + ')' : ''} <button class="btn btn-ghost small" data-gunplan="${k}">取り消す</button></li>`).join('');
    const trust = Object.keys(P.trust).filter((id) => V().seats(st, id) > 0 && !v.players.some((x) => x.party === id)).map((id) => `<span class="policy-chip ${P.trust[id] < Game.Balance.versus.trust.min ? '' : 'match'}">${esc(pname(id))} ${Math.round(P.trust[id])}</span>`).join('');
    const pmName = g.pm !== null ? v.players[g.pm].name : `${pname(g.pmParty)}の党首(AI)`;
    const K = Game.Balance.versus.victory;
    const goal = v.victory === 'govern' ? `首相の在任:${v.players.map((x) => `${esc(x.name)} ${(x.stats.pmTurns / 4).toFixed(2)}年`).join(' / ')}(3年で勝ち)` : v.victory === 'legacy' ? `${K.legacyYears}年で決着(いま${V().yearsPlayed(st).toFixed(2)}年)` : '';
    return `
      ${flameBox(st, i)}
      <div class="campaign-main">
        <div class="col-left">
          <section class="panel">
            <h3>政権</h3>
            <p>首相:<b>${esc(pmName)}</b> ・ 与党:${g.coalition.map((id) => esc(pname(id))).join('・')}${g.minority ? ' <span class="warn-text">(少数与党)</span>' : ''}</p>
            <p>内閣支持率 <b>${Math.round(st.world.approval)}%</b> ・ 衆議院の任期 ${st.world.termElapsed}/${Game.Balance.term.termTurns}ターン</p>
            ${goal ? `<p class="small">${goal}</p>` : ''}
          </section>
          <section class="panel">
            <h3>${esc(P.name)}(${roleName})</h3>
            <p class="small">資金 ${Math.round(P.money)}万円 ・ 党の支持率 ${V().supportOf(st, i).toFixed(1)}% ${P.pact ? `・ 選挙協力:${esc(pname(P.pact))}` : ''}</p>
            <div class="policy-row"><span class="small muted">AI政党からの信用</span>${trust}</div>
          </section>
          ${UI.snsPanel(P.sns, { unit: 'ターン' })}
          ${UI.debateDeckPanel({ debateDeck: P.deck }, role === 'pm' ? 'answer' : 'ask')}
        </div>
        <div class="col-right">
          <section class="panel">
            <div class="panel-head"><h3>行動(2つまで)</h3></div>
            <div class="action-grid">${acts}</div>
            <ol class="vs-planned">${planned || '<li class="muted">まだ選んでいない</li>'}</ol>
            <div class="end-day"><button class="btn btn-primary btn-lg" data-act="submit-gov" ${v.flames[i] ? 'disabled' : ''}>決定して${i === 0 ? '次の人へ' : '公開する'}</button></div>
          </section>
        </div>
      </div>`;
  }

  // ---------------- 決着 ----------------
  function endView(st) {
    const v = st.versus;
    const title = v.winner === null ? '引き分け' : `${v.players[v.winner].name}の勝ち!`;
    const cols = v.players
      .map((P, i) => {
        const s = v.scores[i];
        const body = s.items
          ? `<table class="result-table legacy-table"><tbody>${s.items.map((it) => `<tr class="${it.points < 0 ? 'minus' : ''}"><th>${esc(it.label)}</th><td>${esc(it.value)}</td><td class="num">${it.points > 0 ? '+' : ''}${it.points}</td></tr>`).join('')}</tbody><tfoot><tr><th colspan="2">合計</th><td class="num"><b>${s.total}</b></td></tr></tfoot></table>`
          : `<p>${esc(s.label)}:<b>${esc(String(s.value))}</b>${s.seats !== undefined ? `(${s.seats}議席)` : ''}</p>`;
        return `<div class="vs-reveal-col ${v.winner === i ? 'winner' : ''}" style="--pc:${Game.Leader.partyInfo(P.party).color}"><h4>${chip(P.party)} ${esc(P.name)}</h4>${body}</div>`;
      })
      .join('');
    return `
      <section class="panel ending-hero">
        <p class="modal-kicker">勝利条件:${esc(VICTORY[v.victory].name)}</p>
        <h2 class="ending-title">${esc(title)}</h2>
        <div class="vs-reveal">${cols}</div>
        <div class="setup-actions"><button class="btn" data-act="title">タイトルへ</button><button class="btn btn-primary btn-lg" data-act="again">もう一度対戦</button></div>
      </section>`;
  }

  function logPanel(st) {
    const items = st.versus.log.slice(-12).reverse().map((l) => `<li><span class="log-day">${esc(l.when)}</span>${esc(l.text)}</li>`).join('');
    return `<section class="panel log-panel"><h3 class="small">これまでの流れ</h3><ul class="log-list">${items}</ul></section>`;
  }

  // ---------------- 操作 ----------------
  function bind(app, st) {
    const v = st.versus;
    const i = v.turnOf;
    const on = (sel, fn) => app.querySelectorAll(sel).forEach((el) => (el.onclick = () => fn(el)));
    const say = (r) => { if (r && r.ok === false) alert(r.text); };
    on('[data-act="menu"]', () => { Game.save(); Game.showScreen('title'); });
    on('[data-flame]', (b) => { V().resolveFlame(st, i, b.dataset.flame); Game.commit(); });
    on('[data-pact]', (b) => { V().submitPrep(st, i, b.dataset.pact || null); Game.commit(); });
    const blk = app.querySelector('[data-block]');
    if (blk) blk.onchange = () => { st.ui.vsBlock = blk.value; Game.commit(); };
    on('[data-plan]', (b) => {
      const aid = b.dataset.plan;
      const A = Game.Campaign.ACTIONS[aid];
      const run = (target) => { say(V().addPlan(st, i, aid, target)); Game.commit(); };
      const camp = st.campaign;
      if (A.target === 'org') { Game.Campaign.activate(camp, V().cidOf(st, i)); UI.openOrgModal({ camp, pick: run }); }
      else if (A.target === 'post') UI.openPostModal({ sns: camp.humanState[V().cidOf(st, i)].sns, pledges: v.players[i].pledges, pick: run });
      else run(A.target === 'region' ? st.ui.vsBlock : null);
    });
    on('[data-unplan]', (b) => { V().removePlan(st, i, +b.dataset.unplan); Game.commit(); });
    on('[data-act="submit-plan"]', () => {
      if (v.plans[i].length < Game.Balance.campaign.actionsPerDay && !confirm('行動が残っています。決定しますか?')) return;
      V().submitPlan(st, i);
      Game.commit();
    });
    on('[data-act="after-reveal"]', () => {
      if (st.screen === 'vsGovReveal') { V().afterGovReveal(st); return Game.commit(); }
      const r = V().afterReveal(st);
      if (r === 'election') return Game.startElection();
      Game.commit();
    });
    on('[data-dcard]', (b) => { V().debateChoose(st, +b.dataset.dcard); Game.commit(); });
    on('[data-act="debate-next"]', () => { V().debateNext(st); Game.commit(); });
    on('[data-spread]', (b) => { const t = V().spread(st, +b.dataset.spread); if (t) alert(t); Game.commit(); });
    on('[data-act="debate-close"]', () => { V().closeDebate(st); Game.commit(); });
    on('[data-act="after-result"]', () => { V().afterResult(st); Game.commit(); });
    app.querySelectorAll('[data-ai]').forEach((el) => {
      el.onchange = () => {
        st.ui.vsAis = [...app.querySelectorAll('[data-ai]:checked')].map((x) => x.dataset.ai);
        Game.commit();
      };
    });
    on('[data-propose]', (b) => {
      const r = V().propose(st, i, b.dataset.propose, st.ui.vsAis || []);
      st.ui.vsAis = [];
      say(r);
      Game.commit();
    });
    on('[data-answer]', (b) => { V().answerOffer(st, b.dataset.answer === '1'); Game.commit(); });
    on('[data-gplan]', (b) => {
      const aid = b.dataset.gplan;
      const A = V().GOV_ACTIONS[aid];
      const run = (target) => { say(V().addGovPlan(st, i, aid, target)); Game.commit(); };
      if (A.target === 'post') UI.openPostModal({ sns: v.players[i].sns, pledges: v.players[i].pledges, pick: run });
      else if (A.target === 'ai') openAiPick(st, run);
      else run(null);
    });
    on('[data-gunplan]', (b) => { v.plans[i].splice(+b.dataset.gunplan, 1); Game.commit(); });
    on('[data-act="submit-gov"]', () => {
      if (v.plans[i].length < 2 && !confirm('行動が残っています。決定しますか?')) return;
      V().submitGov(st, i);
      Game.commit();
    });
    on('[data-act="title"]', () => Game.showScreen('title'));
    on('[data-act="again"]', () => Game.showScreen('versusSetup'));
  }

  function openAiPick(st, run) {
    const root = document.getElementById('modal-root');
    const i = st.versus.turnOf;
    const opts = Game.Versus.pactOptions(st, i)
      .map((o) => `<button class="btn choice-btn" data-pick-ai="${o.id}" ${o.ok ? '' : 'disabled'}><b>${chip(o.id)} ${esc(o.name)}(${o.seats}議席)</b><span class="small muted">信用 ${o.trust}</span></button>`)
      .join('');
    root.innerHTML = `<div class="modal-backdrop"><div class="modal"><h2>どの党と選挙協力を約束する?</h2><div class="choices">${opts}</div><div class="modal-actions"><button class="btn" data-act="close-ai">やめる</button></div></div></div>`;
    root.querySelector('[data-act="close-ai"]').onclick = () => (root.innerHTML = '');
    root.querySelectorAll('[data-pick-ai]').forEach((b) => (b.onclick = () => { root.innerHTML = ''; run(b.dataset.pickAi); }));
  }
})(Game.UI);
