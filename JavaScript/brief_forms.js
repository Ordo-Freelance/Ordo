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
    return '<option value="">قالب عام — اختر العميل عند الإرسال</option>'+(state().clients||[]).map(function(c){return '<option value="'+esc(c.id)+'"'+(String(c.id)===String(selected)?' selected':'')+'>'+esc(c.name||'عميل')+'</option>';}).join('');
  }
  function projectOptions(clientId,selected){
    return '<option value="">بدون مشروع مرتبط</option>'+(state().projects||[]).filter(function(p){return String(p.client_id||p.clientId||'')===String(clientId||'');}).map(function(p){return '<option value="'+esc(p.id)+'"'+(String(p.id)===String(selected)?' selected':'')+'>'+esc(p.name||'مشروع')+'</option>';}).join('');
  }
  function questionMarkup(q){
    q=q||{};
    var types={section:'عنوان قسم',short:'إجابة قصيرة',essay:'إجابة طويلة',radio:'اختيار واحد',checkbox:'مربعات اختيار',select:'قائمة منسدلة',toggle:'نعم / لا',scale:'مقياس 1–5',image:'اختيار صور'};
    var type=q.type||'essay',optionTypes=['radio','checkbox','select'];
    return '<div class="brief-editor-block brief-question" data-id="'+esc(q.id||id())+'">'+
      '<div class="brief-editor-line"><input class="form-input brief-q-label" placeholder="نص السؤال" value="'+esc(q.label||'')+'"><select class="form-select brief-q-type" onchange="briefQuestionTypeChanged(this)">'+
      Object.keys(types).map(function(type){return '<option value="'+type+'"'+(type===(q.type||'essay')?' selected':'')+'>'+types[type]+'</option>';}).join('')+'</select>'+
      '<button type="button" class="btn btn-ghost btn-sm" onclick="briefMoveQuestion(this,-1)" aria-label="تحريك السؤال لأعلى"><i class="fa-solid fa-arrow-up"></i></button><button type="button" class="btn btn-ghost btn-sm" onclick="briefMoveQuestion(this,1)" aria-label="تحريك السؤال لأسفل"><i class="fa-solid fa-arrow-down"></i></button><button type="button" class="btn btn-ghost btn-sm" onclick="this.closest(\'.brief-question\').remove()" aria-label="حذف السؤال"><i class="fa-solid fa-trash"></i></button></div>'+
      '<input class="form-input brief-q-desc" placeholder="وصف أو توضيح للسؤال (اختياري)" value="'+esc(q.description||'')+'">'+
      '<label class="brief-required" style="'+(type==='section'?'display:none':'')+'"><input type="checkbox" class="brief-q-required"'+(q.required?' checked':'')+'> إجابة مطلوبة</label>'+
      '<div class="brief-options" style="'+(optionTypes.includes(type)?'':'display:none')+'"><small>الاختيارات التي سيشاهدها العميل — اكتب كل اختيار في سطر مستقل.</small><div class="brief-option-list">'+(optionTypes.includes(type)?(q.options||[]).map(function(o){return optionMarkup(o,type);}).join(''):'')+'</div><button type="button" class="btn btn-ghost btn-sm" onclick="briefAddOption(this)"><i class="fa-solid fa-plus"></i> إضافة اختيار</button><div class="brief-select-preview" style="'+(type==='select'?'':'display:none')+'"><small>معاينة القائمة المنسدلة</small><select class="form-select" disabled><option>اختر إجابة</option></select></div></div>'+
      '<div class="brief-answer-preview" style="'+(['short','essay','toggle','scale'].includes(type)?'':'display:none')+'">'+answerPreview(type)+'</div>'+
      '<div class="brief-image-options" style="'+(q.type==='image'?'':'display:none')+'"><small>اكتب اسم الاختيار ثم ارفع صورته من جهازك (بحد أقصى 400 كيلوبايت للصورة بعد الضغط).</small><div class="brief-image-list">'+(q.type==='image'?(q.options||[]).map(imageOptionMarkup).join(''):'')+'</div><button type="button" class="btn btn-ghost btn-sm" onclick="briefAddImageOption(this)">+ صورة اختيار</button></div>'+
      '</div>';
  }
  function optionMarkup(option,type){var label=typeof option==='string'?option:option?.label||'';return '<div class="brief-option-row"><span class="brief-option-indicator">'+(type==='checkbox'?'<i class="fa-regular fa-square"></i>':type==='radio'?'<i class="fa-regular fa-circle"></i>':'<i class="fa-solid fa-list"></i>')+'</span><input class="form-input brief-option-label" value="'+esc(label)+'" placeholder="اكتب الاختيار" oninput="briefOptionChanged(this)"><button type="button" class="btn btn-ghost btn-sm" onclick="briefRemoveOption(this)" aria-label="حذف الاختيار"><i class="fa-solid fa-trash"></i></button></div>';}
  function answerPreview(type){if(type==='short')return '<input class="form-input" placeholder="معاينة إجابة قصيرة" disabled>';if(type==='essay')return '<textarea class="form-textarea" rows="2" placeholder="معاينة إجابة طويلة" disabled></textarea>';if(type==='toggle')return '<div class="brief-preview-toggle"><span>نعم</span><span>لا</span></div>';if(type==='scale')return '<div class="brief-preview-scale">'+[1,2,3,4,5].map(function(n){return '<span>'+n+'</span>';}).join('')+'</div>';return '';}
  window.briefAddOption=function(button){var block=button.closest('.brief-question'),list=block.querySelector('.brief-option-list');list.insertAdjacentHTML('beforeend',optionMarkup('',block.querySelector('.brief-q-type').value));briefRefreshSelectPreview(block);};
  window.briefRemoveOption=function(button){var block=button.closest('.brief-question');button.closest('.brief-option-row').remove();briefRefreshSelectPreview(block);};
  function briefRefreshSelectPreview(block){var select=block.querySelector('.brief-select-preview select');if(!select)return;select.innerHTML='<option>اختر إجابة</option>'+[...block.querySelectorAll('.brief-option-label')].map(function(input){return input.value.trim();}).filter(Boolean).map(function(value){return '<option>'+esc(value)+'</option>';}).join('');}
  window.briefOptionChanged=function(input){briefRefreshSelectPreview(input.closest('.brief-question'));};
  function imageOptionMarkup(option){var o=typeof option==='string'?{label:option}:option||{};var src=/^(data:image\/(?:png|jpeg|webp);base64,|https:\/\/)/i.test(o.image_url||'')?o.image_url:'';return '<div class="brief-image-option"><input class="form-input brief-image-label" placeholder="اسم الخيار، مثل: شعار نصي" value="'+esc(o.label||'')+'"><label class="btn btn-ghost btn-sm">رفع صورة<input type="file" accept="image/png,image/jpeg,image/webp" hidden onchange="briefUploadImageOption(this)"></label><img class="brief-image-preview" src="'+esc(src)+'" alt="معاينة الاختيار" style="'+(src?'':'display:none')+'"><input type="hidden" class="brief-image-data" value="'+esc(src)+'"><button type="button" class="btn btn-ghost btn-sm" onclick="this.closest(\'.brief-image-option\').remove()" aria-label="حذف الاختيار"><i class="fa-solid fa-trash"></i></button></div>';}
  window.briefAddImageOption=function(button){button.closest('.brief-image-options').querySelector('.brief-image-list').insertAdjacentHTML('beforeend',imageOptionMarkup());};
  function compressImage(file,maxWidth,maxHeight,quality){return new Promise(function(resolve,reject){if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>5*1024*1024){reject(new Error('اختر PNG أو JPG أو WebP بحجم لا يتجاوز 5 ميجابايت'));return;}var reader=new FileReader();reader.onerror=function(){reject(new Error('تعذر قراءة الصورة'));};reader.onload=function(){var img=new Image();img.onerror=function(){reject(new Error('الصورة غير صالحة'));};img.onload=function(){var ratio=Math.min(1,maxWidth/img.width,maxHeight/img.height),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*ratio));canvas.height=Math.max(1,Math.round(img.height*ratio));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);var data=canvas.toDataURL('image/webp',quality);if(data.length>550000)reject(new Error('الصورة كبيرة بعد الضغط؛ اختر صورة أصغر'));else resolve(data);};img.src=reader.result;};reader.readAsDataURL(file);});}
  window.briefUploadImageOption=async function(input){var file=input.files?.[0];if(!file)return;try{var data=await compressImage(file,640,420,.72),row=input.closest('.brief-image-option');row.querySelector('.brief-image-data').value=data;var img=row.querySelector('.brief-image-preview');img.src=data;img.style.display='block';}catch(error){notice(error.message);}input.value='';};
  window.briefUploadBanner=async function(input){var file=input.files?.[0];if(!file)return;try{var data=await compressImage(file,1600,500,.75);document.getElementById('brief-banner-data').value=data;var img=document.getElementById('brief-banner-preview');img.src=data;img.style.display='block';}catch(error){notice(error.message);}input.value='';};
  window.briefRemoveBanner=function(){document.getElementById('brief-banner-data').value='';document.getElementById('brief-banner-preview').style.display='none';};
  function itemMarkup(item){
    item=item||{};
    return '<div class="brief-editor-block brief-item" data-id="'+esc(item.id||id())+'"><div class="brief-editor-line"><input class="form-input brief-item-title" placeholder="عنوان البند" value="'+esc(item.title||'')+'"><button type="button" class="btn btn-ghost btn-sm" onclick="this.closest(\'.brief-item\').remove()" aria-label="حذف البند"><i class="fa-solid fa-trash"></i></button></div><textarea class="form-textarea brief-item-desc" rows="2" placeholder="وصف البند">'+esc(item.description||'')+'</textarea></div>';
  }
  function find(formId){ return forms().find(function(f){return String(f.id)===String(formId);}); }
  window.briefQuestionTypeChanged=function(select){
    var block=select.closest('.brief-question');
    var options=block&&block.querySelector('.brief-options');
    if(options)options.style.display=['radio','checkbox','select'].includes(select.value)?'':'none';
    var images=block&&block.querySelector('.brief-image-options');if(images)images.style.display=select.value==='image'?'':'none';
    var required=block&&block.querySelector('.brief-required');if(required)required.style.display=select.value==='section'?'none':'';
    var list=block?.querySelector('.brief-option-list');if(list){list.querySelectorAll('.brief-option-indicator').forEach(function(icon){icon.innerHTML=select.value==='checkbox'?'<i class="fa-regular fa-square"></i>':select.value==='radio'?'<i class="fa-regular fa-circle"></i>':'<i class="fa-solid fa-list"></i>';});if(['radio','checkbox','select'].includes(select.value)&&!list.children.length){list.insertAdjacentHTML('beforeend',optionMarkup('','checkbox'===select.value?'checkbox':select.value));list.insertAdjacentHTML('beforeend',optionMarkup('','checkbox'===select.value?'checkbox':select.value));}}
    var selectPreview=block?.querySelector('.brief-select-preview');if(selectPreview)selectPreview.style.display=select.value==='select'?'':'none';
    var answer=block?.querySelector('.brief-answer-preview');if(answer){answer.style.display=['short','essay','toggle','scale'].includes(select.value)?'':'none';answer.innerHTML=answerPreview(select.value);}
    briefRefreshSelectPreview(block);
  };
  window.briefAddQuestion=function(type){ var wrap=document.getElementById('brief-questions'); if(wrap)wrap.insertAdjacentHTML('beforeend',questionMarkup(type==='section'?{type:'section',label:'مرحلة جديدة'}:{})); };
  window.briefMoveQuestion=function(button,direction){var block=button.closest('.brief-question');if(!block)return;if(direction<0&&block.previousElementSibling)block.parentNode.insertBefore(block,block.previousElementSibling);else if(direction>0&&block.nextElementSibling)block.parentNode.insertBefore(block.nextElementSibling,block);};
  window.briefAddItem=function(){ var wrap=document.getElementById('brief-items'); if(wrap)wrap.insertAdjacentHTML('beforeend',itemMarkup()); };
  window.briefClientChanged=function(){
    var clientId=document.getElementById('brief-client')?.value||'';
    var project=document.getElementById('brief-project');
    if(project)project.innerHTML=projectOptions(clientId,'');
  };
  window.openBriefTemplate=function(kind){
    var form=window.OrdoBriefTemplates?.build(kind);
    if(!form){notice('تعذر تجهيز القالب');return;}
    forms().push(form);persist();renderBriefForms();openBriefForm(form.id);notice('تم إنشاء القالب؛ يمكنك مراجعته وتخصيصه');
  };
  window.briefApplyTemplate=function(kind){
    if(!kind)return;
    var template=window.OrdoBriefTemplates?.build(kind),wrap=document.getElementById('brief-questions');
    if(!template||!wrap)return;
    if(wrap.children.length&&!window.confirm('سيتم استبدال الأسئلة والبنود الحالية بالقالب المختار. هل تريد المتابعة؟')){document.getElementById('brief-template-select').value='';return;}
    document.getElementById('brief-title').value=template.title||'';
    document.getElementById('brief-description').value=template.description||'';
    document.getElementById('brief-items').innerHTML=(template.items||[]).map(itemMarkup).join('');
    wrap.innerHTML=(template.questions||[]).map(questionMarkup).join('');
    notice('تم تحميل القالب داخل النموذج؛ راجعه ثم احفظه');
  };
  window.openVisualIdentityBrief=function(){openBriefTemplate('identity');};
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
        return '<article class="card brief-card"><div class="brief-card-top"><div><h4>'+esc(f.title||'بريف بدون عنوان')+'</h4><small>'+esc(client?.name||'قالب عام')+(project?' · '+esc(project.name):'')+'</small></div><span class="brief-status brief-status-'+esc(f.status||'draft')+'">'+(labels[f.status]||'مسودة')+'</span></div><p>'+esc(f.description||'')+'</p><div class="brief-card-actions">'+
          '<button class="btn btn-ghost btn-sm" data-id="'+formId+'" onclick="openBriefForm(this.dataset.id)"><i class="fa-solid fa-pen"></i> تعديل وعرض</button>'+
          (f.status==='draft'?'<button class="btn btn-primary btn-sm" data-id="'+formId+'" onclick="sendBriefForm(this.dataset.id)"><i class="fa-solid fa-paper-plane"></i> إرسال للعميل</button>':'')+
          (f.status==='draft'||f.status==='sent'&&!f.share_token?'<button class="btn btn-ghost btn-sm" data-id="'+formId+'" onclick="publishStandaloneBrief(this.dataset.id)"><i class="fa-solid fa-link"></i> رابط استبيان مستقل</button>':'')+
          (f.share_token&&['sent','submitted','accepted'].includes(f.status)?'<button class="btn btn-ghost btn-sm" data-id="'+formId+'" onclick="copyStandaloneBriefLink(this.dataset.id)"><i class="fa-solid fa-copy"></i> نسخ رابط الاستبيان</button>':'')+
          (!f.client_id?'<button class="btn btn-primary btn-sm" data-id="'+formId+'" onclick="useBriefTemplate(this.dataset.id)"><i class="fa-solid fa-copy"></i> استخدام مع عميل</button>':'')+
          (['sent','submitted','accepted'].includes(f.status)&&f.client_id?'<button class="btn btn-ghost btn-sm" data-id="'+formId+'" onclick="copyBriefLink(this.dataset.id)"><i class="fa-solid fa-link"></i> نسخ رابط البوابة</button>':'')+
          '<button class="btn btn-ghost btn-sm" data-id="'+formId+'" onclick="deleteBriefForm(this.dataset.id)" aria-label="حذف البريف"><i class="fa-solid fa-trash"></i></button>'+
          (f.status==='submitted'?'<button class="btn btn-success btn-sm" data-id="'+formId+'" onclick="acceptBriefForm(this.dataset.id)"><i class="fa-solid fa-check"></i> اعتماد وربط بالمشروع</button>':'')+
          (['submitted','accepted'].includes(f.status)?'<button class="btn btn-primary btn-sm" data-id="'+formId+'" onclick="openBriefQuoteBuilder(this.dataset.id)"><i class="fa-solid fa-file-invoice-dollar"></i> عرض سعر من البريف</button>':'')+
          (!f.client_id&&['submitted','accepted'].includes(f.status)?'<button class="btn btn-ghost btn-sm" data-id="'+formId+'" onclick="linkBriefToClient(this.dataset.id)"><i class="fa-solid fa-user-link"></i> ربط بعميل</button>':'')+
          '</div></article>';
      }).join('')+'</div>':'<div class="card brief-empty"><i class="fa-solid fa-clipboard-question"></i><h3>لا توجد بريفات بعد</h3><p>أنشئ أول نموذج لتجميع تفاصيل العمل من العميل.</p></div>');
  };
  window.openBriefForm=function(formId){
    var form=formId?find(formId):null;
    if(formId&&!form)return;
    document.getElementById('brief-editor-overlay')?.remove();
    var overlay=document.createElement('div');overlay.id='brief-editor-overlay';overlay.className='modal-overlay';overlay.style.display='flex';
    overlay.onclick=function(event){if(event.target===overlay)overlay.remove();};
    var readonly=false;
    var fields='<div class="brief-banner-editor"><img id="brief-banner-preview" src="'+esc(form?.banner||'')+'" alt="بانر الاستبيان" style="'+(form?.banner?'':'display:none')+'"><input type="hidden" id="brief-banner-data" value="'+esc(form?.banner||'')+'"><label class="btn btn-ghost btn-sm"><i class="fa-solid fa-image"></i> رفع بانر<input type="file" accept="image/png,image/jpeg,image/webp" hidden onchange="briefUploadBanner(this)"></label><button class="btn btn-ghost btn-sm" type="button" onclick="briefRemoveBanner()">إزالة البانر</button></div>'+
      '<div class="brief-grid"><div class="form-group"><label class="form-label">اسم النموذج *</label><input class="form-input" id="brief-title" maxlength="160" value="'+esc(form?.title||'')+'" placeholder="مثال: بريف تصميم الهوية"></div><div class="form-group"><label class="form-label">ابدأ من قالب جاهز</label><select class="form-select" id="brief-template-select" onchange="briefApplyTemplate(this.value)"><option value="">نموذج مخصص</option><option value="logo">قالب شعار</option><option value="identity">قالب هوية بصرية</option><option value="social">قالب سوشيال ميديا</option></select></div></div>'+
      '<div class="brief-grid"><div class="form-group"><label class="form-label">المشروع المرتبط</label><select class="form-select" id="brief-project">'+projectOptions(form?.client_id,form?.project_id)+'</select></div><div class="form-group"><label class="form-label">وصف مختصر</label><input class="form-input" id="brief-description" value="'+esc(form?.description||'')+'" placeholder="ما المطلوب من العميل؟"></div></div>'+
      '<section class="brief-editor-section"><div class="brief-section-head"><h4>البنود والتوضيحات</h4>'+(!readonly?'<button class="btn btn-ghost btn-sm" onclick="briefAddItem()">+ بند</button>':'')+'</div><div id="brief-items">'+(form?.items||[]).map(itemMarkup).join('')+'</div></section>'+
      '<section class="brief-editor-section"><div class="brief-section-head"><h4>مراحل الاستبيان وأسئلته</h4><div><button class="btn btn-ghost btn-sm" onclick="briefAddQuestion(\'section\')">+ مرحلة</button> <button class="btn btn-ghost btn-sm" onclick="briefAddQuestion()">+ سؤال</button></div></div><p class="brief-help">كل عنوان مرحلة يبدأ صفحة مستقلة للعميل، ويمكنه التنقل بالسابق والتالي.</p><div id="brief-questions">'+(form?.questions||[]).map(questionMarkup).join('')+'</div></section>';
    var answers='';
    if(form?.answers){
      answers='<section class="brief-editor-section"><h4>إجابات العميل</h4>'+(form.respondent_name?'<p><b>الاسم:</b> '+esc(form.respondent_name)+(form.respondent_contact?' · <b>التواصل:</b> '+esc(form.respondent_contact):'')+'</p>':'')+(form.questions||[]).map(function(q){if(q.type==='section')return '<h4 class="brief-answer-section">'+esc(q.label)+'</h4>';var answer=form.answers[q.id];var choice=Array.isArray(answer)?answer.join('، '):answer;return '<div class="brief-answer"><b>'+esc(q.label)+'</b><p>'+esc(choice||'—')+'</p></div>';}).join('')+'</section>';
      answers+=pricingMarkup(form);
    }
    overlay.innerHTML='<div class="modal brief-editor" dir="rtl"><div class="modal-header"><div class="modal-title"><i class="fa-solid fa-clipboard-question"></i> '+(form?'البريف':'بريف جديد')+'</div><button class="close-btn" onclick="document.getElementById(\'brief-editor-overlay\').remove()"><i class="fa-solid fa-xmark"></i></button></div><div class="brief-editor-content" id="brief-editor-content" data-id="'+esc(form?.id||'')+'">'+fields+answers+'</div><div class="brief-editor-footer">'+(!readonly?'<button class="btn btn-primary" onclick="saveBriefForm()"><i class="fa-solid fa-floppy-disk"></i> حفظ البريف</button>':'')+(form?.status==='submitted'?'<button class="btn btn-primary" data-id="'+esc(form.id)+'" onclick="briefAssignProject(this.dataset.id)">حفظ ربط المشروع</button>':'')+(form?.answers?'<button class="btn btn-ghost" data-id="'+esc(form.id)+'" onclick="saveBriefPricing(this.dataset.id)">حفظ تقييم التسعير</button>':'')+'<button class="btn btn-ghost" onclick="document.getElementById(\'brief-editor-overlay\').remove()">إغلاق</button></div></div>';
    document.body.appendChild(overlay);
    overlay.querySelectorAll('.brief-question').forEach(briefRefreshSelectPreview);
    briefPricingTotal();
    if(!form)briefAddQuestion();
  };
  var pricingFactors=['وضوح استراتيجية العلامة','عدد شرائح الجمهور','حجم السوق','عدد اللغات','عدد أصحاب القرار','عدد نسخ وأنظمة الشعار','عدد التطبيقات','التغليف أو المنتجات المتعددة','سرعة التنفيذ','جاهزية المحتوى','عدد جولات التعديل','الحاجة إلى بحث أو ورشة استراتيجية','تكاليف خارجية'];
  var pricingLines={base:'السعر الأساسي',strategy:'الاستراتيجية',design:'التصميم',applications:'التطبيقات',external:'التكاليف الخارجية',rush:'رسوم الاستعجال'};
  function pricingMarkup(form){var pricing=form.internalPricing||{},factors=pricing.factors||{},lines=pricing.lines||{};return '<section class="brief-editor-section brief-pricing"><h4><i class="fa-solid fa-lock"></i> تقييم داخلي للتسعير — لا يظهر للعميل</h4><p style="color:var(--text3);font-size:12px">قيّم درجة التعقيد، ثم سجّل تقدير التكلفة. هذه الأرقام لا تُرسل تلقائيًا في عرض السعر.</p><div class="brief-pricing-factors">'+pricingFactors.map(function(label,index){return '<label><span>'+esc(label)+'</span><select class="form-select brief-pricing-factor" data-index="'+index+'"><option value="">غير مقيّم</option>'+['بسيط','متوسط','مرتفع'].map(function(v){return '<option value="'+v+'"'+(factors[index]===v?' selected':'')+'>'+v+'</option>';}).join('')+'</select></label>';}).join('')+'</div><div class="brief-grid">'+Object.keys(pricingLines).map(function(key){return '<label class="form-group"><span class="form-label">'+pricingLines[key]+'</span><input class="form-input brief-pricing-line" data-key="'+key+'" type="number" min="0" value="'+esc(lines[key]||0)+'" oninput="briefPricingTotal()"></label>';}).join('')+'</div><p class="brief-pricing-total">السعر النهائي المقترح: <strong id="brief-pricing-total">0</strong></p><div class="brief-grid">'+[['duration','مدة التنفيذ'],['paymentTerms','شروط الدفع'],['revisions','عدد جولات التعديل'],['extraDeliverable','سعر المخرج الإضافي'],['extraRevision','سعر الجولة الإضافية']].map(function(pair){return '<label class="form-group"><span class="form-label">'+pair[1]+'</span><input class="form-input brief-pricing-meta" data-key="'+pair[0]+'" value="'+esc(pricing[pair[0]]||'')+'"></label>';}).join('')+'</div></section>';}
  window.briefPricingTotal=function(){var total=[...document.querySelectorAll('.brief-pricing-line')].reduce(function(sum,el){return sum+Math.max(0,Number(el.value)||0);},0);var target=document.getElementById('brief-pricing-total');if(target)target.textContent=total.toLocaleString();};
  window.saveBriefPricing=function(formId){var form=find(formId),wrap=document.querySelector('.brief-pricing');if(!form||!wrap)return;var factors={},lines={},meta={};wrap.querySelectorAll('.brief-pricing-factor').forEach(function(el){factors[el.dataset.index]=el.value;});wrap.querySelectorAll('.brief-pricing-line').forEach(function(el){lines[el.dataset.key]=Math.max(0,Number(el.value)||0);});wrap.querySelectorAll('.brief-pricing-meta').forEach(function(el){meta[el.dataset.key]=el.value.trim();});form.internalPricing=Object.assign({factors:factors,lines:lines},meta);form.updatedAt=new Date().toISOString();persist();notice('تم حفظ تقييم التسعير الداخلي');};
  function quoteCandidates(form){var section='',rows=[];(form.questions||[]).forEach(function(q){if(q.type==='section'){section=q.label||'';return;}var answer=form.answers?.[q.id];var values=Array.isArray(answer)?answer:[answer];values.filter(function(value){return value!==undefined&&value!==null&&String(value).trim();}).forEach(function(value){rows.push({label:(section?section+' — ':'')+(q.label||'متطلب')+': '+String(value).trim(),group:q.label||section});});});return rows;}
  window.openBriefQuoteBuilder=function(formId){var form=find(formId);if(!form||!form.answers)return;document.getElementById('brief-quote-overlay')?.remove();var rows=quoteCandidates(form),overlay=document.createElement('div');overlay.className='modal-overlay';overlay.id='brief-quote-overlay';overlay.style.display='flex';overlay.onclick=function(e){if(e.target===overlay)overlay.remove();};overlay.innerHTML='<div class="modal brief-quote-modal" dir="rtl"><div class="modal-header"><div class="modal-title"><i class="fa-solid fa-file-invoice-dollar"></i> تحويل البريف إلى عرض سعر</div><button class="close-btn" onclick="document.getElementById(\'brief-quote-overlay\').remove()"><i class="fa-solid fa-xmark"></i></button></div><div class="brief-editor-content"><p>جلبنا كل إجابات العميل بالترتيب وصغناها كبنود قابلة للتعديل. يمكنك استبعاد أي بند، ثم تحديد سعره في عرض السعر. ستُحفظ جميع الإجابات أيضًا في ملاحظات العرض.</p><div class="brief-quote-rows">'+(rows.length?rows.map(function(row){return '<label class="brief-quote-row"><input type="checkbox" checked value="'+esc(row.label)+'"><span><b>'+esc(row.label)+'</b><small>'+esc(row.group)+'</small></span></label>';}).join(''):'<p>لا توجد إجابات بعد. يمكنك إضافة البنود يدويًا في عرض السعر.</p>')+'</div></div><div class="brief-editor-footer"><button class="btn btn-primary" data-id="'+esc(formId)+'" onclick="createProposalFromBrief(this.dataset.id)">إنشاء مسودة عرض سعر</button></div></div>';document.body.appendChild(overlay);};
  window.linkBriefToClient=function(formId){var form=find(formId);if(!form||form.client_id)return;document.getElementById('brief-link-client-overlay')?.remove();var overlay=document.createElement('div');overlay.id='brief-link-client-overlay';overlay.className='modal-overlay';overlay.style.display='flex';overlay.innerHTML='<div class="modal brief-use-template" dir="rtl"><div class="modal-header"><div class="modal-title">ربط البريف بعميل</div><button class="close-btn" onclick="document.getElementById(\'brief-link-client-overlay\').remove()"><i class="fa-solid fa-xmark"></i></button></div><div style="padding:18px"><p>بعد ربطه، سيظهر البريف في بوابة هذا العميل أيضًا.</p><select class="form-select" id="brief-link-client-select">'+clientOptions('')+'</select></div><div class="brief-editor-footer"><button class="btn btn-primary" data-id="'+esc(formId)+'" onclick="saveBriefClientLink(this.dataset.id)">حفظ الربط</button></div></div>';document.body.appendChild(overlay);};
  window.saveBriefClientLink=function(formId){var form=find(formId),clientId=document.getElementById('brief-link-client-select')?.value;if(!form||!clientId){notice('اختر العميل');return;}form.client_id=clientId;form.updatedAt=new Date().toISOString();persist();document.getElementById('brief-link-client-overlay')?.remove();renderBriefForms();notice('تم ربط البريف بالعميل');};
  window.createProposalFromBrief=function(formId){
    var form=find(formId),client=(state().clients||[]).find(function(c){return String(c.id)===String(form?.client_id);});
    if(!form||typeof window.openProposalModal!=='function')return;
    var selected=[...document.querySelectorAll('#brief-quote-overlay .brief-quote-row input:checked')].map(function(el){return el.value;});
    document.getElementById('brief-quote-overlay')?.remove();document.getElementById('brief-editor-overlay')?.remove();
    if(typeof window.switchInvTab==='function')switchInvTab('proposals');
    openProposalModal();
    var clientEl=document.getElementById('prop-client');if(clientEl)clientEl.value=client?.name||form.respondent_name||'';
    if(typeof window._fillSharedCurrencySelect==='function')_fillSharedCurrencySelect('prop-currency',client?.currency_code||client?.currency_symbol||state().settings?.base_currency_code,true);
    document.getElementById('prop-title').value='عرض سعر — '+(form.title||'مشروع جديد');
    document.getElementById('prop-brief-id').value=form.id;
    document.getElementById('prop-items-wrap').innerHTML='';
    selected.forEach(function(label){_addPropItem({desc:label,qty:1,price:0});});if(!selected.length)_addPropItem();
    var pricing=form.internalPricing||{};
    document.getElementById('prop-notes').value=['ملخص البريف:',...quoteCandidates(form).map(function(row){return '• '+row.label;}),form.respondent_contact?'وسيلة التواصل: '+form.respondent_contact:'',pricing.duration?'مدة التنفيذ: '+pricing.duration:'',pricing.revisions?'جولات التعديل: '+pricing.revisions:'',pricing.extraDeliverable?'سعر المخرج الإضافي: '+pricing.extraDeliverable:'',pricing.extraRevision?'سعر الجولة الإضافية: '+pricing.extraRevision:''].filter(Boolean).join('\n');
    _calcPropTotal();notice('تم تجهيز مسودة العرض؛ حدّد أسعار البنود ثم احفظها');
  };
  window.saveBriefForm=function(){
    var body=document.getElementById('brief-editor-content');if(!body)return;
    var form=body.dataset.id?find(body.dataset.id):null;
    if(form&&form.status==='accepted'&&!window.confirm('هذا البريف معتمد ومربوط بمشروع. سيؤدي تعديل النموذج إلى تحديث نسخة الاستبيان فقط، مع بقاء نسخة المشروع المعتمدة. متابعة؟'))return;
    var title=document.getElementById('brief-title').value.trim();
    var clientId=form?.client_id||'';
    if(!title){notice('أدخل اسم النموذج');return;}
    var items=[...body.querySelectorAll('.brief-item')].map(function(el){return {id:el.dataset.id,title:el.querySelector('.brief-item-title').value.trim(),description:el.querySelector('.brief-item-desc').value.trim()};}).filter(function(item){return item.title;});
    var questions=[...body.querySelectorAll('.brief-question')].map(function(el){
      var type=el.querySelector('.brief-q-type').value;
      var raw=[...el.querySelectorAll('.brief-option-label')].map(function(input){return input.value.trim();}).filter(Boolean);
      var options=type==='image'?[...el.querySelectorAll('.brief-image-option')].map(function(row){return {label:row.querySelector('.brief-image-label').value.trim(),image_url:row.querySelector('.brief-image-data').value};}).filter(function(o){return o.label&&o.image_url;}):raw.map(function(label){return {label:label};});
      return {id:el.dataset.id,label:el.querySelector('.brief-q-label').value.trim(),description:el.querySelector('.brief-q-desc').value.trim(),type:type,required:type==='section'?false:el.querySelector('.brief-q-required').checked,options:options};
    }).filter(function(q){return q.label;});
    if(!items.length&&!questions.length){notice('أضف بندًا أو سؤالًا واحدًا على الأقل');return;}
    if(questions.some(function(q){return ['radio','checkbox','select','image'].includes(q.type)&&q.options.length<2;})){notice('أضف اختيارين على الأقل لأسئلة الاختيارات والصور');return;}
    var banner=document.getElementById('brief-banner-data').value;
    if(banner.length+questions.reduce(function(sum,q){return sum+(q.options||[]).reduce(function(n,o){return n+(o.image_url||'').length;},0);},0)>4000000){notice('صور الاستبيان تتجاوز ٣ ميجابايت تقريبًا؛ قلّل عدد الصور أو أحجامها');return;}
    var data={title:title,description:document.getElementById('brief-description').value.trim(),banner:banner,client_id:clientId,project_id:document.getElementById('brief-project').value||'',items:items,questions:questions,updatedAt:new Date().toISOString()};
    if(form)Object.assign(form,data);else forms().push(Object.assign({id:id(),status:'draft',createdAt:new Date().toISOString()},data));
    persist();document.getElementById('brief-editor-overlay').remove();renderBriefForms();notice('تم حفظ البريف');
  };
  window.copyBriefLink=function(formId){
    var form=find(formId);if(!form?.client_id)return;
    var url=typeof window._shortPortalUrl==='function'?_shortPortalUrl(form.client_id):location.origin+'/clients';
    url+=(url.includes('?')?'&':'?')+'tab=briefs&brief='+encodeURIComponent(form.id);
    if(navigator.clipboard?.writeText)navigator.clipboard.writeText(url).then(function(){notice('تم نسخ رابط البريف');}).catch(function(){window.prompt('رابط البريف',url);});
    else window.prompt('رابط البريف',url);
  };
  window.copyStandaloneBriefLink=function(formId){
    var form=find(formId),username=String(state().settings?.username||'').trim().toLowerCase();
    if(!form?.share_token||!username){notice('أضف اسم المستخدم في إعدادات الموقع أولًا');return;}
    var url=location.origin+'/brief/'+encodeURIComponent(username)+'/'+encodeURIComponent(form.share_token);
    if(navigator.clipboard?.writeText)navigator.clipboard.writeText(url).then(function(){notice('تم نسخ رابط الاستبيان المستقل');}).catch(function(){window.prompt('رابط الاستبيان',url);});else window.prompt('رابط الاستبيان',url);
  };
  window.publishStandaloneBrief=async function(formId){
    var form=find(formId),username=String(state().settings?.username||'').trim().toLowerCase();
    if(!form||!['draft','sent'].includes(form.status))return;
    if(!username){notice('أضف اسم المستخدم في إعدادات الموقع قبل نشر الرابط المستقل');return;}
    var oldStatus=form.status,oldToken=form.share_token;
    if(!form.share_token)form.share_token='brf_'+(window.crypto?.randomUUID?.().replace(/-/g,'')||id().replace(/[^a-z0-9]/gi,''));
    form.status='sent';form.sentAt=form.sentAt||new Date().toISOString();form.updatedAt=new Date().toISOString();
    if(typeof window.cloudSave==='function')await cloudSave(state());
    if(!window._lastCloudSaveOk){form.status=oldStatus;form.share_token=oldToken;notice('تعذر نشر الاستبيان؛ تحقق من الاتصال والمساحة');return;}
    if(typeof window.lsSave==='function')lsSave();renderBriefForms();copyStandaloneBriefLink(formId);
  };
  window.sendBriefForm=async function(formId){
    var form=find(formId);if(!form||form.status!=='draft')return;
    if(!form.client_id){useBriefTemplate(formId);return;}
    var url=typeof window._shortPortalUrl==='function'?_shortPortalUrl(form.client_id):'';
    if(!url||url.endsWith('/clients')){notice('أنشئ بوابة للعميل أولًا');return;}
    var oldToken=form.share_token;
    if(!form.share_token)form.share_token='brf_'+(window.crypto?.randomUUID?.().replace(/-/g,'')||id().replace(/[^a-z0-9]/gi,''));
    form.status='sent';form.sentAt=new Date().toISOString();form.updatedAt=form.sentAt;
    if(typeof window.cloudSave==='function')await cloudSave(state());
    if(!window._lastCloudSaveOk){form.status='draft';form.share_token=oldToken;delete form.sentAt;persist();renderBriefForms();notice('لم يُنشر البريف بعد؛ تحقق من الاتصال أو المساحة ثم حاول مرة أخرى');return;}
    renderBriefForms();copyBriefLink(formId);
  };
  window.deleteBriefForm=function(formId){
    var form=find(formId);if(!form)return;
    if(!window.confirm('حذف البريف «'+(form.title||'بدون عنوان')+'» نهائيًا؟ سيتوقف رابط العميل وتُزال الصور من مساحة حسابك.'))return;
    var index=forms().indexOf(form);if(index<0)return;
    forms().splice(index,1);persist();renderBriefForms();notice('تم حذف البريف');
  };
  window.useBriefTemplate=function(formId){
    var template=find(formId);if(!template||template.client_id)return;
    var overlay=document.createElement('div');overlay.id='brief-use-template-overlay';overlay.className='modal-overlay';overlay.style.display='flex';
    overlay.onclick=function(event){if(event.target===overlay)overlay.remove();};
    overlay.innerHTML='<div class="modal brief-use-template" dir="rtl"><div class="modal-header"><div class="modal-title">استخدام القالب مع عميل</div><button class="close-btn" onclick="document.getElementById(\'brief-use-template-overlay\').remove()"><i class="fa-solid fa-xmark"></i></button></div><div style="padding:18px"><label class="form-label">العميل *</label><select class="form-select" id="brief-template-client">'+clientOptions('')+'</select><p style="color:var(--text3);font-size:12px">سيُنشأ بريف مستقل للعميل، ويبقى القالب العام كما هو.</p></div><div class="brief-editor-footer"><button class="btn btn-primary" data-id="'+esc(formId)+'" onclick="createBriefFromTemplate(this.dataset.id)">إنشاء بريف للعميل</button></div></div>';
    document.body.appendChild(overlay);
  };
  window.createBriefFromTemplate=function(formId){
    var template=find(formId),clientId=document.getElementById('brief-template-client')?.value||'';
    if(!template||!clientId){notice('اختر العميل أولًا');return;}
    var copy=JSON.parse(JSON.stringify(template));
    copy.id=id();copy.client_id=clientId;copy.project_id='';copy.status='draft';copy.createdAt=new Date().toISOString();copy.updatedAt=copy.createdAt;
    delete copy.answers;delete copy.submittedAt;delete copy.sentAt;delete copy.acceptedAt;delete copy.share_token;delete copy.respondent_name;delete copy.respondent_contact;
    forms().push(copy);persist();document.getElementById('brief-use-template-overlay')?.remove();renderBriefForms();notice('تم إنشاء نسخة للعميل؛ راجعها ثم أرسلها');
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
  style.textContent='.brief-panel-heading{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:16px}.brief-panel-heading h3{margin:0;font-size:18px}.brief-panel-heading p{margin:4px 0 0;color:var(--text3);font-size:12px}.brief-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:12px}.brief-card h4{margin:0 0 4px}.brief-card p{color:var(--text3);font-size:12px}.brief-card-top,.brief-card-actions,.brief-section-head,.brief-editor-line,.brief-editor-footer{display:flex;align-items:center;justify-content:space-between;gap:10px}.brief-card-actions{justify-content:flex-start;flex-wrap:wrap}.brief-status{font-size:11px;padding:5px 10px;border-radius:20px;background:var(--surface2);white-space:nowrap}.brief-status-submitted{color:var(--accent3)}.brief-status-accepted{color:var(--accent3)}.brief-editor,.brief-use-template{width:min(820px,96vw);max-height:min(90dvh,900px);display:flex;flex-direction:column}.brief-use-template{width:min(450px,96vw)}.brief-editor-content{overflow:auto;padding:18px}.brief-editor-footer{justify-content:flex-start;padding:14px 18px;border-top:1px solid var(--border)}.brief-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.brief-editor-section{border-top:1px solid var(--border);padding-top:15px;margin-top:15px}.brief-editor-section h4{margin:0 0 12px}.brief-editor-block{background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px;margin:10px 0}.brief-editor-block .form-input,.brief-editor-block .form-textarea{margin-bottom:8px}.brief-editor-line .form-input{flex:1}.brief-q-type{width:170px}.brief-required{font-size:12px;display:flex;align-items:center;gap:6px;margin-bottom:8px}.brief-options small{display:block;color:var(--text3);margin-bottom:5px}.brief-answer{border-bottom:1px solid var(--border);padding:8px 0}.brief-answer p{white-space:pre-wrap}.brief-empty{text-align:center;padding:40px}.brief-empty i{font-size:30px;color:var(--text3)}@media(max-width:650px){.brief-grid{grid-template-columns:1fr}.brief-panel-heading{align-items:flex-start;flex-direction:column}.brief-editor-line{flex-wrap:wrap}.brief-q-type{width:auto}}';
  style.textContent+='.brief-banner-editor{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px}.brief-banner-editor img{width:100%;max-height:180px;object-fit:cover;border-radius:12px}.brief-image-option{display:flex;align-items:center;gap:8px;margin:8px 0;flex-wrap:wrap}.brief-image-option .form-input{flex:1;min-width:160px}.brief-image-preview{width:72px;height:56px;object-fit:cover;border-radius:7px}.brief-image-options small{display:block;color:var(--text3);margin-bottom:6px}.brief-answer-section{margin:18px 0 4px;color:var(--accent3)}.brief-pricing{background:var(--surface2);padding:15px;border-radius:12px}.brief-pricing-factors{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:14px 0}.brief-pricing-factors label{display:flex;align-items:center;justify-content:space-between;gap:7px;font-size:12px}.brief-pricing-factors select{width:120px}.brief-pricing-total{font-size:14px;font-weight:800;color:var(--accent3)}.brief-quote-modal{width:min(650px,96vw);max-height:90dvh;display:flex;flex-direction:column}.brief-quote-row{display:flex;align-items:center;gap:12px;padding:10px;border:1px solid var(--border);border-radius:9px;margin:7px 0}.brief-quote-row span{display:flex;flex-direction:column;gap:3px}.brief-quote-row small{color:var(--text3)}@media(max-width:650px){.brief-pricing-factors{grid-template-columns:1fr}}';
  style.textContent+='.brief-help{font-size:12px;color:var(--text3)}.brief-question:has(.brief-q-type option[value="section"]:checked){border-inline-start:3px solid var(--accent3)}';
  style.textContent+='.brief-option-list{display:grid;gap:8px;margin:10px 0}.brief-option-row{display:flex;align-items:center;gap:10px;background:var(--surface);border:1px solid var(--border);padding:8px 10px;border-radius:10px}.brief-option-indicator{width:25px;text-align:center;color:var(--accent3);font-size:18px}.brief-option-row .form-input{flex:1;margin:0}.brief-select-preview{margin-top:12px}.brief-select-preview small{display:block;color:var(--text3);margin-bottom:6px}.brief-answer-preview{margin:10px 0}.brief-preview-toggle,.brief-preview-scale{display:flex;gap:9px;flex-wrap:wrap}.brief-preview-toggle span,.brief-preview-scale span{border:1px solid var(--border);border-radius:9px;padding:9px 15px;color:var(--text2);background:var(--surface)}.brief-image-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:10px 0}.brief-image-option{display:flex;flex-direction:column;border:1px solid var(--border);border-radius:12px;padding:10px;background:var(--surface)}.brief-image-option .form-input{width:100%;min-width:0}.brief-image-preview{order:-1;width:100%;height:100px;object-fit:contain;background:var(--surface2)}';
  document.head.appendChild(style);
})();
