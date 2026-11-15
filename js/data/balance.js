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

  // 画面の操作:同じカードをこの時間(ミリ秒)のうちに2回押すと、ダブルクリックとしてすぐ使う(スマホのダブルタップも同じ)
  ui: { doubleClick: 400 },

  // 情勢の印:いちばん強い相手との差(ポイント)。strong 以上で ◎、lean 以上で ○、± lean の内は ▲
  marks: { strong: 10, lean: 3 },

  // 始まりの支持 =党の地力(地区ごと)× 立場の倍率、の比。選挙区の地力は下の seats、ここは全国のブロック(js/data/nation.js)
  partyBase: {
    hokkaido:    { minsei: 36, kyowa: 44, mirai: 20 },
    tohoku:      { minsei: 44, kyowa: 38, mirai: 18 },
    hokuriku:    { minsei: 48, kyowa: 34, mirai: 18 },
    kitakanto:   { minsei: 43, kyowa: 36, mirai: 21 },
    chugoku:     { minsei: 50, kyowa: 32, mirai: 18 },
    kinki:       { minsei: 34, kyowa: 30, mirai: 36 },
    tokai:       { minsei: 38, kyowa: 43, mirai: 19 },
    tokyo:       { minsei: 35, kyowa: 35, mirai: 30 },
    minamikanto: { minsei: 39, kyowa: 37, mirai: 24 },
    kyushu:      { minsei: 46, kyowa: 35, mirai: 19 },
    shikoku:     { minsei: 49, kyowa: 33, mirai: 18 },
  },
  roles: {
    // gain 1回の動きで伸びる支持 / actions 日ごとの動きの回数
    newcomer:  { mult: 0.85, gain: 4, actions: [1, 1, 1, 1, 1, 2, 2, 2] },
    former:    { mult: 1.1,  gain: 4, actions: [2, 2, 2, 2, 2, 2, 2, 2] },
    incumbent: { mult: 1.25, gain: 5, actions: [2, 2, 2, 2, 2, 2, 2, 2] },
    // 全国の総選挙での、相手の党の動き(党首が全国を回る)
    nat_minsei: { mult: 1, gain: 5, actions: [3, 3, 3, 3, 3, 3, 3, 3] },
    nat_kyowa:  { mult: 1, gain: 5, actions: [3, 3, 3, 3, 3, 3, 3, 3] },
    nat_mirai:  { mult: 1, gain: 5, actions: [2, 2, 2, 2, 2, 2, 2, 2] },
    challenger: { mult: 1.2,  gain: 5, actions: [2, 2, 2, 2, 2, 2, 2, 2] },   // プレイヤーに議席を奪われた前の現職(画面では元職)。巻き返しをねらう
  },
  // プレイヤーの立場ごとの、始まりの支持の倍率(新人 / 当選して現職 / 落選した元職)
  // revived は、小選挙区で負けて比例復活した現職(議席はあるが、選挙区には勝った相手がいる)
  // leader は党首として戦う総選挙(党の地力そのまま)
  playerRoles: { newcomer: 0.68, incumbent: 0.72, revived: 0.7, former: 0.66, leader: 1 },
  // 選挙区(R6。地図・相手・約束の名前は js/data/seats.js)。地区の id は5つとも同じで、中身(名前と性格)が選挙区ごとにちがう
  //   base 党の地力(地区ごと)/ turnout 投票率の基準(%)/ rivalMult 相手の候補の強さ(始まりの支持の倍率。ないときは1)
  //     都市の地区ほどカードがよく効くので、北陽3区のほかは相手を強くして釣り合わせている
  //   guide 難しさの目安(中級ボットが最初の選挙で議席を得る割合 %。準備の画面のことばになる)
  seats: {
    hokuyo3: {   // バランス型
      base: {
        rural:       { minsei: 50, kyowa: 26, mirai: 14 },
        residential: { minsei: 39, kyowa: 33, mirai: 22 },
        downtown:    { minsei: 37, kyowa: 32, mirai: 27 },
        industrial:  { minsei: 28, kyowa: 50, mirai: 18 },
        campus:      { minsei: 26, kyowa: 32, mirai: 37 },
      },
      turnout: { rural: 62, residential: 54, downtown: 50, industrial: 55, campus: 38 },
      guide: { minsei: 70, kyowa: 49, mirai: 34 },
    },
    touou7: {    // 都会(下町・山の手は高齢層、ほかは浮動票。未来の地盤)
      base: {
        downtown:    { minsei: 33, kyowa: 32, mirai: 35 },
        residential: { minsei: 39, kyowa: 37, mirai: 24 },
        industrial:  { minsei: 32, kyowa: 33, mirai: 35 },
        rural:       { minsei: 41, kyowa: 31, mirai: 28 },
        campus:      { minsei: 26, kyowa: 33, mirai: 41 },
      },
      turnout: { downtown: 50, residential: 58, industrial: 52, rural: 60, campus: 40 },
      rivalMult: 1.5,
      guide: { minsei: 39, kyowa: 36, mirai: 58 },
    },
    biyou2: {    // 保守王国(民政の地盤)
      base: {
        downtown:    { minsei: 34, kyowa: 33, mirai: 29 },
        residential: { minsei: 40, kyowa: 30, mirai: 21 },
        industrial:  { minsei: 25, kyowa: 49, mirai: 24 },
        rural:       { minsei: 41, kyowa: 28, mirai: 21 },
        campus:      { minsei: 25, kyowa: 33, mirai: 45 },
      },
      turnout: { downtown: 58, residential: 64, industrial: 56, rural: 66, campus: 42 },
      rivalMult: 1.3,
      guide: { minsei: 83, kyowa: 26, mirai: 5 },
    },
    ominato4: {  // 工業都市(共和の地盤)
      base: {
        downtown:    { minsei: 36, kyowa: 29, mirai: 34 },
        residential: { minsei: 32, kyowa: 37, mirai: 26 },
        industrial:  { minsei: 26, kyowa: 43, mirai: 24 },
        rural:       { minsei: 50, kyowa: 24, mirai: 24 },
        campus:      { minsei: 28, kyowa: 29, mirai: 45 },
      },
      turnout: { downtown: 50, residential: 55, industrial: 58, rural: 62, campus: 38 },
      rivalMult: 1.25,
      guide: { minsei: 40, kyowa: 80, mirai: 15 },
    },
    namio5: {    // 改革の地盤(未来の強い現職)
      base: {
        downtown:    { minsei: 32, kyowa: 27, mirai: 40 },
        residential: { minsei: 34, kyowa: 30, mirai: 36 },
        industrial:  { minsei: 32, kyowa: 44, mirai: 25 },
        rural:       { minsei: 46, kyowa: 30, mirai: 25 },
        campus:      { minsei: 25, kyowa: 30, mirai: 43 },
      },
      turnout: { downtown: 50, residential: 55, industrial: 54, rural: 60, campus: 40 },
      rivalMult: 1.45,
      guide: { minsei: 38, kyowa: 30, mirai: 73 },
    },
    kitatsu1: {  // 地方の激戦区(R10。選挙違反が起きやすい:fraud は balance.js の fraud の起きやすさ)
      base: {
        downtown:    { minsei: 29, kyowa: 34, mirai: 36 },
        residential: { minsei: 37, kyowa: 30, mirai: 29 },
        industrial:  { minsei: 23, kyowa: 46, mirai: 31 },
        rural:       { minsei: 38, kyowa: 30, mirai: 26 },
        campus:      { minsei: 25, kyowa: 32, mirai: 47 },
      },
      turnout: { downtown: 58, residential: 66, industrial: 60, rural: 68, campus: 46 },
      rivalMult: 1.45,
      fraud: 1,
      guide: { minsei: 67, kyowa: 40, mirai: 27 },
    },
  },
  // 準備の画面の、難しさのことば(guide がこの値以上なら。どれにも届かなければ「とてもむずかしい」)
  seatLevels: [[75, 'とてもやさしい'], [52, 'やさしい'], [35, 'ふつう'], [18, 'むずかしい']],
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
    // ---- 全国の総選挙のカード ----
    nTour:   { cost: 1, money: 5,   gain: 3, tagBonus: { urban: 2 } },              // 全国遊説
    nLocal:  { cost: 2, money: 0,   gain: 3, tagBonus: { org: 3 }, shield: 1 },     // 地方行脚(候補者と一緒に回る)
    nRally:  { cost: 2, money: 20,  gain: 6 },                                      // 大演説会
    nTv:     { cost: 1, money: 0,   all: { float: 2 } },                            // テレビ討論
    nSns:    { cost: 1, money: 0,   all: { youth: 3, urban: 1 } },                  // SNS発信
    nAd:     { cost: 0, money: 15,  gain: 2 },                                      // 新聞広告
    nFund:   { cost: 1, money: -60 },                                               // 資金集め
    nAhead:  { cost: 1, money: 0,   gain: 2, block: true },                         // 先回り遊説
    nStar:   { cost: 1, money: 0,   gain: 6, once: true },                          // 人気議員の応援
    // 公約(全国の約束。性格の合うブロックすべてが伸びる。政権を取ったあとについてくる)
    mTax:    { cost: 0, money: 0,   all: { urban: 2, float: 2 }, once: true, promise: 'n_tax' },
    mAgri:   { cost: 0, money: 0,   all: { elder: 2 },           once: true, promise: 'n_agri' },
    mWage:   { cost: 0, money: 0,   all: { union: 4 },           once: true, promise: 'n_wage' },
    mFamily: { cost: 0, money: 0,   all: { family: 3 },          once: true, promise: 'n_family' },
    mYouth:  { cost: 0, money: 0,   all: { youth: 5 },           once: true, promise: 'n_youth' },
  },
  // 山札(党ごとの約束カード3枚を足す)
  deck: ['speech', 'speech', 'speech', 'door', 'door', 'talk', 'talk', 'rally', 'sns', 'sns', 'flyer', 'flyer', 'fund', 'ahead', 'star'],
  partyPromises: {
    minsei: ['pAgri', 'pShop', 'pFamily'],
    kyowa:  ['pUnion', 'pFamily', 'pStudent'],
    mirai:  ['pStudent', 'pShop', 'pFamily'],
  },

  // 比例復活:小選挙区で負けても、惜敗率(自分の票 ÷ 当選者の票)が党の復活ラインに届けば、比例代表で議席を得る(重複立候補)
  pr: {
    line: { minsei: 97, kyowa: 96.5, mirai: 98 },   // 復活ライン(%)の基準。議席の多い党ほど届きやすい
    noise: 1.5,                                     // 選挙ごとのぶれ(標準偏差)
  },
  // 出世:当選回数と党内評価(党への貢献の積み重ね)で役職が上がる。人事は任期の始まりと reshuffleTurn の会期
  //   startAll 選挙の始まりの支持(全地区)/ duty 任期の山札で「地元回り」と入れ替わる「公務」の枚数
  ranks: [
    { name: '平議員', wins: 0, merit: 0,  startAll: 0, duty: 0 },
    { name: '政務官', wins: 2, merit: 8,  startAll: 0, duty: 0 },
    { name: '副大臣', wins: 3, merit: 20, startAll: 1, duty: 1 },
    { name: '大臣',   wins: 4, merit: 36, startAll: 2, duty: 1 },
    { name: '党三役', wins: 5, merit: 56, startAll: 2, duty: 2 },
    { name: '党首',   leader: true, startAll: 0, duty: 3 },   // 人事では就けない。党首選に勝つ
  ],
  reshuffleTurn: 5,
  // 党内評価の増減(党への貢献は、そのまま党内評価にも足す)
  merit: { winDistrict: 3, winPr: 1, kept: 1, broken: -2 },
  // 続けてこの回数、議席を得られないと、党の公認を失って引退になる
  retire: { lossStreak: 3 },
  // 引退したときの評価(点数)。grades は [評価, 点数の下限]
  //   seatsPer 総選挙の最多議席をこの数で割った点(上限 seatsMax)/ majority 総選挙で単独過半数を取った
  //   pm 首相になった / pmTurn 首相として務めた会期1つあたり(上限 pmTurnMax)
  legacy: { win: 4, winMax: 40, rank: 9, kept: 2, keptMax: 20, broken: -4, seatsPer: 20, seatsMax: 15, majority: 10, pm: 20, pmTurn: 2, pmTurnMax: 30, grades: [['S', 175], ['A', 130], ['B', 80], ['C', 30]] },

  // 任期の結果が、次の選挙に返ってくる(推薦・破った約束のカードは cards.js が約束ごとに作る)
  comeback: {
    endorse: { cost: 0, money: 0, gain: 5 },   // 守った約束 → その団体の「推薦」のカード(その地区の支持が伸びる。1回だけ)
    curse: { cost: 1, money: 0 },              // 破った約束 → 使えないカード。体力を払って謝りに行くと取り除ける
    windSd: 3, windMax: 6,   // 2回目からの選挙の「党への風」:全地区の始まりの支持が上下する(標準偏差と上限。1未満は風なし)
    rivalBase: 5,        // 議席を守り続けている相手の現職は、任期のあいだに地盤を固めている(全地区の始まりの支持)
    brokenStart: -8,     // 破った約束:その団体の地区の、始まりの支持
    lightStart: -2,      // 少しは進めていた約束(破った約束のカードは出ない)
    baseMax: 3,          // 地盤の上限(地区ごと。1につき、始まりの支持 +1)
    baseCarry: 0.5,      // 選挙のあと、次の任期に残る地盤の割合
    starPer: 4,          // 党への貢献がこれだけたまるごとに、次の選挙で「党幹部の応援」が1枚増える
    starExtraMax: 2,     // 増える枚数の上限
    moneyCarryMax: 100,  // 任期の資金のうち、選挙戦に持ち込める上限(万円)
  },

  // 議員の任期。1ターン = 国会の1会期(半年)。8ターン(4年)で任期満了
  term: {
    turns: 8, energy: 3, handSize: 5, startMoney: 20,
    // その会期の終わりに解散する見込み(ターンごと)。最初の会期は解散しない。最後は任期満了
    dissolve: [0, 0.05, 0.1, 0.15, 0.25, 0.35, 0.5, 1],
    dissolveMin: 0.02, dissolveMax: 0.9,
    promiseGoal: 2,      // 約束を果たすのに要る進み
    graceTurns: 2,       // 約束してからの会期がこれ未満で解散になったら、破ったことにせず持ち越す
    keptBase: 2,         // 約束を果たしたとき、その団体の地区の地盤
    cards: {
      question: { cost: 1, money: 0,   promise: 1, contrib: 1 },   // 委員会質問(約束がなければ党への貢献)
      bill:     { cost: 2, money: 10,  promise: 2, contrib: 2 },   // 議員立法
      local:    { cost: 1, money: 0,   base: 1 },                  // 地元回り
      report:   { cost: 2, money: 10,  base: 2 },                  // 国政報告会
      party:    { cost: 1, money: 0,   contrib: 2 },               // 党の仕事
      media:    { cost: 2, money: 0,   baseAll: 1 },               // メディア出演
      fund:     { cost: 1, money: -40 },                           // 資金パーティー
      duty:     { cost: 1, money: 0,   contrib: 1 },               // 公務(役職が上がると「地元回り」と入れ替わる)
      // ---- 党首の任期(R5)。approval 内閣支持率 / sat 連立相手の満足度 / idle 進める公約がないときの支持率 ----
      pmLaw:    { cost: 1, money: 0,   promise: 1, idle: 1 },      // 法案を進める(首相)
      pmBigLaw: { cost: 2, money: 0,   promise: 2, idle: 2 },      // 重要法案(首相)
      pmPress:  { cost: 1, money: 0,   approval: 2 },              // 記者会見
      pmDiplo:  { cost: 2, money: 0,   approval: 5 },              // 首脳外交
      pmEcon:   { cost: 2, money: 0,   approval: 3, contrib: 2 },  // 経済対策
      pmParty:  { cost: 1, money: 0,   contrib: 2 },               // 党内融和
      pmCoal:   { cost: 1, money: 0,   sat: 12 },                  // 連立協議(連立のときだけ山札に入る)
      grumble:  { cost: 1, money: 0,   grumble: true },            // 党内の不満(使えない。体力を払ってなだめると、この任期のあいだ消える)
      opAttack: { cost: 1, money: 0,   approval: -3 },             // 国会で追及(野党。相手の内閣の支持率を下げる)
      tour:     { cost: 2, money: 0,   contrib: 3 },               // 全国行脚
    },
    deck: {
      member: ['question', 'question', 'question', 'bill', 'bill', 'local', 'local', 'local', 'report', 'party', 'party', 'media', 'fund'],
      ronin: ['local', 'local', 'local', 'local', 'report', 'report', 'media', 'media', 'fund', 'fund'],   // 浪人は国会で動けない
      // 党首(R5)。首相は連立のとき「連立協議」2枚、渡した大臣ポストの数だけ「党内の不満」が足される
      pm: ['pmLaw', 'pmLaw', 'pmLaw', 'pmBigLaw', 'pmBigLaw', 'pmPress', 'pmPress', 'pmDiplo', 'pmEcon', 'pmParty', 'pmParty', 'fund'],
      junior: ['question', 'question', 'question', 'bill', 'bill', 'pmParty', 'pmParty', 'pmParty', 'tour', 'fund'],
      opposition: ['opAttack', 'opAttack', 'opAttack', 'pmParty', 'pmParty', 'pmParty', 'tour', 'tour', 'question', 'question', 'fund'],
    },
    // 会期の始まりの出来事(最初の会期には起きない)
    events: {
      chance: 0.5,
      petition: { weight: 3, base: 3, refuse: -2, maxOpen: 3 },   // 団体からの要望:受ければ新しい約束と地盤、断れば地盤が下がる
      windUp:   { weight: 2, wind: 0.1 },                         // 内閣支持率が上がり、解散風が強まる
      windDown: { weight: 2, wind: -0.1 },                        // 解散風が弱まる
    },
  },

  // ---- 党首として戦う総選挙(全国)----
  nation: {
    seats: 465, majority: 233,
    startSeats: { minsei: 225, kyowa: 165, mirai: 75 },   // 党首になったときの党の議席(総選挙で増えたか減ったかの基準)
    cube: 3,             // 小選挙区の議席は、得票の割合のこの乗数の比で配る(大きい党に有利)。比例はドント式
    resignDrop: 0.15,    // 総選挙で議席をこの割合以上減らし、単独過半数も取れなかったら、責任をとって党首を辞める
    turnout: 54, turnoutNoise: 2,
    startMoney: 80,
    deck: ['nTour', 'nTour', 'nTour', 'nLocal', 'nLocal', 'nTv', 'nTv', 'nRally', 'nSns', 'nSns', 'nAd', 'nAd', 'nFund', 'nAhead', 'nStar'],
    manifesto: {
      minsei: ['mAgri', 'mTax', 'mFamily'],
      kyowa:  ['mWage', 'mFamily', 'mYouth'],
      mirai:  ['mYouth', 'mTax', 'mFamily'],
    },
    // 党首の任期の結果が、総選挙の始まりの支持(全ブロック)に返ってくる
    unityPer: 4, unityMax: 2,   // 党への貢献がこれだけたまるごとに +1(党の結束)
    keptAll: 1, keptMax: 2,     // 守った約束1つにつき
    brokenAll: -2,              // 破った約束(途中までも含む)1つにつき
    // 開票の進み方:ブロックごとに開きはじめる時刻(何番目の時刻か)と、開ききるまでの長さ
    countStart: { hokkaido: 0, tohoku: 0, hokuriku: 0, chugoku: 1, shikoku: 1, kyushu: 1, kitakanto: 1, tokai: 2, kinki: 2, minamikanto: 2, tokyo: 3 },
    countSpan: 5,
  },
  // ---- 政権(R5)。総選挙のあと、過半数を持つ組み合わせが政権を担う ----
  gov: {
    // 党どうしの近さ(連立の前向き度の土台)。キーは党の id を辞書順に「-」でつなぐ
    affinity: { 'minsei-mirai': 45, 'kyowa-mirai': 50, 'kyowa-minsei': 20 },
    need: 60,                 // 前向き度がこれ以上なら、連立に応じる
    rivalEdge: 5, gapWeight: 0.4,   // こちらが第1党でないとき、第1党も同じ相手に声をかける:要る前向き度が rivalEdge + 議席の差 × gapWeight だけ上がる
    post: 8, postMax: 3,      // 大臣ポスト1つあたりの前向き度(渡すと、任期の山札に「党内の不満」が1枚入る)
    pledge: 12,               // 相手の看板の公約を受け入れる(果たすべき公約が1つ増える)
    juniorNeed: 30,           // 相手の政権に入れてもらうのに要る近さ
    pledgeOf: { minsei: 'n_agri', kyowa: 'n_wage', mirai: 'n_youth' },   // 各党の看板の公約
    // 連立相手の満足度(首相のとき)。satLeave を下回ると連立を離れ、内閣は倒れる
    satStart: 50, satPost: 10, satPledge: 10, satDecay: 5, satLeave: 20, satKept: 30,
    // 内閣支持率
    approvalStart: 52,        // 新しく首相になったとき
    approvalKeep: [35, 60],   // 総選挙に勝って続投するとき(前の支持率 +5 を、この範囲に収める)
    keepFade: 5, keepFloor: 42,   // 長期政権の飽き:続投のたびに、範囲の上が keepFade ずつ下がる(keepFloor まで)
    approvalDecay: 4, approvalNoise: 2, approvalMin: 5, approvalMax: 90,   // 首相の内閣は、会期ごとに少しずつ下がる
    aiMean: 48, aiRevert: 0.2, aiNoise: 3,                                 // 相手の党の内閣の支持率
    keptApproval: 5,          // 公約を果たしたとき
    brokenApproval: -6,       // 公約を果たせないまま解散したとき(1つにつき)
    lowApproval: 30, lowTurns: 2,   // 支持率がこれ未満の会期が続くと、退陣に追い込まれる
    collapseApproval: -10,    // 連立が壊れたとき
    // 総選挙への響き(全ブロックの始まりの支持):(支持率 − 50)÷ electionPer、± electionMax まで。連立与党は半分、野党は逆向き
    electionPer: 5, electionMax: 2,
    fatiguePer: 1, fatigueMax: 3,   // 長期政権への飽き:首相を続けて務めるほど、総選挙で全ブロックの支持が下がる(2期目の終わりから、1期ごとに)
    dissolveFrom: 2,          // 首相は、この会期から解散できる
    events: { chance: 0.4, up: 5, down: -5 },   // 首相の会期の始まりの出来事(外交の成果、閣僚の不祥事)
  },

  // ---- 裏金(R9。js/engine/scandal.js)----
  //   資金のカード(選挙戦の資金集め、任期の資金パーティー)を使うとき、収入の一部を収支報告書に載せないこともできる
  //   extra 載せないときに上乗せされる資金(万円)/ gain 載せないたびの発覚度 / drift 隠した資金があるかぎり、会期ごとに上がる発覚度
  //   stages 発覚度がこれに届くと、記者の取材・元秘書の告発・検察の捜査(3つ目で発覚)/ leak 発覚度1あたりの、会期ごとに漏れる見込み(選挙戦は1日ごとに leakCampaign)
  //   correct 記載を訂正したときの発覚度(隠した資金を返す)/ deny 否定したときの発覚度
  //   発覚したときの重さは隠した額で決まる:dropUpTo まで → 炎上で支持が落ちる、unendorsedUpTo まで → 公認取り消し、それより多い → 議員辞職
  //   clean 正直に記載するたびに上がる「クリーン」の評判(cleanMax まで。載せないと 0 に戻る。選挙のたびに 0 から)。cleanMax に届いていれば、次の選挙は全地区 +cleanStart、SNS のカードが +sns
  //     (正直がふつうの遊び方なので、効き目は最高のときだけ小さく。勝ち負けは全体の1ポイントで1割動く)
  //   attackAt 発覚度がこれ以上だと、公開討論会で相手が疑惑を追及してくる(全地区 attackHit)。対戦モードでは相手が「裏金を追及する」を選べる(pvpHit、相手の発覚度 +pvpExposure)
  slush: {
    extra: 20, gain: 14, drift: 3, stages: [30, 60, 90], leak: 0.0035, leakCampaign: 0.0015,
    correct: -40, deny: 6, correctMerit: -2,
    dropUpTo: 40, unendorsedUpTo: 80,
    dropStart: -4, dropMerit: -5, unendorsedStart: -6, unendorsedMerit: -10, campaignHit: -4, pmApproval: -15,
    cleanMax: 3, cleanStart: 1, sns: 1,
    attackAt: 30, attackHit: -3, attackExposure: 10, pvpHit: -5, pvpExposure: 20,
  },
  // ---- 選挙違反(R10)----
  //   seatRisk 選挙区ごとの起きやすさ(北津1区は seats の fraud。ほかは defaultRisk)
  //   eventChance 選挙戦の朝に、違反がらみの出来事が起きる見込み(× 起きやすさ。ほかの朝の出来事のかわりに起きる)
  //   bribe 買収の提案を黙認したとき:その地区の支持 gain、捜査ゲージ probe / smear 怪文書・ポスター破壊:反撃(相手 hit、自分 self)、正々堂々(浮動票の地区 fair)
  //   convict 選挙のあと、捜査ゲージ × これ が陣営幹部の有罪の見込み(連座制:当選無効と、その選挙区から banTurns 会期(5年)立候補できない)
  //   witness 開票立会人を送る資金(万円)。countChance × 起きやすさ で開票所の不審な動き(送っていれば再集計で防ぐ。送っていなければ、いちばん票の多い地区で自分の票の steal が相手に流れる)
  //   by 浪人中の補欠選挙(議員の逮捕で議席が空く):会期ごとの見込み chance(起きやすい選挙区は 起きやすさ ÷ defaultRisk 倍、riskMax 倍まで)、勝つ見込み base + 地盤の合計 × perBase(max まで)
  fraud: {
    defaultRisk: 0.25, eventChance: 0.35,
    bribe: { weight: 1, gain: 4, probe: 30 }, smear: { weight: 1, hit: -3, self: -1, fair: 2 },
    convict: 0.012, banTurns: 10, voidMerit: -6,
    witness: 10, countChance: 0.12, steal: 0.06,
    by: { chance: 0.025, riskMax: 2, base: 0.15, perBase: 0.025, max: 0.5 },
  },
  // ---- 区割り改定(R11)----
  //   chance 会期ごとの、一票の格差訴訟で違憲状態の判決が出る見込み(議員の歩みで1回まで。党首は全国を戦うので起きない)
  //   国替えの先は、自分の党が議席を持つ選挙区(現職がいる)を除く
  //   vanish 判決のあとの区割りで、自分の選挙区がなくなる見込み(それ以外は隣の区と合わさる)/ keep 合わさった・移った先に残る地盤の割合
  //   race 合わさった区の公認争い:自分の強さ = base + 党内評価 × merit + 当選回数 × win + 地盤の合計 × perBase、相手(同じ党の現職)= rival ± noise
  redistrict: { chance: 0.02, vanish: 0.35, keep: 0.5, race: { base: 20, merit: 0.5, win: 3, perBase: 2, rival: 45, noise: 10 } },

  // ---- 国の指標と30年後の新聞(R14。js/engine/future.js、文面は js/data/future.js)----
  //   指標は 0〜100(高いほど良い)。start ゲームの始まりの値 / trend 何もしなければ1年ごとに動く量 / lag 決定の効き目が出きるまでの年数(指標ごと)
  //   決定の重み weight:首相 1、連立与党、野党党首、議員(予算の要望)。local 議員の地元の約束を果たしたとき
  //   policies 約束・公約を果たしたときの長い効き目 / budget 予算編成の重点(long 長い効き目、approval 首相のときの内閣支持率)。どれにも長所と短所がある
  //   budgetOffer 毎年の予算編成で出す重点の数(ほかは次の年に)/ startYear ゲームの始まりの年 / horizon 新聞は政界を去ってから何年後か
  //   big 大見出しに使う動きの大きさ(始まりとの差。まだら模様は、良いほうと悪いほうがどちらも big 以上)
  future: {
    startYear: 2027, horizon: 30, budgetOffer: 3, big: 5,
    repeat: 0.6,   // 同じ予算・同じ政策をくり返すと、効き目は前の repeat 倍(同じ公約を任期ごとに果たしても、効き目は積み上がりすぎない)
    start: { fiscal: 40, birth: 42, growth: 48, welfare: 46, regions: 42, environment: 50, security: 50, education: 52 },
    trend: { fiscal: -0.04, birth: -0.06, growth: -0.02, welfare: -0.05, regions: -0.06, environment: -0.04, security: -0.02, education: -0.02 },
    // 指標どうしのつながり:link[k][j] だけ、指標 j の始まりからの動きが k に足される(成長は税収になり、出生と成長は社会保障を支える)
    link: { fiscal: { growth: 0.5, birth: 0.1 }, welfare: { birth: 0.3, growth: 0.2 }, growth: { education: 0.3 } },
    lag: { fiscal: 3, birth: 15, growth: 6, welfare: 10, regions: 10, environment: 20, security: 5, education: 18 },
    weight: { pm: 1, junior: 0.7, opposition: 0.4, member: 0.6 }, local: 0.5,
    policies: {
      agri:     { regions: 3, environment: 1, fiscal: -1, growth: -1 },
      wage:     { welfare: 2, birth: 1, growth: -1, fiscal: -1 },
      family:   { birth: 3, fiscal: -1, growth: -1 },
      taxcut:   { growth: 3, fiscal: -2, welfare: -1 },
      tuition:  { education: 3, birth: 1, fiscal: -1 },
      n_tax:    { growth: 4, fiscal: -2, welfare: -1 },
      n_agri:   { regions: 4, environment: 1, fiscal: -1, growth: -1 },
      n_wage:   { welfare: 3, birth: 1, growth: -2, regions: -1 },
      n_family: { birth: 4, fiscal: -1, growth: -1 },
      n_youth:  { education: 4, birth: 1, fiscal: -2 },
    },
    budget: {
      defense:   { long: { security: 4, fiscal: -1, environment: -1 }, approval: -1 },
      welfare:   { long: { welfare: 4, fiscal: -2, growth: -1 }, approval: 3 },
      austerity: { long: { fiscal: 5, growth: -1, welfare: -1, regions: -1 }, approval: -4 },
      green:     { long: { environment: 4, growth: -1, fiscal: -1 }, approval: 1 },
      local:     { long: { regions: 4, fiscal: -1, environment: -1 }, approval: 1 },
      research:  { long: { education: 3, growth: 2, fiscal: -1, regions: -1 }, approval: -1 },
      childcare: { long: { birth: 4, fiscal: -2 }, approval: 2 },
    },
  },

  // ---- 参議院(R12。js/engine/upper.js)----
  //   seats 定数 / majority 過半数 / contested 1回の参院選で改選する議席 / start はじめの議席(2つの組に半分ずつ。おおよそ base × 改選数 × 2 にそろえ、はじめから勢いがつかないようにする。民政はぎりぎり過半数から)
  //   every 参院選の間隔(会期)/ firstIn 最初の参院選までの会期。民政はひとりで過半数ぎりぎり(支持率しだいで、ねじれになる)
  //   base 党の地力(改選の得票の割合)/ approvalWeight 内閣支持率が50から1ずれるごとに、与党全体の割合が動く量(野党は逆。党の数で割る)/ noise 党ごとのぶれ
  //   党首の選び方:tour 全国を応援で回る(割合 +tour、この会期の体力 −tourEnergy)/ manifesto 果たした公約を訴える(1つ以上あれば +manifesto)
  //   議員の選び方:応援(党への貢献 +support、党の割合 +memberShare。浪人は半分)/ 地元(選んでいる地区の地盤 +local)
  //   wind 改選前の組より per 議席増える(減る)ごとに、次の衆院選は全地区 ±1(max まで)
  //   twist ねじれ国会:首相の法案の進みが law だけ減る(重要法案 2 → 1)、野党党首の追及が attack だけ強まる
  //   bigLoss 首相の党が改選前より これだけ以上減らすと、内閣支持率 lossApproval / worldRuling 党首でないときの世の中の政権
  upper: {
    seats: 248, majority: 125, contested: 124, start: { minsei: 126, kyowa: 74, mirai: 48 }, every: 6, firstIn: 3,
    base: { minsei: 0.5, kyowa: 0.3, mirai: 0.2 }, approvalWeight: 0.006, noise: 0.03,
    tour: 0.03, tourEnergy: 1, manifesto: 0.02, support: 2, memberShare: 0.01, local: 1,
    wind: { per: 6, max: 1 }, twist: { law: 1, attack: -1 }, bigLoss: 10, lossApproval: -5, worldRuling: 'minsei',
  },

  // ---- 対戦モード(R8。js/engine/versus.js)----
  //   aiMult 3人目(AI)の候補の、始まりの支持の倍率(選挙区の rivalMult にさらにかける)
  //   ハンデ(2人の始まりの支持をそろえる):差の handicapRate ずつ、低いほうに全地区で足す。handicapSteps 回まで、足す量が handicapDone 未満になったらやめる
  versus: { aiMult: 1, handicapRate: 0.6, handicapSteps: 12, handicapDone: 0.05 },

  // ---- 殿堂・実績(R7。js/engine/hall.js)----
  //   maxRecords 歴代の記録に残す数 / veteranSeats「ベテラン議員」の議席の回数 / hardGuide「逆風を越えて」:選挙区の難しさの目安(guide)がこれ未満
  //   keeperKept「約束を守り抜く」の守った約束の数 / longPMTurns「長期政権」の首相の会期(半年)の数
  //   cleanTerms「清廉潔白」:「クリーン」の評判を最高にした任期の数(R9)
  hall: { maxRecords: 50, veteranSeats: 5, hardGuide: 35, keeperKept: 5, longPMTurns: 12, cleanTerms: 3 },

  // ---- 党首選(党三役になると、任期の2会期目に立候補できる)----
  leaderRace: {
    turn: 2,
    base: 20, merit: 0.5, kept: 1.5, broken: -3, win: 2,   // 自分の強さ = base + 党内評価×merit + 守った約束×kept + 破った約束×broken + 当選回数×win
    incumbent: 88, challenger: 62, noise: 10,              // 相手の強さ(いまの党首と、もう1人)と、そのぶれ
    unity: 5,                                              // 訴え方「党内融和」:確実に強さが上がる
    reform: { chance: 0.55, hit: 14, miss: -4 },           // 「世代交代」:当たれば大きく上がり、外せば下がる
    deal: { share: 0.3, merit: -10 },                      // 「3番手と組む」:3番手の票のこの割合を受け取るが、ポストの約束で党内評価が下がる
    loseMerit: -5,                                         // 敗れたときの党内評価
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
    // 投票率の基準(%)は選挙区ごと(seats の turnout)
    // 接戦(R13):1日の終わりに上位2人の差が margin 未満なら「激戦の日」(そうでない日は1つ減る)。激戦の日 × perDay だけ投票率が上がる(max まで)
    //   上がり方は地区の性格で変わる:浮動票・若者の地区は high 倍、組織票の地区は low 倍(関心が高まると、ふだん投票しない人が来る)
    close: { margin: 4, perDay: 1.5, max: 10, high: 1.15, low: 0.85 },
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
