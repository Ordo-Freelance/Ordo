import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {publicSnapshot} from '../api/index.js';

const html=fs.readFileSync(new URL('../HTML/index.html',import.meta.url),'utf8');
const portal=fs.readFileSync(new URL('../HTML/client-portal.html',import.meta.url),'utf8');
const standalone=fs.readFileSync(new URL('../HTML/brief.html',import.meta.url),'utf8');
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
    {id:'sent',client_id:'a',status:'sent',title:'بريف',share_token:'brf_a',banner:'data:image/webp;base64,AA',questions:[{id:'q',type:'essay',label:'سؤال'}],answers:{q:'private'},internalPricing:{lines:{base:1000}}},
    {id:'other',client_id:'b',status:'sent'}
  ]};
  const store={async publicStudioCandidates(){return [{user_id:'owner',data}];},async query(){return [];}};
  const snapshot=await publicSnapshot(store,{type:'client_portal',token:'portal-a'});
  assert.deepEqual(snapshot.data.brief_forms.map(x=>x.id),['sent']);
  assert.equal(snapshot.data.brief_forms[0].answers,undefined);
  assert.equal(snapshot.data.brief_forms[0].internalPricing,undefined);
  assert.equal(snapshot.data.brief_forms[0].banner,'data:image/webp;base64,AA');
  assert.equal(snapshot.data.brief_forms[0].share_token,undefined);
});

test('older portal briefs open separately using a client-scoped fallback token',async()=>{
  const data={settings:{username:'designer'},public_tokens:[{token:'portal-a',entity_type:'client_portal',client_id:'a'}],brief_forms:[{id:'old',client_id:'a',status:'sent',title:'قديم',questions:[{id:'q',type:'short',label:'الاسم'}]},{id:'other',client_id:'b',status:'sent',title:'خاص'}]};
  const store={async publicStudioCandidates(){return [{user_id:'owner',username_index:'designer',data}];}};
  const ok=await publicSnapshot(store,{type:'brief',username:'designer',token:'portal-a',form_id:'old'});
  assert.equal(ok.data.brief_forms[0].id,'old');
  assert.equal(await publicSnapshot(store,{type:'brief',username:'designer',token:'portal-a',form_id:'other'}),null);
  assert.equal(await publicSnapshot(store,{type:'brief',username:'designer',token:'portal-a'}),null);
});

test('a submitted brief remains viewable through its separate link but cannot be resubmitted',async()=>{
  const data={settings:{username:'designer'},brief_forms:[{id:'b1',share_token:'brf_secret',status:'submitted',title:'بريف مكتمل',answers:{q:'private'},questions:[{id:'q',type:'short',label:'الاسم'}]}]};
  const store={async publicStudioCandidates(){return [{user_id:'owner',username_index:'designer',data}];}};
  const snapshot=await publicSnapshot(store,{type:'brief',username:'designer',token:'brf_secret'});
  assert.equal(snapshot.data.brief_forms[0].status,'submitted');
  assert.equal(snapshot.data.brief_forms[0].answers,undefined);
  assert.match(standalone,/if\(form\.status!=='sent'\)/);
});

test('standalone brief link uses username and private share token without exposing client data',async()=>{
  const form={id:'b1',title:'هوية بصرية',description:'وصف',status:'sent',share_token:'brf_secret',client_id:'a',questions:[{id:'q1',type:'checkbox',label:'المخرجات',options:[{label:'شعار'}]}],answers:{q1:['private']},internalPricing:{base:4000}};
  const data={settings:{username:'designer',name:'Studio'},clients:[{id:'a',name:'Client'}],brief_forms:[form],invoices:[{id:'inv',client_id:'a'}]};
  const store={async publicStudioCandidates(){return [{user_id:'owner',username_index:'designer',data}];}};
  const snapshot=await publicSnapshot(store,{type:'brief',username:'designer',token:'brf_secret'});
  assert.equal(snapshot.data.brief_forms[0].title,'هوية بصرية');
  assert.equal(snapshot.data.brief_forms[0].answers,undefined);
  assert.equal(snapshot.data.brief_forms[0].internalPricing,undefined);
  assert.equal(snapshot.data.clients,undefined);
  assert.equal(snapshot.data.invoices,undefined);
  assert.equal(await publicSnapshot(store,{type:'brief',username:'designer',token:'wrong'}),null);
  form.status='draft';
  assert.equal(await publicSnapshot(store,{type:'brief',username:'designer',token:'brf_secret'}),null);
  form.status='sent';
  assert.match(standalone,/public\.brief\.submit/);
  assert.match(api,/postAction==='public\.brief\.submit'/);
  assert.match(owner,/publishStandaloneBrief/);
  assert.match(owner,/copyStandaloneBriefLink/);
});

test('proposal draft receives ordered brief answers and keeps the brief reference',()=>{
  assert.match(owner,/function quoteCandidates\(form\)/);
  assert.match(owner,/form\.questions\|\|\[\]/);
  assert.match(owner,/selected\.forEach\(function\(label\)\{_addPropItem/);
  assert.match(owner,/document\.getElementById\('prop-brief-id'\)\.value=form\.id/);
  assert.match(owner,/ملخص البريف:/);
  const context={window:{S:{}},document:{createElement:()=>({}),head:{appendChild(){}}}};
  vm.runInNewContext(owner.replace('  document.head.appendChild(style);','  window._quoteCandidates=quoteCandidates; document.head.appendChild(style);'),context);
  const rows=context.window._quoteCandidates({questions:[{id:'section',type:'section',label:'الهوية'},{id:'a',type:'short',label:'اسم العلامة'},{id:'b',type:'checkbox',label:'المخرجات'}],answers:{a:'نورس',b:['شعار','دليل هوية']}});
  assert.deepEqual(Array.from(rows,r=>r.label),['الهوية — اسم العلامة: نورس','الهوية — المخرجات: شعار','الهوية — المخرجات: دليل هوية']);
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
  assert.match(rendered,/openBriefSheet/);
  assert.doesNotMatch(rendered,/لا توجد بريفات/);
});

test('portal opens an inline brief sheet while the owner retains a separate share link',()=>{
  assert.match(portal,/function openBriefSheet\(formId\)/);
  assert.doesNotMatch(portal,/function openBriefPage\(formId\)/);
  assert.match(portal,/id='brief-portal-overlay'/);
  assert.match(portal,/\.brief-portal-sheet \.btn-primary/);
  assert.match(owner,/نسخ رابط البوابة/);
  assert.match(owner,/نسخ رابط الاستبيان/);
  assert.match(standalone,/<header class="top-band">/);
  assert.match(standalone,/<footer class="site-footer">/);
  assert.match(standalone,/form_id:formId/);
  assert.match(standalone,/form\.status!=='sent'/);
  for(const asset of ['/JavaScript/config.js','/JavaScript/vercel_backend.js','/Assets/vendor/fonts/offline-fonts.css'])assert.ok(standalone.includes('="'+asset));
  assert.doesNotMatch(standalone,/(?:src|href)="\.\.\/(?:JavaScript|Assets)\//);
});

test('standalone brief follows owner mode, accent, and monochrome logo variant',()=>{
  const start=standalone.indexOf('function applyBriefIdentity(settings){');
  const end=standalone.indexOf('function questionHtml(',start);
  assert.ok(start>0&&end>start);
  const vars={},image={hidden:true,classList:{add(name){image.className=name;}}};
  const root={dataset:{},style:{setProperty(name,value){vars[name]=value;}}};
  const context={document:{documentElement:root,getElementById(){return image;}},safeImage:value=>value};
  vm.runInNewContext(standalone.slice(start,end),context);
  context.applyBriefIdentity({displayMode:'dark',logoDark:'black.png',logoLight:'white.png',accentColor:'#317fa8'});
  assert.equal(root.dataset.mode,'dark');
  assert.equal(image.src,'white.png');
  assert.equal(image.className,'is-monochrome');
  assert.equal(vars['--accent'],'#317fa8');
  assert.equal(vars['--accent-ink'],'#ffffff');
  context.applyBriefIdentity({displayMode:'light',logoDark:'black.png',logoLight:'white.png',toneColor:'#f4f4f4'});
  assert.equal(root.dataset.mode,'light');
  assert.equal(image.src,'black.png');
  assert.equal(vars['--bg'],'#f4f4f4');
  assert.match(standalone,/:root\[data-mode="light"\] .brand-logo\.is-monochrome\{filter:brightness\(0\)\}/);
});

test('owner can recover a brief response even when its event was previously seen',()=>{
  const start=app.indexOf('function _applyBriefSubmissionEvent(row){');
  const end=app.indexOf('async function _pollPublicInbox()',start);
  assert.ok(start>0&&end>start);
  const context={S:{brief_forms:[{id:'b1',client_id:'a',status:'sent'}],clients:[{id:'a',name:'عميل'}],support_msgs:[]},window:{},renderBriefForms(){},renderSupport(){}};
  vm.runInNewContext(app.slice(start,end),context);
  const row={id:'old-event',created_at:'2026-09-25T10:00:00Z',data:{client_id:'a',event_data:{form_id:'b1',answers:{q:'الإجابة'}}}};
  assert.equal(context._applyBriefSubmissionEvent(row),'applied');
  assert.equal(context.S.brief_forms[0].status,'submitted');
  assert.equal(context.S.brief_forms[0].answers.q,'الإجابة');
  assert.equal(context.S.support_msgs.length,1);
  assert.equal(context._applyBriefSubmissionEvent(row),'known');
  assert.equal(context.S.support_msgs.length,1);
  context.S.brief_forms.push({id:'prospect',client_id:'new-client',status:'sent'});
  const prospect={id:'prospect-event',created_at:'2026-09-25T11:00:00Z',data:{client_id:'',event_data:{form_id:'prospect',answers:{q:'عميل جديد'}}}};
  assert.equal(context._applyBriefSubmissionEvent(prospect),'applied');
  assert.equal(context.S.brief_forms[1].answers.q,'عميل جديد');
  assert.match(app,/if\(alreadySeen&&type!=='brief_submit'\)continue/);
  assert.match(app,/if\(result==='missing'\)continue/);
  assert.match(app,/public_client_portal_events'\)\.select\('id,data,created_at'\).*limit\(500\)/);
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

test('client portal answer controls inherit its dark and light surface tokens',()=>{
  assert.match(portal,/\.brief-portal-question textarea\.form-input\{min-height:120px/);
  assert.match(portal,/\.brief-portal-question \.form-input:focus\{border-color:var\(--ac\)/);
  assert.match(portal,/\.brief-portal-question select\.form-input option\{background:var\(--s2\)/);
  assert.match(portal,/body\.lm \.brief-portal-sheet\{color-scheme:light\}/);
});
