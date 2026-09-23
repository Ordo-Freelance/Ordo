import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../HTML/admin.html', import.meta.url), 'utf8');
const availability = source.slice(source.indexOf('function serialIsAvailable('), source.indexOf('function setSerialTab('));
const assignment = source.slice(source.indexOf('async function assignSerial()'), source.indexOf('// ══════════════════════════════════════════════════\n//  PLANS', source.indexOf('async function assignSerial()')));

function setup(savedRow) {
  const serial = { id: 'serial-1', _supaId: 'serial-1', code: 'TEST-CODE', status: 'unused', userId: null, activatedAt: null, expiresAt: null, billing: 'monthly' };
  const button = { disabled: false, textContent: '' };
  const notices = [];
  const calls = [];
  const query = {
    update(payload) { calls.push(['update', payload]); return this; },
    eq(key, value) { calls.push(['eq', key, value]); return this; },
    is(key, value) { calls.push(['is', key, value]); return this; },
    select() { return this; },
    async maybeSingle() { return { data: savedRow, error: null }; }
  };
  const context = {
    SERIALS: [serial], ALL_STUDIO_DATA: { 'user-1': { parsed: { settings: { name: 'Test User' } } } },
    document: { getElementById(id) { return id === 'assign-submit-btn' ? button : { value: id === 'assign-user' ? 'user-1' : 'serial-1' }; } },
    supa: { from(table) { assert.equal(table, 'serial_keys'); return query; } },
    _serialToSupaPayload: s => ({ user_id: s.userId, status: s.status }),
    _supaRowToSerial: row => ({ ...row, userId: row.user_id, activatedAt: row.activated_at }),
    syncSerialsFromSupabase: async () => {}, renderUsersTable() {}, renderSerials() {}, updateDashStats() {},
    closeModal() {}, logActivity() {}, toast: message => notices.push(message)
  };
  vm.createContext(context);
  vm.runInContext(availability + assignment, context);
  return { context, serial, calls, notices, button };
}

test('serial availability excludes already assigned or activated codes', () => {
  const { context } = setup(null);
  assert.equal(context.serialIsAvailable({ status: 'unused', userId: null }), true);
  assert.equal(context.serialIsAvailable({ status: 'active', userId: null }), false);
  assert.equal(context.serialIsAvailable({ status: 'unused', userId: 'user-1' }), false);
  assert.equal(context.serialIsAvailable({ status: 'unused', activatedAt: '2026-01-01', userId: null }), false);
});

test('assignment requires an unused, unassigned database row', async () => {
  const { context, calls, notices } = setup(null);
  await context.assignSerial();
  assert.deepEqual(calls.filter(call => call[0] === 'eq'), [['eq', 'id', 'serial-1'], ['eq', 'status', 'unused']]);
  assert.deepEqual(calls.filter(call => call[0] === 'is'), [['is', 'user_id', null]]);
  assert.equal(context.SERIALS[0].userId, null);
  assert.match(notices.at(-1), /تعذر تعيين/);
});

test('confirmed assignment updates the serial and reports success', async () => {
  const { context, notices } = setup({ id: 'serial-1', code: 'TEST-CODE', status: 'active', user_id: 'user-1', activated_at: '2026-01-01' });
  await context.assignSerial();
  assert.equal(context.SERIALS[0].userId, 'user-1');
  assert.match(notices.at(-1), /تم تعيين/);
});

test('opening an assignment modal moves it outside a hidden parent overlay', () => {
  const modalSource = source.slice(source.indexOf('function openModal('), source.indexOf('function closeModal('));
  const body = { appendChild(element) { element.parentElement = body; } };
  const hiddenOverlay = { classList: { contains(name) { return name === 'modal-overlay'; } } };
  const added = [];
  const modal = { parentElement: hiddenOverlay, classList: { add(name) { added.push(name); } } };
  const context = { document: { body, getElementById() { return modal; } } };
  vm.runInNewContext(modalSource, context);
  context.openModal('modal-assign-serial');
  assert.equal(modal.parentElement, body);
  assert.deepEqual(added, ['open']);
});
