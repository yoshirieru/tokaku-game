// 政権運営の画面:連立交渉、政権の状況パネル、行動の相手選び、連立入りの打診、退陣
window.Game = window.Game || {};
Game.UI = Game.UI || {};

(function (UI) {
  const esc = (s) => UI.esc(s);
  const G = () => Game.Gov;
  const LD = () => Game.Leader;
  const polName = (id) => Game.Data.POLICIES[id].name;
  const chip = (id) => UI.partyChip(id);

  // ---------------- 連立交渉(総選挙のあと) ----------------
  UI.renderCoalition = function (app) {
    const st = Game.state;
    const g = st.gov;
    if (!g || !g.formation) { st.screen = 'leaderHub'; return Game.commit(); }
    const f = g.formation;
    const me = st.leader.party;
    const C = Game.Balance.gov.coalition;
    const chosen = st.ui.coalitionChosen || [];
    const myPlatform = st.support ? st.support.pledges : [];
    const partners = G().formationPartners(st);
    const mySeats = LD().seatsOf(st, me);
    const total = mySeats + chosen.reduce((s, p) => s + LD().seatsOf(st, p), 0);
    const largest = Object.keys(st.world.parties).filter((id) => id !== 'indep').sort((a, b) => st.world.parties[b].seats - st.world.parties[a].seats)[0];

    const rows = partners
      .map((p) => {
        const offer = f.offers[p.id] || (f.offers[p.id] = { ministers: 0, policies: [], coop: false });
        const on = chosen.includes(p.id);
        const rejected = f.rejected.includes(p.id);
        const will = G().willingness(st, p.id, offer);
        const pols = p.platform
          .map((pol) => {
            const clash = myPlatform.some((x) => Game.Support.conflicts(x, pol));
            return `<button class="policy-pick ${offer.policies.includes(pol) ? 'on' : ''}" data-pol="${p.id}" data-v="${pol}" ${clash ? 'disabled title="あなたの公約とぶつかる"' : ''}>${esc(polName(pol))}</button>`;
          })
          .join('');
        return `
          <li class="coal-row ${on ? 'on' : ''} ${rejected ? 'rejected' : ''}">
            <label class="coal-head">
              <input type="checkbox" data-choose="${p.id}" ${on ? 'checked' : ''} ${rejected ? 'disabled' : ''}>
              ${chip(p.id)} <b>${esc(p.name)}</b> <span class="muted small">${p.seats}議席${p.conflicts ? ` ・ 基本政策がぶつかる(${p.conflicts})` : ''}${rejected ? ' ・ 申し入れを断られた' : ''}</span>
              <span class="coal-will ${will >= 0 ? 'ok' : 'ng'}">${will >= 10 ? '前向き' : will >= 0 ? '応じそう' : '渋い'}</span>
            </label>
            ${on ? `
            <div class="coal-offer">
              <div class="term-row"><span class="small muted">大臣ポスト</span>
                <span class="stepper"><button class="btn small" data-min="${p.id}" data-d="-1" ${offer.ministers <= 0 ? 'disabled' : ''}>−</button><b>${offer.ministers}</b><button class="btn small" data-min="${p.id}" data-d="1" ${offer.ministers >= C.ministerMax ? 'disabled' : ''}>+</button></span></div>
              <div class="term-row"><span class="small muted">政策の約束</span><div class="policy-picks">${pols}</div></div>
              <div class="term-row"><span class="small muted">選挙協力</span><label><input type="checkbox" data-coop="${p.id}" ${offer.coop ? 'checked' : ''}> 次の総選挙で候補者を一本化する</label></div>
            </div>` : ''}
          </li>`;
      })
      .join('');
    const maj = Game.Data.MAJORITY;
    app.innerHTML = `
      <div class="setup-screen coalition">
        <p class="modal-kicker">${st.world.year}年 総選挙のあと</p>
        <h2 class="screen-title">連立交渉</h2>
        <p>どの党も過半数(${maj})に届かなかった。${largest === me ? 'あなたの党が第1党だ。' : `第1党は${esc(LD().partyInfo(largest).name)}。相手は第1党との連立を先に考えるので、こちらからの申し入れは少し不利になる。`}</p>
        <div class="house-bar"><div class="seat-bar"><div class="seat-seg" style="flex:${total};background:${UI.party(me).color}">${total}</div><div class="seat-seg" style="flex:${Math.max(1, Game.Data.HOUSE_SEATS - total)};background:#3a4670"></div></div><i class="majority-line" style="left:${(maj / Game.Data.HOUSE_SEATS) * 100}%"></i></div>
        <p class="small">組もうとしている連立:<b>${total}</b>議席 ${total >= maj ? '<b class="good-text">過半数に届く</b>' : `<span class="warn-text">過半数まであと${maj - total}</span>`}</p>
        <p class="small muted">相手は大臣ポスト・政策の約束・選挙協力を求めている。ポストを渡すと自分の党内に不満が出る。約束した政策は政権運営のなかで法案にして通す必要があり、果たせないと連立相手の満足度が下がって、いずれ離脱される。</p>
        <ul class="coal-list">${rows}</ul>
        <div class="setup-actions">
          <button class="btn" data-act="giveup">${largest === me ? '単独の少数与党で政権を担う' : '連立をあきらめる(野党へ)'}</button>
          <button class="btn btn-primary btn-lg" data-act="propose" ${chosen.length && total >= maj ? '' : 'disabled'}>この条件で申し入れる</button>
        </div>
      </div>`;
    app.querySelectorAll('[data-choose]').forEach((el) => (el.onchange = () => {
      const id = el.dataset.choose;
      st.ui.coalitionChosen = el.checked ? chosen.concat(id) : chosen.filter((x) => x !== id);
      Game.commit();
    }));
    app.querySelectorAll('[data-min]').forEach((b) => (b.onclick = () => { f.offers[b.dataset.min].ministers += +b.dataset.d; Game.commit(); }));
    app.querySelectorAll('[data-pol]').forEach((b) => (b.onclick = () => {
      const o = f.offers[b.dataset.pol];
      const v = b.dataset.v;
      o.policies = o.policies.includes(v) ? o.policies.filter((x) => x !== v) : o.policies.concat(v);
      Game.commit();
    }));
    app.querySelectorAll('[data-coop]').forEach((el) => (el.onchange = () => { f.offers[el.dataset.coop].coop = el.checked; Game.commit(); }));
    app.querySelector('[data-act="propose"]').onclick = () => {
      const res = G().proposeCoalition(st, chosen);
      const names = (ids) => ids.map((p) => LD().partyInfo(p).name).join('・');
      if (res.formed) {
        st.ui.coalitionChosen = [];
        st.leader.report = {
          title: '連立政権の発足',
          lines: [`${names(res.accepted)}との連立で衆議院${res.seats}議席の政権が発足した。首班指名を経て、${st.player.name}が内閣総理大臣に就任した。`, '連立相手との約束を守り、満足度を保とう。'],
          event: null,
        };
        st.screen = 'leaderHub';
        st.ui.showLeaderReport = true;
      } else {
        st.ui.coalitionChosen = res.accepted;
        st.ui.lastResult = res.rejected.length ? `${names(res.rejected)}に断られた。条件を見直すか、ほかの党を探そう。` : '過半数に届かない。';
      }
      Game.commit();
    };
    app.querySelector('[data-act="giveup"]').onclick = () => {
      const r = G().giveUpFormation(st, largest === me);
      const gg = st.gov;
      st.ui.coalitionChosen = [];
      st.leader.report = {
        title: r === 'minority' ? '少数与党政権の発足' : '新政権の発足',
        lines: r === 'minority'
          ? [`単独の少数与党として政権を担う(衆議院${LD().seatsOf(st, me)}議席)。法案は通りにくく、内閣不信任案にもさらされる。`]
          : [`${LD().partyInfo(gg.pmParty).name}を中心とする政権が発足した(${gg.pmName}首相)。`],
        event: null,
      };
      st.screen = 'leaderHub';
      st.ui.showLeaderReport = true;
      Game.commit();
    };
  };

  // ---------------- 政権の状況(党首モードの左の列) ----------------
  UI.govPanel = function (st) {
    const g = G().ensure(st);
    const me = st.leader.party;
    const w = st.world;
    const lowerSeats = G().lower(st, g.coalition);
    const upperSeats = G().upper(st, g.coalition);
    const twisted = upperSeats < Game.Data.UPPER_MAJORITY;
    const minority = lowerSeats < Game.Data.MAJORITY;
    const roleText = g.role === 'pm' ? '首相' : g.role === 'partner' ? '連立与党' : '野党';
    const partners = Object.keys(g.partners)
      .map((p) => {
        const part = g.partners[p];
        const pend = part.policies.map((x) => polName(x)).join('・');
        return `<li><span>${chip(p)} ${esc(LD().partyInfo(p).name)}<small class="muted"> 大臣${part.ministers}${pend ? ` ・ 約束:${esc(pend)}` : ''}</small></span><span class="sat ${part.satisfaction < 35 ? 'warn-text' : ''}">満足度 ${Math.round(part.satisfaction)}</span></li>`;
      })
      .join('');
    const years = (g.pmTurns / 4).toFixed(1);
    let fatigue = '';
    if (g.role === 'pm') {
      const F = Game.Balance.gov.approval.fatigue;
      const rate = F.filter((f) => g.pmTurns >= f.from).map((f) => f.perTurn).pop() || 0;
      fatigue = rate ? `長期政権の飽き:毎ターン支持率 −${rate}` : `在任 ${years}年(3年を超えると「飽き」で支持率が下がり始める)`;
    }
    return `
      <section class="panel gov-panel">
        <div class="panel-head"><h3>政権</h3><span class="tag ${g.role === 'opposition' ? '' : 'win'}">あなたの党:${roleText}</span></div>
        <p><b>${esc(g.pmName)}首相</b>(${esc(LD().partyInfo(g.pmParty).name)}${g.coalition.length > 1 ? ` ほか${g.coalition.length - 1}党の連立` : ''})・内閣支持率 <b>${Math.round(w.approval)}%</b></p>
        <div class="gov-houses">
          <div><span class="small muted">衆議院(与党)</span><b class="${minority ? 'warn-text' : ''}">${lowerSeats}</b><small> / 過半数${Game.Data.MAJORITY}</small></div>
          <div><span class="small muted">参議院(与党)</span><b class="${twisted ? 'warn-text' : ''}">${upperSeats}</b><small> / 過半数${Game.Data.UPPER_MAJORITY}</small></div>
          <div><span class="small muted">次の参院選</span><b>${w.upper.nextYear}</b><small>年 夏</small></div>
        </div>
        ${twisted ? '<p class="small warn-text">ねじれ国会:法案が参議院で通りにくい。</p>' : ''}
        ${minority ? '<p class="small warn-text">少数与党:法案が通りにくく、内閣不信任案が通るおそれがある。</p>' : ''}
        ${partners ? `<ul class="house-list partner-list">${partners}</ul>` : ''}
        ${g.role === 'pm' ? `<p class="small muted">${esc(fatigue)} ・ 成立した法案 ${g.billsPassed}本</p>` : ''}
        ${g.role === 'opposition' && w.coopPacts.length ? `<p class="small muted">野党共闘:${esc(w.coopPacts.map((c) => LD().partyInfo(c.partner).name).join('・'))}と候補者を一本化</p>` : ''}
      </section>`;
  };

  // ---------------- 政権の行動の相手選び ----------------
  UI.openGovTarget = function (st, id, run) {
    const root = document.getElementById('modal-root');
    const g = st.gov;
    const def = G().ACTIONS[id];
    let rows = '';
    if (def.target === 'policy') {
      rows = G().billTargets(st)
        .map((p) => {
          const promised = Object.keys(g.partners).filter((pt) => g.partners[pt].policies.includes(p)).map((pt) => LD().partyInfo(pt).name);
          const clash = Object.keys(g.partners).filter((pt) => (Game.Data.PARTY_PLATFORMS[pt] || []).some((x) => Game.Support.conflicts(x, p))).map((pt) => LD().partyInfo(pt).name);
          const chance = Math.round(G().billChance(st, p) * 100);
          return `<button class="btn choice-btn" data-t="${p}"><b>${esc(Game.Data.BILL_NAMES[p] || polName(p))}</b><span class="small muted">成立の見込み ${chance}%${promised.length ? ` ・ ${esc(promised.join('・'))}との約束` : ''}${clash.length ? ` ・ ${esc(clash.join('・'))}が反発しそう` : ''}</span>${UI.econPreview(p)}</button>`;
        })
        .join('');
    } else if (def.target === 'partner') {
      rows = Object.keys(g.partners).map((p) => `<button class="btn choice-btn" data-t="${p}"><b>${chip(p)} ${esc(LD().partyInfo(p).name)}</b><span class="small muted">満足度 ${Math.round(g.partners[p].satisfaction)}</span></button>`).join('');
    } else if (def.target === 'party') {
      rows = Object.keys(st.world.parties)
        .filter((p) => p !== st.leader.party && p !== 'indep' && !g.coalition.includes(p) && st.world.parties[p].seats > 0)
        .map((p) => {
          const will = Game.National.coopWillingness(st, p, 'unify');
          return `<button class="btn choice-btn" data-t="${p}"><b>${chip(p)} ${esc(LD().partyInfo(p).name)}</b><span class="small muted">${st.world.parties[p].seats}議席 ・ ${will >= 15 ? '前向き' : will >= 0 ? '応じそう' : '断られそう'}</span></button>`;
        })
        .join('');
    }
    root.innerHTML = `
      <div class="modal-backdrop"><div class="modal">
        <p class="modal-kicker">${esc(def.name)}</p><h2>${def.target === 'policy' ? 'どの法案を出す?' : 'どの党と?'}</h2>
        <div class="choices">${rows || '<p class="muted">選べる相手がいない。</p>'}</div>
        <div class="modal-actions"><button class="btn" data-act="close">やめる</button></div>
      </div></div>`;
    root.querySelector('[data-act="close"]').onclick = () => (root.innerHTML = '');
    root.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { root.innerHTML = ''; run(b.dataset.t); }));
  };

  // ---------------- 連立入りの打診 ----------------
  UI.renderGovInvite = function (root, st) {
    const g = st.gov;
    const p = LD().partyInfo(g.invite.pmParty);
    root.innerHTML = `
      <div class="modal-backdrop"><div class="modal">
        <p class="modal-kicker">連立の打診</p><h2>${esc(p.name)}から連立入りの打診</h2>
        <p>${esc(p.name)}(${LD().seatsOf(st, g.invite.pmParty)}議席)は、過半数に届かせるためにあなたの党の力を必要としている。連立に入れば与党として大臣ポストを得るが、首相にはなれない。</p>
        <div class="choices">
          <button class="btn choice-btn" data-inv="yes"><b>連立に入る</b><span class="small muted">与党の一員になる</span></button>
          <button class="btn choice-btn" data-inv="no"><b>断って野党にとどまる</b><span class="small muted">${esc(p.name)}は少数与党になる</span></button>
        </div>
      </div></div>`;
    root.querySelectorAll('[data-inv]').forEach((b) => (b.onclick = () => {
      G().answerInvite(st, b.dataset.inv === 'yes');
      Game.commit();
    }));
  };

})(Game.UI);
