import fs from 'node:fs/promises';

const baseUrl = process.env.ORDO_URL || 'http://127.0.0.1:8090';
const email = process.env.ORDO_EMAIL;
const password = process.env.ORDO_PASSWORD;
const file = process.argv[2] || 'import/ordo_data_import.json';

if (!email || !password) {
  console.error('Set ORDO_EMAIL and ORDO_PASSWORD before running the import.');
  process.exit(1);
}

async function post(action, body, cookie = '') {
  const response = await fetch(`${baseUrl}/api/index?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body || {})
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok || json.error) throw new Error(json.error?.message || `Request failed: ${response.status}`);
  return { json, cookie: response.headers.getSetCookie?.().map(x => x.split(';')[0]).join('; ') || response.headers.get('set-cookie')?.split(';')[0] || cookie };
}

const raw = JSON.parse(await fs.readFile(file, 'utf8'));
const data = raw.data && !raw.tasks ? raw.data : raw;
data._savedAt = new Date().toISOString();
data._importedAt = data._savedAt;
data._sourceBackup = file;

let login = await post('auth.login', { email, password });
const user = login.json.data.user;
const cookie = login.cookie;

await post('db.query', {
  table: 'studio_data',
  op: 'upsert',
  payload: {
    user_id: user.id,
    data,
    username_index: data.settings?.username || null,
    updated_at: data._savedAt
  },
  single: true
}, cookie);

console.log(JSON.stringify({
  imported: true,
  baseUrl,
  email: user.email,
  userId: user.id,
  counts: {
    projects: data.projects?.length || 0,
    tasks: data.tasks?.length || 0,
    clients: data.clients?.length || 0,
    invoices: data.invoices?.length || 0,
    stores: data.stores?.length || 0
  }
}, null, 2));
