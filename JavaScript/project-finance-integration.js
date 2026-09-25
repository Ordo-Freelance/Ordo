/* Keep newly recorded project cash movements in the same ledger as Finance. */
(function(root){
  function asId(value){ return String(value == null ? '' : value); }
  function amount(value){ var n=Number(value); return Number.isFinite(n) ? n : 0; }
  function currency(root,value){
    var meta=root.OrdoData&&typeof root.OrdoData.getCurrencyMeta==='function'?root.OrdoData.getCurrencyMeta(value):null;
    return meta||{code:value||'EGP',symbol:value||'ج.م'};
  }
  function paymentTransaction(state,project,row){
    if(!state || !project || !row || !['client_payment','team_payout','project_expense'].includes(row.kind) || amount(row.amount)<=0) return null;
    state.transactions=Array.isArray(state.transactions)?state.transactions:[];
    var id=row.financeTransactionId || 'project-ledger:'+asId(project.id)+':'+asId(row.id);
    var existing=state.transactions.find(function(tx){return asId(tx.id)===id || (asId(tx.project_ledger_id)===asId(row.id) && asId(tx.project_id)===asId(project.id));});
    var client=(state.clients||[]).find(function(c){return asId(c.id)===asId(project.client_id);});
    var tx=existing || {id:id,createdAt:new Date().toISOString()};
    tx.type=row.kind==='client_payment'?'income':'expense';
    tx.amount=amount(row.amount);
    var cur=currency(root,row.currency_code||row.currency||project.budgetCurrency);
    tx.currency=cur.code;tx.currency_code=cur.code;tx.currency_symbol=cur.symbol;
    tx.isoDate=row.date||new Date().toISOString().slice(0,10);
    tx.date=tx.isoDate;
    tx.desc=row.desc||project.name;
    tx.source=client?.name||project.name;
    tx.client=client?.name||'';
    tx.client_id=project.client_id||'';
    tx.project_id=asId(project.id);
    tx.project_name=project.name||'';
    tx.project_ledger_id=asId(row.id);
    tx.source_type='project_ledger';
    if(tx.type==='expense') tx.expCat=row.kind==='team_payout'?'أجور فريق':'مصروف مشروع';
    if(!existing)state.transactions.push(tx);
    row.financeTransactionId=tx.id;
    row.posted=true;
    return tx;
  }
  function removePaymentTransaction(state,project,row){
    if(!state || !row || !row.financeTransactionId)return false;
    var before=(state.transactions||[]).length;
    state.transactions=state.transactions.filter(function(tx){
      return !(asId(tx.id)===asId(row.financeTransactionId) && tx.source_type==='project_ledger' && asId(tx.project_id)===asId(project.id));
    });
    return before!==state.transactions.length;
  }
  function taskPaymentTransaction(state,project,task){
    if(!state||!project||!task)return null;
    var status=task.paymentStatus||'pending';
    var paid=status==='collected'||status==='paid'||task.paymentCollected===true;
    var total=paid?amount(task.value):(status==='deposit'?amount(task.deposit):0);
    if(total<=0)return null;
    state.transactions=Array.isArray(state.transactions)?state.transactions:[];
    var existing=state.transactions.find(function(tx){return tx.type==='income'&&asId(tx.linkedProjTaskId)===asId(task.id)&&asId(tx.project_id)===asId(project.id);});
    var invoiced=(state.invoices||[]).some(function(inv){
      if(!(inv.paid||['paid','مدفوعة','مدفوع'].includes(inv.status)))return false;
      return (inv.items||[]).some(function(item){
        return [item._projectTaskId,item.projectTaskId,item.linkedProjTaskId].some(function(id){return asId(id)===asId(task.id);});
      });
    });
    if(invoiced&&!existing)return null;
    var client=(state.clients||[]).find(function(c){return asId(c.id)===asId(project.client_id);});
    var tx=existing||{id:'project-task-payment:'+asId(project.id)+':'+asId(task.id),createdAt:new Date().toISOString()};
    tx.type='income';
    tx.amount=total;
    var cur=currency(root,task.currency_code||task.currency||project.budgetCurrency);
    tx.currency=cur.code;tx.currency_code=cur.code;tx.currency_symbol=cur.symbol;
    tx.isoDate=tx.isoDate||new Date().toISOString().slice(0,10);
    tx.date=tx.date||tx.isoDate;
    tx.desc=(paid?'تحصيل مهمة: ':'عربون مهمة: ')+(task.title||'');
    tx.source=client?.name||project.name;
    tx.client=client?.name||'';
    tx.client_id=project.client_id||'';
    tx.project_id=asId(project.id);
    tx.project_name=project.name||'';
    tx.linkedProjTaskId=task.id;
    tx.source_type='project_task_payment';
    if(!existing)state.transactions.push(tx);
    return tx;
  }
  function projectIncomeNotInLedger(state,project){
    if(!state||!project)return [];
    var rows=project.projectLedger||[];
    return (state.transactions||[]).filter(function(tx){
      if(tx.type!=='income'||tx.isLoan||asId(tx.project_id||tx.projectId)!==asId(project.id))return false;
      if(tx.source_type==='project_manual_post'||asId(tx.desc).indexOf('إتمام مهمة:')===0)return false;
      if(tx.project_ledger_id&&rows.some(function(row){return asId(row.id)===asId(tx.project_ledger_id);}))return false;
      if(tx.statementId&&rows.some(function(row){return asId(row.statementId)===asId(tx.statementId);}))return false;
      if((tx.invoiceId||tx.invoice_id)&&rows.some(function(row){return asId(row.invoiceId||row.invoice_id)===asId(tx.invoiceId||tx.invoice_id);}))return false;
      return true;
    });
  }
  var api={paymentTransaction:paymentTransaction,removePaymentTransaction:removePaymentTransaction,taskPaymentTransaction:taskPaymentTransaction,projectIncomeNotInLedger:projectIncomeNotInLedger};
  root.OrdoProjectFinance=api;
  if(typeof root.document==='undefined' || typeof root.S==='undefined')return;
  function persist(){try{root.lsSave();}catch(e){}try{root.cloudSave(root.S);}catch(e){}}
  function project(id){return (root.S.projects||[]).find(function(p){return asId(p.id)===asId(id);});}
  function syncNewRows(p,existingIds){
    if(!p)return false;
    var changed=false;
    (p.projectLedger||[]).forEach(function(row){
      if(row.financeTransactionId || !existingIds.has(asId(row.id))){
        if(paymentTransaction(root.S,p,row))changed=true;
      }
    });
    return changed;
  }
  function legacyRows(p){
    return (p?.projectLedger||[]).filter(function(row){
      return row.kind==='client_payment'&&!row.financeTransactionId&&!row.statementId&&!row.invoiceId&&!row.invoice_id;
    });
  }
  function possibleExisting(p,row){
    var client=(root.S.clients||[]).find(function(c){return asId(c.id)===asId(p.client_id);});
    return (root.S.transactions||[]).some(function(tx){
      if(tx.type!=='income'||Math.abs(amount(tx.amount)-amount(row.amount))>.001)return false;
      if(asId(tx.project_id)===asId(p.id))return true;
      return client && (tx.source===client.name||tx.client===client.name||asId(tx.client_id)===asId(client.id)) &&
        asId(tx.isoDate||tx.date)===asId(row.date);
    });
  }
  var saveProject=root.saveProject;
  if(typeof saveProject==='function'){
    root.saveProject=function(){
      var editId=root.document.getElementById('proj-eid')?.value;
      var before=project(editId);
      var oldRows=(before?.projectLedger||[]).slice();
      var existingIds=new Set(oldRows.map(function(row){return asId(row.id);}));
      var oldProjectIds=new Set((root.S.projects||[]).map(function(p){return asId(p.id);}));
      var result=saveProject.apply(this,arguments);
      var updated=editId?project(editId):(root.S.projects||[]).find(function(p){return !oldProjectIds.has(asId(p.id));});
      if(!updated)return result;
      var changed=syncNewRows(updated,existingIds);
      oldRows.forEach(function(row){
        if(row.financeTransactionId && !(updated.projectLedger||[]).some(function(r){return asId(r.id)===asId(row.id);})){
          changed=removePaymentTransaction(root.S,updated,row)||changed;
        }
      });
      if(changed)persist();
      return result;
    };
  }
  var saveRow=root.saveProjectLedgerRow;
  if(typeof saveRow==='function'){
    root.saveProjectLedgerRow=function(id){
      var p=project(id), before=new Set((p?.projectLedger||[]).map(function(row){return asId(row.id);}));
      var result=saveRow.apply(this,arguments);
      if(syncNewRows(p,before)){
        persist();
        if(typeof root.renderProjectDetail==='function')root.renderProjectDetail();
        if(typeof root.renderFinance==='function')root.renderFinance();
      }
      return result;
    };
  }
  var saveTask=root.saveProjTask;
  if(typeof saveTask==='function'){
    root.saveProjTask=function(){
      var id=root.document.getElementById('ptask-eid')?.value;
      var projectId=root.document.getElementById('ptask-proj-id')?.value;
      var before=new Set((root.S.project_tasks||[]).map(function(t){return asId(t.id);}));
      var result=saveTask.apply(this,arguments);
      var task=id?(root.S.project_tasks||[]).find(function(t){return asId(t.id)===asId(id);}):
        (root.S.project_tasks||[]).find(function(t){return !before.has(asId(t.id))&&asId(t.project_id)===asId(projectId);});
      if(task && taskPaymentTransaction(root.S,project(task.project_id),task))persist();
      return result;
    };
  }
  var renderTab=root.renderProjTabContent;
  if(typeof renderTab==='function'){
    root.renderProjTabContent=function(tab){
      var html=renderTab.apply(this,arguments);
      if(tab!=='finance'||typeof html!=='string')return html;
      var p=arguments[1],receipts=projectIncomeNotInLedger(root.S,p);
      var escaped=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
      var taskSection=receipts.length?'<section class="project-v2-panel"><h3><i class="fa-solid fa-money-bill-transfer"></i> دخل مرتبط بالمشروع من المالية</h3><div class="project-v2-ledger">'+receipts.map(function(tx){
        return '<div class="income"><span><i class="fa-solid fa-arrow-down"></i></span><div><b>'+escaped(tx.desc)+'</b><small>'+escaped(tx.isoDate||tx.date||'')+' · مسجل في الدخل</small></div><strong>+'+amount(tx.amount).toLocaleString('ar-EG')+' '+escaped(tx.currency||p.budgetCurrency||'ج.م')+'</strong></div>';
      }).join('')+'</div></section>':'';
      var legacy=legacyRows(p);
      var legacyNote=legacy.length?'<div class="project-v3-finance-note"><i class="fa-solid fa-triangle-exclamation"></i><span>'+legacy.length+' حركة تحصيل قديمة غير مرتبطة تلقائيًا بسجل الدخل. راجعها قبل الربط حتى لا يتكرر الدخل. <button class="btn btn-ghost btn-sm" onclick="openProjectLegacySync(&quot;'+escaped(p.id)+'&quot;)">مراجعة الحركات القديمة</button></span></div>':'';
      return html.replace(/<button[^>]*onclick="openProjectPostModal[^>]*>[\s\S]*?<\/button>/g,'')
        .replace('سجل المحفظة','سجل حركات المشروع')+legacyNote+taskSection;
    };
  }
  root.openProjectLegacySync=function(projectId){
    var p=project(projectId);
    if(!p)return;
    var escaped=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
    var rows=legacyRows(p),overlay=root.document.createElement('div');
    overlay.className='modal-overlay';overlay.style.display='flex';
    overlay.innerHTML='<div class="modal project-ledger-v10"><div class="modal-header"><div class="modal-title">مراجعة التحصيلات القديمة</div><button class="close-btn" onclick="this.closest(&quot;.modal-overlay&quot;).remove()">×</button></div><p style="color:var(--text2);font-size:12px">الحركات التي لها دخل مطابق محتمل لا تُرحّل آليًا. راجع سجل المالية أولًا.</p><div class="project-v2-ledger">'+rows.map(function(row){
      var candidate=possibleExisting(p,row);
      return '<div class="income"><span><i class="fa-solid fa-coins"></i></span><div><b>'+escaped(row.desc||'تحصيل قديم')+'</b><small>'+escaped(row.date||'')+(candidate?' · توجد حركة دخل مطابقة محتملة':' · غير مرتبط بالمالية')+'</small></div><strong>'+amount(row.amount).toLocaleString('ar-EG')+' '+escaped(row.currency||p.budgetCurrency||'ج.م')+'</strong>'+(candidate?'<em>راجعها يدويًا</em>':'<button class="btn btn-primary btn-sm" onclick="syncProjectLegacyPayment(&quot;'+escaped(p.id)+'&quot;,&quot;'+escaped(row.id)+'&quot;,this.closest(&quot;.modal-overlay&quot;))">ربط</button>')+'</div>';
    }).join('')+'</div></div>';
    root.document.body.appendChild(overlay);
  };
  root.syncProjectLegacyPayment=function(projectId,rowId,overlay){
    var p=project(projectId),row=legacyRows(p).find(function(item){return asId(item.id)===asId(rowId);});
    if(!row||possibleExisting(p,row))return;
    if(!root.confirm('تأكدت أن هذا التحصيل لم يُسجّل من قبل في المالية؟ سيتم إضافته للدخل مرة واحدة.'))return;
    paymentTransaction(root.S,p,row);
    persist();
    if(overlay)overlay.remove();
    if(typeof root.renderProjectDetail==='function')root.renderProjectDetail();
    if(typeof root.renderFinance==='function')root.renderFinance();
  };
  root.deleteProjectLedgerRow=function(projectId,rowId){
    var p=project(projectId), row=(p?.projectLedger||[]).find(function(r){return asId(r.id)===asId(rowId);});
    if(!row)return;
    var message=row.financeTransactionId?'حذف هذه الحركة المالية من المشروع والمالية؟':'حذف هذه الحركة من المشروع؟ أي تسجيل قديم منفصل في المالية سيبقى كما هو.';
    if(!root.confirm(message))return;
    removePaymentTransaction(root.S,p,row);
    p.projectLedger=p.projectLedger.filter(function(r){return asId(r.id)!==asId(rowId);});
    persist();
    if(typeof root.renderProjectDetail==='function')root.renderProjectDetail();
    if(typeof root.renderFinance==='function')root.renderFinance();
  };
  try{deleteProjectLedgerRow=root.deleteProjectLedgerRow;}catch(e){}
  // New project receipts are already Finance income. A manual income transfer
  // would create a second income transaction for the same cash receipt.
  var post=root.postProjectToMainFinance;
  if(typeof post==='function')root.postProjectToMainFinance=function(){
    if(root.document.getElementById('pp-type')?.value==='income'){
      if(typeof root.toast==='function')root.toast('تحصيلات المشروع تظهر في الدخل تلقائيًا؛ لا تسجلها مرتين.');
      return;
    }
    return post.apply(this,arguments);
  };
})(window);
