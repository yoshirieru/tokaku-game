// カードの名前・種類・絵・説明。数値は balance.js の cards から読んで文面を組み立てる。
window.Game = window.Game || {};
Game.Data = Game.Data || {};

// type: reach 広げる / solid 固める / promise 約束 / boost 応援 / fund 資金 / counter 先回り
Game.Data.CARDS = {
  speech:   { name: '街頭演説', type: 'reach', icon: 'speech' },
  door:     { name: '戸別訪問', type: 'solid', icon: 'door' },
  talk:     { name: '対話集会', type: 'reach', icon: 'talk' },
  rally:    { name: '決起集会', type: 'reach', icon: 'rally' },
  flyer:    { name: 'ビラ配り', type: 'reach', icon: 'flyer' },
  sns:      { name: 'SNS発信', type: 'reach', icon: 'sns' },
  fund:     { name: '資金集め', type: 'fund', icon: 'fund' },
  ahead:    { name: '先回り遊説', type: 'counter', icon: 'ahead' },
  star:     { name: '党幹部の応援', type: 'boost', icon: 'star' },
  pAgri:    { name: '農業団体に約束', type: 'promise', icon: 'promise' },
  pUnion:   { name: '労働組合に約束', type: 'promise', icon: 'promise' },
  pFamily:  { name: '子育て世帯に約束', type: 'promise', icon: 'promise' },
  pShop:    { name: '商店会に約束', type: 'promise', icon: 'promise' },
  pStudent: { name: '学生団体に約束', type: 'promise', icon: 'promise' },
};
Game.Data.CARD_TYPES = {
  reach: '広げる', solid: '固める', promise: '約束', boost: '応援', fund: '資金', counter: '先回り',
  endorse: '推薦', curse: '負い目', diet: '国会', home: '地元', party: '党',
};

// 任期の結果が返ってくるカード。約束ごとに「推薦」(e_約束)と「破った約束」(b_約束)を作る。数値は balance.js の comeback
Object.keys(Game.Data.PROMISES).forEach(function (pid) {
  const p = Game.Data.PROMISES[pid], CB = Game.Balance.comeback;
  Game.Data.CARDS['e_' + pid] = { name: p.org + 'の推薦', type: 'endorse', icon: 'promise' };
  Game.Balance.cards['e_' + pid] = { cost: CB.endorse.cost, money: CB.endorse.money, region: p.region, gain: CB.endorse.gain, once: true, endorse: pid };
  Game.Data.CARDS['b_' + pid] = { name: '破った約束', type: 'curse', icon: 'broken' };
  Game.Balance.cards['b_' + pid] = { cost: CB.curse.cost, money: CB.curse.money, once: true, curse: pid };
});

// 任期のカード(数値は balance.js の term.cards)
Game.Data.TERM_CARDS = {
  question: { name: '委員会質問', type: 'diet', icon: 'question' },
  bill:     { name: '議員立法', type: 'diet', icon: 'flyer' },
  local:    { name: '地元回り', type: 'home', icon: 'local' },
  report:   { name: '国政報告会', type: 'home', icon: 'talk' },
  party:    { name: '党の仕事', type: 'party', icon: 'party' },
  media:    { name: 'メディア出演', type: 'reach', icon: 'media' },
  fund:     { name: '資金パーティー', type: 'fund', icon: 'fund' },
  duty:     { name: '公務', type: 'party', icon: 'flyer' },
};
Game.Data.termCardText = function (id) {
  const b = Game.Balance.term.cards[id], CB = Game.Balance.comeback;
  if (b.promise) return { fx: '約束を1つ <em>+' + b.promise + '</em> 進める', note: '約束がなければ、党への貢献 +' + b.contrib };
  if (b.base) return { fx: '選んだ地区の地盤 <em>+' + b.base + '</em>', note: '地盤1につき、次の選挙の始まりの支持 +1' };
  if (b.baseAll) return { fx: '全地区の地盤 <em>+' + b.baseAll + '</em>', note: '地区を選ばずに使える' };
  if (b.contrib) return { fx: '党への貢献 <em>+' + b.contrib + '</em>', note: CB.starPer + 'たまるごとに、次の選挙で党幹部の応援が1枚増える' };
  return { fx: '資金 <em>+' + (-b.money) + '万円</em>', note: '次の選挙にも持ち込める' };
};

// 線画のアイコン(viewBox 0 0 24 24)
Game.Data.ICONS = {
  speech: '<path d="M3 10v4h3l6 4V6L6 10H3z"/><path d="M15.5 9a4 4 0 010 6M18 6.5a8 8 0 010 11"/>',
  door: '<rect x="6" y="3" width="12" height="18" rx="1"/><circle cx="14.5" cy="12" r="1"/>',
  talk: '<path d="M4 5h13v9H9l-4 3.5V14H4z"/><path d="M17 9h3v8h-1.5v2.5L16 17h-4"/>',
  rally: '<path d="M5 21V4M5 4h12l-2.5 4 2.5 4H5"/>',
  flyer: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h5"/>',
  sns: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  fund: '<circle cx="12" cy="12" r="8.5"/><path d="M9 8l3 4 3-4M12 12v5M9 13h6"/>',
  ahead: '<path d="M4 12h13M12 6l6 6-6 6"/><path d="M20 5v14"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.2 6-5.5-3-5.5 3 1.2-6L3.2 9.4l6.1-.8z"/>',
  promise: '<circle cx="12" cy="9.5" r="6"/><path d="M8.5 14.5L7 21l5-3 5 3-1.5-6.5"/>',
  shield: '<path d="M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6z"/>',
  broken: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5l-2 5 4 3-3.5 4 1.5 5"/>',
  question: '<rect x="9" y="3" width="6" height="10" rx="3"/><path d="M6 11a6 6 0 0012 0M12 17v4M8 21h8"/>',
  local: '<path d="M12 21s-6-6.2-6-11a6 6 0 0112 0c0 4.8-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
  party: '<path d="M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10M3 10l9-6 9 6"/>',
  media: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 21h8M9 3l3 3 3-3"/>',
  undo: '<path d="M9 7L4 12l5 5"/><path d="M4 12h10a5 5 0 010 10h-2"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
};

// カードの説明文(効果の1行と補足の1行)。画面と自動プレイの両方から使えるように DOM には触らない
Game.Data.cardText = function (id) {
  const b = Game.Balance.cards[id];
  const T = Game.Data.TAGS;
  const em = function (n) { return '<em>' + (n > 0 ? '+' : '') + n + '</em>'; };
  let fx = '', note = '';
  if (b.curse) {
    fx = Game.Data.PROMISES[b.curse].org + 'の不信。手札をふさぐ';
    note = '体力' + b.cost + 'で謝りに行くと、この選挙のあいだ取り除ける';
  } else if (b.endorse) {
    fx = Game.Data.REGION[b.region].name + 'の支持 ' + em(b.gain);
    note = '約束を守ったお返し。この選挙で1回だけ';
  } else if (b.promise) {
    const p = Game.Data.PROMISES[b.promise];
    fx = Game.Data.REGION[b.region].name + 'の支持 ' + em(b.gain);
    note = '約束「' + p.policy + '」を背負う';
  } else if (b.all) {
    fx = Object.keys(b.all).map(function (t) { return T[t] + 'の地区 ' + em(b.all[t]); }).join('、');
    note = '地区を選ばずに使える';
  } else if (b.gain) {
    fx = '選んだ地区の支持 ' + em(b.gain);
    const bonus = Object.keys(b.tagBonus || {}).map(function (t) { return T[t]; });
    if (bonus.length) note = bonus.join('・') + 'なら +' + (b.gain + b.tagBonus[Object.keys(b.tagBonus)[0]]);
    if (b.shield) note += (note ? '。' : '') + '固い票がつく';
    if (b.block) note = 'その地区の相手の今日の動きを止める';
    if (b.once) note = 'この選挙で1回だけ';
    if (!note) note = 'どの地区でも同じだけ効く';
  } else if (b.money < 0) {
    fx = '資金 <em>+' + (-b.money) + '万円</em>';
    note = '支援者に頭を下げる';
  }
  return { fx: fx, note: note };
};
