// 全国11ブロック(衆議院の比例代表のブロック)。小選挙区289・比例176、合計465議席。
// smd:ブロック内の小選挙区の数、pr:比例の定数(2024年の区割り)。
// voters:有権者数の目安。traits:選挙戦で使う地域の特徴(0〜1。ゲーム用の大まかな値)。
// map:全国地図の格子での位置。
window.Game = window.Game || {};
Game.Data = Game.Data || {};

Game.Data.BLOCKS = [
  { id: 'hokkaido', name: '北海道',   smd: 12, pr: 8,  voters: 4500000,  traits: { urban: 0.45, youth: 0.35, elderly: 0.65, industry: 0.3,  farm: 0.75 }, map: { x: 4, y: 0 } },
  { id: 'tohoku',   name: '東北',     smd: 21, pr: 12, voters: 7200000,  traits: { urban: 0.3,  youth: 0.3,  elderly: 0.75, industry: 0.4,  farm: 0.8  }, map: { x: 4, y: 1 } },
  { id: 'kitakanto', name: '北関東',  smd: 33, pr: 19, voters: 11600000, traits: { urban: 0.55, youth: 0.45, elderly: 0.55, industry: 0.7,  farm: 0.5  }, map: { x: 3, y: 1 } },
  { id: 'minamikanto', name: '南関東', smd: 36, pr: 23, voters: 12700000, traits: { urban: 0.75, youth: 0.55, elderly: 0.45, industry: 0.6,  farm: 0.25 }, map: { x: 4, y: 3 } },
  { id: 'tokyo',    name: '東京',     smd: 30, pr: 19, voters: 11500000, traits: { urban: 0.98, youth: 0.75, elderly: 0.35, industry: 0.35, farm: 0.0  }, map: { x: 4, y: 2 } },
  { id: 'hokuriku', name: '北陸信越', smd: 18, pr: 10, voters: 6100000,  traits: { urban: 0.35, youth: 0.35, elderly: 0.65, industry: 0.6,  farm: 0.7  }, map: { x: 2, y: 1 } },
  { id: 'tokai',    name: '東海',     smd: 33, pr: 21, voters: 12200000, traits: { urban: 0.65, youth: 0.5,  elderly: 0.5,  industry: 0.9,  farm: 0.35 }, map: { x: 3, y: 2 } },
  { id: 'kinki',    name: '近畿',     smd: 45, pr: 28, voters: 17000000, traits: { urban: 0.8,  youth: 0.55, elderly: 0.5,  industry: 0.6,  farm: 0.2  }, map: { x: 2, y: 2 } },
  { id: 'chugoku',  name: '中国',     smd: 17, pr: 10, voters: 5800000,  traits: { urban: 0.4,  youth: 0.35, elderly: 0.7,  industry: 0.55, farm: 0.6  }, map: { x: 1, y: 2 } },
  { id: 'shikoku',  name: '四国',     smd: 10, pr: 6,  voters: 3200000,  traits: { urban: 0.3,  youth: 0.3,  elderly: 0.75, industry: 0.4,  farm: 0.7  }, map: { x: 1, y: 3 } },
  { id: 'kyushu',   name: '九州',     smd: 34, pr: 20, voters: 11700000, traits: { urban: 0.45, youth: 0.45, elderly: 0.65, industry: 0.45, farm: 0.65 }, map: { x: 0, y: 2 } },
];

// プレイヤーの党首としての地元があるブロック(Game.Data.HOME_BLOCK)は、選んだ選挙区で決まる(districts.js の applySeat)
Game.Data.applySeat(Game.Data.SEAT_ID);
