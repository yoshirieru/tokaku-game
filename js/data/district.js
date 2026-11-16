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

// 小さな党(R19)。プレイヤーは選べず、コンピューターが動かす。前作の公明党・社会平和党・国民の声にならい、すべて架空。
// Game.Data.PARTIES には「数えない」形(列挙されない)で足す。名前と色は PARTIES[id] で引けるが、準備の画面・対戦モード・殿堂は3党のまま。
// 出るところ:全国の総選挙(比例代表で議席を取る)、参議院、政権づくり(連立相手と閣外協力)、選挙区の候補(seats.js の minors)。史実シナリオには出ない
Game.Data.MINOR_PARTIES = {
  kosei: {
    id: 'kosei', name: '平和公正党', short: '公正', color: '#22b8cf', minor: true,
    position: '宗教団体を支持母体とする中道政党',
    description: '信者の組織票が固く、比例代表で着実に議席を取る。長く民政と組んできた。',
  },
  kokumin: {
    id: 'kokumin', name: '国民の声', short: '国声', color: '#a78bfa', minor: true,
    position: '「手取りを増やす」中道の党',
    description: '労働組合の一部と、若い会社員に支持を広げる。与党とも野党とも組める。',
  },
  jinmin: {
    id: 'jinmin', name: '日本人民党', short: '人民', color: '#c2185b', minor: true,
    position: '歴史の長い左派の党',
    description: '平和と働く人の権利を掲げる。党員と機関紙の組織が固く、ほぼすべての小選挙区に候補を立てる。',
  },
  sankaku: {
    id: 'sankaku', name: '国民参画党', short: '参画', color: '#84cc16', minor: true,
    position: '新興の右派ポピュリスト政党',
    description: '「国民が参画する政治」を掲げ、SNSと街頭演説で若い世代と子育て世帯をつかむ。減税と食の安全、自国優先を訴える。',
  },
  shahei: {
    id: 'shahei', name: '社会平和党', short: '社平', color: '#94a3b8', minor: true,
    position: '護憲と平和を掲げる老舗の小政党',
    description: '労働組合と年配の支持者に支えられる。議席は少ないが、野党の共闘を呼びかける。',
  },
};
Game.Data.MINORS = ['kosei', 'kokumin', 'jinmin', 'sankaku', 'shahei'];   // 議席の多い順(画面の並び)
Game.Data.MINORS.forEach(function (k) {
  Object.defineProperty(Game.Data.PARTIES, k, { value: Game.Data.MINOR_PARTIES[k], enumerable: false, configurable: true, writable: true });
});
// 画面の並び:3党、小さな党(新党は数えない)
Game.Data.partyOrder = function () { return Object.keys(Game.Data.PARTIES).concat(Game.Data.MINORS); };
// この選挙に出る小さな党(史実シナリオでは出さない。実名の3党の争いに置きかえているため)
Game.Data.activeMinors = function (state) { return state && state.scenario ? [] : Game.Data.MINORS.slice(); };

// 対立候補(プレイヤーが選ばなかった2党から1人ずつ出る)
Game.Data.PEOPLE = {
  minsei: { name: '大河内 正隆', short: '大河内', age: 61, slogan: '地元とともに、確かな実行力' },
  kyowa:  { name: '早瀬 由紀子', short: '早瀬', age: 52, slogan: '暮らしの声を国会へ' },
  mirai:  { name: '桐生 蓮', short: '桐生', age: 38, slogan: '古い政治を、アップデート' },
};
// 北陽3区に候補を立てる小さな党(R19)。ほかの選挙区は seats.js の minors
Game.Data.MINOR_PEOPLE = {
  jinmin:  { name: '赤松 浩平', short: '赤松', age: 56, slogan: '平和と暮らしを守る' },
  sankaku: { name: '真柴 りえ', short: '真柴', age: 39, slogan: '日本を、国民の手に取り戻す' },
};
// プレイヤーの党ごとの、対立候補の立場
Game.Data.ROLES = {
  minsei: { kyowa: 'incumbent', mirai: 'newcomer' },
  kyowa:  { minsei: 'incumbent', mirai: 'newcomer' },
  mirai:  { minsei: 'former', kyowa: 'newcomer' },
};
Game.Data.ROLE_NAMES = { incumbent: '現職', revived: '現職(比例)', former: '元職', challenger: '元職', newcomer: '新人', assassin: '新人', leader: '党首', nat_minsei: '党首', nat_kyowa: '党首', nat_mirai: '党首', minor: '新人', nat_minor: '党首' };
Game.Data.ROLE_ORDER = ['incumbent', 'revived', 'former', 'challenger', 'newcomer', 'assassin', 'minor'];

// 新党(R16)。名前・略称・色は結党のときに自分で決める(下の3つは、すぐ使える例)。党の id はいつも 'shinto'
// Game.Data.PARTIES には「数えない」(列挙されない)形で足す。全国の総選挙・参院選・準備の画面には出ない
Game.Data.NEW_PARTIES = [
  { name: '新しい日本の会', short: '新日', color: '#16a37f', motto: '古い政治を、終わらせる' },
  { name: '国民改革新党',   short: '改新', color: '#7c3aed', motto: '改革を、国民の手に' },
  { name: '希望の結(ゆい)', short: '結', color: '#ec4899', motto: 'ひとりひとりを、結ぶ政治' },
];
// 新党の色の候補(3党の赤・青・橙と見分けがつく色。小さな党の色とも近すぎないもの)
Game.Data.NEW_PARTY_COLORS = ['#16a37f', '#7c3aed', '#ec4899', '#0f766e', '#a16207', '#e2e8f0'];
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
