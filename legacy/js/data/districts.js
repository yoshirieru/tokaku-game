// 選挙区(すべて架空)。スタート時にどこから出るかを選ぶ。
// 各選挙区は5地区で、有権者数の合計は35万〜40万人ほど。
// traits は 0〜1 の地区の特徴。行動の効きと政党の相性に使う。map は 3×3 の地図の格子での位置(右上の1マスは海。sea はその名前)。
// 対立候補:people(政党ごとの人物)、roles(プレイヤーの党ごとに、どの党の候補がどの立場で出るか)。
//   roles のキーは Game.Balance.rivals の役割。省いた選挙区は parties.js の RIVALS / RIVAL_ROLES を使う。
// 選挙区ごとの党の地力(支持率の上乗せ)は balance.js の Game.Balance.seats。
// guide:党ごとの初当選率の目安(%。自動プレイの中級ボット200回。表示用で、ロジックでは使わない)。
//
// いま遊んでいる選挙区は Game.Data.applySeat(id) で
//   Game.Data.DISTRICTS / DISTRICT_NAME / DISTRICT_BLOCK / HOME_BLOCK / RIVALS / RIVAL_ROLES
// に差し込む(state.seat に id を保存し、読み込み時に main.js が差し込み直す)。
window.Game = window.Game || {};
Game.Data = Game.Data || {};

Game.Data.DEFAULT_SEAT = 'hokuyo3';

Game.Data.SEATS = [
  {
    id: 'hokuyo3', name: '北陽3区', block: 'kitakanto', prefectures: ['北陽', '東沢', '西岡', '南峰'],
    type: 'バランス型', sea: '北陽湾', guide: { minsei: 58, kyowa: 38, mirai: 16 },
    description: '街・住宅地・工場・田畑・大学がそろう、標準的な選挙区。はじめての人におすすめ。',
    districts: [
      {
        id: 'downtown', name: '市街地', voters: 92000,
        traits: { urban: 0.95, youth: 0.5, elderly: 0.4, industry: 0.3, farm: 0.0 },
        description: '駅前の商店街とオフィス街。人通りが多く、街頭演説が効く。',
        map: { x: 1, y: 1, w: 1, h: 1 },
      },
      {
        id: 'residential', name: '住宅地', voters: 108000,
        traits: { urban: 0.6, youth: 0.35, elderly: 0.6, industry: 0.2, farm: 0.1 },
        description: '戸建てと団地が広がる、有権者がいちばん多い地区。',
        map: { x: 0, y: 1, w: 1, h: 2 },
      },
      {
        id: 'industrial', name: '工業地帯', voters: 78000,
        traits: { urban: 0.5, youth: 0.4, elderly: 0.35, industry: 1.0, farm: 0.0 },
        description: '湾岸の工場群。労働組合と企業のつながりが強い。',
        map: { x: 2, y: 1, w: 1, h: 2 },
      },
      {
        id: 'rural', name: '農村', voters: 62000,
        traits: { urban: 0.05, youth: 0.1, elderly: 0.95, industry: 0.1, farm: 1.0 },
        description: '田畑と集落が点在する。顔を合わせた付き合いがものをいう。',
        map: { x: 0, y: 0, w: 2, h: 1 },
      },
      {
        id: 'campus', name: '学生街', voters: 60000,
        traits: { urban: 0.7, youth: 1.0, elderly: 0.05, industry: 0.1, farm: 0.0 },
        description: '大学とアパートの街。SNSの反応が早いが、投票に行く人は少なめ。',
        map: { x: 1, y: 2, w: 1, h: 1 },
      },
    ],
    // people / roles は parties.js の RIVALS / RIVAL_ROLES のまま
  },
  {
    id: 'touou7', name: '東央7区', block: 'tokyo', prefectures: ['東央'],
    type: '都会', sea: '東央湾', guide: { minsei: 44, kyowa: 52, mirai: 66 },
    description: '都心のオフィス街と下町、湾岸のタワーマンション。組織票が薄く、浮動票とSNSで決まる。未来改革党に追い風。',
    districts: [
      {
        id: 'downtown', name: '都心', voters: 98000,
        traits: { urban: 1.0, youth: 0.6, elderly: 0.3, industry: 0.15, farm: 0.0 },
        description: 'オフィス街とターミナル駅。昼の人出は多いが、住んでいる人は少なめ。',
        map: { x: 1, y: 1, w: 1, h: 1 },
      },
      {
        id: 'residential', name: '下町', voters: 96000,
        traits: { urban: 0.8, youth: 0.3, elderly: 0.75, industry: 0.4, farm: 0.0 },
        description: '商店街と町工場、長く住む人の多い地区。町内会のつながりが残る。',
        map: { x: 0, y: 1, w: 1, h: 2 },
      },
      {
        id: 'industrial', name: '湾岸', voters: 84000,
        traits: { urban: 0.9, youth: 0.75, elderly: 0.15, industry: 0.35, farm: 0.0 },
        description: '倉庫街の跡に建ったタワーマンション。子育て世代が多く、SNSをよく見る。',
        map: { x: 2, y: 1, w: 1, h: 2 },
      },
      {
        id: 'rural', name: '山の手', voters: 62000,
        traits: { urban: 0.7, youth: 0.3, elderly: 0.65, industry: 0.05, farm: 0.0 },
        description: '古くからの屋敷町。投票率が高く、保守層が厚い。',
        map: { x: 0, y: 0, w: 2, h: 1 },
      },
      {
        id: 'campus', name: '大学の街', voters: 64000,
        traits: { urban: 0.85, youth: 1.0, elderly: 0.05, industry: 0.05, farm: 0.0 },
        description: '大学がいくつも集まる。若い人は多いが、投票に行く人は少なめ。',
        map: { x: 1, y: 2, w: 1, h: 1 },
      },
    ],
    people: {
      minsei:  { name: '柏木 俊介', kana: 'かしわぎ しゅんすけ', age: 57, catch: '都市の力で、日本を前へ' },
      kyowa:   { name: '水野 玲子', kana: 'みずの れいこ', age: 49, catch: '働く人の声を、まっすぐ国会へ' },
      mirai:   { name: '真田 光', kana: 'さなだ ひかる', age: 41, catch: '行政をスマホ1台で' },
      kokumin: { name: '榊 大地', kana: 'さかき だいち', age: 36, catch: '手取りを増やす' },
    },
    roles: {
      minsei:   { mirai: 'incumbent', kyowa: 'former', kokumin: 'newcomer' },
      kyowa:    { mirai: 'incumbent', minsei: 'incumbent', kokumin: 'newcomer' },   // 民政は比例復活の現職
      mirai:    { kyowa: 'incumbent', minsei: 'former', kokumin: 'newcomer' },
      newparty: { mirai: 'incumbent', minsei: 'former', kyowa: 'newcomer' },
    },
  },
  {
    id: 'biyou2', name: '備陽2区', block: 'chugoku', prefectures: ['備陽', '雲浜', '周原'],
    type: '保守王国', sea: '備陽灘', guide: { minsei: 96, kyowa: 28, mirai: 7 },
    description: '田園と山あいの集落が広がる。日本民政党が長く議席を守ってきた。民政なら当選しやすいが、ほかの党はかなり厳しい。',
    districts: [
      {
        id: 'downtown', name: '城下町', voters: 82000,
        traits: { urban: 0.6, youth: 0.3, elderly: 0.65, industry: 0.3, farm: 0.2 },
        description: '県庁と古い商店街のある中心地。地元の名士の影響が大きい。',
        map: { x: 1, y: 1, w: 1, h: 1 },
      },
      {
        id: 'residential', name: '山あいの集落', voters: 58000,
        traits: { urban: 0.02, youth: 0.05, elderly: 1.0, industry: 0.05, farm: 0.8 },
        description: '過疎が進む山の集落。1軒ずつ訪ねる人がものをいう。',
        map: { x: 0, y: 1, w: 1, h: 2 },
      },
      {
        id: 'industrial', name: '臨海の工場', voters: 76000,
        traits: { urban: 0.4, youth: 0.35, elderly: 0.5, industry: 0.9, farm: 0.1 },
        description: '製鉄と化学の工場。労働組合はあるが、地域の保守層とも重なる。',
        map: { x: 2, y: 1, w: 1, h: 2 },
      },
      {
        id: 'rural', name: '田園', voters: 104000,
        traits: { urban: 0.05, youth: 0.1, elderly: 0.95, industry: 0.1, farm: 1.0 },
        description: '米どころの平野。有権者がいちばん多く、農業団体の力が強い。',
        map: { x: 0, y: 0, w: 2, h: 1 },
      },
      {
        id: 'campus', name: '県立大学', voters: 38000,
        traits: { urban: 0.5, youth: 0.9, elderly: 0.1, industry: 0.1, farm: 0.1 },
        description: '小さな大学町。若い人は少なく、浮動票は限られる。',
        map: { x: 1, y: 2, w: 1, h: 1 },
      },
    ],
    people: {
      minsei: { name: '久我 惣一郎', kana: 'くが そういちろう', age: 68, catch: 'ふるさとを守り抜く' },
      kyowa:  { name: '今村 千秋', kana: 'いまむら ちあき', age: 50, catch: '地方にも、暮らしの安心を' },
      mirai:  { name: '若松 悠', kana: 'わかまつ ゆう', age: 34, catch: '地方からイノベーションを' },
      heiwa:  { name: '戸川 幸子', kana: 'とがわ さちこ', age: 63, catch: '平和と暮らしを守る' },
    },
    roles: {
      minsei:   { kyowa: 'incumbent', heiwa: 'newcomer' },     // 前回は共和に競り負けた。取り戻しに出る
      kyowa:    { minsei: 'former', heiwa: 'newcomer' },
      mirai:    { minsei: 'newcomer', kyowa: 'newcomer' },      // 民政の現職が引退し、後継の新人
      newparty: { minsei: 'incumbentStrong', kyowa: 'former' },
    },
  },
  {
    id: 'bisou4', name: '尾湊4区', block: 'tokai', prefectures: ['尾湊', '駿浜', '美濃辺'],
    type: '工業都市', sea: '尾湊港', guide: { minsei: 32, kyowa: 73, mirai: 7 },
    description: '自動車の工場と社宅の街。労働組合の組織票が厚く、市民共和党の地盤。共和は戦いやすく、民政はやや厳しい。',
    districts: [
      {
        id: 'downtown', name: '駅前', voters: 80000,
        traits: { urban: 0.85, youth: 0.5, elderly: 0.4, industry: 0.4, farm: 0.0 },
        description: '新幹線の駅と繁華街。仕事帰りの人通りが多い。',
        map: { x: 1, y: 1, w: 1, h: 1 },
      },
      {
        id: 'residential', name: '社宅と団地', voters: 96000,
        traits: { urban: 0.6, youth: 0.4, elderly: 0.5, industry: 0.75, farm: 0.05 },
        description: '工場で働く人の家族が暮らす。組合の声がよく届く。',
        map: { x: 0, y: 1, w: 1, h: 2 },
      },
      {
        id: 'industrial', name: '工場地帯', voters: 102000,
        traits: { urban: 0.5, youth: 0.45, elderly: 0.3, industry: 1.0, farm: 0.0 },
        description: '完成車と部品の工場が並ぶ。有権者がいちばん多い。',
        map: { x: 2, y: 1, w: 1, h: 2 },
      },
      {
        id: 'rural', name: '郊外の農地', voters: 50000,
        traits: { urban: 0.1, youth: 0.15, elderly: 0.85, industry: 0.2, farm: 0.9 },
        description: '茶畑と果樹園。ここだけは保守の地盤。',
        map: { x: 0, y: 0, w: 2, h: 1 },
      },
      {
        id: 'campus', name: '工科大学の街', voters: 46000,
        traits: { urban: 0.6, youth: 0.95, elderly: 0.05, industry: 0.5, farm: 0.0 },
        description: '工科大学と専門学校。卒業すると地元の工場に就職する学生も多い。',
        map: { x: 1, y: 2, w: 1, h: 1 },
      },
    ],
    people: {
      minsei:  { name: '堀之内 健', kana: 'ほりのうち けん', age: 59, catch: 'ものづくりを、もっと強く' },
      kyowa:   { name: '石動 正樹', kana: 'いするぎ まさき', age: 55, catch: '働く人が報われる社会へ' },
      mirai:   { name: '星野 瑞穂', kana: 'ほしの みずほ', age: 39, catch: '次の産業を、この街から' },
      kokumin: { name: '浜口 勇気', kana: 'はまぐち ゆうき', age: 44, catch: '現場の手取りを上げる' },
      heiwa:   { name: '矢島 和子', kana: 'やじま かずこ', age: 61, catch: '雇用と平和を守る' },
    },
    roles: {
      minsei:   { kyowa: 'incumbentStrong', kokumin: 'newcomer' },
      kyowa:    { minsei: 'incumbent', kokumin: 'newcomer' },   // 共和の現職が引退。前回比例で復活した民政の現職と争う
      mirai:    { kyowa: 'incumbentStrong', minsei: 'former' },
      newparty: { kyowa: 'incumbentStrong', minsei: 'former', kokumin: 'newcomer' },
    },
  },
  {
    id: 'namiou5', name: '浪央5区', block: 'kinki', prefectures: ['浪央', '摂津原', '紀浜'],
    type: '改革の地盤', sea: '浪央湾', guide: { minsei: 35, kyowa: 24, mirai: 84 },
    description: '商人の街と大きなベッドタウン。改革を掲げる未来改革党が強い、全国でも数少ない選挙区。未来なら戦いやすい。',
    districts: [
      {
        id: 'downtown', name: '繁華街', voters: 92000,
        traits: { urban: 0.95, youth: 0.65, elderly: 0.35, industry: 0.2, farm: 0.0 },
        description: '商店街と歓楽街。話題になったものがすぐ広まる。',
        map: { x: 1, y: 1, w: 1, h: 1 },
      },
      {
        id: 'residential', name: 'ベッドタウン', voters: 112000,
        traits: { urban: 0.7, youth: 0.45, elderly: 0.5, industry: 0.2, farm: 0.05 },
        description: '私鉄沿線のニュータウン。有権者がいちばん多い。',
        map: { x: 0, y: 1, w: 1, h: 2 },
      },
      {
        id: 'industrial', name: '港の工業地帯', voters: 70000,
        traits: { urban: 0.55, youth: 0.4, elderly: 0.4, industry: 0.95, farm: 0.0 },
        description: '港に面した中小の工場。経営者の団体のつながりが強い。',
        map: { x: 2, y: 1, w: 1, h: 2 },
      },
      {
        id: 'rural', name: '丘陵の旧村', voters: 44000,
        traits: { urban: 0.2, youth: 0.15, elderly: 0.85, industry: 0.1, farm: 0.6 },
        description: '合併前の村。古くからの付き合いが残る。',
        map: { x: 0, y: 0, w: 2, h: 1 },
      },
      {
        id: 'campus', name: '学生街', voters: 60000,
        traits: { urban: 0.75, youth: 1.0, elderly: 0.05, industry: 0.1, farm: 0.0 },
        description: '私立大学が集まる。SNSの反応が早い。',
        map: { x: 1, y: 2, w: 1, h: 1 },
      },
    ],
    people: {
      minsei: { name: '御影 克彦', kana: 'みかげ かつひこ', age: 62, catch: '安定した政治を取り戻す' },
      kyowa:  { name: '土屋 香苗', kana: 'つちや かなえ', age: 47, catch: '子育てと介護を支える' },
      mirai:  { name: '一ノ瀬 隼人', kana: 'いちのせ はやと', age: 45, catch: '身を切る改革、やり切る' },
    },
    roles: {
      minsei:   { mirai: 'incumbentStrong', kyowa: 'former' },
      kyowa:    { mirai: 'incumbentStrong', minsei: 'incumbent' },   // 民政は比例復活の現職
      mirai:    { minsei: 'incumbent', kyowa: 'former' },            // 未来の現職が引退し、その後継として出る
      newparty: { mirai: 'incumbentStrong', minsei: 'former', kyowa: 'newcomer' },
    },
  },
];

Game.Data.seatById = (id) => Game.Data.SEATS.find((s) => s.id === id) || Game.Data.SEATS[0];

// parties.js の対立候補(北陽3区の顔ぶれ)を覚えておき、選挙区を替えるたびにそこから組み直す
Game.Data.BASE_RIVALS = JSON.parse(JSON.stringify(Game.Data.RIVALS || {}));
Game.Data.BASE_RIVAL_ROLES = JSON.parse(JSON.stringify(Game.Data.RIVAL_ROLES || {}));

// いま遊んでいる選挙区を差し込む
Game.Data.applySeat = function (id) {
  const D = Game.Data;
  const seat = D.seatById(id || D.DEFAULT_SEAT);
  const block = (D.BLOCKS || []).find((b) => b.id === seat.block) || { name: '', pr: 19, smd: 33 };
  D.SEAT_ID = seat.id;
  D.DISTRICTS = seat.districts;
  D.DISTRICT_NAME = seat.name;
  D.SEA_NAME = seat.sea || '';     // 地図の右上の海の名前
  // 比例ブロック。他の選挙区(架空)の候補は比例名簿の相手としてだけ登場する
  D.DISTRICT_BLOCK = {
    id: seat.block,
    name: block.name + 'ブロック',
    seats: block.pr,              // 比例の定数
    districts: block.smd,         // ブロック内の小選挙区の数(この選挙区を含む。blocks.js と同じ)
    prefectures: seat.prefectures, // 架空の県名(他の選挙区の名前に使う)
  };
  D.HOME_BLOCK = seat.block;      // 党首としての地元(全国の総選挙で党首本人が出る選挙区のブロック)
  D.RIVALS = Object.assign(JSON.parse(JSON.stringify(D.BASE_RIVALS)), seat.people || {});
  D.RIVAL_ROLES = seat.roles ? JSON.parse(JSON.stringify(seat.roles)) : JSON.parse(JSON.stringify(D.BASE_RIVAL_ROLES));
  return seat;
};

// blocks.js より先に読み込まれるので、最初の差し込みはブロックの情報なしで行い、blocks.js の最後でもう一度行う
Game.Data.applySeat(Game.Data.DEFAULT_SEAT);
