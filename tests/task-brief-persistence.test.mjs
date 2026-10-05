import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../JavaScript/app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../HTML/index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../CSS/styles.css',import.meta.url),'utf8');

test('task brief editor mirrors text and rich media before task persistence',()=>{
  assert.match(html,/id="t-brief-value"/);
  assert.match(app,/taskQuill\.on\('text-change', syncBrief\)/);
  assert.match(app,/taskQuill\.root\.addEventListener\('input', syncBrief\)/);
  assert.match(app,/const briefContent = readTaskBriefHTML\(\)/);
  assert.match(app,/notes:v\('t-notes'\), brief:briefContent/);
});

test('opening an existing or new task resets the brief mirror deterministically',()=>{
  assert.match(app,/mirrorTaskBrief\(t\.brief\|\|'', false\)/);
  assert.match(app,/mirrorTaskBrief\('', false\)/);
});

test('the production safe-save path persists the live rich brief',()=>{
  assert.match(html,/var liveBrief = typeof window\.readTaskBriefHTML === 'function'/);
  assert.match(html,/brief:liveBrief/);
  assert.match(html,/steps:typeof window\.collectTaskSteps === 'function'/);
});

test('task details provide a dedicated large brief view',()=>{
  assert.match(app,/class="tasks-v2-brief-expand"/);
  assert.match(app,/__tasksV2ToggleBriefExpand/);
  assert.match(css,/\.modal-overlay\.brief-expanded \.tasks-v2-flow-main/);
  assert.match(css,/\.modal-overlay\.brief-expanded \.tasks-v2-flow-main \.td-brief/);
});
