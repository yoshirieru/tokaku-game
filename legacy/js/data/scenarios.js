// 史実シナリオ(M19)。実際に日本で起きた政局を、実名の政党で遊ぶ。
// - 政党は実名。プレイヤーは史実の人物の立場に立つ(名前はプレイヤーが決める。既定は空欄)
// - 実在の政治家は、公開されている事実(役職・結果)でだけ登場させる。不祥事・失言のイベントは起こさない
//   (政党はすべて real: true。論戦で相手の失言も出さない)。スキャンダルはプレイヤーの側だけ
// - 議席数:選挙の結果は公表された数字。選挙と選挙のあいだの勢力(解散時など)は、
//   直近の選挙結果に離党・合流を反映した目安(note に書いて画面に出す)
// - 数値(支持率の強さ・前向き度の加減など)はこのファイルのシナリオごとの設定と balance.js の scenario
window.Game = window.Game || {};
Game.Data = Game.Data || {};

// 衆議院・参議院の制度(時代ごと)。smd は小選挙区(中選挙区の時代は全議席)、pr は比例
Game.Data.ERAS = {
  now:   { label: '小選挙区比例代表並立制(465)', house: 465, majority: 233, system: 'mixed', smd: 289, pr: 176, upper: { seats: 248, majority: 125, pr: 50, district: 74 } },
  s1955: { label: '中選挙区制(467)', house: 467, majority: 234, system: 'mmd', smd: 467, pr: 0, upper: { seats: 250, majority: 126, pr: 50, district: 75 } },
  s1993: { label: '中選挙区制(511)', house: 511, majority: 256, system: 'mmd', smd: 511, pr: 0, upper: { seats: 252, majority: 127, pr: 50, district: 76 } },
  s1996: { label: '小選挙区比例代表並立制(500)', house: 500, majority: 251, system: 'mixed', smd: 300, pr: 200, upper: { seats: 252, majority: 127, pr: 50, district: 76 } },
  s2005: { label: '小選挙区比例代表並立制(480)', house: 480, majority: 241, system: 'mixed', smd: 300, pr: 180, upper: { seats: 242, majority: 122, pr: 48, district: 73 } },
};

// 党の共通の既定値(シナリオの parties で上書きする)
// support:全国での強さ(支持率に近い目安)、cov:小選挙区(中選挙区)に候補を立てる割合、org:組織票の強さ
Game.Data.SCENARIO_PARTY_DEFAULTS = { support: 3, lean: {}, org: 0.2, orgLean: {}, cov: 0.3, platform: [], backers: [] };

// 1994年末〜1996年の再編(1993年・1994年のシナリオで共通)。プレイヤーの党が加わる合流は起こさない(自分で交渉する)
Game.Data.SCENARIO_EVENTS_1994 = [
  { year: 1994, turn: 3, type: 'aiMerge', parts: ['shinsei', 'komeito', 'jnp', 'dsp'], id: 'shinshin', name: '新進党', short: '新進', color: '#1f6fb2', leader: '海部 俊樹', support: 28, text: '新生党・公明党(衆議院議員など)・日本新党・民社党などが合流し、新進党が生まれた(党首 海部俊樹)。' },
  { year: 1996, turn: 0, type: 'rename', party: 'jsp', name: '社会民主党', short: '社民', support: 7, text: '日本社会党が党名を社会民主党に改めた。' },
  { year: 1996, turn: 2, type: 'newParty', id: 'minshu96', from: { jsp: 30, sakigake: 12, indep: 3 }, leader: '鳩山 由紀夫・菅 直人', text: '社会民主党・新党さきがけの議員らが合流し、民主党が生まれた(鳩山由紀夫・菅直人の共同代表)。' },
];

Game.Data.SCENARIOS = [
  // ------------------------------------------------------------------
  {
    id: 's1955', year: 1955, turnIndex: 0, era: 's1955',
    title: '1955 保守合同', subtitle: '二つの保守党は一つになれるか',
    briefing: [
      '1955年2月27日の総選挙。日本民主党が185議席で第1党になったが、過半数(234)には届かない。自由党は112議席、左右に分かれた社会党は合わせて156議席。',
      '社会党は再統一に動いている。保守が分かれたままでは、いずれ社会党に政権を奪われる。財界は保守の合同を強く求めている。',
    ],
    history: '1955年10月に左右の社会党が再統一し、11月15日に日本民主党と自由党が合同して自由民主党が誕生した(衆議院299議席)。「55年体制」の始まり。1958年5月の総選挙は自民党287、社会党166。',
    note: '衆議院は1955年2月の総選挙の結果。参議院は1953年の選挙をもとにした目安。選挙は中選挙区制を簡易計算で再現する。',
    seats: { jdp: 185, lib: 112, lsp: 89, rsp: 67, rono: 4, jcp: 2, indep: 8 },
    upper: { A: { lib: 46, jdp: 11, lsp: 20, rsp: 13, ryokufu: 17, indep: 18 }, B: { lib: 47, jdp: 11, lsp: 20, rsp: 13, ryokufu: 17, indep: 17 }, nextClass: 'A', nextYear: 1956 },
    gov: { pmParty: 'jdp', coalition: ['jdp'] },
    leaders: { jdp: '鳩山 一郎', lib: '緒方 竹虎', lsp: '鈴木 茂三郎', rsp: '河上 丈太郎', jcp: '野坂 参三', rono: '黒田 寿男' },
    approval: 50, termElapsed: 0, econ: { growth: 5.5, prices: 1.5, fiscal: 60, life: 45, security: 45 }, econTrend: { growth: 5.0, prices: 2.0 },
    noSns: true, noKofuku: true,
    parties: {
      jdp: { name: '日本民主党', short: '民主', color: '#2e8b57', position: '鳩山一郎が率いる保守政党', platform: ['constitution', 'defense', 'growth'], backers: ['business', 'farm'], support: 24, lean: { farm: 0.3, elderly: 0.3 }, org: 0.4, orgLean: { farm: 0.4 }, cov: 0.8 },
      lib: { name: '自由党', short: '自由', color: '#c8323c', position: '吉田茂の流れをくむ保守政党', platform: ['growth', 'agri', 'deregulation'], backers: ['business', 'farm'], support: 17, lean: { farm: 0.4, elderly: 0.3 }, org: 0.4, orgLean: { farm: 0.5 }, cov: 0.6 },
      lsp: { name: '左派社会党', short: '左社', color: '#d0458e', position: '社会党の左派', platform: ['peace', 'wage', 'welfare'], backers: ['union'], support: 13, lean: { industry: 0.5, urban: 0.3 }, org: 0.35, orgLean: { industry: 0.6 }, cov: 0.45 },
      rsp: { name: '右派社会党', short: '右社', color: '#e57399', position: '社会党の右派', platform: ['wage', 'employment', 'welfare'], backers: ['union'], support: 11, lean: { industry: 0.4, urban: 0.3 }, org: 0.3, orgLean: { industry: 0.5 }, cov: 0.4 },
      jcp: { name: '日本共産党', short: '共産', color: '#8b1e3f', position: '共産主義の政党', platform: ['peace', 'wage'], support: 1.6, lean: { urban: 0.4 }, org: 0.15, cov: 0.4 },
      rono: { name: '労働者農民党', short: '労農', color: '#ad1457', position: '左派の小政党', platform: ['peace', 'agri'], support: 0.8, cov: 0.03 },
      ryokufu: { name: '緑風会', short: '緑風', color: '#9ccc65', position: '参議院の会派', platform: ['tradition'], support: 0.5, cov: 0 },
    },
    roles: [
      { party: 'jdp', title: '日本民主党総裁・内閣総理大臣', historical: '鳩山 一郎', wins: 10, intro: '少数与党の首相として政権を運営しながら、自由党との合同をまとめる。', goals: [{ type: 'merged', arg: 'lib', label: '自由党と合流する(保守合同)' }, { type: 'majority', label: '次の総選挙で過半数(234)を取る' }] },
      { party: 'lsp', title: '左派社会党委員長', historical: '鈴木 茂三郎', wins: 7, intro: '右派社会党との再統一をまとめ、分かれた保守から政権を奪う。', goals: [{ type: 'merged', arg: 'rsp', label: '右派社会党と再統一する' }, { type: 'firstParty', label: '次の総選挙で第1党になる' }] },
    ],
    events: [
      { year: 1955, turn: 2, type: 'aiMerge', a: 'lsp', b: 'rsp', id: 'jsp', name: '日本社会党', short: '社会', color: '#d0458e', leader: '鈴木 茂三郎', support: 24, text: '左右の社会党が再統一し、日本社会党が生まれた(委員長 鈴木茂三郎)。' },
      { year: 1955, turn: 3, type: 'aiMerge', a: 'jdp', b: 'lib', id: 'ldp', name: '自由民主党', short: '自民', color: '#c8323c', leader: '鳩山 一郎', support: 40, text: '日本民主党と自由党が合同し、自由民主党が生まれた(保守合同)。' },
    ],
    mergeBonus: { jdp: { lib: 25 }, lib: { jdp: 25 }, lsp: { rsp: 25 }, rsp: { lsp: 25 } },
    end: { elections: 1, maxYear: 1959 },
  },
  // ------------------------------------------------------------------
  {
    id: 's1993', year: 1993, turnIndex: 1, era: 's1993', start: 'coalition',
    title: '1993 非自民連立', subtitle: '38年続いた自民党政権を終わらせる',
    briefing: [
      '1993年6月、政治改革をめぐって宮沢内閣の不信任案が可決された。自民党から新生党・新党さきがけが飛び出し、7月18日の総選挙で自民党は223議席にとどまって過半数(256)を割った。',
      '結党1年あまりの日本新党は35議席。社会・新生・公明・民社・さきがけ・社民連と組めば、自民党を野党に追いやれる。首班指名をめぐる連立交渉が始まる。',
    ],
    history: '日本新党の細川護熙を首相とする8党派の連立政権が8月に発足し、38年続いた自民党政権が終わった。1994年1月に小選挙区比例代表並立制を入れる政治改革関連法が成立。細川内閣は1994年4月に退陣した。',
    note: '衆議院は1993年7月の総選挙の結果(無所属のうち非自民系を15人と見た目安を含む)。参議院は1992年の選挙をもとにした目安。1995年以降の総選挙は小選挙区比例代表並立制(500議席)。',
    seats: { ldp: 223, jsp: 70, shinsei: 55, komeito: 51, jnp: 35, jcp: 15, dsp: 15, sakigake: 13, shaminren: 4, mushoNon: 15, indep: 15 },
    upper: { A: { ldp: 50, shinsei: 4, jsp: 35, komeito: 12, jcp: 5, rengo: 6, dsp: 3, jnp: 2, indep: 9 }, B: { ldp: 49, shinsei: 4, jsp: 36, komeito: 12, jcp: 6, rengo: 5, dsp: 4, jnp: 2, indep: 8 }, nextClass: 'A', nextYear: 1995 },
    gov: { pmParty: 'ldp', coalition: ['ldp'] },
    leaders: { ldp: '河野 洋平', jsp: '山花 貞夫', shinsei: '羽田 孜', komeito: '石田 幸四郎', jnp: '細川 護熙', jcp: '不破 哲三', dsp: '大内 啓伍', sakigake: '武村 正義', shaminren: '江田 五月' },
    pmName: '宮沢 喜一',
    approval: 30, termElapsed: 0, econ: { growth: 0.3, prices: 1.2, fiscal: 50, life: 50, security: 50 }, econTrend: { growth: 1.0, prices: 1.0 },
    noSns: true, noKofuku: true, nextEra: { era: 's1996', fromYear: 1995 },
    parties: {
      ldp: { name: '自由民主党', short: '自民', color: '#c8323c', position: '38年政権を担ってきた保守政党', platform: ['growth', 'agri', 'constitution'], backers: ['farm', 'business', 'shinseiren'], support: 33, lean: { farm: 0.5, elderly: 0.4 }, org: 0.5, orgLean: { farm: 0.6 }, cov: 0.6 },
      jsp: { name: '日本社会党', short: '社会', color: '#d0458e', position: '野党第一党', platform: ['peace', 'welfare', 'wage'], backers: ['union'], support: 14, lean: { industry: 0.4 }, org: 0.35, orgLean: { industry: 0.5 }, cov: 0.3 },
      shinsei: { name: '新生党', short: '新生', color: '#1f6fb2', position: '自民党を離れた羽田孜・小沢一郎らの新党', platform: ['deregulation', 'growth', 'defense'], support: 10, lean: { urban: 0.2 }, org: 0.2, cov: 0.15 },
      komeito: { support: 8, cov: 0.12 },
      jnp: { name: '日本新党', short: '日新', color: '#e2a400', position: '細川護熙が1992年に結成した新党', platform: ['deregulation', 'livelihood', 'education'], support: 8, lean: { urban: 0.6, youth: 0.5 }, org: 0.05, cov: 0.1 },
      jcp: { name: '日本共産党', short: '共産', color: '#8b1e3f', position: '共産主義の政党', platform: ['peace', 'wage'], support: 6, lean: { urban: 0.4 }, org: 0.25, cov: 0.25 },
      dsp: { name: '民社党', short: '民社', color: '#5a6fd6', position: '中道の政党', platform: ['employment', 'wage', 'defense'], backers: ['union'], support: 3.5, lean: { industry: 0.5 }, org: 0.25, cov: 0.06 },
      sakigake: { name: '新党さきがけ', short: 'さき', color: '#2e9e6a', position: '自民党を離れた武村正義らの新党', platform: ['peace', 'deregulation', 'education'], support: 3, lean: { urban: 0.3 }, cov: 0.03 },
      shaminren: { name: '社会民主連合', short: '社民連', color: '#7cb342', position: '社会民主主義の小政党', platform: ['welfare', 'peace'], support: 0.8, cov: 0.01 },
      mushoNon: { name: '無所属(非自民系)', short: '無非', color: '#90a4ae', position: '非自民の無所属議員', platform: ['livelihood'], support: 0.5, cov: 0.02 },
      rengo: { name: '民主改革連合', short: '民改', color: '#5c6bc0', position: '参議院の会派', platform: ['wage'], support: 0.5, cov: 0 },
      minshu96: { name: '民主党', short: '民主', color: '#e65100', position: '社民党・さきがけの議員らが作った新党', platform: ['livelihood', 'welfare', 'deregulation'], support: 12, lean: { urban: 0.5 }, cov: 0.45 },
    },
    roles: [
      { party: 'jnp', title: '日本新党代表', historical: '細川 護熙', wins: 1, intro: '35議席の第5党から、非自民の連立をまとめて首相をめざす。', goals: [{ type: 'becamePM', label: '首班指名を受けて首相になる' }, { type: 'pmTurns', arg: 4, label: '首相として1年(4ターン)政権を保つ' }] },
      { party: 'ldp', title: '自由民主党総裁', historical: '河野 洋平', wins: 9, intro: '過半数を割った第1党。8党派は自民党と組まないと合意している。野党として連立の綻びを突き、政権に戻る道を探る。', goals: [{ type: 'ruling', label: '政権に戻る(与党になる)' }, { type: 'becamePM', label: '首相の座を取り戻す' }] },
    ],
    events: [
      { year: 1994, turn: 0, type: 'reformBill' },
    ].concat(Game.Data.SCENARIO_EVENTS_1994),
    // 連立交渉の前向き度の加減:プレイヤーの党 → 相手の党(all はそれ以外のすべて)→ 加減
    formationBonus: { jnp: { all: 30, ldp: -40, jcp: -30 }, ldp: { all: -70, jcp: -90 } },   // 8党派は自民党と組まないと合意していた
    // 自民党が連立を組めなければ、史実どおり8党派の細川内閣ができる
    altGov: { ldp: { pmParty: 'jnp', coalition: ['jnp', 'jsp', 'shinsei', 'komeito', 'dsp', 'sakigake', 'shaminren', 'mushoNon'], pmName: '細川 護熙' } },
    end: { elections: 1, maxYear: 1995 },
  },
  // ------------------------------------------------------------------
  {
    id: 's1994', year: 1994, turnIndex: 1, era: 's1993', start: 'coalition',
    title: '1994 自社さ連立', subtitle: '宿敵と組んで首相になる',
    briefing: [
      '1994年4月に細川首相が退陣し、羽田内閣が発足した。しかし新生党などが社会党抜きの統一会派を作ったことに社会党が反発して連立を離れ、羽田内閣は少数与党のまま6月に総辞職した。',
      '野党に転じて1年の自民党は、政権に戻るためなら社会党の委員長を首相に担ぐ構えを見せている。55年体制で争ってきた二つの党が手を組むのか。首班指名が迫る。',
    ],
    history: '自民・社会・さきがけの3党が社会党委員長の村山富市を首相に担ぎ、6月29日の首班指名で海部俊樹を破った。村山内閣は1996年1月に退陣し、自民党の橋本龍太郎が後を継いだ。1996年10月、初の小選挙区比例代表並立制の総選挙は自民党239議席。',
    note: '衆議院・参議院の議席は1993年総選挙・1992年参院選の結果をもとにした目安(1994年6月時点の会派の移動は反映していない)。次の総選挙は小選挙区比例代表並立制(500議席)。',
    seats: { ldp: 223, jsp: 70, shinsei: 55, komeito: 51, jnp: 35, jcp: 15, dsp: 15, sakigake: 13, shaminren: 4, mushoNon: 15, indep: 15 },
    upper: { A: { ldp: 50, shinsei: 4, jsp: 35, komeito: 12, jcp: 5, rengo: 6, dsp: 3, jnp: 2, indep: 9 }, B: { ldp: 49, shinsei: 4, jsp: 36, komeito: 12, jcp: 6, rengo: 5, dsp: 4, jnp: 2, indep: 8 }, nextClass: 'A', nextYear: 1995 },
    gov: { pmParty: 'shinsei', coalition: ['shinsei', 'komeito', 'jnp', 'dsp'] },
    leaders: { ldp: '河野 洋平', jsp: '村山 富市', shinsei: '羽田 孜', komeito: '石田 幸四郎', jnp: '細川 護熙', jcp: '不破 哲三', dsp: '大内 啓伍', sakigake: '武村 正義', shaminren: '江田 五月' },
    pmName: '羽田 孜',
    approval: 30, termElapsed: 4, econ: { growth: 0.8, prices: 0.7, fiscal: 48, life: 50, security: 50 }, econTrend: { growth: 1.2, prices: 0.5 },
    noSns: true, noKofuku: true, nextEra: { era: 's1996', fromYear: 1995 },
    parties: null,   // 1993年と同じ(下で埋める)
    roles: [
      { party: 'jsp', title: '日本社会党委員長', historical: '村山 富市', wins: 8, intro: '70議席の社会党から、自民党と組んで首相をめざす。もとの連立に戻る道もある。', goals: [{ type: 'becamePM', label: '首班指名を受けて首相になる' }, { type: 'pmUntilElection', label: '次の総選挙まで政権を保つ' }] },
      { party: 'ldp', title: '自由民主党総裁', historical: '河野 洋平', wins: 9, intro: '第1党の総裁として、どの党と組んで政権に戻るかを決める。', goals: [{ type: 'ruling', label: '政権に戻る(与党になる)' }, { type: 'firstParty', label: '次の総選挙で第1党になる' }] },
    ],
    events: Game.Data.SCENARIO_EVENTS_1994,
    formationBonus: { jsp: { ldp: 45, sakigake: 20, shinsei: -15, komeito: -10, jnp: -5, dsp: -5 }, ldp: { jsp: 10, sakigake: 15 } },
    end: { elections: 1, maxYear: 1997 },
  },
  // ------------------------------------------------------------------
  {
    id: 's2005', year: 2005, turnIndex: 1, era: 's2005', start: 'election',
    title: '2005 郵政解散', subtitle: '造反議員に刺客を送る',
    briefing: [
      '2005年8月8日、郵政民営化法案が参議院で否決された。衆議院の採決でも自民党から37人が反対に回っていた。小泉首相はその日のうちに衆議院を解散した。',
      '反対した議員は公認されず、自民党は彼らの選挙区に「刺客」を立てる。造反組の一部は国民新党を結成した。民主党は政権交代を訴える。',
    ],
    history: '9月11日の総選挙で自民党は296議席の大勝。自民・公明で3分の2を超え、郵政民営化法は10月に成立した。民主党は113議席に後退し、岡田代表は辞任した。',
    note: '議席は2003年総選挙の結果に、保守新党の合流と郵政造反(37人)を反映した目安。',
    seats: { ldp: 204, dpj: 177, komeito: 34, zohan: 33, kokuminshin: 4, jcp: 9, sdp: 6, indep: 13 },
    upper: { A: { ldp: 66, dpj: 32, komeito: 13, jcp: 5, sdp: 3, indep: 2 }, B: { ldp: 49, dpj: 50, komeito: 11, jcp: 4, sdp: 2, indep: 5 }, nextClass: 'A', nextYear: 2007 },
    gov: { pmParty: 'ldp', coalition: ['ldp', 'komeito'] },
    leaders: { ldp: '小泉 純一郎', dpj: '岡田 克也', komeito: '神崎 武法', jcp: '志位 和夫', sdp: '福島 瑞穂', kokuminshin: '綿貫 民輔' },
    approval: 47, termElapsed: 7, econ: { growth: 1.5, prices: -0.2, fiscal: 35, life: 48, security: 52 }, econTrend: { growth: 1.2, prices: 0.0 },
    noSns: true, noKofuku: true,
    parties: {
      ldp: { name: '自由民主党', short: '自民', color: '#c8323c', position: '小泉純一郎が率いる与党第一党', platform: ['deregulation', 'growth', 'defense'], backers: ['business', 'shinseiren'], support: 33, lean: { urban: 0.2, elderly: 0.3 }, org: 0.4, orgLean: { farm: 0.4 }, cov: 0.95 },
      dpj: { name: '民主党', short: '民主', color: '#1e5aa8', position: '政権交代をめざす野党第一党', platform: ['livelihood', 'welfare', 'education'], backers: ['union'], support: 25, lean: { urban: 0.4, industry: 0.3 }, org: 0.25, orgLean: { industry: 0.4 }, cov: 0.95 },
      komeito: { support: 9, cov: 0.03 },
      zohan: { name: '郵政造反組(無所属)', short: '造反', color: '#8d6e63', position: '郵政民営化に反対して公認されなかった議員', platform: ['agri', 'welfare'], support: 1.5, lean: { farm: 0.5, elderly: 0.4 }, org: 0.3, orgLean: { farm: 0.5 }, cov: 0.1 },
      kokuminshin: { name: '国民新党', short: '国新', color: '#7e57c2', position: '郵政民営化に反対した綿貫民輔・亀井静香らの新党', platform: ['agri', 'welfare'], support: 1.5, lean: { farm: 0.4 }, cov: 0.04 },
      jcp: { name: '日本共産党', short: '共産', color: '#8b1e3f', position: '共産主義の政党', platform: ['peace', 'wage'], support: 6, lean: { urban: 0.4 }, org: 0.25, cov: 0.9 },
      sdp: { name: '社会民主党', short: '社民', color: '#2aa198', position: '社会民主主義の政党', platform: ['peace', 'welfare'], backers: ['union'], support: 4, lean: { urban: 0.2 }, org: 0.1, cov: 0.12 },
    },
    roles: [
      { party: 'ldp', title: '自由民主党総裁・内閣総理大臣', historical: '小泉 純一郎', wins: 11, intro: '郵政民営化を問う総選挙。造反議員の選挙区に刺客を立て、民意を味方につける。', goals: [{ type: 'majority', label: '自民党単独で過半数(241)を取る' }, { type: 'pm', label: '総選挙のあとも首相を続ける' }] },
      { party: 'dpj', title: '民主党代表', historical: '岡田 克也', wins: 5, intro: '郵政一色の選挙で、年金や暮らしを訴えて政権交代をめざす。', goals: [{ type: 'firstParty', label: '第1党になる' }, { type: 'pm', label: '政権交代を果たして首相になる' }] },
    ],
    events: [],
    noCoopWith: ['zohan', 'kokuminshin'],
    formationBonus: { dpj: { komeito: -45 }, ldp: { komeito: 25 } },   // 公明党は1999年から自民党と連立   // 造反組は自民党と候補者調整をしない
    end: { elections: 1, maxYear: 2006 },
  },
  // ------------------------------------------------------------------
  {
    id: 's2007', year: 2007, turnIndex: 0, era: 's2005',
    title: '2007〜09 ねじれから政権交代', subtitle: '参議院を制する者が政権を制する',
    briefing: [
      '2007年。郵政選挙で大勝した自民党は衆議院に296議席を持つが、年金記録の問題などで安倍内閣の支持率は下がり続けている。夏には参院選がある。',
      '民主党の小沢代表は「生活が第一」を掲げて参院選に挑む。与党が参議院で過半数を割れば「ねじれ国会」。衆議院の任期は2009年9月まで。',
    ],
    history: '2007年7月の参院選で民主党は60議席を取って参議院第1党になり、ねじれ国会に。安倍・福田と首相が1年で交代し、麻生内閣のもとで2008年秋に金融危機が起きた。2009年8月30日の総選挙で民主党は308議席を取り、政権交代。鳩山由紀夫内閣が発足した。',
    note: '衆議院は2005年総選挙の結果。参議院は2004年参院選をもとにした目安。',
    seats: { ldp: 296, dpj: 113, komeito: 31, jcp: 9, sdp: 7, kokuminshin: 4, nippon: 1, indep: 19 },
    upper: { A: { ldp: 66, dpj: 32, komeito: 13, jcp: 5, sdp: 3, indep: 2 }, B: { ldp: 49, dpj: 50, komeito: 11, jcp: 4, sdp: 2, indep: 5 }, nextClass: 'A', nextYear: 2007 },
    gov: { pmParty: 'ldp', coalition: ['ldp', 'komeito'] },
    leaders: { ldp: '安倍 晋三', dpj: '小沢 一郎', komeito: '太田 昭宏', jcp: '志位 和夫', sdp: '福島 瑞穂', kokuminshin: '綿貫 民輔', nippon: '田中 康夫' },
    approval: 33, termElapsed: 6, econ: { growth: 1.6, prices: 0.1, fiscal: 33, life: 46, security: 52 }, econTrend: { growth: 1.0, prices: 0.2 },
    noSns: true, kofukuFrom: 2009,
    parties: {
      ldp: { name: '自由民主党', short: '自民', color: '#c8323c', position: '与党第一党', platform: ['growth', 'defense', 'constitution'], backers: ['business', 'farm', 'shinseiren'], support: 27, lean: { farm: 0.4, elderly: 0.3 }, org: 0.4, orgLean: { farm: 0.5 }, cov: 0.98 },
      dpj: { name: '民主党', short: '民主', color: '#1e5aa8', position: '「国民の生活が第一」を掲げる野党第一党', platform: ['livelihood', 'education', 'welfare'], backers: ['union'], support: 26, lean: { urban: 0.4, industry: 0.3 }, org: 0.25, orgLean: { industry: 0.4 }, cov: 0.9 },
      komeito: { support: 9, cov: 0.03 },
      jcp: { name: '日本共産党', short: '共産', color: '#8b1e3f', position: '共産主義の政党', platform: ['peace', 'wage'], support: 6, lean: { urban: 0.4 }, org: 0.25, cov: 0.8 },
      sdp: { name: '社会民主党', short: '社民', color: '#2aa198', position: '社会民主主義の政党', platform: ['peace', 'welfare'], backers: ['union'], support: 4, org: 0.1, cov: 0.12 },
      kokuminshin: { name: '国民新党', short: '国新', color: '#7e57c2', position: '郵政民営化の見直しを掲げる政党', platform: ['agri', 'welfare'], support: 1.5, lean: { farm: 0.4 }, cov: 0.03 },
      nippon: { name: '新党日本', short: '日本', color: '#ef6c00', position: '田中康夫が率いる小政党', platform: ['deregulation'], support: 0.8, cov: 0.01 },
    },
    roles: [
      { party: 'dpj', title: '民主党代表', historical: '小沢 一郎', wins: 13, intro: '参院選で与党を過半数割れに追い込み、総選挙で政権交代を果たす。', goals: [{ type: 'twisted', label: '参院選で与党を過半数割れに追い込む(ねじれ)' }, { type: 'pm', label: '総選挙で政権交代を果たして首相になる' }] },
      { party: 'ldp', title: '自由民主党総裁・内閣総理大臣', historical: '安倍 晋三', wins: 5, intro: '逆風の参院選と、任期満了が迫る総選挙をしのいで政権を守る。', goals: [{ type: 'notTwisted', label: '参院選で与党の過半数を守る' }, { type: 'pm', label: '総選挙のあとも政権を守る' }] },
    ],
    events: [
      { year: 2007, turn: 1, type: 'mood', shifts: { ldp: -3, dpj: 2 }, title: '年金記録の問題', text: '持ち主の分からない年金の記録が約5000万件あることが明らかになり、政府への批判が強まっている。' },
      { year: 2009, turn: 0, type: 'mood', shifts: { ldp: -4, dpj: 4 }, title: '「政権交代」の風', text: '長く続いた自民党政権への不満から、「一度は政権交代を」という声が広がっている。' },
      { year: 2008, turn: 2, type: 'econShock', growth: -3.5, life: -6, title: '世界的な金融危機', text: '米国の大手証券会社の破綻(リーマン・ショック)をきっかけに、世界的な金融危機が起きた。輸出が急減し、景気が急速に冷え込んでいる。' },
    ],
    formationBonus: { dpj: { komeito: -45, sdp: 15, kokuminshin: 15 }, ldp: { komeito: 25 } },
    end: { elections: 1, maxYear: 2010 },
  },
  // ------------------------------------------------------------------
  {
    id: 's2012', year: 2012, turnIndex: 1, era: 's2005',
    title: '2012 与党の分裂と「近いうち解散」', subtitle: '割れた与党で、解散の時期を探る',
    briefing: [
      '2012年6月、社会保障と税の一体改革(消費税の引き上げ)の法案に民主党から多くの反対が出た。7月、小沢一郎らは離党して「国民の生活が第一」を結成した(衆議院37人・参議院12人)。',
      '法案を参議院で通すには自民・公明の協力が要る。その見返りに、野党は早期の解散を迫っている。内閣支持率は低く、党内の結束も揺らいでいる。衆議院の任期は2013年8月まで。',
    ],
    history: '8月、野田首相は自民・公明の党首と「近いうちに国民に信を問う」と合意し、法案は成立した。9月に日本維新の会が国政政党として発足。11月14日の党首討論で野田首相は解散を明言し、12月16日の総選挙は自民党294議席、民主党57議席。自民・公明が政権に戻り、第2次安倍内閣が発足した。',
    note: '議席は2009年総選挙の結果に、離党(国民の生活が第一など)を反映した目安。参議院は2010年参院選をもとにした目安。',
    seats: { dpj: 250, ldp: 120, seikatsu: 37, komeito: 21, jcp: 9, sdp: 6, minna: 5, kizuna: 9, kokuminshin: 3, daichi: 3, indep: 17 },
    upper: { A: { dpj: 50, ldp: 33, komeito: 10, minna: 1, jcp: 3, sdp: 2, seikatsu: 12, indep: 10 }, B: { dpj: 44, ldp: 51, komeito: 9, minna: 10, jcp: 3, sdp: 2, indep: 2 }, nextClass: 'A', nextYear: 2013 },
    gov: { pmParty: 'dpj', coalition: ['dpj', 'kokuminshin'] },
    leaders: { dpj: '野田 佳彦', ldp: '谷垣 禎一', seikatsu: '小沢 一郎', komeito: '山口 那津男', jcp: '志位 和夫', sdp: '福島 瑞穂', minna: '渡辺 喜美', kizuna: '内山 晃', kokuminshin: '自見 庄三郎', daichi: '鈴木 宗男' },
    approval: 25, termElapsed: 12, cohesion: 40, econ: { growth: 0.6, prices: -0.2, fiscal: 22, life: 45, security: 46 }, econTrend: { growth: 0.8, prices: 0.0 },
    kofukuFrom: 2009,
    parties: {
      dpj: { name: '民主党', short: '民主', color: '#1e5aa8', position: '与党第一党', platform: ['welfare', 'medical', 'education'], backers: ['union'], support: 12, lean: { urban: 0.3, industry: 0.3 }, org: 0.25, orgLean: { industry: 0.4 }, cov: 0.9 },
      ldp: { name: '自由民主党', short: '自民', color: '#c8323c', position: '政権奪還をめざす野党第一党', platform: ['growth', 'defense', 'constitution'], backers: ['business', 'farm', 'shinseiren'], support: 29, lean: { farm: 0.5, elderly: 0.4 }, org: 0.45, orgLean: { farm: 0.5 }, cov: 0.95 },
      seikatsu: { name: '国民の生活が第一', short: '生活', color: '#ff8f00', position: '小沢一郎らが民主党を離れて作った新党', platform: ['livelihood', 'taxcut'], support: 3, lean: { farm: 0.2 }, org: 0.1, cov: 0.2 },
      komeito: { support: 8, cov: 0.03 },
      jcp: { name: '日本共産党', short: '共産', color: '#8b1e3f', position: '共産主義の政党', platform: ['peace', 'wage'], support: 6, lean: { urban: 0.4 }, org: 0.25, cov: 1.0 },
      sdp: { name: '社会民主党', short: '社民', color: '#2aa198', position: '社会民主主義の政党', platform: ['peace', 'welfare'], backers: ['union'], support: 2.5, cov: 0.08 },
      minna: { name: 'みんなの党', short: 'みん', color: '#f4c20d', position: '渡辺喜美が率いる改革派の政党', platform: ['deregulation', 'taxcut'], support: 7, lean: { urban: 0.6, youth: 0.4 }, cov: 0.25 },
      kizuna: { name: '新党きづな', short: 'きづ', color: '#26a69a', position: '民主党を離れた議員の新党', platform: ['livelihood'], support: 0.6, cov: 0.03 },
      kokuminshin: { name: '国民新党', short: '国新', color: '#7e57c2', position: '民主党と連立を組む小政党', platform: ['agri', 'welfare'], support: 0.8, cov: 0.01 },
      daichi: { name: '新党大地・真民主', short: '大地', color: '#6d4c41', position: '鈴木宗男が率いる北海道の地域政党', platform: ['agri'], support: 0.8, lean: { farm: 0.4 }, cov: 0.03 },
      ishin: { name: '日本維新の会', short: '維新', color: '#43a047', position: '橋下徹・大阪市長が率いる改革政党', platform: ['deregulation', 'constitution'], support: 16, lean: { urban: 0.5, youth: 0.3 }, cov: 0.55 },
    },
    roles: [
      { party: 'dpj', title: '民主党代表・内閣総理大臣', historical: '野田 佳彦', wins: 5, intro: '割れた与党をまとめ、解散の時期を見きわめて政権を守る。', goals: [{ type: 'firstParty', label: '次の総選挙で第1党を守る' }, { type: 'pm', label: '総選挙のあとも首相を続ける' }] },
      { party: 'ldp', title: '自由民主党総裁', historical: '谷垣 禎一', wins: 10, intro: '与党に早期の解散を迫り、3年ぶりの政権奪還をめざす。', goals: [{ type: 'firstParty', label: '総選挙で第1党になる' }, { type: 'pm', label: '政権を奪い返して首相になる' }] },
    ],
    events: [
      { year: 2012, turn: 2, type: 'kinchi' },
      { year: 2012, turn: 2, type: 'newParty', id: 'ishin', from: { dpj: 3, minna: 3, indep: 3 }, leader: '橋下 徹', text: '大阪の地域政党を母体に、日本維新の会が国政政党として発足した(代表 橋下徹)。民主党やみんなの党から合流する議員も出た。' },
      { year: 2012, turn: 2, type: 'leaderChange', party: 'ldp', name: '安倍 晋三', text: '自民党総裁選で安倍晋三が勝ち、5年ぶりに総裁に返り咲いた。' },
    ],
    formationBonus: { dpj: { komeito: -45, ishin: -30 }, ldp: { komeito: 25 } },
    end: { elections: 1, maxYear: 2013 },
  },
];
// 1994年は1993年と同じ顔ぶれ
Game.Data.SCENARIOS.find((s) => s.id === 's1994').parties = Game.Data.SCENARIOS.find((s) => s.id === 's1993').parties;
Game.Data.scenarioById = (id) => Game.Data.SCENARIOS.find((s) => s.id === id) || null;
