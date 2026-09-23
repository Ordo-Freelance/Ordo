import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync(new URL('../JavaScript/app.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../HTML/index.html', import.meta.url), 'utf8');

test('local state hot paths never use synchronous network requests', () => {
  const source = app.slice(app.indexOf('function _readBestLocalState(){'), app.indexOf('function cloudLoad(){'));
  assert.doesNotMatch(source, /new XMLHttpRequest|\.open\(['"](?:GET|POST)['"],['"]\/api\/local-state/);
});

test('saving state writes one account-scoped snapshot, without reviving stale fallback data', () => {
  const source = app.slice(app.indexOf('function _localStateKeys(){'), app.indexOf('function cloudLoad(){'));
  const values = new Map();
  const writes = [];
  const context = {
    S:{tasks:[],settings:{}},
    getSession:()=>({id:'user-a'}),
    userKey:()=> 'studioOS_v3_user-a',
    localStorage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>{writes.push(key);values.set(key,value);}},
    window:{},migrateSFields(){},console
  };
  vm.runInNewContext(source,context);
  values.set('ordo_local_snapshot_v1',JSON.stringify({tasks:[{id:1}],settings:{}}));
  context.lsSave();
  assert.deepEqual(writes,['studioOS_v3_user-a']);
  assert.equal(context._readBestLocalState().tasks.length,0);
});

test('a kanban status move updates only task and dashboard views', () => {
  const source = app.slice(app.indexOf('function kbDrop(ev){'), app.indexOf('function kbDropDone(ev){'));
  const calls = [];
  const task = {id:1,status:'new',done:false};
  const context = {
    S:{tasks:[task],customStatuses:[]},
    document:{querySelectorAll:()=>[]},
    lsSave:()=>calls.push('save'),
    refreshAfterKanbanMove:()=>calls.push('refresh'),
    renderAll:()=>calls.push('full-render'),
    showMiniNotif:()=>{},
    _markTaskCompleted:()=>{}
  };
  vm.runInNewContext('let _kbDragId = 1;\n' + source, context);
  context.kbDrop({preventDefault(){},currentTarget:{dataset:{status:'progress'},classList:{remove(){}}},dataTransfer:{getData:()=>''}});
  assert.equal(task.status,'progress');
  assert.deepEqual(calls,['save','refresh']);
});

test('initial theme stays in loading state until the visible page is ready', () => {
  assert.match(html, /<body style="visibility:hidden">/);
  assert.doesNotMatch(html, /document\.body\.classList\.toggle\('light-mode',[^<]+remove\('theme-loading'\)/);
  assert.match(html, /window\._showApp = function\(\)[\s\S]*?document\.documentElement\.classList\.remove\('theme-loading'\)/);
});
