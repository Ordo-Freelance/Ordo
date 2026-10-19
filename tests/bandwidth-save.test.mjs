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

test('a loaded account cannot be overwritten by an accidental empty snapshot', async () => {
  const source=fs.readFileSync(new URL('../JavaScript/vercel_persistence.js',import.meta.url),'utf8');
  const writes=[];const memory=new Map();
  const remote={settings:{username:'studio'},tasks:[{id:'t1'}],clients:[{id:'c1'}],invoices:[{id:'i1'}]};
  const root={
    ORDO_LOCAL_ONLY:false,_supaUserId:'user-1',_cloudLoadDone:true,_appReady:true,
    S:{settings:{}},localStorage:{getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value)},
    addEventListener(){},showSyncIndicator(){},toast(){},
    supa:{from(table){return{
      select(){return this;},eq(){return this;},async maybeSingle(){return{data:{data:remote,updated_at:'2026-10-19T00:00:00Z'},error:null};},
      async upsert(row){writes.push({table,row});return{data:{},error:null};}
    };}}
  };
  vm.runInNewContext(source,{window:root,setTimeout,clearTimeout,console});
  await root.cloudLoad();
  root.S={settings:{username:'studio'},tasks:[],clients:[],invoices:[],projects:[],transactions:[]};
  await root.cloudSave(root.S);
  assert.equal(writes.length,0);
  assert.equal(root._lastCloudSaveError.code,'empty_snapshot_blocked');
  assert.equal(root.S.tasks.length,1);
  assert.equal(root.S.clients.length,1);
  assert.equal(root.S.invoices.length,1);
});

test('an explicitly confirmed clear may write an empty snapshot', async () => {
  const source=fs.readFileSync(new URL('../JavaScript/vercel_persistence.js',import.meta.url),'utf8');
  const writes=[];const memory=new Map();
  const root={
    ORDO_LOCAL_ONLY:false,_supaUserId:'user-1',_cloudLoadDone:true,_appReady:true,_ordoCloudLoadedFromServer:true,
    _ordoServerCoreCount:3,_ordoLastServerSnapshot:{tasks:[{id:'t1'}],clients:[{id:'c1'}],invoices:[{id:'i1'}]},
    _ordoAllowEmptyCloudOverwrite:true,S:{settings:{username:'studio'},tasks:[],clients:[],invoices:[]},
    localStorage:{getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value)},addEventListener(){},
    supa:{from(table){return{async upsert(row){writes.push({table,row});return{data:{},error:null};}}}}
  };
  vm.runInNewContext(source,{window:root,setTimeout,clearTimeout,console});
  root._ordoCloudLoadedFromServer=true;
  await root.cloudSave(root.S);
  assert.ok(writes.some(write=>write.table==='studio_data'));
  assert.equal(root._ordoAllowEmptyCloudOverwrite,false);
});

test('client blocks losing the last service or an existing logo', async () => {
  const source=fs.readFileSync(new URL('../JavaScript/vercel_persistence.js',import.meta.url),'utf8');
  const writes=[];const memory=new Map();
  const prior={settings:{username:'studio',logo:'data:image/png;base64,abc'},tasks:[{id:'t1'}],services:[{id:'s1'}]};
  const root={
    ORDO_LOCAL_ONLY:false,_supaUserId:'user-1',_cloudLoadDone:true,_appReady:true,_ordoCloudLoadedFromServer:true,
    _ordoServerCoreCount:2,_ordoLastServerSnapshot:prior,S:{settings:{username:'studio',logo:''},tasks:[{id:'t1'}],services:[]},
    localStorage:{getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value)},addEventListener(){},showSyncIndicator(){},toast(){},
    supa:{from(table){return{async upsert(row){writes.push({table,row});return{data:{},error:null};}}}}
  };
  vm.runInNewContext(source,{window:root,setTimeout,clearTimeout,console});
  root._ordoCloudLoadedFromServer=true;
  await root.cloudSave(root.S);
  assert.equal(writes.length,0);
  assert.equal(root._lastCloudSaveError.code,'collection_drop_blocked');
  assert.equal(root.S.services.length,1);
  assert.match(root.S.settings.logo,/^data:image/);
});

test('client sends the loaded server revision with every studio write', async () => {
  const source=fs.readFileSync(new URL('../JavaScript/vercel_persistence.js',import.meta.url),'utf8');
  const calls=[];const memory=new Map();
  const remote={settings:{username:'studio'},tasks:[{id:'t1'}]};
  const root={
    ORDO_LOCAL_ONLY:false,_supaUserId:'user-1',_cloudLoadDone:true,_appReady:true,
    S:{settings:{}},localStorage:{getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value)},addEventListener(){},
    supa:{from(table){return{
      select(){return this;},eq(){return this;},async maybeSingle(){return{data:{data:remote,updated_at:'2026-10-19T00:00:00Z'},error:null};},
      async upsert(row,options){calls.push({table,row,options});return{data:[{updated_at:'2026-10-19T00:01:00Z'}],error:null};}
    };}}
  };
  vm.runInNewContext(source,{window:root,setTimeout,clearTimeout,console});
  await root.cloudLoad();
  root.S.tasks.push({id:'t2'});
  await root.cloudSave(root.S);
  const studio=calls.find(call=>call.table==='studio_data');
  assert.equal(studio.options.expectedUpdatedAt,'2026-10-19T00:00:00Z');
  assert.equal(root._ordoExpectedUpdatedAt,'2026-10-19T00:01:00Z');
});
