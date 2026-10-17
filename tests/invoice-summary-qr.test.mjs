import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../JavaScript/app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../HTML/index.html',import.meta.url),'utf8');

test('invoice headline due uses net amount after discount and prepayment',()=>{
  assert.match(app,/totalDue:totals\.remaining/);
  assert.match(app,/inv-summary[\s\S]*?breakdown\.prepaid\.toLocaleString\(\)[\s\S]*?مدفوع مسبقاً[\s\S]*?breakdown\.totalDue\.toLocaleString\(\)/);
  assert.match(app,/\.inv-summary\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
});

test('project summary is conditional and QR visibility is configurable',()=>{
  assert.match(app,/projectGroups\.length\?`<div[\s\S]*?إجمالي المشاريع/);
  assert.match(app,/invoiceShowQr===false/);
  assert.match(html,/id="set-invoice-show-qr"/);
});

test('invoice QR has a saved label and uses workspace print theme',()=>{
  assert.match(app,/projectLabel:/);
  assert.match(app,/const theme=_printTheme\(\)/);
  assert.match(html,/id="inv-project-label"/);
});

test('collection receipt uses the workspace print identity and transaction currency',()=>{
  const receipt=app.slice(app.indexOf('function exportReceipt('),app.indexOf('function _invLinkToProject(',app.indexOf('function exportReceipt(')));
  assert.match(receipt,/const theme = _printTheme\(\)/);
  assert.match(receipt,/_logoForContext\('dark-bg'\)/);
  assert.match(receipt,/receiptCurrency\.symbol/);
  assert.match(receipt,/linear-gradient\(135deg,\$\{theme\.ink\},\$\{theme\.accentDark\}\)/);
});

test('client invoice list shows a visible collection icon',()=>{
  assert.match(app,/title="تحصيل الفاتورة" aria-label="تحصيل الفاتورة"/);
  assert.match(app,/fa-hand-holding-dollar" style="color:inherit"/);
});

test('invoice list and WhatsApp use net payable amount after every deduction',()=>{
  assert.match(app,/function _invoiceAmountDue\(inv\)/);
  assert.match(app,/invTotal\s*=\s*_fmtPrice\(_invoiceAmountDue\(inv\)/);
  assert.match(app,/صافي المستحق بعد الخصم والمدفوعات/);
  assert.match(app,/_fmtPrice\(_invoiceAmountDue\(inv\),inv\.currency_code\|\|inv\.currency_symbol\|\|inv\.currency\)/);
});

test('invoice collection icon stays visible and WhatsApp includes the secure invoice link',()=>{
  assert.match(app,/title="تحصيل المتبقي" aria-label="تحصيل المتبقي"[\s\S]*?fa-hand-holding-dollar" style="color:inherit"/);
  assert.match(app,/\{\{رابط_الفاتورة\}\}/);
  assert.match(app,/tab=invoices&invoice=/);
  assert.match(app,/تحميل PDF قبل الإرسال/);
});
