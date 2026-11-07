// 政治家としての歩みの記録(殿堂・実績、M17)。DOMにも localStorage にも触らない(保存は main.js)。
//
// hall = {
//   version: 1,
//   records: [{ at, name, party, partyName, partyColor, custom, seat, seatName, ending, title, grade, score, year, pmYears, wins, maxSeats, maxPost }],
//   achievements: { 実績: { at, name, party } },   // はじめて達成したとき
//   seatsWon: [選挙区],                            // 当選したことのある選挙区(セーブデータをまたぐ)
//   pmParties: [党],                               // 首相になったことのある党(セーブデータをまたぐ)
//   plays: 終えた回数,
// }
// エンディングのたびに record() で1件足し、新しく達成した実績を返す。しきい値は balance.js の Game.Balance.hall。
window.Game = window.Game || {};

Game.Hall = (function () {
  const HB = () => Game.Balance.hall;

  function empty() {
    return { version: 1, records: [], achievements: {}, seatsWon: [], pmParties: [], plays: 0 };
  }
  function normalize(hall) {
    const h = Object.assign(empty(), hall || {});
    for (const k of ['records', 'seatsWon', 'pmParties']) if (!Array.isArray(h[k])) h[k] = [];
    if (!h.achievements || typeof h.achievements !== 'object') h.achievements = {};
    return h;
  }

  // 終わったゲームから記録を1件つくる
  function makeEntry(state) {
    const e = state.ending;
    const c = state.career || {};
    const s = Game.Legacy.stats(state);
    const party = Game.Data.PARTIES[e.party] || { name: e.party, color: '#999' };
    const seat = Game.Data.seatById ? Game.Data.seatById(state.seat) : null;
    return {
      at: Date.now(),
      name: state.player.name,
      party: e.party, partyName: party.name, partyColor: party.color, custom: !!party.custom,
      seat: seat ? seat.id : null, seatName: seat ? seat.name : '',
      ending: e.type, title: e.title, grade: e.grade, score: e.score, year: e.year,
      pmYears: e.pmYears || 0, wins: c.wins || 0,
      maxSeats: s.maxSeats || 0,   // 党首として戦った総選挙で取った最多議席(national.js が記録)
      maxPost: Math.max(s.maxPostLevel || 0, c.postLevel || 0),
    };
  }

  // 実績の判定(この1回のゲームで達成したか)
  function checks(state, entry, hall) {
    const H = HB();
    const c = state.career || {};
    const s = Game.Legacy.stats(state);
    const els = c.elections || [];
    const rank = Game.Legacy.rankKey(state);
    const isPM = rank === 'pm';
    const g = state.gov;
    const p = state.party;
    let lostBefore = false;
    let comeback = false;
    for (const x of els) {
      if (x.result === 'lost') lostBefore = true;
      else if (lostBefore) comeback = true;
    }
    const seat = Game.Data.seatById ? Game.Data.seatById(state.seat) : null;
    const guide = seat && seat.guide ? seat.guide[state.player.party] : undefined;
    const kept = (c.promiseStats || {}).kept || 0;
    const broken = (c.promiseStats || {}).broken || 0;
    return {
      firstWin: c.wins >= 1,
      prRevival: els.some((x) => x.result === 'pr'),
      comeback,
      veteran: c.wins >= H.veteranWins,
      hardSeat: guide !== undefined && guide < H.hardSeatGuide && els.some((x) => x.result !== 'lost'),
      minister: entry.maxPost >= H.ministerPost,
      clean: kept >= H.cleanPromises && broken === 0,
      leader: !!(s.wasLeader || state.leader),
      kingmaker: !!s.kingmakerWin,
      pm: isPM,
      pmMirai: isPM && state.player.party === 'mirai',
      pmNewparty: isPM && entry.custom,
      longPM: entry.pmYears >= H.longPMYears,
      greatPM: entry.ending === 'greatPM',
      economy: !!(g && g.econTurns && g.econMoodSum / g.econTurns >= H.economyMood),
      majority: entry.maxSeats >= Game.Data.MAJORITY,
      upperSeat: !!(p && p.custom && p.upper && p.upper.seats > 0),
      requirement: !!(p && p.custom && p.requirement),
      governor: entry.ending === 'governor',
      gradeS: entry.grade === 'S',
      allSeats: Game.Data.SEATS.every((x) => hall.seatsWon.includes(x.id)),
      threeParties: ['minsei', 'kyowa', 'mirai'].every((x) => hall.pmParties.includes(x)),
    };
  }

  // 1回のゲームを殿堂に記録する。戻り値:{ hall, newly: [実績], rank: 歴代の何位か(点数順) }
  function record(hallIn, state) {
    const hall = normalize(hallIn);
    const entry = makeEntry(state);
    hall.plays++;
    hall.records.push(entry);
    hall.records.sort((a, b) => b.score - a.score || a.at - b.at);
    const rank = hall.records.indexOf(entry) + 1;
    if (hall.records.length > HB().maxRecords) hall.records.length = HB().maxRecords;
    // セーブデータをまたいで積み重ねるもの
    const c = state.career || {};
    if (entry.seat && c.wins >= 1 && !hall.seatsWon.includes(entry.seat)) hall.seatsWon.push(entry.seat);
    if (Game.Legacy.rankKey(state) === 'pm' && !entry.custom && !hall.pmParties.includes(entry.party)) hall.pmParties.push(entry.party);
    const ok = checks(state, entry, hall);
    const newly = [];
    for (const a of Game.Data.ACHIEVEMENTS) {
      if (ok[a.id] && !hall.achievements[a.id]) {
        hall.achievements[a.id] = { at: entry.at, name: entry.name, party: entry.partyName };
        newly.push(a.id);
      }
    }
    return { hall, newly, rank: rank <= HB().maxRecords ? rank : null };
  }

  // 自己ベスト(殿堂の画面)
  function bests(hallIn) {
    const hall = normalize(hallIn);
    const r = hall.records;
    const max = (k) => r.reduce((m, x) => Math.max(m, x[k] || 0), 0);
    const grades = {};
    for (const x of r) grades[x.grade] = (grades[x.grade] || 0) + 1;
    return { plays: hall.plays, bestScore: r.length ? r[0].score : null, pmYears: max('pmYears'), wins: max('wins'), maxSeats: max('maxSeats'), grades,
      unlocked: Object.keys(hall.achievements).length, total: Game.Data.ACHIEVEMENTS.length };
  }

  return { empty, normalize, makeEntry, record, bests };
})();
