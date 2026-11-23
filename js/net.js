'use strict';
// 온라인(각자 기기) 연결. PeerJS 무료 공개 서버로 "코드 번호"만 주고받고,
// 실제 게임 데이터는 두 기기가 직접(P2P) 주고받는다. 서버 비용 0원.
// 비행기 모드에서는 이 기능만 안 되고, 나머지(한 기기로 둘이)는 그대로 된다.
//
// 보안: 처음 들어올 때는 방장이 '수락'해야 한다. 수락하면 두 폰이 비밀 열쇠(key)를 나눠 갖고,
// 화면을 껐다 켜거나 앱을 다시 열어 연결이 잠깐 끊겼을 때는 그 열쇠로만 자동 재연결된다(최대 5분).
const Net = (() => {
  const PREFIX = 'duoarcade-v1-';
  const VER = 2;                       // 주고받는 데이터 형식 버전 (두 기기가 같아야 함)
  const WAIT_MS = 5 * 60 * 1000;       // 끊겼을 때 기다려 주는 시간
  const SKEY = 'duo-arcade-session';   // 재연결 정보 (이 기기에만 저장)

  const N = {
    role: null,      // 'host'(방장, 1P) | 'guest'(참가자, 2P) | null
    state: 'off',    // off | loading | waiting | joining | approval | connected | waitback(재연결 기다리는 중)
    code: '',
    peerName: '',
    peerLook: null,
    peerAway: false, // 상대가 화면을 끔
    waitUntil: 0,
    onMsg: () => {},
    onChange: () => {},
    onRequest: () => {},   // 누군가 들어오려 할 때 (null이면 요청 취소)
    error: '',
  };
  let peer = null, conn = null, pending = null, sess = null;
  let lastRecv = 0, pingTimer = 0, pendTimer = 0, roomTimer = 0, waitTimer = 0, retryTimer = 0, saveT = 0;

  function set(state, error = '') {
    N.state = state;
    N.error = error;
    N.onChange();
  }

  // ---------- 재연결 정보 ----------
  function saveSess() {
    if (!sess) return;
    sess.until = Date.now() + WAIT_MS;
    try { localStorage.setItem(SKEY, JSON.stringify(sess)); } catch (e) { /* 무시 */ }
  }
  function clearSess() {
    sess = null;
    try { localStorage.removeItem(SKEY); } catch (e) { /* 무시 */ }
  }
  function readSess() {
    try {
      const s = JSON.parse(localStorage.getItem(SKEY));
      if (s && (s.role === 'host' || s.role === 'guest') && /^\d{4}$/.test(s.code) && /^[0-9a-f]{32}$/.test(s.key) && s.until > Date.now()) return s;
    } catch (e) { /* 무시 */ }
    clearSess();
    return null;
  }
  function newKey() {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  }

  function loadLib() {
    if (window.Peer) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'js/vendor/peerjs.min.js';
      s.onload = res;
      s.onerror = () => rej(new Error('lib'));
      document.head.appendChild(s);
    });
  }

  const errText = (e) => {
    const t = e && e.type;
    if (t === 'peer-unavailable') return '그 코드의 방을 찾을 수 없어요. 숫자를 다시 확인해 주세요.';
    if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return '연결 서버에 닿지 않아요. 인터넷 연결을 확인해 주세요.';
    if (t === 'browser-incompatible') return '이 브라우저는 온라인 연결을 지원하지 않아요.';
    return '연결에 실패했어요. 다시 시도해 주세요.';
  };

  function send(o) {
    if (conn && conn.open) { try { conn.send(o); } catch (e) { /* 무시 */ } }
  }
  const sendTo = (c, o) => { try { c.send(o); } catch (e) { /* 무시 */ } };

  function startPing() {
    lastRecv = Date.now();
    clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      send({ t: 'ping' });
      if (document.hidden) return;   // 내 화면이 꺼져 있을 땐 판단하지 않음
      const limit = N.peerAway ? WAIT_MS : 8000;
      if (Date.now() - lastRecv > limit) dropped();
      if (Date.now() - saveT > 10000) { saveT = Date.now(); saveSess(); }
    }, 1500);
  }

  const hello = () => ({ t: 'hello', name: Store.data.names[0], look: Store.data.chars[0], ver: VER, key: sess && sess.role === 'guest' ? sess.key : undefined });

  function readHello(d) {
    let name = Store.name(d.name, N.role === 'host' ? '참가자' : '방장');
    if (name === Store.data.names[0]) name = name.slice(0, 7) + '2';
    return { name, look: Avatar.clean(d.look) || Avatar.def(N.role === 'host' ? 1 : 0), ver: d.ver, key: typeof d.key === 'string' ? d.key : '' };
  }

  // 연결 완료(처음 수락 또는 재연결) 공통 처리
  function connected(c, who, resumed) {
    clearTimeout(waitTimer); clearTimeout(retryTimer); clearTimeout(pendTimer); clearTimeout(roomTimer);
    const old = conn;
    conn = c;
    if (old && old !== c) { old.replaced = true; try { old.close(); } catch (e) { /* 무시 */ } }
    if (who) {
      N.peerName = who.name; N.peerLook = who.look;
      N.error = who.ver !== VER ? '두 기기의 앱 버전이 달라요. 둘 다 새로고침해 주세요.' : '';
    }
    N.peerAway = false;
    N.waitUntil = 0;
    if (sess) sess.peer = N.peerName;
    saveSess();
    startPing();
    set('connected', N.error);
    if (resumed) N.onMsg({ t: 'resumed' });
  }

  function setup(c) {
    let asked = false;
    c.on('open', () => {
      if (N.role === 'host') {
        // 방장: 인사(hello)를 받아 본 뒤 결정 (열쇠가 맞으면 자동 재연결, 아니면 수락 요청)
        c.candTimer = setTimeout(() => { if (c !== conn && c !== pending) { try { c.close(); } catch (e) { /* 무시 */ } } }, 10000);
      } else {
        conn = c;
        sendTo(c, hello());
        if (N.state !== 'waitback') {
          set('approval');
          clearTimeout(pendTimer);
          pendTimer = setTimeout(() => { if (N.state === 'approval') { cleanup(); clearSess(); set('off', '방장이 수락하지 않았어요. 다시 시도해 주세요.'); } }, 70000);
        }
      }
    });
    c.on('data', (d) => {
      if (!d || typeof d !== 'object' || typeof d.t !== 'string') return;
      if (N.role === 'host' && c !== conn) {
        if (d.t !== 'hello' || asked) return;
        asked = true;
        clearTimeout(c.candTimer);
        const who = readHello(d);
        // ① 같은 친구의 재연결: 열쇠가 맞으면 수락 없이 바로
        if (sess && who.key && who.key === sess.key) {
          sendTo(c, hello()); sendTo(c, { t: 'ok', key: sess.key });
          connected(c, who, true);
          return;
        }
        // ② 이미 친구가 있거나(돌아오길 기다리는 중 포함) 다른 요청을 보고 있으면 거절
        if (conn || pending || N.state === 'waitback') { try { c.close(); } catch (e) { /* 무시 */ } return; }
        // ③ 새로운 사람: 방장이 직접 수락/거절
        pending = c;
        clearTimeout(pendTimer);
        pendTimer = setTimeout(() => { if (pending === c) { pending = null; N.onRequest(null); try { c.close(); } catch (e) { /* 무시 */ } } }, 60000);
        N.onRequest({
          name: who.name,
          look: who.look,
          accept() {
            if (pending !== c) return;
            pending = null;
            sess = { role: 'host', code: N.code, key: newKey(), peer: who.name };
            sendTo(c, hello()); sendTo(c, { t: 'ok', key: sess.key });
            connected(c, who, false);
          },
          reject() {
            if (pending !== c) return;
            clearTimeout(pendTimer);
            pending = null;
            sendTo(c, { t: 'no' });
            setTimeout(() => { try { c.close(); } catch (e) { /* 무시 */ } }, 400);
          },
        });
        return;
      }
      if (c !== conn) return;
      lastRecv = Date.now();
      if (d.t === 'ping') return;
      // 참가자: 방장의 대답 기다리는 중
      if (N.role === 'guest' && (N.state === 'approval' || N.state === 'waitback')) {
        if (d.t === 'hello') { c.who = readHello(d); }
        else if (d.t === 'ok' && typeof d.key === 'string' && /^[0-9a-f]{32}$/.test(d.key)) {
          const resumed = N.state === 'waitback';
          sess = { role: 'guest', code: N.code, key: d.key, peer: c.who ? c.who.name : N.peerName };
          connected(c, c.who || null, resumed);
        } else if (d.t === 'no') { cleanup(); clearSess(); set('off', '방장이 입장을 거절했어요.'); }
        return;
      }
      if (d.t === 'away') { N.peerAway = true; N.onChange(); N.onMsg(d); return; }
      if (d.t === 'back') { N.peerAway = false; N.onChange(); N.onMsg(d); return; }
      if (d.t === 'bye') { finish('상대가 연결을 끊었어요.'); return; }
      if (d.t === 'hello' || d.t === 'ok') return;
      N.onMsg(d);
    });
    c.on('close', () => {
      if (c.replaced) return;
      if (pending === c) { pending = null; clearTimeout(pendTimer); N.onRequest(null); return; }
      if (conn !== c) return;
      if (N.state === 'approval') { cleanup(); clearSess(); set('off', '방장이 입장을 거절했어요.'); return; }
      dropped();
    });
    c.on('error', () => { if (conn === c && N.state === 'connected') dropped(); });
  }

  function newPeer(id) {
    // 공개 서버 0.peerjs.com (무료). STUN은 PeerJS 기본값(구글 무료 STUN) 사용.
    const p = id ? new window.Peer(id, { debug: 0 }) : new window.Peer({ debug: 0 });
    // 서버와의 연결만 끊긴 경우(화면 꺼짐 등) 다시 붙는다. 새 사람/재연결을 받으려면 필요.
    p.on('disconnected', () => { setTimeout(() => { if (p === peer && !p.destroyed && p.disconnected) { try { p.reconnect(); } catch (e) { /* 무시 */ } } }, 1500); });
    return p;
  }

  // ---------- 방장 ----------
  function openRoom(code, onFail) {
    peer = newPeer(PREFIX + code);
    const p = peer;
    p.on('open', () => {
      if (N.state === 'loading') {
        set('waiting');
        clearTimeout(roomTimer);
        roomTimer = setTimeout(() => { if (N.state === 'waiting') { cleanup(); set('off', '10분이 지나 방이 자동으로 닫혔어요. 다시 만들어 주세요.'); } }, 600000);
      }
    });
    p.on('connection', (c) => setup(c));
    p.on('error', (e) => {
      if (p !== peer) return;
      if (e.type === 'unavailable-id') { onFail(); return; }
      if (N.state === 'connected' || N.state === 'waitback') return;   // 재연결 중 오류는 계속 기다림
      cleanup(); set('off', errText(e));
    });
  }

  async function host() {
    cleanup(); clearSess();
    N.role = 'host';
    set('loading');
    try { await loadLib(); } catch (e) { N.role = null; set('off', '연결 기능을 불러오지 못했어요. 인터넷을 확인해 주세요.'); return; }
    let left = 3;
    const tryOpen = () => {
      N.code = String(Math.floor(1000 + Math.random() * 9000));
      openRoom(N.code, () => { try { peer.destroy(); } catch (e) { /* 무시 */ } if (left-- > 0) tryOpen(); else { cleanup(); set('off', '방을 만들지 못했어요. 다시 시도해 주세요.'); } });
    };
    tryOpen();
  }

  // 방장이 앱을 다시 열었을 때: 같은 코드로 방을 다시 연다 (서버가 예전 연결을 정리할 때까지 몇 번 재시도)
  function reopenRoom() {
    if (N.state !== 'waitback') return;
    try { if (peer) peer.destroy(); } catch (e) { /* 무시 */ }
    openRoom(N.code, () => { try { peer.destroy(); } catch (e) { /* 무시 */ } peer = null; retryTimer = setTimeout(reopenRoom, 4000); });
  }

  // ---------- 참가자 ----------
  async function join(code) {
    code = String(code || '').replace(/\D/g, '');
    if (code.length !== 4) { set('off', '코드는 숫자 4자리예요.'); return; }
    cleanup(); clearSess();
    N.role = 'guest';
    N.code = code;
    set('loading');
    try { await loadLib(); } catch (e) { N.role = null; set('off', '연결 기능을 불러오지 못했어요. 인터넷을 확인해 주세요.'); return; }
    peer = newPeer();
    const p = peer;
    p.on('open', () => {
      if (N.state !== 'loading') return;
      set('joining');
      setup(p.connect(PREFIX + code, { reliable: true, serialization: 'json' }));
      setTimeout(() => { if (N.state === 'joining') { cleanup(); set('off', '연결 시간이 초과됐어요. 같은 와이파이(또는 핫스팟)에서 다시 해보세요.'); } }, 15000);
    });
    p.on('error', (e) => {
      if (p !== peer || N.state === 'connected' || N.state === 'waitback') return;
      cleanup(); set('off', errText(e));
    });
  }

  // 참가자: 끊긴 동안 몇 초마다 방장에게 다시 붙어 본다
  function rejoin() {
    clearTimeout(retryTimer);
    if (N.state !== 'waitback' || N.role !== 'guest') return;
    retryTimer = setTimeout(rejoin, 4000);
    if (!window.Peer) { loadLib().catch(() => {}); return; }
    if (!peer || peer.destroyed) {
      peer = newPeer();
      peer.on('error', () => { /* 방장이 아직 안 돌아옴: 다음 시도 */ });
      peer.on('open', () => { if (N.state === 'waitback') rejoin(); });
      return;
    }
    if (peer.disconnected) { try { peer.reconnect(); } catch (e) { /* 무시 */ } return; }
    if (!peer.open) return;
    if (conn && !conn.open) { conn.replaced = true; try { conn.close(); } catch (e) { /* 무시 */ } conn = null; }
    if (conn && conn.open) return;
    const c = peer.connect(PREFIX + N.code, { reliable: true, serialization: 'json' });
    conn = c;
    setup(c);
  }

  // ---------- 끊김 처리 ----------
  // 잠깐 끊김: 재연결 열쇠가 있으면 5분 동안 기다린다
  function dropped() {
    if (!sess) { finish('상대 기기와 연결이 끊겼어요.'); return; }
    if (N.state === 'waitback') return;
    clearInterval(pingTimer);
    const c = conn;
    conn = null;
    if (c) { c.replaced = true; try { c.close(); } catch (e) { /* 무시 */ } }
    N.waitUntil = sess.until && sess.until > Date.now() ? Math.min(sess.until, Date.now() + WAIT_MS) : Date.now() + WAIT_MS;
    set('waitback');
    N.onMsg({ t: 'drop' });
    clearTimeout(waitTimer);
    waitTimer = setTimeout(() => finish('5분 동안 다시 연결되지 않았어요.'), Math.max(1000, N.waitUntil - Date.now()));
    if (N.role === 'host') { if (!peer || peer.destroyed) reopenRoom(); else if (peer.disconnected) { try { peer.reconnect(); } catch (e) { /* 무시 */ } } }
    else rejoin();
  }

  // 완전히 끝: 연결 정리 + 앱에 알림
  function finish(msg) {
    const was = N.state === 'connected' || N.state === 'waitback';
    cleanup();
    clearSess();
    set('off', msg);
    if (was) N.onMsg({ t: 'lost' });
  }

  function cleanup() {
    clearInterval(pingTimer);
    [pendTimer, roomTimer, waitTimer, retryTimer].forEach(clearTimeout);
    if (pending) { pending = null; N.onRequest(null); }
    const c = conn, p = peer;
    conn = null; peer = null;
    if (c) c.replaced = true;
    try { if (c) c.close(); } catch (e) { /* 무시 */ }
    try { if (p) p.destroy(); } catch (e) { /* 무시 */ }
    N.role = null; N.peerName = ''; N.code = ''; N.peerAway = false; N.waitUntil = 0;
  }

  // '연결 끊기'를 직접 눌렀을 때: 상대에게도 알리고 끝
  function leave() {
    send({ t: 'bye' });
    const c = conn;
    if (c) c.replaced = true;
    setTimeout(() => { cleanup(); clearSess(); set('off'); }, c && c.open ? 150 : 0);
  }

  // 앱을 다시 열었을 때 5분 안이면 자동으로 다시 연결
  async function resume() {
    const s = readSess();
    if (!s) return false;
    sess = s;
    N.role = s.role; N.code = s.code; N.peerName = s.peer || '';
    N.waitUntil = s.until;
    set('waitback');
    clearTimeout(waitTimer);
    waitTimer = setTimeout(() => finish('5분 동안 다시 연결되지 않았어요.'), Math.max(1000, s.until - Date.now()));
    try { await loadLib(); } catch (e) { /* 인터넷 없음: 재시도 루프가 계속 시도 */ }
    if (N.role === 'host') reopenRoom(); else rejoin();
    return true;
  }

  // 화면을 끄면 상대에게 '자리 비움'을 알리고, 켜면 '돌아옴'
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (N.state === 'connected') send({ t: 'away' }); return; }
    lastRecv = Date.now();   // 내가 자는 동안 못 받은 건 상대 탓이 아님
    if (peer && !peer.destroyed && peer.disconnected) { try { peer.reconnect(); } catch (e) { /* 무시 */ } }
    if (N.state === 'connected') {
      if (conn && !conn.open) dropped();   // 자는 동안 연결이 죽었으면 바로 재연결 시작
      else send({ t: 'back' });
    }
    if (N.state === 'waitback' && N.role === 'guest') rejoin();
  });
  addEventListener('pagehide', () => { if (N.state === 'connected') send({ t: 'away' }); });

  return Object.assign(N, { host, join, send, leave, resume, hasSession: () => !!readSess() });
})();
