'use strict';
// [대결] 퐁 하키: 판을 좌우로 움직여 공을 받아치기. 공이 맞기 직전에 스매시를 누르면 강하게! 5점 먼저.
(() => {
  const U = Duo.U;
  const WIN = 5, PW = 74, PH = 12, BR = 8, Y = [446, 34];

  function serve(st, toward) {
    const a = U.rand(-0.5, 0.5);
    st.b = { x: Duo.W / 2, y: Duo.H / 2, vx: Math.sin(a) * 210, vy: Math.cos(a) * 210 * (toward === 0 ? 1 : -1), sp: 210, wait: 0.9 };
  }

  Duo.register({
    id: 'pong',
    name: '퐁 하키',
    icon: '🏓',
    type: 'vs',
    desc: '판을 움직여 공을 받아쳐요. 맞기 직전 스매시로 강타! 5점 먼저',
    ctl: 'stick',
    btn: '스매시',

    init() {
      const st = { sc: [0, 0], px: [Duo.W / 2, Duo.W / 2], sm: [0, 0], hitT: [0, 0], b: null };
      serve(st, U.irand(0, 1));
      return st;
    },

    update(st, inp, dt) {
      for (const p of [0, 1]) {
        st.px[p] = U.clamp(st.px[p] + inp[p].x * 360 * dt, PW / 2, Duo.W - PW / 2);
        if (U.edge(st, inp, p, 'ac')) st.sm[p] = 0.28;
        st.sm[p] = Math.max(0, st.sm[p] - dt);
        st.hitT[p] = Math.max(0, st.hitT[p] - dt);
      }
      const b = st.b;
      if (b.wait > 0) { b.wait -= dt; return; }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < BR) { b.x = BR; b.vx = Math.abs(b.vx); U.fx(st, 'wall'); }
      if (b.x > Duo.W - BR) { b.x = Duo.W - BR; b.vx = -Math.abs(b.vx); U.fx(st, 'wall'); }
      for (const p of [0, 1]) {
        const dir = p === 0 ? 1 : -1;          // 공이 이 판 쪽으로 오는 방향
        const face = Y[p] - (dir * PH) / 2;
        const coming = b.vy * dir > 0;
        const reached = p === 0 ? b.y + BR >= face && b.y < Y[p] + PH : b.y - BR <= face && b.y > Y[p] - PH;
        if (coming && reached && Math.abs(b.x - st.px[p]) <= PW / 2 + BR) {
          const off = U.clamp((b.x - st.px[p]) / (PW / 2), -1, 1);
          const smash = st.sm[p] > 0;
          b.sp = Math.min(smash ? 620 : 520, b.sp + (smash ? 110 : 18));
          const ang = off * 1.0;
          b.vx = Math.sin(ang) * b.sp;
          b.vy = -dir * Math.cos(ang) * b.sp;
          b.y = face - dir * BR;
          st.sm[p] = 0;
          st.hitT[p] = smash ? 0.3 : 0.12;
          U.fx(st, smash ? 'smash' : 'hit');
        }
      }
      if (b.y > Duo.H + 20 || b.y < -20) {
        const scorer = b.y > Duo.H ? 1 : 0;
        st.sc[scorer]++;
        U.fx(st, 'score');
        if (st.sc[scorer] >= WIN) { st.over = { w: scorer }; return; }
        serve(st, 1 - scorer);
      }
    },

    pack(st) {
      const r = U.r1;
      st.b.x = r(st.b.x); st.b.y = r(st.b.y); st.px = st.px.map(r);
    },

    render(ctx, st, t) {
      ctx.fillStyle = '#0f1d2b';
      ctx.fillRect(0, 0, Duo.W, Duo.H);
      ctx.strokeStyle = 'rgba(255,255,255,.08)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(Duo.W / 2, Duo.H / 2, 50, 0, Math.PI * 2); ctx.stroke();
      U.midline(ctx);
      // 골 라인
      ctx.fillStyle = Duo.COLORS[0] + '33'; ctx.fillRect(0, Duo.H - 6, Duo.W, 6);
      ctx.fillStyle = Duo.COLORS[1] + '33'; ctx.fillRect(0, 0, Duo.W, 6);
      for (const p of [0, 1]) {
        const x = st.px[p] - PW / 2, y = Y[p] - PH / 2;
        ctx.fillStyle = st.hitT[p] > 0 ? '#fff' : Duo.COLORS[p];
        ctx.beginPath(); ctx.roundRect(x, y, PW, PH, 6); ctx.fill();
        if (st.sm[p] > 0) { ctx.strokeStyle = '#facc15'; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(x - 4, y - 4, PW + 8, PH + 8, 9); ctx.stroke(); }
        U.pips(ctx, Duo.W / 2, p ? 70 : 410, st.sc[p], WIN, Duo.COLORS[p]);
      }
      const b = st.b;
      if (b.wait > 0 && Math.floor(t * 8) % 2) return;
      const hot = b.sp > 420;
      ctx.fillStyle = hot ? '#fb923c' : '#f8fafc';
      ctx.beginPath(); ctx.arc(b.x, b.y, BR, 0, Math.PI * 2); ctx.fill();
      if (hot) { ctx.fillStyle = 'rgba(251,146,60,.3)'; ctx.beginPath(); ctx.arc(b.x - b.vx * 0.03, b.y - b.vy * 0.03, BR, 0, Math.PI * 2); ctx.fill(); }
    },

    hud: (st, p) => `${st.sc[p]} / ${WIN}점`,
    status: () => '좌우로 움직이기 · 공이 닿기 직전 스매시!',
  });
})();
