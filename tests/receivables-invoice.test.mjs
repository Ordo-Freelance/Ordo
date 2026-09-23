import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const financeSource = fs.readFileSync(new URL('../JavaScript/finance_rebuild.js', import.meta.url), 'utf8');
const clientSource = fs.readFileSync(new URL('../JavaScript/client_finance_fix.js', import.meta.url), 'utf8');

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
