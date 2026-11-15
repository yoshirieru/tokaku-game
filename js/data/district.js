// 政党・候補者・選挙区(すべて架空)。数値の強さは balance.js。
window.Game = window.Game || {};
Game.Data = Game.Data || {};

Game.Data.PARTIES = {
  minsei: {
    id: 'minsei', name: '日本民政党', short: '民政', color: '#e5383b',
    position: '保守系の与党第一党',
    description: '長く政権を担ってきた保守政党。農村と高齢層に強い。',
  },
  kyowa: {
    id: 'kyowa', name: '市民共和党', short: '共和', color: '#3d7bff',
    position: '中道左派の野党第一党',
    description: '政権交代をめざす野党第一党。工業地帯と労働組合に強い。',
  },
  mirai: {
    id: 'mirai', name: '未来改革党', short: '未来', color: '#f59e0b',
    position: '改革系の第三党',
    description: '改革を掲げる新興の第三党。若者と都市部が頼り。',
  },
};

// 対立候補(プレイヤーが選ばなかった2党から1人ずつ出る)
Game.Data.PEOPLE = {
  minsei: { name: '大河内 正隆', short: '大河内', age: 61, slogan: '地元とともに、確かな実行力' },
  kyowa:  { name: '早瀬 由紀子', short: '早瀬', age: 52, slogan: '暮らしの声を国会へ' },
  mirai:  { name: '桐生 蓮', short: '桐生', age: 38, slogan: '古い政治を、アップデート' },
};
// プレイヤーの党ごとの、対立候補の立場
Game.Data.ROLES = {
  minsei: { kyowa: 'incumbent', mirai: 'newcomer' },
  kyowa:  { minsei: 'incumbent', mirai: 'newcomer' },
  mirai:  { minsei: 'former', kyowa: 'newcomer' },
};
Game.Data.ROLE_NAMES = { incumbent: '現職', revived: '現職(比例)', former: '元職', challenger: '元職', newcomer: '新人', assassin: '新人', leader: '党首', nat_minsei: '党首', nat_kyowa: '党首', nat_mirai: '党首' };
Game.Data.ROLE_ORDER = ['incumbent', 'revived', 'former', 'challenger', 'newcomer', 'assassin'];

// 新党(R16)。結党のときに名前を選ぶ。党の id はいつも 'shinto'
// Game.Data.PARTIES には「数えない」(列挙されない)形で足す。全国の総選挙・参院選・準備の画面は3党のまま
Game.Data.NEW_PARTIES = [
  { name: '新しい日本の会', short: '新日', color: '#16a37f', motto: '古い政治を、終わらせる' },
  { name: '国民改革新党',   short: '改新', color: '#8b5cf6', motto: '改革を、国民の手に' },
  { name: '希望の結(ゆい)', short: '結', color: '#ec4899', motto: 'ひとりひとりを、結ぶ政治' },
];
Game.Data.setNewParty = function (np) {
  if (!np) { delete Game.Data.PARTIES.shinto; return; }
  Object.defineProperty(Game.Data.PARTIES, 'shinto', {
    value: { id: 'shinto', name: np.name, short: np.short, color: np.color, position: '新党', description: np.motto, isNew: true },
    enumerable: false, configurable: true, writable: true,
  });
};   // 開票特番の並び(テレビと同じ)

// 地区の性格(カードの効き方に出る)
Game.Data.TAGS = {
  urban: '都市部', float: '浮動票', org: '組織票', elder: '高齢層', family: '子育て世帯', youth: '若者', union: '労働組合',
};

// 約束(約束カードで背負う)。region はその団体の地区。任期の結果は、その地区に返ってくる。card は約束のカードの名前
// 名前(policy・org・card)は北陽3区のもの。ほかの選挙区では seats.js の promiseNames で入れ替わる(nation.js の setHome)
Game.Data.PROMISES = {
  agri:    { policy: '農業支援', org: '農業団体', card: '農業団体に約束', region: 'rural' },
  wage:    { policy: '賃上げ', org: '労働組合', card: '労働組合に約束', region: 'industrial' },
  family:  { policy: '子育て支援', org: '子育て世帯の会', card: '子育て世帯に約束', region: 'residential' },
  taxcut:  { policy: '減税', org: '商店会', card: '商店会に約束', region: 'downtown' },
  tuition: { policy: '学費の負担軽減', org: '学生団体', card: '学生団体に約束', region: 'campus' },
};
// 任期の会期の名前(1ターン = 半年)
Game.Data.sessionName = function (turn) {
  return Math.ceil(turn / 2) + '年目・' + (turn % 2 ? '通常国会' : '臨時国会');
};

// 選挙区(北陽3区。ほかの4つは js/data/seats.js)。地図は viewBox 0 0 600 430 の多角形(pts)。x・y は地区の札を置く位置(%)
Game.Data.DISTRICT = {
  id: 'hokuyo3', name: '北陽3区', sea: '北陽湾', block: '北関東ブロック',
  viewBox: [600, 430],
  seaPts: '312,-600 1500,-600 1500,1030 540,1030 548,430 560,350 578,300 570,250 520,190 458,196 430,170 400,120 372,72 330,45 320,0',
  rail: 'M-900 360 L0 318 L120 300 L250 245 L335 232 L440 262 L520 300 L600 312 L1500 330',
  labels: [{ text: '北陽湾', x: 505, y: 92, big: true }, { text: '北陽2区', x: 62, y: 412 }, { text: '東沢1区', x: 262, y: 22 }],
  regions: [
    { id: 'rural', name: '農村', voters: 62000, tags: ['elder', 'org'], desc: '田畑と集落。顔の見える付き合いがものを言う。', x: 33.5, y: 26,
      pts: '40,60 110,38 180,30 260,48 330,45 372,72 400,120 430,170 340,165 230,180 140,200 30,240 22,150' },
    { id: 'residential', name: '住宅地', voters: 108000, tags: ['family', 'float'], desc: '団地と戸建ての街。いちばん票が多い。', x: 22.5, y: 66,
      pts: '30,240 140,200 230,180 250,270 235,330 200,390 130,385 70,370 38,310' },
    { id: 'downtown', name: '市街地', voters: 92000, tags: ['urban', 'float'], desc: '駅前の商店街とオフィス街。街頭演説がよく届く。', x: 56, y: 50.5,
      pts: '230,180 340,165 430,170 420,260 350,290 250,270' },
    { id: 'industrial', name: '工業地帯', voters: 78000, tags: ['union', 'org'], desc: '湾岸の工場と社宅の街。組織の票が固い。', x: 82.5, y: 67,
      pts: '430,170 458,196 520,190 570,250 578,300 560,350 470,395 410,340 420,260' },
    { id: 'campus', name: '学生街', voters: 60000, tags: ['youth', 'urban'], desc: '大学と下宿の街。SNSが届きやすいが、投票率は低い。', x: 54.5, y: 82,
      pts: '250,270 350,290 420,260 410,340 470,395 400,404 330,400 200,390 235,330' },
  ],
};
Game.Data.REGION = {};
Game.Data.DISTRICT.regions.forEach(function (r) { Game.Data.REGION[r.id] = r; });
