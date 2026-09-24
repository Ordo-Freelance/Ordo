import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../HTML/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../CSS/user-redesign.css', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../JavaScript/app.js', import.meta.url), 'utf8');
const appPatch = fs.readFileSync(new URL('../JavaScript/app_patch.js', import.meta.url), 'utf8');

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
