(function(root){
  'use strict';
  if(root.ORDO_LOCAL_ONLY) return;

  var saveTimer = null;
  var SAVE_DELAY = 700;
  root._cloudSaving = false;
  root._cloudSavePending = false;
  root._ordoCloudLoadedFromServer = false;

  function client(){
    return typeof supa !== 'undefined' ? supa : root.supa;
  }

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
    try { var raw = root.localStorage.getItem(cacheKey()); return raw ? normalize(raw) : null; }
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

  root.cloudLoad = async function(){
    root._ordoCloudLoadedFromServer = false;
    var userId = uid();
    var db = client();
    if(!userId || !db) return readCache() || normalize(root.S);
    try {
      var res = await db.from('studio_data').select('data,updated_at').eq('user_id', userId).maybeSingle();
      if(res.error) throw res.error;
      root._ordoCloudLoadedFromServer = true;
      var remote = res && res.data ? normalize(res.data.data) : null;
      if(remote && res.data.updated_at && !remote.updated_at) remote.updated_at = res.data.updated_at;
      var local = readCache();
      if(remote && local && JSON.stringify(remote) !== JSON.stringify(local)) {
        try { root.localStorage.setItem(cacheKey() + '_before_server_load', JSON.stringify(local)); } catch(e){}
      }
      var chosen = remote || local || normalize(root.S);
      root.S = normalize(chosen);
      writeCache(root.S);
      return root.S;
    } catch(e) {
      return readCache() || normalize(root.S);
    }
  };

  root.cloudSave = async function(data){
    if(!root._cloudLoadDone || !root._appReady) return root.S;
    var userId = uid();
    if(data) root.S = data;
    root.S = normalize(root.S);
    root.S._savedAt = new Date().toISOString();
    writeCache(root.S);
    var db = client();
    if(!userId || !db || !root._ordoCloudLoadedFromServer) return root.S;
    try {
      var username = root.S && root.S.settings && root.S.settings.username ? String(root.S.settings.username).toLowerCase() : null;
      var result = await db.from('studio_data').upsert({
        user_id:userId,
        data:JSON.stringify(root.S),
        username_index:username,
        updated_at:root.S._savedAt
      }, {onConflict:'user_id'});
      if(result.error) throw result.error;
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
    if(root.S && root._cloudLoadDone) {
      writeCache(root.S);
    }
  });
})(window);
