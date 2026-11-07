// 開票特番(小選挙区 → 比例)と、選挙結果の画面
window.Game = window.Game || {};
Game.UI = Game.UI || {};

(function (UI) {
  const esc = (s) => UI.esc(s);
  const STEP_MS = 1700;     // 開票速報の自動送り
  const TWEEN_MS = 900;     // 票数が増えるアニメーション
  let timer = null;
  let prevCounts = null;

  function stopTimer() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function anyPartyColor(id) {
    const p = Game.Data.PARTIES[id] || Game.Data.MINOR_PARTIES[id];
    return p ? p.color : '#999';
  }
  function anyPartyName(id) {
    const p = Game.Data.PARTIES[id] || Game.Data.MINOR_PARTIES[id];
    return p ? p.name : id;
  }

  // ---------------- 開票特番 ----------------
  UI.renderCount = function (app) {
    stopTimer();
    const st = Game.state;
    const el = st.election;
    if (el.kind === 'national') return UI.renderNationalCount(app);   // 全国の開票(national-view.js)
    const camp = st.campaign;
    if (st.ui.countPhase === 'pr') return renderPr(app);

    const steps = el.timeline.steps;
    const i = Math.min(st.ui.countStep || 0, steps.length - 1);
    const step = steps[i];
    const last = i === steps.length - 1;
    // 並びは開票中ずっと同じ:現職 → 元職 → 新人(テレビの開票速報と同じ。結果が並びで分からないように)
    const cands = UI.byRole(camp.candidates);
    const maxCount = Math.max(1, ...Object.values(step.counted));

    const rows = cands
      .map((c) => {
        const p = UI.party(c.party);
        const called = step.called === c.id;
        const retracted = step.retracted === c.id;
        const w = ((step.counted[c.id] / Math.max(maxCount, el.total[el.winner])) * 100).toFixed(1);
        return `
          <li class="tv-row ${c.isPlayer ? 'me' : ''} ${called ? 'called' : ''} ${retracted ? 'retracted' : ''}" style="--pc:${p.color}">
            <span class="tv-party">${esc(p.short)}</span>
            <span class="tv-name">${esc(c.name)}${c.isPlayer ? `<span class="you">${camp.sub && camp.sub.proxy ? '応援' : 'あなた'}</span>` : ''}<small>${UI.ROLE_LABEL[c.role] || ''}</small></span>
            <span class="tv-bar"><span style="width:${w}%"></span></span>
            <span class="tv-votes" data-votes="${c.id}">${UI.formatVotes(step.counted[c.id])}</span>
            ${called ? '<span class="tv-stamp">当選確実</span>' : retracted ? '<span class="tv-stamp retract">当確取り消し</span>' : ''}
          </li>`;
      })
      .join('');

    const regionCells = camp.regionList
      .map((r) => {
        const f = step.regionFraction[r.id];
        let lead = null;
        let lv = -1;
        for (const c of camp.candidates) {
          const v = el.regions[r.id].votes[c.id] * f;
          if (v > lv) { lv = v; lead = c; }
        }
        const color = f > 0 ? UI.party(lead.party).color : 'transparent';
        return `<div class="tv-region" style="--lc:${color}"><span>${esc(r.name)}</span><b>${Math.round(f * 100)}%</b></div>`;
      })
      .join('');

    app.innerHTML = `
      <div class="tv">
        <header class="tv-head">
          <div class="tv-title"><span class="tv-live">LIVE</span> ${camp.sub ? '開票速報' : '衆院選 開票速報'} <b>${esc(camp.sub ? camp.sub.title : Game.Data.DISTRICT_NAME)}</b></div>
          <div class="tv-clock">${esc(step.time)}</div>
        </header>
        <div class="tv-body">
          <div class="tv-progress">
            <span>開票率</span>
            <span class="tv-progress-bar"><span style="width:${(step.fraction * 100).toFixed(1)}%"></span></span>
            <b>${Math.round(step.fraction * 100)}%</b>
          </div>
          <ul class="tv-rows">${rows}</ul>
          <div class="tv-regions">${regionCells}</div>
          <div class="tv-ticker">${esc(commentary(el, camp, i))}</div>
          <div class="tv-meta small">投票日の天気:${esc(el.weather.label)}${last ? ` ・ 投票率 ${(el.turnoutRate * 100).toFixed(1)}%` : ''}</div>
        </div>
        <div class="tv-controls">
          ${last && camp.sub
            ? '<button class="btn btn-primary btn-lg" data-act="sub-done">結果を受けて戻る</button>'
            : last
            ? `<button class="btn btn-primary btn-lg" data-act="to-pr">比例代表の開票へ(${esc(el.timeline.prTime)})</button>`
            : `<button class="btn" data-act="skip">最後までとばす</button><button class="btn btn-primary" data-act="next">次へ</button>`}
        </div>
      </div>`;

    tweenVotes(app, prevCounts, step.counted);
    prevCounts = step.counted;

    const next = () => {
      st.ui.countStep = i + 1;
      Game.commit();
    };
    const nb = app.querySelector('[data-act="next"]');
    if (nb) nb.onclick = next;
    const sb = app.querySelector('[data-act="skip"]');
    if (sb) sb.onclick = () => {
      st.ui.countStep = steps.length - 1;
      Game.commit();
    };
    const db = app.querySelector('[data-act="sub-done"]');
    if (db) db.onclick = () => { prevCounts = null; Game.finishElection(); };   // 補選・首長選(local.js)
    const pb = app.querySelector('[data-act="to-pr"]');
    if (pb) pb.onclick = () => {
      prevCounts = null;
      st.ui.countPhase = 'pr';
      Game.commit();
    };
    if (!last) timer = setTimeout(next, step.newCall || step.retracted ? STEP_MS * 1.8 : STEP_MS);
  };

  function tweenVotes(app, from, to) {
    if (!from) return;
    const els = app.querySelectorAll('[data-votes]');
    const t0 = performance.now();
    function frame(now) {
      const k = Math.max(0, Math.min(1, (now - t0) / TWEEN_MS));   // 最初のフレームは t0 より前の時刻のことがある
      const e = 1 - Math.pow(1 - k, 3);
      els.forEach((node) => {
        const id = node.dataset.votes;
        const a = from[id] || 0;
        node.textContent = UI.formatVotes(a + (to[id] - a) * e);
      });
      if (k < 1 && document.body.contains(els[0])) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function nameOf(camp, cid) {
    const c = camp.candidates.find((x) => x.id === cid);
    if (c.isPlayer && camp.sub && camp.sub.proxy) return `応援する${c.name}氏`;
    return c.isPlayer ? `${c.name}(あなた)` : `${c.name}氏`;
  }

  function commentary(el, camp, i) {
    const step = el.timeline.steps[i];
    const pid = camp.player.id;
    if (i === 0) {
      const ep = el.timeline.exitPoll;
      if (ep.label === 'call') {
        return el.winner === pid
          ? `午後8時、投票が締め切られると同時に「当選確実」。${nameOf(camp, el.winner)}が出口調査で大きくリード。事務所が歓声に包まれた!`
          : `午後8時と同時に${nameOf(camp, el.winner)}に当選確実が出た。事務所に重い沈黙が流れる……。`;
      }
      if (ep.label === 'lead') return `投票が締め切られた。出口調査では${nameOf(camp, ep.leader)}がややリードしている。`;
      return '投票が締め切られた。出口調査では候補者が横一線。長い夜になりそうだ。';
    }
    if (step.retracted) {
      const back = step.newCall ? `改めて${nameOf(camp, step.called)}に当選確実が出た。` : '';
      if (step.retracted === pid) return `速報です。あなたに出ていた当選確実が取り消された!事務所が凍りつく……。${back}`;
      return `速報です。${nameOf(camp, step.retracted)}の当選確実が取り消された!${step.newCall && step.called === pid ? ` そして、${nameOf(camp, pid)}に当選確実!事務所が歓声に包まれた!` : back || 'まだ勝負は分からない。'}`;
    }
    if (step.newCall) {
      if (step.called !== el.winner && step.called !== pid) return `${nameOf(camp, step.called)}に当選確実が出た。……だが、票差はまだわずかだ。`;
      return step.called === pid
        ? `${nameOf(camp, pid)}に当選確実!事務所に万歳の声が響く。支援者と握手を交わした。`
        : camp.sub ? `${nameOf(camp, step.called)}に当選確実。事務所に重い空気が流れる……。` : `${nameOf(camp, step.called)}に当選確実。あなたの小選挙区での当選はなくなった。比例復活に望みをつなぐ。`;
    }
    if (step.called) {
      return step.called === pid ? '当確の喜びが冷めないまま、残りの票の集計が続く。' : camp.sub ? '残りの票の集計が続く。' : '比例代表の結果を待つ。惜敗率が勝負を分ける。';
    }
    const ranked = Object.keys(step.counted).sort((a, b) => step.counted[b] - step.counted[a]);
    const gap = step.counted[ranked[0]] - step.counted[ranked[1]];
    if (step.fraction < 0.05) return '開票が始まった。まだ票は少ない。';
    if (gap <= 2000) return `${nameOf(camp, ranked[0])}と${nameOf(camp, ranked[1])}が激しく競り合っている。`;
    return `${nameOf(camp, ranked[0])}が先行している。`;
  }

  // ---------------- 比例代表 ----------------
  function renderPr(app) {
    const st = Game.state;
    const el = st.election;
    const camp = st.campaign;
    const pr = el.pr;
    const me = camp.candidates.find((c) => c.isPlayer);
    const order = Object.keys(pr.seats).sort((a, b) => pr.shares[b] - pr.shares[a]);

    const seatBar = order
      .filter((p) => pr.seats[p] > 0)
      .map((p) => `<div class="seat-seg" style="flex:${pr.seats[p]};background:${anyPartyColor(p)}" title="${esc(anyPartyName(p))}">${pr.seats[p]}</div>`)
      .join('');
    const partyRows = order
      .map((p) => `<tr><th><span class="dot" style="background:${anyPartyColor(p)}"></span>${esc(anyPartyName(p))}</th><td class="num">${UI.pct(pr.shares[p])}</td><td class="num"><b>${pr.seats[p]}</b>議席</td></tr>`)
      .join('');

    // 政党要件のない新党は比例に名簿を出していない
    const list = pr.lists[me.party] || [];
    const listRows = list
      .map((e) => {
        let status;
        if (e.type === 'solo') status = e.elected ? '<span class="tag win">当選</span>' : '<span class="tag">落選</span>';
        else if (e.wonSmd) status = '<span class="tag smd">小選挙区で当選</span>';
        else if (e.depositLost) status = '<span class="tag">供託金没収</span>';
        else status = e.elected ? '<span class="tag win">比例復活</span>' : '<span class="tag">落選</span>';
        const ratio = e.type === 'dup' && !e.wonSmd ? UI.pct(e.ratio) : '—';
        return `<tr class="${e.isPlayer ? 'me' : ''} ${e.elected ? 'elected' : ''}"><td class="num">${e.rank}</td><td>${esc(e.name)}${e.isPlayer ? '<span class="you">あなた</span>' : ''}</td><td>${e.district ? esc(e.district) : '比例単独'}</td><td class="num">${ratio}</td><td>${status}</td></tr>`;
      })
      .join('');
    const line = pr.lines[me.party];
    const r = el.player.result;
    const pe = list.find((e) => e.isPlayer);
    let verdict;
    if (!pe && r !== 'smd') verdict = '政党要件がなく比例と重複立候補していないため、比例復活はない。';
    else if (r === 'smd') verdict = '小選挙区で当選しているため、比例名簿からは外れた。';
    else if (r === 'pr') verdict = `惜敗率 ${UI.pct(el.player.ratio)} で、${esc(pr.block)}で比例復活!`;
    else if (pe.depositLost) verdict = '得票が有効投票の1割に届かず供託金没収。比例復活の資格を失った。';
    else verdict = `惜敗率 ${UI.pct(el.player.ratio)}。比例復活には届かなかった。`;

    app.innerHTML = `
      <div class="tv">
        <header class="tv-head">
          <div class="tv-title"><span class="tv-live">LIVE</span> 比例代表 <b>${esc(pr.block)}</b>(定数${pr.totalSeats})</div>
          <div class="tv-clock">${esc(el.timeline.prTime)}</div>
        </header>
        <div class="tv-body light">
          <div class="seat-bar">${seatBar}</div>
          <table class="result-table compact"><tbody>${partyRows}</tbody></table>
          ${list.length ? `
          <h3 class="list-title">${esc(UI.party(me.party).name)}の名簿 <span class="muted small">${pr.seats[me.party]}議席 ・ 復活ライン ${line ? '惜敗率 ' + UI.pct(line) : 'なし'}</span></h3>
          <p class="small muted">重複立候補の候補は同じ順位に並び、小選挙区で負けた人の中から惜敗率(自分の得票 ÷ 当選者の得票)の高い順に当選する。</p>
          <div class="list-wrap">
            <table class="result-table list-table">
              <thead><tr><th>順位</th><th>候補者</th><th>選挙区</th><th>惜敗率</th><th>結果</th></tr></thead>
              <tbody>${listRows}</tbody>
            </table>
          </div>` : `<p class="small muted">${esc(UI.party(me.party).name)}は政党要件がないため、このブロックの比例代表には名簿を出していない。</p>`}
          ${transferNote(camp, pr)}
          <div class="verdict verdict-${r}">${verdict}</div>
        </div>
        <div class="tv-controls">
          <button class="btn btn-primary btn-lg" data-act="result">選挙結果へ</button>
        </div>
      </div>`;
    // 自分の行が見えるようにする
    const meRow = app.querySelector('.list-table tr.me');
    const wrap = app.querySelector('.list-wrap');
    if (meRow && wrap) wrap.scrollTop = Math.max(0, meRow.offsetTop - wrap.clientHeight / 2);
    app.querySelector('[data-act="result"]').onclick = () => Game.finishElection();
  }

  // 比例票の融通(創価学会の推薦 → 公明党)
  function transferNote(camp, pr) {
    if (!pr.transfers || !pr.transfers.length) return '';
    return pr.transfers
      .map((t) => {
        const org = Object.values(Game.Data.ORGANIZATIONS).find((o) => o.party === t.to);
        return `<p class="small muted">比例票の融通:${esc(org ? org.name : '')}の推薦を受けた${esc(anyPartyName(t.from))}の候補の地盤から、比例票の一部(${Math.round(t.rate * 100)}%)が${esc(anyPartyName(t.to))}に回った。</p>`;
      })
      .join('');
  }

  // 推薦団体と約束(任期中の見返りは M4)
  function supportSummary(camp) {
    if (!camp.support) return '';
    const pid = camp.player.id;
    const ORGS = Game.Data.ORGANIZATIONS;
    const endorsed = Game.Support.endorsedOrgs(camp, pid).map((id) => ORGS[id].name);
    const promises = camp.support.promises.map((pr) => `<li>${esc(ORGS[pr.org].name)}:「${esc(Game.Data.POLICIES[pr.policy].name)}」(${pr.day}日目に約束)</li>`).join('');
    return `
      <section class="panel support-summary">
        <h3>支援団体</h3>
        <p>推薦:${endorsed.length ? esc(endorsed.join('・')) : 'なし'}</p>
        ${promises ? `<p class="small muted">団体との約束(任期中の要望に応えないと関係度が下がり、次の推薦が取り消される)</p><ul class="promise-list">${promises}</ul>` : ''}
      </section>`;
  }

  // ---------------- 選挙結果 ----------------
  UI.renderResult = function (app) {
    stopTimer();
    const st = Game.state;
    const el = st.election;
    if (el.kind === 'national') return UI.renderNationalResult(app);
    const camp = st.campaign;
    const me = camp.candidates.find((c) => c.isPlayer);
    const P = el.player;
    const winner = camp.candidates.find((c) => c.id === el.winner);

    const head = {
      smd: { title: '当選!', cls: 'win', text: `${Game.Data.DISTRICT_NAME}で初当選。事務所に万歳三唱が響き、だるまに目が入った。` },
      pr: { title: '比例復活で当選', cls: 'pr', text: `小選挙区では${winner.name}氏に敗れたが、惜敗率 ${UI.pct(P.ratio)} で${el.pr.block}から復活当選。党内の評価は少し低めのスタートになる。` },
      lost: { title: '落選', cls: 'lost', text: `${winner.name}氏に${UI.formatVotes(el.total[el.winner] - P.votes)}票及ばなかった。${P.depositLost ? '得票が1割に届かず、供託金は没収された。' : '比例復活にも届かなかった。'}次の選挙に向けて浪人生活が始まる。` },
    }[P.result];

    const others = camp.candidates
      .filter((c) => !c.isPlayer)
      .map((c) => {
        const r = el.winner === c.id ? '小選挙区で当選' : el.pr.revived[c.id] ? '比例で復活当選' : el.depositLost[c.id] ? '落選(供託金没収)' : '落選';
        return `<li>${UI.partyChip(c.party)} ${esc(c.name)}氏:${r}</li>`;
      })
      .join('');

    const heads = camp.candidates.map((c) => `<th class="num" style="color:${UI.party(c.party).color}">${esc(c.name)}</th>`).join('');
    const rows = camp.regionList
      .map((r) => {
        const R = el.regions[r.id];
        const top = Object.keys(R.votes).sort((a, b) => R.votes[b] - R.votes[a])[0];
        const cells = camp.candidates
          .map((c) => `<td class="num ${c.id === top ? 'top' : ''}" style="--pc:${UI.party(c.party).color}">${UI.formatVotes(R.votes[c.id])}</td>`)
          .join('');
        return `<tr><th>${esc(r.name)}</th><td class="num">${(R.turnout * 100).toFixed(1)}%</td>${cells}</tr>`;
      })
      .join('');
    const totals = camp.candidates.map((c) => `<td class="num"><b>${UI.formatVotes(el.total[c.id])}</b></td>`).join('');
    const career = st.career;

    app.innerHTML = `
      <div class="end-screen">
        <div class="result-hero result-${head.cls}" style="--pc:${UI.party(me.party).color}">
          <p class="modal-kicker">${esc(Game.Data.DISTRICT_NAME)} ・ ${esc(UI.party(me.party).name)} ・ ${esc(me.name)}</p>
          <h2 class="result-title">${head.title}</h2>
          <p>${esc(head.text)}</p>
        </div>
        <div class="stat-cards">
          <div class="stat-card"><span>得票数</span><b>${UI.formatVotes(P.votes)}</b><small>票</small></div>
          <div class="stat-card"><span>得票率</span><b>${(P.share * 100).toFixed(1)}</b><small>%</small></div>
          <div class="stat-card"><span>順位</span><b>${P.rank}</b><small>位 / ${camp.candidates.length}人</small></div>
          <div class="stat-card"><span>惜敗率</span><b>${P.result === 'smd' ? '—' : (P.ratio * 100).toFixed(1)}</b><small>${P.result === 'smd' ? '' : '%'}</small></div>
          <div class="stat-card"><span>投票率</span><b>${(el.turnoutRate * 100).toFixed(1)}</b><small>%(${esc(el.weather.label)})</small></div>
          <div class="stat-card"><span>党内評価</span><b>${career ? career.partyEval : 0}</b><small></small></div>
        </div>
        <ul class="others">${others}</ul>
        ${supportSummary(camp)}
        <div class="list-wrap">
          <table class="result-table">
            <thead><tr><th>地区</th><th class="num">投票率</th>${heads}</tr></thead>
            <tbody>${rows}</tbody>
            <tfoot><tr><th colspan="2">合計</th>${totals}</tr></tfoot>
          </table>
        </div>
        ${nationalSummary(st)}
        ${careerSummary(st)}
        <div class="setup-actions">
          <button class="btn" data-act="title">セーブしてタイトルへ</button>
          <button class="btn btn-primary btn-lg" data-act="next">${st.party && st.party.custom && st.party.firstElectionDone ? '党首として次へ' : P.result === 'lost' ? '浪人生活へ' : '議員生活へ'}</button>
        </div>
      </div>`;
    app.querySelector('[data-act="title"]').onclick = () => Game.showScreen('title');
    app.querySelector('[data-act="next"]').onclick = () => Game.startTerm();
  };

  // 新党の全国の結果(M6 で本格的な全国選挙に置き換える)
  function nationalSummary(st) {
    const p = st.party;
    if (!p || !p.custom || !p.national) return '';
    const n = p.national;
    const R = Game.Balance.newParty.requirement;
    return `
      <section class="panel" style="border-top:4px solid ${p.color}">
        <h3>${esc(p.name)}の全国の結果</h3>
        <div class="stat-cards compact">
          <div class="stat-card"><span>擁立</span><b>${n.fielded}</b><small>人</small></div>
          <div class="stat-card"><span>小選挙区</span><b>${n.smdWins}</b><small>議席</small></div>
          <div class="stat-card"><span>比例</span><b>${n.prSeats}</b><small>議席${n.canPR ? '' : '(候補を立てられず)'}</small></div>
          <div class="stat-card"><span>比例得票率</span><b>${(n.share * 100).toFixed(1)}</b><small>%</small></div>
        </div>
        <div class="verdict ${n.requirement ? 'verdict-pr' : 'verdict-lost'}">${n.requirement
          ? `政党要件を満たした!(議員${R.mps}人以上、または得票率${R.share * 100}%以上)`
          : '政党要件には届かなかった。'}</div>
      </section>`;
  }

  // これまでの選挙
  function careerSummary(st) {
    const c = st.career;
    if (!c || !c.elections || c.elections.length < 2) return '';
    const label = { smd: '小選挙区で当選', pr: '比例復活', lost: '落選' };
    const rows = c.elections
      .map((e, i) => `<tr><td>${i + 1}回目</td><td>${e.year}年</td><td>${label[e.result]}</td><td class="num">${UI.formatVotes(e.votes)}票</td><td class="num">${(e.share * 100).toFixed(1)}%</td></tr>`)
      .join('');
    return `
      <section class="panel">
        <h3>これまでの選挙(当選${c.wins}回)</h3>
        <table class="result-table compact"><tbody>${rows}</tbody></table>
      </section>`;
  }

  UI.stopCountTimer = stopTimer;
})(Game.UI);
