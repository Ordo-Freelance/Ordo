(function(root){
  'use strict';
  let loading = false;
  const mb = value => (Number(value || 0) / 1048576).toFixed(2);
  const esc = value => String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  root.refreshUserStorageUsage = async function(){
    const summary = document.getElementById('user-storage-summary');
    const bar = document.getElementById('user-storage-progress');
    if(!summary || loading || typeof root.ORDO_API_REQUEST !== 'function') return;
    loading = true;
    summary.textContent = 'جاري حساب المساحة...';
    try {
      const response = await root.ORDO_API_REQUEST('storage.usage');
      const info = response.data || {};
      summary.textContent = mb(info.used_bytes)+' MB من '+mb(info.limit_bytes)+' MB — رفع الصور '+(info.uploads_enabled?'متاح':'موقوف');
      if(bar) bar.style.width = (info.limit_bytes ? Math.min(100,info.used_bytes / info.limit_bytes * 100) : 100)+'%';
      const breakdown = document.getElementById('user-storage-breakdown');
      if(breakdown) breakdown.textContent='صور الحساب: '+mb(info.studio_bytes)+' MB · صور وفويسات الشات: '+mb(info.chat_bytes)+' MB · ملفات أخرى: '+mb(Math.max(0,(info.other_bytes||0)-(info.chat_bytes||0)))+' MB. الروابط الخارجية لا تُحتسب.';
    } catch(error) { summary.textContent = 'تعذر قراءة المساحة. حاول مجددًا.'; }
    loading = false;
  };
  root.toggleUserStorageFiles = async function(){
    const list=document.getElementById('user-storage-files');if(!list)return;
    if(!list.hidden){list.hidden=true;return;}
    list.hidden=false;list.textContent='جاري تحميل الملفات...';
    try{
      const response=await root.ORDO_API_REQUEST('storage.files');
      const files=response.data?.files||[];
      list.innerHTML=files.length?files.map(file=>'<div class="storage-file-row"><span><i class="fa-solid '+(file.kind==='voice'?'fa-file-audio':'fa-file-image')+'"></i> '+esc(file.name||'مرفق شات')+' <small>'+mb(file.bytes)+' MB</small></span><button type="button" class="btn btn-ghost btn-sm" data-storage-delete="'+esc(file.id)+'" aria-label="حذف الملف" title="حذف الملف"><i class="fa-solid fa-trash-can"></i></button></div>').join(''):'<p>لا توجد ملفات شات محفوظة.</p>';
      list.querySelectorAll('[data-storage-delete]').forEach(button=>button.onclick=async()=>{
        if(!root.confirm('حذف هذا المرفق نهائياً من المحادثة وتحرير مساحته؟'))return;
        button.disabled=true;
        try{await root.ORDO_API_REQUEST('storage.deleteFile',{file_id:button.dataset.storageDelete});button.closest('.storage-file-row').remove();root.refreshUserStorageUsage();}
        catch(error){button.disabled=false;root.alert(error.message||'تعذر حذف الملف');}
      });
    }catch(error){list.textContent='تعذر تحميل الملفات. حاول مجدداً.';}
  };
  const original = root.showPage;
  if(typeof original === 'function') root.showPage = function(page){
    const result = original.apply(this,arguments);
    if(page === 'settings') root.refreshUserStorageUsage();
    return result;
  };
})(window);
