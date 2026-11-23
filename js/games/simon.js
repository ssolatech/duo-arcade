'use strict';
// [협동] 박자 기억: 4개의 불빛 순서를 외워서 둘이 나눠서 누르기.
// 아래 두 개는 1P 담당, 위 두 개는 2P 담당. 판이 오를수록 순서가 길어진다.
(() => {
  const U = Duo.U;
  // 패드 번호: 0 = 1P 왼쪽(초록), 1 = 1P 오른쪽(파랑), 2 = 2P 기준 왼쪽(노랑, 화면 위-오른쪽), 3 = 2P 기준 오른쪽(빨강, 화면 위-왼쪽)
  const PADS = [
    { x: 95, y: 340, c: '#22c55e' },
    { x: 265, y: 340, c: '#3b82f6' },
    { x: 265, y: 140, c: '#facc15' },
    { x: 95, y: 140, c: '#ef4444' },
  ];
  const SHOW = 0.55, GAP = 0.18;

  function newSeq(st) {
    const len = 2 + st.stage;
    let seq;
    do {
      seq = [];
      for (let i = 0; i < len; i++) seq.push(U.irand(0, 3));
    } while (!seq.some((x) => x < 2) || !seq.some((x) => x >= 2));   // 둘 다 한 번은 누르게
    st.seq = seq;
    st.ph = 'show'; st.t = -0.6; st.pos = 0; st.lit = -1; st.litT = 0;
  }

  Duo.register({
    id: 'simon',
    name: '박자 기억',
    icon: '🎵',
    type: 'coop',
    desc: '불빛 순서를 외워서 둘이 나눠 누르기. 판마다 한 칸씩 길어져요',
    ctl: 'two',
    two: (p) => (p === 0 ? [PADS[0].c, PADS[1].c] : [PADS[2].c, PADS[3].c]),

    init(opts) {
      const st = { stage: opts.stage || 1, seq: [], ph: 'show', t: 0, pos: 0, lit: -1, litT: 0, wrong: -1, okT: 0 };
      newSeq(st);
      return st;
    },

    update(st, inp, dt) {
      st.t += dt;
      st.litT = Math.max(0, st.litT - dt);
      if (st.ph === 'show') {
        const step = SHOW + GAP;
        const i = Math.floor(st.t / step);
        if (st.t < 0) st.lit = -1;
        else if (i >= st.seq.length) { st.ph = 'input'; st.lit = -1; st.t = 0; }
        else {
          const on = st.t - i * step < SHOW;
          const nl = on ? st.seq[i] : -1;
          if (nl !== st.lit && nl >= 0) U.fx(st, 'pad' + nl);
          st.lit = nl;
        }
        // 보여주는 중에 누른 것은 무시
        for (const p of [0, 1]) { U.edge(st, inp, p, 'b1c'); U.edge(st, inp, p, 'b2c'); }
        return;
      }
      if (st.ph === 'input') {
        for (const p of [0, 1]) {
          for (const [k, off] of [['b1c', 0], ['b2c', 1]]) {
            if (!U.edge(st, inp, p, k) || st.ph !== 'input') continue;
            const pad = p * 2 + off;
            st.lit = pad; st.litT = 0.25;
            if (pad === st.seq[st.pos]) {
              U.fx(st, 'pad' + pad);
              st.pos++;
              if (st.pos >= st.seq.length) { st.ph = 'done'; st.t = 0; U.fx(st, 'score'); }
            } else {
              st.wrong = pad; st.ph = 'fail'; st.t = 0; U.fx(st, 'bad');
            }
          }
        }
        if (st.litT <= 0 && st.ph === 'input') st.lit = -1;
        return;
      }
      if (st.ph === 'done' && st.t > 0.8) st.over = { clear: true };
      if (st.ph === 'fail' && st.t > 1.2) st.over = { clear: false };
    },

    render(ctx, st, t) {
      ctx.fillStyle = '#120f1f';
      ctx.fillRect(0, 0, Duo.W, Duo.H);
      U.midline(ctx);
      PADS.forEach((pd, i) => {
        const on = st.lit === i || (st.ph === 'fail' && st.wrong === i && Math.floor(t * 8) % 2);
        ctx.save();
        ctx.translate(pd.x, pd.y);
        ctx.globalAlpha = on ? 1 : 0.28;
        ctx.fillStyle = pd.c;
        ctx.beginPath(); ctx.roundRect(-62, -62, 124, 124, 26); ctx.fill();
        if (on) { ctx.shadowColor = pd.c; ctx.shadowBlur = 30; ctx.fill(); }
        ctx.restore();
        // 담당자 표시 점
        ctx.fillStyle = Duo.COLORS[i < 2 ? 0 : 1];
        ctx.beginPath(); ctx.arc(pd.x, pd.y + (i < 2 ? 78 : -78), 5, 0, Math.PI * 2); ctx.fill();
      });
      // 진행도 (가운데 줄 위 구슬)
      const n = st.seq.length;
      for (let i = 0; i < n; i++) {
        const x = Duo.W / 2 + (i - (n - 1) / 2) * Math.min(22, 320 / n);
        ctx.fillStyle = st.ph === 'input' || st.ph === 'done' ? (i < st.pos ? '#facc15' : 'rgba(255,255,255,.18)') : 'rgba(255,255,255,.18)';
        ctx.beginPath(); ctx.arc(x, Duo.H / 2, 6, 0, Math.PI * 2); ctx.fill();
      }
      if (st.ph === 'done') { ctx.fillStyle = 'rgba(34,197,94,.15)'; ctx.fillRect(0, 0, Duo.W, Duo.H); }
      if (st.ph === 'fail') { ctx.fillStyle = 'rgba(239,68,68,.15)'; ctx.fillRect(0, 0, Duo.W, Duo.H); }
    },

    hud: (st) => `${st.stage}판 · ${st.seq.length}칸`,
    status(st, p) {
      if (st.ph === 'show') return '잘 봐요… 외우는 중';
      if (st.ph === 'done') return '성공!';
      if (st.ph === 'fail') return '틀렸어요!';
      const next = st.seq[st.pos];
      return (next < 2) === (p === 0) ? '내 차례!' : '친구 차례…';
    },
  });
})();
