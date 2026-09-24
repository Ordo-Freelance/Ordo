import test from 'node:test';
import assert from 'node:assert/strict';
import {portalChatAccess,portalChatAttachment,portalChatPublicRow} from '../api/index.js';
import fs from 'node:fs';

const chatSource=fs.readFileSync(new URL('../JavaScript/portal_chat.js',import.meta.url),'utf8');
const apiSource=fs.readFileSync(new URL('../api/index.js',import.meta.url),'utf8');

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

test('deleted chat messages hide content and attachments from both participants',()=>{
  const row=portalChatPublicRow({id:'m2',data:{client_id:'one',event_data:{sender:'owner',body:'private',deleted:true,attachment:{kind:'image',data:'secret'}}}});
  assert.equal(row.body,'');
  assert.equal(row.attachment,null);
  assert.equal(row.deleted,true);
  assert.match(apiSource,/message\.sender!==actor/);
  assert.match(apiSource,/mediaMessage\.deleted\|\|mediaMessage\.hidden_for\?\.includes/);
});

test('chat keeps images and audio in the thread and previews voice before sending',()=>{
  assert.match(chatSource,/data-pc-inline/);
  assert.match(chatSource,/node\.appendChild\(img\)/);
  assert.match(chatSource,/node\.appendChild\(audio\)/);
  assert.match(chatSource,/pc-wave/);
  assert.match(chatSource,/data-pc-send-voice/);
  assert.match(chatSource,/api\(s,'delete',\{message_id:id,scope:button\.dataset\.pcScope\}\)/);
});

test('voice data URL accepts recorder codec parameters but rejects a mismatched MIME',()=>{
  const access={images:false,voice:true};
  assert.equal(portalChatAttachment({kind:'voice',mime:'audio/webm',data:'data:audio/webm;codecs=opus;base64,AAAA'},access).bytes,3);
  assert.throws(()=>portalChatAttachment({kind:'voice',mime:'audio/webm',data:'data:audio/ogg;base64,AAAA'},access));
  assert.match(chatSource,/s\.sendWhenStopped=true;stopVoice\(el,false\)/);
  assert.match(chatSource,/if\(!attachment&&s\.preview\)return sendVoicePreview\(el\)/);
});

test('chat supports private hiding and sender-only deletion for everyone',()=>{
  assert.match(apiSource,/scope=input\.scope==='everyone'\?'everyone':'me'/);
  assert.match(apiSource,/hidden_for:\[\.\.\.new Set/);
  assert.match(apiSource,/message\.sender!==actor/);
  assert.match(chatSource,/data-pc-scope="me"/);
  assert.match(chatSource,/data-pc-scope="everyone"/);
});

test('chat can be cleared privately, owner can remove it permanently, and deleted rows do not render',()=>{
  assert.match(apiSource,/verb==='clear'/);
  assert.match(apiSource,/permanent&&isPublic/);
  assert.match(apiSource,/message\.deleted&&/);
  assert.match(chatSource,/data-pc-clear-scope="me"/);
  assert.match(chatSource,/data-pc-clear-scope="everyone"/);
  assert.match(chatSource,/fa-solid fa-trash-can/);
  assert.doesNotMatch(chatSource,/تم حذف هذه الرسالة للطرفين/);
});
