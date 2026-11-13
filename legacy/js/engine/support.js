// 支援団体の関係度、推薦、要望イベント、政教分離の追及。
// 選挙戦(campaign.js)と投票(vote.js)から呼ばれる。DOMには触らない。
//
// camp.support = {
//   relations:    { candId: { orgId: 0〜100 } },
//   pledges:      { candId: [policyId, ...] },   // 公約
//   endorsements: { orgId: candId | null },       // 1つの団体は1人だけ推薦する
//   ownCandidate: { orgId: candId },              // 独自候補を立てている団体(幸福実現党など)
//   visits:       { orgId: 回数 },
//   promises:     [{ org, policy, day, status, progress }], // 要望を受けた約束。任期中に果たす(career.js)
//   banned:       [orgId],                      // 約束を破ったため今回は推薦しない団体
// }
window.Game = window.Game || {};

Game.Support = (function () {
  const Bal = () => Game.Balance.orgs;
  const ORGS = () => Game.Data.ORGANIZATIONS;
  const rand = (camp) => Game.Campaign._internal.rand(camp);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const orgIds = () => Object.keys(ORGS());

  function traitMult(bonus, traits) {
    let m = 1;
    for (const k in bonus || {}) m += bonus[k] * ((traits[k] ?? 0.5) - 0.5);
    return Math.max(0.2, m);
  }

  // ---------------- 政策の矛盾 ----------------
  function conflicts(a, b) {
    return Game.Data.POLICY_CONFLICTS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  }
  // pledges の中で policies とぶつかるものの組
  function conflictPairs(pledges, policies) {
    const out = [];
    for (const p of pledges) for (const q of policies) if (conflicts(p, q)) out.push([p, q]);
    return out;
  }
  function canAddPledge(pledges, policy) {
    return !pledges.includes(policy) && !pledges.some((p) => conflicts(p, policy));
  }

  // 公約による関係度の補正
  function pledgeBonus(pledges, org) {
    const B = Bal();
    let v = 0;
    for (const p of pledges) {
      if (org.policies.includes(p)) v += B.pledgeMatch;
      if (org.policies.some((q) => conflicts(p, q))) v += B.pledgeConflict;
    }
    return v;
  }

  // プレイヤーの最初の関係度(前回の選挙から引き継ぐ値があればそれを使う)
  function initialRelations(party, pledges, carried) {
    const B = Bal();
    const base = B.partyBase[party] || {};
    const out = {};
    for (const id of orgIds()) {
      if (carried && carried[id] !== undefined) out[id] = carried[id];
      else out[id] = clamp((base[id] || 0) * B.playerFactor + pledgeBonus(pledges, ORGS()[id]), 0, 100);
    }
    return out;
  }

  function isEligible(camp, orgId, cid) {
    const S = camp.support;
    const org = ORGS()[orgId];
    if (S.ownCandidate[orgId]) return S.ownCandidate[orgId] === cid;
    if ((S.banned || []).includes(orgId) && camp.candidates.find((c) => c.id === cid).isPlayer) return false;
    return S.relations[cid][orgId] >= Bal().endorseThreshold && conflictPairs(S.pledges[cid], org.policies).length === 0;
  }

  // ---------------- 初期化 ----------------
  // opts: { pledges: [..], carried: { relations, promises } }
  function init(camp, opts) {
    const B = Bal();
    // banned: 約束を破ったため、この選挙ではプレイヤーを推薦しない団体
    const S = { relations: {}, pledges: {}, endorsements: {}, ownCandidate: {}, visits: {}, promises: [], banned: [] };
    camp.support = S;
    for (const c of camp.candidates) {
      if (c.isPlayer) {
        S.pledges[c.id] = (opts.pledges || []).slice();
        S.relations[c.id] = initialRelations(c.party, S.pledges[c.id], opts.carried && opts.carried.relations);
      } else {
        S.pledges[c.id] = (Game.Data.PARTY_PLATFORMS[c.party] || []).slice();
        const base = B.partyBase[c.party] || {};
        const rel = {};
        for (const id of orgIds()) {
          const bonus = c.role && c.role.startsWith('incumbent') ? B.incumbentBonus : 0;
          rel[id] = clamp((base[id] || 0) + bonus + pledgeBonus(S.pledges[c.id], ORGS()[id]), 0, 100);
        }
        S.relations[c.id] = rel;
      }
      // 宗教団体が支持母体の政党の候補は、その団体の独自候補
      const party = Game.Data.PARTIES[c.party];
      if (party && party.supportOrg) {
        S.ownCandidate[party.supportOrg] = c.id;
        S.relations[c.id][party.supportOrg] = 100;
      }
    }
    if (opts.carried && opts.carried.promises) S.promises = opts.carried.promises.map((p) => Object.assign({}, p));
    if (opts.carried && opts.carried.banned) S.banned = opts.carried.banned.slice();
    for (const id of orgIds()) S.endorsements[id] = null;
    evaluate(camp, true);
  }

  // ---------------- 推薦の判定 ----------------
  // 毎晩呼ぶ。変化をニュースの文にして返す
  function evaluate(camp, silent) {
    const S = camp.support;
    const lines = [];
    const name = (cid) => {
      const c = camp.candidates.find((x) => x.id === cid);
      return c.isPlayer ? 'あなた' : `${c.name}候補`;
    };
    for (const id of orgIds()) {
      const org = ORGS()[id];
      const cur = S.endorsements[id];
      let next = cur && isEligible(camp, id, cur) ? cur : null;
      let best = null;
      let bv = -1;
      for (const c of camp.candidates) {
        if (!isEligible(camp, id, c.id)) continue;
        const v = S.relations[c.id][id];
        if (v > bv) { bv = v; best = c.id; }
      }
      if (!next) next = best;
      else if (best && best !== next && bv >= S.relations[next][id] + Bal().switchMargin) next = best;
      if (next !== cur) {
        S.endorsements[id] = next;
        if (silent) continue;
        if (cur && !next) lines.push(`${org.name}が${name(cur)}への推薦を取り消した。`);
        else if (cur && next) lines.push(`${org.name}が推薦を${name(cur)}から${name(next)}に切り替えた。`);
        else lines.push(`${org.name}が${name(next)}の推薦を決めた。`);
      }
    }
    return lines;
  }

  function endorsedOrgs(camp, cid) {
    const S = camp.support;
    return orgIds().filter((id) => S.endorsements[id] === cid);
  }

  // ---------------- 票への効果 ----------------
  // 推薦団体の組織票(地区ごと)。opts.solidMult(雨)、opts.election(期日前投票を上乗せ)
  function orgTerm(camp, reg, cid, opts) {
    if (!camp.support) return 0;
    const B = Bal();
    let v = 0;
    for (const id of endorsedOrgs(camp, cid)) {
      const s = B.strength[id];
      const rel = camp.support.relations[cid][id];
      let t = s.power * traitMult(s.traits, reg.traits) * (B.relationEffectMin + (1 - B.relationEffectMin) * rel / 100);
      if (opts && opts.election) t *= 1 + (s.earlyVote || 0);
      v += t;
    }
    if (camp.mode === 'national') v *= B.nationalMult;   // 全国モードでは組織票の重みを抑える
    return v * ((opts && opts.solidMult) || 1);
  }

  // 戸別訪問の効果アップ
  function doorMult(camp, cid) {
    if (!camp.support) return 1;
    return 1 + endorsedOrgs(camp, cid).reduce((s, id) => s + (Bal().strength[id].doorBonus || 0), 0);
  }

  // 独自候補を立てている団体と政策が重なる候補は、票が割れる
  function splitFactor(camp, cid) {
    const S = camp.support;
    if (!S) return 1;
    let m = 1;
    for (const id in S.ownCandidate) {
      if (S.ownCandidate[id] === cid) continue;
      const overlap = S.pledges[cid].filter((p) => ORGS()[id].policies.includes(p)).length;
      m *= 1 - overlap * Bal().splitPerPolicy;
    }
    return m;
  }

  // 比例票の融通:創価学会が推薦した候補の党から公明党へ
  function prTransfers(camp) {
    const S = camp.support;
    if (!S) return [];
    const out = [];
    for (const id of orgIds()) {
      const org = ORGS()[id];
      const cid = S.endorsements[id];
      if (!org.party || !cid || S.ownCandidate[id]) continue;
      const cand = camp.candidates.find((c) => c.id === cid);
      if (cand.party === org.party) continue;
      out.push({ from: cand.party, to: org.party, rate: Bal().komeitoTransfer });
    }
    return out;
  }

  // ---------------- 行動 ----------------
  function relate(camp, cid, orgId, delta) {
    const r = camp.support.relations[cid];
    const before = r[orgId];
    r[orgId] = clamp(before + delta, 0, 100);
    return r[orgId] - before;
  }

  // 支援団体回り
  function visit(camp, cid, orgId, mult) {
    const S = camp.support;
    const n = S.visits[cid + ':' + orgId] || 0;
    S.visits[cid + ':' + orgId] = n + 1;
    if (S.ownCandidate[orgId] && S.ownCandidate[orgId] !== cid) {
      return { delta: relate(camp, cid, orgId, Bal().visit * 0.3 * mult), own: true };
    }
    return { delta: relate(camp, cid, orgId, Bal().visit * Math.pow(Bal().visitDiminish, n) * mult), own: false };
  }

  // AI候補の支援団体回り:いちばん関係の深い団体へ
  function aiVisit(camp, cid, mult) {
    const rel = camp.support.relations[cid];
    const id = orgIds().filter((o) => !camp.support.ownCandidate[o]).sort((a, b) => rel[b] - rel[a])[0];
    visit(camp, cid, id, mult);
  }

  // 団体挨拶:その地区に強い団体との関係が少し上がる
  function onGreet(camp, cid, reg, mult) {
    const B = Bal();
    const touched = [];
    for (const id of orgIds()) {
      if (traitMult(B.strength[id].traits, reg.traits) >= B.greetTraitMin) {
        relate(camp, cid, id, B.greetRelation * mult);
        touched.push(id);
      }
    }
    return touched;
  }

  // 毎晩:AIの関係づくり、経済団体の資金援助
  function nightly(camp) {
    const B = Bal();
    const lines = [];
    for (const c of camp.candidates) {
      if (c.isPlayer) continue;
      for (const id of endorsedOrgs(camp, c.id)) relate(camp, c.id, id, B.aiDailyRelation);
    }
    const pid = camp.player.id;
    for (const id of endorsedOrgs(camp, pid)) {
      const m = B.strength[id].money;
      if (m) {
        camp.player.money += m;
        camp.player.broke = false;
        lines.push(`${ORGS()[id].name}から${m}万円の資金援助があった。`);
      }
    }
    return lines.concat(evaluate(camp));
  }

  // ---------------- 朝のイベント ----------------
  function rollEvent(camp) {
    const B = Bal();
    if (rand(camp) >= B.eventChance) return null;
    const pid = camp.player.id;
    const S = camp.support;
    const rel = S.relations[pid];
    const weights = Object.assign({}, B.eventWeights);
    const religiousClose = orgIds().filter((id) => ORGS()[id].kind === 'religious' && (S.endorsements[id] === pid || rel[id] >= B.secularism.closeRelation));
    if (!religiousClose.length) delete weights.secularism;
    const keys = Object.keys(weights);
    const total = keys.reduce((s, k) => s + weights[k], 0);
    let r = rand(camp) * total;
    let kind = keys[keys.length - 1];
    for (const k of keys) { r -= weights[k]; if (r <= 0) { kind = k; break; } }

    if (kind === 'request') {
      // 関係がある団体の、まだ公約にしていない政策
      const cands = [];
      for (const id of orgIds()) {
        if (S.ownCandidate[id] || rel[id] < B.request.minRelation) continue;
        for (const p of ORGS()[id].policies) if (!S.pledges[pid].includes(p)) cands.push({ org: id, policy: p });
      }
      if (!cands.length) return null;
      const pk = cands[Math.floor(rand(camp) * cands.length)];
      const org = ORGS()[pk.org];
      const pol = Game.Data.POLICIES[pk.policy].name;
      const ok = canAddPledge(S.pledges[pid], pk.policy);
      const hurt = orgIds().filter((id) => id !== pk.org && ORGS()[id].policies.some((q) => conflicts(q, pk.policy)));
      const hurtText = hurt.length ? `(${hurt.map((id) => ORGS()[id].name).join('・')}とは考えが合わない)` : '';
      return {
        id: 'orgRequest', title: `${org.name}からの要望`, org: pk.org, policy: pk.policy,
        text: `${org.name}が「${pol}」を公約に入れてほしいと求めている。受ければ約束になり、当選後に守れるかが問われる。`,
        choices: [
          { id: 'accept', label: '公約に入れて約束する', note: ok ? `関係度が大きく上がる${hurtText}` : '今の公約と矛盾するため受けられない', disabled: !ok },
          { id: 'postpone', label: '「検討します」と答える', note: '関係度が少し下がる' },
          { id: 'decline', label: 'はっきり断る', note: '関係度が下がる' },
        ],
      };
    }
    if (kind === 'invite') {
      const ids = orgIds().filter((id) => !S.ownCandidate[id] && rel[id] >= 15);
      if (!ids.length) return null;
      const id = ids[Math.floor(rand(camp) * ids.length)];
      const org = ORGS()[id];
      return {
        id: 'orgInvite', title: `${org.name}の行事に招待`, org: id,
        text: `${org.name}の行事にあいさつに来てほしいと招かれた。出れば今日の行動が1回減る。`,
        choices: [
          { id: 'attend', label: '出席してあいさつする', note: `関係度が上がる(行動1回・体力${B.invite.stamina})` },
          { id: 'decline', label: '日程が合わないと断る', note: '関係度が少し下がる' },
        ],
      };
    }
    if (kind === 'secularism') {
      const id = religiousClose[Math.floor(rand(camp) * religiousClose.length)];
      const org = ORGS()[id];
      return {
        id: 'secularism', title: '政教分離について質問', org: id,
        text: `街頭での囲み取材で、${org.name}との関係について政教分離の観点から質問された。都市部の有権者が注目している。`,
        choices: [
          { id: 'explain', label: '丁寧に説明する', note: '都市部の支持の目減りを小さくできる' },
          { id: 'dodge', label: '「問題ない」と短く答える', note: '都市部の支持が少し離れる' },
          { id: 'distance', label: '距離を置くと答える', note: '都市部への影響はないが、団体との関係が下がる' },
        ],
      };
    }
    return null;
  }

  function resolve(camp, ev, choice) {
    const B = Bal();
    const pid = camp.player.id;
    const S = camp.support;
    const org = ORGS()[ev.org];
    if (ev.id === 'orgRequest') {
      const pol = Game.Data.POLICIES[ev.policy].name;
      if (choice === 'accept' && canAddPledge(S.pledges[pid], ev.policy)) {
        S.pledges[pid].push(ev.policy);
        relate(camp, pid, ev.org, B.request.accept);
        S.promises.push({ org: ev.org, policy: ev.policy, day: camp.day, status: 'open', progress: 0 });
        const hurt = [];
        for (const id of orgIds()) {
          if (id !== ev.org && ORGS()[id].policies.some((q) => conflicts(q, ev.policy))) {
            relate(camp, pid, id, B.request.conflictLoss);
            hurt.push(ORGS()[id].name);
          }
        }
        return `「${pol}」を公約に加え、${org.name}と約束した。${hurt.length ? hurt.join('・') + 'は不満を示した。' : ''}`;
      }
      if (choice === 'postpone') {
        relate(camp, pid, ev.org, B.request.postpone);
        return `「検討します」と答えた。${org.name}の反応は冷ややかだった。`;
      }
      relate(camp, pid, ev.org, B.request.decline);
      return `${org.name}の要望を断った。関係が少し冷えた。`;
    }
    if (ev.id === 'orgInvite') {
      if (choice === 'attend') {
        relate(camp, pid, ev.org, B.invite.relation);
        camp.actionsLeft = Math.max(0, camp.actionsLeft - 1);
        camp.player.stamina = Math.max(0, camp.player.stamina - B.invite.stamina);
        return `${org.name}の行事に出席してあいさつした。関係が深まった。`;
      }
      relate(camp, pid, ev.org, B.invite.decline);
      return `${org.name}の招待を断った。`;
    }
    if (ev.id === 'secularism') {
      const sec = B.secularism;
      if (choice === 'distance') {
        relate(camp, pid, ev.org, sec.distanceRelation);
        return `「特定の団体とは一定の距離を保つ」と答えた。${org.name}との関係は冷えた。`;
      }
      const mult = choice === 'explain' ? sec.explainMult : 1;
      for (const reg of camp.regionList) {
        const st = camp.regions[reg.id];
        st.personal[pid] = Math.max(0, st.personal[pid] - sec.penalty * mult * reg.traits.urban);
      }
      return choice === 'explain'
        ? '支援を受けていることと、政策は自分で判断していることを丁寧に説明した。都市部の支持はわずかに離れた。'
        : '「問題ない」と短く答えた。都市部の支持が少し離れた。';
    }
    return '';
  }

  // 選挙が終わったら、プレイヤーの分を state に引き継ぐ形にする
  function exportState(camp) {
    const S = camp.support;
    const pid = camp.player.id;
    return {
      relations: Object.assign({}, S.relations[pid]),
      pledges: S.pledges[pid].slice(),
      endorsedBy: endorsedOrgs(camp, pid),
      promises: S.promises.slice(),
    };
  }

  return {
    conflicts,
    conflictPairs,
    canAddPledge,
    initialRelations,
    isEligible,
    init,
    evaluate,
    endorsedOrgs,
    orgTerm,
    doorMult,
    splitFactor,
    prTransfers,
    visit,
    aiVisit,
    onGreet,
    nightly,
    rollEvent,
    resolve,
    exportState,
  };
})();
