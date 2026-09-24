import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../HTML/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../CSS/user-redesign.css', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../JavaScript/app.js', import.meta.url), 'utf8');
const appPatch = fs.readFileSync(new URL('../JavaScript/app_patch.js', import.meta.url), 'utf8');
const settingsCss = fs.readFileSync(new URL('../CSS/settings-workspace.css', import.meta.url), 'utf8');
const layoutCss = fs.readFileSync(new URL('../CSS/styles.css', import.meta.url), 'utf8');
const chatCss = fs.readFileSync(new URL('../CSS/portal_chat.css', import.meta.url), 'utf8');

test('mobile viewport keeps the last page controls above the bottom navigation', () => {
  assert.match(layoutCss, /\.app-shell\s*\{[^}]*height:\s*100dvh/s);
  assert.match(layoutCss, /\.app-body\s*\{[^}]*height:\s*100%/s);
  assert.match(layoutCss, /padding-bottom:\s*calc\(84px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(chatCss, /\.support-conversation-pane\{min-height:320px;max-height:min\(55dvh,520px\)\}/);
});

test('admin coming-soon sections open an informational screen instead of package upsell', () => {
  assert.match(appPatch, /_showPageLock\(match\[1\], item, 'coming'\)/);
  assert.match(appPatch, /_showPageLock\(id, arguments\[1\], 'coming'\)/);
  assert.match(app, /reason === 'platform' \|\| reason === 'coming'/);
  assert.match(app, /هذه الميزة متاحة قريباً/);
});

test('user sidebar keeps the existing group order and opens only one group', () => {
  const script = html.slice(html.indexOf('(function organizeSidebar(){'), html.indexOf('})();', html.indexOf('(function organizeSidebar(){')) + 5);
  const keys = [...script.matchAll(/group\('([^']+)'/g)].map(match => match[1]);
  assert.deepEqual(keys, ['projects', 'clients', 'finance', 'team', 'system', 'settings']);

  const helpers = script.slice(script.indexOf('function setGroupOpen('), script.indexOf('function group('));
  const sections = ['projects', 'finance', 'settings'].map(key => {
    const attributes = {};
    const body = { inert: true };
    const classes = new Set();
    return {
      dataset: { group: key },
      attributes, body, classes,
      querySelector(selector) {
        return selector === '.sidebar-group-toggle'
          ? { setAttribute: (name, value) => { attributes[name] = value; } }
          : body;
      },
      classList: { toggle: (name, open) => open ? classes.add(name) : classes.delete(name) }
    };
  });
  const saved = {};
  const sidebar = { querySelectorAll: () => sections };
  const localStorage = { setItem: () => {} };
  const context = vm.createContext({ saved, sidebar, localStorage });
  vm.runInContext(`${helpers}\nopenOnly(sidebar.querySelectorAll()[0]); openOnly(sidebar.querySelectorAll()[1]);`, context);
  assert.deepEqual(sections.map(section => section.classes.has('is-open')), [false, true, false]);
  assert.deepEqual(sections.map(section => section.body.inert), [true, false, true]);
  assert.deepEqual(sections.map(section => section.attributes['aria-expanded']), ['false', 'true', 'false']);
});

test('user visual layer covers dark, light, modal, kanban and compact layouts', () => {
  assert.match(html, /CSS\/user-redesign\.css\?v=/);
  for (const selector of ['body.app-loaded:not(.light-mode)', 'body.app-loaded.light-mode', '.modal-overlay', '#page-tasks .tasks-v2-card', '@media (max-width: 700px)']) {
    assert.ok(css.includes(selector), `missing ${selector}`);
  }
});

test('reference screens retain their controls while receiving readable layouts', () => {
  for (const selector of [
    '#page-clients #clients-grid', '#modal-client-profile #profile-tabs',
    '#modal-task #_tt-kind-bar', '#modal-task #t-brief-editor',
    '#page-tasks .tasks-v2-board', '#page-tasks .tasks-v2-card',
    '#modal-task-detail .tasks-v2-detail-grid'
  ]) assert.ok(css.includes(selector), `missing ${selector}`);
  for (const control of ['_clients-add-btn','profile-tabs','t-title','t-client','t-deadline','td-body']) {
    assert.ok(html.includes(control), `missing control ${control}`);
  }
  assert.ok(app.includes('tasks-v2-shell'));
});

test('client profile shows identity once and keeps one working portal action', () => {
  const profile = app.slice(app.indexOf('function openClientProfile(id){'), app.indexOf('function switchProfileTab(', app.indexOf('function openClientProfile(id){')));
  const overview = app.slice(app.indexOf("if(tab === 'overview'){", app.indexOf('function _renderProfileTab(')), app.indexOf("if(tab==='overview'){", app.indexOf('function _renderProfileTab(')));
  assert.match(profile, /_showClientPortalLink/);
  assert.doesNotMatch(profile, /openClientPortal\(\$\{c\.id\}\)/);
  assert.doesNotMatch(overview, /client-simple-avatar|client-simple-main/);
  assert.match(overview, /client-profile-context/);
  assert.match(overview, /\(c\.notes\?'<section/);
});

test('task form keeps secondary fields available without crowding a new task', () => {
  assert.match(html, /<details class="task-form-optional" id="task-color-options">/);
  assert.match(html, /<details class="task-form-optional" id="task-extra-options">/);
  assert.match(app, /extraOptions\.open=!!id/);
  for (const id of ['t-color', 't-worker-type', 't-notes', 't-steps-list', 't-brief-editor']) {
    assert.ok(html.includes(`id="${id}"`), `missing ${id}`);
  }
  assert.match(app, /sortedTasks\.slice\(0,3\)/);
});

test('settings use grouped navigation without moving existing tab controls', () => {
  assert.match(html, /CSS\/settings-workspace\.css\?v=/);
  assert.match(html, /class="page settings-v3" id="page-settings"/);
  for (const id of ['general', 'appearance', 'team-specs', 'tasks', 'finance', 'currencies', 'whatsapp', 'features', 'danger']) {
    assert.ok(html.includes(`id="stab-${id}"`), `missing settings tab ${id}`);
    assert.ok(html.includes(`id="stabp-${id}"`), `missing settings panel ${id}`);
  }
  assert.match(settingsCss, /grid-template-areas:/);
  assert.match(app, /storageCard\.hidden = tab !== 'general'/);
  assert.doesNotMatch(app, /tabs\.appendChild\(btn\)/);
});
