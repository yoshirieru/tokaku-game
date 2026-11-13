// 数値はすべてここに集める(効果量、コスト、確率、政党の強さ、相手の強さ)。
// ロジック(js/engine)や画面(js/ui)に数値を直書きしない。
window.Game = window.Game || {};

Game.Balance = {
  campaign: {
    days: 8,             // 選挙戦の日数
    energy: 3,           // 1日の体力
    handSize: 5,         // 毎朝配られる手札の枚数
    startMoney: 60,      // 始まりの資金(万円)
    shareCap: 85,        // 1つの地区で取れる支持の上限(%)
    shareFloor: 3,       // 下限(%)
    lastDayBonus: 1,     // 最終日は、地区を選ぶカードの効果に上乗せ
    promiseFree: 2,      // ここまでの約束は不利なし
    promisePenalty: 1,   // それを超えて約束するたび、全地区で下がる支持(八方美人)
    shieldBlock: 0.5,    // 固い票1つが、相手の伸びを減らす割合(1回で1つ使う)
    shieldMax: 3,        // 1つの地区に積める固い票
    saturatedLead: 10,   // 2位との差がこれ以上(◎優勢)の地区では、それ以上は伸びにくい
    saturatedMult: 0.5,  // そのときの効果の倍率(プレイヤーも相手も同じ)
  },

  // 情勢の印:いちばん強い相手との差(ポイント)。strong 以上で ◎、lean 以上で ○、± lean の内は ▲
  marks: { strong: 10, lean: 3 },

  // 始まりの支持 =党の地力(地区ごと)× 立場の倍率、の比
  partyBase: {
    rural:       { minsei: 50, kyowa: 26, mirai: 14 },
    residential: { minsei: 39, kyowa: 33, mirai: 22 },
    downtown:    { minsei: 37, kyowa: 32, mirai: 27 },
    industrial:  { minsei: 28, kyowa: 50, mirai: 18 },
    campus:      { minsei: 26, kyowa: 32, mirai: 37 },
  },
  roles: {
    // gain 1回の動きで伸びる支持 / actions 日ごとの動きの回数
    player:    { mult: 0.69 },
    newcomer:  { mult: 0.85, gain: 4, actions: [1, 1, 1, 1, 1, 2, 2, 2] },
    former:    { mult: 1.1,  gain: 4, actions: [2, 2, 2, 2, 2, 2, 2, 2] },
    incumbent: { mult: 1.25, gain: 5, actions: [2, 2, 2, 2, 2, 2, 2, 2] },
  },
  // 相手が入る地区の選び方:有権者の多さ × 競り合い × 党との相性。守りは、こちらに迫られた地区を重く見る
  rivalAI: { closeScale: 8, defendWithin: 10, defendMult: 1.6, affinityBase: 35 },

  // カード。cost 体力 / money 資金(万円。マイナスは集まる)/ gain 選んだ地区の伸び / tagBonus 地区の性格ごとの上乗せ
  // all 地区を選ばず、性格の合う地区すべてが伸びる / shield 固い票 / once この選挙で1回だけ / block その地区の相手の今日の動きを止める
  cards: {
    speech:   { cost: 1, money: 5,   gain: 4, tagBonus: { urban: 2 } },
    door:     { cost: 2, money: 0,   gain: 3, tagBonus: { org: 3 }, shield: 1 },
    talk:     { cost: 1, money: 5,   gain: 3, tagBonus: { family: 2, elder: 2 } },
    rally:    { cost: 2, money: 20,  gain: 7 },
    flyer:    { cost: 0, money: 5,   gain: 2 },
    sns:      { cost: 1, money: 0,   all: { youth: 3, float: 1 } },
    fund:     { cost: 1, money: -40 },
    ahead:    { cost: 1, money: 0,   gain: 2, block: true },
    star:     { cost: 1, money: 0,   gain: 7, once: true },
    pAgri:    { cost: 0, money: 0,   region: 'rural',       gain: 8, once: true, promise: 'agri' },
    pUnion:   { cost: 0, money: 0,   region: 'industrial',  gain: 8, once: true, promise: 'wage' },
    pFamily:  { cost: 0, money: 0,   region: 'residential', gain: 6, once: true, promise: 'family' },
    pShop:    { cost: 0, money: 0,   region: 'downtown',    gain: 6, once: true, promise: 'taxcut' },
    pStudent: { cost: 0, money: 0,   region: 'campus',      gain: 7, once: true, promise: 'tuition' },
  },
  // 山札(党ごとの約束カード3枚を足す)
  deck: ['speech', 'speech', 'speech', 'door', 'door', 'talk', 'talk', 'rally', 'sns', 'sns', 'flyer', 'flyer', 'fund', 'ahead', 'star'],
  partyPromises: {
    minsei: ['pAgri', 'pShop', 'pFamily'],
    kyowa:  ['pUnion', 'pFamily', 'pStudent'],
    mirai:  ['pStudent', 'pShop', 'pFamily'],
  },

  // 朝の出来事(初日・情勢調査の日・討論会の日には起きない)
  events: {
    chance: 0.35,
    rain:     { weight: 3, speech: -2, door: 1 },   // 雨:街頭演説が届きにくく、戸別訪問は心に残る
    tailwind: { weight: 2, all: 1 },                // 党に追い風
    headwind: { weight: 2, all: -1 },               // 党に逆風
    gaffe:    { weight: 2, all: -2 },               // 相手(いちばん強い候補)の失言
    donation: { weight: 2, money: 20 },             // 支援者からの寄付
  },
  pollDay: 4,
  debateDay: 5,
  debate: {
    attack: { chance: 0.55, hit: -3, miss: -2 },    // 相手の弱点を突く:当たれば相手が全地区で下がり、外せば自分が下がる
    policy: { all: 1 },                             // 政策を語る:確実に全地区で少し上がる
    local:  { tags: ['elder', 'family'], gain: 3 }, // 地元の話をする:高齢層・子育て世帯の地区で上がる
  },

  // 投票日
  vote: {
    weather: [{ id: 'sunny', weight: 55, turnout: 0 }, { id: 'cloudy', weight: 30, turnout: -1 }, { id: 'rain', weight: 15, turnout: -5 }],
    turnout: { rural: 62, residential: 54, downtown: 50, industrial: 55, campus: 38 },   // 投票率の基準(%)
    turnoutNoise: 2,
    swingAll: 1.5,       // 候補ごとの、選挙区全体のぶれ(標準偏差、ポイント)
    swingRegion: 2.5,    // 候補ごと・地区ごとのぶれ
    shieldVote: 1,       // 固い票1つあたり、投票日の上乗せ(ポイント)
    shieldRain: 2,       // 雨の日は固い票が倍効く
  },
  // 開票特番
  count: {
    ticks: ['20:00', '20:30', '21:00', '21:30', '22:00', '22:30', '23:00', '23:30', '0:00'],
    // 地区ごとの開票の進み方(各時刻の開票率)
    progress: {
      rural:       [0, 0.25, 0.6, 0.9, 1, 1, 1, 1, 1],
      industrial:  [0, 0.1, 0.35, 0.65, 0.9, 1, 1, 1, 1],
      residential: [0, 0.05, 0.25, 0.5, 0.75, 0.92, 1, 1, 1],
      campus:      [0, 0.05, 0.2, 0.45, 0.7, 0.9, 1, 1, 1],
      downtown:    [0, 0, 0.15, 0.35, 0.6, 0.82, 0.95, 1, 1],
    },
    earlySkew: 0.12,     // 開票のはじめの、候補ごとの偏り
    zeroCallMargin: 12,  // 最終的な差がこれ以上(ポイント)なら20時ちょうどに当確
    callRatio: 0.55,     // 開票済みの差が、残りの票のこの割合を超えたら当確
  },
};
