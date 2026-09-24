import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {publicSnapshot} from '../api/index.js';

const api=fs.readFileSync(new URL('../api/index.js',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../JavaScript/app.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../HTML/index.html',import.meta.url),'utf8');
const store=fs.readFileSync(new URL('../HTML/store.html',import.meta.url),'utf8');
const persistence=fs.readFileSync(new URL('../JavaScript/vercel_persistence.js',import.meta.url),'utf8');

test('public store snapshot includes saved storefront identity and artwork',()=>{
  for(const key of ['svc_store_name','store_logo','svc_banner','svc_banner_size','svc_banner_custom_px','svc_site_desc','socials']){
    assert.match(api,new RegExp(`'${key}'`));
    assert.match(persistence,new RegExp(`'${key}'`));
  }
  assert.match(store,/settings\.svc_store_name\|\|settings\.name/);
  assert.match(store,/settings\.svc_banner\|\|''/);
  assert.match(store,/custom:Math\.max\(80,Math\.min\(800/);
});

test('store identity is separate from app identity and main preview uses username',()=>{
  assert.match(html,/id="svc-store-name"/);
  assert.match(app,/S\.settings\.svc_store_name=name/);
  assert.match(app,/window\.location\.origin\+'\/store\/'\+encodeURIComponent\(mainSlug\)/);
  assert.match(app,/if\(store\)store\.desc=/);
  assert.match(app,/if\(store\)store\.socials=socs/);
});

test('public preview receives the saved banner and independent store name',async()=>{
  const data={settings:{name:'App name',svc_store_name:'My shop',username:'my-shop',svc_banner:'https://example.com/banner.png',svc_site_desc:'Shop details',socials:[{type:'behance',url:'https://behance.net/demo'}]},services:[],stores:[]};
  const source={async publicStudioCandidates(){return [{user_id:'owner',username_index:'my-shop',data}];},async query(){return [];}};
  const result=await publicSnapshot(source,{type:'store',username:'my-shop'});
  assert.equal(result.data.settings.svc_store_name,'My shop');
  assert.equal(result.data.settings.svc_banner,'https://example.com/banner.png');
  assert.equal(result.data.settings.svc_site_desc,'Shop details');
  assert.deepEqual(result.data.settings.socials,data.settings.socials);
  assert.equal(result.data.settings.name,'App name');
});
