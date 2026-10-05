import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../JavaScript/app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../HTML/index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../CSS/styles.css',import.meta.url),'utf8');

test('experimental workflow board is reachable and persisted',()=>{
  assert.match(html,/id="nav-workflow-board"/);
  assert.match(html,/id="page-workflow-board"/);
  assert.match(app,/workflow_boards/);
  assert.match(app,/window\.renderWorkflowBoard/);
  assert.match(app,/workflowBoardIds/);
  assert.match(app,/cloudSave\(S\)/);
});

test('workflow board supports linked tasks, notes, todos, images, links and connections',()=>{
  assert.match(app,/allWorkflowTasks/);
  assert.match(app,/workflowAddTask/);
  assert.match(app,/workflowAddText/);
  assert.match(app,/workflowAddTodo/);
  assert.match(app,/workflowImageSelected/);
  assert.match(app,/workflowAddLink/);
  assert.match(app,/workflowConnectNode/);
  assert.match(app,/workflowNodeDragStart/);
  assert.match(css,/\.wf-canvas/);
  assert.match(css,/\.wf-node/);
  assert.match(css,/\.wf-links/);
});
