// 選挙戦エンジン。選挙区モード(5地区)と全国モード(11ブロック)で共用する。
// 「地域(region)」は地区でもブロックでもよい。地域ごと・候補ごとに
//   recog(知名度 0〜100) / personal(個人支持) / solid(固い票=組織票)
// を持ち、政党支持率と合わせて得票シェアを出す。
// 数値はすべて Game.Balance から読む。
window.Game = window.Game || {};

Game.Campaign = (function () {
  const Bal = () => Game.Balance;

  // ---------------- 乱数(セーブに乗る種つき) ----------------
  function rand(camp) {
    let t = (camp.rng = (camp.rng + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function gauss(camp) {
    const u = Math.max(rand(camp), 1e-9);
    const v = rand(camp);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function pick(camp, arr) {
    return arr[Math.floor(rand(camp) * arr.length)];
  }
  function weightedPick(camp, weights) {
    const keys = Object.keys(weights);
    const total = keys.reduce((s, k) => s + weights[k], 0);
    let r = rand(camp) * total;
    for (const k of keys) {
      r -= weights[k];
      if (r <= 0) return k;
    }
    return keys[keys.length - 1];
  }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // ---------------- モードと行動の定義 ----------------
  const MODES = {
    district: {
      label: '選挙区モード',
      regionLabel: '地区',
      regions: () => Game.Data.DISTRICTS,
      actions: ['street', 'door', 'sns', 'rally', 'greet', 'org', 'leader', 'fund', 'rest'],
    },
    // 全国モード:地域 = 全国11ブロック、候補 = 政党(national.js が組み立てる)
    national: {
      label: '全国モード',
      regionLabel: 'ブロック',
      regions: () => Game.Data.BLOCKS || [],
      actions: ['tour', 'focus', 'manifesto', 'sns', 'org', 'fund', 'rest'],
    },
  };

  // 行動の表示情報(数値は balance.js)
  const ACTIONS = {
    street: { name: '街頭演説', icon: '📣', target: 'region', desc: '駅前や交差点でマイクを握る。知名度が大きく上がる。都市部ほど効く。' },
    door:   { name: '戸別訪問', icon: '🚪', target: 'region', desc: '一軒ずつ訪ねて握手。支持が固まる。農村・住宅地で効く。体力を使う。' },
    sns:    { name: 'SNS発信', icon: '📱', target: 'post',   desc: '投稿の種類を選ぶ。話題度は知名度に、好感度は票につながる。若い世代・都市部に強い。炎上することも。' },
    rally:  { name: '集会',     icon: '🎤', target: 'region', desc: '会場を借りて決起集会。支持と勢いが上がる。資金がかかる。' },
    greet:  { name: '団体挨拶', icon: '🙇', target: 'region', desc: '町内会・商店会・業界団体にあいさつ。崩れにくい固い票が増える。' },
    org:    { name: '支援団体回り', icon: '🤝', target: 'org', desc: '支援団体を1つ選んで訪ね、関係を深める。関係度が上がると推薦がもらえる。' },
    leader: { name: '党幹部の応援', icon: '⭐', target: 'region', desc: '党の幹部が応援に駆けつける。その地区で大きく伸び、周りにも波及。回数に限りあり。' },
    fund:   { name: '資金集め', icon: '💴', target: 'none',   desc: '支援者に資金を頼む。回を重ねるごとに集まりにくくなる。' },
    rest:   { name: '休息',     icon: '☕', target: 'none',   desc: '事務所で休んで体力を回復する。' },
    // 全国モード
    tour:      { name: '全国遊説',       icon: '🚄', target: 'region', desc: '党首がブロックを回って応援演説。党の知名度と支持が上がる。' },
    focus:     { name: '資金の重点配分', icon: '💴', target: 'region', desc: '接戦のブロックに選挙資金を重点的に回す。支持が上がる。資金がかかる。' },
    manifesto: { name: '公約発表',       icon: '📘', target: 'all',    desc: '党の公約を発表する。全ブロックで支持と勢いが上がる。1回だけ。' },
  };

  // ---------------- 地域の特徴と相性 ----------------
  // 倍率 = 1 + Σ bonus × (trait − 0.5)
  function traitMult(bonus, traits) {
    if (!bonus) return 1;
    let m = 1;
    for (const k in bonus) m += bonus[k] * ((traits[k] ?? 0.5) - 0.5);
    return Math.max(0.2, m);
  }
  function regionById(camp, rid) {
    return camp.regionList.find((r) => r.id === rid);
  }
  function partySupport(camp, party) {
    const p = Bal().parties[party];
    return Math.max(0, (p ? p.support : 0) + (camp.partyShift[party] || 0));
  }
  // 選挙区ごとの党の地力を足した支持率(選挙区モードの地区での強さだけに使う。balance.js の seats.support)
  function localSupport(camp, party) {
    return Math.max(0, partySupport(camp, party) + ((camp.localShift || {})[party] || 0));
  }
  function orgAffinity(party, traits) {
    const p = Bal().parties[party];
    if (!p) return 0;
    return p.orgStrength * traitMult(p.orgLean, traits);
  }

  // ---------------- 支持とシェア ----------------
  // opts.solidMult: 固い票の重み(投票日の雨など)。opts.election: 投票日(期日前投票を上乗せ)
  function appeal(camp, rid, cid, opts) {
    const C = Bal().campaign;
    const reg = regionById(camp, rid);
    const st = camp.regions[rid];
    const cand = camp.candidates.find((c) => c.id === cid);
    const rf = C.recogFloor + (1 - C.recogFloor) * (st.recog[cid] / 100);
    const partyTerm = localSupport(camp, cand.party) * C.partyWeight * traitMult(Bal().parties[cand.party].lean, reg.traits);
    const solidMult = (opts && opts.solidMult) || 1;
    // SNSの好感度は個人支持と同じように効く(組織票には効かない)
    const snsState = camp.humans ? (camp.humanState[cid] || {}).sns : cand.isPlayer ? camp.sns : null;
    const snsTerm = snsState ? Game.Sns.favorTerm(snsState, reg.traits, camp.mode) : 0;
    // 選挙区ごとの党の地盤(マイナスなら地元での逆風)。固い票と同じ重みで効く
    const localSolid = (camp.localSolid || {})[cand.party] || 0;
    let a = ((st.personal[cid] + snsTerm) * rf + partyTerm) * camp.momentum[cid] + (st.solid[cid] + localSolid) * solidMult;
    if (camp.support) {
      a += Game.Support.orgTerm(camp, reg, cid, opts);
      a *= Game.Support.splitFactor(camp, cid);
    }
    return Math.max(C.appealFloor, a);
  }

  // { regionId: { candId: share } }
  function shares(camp, opts) {
    const ex = camp.mode === 'national' ? Bal().national.shareExponent : Bal().campaign.shareExponent;
    const out = {};
    for (const reg of camp.regionList) {
      const raw = {};
      let sum = 0;
      for (const c of camp.candidates) {
        raw[c.id] = Math.pow(appeal(camp, reg.id, c.id, opts), ex);
        sum += raw[c.id];
      }
      out[reg.id] = {};
      for (const c of camp.candidates) out[reg.id][c.id] = raw[c.id] / sum;
    }
    return out;
  }

  function turnout(reg) {
    const V = Bal().vote;
    return clamp(V.turnoutBase + Object.keys(V.turnoutTrait).reduce((s, k) => s + V.turnoutTrait[k] * ((reg.traits[k] ?? 0.5) - 0.5), 0), 0.2, 0.9);
  }

  // 情勢の目安(得票の期待値)。本当の開票計算は M2 の vote.js が行う。
  function estimateVotes(camp, shareMap) {
    const sh = shareMap || shares(camp);
    const byRegion = {};
    const total = {};
    camp.candidates.forEach((c) => (total[c.id] = 0));
    for (const reg of camp.regionList) {
      byRegion[reg.id] = {};
      const voters = reg.voters * turnout(reg);
      for (const c of camp.candidates) {
        const v = voters * sh[reg.id][c.id];
        byRegion[reg.id][c.id] = v;
        total[c.id] += v;
      }
    }
    return { byRegion, total };
  }

  // ---------------- 対戦モード(versus.js) ----------------
  // 人が操作する候補が2人いる:camp.humans = [候補id]、camp.humanState = { 候補id: { player, sns, flags } }。
  // 行動の前に activate でその人の資金・体力・SNS を camp.player / camp.sns に差し込んでから、いつもの関数を使う
  // (セーブを読み直すと参照が切れるので、正しい値はいつも humanState のほう)
  function activate(camp, cid) {
    if (!camp.humans) return;
    const h = camp.humanState[cid];
    camp.player = h.player;
    camp.sns = h.sns;
    camp.partyFlags = h.flags || null;
  }
  const isHuman = (camp, cid) => !!(camp.humans && camp.humans.includes(cid));

  // ---------------- 作成 ----------------
  // opts: { mode, seed, candidates: [{id,name,party,isPlayer,role,recog,personal,skill}], player: {money, leaderVisits},
  //         support: { pledges, carried } (支援団体。support.js) }
  function create(opts) {
    const C = Bal().campaign;
    const mode = MODES[opts.mode];
    // 地域は opts.regions(補選・首長選はほかの選挙区のこともある)か、モードの地域。地図の位置と説明も持たせる(画面はここを読む)
    const regionList = (opts.regions || mode.regions()).map((r) => ({ id: r.id, name: r.name, voters: r.voters, traits: r.traits, map: r.map, description: r.description }));
    const camp = {
      mode: opts.mode,
      rng: (opts.seed >>> 0) || 1,
      day: 1,
      days: opts.days || C.days,
      sub: opts.sub || null,   // 補欠選挙・地方選挙(local.js)のときの情報
      actionsLeft: C.actionsPerDay,
      regionList,
      candidates: opts.candidates.map((c) => ({
        id: c.id, name: c.name, party: c.party, isPlayer: !!c.isPlayer, role: c.role,
        skill: c.skill ?? 1, leaderVisitsLeft: c.leaderVisits ?? 0,
      })),
      regions: {},
      momentum: {},
      partyShift: {},
      localShift: opts.localShift || {},   // 選挙区ごとの党の地力(支持率の上乗せ)
      localSolid: opts.localSolid || {},   // 選挙区ごとの党の地盤(全地区の固い票に足す。マイナスもある)
      player: null,
      today: null,
      log: [],
      polls: [],
      outlook: null,
      pending: null,
      morning: null,
      finished: false,
      partyFlags: opts.partyFlags || null,
    };
    const startSolid = Bal().start.solidBase;
    for (const reg of regionList) {
      const st = { recog: {}, personal: {}, solid: {} };
      // recog / personal は数値(全地区同じ)か、地区ごとのオブジェクト(前の選挙からの引き継ぎ)
      const at = (v) => (v && typeof v === 'object' ? v[reg.id] || 0 : v || 0);
      for (const c of opts.candidates) {
        st.recog[c.id] = at(c.recog);
        st.personal[c.id] = at(c.personal);
        st.solid[c.id] = startSolid * orgAffinity(c.party, reg.traits) + at(c.solidBonus);
      }
      camp.regions[reg.id] = st;
    }
    for (const c of opts.candidates) {
      camp.momentum[c.id] = 1;
      camp.partyShift[c.party] = (opts.partyShift && opts.partyShift[c.party]) || 0;
    }
    const pc = opts.candidates.find((c) => c.isPlayer);
    camp.player = {
      id: pc.id,
      money: opts.player.money,
      stamina: C.staminaStart,
      fundUses: 0,
      broke: false,
    };
    if (opts.support && Game.Support) Game.Support.init(camp, opts.support);
    // SNS(任期中の話題度・好感度を一部持ち越す)
    if (Game.Sns) {
      camp.sns = Game.Sns.create(opts.sns || null);
      Game.Sns.newTrend(camp.sns, () => rand(camp));
    }
    newDay(camp);
    camp.outlook = makeOutlook(camp, null);
    camp.morning = {
      day: 1,
      title: '選挙戦スタート',
      lines: [
        `公示日。${camp.days}日間の選挙戦が始まった。`,
        '出陣式で第一声。今日は行動の効果が少し上がる。',
      ],
      event: null,
    };
    addLog(camp, `公示。${camp.days}日間の選挙戦が始まった。`, 'news');
    return camp;
  }

  // 選挙区(Game.Data.applySeat で選んだもの。最初は北陽3区)の選挙戦を組み立てる
  // extra(2回目以降の選挙で career.js が渡す):
  //   pledges: 公約、carried: 支援団体の関係・約束・推薦停止、
  //   player: { role, recog: {地区}, personal: {地区}, solidBonus: {地区}, money, leaderVisitsBonus },
  //   rivals: [{ party, name, role }]、partyShift: { 政党: 支持率の増減 }
  function newDistrictCampaign(playerName, partyId, seed, extra) {
    extra = extra || {};
    const pledges = extra.pledges || (Game.Data.PARTY_PLATFORMS[partyId] || []).slice(0, 2);
    const S = Bal().start;
    const ep = extra.player || {};
    // イージーモード:プレイヤーの知名度・支持・資金を上乗せし、対立候補を少し弱くする
    const E = extra.easy ? Bal().easy : null;
    const plus = (v, add) => (!E ? v : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).map((k) => [k, v[k] + add])) : v + add);
    const candidates = [
      {
        id: 'player', name: playerName, party: partyId, isPlayer: true, role: ep.role || 'newcomer',
        recog: plus(ep.recog || S.playerRecog, E ? E.playerRecog : 0), personal: plus(ep.personal || S.playerPersonal, E ? E.playerPersonal : 0), solidBonus: ep.solidBonus,
        leaderVisits: (S.byParty[partyId] || { leaderVisits: 0 }).leaderVisits + (ep.leaderVisitsBonus || 0),
      },
    ];
    const rivalList = extra.rivals && extra.rivals.length ? extra.rivals : Object.keys(Game.Data.RIVAL_ROLES[partyId]).map((rp) => ({
      party: rp, name: Game.Data.RIVALS[rp].name, role: Game.Data.RIVAL_ROLES[partyId][rp],
    }));
    for (const rv of rivalList) {
      const rp = rv.party;
      const role = rv.role;
      const base = Bal().rivals[role];
      // 前の選挙にも出た人は地盤(地区ごと)を持ち越す(career.js)。新しい人は役割の基準値
      // 持ち越しても、役割の基準値(現職・元職・新人)を下回らない
      const home = rv.home;
      const floor = (obj, min) => Object.fromEntries(Object.keys(obj).map((k) => [k, Math.max(min, obj[k])]));
      candidates.push({
        id: 'rival_' + rp, name: rv.name, party: rp, isPlayer: false, role,
        recog: home ? floor(home.recog, base.recog) : base.recog, personal: home ? floor(home.personal, base.personal) : base.personal,
        skill: (role.startsWith('incumbent') ? Bal().ai.skill.incumbent : Bal().ai.skill.challenger) * (E ? E.rivalSkill : 1),
        leaderVisits: Bal().ai.leaderVisits[rp],
      });
    }
    // 幸福の科学の推薦がもらえる状態(関係度・公約)でなければ、幸福実現党が独自候補を立てる
    if (Game.Data.RIVALS.kofuku && Game.Support) {
      const org = Game.Data.ORGANIZATIONS.kofuku;
      const rel = Game.Support.initialRelations(partyId, pledges, extra.carried && extra.carried.relations).kofuku;
      const agrees = Game.Support.conflictPairs(pledges, org.policies).length === 0;
      if (!(rel >= Game.Balance.orgs.endorseThreshold && agrees)) {
        const base = Bal().rivals.minor;
        candidates.push({
          id: 'rival_kofuku', name: Game.Data.RIVALS.kofuku.name, party: 'kofuku', isPlayer: false, role: 'newcomer',
          recog: base.recog, personal: base.personal, skill: Bal().ai.skill.minor, leaderVisits: 0,
        });
      }
    }
    return create({
      mode: 'district', seed, candidates, player: { money: (ep.money !== undefined ? ep.money : (S.byParty[partyId] || { money: 0 }).money) + (E ? E.money : 0) },
      support: { pledges, carried: extra.carried }, partyShift: extra.partyShift, localShift: Object.assign({}, (Bal().seats[Game.Data.SEAT_ID] || {}).support), localSolid: Object.assign({}, (Bal().seats[Game.Data.SEAT_ID] || {}).solid), partyFlags: extra.partyFlags, sns: extra.sns,
    });
  }

  // 補欠選挙・地方選挙の短期決戦(local.js が組み立てる)。opts: { regions, days, candidates, money, sub, support, localShift, localSolid, sns, seed }
  function newSubCampaign(opts) {
    return create(Object.assign({ mode: 'district' }, opts, { player: { money: opts.money } }));
  }

  function newDay(camp) {
    camp.actionsLeft = Bal().campaign.actionsPerDay;
    camp.today = { mods: {}, done: {}, event: null };
  }

  function addLog(camp, text, kind) {
    camp.log.push({ day: camp.day, text, kind: kind || 'info' });
    if (camp.log.length > 200) camp.log.shift();
  }

  // ---------------- 効果の適用 ----------------
  function dayMult(camp) {
    const C = Bal().campaign;
    if (camp.day === 1) return C.firstDayMultiplier;
    if (camp.day === camp.days) return C.finalDayMultiplier;
    return 1;
  }

  function gainRecog(camp, rid, cid, g) {
    const st = camp.regions[rid];
    const before = st.recog[cid];
    // 上がるときは100に近いほど伸びにくい
    st.recog[cid] = clamp(before + (g > 0 ? g * (1 - before / 100) : g), 0, 100);
    return st.recog[cid] - before;
  }
  function gainPersonal(camp, rid, cid, g) {
    const st = camp.regions[rid];
    const cap = Bal().campaign.personalSoftCap;
    const before = st.personal[cid];
    st.personal[cid] = Math.max(0, before + (g > 0 ? (g * cap) / (cap + before) : g));
    return st.personal[cid] - before;
  }
  function gainSolid(camp, rid, cid, g) {
    const st = camp.regions[rid];
    const cap = Bal().campaign.solidSoftCap;
    const before = st.solid[cid];
    st.solid[cid] = Math.max(0, before + (g > 0 ? (g * cap) / (cap + before) : g));
    return st.solid[cid] - before;
  }
  function gainMomentum(camp, cid, g) {
    const C = Bal().campaign;
    camp.momentum[cid] = clamp(camp.momentum[cid] + g, C.momentumMin, C.momentumMax);
  }

  // その日のイベントによる倍率
  function eventMult(camp, aid, rid) {
    const E = Bal().events;
    const mods = camp.today.mods;
    let m = 1;
    if (mods.rain) {
      if (aid === 'street') m *= E.rain.streetMult;
      if (aid === 'rally') m *= E.rain.rallyMult;
      if (aid === 'door') m *= E.rain.doorMult;
    }
    if (mods.festival && mods.festival === rid) {
      if (aid === 'door') m *= E.festival.doorMult;
      if (aid === 'greet') m *= E.festival.greetMult;
    }
    return m;
  }

  // 行動の効果を適用し、増えた量を返す。mult は効率(体力・資金・AIの腕前など)
  function applyAction(camp, cid, aid, rid, mult) {
    const A = Bal().actions[aid];
    const res = { recog: 0, personal: 0, solid: 0, note: null };
    const key = cid + ':' + aid + '@' + (rid || '-');
    let m = mult * dayMult(camp) * eventMult(camp, aid, rid);
    // 新党:政党要件がないとポスター・選挙カーが少ない。新しさがあるうちはSNSに強い
    const pf = camp.partyFlags;
    if (pf && cid === camp.player.id) {
      const NB = Game.Balance.newParty;
      if (pf.noRequirement && (aid === 'street' || aid === 'rally')) m *= NB.noRequirementStreet;
      if (aid === 'sns') m *= 1 + (pf.newness / 100) * NB.snsNewnessBoost;
    }
    if (camp.today.done[key]) m *= Bal().campaign.repeatPenalty;
    camp.today.done[key] = (camp.today.done[key] || 0) + 1;

    if (aid === 'manifesto') {
      // 公約発表:全ブロックで支持と勢い
      for (const reg of camp.regionList) res.personal += gainPersonal(camp, reg.id, cid, A.personalAll * m);
      gainMomentum(camp, cid, A.momentum * m);
      if (cid === camp.player.id) camp.manifestoUsed = (camp.manifestoUsed || 0) + 1;
    } else if (aid === 'street' || aid === 'door' || aid === 'rally' || aid === 'greet' || aid === 'tour' || aid === 'focus') {
      const reg = regionById(camp, rid);
      let mm = m * traitMult(A.traitBonus, reg.traits);
      if (aid === 'door' && camp.support) mm *= Game.Support.doorMult(camp, cid);
      if (aid === 'greet' && camp.support) Game.Support.onGreet(camp, cid, reg, m);
      if (A.recog) res.recog += gainRecog(camp, rid, cid, A.recog * mm);
      if (A.personal) res.personal += gainPersonal(camp, rid, cid, A.personal * mm);
      if (A.solid) res.solid += gainSolid(camp, rid, cid, A.solid * mm);
      if (A.momentum) gainMomentum(camp, cid, A.momentum * m);
    } else if (aid === 'sns' && cid === camp.player.id && camp.sns) {
      // プレイヤーの投稿:rid に投稿の種類が入る(sns.js)
      const pledges = camp.support ? camp.support.pledges[cid] || [] : [];
      const r = Game.Sns.post(camp.sns, rid, () => rand(camp), { mult: m, pledges });
      for (const reg of camp.regionList) {
        res.recog += gainRecog(camp, reg.id, cid, Bal().sns.campaign.recogAll * r.recogMult * Game.Sns.traitMult(reg.traits));
      }
      if (r.flame) gainMomentum(camp, cid, -Bal().sns.campaign.flameMomentum * r.flame.sev);
      res.sns = r;
    } else if (aid === 'sns') {
      let sm = m;
      const r = rand(camp);
      let flop = false;
      if (r < A.buzzChance) {
        sm *= A.buzzMultiplier;
        res.note = 'buzz';
      } else if (r < A.buzzChance + A.flopChance) {
        flop = true;
        res.note = 'flop';
      }
      for (const reg of camp.regionList) {
        const tm = traitMult(A.traitBonus, reg.traits);
        res.recog += gainRecog(camp, reg.id, cid, A.recogAll * sm * tm);
        res.personal += gainPersonal(camp, reg.id, cid, (flop ? A.flopPersonal : A.personalAll) * sm * tm);
      }
    } else if (aid === 'leader') {
      for (const reg of camp.regionList) {
        const f = reg.id === rid ? 1 : A.spill;
        res.recog += gainRecog(camp, reg.id, cid, A.recog * m * f);
        res.personal += gainPersonal(camp, reg.id, cid, A.personal * m * f);
      }
      gainMomentum(camp, cid, A.momentum * m);
    } else if (aid === 'org' && camp.support) {
      // rid には団体のidが入る。AIは関係のいちばん深い団体を回る
      if (rid) {
        const v = Game.Support.visit(camp, cid, rid, m);
        res.relation = v.delta;
        res.note = v.own ? 'own' : null;
      } else {
        Game.Support.aiVisit(camp, cid, m);
      }
    }
    return res;
  }

  // ---------------- プレイヤーの行動 ----------------
  function staminaCost(camp, aid) {
    const A = Bal().actions[aid];
    if (!A.stamina) return 0;
    return A.stamina + (camp.today.mods.heat ? Bal().events.heat.staminaCost : 0);
  }

  function availableActions(camp) {
    const P = camp.player;
    const me = camp.candidates.find((c) => c.id === P.id);
    return MODES[camp.mode].actions.map((aid) => {
      const A = Bal().actions[aid];
      const info = ACTIONS[aid];
      const st = staminaCost(camp, aid);
      const money = A.money || 0;
      let enabled = camp.actionsLeft > 0 && !camp.finished && !camp.pending;
      let reason = '';
      if (aid !== 'rest' && P.stamina < st) { enabled = false; reason = '体力が足りない'; }
      if (money > P.money) { enabled = false; reason = '資金が足りない'; }
      if (aid === 'leader' && me.leaderVisitsLeft <= 0) { enabled = false; reason = '応援の枠を使い切った'; }
      if (aid === 'manifesto' && (camp.manifestoUsed || 0) >= Game.Balance.national.manifestoMax) { enabled = false; reason = '発表ずみ'; }
      const a = { id: aid, ...info, stamina: st, money, enabled, reason };
      if (aid === 'fund') a.gain = Math.round(A.moneyGain * Math.pow(A.diminish, P.fundUses));
      if (aid === 'rest') a.gain = A.staminaGain;
      if (aid === 'leader') a.left = me.leaderVisitsLeft;
      return a;
    });
  }

  function playerEfficiency(camp) {
    const C = Bal().campaign;
    let e = 1;
    if (camp.player.stamina < C.staminaLowThreshold) e *= C.staminaLowEfficiency;
    if (camp.player.broke) e *= C.brokeEfficiency;
    if (camp.player.capacity) e *= camp.player.capacity;   // 全国モード:党の規模(組織・資金)で選挙戦の届く範囲が違う
    if (camp.player.tempMult) e *= camp.player.tempMult;   // 対戦モード:同じブロックで遊説がぶつかると打ち消し合う
    return e;
  }

  function fmt(n) {
    const v = Math.round(n * 10) / 10;
    return (v >= 0 ? '+' : '') + v;
  }

  // 戻り値: { ok, text }
  function doPlayerAction(camp, aid, rid) {
    const act = availableActions(camp).find((a) => a.id === aid);
    if (!act || !act.enabled) return { ok: false, text: act ? act.reason : 'その行動はできない' };
    if (act.target === 'region' && !regionById(camp, rid)) return { ok: false, text: '地区を選んでください' };
    if (act.target === 'org' && !(Game.Data.ORGANIZATIONS && Game.Data.ORGANIZATIONS[rid])) return { ok: false, text: '団体を選んでください' };
    if (act.target === 'post' && !(Game.Data.SNS_POST_TYPES && Game.Data.SNS_POST_TYPES[rid])) return { ok: false, text: '投稿の種類を選んでください' };
    const P = camp.player;
    const A = Bal().actions[aid];
    const me = camp.candidates.find((c) => c.id === P.id);
    const regName = act.target === 'region' ? regionById(camp, rid).name : act.target === 'org' ? Game.Data.ORGANIZATIONS[rid].name : '';
    const eff = playerEfficiency(camp);
    let text = '';

    P.stamina = clamp(P.stamina - act.stamina, 0, Bal().campaign.staminaMax);
    P.money -= act.money;

    if (aid === 'fund') {
      const g = act.gain;
      P.money += g;
      P.fundUses++;
      P.broke = false;
      text = `支援者を回って資金集め。${g}万円が集まった。`;
    } else if (aid === 'rest') {
      P.stamina = clamp(P.stamina + A.staminaGain, 0, Bal().campaign.staminaMax);
      text = `事務所でひと休み。体力が回復した(体力 ${Math.round(P.stamina)})。`;
    } else {
      if (aid === 'leader') me.leaderVisitsLeft--;
      const r = applyAction(camp, P.id, aid, rid, eff);
      const parts = [];
      if (Math.abs(r.recog) >= 0.05) parts.push(`知名度${fmt(r.recog)}`);
      if (Math.abs(r.personal) >= 0.05) parts.push(`支持${fmt(r.personal)}`);
      if (Math.abs(r.solid) >= 0.05) parts.push(`固い票${fmt(r.solid)}`);
      if (r.relation !== undefined) parts.push(`関係度${fmt(r.relation)}`);
      const detail = parts.length ? `(${parts.join('、')})` : '';
      const flavor = actionFlavor(camp, aid, regName, r);
      text = flavor + detail;
      if (eff / (P.tempMult || 1) < (P.capacity || 1) - 1e-9) text += ' ※疲れや資金不足で効果が落ちている';
    }
    camp.actionsLeft--;
    addLog(camp, `${ACTIONS[aid].icon} ${text}`, 'action');
    return { ok: true, text };
  }

  function actionFlavor(camp, aid, regName, r) {
    const rain = camp.today.mods.rain;
    switch (aid) {
      case 'street': return rain ? `雨の${regName}で街頭演説。足を止める人は少なかった。` : `${regName}で街頭演説。足を止めて聞く人がいた。`;
      case 'door': return `${regName}で戸別訪問。一軒ずつ頭を下げて回った。`;
      case 'rally': return `${regName}で集会を開いた。会場の熱気が伝わってきた。`;
      case 'greet': return `${regName}の町内会や業界団体にあいさつして回った。`;
      case 'org': return r.note === 'own' ? `${regName}を訪ねたが、独自候補を立てているため反応は控えめだった。` : `${regName}を訪ね、支援をお願いした。`;
      case 'leader': return `党幹部が${regName}に応援に駆けつけた。大きな人だかりができた。`;
      case 'sns':
        if (r.sns) return r.sns.text;
        if (r.note === 'buzz') return 'SNSの投稿がバズった! 一気に拡散された。';
        if (r.note === 'flop') return 'SNSの投稿がすべった。冷ややかな反応が並んだ。';
        return 'SNSで政策を発信した。';
      case 'tour': return rain ? `雨の${regName}ブロックを遊説した。聴衆はまばらだった。` : `${regName}ブロックを遊説し、各地で応援演説をした。`;
      case 'focus': return `${regName}ブロックに選挙資金を重点的に回した。`;
      case 'manifesto': return '党の公約を発表した。各紙が一面で取り上げた。';
    }
    return '';
  }

  // ---------------- AI候補 ----------------
  function aiTurn(camp, cand) {
    const AI = Bal().ai;
    const persona = camp.mode === 'national'
      ? AI.personaNational[cand.party] || AI.personaNational.default
      : AI.persona[cand.party] || AI.persona.default;
    const sh = shares(camp);
    const actions = [];
    const daysLeft = camp.days - camp.day + 1;
    for (let i = 0; i < Bal().campaign.actionsPerDay; i++) {
      let aid;
      if (cand.leaderVisitsLeft > 0 && rand(camp) < cand.leaderVisitsLeft / daysLeft) {
        aid = 'leader';
        cand.leaderVisitsLeft--;
      } else {
        aid = weightedPick(camp, persona);
      }
      let rid = null;
      if (ACTIONS[aid].target === 'region') rid = aiPickRegion(camp, cand, aid, sh);
      applyAction(camp, cand.id, aid, rid, cand.skill);
      actions.push({ aid, rid });
    }
    return actions;
  }

  // 接戦の地区、有権者の多い地区、その行動が効く地区を選ぶ
  function aiPickRegion(camp, cand, aid, sh) {
    const A = Bal().actions[aid];
    let best = null;
    let bestScore = -Infinity;
    const maxVoters = Math.max(...camp.regionList.map((r) => r.voters));
    for (const reg of camp.regionList) {
      const mine = sh[reg.id][cand.id];
      let other = 0;
      for (const c of camp.candidates) if (c.id !== cand.id) other = Math.max(other, sh[reg.id][c.id]);
      const close = 1 - Math.min(1, Math.abs(mine - other) * 3);
      const score = (reg.voters / maxVoters) * (0.5 + close) * traitMult(A.traitBonus, reg.traits) + rand(camp) * Bal().ai.targetNoise;
      if (score > bestScore) { bestScore = score; best = reg.id; }
    }
    return best;
  }

  // ---------------- 1日の終わり ----------------
  function endDay(camp) {
    if (camp.finished || camp.pending) return;
    const C = Bal().campaign;
    const lines = [];

    // ライバル陣営の動き
    for (const cand of camp.candidates) {
      if (cand.isPlayer || isHuman(camp, cand.id)) continue;
      const acts = aiTurn(camp, cand);
      const desc = acts.map((a) => (a.rid ? `${regionById(camp, a.rid).name}で${ACTIONS[a.aid].name}` : ACTIONS[a.aid].name)).join('、');
      lines.push(`${cand.name}陣営:${desc}`);
    }

    // 夜の処理(対戦モードは2人とも)
    const humans = camp.humans || [camp.player.id];
    for (const hid of humans) {
      activate(camp, hid);
      const P = camp.player;
      P.money -= C.dailyUpkeep;
      if (P.money <= 0) {
        P.money = 0;
        P.broke = true;
        lines.push(`${camp.humans ? camp.candidates.find((c) => c.id === hid).name + ':' : ''}資金が底をついた。ボランティアへの手当が滞り、明日は動きが鈍る。`);
      }
      P.stamina = clamp(P.stamina + C.staminaDailyRecover, 0, C.staminaMax);
    }
    activate(camp, humans[0]);
    for (const cid in camp.momentum) {
      const m = camp.momentum[cid];
      camp.momentum[cid] = m > 1 ? Math.max(1, m - C.momentumDecay) : Math.min(1, m + C.momentumDecay);
    }

    const supportLines = camp.support ? Game.Support.nightly(camp) : [];
    for (const hid of humans) {
      activate(camp, hid);
      // 対戦モードは「あなた」を候補の名前にする
      const who = camp.humans ? camp.candidates.find((c) => c.id === hid).name : null;
      if (camp.sns) supportLines.push(...snsNightly(camp, hid === humans[0]).map((l) => (who ? l.replace(/^あなた/, who) : l)));
    }
    activate(camp, humans[0]);

    const pollTonight = C.pollDays.includes(camp.day);
    if (pollTonight) {
      const poll = takePoll(camp, C.pollNoise);
      camp.polls.push(poll);
    }

    if (camp.day >= camp.days) {
      camp.finished = true;
      camp.outlook = makeOutlook(camp, takePoll(camp, C.pollNoise));
      camp.morning = { day: camp.day, title: '選挙戦の終わり', lines: ['午後8時、マイク納め。12日間の選挙戦が終わった。', ...lines], event: null, final: true };
      addLog(camp, '選挙戦が終わった。あとは投票日を待つだけ。', 'news');
      return;
    }

    camp.day++;
    newDay(camp);
    const ev = rollMorningEvent(camp);
    camp.outlook = makeOutlook(camp, pollTonight ? camp.polls[camp.polls.length - 1] : null);
    const morningLines = supportLines.slice();
    if (pollTonight) morningLines.push('新聞各社が情勢調査を発表した。');
    if (camp.day === camp.days) morningLines.push('最終日。「最後のお願い」で行動の効果が上がる。');
    camp.morning = { day: camp.day, title: `${camp.day}日目の朝`, lines: morningLines, rivals: lines, event: ev, poll: pollTonight };
  }

  // SNS:話題度が知名度に少しずつ効き、好感度・話題度は薄れる。団体との近さが話題になることも
  function snsNightly(camp, trendLine) {
    const s = camp.sns;
    const pid = camp.player.id;
    const lines = Game.Sns.tick(s, 'day');
    for (const reg of camp.regionList) gainRecog(camp, reg.id, pid, s.buzz * Bal().sns.campaign.buzzRecogDaily * Game.Sns.traitMult(reg.traits));
    if (camp.support && rand(camp) < Bal().sns.orgTopic.chanceDay) {
      const S = camp.support;
      const org = Game.Sns.closeOrg(S.relations[pid], Object.keys(S.endorsements).filter((id) => S.endorsements[id] === pid), () => rand(camp));
      if (org) lines.push(Game.Sns.orgTopic(s, () => rand(camp), org));
    }
    const t = Game.Sns.newTrend(s, () => rand(camp));
    if (trendLine !== false) lines.push(`今日のトレンド:#${t.word}`);
    return lines;
  }

  // ---------------- 情勢調査 ----------------
  function takePoll(camp, noise) {
    const sh = shares(camp);
    const regions = {};
    for (const reg of camp.regionList) {
      const raw = {};
      let sum = 0;
      for (const c of camp.candidates) {
        raw[c.id] = Math.max(0.01, sh[reg.id][c.id] + gauss(camp) * noise);
        sum += raw[c.id];
      }
      regions[reg.id] = {};
      for (const c of camp.candidates) regions[reg.id][c.id] = raw[c.id] / sum;
    }
    return { day: camp.day, regions };
  }

  function outlookLabel(diff) {
    const O = Bal().campaign.outlook;
    if (diff >= O.strong) return { key: 'strong', label: '優勢' };
    if (diff >= O.lean) return { key: 'lean', label: 'やや優勢' };
    if (diff > -O.lean) return { key: 'toss', label: '接戦' };
    if (diff > -O.strong) return { key: 'behind', label: 'やや劣勢' };
    return { key: 'weak', label: '劣勢' };
  }

  // poll があればそれを、なければ誤差の大きい「陣営の感触」を使う
  function makeOutlook(camp, poll) {
    const src = poll || takePoll(camp, Bal().campaign.feelNoise);
    const pid = camp.player.id;
    const regions = {};
    for (const reg of camp.regionList) {
      const s = src.regions[reg.id];
      let other = 0;
      for (const c of camp.candidates) if (c.id !== pid) other = Math.max(other, s[c.id]);
      regions[reg.id] = { ...outlookLabel(s[pid] - other), shares: s };
    }
    const est = estimateVotes(camp, src.regions);
    const sum = Object.values(est.total).reduce((a, b) => a + b, 0);
    const overallShares = {};
    for (const cid in est.total) overallShares[cid] = est.total[cid] / sum;
    let other = 0;
    for (const c of camp.candidates) if (c.id !== pid) other = Math.max(other, overallShares[c.id]);
    return {
      source: poll ? 'poll' : 'feel',
      day: poll ? poll.day : camp.day,
      regions,
      overall: { ...outlookLabel(overallShares[pid] - other), shares: overallShares },
    };
  }

  // ---------------- 朝のイベント ----------------
  function rollMorningEvent(camp) {
    const C = Bal().campaign;
    const E = Bal().events;
    if (camp.humans) {
      if (camp.day === C.debateDay) return { id: 'debate', title: '党首討論', text: '今日は党首討論。2人の論戦で勢いが変わる。' };
    } else if (camp.day === C.debateDay) {
      camp.pending = { type: 'debate' };
      const nat = camp.mode === 'national';
      return {
        id: 'debate',
        title: nat ? '党首討論' : '公開討論会',
        text: nat ? '記者クラブ主催の党首討論会が開かれる。全国に中継される。どう臨む?' : '青年会議所の主催で、候補者の公開討論会が開かれる。どう臨む?',
        choices: [
          { id: 'policy', label: '政策で勝負する', note: `全${nat ? 'ブロック' : '地区'}で支持が少しずつ上がる。堅実。` },
          { id: 'attack', label: '相手の弱点を突く', note: '決まれば勢いがつくが、外すと印象が悪くなる。' },
          { id: 'local', label: nat ? '地方の暮らしを語る' : '地元への思いを語る', note: '支持と固い票が少し上がる。' },
        ],
      };
    }
    // 前の日の炎上(投稿・切り抜き)に対応する
    if (!camp.humans && camp.sns && camp.sns.queue.length) {
      const fev = Game.Sns.surface(camp.sns, { money: camp.player.money });
      camp.pending = { type: 'flame', event: fev };
      camp.today.event = fev;
      addLog(camp, `🔥 ${fev.title}`, 'news');
      return fev;
    }
    if (camp.support && !camp.humans) {
      const sev = Game.Support.rollEvent(camp);
      if (sev) {
        camp.pending = { type: sev.id, event: sev };
        camp.today.event = sev;
        addLog(camp, `📨 ${sev.text}`, 'news');
        return sev;
      }
    }
    if (rand(camp) >= C.eventChance) return null;
    const weights = Object.assign({}, camp.mode === 'national' ? E.weightsNational : E.weights);
    if (camp.humans) delete weights.snsHoax;   // 対戦モードではデマを出さない(どちらに出すか決められない)
    const id = weightedPick(camp, weights);
    const mods = camp.today.mods;
    const isReal = (party) => !!(Game.Data.PARTIES[party] && Game.Data.PARTIES[party].real);
    const rivals = camp.candidates.filter((c) => !c.isPlayer && !isReal(c.party));
    const parties = [...new Set(camp.candidates.map((c) => c.party))].filter((p) => !isReal(p));
    const pname = (p) => (Game.Data.PARTIES[p] || (Game.Data.MINOR_PARTIES || {})[p] || (Game.Data.PARTIES_EXTRA || {})[p] || { name: p }).name;
    let ev = null;
    switch (id) {
      case 'rain':
        mods.rain = true;
        ev = { id, title: '雨', text: '朝から冷たい雨。今日は街頭演説と集会の効果が落ちる。' };
        break;
      case 'festival': {
        const reg = pick(camp, camp.regionList);
        mods.festival = reg.id;
        ev = { id, title: `${reg.name}で秋祭り`, text: `${reg.name}で秋祭り。今日はこの地区での戸別訪問と団体挨拶がよく効く。` };
        break;
      }
      case 'partyScandal': {
        const p = pick(camp, parties);
        camp.partyShift[p] += E.partyScandal.supportShift;
        ev = { id, title: '党の不祥事', text: `${pname(p)}の議員の政治資金問題が報じられた。${pname(p)}の支持率が下がった。` };
        break;
      }
      case 'partyBoost': {
        const p = pick(camp, parties);
        camp.partyShift[p] += E.partyBoost.supportShift;
        ev = { id, title: '党首の発言が好評', text: `${pname(p)}の党首の演説がテレビで好評。${pname(p)}の支持率が上がった。` };
        break;
      }
      case 'rivalGaffe': {
        const r = pick(camp, rivals);
        gainMomentum(camp, r.id, E.rivalGaffe.momentum);
        ev = camp.mode === 'national'
          ? { id, title: '他党幹部の失言', text: `${r.name}の幹部が街頭演説で失言。党の勢いが落ちた。` }
          : { id, title: 'ライバルの失言', text: `${r.name}候補が演説で失言。陣営の勢いが落ちた。` };
        break;
      }
      case 'celebrity': {
        const c = pick(camp, camp.candidates.filter((x) => !isReal(x.party)));
        const reg = pick(camp, camp.regionList);
        gainRecog(camp, reg.id, c.id, E.celebrity.recog);
        gainPersonal(camp, reg.id, c.id, E.celebrity.personal);
        ev = { id, title: '有名人の応援', text: `地元出身のタレントが${reg.name}で${c.isPlayer ? 'あなた' : c.name + '候補'}の応援に入った。` };
        break;
      }
      case 'snsHoax': {
        if (!camp.sns) break;
        Game.Sns.hoax(camp.sns, () => rand(camp));
        ev = Game.Sns.surface(camp.sns, { money: camp.player.money });
        camp.pending = { type: 'flame', event: ev };
        break;
      }
      case 'heat':
        mods.heat = true;
        ev = { id, title: '季節外れの暑さ', text: '季節外れの暑さ。今日は行動の体力消費が増える。' };
        break;
    }
    if (ev) {
      camp.today.event = ev;
      addLog(camp, `📰 ${ev.text}`, 'news');
    }
    return ev;
  }

  // 朝の選択イベントに答える(公開討論会、支援団体の要望・招待、政教分離の質問)
  function resolveEvent(camp, choice) {
    if (!camp.pending) return null;
    if (camp.pending.type === 'debate') return resolveDebate(camp, choice);
    const ev = camp.pending.event;
    const ch = ev.choices.find((c) => c.id === choice);
    if (!ch || ch.disabled) return null;
    if (camp.pending.type === 'flame') {
      const r = Game.Sns.resolveFlame(camp.sns, ev, choice, () => rand(camp));
      camp.player.money = Math.max(0, camp.player.money - r.money);
      if (r.momentum) gainMomentum(camp, camp.player.id, r.momentum);
      camp.pending = null;
      addLog(camp, `🔥 ${r.text}`, 'news');
      return r.text;
    }
    const text = Game.Support.resolve(camp, ev, choice);
    camp.pending = null;
    addLog(camp, `📨 ${text}`, 'news');
    return text;
  }

  function resolveDebate(camp, choice) {
    if (!camp.pending || camp.pending.type !== 'debate') return null;
    const D = Bal().events.debate;
    const pid = camp.player.id;
    let text = '';
    if (choice === 'policy') {
      for (const reg of camp.regionList) gainPersonal(camp, reg.id, pid, D.policy.personalAll);
      text = '具体的な政策を丁寧に説明した。会場の反応は上々だった。';
    } else if (choice === 'attack') {
      if (rand(camp) < D.attack.successChance) {
        gainMomentum(camp, pid, D.attack.momentumWin);
        text = '相手の矛盾を鋭く突いた。翌日の新聞は「新人が現職を圧倒」と報じた。';
      } else {
        gainMomentum(camp, pid, D.attack.momentumLose);
        text = '批判が空回りし、会場に白けた空気が流れた。';
      }
    } else {
      for (const reg of camp.regionList) {
        gainPersonal(camp, reg.id, pid, D.local.personalAll);
        gainSolid(camp, reg.id, pid, D.local.solidAll);
      }
      text = '生まれ育った町への思いを語った。年配の聴衆がうなずいていた。';
    }
    // 発言が切り抜かれて拡散されることがある(文脈しだいで炎上も)
    if (camp.sns) {
      const key = { policy: 'debatePolicy', attack: 'debateAttack' }[choice] || 'debateLocal';
      const cl = Game.Sns.clip(camp.sns, () => rand(camp), key);
      if (cl) text += ' ' + cl.line;
    }
    camp.pending = null;
    addLog(camp, `🎙 ${camp.mode === 'national' ? '党首討論' : '公開討論会'}:${text}`, 'news');
    return text;
  }

  return {
    MODES,
    ACTIONS,
    create,
    activate,
    newDistrictCampaign,
    availableActions,
    doPlayerAction,
    endDay,
    resolveDebate,
    resolveEvent,
    shares,
    estimateVotes,
    turnout,
    regionById,
    partySupport,
    localSupport,
    newSubCampaign,
    // 自動プレイ・テスト用
    _internal: {
      applyAction, rand, gauss, takePoll, appeal, gainMomentum,
      // 党の組織票による固い票の初期値(後援会の分と区別するため career.js が使う)
      baseSolid: (party, reg) => Bal().start.solidBase * orgAffinity(party, reg.traits),
    },
  };
})();
