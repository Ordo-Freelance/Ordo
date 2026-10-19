import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../JavaScript/app.js',import.meta.url),'utf8');
const portal=fs.readFileSync(new URL('../HTML/client-portal.html',import.meta.url),'utf8');
const styles=fs.readFileSync(new URL('../CSS/styles.css',import.meta.url),'utf8');
const errorPage=fs.readFileSync(new URL('../HTML/error.html',import.meta.url),'utf8');
const vercel=fs.readFileSync(new URL('../vercel.json',import.meta.url),'utf8');

test('project tasks open the same unified task detail used by regular tasks',()=>{
  assert.match(app,/window\.openProjTaskDetail=function\(taskId,projectId\)/);
  assert.match(app,/window\.openUnifiedTaskDetail\('p_'\+String\(taskId\)\)/);
  assert.match(app,/window\.openProjTaskModal = function\(projId, taskId, defaultStatus\)[\s\S]*?return openTaskModal\(taskId\|\|''/);
  assert.match(app,/saveUnifiedTaskDeliveryLink/);
});

test('the regular task editor can link, move and account for project tasks',()=>{
  assert.match(app,/fillUnifiedTaskProjectSelect\(explicitProject\)/);
  assert.match(app,/const projectId=\(document\.getElementById\('t-project'\)/);
  assert.match(app,/S\.tasks=\(S\.tasks\|\|\[\]\)\.filter/);
  assert.match(app,/S\.project_tasks=\(S\.project_tasks\|\|\[\]\)\.filter/);
  assert.match(app,/linkedProjTaskId:opts\.projectId\?opts\.taskId\|\|null:null/);
});

test('client project tasks expose task delivery, receipt and rating',()=>{
  assert.match(portal,/استلام المهمة/);
  assert.match(portal,/قيّم المهمة/);
  assert.match(portal,/تسليم المهمة جاهز/);
  assert.match(portal,/function _portalTaskDeliveryUrl\(task\)/);
  assert.match(portal,/function openPortalDeliveryPreview\(taskId\)/);
  assert.match(portal,/معاينة التسليم داخل البوابة/);
  assert.match(portal,/const canReview=_portalTaskCanReview\(t\)/);
  assert.match(portal,/portalDrivePreviewUrl\(source\)/);
  assert.match(portal,/portal-month-task-card/);
  assert.match(portal,/onclick="openTask/);
});

test('monthly project workspace has polished cards and technical error pages',()=>{
  assert.match(styles,/Project workspace polish v15/);
  assert.match(styles,/\.rec-v9-month-card:before/);
  assert.match(errorPage,/صفحة الأعطال الفنية/);
  assert.match(errorPage,/'505'/);
  assert.match(vercel,/"source": "\/500"/);
  assert.match(vercel,/"source": "\/505"/);
});
