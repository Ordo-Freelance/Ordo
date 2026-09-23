(function(){
  'use strict';
  let rows = [];
  let activeTab = 'messages';
  let loading = false;
  const notices = new Set(['admin_update']);
  const messages = new Set(['message','broadcast','info','success','warning','error','support_reply']);

  function esc(value){
    return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }
  function cleanBody(value){ return String(value || '').replace(/\n__page__:.+$/, ''); }
  function dataOf(row){
    if(typeof row.data === 'object' && row.data) return row.data;
    try { return JSON.parse(row.data || '{}'); } catch(_) { return {}; }
  }
  function inTab(row, tab){
    return tab === 'updates' ? notices.has(row.type)
      : tab === 'requests' ? row.type === 'support_request'
      : messages.has(row.type);
  }
  function bodyWithLinks(value){
    return esc(cleanBody(value)).replace(/https?:\/\/[^\s<]+/g, text => {
      const safe = text.replace(/&amp;/g,'&');
      try { const url = new URL(safe); return '<a href="'+esc(url.href)+'" target="_blank" rel="noopener noreferrer" style="color:var(--accent)">'+text+'</a>'; }
      catch(_) { return text; }
    }).replace(/\n/g,'<br>');
  }
  function render(){
    const el = document.getElementById('support-grid');
    if(!el) return;
    const clientRows = (window.S?.support_msgs || []).slice().reverse().map(item => ({...item,id:'local_'+item.id,title:item.subject || item.client_name || 'رسالة عميل',body:item.message || item.body || '',type:'client_message'}));
    const unread = rows.filter(row => !row.read && messages.has(row.type)).length + clientRows.filter(row => !row.read).length;
    const badge = document.getElementById('support-badge');
    if(badge){ badge.textContent = unread; badge.style.display = unread ? '' : 'none'; }
    const tabs = [
      ['messages','الرسائل', rows.filter(row => inTab(row,'messages')).length],
      ['updates','التحديثات والإشعارات', rows.filter(row => inTab(row,'updates')).length],
      ['requests','طلبات المساعدة', rows.filter(row => inTab(row,'requests')).length],
      ['clients','رسائل العملاء', clientRows.length]
    ];
    const visible = activeTab === 'clients' ? clientRows : rows.filter(row => inTab(row,activeTab));
    el.style.display = 'block';
    el.innerHTML = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">'+
      tabs.map(([id,label,count]) => '<button type="button" data-support-tab="'+id+'" class="btn '+(activeTab===id?'btn-primary':'btn-ghost')+'">'+label+' ('+count+')</button>').join('')+
      '<button type="button" data-support-compose class="btn btn-ghost" style="margin-inline-start:auto">✉ طلب مساعدة أو شكوى</button></div>'+
      (visible.length ? '<div class="grid grid-2" style="gap:12px">'+visible.map(row => {
        const title = row.title || (row.type === 'support_reply' ? 'رد من الإدارة' : 'رسالة من الإدارة');
        const date = row.created_at ? new Date(row.created_at).toLocaleString('ar-EG') : '';
        return '<button type="button" data-support-id="'+esc(row.id)+'" class="card" style="text-align:right;cursor:pointer;color:var(--text);font-family:inherit;border-color:'+(row.read?'var(--border)':'var(--accent)')+'">'+
          '<div style="display:flex;justify-content:space-between;gap:10px"><strong>'+esc(title)+'</strong>'+(row.read?'':'<span style="color:var(--accent)">● جديد</span>')+'</div>'+
          '<div style="color:var(--text2);font-size:12px;margin-top:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(cleanBody(row.body))+'</div>'+
          '<div style="color:var(--text3);font-size:11px;margin-top:10px">'+esc(date)+'</div></button>';
      }).join('')+'</div>' : '<div class="card" style="text-align:center;padding:45px;color:var(--text3)">'+(loading?'جاري تحميل الرسائل...':'لا توجد عناصر في هذا القسم بعد')+'</div>');
  }
  async function load(tab, openId){
    if(tab) activeTab = tab;
    if(typeof _supaUserId === 'undefined' || !_supaUserId || typeof supa === 'undefined'){ render(); return; }
    loading = true; render();
    try {
      const {data,error} = await supa.from('user_notifications')
        .select('id,user_id,title,body,type,read,data,created_at')
        .eq('user_id',_supaUserId).order('created_at',{ascending:false}).limit(100);
      if(error) throw error;
      rows = data || [];
    } catch(error) { console.warn('support center load:',error.message); }
    loading = false; render();
    if(openId) openDetail(openId);
  }
  function modal(content){
    document.getElementById('support-center-modal')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'support-center-modal';
    overlay.className = 'modal-overlay open';
    overlay.style.zIndex = '10010';
    overlay.innerHTML = '<div class="modal" style="max-width:590px">'+content+'</div>';
    overlay.addEventListener('click', event => {
      if(event.target === overlay || event.target.closest('[data-support-close]')) overlay.remove();
    });
    document.body.appendChild(overlay);
    return overlay;
  }
  async function openDetail(id){
    if(String(id).startsWith('local_')) {
      if(typeof window.openSupportMsg === 'function') window.openSupportMsg(String(id).slice(6));
      return;
    }
    const row = rows.find(item => String(item.id) === String(id));
    if(!row) return;
    if(!row.read && row.type !== 'support_request') {
      row.read = true; render();
      await supa.from('user_notifications').update({read:true}).eq('id',row.id).eq('user_id',_supaUserId);
      if(typeof _markSingleNotifRead === 'function') _markSingleNotifRead('srv_'+row.id);
    }
    const meta = dataOf(row);
    modal('<div class="modal-header"><div class="modal-title">'+esc(row.title || 'رسالة')+'</div><button type="button" class="close-btn" data-support-close>✕</button></div>'+
      '<div style="font-size:12px;color:var(--text3);margin-bottom:15px">'+esc(new Date(row.created_at).toLocaleString('ar-EG'))+'</div>'+
      '<div style="background:var(--surface2);padding:18px;border-radius:12px;line-height:1.9;overflow-wrap:anywhere">'+bodyWithLinks(row.body)+'</div>'+
      (meta.request_id ? '<div style="font-size:12px;color:var(--text3);margin-top:14px">رد على طلب المساعدة الخاص بك</div>' : ''));
  }
  function compose(){
    const overlay = modal('<div class="modal-header"><div class="modal-title">✉ مراسلة الإدارة</div><button type="button" class="close-btn" data-support-close>✕</button></div>'+
      '<div class="form-group"><label class="form-label" for="support-kind">نوع الطلب</label><select class="form-input" id="support-kind"><option value="help">طلب مساعدة</option><option value="complaint">تقديم شكوى</option><option value="message">رسالة للإدارة</option></select></div>'+
      '<div class="form-group"><label class="form-label" for="support-title">العنوان</label><input class="form-input" id="support-title" maxlength="150" placeholder="موضوع الرسالة"></div>'+
      '<div class="form-group"><label class="form-label" for="support-body">الرسالة</label><textarea class="form-input" id="support-body" rows="6" maxlength="5000" placeholder="اشرح طلبك أو شكواك"></textarea></div>'+
      '<div id="support-form-error" style="color:var(--accent4);font-size:12px;margin-bottom:10px"></div><button type="button" class="btn btn-primary" data-support-send>إرسال للإدارة</button>');
    overlay.querySelector('[data-support-send]').addEventListener('click', async event => {
      const title = overlay.querySelector('#support-title').value.trim();
      const body = overlay.querySelector('#support-body').value.trim();
      const errorEl = overlay.querySelector('#support-form-error');
      if(!title || !body){ errorEl.textContent = 'اكتب عنوان الرسالة وتفاصيلها أولًا'; return; }
      const button = event.currentTarget; button.disabled = true;
      const {error} = await supa.from('user_notifications').insert([{user_id:_supaUserId,title,body,type:'support_request',read:false,data:{category:overlay.querySelector('#support-kind').value},created_at:new Date().toISOString()}]);
      if(error){ errorEl.textContent = 'تعذر الإرسال: '+error.message; button.disabled = false; return; }
      overlay.remove(); activeTab = 'requests'; await load();
      if(typeof toast === 'function') toast('تم إرسال رسالتك للإدارة');
    });
  }
  document.getElementById('support-grid')?.addEventListener('click', event => {
    const tab = event.target.closest('[data-support-tab]');
    if(tab){ activeTab = tab.dataset.supportTab; render(); return; }
    if(event.target.closest('[data-support-compose]')){ compose(); return; }
    const row = event.target.closest('[data-support-id]');
    if(row) openDetail(row.dataset.supportId);
  });
  window.renderSupport = render;
  window._openSupportNotification = function(id){
    const item = window._notifications?.find(n => String(n.supaId) === String(id));
    const tab = item?.type === 'admin_update' ? 'updates' : 'messages';
    if(typeof showPage === 'function') showPage('support');
    load(tab,id);
  };
  const originalShowPage = window.showPage;
  if(typeof originalShowPage === 'function') window.showPage = function(id,el){
    const result = originalShowPage.apply(this,arguments);
    if(id === 'support') load();
    return result;
  };
  if(document.getElementById('page-support')?.classList.contains('active')) load();
})();
