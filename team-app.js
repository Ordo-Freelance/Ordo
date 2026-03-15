/* ═══════════════════════════════════════════════════
   Ordo Team — Application Logic
   team-app.js
═══════════════════════════════════════════════════ */

'use strict';

// ══════════════════════════════════════════════════
//  SUPABASE
// ══════════════════════════════════════════════════
const SUPA_URL  = 'https://mpfmcjgigpvdxbhgzufo.supabase.co';
const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wZm1jamdpZ3B2ZHhiaGd6dWZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2Mjc3MzMsImV4cCI6MjA4ODIwMzczM30.fICNxH_7DEBHripIoyMcUugTnd4JEBx-ypegpPvb6PM';
const supa = supabase.createClient(SUPA_URL, SUPA_ANON);

// ══════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════
const TEAM_COLORS  = ['#7c6ff7','#f7c948','#4fd1a5','#f76f7c','#64b5f6','#ff8a65','#ce93d8','#80cbc4'];
const MEMBER_COLORS= ['#7c6ff7','#f7c948','#4fd1a5','#f76f7c','#64b5f6','#ff8a65','#ce93d8'];

const DEFAULT_COLS = [
  {id:'backlog',  label:'📥 Backlog',         color:'#55557a'},
  {id:'todo',     label:'📋 قيد الانتظار',    color:'#64b5f6'},
  {id:'inprog',   label:'⚡ جارٍ التنفيذ',   color:'#7c6ff7'},
  {id:'review',   label:'👀 مراجعة',          color:'#f7c948'},
  {id:'done',     label:'✅ مكتمل',          color:'#4fd1a5'},
];

let TS = {
  teams:         [],
  currentTeamId: null,
  currentView:   'board',
  boardMode:     'kanban',
  me: { supaId: null, name: 'أنا', email: '' },
};

// UI state
let _newTeamColor  = TEAM_COLORS[0];
let _newTeamType   = 'team';
let _dragTaskId    = null;
let _dragFromCol   = null;
let _listDragId    = null;
let _currentTaskId = null;
let _mentionTaskId = null;
let _doneCollapsed = false;

// ══════════════════════════════════════════════════
//  UTILS
// ══════════════════════════════════════════════════
function esc(s){ if(!s&&s!==0) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function uid(){ return 't_'+Date.now()+'_'+Math.random().toString(36).slice(2,7); }
function today(){ return new Date().toISOString().split('T')[0]; }
function fmtDate(d){ if(!d) return ''; try{ return new Date(d).toLocaleDateString('ar-EG',{year:'numeric',month:'short',day:'numeric'}); }catch(e){return d;} }
function isLate(d,done){ return d && !done && new Date(d)<new Date(); }

function toast(msg, dur=3000){
  const portal = document.getElementById('toast-portal');
  if(!portal) return;
  const el = document.createElement('div');
  el.className='toast'; el.innerHTML=msg;
  portal.appendChild(el);
  setTimeout(()=>el.remove(), dur);
}

function openModal(id){ const el=document.getElementById(id); if(el) el.style.display='flex'; }
function closeModal(id){ const el=document.getElementById(id); if(el) el.style.display='none'; }

// ══════════════════════════════════════════════════
//  PERSISTENCE
// ══════════════════════════════════════════════════
function saveLS(){
  try{ localStorage.setItem('ordo_teams_v2', JSON.stringify({ teams:TS.teams, currentTeamId:TS.currentTeamId, me:TS.me })); }catch(e){}
}
function loadLS(){
  try{
    const raw = localStorage.getItem('ordo_teams_v2');
    if(raw){ const d=JSON.parse(raw); TS.teams=d.teams||[]; TS.currentTeamId=d.currentTeamId||null; if(d.me) TS.me={...TS.me,...d.me}; }
  }catch(e){}
}

async function syncToCloud(teamId){
  if(!TS.me.supaId || typeof supa==='undefined') return;
  try{
    const snapshot = {
      teams: TS.teams,
      ownerId: TS.me.supaId,
      ownerEmail: TS.me.email||'',
      ownerName: TS.me.name||'',
      updatedAt: new Date().toISOString()
    };
    const snapshotStr = JSON.stringify(snapshot);

    // ── طريقة ١: حفّظ في user_notifications كـ snapshot قابل للبحث ──
    // نشوف لو في row موجودة لنفس المستخدم
    const {data:existing} = await supa.from('user_notifications')
      .select('id').eq('user_id', TS.me.supaId).eq('type','team_data_snapshot')
      .maybeSingle().catch(()=>({data:null}));

    if(existing?.id){
      // حدّث الـ row الموجودة
      await supa.from('user_notifications').update({
        data: snapshotStr,
        created_at: new Date().toISOString()
      }).eq('id', existing.id).catch(()=>{});
    } else {
      // أنشئ row جديدة
      await supa.from('user_notifications').insert([{
        user_id: TS.me.supaId,
        title: '__team_snapshot__',
        body: TS.me.name||'owner',
        type: 'team_data_snapshot',
        data: snapshotStr,
        read: true,
        created_at: new Date().toISOString()
      }]).catch(()=>{});
    }

    // ── طريقة ٢: حفّظ في studio_data بدون مسح البيانات الموجودة ──
    try {
      const {data:sdRow} = await supa.from('studio_data')
        .select('data').eq('user_id', TS.me.supaId).single().catch(()=>({data:null}));
      let ud = {};
      if(sdRow?.data){
        ud = typeof sdRow.data==='string'?JSON.parse(sdRow.data):sdRow.data;
      }
      // أضف الـ team data بدون مسح أي شيء
      ud._teamAppData = snapshotStr;
      ud._companyTeams = TS.teams.filter(t=>t.type==='company');
      ud._teamsUpdatedAt = new Date().toISOString();
      await supa.from('studio_data').upsert({
        user_id: TS.me.supaId,
        data: JSON.stringify(ud),
        updated_at: new Date().toISOString()
      }, {onConflict:'user_id'}).catch(()=>{});
    }catch(e){}

  }catch(e){ console.warn('syncToCloud:', e); }
}

// ══════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', async ()=>{
  loadLS();

  // Apply theme first
  const mode = localStorage.getItem('studioDisplayMode');
  if(mode==='light') document.documentElement.classList.add('light-mode');

  // init role cards
  setTimeout(()=>_selectMemberRole('member'), 100);

  // ── فحص join param أولاً ──
  const params = new URLSearchParams(location.search);
  const joinId  = params.get('join');

  // Get supabase session
  let sessionLoaded = false;
  try{
    const {data} = await supa.auth.getSession();
    if(data?.session?.user){
      TS.me.supaId  = data.session.user.id;
      TS.me.email   = data.session.user.email||'';
      try {
        const {data:rows} = await supa.from('studio_data').select('data').eq('user_id', TS.me.supaId).single();
        if(rows?.data){
          const d = typeof rows.data==='string'?JSON.parse(rows.data):rows.data;
          if(d?.settings?.name) TS.me.name = d.settings.name;
        }
      }catch(e){}
      saveLS();
      sessionLoaded = true;
    }
  }catch(e){}

  // ── لو في join param وما فيش session — وجّهه للـ login ──
  if(joinId && !sessionLoaded){
    const tdParam = params.get('td')||'';
    localStorage.setItem('_pendingTeamInvite', joinId);
    if(tdParam) localStorage.setItem('_pendingTeamTd', tdParam);
    const base = location.href.replace(/[^/]*(\?.*)?$/, '');
    const indexUrl = base+'index.html?teamInvite='+encodeURIComponent(joinId)+(tdParam?'&td='+encodeURIComponent(tdParam):'');
    document.body.innerHTML = `
      <div style="position:fixed;inset:0;background:var(--bg,#0a0a0f);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;padding:20px;font-family:'Cairo',sans-serif;color:var(--text,#e8e8f4)">
        <div style="font-size:60px">🔐</div>
        <div style="font-size:20px;font-weight:900">يرجى تسجيل الدخول أولاً</div>
        <div style="font-size:13px;color:var(--text3,#55557a);text-align:center;max-width:340px;line-height:1.7">
          تمت دعوتك للانضمام لفريق في Ordo.<br>
          يرجى تسجيل الدخول أو إنشاء حساب للمتابعة.
        </div>
        <a href="${indexUrl}" style="padding:14px 32px;background:#7c6ff7;color:#fff;border-radius:12px;font-size:15px;font-weight:800;text-decoration:none;margin-top:8px">
          <i class="fa-solid fa-right-to-bracket"></i> تسجيل الدخول
        </a>
        <div style="font-size:11px;color:var(--text3,#55557a)">سيتم توجيهك تلقائياً خلال 3 ثوانٍ...</div>
      </div>`;
    setTimeout(()=>{ window.location.href = indexUrl; }, 3000);
    return;
  }

  // ── handle join link (with session) ──
  if(joinId){
    handleJoinLink(joinId);
    return;
  }

  // ── فحص pending invite من localStorage ──
  const pendingInvite = localStorage.getItem('_pendingTeamInvite');
  if(pendingInvite && sessionLoaded){
    localStorage.removeItem('_pendingTeamInvite');
    setTimeout(()=>handleJoinLink(pendingInvite), 600);
    return;
  }

  // ── شغّل syncToCloud فور تحميل النظام لضمان وجود الـ snapshot ──
  if(sessionLoaded && TS.teams.length > 0){
    setTimeout(()=>syncToCloud(TS.currentTeamId), 2000);
  }

  // ── استعادة آخر فريق أو عرض القائمة ──
  if(TS.currentTeamId && TS.teams.find(t=>t.id===TS.currentTeamId)){
    openTeam(TS.currentTeamId);
  } else if(TS.teams.length===1){
    openTeam(TS.teams[0].id);
  } else {
    showTeamsList();
  }
});

// ══════════════════════════════════════════════════
//  TEAMS LIST
// ══════════════════════════════════════════════════
function showTeamsList(){
  TS.currentTeamId = null;
  saveLS();
  updateSidebar(null);
  document.getElementById('topbar-title').textContent = 'إدارة الفرق';
  document.getElementById('topbar-actions').innerHTML = `
    <button class="btn btn-primary btn-sm" onclick="openModal('modal-create-team')">
      <i class="fa-solid fa-plus"></i> فريق جديد
    </button>`;
  document.getElementById('view-toggle').style.display='none';
  showView('teams');
  renderTeamsList();
}

function renderTeamsList(){
  const el = document.getElementById('view-teams');
  if(!el) return;

  if(!TS.teams.length){
    el.innerHTML = `
    <div class="empty-screen">
      <div class="empty-screen-icon">👥</div>
      <div class="empty-screen-title">مرحباً في نظام الفرق</div>
      <div class="empty-screen-sub">أنشئ فريقك الأول وابدأ في إدارة مهامك وفريقك باحترافية كاملة</div>
      <button class="btn btn-primary" onclick="openModal('modal-create-team')" style="margin-top:8px">
        <i class="fa-solid fa-plus"></i> إنشاء فريق
      </button>
    </div>`;
    return;
  }

  const html = TS.teams.map(team=>{
    const tasks   = team.tasks||[];
    const active  = tasks.filter(t=>t.status!=='done'&&!t.done).length;
    const done    = tasks.filter(t=>t.status==='done'||t.done).length;
    const members = team.members||[];
    const stack   = members.slice(0,5).map(m=>
      `<div class="member-pip" style="background:${m.color||MEMBER_COLORS[0]}" title="${esc(m.name)}">${m.name[0]}</div>`
    ).join('');
    const extra = members.length>5 ? `<div class="member-pip" style="background:var(--surface3);color:var(--text3);font-size:9px">+${members.length-5}</div>` : '';
    const typeBadge = team.type==='company'
      ? `<span class="badge" style="background:rgba(247,201,72,.12);color:var(--accent2)">🏢 شركة</span>`
      : `<span class="badge" style="background:rgba(124,111,247,.12);color:var(--accent)">👥 فريق</span>`;
    return `
    <div class="team-card" style="--team-color:${team.color}" onclick="openTeam('${team.id}')">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
        <div class="team-card-avatar" style="background:${team.color}">${team.emoji||team.name[0]}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:15px;font-weight:800;margin-bottom:3px">${esc(team.name)}</div>
          ${typeBadge}
        </div>
        <button class="btn btn-icon-sm btn-ghost" onclick="event.stopPropagation();deleteTeam('${team.id}')" title="حذف">
          <i class="fa-solid fa-trash" style="font-size:11px;color:var(--text3)"></i>
        </button>
      </div>
      ${team.desc?`<div style="font-size:12px;color:var(--text3);margin-bottom:12px;line-height:1.5">${esc(team.desc)}</div>`:''}
      <div class="team-card-stats">
        <div class="team-stat"><div class="team-stat-val" style="color:${team.color}">${tasks.length}</div><div class="team-stat-lbl">مهمة</div></div>
        <div class="team-stat"><div class="team-stat-val" style="color:var(--accent3)">${done}</div><div class="team-stat-lbl">مكتملة</div></div>
        <div class="team-stat"><div class="team-stat-val" style="color:var(--accent2)">${members.length}</div><div class="team-stat-lbl">عضو</div></div>
      </div>
      <div class="member-stack">${stack}${extra}</div>
    </div>`;
  }).join('');

  el.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
    <div>
      <div style="font-size:20px;font-weight:900">فرقي (${TS.teams.length})</div>
      <div style="font-size:12px;color:var(--text3);margin-top:2px">اضغط على الفريق لفتحه</div>
    </div>
    <button class="btn btn-primary" onclick="openModal('modal-create-team')"><i class="fa-solid fa-plus"></i> فريق جديد</button>
  </div>
  <div class="teams-grid">${html}</div>`;
}

// ══════════════════════════════════════════════════
//  OPEN TEAM
// ══════════════════════════════════════════════════
function openTeam(id){
  const team = TS.teams.find(t=>t.id===id);
  if(!team) return;
  TS.currentTeamId = id;
  TS.currentView   = 'board';
  saveLS();
  updateSidebar(team);
  document.getElementById('view-toggle').style.display='flex';
  setTopbarForTeam(team);
  switchView('board');
}

function updateSidebar(team){
  const logo = document.getElementById('sb-logo');
  const name = document.getElementById('sb-name');
  const type = document.getElementById('sb-type');
  const badge= document.getElementById('sb-members-badge');
  const compNav = document.getElementById('sb-company-nav');

  if(!team){
    if(logo){ logo.textContent='O'; logo.style.background='var(--accent)'; }
    if(name) name.textContent='Ordo Teams';
    if(type) type.textContent='نظام إدارة الفرق';
    if(badge) badge.textContent='';
    if(compNav) compNav.style.display='none';
    return;
  }
  if(logo){ logo.textContent=team.emoji||team.name[0]; logo.style.background=team.color; }
  if(name) name.textContent=team.name;
  if(type) type.textContent=team.type==='company'?'نظام شركة':'فريق عمل';
  if(badge) badge.textContent=(team.members||[]).length;
  if(compNav) compNav.style.display=team.type==='company'?'block':'none';
}

function setTopbarForTeam(team){
  document.getElementById('topbar-title').textContent = team.name;
  document.getElementById('topbar-actions').innerHTML = `
    <button class="btn btn-ghost btn-sm" onclick="openShareModal()"><i class="fa-solid fa-share-nodes"></i> مشاركة</button>
    <button class="btn btn-primary btn-sm" onclick="openAddTaskModal(null)"><i class="fa-solid fa-plus"></i> مهمة</button>`;
}

// ══════════════════════════════════════════════════
//  VIEWS
// ══════════════════════════════════════════════════
function showView(name){
  document.querySelectorAll('[data-view]').forEach(el=>el.style.display='none');
  const el = document.querySelector(`[data-view="${name}"]`);
  if(el) el.style.display='';
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active', n.dataset.nav===name));
}

function switchView(name){
  TS.currentView = name;
  showView(name);
  const toggle = document.getElementById('view-toggle');
  toggle.style.display = (name==='board'||name==='list') ? 'flex' : 'none';

  if(name==='board')       renderBoard();
  else if(name==='list')   renderList();
  else if(name==='members') renderMembers();
  else if(name==='clients') renderClients();
  else if(name==='depts')   renderDepts();
  else if(name==='hr')      renderHR();
  else if(name==='settings') renderSettings();
  else if(name==='teams')    renderTeamsList();
}

function setBoardMode(mode){
  TS.boardMode = mode;
  const kb = document.getElementById('vt-kanban');
  const lb = document.getElementById('vt-list');
  if(kb){ kb.style.background = mode==='kanban'?'var(--accent)':'transparent'; kb.style.color=mode==='kanban'?'#fff':''; }
  if(lb){ lb.style.background = mode==='list'  ?'var(--accent)':'transparent'; lb.style.color=mode==='list'  ?'#fff':''; }
  if(mode==='kanban') renderBoard();
  else renderList();
}

// ══════════════════════════════════════════════════
//  BOARD — KANBAN
// ══════════════════════════════════════════════════
function currentTeam(){ return TS.teams.find(t=>t.id===TS.currentTeamId); }

function renderBoard(){
  const team = currentTeam();
  const el   = document.querySelector('[data-view="board"]');
  if(!el) return;
  if(!team){ el.innerHTML=''; return; }
  if(TS.boardMode==='list'){ renderList(); return; }

  const cols  = team.columns||DEFAULT_COLS.map(c=>({...c}));
  const tasks = team.tasks||[];

  el.innerHTML = `<div class="board-scroll" id="board-scroll">
    ${cols.map(col=>{
      const colTasks = tasks.filter(t=>t.status===col.id);
      return `
      <div class="kb-column kb-col" id="kbc-${col.id}"
        ondragover="_kbDragOver(event,'${col.id}')"
        ondrop="_kbDrop(event,'${col.id}')"
        ondragleave="_kbDragLeave(event)">
        <div class="kb-col-header">
          <div class="kb-col-dot" style="background:${col.color}"></div>
          <span class="kb-col-title">${esc(col.label)}</span>
          <span class="kb-col-count">${colTasks.length}</span>
          <button class="btn btn-icon-sm btn-ghost" onclick="openAddTaskModal('${col.id}')" style="margin-right:auto;width:24px;height:24px;font-size:11px">+</button>
        </div>
        <div class="kb-cards" id="kbc-cards-${col.id}">
          ${colTasks.map(t=>renderKbCard(t,team)).join('')}
        </div>
        <button class="kb-add-btn" onclick="openAddTaskModal('${col.id}')">
          <i class="fa-solid fa-plus"></i> إضافة مهمة
        </button>
      </div>`;
    }).join('')}
    <div style="width:180px;flex-shrink:0;padding-top:4px">
      <button class="btn btn-ghost btn-sm" style="width:100%;justify-content:center" onclick="addColumn()">
        <i class="fa-solid fa-plus"></i> عمود جديد
      </button>
    </div>
  </div>`;
}

function renderKbCard(t, team){
  const assignee  = (team.members||[]).find(m=>m.id===t.assigneeId);
  const priColor  = {high:'var(--accent4)',med:'var(--accent2)',low:'var(--accent3)'}[t.priority||'med'];
  const priLabel  = {high:'🔴 عالية',med:'🟡 متوسطة',low:'🟢 منخفضة'}[t.priority||'med'];
  const late = isLate(t.deadline, t.done||t.status==='done');
  const comments  = (t.comments||[]).length;
  const tags = (t.tags||[]).slice(0,3);
  const stepsTotal= (t.steps||[]).length;
  const stepsDone = (t.steps||[]).filter(s=>s.done).length;
  return `
  <div class="kb-card" draggable="true"
    ondragstart="_kbDragStart(event,'${t.id}','${t.status}')"
    ondragend="_kbDragEnd(event)"
    onclick="openTaskDetail('${t.id}')">
    <div style="display:flex;align-items:flex-start;gap:6px;margin-bottom:6px">
      <div class="pri-dot" style="background:${priColor};margin-top:4px" title="${priLabel}"></div>
      <div class="kb-card-title ellipsis" style="flex:1">${esc(t.title)}</div>
    </div>
    ${t.desc?`<div style="font-size:11px;color:var(--text3);margin-bottom:7px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.5">${esc(t.desc)}</div>`:''}
    ${stepsTotal?`<div style="margin-bottom:7px">
      <div class="progress-track"><div class="progress-fill" style="width:${Math.round(stepsDone/stepsTotal*100)}%;background:${stepsTotal===stepsDone?'var(--accent3)':'var(--accent)'}"></div></div>
      <div style="font-size:10px;color:var(--text3);margin-top:3px">${stepsDone}/${stepsTotal} خطوة</div>
    </div>`:''}
    <div class="kb-card-meta">
      ${tags.map(tg=>`<span class="tag-pill">${esc(tg)}</span>`).join('')}
      ${t.type?`<span class="tag-pill" style="background:rgba(124,111,247,.1);color:var(--accent)">${esc(t.type)}</span>`:''}
      ${t.client?`<span style="font-size:10px;color:var(--text3)">📋 ${esc(t.client)}</span>`:''}
    </div>
    <div class="kb-card-footer">
      <div style="display:flex;align-items:center;gap:6px">
        ${assignee
          ? `<div style="width:22px;height:22px;border-radius:50%;background:${assignee.color||'var(--accent)'};color:#fff;font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center" title="${esc(assignee.name)}">${assignee.name[0]}</div>
             <span style="font-size:10px;color:var(--text3)">${esc(assignee.name)}</span>`
          : `<span style="font-size:10px;color:var(--text3)">غير مُعيَّن</span>`
        }
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        ${comments?`<span style="font-size:10px;color:var(--text3)"><i class="fa-regular fa-comment"></i> ${comments}</span>`:''}
        ${t.deadline?`<span style="font-size:10px;color:${late?'var(--accent4)':'var(--text3)'}"><i class="fa-solid fa-calendar${late?'-xmark':''}"></i> ${t.deadline}</span>`:''}
      </div>
    </div>
  </div>`;
}

// ── Kanban Drag ──
function _kbDragStart(e, taskId, fromCol){ _dragTaskId=taskId; _dragFromCol=fromCol; e.currentTarget.classList.add('dragging'); e.dataTransfer.effectAllowed='move'; }
function _kbDragEnd(e){ e.currentTarget.classList.remove('dragging'); }
function _kbDragOver(e, colId){ e.preventDefault(); document.getElementById('kbc-'+colId)?.classList.add('drag-over'); }
function _kbDragLeave(e){ e.currentTarget.classList.remove('drag-over'); }
function _kbDrop(e, toCol){
  e.preventDefault();
  document.querySelectorAll('.kb-col').forEach(c=>c.classList.remove('drag-over'));
  if(!_dragTaskId||_dragFromCol===toCol) return;
  const team = currentTeam();
  const task = (team?.tasks||[]).find(t=>String(t.id)===String(_dragTaskId));
  if(task){ task.status=toCol; task.updatedAt=new Date().toISOString(); }
  saveLS(); syncToCloud(TS.currentTeamId);
  renderBoard();
}

// ══════════════════════════════════════════════════
//  LIST VIEW
// ══════════════════════════════════════════════════
function renderList(){
  const team = currentTeam();
  const el   = document.querySelector('[data-view="list"]');
  if(!el||!team){ if(el) el.innerHTML=''; return; }

  const tasks   = team.tasks||[];
  const active  = tasks.filter(t=>t.status!=='done'&&!t.done);
  const done    = tasks.filter(t=>t.status==='done'||t.done);
  const cols    = team.columns||DEFAULT_COLS.map(c=>({...c}));
  const colMap  = Object.fromEntries(cols.map(c=>[c.id,c]));

  function makeRow(t, idx){
    const assignee = (team.members||[]).find(m=>m.id===t.assigneeId);
    const col      = colMap[t.status];
    const isDone   = t.done||t.status==='done';
    const late     = isLate(t.deadline, isDone);
    const priColor = {high:'var(--accent4)',med:'var(--accent2)',low:'var(--accent3)'}[t.priority||'med'];
    return `<tr class="task-row" draggable="true" data-task-id="${t.id}"
      onclick="openTaskDetail('${t.id}')"
      ondragstart="_listDragStart(event,'${t.id}')"
      ondragover="_listDragOver(event)"
      ondrop="_listDrop(event,'${t.id}')"
      ondragend="_listDragEnd(event)">
      <td><span class="drag-handle" onclick="event.stopPropagation()"><i class="fa-solid fa-grip-vertical"></i></span></td>
      <td>
        <div style="display:flex;align-items:center;gap:7px">
          <div class="pri-dot" style="background:${priColor};flex-shrink:0"></div>
          <span style="${isDone?'text-decoration:line-through;color:var(--text3)':''}font-weight:700">${esc(t.title)}</span>
          ${t.type?`<span class="tag-pill" style="background:rgba(124,111,247,.1);color:var(--accent);font-size:10px">${esc(t.type)}</span>`:''}
        </div>
        ${t.client?`<div style="font-size:10px;color:var(--text3);margin-top:2px;margin-right:15px">${esc(t.client)}</div>`:''}
      </td>
      <td>
        ${col?`<span style="font-size:11px;font-weight:700;color:${col.color||'var(--text3)'}">${esc(col.label)}</span>`:'—'}
      </td>
      <td>
        ${assignee
          ? `<div style="display:flex;align-items:center;gap:6px">
               <div style="width:20px;height:20px;border-radius:50%;background:${assignee.color||'var(--accent)'};color:#fff;font-size:8px;font-weight:800;display:flex;align-items:center;justify-content:center">${assignee.name[0]}</div>
               <span style="font-size:11px">${esc(assignee.name)}</span>
             </div>`
          : '<span style="font-size:11px;color:var(--text3)">—</span>'
        }
      </td>
      <td style="font-size:11px;color:${late?'var(--accent4)':'var(--text3)'};font-family:var(--mono)">${t.deadline||'—'}</td>
      <td style="font-size:11px;color:var(--text3)">${(t.comments||[]).length||'—'}</td>
      <td onclick="event.stopPropagation()">
        <div style="display:flex;gap:4px">
          <button class="btn btn-icon-sm btn-ghost" onclick="editTask('${t.id}')" title="تعديل"><i class="fa-solid fa-pen" style="font-size:11px"></i></button>
          <button class="btn btn-icon-sm btn-danger" onclick="deleteTask('${t.id}')" title="حذف"><i class="fa-solid fa-trash" style="font-size:11px"></i></button>
        </div>
      </td>
    </tr>`;
  }

  const activeHTML = active.length ? active.map(makeRow).join('') :
    `<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:24px;font-size:12px">لا توجد مهام نشطة</td></tr>`;
  const doneSectionHTML = done.length ? `
    <tr class="done-section-hdr" onclick="_toggleDoneSection()">
      <td colspan="7" style="padding:9px 12px">
        <div style="display:flex;align-items:center;gap:8px;font-size:12px;font-weight:800;color:var(--accent3)">
          <i class="fa-solid fa-square-check"></i> مكتملة
          <span style="background:rgba(79,209,165,.15);color:var(--accent3);padding:1px 8px;border-radius:20px;font-size:10px">${done.length}</span>
          <i class="fa-solid fa-chevron-down" id="done-arrow" style="margin-right:auto;font-size:10px;transition:transform .2s;${_doneCollapsed?'transform:rotate(-90deg)':''}"></i>
        </div>
      </td>
    </tr>
    <tbody id="done-tbody" style="${_doneCollapsed?'display:none':''}">
      ${done.map(makeRow).join('')}
    </tbody>` : '';

  el.innerHTML = `
  <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
    <button class="btn btn-primary btn-sm" onclick="openAddTaskModal(null)"><i class="fa-solid fa-plus"></i> مهمة جديدة</button>
  </div>
  <div class="card" style="padding:0;overflow:hidden">
    <table class="tasks-list-table">
      <thead><tr>
        <th style="width:28px"></th>
        <th>المهمة</th><th>الحالة</th><th>المُعيَّن</th>
        <th>الموعد</th><th>💬</th><th></th>
      </tr></thead>
      <tbody id="active-tbody">${activeHTML}</tbody>
      ${doneSectionHTML}
    </table>
  </div>`;
}

function _toggleDoneSection(){
  _doneCollapsed = !_doneCollapsed;
  const body  = document.getElementById('done-tbody');
  const arrow = document.getElementById('done-arrow');
  if(body)  body.style.display  = _doneCollapsed?'none':'';
  if(arrow) arrow.style.transform = _doneCollapsed?'rotate(-90deg)':'';
}

// ── List Drag ──
function _listDragStart(e, id){ _listDragId=id; e.currentTarget.classList.add('dragging'); e.dataTransfer.effectAllowed='move'; }
function _listDragEnd(e){ e.currentTarget.classList.remove('dragging'); document.querySelectorAll('.task-row').forEach(r=>{r.classList.remove('drag-over-top','drag-over-bot');}); }
function _listDragOver(e){
  e.preventDefault();
  const team = currentTeam(); if(!team) return;
  const tasks = team.tasks||[];
  const fromIdx = tasks.findIndex(t=>String(t.id)===String(_listDragId));
  const toId    = e.currentTarget.dataset.taskId;
  const toIdx   = tasks.findIndex(t=>String(t.id)===String(toId));
  document.querySelectorAll('.task-row').forEach(r=>r.classList.remove('drag-over-top','drag-over-bot'));
  if(toIdx>fromIdx) e.currentTarget.classList.add('drag-over-bot');
  else e.currentTarget.classList.add('drag-over-top');
}
function _listDrop(e, targetId){
  e.preventDefault();
  document.querySelectorAll('.task-row').forEach(r=>r.classList.remove('drag-over-top','drag-over-bot'));
  if(!_listDragId||String(_listDragId)===String(targetId)) return;
  const team = currentTeam(); if(!team) return;
  const fi = team.tasks.findIndex(t=>String(t.id)===String(_listDragId));
  const ti = team.tasks.findIndex(t=>String(t.id)===String(targetId));
  if(fi<0||ti<0) return;
  const [moved] = team.tasks.splice(fi,1);
  team.tasks.splice(ti,0,moved);
  saveLS(); syncToCloud(TS.currentTeamId);
  renderList();
  _listDragId=null;
}

// ══════════════════════════════════════════════════
//  TASK CRUD
// ══════════════════════════════════════════════════
function openAddTaskModal(colId){
  const team = currentTeam(); if(!team) return;
  document.getElementById('at-eid').value='';
  document.getElementById('at-col').value=colId||'todo';
  document.getElementById('at-title').value='';
  document.getElementById('at-desc').value='';
  document.getElementById('at-priority').value='med';
  document.getElementById('at-status').value=colId||'todo';
  document.getElementById('at-deadline').value='';
  document.getElementById('at-client').value='';
  document.getElementById('at-type').value='';
  document.getElementById('at-tags').value='';
  document.getElementById('at-modal-title').innerHTML='<i class="fa-solid fa-plus" style="color:var(--accent)"></i> مهمة جديدة';
  fillAssigneeDD('at-assignee');
  fillClientsDD('at-client');
  fillStatusDD('at-status', colId||'todo');
  openModal('modal-add-task');
  setTimeout(()=>document.getElementById('at-title')?.focus(),100);
}

function editTask(taskId){
  const team = currentTeam();
  const t = (team?.tasks||[]).find(x=>String(x.id)===String(taskId));
  if(!t) return;
  document.getElementById('at-eid').value=taskId;
  document.getElementById('at-title').value=t.title||'';
  document.getElementById('at-desc').value=t.desc||'';
  document.getElementById('at-priority').value=t.priority||'med';
  document.getElementById('at-deadline').value=t.deadline||'';
  document.getElementById('at-client').value=t.client||'';
  document.getElementById('at-type').value=t.type||'';
  document.getElementById('at-tags').value=(t.tags||[]).join(', ');
  document.getElementById('at-modal-title').innerHTML='<i class="fa-solid fa-pen" style="color:var(--accent)"></i> تعديل المهمة';
  fillAssigneeDD('at-assignee', t.assigneeId);
  fillClientsDD('at-client');
  fillStatusDD('at-status', t.status);
  openModal('modal-add-task');
}

function saveTask(){
  const team = currentTeam(); if(!team) return;
  const title = document.getElementById('at-title').value.trim();
  if(!title){ toast('<i class="fa-solid fa-triangle-exclamation" style="color:var(--accent4)"></i> أدخل عنوان المهمة'); return; }
  const eid = document.getElementById('at-eid').value;
  const assigneeId = document.getElementById('at-assignee').value||null;
  const tagsRaw = document.getElementById('at-tags').value;
  const tags = tagsRaw ? tagsRaw.split(',').map(s=>s.trim()).filter(Boolean) : [];
  const d = {
    title,
    desc:       document.getElementById('at-desc').value.trim(),
    priority:   document.getElementById('at-priority').value,
    status:     document.getElementById('at-status').value,
    assigneeId, tags,
    deadline:   document.getElementById('at-deadline').value,
    client:     document.getElementById('at-client').value.trim(),
    type:       document.getElementById('at-type').value.trim(),
    updatedAt:  new Date().toISOString(),
  };
  if(eid){
    const idx = team.tasks.findIndex(t=>String(t.id)===String(eid));
    if(idx>-1){
      d.id=eid; d.comments=team.tasks[idx].comments||[]; d.createdAt=team.tasks[idx].createdAt; d.steps=team.tasks[idx].steps||[];
      team.tasks[idx]=d;
    }
  } else {
    d.id=uid(); d.createdAt=new Date().toISOString(); d.comments=[]; d.steps=[];
    if(!team.tasks) team.tasks=[];
    team.tasks.push(d);
    // Notify assignee
    if(assigneeId&&assigneeId!=='me'){
      const m=(team.members||[]).find(x=>x.id===assigneeId);
      if(m) toast(`<i class="fa-solid fa-user-check" style="color:var(--accent3)"></i> تم تعيين المهمة لـ ${m.name}`);
    }
  }
  saveLS(); syncToCloud(TS.currentTeamId);
  closeModal('modal-add-task');
  if(TS.currentView==='board'||TS.boardMode==='kanban') renderBoard(); else renderList();
  toast('<i class="fa-solid fa-square-check" style="color:var(--accent3)"></i> تم حفظ المهمة');
}

function deleteTask(taskId){
  if(!confirm('حذف هذه المهمة نهائياً؟')) return;
  const team = currentTeam(); if(!team) return;
  team.tasks = (team.tasks||[]).filter(t=>String(t.id)!==String(taskId));
  saveLS(); syncToCloud(TS.currentTeamId);
  closeModal('modal-task-detail');
  if(TS.currentView==='board'||TS.boardMode==='kanban') renderBoard(); else renderList();
  toast('🗑️ تم حذف المهمة');
}

function changeTaskStatusInline(taskId, newStatus){
  const team = currentTeam();
  const t = (team?.tasks||[]).find(x=>String(x.id)===String(taskId));
  if(!t) return;
  t.status=newStatus; t.updatedAt=new Date().toISOString();
  if(newStatus==='done') t.done=true; else t.done=false;
  saveLS(); syncToCloud(TS.currentTeamId);
}

function changeTaskAssigneeInline(taskId, memberId){
  const team = currentTeam();
  const t = (team?.tasks||[]).find(x=>String(x.id)===String(taskId));
  if(!t) return;
  t.assigneeId = memberId||null; t.updatedAt=new Date().toISOString();
  saveLS(); syncToCloud(TS.currentTeamId);
  if(memberId){
    const m=(team.members||[]).find(x=>x.id===memberId);
    if(m) toast(`<i class="fa-solid fa-user-check" style="color:var(--accent3)"></i> تم تعيين المهمة لـ ${m.name}`);
  }
}

// ══════════════════════════════════════════════════
//  TASK DETAIL
// ══════════════════════════════════════════════════
function openTaskDetail(taskId){
  const team = currentTeam();
  const t = (team?.tasks||[]).find(x=>String(x.id)===String(taskId));
  if(!t) return;
  _currentTaskId = taskId;
  _mentionTaskId = taskId;

  const assignee = (team.members||[]).find(m=>m.id===t.assigneeId);
  const col = (team.columns||DEFAULT_COLS.map(c=>({...c}))).find(c=>c.id===t.status);
  const isDone = t.done||t.status==='done';
  const priColor = {high:'var(--accent4)',med:'var(--accent2)',low:'var(--accent3)'}[t.priority||'med'];
  const priLabel = {high:'عالية 🔴',med:'متوسطة 🟡',low:'منخفضة 🟢'}[t.priority||'med'];

  // Status options
  const statusOpts = (team.columns||DEFAULT_COLS.map(c=>({...c}))).map(c=>
    `<option value="${c.id}" ${t.status===c.id?'selected':''}>${c.label}</option>`
  ).join('');

  // Assignee options
  const assigneeOpts = `<option value="">— غير مُعيَّن —</option>` +
    (team.members||[]).map(m=>`<option value="${m.id}" ${t.assigneeId===m.id?'selected':''}>${esc(m.name)}</option>`).join('');

  // Steps
  const stepsHTML = (t.steps||[]).length ? `
    <div style="margin-top:14px">
      <div style="font-size:11px;font-weight:800;color:var(--text3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">خطوات التنفيذ</div>
      ${(t.steps||[]).map((s,i)=>`
      <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border)">
        <div onclick="toggleStep('${taskId}',${i})" style="width:20px;height:20px;border-radius:50%;border:2px solid ${s.done?'var(--accent3)':'var(--border)'};background:${s.done?'var(--accent3)':'transparent'};cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:.15s">
          ${s.done?'<i class="fa-solid fa-check" style="font-size:9px;color:#fff"></i>':''}
        </div>
        <span style="font-size:12px;${s.done?'text-decoration:line-through;color:var(--text3)':''}">${esc(s.text||s.title||'خطوة')}</span>
      </div>`).join('')}
    </div>` : '';

  // Comments
  const commentsHTML = (t.comments||[]).map(c=>{
    const m = (team.members||[]).find(x=>x.id===c.authorId);
    const name = m?.name||c.authorName||'مجهول';
    const text = esc(c.text||'').replace(/@(\S+)/g,'<span class="mention">@$1</span>');
    return `
    <div class="comment-item">
      <div class="comment-avatar" style="background:${m?.color||'var(--surface3)'}">${name[0]}</div>
      <div class="comment-bubble">
        <div class="comment-author">${esc(name)}</div>
        <div class="comment-text">${text}</div>
        <div class="comment-time">${c.createdAt?new Date(c.createdAt).toLocaleString('ar-EG'):''}</div>
      </div>
    </div>`;
  }).join('');

  document.getElementById('td-modal-title').innerHTML = `
    <span style="font-size:15px;font-weight:900">${esc(t.title)}</span>
    <span style="margin-right:8px;font-size:11px;padding:2px 10px;border-radius:20px;background:${col?.color||'var(--text3)'}22;color:${col?.color||'var(--text3)'}">${col?.label||t.status}</span>`;

  document.getElementById('td-body').innerHTML = `
  <div class="td-two-col">
    <!-- Main -->
    <div>
      ${t.desc?`<div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--r2);padding:13px;font-size:13px;line-height:1.7;color:var(--text2);margin-bottom:14px">${esc(t.desc)}</div>`:''}

      <!-- Quick controls -->
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;align-items:center">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:11px;color:var(--text3);font-weight:700">الحالة:</span>
          <select class="form-select" style="padding:5px 10px;font-size:12px;width:auto" onchange="changeTaskStatusInline('${t.id}',this.value)">${statusOpts}</select>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:11px;color:var(--text3);font-weight:700">المُعيَّن:</span>
          <select class="form-select" style="padding:5px 10px;font-size:12px;width:auto" onchange="changeTaskAssigneeInline('${t.id}',this.value)">${assigneeOpts}</select>
        </div>
      </div>

      <!-- Tags -->
      ${(t.tags||[]).length||t.type?`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
        ${(t.tags||[]).map(tg=>`<span class="tag-pill">${esc(tg)}</span>`).join('')}
        ${t.type?`<span class="tag-pill" style="background:rgba(124,111,247,.1);color:var(--accent)">${esc(t.type)}</span>`:''}
      </div>`:''}

      ${stepsHTML}

      <!-- Comments -->
      <div style="font-size:12px;font-weight:800;color:var(--text2);margin:16px 0 10px">
        <i class="fa-solid fa-comments" style="color:var(--accent)"></i> التعليقات
        ${(t.comments||[]).length?`<span style="background:rgba(124,111,247,.12);color:var(--accent);padding:1px 8px;border-radius:20px;font-size:10px;margin-right:6px">${(t.comments||[]).length}</span>`:''}
      </div>
      <div id="td-comments-list">
        ${commentsHTML||`<div style="font-size:12px;color:var(--text3);text-align:center;padding:18px;background:var(--surface2);border-radius:var(--r2)">
          لا تعليقات بعد — كن أول من يعلق!
        </div>`}
      </div>
      <div class="comment-input-wrap" style="position:relative">
        <textarea id="td-comment-input" rows="2" placeholder="اكتب تعليقاً... استخدم @ لمنشن أحد الأعضاء" oninput="handleMentionInput(this)"></textarea>
        <div class="mention-dd" id="mention-dd"></div>
        <button class="btn btn-primary btn-sm comment-send-btn" onclick="submitComment('${t.id}')">
          <i class="fa-solid fa-paper-plane"></i> إرسال
        </button>
      </div>
    </div>

    <!-- Sidebar -->
    <div>
      <div class="td-sidebar-box">
        <div class="td-sidebar-label">تفاصيل</div>
        <div style="display:flex;flex-direction:column;gap:9px;font-size:12px">
          <div style="display:flex;justify-content:space-between">
            <span style="color:var(--text3)">الأولوية</span>
            <span style="color:${priColor};font-weight:700">${priLabel}</span>
          </div>
          ${t.deadline?`<div style="display:flex;justify-content:space-between">
            <span style="color:var(--text3)">الموعد</span>
            <span style="font-weight:700;color:${isLate(t.deadline,isDone)?'var(--accent4)':'var(--text)'}">${t.deadline}</span>
          </div>`:''}
          ${t.client?`<div style="display:flex;justify-content:space-between">
            <span style="color:var(--text3)">العميل</span>
            <span style="font-weight:700">${esc(t.client)}</span>
          </div>`:''}
          <div style="display:flex;justify-content:space-between">
            <span style="color:var(--text3)">أُنشئت</span>
            <span style="font-size:10px">${t.createdAt?fmtDate(t.createdAt.split('T')[0]):'—'}</span>
          </div>
        </div>
      </div>
      ${assignee?`
      <div class="td-sidebar-box">
        <div class="td-sidebar-label">المُعيَّن</div>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:36px;height:36px;border-radius:var(--r1);background:${assignee.color||'var(--accent)'};color:#fff;font-weight:800;font-size:15px;display:flex;align-items:center;justify-content:center">${assignee.name[0]}</div>
          <div>
            <div style="font-weight:800;font-size:13px">${esc(assignee.name)}</div>
            <div style="font-size:10px;color:var(--text3)">${esc(assignee.title||'عضو')}</div>
          </div>
        </div>
      </div>` : ''}
      <div style="display:flex;gap:6px">
        <button class="btn btn-ghost btn-sm" style="flex:1;justify-content:center" onclick="editTask('${t.id}');closeModal('modal-task-detail')">
          <i class="fa-solid fa-pen"></i> تعديل
        </button>
        <button class="btn btn-danger btn-sm" onclick="deleteTask('${t.id}')">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>
  </div>`;

  openModal('modal-task-detail');
}

function toggleStep(taskId, stepIdx){
  const team = currentTeam();
  const t = (team?.tasks||[]).find(x=>String(x.id)===String(taskId));
  if(!t||!t.steps) return;
  t.steps[stepIdx].done = !t.steps[stepIdx].done;
  saveLS(); syncToCloud(TS.currentTeamId);
  openTaskDetail(taskId);
}

// ══════════════════════════════════════════════════
//  COMMENTS & MENTIONS
// ══════════════════════════════════════════════════
function submitComment(taskId){
  const team = currentTeam();
  const t = (team?.tasks||[]).find(x=>String(x.id)===String(taskId));
  if(!t) return;
  const inp = document.getElementById('td-comment-input');
  const text = inp?.value?.trim();
  if(!text) return;
  if(!t.comments) t.comments=[];
  t.comments.push({
    id: uid(), authorId:'me', authorName: TS.me.name||'أنا',
    text, createdAt: new Date().toISOString()
  });
  saveLS(); syncToCloud(TS.currentTeamId);
  inp.value='';
  // Refresh comments in the modal without closing
  openTaskDetail(taskId);
  toast('💬 تم الإرسال');
}

function handleMentionInput(el){
  const text   = el.value;
  const cursor = el.selectionStart;
  const before = text.slice(0, cursor);
  const match  = before.match(/@(\w*)$/);
  const dd     = document.getElementById('mention-dd');
  if(!dd) return;
  if(match){
    const q = match[1].toLowerCase();
    const team = currentTeam();
    const hits = (team?.members||[]).filter(m=>m.name.toLowerCase().includes(q));
    if(hits.length){
      dd.innerHTML = hits.map(m=>`
        <div class="mention-dd-item" onclick="_insertMention(document.getElementById('td-comment-input'),'${esc(m.name)}')">
          <div style="width:22px;height:22px;border-radius:50%;background:${m.color||'var(--accent)'};color:#fff;font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center">${m.name[0]}</div>
          ${esc(m.name)}
        </div>`).join('');
      dd.classList.add('open');
    } else { dd.classList.remove('open'); }
  } else { dd.classList.remove('open'); }
}

function _insertMention(el, name){
  if(!el) return;
  const text   = el.value;
  const cursor = el.selectionStart;
  const before = text.slice(0, cursor).replace(/@\w*$/, '@'+name+' ');
  el.value = before + text.slice(cursor);
  const dd = document.getElementById('mention-dd');
  if(dd) dd.classList.remove('open');
  el.focus();
}

// ══════════════════════════════════════════════════
//  MEMBERS
// ══════════════════════════════════════════════════
function renderMembers(){
  const team = currentTeam();
  const el   = document.querySelector('[data-view="members"]');
  if(!el||!team){ if(el)el.innerHTML=''; return; }
  const members = team.members||[];

  el.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
    <div>
      <div style="font-size:18px;font-weight:900">الأعضاء (${members.length})</div>
      <div style="font-size:12px;color:var(--text3);margin-top:2px">إدارة أعضاء الفريق وصلاحياتهم</div>
    </div>
    <button class="btn btn-primary" onclick="openModal('modal-add-member')">
      <i class="fa-solid fa-user-plus"></i> إضافة عضو
    </button>
  </div>
  <div class="members-grid">
    ${members.map((m,i)=>{
      const taskCount = (team.tasks||[]).filter(t=>t.assigneeId===m.id).length;
      const doneCount = (team.tasks||[]).filter(t=>t.assigneeId===m.id&&(t.done||t.status==='done')).length;
      const roleClass = {admin:'role-admin',member:'role-member',viewer:'role-viewer'}[m.role||'member'];
      const roleLabel = {admin:'👑 مشرف',member:'👤 عضو',viewer:'👁 مشاهد'}[m.role||'member'];
      return `
      <div class="member-card">
        <div class="member-avatar" style="background:${m.color||MEMBER_COLORS[i%MEMBER_COLORS.length]}">${m.name[0]}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:7px;margin-bottom:3px;flex-wrap:wrap">
            <span style="font-size:14px;font-weight:800">${esc(m.name)}</span>
            <span class="role-pill ${roleClass}">${roleLabel}</span>
            ${m.id==='me'?'<span class="badge" style="background:rgba(79,209,165,.12);color:var(--accent3)">أنت</span>':''}
          </div>
          <div style="font-size:11px;color:var(--text3);margin-bottom:5px">${esc(m.title||'')}${m.email?' · '+esc(m.email):''}</div>
          <div style="display:flex;gap:12px;font-size:10px;color:var(--text3)">
            <span><i class="fa-solid fa-clipboard-list"></i> ${taskCount} مهمة</span>
            <span><i class="fa-solid fa-check" style="color:var(--accent3)"></i> ${doneCount} منجزة</span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
          <select class="form-select" style="padding:4px 8px;font-size:11px;width:100px" onchange="changeMemberRole('${m.id}',this.value)">
            <option value="admin" ${m.role==='admin'?'selected':''}>مشرف</option>
            <option value="member" ${!m.role||m.role==='member'?'selected':''}>عضو</option>
            <option value="viewer" ${m.role==='viewer'?'selected':''}>مشاهد</option>
          </select>
          ${m.id!=='me'?`<button class="btn btn-danger btn-xs" onclick="removeMember('${m.id}')"><i class="fa-solid fa-user-minus"></i></button>`:''}
        </div>
      </div>`;
    }).join('')}
  </div>

  <!-- Permissions table -->
  <div style="margin-top:24px">
    <div class="section-divider">الصلاحيات</div>
    <div class="card" style="padding:0;overflow:hidden">
      <table class="perm-table">
        <thead><tr>
          <th>الإجراء</th>
          <th>👑 مشرف</th><th>👤 عضو</th><th>👁 مشاهد</th>
        </tr></thead>
        <tbody>
          ${[
            ['إضافة / تعديل مهام','✓','✓','✗'],
            ['حذف مهام','✓','✗','✗'],
            ['تعيين أعضاء','✓','✓','✗'],
            ['التعليق والمنشن','✓','✓','✗'],
            ['تعديل حالة المهمة','✓','✓','✗'],
            ['إدارة الفريق والإعدادات','✓','✗','✗'],
            ['إضافة أعضاء جدد','✓','✗','✗'],
            ['عرض البورد والمهام','✓','✓','✓'],
          ].map(([action,a,m,v])=>`
          <tr>
            <td>${action}</td>
            <td><span class="${a==='✓'?'perm-check':'perm-cross'}">${a}</span></td>
            <td><span class="${m==='✓'?'perm-check':'perm-cross'}">${m}</span></td>
            <td><span class="${v==='✓'?'perm-check':'perm-cross'}">${v}</span></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

// ── اختيار صلاحية العضو ──
const ROLE_PERMS = {
  admin: [
    {ok:true,  text:'إضافة وتعديل وحذف المهام'},
    {ok:true,  text:'تعيين المهام للأعضاء'},
    {ok:true,  text:'التعليق والمنشن'},
    {ok:true,  text:'تغيير حالات المهام'},
    {ok:true,  text:'إضافة وإزالة أعضاء'},
    {ok:true,  text:'تعديل إعدادات الفريق'},
    {ok:true,  text:'حذف الفريق'},
    {ok:true,  text:'إدارة الأعمدة والأقسام'},
  ],
  member: [
    {ok:true,  text:'إضافة وتعديل المهام'},
    {ok:true,  text:'تعيين المهام للأعضاء'},
    {ok:true,  text:'التعليق والمنشن'},
    {ok:true,  text:'تغيير حالات المهام'},
    {ok:false, text:'إضافة أو إزالة أعضاء'},
    {ok:false, text:'تعديل إعدادات الفريق'},
    {ok:false, text:'حذف الفريق'},
    {ok:false, text:'إدارة الأعمدة والأقسام'},
  ],
  viewer: [
    {ok:false, text:'إضافة أو تعديل المهام'},
    {ok:false, text:'تعيين المهام'},
    {ok:false, text:'التعليق والمنشن'},
    {ok:false, text:'تغيير حالات المهام'},
    {ok:false, text:'إضافة أو إزالة أعضاء'},
    {ok:false, text:'تعديل إعدادات الفريق'},
    {ok:false, text:'حذف الفريق'},
    {ok:true,  text:'عرض البورد والمهام فقط'},
  ]
};

function _selectMemberRole(role){
  document.getElementById('am-role').value = role;
  document.querySelectorAll('.am-role-card').forEach(c=>{
    const isSelected = c.dataset.role === role;
    c.style.border = isSelected ? '2px solid var(--accent)' : '2px solid var(--border)';
    c.style.background = isSelected ? 'rgba(124,111,247,.06)' : 'transparent';
  });
  // تحديث جدول الصلاحيات
  const perms = ROLE_PERMS[role]||[];
  const el = document.getElementById('am-perm-list');
  if(el) el.innerHTML = perms.map(p=>`
    <div style="display:flex;align-items:center;gap:7px;color:${p.ok?'var(--text2)':'var(--text3)'}">
      <i class="fa-solid fa-${p.ok?'check':'xmark'}" style="color:${p.ok?'var(--accent3)':'var(--text3)'};width:14px;font-size:11px"></i>
      ${p.text}
    </div>`).join('');
}

function openAddMemberModal(){
  const team = currentTeam();
  ['am-name','am-email','am-title','am-phone','am-salary'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  // reset role to member
  _selectMemberRole('member');
  document.getElementById('am-hr-row').style.display = team?.type==='company'?'':'none';
  openModal('modal-add-member');
  setTimeout(()=>document.getElementById('am-name')?.focus(), 100);
}

function saveMember(){
  const team = currentTeam(); if(!team) return;
  const name = document.getElementById('am-name').value.trim();
  if(!name){ toast('أدخل اسم العضو'); return; }
  const i = team.members.length;
  const email = document.getElementById('am-email').value.trim().toLowerCase();
  const newMember = {
    id: uid(), name, email,
    role:  document.getElementById('am-role').value||'member',
    title: document.getElementById('am-title').value.trim(),
    phone: document.getElementById('am-phone').value.trim(),
    salary:+(document.getElementById('am-salary')?.value||0),
    color: MEMBER_COLORS[i%MEMBER_COLORS.length],
    joinedAt: new Date().toISOString()
  };
  team.members.push(newMember);
  document.getElementById('sb-members-badge').textContent = team.members.length;
  saveLS(); syncToCloud(TS.currentTeamId);

  // ── إشعار للعضو الجديد عبر Supabase ──
  if(email && TS.me.supaId && typeof supa !== 'undefined'){
    _notifyNewMember(newMember, team);
  }

  // ── إشعار محلي في _companyNotifications (يُرسل للعضو لو فتح نفس الجهاز) ──
  try {
    const raw = localStorage.getItem('ordo_teams_v2');
    if(raw){
      const tsData = JSON.parse(raw);
      if(!tsData._companyNotifications) tsData._companyNotifications = {};
      if(!tsData._companyNotifications[email]) tsData._companyNotifications[email]=[];
      tsData._companyNotifications[email].push({
        id: 'added_'+Date.now(),
        type: 'team_added',
        title: `👥 تمت إضافتك لفريق "${team.name}"`,
        body: `تمت إضافتك كـ ${newMember.role} في "${team.name}" بواسطة ${TS.me.name||'مشرف'}`,
        teamId: team.id,
        teamName: team.name,
        ownerName: TS.me.name||'مشرف',
        memberRole: newMember.role,
        createdAt: new Date().toISOString(),
        read: false
      });
      localStorage.setItem('ordo_teams_v2', JSON.stringify(tsData));
    }
  }catch(e){}

  closeModal('modal-add-member');
  renderMembers();
  toast(`✅ تم إضافة ${name}${email?' — سيصله إشعار':''}`);
}

async function _notifyNewMember(member, team){
  try {
    const email = (member.email||'').toLowerCase().trim();
    if(!email) return;
    // ابحث عن user_id بالإيميل
    let targetUserId = null;
    try {
      const {data:rpcId} = await supa.rpc('get_user_id_by_email',{p_email:email}).catch(()=>({data:null}));
      if(rpcId) targetUserId=rpcId;
    }catch(e){}
    if(!targetUserId){
      try {
        const {data:pr} = await supa.from('profiles').select('id').eq('email',email).maybeSingle().catch(()=>({data:null}));
        if(pr) targetUserId=pr.id;
      }catch(e){}
    }
    if(!targetUserId){
      // حاول تبحث في studio_data
      const {data:rows} = await supa.from('studio_data').select('user_id,data').catch(()=>({data:null}));
      if(rows){
        for(const row of rows){
          try {
            const rd = typeof row.data==='string'?JSON.parse(row.data):row.data;
            if(rd?.settings?.email && rd.settings.email.toLowerCase().trim()===email){ targetUserId=row.user_id; break; }
          }catch(e){}
        }
      }
    }
    if(!targetUserId) return;

    // بعّت الإشعار
    await supa.from('user_notifications').insert([{
      user_id: targetUserId,
      title: `تمت إضافتك لفريق شركة!`,
      body: `تمت إضافتك كـ ${member.role||'عضو'} في شركة "${team.name}" بواسطة ${TS.me.name||'مشرف'}`,
      type: 'team_added',
      data: JSON.stringify({
        teamId: team.id,
        teamName: team.name,
        memberRole: member.role||'عضو',
        ownerName: TS.me.name||'مشرف',
        ownerUserId: TS.me.supaId,
        isCompanyTeam: true,
        teamUrl: window.location.href.split('?')[0]
      }),
      read: false,
      created_at: new Date().toISOString()
    }]).catch(()=>{});

    // أيضاً أرسل في studio_data fallback
    const {data:tgtRow} = await supa.from('studio_data').select('data').eq('user_id',targetUserId).maybeSingle().catch(()=>({data:null}));
    if(tgtRow?.data){
      let ud = typeof tgtRow.data==='string'?JSON.parse(tgtRow.data):tgtRow.data;
      ud._pending_notifications=ud._pending_notifications||[];
      const already=ud._pending_notifications.find(n=>n.type==='team_added'&&n.teamId===team.id);
      if(!already){
        ud._pending_notifications.push({
          id: Date.now()+'_cta',
          title: `👥 تمت إضافتك لشركة "${team.name}"`,
          body: `تمت إضافتك كـ ${member.role||'عضو'} بواسطة ${TS.me.name||'مشرف'}`,
          type: 'team_added',
          teamId: team.id,
          teamName: team.name,
          ownerName: TS.me.name||'مشرف',
          ownerUserId: TS.me.supaId,
          memberRole: member.role||'عضو',
          isCompanyTeam: true,
          teamUrl: window.location.href.split('?')[0],
          created_at: new Date().toISOString(),
          read: false
        });
        await supa.from('studio_data').update({data:JSON.stringify(ud),updated_at:new Date().toISOString()}).eq('user_id',targetUserId).catch(()=>{});
      }
    }
  }catch(e){ console.warn('_notifyNewMember:', e); }
}

function removeMember(memberId){
  if(!confirm('إزالة هذا العضو من الفريق؟')) return;
  const team = currentTeam(); if(!team) return;
  team.members = team.members.filter(m=>m.id!==memberId);
  saveLS(); syncToCloud(TS.currentTeamId);
  renderMembers();
  toast('تم إزالة العضو');
}

function changeMemberRole(memberId, role){
  const team = currentTeam(); if(!team) return;
  const m = team.members.find(x=>x.id===memberId);
  if(m){ m.role=role; saveLS(); toast(`تم تغيير الصلاحية إلى ${role}`); }
}

// ══════════════════════════════════════════════════
//  CLIENTS
// ══════════════════════════════════════════════════
function renderClients(){
  const team = currentTeam();
  const el   = document.querySelector('[data-view="clients"]');
  if(!el||!team){ if(el)el.innerHTML=''; return; }
  const clients = team.clients||[];

  el.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
    <div style="font-size:18px;font-weight:900">العملاء (${clients.length})</div>
    <button class="btn btn-primary" onclick="openModal('modal-add-client')"><i class="fa-solid fa-plus"></i> عميل جديد</button>
  </div>
  ${!clients.length?`<div class="empty-screen" style="min-height:40vh">
    <div class="empty-screen-icon">📋</div>
    <div class="empty-screen-title">لا يوجد عملاء بعد</div>
    <button class="btn btn-primary" onclick="openModal('modal-add-client')"><i class="fa-solid fa-plus"></i> إضافة عميل</button>
  </div>`:
  `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">
    ${clients.map(c=>{
      const tasks = (team.tasks||[]).filter(t=>t.client===c.name);
      return `
      <div class="card" style="padding:16px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
          <div style="width:42px;height:42px;border-radius:var(--r1);background:var(--accent);color:#fff;font-size:17px;font-weight:800;display:flex;align-items:center;justify-content:center">${c.name[0]}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:800;font-size:14px">${esc(c.name)}</div>
            <div style="font-size:11px;color:var(--text3)">${esc(c.type||'—')}</div>
          </div>
          <button class="btn btn-icon-sm btn-danger" onclick="deleteClient('${c.id}')" title="حذف"><i class="fa-solid fa-trash" style="font-size:11px"></i></button>
        </div>
        <div style="font-size:11px;color:var(--text3);display:flex;flex-direction:column;gap:4px">
          ${c.phone?`<span><i class="fa-solid fa-phone"></i> ${esc(c.phone)}</span>`:''}
          ${c.email?`<span><i class="fa-solid fa-envelope"></i> ${esc(c.email)}</span>`:''}
          <span><i class="fa-solid fa-clipboard-list"></i> ${tasks.length} مهمة مرتبطة</span>
        </div>
      </div>`;
    }).join('')}
  </div>`}`;
}

function saveClient(){
  const team = currentTeam(); if(!team) return;
  const name = document.getElementById('cl-name').value.trim();
  if(!name){ toast('أدخل اسم العميل'); return; }
  if(!team.clients) team.clients=[];
  team.clients.push({
    id:uid(), name,
    type:  document.getElementById('cl-type').value,
    phone: document.getElementById('cl-phone').value.trim(),
    email: document.getElementById('cl-email').value.trim(),
    notes: document.getElementById('cl-notes').value.trim(),
    createdAt: new Date().toISOString()
  });
  saveLS(); syncToCloud(TS.currentTeamId);
  closeModal('modal-add-client');
  renderClients();
  toast('✅ تم إضافة العميل');
}

function deleteClient(id){
  if(!confirm('حذف هذا العميل؟')) return;
  const team = currentTeam(); if(!team) return;
  team.clients=(team.clients||[]).filter(c=>c.id!==id);
  saveLS(); syncToCloud(TS.currentTeamId); renderClients();
}

// ══════════════════════════════════════════════════
//  DEPARTMENTS (Company)
// ══════════════════════════════════════════════════
function renderDepts(){
  const team = currentTeam();
  const el   = document.querySelector('[data-view="depts"]');
  if(!el||!team){ if(el)el.innerHTML=''; return; }
  const depts = team.departments||[];
  el.innerHTML = `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">
    <div style="font-size:18px;font-weight:900">الأقسام (${depts.length})</div>
    <button class="btn btn-primary" onclick="addDept()"><i class="fa-solid fa-plus"></i> قسم جديد</button>
  </div>
  ${!depts.length?`<div class="empty-screen" style="min-height:40vh"><div class="empty-screen-icon">🏢</div><div class="empty-screen-title">لا توجد أقسام بعد</div><button class="btn btn-primary" onclick="addDept()"><i class="fa-solid fa-plus"></i> إضافة قسم</button></div>`:
  `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px">
    ${depts.map(d=>{
      const ms = (team.members||[]).filter(m=>m.departmentId===d.id);
      return `
      <div class="dept-card" style="border-color:${d.color||'var(--border)'}">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          <div style="width:38px;height:38px;border-radius:var(--r1);background:${d.color||'var(--accent)'};color:#fff;font-size:18px;display:flex;align-items:center;justify-content:center">${d.emoji||'📂'}</div>
          <div style="flex:1">
            <div style="font-weight:800">${esc(d.name)}</div>
            <div style="font-size:11px;color:var(--text3)">${ms.length} عضو</div>
          </div>
          <button class="btn btn-icon-sm btn-danger" onclick="deleteDept('${d.id}')"><i class="fa-solid fa-trash" style="font-size:11px"></i></button>
        </div>
        <div style="display:flex">${ms.slice(0,5).map(m=>`<div style="width:24px;height:24px;border-radius:50%;background:${m.color||'var(--accent)'};color:#fff;font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;border:2px solid var(--surface);margin-left:-6px">${m.name[0]}</div>`).join('')}</div>
      </div>`;
    }).join('')}
  </div>`}`;
}

function addDept(){
  const name = prompt('اسم القسم:'); if(!name) return;
  const team = currentTeam(); if(!team) return;
  if(!team.departments) team.departments=[];
  const colors=['#7c6ff7','#f7c948','#4fd1a5','#f76f7c','#64b5f6'];
  team.departments.push({id:uid(),name,color:colors[team.departments.length%colors.length],emoji:'📂'});
  saveLS(); renderDepts();
}

function deleteDept(id){
  if(!confirm('حذف هذا القسم؟')) return;
  const team=currentTeam(); if(!team) return;
  team.departments=(team.departments||[]).filter(d=>d.id!==id);
  saveLS(); renderDepts();
}

// ══════════════════════════════════════════════════
//  HR
// ══════════════════════════════════════════════════
function renderHR(){
  const team = currentTeam();
  const el   = document.querySelector('[data-view="hr"]');
  if(!el||!team){ if(el)el.innerHTML=''; return; }
  const members = (team.members||[]).filter(m=>m.id!=='me');
  el.innerHTML = `
  <div style="font-size:18px;font-weight:900;margin-bottom:18px">الموارد البشرية</div>
  ${!members.length?`<div class="empty-screen" style="min-height:40vh"><div class="empty-screen-icon">👤</div><div class="empty-screen-title">لا يوجد موظفون</div></div>`:
  `<div style="display:flex;flex-direction:column;gap:10px">
    ${members.map(m=>{
      const tasks = (team.tasks||[]).filter(t=>t.assigneeId===m.id).length;
      return `
      <div class="card" style="display:flex;align-items:center;gap:14px">
        <div style="width:44px;height:44px;border-radius:var(--r1);background:${m.color||'var(--accent)'};color:#fff;font-weight:800;font-size:18px;display:flex;align-items:center;justify-content:center;flex-shrink:0">${m.name[0]}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:800;font-size:14px">${esc(m.name)}</div>
          <div style="font-size:11px;color:var(--text3)">${esc(m.title||'—')}${m.email?' · '+esc(m.email):''}</div>
          ${m.phone?`<div style="font-size:10px;color:var(--text3)"><i class="fa-solid fa-phone"></i> ${esc(m.phone)}</div>`:''}
        </div>
        <div style="text-align:center;padding:0 12px">
          <div style="font-size:16px;font-weight:900;color:var(--accent3)">${m.salary?m.salary.toLocaleString()+' ج':'—'}</div>
          <div style="font-size:10px;color:var(--text3)">راتب/شهر</div>
        </div>
        <div style="text-align:center;padding:0 8px">
          <div style="font-size:16px;font-weight:900;color:var(--accent)">${tasks}</div>
          <div style="font-size:10px;color:var(--text3)">مهمة</div>
        </div>
        <div style="font-size:10px;color:var(--text3);text-align:left">
          انضم:<br>${m.joinedAt?fmtDate(m.joinedAt.split('T')[0]):'—'}
        </div>
      </div>`;
    }).join('')}
  </div>`}`;
}

// ══════════════════════════════════════════════════
//  SETTINGS
// ══════════════════════════════════════════════════
function renderSettings(){
  const team = currentTeam();
  const el   = document.querySelector('[data-view="settings"]');
  if(!el||!team){ if(el)el.innerHTML=''; return; }
  const cols = team.columns||DEFAULT_COLS.map(c=>({...c}));

  el.innerHTML = `
  <div style="font-size:18px;font-weight:900;margin-bottom:18px">إعدادات الفريق</div>
  <div style="max-width:500px;display:flex;flex-direction:column;gap:14px">
    <!-- Info -->
    <div class="card">
      <div style="font-size:13px;font-weight:800;margin-bottom:14px">معلومات الفريق</div>
      <div class="form-group">
        <label class="form-label">الاسم</label>
        <input class="form-input" id="ts-name" value="${esc(team.name)}">
      </div>
      <div class="form-group">
        <label class="form-label">الوصف</label>
        <input class="form-input" id="ts-desc" value="${esc(team.desc||'')}">
      </div>
      <button class="btn btn-primary btn-sm" onclick="saveTeamSettings()"><i class="fa-solid fa-floppy-disk"></i> حفظ</button>
    </div>
    <!-- Columns -->
    <div class="card">
      <div style="font-size:13px;font-weight:800;margin-bottom:12px">إدارة الأعمدة</div>
      ${cols.map(c=>`
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <div style="width:10px;height:10px;border-radius:50%;background:${c.color};flex-shrink:0"></div>
        <span style="font-size:13px;flex:1">${esc(c.label)}</span>
        <button class="btn btn-xs btn-danger" onclick="deleteColumn('${c.id}')"><i class="fa-solid fa-xmark"></i></button>
      </div>`).join('')}
      <button class="btn btn-ghost btn-sm" style="margin-top:6px" onclick="addColumn()"><i class="fa-solid fa-plus"></i> عمود جديد</button>
    </div>
    <!-- Danger -->
    <div class="card" style="border-color:rgba(247,107,124,.25);background:rgba(247,107,124,.04)">
      <div style="font-size:13px;font-weight:800;color:var(--accent4);margin-bottom:8px">منطقة الخطر</div>
      <button class="btn btn-danger" onclick="deleteTeam('${team.id}')"><i class="fa-solid fa-trash"></i> حذف الفريق نهائياً</button>
    </div>
  </div>`;
}

function saveTeamSettings(){
  const team = currentTeam(); if(!team) return;
  const name = document.getElementById('ts-name').value.trim();
  if(!name){ toast('أدخل اسم'); return; }
  team.name = name;
  team.desc = document.getElementById('ts-desc').value.trim();
  saveLS(); updateSidebar(team);
  document.getElementById('topbar-title').textContent=name;
  toast('✅ تم الحفظ');
}

function addColumn(){
  const name = prompt('اسم العمود:'); if(!name) return;
  const team = currentTeam(); if(!team) return;
  if(!team.columns) team.columns=[...DEFAULT_COLS];
  const colors=['#606080','#64b5f6','#7c6ff7','#f7c948','#4fd1a5','#ff8a65'];
  team.columns.push({id:uid(),label:name,color:colors[team.columns.length%colors.length]});
  saveLS(); if(TS.currentView==='board') renderBoard(); else renderSettings();
}

function deleteColumn(colId){
  const team=currentTeam(); if(!team) return;
  const count=(team.tasks||[]).filter(t=>t.status===colId).length;
  if(count&&!confirm(`هذا العمود فيه ${count} مهمة. تأكيد الحذف؟`)) return;
  team.columns=(team.columns||[]).filter(c=>c.id!==colId);
  saveLS(); if(TS.currentView==='board') renderBoard(); else renderSettings();
}

// ══════════════════════════════════════════════════
//  TEAM CRUD
// ══════════════════════════════════════════════════
function openCreateTeamModal(){
  _newTeamColor=TEAM_COLORS[0]; _newTeamType='team';
  ['ct-name','ct-desc','ct-emoji'].forEach(id=>{ const el=document.getElementById(id); if(el)el.value=''; });
  // Reset type cards
  document.querySelectorAll('.type-card').forEach(c=>c.classList.toggle('active',c.dataset.type==='team'));
  document.getElementById('ct-company-extras').style.display='none';
  // Color swatches
  document.querySelectorAll('.color-swatch').forEach(s=>s.classList.toggle('active',s.dataset.color===TEAM_COLORS[0]));
  openModal('modal-create-team');
}

function selectNewTeamType(type){
  _newTeamType=type;
  document.querySelectorAll('.type-card').forEach(c=>c.classList.toggle('active',c.dataset.type===type));
  document.getElementById('ct-company-extras').style.display=type==='company'?'block':'none';
  document.getElementById('am-hr-row').style.display=type==='company'?'':'none';
}

function selectNewTeamColor(c){
  _newTeamColor=c;
  document.querySelectorAll('.color-swatch').forEach(s=>s.classList.toggle('active',s.dataset.color===c));
}

function saveNewTeam(){
  const name = document.getElementById('ct-name').value.trim();
  if(!name){ toast('أدخل اسم الفريق'); return; }
  const team = {
    id: uid(), name,
    desc:    document.getElementById('ct-desc').value.trim(),
    type:    _newTeamType,
    color:   _newTeamColor,
    emoji:   document.getElementById('ct-emoji').value.trim() || (_newTeamType==='company'?'🏢':'👥'),
    members: [{id:'me', name:TS.me.name||'أنا', email:TS.me.email||'', role:'admin', title:'صاحب الفريق', color:_newTeamColor, joinedAt:new Date().toISOString()}],
    tasks:   [],
    columns: DEFAULT_COLS.map(c=>({...c})),
    clients: [],
    departments: [],
    createdAt: new Date().toISOString()
  };
  TS.teams.push(team);
  saveLS(); syncToCloud(team.id);
  closeModal('modal-create-team');
  toast(`✅ تم إنشاء "${name}"!`);
  openTeam(team.id);
}

function deleteTeam(id){
  if(!confirm('حذف هذا الفريق نهائياً؟ لا يمكن التراجع.')) return;
  TS.teams=TS.teams.filter(t=>t.id!==id);
  if(TS.currentTeamId===id) TS.currentTeamId=null;
  saveLS(); showTeamsList();
  toast('تم حذف الفريق');
}

// ══════════════════════════════════════════════════
//  SHARE
// ══════════════════════════════════════════════════
function openShareModal(){
  const team=currentTeam(); if(!team) return;

  // ── أنشئ رابط يحتوي على بيانات الفريق الأساسية مشفّرة ──
  // هكذا الـ join يشتغل حتى لو Supabase RLS مانع البحث
  const teamMeta = {
    id:    team.id,
    name:  team.name,
    type:  team.type,
    color: team.color,
    emoji: team.emoji,
    ownerId:   TS.me.supaId||'',
    ownerName: TS.me.name||'مشرف',
    ownerEmail:TS.me.email||'',
    columns:   (team.columns||[]).map(c=>({id:c.id,label:c.label,color:c.color})),
    createdAt: team.createdAt
  };
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(teamMeta))));
  const link = `${location.origin}${location.pathname}?join=${team.id}&td=${encoded}`;

  document.getElementById('share-link-input').value=link;

  // حفظ الـ snapshot للـ Supabase في الخلفية
  syncToCloud(team.id);

  openModal('modal-share');
}

function copyShareLink(){
  const inp=document.getElementById('share-link-input');
  navigator.clipboard?.writeText(inp.value).then(()=>{
    toast('<i class="fa-solid fa-copy" style="color:var(--accent3)"></i> تم نسخ الرابط!');
    closeModal('modal-share');
  });
}

function handleJoinLink(teamId){
  const urlParams = new URLSearchParams(location.search);
  const tdEncoded = urlParams.get('td')||'';

  const isLoggedIn = TS.me.supaId || localStorage.getItem('studioOS_auth_v1');
  if(!isLoggedIn){
    localStorage.setItem('_pendingTeamInvite', teamId);
    if(tdEncoded) localStorage.setItem('_pendingTeamTd', tdEncoded);
    const base = location.href.replace(/[^/]*(\?.*)?$/, '');
    const indexUrl = base+'index.html?teamInvite='+encodeURIComponent(teamId)+(tdEncoded?'&td='+encodeURIComponent(tdEncoded):'');
    toast('<i class="fa-solid fa-lock" style="color:var(--accent2)"></i> يرجى تسجيل الدخول أولاً...');
    setTimeout(()=>{ window.location.href = indexUrl; }, 1500);
    return;
  }

  const existing = TS.teams.find(t=>t.id===teamId);
  if(existing){
    toast('<i class="fa-solid fa-check" style="color:var(--accent3)"></i> أنت بالفعل عضو في هذا الفريق');
    openTeam(teamId);
    return;
  }

  _showJoinInviteModal(teamId);
}

function _showJoinInviteModal(teamId){
  // أزل أي modal قديم
  document.getElementById('_join-invite-modal')?.remove();
  const modal = document.createElement('div');
  modal.id = '_join-invite-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);backdrop-filter:blur(6px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  modal.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:32px;max-width:420px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.5)">
      <div style="font-size:48px;margin-bottom:14px">🤝</div>
      <div style="font-size:18px;font-weight:900;margin-bottom:8px">دعوة للانضمام لفريق</div>
      <div style="font-size:13px;color:var(--text3);margin-bottom:20px;line-height:1.7">
        تمت دعوتك للانضمام لفريق في Ordo.<br>
        سيظهر لك بورد المهام وستتمكن من:<br>
        <span style="color:var(--accent3)">✓ عرض المهام وإضافتها</span><br>
        <span style="color:var(--accent3)">✓ التعليق والمنشن</span><br>
        <span style="color:var(--accent3)">✓ تغيير حالات المهام</span>
      </div>
      <div id="_join-name-wrap" style="margin-bottom:16px;text-align:right">
        <label style="font-size:11px;font-weight:700;color:var(--text3);display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:.04em">اسمك في الفريق</label>
        <input id="_join-name-inp" class="form-input" placeholder="ادخل اسمك..." value="${esc(TS.me.name||'')}">
      </div>
      <div style="display:flex;gap:10px">
        <button onclick="_confirmJoinTeam('${teamId}')" style="flex:1;padding:12px;background:var(--accent);color:#fff;border:none;border-radius:10px;font-family:var(--font);font-size:14px;font-weight:700;cursor:pointer">
          <i class="fa-solid fa-check"></i> انضم للفريق
        </button>
        <button onclick="document.getElementById('_join-invite-modal')?.remove();showTeamsList()" style="padding:12px 16px;background:var(--surface2);color:var(--text2);border:1.5px solid var(--border);border-radius:10px;font-family:var(--font);font-size:13px;font-weight:700;cursor:pointer">
          لاحقاً
        </button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e=>{ if(e.target===modal){ modal.remove(); showTeamsList(); }});
  setTimeout(()=>document.getElementById('_join-name-inp')?.focus(), 100);
}

async function _confirmJoinTeam(teamId){
  const nameEl = document.getElementById('_join-name-inp');
  const memberName = nameEl?.value?.trim() || TS.me.name || 'عضو جديد';
  if(!memberName){ toast('أدخل اسمك'); return; }

  document.getElementById('_join-invite-modal')?.remove();
  toast('<i class="fa-solid fa-spinner fa-spin" style="color:var(--accent)"></i> جارٍ الانضمام...');

  let teamData = null;
  let ownerUserId = null;

  // ── ٠. أولوية قصوى: استخرج بيانات الفريق من الـ URL أو localStorage ──
  try {
    const urlParams = new URLSearchParams(location.search);
    const tdEncoded = urlParams.get('td') || localStorage.getItem('_pendingTeamTd') || '';
    if(tdEncoded){
      localStorage.removeItem('_pendingTeamTd');
      const decoded = JSON.parse(decodeURIComponent(escape(atob(tdEncoded))));
      if(decoded && (decoded.id===teamId || !teamId)){
        teamData = {
          id:        decoded.id,
          name:      decoded.name,
          type:      decoded.type||'company',
          color:     decoded.color||'#7c6ff7',
          emoji:     decoded.emoji||'🏢',
          columns:   decoded.columns||[],
          members:   [],
          tasks:     [],
          clients:   [],
          departments:[],
          createdAt: decoded.createdAt||new Date().toISOString()
        };
        ownerUserId = decoded.ownerId||null;
      }
    }
  }catch(e){}

  // ── ١. ابحث في localStorage (نفس الجهاز) ──
  if(!teamData){
    try {
      const raw = localStorage.getItem('ordo_teams_v2');
      if(raw){
        const local = JSON.parse(raw);
        const found = (local.teams||[]).find(t=>t.id===teamId);
        if(found){ teamData=found; }
      }
    }catch(e){}
  }

  // ── ٢. ابحث في Supabase user_notifications snapshots ──
  if(!teamData && TS.me.supaId && typeof supa !== 'undefined'){
    try {
      // هذا يشتغل لو المستخدم لديه صلاحية قراءة كل الـ notifications
      const {data:snapRows} = await supa.from('user_notifications')
        .select('user_id,data')
        .eq('type','team_data_snapshot');
      if(snapRows){
        for(const row of snapRows){
          if(row.user_id===TS.me.supaId) continue;
          try {
            const snap = typeof row.data==='string'?JSON.parse(row.data):row.data;
            const found = (snap?.teams||[]).find(t=>t.id===teamId);
            if(found){ teamData=found; ownerUserId=row.user_id; break; }
          }catch(e){}
        }
      }
    }catch(e){}
  }

  // ── ٣. ابحث في studio_data ──
  if(!teamData && TS.me.supaId && typeof supa !== 'undefined'){
    try {
      const {data:sdRows} = await supa.from('studio_data').select('user_id,data');
      if(sdRows){
        for(const row of sdRows){
          if(row.user_id===TS.me.supaId) continue;
          try {
            const rd = typeof row.data==='string'?JSON.parse(row.data):row.data;
            if(rd?._teamAppData){
              const ctd = typeof rd._teamAppData==='string'?JSON.parse(rd._teamAppData):rd._teamAppData;
              const f = (ctd?.teams||[]).find(t=>t.id===teamId);
              if(f){ teamData=f; ownerUserId=row.user_id; break; }
            }
            if(!teamData && rd?._companyTeams){
              const f2=(rd._companyTeams||[]).find(t=>t.id===teamId);
              if(f2){ teamData=f2; ownerUserId=row.user_id; break; }
            }
          }catch(e){}
        }
      }
    }catch(e){}
  }

  // ── معالجة النتيجة ──
  const raw2 = localStorage.getItem('ordo_teams_v2');
  let tsStore = raw2 ? JSON.parse(raw2) : {teams:[]};

  if(teamData){
    if(!teamData.members) teamData.members=[];
    const alreadyMember = teamData.members.find(m=>
      (m.email||'').toLowerCase()===(TS.me.email||'').toLowerCase()
    );
    if(!alreadyMember){
      teamData.members.push({
        id: 'mem_join_'+Date.now(),
        name: memberName,
        email: TS.me.email||'',
        role: 'member',
        color: MEMBER_COLORS[teamData.members.length % MEMBER_COLORS.length],
        joinedAt: new Date().toISOString()
      });
    }

    const existIdx = tsStore.teams.findIndex(t=>t.id===teamData.id);
    if(existIdx>-1) tsStore.teams[existIdx]=teamData;
    else tsStore.teams.push(teamData);
    localStorage.setItem('ordo_teams_v2', JSON.stringify(tsStore));
    TS.teams = tsStore.teams;
    TS.currentTeamId = teamData.id;
    saveLS();

    _sendJoinNotificationToOwner(teamData, memberName, ownerUserId);
    if(ownerUserId && !alreadyMember){
      _updateOwnerTeamData(teamData.id, teamData, ownerUserId);
    }

    // نظّف الـ URL
    window.history.replaceState({}, '', location.pathname);

    openTeam(teamData.id);
    toast(`✅ مرحباً ${memberName}! انضممت لـ "${teamData.name}"`);

  } else {
    toast('<i class="fa-solid fa-triangle-exclamation" style="color:var(--accent4)"></i> لم يتم العثور على الفريق. اطلب من المالك إرسال الرابط مباشرة من زر المشاركة.');
    showTeamsList();
  }
}

// تحديث بيانات الفريق في studio_data المالك على Supabase
async function _updateOwnerTeamData(teamId, updatedTeam, ownerUserId){
  if(!ownerUserId || typeof supa==='undefined') return;
  try {
    const {data:ownerRow} = await supa.from('studio_data').select('data').eq('user_id',ownerUserId).single().catch(()=>({data:null}));
    if(!ownerRow?.data) return;
    let od = typeof ownerRow.data==='string'?JSON.parse(ownerRow.data):ownerRow.data;
    // حدّث في _teamAppData
    if(od._teamAppData){
      let ctd = typeof od._teamAppData==='string'?JSON.parse(od._teamAppData):od._teamAppData;
      const idx = (ctd.teams||[]).findIndex(t=>t.id===teamId);
      if(idx>-1) ctd.teams[idx]=updatedTeam;
      od._teamAppData = JSON.stringify(ctd);
    }
    // حدّث في teams array مباشرة
    if(od.teams){
      const idx2 = (od.teams||[]).findIndex(t=>t.id===teamId);
      if(idx2>-1) od.teams[idx2]=updatedTeam;
    }
    await supa.from('studio_data').update({data:JSON.stringify(od),updated_at:new Date().toISOString()}).eq('user_id',ownerUserId);
  }catch(e){ console.warn('_updateOwnerTeamData:', e); }
}

async function _sendJoinNotificationToOwner(team, memberName, ownerUserId){
  try {
    // ١. أضف notification في _companyNotifications في localStorage
    const raw = localStorage.getItem('ordo_teams_v2');
    if(raw){
      const tsData = JSON.parse(raw);
      if(!tsData._companyNotifications) tsData._companyNotifications = {};
      // تحديد إيميل المالك
      const ownerMember = (team.members||[]).find(m=>m.id==='me');
      const ownerEmail = ownerMember?.email || '';
      if(ownerEmail){
        if(!tsData._companyNotifications[ownerEmail]) tsData._companyNotifications[ownerEmail]=[];
        tsData._companyNotifications[ownerEmail].push({
          id: 'join_'+Date.now(),
          type: 'member_joined',
          title: `🤝 ${memberName} انضم لفريق "${team.name}"`,
          body: `انضم ${memberName} للفريق كعضو جديد`,
          createdAt: new Date().toISOString(),
          read: false
        });
        localStorage.setItem('ordo_teams_v2', JSON.stringify(tsData));
      }
    }
    // ٢. لو عندنا ownerUserId — بعّت إشعار على studio_data
    if(ownerUserId && typeof supa !== 'undefined'){
      const notifRow = {
        user_id: ownerUserId,
        title: `🤝 انضمام عضو جديد`,
        body: `${memberName} انضم لفريق "${team.name}"`,
        type: 'company_join',
        data: JSON.stringify({teamId:team.id, teamName:team.name, memberName}),
        read: false,
        created_at: new Date().toISOString()
      };
      await supa.from('user_notifications').insert([notifRow]).catch(()=>{});
    }
  } catch(e){ console.warn('_sendJoinNotificationToOwner:', e); }
}

// ══════════════════════════════════════════════════
//  HELPERS FOR MODALS
// ══════════════════════════════════════════════════
function fillAssigneeDD(elId, selected){
  const team=currentTeam();
  const el=document.getElementById(elId);
  if(!el) return;
  el.innerHTML='<option value="">— غير مُعيَّن —</option>'+
    (team?.members||[]).map(m=>`<option value="${m.id}"${m.id===(selected||'')?' selected':''}>${esc(m.name)}</option>`).join('');
}

function fillStatusDD(elId, selected){
  const team=currentTeam();
  const cols=(team?.columns||DEFAULT_COLS.map(c=>({...c})));
  const el=document.getElementById(elId);
  if(!el) return;
  el.innerHTML=cols.map(c=>`<option value="${c.id}"${c.id===(selected||'')?'  selected':''}>${esc(c.label)}</option>`).join('');
}

function fillClientsDD(elId){
  const team=currentTeam();
  const el=document.getElementById(elId);
  if(!el) return;
  const dl=document.getElementById('at-clients-dl');
  if(dl) dl.innerHTML=(team?.clients||[]).map(c=>`<option value="${esc(c.name)}">`).join('');
}

// Close modal on backdrop click
document.addEventListener('click', e=>{
  if(e.target.classList.contains('modal-backdrop')) e.target.style.display='none';
});
