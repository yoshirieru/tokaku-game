// 支援団体。宗教団体は実名、それ以外は一般名。
// 実名の団体は公開されている事実(支持関係、公称の規模、掲げる政策)だけで描く。
// 教義や信仰の評価はしない。実在の団体が不正をするイベントは作らない。
//
// ORG_DATA_MODE を 'fictional' にすると、宗教団体とその支持政党を架空の名前に差し替える。
// 数値(組織の強さなど)は balance.js の Game.Balance.orgs。
window.Game = window.Game || {};
Game.Data = Game.Data || {};

Game.Data.ORG_DATA_MODE = 'real';
Game.Data.ORG_INFO_DATE = '2026年11月時点';

// 政策(公約・団体の要望に使う)
Game.Data.POLICIES = {
  peace:        { name: '平和外交' },
  welfare:      { name: '福祉の充実' },
  education:    { name: '教育の充実' },
  livelihood:   { name: '生活者支援' },
  taxcut:       { name: '減税' },
  defense:      { name: '防衛力強化' },
  article9:     { name: '憲法9条改正' },
  constitution: { name: '憲法改正' },
  tradition:    { name: '伝統文化の継承' },
  wage:         { name: '賃上げ' },
  employment:   { name: '雇用の安定' },
  deregulation: { name: '規制緩和' },
  growth:       { name: '成長戦略' },
  agri:         { name: '農業支援' },
  medical:      { name: '医療・社会保障' },
};

// 同時に掲げると矛盾する政策の組み合わせ
Game.Data.POLICY_CONFLICTS = [
  ['peace', 'defense'],
  ['peace', 'article9'],
  ['welfare', 'taxcut'],
  ['medical', 'taxcut'],
  ['deregulation', 'agri'],
  ['deregulation', 'medical'],
  ['deregulation', 'employment'],
];

// 政党ごとの基本の政策(ライバル候補の公約と、プレイヤーの看板政策の初期値)
Game.Data.PARTY_PLATFORMS = {
  minsei:  ['growth', 'agri', 'defense'],
  kyowa:   ['wage', 'welfare', 'peace'],
  mirai:   ['deregulation', 'education', 'taxcut'],
  kofuku:  ['taxcut', 'defense', 'article9'],
  komeito: ['peace', 'welfare', 'education'],
  // 比例だけの小政党(合流交渉で政策の近さをみる)
  heiwa:   ['peace', 'welfare', 'wage'],
  kokumin: ['taxcut', 'livelihood', 'growth'],
  midori:  ['peace', 'education', 'medical'],
};

const ORGS_REAL = {
  soka: {
    id: 'soka', name: '創価学会', kind: 'religious', real: true, party: 'komeito',
    strength: '全国で崩れにくい大きな組織票。都市部と期日前投票に強い。比例票の融通',
    policies: ['peace', 'welfare', 'education', 'livelihood'],
    facts: [
      '公明党の支持母体。会員数は公称827万世帯',
      '公明党は1999年から約26年間、自民党と協力してきた',
      '2026年1月、公明党と立憲民主党の衆院議員が中道改革連合を結成。8月末に3党合流を断念した',
    ],
  },
  kofuku: {
    id: 'kofuku', name: '幸福の科学', kind: 'religious', real: true, party: 'kofuku',
    strength: '組織票は小さいが運動量が多い。独自候補(幸福実現党)を立てると、近い政策の票が割れる',
    policies: ['taxcut', 'defense', 'article9'],
    facts: [
      '2009年に政治団体「幸福実現党」を結成',
      '国政進出を目指して活動している',
    ],
  },
  shinseiren: {
    id: 'shinseiren', name: '神道政治連盟', kind: 'religious', real: true, party: null,
    strength: '全国の神社のつながり。地方・農村で効く',
    policies: ['constitution', 'tradition'],
    facts: [
      '1969年結成。神社本庁の関係団体',
      '国会議員懇談会の会員は213人(2024年11月時点)',
    ],
  },
};

// 差し替え用の架空データ(ORG_DATA_MODE = 'fictional')
const ORGS_FICTIONAL = {
  soka: {
    id: 'soka', name: '平和福祉会(架空)', kind: 'religious', real: false, party: 'komeito',
    strength: ORGS_REAL.soka.strength, policies: ORGS_REAL.soka.policies,
    facts: ['架空の団体です'],
  },
  kofuku: {
    id: 'kofuku', name: '幸福未来会(架空)', kind: 'religious', real: false, party: 'kofuku',
    strength: ORGS_REAL.kofuku.strength, policies: ORGS_REAL.kofuku.policies,
    facts: ['架空の団体です'],
  },
  shinseiren: {
    id: 'shinseiren', name: '伝統文化連盟(架空)', kind: 'religious', real: false, party: null,
    strength: ORGS_REAL.shinseiren.strength, policies: ORGS_REAL.shinseiren.policies,
    facts: ['架空の団体です'],
  },
};
const PARTY_NAMES_FICTIONAL = {
  komeito: { name: '福祉平和党(架空)', short: '福平' },
  kofuku:  { name: '幸福未来党(架空)', short: '幸未' },
};

const ORGS_GENERIC = {
  union:    { id: 'union',    name: '労働組合',  kind: 'generic', real: false, party: null, strength: '工業地帯・都市部の組織票', policies: ['wage', 'employment'], facts: ['一般的な団体として描いています(特定の団体ではありません)'] },
  business: { id: 'business', name: '経済団体',  kind: 'generic', real: false, party: null, strength: '資金と企業の組織票。推薦すると資金援助がある', policies: ['deregulation', 'growth'], facts: ['一般的な団体として描いています(特定の団体ではありません)'] },
  farm:     { id: 'farm',     name: '農業団体',  kind: 'generic', real: false, party: null, strength: '農村の組織票', policies: ['agri'], facts: ['一般的な団体として描いています(特定の団体ではありません)'] },
  medical:  { id: 'medical',  name: '医療団体',  kind: 'generic', real: false, party: null, strength: '全国に広がる組織票', policies: ['medical'], facts: ['一般的な団体として描いています(特定の団体ではありません)'] },
};

Game.Data.ORGANIZATIONS = Object.assign(
  {},
  Game.Data.ORG_DATA_MODE === 'fictional' ? ORGS_FICTIONAL : ORGS_REAL,
  ORGS_GENERIC,
);

// 架空モードなら、宗教団体が支持母体の政党名も差し替える(parties.js の後に読み込むこと)
if (Game.Data.ORG_DATA_MODE === 'fictional' && Game.Data.PARTIES) {
  for (const id in PARTY_NAMES_FICTIONAL) {
    if (Game.Data.PARTIES[id]) Object.assign(Game.Data.PARTIES[id], PARTY_NAMES_FICTIONAL[id], { real: false });
  }
}
