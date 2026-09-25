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
      summary.textContent = mb(info.used_bytes)+' MB من '+mb(info.limit_bytes)+' MB — رفع الصور '+(info.uploads_enabled?'متاح':'موقوف')+(info.purchased_mb?' · مساحة إضافية '+info.purchased_mb+' MB':'');
      if(bar) bar.style.width = (info.limit_bytes ? Math.min(100,info.used_bytes / info.limit_bytes * 100) : 100)+'%';
      const breakdown = document.getElementById('user-storage-breakdown');
      if(breakdown) breakdown.textContent='صور الموقع المخزنة (اللوجوهات والبنرات والبريفات وغيرها): '+mb(info.studio_bytes)+' MB · مرفقات الشات: '+mb(info.chat_bytes)+' MB · صور وملفات أخرى: '+mb(Math.max(0,(info.other_bytes||0)-(info.chat_bytes||0)))+' MB. الروابط الخارجية لا تُحتسب.';
    } catch(error) { summary.textContent = 'تعذر قراءة المساحة. حاول مجددًا.'; }
    loading = false;
  };
  root.openStoragePackages = async function(targetId){
    const box=document.getElementById(targetId||'user-storage-packages');if(!box)return;
    if(!box.hidden){box.hidden=true;return;}
    box.hidden=false;box.textContent='جارٍ تحميل باقات المساحة...';
    try{
      const response=await root.ORDO_API_REQUEST('storage.packages');
      const packages=response.data?.packages||[];
      const phone=String(response.data?.whatsapp||'').replace(/\D/g,'');
      box.innerHTML='<div style="font-weight:800;margin-bottom:9px">باقات مساحة مستقلة عن اشتراك المنصة</div>'+
        (packages.length?packages.map(p=>'<div class="storage-file-row"><span><b>'+esc(p.name)+'</b> · '+Number(p.mb)+' MB إضافية · '+Number(p.price||0).toLocaleString('ar-EG')+' '+esc(p.currency||'EGP')+' <small>'+esc(p.description||'')+'</small></span><button type="button" class="btn btn-primary btn-sm" data-storage-package="'+esc(p.id)+'">طلب الباقة</button></div>').join(''):'<p style="color:var(--text3)">لا توجد باقات مساحة مفعلة حاليًا.</p>')+
        (phone?'<a class="btn btn-ghost btn-sm" style="margin-top:10px" target="_blank" rel="noopener noreferrer" href="https://wa.me/'+phone+'?text='+encodeURIComponent('مرحبًا، أريد زيادة مساحة تخزين الصور في Ordo')+'"><i class="fa-brands fa-whatsapp"></i> طلب مساحة مخصصة عبر واتساب</a>':'');
      box.querySelectorAll('[data-storage-package]').forEach(button=>button.onclick=async()=>{
        button.disabled=true;
        try{await root.ORDO_API_REQUEST('storage.request',{package_id:button.dataset.storagePackage});button.textContent='الطلب قيد المراجعة';}
        catch(error){button.disabled=false;root.alert(error.message||'تعذّر إرسال الطلب');}
      });
    }catch(error){box.textContent='تعذّر تحميل باقات المساحة. حاول مجددًا.';}
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
