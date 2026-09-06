/*
  Ordo Vercel configuration.
  Supabase is replaced by JavaScript/vercel_backend.js, which talks to api/index.js.
*/
(function(root){
  'use strict';

  var config = {
    LOCAL_ONLY: false,
    PORTABLE_NO_SERVER: false,
    NO_AUTH: false,
    NO_SUBSCRIPTIONS: false,
    DEFAULT_USER_ID: 'local_user',
    DEFAULT_EMAIL: 'local@ordo.test',
    DEFAULT_NAME: 'مستخدم محلي',
    SUPA_URL: '',
    SUPA_ANON: '',
    API_URL: '/api/index',
    STORAGE_MODE: 'vercel_postgres',
    DB_KEY: 'ordo_local_db_v1'
  };

  root.ORDO_CONFIG = Object.assign({}, config, root.ORDO_CONFIG || {});
  root.ORDO_LOCAL_ONLY = root.ORDO_CONFIG.LOCAL_ONLY === true;
  root.ORDO_PORTABLE_NO_SERVER = root.ORDO_CONFIG.PORTABLE_NO_SERVER === true || root.location.protocol === 'file:';
  root.ORDO_NO_AUTH = root.ORDO_CONFIG.NO_AUTH === true;
  root.ORDO_NO_SUBSCRIPTIONS = root.ORDO_CONFIG.NO_SUBSCRIPTIONS === true;
  root.SUPA_URL = root.ORDO_CONFIG.SUPA_URL || '';
  root.SUPA_ANON = root.ORDO_CONFIG.SUPA_ANON || '';
  root.SUPA_KEY = root.SUPA_ANON;

  function uid(){
    return 'local_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
  }

  function readDb(){
    try { return JSON.parse(root.localStorage.getItem(config.DB_KEY) || '{}') || {}; }
    catch(e){ return {}; }
  }

  function writeDb(db){
    try { root.localStorage.setItem(config.DB_KEY, JSON.stringify(db || {})); } catch(e){}
  }

  function tableRows(db, table){
    db[table] = Array.isArray(db[table]) ? db[table] : [];
    return db[table];
  }

  function clone(v){
    try { return JSON.parse(JSON.stringify(v)); } catch(e){ return v; }
  }

  function parseMaybe(v){
    if(typeof v === 'string'){
      try { return JSON.parse(v); } catch(e){}
    }
    return v;
  }

  function getPath(obj, path){
    if(!obj || !path) return undefined;
    var jsonPath = String(path).match(/^(.+)->>(.+)$/);
    if(jsonPath){
      var base = parseMaybe(obj[jsonPath[1]]);
      return base && base[jsonPath[2]];
    }
    return obj[path];
  }

  function likeToRegExp(pattern){
    var escaped = String(pattern || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
    return new RegExp('^' + escaped + '$', 'i');
  }

  function matches(row, filters){
    return filters.every(function(f){
      var val = getPath(row, f.column);
      if(f.op === 'eq') return String(val) === String(f.value);
      if(f.op === 'neq') return String(val) !== String(f.value);
      if(f.op === 'in') return (f.value || []).map(String).indexOf(String(val)) >= 0;
      if(f.op === 'is') return f.value === null ? (val === null || val === undefined) : val === f.value;
      if(f.op === 'like' || f.op === 'ilike') return likeToRegExp(f.value).test(String(val === undefined ? JSON.stringify(row) : val));
      return true;
    });
  }

  function project(row, columns){
    if(!columns || columns === '*' || columns.indexOf('*') >= 0) return clone(row);
    var out = {};
    columns.split(',').map(function(x){ return x.trim(); }).filter(Boolean).forEach(function(col){
      var clean = col.split(/\s+as\s+/i)[0].trim();
      if(clean && clean.indexOf('(') === -1) out[clean] = row[clean];
    });
    return out;
  }

  function makeResult(data, error, count){
    return Promise.resolve({ data: data, error: error || null, count: count == null ? null : count });
  }

  function localUser(email){
    return {
      id: root.ORDO_CONFIG.DEFAULT_USER_ID || 'local_user',
      email: email || root.ORDO_CONFIG.DEFAULT_EMAIL || 'local@ordo.test',
      app_metadata: { role: 'admin', is_admin: true, localOnly: true },
      user_metadata: {
        name: root.ORDO_CONFIG.DEFAULT_NAME || 'مستخدم محلي',
        full_name: root.ORDO_CONFIG.DEFAULT_NAME || 'مستخدم محلي',
        role: 'admin',
        is_admin: true,
        localOnly: true
      }
    };
  }

  function localSession(email){
    var user = localUser(email);
    return {
      user: user,
      access_token: 'local-only',
      token_type: 'bearer',
      expires_at: Math.floor(Date.now() / 1000) + 31536000
    };
  }

  function seedLocalUser(){
    if(!root.ORDO_NO_AUTH) return;
    try {
      var existing = JSON.parse(root.localStorage.getItem('studioOS_auth_v1') || '{}');
      var user = Object.assign({
        id: root.ORDO_CONFIG.DEFAULT_USER_ID || 'local_user',
        name: root.ORDO_CONFIG.DEFAULT_NAME || 'مستخدم محلي',
        email: root.ORDO_CONFIG.DEFAULT_EMAIL || 'local@ordo.test',
        phone: 'محلي',
        localOnly: true
      }, existing && existing.email ? existing : {});
      root.localStorage.setItem('studioOS_auth_v1', JSON.stringify(user));
    } catch(e){}
  }

  function makeBuilder(table){
    var state = {
      table: table,
      action: 'select',
      columns: '*',
      payload: null,
      filters: [],
      limit: null,
      range: null,
      single: false,
      maybeSingle: false,
      count: false,
      orderBy: null,
      deleting: false
    };

    var api = {
      select: function(columns, opts){ state.action = state.action || 'select'; state.columns = columns || '*'; state.count = !!(opts && opts.count); return api; },
      insert: function(payload){ state.action = 'insert'; state.payload = Array.isArray(payload) ? payload : [payload]; return api; },
      update: function(payload){ state.action = 'update'; state.payload = payload || {}; return api; },
      upsert: function(payload){ state.action = 'upsert'; state.payload = Array.isArray(payload) ? payload : [payload]; return api; },
      delete: function(){ state.action = 'delete'; state.deleting = true; return api; },
      eq: function(column, value){ state.filters.push({op:'eq', column:column, value:value}); return api; },
      neq: function(column, value){ state.filters.push({op:'neq', column:column, value:value}); return api; },
      in: function(column, value){ state.filters.push({op:'in', column:column, value:value}); return api; },
      is: function(column, value){ state.filters.push({op:'is', column:column, value:value}); return api; },
      like: function(column, value){ state.filters.push({op:'like', column:column, value:value}); return api; },
      ilike: function(column, value){ state.filters.push({op:'ilike', column:column, value:value}); return api; },
      or: function(){ return api; },
      order: function(column, opts){ state.orderBy = {column:column, ascending:!(opts && opts.ascending === false)}; return api; },
      limit: function(n){ state.limit = Number(n) || 0; return api; },
      range: function(from, to){ state.range = [Number(from)||0, Number(to)||0]; return api; },
      single: function(){ state.single = true; return api._execute(); },
      maybeSingle: function(){ state.maybeSingle = true; return api._execute(); },
      then: function(resolve, reject){ return api._execute().then(resolve, reject); },
      catch: function(reject){ return api._execute().catch(reject); },
      _execute: function(){
        var db = readDb();
        var rows = tableRows(db, table);
        var now = new Date().toISOString();
        var resultRows = rows.filter(function(r){ return matches(r, state.filters); });

        if(state.action === 'insert'){
          var inserted = state.payload.map(function(item){
            var row = Object.assign({}, item || {});
            if(row.id == null) row.id = uid();
            if(row.created_at == null) row.created_at = now;
            if(row.updated_at == null) row.updated_at = now;
            rows.push(row);
            return row;
          });
          writeDb(db);
          return makeResult(state.single || state.maybeSingle ? clone(inserted[0] || null) : clone(inserted));
        }

        if(state.action === 'upsert'){
          var upserted = state.payload.map(function(item){
            var row = Object.assign({}, item || {});
            var key = row.user_id != null ? 'user_id' : (row.token != null ? 'token' : 'id');
            if(row[key] == null) row[key] = uid();
            var idx = rows.findIndex(function(r){ return String(r[key]) === String(row[key]); });
            row.updated_at = row.updated_at || now;
            if(idx >= 0) rows[idx] = Object.assign({}, rows[idx], row);
            else {
              row.created_at = row.created_at || now;
              rows.push(row);
              idx = rows.length - 1;
            }
            return rows[idx];
          });
          writeDb(db);
          return makeResult(state.single || state.maybeSingle ? clone(upserted[0] || null) : clone(upserted));
        }

        if(state.action === 'update'){
          resultRows.forEach(function(row){ Object.assign(row, state.payload || {}, {updated_at:(state.payload && state.payload.updated_at) || now}); });
          writeDb(db);
          var updated = rows.filter(function(r){ return matches(r, state.filters); });
          return makeResult(state.single || state.maybeSingle ? clone(updated[0] || null) : clone(updated.map(function(r){ return project(r, state.columns); })));
        }

        if(state.action === 'delete'){
          var before = rows.length;
          db[table] = rows.filter(function(r){ return !matches(r, state.filters); });
          writeDb(db);
          return makeResult([], null, before - db[table].length);
        }

        if(state.orderBy){
          resultRows.sort(function(a,b){
            var av = getPath(a, state.orderBy.column);
            var bv = getPath(b, state.orderBy.column);
            if(av === bv) return 0;
            return (av > bv ? 1 : -1) * (state.orderBy.ascending ? 1 : -1);
          });
        }
        var total = resultRows.length;
        if(state.range) resultRows = resultRows.slice(state.range[0], state.range[1] + 1);
        if(state.limit != null) resultRows = resultRows.slice(0, state.limit);
        resultRows = resultRows.map(function(r){ return project(r, state.columns); });
        if(state.single) return makeResult(clone(resultRows[0] || null), resultRows[0] ? null : {message:'No rows'});
        if(state.maybeSingle) return makeResult(clone(resultRows[0] || null));
        return makeResult(clone(resultRows), null, state.count ? total : null);
      }
    };
    return api;
  }

  function makeClient(){
    return {
      from: function(table){ return makeBuilder(table); },
      channel: function(){
        return {
          on: function(){ return this; },
          subscribe: function(cb){ if(typeof cb === 'function') setTimeout(function(){ cb('LOCAL_ONLY'); }, 0); return this; },
          unsubscribe: function(){ return Promise.resolve(); }
        };
      },
      removeChannel: function(){ return Promise.resolve(); },
      auth: {
        getSession: function(){ return makeResult({session: root.ORDO_NO_AUTH ? localSession() : null}); },
        getUser: function(){ return makeResult({user: root.ORDO_NO_AUTH ? localUser() : null}); },
        signInWithPassword: function(creds){
          var user = localUser(creds && creds.email);
          root.localStorage.setItem('studioOS_auth_v1', JSON.stringify(user));
          return makeResult({user:user, session:{user:user, access_token:'local-only'}});
        },
        signUp: function(creds){
          var user = localUser(creds && creds.email);
          root.localStorage.setItem('studioOS_auth_v1', JSON.stringify(user));
          return makeResult({user:user, session:localSession(user.email)});
        },
        signOut: function(){ if(!root.ORDO_NO_AUTH) root.localStorage.removeItem('studioOS_auth_v1'); return makeResult(null); },
        refreshSession: function(){ return makeResult(localSession()); },
        onAuthStateChange: function(cb){
          if(root.ORDO_NO_AUTH && typeof cb === 'function') {
            setTimeout(function(){ cb('SIGNED_IN', localSession()); }, 0);
          }
          return { data:{ subscription:{ unsubscribe:function(){} } } };
        }
      },
      storage: {
        from: function(bucket){
          return {
            upload: function(path, file){
              var url = 'local-storage://' + bucket + '/' + path;
              try {
                var list = JSON.parse(root.localStorage.getItem('ordo_local_files') || '{}');
                list[url] = {name:file && file.name || path, type:file && file.type || '', saved_at:new Date().toISOString()};
                root.localStorage.setItem('ordo_local_files', JSON.stringify(list));
              } catch(e){}
              return makeResult({path:path, fullPath:url});
            },
            getPublicUrl: function(path){ return {data:{publicUrl:'local-storage://' + bucket + '/' + path}}; },
            createSignedUrl: function(path){ return makeResult({signedUrl:'local-storage://' + bucket + '/' + path}); },
            download: function(){ return makeResult(new Blob([''])); },
            list: function(){ return makeResult([]); },
            remove: function(){ return makeResult([]); }
          };
        }
      }
    };
  }

  function installLocalSupabase(){
    var local = {
      createClient: function(){
        console.info('[Ordo] Local-only Supabase shim active. Data is stored in localStorage.');
        return makeClient();
      }
    };
    try { Object.defineProperty(local, '__ordoLocalShim', {value:true}); } catch(e){}
    root.supabase = local;
  }

  if(root.ORDO_LOCAL_ONLY){
    seedLocalUser();
    var nativeFetch = root.fetch;
    root.fetch = function(input, init){
      var url = typeof input === 'string' ? input : (input && input.url) || '';
      if(String(url).indexOf('/rest/v1/') >= 0 || String(url).indexOf('/auth/v1/') >= 0 || String(url).indexOf('/storage/v1/') >= 0){
        console.info('[Ordo] Local-only fetch intercepted:', url);
        var responseBody = String(url).indexOf('select=') >= 0 ? '[]' : '{}';
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: 'LOCAL_ONLY',
          json: function(){ return Promise.resolve(JSON.parse(responseBody)); },
          text: function(){ return Promise.resolve(responseBody); },
          headers: { get: function(){ return null; } }
        });
      }
      if(typeof nativeFetch === 'function') return nativeFetch.apply(this, arguments);
      return Promise.reject(new Error('fetch is unavailable in local-only mode'));
    };
    installLocalSupabase();
    try {
      Object.defineProperty(root, 'supabase', {
        configurable: true,
        get: function(){ return root.__ordoSupabaseShim; },
        set: function(){ root.__ordoSupabaseShim = { createClient:function(){ return makeClient(); }, __ordoLocalShim:true }; }
      });
      root.__ordoSupabaseShim = { createClient:function(){ return makeClient(); }, __ordoLocalShim:true };
    } catch(e) {
      installLocalSupabase();
    }
  }
})(window);
