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
const templates=fs.readFileSync(new URL('../JavaScript/brief_templates.js',import.meta.url),'utf8');

test('three reusable templates include the full identity questionnaire and internal-only pricing',()=>{
  const context={window:{}};
  vm.runInNewContext(templates,context);
  const build=context.window.OrdoBriefTemplates.build;
  for(const kind of ['identity','logo','social']){
    const form=build(kind);
    assert.equal(form.client_id,'');
    assert.equal(form.status,'draft');
    assert.ok(form.questions.length>=10);
  }
  const identity=build('identity');
  assert.equal(identity.questions.filter(q=>q.type==='section').length,13);
  assert.ok(identity.questions.some(q=>q.label.includes('Brand Essence')));
  assert.ok(identity.questions.some(q=>q.label.includes('الميزانية')));
  assert.ok(identity.questions.some(q=>q.label.includes('المخرجات المطلوبة')));
  assert.ok(identity.internalPricing.factors);
  assert.match(html,/brief_templates\.js/);
});

test('form editor and portal support banner, uploaded image choices and varied answers',()=>{
  for(const type of ['section','short','essay','radio','checkbox','select','toggle','scale','image'])assert.match(owner,new RegExp(`${type}:`));
  assert.match(owner,/briefUploadImageOption/);
  assert.match(owner,/briefUploadBanner/);
  assert.match(owner,/openBriefQuoteBuilder/);
  assert.match(portal,/form\.banner/);
  assert.match(portal,/pBriefId/);
  assert.match(api,/q\.type==='section'/);
  assert.match(api,/\['image','radio','select'\]/);
  assert.match(html,/prop-brief-id/);
});

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
    {id:'sent',client_id:'a',status:'sent',title:'بريف',banner:'data:image/webp;base64,AA',questions:[{id:'q',type:'essay',label:'سؤال'}],answers:{q:'private'},internalPricing:{lines:{base:1000}}},
    {id:'other',client_id:'b',status:'sent'}
  ]};
  const store={async publicStudioCandidates(){return [{user_id:'owner',data}];},async query(){return [];}};
  const snapshot=await publicSnapshot(store,{type:'client_portal',token:'portal-a'});
  assert.deepEqual(snapshot.data.brief_forms.map(x=>x.id),['sent']);
  assert.equal(snapshot.data.brief_forms[0].answers,undefined);
  assert.equal(snapshot.data.brief_forms[0].internalPricing,undefined);
  assert.equal(snapshot.data.brief_forms[0].banner,'data:image/webp;base64,AA');
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

test('brief builder keeps templates in the editor and permits stage navigation and image multi-selection',()=>{
  assert.match(owner,/id="brief-template-select"/);
  assert.match(owner,/briefApplyTemplate/);
  assert.match(owner,/briefAddQuestion\(\\'section\\'\)/);
  assert.match(owner,/deleteBriefForm/);
  assert.match(portal,/function briefStageMove\(direction\)/);
  assert.match(portal,/brief-portal-stage/);
  assert.match(portal,/class="brief-image-choice"/);
  assert.match(portal,/type="checkbox" value="'\+xe\(o\.label\)/);
  assert.doesNotMatch(portal,/--s1:#fff;--s2:#f6f7f9/);
  assert.match(api,/q\.type==='checkbox'\|\|q\.type==='image'&&Array\.isArray\(answer\)/);
  assert.match(api,/event_type:'portal_chat'.*brief_id:payload\.form_id/);
});

test('question editor uses individual choice inputs and type-specific previews instead of an essay options box',()=>{
  assert.match(owner,/class="brief-option-list"/);
  assert.match(owner,/class="form-input brief-option-label"/);
  assert.match(owner,/briefAddOption\(this\)/);
  assert.match(owner,/brief-select-preview/);
  assert.match(owner,/brief-preview-scale/);
  assert.match(owner,/brief-preview-toggle/);
  assert.match(owner,/querySelectorAll\('\.brief-option-label'\)/);
  assert.doesNotMatch(owner,/class="form-textarea brief-q-options"/);
});
