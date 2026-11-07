// チュートリアル:はじめから遊ぶとき、それぞれの画面に初めて来たときに遊び方を順に説明する。
// state.tutorial = { done: { 画面のキー: true } }(スタート時にオフにすると null)。説明している場所を枠で示す。
window.Game = window.Game || {};
Game.UI = Game.UI || {};

(function (UI) {
  const esc = (s) => UI.esc(s);

  // sel: 枠で示す場所(なければ全体の説明)
  const STEPS = {
    campaign: [
      { title: 'ようこそ、選挙区へ', text: 'あなたは衆院選に初めて立つ新人候補。12日間の選挙戦で、ライバルより多くの票を集めて当選をめざそう。小選挙区で負けても、惜敗率が高ければ比例代表で復活当選できる。' },
      { sel: '.map-panel', title: '選挙区の情勢', text: '5つの地区の情勢。◎優勢 ○やや優勢 ▲接戦 △やや劣勢 ×劣勢。地区を押すと選べる。ふだんは「陣営の感触」で誤差が大きく、3・7・11日目の夜に新聞の情勢調査が出る。' },
      { sel: '.region-panel', title: '地区の特徴', text: '選んだ地区の有権者の数と特徴(都市度・若者・高齢者・工業・農業)。特徴によって行動の効き方が変わる。有権者の多い地区と、接戦の地区を優先しよう。' },
      { sel: '.actions-panel', title: '1日2回の行動', text: '街頭演説は知名度(都市部で効く)、戸別訪問は支持(住宅地・農村)、団体挨拶は崩れにくい固い票。党幹部の応援は回数の限られた切り札。迷ったら、知名度の低い地区で街頭演説から。' },
      { sel: '.hud', title: '体力と資金', text: '体力が30を切ると行動の効果が落ちる。資金は毎日減り、尽きると動きが鈍る。ときどき休息と資金集めを挟もう。' },
      { sel: '.support-panel', title: '支援団体とSNS', text: '支援団体と関係を深めると推薦がもらえ、組織票が増える。団体ごとに求める政策が違い、公約とぶつかる団体からは推薦がもらえない。SNS発信は若い世代に届くが、炎上することもある。' },
      { sel: '.end-day', title: '1日を終える', text: '選んだ行動は、その日のうちなら「取り消す」で選び直せる。2回行動したら1日を終えよう。翌朝のニュースで、ライバルの動きや出来事がわかる。' },
    ],
    term: [
      { title: '議員としての毎日', text: '1年は4ターン(通常国会・夏・臨時国会・冬)、1ターンに2回行動できる。解散はいつ来るか分からない。次の選挙に備えながら、出世をめざそう。' },
      { sel: '.actions-panel', title: '議員の仕事', text: '委員会質問・議員立法で実績、地元回りで次の選挙の地盤、派閥活動で仲間の議員(党首選の推薦人)が増える。「予算委員会で論戦」はカードバトルで、勝てば党内評価が大きく上がる。' },
      { sel: '.map-panel', title: '地元の地盤', text: '地元の知名度と支持は、何もしないと少しずつ薄れる。解散に備えて、ときどき地元回りをしよう。' },
      { title: '約束と出世', text: '支援団体と交わした約束は、任期中に質問や議員立法で果たそう。破ると次の選挙で推薦がもらえない。当選回数と党内評価で役職が上がり、いずれ党首選に挑める。' },
    ],
    founder: [
      { title: '新党の党首として', text: '議席ゼロからのスタート。夏の参院選が来たら、比例代表(全国の得票で議席が決まる)に候補者を立てて挑める。衆議院の解散はいつ来るか分からない。それまでに候補者を公募し、党のSNSや記者会見で党を知ってもらおう。' },
      { sel: '.actions-panel', title: '結党準備の行動', text: '「新しさ」は時間とともに減るが、あるうちはSNSと浮動票に強い。資金は少ないので、資金集めも忘れずに。政党要件(議員5人か得票率2%)を満たすと政党交付金が入る。' },
    ],
    leader: [
      { title: '党首になった', text: '党内の結束を保ちながら、総選挙で過半数(233議席)をめざす。首相なら法案・外交・解散権、野党なら国会での追及や内閣不信任案で政権交代を狙う。' },
      { sel: '.actions-panel', title: '党首の行動', text: '行動は1ターン2回。党首討論はカードバトル、SNSは支持率に響く。結束が下がりすぎると党が分裂する。支持が高いうちに後継を指名して退くと、高い評価で終われる。' },
    ],
    national: [
      { title: '全国11ブロックの総選挙', text: '465議席をめぐる戦い。党の規模によって選挙戦の届く範囲が違う。全国遊説で接戦のブロックを回り、公約発表は1回だけ。6日目は党首討論。' },
    ],
  };

  function keyFor(st) {
    if (st.screen === 'campaign') return st.campaign && st.campaign.mode === 'national' ? 'national' : 'campaign';
    if (st.screen === 'term') return st.career && st.career.status === 'founder' ? 'founder' : 'term';
    if (st.screen === 'leaderHub') return 'leader';
    return null;
  }

  // 画面を描いたあとに呼ぶ(main.js)。説明がまだなら、モーダルに出す
  UI.maybeTutorial = function (modalRoot) {
    const st = Game.state;
    if (!st || !st.tutorial) return;
    const key = keyFor(st);
    if (!key || st.tutorial.done[key]) return;
    const steps = STEPS[key];
    const i = Math.min(st.ui.tutStep || 0, steps.length - 1);
    const step = steps[i];
    document.querySelectorAll('.tut-focus').forEach((el) => el.classList.remove('tut-focus'));
    const target = step.sel && document.querySelector(step.sel);
    if (target) {
      target.classList.add('tut-focus');
      if (target.scrollIntoView) target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    const last = i === steps.length - 1;
    modalRoot.innerHTML = `
      <div class="tutorial-box ${target ? 'docked' : ''}">
        <p class="modal-kicker">チュートリアル ${i + 1} / ${steps.length}</p>
        <h3>${esc(step.title)}</h3>
        <p>${esc(step.text)}</p>
        <div class="modal-actions">
          <button class="btn btn-ghost small" data-act="tut-skip">説明をとばす</button>
          ${i > 0 ? '<button class="btn" data-act="tut-prev">もどる</button>' : ''}
          <button class="btn btn-primary" data-act="tut-next">${last ? 'はじめる' : '次へ'}</button>
        </div>
      </div>`;
    const finish = () => {
      st.tutorial.done[key] = true;
      st.ui.tutStep = 0;
      document.querySelectorAll('.tut-focus').forEach((el) => el.classList.remove('tut-focus'));
      Game.commit();
    };
    modalRoot.querySelector('[data-act="tut-skip"]').onclick = finish;
    const prev = modalRoot.querySelector('[data-act="tut-prev"]');
    if (prev) prev.onclick = () => { st.ui.tutStep = i - 1; Game.render(); };
    modalRoot.querySelector('[data-act="tut-next"]').onclick = () => {
      if (last) return finish();
      st.ui.tutStep = i + 1;
      Game.render();
    };
  };
})(Game.UI);
