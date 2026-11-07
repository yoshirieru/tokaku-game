// 政党(説明・表示用)。数値の強さは balance.js の Game.Balance.parties。
// 既存3党はすべて架空。宗教団体が支持母体の政党(公明党、幸福実現党)だけ実名(real: true)。
// real: true の政党と、その候補者には不祥事・失言のイベントを起こさない。
window.Game = window.Game || {};
Game.Data = Game.Data || {};

Game.Data.PARTIES = {
  minsei: {
    id: 'minsei',
    name: '日本民政党',
    short: '民政',
    color: '#c8323c',
    position: '保守系の与党第一党',
    difficulty: 'やさしい',
    difficultyNote: '当選しやすく、出世は遅い',
    description: '長く政権を担ってきた保守政党。農村と高齢層に強く、地元の後援会や業界団体の組織票が厚い。',
    playable: true,
  },
  kyowa: {
    id: 'kyowa',
    name: '市民共和党',
    short: '共和',
    color: '#2f64b4',
    position: '中道左派の野党第一党',
    difficulty: 'ふつう',
    difficultyNote: '組織票はあるが与党の現職が手ごわい',
    description: '政権交代をめざす野党第一党。工業地帯と都市部に支持が厚く、労働組合とのつながりが強い。',
    playable: true,
  },
  mirai: {
    id: 'mirai',
    name: '未来改革党',
    short: '未来',
    color: '#e08a1e',
    position: '改革系の第三党',
    difficulty: 'むずかしい',
    difficultyNote: '組織票が少なく、浮動票が頼り',
    description: '行政改革とデジタル化を掲げる新興の第三党。若い世代と都市部の浮動票が頼り。',
    playable: true,
  },
  // ---- 実名の政党(支持関係など公開されている事実だけで描く) ----
  komeito: {
    id: 'komeito',
    name: '公明党',
    short: '公明',
    color: '#4a90c8',
    position: '創価学会を支持母体とする政党',
    description: '創価学会を支持母体とする政党。比例代表に候補を立てる。',
    supportOrg: 'soka',
    playable: false,
    real: true,
  },
  kofuku: {
    id: 'kofuku',
    name: '幸福実現党',
    short: '幸福',
    color: '#7a5aa6',
    position: '幸福の科学が2009年に結成した政治団体',
    description: '幸福の科学が2009年に結成した政治団体。国政進出を目指して活動している。',
    supportOrg: 'kofuku',
    playable: false,
    real: true,
  },
};

// 北陽3区の対立候補(架空)。政党ごとに1人ずつ用意し、プレイヤーの党以外の2人が出馬する。
// ほかの選挙区の顔ぶれは districts.js の SEATS(applySeat で RIVALS / RIVAL_ROLES を差し替える)。
// role は Game.Balance.rivals のキー。プレイヤーの党によって現職・元職・新人が入れ替わる。
Game.Data.RIVALS = {
  minsei: { name: '大河内 正隆', kana: 'おおこうち まさたか', age: 61, catch: '地元とともに、確かな実行力' },
  kyowa:  { name: '早瀬 由紀子', kana: 'はやせ ゆきこ', age: 52, catch: '暮らしの声を国会へ' },
  mirai:  { name: '桐生 蓮', kana: 'きりゅう れん', age: 38, catch: '古い政治を、アップデート' },
  // 幸福実現党の候補(人物は架空)。幸福の科学の推薦がプレイヤーにない選挙で出馬する
  kofuku: { name: '望月 誠也', kana: 'もちづき せいや', age: 45, catch: '減税と国防で日本を元気に' },
};

// プレイヤーの党ごとに、対立候補の立場を決める
Game.Data.RIVAL_ROLES = {
  minsei: { kyowa: 'incumbentStrong', mirai: 'newcomer' },   // 前任の民政党議員が引退し、3期目をねらう共和党の現職に挑む
  kyowa:  { minsei: 'incumbent', mirai: 'newcomer' },
  mirai:  { minsei: 'former', kyowa: 'newcomer' },        // 民政党の元職が返り咲きをねらう
};

// 比例代表にだけ登場する小政党(架空)。名簿の中身は作らず、得票と議席だけ計算する。
// 公明党・幸福実現党も比例では同じ扱い(PARTIES に定義)。
Game.Data.MINOR_PARTIES = {
  heiwa:   { id: 'heiwa',   name: '社会平和党', short: '社平', color: '#c2477e' },
  kokumin: { id: 'kokumin', name: '国民の声',   short: '国声', color: '#6b52b0' },
  midori:  { id: 'midori',  name: '緑の連帯',   short: '緑',   color: '#3e9a5c' },
};

// 比例名簿に載せる架空の候補者の名前を組み立てる材料
Game.Data.NAME_POOL = {
  family: ['佐伯', '今井', '小野寺', '杉本', '高木', '中川', '藤田', '石原', '村井', '松浦', '堀', '吉岡', '上田', '島崎', '河合', '関', '岩崎', '野村', '宮内', '安藤', '久保', '千葉', '服部', '浅野', '三宅', '大塚', '片山', '丸山', '永井', '桑原'],
  given: ['健一', '直子', '大輔', '美穂', '誠', '恵', '拓也', '由美', '隆', '真理', '浩二', '彩', '修', '典子', '剛', '香織', '亮', '智子', '徹', '陽子', '翼', '玲奈', '昌平', '加奈'],
};

// 議員の役職(index は Game.Balance.term.promotion.steps の段階 + 1)
Game.Data.POSTS = {
  ruling:     ['平議員', '政務官', '副大臣・委員長', '大臣', '党役員'],
  opposition: ['平議員', '委員会理事', '筆頭理事', '次の内閣の大臣', '党役員'],
};
Game.Data.RULING_PARTY = 'minsei';   // M4 の時点では政権交代しない(M7 で動かす)
Game.Data.PRIME_MINISTER = { name: '鷹野 修一郎', party: 'minsei' };   // 架空の首相
Game.Data.SESSIONS = ['通常国会', '夏の閉会中', '臨時国会', '冬の閉会中'];
// 国会の会期中かどうか(委員会質問と議員立法ができる)
Game.Data.SESSION_OPEN = [true, false, true, false];

// ---- 党首選(leadership.js) ----
// 各党の衆議院議員の数(党首選の議員票。党員票も同じ数に換算する)
Game.Data.PARTY_MPS = { minsei: 210, kyowa: 110, mirai: 30 };
// 党首選のライバル(架空)
Game.Data.LEADER_RIVALS = {
  minsei: [
    { name: '白石 隆之', title: '幹事長' },
    { name: '大貫 恵子', title: '元外務大臣' },
  ],
  kyowa: [
    { name: '真壁 透', title: '代表代行' },
    { name: '小田切 紗英', title: '政調会長' },
  ],
  mirai: [
    { name: '沢渡 健吾', title: '共同代表' },
    { name: '日向 杏奈', title: '幹事長' },
  ],
};

// ---- 新党(newparty.js) ----
// 理念:地区との相性と、看板政策のおすすめ
Game.Data.IDEOLOGIES = {
  reform:   { name: '改革・中道', lean: { urban: 0.6, youth: 0.8, elderly: -0.4 }, suggest: ['deregulation', 'education', 'growth'] },
  conserv:  { name: '保守',       lean: { farm: 0.5, elderly: 0.4 },               suggest: ['defense', 'constitution', 'tradition'] },
  liberal:  { name: 'リベラル',   lean: { urban: 0.4, industry: 0.3, youth: 0.3 },  suggest: ['peace', 'welfare', 'wage'] },
  life:     { name: '生活重視',   lean: { elderly: 0.3, industry: 0.3 },           suggest: ['livelihood', 'taxcut', 'medical'] },
};
Game.Data.CUSTOM_COLORS = ['#16a085', '#8e44ad', '#d35400', '#2c3e50', '#c0392b', '#e84393', '#00a8c6', '#6d8a22'];
// 新党(スタート時)で党首が戦う北陽3区の相手(ほかの選挙区の顔ぶれは districts.js の SEATS)
Game.Data.RIVAL_ROLES.newparty = { minsei: 'incumbent', kyowa: 'former', mirai: 'newcomer' };
// 刺客(離党・移籍した議員の選挙区に元の党が立てる候補)の役割
Game.Data.ASSASSIN_TITLES = ['元知事', '元アナウンサー', '元官僚', '元県議会議長'];

// ---- 国会の勢力図(M5.5 の党首モードから使う。M6 の全国選挙もここから始める) ----
// 衆議院 465 議席。'indep' は無所属など
// 全党をAIに任せた総選挙のおおよその結果に合わせてある(tools/autoplay.js では確認できないので M6 のテストで確認)
Game.Data.PARTY_SEATS = { minsei: 255, kyowa: 127, mirai: 28, komeito: 18, kokumin: 18, heiwa: 12, midori: 4, indep: 3 };
Game.Data.HOUSE_SEATS = 465;
Game.Data.MAJORITY = 233;
Game.Data.PARTIES_EXTRA = {
  indep: { id: 'indep', name: '無所属など', short: '無', color: '#9aa0a6' },
};
// 支持母体(合流すると、その団体の要望も引き継ぐ)
Game.Data.PARTY_BACKERS = {
  minsei: ['farm', 'business', 'shinseiren'],
  kyowa: ['union'],
  mirai: ['business'],
  komeito: ['soka'],
  heiwa: ['union'],
  kokumin: [],
  midori: [],
};
// 合流の実例(交渉画面と分裂イベントで見せる。CLAUDE.md の記述どおり)
Game.Data.MERGER_EXAMPLE = '実例:中道改革連合(2026年1月結成、約7か月で合流断念・分裂の方向)';
// 反主流派が離党して作る党の名前(架空)
Game.Data.SPLINTER_NAMES = ['新しい政治をつくる会', '国民本位の会', '改革保守クラブ', '生活と希望の会'];

// ---- 政権運営(government.js) ----
// 参議院 248議席(3年ごとに半数124を改選)。最初の構成(架空。与党の民政がぎりぎり過半数)。A組は2028年、B組は2031年に改選
Game.Data.UPPER_SEATS = 248;
Game.Data.UPPER_MAJORITY = 125;
Game.Data.UPPER_INITIAL = {
  A: { minsei: 64, kyowa: 25, komeito: 11, mirai: 8, kokumin: 8, heiwa: 4, midori: 1, indep: 3 },
  B: { minsei: 64, kyowa: 26, komeito: 10, mirai: 8, kokumin: 7, heiwa: 5, midori: 1, indep: 3 },
};
Game.Data.UPPER_FIRST_ELECTION = 2028;   // 以後3年ごと
// 重要法案の名前(政策から)
Game.Data.BILL_NAMES = {
  peace: '平和外交推進法案', welfare: '福祉充実法案', education: '教育無償化法案', livelihood: '生活支援給付法案',
  taxcut: '減税法案', defense: '防衛力整備法案', article9: '憲法9条改正の発議', constitution: '憲法改正の発議',
  tradition: '伝統文化振興法案', wage: '最低賃金引き上げ法案', employment: '雇用安定法案', deregulation: '規制改革法案',
  growth: '成長戦略推進法案', agri: '農業支援法案', medical: '医療・社会保障改革法案',
};
