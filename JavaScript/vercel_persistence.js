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

  function publicSettings(settings){
    settings=settings||{};
    var allowed=['name','studio','bio','desc','phone','email','logo','store_logo','svc_banner','svc_banner_size','svc_banner_custom_px','svc_site_desc','svc_orders_open','username','accent','accent2','accentColor','accentColor2','theme_color','displayMode','display_mode','socials'];
    var out={}; allowed.forEach(function(key){if(settings[key]!==undefined)out[key]=settings[key];}); return out;
  }
  function publicStoreData(data,store){
    var storeId=store&&store.id; function belongs(item){return storeId?String(item.store_id||'')===String(storeId):!item.store_id;}
    return {settings:publicSettings(data.settings),stores:store?[store]:[],services:(data.services||[]).filter(function(x){return x&&x.active!==false&&belongs(x);}),standalone_packages:(data.standalone_packages||[]).filter(function(x){return x&&x.active!==false&&belongs(x);}),portfolio_projects:(data.portfolio_projects||[]).filter(function(x){return x&&x.active!==false;}),reviews:(data.reviews||[]).filter(function(x){return x&&x.public_visible!==false&&x.approved!==false;})};
  }
  function publicPortalData(data,token){
    var clientId=String(token.client_id||'');
    var projects=(data.projects||[]).filter(function(x){return String(x.client_id||'')===clientId||String(x.clientId||'')===clientId;});
    var projectIds=projects.map(function(x){return String(x.id);});
    function forClient(x){return String(x.client_id||x.clientId||'')===clientId||projectIds.indexOf(String(x.project_id||x.projectId||''))>=0;}
    return {settings:publicSettings(data.settings),clients:(data.clients||[]).filter(function(x){return String(x.id)===clientId;}).map(function(x){return{id:x.id,name:x.name,email:x.email,phone:x.phone,company:x.company};}),projects:projects,project_tasks:(data.project_tasks||[]).filter(forClient),tasks:(data.tasks||[]).filter(forClient),invoices:(data.invoices||[]).filter(forClient),contracts:(data.contracts||[]).filter(forClient),proposals:(data.proposals||[]).filter(forClient),client_portals:(data.client_portals||[]).filter(function(x){return String(x.client_id||'')===clientId;}),svc_orders:(data.svc_orders||[]).filter(forClient)};
  }
  async function publishPublicData(db,userId,data){
    var settings=data.settings||{},stores=[null].concat(data.stores||[]);
    for(var i=0;i<stores.length;i++){
      var store=stores[i],slug=String((store&&store.username)||(!store&&settings.username)||'').toLowerCase(); if(!slug)continue;
      var id='store_'+userId+(store?'_'+store.id:'');
      var payload={slug:slug,store_id:store&&store.id||null,studio_data:publicStoreData(data,store)};
      var storeRes=await db.from('public_store_items').upsert({id:id,user_id:userId,data:payload,active:true},{onConflict:'id'}); if(storeRes.error)throw storeRes.error;
    }
    for(var j=0;j<(data.public_tokens||[]).length;j++){
      var token=data.public_tokens[j]; if(!token||!token.token)continue;
      var tokenPayload=Object.assign({},token); if(token.entity_type==='client_portal')tokenPayload.studio_data=publicPortalData(data,token);
      var tokenRes=await db.from('public_tokens').upsert({id:String(token.token),token:String(token.token),user_id:userId,type:token.entity_type||'',data:tokenPayload},{onConflict:'id'}); if(tokenRes.error)throw tokenRes.error;
    }
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
    root._lastCloudSaveOk=false;
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
      await publishPublicData(db,userId,root.S);
      root._lastCloudSaveOk=true;
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
