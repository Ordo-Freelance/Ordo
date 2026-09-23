(function(root){
  'use strict';
  let loading = false;
  root.refreshUserStorageUsage = async function(){
    const summary = document.getElementById('user-storage-summary');
    const bar = document.getElementById('user-storage-progress');
    if(!summary || loading || typeof root.ORDO_API_REQUEST !== 'function') return;
    loading = true;
    summary.textContent = 'جاري حساب المساحة...';
    try {
      const response = await root.ORDO_API_REQUEST('storage.usage');
      const info = response.data || {};
      const mb = value => (Number(value || 0) / 1048576).toFixed(2);
      summary.textContent = mb(info.used_bytes)+' MB من '+mb(info.limit_bytes)+' MB — رفع الصور '+(info.uploads_enabled?'متاح':'موقوف');
      if(bar) bar.style.width = (info.limit_bytes ? Math.min(100,info.used_bytes / info.limit_bytes * 100) : 100)+'%';
    } catch(error) { summary.textContent = 'تعذر قراءة المساحة. حاول مجددًا.'; }
    loading = false;
  };
  const original = root.showPage;
  if(typeof original === 'function') root.showPage = function(page){
    const result = original.apply(this,arguments);
    if(page === 'settings') root.refreshUserStorageUsage();
    return result;
  };
})(window);
