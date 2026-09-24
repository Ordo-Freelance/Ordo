import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {publicSnapshot} from '../api/index.js';

const html=fs.readFileSync(new URL('../HTML/index.html',import.meta.url),'utf8');
const portal=fs.readFileSync(new URL('../HTML/client-portal.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../JavaScript/app.js',import.meta.url),'utf8');
const owner=fs.readFileSync(new URL('../JavaScript/brief_forms.js',import.meta.url),'utf8');
const api=fs.readFileSync(new URL('../api/index.js',import.meta.url),'utf8');
const persistence=fs.readFileSync(new URL('../JavaScript/vercel_persistence.js',import.meta.url),'utf8');

test('briefs sit beside invoices and contracts with editable items and question types',()=>{
  assert.match(html,/id="inv-tab-briefs"/);
  assert.match(html,/id="inv-panel-briefs"/);
  assert.match(html,/brief_forms\.js/);
  for(const value of ['essay','checkbox','image'])assert.match(owner,new RegExp(`'${value}'`));
  assert.match(owner,/brief-item-title/);
  assert.match(owner,/brief-item-desc/);
  assert.match(owner,/brief-q-required/);
  assert.match(app,/briefs:'inv-panel-briefs'/);
});

test('portal snapshot exposes only sent briefs for its client and not private answers',async()=>{
  const data={settings:{name:'Studio'},clients:[{id:'a',name:'A'},{id:'b',name:'B'}],client_portals:[{id:'p',client_id:'a'}],public_tokens:[{token:'portal-a',entity_type:'client_portal',entity_id:'p',client_id:'a'}],brief_forms:[
    {id:'draft',client_id:'a',status:'draft'},
    {id:'sent',client_id:'a',status:'sent',title:'بريف',questions:[{id:'q',type:'essay',label:'سؤال'}],answers:{q:'private'}},
    {id:'other',client_id:'b',status:'sent'}
  ]};
  const store={async publicStudioCandidates(){return [{user_id:'owner',data}];},async query(){return [];}};
  const snapshot=await publicSnapshot(store,{type:'client_portal',token:'portal-a'});
  assert.deepEqual(snapshot.data.brief_forms.map(x=>x.id),['sent']);
  assert.equal(snapshot.data.brief_forms[0].answers,undefined);
});

test('brief submissions are validated server-side and owner imports answers into project',()=>{
  assert.match(api,/eventType==='brief_submit'/);
  assert.match(api,/brief_not_available/);
  assert.match(api,/brief_already_submitted/);
  assert.match(app,/if\(type==='brief_submit'\)/);
  assert.match(owner,/project\.briefAnswers=form\.answers/);
  assert.match(owner,/project\.brief=\{/);
  assert.match(persistence,/'brief_forms'/);
  assert.match(portal,/sendPortalEvent\('brief_submit'/);
});

test('portal brief renderer shows a sent form and submission entry point',()=>{
  const start=portal.indexOf('function renderBriefForms(){');
  const end=portal.indexOf('function openBriefSheet(',start);
  const context={_ud:{brief_forms:[{id:'b1',title:'Design',description:'Questions',status:'sent'}]},xe:value=>String(value||'')};
  vm.runInNewContext(portal.slice(start,end),context);
  const rendered=context.renderBriefForms();
  assert.match(rendered,/Design/);
  assert.match(rendered,/فتح البريف/);
  assert.doesNotMatch(rendered,/لا توجد بريفات/);
});
