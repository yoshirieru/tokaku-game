// 党内の派閥(すべて架空)。主要3党に3つずつ。
// 0番・1番の派閥の長は党首選のライバル(parties.js の LEADER_RIVALS と同じ人物)。2番は党首選に出ない長老が率いる「キングメーカー」。
// share:党の議員に占める割合。style:loyal(義理堅い)| hard(頑固)| opportunist(風見鶏。寝返りやすい)。policy:派閥が大事にする政策
// 数値の効き方は balance.js の Game.Balance.faction。
window.Game = window.Game || {};
Game.Data = Game.Data || {};

Game.Data.FACTIONS = {
  minsei: [
    { id: 'shiraishi', name: '白石派', boss: '白石 隆之', title: '幹事長', share: 0.38, style: 'hard', policy: 'growth',
      desc: '党内最大派閥。幹事長の白石が率い、選挙と資金を握る。' },
    { id: 'onuki', name: '大貫グループ', boss: '大貫 恵子', title: '元外務大臣', share: 0.27, style: 'loyal', policy: 'peace',
      desc: '外交通の大貫を慕う中堅・若手の集まり。結束が固い。' },
    { id: 'miyanohara', name: '宮之原派', boss: '宮之原 弥三郎', title: '元衆議院議長', share: 0.35, style: 'opportunist', policy: 'agri',
      desc: '長老の宮之原が率いる老舗派閥。自分は党首選に出ず、勝ち馬に乗る「キングメーカー」。' },
  ],
  kyowa: [
    { id: 'makabe', name: '真壁グループ', boss: '真壁 透', title: '代表代行', share: 0.4, style: 'hard', policy: 'welfare',
      desc: '党の主流を担う最大グループ。代表代行の真壁が束ねる。' },
    { id: 'odagiri', name: '小田切グループ', boss: '小田切 紗英', title: '政調会長', share: 0.3, style: 'loyal', policy: 'education',
      desc: '政策通の小田切を中心とする若手中心のグループ。' },
    { id: 'iwaki', name: '連帯の会', boss: '岩城 鉄男', title: '元労働大臣', share: 0.3, style: 'opportunist', policy: 'wage',
      desc: '労働組合の出身者が多い古参の会。長老の岩城が党首選の行方を左右する。' },
  ],
  mirai: [
    { id: 'sawatari', name: '沢渡派', boss: '沢渡 健吾', title: '共同代表', share: 0.45, style: 'hard', policy: 'deregulation',
      desc: '結党メンバーの沢渡が率いる最大勢力。改革の旗を掲げる。' },
    { id: 'hinata', name: '日向グループ', boss: '日向 杏奈', title: '幹事長', share: 0.35, style: 'loyal', policy: 'education',
      desc: '幹事長の日向を中心に、地方議員出身者が集まる。' },
    { id: 'saotome', name: '改革フォーラム', boss: '早乙女 理', title: '元党代表', share: 0.2, style: 'opportunist', policy: 'taxcut',
      desc: '初代代表の早乙女が率いる古参の集まり。数は少ないが、党首選では決め手になる。' },
  ],
};
// 最初の主流派(いまの執行部を支える派閥の番号)
Game.Data.FACTION_MAINSTREAM = [0, 2];
Game.Data.FACTION_STYLE_LABEL = { loyal: '義理堅い', hard: '頑固', opportunist: '風見鶏' };
