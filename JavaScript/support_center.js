(function(){
  'use strict';
  let rows = [];
  let activeTab = 'messages';
  let loading = false;
  const notices = new Set(['admin_update','challenge']);
  const messages = new Set(['message','broadcast','info','success','warning','error','direct_message']);

  function esc(value){
    return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  }
  function cleanBody(value){ return String(value || '').replace(/\n__page__:.+$/, ''); }
  function dataOf(row){
    if(typeof row.data === 'object' && row.data) return row.data;
    try { return JSON.parse(row.data || '{}'); } catch(_) { return {}; }
  }
  function threadId(row){ const data=dataOf(row); return String(data.request_id || data.thread_id || row.id); }
  function conversations(list){
    const groups=new Map();
    list.slice().reverse().forEach(row => {
      const id=threadId(row);
      if(!groups.has(id)) groups.set(id,{id,items:[]});
      groups.get(id).items.push(row);
    });
    return [...groups.values()].sort((a,b) => new Date(b.items.at(-1)?.created_at||0)-new Date(a.items.at(-1)?.created_at||0));
  }
  function visible(row){ return !dataOf(row).hidden_for_user; }
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
    const unread = rows.filter(row => !row.read && (messages.has(row.type)||row.type==='support_reply')).length + clientRows.filter(row => !row.read).length;
    const badge = document.getElementById('support-badge');
    if(badge){ badge.textContent = unread; badge.style.display = unread ? '' : 'none'; }
    const allThreads=conversations(rows);
    const messageThreads=allThreads.filter(thread=>messages.has(thread.items[0].type));
    const requestThreads=allThreads.filter(thread=>thread.items[0].type==='support_request'||thread.items[0].type==='support_reply');
    const tabs = [
      ['messages','الرسائل', messageThreads.length],
      ['updates','التحديثات والإشعارات', rows.filter(row => inTab(row,'updates')).length],
      ['requests','طلبات المساعدة', requestThreads.length],
      ['clients','رسائل العملاء', clientRows.length]
    ];
    const visible = activeTab === 'clients' ? clientRows.map(row=>({id:row.id,items:[row]}))
      : activeTab === 'updates' ? rows.filter(row=>inTab(row,'updates')).map(row=>({id:row.id,items:[row]}))
      : activeTab === 'requests' ? requestThreads : messageThreads;
    el.style.display = 'block';
    el.innerHTML = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px">'+
      tabs.map(([id,label,count]) => '<button type="button" data-support-tab="'+id+'" class="btn '+(activeTab===id?'btn-primary':'btn-ghost')+'">'+label+' ('+count+')</button>').join('')+
      '<button type="button" data-support-compose class="btn btn-ghost" style="margin-inline-start:auto">✉ طلب مساعدة أو شكوى</button></div>'+
      (visible.length ? '<div class="grid grid-2" style="gap:12px">'+visible.map(thread => {
        const row = thread.items.at(-1);
        const first = thread.items[0];
        const title = row.title || (row.type === 'support_reply' ? 'رد من الإدارة' : 'رسالة من الإدارة');
        const date = row.created_at ? new Date(row.created_at).toLocaleString('ar-EG') : '';
        const canDelete = activeTab !== 'clients';
        return '<div class="card" style="position:relative;border-color:'+(thread.items.some(item=>!item.read)?'var(--accent)':'var(--border)')+'"><button type="button" data-support-id="'+esc(thread.id)+'" style="display:block;width:100%;border:0;background:transparent;text-align:right;cursor:pointer;color:var(--text);font-family:inherit;padding:0">'+
          '<div style="display:flex;justify-content:space-between;gap:10px"><strong>'+esc(first.title||title)+'</strong>'+(thread.items.some(item=>!item.read)?'<span style="color:var(--accent)">● جديد</span>':'')+'</div>'+
          '<div style="color:var(--text2);font-size:12px;margin-top:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(cleanBody(row.body))+'</div>'+
          '<div style="color:var(--text3);font-size:11px;margin-top:10px">'+esc(date)+(thread.items.length>1?' · '+thread.items.length+' رسائل':'')+'</div></button>'+
          (canDelete?'<button type="button" data-support-delete="'+esc(thread.id)+'" aria-label="حذف سجل المحادثة" title="حذف السجل من حسابي" style="position:absolute;left:14px;bottom:13px;background:transparent;border:0;color:var(--accent4);cursor:pointer"><i class="fa-solid fa-trash"></i></button>':'')+'</div>';
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
      rows = (data || []).filter(visible);
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
  window._showAdminIncomingPopup = function(incoming){
    if(!Array.isArray(incoming) || !incoming.length || typeof _supaUserId === 'undefined' || !_supaUserId) return;
    const key = '_admin_popup_seen_'+_supaUserId;
    let seen = [];
    try { seen = JSON.parse(localStorage.getItem(key) || '[]'); } catch(_) {}
    if(!Array.isArray(seen)) seen = [];
    const eligible = incoming.filter(row => !row.read && (notices.has(row.type) || messages.has(row.type) || row.type==='support_reply') && !seen.includes(String(row.id)));
    if(!eligible.length || document.getElementById('support-center-modal')) return;
    localStorage.setItem(key, JSON.stringify([...new Set([...seen,...eligible.map(row => String(row.id))])].slice(-150)));
    const latest = eligible.slice(0,5);
    const overlay = modal('<div class="modal-header"><div class="modal-title"><i class="fa-solid fa-bell" style="color:var(--accent)"></i> لديك '+eligible.length+' '+(eligible.length === 1 ? 'رسالة أو تحديث جديد' : 'رسائل وتحديثات جديدة')+'</div><button type="button" class="close-btn" data-support-close aria-label="إغلاق">✕</button></div>'+
      '<div style="display:grid;gap:9px;max-height:55vh;overflow:auto">'+latest.map(row => '<button type="button" class="card" data-incoming-id="'+esc(row.id)+'" data-incoming-tab="'+(notices.has(row.type)?'updates':row.type==='support_reply'?'requests':'messages')+'" style="text-align:right;cursor:pointer;font-family:inherit;color:var(--text);padding:13px"><strong>'+esc(row.title || 'رسالة من الإدارة')+'</strong><div style="color:var(--text2);font-size:12px;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(cleanBody(row.body))+'</div></button>').join('')+'</div>'+
      '<button type="button" class="btn btn-ghost" data-incoming-all style="margin-top:14px;width:100%">عرض الكل في الدعم والرسائل</button>');
    overlay.addEventListener('click', async event => {
      const chosen = event.target.closest('[data-incoming-id]');
      const all = event.target.closest('[data-incoming-all]');
      if(!chosen && !all) return;
      overlay.remove();
      if(typeof showPage === 'function') showPage('support');
      await load(chosen?.dataset.incomingTab || (notices.has(latest[0].type)?'updates':'messages'), chosen?.dataset.incomingId);
    });
  };
  async function openDetail(id){
    if(String(id).startsWith('local_')) {
      if(typeof window.openSupportMsg === 'function') window.openSupportMsg(String(id).slice(6));
      return;
    }
    const thread=conversations(rows).find(item=>item.id===String(id) || item.items.some(row=>String(row.id)===String(id)));
    if(!thread) return;
    const first=thread.items[0];
    if(first.type==='support_request'||first.type==='support_reply') activeTab='requests';
    else if(messages.has(first.type)) activeTab='messages';
    for(const row of thread.items.filter(item=>!item.read && item.type!=='support_request')) {
      row.read=true;
      const {error}=await supa.from('user_notifications').update({read:true}).eq('id',row.id).eq('user_id',_supaUserId);
      if(error) row.read=false;
      else if(typeof _markSingleNotifRead === 'function') _markSingleNotifRead('srv_'+row.id);
    }
    render();
    const overlay=modal('<div class="modal-header"><div class="modal-title">'+esc(first.title || 'محادثة')+'</div><button type="button" class="close-btn" data-support-close>✕</button></div>'+
      '<div style="display:grid;gap:10px;max-height:55vh;overflow:auto;margin-bottom:15px">'+thread.items.map(row=>'<div style="background:var(--surface2);border-radius:12px;padding:13px;border-inline-start:3px solid '+(row.type==='support_request'?'var(--accent)':'var(--accent3)')+'"><strong style="font-size:11px">'+(row.type==='support_request'?'أنت':'الإدارة')+'</strong><div style="font-size:11px;color:var(--text3)">'+esc(new Date(row.created_at).toLocaleString('ar-EG'))+'</div><div style="line-height:1.8;margin-top:7px;overflow-wrap:anywhere">'+bodyWithLinks(row.body)+'</div></div>').join('')+'</div>'+
      (activeTab==='requests'||first.type==='message'||first.type==='direct_message' ? '<div class="form-group"><textarea class="form-input" data-support-reply-text rows="3" maxlength="5000" placeholder="اكتب ردك هنا..."></textarea></div><button type="button" class="btn btn-primary" data-support-reply>إرسال الرد</button>' : ''));
    overlay.querySelector('[data-support-reply]')?.addEventListener('click',async event=>{
      const body=overlay.querySelector('[data-support-reply-text]').value.trim();
      if(!body) return;
      event.currentTarget.disabled=true;
      const {error}=await supa.from('user_notifications').insert([{user_id:_supaUserId,title:first.title||'محادثة',body,type:'support_request',read:false,data:{request_id:thread.id,category:'reply'},created_at:new Date().toISOString()}]);
      if(error){event.currentTarget.disabled=false;if(typeof toast==='function')toast('تعذر إرسال الرد: '+error.message);return;}
      overlay.remove();await load();if(typeof toast==='function')toast('تم إرسال الرد');
    });
  }
  async function deleteThread(id){
    const thread=conversations(rows).find(item=>item.id===String(id));
    if(!thread || !confirm('حذف سجل هذه المحادثة من حسابك؟')) return;
    for(const row of thread.items){
      const {error}=await supa.from('user_notifications').update({data:{...dataOf(row),hidden_for_user:true}}).eq('id',row.id).eq('user_id',_supaUserId);
      if(error){if(typeof toast==='function')toast('تعذر حذف السجل: '+error.message);return;}
    }
    rows=rows.filter(row=>threadId(row)!==thread.id);render();
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
    const deleteButton=event.target.closest('[data-support-delete]');
    if(deleteButton){deleteThread(deleteButton.dataset.supportDelete);return;}
    if(event.target.closest('[data-support-compose]')){ compose(); return; }
    const row = event.target.closest('[data-support-id]');
    if(row) openDetail(row.dataset.supportId);
  });
  window.renderSupport = render;
  window._openSupportNotification = function(id){
    const item = window._notifications?.find(n => String(n.supaId) === String(id));
    const tab = notices.has(item?.type) ? 'updates' : item?.type==='support_reply' ? 'requests' : 'messages';
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
