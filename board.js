/* ============================================================================
 *  현장 상황판 — 애플리케이션
 *  이 파일은 현장이 바뀌어도 수정하지 않습니다. field.config.js 만 고치세요.
 * ========================================================================== */
(function () {
'use strict';

const C = window.FIELD;
if (!C) { document.body.innerHTML = '<p style="padding:40px">field.config.js 를 찾을 수 없습니다.</p>'; return; }

/* ── 도구 ─────────────────────────────────────────────────────────── */
const $  = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const H  = s => String(s == null ? '' : s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const pad = n => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
const move = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
const gradeOf = id => C.grades.find(g => g.id === id) ||
  { id:null, label:'미지정', color:'#6E6E70', weight:0 };
const mins = t => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const CACHE = 'field_' + C.field.code;
const L = Object.assign({ zone: '구역', level: '층' }, C.labels || {});
/* 구역 = 설계도면에서 뽑은 획지. poly/at 는 전경사진 기준 0~1 비율 좌표. */
const ZN = (C.map && C.map.zones) || [];
const ZONES = ZN.map(z => z.name);
const zoneOf = n => ZN.find(z => z.name === n);
/* 도면 맞추기 보정값 — 전체 획지 레이어를 함께 이동·확대·회전시킵니다. */
const FIT0 = { dx:0, dy:0, k:1, r:0 };
function fitv() { return Object.assign({}, FIT0, S.fit || {}); }
function fx(x, y) {                       // 비율좌표 → 보정된 비율좌표
  const f = fitv(), a = f.r * Math.PI / 180;
  const cx = x - 0.5, cy = y - 0.5;
  const rx = cx * Math.cos(a) - cy * Math.sin(a);
  const ry = cx * Math.sin(a) + cy * Math.cos(a);
  return [0.5 + rx * f.k + f.dx, 0.5 + ry * f.k + f.dy];
}
const polyStr = z => (z.poly || []).map(q => fx(q[0], q[1]).map(v => (v*100).toFixed(3)).join(',')).join(' ');

let noteT;
function note(msg, bad) {
  const n = $('#note');
  n.textContent = msg;
  n.className = 'note' + (bad ? ' bad' : '');
  n.hidden = false;
  clearTimeout(noteT);
  noteT = setTimeout(() => { n.hidden = true; }, 2800);
}

/* ── 상태 ─────────────────────────────────────────────────────────── */
const S = {
  user: null, rank: 'view',        // own | edit | view
  vendor: null,                    // 협력사 계정이면 고정된 업체명
  memberName: null,
  reviews: {},
  members: {},                     // { 작업id: {state,note,at,by} }
  date: today(),
  panel: 'board',
  entries: [],
  step: 1,
  editId: null,
  pick: { zones: [], levels: [], grade: null },
  jobs: [],
  weather: null,
  alertIdx: 0,
  alerts: [],
  rvFilter: null,
  fitting: false,
  fit: null,
  fitBak: null,
  sZoom: 1,
  sFit: true,
  subVendor: null,
  imgSize: null
};
const mayWrite = () => S.rank === 'own' || S.rank === 'edit';
const isOwner  = () => S.rank === 'own';
// members 값이 문자열이면 등급만, 객체면 {rank,vendor,name}
function readMember(v) {
  if (typeof v === 'string') return { rank: v, vendor: null, name: null };
  if (v && typeof v === 'object') return { rank: v.rank || 'view', vendor: v.vendor || null, name: v.name || null };
  return { rank: 'view', vendor: null, name: null };
}
const reviewOf = id => S.reviews[id] || null;
/* 결재 이력 표기 — 누가, 언제 */
function memberName(uid) {
  if (!uid) return '';
  const m = readMember((S.members || {})[uid]);
  return m.name || (uid === (S.user && S.user.uid) ? '나' : uid.slice(0, 6));
}
function stamp(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return `${pad(d.getMonth()+1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
// 결재 상태: ok(승인) / no(반려) / null(대기)
function reviewState(e) {
  if (!C.submission || C.submission.requireApproval === false) return 'ok';
  const r = reviewOf(e.id);
  return r ? r.state : null;
}

/* ══════════════════════════════════════════════════════════════════
   1. 초기 구성
   ════════════════════════════════════════════════════════════════ */
function theme() {
  const b = C.field.brand, r = document.documentElement.style;
  r.setProperty('--base',    b.base);
  r.setProperty('--surface', b.surface);
  r.setProperty('--deep',    b.deep);
  r.setProperty('--line',    b.line);
  r.setProperty('--dim',     b.gray);
  r.setProperty('--red',     b.red);
  const m = document.querySelector('meta[name=theme-color]');
  if (m) m.content = b.base;
  if (C.field.logo) {
    $('#authCi').src = C.field.logo;
    $('#headCi').src = C.field.logo;
    $('#waitCi').src = C.field.logo;
  } else {
    $('#authCi').hidden = true; $('#headCi').hidden = true; $('#waitCi').hidden = true;
  }
  document.title = C.field.name + ' 상황판';
  $('#authCode').textContent  = C.field.code;
  $('#railCode').textContent  = C.field.code;
  $('#waitCode').textContent  = C.field.code;
  $('#authName').textContent  = C.field.name;
  $('#authOrg').textContent   = C.field.org;
  $('#fieldName').textContent = C.field.name;
  $('#fieldOrg').textContent  = C.field.org + ' · ' + C.field.code;
}

function opts(sel, arr, ph) {
  $(sel).innerHTML = (ph ? `<option value="">${H(ph)}</option>` : '') +
    arr.map(v => `<option value="${H(v)}">${H(v)}</option>`).join('');
}

function scaffold() {
  opts('#eVendor', C.vendors, '선택');
  opts('#eLead',   C.roles.lead,  '선택');
  opts('#eSuper',  C.roles.super, '선택');
  opts('#eHse',    C.roles.hse,   '선택');
  opts('#lPhase',  C.phases, '상태 전체');
  opts('#lZone',   ZONES,  '구역 전체');
  $('#lGrade').innerHTML = '<option value="">등급 전체</option>' +
    C.grades.map(g => `<option value="${g.id}">${H(g.label)}</option>`).join('') +
    '<option value="~none">등급 미지정</option>';

  $('#heatKeys').innerHTML = C.grades.map(g =>
    `<span><i style="background:${g.color}"></i>${H(g.label)}</span>`).join('');

  // 현장 용어 적용 (아파트=동/층, 토목=구간/공종 …)
  $('#heatTitle').textContent  = `${L.zone}·${L.level}별 작업 분포`;
  $('#lZone').options[0].text  = L.zone + ' 전체';

  $('#bDate').value = S.date;
  paintPicks();
}

/* ══════════════════════════════════════════════════════════════════
   2. Firebase — 인증 · 동기화
   경로:  field/{현장코드}/entries      작업 데이터
          field/{현장코드}/members/{uid}  권한 (own | edit | view)
   ════════════════════════════════════════════════════════════════ */
let DB = null;
const P = () => `field/${C.field.code}`;

function connect() {
  if (!C.firebase.databaseURL) return false;
  try {
    firebase.initializeApp(C.firebase);
    DB = firebase.database();
  } catch (e) { return false; }

  firebase.auth().onAuthStateChanged(async u => {
    if (!u) { $('#auth').hidden = false; $('#shell').hidden = true; $('#wait').hidden = true; return; }
    S.user = u; S.rank = null; S.vendor = null;
    try {
      const s = await DB.ref(`${P()}/members/${u.uid}`).get();
      if (s.exists()) {
        const m = readMember(s.val());
        S.rank = m.rank; S.vendor = m.vendor; S.memberName = m.name;
      } else {
        // 최초 설치: 아직 등록된 인원이 없으면 첫 접속자를 관리자로 등록합니다.
        // (보안 규칙이 '인원 목록이 비어 있을 때 한 번만' 허용합니다)
        const all = await DB.ref(`${P()}/members`).get();
        if (!all.exists()) {
          await DB.ref(`${P()}/members/${u.uid}`).set('own');
          S.rank = 'own';
          note('최초 접속자로 확인되어 관리자로 등록했습니다.');
        } else {
          S.rank = null;               // 권한 미부여 → 대기 화면
        }
      }
    } catch (e) { S.rank = null; }
    $('#auth').hidden = true;
    gate();
    lockVendor();
    if (S.rank === 'edit' && $('#lSpan')) $('#lSpan').value = '-1';
    listen();
  });
  return true;
}

/* 권한이 없으면 본체 대신 안내 화면을 띄웁니다 */
function gate() {
  const ok = !!S.rank;
  $('#shell').hidden = !ok;
  $('#wait').hidden  =  ok;
  if (!ok && S.user) {
    $('#waitEmail').textContent = S.user.email || '';
    $('#waitId').textContent    = S.user.uid;
  }
}

function listen() {
  DB.ref(`${P()}/entries`).on('value', snap => {
    const v = snap.val() || {};
    S.entries = Object.keys(v).map(k => Object.assign({ id: k }, v[k]));
    try { localStorage.setItem(CACHE, JSON.stringify(S.entries)); } catch (e) {}
    paintAll();
  }, () => { restore(); note('서버 연결 실패 — 저장본을 표시합니다', true); });

  DB.ref(`${P()}/reviews`).on('value', snap => {
    S.reviews = snap.val() || {};
    paintAll();
  }, () => {});

  DB.ref(`${P()}/members`).on('value', snap => {
    S.members = snap.val() || {};
    const me = S.user && S.members[S.user.uid];
    if (me) {                                  // 내 권한이 바뀌면 즉시 반영
      const m = readMember(me);
      S.rank = m.rank; S.vendor = m.vendor; S.memberName = m.name;
      lockVendor();
    } else if (Object.keys(S.members).length) {
      S.rank = null;                  // 권한이 회수된 경우
    }
    gate(); applyRole(); paintTeam();
  }, () => {});

  DB.ref(`${P()}/fit`).on('value', snap => {
    if (S.fitting) return;                 // 맞추는 중에는 덮어쓰지 않습니다
    S.fit = snap.val() || null;
    try { localStorage.setItem(CACHE + '_fit', JSON.stringify(S.fit)); } catch (e) {}
    paintPins();
  }, () => {});
}

function restore() {
  try {
    const r = localStorage.getItem(CACHE);
    if (r) { S.entries = JSON.parse(r); }
    const q = localStorage.getItem(CACHE + '_fit');
    if (q) { S.fit = JSON.parse(q); }
    paintAll();
  } catch (e) {}
}

const put = (id, data) => DB.ref(`${P()}/entries/${id || rid()}`).set(data);
const drop = id => DB.ref(`${P()}/entries/${id}`).remove();
const putReview = (id, state, note) => DB.ref(`${P()}/reviews/${id}`).set({
  state, note: note || '', at: Date.now(), by: S.user.uid
});
const dropReview = id => DB.ref(`${P()}/reviews/${id}`).remove();
const putFit = f => DB.ref(`${P()}/fit`).set(f);

/* ══════════════════════════════════════════════════════════════════
   3. 경보 엔진  ← 이 시스템의 핵심
   ════════════════════════════════════════════════════════════════ */
function scanAlerts() {
  const day = S.entries.filter(e => e.date === S.date);
  const out = [];

  /* (1) 필수 점검 미확인 */
  day.forEach(e => {
    const miss = C.checks.filter(k => k.must && !(e.checks || {})[k.id]);
    if (miss.length && e.phase !== '완료' && e.phase !== '중지') {
      out.push({ lv: 'crit', tag: '점검 미확인',
        msg: `${where(e)} — ${miss.map(m => m.label).join(', ')}`,
        sub: `${e.task || ''} · ${e.vendor || ''}` });
    }
  });

  /* (2) 동일 위치 시간 중복 (서로 다른 업체가 같은 구역·층에서 겹치는 시간대) */
  for (let i = 0; i < day.length; i++) {
    for (let j = i + 1; j < day.length; j++) {
      const a = day[i], b = day[j];
      if (a.vendor === b.vendor) continue;
      const zs = (a.zones || []).filter(z => (b.zones || []).includes(z));
      const ls = (a.levels || []).filter(l => (b.levels || []).includes(l));
      if (!zs.length || !ls.length) continue;
      const a1 = mins(a.start), a2 = mins(a.end), b1 = mins(b.start), b2 = mins(b.end);
      if (a1 == null || a2 == null || b1 == null || b2 == null) continue;
      if (a1 < b2 && b1 < a2) {
        out.push({ lv: 'crit', tag: '동시작업', zone: zs[0],
          msg: `${zs[0]} ${ls[0]} — ${a.vendor} · ${b.vendor} 시간 중복`,
          sub: `${a.start}~${a.end} / ${b.start}~${b.end}` });
      }
    }
  }

  /* (3) 상하층 동시작업 — 건축 현장 전용. alerts.adjacentLevel 이 true 일 때만 */
  if (C.alerts.adjacentLevel) {
    const li = {}; C.levels.forEach((l, i) => { li[l] = i; });
    for (let i = 0; i < day.length; i++) {
      for (let j = i + 1; j < day.length; j++) {
        const a = day[i], b = day[j];
        const zs = (a.zones || []).filter(z => (b.zones || []).includes(z));
        if (!zs.length) continue;
        let hit = null;
        (a.levels || []).forEach(x => (b.levels || []).forEach(y => {
          if (li[x] != null && li[y] != null && Math.abs(li[x] - li[y]) === 1) hit = [x, y];
        }));
        if (hit && (a.grade === 'A' || b.grade === 'A')) {
          out.push({ lv: 'warn', tag: '상하층 작업', zone: zs[0],
            msg: `${zs[0]} — ${hit[0]} / ${hit[1]} 동시 진행`,
            sub: '낙하물 방호조치 확인 필요' });
        }
      }
    }
  }

  /* (3-A) 중장비 밀집 — 같은 구간에서 장비작업이 동시에 겹침 (협착·충돌) */
  const eq = C.alerts.equipTrades || [];
  if (eq.length) {
    const need = C.alerts.equipConcurrent || 2;
    ZONES.forEach(z => {
      const list = day.filter(e => (e.zones || []).includes(z)
        && eq.includes(e.trade) && e.phase !== '완료' && e.phase !== '중지');
      if (list.length < need) return;
      // 시간대가 실제로 겹치는 조합이 있는지 확인
      let overlap = null;
      for (let i = 0; i < list.length && !overlap; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a1 = mins(list[i].start), a2 = mins(list[i].end);
          const b1 = mins(list[j].start), b2 = mins(list[j].end);
          if (a1 == null || a2 == null || b1 == null || b2 == null) continue;
          if (a1 < b2 && b1 < a2) { overlap = [list[i], list[j]]; break; }
        }
      }
      if (overlap) {
        out.push({ lv: 'crit', tag: '중장비 밀집', zone: z,
          msg: `${z} — ${list.map(e => e.trade).filter((v, i, s) => s.indexOf(v) === i).join(' · ')} 동시 진행 ${list.length}건`,
          sub: '유도자 배치 · 장비 동선 분리 확인' });
      }
    });
  }

  /* (3-B) 굴착 간섭 — 굴착·관부설 작업과 다른 업체 작업이 같은 구간에서 시간 중복 */
  const tr = C.alerts.trenchTrades || [];
  if (tr.length) {
    day.filter(e => tr.includes(e.trade)).forEach(dig => {
      const d1 = mins(dig.start), d2 = mins(dig.end);
      if (d1 == null || d2 == null) return;
      const near = day.filter(e => e !== dig
        && e.vendor !== dig.vendor
        && (e.zones || []).some(z => (dig.zones || []).includes(z))
        && mins(e.start) != null && mins(e.end) != null
        && mins(e.start) < d2 && d1 < mins(e.end));
      if (near.length) {
        out.push({ lv: 'crit', tag: '굴착 간섭', zone: (dig.zones || [])[0],
          msg: `${(dig.zones || []).join('·')} — ${dig.trade} 중 ${near[0].vendor} 작업 중복`,
          sub: '흙막이·접근금지 조치 및 매몰 위험 확인' });
      }
    });
  }

  /* (3-C) 미승인 작업 — 원청 승인 없이 당일 진행 */
  if (C.submission && C.submission.requireApproval !== false) {
    const pend = day.filter(e => reviewState(e) === null && e.phase !== '완료' && e.phase !== '중지');
    const rej  = day.filter(e => reviewState(e) === 'no'  && e.phase !== '완료' && e.phase !== '중지');
    if (rej.length) {
      out.push({ lv: 'crit', tag: '반려 작업 진행', filter: 'no',
        msg: `${rej.map(e => e.vendor).filter((v,i,a)=>a.indexOf(v)===i).join(', ')} — 반려된 작업 ${rej.length}건`,
        sub: '즉시 중지 · 시정 후 재제출 필요' });
    }
    if (pend.length) {
      out.push({ lv: 'warn', tag: '미승인 작업', filter: 'wait',
        msg: `원청 승인 전 작업 ${pend.length}건`,
        sub: pend.map(e => e.vendor).filter((v,i,a)=>a.indexOf(v)===i).join(', ') });
    }
  }

  /* (3-D) 미제출 협력사 — 익일 작업을 아직 안 올린 업체 */
  if (C.submission && C.submission.enabled !== false) {
    const nx = move(S.date, 1);
    const sent = new Set(S.entries.filter(e => e.date === nx).map(e => e.vendor));
    const miss = C.vendors.filter(v => !sent.has(v));
    const di = dueInfo(nx);
    if (miss.length && di) {
      out.push({ lv: di.over ? 'crit' : 'warn', tag: '익일 작업 미제출', go: 'submit',
        msg: `${miss.join(', ')} — ${miss.length}개 업체 미제출`,
        sub: di.over ? `제출기한 ${fmtLeft(di.left)} 초과 (${move(nx,-1)} ${pad(di.hh)}:00)`
                     : `마감까지 ${fmtLeft(di.left)} 남음` });
    }
  }

  /* (4) 단일 위치 과밀 */
  const crowd = {};
  day.forEach(e => (e.zones || []).forEach(z => {
    crowd[z] = (crowd[z] || 0) + (Number(e.crew) || 0);
  }));
  Object.keys(crowd).forEach(z => {
    if (crowd[z] > C.alerts.crowdWorkers) {
      out.push({ lv: 'warn', tag: '인원 과밀', zone: z,
        msg: `${z} — 동시 투입 ${crowd[z]}명`,
        sub: `기준 ${C.alerts.crowdWorkers}명 초과` });
    }
  });

  /* (5) 야간 작업 */
  day.forEach(e => {
    const end = mins(e.end);
    if (end != null && end > C.shift.nightFrom * 60) {
      out.push({ lv: 'warn', tag: '야간 작업', zone: (e.zones || [])[0],
        msg: `${where(e)} — ${e.end} 종료 예정`,
        sub: '조도 확보 및 야간 순찰 대상' });
    }
  });

  /* (6) 기상 */
  const w = S.weather;
  if (w) {
    if (w.feels >= C.alerts.heatIndex) {
      out.push({ lv: 'crit', tag: '폭염',
        msg: `체감온도 ${w.feels.toFixed(0)}° — 옥외작업 주의`,
        sub: '2시간마다 20분 휴식 · 그늘·음용수 확보' });
    }
    if (w.feels <= C.alerts.coldIndex) {
      out.push({ lv: 'crit', tag: '한파',
        msg: `체감온도 ${w.feels.toFixed(0)}° — 옥외작업 주의`,
        sub: '한랭질환 예방 · 온열 휴게공간 확보' });
    }
    if (w.wind >= C.alerts.windSpeed) {
      const lift = day.filter(e => ['양중','구조물','가시설'].includes(e.trade)).length;
      out.push({ lv: lift ? 'crit' : 'warn', tag: '강풍',
        msg: `순간 풍속 ${w.wind.toFixed(1)} m/s`,
        sub: lift ? `양중·고소작업 ${lift}건 — 중단 검토` : '크레인·고소작업 주의' });
    }
  }

  /* 같은 내용의 경보는 한 번만 (여러 작업 조합에서 같은 위험이 중복 검출될 수 있음) */
  const seen = new Set();
  const uniq = out.filter(a => {
    const k = a.tag + '|' + a.msg;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const rank = { crit: 0, warn: 1, info: 2 };
  return uniq.sort((a, b) => rank[a.lv] - rank[b.lv]);
}

const where = e => `${(e.zones || []).join('·') || '-'} ${(e.levels || []).join('·')}`.trim();

/* ══════════════════════════════════════════════════════════════════
   4. 상황판 그리기
   ════════════════════════════════════════════════════════════════ */
const sortRows = a => a.slice().sort((x, y) =>
  (x.start || '').localeCompare(y.start || ''));

function paintAll() {
  paintMetrics(); paintAlerts(); paintHeat();
  paintTimeline(); paintTicker(); paintLog(); paintSite(); paintSubmit();
  paintStat(); paintTeam();
}

const dayList = () => S.entries.filter(e => e.date === S.date);

function paintMetrics() {
  const d = dayList();
  const a = d.filter(e => e.grade === 'A').length;
  const crew = d.reduce((s, e) => s + (Number(e.crew) || 0), 0);
  const zones = new Set(d.flatMap(e => e.zones || [])).size;
  const wait  = d.filter(e => reviewState(e) === null).length;
  const vend  = new Set(d.map(e => e.vendor).filter(Boolean)).size;
  $('#metrics').innerHTML = `
    <div class="mt"><b>${d.length}</b><span>투입 작업</span></div>
    <div class="mt ${a ? 'r' : ''}"><b>${a}</b><span>고위험</span></div>
    <div class="mt ${wait ? 'a' : ''}"><b>${wait}</b><span>미승인</span></div>
    <div class="mt g"><b>${crew}</b><span>투입 인원</span></div>
    <div class="mt"><b>${vend}</b><span>투입 업체</span></div>
    <div class="mt"><b>${zones}</b><span>작업 구역</span></div>`;
}

function paintAlerts() {
  const al = scanAlerts();
  S.alerts = al;
  const p = $('#alertCount');
  p.textContent = al.length;
  p.className = 'pill' + (al.length ? '' : ' zero');
  $('#alerts').innerHTML = al.length
    ? al.map((a, i) => {
        const act = a.zone || a.filter || a.go;
        return `
      <div class="al ${a.lv === 'crit' ? '' : a.lv === 'warn' ? 'w' : 'i'}${act ? ' go' : ''}"
           ${act ? `data-al="${i}"` : ''}>
        <div class="al-t">${H(a.tag)}${act ? '<i>확인 →</i>' : ''}</div>
        <p class="al-m">${H(a.msg)}</p>
        <p class="al-s">${H(a.sub)}</p>
      </div>`; }).join('')
    : `<div class="calm"><b>이상 없음</b>등록된 작업에서 감지된 경보가 없습니다.</div>`;
}


/* ── 현장도 (전경사진 + 획지 폴리곤) ──────────────────────────────
   설계도면에서 뽑은 획지 경계를 전경사진 위에 얹습니다.
   도면(계획)과 사진(현재)은 완전히 겹치지 않으므로, [도면 맞추기] 로
   한 번 눈으로 맞춰 저장하면 그 값이 모든 사람 화면에 적용됩니다.
   ───────────────────────────────────────────────────────────── */
function zoneStat(z) {
  const hit = dayList().filter(e => (e.zones || []).includes(z));
  const g = C.grades.find(x => hit.some(e => e.grade === x.id));
  return { n: hit.length,
           crew: hit.reduce((s, e) => s + (Number(e.crew) || 0), 0),
           color: g ? g.color : null };
}

function zonesSVG() {
  return ZN.map(z => {
    const st = zoneStat(z.name);
    const on = st.n > 0;
    const col = st.color || '#FFFFFF';
    return `<polygon class="zp${on ? ' live' : ''}" data-zone="${H(z.name)}"
        points="${polyStr(z)}"
        style="stroke:${col}; fill:${col}; fill-opacity:${on ? .22 : .05}"></polygon>`;
  }).join('');
}

function zoneTags() {
  return ZN.map(z => {
    const st = zoneStat(z.name);
    const [x, y] = fx(z.at[0], z.at[1]);
    return `<div class="zt${st.n ? ' live' : ''}" data-zone="${H(z.name)}"
        style="left:${(x*100).toFixed(3)}%; top:${(y*100).toFixed(3)}%${st.color ? `; --zc:${st.color}` : ''}">
        <b>${H(z.name)}</b>${st.n ? `<i>${st.n}건 · ${st.crew}명</i>` : ''}</div>`;
  }).join('');
}

function paintKeys() {
  $('#siteKeys').innerHTML =
    C.grades.map(g => `<span><i style="background:${g.color}"></i>${H(g.label)}</span>`).join('') +
    `<span><i style="background:#6E6E70"></i>미지정</span>` +
    `<span class="muted-key">획지 ${ZN.length}</span>`;
}

/* 오버레이만 다시 그립니다 — 사진은 유지되어 확대·스크롤이 안 튑니다 */
function paintPins() {
  const sv = $('#zsvg'), tg = $('#ztags');
  if (!sv || !tg) { paintSite(); return; }
  sv.innerHTML = zonesSVG();
  tg.innerHTML = zoneTags();
  paintKeys(); declutter();
}

function paintSite() {
  const box = $('#siteView'); if (!box) return;
  const img = C.map && C.map.image;
  if (!C.map || C.map.enabled === false || !img) {
    box.innerHTML = '<div class="void">현장도가 설정되지 않았습니다.<br>' +
      'field.config.js 의 map.image 에 전경사진을 넣어주세요.</div>';
    return;
  }
  if ($('#siteImg')) { applyFit(); paintPins(); return; }

  box.innerHTML = `
    <div class="site-canvas${S.sFit ? ' fit' : ''}">
      <img id="siteImg" src="${H(img)}" alt="현장 전경">
      <svg id="zsvg" class="zsvg" viewBox="0 0 100 100" preserveAspectRatio="none">${zonesSVG()}</svg>
      <div class="ztags" id="ztags">${zoneTags()}</div>
      ${C.map.northDeg != null ? `<div class="compass" title="정북">
        <svg viewBox="0 0 40 40" style="transform:rotate(${C.map.northDeg}deg)">
          <polygon points="20,4 26,26 20,21 14,26" fill="#fff"></polygon>
        </svg><b>N</b></div>` : ''}
    </div>`;
  const im = $('#siteImg');
  im.addEventListener('load', applyFit);
  if (im.complete && im.naturalWidth) applyFit();
  im.addEventListener('error', () => {
    box.innerHTML = '<div class="void">현장 사진을 찾을 수 없습니다.<br>' +
      `<code>${H(img)}</code> 파일을 확인해 주세요.</div>`;
  });
  paintKeys();
}

/* 화면에 사진이 꽉 들어오는 폭(px). 배율 1.0 = 이 폭 */
function fitW() {
  const box = $('#siteView'), img = $('#siteImg');
  if (!box || !img) return 0;
  const nw = img.naturalWidth, nh = img.naturalHeight;
  if (!nw || !nh) return box.clientWidth;
  return Math.min(box.clientWidth, box.clientHeight * (nw / nh));
}

/* 지도 칸을 사진 비율에 딱 맞춰 좁힌다 — 좌우 검은 여백 제거.
   높이는 그리드가 정하므로 그 높이에 맞는 폭을 계산해 열 너비로 넣습니다.
   남는 폭은 우측 정보 영역이 가져갑니다. */
function hugMap() {
  const grid = $('.board-grid'), box = $('#siteView'), img = $('#siteImg'), slab = $('.slab-map');
  const root = document.documentElement;
  if (!grid || !box || !img || !slab) return;
  const nw = img.naturalWidth, nh = img.naturalHeight;
  if (window.innerWidth < 1000 || !S.sFit || !nw || !nh) {
    root.style.removeProperty('--mapw'); return;
  }
  const bh = box.clientHeight; if (!bh) return;
  const extra = slab.offsetWidth - box.clientWidth;
  const cs = getComputedStyle(grid);
  const gap = parseFloat(cs.columnGap) || 12;
  const avail = grid.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - gap;
  const want = bh * (nw / nh) + extra;
  const min  = window.innerWidth >= 1500 ? 420 : 330;
  root.style.setProperty('--mapw', Math.round(Math.max(320, Math.min(want, avail - min))) + 'px');
}

function applyFit() {
  const c = $('.site-canvas'), box = $('#siteView'), img = $('#siteImg');
  if (!c || !box || !img) return;
  box.classList.toggle('fit-wrap', S.sFit);
  const fb = $('#sFit'); if (fb) fb.classList.toggle('active', S.sFit);

  hugMap();
  const base = fitW();
  if (!base) { c.style.width = '100%'; return; }
  const z = S.sFit ? 1 : S.sZoom;
  c.style.width = Math.max(60, Math.round(base * z)) + 'px';

  const lab = $('#sZoomReset');
  if (lab) lab.textContent = Math.round(z * 100) + '%';
  declutter();
}

/* 이름표 겹침 정리 — 화면에서 작게 잡히는 획지는 이름표를 숨깁니다.
   (작업이 있는 획지는 아무리 작아도 남깁니다) */
function declutter() {
  const img = $('#siteImg'); if (!img) return;
  const w = img.clientWidth, h = img.clientHeight;
  if (!w) return;

  /* 1단계 — 화면에서 너무 작게 잡히는 획지는 접는다 (작업이 있으면 남김) */
  const tags = $$('#ztags .zt');
  tags.forEach(t => {
    const z = zoneOf(t.dataset.zone); if (!z) return;
    const xs = z.poly.map(q => q[0]), ys = z.poly.map(q => q[1]);
    const pw = (Math.max(...xs) - Math.min(...xs)) * w;
    const ph = (Math.max(...ys) - Math.min(...ys)) * h;
    t.dataset.area = String(pw * ph);
    const small = Math.min(pw, ph) < 30 || pw * ph < 2200;
    t.classList.toggle('hide', small && !t.classList.contains('live'));
  });

  /* 2단계 — 남은 것끼리 실제로 겹치면 우선순위 낮은 쪽을 접는다
     우선순위: 작업 있는 획지 > 넓은 획지 */
  const live = tags.filter(t => !t.classList.contains('hide'));
  live.sort((a, b) => {
    const la = a.classList.contains('live') ? 1 : 0, lb = b.classList.contains('live') ? 1 : 0;
    if (la !== lb) return lb - la;
    return Number(b.dataset.area) - Number(a.dataset.area);
  });
  const kept = [];
  const pad = 3;
  live.forEach(t => {
    const r = t.getBoundingClientRect();
    const hit = kept.some(k =>
      r.left - pad < k.right && k.left - pad < r.right &&
      r.top - pad < k.bottom && k.top - pad < r.bottom);
    if (hit) t.classList.add('hide');
    else kept.push(r);
  });
}

/* 배율 변경 — 맞춤 상태에서 처음 누르면 맞춤 크기(=100%)에서 출발합니다 */
function zoomBy(f) {
  if (S.sFit) { S.sFit = false; S.sZoom = 1; }
  S.sZoom = Math.min(6, Math.max(0.25, S.sZoom * f));
  applyFit();
}

/* ── 통계 ────────────────────────────────────────────────────────
   최근 N일의 추이. 발표·보고용으로 쓸 수 있게 수치를 그대로 보여줍니다.
   ───────────────────────────────────────────────────────────── */
function statDays(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(move(S.date, -i));
  return out;
}

function bars(box, rows, color) {
  const el = $(box); if (!el) return 0;
  const max = Math.max(1, ...rows.map(r => r.v));
  el.innerHTML = rows.map(r => `
    <div class="bar" title="${H(r.k)} · ${r.v}">
      <div class="bar-v">${r.v || ''}</div>
      <div class="bar-b" style="height:${(r.v / max * 100).toFixed(1)}%; background:${r.v ? color : 'var(--line)'}"></div>
      <div class="bar-k">${H(r.k.slice(5))}</div>
    </div>`).join('');
  return max;
}

function rank(box, map, unit) {
  const el = $(box); if (!el) return;
  const rows = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = Math.max(1, ...rows.map(r => r[1]));
  el.innerHTML = rows.length ? rows.map(([k, v]) => `
    <div class="rk">
      <span class="rk-k">${H(k)}</span>
      <span class="rk-bar"><i style="width:${(v / max * 100).toFixed(1)}%"></i></span>
      <b class="rk-v">${v}${unit || ''}</b>
    </div>`).join('') : '<div class="void">자료가 없습니다.</div>';
}

function paintStat() {
  if (!$('#stCrew')) return;
  const n = Number($('#stSpan').value) || 14;
  const days = statDays(n);
  const from = days[0];
  const list = S.entries.filter(e => e.date >= from && e.date <= S.date);

  const byDay = d => list.filter(e => e.date === d);
  const crewRows = days.map(d => ({ k: d, v: byDay(d).reduce((s, e) => s + (Number(e.crew) || 0), 0) }));
  const highRows = days.map(d => ({ k: d, v: byDay(d).filter(e => e.grade === 'A').length }));
  const cMax = bars('#stCrew', crewRows, '#4C8DFF');
  const hMax = bars('#stHigh', highRows, C.grades[0].color);
  $('#stCrewMax').textContent = '최대 ' + cMax + '명';
  $('#stHighMax').textContent = '최대 ' + hMax + '건';

  const totCrew = crewRows.reduce((s, r) => s + r.v, 0);
  const workDays = days.filter(d => byDay(d).length).length;
  const high = list.filter(e => e.grade === 'A').length;
  const ungraded = list.filter(e => !e.grade).length;
  $('#stMetrics').innerHTML = `
    <div class="mt"><b>${list.length}</b><span>작업 건수</span></div>
    <div class="mt"><b>${totCrew.toLocaleString()}</b><span>연인원(명·일)</span></div>
    <div class="mt"><b>${workDays}</b><span>작업일수</span></div>
    <div class="mt ${high ? 'r' : ''}"><b>${high}</b><span>고위험 작업</span></div>
    <div class="mt ${ungraded ? 'a' : ''}"><b>${ungraded}</b><span>등급 미지정</span></div>`;

  const add = (m, k, v) => { if (k) m[k] = (m[k] || 0) + v; };
  const V = {}, L = {}, Z = {};
  list.forEach(e => {
    add(V, e.vendor, Number(e.crew) || 0);
    (e.levels || []).forEach(x => add(L, x, 1));
    (e.zones  || []).forEach(x => add(Z, x, 1));
  });
  rank('#stVendor', V, '명');
  rank('#stLevel',  L, '건');
  rank('#stZone',   Z, '건');

  const A = {};
  const keep = S.date;
  days.slice(-7).forEach(d => { S.date = d; scanAlerts().forEach(a => add(A, a.tag, 1)); });
  S.date = keep;
  rank('#stAlert', A, '회');
}

/* ── 인원 · 협력사 계정 ──────────────────────────────────────────
   원청이 콘솔에 들어가지 않고도 권한·업체를 지정합니다.
   계정 생성만 Firebase Authentication 에서 합니다.
   ───────────────────────────────────────────────────────────── */
const RANKS = [
  { id: 'own',  label: '원청' },
  { id: 'edit', label: '협력사' },
  { id: 'view', label: '열람' }
];

/* 권한에 따라 화면 요소를 켜고 끕니다 */
function applyRole() {
  const own = isOwner();
  const rt = $('#railTeam'); if (rt) rt.hidden = !own;
  const fb = $('#fitBtn');   if (fb) fb.hidden = !own;
  if (!own && S.panel === 'team') show('board');
  const w = mayWrite();
  $$('.rail-btn[data-panel="entry"]').forEach(b => b.hidden = !w);
}

function paintTeam() {
  const t = $('#teamTable'); if (!t) return;
  $('#railTeam').hidden = !isOwner();
  const ids = Object.keys(S.members || {});
  $('#teamHint').textContent =
    `등록 ${ids.length}명 · 협력사 ${C.vendors.length}곳`;
  if (!isOwner()) { t.innerHTML = ''; return; }

  t.innerHTML = `<thead><tr><th>계정</th><th>이름</th><th>권한</th><th>업체</th><th>등록 건수</th><th></th></tr></thead><tbody>` +
    ids.map(uid => {
      const m = readMember(S.members[uid]);
      const cnt = S.entries.filter(e => e.by === uid).length;
      const me = S.user && uid === S.user.uid;
      return `<tr${me ? ' class="me"' : ''}>
        <td class="uid" title="${H(uid)}">${H(uid.slice(0, 10))}…${me ? ' <em>나</em>' : ''}</td>
        <td><input class="tin" data-name="${H(uid)}" value="${H(m.name || '')}" placeholder="이름" maxlength="40"></td>
        <td>${me
          ? `<span class="tag ph">원청</span><span class="rv-by">본인 권한은 바꿀 수 없습니다</span>`
          : `<select class="tin" data-rank="${H(uid)}">${
              RANKS.map(r => `<option value="${r.id}"${m.rank === r.id ? ' selected' : ''}>${r.label}</option>`).join('')
            }</select>`}</td>
        <td><select class="tin" data-vendor="${H(uid)}"${m.rank !== 'edit' ? ' disabled' : ''}>
          <option value="">— 미지정 —</option>${
          C.vendors.map(v => `<option value="${H(v)}"${m.vendor === v ? ' selected' : ''}>${H(v)}</option>`).join('')
        }</select></td>
        <td>${cnt ? cnt + '건' : '—'}</td>
        <td>${me ? '' : `<button class="lnk no" data-drop="${H(uid)}">해제</button>`}</td>
      </tr>`;
    }).join('') + '</tbody>';
}

async function saveMember(uid, patch) {
  const cur = readMember(S.members[uid]);
  const next = { rank: patch.rank ?? cur.rank };
  const vendor = patch.vendor !== undefined ? patch.vendor : cur.vendor;
  const name   = patch.name   !== undefined ? patch.name   : cur.name;
  if (next.rank === 'edit' && vendor) next.vendor = vendor;
  if (name) next.name = name;
  await DB.ref(`${P()}/members/${uid}`).set(next);
}

/* ── 도면 맞추기 ─────────────────────────────────────────────────
   획지 레이어 전체를 끌어서 이동 / 버튼으로 확대·회전 → 저장.
   저장값은 field/{코드}/fit 에 들어가 모두에게 같이 적용됩니다.  */
function paintFitBar() {
  const bar = $('#fitBar'); if (!bar) return;
  bar.hidden = !S.fitting;
  $('#fitBtn').classList.toggle('active', S.fitting);
  if (!S.fitting) return;
  const f = fitv();
  $('#fitInfo').textContent =
    `이동 ${(f.dx*100).toFixed(1)}, ${(f.dy*100).toFixed(1)} · 크기 ${(f.k*100).toFixed(1)}% · 회전 ${f.r.toFixed(1)}°`;
  $('.site-canvas')?.classList.toggle('fitting', S.fitting);
}

function nudge(o) {
  const f = fitv();
  S.fit = { dx: f.dx + (o.dx||0), dy: f.dy + (o.dy||0),
            k:  Math.max(.3, Math.min(3, f.k * (o.k || 1))),
            r:  f.r + (o.r||0) };
  paintPins(); paintFitBar();
}

function openZone(z) {
  const list = sortRows(dayList().filter(e => (e.zones || []).includes(z)));
  $('#siteDetailTitle').textContent = `${z} — ${S.date}`;
  $('#siteDetailBody').innerHTML = list.length
    ? `<table class="log mini"><tbody>` + list.map(e => {
        const g = gradeOf(e.grade);
        return `<tr>
          <td>${isOwner()
          ? `<div class="rv-grade">` + C.grades.map(x =>
              `<button data-gr="${e.id}" data-gv="${x.id}" class="${e.grade===x.id?'on':''}"
                 style="${e.grade===x.id?`background:${x.color}`:''}">${H(x.label)}</button>`).join('') + `</div>`
          : `<span class="tag" style="background:${g.color}">${H(g.label)}</span>`}</td>
          <td>${H(e.start || '')}~${H(e.end || '')}</td>
          <td>${H((e.levels || []).join(', '))}</td>
          <td class="w">${H(e.task || '')}</td>
          <td>${H(e.vendor || '')}</td>
          <td>${H(String(e.crew || 0))}명</td>
        </tr>`;
      }).join('') + '</tbody></table>'
    : '<div class="void">이 구역에 등록된 작업이 없습니다.</div>';
  $('#siteDetail').hidden = false;
}

function paintHeat() {
  const d = dayList();
  /* 구역이 18개라 전부 깔면 읽히지 않습니다. 그날 작업이 있는 구역만 세웁니다. */
  const live = ZONES.filter(z => d.some(e => (e.zones || []).includes(z)));
  const cols = live.length ? live : ZONES.slice(0, 6);
  const lv   = C.levels.filter(l => d.some(e => (e.levels || []).includes(l)));
  const rowsL = lv.length ? lv : C.levels;
  const head = '<tr><th class="lv"></th>' +
    cols.map(z => `<th>${H(z)}</th>`).join('') + '</tr>';
  const rows = rowsL.map(l => {
    const tds = cols.map(z => {
      const hit = d.filter(e => (e.zones || []).includes(z) && (e.levels || []).includes(l));
      if (!hit.length) return '<td><div class="cell">·</div></td>';
      const g = C.grades.find(x => hit.some(e => e.grade === x.id));
      const col = g ? g.color : '#6E6E70';
      return `<td><div class="cell has" style="background:${col}"
                   title="${H(z + ' ' + l)} · ${hit.length}건">${hit.length}</div></td>`;
    }).join('');
    return `<tr><th class="lv">${H(l)}</th>${tds}</tr>`;
  }).join('');
  $('#heat').innerHTML = head + rows;
}

function paintTimeline() {
  const d = dayList();
  const from = C.shift.start, to = C.shift.end;
  const buckets = [];
  const zoneCap = C.alerts.crowdWorkers || Infinity;
  for (let h = from; h <= to; h++) {
    const on = d.filter(e => {
      const s = mins(e.start), t = mins(e.end);
      return s != null && t != null && s < (h + 1) * 60 && t > h * 60;
    });
    const n = on.reduce((s, e) => s + (Number(e.crew) || 0), 0);
    // 빨강은 위험 표시 전용입니다.
    //  · 그 시간대에 고위험(A) 작업이 걸려 있거나
    //  · 한 구역에 기준 인원을 넘겨 몰려 있을 때만 강조합니다.
    const perZone = {};
    on.forEach(e => (e.zones || []).forEach(z => { perZone[z] = (perZone[z] || 0) + (Number(e.crew) || 0); }));
    const crowd = Object.values(perZone).some(v => v >= zoneCap);
    const high  = on.some(e => e.grade === 'A');
    buckets.push({ h, n, hot: crowd || high, why: crowd ? '구역 과밀' : high ? '고위험 작업' : '' });
  }
  const max = Math.max(1, ...buckets.map(b => b.n));
  $('#timeline').innerHTML = buckets.map(b => `
    <div class="tlc"${b.why ? ` title="${pad(b.h)}시 — ${b.why}"` : ''}>
      <div class="tlv">${b.n || ''}</div>
      <div class="tlb${b.hot ? ' hot' : ''}" style="height:${(b.n / max * 74).toFixed(0)}px"></div>
      <div class="tll">${pad(b.h)}</div>
    </div>`).join('');
}

function paintTicker() {
  const d = dayList().filter(e => e.phase === '작업중');
  const t = $('#ticker');
  if (!d.length) { t.innerHTML = '<b>진행중인 작업 없음</b>'; return; }
  t.innerHTML = d.map(e => {
    const g = gradeOf(e.grade);
    const hot = e.grade === 'A' ? `<em>[${g.label}]</em>` : `<b>[${g.label}]</b>`;
    return `${hot} ${H(where(e))} · ${H(e.task || '')} · ${H(e.vendor || '')} ${H(String(e.crew || 0))}명`;
  }).join('　　◆　　');
}

/* 시계 */
function tick() {
  const d = new Date();
  $('#clock').textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const wd = ['일','월','화','수','목','금','토'][d.getDay()];
  $('#cdate').textContent = `${d.getFullYear()}. ${pad(d.getMonth()+1)}. ${pad(d.getDate())} (${wd})`;
}

/* ══════════════════════════════════════════════════════════════════
   5. 기상 (Open-Meteo + 기상청 체감온도)
   ════════════════════════════════════════════════════════════════ */
function feels(T, RH, W) {
  if (T >= 25) {
    const Tw = T * Math.atan(0.151977 * Math.sqrt(RH + 8.313659))
             + Math.atan(T + RH) - Math.atan(RH - 1.67633)
             + 0.00391838 * Math.pow(RH, 1.5) * Math.atan(0.023101 * RH) - 4.686035;
    return -0.2442 + 0.55399 * Tw + 0.45535 * T - 0.0022 * Tw * Tw + 0.00278 * Tw * T + 3.0;
  }
  if (T <= 10 && W >= 1.3) {
    const v = Math.pow(W * 3.6, 0.16);
    return 13.12 + 0.6215 * T - 11.37 * v + 0.3965 * v * T;
  }
  return T;
}

async function weather() {
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${C.geo.lat}&longitude=${C.geo.lon}`
            + `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code`
            + `&timezone=Asia%2FSeoul&wind_speed_unit=ms`;
    const j = await (await fetch(u)).json();
    const c = j.current;
    S.weather = {
      temp: c.temperature_2m, hum: c.relative_humidity_2m, wind: c.wind_speed_10m,
      feels: feels(c.temperature_2m, c.relative_humidity_2m, c.wind_speed_10m),
      code: c.weather_code
    };
    $('#envTemp').textContent = `${S.weather.temp.toFixed(0)}°`;
    $('#envDesc').textContent =
      `체감 ${S.weather.feels.toFixed(0)}° · 습도 ${S.weather.hum}% · 풍속 ${S.weather.wind.toFixed(1)}m/s`;
    paintAlerts();
  } catch (e) { $('#envDesc').textContent = '기상정보 수신 불가'; }
}

/* ══════════════════════════════════════════════════════════════════
   6. 입력 위저드
   ════════════════════════════════════════════════════════════════ */
/* ── 제출 마감 ───────────────────────────────────────────────────
   협력사는 전날 dueHour 까지 익일 작업을 올립니다.
   ───────────────────────────────────────────────────────────── */
function dueInfo(workDate) {
  const sub = C.submission || {};
  if (sub.enabled === false) return null;
  const hh = sub.dueHour ?? 17;
  const due = new Date(move(workDate, -1) + 'T00:00:00');
  due.setHours(hh, 0, 0, 0);
  return { due, left: due - new Date(), hh, over: (due - new Date()) < 0 };
}

function fmtLeft(ms) {
  const m = Math.floor(Math.abs(ms) / 60000);
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  if (d) return `${d}일 ${h}시간`;
  if (h) return `${h}시간 ${mm}분`;
  return `${mm}분`;
}

function paintDue() {
  const bar = $('#dueBar'); if (!bar) return;
  const wd = $('#eDate').value || move(today(), 1);
  const i = dueInfo(wd);
  if (!i) { bar.textContent = ''; return; }
  bar.className = 'due' + (i.over ? ' over' : (i.left < 3 * 3600e3 ? ' soon' : ''));
  bar.innerHTML = i.over
    ? `<b>${H(wd)}</b> 작업분 제출기한 <b>지남</b> — ${fmtLeft(i.left)} 초과 (${move(wd,-1)} ${pad(i.hh)}:00)`
    : `<b>${H(wd)}</b> 작업분 · 제출기한까지 <b>${fmtLeft(i.left)}</b> 남음 (${move(wd,-1)} ${pad(i.hh)}:00)`;
}

/* 제출 체계에서는 '익일 작업'을 올리는 게 기본입니다 */
function defaultWorkDate() {
  const sub = C.submission || {};
  if (sub.enabled === false) return S.date;
  return move(today(), 1);
}

/* 전일(또는 가장 최근) 등록분을 그대로 불러옵니다 */
function prevWorkDate() {
  const mine = S.entries.filter(e => !S.vendor || e.vendor === S.vendor);
  const target = $('#eDate').value || move(today(), 1);
  const before = [...new Set(mine.map(e => e.date))].filter(d => d < target).sort();
  return before.length ? before[before.length - 1] : null;
}

async function copyPrev() {
  if (!mayWrite()) { note('작성 권한이 없습니다.', true); return; }
  const src = prevWorkDate();
  if (!src) { note('불러올 이전 작업이 없습니다.', true); return; }
  const list = S.entries.filter(e => e.date === src && (!S.vendor || e.vendor === S.vendor));
  if (!confirm(`${src} 등록분 ${list.length}건을 입력창으로 불러옵니다.\n\n지금 작성 중인 내용은 지워집니다.`)) return;
  S.editId = null;
  S.jobs = list.map(e => {
    const lab = unpackList(e.labor);
    return {
      zone: (e.zones || [])[0] || '', level: (e.levels || [])[0] || '',
      trade: e.trade || '', start: e.start || '08:00', end: e.end || '17:00',
      task: e.task || '', phase: C.phases[0],
      labor: lab.length ? lab : [{ t: '직영', n: Number(e.crew) || '' }],
      equip: unpackList(e.equip)
    };
  });
  if (!S.jobs.length) S.jobs = [blankJob()];
  paintJobs();
  note(`${S.jobs.length}건을 불러왔습니다. 내용을 확인하고 등록하세요.`);
}

/* ── 작업투입 미니 지도 ──────────────────────────────────────── */
function paintMini() {
  const box = $('#miniMap'); if (!box || box.hidden) return;
  const img = (C.map && C.map.image) || '';
  box.innerHTML = `
    <div class="mini-canvas">
      <img src="${H(img)}" alt="현장도">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">${
        ZN.map(z => {
          const on = S.jobs.some(j => j.zone === z.name);
          return `<polygon class="mp${on ? ' on' : ''}" data-mz="${H(z.name)}" points="${polyStr(z)}"></polygon>`;
        }).join('')}</svg>
      <div class="mini-tags">${
        ZN.map(z => {
          const on = S.jobs.some(j => j.zone === z.name);
          const [x, y] = fx(z.at[0], z.at[1]);
          return `<span class="mt-t${on ? ' on' : ''}" data-mz="${H(z.name)}"
            style="left:${(x*100).toFixed(2)}%; top:${(y*100).toFixed(2)}%">${H(z.name)}</span>`;
        }).join('')}</div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════════
   작업투입 — 여러 작업을 줄 단위로 입력해 한 번에 등록합니다.
   한 줄 = 한 건. 구역·공종·작업내용·인원·장비를 각각 적습니다.
   ════════════════════════════════════════════════════════════════ */
const LABOR = () => C.labor || [];
const EQUIP = () => C.equip || [];

/* 인원·장비는 "직영:2,보통인부:8" 형태의 문자열로 저장합니다.
   (보안규칙이 객체를 허용하지 않아 문자열로 두고, 읽을 때 풀어 씁니다) */
function packList(rows) {
  return rows.filter(r => r.t && Number(r.n) > 0)
             .map(r => `${r.t}:${Number(r.n)}`).join(',');
}
function unpackList(str) {
  return String(str || '').split(',').filter(Boolean).map(x => {
    const i = x.lastIndexOf(':');
    return { t: x.slice(0, i), n: Number(x.slice(i + 1)) || 0 };
  });
}
const sumList = rows => rows.reduce((s, r) => s + (Number(r.n) || 0), 0);
const showList = str => unpackList(str).map(r => `${r.t} ${r.n}`).join(' · ');

function blankJob() {
  return { zone: '', level: '', trade: '', start: '08:00', end: '17:00',
           task: '', phase: C.phases[0], labor: [{ t: '', n: '' }], equip: [] };
}

function jobRowHTML(j, i) {
  const opt = (arr, v, ph) => `<option value="">${ph}</option>` +
    arr.map(x => `<option value="${H(x)}"${x === v ? ' selected' : ''}>${H(x)}</option>`).join('');
  const line = (kind, r, k) => `
    <div class="ln" data-i="${i}" data-kind="${kind}" data-k="${k}">
      <select data-f="t">${opt(kind === 'labor' ? LABOR() : EQUIP(), r.t, kind === 'labor' ? '직종' : '장비')}</select>
      <input type="number" data-f="n" min="0" max="999" value="${r.n === '' ? '' : H(String(r.n))}"
             placeholder="0"><em>${kind === 'labor' ? '명' : '대'}</em>
      <button type="button" class="x" data-del="${kind}">×</button>
    </div>`;
  return `
  <div class="job" data-i="${i}">
    <div class="job-hd">
      <b>작업 ${i + 1}</b>
      <span class="job-tag">${H(j.zone || '구역 미선택')}${j.level ? ' · ' + H(j.level) : ''}</span>
      ${S.jobs.length > 1 ? `<button type="button" class="lnk no" data-jdel="${i}">삭제</button>` : ''}
    </div>
    <div class="job-grid">
      <label class="f"><span>${H(L.zone)}</span>
        <select data-i="${i}" data-f="zone">${opt(ZONES, j.zone, '선택')}</select></label>
      <label class="f"><span>${H(L.level)}</span>
        <select data-i="${i}" data-f="level">${opt(C.levels, j.level, '선택')}</select></label>
      <label class="f"><span>작업유형</span>
        <select data-i="${i}" data-f="trade">${opt(C.trades, j.trade, '선택')}</select></label>
      <label class="f"><span>시작</span>
        <input type="time" data-i="${i}" data-f="start" value="${H(j.start)}"></label>
      <label class="f"><span>종료</span>
        <input type="time" data-i="${i}" data-f="end" value="${H(j.end)}"></label>
      <label class="f"><span>상태</span>
        <select data-i="${i}" data-f="phase">${
          C.phases.map(x => `<option value="${H(x)}"${x === j.phase ? ' selected' : ''}>${H(x)}</option>`).join('')
        }</select></label>
    </div>
    <label class="f"><span>작업내용</span>
      <textarea data-i="${i}" data-f="task" rows="2"
        placeholder="예) 북측 절토부 터파기 및 반출">${H(j.task)}</textarea></label>
    <div class="job-res">
      <div class="res">
        <div class="res-hd">인원 <b>${sumList(j.labor)}명</b>
          <button type="button" class="lnk" data-add="labor" data-i="${i}">＋ 직종</button></div>
        ${j.labor.map((r, k) => line('labor', r, k)).join('') || '<p class="res-none">직종을 추가하세요</p>'}
      </div>
      <div class="res">
        <div class="res-hd">장비 <b>${sumList(j.equip)}대</b>
          <button type="button" class="lnk" data-add="equip" data-i="${i}">＋ 장비</button></div>
        ${j.equip.map((r, k) => line('equip', r, k)).join('') || '<p class="res-none">없으면 비워두세요</p>'}
      </div>
    </div>
  </div>`;
}

function paintJobs() {
  const box = $('#jobs'); if (!box) return;
  if (!S.jobs.length) S.jobs = [blankJob()];
  box.innerHTML = S.jobs.map(jobRowHTML).join('');
  const crew = S.jobs.reduce((s, j) => s + sumList(j.labor), 0);
  const eq   = S.jobs.reduce((s, j) => s + sumList(j.equip), 0);
  $('#jobSum').innerHTML =
    `<b>${S.jobs.length}</b>개 작업 · 인원 <b>${crew}</b>명 · 장비 <b>${eq}</b>대`;
  $('#jobSubmit').textContent = S.editId ? '수정 저장' : '등록';
  $('#jobCancel').hidden = !S.editId;
  $('#jobAdd').hidden = !!S.editId;
  paintMini();
}

/* 화면 값 → S.jobs 반영 */
function readJob(el) {
  const i = Number(el.dataset.i), f = el.dataset.f;
  if (Number.isNaN(i) || !f || !S.jobs[i]) return;
  S.jobs[i][f] = el.value;
}

function jobValid() {
  for (let i = 0; i < S.jobs.length; i++) {
    const j = S.jobs[i], n = i + 1;
    if (!j.zone)  return `작업 ${n}: ${L.zone}을 선택하세요.`;
    if (!j.level) return `작업 ${n}: ${L.level}을 선택하세요.`;
    if (!j.trade) return `작업 ${n}: 작업유형을 선택하세요.`;
    if (!j.task.trim()) return `작업 ${n}: 작업내용을 입력하세요.`;
    if (!j.start || !j.end) return `작업 ${n}: 시간을 입력하세요.`;
    if (mins(j.end) <= mins(j.start)) return `작업 ${n}: 종료가 시작보다 빠릅니다.`;
    if (sumList(j.labor) === 0) return `작업 ${n}: 인원을 입력하세요.`;
  }
  if (!$('#eDate').value) return '작업일을 선택하세요.';
  if (!$('#eVendor').value) return '업체를 선택하세요.';
  return null;
}

function jobToEntry(j) {
  return {
    date:  $('#eDate').value,
    start: j.start, end: j.end,
    zones: [j.zone], levels: [j.level],
    task:  j.task.trim(),
    trade: j.trade,
    vendor: (S.rank === 'edit' && S.vendor) ? S.vendor : $('#eVendor').value,
    crew:  sumList(j.labor),
    labor: packList(j.labor),
    equip: packList(j.equip),
    phase: j.phase || C.phases[0],
    grade: S.editId ? (S.pick.grade || '') : '',
    lead:  $('#eLead').value,
    super: $('#eSuper').value,
    hse:   $('#eHse').value,
    by: S.user.uid,
    at: Date.now()
  };
}

function lockVendor() {
  const sel = $('#eVendor'); if (!sel) return;
  if (S.rank === 'edit' && S.vendor) {
    sel.innerHTML = `<option value="${H(S.vendor)}">${H(S.vendor)}</option>`;
    sel.value = S.vendor; sel.disabled = true;
    sel.title = '계정에 지정된 업체로 고정됩니다';
  } else { sel.disabled = false; }
}

function paintPicks() { paintMini(); }
function paintGrade() {}

function clearWiz() {
  S.editId = null;
  S.pick = { zones: [], levels: [], grade: null };
  S.jobs = [blankJob()];
  $('#eDate').value = defaultWorkDate();
  ['#eLead', '#eSuper', '#eHse'].forEach(x => { const e = $(x); if (e) e.value = ''; });
  lockVendor(); paintDue(); paintJobs();
}

function loadWiz(e) {
  S.editId = e.id;
  S.pick = { zones: (e.zones || []).slice(), levels: (e.levels || []).slice(), grade: e.grade || null };
  const lab = unpackList(e.labor);
  S.jobs = [{
    zone: (e.zones || [])[0] || '', level: (e.levels || [])[0] || '',
    trade: e.trade || '', start: e.start || '08:00', end: e.end || '17:00',
    task: e.task || '', phase: e.phase || C.phases[0],
    labor: lab.length ? lab : [{ t: '직영', n: Number(e.crew) || '' }],
    equip: unpackList(e.equip)
  }];
  $('#eDate').value = e.date;
  $('#eVendor').value = e.vendor || '';
  $('#eLead').value = e.lead || ''; $('#eSuper').value = e.super || ''; $('#eHse').value = e.hse || '';
  lockVendor(); paintDue(); paintJobs();
  show('entry');
  $('#panel-entry').scrollTop = 0;
}

async function submitJobs() {
  if (!mayWrite()) { note('작성 권한이 없습니다.', true); return; }
  const bad = jobValid();
  if (bad) { note(bad, true); return; }
  if (S.rank === 'edit' && S.vendor && $('#eVendor').value !== S.vendor) {
    note('계정에 지정된 업체로만 등록할 수 있습니다.', true); return;
  }
  const btn = $('#jobSubmit'); btn.disabled = true; btn.textContent = '저장 중…';
  try {
    if (S.editId) {
      const old = S.entries.find(x => x.id === S.editId);
      const d = jobToEntry(S.jobs[0]);
      d.by = old?.by || S.user.uid; d.at = old?.at || Date.now();
      await put(S.editId, d);
      if (S.reviews[S.editId]) { try { await dropReview(S.editId); } catch (e) {} }
      note('수정되었습니다. 재검토 대기 상태가 됩니다.');
    } else {
      for (const j of S.jobs) await put(null, jobToEntry(j));
      note(`${S.jobs.length}건 등록 완료`);
    }
    const date = $('#eDate').value;
    clearWiz();
    if (date > today()) { $('#lSpan').value = '-1'; paintLog(); show('log'); }
    else { setDate(date); show('board'); }
  } catch (e) {
    note('저장 실패 — 권한을 확인하세요.', true);
  } finally { btn.disabled = false; paintJobs(); }
}

function logRows() {
  const span = Number($('#lSpan').value);
  const g = $('#lGrade').value, p = $('#lPhase').value, z = $('#lZone').value;
  const q = $('#lText').value.trim().toLowerCase();
  const next = span === -1;
  const from = next ? move(S.date, 1) : (span ? move(S.date, -(span - 1)) : null);
  const to   = next ? move(S.date, 1) : S.date;

  return S.entries.filter(e => {
    if (from && (e.date < from || e.date > to)) return false;
    if (S.rvFilter === 'no'   && reviewState(e) !== 'no')   return false;
    if (S.rvFilter === 'wait' && reviewState(e) !== null)   return false;
    if (g === '~none') { if (e.grade) return false; }
    else if (g && e.grade !== g) return false;
    if (p && e.phase !== p) return false;
    if (z && !(e.zones || []).includes(z)) return false;
    if (q && ![e.task, e.vendor, e.trade, e.lead, e.super, e.hse]
              .join(' ').toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => (b.date || '').localeCompare(a.date || '')
                 || (a.start || '').localeCompare(b.start || ''));
}


/* ══════════════════════════════════════════════════════════════════
   제출현황 — 원청이 협력사 제출 여부를 한눈에 보는 화면
   ════════════════════════════════════════════════════════════════ */
function subDate() { return $('#sDate').value || move(today(), 1); }

function vendorRows(d) {
  const day = S.entries.filter(e => e.date === d);
  return C.vendors.map(v => {
    const list = day.filter(e => e.vendor === v);
    const ok   = list.filter(e => reviewState(e) === 'ok').length;
    const no   = list.filter(e => reviewState(e) === 'no').length;
    const wait = list.filter(e => reviewState(e) === null).length;
    const crew = list.reduce((s, e) => s + (Number(e.crew) || 0), 0);
    const high = list.filter(e => e.grade === 'A').length;
    let state = 'none';
    if (list.length) state = no ? 'part' : (wait ? 'wait' : 'ok');
    return { vendor: v, list, ok, no, wait, crew, high, state };
  });
}

const STATE_TXT = { none:'미제출', wait:'검토 대기', ok:'승인 완료', part:'반려 포함' };

function paintSubmit() {
  if (!$('#subTable')) return;
  const d = subDate();
  const rows = vendorRows(d);
  const 제출 = rows.filter(r => r.list.length).length;
  const 미제출 = rows.length - 제출;
  const 대기 = rows.reduce((s,r)=>s+r.wait,0);
  const 반려 = rows.reduce((s,r)=>s+r.no,0);

  const wd = ['일','월','화','수','목','금','토'][new Date(d+'T00:00:00').getDay()];
  const due = move(d, -1);
  $('#subHint').textContent =
    `${d} (${wd}) 작업분 · 제출기한 ${due} ${pad(C.submission?.dueHour ?? 17)}:00`;

  $('#subMetrics').innerHTML = `
    <div class="mt g"><b>${제출}</b><span>제출 업체</span></div>
    <div class="mt r"><b>${미제출}</b><span>미제출 업체</span></div>
    <div class="mt a"><b>${대기}</b><span>검토 대기</span></div>
    <div class="mt r"><b>${반려}</b><span>반려</span></div>`;

  $('#subTable').innerHTML =
    `<thead><tr><th>협력사</th><th>상태</th><th>작업</th><th>고위험</th><th>인원</th><th></th></tr></thead><tbody>` +
    rows.map(r => `
      <tr>
        <td class="vend">${H(r.vendor)}</td>
        <td><span class="state ${r.state}">${STATE_TXT[r.state]}</span></td>
        <td>${r.list.length ? r.list.length + '건' : '—'}</td>
        <td>${r.high ? `<span class="tag" style="background:${C.grades[0].color}">${r.high}</span>` : '—'}</td>
        <td>${r.crew ? r.crew + '명' : '—'}</td>
        <td>${r.list.length ? `<button class="lnk" data-vend="${H(r.vendor)}">상세</button>` : ''}</td>
      </tr>`).join('') + '</tbody>';

  if (S.subVendor) openVendor(S.subVendor);
}

function openVendor(v) {
  S.subVendor = v;
  const d = subDate();
  const list = S.entries.filter(e => e.date === d && e.vendor === v)
    .sort((a,b) => (a.start||'').localeCompare(b.start||''));
  $('#subDetail').innerHTML = `
    <div class="slab-hd">
      <h2>${H(v)} — ${H(d)}</h2>
      <button class="lnk" id="subClose">닫기</button>
    </div>
    <table class="log"><tbody>` +
    list.map(e => {
      const g = gradeOf(e.grade);
      const st = reviewState(e);
      const r = reviewOf(e.id);
      const tag = st === 'ok' ? '<span class="tag rv-ok">승인</span>'
                : st === 'no' ? '<span class="tag rv-no">반려</span>'
                : '<span class="tag rv-wait">대기</span>';
      return `<tr>
        <td>${isOwner()
          ? `<div class="rv-grade">` + C.grades.map(x =>
              `<button data-gr="${e.id}" data-gv="${x.id}" class="${e.grade===x.id?'on':''}"
                 style="${e.grade===x.id?`background:${x.color}`:''}">${H(x.label)}</button>`).join('') + `</div>`
          : `<span class="tag" style="background:${g.color}">${H(g.label)}</span>`}</td>
        <td>${H(e.start||'')}~${H(e.end||'')}</td>
        <td>${H((e.zones||[]).join(', '))}</td>
        <td>${H((e.levels||[]).join(', '))}</td>
        <td class="w">${H(e.task||'')}${r && r.note ? `<span class="rv-note">반려 사유: ${H(r.note)}</span>` : ''}</td>
        <td>${H(String(e.crew||0))}명</td>
        <td>${tag}</td>
        ${isOwner() ? `<td><div class="rv">
          <button class="lnk ok" data-ok="${e.id}">승인</button>
          <button class="lnk no" data-no="${e.id}">반려</button>
        </div></td>` : ''}
      </tr>`;
    }).join('') + '</tbody></table>';
  $('#subClose').addEventListener('click', () => { S.subVendor = null; $('#subDetail').innerHTML = ''; });
}

function paintLog() {
  const rows = logRows();
  const t = $('#logTable');
  if (!rows.length) {
    t.innerHTML = '';
    $('#logFoot').innerHTML = '<div class="void">해당 조건의 기록이 없습니다.</div>';
    return;
  }
  t.innerHTML =
    `<thead><tr>
       <th>일자</th><th>시간</th><th>등급</th><th>상태</th><th>${H(L.zone)}</th><th>${H(L.level)}</th>
       <th>작업내용</th><th>작업유형</th><th>업체</th><th>인원</th>${(C.checks||[]).length ? '<th>점검</th>' : ''}<th>결재</th><th>안전관리자</th>
       ${mayWrite() ? '<th></th>' : ''}
     </tr></thead><tbody>` +
    rows.map(e => {
      const g = gradeOf(e.grade);
      const done = (C.checks || []).filter(k => (e.checks || {})[k.id]).length;
      const bad  = (C.checks || []).some(k => k.must && !(e.checks || {})[k.id]);
      const canEdit = S.rank === 'own' || e.by === S.user.uid;
      return `<tr>
        <td>${H(e.date)}</td>
        <td>${H(e.start || '')}~${H(e.end || '')}</td>
        <td>${isOwner()
          ? `<div class="rv-grade">` + C.grades.map(x =>
              `<button data-gr="${e.id}" data-gv="${x.id}" class="${e.grade===x.id?'on':''}"
                 style="${e.grade===x.id?`background:${x.color}`:''}">${H(x.label)}</button>`).join('') + `</div>`
          : `<span class="tag" style="background:${g.color}">${H(g.label)}</span>`}</td>
        <td>${mayWrite() && canEdit
          ? `<select class="ph-sel" data-ph="${e.id}">${
              C.phases.map(x => `<option value="${H(x)}"${e.phase===x?' selected':''}>${H(x)}</option>`).join('')
            }</select>`
          : `<span class="tag ph">${H(e.phase || '')}</span>`}</td>
        <td>${H((e.zones || []).join(', '))}</td>
        <td>${H((e.levels || []).join(', '))}</td>
        <td class="w">${H(e.task || '')}</td>
        <td>${H(e.trade || '')}</td>
        <td>${H(e.vendor || '')}</td>
        <td>${H(String(e.crew || 0))}
          ${e.labor ? `<span class="res-txt">${H(showList(e.labor))}</span>` : ''}
          ${e.equip ? `<span class="res-txt">🚜 ${H(showList(e.equip))}</span>` : ''}</td>
        ${(C.checks||[]).length ? `<td class="${bad ? 'miss' : 'okc'}">${done}/${C.checks.length}${bad ? ' !' : ''}</td>` : ''}
        <td>${(() => { const st = reviewState(e); const r = reviewOf(e.id);
          const who = r ? `<span class="rv-by">${H(memberName(r.by))} · ${H(stamp(r.at))}</span>` : '';
          return st === 'ok' ? `<span class="tag rv-ok">승인</span>${who}`
               : st === 'no' ? `<span class="tag rv-no">반려</span>${who}${r && r.note ? `<span class="rv-note">${H(r.note)}</span>` : ''}`
               : '<span class="tag rv-wait">대기</span>'; })()}</td>
        <td>${H(e.hse || '')}</td>
        ${mayWrite() ? `<td>
           <button class="lnk" data-ed="${e.id}">수정</button>
           ${canEdit ? `<button class="lnk" data-rm="${e.id}">삭제</button>` : ''}
        </td>` : ''}
      </tr>`;
    }).join('') + '</tbody>';

  const crew = rows.reduce((s, e) => s + (Number(e.crew) || 0), 0);
  const a = rows.filter(e => e.grade === 'A').length;
  $('#logFoot').textContent = `총 ${rows.length}건 · 고위험 ${a}건 · 연인원 ${crew}명`;
}

/* ══════════════════════════════════════════════════════════════════
   8. 엑셀
   ════════════════════════════════════════════════════════════════ */
async function excel() {
  const rows = logRows();
  if (!rows.length) { note('내보낼 기록이 없습니다.', true); return; }
  if (typeof ExcelJS === 'undefined') { note('엑셀 모듈을 불러오지 못했습니다.', true); return; }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('작업투입');
  const head = ['일자','시작','종료','등급','상태', L.zone, L.level, '작업내용','작업유형','업체','인원',
                '작업지휘자','관리감독자','안전관리자','결재','반려사유'];
  (C.checks || []).forEach(k => head.push(k.label));

  ws.addRow([`${C.field.name} · 작업투입 기록  (${C.field.code})`]);
  ws.mergeCells(1, 1, 1, head.length);
  Object.assign(ws.getCell('A1'), {
    font: { bold: true, size: 14, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + C.field.brand.base.slice(1) } },
    alignment: { horizontal: 'center', vertical: 'middle' }
  });
  ws.getRow(1).height = 26;
  ws.addRow([`출력일 ${today()} · 총 ${rows.length}건`]);
  ws.addRow([]);

  const hr = ws.addRow(head);
  hr.eachCell(c => {
    c.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid',
               fgColor: { argb: 'FF' + C.field.brand.red.slice(1) } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  ws.getRow(4).height = 30;

  rows.forEach(e => {
    const st = reviewState(e), rv = reviewOf(e.id);
    const line = [e.date, e.start, e.end, gradeOf(e.grade).label, e.phase,
      (e.zones || []).join(','), (e.levels || []).join(','), e.task, e.trade, e.vendor,
      e.crew, e.lead, e.super, e.hse,
      st === 'ok' ? '승인' : st === 'no' ? '반려' : '대기',
      rv && rv.note ? rv.note : ''];
    (C.checks || []).forEach(k => line.push((e.checks || {})[k.id] ? 'O' : 'X'));
    const r = ws.addRow(line);
    if (e.grade === 'A') r.getCell(4).font = { bold: true, color: { argb: 'FFF01428' } };
    if (st === 'no')    r.getCell(15).font = { bold: true, color: { argb: 'FFF01428' } };
    (C.checks || []).forEach((k, i) => {
      if (k.must && !(e.checks || {})[k.id]) {
        r.getCell(17 + i).font = { bold: true, color: { argb: 'FFF01428' } };
      }
    });
  });

  ws.columns.forEach((c, i) => { c.width = i === 7 ? 40 : i === 15 ? 26 : (i < 3 ? 11 : 12); });
  ws.views = [{ state: 'frozen', ySplit: 4 }];
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: head.length } };

  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf],
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = `${C.field.code}_작업투입_${S.date}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  note('엑셀을 내려받았습니다.');
}

/* ══════════════════════════════════════════════════════════════════
   9. 화면 전환 · 이벤트
   ════════════════════════════════════════════════════════════════ */
/* ── 일일 작업일보 (인쇄) ────────────────────────────────────────
   아침 회의에 그대로 올릴 수 있는 A4 한 장.
   ───────────────────────────────────────────────────────────── */
function sheetHTML() {
  const day = $('#shDate').value || S.date;
  const keep = S.date; S.date = day;              // 경보 엔진은 S.date 기준
  const d = sortRows(dayList());
  const al = scanAlerts();
  S.date = keep;
  const crew = d.reduce((s, e) => s + (Number(e.crew) || 0), 0);
  const wd = ['일','월','화','수','목','금','토'][new Date(day + 'T00:00:00').getDay()];
  const byV = {};
  d.forEach(e => { (byV[e.vendor || '미지정'] = byV[e.vendor || '미지정'] || []).push(e); });
  const w = S.weather;

  return `
  <div class="sh-head">
    <div>
      <h1>일일 작업일보</h1>
      <p>${H(C.field.name)} · ${H(C.field.org)}</p>
    </div>
    <div class="sh-date">
      <b>${H(day)} (${wd})</b>
      <span>출력 ${new Date().toLocaleString('ko-KR')}</span>
    </div>
  </div>

  <div class="sh-sum">
    <div><span>투입 작업</span><b>${d.length}건</b></div>
    <div><span>투입 인원</span><b>${crew}명</b></div>
    <div><span>고위험</span><b>${d.filter(e=>e.grade==='A').length}건</b></div>
    <div><span>투입 업체</span><b>${Object.keys(byV).length}개사</b></div>
    <div><span>경보</span><b>${al.length}건</b></div>
    <div><span>기상</span><b>${w ? Math.round(w.temp)+'°C' : '—'}</b></div>
  </div>

  ${al.length ? `<h2>금일 경보</h2>
  <table class="sh-t"><thead><tr><th style="width:22%">구분</th><th>내용</th><th style="width:30%">조치</th></tr></thead><tbody>
  ${al.map(a => `<tr class="${a.lv}"><td><b>${H(a.tag)}</b></td><td>${H(a.msg)}</td><td>${H(a.sub)}</td></tr>`).join('')}
  </tbody></table>` : ''}

  <h2>작업 내역</h2>
  ${Object.keys(byV).sort().map(v => `
    <h3>${H(v)} <em>${byV[v].length}건 · ${byV[v].reduce((s,e)=>s+(Number(e.crew)||0),0)}명</em></h3>
    <table class="sh-t"><thead><tr>
      <th style="width:12%">시간</th><th style="width:14%">${H(L.zone)}</th><th style="width:12%">${H(L.level)}</th>
      <th>작업내용</th><th style="width:8%">인원</th><th style="width:9%">등급</th><th style="width:9%">결재</th>
    </tr></thead><tbody>
    ${byV[v].map(e => {
      const g = gradeOf(e.grade); const st = reviewState(e);
      return `<tr>
        <td>${H(e.start||'')}~${H(e.end||'')}</td>
        <td>${H((e.zones||[]).join(', '))}</td>
        <td>${H((e.levels||[]).join(', '))}</td>
        <td>${H(e.task||'')}</td>
        <td>${H(String(e.crew||0))}</td>
        <td>${H(g.label)}</td>
        <td>${st==='ok'?'승인':st==='no'?'반려':'대기'}</td>
      </tr>`;
    }).join('')}
    </tbody></table>`).join('') || '<p class="sh-none">등록된 작업이 없습니다.</p>'}

  <div class="sh-sign">
    <div>작성 <span></span></div>
    <div>안전관리자 <span></span></div>
    <div>현장소장 <span></span></div>
  </div>`;
}

function openSheet(day) {
  if (day) $('#shDate').value = day;
  else if (!$('#shDate').value) $('#shDate').value = S.date;
  $('#sheetBody').innerHTML = sheetHTML();
  $('#sheet').hidden = false;
}
function shMove(n) {
  $('#shDate').value = move($('#shDate').value || S.date, n);
  openSheet();
}

function show(p) {
  S.panel = p;
  if (p === 'board') { setTimeout(applyFit, 30); setTimeout(applyFit, 200); }
  if (p === 'entry') { if (!S.jobs.length) clearWiz(); paintDue(); paintJobs(); }
  if (p === 'stat') paintStat();
  if (p === 'team') paintTeam();
  $$('.rail-btn[data-panel]').forEach(b => b.classList.toggle('on', b.dataset.panel === p));
  $$('.panel').forEach(s => s.classList.toggle('on', s.id === 'panel-' + p));
}

function setDate(d) {
  S.date = d;
  $('#bDate').value = d;
  if (!S.editId) $('#eDate').value = d;
  paintAll();
}

function wire() {
  /* 로그인 */
  $('#authForm').addEventListener('submit', async e => {
    e.preventDefault();
    const b = $('#authBtn'), m = $('#authMsg');
    m.hidden = true; b.disabled = true; b.textContent = '접속 중';
    try {
      await firebase.auth().signInWithEmailAndPassword($('#authEmail').value.trim(), $('#authPw').value);
    } catch (x) {
      m.textContent = ({
        'auth/invalid-credential': '이메일 또는 비밀번호가 올바르지 않습니다.',
        'auth/invalid-email': '이메일 형식을 확인하세요.',
        'auth/too-many-requests': '시도가 많습니다. 잠시 후 다시 시도하세요.',
        'auth/network-request-failed': '네트워크를 확인하세요.'
      })[x.code] || ('접속 실패 (' + x.code + ')');
      m.hidden = false;
    } finally { b.disabled = false; b.textContent = '접속'; }
  });
  $('#outBtn').addEventListener('click', () => firebase.auth().signOut());
  $('#waitOut').addEventListener('click', () => firebase.auth().signOut());

  /* 레일 */
  $('#rail').addEventListener('click', e => {
    const b = e.target.closest('.rail-btn'); if (b) show(b.dataset.panel);
  });
  $('#prBtn').addEventListener('click', () => openSheet(S.date));
  $('#shDate').addEventListener('change', () => openSheet());
  $('#shPrev').addEventListener('click', () => shMove(-1));
  $('#shNext').addEventListener('click', () => shMove(1));
  $('#shToday').addEventListener('click', () => openSheet(today()));
  $('#shTomorrow').addEventListener('click', () => openSheet(move(today(), 1)));
  $('#shClose').addEventListener('click', () => { $('#sheet').hidden = true; });
  $('#shPrint').addEventListener('click', () => window.print());
  $('#fsBtn').addEventListener('click', () => {
    document.fullscreenElement ? document.exitFullscreen()
                               : document.documentElement.requestFullscreen?.();
  });

  /* 날짜 */
  $('#bDate').addEventListener('change', e => setDate(e.target.value));
  $('#bPrev').addEventListener('click', () => setDate(move(S.date, -1)));
  $('#bNext').addEventListener('click', () => setDate(move(S.date, 1)));
  $('#bNow').addEventListener('click',  () => setDate(today()));

  /* 위저드 */
  /* 작업투입 — 여러 줄 입력 */
  $('#jobAdd').addEventListener('click', () => { S.jobs.push(blankJob()); paintJobs(); });
  $('#jobCancel').addEventListener('click', () => { clearWiz(); show('log'); });
  $('#jobSubmit').addEventListener('click', submitJobs);

  $('#jobs').addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.f && t.dataset.i !== undefined && !t.closest('.ln')) { readJob(t); return; }
    const ln = t.closest('.ln');
    if (ln) {
      const i = Number(ln.dataset.i), kind = ln.dataset.kind, k = Number(ln.dataset.k);
      if (S.jobs[i] && S.jobs[i][kind][k]) {
        S.jobs[i][kind][k][t.dataset.f] = t.dataset.f === 'n' ? (t.value === '' ? '' : Number(t.value)) : t.value;
        const j = S.jobs[i];
        const box = ln.closest('.res').querySelector('.res-hd b');
        if (box) box.textContent = sumList(j[kind]) + (kind === 'labor' ? '명' : '대');
        const crew = S.jobs.reduce((s2, x) => s2 + sumList(x.labor), 0);
        const eq   = S.jobs.reduce((s2, x) => s2 + sumList(x.equip), 0);
        $('#jobSum').innerHTML = `<b>${S.jobs.length}</b>개 작업 · 인원 <b>${crew}</b>명 · 장비 <b>${eq}</b>대`;
      }
    }
  });
  $('#jobs').addEventListener('change', e => {
    const t = e.target;
    const ln = t.closest('.ln');
    if (!ln && t.dataset.f && t.dataset.i !== undefined) {
      readJob(t);
      if (t.dataset.f === 'zone' || t.dataset.f === 'level') paintJobs();
      return;
    }
    if (ln && t.dataset.f === 't') {
      const i = Number(ln.dataset.i), kind = ln.dataset.kind, k = Number(ln.dataset.k);
      if (S.jobs[i] && S.jobs[i][kind][k]) S.jobs[i][kind][k].t = t.value;
    }
  });
  $('#jobs').addEventListener('click', e => {
    const add = e.target.closest('[data-add]');
    if (add) { S.jobs[Number(add.dataset.i)][add.dataset.add].push({ t: '', n: '' }); paintJobs(); return; }
    const del = e.target.closest('[data-del]');
    if (del) {
      const ln = del.closest('.ln');
      S.jobs[Number(ln.dataset.i)][del.dataset.del].splice(Number(ln.dataset.k), 1);
      paintJobs(); return;
    }
    const jd = e.target.closest('[data-jdel]');
    if (jd) { S.jobs.splice(Number(jd.dataset.jdel), 1); paintJobs(); }
  });

  /* 경보 → 해당 구역·작업으로 이동 */
  $('#alerts').addEventListener('click', e => {
    const c = e.target.closest('[data-al]'); if (!c) return;
    const a = (S.alerts || [])[Number(c.dataset.al)]; if (!a) return;
    if (a.go === 'submit') { show('submit'); $('#sDate').value = move(S.date, 1); paintSubmit(); return; }
    if (a.zone) { openZone(a.zone); return; }
    if (a.filter) {                        // 결재 상태로 기록 필터
      $('#lSpan').value = '1'; $('#lGrade').value = ''; $('#lZone').value = '';
      $('#lPhase').value = ''; $('#lText').value = '';
      S.rvFilter = a.filter; paintLog(); show('log');
      note(a.filter === 'no' ? '반려된 작업만 표시합니다.' : '승인 대기 작업만 표시합니다.');
    }
  });

  /* 작업투입 — 마감 표시 · 전일 복사 · 지도 선택 */
  $('#eDate').addEventListener('change', paintDue);
  $('#copyPrev').addEventListener('click', copyPrev);
  $('#mapPick').addEventListener('click', () => {
    const m = $('#miniMap');
    m.hidden = !m.hidden;
    $('#mapPick').classList.toggle('active', !m.hidden);
    $('#mapPick').textContent = m.hidden ? '지도에서 고르기' : '지도 닫기';
    paintMini();
  });
  $('#miniMap').addEventListener('click', e => {
    const t = e.target.closest('[data-mz]'); if (!t) return;
    const v = t.dataset.mz;
    const i = S.jobs.findIndex(j => !j.zone);
    if (i >= 0) S.jobs[i].zone = v;
    else { const j = blankJob(); j.zone = v; S.jobs.push(j); }
    paintJobs(); note(v + ' 선택됨');
  });

  /* 제출현황 */
  $('#sDate').value = move(today(), 1);
  $('#sDate').addEventListener('change', () => { S.subVendor = null; $('#subDetail').innerHTML=''; paintSubmit(); });
  $('#sPrev').addEventListener('click', () => { $('#sDate').value = move(subDate(), -1); S.subVendor=null; $('#subDetail').innerHTML=''; paintSubmit(); });
  $('#sNext').addEventListener('click', () => { $('#sDate').value = move(subDate(),  1); S.subVendor=null; $('#subDetail').innerHTML=''; paintSubmit(); });
  $('#sTomorrow').addEventListener('click', () => { $('#sDate').value = move(today(), 1); S.subVendor=null; $('#subDetail').innerHTML=''; paintSubmit(); });
  $('#subTable').addEventListener('click', e => {
    const b = e.target.closest('[data-vend]'); if (b) openVendor(b.dataset.vend);
  });
  $('#subDetail').addEventListener('click', async e => {
    const gr = e.target.closest('[data-gr]');
    if (gr) {
      if (!isOwner()) { note('등급 지정은 원청만 가능합니다.', true); return; }
      const x = S.entries.find(v => v.id === gr.dataset.gr); if (!x) return;
      const val = x.grade === gr.dataset.gv ? '' : gr.dataset.gv;
      const { id, ...data } = x; data.grade = val;
      try { await put(id, data); note(val ? gradeOf(val).label + '으로 지정' : '등급 해제'); }
      catch (err) { note('등급 저장 실패 — 권한을 확인하세요.', true); }
      return;
    }
    const ok = e.target.closest('[data-ok]');
    const no = e.target.closest('[data-no]');
    if (ok) {
      try { await putReview(ok.dataset.ok, 'ok', ''); note('승인했습니다.'); }
      catch (x) { note('승인 실패 — 권한을 확인하세요.', true); }
    }
    if (no) {
      const reason = prompt('반려 사유를 입력하세요 (협력사에게 표시됩니다)');
      if (reason === null) return;
      try { await putReview(no.dataset.no, 'no', reason.slice(0,300)); note('반려했습니다.'); }
      catch (x) { note('반려 실패 — 권한을 확인하세요.', true); }
    }
  });

  /* 통계 */
  $('#stSpan').addEventListener('change', paintStat);

  /* 인원 */
  $('#teamTable').addEventListener('change', async e => {
    const t = e.target;
    const uid = t.dataset.rank || t.dataset.vendor || t.dataset.name;
    if (!uid) return;
    if (!isOwner()) { note('권한이 없습니다.', true); return; }
    if (uid === S.user.uid && t.dataset.rank) {      // 자기 권한 강등 차단
      note('본인 권한은 바꿀 수 없습니다.', true); paintTeam(); return;
    }
    const patch = {};
    if (t.dataset.rank)   patch.rank   = t.value;
    if (t.dataset.vendor) patch.vendor = t.value;
    if (t.dataset.name)   patch.name   = t.value.trim();
    if (patch.rank && patch.rank !== 'edit') patch.vendor = null;
    try { await saveMember(uid, patch); note('저장되었습니다.'); }
    catch (x) { note('저장 실패 — 권한을 확인하세요.', true); paintTeam(); }
  });
  $('#teamTable').addEventListener('click', async e => {
    const b = e.target.closest('[data-drop]'); if (!b) return;
    if (!isOwner()) return;
    if (!confirm('이 계정의 접근 권한을 해제할까요?\n\n등록된 작업 기록은 그대로 남습니다.')) return;
    try { await DB.ref(`${P()}/members/${b.dataset.drop}`).remove(); note('해제되었습니다.'); }
    catch (x) { note('해제 실패 — 권한을 확인하세요.', true); }
  });

  /* 기록 */
  ['#lSpan','#lGrade','#lPhase','#lZone'].forEach(s =>
    $(s).addEventListener('change', () => { S.rvFilter = null; paintLog(); }));
  $('#lText').addEventListener('input', () => { S.rvFilter = null; paintLog(); });
  /* 상태 빠른 변경 */
  $('#logTable').addEventListener('change', async e => {
    const sel = e.target.closest('[data-ph]'); if (!sel) return;
    const x = S.entries.find(v => v.id === sel.dataset.ph); if (!x) return;
    const { id, ...d } = x; d.phase = sel.value;
    try { await put(id, d); note(`${d.phase} 으로 변경했습니다.`); }
    catch (err) { note('변경 실패 — 권한을 확인하세요.', true); paintLog(); }
  });
  $('#lXlsx').addEventListener('click', excel);

  document.addEventListener('click', async e => {
    const ed = e.target.closest('[data-ed]');
    const rm = e.target.closest('[data-rm]');
    if (ed) { const x = S.entries.find(v => v.id === ed.dataset.ed); if (x) loadWiz(x); }
    if (rm) {
      const x = S.entries.find(v => v.id === rm.dataset.rm);
      if (x && confirm('이 기록을 삭제할까요?\n\n' + (x.task || ''))) {
        try { await drop(x.id); note('삭제되었습니다.'); }
        catch (err) { note('삭제 실패 — 권한을 확인하세요.', true); }
      }
    }
    const cell = e.target.closest('.cell.has');
    if (cell && cell.title) { show('log'); $('#lText').value = ''; note(cell.title); }
  });

  window.addEventListener('resize', () => { if (S.panel === 'site') applyFit(); });

  /* 단축키 */
  document.addEventListener('keydown', e => {
    if (e.target.matches('input,select,textarea')) return;
    if (e.key === '1') show('board');
    if (e.key === '2') show('entry');
    if (e.key === '3') show('submit');
    if (e.key === '4') show('site');
    if (e.key === '5') show('log');
    if (e.key.toLowerCase() === 'f') $('#fsBtn').click();
  });
}

/* ══════════════════════════════════════════════════════════════════
   시작
   ════════════════════════════════════════════════════════════════ */
theme();
scaffold();
wire();
restore();
tick(); setInterval(tick, 10000);
weather(); setInterval(weather, (C.board.refreshMin || 10) * 60000);

if (!connect()) {
  $('#auth').hidden = true;
  $('#shell').hidden = false;
  note('field.config.js 의 firebase 설정을 입력하세요.', true);
}

})();
