import test from 'node:test';
import assert from 'node:assert/strict';
import {financeFeatureAccess} from '../api/index.js';
import fs from 'node:fs';

test('finance tabs and actions obey package flags and per-user admin settings',async()=>{
  const store={async query(table){
    if(table==='serial_keys')return [{plan_id:'studio',status:'active'}];
    if(table==='subscription_plans')return {features:{finance:true,finance_accounts:false,fin_expense:false}};
    if(table==='platform_settings')return {config:{user_features:{finance_reports:'enabled'},protected_feature_overrides:{u1:{finance_currency_wallets:'disabled',finance_dashboard:'coming'}}}};
  }};
  const result=await financeFeatureAccess(store,{id:'u1',is_admin:false});
  assert.equal(result.finance_accounts,false);
  assert.equal(result.finance_currency_wallets,false);
  assert.equal(result.finance_dashboard,false);
  assert.equal(result.fin_expense,false);
  assert.equal(result.finance_transactions,true);
  assert.equal(result.finance_reports,true);
});

test('platform admin keeps finance access',async()=>{
  const result=await financeFeatureAccess({query(){throw Error('no query expected');}},{id:'admin',is_admin:true});
  assert.equal(Object.values(result).every(Boolean),true);
});

test('finance UI gates all six visible tabs and primary actions',()=>{
  const source=fs.readFileSync(new URL('../JavaScript/finance_rebuild.js',import.meta.url),'utf8');
  for(const key of ['finance_dashboard','finance_accounts','finance_currency_wallets','loans','finance_reports','finance_transactions','fin_income','fin_expense','finance_account_manage'])assert.match(source,new RegExp("allowed\\('"+key+"'\\)|"+key));
  assert.match(source,/ORDO_API_REQUEST\('finance\.features'\)/);
  assert.match(source,/items\.filter\(function\(x\)\{return allowed\(TAB_FEATURES\[x\[0\]\]\)/);
});
