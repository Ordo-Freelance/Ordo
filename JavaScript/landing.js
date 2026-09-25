(function(){
  'use strict';
  const year=document.getElementById('year');
  if(year) year.textContent=String(new Date().getFullYear());
  const root=document.getElementById('plans');
  if(!root)return;
  const labels={tasks:'إدارة المهام',projects:'إدارة المشاريع',clients:'إدارة العملاء',finance:'المالية والتحصيل',invoices:'الفواتير',proposals:'عروض الأسعار',contracts:'العقود',store:'المتجر',team:'الفريق',reports:'التقارير',schedule:'الجدولة',meetings:'الاجتماعات',cloud:'مزامنة البيانات'};
  function node(tag,cls,value){const el=document.createElement(tag);if(cls)el.className=cls;if(value!=null)el.textContent=String(value);return el;}
  function showMessage(message,retry){root.replaceChildren();const wrap=node('div','plans-message',message);if(retry){const button=node('button','btn btn-muted','إعادة المحاولة');button.type='button';button.addEventListener('click',load);wrap.appendChild(document.createElement('br'));wrap.appendChild(button);}root.appendChild(wrap);}
  function render(plans){
    root.replaceChildren();
    if(!plans.length){showMessage('لا توجد باقات متاحة حاليًا. جرّب لاحقًا.');return;}
    plans.forEach((plan,index)=>{
      const card=node('article','plan'+(index===Math.min(1,plans.length-1)?' featured':''));
      const top=node('div','plan-top');top.appendChild(node('span','plan-name',plan.name));
      if(index===Math.min(1,plans.length-1)&&plans.length>1)top.appendChild(node('span','plan-tag','الأكثر اختيارًا'));
      card.appendChild(top);
      card.appendChild(node('p','plan-desc',plan.description||'كل الأساسيات اللي تحتاجها لإدارة شغلك.'));
      const price=node('div','price',Number(plan.price_monthly||0)>0?Number(plan.price_monthly).toLocaleString('ar-EG'):'مجاني');
      if(Number(plan.price_monthly||0)>0)price.appendChild(node('small','', ' ج.م / شهر'));
      card.appendChild(price);
      card.appendChild(node('div','annual',Number(plan.price_annual||0)>0?'أو '+Number(plan.price_annual).toLocaleString('ar-EG')+' ج.م / سنة':''));
      const list=node('ul');
      Object.entries(labels).filter(([key])=>plan.features?.[key]===true).slice(0,7).forEach(([,label])=>{const li=node('li');const icon=node('i','fa-solid fa-circle-check');icon.setAttribute('aria-hidden','true');li.append(icon,document.createTextNode(label));list.appendChild(li);});
      const limits=[['max_tasks','مهمة'],['max_clients_feat','عميل'],['max_invoices','فاتورة']];
      limits.forEach(([key,label])=>{const val=Number(plan.features?.[key]);if(val>0){const li=node('li');li.append(node('i','fa-solid fa-circle-check'),document.createTextNode('حتى '+val+' '+label));list.appendChild(li);}});
      if(!list.children.length)list.appendChild(node('li','', 'اعرض التفاصيل داخل حسابك'));
      card.appendChild(list);
      const cta=node('a','btn '+(index===Math.min(1,plans.length-1)?'btn-primary':'btn-muted'),'ابدأ بهذه الباقة');
      cta.href='/dashboard?auth=register&plan='+encodeURIComponent(plan.id);
      card.appendChild(cta);root.appendChild(card);
    });
  }
  async function load(){
    showMessage('جارٍ تحميل الباقات الحالية...');
    try{
      const response=await fetch('/api/index?action=public.plans',{headers:{Accept:'application/json'}});
      if(!response.ok)throw new Error('plans_unavailable');
      const payload=await response.json();
      if(!Array.isArray(payload.data))throw new Error('plans_invalid');
      render(payload.data);
    }catch(error){showMessage('تعذّر تحميل الباقات الآن. الأسعار لا تُعرض إلا بعد التحقق من النظام.',true);}
  }
  load();
})();
