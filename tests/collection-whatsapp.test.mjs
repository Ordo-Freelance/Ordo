import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../JavaScript/app.js',import.meta.url),'utf8');
const capture=fs.readFileSync(new URL('../JavaScript/payment_capture.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../HTML/index.html',import.meta.url),'utf8');

test('successful invoice and task collections open an editable WhatsApp receipt message',()=>{
  assert.match(capture,/openCollectionWhatsApp/);
  assert.match(capture,/clientName:inv\.client/);
  assert.match(capture,/clientName:task\.client/);
  assert.match(app,/window\.openCollectionWhatsApp/);
});

test('client balance and manual client income collections also offer WhatsApp receipt',()=>{
  assert.match(app,/openCollectionWhatsApp\(\{clientName:c\.name,transactionId:tx\.id/);
  assert.match(app,/incomeClient[\s\S]*openCollectionWhatsApp/);
});

test('collection template is customizable and exposes receipt variables',()=>{
  assert.match(app,/collection:\s*cleanWaTemplate/);
  assert.match(html,/id="wa-tpl-collection"/);
  assert.match(html,/\{\{مبلغ_التحصيل\}\}/);
  assert.match(html,/id="wa-receipt-action"/);
});
