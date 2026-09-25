import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code=fs.readFileSync(new URL('../JavaScript/project-finance-integration.js',import.meta.url),'utf8');
const portal=fs.readFileSync(new URL('../HTML/client-portal.html',import.meta.url),'utf8');

function api(){
  const window={};
  vm.runInNewContext(code,{window});
  return window.OrdoProjectFinance;
}

test('project deposit creates one linked income transaction and updates idempotently',()=>{
  const finance=api();
  const state={clients:[{id:'c1',name:'عميل'}],transactions:[]};
  const project={id:'p1',name:'هوية',client_id:'c1',budgetCurrency:'SAR'};
  const row={id:'r1',kind:'client_payment',amount:200,currency:'SAR',date:'2026-09-25',desc:'عربون'};
  finance.paymentTransaction(state,project,row);
  finance.paymentTransaction(state,project,row);
  assert.equal(state.transactions.length,1);
  assert.equal(state.transactions[0].amount,200);
  assert.equal(state.transactions[0].client_id,'c1');
  assert.equal(state.transactions[0].currency,'SAR');
  row.amount=350;
  finance.paymentTransaction(state,project,row);
  assert.equal(state.transactions.length,1);
  assert.equal(state.transactions[0].amount,350);
  assert.equal(finance.removePaymentTransaction(state,project,row),true);
  assert.equal(state.transactions.length,0);
});

test('project expense reaches Finance without becoming income',()=>{
  const finance=api();
  const state={transactions:[]};
  const project={id:'p1',name:'موقع',budgetCurrency:'EGP'};
  finance.paymentTransaction(state,project,{id:'e1',kind:'project_expense',amount:75,date:'2026-09-25'});
  assert.equal(state.transactions[0].type,'expense');
  assert.equal(state.transactions[0].expCat,'مصروف مشروع');
});

test('task deposit and final collection share one cumulative transaction',()=>{
  const finance=api();
  const state={transactions:[],clients:[{id:'c1',name:'عميل'}]};
  const project={id:'p1',name:'هوية',client_id:'c1'};
  const task={id:'t1',title:'لوجو',paymentStatus:'deposit',deposit:100,value:500};
  finance.taskPaymentTransaction(state,project,task);
  assert.equal(state.transactions[0].amount,100);
  task.paymentStatus='collected';task.paymentCollected=true;
  finance.taskPaymentTransaction(state,project,task);
  assert.equal(state.transactions.length,1);
  assert.equal(state.transactions[0].amount,500);
});

test('a paid invoice is not imported again when its project task is edited',()=>{
  const finance=api();
  const state={transactions:[],invoices:[{paid:true,items:[{_projectTaskId:'t1'}]}]};
  const project={id:'p1',name:'هوية'};
  const task={id:'t1',title:'لوجو',paymentStatus:'collected',value:500};
  assert.equal(finance.taskPaymentTransaction(state,project,task),null);
  assert.equal(state.transactions.length,0);
});

test('project save and ledger delete keep Finance in sync',()=>{
  const state={projects:[],clients:[{id:'c1',name:'عميل'}],transactions:[]};
  const window={
    S:state,
    document:{getElementById(id){return id==='proj-eid'?{value:''}:null;}},
    saveProject(){state.projects.push({id:'p1',name:'هوية',client_id:'c1',projectLedger:[{id:'r1',kind:'client_payment',amount:200,date:'2026-09-25'}]});},
    saveProjectLedgerRow(){},
    confirm(){return true;},
    lsSave(){},
    cloudSave(){},
    renderProjectDetail(){},
    renderFinance(){}
  };
  vm.runInNewContext(code,{window});
  window.saveProject();
  assert.equal(state.transactions.length,1);
  window.deleteProjectLedgerRow('p1','r1');
  assert.equal(state.projects[0].projectLedger.length,0);
  assert.equal(state.transactions.length,0);
});

test('legacy receipt import stops when Finance may already contain that payment',()=>{
  const row={id:'r1',kind:'client_payment',amount:200,date:'2026-09-25'};
  const state={
    projects:[{id:'p1',name:'هوية',client_id:'c1',projectLedger:[row]}],
    clients:[{id:'c1',name:'عميل'}],
    transactions:[{id:'old',type:'income',amount:200,project_id:'p1',isoDate:'2026-09-25'}]
  };
  const window={
    S:state,
    document:{getElementById(){return null;}},
    confirm(){return true;},
    lsSave(){},
    cloudSave(){},
    renderProjectDetail(){},
    renderFinance(){}
  };
  vm.runInNewContext(code,{window});
  window.syncProjectLegacyPayment('p1','r1');
  assert.equal(state.transactions.length,1);
  assert.equal(row.financeTransactionId,undefined);
});

test('project Finance totals include linked income but exclude mirrored receipts',()=>{
  const finance=api();
  const project={id:'p1',projectLedger:[
    {id:'r1',kind:'client_payment',amount:100},
    {id:'r2',kind:'client_payment',amount:50,statementId:'s1'}
  ]};
  const state={transactions:[
    {id:'a',type:'income',amount:100,project_id:'p1',project_ledger_id:'r1',source_type:'project_ledger'},
    {id:'b',type:'income',amount:50,project_id:'p1',statementId:'s1'},
    {id:'c',type:'income',amount:75,project_id:'p1',source_type:'project_task_payment'},
    {id:'d',type:'income',amount:90,project_id:'p1',source_type:'project_manual_post'}
  ]};
  const extras=finance.projectIncomeNotInLedger(state,project);
  assert.deepEqual(extras.map(tx=>tx.id),['c']);
});

test('portal project task collection includes linked tasks from its visible pools',()=>{
  assert.match(portal,/function _portalProjectTasks\(projectId\)/);
  assert.match(portal,/\.\.\.\(_ud\.project_tasks\|\|\[\]\),\.\.\.\(_clientTasks\|\|\[\]\)/);
  assert.match(portal,/const ptasks=_portalProjectTasks\(p\.id\)/);
});
