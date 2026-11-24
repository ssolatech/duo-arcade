'use strict';
// [대결] 줄다리기: 버튼을 마구 연타해서 줄 가운데 깃발을 내 쪽 선까지 끌어오기. 2판 먼저!
// 시간이 갈수록 한 번 당길 때 힘이 세져서 비슷한 실력이어도 언젠가 끝난다.
(() => {
  const U = Duo.U;
  const WIN = 2, CY = Duo.H / 2, SPAN = 130, MAXTAP = 4, LIMIT = 25;

  function reset(st) { st.pos = 0; st.rt = 0; st.ph = 'play'; st.t = 0; st.rw = -1; st.pull = [0, 0]; }

  Duo.register({
    id: 'tug',
    name: '줄다리기',
    icon: '🪢',
    type: 'vs',
    desc: '버튼을 마구 연타해서 깃발을 내 쪽으로! 한 판 25초, 2판 먼저 이기면 승리',
    ctl: 'btn',
    btn: '당겨!',

    init() {
      const st = { sc: [0, 0], taps: [0, 0] };
      reset(st);
      return st;
    },

    update(st, inp, dt) {
      st.t += dt;
      st.pull = st.pull.map((v) => Math.max(0, v - dt));
      // 연타 수 = 누른 횟수 카운터가 늘어난 만큼 (한 프레임에 너무 많으면 잘라냄)
      const n = [0, 0];
      for (const p of [0, 1]) {
        const v = inp[p].ac | 0, l = st._lc[p], prev = l.ac;
        l.ac = v;
        if (prev !== undefined) n[p] = U.clamp(v - prev, 0, MAXTAP);
      }
      if (st.ph === 'show') {
        if (st.t > 1.8) {
          if (Math.max(st.sc[0], st.sc[1]) >= WIN) { st.over = { w: st.sc[0] > st.sc[1] ? 0 : 1 }; return; }
          reset(st);
        }
        return;
      }
      st.rt += dt;
      const force = 0.03 + st.rt * 0.003;
      // 1P는 아래(+), 2P는 위(-)로 당긴다
      st.pos += (n[0] - n[1]) * force;
      for (const p of [0, 1]) if (n[p]) { st.pull[p] = 0.12; st.taps[p] += n[p]; }
      // 한 판 최대 25초: 끝나면 깃발이 내 쪽에 더 가까운 사람이 이긴다
      if (Math.abs(st.pos) >= 1 || (st.rt >= LIMIT && st.pos !== 0)) {
        st.rw = st.pos > 0 ? 0 : 1;
        if (Math.abs(st.pos) >= 1) st.pos = st.rw === 0 ? 1 : -1;
        st.sc[st.rw]++;
        st.ph = 'show'; st.t = 0;
        U.fx(st, 'score');
      }
    },

    pack(st) { st.pos = Math.round(st.pos * 1000) / 1000; st.rt = U.r1(st.rt); st.pull = st.pull.map(U.r1); },

    render(ctx, st, t) {
      U.floor(ctx, '#1d2a17', '#213019');
      const fy = CY + st.pos * SPAN;
      // 각자 끌어와야 하는 선
      for (const p of [0, 1]) {
        const y = CY + (p ? -SPAN : SPAN);
        ctx.fillStyle = Duo.COLORS[p] + '55';
        ctx.fillRect(0, y - 3, Duo.W, 6);
        ctx.fillStyle = Duo.COLORS[p];
        for (let x = 6; x < Duo.W; x += 24) ctx.fillRect(x, y - 3, 12, 6);
      }
      // 가운데 = 남은 시간 막대
      U.timeBar(ctx, st.ph === 'play' ? 1 - st.rt / LIMIT : 0, 'rgba(255,255,255,.35)');
      // 사람 위치는 깃발을 따라 움직인다
      const py = [fy + 100 + (st.pull[0] > 0 ? 4 : 0), fy - 100 - (st.pull[1] > 0 ? 4 : 0)];
      // 밧줄
      ctx.strokeStyle = '#b08954'; ctx.lineWidth = 6;
      ctx.beginPath();
      for (let y = py[1]; y <= py[0]; y += 6) ctx.lineTo(Duo.W / 2 + Math.sin(y / 9 + t * 20) * (st.ph === 'play' ? 1.2 : 0), y);
      ctx.stroke();
      ctx.strokeStyle = '#8a6a3f'; ctx.lineWidth = 2;
      for (let y = py[1]; y < py[0]; y += 10) { ctx.beginPath(); ctx.moveTo(Duo.W / 2 - 3, y); ctx.lineTo(Duo.W / 2 + 3, y + 5); ctx.stroke(); }
      // 깃발 (가운데 표시)
      ctx.fillStyle = '#facc15';
      ctx.beginPath(); ctx.moveTo(Duo.W / 2, fy - 12); ctx.lineTo(Duo.W / 2 + 26, fy); ctx.lineTo(Duo.W / 2, fy + 12); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(Duo.W / 2, fy - 12); ctx.lineTo(Duo.W / 2 - 26, fy); ctx.lineTo(Duo.W / 2, fy + 12); ctx.closePath(); ctx.fill();
      for (const p of [0, 1]) {
        const lose = st.ph === 'show' && st.rw === 1 - p;
        const c = { p, x: Duo.W / 2, y: U.clamp(py[p], 20, Duo.H - 20), fx: 0, fy: 1, dash: 0, inv: 0, mv: st.pull[p] > 0 ? 1 : 0, stun: lose ? 1 : 0, down: 0 };
        U.drawChar(ctx, c, t, 18);
      }
      U.pips(ctx, 40, Duo.H - 22, st.sc[0], WIN, Duo.COLORS[0]);
      U.pips(ctx, Duo.W - 40, 22, st.sc[1], WIN, Duo.COLORS[1]);
    },

    hud: (st, p) => `${st.sc[p]} / ${WIN}판`,
    status(st, p) {
      if (st.ph === 'show') return st.rw === p ? '이겼다! 💪' : '끌려갔어요…';
      const me = p === 0 ? st.pos : -st.pos;
      const left = Math.ceil(Math.max(0, LIMIT - st.rt));
      const tip = left <= 5 ? `${left}초! ` : '';
      return tip + (me > 0.5 ? '거의 다 왔어요! 연타!' : me < -0.5 ? '위험해요!! 더 빨리!' : '연타! 연타!');
    },
  });
})();
