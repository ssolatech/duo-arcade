'use strict';
// [대결] 땅따먹기: 지나가는 칸이 내 색으로 칠해진다. 45초 뒤 더 많이 칠한 사람이 승리. 물감 폭탄은 주변 9칸!
(() => {
  const U = Duo.U;
  const TIME = 45, COLS = 12, ROWS = 16, T = 30;

  function count(st) {
    const sc = [0, 0];
    for (const ch of st.g) { if (ch === '1') sc[0]++; else if (ch === '2') sc[1]++; }
    st.sc = sc;
  }
  function paint(st, cx, cy, p) {
    if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return;
    const i = cy * COLS + cx;
    const v = p ? '2' : '1';
    if (st.g[i] !== v) st.g = st.g.slice(0, i) + v + st.g.slice(i + 1);
  }

  Duo.register({
    id: 'paint',
    name: '땅따먹기',
    icon: '🎨',
    type: 'vs',
    desc: '돌아다니며 바닥을 내 색으로! 45초 뒤 더 넓게 칠한 사람 승리',
    ctl: 'stick',
    btn: '대시',

    init() {
      return { time: TIME, g: '0'.repeat(COLS * ROWS), sc: [0, 0], c: [U.newChar(0, 180, 420), U.newChar(1, 180, 60)], bomb: null, bombT: 6, splash: [] };
    },

    update(st, inp, dt) {
      st.time -= dt;
      for (const p of [0, 1]) {
        const c = st.c[p];
        U.stepChar(st, c, inp[p], dt, 125, U.edge(st, inp, p, 'ac'));
        if (c.stun <= 0) paint(st, Math.floor(c.x / T), Math.floor(c.y / T), p);
      }
      const [a, b] = st.c;
      if (U.d2(a, b) < 26 * 26) {
        for (const [x, y] of [[a, b], [b, a]]) {
          if (x.dash > 0 && y.stun <= 0 && y.dash <= 0) { y.stun = 1.2; U.fx(st, 'stun'); }
        }
      }
      st.bombT -= dt;
      if (!st.bomb && st.bombT <= 0) st.bomb = { x: (U.irand(1, COLS - 2) + 0.5) * T, y: (U.irand(2, ROWS - 3) + 0.5) * T };
      if (st.bomb) {
        for (const c of st.c) {
          if (c.stun <= 0 && U.d2(c, st.bomb) < 22 * 22) {
            const bx = Math.floor(st.bomb.x / T), by = Math.floor(st.bomb.y / T);
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) paint(st, bx + dx, by + dy, c.p);
            st.splash.push({ x: st.bomb.x, y: st.bomb.y, p: c.p, t: 0.5 });
            st.bomb = null; st.bombT = U.rand(5, 8);
            U.fx(st, 'big');
            break;
          }
        }
      }
      st.splash = st.splash.filter((s) => (s.t -= dt) > 0);
      count(st);
      if (st.time <= 0) st.over = { w: st.sc[0] === st.sc[1] ? -1 : st.sc[0] > st.sc[1] ? 0 : 1 };
    },

    pack(st) { st.c.forEach(U.packChar); st.time = U.r1(st.time); },

    render(ctx, st, t) {
      ctx.fillStyle = '#1c1830';
      ctx.fillRect(0, 0, Duo.W, Duo.H);
      for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
        const v = st.g[y * COLS + x];
        ctx.fillStyle = v === '1' ? '#0ea5e9' : v === '2' ? '#f43f5e' : (x + y) % 2 ? '#221d38' : '#1c1830';
        ctx.fillRect(x * T + 1, y * T + 1, T - 2, T - 2);
      }
      U.timeBar(ctx, st.time / TIME, '#fff');
      if (st.bomb) {
        const s = 1 + Math.sin(t * 8) * 0.12;
        ctx.save(); ctx.translate(st.bomb.x, st.bomb.y); ctx.scale(s, s);
        ctx.fillStyle = '#a855f7'; ctx.beginPath(); ctx.arc(0, 2, 10, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fef08a'; ctx.fillRect(-2, -12, 4, 6);
        ctx.restore();
      }
      for (const s of st.splash) {
        ctx.strokeStyle = Duo.COLORS[s.p]; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(s.x, s.y, (0.5 - s.t) * 120, 0, Math.PI * 2); ctx.stroke();
      }
      for (const c of st.c) U.drawChar(ctx, c, t);
    },

    hud: (st, p) => `🎨 ${st.sc[p]}칸`,
    status(st, p) {
      const s = Math.ceil(Math.max(0, st.time));
      const d = st.sc[p] - st.sc[1 - p];
      return `${s}초 · ${d > 0 ? `${d}칸 앞서요` : d < 0 ? `${-d}칸 뒤져요` : '동점'}`;
    },
  });
})();
