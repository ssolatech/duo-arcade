'use strict';
// [대결] 밀어내기 씨름: 둥근 링 위에서 몸으로 밀고 대시로 들이받아 상대를 링 밖으로! 3점 먼저.
// 시간이 지나면 링이 점점 줄어든다.
(() => {
  const U = Duo.U;
  const WIN = 3, CX = Duo.W / 2, CY = Duo.H / 2, R0 = 160, RMIN = 70, BODY = 16;
  const ACC = 520, MAXV = 150, DASHV = 380;

  function ringR(st) { return Math.max(RMIN, R0 - Math.max(0, st.rt - 6) * 6); }

  function place(st) {
    st.c = [U.newChar(0, CX, CY + 70), U.newChar(1, CX, CY - 70)];
    for (const c of st.c) { c.vx = 0; c.vy = 0; }
    st.rt = 0; st.ph = 'play'; st.t = 0; st.out = -1;
  }

  Duo.register({
    id: 'sumo',
    name: '밀어내기 씨름',
    icon: '🧲',
    type: 'vs',
    desc: '링 위에서 밀고 대시로 들이받아 상대를 밖으로! 링은 점점 작아져요. 3점 먼저',
    ctl: 'stick',
    btn: '대시',

    init() {
      const st = { sc: [0, 0], c: null, rt: 0, ph: 'play', t: 0, out: -1 };
      place(st);
      return st;
    },

    update(st, inp, dt) {
      st.t += dt;
      if (st.ph === 'show') {
        for (const c of st.c) { c.x += c.vx * dt; c.y += c.vy * dt; c.vx *= 0.9; c.vy *= 0.9; }
        if (st.t > 1.6) {
          if (Math.max(st.sc[0], st.sc[1]) >= WIN) { st.over = { w: st.sc[0] > st.sc[1] ? 0 : 1 }; return; }
          place(st);
        }
        return;
      }
      st.rt += dt;
      for (const p of [0, 1]) {
        const c = st.c[p], i = inp[p];
        c.dash = Math.max(0, c.dash - dt);
        c.cd = Math.max(0, c.cd - dt);
        let ix = i.x, iy = i.y;
        const len = Math.hypot(ix, iy);
        if (len > 1) { ix /= len; iy /= len; }
        if (len > 0.2) { const l = Math.hypot(ix, iy); c.fx = ix / l; c.fy = iy / l; }
        if (U.edge(st, inp, p, 'ac') && c.cd <= 0) {
          c.vx = c.fx * DASHV; c.vy = c.fy * DASHV; c.dash = 0.18; c.cd = 1.2; U.fx(st, 'dash');
        }
        if (c.dash <= 0) {
          c.vx += ix * ACC * dt; c.vy += iy * ACC * dt;
          const sp = Math.hypot(c.vx, c.vy);
          if (sp > MAXV) { c.vx *= 0.88; c.vy *= 0.88; }   // 대시 뒤에는 서서히 감속
        }
        const fr = Math.exp(-2.6 * dt);
        if (len < 0.2) { c.vx *= fr; c.vy *= fr; }
        c.x += c.vx * dt; c.y += c.vy * dt;
        c.mv = Math.hypot(c.vx, c.vy) > 25 ? 1 : 0;
      }
      // 부딪히기: 겹친 만큼 떼어 놓고 속도를 주고받는다 (대시로 박으면 상대가 크게 밀려남)
      const [a, b] = st.c;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01;
      if (d < BODY * 2) {
        const nx = dx / d, ny = dy / d, ov = BODY * 2 - d;
        a.x -= nx * ov / 2; a.y -= ny * ov / 2; b.x += nx * ov / 2; b.y += ny * ov / 2;
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel > 0) {
          const j = rel * 0.9;
          a.vx -= nx * j; a.vy -= ny * j; b.vx += nx * j; b.vy += ny * j;
          U.fx(st, rel > 250 ? 'smash' : 'hit');
        }
      }
      // 링 밖으로 나가면 상대 1점
      const R = ringR(st);
      const outs = st.c.filter((c) => Math.hypot(c.x - CX, c.y - CY) > R);
      if (outs.length) {
        // 둘 다 같은 순간 나가면 더 멀리 나간 사람이 진다
        const o = outs.length === 2
          ? (Math.hypot(a.x - CX, a.y - CY) > Math.hypot(b.x - CX, b.y - CY) ? a : b)
          : outs[0];
        st.out = o.p; o.down = 1;
        st.sc[1 - o.p]++;
        st.ph = 'show'; st.t = 0;
        U.fx(st, 'score');
      }
    },

    pack(st) {
      st.c.forEach((c) => { U.packChar(c); c.vx = Math.round(c.vx); c.vy = Math.round(c.vy); });
      st.rt = U.r1(st.rt);
    },

    render(ctx, st, t) {
      ctx.fillStyle = '#0c1a2c';
      ctx.fillRect(0, 0, Duo.W, Duo.H);
      // 물결
      ctx.strokeStyle = 'rgba(125,211,252,.08)'; ctx.lineWidth = 2;
      for (let y = 20; y < Duo.H; y += 40) {
        ctx.beginPath();
        for (let x = 0; x <= Duo.W; x += 12) ctx.lineTo(x, y + Math.sin(x / 30 + t * 2 + y) * 3);
        ctx.stroke();
      }
      const R = ringR(st);
      ctx.fillStyle = '#c9a46a';
      ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d8b67e';
      ctx.beginPath(); ctx.arc(CX, CY, R * 0.82, 0, Math.PI * 2); ctx.fill();
      // 줄어드는 중이면 테두리가 빨갛게 깜빡
      const shrinking = st.ph === 'play' && st.rt > 6 && R > RMIN;
      ctx.strokeStyle = shrinking && Math.floor(t * 4) % 2 ? '#ef4444' : '#f5f0e6';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(CX, CY, R, 0, Math.PI * 2); ctx.stroke();
      // 시작선
      ctx.fillStyle = 'rgba(80,50,20,.35)';
      ctx.fillRect(CX - 22, CY + 40, 44, 5); ctx.fillRect(CX - 22, CY - 45, 44, 5);
      for (const c of st.c) {
        // 바깥으로 떨어진 사람은 작아지며 물에 빠지는 느낌
        const fell = st.ph === 'show' && st.out === c.p;
        U.drawChar(ctx, c, t, fell ? Math.max(6, 13 - st.t * 6) : 13);
        if (fell && st.t < 1) {
          ctx.strokeStyle = 'rgba(125,211,252,.7)'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(c.x, c.y, 10 + st.t * 40, 0, Math.PI * 2); ctx.stroke();
        }
      }
      U.pips(ctx, CX, 22, st.sc[1], WIN, Duo.COLORS[1]);
      U.pips(ctx, CX, Duo.H - 22, st.sc[0], WIN, Duo.COLORS[0]);
    },

    hud: (st, p) => `${st.sc[p]} / ${WIN}점`,
    status(st, p) {
      if (st.ph === 'show') return st.out === p ? '떨어졌어요! 💦' : '밀어냈다! +1점';
      if (st.c[p].cd > 0) return '대시 충전 중…';
      return st.rt > 6 ? '링이 줄어들어요! 밀어내기!' : '밀고 대시로 들이받기!';
    },
  });
})();
