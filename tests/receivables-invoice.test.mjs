import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const financeSource = fs.readFileSync(new URL('../JavaScript/finance_rebuild.js', import.meta.url), 'utf8');
const clientSource = fs.readFileSync(new URL('../JavaScript/client_finance_fix.js', import.meta.url), 'utf8');
const portalSource = fs.readFileSync(new URL('../HTML/client-portal.html', import.meta.url), 'utf8');

function financeContext(data) {
  const source = financeSource.slice(financeSource.indexOf('  function receivableItems(){'), financeSource.indexOf('  function receivablesByCurrency('));
  const ctx = {
    state:() => data, list:v => Array.isArray(v) ? v : [], num:v => Number(v) || 0,
    isCollected:item => !!item?.paid,
    taskPendingAmount:t => Math.max(0, Number(t.value || 0) - Number(t.deposit || 0)),
    clientNameById:id => data.clients.find(c => String(c.id) === String(id))?.name || '',
    projectById:id => data.projects?.find(p => String(p.id) === String(id)),
    taskCurrency:() => 'EGP',
    currency:() => 'EGP'
  };
  vm.runInNewContext(source,ctx);
  return ctx.receivableItems();
}

test('two task items invoiced for 3000 are counted as 3000, not 6000', () => {
  const data = {
    clients:[{id:'c1',name:'عميل'}], projects:[], project_tasks:[],
    tasks:[{id:'t1',client:'عميل',status:'done',value:1000},{id:'t2',client:'عميل',status:'done',value:2000}],
    invoices:[{id:'i1',client:'عميل',total:3000,status:'pending',items:[{_taskId:'t1',price:1000},{_taskId:'t2',price:2000}]}]
  };
  const rows = financeContext(data);
  assert.equal(rows.reduce((sum,row) => sum + row.amount,0),3000);
  assert.deepEqual(Array.from(rows,r => r.kind),['invoice']);

  const root = {S:data};
  vm.runInNewContext(clientSource,{window:root});
  const clientSummary = root.OrdoClientFinanceFix.summary('c1').EGP;
  assert.equal(clientSummary.unpaidInvoices,3000);
  assert.equal(clientSummary.unpaidTasks,0);
  assert.equal(clientSummary.netDue,3000);
});

test('unbilled tasks remain payable and task linkage aliases prevent duplicates', () => {
  const data = {
    clients:[{id:'c1',name:'عميل'}],projects:[],project_tasks:[],
    tasks:[{id:'t1',client:'عميل',status:'done',value:1000},{id:'t2',client:'عميل',status:'done',value:2000}],
    invoices:[{id:'i1',client:'عميل',total:1000,status:'pending',items:[{linkedTaskId:'t1'}]}]
  };
  assert.equal(financeContext(data).reduce((sum,row)=>sum+row.amount,0),3000);
  const root = {S:data};
  vm.runInNewContext(clientSource,{window:root});
  const summary = root.OrdoClientFinanceFix.summary('c1').EGP;
  assert.equal(summary.unpaidInvoices,1000);
  assert.equal(summary.unpaidTasks,2000);
});

test('client portal excludes invoiced project tasks from task dues', () => {
  const start = portalSource.indexOf('function _invoicedPortalTaskIds(');
  const end = portalSource.indexOf('function _subtractCurrencyTotal(', start);
  const context = {};
  vm.runInNewContext(portalSource.slice(start,end),context);
  const tasks=[{id:'pt1',value:3000,project_id:'p1',paymentStatus:'pending'}];
  const invoices=[{id:'i1',total:3000,items:[{_projectTaskId:'pt1',price:3000}]}];
  assert.equal(context._unbilledPortalTasks(tasks,invoices).length,0);
  assert.equal(context._unbilledPortalTasks(tasks,[]).length,1);
  assert.equal(portalSource.includes('(_ud.project_tasks||[])\n    .filter(t=>_clientProjects.some(p=>String(p.id)===String(t.project_id))&&(t.value||0)>0'),false);
});

test('account tab shows unbilled task dues and footer stays at page bottom', () => {
  const start=portalSource.indexOf('function renderAccounts(){');
  const end=portalSource.indexOf('function renderInvoices(){',start);
  const context={
    _ud:{clients:[{id:'c1'}]},_clientId:'c1',_clientTasks:[{id:'t1',title:'تصميم',value:3000}],_clientInvoices:[],
    _clientTransactions:()=>[],_unbilledPortalTasks:tasks=>tasks,
    _curMeta:()=>({code:'EGP'}),_entityCur:()=>({code:'EGP'}),
    _addCurrencyTotal:(totals,code,amount)=>{totals[code]=(totals[code]||0)+amount;},
    _currencyRows:totals=>JSON.stringify(totals),_money:value=>String(value),xe:value=>String(value)
  };
  vm.runInNewContext(portalSource.slice(start,end),context);
  const html=context.renderAccounts();
  assert.match(html,/إجمالي المستحق الآن[\s\S]*?EGP":3000/);
  assert.match(html,/أعمال مستحقة غير مفوترة/);
  assert.match(portalSource,/#root\{min-height:100vh;display:flex;flex-direction:column\}/);
  assert.match(portalSource,/document\.getElementById\('root'\)\.style\.display='flex'/);
  assert.match(portalSource,/\.wrap\{[^}]*flex:1/);
});
