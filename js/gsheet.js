'use strict';
// 구글 시트 백업 (업로드 / 내려받기).
// 권한은 drive.file: 이 앱이 만든 시트만 보고 쓸 수 있다 (드라이브의 다른 파일은 접근 불가).
// 클라이언트 ID는 원래 공개되는 값이라 코드에 들어 있어도 괜찮다. (가계부와 같은 구글 프로젝트)
const GSheet = (() => {
  const CLIENT_ID = '392349191681-mh667if7gdff0qeef1h1eqi3uqrkj1hi.apps.googleusercontent.com';
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
  const DRIVE = 'https://www.googleapis.com/drive/v3/files';
  const TITLE = '듀오 아케이드';
  const TABS = ['전적', '소원 목록', '캐릭터', '협동 진행', '백업'];
  const TOKEN_KEY = 'duo-google-token';

  let token = null, client = null, gis = null;
  try { const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY)); if (t && t.exp > Date.now() + 60000) token = t; } catch (e) { /* 무시 */ }

  function loadGis() {
    gis = gis || new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.onload = res;
      s.onerror = () => { gis = null; rej(new Error('구글 로그인을 불러오지 못했어요. 인터넷을 확인해 주세요.')); };
      document.head.appendChild(s);
    });
    return gis;
  }

  // 로그인 창은 버튼을 누른 직후 열어야 차단되지 않아서, 스크립트는 미리 불러 둔다.
  async function prepare() {
    await loadGis();
    client = client || window.google.accounts.oauth2.initTokenClient({ client_id: CLIENT_ID, scope: SCOPE, callback: () => {} });
  }

  function signIn() {
    if (token && token.exp > Date.now() + 60000) return Promise.resolve();
    if (!client) return prepare().then(signIn);
    return new Promise((res, rej) => {
      client.callback = (r) => {
        if (r.error) { rej(new Error('구글 로그인하지 못했어요.')); return; }
        token = { v: r.access_token, exp: Date.now() + r.expires_in * 1000 };
        try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token)); } catch (e) { /* 무시 */ }
        res();
      };
      client.error_callback = (e) => rej(new Error(e && e.type === 'popup_closed' ? '로그인 창이 닫혔어요.' : '구글 로그인하지 못했어요.'));
      client.requestAccessToken({ prompt: '' });
    });
  }

  async function api(url, method = 'GET', body) {
    const res = await fetch(url, {
      method,
      headers: Object.assign({ Authorization: 'Bearer ' + token.v }, body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) {
      token = null;
      try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* 무시 */ }
      throw new Error('구글 로그인이 만료됐어요. 다시 눌러 주세요.');
    }
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      const err = new Error(/SERVICE_DISABLED|has not been used|is disabled/.test(t)
        ? 'Google Cloud에서 Google Sheets API가 꺼져 있어요.' : '구글 요청이 실패했어요 (' + res.status + ')');
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  async function tabsOf(id) {
    const d = await api(SHEETS + '/' + id + '?fields=sheets.properties(sheetId,title)');
    return new Map(d.sheets.map((s) => [s.properties.title, s.properties.sheetId]));
  }

  // 저장해 둔 ID → 드라이브에서 이름으로 찾기. 없으면 null
  async function find() {
    const saved = Store.data.sheetId;
    if (saved) {
      try { return { id: saved, tabs: await tabsOf(saved) }; }
      catch (e) { if (e.status !== 404 && e.status !== 403) throw e; }
    }
    const query = encodeURIComponent("name = '" + TITLE + "' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false");
    const r = await api(DRIVE + '?q=' + query + '&fields=files(id)&spaces=drive');
    return r.files && r.files[0] ? { id: r.files[0].id, tabs: await tabsOf(r.files[0].id) } : null;
  }

  async function create() {
    const d = await api(SHEETS + '?fields=spreadsheetId', 'POST', { properties: { title: TITLE, locale: 'ko_KR' }, sheets: [{ properties: { title: TABS[0] } }] });
    return { id: d.spreadsheetId, tabs: await tabsOf(d.spreadsheetId) };
  }

  async function prepareTabs(sh) {
    const missing = TABS.filter((t) => !sh.tabs.has(t));
    if (missing.length) {
      await api(SHEETS + '/' + sh.id + ':batchUpdate', 'POST', { requests: missing.map((title) => ({ addSheet: { properties: { title } } })) });
      sh.tabs = await tabsOf(sh.id);
    }
    await api(SHEETS + '/' + sh.id + ':batchUpdate', 'POST', {
      requests: TABS.flatMap((t) => [
        { updateSheetProperties: { properties: { sheetId: sh.tabs.get(t), gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
        { repeatCell: { range: { sheetId: sh.tabs.get(t), startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.99, green: 0.93, blue: 0.7 } } }, fields: 'userEnteredFormat(textFormat,backgroundColor)' } },
      ]),
    });
  }

  const q = (t) => "'" + t + "'";
  const LOOK = (L) => [L.g ? '여자' : '남자', Avatar.STYLES[L.hs], Avatar.ACC[L.ac], [L.sk, L.hs, L.hc, L.tc, L.bc, L.ac].join(',')];

  // 폰 → 시트 (시트를 폰 내용으로 덮어쓰기)
  async function upload() {
    await signIn();
    const d = Store.data;
    const sh = (await find()) || (await create());
    await prepareTabs(sh);
    const gname = (id) => { const g = Duo.find(id); return g ? g.name : id; };
    const rows = {
      '전적': [['이름', '승', '패', '무', '남은 소원권', '쓴 소원권']].concat(
        d.players.slice().sort((a, b) => b.w - a.w).map((p) => [p.n, p.w, p.l, p.d, p.t, p.u])),
      '소원 목록': [['필요한 소원권(장)', '소원 (여기서 고친 뒤 앱에서 내려받기 하면 반영돼요)']].concat(d.rewards.map((r) => [r.c, r.x])),
      '캐릭터': [['이름', '구분', '성별', '머리', '소품', '외형 코드']].concat(
        d.chars[0] ? [[d.names[0], '나 (1P)'].concat(LOOK(d.chars[0]))] : [],
        d.chars[1] ? [[d.names[1], '같은 기기 2P'].concat(LOOK(d.chars[1]))] : [],
        d.friends.map((f) => [f.n, '친구 (보관)'].concat(LOOK(f.look)))),
      '협동 진행': [['게임', '누구', '다음 판', '최고 클리어']].concat(
        Object.entries(d.coop).map(([k, c]) => [gname(k), '나', c.cur, c.best]),
        d.friends.flatMap((f) => Object.entries(f.coop).map(([k, c]) => [gname(k), f.n, c.cur, c.best]))),
      '백업': [['백업 코드 (지우거나 고치지 마세요 · 내려받기에 쓰여요)', '업로드 시각'], [Store.exportCode(), new Date().toLocaleString('ko-KR')]],
    };
    await api(SHEETS + '/' + sh.id + '/values:batchClear', 'POST', { ranges: TABS.map(q) });
    // RAW: 이름이 '=' 로 시작해도 수식으로 실행되지 않고 글자 그대로 들어간다
    await api(SHEETS + '/' + sh.id + '/values:batchUpdate', 'POST', {
      valueInputOption: 'RAW',
      data: TABS.map((t) => ({ range: q(t) + '!A1', values: rows[t] })),
    });
    d.sheetId = sh.id;
    Store.save();
    return sh.id;
  }

  // 시트 → 폰 (백업 코드로 전체 복원 + '소원 목록' 탭은 시트에서 고친 내용 반영)
  async function download() {
    await signIn();
    const sh = await find();
    if (!sh) throw new Error('구글 드라이브에 아직 업로드한 시트가 없어요.');
    const r = await api(SHEETS + '/' + sh.id + '/values:batchGet?ranges=' + encodeURIComponent(q('백업') + '!A2') + '&ranges=' + encodeURIComponent(q('소원 목록') + '!A2:B21'));
    const vr = r.valueRanges || [];
    const code = vr[0] && vr[0].values && vr[0].values[0] && vr[0].values[0][0];
    if (!code || !Store.importCode(code)) throw new Error("시트의 '백업' 탭이 비었거나 망가졌어요.");
    const rw = Store.rewardsFromRows(vr[1] && vr[1].values);
    if (rw) Store.setRewards(rw);
    Store.data.sheetId = sh.id;
    Store.save();
    return sh.id;
  }

  const url = (id) => 'https://docs.google.com/spreadsheets/d/' + id + '/edit';

  return { prepare, upload, download, url };
})();
