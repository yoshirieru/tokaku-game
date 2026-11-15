// 実績(殿堂、R7)。条件の判定は js/engine/hall.js、しきい値は balance.js の hall。
// mark は丸いハンコに入れる1文字。cross: true の実績は、セーブデータをまたいで積み重ねて達成する
window.Game = window.Game || {};
Game.Data = Game.Data || {};

Game.Data.ACHIEVEMENTS = [
  { id: 'firstWin',   mark: '当', title: '初当選',           desc: '衆議院選挙で議席を得る(比例復活も含む)' },
  { id: 'prRevival',  mark: '比', title: '比例復活',         desc: '小選挙区で負けても、比例代表で議席を得る' },
  { id: 'comeback',   mark: '返', title: '返り咲き',         desc: '落選したあと、もう一度議席を得る' },
  { id: 'veteran',    mark: '重', title: 'ベテラン議員',     desc: '議席を5回得る' },
  { id: 'hardSeat',   mark: '逆', title: '逆風を越えて',     desc: '自分の党にとって「むずかしい」以上の選挙区で、小選挙区に勝つ' },
  { id: 'keeper',     mark: '約', title: '約束を守り抜く',   desc: '約束を5つ以上果たし、1つも破らずに政界を去る' },
  { id: 'minister',   mark: '臣', title: '大臣の椅子',       desc: '大臣に就く' },
  { id: 'leader',     mark: '党', title: '党の顔',           desc: '党首選に勝って党首になる' },
  { id: 'majority',   mark: '過', title: '単独過半数',       desc: '総選挙で、自分の党だけで過半数を取る' },
  { id: 'coalition',  mark: '連', title: '連立の首相',       desc: 'ほかの党と連立を組んで首相になる' },
  { id: 'pm',         mark: '総', title: '内閣総理大臣',     desc: '首相になる' },
  { id: 'pmMirai',    mark: '新', title: '第三党からの総理', desc: '未来改革党で首相になる' },
  { id: 'longPM',     mark: '長', title: '長期政権',         desc: '首相を6年以上務める' },
  { id: 'greatPM',    mark: '名', title: '名宰相',           desc: '首相のまま、支持率50%以上で政界を去る' },
  { id: 'gradeS',     mark: '史', title: '歴史に名を刻む',   desc: '評価 S で政界を去る' },
  { id: 'allSeats',   mark: '国', title: '全国を渡り歩く',   desc: '5つの選挙区すべてで議席を得る(セーブデータをまたいで)', cross: true },
  { id: 'threeParties', mark: '三', title: '3党で総理',      desc: '民政・共和・未来それぞれで首相になる(セーブデータをまたいで)', cross: true },
];
