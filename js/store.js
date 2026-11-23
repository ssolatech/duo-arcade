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
    friends: [],                    // 방장 폰에 보관하는 친구 정보 (복구용) [{n, look, coop, at}]
    sheetId: '',                    // 업로드한 구글 시트 ID
  });

  const int = (v, min, max, def) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
  };
  const text = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max);
  const name = (s, def) => text(s, 8) || def;

  // ---- 값 검사 (저장 불러오기, 구글 시트, 상대 기기에서 받은 값 모두 여기를 거친다) ----
  function cleanPlayer(p) {
    if (!p || typeof p !== 'object') return null;
    const n = text(p.n, 8);
    if (!n) return null;
    const w = int(p.w, 0, 99999, 0), u = int(p.u, 0, 99999, 0);
    // 소원권은 '이긴 횟수 - 쓴 장수'로 계산 (따로 부풀릴 수 없게)
    return { n, w, l: int(p.l, 0, 99999, 0), d: int(p.d, 0, 99999, 0), u: Math.min(u, w), t: Math.max(0, w - u) };
  }
  function cleanRewards(list) {
    if (!Array.isArray(list)) return null;
    const r = [];
    for (const x of list.slice(0, 20)) {
      if (!x || typeof x !== 'object') continue;
      const t = text(x.x, 30);
      if (t) r.push({ c: int(x.c, 1, 999, 3), x: t });
    }
    return r;
  }
  function cleanLog(list) {
    const out = [];
    if (!Array.isArray(list)) return out;
    for (const x of list.slice(0, 50)) {
      if (!x || typeof x !== 'object') continue;
      const n = text(x.n, 8), t = text(x.x, 30);
      if (n && t) out.push({ d: int(x.d, 0, 9e15, 0), n, x: t });
    }
    return out;
  }
  function cleanCoop(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const k of Object.keys(raw).slice(0, 30)) {
      if (!/^[a-z]{2,12}$/.test(k)) continue;
      const c = raw[k];
      if (!c || typeof c !== 'object') continue;
      out[k] = { cur: int(c.cur, 1, 999, 1), best: int(c.best, 0, 999, 0) };
    }
    return out;
  }
  function cleanFriend(f) {
    if (!f || typeof f !== 'object') return null;
    const n = text(f.n, 8);
    const look = Avatar.clean(f.look);
    if (!n || !look) return null;
    return { n, look, coop: cleanCoop(f.coop), at: int(f.at, 0, 9e15, 0) };
  }

  function sanitize(raw) {
    const d = DEF();
    if (!raw || typeof raw !== 'object') return d;
    if (Array.isArray(raw.names)) d.names = [name(raw.names[0], '나'), name(raw.names[1], '친구')];
    if (Array.isArray(raw.chars)) d.chars = [Avatar.clean(raw.chars[0]), Avatar.clean(raw.chars[1])];
    d.sound = raw.sound === 0 ? 0 : 1;
    d.vib = raw.vib === 0 ? 0 : 1;
    if (Array.isArray(raw.players)) {
      const seen = new Set();
      for (const x of raw.players.slice(0, 40)) {
        const p = cleanPlayer(x);
        if (p && !seen.has(p.n)) { seen.add(p.n); d.players.push(p); }
      }
    }
    const rw = cleanRewards(raw.rewards);
    if (rw) d.rewards = rw;
    d.log = cleanLog(raw.log);
    d.coop = cleanCoop(raw.coop);
    if (Array.isArray(raw.friends)) {
      const seen = new Set();
      for (const x of raw.friends.slice(0, 20)) {
        const f = cleanFriend(x);
        if (f && !seen.has(f.n)) { seen.add(f.n); d.friends.push(f); }
      }
    }
    if (typeof raw.sheetId === 'string' && /^[\w-]{20,100}$/.test(raw.sheetId)) d.sheetId = raw.sheetId;
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

  // ================= 친구와 맞추기 · 복구 =================
  // 규칙: 각자의 기록(이름·캐릭터·승패·소원권)은 그 사람 폰이 원본이다.
  //  - 연결하면 서로 '자기 기록'만 보내고, 받는 쪽은 그 사람 줄만 갱신한다.
  //  - 받은 기록이 내가 가진 것보다 적으면(폰 데이터가 지워진 경우) 덮어쓰지 않는다.
  //  - 소원 목록은 '둘의 규칙'이라 방장 기준으로 맞춘다.
  const total = (p) => (p ? p.w + p.l + p.d : 0);

  function takeOwnerRecord(raw) {
    const p = cleanPlayer(raw);
    if (!p) return 'bad';
    const cur = data.players.find((x) => x.n === p.n);
    if (cur && (total(p) < total(cur) || p.u < cur.u)) return 'older';
    if (cur) Object.assign(cur, p); else data.players.push(p);
    save();
    return 'ok';
  }

  function mergeLog(list) {
    const seen = new Set(data.log.map((l) => `${l.d}|${l.n}|${l.x}`));
    for (const l of cleanLog(list)) {
      const k = `${l.d}|${l.n}|${l.x}`;
      if (!seen.has(k)) { seen.add(k); data.log.push(l); }
    }
    data.log.sort((a, b) => b.d - a.d);
    data.log.length = Math.min(data.log.length, 50);
    save();
  }

  function myRecord() {
    const p = data.players.find((x) => x.n === data.names[0]);
    return p ? Object.assign({}, p) : { n: data.names[0], w: 0, l: 0, d: 0, u: 0, t: 0 };
  }
  const logsOf = (n) => data.log.filter((l) => l.n === n);

  function mergeCoop(into, from) {
    for (const [k, c] of Object.entries(cleanCoop(from))) {
      const cur = into[k];
      into[k] = cur ? { cur: Math.max(cur.cur, c.cur), best: Math.max(cur.best, c.best) } : c;
    }
  }

  // 방장 폰에 친구 정보 보관 (연결할 때마다 자동)
  function saveFriend(n, look, coop) {
    const f0 = cleanFriend({ n, look, coop: {}, at: Date.now() });
    if (!f0) return;
    let f = data.friends.find((x) => x.n === f0.n);
    if (!f) { f = f0; data.friends.push(f); }
    f.look = f0.look; f.at = f0.at;
    mergeCoop(f.coop, coop);
    data.friends.sort((a, b) => b.at - a.at);
    data.friends.length = Math.min(data.friends.length, 20);
    save();
  }

  function setRewards(list) {
    const r = cleanRewards(list);
    if (!r) return false;
    const changed = JSON.stringify(r) !== JSON.stringify(data.rewards);
    data.rewards = r;
    save();
    return changed;
  }

  // 친구에게 보낼 복구 묶음 (방장 폰에 보관된 그 친구 것만)
  function restorePack(n) {
    const f = data.friends.find((x) => x.n === n);
    if (!f) return null;
    const rec = data.players.find((x) => x.n === n);
    return { n: f.n, look: f.look, coop: f.coop, rec: rec || null, log: logsOf(n) };
  }

  function checkPack(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const n = text(raw.n, 8), look = Avatar.clean(raw.look);
    if (!n || !look) return null;
    const rec = cleanPlayer(raw.rec);
    return { n, look, coop: cleanCoop(raw.coop), rec: rec && rec.n === n ? rec : null, log: cleanLog(raw.log).filter((l) => l.n === n) };
  }

  // 친구 폰: '복구'를 눌렀을 때만 실행
  function applyRestore(pack) {
    data.names[0] = pack.n;
    data.chars[0] = pack.look;
    mergeCoop(data.coop, pack.coop);
    if (pack.rec) {
      const cur = data.players.find((x) => x.n === pack.n);
      if (!cur) data.players.push(pack.rec);
      else if (total(pack.rec) >= total(cur)) Object.assign(cur, pack.rec);
    }
    mergeLog(pack.log);
    save();
  }

  // 구글 시트 '소원 목록' 탭에서 읽은 줄들
  function rewardsFromRows(rows) {
    if (!Array.isArray(rows)) return null;
    const list = rows.map((r) => (Array.isArray(r) ? { c: r[0], x: r[1] } : null)).filter((x) => x && Number(x.c) >= 1 && text(x.x, 30));
    return list.length ? cleanRewards(list) : null;
  }

  return {
    get data() { return data; },
    save, player, addMatch, coopResult, useReward, exportCode, importCode, reset, text, name, int,
    takeOwnerRecord, mergeLog, myRecord, logsOf, saveFriend, setRewards, restorePack, checkPack, applyRestore,
    rewardsFromRows, cleanCoop, total,
  };
})();
