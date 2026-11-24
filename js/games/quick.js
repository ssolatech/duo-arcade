'use strict';
// [대결] 번개 반응: 번개 신호가 뜨면 먼저 누른 사람이 1점. 신호 전에 누르면 반칙. 3점 먼저!
(() => {
  const U = Duo.U;
  const WIN = 3;
  // 온라인에서도 공평하게: 각 기기에서 "신호를 본 순간 → 누른 순간"의 반응 시간을 직접 재서 보낸다.
  // seenKey: 이번 신호(goAt은 판마다 무작위라 이전 게임 기록과 섞이지 않음)를 본 순간
  const seenKey = [-1, -1], seenAt = [0, 0], lastAc = [-1, -1];

  Duo.register({
    id: 'quick',
    name: '번개 반응',
    icon: '⚡',
    type: 'vs',
    desc: '번개가 치면 먼저 탭! 미리 누르면 반칙. 3점 먼저 따면 승리',
    ctl: 'btn',
    btn: '탭!',

    init() {
      return { round: 1, sc: [0, 0], ph: 'wait', t: 0, goAt: U.rand(1.5, 4), rt: [0, 0], first: -1, win: -1, foul: -1 };
    },

    annotate(st, inp, p, now) {
      if (st.ph === 'go' && seenKey[p] !== st.goAt) { seenKey[p] = st.goAt; seenAt[p] = now; }
      if (lastAc[p] === -1) lastAc[p] = inp.ac;
      if (inp.ac > lastAc[p] && st.ph === 'go' && seenKey[p] === st.goAt) {
        inp.rt = Math.max(1, Math.round(now - seenAt[p]));
        inp.rr = st.round;
      }
      lastAc[p] = inp.ac;
    },

    update(st, inp, dt) {
      st.t += dt;
      for (const p of [0, 1]) {
        if (!U.edge(st, inp, p, 'ac')) continue;
        // 신호 전에 누름 = 반칙. 온라인에서는 신호가 화면에 뜨기 전에 누른 입력이 늦게 도착할 수 있는데,
        // 그때는 반응 기록(rr)이 없으니 그것도 반칙으로 본다 (예전엔 방장 시간으로 재서 너무 빠른 기록이 됐음).
        const early = st.ph === 'go' && !st.rt[p] && inp[p].rr !== st.round;
        if (st.ph === 'wait' || early) {
          st.foul = p; st.win = 1 - p; st.sc[1 - p]++; st.ph = 'show'; st.t = 0;
          U.fx(st, 'bad');
          return;
        }
        if (st.ph === 'go' && !st.rt[p]) {
          st.rt[p] = inp[p].rt > 0 ? inp[p].rt : Math.max(1, Math.round(st.t * 1000));
          if (st.first < 0) st.first = st.t;
        }
      }
      if (st.ph === 'wait' && st.t >= st.goAt) { st.ph = 'go'; st.t = 0; U.fx(st, 'go'); }
      else if (st.ph === 'go') {
        // 먼저 누른 신호가 도착한 뒤 0.35초까지 상대 기록을 기다렸다가 비교 (네트워크 지연 보정)
        const both = st.rt[0] && st.rt[1];
        if (both || (st.first >= 0 && st.t - st.first > 0.35) || st.t > 3) {
          if (!st.rt[0] && !st.rt[1]) st.win = -1;
          else if (!st.rt[1]) st.win = 0;
          else if (!st.rt[0]) st.win = 1;
          else st.win = st.rt[0] <= st.rt[1] ? 0 : 1;
          if (st.win >= 0) { st.sc[st.win]++; U.fx(st, 'score'); }
          st.ph = 'show'; st.t = 0;
        }
      } else if (st.ph === 'show' && st.t > 1.8) {
        if (Math.max(st.sc[0], st.sc[1]) >= WIN) { st.over = { w: st.sc[0] > st.sc[1] ? 0 : 1 }; return; }
        Object.assign(st, { round: st.round + 1, ph: 'wait', t: 0, goAt: U.rand(1.5, 4.5), rt: [0, 0], first: -1, win: -1, foul: -1 });
      }
    },

    render(ctx, st, t) {
      const go = st.ph === 'go';
      ctx.fillStyle = go ? '#3b2f05' : '#14101f';
      ctx.fillRect(0, 0, Duo.W, Duo.H);
      if (go) { ctx.fillStyle = 'rgba(250,204,21,.18)'; ctx.fillRect(0, 0, Duo.W, Duo.H); }
      Duo.U.midline(ctx);
      // 번개
      if (go || (st.ph === 'show' && st.foul < 0)) {
        ctx.save();
        ctx.translate(Duo.W / 2, Duo.H / 2);
        ctx.fillStyle = go ? '#facc15' : 'rgba(250,204,21,.35)';
        ctx.beginPath();
        ctx.moveTo(10, -70); ctx.lineTo(-30, 8); ctx.lineTo(-2, 8); ctx.lineTo(-12, 70);
        ctx.lineTo(30, -12); ctx.lineTo(2, -12); ctx.lineTo(14, -70);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      } else if (st.ph === 'wait') {
        // 기다리는 동안: 점 세 개가 깜빡
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = Math.floor(t * 3) % 3 === i ? '#8c84a3' : '#2e2742';
          ctx.beginPath(); ctx.arc(Duo.W / 2 + (i - 1) * 26, Duo.H / 2, 7, 0, Math.PI * 2); ctx.fill();
        }
      }
      // 캐릭터
      for (const p of [0, 1]) {
        const lose = st.ph === 'show' && st.win === 1 - p;
        const winNow = st.ph === 'show' && st.win === p;
        const c = { p, x: Duo.W / 2, y: p ? 110 : 370, fx: 0, fy: 1, dash: 0, inv: 0, mv: 0, stun: lose ? 1 : 0, down: 0 };
        if (winNow) c.y += Math.sin(t * 14) * 6 * (p ? 1 : -1);
        Duo.U.drawChar(ctx, c, t, 22);
        if (st.foul === p && st.ph === 'show') {
          ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 6;
          ctx.beginPath(); ctx.moveTo(c.x - 34, c.y - 34); ctx.lineTo(c.x + 34, c.y + 34);
          ctx.moveTo(c.x + 34, c.y - 34); ctx.lineTo(c.x - 34, c.y + 34); ctx.stroke();
        }
        Duo.U.pips(ctx, Duo.W / 2, p ? 50 : 430, st.sc[p], WIN, Duo.COLORS[p]);
      }
    },

    hud: (st, p) => `${st.sc[p]} / ${WIN}점`,
    status(st, p) {
      if (st.ph === 'wait') return '번개를 기다려요…';
      if (st.ph === 'go') return st.rt[p] ? '눌렀다!' : '지금!!';
      if (st.foul === p) return '너무 빨랐어요! 반칙';
      if (st.foul === 1 - p) return '상대 반칙! +1점';
      if (st.win === p) return `이겼다! ${st.rt[p]}ms`;
      if (st.win === -1) return '아무도 안 눌렀어요';
      return st.rt[p] ? `아깝다! ${st.rt[p]}ms` : '놓쳤어요';
    },
  });
})();
