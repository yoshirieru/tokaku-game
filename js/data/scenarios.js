// 史実シナリオ(R17)。実際にあった選挙の局面を、架空の3党に置きかえて始める。実在の政党・政治家の名前は出さない(model は、モデルにした出来事の年と呼び名だけ)。
// 進め方は js/engine/scenario.js。数値の調整は balance.js の scenario。
//   party   プレイヤーが党首を務める党 / gov 政権({ role: 'pm' | 'opposition', pm, partner })/ approval 内閣支持率
//   seats   選挙前勢力(衆議院 465)/ upper 参議院の議席(248)
//   start   'campaign' いきなり総選挙 / 'term' 党首の任期の途中(turn 会期目)から
//   swing   最初の総選挙だけの、党ごとの始まりの支持の上げ下げ(all は全ブロック、ほかはブロックの性格ごと。balance.js の scenario.swingScale 倍)
//   goals   目標。type: majority 単独過半数 / seats n 議席以上 / first 第1党 / noMajority party の単独過半数を阻む / notRuling party を政権から外す / inGov 政権に入る / pm 首相
//   history モデルにした選挙で、実際にはどうなったか(党名・人名は出さない)
window.Game = window.Game || {};
Game.Data = Game.Data || {};

Game.Data.SCENARIOS = [
  {
    id: 'rainbow', year: 1993, title: '非民政連立', model: '1993年の連立政権の誕生', party: 'mirai',
    gov: { role: 'opposition', pm: 'minsei', partner: null }, approval: 30,
    seats: { minsei: 222, kyowa: 150, mirai: 93 }, upper: { minsei: 112, kyowa: 92, mirai: 44 },
    start: 'campaign',
    lead: '政治とカネの事件が相次ぎ、民政から多くの議員が離党した。内閣不信任案が可決され、衆議院は解散。改革を掲げる未来に風が吹いている。民政が過半数を割れば、連立の組み方しだいで政権が動く。',
    role: '未来の代表(第3党)',
    swing: { minsei: { all: -1, org: -1 }, mirai: { urban: 2, youth: 2 } },
    goals: [{ type: 'seats', n: 130, text: '130議席以上に伸ばす' }, { type: 'notRuling', party: 'minsei', text: '民政を政権から外す' }, { type: 'pm', text: '首相になる' }],
    history: 'モデルにした選挙では、第1党が過半数を割り、7党1会派の連立で、第5党の党首が首相に担がれた。38年続いた一党の政権が終わった。',
  },
  {
    id: 'reform', year: 2005, title: '改革解散', model: '2005年の「郵政解散」', party: 'minsei',
    gov: { role: 'pm', pm: 'minsei', partner: null }, approval: 48,
    seats: { minsei: 212, kyowa: 177, mirai: 76 }, upper: { minsei: 116, kyowa: 88, mirai: 44 },
    start: 'campaign',
    lead: '首相が命運をかけた改革法案が、与党からの造反で参議院に否決された。首相は衆議院を解散し、反対した議員を公認せず、その選挙区に「刺客」を送ると決めた。党の組織票は割れるが、改革の訴えは都市の浮動票に届くかもしれない。',
    role: '民政の総裁・首相',
    swing: { minsei: { all: 1, urban: 6, float: 5, org: -2 } },
    goals: [{ type: 'majority', text: '単独過半数(233議席)を取る' }, { type: 'seats', n: 280, text: '280議席以上の大勝' }],
    history: 'モデルにした選挙では、首相の党が単独で300に迫る議席を得る歴史的な大勝となり、改革法案はその後に成立した。',
  },
  {
    id: 'change', year: 2009, title: '政権交代', model: '2009年の「政権交代選挙」', party: 'kyowa',
    gov: { role: 'opposition', pm: 'minsei', partner: null }, approval: 24,
    seats: { minsei: 270, kyowa: 130, mirai: 65 }, upper: { minsei: 100, kyowa: 108, mirai: 40 },
    start: 'campaign',
    lead: '長く続いた民政の政権に、国民の不満がたまっている。内閣支持率は2割台。参議院では野党が多数を握り、法案は止まったまま。任期満了の総選挙で、政権交代を問う。',
    role: '共和の代表(野党第1党)',
    swing: { kyowa: { all: 4, float: 2 }, minsei: { all: -2 } },
    goals: [{ type: 'first', text: '第1党になる' }, { type: 'majority', text: '単独過半数(233議席)で政権交代' }],
    history: 'モデルにした選挙では、野党第1党が300を超える議席を得て、戦後初めての本格的な政権交代が起きた。',
  },
  {
    id: 'split', year: 2012, title: '分裂と「近いうち解散」', model: '2012年の衆議院解散', party: 'kyowa',
    gov: { role: 'pm', pm: 'kyowa', partner: 'mirai', sat: 34 }, approval: 22,
    seats: { kyowa: 200, minsei: 180, mirai: 85 }, upper: { minsei: 132, kyowa: 80, mirai: 36 },
    start: 'term', turn: 7,
    lead: '政権交代から3年。消費税の増税をめぐって党は割れ、多くの議員が離党した。内閣支持率は2割台に沈み、参議院は野党が多数(ねじれ国会)。「近いうちに国民の信を問う」と約束した首相に残された会期は、あと2つ。',
    role: '共和の代表・首相(未来と連立)',
    swing: { kyowa: { all: -3, union: -1 } },
    goals: [{ type: 'first', text: '第1党を守る' }, { type: 'inGov', text: '政権に残る(首相か連立与党)' }, { type: 'seats', n: 150, text: '150議席以上を守る' }],
    history: 'モデルにした選挙では、与党は解散前の4分の1ほどに議席を減らす大敗を喫し、政権を失った。',
  },
];
