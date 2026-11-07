// ゲームの数値はすべてここに集める。ロジック側に数値を直書きしない。
window.Game = window.Game || {};

Game.Balance = {
  // ---- 選挙戦(campaign.js) ----
  campaign: {
    days: 12,
    actionsPerDay: 2,

    // 得票シェアの計算: share = appeal^exponent / Σ appeal^exponent
    shareExponent: 1.3,
    appealFloor: 1,            // appeal の下限(0除算よけ)
    recogFloor: 0.25,          // 知名度0でも個人支持の25%は効く
    partyWeight: 0.3,          // 政党支持率(%) → 地区支持への上乗せ倍率
    personalSoftCap: 60,       // 個人支持の伸びの頭打ち(大きいほど伸びやすい)
    solidSoftCap: 30,          // 固い票の伸びの頭打ち

    staminaMax: 100,
    staminaStart: 100,
    staminaDailyRecover: 15,
    staminaLowThreshold: 30,   // これ未満で行動すると効率ダウン
    staminaLowEfficiency: 0.75,

    dailyUpkeep: 5,            // 事務所・選挙カーの維持費(万円/日)
    brokeEfficiency: 0.8,      // 資金が尽きた翌日の効率

    momentumMin: 0.8,
    momentumMax: 1.25,
    momentumDecay: 0.02,       // 毎日 1.0 に向かって戻る量

    firstDayMultiplier: 1.2,   // 出陣式の日
    finalDayMultiplier: 1.3,   // 最終日「最後のお願い」
    repeatPenalty: 0.6,        // 同じ日に同じ地区で同じ行動をしたとき

    pollDays: [3, 7, 11],      // この日の夜に情勢調査(翌朝発表)
    pollNoise: 0.035,          // 情勢調査の誤差(シェアの標準偏差)
    feelNoise: 0.08,           // 陣営の感触(調査がないとき)の誤差
    // 情勢ラベルのしきい値(自分のシェア − 最大のライバルのシェア)
    outlook: { strong: 0.08, lean: 0.025 },

    eventChance: 0.6,          // 毎朝ランダムイベントが起きる確率
    debateDay: 6,              // 公開討論会の日(朝に選択イベント)
  },

  // ---- スタート時の条件(政党ごと) ----
  start: {
    playerRecog: 12,
    playerPersonal: 4,
    solidBase: 6,              // 組織票の初期値 = solidBase × 政党の組織力 × 地区相性
    byParty: {
      minsei: { money: 300, leaderVisits: 2 },
      kyowa:  { money: 200, leaderVisits: 2 },
      mirai:  { money: 160, leaderVisits: 1 },
    },
  },

  // ---- 行動(選挙区モード) ----
  // traitBonus: 地区の特徴(0〜1)ごとの効き。倍率 = 1 + Σ bonus × (trait − 0.5)
  actions: {
    street: { stamina: 15, money: 5,  recog: 18, personal: 6,   traitBonus: { urban: 0.8, youth: 0.3 } },
    door:   { stamina: 20, money: 0,  recog: 6,  personal: 13,  traitBonus: { elderly: 0.6, farm: 0.5, urban: -0.3 } },
    sns:    { stamina: 5,  money: 0,  recogAll: 6, personalAll: 1.5, traitBonus: { youth: 1.4, urban: 0.4, elderly: -0.6 },
              buzzChance: 0.15, buzzMultiplier: 2.5, flopChance: 0.12, flopPersonal: -1.5 },
    rally:  { stamina: 15, money: 20, recog: 10, personal: 10,  momentum: 0.04, traitBonus: { industry: 0.3, urban: 0.3 } },
    greet:  { stamina: 10, money: 10, recog: 4,  solid: 7,      traitBonus: { industry: 0.6, farm: 0.6, elderly: 0.3 } },
    fund:   { stamina: 10, moneyGain: 50, diminish: 0.8 },   // 使うたびに 0.8 倍に減る
    rest:   { staminaGain: 45 },
    leader: { stamina: 5,  money: 0,  recog: 32, personal: 16,  momentum: 0.06, spill: 0.3 }, // spill: 他地区への波及
    org:    { stamina: 10, money: 10 },   // 支援団体回り(関係度の伸びは Game.Balance.orgs.visit)
  },

  // ---- イベント ----
  events: {
    weights: { rain: 3, festival: 3, partyScandal: 2, partyBoost: 2, rivalGaffe: 2, celebrity: 2, heat: 2 },
    rain:         { streetMult: 0.5, rallyMult: 0.6, doorMult: 1.0 },
    festival:     { doorMult: 1.5, greetMult: 1.6 },
    partyScandal: { supportShift: -2.5 },
    partyBoost:   { supportShift: 1.5 },
    rivalGaffe:   { momentum: -0.07 },
    celebrity:    { recog: 6, personal: 2 },
    heat:         { staminaCost: 10 },          // 猛暑:その日の行動の体力消費が増える
    debate: {
      policy:  { personalAll: 2.5 },
      attack:  { successChance: 0.55, momentumWin: 0.09, momentumLose: -0.06 },
      local:   { personalAll: 1.2, solidAll: 1.0 },
    },
  },

  // ---- AI候補 ----
  ai: {
    skill: { incumbent: 0.97, challenger: 0.82, minor: 0.3 },
    leaderVisits: { minsei: 2, kyowa: 2, mirai: 1 },
    targetNoise: 0.25,          // 地区選びのゆらぎ
    // 政党ごとの行動の好み(重み)
    persona: {
      minsei:  { door: 3, greet: 3, street: 2, rally: 1, org: 1 },
      kyowa:   { street: 3, greet: 2, rally: 2, door: 2, sns: 1 },
      mirai:   { sns: 3, street: 3, door: 1, rally: 1 },
      kofuku:  { door: 3, street: 2, sns: 1 },
      default: { street: 2, door: 2, sns: 1, rally: 1, greet: 1 },
    },
  },

  // ---- 投票(vote.js) ----
  vote: {
    turnoutBase: 0.55,
    turnoutTrait: { youth: -0.25, elderly: 0.15 },  // 投票率 = base + Σ 値 × (trait − 0.5)
    turnoutNoise: 0.02,        // 地区ごとの投票率のぶれ
    candidateSwing: 0.03,      // 投票日の候補ごとのぶれ(シェア)
    regionNoise: 0.03,         // 地区ごとのぶれ(シェア)
    minShare: 0.005,
    // 投票日の天気。雨は投票率を下げ、崩れにくい固い票の重みが増す
    weather: {
      sunny:  { weight: 5, turnoutShift: 0.02,  solidMult: 1.0 },
      cloudy: { weight: 3, turnoutShift: 0,     solidMult: 1.1 },
      rain:   { weight: 2, turnoutShift: -0.05, solidMult: 1.35 },
    },
    depositLine: 0.1,          // 有効投票の1割未満は供託金没収・比例復活できない
  },

  // ---- 比例代表(vote.js) ----
  proportional: {
    partyNoise: 0.08,          // 政党の比例得票のぶれ(倍率の標準偏差)
    minorSupport: { komeito: 7, heiwa: 6, kokumin: 8, midori: 4, kofuku: 0.8 },  // 比例名簿を作らない政党の支持率(%)
    // 名簿:単独比例で上位に置く人数、ブロック内で立てる小選挙区候補の数、
    // 他の選挙区での勝ちやすさ、負けた候補の惜敗率の平均とばらつき
    lists: {
      minsei: { topSolo: 4, smdCandidates: 30, smdWinRate: 0.62, ratioMean: 0.86, ratioSd: 0.12 },
      kyowa:  { topSolo: 1, smdCandidates: 27, smdWinRate: 0.22, ratioMean: 0.78, ratioSd: 0.14 },
      mirai:  { topSolo: 1, smdCandidates: 16, smdWinRate: 0.04, ratioMean: 0.65, ratioSd: 0.20 },
    },
    // lists の topSolo・smdCandidates はこのブロック(北関東)のときの人数。ほかのブロックでは定数・選挙区数に比例させる
    refBlock: { seats: 19, districts: 33 },
    // 政党支持率が基準からずれたとき、他の選挙区の勝率をどれだけ動かすか
    winRateSensitivity: 0.02,
    fakeDepositRatio: 0.28,    // 他の選挙区の候補は惜敗率がこれ未満なら供託金没収とみなす
  },

  // ---- 開票速報(vote.js の timeline) ----
  count: {
    steps: ['20:00', '20:30', '21:00', '21:30', '22:00', '22:30', '23:00', '23:30', '0:00'],
    prTime: '翌1:30',
    zeroUchiMargin: 0.12,      // 最終的な得票率の差がこれ以上なら20時ちょうどに当確(ゼロ打ち)
    callMinFraction: 0.15,     // これだけ開いてから当確を打つ
    callLeadFactor: 0.35,      // 開票済みの差 > 残り票 × これ で当確
    // 当確の取り消し:最終的な差が falseCallMaxMargin 未満の大接戦では、falseCallChance の確率で、
    // 開票率 falseCallMaxFraction までに2位の候補が1位に falseCallNear 以内まで迫った時点で早すぎる当確が出る。
    // 1位が retractLead 以上リードしたら(または開票終了で)取り消す
    falseCallMaxMargin: 0.05, falseCallChance: 0.6, falseCallMaxFraction: 0.7, falseCallNear: 0.04, retractLead: 0.02,
    exitPollNoise: 0.02,
    exitPollLead: 0.05,        // 出口調査で「リード」と言える差
    roundTo: 1000,             // 途中経過の票は1000票単位
  },

  // ---- 当選後の扱い(M4の議員キャリアで使う) ----
  career: {
    partyEval: { smd: 10, pr: 5, lost: 0 },   // 比例復活は党内評価が少し低い
  },
};

// ---- 政党の強さ(説明文などは parties.js) ----
// support: 政党支持率(%)。lean: 地区の特徴ごとの相性。orgStrength: 組織票の強さ。orgLean: 組織票の地区相性
Game.Balance.parties = {
  minsei: { support: 30, lean: { farm: 0.6, elderly: 0.5, youth: -0.3 }, orgStrength: 1.0, orgLean: { farm: 0.8, elderly: 0.4 } },
  kyowa:  { support: 16, lean: { industry: 0.5, urban: 0.3, farm: -0.2 }, orgStrength: 1.0, orgLean: { industry: 1.0, urban: 0.3 } },
  mirai:  { support: 10, lean: { youth: 0.9, urban: 0.5, elderly: -0.5 }, orgStrength: 0.5, orgLean: { urban: 0.3 } },
};

// ---- 選挙区ごとの党の地力(districts.js の SEATS) ----
// support: 選挙区モードの地区での強さだけに効く政党支持率の上乗せ(%)。比例の得票や全国の選挙には効かない
// solid: その党の候補の強さに、固い票と同じ重みで全地区に足す(地元の組織。マイナスは地元での逆風)。後援会としては持ち越さない
// 書いていない党は 0。数字を変えたら tools/autoplay.js の SEAT= で初当選率を確かめる
Game.Balance.seats = {
  hokuyo3: {},
  touou7:  { support: { minsei: -6, kyowa: -3, mirai: 5 }, solid: { minsei: -4, kyowa: -5, mirai: 6 } },
  biyou2:  { support: { minsei: 1, mirai: 3 },             solid: { kyowa: -3 } },
  bisou4:  { support: { minsei: -3, kokumin: 2 },          solid: { kokumin: 3 } },
  namiou5: { support: { minsei: -8, kyowa: -9, mirai: 6 }, solid: { minsei: -8, kyowa: -10, mirai: 4 } },
};

// ---- 選挙区の対立候補の初期値 ----
Game.Balance.rivals = {
  incumbentStrong: { recog: 60, personal: 15 },  // 当選を重ねた現職
  incumbent:  { recog: 55, personal: 20 },  // 現職
  former:     { recog: 48, personal: 13 },  // 元職
  newcomer:   { recog: 18, personal: 3 },   // 新人
  minor:      { recog: 10, personal: 2 },   // 小政党の候補
};

// ---- 支援団体(support.js) ----
Game.Balance.orgs = {
  endorseThreshold: 60,      // 推薦をもらえる関係度
  switchMargin: 10,          // 推薦先を乗り換えてもらうには、今の推薦先よりこれだけ高い関係度が要る
  // power: 推薦したときの組織票、traits: 効く地区、doorBonus: 戸別訪問の効果アップ、
  // earlyVote: 期日前投票の掘り起こし(投票日に組織票へ上乗せ)、money: 毎日の資金援助(万円)
  strength: {
    soka:       { power: 4,   traits: { urban: 0.6 },                                doorBonus: 0.25, earlyVote: 0.25 },
    kofuku:     { power: 1.5,  traits: {},                                            doorBonus: 0.4,  earlyVote: 0.1 },
    shinseiren: { power: 2.5, traits: { farm: 0.8, elderly: 0.6, urban: -0.4 },      doorBonus: 0.15, earlyVote: 0 },
    union:      { power: 3.5,  traits: { industry: 1.2, urban: 0.3, farm: -0.5 },     doorBonus: 0.15, earlyVote: 0.05 },
    business:   { power: 2.5, traits: { urban: 0.6, industry: 0.4 },                 doorBonus: 0,    earlyVote: 0, money: 15 },
    farm:       { power: 3.5,  traits: { farm: 1.4, elderly: 0.3, urban: -0.6 },      doorBonus: 0.15, earlyVote: 0.05 },
    medical:    { power: 2,   traits: {},                                            doorBonus: 0.1,  earlyVote: 0 },
  },
  relationEffectMin: 0.6,    // 組織票 × (0.6 + 0.4 × 関係度/100)
  nationalMult: 0.5,         // 全国モード(政党どうしの総選挙)での推薦団体の組織票の重み
  // 政党ごとの関係度の基準。ライバル候補は +incumbentBonus(現職)、プレイヤーは × playerFactor
  partyBase: {
    minsei: { farm: 70, business: 65, shinseiren: 62, medical: 50, soka: 30, union: 10, kofuku: 20 },
    kyowa:  { union: 72, medical: 45, soka: 30, farm: 25, business: 15, shinseiren: 10, kofuku: 5 },
    mirai:  { business: 45, union: 30, soka: 20, medical: 30, farm: 10, shinseiren: 10, kofuku: 15 },
  },
  incumbentBonus: 5,
  playerFactor: 0.85,
  pledgeMatch: 10,           // 公約が団体の政策と一致するごと
  pledgeConflict: -15,       // 公約が団体の政策と矛盾するごと
  visit: 9,                  // 支援団体回り
  visitDiminish: 0.85,       // 同じ団体を回るたびに効果が減る
  greetRelation: 2,          // 団体挨拶で、その地区に強い団体との関係が上がる
  greetTraitMin: 1.15,       // 「その地区に強い」とみなす地区相性
  invite: { relation: 10, decline: -3, stamina: 10 },
  request: { accept: 15, decline: -8, postpone: -3, conflictLoss: -10, minRelation: 25 },
  aiDailyRelation: 0.5,      // AI候補の関係度が毎日上がる量(推薦をもらっている団体)
  eventChance: 0.35,         // 毎朝、支援団体のイベントが起きる確率(ふつうのイベントより先に判定)
  eventWeights: { request: 3, invite: 2, secularism: 2 },
  // 政教分離の観点からの追及:宗教団体と近すぎると、都市部の支持がわずかに離れる
  secularism: { closeRelation: 80, penalty: 2.5, explainMult: 0.5, distanceRelation: -15 },
  splitPerPolicy: 0.04,      // 幸福実現党の候補と公約が重なる候補は、1政策ごとに支持がこれだけ割れる
  komeitoTransfer: 0.12,     // 創価学会が推薦した候補の党の比例票のうち、公明党に回る割合(比例票の融通)
};
Game.Balance.parties.kofuku = { support: 0.5, lean: { elderly: 0.2 }, orgStrength: 0, orgLean: {} };

// ---- 議員任期(career.js) ----
Game.Balance.term = {
  turnsPerYear: 4,
  termTurns: 16,             // 4年で任期満了
  actionsPerTurn: 2,
  startYear: 2026,

  // 地元の地盤:毎ターン少しずつ薄れる。地元回りで積み上げる
  homeDecay: { recog: 0.97, personal: 0.95, solid: 0.98 },
  homeCap: { personal: 45, solid: 18 },
  // 次の選挙の初期値に足す:実績 × これ(全地区の個人支持)
  achievementToPersonal: 0.25,
  achievementToPersonalCap: 8,
  roninMult: 0.85,           // 浪人中の地元回りの効き(議員の看板がない)

  actions: {
    question:   { money: 0,  achievement: 1.5, partyEval: 1.5, recogAll: 1.5, promise: 1 },
    bill:       { money: 20, passBase: 0.25, passRuling: 0.2, passPerAchievement: 0.01, passMax: 0.7,
                  achievement: 5, partyEval: 3, recogAll: 3, promisePass: 2, promiseFail: 1 },
    local:      { money: 5,  recog: 7, personal: 5, solid: 1, spill: 0.25 },
    faction:    { money: 15, partyEval: 4, allies: 1.2 },
    orgs:       { money: 5 },   // 関係度の伸びは Game.Balance.orgs.visit
    fund:       { moneyGain: 60, postBonus: 15 },   // 役職ごとに集まりやすくなる
    media:      { money: 0,  recogAll: 4, partyEval: 0.5, gaffeChance: 0.12, gaffeRecog: -2, gaffePersonal: -2, gaffeEval: -4 },
  },
  promiseGoal: 2,            // 約束を果たすのに要る進み(質問 +1、議員立法 +1〜2)
  promiseKept: 10,           // 約束を果たしたときの関係度
  promiseBroken: -20,        // 約束を破ったまま選挙を迎えたときの関係度(次の推薦は取り消し)

  // 内閣支持率と解散
  approvalStart: 45,
  approvalDrift: 3,          // 毎ターンのぶれ(標準偏差)
  approvalMeanRevert: 0.1,   // 45 に戻ろうとする力
  approvalMin: 15, approvalMax: 75,
  dissolveBase: 0.03,
  dissolvePerApproval: 0.006,   // (支持率 − 40) 1ポイントごと
  dissolveLateTerm: 0.05,       // 3年目以降、1ターンごとに上乗せ
  dissolveMax: 0.45,
  partyDriftFromApproval: 0.05, // 与党の支持率 = 基準 + (内閣支持率 − 45) × これ

  // 人事(毎年、臨時国会のターン)
  promotion: {
    turnIndex: 2,
    chanceByParty: { minsei: 0.5, kyowa: 0.7, mirai: 0.9 },   // 大きい党ほどポストの競争が激しい
    steps: [
      { wins: 2, eval: 20 },   // 政務官 / 委員会理事
      { wins: 3, eval: 35 },   // 副大臣・委員長 / 筆頭理事
      { wins: 5, eval: 60 },   // 大臣 / 次の内閣の大臣
      { wins: 5, eval: 75 },   // 党役員(このあと党首選:M5)
    ],
    postEval: [0, 1, 1.5, 2, 2],     // 役職ごとに毎ターン入る党内評価
    postRecog: [0, 0.5, 1, 2, 2],    // 役職ごとに毎ターン上がる知名度(全地区)
    postLeaderVisits: [0, 0, 1, 1, 1], // 次の選挙で党幹部の応援が増える
  },

  eventChance: 0.55,
  events: {
    orgRequest:  { weight: 3 },
    scandal:     { weight: 1, recog: -3, personal: -4, apologizeEval: -3, apologizePersonal: -1.5, denyRisk: 0.4, denyPersonal: -7 },
    disaster:    { weight: 1.5, localMult: 2 },
    partyScandal:{ weight: 1.5, support: -2, approval: -4 },
    cabinetUp:   { weight: 1.5, approval: 5 },
    cabinetDown: { weight: 1.5, approval: -5 },
    studyGroup:  { weight: 1, achievement: 2, partyEval: 1 },
  },
  orgRequest: { attendRelation: 8, declineRelation: -12, newPromiseRelation: 10 },
  partyShiftDecay: 0.9,      // 党の支持率の変動は毎ターン薄れる
  electionWind: 4,           // 解散のたびに政党ごとの支持率が振れる幅(標準偏差、ポイント)
  carryToCampaign: { recog: 0.7, personal: 0.5, solid: 0.6 },   // 地盤のうち選挙戦の初期値になる割合
  rivalCarryToCampaign: { recog: 1.0, personal: 0.95 },          // ライバルの分(AIの選挙戦の弱さを補う)
  relationDecay: 1.5,        // 支援団体との関係度は毎ターンこれだけ党の基準へ戻る(関係づくりで保つ)
  playerPartyEvalFromWin: true,
};

// 次の選挙での新しいライバル
Game.Balance.rivalTurnover = {
  retireChance: 0.3,         // 落選したライバルが引退し、新人に代わる確率
  maxWinsForStrong: 2,       // これ以上当選したライバルは「当選を重ねた現職」
  // ライバルの地盤:毎ターン(地盤の薄れ方はプレイヤーと同じ)、自分の地元回りでこれだけ積む
  activity: { incumbent: { recog: 1.5, personal: 1.2 }, challenger: { recog: 2, personal: 1.6 }, recogCap: 85 },
};

// ---- 党首選(leadership.js) ----
Game.Balance.leadership = {
  everyYears: 3,             // 党首の任期
  firstYear: 2027,           // 最初の党首選の年(以後3年ごと、臨時国会のターン)
  resignApproval: 25,        // 内閣支持率がこれを下回ると首相が退陣し、与党の党首選
  endorsersNeeded: 20,       // 推薦人
  endorsersShare: 0.2,       // 小さい党は議員数のこの割合(20人より少なくてよい)
  alliesCapShare: 0.25,      // 仲間の議員は党の議員数のこの割合が上限(近づくほど増えにくい)
  rounds: 3,
  actionsPerRound: 2,
  // 初期値
  player: { mpBase: 8, mpAllyFull: 35, mpPerPost: 7, mpPerEval: 0.15, evalCap: 100, memberBase: 10, memberPerRecog: 0.45, memberPerAchievement: 0.25 },
  rivals: [{ mp: 75, member: 70 }, { mp: 60, member: 52 }],   // 派閥の推し(faction.race)を別に足す。キングメーカーの推しを取られても、平均して派閥の前と同じくらい手ごわい
  rivalGrowth: { mp: 5, member: 5, noise: 6 },   // AIが1ラウンドに伸ばす量
  rivalSpread: 0.5,          // 相手の初期の強さのばらつき(±25%)
  rivalMultByParty: { minsei: 1.25, kyowa: 1.25, mirai: 0.85 },   // 大きい党ほど党首選のライバルが手ごわい(「出世は遅い」)
  actions: {
    mps:    { mp: 8 },                          // 議員への支持固め
    boss:   { mp: 15, member: -4 },             // 派閥の長と会談
    tour:   { member: 10 },                     // 党員への全国遊説
    debate: { memberMin: -4, memberMax: 13 },   // 公開討論会(当たり外れ)
    vision: { mp: 3, member: 6 },               // 政策ビジョン発表
    media:  { member: 7, gaffeChance: 0.15, gaffeMember: -8 },
  },
  runoffMemberVotes: 47,     // 決選投票の党員票(都道府県ごとに1票)
  loseEval: { close: 5, far: -5 },   // 負けたときの党内評価(善戦 / 大敗)
  closeShare: 0.35,          // 得票率がこれ以上なら善戦
  alliesPerPromotion: 4,     // 昇進すると仲間の議員が増える
  alliesPerPostTurn: 0.3,    // 役職 × これだけ毎ターン仲間が増える
};

// ---- 新党・移籍(newparty.js) ----
Game.Balance.newParty = {
  startMoney: 100,           // 新党ルート(スタート時)の資金(資金わずか)
  startElapsed: [4, 10],     // 新党ルートは、今の衆議院の任期のこの範囲から始まる(解散までの期間)
  pledgeCount: 3,            // 公約が自由:看板政策を3つ選べる
  baseSupport: 1.0,          // 新党の支持率の土台(%)
  newnessStart: 100,
  newnessDecay: 3,           // 「新しさ」は毎ターン減る
  newnessToSupport: 0.02,    // 新しさ1あたりの支持率
  buzzToSupport: 0.25,       // SNSの盛り上がり1あたりの支持率
  buzzDecay: 0.8,
  pressToSupport: 0.15,
  candidateToSupport: 0.01,  // 候補者1人あたり(露出が増える)
  mpsToSupport: 0.08,        // 所属議員1人あたり
  supportMax: 12,
  snsNewnessBoost: 0.6,      // 選挙戦で SNS の効果 ×(1 + 新しさ/100 × これ)
  noRequirementStreet: 0.8,  // 政党要件がないとポスター・選挙カーが少ない(街頭演説・集会の効果)
  actions: {
    recruit: { money: 20, candidates: 4, scandalRisk: 0.01 },   // 候補者の公募
    partySns: { money: 0, buzz: 4, recog: 2, newnessOnViral: 3 },   // 党のSNS発信(バズると新しさが戻る)
    press:   { money: 10, press: 3, nationalRecog: 4 },         // 記者会見
    fund:    { moneyGain: 35 },
  },
  pressDecay: 0.85,
  candidateScandal: { weight: 2, support: -0.8 },   // 候補者の失言・不祥事(公募した人数が多いほど起きやすい)
  // 全国の結果(M6 で本格的な全国選挙に置き換える)
  national: {
    smdWinBase: 0.005, smdWinPerSupport: 0.012, smdWinMax: 0.3,
    prSeatsTotal: 176, prEfficiency: 0.9,
    prMinCandidates: 30,      // 政党要件がないとき、比例に出るのに要る候補者数(ブロック定数の2割の目安)
    followerKeep: 0.55,       // 離党についてきた現職議員の再選率
  },
  requirement: { mps: 5, share: 0.02 },
  // 結党準備中の参院選(M13)。議席の計算は government.js の参院選と同じ(Game.Balance.gov.upper)
  upper: {
    prMinCandidates: 10,     // 政党要件がないとき、比例に出るのに要る候補者の数
    listMax: 25,             // 名簿に載せる人数の上限(公募した候補者から回す)
    depositPer: 3,           // 名簿1人あたりの供託金・選挙費用(万円)
    noise: 0.1,              // 新党の得票のぶれ
    voteMult: 0.27,          // 新党の支持は票になりにくい(支持層の若い世代は投票に行く人が少ない。組織の掘り起こしもない)
    districtMult: 0.25,      // 選挙区(1人区が多い)では組織のない新党はほとんど勝てない
    winPress: 4,             // 議席を取ると報道が増える(記者会見の露出に足す)
    strategy: {
      sns:   { label: 'SNSで浮動票を掘り起こす', note: '「新しさ」があるほど伸びる', mult: 1.0, newnessMult: 0.4 },
      tour:  { label: '党首が全国を遊説する', note: '確実に少し伸びる。遊説の費用がかかる', mult: 1.25, money: 40 },
      issue: { label: '争点を一つに絞って勝負', note: '当たれば大きく伸びるが、外すと伸び悩む', win: 1.6, lose: 0.75, risk: 0.4 },
    },
  },
  // 「参院選から挑む」で始めるとき:参院選の前の年の通常国会から(衆議院は前の総選挙から1年)
  upperRoute: { startYear: 2027, turnIndex: 0, elapsed: 4 },
  subsidyPerTurn: 25,        // 政党要件を満たすと政党交付金(万円/ターン)
  // 離党
  defect: { minWins: 2, followRate: 0.5, relationMult: 0.5 },
  // 移籍
  migrate: { minWins: 1, personalPenalty: 3, recogKeep: 1.0 },   // 渡り鳥:次の選挙で全地区の個人支持が減る
  assassin: { recog: 50, personal: 18 },   // 刺客
};
Game.Balance.rivals.assassin = Game.Balance.newParty.assassin;

// 全国での知名度(党首選の党員票に効く)
Game.Balance.term.nationalRecog = { question: 0.5, bill: 2, media: 5, perPostTurn: 0.5 };

// ---- 党首モード(leader.js):後半の土台。M6・M7 で総選挙と政権運営を足す ----
Game.Balance.partyLeader = {
  actionsPerTurn: 2,
  cohesionStart: { election: 65, newparty: 80 },
  cohesionRecovery: 1,       // 毎ターン、何もしなくても戻る量
  frictionDecay: 0.8,        // 合流の「しこり」は毎ターンこれだけ残る
  cohesionToSupport: 0.04,   // 結束が 60 から 1 下がるごとに支持率がこれだけ下がる(%)
  actions: {
    harmony: { money: 10, cohesion: 6 },                    // 党内の融和(議員懇談会)
    posts:   { money: 0,  cohesion: 11, cooldown: 4 },      // 人事で処遇(4ターンに1回)
    tour:    { money: 15, support: 0.6 },                   // 党勢拡大の全国行脚
    press:   { money: 5,  support: 0.3, nationalRecog: 3 }, // 記者会見
    orgs:    { money: 5 },                                  // 支援団体との関係づくり(関係度は orgs.visit)
    policy:  { money: 10, promise: 1 },                     // 政策協議(約束を前に進める)
    fund:    { moneyGain: 80 },
    merge:   { money: 0 },                                  // 合流・合併の交渉(提案すると1回分)
    successor: { money: 0 },                                // 後継を指名して退く(エンディング)
  },
  supportShiftDecay: 0.95,
  eventChance: 0.45,
  events: {
    infighting: { weight: 3, cohesion: -7 },      // 党内対立(選択)
    defectorRumor: { weight: 2, cohesion: -4 },   // 離党の噂
    goodNews: { weight: 2, support: 0.8 },        // 党の政策が評価される
    orgDemand: { weight: 2 },                     // 引き継いだ支持母体からの要望
  },
  infighting: { leadCohesion: -4, leadSupport: 0.3, compromiseCohesion: 5, compromiseSupport: -0.6 },
  // 分裂
  split: { threshold: 30, turns: 2, chance: 0.5, groupKeepMin: 0.6, dissidentShare: [0.08, 0.18], support: -1.5, cohesionAfter: 60, orgRelation: -20 },
};

// ---- 合流・合併(merger.js) ----
Game.Balance.merger = {
  baseWillingness: 20,
  sizePenalty: 30,           // 相手が自分より大きいほど渋る(相手/自分の議席比 × これ、上限あり)
  sizePenaltyMax: 40,
  conflictPenalty: 12,       // 基本政策が1組ぶつかるごとの前向き度の低下
  conflictCohesion: 8,       // 同じく結束の低下
  baseCohesionDrop: 6,
  sizeCohesion: 30,          // 相手の議席の割合(相手/合計)× これだけ結束が下がる
  cooldownTurns: 4,          // 断られたら、この間は同じ相手と交渉できない
  supportSynergy: 0.9,       // 合流後の支持率 =(自分 + 相手)× これ
  backerRelation: 65,        // 相手の支持母体との関係度は、少なくともこの値になる
  // 交渉の項目:相手の前向き度(willing)と、自分の党の結束(cohesion)への影響
  terms: {
    name:   { ours: { willing: -10, cohesion: 0 }, theirs: { willing: 12, cohesion: -6 }, fresh: { willing: 4, cohesion: -2 } },
    leader: {
      // 自分の党が大きい場合
      bigger:  { keep: { willing: -4, cohesion: 0 }, posts: { willing: 12, cohesion: -4 } },
      // 自分の党が小さい場合(相手は代表の座を求める)
      smaller: { keep: { willing: -25, cohesion: 0 }, co: { willing: 8, cohesion: -3 }, yield: { willing: 22, cohesion: -6 } },
    },
    policy: { ours: { willing: -12, cohesion: 0 }, theirs: { willing: 12, cohesion: -8 }, both: { willing: 4, cohesion: -8 } },
    candidates: { ours: { willing: -10, cohesion: 2 }, theirs: { willing: 10, cohesion: -5 }, incumbent: { willing: 2, cohesion: -1 } },
  },
};

// ---- 全国の総選挙(national.js / campaign.js の全国モード / vote.js) ----
// 小政党も全国モードでは「候補」として戦うので、政党の強さを持たせる(比例の支持率と同じ値)
Object.assign(Game.Balance.parties, {
  komeito: { support: 7, lean: { urban: 0.5 }, orgStrength: 0.2, orgLean: { urban: 0.5 } },
  kokumin: { support: 8, lean: { industry: 0.3, youth: 0.3 }, orgStrength: 0.4, orgLean: { industry: 0.6 } },
  heiwa:   { support: 6, lean: { urban: 0.3, industry: 0.3 }, orgStrength: 0.4, orgLean: { industry: 0.5 } },
  midori:  { support: 4, lean: { urban: 0.5, youth: 0.5 }, orgStrength: 0.1, orgLean: {} },
});
Game.Balance.national = {
  // 選挙資金(万円)=党の資金 + 議席 × perSeat + 支持率 × perSupport + base
  funds: { base: 200, perSeat: 6, perSupport: 30 },
  candidateCost: 6,          // 新人候補1人(供託金・選挙費用)
  celebrityCost: 60,         // 有名人候補
  celebrityMax: 2,           // 1ブロックあたり
  celebrity: { recog: 15, personal: 5 },
  // 党の地力:選挙戦の初期値(ブロックごと)
  start: {
    recogBase: 30, recogPerSupport: 2.2, recogBigParty: 15, recogBigSeats: 50, recogMax: 95,
    personalBase: 1, personalPerSeatShare: 5, personalPerSupport: 0.35,
    coverageMin: 0.45,       // 候補者が少ないブロックの地力 ×(coverageMin + (1−coverageMin)× 擁立の割合)
  },
  // AI の党が小選挙区に候補を立てる割合
  aiCoverage: { minsei: 0.95, kyowa: 0.75, mirai: 0.45, kokumin: 0.35, heiwa: 0.3, midori: 0.1, komeito: 0.03, kofuku: 0.1, newparty: 0.3, splinter: 0.2 },
  // 投票日
  districtNoise: 0.6,        // 選挙区ごとの得票のぶれ(倍率の標準偏差)
  blockNoise: 0.04,          // ブロックごとの政党の得票率のぶれ(倍率)
  partySwing: 0.06,          // 全国の政党ごとのぶれ(倍率)
  incumbencyBonus: 0.05,     // 前回その党が多く議席を取ったブロックほど、選挙区で少し強い(倍率)
  leaderDistrictBonus: 1.35, // 党首本人の選挙区
  prRequirementShare: 0.2,   // 政党要件がない党は、ブロック定数のこの割合以上の候補が必要
  // 比例名簿の方針
  listPolicy: {
    dup:  { prMult: 1.0,  smdMult: 1.0 },    // 重複立候補を中心に(小選挙区の候補が比例で復活できる)
    solo: { prMult: 1.06, smdMult: 0.97 },   // 比例単独の有名人を上位に(比例は伸びるが、選挙区の候補の士気が少し下がる)
  },
  // 候補者調整
  coop: {
    base: 25, conflictPenalty: 15, biggerAskPenalty: 18, favorPartnerBonus: 10,
    ratioCap: 4,             // 議席比はここまでで頭打ち
    rivalSeats: 80, rivalPenalty: 60,   // どちらも80議席以上の大政党どうしは政権を争う相手なので組まない
    unifyTransfer: 0.7,      // 一本化:降りた側の票がこれだけ相手に流れる
    smdTransfer: 0.6,        // 「選挙区はA」:B の選挙区の票がこれだけ A に流れる
    prTransfer: 0.12,        // 「比例はB」:A の比例票のうちこれだけが B に流れる
  },
  // 選挙戦の行動(全国モード)
  manifestoMax: 1,           // 公約発表は1回だけ
  supportAdjust: { minsei: -6 },   // 全国選挙だけの支持率の補正(ポイント。選挙区モードの調整を崩さないため政党の強さは変えない)
  aiSkill: 0.85,
  aiSkillOverride: { kofuku: 0.03 },   // 組織が小さく全国での選挙戦は限られる(比例の得票率が1%前後になるように)
  capacity: { base: 0.2, perSupport: 0.025, min: 0.2, max: 0.9 },   // 選挙戦の行動の効き = base + 支持率 × perSupport
  shareExponent: 1.0,        // 全国モードの得票率の計算(選挙区モードより鋭くしない。小選挙区で大政党が有利になるのは議席の計算で起きる)
  // 開票特番
  countSteps: ['20:00', '20:30', '21:00', '21:30', '22:00', '22:30', '23:00', '23:30', '0:00', '1:00', '2:00'],
  prFromStep: 7,             // この段から比例の開票が始まる
  // 選挙のあと
  afterCohesion: { gain: 6, loss: -8 },   // 議席を増やした / 減らした党首の党内の結束
};
// 全国モードの行動(campaign.js が Bal().actions[aid] で読む)
Object.assign(Game.Balance.actions, {
  tour:      { stamina: 15, money: 10, recog: 6,  personal: 3.5, traitBonus: { urban: 0.3 } },          // 全国遊説(ブロック)
  focus:     { stamina: 5,  money: 60, recog: 3,  personal: 5,   momentum: 0.02, traitBonus: {} },     // 資金の重点配分(ブロック)
  manifesto: { stamina: 10, money: 30, personalAll: 2.5, momentum: 0.06 },                            // 公約発表(全ブロック、1回)
});
Game.Balance.ai.personaNational = { default: { tour: 4, sns: 1, focus: 1 } };
Game.Balance.events.weightsNational = { rain: 2, partyScandal: 3, partyBoost: 3, rivalGaffe: 2, heat: 1 };

// ---- 政権運営(government.js) ----
Game.Balance.gov = {
  // 連立交渉:相手の前向き度
  coalition: {
    base: 15, conflictPenalty: 12, rivalSeats: 80, rivalPenalty: 40,
    perMinister: 7, perPolicy: 8, coopBonus: 10,
    notLargestPenalty: 18,    // こちらが第1党でないと、相手は第1党との連立を先に考える
    ministerMax: 3,
    biggerPartnerPenalty: 15, biggerRatioCap: 4,   // 相手が自分より大きいとき、議席比 × これだけ前向き度が下がる
    ministerCohesion: -3,     // 大臣ポストを渡すと自分の党内に不満(1つあたり)
    satisfactionStart: 70,
  },
  // 連立相手の満足度
  partner: {
    decay: 2,                 // 毎ターン
    unkeptPromise: 1,         // 約束した政策の法案がまだ通っていないと、1つにつき毎ターン
    keptPromise: 15,
    leaveAt: 20,              // これを下回ると連立離脱
    consult: 10,              // 連立協議
    billConflict: -15,        // 相手の政策とぶつかる法案を出すと
  },
  approval: {
    drift: 2.5, meanRevert: 0.08, mean: 45, min: 8, max: 80,
    toSupport: 0.012,         // 首相の党の支持率 += (内閣支持率 − 45) × これ(毎ターン)
    // 長期政権の「飽き」:首相の在任ターン数で
    fatigue: [{ from: 12, perTurn: 0.5 }, { from: 24, perTurn: 1 }],
    fatigueCap: 25,           // 飽きで下がる支持率の平均の上限
    lowForResign: 20,         // これ未満が続くと退陣要求
    lowTurns: 2,
  },
  actions: {
    bill:     { money: 20, passBase: 0.7, twisted: 0.4, minority: 0.5, conflictPenalty: 0.2, approvalWin: 2.5, approvalLose: -2, promise: 2 },
    reshuffle:{ money: 20, approval: 3, cohesion: 5, cooldown: 4, scandalRisk: 0.15, scandalApproval: -5 },
    diplomacy:{ money: 30, approvalMin: -1.5, approvalMax: 5 },
    pressPM:  { money: 0, approval: 1, gaffeChance: 0.12, gaffeApproval: -4 },
    consult:  { money: 10 },
    dissolve: { money: 0, earlyTurns: 12, earlyPenalty: 1.5 },   // 在任12ターン未満の解散は「党利党略」批判(全国選挙の支持率 −1.5)
    // 野党
    grill:    { money: 0, approval: -2, support: 0.5, backfireChance: 0.2, backfireSupport: -0.8 },
    noConf:   { money: 0, cooldown: 4, failSupport: 0.4 },
    pact:     { money: 10 },
  },
  budget: { twistedChance: 0.5, compromiseApproval: 0, forceApproval: -4, failApproval: -6 },
  // 参院選
  upper: {
    prSeats: 50, districtSeats: 74,   // 改選124
    districtPower: 1.7,               // 選挙区(1人区が多い)は大政党に有利
    noise: 0.08,
    strategy: {
      single: { support: 0.6, label: '1人区に集中' },
      pr:     { support: 0.4, prMult: 1.08, label: '比例で党の訴えを' },
      issue:  { support: 1.0, risk: 0.35, label: '争点を一つに絞って勝負' },
    },
    lossCohesion: -10,
  },
  // 退陣と後継
  resign: { continueCohesion: -12, continueApproval: -2 },
  // 内閣不信任案:与党の連立相手の満足度がこれ未満なら造反して賛成に回る
  noConfidenceDefectAt: 30,
  aiDissolveAfterNoConf: 0.7,
};

// ---- エンディングとレガシー評価(legacy.js) ----
Game.Balance.legacy = {
  // 加点
  pmYears:     { per: 3, max: 24 },          // 首相の在任年数
  approval:    { from: 30, per: 0.6, max: 15 },   // 平均内閣支持率(30%を超えた分)
  bills:       { per: 1, max: 15 },          // 成立した重要法案と議員立法
  promises:    { max: 12, none: 6 },         // 約束を守った割合 × max(約束がなければ none)
  wins:        { per: 1, max: 8 },           // 当選回数
  rank:        { backbencher: 0, seimukan: 2, fukudaijin: 4, minister: 8, executive: 9, leader: 11, pm: 14 },
  successor:   { minApproval: 45, bonus: 6 },   // 支持が高いうちに後継を指名して退く
  // 減点
  scandal: 3, coalitionBreak: 4, twistedFail: 1, twistedFailMax: 10,
  // 評価の境目
  grades: [{ g: 'S', min: 75 }, { g: 'A', min: 58 }, { g: 'B', min: 40 }, { g: 'C', min: 22 }, { g: 'D', min: -999 }],
  // 首相の退き方
  greatPMApproval: 45,     // これ以上の支持率で退けば「名宰相」
  longPMYears: 6,          // これ以上なら「長期政権の末に退陣」
};

// ---- 党首の任期(leader.js) ----
Game.Balance.leaderTerm = {
  years: 3,
  maxTerms: 2,
  // 再選の確率 = base + (内閣支持率 − 35) × perApproval(首相のとき)+ (結束 − 50) × perCohesion + (支持率の変化) × perSupport
  reelect: { base: 0.55, perApproval: 0.012, perCohesion: 0.008, perSupport: 0.03, min: 0.05, max: 0.95 },
  blameLossShare: 0.15,    // 野党党首が総選挙で議席をこれ以上の割合で減らすと責任論
  blameCohesion: -15,      // 責任論のなかで続投すると
};

// ---- SNSと炎上(sns.js) ----
// 話題度(0〜100)は知名度に、好感度(−30〜+30)は票につながる。若い世代・都市部に効き、組織票には効かない
Game.Balance.sns = {
  buzzMax: 100, favorMin: -30, favorMax: 30,
  // 投稿の種類:buzz 話題度、favor 好感度(favorMin〜favorMax はぶれ幅)、recog 知名度の伸びの倍率、flameChance 炎上の確率
  posts: {
    policy: { buzz: 4,  favor: 2.5, recog: 1.0 },
    daily:  { buzz: 3,  favor: 1.8, recog: 0.8 },
    attack: { buzz: 9,  favorMin: -4, favorMax: 5, recog: 1.2, flameChance: 0.12 },
    neta:   { buzz: 12, favorMin: -5, favorMax: 6, recog: 1.4, flameChance: 0.15 },
  },
  // トレンド:乗れる種類で投稿すると hitChance で拡散、外すと空振り。まじめな話題にネタで乗ると炎上しやすい
  trend: { hitChance: 0.7, hitBuzz: 2.2, hitFavor: 1.5, missBuzz: 0.4, missFavor: 0.3, seriousFlame: 0.35 },
  viralBuzz: 14,              // 1回の投稿でこれ以上伸びたら「バズった」(新党は新しさが少し戻る)
  newnessBoost: 0.6,          // 新党:伸び ×(1 + 新しさ/100 × これ)
  buzzBoost: 100,             // 投稿の知名度の伸び ×(1 + 話題度/これ)
  decay: { day: { buzz: 0.85, favor: 0.97 }, turn: { buzz: 0.6, favor: 0.85 } },
  carry: { buzz: 0.5, favor: 0.8 },   // 選挙戦と任期のあいだで持ち越す割合
  // 好感度 → 地区での強さ(個人支持と同じ扱い)。地区の特徴で効き方が変わる
  favorWeight: { district: 0.5, national: 0.12 },
  traitBonus: { youth: 1.2, urban: 0.8, elderly: -0.4 },
  campaign: { recogAll: 6, buzzRecogDaily: 0.05, flameMomentum: 0.02 },
  term: { recogAll: 1.5, nationalRecog: 0.25 },
  leader: { nationalRecog: 0.2, favorToSupport: 0.06, favorToApproval: 0.015 },
  // 炎上:sevWeights は深刻度1〜3の重み。起きた時点で好感度 −sev×favorHit、話題度 +sev×buzzHit
  flame: {
    favorHit: 3, buzzHit: 10,
    sevWeights: { post: [6, 3, 1], serious: [3, 4, 2], gaffe: [2, 4, 2], clip: [5, 3, 1], hoax: [4, 4, 1] },
    apologize: { real: 2, unfair: -1 },          // 好感度 ×sev(自分の落ち度なら戻り、切り抜き・デマだと逆効果)
    rebutChance: { post: 0.3, serious: 0.15, gaffe: 0.25, clip: 0.6, hoax: 0.55 },
    rebutWin: 3, rebutLose: -3, rebutLoseBuzz: 5,
    video: { cost: 15, real: 1.5, unfair: 2.5, buzz: 4 },   // 説明動画(資金・万円)
    ignore: { fizzle: 0.5, favor: -2 },
    factcheck: { now: -1, later: 3.5, delay: 2 },          // デマ:今は −、delay 日(ターン)後に +
  },
  clip: { buzz: 10, favor: 3 },   // 好意的に切り抜かれたとき
  // 発言が切り抜かれる確率(chance)と、そのうち好意的に広まる割合(positive)
  clips: {
    debatePolicy: { chance: 0.2,  positive: 0.75 },
    debateAttack: { chance: 0.45, positive: 0.4 },
    debateLocal:  { chance: 0.2,  positive: 0.65 },
    question:     { chance: 0.12, positive: 0.65 },
    media:        { chance: 0.15, positive: 0.55 },
    press:        { chance: 0.15, positive: 0.55 },
  },
  // 支援団体との近さが話題に(賛否が割れて好感度が ±favor の範囲で動く)
  orgTopic: { chanceDay: 0.08, chanceTurn: 0.2, favor: 3, buzz: 6, minRelation: 80 },
};
Game.Balance.events.weights.snsHoax = 1;
Game.Balance.events.weightsNational.snsHoax = 1;
Game.Balance.term.actions.sns = { money: 0 };
Game.Balance.term.events.snsHoax = { weight: 1 };
Game.Balance.partyLeader.actions.sns = { money: 0 };
Game.Balance.partyLeader.events.snsHoax = { weight: 1 };

// ---- 国会論戦バトル(debate.js) ----
Game.Balance.debate = {
  // 相性:追及側のカード × 答弁側のカード → 説得力の動き(+ は追及側が押す、− は答弁側が切り返す)
  matrix: {
    evidence: { straight: 2,  numbers: -2, dodge: 8,  apologize: 0, consider: 3 },
    sharp:    { straight: 2,  numbers: -9, dodge: -4, apologize: 0, consider: 6 },
    nitpick:  { straight: 1,  numbers: 0,  dodge: -7, apologize: 0, consider: -6 },
    counter:  { straight: -6, numbers: 1,  dodge: 5,  apologize: 0, consider: 8 },
    public:   { straight: -5, numbers: 6,  dodge: 3,  apologize: 0, consider: 3 },
  },
  strongMult: 1.5,            // ★つきのカード:こちらに有利な動きが ×これ
  meterStart: 50, winLine: 55, loseLine: 45,   // 説得力(0〜100、あなたの側)。0か100で決着
  composure: {
    start: 70, perPost: 3,    // あなたの冷静さ(役職が上がるほど場慣れしている)
    hitPerPoint: 1.5,         // 押された側の冷静さが、動いた量 × これ だけ減る
    nitpick: 12,              // 揚げ足取りは相手の冷静さを大きく削る
    apologize: 8,             // 謝罪すると冷静さが戻る
    perRound: 2,              // 毎回少しずつ削れる
  },
  gaffe: { line: 40, perPoint: 0.012, swing: 10 },   // 冷静さが line 未満で (line − 冷静さ) × perPoint の確率で失言
  handSize: 4, deckMax: 12,
  startDeck: {
    ask: ['evidence', 'sharp', 'sharp', 'nitpick', 'counter', 'public'],
    answer: ['straight', 'straight', 'numbers', 'dodge', 'apologize', 'consider'],
  },
  // 相手(AI):composure 冷静さ、tell 予告(相手の様子)が当たる確率
  opponents: {
    minister:   { composure: 65, tell: 0.55 },   // 予算委員会の担当大臣
    pm:         { composure: 75, tell: 0.5 },   // 首相(党首討論)
    opposition: { composure: 70, tell: 0.5 },   // 野党の党首(党首討論)
  },
  aiWeights: {
    ask: { evidence: 2, sharp: 3, nitpick: 2, counter: 2, public: 2 },
    answer: { straight: 3, numbers: 3, dodge: 2, apologize: 1, consider: 2 },
    aheadBurn: 2,             // 答弁側が勝っていると、はぐらかし・「検討します」で時間を使いたがる
    lowComposureApologize: 3, // 冷静さが35未満だと謝罪したがる
  },
  // 結果の反映
  effects: {
    term: {   // 議員として予算委員会で質問
      win:  { partyEval: 4, nationalRecog: 3, achievements: 1, recogAll: 2, promise: 2, approval: -1.5 },
      draw: { partyEval: 1, nationalRecog: 1, achievements: 0, recogAll: 1, promise: 1, approval: 0 },
      lose: { partyEval: -2, nationalRecog: 1, achievements: 0, recogAll: 0, promise: 0, approval: 0 },
      gaffeEval: -2,
    },
    pm: {     // 首相として答弁(党首討論)
      win:  { approval: 2.5, support: 0.5 },
      draw: { approval: 0, support: 0 },
      lose: { approval: -3, support: -0.5 },
    },
    opposition: {   // 野党の党首として追及(党首討論)
      win:  { approval: -2.5, support: 1, nationalRecog: 2 },
      draw: { approval: -0.5, support: 0.2, nationalRecog: 1 },
      lose: { approval: 0.5, support: -0.8, nationalRecog: 1 },
    },
    apologyApproval: -0.8,    // 首相が謝罪するたびに
    oppGaffeApproval: -1,     // 政府側(大臣・首相)が失言するたびに内閣支持率
  },
  // 手札を増やす
  research: { strongAsk: ['evidence', 'counter', 'public'], strongAnswer: ['numbers', 'straight', 'dodge'] },
  studyGroup: { strongChance: 0.35 },
};
Game.Balance.term.actions.debate = { money: 0 };
Game.Balance.term.actions.research = { money: 10, achievement: 0.3 };
Game.Balance.partyLeader.actions.debate = { money: 0 };
Game.Balance.partyLeader.actions.research = { money: 10 };

// ---- イージーモード(スタート時に選ぶ。プレイヤーの側だけに効く) ----
Game.Balance.easy = {
  playerRecog: 10,        // 選挙区の選挙戦の始まりの知名度(全地区)
  playerPersonal: 5,      // 同じく個人支持
  money: 120,             // 選挙資金の上乗せ(万円)
  rivalSkill: 0.85,       // 対立候補(AI)の選挙戦のうまさ ×これ
  nationalSupport: 1.5,   // 党首として戦う総選挙で、自分の党の支持率に上乗せ(%)
  leadershipRival: 0.9,   // 党首選のライバルの強さ ×これ
};

// ---- 対戦モード(versus.js) ----
Game.Balance.versus = {
  clashMult: 0.5,           // 同じ日に同じブロックへ2人とも遊説すると、どちらの効果も ×これ
  newPartySeats: 5,         // 新党はこの人数の議員で始める(第1党から移ってくる。5人で政党要件)
  handicap: { money: 150, newness: 40 },   // 新党側の初期資金と、SNSの「新しさ」の上乗せ
  campaignDebate: { win: 0.06, lose: -0.04 },   // 選挙戦6日目の党首討論:勢い
  spread: { favor: 4, buzz: 6, backlash: 0.3, backlashFavor: -3 },   // 相手の失言をSNSで拡散(相手の好感度 −favor、自分は backlash の確率で「揚げ足取り」と言われる)
  trust: { start: 50, min: 30, breakPenalty: 40 },   // AI政党からの「信用」。min 未満だと組んでくれない。約束を破ると −breakPenalty
  gov: {
    passBase: 0.7, minorityMult: 0.6,
    billWin: 2.5, billLose: -2,
    diplomacy: [-1.5, 5], diplomacyMoney: 30, billMoney: 20, researchMoney: 10,
    pressApproval: 1, pressSupport: 0.3, pressGaffe: 0.1,
    grillChance: 0.6, grillWin: -2.5, grillLose: 0.5, grillSupport: 0.5,
    noConfMinority: 0.5, noConfMajority: 0,   // 与党が過半数なら否決
    fundGain: 40, income: 15, incomePerSeat: 0.1,
    drift: 2.5, meanRevert: 0.08, mean: 45, fatigueFrom: 12, fatigue: 0.5,
    approvalToShift: 0.04,   // 首相の党の支持率 = (内閣支持率 − 45) × これ
    supportDecay: 0.9,
  },
  victory: { governTurns: 12, governMaxYears: 9, legacyYears: 6 },
  // レガシー評価(対戦モード版)
  legacy: { pmYear: 4, pmMax: 24, approvalFrom: 30, approvalPer: 0.5, approvalMax: 15, bill: 1.5, billMax: 15, seatShare: 60, debate: 2, gaffe: -1, broken: -5 },
};

// ---- 政策の結果と経済の指標(economy.js、M14) ----
// 指標:景気(成長率%)・物価(上昇率%)・財政(健全度 0〜100)・暮らし(安心度 0〜100)・安全保障(安心度 0〜100)
// 法案が成立すると、効果を「delay ターン後から spread ターンかけて」押し込む(v は押し込む量の合計)
// 景気・物価・暮らし・安全保障は、ふだんの水準(trend)へ毎ターン revert の割合で戻る。財政は戻らない(積み重なる)
Game.Balance.econ = {
  start: { growth: 1.0, prices: 1.8, fiscal: 45, life: 50, security: 50 },
  trend: { growth: 1.0, prices: 1.8, life: 50, security: 50 },
  revert: { growth: 0.15, prices: 0.12, life: 0.05, security: 0.04 },
  noise: { growth: 0.3, prices: 0.15, life: 0.8, security: 0.8 },
  limits: { growth: [-5, 6], prices: [-2, 10], fiscal: [0, 100], life: [0, 100], security: [0, 100] },
  fiscal: { drift: -0.25, growthBase: 0.5, perGrowth: 0.25 },  // 財政 += drift(高齢化)+(景気 − growthBase)× perGrowth
  fiscalWarn: 20,                                               // 財政がこれを割ると「格付けが下がる」と報じられる
  prices: { perGrowth: 0.08 },                                  // 景気がよいと物価が上がる
  life: { perGrowth: 0.06, inflationFrom: 3, perInflation: -0.3 },  // 毎ターン:景気は暮らしを支え、物価高は暮らしを削る
  // 外からの出来事(架空)。1ターンに chance の確率で1つ起きる
  shocks: {
    chance: 0.1,
    list: {
      recession: { weight: 3, growth: -1.6, text: '海外の景気が後退し、輸出が落ち込んだ。' },
      energy:    { weight: 3, prices: 1.6, growth: -0.4, text: '資源の値段が高騰し、電気代やガソリン代が上がった。' },
      yen:       { weight: 2, prices: 0.8, growth: 0.3, text: '為替が大きく動き、輸入品の値段が上がった。' },
      export:    { weight: 2, growth: 0.9, text: '輸出が好調で、企業の業績が伸びている。' },
      tension:   { weight: 2, security: -10, text: '近隣の海域で緊張が高まっている。' },
      disaster:  { weight: 2, growth: -0.6, life: -4, text: '大きな自然災害が起き、復旧が急がれている。' },
    },
  },
  // 世の中の「気分」(内閣支持率が戻っていく水準を動かす)
  mood: {
    growthFrom: 1.0, perGrowth: 2.5,          // 景気がふだんより1ポイントよいと +2.5
    pricesFrom: 2.5, perPrices: -2.2,         // 物価上昇率が2.5%を超えた分
    deflationFrom: 0, perDeflation: -1.0,     // 物価が下がる(デフレ)
    lifePer: 0.15, securityPer: 0.06,         // 50からの差
    fiscalFrom: 30, perFiscal: -0.25,         // 財政の健全度が30を割った分(市場の不安)
    max: 12,
    toApproval: 1.0,                          // 内閣支持率の平均 += 気分 × これ
    toWind: 0.12, windMax: 2,                 // 選挙のとき、与党の支持率 += 気分 × これ(上限 ±windMax)
    windNotice: 0.5,                          // 追い風・逆風がこれ以上なら解散の知らせに書く
  },
  ai: { billChance: 0.25, fiscalReformBelow: 35 },   // AI の政府:毎ターンこの確率で自分の党の政策の法案を通す。財政がこれを割ると財政再建
  memberBillScale: 0.3,                     // 議員立法の効果は重要法案のこれだけ
  // 政策ごとの効果。k:指標、v:押し込む量、delay:効き始めるまで、spread:何ターンかけて
  policies: {
    taxcut:       [{ k: 'growth', v: 0.9, delay: 1, spread: 4 }, { k: 'prices', v: 0.4, delay: 2, spread: 4 }, { k: 'fiscal', v: -14, delay: 0, spread: 8 }],
    growth:       [{ k: 'growth', v: 1.0, delay: 3, spread: 6 }, { k: 'fiscal', v: -4, delay: 0, spread: 4 }],
    deregulation: [{ k: 'growth', v: 0.8, delay: 4, spread: 6 }, { k: 'life', v: -4, delay: 0, spread: 3 }, { k: 'prices', v: -0.2, delay: 4, spread: 4 }],
    wage:         [{ k: 'life', v: 6, delay: 1, spread: 4 }, { k: 'prices', v: 0.5, delay: 2, spread: 4 }, { k: 'growth', v: -0.3, delay: 0, spread: 3 }],
    employment:   [{ k: 'life', v: 6, delay: 1, spread: 4 }, { k: 'fiscal', v: -4, delay: 0, spread: 4 }],
    welfare:      [{ k: 'life', v: 9, delay: 1, spread: 6 }, { k: 'fiscal', v: -10, delay: 0, spread: 8 }],
    medical:      [{ k: 'life', v: 4, delay: 2, spread: 6 }, { k: 'fiscal', v: 5, delay: 4, spread: 8 }],
    livelihood:   [{ k: 'life', v: 7, delay: 0, spread: 2 }, { k: 'growth', v: 0.3, delay: 0, spread: 2 }, { k: 'prices', v: 0.5, delay: 1, spread: 3 }, { k: 'fiscal', v: -9, delay: 0, spread: 3 }],
    education:    [{ k: 'life', v: 3, delay: 1, spread: 4 }, { k: 'growth', v: 0.8, delay: 8, spread: 8 }, { k: 'fiscal', v: -7, delay: 0, spread: 8 }],
    agri:         [{ k: 'life', v: 2, delay: 1, spread: 3 }, { k: 'prices', v: -0.2, delay: 2, spread: 3 }, { k: 'fiscal', v: -3, delay: 0, spread: 4 }],
    defense:      [{ k: 'security', v: 10, delay: 2, spread: 6 }, { k: 'fiscal', v: -9, delay: 0, spread: 8 }],
    peace:        [{ k: 'security', v: 6, delay: 1, spread: 4 }],
    article9:     [{ k: 'security', v: 3, delay: 2, spread: 4 }],
    constitution: [{ k: 'security', v: 2, delay: 2, spread: 4 }],
    tradition:    [{ k: 'life', v: 1, delay: 1, spread: 2 }],
  },
  // 首相の行動
  stimulus: { money: 30, cooldown: 4, approval: 1.5,   // 経済対策(補正予算)
    effects: [{ k: 'growth', v: 1.0, delay: 0, spread: 3 }, { k: 'prices', v: 0.3, delay: 1, spread: 3 }, { k: 'fiscal', v: -7, delay: 0, spread: 2 }] },
  fiscalReform: { money: 10, cooldown: 4, approval: -2.5, cohesion: -3,   // 財政再建(増税・歳出の見直し)
    effects: [{ k: 'fiscal', v: 12, delay: 0, spread: 4 }, { k: 'growth', v: -0.5, delay: 0, spread: 3 }, { k: 'life', v: -3, delay: 0, spread: 3 }] },
  // レガシー評価:首相のあいだの気分の平均 × moodPer(min〜max)、辞めるときに財政が fiscalBad を割っていたら減点
  legacy: { moodPer: 0.8, moodMax: 10, moodMin: -6, fiscalBad: 25, fiscalPenalty: 4 },
  historyMax: 16,
  // 画面に出す状態のことば:[この値以上なら, ことば, 色(good / bad / '')]
  status: {
    growth: [[2, '好調', 'good'], [0.5, '緩やかに回復', 'good'], [-0.5, '足踏み', ''], [-99, '後退', 'bad']],
    prices: [[4, '物価高', 'bad'], [2.5, 'やや高い', 'bad'], [0.5, '安定', 'good'], [0, '伸び悩み', ''], [-99, 'デフレ', 'bad']],
    fiscal: [[60, '健全', 'good'], [40, 'ふつう', ''], [25, '悪化', 'bad'], [-1, '危機的', 'bad']],
    other:  [[62, '安心が広がる', 'good'], [45, 'ふつう', ''], [32, '不安が広がる', 'bad'], [-1, '強い不安', 'bad']],
  },
};

// ---- 補欠選挙・地方選挙(local.js、M15) ----
Game.Balance.local = {
  chance: { member: 0.07, ronin: 0.07, founder: 0.05, leader: 0.08 },   // 1ターンに起きる確率
  homeByShare: 0.5,          // 浪人中に起きたとき、地元の補選(現職が知事選へ転身して空いた)になる割合
  days: 6,                   // 短期決戦(本番の選挙戦は12日)
  supportMoney: 120,         // 応援に入るとき党が出す選挙資金(万円)
  candidate: { recog: 28, personal: 6 },      // 応援する候補の最初の知名度・支持(全地区)
  homeCarry: 0.5,            // 地元の首長選:プレイヤーの地元の知名度のこれだけが、応援する候補に乗る
  // 知事選に自分が出る(当選1回以上か浪人)。相手の本命は県政に通じた有力候補。県全体の選挙なので、地元の選挙区の地盤は homeShare だけしか効かない
  governorRun: { minWins: 1, recogBonus: 0, personalBonus: 0, rivalRole: 'incumbentStrong', homeShare: 0.4 },
  homeBySuccessorRole: 'former',   // 地元の補選:辞めた現職の党が立てる後継の強さ(地盤そのものは引き継がない)
  rivalRole: 'former',       // 補選・首長選の相手(空いた議席なので現職はいない)
  // 「応援演説だけ」:勝つ見込み = base + (こちらの党の支持率 − 相手)× perSupport
  speech: { base: 0.45, perSupport: 0.012, min: 0.15, max: 0.85, money: 10 },
  // 結果の反映(議員・浪人・新党の党首)
  career: {
    campaignWin: { partyEval: 6, allies: 1.5, nationalRecog: 3 }, campaignLose: { partyEval: -2 },
    speechWin: { partyEval: 2 }, speechLose: {}, skip: { partyEval: -1 },   // 応援演説で負けても、それだけでは評価は下がらない
    localSolid: 3,           // 地元の首長選に勝つと、後援会(固い票)が全地区で増える
    governorLose: { partyEval: -5 },    // 知事選に出て負けた(議員なら議席を失う)
    homeByWin: { partyEval: 5 },
  },
  // 党首のとき(求心力)
  leader: {
    campaignWin: { cohesion: 8, support: 0.8 }, campaignLose: { cohesion: -8, support: -0.6 },
    speechWin: { cohesion: 3, support: 0.3 }, speechLose: { cohesion: -1 }, skip: { cohesion: -1 },
  },
  legacyGovernor: 10,        // レガシー評価:知事に当選して転身
};
Game.Balance.legacy.rank.governor = 9;

// ---- 党内の派閥(faction.js、M16) ----
Game.Balance.faction = {
  relStart: 40, relStartMainstream: 45,     // 最初の信頼(0〜100)
  relDrift: 0.03,                           // 毎ターン50へ戻る割合
  join: { rel: 15 },                        // 入会したとき
  attend: { rel: 7, otherRel: 3, joinedPenalty: -2 },   // 会合に顔を出す(入っている派閥 / ほかの派閥。ほかに顔を出すと、入っている派閥は少し不満)
  // 人事:主流派の派閥に入っていると昇進しやすく、非主流派だと「冷や飯」
  promotion: { mainstream: 0.08, nonMainstream: -0.12, relHigh: 60, relHighBonus: 0.03, owe: -1 },   // owe:主流派の口利きで昇進すると借りが1つできる
  // 党首選:派閥の推し(議員票の強さ)= 党の議員に占める割合 × mpPerShare
  race: {
    mpPerShare: 60,
    ownMinRel: 40,                          // 入っている派閥(長が出ない)の推しをもらえる信頼
    bossMeet: { base: 0.25, perRel: 0.006, perLend: 0.12, owe: -2 },   // キングメーカーとの会談:成功率 = base + 信頼 × perRel + 貸し × perLend。成功すると借りが2つ
    betray: { loyal: 0.05, hard: 0.1, opportunist: 0.28, lowRel: 50, perLowRel: 0.006, lendSafe: 0.1, min: 0.02, max: 0.6, relLoss: -10 },   // 開票直前の寝返り(寝返った派閥との信頼も下がる)
    leaveOwn: { rel: -35, alliesMult: 0.75 },   // 自分の派閥の長に挑む(派閥を飛び出す)
  },
  // 頼みごと(議員任期のターンの始まり)
  request: {
    chance: 0.12,
    yieldShare: 0.5, partyShare: 0.5,       // 借りがあるとき「ポストを譲れ」になる割合 / それ以外でパーティー券になる割合(残りは応援)
    party: { money: 20, rel: 5, lend: 1, refuse: -6 },      // 政治資金パーティーの券
    speech: { rel: 4, lend: 1, refuse: -5 },               // 派閥の若手の応援(このターンの行動を1つ使う)
    yieldPost: { rel: 6, repay: 2, refuse: -15, promotionPenalty: 0.3 },   // 借りがあるとき:次の人事のポストを派閥に譲る
  },
  debtMin: -6, debtMax: 6,                  // 貸し借りの幅(+ が貸し、− が借り)
  aiRace: { kingmakerWeight: 0.8, noise: 0.4 },   // プレイヤーが出ない党首選:派閥の大きさ + ぶれ。キングメーカーはどちらか一方を推す(推した側に × これ)
  // 党首モード
  leader: { postsRel: 15, postsOtherRel: -2, reelectPerRel: 0.004, mainstreamRel: 8 },
};

// ---- 殿堂・実績(hall.js、M17) ----
Game.Balance.hall = {
  maxRecords: 50,            // 歴代の記録に残す数(点数の高い順)
  veteranWins: 5,            // 「ベテラン議員」の当選回数
  hardSeatGuide: 15,         // 「逆風を越えて」:選挙区の初当選率の目安(districts.js の guide)がこれ未満
  ministerPost: 3,           // 「大臣の椅子」の役職の段階
  cleanPromises: 5,          // 「約束を守り抜く」に要る、果たした約束の数
  longPMYears: 6,            // 「長期政権」
  economyMood: 3,            // 「経済の立て直し」:首相のあいだの気分の平均
};
