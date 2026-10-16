import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../JavaScript/app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../HTML/index.html',import.meta.url),'utf8');

test('invoice headline due uses net amount after discount and prepayment',()=>{
  assert.match(app,/totalDue:totals\.remaining/);
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
