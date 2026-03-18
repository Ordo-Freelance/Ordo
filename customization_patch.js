// ============================================================
// CUSTOMIZATION PATCH v3
// ============================================================

function _cpSave(key,val){try{localStorage.setItem(key,JSON.stringify(val));}catch(e){}}
function _cpLoad(key,def){try{var v=JSON.parse(localStorage.getItem(key));return v!=null?v:def;}catch(e){return def;}}

function _cpModal(id,html){
  var ex=document.getElementById(id);if(ex)ex.remove();
  var ov=document.createElement('div');
  ov.id=id;
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:999999;padding:16px;overflow-y:auto';
  ov.innerHTML=html;
  document.body.appendChild(ov);
  ov.addEventListener('click',function(e){if(e.target===ov)ov.remove();});
  return ov;
}

// ══ SECTION 1: تخصيص حقول فورم المهمة ══

var _TF_FIELDS=[
  {id:'t-client-group-wrap', label:'العميل / الجهة'},
  {id:'t-type-row-wrap',     label:'نوع العمل ونوع المهمة'},
  {id:'t-dates-row-wrap',    label:'تاريخ الطلب ووعد التسليم'},
  {id:'t-priority-row-wrap', label:'الأولوية والحالة'},
  {id:'t-value-row',         label:'قيمة المشروع وحالة الدفع'},
  {id:'t-worker-section',    label:'من يعمل على المهمة'},
  {id:'t-notes-row-wrap',    label:'الملاحظات'},
  {id:'t-steps-section-wrap',label:'خطوات التنفيذ'},
  {id:'t-brief-section-wrap',label:'تفاصيل المشروع'},
  {id:'task-inv-opt',        label:'خيار إصدار فاتورة'},
];

function _getTFPrefs(){
  var saved=_cpLoad('_tfPrefs',{});
  return _TF_FIELDS.map(function(f){return{id:f.id,label:f.label,visible:saved[f.id]!==false};});
}

function _applyTFPrefs(){
  _getTFPrefs().forEach(function(p){var el=document.getElementById(p.id);if(el)el.style.display=p.visible?'':'none';});
}

function _openTFSettings(){
  var prefs=_getTFPrefs();
  var rows=prefs.map(function(p){
    return '<label style="display:flex;align-items:center;gap:10px;padding:10px 13px;border-radius:11px;background:var(--surface2);margin-bottom:6px;cursor:pointer;font-size:13px;font-weight:600;color:var(--text)">'
      +'<input type="checkbox" data-id="'+p.id+'" '+(p.visible?'checked':'')
      +' style="width:17px;height:17px;accent-color:var(--accent);cursor:pointer"> '+p.label+'</label>';
  }).join('');
  var ov=_cpModal('_tf-settings-modal',
    '<div style="background:var(--surface);width:min(400px,93vw);border-radius:20px;padding:26px;box-shadow:0 24px 80px rgba(0,0,0,.5)">'
    +'<div style="font-size:16px;font-weight:900;text-align:center;margin-bottom:6px;color:var(--text)"><i class="fa-solid fa-sliders" style="color:var(--accent)"></i> تخصيص حقول فورم المهمة</div>'
    +'<div style="font-size:12px;color:var(--text3);text-align:center;margin-bottom:18px">اختر الحقول اللي عايزها تظهر</div>'
    +rows
    +'<div style="display:flex;gap:10px;margin-top:18px">'
    +'<button id="_tf-save" class="btn btn-primary" style="flex:1"><i class="fa-solid fa-check"></i> حفظ</button>'
    +'<button id="_tf-cancel" class="btn btn-ghost" style="flex:1">إلغاء</button>'
    +'</div></div>');
  document.getElementById('_tf-save').onclick=function(){
    var map={};ov.querySelectorAll('input[data-id]').forEach(function(cb){map[cb.dataset.id]=cb.checked;});
    _cpSave('_tfPrefs',map);ov.remove();_wrapTaskFormSections();_applyTFPrefs();
    if(typeof showMiniNotif==='function')showMiniNotif('<i class="fa-solid fa-sliders" style="color:var(--accent)"></i> تم تحديث إعدادات فورم المهمة');
  };
  document.getElementById('_tf-cancel').onclick=function(){ov.remove();};
}

// ══ SECTION 2: تخصيص حقول فورم العميل ══

var _CF_FIELDS=[
  {id:'cf-type-phone-wrap',    label:'نوع العميل + الهاتف + الإيميل'},
  {id:'cf-channel-field-wrap', label:'قناة التواصل والمجال'},
  {id:'cf-worktype-wrap',      label:'طبيعة التعامل والراتب'},
  {id:'cf-notes-wrap',         label:'الملاحظات'},
  {id:'cf-opening-bal-wrap',   label:'الرصيد الافتتاحي'},
  {id:'cf-dna-wrap',           label:'DNA العميل'},
  {id:'cf-socials-wrap',       label:'حسابات السوشيال ميديا'},
  {id:'cf-followup-wrap',      label:'إعدادات المتابعة التلقائية'},
];

function _getCFPrefs(){
  var saved=_cpLoad('_cfPrefs',{});
  return _CF_FIELDS.map(function(f){return{id:f.id,label:f.label,visible:saved[f.id]!==false};});
}

function _applyCFPrefs(){
  _getCFPrefs().forEach(function(p){var el=document.getElementById(p.id);if(el)el.style.display=p.visible?'':'none';});
}

function _openCFSettings(){
  var prefs=_getCFPrefs();
  var rows=prefs.map(function(p){
    return '<label style="display:flex;align-items:center;gap:10px;padding:10px 13px;border-radius:11px;background:var(--surface2);margin-bottom:6px;cursor:pointer;font-size:13px;font-weight:600;color:var(--text)">'
      +'<input type="checkbox" data-id="'+p.id+'" '+(p.visible?'checked':'')
      +' style="width:17px;height:17px;accent-color:var(--accent);cursor:pointer"> '+p.label+'</label>';
  }).join('');
  var ov=_cpModal('_cf-settings-modal',
    '<div style="background:var(--surface);width:min(400px,93vw);border-radius:20px;padding:26px;box-shadow:0 24px 80px rgba(0,0,0,.5);max-height:85vh;overflow-y:auto">'
    +'<div style="font-size:16px;font-weight:900;text-align:center;margin-bottom:6px;color:var(--text)"><i class="fa-solid fa-sliders" style="color:var(--accent)"></i> تخصيص حقول فورم العميل</div>'
    +'<div style="font-size:12px;color:var(--text3);text-align:center;margin-bottom:18px">اختر الحقول اللي عايزها تظهر</div>'
    +rows
    +'<div style="display:flex;gap:10px;margin-top:18px">'
    +'<button id="_cf-save" class="btn btn-primary" style="flex:1"><i class="fa-solid fa-check"></i> حفظ</button>'
    +'<button id="_cf-cancel" class="btn btn-ghost" style="flex:1">إلغاء</button>'
    +'</div></div>');
  document.getElementById('_cf-save').onclick=function(){
    var map={};ov.querySelectorAll('input[data-id]').forEach(function(cb){map[cb.dataset.id]=cb.checked;});
    _cpSave('_cfPrefs',map);ov.remove();_wrapClientFormSections();_applyCFPrefs();
    if(typeof showMiniNotif==='function')showMiniNotif('<i class="fa-solid fa-sliders" style="color:var(--accent)"></i> تم تحديث إعدادات فورم العميل');
  };
  document.getElementById('_cf-cancel').onclick=function(){ov.remove();};
}

// ══ SECTION 3: تخصيص صفحة المالية ══

var _FIN_SECTIONS=[
  {id:'fin-summary-cards',    label:'بطاقات الملخص'},
  {id:'fin-unpaid-reminders', label:'تذكيرات المبالغ غير المحصّلة'},
  {id:'fin-loans-summary',    label:'ملخص القروض'},
  {id:'fin-monthly-timeline', label:'سجل الشهور'},
  {id:'fin-tab-transactions', label:'تاب: المعاملات'},
  {id:'fin-tab-wallets',      label:'تاب: المحافظ'},
  {id:'fin-tab-budgets',      label:'تاب: الميزانيات'},
  {id:'fin-tab-loans',        label:'تاب: القروض'},
  {id:'fin-tab-stats',        label:'تاب: الإحصائيات'},
];

function _getFinPrefs(){
  var saved=_cpLoad('_finPrefs',{});
  return _FIN_SECTIONS.map(function(f){return{id:f.id,label:f.label,visible:saved[f.id]!==false};});
}

function _applyFinPrefs(){
  _getFinPrefs().forEach(function(p){var el=document.getElementById(p.id);if(el)el.style.display=p.visible?'':'none';});
}

function _openFinSettings(){
  var prefs=_getFinPrefs();
  var rows=prefs.map(function(p){
    return '<label style="display:flex;align-items:center;gap:10px;padding:10px 13px;border-radius:11px;background:var(--surface2);margin-bottom:6px;cursor:pointer;font-size:13px;font-weight:600;color:var(--text)">'
      +'<input type="checkbox" data-id="'+p.id+'" '+(p.visible?'checked':'')
      +' style="width:17px;height:17px;accent-color:var(--accent);cursor:pointer"> '+p.label+'</label>';
  }).join('');
  var ov=_cpModal('_fin-settings-modal',
    '<div style="background:var(--surface);width:min(400px,93vw);border-radius:20px;padding:26px;box-shadow:0 24px 80px rgba(0,0,0,.5);max-height:85vh;overflow-y:auto">'
    +'<div style="font-size:16px;font-weight:900;text-align:center;margin-bottom:6px;color:var(--text)"><i class="fa-solid fa-sliders" style="color:var(--accent)"></i> تخصيص صفحة المالية</div>'
    +'<div style="font-size:12px;color:var(--text3);text-align:center;margin-bottom:18px">اختر الأقسام اللي عايزها تظهر</div>'
    +rows
    +'<div style="display:flex;gap:10px;margin-top:18px">'
    +'<button id="_fin-save" class="btn btn-primary" style="flex:1"><i class="fa-solid fa-check"></i> حفظ</button>'
    +'<button id="_fin-cancel" class="btn btn-ghost" style="flex:1">إلغاء</button>'
    +'</div></div>');
  document.getElementById('_fin-save').onclick=function(){
    var map={};ov.querySelectorAll('input[data-id]').forEach(function(cb){map[cb.dataset.id]=cb.checked;});
    _cpSave('_finPrefs',map);ov.remove();_applyFinPrefs();
    if(typeof showMiniNotif==='function')showMiniNotif('<i class="fa-solid fa-sliders" style="color:var(--accent)"></i> تم تحديث إعدادات المالية');
  };
  document.getElementById('_fin-cancel').onclick=function(){ov.remove();};
}

// ══ SECTION 4: صفحة المهام - عرض افتراضي ══

var _TASKS_VIEW_KEY='_tasksDefaultView';

function _openTasksPageSettings(){
  var cur=localStorage.getItem(_TASKS_VIEW_KEY)||'kanban';
  var mkOpt=function(val,icon,label){
    var a=cur===val;
    return '<label style="flex:1;display:flex;align-items:center;justify-content:center;gap:7px;padding:12px;border-radius:10px;cursor:pointer;border:2px solid '+(a?'var(--accent)':'var(--border)')+';background:'+(a?'rgba(124,111,247,.12)':'none')+';font-size:13px;font-weight:700;color:'+(a?'var(--accent)':'var(--text2)')+'">'
      +'<input type="radio" name="_tpv" value="'+val+'" '+(a?'checked':'')
      +' style="display:none"><i class="fa-solid '+icon+'"></i> '+label+'</label>';
  };
  var ov=_cpModal('_tasks-page-settings-modal',
    '<div style="background:var(--surface);width:min(360px,93vw);border-radius:20px;padding:26px;box-shadow:0 24px 80px rgba(0,0,0,.5)">'
    +'<div style="font-size:16px;font-weight:900;text-align:center;margin-bottom:6px;color:var(--text)"><i class="fa-solid fa-sliders" style="color:var(--accent)"></i> تخصيص صفحة المهام</div>'
    +'<div style="font-size:12px;color:var(--text3);text-align:center;margin-bottom:18px">اختار العرض الافتراضي</div>'
    +'<div style="display:flex;gap:10px;margin-bottom:20px">'
    +mkOpt('kanban','clipboard-list','كانبان')
    +mkOpt('list','table-list','قائمة')
    +'</div>'
    +'<div style="display:flex;gap:10px">'
    +'<button id="_tp-save" class="btn btn-primary" style="flex:1"><i class="fa-solid fa-check"></i> حفظ</button>'
    +'<button id="_tp-cancel" class="btn btn-ghost" style="flex:1">إلغاء</button>'
    +'</div></div>');
  ov.querySelectorAll('input[name="_tpv"]').forEach(function(r){
    r.addEventListener('change',function(){
      ov.querySelectorAll('label').forEach(function(lbl){
        var rd=lbl.querySelector('input[type=radio]');if(!rd)return;
        lbl.style.borderColor=rd.checked?'var(--accent)':'var(--border)';
        lbl.style.background=rd.checked?'rgba(124,111,247,.12)':'none';
        lbl.style.color=rd.checked?'var(--accent)':'var(--text2)';
      });
    });
  });
  document.getElementById('_tp-save').onclick=function(){
    var sel=(ov.querySelector('input[name="_tpv"]:checked')||{}).value||'kanban';
    localStorage.setItem(_TASKS_VIEW_KEY,sel);ov.remove();
    if(typeof switchTaskView==='function')switchTaskView(sel);
    if(typeof showMiniNotif==='function')showMiniNotif('<i class="fa-solid fa-sliders" style="color:var(--accent)"></i> تم تحديث العرض الافتراضي');
  };
  document.getElementById('_tp-cancel').onclick=function(){ov.remove();};
}

// ══ SECTION 5: مهمة شخصية vs مهمة لعميل ══

var _currentTaskKind='client';

function _setTaskKind(kind){
  _currentTaskKind=kind;
  var ip=kind==='personal';
  var cb=document.getElementById('_tt-client-btn');
  var pb=document.getElementById('_tt-personal-btn');
  if(cb){cb.style.background=!ip?'var(--accent)':'transparent';cb.style.color=!ip?'#fff':'var(--text3)';}
  if(pb){pb.style.background=ip?'var(--accent)':'transparent';pb.style.color=ip?'#fff':'var(--text3)';}
  ['t-client-group-wrap','t-type-row-wrap','t-value-row','t-worker-section','task-inv-opt'].forEach(function(id){
    var el=document.getElementById(id);if(el)el.style.display=ip?'none':'';
  });
  var dep=document.getElementById('deposit-row');if(dep)dep.style.display='none';
  var ttl=document.getElementById('task-modal-ttl');
  var eid=(document.getElementById('task-eid')||{}).value;
  if(ttl&&!eid)ttl.innerHTML=ip?'<i class="fa-solid fa-person"></i> مهمة شخصية جديدة':'<i class="fa-solid fa-star-of-life"></i> مهمة / مشروع جديد';
  if(ip){var s2=document.getElementById('t-client');if(s2)s2._cpPrev=s2.value;_ensurePersonalClient();}
  else{var s3=document.getElementById('t-client');if(s3&&s3._cpPrev!=null)s3.value=s3._cpPrev;}
}

function _ensurePersonalClient(){
  if(!window.S)return;
  var pc=(S.clients||[]).find(function(c){return c._isPersonal;});
  if(!pc){
    pc={id:'_personal_'+Date.now(),name:'شخصي',_isPersonal:true,type:'فرد',phone:'',email:'',notes:'مهام شخصية'};
    if(!S.clients)S.clients=[];S.clients.push(pc);
    if(typeof fillDD==='function')fillDD('t-client');
  }
  var sel=document.getElementById('t-client');if(sel)sel.value=pc.name;
}

// الـ _tf-gear و _tt-kind-bar موجودين في HTML مباشرة — لا حاجة للـ injection
function _injectTaskModalControls(){
  // no-op: elements are in HTML
}

(function(){
  // الأزرار والبار موجودين في HTML — بس نشغّل _setTaskKind و _applyTFPrefs لما الموديال يتفتح
  var modalOv=document.getElementById('modal-task');if(!modalOv)return;
  var _prev='none';
  new MutationObserver(function(){
    var cur=modalOv.style.display||'';
    if(cur!=='none'&&_prev==='none'){
      _prev=cur;
      setTimeout(function(){
        _wrapTaskFormSections();
        var eid=(document.getElementById('task-eid')||{}).value||'';
        if(eid){
          var t=window.S&&S.tasks&&S.tasks.find(function(x){return String(x.id)===String(eid);});
          _setTaskKind(t&&t._isPersonal?'personal':'client');
        } else {
          _setTaskKind('client');
        }
        _applyTFPrefs();
      },60);
    } else if(cur==='none'){
      _prev='none';
    }
  }).observe(modalOv,{attributes:true,attributeFilter:['style']});
})();

// saveTask patch — الآن _beforeSaveTask بيعمل الحجز قبل الضغط، مش محتاج هنا
// بس نحتفظ بـ tag المهمة الشخصية بعد الحفظ
setTimeout(function(){
  var _orig=window.saveTask;if(!_orig)return;
  window.saveTask=function(){
    // تأكد إضافي — لو شخصي وما فيش عميل
    if(_currentTaskKind==='personal'){
      var _S=(typeof S!=='undefined')?S:null;
      if(_S){
        if(!_S.clients) _S.clients=[];
        var _pc=_S.clients.find(function(c){return c._isPersonal;});
        if(!_pc){ _pc={id:'_personal_'+Date.now(),name:'شخصي',_isPersonal:true,type:'فرد',phone:'',email:''}; _S.clients.push(_pc); if(typeof fillDD==='function') fillDD('t-client'); }
        var _sel=document.getElementById('t-client'); if(_sel&&!_sel.value) _sel.value=_pc.name;
      }
    }
    _orig.apply(this,arguments);
    // tag المهمة الشخصية بعد الحفظ
    if(_currentTaskKind==='personal'){
      var _S2=(typeof S!=='undefined')?S:null;
      if(_S2&&_S2.tasks&&_S2.tasks.length) _S2.tasks[_S2.tasks.length-1]._isPersonal=true;
    }
  };
},1200);

// ══ SECTION 6: أزرار الترس في الصفحات ══

function _injectPageGears(){
  // _cf-gear موجود في HTML مباشرة
  if(!document.getElementById('_fin-gear')){
    var finBtns=document.querySelector('#page-finance .page-header > div:last-child');
    if(finBtns){
      var g3=document.createElement('button');
      g3.id='_fin-gear';g3.className='btn btn-ghost';g3.title='تخصيص صفحة المالية';
      g3.style.cssText='width:38px;height:38px;padding:0;display:flex;align-items:center;justify-content:center;border-radius:10px';
      g3.innerHTML='<i class="fa-solid fa-sliders"></i>';
      g3.onclick=function(){_openFinSettings();};
      finBtns.appendChild(g3);
    }
  }
  if(!document.getElementById('_tasks-gear')){
    var viewWrap=document.querySelector('#tasks-scope-tabs > div:last-child');
    if(viewWrap){
      var g4=document.createElement('button');
      g4.id='_tasks-gear';g4.title='تخصيص صفحة المهام';
      g4.style.cssText='width:32px;height:32px;border-radius:7px;border:none;background:transparent;color:var(--text3);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:13px;transition:.18s';
      g4.innerHTML='<i class="fa-solid fa-sliders"></i>';
      g4.onmouseover=function(){this.style.color='var(--accent)';this.style.background='rgba(124,111,247,.15)';};
      g4.onmouseout=function(){this.style.color='var(--text3)';this.style.background='transparent';};
      g4.onclick=function(e){e.stopPropagation();_openTasksPageSettings();};
      viewWrap.appendChild(g4);
    }
  }
}

// ══ SECTION 7: Wrappers ══

function _wrapEl(el,wrapId){
  if(!el||document.getElementById(wrapId))return;
  var w=document.createElement('div');w.id=wrapId;
  el.parentNode.insertBefore(w,el);w.appendChild(el);
}

function _wrapTaskFormSections(){
  var modal=document.getElementById('modal-task');if(!modal)return;
  if(!document.getElementById('t-client-group-wrap')){
    var cs=document.getElementById('t-client');
    if(cs){var cg=cs.closest('.form-group');if(cg)_wrapEl(cg,'t-client-group-wrap');}
  }
  var jt=document.getElementById('t-jobtype');if(jt)_wrapEl(jt.closest('.form-row'),'t-type-row-wrap');
  var od=document.getElementById('t-order');if(od)_wrapEl(od.closest('.form-row'),'t-dates-row-wrap');
  var pr=document.getElementById('t-priority');if(pr)_wrapEl(pr.closest('.form-row'),'t-priority-row-wrap');
  var nt=document.getElementById('t-notes');if(nt)_wrapEl(nt.closest('.form-group'),'t-notes-row-wrap');
  var sl=document.getElementById('t-steps-list');
  if(sl){var sp=sl.parentNode;while(sp&&sp.tagName!=='DIV')sp=sp.parentNode;_wrapEl(sp||sl.parentNode,'t-steps-section-wrap');}
  var be=document.getElementById('t-brief-editor');if(be)_wrapEl(be.closest('.form-group'),'t-brief-section-wrap');
}

function _wrapClientFormSections(){
  var modal=document.getElementById('modal-client');if(!modal)return;
  var ctype=document.getElementById('c-type');if(ctype)_wrapEl(ctype.closest('.form-row'),'cf-type-phone-wrap');
  var cch=document.getElementById('c-channel');if(cch)_wrapEl(cch.closest('.form-row'),'cf-channel-field-wrap');
  var cwt=document.getElementById('c-worktype');if(cwt)_wrapEl(cwt.closest('.form-row'),'cf-worktype-wrap');
  var cn=document.getElementById('c-notes');if(cn)_wrapEl(cn.closest('.form-group'),'cf-notes-wrap');
  var cob=document.getElementById('c-opening-balance');
  if(cob){var obSec=cob.closest('div[style*="rgba(79,209"]')||cob.parentNode.parentNode;_wrapEl(obSec,'cf-opening-bal-wrap');}
  var cdna=document.getElementById('c-dna-style');
  if(cdna){var dnaSec=cdna.closest('div[style*="rgba(247,201"]')||cdna.parentNode.parentNode;_wrapEl(dnaSec,'cf-dna-wrap');}
  var csoc=document.getElementById('c-socials-list');
  if(csoc){var socSec=csoc.closest('div[style*="rgba(124,111"]')||csoc.parentNode.parentNode;_wrapEl(socSec,'cf-socials-wrap');}
  var cfu=document.getElementById('c-followup-enabled');
  if(cfu){var fuSec=cfu.closest('div[style*="rgba(247,201,.06"]')||cfu.closest('div[style*="rgba(247,201"]')||cfu.parentNode.parentNode;_wrapEl(fuSec,'cf-followup-wrap');}
}

// ══ SECTION 8: Sort + Inline Edit في جدول المهام ══

var _tableSort=_cpLoad('_taskTableSort',{col:'deadline',dir:'asc'});

function _patchTasksTable(){
  var _orig=window._renderTasksTable;if(!_orig||window._renderTasksTable._patched)return;
  window._renderTasksTable=function(){
    _orig.apply(this,arguments);
    setTimeout(function(){_injectTableSortBar();_injectTableInlineEdits();},40);
  };
  window._renderTasksTable._patched=true;
  setTimeout(function(){_injectTableSortBar();_injectTableInlineEdits();},300);
}

function _injectTableSortBar(){
  var tableView=document.getElementById('table-view');if(!tableView)return;
  if(document.getElementById('_sort-bar'))return;
  var bar=document.createElement('div');
  bar.id='_sort-bar';
  bar.style.cssText='display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;margin-bottom:8px;font-size:12px;flex-wrap:wrap';
  bar.innerHTML='<span style="color:var(--text3);font-weight:700;white-space:nowrap"><i class="fa-solid fa-arrow-up-wide-short"></i> ترتيب حسب:</span>'
    +'<button onclick="_quickSort(\'deadline\')" class="btn btn-ghost btn-sm" style="font-size:11px;padding:4px 10px">📅 التسليم</button>'
    +'<button onclick="_quickSort(\'orderDate\')" class="btn btn-ghost btn-sm" style="font-size:11px;padding:4px 10px">📋 الطلب</button>'
    +'<button onclick="_quickSort(\'priority\')" class="btn btn-ghost btn-sm" style="font-size:11px;padding:4px 10px">🔴 الأولوية</button>'
    +'<button onclick="_quickSort(\'client\')" class="btn btn-ghost btn-sm" style="font-size:11px;padding:4px 10px">👤 العميل</button>'
    +'<button onclick="_quickSort(\'status\')" class="btn btn-ghost btn-sm" style="font-size:11px;padding:4px 10px">🏷 الحالة</button>'
    +'<span id="_sort-label" style="color:var(--accent);font-weight:700;margin-right:auto;font-size:11px"></span>';
  var tbl=tableView.querySelector('table');
  if(tbl && tbl.parentNode===tableView) tableView.insertBefore(bar,tbl);
  else tableView.prepend(bar);
  _updateSortLabel();
}

function _quickSort(col){
  if(_tableSort.col===col)_tableSort.dir=_tableSort.dir==='asc'?'desc':'asc';
  else{_tableSort.col=col;_tableSort.dir='asc';}
  _cpSave('_taskTableSort',_tableSort);
  _doSortTable();
}

function _updateSortLabel(){
  var lbl=document.getElementById('_sort-label');if(!lbl)return;
  var names={deadline:'التسليم',orderDate:'الطلب',priority:'الأولوية',client:'العميل',status:'الحالة'};
  lbl.textContent=(names[_tableSort.col]||_tableSort.col)+(_tableSort.dir==='asc'?' ↑':' ↓');
}

function _doSortTable(){
  var tbody=document.getElementById('tasks-table-body');if(!tbody)return;
  var rows=Array.from(tbody.querySelectorAll('tr.tt-row'));
  var priMap={high:0,med:1,low:2};
  var stMap={progress:0,review:1,new:2,paused:3,done:4};
  rows.sort(function(a,b){
    var ta=window.S&&S.tasks&&S.tasks.find(function(t){return String(t.id)===a.dataset.tid;});
    var tb2=window.S&&S.tasks&&S.tasks.find(function(t){return String(t.id)===b.dataset.tid;});
    if(!ta||!tb2)return 0;
    var col=_tableSort.col;var dir=_tableSort.dir==='asc'?1:-1;
    var va,vb;
    if(col==='deadline'||col==='orderDate'){va=ta[col]||'9999';vb=tb2[col]||'9999';}
    else if(col==='priority'){va=priMap[ta.priority]??2;vb=priMap[tb2.priority]??2;}
    else if(col==='status'){va=stMap[ta.status]??3;vb=stMap[tb2.status]??3;}
    else{va=(ta[col]||'').toLowerCase();vb=(tb2[col]||'').toLowerCase();}
    return va<vb?-dir:va>vb?dir:0;
  });
  rows.forEach(function(r){
    tbody.appendChild(r);
    var sr=document.getElementById('steps-row-'+r.dataset.tid);if(sr)tbody.appendChild(sr);
  });
  _updateSortLabel();
}

function _injectTableInlineEdits(){
  var tbody=document.getElementById('tasks-table-body');if(!tbody||tbody.dataset.inlineOk)return;
  tbody.dataset.inlineOk='1';
  tbody.addEventListener('click',function(e){
    if(e.target.tagName==='SELECT'||e.target.closest('button')||e.target.tagName==='INPUT')return;
    var td=e.target.closest('td');if(!td)return;
    var tr=td.closest('tr.tt-row');if(!tr)return;
    var tid=tr.dataset.tid;if(!tid)return;
    var t=window.S&&S.tasks&&S.tasks.find(function(x){return String(x.id)===String(tid);});
    if(!t||td.dataset.editing)return;

    // اعرف إيه الخلية دي من رأس الجدول
    var allTds=Array.from(tr.children);
    var colIdx=allTds.indexOf(td);
    var thead=document.getElementById('tasks-table-thead');
    var thEl=thead?thead.querySelectorAll('th')[colIdx]:null;
    var colName=thEl?(thEl.textContent||'').replace(/[↑↓↕\s]/g,'').trim():'';

    function _mkInput(type,val,onSave){
      td.dataset.editing='1';
      var inp=document.createElement('input');
      inp.type=type;inp.value=val||'';
      inp.style.cssText='width:100%;border:1.5px solid var(--accent);background:var(--surface3);color:var(--text);border-radius:7px;padding:5px 8px;font-size:11px;outline:none;font-family:var(--font)';
      td.innerHTML='';td.appendChild(inp);inp.focus();
      function done(){delete td.dataset.editing;onSave(inp.value);}
      inp.addEventListener('change',done);inp.addEventListener('blur',done);
      e.stopPropagation();
    }

    function _mkSelect(options,curVal,onSave){
      td.dataset.editing='1';
      var sel=document.createElement('select');
      sel.style.cssText='border:1.5px solid var(--accent);background:var(--surface3);color:var(--text);border-radius:7px;padding:5px 8px;font-size:11px;outline:none;cursor:pointer;font-family:var(--font)';
      options.forEach(function(o){var opt=document.createElement('option');opt.value=o[0];opt.textContent=o[1];if(curVal===o[0])opt.selected=true;sel.appendChild(opt);});
      td.innerHTML='';td.appendChild(sel);sel.focus();
      function done(){delete td.dataset.editing;onSave(sel.value);}
      sel.addEventListener('change',done);sel.addEventListener('blur',done);
      e.stopPropagation();
    }

    function _save(){if(typeof lsSave==='function')lsSave();if(typeof cloudSave==='function')cloudSave(window.S);if(typeof _renderTasksTable==='function')_renderTasksTable();}

    if(colName==='تاريخ التسليم'){_mkInput('date',t.deadline,function(v){t.deadline=v;_save();});}
    else if(colName==='تاريخ الطلب'){_mkInput('date',t.orderDate,function(v){t.orderDate=v;_save();});}
    else if(colName==='الأولوية'){_mkSelect([['high','عالية — عاجل'],['med','متوسطة'],['low','منخفضة']],t.priority,function(v){t.priority=v;_save();});}
    else if(colName==='العميل'){
      var opts=(window.S&&S.clients||[]).filter(function(c){return!c._isPersonal;}).map(function(c){return[c.name,c.name];});
      _mkSelect(opts,t.client,function(v){if(v)t.client=v;_save();});
    }
  });
}

// ══ SECTION 9: التهيئة ══

function _cpInit(){
  _wrapTaskFormSections();
  _wrapClientFormSections();
  _injectPageGears();
  _applyFinPrefs();
  _applyCFPrefs();
  var dv=localStorage.getItem(_TASKS_VIEW_KEY)||'kanban';
  var pg=document.querySelector('.page.active');
  if(pg&&pg.id==='page-tasks'&&typeof switchTaskView==='function')switchTaskView(dv);
  _patchTasksTable();
}

var _origShowPage=window.showPage;
if(_origShowPage){
  window.showPage=function(id){
    _origShowPage.apply(this,arguments);
    setTimeout(function(){
      _injectPageGears();
      if(id==='finance')_applyFinPrefs();
      if(id==='tasks'){
        var dv=localStorage.getItem(_TASKS_VIEW_KEY)||'kanban';
        if(typeof switchTaskView==='function')switchTaskView(dv);
        _patchTasksTable();
        setTimeout(function(){_injectTableSortBar();_injectTableInlineEdits();},400);
      }
    },150);
  };
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(_cpInit,700);});
else setTimeout(_cpInit,700);

console.log('[CP v3] loaded');

// ── _beforeSaveTask: يحط العميل الوهمي قبل saveTask يشتغل ──
function _beforeSaveTask(){
  if(typeof _currentTaskKind === 'undefined' || _currentTaskKind !== 'personal') return;
  // تأكد إن S موجود
  var _S = (typeof S !== 'undefined') ? S : null;
  if(!_S) return;
  if(!_S.clients) _S.clients = [];
  var pc = _S.clients.find(function(c){ return c._isPersonal; });
  if(!pc){
    pc = {id:'_personal_'+Date.now(), name:'شخصي', _isPersonal:true, type:'فرد', phone:'', email:''};
    _S.clients.push(pc);
    if(typeof fillDD === 'function') fillDD('t-client');
  }
  // ضع قيمة العميل في الـ select قبل saveTask
  var sel = document.getElementById('t-client');
  if(sel) sel.value = pc.name;
}