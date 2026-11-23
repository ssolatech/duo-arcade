'use strict';
// [협동] 보석 대작전: 제한 시간 안에 둘이 합쳐 목표 개수만큼 보석 모으기.
// 돌아다니는 슬라임에 닿으면 잠깐 기절. 대시 중에는 슬라임을 밀쳐낼 수 있다.
(() => {
  const U = Duo.U;
  const TIME = 35;
  const goal = (s) => 8 + s * 2;

  function gem(st) {
    st.gems.push({ x: U.rand(24, Duo.W - 24), y: U.rand(30, Duo.H - 30), k: U.irand(0, 2) });
  }
  function slime(st) {
    const a = U.rand(0, Math.PI * 2), sp = 45 + st.stage * 7;
    st.sl.push({ x: U.rand(40, Duo.W - 40), y: Duo.H / 2 + U.rand(-40, 40), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, turn: U.rand(1, 3) });
  }

  Duo.register({
    id: 'gems',
    name: '보석 대작전',
    icon: '💎',
    type: 'coop',
    desc: '둘이 합쳐 목표만큼 보석 모으기! 슬라임은 피하거나 대시로 밀쳐요',
    ctl: 'stick',
    btn: '대시',

    init(opts) {
      const stage = opts.stage || 1;
      const st = { stage, time: TIME, got: 0, goal: goal(stage), gems: [], sl: [], c: [U.newChar(0, 180, 430), U.newChar(1, 180, 50)], each: [0, 0] };
      for (let i = 0; i < 5; i++) gem(st);
      for (let i = 0; i < 1 + Math.floor(stage / 2); i++) slime(st);
      return st;
    },

    update(st, inp, dt) {
      st.time -= dt;
      for (const p of [0, 1]) U.stepChar(st, st.c[p], inp[p], dt, 135, U.edge(st, inp, p, 'ac'));
      for (const s of st.sl) {
        s.turn -= dt;
        if (s.turn <= 0) {
          s.turn = U.rand(1, 3);
          const sp = Math.hypot(s.vx, s.vy);
          // 가끔 가까운 사람 쪽으로 방향을 튼다
          const tgt = U.d2(s, st.c[0]) < U.d2(s, st.c[1]) ? st.c[0] : st.c[1];
          const a = Math.random() < 0.5 ? Math.atan2(tgt.y - s.y, tgt.x - s.x) : U.rand(0, Math.PI * 2);
          s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp;
        }
        s.x += s.vx * dt; s.y += s.vy * dt;
        if (s.x < 16 || s.x > Duo.W - 16) { s.vx *= -1; s.x = U.clamp(s.x, 16, Duo.W - 16); }
        if (s.y < 16 || s.y > Duo.H - 16) { s.vy *= -1; s.y = U.clamp(s.y, 16, Duo.H - 16); }
        for (const c of st.c) {
          if (U.d2(c, s) < 25 * 25) {
            if (c.dash > 0) {
              const a = Math.atan2(s.y - c.y, s.x - c.x), sp = Math.hypot(s.vx, s.vy);
              s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp;
              s.x = U.clamp(s.x + Math.cos(a) * 20, 16, Duo.W - 16); s.y = U.clamp(s.y + Math.sin(a) * 20, 16, Duo.H - 16);
              U.fx(st, 'hit');
            } else if (c.stun <= 0 && c.inv <= 0) { c.stun = 1.2; c.inv = 2; U.fx(st, 'stun'); }
          }
        }
      }
      for (let i = st.gems.length - 1; i >= 0; i--) {
        const g = st.gems[i];
        for (const c of st.c) {
          if (c.stun <= 0 && U.d2(c, g) < 22 * 22) {
            st.got++; st.each[c.p]++;
            U.fx(st, 'coin');
            st.gems.splice(i, 1); gem(st);
            break;
          }
        }
      }
      if (st.got >= st.goal) { st.over = { clear: true }; U.fx(st, 'big'); return; }
      if (st.time <= 0) st.over = { clear: false };
    },

    pack(st) {
      st.c.forEach(U.packChar);
      st.sl.forEach((s) => { s.x = U.r1(s.x); s.y = U.r1(s.y); s.vx = Math.round(s.vx); s.vy = Math.round(s.vy); s.turn = U.r1(s.turn); });
      st.gems.forEach((g) => { g.x = U.r1(g.x); g.y = U.r1(g.y); });
      st.time = U.r1(st.time);
    },

    render(ctx, st, t) {
      U.floor(ctx, '#241a12', '#2a1f16');
      U.timeBar(ctx, st.time / TIME, '#38bdf8');
      // 목표 진행 (가운데 줄 위에 금색으로 덧칠)
      ctx.fillStyle = '#facc15';
      const w = Duo.W * Math.min(1, st.got / st.goal);
      ctx.fillRect((Duo.W - w) / 2, Duo.H / 2 + 4, w, 4);
      const GC = ['#22d3ee', '#a78bfa', '#4ade80'];
      for (const g of st.gems) {
        const b = Math.sin(t * 5 + g.x) * 2;
        ctx.save(); ctx.translate(g.x, g.y + b);
        ctx.fillStyle = GC[g.k];
        ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(9, -2); ctx.lineTo(0, 10); ctx.lineTo(-9, -2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.6)';
        ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(4, -2); ctx.lineTo(-4, -2); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      for (const s of st.sl) {
        const sq = 1 + Math.sin(t * 8 + s.x) * 0.08;
        ctx.save(); ctx.translate(s.x, s.y); ctx.scale(1 / sq, sq);
        ctx.fillStyle = '#84cc16';
        ctx.beginPath(); ctx.arc(0, 0, 15, Math.PI, 0); ctx.lineTo(15, 10); ctx.lineTo(-15, 10); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#1b1b2a';
        ctx.fillRect(-7, -4, 4, 5); ctx.fillRect(3, -4, 4, 5);
        ctx.restore();
      }
      for (const c of st.c) U.drawChar(ctx, c, t);
    },

    hud: (st) => `${st.stage}판 · 💎 ${st.got}/${st.goal}`,
    status(st, p) {
      return `${Math.ceil(Math.max(0, st.time))}초 · 내가 ${st.each[p]}개`;
    },
  });
})();
