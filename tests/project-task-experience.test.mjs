import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../JavaScript/app.js',import.meta.url),'utf8');
const patch=fs.readFileSync(new URL('../JavaScript/app_patch.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../HTML/index.html',import.meta.url),'utf8');
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
  assert.match(app,/window\.openTaskModal = function\(id, context\)[\s\S]*?var args = Array\.prototype\.slice\.call\(arguments\)[\s\S]*?previousOpenTaskModal\.apply\(this, args\)/);
  assert.match(index,/if\(typeof window\.saveTask === 'function'\)[\s\S]*?window\.saveTask\(\);[\s\S]*?return false;/);
  assert.match(patch,/var beforeProjectIds = \(S\(\)\.project_tasks \|\| \[\]\)/);
  assert.match(patch,/if\(!saved && !projectId\) saved = fallbackSaveTask/);
  assert.match(index,/id="t-project-linker"/);
  assert.match(index,/id="t-project-summary-title"/);
  assert.match(app,/projectLinker\.open=!!explicitProject/);
});

test('task composer is compact, fully configurable and uses the correct expand control',()=>{
  assert.match(index,/class="modal task-create-modal"/);
  assert.match(index,/data-modal-expand title="توسيع"/);
  assert.match(app,/overlay\.querySelector\('\[data-modal-expand\]'\)/);
  assert.match(app,/m\.querySelector\('\[data-modal-expand\]'\)/);
  for(const id of ['_tt-kind-bar','t-title-client-row','t-client-visibility-wrap','t-project-linker','task-color-options','t-value-row','t-worker-section','t-notes-row-wrap','t-steps-section-wrap','t-brief-section-wrap','task-inv-opt']){
    assert.match(patch,new RegExp("id:'"+id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+"'"));
  }
  assert.match(styles,/Compact, configurable task composer/);
  assert.match(styles,/\.task-project-linker\.is-linked/);
  assert.match(styles,/#modal-task #_tt-kind-bar\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test('project table and kanban reuse the main task experience and remain scoped',()=>{
  assert.match(app,/window\.renderProjectTasksV2 = function\(projectId, view\)/);
  assert.match(app,/!!t\._isProjectTask && String\(t\.project_id \|\| t\.projectId \|\| ''\) === String\(projectId \|\| ''\)/);
  assert.match(app,/return window\.renderProjectTasksV2\(proj\.id, tab === 'kanban' \? 'kanban' : 'list'\)/);
  assert.match(app,/tasks-v2-project-scope/);
  assert.match(app,/switchProjTab\(&quot;kanban&quot;\)/);
  assert.match(app,/switchProjTab\(&quot;table&quot;\)/);
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
  assert.match(portal,/function portalVideoPreview\(value\)/);
  assert.match(portal,/youtube\.com\/embed/);
  assert.match(portal,/<video class="portal-pdf-frame"/);
  assert.match(portal,/portal-month-task-card/);
  assert.match(portal,/onclick="openTask/);
  assert.match(app,/_appendPortalTaskActivity\(task,row\.id,'client_received'/);
  assert.match(app,/_queuePortalTaskNotification\(row\.id,'طلب تعديل جديد'/);
  assert.match(app,/سجل حركة المهمة/);
});

test('project cards support a persisted cover image URL',()=>{
  assert.match(app,/id="proj-cover-url"/);
  assert.match(app,/coverUrl:\/\^https:/);
  assert.match(app,/class="project-studio-cover/);
  assert.match(styles,/\.project-studio-cover img/);
  assert.match(styles,/\.project-cover-preview\.has-image/);
});

test('monthly project workspace has polished cards and technical error pages',()=>{
  assert.match(styles,/Project workspace polish v15/);
  assert.match(styles,/\.rec-v9-month-card:before/);
  assert.match(errorPage,/صفحة الأعطال الفنية/);
  assert.match(errorPage,/'505'/);
  assert.match(vercel,/"source": "\/500"/);
  assert.match(vercel,/"source": "\/505"/);
});
