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
    s={options,messages:[],features:{images:false,voice:false},timer:null,loading:false,recorder:null,chunks:[],media:new Map(),preview:null,recordTimer:null};state.set(el,s);
    el.classList.add('portal-chat');
    el.innerHTML='<div class="pc-head">'+avatar(options.peerAvatar,options.peerName,options.peerSystem)+'<div><strong>'+esc(options.peerName)+'</strong><small>محادثة خاصة وآمنة</small></div><span class="pc-live">● تحديث تلقائي</span></div><div class="pc-messages" aria-live="polite"></div><div class="pc-error" role="alert"></div><div class="pc-recording" hidden><span class="pc-record-dot"></span><b data-pc-clock>00:00</b><span class="pc-wave" aria-label="جاري تسجيل الصوت">'+Array.from({length:18},()=>'<i></i>').join('')+'</span><button type="button" data-pc-stop>إيقاف</button><button type="button" data-pc-cancel>إلغاء</button></div><div class="pc-preview" hidden></div><div class="pc-compose"><button type="button" class="pc-tool" data-pc-image title="إرسال صورة">🖼️</button><button type="button" class="pc-tool" data-pc-voice title="تسجيل رسالة صوتية">🎙️</button><input type="file" data-pc-file accept="image/jpeg,image/png,image/webp" hidden><textarea data-pc-text rows="2" maxlength="5000" placeholder="اكتب رسالة أو رابطاً..."></textarea><button type="button" class="pc-send" data-pc-send>إرسال</button></div>';
    el.querySelector('[data-pc-send]').onclick=()=>send(el);
    el.querySelector('[data-pc-text]').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send(el);}};
    el.querySelector('[data-pc-image]').onclick=()=>el.querySelector('[data-pc-file]').click();
    el.querySelector('[data-pc-file]').onchange=e=>sendFile(el,e.target.files?.[0]);
    el.querySelector('[data-pc-voice]').onclick=()=>voice(el);
    el.querySelector('[data-pc-stop]').onclick=()=>stopVoice(el,false);
    el.querySelector('[data-pc-cancel]').onclick=()=>stopVoice(el,true);
    el.querySelector('.pc-messages').onclick=e=>{const button=e.target.closest('[data-pc-delete]');if(button)deleteMessage(el,button.dataset.pcDelete,button.dataset.pcOwn==='true');};
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
      const media=m.attachment?'<div class="pc-media" data-pc-inline="'+esc(m.id)+'">جاري تحميل '+(m.attachment.kind==='image'?'الصورة':'التسجيل')+'...</div>':'';
      return '<div class="pc-line '+(own?'mine':'theirs')+'">'+av+'<div class="pc-bubble"><small>'+esc(label)+' · '+esc(new Date(m.created_at).toLocaleString('ar-EG'))+'</small>'+(m.deleted?'<em class="pc-deleted">تم حذف هذه الرسالة للطرفين</em>':(m.body?'<div>'+linkify(m.body)+'</div>':'')+media)+'<button type="button" class="pc-delete" data-pc-delete="'+esc(m.id)+'" data-pc-own="'+own+'" title="حذف الرسالة" aria-label="حذف الرسالة">🗑️</button></div></div>';}).join(''):'<div class="pc-empty">ابدأ المحادثة برسالة</div>';
    s.mediaObserver?.disconnect();
    if(window.IntersectionObserver){s.mediaObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){s.mediaObserver.unobserve(entry.target);loadMedia(el,entry.target);}}),{root:box,rootMargin:'120px'});box.querySelectorAll('[data-pc-inline]').forEach(node=>s.mediaObserver.observe(node));}
    else box.querySelectorAll('[data-pc-inline]').forEach(node=>loadMedia(el,node));
    if(atBottom)box.scrollTop=box.scrollHeight;
  }
  async function send(el,attachment){const s=state.get(el);if(!attachment&&s.recorder?.state==='recording'){s.sendWhenStopped=true;stopVoice(el,false);return true;}if(!attachment&&s.preview)return sendVoicePreview(el);const field=el.querySelector('[data-pc-text]'),body=field.value.trim(),button=el.querySelector('[data-pc-send]');if(!body&&!attachment)return false;button.disabled=true;
    try{await api(s,'send',{body,attachment});field.value='';await refresh(el);return true;}catch(e){el.querySelector('.pc-error').textContent=e.message||'تعذر إرسال الرسالة';return false;}finally{button.disabled=false;}}
  async function deleteMessage(el,id,own){const s=state.get(el);let dialog=el.querySelector('.pc-delete-dialog');if(dialog)dialog.remove();dialog=document.createElement('div');dialog.className='pc-delete-dialog';dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label','حذف الرسالة');dialog.innerHTML='<div class="pc-delete-card"><strong>حذف الرسالة؟</strong><p>اختر أين تريد حذفها.</p><div class="pc-preview-actions"><button type="button" data-pc-scope="me">حذف لديّ</button>'+(own?'<button type="button" data-pc-scope="everyone">حذف للجميع</button>':'')+'<button type="button" data-pc-close>إلغاء</button></div></div>';el.appendChild(dialog);dialog.querySelector('[data-pc-close]').onclick=()=>dialog.remove();dialog.onclick=e=>{if(e.target===dialog)dialog.remove();};dialog.querySelectorAll('[data-pc-scope]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await api(s,'delete',{message_id:id,scope:button.dataset.pcScope});s.media.delete(id);dialog.remove();await refresh(el);}catch(e){button.disabled=false;el.querySelector('.pc-error').textContent=e.message||'تعذر حذف الرسالة';}});}
  async function loadMedia(el,node){const s=state.get(el),id=node.dataset.pcInline,m=s.messages.find(row=>String(row.id)===id);if(!m?.attachment)return;
    try{let media=s.media.get(id);if(!media){const result=await api(s,'media',{message_id:id});media=result?.data||result;s.media.set(id,media);if(s.media.size>20)s.media.delete(s.media.keys().next().value);}if(!node.isConnected)return;node.replaceChildren();
      if(m.attachment.kind==='image'){const img=document.createElement('img');img.src=media.data;img.alt=media.name||'صورة في المحادثة';img.loading='lazy';img.className='pc-image';node.appendChild(img);}
      else{const audio=document.createElement('audio');audio.src=media.data;audio.controls=true;audio.preload='metadata';audio.setAttribute('aria-label','رسالة صوتية');node.appendChild(audio);}
    }catch(e){if(node.isConnected)node.textContent='تعذر عرض المرفق';}}
  async function sendFile(el,file){if(!file)return;const s=state.get(el);if(!s.features.images)return;const err=el.querySelector('.pc-error');if(file.size>5*1024*1024){err.textContent='الصورة أكبر من 5 ميجابايت';return;}
    try{const img=await createImageBitmap(file);const scale=Math.min(1,1100/Math.max(img.width,img.height));const canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);img.close();let quality=.78,data=canvas.toDataURL('image/jpeg',quality);while(data.length>900000&&quality>.3){quality-=.12;data=canvas.toDataURL('image/jpeg',quality);}if(data.length>940000)throw Error('الصورة كبيرة جداً بعد الضغط');await send(el,{kind:'image',mime:'image/jpeg',name:file.name,data});}
    catch(e){err.textContent=e.message||'تعذر تجهيز الصورة';}finally{el.querySelector('[data-pc-file]').value='';}}
  async function voice(el){const s=state.get(el);if(s.recorder?.state==='recording')return;if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){el.querySelector('.pc-error').textContent='المتصفح لا يدعم تسجيل الصوت';return;}
    const mime=['audio/webm','audio/mp4','audio/ogg'].find(t=>MediaRecorder.isTypeSupported(t));if(!mime){el.querySelector('.pc-error').textContent='صيغة التسجيل الصوتي غير مدعومة في هذا المتصفح';return;}
    if(s.preview)clearPreview(el);
    try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});const rec=new MediaRecorder(stream,{mimeType:mime,audioBitsPerSecond:24000});s.recorder=rec;s.chunks=[];s.cancelRecording=false;rec.ondataavailable=e=>{if(e.data.size)s.chunks.push(e.data);};
      rec.onstop=()=>{clearInterval(s.recordTimer);cancelAnimationFrame(s.waveFrame);s.audioContext?.close();s.audioContext=null;stream.getTracks().forEach(t=>t.stop());el.querySelector('.pc-recording').hidden=true;s.recorder=null;if(s.cancelRecording){s.sendWhenStopped=false;return;}const blob=new Blob(s.chunks,{type:rec.mimeType});if(blob.size>1500000){s.sendWhenStopped=false;el.querySelector('.pc-error').textContent='التسجيل تجاوز الحد المسموح';return;}showVoicePreview(el,blob);if(s.sendWhenStopped){s.sendWhenStopped=false;sendVoicePreview(el);}};
      rec.start();const start=Date.now();el.querySelector('.pc-recording').hidden=false;el.querySelector('.pc-preview').hidden=true;
      try{const AudioContextClass=window.AudioContext||window.webkitAudioContext;if(AudioContextClass){s.audioContext=new AudioContextClass();const analyser=s.audioContext.createAnalyser();analyser.fftSize=64;s.audioContext.createMediaStreamSource(stream).connect(analyser);const levels=new Uint8Array(analyser.frequencyBinCount),bars=el.querySelectorAll('.pc-wave i');const draw=()=>{if(rec.state!=='recording')return;analyser.getByteFrequencyData(levels);bars.forEach((bar,i)=>{bar.style.height=(5+Math.round((levels[i]||0)/255*23))+'px';});s.waveFrame=requestAnimationFrame(draw);};draw();}}catch(_){}
      s.recordTimer=setInterval(()=>{const sec=Math.floor((Date.now()-start)/1000);el.querySelector('[data-pc-clock]').textContent=String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');if(sec>=60)stopVoice(el,false);},250);
    }catch(e){el.querySelector('.pc-error').textContent='لم يُسمح باستخدام الميكروفون';}}
  function stopVoice(el,cancel){const s=state.get(el);if(!s.recorder||s.recorder.state!=='recording')return;s.cancelRecording=cancel;s.recorder.stop();}
  function showVoicePreview(el,blob){const s=state.get(el),box=el.querySelector('.pc-preview'),url=URL.createObjectURL(blob);s.preview={blob,url};
    box.innerHTML='<div class="pc-preview-label">معاينة التسجيل قبل الإرسال</div><audio controls preload="metadata" aria-label="معاينة التسجيل الصوتي"></audio><div class="pc-preview-actions"><button type="button" data-pc-send-voice>إرسال الصوت</button><button type="button" data-pc-discard>حذف التسجيل</button></div>';
    box.querySelector('audio').src=url;box.hidden=false;box.querySelector('[data-pc-discard]').onclick=()=>clearPreview(el);
    box.querySelector('[data-pc-send-voice]').onclick=()=>sendVoicePreview(el);}
  async function sendVoicePreview(el){const s=state.get(el),preview=s.preview;if(!preview)return false;const button=el.querySelector('[data-pc-send-voice]');if(button?.disabled)return false;if(button)button.disabled=true;try{const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(preview.blob);});const sent=await send(el,{kind:'voice',mime:preview.blob.type.split(';')[0],name:'تسجيل صوتي',data});if(sent)clearPreview(el);return sent;}catch(e){el.querySelector('.pc-error').textContent=e.message||'تعذر تجهيز التسجيل';return false;}finally{if(button?.isConnected)button.disabled=false;}}
  function clearPreview(el){const s=state.get(el);if(s.preview)URL.revokeObjectURL(s.preview.url);s.preview=null;const box=el.querySelector('.pc-preview');box.hidden=true;box.replaceChildren();}
  window.OrdoPortalChat={mount,refresh};
})();
