// 選挙区(R6)。5つの選挙区から選んで立候補する。地図・地区の性格・対立候補・約束の相手が、選挙区ごとにちがう。すべて架空。
// 地区の id は5つとも同じ(downtown / residential / industrial / rural / campus)。名前・性格・有権者数・地図の形が選挙区ごと。
// 数値(党の地力、投票率、難しさの目安)は balance.js の seats。舞台の切り替えは nation.js の useArena / setHome。
// promiseNames は約束の名前の入れ替え(policy 政策 / org 相手の団体 / card 約束のカードの名前)。書いていない約束は district.js のまま
window.Game = window.Game || {};
Game.Data = Game.Data || {};

(function () {
  // ---- 地図の形(viewBox 0 0 600 430)。3つの土台を、左右・上下に返して使い回す ----
  function flipPts(pts, h, v) {
    return pts.split(' ').map(function (p) {
      const xy = p.split(',').map(Number);
      return (h ? 600 - xy[0] : xy[0]) + ',' + (v ? 430 - xy[1] : xy[1]);
    }).join(' ');
  }
  function flipPath(d, h, v) {
    return d.replace(/([ML])(-?\d+) (-?\d+)/g, function (m, c, x, y) { return c + (h ? 600 - x : +x) + ' ' + (v ? 430 - y : +y); });
  }
  // 土台A:北陽3区の形(海が右上)
  const A = Game.Data.DISTRICT;
  const baseA = { sea: A.seaPts, rail: A.rail, shapes: {} };
  A.regions.forEach(function (r) { baseA.shapes[r.id] = { pts: r.pts, x: r.x, y: r.y }; });
  // 土台B:海岸の街(海が下に広がる)
  const baseB = {
    sea: '-900,338 50,338 90,345 190,320 300,350 410,330 500,350 560,333 1500,333 1500,1030 -900,1030',
    rail: 'M-900 150 L45 150 L215 195 L400 215 L570 175 L1500 165',
    shapes: {
      nw: { pts: '60,70 200,45 215,170 150,215 45,200', x: 22, y: 33 },
      n:  { pts: '200,45 340,55 480,40 455,165 330,195 215,170', x: 57, y: 26 },
      e:  { pts: '480,40 555,90 570,220 560,333 500,350 410,330 400,240 455,165', x: 82, y: 50 },
      c:  { pts: '215,170 330,195 455,165 400,240 410,330 300,350 250,260 150,215', x: 51, y: 60 },
      sw: { pts: '45,200 150,215 250,260 300,350 190,320 90,345 50,338', x: 24, y: 66 },
    },
  };
  // 土台C:川の街(川が左上から右下へ流れる。川は「海」として描く)
  const baseC = {
    sea: '140,-600 170,40 210,120 290,210 380,300 435,395 460,1030 495,1030 466,395 408,290 318,200 238,110 200,40 172,-600',
    rail: 'M-900 290 L60 300 L250 325 L435 355 L470 345 L560 300 L1500 280',
    shapes: {
      w1: { pts: '40,70 170,40 210,120 290,210 200,250 60,230', x: 22, y: 34 },
      w2: { pts: '60,230 200,250 290,210 380,300 435,395 250,400 80,380', x: 37, y: 74 },
      e1: { pts: '200,40 380,35 540,60 520,170 400,200 318,200 238,110', x: 65, y: 26 },
      e2: { pts: '318,200 400,200 520,170 570,250 560,330 470,320 408,290', x: 80, y: 59 },
      e3: { pts: '408,290 470,320 560,330 545,400 466,395', x: 83, y: 84 },
    },
  };
  // 土台と、地区 → 形の割り当てから、地区の一覧を作る
  function build(base, h, v, defs) {
    return defs.map(function (d) {
      const s = base.shapes[d.shape];
      return {
        id: d.id, name: d.name, voters: d.voters, tags: d.tags, desc: d.desc,
        pts: flipPts(s.pts, h, v), x: h ? 100 - s.x : s.x, y: v ? 100 - s.y : s.y,
      };
    });
  }
  function seat(o, base, h, v, defs) {
    o.viewBox = [600, 430];
    o.seaPts = flipPts(base.sea, h, v);
    o.rail = flipPath(base.rail, h, v);
    o.regions = build(base, h, v, defs);
    return o;
  }

  // ---- 北陽3区(これまでの選挙区)に、人と約束の名前を足す ----
  A.block = '北関東ブロック';
  A.type = 'バランス型';
  A.summary = '街・住宅地・工場・田畑・大学がそろう、標準的な選挙区。はじめての人におすすめ。';
  A.people = Game.Data.PEOPLE;
  A.roles = Game.Data.ROLES;
  A.promiseNames = {};   // 約束の名前は、もとのまま(district.js の PROMISES)

  const SEATS = { hokuyo3: A };

  // ---- 東央7区:都会。未来改革党の現職がいる ----
  SEATS.touou7 = seat({
    id: 'touou7', name: '東央7区', sea: '東央湾', block: '東京ブロック', type: '都会',
    summary: '都心のオフィス街と下町、湾岸のタワーマンション。組織の票が薄く、浮動票とSNSで決まる。未来改革党に追い風。',
    labels: [{ text: '東央湾', x: 300, y: 398, big: true }, { text: '東央6区', x: 30, y: 28 }, { text: '東央8区', x: 572, y: 28 }],
    people: {
      minsei: { name: '神崎 理沙', short: '神崎', age: 47, slogan: '都心に、確かな安心を' },
      kyowa:  { name: '堀 健太郎', short: '堀', age: 44, slogan: '働く人の東京へ' },
      mirai:  { name: '氷室 翔子', short: '氷室', age: 41, slogan: '東京から、政治を変える' },
    },
    roles: {
      minsei: { mirai: 'incumbent', kyowa: 'newcomer' },
      kyowa:  { mirai: 'incumbent', minsei: 'newcomer' },
      mirai:  { minsei: 'former', kyowa: 'newcomer' },   // 未来の現職が引退し、その後を継ぐ
    },
    promiseNames: {
      agri:   { policy: '防災のまちづくり', org: '山の手の町会', card: '町会に約束' },
      wage:   { policy: '通勤ラッシュの緩和', org: '湾岸の住民の会', card: '湾岸の住民に約束' },
      family: { policy: '商店街の再生', org: '下町の商店会', card: '下町の商店会に約束' },
      taxcut: { policy: '減税', org: '都心の経営者の会', card: '経営者の会に約束' },
    },
  }, baseB, false, false, [
    { id: 'downtown', shape: 'c', name: '都心', voters: 88000, tags: ['urban', 'float'], desc: 'オフィス街と再開発のビル。昼は人であふれ、街頭演説がよく届く。' },
    { id: 'residential', shape: 'e', name: '下町', voters: 96000, tags: ['elder', 'org'], desc: '商店街と長屋の残る街。町会のつながりが強い。' },
    { id: 'industrial', shape: 'sw', name: '湾岸', voters: 82000, tags: ['family', 'float'], desc: 'タワーマンションが並ぶ新しい街。子育て世帯が多く、風に流れやすい。' },
    { id: 'rural', shape: 'nw', name: '山の手', voters: 70000, tags: ['elder', 'urban'], desc: '古くからの住宅街。落ち着いた高齢の住民が多い。' },
    { id: 'campus', shape: 'n', name: '大学の街', voters: 64000, tags: ['youth', 'urban'], desc: '大学と古書店の街。SNSが届きやすいが、投票率は低い。' },
  ]);

  // ---- 備陽2区:保守王国。民政の地盤 ----
  SEATS.biyou2 = seat({
    id: 'biyou2', name: '備陽2区', sea: '備陽灘', block: '中国ブロック', type: '保守王国',
    summary: '田園と山あいの集落が広がる。日本民政党が長く議席を守ってきた。民政なら戦いやすく、ほかの党はかなり厳しい。',
    labels: [{ text: '備陽灘', x: 95, y: 92, big: true }, { text: '備陽1区', x: 538, y: 412 }, { text: '東備3区', x: 338, y: 22 }],
    people: {
      minsei: { name: '柏木 善治', short: '柏木', age: 64, slogan: 'ふるさとを守り抜く' },
      kyowa:  { name: '野々村 和也', short: '野々村', age: 55, slogan: '地方にこそ、暮らしの政治を' },
      mirai:  { name: '白河 美月', short: '白河', age: 36, slogan: '若い力で、備陽を開く' },
    },
    roles: {
      minsei: { kyowa: 'former', mirai: 'newcomer' },     // 民政の前任が引退。共和の元職が議席をねらう
      kyowa:  { minsei: 'incumbent', mirai: 'newcomer' },
      mirai:  { minsei: 'incumbent', kyowa: 'former' },
    },
    promiseNames: {
      agri:   { policy: '農林業の支援', org: '農林の組合', card: '農林の組合に約束' },
      family: { policy: '地域のバス路線を守る', org: '自治会連合', card: '自治会に約束' },
      taxcut: { policy: '商店街の再生', org: '城下町の商店会', card: '商店会に約束' },
    },
  }, baseA, true, false, [
    { id: 'downtown', shape: 'downtown', name: '城下町', voters: 62000, tags: ['urban', 'elder'], desc: '城あとを囲む古い街。商店街と役所が集まる。' },
    { id: 'residential', shape: 'residential', name: '田園の集落', voters: 98000, tags: ['elder', 'org'], desc: '田んぼと集落が続く。いちばん票が多く、後援会がものを言う。' },
    { id: 'industrial', shape: 'industrial', name: '臨海の工場', voters: 74000, tags: ['union', 'org'], desc: '海沿いの製鉄所と造船所。労働組合の票が固い。' },
    { id: 'rural', shape: 'rural', name: '山あいの集落', voters: 80000, tags: ['elder', 'org'], desc: '山と海にはさまれた集落。顔の見える付き合いがすべて。' },
    { id: 'campus', shape: 'campus', name: '県立大学の街', voters: 46000, tags: ['youth', 'float'], desc: '県立大学と新しい住宅地。数少ない浮動票の地区。' },
  ]);

  // ---- 尾湊4区:工業都市。共和の地盤 ----
  SEATS.ominato4 = seat({
    id: 'ominato4', name: '尾湊4区', sea: '尾湊湾', block: '東海ブロック', type: '工業都市',
    summary: '自動車の工場と社宅の街。労働組合の組織票が厚く、市民共和党の地盤。共和は戦いやすく、民政はやや厳しい。',
    labels: [{ text: '尾湊湾', x: 505, y: 345, big: true }, { text: '尾湊3区', x: 62, y: 24 }, { text: '三崎2区', x: 262, y: 416 }],
    people: {
      minsei: { name: '榊原 剛', short: '榊原', age: 58, slogan: '経済を、もう一度強く' },
      kyowa:  { name: '三好 志保', short: '三好', age: 50, slogan: 'ものづくりの街の声を' },
      mirai:  { name: '楠 大地', short: '楠', age: 34, slogan: '工場の街を、次の時代へ' },
    },
    roles: {
      minsei: { kyowa: 'incumbent', mirai: 'newcomer' },
      kyowa:  { minsei: 'former', mirai: 'newcomer' },    // 共和の前任が引退。民政の元職が議席をねらう
      mirai:  { kyowa: 'incumbent', minsei: 'former' },
    },
    promiseNames: {
      taxcut: { policy: '駅前の再開発', org: '商工会議所', card: '商工会議所に約束' },
    },
  }, baseA, false, true, [
    { id: 'downtown', shape: 'downtown', name: '駅前', voters: 70000, tags: ['urban', 'float'], desc: '駅前の商業地。通勤の人の流れが集まる。' },
    { id: 'residential', shape: 'rural', name: '社宅と団地', voters: 104000, tags: ['family', 'union'], desc: '工場で働く人の社宅と団地。いちばん票が多い。' },
    { id: 'industrial', shape: 'industrial', name: '工場地帯', voters: 86000, tags: ['union', 'org'], desc: '湾岸に並ぶ自動車の工場。組合の票が動かない。' },
    { id: 'rural', shape: 'residential', name: '郊外の農地', voters: 58000, tags: ['elder', 'org'], desc: '工場の街の外側に残る田畑と古い集落。' },
    { id: 'campus', shape: 'campus', name: '工科大学の街', voters: 52000, tags: ['youth', 'urban'], desc: '工科大学と下宿の街。若い技術者の卵が多い。' },
  ]);

  // ---- 浪央5区:改革の地盤。未来改革党の強い現職 ----
  SEATS.namio5 = seat({
    id: 'namio5', name: '浪央5区', sea: '浪央川', block: '近畿ブロック', type: '改革の地盤',
    summary: '川をはさんだ商人の街と大きなベッドタウン。改革を掲げる未来改革党が強い。未来なら戦いやすい。',
    labels: [{ text: '浪央川', x: 150, y: 20 }, { text: '浪央4区', x: 40, y: 414 }, { text: '浪央6区', x: 566, y: 28 }],
    people: {
      minsei: { name: '鴻池 章', short: '鴻池', age: 60, slogan: '地に足のついた政治を' },
      kyowa:  { name: '堺 千尋', short: '堺', age: 46, slogan: '暮らしの声を、まっすぐに' },
      mirai:  { name: '天満 颯', short: '天満', age: 43, slogan: '身を切る改革、浪央から' },
    },
    roles: {
      minsei: { mirai: 'incumbent', kyowa: 'newcomer' },
      kyowa:  { mirai: 'incumbent', minsei: 'newcomer' },
      mirai:  { minsei: 'former', kyowa: 'newcomer' },
    },
    promiseNames: {
      agri: { policy: '旧村の暮らしを守る', org: '旧村の自治会', card: '旧村の自治会に約束' },
    },
  }, baseC, false, false, [
    { id: 'downtown', shape: 'e2', name: '繁華街', voters: 76000, tags: ['urban', 'float'], desc: '商人の街。にぎやかな商店街と飲み屋街。' },
    { id: 'residential', shape: 'e1', name: 'ベッドタウン', voters: 110000, tags: ['family', 'float'], desc: '川の東に広がる大きな住宅地。いちばん票が多い。' },
    { id: 'industrial', shape: 'e3', name: '港の工業地帯', voters: 54000, tags: ['union', 'org'], desc: '川の河口の町工場と倉庫街。' },
    { id: 'rural', shape: 'w1', name: '丘陵の旧村', voters: 66000, tags: ['elder', 'org'], desc: '川の西の丘に残る古い村。昔からの付き合いが続く。' },
    { id: 'campus', shape: 'w2', name: '学生街', voters: 74000, tags: ['youth', 'urban'], desc: '大学がいくつも集まる。若い世代が多い。' },
  ]);

  Game.Data.SEATS = SEATS;
  Game.Data.SEAT_ORDER = ['hokuyo3', 'touou7', 'biyou2', 'ominato4', 'namio5'];
  // 難しさのことば(balance.js の seats[id].guide = 中級ボットの当選率 % を、seatLevels の境目で分ける)
  Game.Data.seatLevel = function (rate) {
    const L = Game.Balance.seatLevels;
    for (let i = 0; i < L.length; i++) if (rate >= L[i][0]) return L[i][1];
    return 'とてもむずかしい';
  };
})();
