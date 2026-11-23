'use strict';
// 캐릭터 모습(외형) 정의와 그리기.
// 외형은 숫자 묶음으로만 저장한다: {g 성별(0 남,1 여), sk 피부, hs 머리모양, hc 머리색, tc 윗옷, bc 아랫옷, ac 소품}
const Avatar = (() => {
  const SKIN = ['#f7d7b5', '#efc193', '#d49a6a', '#a86b45'];
  const HAIR = ['#2b1d14', '#5b3a22', '#a0642c', '#e0b050', '#d4d4d8', '#c0392b', '#2563eb'];
  const TOP = ['#3b82f6', '#ef4444', '#22c55e', '#facc15', '#a855f7', '#f97316', '#f8fafc', '#1f2937'];
  const BOT = ['#1e3a8a', '#dc2626', '#374151', '#a16207', '#f8fafc', '#7c3aed'];
  const STYLES = ['짧은머리', '단발', '긴머리', '포니테일', '똥머리', '삐죽머리'];
  const ACC = ['없음', '모자', '안경', '별 핀', '헤드폰', '왕관'];
  const CROWN_WINS = 5;   // 왕관은 대결 5승부터

  const DEFAULT = [
    { g: 0, sk: 0, hs: 0, hc: 0, tc: 0, bc: 0, ac: 0 },   // 남자: 짧은머리 + 파란 티 + 남색 바지
    { g: 1, sk: 0, hs: 1, hc: 0, tc: 6, bc: 1, ac: 0 },   // 여자: 단발 + 흰 티 + 빨간 치마
  ];
  const LIMITS = { g: 2, sk: SKIN.length, hs: STYLES.length, hc: HAIR.length, tc: TOP.length, bc: BOT.length, ac: ACC.length };

  function clean(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const g = raw.g === 1 ? 1 : 0;
    const o = Object.assign({}, DEFAULT[g]);
    for (const k of Object.keys(LIMITS)) {
      const n = Math.floor(Number(raw[k]));
      if (Number.isFinite(n) && n >= 0 && n < LIMITS[k]) o[k] = n;
    }
    o.g = g;
    return o;
  }

  // (x, y) = 몸 중심. fx, fy = 바라보는 방향. k = 크기 배율(1 = 게임 기본 크기)
  function draw(ctx, L, x, y, k, o = {}) {
    const fx = o.fx || 0, fy = o.fy == null ? 1 : o.fy;
    const back = fy < -0.6;          // 뒤돌아 있으면 얼굴 대신 뒷머리
    const skin = SKIN[L.sk], hair = HAIR[L.hc];
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    if (o.alpha != null) ctx.globalAlpha = o.alpha;

    // 발밑 그림자 + 플레이어 색 고리
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.ellipse(0, 12, 13, 5, 0, 0, Math.PI * 2); ctx.fill();
    if (o.ring) { ctx.strokeStyle = o.ring; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(0, 12, 14, 5.5, 0, 0, Math.PI * 2); ctx.stroke(); }

    ctx.translate(0, o.bob || 0);
    const side = fx * 2;

    // 긴머리/포니테일은 몸 뒤에
    ctx.fillStyle = hair;
    if (L.hs === 2) { ctx.beginPath(); ctx.roundRect(-10, -16, 20, back ? 20 : 16, 5); ctx.fill(); }

    // 다리 / 아랫옷
    if (L.g === 1) {
      ctx.fillStyle = skin;
      ctx.fillRect(-5, 6, 3, 6); ctx.fillRect(2, 6, 3, 6);
      ctx.fillStyle = BOT[L.bc];
      ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.lineTo(9, 8); ctx.lineTo(-9, 8); ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = BOT[L.bc];
      ctx.fillRect(-6, 1, 5, 11); ctx.fillRect(1, 1, 5, 11);
    }
    ctx.fillStyle = '#1b1b2a';
    ctx.fillRect(-6, 11, 5, 2); ctx.fillRect(1, 11, 5, 2);

    // 윗옷 + 팔
    ctx.fillStyle = TOP[L.tc];
    ctx.beginPath(); ctx.roundRect(-7, -6, 14, 9, 3); ctx.fill();
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(-8.5, 0, 2.3, 0, Math.PI * 2); ctx.arc(8.5, 0, 2.3, 0, Math.PI * 2); ctx.fill();

    // 머리
    const hy = -14;
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(0, hy, 9.5, 0, Math.PI * 2); ctx.fill();

    // 머리카락
    ctx.fillStyle = hair;
    if (back) {
      ctx.beginPath(); ctx.arc(0, hy, 10, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(0, hy, 10, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
      ctx.fillRect(-10, hy - 3, 20, 3);
      if (L.hs === 1) { ctx.fillRect(-10.5, hy - 2, 4, 10); ctx.fillRect(6.5, hy - 2, 4, 10); }
      if (L.hs === 2) { ctx.fillRect(-10.5, hy - 2, 3.5, 13); ctx.fillRect(7, hy - 2, 3.5, 13); }
    }
    if (L.hs === 3) { ctx.beginPath(); ctx.ellipse(back ? 0 : -side * 3 + 9, hy - 2, 3.5, 7, 0.3, 0, Math.PI * 2); ctx.fill(); }
    if (L.hs === 4) { ctx.beginPath(); ctx.arc(0, hy - 11, 4.5, 0, Math.PI * 2); ctx.fill(); }
    if (L.hs === 5) {
      ctx.beginPath();
      for (let i = -2; i <= 2; i++) { ctx.moveTo(i * 4 - 3, hy - 7); ctx.lineTo(i * 4, hy - 14); ctx.lineTo(i * 4 + 3, hy - 7); }
      ctx.fill();
    }

    // 얼굴
    if (!back) {
      const ex = side, ey = hy + 1 + Math.max(0, fy) * 1.5;
      ctx.fillStyle = '#1b1b2a';
      if (o.ko) {
        ctx.strokeStyle = '#1b1b2a'; ctx.lineWidth = 1.3;
        for (const s of [-1, 1]) {
          const cx = ex + s * 3.5;
          ctx.beginPath(); ctx.moveTo(cx - 1.6, ey - 1.6); ctx.lineTo(cx + 1.6, ey + 1.6); ctx.moveTo(cx + 1.6, ey - 1.6); ctx.lineTo(cx - 1.6, ey + 1.6); ctx.stroke();
        }
      } else {
        ctx.fillRect(ex - 4.5, ey - 1.5, 2, 3); ctx.fillRect(ex + 2.5, ey - 1.5, 2, 3);
      }
      ctx.fillStyle = 'rgba(244,114,182,.45)';
      ctx.fillRect(ex - 7, ey + 2, 3, 1.5); ctx.fillRect(ex + 4, ey + 2, 3, 1.5);
    }

    // 소품
    if (L.ac === 1) {        // 모자
      ctx.fillStyle = '#ef4444';
      ctx.beginPath(); ctx.arc(0, hy - 3, 10, Math.PI, 0); ctx.fill();
      if (!back) ctx.fillRect(-2 + side * 2, hy - 4, 13, 3);
    } else if (L.ac === 2 && !back) {   // 안경
      ctx.strokeStyle = '#1b1b2a'; ctx.lineWidth = 1.2;
      const ex = side, ey = hy + 1 + Math.max(0, fy) * 1.5;
      ctx.strokeRect(ex - 6, ey - 2.5, 5, 4.5); ctx.strokeRect(ex + 1, ey - 2.5, 5, 4.5);
    } else if (L.ac === 3) { // 별 핀
      drawPin(ctx, 7, hy - 7);
    } else if (L.ac === 4) { // 헤드폰
      ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, hy, 11, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      ctx.fillStyle = '#f97316';
      ctx.fillRect(-12.5, hy - 3, 4, 7); ctx.fillRect(8.5, hy - 3, 4, 7);
    } else if (L.ac === 5) { // 왕관
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.moveTo(-7, hy - 8); ctx.lineTo(-7, hy - 15); ctx.lineTo(-3.5, hy - 11); ctx.lineTo(0, hy - 17);
      ctx.lineTo(3.5, hy - 11); ctx.lineTo(7, hy - 15); ctx.lineTo(7, hy - 8); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  function drawPin(ctx, x, y) {
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 1.4 : 3.4, a = -Math.PI / 2 + (i * Math.PI) / 5;
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill();
  }

  return { SKIN, HAIR, TOP, BOT, STYLES, ACC, CROWN_WINS, DEFAULT, clean, draw, def: (g) => Object.assign({}, DEFAULT[g ? 1 : 0]) };
})();
