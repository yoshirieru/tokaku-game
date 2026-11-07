// 政策の結果と経済の指標(M14)。DOMには触らない。
//
// state.world.econ = {
//   growth: 景気(成長率%), prices: 物価(上昇率%), fiscal: 財政(健全度 0〜100), life: 暮らし(0〜100), security: 安全保障(0〜100),
//   pipeline: [{ policy, label, k, perTurn, delay, left, by }]   これから効いてくる効果(法案ごと・指標ごと)
//   history: [{ year, turnIndex, growth, prices, fiscal, life, security, mood }]   ターンごとの記録(新しいものが最後)
//   prev: 前のターンの値(画面の矢印に使う), lastShock, aiCooldown
// }
// 法案が成立すると enact() で効果を予定に積み、毎ターン turn() で少しずつ指標を動かす。
// 指標は「気分」(mood)になり、内閣支持率が戻っていく水準と、選挙での与党の追い風・逆風を動かす。
// 数値はすべて balance.js の Game.Balance.econ。
window.Game = window.Game || {};

Game.Economy = (function () {
  const EB = () => Game.Balance.econ;
  const KEYS = ['growth', 'prices', 'fiscal', 'life', 'security'];
  const LABEL = { growth: '景気', prices: '物価', fiscal: '財政', life: '暮らし', security: '安全保障' };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function ensure(state) {
    const w = state.world;
    if (!w) return null;
    if (!w.econ) {
      const S = EB().start;
      w.econ = Object.assign({}, S, { pipeline: [], history: [], prev: Object.assign({}, S), lastShock: null, cooldowns: {} });
    }
    if (!w.econ.cooldowns) w.econ.cooldowns = {};
    return w.econ;
  }

  function limit(e, k) {
    const L = EB().limits[k];
    e[k] = clamp(e[k], L[0], L[1]);
  }

  // ---------------- 気分(内閣支持率と選挙に効く) ----------------
  function mood(state) {
    const e = ensure(state);
    if (!e) return 0;
    const M = EB().mood;
    let m = (e.growth - M.growthFrom) * M.perGrowth;
    if (e.prices > M.pricesFrom) m += (e.prices - M.pricesFrom) * M.perPrices;
    if (e.prices < M.deflationFrom) m += (M.deflationFrom - e.prices) * M.perDeflation;
    m += (e.life - 50) * M.lifePer + (e.security - 50) * M.securityPer;
    if (e.fiscal < M.fiscalFrom) m += (M.fiscalFrom - e.fiscal) * M.perFiscal;
    return clamp(m, -M.max, M.max);
  }
  // 内閣支持率が戻っていく平均の上げ下げ
  function approvalShift(state) {
    return mood(state) * EB().mood.toApproval;
  }
  // 選挙のときの与党の支持率の上げ下げ(ポイント)
  function windForRuling(state) {
    const M = EB().mood;
    return clamp(mood(state) * M.toWind, -M.windMax, M.windMax);
  }

  // ---------------- 政策を実行する ----------------
  // effects を予定に積む。scale は議員立法などで小さくするとき
  function schedule(state, effects, label, policy, by, scale) {
    const e = ensure(state);
    for (const f of effects) {
      const v = f.v * (scale || 1);
      if (!v) continue;
      e.pipeline.push({ policy: policy || null, label, k: f.k, perTurn: v / f.spread, delay: f.delay, left: f.spread, by: by || 'pm' });
    }
  }
  // 法案が成立したとき。by:'pm'(首相の重要法案)| 'ai'(AIの政府)| 'member'(議員立法)
  function enact(state, policy, by) {
    const list = EB().policies[policy];
    if (!list) return;
    const name = (Game.Data.BILL_NAMES && Game.Data.BILL_NAMES[policy]) || `${Game.Data.POLICIES[policy].name}法案`;
    schedule(state, list, name, policy, by, by === 'member' ? EB().memberBillScale : 1);
  }
  // 首相の行動:経済対策・財政再建
  function stimulus(state) {
    schedule(state, EB().stimulus.effects, '経済対策(補正予算)', null, 'pm');
    ensure(state).cooldowns.stimulus = EB().stimulus.cooldown;
  }
  function fiscalReform(state, by) {
    schedule(state, EB().fiscalReform.effects, '財政再建(増税・歳出の見直し)', null, by || 'pm');
    ensure(state).cooldowns.fiscalReform = EB().fiscalReform.cooldown;
  }

  // ---------------- 毎ターン ----------------
  // rng: () => 0〜1。aiGov: AI の政府が動く党(プレイヤーが首相のときは null)。戻り値:知らせの行
  function turn(state, rng, aiGov) {
    const e = ensure(state);
    if (!e) return [];
    const B = EB();
    const lines = [];
    const gauss = () => {
      const u = Math.max(rng(), 1e-9);
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
    };
    e.prev = {};
    for (const k of KEYS) e.prev[k] = e[k];
    for (const k in e.cooldowns) if (e.cooldowns[k] > 0) e.cooldowns[k]--;

    // AI の政府:ときどき自分の党の政策を法案にして通す。財政が悪ければ財政再建
    if (aiGov) {
      if (e.fiscal < B.ai.fiscalReformBelow && !e.cooldowns.fiscalReform) {
        fiscalReform(state, 'ai');
        lines.push(`政府が財政再建のため、増税と歳出の見直しを決めた(財政 ${Math.round(e.fiscal)})。`);
      } else if (rng() < B.ai.billChance) {
        const plat = (Game.Data.PARTY_PLATFORMS[aiGov] || []).filter((p) => B.policies[p]);
        if (plat.length) {
          const p = plat[Math.floor(rng() * plat.length)];
          enact(state, p, 'ai');
          lines.push(`政府の${(Game.Data.BILL_NAMES && Game.Data.BILL_NAMES[p]) || Game.Data.POLICIES[p].name}が成立した。`);
        }
      }
    }

    // 予定の効果を少しずつ効かせる
    const started = new Set();
    for (const it of e.pipeline) {
      if (it.delay > 0) { it.delay--; continue; }
      if (!it.begun) { it.begun = true; if (it.by !== 'ai') started.add(it.label); }
      e[it.k] += it.perTurn;
      it.left--;
    }
    e.pipeline = e.pipeline.filter((it) => it.left > 0);
    for (const label of started) lines.push(`${label}の効果が出はじめた。`);

    // ふだんの動き:平均へ戻る、ぶれ、指標どうしのつながり
    for (const k of ['growth', 'prices', 'life', 'security']) {
      e[k] += (B.trend[k] - e[k]) * B.revert[k] + gauss() * B.noise[k];
    }
    e.prices += (e.growth - B.trend.growth) * B.prices.perGrowth;
    e.life += (e.growth - B.trend.growth) * B.life.perGrowth;
    if (e.prices > B.life.inflationFrom) e.life += (e.prices - B.life.inflationFrom) * B.life.perInflation;
    e.fiscal += B.fiscal.drift + (e.growth - B.fiscal.growthBase) * B.fiscal.perGrowth;

    // 外からの出来事
    e.lastShock = null;
    if (rng() < B.shocks.chance) {
      const L = B.shocks.list;
      const keys = Object.keys(L);
      let r = rng() * keys.reduce((s, k) => s + L[k].weight, 0);
      let pick = keys[keys.length - 1];
      for (const k of keys) { r -= L[k].weight; if (r <= 0) { pick = k; break; } }
      const s = L[pick];
      for (const k of KEYS) if (s[k]) e[k] += s[k];
      e.lastShock = pick;
      lines.push(`【経済】${s.text}`);
    }
    for (const k of KEYS) limit(e, k);

    const w = state.world;
    e.history.push({ year: w.year, turnIndex: w.turnIndex, growth: e.growth, prices: e.prices, fiscal: e.fiscal, life: e.life, security: e.security, mood: mood(state) });
    if (e.history.length > B.historyMax) e.history.shift();
    if (e.fiscal < B.fiscalWarn && e.prev.fiscal >= B.fiscalWarn) lines.push('財政の悪化が問題になっている。国債の格付けが下がるとの観測も出た。');
    return lines;
  }

  // ---------------- 画面用 ----------------
  // 指標ごとの状態のことば
  function status(state, k) {
    const e = ensure(state);
    const v = e[k];
    const S = EB().status[k] || EB().status.other;   // [しきい値, ことば, 色] を上から順に見る
    for (const [th, word, cls] of S) if (v >= th) return [word, cls];
    return [S[S.length - 1][1], S[S.length - 1][2]];
  }
  function format(k, v) {
    if (k === 'growth' || k === 'prices') return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
    return String(Math.round(v));
  }
  // 法案ごとにまとめた「これから効いてくる効果」
  function upcoming(state) {
    const e = ensure(state);
    const by = {};
    for (const it of e.pipeline) {
      const g = (by[it.label] = by[it.label] || { label: it.label, by: it.by, effects: {}, wait: Infinity, left: 0 });
      g.effects[it.k] = (g.effects[it.k] || 0) + it.perTurn * it.left;
      g.wait = Math.min(g.wait, it.delay);
      g.left = Math.max(g.left, it.delay + it.left);
    }
    return Object.values(by);
  }
  // 政策の効果のあらまし(法案を選ぶ画面)
  function preview(policy) {
    const list = EB().policies[policy];
    if (!list) return [];
    return list.map((f) => ({ k: f.k, label: LABEL[f.k], up: f.v > 0, good: f.k === 'prices' ? f.v < 0 : f.v > 0, delay: f.delay, spread: f.spread, size: Math.abs(f.v) }));
  }

  // ---------------- 首相の通信簿(レガシー評価) ----------------
  // 首相のあいだの気分を足しておく(government.js の turn から)
  function recordPM(state) {
    const g = state.gov;
    if (!g) return;
    g.econMoodSum = (g.econMoodSum || 0) + mood(state);
    g.econTurns = (g.econTurns || 0) + 1;
  }
  function legacyItems(state) {
    const g = state.gov;
    const L = EB().legacy;
    const out = [];
    if (!g || !g.econTurns) return out;
    const avg = g.econMoodSum / g.econTurns;
    out.push({ label: '経済と暮らし', value: `首相のあいだの平均 ${avg >= 0 ? '+' : ''}${avg.toFixed(1)}`, points: clamp(avg * L.moodPer, L.moodMin, L.moodMax) });
    const e = ensure(state);
    if (e && e.fiscal < L.fiscalBad) out.push({ label: '財政の悪化', value: `健全度 ${Math.round(e.fiscal)}`, points: -L.fiscalPenalty });
    return out;
  }

  return { KEYS, LABEL, ensure, mood, approvalShift, windForRuling, enact, stimulus, fiscalReform, turn, status, format, upcoming, preview, recordPM, legacyItems };
})();
