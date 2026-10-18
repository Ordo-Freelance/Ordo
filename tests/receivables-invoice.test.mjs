import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const financeSource = fs.readFileSync(new URL('../JavaScript/finance_rebuild.js', import.meta.url), 'utf8');
const clientSource = fs.readFileSync(new URL('../JavaScript/client_finance_fix.js', import.meta.url), 'utf8');
const portalSource = fs.readFileSync(new URL('../HTML/client-portal.html', import.meta.url), 'utf8');
const appSource = fs.readFileSync(new URL('../JavaScript/app.js', import.meta.url), 'utf8');

function financeContext(data) {
  const source = financeSource.slice(financeSource.indexOf('  function receivableItems(){'), financeSource.indexOf('  function receivablesByCurrency('));
  const ctx = {
    state:() => data, list:v => Array.isArray(v) ? v : [], num:v => Number(v) || 0,
    isCollected:item => !!item?.paid,
    taskPendingAmount:t => Math.max(0, Number(t.value || 0) - Number(t.deposit || 0)),
    clientNameById:id => data.clients.find(c => String(c.id) === String(id))?.name || '',
    projectById:id => data.projects?.find(p => String(p.id) === String(id)),
    taskCurrency:() => 'EGP', baseCurrencyCode:() => 'EGP',
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
  const start=portalSource.indexOf('let _accountFrom=');
  const end=portalSource.indexOf('function renderInvoices(){',start);
  const context={
    _ud:{clients:[{id:'c1'}]},_clientId:'c1',_clientTasks:[{id:'t1',title:'تصميم',value:3000}],_clientInvoices:[],
    _clientTransactions:()=>[],_unbilledPortalTasks:tasks=>tasks,
    _curMeta:()=>({code:'EGP'}),_entityCur:()=>({code:'EGP'}),
    _addCurrencyTotal:(totals,code,amount)=>{totals[code]=(totals[code]||0)+amount;},
    _currencyRows:totals=>JSON.stringify(totals),_money:value=>String(value),xe:value=>String(value)
  };
  context.document={getElementById:()=>null};context.window={open:()=>null};
  vm.runInNewContext(portalSource.slice(start,end),context);
  const html=context.renderAccounts();
  assert.match(html,/إجمالي المستحق الآن[\s\S]*?EGP":3000/);
  assert.match(html,/إجمالي المدفوع حتى الآن/);
  assert.doesNotMatch(html,/حسب العملة/);
  assert.match(html,/أعمال مستحقة غير مفوترة/);
  assert.match(html,/كشف حساب شامل/);
  assert.match(html,/شهران/);
  assert.match(html,/عمل \/ مستحق/);
  assert.match(html,/مدفوع \/ خصم/);
  assert.match(html,/طباعة \/ PDF/);
  assert.match(portalSource,/#root\{min-height:100vh;display:flex;flex-direction:column\}/);
  assert.match(portalSource,/document\.getElementById\('root'\)\.style\.display='flex'/);
  assert.match(portalSource,/\.wrap\{[^}]*flex:1/);
});

test('portal headline shows all recorded collections instead of the old excess-payment label',()=>{
  assert.match(portalSource,/onclick="_openCollectedPopup\(\)"/);
  assert.match(portalSource,/totalCollected>0\?_currencyRows\(paidByCurrency,'var\(--g\)'\)/);
  assert.doesNotMatch(portalSource,/الهواء عليه/);
});

test('portal account totals use invoice net due after discount and prepayment',()=>{
  assert.match(portalSource,/const vals=_portalInvoiceValues\(inv\);[\s\S]*?_addCurrencyTotal\(invoiceTotals,c,vals\.total\);[\s\S]*?_addCurrencyTotal\(paidTotals,c,vals\.prepaid\);[\s\S]*?_addCurrencyTotal\(unpaidTotals,c,vals\.due\);/);
  assert.match(portalSource,/const unpaid=_clientInvoices\.reduce\(\(s,i\)=>s\+_portalInvoiceValues\(i\)\.due,0\)/);
});

test('comprehensive statement does not duplicate an unallocated receipt mirrored as invoice prepayment',()=>{
  assert.match(portalSource,/const unallocatedPaymentPool=\{\}/);
  assert.match(portalSource,/const coveredByClientReceipt=Math\.min\(recordedManual,unallocatedPaymentPool\[code\]\|\|0\)/);
  assert.match(portalSource,/recordedManual-coveredByClientReceipt/);
});

test('portal invoice tolerates legacy JSON-string allocations without breaking the page',()=>{
  assert.match(portalSource,/const safeArray=value=>/);
  assert.match(portalSource,/safeArray\(tx\.allocations\)\.filter/);
});

test('portal billing tab includes account statements and readable identity colors', () => {
  assert.match(portalSource, /_clientStatements=\(ud\.statements\|\|\[\]\)/);
  assert.match(portalSource, /الفواتير والكشوف/);
  assert.match(portalSource, /كشوفات الحساب/);
  assert.match(portalSource, /--t1','#f7f9ff'/);
  assert.match(portalSource, /--t3','#aeb8d0'/);
  assert.match(portalSource, /function openPortalAccountStatement\(\)/);
  assert.match(portalSource, /عرض كشف الحساب/);
  assert.match(portalSource, /document\.getElementById\('tp-accounts'\)/);
});

test('client portal supports complete per-client visibility controls',()=>{
  const appSource=fs.readFileSync(new URL('../JavaScript/app.js',import.meta.url),'utf8');
  assert.match(appSource,/function _clientPortalVisibilityDefaults\(\)/);
  assert.match(appSource,/function _clientPortalVisibilityEditor\(clientId,portal\)/);
  assert.match(appSource,/function _toggleClientPortalVisibility\(clientId,key,checked\)/);
  assert.match(appSource,/token\.portal_visibility=Object\.assign/);
  assert.doesNotMatch(appSource,/أول قسم يظهر للعميل/);
  assert.match(portalSource,/function _portalVisibility\(\)/);
  assert.match(portalSource,/function _portalDefaultTab\(\)/);
  assert.match(portalSource,/pv\.stat_paid/);
  assert.match(portalSource,/pv\.tab_chat/);
  assert.match(portalSource,/pv\.public_portfolio/);
  assert.match(portalSource,/pv\.account_statement/);
  assert.match(portalSource,/pv\.invoice_invoices/);
});

test('portal invoices open a protected preview and provide PDF printing', () => {
  assert.match(portalSource, /onclick="openPortalInvoice\('/);
  assert.match(portalSource, /function openPortalInvoice\(id\)/);
  assert.match(portalSource, /_clientInvoices\.find\(row=>String\(row\.id\)===String\(id\)\)/);
  assert.match(portalSource, /تحميل PDF/);
  assert.match(portalSource, /function downloadPortalInvoicePdf\(id\)/);
  assert.match(portalSource, /document\.fonts\?\.ready/);
  assert.match(portalSource, /win\.print\(\)/);
  assert.match(portalSource, /pInvoiceId=P\.get\('invoice'\)/);
  assert.match(portalSource, /المهام المكتملة/);
  assert.match(portalSource, /function _portalInvoiceDocument\(inv,printMode\)/);
  assert.match(portalSource, /typeof inv\?\.publicPrintHtml==='string'/);
  assert.match(portalSource, /id="portal-preview-fit"/);
  assert.match(portalSource, /\.inv-page\{margin-left:auto!important;margin-right:auto!important\}/);
  assert.match(portalSource, /if\(printMode\)return fitted/);
  assert.match(portalSource, /id="portal-invoice-row-fit"/);
  assert.match(appSource, /const SECTION_CHUNK_UNITS=6/);
  assert.match(appSource, /const PAGE_UNITS=25/);
  assert.match(portalSource, /srcdoc=_portalInvoiceDocument\(inv,false\)/);
  assert.match(portalSource, /srcdoc=_portalInvoiceDocument\(inv,true\)/);
  assert.match(portalSource, /المهام المكتملة <small>/);
  assert.match(portalSource, /linear-gradient\(135deg,#171721,#49351f\)/);
  assert.match(portalSource, /background:#fffaf1;border:1px solid #f4dfb6/);
});

test('portal headline includes the full account total to date',()=>{
  assert.match(portalSource,/const totalAccount = Object\.values\(chargeByCurrency\)/);
  assert.match(portalSource,/إجمالي الحساب حتى الآن/);
  assert.match(portalSource,/repeat\(5,minmax\(0,1fr\)\)/);
});

test('portal invoice uses discounted net, linked collections, and real A4 page count', () => {
  assert.match(portalSource, /const total=Math\.max\(0,subtotal-Math\.min\(subtotal,discount\)\)/);
  assert.match(portalSource, /safeArray\(tx\.allocations\)/);
  assert.match(portalSource, /مدفوع \/ عربون \/ جزئي/);
  assert.match(portalSource, /perPage=10/);
  assert.match(portalSource, /صفحة \$\{pageIndex\+1\} من \$\{pageCount\}/);
  assert.match(portalSource, /vals\.due>0/);
});
