import test from 'node:test';
import assert from 'node:assert/strict';
import {portalChatAccess,portalChatAttachment,portalChatPublicRow} from '../api/index.js';

test('portal chat obeys plan and admin-owned user overrides',async()=>{
  const store={async query(table){
    if(table==='studio_data')return {data:{clients:[{id:'one'}],admin_feature_overrides:{portal_chat:'enabled'}}};
    if(table==='serial_keys')return [{plan_id:'pro',status:'active'}];
    if(table==='subscription_plans')return {features:{portal_chat:true,portal_chat_images:false,portal_chat_voice:true}};
    if(table==='platform_settings')return {config:{portal_chat_overrides:{owner:{portal_chat:'disabled'}}}};
  }};
  const access=await portalChatAccess(store,'owner');
  assert.equal(access.enabled,false);
  assert.equal(access.images,false);
  assert.equal(access.voice,true);
});

test('chat attachment accepts only allowed compact media and never includes data in list',()=>{
  const access={images:true,voice:false};
  const attachment=portalChatAttachment({kind:'image',mime:'image/png',data:'data:image/png;base64,AAAA',name:'x.png'},access);
  assert.equal(attachment.bytes,3);
  assert.throws(()=>portalChatAttachment({kind:'image',mime:'image/svg+xml',data:'data:image/svg+xml;base64,AAAA'},access));
  assert.throws(()=>portalChatAttachment({kind:'voice',mime:'audio/webm',data:'data:audio/webm;base64,AAAA'},access));
  const row=portalChatPublicRow({id:'m1',created_at:'2026-01-01',data:{client_id:'one',event_data:{sender:'client',body:'Hi',attachment}}});
  assert.equal(row.attachment.kind,'image');
  assert.equal(row.attachment.data,undefined);
});
