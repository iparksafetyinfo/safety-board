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
const gradeOf = id => C.grades.find(g => g.id === id) || C.grades[C.grades.length - 1];
const mins = t => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const CACHE = 'field_' + C.field.code;
const L = Object.assign({ zone: '구역', level: '층' }, C.labels || {});
const LAYERS = (C.map && C.map.layers) || [];
const layerOf = id => LAYERS.find(x => x.id === id) || LAYERS[0];
// 저장된 좌표가 없으면 설정의 seed 값을 씁니다.
function ptOf(zone) {
  const saved = (S.points[S.layer] || {})[zone];
  if (saved) return saved;
  const seed = ((C.map && C.map.seed) || {})[S.layer] || {};
  return seed[zone] || null;
}

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
  date: today(),
  panel: 'board',
  entries: [],
  step: 1,
  editId: null,
  pick: { zones: [], levels: [], grade: 'A' },
  weather: null,
  alertIdx: 0,
  layer: (C.map && C.map.default) || 'plan',
  points: {},            // { 레이어: { 구역명: {x,y} } } — 이미지 위 비율좌표(0~1)
  pinning: false,
  pinZone: null,
  sZoom: 1,
  sFit: true,
  imgSize: null
};
const mayWrite = () => S.rank === 'own' || S.rank === 'edit';

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
  } else {
    $('#authCi').hidden = true; $('#headCi').hidden = true;
  }
  document.title = C.field.name + ' 상황판';
  $('#authCode').textContent  = C.field.code;
  $('#railCode').textContent  = C.field.code;
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
  opts('#eTrade',  C.trades, '선택');
  opts('#eVendor', C.vendors, '선택');
  opts('#ePhase',  C.phases);
  opts('#eLead',   C.roles.lead,  '선택');
  opts('#eSuper',  C.roles.super, '선택');
  opts('#eHse',    C.roles.hse,   '선택');
  opts('#lPhase',  C.phases, '상태 전체');
  opts('#lZone',   C.zones,  '구역 전체');
  $('#lGrade').innerHTML = '<option value="">등급 전체</option>' +
    C.grades.map(g => `<option value="${g.id}">${H(g.label)}</option>`).join('');

  $('#eZones').innerHTML  = C.zones.map(z => `<button type="button" class="pk" data-z="${H(z)}">${H(z)}</button>`).join('');
  $('#eLevels').innerHTML = C.levels.map(l => `<button type="button" class="pk" data-l="${H(l)}">${H(l)}</button>`).join('');
  $('#eGrades').innerHTML = C.grades.map(g =>
    `<button type="button" class="gd" data-g="${g.id}" data-c="${g.color}">${H(g.label)}</button>`).join('');
  $('#eChecks').innerHTML = C.checks.map(k =>
    `<label class="ck${k.must ? ' must' : ''}" data-k="${H(k.id)}">
       <input type="checkbox" value="${H(k.id)}">
       <span>${H(k.label)}</span>${k.must ? '<em>필수</em>' : ''}
     </label>`).join('');

  $('#heatKeys').innerHTML = C.grades.map(g =>
    `<span><i style="background:${g.color}"></i>${H(g.label)}</span>`).join('');

  // 현장 용어 적용 (아파트=동/층, 토목=구간/공종 …)
  $('#zoneLabel').textContent  = L.zone;
  $('#levelLabel').textContent = L.level;
  $('#heatTitle').textContent  = `${L.zone}·${L.level}별 작업 분포`;
  $('#lZone').options[0].text  = L.zone + ' 전체';

  $('#bDate').value = S.date;
  $('#eDate').value = S.date;
  paintGrade();
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
    if (!u) { $('#auth').hidden = false; $('#shell').hidden = true; return; }
    S.user = u;
    try {
      const s = await DB.ref(`${P()}/members/${u.uid}`).get();
      if (s.exists()) {
        S.rank = s.val();
      } else {
        // 최초 설치: 아직 등록된 인원이 없으면 첫 접속자를 관리자로 등록합니다.
        // (보안 규칙이 '인원 목록이 비어 있을 때 한 번만' 허용합니다)
        const all = await DB.ref(`${P()}/members`).get();
        if (!all.exists()) {
          await DB.ref(`${P()}/members/${u.uid}`).set('own');
          S.rank = 'own';
          note('최초 접속자로 확인되어 관리자로 등록했습니다.');
        } else {
          S.rank = 'view';
        }
      }
    } catch (e) { S.rank = 'view'; }
    $('#auth').hidden = true; $('#shell').hidden = false;
    listen();
  });
  return true;
}

function listen() {
  DB.ref(`${P()}/entries`).on('value', snap => {
    const v = snap.val() || {};
    S.entries = Object.keys(v).map(k => Object.assign({ id: k }, v[k]));
    try { localStorage.setItem(CACHE, JSON.stringify(S.entries)); } catch (e) {}
    paintAll();
  }, () => { restore(); note('서버 연결 실패 — 저장본을 표시합니다', true); });

  DB.ref(`${P()}/points`).on('value', snap => {
    S.points = snap.val() || {};
    try { localStorage.setItem(CACHE + '_pt', JSON.stringify(S.points)); } catch (e) {}
    paintSite();
  }, () => {});
}

function restore() {
  try {
    const r = localStorage.getItem(CACHE);
    if (r) { S.entries = JSON.parse(r); }
    const q = localStorage.getItem(CACHE + '_pt');
    if (q) { S.points = JSON.parse(q); }
    paintAll();
  } catch (e) {}
}

const put = (id, data) => DB.ref(`${P()}/entries/${id || rid()}`).set(data);
const drop = id => DB.ref(`${P()}/entries/${id}`).remove();
const putPoint = (zone, pt) => DB.ref(`${P()}/points/${S.layer}/${zone}`).set(pt);
const dropPoint = zone => DB.ref(`${P()}/points/${S.layer}/${zone}`).remove();

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
        out.push({ lv: 'crit', tag: '동시작업',
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
          out.push({ lv: 'warn', tag: '상하층 작업',
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
    C.zones.forEach(z => {
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
        out.push({ lv: 'crit', tag: '중장비 밀집',
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
        out.push({ lv: 'crit', tag: '굴착 간섭',
          msg: `${(dig.zones || []).join('·')} — ${dig.trade} 중 ${near[0].vendor} 작업 중복`,
          sub: '흙막이·접근금지 조치 및 매몰 위험 확인' });
      }
    });
  }

  /* (4) 단일 위치 과밀 */
  const crowd = {};
  day.forEach(e => (e.zones || []).forEach(z => {
    crowd[z] = (crowd[z] || 0) + (Number(e.crew) || 0);
  }));
  Object.keys(crowd).forEach(z => {
    if (crowd[z] > C.alerts.crowdWorkers) {
      out.push({ lv: 'warn', tag: '인원 과밀',
        msg: `${z} — 동시 투입 ${crowd[z]}명`,
        sub: `기준 ${C.alerts.crowdWorkers}명 초과` });
    }
  });

  /* (5) 야간 작업 */
  day.forEach(e => {
    const end = mins(e.end);
    if (end != null && end > C.shift.nightFrom * 60) {
      out.push({ lv: 'warn', tag: '야간 작업',
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
  paintTimeline(); paintTicker(); paintLog(); paintSite();
}

const dayList = () => S.entries.filter(e => e.date === S.date);

function paintMetrics() {
  const d = dayList();
  const a = d.filter(e => e.grade === 'A').length;
  const crew = d.reduce((s, e) => s + (Number(e.crew) || 0), 0);
  const miss = d.filter(e => C.checks.some(k => k.must && !(e.checks || {})[k.id])
                          && e.phase !== '완료' && e.phase !== '중지').length;
  $('#metrics').innerHTML = `
    <div class="mt"><b>${d.length}</b><span>투입 작업</span></div>
    <div class="mt r"><b>${a}</b><span>고위험</span></div>
    <div class="mt a"><b>${miss}</b><span>점검 미확인</span></div>
    <div class="mt g"><b>${crew}</b><span>투입 인원</span></div>`;
}

function paintAlerts() {
  const al = scanAlerts();
  const p = $('#alertCount');
  p.textContent = al.length;
  p.className = 'pill' + (al.length ? '' : ' zero');
  $('#alerts').innerHTML = al.length
    ? al.map(a => `
      <div class="al ${a.lv === 'crit' ? '' : a.lv === 'warn' ? 'w' : 'i'}">
        <div class="al-t">${H(a.tag)}</div>
        <p class="al-m">${H(a.msg)}</p>
        <p class="al-s">${H(a.sub)}</p>
      </div>`).join('')
    : `<div class="calm"><b>이상 없음</b>등록된 작업에서 감지된 경보가 없습니다.</div>`;
}


/* ── 현장도 (항공사진 + 구역 마커) ────────────────────────────────── */
function pinsHTML() {
  const day = dayList();
  return C.zones.map(z => {
    const p = ptOf(z);
    if (!p) return '';
    const hit = day.filter(e => (e.zones || []).includes(z));
    const g = hit.length
      ? (C.grades.find(x => hit.some(e => e.grade === x.id)) || C.grades[0])
      : null;
    const crew = hit.reduce((s, e) => s + (Number(e.crew) || 0), 0);
    const cls = 'pin' + (g ? ' live' : '') + (S.pinning ? ' movable' : '');
    return `
      <div class="${cls}" style="left:${(p.x * 100).toFixed(3)}%; top:${(p.y * 100).toFixed(3)}%"
           data-zone="${H(z)}">
        <span class="pin-dot" ${g ? `style="background:${g.color}; border-color:${g.color}"` : ''}>${hit.length || ''}</span>
        <span class="pin-tag">${H(z)}${crew ? ` · ${crew}명` : ''}</span>
      </div>`;
  }).join('');
}

function paintLayers() {
  const box = $('#siteLayers'); if (!box) return;
  box.innerHTML = LAYERS.map(l =>
    `<button class="lnk${l.id === S.layer ? ' active' : ''}" data-layer="${H(l.id)}">${H(l.label)}</button>`
  ).join('');
}

function paintKeys() {
  const placed = C.zones.filter(z => ptOf(z)).length;
  $('#siteKeys').innerHTML =
    C.grades.map(g => `<span><i style="background:${g.color}"></i>${H(g.label)}</span>`).join('') +
    `<span class="muted-key">지정 ${placed}/${C.zones.length}</span>`;
}

/* 마커만 갱신 — 사진은 다시 로드하지 않아 스크롤·확대가 유지됩니다 */
function paintPins() {
  const layer = $('#pins');
  if (!layer) { paintSite(); return; }
  layer.innerHTML = pinsHTML();
  paintKeys();
}

function paintSite() {
  const box = $('#siteView');
  if (!box) return;

  if (!C.map || C.map.enabled === false || !LAYERS.length) {
    box.innerHTML = '<div class="void">현장도가 설정되지 않았습니다.<br>' +
      'field.config.js 의 map.layers 에 이미지를 넣어주세요.</div>';
    return;
  }

  // 이미 그려져 있으면 마커만 갱신
  if ($('#siteImg')) {
    applyFit();
    paintPins();
    return;
  }


  box.innerHTML = `
    <div class="site-canvas${S.sFit ? ' fit' : ''}" style="width:${(S.sZoom * 100).toFixed(0)}%">
      <img id="siteImg" src="${H(layerOf(S.layer).image)}" alt="${H(layerOf(S.layer).label)}">
      <div class="pins" id="pins">${pinsHTML()}</div>
    </div>`;

  paintLayers();
  const _im = $('#siteImg');
  _im.addEventListener('load', applyFit);
  if (_im.complete && _im.naturalWidth) applyFit();
  $('#siteImg').addEventListener('error', () => {
    box.innerHTML = '<div class="void">현장 사진을 찾을 수 없습니다.<br>' +
      `<code>${H(layerOf(S.layer).image)}</code> 파일을 확인해 주세요.</div>`;
  });
  paintKeys();
}

/* 맞춤: 사진 전체가 화면에 들어오도록 캔버스 폭을 계산합니다.
   (CSS height:100% 는 마커 좌표계가 어긋나므로 쓰지 않습니다) */
function applyFit() {
  const c = $('.site-canvas'), box = $('#siteView'), img = $('#siteImg');
  if (!c || !box || !img) return;
  box.classList.toggle('fit-wrap', S.sFit);
  const fb = $('#sFit'); if (fb) fb.classList.toggle('active', S.sFit);

  if (!S.sFit) { c.style.width = (S.sZoom * 100).toFixed(0) + '%'; return; }

  const nw = img.naturalWidth, nh = img.naturalHeight;
  if (!nw || !nh) { c.style.width = '100%'; return; }
  const bw = box.clientWidth, bh = box.clientHeight;
  const w = Math.min(bw, bh * (nw / nh));
  c.style.width = Math.floor(w) + 'px';
}

function paintPinZones() {
  $('#pinZones').innerHTML = C.zones.map(z => {
    const set = !!ptOf(z);
    return `<button type="button" class="pk pk-sm${S.pinZone === z ? ' on' : ''}${set ? ' set' : ''}"
              data-pz="${H(z)}">${H(z)}${set ? ' ✓' : ''}</button>`;
  }).join('');
}

function openZone(z) {
  const list = sortRows(dayList().filter(e => (e.zones || []).includes(z)));
  $('#siteDetailTitle').textContent = `${z} — ${S.date}`;
  $('#siteDetailBody').innerHTML = list.length
    ? `<table class="log mini"><tbody>` + list.map(e => {
        const g = gradeOf(e.grade);
        return `<tr>
          <td><span class="tag" style="background:${g.color}">${H(g.label)}</span></td>
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
  const head = '<tr><th class="lv"></th>' +
    C.zones.map(z => `<th>${H(z)}</th>`).join('') + '</tr>';
  const rows = C.levels.map(l => {
    const tds = C.zones.map(z => {
      const hit = d.filter(e => (e.zones || []).includes(z) && (e.levels || []).includes(l));
      if (!hit.length) return '<td><div class="cell">·</div></td>';
      const g = C.grades.find(x => hit.some(e => e.grade === x.id)) || C.grades[0];
      return `<td><div class="cell has" style="background:${g.color}"
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
  for (let h = from; h <= to; h++) {
    const n = d.filter(e => {
      const s = mins(e.start), t = mins(e.end);
      return s != null && t != null && s < (h + 1) * 60 && t > h * 60;
    }).reduce((s, e) => s + (Number(e.crew) || 0), 0);
    buckets.push({ h, n });
  }
  const max = Math.max(1, ...buckets.map(b => b.n));
  // 빨강은 위험 표시 전용 — 과밀 기준을 넘은 시간대만 강조합니다.
  const hot = C.alerts.crowdWorkers || Infinity;
  $('#timeline').innerHTML = buckets.map(b => `
    <div class="tlc">
      <div class="tlv">${b.n || ''}</div>
      <div class="tlb${b.n >= hot ? ' hot' : ''}" style="height:${(b.n / max * 74).toFixed(0)}px"></div>
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
function paintPicks() {
  $$('#eZones .pk').forEach(b => b.classList.toggle('on', S.pick.zones.includes(b.dataset.z)));
  $$('#eLevels .pk').forEach(b => b.classList.toggle('on', S.pick.levels.includes(b.dataset.l)));
  $('#cZone').textContent  = S.pick.zones.length  ? `${S.pick.zones.length}개 선택` : '';
  $('#cLevel').textContent = S.pick.levels.length ? `${S.pick.levels.length}개 선택` : '';
}

function paintGrade() {
  $$('#eGrades .gd').forEach(b => {
    const on = b.dataset.g === S.pick.grade;
    b.classList.toggle('on', on);
    b.style.background  = on ? b.dataset.c : '';
    b.style.borderColor = on ? b.dataset.c : '';
  });
}

function goStep(n) {
  S.step = n;
  $$('.wiz-step').forEach(s => s.classList.toggle('on', +s.dataset.s === n));
  $$('#wizSteps li').forEach(li => {
    li.classList.toggle('on', +li.dataset.s === n);
    li.classList.toggle('done', +li.dataset.s < n);
  });
  $('#wizBack').hidden   = n === 1;
  $('#wizNext').hidden   = n === 3;
  $('#wizDone').hidden   = n !== 3;
  $('#wizCancel').hidden = !S.editId;
  if (n === 3) summary();
  $('#panel-entry').scrollTop = 0;
}

function stepValid(n) {
  if (n === 1) {
    if (!$('#eDate').value) return '작업일을 선택하세요.';
    if (!$('#eStart').value || !$('#eEnd').value) return '작업 시작·종료 시간을 입력하세요.';
    if (mins($('#eEnd').value) <= mins($('#eStart').value)) return '종료 시간이 시작보다 빨라야 할 수 없습니다.';
    if (!S.pick.zones.length) return `작업 ${L.zone}을 선택하세요.`;
    if (!S.pick.levels.length) return `${L.level}을 선택하세요.`;
  }
  if (n === 2) {
    if (!$('#eTask').value.trim()) return '작업내용을 입력하세요.';
    if (!$('#eTrade').value) return '공종을 선택하세요.';
    if (!$('#eVendor').value) return '업체를 선택하세요.';
  }
  return null;
}

function summary() {
  const g = gradeOf(S.pick.grade);
  $('#eSummary').innerHTML = `
    <div><b>${H($('#eDate').value)}</b> ${H($('#eStart').value)} ~ ${H($('#eEnd').value)}</div>
    <div>위치 <b>${H(S.pick.zones.join(', '))}</b> / <b>${H(S.pick.levels.join(', '))}</b></div>
    <div>작업 <b>${H($('#eTask').value)}</b></div>
    <div>${H($('#eTrade').value)} · ${H($('#eVendor').value)} ·
         <b style="color:${g.color}">${H(g.label)}</b> · ${H($('#eCrew').value || 0)}명</div>`;
}

function gather() {
  const checks = {};
  $$('#eChecks input').forEach(i => { checks[i.value] = i.checked; });
  return {
    date:  $('#eDate').value,
    start: $('#eStart').value,
    end:   $('#eEnd').value,
    zones: S.pick.zones.slice(),
    levels: S.pick.levels.slice(),
    task:  $('#eTask').value.trim(),
    trade: $('#eTrade').value,
    vendor: $('#eVendor').value,
    crew:  Number($('#eCrew').value) || 0,
    phase: $('#ePhase').value || C.phases[0],
    grade: S.pick.grade,
    lead:  $('#eLead').value,
    super: $('#eSuper').value,
    hse:   $('#eHse').value,
    checks,
    by: S.user.uid,
    at: Date.now()
  };
}

function clearWiz() {
  S.editId = null;
  S.pick = { zones: [], levels: [], grade: C.grades[0].id };
  $('#wizForm').reset();
  $('#eDate').value = S.date;
  $$('#eChecks .ck').forEach(l => l.classList.remove('on'));
  paintPicks(); paintGrade(); goStep(1);
  $('#wizDone').textContent = '투입 등록';
}

function loadWiz(e) {
  S.editId = e.id;
  S.pick = { zones: (e.zones||[]).slice(), levels: (e.levels||[]).slice(), grade: e.grade || 'A' };
  $('#eDate').value = e.date;   $('#eStart').value = e.start || ''; $('#eEnd').value = e.end || '';
  $('#eTask').value = e.task;   $('#eTrade').value = e.trade || ''; $('#eVendor').value = e.vendor || '';
  $('#eCrew').value = e.crew || ''; $('#ePhase').value = e.phase || C.phases[0];
  $('#eLead').value = e.lead || ''; $('#eSuper').value = e.super || ''; $('#eHse').value = e.hse || '';
  $$('#eChecks .ck').forEach(l => {
    const on = !!(e.checks || {})[l.dataset.k];
    $('input', l).checked = on; l.classList.toggle('on', on);
  });
  paintPicks(); paintGrade();
  $('#wizDone').textContent = '수정 저장';
  show('entry'); goStep(1);
}

async function submit(ev) {
  ev.preventDefault();
  if (!mayWrite()) { note('작성 권한이 없습니다.', true); return; }
  for (const n of [1, 2]) {
    const bad = stepValid(n);
    if (bad) { goStep(n); note(bad, true); return; }
  }
  const missing = C.checks.filter(k => k.must && !$(`#eChecks input[value="${k.id}"]`).checked);
  if (missing.length) { note('필수 확인: ' + missing[0].label, true); return; }

  const btn = $('#wizDone');
  btn.disabled = true;
  try {
    const data = gather();
    if (S.editId) {
      const old = S.entries.find(x => x.id === S.editId);
      data.by = old?.by || S.user.uid;
      data.at = old?.at || Date.now();
    }
    await put(S.editId, data);
    note(S.editId ? '수정되었습니다.' : '투입 등록 완료');
    S.date = data.date; $('#bDate').value = S.date;
    clearWiz(); show('board');
  } catch (e) {
    note('저장 실패 — 권한을 확인하세요.', true);
  } finally { btn.disabled = false; }
}

/* ══════════════════════════════════════════════════════════════════
   7. 기록 테이블
   ════════════════════════════════════════════════════════════════ */
function logRows() {
  const span = Number($('#lSpan').value);
  const g = $('#lGrade').value, p = $('#lPhase').value, z = $('#lZone').value;
  const q = $('#lText').value.trim().toLowerCase();
  const from = span ? move(S.date, -(span - 1)) : null;

  return S.entries.filter(e => {
    if (from && (e.date < from || e.date > S.date)) return false;
    if (g && e.grade !== g) return false;
    if (p && e.phase !== p) return false;
    if (z && !(e.zones || []).includes(z)) return false;
    if (q && ![e.task, e.vendor, e.trade, e.lead, e.super, e.hse]
              .join(' ').toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => (b.date || '').localeCompare(a.date || '')
                 || (a.start || '').localeCompare(b.start || ''));
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
       <th>작업내용</th><th>작업유형</th><th>업체</th><th>인원</th><th>점검</th><th>안전관리자</th>
       ${mayWrite() ? '<th></th>' : ''}
     </tr></thead><tbody>` +
    rows.map(e => {
      const g = gradeOf(e.grade);
      const done = C.checks.filter(k => (e.checks || {})[k.id]).length;
      const bad  = C.checks.some(k => k.must && !(e.checks || {})[k.id]);
      return `<tr>
        <td>${H(e.date)}</td>
        <td>${H(e.start || '')}~${H(e.end || '')}</td>
        <td><span class="tag" style="background:${g.color}">${H(g.label)}</span></td>
        <td><span class="tag ph">${H(e.phase || '')}</span></td>
        <td>${H((e.zones || []).join(', '))}</td>
        <td>${H((e.levels || []).join(', '))}</td>
        <td class="w">${H(e.task || '')}</td>
        <td>${H(e.trade || '')}</td>
        <td>${H(e.vendor || '')}</td>
        <td>${H(String(e.crew || 0))}</td>
        <td class="${bad ? 'miss' : 'okc'}">${done}/${C.checks.length}${bad ? ' !' : ''}</td>
        <td>${H(e.hse || '')}</td>
        ${mayWrite() ? `<td>
           <button class="lnk" data-ed="${e.id}">수정</button>
           ${(S.rank === 'own' || e.by === S.user.uid) ? `<button class="lnk" data-rm="${e.id}">삭제</button>` : ''}
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
                '작업지휘자','관리감독자','안전관리자'];
  C.checks.forEach(k => head.push(k.label));

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
    const line = [e.date, e.start, e.end, gradeOf(e.grade).label, e.phase,
      (e.zones || []).join(','), (e.levels || []).join(','), e.task, e.trade, e.vendor,
      e.crew, e.lead, e.super, e.hse];
    C.checks.forEach(k => line.push((e.checks || {})[k.id] ? 'O' : 'X'));
    const r = ws.addRow(line);
    if (e.grade === 'A') r.getCell(4).font = { bold: true, color: { argb: 'FFF01428' } };
    C.checks.forEach((k, i) => {
      if (k.must && !(e.checks || {})[k.id]) {
        r.getCell(15 + i).font = { bold: true, color: { argb: 'FFF01428' } };
      }
    });
  });

  ws.columns.forEach((c, i) => { c.width = i === 7 ? 40 : (i < 3 ? 11 : 12); });
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
function show(p) {
  S.panel = p;
  if (p === 'site') { setTimeout(applyFit, 30); setTimeout(applyFit, 200); }
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

  /* 레일 */
  $('#rail').addEventListener('click', e => {
    const b = e.target.closest('.rail-btn'); if (b) show(b.dataset.panel);
  });
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
  $('#eZones').addEventListener('click', e => {
    const b = e.target.closest('.pk'); if (!b) return;
    const a = S.pick.zones, v = b.dataset.z;
    a.includes(v) ? a.splice(a.indexOf(v), 1) : a.push(v); paintPicks();
  });
  $('#eLevels').addEventListener('click', e => {
    const b = e.target.closest('.pk'); if (!b) return;
    const a = S.pick.levels, v = b.dataset.l;
    a.includes(v) ? a.splice(a.indexOf(v), 1) : a.push(v); paintPicks();
  });
  $('#eGrades').addEventListener('click', e => {
    const b = e.target.closest('.gd'); if (!b) return;
    S.pick.grade = b.dataset.g; paintGrade();
  });
  $('#eChecks').addEventListener('change', e => {
    const l = e.target.closest('.ck'); if (l) l.classList.toggle('on', e.target.checked);
  });
  $('#wizNext').addEventListener('click', () => {
    const bad = stepValid(S.step);
    if (bad) { note(bad, true); return; }
    goStep(Math.min(3, S.step + 1));
  });
  $('#wizBack').addEventListener('click', () => goStep(Math.max(1, S.step - 1)));
  $('#wizCancel').addEventListener('click', () => { clearWiz(); show('log'); });
  $('#wizForm').addEventListener('submit', submit);

  /* 현장도 */
  $('#pinMode').addEventListener('click', () => {
    if (S.rank !== 'own') { note('위치지정은 관리자(own)만 가능합니다.', true); return; }
    S.pinning = !S.pinning;
    S.pinZone = S.pinning ? C.zones[0] : null;
    $('#pinBar').hidden = !S.pinning;
    $('#pinMsg').textContent = `배치할 ${L.zone}을 고르고 사진에서 위치를 클릭하세요.`;
    $('#pinMode').classList.toggle('active', S.pinning);
    if (S.pinning) paintPinZones();
    paintPins();
  });
  $('#pinDone').addEventListener('click', () => {
    S.pinning = false; S.pinZone = null;
    $('#pinBar').hidden = true;
    $('#pinMode').classList.remove('active');
    paintPins();
  });
  $('#pinZones').addEventListener('click', e => {
    const b = e.target.closest('[data-pz]'); if (!b) return;
    S.pinZone = b.dataset.pz; paintPinZones();
  });
  $('#siteView').addEventListener('click', async e => {
    const canvas = e.target.closest('.site-canvas');
    if (!canvas) return;

    // 위치지정 모드: 클릭 지점을 현재 선택 구역 좌표로 저장
    if (S.pinning) {
      if (!S.pinZone) { note(`배치할 ${L.zone}을 먼저 고르세요.`, true); return; }
      const img = $('#siteImg');
      const r = img.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) return;
      const pt = { x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000 };
      if (!S.points[S.layer]) S.points[S.layer] = {};
      S.points[S.layer][S.pinZone] = pt;
      paintPins(); paintPinZones();
      try { await putPoint(S.pinZone, pt); note(S.pinZone + ' 위치 저장'); }
      catch (err) { note('저장 실패 — 권한을 확인하세요.', true); }
      // 다음 미지정 구역으로 자동 이동
      const next = C.zones.find(z => !(S.points[S.layer] || {})[z]);
      if (next) { S.pinZone = next; paintPinZones(); }
      return;
    }

    // 일반 모드: 마커 클릭 시 구역 상세
    const pin = e.target.closest('.pin');
    if (pin) openZone(pin.dataset.zone);
  });
  $('#siteView').addEventListener('contextmenu', async e => {
    if (!S.pinning) return;
    const pin = e.target.closest('.pin'); if (!pin) return;
    e.preventDefault();
    const z = pin.dataset.zone;
    if (S.points[S.layer]) delete S.points[S.layer][z];
    paintPins(); paintPinZones();
    try { await dropPoint(z); note(z + ' 위치 해제'); } catch (err) {}
  });
  $('#siteDetailClose').addEventListener('click', () => { $('#siteDetail').hidden = true; });
  $('#siteLayers').addEventListener('click', e => {
    const b = e.target.closest('[data-layer]'); if (!b) return;
    if (b.dataset.layer === S.layer) return;
    S.layer = b.dataset.layer;
    S.sFit = true; S.sZoom = 1;
    $('#siteView').innerHTML = '';     // 이미지가 바뀌므로 새로 그립니다
    paintSite(); paintPinZones();
  });
  $('#sFit').addEventListener('click',       () => { S.sFit = !S.sFit; applyFit(); });
  $('#sZoomIn').addEventListener('click',    () => { S.sFit = false; S.sZoom = Math.min(4, S.sZoom + .3); applyFit(); });
  $('#sZoomOut').addEventListener('click',   () => { S.sFit = false; S.sZoom = Math.max(1, S.sZoom - .3); applyFit(); });
  $('#sZoomReset').addEventListener('click', () => { S.sFit = false; S.sZoom = 1; applyFit(); });

  /* 기록 */
  ['#lSpan','#lGrade','#lPhase','#lZone'].forEach(s => $(s).addEventListener('change', paintLog));
  $('#lText').addEventListener('input', paintLog);
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
    if (e.key === '3') show('site');
    if (e.key === '4') show('log');
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
