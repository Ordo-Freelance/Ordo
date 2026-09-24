import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync(new URL('../JavaScript/app.js', import.meta.url), 'utf8');
const admin = fs.readFileSync(new URL('../HTML/admin.html', import.meta.url), 'utf8');
const support = fs.readFileSync(new URL('../JavaScript/support_center.js', import.meta.url), 'utf8');

test('admin challenge progress is calculated from completed work and celebrated once', () => {
  const segment = app.slice(app.indexOf('function _getWeekKey(){'), app.indexOf('function renderWeeklyChallengeWidget(){'));
  const values = new Map();
  const context = {
    S:{tasks:[],transactions:[],invoices:[],clients:[],_adminChallenge:null},
    localStorage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)},
    document:{},window:{},setTimeout(){},
    _calcExpectedIncome:()=>({avg3:1000})
  };
  vm.runInNewContext(segment,context);
  const week = context._getWeekKey();
  context.S._adminChallenge = {id:'challenge-1',title:'أنهِ ٢ مهام',type:'complete',target:2,weekKey:week};
  context.S.tasks.push({done:true,doneAt:new Date().toISOString().slice(0,10)});
  context._updateWeeklyChallengeProgress();
  assert.equal(JSON.parse(values.get('_wkch_local_challenge-1')).progress,1);
  context.S.tasks.push({done:true,doneAt:new Date().toISOString().slice(0,10)});
  let celebrations=0;
  context.setTimeout=()=>{celebrations++;};
  context._updateWeeklyChallengeProgress();
  context._updateWeeklyChallengeProgress();
  assert.equal(JSON.parse(values.get('_wkch_local_challenge-1')).progress,2);
  assert.equal(celebrations,1);
});

test('admin groups messages by the original request and keeps user-side deletion separate', () => {
  const helpers = admin.slice(admin.indexOf('function adminMessageData('), admin.indexOf('function renderMessagesList('));
  const context = {};
  vm.runInNewContext(helpers,context);
  const rows = [
    {id:'reply-1',type:'support_reply',data:{request_id:'request-1'},created_at:'2026-09-24T10:00:00Z'},
    {id:'request-1',type:'support_request',data:{hidden_for_user:true},created_at:'2026-09-24T09:00:00Z'}
  ];
  const threads=context.adminConversations(rows);
  assert.equal(threads.length,1);
  assert.equal(threads[0].items.length,2);
  assert.equal(context.adminMessageData(rows[1]).hidden_for_admin,undefined);
});

test('admin keeps one support chat per user and separates challenge analytics', () => {
  const helpers = admin.slice(admin.indexOf('function adminMessageCategory('), admin.indexOf('function renderMessagesList('));
  const context = {};
  vm.runInNewContext(helpers,context);
  const rows = [
    {id:'request-a',user_id:'user-1',type:'support_request',created_at:'2026-09-24T09:00:00Z'},
    {id:'request-b',user_id:'user-1',type:'support_request',created_at:'2026-09-24T10:00:00Z'},
    {id:'reply-a',user_id:'user-1',type:'support_reply',created_at:'2026-09-24T11:00:00Z'},
    {id:'request-c',user_id:'user-2',type:'support_request',created_at:'2026-09-24T12:00:00Z'}
  ];
  const threads=context.adminConversations(rows);
  assert.equal(threads.length,2);
  assert.equal(threads.find(thread=>thread.id==='user:user-1').items.length,3);
  assert.equal(context.adminMessageCategory({type:'challenge'}),'challenges');
  assert.equal(context.adminMessageCategory({type:'admin_update'}),'updates');
  assert.equal(context.adminMessageCategory(rows[0]),'complaints');
});

test('user support center offers per-user hide and threaded replies', () => {
  assert.match(support,/hidden_for_user:true/);
  assert.match(support,/data:\{request_id:thread\.id,category:'reply'\}/);
  assert.match(support,/const allThreads=conversations\(rows\)/);
  assert.match(support,/data-support-delete/);
});
