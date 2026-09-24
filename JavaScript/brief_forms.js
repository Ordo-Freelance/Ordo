(function(){
  'use strict';
  function state(){ return window.S || {}; }
  function forms(){ var s=state(); return s.brief_forms||(s.brief_forms=[]); }
  function esc(value){ return window.escapeHtml ? escapeHtml(String(value??'')) : String(value??'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function id(){ return 'brief_'+Date.now()+'_'+Math.random().toString(36).slice(2,9); }
  function persist(){
    if(typeof window.lsSave==='function') lsSave();
    if(typeof window.cloudSave==='function') cloudSave(state());
  }
  function notice(text){ if(typeof window.toast==='function') toast(text); else alert(text.replace(/<[^>]+>/g,'')); }
  function clientOptions(selected){
    return '<option value="">اختر العميل</option>'+(state().clients||[]).map(function(c){return '<option value="'+esc(c.id)+'"'+(String(c.id)===String(selected)?' selected':'')+'>'+esc(c.name||'عميل')+'</option>';}).join('');
  }
  function projectOptions(clientId,selected){
    return '<option value="">بدون مشروع مرتبط</option>'+(state().projects||[]).filter(function(p){return String(p.client_id||p.clientId||'')===String(clientId||'');}).map(function(p){return '<option value="'+esc(p.id)+'"'+(String(p.id)===String(selected)?' selected':'')+'>'+esc(p.name||'مشروع')+'</option>';}).join('');
  }
  function questionMarkup(q){
    q=q||{};
    return '<div class="brief-editor-block brief-question" data-id="'+esc(q.id||id())+'">'+
      '<div class="brief-editor-line"><input class="form-input brief-q-label" placeholder="نص السؤال" value="'+esc(q.label||'')+'"><select class="form-select brief-q-type" onchange="briefQuestionTypeChanged(this)">'+
      ['essay','checkbox','image'].map(function(type){return '<option value="'+type+'"'+(type===(q.type||'essay')?' selected':'')+'>'+({essay:'إجابة مقالية',checkbox:'اختيارات متعددة',image:'اختيار صورة'}[type])+'</option>';}).join('')+'</select>'+
      '<button type="button" class="btn btn-ghost btn-sm" onclick="this.closest(\'.brief-question\').remove()" aria-label="حذف السؤال"><i class="fa-solid fa-trash"></i></button></div>'+
      '<input class="form-input brief-q-desc" placeholder="وصف أو توضيح للسؤال (اختياري)" value="'+esc(q.description||'')+'">'+
      '<label class="brief-required"><input type="checkbox" class="brief-q-required"'+(q.required?' checked':'')+'> إجابة مطلوبة</label>'+
      '<div class="brief-options" style="'+((q.type||'essay')==='essay'?'display:none':'')+'"><small>كل سطر اختيار مستقل'+(q.type==='image'?' بصيغة: عنوان الاختيار | رابط الصورة':'')+'</small><textarea class="form-textarea brief-q-options" rows="3" placeholder="اختيار ١&#10;اختيار ٢">'+esc((q.options||[]).map(function(o){return typeof o==='string'?o:(o.label||'')+(o.image_url?' | '+o.image_url:'');}).join('\n'))+'</textarea></div>'+
      '</div>';
  }
  function itemMarkup(item){
    item=item||{};
    return '<div class="brief-editor-block brief-item" data-id="'+esc(item.id||id())+'"><div class="brief-editor-line"><input class="form-input brief-item-title" placeholder="عنوان البند" value="'+esc(item.title||'')+'"><button type="button" class="btn btn-ghost btn-sm" onclick="this.closest(\'.brief-item\').remove()" aria-label="حذف البند"><i class="fa-solid fa-trash"></i></button></div><textarea class="form-textarea brief-item-desc" rows="2" placeholder="وصف البند">'+esc(item.description||'')+'</textarea></div>';
  }
  function find(formId){ return forms().find(function(f){return String(f.id)===String(formId);}); }
  window.briefQuestionTypeChanged=function(select){
    var block=select.closest('.brief-question');
    var options=block&&block.querySelector('.brief-options');
    if(options){options.style.display=select.value==='essay'?'none':''; options.querySelector('small').textContent=select.value==='image'?'كل سطر بصيغة: عنوان الاختيار | رابط الصورة':'كل سطر اختيار مستقل';}
  };
  window.briefAddQuestion=function(){ var wrap=document.getElementById('brief-questions'); if(wrap)wrap.insertAdjacentHTML('beforeend',questionMarkup()); };
  window.briefAddItem=function(){ var wrap=document.getElementById('brief-items'); if(wrap)wrap.insertAdjacentHTML('beforeend',itemMarkup()); };
  window.briefClientChanged=function(){
    var clientId=document.getElementById('brief-client')?.value||'';
    var project=document.getElementById('brief-project');
    if(project)project.innerHTML=projectOptions(clientId,'');
  };
  window.renderBriefForms=function(){
    var panel=document.getElementById('inv-panel-briefs');
    if(!panel)return;
    var rows=forms().slice().sort(function(a,b){return String(b.createdAt||'').localeCompare(String(a.createdAt||''));});
    panel.innerHTML='<div class="brief-panel-heading"><div><h3>البريفات والاستبيانات</h3><p>أنشئ بنودًا وأسئلة وأرسلها من بوابة العميل. بعد وصول الإجابات يمكنك اعتمادها وربطها بالمشروع.</p></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-ghost" onclick="_pollPublicInbox().then(renderBriefForms)"><i class="fa-solid fa-rotate"></i> تحديث الردود</button><button class="btn btn-primary" onclick="openBriefForm()"><i class="fa-solid fa-plus"></i> بريف جديد</button></div></div>'+
      (rows.length?'<div class="brief-list">'+rows.map(function(f){
        var client=(state().clients||[]).find(function(c){return String(c.id)===String(f.client_id);});
        var project=(state().projects||[]).find(function(p){return String(p.id)===String(f.project_id);});
        var labels={draft:'مسودة',sent:'أُرسل للعميل',submitted:'وصل الرد',accepted:'معتمد'};
        var formId=esc(f.id);
        return '<article class="card brief-card"><div class="brief-card-top"><div><h4>'+esc(f.title||'بريف بدون عنوان')+'</h4><small>'+esc(client?.name||'بدون عميل')+(project?' · '+esc(project.name):'')+'</small></div><span class="brief-status brief-status-'+esc(f.status||'draft')+'">'+(labels[f.status]||'مسودة')+'</span></div><p>'+esc(f.description||'')+'</p><div class="brief-card-actions">'+
          '<button class="btn btn-ghost btn-sm" data-id="'+formId+'" onclick="openBriefForm(this.dataset.id)"><i class="fa-solid fa-eye"></i> '+(f.status==='draft'?'تعديل':'عرض')+'</button>'+
          (f.status==='draft'?'<button class="btn btn-primary btn-sm" data-id="'+formId+'" onclick="sendBriefForm(this.dataset.id)"><i class="fa-solid fa-paper-plane"></i> إرسال للعميل</button>':'')+
          (f.status==='sent'?'<button class="btn btn-ghost btn-sm" data-id="'+formId+'" onclick="copyBriefLink(this.dataset.id)"><i class="fa-solid fa-link"></i> نسخ الرابط</button>':'')+
          (f.status==='submitted'?'<button class="btn btn-success btn-sm" data-id="'+formId+'" onclick="acceptBriefForm(this.dataset.id)"><i class="fa-solid fa-check"></i> اعتماد وربط بالمشروع</button>':'')+
          '</div></article>';
      }).join('')+'</div>':'<div class="card brief-empty"><i class="fa-solid fa-clipboard-question"></i><h3>لا توجد بريفات بعد</h3><p>أنشئ أول نموذج لتجميع تفاصيل العمل من العميل.</p></div>');
  };
  window.openBriefForm=function(formId){
    var form=formId?find(formId):null;
    if(formId&&!form)return;
    document.getElementById('brief-editor-overlay')?.remove();
    var overlay=document.createElement('div');overlay.id='brief-editor-overlay';overlay.className='modal-overlay';overlay.style.display='flex';
    overlay.onclick=function(event){if(event.target===overlay)overlay.remove();};
    var readonly=form&&form.status!=='draft';
    var fields='<div class="brief-grid"><div class="form-group"><label class="form-label">اسم النموذج *</label><input class="form-input" id="brief-title" maxlength="160" value="'+esc(form?.title||'')+'" placeholder="مثال: بريف تصميم الهوية"></div><div class="form-group"><label class="form-label">العميل *</label><select class="form-select" id="brief-client" onchange="briefClientChanged()">'+clientOptions(form?.client_id)+'</select></div></div>'+
      '<div class="brief-grid"><div class="form-group"><label class="form-label">المشروع المرتبط</label><select class="form-select" id="brief-project">'+projectOptions(form?.client_id,form?.project_id)+'</select></div><div class="form-group"><label class="form-label">وصف مختصر</label><input class="form-input" id="brief-description" value="'+esc(form?.description||'')+'" placeholder="ما المطلوب من العميل؟"></div></div>'+
      '<section class="brief-editor-section"><div class="brief-section-head"><h4>البنود والتوضيحات</h4>'+(!readonly?'<button class="btn btn-ghost btn-sm" onclick="briefAddItem()">+ بند</button>':'')+'</div><div id="brief-items">'+(form?.items||[]).map(itemMarkup).join('')+'</div></section>'+
      '<section class="brief-editor-section"><div class="brief-section-head"><h4>الأسئلة</h4>'+(!readonly?'<button class="btn btn-ghost btn-sm" onclick="briefAddQuestion()">+ سؤال</button>':'')+'</div><div id="brief-questions">'+(form?.questions||[]).map(questionMarkup).join('')+'</div></section>';
    var answers='';
    if(form?.answers){
      answers='<section class="brief-editor-section"><h4>إجابات العميل</h4>'+(form.questions||[]).map(function(q){var answer=form.answers[q.id];var choice=Array.isArray(answer)?answer.join('، '):answer;return '<div class="brief-answer"><b>'+esc(q.label)+'</b><p>'+esc(choice||'—')+'</p></div>';}).join('')+'</section>';
    }
    overlay.innerHTML='<div class="modal brief-editor" dir="rtl"><div class="modal-header"><div class="modal-title"><i class="fa-solid fa-clipboard-question"></i> '+(form?'البريف':'بريف جديد')+'</div><button class="close-btn" onclick="document.getElementById(\'brief-editor-overlay\').remove()"><i class="fa-solid fa-xmark"></i></button></div><div class="brief-editor-content" id="brief-editor-content" data-id="'+esc(form?.id||'')+'">'+fields+answers+'</div><div class="brief-editor-footer">'+(!readonly?'<button class="btn btn-primary" onclick="saveBriefForm()"><i class="fa-solid fa-floppy-disk"></i> حفظ البريف</button>':'')+(form?.status==='submitted'?'<button class="btn btn-primary" data-id="'+esc(form.id)+'" onclick="briefAssignProject(this.dataset.id)">حفظ ربط المشروع</button>':'')+'<button class="btn btn-ghost" onclick="document.getElementById(\'brief-editor-overlay\').remove()">إغلاق</button></div></div>';
    document.body.appendChild(overlay);
    if(readonly)overlay.querySelectorAll('#brief-editor-content input,#brief-editor-content select,#brief-editor-content textarea,#brief-editor-content .brief-editor-block button').forEach(function(el){if(form.status!=='submitted'||el.id!=='brief-project')el.disabled=true;});
    if(!form)briefAddQuestion();
  };
  window.saveBriefForm=function(){
    var body=document.getElementById('brief-editor-content');if(!body)return;
    var form=body.dataset.id?find(body.dataset.id):null;
    if(form&&form.status!=='draft')return;
    var title=document.getElementById('brief-title').value.trim();
    var clientId=document.getElementById('brief-client').value;
    if(!title||!clientId){notice('أدخل اسم النموذج واختر العميل');return;}
    var items=[...body.querySelectorAll('.brief-item')].map(function(el){return {id:el.dataset.id,title:el.querySelector('.brief-item-title').value.trim(),description:el.querySelector('.brief-item-desc').value.trim()};}).filter(function(item){return item.title;});
    var questions=[...body.querySelectorAll('.brief-question')].map(function(el){
      var type=el.querySelector('.brief-q-type').value;
      var raw=el.querySelector('.brief-q-options').value.split('\n').map(function(v){return v.trim();}).filter(Boolean);
      var options=type==='image'?raw.map(function(row){var parts=row.split('|');return {label:parts[0]?.trim()||'',image_url:parts.slice(1).join('|').trim()};}).filter(function(o){return o.label&&/^https?:\/\//i.test(o.image_url);}):raw.map(function(label){return {label:label};});
      return {id:el.dataset.id,label:el.querySelector('.brief-q-label').value.trim(),description:el.querySelector('.brief-q-desc').value.trim(),type:type,required:el.querySelector('.brief-q-required').checked,options:options};
    }).filter(function(q){return q.label;});
    if(!items.length&&!questions.length){notice('أضف بندًا أو سؤالًا واحدًا على الأقل');return;}
    if(questions.some(function(q){return q.type!=='essay'&&q.options.length<2;})){notice('أضف اختيارين على الأقل لكل سؤال اختيارات أو صور، واستخدم روابط صور صحيحة');return;}
    var data={title:title,description:document.getElementById('brief-description').value.trim(),client_id:clientId,project_id:document.getElementById('brief-project').value||'',items:items,questions:questions,updatedAt:new Date().toISOString()};
    if(form)Object.assign(form,data);else forms().push(Object.assign({id:id(),status:'draft',createdAt:new Date().toISOString()},data));
    persist();document.getElementById('brief-editor-overlay').remove();renderBriefForms();notice('تم حفظ البريف');
  };
  window.copyBriefLink=function(formId){
    var form=find(formId);if(!form)return;
    var url=typeof window._shortPortalUrl==='function'?_shortPortalUrl(form.client_id):location.origin+'/clients';
    url+=(url.includes('?')?'&':'?')+'tab=briefs';
    if(navigator.clipboard?.writeText)navigator.clipboard.writeText(url).then(function(){notice('تم نسخ رابط البريف');}).catch(function(){window.prompt('رابط البريف',url);});
    else window.prompt('رابط البريف',url);
  };
  window.sendBriefForm=function(formId){
    var form=find(formId);if(!form||form.status!=='draft')return;
    if(!form.client_id){notice('اختر العميل أولًا');return;}
    var url=typeof window._shortPortalUrl==='function'?_shortPortalUrl(form.client_id):'';
    if(!url||url.endsWith('/clients')){notice('أنشئ بوابة للعميل أولًا');return;}
    form.status='sent';form.sentAt=new Date().toISOString();form.updatedAt=form.sentAt;persist();renderBriefForms();copyBriefLink(formId);
  };
  window.briefAssignProject=function(formId){
    var form=find(formId);if(!form||form.status!=='submitted')return;
    var projectId=document.getElementById('brief-project')?.value||'';
    if(!projectId){notice('اختر مشروعًا لربط البريف');return;}
    form.project_id=projectId;form.updatedAt=new Date().toISOString();persist();renderBriefForms();notice('تم ربط البريف بالمشروع');
  };
  window.acceptBriefForm=function(formId){
    var form=find(formId);if(!form||form.status!=='submitted')return;
    var project=(state().projects||[]).find(function(p){return String(p.id)===String(form.project_id);});
    if(!project){openBriefForm(formId);notice('اختر مشروعًا واحفظ الربط قبل الاعتماد');return;}
    project.brief={form_id:form.id,title:form.title,description:form.description,items:form.items,questions:form.questions,answers:form.answers,acceptedAt:new Date().toISOString()};
    project.briefAnswers=form.answers;
    project.briefUpdatedAt=project.brief.acceptedAt;
    project.updatedAt=project.brief.acceptedAt;project._dirty=true;
    form.status='accepted';form.acceptedAt=project.brief.acceptedAt;form.updatedAt=form.acceptedAt;
    if(window.OrdoData?.markDirty)OrdoData.markDirty('projects',project.id);
    persist();renderBriefForms();notice('تم اعتماد البريف وإضافته إلى بيانات المشروع');
  };
  var style=document.createElement('style');
  style.textContent='.brief-panel-heading{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:16px}.brief-panel-heading h3{margin:0;font-size:18px}.brief-panel-heading p{margin:4px 0 0;color:var(--text3);font-size:12px}.brief-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:12px}.brief-card h4{margin:0 0 4px}.brief-card p{color:var(--text3);font-size:12px}.brief-card-top,.brief-card-actions,.brief-section-head,.brief-editor-line,.brief-editor-footer{display:flex;align-items:center;justify-content:space-between;gap:10px}.brief-card-actions{justify-content:flex-start;flex-wrap:wrap}.brief-status{font-size:11px;padding:5px 10px;border-radius:20px;background:var(--surface2);white-space:nowrap}.brief-status-submitted{color:var(--accent3)}.brief-status-accepted{color:var(--accent3)}.brief-editor{width:min(820px,96vw);max-height:min(90dvh,900px);display:flex;flex-direction:column}.brief-editor-content{overflow:auto;padding:18px}.brief-editor-footer{justify-content:flex-start;padding:14px 18px;border-top:1px solid var(--border)}.brief-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.brief-editor-section{border-top:1px solid var(--border);padding-top:15px;margin-top:15px}.brief-editor-section h4{margin:0 0 12px}.brief-editor-block{background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px;margin:10px 0}.brief-editor-block .form-input,.brief-editor-block .form-textarea{margin-bottom:8px}.brief-editor-line .form-input{flex:1}.brief-q-type{width:170px}.brief-required{font-size:12px;display:flex;align-items:center;gap:6px;margin-bottom:8px}.brief-options small{display:block;color:var(--text3);margin-bottom:5px}.brief-answer{border-bottom:1px solid var(--border);padding:8px 0}.brief-answer p{white-space:pre-wrap}.brief-empty{text-align:center;padding:40px}.brief-empty i{font-size:30px;color:var(--text3)}@media(max-width:650px){.brief-grid{grid-template-columns:1fr}.brief-panel-heading{align-items:flex-start;flex-direction:column}.brief-editor-line{flex-wrap:wrap}.brief-q-type{width:auto}}';
  document.head.appendChild(style);
})();
