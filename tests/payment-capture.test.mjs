import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../JavaScript/payment_capture.js',import.meta.url),'utf8');

test('task and invoice payments require the shared payment capture flow',()=>{
  assert.match(source,/root\.markPaid=function/);
  assert.match(source,/root\._toggleProfileTaskPayment=function/);
  assert.match(source,/paymentProofMode==='required'/);
  assert.match(source,/receiptImage/);
});

test('payment capture lists created accounts and exposes transaction details',()=>{
  assert.match(source,/finance_accounts/);
  assert.match(source,/paymentAccounts/);
  assert.match(source,/التاريخ والوقت/);
  assert.match(source,/إيصال \/ إثبات الدفع/);
  assert.match(source,/الوقت غير مسجل للعملية القديمة/);
});
