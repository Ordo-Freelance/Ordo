import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../JavaScript/support_center.js', import.meta.url), 'utf8');

test('support center loads only the signed-in user and separates updates from messages', async () => {
  let handler;
  const grid = { style: {}, innerHTML: '', addEventListener(_name, fn) { handler = fn; } };
  const badge = { style: {}, textContent: '' };
  const page = { classList: { contains() { return false; } } };
  const filters = [];
  const query = {
    select() { return this; },
    eq(key, value) { filters.push([key,value]); return this; },
    order() { return this; },
    async limit() { return {data:[
      {id:'update-1',user_id:'owner-1',title:'ميزة جديدة',body:'تعليمات',type:'admin_update',read:false,created_at:'2026-09-23T00:00:00Z'},
      {id:'challenge-1',user_id:'owner-1',title:'تحدي الأسبوع',body:'أنجز ثلاث مهام',type:'challenge',read:false,created_at:'2026-09-23T00:00:00Z'},
      {id:'direct-1',user_id:'owner-1',title:'رسالة خاصة',body:'تعليمات',type:'direct_message',read:false,created_at:'2026-09-23T00:00:00Z'},
      {id:'message-1',user_id:'owner-1',title:'من الإدارة',body:'رسالة',type:'message',read:false,created_at:'2026-09-23T00:00:00Z'}
    ],error:null}; }
  };
  const document = { getElementById(id) { return {'support-grid':grid,'support-badge':badge,'page-support':page}[id] || null; } };
  const window = { showPage() {} };
  const context = { document, window, _supaUserId:'owner-1', supa:{from(table) { assert.equal(table,'user_notifications'); return query; }}, URL };
  vm.runInNewContext(source,context);
  context.window.showPage('support');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(filters,[['user_id','owner-1']]);
  assert.match(grid.innerHTML,/من الإدارة/);
  assert.match(grid.innerHTML,/رسالة خاصة/);
  assert.doesNotMatch(grid.innerHTML,/ميزة جديدة<\/strong>/);
  handler({target:{closest(selector) { return selector === '[data-support-tab]' ? {dataset:{supportTab:'updates'}} : null; }}});
  assert.match(grid.innerHTML,/ميزة جديدة/);
  assert.doesNotMatch(grid.innerHTML,/تحدي الأسبوع<\/strong>/);
  assert.doesNotMatch(grid.innerHTML,/من الإدارة<\/strong>/);
  handler({target:{closest(selector) { return selector === '[data-support-tab]' ? {dataset:{supportTab:'challenges'}} : null; }}});
  assert.match(grid.innerHTML,/تحدي الأسبوع/);
  assert.match(grid.innerHTML,/role="progressbar"/);
});

test('incoming admin items open one popup per user and are not repeated after refresh', () => {
  const values = new Map();
  let popups = 0;
  const document = {
    getElementById() { return null; },
    createElement() { return {className:'',style:{},innerHTML:'',addEventListener(){},remove(){}}; },
    body:{appendChild(){popups++;}}
  };
  const context = {document,window:{},_supaUserId:'owner-1',localStorage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)},URL};
  vm.runInNewContext(source,context);
  const rows = [{id:'challenge-1',type:'challenge',title:'تحدي',body:'أنجز مهمة',read:false}];
  context.window._showAdminIncomingPopup(rows);
  context.window._showAdminIncomingPopup(rows);
  assert.equal(popups,1);
  assert.match(values.get('_admin_popup_seen_owner-1'),/challenge-1/);
});

test('user support inbox offers a side-by-side conversation pane',()=>{
  assert.match(source,/support-conversation-layout/);
  assert.match(source,/support-conversation-pane/);
  assert.match(source,/data-support-reply/);
});
