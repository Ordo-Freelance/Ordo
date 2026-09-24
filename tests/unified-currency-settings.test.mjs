import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../JavaScript/app.js',import.meta.url),'utf8');
const patch=fs.readFileSync(new URL('../JavaScript/app_patch.js',import.meta.url),'utf8');
const finance=fs.readFileSync(new URL('../JavaScript/finance_rebuild.js',import.meta.url),'utf8');
const portal=fs.readFileSync(new URL('../HTML/client-portal.html',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../api/index.js',import.meta.url),'utf8');
const store=fs.readFileSync(new URL('../HTML/store.html',import.meta.url),'utf8');

test('only the selected base currency is forced on; other choices remain configurable',()=>{
  assert.match(patch,/if\(byCode\[base\]\) byCode\[base\]\.enabled = true/);
  assert.doesNotMatch(patch,/\['EGP','USD','SAR'\]\.forEach\(function\(code\)\{ if\(enabled\.indexOf/);
  assert.match(patch,/m\.code === current \? ' disabled/);
});

test('major money editors use the same enabled-currency settings',()=>{
  for(const id of ['sub-currency','rs-currency','pkg-st-currency','svc-currency','ptask-currency','tt-currency'])
    assert.match(app,new RegExp(`_fillSharedCurrencySelect\\('${id}'`));
  assert.match(app,/id="proj-budget-currency">'\+_salaryCurrencyOptions/);
  assert.match(finance,/function enabledCurrencyOptions\(selected\)/);
  assert.match(finance,/id="fv3-acc-currency">'\+enabledCurrencyOptions/);
  assert.match(finance,/id="loan-currency">'\+enabledCurrencyOptions/);
});

test('public portal receives the shared currency configuration',()=>{
  assert.match(api,/base_currency_code','enabled_currencies/);
  assert.match(portal,/const siteBase=_settings&&\(_settings\.base_currency_code/);
  assert.match(store,/function storeMoney\(price,entity\)/);
  assert.doesNotMatch(store,/\(s\.currency\|\|'ج\.م'\)/);
});
