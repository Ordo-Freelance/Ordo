import test from 'node:test';
import assert from 'node:assert/strict';
import { publicSnapshot, readBody } from '../api/index.js';

const studio = {
  settings: { name:'Studio', username:'studio', email:'owner@example.com', accentColor:'#10b981', accentColor2:'#047857', displayMode:'light' },
  clients: [{id:'c1',name:'One'},{id:'c2',name:'Two'}],
  tasks: [{id:'t1',client_id:'c1'},{id:'t2',client_id:'c2'}],
  services: [{id:'s1',name:'Design'}],
  transactions: [{id:'private'}],
  public_tokens: [{token:'portal-secret',entity_type:'client_portal',entity_id:'p1',client_id:'c1'}]
};
const store = {
  async publicStudioCandidates() { return [{user_id:'owner',username_index:'studio',data:studio}]; },
  async query() { return []; }
};

test('store exposes public services without private studio data', async () => {
  const result = await publicSnapshot(store, {type:'store',username:'studio'});
  assert.deepEqual(result.data.services, studio.services);
  assert.equal(result.data.clients, undefined);
  assert.equal(result.data.transactions, undefined);
  assert.equal(result.data.settings.accentColor, '#10b981');
  assert.equal(result.data.settings.accentColor2, '#047857');
  assert.equal(result.data.settings.displayMode, 'light');
});

test('portal token limits data to its client', async () => {
  const result = await publicSnapshot(store, {type:'client_portal',token:'portal-secret'});
  assert.deepEqual(result.data.clients.map(x => x.id), ['c1']);
  assert.deepEqual(result.data.tasks.map(x => x.id), ['t1']);
  assert.equal(result.data.transactions, undefined);
});

test('portal refuses an unknown token', async () => {
  assert.equal(await publicSnapshot(store, {type:'client_portal',token:'wrong'}), null);
});

test('portal recovers client identity from its linked portal record', async () => {
  const legacy = {
    ...studio,
    public_tokens:[{token:'legacy-link',entity_type:'client_portal',entity_id:'p1'}],
    client_portals:[{id:'p1',client_id:'c1',client_name:'One'}]
  };
  const legacyStore = { ...store, async publicStudioCandidates(){ return [{user_id:'owner',data:legacy}]; } };
  const result = await publicSnapshot(legacyStore,{type:'client_portal',token:'legacy-link'});
  assert.equal(result.token.client_id,'c1');
  assert.equal(result.data.clients[0].name,'One');
});

test('Vercel parsed request bodies keep their action payload', async () => {
  assert.deepEqual(await readBody({body:{action:'public.snapshot',token:'abc'}}),{action:'public.snapshot',token:'abc'});
  assert.deepEqual(await readBody({body:'{"action":"serial.activate","code":"ABC"}'}),{action:'serial.activate',code:'ABC'});
});
