'use strict';
// [대결] 별 줍기: 40초 동안 별을 더 많이 모으면 승리. 대시로 상대를 들이받으면 별 1개를 뺏는다!
(() => {
  const U = Duo.U;
  const TIME = 40;

  function spawn(st, gold) {
    st.stars.push({ x: U.rand(24, Duo.W - 24), y: U.rand(40, Duo.H - 40), g: gold ? 1 : 0, life: gold ? 5 : 999 });
  }

  Duo.register({
    id: 'stars',
    name: '별 줍기',
    icon: '⭐',
    type: 'vs',
    desc: '40초 동안 별 모으기. 금별은 3점! 대시로 박으면 별을 뺏어요',
    ctl: 'stick',
    btn: '대시',

    init() {
      const st = { time: TIME, sc: [0, 0], c: [U.newChar(0, 180, 400), U.newChar(1, 180, 80)], stars: [], goldT: 7 };
      for (let i = 0; i < 5; i++) spawn(st, false);
      return st;
    },

    update(st, inp, dt) {
      st.time -= dt;
      for (const p of [0, 1]) U.stepChar(st, st.c[p], inp[p], dt, 135, U.edge(st, inp, p, 'ac'));
      // 박치기
      const [a, b] = st.c;
      if (U.d2(a, b) < 26 * 26) {
        for (const [x, y] of [[a, b], [b, a]]) {
          if (x.dash > 0 && y.stun <= 0 && y.dash <= 0) {
            y.stun = 1.0;
            if (st.sc[y.p] > 0) { st.sc[y.p]--; st.sc[x.p]++; }
            U.fx(st, 'stun');
          }
        }
      }
      for (let i = st.stars.length - 1; i >= 0; i--) {
        const s = st.stars[i];
        s.life -= dt;
        if (s.life <= 0) { st.stars.splice(i, 1); continue; }
        for (const c of st.c) {
          if (c.stun <= 0 && U.d2(c, s) < 22 * 22) {
            st.sc[c.p] += s.g ? 3 : 1;
            U.fx(st, s.g ? 'big' : 'coin');
            st.stars.splice(i, 1);
            if (!s.g) spawn(st, false);
            break;
          }
        }
      }
      st.goldT -= dt;
      if (st.goldT <= 0) { st.goldT = U.rand(6, 9); spawn(st, true); }
      if (st.time <= 0) st.over = { w: st.sc[0] === st.sc[1] ? -1 : st.sc[0] > st.sc[1] ? 0 : 1 };
    },

    pack(st) {
      st.c.forEach(U.packChar);
      st.stars.forEach((s) => { s.x = U.r1(s.x); s.y = U.r1(s.y); s.life = U.r1(s.life); });
      st.time = U.r1(st.time);
    },

    render(ctx, st, t) {
      U.floor(ctx, '#173322', '#1a3a27');
      U.timeBar(ctx, st.time / TIME);
      for (const s of st.stars) {
        if (s.g && s.life < 1.5 && Math.floor(t * 10) % 2) continue;
        const r = s.g ? 13 : 9;
        U.drawStar(ctx, s.x, s.y + Math.sin(t * 4 + s.x) * 2, r, s.g ? '#fbbf24' : '#fde68a', t * (s.g ? 2 : 0.6));
      }
      for (const c of st.c) U.drawChar(ctx, c, t);
    },

    hud: (st, p) => `⭐ ${st.sc[p]}`,
    status(st, p) {
      const s = Math.ceil(Math.max(0, st.time));
      const d = st.sc[p] - st.sc[1 - p];
      return `${s}초 · ${d > 0 ? `${d}점 앞서요` : d < 0 ? `${-d}점 뒤져요` : '동점'}`;
    },
  });
})();
