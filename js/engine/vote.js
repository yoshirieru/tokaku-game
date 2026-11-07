// 投票計算、比例配分、比例復活、開票速報のタイムライン。
// 選挙戦(campaign.js)の最終状態から投票日の結果を1回だけ計算し、結果オブジェクトを返す。
// 乱数は選挙戦と同じ種(camp.rng)を使うので、セーブし直しても結果は変わらない。
// DOMには触らない(開票の演出は js/ui/ がタイムラインを再生する)。
window.Game = window.Game || {};

Game.Vote = (function () {
  const Bal = () => Game.Balance;
  const rand = (camp) => Game.Campaign._internal.rand(camp);
  const gauss = (camp) => Game.Campaign._internal.gauss(camp);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const WEATHER_LABEL = { sunny: '晴れ', cloudy: 'くもり', rain: '雨' };

  function weightedKey(camp, table) {
    const keys = Object.keys(table);
    const total = keys.reduce((s, k) => s + table[k].weight, 0);
    let r = rand(camp) * total;
    for (const k of keys) {
      r -= table[k].weight;
      if (r <= 0) return k;
    }
    return keys[keys.length - 1];
  }

  function shuffle(camp, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand(camp) * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ---------------- 小選挙区 ----------------
  function runDistrictElection(camp) {
    const V = Bal().vote;
    const weatherId = weightedKey(camp, V.weather);
    const W = V.weather[weatherId];
    const sh = Game.Campaign.shares(camp, { solidMult: W.solidMult, election: true });

    const swing = {};
    for (const c of camp.candidates) swing[c.id] = gauss(camp) * V.candidateSwing;

    const regions = {};
    const total = {};
    camp.candidates.forEach((c) => (total[c.id] = 0));
    let voters = 0;
    let valid = 0;
    for (const reg of camp.regionList) {
      const turnout = clamp(Game.Campaign.turnout(reg) + W.turnoutShift + gauss(camp) * V.turnoutNoise, 0.2, 0.9);
      const regValid = Math.round(reg.voters * turnout);
      const raw = {};
      let sum = 0;
      for (const c of camp.candidates) {
        raw[c.id] = Math.max(V.minShare, sh[reg.id][c.id] + swing[c.id] + gauss(camp) * V.regionNoise);
        sum += raw[c.id];
      }
      const votes = {};
      for (const c of camp.candidates) {
        votes[c.id] = Math.round((regValid * raw[c.id]) / sum);
        total[c.id] += votes[c.id];
      }
      const regTotal = Object.values(votes).reduce((a, b) => a + b, 0);
      regions[reg.id] = { voters: reg.voters, turnout, valid: regTotal, votes };
      voters += reg.voters;
      valid += regTotal;
    }

    const ranking = camp.candidates.map((c) => c.id).sort((a, b) => total[b] - total[a]);
    const winner = ranking[0];
    const ratio = {};
    const depositLost = {};
    for (const cid of ranking) {
      ratio[cid] = total[cid] / total[winner];
      depositLost[cid] = total[cid] < valid * V.depositLine;
    }

    const pr = camp.sub ? { block: '', totalSeats: 0, shares: {}, seats: {}, lists: {}, revived: {}, lines: {}, transfers: [] } : runProportional(camp, { winner, ratio, depositLost });   // 補選・首長選に比例はない
    const pid = camp.player.id;
    const result = winner === pid ? 'smd' : pr.revived[pid] ? 'pr' : 'lost';

    const election = {
      kind: 'district',
      weather: { id: weatherId, label: WEATHER_LABEL[weatherId] },
      voters,
      valid,
      turnoutRate: valid / voters,
      regions,
      total,
      ranking,
      winner,
      ratio,
      depositLost,
      pr,
      player: {
        id: pid,
        result,
        votes: total[pid],
        share: total[pid] / valid,
        ratio: ratio[pid],
        rank: ranking.indexOf(pid) + 1,
        depositLost: depositLost[pid],
      },
    };
    election.timeline = buildTimeline(camp, election);
    return election;
  }

  // ---------------- 比例代表 ----------------
  // ドント式。名簿が尽きた党の分は次の党に回す。capacity が無い党は上限なし
  function dhondt(votes, seats, capacity) {
    const alloc = {};
    Object.keys(votes).forEach((p) => (alloc[p] = 0));
    for (let i = 0; i < seats; i++) {
      let best = null;
      let bq = -1;
      for (const p in votes) {
        if (capacity && capacity[p] !== undefined && alloc[p] >= capacity[p]) continue;
        const q = votes[p] / (alloc[p] + 1);
        if (q > bq) { bq = q; best = p; }
      }
      if (best === null) break;
      alloc[best]++;
    }
    return alloc;
  }

  function fakeName(camp, used) {
    const N = Game.Data.NAME_POOL;
    for (let i = 0; i < 50; i++) {
      const n = N.family[Math.floor(rand(camp) * N.family.length)] + ' ' + N.given[Math.floor(rand(camp) * N.given.length)];
      if (!used.has(n)) { used.add(n); return n; }
    }
    return '候補 ' + used.size;
  }

  // ブロック内の他の選挙区の名前(プレイヤーの選挙区を除く)
  function otherDistricts() {
    const B = Game.Data.DISTRICT_BLOCK;
    const prefs = B.prefectures;
    const per = Math.floor(B.districts / prefs.length);
    let extra = B.districts - per * prefs.length;
    const names = [];
    for (const pf of prefs) {
      const n = per + (extra-- > 0 ? 1 : 0);
      for (let i = 1; i <= n; i++) names.push(`${pf}${i}区`);
    }
    return names.filter((n) => n !== Game.Data.DISTRICT_NAME);
  }

  function runProportional(camp, smd) {
    const P = Bal().proportional;
    const B = Game.Data.DISTRICT_BLOCK;
    const used = new Set(camp.candidates.map((c) => c.name));

    // 比例の得票(政党支持率 × ぶれ)
    const support = {};
    const noise = {};
    for (const p of Object.keys(P.lists)) {
      noise[p] = Math.max(0.3, 1 + gauss(camp) * P.partyNoise);
      support[p] = Game.Campaign.partySupport(camp, p) * noise[p];
    }
    for (const p of Object.keys(P.minorSupport)) {
      support[p] = P.minorSupport[p] * Math.max(0.3, 1 + gauss(camp) * P.partyNoise);
    }
    // 比例票の融通(「選挙区は○○、比例は公明」)
    const transfers = Game.Support ? Game.Support.prTransfers(camp) : [];
    for (const t of transfers) {
      if (support[t.from] === undefined || support[t.to] === undefined) continue;
      const moved = support[t.from] * t.rate;
      support[t.from] -= moved;
      support[t.to] += moved;
    }
    const sum = Object.values(support).reduce((a, b) => a + b, 0);
    const shares = {};
    for (const p in support) shares[p] = support[p] / sum;

    // 名簿をつくる
    const districts = otherDistricts();
    const lists = {};
    for (const p of Object.keys(P.lists)) {
      const L = P.lists[p];
      const entries = [];
      // 名簿の人数はブロックの大きさに合わせる(数値は北関東ブロックの定数・選挙区数が基準)
      const topSolo = Math.max(1, Math.round(L.topSolo * B.seats / P.refBlock.seats));
      const smdCandidates = Math.max(2, Math.round(L.smdCandidates * B.districts / P.refBlock.districts));
      for (let i = 0; i < topSolo; i++) {
        entries.push({ name: fakeName(camp, used), type: 'solo', district: null, rank: i + 1 });
      }
      const dupRank = topSolo + 1;
      // プレイヤーの選挙区の候補(プレイヤーかライバル)
      for (const c of camp.candidates.filter((x) => x.party === p)) {
        entries.push({
          name: c.name, type: 'dup', district: Game.Data.DISTRICT_NAME, rank: dupRank, cid: c.id, isPlayer: c.isPlayer,
          wonSmd: smd.winner === c.id, ratio: smd.ratio[c.id], depositLost: smd.depositLost[c.id],
        });
      }
      // 他の選挙区の候補
      const base = Bal().parties[p].support;
      const winRate = clamp(L.smdWinRate + (Game.Campaign.partySupport(camp, p) - base) * P.winRateSensitivity + (noise[p] - 1) * 0.5, 0, 0.95);
      const myDistricts = shuffle(camp, districts).slice(0, smdCandidates - 1);
      for (const d of myDistricts) {
        const won = rand(camp) < winRate;
        const ratio = won ? 1 : clamp(L.ratioMean + gauss(camp) * L.ratioSd, 0.12, 0.995);
        entries.push({
          name: fakeName(camp, used), type: 'dup', district: d, rank: dupRank,
          wonSmd: won, ratio, depositLost: !won && ratio < P.fakeDepositRatio,
        });
      }
      lists[p] = entries;
    }

    // 名簿で比例に回れる人数(小選挙区で当選した人と供託金没収の人は除く)
    const capacity = {};
    for (const p in lists) capacity[p] = lists[p].filter((e) => e.type === 'solo' || (!e.wonSmd && !e.depositLost)).length;
    const seats = dhondt(shares, B.seats, capacity);

    // 当選者を決める:単独比例の上位 → 重複候補を惜敗率の高い順
    const revived = {};
    for (const p in lists) {
      const order = lists[p]
        .filter((e) => e.type === 'solo')
        .concat(lists[p].filter((e) => e.type === 'dup' && !e.wonSmd && !e.depositLost).sort((a, b) => b.ratio - a.ratio));
      order.forEach((e, i) => {
        e.order = i + 1;
        e.elected = i < seats[p];
        if (e.elected && e.cid) revived[e.cid] = true;
      });
      // 表示用の並び:単独 → 重複(当選者は小選挙区当選として後ろ、比例対象は惜敗率順)
      lists[p].sort((a, b) => {
        const ka = a.type === 'solo' ? 0 : a.wonSmd ? 2 : a.depositLost ? 3 : 1;
        const kb = b.type === 'solo' ? 0 : b.wonSmd ? 2 : b.depositLost ? 3 : 1;
        if (ka !== kb) return ka - kb;
        if (ka === 0) return a.rank - b.rank;
        return b.ratio - a.ratio;
      });
    }

    // プレイヤーの党で、比例当選の最後の人の惜敗率(復活ライン)
    const lines = {};
    for (const p in lists) {
      const dupElected = lists[p].filter((e) => e.type === 'dup' && e.elected);
      lines[p] = dupElected.length ? dupElected[dupElected.length - 1].ratio : null;
    }

    return { block: B.name, totalSeats: B.seats, shares, seats, lists, revived, lines, transfers };
  }

  // ---------------- 開票速報のタイムライン ----------------
  function buildTimeline(camp, el) {
    const K = Bal().count;
    const last = K.steps.length - 1;
    const maxVoters = Math.max(...camp.regionList.map((r) => r.voters));

    // 地区ごとの開票の進み方(農村は早く、有権者の多い地区は遅い)
    const curve = {};
    for (const reg of camp.regionList) {
      const start = 0.6 + rand(camp) * 1.6 - (reg.traits.farm || 0) * 0.5;
      const len = 2 + rand(camp) * 2.5 + (reg.voters / maxVoters) * 1.5;
      curve[reg.id] = { start, end: Math.min(last, start + len) };
    }
    const fracAt = (rid, t) => {
      if (t <= 0) return 0;
      if (t >= last) return 1;
      const c = curve[rid];
      if (t <= c.start) return 0;
      if (t >= c.end) return 1;
      return (t - c.start) / (c.end - c.start);
    };

    const winner = el.winner;
    const second = el.ranking[1];
    const finalMargin = (el.total[winner] - el.total[second]) / el.valid;
    let called = null;
    let calledAt = null;
    let falseCalled = null;   // 取り消された当確(1回まで)
    const wantFalse = finalMargin < K.falseCallMaxMargin && rand(camp) < K.falseCallChance;
    if (finalMargin >= K.zeroUchiMargin) { called = winner; calledAt = 0; }

    const steps = [];
    for (let t = 0; t <= last; t++) {
      const regionFraction = {};
      const counted = {};
      camp.candidates.forEach((c) => (counted[c.id] = 0));
      let countedTotal = 0;
      for (const reg of camp.regionList) {
        const f = fracAt(reg.id, t);
        regionFraction[reg.id] = f;
        for (const c of camp.candidates) {
          const v = Math.floor(el.regions[reg.id].votes[c.id] * f);
          counted[c.id] += v;
          countedTotal += v;
        }
      }
      const fraction = countedTotal / el.valid;
      const remaining = el.valid - countedTotal;
      let retracted = null;
      // 早すぎた当確:最後に勝つ候補がはっきり前に出たら(または開票が終わったら)取り消す
      if (called && called !== winner && (counted[winner] > counted[called] * (1 + K.retractLead) || countedTotal >= el.valid)) {
        retracted = called;
        called = null;
        calledAt = null;
      }
      if (!called && (!retracted || countedTotal >= el.valid) && t > 0) {
        let other = 0;
        for (const cid in counted) if (cid !== winner) other = Math.max(other, counted[cid]);
        const lead = counted[winner] - other;
        if (countedTotal >= el.valid || (fraction >= K.callMinFraction && lead > 0 && lead > remaining * K.callLeadFactor)) {
          called = winner;
          calledAt = t;
        } else if (wantFalse && !falseCalled && fraction >= K.callMinFraction && fraction <= K.falseCallMaxFraction && counted[second] >= counted[winner] * (1 - K.falseCallNear)) {
          // 大接戦で2位の候補が競り合っていると、報道が早まって当確を打つことがある(あとで取り消す)
          called = second;
          calledAt = t;
          falseCalled = second;
        }
      }
      // 途中経過は1000票単位で発表
      const shown = {};
      const done = countedTotal >= el.valid;
      for (const cid in counted) shown[cid] = done ? counted[cid] : Math.floor(counted[cid] / K.roundTo) * K.roundTo;
      steps.push({ time: K.steps[t], fraction: done ? 1 : fraction, regionFraction, counted: shown, called, newCall: called !== null && calledAt === t, retracted });
      if (done) break;   // 開票終了
    }

    // 出口調査(20時)
    const ep = {};
    let epSum = 0;
    for (const cid of el.ranking) {
      ep[cid] = Math.max(0.01, el.total[cid] / el.valid + gauss(camp) * K.exitPollNoise);
      epSum += ep[cid];
    }
    for (const cid in ep) ep[cid] /= epSum;
    const epRank = Object.keys(ep).sort((a, b) => ep[b] - ep[a]);
    const epMargin = ep[epRank[0]] - ep[epRank[1]];
    const exitPoll = {
      shares: ep,
      leader: epRank[0],
      label: calledAt === 0 ? 'call' : epMargin >= K.exitPollLead ? 'lead' : 'close',
    };

    return { steps, exitPoll, calledAt, prTime: K.prTime, zeroUchi: calledAt === 0, falseCall: falseCalled };
  }

  // ---------------- 全国の総選挙(党首モード) ----------------
  // ブロックごとの得票率を出し、289の小選挙区を1つずつ判定する(候補を立てた党だけで争う)。
  // 候補者調整の票の譲り合いを入れ、比例は11ブロックそれぞれドント式。
  function runNationalElection(camp) {
    const V = Bal().vote;
    const N = Bal().national;
    const nat = camp.national;
    const weatherId = weightedKey(camp, V.weather);
    const W = V.weather[weatherId];
    const sh = Game.Campaign.shares(camp, { solidMult: W.solidMult, election: true });
    const parties = camp.candidates.map((c) => c.party);
    const cid = Object.fromEntries(camp.candidates.map((c) => [c.party, c.id]));
    const me = nat.leaderParty;
    // 党首本人の選挙区(北陽ブロックの何番目か)。対戦モードは2人の党首がいる
    const leaders = nat.leaders || { [me]: 0 };
    const isLeaderSeat = (p, blockId, i) => blockId === Game.Data.HOME_BLOCK && leaders[p] === i;
    // 政党要件のない党(比例に出すには候補の数が要る)
    const noReq = nat.noRequirement || (nat.requirement ? [] : [me]);
    const lognorm = (sd) => Math.exp(gauss(camp) * sd - (sd * sd) / 2);

    const swing = {};
    for (const p of parties) swing[p] = lognorm(N.partySwing);
    const prevTotal = Object.values(nat.prev).reduce((a, b) => a + b, 0) || 1;

    const blocks = {};
    const seats = {};
    const prVotesNational = {};
    parties.forEach((p) => { seats[p] = { smd: 0, pr: 0, total: 0 }; prVotesNational[p] = 0; });
    const districts = [];

    for (const b of Game.Data.BLOCKS) {
      // ブロックの得票率
      const raw = {};
      let sum = 0;
      for (const p of parties) {
        raw[p] = sh[b.id][cid[p]] * swing[p] * lognorm(N.blockNoise);
        sum += raw[p];
      }
      const share = {};
      for (const p of parties) share[p] = raw[p] / sum;

      // 各党が候補を立てる選挙区を決める
      const runs = {};
      for (const p of parties) {
        const n = nat.coverage[p][b.id] || 0;
        const idx = shuffle(camp, Array.from({ length: b.smd }, (_, i) => i)).slice(0, n);
        runs[p] = new Set(idx);
      }
      if (b.id === Game.Data.HOME_BLOCK) for (const lp in leaders) if (runs[lp]) runs[lp].add(leaders[lp]);   // 党首本人の選挙区(北陽3区など)
      const smdSeats = {};
      parties.forEach((p) => (smdSeats[p] = 0));
      for (let i = 0; i < b.smd; i++) {
        const local = {};
        for (const p of parties) {
          if (!runs[p].has(i)) continue;
          const inc = 1 + N.incumbencyBonus * ((nat.prev[p] || 0) / prevTotal) * 4;
          local[p] = share[p] * lognorm(N.districtNoise) * inc;
          if (p === me) local[p] *= Bal().national.listPolicy[nat.listPolicy].smdMult;
          if (isLeaderSeat(p, b.id, i)) local[p] *= N.leaderDistrictBonus;
        }
        applyCoops(local, nat.coops, me, N.coop, (party) => isLeaderSeat(party, b.id, i));
        // 誰も立てなかった選挙区は、そのブロックで最も強い党の無所属系候補が取るとみなす
        if (!Object.keys(local).length) for (const p of parties) local[p] = share[p] * lognorm(N.districtNoise);
        const ranked = Object.keys(local).sort((x, y) => local[y] - local[x]);
        const total = ranked.reduce((s, p) => s + local[p], 0);
        const winner = ranked[0];
        smdSeats[winner]++;
        districts.push({
          block: b.id, idx: i, winner, second: ranked[1] || null,
          margin: ranked[1] ? (local[winner] - local[ranked[1]]) / total : 1,
          leader: b.id === Game.Data.HOME_BLOCK && i === 0,
          playerRan: !!local[me],
        });
      }

      // 比例:政党要件のない党は、ブロック定数の2割以上の候補が要る
      const prShare = {};
      for (const p of parties) {
        let v = share[p];
        if (p === me) v *= Bal().national.listPolicy[nat.listPolicy].prMult;
        prShare[p] = v;
      }
      for (const c of nat.coops) {
        const C = N.coop;
        const own = c.owner || me;   // 対戦モード:候補者調整を結んだ側
        if (!(own in prShare) || !(c.partner in prShare)) continue;
        if (c.type === 'smdUs') { const moved = prShare[own] * C.prTransfer; prShare[own] -= moved; prShare[c.partner] += moved; }
        if (c.type === 'smdThem') { const moved = prShare[c.partner] * C.prTransfer; prShare[c.partner] -= moved; prShare[own] += moved; }
      }
      const eligible = {};
      for (const p of parties) {
        const ok = !noReq.includes(p) || (nat.coverage[p][b.id] || 0) >= Math.ceil(b.pr * N.prRequirementShare);
        if (ok) eligible[p] = prShare[p];
        prVotesNational[p] += (ok ? prShare[p] : 0) * b.voters;
      }
      const prSeats = dhondt(eligible, b.pr);
      parties.forEach((p) => {
        seats[p].smd += smdSeats[p];
        seats[p].pr += prSeats[p] || 0;
      });
      blocks[b.id] = { share, prShare, smdSeats, prSeats, eligible: Object.keys(eligible) };
    }
    parties.forEach((p) => (seats[p].total = seats[p].smd + seats[p].pr));
    const totalVoters = Game.Data.BLOCKS.reduce((s, b) => s + b.voters, 0);
    const prShareNational = Object.fromEntries(parties.map((p) => [p, prVotesNational[p] / totalVoters]));
    const leaderDistrict = districts.find((d) => d.leader);

    const el = {
      kind: 'national',
      weather: { id: weatherId, label: WEATHER_LABEL[weatherId] },
      parties, seats, blocks, districts, prShareNational, me,
      prev: nat.prev,
      leaderWon: !!leaderDistrict && leaderDistrict.winner === me,
      majority: Game.Data.MAJORITY,
    };
    el.timeline = buildNationalTimeline(camp, el);
    return el;
  }

  // 候補者調整:選挙区での票の譲り合い
  // isLeaderSeat(党): その党の党首本人の選挙区か
  function applyCoops(local, coops, me, C, isLeaderSeat) {
    for (const c of coops) {
      const a = c.owner || me;
      const leaderSeat = isLeaderSeat(a);
      const b = c.partner;
      if (!(a in local) || !(b in local)) continue;
      if (c.type === 'unify') {
        const loser = local[a] >= local[b] ? b : a;
        const keeper = loser === a ? b : a;
        if (loser === a && leaderSeat) continue;   // 党首本人は降りない
        local[keeper] += local[loser] * C.unifyTransfer;
        delete local[loser];
      } else if (c.type === 'smdUs') {
        local[a] += local[b] * C.smdTransfer;
        delete local[b];
      } else if (c.type === 'smdThem' && !leaderSeat) {
        local[b] += local[a] * C.smdTransfer;
        delete local[a];
      }
    }
  }

  // 開票特番:差の大きい選挙区から当確が出て、深夜から比例が開く
  function buildNationalTimeline(camp, el) {
    const N = Bal().national;
    const order = el.districts.slice().sort((x, y) => (y.margin + rand(camp) * 0.08) - (x.margin + rand(camp) * 0.08));
    const steps = [];
    const last = N.countSteps.length - 1;
    const prBlocks = shuffle(camp, Game.Data.BLOCKS.map((b) => b.id));
    for (let t = 0; t <= last; t++) {
      const smdFrac = t === last ? 1 : Math.min(1, [0.3, 0.45, 0.58, 0.7, 0.8, 0.88, 0.94, 0.97, 0.99, 1, 1][t] ?? 1);
      const nSmd = Math.round(order.length * smdFrac);
      const counted = {};
      el.parties.forEach((p) => (counted[p] = { smd: 0, pr: 0 }));
      for (let i = 0; i < nSmd; i++) counted[order[i].winner].smd++;
      const prOpen = t < N.prFromStep ? 0 : Math.round(prBlocks.length * Math.min(1, (t - N.prFromStep + 1) / (last - N.prFromStep + 1)));
      const opened = prBlocks.slice(0, prOpen);
      for (const bid of opened) for (const p in el.blocks[bid].prSeats) counted[p].pr += el.blocks[bid].prSeats[p];
      const leader = el.districts.find((d) => d.leader);
      const leaderCalled = leader && order.indexOf(leader) < nSmd;
      steps.push({ time: N.countSteps[t], smdCounted: nSmd, smdTotal: order.length, prOpened: opened, counted, leaderCalled });
    }
    return { steps };
  }

  return {
    runDistrictElection,
    runNationalElection,
    dhondt,
    WEATHER_LABEL,
  };
})();
