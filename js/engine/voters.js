// 1万人の架空の有権者(R18)。選挙戦の支持(camp.shares)は、この有権者たちの「好み」を地区ごとにまとめたもの。DOM には触らない。
//
// しくみ:
//   - 1人ひとりが候補ごとの「好み」s(合計1。投票先の見込み)を持つ。地区の支持 = その地区の有権者の s の平均 × 100
//   - カードや出来事で支持が g ポイント動くとき、地区の支持はこれまでどおり ちょうど g 動く(予告と実際は同じ)。
//     どの有権者が動くかだけが、カードの種類で変わる(街頭演説は関心の高い人、SNS はSNSをよく使う人、戸別訪問は少数に強く、推薦は団体の人)
//   - 1日の終わりに、知り合いのつながりで口コミが広がる(好みが少し近づく)。悪い噂は良い評判より速く広がる
//   - 投票日は、1人ひとりが投票に行くか(関心・天気・動員)と、投票先(好み + 選挙のぶれ)を決める
//   - 数値は型付き配列。セーブは camp.voters に、種と、変わった値(好みを0〜255にしたもの・動員・噂)だけ
// 数値は balance.js の voters。
window.Game = window.Game || {};

Game.Voters = (function () {
  const Mth = Math;   // 手もとに置く(自動プレイの vm の中では、Math をそのたびに引くと とても遅い)
  const VB = function () { return Game.Balance.voters; };
  const cache = new WeakMap();   // camp.voters(セーブされるもの)→ 型付き配列の本体

  // 種つきの乱数(有権者づくり専用。ゲームの乱数 state.rng は種を1回引くだけ)
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Mth.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Mth.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // 決まった値から作る 0〜1(戸別訪問の順番、噂の広がりなど。セーブに順番を持たなくてよい)
  function hash01(a, b, c) {
    let h = (a * 374761393 + b * 668265263 + c * 2147483647) >>> 0;
    h = Mth.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function pickW(r, items, weight) {
    let sum = 0;
    items.forEach(function (x) { sum += Mth.max(0, weight(x)); });
    let v = r() * sum;
    for (let i = 0; i < items.length; i++) { v -= Mth.max(0, weight(items[i])); if (v <= 0) return items[i]; }
    return items[items.length - 1];
  }
  function normal(r) { return Mth.sqrt(-2 * Mth.log(r() + 1e-12)) * Mth.cos(2 * Mth.PI * r()); }

  // ---------- 生成 ----------
  // 住んでいる人たち(属性と知り合い)は舞台ごとに同じ(種は舞台の名前から)。作るのに時間がかかるので、一度作ったら使い回す
  const people = {};
  function arenaSeed(id) { let h = 2166136261; for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Mth.imul(h, 16777619); } return h >>> 0; }
  function population(D) {
    const key = D.id + ':' + D.regions.map(function (r) { return r.id + r.voters; }).join(',');
    if (!people[key]) people[key] = generate(arenaSeed(key), D.regions, D.national ? VB().dotsNation : VB().dots);
    return people[key];
  }
  // 選挙ごとに変わるもの(好み・動員・戸別訪問・噂・点の色)を、住んでいる人たちに足す
  function fresh(D) {
    const base = population(D), rt = Object.assign({}, base);   // 属性の配列はそのまま共有(ふつうのオブジェクトにすると速い)
    rt.mob = new Float32Array(base.n); rt.visited = new Uint8Array(base.n); rt.prevTop = new Int8Array(base.n).fill(-1); rt.rumorSets = [];
    return rt;
  }
  // 属性(年齢・職業・地区・関心テーマ・団体・関心度・SNS・知り合い)は種と舞台(地区)から決まる。好み s はあとで入れる
  function generate(seed, regionList, nDots) {
    const B = VB(), D = Game.Data, N = B.count, r = rng(seed);
    const total = regionList.reduce(function (a, x) { return a + x.voters; }, 0);
    const counts = regionList.map(function (x) { return Mth.max(B.minPerRegion, Mth.round(N * x.voters / total)); });
    const n = counts.reduce(function (a, x) { return a + x; }, 0);
    const rt = {
      n: n, regionIds: regionList.map(function (x) { return x.id; }),
      region: new Uint8Array(n), age: new Uint8Array(n), job: new Uint8Array(n), t1: new Uint8Array(n), t2: new Uint8Array(n), grp: new Uint8Array(n),
      interest: new Float32Array(n), sns: new Float32Array(n), mob: new Float32Array(n), visited: new Uint8Array(n), lean: new Float32Array(0),
      byRegion: {}, weight: {}, sample: {},
    };
    const jobs = D.VOTER_JOBS, topics = D.VOTER_TOPICS, groups = D.VOTER_GROUPS;
    let i = 0;
    regionList.forEach(function (reg, ri) {
      const tags = reg.tags || [], has = function (t) { return tags.indexOf(t) >= 0; };
      const idx = new Int32Array(counts[ri]);
      rt.weight[reg.id] = reg.voters / counts[ri];   // 1人が実際の有権者の何人分か
      for (let k = 0; k < counts[ri]; k++, i++) {
        idx[k] = i;
        rt.region[i] = ri;
        // 年齢:若者の地区は若く、高齢層の地区は上に、子育て世帯の地区は30〜40代が多い
        const band = pickW(r, B.ageBands, function (b) { return b.w * (has('youth') ? b.youth : 1) * (has('elder') ? b.elder : 1) * (has('family') ? b.family : 1); });
        const age = band.from + Mth.floor(r() * (band.to - band.from + 1));
        rt.age[i] = age;
        // 職業:年齢と地区の性格から
        const job = pickW(r, jobs, function (j) {
          if (age < j.minAge || age > j.maxAge) return 0;
          let w = j.w;
          (j.tags || []).forEach(function (t) { if (has(t)) w *= B.jobTagMult; });
          return w;
        });
        rt.job[i] = jobs.indexOf(job);
        // 関心テーマ(上位2つ)
        const tw = function (t) { let w = 1; (t.jobs || []).forEach(function (jid) { if (jid === job.id) w += 3; }); if (t.minAge && age >= t.minAge) w += 2; if (t.maxAge && age <= t.maxAge) w += 1.5; (t.tags || []).forEach(function (tg) { if (has(tg)) w += 1; }); return w; };
        const a = pickW(r, topics, tw);
        const b2 = pickW(r, topics.filter(function (t) { return t !== a; }), tw);
        rt.t1[i] = topics.indexOf(a); rt.t2[i] = topics.indexOf(b2);
        // 支援団体(宗教団体を含む。所属率はゲーム上の設定値)
        let g = 0;
        for (let gi = 1; gi < groups.length; gi++) {
          const G = groups[gi];
          let p = G.base;
          (G.jobs || []).forEach(function (jid) { if (jid === job.id) p = Mth.max(p, G.jobRate); });
          if (G.minAge && age < G.minAge) p = 0;
          if (G.maxAge && age > G.maxAge) p = 0;
          (G.tags || []).forEach(function (tg) { if (has(tg)) p *= B.groupTagMult; });
          if (r() < p) { g = gi; break; }
        }
        rt.grp[i] = g;
        // 関心度(投票に行く見込みのもと)・SNSの利用度
        rt.interest[i] = Mth.max(0.03, Mth.min(0.98, B.interest.base + (age - 18) * B.interest.perYear + (g ? B.interest.member : 0) + normal(r) * B.interest.sd));
        rt.sns[i] = Mth.max(0, Mth.min(1, B.sns.base - (age - 18) * B.sns.perYear + normal(r) * B.sns.sd));
      }
      rt.byRegion[reg.id] = idx;
      // 地図に出す点:地区ごとに決まった人たち
      const m = Mth.min(nDots || B.dots, idx.length), step = idx.length / m, smp = [];
      for (let k = 0; k < m; k++) smp.push(idx[Mth.floor(k * step)]);
      rt.sample[reg.id] = smp;
    });
    // 知り合い(5〜10人):近所(同じ地区)・職場(同じ職業)・家族(同じ地区で年の離れた人)
    const F = B.friends, start = new Int32Array(n + 1), list = [];
    const byJob = {};
    for (let p = 0; p < n; p++) (byJob[rt.job[p]] = byJob[rt.job[p]] || []).push(p);
    for (let p = 0; p < n; p++) {
      start[p] = list.length;
      const k = F.min + Mth.floor(r() * (F.max - F.min + 1));
      const home = rt.byRegion[rt.regionIds[rt.region[p]]];
      for (let q = 0; q < k; q++) {
        const kind = r();
        let f;
        if (kind < F.near) f = home[Mth.floor(r() * home.length)];
        else if (kind < F.near + F.work) { const pool = byJob[rt.job[p]]; f = pool[Mth.floor(r() * pool.length)]; }
        else { f = home[Mth.floor(r() * home.length)]; }
        if (f !== p) list.push(f);
      }
    }
    start[n] = list.length;
    rt.fStart = start; rt.fList = Int32Array.from(list);
    // 投票に行く見込みのもと(地区の平均が1になるように)
    rt.turnF = new Float32Array(n);
    regionList.forEach(function (reg) {
      const idx = rt.byRegion[reg.id];
      let m = 0;
      for (let k = 0; k < idx.length; k++) m += B.turnoutBase + rt.interest[idx[k]];
      m /= idx.length;
      for (let k = 0; k < idx.length; k++) rt.turnF[idx[k]] = (B.turnoutBase + rt.interest[idx[k]]) / m;
    });
    return rt;
  }

  // 好み s を地区の支持に合わせる(列を合わせて、行を1に戻す。くり返すと、ほぼぴったり合う)
  function fit(rt, rid, target) {
    const idx = rt.byRegion[rid], C = rt.C, s = rt.s;
    for (let it = 0; it < 6; it++) {
      const col = new Float64Array(C);
      for (let k = 0; k < idx.length; k++) for (let c = 0; c < C; c++) col[c] += s[idx[k] * C + c];
      const f = new Float64Array(C);
      for (let c = 0; c < C; c++) f[c] = col[c] > 0 ? (target[c] / 100) * idx.length / col[c] : 1;
      for (let k = 0; k < idx.length; k++) {
        const o = idx[k] * C;
        let sum = 0;
        for (let c = 0; c < C; c++) { s[o + c] = Mth.max(1e-6, s[o + c] * f[c]); sum += s[o + c]; }
        for (let c = 0; c < C; c++) s[o + c] /= sum;
      }
    }
  }
  // 地区の支持(候補ごと、合計100)
  function aggregate(rt, rid) {
    const idx = rt.byRegion[rid], C = rt.C, s = rt.s, out = {};
    const col = new Float64Array(C);
    for (let k = 0; k < idx.length; k++) for (let c = 0; c < C; c++) col[c] += s[idx[k] * C + c];
    rt.ids.forEach(function (id, c) { out[id] = col[c] / idx.length * 100; });
    return out;
  }

  // 選挙戦の始まりに作る(newCampaign・newNational・対戦の newMatch の最後。支持が決まったあと)
  function create(state, camp) {
    const B = VB(), D = Game.Data.DISTRICT;
    const seed = Mth.floor(Game.Rng.next(state) * 2147483647);
    const ids = camp.cands.map(function (c) { return c.id; });
    const saved = { seed: seed, arena: camp.arena, ids: ids, enc: null, mob: null, visited: null, rumors: [], endorse: {}, day: 0 };
    const rt = fresh(D);
    rt.ids = ids.slice(); rt.C = ids.length; rt.s = new Float32Array(rt.n * rt.C);
    // はじめの好み:地区の支持のまわりに、1人ひとりのぶれと団体の傾き
    const r = rng(seed ^ 0x5bd1e995), lean = B.groupLean, groups = Game.Data.VOTER_GROUPS;
    for (let i = 0; i < rt.n; i++) {
      const rid = rt.regionIds[rt.region[i]], sh = camp.shares[rid], o = i * rt.C;
      let sum = 0;
      for (let c = 0; c < rt.C; c++) {
        const party = camp.cands[c].party, gl = (lean[groups[rt.grp[i]].id] || {})[party] || 0;
        const v = Mth.max(0.2, sh[ids[c]]) * Mth.exp(normal(r) * B.spread + gl);
        rt.s[o + c] = v; sum += v;
      }
      for (let c = 0; c < rt.C; c++) rt.s[o + c] /= sum;
    }
    D.regions.forEach(function (reg) { fit(rt, reg.id, ids.map(function (id) { return camp.shares[reg.id][id]; })); });
    camp.voters = saved;
    cache.set(saved, rt);
    D.regions.forEach(function (reg) { camp.shares[reg.id] = aggregate(rt, reg.id); });
    return rt;
  }

  // ---------- セーブと読み込み ----------
  // base64(ブラウザでも自動プレイの Node でも同じに動くよう、自前で)
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function b64(u8) {
    const out = [];
    for (let i = 0; i < u8.length; i += 3) {
      const a = u8[i], b = i + 1 < u8.length ? u8[i + 1] : 0, c = i + 2 < u8.length ? u8[i + 2] : 0, n = (a << 16) | (b << 8) | c;
      out.push(B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < u8.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < u8.length ? B64[n & 63] : '='));
    }
    return out.join('');
  }
  function unb64(str) {
    const len = str.length, pad = str.endsWith('==') ? 2 : str.endsWith('=') ? 1 : 0, u8 = new Uint8Array(len / 4 * 3 - pad);
    let k = 0;
    for (let i = 0; i < len; i += 4) {
      const n = (B64.indexOf(str[i]) << 18) | (B64.indexOf(str[i + 1]) << 12) | ((Mth.max(0, B64.indexOf(str[i + 2])) & 63) << 6) | (Mth.max(0, B64.indexOf(str[i + 3])) & 63);
      if (k < u8.length) u8[k++] = (n >> 16) & 255;
      if (k < u8.length) u8[k++] = (n >> 8) & 255;
      if (k < u8.length) u8[k++] = n & 255;
    }
    return u8;
  }
  // セーブの前に、変わった値を camp.voters に書く(main.js の save・取り消しの記録から)
  function persist(camp) {
    const sv = camp && camp.voters, rt = sv && cache.get(sv);
    if (!rt) return;
    const q = new Uint8Array(rt.s.length);
    for (let i = 0; i < rt.s.length; i++) q[i] = Mth.round(rt.s[i] * 255);
    sv.enc = b64(q);
    const mob = [];
    for (let i = 0; i < rt.n; i++) if (rt.mob[i]) mob.push(i, Mth.round(rt.mob[i] * 100));
    sv.mob = mob;
    const vis = new Uint8Array(Mth.ceil(rt.n / 8));
    for (let i = 0; i < rt.n; i++) if (rt.visited[i]) vis[i >> 3] |= 1 << (i & 7);
    sv.visited = b64(vis);
    sv.rumors.forEach(function (ru, k) { ru.set = b64(rt.rumorSets[k] || new Uint8Array(0)); });
  }
  // 本体を取り出す。読み込んだあと(キャッシュにない)なら、種から作り直して、変わった値を戻す
  function get(camp) {
    const sv = camp && camp.voters;
    if (!sv) return null;
    let rt = cache.get(sv);
    if (rt) return rt;
    const D = Game.Data.DISTRICT;
    rt = fresh(D);
    rt.ids = sv.ids.slice(); rt.C = rt.ids.length; rt.s = new Float32Array(rt.n * rt.C);
    if (sv.enc) {
      const q = unb64(sv.enc);
      for (let i = 0; i < rt.n; i++) {
        let sum = 0;
        for (let c = 0; c < rt.C; c++) { const v = Mth.max(0.5, q[i * rt.C + c]); rt.s[i * rt.C + c] = v; sum += v; }
        for (let c = 0; c < rt.C; c++) rt.s[i * rt.C + c] /= sum;
      }
    } else {
      for (let i = 0; i < rt.s.length; i++) rt.s[i] = 1 / rt.C;
    }
    D.regions.forEach(function (reg) { fit(rt, reg.id, rt.ids.map(function (id) { return camp.shares[reg.id][id]; })); });
    for (let k = 0; sv.mob && k < sv.mob.length; k += 2) rt.mob[sv.mob[k]] = sv.mob[k + 1] / 100;
    if (sv.visited) { const vis = unb64(sv.visited); for (let i = 0; i < rt.n; i++) rt.visited[i] = (vis[i >> 3] >> (i & 7)) & 1; }
    rt.rumorSets = sv.rumors.map(function (ru) { return ru.set ? unb64(ru.set) : new Uint8Array(Mth.ceil(rt.n / 8)); });
    cache.set(sv, rt);
    return rt;
  }
  // 対戦モード:視点の入れ替えで 'me' と 'vs' の列の名前を入れ替える
  function swapIds(camp) {
    const sv = camp && camp.voters;
    if (!sv) return;
    const rt = get(camp);
    const sw = function (id) { return id === 'me' ? 'vs' : id === 'vs' ? 'me' : id; };
    sv.ids = sv.ids.map(sw);
    if (rt) rt.ids = rt.ids.map(sw);
    sv.rumors.forEach(function (ru) { ru.who = sw(ru.who); });
    Object.keys(sv.endorse).forEach(function (g) { sv.endorse[g] = sw(sv.endorse[g]); });
  }

  // ---------- 支持を動かす ----------
  // だれに効くか(重み)。kind:'uniform' みんな / 'interest' 関心の高い人 / 'sns' SNSをよく使う人 / 'door' 少数に強く(戸別訪問)/
  //   'few' 少数に強く(訪問の印はつけない)/ 'group:団体' その団体の人 / 'topic:テーマ' そのテーマに関心のある人 / 'seed' 噂の始まり(ごく少数)
  function weights(rt, camp, rid, kind) {
    const B = VB(), idx = rt.byRegion[rid], t = new Float32Array(idx.length), sv = camp.voters;
    const k0 = (kind || 'uniform').split(':'), k = k0[0], arg = k0[1];
    let any = false;
    for (let j = 0; j < idx.length; j++) {
      const i = idx[j];
      let w = 1;
      if (k === 'interest') w = B.target.interestBase + rt.interest[i];
      else if (k === 'sns') w = B.target.snsBase + rt.sns[i] * rt.sns[i];
      else if (k === 'group') w = Game.Data.VOTER_GROUPS[rt.grp[i]].id === arg ? 1 : 0;
      else if (k === 'topic') { const ti = Game.Data.VOTER_TOPICS.map(function (x) { return x.id; }).indexOf(arg); w = B.target.topicBase + (rt.t1[i] === ti ? 1 : 0) + (rt.t2[i] === ti ? 0.6 : 0); }
      else if (k === 'door' || k === 'few') w = !rt.visited[i] && hash01(i, sv.day + 1, k === 'door' ? 7 : 13) < B.target.doorShare ? 1 : 0;
      else if (k === 'seed') w = hash01(i, sv.day + 1, (sv.rumors.length + 3) * 31) < B.target.seedShare ? 1 : 0;
      t[j] = w;
      if (w > 0) any = true;
    }
    if (!any) for (let j = 0; j < idx.length; j++) t[j] = 1;
    return t;
  }
  // who の好みを、地区の平均でちょうど d ポイント(マイナスも可)動かす。ほかの候補は、その人の中で今の割合に応じて動く
  function shiftRaw(rt, rid, c, d, t) {
    const idx = rt.byRegion[rid], C = rt.C, s = rt.s;
    let left = d / 100 * idx.length;   // 動かしたい量(人数 × 割合)
    for (let pass = 0; pass < 3 && Mth.abs(left) > 1e-7; pass++) {
      let room = 0;
      for (let j = 0; j < idx.length; j++) { const v = s[idx[j] * C + c]; room += t[j] * (left > 0 ? 1 - v : v); }
      if (room <= 1e-9) { for (let j = 0; j < idx.length; j++) t[j] = 1; continue; }
      const kk = left / room;
      let done = 0;
      for (let j = 0; j < idx.length; j++) {
        if (!t[j]) continue;
        const o = idx[j] * C, old = s[o + c];
        const a = left > 0 ? Mth.min(1, kk * t[j]) * (1 - old) : -Mth.min(1, -kk * t[j]) * old;
        if (!a) continue;
        const nw = Mth.max(0, Mth.min(1, old + a));
        const rest = 1 - old, k2 = rest > 1e-9 ? (1 - nw) / rest : 0;
        for (let x = 0; x < C; x++) if (x !== c) s[o + x] = rest > 1e-9 ? s[o + x] * k2 : (1 - nw) / (C - 1);
        s[o + c] = nw;
        done += nw - old;
      }
      left -= done;
      if (Mth.abs(left) < 1e-6) break;
      for (let j = 0; j < idx.length; j++) t[j] = 1;   // 2回目からは、残りをみんなに
    }
  }
  // 地区 rid で who を d ポイント動かし、地区の支持を書き直す。動いた量を返す
  function shift(camp, rid, who, d, kind) {
    const rt = get(camp);
    if (!rt || !rt.byRegion[rid]) return null;
    const c = rt.ids.indexOf(who);
    if (c < 0 || !d) return 0;
    const t = weights(rt, camp, rid, kind);
    if (kind === 'door') { const idx = rt.byRegion[rid]; for (let j = 0; j < idx.length; j++) if (t[j]) { rt.visited[idx[j]] = 1; rt.mob[idx[j]] = Mth.max(rt.mob[idx[j]], VB().target.doorMob); } }
    const sh = camp.shares[rid], before = sh[who];
    // 地区の支持は、これまでの決まり(who がちょうど d、ほかの候補は今の割合に応じて下がる・上がる)と同じにする
    const target = rt.ids.map(function (id) { return id === who ? before + d : sh[id] * (100 - before - d) / Mth.max(1e-9, 100 - before); });
    shiftRaw(rt, rid, c, d, t);
    fit(rt, rid, target);
    camp.shares[rid] = aggregate(rt, rid);
    return camp.shares[rid][who] - before;
  }
  // 団体の推薦:その団体の人の投票率を上げ、投票の理由に残す
  function endorse(camp, group, who) {
    const rt = get(camp);
    if (!rt) return;
    const gi = Game.Data.VOTER_GROUPS.map(function (g) { return g.id; }).indexOf(group);
    for (let i = 0; i < rt.n; i++) if (rt.grp[i] === gi) rt.mob[i] = Mth.max(rt.mob[i], VB().target.endorseMob);
    camp.voters.endorse[group] = who;
  }
  // 噂を流す:sign −1 悪い噂 / +1 良い評判。始まりの人は、いまの重み(kind)で選ぶ
  function rumor(camp, who, sign, kind) {
    const rt = get(camp), sv = camp.voters;
    if (!rt) return;
    const set = new Uint8Array(Mth.ceil(rt.n / 8));
    let seeded = 0;
    rt.regionIds.forEach(function (rid) {
      const idx = rt.byRegion[rid], t = weights(rt, camp, rid, kind || 'uniform');
      let mt = 0;
      for (let j = 0; j < idx.length; j++) mt += t[j];
      mt = mt / idx.length || 1;
      for (let j = 0; j < idx.length; j++) if (t[j] && hash01(idx[j], sv.day + 7, sv.rumors.length + 101) < VB().rumor.seedRate * VB().target.seedShare * t[j] / mt) { set[idx[j] >> 3] |= 1 << (idx[j] & 7); seeded++; }
    });
    if (sv.rumors.length >= VB().rumor.max) { sv.rumors.shift(); rt.rumorSets.shift(); }
    sv.rumors.push({ who: who, sign: sign, day: sv.day, front: true });
    rt.rumorSets.push(set);
    return seeded;
  }

  // ---------- 1日の終わり:口コミ ----------
  // 知り合いの好みに少し近づく。噂は知り合いへ広がり、悪い噂のほうが速い。地区の支持を書き直し、地区ごとの動きを返す
  function spread(camp) {
    const rt = get(camp), sv = camp.voters, B = VB();
    if (!rt) return null;
    const before = {};
    rt.regionIds.forEach(function (rid) { before[rid] = Object.assign({}, camp.shares[rid]); });
    // 地図の点:口コミの前の投票先を覚える(口コミで変わった点に印をつける)
    rt.regionIds.forEach(function (rid) { rt.sample[rid].forEach(function (i) { rt.prevTop[i] = topOf(rt, i); }); });
    const C = rt.C, s = rt.s, nx = new Float32Array(s.length);
    for (let i = 0; i < rt.n; i++) {
      const a = rt.fStart[i], b = rt.fStart[i + 1], o = i * C;
      if (b <= a) { for (let c = 0; c < C; c++) nx[o + c] = s[o + c]; continue; }
      let sum = 0;
      for (let c = 0; c < C; c++) {
        let m = 0;
        for (let f = a; f < b; f++) m += s[rt.fList[f] * C + c];
        m /= (b - a);
        const v = s[o + c] + B.mouth.rate * (m - s[o + c]);
        nx[o + c] = v; sum += v;
      }
      for (let c = 0; c < C; c++) nx[o + c] /= sum;
    }
    rt.s = nx;
    // 知り合いに近づくだけでは、地区の支持は変えない(地区をまたぐ知り合いで、地区の色が薄まらないように)。地区の支持を動かすのは噂
    rt.regionIds.forEach(function (rid) { fit(rt, rid, rt.ids.map(function (id) { return before[rid][id]; })); });
    // 噂:前の日に聞いた人から、その知り合いへ(悪い噂は bad、良い評判は good の見込み)
    sv.rumors.forEach(function (ru, k) {
      const set = rt.rumorSets[k], c = rt.ids.indexOf(ru.who);
      if (c < 0 || sv.day - ru.day > B.rumor.life) return;
      const p = ru.sign < 0 ? B.rumor.bad : B.rumor.good, hit = ru.sign < 0 ? B.rumor.badHit : B.rumor.goodHit;
      const newly = [];
      for (let i = 0; i < rt.n; i++) {
        if (!((set[i >> 3] >> (i & 7)) & 1)) continue;
        for (let f = rt.fStart[i]; f < rt.fStart[i + 1]; f++) {
          const q = rt.fList[f];
          if ((set[q >> 3] >> (q & 7)) & 1) continue;
          if (hash01(q, sv.day * 13 + k, i) < p) newly.push(q);
        }
      }
      newly.forEach(function (q) {
        if ((set[q >> 3] >> (q & 7)) & 1) return;
        set[q >> 3] |= 1 << (q & 7);
        const o = q * C, old = rt.s[o + c];
        const nw = ru.sign < 0 ? old * (1 - hit) : old + (1 - old) * hit;
        const rest = 1 - old, k2 = rest > 1e-9 ? (1 - nw) / rest : 0;
        for (let x = 0; x < C; x++) if (x !== c) rt.s[o + x] = rest > 1e-9 ? rt.s[o + x] * k2 : (1 - nw) / (C - 1);
        rt.s[o + c] = nw;
      });
      ru.reach = (ru.reach || 0) + newly.length;
    });
    sv.day += 1;
    const moved = {};
    rt.regionIds.forEach(function (rid) {
      camp.shares[rid] = aggregate(rt, rid);
      moved[rid] = {};
      rt.ids.forEach(function (id) { moved[rid][id] = camp.shares[rid][id] - before[rid][id]; });
    });
    return moved;
  }

  // ---------- 投票 ----------
  // 地区ごとに、1人ひとりが投票に行くかと投票先を決める。o = { turnout(地区 → 0〜1), adj(地区 → 候補 → ポイント), hidden({ who, pts }。奔流の隠れた票)}
  // 返り値:地区 → { votes, base(隠れた票がないときの票。奔流のときだけ), turnout(実際)}、と ballots(「この人の一票」の候補)
  function ballot(state, camp, o) {
    const rt = get(camp), B = VB(), C = rt.C, out = {}, ballots = [];
    const r = rng((camp.voters.seed ^ 0x9e3779b9) + Mth.floor(Game.Rng.next(state) * 1e9));
    const wx = state.election && state.election.weatherMob || 0;
    rt.regionIds.forEach(function (rid) {
      const idx = rt.byRegion[rid], w = rt.weight[rid], votes = {}, base = {}, adj = o.adj[rid] || {};
      rt.ids.forEach(function (id) { votes[id] = 0; base[id] = 0; });
      const hidden = !!o.hidden && rt.ids.indexOf(o.hidden.who) >= 0;
      let voted = 0, picked = 0;
      const q = new Float64Array(C), qh = new Float64Array(C);
      // 投票に行く見込み(関心・天気。pv は動員(戸別訪問・推薦)を足したもの、p0 は足す前)
      const pv = new Float64Array(idx.length), p0 = new Float64Array(idx.length);
      let pt = 0;
      for (let j = 0; j < idx.length; j++) {
        const i = idx[j];
        p0[j] = Mth.max(0.02, Mth.min(0.99, o.turnout[rid] * rt.turnF[i] * (1 + wx)));
        pv[j] = Mth.max(0.02, Mth.min(0.99, o.turnout[rid] * rt.turnF[i] * (1 + rt.mob[i] + wx)));
        pt += p0[j];
      }
      // 選挙のぶれ(ポイント)を足した地区の支持を、投票に行く人の見込みの票がちょうど同じになるように、候補ごとの倍率にする
      // (1人ひとりの好みにそのまま足すと、好みのはっきりした人が動かず、ぶれが小さくなる。行く人が偏っていても、地区の票の見込みは支持のとおり)
      // 動員の前の見込みで合わせるので、動員した人(戸別訪問で会った人・推薦した団体の人)が行くぶんだけ、その人たちの好みが票に上乗せされる
      const solve = function (sh) {
        const fac = new Float64Array(C).fill(1), tg = new Float64Array(C);
        let tsum = 0;
        for (let c = 0; c < C; c++) { tg[c] = Mth.max(1, sh[rt.ids[c]] + (adj[rt.ids[c]] || 0)); tsum += tg[c]; }
        for (let c = 0; c < C; c++) tg[c] /= tsum;
        for (let it = 0; it < 8; it++) {
          const ex = new Float64Array(C);
          for (let j = 0; j < idx.length; j++) {
            const o2 = idx[j] * C;
            let sum = 0;
            for (let c = 0; c < C; c++) { q[c] = rt.s[o2 + c] * fac[c]; sum += q[c]; }
            for (let c = 0; c < C; c++) ex[c] += p0[j] * q[c] / sum;
          }
          for (let c = 0; c < C; c++) fac[c] *= ex[c] > 0 ? tg[c] * pt / ex[c] : 1;
        }
        return fac;
      };
      const fac = solve(camp.shares[rid]);
      // 奔流:隠れた票を足した支持(campaign.js の surgeShares)でも同じように解く。同じくじで引くので、ほとんどの人は同じ投票先で、一部が奔流の候補に流れる
      const facH = hidden ? solve(Game.Campaign.surgeShares(camp, rid) || camp.shares[rid]) : fac;
      for (let j = 0; j < idx.length; j++) {
        const i = idx[j];
        if (r() >= pv[j]) continue;
        voted++;
        let sum = 0, sumH = 0;
        for (let c = 0; c < C; c++) { q[c] = Mth.max(1e-9, rt.s[i * C + c] * fac[c]); qh[c] = Mth.max(1e-9, rt.s[i * C + c] * facH[c]); sum += q[c]; sumH += qh[c]; }
        const u = r();
        let acc = 0, pick = C - 1, accH = 0, pickH = C - 1;
        for (let c = 0; c < C; c++) { acc += q[c] / sum; if (u < acc) { pick = c; break; } }
        for (let c = 0; c < C; c++) { accH += qh[c] / sumH; if (u < accH) { pickH = c; break; } }
        base[rt.ids[pick]] += w;
        votes[rt.ids[pickH]] += w;
        if (picked < B.ballotsPerRegion && r() < 0.2) { picked++; ballots.push({ i: i, region: rid, who: rt.ids[pickH] }); }
      }
      rt.ids.forEach(function (id) { votes[id] = Mth.round(votes[id]); base[id] = Mth.round(base[id]); });
      out[rid] = { votes: votes, base: hidden ? base : null, voted: voted, n: idx.length };
    });
    return { regions: out, ballots: ballots.map(function (b) { return describe(camp, rt, b); }) };
  }

  // 「この人の一票」:属性と、投票の理由
  function describe(camp, rt, b) {
    const D = Game.Data, i = b.i, job = D.VOTER_JOBS[rt.job[i]], t1 = D.VOTER_TOPICS[rt.t1[i]], grp = D.VOTER_GROUPS[rt.grp[i]];
    const cand = camp.cands.filter(function (c) { return c.id === b.who; })[0];
    const topicsOf = Game.Voters.candTopics(camp, cand);
    let why;
    if (grp.id !== 'none' && camp.voters.endorse[grp.id] === b.who) why = '所属する' + grp.name + 'の推薦を受けて';
    else if (rt.visited[i] && b.who === 'me') why = '家まで来てくれたのが心に残って';
    else if (topicsOf.indexOf(t1.id) >= 0) why = t1.name + 'に期待して';
    else if (topicsOf.indexOf(D.VOTER_TOPICS[rt.t2[i]].id) >= 0) why = D.VOTER_TOPICS[rt.t2[i]].name + 'に期待して';
    else if (rt.sns[i] > 0.75) why = 'SNSで見かけて';
    else if (rt.interest[i] > 0.7) why = '演説を聞いて決めて';
    else why = '候補者の人柄にひかれて';
    return { age: rt.age[i], job: job.name, region: b.region, who: b.who, party: cand ? cand.party : null, why: why };
  }
  // 候補が訴えているテーマ(プレイヤーは掲げた約束、ほかの候補は党の看板)
  function candTopics(camp, cand) {
    if (!cand) return [];
    const B = VB(), out = (B.partyTopics[cand.party] || []).slice();
    if (cand.id === 'me') (camp.promises || []).forEach(function (pid) { const t = B.promiseTopic[pid]; if (t) out.unshift(t); });
    return out;
  }

  // いちばん好みの強い候補(列の番号)
  function topOf(rt, i) {
    let best = 0;
    for (let c = 1; c < rt.C; c++) if (rt.s[i * rt.C + c] > rt.s[i * rt.C + best]) best = c;
    return best;
  }
  // 地図の点:地区ごとの決まった人たちの、いまの投票先(いちばん好みの強い候補)と、ゆうべの口コミで変わったか(from は変わる前)
  function dots(camp, rid) {
    const rt = get(camp);
    if (!rt || !rt.sample[rid]) return null;
    return rt.sample[rid].map(function (i) {
      const best = topOf(rt, i), was = rt.prevTop[i];
      return { who: rt.ids[best], from: was >= 0 && was !== best ? rt.ids[was] : null };
    });
  }

  return {
    create: create, get: get, persist: persist, swapIds: swapIds, shift: shift, endorse: endorse, rumor: rumor, spread: spread,
    ballot: ballot, candTopics: candTopics, dots: dots, aggregate: aggregate,
    active: function (camp) { return !!(camp && camp.voters); },
  };
})();
