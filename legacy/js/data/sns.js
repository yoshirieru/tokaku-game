// SNSの文面データ(sns.js が使う)。SNSの名前はすべて架空。数値は balance.js の Game.Balance.sns
window.Game = window.Game || {};
Game.Data = Game.Data || {};

Game.Data.SNS_PLATFORMS = ['つぶやきSNS', '動画サイト', '写真SNS'];

// 投稿の種類
Game.Data.SNS_POST_TYPES = {
  policy: { name: '政策解説', icon: '📘', platform: 'つぶやきSNS', desc: '政策を図にして説明する。伸びは控えめだが、好感度が着実に上がる。' },
  daily:  { name: '日常',     icon: '🍙', platform: '写真SNS',     desc: '食事や家族、地元の風景を載せる。親しみがわき、好感度が少し上がる。' },
  attack: { name: '他党批判', icon: '⚔', platform: 'つぶやきSNS', desc: '相手の政策の矛盾を突く。話題になりやすいが、好感度は上下しやすく、炎上することもある。' },
  neta:   { name: 'ネタ',     icon: '😆', platform: '動画サイト',   desc: '流行りのネタに乗る。いちばん話題になるが、すべったり炎上したりもしやすい。' },
};

// 毎日(任期・党首モードでは毎ターン)のトレンドワード
//   fits: 乗れる投稿の種類、policy: この政策を公約に掲げていれば政策解説は確実に乗れる、
//   serious: まじめな話題(ネタで乗ると不謹慎だと炎上しやすい)
Game.Data.SNS_TRENDS = [
  { word: '物価高つらい',     fits: ['policy', 'daily'],  policy: 'livelihood' },
  { word: '給料上がらない',   fits: ['policy', 'attack'], policy: 'wage' },
  { word: '子育て世代の本音', fits: ['policy', 'daily'],  policy: 'education' },
  { word: '病院の待ち時間',   fits: ['policy', 'daily'],  policy: 'medical' },
  { word: '減税してほしい',   fits: ['policy', 'attack'], policy: 'taxcut' },
  { word: '安全保障を考える', fits: ['policy'],           policy: 'defense', serious: true },
  { word: '農家のリアル',     fits: ['daily', 'policy'],  policy: 'agri' },
  { word: '働き方を変えたい', fits: ['policy', 'daily'],  policy: 'employment' },
  { word: '国会中継',         fits: ['attack', 'policy'] },
  { word: '選挙に行こう',     fits: ['policy', 'daily'] },
  { word: '推し活',           fits: ['neta', 'daily'] },
  { word: 'ネコの日',         fits: ['neta', 'daily'] },
  { word: 'ご当地グルメ',     fits: ['daily', 'neta'] },
  { word: '朝活',             fits: ['daily'] },
  { word: '謎の踊り動画',     fits: ['neta'] },
  { word: '防災の日',         fits: ['policy'], serious: true },
  { word: '大雨に備えて',     fits: ['policy', 'daily'], serious: true },
];

// 炎上の種類ごとの文面。real: 自分の落ち度(謝罪が効く)、unfair: 切り抜き・デマ(謝罪は逆効果になりやすい)
Game.Data.SNS_FLAMES = {
  post: {
    real: true, label: '投稿が炎上',
    texts: [
      '昨日の投稿の言い回しが「有権者を見下している」と批判され、引用が広がっている。',
      '昨日の他党批判の投稿に事実の誤りがあると指摘され、批判の返信が殺到している。',
      'ネタのつもりの投稿が「政治家として軽すぎる」と受け取られ、引用が広がっている。',
    ],
  },
  serious: {
    real: true, label: '不謹慎だと炎上',
    texts: ['まじめな話題のトレンドにネタで乗った投稿が「不謹慎だ」と批判され、引用が止まらない。'],
  },
  gaffe: {
    real: true, label: '失言が拡散',
    texts: ['番組での失言の場面が動画サイトで切り出され、「政治家の本音」として拡散されている。'],
  },
  clip: {
    real: false, label: '切り抜きで炎上',
    texts: [
      '討論での発言の一部だけが切り抜かれ、本来の意味と違う形で拡散されている。',
      '国会での質問の一場面が前後を省いて切り抜かれ、「暴言だ」として広まっている。',
    ],
  },
  hoax: {
    real: false, label: 'デマが拡散', hoax: true,
    texts: [
      'あなたが「選挙が終われば地元のことは知らない」と言ったとする偽の画像が出回っている。',
      'あなたの事務所が支援者に金品を配っているという根拠のない書き込みが拡散されている。',
    ],
  },
};
