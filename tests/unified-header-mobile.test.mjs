import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('../HTML/index.html',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../JavaScript/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../CSS/styles.css',import.meta.url),'utf8');

test('one adaptive app header owns page titles and page actions',()=>{
  assert.match(html,/id="header-page-tools"/);
  assert.doesNotMatch(html,/id="_header-studio-name"/);
  assert.match(app,/nav&&nav\.textContent\.trim\(\)/);
  assert.match(app,/unified-header-tool/);
  assert.match(css,/\.page\.active>\.page-header\{display:none!important\}/);
});

test('task page moves its controls and compact search into the app header',()=>{
  assert.match(app,/tasks-header-search/);
  assert.match(app,/__tasksV2ToggleHeaderSearch/);
  assert.match(app,/openTasksArchivePage/);
  assert.match(app,/tasks-header-new/);
  assert.doesNotMatch(app,/tasks-v2-title">المهام والتاسكات/);
  assert.doesNotMatch(app,/tasks-v2-search-block">/);
});

test('mobile layer reduces density while retaining all three task views',()=>{
  assert.match(css,/@media\(max-width:720px\)/);
  assert.match(css,/scroll-snap-type:x mandatory/);
  assert.match(css,/grid-auto-columns:minmax\(250px,88vw\)/);
  assert.match(css,/\.tasks-v2-list-head\{display:none!important\}/);
  assert.match(css,/\.wf-toolbar\{overflow-x:auto/);
});
