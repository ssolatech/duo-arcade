'use strict';
// 앱 본체: 화면, 입력(터치/키보드), 게임 진행, 온라인 동기화, 결과·소원권.
(() => {
  const $ = (s) => document.querySelector(s);
  const U = Duo.U;
  const D = () => Store.data;

  // 글자를 넣을 때는 항상 textContent (이름에 이상한 코드가 있어도 실행되지 않게)
  function el(tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }

  // ================= 소리 / 진동 =================
  const Sound = (() => {
    let ac = null;
    const T = {
      tick: [[520, 0.07]], go: [[880, 0.18]], hit: [[620, 0.04]], wall: [[320, 0.03]],
      score: [[784, 0.07], [1046, 0.12]], coin: [[988, 0.05], [1319, 0.09]], big: [[784, 0.06], [988, 0.06], [1319, 0.14]],
      dash: [[260, 0.05, 'sawtooth']], stun: [[200, 0.16, 'sawtooth']], bad: [[160, 0.25, 'sawtooth']],
      down: [[300, 0.12], [200, 0.22]], revive: [[523, 0.07], [784, 0.12]],
      win: [[523, 0.1], [659, 0.1], [784, 0.1], [1046, 0.25]], lose: [[392, 0.15], [330, 0.15], [262, 0.3]],
      clear: [[659, 0.1], [784, 0.1], [988, 0.1], [1319, 0.3]], smash: [[180, 0.06, 'sawtooth'], [880, 0.08]],
      pad0: [[330, 0.25]], pad1: [[415, 0.25]], pad2: [[494, 0.25]], pad3: [[587, 0.25]],
    };
    function play(name) {
      if (!D().sound || !T[name]) return;
      try {
        ac = ac || new (window.AudioContext || window.webkitAudioContext)();
        let t = ac.currentTime;
        for (const [f, d, w] of T[name]) {
          const o = ac.createOscillator(), g = ac.createGain();
          o.type = w || 'square';
          o.frequency.value = f;
          g.gain.setValueAtTime(0.07, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + d);
          o.connect(g).connect(ac.destination);
          o.start(t); o.stop(t + d);
          t += d * 0.9;
        }
      } catch (e) { /* 소리 미지원 */ }
    }
    return { play, unlock() { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); ac.resume(); } catch (e) { /* 무시 */ } } };
  })();
  const buzz = (ms) => { if (D().vib && navigator.vibrate) navigator.vibrate(ms); };

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.tm);
    toast.tm = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // ================= 화면 전환 =================
  function show(id) {
    for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
    window.scrollTo(0, 0);
  }

  // ================= 모드 =================
  let mode = 'local';   // 'local' 한 기기로 둘이 | 'online' 각자 기기로
  const online = () => mode === 'online' && Net.state === 'connected';
  const isGuest = () => online() && Net.role === 'guest';
  const myIndex = () => (isGuest() ? 1 : 0);
  function names() {
    if (online()) return Net.role === 'host' ? [D().names[0], Net.peerName] : [Net.peerName, D().names[0]];
    return [D().names[0], D().names[1]];
  }
  function looks() {
    const mine = D().chars[0] || Avatar.def(0);
    if (online()) { const peer = Net.peerLook || Avatar.def(1); return Net.role === 'host' ? [mine, peer] : [peer, mine]; }
    return [mine, D().chars[1] || Avatar.def(1)];
  }

  // ================= 입력 =================
  const mkIn = () => ({ x: 0, y: 0, a: false, ac: 0, b1c: 0, b2c: 0, rt: 0, rr: 0 });
  const IN = [mkIn(), mkIn()];              // 이 기기에서 만든 입력 (터치+키보드)
  const stick = [{ x: 0, y: 0 }, { x: 0, y: 0 }];
  const touchA = [0, 0];                    // 누르고 있는 액션 버튼 수
  const keys = new Set();
  let remoteIn = mkIn();                    // 방장이 받은 참가자 입력

  const KEYMAP = {
    // 한 기기로 둘이(PC): 1P = WASD + 스페이스, 2P = 방향키 + 엔터
    p0: { u: 'KeyW', d: 'KeyS', l: 'KeyA', r: 'KeyD', a: ['Space', 'KeyF'] },
    p1: { u: 'ArrowUp', d: 'ArrowDown', l: 'ArrowLeft', r: 'ArrowRight', a: ['Enter', 'NumpadEnter', 'Slash'] },
  };

  function keyOwner(code) {
    // 어느 플레이어의 키인가 (온라인이면 모든 키가 '나')
    const in0 = Object.values(KEYMAP.p0).flat().includes(code);
    const in1 = Object.values(KEYMAP.p1).flat().includes(code);
    if (!in0 && !in1) return -1;
    if (mode === 'online') return myIndex();
    return in0 ? 0 : 1;
  }

  function twoKey(code, p) {
    // 버튼 두 개짜리 게임: 왼쪽 버튼 = b1, 오른쪽 = b2
    // 같은 기기의 2P는 화면 위쪽에서 거꾸로 앉아 있으니 PC 키보드에서는 좌우를 바꿔 준다.
    const left = code === 'KeyA' || code === 'ArrowLeft';
    const right = code === 'KeyD' || code === 'ArrowRight';
    if (!left && !right) return null;
    if (mode === 'local' && p === 1) return left ? 'b2c' : 'b1c';
    return left ? 'b1c' : 'b2c';
  }

  addEventListener('keydown', (e) => {
    if (!R.game || $('#game').hidden) return;
    const p = keyOwner(e.code);
    if (p < 0) return;
    e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (R.game.ctl === 'two') { const k = twoKey(e.code, p); if (k) IN[p][k]++; }
    const set = mode === 'online' ? [...KEYMAP.p0.a, ...KEYMAP.p1.a] : KEYMAP['p' + p].a;
    if (set.includes(e.code) || (R.game.ctl === 'btn' && ['KeyW', 'KeyS', 'ArrowUp', 'ArrowDown'].includes(e.code))) IN[p].ac++;
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  function keyVec(map) {
    return {
      x: (keys.has(map.r) ? 1 : 0) - (keys.has(map.l) ? 1 : 0),
      y: (keys.has(map.d) ? 1 : 0) - (keys.has(map.u) ? 1 : 0),
      a: map.a.some((k) => keys.has(k)),
    };
  }

  // 매 프레임 이 기기의 입력을 정리
  function gatherInputs() {
    const players = mode === 'online' ? [myIndex()] : [0, 1];
    for (const p of players) {
      let kv;
      if (mode === 'online') {
        const a = keyVec(KEYMAP.p0), b = keyVec(KEYMAP.p1);
        kv = { x: U.clamp(a.x + b.x, -1, 1), y: U.clamp(a.y + b.y, -1, 1), a: a.a || b.a };
      } else kv = keyVec(KEYMAP['p' + p]);
      let x = U.clamp(stick[p].x + kv.x, -1, 1), y = U.clamp(stick[p].y + kv.y, -1, 1);
      // 참가자 화면은 경기장을 180도 돌려서 보여주므로 방향도 뒤집는다
      if (mode === 'online' && p === 1) { x = -x; y = -y; }
      IN[p].x = Math.round(x * 100) / 100;
      IN[p].y = Math.round(y * 100) / 100;
      IN[p].a = kv.a || touchA[p] > 0;
    }
  }

  function cleanRemote(d) {
    const n = (v, a, b) => (Number.isFinite(+v) ? U.clamp(+v, a, b) : 0);
    return {
      x: n(d.x, -1, 1), y: n(d.y, -1, 1), a: !!d.a,
      ac: n(d.ac, 0, 1e9) | 0, b1c: n(d.b1c, 0, 1e9) | 0, b2c: n(d.b2c, 0, 1e9) | 0,
      rt: n(d.rt, 0, 60000), rr: n(d.rr, 0, 1e6) | 0,
    };
  }

  // ================= 조작판 (아래 = 1P, 위쪽 거꾸로 = 2P) =================
  function buildZone(zone, p) {
    zone.innerHTML = '';
    zone.dataset.p = p;
    const g = R.game;
    const info = el('div', 'zinfo');
    const nm = el('b', 'zname', names()[p]);
    nm.style.background = Duo.COLORS[p];
    info.append(nm, el('span', 'zhud'), el('span', 'zstat'));
    const ctl = el('div', 'zctl k-' + g.ctl);
    const rotated = zone.classList.contains('rot');

    if (g.ctl === 'stick') {
      const area = el('div', 'stick');
      const knob = el('div', 'knob');
      area.append(knob);
      let pid = null;
      const move = (e) => {
        const r = area.getBoundingClientRect();
        const rad = Math.min(r.width, r.height) * 0.38;
        let dx = (e.clientX - (r.left + r.width / 2)) / rad;
        let dy = (e.clientY - (r.top + r.height / 2)) / rad;
        const l = Math.hypot(dx, dy);
        if (l > 1) { dx /= l; dy /= l; }
        stick[p].x = dx; stick[p].y = dy;
        const s = rotated ? -1 : 1;   // 화면 좌표 → 돌려진 판 안의 좌표
        knob.style.transform = `translate(${dx * rad * s}px, ${dy * rad * s}px)`;
      };
      const end = (e) => {
        if (e.pointerId !== pid) return;
        pid = null; stick[p].x = 0; stick[p].y = 0; knob.style.transform = '';
      };
      area.addEventListener('pointerdown', (e) => { pid = e.pointerId; area.setPointerCapture(pid); Sound.unlock(); move(e); });
      area.addEventListener('pointermove', (e) => { if (e.pointerId === pid) move(e); });
      area.addEventListener('pointerup', end);
      area.addEventListener('pointercancel', end);
      ctl.append(area);
      if (g.btn) ctl.append(actionBtn(p, g.btn, 'abtn'));
    } else if (g.ctl === 'btn') {
      ctl.append(actionBtn(p, g.btn || '탭!', 'abtn wide'));
    } else if (g.ctl === 'two') {
      const cols = g.two(p);
      ['b1c', 'b2c'].forEach((k, i) => {
        const b = el('button', 'abtn wide twob');
        b.style.background = cols[i];
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); Sound.unlock(); IN[p][k]++; buzz(10); b.classList.add('on'); });
        const off = () => b.classList.remove('on');
        b.addEventListener('pointerup', off);
        b.addEventListener('pointercancel', off);
        b.addEventListener('pointerleave', off);
        ctl.append(b);
      });
    }
    zone.append(info, ctl);
  }

  function actionBtn(p, label, cls) {
    const b = el('button', cls, label);
    const ids = new Set();
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      Sound.unlock();
      ids.add(e.pointerId);
      touchA[p]++;
      IN[p].ac++;
      buzz(10);
      b.classList.add('on');
    });
    const up = (e) => {
      if (!ids.delete(e.pointerId)) return;
      touchA[p] = Math.max(0, touchA[p] - 1);
      if (!ids.size) b.classList.remove('on');
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('pointerleave', up);
    return b;
  }

  // ================= 게임 진행 =================
  const R = {
    game: null, st: null, opts: null,
    phase: 'idle',    // cd(카운트다운) | play | pause | over | idle
    cd: 0, acc: 0, mid: 0, res: null, recorded: -1,
    fxBuf: [], sendT: 0, inSendT: 0, lastInJson: '', goT: 0, lastCd: 0,
  };

  function startGame(id, opts) {
    // 방장 또는 한 기기 모드에서만 호출 (참가자는 방장이 보낸 start를 받는다)
    const g = Duo.find(id);
    if (!g) return;
    const nm = names();
    if (mode === 'local' && nm[0] === nm[1]) { toast('두 사람 이름을 다르게 정해 주세요.'); return; }
    R.game = g;
    R.opts = opts || {};
    R.st = g.init(R.opts);
    R.st._lc = [{}, {}];
    R.st.fx = [];
    R.phase = 'cd';
    R.cd = 3;
    R.lastCd = 4;
    R.acc = 0;
    R.mid++;
    R.res = null;
    R.fxBuf = [];
    remoteIn = mkIn();
    if (online()) Net.send({ t: 'start', id, opts: R.opts, mid: R.mid });
    enterGameScreen();
  }

  function enterGameScreen() {
    Duo.looks = looks();
    show('game');
    const z1 = $('#zone1'), z2 = $('#zone2');
    if (mode === 'online') {
      z2.hidden = true;
      buildZone(z1, myIndex());
    } else {
      z2.hidden = false;
      buildZone(z1, 0);
      buildZone(z2, 1);
    }
    $('#game').classList.toggle('solo', mode === 'online');
    $('#g-panel').hidden = true;
    hudCache = {};
    resize();
    wake(true);
  }

  function leaveGame() {
    R.game = null; R.st = null; R.phase = 'idle';
    wake(false);
    show('home');
    renderHome();
    if (pendingRestore && online()) askRestore(pendingRestore);
  }

  // 결과 처리 (양쪽 기기 모두 기록)
  function finish(res) {
    R.phase = 'over';
    R.res = res;
    record(res);
    showPanel();
  }

  function record(res) {
    if (R.recorded === R.mid) return;
    R.recorded = R.mid;
    const g = R.game;
    if (res.coop) {
      Store.coopResult(g.id, res.stage, res.clear);
      Sound.play(res.clear ? 'clear' : 'lose');
      buzz(res.clear ? [30, 60, 30] : 200);
    } else {
      Store.addMatch(names(), res.w);
      const meWin = mode === 'online' ? res.w === myIndex() : res.w !== -1;
      Sound.play(meWin ? 'win' : 'lose');
      buzz(meWin ? [30, 60, 30] : 150);
    }
  }

  function showPanel() {
    const panel = $('#g-panel');
    panel.innerHTML = '';
    panel.hidden = false;
    const res = R.res, nm = names(), g = R.game;
    const box = el('div', 'pbox');
    if (R.phase === 'pause') {
      box.append(el('h2', '', '일시정지'));
      box.append(panelBtns([['계속하기', 'resume', 'primary'], ['그만하기', 'menu', '']]));
    } else if (res.coop) {
      box.append(el('div', 'pbig', res.clear ? '🎉' : '💦'));
      box.append(el('h2', '', res.clear ? `${res.stage}판 클리어!` : `${res.stage}판 실패`));
      box.append(el('p', 'pdim', res.clear ? `다음은 ${res.stage + 1}판! 여기까지 자동 저장됐어요.` : '괜찮아요, 이 판부터 다시 할 수 있어요.'));
      box.append(panelBtns(res.clear
        ? [['다음 판 ▶', 'next', 'primary'], ['게임 목록', 'menu', '']]
        : [['다시 도전', 'again', 'primary'], ['게임 목록', 'menu', '']]));
    } else {
      const w = res.w;
      box.append(el('div', 'pbig', w === -1 ? '🤝' : '🏆'));
      const h = el('h2', '', w === -1 ? '무승부!' : `${nm[w]} 승리!`);
      if (w !== -1) h.style.color = Duo.COLORS[w];
      box.append(h);
      if (res.sc) box.append(el('p', 'pscore', `${nm[0]} ${res.sc[0]} : ${res.sc[1]} ${nm[1]}`));
      if (w !== -1) {
        const pl = Store.player(nm[w]);
        box.append(el('p', 'pticket', `🎟 ${nm[w]} 소원권 +1 (총 ${pl.t}장)`));
        const can = D().rewards.filter((r) => r.c <= pl.t).sort((a, b) => b.c - a.c)[0];
        const next = D().rewards.filter((r) => r.c > pl.t).sort((a, b) => a.c - b.c)[0];
        if (can) box.append(el('p', 'pdim', `‘${can.x}’ 소원을 쓸 수 있어요!`));
        else if (next) box.append(el('p', 'pdim', `‘${next.x}’까지 ${next.c - pl.t}장 남았어요`));
      }
      box.append(panelBtns([['다시 하기', 'again', 'primary'], ['게임 목록', 'menu', '']]));
    }
    if (isGuest()) box.append(el('p', 'pdim small', '버튼을 누르면 방장 기기에서 진행돼요.'));
    panel.append(box);
    // 같은 기기 모드에서는 각자 조작판에도 결과 표시 (2P는 거꾸로 앉아 있으니)
  }

  function panelBtns(list) {
    const row = el('div', 'prow');
    for (const [label, cmd, cls] of list) {
      const b = el('button', 'btn ' + cls, label);
      b.addEventListener('click', () => command(cmd));
      row.append(b);
    }
    return row;
  }

  // 명령: 참가자는 방장에게 부탁하고, 방장/한 기기는 바로 실행
  function command(cmd) {
    if (isGuest()) {
      if (cmd === 'menu' && (R.phase === 'play' || R.phase === 'cd' || R.phase === 'pause')) { Net.send({ t: 'cmd', c: 'menu' }); return; }
      Net.send({ t: 'cmd', c: cmd });
      return;
    }
    doCommand(cmd);
  }

  function doCommand(cmd) {
    if (!R.game) return;
    if (cmd === 'again') startGame(R.game.id, R.game.type === 'coop' ? { stage: R.res ? R.res.stage : (R.opts.stage || 1) } : {});
    else if (cmd === 'next') startGame(R.game.id, { stage: (R.res ? R.res.stage : 1) + 1 });
    else if (cmd === 'menu') { if (online()) Net.send({ t: 'menu' }); leaveGame(); }
    else if (cmd === 'pause') { if (R.phase === 'play') { R.phase = 'pause'; showPanel(); } }
    else if (cmd === 'resume') { if (R.phase === 'pause') { R.phase = 'cd'; R.cd = 3; R.lastCd = 4; $('#g-panel').hidden = true; } }
  }

  // ================= 친구와 맞추기 · 복구 · 소원 목록 =================
  // 연결되면 서로 '자기 기록'만 보낸다. 방장은 소원 목록도 보낸다(방장 기준).
  function sendSync() {
    const me = Store.myRecord();
    const msg = { t: 'sync', rec: me, log: Store.logsOf(me.n), coop: D().coop };
    if (Net.role === 'host') msg.rw = D().rewards;
    Net.send(msg);
  }

  function onSync(d) {
    const peer = Net.peerName;
    if (d.rec && typeof d.rec === 'object' && Store.text(d.rec.n, 8) === peer) {
      const r = Store.takeOwnerRecord(d.rec);
      if (r === 'older') {
        toast(Net.role === 'host'
          ? `${peer}님 폰의 기록이 내 보관본보다 적어요. ‘친구 기록 보내기’로 복구해 줄 수 있어요.`
          : '방장 폰의 기록이 줄어 있어요. 방장 폰에서 백업을 불러오게 알려주세요.');
      }
      if (Array.isArray(d.log)) Store.mergeLog(d.log.filter((l) => l && l.n === peer));
    }
    if (Net.role === 'host') Store.saveFriend(peer, Net.peerLook, d.coop);
    if (Net.role === 'guest' && Array.isArray(d.rw) && Store.setRewards(d.rw)) toast('방장의 소원 목록으로 맞췄어요 🎟');
    refreshViews();
  }

  // 소원 목록을 고치면 연결된 상대에게도 바로 보낸다
  function rewardsChanged() {
    Store.save();
    if (online()) Net.send({ t: 'rw', rw: D().rewards });
  }

  function refreshViews() {
    if (!$('#home').hidden) renderHome();
    if (!$('#wish').hidden) renderWish();
  }

  // 방장(또는 보관본이 있는 쪽): 친구 기록 보내기
  function openSendRestore() {
    const fs = D().friends;
    if (!fs.length) { toast('보관된 친구 기록이 없어요.'); return; }
    const list = el('div', 'friend-list');
    for (const f of fs) {
      const b = el('button', 'friend-pick');
      const cv = el('canvas'); cv.width = 72; cv.height = 78;
      drawMini(cv, f.look);
      const rec = D().players.find((p) => p.n === f.n);
      const tx = el('span', 'char-text');
      tx.append(el('b', '', f.n), el('span', '', rec ? `${rec.w}승 ${rec.l}패 · 🎟 ${rec.t}장` : '전적 없음'));
      b.append(cv, tx);
      b.addEventListener('click', () => {
        $('#overlay').hidden = true;
        const pack = Store.restorePack(f.n);
        if (!pack || !online()) return;
        Net.send({ t: 'restore', pack });
        toast(`보냈어요. ${Net.peerName}님 폰에서 ‘복구’를 눌러야 적용돼요.`);
      });
      list.append(b);
    }
    dialog(`${Net.peerName}님에게 보낼 기록을 골라요`, [['취소', null, '']], list);
  }

  // 친구 폰: 복구 제안 받기 (직접 '복구'를 눌러야 적용)
  let pendingRestore = null;
  function askRestore(pack) {
    if (R.game) { pendingRestore = pack; return; }   // 게임 끝나고 보여주기
    pendingRestore = null;
    const box = el('div', 'req');
    const cv = el('canvas'); cv.width = 96; cv.height = 104;
    drawMini(cv, pack.look);
    const rec = pack.rec;
    const coopN = Object.keys(pack.coop).length;
    box.append(cv, el('b', '', pack.n),
      el('p', 'hint center', `${rec ? `${rec.w}승 ${rec.l}패 ${rec.d}무 · 소원권 ${rec.t}장` : '전적 없음'}${coopN ? ` · 협동 ${coopN}개 진행` : ''}`),
      el('p', 'hint center', '복구하면 지금 내 이름·캐릭터가 이걸로 바뀌어요. 내 기록이 맞을 때만 눌러 주세요.'));
    dialog(`${Net.peerName}님이 예전 기록을 보내왔어요`, [
      ['복구', () => {
        Store.applyRestore(pack);
        Net.send({ t: 'profile', name: D().names[0], look: D().chars[0] });
        sendSync();
        Sound.play('clear');
        toast('복구했어요! 🎉');
        refreshViews();
      }, 'primary'],
      ['괜찮아요', () => toast('복구하지 않았어요.'), ''],
    ], box);
  }

  function onShared(d) {
    // 게임 밖 메시지 (양쪽 공통). 처리했으면 true
    if (d.t === 'sync') { onSync(d); return true; }
    if (d.t === 'rw') {
      if (Store.setRewards(d.rw)) { toast(`${Net.peerName}님이 소원 목록을 바꿨어요 🎟`); refreshViews(); }
      return true;
    }
    if (d.t === 'restore') {
      const pack = Store.checkPack(d.pack);
      if (pack) askRestore(pack);
      return true;
    }
    if (d.t === 'profile') {
      let n = Store.name(d.name, Net.peerName);
      if (n === D().names[0]) n = n.slice(0, 7) + '2';
      // 복구 전에 잠깐 쓰던 임시 캐릭터(전적 없음)는 보관함에서 지운다
      const old = Net.peerName;
      const oldRec = D().players.find((p) => p.n === old);
      if (Net.role === 'host' && old !== n && !Store.total(oldRec)) {
        D().friends = D().friends.filter((f) => f.n !== old);
        Store.save();
      }
      Net.peerName = n;
      Net.peerLook = Avatar.clean(d.look) || Net.peerLook;
      if (Net.role === 'host') Store.saveFriend(n, Net.peerLook, {});
      toast(`${n}님의 기록이 복구됐어요`);
      refreshViews();
      return true;
    }
    return false;
  }

  // 온라인 메시지 처리
  Net.onMsg = (d) => {
    if (onShared(d)) return;
    if (d.t === 'lost') {
      toast('연결이 끊겼어요. 한 기기 모드로 돌아갑니다.');
      mode = 'local';
      if (R.game) leaveGame(); else renderHome();
      return;
    }
    if (Net.role === 'host') {
      if (d.t === 'in') remoteIn = cleanRemote(d);
      else if (d.t === 'cmd' && typeof d.c === 'string') {
        if (['again', 'next', 'menu', 'pause', 'resume'].includes(d.c)) doCommand(d.c);
      } else if (d.t === 'pick' && !R.game) {
        const g = Duo.find(String(d.id));
        if (g) startGame(g.id, g.type === 'coop' ? { stage: Store.int(d.stage, 1, 999, 1) } : {});
      }
      return;
    }
    // 참가자
    if (d.t === 'start') {
      const g = Duo.find(String(d.id));
      if (!g) return;
      R.game = g; R.st = null; R.phase = 'cd'; R.mid = d.mid | 0; R.res = null; R.lastCd = 4;
      R.opts = d.opts && typeof d.opts === 'object' ? d.opts : {};
      enterGameScreen();
    } else if (d.t === 'menu') {
      if (R.game) leaveGame();
    } else if (d.t === 's' && R.game) {
      if ((d.mid | 0) !== R.mid || !d.st || typeof d.st !== 'object') return;
      R.st = d.st;
      if (Array.isArray(d.fx)) d.fx.slice(0, 20).forEach((f) => Sound.play(String(f)));
      const prev = R.phase;
      R.phase = ['cd', 'play', 'pause', 'over'].includes(d.ph) ? d.ph : 'play';
      R.cd = +d.cd || 0;
      if (R.phase === 'over' && d.res && R.recorded !== R.mid) {
        const r = d.res;
        R.res = r.coop ? { coop: 1, clear: !!r.clear, stage: Store.int(r.stage, 1, 999, 1) }
          : { w: [0, 1, -1].includes(r.w) ? r.w : -1, sc: Array.isArray(r.sc) ? [r.sc[0] | 0, r.sc[1] | 0] : null };
        record(R.res);
        showPanel();
      } else if (R.phase === 'pause' && prev !== 'pause') showPanel();
      else if (R.phase !== 'pause' && R.phase !== 'over' && (prev === 'pause' || prev === 'over')) $('#g-panel').hidden = true;
    }
  };
  let lastNetState = 'off';
  Net.onChange = () => {
    if (Net.state === 'connected' && lastNetState !== 'connected') sendSync();
    lastNetState = Net.state;
    if (!$('#home').hidden) renderHome();
  };
  // 누군가 코드를 입력해 들어오려 할 때: 방장이 직접 보고 수락/거절
  let reqOpen = false;
  Net.onRequest = (req) => {
    if (!req) { if (reqOpen) { $('#overlay').hidden = true; reqOpen = false; toast('입장 요청이 취소됐어요.'); } return; }
    reqOpen = true;
    Sound.play('coin'); buzz([40, 60, 40]);
    const box = el('div', 'req');
    const cv = el('canvas'); cv.width = 96; cv.height = 104;
    drawMini(cv, req.look);
    box.append(cv, el('b', '', req.name), el('p', 'hint center', '아는 사람이 맞을 때만 수락하세요. 모르는 사람이면 거절!'));
    dialog('누군가 방에 들어오려고 해요', [
      ['수락', () => { reqOpen = false; req.accept(); }, 'primary'],
      ['거절', () => { reqOpen = false; req.reject(); toast('거절했어요. 방은 계속 열려 있어요.'); }, 'danger'],
    ], box);
  };

  // ================= 메인 루프 =================
  let last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!R.game || $('#game').hidden) return;
    gatherInputs();
    const g = R.game;
    const ann = (st, p) => { if (g.annotate && st) g.annotate(st, IN[p], p, now); };

    if (!isGuest()) {
      const st = R.st;
      if (mode === 'online') ann(st, 0); else { ann(st, 0); ann(st, 1); }
      const inputs = mode === 'online' ? [IN[0], remoteIn] : [IN[0], IN[1]];
      if (R.phase === 'cd') {
        R.cd -= dt;
        if (R.cd <= 0) { R.phase = 'play'; R.goT = 0.6; st.fx.push('go'); }
        else if (Math.ceil(R.cd) < R.lastCd) { R.lastCd = Math.ceil(R.cd); st.fx.push('tick'); }
        // 카운트다운 중 누른 버튼은 무시
        for (const p of [0, 1]) for (const k of ['ac', 'b1c', 'b2c']) st._lc[p][k] = inputs[p][k] | 0;
      } else if (R.phase === 'play') {
        R.acc += dt;
        while (R.acc >= 1 / 60 && R.phase === 'play') {
          R.acc -= 1 / 60;
          g.update(st, inputs, 1 / 60);
          if (st.over) {
            const res = g.type === 'coop'
              ? { coop: 1, clear: !!st.over.clear, stage: st.stage }
              : { w: st.over.w, sc: st.sc ? [st.sc[0], st.sc[1]] : null };
            finish(res);
          }
        }
      }
      if (st.fx.length) {
        for (const f of st.fx) Sound.play(f);
        if (online()) R.fxBuf.push(...st.fx);
        st.fx.length = 0;
      }
      if (online()) {
        R.sendT -= dt;
        if (R.sendT <= 0 || R.phase === 'over') {
          R.sendT = 1 / 30;
          if (g.pack) g.pack(st);
          Net.send({ t: 's', mid: R.mid, st, ph: R.phase, cd: Math.round(R.cd * 100) / 100, fx: R.fxBuf, res: R.phase === 'over' ? R.res : null });
          R.fxBuf = [];
        }
      }
    } else {
      // 참가자: 내 입력만 보내고, 화면은 방장이 보낸 상태를 그린다
      ann(R.st, 1);
      const j = JSON.stringify(IN[1]);
      R.inSendT -= dt;
      if (j !== R.lastInJson || R.inSendT <= 0) {
        R.lastInJson = j; R.inSendT = 0.2;
        Net.send(Object.assign({ t: 'in' }, IN[1]));
      }
      if (R.phase === 'play' && R.lastCd > 0) { R.lastCd = 0; R.goT = 0.6; }
    }
    R.goT = Math.max(0, R.goT - dt);
    draw(now / 1000);
  }
  requestAnimationFrame(loop);

  // ================= 그리기 =================
  const cv = $('#cv');
  const ctx = cv.getContext('2d');
  let scale = 1, dpr = 1;
  function resize() {
    if ($('#game').hidden) return;
    const f = $('#field');
    const w = f.clientWidth - 8, h = f.clientHeight - 8;
    scale = Math.max(0.3, Math.min(w / Duo.W, h / Duo.H));
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.style.width = Math.floor(Duo.W * scale) + 'px';
    cv.style.height = Math.floor(Duo.H * scale) + 'px';
    cv.width = Math.floor(Duo.W * scale * dpr);
    cv.height = Math.floor(Duo.H * scale * dpr);
  }
  addEventListener('resize', resize);
  addEventListener('orientationchange', () => setTimeout(resize, 200));

  let hudCache = {};
  function draw(t) {
    const k = scale * dpr;
    // 참가자(2P)는 자기 캐릭터가 아래에 오도록 경기장을 180도 돌려서 본다
    Duo.flipped = isGuest();
    if (isGuest()) ctx.setTransform(-k, 0, 0, -k, Duo.W * k, Duo.H * k);
    else ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.clearRect(0, 0, Duo.W, Duo.H);
    const st = R.st;
    if (st) R.game.render(ctx, st, t);
    else { ctx.fillStyle = '#151226'; ctx.fillRect(0, 0, Duo.W, Duo.H); }

    // 카운트다운 (숫자는 대칭에 가까워 양쪽에서 읽기 쉬움)
    const cdEl = $('#g-cd');
    let cdText = '';
    if (R.phase === 'cd') cdText = String(Math.max(1, Math.ceil(R.cd)));
    else if (R.goT > 0 && R.phase === 'play') cdText = 'GO';
    if (isGuest() && R.phase === 'cd') R.lastCd = 4;
    if (cdEl.textContent !== cdText) cdEl.textContent = cdText;

    // 조작판 글자 (점수/안내)
    if (st) {
      const ps = mode === 'online' ? [myIndex()] : [0, 1];
      for (const p of ps) {
        const zone = mode === 'online' || p === 0 ? $('#zone1') : $('#zone2');
        const hud = R.game.hud(st, p);
        const stat = R.phase === 'over' && R.res
          ? (R.res.coop ? (R.res.clear ? '클리어! 🎉' : '실패 💦') : (R.res.w === -1 ? '무승부' : R.res.w === p ? '승리! 🏆' : '패배'))
          : R.phase === 'pause' ? '일시정지' : R.phase === 'cd' ? '준비…' : R.game.status(st, p);
        const key = hud + '|' + stat;
        if (hudCache[p] !== key) {
          hudCache[p] = key;
          zone.querySelector('.zhud').textContent = hud;
          zone.querySelector('.zstat').textContent = stat;
        }
      }
    }
  }

  // 화면 꺼짐 방지 (지원하는 브라우저만)
  let lock = null;
  async function wake(on) {
    try {
      if (on && !lock && navigator.wakeLock) lock = await navigator.wakeLock.request('screen');
      if (!on && lock) { lock.release(); lock = null; }
    } catch (e) { lock = null; }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && R.game) { lock = null; wake(true); }
    if (document.visibilityState === 'hidden' && R.game && !isGuest() && R.phase === 'play') doCommand('pause');
  });

  $('#g-back').addEventListener('click', () => {
    if (R.phase === 'over' || confirm('게임을 그만할까요?')) command('menu');
  });
  $('#g-pause').addEventListener('click', () => command(R.phase === 'pause' ? 'resume' : 'pause'));

  // ================= 홈 화면 =================
  function renderHome() {
    document.querySelectorAll('#mode-seg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    const body = $('#mode-body');
    body.innerHTML = '';
    if (mode === 'local') {
      body.append(el('p', 'hint', '폰을 테이블에 놓고 마주 앉아요. 아래쪽이 1P, 위쪽이 2P. PC에서는 1P = WASD + 스페이스, 2P = 방향키 + 엔터. 인터넷이 없어도 돼요 ✈'));
      const row = el('div', 'char-row');
      row.append(charCard(0, '1P · 파랑'), charCard(1, '2P · 분홍'));
      body.append(row);
    } else {
      body.append(charCard(0, '내 캐릭터', true));
      const s = Net.state;
      if (s === 'connected') {
        const box = el('div', 'net-ok');
        box.append(el('b', '', `✅ ${Net.peerName || '상대'}님과 연결됨`));
        box.append(el('span', '', Net.role === 'host' ? `방장(1P · 파랑) · 코드 ${Net.code}` : `참가자(2P · 분홍) · 코드 ${Net.code}`));
        body.append(box);
        if (Net.error) body.append(el('p', 'err', Net.error));
        if (D().friends.length) {
          const rs = el('button', 'btn', '📦 친구 기록 보내기 (복구용)');
          rs.addEventListener('click', openSendRestore);
          body.append(rs);
        }
        const bye = el('button', 'btn', '연결 끊기');
        bye.addEventListener('click', () => { Net.leave(); renderHome(); });
        body.append(bye);
      } else if (s === 'waiting') {
        const box = el('div', 'net-code');
        box.append(el('span', '', '상대에게 이 코드를 알려주세요'));
        box.append(el('b', '', Net.code));
        box.append(el('span', '', '상대가 입력하면 수락 버튼이 떠요 · 코드는 말로만 알려주세요'));
        body.append(box);
        const c = el('button', 'btn', '취소');
        c.addEventListener('click', () => Net.leave());
        body.append(c);
      } else if (s === 'loading' || s === 'joining' || s === 'approval') {
        body.append(el('p', 'hint', s === 'approval' ? '방장이 수락하기를 기다리는 중… (방장 화면에 내 이름이 떠요)' : '연결하는 중…'));
        const c = el('button', 'btn', '취소');
        c.addEventListener('click', () => Net.leave());
        body.append(c);
      } else {
        if (!navigator.onLine) body.append(el('p', 'err', '지금은 인터넷이 없어요. 비행기 안에서는 ‘한 기기로 둘이’를 써 주세요.'));
        if (Net.error) body.append(el('p', 'err', Net.error));
        const hostBtn = el('button', 'btn primary', '방 만들기 (코드 받기)');
        hostBtn.addEventListener('click', () => { Sound.unlock(); Net.host(); });
        const row = el('div', 'join-row');
        const inp = el('input', 'text-input');
        inp.inputMode = 'numeric'; inp.maxLength = 4; inp.placeholder = '코드 4자리'; inp.autocomplete = 'off';
        const jb = el('button', 'btn', '참가');
        jb.addEventListener('click', () => { Sound.unlock(); Net.join(inp.value); });
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') jb.click(); });
        row.append(inp, jb);
        body.append(hostBtn, row);
        body.append(el('p', 'hint', '한 명이 방을 만들고, 다른 한 명이 코드를 입력하면 돼요. 둘 다 인터넷(같은 와이파이나 핫스팟 추천)이 필요해요. 무료예요.'));
      }
    }
    renderList();
  }

  // ================= 캐릭터 카드 / 만들기 / 꾸미기 =================
  // 흐름: 처음 → 성별 선택 → 성별 기본 캐릭터 → 꾸미기 → 저장(성별 고정) → 이후엔 꾸미기만
  function drawMini(cv, look, ghost) {
    const c = cv.getContext('2d');
    c.clearRect(0, 0, cv.width, cv.height);
    const k = cv.height / 48;
    Avatar.draw(c, look, cv.width / 2, 32 * k, k, { fy: 1, alpha: ghost ? 0.3 : 1 });
  }

  function charCard(i, label) {
    const L = D().chars[i];
    const card = el('button', 'char-card');
    card.style.borderColor = Duo.COLORS[i];
    const cv = el('canvas');
    cv.width = 96; cv.height = 104;
    drawMini(cv, L || Avatar.def(i), !L);
    const tx = el('span', 'char-text');
    tx.append(el('small', '', label), el('b', '', D().names[i]), el('span', '', L ? '탭해서 꾸미기 ✏️' : '탭해서 만들기'));
    card.append(cv, tx);
    card.addEventListener('click', () => openCreator(i));
    return card;
  }

  const CR = { i: 0, draft: null, isNew: false, after: null };

  function openCreator(i, after) {
    CR.i = i;
    CR.after = after || null;
    const saved = D().chars[i];
    CR.isNew = !saved;
    CR.draft = saved ? Object.assign({}, saved) : null;
    const who = i === 0 ? (mode === 'online' ? '내' : '1P') : '2P';
    $('#cr-title').textContent = `${who} 캐릭터 ${CR.isNew ? '만들기' : '꾸미기'}`;
    $('#cr-cancel').hidden = CR.isNew && i === 0 && !D().chars[0];   // 맨 처음 1P는 꼭 만들기
    $('#cr-name').value = D().names[i];
    show('creator');
    if (CR.isNew) genderStep(); else editStep();
  }

  function genderStep() {
    $('#cr-gender').hidden = false;
    $('#cr-edit').hidden = true;
    const box = $('#cr-gender-btns');
    box.innerHTML = '';
    for (const [g, label] of [[0, '남자'], [1, '여자']]) {
      const b = el('button', 'gender-card');
      const cv = el('canvas');
      cv.width = 120; cv.height = 130;
      drawMini(cv, Avatar.def(g));
      b.append(cv, el('b', '', label));
      b.addEventListener('click', () => { CR.draft = Avatar.def(g); editStep(); });
      box.append(b);
    }
  }

  function editStep() {
    $('#cr-gender').hidden = true;
    $('#cr-edit').hidden = false;
    $('#cr-gnote').textContent = `성별: ${CR.draft.g ? '여자' : '남자'} · ` +
      (CR.isNew ? '저장하면 성별은 바꿀 수 없어요' : '성별은 처음에 정해서 바꿀 수 없어요. 꾸미기는 언제든 OK');
    $('#cr-regender').hidden = !CR.isNew;
    renderOpts();
  }

  function renderOpts() {
    const box = $('#cr-opts');
    box.innerHTML = '';
    const pl = D().players.find((x) => x.n === D().names[CR.i]);
    const wins = pl ? pl.w : 0;
    const group = (title, key, items) => {
      const sec = el('div', 'opt');
      sec.append(el('h4', '', title));
      const row = el('div', 'opt-row');
      items.forEach((it, idx) => {
        const b = el('button', (it.color ? 'sw' : 'chip') + (CR.draft[key] === idx ? ' on' : ''), it.label || '');
        if (it.color) { b.style.background = it.color; b.setAttribute('aria-label', title + ' ' + (idx + 1)); }
        if (it.locked) { b.disabled = true; b.textContent = '🔒 ' + it.label; b.title = it.lockText; }
        b.addEventListener('click', () => { CR.draft[key] = idx; renderOpts(); });
        row.append(b);
      });
      sec.append(row);
      if (items.some((x) => x.locked)) sec.append(el('p', 'hint tiny', items.find((x) => x.locked).lockText));
      box.append(sec);
    };
    group('피부', 'sk', Avatar.SKIN.map((c) => ({ color: c })));
    group('머리 모양', 'hs', Avatar.STYLES.map((l) => ({ label: l })));
    group('머리 색', 'hc', Avatar.HAIR.map((c) => ({ color: c })));
    group('윗옷', 'tc', Avatar.TOP.map((c) => ({ color: c })));
    group(CR.draft.g ? '치마' : '바지', 'bc', Avatar.BOT.map((c) => ({ color: c })));
    group('소품', 'ac', Avatar.ACC.map((l, i) => ({
      label: l,
      locked: i === 5 && wins < Avatar.CROWN_WINS && CR.draft.ac !== 5,
      lockText: `👑 왕관은 대결 ${Avatar.CROWN_WINS}승부터 열려요 (지금 ${wins}승)`,
    })));
  }

  // 미리보기: 살짝 통통 튀며 천천히 방향을 바꿔 앞/옆/뒤를 보여준다
  (function previewLoop() {
    requestAnimationFrame(previewLoop);
    if ($('#creator').hidden || !CR.draft) return;
    const cv = $('#cr-prev');
    const dprN = Math.min(window.devicePixelRatio || 1, 2);
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dprN)) { cv.width = Math.round(w * dprN); cv.height = Math.round(h * dprN); }
    const c = cv.getContext('2d');
    c.setTransform(dprN, 0, 0, dprN, 0, 0);
    c.clearRect(0, 0, w, h);
    const t = performance.now() / 1000;
    const phase = Math.floor(t / 2.2) % 4;           // 앞 → 오른쪽 → 뒤 → 왼쪽
    const dirs = [[0, 1], [1, 0.2], [0, -1], [-1, 0.2]];
    const k = h / 50;
    Avatar.draw(c, CR.draft, w / 2, 33 * k, k, { fx: dirs[phase][0], fy: dirs[phase][1], bob: Math.abs(Math.sin(t * 3)) * -1.2, ring: Duo.COLORS[CR.i] });
  })();

  $('#cr-regender').addEventListener('click', () => genderStep());
  $('#cr-save').addEventListener('click', () => {
    const i = CR.i;
    const nm = Store.name($('#cr-name').value, i ? '친구' : '나');
    if (nm === D().names[1 - i] && (i === 1 || D().chars[1])) { toast('1P와 2P 이름을 다르게 해 주세요.'); return; }
    const prev = D().chars[i];
    const look = Avatar.clean(CR.draft);
    if (prev) look.g = prev.g;          // 저장된 뒤에는 성별 고정
    D().chars[i] = look;
    D().names[i] = nm;
    Store.save();
    toast(CR.isNew ? '캐릭터를 만들었어요! 🎉' : '저장했어요!');
    if (online() && i === 0) toast('바뀐 모습은 다음 연결부터 상대에게 보여요.');
    const after = CR.after;
    CR.draft = null;
    if (after) after(); else { show('home'); renderHome(); }
  });
  $('#cr-cancel').addEventListener('click', () => { CR.draft = null; show('home'); renderHome(); });

  function renderList() {
    for (const type of ['vs', 'coop']) {
      const box = $(type === 'vs' ? '#list-vs' : '#list-coop');
      box.innerHTML = '';
      for (const g of Duo.games.filter((x) => x.type === type)) {
        const card = el('button', 'card');
        card.append(el('span', 'card-icon', g.icon));
        const tx = el('span', 'card-text');
        tx.append(el('b', '', g.name), el('span', '', g.desc));
        if (type === 'coop') {
          const c = D().coop[g.id];
          tx.append(el('small', '', c && c.best ? `최고 ${c.best}판 클리어 · 다음 ${c.cur}판` : '1판부터 시작'));
        }
        card.append(tx);
        card.addEventListener('click', () => pick(g));
        box.append(card);
      }
    }
  }

  function pick(g) {
    Sound.unlock();
    if (mode === 'online' && Net.state !== 'connected') { toast('먼저 위에서 연결해 주세요.'); return; }
    if (mode === 'local' && !D().chars[1]) {
      toast('2P 친구의 캐릭터를 먼저 만들어요!');
      openCreator(1, () => { show('home'); renderHome(); pick(g); });
      return;
    }
    const go = (stage) => {
      const opts = g.type === 'coop' ? { stage } : {};
      if (isGuest()) { Net.send({ t: 'pick', id: g.id, stage }); toast('방장 기기에서 시작해요…'); }
      else startGame(g.id, opts);
    };
    const c = D().coop[g.id];
    if (g.type === 'coop' && c && c.cur > 1) {
      dialog(g.name, [[`이어하기 (${c.cur}판부터)`, () => go(c.cur), 'primary'], ['처음부터', () => go(1), ''], ['취소', null, '']]);
    } else go(1);
  }

  function dialog(title, btns, extra) {
    const ov = $('#overlay');
    ov.innerHTML = '';
    const box = el('div', 'dlg');
    box.append(el('h3', '', title));
    if (extra) box.append(extra);
    const col = el('div', 'btn-col');
    for (const [label, fn, cls] of btns) {
      const b = el('button', 'btn ' + cls, label);
      b.addEventListener('click', () => { ov.hidden = true; if (fn) fn(); });
      col.append(b);
    }
    box.append(col);
    ov.append(box);
    ov.hidden = false;
  }

  document.querySelectorAll('#mode-seg button').forEach((b) => b.addEventListener('click', () => {
    mode = b.dataset.mode;
    renderHome();
  }));

  // ================= 소원권 · 전적 =================
  let wishSel = '';
  let editRewards = false;
  function renderWish() {
    const list = $('#rank');
    list.innerHTML = '';
    const ps = D().players.slice().sort((a, b) => b.w - a.w || b.t - a.t);
    if (!ps.length) list.append(el('p', 'hint', '아직 기록이 없어요. 대결에서 이기면 소원권 🎟을 받아요!'));
    ps.forEach((p, i) => {
      const row = el('button', 'rank-row' + (p.n === wishSel ? ' sel' : ''));
      row.append(el('span', 'rk', ['🥇', '🥈', '🥉'][i] || String(i + 1)));
      row.append(el('b', '', p.n));
      row.append(el('span', 'rec', `${p.w}승 ${p.l}패 ${p.d}무`));
      row.append(el('span', 'tk', `🎟 ${p.t}`));
      row.addEventListener('click', () => { wishSel = p.n; renderWish(); });
      list.append(row);
    });
    if (!wishSel && ps.length) wishSel = ps[0].n;
    const sel = D().players.find((p) => p.n === wishSel);

    const rw = $('#rewards');
    rw.innerHTML = '';
    $('#wish-who').textContent = sel ? `${sel.n}의 소원권: 🎟 ${sel.t}장 (위에서 사람을 골라요)` : '';
    D().rewards.forEach((r, i) => {
      const row = el('div', 'reward');
      if (editRewards) {
        const c = el('input', 'text-input cost'); c.type = 'number'; c.min = 1; c.max = 999; c.value = r.c;
        const x = el('input', 'text-input'); x.maxLength = 30; x.value = r.x;
        c.addEventListener('change', () => { r.c = Store.int(c.value, 1, 999, r.c); c.value = r.c; rewardsChanged(); });
        x.addEventListener('change', () => { r.x = Store.text(x.value, 30) || r.x; x.value = r.x; rewardsChanged(); });
        const del = el('button', 'icon-btn', '✕');
        del.addEventListener('click', () => { D().rewards.splice(i, 1); rewardsChanged(); renderWish(); });
        row.append(el('span', '', '🎟'), c, el('span', '', '장'), x, del);
      } else {
        row.append(el('span', 'cost-b', `🎟 ${r.c}장`), el('span', 'rx', r.x));
        const use = el('button', 'btn small' + (sel && sel.t >= r.c ? ' primary' : ''), '사용');
        use.disabled = !sel || sel.t < r.c;
        use.addEventListener('click', () => {
          dialog(`${sel.n}님, 소원권 ${r.c}장을 써서`, [[`‘${r.x}’ 쓰기`, () => {
            if (Store.useReward(sel.n, i)) { Sound.play('big'); toast(`🎉 ${sel.n}: ‘${r.x}’ 소원 사용!`); renderWish(); }
          }, 'primary'], ['취소', null, '']]);
        });
        row.append(use);
      }
      rw.append(row);
    });
    if (editRewards) {
      const add = el('button', 'btn', '+ 소원 추가');
      add.addEventListener('click', () => { if (D().rewards.length < 20) { D().rewards.push({ c: 3, x: '새 소원' }); rewardsChanged(); renderWish(); } });
      rw.append(add);
    }
    $('#btn-edit-rw').textContent = editRewards ? '편집 끝' : '소원 목록 편집';

    const log = $('#wish-log');
    log.innerHTML = '';
    if (!D().log.length) log.append(el('p', 'hint', '아직 사용한 소원이 없어요.'));
    for (const l of D().log) {
      const d = new Date(l.d);
      log.append(el('div', 'log-row', `${d.getMonth() + 1}/${d.getDate()} ${l.n} — ${l.x}`));
    }
  }
  $('#btn-wish').addEventListener('click', () => { show('wish'); renderWish(); });
  $('#wish-back').addEventListener('click', () => { show('home'); renderHome(); });
  $('#btn-edit-rw').addEventListener('click', () => { editRewards = !editRewards; renderWish(); });

  // ================= 설정 =================
  function renderSettings() {
    $('#btn-sound').textContent = '소리: ' + (D().sound ? '켜짐 🔊' : '꺼짐 🔇');
    $('#btn-vib').textContent = '진동: ' + (D().vib ? '켜짐' : '꺼짐');
  }
  $('#btn-sound').addEventListener('click', () => { D().sound = D().sound ? 0 : 1; Store.save(); renderSettings(); });
  $('#btn-vib').addEventListener('click', () => { D().vib = D().vib ? 0 : 1; Store.save(); renderSettings(); });
  $('#btn-export').addEventListener('click', async () => {
    const code = Store.exportCode();
    try { await navigator.clipboard.writeText(code); toast('백업 코드를 복사했어요. 메모장 등에 붙여넣어 보관하세요.'); }
    catch (e) {
      const ta = el('textarea', 'text-input code-box'); ta.value = code; ta.readOnly = true;
      dialog('백업 코드 (길게 눌러 복사)', [['닫기', null, '']], ta);
    }
  });
  $('#btn-import').addEventListener('click', () => {
    const ta = el('textarea', 'text-input code-box'); ta.placeholder = 'DUO1.로 시작하는 코드를 붙여넣기';
    dialog('저장 불러오기', [['불러오기', () => {
      if (Store.importCode(ta.value)) { toast('불러왔어요!'); renderHome(); renderSettings(); }
      else toast('코드가 올바르지 않아요.');
    }, 'primary'], ['취소', null, '']], ta);
  });
  $('#btn-reset').addEventListener('click', () => {
    dialog('정말 모든 기록을 지울까요?', [['전적·소원권·진행 모두 지우기', () => { Store.reset(); renderHome(); renderSettings(); toast('초기화했어요.'); }, 'danger'], ['취소', null, '']]);
  });

  // ================= 구글 시트 =================
  function renderSheetLink() {
    const a = $('#g-link');
    if (D().sheetId) { a.href = GSheet.url(D().sheetId); a.hidden = false; } else a.hidden = true;
  }
  // 로그인 창이 막히지 않게, 설정 버튼이 화면에 보이면 구글 스크립트를 미리 불러 둔다
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((ents) => {
      if (ents.some((e) => e.isIntersecting) && navigator.onLine) { GSheet.prepare().catch(() => {}); io.disconnect(); }
    });
    io.observe($('#btn-gup'));
  }
  let gBusy = false;
  async function gRun(btn, label, fn) {
    if (gBusy) return;
    if (!navigator.onLine) { toast('인터넷이 연결돼 있을 때 할 수 있어요.'); return; }
    gBusy = true;
    const old = btn.textContent;
    btn.textContent = label;
    btn.disabled = true;
    try { await fn(); }
    catch (e) { toast(e && e.message ? e.message : '구글 시트 작업에 실패했어요.'); }
    finally { gBusy = false; btn.textContent = old; btn.disabled = false; renderSheetLink(); }
  }
  $('#btn-gup').addEventListener('click', () => gRun($('#btn-gup'), '업로드 중…', async () => {
    await GSheet.upload();
    toast('구글 시트에 업로드했어요 ☁');
  }));
  $('#btn-gdown').addEventListener('click', () => {
    dialog('구글 시트 내용으로 이 폰의 기록을 바꿀까요?', [
      ['내려받기', () => gRun($('#btn-gdown'), '내려받는 중…', async () => {
        await GSheet.download();
        if (online() && Net.role === 'host') Net.send({ t: 'rw', rw: D().rewards });   // 소원 목록은 친구에게도
        toast('구글 시트에서 내려받았어요!');
        renderSettings();
        refreshViews();
      }), 'primary'],
      ['취소', null, ''],
    ], el('p', 'hint center', '캐릭터·전적·소원권·소원 목록·협동 진행이 마지막 업로드 때로 돌아가요.'));
  });

  // 앱 설치
  let installEvt = null;
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('#btn-install').hidden = false; });
  $('#btn-install').addEventListener('click', async () => {
    if (!installEvt) return;
    installEvt.prompt();
    await installEvt.userChoice.catch(() => {});
    installEvt = null; $('#btn-install').hidden = true;
  });
  addEventListener('online', () => { if (!$('#home').hidden) renderHome(); });
  addEventListener('offline', () => { if (!$('#home').hidden) renderHome(); });

  $('#app-version').textContent = 'v' + APP_VERSION;
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});

  renderSettings();
  renderSheetLink();
  if (!D().chars[0]) openCreator(0); else { show('home'); renderHome(); }

  // 테스트용 (개발자 도구 콘솔에서 확인)
  window.__duo = { R, IN, Net, startGame, mode: () => mode };
})();
