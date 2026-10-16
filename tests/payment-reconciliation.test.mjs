import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../JavaScript/payment_reconciliation.js',import.meta.url),'utf8');
const context={console,setTimeout,clearTimeout};
context.globalThis=context;
vm.createContext(context);
vm.runInContext(source,context);
const pay=context.OrdoPaymentReconciliation;

function base(){
  const task={id:'t1',title:'تصميم',value:1000,client:'عميل',pay:'none'};
  const invoice={id:'i1',num:'INV-1',client:'عميل',total:1000,deposit:0,status:'pending',items:[{_taskId:'t1',qty:1,price:1000}]};
  return {clients:[{id:'c1',name:'عميل'}],tasks:[task],project_tasks:[],invoices:[invoice],transactions:[]};
}

test('settling an invoice is idempotent without marking its tasks paid',()=>{
  const s=base();pay.settleInvoice(s,s.invoices[0]);pay.settleInvoice(s,s.invoices[0]);
  assert.equal(s.transactions.length,1);assert.equal(s.transactions[0].amount,1000);
  assert.equal(s.invoices[0].status,'paid');assert.equal(s.tasks[0].pay,'none');
});

test('unsettling removes only the generated invoice receipt and reverses task status',()=>{
  const s=base();pay.settleInvoice(s,s.invoices[0]);pay.unsettleInvoice(s,s.invoices[0]);
  assert.equal(s.transactions.length,0);assert.equal(s.invoices[0].status,'pending');
  assert.equal(s.tasks[0].pay,'none');
});

test('partial client receipt appears on invoice and leaves task unpaid',()=>{
  const s=base();pay.receipt(s,s.clients[0],400,{source_ref:'receipt-1'});
  assert.equal(s.invoices[0].paidAmount,400);assert.equal(s.invoices[0].remainingAmount,600);
  assert.equal(s.invoices[0].status,'partial');assert.equal(s.tasks[0].pay,'none');
});

test('paying an invoiced task reduces invoice balance without duplicate cash',()=>{
  const s=base();pay.toggleTask(s,s.tasks[0],s.invoices[0]);pay.toggleTask(s,s.tasks[0],s.invoices[0]);pay.toggleTask(s,s.tasks[0],s.invoices[0]);
  assert.equal(s.transactions.length,1);assert.equal(s.transactions[0].source_ref,'task-payment:task:t1');
  assert.equal(s.task_collections.length,1);assert.equal(s.task_collections[0].task_id,'t1');
  assert.equal(s.invoices[0].remainingAmount,0);assert.equal(s.invoices[0].status,'paid');
});

test('invoice reconciliation clears legacy task collections without explicit task payment',()=>{
  const s=base();s.task_collections=[{id:'old-1',task_id:'t1'},{id:'old-2',task_id:'t1'}];
  pay.settleInvoice(s,s.invoices[0]);
  assert.equal(s.task_collections.length,0);assert.equal(s.tasks[0].pay,'none');
});

test('deleting an explicit task payment clears stale paid and deposit flags',()=>{
  const s=base();pay.toggleTask(s,s.tasks[0],s.invoices[0]);
  assert.equal(s.tasks[0].pay,'full');
  s.transactions=[];pay.reconcileInvoice(s,s.invoices[0]);
  assert.equal(s.tasks[0].pay,'none');assert.equal(s.tasks[0].paidAmount,0);
  assert.equal(s.task_collections.length,0);
});

test('startup removes old invoice-distributed task payments and restores the task value',()=>{
  const s=base();
  Object.assign(s.tasks[0],{pay:'deposit',deposit:400,paidAmount:400,paymentStatus:'deposit'});
  s.task_collections=[{id:'legacy-auto',task_id:'t1',source:'invoice_reconciliation',amount:400}];
  pay.reconcileAll(s);
  assert.equal(s.tasks[0].pay,'none');assert.equal(s.tasks[0].deposit,0);
  assert.equal(s.task_collections.length,0);
});

test('client receipt allocates oldest invoices first',()=>{
  const s=base();s.invoices.push({id:'i2',client:'عميل',date:'2026-02-01',total:800,items:[]});s.invoices[0].date='2026-01-01';
  pay.receipt(s,s.clients[0],1200,{source_ref:'receipt-2'});
  assert.equal(s.invoices[0].status,'paid');assert.equal(s.invoices[1].paidAmount,200);assert.equal(s.invoices[1].remainingAmount,600);
});

test('same receipt reference cannot be recorded twice',()=>{
  const s=base();pay.receipt(s,s.clients[0],1000,{source_ref:'same'});pay.receipt(s,s.clients[0],1000,{source_ref:'same'});
  assert.equal(s.transactions.length,1);assert.equal(s.invoices[0].paidAmount,1000);
});

test('audit reports exact duplicate client transactions without deleting them',()=>{
  const s=base();s.transactions=[{id:'a',type:'income',client:'عميل',amount:500,date:'2026-10-01',desc:'دفعة'},{id:'b',type:'income',client:'عميل',amount:500,date:'2026-10-01',desc:'دفعة'}];
  assert.equal(pay.auditClient(s,s.clients[0]).duplicates.length,1);
});
