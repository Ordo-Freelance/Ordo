import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const portal = fs.readFileSync(new URL('../HTML/client-portal.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../JavaScript/app.js', import.meta.url), 'utf8');
const form = fs.readFileSync(new URL('../HTML/index.html', import.meta.url), 'utf8');

function currencyContext(client, projects = [], tasks = []) {
  const start = portal.indexOf('function _curMeta(');
  const end = portal.indexOf('function _clientTransactions(', start);
  const context = {
    _settings: { base_currency_code: 'EGP' },
    _ud: { clients: client ? [client] : [] },
    _clientId: client?.id,
    _clientProjects: projects,
    _clientTasks: tasks,
    _clientInvoices: [],
  };
  vm.runInNewContext(portal.slice(start, end), context);
  return context;
}

test('client currency controls zero balances and unlabelled portal amounts', () => {
  const ctx = currencyContext({ id: 'c1', currency_code: 'SAR' });
  assert.equal(ctx._preferredCurrency().code, 'SAR');
  assert.equal(ctx._money(0), '0 ر.س');
  assert.match(ctx._currencyRows({}), /0 ر\.س/);
  assert.equal(ctx._curMeta('ر.س').code, 'SAR');
});

test('project currency is used for linked items without an explicit currency', () => {
  const ctx = currencyContext({ id: 'c1' }, [{ id: 'p1', budgetCurrency: 'ر.س' }]);
  assert.equal(ctx._entityCur({ project_id: 'p1', value: 500 }).code, 'SAR');
  assert.equal(ctx._money(500, { project_id: 'p1' }), '500 ر.س');
  assert.equal(ctx._money(500, { project_id: 'p1', currency: 'USD' }), '500 $');
});

test('client form persists a separate currency selection', () => {
  assert.match(form, /id="c-currency"/);
  assert.match(app, /currency_code:clientCur\.code/);
  assert.match(app, /openingBalanceCurrency:clientCur\.code/);
});
