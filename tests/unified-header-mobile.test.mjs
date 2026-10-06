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
  assert.match(app,/head\.querySelectorAll\('button'\)/);
  assert.match(app,/button\.classList\.contains\('btn-primary'\)/);
  assert.match(css,/\.page\.active \.page-header\{display:none!important\}/);
  assert.match(css,/\.page\.active>\.fv3-head/);
  assert.match(css,/#page-clients\.active>\.clients-tabs-bar\{display:none!important\}/);
  assert.match(app,/header-client-tabs/);
});

test('dynamic finance page uses the shared app header',()=>{
  const finance=fs.readFileSync(new URL('../JavaScript/finance_rebuild.js',import.meta.url),'utf8');
  assert.match(finance,/function syncUnifiedHeader\(\)/);
  assert.match(finance,/page\.innerHTML = tabs\(\) \+ collectionAlert\(\) \+ body\(\)/);
  assert.doesNotMatch(finance,/page\.innerHTML = header\(\) \+ tabs\(\)/);
});

test('task page moves its controls and compact search into the app header',()=>{
  assert.match(app,/tasks-header-search/);
  assert.match(app,/__tasksV2ToggleHeaderSearch/);
  assert.match(app,/openTasksArchivePage/);
  assert.match(app,/tasks-header-new/);
  assert.match(app,/tasksPageActive&&headerTools/);
  assert.doesNotMatch(app,/tasks-v2-title">المهام والتاسكات/);
  assert.doesNotMatch(app,/tasks-v2-search-block">/);
});

test('mobile layer reduces density while retaining all three task views',()=>{
  assert.match(css,/@media\(max-width:720px\)/);
  assert.match(css,/scroll-snap-type:x mandatory/);
  assert.match(css,/grid-auto-columns:minmax\(250px,88vw\)/);
  assert.match(css,/\.tasks-v2-list-head\{display:none!important\}/);
  assert.match(css,/\.wf-toolbar\{overflow-x:auto/);
  assert.match(html,/id="header-mobile-more"/);
  assert.match(app,/function toggleMobileHeaderTools\(event\)/);
  assert.match(css,/body\.mobile-header-tools-open \.header-page-tools:not\(:empty\)\{display:grid!important\}/);
  assert.match(css,/max-height:92dvh!important/);
  assert.match(css,/#_dash-stats-inner>\.ordo-home-stat-card\{flex:0 0 158px!important/);
  assert.match(css,/\.invoices-section-tabs\{gap:7px!important/);
});
