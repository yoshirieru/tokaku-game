// 全国の舞台(党首として戦う総選挙)。11ブロックをタイルの地図に並べる。政党・政治家はすべて架空。
// 選挙戦のエンジンと画面は Game.Data.DISTRICT(いまの舞台)を読むので、useArena で選挙区と全国を切り替える。
// 数値(党の地力、議席の計算、カード)は balance.js。
window.Game = window.Game || {};
Game.Data = Game.Data || {};

// 各党の党首(プレイヤーが党首になると、その党の党首と入れ替わる)
Game.Data.LEADERS = {
  minsei: { name: '鷹野 修一郎', short: '鷹野', title: '総裁' },
  kyowa:  { name: '真壁 透', short: '真壁', title: '代表' },
  mirai:  { name: '沢渡 健吾', short: '沢渡', title: '代表' },
  // 小さな党(R19)の党首
  kosei:   { name: '石動 正道', short: '石動', title: '代表' },
  kokumin: { name: '園部 浩一', short: '園部', title: '代表' },
  jinmin:  { name: '木暮 篤', short: '木暮', title: '委員長' },
  sankaku: { name: '御堂 剛志', short: '御堂', title: '代表' },
  shahei:  { name: '西園 みどり', short: '西園', title: '党首' },
};
// 党首選の相手:いまの党首と、もう1人の有力者
Game.Data.LEADER_RIVALS = {
  minsei: [{ name: '鷹野 修一郎', short: '鷹野', title: '総裁' }, { name: '白石 隆之', short: '白石', title: '幹事長' }],
  kyowa:  [{ name: '真壁 透', short: '真壁', title: '代表' }, { name: '小田切 紗英', short: '小田切', title: '政調会長' }],
  mirai:  [{ name: '沢渡 健吾', short: '沢渡', title: '代表' }, { name: '日向 杏奈', short: '日向', title: '幹事長' }],
};

// 公約(全国の約束カードで背負う)。政権を取ったあとについてくる
Game.Data.PROMISES.n_tax    = { policy: '減税', org: '全国の有権者', national: true };
Game.Data.PROMISES.n_agri   = { policy: '農業の再生', org: '全国の有権者', national: true };
Game.Data.PROMISES.n_wage   = { policy: '賃上げ', org: '全国の有権者', national: true };
Game.Data.PROMISES.n_family = { policy: '子育て支援', org: '全国の有権者', national: true };
Game.Data.PROMISES.n_youth  = { policy: '学費の無償化', org: '全国の有権者', national: true };

(function () {
  // タイルの位置(col, row)。おおよその地理に合わせて並べる
  const COL = 97, ROW = 103, X0 = 14, Y0 = 12, W = 90, H = 96, C = 12;
  function tile(col, row) {
    const x = X0 + col * COL, y = Y0 + row * ROW;
    return {
      pts: [x + C, y, x + W - C, y, x + W, y + C, x + W, y + H - C, x + W - C, y + H, x + C, y + H, x, y + H - C, x, y + C].join(' ').replace(/(\S+) (\S+)/g, '$1,$2'),
      x: (x + W / 2) / 600 * 100, y: (y + H / 2) / 430 * 100,
    };
  }
  // smd 小選挙区の数 / pr 比例の定数(合計 289 + 176 = 465)。voters は有権者の目安。tags は地域の性格
  const blocks = [
    { id: 'hokkaido', name: '北海道', smd: 12, pr: 8, voters: 4500000, tags: ['elder', 'union'], at: [5, 0], desc: '広い大地の農業と、炭鉱・製紙の街。組合の力が残る。' },
    { id: 'tohoku', name: '東北', smd: 21, pr: 12, voters: 7200000, tags: ['elder', 'org'], at: [5, 1], desc: '米どころ。顔の見える付き合いと後援会がものを言う。' },
    { id: 'hokuriku', name: '北陸信越', smd: 18, pr: 10, voters: 6100000, tags: ['elder', 'org'], at: [3, 1], desc: '保守の地盤が厚い雪国。組織の票が固い。' },
    { id: 'kitakanto', name: '北関東', smd: 33, pr: 19, voters: 11600000, tags: ['family', 'org'], at: [4, 1], desc: '工場と住宅地が広がる。子育て世帯が多い。' },
    { id: 'chugoku', name: '中国', smd: 17, pr: 10, voters: 5800000, tags: ['elder', 'org'], at: [1, 2], desc: '保守王国と呼ばれてきた地域。' },
    { id: 'kinki', name: '近畿', smd: 45, pr: 28, voters: 17000000, tags: ['urban', 'float'], at: [2, 2], desc: '議席がいちばん多い。改革を掲げる党が強い大都市圏。' },
    { id: 'tokai', name: '東海', smd: 33, pr: 21, voters: 12200000, tags: ['union', 'family'], at: [3, 2], desc: '自動車の街。労働組合の組織票が厚い。' },
    { id: 'tokyo', name: '東京', smd: 30, pr: 19, voters: 11500000, tags: ['urban', 'youth'], at: [4, 2], desc: '浮動票とSNSで決まる首都。若い世代が多い。' },
    { id: 'minamikanto', name: '南関東', smd: 36, pr: 23, voters: 12700000, tags: ['family', 'float'], at: [5, 2], desc: 'ベッドタウンが連なる。風に流れやすい。' },
    { id: 'kyushu', name: '九州', smd: 34, pr: 20, voters: 11700000, tags: ['org', 'float'], at: [0, 2.6], desc: '保守が強いが、都市部は読みにくい。' },
    { id: 'shikoku', name: '四国', smd: 10, pr: 6, voters: 3200000, tags: ['elder', 'org'], at: [1, 3], desc: '議席は少ないが、地盤の固い地域。' },
  ];
  blocks.forEach(function (b) { const t = tile(b.at[0], b.at[1]); b.pts = t.pts; b.x = t.x; b.y = t.y; });

  const NATION = {
    id: 'nation', name: '総選挙', national: true, block: '',
    viewBox: [600, 430],
    seaPts: '-900,-600 1500,-600 1500,1030 -900,1030',   // 地図の地は海(枠いっぱいに広げる)
    rail: '',
    labels: [{ text: '日本海', x: 150, y: 150, big: true }, { text: '太平洋', x: 330, y: 392, big: true }],
    regions: blocks,
  };

  // 舞台の切り替え。選挙区は5つ(js/data/seats.js)と全国。'home' は、いま立候補している選挙区(setHome で決める)
  Game.Data.ARENAS = { nation: NATION };
  Game.Data.SEAT_ORDER.forEach(function (k) { Game.Data.ARENAS[k] = Game.Data.SEATS[k]; });
  let home = 'hokuyo3';
  // REGION は、全国のブロックと、いまの選挙区の地区を引ける(名前を出すだけの場面のため)。
  // 選挙区どうしは地区の id が同じなので、いま使っている選挙区のものだけを入れる
  function index(seat) {
    const R = Game.Data.REGION;
    Object.keys(R).forEach(function (k) { delete R[k]; });
    NATION.regions.concat(seat.regions).forEach(function (r) { R[r.id] = r; });
  }
  Game.Data.useArena = function (id) {
    if (id === 'home' || !Game.Data.ARENAS[id]) id = home;
    Game.Data.DISTRICT = Game.Data.ARENAS[id];
    index(id === 'nation' ? Game.Data.ARENAS[home] : Game.Data.DISTRICT);
    return Game.Data.DISTRICT;
  };
  // 立候補する選挙区を決める。約束の相手の名前(選挙区ごとにちがう)と、約束のカードの名前もそろえる
  const promiseDefaults = {};
  Object.keys(Game.Data.PROMISES).forEach(function (pid) {
    const p = Game.Data.PROMISES[pid];
    if (!p.national) promiseDefaults[pid] = { policy: p.policy, org: p.org, card: p.card };
  });
  Game.Data.setHome = function (id) {
    home = Game.Data.SEATS[id] ? id : 'hokuyo3';
    const names = Game.Data.SEATS[home].promiseNames || {};
    Object.keys(promiseDefaults).forEach(function (pid) {
      const p = Game.Data.PROMISES[pid], d = promiseDefaults[pid], o = names[pid] || {};
      p.policy = o.policy || d.policy; p.org = o.org || d.org; p.card = o.card || d.card;
    });
    if (Game.Data.namePromiseCards) Game.Data.namePromiseCards();
    return Game.Data.useArena(Game.Data.DISTRICT && Game.Data.DISTRICT.national ? 'nation' : 'home');
  };
  Game.Data.homeSeat = function () { return home; };
  Game.Data.useArena('home');
})();
