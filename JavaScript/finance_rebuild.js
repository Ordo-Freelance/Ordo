(function(root){
  'use strict';

  var TAB = 'dashboard';
  var charts = {flow:null, split:null};
  var TYPES = {
    cash:   {label:'كاش', icon:'fa-money-bill-wave', color:'#2f80ed'},
    bank:   {label:'بنك', icon:'fa-building-columns', color:'#27ae60'},
    wallet: {label:'محفظة إلكترونية', icon:'fa-wallet', color:'#9b51e0'},
    card:   {label:'كارت', icon:'fa-credit-card', color:'#f2994a'},
    other:  {label:'أخرى', icon:'fa-circle-nodes', color:'#5d6d7e'}
  };

  function state(){ return root.S || {}; }
  function list(v){ return Array.isArray(v) ? v : []; }
  function num(v){ v = Number(v); return isFinite(v) ? v : 0; }
  function id(){ return 'fa_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,7); }
  function esc(v){
    return String(v == null ? '' : v).replace(/[&<>"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function fmt(v, code){
    code = code || 'EGP';
    try {
      return new Intl.NumberFormat('ar-EG',{style:'currency',currency:code,maximumFractionDigits:0}).format(num(v));
    } catch(e) {
      return Math.round(num(v)).toLocaleString('ar-EG') + ' ' + code;
    }
  }
  function fmtMulti(map, key){
    var rows = Object.keys(map || {}).filter(function(code){ return num(map[code] && map[code][key]) !== 0; });
    if(!rows.length) return fmt(0,'EGP');
    return '<span class="fv3-money-list">'+rows.sort().map(function(code){
      return '<span>'+fmt(map[code][key], code)+'</span>';
    }).join('')+'</span>';
  }
  function pct(v){ return (isFinite(v) ? v : 0).toLocaleString('ar-EG',{maximumFractionDigits:1}) + '%'; }
  function save(){
    try { if(typeof root.lsSave === 'function') root.lsSave(); } catch(e){}
    try { if(typeof root.cloudSave === 'function') root.cloudSave(state()); } catch(e){}
  }
  function txDate(tx){ return String(tx && (tx.isoDate || tx.date || '') || '').slice(0,10); }
  function txAmount(tx){ return Math.abs(num(tx && tx.amount)); }
  function currency(tx, account){
    return (tx && (tx.currency_code || tx.currency)) || (account && account.currency_code) || 'EGP';
  }
  function todayKey(){
    try { return new Date().toLocaleDateString('en-CA'); } catch(e){ return new Date().toISOString().slice(0,10); }
  }
  function txs(){
    return list(state().transactions).filter(function(t){ return t && !t.isLoan; });
  }
  function allLoans(){ return list(state().loans); }
  function taskCurrency(task){ return (task && (task.currency_code || task.currency)) || 'EGP'; }
  function isCollected(item){
    return !!(item && (item.paymentCollected || item.paymentStatus === 'collected' || item.pay === 'paid' || item.paid || item.status === 'paid' || item.status === 'مدفوعة'));
  }
  function taskPendingAmount(t){
    var value = num(t && (t.value || t.amount || t.price || t.total || t.clientAmount || t.clientPrice));
    if(value <= 0 || isCollected(t)) return 0;
    return Math.max(0, value - num(t && (t.deposit || t.depositAmount || t.paidAmount || t.amountPaid || t.collectedAmount)));
  }
  function clientNameById(clientId){
    var c = list(state().clients).find(function(x){ return String(x.id) === String(clientId); });
    return c ? c.name : '';
  }
  function clientByName(name){
    return list(state().clients).find(function(c){ return c && (String(c.name) === String(name) || String(c.id) === String(name)); }) || null;
  }
  function clientPhone(name){
    var c = clientByName(name);
    return c ? (c.phone || c.client_phone || c.clientPhone || '') : '';
  }
  function projectById(projectId){
    return list(state().projects).find(function(p){ return String(p.id) === String(projectId); }) || null;
  }
  function isProjectInvoice(inv){
    return !!(inv && (inv.project_id || inv.projectId || list(inv.items).some(function(it){
      return it && (it.section === 'projects' || it._projectTaskId || it.project_id || it.projectId);
    })));
  }
  function callApp(fnName, args){
    args = args || [];
    if(typeof root[fnName] === 'function') return root[fnName].apply(root, args);
    try {
      root.__ordoCallArgs = args;
      return Function('return (typeof '+fnName+'==="function") ? '+fnName+'.apply(window, window.__ordoCallArgs||[]) : undefined')();
    } finally {
      try { delete root.__ordoCallArgs; } catch(e){ root.__ordoCallArgs = null; }
    }
  }
  function hasAppFn(fnName){
    if(typeof root[fnName] === 'function') return true;
    try { return !!Function('return typeof '+fnName+'==="function"')(); } catch(e){ return false; }
  }
  function receivableItems(){
    var items = [];
    list(state().tasks).forEach(function(t){
      if(!t || t.status === 'cancelled') return;
      var done = !!(t.done || t.status === 'done');
      var amount = taskPendingAmount(t);
      if(!done || amount <= 0) return;
      items.push({
        kind:'task',
        id:t.id,
        title:t.title || 'مهمة مكتملة',
        client:t.client || clientNameById(t.clientId) || 'عميل غير محدد',
        amount:amount,
        code:taskCurrency(t),
        date:t.doneAt || t.completedAt || t.deadline || '',
        action:'window.openIncomeModal&&window.openIncomeModal('+JSON.stringify(t.id)+')',
        viewAction:'window.openTaskDetail&&window.openTaskDetail('+JSON.stringify(t.id)+')',
        invoiceItem:{_taskId:t.id, desc:t.title || 'مهمة مكتملة', qty:1, price:amount}
      });
    });
    list(state().project_tasks).forEach(function(t){
      if(!t || t.status === 'cancelled') return;
      var done = t.status === 'done' || t.done || t.clientReceived;
      var amount = taskPendingAmount(t);
      if(!done || amount <= 0) return;
      var proj = projectById(t.project_id);
      items.push({
        kind:'project_task',
        id:t.id,
        projectId:t.project_id,
        title:t.title || 'مهمة مشروع مكتملة',
        client:(proj && (proj.client || proj.clientName || proj.name)) || t.client || 'عميل غير محدد',
        amount:amount,
        code:t.currency_code || t.currency || (proj && (proj.budgetCurrency || proj.currency_code || proj.currency)) || 'EGP',
        date:t.doneAt || t.completedAt || t.deadline || '',
        action:'window._askPtaskPayment&&window._askPtaskPayment('+JSON.stringify(String(t.id))+','+JSON.stringify(String(t.project_id || ''))+')',
        viewAction:'window.openProjTaskDetail&&window.openProjTaskDetail('+JSON.stringify(String(t.id))+','+JSON.stringify(String(t.project_id || ''))+')',
        invoiceItem:{_projectTaskId:t.id, project_id:t.project_id, section:'projects', projectName:(proj && proj.name) || '', projectBudget:num(proj && proj.budget), desc:(proj && proj.name ? proj.name + ' - ' : '') + (t.title || 'مهمة مشروع مكتملة'), qty:1, price:amount}
      });
    });
    list(state().invoices).forEach(function(inv){
      if(!inv || isCollected(inv)) return;
      var amount = num(inv.total) - num(inv.paidAmount || inv.collectedAmount);
      if(amount <= 0) return;
      items.push({
        kind:'invoice',
        id:inv.id,
        title:'فاتورة '+(inv.num || inv.invoiceNo || inv.id || ''),
        client:inv.client || clientNameById(inv.clientId) || 'عميل غير محدد',
        amount:amount,
        code:inv.currency_code || inv.currency || 'EGP',
        date:inv.due || inv.dueDate || inv.date || '',
        action:'window.previewInv&&window.previewInv('+JSON.stringify(inv.id)+')',
        viewAction:'window.previewInv&&window.previewInv('+JSON.stringify(inv.id)+')'
      });
    });
    list(state().clients).forEach(function(c){
      if(!c) return;
      var amount = num(c.openingBalance);
      if(amount <= 0 || (c.openingBalanceType && c.openingBalanceType !== 'receivable')) return;
      items.push({
        kind:'client_balance',
        id:c.id,
        title:'رصيد مستحق سابق',
        client:c.name || 'عميل غير محدد',
        amount:amount,
        code:c.currency_code || c.currency || 'EGP',
        date:'',
        action:'window.openClientProfile&&window.openClientProfile('+JSON.stringify(c.id)+')',
        viewAction:'window.openClientProfile&&window.openClientProfile('+JSON.stringify(c.id)+')',
        invoiceItem:{desc:'رصيد مستحق سابق', qty:1, price:amount}
      });
    });
    return items.sort(function(a,b){ return num(b.amount)-num(a.amount); });
  }
  function receivablesByCurrency(items){
    var map = {};
    (items || receivableItems()).forEach(function(item){
      var code = item.code || 'EGP';
      map[code] = (map[code] || 0) + num(item.amount);
    });
    return map;
  }
  function activeTaskReceivables(){
    return receivablesByCurrency(receivableItems().filter(function(item){ return item.kind === 'task' || item.kind === 'project_task'; }));
  }
  function currencyMeta(code){
    code = code || 'EGP';
    try {
      if(root.OrdoData && typeof root.OrdoData.getCurrencyMeta === 'function') return root.OrdoData.getCurrencyMeta(code);
    } catch(e){}
    var defs = [
      {code:'EGP', symbol:'ج.م', label:'جنيه مصري'},
      {code:'USD', symbol:'$', label:'دولار أمريكي'},
      {code:'EUR', symbol:'€', label:'يورو'},
      {code:'SAR', symbol:'ر.س', label:'ريال سعودي'},
      {code:'AED', symbol:'د.إ', label:'درهم إماراتي'}
    ];
    return defs.find(function(c){ return c.code === code || c.symbol === code; }) || {code:code, symbol:code, label:code};
  }
  function ensureCurrencyWallets(){
    var s = state();
    s.wallets = Array.isArray(s.wallets) ? s.wallets : [];
    s.wallets.forEach(function(w){
      var meta = currencyMeta(w.currency_code || w.currency || w.currency_symbol);
      w.currency_code = meta.code;
      w.currency_symbol = meta.symbol;
      w.currency_label = w.currency_label || meta.label;
    });
    return s.wallets;
  }
  function walletSummary(code){
    code = currencyMeta(code).code;
    var rows = txs().filter(function(t){ return currency(t) === code; });
    var income = 0, expense = 0, last = null;
    rows.forEach(function(t){
      if(t.type === 'expense') expense += txAmount(t);
      else income += txAmount(t);
      if(!last || String(txDate(t)).localeCompare(String(txDate(last))) > 0) last = t;
    });
    var transferRows = list(state().wallet_transfers);
    var transferIn = 0, transferOut = 0;
    transferRows.forEach(function(tr){
      if(tr.to_currency === code) transferIn += num(tr.to_amount);
      if(tr.from_currency === code) transferOut += num(tr.from_amount);
    });
    var receivables = activeTaskReceivables()[code] || 0;
    return {income:income + transferIn, expense:expense + transferOut, balance:income + transferIn - expense - transferOut, receivables:receivables, last:last};
  }
  function methodAccountType(method){
    method = String(method || '').toLowerCase();
    if(method.indexOf('bank') > -1 || method.indexOf('instapay') > -1 || method.indexOf('انستا') > -1) return 'bank';
    if(method.indexOf('vodafone') > -1 || method.indexOf('etisalat') > -1 || method.indexOf('wallet') > -1 || method.indexOf('cash_wallet') > -1) return 'wallet';
    return 'cash';
  }
  function ensureAccounts(){
    var s = state();
    if(!Array.isArray(s.finance_accounts)) s.finance_accounts = [];
    var accounts = s.finance_accounts;
    var changed = false;

    function hasType(type){ return accounts.some(function(a){ return a && a.type === type && a.active !== false; }); }
    function add(name,type,color){
      accounts.push({
        id:id(), name:name, type:type, currency_code:'EGP',
        opening_balance:0, color:color || TYPES[type].color,
        active:true, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString()
      });
      changed = true;
    }
    if(!hasType('cash')) add('كاش', 'cash', TYPES.cash.color);
    if(!hasType('bank')) add('حساب بنكي', 'bank', TYPES.bank.color);
    if(!hasType('wallet')) add('محفظة إلكترونية', 'wallet', TYPES.wallet.color);

    accounts.forEach(function(a){
      if(!a.id){ a.id = id(); changed = true; }
      if(!a.name){ a.name = TYPES[a.type || 'other'].label; changed = true; }
      if(!a.type || !TYPES[a.type]){ a.type = 'other'; changed = true; }
      if(!a.currency_code){ a.currency_code = 'EGP'; changed = true; }
      if(a.opening_balance == null){ a.opening_balance = 0; changed = true; }
      if(!a.color){ a.color = TYPES[a.type].color; changed = true; }
      if(a.active == null){ a.active = true; changed = true; }
    });

    var byType = {};
    accounts.forEach(function(a){
      if(a && a.active !== false && !byType[a.type]) byType[a.type] = a;
    });
    txs().forEach(function(t){
      if(t.account_id && accounts.some(function(a){ return String(a.id) === String(t.account_id); })) return;
      var a = byType[methodAccountType(t.payMethod)] || byType.cash || accounts[0];
      if(a){ t.account_id = a.id; changed = true; }
    });
    if(changed) save();
    return accounts;
  }
  function accounts(activeOnly){
    var a = ensureAccounts();
    return activeOnly ? a.filter(function(x){ return x && x.active !== false; }) : a;
  }
  function accountById(accountId){
    return accounts(false).find(function(a){ return String(a.id) === String(accountId); }) || accounts(true)[0] || null;
  }
  function balance(account, allTxs){
    var total = num(account.opening_balance);
    list(allTxs).forEach(function(t){
      if(String(t.account_id || '') !== String(account.id)) return;
      total += t.type === 'expense' ? -txAmount(t) : txAmount(t);
    });
    return total;
  }
  function totals(allTxs){
    var income = 0, expense = 0, profitExpense = 0;
    allTxs.forEach(function(t){
      if(t.type === 'expense'){
        expense += txAmount(t);
        if(isProfitExpense(t)) profitExpense += txAmount(t);
      }
      else income += txAmount(t);
    });
    var accTotal = accounts(true).reduce(function(sum,a){ return sum + balance(a, allTxs); }, 0);
    return {income:income, expense:expense, profitExpense:profitExpense, net:income-profitExpense, accounts:accTotal};
  }
  function totalsByCurrency(allTxs){
    var out = {};
    function row(code){
      code = currencyMeta(code).code;
      return out[code] || (out[code] = {income:0, expense:0, profitExpense:0, net:0, accounts:0});
    }
    allTxs.forEach(function(t){
      var acc = t.account_id ? accountById(t.account_id) : null;
      var code = currency(t, acc);
      var r = row(code);
      if(t.type === 'expense'){
        r.expense += txAmount(t);
        if(isProfitExpense(t)) r.profitExpense += txAmount(t);
      }
      else r.income += txAmount(t);
      r.net = r.income - r.profitExpense;
    });
    accounts(true).forEach(function(a){
      var r = row(a.currency_code || 'EGP');
      r.accounts += balance(a, allTxs);
    });
    return out;
  }
  function monthKey(d){ return String(d || '').slice(0,7); }
  function currentMonthTxs(){
    var key = new Date().toISOString().slice(0,7);
    return txs().filter(function(t){ return monthKey(txDate(t)) === key; });
  }
  function isPersonalExpense(t){
    if(!t || t.type !== 'expense') return false;
    if(t.expImpact === 'personal') return true;
    var hay = [t.expCat, t.source, t.desc].filter(Boolean).join(' ');
    return /سحب\s*شخصي|مصاريف\s*تعليمية\s*شخصية|شخصي/.test(hay);
  }
  function isProfitExpense(t){
    return t && t.type === 'expense' && t.expCat !== 'سلفة للغير' && !isPersonalExpense(t);
  }
  function marginPct(row){
    return row && row.income ? ((row.net / row.income) * 100) : 0;
  }
  function fmtMarginMulti(rows){
    var keys = Object.keys(rows || {});
    if(!keys.length) return '—';
    return keys.map(function(k){ return currencyMeta(k).code + ' ' + pct(marginPct(rows[k])); }).join(' · ');
  }
  function lastMonths(n){
    var out = [];
    var d = new Date();
    d.setDate(1);
    for(var i=n-1;i>=0;i--){
      var x = new Date(d.getFullYear(), d.getMonth()-i, 1);
      out.push(x.toISOString().slice(0,7));
    }
    return out;
  }
  function catTotals(allTxs){
    var m = {};
    allTxs.forEach(function(t){
      if(t.type !== 'expense') return;
      var acc = t.account_id ? accountById(t.account_id) : null;
      var code = currency(t, acc);
      var name = t.expCat || t.source || 'أخرى';
      var k = name + '|' + code;
      if(!m[k]) m[k] = {name:name, code:code, value:0};
      m[k].value += txAmount(t);
    });
    return Object.keys(m).map(function(k){ return m[k]; }).sort(function(a,b){ return b.value-a.value; });
  }
  function accountOptions(selected){
    return accounts(true).map(function(a){
      return '<option value="'+esc(a.id)+'" '+(String(selected||'')===String(a.id)?'selected':'')+'>'+esc(a.name)+' - '+esc(TYPES[a.type].label)+'</option>';
    }).join('');
  }
  function ensureCurrencyOption(select, code){
    if(!select || !code) return;
    var meta = currencyMeta(code);
    var exists = Array.prototype.slice.call(select.options || []).some(function(o){ return o.value === meta.code; });
    if(!exists){
      var opt = document.createElement('option');
      opt.value = meta.code;
      opt.textContent = meta.label + ' (' + meta.symbol + ')';
      select.appendChild(opt);
    }
  }
  function syncCurrencyWithAccount(type, accountId){
    var acc = accountById(accountId);
    if(!acc) return;
    var select = document.getElementById(type === 'income' ? 'in-currency' : 'ex-currency');
    if(!select) return;
    ensureCurrencyOption(select, acc.currency_code || 'EGP');
    select.value = currencyMeta(acc.currency_code || 'EGP').code;
    try { select.dispatchEvent(new Event('change', {bubbles:true})); } catch(e){}
  }

  function injectStyle(){
    if(document.getElementById('finance-rebuild-style')) return;
    var style = document.createElement('style');
    style.id = 'finance-rebuild-style';
    style.textContent = [
      '.ordo-finance-v3{padding:20px;background:var(--bg);color:var(--text);direction:rtl}',
      '.fv3-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px}',
      '.fv3-title h1{margin:0 0 6px;font-size:28px;font-weight:900;letter-spacing:0}',
      '.fv3-title p{margin:0;color:var(--text3);font-size:13px}',
      '.fv3-actions{display:flex;gap:8px;flex-wrap:wrap}',
      '.fv3-tabs{display:flex;gap:8px;flex-wrap:wrap;border-bottom:1px solid var(--border);margin-bottom:18px}',
      '.fv3-tab{border:0;background:transparent;color:var(--text2);padding:12px 14px;cursor:pointer;font-weight:800;border-bottom:3px solid transparent}',
      '.fv3-tab.active{color:var(--accent);border-bottom-color:var(--accent)}',
      '.fv3-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}',
      '.fv3-kpi,.fv3-panel,.fv3-account,.fv3-ratio{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px;box-shadow:var(--shadow-sm)}',
      '.fv3-kpi span,.fv3-muted{display:block;color:var(--text3);font-size:12px;font-weight:700;margin-bottom:6px}',
      '.fv3-kpi strong{display:block;font-size:22px;font-weight:900}',
      '.fv3-money-list{display:flex;flex-direction:column;gap:4px;align-items:flex-start;direction:ltr;text-align:left}',
      '.fv3-money-list span{font-size:18px;line-height:1.25;white-space:nowrap}',
      '.fv3-kpi small{display:block;color:var(--text3);font-size:11px;margin-top:6px}',
      '.fv3-collect-alert{display:flex;align-items:center;justify-content:space-between;gap:12px;background:rgba(235,87,87,.10);border:1px solid rgba(235,87,87,.35);border-radius:8px;padding:10px 12px;margin:-4px 0 14px;color:var(--text)}',
      '.fv3-collect-alert-main{display:flex;align-items:center;gap:10px;min-width:0}',
      '.fv3-collect-icon{width:34px;height:34px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;background:rgba(235,87,87,.16);color:#eb5757;font-size:15px;flex-shrink:0}',
      '.fv3-collect-alert h2{margin:0;font-size:13px;font-weight:900;color:#eb5757}',
      '.fv3-collect-alert p{margin:2px 0 0;color:var(--text3);font-size:11px;line-height:1.45}',
      '.fv3-collect-total{font-weight:900;color:#eb5757;white-space:nowrap;direction:ltr;text-align:left}',
      '.fv3-collect-total .fv3-money-list{display:inline-flex;flex-direction:row;gap:6px;align-items:center;vertical-align:middle}',
      '.fv3-collect-total .fv3-money-list span{font-size:12px;line-height:1}',
      '.fv3-collect-alert .btn{white-space:nowrap}',
      '.fv3-collect-close{width:28px;height:28px;border:0;border-radius:8px;background:rgba(235,87,87,.12);color:#eb5757;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0}',
      '.fv3-collect-actions{display:flex;align-items:center;gap:8px;flex-shrink:0}',
      '.fv3-recv-client{background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:10px}',
      '.fv3-recv-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}',
      '.fv3-recv-head-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap;justify-content:flex-end}',
      '.fv3-recv-head b{font-size:14px}.fv3-recv-total{font-weight:900;color:#eb5757;white-space:nowrap;direction:ltr}',
      '.fv3-recv-row{display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;padding:8px 0;border-top:1px solid var(--border)}',
      '.fv3-recv-row-main{min-width:0;cursor:pointer;border-radius:8px;padding:4px 6px;margin:-4px -6px;transition:background .15s,color .15s}',
      '.fv3-recv-row-main:hover{background:rgba(124,111,247,.10);color:var(--accent)}',
      '.fv3-recv-row small{display:block;color:var(--text3);font-size:11px;margin-top:2px}',
      '.fv3-recv-kind{font-size:10px;font-weight:800;color:var(--text3);background:var(--surface);border:1px solid var(--border);border-radius:999px;padding:3px 7px;white-space:nowrap}',
      '.fv3-row{display:grid;grid-template-columns:1.5fr 1fr;gap:14px;margin-bottom:16px}',
      '.fv3-section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}',
      '.fv3-section-head h2{font-size:16px;margin:0;font-weight:900}',
      '.fv3-accounts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}',
      '.fv3-account{position:relative;overflow:hidden}',
      '.fv3-account:before{content:"";position:absolute;inset-inline-start:0;top:0;bottom:0;width:4px;background:var(--acc,#2f80ed)}',
      '.fv3-account-top{display:flex;align-items:center;justify-content:space-between;gap:10px}',
      '.fv3-account-name{display:flex;align-items:center;gap:8px;font-weight:900}',
      '.fv3-icon{width:34px;height:34px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--acc,#2f80ed) 14%,transparent);color:var(--acc,#2f80ed)}',
      '.fv3-account-balance{font-size:21px;font-weight:900;margin-top:12px}',
      '.fv3-account-meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;color:var(--text3);font-size:12px}',
      '.fv3-pill{display:inline-flex;align-items:center;gap:6px;padding:5px 8px;border:1px solid var(--border);border-radius:999px;background:var(--surface2);font-size:12px;color:var(--text2);font-weight:700}',
      '.fv3-table{width:100%;border-collapse:collapse;font-size:13px}',
      '.fv3-table th,.fv3-table td{padding:10px;border-bottom:1px solid var(--border);text-align:right;vertical-align:middle}',
      '.fv3-table th{color:var(--text3);font-size:11px;font-weight:900;background:var(--surface2)}',
      '.fv3-amount-income{color:#27ae60;font-weight:900}.fv3-amount-expense{color:#eb5757;font-weight:900}',
      '.fv3-ratios{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}',
      '.fv3-ratio strong{display:block;font-size:20px;font-weight:900;margin-top:4px}',
      '.fv3-chart{height:280px;position:relative}',
      '.fv3-empty{padding:24px;text-align:center;color:var(--text3);border:1px dashed var(--border);border-radius:8px;background:var(--surface2)}',
      '.fv3-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px}',
      '.fv3-modal{width:min(560px,100%);background:var(--surface);border:1px solid var(--border);border-radius:10px;box-shadow:var(--shadow-lg);padding:16px}',
      '.fv3-modal-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}',
      '.fv3-modal-head h3{margin:0;font-size:18px;font-weight:900}',
      '.fv3-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}',
      '.fv3-field{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}',
      '.fv3-field label{font-size:12px;font-weight:800;color:var(--text3)}',
      '.fv3-field input,.fv3-field select{background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px;color:var(--text)}',
      '.fv3-mini-bars{display:flex;align-items:end;gap:8px;height:220px;padding-top:20px}',
      '.fv3-mini-bar{flex:1;min-height:8px;border-radius:6px 6px 0 0;background:#2f80ed;position:relative}',
      '.fv3-mini-bar.exp{background:#eb5757}',
      '@media(max-width:980px){.fv3-grid,.fv3-ratios{grid-template-columns:repeat(2,minmax(0,1fr))}.fv3-row{grid-template-columns:1fr}.fv3-collect-alert{align-items:flex-start;flex-wrap:wrap}.fv3-accounts{grid-template-columns:repeat(2,minmax(0,1fr))}}',
      '@media(max-width:640px){.ordo-finance-v3{padding:14px}.fv3-head{flex-direction:column}.fv3-grid,.fv3-ratios,.fv3-accounts,.fv3-form-grid{grid-template-columns:1fr}.fv3-title h1{font-size:22px}.fv3-table{font-size:12px}.fv3-table th:nth-child(4),.fv3-table td:nth-child(4){display:none}.fv3-recv-row{grid-template-columns:1fr}.fv3-recv-row>div:last-child{justify-content:space-between}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function kpi(title, value, hint, cls){
    return '<div class="fv3-kpi '+(cls||'')+'"><span>'+esc(title)+'</span><strong>'+value+'</strong><small>'+esc(hint||'')+'</small></div>';
  }
  function tabs(){
    var items = [
      ['dashboard','لوحة التحكم','fa-chart-line'],
      ['accounts','الحسابات والبنوك','fa-wallet'],
      ['currency-wallets','محافظ العملات','fa-coins'],
      ['loans','القروض','fa-handshake'],
      ['reports','التقارير والنسب','fa-chart-pie'],
      ['transactions','الحركات','fa-list']
    ];
    return '<div class="fv3-tabs">'+items.map(function(x){
      return '<button class="fv3-tab '+(TAB===x[0]?'active':'')+'" onclick="switchFinanceV3Tab(\''+x[0]+'\')"><i class="fa-solid '+x[2]+'"></i> '+x[1]+'</button>';
    }).join('')+'</div>';
  }
  function header(){
    return '<div class="fv3-head">'+
      '<div class="fv3-title"><h1>المالية</h1><p>حسابات وبنوك ومحافظ برصيد افتتاحي، تقارير مباشرة، ونسب أداء من نفس الحركات المسجلة.</p></div>'+
      '<div class="fv3-actions">'+
      '<button class="btn btn-success" onclick="financeV3Income()"><i class="fa-solid fa-plus"></i> دخل</button>'+
      '<button class="btn btn-danger" onclick="financeV3Expense()"><i class="fa-solid fa-minus"></i> مصروف</button>'+
      '<button class="btn btn-ghost" onclick="openLoanModal && openLoanModal()"><i class="fa-solid fa-handshake"></i> قرض</button>'+
      '<button class="btn btn-primary" onclick="openFinanceAccountModal()"><i class="fa-solid fa-building-columns"></i> حساب/بنك</button>'+
      '</div></div>';
  }
  function accountCard(a, allTxs){
    var type = TYPES[a.type] || TYPES.other;
    return '<div class="fv3-account" style="--acc:'+esc(a.color || type.color)+'">'+
      '<div class="fv3-account-top"><div class="fv3-account-name"><span class="fv3-icon"><i class="fa-solid '+esc(type.icon)+'"></i></span><span>'+esc(a.name)+'</span></div>'+
      '<button class="btn btn-ghost btn-sm" onclick="openFinanceAccountModal(\''+esc(a.id)+'\')"><i class="fa-solid fa-pen"></i></button></div>'+
      '<div class="fv3-account-balance">'+fmt(balance(a,allTxs), a.currency_code)+'</div>'+
      '<div class="fv3-account-meta"><span class="fv3-pill">'+esc(type.label)+'</span><span class="fv3-pill">افتتاحي: '+fmt(a.opening_balance,a.currency_code)+'</span><button class="btn btn-ghost btn-sm" onclick="openFinanceStatement(\'account\',\''+esc(a.id)+'\')">كشف حساب</button></div>'+
      '</div>';
  }
  function accountsSection(limit){
    var allTxs = txs();
    var accs = accounts(true);
    if(limit) accs = accs.slice(0,limit);
    return '<section class="fv3-panel"><div class="fv3-section-head"><h2>الحسابات والبنوك</h2><button class="btn btn-ghost btn-sm" onclick="openFinanceAccountModal()"><i class="fa-solid fa-plus"></i> إضافة</button></div>'+
      '<div class="fv3-accounts">'+accs.map(function(a){ return accountCard(a, allTxs); }).join('')+'</div></section>';
  }
  function ratiosHtml(allTxs, total){
    var byCur = totalsByCurrency(allTxs);
    var base = byCur.EGP || Object.keys(byCur).map(function(k){ return byCur[k]; })[0] || {income:0,expense:0,net:0};
    var margin = marginPct(base);
    var expenseRate = base.income ? (base.profitExpense / base.income) * 100 : 0;
    var monthByCur = totalsByCurrency(currentMonthTxs());
    var bestCat = catTotals(allTxs)[0];
    return '<div class="fv3-ratios">'+
      '<div class="fv3-ratio"><span class="fv3-muted">هامش الربح</span><strong>'+pct(margin)+'</strong><span class="fv3-muted">صافي الربح مقابل الدخل</span></div>'+
      '<div class="fv3-ratio"><span class="fv3-muted">نسبة مصروفات الشغل</span><strong>'+pct(expenseRate)+'</strong><span class="fv3-muted">بدون المصروف الشخصي</span></div>'+
      '<div class="fv3-ratio"><span class="fv3-muted">صافي الشهر الحالي</span><strong>'+fmtMulti(monthByCur,'net')+'</strong><span class="fv3-muted">دخل الشهر ناقص مصروفه حسب العملة</span></div>'+
      '<div class="fv3-ratio"><span class="fv3-muted">أكبر بند مصروف</span><strong>'+esc(bestCat ? bestCat.name : '-')+'</strong><span class="fv3-muted">'+(bestCat ? fmt(bestCat.value,bestCat.code || 'EGP') : 'لا يوجد')+'</span></div>'+
      '</div>';
  }
  function collectKindLabel(kind){
    return kind === 'project_task' ? 'مهمة مشروع' : kind === 'task' ? 'مهمة' : kind === 'invoice' ? 'فاتورة' : 'رصيد عميل';
  }
  function clientReceivableGroups(items){
    var groups = {};
    (items || receivableItems()).forEach(function(item){
      var key = item.client || 'عميل غير محدد';
      if(!groups[key]) groups[key] = {client:key, total:{}, items:[]};
      groups[key].items.push(item);
      groups[key].total[item.code || 'EGP'] = (groups[key].total[item.code || 'EGP'] || 0) + num(item.amount);
    });
    return Object.keys(groups).map(function(k){ return groups[k]; }).sort(function(a,b){
      var av = a.items.reduce(function(s,x){ return s + num(x.amount); }, 0);
      var bv = b.items.reduce(function(s,x){ return s + num(x.amount); }, 0);
      return bv - av;
    });
  }
  function totalsToMoneyHtml(totals){
    return fmtMulti(Object.keys(totals || {}).reduce(function(map, code){
      map[code] = {amount:totals[code]};
      return map;
    },{}), 'amount');
  }
  function totalsToText(totals){
    return Object.keys(totals || {}).filter(function(code){ return num(totals[code]) > 0; }).sort().map(function(code){
      return fmt(totals[code], code);
    }).join(' + ') || fmt(0,'EGP');
  }
  function collectionAlert(){
    var items = receivableItems();
    if(!items.length) return '';
    if(root.__financeReceivableAlertHidden && root.__financeReceivableAlertHiddenDay === todayKey()) return '';
    if(root.__financeReceivableAlertHiddenDay && root.__financeReceivableAlertHiddenDay !== todayKey()) root.__financeReceivableAlertHidden = false;
    var totals = receivablesByCurrency(items);
    var groups = clientReceivableGroups(items);
    var totalHtml = totalsToMoneyHtml(totals);
    return '<section class="fv3-collect-alert">'+
      '<div class="fv3-collect-alert-main">'+
        '<span class="fv3-collect-icon"><i class="fa-solid fa-triangle-exclamation"></i></span>'+
        '<div><h2>تنبيه تحصيل</h2>'+
          '<p>في '+groups.length+' عملاء عليهم مبالغ غير محصلة · الإجمالي <span class="fv3-collect-total">'+totalHtml+'</span></p></div>'+
      '</div>'+
      '<div class="fv3-collect-actions">'+
        '<button class="btn btn-danger btn-sm" onclick="openFinanceReceivablesModal()"><i class="fa-solid fa-chevron-left"></i> التفاصيل</button>'+
        '<button class="fv3-collect-close" onclick="dismissFinanceReceivableAlert()" title="إخفاء التنبيه مؤقتاً"><i class="fa-solid fa-xmark"></i></button>'+
      '</div>'+
    '</section>';
  }
  function dashboard(){
    var allTxs = txs();
    var total = totals(allTxs);
    var byCur = totalsByCurrency(allTxs);
    return '<div class="fv3-grid">'+
      kpi('إجمالي الرصيد', fmtMulti(byCur,'accounts'), 'الرصيد الافتتاحي + صافي الحركات حسب العملة')+
      kpi('إجمالي الدخل', fmtMulti(byCur,'income'), 'كل التحصيلات المسجلة حسب العملة')+
      kpi('إجمالي المصروفات', fmtMulti(byCur,'expense'), 'كل المصروفات المسجلة حسب العملة')+
      kpi('صافي الربح', fmtMarginMulti(byCur), 'هامش الربح كنسبة: الدخل ناقص مصروفات الشغل')+
      '</div>'+
      '<div class="fv3-row"><section class="fv3-panel"><div class="fv3-section-head"><h2>الدخل والمصروف آخر 6 شهور</h2></div><div class="fv3-chart"><canvas id="fv3-flow-chart"></canvas></div></section>'+
      '<section class="fv3-panel"><div class="fv3-section-head"><h2>توزيع الأرصدة</h2></div><div class="fv3-chart"><canvas id="fv3-split-chart"></canvas></div></section></div>'+
      '<div style="margin-bottom:16px">'+accountsSection(3)+'</div>'+
      '<section class="fv3-panel"><div class="fv3-section-head"><h2>النسب السريعة</h2><button class="btn btn-ghost btn-sm" onclick="switchFinanceV3Tab(\'reports\')">كل التقارير</button></div>'+ratiosHtml(allTxs,total)+'</section>';
  }
  function accountsPage(){
    return accountsSection(0);
  }
  function currencyWalletsPage(){
    var wallets = ensureCurrencyWallets();
    var receivables = activeTaskReceivables();
    return '<section class="fv3-panel"><div class="fv3-section-head"><h2>محافظ العملات</h2><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" onclick="openCurrencyWalletModal()"><i class="fa-solid fa-plus"></i> إنشاء محفظة</button><button class="btn btn-ghost btn-sm" onclick="openWalletTransferModal && openWalletTransferModal()"><i class="fa-solid fa-right-left"></i> تسوية / تحويل</button></div></div>'+
      (wallets.length ? '<div class="fv3-accounts">'+wallets.map(function(w){
        var meta = currencyMeta(w.currency_code);
        var s = walletSummary(meta.code);
        return '<div class="fv3-account" style="--acc:#7c6ff7">'+
          '<div class="fv3-account-top"><div class="fv3-account-name"><span class="fv3-icon"><i class="fa-solid fa-coins"></i></span><span>'+esc(w.currency_label || meta.label)+'</span></div><span class="fv3-pill">'+esc(meta.symbol)+'</span></div>'+
          '<div class="fv3-account-balance">'+fmt(s.balance, meta.code)+'</div>'+
          '<div class="fv3-account-meta"><span class="fv3-pill">داخل: '+fmt(s.income,meta.code)+'</span><span class="fv3-pill">خارج: '+fmt(s.expense,meta.code)+'</span><span class="fv3-pill">مستحق مهام: '+fmt(receivables[meta.code]||0,meta.code)+'</span><button class="btn btn-ghost btn-sm" onclick="openWalletBalanceAdjust(\''+esc(meta.code)+'\')">تعديل الرصيد</button><button class="btn btn-ghost btn-sm" onclick="openFinanceStatement(\'wallet\',\''+esc(meta.code)+'\')">كشف حساب</button><button class="btn btn-danger btn-sm" onclick="deleteCurrencyWallet(\''+esc(w.id || meta.code)+'\')"><i class="fa-solid fa-trash"></i></button></div>'+
          '</div>';
      }).join('')+'</div>' : '<div class="fv3-empty">لا توجد محافظ عملات منشأة. استخدم زر إنشاء محفظة أو أضفها من إعدادات الاستوديو.</div>')+
      '<div class="fv3-empty" style="margin-top:12px;text-align:right">ملاحظة: لا يتم إنشاء محفظة تلقائيا لمجرد وجود مهمة أو حركة بعملة. مستحقات المهام تظهر فقط داخل المحافظ المنشأة.</div>'+
      '</section>';
  }
  function loansPage(){
    var loans = allLoans();
    var active = loans.filter(function(l){ return l.status !== 'settled'; });
    var lent = active.filter(function(l){ return l.direction === 'lent'; }).reduce(function(s,l){ return s + num(l.amount) - num(l.settledAmount); }, 0);
    var borrowed = active.filter(function(l){ return l.direction === 'borrowed'; }).reduce(function(s,l){ return s + num(l.amount) - num(l.settledAmount); }, 0);
    return '<div class="fv3-grid">'+
      kpi('أنا مسلّف', fmt(lent,'EGP'), 'فلوس ليا عند الناس')+
      kpi('أنا مستلف', fmt(borrowed,'EGP'), 'فلوس عليا أرجعها')+
      kpi('قروض مفتوحة', String(active.length), 'غير مسددة بالكامل')+
      kpi('إجمالي القروض', String(loans.length), 'كل السجل')+
      '</div><section class="fv3-panel"><div class="fv3-section-head"><h2>القروض والسلف</h2><button class="btn btn-primary btn-sm" onclick="openLoanModal && openLoanModal()"><i class="fa-solid fa-plus"></i> قرض / دين جديد</button></div>'+
      (loans.length ? '<table class="fv3-table"><thead><tr><th>النوع</th><th>الشخص</th><th>المبلغ</th><th>المتبقي</th><th>الاستحقاق</th><th>الحالة</th><th></th></tr></thead><tbody>'+
        loans.slice().sort(function(a,b){ return String(b.updatedAt||b.date||'').localeCompare(String(a.updatedAt||a.date||'')); }).map(function(l){
          var isLent = l.direction === 'lent';
          var rem = Math.max(0, num(l.amount) - num(l.settledAmount));
          var code = l.currency_code || l.currency || 'EGP';
          return '<tr><td><span class="fv3-pill">'+(isLent?'أنا مسلّف':'أنا مستلف')+'</span></td><td>'+esc(l.person||'-')+'</td><td>'+fmt(l.amount,code)+'</td><td>'+fmt(rem,code)+'</td><td>'+esc(l.due||'-')+'</td><td>'+esc(l.status==='settled'?'مسدد':l.status==='partial'?'جزئي':'مفتوح')+'</td><td><button class="btn btn-ghost btn-sm" onclick="openLoanModal && openLoanModal(\''+esc(l.id)+'\')"><i class="fa-solid fa-pen"></i></button><button class="btn btn-ghost btn-sm" onclick="markLoanSettled && markLoanSettled(\''+esc(l.id)+'\')"><i class="fa-solid fa-check"></i></button><button class="btn btn-danger btn-sm" onclick="delLoan && delLoan(\''+esc(l.id)+'\')"><i class="fa-solid fa-trash"></i></button></td></tr>';
        }).join('')+'</tbody></table>' : '<div class="fv3-empty">لا توجد قروض مسجلة بعد.</div>')+
      '</section>';
  }
  function reportsPage(){
    var allTxs = txs(), total = totals(allTxs);
    return '<section class="fv3-panel" style="margin-bottom:16px"><div class="fv3-section-head"><h2>النسب والتقارير</h2></div>'+ratiosHtml(allTxs,total)+'</section>'+
      '<div class="fv3-row"><section class="fv3-panel"><div class="fv3-section-head"><h2>تحليل التدفق النقدي</h2></div><div class="fv3-chart"><canvas id="fv3-flow-chart"></canvas></div></section>'+
      '<section class="fv3-panel"><div class="fv3-section-head"><h2>مصروفات حسب الفئة</h2></div>'+expenseCategoryTable(allTxs)+'</section></div>';
  }
  function expenseCategoryTable(allTxs){
    var rows = catTotals(allTxs).slice(0,8);
    if(!rows.length) return '<div class="fv3-empty">لا توجد مصروفات مسجلة بعد.</div>';
    var total = rows.reduce(function(s,r){ return s + r.value; }, 0) || 1;
    return '<table class="fv3-table"><thead><tr><th>الفئة</th><th>المبلغ</th><th>النسبة</th></tr></thead><tbody>'+
      rows.map(function(r){ return '<tr><td>'+esc(r.name)+'</td><td class="fv3-amount-expense">'+fmt(r.value,r.code || 'EGP')+'</td><td>'+pct((r.value/total)*100)+'</td></tr>'; }).join('')+
      '</tbody></table>';
  }
  function transactionsPage(){
    var rows = txs().slice().sort(function(a,b){ return String(txDate(b)).localeCompare(String(txDate(a))) || num(b.id)-num(a.id); });
    if(!rows.length) return '<section class="fv3-panel"><div class="fv3-empty">لا توجد حركات مالية بعد.</div></section>';
    return '<section class="fv3-panel"><div class="fv3-section-head"><h2>كل الحركات</h2><span class="fv3-muted">'+rows.length+' حركة</span></div>'+
      '<table class="fv3-table"><thead><tr><th>التاريخ</th><th>النوع</th><th>الوصف</th><th>الحساب</th><th>المبلغ</th><th></th></tr></thead><tbody>'+
      rows.map(function(t){
        var a = accountById(t.account_id);
        var isExpense = t.type === 'expense';
        return '<tr><td>'+esc(txDate(t) || '-')+'</td><td><span class="fv3-pill">'+(isExpense?'مصروف':'دخل')+'</span></td><td>'+esc(t.desc || t.source || t.expCat || '-').slice(0,90)+'</td><td>'+esc(a ? a.name : '-')+'</td><td class="'+(isExpense?'fv3-amount-expense':'fv3-amount-income')+'">'+(isExpense?'- ':'+ ')+fmt(txAmount(t),currency(t,a))+'</td><td><button class="btn btn-ghost btn-sm" onclick="'+(isExpense?'openExpenseModal':'openIncomeModal')+'(\''+esc(t.id)+'\')"><i class="fa-solid fa-pen"></i></button><button class="btn btn-danger btn-sm" onclick="deleteFinanceTransaction(\''+esc(t.id)+'\')"><i class="fa-solid fa-trash"></i></button></td></tr>';
      }).join('')+'</tbody></table></section>';
  }
  function openReceivablesModal(){
    var old = document.getElementById('finance-receivables-modal');
    if(old) old.remove();
    var items = receivableItems();
    var groups = clientReceivableGroups(items);
    var totals = receivablesByCurrency(items);
    var overlay = document.createElement('div');
    overlay.className = 'fv3-modal-backdrop';
    overlay.id = 'finance-receivables-modal';
    overlay.innerHTML = '<div class="fv3-modal" style="width:min(760px,100%);max-height:86vh;overflow:auto">'+
      '<div class="fv3-modal-head"><h3><i class="fa-solid fa-triangle-exclamation" style="color:#eb5757"></i> مبالغ غير محصلة</h3><button class="close-btn" onclick="document.getElementById(&quot;finance-receivables-modal&quot;)?.remove()"><i class="fa-solid fa-xmark"></i></button></div>'+
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;background:rgba(235,87,87,.10);border:1px solid rgba(235,87,87,.30);border-radius:8px;padding:10px 12px;margin-bottom:12px">'+
        '<div><b style="color:#eb5757">'+groups.length+' عملاء</b><div style="font-size:12px;color:var(--text3);margin-top:3px">شغل مكتمل أو فواتير/أرصدة لسه ما اتحصلتش</div></div>'+
        '<div class="fv3-recv-total">'+totalsToMoneyHtml(totals)+'</div>'+
      '</div>'+
      (groups.length ? groups.map(function(group){
        var clientJson = JSON.stringify(group.client);
        return '<div class="fv3-recv-client">'+
          '<div class="fv3-recv-head">'+
            '<b>'+esc(group.client)+'</b>'+
            '<div class="fv3-recv-head-actions">'+
              '<span class="fv3-recv-total">'+totalsToMoneyHtml(group.total)+'</span>'+
              '<button class="btn btn-ghost btn-sm" data-fr-action="invoice" data-fr-client="'+esc(group.client)+'"><i class="fa-solid fa-file-invoice"></i> إصدار فاتورة</button>'+
              '<button class="btn btn-ghost btn-sm" style="color:#25D366" data-fr-action="whatsapp" data-fr-client="'+esc(group.client)+'"><i class="fa-brands fa-whatsapp"></i> واتساب</button>'+
            '</div>'+
          '</div>'+
          group.items.map(function(item, itemIndex){
            return '<div class="fv3-recv-row">'+
              '<div class="fv3-recv-row-main" data-fr-action="view" data-fr-client="'+esc(group.client)+'" data-fr-index="'+itemIndex+'"><b>'+esc(item.title)+'</b><small>'+(item.date?esc(item.date)+' · ':'')+esc(collectKindLabel(item.kind))+'</small></div>'+
              '<span class="fv3-recv-kind">'+collectKindLabel(item.kind)+'</span>'+
              '<div style="display:flex;align-items:center;gap:8px;justify-content:flex-end">'+
                '<span class="fv3-recv-total">'+fmt(item.amount,item.code)+'</span>'+
                '<button class="btn btn-primary btn-sm" data-fr-action="collect" data-fr-client="'+esc(group.client)+'" data-fr-index="'+itemIndex+'">تحصيل</button>'+
              '</div>'+
            '</div>';
          }).join('')+
        '</div>';
      }).join('') : '<div class="fv3-empty">لا توجد مبالغ غير محصلة حالياً.</div>')+
    '</div>';
    document.body.appendChild(overlay);
    bindReceivableModalActions(overlay);
    overlay.addEventListener('click', function(e){ if(e.target === overlay) overlay.remove(); });
  }
  function bindReceivableModalActions(overlay){
    Array.prototype.slice.call(overlay.querySelectorAll('[data-fr-action]')).forEach(function(el){
      el.addEventListener('click', function(e){
        e.preventDefault();
        e.stopPropagation();
        var action = el.getAttribute('data-fr-action');
        var client = el.getAttribute('data-fr-client') || '';
        var idx = Number(el.getAttribute('data-fr-index') || 0);
        if(action === 'invoice') return openReceivableInvoice(client);
        if(action === 'whatsapp') return openReceivableWhatsApp(client);
        if(action === 'view') return openReceivableItem(client, idx, 'view');
        if(action === 'collect') return openReceivableItem(client, idx, 'collect');
      });
    });
  }
  function dismissReceivableAlert(){
    root.__financeReceivableAlertHidden = true;
    root.__financeReceivableAlertHiddenDay = todayKey();
    var el = document.querySelector('.fv3-collect-alert');
    if(el) el.remove();
  }
  function groupByClientName(clientName){
    return clientReceivableGroups(receivableItems()).find(function(g){ return String(g.client) === String(clientName); }) || null;
  }
  function openReceivableInvoice(clientName){
    var group = groupByClientName(clientName);
    if(!group || !group.items.length) return;
    var invoiceItems = group.items.filter(function(item){
      if(!item || item.kind === 'project_task') return false;
      if(item.kind === 'invoice'){
        var inv = list(state().invoices).find(function(x){ return String(x.id) === String(item.id); });
        if(isProjectInvoice(inv)) return false;
      }
      return true;
    });
    if(!invoiceItems.length){
      alert('لا توجد تاسكات فردية غير محصلة لهذا العميل. فواتير المشاريع يتم إنشاؤها من قسم المشاريع.');
      return;
    }
    suspendReceivablesModal();
    var items = invoiceItems.map(function(item){
      var src = item.invoiceItem || {};
      return {
        _taskId: src._taskId || undefined,
        section: 'regular',
        desc: src.desc || item.title,
        qty: src.qty || 1,
        price: num(src.price || item.amount)
      };
    });
    if(hasAppFn('openInvoiceFromReceivables')) {
      callApp('openInvoiceFromReceivables', [clientName, items, 'فاتورة بالمبالغ غير المحصلة للمهام المكتملة.']);
    } else if(hasAppFn('openInvoiceModal')) {
      callApp('showPage', ['invoices']);
      callApp('openInvoiceModal');
    } else {
      alert('مودال الفاتورة غير جاهز حالياً');
    }
  }
  function openReceivableWhatsApp(clientName){
    var group = groupByClientName(clientName);
    if(!group || !group.items.length) return;
    suspendReceivablesModal();
    var totalsText = totalsToText(group.total);
    var lines = group.items.map(function(item, idx){
      return (idx + 1) + '. ' + item.title + ' - ' + fmt(item.amount, item.code || 'EGP');
    }).join('\n');
    var studio = (state().settings && state().settings.name) || 'Ordo';
    var msg = 'مرحباً ' + clientName + '\n\n' +
      'نذكركم بوجود مبلغ مستحق غير محصل بقيمة: ' + totalsText + '\n\n' +
      'تفاصيل الأعمال:\n' + lines + '\n\n' +
      'برجاء سداد المبلغ المستحق في أقرب وقت.\n' +
      'شكراً لتعاملكم معنا\n' + studio;
    var phone = clientPhone(clientName).replace(/\D/g,'');
    if(hasAppFn('openReceivableWhatsAppModal')){
      callApp('openReceivableWhatsAppModal', [clientName, phone, msg]);
    } else if(hasAppFn('openM') && document.getElementById('modal-whatsapp')){
      document.getElementById('wa-recip-name').textContent = clientName || '—';
      document.getElementById('wa-recip-phone-disp').innerHTML = phone ? '<i class="fa-solid fa-phone"></i> '+phone : 'لا يوجد رقم - أدخله يدوياً';
      document.getElementById('wa-phone-input').value = phone;
      document.getElementById('wa-msg-text').value = msg;
      callApp('updateWaPreview');
      callApp('openM', ['modal-whatsapp']);
    } else {
      root.open('https://wa.me/'+(phone || '')+'?text='+encodeURIComponent(msg), '_blank');
    }
  }
  function suspendReceivablesModal(){
    var old = document.getElementById('finance-receivables-modal');
    if(old) old.remove();
    root.__financeReturnReceivables = true;
  }
  function resumeReceivablesIfNeeded(){
    if(!root.__financeReturnReceivables) return;
    if(document.querySelector('.modal-overlay.open')) return;
    root.__financeReturnReceivables = false;
    setTimeout(openReceivablesModal, 80);
  }
  function openReceivableItem(clientName, index, mode){
    var group = groupByClientName(clientName);
    if(!group || !group.items[index]) return;
    var item = group.items[index];
    suspendReceivablesModal();
    try {
      if(mode === 'collect') {
        if(item.kind === 'task' && hasAppFn('openIncomeModal')) {
          var task = list(state().tasks).find(function(t){ return String(t.id) === String(item.id); });
          callApp('openIncomeModal', [null, task ? task.id : item.id]);
          return;
        }
        if(item.kind === 'project_task' && hasAppFn('_askPtaskPayment')) {
          callApp('_askPtaskPayment', [String(item.id), String(item.projectId || '')]);
          return;
        }
        if(item.kind === 'invoice' && hasAppFn('previewInv')) {
          callApp('showPage', ['invoices']);
          callApp('switchInvTab', ['invoices']);
          setTimeout(function(){ callApp('previewInv', [item.id]); }, 120);
          return;
        }
        if(item.kind === 'client_balance' && hasAppFn('openClientProfile')) {
          var client = clientByName(item.client);
          callApp('openClientProfile', [client ? client.id : item.id]);
          return;
        }
      }
      if(item.kind === 'task' && hasAppFn('openTaskDetail')) {
        var t = list(state().tasks).find(function(x){ return String(x.id) === String(item.id); });
        callApp('openTaskDetail', [t ? t.id : item.id]);
        return;
      }
      if(item.kind === 'project_task' && hasAppFn('openProjTaskDetail')) {
        var pt = list(state().project_tasks).find(function(x){ return String(x.id) === String(item.id); });
        callApp('openProjTaskDetail', [pt ? pt.id : item.id, (pt && pt.project_id) || item.projectId || '']);
        return;
      }
      if(item.kind === 'invoice' && hasAppFn('previewInv')) {
        callApp('showPage', ['invoices']);
        callApp('switchInvTab', ['invoices']);
        setTimeout(function(){ callApp('previewInv', [item.id]); }, 120);
        return;
      }
      if(item.kind === 'client_balance' && hasAppFn('openClientProfile')) {
        var c = clientByName(item.client);
        callApp('openClientProfile', [c ? c.id : item.id]);
      }
    } catch(e) {
      console.warn('[Ordo] receivable action failed', e);
    }
  }
  function body(){
    if(TAB === 'accounts') return accountsPage();
    if(TAB === 'currency-wallets') return currencyWalletsPage();
    if(TAB === 'loans') return loansPage();
    if(TAB === 'reports') return reportsPage();
    if(TAB === 'transactions') return transactionsPage();
    return dashboard();
  }
  var renderTimer = 0;
  function scheduleRender(delay){
    clearTimeout(renderTimer);
    renderTimer = setTimeout(render, delay == null ? 40 : delay);
  }
  function render(){
    var page = document.getElementById('page-finance');
    if(!page) return;
    if(!page.classList.contains('active')) return;
    if(root.loadOrdoPageModule && !(root.OrdoPageModules && root.OrdoPageModules.finance)){
      root.loadOrdoPageModule('finance').catch(function(e){ console.warn('[Ordo] finance page module failed', e); });
    }
    ensureAccounts();
    injectStyle();
    var active = page.classList.contains('active');
    page.className = 'page ordo-finance-v3' + (active ? ' active' : '');
    page.innerHTML = header() + tabs() + collectionAlert() + body();
    if(TAB === 'dashboard' || TAB === 'reports') setTimeout(renderCharts, 60);
  }

  function renderCharts(){
    var allTxs = txs();
    if(typeof root.Chart !== 'function') {
      miniBars();
      return;
    }
    try { if(charts.flow) charts.flow.destroy(); } catch(e){}
    try { if(charts.split) charts.split.destroy(); } catch(e){}
    var flowEl = document.getElementById('fv3-flow-chart');
    if(flowEl){
      var keys = lastMonths(6);
      var income = keys.map(function(k){ return allTxs.filter(function(t){ return t.type !== 'expense' && monthKey(txDate(t)) === k; }).reduce(function(s,t){ return s + txAmount(t); }, 0); });
      var expense = keys.map(function(k){ return allTxs.filter(function(t){ return t.type === 'expense' && monthKey(txDate(t)) === k; }).reduce(function(s,t){ return s + txAmount(t); }, 0); });
      charts.flow = new Chart(flowEl, {
        type:'bar',
        data:{labels:keys, datasets:[
          {label:'دخل', data:income, backgroundColor:'#27ae60'},
          {label:'مصروف', data:expense, backgroundColor:'#eb5757'}
        ]},
        options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}},scales:{y:{beginAtZero:true}}}
      });
    }
    var splitEl = document.getElementById('fv3-split-chart');
    if(splitEl){
      var accs = accounts(true);
      charts.split = new Chart(splitEl, {
        type:'doughnut',
        data:{labels:accs.map(function(a){ return a.name; }), datasets:[{data:accs.map(function(a){ return Math.max(0,balance(a,allTxs)); }), backgroundColor:accs.map(function(a){ return a.color || TYPES[a.type].color; })}]},
        options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}}}
      });
    }
  }
  function miniBars(){
    var host = document.getElementById('fv3-flow-chart');
    if(!host || host.dataset.mini) return;
    host.dataset.mini = '1';
    var allTxs = txs(), keys = lastMonths(6);
    var max = 1;
    var rows = keys.map(function(k){
      var inc = allTxs.filter(function(t){ return t.type !== 'expense' && monthKey(txDate(t)) === k; }).reduce(function(s,t){ return s + txAmount(t); }, 0);
      var exp = allTxs.filter(function(t){ return t.type === 'expense' && monthKey(txDate(t)) === k; }).reduce(function(s,t){ return s + txAmount(t); }, 0);
      max = Math.max(max, inc, exp);
      return {k:k, inc:inc, exp:exp};
    });
    var wrap = document.createElement('div');
    wrap.className = 'fv3-mini-bars';
    wrap.innerHTML = rows.map(function(r){
      return '<div class="fv3-mini-bar" title="'+esc(r.k)+' دخل" style="height:'+Math.max(8,(r.inc/max)*210)+'px"></div><div class="fv3-mini-bar exp" title="'+esc(r.k)+' مصروف" style="height:'+Math.max(8,(r.exp/max)*210)+'px"></div>';
    }).join('');
    host.parentNode.replaceChild(wrap, host);
  }

  function openAccountModal(accountId){
    ensureAccounts();
    var a = accountId ? accountById(accountId) : null;
    var type = a ? a.type : 'cash';
    closeAccountModal();
    var overlay = document.createElement('div');
    overlay.className = 'fv3-modal-backdrop';
    overlay.id = 'finance-account-modal';
    overlay.innerHTML = '<div class="fv3-modal">'+
      '<div class="fv3-modal-head"><h3>'+(a?'تعديل حساب مالي':'إنشاء حساب أو بنك')+'</h3><button class="close-btn" onclick="closeFinanceAccountModal()"><i class="fa-solid fa-xmark"></i></button></div>'+
      '<input type="hidden" id="fv3-acc-id" value="'+esc(a ? a.id : '')+'">'+
      '<div class="fv3-form-grid"><div class="fv3-field"><label>اسم الحساب</label><input id="fv3-acc-name" value="'+esc(a ? a.name : '')+'" placeholder="مثال: بنك CIB"></div>'+
      '<div class="fv3-field"><label>النوع</label><select id="fv3-acc-type">'+Object.keys(TYPES).map(function(k){ return '<option value="'+k+'" '+(type===k?'selected':'')+'>'+TYPES[k].label+'</option>'; }).join('')+'</select></div>'+
      '<div class="fv3-field"><label>العملة</label><select id="fv3-acc-currency"><option value="EGP">جنيه مصري</option><option value="USD">دولار</option><option value="EUR">يورو</option><option value="SAR">ريال سعودي</option><option value="AED">درهم إماراتي</option></select></div>'+
      '<div class="fv3-field"><label>الرصيد الافتتاحي</label><input id="fv3-acc-opening" type="number" value="'+esc(a ? a.opening_balance : 0)+'" placeholder="0"></div>'+
      '<div class="fv3-field"><label>لون الحساب</label><input id="fv3-acc-color" type="color" value="'+esc(a ? a.color : TYPES[type].color)+'"></div></div>'+
      '<div style="display:flex;justify-content:space-between;gap:10px;margin-top:8px">'+
      (a ? '<button class="btn btn-danger" onclick="archiveFinanceAccount()"><i class="fa-solid fa-trash"></i> إيقاف</button>' : '<span></span>')+
      '<div style="display:flex;gap:8px"><button class="btn btn-ghost" onclick="closeFinanceAccountModal()">إلغاء</button><button class="btn btn-primary" onclick="saveFinanceAccount()"><i class="fa-solid fa-floppy-disk"></i> حفظ</button></div></div>'+
      '</div>';
    document.body.appendChild(overlay);
    var cur = document.getElementById('fv3-acc-currency');
    if(cur) cur.value = a ? a.currency_code : 'EGP';
  }
  function closeAccountModal(){
    var m = document.getElementById('finance-account-modal');
    if(m) m.remove();
  }
  function saveAccount(){
    var s = state();
    var accs = ensureAccounts();
    var accountId = document.getElementById('fv3-acc-id').value;
    var type = document.getElementById('fv3-acc-type').value || 'other';
    var data = {
      name:(document.getElementById('fv3-acc-name').value || '').trim() || TYPES[type].label,
      type:type,
      currency_code:document.getElementById('fv3-acc-currency').value || 'EGP',
      opening_balance:num(document.getElementById('fv3-acc-opening').value),
      color:document.getElementById('fv3-acc-color').value || TYPES[type].color,
      active:true,
      updatedAt:new Date().toISOString()
    };
    var existing = accs.find(function(a){ return String(a.id) === String(accountId); });
    if(existing) Object.assign(existing, data);
    else accs.push(Object.assign({id:id(),createdAt:new Date().toISOString()}, data));
    s.finance_accounts = accs;
    save();
    closeAccountModal();
    render();
  }
  function archiveAccount(){
    var accountId = document.getElementById('fv3-acc-id').value;
    var a = accountById(accountId);
    if(!a) return;
    if(!confirm('إيقاف الحساب؟ الحركات القديمة ستظل محفوظة ومربوطة به.')) return;
    a.active = false;
    a.updatedAt = new Date().toISOString();
    save();
    closeAccountModal();
    render();
  }
  function deleteTransaction(txId){
    if(!confirm('حذف هذه المعاملة؟')) return;
    if(typeof root.delTrans === 'function') {
      try { root.delTrans(txId); return; } catch(e){}
    }
    state().transactions = list(state().transactions).filter(function(t){ return String(t.id) !== String(txId); });
    save();
    render();
  }
  function statementRows(kind, ref){
    var rows = [];
    if(kind === 'account'){
      var acc = accountById(ref);
      if(!acc) return rows;
      rows.push({date:'-', type:'رصيد افتتاحي', desc:acc.name, amount:num(acc.opening_balance), code:acc.currency_code, balance:num(acc.opening_balance)});
      var running = num(acc.opening_balance);
      txs().filter(function(t){ return String(t.account_id || '') === String(acc.id); })
        .sort(function(a,b){ return String(txDate(a)).localeCompare(String(txDate(b))); })
        .forEach(function(t){
          var delta = t.type === 'expense' ? -txAmount(t) : txAmount(t);
          running += delta;
          rows.push({date:txDate(t), type:t.type === 'expense' ? 'مصروف' : 'دخل', desc:t.desc || t.source || t.expCat || '-', amount:delta, code:currency(t,acc), balance:running});
        });
      return rows;
    }
    if(kind === 'wallet'){
      var code = currencyMeta(ref).code;
      var runningWallet = 0;
      txs().filter(function(t){ return currency(t) === code; })
        .sort(function(a,b){ return String(txDate(a)).localeCompare(String(txDate(b))); })
        .forEach(function(t){
          var delta = t.type === 'expense' ? -txAmount(t) : txAmount(t);
          runningWallet += delta;
          rows.push({date:txDate(t), type:t.type === 'expense' ? 'مصروف' : 'دخل', desc:t.desc || t.source || t.expCat || '-', amount:delta, code:code, balance:runningWallet});
        });
      list(state().wallet_transfers).forEach(function(tr){
        if(tr.from_currency === code) rows.push({date:String(tr.createdAt||'').slice(0,10), type:'تحويل خارج', desc:tr.note || 'تحويل بين المحافظ', amount:-num(tr.from_amount), code:code, balance:null});
        if(tr.to_currency === code) rows.push({date:String(tr.createdAt||'').slice(0,10), type:'تحويل داخل', desc:tr.note || 'تحويل بين المحافظ', amount:num(tr.to_amount), code:code, balance:null});
      });
      list(state().tasks).forEach(function(t){
        if(taskCurrency(t) !== code || t.paymentCollected || t.pay === 'paid') return;
        var due = num(t.value) - num(t.deposit);
        if(due > 0) rows.push({date:t.orderDate || t.createdAt || '-', type:'مستحق مهمة', desc:t.title || '-', amount:due, code:code, balance:null});
      });
      return rows.sort(function(a,b){ return String(a.date||'').localeCompare(String(b.date||'')); });
    }
    return rows;
  }
  function openStatement(kind, ref){
    var title = 'كشف حساب';
    if(kind === 'account'){
      var acc = accountById(ref);
      title = 'كشف حساب: ' + (acc ? acc.name : ref);
    } else {
      var meta = currencyMeta(ref);
      title = 'كشف محفظة: ' + meta.label + ' (' + meta.symbol + ')';
    }
    var rows = statementRows(kind, ref);
    var html = '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>'+esc(title)+'</title>'+
      '<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap" rel="stylesheet">'+
      '<style>body{font-family:Cairo,Arial,sans-serif;margin:28px;color:#111;direction:rtl}h1{font-size:22px;margin:0 0 6px}.meta{color:#666;font-size:12px;margin-bottom:18px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ddd;padding:8px;text-align:right}th{background:#f4f4f7}.pos{color:#15803d;font-weight:900}.neg{color:#b91c1c;font-weight:900}.actions{margin-bottom:16px}@media print{.actions{display:none}}</style></head><body>'+
      '<div class="actions"><button onclick="window.print()">طباعة / PDF</button></div><h1>'+esc(title)+'</h1><div class="meta">تاريخ الإصدار: '+new Date().toLocaleString('ar-EG')+'</div>'+
      '<table><thead><tr><th>التاريخ</th><th>النوع</th><th>الوصف</th><th>الحركة</th><th>الرصيد</th></tr></thead><tbody>'+
      (rows.length ? rows.map(function(r){
        return '<tr><td>'+esc(r.date||'-')+'</td><td>'+esc(r.type||'-')+'</td><td>'+esc(r.desc||'-')+'</td><td class="'+(num(r.amount)<0?'neg':'pos')+'">'+fmt(r.amount,r.code)+'</td><td>'+(r.balance==null?'-':fmt(r.balance,r.code))+'</td></tr>';
      }).join('') : '<tr><td colspan="5">لا توجد حركات</td></tr>')+
      '</tbody></table></body></html>';
    var w = window.open('', '_blank');
    if(!w) return alert('المتصفح منع فتح كشف الحساب. اسمح بالنوافذ المنبثقة.');
    w.document.open();
    w.document.write(html);
    w.document.close();
  }
  function openWalletBalanceAdjust(code){
    var meta = currencyMeta(code);
    var summary = walletSummary(meta.code);
    var raw = prompt('الرصيد الحالي ' + fmt(summary.balance, meta.code) + '\nاكتب الرصيد الصحيح لمحفظة ' + meta.label, String(summary.balance));
    if(raw === null) return;
    var target = num(raw);
    var delta = target - num(summary.balance);
    if(Math.abs(delta) < 0.000001) return;
    var tx = {
      id:Date.now(),
      type:delta >= 0 ? 'income' : 'expense',
      amount:Math.abs(delta),
      source:delta >= 0 ? 'تسوية رصيد' : 'تسوية رصيد',
      desc:'تسوية رصيد محفظة ' + meta.label,
      expCat:delta < 0 ? 'تسوية رصيد' : null,
      isoDate:new Date().toISOString().slice(0,10),
      date:new Date().toISOString().slice(0,10),
      currency_code:meta.code,
      currency_symbol:meta.symbol,
      currency:meta.code,
      source_type:'wallet_adjustment',
      createdAt:new Date().toISOString(),
      updatedAt:new Date().toISOString()
    };
    state().transactions = list(state().transactions);
    state().transactions.push(tx);
    save();
    render();
  }
  function openCurrencyWalletModal(){
    closeCurrencyWalletModal();
    var existingCodes = ensureCurrencyWallets().map(function(w){ return currencyMeta(w.currency_code).code; });
    var defs = ['EGP','USD','EUR','SAR','AED'].map(currencyMeta).filter(function(c){ return existingCodes.indexOf(c.code) === -1; });
    var overlay = document.createElement('div');
    overlay.className = 'fv3-modal-backdrop';
    overlay.id = 'currency-wallet-modal';
    overlay.innerHTML = '<div class="fv3-modal">'+
      '<div class="fv3-modal-head"><h3>إنشاء محفظة عملة</h3><button class="close-btn" onclick="closeCurrencyWalletModal()"><i class="fa-solid fa-xmark"></i></button></div>'+
      '<div class="fv3-form-grid"><div class="fv3-field"><label>العملة</label><select id="cw-code">'+defs.map(function(c){ return '<option value="'+esc(c.code)+'">'+esc(c.label)+' ('+esc(c.symbol)+')</option>'; }).join('')+'</select></div>'+
      '<div class="fv3-field"><label>اسم المحفظة</label><input id="cw-label" placeholder="مثال: محفظة الدولار"></div></div>'+
      '<div style="display:flex;justify-content:flex-end;gap:8px"><button class="btn btn-ghost" onclick="closeCurrencyWalletModal()">إلغاء</button><button class="btn btn-primary" onclick="saveCurrencyWallet()"><i class="fa-solid fa-floppy-disk"></i> حفظ</button></div>'+
      '</div>';
    document.body.appendChild(overlay);
    if(!defs.length){
      var select = document.getElementById('cw-code');
      if(select) select.innerHTML = '<option value="">كل العملات الأساسية لها محافظ بالفعل</option>';
    }
  }
  function closeCurrencyWalletModal(){
    var m = document.getElementById('currency-wallet-modal');
    if(m) m.remove();
  }
  function saveCurrencyWallet(){
    var code = document.getElementById('cw-code') ? document.getElementById('cw-code').value : '';
    if(!code) return alert('اختر العملة');
    var s = state();
    s.wallets = Array.isArray(s.wallets) ? s.wallets : [];
    var meta = currencyMeta(code);
    if(s.wallets.some(function(w){ return currencyMeta(w.currency_code).code === meta.code; })) return alert('المحفظة موجودة بالفعل');
    var label = (document.getElementById('cw-label') && document.getElementById('cw-label').value || '').trim() || meta.label;
    s.wallets.push({id:'wallet_'+meta.code+'_'+Date.now(), currency_code:meta.code, currency_symbol:meta.symbol, currency_label:label, balance:0, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), manual:true});
    save();
    closeCurrencyWalletModal();
    TAB = 'currency-wallets';
    render();
  }
  function deleteCurrencyWallet(walletId){
    var s = state();
    s.wallets = Array.isArray(s.wallets) ? s.wallets : [];
    var wallet = s.wallets.find(function(w){ return String(w.id || w.currency_code) === String(walletId); });
    if(!wallet) return;
    var code = currencyMeta(wallet.currency_code).code;
    var hasTx = txs().some(function(t){ return currency(t) === code; });
    var hasTransfer = list(s.wallet_transfers).some(function(t){ return t.from_currency === code || t.to_currency === code; });
    var msg = hasTx || hasTransfer
      ? 'هذه المحفظة لها حركات أو تحويلات. حذفها سيخفيها من تبويب المحافظ لكن الحركات ستظل محفوظة في كشف الحساب العام. هل تريد الحذف؟'
      : 'حذف هذه المحفظة؟';
    if(!confirm(msg)) return;
    s.wallets = s.wallets.filter(function(w){ return String(w.id || w.currency_code) !== String(walletId); });
    save();
    TAB = 'currency-wallets';
    render();
  }
  function injectLoanCurrencyField(){
    var modal = document.getElementById('modal-loan');
    if(!modal || document.getElementById('loan-currency')) return;
    var amount = document.getElementById('loan-amount');
    var group = document.createElement('div');
    group.className = 'form-group';
    group.innerHTML = '<label class="form-label">عملة القرض</label><select class="form-select" id="loan-currency"><option value="EGP">جنيه مصري</option><option value="USD">دولار أمريكي</option><option value="EUR">يورو</option><option value="SAR">ريال سعودي</option><option value="AED">درهم إماراتي</option></select>';
    if(amount && amount.closest('.form-row')) amount.closest('.form-row').appendChild(group);
  }

  function injectAccountField(type){
    ensureAccounts();
    var modal = document.getElementById(type === 'income' ? 'modal-income' : 'modal-expense');
    if(!modal) return;
    var idField = document.getElementById(type === 'income' ? 'income-eid' : 'expense-eid');
    var tx = idField && idField.value ? txs().find(function(t){ return String(t.id) === String(idField.value); }) : null;
    var selectId = type === 'income' ? 'in-account-id' : 'ex-account-id';
    var existing = document.getElementById(selectId);
    if(existing) {
      existing.innerHTML = accountOptions(tx && tx.account_id);
      if(tx && tx.account_id) existing.value = tx.account_id;
      existing.onchange = function(){ syncCurrencyWithAccount(type, this.value); };
      if(tx && tx.account_id && !(tx.currency_code || tx.currency)) syncCurrencyWithAccount(type, tx.account_id);
      return;
    }
    var pay = document.getElementById(type === 'income' ? 'in-pay-method' : 'ex-pay-method');
    var group = document.createElement('div');
    group.className = 'form-group';
    group.innerHTML = '<label class="form-label"><i class="fa-solid fa-wallet" style="color:var(--accent)"></i> الحساب / البنك</label><select class="form-select" id="'+selectId+'">'+accountOptions(tx && tx.account_id)+'</select>';
    if(pay && pay.parentElement && pay.parentElement.parentElement) pay.parentElement.parentElement.appendChild(group);
    else modal.querySelector('.modal')?.insertBefore(group, modal.querySelector('.modal [style*="justify-content:flex-end"]'));
    var select = document.getElementById(selectId);
    if(select){
      select.onchange = function(){ syncCurrencyWithAccount(type, this.value); };
      if(tx && tx.account_id) select.value = tx.account_id;
      if(tx && tx.account_id && !(tx.currency_code || tx.currency)) syncCurrencyWithAccount(type, tx.account_id);
      if(!tx) syncCurrencyWithAccount(type, select.value);
    }
  }
  function newestTransaction(beforeIds, type){
    var rows = txs().filter(function(t){ return t.type === type && !beforeIds[String(t.id)]; });
    return rows.sort(function(a,b){ return num(b.id)-num(a.id); })[0] || null;
  }
  function patchModals(){
    if(root.__financeV3Patched) return;
    root.__financeV3Patched = true;
    var oldIncome = root.openIncomeModal;
    if(typeof oldIncome === 'function'){
      root.openIncomeModal = function(){
        var r = oldIncome.apply(this, arguments);
        setTimeout(function(){ injectAccountField('income'); }, 80);
        return r;
      };
    }
    var oldExpense = root.openExpenseModal;
    if(typeof oldExpense === 'function'){
      root.openExpenseModal = function(){
        var r = oldExpense.apply(this, arguments);
        setTimeout(function(){ injectAccountField('expense'); }, 80);
        return r;
      };
    }
    var oldSave = root.saveTrans;
    if(typeof oldSave === 'function'){
      root.saveTrans = function(type){
        var select = document.getElementById(type === 'income' ? 'in-account-id' : 'ex-account-id');
        var chosen = select && select.value;
        if(chosen) syncCurrencyWithAccount(type, chosen);
        var idField = document.getElementById(type === 'income' ? 'income-eid' : 'expense-eid');
        var editingId = idField && idField.value;
        var before = {};
        txs().forEach(function(t){ before[String(t.id)] = true; });
        var r = oldSave.apply(this, arguments);
        setTimeout(function(){
          ensureAccounts();
          var tx = editingId ? txs().find(function(t){ return String(t.id) === String(editingId); }) : newestTransaction(before,type);
          if(tx && chosen){
            var acc = accountById(chosen);
            tx.account_id = chosen;
            if(acc){
              var meta = currencyMeta(acc.currency_code || tx.currency_code || tx.currency || 'EGP');
              tx.currency_code = meta.code;
              tx.currency_symbol = meta.symbol;
              tx.currency = meta.code;
              tx.updatedAt = new Date().toISOString();
            }
            save();
            scheduleRender(80);
          }
        }, 120);
        return r;
      };
    }
    var oldLoan = root.openLoanModal;
    if(typeof oldLoan === 'function'){
      root.openLoanModal = function(id){
        var r = oldLoan.apply(this, arguments);
        setTimeout(function(){
          injectLoanCurrencyField();
          var loan = id ? allLoans().find(function(l){ return String(l.id) === String(id); }) : null;
          var el = document.getElementById('loan-currency');
          if(el) el.value = loan ? (loan.currency_code || loan.currency || 'EGP') : 'EGP';
        }, 80);
        return r;
      };
    }
    var oldSaveLoan = root.saveLoan;
    if(typeof oldSaveLoan === 'function'){
      root.saveLoan = function(){
        injectLoanCurrencyField();
        var before = {};
        allLoans().forEach(function(l){ before[String(l.id)] = true; });
        var editingId = document.getElementById('loan-eid') && document.getElementById('loan-eid').value;
        var code = document.getElementById('loan-currency') ? document.getElementById('loan-currency').value : 'EGP';
        var r = oldSaveLoan.apply(this, arguments);
        setTimeout(function(){
          var loan = editingId ? allLoans().find(function(l){ return String(l.id) === String(editingId); }) : allLoans().find(function(l){ return !before[String(l.id)]; });
          if(loan){
            var meta = currencyMeta(code);
            loan.currency_code = meta.code;
            loan.currency_symbol = meta.symbol;
            loan.currency = meta.code;
            save();
            render();
          }
        }, 120);
        return r;
      };
    }
  }

  root.switchFinanceV3Tab = function(tab){ TAB = tab || 'dashboard'; scheduleRender(0); };
  root.openFinanceAccountModal = openAccountModal;
  root.closeFinanceAccountModal = closeAccountModal;
  root.saveFinanceAccount = saveAccount;
  root.archiveFinanceAccount = archiveAccount;
  root.deleteFinanceTransaction = deleteTransaction;
  root.openFinanceStatement = openStatement;
  root.openWalletBalanceAdjust = openWalletBalanceAdjust;
  root.openCurrencyWalletModal = openCurrencyWalletModal;
  root.closeCurrencyWalletModal = closeCurrencyWalletModal;
  root.saveCurrencyWallet = saveCurrencyWallet;
  root.deleteCurrencyWallet = deleteCurrencyWallet;
  root.financeV3Income = function(){ if(typeof root.openIncomeModal === 'function') root.openIncomeModal(); };
  root.financeV3Expense = function(){ if(typeof root.openExpenseModal === 'function') root.openExpenseModal(); };
  root.openFinanceReceivablesModal = openReceivablesModal;
  root.dismissFinanceReceivableAlert = dismissReceivableAlert;
  root.openFinanceReceivableInvoice = openReceivableInvoice;
  root.openFinanceReceivableWhatsApp = openReceivableWhatsApp;
  root.openFinanceReceivableItem = openReceivableItem;
  root.renderFinance = function(){ scheduleRender(0); };
  var oldAfterModalClose = root.__ordoAfterModalClose;
  root.__ordoAfterModalClose = function(){
    if(typeof oldAfterModalClose === 'function') oldAfterModalClose();
    resumeReceivablesIfNeeded();
  };

  var oldShowPage = root.showPage;
  if(typeof oldShowPage === 'function' && !root.__financeV3ShowPagePatched){
    root.__financeV3ShowPagePatched = true;
    root.showPage = function(page){
      var r = oldShowPage.apply(this, arguments);
      if(page === 'finance') scheduleRender(60);
      return r;
    };
  }

  patchModals();
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ scheduleRender(60); });
  else scheduleRender(60);
})(window);
