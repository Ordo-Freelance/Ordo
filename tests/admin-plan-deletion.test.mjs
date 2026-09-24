import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../HTML/admin.html', import.meta.url), 'utf8');
const syncSource = source.slice(source.indexOf('async function syncPlansFromSupabase() {'), source.indexOf('async function syncSerialsFromSupabase() {'));

test('refreshing plans never recreates a deleted default package', async () => {
  let upserts = 0;
  let saved;
  const context = {
    console,
    PLANS:[{id:'basic'}],
    supa:{from(table){assert.equal(table,'subscription_plans');return {
      select(){return {order:async()=>({data:[],error:null})};},
      upsert(){upserts++;throw Error('A refresh must not seed packages');}
    };}},
    _planFromDb:row=>row,
    lsSet:(key,value)=>{assert.equal(key,'plans');saved=value;},
    renderPlans(){}
  };
  vm.runInNewContext(syncSource,context);
  assert.equal(await context.syncPlansFromSupabase(),true);
  assert.equal(context.PLANS.length,0);
  assert.equal(saved.length,0);
  assert.equal(upserts,0);
});
