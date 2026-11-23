'use strict';
// 게임 공용 도구. 모든 게임은 360x480 크기의 같은 경기장 좌표를 쓴다.
// 1P(파랑)는 아래쪽, 2P(분홍)는 위쪽에서 시작한다.
// 경기장 캔버스에는 글자를 그리지 않는다 (마주 앉으면 한쪽은 거꾸로 보이니까). 글자는 각자 조작판에 표시.
const Duo = {
  W: 360,
  H: 480,
  COLORS: ['#38bdf8', '#fb7185'],
  DARK: ['#0369a1', '#be123c'],
  games: [],
  register(g) { this.games.push(g); },
  find(id) { return this.games.find((g) => g.id === id); },
};

Duo.U = {
  clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
  rand: (a, b) => a + Math.random() * (b - a),
  irand: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
  d2(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; },
  r1: (v) => Math.round(v * 10) / 10,   // 네트워크로 보낼 값 줄이기

  // 버튼을 "새로" 눌렀는지 (누른 횟수 카운터 비교). 게임 시작 직후 이전 입력은 무시.
  edge(st, inputs, p, key) {
    const v = inputs[p][key] | 0;
    const l = st._lc[p];
    const prev = l[key];
    l[key] = v;
    return prev !== undefined && v > prev;
  },

  fx(st, name) { st.fx.push(name); },

  // ---------- 캐릭터 (이동 + 대시 + 기절) ----------
  newChar(p, x, y) {
    return { p, x, y, fx: 0, fy: 1, dash: 0, cd: 0, stun: 0, inv: 0, down: 0, rev: 0, mv: 0 };
  },

  stepChar(st, c, inp, dt, spd, dashPressed) {
    const U = Duo.U;
    c.dash = Math.max(0, c.dash - dt);
    c.cd = Math.max(0, c.cd - dt);
    c.stun = Math.max(0, c.stun - dt);
    c.inv = Math.max(0, c.inv - dt);
    if (c.stun > 0 || c.down) { c.mv = 0; return; }
    let ix = inp.x, iy = inp.y;
    const len = Math.hypot(ix, iy);
    if (len > 1) { ix /= len; iy /= len; }
    if (len > 0.2) { const l = Math.hypot(ix, iy); c.fx = ix / l; c.fy = iy / l; }
    if (dashPressed && c.cd <= 0) { c.dash = 0.2; c.cd = 1.3; U.fx(st, 'dash'); }
    let vx = ix * spd, vy = iy * spd;
    if (c.dash > 0) { vx = c.fx * spd * 2.8; vy = c.fy * spd * 2.8; }
    c.x = U.clamp(c.x + vx * dt, 14, Duo.W - 14);
    c.y = U.clamp(c.y + vy * dt, 14, Duo.H - 14);
    c.mv = (vx || vy) ? 1 : 0;
  },

  // 네트워크로 보낼 때 소수점 정리
  packChar(c) {
    const r = Duo.U.r1;
    c.x = r(c.x); c.y = r(c.y); c.fx = Math.round(c.fx * 100) / 100; c.fy = Math.round(c.fy * 100) / 100;
  },

  // ---------- 그리기 ----------
  floor(ctx, a, b) {
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, Duo.W, Duo.H);
    ctx.fillStyle = b;
    for (let y = 0; y < Duo.H; y += 30) for (let x = (y / 30) % 2 ? 30 : 0; x < Duo.W; x += 60) ctx.fillRect(x, y, 30, 30);
  },

  midline(ctx) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.setLineDash([10, 10]);
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, Duo.H / 2); ctx.lineTo(Duo.W, Duo.H / 2); ctx.stroke();
    ctx.restore();
  },

  // 각자 꾸민 캐릭터로 그린다 (Duo.looks = [1P 외형, 2P 외형]). 발밑 고리 색으로 1P/2P 구분.
  drawChar(ctx, c, t, r = 13) {
    const col = Duo.COLORS[c.p];
    if (c.inv > 0 && Math.floor(t * 12) % 2) return;
    const look = (Duo.looks && Duo.looks[c.p]) || Avatar.DEFAULT[c.p];
    const k = r / 13;
    if (c.dash > 0) {
      ctx.fillStyle = col + '55';
      ctx.beginPath(); ctx.arc(c.x - c.fx * 16, c.y - c.fy * 16, r, 0, Math.PI * 2); ctx.fill();
    }
    // 참가자 화면은 경기장이 180도 돌아가 있으므로, 캐릭터만 다시 돌려서 똑바로 서 있게 그린다.
    // (바라보는 방향도 화면 기준으로 뒤집어 준다)
    const s = Duo.flipped ? -1 : 1;
    ctx.save();
    ctx.translate(c.x, c.y);
    if (Duo.flipped) ctx.rotate(Math.PI);
    Avatar.draw(ctx, look, 0, -4 * k, k, {
      fx: c.fx * s, fy: c.fy * s, ring: col,
      bob: c.mv ? Math.sin(t * 18) * 1.2 : 0,
      ko: c.down || c.stun > 0,
      alpha: c.down ? 0.5 : 1,
    });
    if (c.stun > 0) {
      for (let i = 0; i < 3; i++) {
        const a = t * 6 + (i * Math.PI * 2) / 3;
        Duo.U.drawStar(ctx, Math.cos(a) * 14 * k, -30 * k + Math.sin(a) * 4, 4, '#facc15');
      }
    }
    ctx.restore();
  },

  drawStar(ctx, x, y, r, color, rot = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 ? r * 0.45 : r;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  },

  // 남은 시간 막대 (경기장 가장자리, 글자 없이)
  timeBar(ctx, ratio, color = '#facc15') {
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    ctx.fillRect(0, Duo.H / 2 - 2, Duo.W, 4);
    ctx.fillStyle = color;
    const w = Duo.W * Math.max(0, ratio);
    ctx.fillRect((Duo.W - w) / 2, Duo.H / 2 - 2, w, 4);
  },

  // 점수 구슬 (글자 대신)
  pips(ctx, x, y, n, max, color) {
    for (let i = 0; i < max; i++) {
      ctx.beginPath();
      ctx.arc(x + (i - (max - 1) / 2) * 16, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = i < n ? color : 'rgba(255,255,255,.12)';
      ctx.fill();
    }
  },
};
