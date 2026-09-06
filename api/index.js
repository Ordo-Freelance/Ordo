import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LOCAL_DB_PATH = path.join(ROOT, '.local-data', 'ordo-dev-db.json');
const SESSION_COOKIE = 'ordo_session';
const JSON_COLUMNS = new Set(['data', 'features', 'config', 'payload']);
const TABLES = new Set([
  'studio_data',
  'user_settings',
  'serial_keys',
  'subscription_plans',
  'user_notifications',
  'platform_settings',
  'shared_contracts',
  'team_invites',
  'team_members',
  'public_tokens',
  'public_store_items',
  'public_store_orders',
  'public_reviews',
  'review_queue',
  'public_contracts',
  'public_client_portal_events',
  'subscription_requests'
]);

function now() {
  return new Date().toISOString();
}

function uuid() {
  return crypto.randomUUID();
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function ok(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ data, error: null }));
}

function fail(res, message, status = 400, code = 'request_failed') {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ data: null, error: { message, code } }));
}

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map(part => {
    const index = part.indexOf('=');
    if (index < 0) return ['', ''];
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

function setCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`);
}

function clearCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const candidate = hashPassword(password, salt).split(':')[1];
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(candidate, 'hex'));
}

function userPayload(user) {
  if (!user) return null;
  const name = user.name || user.full_name || user.email || '';
  return {
    id: user.id,
    email: user.email,
    app_metadata: { role: user.is_admin ? 'admin' : 'user', is_admin: !!user.is_admin },
    user_metadata: {
      name,
      full_name: name,
      phone: user.phone || '',
      studio: user.studio || '',
      avatarUrl: user.avatar_url || '',
      avatar_url: user.avatar_url || '',
      role: user.is_admin ? 'admin' : 'user',
      is_admin: !!user.is_admin
    },
    created_at: user.created_at,
    updated_at: user.updated_at
  };
}

function sessionPayload(user, token) {
  return {
    access_token: token || 'session',
    token_type: 'bearer',
    user: userPayload(user)
  };
}

function parseMaybe(value) {
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch {}
  }
  return value;
}

function encodeJsonFields(row) {
  const out = { ...row };
  for (const key of JSON_COLUMNS) {
    if (key in out && typeof out[key] !== 'string') out[key] = JSON.stringify(out[key] ?? {});
  }
  return out;
}

function decodeJsonFields(row) {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  for (const key of JSON_COLUMNS) {
    if (key in out) out[key] = parseMaybe(out[key]);
  }
  return out;
}

function seedDb() {
  const created_at = now();
  return {
    ordo_users: [],
    ordo_sessions: [],
    studio_data: [],
    user_settings: [],
    serial_keys: [],
    subscription_plans: [
      { id: 'basic', name: 'Basic', plan_name: 'Basic', price: 0, price_monthly: 0, duration_days: 30, features: { dashboard: true, tasks: true, projects: true, clients: true, finance: true, invoices: true, settings: true }, active: true, created_at, updated_at: created_at },
      { id: 'pro', name: 'Pro', plan_name: 'Pro', price: 0, price_monthly: 0, duration_days: 365, features: { dashboard: true, tasks: true, projects: true, clients: true, finance: true, invoices: true, proposals: true, contracts: true, store: true, team: true, reports: true, settings: true }, active: true, created_at, updated_at: created_at }
    ],
    user_notifications: [],
    platform_settings: [],
    shared_contracts: [],
    team_invites: [],
    team_members: [],
    public_tokens: [],
    public_store_items: [],
    public_store_orders: [],
    public_reviews: [],
    review_queue: [],
    public_contracts: [],
    public_client_portal_events: [],
    subscription_requests: []
  };
}

async function readLocalDb() {
  try {
    const raw = await fs.readFile(LOCAL_DB_PATH, 'utf8');
    return { ...seedDb(), ...JSON.parse(raw) };
  } catch {
    return seedDb();
  }
}

async function writeLocalDb(db) {
  await fs.mkdir(path.dirname(LOCAL_DB_PATH), { recursive: true });
  await fs.writeFile(LOCAL_DB_PATH, JSON.stringify(db, null, 2));
}

function getPath(row, column) {
  const jsonPath = String(column || '').match(/^(.+)->>(.+)$/);
  if (jsonPath) {
    const base = parseMaybe(row[jsonPath[1]]);
    return base ? base[jsonPath[2]] : undefined;
  }
  return row[column];
}

function likeToRegExp(pattern) {
  const escaped = String(pattern || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

function matches(row, filters = []) {
  return filters.every(filter => {
    const value = getPath(row, filter.column);
    if (filter.op === 'eq') return String(value) === String(filter.value);
    if (filter.op === 'neq') return String(value) !== String(filter.value);
    if (filter.op === 'in') return (filter.value || []).map(String).includes(String(value));
    if (filter.op === 'is') return filter.value === null ? value === null || value === undefined : value === filter.value;
    if (filter.op === 'like' || filter.op === 'ilike') return likeToRegExp(filter.value).test(String(value ?? JSON.stringify(row)));
    return true;
  });
}

function project(row, columns) {
  if (!columns || columns === '*' || String(columns).includes('*')) return decodeJsonFields(row);
  const out = {};
  String(columns).split(',').map(col => col.trim()).filter(Boolean).forEach(col => {
    const clean = col.split(/\s+as\s+/i)[0].trim();
    if (clean && !clean.includes('(')) out[clean] = decodeJsonFields(row)[clean];
  });
  return out;
}

function conflictKey(table) {
  if (['studio_data', 'user_settings'].includes(table)) return 'user_id';
  if (table === 'platform_settings') return 'id';
  if (table === 'serial_keys') return 'id';
  if (table === 'subscription_plans') return 'id';
  if (table === 'shared_contracts') return 'token';
  return 'id';
}

function needsGeneratedId(table) {
  return !['studio_data', 'user_settings', 'platform_settings', 'shared_contracts'].includes(table);
}

class LocalStore {
  async userById(id) {
    const db = await readLocalDb();
    return db.ordo_users.find(user => user.id === id) || null;
  }

  async userByEmail(email) {
    const db = await readLocalDb();
    return db.ordo_users.find(user => user.email === normalizeEmail(email)) || null;
  }

  async userCount() {
    const db = await readLocalDb();
    return db.ordo_users.length;
  }

  async createUser(email, password, meta) {
    const db = await readLocalDb();
    if (db.ordo_users.some(user => user.email === email)) {
      const error = new Error('البريد الإلكتروني مسجل مسبقاً');
      error.code = 'email_exists';
      throw error;
    }
    const first = db.ordo_users.length === 0;
    const stamp = now();
    const user = {
      id: uuid(),
      email,
      password_hash: hashPassword(password),
      name: meta.name || meta.full_name || '',
      phone: meta.phone || '',
      studio: meta.studio || '',
      avatar_url: meta.avatarUrl || meta.avatar_url || '',
      is_admin: first,
      status: 'active',
      created_at: stamp,
      updated_at: stamp
    };
    db.ordo_users.push(user);
    await writeLocalDb(db);
    return user;
  }

  async updateUser(id, attrs) {
    const db = await readLocalDb();
    const user = db.ordo_users.find(row => row.id === id);
    if (!user) return null;
    if (attrs.password) user.password_hash = hashPassword(attrs.password);
    const meta = attrs.data || {};
    for (const [from, to] of [['name', 'name'], ['full_name', 'name'], ['phone', 'phone'], ['studio', 'studio'], ['avatarUrl', 'avatar_url'], ['avatar_url', 'avatar_url']]) {
      if (Object.prototype.hasOwnProperty.call(meta, from)) user[to] = meta[from] || '';
    }
    user.updated_at = now();
    await writeLocalDb(db);
    return user;
  }

  async createSession(userId) {
    const db = await readLocalDb();
    const token = uuid();
    db.ordo_sessions.push({ token, user_id: userId, created_at: now() });
    await writeLocalDb(db);
    return token;
  }

  async userBySession(token) {
    const db = await readLocalDb();
    const session = db.ordo_sessions.find(row => row.token === token);
    if (!session) return null;
    return db.ordo_users.find(user => user.id === session.user_id) || null;
  }

  async deleteSession(token) {
    const db = await readLocalDb();
    db.ordo_sessions = db.ordo_sessions.filter(row => row.token !== token);
    await writeLocalDb(db);
  }

  async query(table, input, user) {
    const db = await readLocalDb();
    const tableName = table === 'profiles' ? 'ordo_users' : table;
    db[tableName] = Array.isArray(db[tableName]) ? db[tableName] : [];
    const isProfile = table === 'profiles';
    const rows = db[tableName];
    const filters = Array.isArray(input.filters) ? input.filters : [];
    if (input.op === 'select') {
      let out = rows.filter(row => matches(row, filters));
      if (isProfile) out = out.map(row => ({ id: row.id, email: row.email, name: row.name, created_at: row.created_at }));
      if (input.order?.column) {
        const dir = input.order.ascending === false ? -1 : 1;
        out.sort((a, b) => String(getPath(a, input.order.column) ?? '').localeCompare(String(getPath(b, input.order.column) ?? '')) * dir);
      }
      if (input.limit) out = out.slice(0, Number(input.limit));
      out = out.map(row => project(row, input.columns));
      return input.single ? (out[0] || null) : out;
    }
    if (input.op === 'insert' || input.op === 'upsert') {
      const payloadRows = Array.isArray(input.payload) ? input.payload : [input.payload];
      const out = [];
      for (const original of payloadRows.filter(Boolean)) {
        const row = encodeJsonFields({
          ...(needsGeneratedId(tableName) ? { id: original.id || uuid() } : {}),
          ...original,
          updated_at: now()
        });
        if (!row.created_at) row.created_at = now();
        const key = conflictKey(tableName);
        const index = rows.findIndex(item => String(item[key]) === String(row[key]));
        if (input.op === 'upsert' && index >= 0) rows[index] = { ...rows[index], ...row };
        else rows.push(row);
        out.push(decodeJsonFields(row));
      }
      await writeLocalDb(db);
      return input.single ? (out[0] || null) : out;
    }
    if (input.op === 'update') {
      const payload = encodeJsonFields(input.payload || {});
      const out = [];
      for (const row of rows) {
        if (!matches(row, filters)) continue;
        Object.assign(row, payload, { updated_at: now() });
        out.push(decodeJsonFields(row));
      }
      await writeLocalDb(db);
      return input.single ? (out[0] || null) : out;
    }
    if (input.op === 'delete') {
      db[tableName] = rows.filter(row => !matches(row, filters));
      await writeLocalDb(db);
      return [];
    }
    throw new Error('Unknown operation');
  }
}

async function makePostgresStore() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
  if (!connectionString) return new LocalStore();
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(connectionString);
  const query = (text, params = []) => sql(text, params);
  return {
    async userById(id) {
      const rows = await query('SELECT * FROM ordo_users WHERE id = $1 LIMIT 1', [id]);
      return rows[0] || null;
    },
    async userByEmail(email) {
      const rows = await query('SELECT * FROM ordo_users WHERE email = $1 LIMIT 1', [normalizeEmail(email)]);
      return rows[0] || null;
    },
    async userCount() {
      const rows = await query('SELECT COUNT(*)::int AS count FROM ordo_users');
      return rows[0]?.count || 0;
    },
    async createUser(email, password, meta) {
      const id = uuid();
      const isAdmin = (await this.userCount()) === 0;
      const rows = await query(
        'INSERT INTO ordo_users (id,email,password_hash,name,phone,studio,avatar_url,is_admin,status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW()) RETURNING *',
        [id, email, hashPassword(password), meta.name || meta.full_name || '', meta.phone || '', meta.studio || '', meta.avatarUrl || meta.avatar_url || '', isAdmin, 'active']
      );
      return rows[0];
    },
    async updateUser(id, attrs) {
      if (attrs.password) {
        await query('UPDATE ordo_users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hashPassword(attrs.password), id]);
      }
      const meta = attrs.data || {};
      const current = await this.userById(id);
      const rows = await query(
        'UPDATE ordo_users SET name=$1, phone=$2, studio=$3, avatar_url=$4, updated_at=NOW() WHERE id=$5 RETURNING *',
        [
          meta.name ?? meta.full_name ?? current.name ?? '',
          meta.phone ?? current.phone ?? '',
          meta.studio ?? current.studio ?? '',
          meta.avatarUrl ?? meta.avatar_url ?? current.avatar_url ?? '',
          id
        ]
      );
      return rows[0] || null;
    },
    async createSession(userId) {
      const token = uuid();
      await query('INSERT INTO ordo_sessions (token,user_id,created_at) VALUES ($1,$2,NOW())', [token, userId]);
      return token;
    },
    async userBySession(token) {
      const rows = await query('SELECT u.* FROM ordo_sessions s JOIN ordo_users u ON u.id = s.user_id WHERE s.token = $1 LIMIT 1', [token]);
      return rows[0] || null;
    },
    async deleteSession(token) {
      await query('DELETE FROM ordo_sessions WHERE token = $1', [token]);
    },
    async query(table, input) {
      const tableName = table === 'profiles' ? 'profiles' : table;
      const filters = Array.isArray(input.filters) ? input.filters : [];
      const params = [];
      const where = filters.map(filter => {
        if (!['eq', 'neq', 'is', 'like', 'ilike'].includes(filter.op)) return null;
        const rawColumn = String(filter.column || '').replace(/[^a-zA-Z0-9_>-]/g, '');
        const column = rawColumn.includes('->>') ? rawColumn.replace('->>', "->>") : rawColumn;
        params.push(filter.value);
        if (filter.op === 'neq') return `${column} <> $${params.length}`;
        if (filter.op === 'like' || filter.op === 'ilike') return `${column} ILIKE $${params.length}`;
        if (filter.op === 'is' && filter.value === null) {
          params.pop();
          return `${column} IS NULL`;
        }
        return `${column} = $${params.length}`;
      }).filter(Boolean);
      if (input.op === 'select') {
        const cols = String(input.columns || '*').replace(/[^a-zA-Z0-9_,* >()-]/g, '') || '*';
        let text = `SELECT ${cols} FROM ${tableName}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`;
        if (input.order?.column) text += ` ORDER BY ${String(input.order.column).replace(/[^a-zA-Z0-9_]/g, '')} ${input.order.ascending === false ? 'DESC' : 'ASC'}`;
        if (input.limit) text += ` LIMIT ${Math.max(1, Math.min(500, Number(input.limit)))}`;
        const rows = await query(text, params);
        const out = rows.map(decodeJsonFields);
        return input.single ? (out[0] || null) : out;
      }
      if (input.op === 'insert' || input.op === 'upsert') {
        const payloadRows = Array.isArray(input.payload) ? input.payload : [input.payload];
        const out = [];
        for (const original of payloadRows.filter(Boolean)) {
          const row = encodeJsonFields({
            ...(needsGeneratedId(tableName) ? { id: original.id || uuid() } : {}),
            ...original
          });
          const keys = Object.keys(row).filter(key => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key));
          const values = keys.map(key => row[key]);
          const placeholders = keys.map((_, i) => `$${i + 1}`).join(',');
          let text = `INSERT INTO ${tableName} (${keys.join(',')}) VALUES (${placeholders})`;
          if (input.op === 'upsert') {
            const key = conflictKey(tableName);
            const updates = keys.filter(col => col !== key).map(col => `${col}=EXCLUDED.${col}`).join(',');
            text += ` ON CONFLICT (${key}) DO UPDATE SET ${updates || `${key}=EXCLUDED.${key}`}`;
          }
          text += ' RETURNING *';
          const rows = await query(text, values);
          out.push(decodeJsonFields(rows[0]));
        }
        return input.single ? (out[0] || null) : out;
      }
      if (input.op === 'update') {
        const payload = encodeJsonFields(input.payload || {});
        const keys = Object.keys(payload).filter(key => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key));
        const values = keys.map(key => payload[key]);
        const sets = keys.map((key, i) => `${key}=$${i + 1}`);
        const shiftedWhere = where.map(clause => clause.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + values.length}`));
        const rows = await query(`UPDATE ${tableName} SET ${sets.join(',')}, updated_at=NOW()${shiftedWhere.length ? ` WHERE ${shiftedWhere.join(' AND ')}` : ''} RETURNING *`, [...values, ...params]);
        const out = rows.map(decodeJsonFields);
        return input.single ? (out[0] || null) : out;
      }
      if (input.op === 'delete') {
        await query(`DELETE FROM ${tableName}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`, params);
        return [];
      }
      throw new Error('Unknown operation');
    }
  };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

async function currentUser(req, store) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return { user: null, token: null };
  const user = await store.userBySession(token);
  if (!user || user.status !== 'active') return { user: null, token };
  return { user, token };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return ok(res, null);
  if (req.method !== 'POST') return fail(res, 'POST only', 405, 'method_not_allowed');

  const store = await makePostgresStore();
  const input = await readBody(req);
  const url = new URL(req.url, 'http://localhost');
  const action = url.searchParams.get('action') || input.action || '';

  try {
    if (action === 'auth.session' || action === 'auth.user') {
      const { user, token } = await currentUser(req, store);
      if (!user) return ok(res, action === 'auth.session' ? { session: null } : { user: null });
      return ok(res, action === 'auth.session' ? { session: sessionPayload(user, token) } : { user: userPayload(user) });
    }

    if (action === 'auth.signup') {
      const email = normalizeEmail(input.email);
      const password = String(input.password || '');
      const metadata = input.metadata && typeof input.metadata === 'object' ? input.metadata : {};
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 'البريد الإلكتروني غير صحيح');
      if (password.length < 6) return fail(res, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      const user = await store.createUser(email, password, metadata);
      const token = await store.createSession(user.id);
      setCookie(res, token);
      return ok(res, { user: userPayload(user), session: sessionPayload(user, token) });
    }

    if (action === 'auth.login') {
      const email = normalizeEmail(input.email);
      const user = await store.userByEmail(email);
      if (!user || !verifyPassword(input.password || '', user.password_hash)) return fail(res, 'البريد الإلكتروني أو كلمة المرور غير صحيحة', 401, 'invalid_login');
      if (user.status !== 'active') return fail(res, 'هذا الحساب موقوف', 403, 'account_disabled');
      const token = await store.createSession(user.id);
      setCookie(res, token);
      return ok(res, { user: userPayload(user), session: sessionPayload(user, token) });
    }

    if (action === 'auth.logout') {
      const token = parseCookies(req)[SESSION_COOKIE];
      if (token) await store.deleteSession(token);
      clearCookie(res);
      return ok(res, null);
    }

    if (action === 'auth.update') {
      const { user } = await currentUser(req, store);
      if (!user) return fail(res, 'Login required', 401, 'login_required');
      const updated = await store.updateUser(user.id, input.attributes || {});
      return ok(res, { user: userPayload(updated) });
    }

    if (action === 'auth.reset') {
      return ok(res, { message: 'Password reset emails are not enabled yet. Admin can change the password from the panel.' });
    }

    if (action === 'db.query') {
      const { user } = await currentUser(req, store);
      if (!user) return fail(res, 'Login required', 401, 'login_required');
      const table = String(input.table || '');
      if (table !== 'profiles' && !TABLES.has(table)) return fail(res, `Table is not available: ${table}`, 400, 'table_not_allowed');
      const data = await store.query(table, input, user);
      return ok(res, data);
    }

    return fail(res, 'Unknown action', 404, 'unknown_action');
  } catch (error) {
    const status = error.code === 'email_exists' ? 409 : 500;
    return fail(res, error.message || 'Server error', status, error.code || 'server_error');
  }
}
