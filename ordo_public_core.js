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

  async function resolvePublicToken(db, token, options){
    options = options || {};
    if(!db || !token) return {ok:false, reason:'missing_token'};
    var uidHint = options.uid || '';
    var rows = [];
    if(uidHint){
      try{
        var one = await db.from('studio_data').select('user_id,data').eq('user_id', uidHint).maybeSingle();
        if(one && one.data) rows.push(one.data);
      }catch(e){}
    }
    if(!rows.length){
      try{
        var many = await db.from('studio_data').select('user_id,data').limit(options.limit || 500);
        rows = many && many.data || [];
      }catch(e2){}
    }
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
    normalizeReview: normalizeReview
  };
})(window);
