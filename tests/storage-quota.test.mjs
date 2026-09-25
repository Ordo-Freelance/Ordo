import test from 'node:test';
import assert from 'node:assert/strict';
import {imageBytes,storageLimitBytes,mayIncreaseImageUsage} from '../api/storage_quota.js';
import {storageInfo} from '../api/index.js';

test('counts only stored image data, including nested invoice receipts', () => {
  const image = 'data:image/png;base64,YWJjZA==';
  assert.equal(imageBytes({settings:{logo:image},invoices:[{receipt:image}],external:'https://example.com/banner.png'}),8);
  assert.equal(imageBytes(JSON.stringify({logo:image})),4);
});

test('brief banners and uploaded answer-choice pictures consume account storage',()=>{
  const image='data:image/png;base64,YWJjZA==';
  const snapshot={brief_forms:[{banner:image,questions:[{type:'image',options:[{label:'شعار كتابي',image_url:image},{label:'شعار رمزي',image_url:image}]}]}]};
  assert.equal(imageBytes(snapshot),12);
  snapshot.brief_forms[0].questions[0].options.pop();
  assert.equal(imageBytes(snapshot),8);
});

test('storage policy ignores user-writable subscription claims and honors admin overrides', async () => {
  const logo = 'data:image/png;base64,YWJjZA==';
  const store = {async userById(){return {avatar_url:''};},async query(table){
    if(table === 'studio_data') return {data:{settings:{logo},admin_subscription:{status:'active',planId:'pro'}}};
    if(table === 'serial_keys' || table === 'subscription_requests') return [];
    if(table === 'platform_settings') return {config:{storage_overrides:{'user-1':{quota_mb:5,uploads_enabled:false}}}};
    if(table === 'subscription_plans') throw new Error('Untrusted subscription was used');
  }};
  const info = await storageInfo(store,'user-1');
  assert.equal(info.used_bytes,4);
  assert.equal(info.limit_bytes,5*1024*1024);
  assert.equal(info.uploads_enabled,false);
  assert.equal(info.plan_id,null);
});

test('approved storage add-on expands the same quota used by logos and chat images', async()=>{
  const store={async userById(){return {avatar_url:''};},async query(table){
    if(table==='studio_data')return {data:{settings:{logo:'data:image/png;base64,YWJjZA=='}}};
    if(table==='serial_keys'||table==='subscription_requests')return [];
    if(table==='platform_settings')return {config:{storage_overrides:{u:{purchased_mb:100}}}};
  }};
  const info=await storageInfo(store,'u');
  assert.equal(info.used_bytes,4);
  assert.equal(info.purchased_mb,100);
  assert.equal(info.limit_bytes,125*1024*1024);
});

test('plan space can be overridden per account and disabling uploads permits deletions', () => {
  assert.equal(storageLimitBytes({storage_mb:25},{quota_mb:100}),100*1024*1024);
  assert.equal(storageLimitBytes({storage_mb:25},{purchased_mb:100}),125*1024*1024);
  assert.equal(storageLimitBytes({storage_mb:25},{quota_mb:100,purchased_mb:50}),150*1024*1024);
  assert.equal(storageLimitBytes({},{}),25*1024*1024);
  assert.equal(mayIncreaseImageUsage(100,90,50,false),true);
  assert.equal(mayIncreaseImageUsage(100,101,200,false),false);
  assert.equal(mayIncreaseImageUsage(100,201,200,true),false);
});
