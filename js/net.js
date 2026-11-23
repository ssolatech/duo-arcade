'use strict';
// 온라인(각자 기기) 연결. PeerJS 무료 공개 서버로 "코드 번호"만 주고받고,
// 실제 게임 데이터는 두 기기가 직접(P2P) 주고받는다. 서버 비용 0원.
// 비행기 모드에서는 이 기능만 안 되고, 나머지(한 기기로 둘이)는 그대로 된다.
const Net = (() => {
  const PREFIX = 'duoarcade-v1-';
  const VER = 1;   // 주고받는 데이터 형식 버전 (두 기기가 같아야 함)

  const N = {
    role: null,      // 'host'(방장, 1P) | 'guest'(참가자, 2P) | null
    state: 'off',    // off | loading | waiting | joining | connected
    code: '',
    peerName: '',
    peerLook: null,
    onMsg: () => {},
    onChange: () => {},
    onRequest: () => {},   // 누군가 들어오려 할 때 (null이면 요청 취소)
    error: '',
  };
  let peer = null, conn = null, pending = null, lastRecv = 0, pingTimer = 0, pendTimer = 0, roomTimer = 0;

  function set(state, error = '') {
    N.state = state;
    N.error = error;
    N.onChange();
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

  // 방장이 '수락'해야만 연결된다. 코드를 우연히 맞힌 모르는 사람은 방장이 거절하면 끝.
  function startPing() {
    lastRecv = Date.now();
    clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      send({ t: 'ping' });
      if (Date.now() - lastRecv > 8000) lost('상대 기기와 연결이 끊겼어요.');
    }, 1500);
  }
  const hello = () => ({ t: 'hello', name: Store.data.names[0], look: Store.data.chars[0], ver: VER });

  function readHello(d) {
    let name = Store.name(d.name, N.role === 'host' ? '참가자' : '방장');
    if (name === Store.data.names[0]) name = name.slice(0, 7) + '2';
    return { name, look: Avatar.clean(d.look) || Avatar.def(N.role === 'host' ? 1 : 0), ver: d.ver };
  }

  function setup(c) {
    let asked = false;
    c.on('open', () => {
      if (N.role === 'host') {
        if (conn || pending) { c.close(); return; }      // 이미 들어왔거나 수락 대기 중이면 거절
        pending = c;
        clearTimeout(pendTimer);
        pendTimer = setTimeout(() => { if (pending === c) { pending = null; N.onRequest(null); try { c.close(); } catch (e) { /* 무시 */ } } }, 60000);
      } else {
        conn = c;
        try { c.send(hello()); } catch (e) { /* 무시 */ }
        set('approval');
        clearTimeout(pendTimer);
        pendTimer = setTimeout(() => { if (N.state === 'approval') { leave(true); set('off', '방장이 수락하지 않았어요. 다시 시도해 주세요.'); } }, 70000);
      }
    });
    c.on('data', (d) => {
      if (!d || typeof d !== 'object' || typeof d.t !== 'string') return;
      if (N.role === 'host' && c !== conn) {
        // 수락 전에는 '인사(hello)' 하나만 받는다
        if (c !== pending || d.t !== 'hello' || asked) return;
        asked = true;
        const who = readHello(d);
        N.onRequest({
          name: who.name,
          look: who.look,
          accept() {
            if (pending !== c) return;
            clearTimeout(pendTimer); clearTimeout(roomTimer);
            pending = null; conn = c;
            N.peerName = who.name; N.peerLook = who.look;
            if (who.ver !== VER) N.error = '두 기기의 앱 버전이 달라요. 둘 다 새로고침해 주세요.';
            send(hello()); send({ t: 'ok' });
            startPing();
            set('connected');
          },
          reject() {
            if (pending !== c) return;
            clearTimeout(pendTimer);
            pending = null;
            try { c.send({ t: 'no' }); } catch (e) { /* 무시 */ }
            setTimeout(() => { try { c.close(); } catch (e) { /* 무시 */ } }, 400);
          },
        });
        return;
      }
      lastRecv = Date.now();
      if (d.t === 'ping') return;
      if (N.role === 'guest' && N.state === 'approval') {
        if (d.t === 'hello') { const who = readHello(d); N.peerName = who.name; N.peerLook = who.look; if (who.ver !== VER) N.error = '두 기기의 앱 버전이 달라요. 둘 다 새로고침해 주세요.'; }
        else if (d.t === 'ok') { clearTimeout(pendTimer); startPing(); set('connected'); }
        else if (d.t === 'no') { leave(true); set('off', '방장이 입장을 거절했어요.'); }
        return;
      }
      if (d.t === 'hello' || d.t === 'ok') return;
      N.onMsg(d);
    });
    c.on('close', () => {
      if (pending === c) { pending = null; clearTimeout(pendTimer); N.onRequest(null); return; }
      if (conn !== c) return;
      if (N.state === 'approval') { leave(true); set('off', '방장이 입장을 거절했어요.'); return; }
      lost('상대가 연결을 끊었어요.');
    });
    c.on('error', () => { if (conn === c) lost('연결 중 문제가 생겼어요.'); });
  }

  function newPeer(id) {
    // 공개 서버 0.peerjs.com (무료). STUN은 PeerJS 기본값(구글 무료 STUN) 사용.
    return id ? new window.Peer(id, { debug: 0 }) : new window.Peer({ debug: 0 });
  }

  async function host() {
    leave(true);
    N.role = 'host';
    set('loading');
    try { await loadLib(); } catch (e) { N.role = null; set('off', '연결 기능을 불러오지 못했어요. 인터넷을 확인해 주세요.'); return; }
    const tryOpen = (left) => {
      N.code = String(Math.floor(1000 + Math.random() * 9000));
      peer = newPeer(PREFIX + N.code);
      peer.on('open', () => {
        set('waiting');
        // 10분 동안 아무도 안 들어오면 방을 닫는다
        clearTimeout(roomTimer);
        roomTimer = setTimeout(() => { if (N.state === 'waiting') { leave(true); set('off', '10분이 지나 방이 자동으로 닫혔어요. 다시 만들어 주세요.'); } }, 600000);
      });
      peer.on('connection', (c) => {
        setup(c);
      });
      peer.on('error', (e) => {
        if (e.type === 'unavailable-id' && left > 0) { peer.destroy(); tryOpen(left - 1); return; }
        if (N.state === 'connected') return;
        leave(true); set('off', errText(e));
      });
    };
    tryOpen(3);
  }

  async function join(code) {
    code = String(code || '').replace(/\D/g, '');
    if (code.length !== 4) { set('off', '코드는 숫자 4자리예요.'); return; }
    leave(true);
    N.role = 'guest';
    N.code = code;
    set('loading');
    try { await loadLib(); } catch (e) { N.role = null; set('off', '연결 기능을 불러오지 못했어요. 인터넷을 확인해 주세요.'); return; }
    peer = newPeer();
    peer.on('open', () => {
      set('joining');
      setup(peer.connect(PREFIX + code, { reliable: true, serialization: 'json' }));
      setTimeout(() => { if (N.state === 'joining') { leave(true); set('off', '연결 시간이 초과됐어요. 같은 와이파이(또는 핫스팟)에서 다시 해보세요.'); } }, 15000);
    });
    peer.on('error', (e) => { if (N.state !== 'connected') { leave(true); set('off', errText(e)); } });
  }

  function send(o) {
    if (conn && conn.open) { try { conn.send(o); } catch (e) { /* 무시 */ } }
  }

  function lost(msg) {
    const was = N.state === 'connected';
    leave(true);
    set('off', msg);
    if (was) N.onMsg({ t: 'lost' });
  }

  function leave(silent) {
    clearInterval(pingTimer); clearTimeout(pendTimer); clearTimeout(roomTimer);
    if (pending) { pending = null; N.onRequest(null); }
    const c = conn, p = peer;
    conn = null; peer = null;
    try { if (c) c.close(); } catch (e) { /* 무시 */ }
    try { if (p) p.destroy(); } catch (e) { /* 무시 */ }
    N.role = null; N.peerName = ''; N.code = '';
    if (!silent) set('off');
  }

  return Object.assign(N, { host, join, send, leave });
})();
