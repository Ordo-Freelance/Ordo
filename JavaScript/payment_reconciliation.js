(function(root){
  'use strict';

  function num(value){ var n=Number(value); return Number.isFinite(n)?Math.max(0,n):0; }
  function sid(value){ return String(value==null?'':value); }
  function paidStatus(value){ return ['paid','مدفوعة','مدفوع','collected'].includes(String(value||'').toLowerCase()); }
  function taskId(item){ return item&&(item._projectTaskId||item.projectTaskId||item.linkedProjTaskId||item._taskId||item.taskId||item.linkedTaskId); }
  function lineAmount(item){ return num(item&&item.qty||1)*num(item&&item.price); }
  function invoiceTotal(inv){
    if(!inv)return 0;
    var itemTotal=(inv.items||[]).reduce(function(sum,item){return sum+lineAmount(item);},0);
    var subtotal=itemTotal||num(inv.subtotal)||num(inv.total);
    return Math.max(0,num(inv.total)||subtotal-num(inv.discountAmount));
  }
  function invoiceId(inv){ return sid(inv&&(inv.id||inv.invoice_id)); }
  function clientMatches(entity,client){
    if(!entity||!client)return false;
    return sid(entity.client_id||entity.clientId)===sid(client.id) || sid(entity.client||entity.client_name||entity.clientName||entity.source)===sid(client.name);
  }
  function allocationRows(state,invoice){
    var id=invoiceId(invoice),rows=[];
    (state.transactions||[]).forEach(function(tx){
      (tx.allocations||[]).forEach(function(a){if(sid(a.invoice_id||a.invoiceId)===id)rows.push({tx:tx,allocation:a,amount:num(a.amount)});});
    });
    return rows;
  }
  function allocationTotal(state,invoice,excludeRef){
    return allocationRows(state,invoice).reduce(function(sum,row){
      return excludeRef&&sid(row.tx.source_ref)===sid(excludeRef)?sum:sum+row.amount;
    },0);
  }
  function linkedTasks(state,invoice){
    var seen=new Set(),rows=[];
    (invoice.items||[]).forEach(function(item){
      var id=taskId(item); if(!id||seen.has(sid(id)))return;
      var task=(state.tasks||[]).concat(state.project_tasks||[]).find(function(t){return sid(t.id)===sid(id);});
      if(task){seen.add(sid(id));rows.push({task:task,item:item,amount:lineAmount(item)||num(task.value||task.amount||task.price)});}
    });
    return rows;
  }
  function setTaskPaid(task,amount,paid,invoice){
    if(!task)return;
    var total=num(task.value||task.amount||task.price||amount),received=Math.min(total||amount,num(amount));
    task.paidAmount=received; task.amountPaid=received; task.collectedAmount=received;
    task.deposit=paid?0:received; task.depositAmount=paid?0:received;
    task.invoiceId=invoice?invoice.id:(task.invoiceId||null);
    task.invoiceNum=invoice?(invoice.num||''):(task.invoiceNum||'');
    task.invoiced=!!invoice; task.invoicePending=!!invoice&&!paid;
    task.paymentCollected=!!paid; task.paid=!!paid;
    task.paymentStatus=paid?'collected':(received>0?'deposit':(invoice?'invoiced':'pending'));
    task.pay=paid?'full':(received>0?'deposit':'none');
    if(paid){task.collectedAt=task.collectedAt||new Date().toISOString().slice(0,10);task.collectedAtIso=task.collectedAtIso||new Date().toISOString();}
    else {task.collectedAt=null;task.collectedAtIso=null;}
  }
  function taskCollectionId(row){return sid(row&&(row.task_id||row.taskId||row.linkedTaskId));}
  function syncTaskCollection(state,task,amount,paid,invoice,sourceType){
    state.task_collections=Array.isArray(state.task_collections)?state.task_collections:[];
    state.task_collections=state.task_collections.filter(function(row){return taskCollectionId(row)!==sid(task.id);});
    if(!paid)return;
    var isProject=(state.project_tasks||[]).includes(task),now=new Date().toISOString();
    state.task_collections.push({id:'task-collection:'+sid(task.id),source_ref:'task-collection:'+sid(task.id),task_id:task.id,task_title:task.title||'',source_type:isProject?'project_task':'task',project_id:task.project_id||task.projectId||'',project_name:task.projectName||'',client:task.client||invoice&&invoice.client||'',amount:num(amount),currency:task.currency||'EGP',collectedAt:now.slice(0,10),collectedAtIso:now,source:sourceType||'payment_reconciliation',invoice_id:invoice&&invoice.id||'',createdAt:now});
  }
  function explicitTaskPayments(state,task){
    var isProject=(state.project_tasks||[]).includes(task),id=sid(task&&task.id);
    return (state.transactions||[]).filter(function(tx){
      var linked=isProject?sid(tx.linkedProjTaskId||tx.linkedProjectTaskId):sid(tx.linkedTaskId);
      var ref='task-payment:'+(isProject?'project_task':'task')+':'+id;
      return linked===id || sid(tx.source_ref)===ref;
    });
  }
  function reconcileLinkedTask(state,row,invoice){
    var task=row.task,payments=explicitTaskPayments(state,task);
    var received=payments.reduce(function(sum,tx){return sum+num(tx.amount);},0);
    var total=num(task.value||task.amount||task.price||row.amount),full=total>0&&received>=total-0.005;
    setTaskPaid(task,Math.min(total||received,received),full,invoice);
    syncTaskCollection(state,task,total,full,invoice,'task_payment');
  }
  function reconcileInvoice(state,invoice){
    if(!invoice)return null;
    var total=invoiceTotal(invoice),rows=allocationRows(state,invoice);
    var legacy=num(invoice.legacyPaidAmount);
    if(!invoice._paymentReconciled&&!rows.length&&!legacy&&(paidStatus(invoice.status)||invoice.paid===true))legacy=num(invoice.paidAmount)||total;
    invoice.legacyPaidAmount=Math.min(total,legacy);
    invoice._paymentReconciled=true;
    var prepaid=Math.min(total,Math.max(num(invoice.deposit),invoice.legacyPaidAmount));
    var allocated=Math.min(Math.max(0,total-prepaid),allocationTotal(state,invoice));
    var paidAmount=Math.min(total,prepaid+allocated),remaining=Math.max(0,total-paidAmount);
    invoice.paidAmount=paidAmount;invoice.amountPaid=paidAmount;invoice.remainingAmount=remaining;
    invoice.paid=total>0&&remaining<0.005;
    invoice.status=invoice.paid?'paid':(paidAmount>0?'partial':'pending');
    if(!invoice.paid)invoice.collectedAt=null;
    linkedTasks(state,invoice).forEach(function(row){
      // A client/invoice receipt changes the invoice balance only. A task is
      // paid (or has a deposit) only when a transaction explicitly targets it.
      reconcileLinkedTask(state,row,invoice);
    });
    return {total:total,paid:paidAmount,remaining:remaining,status:invoice.status};
  }
  function reconcileAll(state){
    state.transactions=Array.isArray(state.transactions)?state.transactions:[];
    state.invoices=Array.isArray(state.invoices)?state.invoices:[];
    // Remove rows created by the old behaviour that distributed a general
    // invoice receipt across tasks. They are not evidence of a task payment.
    var staleIds=new Set((state.task_collections||[]).filter(function(row){return row.source==='invoice_reconciliation';}).map(function(row){return taskCollectionId(row);}));
    state.task_collections=(state.task_collections||[]).filter(function(row){return row.source!=='invoice_reconciliation';});
    (state.tasks||[]).concat(state.project_tasks||[],state.archivedTasks||[]).forEach(function(task){
      if(staleIds.has(sid(task.id))&&!explicitTaskPayments(state,task).length)setTaskPaid(task,0,false,invoiceForTask(state,task));
    });
    state.invoices.forEach(function(inv){reconcileInvoice(state,inv);});
    return state;
  }
  function upsertTransaction(state,tx){
    state.transactions=Array.isArray(state.transactions)?state.transactions:[];
    var index=state.transactions.findIndex(function(row){return sid(row.id)===sid(tx.id)||(tx.source_ref&&sid(row.source_ref)===sid(tx.source_ref));});
    if(index<0)state.transactions.push(tx);else state.transactions[index]=Object.assign({},state.transactions[index],tx,{id:state.transactions[index].id||tx.id});
    return index<0?tx:state.transactions[index];
  }
  function removeByRef(state,ref){
    var before=(state.transactions||[]).length;
    state.transactions=(state.transactions||[]).filter(function(tx){return sid(tx.source_ref)!==sid(ref);});
    return before-state.transactions.length;
  }
  function receipt(state,client,amount,meta){
    meta=meta||{};amount=num(amount);if(!amount)throw new Error('invalid_amount');
    var now=meta.createdAt||new Date().toISOString(),ref=meta.source_ref||('client-receipt:'+sid(client.id)+':'+Date.now());
    var duplicate=(state.transactions||[]).find(function(tx){return sid(tx.source_ref)===sid(ref);});
    if(duplicate)return duplicate;
    var left=amount,allocations=[];
    (state.invoices||[]).filter(function(inv){return clientMatches(inv,client);}).sort(function(a,b){return sid(a.date||a.createdAt).localeCompare(sid(b.date||b.createdAt));}).forEach(function(inv){
      if(left<=0)return;var total=invoiceTotal(inv),prepaid=Math.min(total,num(inv.deposit));
      var remaining=Math.max(0,total-prepaid-allocationTotal(state,inv));if(!remaining)return;
      var applied=Math.min(left,remaining);allocations.push({invoice_id:inv.id,amount:applied});left-=applied;
    });
    var tx={id:meta.id||('tx_'+Date.now()+'_'+Math.random().toString(36).slice(2,6)),source_ref:ref,source_type:meta.source_type||'client_receipt',type:'income',amount:amount,client:client.name,client_id:client.id,source:client.name,desc:meta.desc||('تحصيل من '+client.name),payMethod:meta.payMethod||'كاش',isoDate:sid(now).slice(0,10),date:sid(now).slice(0,10),createdAt:now,allocations:allocations,unallocatedAmount:left};
    upsertTransaction(state,tx);reconcileAll(state);return tx;
  }
  function settleInvoice(state,invoice,meta){
    meta=meta||{};var ref='invoice-payment:'+invoiceId(invoice),total=invoiceTotal(invoice),prepaid=Math.min(total,num(invoice.deposit));
    var remaining=Math.max(0,total-prepaid-allocationTotal(state,invoice,ref));
    if(remaining>0)upsertTransaction(state,{id:ref,source_ref:ref,source_type:'invoice_payment',type:'income',amount:remaining,client:invoice.client||'',client_id:invoice.client_id||invoice.clientId||'',source:invoice.client||'',desc:'تحصيل فاتورة '+(invoice.num||invoice.id),payMethod:meta.payMethod||'غير محدد',invoice_id:invoice.id,isoDate:new Date().toISOString().slice(0,10),date:new Date().toISOString().slice(0,10),createdAt:new Date().toISOString(),allocations:[{invoice_id:invoice.id,amount:remaining}]});
    invoice.collectedAt=new Date().toISOString().slice(0,10);reconcileInvoice(state,invoice);return invoice;
  }
  function unsettleInvoice(state,invoice){ removeByRef(state,'invoice-payment:'+invoiceId(invoice));invoice.legacyPaidAmount=0;invoice.paidAmount=0;invoice.amountPaid=0;invoice.paid=false;invoice.status='pending';invoice.collectedAt=null;reconcileInvoice(state,invoice);return invoice; }
  function toggleTask(state,task,invoice){
    var type=(state.project_tasks||[]).includes(task)?'project_task':'task',ref='task-payment:'+type+':'+sid(task.id);
    var isPaid=task.paymentCollected===true||task.paid===true||paidStatus(task.paymentStatus)||task.pay==='full';
    if(isPaid){removeByRef(state,ref);setTaskPaid(task,0,false,invoice);syncTaskCollection(state,task,0,false,invoice,'task_payment');}
    else {
      var amount=num(task.value||task.amount||task.price),allocation=invoice?{invoice_id:invoice.id,task_id:task.id,amount:amount}:null;
      upsertTransaction(state,{id:ref,source_ref:ref,source_type:'task_payment',type:'income',amount:amount,client:task.client||invoice&&invoice.client||'',client_id:task.client_id||task.clientId||invoice&&(invoice.client_id||invoice.clientId)||'',source:task.client||invoice&&invoice.client||'',desc:'تحصيل مهمة: '+(task.title||''),linkedTaskId:type==='task'?task.id:'',linkedProjTaskId:type==='project_task'?task.id:'',invoice_id:invoice&&invoice.id||'',isoDate:new Date().toISOString().slice(0,10),date:new Date().toISOString().slice(0,10),createdAt:new Date().toISOString(),allocations:allocation?[allocation]:[]});
      setTaskPaid(task,amount,true,invoice);
      syncTaskCollection(state,task,amount,true,invoice,'task_payment');
    }
    if(invoice)reconcileInvoice(state,invoice);return !isPaid;
  }
  function invoiceForTask(state,task){return (state.invoices||[]).find(function(inv){return (inv.items||[]).some(function(item){return sid(taskId(item))===sid(task.id);});})||null;}
  function auditClient(state,client){
    var tx=(state.transactions||[]).filter(function(row){return clientMatches(row,client);}),seen=new Map(),duplicates=[];
    tx.forEach(function(row){var key=[row.type,num(row.amount),sid(row.isoDate||row.date),sid(row.desc).trim()].join('|');if(seen.has(key))duplicates.push({kept:seen.get(key),duplicate:row,key:key});else seen.set(key,row);});
    var invoices=(state.invoices||[]).filter(function(inv){return clientMatches(inv,client);}).map(function(inv){return Object.assign({invoice:inv},reconcileInvoice(state,inv));});
    return {client:client,transactions:tx,invoices:invoices,duplicates:duplicates};
  }

  var api={invoiceTotal:invoiceTotal,allocationTotal:allocationTotal,reconcileInvoice:reconcileInvoice,reconcileAll:reconcileAll,receipt:receipt,settleInvoice:settleInvoice,unsettleInvoice:unsettleInvoice,toggleTask:toggleTask,invoiceForTask:invoiceForTask,auditClient:auditClient,removeByRef:removeByRef};
  root.OrdoPaymentReconciliation=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;

  if(typeof document==='undefined')return;
  root._confirmCollect=function(clientId,totalOwed){
    if(root.__ordoCollectBusy)return;
    var client=(root.S.clients||[]).find(function(c){return sid(c.id)===sid(clientId);});if(!client)return;
    var amount=num(document.getElementById('_collect_amount')?.value);if(!amount){root.toast('أدخل مبلغاً صحيحاً');return;}
    root.__ordoCollectBusy=true;
    try{
      var method=document.getElementById('_collect_method')?.value||'كاش',note=document.getElementById('_collect_note')?.value||('تحصيل من '+client.name);
      receipt(root.S,client,amount,{payMethod:method,desc:note});
      root.lsSave();if(typeof root.cloudSave==='function')root.cloudSave(root.S);
      document.querySelectorAll('.modal-overlay').forEach(function(o){if(o.querySelector('#_collect_amount'))o.remove();});
      root.renderAll();if(typeof root.openClientProfile==='function')root.openClientProfile(clientId);
      root.toast('تم تسجيل الدفعة وتوزيعها على الفواتير بدون تكرار');
    }finally{setTimeout(function(){root.__ordoCollectBusy=false;},800);}
  };
  root.markPaid=function(id){var inv=(root.S.invoices||[]).find(function(i){return sid(i.id)===sid(id);});if(!inv)return;settleInvoice(root.S,inv);root.lsSave();if(typeof root.cloudSave==='function')root.cloudSave(root.S);root.renderAll();root.previewInv(inv.id);root.showMiniNotif('تم تحصيل الفاتورة وتحديث التاسكات المرتبطة');};
  root.markUncollected=function(id){var inv=(root.S.invoices||[]).find(function(i){return sid(i.id)===sid(id);});if(!inv)return;unsettleInvoice(root.S,inv);root.lsSave();if(typeof root.cloudSave==='function')root.cloudSave(root.S);root.renderAll();root.previewInv(inv.id);};
  root._toggleProfileTaskPayment=function(taskId,sourceType,clientId){
    var task=(root.S.tasks||[]).concat(root.S.project_tasks||[]).find(function(t){return sid(t.id)===sid(taskId);});if(!task)return;
    var inv=invoiceForTask(root.S,task),paid=toggleTask(root.S,task,inv);root.lsSave();if(typeof root.cloudSave==='function')root.cloudSave(root.S);root.renderAll();
    if(clientId)setTimeout(function(){root._renderProfileTab('overview',clientId);},50);
    root.showMiniNotif(paid?'تم تحصيل المهمة وخصمها من الفاتورة':'تم إلغاء تحصيل المهمة وتحديث الفاتورة');
  };
  var originalSaveInvoice=root.saveInvoice;
  if(typeof originalSaveInvoice==='function')root.saveInvoice=function(){var result=originalSaveInvoice.apply(this,arguments);reconcileAll(root.S);root.lsSave();if(typeof root.cloudSave==='function')root.cloudSave(root.S);return result;};
  setTimeout(function(){try{reconcileAll(root.S);}catch(e){console.warn('Payment reconciliation:',e);}},0);
})(typeof window!=='undefined'?window:globalThis);
