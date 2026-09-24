import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app=fs.readFileSync(new URL('../JavaScript/app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../HTML/index.html',import.meta.url),'utf8');

test('page navigation renders only the visible page and does not reapply platform theme', () => {
  const page=app.slice(app.indexOf('function showPage(id,el){'),app.indexOf('function _hideLock(){',app.indexOf('function showPage(id,el){')));
  assert.match(page,/renderVisiblePage\(id\)/);
  assert.doesNotMatch(page,/\brenderAll\(\)|applyPlatformConfig\(\)/);
  const visible=app.slice(app.indexOf('function renderVisiblePage(id){'),app.indexOf('function renderAll(){',app.indexOf('function renderVisiblePage(id){')));
  const calls=[];
  const context={
    updateDash:()=>calls.push('dashboard'),renderDashTeamPay(){},renderDashKanbanMini(){},renderDashMeetings(){},renderSalaryReminders(){},renderFollowupReminders(){},
    renderTasks:()=>calls.push('tasks'),renderClients:()=>calls.push('clients'),renderFinance:()=>calls.push('finance'),
    renderAll:()=>calls.push('all'),_updateNavBtns(){},_updateInboxBadge(){},_updateTeamInviteBadge(){}
  };
  vm.runInNewContext(visible,context);
  context.renderVisiblePage('tasks');
  assert.deepEqual(calls,['tasks']);
});

test('text repair observer processes inserted nodes, not the whole document', () => {
  const observer=html.slice(html.indexOf('if(!window.__ordoMojibakeObserver){'),html.indexOf('var oldSwitch = window.switchSettingsTab;',html.indexOf('if(!window.__ordoMojibakeObserver){')));
  assert.match(observer,/m\.addedNodes/);
  assert.doesNotMatch(observer,/repairMojibakeText\(document\.body\)/);
});
