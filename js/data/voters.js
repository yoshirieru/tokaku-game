// 1万人の架空の有権者(R18)の属性の種類。生成と動きは js/engine/voters.js、数値は balance.js の voters。
// 支援団体の所属率(宗教団体を含む)は、ゲーム上の設定値で、実際の統計ではない。
window.Game = window.Game || {};
Game.Data = Game.Data || {};

// 職業:年齢の範囲・もとの重み・多い地区の性格
Game.Data.VOTER_JOBS = [
  { id: 'student', name: '学生', minAge: 18, maxAge: 24, w: 6, tags: ['youth'] },
  { id: 'office', name: '会社員', minAge: 22, maxAge: 64, w: 30, tags: ['urban', 'float', 'family'] },
  { id: 'factory', name: '工場勤務', minAge: 18, maxAge: 64, w: 10, tags: ['union'] },
  { id: 'farmer', name: '農業', minAge: 20, maxAge: 90, w: 5, tags: ['org', 'elder'] },
  { id: 'self', name: '自営業', minAge: 25, maxAge: 80, w: 9, tags: ['urban', 'org'] },
  { id: 'public', name: '公務員', minAge: 22, maxAge: 64, w: 6 },
  { id: 'part', name: 'パート・アルバイト', minAge: 18, maxAge: 75, w: 10, tags: ['family', 'youth'] },
  { id: 'care', name: '医療・福祉', minAge: 20, maxAge: 70, w: 7 },
  { id: 'retired', name: '年金生活', minAge: 60, maxAge: 90, w: 30, tags: ['elder'] },
];
// 関心テーマ(1人に上位2つ)
Game.Data.VOTER_TOPICS = [
  { id: 'child', name: '子育て支援', maxAge: 49, tags: ['family'] },
  { id: 'pension', name: '年金・医療', minAge: 60, tags: ['elder'] },
  { id: 'jobs', name: '景気・雇用', jobs: ['office', 'factory', 'part'], tags: ['union'] },
  { id: 'agri', name: '農業の支援', jobs: ['farmer'], tags: ['org'] },
  { id: 'tax', name: '減税', jobs: ['self', 'office'], tags: ['urban'] },
  { id: 'edu', name: '教育・学費', jobs: ['student'], maxAge: 29, tags: ['youth'] },
  { id: 'disaster', name: '防災', tags: ['org', 'elder'] },
  { id: 'env', name: '環境', maxAge: 39, tags: ['youth', 'urban'] },
  { id: 'transit', name: '地域の交通', minAge: 70, tags: ['elder'] },
];
// 支援団体(0番目は「なし」)。base はだれでも入っている見込み、jobs の人は jobRate。地区の性格で増える
Game.Data.VOTER_GROUPS = [
  { id: 'none', name: 'なし' },
  { id: 'agri', name: '農業団体', base: 0.02, jobs: ['farmer'], jobRate: 0.6 },
  { id: 'biz', name: '商工団体', base: 0.02, jobs: ['self'], jobRate: 0.45 },
  { id: 'union', name: '労働組合', base: 0.03, jobs: ['factory', 'public'], jobRate: 0.4, tags: ['union'] },
  { id: 'religion', name: '宗教団体', base: 0.05 },
  { id: 'parents', name: '子育て・PTAの会', base: 0.05, minAge: 28, maxAge: 50, tags: ['family'] },
  { id: 'seniors', name: '老人クラブ', base: 0.16, minAge: 65, tags: ['elder'] },
];
