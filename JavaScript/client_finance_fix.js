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
  function invTotal(i){ return num(i && (i.total || i.amount || i.value)); }
  function invPaid(i){
    var st = String((i && i.status) || '').toLowerCase();
    return !!(i && (i.paid || st === 'paid' || st === 'مدفوعة' || st === 'مدفوع'));
  }
  function taskPaid(t){
    var pay = String((t && t.pay) || '').toLowerCase();
    var pst = String((t && t.paymentStatus) || '').toLowerCase();
    return !!(t && (t.paymentCollected || t.paid || pay === 'paid' || pay === 'collected' || pst === 'collected' || pst === 'paid'));
  }
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
    var tasks = arr(s.tasks).filter(match);
    var projectTasks = arr(s.project_tasks).filter(function(t){
      return match(t) || (t && projectIds[String(t.project_id || t.projectId || '')]);
    });
    var invoices = arr(s.invoices).filter(match).filter(function(i){ return !isProjectInvoice(i); });
    var transactions = arr(s.transactions).filter(function(t){ return match(t) && !t.isLoan; });
    return {client:c, names:names, ids:ids, projects:projects, tasks:tasks, projectTasks:projectTasks, invoices:invoices, transactions:transactions};
  }
  function taskUnpaidAmount(t){
    var value = num(t.value || t.amount || t.price || t.total || t.clientAmount || t.clientPrice);
    var deposit = num(t.deposit || t.depositAmount || t.paidAmount || t.amountPaid || t.collectedAmount);
    if(taskPaid(t)) return 0;
    return Math.max(0, value - deposit);
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
      byCurrency[code] = byCurrency[code] || {code:code, invoiced:0, paid:0, unpaidInvoices:0, unpaidTasks:0, income:0, expense:0, openingDue:0, openingPrepaid:0};
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
      if(invoicedTaskIds[String(t.id)]) return;
      add(cur(t), 'unpaidTasks', taskUnpaidAmount(t));
    });
    bundle.transactions.forEach(function(t){
      if(t.type === 'expense') add(cur(t), 'expense', Math.abs(num(t.amount)));
      else add(cur(t), 'income', Math.abs(num(t.amount)));
    });
    Object.keys(byCurrency).forEach(function(code){
      var b = byCurrency[code];
      b.netDue = b.openingDue + b.unpaidInvoices + b.unpaidTasks - b.openingPrepaid;
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
      if(invoicedTaskIds[String(t.id)]) return;
      var due = taskUnpaidAmount(t);
      if(due > 0) rows.push({date:taskDate(t), type:'مهمة غير مدفوعة', desc:t.title || '-', amount:due, code:cur(t)});
    });
    bundle.transactions.forEach(function(t){
      rows.push({date:txDate(t), type:t.type === 'expense' ? 'مصروف' : 'تحصيل', desc:t.desc || t.source || t.expCat || '-', amount:t.type === 'expense' ? -Math.abs(num(t.amount)) : Math.abs(num(t.amount)), code:cur(t)});
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
      rows.push({
        key:String(r.source_type || '') + ':' + String(r.task_id || '') + ':' + String(r.collectedAt || r.collectedAtIso || ''),
        date:String(r.collectedAt || r.collectedAtIso || r.createdAt || '').slice(0,10),
        type:r.source_type === 'project_task' ? 'مشروع' : 'فردي',
        desc:r.task_title || r.title || '-',
        project:r.project_name || '',
        amount:num(r.amount),
        code:r.currency || 'EGP'
      });
    });
    function addFallback(t, type, projectName){
      if(!taskPaid(t)) return;
      var key = type + ':' + String(t.id || '') + ':' + String(t.collectedAt || t.collectedAtIso || '');
      if(rows.some(function(r){ return r.key === key; })) return;
      rows.push({
        key:key,
        date:String(t.collectedAt || t.collectedAtIso || t.paidAt || '').slice(0,10) || taskDate(t),
        type:type === 'project_task' ? 'مشروع' : 'فردي',
        desc:t.title || '-',
        project:projectName || '',
        amount:taskValue(t),
        code:cur(t)
      });
    }
    bundle.tasks.forEach(function(t){ addFallback(t, 'task', ''); });
    bundle.projectTasks.forEach(function(t){
      var p = bundle.projects.find(function(pr){ return String(pr.id) === String(t.project_id || t.projectId || ''); });
      addFallback(t, 'project_task', p && p.name);
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
      (collectedRows.length ? '<table class="fv3-table" style="margin-bottom:16px"><thead><tr><th>التاريخ</th><th>النوع</th><th>التاسك</th><th>المشروع</th><th>المبلغ</th></tr></thead><tbody>'+
        collectedRows.map(function(r){
          return '<tr><td>'+esc(r.date||'-')+'</td><td><span class="fv3-pill">'+esc(r.type)+'</span></td><td>'+esc(r.desc)+'</td><td>'+esc(r.project||'-')+'</td><td style="font-weight:900;color:var(--accent3)">'+fmt(r.amount,r.code)+'</td></tr>';
        }).join('')+'</tbody></table>' : '<div class="empty" style="padding:18px;margin-bottom:16px">لا توجد تاسكات محصلة بعد</div>')+
      '<div class="section-title" style="margin-bottom:10px"><i class="fa-solid fa-list-timeline"></i> سجل الحساب</div>'+
      (rows.length ? '<table class="fv3-table"><thead><tr><th>التاريخ</th><th>النوع</th><th>الوصف</th><th>المبلغ</th></tr></thead><tbody>'+
        rows.map(function(r){
          return '<tr><td>'+esc(r.date||'-')+'</td><td><span class="fv3-pill">'+esc(r.type)+'</span></td><td>'+esc(r.desc)+'</td><td style="font-weight:900;color:'+(num(r.amount)<0?'var(--accent3)':'var(--accent4)')+'">'+fmt(r.amount,r.code)+'</td></tr>';
        }).join('')+'</tbody></table>' : '<div class="empty" style="padding:24px">لا توجد حركات أو مستحقات مسجلة</div>');
    return true;
  }
  function card(label, value, color, icon){
    return '<div class="card" style="padding:12px;text-align:center;border-right:2px solid '+color+'"><div style="font-size:18px;font-weight:900;color:'+color+'">'+value+'</div><div style="font-size:10px;color:var(--text3);margin-top:3px"><i class="fa-solid '+icon+'"></i> '+label+'</div></div>';
  }

  var oldRender = root._renderProfileTab;
  if(typeof oldRender === 'function' && !root.__clientFinanceFixInstalled){
    root.__clientFinanceFixInstalled = true;
    root._renderProfileTab = function(tab, id){
      if(tab === 'accounts' && renderAccounts(id)) return;
      return oldRender.apply(this, arguments);
    };
  }

  root.OrdoClientFinanceFix = {renderAccounts:renderAccounts, summary:function(id){ var b=clientBundle(id); return b ? summary(b) : {}; }};
})(window);
