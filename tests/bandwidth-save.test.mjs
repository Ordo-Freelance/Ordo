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

test('portal snapshot carries the exact invoice and portfolio without bloating studio data', async () => {
  const source=fs.readFileSync(new URL('../JavaScript/vercel_persistence.js',import.meta.url),'utf8');
  const writes=[];const memory=new Map();
  const root={
    ORDO_LOCAL_ONLY:false,_supaUserId:'user-1',_cloudLoadDone:true,_appReady:true,_ordoCloudLoadedFromServer:true,
    S:{settings:{username:'studio'},clients:[{id:'c1',name:'Client'}],tasks:[],projects:[],project_tasks:[],transactions:[],statements:[],contracts:[],proposals:[],brief_forms:[],client_portals:[{id:'p1',client_id:'c1'}],svc_orders:[],services:[],standalone_packages:[],reviews:[],portfolio_projects:[{id:'pf1',name:'Project'}],invoices:[{id:'i1',client:'Client',publicPrintHtml:'old-heavy-copy'}],public_tokens:[{token:'portal-1',entity_type:'client_portal',entity_id:'p1',client_id:'c1'}]},
    exportPDF(){return '<!doctype html><html><body>canonical invoice</body></html>';},
    localStorage:{getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value)},addEventListener(){},
    supa:{from(table){return{async upsert(row){writes.push({table,row});return{data:{},error:null};}}}}
  };
  vm.runInNewContext(source,{window:root,setTimeout,clearTimeout,console});
  root._ordoCloudLoadedFromServer=true;await root.cloudSave(root.S);
  const studioWrite=writes.find(write=>write.table==='studio_data');
  const portalWrite=writes.find(write=>write.table==='public_tokens');
  assert.doesNotMatch(studioWrite.row.data,/publicPrintHtml/);
  assert.match(portalWrite.row.data.studio_data.invoices[0].publicPrintHtml,/canonical invoice/);
  assert.deepEqual(portalWrite.row.data.studio_data.portfolio_projects.map(row=>row.id),['pf1']);
  assert.equal(portalWrite.row.data.snapshot_version,2);
});
