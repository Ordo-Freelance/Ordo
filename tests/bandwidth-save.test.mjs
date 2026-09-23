import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('unchanged state does not resend studio data or public snapshots', async () => {
  const source = fs.readFileSync(new URL('../JavaScript/vercel_persistence.js', import.meta.url),'utf8');
  const calls = [];
  const memory = new Map();
  const root = {
    ORDO_LOCAL_ONLY:false,_supaUserId:'user-1',_cloudLoadDone:true,_appReady:true,_ordoCloudLoadedFromServer:true,
    S:{settings:{username:'studio'},tasks:[],services:[]},
    localStorage:{getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value)},
    addEventListener(){},
    supa:{from(table){return {async upsert(){calls.push(table);return {data:{},error:null};}}}}
  };
  vm.runInNewContext(source,{window:root,setTimeout,clearTimeout});
  root._ordoCloudLoadedFromServer = true;
  await root.cloudSave(root.S);
  await root.cloudSave(root.S);
  assert.deepEqual(calls,['studio_data','public_store_items']);
});
