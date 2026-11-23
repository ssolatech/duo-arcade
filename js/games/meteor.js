'use strict';
// [협동] 별똥별 함께 피하기: 사방에서 날아오는 별똥별을 피해 버티기.
// 맞으면 쓰러지고, 친구가 옆에 1초 붙어 있으면 살아난다. 둘 다 쓰러지면 실패.
(() => {
  const U = Duo.U;
  const time = (s) => 20 + Math.min(10, s);

  function spawn(st) {
    const side = U.irand(0, 3);
    const W = Duo.W, H = Duo.H;
    const x = side === 0 ? -20 : side === 1 ? W + 20 : U.rand(0, W);
    const y = side === 2 ? -20 : side === 3 ? H + 20 : U.rand(0, H);
    // 가끔은 사람을 노리고, 대부분은 아무 곳으로
    const target = Math.random() < 0.35 ? st.c[U.irand(0, 1)] : { x: U.rand(40, W - 40), y: U.rand(60, H - 60) };
    const sp = U.rand(90, 130) + st.stage * 11;
    const a = Math.atan2(target.y - y, target.x - x);
    const r = Math.random() < 0.15 + st.stage * 0.02 ? 17 : 10;
    st.m.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r });
  }

  Duo.register({
    id: 'meteor',
    name: '별똥별 함께 피하기',
    icon: '☄️',
    type: 'coop',
    desc: '같이 버티기! 쓰러진 친구 옆에 붙어 있으면 살려낼 수 있어요',
    ctl: 'stick',
    btn: '대시',

    init(opts) {
      const stage = opts.stage || 1;
      return { stage, time: time(stage), max: time(stage), m: [], spT: 1, c: [U.newChar(0, 150, 300), U.newChar(1, 210, 180)] };
    },

    update(st, inp, dt) {
      st.time -= dt;
      for (const p of [0, 1]) U.stepChar(st, st.c[p], inp[p], dt, 140, U.edge(st, inp, p, 'ac'));
      st.spT -= dt;
      if (st.spT <= 0) { spawn(st); st.spT = Math.max(0.22, 0.95 - st.stage * 0.07) * U.rand(0.6, 1.3); }
      for (let i = st.m.length - 1; i >= 0; i--) {
        const m = st.m[i];
        m.x += m.vx * dt; m.y += m.vy * dt;
        if (m.x < -60 || m.x > Duo.W + 60 || m.y < -60 || m.y > Duo.H + 60) { st.m.splice(i, 1); continue; }
        for (const c of st.c) {
          if (!c.down && c.inv <= 0 && U.d2(c, m) < (m.r + 10) ** 2) {
            c.down = 1; c.rev = 0; U.fx(st, 'down');
          }
        }
      }
      // 살리기
      const [a, b] = st.c;
      for (const [x, y] of [[a, b], [b, a]]) {
        if (x.down && !y.down && U.d2(x, y) < 38 * 38) {
          x.rev += dt;
          if (x.rev >= 1) { x.down = 0; x.rev = 0; x.inv = 1.5; U.fx(st, 'revive'); }
        } else if (x.down) x.rev = Math.max(0, x.rev - dt * 0.5);
      }
      if (a.down && b.down) { st.over = { clear: false }; return; }
      if (st.time <= 0) st.over = { clear: true };
    },

    pack(st) {
      st.c.forEach(U.packChar);
      st.m.forEach((m) => { m.x = U.r1(m.x); m.y = U.r1(m.y); m.vx = Math.round(m.vx); m.vy = Math.round(m.vy); });
      st.time = U.r1(st.time);
    },

    render(ctx, st, t) {
      ctx.fillStyle = '#0b0a1a';
      ctx.fillRect(0, 0, Duo.W, Duo.H);
      // 배경 별
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      for (let i = 0; i < 40; i++) {
        const x = (i * 97) % Duo.W, y = (i * 53 + t * 6 * (1 + (i % 3))) % Duo.H;
        ctx.fillRect(x, y, 2, 2);
      }
      U.timeBar(ctx, st.time / st.max, '#22c55e');
      for (const c of st.c) {
        if (c.down) {
          ctx.strokeStyle = 'rgba(34,197,94,.5)'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
          ctx.beginPath(); ctx.arc(c.x, c.y, 38, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
          if (c.rev > 0) {
            ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 5;
            ctx.beginPath(); ctx.arc(c.x, c.y, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * c.rev); ctx.stroke();
          }
        }
        U.drawChar(ctx, c, t);
      }
      for (const m of st.m) {
        const sp = Math.hypot(m.vx, m.vy) || 1;
        const tx = -m.vx / sp, ty = -m.vy / sp;
        const g = ctx.createLinearGradient(m.x, m.y, m.x + tx * m.r * 4, m.y + ty * m.r * 4);
        g.addColorStop(0, 'rgba(251,146,60,.8)'); g.addColorStop(1, 'rgba(251,146,60,0)');
        ctx.strokeStyle = g; ctx.lineWidth = m.r * 1.4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x + tx * m.r * 4, m.y + ty * m.r * 4); ctx.stroke();
        ctx.fillStyle = '#fdba74';
        ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#c2410c';
        ctx.beginPath(); ctx.arc(m.x - m.r * 0.3, m.y - m.r * 0.2, m.r * 0.3, 0, Math.PI * 2); ctx.fill();
      }
      ctx.lineCap = 'butt';
    },

    hud: (st) => `${st.stage}판 · ${Math.ceil(Math.max(0, st.time))}초`,
    status(st, p) {
      const me = st.c[p], fr = st.c[1 - p];
      if (me.down) return '쓰러졌어요! 친구를 기다려요';
      if (fr.down) return '친구가 쓰러졌어요! 옆에 붙어 있기!';
      return '버티면 클리어!';
    },
  });
})();
