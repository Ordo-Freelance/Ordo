(function(root){
  'use strict';
  function st(){return root.S||(root.S={});}
  function arr(v){return Array.isArray(v)?v:[];}
  function sid(v){return String(v==null?'':v);}
  function num(v){var n=Number(v);return Number.isFinite(n)?Math.max(0,n):0;}
  function esc(v){return sid(v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];});}
  function nowLocal(){var d=new Date(),off=d.getTimezoneOffset();return new Date(d.getTime()-off*60000).toISOString().slice(0,16);}
  function settings(){st().settings=st().settings||{};return st().settings;}
  function proofRequired(){return settings().paymentProofMode==='required';}
  function methodRows(){
    var out=[],seen={};
    function add(id,label,kind,accountId){id=sid(id);if(!id||seen[id])return;seen[id]=1;out.push({id:id,label:label||id,kind:kind||'',accountId:accountId||''});}
    add('cash','كاش','cash','');
    arr(st().finance_accounts).filter(function(a){return a&&a.active!==false;}).forEach(function(a){add('account:'+a.id,a.name||'حساب مالي',a.type||'',a.id);});
    arr(st().paymentAccounts).forEach(function(a){add('method:'+a.id,a.label||a.name||'محفظة',a.type||'wallet','');});
    if(typeof root.getAllPayMethods==='function')root.getAllPayMethods().forEach(function(m){add('method:'+m.id,m.label,m.id==='cash'?'cash':'wallet','');});
    return out;
  }
  function methodLabel(value){var row=methodRows().find(function(m){return m.id===value||m.id==='method:'+value||m.id==='account:'+value;});return row?row.label:(value||'غير محدد');}
  function closeCapture(){var el=document.getElementById('ordo-payment-capture');if(el)el.remove();root.__ordoPaymentCapture=null;}
  function readProof(input){
    var file=input&&input.files&&input.files[0];if(!file)return;
    if(!/^image\//.test(file.type)){input.value='';return root.toast&&root.toast('اختر صورة للإيصال أو سكرين الدفع');}
    if(file.size>3*1024*1024){input.value='';return root.toast&&root.toast('حجم صورة الإيصال يجب ألا يتجاوز 3MB');}
    var reader=new FileReader();reader.onload=function(){root.__ordoPaymentProof=reader.result;var img=document.getElementById('opc-proof-preview');if(img){img.src=reader.result;img.style.display='block';}};reader.readAsDataURL(file);
  }
  function openCapture(opts){
    opts=opts||{};closeCapture();root.__ordoPaymentProof=opts.receiptImage||'';root.__ordoPaymentCapture=opts;
    var methods=methodRows(),ov=document.createElement('div');ov.className='modal-overlay';ov.id='ordo-payment-capture';ov.style.display='flex';
    ov.innerHTML='<div class="modal" style="max-width:520px"><div class="modal-header"><div class="modal-title"><i class="fa-solid fa-hand-holding-dollar"></i> '+esc(opts.title||'تسجيل سداد')+'</div><button class="close-btn" onclick="OrdoPaymentCapture.close()"><i class="fa-solid fa-xmark"></i></button></div>'+
      '<div class="form-row"><div class="form-group"><label class="form-label">المبلغ</label><input class="form-input" id="opc-amount" type="number" min="0.01" '+(opts.max?'max="'+esc(opts.max)+'" ':'')+'step="0.01" value="'+esc(opts.amount||'')+'"></div><div class="form-group"><label class="form-label">التاريخ والوقت</label><input class="form-input" id="opc-datetime" type="datetime-local" value="'+esc(nowLocal())+'"></div></div>'+
      '<div class="form-group"><label class="form-label">وسيلة التحصيل</label><select class="form-select" id="opc-method">'+methods.map(function(m){return '<option value="'+esc(m.id)+'">'+esc(m.label)+'</option>';}).join('')+'</select></div>'+
      '<div class="form-group"><label class="form-label"><i class="fa-solid fa-paperclip"></i> إيصال أو سكرين الدفع '+(proofRequired()?'<span style="color:var(--accent4)">* إجباري</span>':'<span style="color:var(--text3)">— اختياري</span>')+'</label><label style="display:block;border:2px dashed var(--border);border-radius:10px;padding:14px;text-align:center;cursor:pointer"><input type="file" accept="image/*" style="display:none" onchange="OrdoPaymentCapture.readProof(this)"><span><i class="fa-solid fa-image"></i> اضغط لرفع صورة الإثبات</span></label><img id="opc-proof-preview" src="'+esc(root.__ordoPaymentProof)+'" style="'+(root.__ordoPaymentProof?'display:block':'display:none')+';max-width:100%;max-height:220px;margin:10px auto 0;border-radius:10px;border:1px solid var(--border)"></div>'+
      '<div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-ghost" onclick="OrdoPaymentCapture.close()">إلغاء</button><button class="btn btn-success" onclick="OrdoPaymentCapture.submit()"><i class="fa-solid fa-check"></i> تسجيل السداد</button></div></div>';
    document.body.appendChild(ov);
  }
  async function save(){if(root.OrdoPaymentReconciliation)root.OrdoPaymentReconciliation.reconcileAll(st());if(typeof root.lsSave==='function')root.lsSave();if(typeof root.cloudSave==='function')await root.cloudSave(st());if(typeof root.renderAll==='function')root.renderAll();}
  async function submit(){
    var opts=root.__ordoPaymentCapture||{},amount=num((document.getElementById('opc-amount')||{}).value),date=(document.getElementById('opc-datetime')||{}).value,method=(document.getElementById('opc-method')||{}).value||'cash';
    if(!amount)return root.toast&&root.toast('أدخل مبلغاً صحيحاً');if(opts.max&&amount>num(opts.max))return root.toast&&root.toast('المبلغ أكبر من القيمة المستحقة');if(proofRequired()&&!root.__ordoPaymentProof)return root.toast&&root.toast('إرفاق إيصال أو سكرين الدفع إجباري من الإعدادات');
    var selected=methodRows().find(function(m){return m.id===method;})||{},meta={amount:amount,createdAt:date?new Date(date).toISOString():new Date().toISOString(),date:date?date.slice(0,10):new Date().toISOString().slice(0,10),payMethod:method,methodLabel:selected.label||method,account_id:selected.accountId||'',receiptImage:root.__ordoPaymentProof||''};
    try{var result=await opts.onSubmit(meta);closeCapture();await save();if(root.toast)root.toast('تم تسجيل السداد وحفظ تفاصيل العملية');if(typeof root.openCollectionWhatsApp==='function'){var ctx=Object.assign({},opts,result||{});setTimeout(function(){root.openCollectionWhatsApp(ctx,meta);},180);}}catch(e){console.error(e);if(root.toast)root.toast('تعذر تسجيل السداد');}
  }
  function enrich(tx,meta){if(!tx)return;tx.amount=meta.amount;tx.createdAt=meta.createdAt;tx.isoDate=meta.date;tx.date=meta.date;tx.payMethod=meta.payMethod;tx.paymentMethodLabel=meta.methodLabel;if(meta.account_id)tx.account_id=meta.account_id;if(meta.receiptImage)tx.receiptImage=meta.receiptImage;tx.paymentProofAttached=!!meta.receiptImage;}
  function installPaymentHooks(){
    root.markPaid=function(id){var inv=arr(st().invoices).find(function(i){return sid(i.id)===sid(id);});if(!inv)return;var api=root.OrdoPaymentReconciliation,total=api?api.invoiceTotal(inv):num(inv.total),paid=num(inv.paidAmount||inv.amountPaid),due=Math.max(0,total-paid);openCapture({title:'تحصيل فاتورة '+(inv.num||''),reference:'فاتورة '+(inv.num||''),clientName:inv.client,amount:due||total,max:due||total,onSubmit:async function(meta){api.settleInvoice(st(),inv,{payMethod:meta.payMethod});var tx=arr(st().transactions).find(function(t){return sid(t.source_ref)==='invoice-payment:'+sid(inv.id);});enrich(tx,meta);if(tx&&arr(tx.allocations).length)tx.allocations[0].amount=meta.amount;api.reconcileInvoice(st(),inv);return {transactionId:tx&&tx.id};}});};
    root._toggleProfileTaskPayment=function(taskId,sourceType,clientId){var task=arr(st().tasks).concat(arr(st().project_tasks)).find(function(t){return sid(t.id)===sid(taskId);});if(!task)return;var paid=task.paymentCollected===true||task.paid===true||task.paymentStatus==='collected'||task.paymentStatus==='paid'||task.pay==='full',api=root.OrdoPaymentReconciliation,inv=api&&api.invoiceForTask(st(),task);if(paid){api.toggleTask(st(),task,inv);save();return;}var amount=num(task.value||task.amount||task.price);openCapture({title:'تحصيل مهمة: '+(task.title||''),reference:'مهمة '+(task.title||''),clientName:task.client,amount:amount,max:amount,onSubmit:async function(meta){api.toggleTask(st(),task,inv);var type=arr(st().project_tasks).includes(task)?'project_task':'task',tx=arr(st().transactions).find(function(t){return sid(t.source_ref)==='task-payment:'+type+':'+sid(task.id);});enrich(tx,meta);if(tx&&arr(tx.allocations).length)tx.allocations[0].amount=meta.amount;api.reconcileAll(st());if(clientId)setTimeout(function(){if(root._renderProfileTab)root._renderProfileTab('overview',clientId);},60);return {transactionId:tx&&tx.id};}});};
  }
  function transactionClient(tx){
    var id=sid(tx&&(tx.client_id||tx.clientId||'')),name=sid(tx&&(tx.client||tx.clientName||tx.source||''));
    return arr(st().clients).find(function(c){return (id&&sid(c.id)===id)||(name&&sid(c.name)===name);})||null;
  }
  function printSystemReceipt(id){if(typeof root.exportReceipt==='function')root.exportReceipt(id);}
  function shareSystemReceipt(id){
    var tx=arr(st().transactions).find(function(t){return sid(t.id)===sid(id);});if(!tx)return;
    var client=transactionClient(tx),name=(client&&client.name)||tx.client||tx.clientName||tx.source||'';
    if(typeof root.openCollectionWhatsApp!=='function')return root.toast&&root.toast('تعذر فتح نافذة إرسال الإيصال');
    root.openCollectionWhatsApp({clientName:name,transactionId:tx.id,reference:tx.desc||tx.source||'تحصيل'},{amount:tx.amount,date:tx.isoDate||tx.date,payMethod:tx.payMethod,methodLabel:tx.paymentMethodLabel||methodLabel(tx.payMethod)});
  }
  function openDetails(id){
    var tx=arr(st().transactions).find(function(t){return sid(t.id)===sid(id);});if(!tx)return;
    var old=document.getElementById('ordo-transaction-details');if(old)old.remove();
    var when=tx.createdAt||tx.isoDate||tx.date||'',d=when?new Date(when):null;
    var shown=tx.collectionTimeUnknown?((tx.isoDate||tx.date||'-')+' — الوقت غير مسجل للعملية القديمة'):(d&&!isNaN(d)?d.toLocaleString('ar-EG',{dateStyle:'full',timeStyle:'short'}):when);
    var receiptNo='RCP-'+sid(tx.id).slice(-5),client=transactionClient(tx),clientName=(client&&client.name)||tx.client||tx.clientName||tx.source||'-';
    var account=arr(st().finance_accounts).find(function(a){return sid(a.id)===sid(tx.account_id);});
    var ov=document.createElement('div');ov.className='modal-overlay';ov.id='ordo-transaction-details';ov.style.display='flex';
    ov.innerHTML='<div class="modal" style="max-width:560px"><div class="modal-header"><div class="modal-title"><i class="fa-solid fa-receipt"></i> تفاصيل عملية التحصيل</div><button class="close-btn" onclick="this.closest(\'.modal-overlay\').remove()"><i class="fa-solid fa-xmark"></i></button></div>'+
      '<div class="card" style="padding:14px;display:grid;grid-template-columns:1fr 1fr;gap:12px"><div><small style="color:var(--text3)">رقم الإيصال</small><b style="display:block;margin-top:3px">'+esc(receiptNo)+'</b></div><div><small style="color:var(--text3)">العميل</small><b style="display:block;margin-top:3px">'+esc(clientName)+'</b></div><div style="grid-column:1/-1"><small style="color:var(--text3)">البيان</small><b style="display:block;margin-top:3px">'+esc(tx.desc||tx.source||'-')+'</b></div><div><small style="color:var(--text3)">المبلغ</small><b style="display:block;margin-top:3px;color:var(--accent3);font-size:18px">'+esc(Number(tx.amount||0).toLocaleString('ar-EG'))+'</b></div><div><small style="color:var(--text3)">طريقة التحصيل</small><b style="display:block;margin-top:3px">'+esc(tx.paymentMethodLabel||methodLabel(tx.payMethod))+'</b></div><div><small style="color:var(--text3)">التاريخ والوقت</small><b style="display:block;margin-top:3px">'+esc(shown||'-')+'</b></div><div><small style="color:var(--text3)">الحساب / المحفظة</small><b style="display:block;margin-top:3px">'+esc((account&&account.name)||tx.account_name||tx.wallet_name||'غير محدد')+'</b></div></div>'+
      (tx.receiptImage?'<div style="margin-top:14px"><div class="form-label">إيصال / إثبات الدفع المرفق</div><a href="'+esc(tx.receiptImage)+'" target="_blank"><img src="'+esc(tx.receiptImage)+'" style="display:block;max-width:100%;max-height:300px;margin:auto;border-radius:12px;border:1px solid var(--border)"></a></div>':'<div class="empty" style="padding:14px">لا يوجد إثبات دفع مرفق — إيصال النظام متاح بالأسفل</div>')+
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"><button class="btn btn-primary" onclick="OrdoPaymentCapture.printReceipt('+JSON.stringify(sid(tx.id))+')"><i class="fa-solid fa-file-invoice"></i> عرض وطباعة إيصال النظام</button><button class="btn btn-success" onclick="OrdoPaymentCapture.shareReceipt('+JSON.stringify(sid(tx.id))+')"><i class="fa-brands fa-whatsapp"></i> إرسال الإيصال للعميل</button></div></div>';
    document.body.appendChild(ov);
  }
  function injectSettings(){var panel=document.getElementById('stabp-finance');if(!panel||document.getElementById('payment-proof-settings'))return;var card=document.createElement('div');card.className='card';card.id='payment-proof-settings';card.style.marginTop='16px';card.innerHTML='<div class="section-title"><i class="fa-solid fa-file-shield"></i> إثبات عمليات التحصيل</div><div style="font-size:12px;color:var(--text3);margin-bottom:12px">حدد هل رفع إيصال أو سكرين الدفع مطلوب عند سداد مهمة أو فاتورة.</div><select class="form-select" id="set-payment-proof-mode"><option value="optional">اختياري</option><option value="required">إجباري</option></select><button class="btn btn-primary btn-sm" style="margin-top:10px" onclick="OrdoPaymentCapture.saveSetting()"><i class="fa-solid fa-floppy-disk"></i> حفظ إعداد الإثبات</button>';panel.insertBefore(card,panel.firstChild);document.getElementById('set-payment-proof-mode').value=settings().paymentProofMode||'optional';}
  async function saveSetting(){settings().paymentProofMode=(document.getElementById('set-payment-proof-mode')||{}).value||'optional';if(typeof root.lsSave==='function')root.lsSave();if(typeof root.cloudSave==='function')await root.cloudSave(st());if(root.toast)root.toast('تم حفظ إعداد إثبات الدفع');}
  root.OrdoPaymentCapture={open:openCapture,close:closeCapture,submit:submit,readProof:readProof,openDetails:openDetails,printReceipt:printSystemReceipt,shareReceipt:shareSystemReceipt,saveSetting:saveSetting};
  function boot(){injectSettings();installPaymentHooks();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,300);});else setTimeout(boot,300);
  setTimeout(injectSettings,1500);
})(window);
