import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../HTML/admin.html', import.meta.url), 'utf8');
const sendSource = html.slice(html.indexOf('async function doSendMessage()'), html.indexOf('async function loadMessagesPage()'));

function setup(recipient) {
  const error = {textContent:''};
  const button = {disabled:false,textContent:'إرسال'};
  const inserted = [];
  const elements = {
    'msg-title':{value:'عنوان خاص'},'msg-body':{value:'رسالة خاصة'},'msg-error':error,
    'msg-send-btn':button,'msg-nav-page':{value:''},'msgs-nav-dot':{style:{}},
    'page-messages':{classList:{contains(){return false;}}}
  };
  const context = {
    _messageAudience:'direct',_currentMsgType:'message',_currentMsgUserId:recipient,
    ALL_STUDIO_DATA:recipient ? {[recipient]:{}} : {},
    document:{getElementById(id){return elements[id] || null;}},
    supa:{from(table){ assert.equal(table,'user_notifications'); return {async insert(rows){inserted.push(...rows);return {error:null};}};}},
    closeModal(){},toast(){},loadMessagesPage(){}
  };
  vm.runInNewContext(sendSource,context);
  return {context,error,inserted};
}

test('direct message cannot silently turn into broadcast without a recipient', async () => {
  const {context,error,inserted} = setup(null);
  await context.doSendMessage();
  assert.match(error.textContent,/اختر مستخدم/);
  assert.equal(inserted.length,0);
});

test('direct message inserts exactly one row for the selected user', async () => {
  const {context,inserted} = setup('user-1');
  await context.doSendMessage();
  assert.equal(inserted.length,1);
  assert.equal(inserted[0].user_id,'user-1');
  assert.equal(inserted[0].type,'message');
});

test('admin inbox keeps its conversation pane and reply control',()=>{
  assert.match(html,/class="admin-chat-layout"/);
  assert.match(html,/id="admin-chat-pane"/);
  assert.match(html,/class="admin-chat-dialog"/);
  assert.match(html,/data-reply/);
});
