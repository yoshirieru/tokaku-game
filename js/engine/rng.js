// 種つきの乱数。乱数の状態は state.rng に持つので、セーブを読み直しても結果は変わらない(やり直しで良い目を引けない)。
window.Game = window.Game || {};

Game.Rng = (function () {
  // mulberry32。st は rng(整数)を持つオブジェクト(= state)
  function next(st) {
    st.rng = (st.rng + 0x6d2b79f5) | 0;
    let t = st.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function int(st, n) { return Math.floor(next(st) * n); }
  function pick(st, arr) { return arr[int(st, arr.length)]; }
  // 重みつきで1つ選ぶ。weightOf(item) が重み
  function weighted(st, items, weightOf) {
    const ws = items.map(weightOf);
    const total = ws.reduce(function (a, b) { return a + b; }, 0);
    let x = next(st) * total;
    for (let i = 0; i < items.length; i++) { x -= ws[i]; if (x < 0) return items[i]; }
    return items[items.length - 1];
  }
  // 標準正規分布(Box-Muller)
  function normal(st) {
    const u = Math.max(next(st), 1e-9), v = next(st);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function shuffle(st, arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = int(st, i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  return { next: next, int: int, pick: pick, weighted: weighted, normal: normal, shuffle: shuffle };
})();
