import test from 'node:test';
import assert from 'node:assert/strict';
import {studioCoreRecordCount, shouldBlockEmptyStudioOverwrite} from '../api/index.js';

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
