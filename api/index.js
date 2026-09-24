import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { imageBytes, storageLimitBytes, mayIncreaseImageUsage } from './storage_quota.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LOCAL_DB_PATH = path.join(ROOT, '.local-data', 'ordo-dev-db.json');
const SESSION_COOKIE = 'ordo_session';
const ADMIN_SESSION_COOKIE = 'ordo_admin_session';
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
const PUBLIC_WRITE_TABLES = new Set(['public_store_orders', 'subscription_requests']);
const USER_TABLES = new Set(['studio_data', 'user_settings', 'user_notifications', 'public_tokens', 'public_store_items', 'review_queue', 'public_store_orders', 'public_reviews', 'public_client_portal_events']);
const JSON_DATA_TABLES = new Set(['team_invites', 'team_members', 'public_tokens', 'public_store_items', 'public_store_orders', 'public_reviews', 'review_queue', 'public_contracts', 'public_client_portal_events', 'subscription_requests']);
const TABLE_COLUMNS = {
  studio_data: new Set(['user_id', 'data', 'username_index', 'created_at', 'updated_at']),
  user_settings: new Set(['user_id', 'data', 'updated_at']),
  subscription_plans: new Set(['id', 'name', 'plan_name', 'price', 'price_monthly', 'duration_days', 'features', 'active', 'created_at', 'updated_at']),
  serial_keys: new Set(['id', 'code', 'key_code', 'user_id', 'status', 'plan_id', 'plan_name', 'billing', 'duration_days', 'note', 'code_type', 'price', 'created_at', 'activated_at', 'expires_at', 'updated_at']),
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

function sessionCookieName(req) {
  return req.headers['x-ordo-auth-scope'] === 'admin' ? ADMIN_SESSION_COOKIE : SESSION_COOKIE;
}

function setCookie(res, token, req) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${sessionCookieName(req)}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`);
}

function clearCookie(res, req) {
  res.setHeader('Set-Cookie', `${sessionCookieName(req)}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
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

function unwrapStudio(value) {
  let data = value;
  for (let i = 0; i < 4; i++) {
    data = parseMaybe(data);
    if (data && typeof data === 'object' && data.data && !data.settings && !data.clients && !data.services) data = data.data;
    else break;
  }
  return data && typeof data === 'object' ? data : {};
}

async function storageInfo(store, userId) {
  const filter = [{op:'eq',column:'user_id',value:userId}];
  const [studio, serials, settings, requests, account, chatBytes] = await Promise.all([
    store.query('studio_data',{op:'select',columns:'user_id,data',filters:filter,single:true}),
    store.query('serial_keys',{op:'select',columns:'user_id,plan_id,status,expires_at,activated_at',filters:filter}),
    store.query('platform_settings',{op:'select',columns:'id,config',filters:[{op:'eq',column:'id',value:1}],single:true}),
    store.query('subscription_requests',{op:'select',columns:'user_id,receipt_url,data',filters:filter}),
    store.userById(userId),
    store.chatMediaBytes ? store.chatMediaBytes(userId) : store.query('public_client_portal_events',{op:'select',columns:'data',filters:filter,limit:500}).then(rows=>(rows||[]).reduce((sum,row)=>sum+Number((parseMaybe(row.data)||{}).event_data?.attachment?.bytes||0),0))
  ]);
  const active = (serials || []).filter(item => item.plan_id && ['active','assigned'].includes(item.status) && (!item.expires_at || new Date(item.expires_at) > new Date())).sort((a,b) => String(b.activated_at||'').localeCompare(String(a.activated_at||'')))[0];
  // Only serial_keys is authoritative here: studio_data is writable by the user.
  const planId = active?.plan_id || null;
  const plan = planId ? await store.query('subscription_plans',{op:'select',columns:'id,features',filters:[{op:'eq',column:'id',value:planId}],single:true}) : null;
  const config = parseMaybe(settings?.config) || {};
  const override = config.storage_overrides?.[userId] || {};
  const features = parseMaybe(plan?.features) || {};
  const enabled = override.uploads_enabled ?? features.image_uploads ?? true;
  const otherBytes = imageBytes(account?.avatar_url) + (requests || []).reduce((sum,row) => sum + imageBytes(row.receipt_url) + imageBytes(row.data), 0) + chatBytes;
  const studioBytes = imageBytes(studio?.data);
  return {user_id:userId,used_bytes:studioBytes + otherBytes,studio_bytes:studioBytes,other_bytes:otherBytes,chat_bytes:chatBytes,limit_bytes:storageLimitBytes(features,override),uploads_enabled:!!enabled,plan_id:planId || null};
}

async function portalChatAccess(store, userId) {
  const [studio, serials, settings] = await Promise.all([
    store.query('studio_data',{op:'select',columns:'data',filters:[{op:'eq',column:'user_id',value:userId}],single:true}),
    store.query('serial_keys',{op:'select',columns:'plan_id,status,expires_at,activated_at',filters:[{op:'eq',column:'user_id',value:userId}]}),
    store.query('platform_settings',{op:'select',columns:'config',filters:[{op:'eq',column:'id',value:1}],single:true})
  ]);
  const active=(serials||[]).filter(s=>s.plan_id&&['active','assigned'].includes(s.status)&&(!s.expires_at||new Date(s.expires_at)>new Date())).sort((a,b)=>String(b.activated_at||'').localeCompare(String(a.activated_at||'')))[0];
  const plan=active ? await store.query('subscription_plans',{op:'select',columns:'features',filters:[{op:'eq',column:'id',value:active.plan_id}],single:true}) : null;
  const features=parseMaybe(plan?.features)||{};
  const config=parseMaybe(settings?.config)||{};
  const data=unwrapStudio(studio?.data);
  // Chat permissions are read only from admin-owned platform settings; studio_data is user writable.
  const states={...config.user_features,...(config.portal_chat_overrides?.[userId]||{}),...(config.protected_feature_overrides?.[userId]||{})};
  const allowed=key=>features[key]!==false&&states[key]!=='disabled'&&states[key]!=='coming';
  return {enabled:allowed('portal_chat')&&allowed('client_portal'),images:allowed('portal_chat_images')&&features.image_uploads!==false,voice:allowed('portal_chat_voice'),data};
}

function portalChatAttachment(input, access) {
  if(!input) return null;
  const kind=String(input.kind||'');
  const mime=String(input.mime||'');
  const allowed=kind==='image'&&access.images&&['image/jpeg','image/png','image/webp'].includes(mime) || kind==='voice'&&access.voice&&['audio/webm','audio/ogg','audio/mp4','audio/mpeg'].includes(mime);
  if(!allowed) throw Object.assign(new Error('نوع المرفق غير مسموح في باقتك'),{code:'attachment_not_allowed',status:403});
  const content=String(input.data||'');
  // MediaRecorder may add codec parameters (such as codecs=opus) to the URL.
  const header=content.match(/^data:([^;,]+)(?:;[^,]*)?;base64,/i);
  const encoded=header?.[1]===mime?content.slice(header[0].length):'';
  const max=kind==='image'?700000:1500000;
  if(!encoded||encoded.length>Math.ceil(max*4/3)||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw Object.assign(new Error('حجم أو صيغة الملف غير صالحة'),{code:'invalid_attachment',status:413});
  return {kind,mime,data:content,name:String(input.name||'').slice(0,100),bytes:Math.floor(encoded.length*3/4)};
}

function portalChatPublicRow(row) {
  const info=parseMaybe(row.data)||{};
  const msg=info.event_data||{};
  return {id:row.id,client_id:info.client_id,sender:msg.sender==='client'?'client':'owner',body:msg.deleted?'':msg.body||'',attachment:msg.deleted?null:msg.attachment?{kind:msg.attachment.kind,mime:msg.attachment.mime,name:msg.attachment.name,bytes:msg.attachment.bytes}:null,deleted:!!msg.deleted,created_at:row.created_at};
}

const FINANCE_FEATURE_KEYS=['finance_dashboard','finance_accounts','finance_account_manage','finance_currency_wallets','loans','finance_reports','finance_transactions','fin_income','fin_expense'];
async function financeFeatureAccess(store,user){
  if(user.is_admin)return Object.fromEntries(FINANCE_FEATURE_KEYS.map(key=>[key,true]));
  const [serials,settings]=await Promise.all([
    store.query('serial_keys',{op:'select',columns:'plan_id,status,expires_at,activated_at',filters:[{op:'eq',column:'user_id',value:user.id}]}),
    store.query('platform_settings',{op:'select',columns:'config',filters:[{op:'eq',column:'id',value:1}],single:true})
  ]);
  const active=(serials||[]).filter(s=>s.plan_id&&['active','assigned'].includes(s.status)&&(!s.expires_at||new Date(s.expires_at)>new Date())).sort((a,b)=>String(b.activated_at||'').localeCompare(String(a.activated_at||'')))[0];
  const plan=active?await store.query('subscription_plans',{op:'select',columns:'features',filters:[{op:'eq',column:'id',value:active.plan_id}],single:true}):null;
  const features=parseMaybe(plan?.features)||{};
  const config=parseMaybe(settings?.config)||{};
  const states={...config.user_features,...(config.portal_chat_overrides?.[user.id]||{}),...(config.protected_feature_overrides?.[user.id]||{})};
  return Object.fromEntries(FINANCE_FEATURE_KEYS.map(key=>[key,features.finance!==false&&features[key]!==false&&!['disabled','coming'].includes(states.finance)&&!['disabled','coming'].includes(states[key])]));
}

function publicView(data, type, token) {
  const settings = data.settings || {};
  const publicSettings = Object.fromEntries(['name','studio','studioName','username','store_slug','svc_store_name','store_logo','svc_banner','svc_banner_size','svc_banner_custom_px','svc_site_desc','svc_orders_open','socials','logo','logoDark','logoLight','avatar','accent','accentColor','accent2','accentColor2','theme_color','displayMode','display_mode','fontScale','toneColor','toneStyle','toneGradientEnd','toneAngle','hoverOverlayColor','phone','email','whatsapp','about','bio','currency','base_currency','base_currency_code','enabled_currencies','socialLinks','social_links'].filter(key => settings[key] !== undefined).map(key => [key, settings[key]]));
  if (type === 'store') return { settings: publicSettings, services: data.services || [], standalone_packages: data.standalone_packages || [], portfolio_projects: data.portfolio_projects || [], stores: data.stores || [], reviews: (data.reviews || []).filter(row => row.public_visible !== false) };
  if (type === 'reviews_public') return { settings: publicSettings, reviews: (data.reviews || []).filter(row => row.public_visible !== false), public_tokens: (data.public_tokens || []).filter(item => ['review','store'].includes(item.entity_type) && !item.revoked && (!item.expires_at || new Date(item.expires_at) > new Date())).map(item => ({token:item.token,entity_type:item.entity_type})) };
  if (type === 'review') return { settings: publicSettings, reviews: (data.reviews || []).filter(row => row.public_visible !== false) };
  const clientId = String(token?.client_id || '');
  const clientName = String(token?.client_name || '').trim().toLowerCase();
  const belongs = row => String(row?.client_id ?? row?.clientId ?? '') === clientId || (!!clientName && String(row?.client_name || row?.client || '').trim().toLowerCase() === clientName);
  const clients = (data.clients || []).filter(row => String(row.id) === clientId);
  if (!clients.length && clientName) clients.push({id:clientId,name:token.client_name});
  return {
    settings: publicSettings,
    clients,
    projects: (data.projects || []).filter(belongs), tasks: (data.tasks || []).filter(row => belongs(row) && row.client_visibility !== false && row.is_internal !== true),
    project_tasks: (data.project_tasks || []).filter(row => belongs(row) && row.client_visibility !== false && row.is_internal !== true), invoices: (data.invoices || []).filter(belongs),
    team_tasks: (data.team_tasks || []).filter(row => row.client_visibility === true && belongs(row)),
    contracts: (data.contracts || []).filter(belongs), proposals: (data.proposals || []).filter(belongs),
    brief_forms: (data.brief_forms || []).filter(row => belongs(row) && ['sent','submitted','accepted'].includes(row.status)).map(row => ({id:row.id,title:row.title,description:row.description,items:row.items,questions:row.questions,status:row.status,project_id:row.project_id})),
    reviews: (data.reviews || []).filter(belongs), svc_orders: (data.svc_orders || []).filter(belongs),
    services: data.services || [], standalone_packages: data.standalone_packages || [],
    portfolio_projects: data.portfolio_projects || [], client_portals: (data.client_portals || []).filter(belongs)
  };
}

async function publicSnapshot(store, input) {
  const type = String(input.type || '');
  if (!['store','reviews_public','review','client_portal'].includes(type)) return null;
  const token = String(input.token || '').trim();
  const username = String(input.username || '').trim().toLowerCase();
  const uid = String(input.uid || '').trim();
  if ((type === 'review' || type === 'client_portal') && !token) return null;
  const candidates = await store.publicStudioCandidates({ token, username, uid: token ? uid : (type === 'store' || type === 'reviews_public' ? uid : '') });
  for (const row of candidates) {
    const data = unwrapStudio(row.data);
    const tokens = Array.isArray(data.public_tokens) ? data.public_tokens : [];
    let matching = token ? tokens.find(item => item?.token === token && !item.revoked && (!item.expires_at || new Date(item.expires_at) > new Date()) && (item.entity_type === type || (type === 'reviews_public' && item.entity_type === 'review'))) : null;
    if (token && !matching) {
      const collection = type === 'client_portal' ? data.client_portals : type === 'review' ? data.reviews : type === 'store' ? data.stores : [];
      const entity = (collection || []).find(item => [item?.token, item?.public_token, item?.shareToken].includes(token));
      if (entity) matching = { token, entity_type:type, entity_id:entity.id, client_id:entity.client_id || null, client_name:entity.client_name || '', allowed_sections:[], allow_multiple:true };
    }
    if (token && !matching) continue;
    if (!token && username && ![row.username_index,data.settings?.username,data.settings?.store_slug].some(value => String(value || '').toLowerCase() === username)) continue;
    if (type === 'client_portal') {
      const portal = (data.client_portals || []).find(item => String(item.id) === String(matching?.entity_id));
      if (portal?.client_id && !matching.client_id) matching.client_id = portal.client_id;
      if (portal?.client_name && !matching.client_name) matching.client_name = portal.client_name;
    }
    if (type === 'client_portal' && !matching?.client_id) continue;
    const view = publicView(data, type, matching);
    if (type === 'store' || type === 'reviews_public') {
      try {
        const queued = await store.query('public_reviews', {
          op:'select', columns:'id,data', filters:[{op:'eq',column:'user_id',value:row.user_id}], limit:200
        });
        const seen = new Set((view.reviews || []).map(item => String(item.id)));
        for (const record of queued || []) {
          const payload = parseMaybe(record.data) || {};
          const review = parseMaybe(payload.review_data) || payload;
          if (!review.id || review.public_visible === false || payload.public_visible === false || seen.has(String(review.id))) continue;
          view.reviews.push(review);
          seen.add(String(review.id));
        }
      } catch (error) { console.warn('Public reviews unavailable:', error); }
    }
    return { uid: row.user_id, data: view, token: matching || null };
  }
  return null;
}

async function deleteOwnReview(store, userId, reviewId) {
  const ownerFilter = [{op:'eq',column:'user_id',value:userId}];
  const studio = await store.query('studio_data', {op:'select',columns:'user_id,data',filters:ownerFilter,single:true});
  const publicRows = await store.query('public_reviews', {op:'select',columns:'id,data',filters:ownerFilter,limit:500});
  const queueRows = await store.query('review_queue', {op:'select',columns:'id,data',filters:ownerFilter,limit:500});
  const publicMatches = (publicRows || []).filter(row => String(parseMaybe(parseMaybe(row.data)?.review_data || row.data)?.id) === reviewId);
  const queueMatches = (queueRows || []).filter(row => String(parseMaybe(parseMaybe(row.data)?.review_json)?.id) === reviewId);
  const root = parseMaybe(studio?.data);
  let current = root;
  for (let i = 0; i < 4 && current && typeof current === 'object' && !Array.isArray(current.reviews) && current.data; i++) {
    current.data = parseMaybe(current.data);
    current = current.data;
  }
  const studioMatches = Array.isArray(current?.reviews) ? current.reviews.filter(review => String(review?.id) === reviewId) : [];
  if (!studioMatches.length && !publicMatches.length && !queueMatches.length) return false;
  if (studioMatches.length) {
    current.reviews = current.reviews.filter(review => String(review?.id) !== reviewId);
    await store.query('studio_data', {op:'update',payload:{data:root},filters:ownerFilter});
  }
  for (const row of publicMatches) await store.query('public_reviews', {op:'delete',filters:[...ownerFilter,{op:'eq',column:'id',value:row.id}]});
  for (const row of queueMatches) await store.query('review_queue', {op:'delete',filters:[...ownerFilter,{op:'eq',column:'id',value:row.id}]});
  return true;
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
  async chatMediaFiles(userId) {
    const db=await readLocalDb();
    return (db.public_client_portal_events||[]).filter(row=>String(row.user_id)===String(userId)).filter(row=>{const data=parseMaybe(row.data)||{};return data.event_type==='portal_chat'&&data.event_data?.attachment;}).map(row=>{const data=parseMaybe(row.data);const file=data.event_data.attachment;return {id:row.id,client_id:data.client_id,kind:file.kind,name:file.name||'',bytes:Number(file.bytes||0),created_at:row.created_at};});
  }
  async chatMediaBytes(userId) {
    const db=await readLocalDb();
    return (db.public_client_portal_events||[]).filter(row=>String(row.user_id)===String(userId)).reduce((sum,row)=>sum+Number((parseMaybe(row.data)||{}).event_data?.attachment?.bytes||0),0);
  }
  async publicStudioCandidates({ token, username, uid }) {
    const db = await readLocalDb();
    return (db.studio_data || []).filter(row =>
      (!uid || String(row.user_id) === uid) &&
      (!username || String(row.username_index || unwrapStudio(row.data).settings?.username || '').toLowerCase() === username) &&
      (!token || JSON.stringify(row.data).includes(token))
    ).slice(0, 20);
  }
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

  async activateSerial(code, userId) {
    const db = await readLocalDb();
    const serial = db.serial_keys.find(row =>
      String(row.code || row.key_code || '').toUpperCase() === String(code || '').toUpperCase()
    );
    if (!serial) return { reason: 'not_found' };
    if (serial.status !== 'unused' || serial.user_id) {
      return { reason: String(serial.user_id) === String(userId) ? 'already_yours' : 'already_used', serial: decodeJsonFields(serial) };
    }
    const activatedAt = new Date();
    let expiresAt = null;
    if (serial.billing === 'annual') {
      expiresAt = new Date(activatedAt); expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    } else if (serial.billing !== 'lifetime') {
      expiresAt = new Date(activatedAt); expiresAt.setMonth(expiresAt.getMonth() + 1);
    }
    Object.assign(serial, {
      status: 'active', user_id: userId,
      activated_at: activatedAt.toISOString(),
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      updated_at: activatedAt.toISOString()
    });
    await writeLocalDb(db);
    return { serial: decodeJsonFields(serial) };
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

  async adminCreateUser(email, password, meta, isAdmin) {
    const user = await this.createUser(email, password, meta);
    const db = await readLocalDb();
    const row = db.ordo_users.find(item => item.id === user.id);
    row.is_admin = !!isAdmin;
    row.updated_at = now();
    await writeLocalDb(db);
    return row;
  }

  async adminUpdateUser(identifier, attrs) {
    const db = await readLocalDb();
    const row = db.ordo_users.find(item => item.id === identifier || item.email === normalizeEmail(identifier));
    if (!row) return null;
    if (Object.prototype.hasOwnProperty.call(attrs, 'is_admin')) row.is_admin = !!attrs.is_admin;
    if (attrs.status) row.status = attrs.status;
    if (attrs.password) row.password_hash = hashPassword(attrs.password);
    for (const key of ['name', 'phone', 'studio']) if (Object.prototype.hasOwnProperty.call(attrs, key)) row[key] = attrs[key] || '';
    row.updated_at = now();
    await writeLocalDb(db);
    return row;
  }

  async adminDeleteUser(id) {
    const db = await readLocalDb();
    const exists = db.ordo_users.some(item => item.id === id);
    if (!exists) return false;
    db.ordo_users = db.ordo_users.filter(item => item.id !== id);
    db.ordo_sessions = db.ordo_sessions.filter(item => item.user_id !== id);
    for (const key of Object.keys(db)) {
      if (!Array.isArray(db[key])) continue;
      if (key === 'serial_keys') {
        db[key] = db[key].map(item => item.user_id === id
          ? { ...item, user_id:null, status:'unused', activated_at:null, expires_at:null, updated_at:now() }
          : item);
      } else if (!['ordo_users', 'ordo_sessions'].includes(key)) {
        db[key] = db[key].filter(item => item.user_id !== id);
      }
    }
    await writeLocalDb(db);
    return true;
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
      if (isProfile) out = out.map(row => ({
        id: row.id,
        email: row.email,
        name: row.name,
        phone: row.phone,
        studio: row.studio,
        is_admin: !!row.is_admin,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at
      }));
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

let postgresSchemaReady;

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
  if (!postgresSchemaReady) {
    postgresSchemaReady = Promise.all([
      query('ALTER TABLE serial_keys ADD COLUMN IF NOT EXISTS note text, ADD COLUMN IF NOT EXISTS code_type text, ADD COLUMN IF NOT EXISTS price numeric(10,2) NOT NULL DEFAULT 0'),
      query("ALTER TABLE ordo_users ADD COLUMN IF NOT EXISTS auth_provider text NOT NULL DEFAULT 'email', ADD COLUMN IF NOT EXISTS google_sub text DEFAULT ''")
    ])
      .catch(error => {
        postgresSchemaReady = null;
        throw error;
      });
  }
  await postgresSchemaReady;
  return {
    async chatMediaFiles(userId) {
      const rows=await query("SELECT id, created_at, data::jsonb #>> '{client_id}' AS client_id, data::jsonb #>> '{event_data,attachment,kind}' AS kind, data::jsonb #>> '{event_data,attachment,name}' AS name, data::jsonb #>> '{event_data,attachment,bytes}' AS bytes FROM public_client_portal_events WHERE user_id=$1 AND data::jsonb #>> '{event_type}'='portal_chat' AND data::jsonb #>> '{event_data,attachment,kind}' IS NOT NULL ORDER BY created_at DESC LIMIT 500",[userId]);
      return rows.map(row=>({...row,bytes:Number(row.bytes||0)}));
    },
    async chatMediaBytes(userId) {
      const rows=await query("SELECT COALESCE(SUM(CASE WHEN (data::jsonb #>> '{event_data,attachment,bytes}') ~ '^[0-9]+$' THEN (data::jsonb #>> '{event_data,attachment,bytes}')::bigint ELSE 0 END),0) AS bytes FROM public_client_portal_events WHERE user_id=$1",[userId]);
      return Number(rows[0]?.bytes||0);
    },
    async publicStudioCandidates({ token, username, uid }) {
      const clauses = [];
      const params = [];
      if (uid) { params.push(uid); clauses.push(`user_id = $${params.length}`); }
      if (username) {
        params.push(username);
        const exact = `$${params.length}`;
        params.push('%' + username.replace(/[\\%_]/g, '\\$&') + '%');
        clauses.push(`(lower(username_index) = ${exact} OR data::text ILIKE $${params.length} ESCAPE '\\')`);
      }
      if (token) { params.push('%' + token.replace(/[\\%_]/g, '\\$&') + '%'); clauses.push(`data::text LIKE $${params.length} ESCAPE '\\'`); }
      if (!clauses.length) return [];
      return query(`SELECT user_id, data, username_index FROM studio_data WHERE ${clauses.join(' AND ')} LIMIT 20`, params);
    },
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
    async activateSerial(code, userId) {
      const rows = await query(
        `UPDATE serial_keys
         SET status='active', user_id=$2, activated_at=NOW(),
             expires_at=CASE
               WHEN billing='lifetime' THEN NULL
               WHEN billing='annual' THEN NOW() + INTERVAL '1 year'
               ELSE NOW() + INTERVAL '1 month'
             END,
             updated_at=NOW()
         WHERE (UPPER(code)=UPPER($1) OR UPPER(COALESCE(key_code,''))=UPPER($1))
           AND status='unused' AND user_id IS NULL
         RETURNING *`,
        [code, userId]
      );
      if (rows[0]) return { serial: decodeJsonFields(rows[0]) };
      const existing = await query(
        `SELECT * FROM serial_keys
         WHERE UPPER(code)=UPPER($1) OR UPPER(COALESCE(key_code,''))=UPPER($1)
         LIMIT 1`,
        [code]
      );
      if (!existing[0]) return { reason: 'not_found' };
      return {
        reason: String(existing[0].user_id) === String(userId) ? 'already_yours' : 'already_used',
        serial: decodeJsonFields(existing[0])
      };
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
    async adminCreateUser(email, password, meta, isAdmin) {
      const user = await this.createUser(email, password, meta);
      if (!isAdmin) return user;
      const rows = await query('UPDATE ordo_users SET is_admin=true, updated_at=NOW() WHERE id=$1 RETURNING *', [user.id]);
      return rows[0] || user;
    },
    async adminUpdateUser(identifier, attrs) {
      const current = String(identifier).includes('@')
        ? await this.userByEmail(identifier)
        : await this.userById(identifier);
      if (!current) return null;
      if (attrs.password) {
        await query('UPDATE ordo_users SET password_hash=$1, updated_at=NOW() WHERE id=$2', [hashPassword(attrs.password), current.id]);
      }
      const rows = await query(
        'UPDATE ordo_users SET name=$1, phone=$2, studio=$3, is_admin=$4, status=$5, updated_at=NOW() WHERE id=$6 RETURNING *',
        [
          attrs.name ?? current.name ?? '',
          attrs.phone ?? current.phone ?? '',
          attrs.studio ?? current.studio ?? '',
          Object.prototype.hasOwnProperty.call(attrs, 'is_admin') ? !!attrs.is_admin : !!current.is_admin,
          attrs.status || current.status || 'active',
          current.id
        ]
      );
      return rows[0] || null;
    },
    async adminDeleteUser(id) {
      const rows = await query('DELETE FROM ordo_users WHERE id=$1 RETURNING id', [id]);
      return !!rows[0];
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
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
    try { return JSON.parse(String(req.body)); } catch { return {}; }
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

async function currentUser(req, store) {
  const token = parseCookies(req)[sessionCookieName(req)];
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
      setCookie(res, token, req);
      return ok(res, { user: userPayload(user), session: sessionPayload(user, token) });
    }

    if (postAction === 'auth.login') {
      const email = normalizeEmail(input.email);
      const user = await store.userByEmail(email);
      if (!user || !verifyPassword(input.password || '', user.password_hash)) return fail(res, 'البريد الإلكتروني أو كلمة المرور غير صحيحة', 401, 'invalid_login');
      if (user.status !== 'active') return fail(res, 'هذا الحساب موقوف', 403, 'account_disabled');
      const token = await store.createSession(user.id);
      setCookie(res, token, req);
      return ok(res, { user: userPayload(user), session: sessionPayload(user, token) });
    }

    if (postAction === 'auth.logout') {
      const token = parseCookies(req)[sessionCookieName(req)];
      if (token) await store.deleteSession(token);
      clearCookie(res, req);
      return ok(res, null);
    }

    if (postAction === 'auth.update') {
      const { user } = await currentUser(req, store);
      if (!user) return fail(res, 'Login required', 401, 'login_required');
      const nextAvatar = input.attributes?.data?.avatarUrl ?? input.attributes?.data?.avatar_url;
      if (nextAvatar !== undefined) {
        const info = await storageInfo(store,user.id);
        const candidate = info.used_bytes - imageBytes(user.avatar_url) + imageBytes(nextAvatar);
        if (!mayIncreaseImageUsage(info.used_bytes,candidate,info.limit_bytes,info.uploads_enabled)) return fail(res,'مساحة الصور امتلأت أو رفع الصور غير متاح',413,'storage_quota_exceeded');
      }
      const updated = await store.updateUser(user.id, input.attributes || {});
      return ok(res, { user: userPayload(updated) });
    }

    if (postAction === 'auth.reset') {
      return ok(res, { message: 'Password reset emails are not enabled yet. Admin can change the password from the panel.' });
    }

    if (postAction === 'serial.activate') {
      const { user } = await currentUser(req, store);
      if (!user) return fail(res, 'Login required', 401, 'login_required');
      const code = String(input.code || '').trim().toUpperCase();
      if (!code) return fail(res, 'أدخل كود الاشتراك', 400, 'code_required');
      const result = await store.activateSerial(code, user.id);
      if (result.reason === 'not_found') return fail(res, 'الكود غير موجود', 404, 'serial_not_found');
      if (result.reason === 'already_used') return fail(res, 'هذا الكود مستخدم مسبقاً', 409, 'serial_used');
      return ok(res, { serial: result.serial, already_active: result.reason === 'already_yours' });
    }

    if (postAction === 'public.snapshot') {
      const snapshot = await publicSnapshot(store, input);
      if (!snapshot) return fail(res, 'الرابط غير صالح أو غير متاح', 404, 'public_not_found');
      return ok(res, snapshot);
    }

    if(postAction==='finance.features'){
      const {user}=await currentUser(req,store);
      if(!user)return fail(res,'يلزم تسجيل الدخول',401,'login_required');
      return ok(res,{features:await financeFeatureAccess(store,user)});
    }

    if (['public.portalChat.list','public.portalChat.send','public.portalChat.media','public.portalChat.delete','public.portalChat.clear','portalChat.list','portalChat.send','portalChat.media','portalChat.delete','portalChat.clear','portalChat.inbox'].includes(postAction)) {
      const isPublic=postAction.startsWith('public.');
      const snapshot=isPublic ? await publicSnapshot(store,{type:'client_portal',token:input.token}) : null;
      const account=isPublic ? null : await currentUser(req,store);
      const uid=isPublic ? snapshot?.uid : account?.user?.id;
      if(!uid) return fail(res,isPublic?'رابط البوابة غير صالح':'يلزم تسجيل الدخول',isPublic?404:401,'chat_auth_required');
      const access=await portalChatAccess(store,uid);
      if(!access.enabled) return fail(res,'مراسلة بوابة العميل غير متاحة لهذه الباقة أو الحساب',403,'chat_disabled');
      const verb=postAction.split('.').at(-1);
      if(verb==='inbox'){
        if(isPublic)return fail(res,'غير مسموح',403,'forbidden');
        const rows=await store.query('public_client_portal_events',{op:'select',columns:'id,data,created_at',filters:[{op:'eq',column:'user_id',value:uid}],order:{column:'created_at',ascending:false},limit:500});
        const items={};
        for(const row of rows||[]){const data=parseMaybe(row.data)||{};const id=String(data.client_id||'');if(data.event_type==='portal_chat'&&!data.event_data?.deleted&&!data.event_data?.hidden_for?.includes('owner')&&id&&!items[id])items[id]=portalChatPublicRow(row);}
        return ok(res,{items});
      }
      const clientId=String(isPublic?snapshot.token.client_id:input.client_id||'');
      if(!clientId) return fail(res,'اختر العميل',400,'client_required');
      if(!isPublic && !(access.data.clients||[]).some(client=>String(client.id)===clientId)) return fail(res,'العميل غير موجود',403,'client_not_found');
      if(verb==='send') {
        const body=String(input.body||'').trim().slice(0,5000);
        let attachment;
        try { attachment=portalChatAttachment(input.attachment,access); }
        catch(error){return fail(res,error.message,error.status||400,error.code||'invalid_attachment');}
        if(!body&&!attachment) return fail(res,'اكتب رسالة أو أرفق ملفاً',400,'empty_message');
        const recentRows=await store.query('public_client_portal_events',{op:'select',columns:'data,created_at',filters:[{op:'eq',column:'user_id',value:uid}],order:{column:'created_at',ascending:false},limit:500});
        const cutoff=Date.now()-60000;
        const recentCount=(recentRows||[]).filter(item=>{const row=parseMaybe(item.data)||{};return row.event_type==='portal_chat'&&String(row.client_id)===clientId&&row.event_data?.sender===(isPublic?'client':'owner')&&new Date(item.created_at).getTime()>cutoff;}).length;
        if(recentCount>=15)return fail(res,'انتظر قليلاً قبل إرسال رسائل إضافية',429,'chat_rate_limited');
        if(attachment){
          const info=await storageInfo(store,uid);
          if(!info.uploads_enabled||info.used_bytes+attachment.bytes>info.limit_bytes)return fail(res,'مساحة التخزين غير كافية للمرفق',413,'storage_quota_exceeded');
        }
        const row=await store.query('public_client_portal_events',{op:'insert',payload:{id:uuid(),user_id:uid,data:{client_id:clientId,event_type:'portal_chat',event_data:{sender:isPublic?'client':'owner',body,attachment}},created_at:now()},single:true});
        return ok(res,{message:portalChatPublicRow(row)});
      }
      const rows=await store.query('public_client_portal_events',{op:'select',columns:'id,data,created_at',filters:[{op:'eq',column:'user_id',value:uid}],order:{column:'created_at',ascending:false},limit:500});
      const filtered=(rows||[]).filter(row=>{const data=parseMaybe(row.data)||{};return data.event_type==='portal_chat'&&String(data.client_id)===clientId;});
      if(verb==='clear') {
        const actor=isPublic?'client':'owner';
        const permanent=input.scope==='everyone';
        if(permanent&&isPublic)return fail(res,'الحذف النهائي للمحادثة متاح لصاحب الحساب فقط',403,'forbidden');
        for(const row of filtered){
          const data=parseMaybe(row.data)||{};
          const message=data.event_data||{};
          if(permanent){
            await store.query('public_client_portal_events',{op:'delete',filters:[{op:'eq',column:'id',value:row.id},{op:'eq',column:'user_id',value:uid}]});
          } else if(!message.hidden_for?.includes(actor)) {
            const updated={...data,event_data:{...message,hidden_for:[...new Set([...(message.hidden_for||[]),actor])]}};
            await store.query('public_client_portal_events',{op:'update',payload:{data:updated},filters:[{op:'eq',column:'id',value:row.id},{op:'eq',column:'user_id',value:uid}]});
          }
        }
        return ok(res,{cleared:true,scope:permanent?'everyone':'me'});
      }
      if(verb==='delete') {
        const row=filtered.find(item=>String(item.id)===String(input.message_id));
        if(!row)return fail(res,'الرسالة غير موجودة',404,'message_not_found');
        const data=parseMaybe(row.data)||{};
        const message=data.event_data||{};
        const actor=isPublic?'client':'owner';
        const scope=input.scope==='everyone'?'everyone':'me';
        if(scope==='me'){
          if(message.hidden_for?.includes(actor))return ok(res,{deleted:true,scope});
          const updated={...data,event_data:{...message,hidden_for:[...new Set([...(message.hidden_for||[]),actor])]}};
          const hidden=await store.query('public_client_portal_events',{op:'update',payload:{data:updated},filters:[{op:'eq',column:'id',value:row.id},{op:'eq',column:'user_id',value:uid}],single:true});
          if(!hidden)return fail(res,'تعذر حذف الرسالة',404,'message_not_found');
          return ok(res,{deleted:true,scope});
        }
        if(message.sender!==actor)return fail(res,'يمكنك حذف رسائلك فقط لدى الجميع',403,'forbidden');
        if(message.deleted)return ok(res,{deleted:true});
        const updated={...data,event_data:{...message,body:'',attachment:null,deleted:true,deleted_at:now()}};
        const deleted=await store.query('public_client_portal_events',{op:'update',payload:{data:updated},filters:[{op:'eq',column:'id',value:row.id},{op:'eq',column:'user_id',value:uid}],single:true});
        if(!deleted)return fail(res,'تعذر حذف الرسالة',404,'message_not_found');
        return ok(res,{deleted:true});
      }
      if(verb==='media') {
        const row=filtered.find(item=>String(item.id)===String(input.message_id));
        const mediaMessage=(parseMaybe(row?.data)||{}).event_data||{};
        const attachment=mediaMessage.deleted||mediaMessage.hidden_for?.includes(isPublic?'client':'owner')?null:mediaMessage.attachment;
        if(!attachment) return fail(res,'المرفق غير موجود',404,'media_not_found');
        return ok(res,{data:attachment.data,mime:attachment.mime,name:attachment.name});
      }
      return ok(res,{messages:filtered.filter(row=>{const message=(parseMaybe(row.data)||{}).event_data||{};return !message.deleted&&!(message.hidden_for||[]).includes(isPublic?'client':'owner');}).slice(0,100).reverse().map(portalChatPublicRow),features:{images:access.images,voice:access.voice}});
    }

    if (postAction === 'public.portalEvent') {
      const snapshot = await publicSnapshot(store, {type:'client_portal', token:input.token});
      if (!snapshot) return fail(res, 'رابط البوابة غير صالح', 404, 'public_not_found');
      const eventType = String(input.event_type || '');
      if (!['svc_order','meeting_request','task_received','revision_request','task_note','brief_submit'].includes(eventType)) return fail(res, 'نوع الطلب غير صحيح');
      const payload = input.event_data && typeof input.event_data === 'object' ? input.event_data : {};
      if (JSON.stringify(payload).length > 10000) return fail(res, 'الطلب كبير جداً', 413, 'too_large');
      if(eventType==='brief_submit'){
        const form=(snapshot.data.brief_forms||[]).find(item=>String(item.id)===String(payload.form_id));
        if(!form||form.status!=='sent')return fail(res,'البريف غير متاح لهذا العميل',403,'brief_not_available');
        const supplied=payload.answers&&typeof payload.answers==='object'&&!Array.isArray(payload.answers)?payload.answers:{};
        const questions=Array.isArray(form.questions)?form.questions:[];
        const answers={};
        for(const q of questions){
          const answer=supplied[q.id];
          if(q.type==='checkbox'){
            const allowed=new Set((q.options||[]).map(option=>String(option.label||option)));
            const values=Array.isArray(answer)?answer.map(value=>String(value).slice(0,200)):[];
            if(values.length>30||values.some(value=>!allowed.has(value)))return fail(res,'إجابة غير صحيحة',400,'invalid_brief_answer');
            if(q.required&&!values.length)return fail(res,'أكمل الأسئلة المطلوبة',400,'brief_required');
            answers[q.id]=values;
          }else{
            const value=typeof answer==='string'?answer.trim():'';
            if(value.length>(q.type==='essay'?3000:200))return fail(res,'الإجابة طويلة جدًا',400,'brief_answer_too_long');
            if(q.required&&!value)return fail(res,'أكمل الأسئلة المطلوبة',400,'brief_required');
            if(q.type==='image'&&value&&!(q.options||[]).some(option=>String(option.label||option)===value))return fail(res,'اختيار الصورة غير صحيح',400,'invalid_brief_image');
            answers[q.id]=value;
          }
        }
        const previous=await store.query('public_client_portal_events',{op:'select',columns:'id,data',filters:[{op:'eq',column:'user_id',value:snapshot.uid}],limit:500});
        if((previous||[]).some(row=>{const data=parseMaybe(row.data)||{};return data.event_type==='brief_submit'&&String(data.client_id)===String(snapshot.token.client_id)&&String(data.event_data?.form_id)===String(form.id);}))return fail(res,'تم إرسال هذا البريف من قبل',409,'brief_already_submitted');
        payload.form_id=form.id;payload.answers=answers;payload.project_id=form.project_id||'';
      }
      const taskId = String(payload.task_id || payload.taskId || '');
      if (['task_received','revision_request','task_note'].includes(eventType) && ![...(snapshot.data.tasks || []), ...(snapshot.data.project_tasks || []), ...(snapshot.data.team_tasks || [])].some(item => String(item.id) === taskId)) return fail(res, 'المهمة غير متاحة', 403, 'task_not_available');
      const row = await store.query('public_client_portal_events', {op:'insert', payload:{
        id:uuid(), user_id:snapshot.uid, data:{client_id:snapshot.token.client_id,event_type:eventType,event_data:payload}, created_at:now()
      }, single:true});
      return ok(res, {id:row.id});
    }

    if (postAction === 'public.review.submit') {
      const type = input.type === 'client_portal' ? 'client_portal' : 'review';
      const snapshot = await publicSnapshot(store, {type,token:input.token});
      if (!snapshot) return fail(res, 'رابط التقييم غير صالح', 404, 'public_not_found');
      const supplied = input.review && typeof input.review === 'object' ? input.review : {};
      const name = String(supplied.client_name || '').trim().slice(0, 120);
      const comment = String(supplied.comment || '').trim().slice(0, 3000);
      const stars = Number(supplied.stars || supplied.rating);
      if (!name || !Number.isInteger(stars) || stars < 1 || stars > 5) return fail(res, 'بيانات التقييم غير صحيحة');
      const taskId = String(supplied.task_id || '');
      if (type === 'client_portal' && taskId && ![...(snapshot.data.tasks || []), ...(snapshot.data.project_tasks || []), ...(snapshot.data.team_tasks || [])].some(item => String(item.id) === taskId)) return fail(res, 'المهمة غير متاحة', 403, 'task_not_available');
      if (type === 'review' && snapshot.token.allow_multiple !== true) {
        const prior = await store.query('public_reviews', {op:'select',columns:'id,data',filters:[{op:'eq',column:'user_id',value:snapshot.uid}],limit:500});
        if ((prior || []).some(row => (parseMaybe(row.data)?.review_data || {}).token === input.token)) return fail(res, 'تم استخدام رابط التقييم من قبل', 409, 'review_already_submitted');
      }
      const review = {
        id:uuid(), client_name:name, comment, text:comment, stars, rating:stars,
        client_id:type === 'client_portal' ? snapshot.token.client_id : (snapshot.token.client_id || null),
        task_id:taskId || null, task_title:String(supplied.task_title || '').slice(0, 200),
        token:String(input.token), public_visible:true, created_at:now(), source:'review_form'
      };
      let saved = false;
      try {
        await store.query('review_queue', {op:'insert',payload:{id:uuid(),user_id:snapshot.uid,data:{review_json:review},processed:false,created_at:now()},single:true});
        saved = true;
      } catch (error) { console.warn('Review queue write failed:', error); }
      try {
        await store.query('public_reviews', {op:'insert',payload:{id:uuid(),user_id:snapshot.uid,data:{review_data:review,public_visible:true},created_at:now()},single:true});
        saved = true;
      } catch (error) { console.warn('Public review write failed:', error); }
      if (!saved) return fail(res, 'تعذر حفظ التقييم', 500, 'review_save_failed');
      return ok(res, {id:review.id});
    }

    if (postAction === 'reviews.delete') {
      const { user } = await currentUser(req, store);
      if (!user) return fail(res, 'Login required', 401, 'login_required');
      const reviewId = String(input.review_id || '').trim();
      if (!reviewId) return fail(res, 'معرّف التقييم مطلوب', 400, 'review_id_required');
      const deleted = await deleteOwnReview(store, user.id, reviewId);
      if (!deleted) return fail(res, 'التقييم غير موجود', 404, 'review_not_found');
      return ok(res, {deleted:true});
    }

    if (postAction === 'admin.users.create') {
      const { user } = await currentUser(req, store);
      if (!user?.is_admin) return fail(res, 'Admin only', 403, 'admin_only');
      const email = normalizeEmail(input.email);
      const password = String(input.password || '');
      const metadata = input.metadata && typeof input.metadata === 'object' ? input.metadata : {};
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 'البريد الإلكتروني غير صحيح');
      if (password.length < 8) return fail(res, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل');
      const created = await store.adminCreateUser(email, password, metadata, !!input.is_admin);
      return ok(res, { user: userPayload(created) });
    }

    if (postAction === 'admin.users.update') {
      const { user } = await currentUser(req, store);
      if (!user?.is_admin) return fail(res, 'Admin only', 403, 'admin_only');
      const identifier = String(input.user_id || input.email || '');
      const attrs = input.attributes && typeof input.attributes === 'object' ? input.attributes : {};
      if (!identifier) return fail(res, 'User is required');
      if (attrs.password && String(attrs.password).length < 8) return fail(res, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل');
      if (attrs.is_admin === false && (identifier === user.id || normalizeEmail(identifier) === user.email)) {
        return fail(res, 'لا يمكن للمشرف إلغاء صلاحية حسابه الحالي', 400, 'cannot_demote_self');
      }
      const updated = await store.adminUpdateUser(identifier, attrs);
      if (!updated) return fail(res, 'المستخدم غير موجود', 404, 'user_not_found');
      return ok(res, { user: userPayload(updated) });
    }

    if (postAction === 'admin.users.delete') {
      const { user } = await currentUser(req, store);
      if (!user?.is_admin) return fail(res, 'Admin only', 403, 'admin_only');
      const userId = String(input.user_id || '');
      if (!userId) return fail(res, 'User is required');
      if (userId === user.id) return fail(res, 'لا يمكن للمشرف حذف حسابه الحالي', 400, 'cannot_delete_self');
      const deleted = await store.adminDeleteUser(userId);
      if (!deleted) return fail(res, 'المستخدم غير موجود', 404, 'user_not_found');
      return ok(res, { deleted:true });
    }

    if (postAction === 'storage.usage') {
      const { user } = await currentUser(req, store);
      if (!user) return fail(res, 'Login required', 401, 'login_required');
      const target = user.is_admin && input.user_id ? String(input.user_id) : user.id;
      return ok(res, await storageInfo(store, target));
    }

    if (postAction === 'storage.files' || postAction === 'storage.deleteFile') {
      const { user } = await currentUser(req, store);
      if (!user) return fail(res, 'يلزم تسجيل الدخول', 401, 'login_required');
      const filters=[{op:'eq',column:'user_id',value:user.id}];
      if(postAction === 'storage.files') return ok(res,{files:await store.chatMediaFiles(user.id)});
      const file=await store.query('public_client_portal_events',{op:'select',columns:'id,data',filters:[...filters,{op:'eq',column:'id',value:String(input.file_id||'')}],single:true});
      const data=parseMaybe(file?.data)||{};
      if(data.event_type!=='portal_chat'||!data.event_data?.attachment)return fail(res,'الملف غير موجود',404,'file_not_found');
      const updated={...data,event_data:{...data.event_data,attachment:null}};
      await store.query('public_client_portal_events',{op:'update',payload:{data:updated},filters:[...filters,{op:'eq',column:'id',value:file.id}]});
      return ok(res,{deleted:true});
    }

    if (postAction === 'db.query') {
      const { user } = await currentUser(req, store);
      const table = String(input.table || '');
      if (table !== 'profiles' && !TABLES.has(table)) return fail(res, `Table is not available: ${table}`, 400, 'table_not_allowed');
      const accessError = enforceAccess(table, input, user);
      if (accessError) return fail(res, accessError.message, accessError.status, accessError.code);
      if (user && !user.is_admin && ['studio_data','subscription_requests'].includes(table) && ['insert','upsert','update'].includes(input.op)) {
        const rows = Array.isArray(input.payload) ? input.payload : [input.payload];
        const info = await storageInfo(store, user.id);
        for (const row of rows.filter(Boolean)) {
          const newBytes = table === 'studio_data' && row.data !== undefined
            ? info.other_bytes + imageBytes(row.data)
            : table === 'subscription_requests'
              ? info.used_bytes + imageBytes(row)
              : info.used_bytes;
          if (!mayIncreaseImageUsage(info.used_bytes, newBytes, info.limit_bytes, info.uploads_enabled)) {
            return fail(res, info.uploads_enabled ? 'مساحة الصور امتلأت. احذف صورًا أو قم بترقية المساحة.' : 'رفع الصور غير متاح لهذا الحساب.', 413, 'storage_quota_exceeded');
          }
        }
      }
      if (!user && table === 'subscription_requests' && ['insert','upsert'].includes(input.op) && imageBytes(input.payload) > 2 * 1024 * 1024) {
        return fail(res, 'حجم صورة الإيصال كبير جداً', 413, 'image_too_large');
      }
      const data = await store.query(table, input, user);
      if (table === 'platform_settings' && input.op === 'select' && !user?.is_admin) {
        const publicRow = row => {
          if(!row) return row;
          const config = parseMaybe(row.config) || {};
          const {storage_overrides, portal_chat_overrides, protected_feature_overrides, ...publicConfig} = config;
          return {...row,config:publicConfig};
        };
        return ok(res,Array.isArray(data) ? data.map(publicRow) : publicRow(data));
      }
      if (['insert','upsert','update'].includes(input.op) && ['studio_data','public_store_items','public_tokens'].includes(table)) {
        const compact = row => row ? {id:row.id,user_id:row.user_id,updated_at:row.updated_at} : null;
        return ok(res, Array.isArray(data) ? data.map(compact) : compact(data));
      }
      return ok(res, data);
    }

    return fail(res, 'Unknown action', 404, 'unknown_action');
  } catch (error) {
    const status = error.code === 'email_exists' ? 409 : 500;
    return fail(res, error.message || 'Server error', status, error.code || 'server_error');
  }
}

export { publicSnapshot, deleteOwnReview, readBody, sessionCookieName, setCookie, clearCookie, currentUser, storageInfo, portalChatAccess, portalChatAttachment, portalChatPublicRow, financeFeatureAccess };
