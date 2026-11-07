// 実績(殿堂、M17)。条件の判定は js/engine/hall.js、しきい値は balance.js の Game.Balance.hall。
// cross: true の実績は、セーブデータをまたいで積み重ねて達成する
window.Game = window.Game || {};
Game.Data = Game.Data || {};

Game.Data.ACHIEVEMENTS = [
  { id: 'firstWin',    icon: '🎌', title: '初当選',           desc: '衆院選に当選する' },
  { id: 'prRevival',   icon: '🪂', title: '比例復活',         desc: '小選挙区で負けても、比例で復活当選する' },
  { id: 'comeback',    icon: '🔁', title: '返り咲き',         desc: '落選のあと、もう一度当選する' },
  { id: 'veteran',     icon: '🏛', title: 'ベテラン議員',     desc: '当選を5回重ねる' },
  { id: 'hardSeat',    icon: '🌪', title: '逆風を越えて',     desc: '自分の党にとって「とてもむずかしい」選挙区で当選する' },
  { id: 'minister',    icon: '🪑', title: '大臣の椅子',       desc: '大臣(野党なら次の内閣の大臣)に就く' },
  { id: 'clean',       icon: '🤝', title: '約束を守り抜く',   desc: '約束を5つ以上果たし、1つも破らずに終える' },
  { id: 'leader',      icon: '🚩', title: '党の顔',           desc: '党首になる' },
  { id: 'kingmaker',   icon: '🎴', title: 'キングメーカーを味方に', desc: 'キングメーカーの派閥の推しを受けて党首選に勝つ' },
  { id: 'pm',          icon: '🎖', title: '内閣総理大臣',     desc: '首相になる' },
  { id: 'pmMirai',     icon: '🧡', title: '第三党からの総理', desc: '未来改革党で首相になる' },
  { id: 'pmNewparty',  icon: '✨', title: '新党から総理へ',   desc: '自分で立ち上げた新党で首相になる' },
  { id: 'longPM',      icon: '⏳', title: '長期政権',         desc: '首相を6年以上つとめる' },
  { id: 'greatPM',     icon: '🌸', title: '名宰相',           desc: '「名宰相として退陣」で終える' },
  { id: 'economy',     icon: '💹', title: '経済の立て直し',   desc: '首相のあいだの「世の中の気分」の平均を +3 以上にする' },
  { id: 'majority',    icon: '🗳', title: '単独過半数',       desc: '総選挙で自分の党が233議席以上を取る' },
  { id: 'upperSeat',   icon: '🏢', title: '参院に旗を立てる', desc: '新党で、参院選の議席を取る' },
  { id: 'requirement', icon: '📜', title: '政党要件',         desc: '新党で政党要件を満たす' },
  { id: 'governor',    icon: '🏞', title: '知事に転身',       desc: '知事選に勝って、地方から政治を動かす道を選ぶ' },
  { id: 'gradeS',      icon: '🏆', title: '歴史に名を刻む',   desc: 'レガシー評価 S で終える' },
  { id: 'allSeats',    icon: '🗾', title: '全国を渡り歩く',   desc: '5つの選挙区すべてで当選する(セーブデータをまたいで)', cross: true },
  { id: 'threeParties', icon: '🎎', title: '3党で総理',       desc: '民政・共和・未来の3党それぞれで首相になる(セーブデータをまたいで)', cross: true },
];
