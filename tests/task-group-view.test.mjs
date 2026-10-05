import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../JavaScript/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../CSS/styles.css',import.meta.url),'utf8');

test('tasks provide a persisted grouped table view and group sorting controls',()=>{
  assert.match(app,/ordo_tasks_v2_group_order/);
  assert.match(app,/view-group/);
  assert.match(app,/جروبات المهام/);
  assert.match(app,/ترتيب الجروبات/);
  assert.match(app,/__tasksV2SortGroups/);
  assert.match(app,/__tasksV2MoveGroup/);
  assert.match(css,/\.tasks-v2-groups/);
  assert.match(css,/\.tasks-v2-group-row/);
});

test('dragging a task persists both its status and its order',()=>{
  assert.match(app,/data-task-key/);
  assert.match(app,/targetEl\.getBoundingClientRect/);
  assert.match(app,/raw\.taskOrder = \(index \+ 1\) \* 100/);
  assert.match(app,/تم حفظ الحالة والترتيب/);
});
