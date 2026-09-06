(function(root){
  'use strict';
  if(root.ORDO_LOCAL_ONLY) return;

  var saveTimer = null;
  var SAVE_DELAY = 700;

  function normalize(data){
    if(typeof data === 'string'){
      try { data = JSON.parse(data); } catch(e){ data = null; }
    }
    if(data && data.data && !data.tasks) data = normalize(data.data);
    if(!data || typeof data !== 'object') data = {};
    data.settings = data.settings || {};
    [
      'tasks','clients','transactions','invoices','goals','schedule','teams',
      'subscriptions','projects','project_tasks','task_collections','services',
      'standalone_packages','portfolio_projects','svc_orders','specializations',
      'client_portals','loans','budgets','statements','timeEntries','contracts',
      'stores','meetings','courses','reviews','wallets','wallet_transfers',
      'temp_todo_lists','archivedTasks'
    ].forEach(function(k){ if(!Array.isArray(data[k])) data[k] = []; });
    return data;
  }

  function uid(){
    return root._supaUserId || (function(){
      try {
        var sess = JSON.parse(root.localStorage.getItem('studioOS_auth_v1') || 'null');
        return sess && (sess.supaId || sess.id);
      } catch(e){ return null; }
    })();
  }

  function cacheKey(){
    return '_ordo_cache_' + (uid() || 'guest');
  }

  function readCache(){
    try { return normalize(root.localStorage.getItem(cacheKey())); }
    catch(e){ return null; }
  }

  function writeCache(data){
    try { root.localStorage.setItem(cacheKey(), JSON.stringify(data)); } catch(e){}
    try {
      var sess = JSON.parse(root.localStorage.getItem('studioOS_auth_v1') || 'null');
      var key = 'studioOS_v3_' + (sess && sess.id ? sess.id : (uid() || 'guest'));
      root.localStorage.setItem(key, JSON.stringify(data));
    } catch(e){}
  }

  function score(data){
    data = data || {};
    return (data.tasks||[]).length * 4 +
      (data.clients||[]).length * 3 +
      (data.invoices||[]).length * 3 +
      (data.transactions||[]).length * 2 +
      (data.projects||[]).length * 2 +
      (data.project_tasks||[]).length * 2 +
      (data.services||[]).length +
      (data.contracts||[]).length +
      (data.reviews||[]).length +
      (data.settings && Object.keys(data.settings).length ? 1 : 0);
  }

  function newer(a, b){
    var at = Date.parse(a && (a._savedAt || a.updated_at) || '') || 0;
    var bt = Date.parse(b && (b._savedAt || b.updated_at) || '') || 0;
    var as = score(a), bs = score(b);
    if(at || bt) return at >= bt ? a : b;
    if(as !== bs) return as > bs ? a : b;
    return a || b;
  }

  root.cloudLoad = async function(){
    var userId = uid();
    if(!userId || !root.supa) return readCache() || normalize(root.S);
    try {
      var res = await root.supa.from('studio_data').select('data,updated_at').eq('user_id', userId).maybeSingle();
      var remote = res && res.data ? normalize(res.data.data) : null;
      if(remote && res.data.updated_at && !remote.updated_at) remote.updated_at = res.data.updated_at;
      var local = readCache();
      var chosen = remote && local ? newer(remote, local) : (remote || local || normalize(root.S));
      root.S = normalize(chosen);
      writeCache(root.S);
      return root.S;
    } catch(e) {
      return readCache() || normalize(root.S);
    }
  };

  root.cloudSave = async function(data){
    var userId = uid();
    if(data) root.S = data;
    root.S = normalize(root.S);
    root.S._savedAt = new Date().toISOString();
    writeCache(root.S);
    if(!userId || !root.supa) return root.S;
    try {
      var username = root.S && root.S.settings && root.S.settings.username ? String(root.S.settings.username).toLowerCase() : null;
      await root.supa.from('studio_data').upsert({
        user_id:userId,
        data:JSON.stringify(root.S),
        username_index:username,
        updated_at:root.S._savedAt
      }, {onConflict:'user_id'});
      if(root.showSyncIndicator) root.showSyncIndicator('<i class="fa-solid fa-square-check" style="color:var(--accent3)"></i> محفوظ', '#4fd1a5');
    } catch(e) {
      if(root.showSyncIndicator) root.showSyncIndicator('<i class="fa-solid fa-triangle-exclamation"></i> محفوظ محلياً فقط', '#f7c948');
    }
    return root.S;
  };

  root.cloudSaveNow = root.cloudSave;
  root._doCloudSave = root.cloudSave;
  root.lsLoad = function(){ var local = readCache(); if(local) root.S = normalize(local); return root.S; };
  root.lsSave = function(){ clearTimeout(saveTimer); saveTimer = setTimeout(function(){ root.cloudSave(root.S); }, SAVE_DELAY); return root.S; };
  root._queueCloudSave = function(){ root.lsSave(); };

  root.addEventListener('beforeunload', function(){
    if(root.S) {
      root.S._savedAt = new Date().toISOString();
      writeCache(root.S);
    }
  });
})(window);
