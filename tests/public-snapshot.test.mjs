import test from 'node:test';
import assert from 'node:assert/strict';
import { publicSnapshot, deleteOwnReview, readBody } from '../api/index.js';

const studio = {
  settings: { name:'Studio', username:'studio', email:'owner@example.com', accentColor:'#10b981', accentColor2:'#047857', displayMode:'light', logoDark:'dark-logo.png', logoLight:'light-logo.png' },
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
  assert.equal(result.data.settings.logoDark, 'dark-logo.png');
  assert.equal(result.data.settings.logoLight, 'light-logo.png');
});

test('portal token limits data to its client', async () => {
  const result = await publicSnapshot(store, {type:'client_portal',token:'portal-secret'});
  assert.deepEqual(result.data.clients.map(x => x.id), ['c1']);
  assert.deepEqual(result.data.tasks.map(x => x.id), ['t1']);
  assert.equal(result.data.transactions, undefined);
});

test('aggregated portal limits data and finances to selected clients', async () => {
  const multi = {
    settings:{name:'Studio'},
    clients:[{id:'c1',name:'One'},{id:'c2',name:'Two'},{id:'c3',name:'Hidden'}],
    projects:[{id:'p1',client_id:'c1'},{id:'p2',client_id:'c2'},{id:'p3',client_id:'c3'}],
    tasks:[{id:'t1',client_id:'c1'},{id:'t2',project_id:'p2'},{id:'t3',client_id:'c3'}],
    invoices:[{id:'i1',client_id:'c1'},{id:'i3',client_id:'c3'}],
    transactions:[{id:'x1',client_id:'c2',amount:10},{id:'x3',client_id:'c3',amount:99}],
    client_portals:[{id:'fp1',portal_kind:'freelancer',scope_mode:'selected',client_ids:['c1','c2']}],
    public_tokens:[{token:'multi',entity_type:'client_portal',entity_id:'fp1',client_ids:['c1','c2'],portal_kind:'freelancer'}]
  };
  const multiStore = {...store, async publicStudioCandidates(){return [{user_id:'owner',data:multi}];}};
  const result = await publicSnapshot(multiStore,{type:'client_portal',token:'multi'});
  assert.deepEqual(result.data.clients.map(x=>x.id),['c1','c2']);
  assert.deepEqual(result.data.projects.map(x=>x.id),['p1','p2']);
  assert.deepEqual(result.data.tasks.map(x=>x.id),['t1','t2']);
  assert.deepEqual(result.data.transactions.map(x=>x.id),['x1']);
  assert.equal(JSON.stringify(result.data).includes('c3'),false);
});

test('portal refuses an unknown token', async () => {
  assert.equal(await publicSnapshot(store, {type:'client_portal',token:'wrong'}), null);
});

test('deleting a review removes every owned source without touching another owner', async () => {
  const rows = {
    studio_data:[{user_id:'owner',data:{reviews:[{id:'r1'},{id:'r2'}]}},{user_id:'other',data:{reviews:[{id:'r1'}]}}],
    public_reviews:[{id:'p1',user_id:'owner',data:{review_data:{id:'r1'}}},{id:'p2',user_id:'other',data:{review_data:{id:'r1'}}}],
    review_queue:[{id:'q1',user_id:'owner',data:{review_json:{id:'r1'}}}]
  };
  const reviewStore = {async query(table,input){
    const match = row => (input.filters || []).every(filter => String(row[filter.column]) === String(filter.value));
    if(input.op === 'select') { const found=rows[table].filter(match); return input.single ? found[0] || null : found; }
    if(input.op === 'update') { rows[table].filter(match).forEach(row => Object.assign(row,input.payload)); return []; }
    if(input.op === 'delete') { rows[table]=rows[table].filter(row => !match(row)); return []; }
  }};
  assert.equal(await deleteOwnReview(reviewStore,'owner','r1'),true);
  assert.deepEqual(rows.studio_data[0].data.reviews.map(review => review.id),['r2']);
  assert.deepEqual(rows.studio_data[1].data.reviews.map(review => review.id),['r1']);
  assert.deepEqual(rows.public_reviews.map(row => row.id),['p2']);
  assert.equal(rows.review_queue.length,0);
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
