// 殿堂・実績(R7)。エンディングを迎えるたびに記録を1件残し、実績を判定する。DOM には触らない。
// 殿堂(hall)はセーブデータとは別のもの。localStorage への出し入れは main.js(tokaku2-hall)
//   hall = { version, records: [記録。点数の高い順], achievements: { 実績の id: { at, name } }, seatsWon: { 選挙区: true }, pmParties: { 党: true }, plays 終えた回数, grades 評価ごとの回数 }
window.Game = window.Game || {};

Game.Hall = (function () {
  const H = function () { return Game.Balance.hall; };

  function empty() { return { version: 1, records: [], achievements: {}, seatsWon: {}, pmParties: {}, plays: 0, grades: {} }; }
  // 読み込んだものが壊れていても遊べるように、足りないところを埋める
  function normalize(h) {
    const e = empty();
    if (!h || typeof h !== 'object') return e;
    Object.keys(e).forEach(function (k) { if (h[k] == null || typeof h[k] !== typeof e[k]) h[k] = e[k]; });
    if (!Array.isArray(h.records)) h.records = [];
    return h;
  }

  // 政治家としての歩みから、数えるもの。近道のスタート(党首として総選挙から)は、はじめから持っている当選回数と約束を引く
  function facts(state) {
    const cr = state.career, en = state.ending, q = cr.quickStart || { wins: 0, kept: 0 };
    const hist = cr.history || [];
    const seat = state.player.seat || 'hokuyo3', party = state.player.party === 'shinto' && cr.np ? cr.np.from : state.player.party;   // 新党(R16)は、元の党として記録する
    const seated = function (h) { return h.national || h.won || h.revived; };
    let lostBefore = false, comeback = false;
    hist.forEach(function (h) {
      if (h.national) return;
      if (seated(h) && lostBefore) comeback = true;
      if (!seated(h)) lostBefore = true;
    });
    // 議席を得た選挙区(国替えしていれば、いくつもある。R6 までの記録には選挙区がないので、いまの選挙区)
    const seatsWon = {};
    hist.forEach(function (h) { if (!h.national && seated(h)) seatsWon[h.seat || seat] = true; });
    const hardWin = hist.some(function (h) {
      const S = Game.Balance.seats[h.seat || seat];
      return !h.national && h.won && !h.by && S && S.guide[h.party || party] < H().hardGuide;
    });
    const sc = state.scandal || {};
    return {
      seat: seat, party: party,
      seats: hist.filter(seated).length,
      seatsWon: seatsWon, hardWin: hardWin,
      cleanTop: (sc.cleanTops || 0) + ((sc.clean || 0) >= Game.Balance.slush.cleanMax ? 1 : 0) >= H().cleanTerms && !sc.everHid,
      revived: hist.some(function (h) { return !h.national && h.revived; }),
      comeback: comeback,
      kept: Math.max(0, (cr.kept || 0) - q.kept), broken: cr.broken || 0,
      rank: cr.quick ? 0 : (cr.bestRank || 0),   // 近道は党首から始まるので、役職の実績(大臣の椅子)は数えない
      raceWon: !!cr.raceWon, majority: !!cr.wonMajority, coalPM: !!cr.coalPM,
      pm: !!cr.wasPM, pmTurns: cr.pmTurns || 0, great: !!en.great, grade: en.grade,
      npWon: !!cr.npWon, mergePM: !!(cr.npPast && cr.wasPM),
    };
  }
  // この1回で達成した実績(セーブデータをまたぐものは、殿堂に積み重ねてから判定する)
  function earned(f, hall) {
    const L = H(), ranks = Game.Balance.ranks;
    const minister = ranks.map(function (r) { return r.name; }).indexOf('大臣');
    const got = {
      firstWin: f.seats > 0,
      prRevival: f.revived,
      comeback: f.comeback,
      veteran: f.seats >= L.veteranSeats,
      hardSeat: f.hardWin,
      cleanHands: f.cleanTop,
      keeper: f.kept >= L.keeperKept && f.broken === 0,
      minister: f.rank >= minister,
      leader: f.raceWon,
      majority: f.majority,
      coalition: f.coalPM,
      pm: f.pm,
      pmMirai: f.pm && f.party === 'mirai',
      longPM: f.pmTurns >= L.longPMTurns,
      greatPM: f.great,
      gradeS: f.grade === 'S',
      newParty: f.npWon,
      mergePM: f.mergePM,
      allSeats: Game.Data.SEAT_ORDER.every(function (k) { return hall.seatsWon[k]; }),
      threeParties: Object.keys(Game.Data.PARTIES).every(function (k) { return hall.pmParties[k]; }),
    };
    return Game.Data.ACHIEVEMENTS.filter(function (a) { return got[a.id]; }).map(function (a) { return a.id; });
  }

  // エンディングの記録を殿堂に入れる。hall は書きかえる。返り値は { rank(歴代の何位。圏外は 0), newly(新しく達成した実績の id) }
  function record(hall, state, now) {
    hall = normalize(hall);
    const cr = state.career, en = state.ending, f = facts(state);
    Object.keys(f.seatsWon).forEach(function (k) { hall.seatsWon[k] = true; });
    if (f.pm) hall.pmParties[f.party] = true;
    hall.plays += 1;
    hall.grades[en.grade] = (hall.grades[en.grade] || 0) + 1;
    const entry = {
      at: now, name: state.player.name, party: f.party, seat: f.seat, quick: !!cr.quick,
      title: en.title, grade: en.grade, score: en.score, seats: f.seats, rank: cr.bestRank || 0,
      pmTurns: f.pmTurns, bestSeats: cr.bestSeats || 0, elections: cr.elections || 0,
    };
    hall.records.push(entry);
    hall.records.sort(function (a, b) { return (b.score - a.score) || (a.at - b.at); });
    hall.records = hall.records.slice(0, H().maxRecords);
    const rank = hall.records.indexOf(entry) + 1;
    const newly = earned(f, hall).filter(function (id) { return !hall.achievements[id]; });
    newly.forEach(function (id) { hall.achievements[id] = { at: now, name: state.player.name }; });
    return { rank: rank, newly: newly };
  }

  // 自己ベスト(殿堂の画面)
  function bests(hall) {
    hall = normalize(hall);
    const R = hall.records, max = function (k) { return R.reduce(function (a, r) { return Math.max(a, r[k] || 0); }, 0); };
    return { plays: hall.plays, score: max('score'), seats: max('seats'), pmTurns: max('pmTurns'), bestSeats: max('bestSeats'), grades: hall.grades };
  }

  return { empty: empty, normalize: normalize, facts: facts, earned: earned, record: record, bests: bests };
})();
