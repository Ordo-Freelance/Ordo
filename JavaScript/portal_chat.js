(function(){
  'use strict';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const linkify=s=>esc(s).replace(/https?:\/\/[^\s<]+/g,text=>{try{const u=new URL(text.replace(/&amp;/g,'&'));return '<a target="_blank" rel="noopener noreferrer" href="'+esc(u.href)+'">'+text+'</a>';}catch{return text;}}).replace(/\n/g,'<br>');
  const state=new WeakMap();
  function avatar(src,name,system){
    return src ? '<span class="pc-avatar"><img src="'+esc(src)+'" alt="'+esc(name)+'"></span>' : '<span class="pc-avatar '+(system?'pc-system':'')+'">'+esc((name||'؟').slice(0,1))+'</span>';
  }
  function mount(el,options){
    if(!el||!window.ORDO_API_REQUEST)return;
    let s=state.get(el);
    if(s){s.options=options;refresh(el);return;}
    s={options,messages:[],features:{images:false,voice:false},timer:null,loading:false,recorder:null,chunks:[]};state.set(el,s);
    el.classList.add('portal-chat');
    el.innerHTML='<div class="pc-head">'+avatar(options.peerAvatar,options.peerName,options.peerSystem)+'<div><strong>'+esc(options.peerName)+'</strong><small>محادثة خاصة وآمنة</small></div><span class="pc-live">● تحديث تلقائي</span></div><div class="pc-messages" aria-live="polite"></div><div class="pc-error" role="alert"></div><div class="pc-compose"><button type="button" class="pc-tool" data-pc-image title="إرسال صورة">🖼️</button><button type="button" class="pc-tool" data-pc-voice title="تسجيل رسالة صوتية">🎙️</button><input type="file" data-pc-file accept="image/jpeg,image/png,image/webp" hidden><textarea data-pc-text rows="2" maxlength="5000" placeholder="اكتب رسالة أو رابطاً..."></textarea><button type="button" class="pc-send" data-pc-send>إرسال</button></div>';
    el.querySelector('[data-pc-send]').onclick=()=>send(el);
    el.querySelector('[data-pc-text]').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send(el);}};
    el.querySelector('[data-pc-image]').onclick=()=>el.querySelector('[data-pc-file]').click();
    el.querySelector('[data-pc-file]').onchange=e=>sendFile(el,e.target.files?.[0]);
    el.querySelector('[data-pc-voice]').onclick=()=>voice(el);
    refresh(el);s.timer=setInterval(()=>{if(!el.isConnected){clearInterval(s.timer);return;}if(!document.hidden&&el.getClientRects().length)refresh(el,true);},10000);
  }
  async function api(s,verb,payload={}){return ORDO_API_REQUEST((s.options.public?'public.':'')+'portalChat.'+verb,{...s.options.public?{token:s.options.token}:{client_id:s.options.clientId},...payload});}
  async function refresh(el,quiet=false){
    const s=state.get(el);if(!s||s.loading)return;s.loading=true;
    try{const result=await api(s,'list');const data=result?.data||result;s.features=data.features||s.features;const next=data.messages||[];if(JSON.stringify(next)!==JSON.stringify(s.messages)){s.messages=next;render(el);}el.querySelector('.pc-compose').hidden=false;el.querySelector('[data-pc-image]').hidden=!s.features.images;el.querySelector('[data-pc-voice]').hidden=!s.features.voice;el.querySelector('.pc-error').textContent='';}
    catch(e){if(e.code==='chat_disabled'||e.code==='chat_auth_required'){el.querySelector('.pc-compose').hidden=true;el.querySelector('.pc-messages').innerHTML='<div class="pc-empty">المراسلة غير متاحة لهذا الحساب حالياً</div>';}if(!quiet)el.querySelector('.pc-error').textContent=e.message||'تعذر تحميل المحادثة';}
    finally{s.loading=false;}
  }
  function render(el){
    const s=state.get(el),box=el.querySelector('.pc-messages');const atBottom=box.scrollHeight-box.scrollTop-box.clientHeight<90;
    box.innerHTML=s.messages.length?s.messages.map(m=>{const own=m.sender===(s.options.public?'client':'owner');const label=own?'أنت':s.options.peerName;const av=own?avatar(s.options.selfAvatar,s.options.selfName,false):avatar(s.options.peerAvatar,s.options.peerName,s.options.peerSystem);
      return '<div class="pc-line '+(own?'mine':'theirs')+'">'+av+'<div class="pc-bubble"><small>'+esc(label)+' · '+esc(new Date(m.created_at).toLocaleString('ar-EG'))+'</small>'+(m.body?'<div>'+linkify(m.body)+'</div>':'')+(m.attachment?'<button type="button" data-pc-media="'+esc(m.id)+'">'+(m.attachment.kind==='image'?'🖼️ عرض الصورة':'🎧 تشغيل التسجيل')+'</button>':'')+'</div></div>';}).join(''):'<div class="pc-empty">ابدأ المحادثة برسالة لعميلك</div>';
    box.querySelectorAll('[data-pc-media]').forEach(button=>button.onclick=()=>openMedia(el,button.dataset.pcMedia));if(atBottom)box.scrollTop=box.scrollHeight;
  }
  async function send(el,attachment){const s=state.get(el),field=el.querySelector('[data-pc-text]'),body=field.value.trim(),button=el.querySelector('[data-pc-send]');if(!body&&!attachment)return;button.disabled=true;
    try{await api(s,'send',{body,attachment});field.value='';await refresh(el);}catch(e){el.querySelector('.pc-error').textContent=e.message||'تعذر إرسال الرسالة';}finally{button.disabled=false;}}
  async function sendFile(el,file){if(!file)return;const s=state.get(el);if(!s.features.images)return;const err=el.querySelector('.pc-error');if(file.size>5*1024*1024){err.textContent='الصورة أكبر من 5 ميجابايت';return;}
    try{const img=await createImageBitmap(file);const scale=Math.min(1,1100/Math.max(img.width,img.height));const canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);img.close();let quality=.78,data=canvas.toDataURL('image/jpeg',quality);while(data.length>900000&&quality>.3){quality-=.12;data=canvas.toDataURL('image/jpeg',quality);}if(data.length>940000)throw Error('الصورة كبيرة جداً بعد الضغط');await send(el,{kind:'image',mime:'image/jpeg',name:file.name,data});}
    catch(e){err.textContent=e.message||'تعذر تجهيز الصورة';}finally{el.querySelector('[data-pc-file]').value='';}}
  async function voice(el){const s=state.get(el),button=el.querySelector('[data-pc-voice]');if(s.recorder?.state==='recording'){s.recorder.stop();return;}if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){el.querySelector('.pc-error').textContent='المتصفح لا يدعم تسجيل الصوت';return;}
    try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});const mime=['audio/webm','audio/mp4','audio/ogg'].find(t=>MediaRecorder.isTypeSupported(t))||'';const rec=new MediaRecorder(stream,mime?{mimeType:mime,videoBitsPerSecond:24000}:undefined);s.recorder=rec;s.chunks=[];rec.ondataavailable=e=>{if(e.data.size)s.chunks.push(e.data);};rec.onstop=async()=>{button.textContent='🎙️';stream.getTracks().forEach(t=>t.stop());const blob=new Blob(s.chunks,{type:rec.mimeType});if(blob.size>1500000){el.querySelector('.pc-error').textContent='التسجيل تجاوز الحد المسموح';return;}const data=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(blob);});await send(el,{kind:'voice',mime:rec.mimeType.split(';')[0],name:'تسجيل صوتي',data});};rec.start();button.textContent='⏹️';setTimeout(()=>{if(rec.state==='recording')rec.stop();},60000);}
    catch(e){el.querySelector('.pc-error').textContent='لم يُسمح باستخدام الميكروفون';}}
  async function openMedia(el,id){const s=state.get(el),win=window.open('','_blank');if(!win){el.querySelector('.pc-error').textContent='اسمح بفتح النافذة لعرض المرفق';return;}try{win.document.body.textContent='جاري تحميل المرفق...';const result=await api(s,'media',{message_id:id}),media=result?.data||result;win.document.body.textContent='';const node=win.document.createElement(media.mime.startsWith('image/')?'img':'audio');node.src=media.data;if(node.tagName==='AUDIO')node.controls=true;else{node.alt=media.name||'صورة';node.style.maxWidth='100%';}win.document.body.appendChild(node);}catch(e){win.close();el.querySelector('.pc-error').textContent=e.message||'تعذر فتح المرفق';}}
  window.OrdoPortalChat={mount,refresh};
})();
