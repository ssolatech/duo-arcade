'use strict';
// [대결] 폭탄 돌리기: 폭탄을 든 사람이 상대에게 닿으면 폭탄이 넘어간다. 터질 때 들고 있으면 짐! 3판 먼저.
// 터지는 시간은 판마다 무작위 (폭탄이 빨리 깜빡일수록 곧 터짐). 기둥 뒤로 숨을 수 있다.
(() => {
  const U = Duo.U;
  const WIN = 3, BODY = 13;
  const PILLARS = [
    { x: 90, y: 150, r: 24 }, { x: 270, y: 330, r: 24 },
    { x: 270, y: 150, r: 16 }, { x: 90, y: 330, r: 16 },
  ];

  function round(st, holder) {
    st.c = [U.newChar(0, 180, 410), U.newChar(1, 180, 70)];
    st.hold = holder;
    st.fuse = U.rand(9, 15);
    st.max = st.fuse;
    st.pass = 1.0;          // 막 넘어온 뒤 잠깐은 다시 못 넘김 (바로 되돌려주기 방지)
    st.ph = 'play'; st.t = 0; st.boom = -1;
  }

  function pushOut(c) {
    for (const pl of PILLARS) {
      const dx = c.x - pl.x, dy = c.y - pl.y, d = Math.hypot(dx, dy) || 0.01, m = pl.r + BODY;
      if (d < m) { c.x = pl.x + (dx / d) * m; c.y = pl.y + (dy / d) * m; }
    }
  }

  Duo.register({
    id: 'bomb',
    name: '폭탄 돌리기',
    icon: '💣',
    type: 'vs',
    desc: '폭탄을 들었으면 상대에게 닿아서 넘기기! 터질 때 들고 있으면 져요. 3판 먼저',
    ctl: 'stick',
    btn: '대시',

    init() {
      const st = { sc: [0, 0] };
      round(st, U.irand(0, 1));
      return st;
    },

    update(st, inp, dt) {
      st.t += dt;
      if (st.ph === 'show') {
        if (st.t > 1.8) {
          if (Math.max(st.sc[0], st.sc[1]) >= WIN) { st.over = { w: st.sc[0] > st.sc[1] ? 0 : 1 }; return; }
          round(st, st.boom);   // 진 사람이 다음 판 폭탄을 들고 시작
        }
        return;
      }
      st.fuse -= dt;
      st.pass = Math.max(0, st.pass - dt);
      for (const p of [0, 1]) {
        const c = st.c[p];
        // 폭탄 든 사람이 조금 더 빠르다 (잡으러 가야 하니까)
        U.stepChar(st, c, inp[p], dt, p === st.hold ? 150 : 138, U.edge(st, inp, p, 'ac'));
        pushOut(c);
      }
      const [a, b] = st.c;
      if (st.pass <= 0 && U.d2(a, b) < (BODY * 2 + 2) ** 2) {
        const to = st.c[1 - st.hold];
        st.hold = 1 - st.hold;
        st.pass = 1.0;
        to.stun = 0.45;        // 받은 사람은 잠깐 멈칫 → 넘긴 사람이 도망갈 틈
        U.fx(st, 'hit');
      }
      if (st.fuse <= 0) {
        st.boom = st.hold;
        st.sc[1 - st.hold]++;
        st.c[st.hold].down = 1;
        st.ph = 'show'; st.t = 0;
        U.fx(st, 'bad');
      }
    },

    pack(st) {
      st.c.forEach(U.packChar);
      st.fuse = U.r1(st.fuse); st.pass = U.r1(st.pass);
    },

    render(ctx, st, t) {
      U.floor(ctx, '#2a1d2e', '#302233');
      for (const pl of PILLARS) {
        ctx.fillStyle = 'rgba(0,0,0,.3)';
        ctx.beginPath(); ctx.arc(pl.x + 3, pl.y + 4, pl.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#5b4a6b';
        ctx.beginPath(); ctx.arc(pl.x, pl.y, pl.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#7a6890';
        ctx.beginPath(); ctx.arc(pl.x - pl.r * 0.25, pl.y - pl.r * 0.25, pl.r * 0.55, 0, Math.PI * 2); ctx.fill();
      }
      for (const c of st.c) U.drawChar(ctx, c, t);
      const h = st.c[st.hold];
      if (st.ph === 'play') {
        // 폭탄: 남은 시간이 적을수록 빨리 깜빡이고 커진다 (정확한 시간은 안 보여줌)
        const left = st.fuse / st.max;
        const blink = left < 0.25 ? 14 : left < 0.5 ? 8 : 4;
        const red = Math.floor(t * blink) % 2 === 0;
        const s = 1 + (1 - left) * 0.35 + (left < 0.25 ? Math.sin(t * 30) * 0.06 : 0);
        const flip = Duo.flipped ? -1 : 1;
        const bx = h.x, by = h.y - 34 * flip;
        ctx.save(); ctx.translate(bx, by); ctx.scale(s, s);
        ctx.fillStyle = red ? '#ef4444' : '#1f1f2e';
        ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.5)';
        ctx.beginPath(); ctx.arc(-3, -3, 3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#a3a3a3'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(4 * flip, -8 * flip); ctx.lineTo(8 * flip, -14 * flip); ctx.stroke();
        U.drawStar(ctx, 8 * flip, -15 * flip, 4 + Math.sin(t * 40) * 1.5, '#fde047', t * 9);
        ctx.restore();
        // 막 넘겨받은 사람 주변에 고리 (아직 못 넘김)
        if (st.pass > 0) {
          ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
          ctx.beginPath(); ctx.arc(h.x, h.y, 24, 0, Math.PI * 2 * (st.pass / 1.0)); ctx.stroke(); ctx.setLineDash([]);
        }
      } else if (st.boom >= 0) {
        const c = st.c[st.boom], k = Math.min(1, st.t / 0.5);
        ctx.fillStyle = `rgba(251,146,60,${0.7 * (1 - k)})`;
        ctx.beginPath(); ctx.arc(c.x, c.y, 20 + k * 80, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(253,224,71,${0.9 * (1 - k)})`;
        ctx.beginPath(); ctx.arc(c.x, c.y, 10 + k * 45, 0, Math.PI * 2); ctx.fill();
      }
      U.pips(ctx, Duo.W / 2, 22, st.sc[1], WIN, Duo.COLORS[1]);
      U.pips(ctx, Duo.W / 2, Duo.H - 22, st.sc[0], WIN, Duo.COLORS[0]);
    },

    hud: (st, p) => `${st.sc[p]} / ${WIN}판`,
    status(st, p) {
      if (st.ph === 'show') return st.boom === p ? '펑! 💥 들고 있었어요' : '살았다! +1';
      const hot = st.fuse / st.max < 0.25;
      if (st.hold === p) return hot ? '💣 곧 터져요!! 빨리 넘겨!' : '💣 내가 들고 있어요! 닿아서 넘기기';
      return hot ? '곧 터져요! 끝까지 도망!' : '도망쳐요! 기둥 뒤로';
    },
  });
})();
