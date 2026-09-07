import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LOCAL_DB_PATH = path.join(ROOT, '.local-data', 'ordo-dev-db.json');
const SESSION_COOKIE = 'ordo_session';
const OAUTH_STATE_COOKIE = 'ordo_oauth_state';
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
const PUBLIC_READ_TABLES = new Set(['platform_settings', 'public_tokens', 'public_store_items', 'public_reviews', 'public_contracts', 'shared_contracts']);
const PUBLIC_WRITE_TABLES = new Set(['public_store_orders', 'public_reviews', 'review_queue', 'public_client_portal_events', 'subscription_requests']);
const USER_TABLES = new Set(['studio_data', 'user_settings', 'user_notifications']);
const JSON_DATA_TABLES = new Set(['team_invites', 'team_members', 'public_tokens', 'public_store_items', 'public_store_orders', 'public_reviews', 'review_queue', 'public_contracts', 'public_client_portal_events', 'subscription_requests']);
const TABLE_COLUMNS = {
  studio_data: new Set(['user_id', 'data', 'username_index', 'created_at', 'updated_at']),
  user_settings: new Set(['user_id', 'data', 'updated_at']),
  subscription_plans: new Set(['id', 'name', 'plan_name', 'price', 'price_monthly', 'duration_days', 'features', 'active', 'created_at', 'updated_at']),
  serial_keys: new Set(['id', 'code', 'key_code', 'user_id', 'status', 'plan_id', 'plan_name', 'billing', 'duration_days', 'created_at', 'activated_at', 'expires_at', 'updated_at']),
  user_notifications: new Set(['id', 'user_id', 'title', 'body', 'type', 'data', 'read', 'is_read', 'created_at', 'updated_at']),
  platform_settings: new Set(['id', 'config', 'updated_at']),
  shared_contracts: new Set(['token', 'user_id', 'data', 'created_at', 'updated_at']),
  team_invites: new Set(['id', 'team_id', 'team_name', 'owner_user_id', 'owner_name', 'to_email', 'to_user_id', 'member_name', 'member_role', 'role', 'status', 'payload', 'data', 'created_at', 'updated_at']),
  team_members: new Set(['id', 'team_id', 'user_id', 'owner_user_id', 'role', 'data', 'created_at', 'updated_at']),
  public_tokens: new Set(['id', 'token', 'user_id', 'type', 'data', 'created_at', 'updated_at']),
  public_store_items: new Set(['id', 'user_id', 'data', 'active', 'created_at', 'updated_at']),
  public_store_orders: new Set(['id', 'user_id', 'data', 'status', 'created_at', 'updated_at']),
  public_reviews: new Set(['id', 'user_id', 'data', 'created_at', 'updated_at']),
  review_queue: new Set(['id', 'user_id', 'data', 'processed', 'created_at', 'updated_at']),
  public_contracts: new Set(['id', 'token', 'user_id', 'data', 'created_at', 'updated_at']),
  public_client_portal_events: new Set(['id', 'user_id', 'data', 'created_at', 'updated_at']),
  subscription_requests: new Set(['id', 'user_id', 'plan_id', 'status', 'receipt_url', 'data', 'created_at', 'updated_at'])
};

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

function setOAuthStateCookie(res, state) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${OAUTH_STATE_COOKIE}=${encodeURIComponent(state)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secure}`);
}

function clearOAuthStateCookie(res, extraCookie) {
  const cookies = [`${OAUTH_STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`];
  if (extraCookie) cookies.push(extraCookie);
  res.setHeader('Set-Cookie', cookies);
}

function redirect(res, location, status = 302) {
  res.writeHead(status, { Location: location });
  res.end();
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

function prepareDbRow(table, source) {
  const allowed = TABLE_COLUMNS[table];
  const input = { ...(source || {}) };
  if (!allowed) return encodeJsonFields(input);
  const out = {};
  const extra = {};
  for (const [key, value] of Object.entries(input)) {
    if (allowed.has(key)) out[key] = value;
    else extra[key] = value;
  }
  if (JSON_DATA_TABLES.has(table) && Object.keys(extra).length) {
    const current = parseMaybe(out.data) || {};
    out.data = { ...current, ...extra };
  }
  return encodeJsonFields(out);
}

function enforceAccess(table, input, user) {
  const op = String(input.op || 'select');
  input.filters = Array.isArray(input.filters) ? input.filters : [];
  if (!user) {
    if (op === 'select' && PUBLIC_READ_TABLES.has(table)) return null;
    if (['insert', 'upsert'].includes(op) && PUBLIC_WRITE_TABLES.has(table)) return null;
    return { message: 'Login required', status: 401, code: 'login_required' };
  }
  if (user.is_admin) return null;
  if (table === 'profiles') return { message: 'Admin only', status: 403, code: 'admin_only' };
  if (table === 'serial_keys') {
    const payload = input.payload || {};
    const hasCodeFilter = input.filters.some(f => ['code', 'key_code', 'id'].includes(f.column));
    const hasOwnFilter = input.filters.some(f => f.column === 'user_id' && String(f.value) === String(user.id));
    if (op === 'select') {
      if (!hasCodeFilter && !hasOwnFilter) input.filters.push({ op: 'eq', column: 'user_id', value: user.id });
      return null;
    }
    if (op === 'update') {
      const keys = Object.keys(payload);
      const allowedKeys = new Set(['status', 'user_id', 'activated_at', 'expires_at', 'updated_at']);
      const allowedPayload = keys.every(key => allowedKeys.has(key));
      const activatingOwnKey = payload.status === 'active' && String(payload.user_id) === String(user.id) && hasCodeFilter;
      const cancellingOwnKey = payload.status === 'expired' && payload.user_id === null && hasOwnFilter;
      if (allowedPayload && (activatingOwnKey || cancellingOwnKey)) return null;
    }
    return { message: 'Admin only', status: 403, code: 'admin_only' };
  }
  if (['serial_keys', 'subscription_plans', 'platform_settings'].includes(table) && op !== 'select') {
    return { message: 'Admin only', status: 403, code: 'admin_only' };
  }
  if (USER_TABLES.has(table)) {
    const hasOwnFilter = input.filters.some(f => f.column === 'user_id' && String(f.value) === String(user.id));
    if (['select', 'update', 'delete'].includes(op) && !hasOwnFilter) input.filters.push({ op: 'eq', column: 'user_id', value: user.id });
    if (['insert', 'upsert'].includes(op)) {
      const rows = Array.isArray(input.payload) ? input.payload : [input.payload];
      rows.forEach(row => { if (row) row.user_id = user.id; });
      input.payload = Array.isArray(input.payload) ? rows : rows[0];
    }
  }
  return null;
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
      auth_provider: 'email',
      google_sub: '',
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

  async upsertOAuthUser(profile) {
    const db = await readLocalDb();
    const email = normalizeEmail(profile.email);
    let user = db.ordo_users.find(row => row.email === email || row.google_sub === profile.sub);
    const stamp = now();
    if (!user) {
      user = {
        id: uuid(),
        email,
        password_hash: '',
        auth_provider: 'google',
        google_sub: profile.sub || '',
        name: profile.name || email,
        phone: '',
        studio: '',
        avatar_url: profile.picture || '',
        is_admin: db.ordo_users.length === 0,
        status: 'active',
        created_at: stamp,
        updated_at: stamp
      };
      db.ordo_users.push(user);
    } else {
      user.auth_provider = user.auth_provider || 'google';
      user.google_sub = user.google_sub || profile.sub || '';
      user.name = user.name || profile.name || email;
      user.avatar_url = user.avatar_url || profile.picture || '';
      user.updated_at = stamp;
    }
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
        const row = prepareDbRow(tableName, {
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
      const payload = prepareDbRow(tableName, input.payload || {});
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
  if (!connectionString) {
    if (process.env.VERCEL) {
      const error = new Error('DATABASE_URL is missing. Connect a Vercel Marketplace Postgres database before using production login.');
      error.code = 'database_not_configured';
      throw error;
    }
    return new LocalStore();
  }
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(connectionString);
  const query = (text, params = []) => sql.query(text, params);
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
        'INSERT INTO ordo_users (id,email,password_hash,auth_provider,google_sub,name,phone,studio,avatar_url,is_admin,status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW()) RETURNING *',
        [id, email, hashPassword(password), 'email', '', meta.name || meta.full_name || '', meta.phone || '', meta.studio || '', meta.avatarUrl || meta.avatar_url || '', isAdmin, 'active']
      );
      return rows[0];
    },
    async upsertOAuthUser(profile) {
      const email = normalizeEmail(profile.email);
      const existing = await query('SELECT * FROM ordo_users WHERE email = $1 OR google_sub = $2 LIMIT 1', [email, profile.sub || '']);
      if (existing[0]) {
        const rows = await query(
          'UPDATE ordo_users SET auth_provider=COALESCE(auth_provider,$1), google_sub=COALESCE(NULLIF(google_sub, $2), $3), name=COALESCE(NULLIF(name, $2), $4), avatar_url=COALESCE(NULLIF(avatar_url, $2), $5), updated_at=NOW() WHERE id=$6 RETURNING *',
          ['google', '', profile.sub || '', profile.name || email, profile.picture || '', existing[0].id]
        );
        return rows[0];
      }
      const id = uuid();
      const isAdmin = (await this.userCount()) === 0;
      const rows = await query(
        'INSERT INTO ordo_users (id,email,password_hash,auth_provider,google_sub,name,avatar_url,is_admin,status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW()) RETURNING *',
        [id, email, '', 'google', profile.sub || '', profile.name || email, profile.picture || '', isAdmin, 'active']
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
          const row = prepareDbRow(tableName, {
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
        const payload = prepareDbRow(tableName, input.payload || {});
        const keys = Object.keys(payload).filter(key => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key));
        const values = keys.map(key => payload[key]);
        const sets = keys.map((key, i) => `${key}=$${i + 1}`);
        const shiftedWhere = where.map(clause => clause.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + values.length}`));
        if (!keys.includes('updated_at')) sets.push('updated_at=NOW()');
        const setClause = sets.join(',');
        const rows = await query(`UPDATE ${tableName} SET ${setClause}${shiftedWhere.length ? ` WHERE ${shiftedWhere.join(' AND ')}` : ''} RETURNING *`, [...values, ...params]);
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

function publicOrigin(req) {
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  return `${proto}://${host}`;
}

function appRedirectTarget(req, fallback) {
  const value = String(fallback || `${publicOrigin(req)}/HTML/index.html`);
  try {
    const target = new URL(value, publicOrigin(req));
    return target.origin === publicOrigin(req) ? target.toString() : `${publicOrigin(req)}/HTML/index.html`;
  } catch {
    return `${publicOrigin(req)}/HTML/index.html`;
  }
}

async function fetchGoogleProfile(code, redirectUri) {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  if (!clientId || !clientSecret) {
    const error = new Error('Google login is missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET.');
    error.code = 'google_not_configured';
    throw error;
  }
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    })
  });
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok || !tokenJson.access_token) {
    const error = new Error(tokenJson.error_description || 'Google token exchange failed.');
    error.code = 'google_token_failed';
    throw error;
  }
  const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` }
  });
  const profile = await profileRes.json();
  if (!profileRes.ok || !profile.email) {
    const error = new Error('Google profile email was not available.');
    error.code = 'google_profile_failed';
    throw error;
  }
  return profile;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return ok(res, null);
  const url = new URL(req.url, 'http://localhost');
  const action = url.searchParams.get('action') || '';

  try {
    if (action === 'auth.google.start') {
      const clientId = process.env.GOOGLE_CLIENT_ID || '';
      if (!clientId || !process.env.GOOGLE_CLIENT_SECRET) return fail(res, 'Google login is not configured yet.', 500, 'google_not_configured');
      const state = uuid();
      const redirectTo = appRedirectTarget(req, url.searchParams.get('redirectTo'));
      const redirectUri = `${publicOrigin(req)}/api/index?action=auth.google.callback`;
      setOAuthStateCookie(res, `${state}|${encodeURIComponent(redirectTo)}`);
      const googleUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      googleUrl.searchParams.set('client_id', clientId);
      googleUrl.searchParams.set('redirect_uri', redirectUri);
      googleUrl.searchParams.set('response_type', 'code');
      googleUrl.searchParams.set('scope', 'openid email profile');
      googleUrl.searchParams.set('access_type', 'offline');
      googleUrl.searchParams.set('prompt', 'select_account');
      googleUrl.searchParams.set('state', state);
      return redirect(res, googleUrl.toString());
    }

    if (action === 'auth.google.callback') {
      const stored = parseCookies(req)[OAUTH_STATE_COOKIE] || '';
      const [state, encodedRedirect] = stored.split('|');
      const redirectTo = encodedRedirect ? decodeURIComponent(encodedRedirect) : `${publicOrigin(req)}/HTML/index.html`;
      if (!state || state !== url.searchParams.get('state')) {
        clearOAuthStateCookie(res);
        return redirect(res, `${redirectTo}?auth_error=google_state`);
      }
      const store = await makePostgresStore();
      const redirectUri = `${publicOrigin(req)}/api/index?action=auth.google.callback`;
      const profile = await fetchGoogleProfile(url.searchParams.get('code') || '', redirectUri);
      const user = await store.upsertOAuthUser(profile);
      const token = await store.createSession(user.id);
      const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
      clearOAuthStateCookie(res, `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`);
      return redirect(res, redirectTo);
    }

    if (req.method !== 'POST') return fail(res, 'POST only', 405, 'method_not_allowed');
    const store = await makePostgresStore();
    const input = await readBody(req);
    const postAction = action || input.action || '';

    if (postAction === 'auth.session' || postAction === 'auth.user') {
      const { user, token } = await currentUser(req, store);
      if (!user) return ok(res, postAction === 'auth.session' ? { session: null } : { user: null });
      return ok(res, postAction === 'auth.session' ? { session: sessionPayload(user, token) } : { user: userPayload(user) });
    }

    if (postAction === 'auth.signup') {
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

    if (postAction === 'auth.login') {
      const email = normalizeEmail(input.email);
      const user = await store.userByEmail(email);
      if (!user || !verifyPassword(input.password || '', user.password_hash)) return fail(res, 'البريد الإلكتروني أو كلمة المرور غير صحيحة', 401, 'invalid_login');
      if (user.status !== 'active') return fail(res, 'هذا الحساب موقوف', 403, 'account_disabled');
      const token = await store.createSession(user.id);
      setCookie(res, token);
      return ok(res, { user: userPayload(user), session: sessionPayload(user, token) });
    }

    if (postAction === 'auth.logout') {
      const token = parseCookies(req)[SESSION_COOKIE];
      if (token) await store.deleteSession(token);
      clearCookie(res);
      return ok(res, null);
    }

    if (postAction === 'auth.update') {
      const { user } = await currentUser(req, store);
      if (!user) return fail(res, 'Login required', 401, 'login_required');
      const updated = await store.updateUser(user.id, input.attributes || {});
      return ok(res, { user: userPayload(updated) });
    }

    if (postAction === 'auth.reset') {
      return ok(res, { message: 'Password reset emails are not enabled yet. Admin can change the password from the panel.' });
    }

    if (postAction === 'db.query') {
      const { user } = await currentUser(req, store);
      const table = String(input.table || '');
      if (table !== 'profiles' && !TABLES.has(table)) return fail(res, `Table is not available: ${table}`, 400, 'table_not_allowed');
      const accessError = enforceAccess(table, input, user);
      if (accessError) return fail(res, accessError.message, accessError.status, accessError.code);
      const data = await store.query(table, input, user);
      return ok(res, data);
    }

    return fail(res, 'Unknown action', 404, 'unknown_action');
  } catch (error) {
    const status = error.code === 'email_exists' ? 409 : 500;
    return fail(res, error.message || 'Server error', status, error.code || 'server_error');
  }
}
