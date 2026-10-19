import test from 'node:test';
import assert from 'node:assert/strict';
import {studioCoreRecordCount, shouldBlockEmptyStudioOverwrite, studioOverwriteRisk} from '../api/index.js';

test('server counts all important business collections', () => {
  assert.equal(studioCoreRecordCount({tasks:[{}],services:[{}],archivedTasks:[{}]}), 3);
  assert.equal(studioCoreRecordCount(JSON.stringify({clients:[{}],workflow_boards:[{}]})), 2);
  assert.equal(studioCoreRecordCount({reviews:[{}],notifications:[{}]}), 0);
});

test('server blocks an accidental empty overwrite for every account', () => {
  assert.equal(shouldBlockEmptyStudioOverwrite({clients:[{id:'c1'}]}, {clients:[]}), true);
  assert.equal(shouldBlockEmptyStudioOverwrite({services:[{id:'s1'}]}, {services:[]}), true);
});

test('server allows first saves, non-empty saves and confirmed clearing', () => {
  assert.equal(shouldBlockEmptyStudioOverwrite({}, {tasks:[]}), false);
  assert.equal(shouldBlockEmptyStudioOverwrite({tasks:[{id:'t1'}]}, {tasks:[{id:'t2'}]}), false);
  assert.equal(shouldBlockEmptyStudioOverwrite({tasks:[{id:'t1'}]}, {tasks:[]}, true), false);
});

test('server blocks a whole collection or a material account drop', () => {
  assert.equal(
    studioOverwriteRisk({tasks:[{id:1}],services:[{id:2}]}, {tasks:[{id:1}],services:[]}).code,
    'collection_drop_blocked'
  );
  assert.equal(
    studioOverwriteRisk({tasks:[1,2,3,4],clients:[1,2,3,4]}, {tasks:[1,2],clients:[1]}).code,
    'material_data_drop_blocked'
  );
});

test('server protects identity assets and allows an explicitly confirmed change', () => {
  const before={settings:{logo:'data:image/png;base64,abc'},tasks:[{id:1}]};
  const after={settings:{logo:''},tasks:[{id:1}]};
  assert.equal(studioOverwriteRisk(before,after).code,'identity_data_drop_blocked');
  assert.equal(studioOverwriteRisk(before,after,true),null);
});
