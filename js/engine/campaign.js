// 選挙戦(選挙区)。手札のカードを地区に出して支持を伸ばす。DOM には触らない(自動プレイで Node から動かす)。
// 支持は地区ごとの割合(候補の合計が100)。誰かが伸びると、ほかの候補が今の割合に応じて下がる。
window.Game = window.Game || {};

Game.Campaign = (function () {
  const R = Game.Rng;
  const bal = function () { return Game.Balance; };
  const regions = function () { return Game.Data.DISTRICT.regions; };
  // いまの舞台の、地区ごとの党の地力(選挙区は balance.js の seats、全国は partyBase)
  function baseOf(rid) {
    const B = bal(), S = B.seats[Game.Data.DISTRICT.id];
    return S ? S.base[rid] : B.partyBase[rid];
  }
  // いまの選挙区の、地区ごとの投票率の基準
  function turnoutOf(rid) { return bal().seats[Game.Data.DISTRICT.id].turnout[rid]; }

  // ---------- 始まり ----------
  // 2回目からの選挙は、任期の結果(state.career。career.js)が返ってくる:
  //   立場(現職・元職)、地盤、守った約束の推薦、破った約束、持ち越した約束、党幹部の応援、資金
  // 党首として戦う総選挙(全国。舞台は js/data/nation.js)。候補は党、地区は11ブロック
  function newNational(state) {
    const B = bal(), NB = B.nation, CB = B.comeback, party = state.player.party, cr = state.career;
    const cands = [{ id: 'me', party: party, name: state.player.name, short: state.player.name.split(/[ 　]/)[0], role: 'leader', player: true }];
    Object.keys(Game.Data.PARTIES).forEach(function (p) {
      if (p === party) return;
      const who = Game.Data.LEADERS[p];
      cands.push({ id: p, party: p, name: who.name, short: who.short, role: 'nat_' + p });
    });
    const shares = {};
    regions().forEach(function (r) {
      let sum = 0;
      cands.forEach(function (c) { sum += baseOf(r.id)[c.party]; });
      shares[r.id] = {};
      cands.forEach(function (c) { shares[r.id][c.id] = baseOf(r.id)[c.party] / sum * 100; });
    });
    const carryMoney = Math.min(CB.moneyCarryMax, cr.money || 0);
    const camp = {
      arena: 'nation', day: 0, energy: 0, money: NB.startMoney + carryMoney, sel: 'kinki',
      cands: cands, shares: shares, shields: {}, promises: [],
      deck: [], discard: [], hand: [], uid: 0,
      intents: [], blocked: {}, today: {}, pending: [], news: '', played: 0, comeback: null,
    };
    // 始まりの支持(全ブロック):党への風、党の結束(党への貢献)、党首の約束(守った・破った)
    const N = cr.next || { endorse: [], broken: [], light: [] };
    const wind = Math.round(Math.max(-CB.windMax, Math.min(CB.windMax, R.normal(state) * CB.windSd)));
    const unity = Math.min(NB.unityMax, Math.floor((cr.contrib || 0) / NB.unityPer));
    const kept = Math.min(NB.keptMax, N.endorse.length) * NB.keptAll;
    const broken = (N.broken.length + N.light.length) * NB.brokenAll;
    const govBonus = cr.gov ? Game.Gov.electionBonus(cr.gov) : 0;   // 内閣支持率(首相はそのまま、連立与党は半分、野党は逆向き)
    const GV = B.gov;
    const fatigue = cr.gov && cr.gov.role === 'pm' ? -Math.min(GV.fatigueMax, Math.max(0, (cr.pmStreak || 1) - 1)) * GV.fatiguePer : 0;   // 長期政権への飽き
    const ethic = Game.Scandal.startOfElection(state);   // クリーンの評判と、裏金の発覚の響き(R9)
    camp.cleanSns = ethic.sns;
    const all = wind + unity + kept + broken + govBonus + fatigue + ethic.clean + ethic.penalty;
    if (all) regions().forEach(function (r) { applyGain(camp, r.id, 'me', all); });
    camp.comeback = { national: true, wind: wind, unity: unity, kept: kept, broken: broken, money: carryMoney, prevMine: cr.partySeats,
      fatigue: fatigue, govBonus: govBonus, govRole: cr.gov ? cr.gov.role : null, approval: cr.gov ? Math.round(cr.gov.approval) : null, ethic: ethic };
    camp.deck = R.shuffle(state, NB.deck.concat(NB.manifesto[party]));
    state.camp = camp;
    startDay(state);
    return camp;
  }

  function newCampaign(state) {
    const B = bal(), CB = B.comeback, party = state.player.party;
    const cr = state.career || null;
    Game.Data.setHome(state.player.seat);   // 立候補している選挙区(はじめのセーブにはないので、北陽3区になる)
    Game.Data.useArena(cr && cr.leader ? 'nation' : 'home');
    if (cr && cr.leader) return newNational(state);
    const D = Game.Data.DISTRICT;
    const roles = (cr && cr.rivalRoles) || D.roles[party];
    const cands = [{ id: 'me', party: party, name: state.player.name, short: state.player.name.split(/[ 　]/)[0], role: cr ? cr.role : 'newcomer', player: true }];
    Object.keys(roles).forEach(function (p) {
      const who = D.people[p];
      cands.push({ id: p, party: p, name: who.name, short: who.short, role: roles[p] });
    });
    const shares = {};
    regions().forEach(function (r) {
      const raw = {};
      let sum = 0;
      cands.forEach(function (c) {
        raw[c.id] = baseOf(r.id)[c.party] * (c.player ? B.playerRoles[c.role] : B.roles[c.role].mult * (B.seats[D.id].rivalMult || 1));
        sum += raw[c.id];
      });
      shares[r.id] = {};
      cands.forEach(function (c) { shares[r.id][c.id] = raw[c.id] / sum * 100; });
    });
    const camp = {
      arena: D.id, day: 0, energy: 0, money: B.campaign.startMoney, sel: 'downtown',
      cands: cands, shares: shares, shields: {}, promises: [],
      deck: [], discard: [], hand: [], uid: 0,
      intents: [], blocked: {}, today: {}, pending: [], news: '', played: 0, comeback: null,
    };
    // 裏金(R9)・国替え(R10・R11)の持ち越し。公認を取り消されていると、党幹部の応援は来ない
    const ethic = Game.Scandal.startOfElection(state);
    camp.cleanSns = ethic.sns;
    let deck = B.deck.slice();
    if (ethic.unendorsed) deck = deck.filter(function (id) { return id !== 'star'; });
    if (!cr) {
      deck = deck.concat(B.partyPromises[party]);
    } else {
      const N = cr.next;
      const stars = ethic.unendorsed ? 0 : Game.Career.extraStars(cr);
      for (let i = 0; i < stars; i++) deck.push('star');
      // 約束のカード:持ち越した約束・破った約束の団体には、今回は約束できない
      const closed = {};
      N.carried.concat(N.broken, N.light).forEach(function (id) { closed[id] = true; });
      B.partyPromises[party].forEach(function (id) { if (!closed[B.cards[id].promise]) deck.push(id); });
      N.endorse.forEach(function (id) { deck.push('e_' + id); });
      N.broken.forEach(function (id) { deck.push('b_' + id); });
      camp.promises = N.carried.slice();
      const carryMoney = Math.min(CB.moneyCarryMax, cr.money);
      camp.money += carryMoney;
      // 始まりの支持:議席を守り続けている相手の現職は、地盤を固めている
      cands.forEach(function (c) {
        if (!c.player && (cr.rivalSolid || {})[c.party]) regions().forEach(function (r) { applyGain(camp, r.id, c.id, CB.rivalBase); });
      });
      // こちらは地盤のぶん上がり、破った約束の団体の地区は下がる
      let baseSum = 0;
      regions().forEach(function (r) { const n = cr.base[r.id] || 0; if (n) { applyGain(camp, r.id, 'me', n); baseSum += n; } });
      N.broken.forEach(function (id) { applyGain(camp, Game.Data.PROMISES[id].region, 'me', CB.brokenStart); });
      N.light.forEach(function (id) { applyGain(camp, Game.Data.PROMISES[id].region, 'me', CB.lightStart); });
      // 党への風:政権や党への評価で、選挙ごとに追い風にも逆風にもなる
      let wind = Math.round(Math.max(-CB.windMax, Math.min(CB.windMax, R.normal(state) * CB.windSd)));
      if (wind) regions().forEach(function (r) { applyGain(camp, r.id, 'me', wind); });
      // 役職の重み:顔が売れているぶん、全地区で少し上がる
      const rk = cr.status === 'member' ? B.ranks[cr.rank || 0] : null;
      if (rk && rk.startAll) regions().forEach(function (r) { applyGain(camp, r.id, 'me', rk.startAll); });
      camp.comeback = { wind: wind, rank: rk && rk.startAll ? { name: rk.name, gain: rk.startAll } : null, stars: stars, endorse: N.endorse.slice(), broken: N.broken.slice(), light: N.light.slice(), carried: N.carried.slice(), base: baseSum, money: carryMoney, ethic: ethic };
    }
    if (ethic.clean + ethic.penalty) regions().forEach(function (r) { applyGain(camp, r.id, 'me', ethic.clean + ethic.penalty); });
    camp.deck = R.shuffle(state, deck);
    state.camp = camp;
    startDay(state);
    return camp;
  }

  // ---------- 計算 ----------
  function cand(camp, id) { return camp.cands.filter(function (c) { return c.id === id; })[0]; }
  function rivals(camp) { return camp.cands.filter(function (c) { return !c.player; }); }
  // who の支持を g だけ動かす(マイナスも可)。実際に動いた量を返す
  function applyGain(camp, regionId, who, g) {
    const C = bal().campaign, s = camp.shares[regionId];
    const old = s[who];
    const nw = Math.max(C.shareFloor, Math.min(C.shareCap, old + g));
    const k = (100 - nw) / (100 - old);
    Object.keys(s).forEach(function (c) { s[c] = c === who ? nw : s[c] * k; });
    return nw - old;
  }
  function overall(camp) {
    const out = {};
    let total = 0;
    camp.cands.forEach(function (c) { out[c.id] = 0; });
    regions().forEach(function (r) {
      total += r.voters;
      camp.cands.forEach(function (c) { out[c.id] += camp.shares[r.id][c.id] * r.voters; });
    });
    camp.cands.forEach(function (c) { out[c.id] /= total; });
    return out;
  }
  // プレイヤーと、いちばん強い相手との差
  function margin(s) {
    let best = -1;
    Object.keys(s).forEach(function (c) { if (c !== 'me' && s[c] > best) best = s[c]; });
    return s.me - best;
  }
  function ranking(s) { return Object.keys(s).sort(function (a, b) { return s[b] - s[a]; }); }
  function topRival(camp) {
    const o = overall(camp);
    return ranking(o).filter(function (c) { return c !== 'me'; })[0];
  }
  // 情勢の印(新聞ふう)
  function mark(m) {
    const t = bal().marks;
    if (m >= t.strong) return { sym: '◎', word: '優勢', level: 'good' };
    if (m >= t.lean) return { sym: '○', word: 'やや優勢', level: 'good' };
    if (m > -t.lean) return { sym: '▲', word: '接戦', level: 'even' };
    if (m > -t.strong) return { sym: '△', word: 'やや劣勢', level: 'bad' };
    return { sym: '×', word: '劣勢', level: 'bad' };
  }

  // ---------- カード ----------
  function isTarget(id) { const b = bal().cards[id]; return !!b.gain && !b.region && !b.all; }
  // そのカードを、その地区で使ったときの伸び(画面の予告と実際の効果は同じ)
  function cardGain(camp, id, regionId) {
    const B = bal(), b = B.cards[id], r = Game.Data.REGION[regionId];
    let g = 0;
    if (b.curse) return 0;
    if (b.all) {
      r.tags.forEach(function (t) { g = Math.max(g, b.all[t] || 0); });
      if (g > 0 && camp.cleanSns && (id === 'sns' || id === 'nSns')) g += camp.cleanSns;   // クリーンの評判は SNS で効く(R9)
    } else if (b.region) {
      g = b.region === regionId ? b.gain : 0;
    } else if (b.gain) {
      g = b.gain;
      r.tags.forEach(function (t) { g += (b.tagBonus || {})[t] || 0; });
      if (camp.today.rain && B.events.rain[id]) g += B.events.rain[id];
      if (camp.day === B.campaign.days) g += B.campaign.lastDayBonus;
    }
    if (g <= 0) return 0;
    return saturated(camp, regionId, 'me') ? Math.max(1, Math.round(g * B.campaign.saturatedMult)) : g;
  }
  // すでに大きくリードしている地区では、それ以上は伸びにくい(プレイヤーも相手も同じ)
  function saturated(camp, regionId, who) {
    const s = camp.shares[regionId];
    let best = 0;
    Object.keys(s).forEach(function (c) { if (c !== who && s[c] > best) best = s[c]; });
    return s[who] - best >= bal().campaign.saturatedLead;
  }
  function canPlay(camp, id) {
    const b = bal().cards[id];
    if (camp.pending.length) return { ok: false, reason: '先に知らせを確かめよう。' };
    if (camp.energy < b.cost) return { ok: false, reason: '体力が足りない。この日を終えると回復する。' };
    if (b.money > 0 && camp.money < b.money) return { ok: false, reason: '資金が足りない。「資金集め」で集めよう。' };
    return { ok: true };
  }
  // 手札のカード(uid)を使う。地区を選ぶカードは regionId が要る
  // opt は資金のカードの記載('hide' なら一部を載せない。R9)
  function play(state, uid, regionId, opt) {
    const camp = state.camp, B = bal();
    const card = camp.hand.filter(function (c) { return c.uid === uid; })[0];
    if (!card) return { ok: false, reason: 'そのカードは手札にない。' };
    const id = card.id, b = B.cards[id], name = Game.Data.CARDS[id].name;
    const ok = canPlay(camp, id);
    if (!ok.ok) return ok;
    if (isTarget(id) && !Game.Data.REGION[regionId]) return { ok: false, reason: '使う地区を選ぼう。' };
    const fx = [];
    let msg;
    if (isTarget(id)) {
      const d = applyGain(camp, regionId, 'me', cardGain(camp, id, regionId));
      fx.push({ region: regionId, who: 'me', gain: Math.round(d) });
      camp.sel = regionId;
      msg = Game.Data.REGION[regionId].name + 'で' + name + '。支持が ' + Math.round(d) + ' ポイント伸びた。';
      if (b.shield) {
        camp.shields[regionId] = Math.min(B.campaign.shieldMax, (camp.shields[regionId] || 0) + b.shield);
        msg += '固い票がついた。';
      }
      if (b.block) {
        camp.blocked[regionId] = true;
        const hit = camp.intents.some(function (it) { return it.region === regionId; });
        msg += hit ? '相手の今日の動きを先回りして止めた。' : '(今日ここに入る相手はいなかった)';
      }
    } else {
      regions().forEach(function (r) {
        const g = cardGain(camp, id, r.id);
        if (g) fx.push({ region: r.id, who: 'me', gain: Math.round(applyGain(camp, r.id, 'me', g)) });
      });
      if (b.curse) {
        msg = Game.Data.PROMISES[b.curse].org + 'に頭を下げに行った。許されたわけではないが、「破った約束」は手札から消えた。';
      } else if (b.endorse) {
        msg = Game.Data.PROMISES[b.endorse].org + 'の推薦を受けた。約束を守ったことが、票になって返ってきた。';
      } else if (b.promise) {
        const p = Game.Data.PROMISES[b.promise];
        camp.promises.push(b.promise);
        msg = p.org + 'に「' + p.policy + '」を約束した。票は固まったが、約束は任期までついてくる。';
        if (camp.promises.length > B.campaign.promiseFree) {
          regions().forEach(function (r) {
            fx.push({ region: r.id, who: 'me', gain: Math.round(applyGain(camp, r.id, 'me', -B.campaign.promisePenalty)) });
          });
          msg = p.org + 'に「' + p.policy + '」を約束した。「誰にでもいい顔をする」と見られ、全地区で支持が少し下がった。';
        }
      } else if (b.money < 0) {
        // 資金集め(R9):収入の一部を収支報告書に載せないこともできる
        const rec = Game.Scandal.record(state, opt);
        camp.money += rec.money;
        msg = name + '。' + (-b.money + rec.money) + '万円が集まった。' + rec.note;
      } else {
        msg = name + '。届きやすい地区で支持が伸びた。';
      }
    }
    camp.money -= b.money;
    camp.energy -= b.cost;
    camp.hand = camp.hand.filter(function (c) { return c.uid !== uid; });
    if (!b.once) camp.discard.push(id);
    camp.played += 1;
    camp.news = msg;
    return { ok: true, fx: fx, msg: msg };
  }

  // ---------- 1日の流れ ----------
  function draw(state) {
    const camp = state.camp, n = bal().campaign.handSize;
    while (camp.hand.length < n) {
      if (!camp.deck.length) {
        if (!camp.discard.length) break;
        camp.deck = R.shuffle(state, camp.discard);
        camp.discard = [];
      }
      camp.hand.push({ id: camp.deck.pop(), uid: ++camp.uid });
    }
  }
  // 相手の今日の動きを決める(朝に予告され、その日の終わりに効く)
  function planIntents(state) {
    const camp = state.camp, B = bal(), A = B.rivalAI;
    camp.intents = [];
    rivals(camp).filter(function (c) { return !c.human; }).forEach(function (c) {   // 対戦モードの、もう1人の人間は予告しない
      const role = B.roles[c.role];
      const n = role.actions[Math.min(camp.day, role.actions.length) - 1];
      const chosen = {};
      for (let i = 0; i < n; i++) {
        const r = R.weighted(state, regions(), function (reg) {
          const s = camp.shares[reg.id], my = s[c.id];
          let best = 0;
          Object.keys(s).forEach(function (k) { if (k !== c.id && s[k] > best) best = s[k]; });
          let w = reg.voters * (1 / (1 + Math.abs(my - best) / A.closeScale)) * (baseOf(reg.id)[c.party] / A.affinityBase);
          if (Math.abs(my - s.me) < A.defendWithin) w *= A.defendMult;
          if (chosen[reg.id]) w *= 0.25;
          return w;
        });
        chosen[r.id] = true;
        camp.intents.push({ who: c.id, region: r.id, gain: role.gain, what: R.pick(state, ['街頭演説', '集会', '戸別訪問', '演説会']) });
      }
    });
  }
  function morningEvent(state) {
    const camp = state.camp, B = bal(), E = B.events;
    if (R.next(state) >= E.chance) return;
    const ids = ['rain', 'tailwind', 'headwind', 'gaffe', 'donation'];
    const id = R.weighted(state, ids, function (k) { return E[k].weight; });
    const party = Game.Data.PARTIES[state.player.party].name;
    let title, text;
    const fx = [];
    if (id === 'rain') {
      camp.today.rain = true;
      title = '朝から雨';
      text = '今日は街頭演説が届きにくい(' + E.rain.speech + ')。雨の中の戸別訪問は心に残る(+' + E.rain.door + ')。';
    } else if (id === 'tailwind' || id === 'headwind') {
      regions().forEach(function (r) { fx.push({ region: r.id, who: 'me', gain: Math.round(applyGain(camp, r.id, 'me', E[id].all)) }); });
      title = id === 'tailwind' ? '党に追い風' : '党に逆風';
      text = id === 'tailwind'
        ? party + 'の党首の発言が好評。全地区で支持が ' + E.tailwind.all + ' ポイント上がった。'
        : party + 'の幹部の発言が批判を浴びている。全地区で支持が ' + (-E.headwind.all) + ' ポイント下がった。';
    } else if (id === 'gaffe') {
      const who = cand(camp, topRival(camp));
      regions().forEach(function (r) { fx.push({ region: r.id, who: who.id, gain: Math.round(applyGain(camp, r.id, who.id, E.gaffe.all)) }); });
      title = '相手の失言';
      text = who.name + '候補の演説での一言が波紋を広げている。' + who.short + '候補の支持が全地区で ' + (-E.gaffe.all) + ' ポイント下がった。';
    } else {
      camp.money += E.donation.money;
      title = '支援者からの寄付';
      text = '「がんばって」と、地元の支援者から ' + E.donation.money + '万円の寄付が届いた。';
    }
    camp.pending.push({ type: 'event', id: id, title: title, text: text, fx: fx });
  }
  function pollHeadline(camp) {
    const o = overall(camp), m = margin(o);
    const me = cand(camp, 'me').short, rv = cand(camp, topRival(camp)).short;
    if (m >= 8) return me + '氏が先行、' + rv + '氏は追う展開';
    if (m >= 2) return me + '氏やや先行、' + rv + '氏が激しく追う';
    if (m > -2) return me + '氏と' + rv + '氏が横一線';
    if (m > -8) return rv + '氏やや先行、' + me + '氏が激しく追う';
    return rv + '氏が先行、' + me + '氏は苦しい戦い';
  }
  function startDay(state) {
    const camp = state.camp, B = bal();
    camp.day += 1;
    camp.energy = B.campaign.energy;
    camp.blocked = {};
    camp.today = {};
    draw(state);
    planIntents(state);
    const first = cand(camp, camp.intents[0].who);
    camp.news = camp.day + '日目の朝。' + first.short + '陣営は今日、' + Game.Data.REGION[camp.intents[0].region].name + 'に入るもよう。';
    if (camp.day === 1) {
      camp.pending.push({ type: state.career ? 'again' : 'intro' });
    } else if (camp.day === B.pollDay) {
      camp.pending.push({ type: 'poll', headline: pollHeadline(camp), overall: overall(camp) });
    } else if (camp.day === B.debateDay) {
      camp.pending.push({ type: 'debate' });
    } else if (!Game.Scandal.campaignFraud(state)) {   // 選挙違反がらみの出来事(R10)が起きなければ、ふつうの朝の出来事
      morningEvent(state);
    }
    Game.Scandal.campaignSlush(state);   // 裏金の報道・討論会での追及(R9)
    if (camp.day === B.campaign.days) {
      camp.pending.push({ type: 'event', id: 'lastday', title: '最終日', text: '「最後のお願い」に声がかれる。今日は、地区を選ぶカードの効果がすべて +' + B.campaign.lastDayBonus + '。', fx: [] });
    }
  }
  // 朝の知らせを1つ閉じる
  function dismiss(state) { state.camp.pending.shift(); }
  // 公開討論会の選択
  function chooseDebate(state, opt) {
    const camp = state.camp, D = bal().debate;
    if (!camp.pending.length || camp.pending[0].type !== 'debate') return null;
    const fx = [];
    let text;
    if (opt === 'slush' && Game.Scandal.rivalRumor(state)) {   // 対戦モード:もう1人の裏金を追及する(R9)
      const r = Game.Scandal.pvpAttack(state);
      fx.push.apply(fx, r.fx);
      text = r.text;
    } else if (opt === 'attack') {
      const who = cand(camp, topRival(camp));
      if (R.next(state) < D.attack.chance) {
        regions().forEach(function (r) { fx.push({ region: r.id, who: who.id, gain: Math.round(applyGain(camp, r.id, who.id, D.attack.hit)) }); });
        text = who.short + '候補の実績の弱いところを突いた。相手は言葉に詰まり、会場がどよめいた。' + who.short + '候補の支持が全地区で ' + (-D.attack.hit) + ' ポイント下がった。';
      } else {
        regions().forEach(function (r) { fx.push({ region: r.id, who: 'me', gain: Math.round(applyGain(camp, r.id, 'me', D.attack.miss)) }); });
        text = '相手を追及したが、うまくかわされた。「揚げ足取りだ」と受け取られ、全地区で支持が ' + (-D.attack.miss) + ' ポイント下がった。';
      }
    } else if (opt === 'local') {
      regions().forEach(function (r) {
        if (r.tags.some(function (t) { return D.local.tags.indexOf(t) >= 0; })) {
          fx.push({ region: r.id, who: 'me', gain: Math.round(applyGain(camp, r.id, 'me', D.local.gain)) });
        }
      });
      text = '地元の暮らしの話に、会場のお年寄りと親たちがうなずいた。高齢層・子育て世帯の地区で支持が ' + D.local.gain + ' ポイント伸びた。';
    } else {
      regions().forEach(function (r) { fx.push({ region: r.id, who: 'me', gain: Math.round(applyGain(camp, r.id, 'me', D.policy.all)) }); });
      text = '政策を落ち着いて語った。派手さはないが、全地区で支持が ' + D.policy.all + ' ポイント伸びた。';
    }
    camp.pending[0] = { type: 'event', id: 'debateResult', title: '公開討論会を終えて', text: text, fx: fx };
    camp.news = text;
    return { text: text, fx: fx };
  }
  // この日を終える:相手の動きが効き、次の日へ。最終日のあとは投票へ
  function endDay(state) {
    const camp = state.camp, B = bal();
    if (camp.pending.length) return { ok: false, reason: '先に知らせを確かめよう。' };
    const fx = [];
    camp.intents.forEach(function (it) {
      if (camp.blocked[it.region]) { fx.push({ region: it.region, who: it.who, gain: 0, blocked: true }); return; }
      let g = saturated(camp, it.region, it.who) ? Math.round(it.gain * B.campaign.saturatedMult) : it.gain, shielded = false;
      if (camp.shields[it.region] > 0) {
        g = Math.round(g * (1 - B.campaign.shieldBlock));
        camp.shields[it.region] -= 1;
        shielded = true;
      }
      fx.push({ region: it.region, who: it.who, gain: Math.round(applyGain(camp, it.region, it.who, g)), shielded: shielded });
    });
    camp.hand.forEach(function (c) { camp.discard.push(c.id); });
    camp.hand = [];
    if (camp.day >= B.campaign.days) {
      camp.intents = [];
      Game.Vote.run(state);
      state.screen = 'count';
      return { ok: true, fx: fx, over: true };
    }
    startDay(state);
    return { ok: true, fx: fx, over: false };
  }

  return {
    newCampaign: newCampaign, play: play, endDay: endDay, dismiss: dismiss, chooseDebate: chooseDebate,
    canPlay: canPlay, cardGain: cardGain, isTarget: isTarget, overall: overall, margin: margin, ranking: ranking,
    mark: mark, cand: cand, saturated: saturated, rivals: rivals, topRival: topRival, applyGain: applyGain,
    baseOf: baseOf, turnoutOf: turnoutOf,
    // 対戦モード(js/engine/versus.js)が、日の進め方を組み立て直すときに使う
    draw: draw, planIntents: planIntents, morningEvent: morningEvent, pollHeadline: pollHeadline,
  };
})();
