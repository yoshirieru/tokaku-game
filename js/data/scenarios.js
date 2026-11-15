// 史実シナリオ(R17)。実際にあった総選挙の局面から、党首として始める。このモードだけ、実在の政党と党首を実名で出す(names)。
// 実在の人物・政党は、公開された事実(役職・選挙の結果)でだけ描く。失言・不祥事・裏金の出来事は起こさない(campaign.js・career.js・scandal.js が state.scenario を見て止める)。
// 議席は、その時期の主な3党の争いに置きかえた目安(ほかの党は、近い党にまとめた)。進め方は js/engine/scenario.js、数値の調整は balance.js の scenario。
//   names   ゲームの3つの党の枠(minsei / kyowa / mirai)に入れる、その時期の政党と党首 / person プレイヤーが立つ党首(名前の欄のはじめの値)
//   gov     政権({ role: 'pm' | 'opposition', pm, partner })/ approval 内閣支持率 / seats 選挙前勢力(465)/ upper 参議院(248)
//   start   'campaign' いきなり総選挙 / 'term' 党首の任期の途中(turn 会期目)から
//   swing   最初の総選挙だけの、党ごとの始まりの支持の上げ下げ(all は全ブロック、ほかはブロックの性格ごと)
//   goals   目標。type: majority 単独過半数 / seats n 議席以上 / first 第1党 / noMajority party の単独過半数を阻む / notRuling party を政権から外す / inGov 政権に入る / pm 首相
//   history 実際の選挙の結末
window.Game = window.Game || {};
Game.Data = Game.Data || {};

Game.Data.SCENARIOS = [
  {
    id: 'rainbow', year: 1993, title: '非自民連立', model: '1993年 第40回衆議院議員総選挙', party: 'mirai', person: '細川 護熙',
    names: {
      minsei: { name: '自由民主党', short: '自民', leader: '宮澤 喜一', title: '総裁' },
      kyowa: { name: '日本社会党', short: '社会', leader: '山花 貞夫', title: '委員長' },
      mirai: { name: '日本新党', short: '日本新', leader: '細川 護熙', title: '代表' },
    },
    gov: { role: 'opposition', pm: 'minsei', partner: null }, approval: 30,
    seats: { minsei: 222, kyowa: 150, mirai: 93 }, upper: { minsei: 112, kyowa: 92, mirai: 44 },
    start: 'campaign',
    lead: '政治改革をめぐって自民党が割れ、宮澤内閣への不信任案が可決された。自民党を離れた議員たちは新党を結成し、衆議院は解散。結党から1年あまりの日本新党に、改革の風が吹いている。自民党が過半数を割れば、連立の組み方しだいで政権が動く。',
    role: '日本新党の代表',
    swing: { minsei: { all: -1, org: -1 }, mirai: { urban: 2, youth: 2 } },
    goals: [{ type: 'seats', n: 130, text: '130議席以上に伸ばす' }, { type: 'notRuling', party: 'minsei', text: '自民党を政権から外す' }, { type: 'pm', text: '首相になる' }],
    history: '自民党は223議席で第1党を守ったものの過半数に届かず、日本新党の細川護熙を首相とする非自民・非共産の8党派による連立政権が生まれた。38年続いた自民党の政権が、ここで途切れた。',
  },
  {
    id: 'reform', year: 2005, title: '郵政解散', model: '2005年 第44回衆議院議員総選挙', party: 'minsei', person: '小泉 純一郎',
    names: {
      minsei: { name: '自由民主党', short: '自民', leader: '小泉 純一郎', title: '総裁' },
      kyowa: { name: '民主党', short: '民主', leader: '岡田 克也', title: '代表' },
      mirai: { name: '公明党', short: '公明', leader: '神崎 武法', title: '代表' },
    },
    gov: { role: 'pm', pm: 'minsei', partner: 'mirai', sat: 60 }, approval: 48,
    seats: { minsei: 212, kyowa: 177, mirai: 76 }, upper: { minsei: 112, kyowa: 84, mirai: 52 },
    start: 'campaign',
    lead: '郵政民営化法案が、自民党からの造反で参議院に否決された。小泉純一郎首相は衆議院を解散し、反対した議員を公認せず、その選挙区に「刺客」を立てると決めた。党の組織票は割れるが、改革の訴えは都市の浮動票に届くかもしれない。',
    role: '自民党総裁・首相(公明党と連立)',
    swing: { minsei: { all: 1, urban: 6, float: 5, org: -2 } },
    goals: [{ type: 'majority', text: '単独過半数(233議席)を取る' }, { type: 'seats', n: 280, text: '280議席以上の大勝' }],
    history: '自民党は296議席を得る歴史的な大勝となり、郵政民営化法案はその後の特別国会で成立した。',
  },
  {
    id: 'change', year: 2009, title: '政権交代', model: '2009年 第45回衆議院議員総選挙', party: 'kyowa', person: '鳩山 由紀夫',
    names: {
      minsei: { name: '自由民主党', short: '自民', leader: '麻生 太郎', title: '総裁' },
      kyowa: { name: '民主党', short: '民主', leader: '鳩山 由紀夫', title: '代表' },
      mirai: { name: '公明党', short: '公明', leader: '太田 昭宏', title: '代表' },
    },
    gov: { role: 'opposition', pm: 'minsei', partner: 'mirai' }, approval: 24,
    seats: { minsei: 270, kyowa: 130, mirai: 65 }, upper: { minsei: 80, kyowa: 128, mirai: 40 },
    start: 'campaign',
    lead: '自民党の政権に国民の不満がたまり、麻生内閣の支持率は低迷している。参議院では2007年の参院選から野党が多数を握る(ねじれ国会)。任期満了が迫るなか、衆議院は解散された。政権交代が問われる選挙だ。',
    role: '民主党の代表(野党第1党)',
    swing: { kyowa: { all: 4, float: 2 }, minsei: { all: -2 } },
    goals: [{ type: 'first', text: '第1党になる' }, { type: 'majority', text: '単独過半数(233議席)で政権交代' }],
    history: '民主党が308議席を得て圧勝し、鳩山由紀夫を首相とする民主党・社民党・国民新党の連立政権が生まれた。',
  },
  {
    id: 'split', year: 2012, title: '「近いうち」解散', model: '2012年 第46回衆議院議員総選挙', party: 'kyowa', person: '野田 佳彦',
    names: {
      minsei: { name: '自由民主党', short: '自民', leader: '安倍 晋三', title: '総裁' },
      kyowa: { name: '民主党', short: '民主', leader: '野田 佳彦', title: '代表' },
      mirai: { name: '日本維新の会', short: '維新', leader: '石原 慎太郎', title: '代表' },
    },
    gov: { role: 'pm', pm: 'kyowa', partner: null }, approval: 22,
    seats: { kyowa: 200, minsei: 180, mirai: 85 }, upper: { minsei: 132, kyowa: 88, mirai: 28 },
    start: 'term', turn: 7,
    lead: '政権交代から3年。消費税の増税をめぐって民主党は割れ、多くの議員が離党した。参議院は野党が多数(ねじれ国会)。野田佳彦首相は「近いうちに国民の信を問う」と約束している。任期満了まで、残された会期は2つ。',
    role: '民主党の代表・首相',
    swing: { kyowa: { all: -3, union: -1 } },
    goals: [{ type: 'first', text: '第1党を守る' }, { type: 'inGov', text: '政権に残る(首相か連立与党)' }, { type: 'seats', n: 150, text: '150議席以上を守る' }],
    history: '自民党が294議席を得て政権に戻り、民主党は57議席に激減した。安倍晋三が再び首相になった。',
  },
];

// シナリオの実名を、ゲームの3つの党の枠と党首に入れる。sc が null なら元の架空の名前に戻す
(function () {
  let saved = null;
  Game.Data.applyScenarioNames = function (sc) {
    const P = Game.Data.PARTIES, L = Game.Data.LEADERS;
    if (!saved) {
      saved = {};
      Object.keys(P).forEach(function (k) { saved[k] = { name: P[k].name, short: P[k].short, leader: Object.assign({}, L[k]) }; });
    }
    Object.keys(saved).forEach(function (k) {
      const n = sc && sc.names && sc.names[k];
      P[k].name = n ? n.name : saved[k].name;
      P[k].short = n ? n.short : saved[k].short;
      L[k] = n ? { name: n.leader, short: n.leader.split(/[ 　]/)[0], title: n.title } : Object.assign({}, saved[k].leader);
    });
  };
})();
