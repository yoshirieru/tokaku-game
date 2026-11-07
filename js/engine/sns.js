// SNSの話題度・好感度、トレンド、炎上。選挙戦(campaign.js)・議員任期(career.js)・党首モード(leader.js)で共用する。
// DOMには触らない。乱数は呼び出し側の種つき乱数(rng: () => 0〜1)を受け取る。
//
// SNSの状態 s = {
//   buzz: 話題度(0〜100。知名度につながる), favor: 好感度(−30〜+30。票につながる),
//   trend: 今日のトレンド { word, fits, policy, serious }, posts, flames,
//   queue: [まだ対応していない炎上イベント], delayed: [あとで効く結果(ファクトチェックなど)],
// }
// 選挙戦では camp.sns、任期・党首モードでは state.sns に置く。
window.Game = window.Game || {};

Game.Sns = (function () {
  const SB = () => Game.Balance.sns;
  const D = () => Game.Data;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const r1 = (v) => Math.round(v * 10) / 10;
  const sign = (v) => (v >= 0 ? '+' : '') + r1(v);

  // ---------------- 作成・持ち越し ----------------
  // from があれば、選挙戦⇔任期の切り替えで一部を持ち越す
  function create(from) {
    const C = SB().carry;
    return {
      buzz: from ? (from.buzz || 0) * C.buzz : 0,
      favor: from ? (from.favor || 0) * C.favor : 0,
      trend: null,
      posts: from ? from.posts || 0 : 0,
      flames: from ? from.flames || 0 : 0,
      queue: from && from.queue ? from.queue.slice() : [],
      delayed: from && from.delayed ? from.delayed.slice() : [],
    };
  }
  function ensure(state) {
    if (!state.sns) state.sns = create(null);
    return state.sns;
  }

  function addBuzz(s, v) {
    s.buzz = clamp(s.buzz + v, 0, SB().buzzMax);
  }
  function addFavor(s, v) {
    s.favor = clamp(s.favor + v, SB().favorMin, SB().favorMax);
  }

  // 地区の特徴による効き方(若い世代・都市部に効きやすい)
  function traitMult(traits) {
    const b = SB().traitBonus;
    let m = 1;
    for (const k in b) m += b[k] * ((traits && traits[k] !== undefined ? traits[k] : 0.5) - 0.5);
    return Math.max(0.2, m);
  }
  // 好感度 → 地区(ブロック)での強さ。組織票には効かない
  function favorTerm(s, traits, mode) {
    if (!s || !s.favor) return 0;
    return s.favor * SB().favorWeight[mode === 'national' ? 'national' : 'district'] * traitMult(traits);
  }

  // ---------------- トレンド ----------------
  function newTrend(s, rng) {
    const T = D().SNS_TRENDS;
    let t = T[Math.floor(rng() * T.length)];
    if (s.trend && t.word === s.trend.word) t = T[(T.indexOf(t) + 1) % T.length];
    s.trend = Object.assign({}, t);
    return s.trend;
  }
  // 投稿の種類がトレンドに合うか(画面の表示用)
  function trendFit(s, type, pledges) {
    const t = s && s.trend;
    if (!t) return null;
    if (t.fits.includes(type)) return type === 'policy' && t.policy && (pledges || []).includes(t.policy) ? 'sure' : 'fit';
    if (t.serious && type === 'neta') return 'risky';
    return null;
  }

  // ---------------- 投稿 ----------------
  // ctx: { mult: 効率(体力・資金・規模など), pledges: 公約, newness: 新党の新しさ(0〜100), who: 'あなた' など }
  // 戻り値: { buzz, favor, trend: 'hit'|'miss'|null, flame, viral, recogMult, text }
  function post(s, type, rng, ctx) {
    ctx = ctx || {};
    const B = SB();
    const P = B.posts[type];
    const info = D().SNS_POST_TYPES[type];
    let buzz = P.buzz;
    let favor = P.favorMin !== undefined ? P.favorMin + rng() * (P.favorMax - P.favorMin) : P.favor;
    let flameChance = P.flameChance || 0;
    let trend = null;
    const fit = trendFit(s, type, ctx.pledges);
    if (fit === 'sure' || (fit === 'fit' && rng() < B.trend.hitChance)) {
      trend = 'hit';
      buzz *= B.trend.hitBuzz;
      favor += B.trend.hitFavor;
    } else if (fit === 'fit') {
      trend = 'miss';
      buzz *= B.trend.missBuzz;
      favor *= B.trend.missFavor;
    } else if (fit === 'risky') {
      flameChance += B.trend.seriousFlame;
    }
    const m = (ctx.mult === undefined ? 1 : ctx.mult) * (1 + ((ctx.newness || 0) / 100) * B.newnessBoost);
    buzz *= m;
    if (favor > 0) favor *= m;
    const recogMult = P.recog * m * (1 + s.buzz / B.buzzBoost);
    addBuzz(s, buzz);
    addFavor(s, favor);
    s.posts = (s.posts || 0) + 1;
    const viral = trend === 'hit' || buzz >= B.viralBuzz;

    let flame = null;
    if (rng() < flameChance) flame = startFlame(s, fit === 'risky' ? 'serious' : 'post', rng);

    const tag = s.trend ? `#${s.trend.word}` : '';
    let text = `${info.platform}に「${info.name}」の投稿をした。`;
    if (trend === 'hit') text += `トレンドの${tag}に乗って一気に拡散された!`;
    else if (trend === 'miss') text += `${tag}に乗ろうとしたが空振りに終わった。`;
    else if (viral) text += 'バズった! 一気に拡散された。';
    else if (favor < 0) text += '反応は冷ややかだった。';
    text += `(話題度${sign(buzz)}、好感度${sign(favor)})`;
    if (flame) text += ' ……批判的な返信が付き始めた。';
    return { type, buzz, favor, trend, flame, viral, recogMult, text };
  }

  // ---------------- 炎上 ----------------
  function weighted(rng, weights) {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rng() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return weights.length - 1;
  }

  // 炎上を起こして、対応を選ぶイベントを順番待ちに入れる(好感度はこの時点で下がる)
  // kind: post | serious | gaffe | clip | hoax
  function startFlame(s, kind, rng, sev) {
    const B = SB().flame;
    const F = D().SNS_FLAMES[kind];
    sev = sev || weighted(rng, B.sevWeights[kind]) + 1;
    addFavor(s, -sev * B.favorHit);
    addBuzz(s, sev * B.buzzHit);
    s.flames = (s.flames || 0) + 1;
    const ev = {
      id: 'snsFlame', kind, sev, kicker: 'SNSで炎上',
      title: `${F.label}${'🔥'.repeat(sev)}`,
      text: F.texts[Math.floor(rng() * F.texts.length)],
    };
    s.queue.push(ev);
    return ev;
  }

  // 順番待ちの炎上を1つ取り出して、選択肢をつける。ctx.money で説明動画が出せるか決まる
  function surface(s, ctx) {
    const ev = s.queue.shift();
    if (!ev) return null;
    const B = SB().flame;
    const F = D().SNS_FLAMES[ev.kind];
    const money = ctx && ctx.money !== undefined ? ctx.money : Infinity;
    ev.choices = [
      { id: 'apologize', label: 'すぐに謝罪する', note: F.real ? '騒ぎは早く収まり、好感度が少し戻る' : '身に覚えがないのに謝ると「認めた」と受け取られかねない' },
      { id: 'rebut', label: '反論する', note: F.real ? '自分に落ち度があるので、裏目に出やすい' : '筋が通っていれば一気に形勢が逆転する。外すと燃え広がる' },
      { id: 'video', label: '説明動画を出す', note: `${B.video.cost}万円。経緯を丁寧に説明する。確実に少し戻る`, disabled: money < B.video.cost },
      { id: 'ignore', label: '静観する', note: '自然に収まることもあるが、くすぶり続けることもある' },
    ];
    if (F.hoax) ev.choices.push({ id: 'factcheck', label: 'ファクトチェックを待つ', note: `しばらくは我慢。${B.factcheck.delay}${ctx && ctx.unit ? ctx.unit : '日'}ほどで検証記事が出れば、好感度が戻る` });
    ev.text += ` どう対応する?(好感度 ${sign(-ev.sev * B.favorHit)}、話題度 ${sign(ev.sev * B.buzzHit)})`;
    return ev;
  }

  // 戻り値: { text, money: 使った資金, momentum: 選挙戦の勢いの増減 }
  function resolveFlame(s, ev, choice, rng) {
    const B = SB().flame;
    const F = D().SNS_FLAMES[ev.kind];
    const sev = ev.sev;
    let text = '';
    let money = 0;
    let momentum = 0;
    let df = 0;
    if (choice === 'apologize') {
      df = sev * (F.real ? B.apologize.real : B.apologize.unfair);
      text = F.real ? 'すぐに謝罪した。「対応が早い」と評価する声もあり、騒ぎは収まった。' : '謝罪したところ「やはり事実だったのか」と受け取られてしまった。';
    } else if (choice === 'rebut') {
      if (rng() < B.rebutChance[ev.kind]) {
        df = sev * B.rebutWin;
        text = F.real ? '反論が意外にも支持を集め、流れが変わった。' : '発言の全体を示して反論した。「切り取りだった」と分かり、同情の声が広がった。';
      } else {
        df = sev * B.rebutLose;
        addBuzz(s, sev * B.rebutLoseBuzz);
        momentum = -SB().campaign.flameMomentum * sev;
        text = '反論がさらに批判を呼び、炎上が広がった。';
      }
    } else if (choice === 'video') {
      money = B.video.cost;
      df = sev * (F.real ? B.video.real : B.video.unfair);
      addBuzz(s, B.video.buzz);
      text = '経緯を説明する動画を出した。丁寧な説明に一定の理解が集まった。';
    } else if (choice === 'ignore') {
      if (rng() < B.ignore.fizzle) {
        text = '静観していると、話題は別の出来事に移っていった。';
      } else {
        df = sev * B.ignore.favor;
        momentum = -SB().campaign.flameMomentum * sev;
        text = '静観しているうちに、批判はじわじわと広がった。';
      }
    } else if (choice === 'factcheck') {
      df = sev * B.factcheck.now;
      s.delayed.push({ after: B.factcheck.delay, favor: sev * B.factcheck.later, text: 'ファクトチェックの記事が出て、出回っていた話はデマだと分かった。同情の声が集まり、好感度が戻った。' });
      text = 'ファクトチェックの結果を待つことにした。しばらくは我慢の時間だ。';
    }
    addFavor(s, df);
    if (df) text += `(好感度${sign(df)})`;
    return { text, money, momentum };
  }

  // 討論・国会・番組での発言が切り抜かれて拡散される(好意的なことも、炎上することもある)
  // 戻り値: null | { positive: true, line } | { flame }
  function clip(s, rng, key) {
    const C = SB().clips[key];
    if (!C || rng() >= C.chance) return null;
    if (rng() < C.positive) {
      addBuzz(s, SB().clip.buzz);
      addFavor(s, SB().clip.favor);
      return { positive: true, line: `発言の切り抜き動画が動画サイトで拡散され、好意的な反応が集まった(話題度+${SB().clip.buzz}、好感度+${SB().clip.favor})。` };
    }
    return { flame: startFlame(s, 'clip', rng), line: '発言の一部が切り抜かれ、SNSで批判が広がり始めた。' };
  }

  // デマ(自分の側に落ち度のない炎上)
  function hoax(s, rng) {
    return startFlame(s, 'hoax', rng);
  }

  // 支援団体との近さが話題に。賛否が割れて好感度が上下する(団体の評価はしない)
  function orgTopic(s, rng, org) {
    const O = SB().orgTopic;
    const df = (rng() * 2 - 1) * O.favor;
    addFavor(s, df);
    addBuzz(s, O.buzz);
    const why = org.kind === 'religious' ? '支持する声と、政教分離の観点から疑問を示す声で' : '心強いという声と、特定の業界に近すぎるという声で';
    return `あなたと${org.name}との関係がつぶやきSNSで話題になった。${why}賛否が分かれている(好感度${sign(df)})。`;
  }
  // 関係度が高い(または推薦を受けている)団体から1つ選ぶ
  function closeOrg(relations, endorsed, rng) {
    const O = SB().orgTopic;
    const ids = Object.keys(relations || {}).filter((id) => relations[id] >= O.minRelation || (endorsed || []).includes(id));
    if (!ids.length) return null;
    return D().ORGANIZATIONS[ids[Math.floor(rng() * ids.length)]];
  }

  // ---------------- 時間の経過 ----------------
  // unit: 'day'(選挙戦)| 'turn'(任期・党首モード)。あとで効く結果の文面を返す
  function tick(s, unit) {
    const K = SB().decay[unit];
    s.buzz *= K.buzz;
    s.favor *= K.favor;
    const lines = [];
    for (const d of s.delayed) {
      d.after--;
      if (d.after <= 0) {
        addFavor(s, d.favor);
        lines.push(d.text);
      }
    }
    s.delayed = s.delayed.filter((d) => d.after > 0);
    return lines;
  }

  // 画面用の言葉
  function buzzLabel(v) {
    return v >= 60 ? '大きな話題' : v >= 30 ? '話題' : v >= 10 ? 'ときどき話題' : '静か';
  }
  function favorLabel(v) {
    return v >= 15 ? 'とても好意的' : v >= 5 ? '好意的' : v > -5 ? 'ふつう' : v > -15 ? '批判的' : 'とても批判的';
  }

  return {
    create, ensure, addBuzz, addFavor, traitMult, favorTerm,
    newTrend, trendFit, post, startFlame, surface, resolveFlame, clip, hoax, orgTopic, closeOrg, tick,
    buzzLabel, favorLabel,
  };
})();
