'use strict';
// 저장: 서버 없이 이 기기(localStorage)에 저장. 백업 코드로 옮기거나 되살릴 수 있다.
// 불러온 백업 코드는 믿지 않고 필요한 값만 골라서 검사한 뒤 쓴다.
const Store = (() => {
  const KEY = 'duo-arcade-v1';

  const DEF = () => ({
    v: 1,
    names: ['나', '친구'],          // [1P(이 기기 주인), 2P(같은 기기 친구)]
    chars: [null, null],            // 각자 캐릭터 외형 (null = 아직 안 만듦). 성별은 처음 저장한 뒤 고정.
    sound: 1,
    vib: 1,
    players: [],                    // [{n 이름, t 소원권, w 승, l 패, d 무, u 사용한 소원권}]
    rewards: [
      { c: 3, x: '음료 한 잔 사주기' },
      { c: 5, x: '오늘 메뉴 고르기' },
      { c: 10, x: '무엇이든 소원 1개' },
    ],
    log: [],                        // [{d 시각, n 이름, x 소원}]
    coop: {},                       // {게임id: {cur 다음에 할 판, best 최고 클리어}}
  });

  const int = (v, min, max, def) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
  };
  const text = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max);
  const name = (s, def) => text(s, 8) || def;

  function sanitize(raw) {
    const d = DEF();
    if (!raw || typeof raw !== 'object') return d;
    if (Array.isArray(raw.names)) d.names = [name(raw.names[0], '나'), name(raw.names[1], '친구')];
    if (Array.isArray(raw.chars)) d.chars = [Avatar.clean(raw.chars[0]), Avatar.clean(raw.chars[1])];
    d.sound = raw.sound === 0 ? 0 : 1;
    d.vib = raw.vib === 0 ? 0 : 1;
    if (Array.isArray(raw.players)) {
      const seen = new Set();
      for (const p of raw.players.slice(0, 40)) {
        if (!p || typeof p !== 'object') continue;
        const n = text(p.n, 8);
        if (!n || seen.has(n)) continue;
        seen.add(n);
        d.players.push({ n, t: int(p.t, 0, 9999, 0), w: int(p.w, 0, 99999, 0), l: int(p.l, 0, 99999, 0), d: int(p.d, 0, 99999, 0), u: int(p.u, 0, 99999, 0) });
      }
    }
    if (Array.isArray(raw.rewards)) {
      const r = [];
      for (const x of raw.rewards.slice(0, 20)) {
        if (!x || typeof x !== 'object') continue;
        const t = text(x.x, 30);
        if (t) r.push({ c: int(x.c, 1, 999, 3), x: t });
      }
      d.rewards = r;
    }
    if (Array.isArray(raw.log)) {
      for (const x of raw.log.slice(0, 50)) {
        if (!x || typeof x !== 'object') continue;
        d.log.push({ d: int(x.d, 0, 9e15, 0), n: text(x.n, 8), x: text(x.x, 30) });
      }
    }
    if (raw.coop && typeof raw.coop === 'object') {
      for (const k of Object.keys(raw.coop).slice(0, 30)) {
        if (!/^[a-z]{2,12}$/.test(k)) continue;
        const c = raw.coop[k];
        if (!c || typeof c !== 'object') continue;
        d.coop[k] = { cur: int(c.cur, 1, 999, 1), best: int(c.best, 0, 999, 0) };
      }
    }
    return d;
  }

  let data;
  try { data = sanitize(JSON.parse(localStorage.getItem(KEY))); } catch (e) { data = DEF(); }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 저장 공간 없음: 무시 */ }
  }

  function player(n) {
    let p = data.players.find((x) => x.n === n);
    if (!p) { p = { n, t: 0, w: 0, l: 0, d: 0, u: 0 }; data.players.push(p); }
    return p;
  }

  // 대결 결과 기록. w: 이긴 쪽 번호(0/1), -1이면 무승부. 이긴 사람에게 소원권 1장.
  function addMatch(names, w) {
    const a = player(names[0]), b = player(names[1]);
    if (w === -1) { a.d++; b.d++; }
    else {
      const win = w === 0 ? a : b, lose = w === 0 ? b : a;
      win.w++; win.t++; lose.l++;
    }
    save();
  }

  function coopResult(id, stage, clear) {
    const c = data.coop[id] || (data.coop[id] = { cur: 1, best: 0 });
    if (clear) { c.best = Math.max(c.best, stage); c.cur = stage + 1; }
    else c.cur = stage;   // 실패하면 그 판부터 다시 (세이브 포인트)
    save();
  }

  function useReward(n, idx) {
    const p = data.players.find((x) => x.n === n);
    const r = data.rewards[idx];
    if (!p || !r || p.t < r.c) return false;
    p.t -= r.c; p.u += r.c;
    data.log.unshift({ d: Date.now(), n: p.n, x: r.x });
    data.log.length = Math.min(data.log.length, 50);
    save();
    return true;
  }

  function exportCode() {
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    let s = '';
    bytes.forEach((b) => { s += String.fromCharCode(b); });
    return 'DUO1.' + btoa(s);
  }

  function importCode(code) {
    const m = String(code || '').trim().match(/^DUO1\.([A-Za-z0-9+/=]+)$/);
    if (!m) return false;
    try {
      const bin = atob(m[1]);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      data = sanitize(JSON.parse(new TextDecoder().decode(bytes)));
      save();
      return true;
    } catch (e) { return false; }
  }

  function reset() { data = DEF(); save(); }

  return {
    get data() { return data; },
    save, player, addMatch, coopResult, useReward, exportCode, importCode, reset, text, name, int,
  };
})();
