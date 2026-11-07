// タイトル画面と、スタート時の立場を選ぶ画面
window.Game = window.Game || {};
Game.UI = Game.UI || {};

(function (UI) {
  const PLEDGE_COUNT = 2;   // 看板政策の数

  // タイトル画面の絵と音は js/effects/title.js。ここでは行き先だけを渡す
  UI.renderTitle = function (app) {
    // はじめから・対戦は、先にどのセーブデータに記録するかを選ぶ
    const toSlots = (mode) => {
      Game.slotMode = mode;
      Game.showScreen('slots');
    };
    Game.Effects.Title.render(app, {
      hasSave: Game.hasSave(),
      note: `登場する政党・政治家・選挙区はすべて架空です。ただし宗教団体と、その団体が支持母体の政党(公明党、幸福実現党)は実名で、公開されている事実だけで描いています(${Game.Data.ORG_INFO_DATE})。`,
      onNew: () => toSlots('new'),
      onContinue: () => toSlots('load'),
      onVersus: () => toSlots('versus'),
      onHall: () => Game.showScreen('hall'),   // 殿堂(hall-view.js)
      onOrgs: () => UI.openOrgModal({}),
    });
  };

  // ---------------- セーブデータを選ぶ ----------------
  // Game.slotMode:'load'(つづきから)| 'new'(はじめから)| 'versus'(2人で対戦)
  UI.renderSlots = function (app) {
    const mode = Game.slotMode || 'load';
    const title = { load: 'つづきから:セーブデータを選ぶ', new: 'はじめから:どこに記録する?', versus: '2人で対戦:どこに記録する?' }[mode];
    const cards = Game.listSlots()
      .map(({ n, state }) => {
        const s = UI.saveSummary(state);
        const body = s
          ? `<b>${UI.esc(s.title)}</b><span>${UI.esc(s.when)} ${UI.esc(s.where)}${s.easy ? ' ・ イージー' : ''}</span><span class="small muted">最後の記録 ${UI.esc(s.saved)}</span>`
          : '<span class="muted">空き</span>';
        const main = mode === 'load'
          ? (s ? `<button class="btn btn-primary" data-load="${n}">つづける</button>` : '')
          : `<button class="btn ${s ? '' : 'btn-primary'}" data-use="${n}" data-full="${s ? 1 : 0}">${s ? '上書きして始める' : 'ここに始める'}</button>`;
        return `
          <li class="slot-card ${n === Game.slot ? 'last' : ''}">
            <span class="slot-no">${n}</span>
            <div class="slot-body">${body}</div>
            <div class="slot-actions">${main}${s ? `<button class="btn btn-ghost small" data-del="${n}">消す</button>` : ''}</div>
          </li>`;
      })
      .join('');
    app.innerHTML = `
      <div class="setup-screen">
        <h2 class="screen-title">${UI.esc(title)}</h2>
        <p class="small muted">セーブデータは${Game.SLOTS}つまで。遊んでいるあいだは自動で記録される。</p>
        <ul class="slot-list">${cards}</ul>
        <div class="setup-actions"><button class="btn" data-act="back">もどる</button></div>
      </div>`;
    app.querySelector('[data-act="back"]').onclick = () => Game.showScreen('title');
    app.querySelectorAll('[data-load]').forEach((b) => (b.onclick = () => Game.continueGame(+b.dataset.load)));
    app.querySelectorAll('[data-use]').forEach((b) => {
      b.onclick = () => {
        if (b.dataset.full === '1' && !confirm(`セーブデータ${b.dataset.use}を消して、新しく始めますか?`)) return;
        Game.useSlot(+b.dataset.use);
        Game.showScreen(mode === 'versus' ? 'versusSetup' : 'setup');
      };
    });
    app.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = () => {
        if (!confirm(`セーブデータ${b.dataset.del}を消しますか?(元に戻せません)`)) return;
        Game.deleteSave(+b.dataset.del);
        UI.renderSlots(app);
      };
    });
  };

  UI.renderSetup = function (app) {
    const NEW = 'newparty';
    let selected = 'minsei';
    const pledgeCount = () => (selected === NEW ? Game.Balance.newParty.pledgeCount : PLEDGE_COUNT);
    const platformOf = (id) => (id === NEW ? Game.Data.IDEOLOGIES[ideology].suggest : Game.Data.PARTY_PLATFORMS[id]);
    let ideology = 'reform';
    let color = Game.Data.CUSTOM_COLORS[0];
    let pledges = platformOf(selected).slice(0, pledgeCount());
    let seat = Game.Data.DEFAULT_SEAT;   // 選挙区(districts.js の SEATS)
    let easy = false;       // イージーモード
    let tutorial = true;    // チュートリアル
    let firstTarget = 'upper';   // 新党の最初の選挙(M13):'upper' 参院選から / 'lower' 衆議院の解散を待つ
    const parties = Object.values(Game.Data.PARTIES).filter((p) => p.playable);

    // 選挙区での党の戦いやすさ(districts.js の guide:初当選率の目安)を言葉にする
    const leanLabel = (s, party) => {
      const v = (s.guide || {})[party];
      if (v === undefined) return null;
      if (v >= 80) return ['とてもやさしい', 'good'];
      if (v >= 55) return ['やさしい', 'good'];
      if (v >= 35) return ['ふつう', ''];
      if (v >= 15) return ['むずかしい', 'bad'];
      return ['とてもむずかしい', 'bad'];
    };

    function draw() {
      Game.Data.applySeat(seat);   // 対立候補の顔ぶれを選んだ選挙区のものにする
      const seatCards = Game.Data.SEATS
        .map((s) => {
          const block = Game.Data.BLOCKS.find((b) => b.id === s.block);
          const lean = leanLabel(s, selected);
          const voters = Math.round(s.districts.reduce((a, d) => a + d.voters, 0) / 10000);
          return `
          <button class="seat-card ${s.id === seat ? 'selected' : ''}" data-seat="${s.id}">
            <span class="seat-card-name">${UI.esc(s.name)}<span class="seat-card-type">${UI.esc(s.type)}</span></span>
            <span class="small muted">${UI.esc(block ? block.name : '')}ブロック・有権者 約${voters}万人</span>
            ${lean ? `<span class="small">${UI.esc(UI.party(selected).short)}から出ると:<b class="lean-${lean[1] || 'even'}">${lean[0]}</b></span>` : ''}
            <span class="seat-card-desc small">${UI.esc(s.description)}</span>
            <span class="small muted">${s.districts.map((d) => UI.esc(d.name)).join('・')}</span>
          </button>`;
        })
        .join('');
      const cards = parties
        .map((p) => `
          <button class="party-card ${p.id === selected ? 'selected' : ''}" data-party="${p.id}" style="--pc:${p.color}">
            <span class="party-card-name">${UI.esc(p.name)}</span>
            <span class="party-card-pos">${UI.esc(p.position)}</span>
            <span class="party-card-diff">難易度:<b>${UI.esc(p.difficulty)}</b>(${UI.esc(p.difficultyNote)})</span>
            <span class="party-card-desc">${UI.esc(p.description)}</span>
          </button>`)
        .join('');
      const newCard = `
        <button class="party-card ${selected === NEW ? 'selected' : ''}" data-party="${NEW}" style="--pc:${color}">
          <span class="party-card-name">新党を立ち上げる</span>
          <span class="party-card-pos">党名は自分で決める</span>
          <span class="party-card-diff">難易度:<b>上級</b>(議席ゼロ・資金わずか・組織票なし)</span>
          <span class="party-card-desc">議員キャリアを飛ばし、国政経験のない党首として始める。公約は自由で、「新しさ」でSNSと浮動票に強い。</span>
        </button>`;

      const isNew = selected === NEW;
      const n = pledgeCount();
      const platform = platformOf(selected);
      const chips = Object.keys(Game.Data.POLICIES)
        .map((id) => {
          const on = pledges.includes(id);
          const blocked = !on && (pledges.length >= n || !Game.Support.canAddPledge(pledges, id));
          return `<button class="policy-pick ${on ? 'on' : ''} ${platform.includes(id) ? 'platform' : ''}" data-pledge="${id}" ${blocked ? 'disabled' : ''}>${UI.esc(Game.Data.POLICIES[id].name)}</button>`;
        })
        .join('');

      const rel = Game.Support.initialRelations(selected, pledges);
      const th = Game.Balance.orgs.endorseThreshold;
      const relRows = Object.values(Game.Data.ORGANIZATIONS)
        .map((o) => {
          const v = Math.round(rel[o.id]);
          const clash = Game.Support.conflictPairs(pledges, o.policies).length > 0;
          return `<li><span class="rel-name">${UI.esc(o.name)}</span><span class="relation-bar small-bar"><span style="width:${v}%"></span><i style="left:${th}%"></i></span><b>${v}</b>${clash ? '<span class="clash-mark" title="公約とぶつかる">✗</span>' : ''}</li>`;
        })
        .join('');

      const roles = Game.Data.RIVAL_ROLES[selected];
      const rivals = Object.keys(roles)
        .map((rp) => {
          const r = Game.Data.RIVALS[rp];
          return `<li>${UI.partyChip(rp)} <b>${UI.esc(r.name)}</b>(${r.age})<span class="muted">${UI.ROLE_LABEL[roles[rp]]}・「${UI.esc(r.catch)}」</span></li>`;
        })
        .join('');
      const kofukuRuns = !(rel.kofuku >= th && Game.Support.conflictPairs(pledges, Game.Data.ORGANIZATIONS.kofuku.policies).length === 0);
      const kofukuRow = kofukuRuns
        ? `<li>${UI.partyChip('kofuku')} <b>${UI.esc(Game.Data.RIVALS.kofuku.name)}</b>(${Game.Data.RIVALS.kofuku.age})<span class="muted">新人・「${UI.esc(Game.Data.RIVALS.kofuku.catch)}」</span></li>`
        : '';

      const nameVal = app.querySelector('#player-name')?.value ?? '新田 翔';
      app.innerHTML = `
        <div class="setup-screen">
          <h2 class="screen-title">${isNew ? '結党の準備' : '立候補の準備'}</h2>
          <section class="setup-section">
            <label class="field-label" for="player-name">${isNew ? '党首の名前' : '候補者名'}</label>
            <input id="player-name" class="text-input" maxlength="12" value="${UI.esc(nameVal)}">
          </section>
          <section class="setup-section">
            <h3 class="field-label">難易度</h3>
            <div class="mode-picks">
              <button class="mode-pick ${easy ? '' : 'on'}" data-easy="0"><b>ふつう</b><span class="small muted">本来のバランス。初当選は党によって2〜5割ほど</span></button>
              <button class="mode-pick ${easy ? 'on' : ''}" data-easy="1"><b>イージー</b><span class="small muted">知名度・支持・資金が多めで、相手が少し弱い。はじめての人におすすめ</span></button>
            </div>
            <label class="check-label"><input type="checkbox" id="tutorial" ${tutorial ? 'checked' : ''}> チュートリアルを見る(遊び方を順に説明します)</label>
          </section>
          <section class="setup-section">
            <h3 class="field-label">どの党から出馬する?</h3>
            <div class="party-cards">${cards}${newCard}</div>
          </section>
          <section class="setup-section">
            <h3 class="field-label">${isNew ? '党首が出る選挙区' : 'どの選挙区から出馬する?'}</h3>
            <p class="small muted">選挙区によって、地区の顔ぶれ、対立候補の党、党の地力、比例代表のブロックが変わります。</p>
            <div class="seat-cards">${seatCards}</div>
          </section>
          ${isNew ? `
          <section class="setup-section np-setup">
            <h3 class="field-label">新党</h3>
            ${UI.newPartyFields(color, ideology)}
            <p class="small muted">実例:政治経験のなかった党首が2025年5月に設立した「チームみらい」は、同年の参院選で1議席・得票率2%超で政党要件を満たし、2026年2月の衆院選で14人を擁立して11人が当選した。</p>
            <h3 class="field-label">最初にめざす選挙</h3>
            <div class="mode-picks">
              <button class="mode-pick ${firstTarget === 'upper' ? 'on' : ''}" data-target="upper"><b>参院選の比例から(おすすめ)</b><span class="small muted">${Game.Balance.newParty.upperRoute.startYear}年から結党準備。翌年夏の参院選で、全国の比例票を集めて議席と政党要件をねらう。そのあと衆院選へ</span></button>
              <button class="mode-pick ${firstTarget === 'lower' ? 'on' : ''}" data-target="lower"><b>衆議院の解散を待つ</b><span class="small muted">${Game.Balance.term.startYear}年から。解散はいつ来るか分からない。政党要件のないまま総選挙を戦うことが多い</span></button>
            </div>
          </section>` : ''}
          <section class="setup-section">
            <h3 class="field-label">看板政策(${n}つ選ぶ)</h3>
            <p class="small muted">公約になります。支援団体の求める政策と一致すると関係度が上がり、ぶつかると推薦がもらえません。点線の枠は${isNew ? '理念のおすすめ' : '党の基本政策'}です。</p>
            <div class="policy-picks">${chips}</div>
            <div class="setup-orgs">
              <div class="panel-head">
                <span class="small muted">支援団体との最初の関係度(${th}以上で推薦の候補)${isNew ? '。新党は白紙から' : ''}</span>
                <button class="btn btn-ghost small" data-act="org-info">団体の紹介 ›</button>
              </div>
              <ul class="setup-rel">${relRows}</ul>
            </div>
          </section>
          <section class="setup-section">
            <h3 class="field-label">${UI.esc(Game.Data.DISTRICT_NAME)}の${isNew ? '相手(党首が出る選挙区)' : '対立候補'}</h3>
            <ul class="rival-list">${rivals}${kofukuRow}</ul>
          </section>
          <div class="setup-actions">
            <button class="btn" data-act="back">もどる</button>
            <button class="btn btn-primary btn-lg" data-act="start" ${pledges.length === n ? '' : 'disabled'}>${isNew ? '結党する' : '立候補する'}</button>
          </div>
        </div>`;

      app.querySelectorAll('[data-party]').forEach((b) => {
        b.onclick = () => {
          selected = b.dataset.party;
          pledges = platformOf(selected).slice(0, pledgeCount());
          draw();
        };
      });
      app.querySelectorAll('[data-seat]').forEach((b) => {
        b.onclick = () => {
          seat = b.dataset.seat;
          draw();
        };
      });
      app.querySelectorAll('[data-easy]').forEach((b) => {
        b.onclick = () => {
          easy = b.dataset.easy === '1';
          draw();
        };
      });
      app.querySelector('#tutorial').onchange = (e) => { tutorial = e.target.checked; };
      app.querySelectorAll('[data-pledge]').forEach((b) => {
        b.onclick = () => {
          const id = b.dataset.pledge;
          pledges = pledges.includes(id) ? pledges.filter((x) => x !== id) : pledges.concat(id);
          draw();
        };
      });
      if (isNew) {
        UI.bindNewPartyFields(app, (c) => { color = c; draw(); }, (i) => { ideology = i; draw(); });
        app.querySelectorAll('[data-target]').forEach((b) => {
          b.onclick = () => {
            firstTarget = b.dataset.target;
            draw();
          };
        });
      }
      app.querySelector('[data-act="org-info"]').onclick = () => UI.openOrgModal({ pledges });
      app.querySelector('[data-act="back"]').onclick = () => Game.showScreen('title');
      app.querySelector('[data-act="start"]').onclick = () => {
        const name = app.querySelector('#player-name').value.trim() || '新田 翔';
        const mode = { easy, tutorial, seat, firstTarget };
        if (!isNew) return Game.startNew(name, selected, pledges, mode);
        const pname = app.querySelector('#np-name').value.trim();
        const short = app.querySelector('#np-short').value.trim();
        if (!pname || !short) return alert('党名と略称を入れてください');
        Game.startNewParty(name, { name: pname, short, color, ideology, pledges }, mode);
      };
    }
    draw();
  };
})(Game.UI);
