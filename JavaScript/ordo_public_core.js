(function(window){
  'use strict';

  function unwrapStudioData(raw){
    if(!raw) return {};
    var cur = raw;
    for(var i=0;i<4;i++){
      if(typeof cur === 'string'){
        try { cur = JSON.parse(cur); } catch(e){ break; }
      }
      if(cur && cur.data !== undefined && (cur.tasks === undefined && cur.clients === undefined && cur.settings === undefined)){
        cur = cur.data;
        continue;
      }
      break;
    }
    return cur && typeof cur === 'object' ? cur : {};
  }

  function isExpired(tokenObj){
    return !!(tokenObj && tokenObj.expires_at && new Date(tokenObj.expires_at) < new Date());
  }

  function allowed(tokenObj, section){
    if(!tokenObj) return false;
    var sections = tokenObj.allowed_sections || [];
    if(!sections.length) return true;
    return sections.indexOf(section) >= 0 || sections.indexOf('*') >= 0;
  }

  var _cache = new Map();
  var _inflight = new Map();
  function estimateBytes(value){
    try { return new Blob([JSON.stringify(value || null)]).size; }
    catch(e){ try { return JSON.stringify(value || null).length; } catch(e2){ return 0; } }
  }
  async function cachedSupabaseQuery(key, ttlMs, fetcher){
    var now = Date.now();
    var hit = _cache.get(key);
    if(hit && hit.expires > now){
      if(window.ORDO_EGRESS_DEBUG) console.log('[OrdoEgress]', key, 'cache', hit.bytes + 'b');
      return hit.value;
    }
    if(_inflight.has(key)) return _inflight.get(key);
    var started = Date.now();
    var p = Promise.resolve().then(fetcher).then(function(value){
      var bytes = estimateBytes(value);
      _cache.set(key, {value:value, expires:Date.now() + (ttlMs || 60000), bytes:bytes});
      if(window.ORDO_EGRESS_DEBUG) console.log('[OrdoEgress]', key, 'network', (Date.now()-started) + 'ms', bytes + 'b');
      return value;
    }).finally(function(){ _inflight.delete(key); });
    _inflight.set(key, p);
    return p;
  }

  function findEntity(data, tokenObj){
    if(!data || !tokenObj) return null;
    var map = {
      proposal:'proposals',
      contract:'contracts',
      review:'reviews',
      client_portal:'client_portals',
      store:'stores',
      service:'services',
      svc_order:'svc_orders',
      task:'tasks',
      project:'projects'
    };
    var arrName = map[tokenObj.entity_type] || tokenObj.entity_type;
    var arr = data[arrName] || [];
    return arr.find(function(x){
      return String(x.id) === String(tokenObj.entity_id) ||
        String(x.token || '') === String(tokenObj.token) ||
        String(x.public_token || '') === String(tokenObj.token);
    }) || null;
  }

  function findToken(data, token, expectedType){
    data.public_tokens = Array.isArray(data.public_tokens) ? data.public_tokens : [];
    var obj = data.public_tokens.find(function(t){
      return t && t.token === token && (!expectedType || t.entity_type === expectedType);
    });
    if(obj) return obj;

    var fallbacks = [
      ['proposal','proposals'],
      ['contract','contracts'],
      ['client_portal','client_portals'],
      ['review','reviews']
    ];
    for(var i=0;i<fallbacks.length;i++){
      var type = fallbacks[i][0], arr = data[fallbacks[i][1]] || [];
      if(expectedType && expectedType !== type) continue;
      var ent = arr.find(function(x){ return x && (x.token === token || x.public_token === token || x.shareToken === token); });
      if(ent){
        obj = {
          token: token,
          user_id: ent.user_id || '',
          client_id: ent.client_id || null,
          entity_type: type,
          entity_id: String(ent.id || ent.token || token),
          allowed_sections: type === 'client_portal'
            ? ['profile','projects','tasks','invoices','contracts','proposals','reviews']
            : [type,'summary','reviews'],
          expires_at: null,
          revoked: false,
          createdAt: ent.createdAt || ent.created_at || new Date().toISOString(),
          legacy: true
        };
        data.public_tokens.push(obj);
        ent.public_token = token;
        return obj;
      }
    }
    return null;
  }

  function normalizePublicPayload(row, type, tokenObj){
    var payload = row && (row.proposal_data || row.contract_data || row.review_data || row.portal_data || row.store_data || row.data || row.payload || row);
    if(typeof payload === 'string'){
      try { payload = JSON.parse(payload); } catch(e){}
    }
    payload = payload && typeof payload === 'object' ? payload : {};
    var settings = payload.settings || payload.workspace_settings || {};
    var entity = payload.entity || payload.proposal || payload.contract || payload.review || payload.portal || payload.store || payload;
    var data = payload.studio_data || {settings:settings};
    if(type === 'proposal') data.proposals = [entity];
    if(type === 'contract') data.contracts = [entity];
    if(type === 'review') data.reviews = payload.reviews || [];
    if(type === 'reviews_public') data.reviews = payload.reviews || payload.public_reviews || [];
    if(type === 'client_portal') data.client_portals = [entity];
    if(type === 'store') {
      data.stores = [entity];
      data.services = payload.services || entity.services || [];
      data.standalone_packages = payload.packages || entity.packages || [];
      data.portfolio_projects = payload.portfolio_projects || entity.portfolio_projects || [];
    }
    return {data:data, entity:entity, token:tokenObj};
  }

  async function resolveFromPublicTables(db, token, expectedType){
    var tokenRow = null;
    try{
      var tokenRes = await cachedSupabaseQuery('public_token:' + expectedType + ':' + token, 5 * 60 * 1000, function(){
        return db.from('public_tokens')
          .select('token,user_id,type,data,created_at,updated_at')
          .eq('token', token)
          .limit(1)
          .maybeSingle();
      });
      if(tokenRes && !tokenRes.error && tokenRes.data) tokenRow = tokenRes.data;
    }catch(e){}

    if(tokenRow&&tokenRow.data){var tokenData=typeof tokenRow.data==='string'?JSON.parse(tokenRow.data):tokenRow.data;tokenRow=Object.assign({},tokenData||{},tokenRow,{owner_user_id:tokenRow.user_id,entity_type:tokenRow.type||(tokenData&&tokenData.entity_type),store_data:tokenData});}
    var type = (tokenRow && tokenRow.entity_type) || expectedType || '';
    var tableMap = {
      proposal: ['public_proposals', 'token,owner_user_id,proposal_data,is_active,expires_at,created_at'],
      contract: ['public_contracts', 'token,owner_user_id,contract_data,is_active,expires_at,created_at'],
      review: ['public_reviews', 'token,owner_user_id,review_data,is_active,expires_at,created_at'],
      reviews_public: ['public_reviews', 'token,owner_user_id,review_data,is_active,expires_at,created_at'],
      client_portal: ['public_client_portals', 'token,owner_user_id,portal_data,is_active,expires_at,created_at'],
      store: ['public_store_items', 'token,owner_user_id,store_data,is_active,created_at']
    };
    var cfg = tableMap[type] || tableMap[expectedType];
    if(!cfg && !tokenRow) return null;

    var entityRow = null;
    if(cfg && !tokenRow){
      try{
        var entityRes = await cachedSupabaseQuery('public_entity:' + type + ':' + token, 5 * 60 * 1000, function(){
          return db.from(cfg[0]).select(cfg[1]).eq('token', token).eq('is_active', true).limit(1).maybeSingle();
        });
        if(entityRes && !entityRes.error && entityRes.data) entityRow = entityRes.data;
      }catch(e2){}
    }
    if(!tokenRow && !entityRow) return null;

    var tokenObj = {
      token: token,
      user_id: (tokenRow && tokenRow.owner_user_id) || (entityRow && entityRow.owner_user_id) || '',
      owner_user_id: (tokenRow && tokenRow.owner_user_id) || (entityRow && entityRow.owner_user_id) || '',
      entity_type: type || expectedType,
      entity_id: tokenRow && tokenRow.entity_id || token,
      allowed_sections: tokenRow && tokenRow.allowed_sections || [],
      expires_at: tokenRow && tokenRow.expires_at || entityRow && entityRow.expires_at || null,
      revoked: false,
      createdAt: tokenRow && tokenRow.created_at || entityRow && entityRow.created_at || ''
    };
    if(isExpired(tokenObj)) return {expired:true};
    var normalized = normalizePublicPayload(entityRow || tokenRow, tokenObj.entity_type, tokenObj);
    return {ok:true, uid:tokenObj.owner_user_id, data:normalized.data, token:tokenObj, entity:normalized.entity};
  }

  async function resolvePublicToken(db, token, options){
    options = options || {};
    if(!db || !token) return {ok:false, reason:'missing_token'};
    var direct = await resolveFromPublicTables(db, token, options.entity_type);
    if(direct && direct.expired) return {ok:false, reason:'expired'};
    if(direct && direct.ok) return direct;
    var uidHint = options.uid || '';
    var rows = [];
    if(uidHint){
      try{
        var one = await cachedSupabaseQuery('legacy_studio_owner:' + uidHint, 60000, function(){
          return db.from('studio_data').select('data').eq('user_id', uidHint).maybeSingle();
        });
        if(one && one.data) rows.push(Object.assign({user_id:uidHint}, one.data));
      }catch(e){}
    }
    if(!rows.length) return {ok:false, reason:'not_found'};
    for(var i=0;i<rows.length;i++){
      var row = rows[i];
      var data = unwrapStudioData(row.data);
      var tokenObj = findToken(data, token, options.entity_type);
      if(!tokenObj) continue;
      if(tokenObj.revoked) return {ok:false, reason:'revoked'};
      if(isExpired(tokenObj)) return {ok:false, reason:'expired'};
      tokenObj.user_id = tokenObj.user_id || row.user_id;
      var entity = findEntity(data, tokenObj);
      return {ok:true, uid:row.user_id, data:data, token:tokenObj, entity:entity};
    }
    return {ok:false, reason:'not_found'};
  }

  function normalizeReview(review, tokenObj){
    var now = new Date().toISOString();
    review.id = review.id || ('rev_' + Date.now());
    review.client_id = review.client_id || (tokenObj && tokenObj.client_id) || null;
    review.project_id = review.project_id || (tokenObj && tokenObj.project_id) || null;
    review.rating = Number(review.rating || review.stars || 0);
    review.stars = review.stars || review.rating;
    review.text = review.text || review.comment || '';
    review.public_visible = review.public_visible !== false;
    review.createdAt = review.createdAt || review.created_at || now;
    review.created_at = review.created_at || review.createdAt;
    review.source_type = review.source_type || (tokenObj && tokenObj.entity_type) || 'review_link';
    review.source_id = review.source_id || (tokenObj && tokenObj.entity_id) || '';
    return review;
  }

  window.OrdoPublic = {
    unwrapStudioData: unwrapStudioData,
    resolvePublicToken: resolvePublicToken,
    findToken: findToken,
    allowed: allowed,
    normalizeReview: normalizeReview,
    cachedSupabaseQuery: cachedSupabaseQuery
  };
})(window);
