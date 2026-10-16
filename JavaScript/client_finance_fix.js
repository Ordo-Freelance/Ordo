(function(root){
  'use strict';

  function S(){ return root.S || {}; }
  function arr(v){ return Array.isArray(v) ? v : []; }
  function num(v){ v = Number(v); return isFinite(v) ? v : 0; }
  function esc(v){
    return String(v == null ? '' : v).replace(/[&<>"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function jsArg(v){ return esc(JSON.stringify(v)); }
  function cur(entity){
    return (entity && (entity.currency_code || entity.currency || entity.currency_symbol)) || (S().settings && (S().settings.base_currency_code || S().settings.currency)) || 'EGP';
  }
  function fmt(v, code){
    code = code || 'EGP';
    try { return new Intl.NumberFormat('ar-EG',{style:'currency',currency:code,maximumFractionDigits:0}).format(num(v)); }
    catch(e){ return Math.round(num(v)).toLocaleString('ar-EG') + ' ' + code; }
  }
  function injectStyle(){
    if(document.getElementById('client-finance-fix-style')) return;
    var style = document.createElement('style');
    style.id = 'client-finance-fix-style';
    style.textContent = '.fv3-table{width:100%;border-collapse:collapse;font-size:13px}.fv3-table th,.fv3-table td{padding:10px;border-bottom:1px solid var(--border);text-align:right;vertical-align:middle}.fv3-table th{color:var(--text3);font-size:11px;font-weight:900;background:var(--surface2)}.fv3-pill{display:inline-flex;align-items:center;gap:6px;padding:5px 8px;border:1px solid var(--border);border-radius:999px;background:var(--surface2);font-size:12px;color:var(--text2);font-weight:700}';
    document.head.appendChild(style);
  }
  function txDate(t){ return String((t && (t.isoDate || t.date || t.createdAt)) || '').slice(0,10); }
  function collectionTransaction(row){
    var taskId=String(row&&(row.task_id||row.taskId)||''),invoiceId=String(row&&row.invoice_id||'');
    return arr(S().transactions).find(function(tx){
      if(String(tx.source_ref||'')==='task-collection-ledger:'+String(row.id||''))return true;
      if(taskId&&String(tx.linkedTaskId||tx.linkedProjTaskId||'')===taskId)return true;
      return invoiceId&&arr(tx.allocations).some(function(a){return String(a.invoice_id||a.invoiceId||'')===invoiceId;});
    })||null;
  }
  function ensureCollectionTransactions(bundle){
    var changed=false,s=S(),projectIds={};bundle.projects.forEach(function(p){projectIds[String(p.id)]=true;});
    arr(s.task_collections).forEach(function(row){
      var belongs=bundle.names.indexOf(String(row.client||''))>-1||(row.project_id!=null&&projectIds[String(row.project_id)]);
      if(!belongs||collectionTransaction(row)||num(row.amount)<=0)return;
      var raw=String(row.collectedAtIso||row.createdAt||row.collectedAt||''),hasTime=raw.indexOf('T')>-1&&raw.slice(11,16)!=='00:00';
      var taskId=String(row.task_id||''),isProject=row.source_type==='project_task';
      s.transactions=arr(s.transactions);s.transactions.push({
        id:'task-collection-ledger:'+String(row.id||taskId),source_ref:'task-collection-ledger:'+String(row.id||taskId),source_type:'task_collection_ledger',type:'income',amount:num(row.amount),
        client:row.client||bundle.client.name,client_id:bundle.client.id,source:row.client||bundle.client.name,desc:'تحصيل مهمة: '+(row.task_title||row.title||'-'),
        linkedTaskId:isProject?'':taskId,linkedProjTaskId:isProject?taskId:'',project_id:row.project_id||'',currency_code:row.currency||cur(row),
        isoDate:raw.slice(0,10),date:raw.slice(0,10),createdAt:raw&&raw.indexOf('T')>-1?raw:(raw.slice(0,10)+'T00:00:00'),collectionTimeUnknown:!hasTime,payMethod:row.payMethod||'غير مسجل'
      });changed=true;
    });
    if(changed){if(typeof root.lsSave==='function')root.lsSave();if(typeof root.cloudSave==='function')root.cloudSave(s);}
    return changed;
  }
  function invTotal(i){ return num(i && (i.total || i.amount || i.value)); }
  function invPaid(i){
    var st = String((i && i.status) || '').toLowerCase();
    return !!(i && (i.paid || st === 'paid' || st === 'مدفوعة' || st === 'مدفوع'));
  }
  function taskPaidAmount(t){
    if(!t)return 0;
    var id=String(t.id||'');
    return arr(S().transactions).reduce(function(sum,tx){
      var linked=String(tx.linkedTaskId||tx.linkedProjTaskId||tx.linkedProjectTaskId||'')===id;
      var ref=String(tx.source_ref||''),explicit=linked||ref==='task-payment:task:'+id||ref==='task-payment:project_task:'+id;
      return explicit&&tx.type==='income'?sum+Math.max(0,num(tx.amount)):sum;
    },0);
  }
  function taskPaid(t){
    var value=num(t&&(t.value||t.amount||t.price||t.total||t.clientAmount||t.clientPrice));
    return value>0&&taskPaidAmount(t)>=value-0.005;
  }
  function uniqueTasks(rows){
    var seen={};return rows.filter(function(t){var id=String(t&&t.id||'');if(!id||seen[id])return false;seen[id]=true;return true;});
  }
  function isProjectTask(t){return !!(t&&(t.source_type==='project_task'||t.project_id||t.projectId));}
  function taskDate(t){ return String((t && (t.isoDate || t.orderDate || t.createdAt || t.doneAt)) || '').slice(0,10); }
  function clientBundle(clientId){
    var s = S();
    var c = arr(s.clients).find(function(x){ return String(x.id) === String(clientId); });
    if(!c) return null;
    var sub = arr(s.clients).filter(function(x){ return String(x.parentClientId) === String(c.id); });
    var ids = [String(c.id)].concat(sub.map(function(x){ return String(x.id); }));
    var names = [c.name].concat(sub.map(function(x){ return x.name; })).filter(Boolean);
    function match(e){
      if(!e) return false;
      if(ids.indexOf(String(e.client_id || e.clientId || e.customer_id || e.customerId || '')) > -1) return true;
      var values = [e.client, e.client_name, e.clientName, e.source, e.customer, e.customer_name].filter(Boolean);
      return values.some(function(v){ return names.indexOf(String(v)) > -1; });
    }
    var projects = arr(s.projects).filter(match);
    var projectIds = {};
    projects.forEach(function(p){ if(p && p.id != null) projectIds[String(p.id)] = true; });
    var archived=arr(s.archivedTasks);
    var tasks = uniqueTasks(arr(s.tasks).concat(archived.filter(function(t){return !isProjectTask(t);}))).filter(match);
    var projectTasks = uniqueTasks(arr(s.project_tasks).concat(archived.filter(isProjectTask))).filter(function(t){
      return match(t) || (t && projectIds[String(t.project_id || t.projectId || '')]);
    });
    var invoices = arr(s.invoices).filter(match).filter(function(i){ return !isProjectInvoice(i); });
    var transactions = arr(s.transactions).filter(function(t){ return match(t) && !t.isLoan; });
    return {client:c, names:names, ids:ids, projects:projects, tasks:tasks, projectTasks:projectTasks, invoices:invoices, transactions:transactions};
  }
  function taskUnpaidAmount(t){
    var value = num(t.value || t.amount || t.price || t.total || t.clientAmount || t.clientPrice);
    return Math.max(0, value - taskPaidAmount(t));
  }
  function taskValue(t){
    return num(t && (t.value || t.amount || t.price || t.total || t.clientAmount || t.clientPrice || t.paidAmount || t.amountPaid));
  }
  function invoiceTaskIds(invoices){
    var ids = {};
    invoices.forEach(function(i){
      arr(i.items).forEach(function(it){
        if(it && it._taskId != null) ids[String(it._taskId)] = true;
        if(it && it.taskId != null) ids[String(it.taskId)] = true;
        if(it && it.linkedTaskId != null) ids[String(it.linkedTaskId)] = true;
      });
    });
    return ids;
  }
  function isProjectInvoice(i){
    return !!(i && (i.project_id || i.projectId || arr(i.items).some(function(it){
      return it && (it.section === 'projects' || it._projectTaskId || it.project_id || it.projectId);
    })));
  }
  function summary(bundle){
    var byCurrency = {};
    function add(code, key, value){
      code = code || 'EGP';
      byCurrency[code] = byCurrency[code] || {code:code, invoiced:0, paid:0, unpaidInvoices:0, unpaidTasks:0, income:0, expense:0, availableCredit:0, openingDue:0, openingPrepaid:0};
      byCurrency[code][key] += num(value);
    }
    var c = bundle.client;
    var opening = num(c.openingBalance);
    if(opening && (c.openingBalanceType || 'receivable') === 'prepaid') add(cur(c), 'openingPrepaid', opening);
    else if(opening) add(cur(c), 'openingDue', opening);

    bundle.invoices.forEach(function(i){
      add(cur(i), 'invoiced', invTotal(i));
      if(invPaid(i)) add(cur(i), 'paid', invTotal(i));
      else add(cur(i), 'unpaidInvoices', invTotal(i));
    });
    var invoicedTaskIds = invoiceTaskIds(bundle.invoices);
    bundle.tasks.forEach(function(t){
      if(invoicedTaskIds[String(t.id)] || (t.invoiceId && bundle.invoices.some(function(i){ return String(i.id) === String(t.invoiceId); }))) return;
      add(cur(t), 'unpaidTasks', taskUnpaidAmount(t));
    });
    bundle.transactions.forEach(function(t){
      if(t.type === 'expense') add(cur(t), 'expense', Math.abs(num(t.amount)));
      else {
        var income=Math.abs(num(t.amount));
        add(cur(t), 'income', income);
        var hasExplicitCredit=t.unallocatedAmount!=null;
        var linked=arr(t.allocations).length||t.linkedTaskId||t.linkedProjTaskId||t.invoice_id||t.invoiceId;
        var generated=/^(invoice_payment|task_payment|task_collection_ledger|project_ledger|project_task_payment)$/.test(String(t.source_type||''));
        var available=hasExplicitCredit?Math.max(0,num(t.unallocatedAmount)):(!linked&&!generated?income:0);
        if(available) add(cur(t), 'availableCredit', available);
      }
    });
    Object.keys(byCurrency).forEach(function(code){
      var b = byCurrency[code];
      b.netDue = Math.max(0,b.openingDue + b.unpaidInvoices + b.unpaidTasks - b.openingPrepaid - b.availableCredit);
    });
    return byCurrency;
  }
  function moneyList(map, key){
    var rows = Object.keys(map).filter(function(code){ return num(map[code][key]); });
    if(!rows.length) return fmt(0,'EGP');
    return rows.map(function(code){ return fmt(map[code][key], code); }).join(' / ');
  }
  function transactionRows(bundle){
    var rows = [];
    var c = bundle.client;
    if(num(c.openingBalance)){
      var prepaid = (c.openingBalanceType || 'receivable') === 'prepaid';
      rows.push({date:'-', type:prepaid?'رصيد مدفوع مقدما':'رصيد افتتاحي مستحق', desc:c.openingBalanceNote || c.name, amount:prepaid?-num(c.openingBalance):num(c.openingBalance), code:cur(c)});
    }
    bundle.invoices.forEach(function(i){
      rows.push({date:String(i.isoDate || i.date || i.createdAt || '').slice(0,10), type:invPaid(i)?'فاتورة مدفوعة':'فاتورة غير مسددة', desc:'#'+(i.num || i.id || '-') , amount:invPaid(i)?0:invTotal(i), code:cur(i)});
    });
    var invoicedTaskIds = invoiceTaskIds(bundle.invoices);
    bundle.tasks.forEach(function(t){
      if(invoicedTaskIds[String(t.id)] || (t.invoiceId && bundle.invoices.some(function(i){ return String(i.id) === String(t.invoiceId); }))) return;
      var due = taskUnpaidAmount(t);
      if(due > 0) rows.push({date:taskDate(t), type:'مهمة غير مدفوعة', desc:t.title || '-', amount:due, code:cur(t)});
    });
    bundle.transactions.forEach(function(t){
      rows.push({entity:'transaction',id:t.id,txType:t.type,date:txDate(t), type:t.type === 'expense' ? 'مصروف' : 'تحصيل', desc:t.desc || t.source || t.expCat || '-', amount:t.type === 'expense' ? -Math.abs(num(t.amount)) : Math.abs(num(t.amount)), code:cur(t)});
    });
    return rows.sort(function(a,b){ return String(b.date||'').localeCompare(String(a.date||'')); });
  }
  function collectionRows(bundle){
    var s = S();
    var projectIds = {};
    bundle.projects.forEach(function(p){ if(p && p.id != null) projectIds[String(p.id)] = true; });
    var rows = [];
    arr(s.task_collections).forEach(function(r){
      var byClient = bundle.names.indexOf(String(r.client || '')) > -1;
      var byProject = r.project_id != null && projectIds[String(r.project_id)];
      if(!byClient && !byProject) return;
      var tx=collectionTransaction(r);
      if(!tx || num(tx.amount)<=0) return;
      rows.push({
        entity:'collection',
        id:r.id,
        taskId:r.task_id,
        invoiceId:r.invoice_id,
        sourceType:r.source_type,
        key:String(r.source_type || '') + ':' + String(r.task_id || '') + ':' + String(r.collectedAt || r.collectedAtIso || ''),
        date:String(r.collectedAt || r.collectedAtIso || r.createdAt || '').slice(0,10),
        type:r.source_type === 'project_task' ? 'مشروع' : 'فردي',
        desc:r.task_title || r.title || '-',
        project:r.project_name || '',
        amount:num(r.amount),
        code:r.currency || 'EGP'
      });
    });
    return rows.sort(function(a,b){ return String(b.date||'').localeCompare(String(a.date||'')); });
  }
  function renderAccounts(clientId){
    injectStyle();
    var bundle = clientBundle(clientId);
    if(!bundle) return false;
    var body = document.getElementById('profile-body');
    if(!body) return false;
    var sums = summary(bundle);
    var rows = transactionRows(bundle);
    var collectedRows = collectionRows(bundle);
    body.innerHTML =
      '<div class="section-title" style="margin-bottom:10px"><i class="fa-solid fa-scale-balanced"></i> ملخص حساب '+esc(bundle.client.name)+'</div>'+
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px">'+
        card('إجمالي المحصل', moneyList(sums,'income'), 'var(--accent3)', 'fa-coins')+
        card('إجمالي الفواتير', moneyList(sums,'invoiced'), 'var(--accent2)', 'fa-file-invoice')+
        card('فواتير غير مسددة', moneyList(sums,'unpaidInvoices'), 'var(--accent4)', 'fa-clock')+
        card('تاسكات فردية غير مدفوعة', moneyList(sums,'unpaidTasks'), 'var(--accent4)', 'fa-list-check')+
        card('صافي المستحق', moneyList(sums,'netDue'), 'var(--accent4)', 'fa-hand-holding-dollar')+
      '</div>'+
      '<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-bottom:12px">'+
        '<button class="btn btn-primary btn-sm" onclick="_profileShowStatement && _profileShowStatement('+esc(bundle.client.id)+')"><i class="fa-solid fa-file-lines"></i> كشف حساب</button>'+
        '<button class="btn btn-success btn-sm" onclick="openIncomeModal && openIncomeModal()"><i class="fa-solid fa-plus"></i> تسجيل تحصيل</button>'+
      '</div>'+
      '<div class="section-title" style="margin-bottom:10px"><i class="fa-solid fa-square-check"></i> سجل التاسكات المحصلة</div>'+
      (collectedRows.length ? '<table class="fv3-table" style="margin-bottom:16px"><thead><tr><th>التاريخ والوقت</th><th>النوع</th><th>التاسك</th><th>المشروع</th><th>المبلغ</th><th>إجراءات</th></tr></thead><tbody>'+
        collectedRows.map(function(r){
          var actions=r.entity==='collection'?'<div style="display:flex;gap:5px"><button class="btn btn-ghost btn-sm" title="تعديل العملية" onclick="OrdoClientFinanceFix.editCollection('+jsArg(String(r.id))+','+jsArg(bundle.client.id)+')"><i class="fa-solid fa-pen"></i></button><button class="btn btn-danger btn-sm" title="حذف العملية" onclick="OrdoClientFinanceFix.deleteCollection('+jsArg(String(r.id))+','+jsArg(bundle.client.id)+')"><i class="fa-solid fa-trash"></i></button></div>':'<span style="color:var(--text3)">—</span>';
          var tx=r.entity==='collection'?collectionTransaction({id:r.id,task_id:r.taskId,invoice_id:r.invoiceId}):null,time=tx&&!tx.collectionTimeUnknown&&tx.createdAt?new Date(tx.createdAt).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'}):'الوقت غير مسجل';
          return '<tr><td>'+esc(r.date||'-')+'<div style="font-size:10px;color:var(--text3);margin-top:2px">'+esc(time)+'</div></td><td><span class="fv3-pill">'+esc(r.type)+'</span></td><td>'+(tx?'<button class="btn btn-ghost btn-sm" onclick="OrdoPaymentCapture.openDetails('+jsArg(String(tx.id))+')">'+esc(r.desc)+'</button>':esc(r.desc))+'</td><td>'+esc(r.project||'-')+'</td><td style="font-weight:900;color:var(--accent3)">'+fmt(r.amount,r.code)+'</td><td>'+actions+'</td></tr>';
        }).join('')+'</tbody></table>' : '<div class="empty" style="padding:18px;margin-bottom:16px">لا توجد تاسكات محصلة بعد</div>')+
      '<div class="section-title" style="margin-bottom:10px"><i class="fa-solid fa-list-timeline"></i> سجل الحساب</div>'+
      (rows.length ? '<table class="fv3-table"><thead><tr><th>التاريخ</th><th>النوع</th><th>الوصف</th><th>المبلغ</th><th>إجراءات</th></tr></thead><tbody>'+
        rows.map(function(r){
          var actions=r.entity==='transaction'?'<div style="display:flex;gap:5px"><button class="btn btn-ghost btn-sm" title="تعديل العملية" onclick="OrdoClientFinanceFix.editTransaction('+jsArg(String(r.id))+','+jsArg(bundle.client.id)+')"><i class="fa-solid fa-pen"></i></button><button class="btn btn-danger btn-sm" title="حذف العملية" onclick="OrdoClientFinanceFix.deleteTransaction('+jsArg(String(r.id))+','+jsArg(bundle.client.id)+')"><i class="fa-solid fa-trash"></i></button></div>':'<span style="color:var(--text3)">—</span>';
          return '<tr><td>'+esc(r.date||'-')+'</td><td><span class="fv3-pill">'+esc(r.type)+'</span></td><td>'+(r.entity==='transaction'?'<button class="btn btn-ghost btn-sm" style="padding:2px 7px" onclick="OrdoPaymentCapture.openDetails('+jsArg(String(r.id))+')">'+esc(r.desc)+'</button>':esc(r.desc))+'</td><td style="font-weight:900;color:'+(num(r.amount)<0?'var(--accent3)':'var(--accent4)')+'">'+fmt(r.amount,r.code)+'</td><td>'+actions+'</td></tr>';
        }).join('')+'</tbody></table>' : '<div class="empty" style="padding:24px">لا توجد حركات أو مستحقات مسجلة</div>');
    return true;
  }
  function card(label, value, color, icon){
    return '<div class="card" style="padding:12px;text-align:center;border-right:2px solid '+color+'"><div style="font-size:18px;font-weight:900;color:'+color+'">'+value+'</div><div style="font-size:10px;color:var(--text3);margin-top:3px"><i class="fa-solid '+icon+'"></i> '+label+'</div></div>';
  }
  function findTask(row){
    var s=S(), id=String(row && (row.task_id||row.taskId)||'');
    return arr(s.tasks).concat(arr(s.project_tasks),arr(s.archivedTasks)).find(function(t){return String(t.id)===id;}) || null;
  }
  function linkedInvoice(taskId){
    return arr(S().invoices).find(function(inv){return arr(inv.items).some(function(it){return String(it._taskId||it.taskId||it.linkedTaskId||it._projectTaskId||it.projectTaskId||it.linkedProjTaskId||'')===String(taskId);});}) || null;
  }
  function txForCollection(row){
    var taskId=String(row&&row.task_id||''),invoiceId=String(row&&row.invoice_id||'');
    var direct=arr(S().transactions).find(function(tx){return String(tx.source_ref||'')==='task-payment:'+String(row.source_type||'task')+':'+taskId;});
    if(direct)return direct;
    return arr(S().transactions).slice().reverse().find(function(tx){
      if(String(tx.linkedTaskId||tx.linkedProjTaskId||'')===taskId)return true;
      return invoiceId&&arr(tx.allocations).some(function(a){return String(a.invoice_id||a.invoiceId||'')===invoiceId;});
    })||null;
  }
  function setAllocatedAmount(tx,invoiceId,amount){
    var old=0,changed=false;
    tx.allocations=arr(tx.allocations).map(function(a){
      if(!changed&&String(a.invoice_id||a.invoiceId||'')===String(invoiceId)){old=num(a.amount);changed=true;return Object.assign({},a,{amount:amount});}
      return a;
    });
    tx.amount=Math.max(0,num(tx.amount)-old+amount);
    tx.unallocatedAmount=Math.max(0,num(tx.unallocatedAmount));
  }
  async function persist(clientId){
    if(root.OrdoPaymentReconciliation) root.OrdoPaymentReconciliation.reconcileAll(S());
    if(typeof root.lsSave==='function') root.lsSave();
    if(typeof root.cloudSave==='function') await root.cloudSave(S());
    renderAccounts(clientId);
  }
  function editCollection(id,clientId){
    var row=arr(S().task_collections).find(function(r){return String(r.id)===String(id);}); if(!row)return;
    var old=document.getElementById('modal-edit-task-collection'); if(old)old.remove();
    var ov=document.createElement('div');ov.className='modal-overlay';ov.id='modal-edit-task-collection';ov.style.display='flex';
    ov.innerHTML='<div class="modal" style="max-width:470px"><div class="modal-header"><div class="modal-title"><i class="fa-solid fa-pen"></i> تعديل عملية التحصيل</div><button class="close-btn" onclick="this.closest(\'.modal-overlay\').remove()"><i class="fa-solid fa-xmark"></i></button></div><div class="form-group"><label>المبلغ</label><input id="fc-edit-amount" type="number" min="0" step="0.01" value="'+esc(row.amount)+'"></div><div class="form-group"><label>التاريخ</label><input id="fc-edit-date" type="date" value="'+esc(String(row.collectedAt||row.collectedAtIso||'').slice(0,10))+'"></div><div class="form-group"><label>وصف العملية</label><input id="fc-edit-title" value="'+esc(row.task_title||row.title||'')+'"></div><div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-ghost" onclick="this.closest(\'.modal-overlay\').remove()">إلغاء</button><button class="btn btn-primary" onclick="OrdoClientFinanceFix.saveCollection('+jsArg(String(id))+','+jsArg(clientId)+')"><i class="fa-solid fa-floppy-disk"></i> حفظ</button></div></div>';
    document.body.appendChild(ov);
  }
  async function saveCollection(id,clientId){
    var row=arr(S().task_collections).find(function(r){return String(r.id)===String(id);}); if(!row)return;
    var amount=Math.max(0,num(document.getElementById('fc-edit-amount')&&document.getElementById('fc-edit-amount').value));
    var date=(document.getElementById('fc-edit-date')&&document.getElementById('fc-edit-date').value)||new Date().toISOString().slice(0,10);
    var title=(document.getElementById('fc-edit-title')&&document.getElementById('fc-edit-title').value||'').trim();
    if(!amount){if(root.toast)root.toast('أدخل مبلغاً صحيحاً');return;}
    var tx=txForCollection(row),inv=linkedInvoice(row.task_id),oldRowAmount=num(row.amount);
    row.amount=amount;row.collectedAt=date;row.collectedAtIso=date+'T00:00:00';if(title)row.task_title=title;
    if(tx){
      if(inv&&arr(tx.allocations).length){
        var allocation=arr(tx.allocations).find(function(a){return String(a.invoice_id||a.invoiceId||'')===String(inv.id);});
        setAllocatedAmount(tx,inv.id,Math.max(0,num(allocation&&allocation.amount)-oldRowAmount+amount));
      }else tx.amount=amount;
      tx.isoDate=date;tx.date=date;if(title)tx.desc='تحصيل مهمة: '+title;
    }
    var task=findTask(row);if(task){task.paidAmount=amount;task.amountPaid=amount;task.collectedAt=date;task.collectedAtIso=row.collectedAtIso;}
    var modal=document.getElementById('modal-edit-task-collection');if(modal)modal.remove();await persist(clientId);if(root.toast)root.toast('تم تعديل العملية المالية');
  }
  function deleteCollection(id,clientId){
    var row=arr(S().task_collections).find(function(r){return String(r.id)===String(id);});if(!row)return;
    var run=async function(){
      S().task_collections=arr(S().task_collections).filter(function(r){return String(r.id)!==String(id);});
      var tx=txForCollection(row),inv=linkedInvoice(row.task_id);
      if(tx&&inv&&arr(tx.allocations).length){
        setAllocatedAmount(tx,inv.id,Math.max(0,num((arr(tx.allocations).find(function(a){return String(a.invoice_id||a.invoiceId||'')===String(inv.id);})||{}).amount)-num(row.amount)));
        if(num(tx.amount)<=0)S().transactions=arr(S().transactions).filter(function(item){return String(item.id)!==String(tx.id);});
      }else if(tx)S().transactions=arr(S().transactions).filter(function(item){return String(item.id)!==String(tx.id);});
      var task=findTask(row);if(task){task.paymentCollected=false;task.paid=false;task.pay='none';task.paymentStatus='pending';task.paidAmount=0;task.amountPaid=0;task.collectedAt=null;task.collectedAtIso=null;}
      if(inv&&root.OrdoPaymentReconciliation)root.OrdoPaymentReconciliation.reconcileInvoice(S(),inv);
      await persist(clientId);if(root.toast)root.toast('تم حذف العملية وتحديث الفاتورة والتاسك');
    };
    if(typeof root.confirmDel==='function')root.confirmDel('حذف عملية التحصيل؟ سيتم تحديث حالة التاسك والفاتورة المرتبطة.',run);
    else if(root.confirm('حذف عملية التحصيل؟'))run();
  }
  function editTransaction(id,clientId){
    var tx=arr(S().transactions).find(function(row){return String(row.id)===String(id);});if(!tx)return;
    var old=document.getElementById('modal-edit-client-transaction');if(old)old.remove();
    var ov=document.createElement('div');ov.className='modal-overlay';ov.id='modal-edit-client-transaction';ov.style.display='flex';
    ov.innerHTML='<div class="modal" style="max-width:470px"><div class="modal-header"><div class="modal-title"><i class="fa-solid fa-pen"></i> تعديل العملية المالية</div><button class="close-btn" onclick="this.closest(\'.modal-overlay\').remove()"><i class="fa-solid fa-xmark"></i></button></div><div class="form-group"><label>المبلغ</label><input id="ft-edit-amount" type="number" min="0" step="0.01" value="'+esc(tx.amount)+'"></div><div class="form-group"><label>التاريخ</label><input id="ft-edit-date" type="date" value="'+esc(String(tx.isoDate||tx.date||'').slice(0,10))+'"></div><div class="form-group"><label>الوصف</label><input id="ft-edit-desc" value="'+esc(tx.desc||'')+'"></div><div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-ghost" onclick="this.closest(\'.modal-overlay\').remove()">إلغاء</button><button class="btn btn-primary" onclick="OrdoClientFinanceFix.saveTransaction('+jsArg(String(id))+','+jsArg(clientId)+')"><i class="fa-solid fa-floppy-disk"></i> حفظ</button></div></div>';
    document.body.appendChild(ov);
  }
  async function saveTransaction(id,clientId){
    var tx=arr(S().transactions).find(function(row){return String(row.id)===String(id);});if(!tx)return;
    var amount=Math.max(0,num(document.getElementById('ft-edit-amount')&&document.getElementById('ft-edit-amount').value));
    if(!amount){if(root.toast)root.toast('أدخل مبلغاً صحيحاً');return;}
    var previous=num(tx.amount),date=(document.getElementById('ft-edit-date')&&document.getElementById('ft-edit-date').value)||new Date().toISOString().slice(0,10),desc=(document.getElementById('ft-edit-desc')&&document.getElementById('ft-edit-desc').value||'').trim();
    tx.amount=amount;tx.isoDate=date;tx.date=date;if(desc)tx.desc=desc;
    if(arr(tx.allocations).length&&previous>0){var ratio=amount/previous;tx.allocations=tx.allocations.map(function(a){return Object.assign({},a,{amount:num(a.amount)*ratio});});}
    var modal=document.getElementById('modal-edit-client-transaction');if(modal)modal.remove();await persist(clientId);if(root.toast)root.toast('تم تعديل العملية المالية وتحديث الحساب');
  }
  function deleteTransaction(id,clientId){
    var tx=arr(S().transactions).find(function(row){return String(row.id)===String(id);});if(!tx)return;
    var run=async function(){S().transactions=arr(S().transactions).filter(function(row){return String(row.id)!==String(id);});await persist(clientId);if(root.toast)root.toast('تم حذف العملية المالية وتحديث الحساب');};
    if(typeof root.confirmDel==='function')root.confirmDel('حذف العملية المالية؟ سيتم تحديث الفواتير والتاسكات المرتبطة.',run);else if(root.confirm('حذف العملية المالية؟'))run();
  }

  var oldRender = root._renderProfileTab;
  if(typeof oldRender === 'function' && !root.__clientFinanceFixInstalled){
    root.__clientFinanceFixInstalled = true;
    root._renderProfileTab = function(tab, id){
      if(tab === 'accounts' && renderAccounts(id)) return;
      return oldRender.apply(this, arguments);
    };
  }

  root.OrdoClientFinanceFix = {renderAccounts:renderAccounts,editCollection:editCollection,saveCollection:saveCollection,deleteCollection:deleteCollection,editTransaction:editTransaction,saveTransaction:saveTransaction,deleteTransaction:deleteTransaction, summary:function(id){ var b=clientBundle(id); return b ? summary(b) : {}; }};
})(window);
