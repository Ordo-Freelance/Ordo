import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync(new URL('../JavaScript/app.js', import.meta.url), 'utf8');
const patch = fs.readFileSync(new URL('../JavaScript/app_patch.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../HTML/index.html', import.meta.url), 'utf8');

test('desktop sidebar opens by default and renders a real bars icon when closed', () => {
  const code = app.slice(app.indexOf('function openSidebar(){'), app.indexOf('// Update header title + CTA on page change'));
  assert.match(code, /document\.body\.classList\.remove\('sidebar-collapsed'\)/);
  assert.doesNotMatch(code, /saved === '0'/);
  assert.match(code, /fa-solid fa-' \+ \(isOpen \? 'xmark' : 'bars'\)/);
  assert.doesNotMatch(app, /if\(window\.innerWidth>1024\) closeSidebar\(\)/);
  assert.match(html, /id="sidebar-toggle"[^>]*onclick="toggleSidebar\(\)"/);
});

test('salary choices follow the shared enabled currencies while preserving a selected legacy currency', () => {
  const code = app.slice(app.indexOf('function _salaryCurrencyMeta(value){'), app.indexOf('function _salaryDestinationOptions(selected){'));
  const context = vm.createContext({
    window: {},
    S: {settings: {enabled_currencies: [
      {code:'EGP',enabled:true}, {code:'USD',enabled:true}, {code:'SAR',enabled:false}
    ]}}
  });
  vm.runInContext(`${code}\nglobalThis.normal = _salaryCurrencyOptions('EGP'); globalThis.legacy = _salaryCurrencyOptions('SAR');`, context);
  for(const currency of ['EGP','USD']) assert.match(context.normal, new RegExp(`value="${currency}"`));
  assert.doesNotMatch(context.normal, /value="SAR"/);
  assert.match(context.legacy, /value="SAR" selected/);
  assert.doesNotMatch(patch, /\['EGP','USD','SAR'\]\.forEach\(function\(code\)\{ byCode\[code\]\.enabled = true;/);
});
