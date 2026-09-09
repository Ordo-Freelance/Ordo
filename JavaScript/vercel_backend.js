(function(root){
  'use strict';

  var API_URL = (root.ORDO_CONFIG && root.ORDO_CONFIG.API_URL) || '/api/index';
  var AUTH_KEY = 'studioOS_auth_v1';
  var authListeners = [];
  var uploadedFiles = {};

  function imageDataUrl(file){
    return new Promise(function(resolve, reject){
      if(!file || !String(file.type || '').startsWith('image/')){
        var raw = new FileReader(); raw.onload=function(){resolve(raw.result);}; raw.onerror=reject; raw.readAsDataURL(file); return;
      }
      var reader=new FileReader(); reader.onerror=reject;
      reader.onload=function(){
        var img=new Image(); img.onerror=function(){resolve(reader.result);};
        img.onload=function(){
          var max=1600, scale=Math.min(1,max/Math.max(img.width,img.height));
          var canvas=document.createElement('canvas');
          canvas.width=Math.max(1,Math.round(img.width*scale)); canvas.height=Math.max(1,Math.round(img.height*scale));
          canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
          resolve(canvas.toDataURL('image/jpeg',0.82));
        };
        img.src=reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function request(action, payload){
    return fetch(API_URL + '?action=' + encodeURIComponent(action), {
      method: 'POST',
      credentials: 'include',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(Object.assign({action:action}, payload || {}))
    }).then(function(res){
      return res.json().catch(function(){ return {}; }).then(function(body){
        if(!res.ok || body.error) throw (body.error || {message:'Request failed'});
        return body;
      });
    });
  }

  function result(data){ return Promise.resolve({data:data, error:null}); }
  function failure(error){ return Promise.resolve({data:null, error:error && error.message ? error : {message:String(error||'Error')}}); }

  function saveSession(session){
    try {
      if(session && session.user){
        var u = session.user;
        var meta = u.user_metadata || {};
        root._supaUserId = u.id;
        root.localStorage.setItem(AUTH_KEY, JSON.stringify({
          id:u.id, supaId:u.id, email:u.email || '',
          name:meta.name || meta.full_name || u.email || '',
          phone:meta.phone || '',
          studio:meta.studio || '',
          avatarUrl:meta.avatarUrl || meta.avatar_url || '',
          isAdmin:!!(meta.is_admin || (u.app_metadata && u.app_metadata.is_admin))
        }));
      }
    } catch(e){}
  }

  function emit(event, session){
    saveSession(session);
    authListeners.slice().forEach(function(cb){ try{ cb(event, session); }catch(e){} });
  }

  function filtersFor(builder){
    return builder._filters.map(function(f){ return {op:f.op, column:f.column, value:f.value}; });
  }

  function makeBuilder(table){
    var b = {
      _table: table,
      _filters: [],
      _single: false,
      _columns: '*',
      _order: null,
      _limit: null,
      select: function(columns){ b._columns = columns || '*'; if(!b._op) b._op = 'select'; return b; },
      insert: function(payload){ b._op = 'insert'; b._payload = payload; return b; },
      upsert: function(payload){ b._op = 'upsert'; b._payload = payload; return b; },
      update: function(payload){ b._op = 'update'; b._payload = payload; return b; },
      delete: function(){ b._op = 'delete'; return b; },
      eq: function(column, value){ b._filters.push({op:'eq', column:column, value:value}); return b; },
      neq: function(column, value){ b._filters.push({op:'neq', column:column, value:value}); return b; },
      in: function(column, value){ b._filters.push({op:'in', column:column, value:value}); return b; },
      is: function(column, value){ b._filters.push({op:'is', column:column, value:value}); return b; },
      like: function(column, value){ b._filters.push({op:'like', column:column, value:value}); return b; },
      ilike: function(column, value){ b._filters.push({op:'ilike', column:column, value:value}); return b; },
      or: function(){ return b; },
      order: function(column, opts){ b._order = {column:column, ascending:!(opts && opts.ascending === false)}; return b; },
      limit: function(n){ b._limit = n; return b; },
      range: function(){ return b; },
      single: function(){ b._single = true; return b._execute(); },
      maybeSingle: function(){ b._single = true; return b._execute(); },
      then: function(resolve, reject){ return b._execute().then(resolve, reject); },
      catch: function(reject){ return b._execute().catch(reject); },
      _execute: function(){
        return request('db.query', {
          table:b._table,
          op:b._op || 'select',
          columns:b._columns,
          filters:filtersFor(b),
          payload:b._payload,
          single:b._single,
          order:b._order,
          limit:b._limit
        }).then(function(body){ return {data:body.data, error:null}; }).catch(function(err){ return {data:b._single ? null : [], error:err}; });
      }
    };
    return b;
  }

  function makeClient(){
    return {
      from: function(table){ return makeBuilder(table); },
      admin: {
        createUser: function(opts){
          opts = opts || {};
          return request('admin.users.create', {
            email:opts.email,
            password:opts.password,
            metadata:opts.metadata || {},
            is_admin:!!opts.is_admin
          }).then(function(body){ return {data:body.data,error:null}; }).catch(function(err){ return {data:null,error:err}; });
        },
        updateUserById: function(userId, attributes){
          return request('admin.users.update', {user_id:userId,attributes:attributes || {}})
            .then(function(body){ return {data:body.data,error:null}; }).catch(function(err){ return {data:null,error:err}; });
        },
        updateUserByEmail: function(email, attributes){
          return request('admin.users.update', {email:email,attributes:attributes || {}})
            .then(function(body){ return {data:body.data,error:null}; }).catch(function(err){ return {data:null,error:err}; });
        },
        deleteUser: function(userId){
          return request('admin.users.delete', {user_id:userId})
            .then(function(body){ return {data:body.data,error:null}; }).catch(function(err){ return {data:null,error:err}; });
        }
      },
      channel: function(){
        return {
          on: function(){ return this; },
          subscribe: function(cb){ if(typeof cb === 'function') setTimeout(function(){ cb('VERCEL_POLLING'); }, 0); return this; },
          unsubscribe: function(){ return Promise.resolve(); }
        };
      },
      removeChannel: function(){ return Promise.resolve(); },
      auth: {
        signUp: function(opts){
          opts = opts || {};
          return request('auth.signup', {
            email:opts.email,
            password:opts.password,
            metadata:opts.options && opts.options.data || {}
          }).then(function(body){ emit('SIGNED_IN', body.data.session); return {data:body.data, error:null}; }).catch(function(err){ return {data:null, error:err}; });
        },
        signInWithPassword: function(opts){
          opts = opts || {};
          return request('auth.login', {email:opts.email, password:opts.password})
            .then(function(body){ emit('SIGNED_IN', body.data.session); return {data:body.data, error:null}; })
            .catch(function(err){ return {data:null, error:err}; });
        },
        signOut: function(){
          return request('auth.logout').then(function(){ emit('SIGNED_OUT', null); try{ root.localStorage.removeItem(AUTH_KEY); }catch(e){} return {data:null,error:null}; }).catch(failure);
        },
        getSession: function(){
          return request('auth.session').then(function(body){ return {data:{session:body.data.session || null}, error:null}; }).catch(function(){ return {data:{session:null}, error:null}; });
        },
        getUser: function(){
          return request('auth.user').then(function(body){ return {data:{user:body.data.user || null}, error:null}; }).catch(function(){ return {data:{user:null}, error:null}; });
        },
        refreshSession: function(){ return this.getSession(); },
        updateUser: function(attrs){
          return request('auth.update', {attributes:attrs || {}}).then(function(body){ return {data:body.data, error:null}; }).catch(function(err){ return {data:null, error:err}; });
        },
        resetPasswordForEmail: function(email){
          return request('auth.reset', {email:email}).then(function(body){ return {data:body.data, error:null}; }).catch(function(err){ return {data:null, error:err}; });
        },
        signInWithOAuth: function(opts){
          opts = opts || {};
          if(opts.provider !== 'google') return failure({message:'طريقة تسجيل الدخول غير مدعومة.'});
          var redirectTo = opts.options && opts.options.redirectTo || root.location.origin + '/dashboard';
          root.location.assign(API_URL + '?action=auth.google.start&redirectTo=' + encodeURIComponent(redirectTo));
          return new Promise(function(){});
        },
        onAuthStateChange: function(cb){
          if(typeof cb === 'function'){
            authListeners.push(cb);
            this.getSession().then(function(res){
              setTimeout(function(){
                if(res.data && res.data.session) cb('SIGNED_IN', res.data.session);
                else cb('SIGNED_OUT', null);
              }, 0);
            });
          }
          return {data:{subscription:{unsubscribe:function(){ authListeners = authListeners.filter(function(x){ return x !== cb; }); }}}};
        }
      },
      storage: {
        from: function(bucket){
          return {
            upload: function(path, file){ return imageDataUrl(file).then(function(url){ uploadedFiles[bucket+'/'+path]=url; return {data:{path:path,fullPath:path},error:null}; }).catch(function(error){return {data:null,error:error};}); },
            getPublicUrl: function(path){ return {data:{publicUrl:uploadedFiles[bucket+'/'+path]||''}}; },
            createSignedUrl: function(path){ return result({signedUrl:uploadedFiles[bucket+'/'+path]||''}); },
            download: function(){ return result(new Blob([''])); },
            list: function(){ return result([]); },
            remove: function(){ return result([]); }
          };
        }
      }
    };
  }

  root.ORDO_CONFIG = Object.assign({}, root.ORDO_CONFIG || {}, {
    LOCAL_ONLY:false,
    NO_AUTH:false,
    NO_SUBSCRIPTIONS:false,
    API_URL:API_URL
  });
  root.ORDO_LOCAL_ONLY = false;
  root.ORDO_NO_AUTH = false;
  root.ORDO_NO_SUBSCRIPTIONS = false;
  root.SUPA_URL = '';
  root.SUPA_ANON = '';
  root.supabase = { createClient:function(){ return makeClient(); }, __ordoVercelShim:true };
})(window);
