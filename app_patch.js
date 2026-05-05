// ╔══════════════════════════════════════════════════════════════════╗
// ║          ORDO — APP PATCH (إضافات وإصلاحات شاملة)              ║
// ║  1. نظام التجربة المجانية (أول تسجيل فقط)                     ║
// ║  2. صفحة الاشتراك الجديدة (باقات + لينك دفع + طلب اشتراك)    ║
// ║  3. نظام تحكم الأدمن في أقسام الموقع وميزاته                  ║
// ║  4. إصلاح إرسال التحديثات من الأدمن                           ║
// ║  5. إصلاح إرسال تحدي الأسبوع                                  ║
// ║  6. إضافة ميزات الباقة كاملة في نافذة إنشاء الباقة           ║
// ╚══════════════════════════════════════════════════════════════════╝

// ══════════════════════════════════════════════════════════════
// 1. TRIAL SYSTEM FIX — فتره تجريبية لأول تسجيل فقط
// ══════════════════════════════════════════════════════════════

// Override _activateTrial — تتحقق أن المستخدم جديد فعلاً (ما سبق له trial)
const _origActivateTrial = window._activateTrial;
window._activateTrial = async function(uid) {
  if(!uid) return;
  const key = '_trial_start_' + uid;

  // لو موجود في localStorage — مستخدم قديم، لا تعطه trial
  if(localStorage.getItem(key)) return;

  // لو موجود في cloud data — مستخدم قديم
  try {
    const { data: sd } = await supa.from('studio_data').select('data').eq('user_id', uid).maybeSingle();
    if(sd?.data) {
      const parsed = typeof sd.data === 'string' ? JSON.parse(sd.data) : sd.data;
      if(parsed?._trial_start) {
        // restore to localStorage
        localStorage.setItem(key, parsed._trial_start);
        if(typeof S !== 'undefined') S._trial_start = parsed._trial_start;
        return; // مستخدم قديم عنده trial قبل كده
      }
      // مستخدم قديم بدون trial (سجّل بعد تفعيل النظام) — لا تعطه trial
      if(parsed?.settings?.name) {
        console.log('[Trial] Existing user detected — no trial granted');
        return;
      }
    }
  } catch(e) {}

  // مستخدم جديد — أعطه trial
  const now = new Date().toISOString();
  localStorage.setItem(key, now);
  if(typeof S !== 'undefined') S._trial_start = now;
  try {
    const { data: sd2 } = await supa.from('studio_data').select('data').eq('user_id', uid).maybeSingle();
    if(sd2?.data) {
      const parsed2 = typeof sd2.data === 'string' ? JSON.parse(sd2.data) : sd2.data;
      parsed2._trial_start = now;
      await supa.from('studio_data').update({ data: JSON.stringify(parsed2), updated_at: now }).eq('user_id', uid);
    }
  } catch(e) {}
  console.log('[Trial] New user — trial activated:', now);
};

// ══════════════════════════════════════════════════════════════
// 2. SUBSCRIPTION FLOW — صفحة الاشتراك الجديدة
//    عند انتهاء التجربة: يظهر paywall جديد مع:
//    - الباقات المتاحة
//    - لينك الدفع لكل باقة
//    - رفع إيصال إجباري
//    - طلب اشتراك → يصل للأدمن
//    - أو إدخال كود تفعيل مباشرة
// ══════════════════════════════════════════════════════════════

window._openSubscriptionFlow = async function(highlightPlanId) {
  // حذف أي modal قديم
  const old = document.getElementById('_sub_flow_modal');
  if(old) old.remove();

  // جيب الباقات
  let plans = [];
  try {
    const { data, error } = await supa.from('subscription_plans').select('*');
    if(!error && data?.length) {
      plans = data.filter(p => p.active !== false).sort((a,b) => (a.price_monthly||0) - (b.price_monthly||0));
    }
  } catch(e) {}
  if(!plans.length) {
    plans = JSON.parse(localStorage.getItem('admin_plans') || localStorage.getItem('plans') || '[]');
    plans = plans.filter(p => p.active !== false);
  }

  const trial = typeof _getTrialInfo === 'function' ? _getTrialInfo() : null;
  const trialEnded = trial && !trial.active;
  const trialMsg = trialEnded
    ? '<div style="background:rgba(255,107,107,.1);border:1px solid rgba(255,107,107,.25);border-radius:10px;padding:12px 16px;font-size:13px;color:var(--accent4);font-weight:700;margin-bottom:18px;text-align:center"><i class="fa-solid fa-ban"></i> انتهت فترتك التجريبية — اشترك الآن للمتابعة</div>'
    : '';

  const overlay = document.createElement('div');
  overlay.id = '_sub_flow_modal';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(7,8,15,.92);backdrop-filter:blur(14px);display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto';

  // Build plan cards HTML
  let plansHTML = '';
  plans.forEach(plan => {
    const f = plan.features || {};
    const isHighlighted = plan.id === highlightPlanId;
    const featureList = [
      ['tasks', '📋 المهام', f.tasks !== false],
      ['clients', '👥 العملاء', f.clients !== false],
      ['finance', '💰 المالية', f.finance !== false],
      ['invoices', '🧾 الفواتير', f.invoices !== false],
      ['schedule', '📅 الجدولة', !!f.schedule],
      ['reports', '📊 التقارير', !!f.reports],
      ['team', '👨‍💼 الفريق', !!f.team],
      ['services', '🛍 المتجر', !!f.services],
      ['corporate', '🏢 الشركات', !!f.corporate],
      ['goals', '🎯 الأهداف', !!f.goals],
      ['timetracker', '⏱ تتبع الوقت', !!f.timetracker],
      ['contracts', '📄 العقود', !!f.contracts],
    ].filter(([,, v]) => v);

    const maxClients = f.max_clients_feat || plan.max_clients || 0;
    const maxTasks   = f.max_tasks || 0;

    plansHTML += `
      <div data-plan-card="${plan.id}" style="border:2px solid ${isHighlighted ? 'var(--accent)' : 'var(--border)'};border-radius:14px;overflow:hidden;background:${isHighlighted ? 'rgba(108,99,255,.06)' : 'var(--surface2)'};transition:.2s;cursor:pointer"
        onclick="_selectPlan('${plan.id}')">
        ${isHighlighted ? '<div style="background:var(--accent);color:#fff;font-size:11px;font-weight:700;padding:4px 12px;text-align:center"><i class="fa-solid fa-star"></i> الأنسب لك</div>' : ''}
        <div style="padding:16px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
            <div style="display:flex;align-items:center;gap:10px">
              <div style="font-size:30px">${plan.icon || '📦'}</div>
              <div>
                <div style="font-size:16px;font-weight:900">${plan.name}</div>
                <div style="font-size:11px;color:var(--text3)">${plan.desc || ''}</div>
              </div>
            </div>
            <div style="text-align:left">
              ${plan.price_monthly ? `<div style="font-size:20px;font-weight:900;color:var(--accent)">${plan.price_monthly.toLocaleString()} <span style="font-size:11px">ج/شهر</span></div>` : '<div style="font-size:15px;font-weight:900;color:var(--accent3)">مجاني</div>'}
              ${plan.price_annual ? `<div style="font-size:11px;color:var(--text3)">${plan.price_annual.toLocaleString()} ج/سنة</div>` : ''}
            </div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px">
            ${featureList.slice(0,6).map(([,label]) => `<span style="background:rgba(108,99,255,.1);color:var(--accent);padding:3px 8px;border-radius:20px;font-size:11px">${label}</span>`).join('')}
            ${featureList.length > 6 ? `<span style="background:var(--surface3);color:var(--text2);padding:3px 8px;border-radius:20px;font-size:11px">+${featureList.length-6} أخرى</span>` : ''}
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;font-size:10px;color:var(--text3)">
            ${maxClients ? `<span>👥 حتى ${maxClients} عميل</span>` : '<span>👥 عملاء ∞</span>'}
            ${maxTasks   ? `<span> · 📋 حتى ${maxTasks} مهمة</span>` : '<span> · 📋 مهام ∞</span>'}
          </div>
        </div>
        <div style="padding:10px 16px;background:var(--surface);border-top:1px solid var(--border);display:flex;gap:8px">
          <button onclick="event.stopPropagation();_subscribeToPlan('${plan.id}','${(plan.name||'').replace(/'/g,"\\'")}',${!!(plan.payment_link)},${JSON.stringify(plan.payment_link||'')})"
            style="flex:1;background:var(--accent);color:#fff;border:none;border-radius:8px;padding:9px;font-family:var(--font);font-size:12px;font-weight:700;cursor:pointer">
            ${plan.payment_link ? '🛒 اشترك الآن' : '🔑 عندي كود'}
          </button>
          <button onclick="event.stopPropagation();_activateCodeForPlan('${plan.id}','${(plan.name||'').replace(/'/g,"\\'")}')"
            style="background:var(--surface2);color:var(--text2);border:1.5px solid var(--border);border-radius:8px;padding:9px 12px;font-family:var(--font);font-size:12px;font-weight:700;cursor:pointer">
            🔑 كود
          </button>
        </div>
      </div>`;
  });

  overlay.innerHTML = `
    <div style="max-width:760px;width:100%;background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:28px;box-shadow:0 30px 80px rgba(0,0,0,.6);animation:_sfFadeUp .3s ease both">
      <style>@keyframes _sfFadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}</style>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <div>
          <div style="font-size:22px;font-weight:900">اختر باقتك 🚀</div>
          <div style="font-size:12px;color:var(--text3);margin-top:3px">اشترك وابدأ العمل باحترافية</div>
        </div>
        <button onclick="document.getElementById('_sub_flow_modal').remove()" style="background:var(--surface2);border:1px solid var(--border);color:var(--text2);width:36px;height:36px;border-radius:50%;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center">✕</button>
      </div>
      ${trialMsg}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:20px" id="_plan_cards_grid">
        ${plansHTML || '<div style="text-align:center;padding:40px;color:var(--text3)">لا توجد باقات متاحة</div>'}
      </div>
      <!-- Code activation section -->
      <div style="border-top:1px solid var(--border);padding-top:16px;text-align:center">
        <div style="font-size:12px;color:var(--text3);margin-bottom:10px">أو فعّل كود اشتراك لديك مباشرة</div>
        <div style="display:flex;gap:8px;max-width:360px;margin:0 auto">
          <input id="_sf_code_inp" type="text" placeholder="أدخل الكود..." dir="ltr"
            style="flex:1;background:var(--surface2);border:1.5px solid var(--border);border-radius:8px;padding:10px 12px;color:var(--text);font-family:var(--font);font-size:13px;outline:none;letter-spacing:1.5px"
            oninput="this.value=this.value.toUpperCase()"
            onkeydown="if(event.key==='Enter')_activateCodeDirect()">
          <button onclick="_activateCodeDirect()"
            style="background:var(--accent);color:#fff;border:none;border-radius:8px;padding:10px 18px;font-family:var(--font);font-size:13px;font-weight:700;cursor:pointer">تفعيل</button>
        </div>
        <div id="_sf_code_msg" style="font-size:11px;min-height:16px;margin-top:6px;text-align:center"></div>
      </div>
    </div>`;

  document.body.appendChild(overlay);
};

window._selectPlan = function(planId) {
  document.querySelectorAll('[data-plan-card]').forEach(c => {
    c.style.border = c.dataset.planCard === planId
      ? '2px solid var(--accent)'
      : '2px solid var(--border)';
  });
};

window._activateCodeDirect = function() {
  const inp = document.getElementById('_sf_code_inp');
  const msg = document.getElementById('_sf_code_msg');
  if(!inp || !msg) return;
  if(typeof _activateCode === 'function') {
    _activateCode('_sf_code_inp', '_sf_code_msg', () => {
      document.getElementById('_sub_flow_modal')?.remove();
    });
  }
};

window._activateCodeForPlan = function(planId, planName) {
  // فتح نافذة تفعيل الكود الخاصة
  const modal = document.getElementById('_sub_flow_modal');
  const codeInp = document.getElementById('_sf_code_inp');
  if(codeInp) {
    codeInp.focus();
    codeInp.style.borderColor = 'var(--accent)';
    codeInp.placeholder = `كود ${planName}...`;
    setTimeout(() => { if(codeInp) codeInp.style.borderColor = ''; }, 3000);
  }
  _selectPlan(planId);
};

// نافذة اشتراك بالدفع + إرفاق إيصال
window._subscribeToPlan = function(planId, planName, hasPaymentLink, paymentLink) {
  if(!hasPaymentLink || !paymentLink) {
    // مفيش لينك دفع — روح لتفعيل الكود
    _activateCodeForPlan(planId, planName);
    return;
  }

  // أظهر نافذة إرفاق الإيصال
  const old = document.getElementById('_pay_flow_modal');
  if(old) old.remove();

  const mo = document.createElement('div');
  mo.id = '_pay_flow_modal';
  mo.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(7,8,15,.92);backdrop-filter:blur(14px);display:flex;align-items:center;justify-content:center;padding:16px';
  mo.innerHTML = `
    <div style="max-width:480px;width:100%;background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:28px;box-shadow:0 30px 80px rgba(0,0,0,.6)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <div style="font-size:18px;font-weight:900">🛒 إتمام الاشتراك</div>
        <button onclick="document.getElementById('_pay_flow_modal').remove()" style="background:var(--surface2);border:1px solid var(--border);color:var(--text2);width:32px;height:32px;border-radius:50%;font-size:16px;cursor:pointer">✕</button>
      </div>

      <!-- Steps -->
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px;font-size:12px">
        <div style="flex:1;text-align:center;padding:8px;background:rgba(108,99,255,.12);border-radius:8px;color:var(--accent);font-weight:700">1. الدفع</div>
        <div style="color:var(--text3)">→</div>
        <div style="flex:1;text-align:center;padding:8px;background:var(--surface2);border-radius:8px;color:var(--text2)">2. إرفاق الإيصال</div>
        <div style="color:var(--text3)">→</div>
        <div style="flex:1;text-align:center;padding:8px;background:var(--surface2);border-radius:8px;color:var(--text2)">3. التفعيل</div>
      </div>

      <!-- Step 1: Payment link -->
      <div style="background:rgba(108,99,255,.06);border:1.5px dashed rgba(108,99,255,.3);border-radius:12px;padding:16px;margin-bottom:16px">
        <div style="font-size:13px;font-weight:700;color:var(--accent);margin-bottom:8px"><i class="fa-solid fa-circle-info"></i> الخطوة 1: اذهب لصفحة الدفع</div>
        <a href="${paymentLink}" target="_blank"
          style="display:flex;align-items:center;justify-content:center;gap:8px;background:var(--accent);color:#fff;padding:12px;border-radius:10px;font-weight:700;text-decoration:none;font-size:14px;margin-bottom:8px"
          onclick="_markPaymentClicked()">
          <i class="fa-solid fa-credit-card"></i> فتح صفحة الدفع — ${planName}
        </a>
        <div style="font-size:11px;color:var(--text3);text-align:center">بعد الدفع، ارجع هنا وأرفق إيصال الدفع</div>
      </div>

      <!-- Step 2: Upload receipt -->
      <div style="margin-bottom:16px">
        <div style="font-size:13px;font-weight:700;margin-bottom:8px;color:var(--text2)"><i class="fa-solid fa-image"></i> الخطوة 2: أرفق إيصال الدفع <span style="color:var(--accent4)">*</span></div>
        <div id="_receipt_preview" style="border:2px dashed var(--border);border-radius:10px;padding:20px;text-align:center;cursor:pointer;transition:.2s;margin-bottom:8px;min-height:80px;display:flex;align-items:center;justify-content:center"
          onclick="document.getElementById('_receipt_file').click()"
          ondragover="event.preventDefault();this.style.borderColor='var(--accent)'"
          ondragleave="this.style.borderColor='var(--border)'"
          ondrop="_handleReceiptDrop(event)">
          <div>
            <i class="fa-solid fa-cloud-arrow-up" style="font-size:28px;color:var(--accent);margin-bottom:8px;display:block"></i>
            <div style="font-size:13px;color:var(--text2)">اسحب صورة الإيصال أو <span style="color:var(--accent);font-weight:700">اضغط هنا</span></div>
            <div style="font-size:11px;color:var(--text3);margin-top:4px">PNG, JPG, WEBP — حتى 5MB</div>
          </div>
        </div>
        <input type="file" id="_receipt_file" accept="image/*" style="display:none" onchange="_handleReceiptFile(event)">
      </div>

      <!-- Step 3: Billing type -->
      <div style="margin-bottom:16px">
        <div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:8px">نوع الاشتراك</div>
        <div style="display:flex;gap:8px">
          <label style="flex:1;display:flex;align-items:center;gap:8px;padding:10px;background:var(--surface2);border:1.5px solid var(--border);border-radius:8px;cursor:pointer;font-size:13px">
            <input type="radio" name="_pay_billing" value="monthly" checked style="accent-color:var(--accent)"> 📅 شهري
          </label>
          <label style="flex:1;display:flex;align-items:center;gap:8px;padding:10px;background:var(--surface2);border:1.5px solid var(--border);border-radius:8px;cursor:pointer;font-size:13px">
            <input type="radio" name="_pay_billing" value="annual" style="accent-color:var(--accent)"> 📆 سنوي
          </label>
        </div>
      </div>

      <!-- Note -->
      <div style="margin-bottom:16px">
        <div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:6px">ملاحظة (اختياري)</div>
        <textarea id="_pay_note" rows="2" placeholder="أي ملاحظات للأدمن..."
          style="width:100%;background:var(--surface2);border:1.5px solid var(--border);border-radius:8px;padding:10px 12px;color:var(--text);font-family:var(--font);font-size:12px;resize:none;outline:none"></textarea>
      </div>

      <div id="_pay_error" style="color:var(--accent4);font-size:12px;min-height:16px;margin-bottom:8px;text-align:center"></div>
      <button id="_pay_submit_btn" onclick="_submitSubscriptionRequest('${planId}','${planName.replace(/'/g,"\\'")}')"
        style="width:100%;background:var(--accent);color:#fff;border:none;border-radius:10px;padding:13px;font-family:var(--font);font-size:14px;font-weight:700;cursor:pointer">
        <i class="fa-solid fa-paper-plane"></i> إرسال طلب الاشتراك
      </button>
      <div style="font-size:11px;color:var(--text3);text-align:center;margin-top:8px">سيتم مراجعة طلبك وتفعيل اشتراكك خلال 24 ساعة</div>
    </div>`;
  document.body.appendChild(mo);
};

let _receiptBase64 = null;

window._markPaymentClicked = function() {
  // Visual feedback
  setTimeout(() => {
    const preview = document.getElementById('_receipt_preview');
    if(preview) {
      preview.style.borderColor = 'var(--accent3)';
      preview.innerHTML = '<div style="color:var(--accent3);font-size:13px"><i class="fa-solid fa-circle-check"></i> أرفق الإيصال بعد الدفع</div>';
    }
  }, 500);
};

window._handleReceiptDrop = function(e) {
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  if(file) _processReceiptFile(file);
};

window._handleReceiptFile = function(e) {
  const file = e.target.files?.[0];
  if(file) _processReceiptFile(file);
};

function _processReceiptFile(file) {
  if(file.size > 5 * 1024 * 1024) {
    const err = document.getElementById('_pay_error');
    if(err) err.textContent = '⚠ حجم الصورة كبير — يجب أن يكون أقل من 5MB';
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    _receiptBase64 = e.target.result;
    const preview = document.getElementById('_receipt_preview');
    if(preview) {
      preview.style.borderColor = 'var(--accent3)';
      preview.innerHTML = `<div style="position:relative">
        <img src="${_receiptBase64}" style="max-height:120px;max-width:100%;border-radius:8px;object-fit:contain">
        <div style="position:absolute;bottom:4px;right:4px;background:rgba(79,209,165,.9);color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px"><i class="fa-solid fa-check"></i> تم الرفع</div>
      </div>`;
    }
  };
  reader.readAsDataURL(file);
}

window._submitSubscriptionRequest = async function(planId, planName) {
  const errEl = document.getElementById('_pay_error');
  const btn   = document.getElementById('_pay_submit_btn');

  if(!_receiptBase64) {
    if(errEl) errEl.textContent = '⚠ يجب إرفاق إيصال الدفع أولاً';
    return;
  }
  if(!_supaUserId) {
    if(errEl) errEl.textContent = '⚠ يجب تسجيل الدخول أولاً';
    return;
  }

  const billing = document.querySelector('input[name="_pay_billing"]:checked')?.value || 'monthly';
  const note    = document.getElementById('_pay_note')?.value.trim() || '';

  if(btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الإرسال...'; }
  if(errEl) errEl.textContent = '';

  try {
    // Upload screenshot to Supabase Storage (if bucket exists), else store as URL in description
    let screenshotUrl = null;
    try {
      const fileName = `receipts/${_supaUserId}_${Date.now()}.jpg`;
      const blob = await fetch(_receiptBase64).then(r => r.blob());
      const { data: uploadData, error: uploadErr } = await supa.storage
        .from('subscription-receipts')
        .upload(fileName, blob, { contentType: 'image/jpeg', upsert: true });
      if(!uploadErr && uploadData) {
        const { data: urlData } = supa.storage.from('subscription-receipts').getPublicUrl(fileName);
        screenshotUrl = urlData?.publicUrl || null;
      }
    } catch(uploadE) {
      // If storage not set up, use base64 directly
      screenshotUrl = _receiptBase64;
    }

    // Insert subscription request
    const { error: reqErr } = await supa.from('subscription_requests').insert([{
      user_id:        _supaUserId,
      plan_id:        planId,
      billing,
      screenshot_url: screenshotUrl,
      note:           note || null,
      status:         'pending',
      created_at:     new Date().toISOString()
    }]);

    if(reqErr) throw reqErr;

    // Send notification to admin (via user_notifications to admin user)
    // Save a pending flag in studio_data so user sees their request status
    try {
      const { data: sd } = await supa.from('studio_data').select('data').eq('user_id', _supaUserId).maybeSingle();
      if(sd?.data) {
        const parsed = typeof sd.data === 'string' ? JSON.parse(sd.data) : sd.data;
        parsed._pending_sub_request = {
          planId, billing, status: 'pending',
          submittedAt: new Date().toISOString()
        };
        await supa.from('studio_data').update({ data: JSON.stringify(parsed), updated_at: new Date().toISOString() }).eq('user_id', _supaUserId);
        if(typeof S !== 'undefined') S._pending_sub_request = parsed._pending_sub_request;
      }
    } catch(e) {}

    // Success
    document.getElementById('_pay_flow_modal')?.remove();
    document.getElementById('_sub_flow_modal')?.remove();
    _receiptBase64 = null;

    // Show success message
    _showSubRequestSuccess(planName);
    if(typeof updateSubscriptionBar === 'function') updateSubscriptionBar();

  } catch(e) {
    if(errEl) errEl.textContent = '❌ خطأ: ' + (e.message || 'حدث خطأ، حاول مجدداً');
    if(btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> إرسال طلب الاشتراك'; }
  }
};

function _showSubRequestSuccess(planName) {
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;inset:0;z-index:100001;background:rgba(7,8,15,.92);backdrop-filter:blur(14px);display:flex;align-items:center;justify-content:center;padding:20px';
  d.innerHTML = `
    <div style="max-width:380px;width:100%;background:var(--surface);border:1.5px solid rgba(79,209,165,.3);border-radius:20px;padding:32px;text-align:center;box-shadow:0 30px 80px rgba(0,0,0,.6)">
      <div style="width:80px;height:80px;background:rgba(79,209,165,.12);border:2px solid rgba(79,209,165,.3);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:36px;margin:0 auto 16px">✅</div>
      <div style="font-size:20px;font-weight:900;margin-bottom:8px">تم إرسال طلبك!</div>
      <div style="font-size:13px;color:var(--text2);line-height:1.8;margin-bottom:20px">
        طلب اشتراكك في <strong>${planName}</strong> وصل للإدارة.<br>
        سيتم مراجعته وتفعيل اشتراكك خلال <strong>24 ساعة</strong> أو أقل.<br>
        ستصلك إشعارات بحالة الطلب.
      </div>
      <button onclick="this.closest('[style]').remove()"
        style="width:100%;background:var(--accent);color:#fff;border:none;border-radius:10px;padding:13px;font-family:var(--font);font-size:14px;font-weight:700;cursor:pointer">
        <i class="fa-solid fa-check"></i> حسناً
      </button>
    </div>`;
  document.body.appendChild(d);
}

// Override الـ paywall ليظهر صفحة الاشتراك الجديدة
const _origShowPageLock = window._showPageLock;
window._showPageLock = function(id, el, reason) {
  if(reason === 'feature') {
    // الصفحة مش في الباقة — ممكن نفتح subscription flow أو نظهر رسالة
    _origShowPageLock.call(this, id, el, reason);
    return;
  }
  // لا يوجد اشتراك / انتهى — افتح صفحة الاشتراك
  window._openSubscriptionFlow();
};

// Override updateSubscriptionBar لإضافة زر طلب الاشتراك
const _origUpdateSubBar = window.updateSubscriptionBar;
window.updateSubscriptionBar = function() {
  _origUpdateSubBar?.call(this);
  // بعد التحديث: لو مفيش اشتراك ولا تجربة — ضيف زر
  const bar     = document.getElementById('sub-status-bar');
  const detailEl = document.getElementById('sub-bar-detail');
  if(!bar || !detailEl) return;

  if(!window._userSubscription) {
    const trial = typeof _getTrialInfo === 'function' ? _getTrialInfo() : null;
    if(!trial || !trial.active) {
      // انتهت التجربة
      if(detailEl) {
        detailEl.innerHTML = '<span style="cursor:pointer;color:var(--accent);font-weight:700;text-decoration:underline" onclick="_openSubscriptionFlow()">اشترك الآن ←</span>';
      }
    }
  }

  // لو في طلب اشتراك معلّق
  const pending = typeof S !== 'undefined' && S._pending_sub_request;
  if(pending && pending.status === 'pending') {
    const planEl = document.getElementById('sub-bar-plan');
    if(planEl) planEl.innerHTML = '⏳ طلب الاشتراك قيد المراجعة';
    if(detailEl) detailEl.textContent = 'سيتم التفعيل خلال 24 ساعة';
    bar.className = 'sub-status-bar active';
    const dotEl = document.getElementById('sub-dot');
    if(dotEl) dotEl.style.background = 'var(--accent2)';
  }
};

// ══════════════════════════════════════════════════════════════
// 3. ADMIN SECTIONS CONTROL — تحكم الأدمن في أقسام الموقع
//    يحفظ الإعدادات في platform_settings → config.sections_control
//    المستخدم يشوف الأقسام المفتوحة فقط
// ══════════════════════════════════════════════════════════════

// قائمة كل الأقسام والميزات القابلة للتحكم
window._ORDO_SECTIONS = {
  pages: [
    { id: 'tasks',       label: '📋 المهام والمشاريع' },
    { id: 'clients',     label: '👥 العملاء' },
    { id: 'finance',     label: '💰 المالية' },
    { id: 'invoices',    label: '🧾 الفواتير' },
    { id: 'schedule',    label: '📅 الجدولة' },
    { id: 'reports',     label: '📊 التقارير' },
    { id: 'team',        label: '👨‍💼 الفريق' },
    { id: 'meetings',    label: '🤝 الاجتماعات' },
    { id: 'learning',    label: '📚 التعلم' },
    { id: 'timetracker', label: '⏱ تتبع الوقت' },
    { id: 'services',    label: '🛍 المتجر/الخدمات' },
    { id: 'contracts',   label: '📄 العقود' },
    { id: 'goals',       label: '🎯 الأهداف' },
  ],
  features: {
    tasks: [
      { id: 'task_attachments', label: 'إرفاق ملفات بالمهمة' },
      { id: 'task_steps',       label: 'تتبع الخطوات' },
      { id: 'task_client_link', label: 'ربط المهمة بعميل' },
      { id: 'kanban',           label: 'عرض كانبان' },
    ],
    clients: [
      { id: 'clients_freelance', label: 'عملاء فري لانس' },
      { id: 'clients_fulltime',  label: 'عملاء دوام' },
      { id: 'clients_profile',   label: 'صفحة بروفايل العميل' },
      { id: 'client_portal',     label: 'بوابة العميل' },
    ],
    finance: [
      { id: 'fin_income',        label: 'تسجيل الدخل' },
      { id: 'fin_expense',       label: 'المصروفات' },
      { id: 'fin_charts',        label: 'المخططات المالية' },
      { id: 'fin_subscriptions', label: 'الاشتراكات المتكررة' },
      { id: 'loans',             label: 'القروض' },
      { id: 'budgets',           label: 'الميزانيات' },
      { id: 'fin_goals',         label: 'الأهداف المالية' },
    ],
    invoices: [
      { id: 'inv_pdf',       label: 'تصدير PDF' },
      { id: 'inv_whatsapp',  label: 'قوالب واتساب' },
      { id: 'inv_contracts', label: 'العقود' },
      { id: 'inv_policies',  label: 'شروط وسياسات' },
      { id: 'statements',    label: 'كشوفات الحساب' },
    ],
    services: [
      { id: 'svc_packages',  label: 'الباقات' },
      { id: 'svc_images',    label: 'الصور' },
      { id: 'svc_portfolio', label: 'البورتفوليو' },
      { id: 'svc_orders',    label: 'الطلبات' },
      { id: 'svc_order_link',label: 'رابط الطلبات' },
    ],
    team: [
      { id: 'team_invite',       label: 'دعوة أعضاء' },
      { id: 'corporate',         label: 'وضع الشركات' },
      { id: 'corp_emp_tasks',    label: 'مهام الموظفين' },
      { id: 'corp_emp_finance',  label: 'مالية الموظفين' },
      { id: 'corp_emp_projects', label: 'مشاريع الموظفين' },
    ],
  }
};

// تحقق من حالة قسم/ميزة معينة
window._isSectionEnabled = function(sectionId) {
  // أولاً: فحص الـ admin override من platform_settings
  const adminSections = window._adminSectionsConfig || {};
  if(adminSections[sectionId] === false) return false;
  if(adminSections[sectionId] === true) return true;

  // ثانياً: فحص الباقة
  if(typeof hasPageFeature === 'function' && !window._isAdminUser) {
    return hasPageFeature(sectionId);
  }
  return true;
};

window._isFeatureEnabled = function(featureId) {
  const adminSections = window._adminSectionsConfig || {};
  if(adminSections[featureId] === false) return false;

  // فحص الباقة
  const f = typeof _getPlanFeatures === 'function' ? _getPlanFeatures() : {};
  if(Object.keys(f).length === 0) return true;
  if(featureId in f) return !!f[featureId];
  return true;
};

// تحميل إعدادات الأقسام من cloud
async function _loadSectionsConfig() {
  try {
    const { data } = await supa.from('platform_settings').select('config').eq('id',1).maybeSingle();
    if(data?.config) {
      const cfg = typeof data.config === 'string' ? JSON.parse(data.config) : data.config;
      window._adminSectionsConfig = cfg.sections_control || {};
      _applySectionsConfig();
    }
  } catch(e) {}
}

function _applySectionsConfig() {
  const cfg = window._adminSectionsConfig || {};

  // إخفاء / إظهار عناصر القائمة الجانبية
  _ORDO_SECTIONS.pages.forEach(({ id }) => {
    if(cfg[id] === false) {
      // إخفاء من القائمة
      document.querySelectorAll(`.nav-item, .bn-item, .bn-more-item`).forEach(el => {
        const oc = el.getAttribute('onclick') || '';
        if(oc.includes(`'${id}'`)) {
          el.style.display = 'none';
          el.dataset.hiddenByAdmin = '1';
        }
      });
      // إخفاء الصفحة نفسها
      const page = document.getElementById('page-' + id);
      if(page) page.dataset.adminHidden = '1';
    } else {
      // إظهار لو كان مخفياً
      document.querySelectorAll(`[data-hidden-by-admin]`).forEach(el => {
        const oc = el.getAttribute('onclick') || '';
        if(oc.includes(`'${id}'`)) {
          el.style.display = '';
          delete el.dataset.hiddenByAdmin;
        }
      });
    }
  });
}

// تحميل الإعدادات عند بدء التطبيق
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(_loadSectionsConfig, 2000);
});

// ══════════════════════════════════════════════════════════════
// 4. FIX ADMIN UPDATES — إصلاح إرسال التحديثات من الأدمن
//    المشكلة: التحديثات تتحفظ في _notifications بس مش في _platform_updates
//    الحل: نضيفها في _platform_updates عند كل مستخدم
// ══════════════════════════════════════════════════════════════

// هذا الكود يشغّل في app.js — نفحص التحديثات عند تحميل البيانات
const _origLoadUserSub = window.loadUserSubscription;
window.loadUserSubscription = async function(uid) {
  const result = await _origLoadUserSub?.call(this, uid);
  // فحص إشعارات الأدمن والتحديثات
  _loadAdminUpdatesFromCloud();
  return result;
};

async function _loadAdminUpdatesFromCloud() {
  try {
    const { data } = await supa.from('platform_settings').select('config').eq('id',1).maybeSingle();
    if(data?.config) {
      const cfg = typeof data.config === 'string' ? JSON.parse(data.config) : data.config;
      if(Array.isArray(cfg.admin_updates) && cfg.admin_updates.length) {
        // Merge with S._platform_updates
        if(typeof S !== 'undefined') {
          if(!S._platform_updates) S._platform_updates = [];
          cfg.admin_updates.forEach(u => {
            if(!S._platform_updates.find(x => x.id === u.id)) {
              S._platform_updates.unshift(u);
            }
          });
          // Cache
          try { localStorage.setItem('_platform_updates_cache', JSON.stringify(S._platform_updates.slice(0,20))); } catch(e) {}
          // Show badge if new
          const lastRead = localStorage.getItem('_last_read_admin_update') || '';
          if(cfg.admin_updates[0]?.id !== lastRead) {
            const badge = document.getElementById('stab-features-badge');
            if(badge) badge.style.display = 'inline-block';
            // Re-render if on dashboard
            const container = document.getElementById('admin-updates-list');
            if(container && typeof _renderAdminUpdates === 'function') _renderAdminUpdates(container);
          }
        }
      }
      // Load sections config
      if(cfg.sections_control) {
        window._adminSectionsConfig = cfg.sections_control;
        _applySectionsConfig();
      }
    }
  } catch(e) {}
}

// ══════════════════════════════════════════════════════════════
// 5. FIX WEEKLY CHALLENGE — إصلاح تحدي الأسبوع
//    المشكلة: التحدي يتحفظ في _adminChallenge بس مش بيظهر عند المستخدم
//    الحل: نفحص _adminChallenge من studio_data ونعرضه بشكل واضح
// ══════════════════════════════════════════════════════════════

// فحص وعرض التحدي الأسبوعي عند التحميل
(function() {
  function _checkAndShowChallenge() {
    if(typeof S === 'undefined') return;
    const ch = S._adminChallenge;
    if(!ch || !ch.id) return;

    // فحص لو التحدي لهذا الأسبوع
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0,0,0,0);
    const chDate = new Date(ch.weekKey || ch.sentAt || 0);
    if(chDate < new Date(weekStart.getTime() - 7*86400000)) return; // قديم جداً

    // عرض نوتيفيكيشن للتحدي
    const notifEl = document.getElementById('admin-updates-list') || document.getElementById('_challenge_widget');
    if(notifEl) {
      _renderChallengeWidget(ch, notifEl);
    }

    // تحديث الباج
    const badge = document.getElementById('stab-features-badge');
    if(badge && !ch.done) badge.style.display = 'inline-block';
  }

  function _renderChallengeWidget(ch, container) {
    const progress = Math.min(ch.progress || 0, ch.target);
    const pct = ch.target > 0 ? Math.round(progress / ch.target * 100) : 0;
    const isDone = ch.done || progress >= ch.target;

    const html = `
      <div style="background:linear-gradient(135deg,rgba(247,201,72,.08),rgba(108,99,255,.05));border:1.5px solid ${isDone ? 'var(--accent3)' : 'rgba(247,201,72,.4)'};border-radius:12px;padding:14px 16px;margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <div style="font-size:28px">${ch.emoji||'🏆'}</div>
          <div style="flex:1">
            <div style="font-size:14px;font-weight:800;color:${isDone?'var(--accent3)':'var(--accent2)'}">${isDone?'✅ أنجزت التحدي! 🎉':ch.title}</div>
            ${!isDone ? `<div style="font-size:11px;color:var(--text3)">${ch.desc||''}</div>` : ''}
          </div>
          <div style="text-align:center">
            <div style="font-size:18px;font-weight:900;color:${isDone?'var(--accent3)':'var(--accent2)'}">${progress}/${ch.target}</div>
            <div style="font-size:10px;color:var(--text3)">${ch.unit||''}</div>
          </div>
        </div>
        <div style="background:var(--surface3);border-radius:10px;height:8px;overflow:hidden;margin-bottom:8px">
          <div style="height:100%;background:${isDone?'var(--accent3)':'linear-gradient(90deg,var(--accent2),var(--accent))'};border-radius:10px;transition:width .4s;width:${pct}%"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text3)">
          <span>${pct}% مكتمل</span>
          <span>${isDone ? ch.reward||'🎉 أحسنت!' : `${ch.target-progress} ${ch.unit} متبقي`}</span>
        </div>
      </div>`;

    // إضافة قبل باقي المحتوى
    const existing = container.querySelector('[data-challenge-widget]');
    if(existing) existing.remove();
    const div = document.createElement('div');
    div.dataset.challengeWidget = '1';
    div.innerHTML = html;
    container.insertBefore(div, container.firstChild);
  }

  // Hook على renderAll
  const _origRenderAll = window.renderAll;
  if(typeof _origRenderAll === 'function') {
    window.renderAll = function() {
      _origRenderAll.apply(this, arguments);
      setTimeout(_checkAndShowChallenge, 500);
    };
  }

  // تحقق عند تحميل الصفحة
  window.addEventListener('load', () => setTimeout(_checkAndShowChallenge, 2000));
})();

// ══════════════════════════════════════════════════════════════
// 6. FULL FEATURES IN PLAN MODAL (admin) — كل المميزات في نافذة إنشاء الباقة
//    هذا الكود يُحقّن أقساماً إضافية في نافذة إنشاء الباقة بعد فتحها
// ══════════════════════════════════════════════════════════════

// هذا يشغّل في admin.html فقط — مفيش أثر في app.js
if(typeof document !== 'undefined' && window.location.pathname.includes('admin')) {
  window._injectExtraPlanSections = function() {
    const accordion = document.getElementById('cp-sections-accordion');
    if(!accordion || document.getElementById('acc-services')) return;

    const extraSections = `
    <!-- المتجر والخدمات -->
    <div class="acc-section" id="acc-services">
      <div class="acc-header" onclick="toggleAcc('services')">
        <div style="display:flex;align-items:center;gap:10px">
          <input type="checkbox" id="feat-services" onclick="event.stopPropagation()" style="width:16px;height:16px">
          <span style="font-weight:700">🛍 المتجر والخدمات</span>
        </div>
        <span class="acc-arrow">▾</span>
      </div>
      <div class="acc-body" id="acc-body-services" style="display:none">
        <div class="acc-row"><label>عدد الخدمات</label><input type="number" class="form-input acc-num" id="feat-max-services" placeholder="0=∞" min="0"></div>
        <div class="acc-row acc-check"><label>باقات الخدمات</label><input type="checkbox" id="feat-svc-packages"></div>
        <div class="acc-row acc-check"><label>صور الخدمات</label><input type="checkbox" id="feat-svc-images"></div>
        <div class="acc-row acc-check"><label>البورتفوليو</label><input type="checkbox" id="feat-svc-portfolio"></div>
        <div class="acc-row acc-check"><label>رابط الطلبات</label><input type="checkbox" id="feat-svc-order-link"></div>
        <div class="acc-row acc-check"><label>إدارة الطلبات</label><input type="checkbox" id="feat-svc-orders"></div>
        <div class="acc-row acc-check"><label>إنشاء مهام تلقائية من الطلب</label><input type="checkbox" id="feat-svc-auto-task"></div>
        <div class="acc-row acc-check"><label>بوابة العميل للخدمات</label><input type="checkbox" id="feat-client-portal-svc"></div>
      </div>
    </div>

    <!-- باقة الشركات -->
    <div class="acc-section" id="acc-corporate">
      <div class="acc-header" onclick="toggleAcc('corporate')">
        <div style="display:flex;align-items:center;gap:10px">
          <input type="checkbox" id="feat-corporate" onclick="event.stopPropagation()" style="width:16px;height:16px">
          <span style="font-weight:700">🏢 وضع الشركات والفرق</span>
        </div>
        <span class="acc-arrow">▾</span>
      </div>
      <div class="acc-body" id="acc-body-corporate" style="display:none">
        <div class="acc-row"><label>الحد الأقصى للموظفين</label><input type="number" class="form-input acc-num" id="feat-corp-max-employees" placeholder="0=∞" min="0"></div>
        <div class="acc-row"><label>الحد الأقصى للأقسام</label><input type="number" class="form-input acc-num" id="feat-corp-max-depts" placeholder="0=∞" min="0"></div>
        <div class="acc-row acc-check"><label>وضع الشركة الكامل</label><input type="checkbox" id="feat-corp-mode"></div>
        <div class="acc-row acc-check"><label>مهام الموظفين</label><input type="checkbox" id="feat-corp-emp-tasks"></div>
        <div class="acc-row acc-check"><label>مشاريع الموظفين</label><input type="checkbox" id="feat-corp-emp-projects"></div>
        <div class="acc-row acc-check"><label>ملفات الموظفين</label><input type="checkbox" id="feat-corp-emp-files"></div>
        <div class="acc-row acc-check"><label>بيانات أخرى للموظفين</label><input type="checkbox" id="feat-corp-emp-others"></div>
        <div class="acc-row acc-check"><label>مالية الموظفين</label><input type="checkbox" id="feat-corp-emp-finance"></div>
        <div class="acc-row acc-check"><label>عملاء الموظفين</label><input type="checkbox" id="feat-corp-emp-clients"></div>
        <div class="acc-row acc-check"><label>دعوة بالإيميل</label><input type="checkbox" id="feat-corp-invite-email" checked></div>
        <div class="acc-row acc-check"><label>قبول الدعوات</label><input type="checkbox" id="feat-corp-invite-accept" checked></div>
      </div>
    </div>

    <!-- الأهداف والتتبع المالي -->
    <div class="acc-section" id="acc-goals-finance">
      <div class="acc-header" onclick="toggleAcc('goals-finance')">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-weight:700">🎯 الأهداف والتتبع المالي المتقدم</span>
        </div>
        <span class="acc-arrow">▾</span>
      </div>
      <div class="acc-body" id="acc-body-goals-finance" style="display:none">
        <div class="acc-row acc-check"><label>🎯 الأهداف الشخصية والمهنية</label><input type="checkbox" id="feat-goals"></div>
        <div class="acc-row acc-check"><label>🎯 أهداف مالية مخصصة</label><input type="checkbox" id="feat-fin-goals"></div>
        <div class="acc-row acc-check"><label>📊 الميزانيات</label><input type="checkbox" id="feat-budgets"></div>
        <div class="acc-row acc-check"><label>💳 القروض والديون</label><input type="checkbox" id="feat-loans"></div>
        <div class="acc-row acc-check"><label>📋 كشوفات الحساب</label><input type="checkbox" id="feat-statements"></div>
        <div class="acc-row acc-check"><label>📈 تقارير الأداء المالي</label><input type="checkbox" id="feat-fin-performance"></div>
      </div>
    </div>

    <!-- العقود والفواتير المتقدمة -->
    <div class="acc-section" id="acc-contracts-adv">
      <div class="acc-header" onclick="toggleAcc('contracts-adv')">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-weight:700">📄 العقود والفواتير المتقدمة</span>
        </div>
        <span class="acc-arrow">▾</span>
      </div>
      <div class="acc-body" id="acc-body-contracts-adv" style="display:none">
        <div class="acc-row acc-check"><label>📄 العقود الرقمية مع توقيع</label><input type="checkbox" id="feat-contracts-digital"></div>
        <div class="acc-row acc-check"><label>📋 قوالب العقود المتعددة</label><input type="checkbox" id="feat-contract-templates"></div>
        <div class="acc-row acc-check"><label>🧾 فواتير متقدمة (بنود متعددة)</label><input type="checkbox" id="feat-inv-advanced"></div>
        <div class="acc-row acc-check"><label>📑 كشف حساب العميل</label><input type="checkbox" id="feat-client-statement"></div>
        <div class="acc-row acc-check"><label>💌 إرسال الفاتورة بالبريد</label><input type="checkbox" id="feat-inv-email"></div>
        <div class="acc-row acc-check"><label>💼 الاتفاقيات والسياسات</label><input type="checkbox" id="feat-agreements"></div>
      </div>
    </div>

    <!-- تخصصات ولغات -->
    <div class="acc-section" id="acc-spec-lang">
      <div class="acc-header" onclick="toggleAcc('spec-lang')">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-weight:700">🌍 التخصصات واللغات</span>
        </div>
        <span class="acc-arrow">▾</span>
      </div>
      <div class="acc-body" id="acc-body-spec-lang" style="display:none">
        <div class="acc-row acc-check"><label>🎨 التخصصات المهنية</label><input type="checkbox" id="feat-specializations" checked></div>
        <div class="acc-row acc-check"><label>إدارة التخصصات</label><input type="checkbox" id="feat-spec-manage" checked></div>
        <div class="acc-row acc-check"><label>تخصصات متعددة</label><input type="checkbox" id="feat-spec-multi"></div>
        <div class="acc-row acc-check"><label>🌐 تعدد اللغات</label><input type="checkbox" id="feat-languages"></div>
        <div class="acc-row acc-check"><label>التبديل بين اللغات</label><input type="checkbox" id="feat-lang-switch"></div>
        <div class="acc-row acc-check"><label>اللغة العربية</label><input type="checkbox" id="feat-lang-ar" checked></div>
        <div class="acc-row acc-check"><label>اللغة الإنجليزية</label><input type="checkbox" id="feat-lang-en"></div>
      </div>
    </div>`;

    accordion.insertAdjacentHTML('beforeend', extraSections);
  };
}

// ══════════════════════════════════════════════════════════════
// 7. SECTIONS CONTROL PAGE — صفحة تحكم الأقسام في الأدمن
//    تُضاف ككود قابل للحقن في admin.html
// ══════════════════════════════════════════════════════════════

// هذا الكود يُحقّن صفحة جديدة "تحكم الأقسام" في admin.html
if(typeof document !== 'undefined' && window.location.pathname.includes('admin')) {
  document.addEventListener('DOMContentLoaded', () => {
    // إضافة السكشن في السايدبار بعد الإعدادات
    const platform = document.getElementById('nav-platform');
    if(platform && !document.getElementById('nav-sections-ctrl')) {
      const nav = document.createElement('a');
      nav.className = 'nav-item';
      nav.id = 'nav-sections-ctrl';
      nav.setAttribute('onclick', "showPage('sections-ctrl')");
      nav.innerHTML = '<span class="nav-icon"><i class="fa-solid fa-toggle-on"></i></span>تحكم أقسام الموقع';
      platform.insertAdjacentElement('afterend', nav);
    }

    // إضافة الصفحة
    const main = document.querySelector('.main');
    if(main && !document.getElementById('page-sections-ctrl')) {
      const page = document.createElement('div');
      page.className = 'page';
      page.id = 'page-sections-ctrl';
      page.innerHTML = _buildSectionsCtrlPage();
      main.appendChild(page);
    }
  });

  function _buildSectionsCtrlPage() {
    const pages = [
      { id:'tasks',       label:'📋 المهام والمشاريع' },
      { id:'clients',     label:'👥 العملاء' },
      { id:'finance',     label:'💰 المالية' },
      { id:'invoices',    label:'🧾 الفواتير' },
      { id:'schedule',    label:'📅 الجدولة' },
      { id:'reports',     label:'📊 التقارير' },
      { id:'team',        label:'👨‍💼 الفريق' },
      { id:'meetings',    label:'🤝 الاجتماعات' },
      { id:'learning',    label:'📚 التعلم' },
      { id:'timetracker', label:'⏱ تتبع الوقت' },
      { id:'services',    label:'🛍 المتجر/الخدمات' },
      { id:'contracts',   label:'📄 العقود' },
      { id:'goals',       label:'🎯 الأهداف' },
    ];

    const features = [
      { id:'task_attachments', label:'📎 إرفاق ملفات بالمهمة', section:'tasks' },
      { id:'task_steps',       label:'📊 تتبع خطوات المهمة', section:'tasks' },
      { id:'kanban',           label:'🗂 عرض كانبان', section:'tasks' },
      { id:'client_portal',    label:'🌐 بوابة العميل', section:'clients' },
      { id:'loans',            label:'💳 القروض والديون', section:'finance' },
      { id:'budgets',          label:'📊 الميزانيات', section:'finance' },
      { id:'statements',       label:'📋 كشوفات الحساب', section:'invoices' },
      { id:'inv_contracts',    label:'📄 العقود', section:'invoices' },
      { id:'svc_packages',     label:'📦 باقات الخدمات', section:'services' },
      { id:'svc_portfolio',    label:'🖼 البورتفوليو', section:'services' },
      { id:'corporate',        label:'🏢 وضع الشركات', section:'team' },
      { id:'fin_goals',        label:'🎯 الأهداف المالية', section:'finance' },
    ];

    return `
      <div class="page-header">
        <div>
          <div class="page-title">تحكم <span>أقسام الموقع</span></div>
          <div class="page-sub">فعّل أو عطّل الأقسام والميزات لجميع المستخدمين</div>
        </div>
        <button class="btn btn-primary" onclick="saveSectionsConfig()">💾 حفظ التغييرات</button>
      </div>

      <div style="background:rgba(247,201,72,.08);border:1px solid rgba(247,201,72,.25);border-radius:10px;padding:12px 16px;font-size:13px;color:var(--text2);margin-bottom:20px">
        ⚠ هذه الإعدادات تنطبق على <strong>جميع المستخدمين</strong>. تعطيل قسم يخفيه من القائمة الجانبية لكل المستخدمين بغض النظر عن باقتهم.
      </div>

      <div class="grid grid-2" style="gap:16px">
        <!-- الأقسام الرئيسية -->
        <div class="card">
          <div style="font-size:14px;font-weight:800;margin-bottom:16px;color:var(--accent)"><i class="fa-solid fa-layout"></i> الأقسام الرئيسية</div>
          <div style="display:flex;flex-direction:column;gap:8px" id="sections-ctrl-pages">
            ${pages.map(p => `
              <label style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;cursor:pointer">
                <span style="font-size:13px;font-weight:600">${p.label}</span>
                <div style="position:relative;width:40px;height:22px">
                  <input type="checkbox" id="sc-${p.id}" data-sc-id="${p.id}" checked
                    style="opacity:0;width:0;height:0;position:absolute"
                    onchange="_updateSectionToggle(this)">
                  <label for="sc-${p.id}" style="position:absolute;inset:0;background:var(--accent);border-radius:11px;cursor:pointer;transition:.2s" id="sc-lbl-${p.id}">
                    <div style="position:absolute;top:2px;right:2px;width:18px;height:18px;background:#fff;border-radius:50%;transition:.2s" id="sc-knob-${p.id}"></div>
                  </label>
                </div>
              </label>`).join('')}
          </div>
        </div>

        <!-- الميزات التفصيلية -->
        <div class="card">
          <div style="font-size:14px;font-weight:800;margin-bottom:16px;color:var(--accent3)"><i class="fa-solid fa-sliders"></i> الميزات التفصيلية</div>
          <div style="display:flex;flex-direction:column;gap:8px" id="sections-ctrl-features">
            ${features.map(f => `
              <label style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;cursor:pointer">
                <div>
                  <span style="font-size:13px;font-weight:600">${f.label}</span>
                  <div style="font-size:10px;color:var(--text3);margin-top:1px">قسم: ${pages.find(p=>p.id===f.section)?.label||f.section}</div>
                </div>
                <div style="position:relative;width:40px;height:22px">
                  <input type="checkbox" id="sc-feat-${f.id}" data-sc-id="${f.id}" checked
                    style="opacity:0;width:0;height:0;position:absolute"
                    onchange="_updateSectionToggle(this)">
                  <label for="sc-feat-${f.id}" style="position:absolute;inset:0;background:var(--accent);border-radius:11px;cursor:pointer;transition:.2s" id="sc-lbl-feat-${f.id}">
                    <div style="position:absolute;top:2px;right:2px;width:18px;height:18px;background:#fff;border-radius:50%;transition:.2s" id="sc-knob-feat-${f.id}"></div>
                  </label>
                </div>
              </label>`).join('')}
          </div>
        </div>
      </div>

      <style>
        input[type=checkbox][data-sc-id]:checked ~ label { background:var(--accent); }
        input[type=checkbox][data-sc-id]:not(:checked) ~ label { background:var(--text3); }
        input[type=checkbox][data-sc-id]:not(:checked) ~ label div { transform:translateX(18px); }
      </style>`;
  }

  window._updateSectionToggle = function(cb) {
    const id = cb.dataset.scId;
    const lbl = document.getElementById(`sc-lbl-${id}`) || document.getElementById(`sc-lbl-feat-${id}`);
    const knob = document.getElementById(`sc-knob-${id}`) || document.getElementById(`sc-knob-feat-${id}`);
    if(lbl) lbl.style.background = cb.checked ? 'var(--accent)' : 'var(--text3)';
    if(knob) knob.style.transform = cb.checked ? '' : 'translateX(18px)';
  };

  window.saveSectionsConfig = async function() {
    const config = {};
    document.querySelectorAll('[data-sc-id]').forEach(cb => {
      config[cb.dataset.scId] = cb.checked;
    });

    try {
      // جيب الـ config الحالي
      let cfg = {};
      try {
        const { data } = await supa.from('platform_settings').select('config').eq('id',1).maybeSingle();
        if(data?.config) cfg = typeof data.config === 'string' ? JSON.parse(data.config) : data.config;
      } catch(e) {}
      cfg.sections_control = config;
      await supa.from('platform_settings').upsert({ id:1, config: JSON.stringify(cfg), updated_at: new Date().toISOString() }, { onConflict:'id' });
      if(typeof toast === 'function') toast('✅ تم حفظ إعدادات الأقسام — ستنطبق على جميع المستخدمين فوراً');
      if(typeof logActivity === 'function') logActivity('تحكم الأقسام', 'تم تحديث إعدادات تفعيل الأقسام', 'var(--accent)');
    } catch(e) {
      if(typeof toast === 'function') toast('❌ خطأ: ' + e.message);
    }
  };

  // تحميل الإعدادات الحالية عند فتح الصفحة
  const _origShowPageAdmin = window.showPage;
  if(typeof _origShowPageAdmin === 'function') {
    window.showPage = function(name) {
      _origShowPageAdmin.apply(this, arguments);
      if(name === 'sections-ctrl') _loadSectionsCtrl();
    };
  }

  async function _loadSectionsCtrl() {
    try {
      const { data } = await supa.from('platform_settings').select('config').eq('id',1).maybeSingle();
      if(data?.config) {
        const cfg = typeof data.config === 'string' ? JSON.parse(data.config) : data.config;
        const sc = cfg.sections_control || {};
        document.querySelectorAll('[data-sc-id]').forEach(cb => {
          const id = cb.dataset.scId;
          cb.checked = sc[id] !== false; // default = enabled
          _updateSectionToggle(cb);
        });
      }
    } catch(e) {}
  }
}

// ══════════════════════════════════════════════════════════════
// OVERRIDE renderPlansListing — استخدام نظام الدفع الجديد
// ══════════════════════════════════════════════════════════════
window.renderPlansListing = async function() {
  const el = document.getElementById('plans-listing-body');
  if(!el) return;
  el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3)"><i class="fa-solid fa-spinner fa-spin"></i> جاري التحميل...</div>';

  let plans = [];
  try {
    const { data, error } = await supa.from('subscription_plans').select('*');
    if(!error && data?.length) {
      plans = data.filter(p => p.active !== false).sort((a,b)=>(a.price_monthly||0)-(b.price_monthly||0));
    }
  } catch(e) {}
  if(!plans.length) {
    plans = JSON.parse(localStorage.getItem('admin_plans')||localStorage.getItem('plans')||'[]');
    plans = plans.filter(p => p.active !== false);
  }
  if(!plans.length) {
    el.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text3)"><i class="fa-solid fa-box-open" style="font-size:32px;margin-bottom:10px;display:block;opacity:.3"></i>لا توجد باقات متاحة حالياً</div>';
    return;
  }

  const currentPlanId = window._userSubscription?.planId || window._userSubscription?.plan_id;

  el.innerHTML = '<div style="display:flex;flex-direction:column;gap:12px">' + plans.map(plan => {
    const f = plan.features || {};
    const isCurrent = plan.id === currentPlanId;
    const hasPayLink = !!(plan.payment_link);

    const featList = [
      f.tasks !== false     && '📋 المهام',
      f.clients !== false   && '👥 العملاء',
      f.finance !== false   && '💰 المالية',
      f.invoices !== false  && '🧾 الفواتير',
      f.schedule            && '📅 الجدولة',
      f.reports             && '📊 التقارير',
      f.team                && '👨‍💼 الفريق',
      f.services            && '🛍 المتجر',
      f.corporate           && '🏢 الشركات',
      f.timetracker         && '⏱ تتبع الوقت',
      f.contracts           && '📄 العقود',
      f.goals               && '🎯 الأهداف',
      f.loans               && '💳 القروض',
      f.budgets             && '📊 الميزانيات',
    ].filter(Boolean);

    const limits = [
      (f.max_clients_feat||plan.max_clients) ? `👥 ${f.max_clients_feat||plan.max_clients} عميل` : '👥 ∞',
      f.max_tasks ? `📋 ${f.max_tasks} مهمة` : '📋 ∞',
      f.max_invoices ? `🧾 ${f.max_invoices} فاتورة` : '🧾 ∞',
    ];

    return `
      <div style="border:1.5px solid ${isCurrent?'var(--accent)':'var(--border)'};border-radius:14px;overflow:hidden;background:${isCurrent?'rgba(108,99,255,.04)':'var(--surface2)'};position:relative">
        ${isCurrent ? '<div style="position:absolute;top:10px;left:10px;background:var(--accent);color:#fff;font-size:10px;font-weight:700;padding:2px 10px;border-radius:20px">باقتك الحالية ✓</div>' : ''}
        <div style="padding:16px 16px 12px;display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
          <div style="display:flex;align-items:center;gap:12px">
            <div style="font-size:32px">${plan.icon||'📦'}</div>
            <div>
              <div style="font-size:16px;font-weight:900">${plan.name}</div>
              <div style="font-size:11px;color:var(--text3)">${plan.desc||''}</div>
            </div>
          </div>
          <div style="text-align:left;flex-shrink:0">
            ${plan.price_monthly ? `<div style="font-size:20px;font-weight:900;color:var(--accent)">${plan.price_monthly.toLocaleString()} <span style="font-size:11px">ج/شهر</span></div>` : '<div style="font-size:15px;font-weight:900;color:var(--accent3)">مجاني</div>'}
            ${plan.price_annual ? `<div style="font-size:11px;color:var(--text3)">${plan.price_annual.toLocaleString()} ج/سنة</div>` : ''}
          </div>
        </div>
        <div style="padding:0 16px 10px;display:flex;flex-wrap:wrap;gap:5px">
          ${featList.slice(0,8).map(f=>`<span style="background:rgba(108,99,255,.1);color:var(--accent);padding:3px 9px;border-radius:20px;font-size:11px">${f}</span>`).join('')}
          ${featList.length>8?`<span style="background:var(--surface3);color:var(--text2);padding:3px 9px;border-radius:20px;font-size:11px">+${featList.length-8}</span>`:''}
        </div>
        <div style="padding:0 16px 12px;display:flex;flex-wrap:wrap;gap:4px">
          ${limits.map(l=>`<span style="background:var(--surface3);color:var(--text2);padding:2px 8px;border-radius:10px;font-size:10px">${l}</span>`).join('')}
        </div>
        <div style="padding:10px 16px;background:var(--surface);border-top:1px solid var(--border);display:flex;gap:8px">
          ${isCurrent
            ? `<div style="flex:1;text-align:center;font-size:12px;color:var(--accent3);font-weight:700;padding:8px"><i class="fa-solid fa-square-check"></i> باقتك الحالية</div>`
            : hasPayLink
              ? `<button onclick="closeM('modal-subscription-info');setTimeout(()=>_subscribeToPlan('${plan.id}','${(plan.name||'').replace(/'/g,"\\'")}',true,${JSON.stringify(plan.payment_link||'')}),150)"
                  style="flex:1;background:var(--accent);color:#fff;border:none;border-radius:8px;padding:10px;font-family:var(--font);font-size:13px;font-weight:700;cursor:pointer">
                  <i class="fa-solid fa-credit-card"></i> اشترك الآن — ${plan.name}
                </button>
                <button onclick="openCodeActivation('${plan.id}','${(plan.name||'').replace(/'/g,"\\'")}')"
                  style="background:var(--surface2);color:var(--text2);border:1.5px solid var(--border);border-radius:8px;padding:10px 14px;font-family:var(--font);font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap">
                  🔑 كود
                </button>`
              : `<button onclick="openCodeActivation('${plan.id}','${(plan.name||'').replace(/'/g,"\\'")}')"
                  style="flex:1;background:var(--accent);color:#fff;border:none;border-radius:8px;padding:10px;font-family:var(--font);font-size:13px;font-weight:700;cursor:pointer">
                  <i class="fa-solid fa-key"></i> عندي كود — تفعيل ${plan.name}
                </button>`
          }
        </div>
      </div>`;
  }).join('') + '</div>';
};


//    إضافة زر طلب اشتراك جديد بدل واتساب فقط
// ══════════════════════════════════════════════════════════════

const _origOpenSubInfo = window.openSubscriptionInfo;
window.openSubscriptionInfo = function() {
  _origOpenSubInfo?.call(this);

  // بعد فتح النافذة — patch زر "شراء باقة عبر واتساب" ليفتح صفحة الباقات
  setTimeout(() => {
    const body = document.getElementById('sub-info-body');
    if(!body || window._userSubscription) return; // لو عنده اشتراك، مفيش حاجة نغيرها

    // ابحث عن زر واتساب واضف زر قبله
    const waBtn = body.querySelector('a[href*="wa.me"]');
    if(waBtn && !body.querySelector('[data-sub-flow-btn]')) {
      const newBtn = document.createElement('button');
      newBtn.setAttribute('data-sub-flow-btn', '1');
      newBtn.style.cssText = 'width:100%;background:var(--accent);color:#fff;border:none;border-radius:10px;padding:12px;font-family:var(--font);font-size:13px;font-weight:700;cursor:pointer;margin-bottom:8px;display:flex;align-items:center;justify-content:center;gap:8px';
      newBtn.innerHTML = '<i class="fa-solid fa-rocket"></i> اشترك الآن — اختر باقتك';
      newBtn.onclick = () => {
        if(typeof closeM === 'function') closeM('modal-subscription-info');
        setTimeout(() => window._openSubscriptionFlow(), 200);
      };
      waBtn.insertAdjacentElement('beforebegin', newBtn);
    }
  }, 100);
};


// ══════════════════════════════════════════════════════════════
// PATCH 3: تسجيل عميل محتمل تلقائياً من عروض الأسعار
// ══════════════════════════════════════════════════════════════
(function _patchProposalAutoLead(){
  // نعمل override لـ saveProposal بعد تحميلها
  var _patchInterval = setInterval(function(){
    if(typeof saveProposal !== 'function') return;
    clearInterval(_patchInterval);
    var _origSaveProp = saveProposal;
    window.saveProposal = async function(saveStatus){
      await _origSaveProp.apply(this, arguments);
      // بعد الحفظ — تحديث leads
      if(!S.leads) S.leads=[];
      _syncLeadsFromProposals && _syncLeadsFromProposals();
    };
  }, 1000);
})();

// ══════════════════════════════════════════════════════════════
// PATCH 4: إشعار إضافة العضو للفريق/الشركة
// ══════════════════════════════════════════════════════════════
(function _patchTeamNotification(){
  // نبحث عن دالة قبول الدعوة أو إضافة عضو
  var _pi = setInterval(function(){
    if(typeof acceptTeamInvite !== 'function' && typeof joinTeam !== 'function') return;
    clearInterval(_pi);
    // patch acceptTeamInvite إن وُجدت
    if(typeof acceptTeamInvite === 'function'){
      var _orig = acceptTeamInvite;
      window.acceptTeamInvite = async function(){
        await _orig.apply(this, arguments);
        // إشعار للمستخدم
        toast('<i class="fa-solid fa-people-group" style="color:var(--accent3)"></i> تم قبولك في الفريق! 🎉');
      };
    }
  }, 1500);
})();

// ══════════════════════════════════════════════════════════════
// PATCH 5: تشغيل أرشيف المهام (24 ساعة) بشكل دوري
// ══════════════════════════════════════════════════════════════
(function _startArchiveWatcher(){
  var _ai = setInterval(function(){
    if(typeof _startArchiveTimer === 'function'){
      clearInterval(_ai);
      _startArchiveTimer();
    } else if(typeof runDailyArchive === 'function'){
      clearInterval(_ai);
      runDailyArchive();
      setInterval(runDailyArchive, 30*60*1000);
    }
  }, 2000);
})();

// ══════════════════════════════════════════════════════════════
// PATCH 6: إضافة S.leads وS.contacts لـ migrateSFields
// ══════════════════════════════════════════════════════════════
(function _ensureLeadsContacts(){
  var _mi = setInterval(function(){
    if(typeof S === 'undefined' || !window._appReady) return;
    clearInterval(_mi);
    if(!S.leads) S.leads=[];
    if(!S.contacts) S.contacts=[];
  }, 1500);
})();

console.log('[Ordo Patch v2] ✅ Extended patches loaded — leads, contacts, archive, support fix');
;

/* ============================================================
   CONSOLIDATED USER APP PATCHES
   Generated to reduce runtime files while preserving load order.
   ============================================================ */


/* ===== BEGIN ORDO INTEGRATION LAYER (ordo_integration_layer.js) ===== */
// ════════════════════════════════════════════════════════════════════════════
// ORDO / STUDIO OS — INTEGRATION LAYER v1.0
// ════════════════════════════════════════════════════════════════════════════
//
// الهدف: ربط كيانات النظام داخلياً بدون كسر أي شيء قائم.
// الأسلوب: Additive wrapper layer — لا نحذف، لا نعيد كتابة، نضيف فوق.
//
// كيفية الاستخدام:
//   أضف هذا الملف في index.html بعد app.js وبعد app_patch.js مباشرة:
//   <script src="ordo_integration_layer.js"></script>
//
// ════════════════════════════════════════════════════════════════════════════

(function(window) {
  'use strict';

  // ══════════════════════════════════════════════
  // SECTION 0 — SAFE STORE ACCESS
  // ══════════════════════════════════════════════
  // دائماً نقرأ S من window بشكل آمن.
  // S هو global state object الخاص بالنظام.

  function _S() {
    try { if (typeof S !== 'undefined' && S) return S; } catch(e) {}
    return window.S || {};
  }

  function _save() {
    try { if (typeof window.lsSave === 'function') window.lsSave(); } catch(e) {}
    try { if (typeof window.cloudSave === 'function') window.cloudSave(window.S); } catch(e) {}
  }

  function _toast(msg) {
    try { if (typeof window.toast === 'function') window.toast(msg); } catch(e) {}
  }

  // ============================================================
  // ORDO CORE DATA LAYER
  // ============================================================
  var ORDO_ENTITY_ARRAYS = {
    task:'tasks', tasks:'tasks',
    archivedTask:'archivedTasks', archivedTasks:'archivedTasks',
    client:'clients', clients:'clients',
    project:'projects', projects:'projects',
    project_task:'project_tasks', project_tasks:'project_tasks',
    invoice:'invoices', invoices:'invoices',
    transaction:'transactions', transactions:'transactions',
    contract:'contracts', contracts:'contracts',
    proposal:'proposals', proposals:'proposals',
    review:'reviews', reviews:'reviews',
    schedule:'schedule', meeting:'meetings', meetings:'meetings',
    service:'services', services:'services',
    svc_order:'svc_orders', svc_orders:'svc_orders', store_order:'svc_orders',
    client_portal:'client_portals', client_portals:'client_portals',
    loan:'loans', loans:'loans',
    budget:'budgets', budgets:'budgets',
    team_task:'team_tasks', team_tasks:'team_tasks',
    lead:'leads', leads:'leads',
    statement:'statements', statements:'statements',
    timeEntry:'timeEntries', timeEntries:'timeEntries',
    wallet:'wallets', wallets:'wallets',
    wallet_transfer:'wallet_transfers', wallet_transfers:'wallet_transfers',
    temp_todo_list:'temp_todo_lists', temp_todo_lists:'temp_todo_lists'
  };

  var ORDO_CORE_ARRAYS = [
    'tasks','archivedTasks','clients','projects','project_tasks','invoices',
    'transactions','contracts','proposals','reviews','schedule','meetings',
    'services','svc_orders','client_portals','loans','budgets','team_tasks',
    'leads','statements','timeEntries','support_msgs','wallets','wallet_transfers',
    'temp_todo_lists'
  ];

  var ORDO_TABLES = {
    tasks:['tasks','task_id'],
    clients:['clients','client_id'],
    invoices:['invoices','invoice_id'],
    transactions:['transactions','transaction_id'],
    reviews:['reviews','review_id']
  };

  var ORDO_DEFAULT_CURRENCIES = [
    { code:'EGP', symbol:'ج.م', label:'جنيه مصري', enabled:true },
    { code:'USD', symbol:'$', label:'دولار أمريكي', enabled:true },
    { code:'SAR', symbol:'ر.س', label:'ريال سعودي', enabled:false },
    { code:'AED', symbol:'AED', label:'درهم إماراتي', enabled:false },
    { code:'EUR', symbol:'€', label:'يورو', enabled:false },
    { code:'KWD', symbol:'د.ك', label:'دينار كويتي', enabled:false },
    { code:'QAR', symbol:'ر.ق', label:'ريال قطري', enabled:false }
  ];

  function _currencyByAny(value){
    var s = _S();
    var list = (s.settings && s.settings.enabled_currencies) || ORDO_DEFAULT_CURRENCIES;
    var v = String(value || '').trim();
    return list.find(function(c){ return c.code === v || c.symbol === v || c.label === v; }) ||
      ORDO_DEFAULT_CURRENCIES.find(function(c){ return c.code === v || c.symbol === v || c.label === v; }) || null;
  }

  function _baseCurrencyCode(){
    var s = _S();
    var base = s.settings && (s.settings.base_currency_code || s.settings.base_currency || s.settings.currency);
    var meta = _currencyByAny(base) || _currencyByAny('EGP');
    return meta.code;
  }

  function _currencyMeta(codeOrSymbol){
    var meta = _currencyByAny(codeOrSymbol);
    if(meta) return meta;
    return _currencyByAny(_baseCurrencyCode()) || ORDO_DEFAULT_CURRENCIES[0];
  }

  function _enabledCurrencies(includeDisabledWithBalance){
    var s = _S();
    _ensureCurrencySettings(s);
    var enabled = (s.settings.enabled_currencies || []).filter(function(c){ return c.enabled !== false; });
    if(includeDisabledWithBalance){
      (s.wallets || []).forEach(function(w){
        if(enabled.some(function(c){ return c.code === w.currency_code; })) return;
        if(_safeNumber(w.balance) !== 0) enabled.push({
          code:w.currency_code,
          symbol:w.currency_symbol || w.currency_code,
          label:w.currency_label || w.currency_code,
          enabled:false
        });
      });
    }
    return enabled;
  }

  function _ensureCurrencySettings(s){
    s = s || _S();
    if(!s.settings) s.settings = {};
    var currentBase = s.settings.base_currency || s.settings.currency || 'ج.م';
    var baseMeta = _currencyByAny(currentBase) || _currencyByAny('EGP');
    s.settings.base_currency = baseMeta.symbol;
    s.settings.base_currency_code = baseMeta.code;
    if(!Array.isArray(s.settings.enabled_currencies) || !s.settings.enabled_currencies.length){
      s.settings.enabled_currencies = ORDO_DEFAULT_CURRENCIES.map(function(c){ return Object.assign({}, c); });
    } else {
      var old = s.settings.enabled_currencies;
      s.settings.enabled_currencies = ORDO_DEFAULT_CURRENCIES.map(function(def){
        var found = old.find(function(c){ return c.code === def.code || c.symbol === def.symbol; });
        return Object.assign({}, def, found || {});
      });
    }
    s.wallets = Array.isArray(s.wallets) ? s.wallets : [];
    s.wallet_transfers = Array.isArray(s.wallet_transfers) ? s.wallet_transfers : [];
    s.temp_todo_lists = Array.isArray(s.temp_todo_lists) ? s.temp_todo_lists : [];
    _enabledCurrencies(false).forEach(function(cur){
      var w = s.wallets.find(function(x){ return x.currency_code === cur.code; });
      if(!w){
        s.wallets.push({
          id:'wallet_' + cur.code,
          currency_code:cur.code,
          currency_symbol:cur.symbol,
          currency_label:cur.label,
          balance:0,
          createdAt:_nowISO(),
          updatedAt:_nowISO(),
          _dirty:true
        });
      } else {
        w.currency_symbol = w.currency_symbol || cur.symbol;
        w.currency_label = w.currency_label || cur.label;
      }
    });
  }

  function _nowISO(){ return new Date().toISOString(); }
  function _makeId(prefix){ return (prefix || 'ordo') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2,8); }
  function _arrName(type){ return ORDO_ENTITY_ARRAYS[type] || type; }
  function _asId(v){ return v === null || v === undefined ? '' : String(v); }
  function _normName(v){ return String(v || '').trim().toLowerCase().replace(/\s+/g,' '); }
  function _userId(){
    try { if (window._supaUserId) return window._supaUserId; } catch(e) {}
    try { var s = typeof window.getSession === 'function' ? window.getSession() : null; return s && s.id || ''; } catch(e2) {}
    return '';
  }
  function _safeNumber(v){ var n = Number(v || 0); return isFinite(n) ? n : 0; }

  function _ensureArray(s, name){
    if(!s[name] || !Array.isArray(s[name])) s[name] = [];
    return s[name];
  }

  function _findById(arr, id){
    var sid = _asId(id);
    return (arr || []).find(function(x){ return x && _asId(x.id) === sid; }) || null;
  }

  function _findClientByName(name){
    var s = _S();
    var n = _normName(name);
    if(!n) return null;
    return (s.clients || []).find(function(c){ return c && _normName(c.name) === n; }) || null;
  }

  function _resolveClient(entity){
    if(!entity) return null;
    var s = _S();
    var cid = entity.client_id || entity.clientId || entity.customer_id || '';
    if(cid){
      var byId = _findById(s.clients || [], cid);
      if(byId) return byId;
    }
    var cname = entity.client_name || entity.clientName || entity.client || entity.customer || entity.source || '';
    var byName = _findClientByName(cname);
    if(byName) return byName;
    var phone = String(entity.client_phone || entity.clientPhone || entity.phone || '').replace(/\D/g,'');
    if(phone){
      return (s.clients || []).find(function(c){
        return String(c.phone || '').replace(/\D/g,'') === phone;
      }) || null;
    }
    return null;
  }

  function _resolveProject(entity){
    if(!entity) return null;
    var s = _S();
    var pid = entity.project_id || entity.projectId || '';
    if(pid) return _findById(s.projects || [], pid);
    if(entity.source_type === 'project' && entity.source_id) return _findById(s.projects || [], entity.source_id);
    return null;
  }

  function _matchesClient(entity, clientId, clientName){
    if(!entity || entity.deleted_at) return false;
    var id = _asId(clientId);
    if(id && (_asId(entity.client_id) === id || _asId(entity.clientId) === id || _asId(entity.customer_id) === id)) return true;
    if(clientName){
      var n = _normName(clientName);
      return [entity.client, entity.client_name, entity.clientName, entity.customer, entity.source]
        .some(function(v){ return _normName(v) === n; });
    }
    return false;
  }

  function _clientIdsForParent(clientId){
    var s = _S();
    var ids = [_asId(clientId)];
    (s.clients || []).forEach(function(c){
      if(_asId(c.parentClientId) === _asId(clientId)) ids.push(_asId(c.id));
    });
    return ids.filter(Boolean);
  }

  function _clientNamesForIds(ids){
    var s = _S();
    return ids.map(function(id){
      var c = _findById(s.clients || [], id);
      return c && c.name || '';
    }).filter(Boolean);
  }

  function _touch(entity, type, dirty){
    if(!entity) return entity;
    var now = _nowISO();
    if(!entity.createdAt) entity.createdAt = entity.created_at || now;
    entity.updatedAt = now;
    entity.updated_at = entity.updated_at || entity.updatedAt;
    if(dirty !== false){
      entity._dirty = true;
      var s = _S();
      s._dirtyMap = s._dirtyMap || {};
      var arr = _arrName(type || entity.type || 'entity');
      s._dirtyMap[arr] = s._dirtyMap[arr] || {};
      if(entity.id !== undefined && entity.id !== null) s._dirtyMap[arr][_asId(entity.id)] = now;
    }
    return entity;
  }

  function _setClientId(entity){
    if(!entity) return false;
    var before = entity.client_id || entity.clientId || '';
    var c = _resolveClient(entity);
    if(c && !c._isPersonal){
      entity.client_id = _asId(c.id);
      if(!entity.client_name && c.name) entity.client_name = c.name;
      if(entity.clientId && entity.clientId !== entity.client_id) entity.clientId = entity.client_id;
    } else if(c && c._isPersonal) {
      entity.client_id = null;
      entity.is_internal = true;
    }
    return _asId(before) !== _asId(entity.client_id || entity.clientId || '');
  }

  function _setProjectClient(entity){
    var p = _resolveProject(entity);
    if(p && p.client_id && !entity.client_id) entity.client_id = _asId(p.client_id);
  }

  function _normalizeEntity(type, entity, options){
    if(!entity || typeof entity !== 'object') return false;
    options = options || {};
    var changed = false;
    var now = _nowISO();
    if(entity.id === undefined || entity.id === null || entity.id === ''){ entity.id = _makeId(type); changed = true; }
    if(!entity.createdAt){ entity.createdAt = entity.created_at || now; changed = true; }
    if(!entity.updatedAt){ entity.updatedAt = entity.updated_at || entity.createdAt || now; changed = true; }
    if(entity.user_id === undefined && _userId()){ entity.user_id = _userId(); changed = true; }
    var moneyTouched = (entity.value !== undefined || entity.total !== undefined || entity.amount !== undefined || entity.price !== undefined || entity.budget !== undefined);
    if(moneyTouched){
      var curMeta = _currencyMeta(entity.currency_code || entity.currency || entity.currency_symbol);
      if(!entity.currency_code){ entity.currency_code = curMeta.code; changed = true; }
      if(!entity.currency_symbol){ entity.currency_symbol = curMeta.symbol; changed = true; }
      if(!entity.currency){ entity.currency = curMeta.symbol; changed = true; }
    }

    if(type === 'clients'){
      if(!entity.status) entity.status = entity.deleted_at ? 'deleted' : 'active';
      if(entity.currency === undefined && _S().settings && _S().settings.currency) entity.currency = _S().settings.currency;
      return changed;
    }

    if(type === 'projects'){
      if(!entity.status){ entity.status = 'active'; changed = true; }
      if(!entity.invoice_ids) entity.invoice_ids = [];
      if(!entity.task_ids) entity.task_ids = [];
      if(entity.currency === undefined && entity.budgetCurrency) entity.currency = entity.budgetCurrency;
      _setClientId(entity);
    } else if(type === 'project_tasks'){
      _setProjectClient(entity);
      _setClientId(entity);
      if(!entity.status){ entity.status = entity.done ? 'done' : 'new'; changed = true; }
      if(entity.assignee_id && !entity.assigned_member_id) entity.assigned_member_id = entity.assignee_id;
      if(!entity.member_visibility) entity.member_visibility = 'team';
      if(entity.client_visibility === undefined) entity.client_visibility = !!entity.client_id;
    } else if(type === 'tasks' || type === 'archivedTasks' || type === 'team_tasks'){
      _setProjectClient(entity);
      _setClientId(entity);
      if(!entity.status){ entity.status = entity.done ? 'done' : 'new'; changed = true; }
      if(entity.workerMember && !entity.assigned_member_id) entity.assigned_member_id = entity.workerMember;
      if(entity.assigneeId && !entity.assigned_member_id) entity.assigned_member_id = entity.assigneeId;
      if(entity.client_id === undefined || entity.client_id === '') entity.client_id = null;
      if(entity.is_internal === undefined) entity.is_internal = !entity.client_id;
      if(!entity.member_visibility) entity.member_visibility = entity.team_id ? 'team' : 'owner';
      if(entity.client_visibility === undefined) entity.client_visibility = !entity.is_internal && !!entity.client_id;
      if(entity.value === undefined) entity.value = 0;
      if(!entity.source_type && entity.source_order_id){ entity.source_type = 'store_order'; entity.source_id = entity.source_order_id; }
    } else if(type === 'invoices'){
      _setProjectClient(entity);
      _setClientId(entity);
      if(!entity.status) entity.status = entity.paid ? 'paid' : 'pending';
      if(entity.total === undefined) entity.total = (entity.items || []).reduce(function(sum,it){ return sum + _safeNumber(it.qty) * _safeNumber(it.price); },0);
    } else if(type === 'transactions'){
      _setProjectClient(entity);
      _setClientId(entity);
      if(!entity.status) entity.status = 'posted';
      if(!entity.source_type && entity.invoice_id){ entity.source_type = 'invoice'; entity.source_id = entity.invoice_id; }
    } else if(type === 'contracts'){
      _setProjectClient(entity);
      _setClientId(entity);
      if(!entity.status) entity.status = entity.signedAt || entity.signed_at ? 'signed' : 'draft';
      if(entity.signed_at && !entity.signedAt) entity.signedAt = entity.signed_at;
    } else if(type === 'proposals'){
      _setProjectClient(entity);
      _setClientId(entity);
      if(!entity.status) entity.status = 'draft';
      if(!entity.client_name && entity.clientName) entity.client_name = entity.clientName;
    } else if(type === 'reviews'){
      _setProjectClient(entity);
      _setClientId(entity);
      if(entity.rating === undefined) entity.rating = _safeNumber(entity.stars);
      if(entity.stars === undefined && entity.rating !== undefined) entity.stars = entity.rating;
      if(entity.text === undefined) entity.text = entity.comment || entity.note || '';
      if(entity.public_visible === undefined) entity.public_visible = entity.public !== false;
      if(!entity.source_type && entity.task_id){ entity.source_type = 'task'; entity.source_id = entity.task_id; }
    } else if(type === 'svc_orders'){
      _setClientId(entity);
      if(!entity.status) entity.status = 'new';
      if(!entity.source_type) entity.source_type = 'store_order';
      if(!entity.source_id) entity.source_id = entity.id;
    } else {
      _setProjectClient(entity);
      _setClientId(entity);
      if(!entity.status && type !== 'services') entity.status = entity.deleted_at ? 'deleted' : 'active';
    }

    if((entity.value !== undefined || entity.total !== undefined || entity.amount !== undefined || entity.price !== undefined || entity.budget !== undefined) && !entity.currency){
      entity.currency = OrdoData.resolveCurrency(entity);
      changed = true;
    }
    if(type === 'wallets'){
      var wm = _currencyMeta(entity.currency_code || entity.currency_symbol);
      entity.currency_code = entity.currency_code || wm.code;
      entity.currency_symbol = entity.currency_symbol || wm.symbol;
      entity.currency_label = entity.currency_label || wm.label;
      entity.balance = _safeNumber(entity.balance);
    }
    if(type === 'wallet_transfers'){
      entity.from_amount = _safeNumber(entity.from_amount);
      entity.to_amount = _safeNumber(entity.to_amount);
      if(!entity.exchange_rate && entity.from_amount) entity.exchange_rate = entity.to_amount / entity.from_amount;
    }
    if(type === 'temp_todo_lists'){
      entity.items = Array.isArray(entity.items) ? entity.items : [];
      entity.archived = !!entity.archived;
      entity.items.forEach(function(item){
        item.id = item.id || _makeId('todo_item');
        item.createdAt = item.createdAt || now;
        if(item.done && !item.completedAt) item.completedAt = now;
      });
    }
    if(changed && options.mark !== false) _touch(entity, type, true);
    return changed;
  }

  function _ensureProjectBacklinks(){
    var s = _S();
    (s.projects || []).forEach(function(p){
      p.task_ids = (s.project_tasks || []).filter(function(t){ return _asId(t.project_id) === _asId(p.id); }).map(function(t){ return t.id; });
      var invoiceIds = (s.invoices || []).filter(function(i){ return _asId(i.project_id) === _asId(p.id); }).map(function(i){ return i.id; });
      p.invoice_ids = Array.from(new Set([].concat(p.invoice_ids || [], invoiceIds).map(_asId))).filter(Boolean);
    });
  }

  function _ensurePublicToken(entityType, entity, sections){
    if(!entity || !entity.id) return null;
    var s = _S();
    _ensureArray(s, 'public_tokens');
    var existingToken = entity.public_token || entity.token || entity.shareToken || '';
    var existing = (s.public_tokens || []).find(function(t){
      return (existingToken && t.token === existingToken) ||
        (t.entity_type === entityType && _asId(t.entity_id) === _asId(entity.id) && !t.revoked);
    });
    if(!existing){
      existing = {
        token: existingToken || _makeId('pub'),
        user_id: entity.user_id || _userId() || '',
        client_id: entity.client_id || null,
        project_id: entity.project_id || null,
        entity_type: entityType,
        entity_id: _asId(entity.id),
        allowed_sections: sections || ['summary'],
        expires_at: null,
        revoked: false,
        createdAt: _nowISO(),
        updatedAt: _nowISO(),
        _dirty: true
      };
      s.public_tokens.push(existing);
    }
    if(entity.client_id && !existing.client_id) existing.client_id = entity.client_id;
    if(entity.project_id && !existing.project_id) existing.project_id = entity.project_id;
    if(sections && sections.length) existing.allowed_sections = Array.from(new Set([].concat(existing.allowed_sections || [], sections)));
    entity.public_token = existing.token;
    return existing;
  }

  function _normalizeAll(options){
    options = options || {};
    var s = _S();
    ORDO_CORE_ARRAYS.forEach(function(k){ _ensureArray(s,k); });
    _ensureArray(s,'public_tokens');
    if(!s.settings) s.settings = {};
    if(!s.settings.workspace_mode) s.settings.workspace_mode = s.settings.workspaceMode || 'freelancer';
    _ensureCurrencySettings(s);

    var changed = false;
    (s.clients || []).forEach(function(e){ changed = _normalizeEntity('clients', e, options) || changed; });
    ORDO_CORE_ARRAYS.forEach(function(arr){
      if(arr === 'clients') return;
      (s[arr] || []).forEach(function(e){ changed = _normalizeEntity(arr, e, options) || changed; });
    });
    (s.proposals || []).forEach(function(p){ _ensurePublicToken('proposal', p, ['proposal','summary','reviews']); });
    (s.contracts || []).forEach(function(c){ _ensurePublicToken('contract', c, ['contract','summary']); });
    (s.client_portals || []).forEach(function(p){ _ensurePublicToken('client_portal', p, ['profile','projects','tasks','invoices','contracts','proposals','reviews']); });
    _ensureProjectBacklinks();
    return changed;
  }

  var OrdoData = {
    getState:function(){ return _S(); },
    arrayName:_arrName,
    ensureArray:function(type){ return _ensureArray(_S(), _arrName(type)); },
    normalizeAll:function(options){ return _normalizeAll(options); },
    normalizeEntity:_normalizeEntity,
    save:function(options){
      options = options || {};
      _normalizeAll({mark:false});
      try { if(typeof window.lsSave === 'function') window.lsSave(); } catch(e) {}
      try {
        if(options.now && typeof window.cloudSaveNow === 'function') return window.cloudSaveNow(_S());
        if(typeof window.cloudSave === 'function') window.cloudSave(_S());
      } catch(e2) {}
      return true;
    },
    markDirty:function(type, id){
      var arr = _ensureArray(_S(), _arrName(type));
      var ent = _findById(arr, id);
      if(ent) _touch(ent, _arrName(type), true);
      return ent;
    },
    saveDirty:async function(){
      var s = _S();
      _normalizeAll({mark:false});
      var dirty = [];
      ORDO_CORE_ARRAYS.forEach(function(arr){
        (s[arr] || []).forEach(function(item){
          if(item && (item._dirty || (s._dirtyMap && s._dirtyMap[arr] && s._dirtyMap[arr][_asId(item.id)]))) dirty.push([arr,item]);
        });
      });
      for(var i=0;i<dirty.length;i++){
        var arrName = dirty[i][0], item = dirty[i][1];
        if(ORDO_TABLES[arrName] && typeof window._saveEntity === 'function'){
          try { await window._saveEntity(ORDO_TABLES[arrName][0], ORDO_TABLES[arrName][1], item); } catch(e) {}
        }
        delete item._dirty;
      }
      s._dirtyMap = {};
      return OrdoData.save({now:true});
    },
    createEntity:function(type, data){
      var arrName = _arrName(type);
      var arr = _ensureArray(_S(), arrName);
      var ent = Object.assign({}, data || {});
      if(!ent.id) ent.id = _makeId(arrName);
      ent.createdAt = ent.createdAt || _nowISO();
      ent.updatedAt = ent.updatedAt || ent.createdAt;
      if(_userId() && !ent.user_id) ent.user_id = _userId();
      _normalizeEntity(arrName, ent);
      ent._dirty = true;
      arr.push(ent);
      return ent;
    },
    updateEntity:function(type, id, patch){
      var arrName = _arrName(type);
      var ent = _findById(_ensureArray(_S(), arrName), id);
      if(!ent) return null;
      Object.assign(ent, patch || {});
      _normalizeEntity(arrName, ent);
      _touch(ent, arrName, true);
      return ent;
    },
    deleteEntity:function(type, id, options){
      options = options || {};
      var arrName = _arrName(type);
      var s = _S(), arr = _ensureArray(s, arrName);
      var idx = arr.findIndex(function(x){ return x && _asId(x.id) === _asId(id); });
      if(idx < 0) return false;
      if(options.hard){
        var removed = arr.splice(idx,1)[0];
        s.deleted_records = s.deleted_records || {};
        s.deleted_records[arrName] = s.deleted_records[arrName] || [];
        removed.deleted_at = _nowISO();
        s.deleted_records[arrName].push(removed);
      } else {
        arr[idx].deleted_at = _nowISO();
        arr[idx].status = arr[idx].status || 'deleted';
        _touch(arr[idx], arrName, true);
      }
      return true;
    },
    linkEntities:function(sourceType, sourceId, targetType, targetId){
      var source = _findById(_ensureArray(_S(), _arrName(sourceType)), sourceId);
      var target = _findById(_ensureArray(_S(), _arrName(targetType)), targetId);
      if(!source || !target) return false;
      var targetKey = targetType.replace(/s$/,'') + '_id';
      source[targetKey] = _asId(target.id);
      if(targetType === 'client' || targetType === 'clients') source.client_id = _asId(target.id);
      if(targetType === 'project' || targetType === 'projects') source.project_id = _asId(target.id);
      if(sourceType === 'project' || sourceType === 'projects'){
        if(targetType === 'invoice' || targetType === 'invoices'){
          source.invoice_ids = source.invoice_ids || [];
          if(source.invoice_ids.map(_asId).indexOf(_asId(target.id)) < 0) source.invoice_ids.push(target.id);
        }
        if(targetType === 'task' || targetType === 'tasks' || targetType === 'project_task'){
          source.task_ids = source.task_ids || [];
          if(source.task_ids.map(_asId).indexOf(_asId(target.id)) < 0) source.task_ids.push(target.id);
        }
      }
      _touch(source, _arrName(sourceType), true);
      _touch(target, _arrName(targetType), true);
      return true;
    },
    resolveClient:_resolveClient,
    resolveProject:_resolveProject,
    resolveCurrency:function(entity){
      var s = _S();
      if(entity){
        if(entity.currency) return entity.currency;
        var p = _resolveProject(entity);
        if(p && (p.currency || p.budgetCurrency)) return p.currency || p.budgetCurrency;
        var c = _resolveClient(entity);
        if(c && c.currency) return c.currency;
      }
      return (s.settings && s.settings.currency) || 'ج.م';
    },
    formatMoney:function(amount, currency){
      var cur = currency || OrdoData.resolveCurrency();
      return Number(amount || 0).toLocaleString('ar-EG') + ' ' + cur;
    },
    getCurrencyMeta:_currencyMeta,
    getEnabledCurrencies:function(includeDisabledWithBalance){ return _enabledCurrencies(includeDisabledWithBalance); },
    resolveCurrency:function(entity){
      if(entity){
        if(entity.currency_code) return _currencyMeta(entity.currency_code).code;
        if(entity.currency) return _currencyMeta(entity.currency).code;
        if(entity.currency_symbol) return _currencyMeta(entity.currency_symbol).code;
        var p = _resolveProject(entity);
        if(p && (p.currency_code || p.currency || p.budgetCurrency)) return _currencyMeta(p.currency_code || p.currency || p.budgetCurrency).code;
        var c = _resolveClient(entity);
        if(c && c.currency) return _currencyMeta(c.currency).code;
      }
      return _baseCurrencyCode();
    },
    formatMoney:function(amount, currency){
      var meta = _currencyMeta(currency || OrdoData.resolveCurrency());
      return Number(amount || 0).toLocaleString('ar-EG') + ' ' + meta.symbol;
    },
    getClientTasks:function(clientId){
      var s = _S(), ids = _clientIdsForParent(clientId), names = _clientNamesForIds(ids);
      function match(e){ return ids.some(function(id){ return _matchesClient(e,id); }) || names.some(function(n){ return _matchesClient(e,'',n); }); }
      return [].concat(s.tasks || [], s.project_tasks || [], s.team_tasks || []).filter(match);
    },
    getClientLinkedRecords:function(clientId){
      var s = _S();
      var c = _findById(s.clients || [], clientId);
      var ids = _clientIdsForParent(clientId), names = _clientNamesForIds(ids);
      function match(e){ return ids.some(function(id){ return _matchesClient(e,id); }) || names.some(function(n){ return _matchesClient(e,'',n); }); }
      var out = {};
      ['tasks','archivedTasks','project_tasks','projects','invoices','transactions','reviews','contracts','proposals','schedule','meetings','leads','client_portals','svc_orders','statements','timeEntries','loans','budgets','team_tasks'].forEach(function(arr){
        if(arr === 'projects') out[arr] = (s.projects || []).filter(match);
        else out[arr] = (s[arr] || []).filter(match);
      });
      out.client = c;
      out.totalRecords = Object.keys(out).reduce(function(sum,k){ return sum + (Array.isArray(out[k]) ? out[k].length : 0); },0);
      out.leadsCount = out.leads.length;
      out.portalsCount = out.client_portals.length;
      return out;
    },
    deleteClientCascade:function(clientId, options){
      options = options || {};
      var s = _S(), rel = OrdoData.getClientLinkedRecords(clientId), deletedAt = _nowISO();
      s.deleted_records = s.deleted_records || {};
      function archive(arrName, item){
        s.deleted_records[arrName] = s.deleted_records[arrName] || [];
        s.deleted_records[arrName].push(Object.assign({}, item, {deleted_at:deletedAt, deleted_reason:'client_deleted', deleted_client_id:_asId(clientId)}));
      }
      Object.keys(rel).forEach(function(arrName){
        if(arrName === 'client' || arrName === 'totalRecords' || arrName === 'leadsCount' || arrName === 'portalsCount') return;
        var ids = (rel[arrName] || []).map(function(x){ return _asId(x.id); });
        if(!ids.length || !Array.isArray(s[arrName])) return;
        s[arrName] = s[arrName].filter(function(item){
          if(ids.indexOf(_asId(item.id)) >= 0){ archive(arrName,item); return false; }
          return true;
        });
      });
      var idx = (s.clients || []).findIndex(function(c){ return _asId(c.id) === _asId(clientId); });
      if(idx >= 0){
        var cl = s.clients.splice(idx,1)[0];
        archive('clients', cl);
      }
      (s.public_tokens || []).forEach(function(t){
        if(t && _asId(t.client_id) === _asId(clientId)){
          t.revoked = true;
          t.revoked_at = deletedAt;
          t.updatedAt = deletedAt;
          t._dirty = true;
        }
      });
      s._dirtyMap = s._dirtyMap || {};
      s._dirtyMap._cascadeDelete = s._dirtyMap._cascadeDelete || {};
      s._dirtyMap._cascadeDelete[_asId(clientId)] = deletedAt;
      return rel;
    },
    createPublicToken:function(entityType, entityId, options){
      options = options || {};
      var ent = _findById(_ensureArray(_S(), _arrName(entityType)), entityId);
      if(!ent && options.entity) ent = options.entity;
      if(!ent){
        ent = {
          id: entityId || (entityType + '_public'),
          user_id: _userId() || '',
          client_id: options.client_id || null,
          project_id: options.project_id || null
        };
      }
      return _ensurePublicToken(entityType, ent, options.allowed_sections);
    },
    validatePublicToken:function(token, entityType, entityId){
      var s = _S();
      var t = (s.public_tokens || []).find(function(x){ return x && x.token === token; });
      if(!t || t.revoked) return null;
      if(t.expires_at && new Date(t.expires_at) < new Date()) return null;
      if(entityType && t.entity_type !== entityType) return null;
      if(entityId && _asId(t.entity_id) !== _asId(entityId)) return null;
      return t;
    },
    acceptProposal:function(proposalId, options){
      options = options || {};
      var s = _S();
      var p = (s.proposals || []).find(function(x){ return _asId(x.id) === _asId(proposalId) || _asId(x.token) === _asId(proposalId) || _asId(x.public_token) === _asId(proposalId); });
      if(!p) return null;
      _normalizeEntity('proposals', p);
      p.status = 'accepted';
      p.acceptedAt = p.acceptedAt || _nowISO();
      var project = p.project_id ? _findById(s.projects || [], p.project_id) : null;
      if(!project){
        project = OrdoData.createEntity('projects', {
          name: options.name || p.project_name || p.title || 'Project',
          client_id: p.client_id || null,
          proposal_id: p.id,
          status:'active',
          budget: _safeNumber(p.total || p.amount || p.value),
          currency: OrdoData.resolveCurrency(p),
          source_type:'proposal',
          source_id:p.id
        });
        p.project_id = project.id;
      }
      if(options.createInvoice !== false && _safeNumber(p.total || p.amount || p.value) > 0 && !p.invoice_id){
        var inv = OrdoData.createEntity('invoices', {
          client_id:p.client_id || null,
          project_id:project.id,
          total:_safeNumber(p.total || p.amount || p.value),
          currency:OrdoData.resolveCurrency(p),
          status:'pending',
          source_type:'proposal',
          source_id:p.id,
          items:[{desc:p.title || 'Proposal', qty:1, price:_safeNumber(p.total || p.amount || p.value)}]
        });
        p.invoice_id = inv.id;
        project.invoice_ids = project.invoice_ids || [];
        project.invoice_ids.push(inv.id);
      }
      if(options.createContract && !p.contract_id){
        var ct = OrdoData.createEntity('contracts', {
          title:p.title || 'Contract',
          client_id:p.client_id || null,
          project_id:project.id,
          proposal_id:p.id,
          value:_safeNumber(p.total || p.amount || p.value),
          currency:OrdoData.resolveCurrency(p),
          status:'draft',
          source_type:'proposal',
          source_id:p.id
        });
        p.contract_id = ct.id;
      }
      _touch(p,'proposals',true);
      _touch(project,'projects',true);
      return project;
    },
    signContract:function(contractId, patch){
      var ct = _findById(_ensureArray(_S(),'contracts'), contractId) ||
        (_S().contracts || []).find(function(x){ return _asId(x.token) === _asId(contractId) || _asId(x.public_token) === _asId(contractId); });
      if(!ct) return null;
      Object.assign(ct, patch || {});
      ct.status = 'signed';
      ct.signedAt = ct.signedAt || ct.signed_at || _nowISO();
      ct.signed_at = ct.signed_at || ct.signedAt;
      _touch(ct,'contracts',true);
      var p = _resolveProject(ct);
      if(p){ p.contract_id = p.contract_id || ct.id; _touch(p,'projects',true); }
      return ct;
    },
    payInvoice:function(invoiceId, amount, options){
      options = options || {};
      var inv = _findById(_ensureArray(_S(),'invoices'), invoiceId);
      if(!inv) return null;
      var paid = _safeNumber(amount || inv.total || 0);
      inv.paid_amount = _safeNumber(inv.paid_amount) + paid;
      inv.status = inv.paid_amount >= _safeNumber(inv.total) ? 'paid' : 'partial';
      inv.paid = inv.status === 'paid';
      inv.collectedAt = options.date || new Date().toISOString().slice(0,10);
      _touch(inv,'invoices',true);
      var tr = OrdoData.createEntity('transactions', {
        type:'income',
        amount:paid,
        currency:OrdoData.resolveCurrency(inv),
        source_type:'invoice',
        source_id:inv.id,
        invoice_id:inv.id,
        client_id:inv.client_id || null,
        project_id:inv.project_id || null,
        source:inv.client || inv.client_name || '',
        date:inv.collectedAt,
        isoDate:inv.collectedAt,
        desc:options.desc || ('Invoice #' + (inv.num || inv.id))
      });
      var p = _resolveProject(inv);
      if(p){
        p.finance_summary = p.finance_summary || {};
        p.finance_summary.paid = _safeNumber(p.finance_summary.paid) + paid;
        _touch(p,'projects',true);
      }
      return tr;
    },
    syncTeamTask:function(team, task){
      if(!team || !task) return null;
      var s = _S();
      var arr = _ensureArray(s,'team_tasks');
      var id = task.ordo_task_id || task.id;
      var existing = arr.find(function(t){ return _asId(t.team_task_source_id || t.id) === _asId(id) || _asId(t.id) === _asId(id); });
      var c = _resolveClient(task);
      var data = {
        id: existing && existing.id || task.ordo_task_id || task.id || _makeId('team_task'),
        team_task_source_id: task.id,
        title: task.title,
        desc: task.desc || task.notes || '',
        status: task.status || 'new',
        priority: task.priority || 'med',
        deadline: task.deadline || '',
        team_id: team.id,
        assigned_member_id: task.assigneeId || task.assigned_member_id || null,
        department_id: task.department_id || null,
        member_visibility: task.member_visibility || 'team',
        client_visibility: task.client_visibility === true,
        client_id: c ? _asId(c.id) : (task.client_id || null),
        client: task.client || (c && c.name) || '',
        is_internal: !(c || task.client_id),
        source_type:'team_task',
        source_id:task.id,
        updatedAt: task.updatedAt || _nowISO(),
        createdAt: task.createdAt || _nowISO()
      };
      if(existing) Object.assign(existing, data);
      else arr.push(data);
      _normalizeEntity('team_tasks', existing || data);
      return existing || data;
    }
  };

  var OrdoAccess = {
    getWorkspaceMode:function(){
      var s = _S();
      var f = {};
      try { f = typeof window._getPlanFeatures === 'function' ? window._getPlanFeatures() : {}; } catch(e) {}
      var m = (s.settings && (s.settings.workspace_mode || s.settings.workspaceMode)) || f.workspace_mode || f.workspaceMode || '';
      if(['freelancer','company','both'].indexOf(m) >= 0) return m;
      if(f.corp_mode || f.corporate || f.team) return 'company';
      return 'freelancer';
    },
    hasFeature:function(key){
      var s = _S();
      var f = {};
      try { f = typeof window._getPlanFeatures === 'function' ? window._getPlanFeatures() : {}; } catch(e) {}
      f = Object.assign({}, s.features || {}, s.settings && s.settings.features || {}, f || {});
      if(f[key] === false) return false;
      if(f[key] === true) return true;
      var aliases = {client_portal:'client_portal', portal:'client_portal', invoices:'invoices', finance:'finance', team:'team', reports:'reports', contracts:'contracts', proposals:'proposals'};
      if(aliases[key] && f[aliases[key]] === false) return false;
      return true;
    },
    can:function(permission, context){
      context = context || {};
      var mode = OrdoAccess.getWorkspaceMode();
      var parts = String(permission || '').split('.');
      var area = parts[0];
      if(!OrdoAccess.hasFeature(area)) return false;
      if(area === 'team' && mode === 'freelancer') return OrdoAccess.hasFeature('team');
      if(context.entity && context.entity.is_internal && permission === 'client_portal.view') return false;
      if(context.entity && context.entity.client_visibility === false && permission.indexOf('client_portal') === 0) return false;
      var member = context.member || _S().current_member || null;
      if(member && member.role && member.role !== 'admin' && (permission.indexOf('.delete') > -1 || permission === 'team.manage')) return false;
      return true;
    }
  };

  var OrdoReports = {
    getClientSummary:function(clientId){
      var s = _S();
      var rel = OrdoData.getClientLinkedRecords(clientId);
      var tasks = OrdoData.getClientTasks(clientId);
      var invoices = rel.invoices || [];
      var reviews = rel.reviews || [];
      var paid = invoices.filter(function(i){ return i.status === 'paid' || i.paid; }).reduce(function(a,i){ return a + _safeNumber(i.total); },0);
      var pending = invoices.filter(function(i){ return i.status !== 'paid' && !i.paid; }).reduce(function(a,i){ return a + _safeNumber(i.total); },0);
      var avg = reviews.length ? reviews.reduce(function(a,r){ return a + _safeNumber(r.rating || r.stars); },0) / reviews.length : 0;
      return Object.assign(rel, {tasks:tasks, invoices:invoices, paid:paid, pending:pending, reviews:reviews, averageRating:avg});
    },
    getProjectSummary:function(projectId){
      var s = _S();
      var p = _findById(s.projects || [], projectId);
      var tasks = [].concat(s.project_tasks || [], s.tasks || [], s.team_tasks || []).filter(function(t){ return _asId(t.project_id) === _asId(projectId); });
      var seenTaskIds = {};
      tasks = tasks.filter(function(t){ var id = _asId(t.id); if(seenTaskIds[id]) return false; seenTaskIds[id] = true; return true; });
      var invoices = (s.invoices || []).filter(function(i){ return _asId(i.project_id) === _asId(projectId) || (p && (p.invoice_ids || []).map(_asId).indexOf(_asId(i.id)) >= 0); });
      var transactions = (s.transactions || []).filter(function(t){ return _asId(t.project_id) === _asId(projectId); });
      var done = tasks.filter(function(t){ return t.done || t.status === 'done'; }).length;
      var total = tasks.length;
      return {project:p, tasks:tasks, invoices:invoices, transactions:transactions, progress:total ? Math.round(done/total*100) : 0};
    },
    getFinanceSummary:function(){
      var s = _S();
      var invoices = s.invoices || [], transactions = s.transactions || [];
      var income = transactions.filter(function(t){ return t.type === 'income'; }).reduce(function(a,t){ return a + _safeNumber(t.amount); },0);
      var expense = transactions.filter(function(t){ return t.type === 'expense'; }).reduce(function(a,t){ return a + _safeNumber(t.amount); },0);
      var invoiced = invoices.reduce(function(a,i){ return a + _safeNumber(i.total); },0);
      var paid = invoices.filter(function(i){ return i.status === 'paid' || i.paid; }).reduce(function(a,i){ return a + _safeNumber(i.total); },0);
      return {income:income, expense:expense, profit:income-expense, invoiced:invoiced, paid:paid, pending:Math.max(0,invoiced-paid), loans:s.loans || [], budgets:s.budgets || []};
    },
    getTeamSummary:function(teamId){
      var s = _S();
      var tasks = (s.team_tasks || []).filter(function(t){ return !teamId || _asId(t.team_id) === _asId(teamId); });
      return {tasks:tasks, total:tasks.length, done:tasks.filter(function(t){ return t.status === 'done' || t.done; }).length};
    },
    getDashboardSummary:function(){
      var s = _S();
      var tasks = [].concat(s.tasks || [], s.project_tasks || [], s.team_tasks || []);
      var fin = OrdoReports.getFinanceSummary();
      return {tasks:tasks, activeTasks:tasks.filter(function(t){ return !t.done && t.status !== 'done'; }), clients:s.clients || [], projects:s.projects || [], finance:fin, orders:s.svc_orders || [], reviews:s.reviews || []};
    }
  };

  var OrdoFinance = {
    currencies:function(includeDisabledWithBalance){ return _enabledCurrencies(includeDisabledWithBalance); },
    groupTotalsByCurrency:function(transactions){
      var totals = {};
      (transactions || []).forEach(function(tx){
        var code = OrdoData.resolveCurrency(tx);
        if(!totals[code]){
          var m = _currencyMeta(code);
          totals[code] = {currency_code:m.code, currency_symbol:m.symbol, currency_label:m.label, income:0, expense:0, balance:0};
        }
        var amount = _safeNumber(tx.amount);
        if(tx.type === 'expense') totals[code].expense += amount;
        else if(tx.type === 'income') totals[code].income += amount;
        totals[code].balance = totals[code].income - totals[code].expense;
      });
      return totals;
    },
    recalculateWallets:function(){
      var s = _S();
      _ensureCurrencySettings(s);
      var totals = OrdoFinance.groupTotalsByCurrency((s.transactions || []).filter(function(tx){
        return tx.source_type !== 'wallet_transfer';
      }));
      (s.wallet_transfers || []).forEach(function(tr){
        var from = _currencyMeta(tr.from_currency), to = _currencyMeta(tr.to_currency);
        totals[from.code] = totals[from.code] || {currency_code:from.code, currency_symbol:from.symbol, currency_label:from.label, income:0, expense:0, balance:0};
        totals[to.code] = totals[to.code] || {currency_code:to.code, currency_symbol:to.symbol, currency_label:to.label, income:0, expense:0, balance:0};
        totals[from.code].expense += _safeNumber(tr.from_amount);
        totals[from.code].balance -= _safeNumber(tr.from_amount);
        totals[to.code].income += _safeNumber(tr.to_amount);
        totals[to.code].balance += _safeNumber(tr.to_amount);
      });
      Object.keys(totals).forEach(function(code){
        var m = _currencyMeta(code);
        var w = (s.wallets || []).find(function(x){ return x.currency_code === code; });
        if(!w){
          w = {id:'wallet_'+code,currency_code:code,currency_symbol:m.symbol,currency_label:m.label,balance:0,createdAt:_nowISO()};
          s.wallets.push(w);
        }
        w.currency_symbol = m.symbol;
        w.currency_label = m.label;
        w.balance = totals[code].balance;
        w.updatedAt = _nowISO();
      });
      return s.wallets;
    },
    getWallets:function(){
      OrdoFinance.recalculateWallets();
      return (_S().wallets || []).filter(function(w){
        var meta = _currencyMeta(w.currency_code);
        return meta.enabled !== false || _safeNumber(w.balance) !== 0 || _enabledCurrencies(false).some(function(c){ return c.code === w.currency_code; });
      });
    },
    getWalletBalance:function(currencyCode){
      OrdoFinance.recalculateWallets();
      var code = _currencyMeta(currencyCode).code;
      var w = (_S().wallets || []).find(function(x){ return x.currency_code === code; });
      return w ? _safeNumber(w.balance) : 0;
    },
    getWalletSummary:function(currencyCode){
      var code = _currencyMeta(currencyCode).code;
      var txs = (_S().transactions || []).filter(function(tx){ return OrdoData.resolveCurrency(tx) === code; });
      var grouped = OrdoFinance.groupTotalsByCurrency(txs)[code] || {income:0,expense:0,balance:0};
      var last = txs.slice().sort(function(a,b){ return String(b.updatedAt || b.createdAt || b.isoDate || b.date || '').localeCompare(String(a.updatedAt || a.createdAt || a.isoDate || a.date || '')); })[0] || null;
      return Object.assign({last:last}, grouped, {balance:OrdoFinance.getWalletBalance(code)});
    },
    addWalletTransfer:function(data){
      var s = _S();
      _ensureCurrencySettings(s);
      var from = _currencyMeta(data.from_currency);
      var to = _currencyMeta(data.to_currency);
      var out = _safeNumber(data.from_amount);
      var inc = _safeNumber(data.to_amount);
      var tr = OrdoData.createEntity('wallet_transfers', {
        from_currency:from.code,
        to_currency:to.code,
        from_amount:out,
        to_amount:inc,
        exchange_rate:_safeNumber(data.exchange_rate) || (out ? inc / out : 0),
        note:data.note || '',
        createdAt:_nowISO(),
        updatedAt:_nowISO()
      });
      OrdoData.createEntity('transactions', {type:'expense', amount:out, currency_code:from.code, currency_symbol:from.symbol, source_type:'wallet_transfer', source_id:tr.id, desc:'تحويل بين المحافظ: '+(data.note||'')});
      OrdoData.createEntity('transactions', {type:'income', amount:inc, currency_code:to.code, currency_symbol:to.symbol, source_type:'wallet_transfer', source_id:tr.id, desc:'تحويل بين المحافظ: '+(data.note||'')});
      OrdoFinance.recalculateWallets();
      OrdoData.saveDirty();
      return tr;
    }
  };

  var OrdoPlugins = {
    _items:{},
    register:function(name, initFunction){
      if(!name || this._items[name]) return this._items[name];
      var rec = {name:name, init:initFunction, initialized:false};
      this._items[name] = rec;
      try {
        if(typeof initFunction === 'function'){
          initFunction({OrdoData:OrdoData, OrdoAccess:OrdoAccess, OrdoReports:OrdoReports, OrdoFinance:OrdoFinance, OrdoPlugins:OrdoPlugins});
          rec.initialized = true;
        }
      } catch(e) { rec.error = e; console.warn('[OrdoPlugins]', name, e.message || e); }
      return rec;
    },
    list:function(){ return Object.keys(this._items); }
  };

  window.OrdoData = window.OrdoCore = OrdoData;
  window.OrdoAccess = OrdoAccess;
  window.OrdoReports = OrdoReports;
  window.OrdoFinance = OrdoFinance;
  window.OrdoPlugins = OrdoPlugins;
  window.OrdoBoot = {
    steps:['load session','load state','migrate old data','normalize relations','register plugins','apply plan features','apply permissions','render current page','save dirty migration'],
    run:function(){
      var changed = false;
      try { if(typeof window.migrateSFields === 'function') window.migrateSFields(); } catch(e) {}
      try { changed = OrdoData.normalizeAll({mark:false}) || changed; } catch(e2) {}
      try { document.documentElement.setAttribute('data-workspace-mode', OrdoAccess.getWorkspaceMode()); } catch(e3) {}
      try { if(typeof window.renderAll === 'function') window.renderAll(); } catch(e4) {}
      if(changed) try { OrdoData.save({now:true}); } catch(e5) {}
      return changed;
    }
  };
  OrdoPlugins.register('integration', function(){});

  // ══════════════════════════════════════════════
  // SECTION 1 — WORKSPACE MODE
  // ══════════════════════════════════════════════
  // يحدد هل النظام في وضع فريلانسر أو شركة.
  // يعتمد على إعدادات الباقة + إعدادات المستخدم.

  /**
   * detectWorkspaceMode()
   * يُرجع 'company' أو 'freelancer' بناءً على الباقة والإعدادات.
   */
  window.detectWorkspaceMode = function() {
    try {
      if(window.OrdoAccess && typeof window.OrdoAccess.getWorkspaceMode === 'function') return window.OrdoAccess.getWorkspaceMode();
      var f = typeof window._getPlanFeatures === 'function' ? window._getPlanFeatures() : {};
      // وضع الشركة: لو corp_mode مفعّل في الباقة أو في settings
      if (f.corp_mode || f.corporate) return 'company';
      // أو لو المستخدم اختار يدوياً في settings
      var s = _S().settings || {};
      if (s.workspace_mode === 'company' || s.workspace_mode === 'both') return s.workspace_mode;
      return 'freelancer';
    } catch(e) { return 'freelancer'; }
  };

  window.isCompanyMode = function() {
    return window.detectWorkspaceMode() === 'company';
  };

  window.isFreelancerMode = function() {
    return window.detectWorkspaceMode() === 'freelancer';
  };

  // ══════════════════════════════════════════════
  // SECTION 2 — CLIENT RELATIONS
  // ══════════════════════════════════════════════

  /**
   * getClientProjects(clientId)
   * كل مشاريع عميل معيّن.
   */
  window.getClientProjects = function(clientId) {
    if (!clientId) return [];
    var id = String(clientId);
    return (_S().projects || []).filter(function(p) {
      return String(p.client_id || '') === id;
    });
  };

  /**
   * getClientInvoices(clientId)
   * كل فواتير عميل — يدعم clientId أو client name (backward compat).
   */
  window.getClientInvoices = function(clientId) {
    if (!clientId) return [];
    var id = String(clientId);
    var c  = (_S().clients || []).find(function(x) { return String(x.id) === id; });
    var cName = c ? c.name : '';
    return (_S().invoices || []).filter(function(inv) {
      return String(inv.clientId || inv.client_id || '') === id
          || (cName && (inv.client === cName));
    });
  };

  /**
   * getClientContracts(clientId)
   * كل عقود عميل — يدعم client_id أو client_name (backward compat).
   */
  window.getClientContracts = function(clientId) {
    if (!clientId) return [];
    var id    = String(clientId);
    var c     = (_S().clients || []).find(function(x) { return String(x.id) === id; });
    var cName = c ? c.name : '';
    return (_S().contracts || []).filter(function(ct) {
      return String(ct.client_id || '') === id
          || (cName && (ct.client_name === cName));
    });
  };

  /**
   * getClientProposals(clientId)
   * كل العروض المرتبطة بعميل.
   */
  window.getClientProposals = function(clientId) {
    if (!clientId) return [];
    var id    = String(clientId);
    var c     = (_S().clients || []).find(function(x) { return String(x.id) === id; });
    var cName = c ? c.name : '';
    return (_S().proposals || []).filter(function(p) {
      return String(p.client_id || '') === id
          || (cName && (p.clientName === cName || p.client_name === cName));
    });
  };

  /**
   * getClientReviews(clientId)
   * كل تقييمات عميل.
   */
  window.getClientReviews = function(clientId) {
    if (!clientId) return [];
    var id    = String(clientId);
    var c     = (_S().clients || []).find(function(x) { return String(x.id) === id; });
    var cName = c ? c.name : '';
    return (_S().reviews || []).filter(function(r) {
      return String(r.client_id || '') === id
          || (cName && (r.client_name === cName));
    });
  };

  /**
   * getClientTasks(clientId)
   * كل مهام عميل من regular tasks + project tasks.
   */
  window.getClientTasks = function(clientId) {
    if (!clientId) return [];
    var id    = String(clientId);
    var c     = (_S().clients || []).find(function(x) { return String(x.id) === id; });
    var cName = c ? c.name : '';

    var regularTasks = (_S().tasks || []).filter(function(t) {
      return (t.clientId && String(t.clientId) === id)
          || (t.client_id && String(t.client_id) === id)
          || (cName && t.client === cName);
    });

    // project tasks المرتبطة بمشاريع العميل
    var clientProjIds = window.getClientProjects(clientId).map(function(p) { return String(p.id); });
    var projTasks = (_S().project_tasks || []).filter(function(t) {
      return clientProjIds.includes(String(t.project_id || ''));
    });

    return regularTasks.concat(projTasks);
  };

  /**
   * getClientTimeline(clientId)
   * timeline كاملة للعميل مرتبة زمنياً.
   * كل كيان يُرجَع كـ { type, date, title, status, id, ref }
   */
  window.getClientTimeline = function(clientId) {
    if (!clientId) return [];
    var events = [];

    // proposals
    window.getClientProposals(clientId).forEach(function(p) {
      events.push({
        type    : 'proposal',
        date    : p.date || p.created_at || '',
        title   : p.title || 'عرض سعر',
        status  : p.status || 'draft',
        id      : p.token || p.id,
        ref     : p
      });
    });

    // contracts
    window.getClientContracts(clientId).forEach(function(ct) {
      events.push({
        type    : 'contract',
        date    : ct.created_at || ct.start_date || '',
        title   : ct.title || 'عقد',
        status  : ct.status || 'draft',
        id      : ct.id,
        ref     : ct
      });
    });

    // projects
    window.getClientProjects(clientId).forEach(function(p) {
      events.push({
        type    : 'project',
        date    : p.createdAt || p.start || '',
        title   : p.name || 'مشروع',
        status  : p.status || 'active',
        id      : p.id,
        ref     : p
      });
    });

    // invoices
    window.getClientInvoices(clientId).forEach(function(inv) {
      events.push({
        type    : 'invoice',
        date    : inv.date || inv.created_at || '',
        title   : inv.title || 'فاتورة #' + (inv.number || inv.id),
        status  : inv.status || (inv.paid ? 'paid' : 'unpaid'),
        id      : inv.id,
        ref     : inv
      });
    });

    // reviews
    window.getClientReviews(clientId).forEach(function(r) {
      events.push({
        type    : 'review',
        date    : r.created_at || '',
        title   : '⭐ ' + (r.stars || 0) + ' — ' + (r.task_title || 'تقييم'),
        status  : 'done',
        id      : r.id,
        ref     : r
      });
    });

    // ترتيب من الأحدث للأقدم
    events.sort(function(a, b) {
      var da = a.date ? new Date(a.date).getTime() : 0;
      var db = b.date ? new Date(b.date).getTime() : 0;
      return db - da;
    });

    return events;
  };

  // ══════════════════════════════════════════════
  // SECTION 3 — PROJECT RELATIONS
  // ══════════════════════════════════════════════

  /**
   * getProjectTasks(projId)
   * مهام المشروع (project_tasks).
   */
  window.getProjectTasks = function(projId) {
    if (!projId) return [];
    var id = String(projId);
    return (_S().project_tasks || []).filter(function(t) {
      return String(t.project_id || '') === id;
    });
  };

  /**
   * getProjectInvoices(projId)
   * فواتير مرتبطة بمشروع.
   */
  window.getProjectInvoices = function(projId) {
    if (!projId) return [];
    var id = String(projId);
    return (_S().invoices || []).filter(function(inv) {
      return String(inv.project_id || inv.projectId || '') === id;
    });
  };

  /**
   * getProjectContract(projId)
   * العقد المرتبط بمشروع (واحد فقط).
   */
  window.getProjectContract = function(projId) {
    if (!projId) return null;
    var id = String(projId);
    return (_S().contracts || []).find(function(ct) {
      return String(ct.project_id || '') === id;
    }) || null;
  };

  /**
   * getProjectProposal(projId)
   * العرض الأصلي الذي حوّل لمشروع.
   */
  window.getProjectProposal = function(projId) {
    if (!projId) return null;
    var id = String(projId);
    return (_S().proposals || []).find(function(p) {
      return String(p.project_id || '') === id;
    }) || null;
  };

  /**
   * getProjectFinancialSummary(projId)
   * ملخص مالي كامل للمشروع.
   */
  window.getProjectFinancialSummary = function(projId) {
    if (!projId) return {};
    var proj    = (_S().projects || []).find(function(p) { return String(p.id) === String(projId); });
    var budget  = proj ? (+proj.budget || 0) : 0;
    var invoices = window.getProjectInvoices(projId);

    var totalInvoiced = invoices.reduce(function(s, inv) { return s + (+inv.total || 0); }, 0);
    var totalPaid     = invoices.filter(function(inv) {
      return inv.paid || inv.status === 'مدفوعة' || inv.status === 'paid';
    }).reduce(function(s, inv) { return s + (+inv.total || 0); }, 0);
    var totalUnpaid   = totalInvoiced - totalPaid;

    // مصروفات المشروع من transactions
    var expenses = (_S().transactions || []).filter(function(tx) {
      return (tx.type === 'expense' || tx.type === 'مصروف')
          && String(tx.project_id || '') === String(projId);
    }).reduce(function(s, tx) { return s + (+tx.amount || 0); }, 0);

    var budgetUsedPct = budget > 0 ? Math.round((totalInvoiced / budget) * 100) : null;
    return {
      budget          : budget,
      totalInvoiced   : totalInvoiced,
      totalPaid       : totalPaid,
      totalUnpaid     : totalUnpaid,
      expenses        : expenses,
      profit          : totalPaid - expenses,
      budgetUsed      : budgetUsedPct,
      budgetRemaining : budget - totalInvoiced,
      budgetWarning   : budget > 0 && totalInvoiced >= budget * 0.8 && totalInvoiced <= budget,
      budgetExceeded  : budget > 0 && totalInvoiced > budget
    };
  };

  /**
   * checkBudgetAlerts()
   * يُرجع قائمة المشاريع التي تجاوزت أو اقتربت من الميزانية.
   * كل عنصر: { project, summary }
   */
  window.checkBudgetAlerts = function() {
    return (_S().projects || [])
      .filter(function(p) { return p.budget && +p.budget > 0; })
      .map(function(p) {
        return { project: p, summary: window.getProjectFinancialSummary(p.id) };
      })
      .filter(function(item) {
        return item.summary.budgetWarning || item.summary.budgetExceeded;
      });
  };

  // ══════════════════════════════════════════════
  // SECTION 4 — PROPOSAL → PROJECT CONVERSION
  // ══════════════════════════════════════════════

  /**
   * convertProposalToProject(proposalTokenOrId, extraFields?)
   * يحوّل عرض سعر لمشروع جديد.
   * لا يحذف العرض الأصلي — فقط يربطه.
   * extraFields = { name?, status?, deadline? } لتجاوز القيم الافتراضية.
   */
  window.convertProposalToProject = function(proposalTokenOrId, extraFields) {
    try {
      if (!window.S) { _toast('⚠️ النظام لم يُحمَّل بعد'); return null; }

      var proposals = window.S.proposals || [];
      var prop = proposals.find(function(p) {
        return p.token === proposalTokenOrId || String(p.id) === String(proposalTokenOrId);
      });
      if (!prop) { _toast('⚠️ العرض غير موجود'); return null; }

      // هل تم التحويل مسبقاً؟
      if (prop.project_id) {
        var existing = (window.S.projects || []).find(function(p) { return String(p.id) === String(prop.project_id); });
        if (existing) { _toast('ℹ️ هذا العرض محوّل بالفعل للمشروع: ' + existing.name); return existing; }
      }

      if (!window.S.projects) window.S.projects = [];

      // بناء بيانات المشروع من العرض
      var newProj = {
        id          : Date.now(),
        name        : (extraFields && extraFields.name) || prop.title || 'مشروع جديد',
        desc        : prop.notes || '',
        client_id   : prop.client_id || '',
        status      : (extraFields && extraFields.status) || 'active',
        start       : new Date().toISOString().slice(0, 10),
        deadline    : (extraFields && extraFields.deadline) || prop.expiry_date || '',
        color       : '#7c6ff7',
        budget      : prop.total || 0,
        budgetCurrency: prop.currency || 'ج.م',
        pricingType : 'fixed',
        projectType : 'tasks',
        members     : [],
        team_group_id: '',
        createdAt   : new Date().toISOString(),
        // الروابط
        proposal_id : prop.token || String(prop.id || ''),
        source      : 'proposal'
      };

      // override بأي حقول إضافية
      if (extraFields) {
        Object.keys(extraFields).forEach(function(k) {
          if (extraFields[k] !== undefined) newProj[k] = extraFields[k];
        });
      }

      window.S.projects.push(newProj);

      // اربط العرض بالمشروع الجديد (بدون حذفه)
      var pIdx = proposals.findIndex(function(p) {
        return p.token === proposalTokenOrId || String(p.id) === String(proposalTokenOrId);
      });
      if (pIdx > -1) {
        window.S.proposals[pIdx] = Object.assign({}, prop, {
          project_id  : String(newProj.id),
          converted_at: new Date().toISOString(),
          status      : prop.status === 'accepted' ? 'accepted' : prop.status
        });
      }

      _save();
      _toast('<i class="fa-solid fa-diagram-project" style="color:var(--accent3)"></i> تم إنشاء مشروع من العرض: ' + newProj.name);
      return newProj;
    } catch(e) {
      console.error('[OrdoIL] convertProposalToProject error:', e);
      _toast('⚠️ خطأ أثناء تحويل العرض: ' + (e.message || ''));
      return null;
    }
  };

  // ══════════════════════════════════════════════
  // SECTION 5 — ATTACH / LINK ACTIONS
  // ══════════════════════════════════════════════

  /**
   * attachContractToProject(contractId, projId)
   * يربط عقد بمشروع (يضيف project_id للعقد).
   * آمن — لا يمس بيانات أخرى.
   */
  window.attachContractToProject = function(contractId, projId) {
    try {
      var contracts = window.S.contracts || [];
      var idx = contracts.findIndex(function(ct) { return ct.id === contractId; });
      if (idx < 0) { _toast('⚠️ العقد غير موجود'); return false; }

      window.S.contracts[idx] = Object.assign({}, contracts[idx], {
        project_id: String(projId),
        linked_at : new Date().toISOString()
      });

      // كذلك: اربط المشروع بالعقد
      var projects = window.S.projects || [];
      var pIdx = projects.findIndex(function(p) { return String(p.id) === String(projId); });
      if (pIdx > -1 && !window.S.projects[pIdx].contract_id) {
        window.S.projects[pIdx] = Object.assign({}, projects[pIdx], { contract_id: contractId });
      }

      _save();
      _toast('<i class="fa-solid fa-link" style="color:var(--accent3)"></i> تم ربط العقد بالمشروع');
      return true;
    } catch(e) {
      console.error('[OrdoIL] attachContractToProject error:', e);
      return false;
    }
  };

  /**
   * attachInvoiceToProject(invoiceId, projId)
   * يربط فاتورة بمشروع (يضيف project_id للفاتورة).
   */
  window.attachInvoiceToProject = function(invoiceId, projId) {
    try {
      var invoices = window.S.invoices || [];
      var idx = invoices.findIndex(function(inv) { return String(inv.id) === String(invoiceId); });
      if (idx < 0) { _toast('⚠️ الفاتورة غير موجودة'); return false; }

      window.S.invoices[idx] = Object.assign({}, invoices[idx], {
        project_id: String(projId),
        linked_at : new Date().toISOString()
      });

      _save();
      _toast('<i class="fa-solid fa-link" style="color:var(--accent3)"></i> تم ربط الفاتورة بالمشروع');
      return true;
    } catch(e) {
      console.error('[OrdoIL] attachInvoiceToProject error:', e);
      return false;
    }
  };

  /**
   * ensureProjectLinks(projId)
   * يتأكد أن المشروع مرتبط بعميل صحيح ويملأ client_name إذا ناقص.
   * آمن — يضيف فقط، لا يحذف.
   */
  window.ensureProjectLinks = function(projId) {
    try {
      var proj = (_S().projects || []).find(function(p) { return String(p.id) === String(projId); });
      if (!proj) return;

      var updated = false;

      // تأكد من client_name
      if (proj.client_id && !proj.client_name) {
        var c = (_S().clients || []).find(function(x) { return String(x.id) === String(proj.client_id); });
        if (c) { proj.client_name = c.name; updated = true; }
      }

      if (updated) _save();
    } catch(e) {
      console.error('[OrdoIL] ensureProjectLinks error:', e);
    }
  };

  // ══════════════════════════════════════════════
  // SECTION 6 — TASK TYPE CLASSIFICATION
  // ══════════════════════════════════════════════

  /**
   * getTaskSourceType(task)
   * يُرجع 'client' أو 'internal' بناءً على بيانات المهمة.
   */
  window.getTaskSourceType = function(task) {
    if (!task) return 'internal';
    // لو المهمة لها عميل أو مشروع ذو عميل → client
    if (task.client || task.clientId || task.client_id) return 'client';
    if (task.project_id) {
      var proj = (_S().projects || []).find(function(p) { return String(p.id) === String(task.project_id); });
      if (proj && proj.client_id) return 'client';
    }
    // لو مُعيَّنة لعضو فريق وليس لها عميل → internal
    if (task.sourceType) return task.sourceType; // existing field if any
    return 'internal';
  };

  /**
   * getTaskDisplayMode(task)
   * يُرجع 'client_task' أو 'internal_task' — للاستخدام في UI badges.
   */
  window.getTaskDisplayMode = function(task) {
    return window.getTaskSourceType(task) === 'client' ? 'client_task' : 'internal_task';
  };

  // ══════════════════════════════════════════════
  // SECTION 7 — FEATURES & PLANS
  // ══════════════════════════════════════════════

  /**
   * getAvailableFeaturesByMode()
   * يُرجع قائمة الـ features المتاحة بناءً على الـ workspace mode الحالي.
   */
  window.getAvailableFeaturesByMode = function() {
    var mode = window.detectWorkspaceMode();
    var f    = typeof window._getPlanFeatures === 'function' ? window._getPlanFeatures() : {};

    var base = {
      clients    : true,
      tasks      : true,
      invoices   : f.invoices !== false,
      projects   : true,
      proposals  : !!f.proposals,
      contracts  : !!f.contracts,
      reviews    : true,
      client_timeline    : true,   // always available — lightweight
      project_linking    : true,   // core feature
      convert_proposal   : !!f.proposals,
      attach_contract    : !!f.contracts
    };

    var company = {
      team               : !!f.team,
      internal_tasks     : !!f.team,
      departments_ready  : !!f.corp_mode,
      role_ready         : !!f.corp_mode,
      corporate_mode     : !!f.corp_mode,
      internal_workflow  : !!f.corp_mode,
      external_workflow  : true,
      advanced_relations : !!f.proposals || !!f.contracts
    };

    var freelancer = {
      team               : false,
      internal_tasks     : false,
      departments_ready  : false,
      role_ready         : false,
      corporate_mode     : false,
      internal_workflow  : false,
      external_workflow  : true,
      advanced_relations : !!f.proposals || !!f.contracts
    };

    return Object.assign({}, base, mode === 'company' ? company : freelancer);
  };

  /**
   * isFeatureAllowedForMode(featureKey)
   * هل feature معيّنة متاحة في الوضع الحالي؟
   */
  window.isFeatureAllowedForMode = function(featureKey) {
    var features = window.getAvailableFeaturesByMode();
    return !!features[featureKey];
  };

  /**
   * getPlanUseCaseProfile(planFeatures)
   * يُرجع use-case profile للباقة — freelancer_basic / freelancer_pro / studio / agency.
   */
  window.getPlanUseCaseProfile = function(planFeatures) {
    var f = planFeatures || {};

    if (f.corp_mode || f.corporate) {
      if (f.reports && f.max_team > 5) return 'agency';
      return 'studio';
    }
    if (f.proposals && f.contracts) return 'freelancer_pro';
    return 'freelancer_basic';
  };

  // ══════════════════════════════════════════════
  // SECTION 8 — ENTITY NORMALIZATION
  // ══════════════════════════════════════════════

  /**
   * normalizeEntityRelations()
   * يمشي على البيانات الموجودة ويملأ الـ links الناقصة بشكل آمن.
   * يعمل مرة عند تحميل الصفحة — لا يحذف أي شيء.
   */
  window.normalizeEntityRelations = function() {
    try {
      var S = window.S;
      if (!S) return;

      var changed = false;

      // 1) Contract: إضافة client_id بناءً على client_name
      (S.contracts || []).forEach(function(ct, i) {
        if (!ct.client_id && ct.client_name) {
          var c = (S.clients || []).find(function(x) {
            return x.name === ct.client_name;
          });
          if (c) {
            S.contracts[i] = Object.assign({}, ct, { client_id: String(c.id) });
            changed = true;
          }
        }
      });

      // 2) Proposal: إضافة client_id بناءً على clientName
      (S.proposals || []).forEach(function(p, i) {
        if (!p.client_id && (p.clientName || p.client_name)) {
          var cName = p.clientName || p.client_name;
          var c = (S.clients || []).find(function(x) { return x.name === cName; });
          if (c) {
            S.proposals[i] = Object.assign({}, p, { client_id: String(c.id) });
            changed = true;
          }
        }
      });

      // 3) Invoice: normalize clientId/client_id
      (S.invoices || []).forEach(function(inv, i) {
        var needsId = !inv.clientId && !inv.client_id && inv.client;
        if (needsId) {
          var c = (S.clients || []).find(function(x) { return x.name === inv.client; });
          if (c) {
            S.invoices[i] = Object.assign({}, inv, { clientId: String(c.id) });
            changed = true;
          }
        }
      });

      // 4) Review: إضافة client_id إذا ناقص
      (S.reviews || []).forEach(function(r, i) {
        if (!r.client_id && r.client_name) {
          var c = (S.clients || []).find(function(x) { return x.name === r.client_name; });
          if (c) {
            S.reviews[i] = Object.assign({}, r, { client_id: String(c.id) });
            changed = true;
          }
        }
      });

      // 5) Project: تأكد من client_name
      (S.projects || []).forEach(function(p, i) {
        if (p.client_id && !p.client_name) {
          var c = (S.clients || []).find(function(x) { return String(x.id) === String(p.client_id); });
          if (c) {
            S.projects[i] = Object.assign({}, p, { client_name: c.name });
            changed = true;
          }
        }
      });

      // 6) Transactions: normalize client_id from source name (fix expense tracking by ID)
      (S.transactions || []).forEach(function(tx, i) {
        if (!tx.client_id && tx.source) {
          var c = (S.clients || []).find(function(x) { return x.name === tx.source; });
          if (c) {
            S.transactions[i] = Object.assign({}, tx, { client_id: String(c.id) });
            changed = true;
          }
        }
      });

      if (changed) {
        try { if (typeof window.lsSave === 'function') window.lsSave(); } catch(e) {}
        // لا نحفظ للـ cloud في normalizeEntityRelations لتجنب unnecessary saves
      }

    } catch(e) {
      console.error('[OrdoIL] normalizeEntityRelations error:', e);
    }
  };

  /**
   * migrateLegacyRelations()
   * يتعامل مع البيانات القديمة التي قد لا تملك الحقول الجديدة.
   * آمن تماماً — يضيف فقط، لا يحذف.
   */
  window.migrateLegacyRelations = function() {
    try {
      var S = window.S;
      if (!S) return;

      // تأكد من وجود arrays الجديدة
      if (!S.proposals)    S.proposals    = [];
      if (!S.contracts)    S.contracts    = [];
      if (!S.reviews)      S.reviews      = [];
      if (!S.project_tasks) S.project_tasks = [];

      // للمهام العادية: تأكد من وجود taskType إذا ما كانت موجودة
      (S.tasks || []).forEach(function(t) {
        if (!t.taskType) t.taskType = 'task';  // backward compatible default
      });

      // للعقود: تأكد من وجود status
      (S.contracts || []).forEach(function(ct) {
        if (!ct.status) ct.status = 'draft';
      });

      // لا نحفظ هنا — normalizeEntityRelations ستتولى الحفظ

    } catch(e) {
      console.error('[OrdoIL] migrateLegacyRelations error:', e);
    }
  };

  // ══════════════════════════════════════════════
  // SECTION 9 — ADMIN INTEGRATION
  // ══════════════════════════════════════════════

  /**
   * normalizeAdminPlanFeatures(planFeatures)
   * يأخذ features object من admin plan ويضيف الـ flags الجديدة بشكل safe.
   * يُستخدَم عند قراءة الباقة في app — backward compatible.
   */
  window.normalizeAdminPlanFeatures = function(planFeatures) {
    if (!planFeatures) return {};
    var f = Object.assign({}, planFeatures);

    // Infer workspace_mode from corp_mode
    if (!f.workspace_mode) {
      f.workspace_mode = (f.corp_mode || f.corporate) ? 'company' : 'freelancer';
    }

    // الـ features الجديدة المشتقة — تعمل backward compatible
    if (f.proposals === undefined) f.proposals = false;
    if (f.contracts === undefined) f.contracts = false;
    if (f.client_timeline === undefined) f.client_timeline = true;  // lightweight — always on
    if (f.project_linking === undefined) f.project_linking = true;  // core — always on
    if (f.convert_proposal === undefined) f.convert_proposal = !!f.proposals;
    if (f.advanced_relations === undefined) f.advanced_relations = !!f.proposals || !!f.contracts;
    if (f.internal_workflow === undefined) f.internal_workflow = !!f.corp_mode;
    if (f.internal_tasks === undefined)    f.internal_tasks    = !!f.team;
    if (f.departments_ready === undefined) f.departments_ready = !!f.corp_mode;
    if (f.role_ready === undefined)        f.role_ready        = !!f.corp_mode;
    if (f.external_workflow === undefined) f.external_workflow = true;

    return f;
  };

  /**
   * syncAdminSectionsWithModes()
   * يُزامن visibility الأقسام مع الـ workspace mode الحالي.
   * يُستدعى بعد تغيير الباقة أو تغيير workspace_mode.
   * آمن — يعتمد على _isSectionEnabled الموجود.
   */
  window.syncAdminSectionsWithModes = function() {
    try {
      var mode     = window.detectWorkspaceMode();
      var features = window.getAvailableFeaturesByMode();

      // في وضع الفريلانسر: أخفِ أقسام الشركات إذا لم تكن مفعّلة
      var companyOnlySections = ['team'];
      companyOnlySections.forEach(function(sec) {
        var el = document.querySelector('[data-page="' + sec + '"]') ||
                 document.getElementById('nav-' + sec);
        if (!el) return;
        var allowed = features[sec] !== false;
        el.style.display = allowed ? '' : 'none';
      });

    } catch(e) {
      console.error('[OrdoIL] syncAdminSectionsWithModes error:', e);
    }
  };

  // ══════════════════════════════════════════════
  // SECTION 10 — UI HELPERS
  // ══════════════════════════════════════════════

  /**
   * renderClientTimelineHTML(clientId)
   * يُرجع HTML string لـ timeline العميل.
   * يمكن استخدامه في client profile tab.
   */
  window.renderClientTimelineHTML = function(clientId) {
    var events = window.getClientTimeline(clientId);
    if (!events.length) {
      return '<div style="color:var(--text3);font-size:13px;padding:12px 0">لا يوجد نشاط مسجّل بعد.</div>';
    }

    var typeIcon = {
      proposal : 'fa-file-invoice',
      contract : 'fa-file-contract',
      project  : 'fa-diagram-project',
      invoice  : 'fa-receipt',
      review   : 'fa-star',
      task     : 'fa-check-square'
    };
    var typeColor = {
      proposal : 'var(--accent)',
      contract : '#64b5f6',
      project  : 'var(--accent3)',
      invoice  : 'var(--accent2)',
      review   : '#f7c948',
      task     : 'var(--text2)'
    };
    var typeLabel = {
      proposal : 'عرض سعر',
      contract : 'عقد',
      project  : 'مشروع',
      invoice  : 'فاتورة',
      review   : 'تقييم',
      task     : 'مهمة'
    };

    return '<div style="display:flex;flex-direction:column;gap:0">'
      + events.map(function(ev) {
          var icon  = typeIcon[ev.type]  || 'fa-circle';
          var color = typeColor[ev.type] || 'var(--text3)';
          var label = typeLabel[ev.type] || ev.type;
          var dateStr = ev.date ? new Date(ev.date).toLocaleDateString('ar-EG', { year:'numeric', month:'short', day:'numeric' }) : '';
          return '<div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">'
            + '<div style="width:32px;height:32px;border-radius:50%;background:' + color + '22;color:' + color + ';display:flex;align-items:center;justify-content:center;flex-shrink:0">'
            + '<i class="fa-solid ' + icon + '" style="font-size:13px"></i></div>'
            + '<div style="flex:1;min-width:0">'
            + '<div style="font-size:12px;font-weight:700;color:var(--text)">' + (typeof window.escapeHtml === 'function' ? window.escapeHtml(ev.title) : ev.title) + '</div>'
            + '<div style="font-size:10px;color:var(--text3);margin-top:2px">' + label + (dateStr ? ' · ' + dateStr : '') + (ev.status ? ' · ' + ev.status : '') + '</div>'
            + '</div></div>';
        }).join('')
      + '</div>';
  };

  /**
   * renderProjectFinanceSummaryHTML(projId)
   * يُرجع HTML للملخص المالي للمشروع — يمكن embed في project detail.
   */
  window.renderProjectFinanceSummaryHTML = function(projId) {
    var sum = window.getProjectFinancialSummary(projId);
    var cur = typeof window._getCurrency === 'function' ? window._getCurrency() : '';

    function card(label, val, color) {
      return '<div style="flex:1;min-width:100px;background:var(--surface2);border-radius:10px;padding:10px 12px;border:1px solid var(--border)">'
        + '<div style="font-size:10px;color:var(--text3);margin-bottom:3px">' + label + '</div>'
        + '<div style="font-size:15px;font-weight:800;color:' + color + '">' + Number(val || 0).toLocaleString() + ' ' + cur + '</div>'
        + '</div>';
    }

    var budgetAlert = '';
    if (sum.budgetExceeded) {
      budgetAlert = '<div style="margin-top:8px;padding:10px 14px;background:rgba(247,111,124,.1);border:1.5px solid rgba(247,111,124,.4);border-radius:10px;font-size:12px;color:#f76f7c;display:flex;align-items:center;gap:8px">'
        + '<i class="fa-solid fa-triangle-exclamation"></i>'
        + '<span>تجاوزت الميزانية بمقدار <strong>' + Number(Math.abs(sum.budgetRemaining || 0)).toLocaleString() + ' ' + cur + '</strong></span>'
        + '</div>';
    } else if (sum.budgetWarning) {
      budgetAlert = '<div style="margin-top:8px;padding:10px 14px;background:rgba(247,201,72,.1);border:1.5px solid rgba(247,201,72,.4);border-radius:10px;font-size:12px;color:#f7c948;display:flex;align-items:center;gap:8px">'
        + '<i class="fa-solid fa-circle-exclamation"></i>'
        + '<span>وصلت لـ <strong>' + (sum.budgetUsed || 0) + '%</strong> من الميزانية — تبقّى <strong>' + Number(sum.budgetRemaining || 0).toLocaleString() + ' ' + cur + '</strong></span>'
        + '</div>';
    }

    return '<div style="display:flex;flex-wrap:wrap;gap:8px;margin:8px 0">'
      + card('الميزانية', sum.budget, 'var(--text)')
      + card('إجمالي الفواتير', sum.totalInvoiced, 'var(--accent)')
      + card('محصّل', sum.totalPaid, 'var(--accent3)')
      + card('متبقي', sum.totalUnpaid, sum.totalUnpaid > 0 ? 'var(--accent4)' : 'var(--accent3)')
      + card('صافي الربح', sum.profit, sum.profit >= 0 ? 'var(--accent3)' : 'var(--accent4)')
      + '</div>'
      + budgetAlert;
  };

  // ══════════════════════════════════════════════
  // SECTION 11 — CONVERT PROPOSAL UI
  // ══════════════════════════════════════════════

  /**
   * openConvertProposalModal(proposalTokenOrId)
   * يفتح modal بسيط لتأكيد تحويل العرض لمشروع.
   */
  window.openConvertProposalModal = function(proposalTokenOrId) {
    var proposals = (_S().proposals || []);
    var prop = proposals.find(function(p) {
      return p.token === proposalTokenOrId || String(p.id) === String(proposalTokenOrId);
    });
    if (!prop) { _toast('⚠️ العرض غير موجود'); return; }

    if (prop.project_id) {
      var ex = (_S().projects || []).find(function(p) { return String(p.id) === String(prop.project_id); });
      if (ex) {
        if (!confirm('هذا العرض تم تحويله بالفعل للمشروع: "' + ex.name + '"\nهل تريد فتح المشروع؟')) return;
        if (typeof window.openProjectDetail === 'function') window.openProjectDetail(ex.id);
        return;
      }
    }

    var projName = prop.title || 'مشروع جديد';

    // modal بسيط
    var existing = document.getElementById('_il-convert-modal');
    if (existing) existing.remove();
    var ov = document.createElement('div');
    ov.id = '_il-convert-modal';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:999999;padding:16px';
    ov.innerHTML = '<div style="background:var(--surface);border-radius:18px;padding:26px;width:min(420px,95vw);box-shadow:0 24px 80px rgba(0,0,0,.5)">'
      + '<div style="font-size:16px;font-weight:900;margin-bottom:4px"><i class="fa-solid fa-diagram-project" style="color:var(--accent)"></i> تحويل عرض سعر لمشروع</div>'
      + '<div style="font-size:12px;color:var(--text3);margin-bottom:18px">سيتم إنشاء مشروع جديد مرتبط بهذا العرض بدون حذفه</div>'
      + '<div style="margin-bottom:12px"><label style="font-size:12px;font-weight:700;color:var(--text2);display:block;margin-bottom:5px">اسم المشروع</label>'
      + '<input id="_il-proj-name" class="form-input" value="' + (projName || '') + '" style="width:100%;box-sizing:border-box"></div>'
      + '<div style="margin-bottom:18px"><label style="font-size:12px;font-weight:700;color:var(--text2);display:block;margin-bottom:5px">تاريخ التسليم (اختياري)</label>'
      + '<input id="_il-proj-deadline" type="date" class="form-input" style="width:100%;box-sizing:border-box"></div>'
      + '<div style="display:flex;gap:10px">'
      + '<button id="_il-confirm-btn" class="btn btn-primary" style="flex:1"><i class="fa-solid fa-check"></i> إنشاء المشروع</button>'
      + '<button id="_il-cancel-btn" class="btn btn-ghost" style="flex:1">إلغاء</button>'
      + '</div></div>';
    document.body.appendChild(ov);

    document.getElementById('_il-cancel-btn').onclick = function() { ov.remove(); };
    ov.onclick = function(e) { if (e.target === ov) ov.remove(); };
    document.getElementById('_il-confirm-btn').onclick = function() {
      var name     = document.getElementById('_il-proj-name').value.trim();
      var deadline = document.getElementById('_il-proj-deadline').value;
      if (!name) { _toast('⚠️ اسم المشروع مطلوب'); return; }
      ov.remove();
      var newProj = window.convertProposalToProject(proposalTokenOrId, { name: name, deadline: deadline });
      if (newProj) {
        setTimeout(function() {
          if (typeof window.renderProjects === 'function') window.renderProjects();
          if (typeof window.openProjectDetail === 'function') window.openProjectDetail(newProj.id);
        }, 200);
      }
    };
  };

  // ══════════════════════════════════════════════
  // SECTION 12 — WORKSPACE MODE SETTING
  // ══════════════════════════════════════════════

  /**
   * setWorkspaceMode(mode)
   * يضبط workspace_mode في settings — 'freelancer' أو 'company'.
   */
  window.setWorkspaceMode = function(mode) {
    if (mode !== 'freelancer' && mode !== 'company' && mode !== 'both') return;
    if (!window.S) return;
    if (!window.S.settings) window.S.settings = {};
    window.S.settings.workspace_mode = mode;
    window.S.settings.updatedAt = new Date().toISOString();
    _save();
    window.syncAdminSectionsWithModes();
    _toast('<i class="fa-solid fa-check" style="color:var(--accent3)"></i> تم تغيير وضع العمل: ' + (mode === 'company' ? 'شركة' : 'فريلانسر'));
  };

  // ══════════════════════════════════════════════
  // SECTION 13 — PATCH: SAVE CONTRACT + CLIENT_ID
  // ══════════════════════════════════════════════
  // نعمل patch لـ saveContract بحيث يضيف client_id تلقائياً.
  // آمن — fallback إذا saveContract غير موجود.

  (function _patchSaveContractClientId() {
    var _pi = setInterval(function() {
      if (typeof window.saveContract !== 'function') return;
      clearInterval(_pi);

      var _orig = window.saveContract;
      window.saveContract = function() {
        // استدعي الأصلي أولاً
        _orig.apply(this, arguments);
        // بعدين أضف client_id بناءً على client_name
        try {
          var arr = window.S.contracts || [];
          var changed = false;
          arr.forEach(function(ct, i) {
            if (!ct.client_id && ct.client_name) {
              var c = (window.S.clients || []).find(function(x) { return x.name === ct.client_name; });
              if (c) { arr[i] = Object.assign({}, ct, { client_id: String(c.id) }); changed = true; }
            }
          });
          if (changed) {
            window.S.contracts = arr;
            try { if (typeof window.lsSave === 'function') window.lsSave(); } catch(e) {}
          }
        } catch(e) {}
      };
    }, 300);
    setTimeout(function() { clearInterval(_pi); }, 15000);
  })();

  // ══════════════════════════════════════════════
  // SECTION 14 — PATCH: CLIENT PROFILE TABS
  // ══════════════════════════════════════════════
  // نضيف tab "السجل الزمني" في client profile إذا وُجد.

  (function _patchClientProfileTimeline() {
    var _pi = setInterval(function() {
      if (typeof window._renderProfileTab !== 'function') return;
      clearInterval(_pi);

      var _orig = window._renderProfileTab;
      window._renderProfileTab = function(tab, clientId) {
        if (tab === 'timeline') {
          // render timeline
          var areas = ['client-profile-tab-content', 'client-tab-content', 'profile-tab-area'];
          var el = null;
          for (var i = 0; i < areas.length; i++) {
            el = document.getElementById(areas[i]);
            if (el) break;
          }
          if (!el) { _orig.apply(this, arguments); return; }
          el.innerHTML = '<div style="padding:8px 0">'
            + '<div style="font-size:13px;font-weight:800;color:var(--text);margin-bottom:12px"><i class="fa-solid fa-clock-rotate-left" style="color:var(--accent)"></i> السجل الزمني</div>'
            + window.renderClientTimelineHTML(clientId)
            + '</div>';
          return;
        }
        _orig.apply(this, arguments);
      };
    }, 400);
    setTimeout(function() { clearInterval(_pi); }, 15000);
  })();

  // ══════════════════════════════════════════════
  // SECTION 15 — PATCH: PROPOSALS LIST
  // ══════════════════════════════════════════════
  // نضيف زر "تحويل لمشروع" في عرض كل proposal.

  (function _patchProposalsConvertBtn() {
    var _pi = setInterval(function() {
      if (typeof window.renderProposals !== 'function') return;
      clearInterval(_pi);

      var _orig = window.renderProposals;
      window.renderProposals = function() {
        _orig.apply(this, arguments);
        // بعد render: أضف زر تحويل لكل proposal لها status=accepted وليس لها project_id
        setTimeout(function() {
          try {
            var proposals = window.S.proposals || [];
            proposals.forEach(function(p) {
              if (p.project_id) return; // محوّل مسبقاً
              // ابحث عن card الخاصة بهذا العرض بالـ token أو id
              var token = p.token || String(p.id || '');
              // نضيف data attribute للزر إذا موجود
              var btns = document.querySelectorAll('[data-prop-convert]');
              btns.forEach(function(b) {
                if (b.dataset.propConvert === token) return; // موجود
              });
              // نبحث عن container بأي selector ممكن
              var card = document.querySelector('[data-proposal-token="' + token + '"]') ||
                         document.querySelector('[data-prop-token="' + token + '"]');
              if (!card) return;
              if (card.querySelector('[data-prop-convert]')) return;
              var btn = document.createElement('button');
              btn.className = 'btn btn-ghost btn-sm';
              btn.setAttribute('data-prop-convert', token);
              btn.style.cssText = 'font-size:11px;margin-top:4px';
              btn.innerHTML = '<i class="fa-solid fa-diagram-project"></i> تحويل لمشروع';
              btn.onclick = function(e) {
                e.stopPropagation();
                window.openConvertProposalModal(token);
              };
              card.appendChild(btn);
            });
          } catch(e) {}
        }, 300);
      };
    }, 500);
    setTimeout(function() { clearInterval(_pi); }, 15000);
  })();

  // ══════════════════════════════════════════════
  // ============================================================
  // SECTION 15B - LEGACY FUNCTION BRIDGE TO ORDO DATA
  // ============================================================
  function _wrapGlobal(name, build){
    var fn = window[name];
    if(typeof fn !== 'function' || fn._ordoCoreWrapped) return false;
    var wrapped = build(fn);
    if(typeof wrapped !== 'function') return false;
    wrapped._ordoCoreWrapped = true;
    window[name] = wrapped;
    return true;
  }

  function _patchLegacyDataFunctions(){
    _wrapGlobal('saveTask', function(orig){
      return function(){
        if(window.OrdoAccess && !window.OrdoAccess.can('tasks.create')){ _toast('غير مسموح بإنشاء المهام في هذه الباقة'); return; }
        try{
          var st = document.getElementById('t-status'); if(st && !st.value) st.value = 'new';
          var val = document.getElementById('t-value'); if(val && !val.value) val.value = '0';
          var cur = document.getElementById('t-currency'); if(cur && !cur.value && window.OrdoData) cur.value = window.OrdoData.resolveCurrency();
        }catch(e){}
        var res = orig.apply(this, arguments);
        setTimeout(function(){ try{ window.OrdoData.normalizeAll(); window.OrdoData.saveDirty(); }catch(e){} }, 0);
        return res;
      };
    });

    _wrapGlobal('saveClient', function(orig){
      return function(){
        if(window.OrdoAccess && !window.OrdoAccess.can('clients.edit')){ _toast('غير مسموح بتعديل العملاء'); return; }
        var res = orig.apply(this, arguments);
        setTimeout(function(){ try{ window.OrdoData.normalizeAll(); window.OrdoData.saveDirty(); }catch(e){} }, 0);
        return res;
      };
    });

    _wrapGlobal('saveInvoice', function(orig){
      return function(){
        if(window.OrdoAccess && !window.OrdoAccess.can('invoices.create')){ _toast('غير مسموح بإنشاء الفواتير'); return; }
        try{
          var invClient = document.getElementById('inv-client');
          if(invClient && invClient.value){
            var c = (_S().clients || []).find(function(x){ return String(x.id) === String(invClient.value); });
            if(c) invClient.value = c.name;
          }
        }catch(e){}
        var before = (_S().invoices || []).map(function(i){ return String(i.id); });
        var res = orig.apply(this, arguments);
        setTimeout(function(){
          try{
            window.OrdoData.normalizeAll();
            var newest = (_S().invoices || []).filter(function(i){ return before.indexOf(String(i.id)) < 0; }).pop();
            if(newest && window._pendingInvoiceProjectId){
              newest.project_id = String(window._pendingInvoiceProjectId);
              window.OrdoData.markDirty('invoices', newest.id);
            }
            window.OrdoData.saveDirty();
          }catch(e){}
        }, 0);
        return res;
      };
    });

    _wrapGlobal('markPaid', function(orig){
      return function(id){
        var res = orig.apply(this, arguments);
        try{
          var inv = (_S().invoices || []).find(function(i){ return String(i.id) === String(id); });
          if(inv && !inv._ordoPaidTransactionCreated){
            window.OrdoData.payInvoice(id, inv.total || 0);
            inv._ordoPaidTransactionCreated = true;
            window.OrdoData.saveDirty();
          }
        }catch(e){}
        return res;
      };
    });

    _wrapGlobal('markUncollected', function(orig){
      return function(id){
        var res = orig.apply(this, arguments);
        try{ window.OrdoData.markDirty('invoices', id); window.OrdoData.saveDirty(); }catch(e){}
        return res;
      };
    });

    _wrapGlobal('saveProject', function(orig){
      return function(){
        var res = orig.apply(this, arguments);
        setTimeout(function(){ try{ window.OrdoData.normalizeAll(); window.OrdoData.saveDirty(); }catch(e){} }, 0);
        return res;
      };
    });

    _wrapGlobal('saveContract', function(orig){
      return function(){
        var res = orig.apply(this, arguments);
        setTimeout(function(){ try{ window.OrdoData.normalizeAll(); window.OrdoData.saveDirty(); }catch(e){} }, 0);
        return res;
      };
    });

    _wrapGlobal('saveProposal', function(orig){
      return async function(){
        var res = await orig.apply(this, arguments);
        try{ window.OrdoData.normalizeAll(); window.OrdoData.saveDirty(); }catch(e){}
        return res;
      };
    });

    _wrapGlobal('delClient', function(orig){
      return function(id){
        if(window.OrdoAccess && !window.OrdoAccess.can('clients.delete')){ _toast('غير مسموح بحذف العملاء'); return; }
        var rel = window.OrdoData.getClientLinkedRecords(id);
        var labels = {
          tasks:'tasks', archivedTasks:'archived', project_tasks:'project tasks', projects:'projects',
          invoices:'invoices', transactions:'transactions', reviews:'reviews', contracts:'contracts',
          proposals:'proposals', schedule:'schedule', meetings:'meetings', leads:'leads',
          client_portals:'portals', svc_orders:'store orders', statements:'statements',
          timeEntries:'time entries', loans:'loans', budgets:'budgets', team_tasks:'team tasks'
        };
        var details = Object.keys(labels).map(function(k){
          var n = (rel[k] || []).length;
          return n ? labels[k] + ': ' + n : '';
        }).filter(Boolean).join('\n');
        var msg = 'سيتم حذف العميل وكل السجلات المرتبطة به بدون ترك بيانات orphan.\n\n'
          + (details || 'لا توجد سجلات مرتبطة')
          + '\n\nالإجمالي: ' + rel.totalRecords;
        var run = function(){
          window.OrdoData.deleteClientCascade(id, {hard:true});
          window.OrdoData.saveDirty();
          try{ if(typeof renderAll === 'function') renderAll(); }catch(e){}
          try{ if(typeof fillDD === 'function'){ fillDD('t-client'); fillDD('inv-client'); } }catch(e2){}
          _toast('تم حذف العميل والعلاقات المرتبطة بأمان');
        };
        if(typeof window.confirmDel === 'function') window.confirmDel(msg, run);
        else if(confirm(msg)) run();
      };
    });

    _wrapGlobal('renderAll', function(orig){
      return function(){
        try{ window.OrdoData.normalizeAll({mark:false}); }catch(e){}
        var res = orig.apply(this, arguments);
        try{
          var mode = window.OrdoAccess.getWorkspaceMode();
          document.documentElement.setAttribute('data-workspace-mode', mode);
        }catch(e2){}
        return res;
      };
    });

    _wrapGlobal('saveSettings', function(orig){
      return function(){
        var before = _S().settings && _S().settings.currency;
        var res = orig.apply(this, arguments);
        try{
          if(_S().settings) _S().settings.updatedAt = new Date().toISOString();
          window.OrdoData.normalizeAll();
          window.OrdoData.saveDirty();
          if(before !== (_S().settings && _S().settings.currency) && typeof renderAll === 'function') setTimeout(renderAll, 50);
        }catch(e){}
        return res;
      };
    });
  }

  window.OrdoData.patchLegacyDataFunctions = _patchLegacyDataFunctions;

  // SECTION 16 — INIT
  // ══════════════════════════════════════════════

  function _init() {
    try {
      // انتظر تحميل S
      var _initInterval = setInterval(function() {
        if (!window.S) return;
        clearInterval(_initInterval);

        window.migrateLegacyRelations();
        window.normalizeEntityRelations();
        var changed = window.OrdoData && window.OrdoData.normalizeAll({mark:false});
        window.OrdoData.patchLegacyDataFunctions();
        window.syncAdminSectionsWithModes();
        if(window.OrdoBoot) window.OrdoBoot.run();
        if(changed && window.OrdoData) window.OrdoData.save({now:true});

        console.log('[OrdoIL] Integration Layer initialized. Mode:', window.detectWorkspaceMode());
      }, 300);

      setTimeout(function() { clearInterval(_initInterval); }, 20000);
    } catch(e) {
      console.error('[OrdoIL] Init error:', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

  // ══════════════════════════════════════════════
  // PUBLIC API SUMMARY
  // ══════════════════════════════════════════════
  // window.detectWorkspaceMode()            → 'freelancer' | 'company'
  // window.isCompanyMode()                  → bool
  // window.isFreelancerMode()               → bool
  // window.setWorkspaceMode(mode)           → void
  //
  // window.getClientProjects(clientId)      → []
  // window.getClientInvoices(clientId)      → []
  // window.getClientContracts(clientId)     → []
  // window.getClientProposals(clientId)     → []
  // window.getClientReviews(clientId)       → []
  // window.getClientTasks(clientId)         → []
  // window.getClientTimeline(clientId)      → []  ← مرتبة زمنياً
  //
  // window.getProjectTasks(projId)          → []
  // window.getProjectInvoices(projId)       → []
  // window.getProjectContract(projId)       → obj|null
  // window.getProjectProposal(projId)       → obj|null
  // window.getProjectFinancialSummary(projId) → { budget, totalPaid, profit, ... }
  //
  // window.convertProposalToProject(token, opts) → project | null
  // window.openConvertProposalModal(token)  → void  ← UI
  // window.attachContractToProject(ctId, projId) → bool
  // window.attachInvoiceToProject(invId, projId) → bool
  // window.ensureProjectLinks(projId)       → void
  //
  // window.getTaskSourceType(task)          → 'client' | 'internal'
  // window.getTaskDisplayMode(task)         → 'client_task' | 'internal_task'
  //
  // window.getAvailableFeaturesByMode()     → { proposals, contracts, team, ... }
  // window.isFeatureAllowedForMode(key)     → bool
  // window.getPlanUseCaseProfile(features)  → 'freelancer_basic' | 'freelancer_pro' | 'studio' | 'agency'
  // window.normalizeAdminPlanFeatures(f)    → enriched features object
  // window.syncAdminSectionsWithModes()     → void
  //
  // window.normalizeEntityRelations()       → void  ← safe migration
  // window.migrateLegacyRelations()         → void  ← safe migration
  //
  // window.renderClientTimelineHTML(clientId)        → HTML string
  // window.renderProjectFinanceSummaryHTML(projId)   → HTML string
  // ══════════════════════════════════════════════

})(window);

/* ===== END ORDO INTEGRATION LAYER ===== */


/* ===== BEGIN CUSTOMIZATION PATCH (customization_patch.js) ===== */
// ============================================================
// CUSTOMIZATION PATCH v3
// ============================================================

function _cpSave(key,val){try{localStorage.setItem(key,JSON.stringify(val));}catch(e){}}
function _cpLoad(key,def){try{var v=JSON.parse(localStorage.getItem(key));return v!=null?v:def;}catch(e){return def;}}

function _cpModal(id,html){
  var ex=document.getElementById(id);if(ex)ex.remove();
  var ov=document.createElement('div');
  ov.id=id;
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:999999;padding:16px;overflow-y:auto';
  ov.innerHTML=html;
  document.body.appendChild(ov);
  ov.addEventListener('click',function(e){if(e.target===ov)ov.remove();});
  return ov;
}

// ══ SECTION 1: تخصيص حقول فورم المهمة ══

var _TF_FIELDS=[
  {id:'t-client-group-wrap', label:'العميل / الجهة'},
  {id:'t-type-row-wrap',     label:'نوع العمل ونوع المهمة'},
  {id:'t-dates-row-wrap',    label:'تاريخ الطلب ووعد التسليم'},
  {id:'t-priority-row-wrap', label:'الأولوية والحالة'},
  {id:'t-value-row',         label:'قيمة المشروع وحالة الدفع'},
  {id:'t-worker-section',    label:'من يعمل على المهمة'},
  {id:'t-notes-row-wrap',    label:'الملاحظات'},
  {id:'t-steps-section-wrap',label:'خطوات التنفيذ'},
  {id:'t-brief-section-wrap',label:'تفاصيل المشروع'},
  {id:'task-inv-opt',        label:'خيار إصدار فاتورة'},
];

function _getTFPrefs(){
  var saved=_cpLoad('_tfPrefs',{});
  return _TF_FIELDS.map(function(f){return{id:f.id,label:f.label,visible:saved[f.id]!==false};});
}

function _applyTFPrefs(){
  _getTFPrefs().forEach(function(p){var el=document.getElementById(p.id);if(el)el.style.display=p.visible?'':'none';});
}

function _openTFSettings(){
  var prefs=_getTFPrefs();
  var rows=prefs.map(function(p){
    return '<label style="display:flex;align-items:center;gap:10px;padding:10px 13px;border-radius:11px;background:var(--surface2);margin-bottom:6px;cursor:pointer;font-size:13px;font-weight:600;color:var(--text)">'
      +'<input type="checkbox" data-id="'+p.id+'" '+(p.visible?'checked':'')
      +' style="width:17px;height:17px;accent-color:var(--accent);cursor:pointer"> '+p.label+'</label>';
  }).join('');
  var ov=_cpModal('_tf-settings-modal',
    '<div style="background:var(--surface);width:min(400px,93vw);border-radius:20px;padding:26px;box-shadow:0 24px 80px rgba(0,0,0,.5)">'
    +'<div style="font-size:16px;font-weight:900;text-align:center;margin-bottom:6px;color:var(--text)"><i class="fa-solid fa-sliders" style="color:var(--accent)"></i> تخصيص حقول فورم المهمة</div>'
    +'<div style="font-size:12px;color:var(--text3);text-align:center;margin-bottom:18px">اختر الحقول اللي عايزها تظهر</div>'
    +rows
    +'<div style="display:flex;gap:10px;margin-top:18px">'
    +'<button id="_tf-save" class="btn btn-primary" style="flex:1"><i class="fa-solid fa-check"></i> حفظ</button>'
    +'<button id="_tf-cancel" class="btn btn-ghost" style="flex:1">إلغاء</button>'
    +'</div></div>');
  document.getElementById('_tf-save').onclick=function(){
    var map={};ov.querySelectorAll('input[data-id]').forEach(function(cb){map[cb.dataset.id]=cb.checked;});
    _cpSave('_tfPrefs',map);ov.remove();_wrapTaskFormSections();_applyTFPrefs();
    if(typeof showMiniNotif==='function')showMiniNotif('<i class="fa-solid fa-sliders" style="color:var(--accent)"></i> تم تحديث إعدادات فورم المهمة');
  };
  document.getElementById('_tf-cancel').onclick=function(){ov.remove();};
}

// ══ SECTION 2: تخصيص حقول فورم العميل ══

var _CF_FIELDS=[
  {id:'cf-type-phone-wrap',    label:'نوع العميل + الهاتف + الإيميل'},
  {id:'cf-channel-field-wrap', label:'قناة التواصل والمجال'},
  {id:'cf-worktype-wrap',      label:'طبيعة التعامل والراتب'},
  {id:'cf-notes-wrap',         label:'الملاحظات'},
  {id:'cf-opening-bal-wrap',   label:'الرصيد الافتتاحي'},
  {id:'cf-dna-wrap',           label:'DNA العميل'},
  {id:'cf-socials-wrap',       label:'حسابات السوشيال ميديا'},
  {id:'cf-followup-wrap',      label:'إعدادات المتابعة التلقائية'},
];

function _getCFPrefs(){
  var saved=_cpLoad('_cfPrefs',{});
  return _CF_FIELDS.map(function(f){return{id:f.id,label:f.label,visible:saved[f.id]!==false};});
}

function _applyCFPrefs(){
  _getCFPrefs().forEach(function(p){var el=document.getElementById(p.id);if(el)el.style.display=p.visible?'':'none';});
}

function _openCFSettings(){
  var prefs=_getCFPrefs();
  var rows=prefs.map(function(p){
    return '<label style="display:flex;align-items:center;gap:10px;padding:10px 13px;border-radius:11px;background:var(--surface2);margin-bottom:6px;cursor:pointer;font-size:13px;font-weight:600;color:var(--text)">'
      +'<input type="checkbox" data-id="'+p.id+'" '+(p.visible?'checked':'')
      +' style="width:17px;height:17px;accent-color:var(--accent);cursor:pointer"> '+p.label+'</label>';
  }).join('');
  var ov=_cpModal('_cf-settings-modal',
    '<div style="background:var(--surface);width:min(400px,93vw);border-radius:20px;padding:26px;box-shadow:0 24px 80px rgba(0,0,0,.5);max-height:85vh;overflow-y:auto">'
    +'<div style="font-size:16px;font-weight:900;text-align:center;margin-bottom:6px;color:var(--text)"><i class="fa-solid fa-sliders" style="color:var(--accent)"></i> تخصيص حقول فورم العميل</div>'
    +'<div style="font-size:12px;color:var(--text3);text-align:center;margin-bottom:18px">اختر الحقول اللي عايزها تظهر</div>'
    +rows
    +'<div style="display:flex;gap:10px;margin-top:18px">'
    +'<button id="_cf-save" class="btn btn-primary" style="flex:1"><i class="fa-solid fa-check"></i> حفظ</button>'
    +'<button id="_cf-cancel" class="btn btn-ghost" style="flex:1">إلغاء</button>'
    +'</div></div>');
  document.getElementById('_cf-save').onclick=function(){
    var map={};ov.querySelectorAll('input[data-id]').forEach(function(cb){map[cb.dataset.id]=cb.checked;});
    _cpSave('_cfPrefs',map);ov.remove();_wrapClientFormSections();_applyCFPrefs();
    if(typeof showMiniNotif==='function')showMiniNotif('<i class="fa-solid fa-sliders" style="color:var(--accent)"></i> تم تحديث إعدادات فورم العميل');
  };
  document.getElementById('_cf-cancel').onclick=function(){ov.remove();};
}

// ══ SECTION 3: تخصيص صفحة المالية ══

var _FIN_SECTIONS=[
  {id:'fin-summary-cards',    label:'بطاقات الملخص'},
  {id:'fin-unpaid-reminders', label:'تذكيرات المبالغ غير المحصّلة'},
  {id:'fin-loans-summary',    label:'ملخص القروض'},
  {id:'fin-monthly-timeline', label:'سجل الشهور'},
  {id:'fin-tab-transactions', label:'تاب: المعاملات'},
  {id:'fin-tab-wallets',      label:'تاب: المحافظ'},
  {id:'fin-tab-budgets',      label:'تاب: الميزانيات'},
  {id:'fin-tab-loans',        label:'تاب: القروض'},
  {id:'fin-tab-stats',        label:'تاب: الإحصائيات'},
];

function _getFinPrefs(){
  var saved=_cpLoad('_finPrefs',{});
  return _FIN_SECTIONS.map(function(f){return{id:f.id,label:f.label,visible:saved[f.id]!==false};});
}

function _applyFinPrefs(){
  _getFinPrefs().forEach(function(p){var el=document.getElementById(p.id);if(el)el.style.display=p.visible?'':'none';});
}

function _openFinSettings(){
  var prefs=_getFinPrefs();
  var rows=prefs.map(function(p){
    return '<label style="display:flex;align-items:center;gap:10px;padding:10px 13px;border-radius:11px;background:var(--surface2);margin-bottom:6px;cursor:pointer;font-size:13px;font-weight:600;color:var(--text)">'
      +'<input type="checkbox" data-id="'+p.id+'" '+(p.visible?'checked':'')
      +' style="width:17px;height:17px;accent-color:var(--accent);cursor:pointer"> '+p.label+'</label>';
  }).join('');
  var ov=_cpModal('_fin-settings-modal',
    '<div style="background:var(--surface);width:min(400px,93vw);border-radius:20px;padding:26px;box-shadow:0 24px 80px rgba(0,0,0,.5);max-height:85vh;overflow-y:auto">'
    +'<div style="font-size:16px;font-weight:900;text-align:center;margin-bottom:6px;color:var(--text)"><i class="fa-solid fa-sliders" style="color:var(--accent)"></i> تخصيص صفحة المالية</div>'
    +'<div style="font-size:12px;color:var(--text3);text-align:center;margin-bottom:18px">اختر الأقسام اللي عايزها تظهر</div>'
    +rows
    +'<div style="display:flex;gap:10px;margin-top:18px">'
    +'<button id="_fin-save" class="btn btn-primary" style="flex:1"><i class="fa-solid fa-check"></i> حفظ</button>'
    +'<button id="_fin-cancel" class="btn btn-ghost" style="flex:1">إلغاء</button>'
    +'</div></div>');
  document.getElementById('_fin-save').onclick=function(){
    var map={};ov.querySelectorAll('input[data-id]').forEach(function(cb){map[cb.dataset.id]=cb.checked;});
    _cpSave('_finPrefs',map);ov.remove();_applyFinPrefs();
    if(typeof showMiniNotif==='function')showMiniNotif('<i class="fa-solid fa-sliders" style="color:var(--accent)"></i> تم تحديث إعدادات المالية');
  };
  document.getElementById('_fin-cancel').onclick=function(){ov.remove();};
}

// ══ SECTION 4: صفحة المهام - عرض افتراضي ══

var _TASKS_VIEW_KEY='_tasksDefaultView';

function _openTasksPageSettings(){
  var cur=localStorage.getItem(_TASKS_VIEW_KEY)||'kanban';
  var mkOpt=function(val,icon,label){
    var a=cur===val;
    return '<label style="flex:1;display:flex;align-items:center;justify-content:center;gap:7px;padding:12px;border-radius:10px;cursor:pointer;border:2px solid '+(a?'var(--accent)':'var(--border)')+';background:'+(a?'rgba(124,111,247,.12)':'none')+';font-size:13px;font-weight:700;color:'+(a?'var(--accent)':'var(--text2)')+'">'
      +'<input type="radio" name="_tpv" value="'+val+'" '+(a?'checked':'')
      +' style="display:none"><i class="fa-solid '+icon+'"></i> '+label+'</label>';
  };
  var ov=_cpModal('_tasks-page-settings-modal',
    '<div style="background:var(--surface);width:min(360px,93vw);border-radius:20px;padding:26px;box-shadow:0 24px 80px rgba(0,0,0,.5)">'
    +'<div style="font-size:16px;font-weight:900;text-align:center;margin-bottom:6px;color:var(--text)"><i class="fa-solid fa-sliders" style="color:var(--accent)"></i> تخصيص صفحة المهام</div>'
    +'<div style="font-size:12px;color:var(--text3);text-align:center;margin-bottom:18px">اختار العرض الافتراضي</div>'
    +'<div style="display:flex;gap:10px;margin-bottom:20px">'
    +mkOpt('kanban','clipboard-list','كانبان')
    +mkOpt('list','table-list','قائمة')
    +'</div>'
    +'<div style="display:flex;gap:10px">'
    +'<button id="_tp-save" class="btn btn-primary" style="flex:1"><i class="fa-solid fa-check"></i> حفظ</button>'
    +'<button id="_tp-cancel" class="btn btn-ghost" style="flex:1">إلغاء</button>'
    +'</div></div>');
  ov.querySelectorAll('input[name="_tpv"]').forEach(function(r){
    r.addEventListener('change',function(){
      ov.querySelectorAll('label').forEach(function(lbl){
        var rd=lbl.querySelector('input[type=radio]');if(!rd)return;
        lbl.style.borderColor=rd.checked?'var(--accent)':'var(--border)';
        lbl.style.background=rd.checked?'rgba(124,111,247,.12)':'none';
        lbl.style.color=rd.checked?'var(--accent)':'var(--text2)';
      });
    });
  });
  document.getElementById('_tp-save').onclick=function(){
    var sel=(ov.querySelector('input[name="_tpv"]:checked')||{}).value||'kanban';
    localStorage.setItem(_TASKS_VIEW_KEY,sel);ov.remove();
    if(typeof switchTaskView==='function')switchTaskView(sel);
    if(typeof showMiniNotif==='function')showMiniNotif('<i class="fa-solid fa-sliders" style="color:var(--accent)"></i> تم تحديث العرض الافتراضي');
  };
  document.getElementById('_tp-cancel').onclick=function(){ov.remove();};
}

// ══ SECTION 5: مهمة شخصية vs مهمة لعميل ══

var _currentTaskKind='client';

function _setTaskKind(kind){
  _currentTaskKind=kind;
  var ip=kind==='personal';
  var cb=document.getElementById('_tt-client-btn');
  var pb=document.getElementById('_tt-personal-btn');
  if(cb){cb.style.background=!ip?'var(--accent)':'transparent';cb.style.color=!ip?'#fff':'var(--text3)';}
  if(pb){pb.style.background=ip?'var(--accent)':'transparent';pb.style.color=ip?'#fff':'var(--text3)';}
  ['t-client-group-wrap','t-type-row-wrap','t-value-row','t-worker-section','task-inv-opt'].forEach(function(id){
    var el=document.getElementById(id);if(el)el.style.display=ip?'none':'';
  });
  var dep=document.getElementById('deposit-row');if(dep)dep.style.display='none';
  var ttl=document.getElementById('task-modal-ttl');
  var eid=(document.getElementById('task-eid')||{}).value;
  if(ttl&&!eid)ttl.innerHTML=ip?'<i class="fa-solid fa-person"></i> مهمة شخصية جديدة':'<i class="fa-solid fa-star-of-life"></i> مهمة / مشروع جديد';
  if(ip){var s2=document.getElementById('t-client');if(s2)s2._cpPrev=s2.value;_ensurePersonalClient();}
  else{var s3=document.getElementById('t-client');if(s3&&s3._cpPrev!=null)s3.value=s3._cpPrev;}
}

function _ensurePersonalClient(){
  if(!window.S)return;
  var pc=(S.clients||[]).find(function(c){return c._isPersonal;});
  if(!pc){
    pc={id:'_personal_'+Date.now(),name:'شخصي',_isPersonal:true,type:'فرد',phone:'',email:'',notes:'مهام شخصية'};
    if(!S.clients)S.clients=[];S.clients.push(pc);
    if(typeof fillDD==='function')fillDD('t-client');
  }
  var sel=document.getElementById('t-client');if(sel)sel.value=pc.name;
}

// الـ _tf-gear و _tt-kind-bar موجودين في HTML مباشرة — لا حاجة للـ injection
function _injectTaskModalControls(){
  // no-op: elements are in HTML
}

(function(){
  // الأزرار والبار موجودين في HTML — بس نشغّل _setTaskKind و _applyTFPrefs لما الموديال يتفتح
  var modalOv=document.getElementById('modal-task');if(!modalOv)return;
  var _prev='none';
  new MutationObserver(function(){
    var cur=modalOv.style.display||'';
    if(cur!=='none'&&_prev==='none'){
      _prev=cur;
      setTimeout(function(){
        _wrapTaskFormSections();
        var eid=(document.getElementById('task-eid')||{}).value||'';
        if(eid){
          var t=window.S&&S.tasks&&S.tasks.find(function(x){return String(x.id)===String(eid);});
          _setTaskKind(t&&t._isPersonal?'personal':'client');
        } else {
          _setTaskKind('client');
        }
        _applyTFPrefs();
      },60);
    } else if(cur==='none'){
      _prev='none';
    }
  }).observe(modalOv,{attributes:true,attributeFilter:['style']});
})();

// saveTask patch — الآن _beforeSaveTask بيعمل الحجز قبل الضغط، مش محتاج هنا
// بس نحتفظ بـ tag المهمة الشخصية بعد الحفظ
setTimeout(function(){
  var _orig=window.saveTask;if(!_orig)return;
  window.saveTask=function(){
    // تأكد إضافي — لو شخصي وما فيش عميل
    if(_currentTaskKind==='personal'){
      var _S=(typeof S!=='undefined')?S:null;
      if(_S){
        if(!_S.clients) _S.clients=[];
        var _pc=_S.clients.find(function(c){return c._isPersonal;});
        if(!_pc){ _pc={id:'_personal_'+Date.now(),name:'شخصي',_isPersonal:true,type:'فرد',phone:'',email:''}; _S.clients.push(_pc); if(typeof fillDD==='function') fillDD('t-client'); }
        var _sel=document.getElementById('t-client'); if(_sel&&!_sel.value) _sel.value=_pc.name;
      }
    }
    _orig.apply(this,arguments);
    // tag المهمة الشخصية بعد الحفظ
    if(_currentTaskKind==='personal'){
      var _S2=(typeof S!=='undefined')?S:null;
      if(_S2&&_S2.tasks&&_S2.tasks.length) _S2.tasks[_S2.tasks.length-1]._isPersonal=true;
    }
  };
},1200);

// ══ SECTION 6: أزرار الترس في الصفحات ══

function _injectPageGears(){
  // _cf-gear موجود في HTML مباشرة
  if(!document.getElementById('_fin-gear')){
    var finBtns=document.querySelector('#page-finance .page-header > div:last-child');
    if(finBtns){
      var g3=document.createElement('button');
      g3.id='_fin-gear';g3.className='btn btn-ghost';g3.title='تخصيص صفحة المالية';
      g3.style.cssText='width:38px;height:38px;padding:0;display:flex;align-items:center;justify-content:center;border-radius:10px';
      g3.innerHTML='<i class="fa-solid fa-sliders"></i>';
      g3.onclick=function(){_openFinSettings();};
      finBtns.appendChild(g3);
    }
  }
  if(!document.getElementById('_tasks-gear')){
    var viewWrap=document.querySelector('#tasks-scope-tabs > div:last-child');
    if(viewWrap){
      var g4=document.createElement('button');
      g4.id='_tasks-gear';g4.title='تخصيص صفحة المهام';
      g4.style.cssText='width:32px;height:32px;border-radius:7px;border:none;background:transparent;color:var(--text3);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:13px;transition:.18s';
      g4.innerHTML='<i class="fa-solid fa-sliders"></i>';
      g4.onmouseover=function(){this.style.color='var(--accent)';this.style.background='rgba(124,111,247,.15)';};
      g4.onmouseout=function(){this.style.color='var(--text3)';this.style.background='transparent';};
      g4.onclick=function(e){e.stopPropagation();_openTasksPageSettings();};
      viewWrap.appendChild(g4);
    }
  }
}

// ══ SECTION 7: Wrappers ══

function _wrapEl(el,wrapId){
  if(!el||document.getElementById(wrapId))return;
  var w=document.createElement('div');w.id=wrapId;
  el.parentNode.insertBefore(w,el);w.appendChild(el);
}

function _wrapTaskFormSections(){
  var modal=document.getElementById('modal-task');if(!modal)return;
  if(!document.getElementById('t-client-group-wrap')){
    var cs=document.getElementById('t-client');
    if(cs){var cg=cs.closest('.form-group');if(cg)_wrapEl(cg,'t-client-group-wrap');}
  }
  var jt=document.getElementById('t-jobtype');if(jt)_wrapEl(jt.closest('.form-row'),'t-type-row-wrap');
  var od=document.getElementById('t-order');if(od)_wrapEl(od.closest('.form-row'),'t-dates-row-wrap');
  var pr=document.getElementById('t-priority');if(pr)_wrapEl(pr.closest('.form-row'),'t-priority-row-wrap');
  var nt=document.getElementById('t-notes');if(nt)_wrapEl(nt.closest('.form-group'),'t-notes-row-wrap');
  var sl=document.getElementById('t-steps-list');
  if(sl){var sp=sl.parentNode;while(sp&&sp.tagName!=='DIV')sp=sp.parentNode;_wrapEl(sp||sl.parentNode,'t-steps-section-wrap');}
  var be=document.getElementById('t-brief-editor');if(be)_wrapEl(be.closest('.form-group'),'t-brief-section-wrap');
}

function _wrapClientFormSections(){
  var modal=document.getElementById('modal-client');if(!modal)return;
  var ctype=document.getElementById('c-type');if(ctype)_wrapEl(ctype.closest('.form-row'),'cf-type-phone-wrap');
  var cch=document.getElementById('c-channel');if(cch)_wrapEl(cch.closest('.form-row'),'cf-channel-field-wrap');
  var cwt=document.getElementById('c-worktype');if(cwt)_wrapEl(cwt.closest('.form-row'),'cf-worktype-wrap');
  var cn=document.getElementById('c-notes');if(cn)_wrapEl(cn.closest('.form-group'),'cf-notes-wrap');
  var cob=document.getElementById('c-opening-balance');
  if(cob){var obSec=cob.closest('div[style*="rgba(79,209"]')||cob.parentNode.parentNode;_wrapEl(obSec,'cf-opening-bal-wrap');}
  var cdna=document.getElementById('c-dna-style');
  if(cdna){var dnaSec=cdna.closest('div[style*="rgba(247,201"]')||cdna.parentNode.parentNode;_wrapEl(dnaSec,'cf-dna-wrap');}
  var csoc=document.getElementById('c-socials-list');
  if(csoc){var socSec=csoc.closest('div[style*="rgba(124,111"]')||csoc.parentNode.parentNode;_wrapEl(socSec,'cf-socials-wrap');}
  var cfu=document.getElementById('c-followup-enabled');
  if(cfu){var fuSec=cfu.closest('div[style*="rgba(247,201,.06"]')||cfu.closest('div[style*="rgba(247,201"]')||cfu.parentNode.parentNode;_wrapEl(fuSec,'cf-followup-wrap');}
}

// ══ SECTION 8: Sort + Inline Edit في جدول المهام ══

var _tableSort=_cpLoad('_taskTableSort',{col:'deadline',dir:'asc'});

function _patchTasksTable(){
  var _orig=window._renderTasksTable;if(!_orig||window._renderTasksTable._patched)return;
  window._renderTasksTable=function(){
    _orig.apply(this,arguments);
    setTimeout(function(){_injectTableSortBar();_injectTableInlineEdits();},40);
  };
  window._renderTasksTable._patched=true;
  setTimeout(function(){_injectTableSortBar();_injectTableInlineEdits();},300);
}

function _injectTableSortBar(){
  var tableView=document.getElementById('table-view');if(!tableView)return;
  if(document.getElementById('_sort-bar'))return;
  var bar=document.createElement('div');
  bar.id='_sort-bar';
  bar.style.cssText='display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:10px;margin-bottom:8px;font-size:12px;flex-wrap:wrap';
  bar.innerHTML='<span style="color:var(--text3);font-weight:700;white-space:nowrap"><i class="fa-solid fa-arrow-up-wide-short"></i> ترتيب حسب:</span>'
    +'<button onclick="_quickSort(\'deadline\')" class="btn btn-ghost btn-sm" style="font-size:11px;padding:4px 10px">📅 التسليم</button>'
    +'<button onclick="_quickSort(\'orderDate\')" class="btn btn-ghost btn-sm" style="font-size:11px;padding:4px 10px">📋 الطلب</button>'
    +'<button onclick="_quickSort(\'priority\')" class="btn btn-ghost btn-sm" style="font-size:11px;padding:4px 10px">🔴 الأولوية</button>'
    +'<button onclick="_quickSort(\'client\')" class="btn btn-ghost btn-sm" style="font-size:11px;padding:4px 10px">👤 العميل</button>'
    +'<button onclick="_quickSort(\'status\')" class="btn btn-ghost btn-sm" style="font-size:11px;padding:4px 10px">🏷 الحالة</button>'
    +'<span id="_sort-label" style="color:var(--accent);font-weight:700;margin-right:auto;font-size:11px"></span>';
  var tbl=tableView.querySelector('table');
  if(tbl && tbl.parentNode===tableView) tableView.insertBefore(bar,tbl);
  else tableView.prepend(bar);
  _updateSortLabel();
}

function _quickSort(col){
  if(_tableSort.col===col)_tableSort.dir=_tableSort.dir==='asc'?'desc':'asc';
  else{_tableSort.col=col;_tableSort.dir='asc';}
  _cpSave('_taskTableSort',_tableSort);
  _doSortTable();
}

function _updateSortLabel(){
  var lbl=document.getElementById('_sort-label');if(!lbl)return;
  var names={deadline:'التسليم',orderDate:'الطلب',priority:'الأولوية',client:'العميل',status:'الحالة'};
  lbl.textContent=(names[_tableSort.col]||_tableSort.col)+(_tableSort.dir==='asc'?' ↑':' ↓');
}

function _doSortTable(){
  var tbody=document.getElementById('tasks-table-body');if(!tbody)return;
  var rows=Array.from(tbody.querySelectorAll('tr.tt-row'));
  var priMap={high:0,med:1,low:2};
  var stMap={progress:0,review:1,new:2,paused:3,done:4};
  rows.sort(function(a,b){
    var ta=window.S&&S.tasks&&S.tasks.find(function(t){return String(t.id)===a.dataset.tid;});
    var tb2=window.S&&S.tasks&&S.tasks.find(function(t){return String(t.id)===b.dataset.tid;});
    if(!ta||!tb2)return 0;
    var col=_tableSort.col;var dir=_tableSort.dir==='asc'?1:-1;
    var va,vb;
    if(col==='deadline'||col==='orderDate'){va=ta[col]||'9999';vb=tb2[col]||'9999';}
    else if(col==='priority'){va=(priMap[ta.priority] ?? 2);vb=(priMap[tb2.priority] ?? 2);}
    else if(col==='status'){va=(stMap[ta.status] ?? 3);vb=(stMap[tb2.status] ?? 3);}
    else{va=(ta[col]||'').toLowerCase();vb=(tb2[col]||'').toLowerCase();}
    return va<vb?-dir:va>vb?dir:0;
  });
  rows.forEach(function(r){
    tbody.appendChild(r);
    var sr=document.getElementById('steps-row-'+r.dataset.tid);if(sr)tbody.appendChild(sr);
  });
  _updateSortLabel();
}

function _injectTableInlineEdits(){
  var tbody=document.getElementById('tasks-table-body');if(!tbody||tbody.dataset.inlineOk)return;
  tbody.dataset.inlineOk='1';
  tbody.addEventListener('click',function(e){
    if(e.target.tagName==='SELECT'||e.target.closest('button')||e.target.tagName==='INPUT')return;
    var td=e.target.closest('td');if(!td)return;
    var tr=td.closest('tr.tt-row');if(!tr)return;
    var tid=tr.dataset.tid;if(!tid)return;
    var t=window.S&&S.tasks&&S.tasks.find(function(x){return String(x.id)===String(tid);});
    if(!t||td.dataset.editing)return;

    // اعرف إيه الخلية دي من رأس الجدول
    var allTds=Array.from(tr.children);
    var colIdx=allTds.indexOf(td);
    var thead=document.getElementById('tasks-table-thead');
    var thEl=thead?thead.querySelectorAll('th')[colIdx]:null;
    var colName=thEl?(thEl.textContent||'').replace(/[↑↓↕\s]/g,'').trim():'';

    function _mkInput(type,val,onSave){
      td.dataset.editing='1';
      var inp=document.createElement('input');
      inp.type=type;inp.value=val||'';
      inp.style.cssText='width:100%;border:1.5px solid var(--accent);background:var(--surface3);color:var(--text);border-radius:7px;padding:5px 8px;font-size:11px;outline:none;font-family:var(--font)';
      td.innerHTML='';td.appendChild(inp);inp.focus();
      function done(){delete td.dataset.editing;onSave(inp.value);}
      inp.addEventListener('change',done);inp.addEventListener('blur',done);
      e.stopPropagation();
    }

    function _mkSelect(options,curVal,onSave){
      td.dataset.editing='1';
      var sel=document.createElement('select');
      sel.style.cssText='border:1.5px solid var(--accent);background:var(--surface3);color:var(--text);border-radius:7px;padding:5px 8px;font-size:11px;outline:none;cursor:pointer;font-family:var(--font)';
      options.forEach(function(o){var opt=document.createElement('option');opt.value=o[0];opt.textContent=o[1];if(curVal===o[0])opt.selected=true;sel.appendChild(opt);});
      td.innerHTML='';td.appendChild(sel);sel.focus();
      function done(){delete td.dataset.editing;onSave(sel.value);}
      sel.addEventListener('change',done);sel.addEventListener('blur',done);
      e.stopPropagation();
    }

    function _save(){if(typeof lsSave==='function')lsSave();if(typeof cloudSave==='function')cloudSave(window.S);if(typeof _renderTasksTable==='function')_renderTasksTable();}

    if(colName==='تاريخ التسليم'){_mkInput('date',t.deadline,function(v){t.deadline=v;_save();});}
    else if(colName==='تاريخ الطلب'){_mkInput('date',t.orderDate,function(v){t.orderDate=v;_save();});}
    else if(colName==='الأولوية'){_mkSelect([['high','عالية — عاجل'],['med','متوسطة'],['low','منخفضة']],t.priority,function(v){t.priority=v;_save();});}
    else if(colName==='العميل'){
      var opts=(window.S&&S.clients||[]).filter(function(c){return!c._isPersonal;}).map(function(c){return[c.name,c.name];});
      _mkSelect(opts,t.client,function(v){if(v)t.client=v;_save();});
    }
  });
}

// ══ SECTION 9: التهيئة ══

function _cpInit(){
  _wrapTaskFormSections();
  _wrapClientFormSections();
  _injectPageGears();
  _applyFinPrefs();
  _applyCFPrefs();
  var dv=localStorage.getItem(_TASKS_VIEW_KEY)||'kanban';
  var pg=document.querySelector('.page.active');
  if(pg&&pg.id==='page-tasks'&&typeof switchTaskView==='function')switchTaskView(dv);
  _patchTasksTable();
}

var _origShowPage=window.showPage;
if(_origShowPage){
  window.showPage=function(id){
    _origShowPage.apply(this,arguments);
    setTimeout(function(){
      _injectPageGears();
      if(id==='finance')_applyFinPrefs();
      if(id==='tasks'){
        var dv=localStorage.getItem(_TASKS_VIEW_KEY)||'kanban';
        if(typeof switchTaskView==='function')switchTaskView(dv);
        _patchTasksTable();
        setTimeout(function(){_injectTableSortBar();_injectTableInlineEdits();},400);
      }
    },150);
  };
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(_cpInit,700);});
else setTimeout(_cpInit,700);

console.log('[CP v3] loaded');

// ── _beforeSaveTask: يحط العميل الوهمي قبل saveTask يشتغل ──
function _beforeSaveTask(){
  if(typeof _currentTaskKind === 'undefined' || _currentTaskKind !== 'personal') return;
  // تأكد إن S موجود
  var _S = (typeof S !== 'undefined') ? S : null;
  if(!_S) return;
  if(!_S.clients) _S.clients = [];
  var pc = _S.clients.find(function(c){ return c._isPersonal; });
  if(!pc){
    pc = {id:'_personal_'+Date.now(), name:'شخصي', _isPersonal:true, type:'فرد', phone:'', email:''};
    _S.clients.push(pc);
    if(typeof fillDD === 'function') fillDD('t-client');
  }
  // ضع قيمة العميل في الـ select قبل saveTask
  var sel = document.getElementById('t-client');
  if(sel) sel.value = pc.name;
}

try{ if(window.OrdoPlugins) window.OrdoPlugins.register('customization', function(){}); }catch(e){}

/* ===== END CUSTOMIZATION PATCH ===== */


/* ===== BEGIN TEAM ROLES PATCH (team_roles_patch.js) ===== */
// ════════════════════════════════════════════════════════════════════════
// ORDO — TEAM ROLES & MEMBER PORTAL SYSTEM
// team_roles_patch.js
// ════════════════════════════════════════════════════════════════════════
//
// يضيف:
// 1. معالج اختيار نوع مساحة العمل (فريلانسر / شركة / الاثنين)
// 2. نظام أدوار موسّع للشركات (مدير مشروع، أكونت مانجر، موظف)
// 3. بوابة الأعضاء — لوحة تحكم مخصصة لكل دور
// 4. تفويض المهام بدون بيانات العميل
// 5. تتبع مدفوعات الأعضاء (عربون + أجر لكل مهمة)
// 6. تنبيهات الميزانية المرئية
//
// طريقة الاستخدام:
//   أضف هذا الملف في index.html بعد ordo_integration_layer.js:
//   <script src="team_roles_patch.js"></script>
// ════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ══════════════════════════════════════════════════
  // SECTION 1 — CONSTANTS & ROLE DEFINITIONS
  // ══════════════════════════════════════════════════

  var WORKSPACE_TYPES = {
    freelancer_team: {
      label: 'فريلانسر + فريق صغير',
      icon: '🎨',
      desc: 'أعمل بشكل مستقل وعندي فريق مساعد صغير'
    },
    company: {
      label: 'شركة أو وكالة',
      icon: '🏢',
      desc: 'شركة بها موظفين وأقسام ومشاريع متعددة'
    },
    both: {
      label: 'الاثنين',
      icon: '⚡',
      desc: 'أعمل كفريلانسر وأدير شركة أيضاً'
    }
  };

  var COMPANY_ROLES = {
    owner: {
      label: 'مالك',
      icon: '👑',
      color: '#7c6ff7',
      permissions: ['all'],
      desc: 'صلاحية كاملة على كل شيء'
    },
    project_manager: {
      label: 'مدير مشروع',
      icon: '📋',
      color: '#64b5f6',
      permissions: ['projects', 'tasks', 'team_tasks', 'reports'],
      desc: 'يدير المشاريع والمهام والفريق المُعيَّن'
    },
    account_manager: {
      label: 'أكونت مانجر',
      icon: '🤝',
      color: '#4fd1a5',
      permissions: ['clients', 'proposals', 'invoices', 'contracts'],
      desc: 'يتعامل مع العملاء وعروض الأسعار والفواتير'
    },
    employee: {
      label: 'موظف',
      icon: '👤',
      color: '#f7c948',
      permissions: ['department_tasks', 'own_tasks'],
      desc: 'يرى مهام قسمه ومهامه الشخصية فقط'
    },
    viewer: {
      label: 'مشاهد',
      icon: '👁',
      color: '#8080a0',
      permissions: ['view'],
      desc: 'مشاهدة فقط — لا يمكنه التعديل'
    }
  };

  // ══════════════════════════════════════════════════
  // SECTION 2 — UTILITIES
  // ══════════════════════════════════════════════════

  function _esc(s) {
    if (!s && s !== 0) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _toast(msg) {
    try {
      if (typeof window.toast === 'function') window.toast(msg);
    } catch (e) {}
  }

  function _save() {
    try { if (typeof window.lsSave === 'function') window.lsSave(); } catch (e) {}
    try { if (typeof window.cloudSave === 'function') window.cloudSave(window.S); } catch (e) {}
  }

  function _fmtDate(d) {
    if (!d) return '';
    try {
      return new Date(d).toLocaleDateString('ar-EG', {
        year: 'numeric', month: 'short', day: 'numeric'
      });
    } catch (e) { return d; }
  }

  // ══════════════════════════════════════════════════
  // SECTION 3 — WORKSPACE SETUP WIZARD
  // ══════════════════════════════════════════════════

  function _shouldShowWizard() {
    if (!window.S) return false;
    var settings = window.S.settings || {};
    return !settings.workspace_type &&
           !localStorage.getItem('_ordo_workspace_wizard_done');
  }

  function showWorkspaceWizard() {
    if (document.getElementById('_workspace-wizard')) return;

    var ov = document.createElement('div');
    ov.id = '_workspace-wizard';
    ov.style.cssText = [
      'position:fixed;inset:0;background:rgba(0,0,0,.8)',
      'display:flex;align-items:center;justify-content:center',
      'z-index:999999;padding:16px;font-family:Cairo,sans-serif;direction:rtl'
    ].join(';');

    var optionsHTML = Object.keys(WORKSPACE_TYPES).map(function (key) {
      var t = WORKSPACE_TYPES[key];
      return '<div class="_ws-option" data-type="' + key + '" onclick="window._selectWorkspaceType(\'' + key + '\')" style="' +
        'padding:14px 18px;border-radius:14px;border:2px solid var(--border,rgba(124,111,247,.2));' +
        'cursor:pointer;transition:.15s;display:flex;align-items:center;gap:14px;' +
        'background:var(--surface2,rgba(255,255,255,.03))">' +
        '<div style="font-size:28px;flex-shrink:0">' + t.icon + '</div>' +
        '<div style="flex:1">' +
          '<div style="font-size:14px;font-weight:800;color:var(--text,#e8e8f4)">' + t.label + '</div>' +
          '<div style="font-size:11px;color:var(--text3,#8080a0);margin-top:2px">' + t.desc + '</div>' +
        '</div>' +
        '<div class="_ws-check" style="width:20px;height:20px;border-radius:50%;border:2px solid var(--border);' +
          'display:flex;align-items:center;justify-content:center;flex-shrink:0">' +
          '<i class="fa-solid fa-check" style="font-size:10px;display:none;color:#fff"></i>' +
        '</div>' +
        '</div>';
    }).join('');

    ov.innerHTML =
      '<div style="background:var(--surface,#111121);border:1px solid rgba(124,111,247,.25);' +
        'border-radius:24px;padding:32px;width:min(480px,95vw);box-shadow:0 30px 80px rgba(0,0,0,.6)">' +
        '<div style="text-align:center;margin-bottom:28px">' +
          '<div style="font-size:42px;margin-bottom:12px">🚀</div>' +
          '<div style="font-size:20px;font-weight:900;color:var(--text,#e8e8f4);margin-bottom:8px">مرحباً في Ordo</div>' +
          '<div style="font-size:13px;color:var(--text3,#8080a0);line-height:1.7">' +
            'اختر نوع مساحة عملك لنخصّص لك التجربة المناسبة' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:24px">' +
          optionsHTML +
        '</div>' +
        '<button id="_ws-confirm-btn" onclick="window._confirmWorkspaceType()" style="' +
          'width:100%;padding:14px;background:var(--accent,#7c6ff7);color:#fff;border:none;' +
          'border-radius:12px;font-family:Cairo,sans-serif;font-size:15px;font-weight:800;' +
          'cursor:pointer;opacity:.4;transition:.2s" disabled>' +
          '<i class="fa-solid fa-check"></i> ابدأ مع Ordo' +
        '</button>' +
        '<div style="text-align:center;margin-top:10px">' +
          '<button onclick="window._skipWorkspaceWizard()" style="' +
            'background:none;border:none;color:var(--text3,#8080a0);' +
            'font-family:Cairo,sans-serif;font-size:11px;cursor:pointer;text-decoration:underline">' +
            'تخطي — سأختار لاحقاً من الإعدادات' +
          '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(ov);
  }

  var _selectedWorkspaceType = null;

  window._selectWorkspaceType = function (type) {
    _selectedWorkspaceType = type;
    document.querySelectorAll('._ws-option').forEach(function (el) {
      var isSelected = el.dataset.type === type;
      el.style.border = isSelected
        ? '2px solid var(--accent,#7c6ff7)'
        : '2px solid var(--border,rgba(124,111,247,.2))';
      el.style.background = isSelected
        ? 'rgba(124,111,247,.08)'
        : 'var(--surface2,rgba(255,255,255,.03))';
      var check = el.querySelector('._ws-check');
      if (check) {
        check.style.background = isSelected ? 'var(--accent,#7c6ff7)' : 'transparent';
        check.style.border = isSelected
          ? '2px solid var(--accent,#7c6ff7)'
          : '2px solid var(--border)';
        var icon = check.querySelector('i');
        if (icon) icon.style.display = isSelected ? '' : 'none';
      }
    });
    var btn = document.getElementById('_ws-confirm-btn');
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
  };

  window._confirmWorkspaceType = function () {
    if (!_selectedWorkspaceType) return;

    if (!window.S) window.S = {};
    if (!window.S.settings) window.S.settings = {};

    window.S.settings.workspace_type = _selectedWorkspaceType;

    if (_selectedWorkspaceType === 'freelancer_team') {
      window.S.settings.workspace_mode = 'freelancer';
    } else {
      window.S.settings.workspace_mode = 'company';
    }

    _save();
    localStorage.setItem('_ordo_workspace_wizard_done', '1');
    document.getElementById('_workspace-wizard').remove();

    var t = WORKSPACE_TYPES[_selectedWorkspaceType];
    _toast('<i class="fa-solid fa-check" style="color:var(--accent3)"></i> تم تحديد نوع مساحة العمل: ' + (t ? t.label : ''));

    if (typeof window.syncAdminSectionsWithModes === 'function') {
      window.syncAdminSectionsWithModes();
    }

    _addWorkspaceBadge();
  };

  window._skipWorkspaceWizard = function () {
    localStorage.setItem('_ordo_workspace_wizard_done', '1');
    document.getElementById('_workspace-wizard').remove();
  };

  // ══════════════════════════════════════════════════
  // SECTION 4 — WORKSPACE BADGE
  // ══════════════════════════════════════════════════

  function _addWorkspaceBadge() {
    if (!window.S) return;
    var type = (window.S.settings || {}).workspace_type;
    if (!type || !WORKSPACE_TYPES[type]) return;

    var existing = document.getElementById('_ws-badge');
    if (existing) existing.remove();

    var badge = document.createElement('div');
    badge.id = '_ws-badge';
    var t = WORKSPACE_TYPES[type];
    badge.style.cssText = [
      'position:fixed;bottom:20px;right:20px',
      'background:var(--surface2,rgba(255,255,255,.05))',
      'border:1px solid var(--border,rgba(255,255,255,.08))',
      'border-radius:20px;padding:6px 14px',
      'font-size:11px;color:var(--text3,#8080a0)',
      'display:flex;align-items:center;gap:6px',
      'z-index:999;cursor:pointer;font-family:Cairo,sans-serif;direction:rtl',
      'box-shadow:0 4px 12px rgba(0,0,0,.2)'
    ].join(';');
    badge.innerHTML = '<span>' + t.icon + '</span><span>' + _esc(t.label) + '</span>';
    badge.title = 'اضغط لتغيير نوع مساحة العمل';
    badge.onclick = function () {
      localStorage.removeItem('_ordo_workspace_wizard_done');
      _selectedWorkspaceType = null;
      showWorkspaceWizard();
    };
    document.body.appendChild(badge);
  }

  // ══════════════════════════════════════════════════
  // SECTION 5 — MEMBER PORTAL DETECTION
  // ══════════════════════════════════════════════════

  async function _detectMemberPortal() {
    var teamsRaw = localStorage.getItem('ordo_teams_v2');
    if (!teamsRaw) return false;

    try {
      var ts = JSON.parse(teamsRaw);
      var teams = ts.teams || [];
      if (!teams.length) return false;

      var currentEmail = '';
      var currentSupaId = '';

      if (typeof supa !== 'undefined') {
        try {
          var res = await supa.auth.getSession();
          var user = res.data && res.data.session && res.data.session.user;
          if (user) {
            currentEmail = (user.email || '').toLowerCase();
            currentSupaId = user.id || '';
          }
        } catch (e) {}
      }

      if (!currentEmail) return false;

      var memberInfo = null;
      var myTeams = [];

      teams.forEach(function (team) {
        var member = (team.members || []).find(function (m) {
          return (m.email || '').toLowerCase() === currentEmail;
        });
        if (member) {
          // Check if this user is also the owner
          var isOwner = ts.me && ts.me.supaId && ts.me.supaId === currentSupaId;
          if (!isOwner) {
            myTeams.push({ team: team, member: member });
            if (!memberInfo) memberInfo = { team: team, member: member, teams: teams, myTeams: myTeams };
          }
        }
      });

      if (memberInfo) {
        memberInfo.myTeams = myTeams;
        return memberInfo;
      }
    } catch (e) {}

    return false;
  }

  // ══════════════════════════════════════════════════
  // SECTION 6 — SYNC MEMBER DATA FROM CLOUD
  // ══════════════════════════════════════════════════

  async function _syncMemberDataFromCloud() {
    if (typeof supa === 'undefined') return;
    try {
      var res = await supa.auth.getSession();
      var user = res.data && res.data.session && res.data.session.user;
      if (!user) return;

      var email = (user.email || '').toLowerCase();

      // Fetch team invites for this email
      var invRes = await supa.from('team_invites')
        .select('*')
        .eq('to_email', email)
        .catch(function () { return { data: null }; });

      var invites = (invRes && invRes.data) || [];

      for (var i = 0; i < invites.length; i++) {
        var invite = invites[i];
        try {
          var payload = typeof invite.payload === 'string'
            ? JSON.parse(invite.payload)
            : (invite.payload || {});
          var ownerUserId = payload.ownerUserId || invite.owner_id;
          if (!ownerUserId) continue;

          // Fetch owner's team snapshot
          var snapRes = await supa.from('user_notifications')
            .select('data')
            .eq('user_id', ownerUserId)
            .eq('type', 'team_data_snapshot')
            .maybeSingle()
            .catch(function () { return { data: null }; });

          if (snapRes && snapRes.data && snapRes.data.data) {
            var snap = typeof snapRes.data.data === 'string'
              ? JSON.parse(snapRes.data.data)
              : snapRes.data.data;

            if (snap && snap.teams) {
              var local = JSON.parse(localStorage.getItem('ordo_teams_v2') || '{"teams":[]}');
              snap.teams.forEach(function (remoteTeam) {
                var localIdx = (local.teams || []).findIndex(function (t) {
                  return t.id === remoteTeam.id;
                });
                if (localIdx > -1) {
                  local.teams[localIdx] = remoteTeam;
                } else {
                  if (!local.teams) local.teams = [];
                  local.teams.push(remoteTeam);
                }
              });
              localStorage.setItem('ordo_teams_v2', JSON.stringify(local));
            }
          }
        } catch (e) {}
      }
    } catch (e) {}
  }

  // ══════════════════════════════════════════════════
  // SECTION 7 — MEMBER PORTAL UI
  // ══════════════════════════════════════════════════

  function showMemberPortal(memberInfo) {
    var team = memberInfo.team;
    var member = memberInfo.member;
    var myTeams = memberInfo.myTeams || [];

    // Get tasks assigned to this member
    var myTasks = (team.tasks || []).filter(function (t) {
      return t.assigneeId === member.id ||
        ((t.workerIds || []).indexOf(member.id) > -1);
    });

    var pendingTasks = myTasks.filter(function (t) {
      return t.status !== 'done' && !t.done;
    });
    var doneTasks = myTasks.filter(function (t) {
      return t.status === 'done' || t.done;
    });

    var totalEarnings = myTasks.reduce(function (sum, t) {
      return sum + (+t.memberValue || 0);
    }, 0);
    var advance = +(member.advance || member.salary || 0);

    var roleInfo = COMPANY_ROLES[member.role] || COMPANY_ROLES.employee;

    // Hide main app
    var appShell = document.getElementById('app-shell') ||
                   document.querySelector('.app-shell') ||
                   document.querySelector('[id$="-shell"]');

    var portal = document.createElement('div');
    portal.id = '_member-portal';
    portal.style.cssText = [
      'position:fixed;inset:0',
      'background:var(--bg,#07080f)',
      'overflow-y:auto;z-index:9999',
      'font-family:Cairo,sans-serif;direction:rtl'
    ].join(';');

    var tasksHTML = myTasks.length === 0
      ? '<div style="text-align:center;padding:48px 24px;color:var(--text3)">' +
          '<div style="font-size:48px;margin-bottom:16px">✅</div>' +
          '<div style="font-size:15px;font-weight:700;margin-bottom:6px">لا توجد مهام مسندة إليك بعد</div>' +
          '<div style="font-size:12px;opacity:.7">ستظهر هنا مهامك حين يسندها لك المشرف</div>' +
        '</div>'
      : myTasks.map(function (task) {
          return _renderMemberTask(task, member);
        }).join('');

    var teamsTabsHTML = myTeams.length > 1
      ? '<div style="display:flex;gap:8px;overflow-x:auto;padding:0 24px 12px;margin-top:-4px">' +
          myTeams.map(function (mt) {
            var isActive = mt.team.id === team.id;
            return '<button onclick="window._switchMemberTeam(\'' + mt.team.id + '\')" style="' +
              'padding:6px 14px;border-radius:20px;border:1.5px solid ' +
              (isActive ? 'var(--accent)' : 'var(--border)') + ';' +
              'background:' + (isActive ? 'rgba(124,111,247,.12)' : 'transparent') + ';' +
              'color:' + (isActive ? 'var(--accent)' : 'var(--text3)') + ';' +
              'font-family:Cairo,sans-serif;font-size:12px;font-weight:700;' +
              'cursor:pointer;white-space:nowrap;transition:.15s">' +
              _esc(mt.team.name) +
            '</button>';
          }).join('') +
        '</div>'
      : '';

    portal.innerHTML =
      // ─── Header ───
      '<div style="background:var(--surface,#111121);border-bottom:1px solid var(--border);' +
        'padding:16px 24px;display:flex;align-items:center;gap:14px;' +
        'position:sticky;top:0;z-index:10">' +
        '<div style="width:44px;height:44px;border-radius:50%;' +
          'background:' + (member.color || '#7c6ff7') + ';' +
          'display:flex;align-items:center;justify-content:center;' +
          'font-size:18px;font-weight:900;color:#fff;flex-shrink:0">' +
          _esc((member.name || 'م')[0]) +
        '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:15px;font-weight:900;color:var(--text)">' +
            _esc(member.name || 'عضو') +
          '</div>' +
          '<div style="font-size:11px;color:var(--text3);margin-top:1px">' +
            roleInfo.icon + ' ' + roleInfo.label + ' · ' + _esc(team.name) +
          '</div>' +
        '</div>' +
        '<button onclick="window._refreshMemberPortal()" style="' +
          'padding:7px 12px;background:var(--surface2);border:1px solid var(--border);' +
          'border-radius:8px;color:var(--text2);font-family:Cairo,sans-serif;' +
          'font-size:11px;cursor:pointer;display:flex;align-items:center;gap:5px">' +
          '<i class="fa-solid fa-arrows-rotate"></i> تحديث' +
        '</button>' +
      '</div>' +

      // ─── Team Tabs ───
      teamsTabsHTML +

      // ─── Stats ───
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:20px 24px 8px">' +
        _statCard(String(pendingTasks.length), 'مهام نشطة', 'var(--accent,#7c6ff7)') +
        _statCard(String(doneTasks.length), 'مهام مكتملة', 'var(--accent3,#4fd1a5)') +
        _statCard(
          advance > 0 ? advance.toLocaleString() : totalEarnings.toLocaleString(),
          advance > 0 ? 'عربون مستلم' : 'إجمالي الأجر',
          'var(--accent2,#f7c948)'
        ) +
      '</div>' +

      // ─── Tasks Header ───
      '<div style="padding:4px 24px 12px;display:flex;align-items:center;justify-content:space-between">' +
        '<div style="font-size:14px;font-weight:800;color:var(--text2)">' +
          '<i class="fa-solid fa-list-check" style="color:var(--accent)"></i> مهامي (' + myTasks.length + ')' +
        '</div>' +
        '<div style="display:flex;gap:8px">' +
          '<span style="font-size:10px;padding:3px 10px;border-radius:20px;background:rgba(247,111,124,.12);color:#f76f7c">' +
            pendingTasks.length + ' نشطة' +
          '</span>' +
          '<span style="font-size:10px;padding:3px 10px;border-radius:20px;background:rgba(79,209,165,.12);color:var(--accent3)">' +
            doneTasks.length + ' مكتملة' +
          '</span>' +
        '</div>' +
      '</div>' +

      // ─── Tasks List ───
      '<div style="padding:0 24px 100px">' + tasksHTML + '</div>';

    document.body.appendChild(portal);
    if (appShell) appShell.style.display = 'none';

    // Store current member info for refresh
    window._currentMemberInfo = memberInfo;
  }

  function _statCard(value, label, color) {
    return '<div style="background:var(--surface,#111121);border:1px solid var(--border);' +
      'border-radius:14px;padding:16px;text-align:center">' +
      '<div style="font-size:22px;font-weight:900;color:' + color + '">' + _esc(value) + '</div>' +
      '<div style="font-size:10px;color:var(--text3);margin-top:4px">' + label + '</div>' +
    '</div>';
  }

  function _renderMemberTask(task, member) {
    var isDone = task.status === 'done' || !!task.done;
    var isLate = task.deadline && !isDone && new Date(task.deadline) < new Date();
    var steps = task.steps || [];
    var doneSteps = steps.filter(function (s) { return s.done; }).length;
    var progress = steps.length > 0
      ? Math.round((doneSteps / steps.length) * 100)
      : (isDone ? 100 : 0);

    var priorityColors = { high: '#f76f7c', med: '#f7c948', low: '#4fd1a5' };
    var priorityLabels = { high: 'عالية', med: 'متوسطة', low: 'منخفضة' };
    var pColor = priorityColors[task.priority] || 'var(--text3)';
    var pLabel = priorityLabels[task.priority] || '';

    var memberValue = +(task.memberValue || 0);

    var badges = '';
    if (task.priority) {
      badges += '<span style="font-size:10px;padding:2px 8px;border-radius:20px;' +
        'background:' + pColor + '22;color:' + pColor + ';font-weight:700">' + pLabel + '</span>';
    }
    if (isLate) {
      badges += '<span style="font-size:10px;padding:2px 8px;border-radius:20px;' +
        'background:rgba(247,111,124,.15);color:#f76f7c;font-weight:700">' +
        '<i class="fa-solid fa-clock"></i> متأخرة</span>';
    }
    if (task.deadline) {
      badges += '<span style="font-size:10px;color:var(--text3)">' +
        '<i class="fa-regular fa-calendar"></i> ' + _fmtDate(task.deadline) + '</span>';
    }
    if (memberValue > 0) {
      badges += '<span style="font-size:10px;padding:2px 8px;border-radius:20px;' +
        'background:rgba(247,201,72,.12);color:var(--accent2,#f7c948);font-weight:700">' +
        '💰 ' + memberValue.toLocaleString() + '</span>';
    }

    var progressHTML = steps.length > 0
      ? '<div style="margin-top:8px">' +
          '<div style="display:flex;justify-content:space-between;font-size:10px;' +
            'color:var(--text3);margin-bottom:3px">' +
            '<span>التقدم</span><span>' + doneSteps + '/' + steps.length + '</span>' +
          '</div>' +
          '<div style="height:3px;background:var(--border);border-radius:2px;overflow:hidden">' +
            '<div style="height:100%;width:' + progress + '%;background:var(--accent3,#4fd1a5);' +
              'border-radius:2px;transition:.3s"></div>' +
          '</div>' +
        '</div>'
      : '';

    return '<div style="background:var(--surface,#111121);' +
      'border:1px solid ' + (isDone ? 'rgba(79,209,165,.3)' : 'var(--border)') + ';' +
      'border-radius:14px;padding:16px;margin-bottom:10px;' +
      'cursor:' + (isDone ? 'default' : 'pointer') + ';transition:.15s" ' +
      (isDone ? '' : 'onclick="window._openMemberTaskDetail(\'' + _esc(task.id) + '\')"') + '>' +
      '<div style="display:flex;align-items:flex-start;gap:12px">' +
        '<div onclick="event.stopPropagation();window._toggleMemberTaskDone(\'' + _esc(task.id) + '\')" ' +
          'style="width:22px;height:22px;border-radius:50%;' +
          'border:2px solid ' + (isDone ? 'var(--accent3,#4fd1a5)' : 'var(--border)') + ';' +
          'background:' + (isDone ? 'var(--accent3,#4fd1a5)' : 'transparent') + ';' +
          'display:flex;align-items:center;justify-content:center;' +
          'flex-shrink:0;cursor:pointer;margin-top:2px;transition:.15s">' +
          (isDone ? '<i class="fa-solid fa-check" style="font-size:10px;color:#fff"></i>' : '') +
        '</div>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:14px;font-weight:700;' +
            'color:' + (isDone ? 'var(--text3)' : 'var(--text)') + ';' +
            'text-decoration:' + (isDone ? 'line-through' : 'none') + ';margin-bottom:4px">' +
            _esc(task.title || 'مهمة') +
          '</div>' +
          (task.desc
            ? '<div style="font-size:11px;color:var(--text3);margin-bottom:6px;line-height:1.5">' +
                _esc(task.desc.slice(0, 120)) + (task.desc.length > 120 ? '...' : '') +
              '</div>'
            : '') +
          '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">' + badges + '</div>' +
          progressHTML +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // ── Toggle task done ──
  window._toggleMemberTaskDone = function (taskId) {
    var tsRaw = localStorage.getItem('ordo_teams_v2');
    if (!tsRaw) return;
    var ts = JSON.parse(tsRaw);
    var changed = false;

    (ts.teams || []).forEach(function (team) {
      var tIdx = (team.tasks || []).findIndex(function (t) { return t.id === taskId; });
      if (tIdx > -1 && !changed) {
        var task = team.tasks[tIdx];
        var newDone = !(task.done || task.status === 'done');
        team.tasks[tIdx] = Object.assign({}, task, {
          done: newDone,
          status: newDone ? 'done' : 'inprog',
          updatedAt: new Date().toISOString()
        });
        changed = true;
      }
    });

    if (changed) {
      localStorage.setItem('ordo_teams_v2', JSON.stringify(ts));
      window._refreshMemberPortal();
    }
  };

  // ── Refresh portal ──
  window._refreshMemberPortal = async function () {
    var portal = document.getElementById('_member-portal');
    if (portal) portal.remove();

    var appShell = document.getElementById('app-shell') ||
                   document.querySelector('.app-shell') ||
                   document.querySelector('[id$="-shell"]');

    // Sync from cloud
    await _syncMemberDataFromCloud();

    var memberInfo = await _detectMemberPortal();
    if (memberInfo) {
      showMemberPortal(memberInfo);
    } else if (appShell) {
      appShell.style.display = '';
    }
  };

  // ── Switch team in portal ──
  window._switchMemberTeam = function (teamId) {
    var mi = window._currentMemberInfo;
    if (!mi) return;
    var found = (mi.myTeams || []).find(function (mt) { return mt.team.id === teamId; });
    if (!found) return;

    var portal = document.getElementById('_member-portal');
    if (portal) portal.remove();

    showMemberPortal({
      team: found.team,
      member: found.member,
      myTeams: mi.myTeams,
      teams: mi.teams
    });
    window._currentMemberInfo.team = found.team;
    window._currentMemberInfo.member = found.member;
  };

  // ══════════════════════════════════════════════════
  // SECTION 8 — TASK DETAIL MODAL (Member View)
  // ══════════════════════════════════════════════════

  window._openMemberTaskDetail = function (taskId) {
    var tsRaw = localStorage.getItem('ordo_teams_v2');
    if (!tsRaw) return;

    var task = null;
    var ts = JSON.parse(tsRaw);
    (ts.teams || []).forEach(function (team) {
      if (!task) {
        task = (team.tasks || []).find(function (t) { return t.id === taskId; });
      }
    });

    if (!task) return;

    var existing = document.getElementById('_member-task-detail');
    if (existing) existing.remove();

    var steps = task.steps || [];

    var stepsHTML = steps.length > 0
      ? '<div style="margin-bottom:16px">' +
          '<div style="font-size:13px;font-weight:800;color:var(--text2);margin-bottom:10px">' +
            '<i class="fa-solid fa-list-check" style="color:var(--accent)"></i> ' +
            'الخطوات (' + steps.filter(function (s) { return s.done; }).length + '/' + steps.length + ')' +
          '</div>' +
          steps.map(function (step, i) {
            return '<div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;' +
              'border-bottom:1px solid var(--border);cursor:pointer" ' +
              'onclick="window._toggleMemberStep(\'' + _esc(taskId) + '\', ' + i + ')">' +
              '<div style="width:18px;height:18px;border-radius:4px;' +
                'border:1.5px solid ' + (step.done ? 'var(--accent3)' : 'var(--border)') + ';' +
                'background:' + (step.done ? 'var(--accent3)' : 'transparent') + ';' +
                'display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;transition:.15s">' +
                (step.done ? '<i class="fa-solid fa-check" style="font-size:9px;color:#fff"></i>' : '') +
              '</div>' +
              '<span style="font-size:13px;color:' + (step.done ? 'var(--text3)' : 'var(--text)') + ';' +
                'text-decoration:' + (step.done ? 'line-through' : 'none') + ';flex:1;line-height:1.5">' +
                _esc(step.text || step.title || '') +
              '</span>' +
            '</div>';
          }).join('') +
        '</div>'
      : '';

    var isDone = task.done || task.status === 'done';

    var modal = document.createElement('div');
    modal.id = '_member-task-detail';
    modal.style.cssText = [
      'position:fixed;inset:0;background:rgba(0,0,0,.65)',
      'display:flex;align-items:flex-end;justify-content:center',
      'z-index:999999;font-family:Cairo,sans-serif;direction:rtl;padding:16px'
    ].join(';');

    modal.innerHTML =
      '<div style="background:var(--surface,#111121);border-radius:20px 20px 16px 16px;' +
        'width:min(560px,100%);max-height:85vh;overflow-y:auto;padding:24px;' +
        'box-shadow:0 -20px 60px rgba(0,0,0,.4)">' +

        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">' +
          '<div style="font-size:16px;font-weight:900;color:var(--text)">' +
            _esc(task.title) +
          '</div>' +
          '<button onclick="document.getElementById(\'_member-task-detail\').remove()" ' +
            'style="background:var(--surface2);border:none;border-radius:8px;' +
            'padding:6px 10px;cursor:pointer;color:var(--text3);font-size:14px">✕</button>' +
        '</div>' +

        (task.desc
          ? '<div style="font-size:13px;color:var(--text2);line-height:1.7;margin-bottom:16px;' +
              'padding:12px;background:var(--surface2);border-radius:10px">' +
              _esc(task.desc) +
            '</div>'
          : '') +

        stepsHTML +

        (task.deadline
          ? '<div style="display:flex;align-items:center;gap:8px;font-size:12px;' +
              'color:var(--text3);margin-bottom:16px">' +
              '<i class="fa-regular fa-calendar" style="color:var(--accent)"></i>' +
              ' تاريخ التسليم: ' + _fmtDate(task.deadline) +
            '</div>'
          : '') +

        '<div style="display:flex;gap:10px;margin-top:8px">' +
          (isDone
            ? '<button onclick="window._toggleMemberTaskDone(\'' + _esc(task.id) + '\');' +
                'document.getElementById(\'_member-task-detail\')?.remove()" ' +
                'style="flex:1;padding:12px;background:var(--surface2);' +
                'border:1px solid var(--border);border-radius:12px;color:var(--text2);' +
                'font-family:Cairo,sans-serif;font-size:13px;font-weight:700;cursor:pointer">' +
                '<i class="fa-solid fa-rotate-left"></i> إعادة فتح المهمة' +
              '</button>'
            : '<button onclick="window._toggleMemberTaskDone(\'' + _esc(task.id) + '\');' +
                'document.getElementById(\'_member-task-detail\')?.remove()" ' +
                'style="flex:1;padding:12px;background:var(--accent3,#4fd1a5);border:none;' +
                'border-radius:12px;color:#fff;font-family:Cairo,sans-serif;' +
                'font-size:13px;font-weight:800;cursor:pointer">' +
                '<i class="fa-solid fa-check"></i> تم الإنجاز' +
              '</button>'
          ) +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) modal.remove();
    });
  };

  window._toggleMemberStep = function (taskId, stepIndex) {
    var tsRaw = localStorage.getItem('ordo_teams_v2');
    if (!tsRaw) return;
    var ts = JSON.parse(tsRaw);
    var changed = false;

    (ts.teams || []).forEach(function (team) {
      if (changed) return;
      var tIdx = (team.tasks || []).findIndex(function (t) { return t.id === taskId; });
      if (tIdx > -1) {
        var task = Object.assign({}, team.tasks[tIdx]);
        var steps = (task.steps || []).slice();
        if (steps[stepIndex]) {
          steps[stepIndex] = Object.assign({}, steps[stepIndex], {
            done: !steps[stepIndex].done
          });
          task.steps = steps;
          task.updatedAt = new Date().toISOString();
          team.tasks[tIdx] = task;
          changed = true;
        }
      }
    });

    if (changed) {
      localStorage.setItem('ordo_teams_v2', JSON.stringify(ts));
      var existing = document.getElementById('_member-task-detail');
      if (existing) existing.remove();
      window._openMemberTaskDetail(taskId);
    }
  };

  // ══════════════════════════════════════════════════
  // SECTION 9 — TASK DELEGATION (Owner → Member)
  // ══════════════════════════════════════════════════

  /**
   * delegateTaskToMember(taskId, teamId, memberId, memberValue?)
   * يُحوّل مهمة من النظام الرئيسي لعضو في الفريق — بدون بيانات العميل.
   */
  window.delegateTaskToMember = function (taskId, teamId, memberId, memberValue) {
    var S = window.S;
    if (!S) return false;

    var task = (S.tasks || []).find(function (t) { return String(t.id) === String(taskId); }) ||
               (S.project_tasks || []).find(function (t) { return String(t.id) === String(taskId); });

    if (!task) { _toast('⚠️ المهمة غير موجودة'); return false; }

    // Sanitized copy — NO client info
    var sanitized = {
      id          : 'del_' + task.id + '_' + Date.now(),
      original_id : String(task.id),
      title       : task.title || task.name || 'مهمة مفوّضة',
      desc        : task.desc || task.description || task.notes || '',
      priority    : task.priority || 'med',
      status      : 'todo',
      assigneeId  : memberId,
      workerIds   : [memberId],
      deadline    : task.deadline || task.dueDate || '',
      steps       : (task.steps || []).map(function (s) {
        return { text: s.text || s.title || '', done: false };
      }),
      type        : task.type || 'task',
      memberValue : +(memberValue || 0),
      delegatedAt : new Date().toISOString(),
      createdAt   : new Date().toISOString(),
      updatedAt   : new Date().toISOString(),
      done        : false
      // client, clientId, client_id, financial — excluded intentionally
    };

    var tsRaw = localStorage.getItem('ordo_teams_v2') || '{"teams":[]}';
    var tsData = JSON.parse(tsRaw);
    var teamIdx = (tsData.teams || []).findIndex(function (t) { return t.id === teamId; });

    if (teamIdx === -1) { _toast('⚠️ الفريق غير موجود'); return false; }

    if (!tsData.teams[teamIdx].tasks) tsData.teams[teamIdx].tasks = [];
    tsData.teams[teamIdx].tasks.push(sanitized);
    localStorage.setItem('ordo_teams_v2', JSON.stringify(tsData));

    // Mark as delegated in main app
    var taskArr = S.tasks || [];
    var tIdx = taskArr.findIndex(function (t) { return String(t.id) === String(taskId); });
    if (tIdx > -1) {
      S.tasks[tIdx] = Object.assign({}, S.tasks[tIdx], {
        delegated_to  : memberId,
        delegated_team: teamId,
        delegated_at  : new Date().toISOString()
      });
    } else {
      var ptArr = S.project_tasks || [];
      var ptIdx = ptArr.findIndex(function (t) { return String(t.id) === String(taskId); });
      if (ptIdx > -1) {
        S.project_tasks[ptIdx] = Object.assign({}, S.project_tasks[ptIdx], {
          delegated_to  : memberId,
          delegated_team: teamId,
          delegated_at  : new Date().toISOString()
        });
      }
    }

    _save();
    _toast('<i class="fa-solid fa-people-arrows" style="color:var(--accent3)"></i> تم تفويض المهمة للعضو بنجاح');
    return true;
  };

  /**
   * openDelegateTaskModal(taskId)
   * فتح modal لتفويض مهمة لعضو في الفريق.
   */
  window.openDelegateTaskModal = function (taskId) {
    var tsRaw = localStorage.getItem('ordo_teams_v2') || '{"teams":[]}';
    var tsData = JSON.parse(tsRaw);
    var teams = tsData.teams || [];

    if (!teams.length) {
      _toast('⚠️ لا يوجد فريق — أنشئ فريقاً أولاً في صفحة الفرق');
      return;
    }

    var existing = document.getElementById('_delegate-modal');
    if (existing) existing.remove();

    var firstTeam = teams[0];
    var teamOptsHTML = teams.map(function (t) {
      return '<option value="' + _esc(t.id) + '">' + _esc(t.name) + '</option>';
    }).join('');

    var memberOptsHTML = (firstTeam.members || []).map(function (m) {
      var rLabel = (COMPANY_ROLES[m.role] || { label: m.role || 'عضو' }).label;
      return '<option value="' + _esc(m.id) + '">' + _esc(m.name) + ' — ' + _esc(rLabel) + '</option>';
    }).join('');

    var modal = document.createElement('div');
    modal.id = '_delegate-modal';
    modal.style.cssText = [
      'position:fixed;inset:0;background:rgba(0,0,0,.65)',
      'display:flex;align-items:center;justify-content:center',
      'z-index:999999;padding:16px;font-family:Cairo,sans-serif;direction:rtl'
    ].join(';');

    modal.innerHTML =
      '<div style="background:var(--surface,#111121);border-radius:18px;padding:26px;' +
        'width:min(420px,95vw);box-shadow:0 24px 80px rgba(0,0,0,.5)">' +

        '<div style="font-size:15px;font-weight:900;color:var(--text);margin-bottom:4px">' +
          '<i class="fa-solid fa-people-arrows" style="color:var(--accent)"></i> تفويض المهمة لعضو في الفريق' +
        '</div>' +
        '<div style="font-size:11px;color:var(--text3);margin-bottom:20px">' +
          'سيتم مشاركة المهمة بدون أي بيانات خاصة بالعميل' +
        '</div>' +

        '<div style="margin-bottom:12px">' +
          '<label style="font-size:11px;font-weight:700;color:var(--text3);display:block;margin-bottom:4px">الفريق</label>' +
          '<select id="_del-team" class="form-input" style="width:100%;box-sizing:border-box" ' +
            'onchange="window._updateDelegateMembers(this.value)">' +
            teamOptsHTML +
          '</select>' +
        '</div>' +

        '<div style="margin-bottom:12px">' +
          '<label style="font-size:11px;font-weight:700;color:var(--text3);display:block;margin-bottom:4px">العضو</label>' +
          '<select id="_del-member" class="form-input" style="width:100%;box-sizing:border-box">' +
            memberOptsHTML +
          '</select>' +
        '</div>' +

        '<div style="margin-bottom:20px">' +
          '<label style="font-size:11px;font-weight:700;color:var(--text3);display:block;margin-bottom:4px">' +
            'أجر العضو على المهمة (اختياري)' +
          '</label>' +
          '<input id="_del-value" type="number" class="form-input" min="0" placeholder="0" ' +
            'style="width:100%;box-sizing:border-box">' +
        '</div>' +

        '<div style="display:flex;gap:10px">' +
          '<button onclick="window._confirmDelegateTask(\'' + _esc(String(taskId)) + '\')" ' +
            'class="btn btn-primary" style="flex:1">' +
            '<i class="fa-solid fa-paper-plane"></i> تفويض المهمة' +
          '</button>' +
          '<button onclick="document.getElementById(\'_delegate-modal\').remove()" ' +
            'class="btn btn-ghost" style="flex:1">إلغاء</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) modal.remove();
    });
  };

  window._updateDelegateMembers = function (teamId) {
    var tsRaw = localStorage.getItem('ordo_teams_v2') || '{"teams":[]}';
    var tsData = JSON.parse(tsRaw);
    var team = (tsData.teams || []).find(function (t) { return t.id === teamId; });
    if (!team) return;

    var sel = document.getElementById('_del-member');
    if (!sel) return;

    sel.innerHTML = (team.members || []).map(function (m) {
      var rLabel = (COMPANY_ROLES[m.role] || { label: m.role || 'عضو' }).label;
      return '<option value="' + _esc(m.id) + '">' + _esc(m.name) + ' — ' + _esc(rLabel) + '</option>';
    }).join('');
  };

  window._confirmDelegateTask = function (taskId) {
    var teamId = (document.getElementById('_del-team') || {}).value;
    var memberId = (document.getElementById('_del-member') || {}).value;
    var memberValue = +((document.getElementById('_del-value') || {}).value || 0);

    if (!teamId || !memberId) {
      _toast('⚠️ اختر الفريق والعضو');
      return;
    }

    var modal = document.getElementById('_delegate-modal');
    if (modal) modal.remove();

    window.delegateTaskToMember(taskId, teamId, memberId, memberValue);
  };

  // ══════════════════════════════════════════════════
  // SECTION 10 — BUDGET ALERTS UI
  // ══════════════════════════════════════════════════

  function _showBudgetAlerts() {
    if (typeof window.checkBudgetAlerts !== 'function') return;

    var alerts = window.checkBudgetAlerts();
    if (!alerts.length) return;

    var existing = document.getElementById('_budget-alerts-container');
    if (existing) existing.remove();

    var container = document.createElement('div');
    container.id = '_budget-alerts-container';
    container.style.cssText = [
      'position:fixed;bottom:70px;left:20px;z-index:9998',
      'display:flex;flex-direction:column;gap:8px',
      'font-family:Cairo,sans-serif;direction:rtl;max-width:320px'
    ].join(';');

    alerts.slice(0, 3).forEach(function (item) {
      var project = item.project;
      var summary = item.summary;
      var isExceeded = summary.budgetExceeded;
      var color = isExceeded ? '#f76f7c' : '#f7c948';
      var icon = isExceeded ? 'fa-triangle-exclamation' : 'fa-circle-exclamation';
      var msg = isExceeded
        ? 'تجاوزت الميزانية بـ ' + Number(Math.abs(summary.budgetRemaining || 0)).toLocaleString()
        : 'وصلت لـ ' + (summary.budgetUsed || 0) + '% من الميزانية';

      var alert = document.createElement('div');
      alert.style.cssText = [
        'background:var(--surface,#111121)',
        'border:1.5px solid ' + color + '44',
        'border-right:3px solid ' + color,
        'border-radius:12px;padding:12px 14px',
        'box-shadow:0 8px 24px rgba(0,0,0,.3)',
        'display:flex;align-items:center;gap:10px'
      ].join(';');

      alert.innerHTML =
        '<i class="fa-solid ' + icon + '" style="color:' + color + ';font-size:15px;flex-shrink:0"></i>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:12px;font-weight:800;color:var(--text)">' + _esc(project.name) + '</div>' +
          '<div style="font-size:10px;color:' + color + ';margin-top:1px">' + msg + '</div>' +
        '</div>' +
        '<button onclick="this.parentElement.remove()" style="' +
          'background:none;border:none;color:var(--text3);cursor:pointer;' +
          'padding:2px 6px;font-size:14px;flex-shrink:0">×</button>';

      container.appendChild(alert);
    });

    document.body.appendChild(container);

    // Auto-hide after 10 seconds
    setTimeout(function () {
      var c = document.getElementById('_budget-alerts-container');
      if (c) c.remove();
    }, 10000);
  }

  // ══════════════════════════════════════════════════
  // SECTION 11 — PUBLIC API
  // ══════════════════════════════════════════════════

  window.ORDO_WORKSPACE_TYPES = WORKSPACE_TYPES;
  window.ORDO_COMPANY_ROLES   = COMPANY_ROLES;

  window._hasRolePermission = function (role, permission) {
    var perms = (COMPANY_ROLES[role] || {}).permissions || [];
    return perms.indexOf('all') > -1 || perms.indexOf(permission) > -1;
  };

  window.showWorkspaceWizard = showWorkspaceWizard;

  // ══════════════════════════════════════════════════
  // SECTION 12 — INIT
  // ══════════════════════════════════════════════════

  function _init() {
    var _interval = setInterval(function () {
      if (!window.S) return;
      clearInterval(_interval);

      // Show workspace badge
      _addWorkspaceBadge();

      // Show wizard if first time (delayed so app loads first)
      setTimeout(function () {
        if (_shouldShowWizard()) showWorkspaceWizard();
      }, 1800);

      // Show budget alerts
      setTimeout(_showBudgetAlerts, 4000);

      // Check if current user is a team member
      setTimeout(async function () {
        var memberInfo = await _detectMemberPortal();
        if (memberInfo) {
          await _syncMemberDataFromCloud();
          // Re-detect after sync (data might have changed)
          var fresh = await _detectMemberPortal();
          if (fresh) showMemberPortal(fresh);
        }
      }, 1200);

    }, 300);

    setTimeout(function () { clearInterval(_interval); }, 20000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

  // ════════════════════════════════════════════════════════════════════════
  // PUBLIC API SUMMARY
  // ════════════════════════════════════════════════════════════════════════
  // window.ORDO_WORKSPACE_TYPES                     → object
  // window.ORDO_COMPANY_ROLES                       → object
  // window.showWorkspaceWizard()                    → void  ← UI
  // window._confirmWorkspaceType()                  → void  ← internal
  // window._skipWorkspaceWizard()                   → void  ← internal
  // window.delegateTaskToMember(tid, tmId, mId, v)  → bool
  // window.openDelegateTaskModal(taskId)             → void  ← UI
  // window._refreshMemberPortal()                   → void
  // window._toggleMemberTaskDone(taskId)            → void
  // window._openMemberTaskDetail(taskId)            → void
  // window._toggleMemberStep(taskId, index)         → void
  // window._hasRolePermission(role, permission)     → bool
  // ════════════════════════════════════════════════════════════════════════

})();

try{ if(window.OrdoPlugins) window.OrdoPlugins.register('teamRoles', function(){}); }catch(e){}

/* ===== END TEAM ROLES PATCH ===== */


/* ===== BEGIN APP PATCH 2 (app_patch2.js) ===== */
// ═══════════════════════════════════════════════════════════════════════
// ORDO — app_patch2.js
// 1. حذف العميل الشامل (مهام + أرشيف + عقود + فواتير + معاملات + تقييمات + عروض + مشاريع + ميتنجات)
// 2. قسم Workspace — مساحة حرة للإنتاجية الشخصية
// ═══════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════
// SECTION 1 — ENHANCED DELETE CLIENT
// ══════════════════════════════════════════════════════════════════════

/**
 * حذف العميل بشكل شامل مع كل سجلاته
 */
function delClient(id) {
  var client = (S.clients || []).find(function(c) { return String(c.id) === String(id); });
  if (!client) return;

  var clientName = client.name || '';

  // حساب كل السجلات المرتبطة
  var tasksCount     = (S.tasks || []).filter(function(t)  { return t.client === clientName || String(t.clientId || '') === String(id); }).length;
  var archivedCount  = (S.archivedTasks || []).filter(function(t) { return t.client === clientName || String(t.clientId || '') === String(id); }).length;
  var projTasksCount = (S.project_tasks || []).filter(function(t) { return String(t.client_id || '') === String(id) || t.client_name === clientName; }).length;
  var projectsCount  = (S.projects || []).filter(function(p)  { return p.client === clientName || String(p.client_id || '') === String(id); }).length;
  var invoicesCount  = (S.invoices || []).filter(function(i)  { return i.client === clientName || String(i.clientId || '') === String(id); }).length;
  var transCount     = (S.transactions || []).filter(function(t){ return t.client === clientName || t.source === clientName; }).length;
  var reviewsCount   = (S.reviews || []).filter(function(r)   { return r.client_name === clientName || String(r.client_id || '') === String(id); }).length;
  var contractsCount = (S.contracts || []).filter(function(c)  { return c.client === clientName || c.client_name === clientName || String(c.client_id || '') === String(id); }).length;
  var proposalsCount = (S.proposals || []).filter(function(p)  { return p.clientName === clientName || String(p.client_id || '') === String(id); }).length;
  var meetingsCount  = (S.schedule || []).filter(function(m)   { return m.client === clientName; }).length;
  var leadsCount     = (S.leads || []).filter(function(l)      { return l.name === clientName; }).length;
  var portalsCount   = (S.client_portals || []).filter(function(p){ return String(p.client_id || '') === String(id); }).length;

  var totalRecords = tasksCount + archivedCount + projTasksCount + projectsCount +
                     invoicesCount + transCount + reviewsCount + contractsCount +
                     proposalsCount + meetingsCount;

  // بناء رسالة التأكيد
  var msg = '⚠ حذف العميل "' + clientName + '" نهائياً؟\n\n';
  if (totalRecords > 0) {
    msg += 'سيتم حذف:\n';
    if (tasksCount)     msg += '• ' + tasksCount + ' مهمة\n';
    if (archivedCount)  msg += '• ' + archivedCount + ' مهمة في الأرشيف\n';
    if (projTasksCount) msg += '• ' + projTasksCount + ' مهمة مشاريع\n';
    if (projectsCount)  msg += '• ' + projectsCount + ' مشروع\n';
    if (invoicesCount)  msg += '• ' + invoicesCount + ' فاتورة\n';
    if (transCount)     msg += '• ' + transCount + ' معاملة مالية\n';
    if (reviewsCount)   msg += '• ' + reviewsCount + ' تقييم\n';
    if (contractsCount) msg += '• ' + contractsCount + ' عقد\n';
    if (proposalsCount) msg += '• ' + proposalsCount + ' عرض سعر\n';
    if (meetingsCount)  msg += '• ' + meetingsCount + ' ميتنج\n';
    msg += '\nهذا الإجراء لا يمكن التراجع عنه!';
  } else {
    msg += 'لا يوجد سجلات مرتبطة بهذا العميل.';
  }

  // مودال تأكيد مخصص
  _showDeleteClientConfirm(id, clientName, msg, function() {
    _executeDeleteClient(id, clientName);
  });
}

function _showDeleteClientConfirm(id, clientName, msg, onConfirm) {
  // إزالة أي مودال قديم
  var old = document.getElementById('_del-client-modal');
  if (old) old.remove();

  var modal = document.createElement('div');
  modal.id = '_del-client-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.7);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px';

  var lines = msg.split('\n').filter(Boolean);
  var title = lines[0];
  var items = lines.slice(1);

  var itemsHtml = items.map(function(line) {
    if (line.startsWith('•')) {
      return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13px;color:var(--text2)">' +
        '<span style="color:var(--accent4);font-size:10px">■</span>' +
        '<span>' + line.slice(2) + '</span>' +
      '</div>';
    }
    return '<div style="font-size:12px;color:var(--text3);margin-top:6px;font-style:italic">' + line + '</div>';
  }).join('');

  modal.innerHTML =
    '<div style="background:var(--surface);border:1px solid rgba(247,111,124,.3);border-radius:20px;padding:28px;max-width:440px;width:100%;box-shadow:0 32px 80px rgba(0,0,0,.6);animation:_fadeUp .2s ease">' +
      '<div style="font-size:26px;text-align:center;margin-bottom:12px">🗑️</div>' +
      '<div style="font-size:15px;font-weight:800;text-align:center;margin-bottom:16px;color:var(--accent4)">' + title + '</div>' +
      (itemsHtml ? '<div style="background:rgba(247,111,124,.06);border:1px solid rgba(247,111,124,.2);border-radius:12px;padding:12px 16px;margin-bottom:16px">' + itemsHtml + '</div>' : '') +
      '<div style="display:flex;gap:10px">' +
        '<button id="_del-client-cancel" class="btn btn-ghost" style="flex:1;justify-content:center">إلغاء</button>' +
        '<button id="_del-client-confirm" class="btn btn-danger" style="flex:2;justify-content:center;background:linear-gradient(135deg,#f76f7c,#e05567)">' +
          '<i class="fa-solid fa-trash" style="margin-left:6px"></i> حذف نهائياً' +
        '</button>' +
      '</div>' +
    '</div>';

  // أضف animation
  if (!document.getElementById('_delAnim')) {
    var st = document.createElement('style');
    st.id = '_delAnim';
    st.textContent = '@keyframes _fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}';
    document.head.appendChild(st);
  }

  document.body.appendChild(modal);

  document.getElementById('_del-client-cancel').onclick = function() { modal.remove(); };
  document.getElementById('_del-client-confirm').onclick = function() {
    modal.remove();
    onConfirm();
  };
  modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
}

function _executeDeleteClient(id, clientName) {
  var sid = String(id);

  // حذف المهام
  S.tasks = (S.tasks || []).filter(function(t) {
    return t.client !== clientName && String(t.clientId || '') !== sid;
  });

  // حذف الأرشيف
  S.archivedTasks = (S.archivedTasks || []).filter(function(t) {
    return t.client !== clientName && String(t.clientId || '') !== sid;
  });

  // حذف مهام المشاريع
  S.project_tasks = (S.project_tasks || []).filter(function(t) {
    return String(t.client_id || '') !== sid && t.client_name !== clientName;
  });

  // حذف المشاريع
  S.projects = (S.projects || []).filter(function(p) {
    return p.client !== clientName && String(p.client_id || '') !== sid;
  });

  // حذف الفواتير
  S.invoices = (S.invoices || []).filter(function(i) {
    return i.client !== clientName && String(i.clientId || '') !== sid;
  });

  // حذف المعاملات المرتبطة
  S.transactions = (S.transactions || []).filter(function(t) {
    return t.client !== clientName && t.source !== clientName;
  });

  // حذف التقييمات
  S.reviews = (S.reviews || []).filter(function(r) {
    return r.client_name !== clientName && String(r.client_id || '') !== sid;
  });

  // حذف العقود
  S.contracts = (S.contracts || []).filter(function(c) {
    return c.client !== clientName && c.client_name !== clientName && String(c.client_id || '') !== sid;
  });

  // حذف عروض الأسعار
  S.proposals = (S.proposals || []).filter(function(p) {
    return p.clientName !== clientName && String(p.client_id || '') !== sid;
  });

  // حذف الميتنجات
  S.schedule = (S.schedule || []).filter(function(m) {
    return m.client !== clientName;
  });

  // حذف المحتملين
  S.leads = (S.leads || []).filter(function(l) {
    return l.name !== clientName;
  });

  // حذف بوابات العميل
  S.client_portals = (S.client_portals || []).filter(function(p) {
    return String(p.client_id || '') !== sid;
  });

  // أخيراً: حذف العميل نفسه
  S.clients = (S.clients || []).filter(function(c) {
    return String(c.id) !== sid;
  });

  // حفظ وتحديث
  lsSave();
  if (typeof cloudSaveNow === 'function') cloudSaveNow(S);
  if (typeof renderAll === 'function') renderAll();

  // إغلاق أي مودال مفتوح للعميل
  if (typeof closeM === 'function') {
    closeM('modal-client-profile');
    closeM('modal-client');
  }

  if (typeof toast === 'function') {
    toast('<i class="fa-solid fa-trash" style="color:var(--accent4)"></i> تم حذف العميل وكل سجلاته نهائياً');
  }
}


// ══════════════════════════════════════════════════════════════════════
// SECTION 2 — WORKSPACE OPENER
// يفتح workspace.html في نافذة جديدة
// ══════════════════════════════════════════════════════════════════════

// Override showPage لفتح workspace.html
(function() {
  var _origShowPage = window.showPage;
  if (typeof _origShowPage === 'function') {
    window.showPage = function(page, btn) {
      if (page === 'workspace') {
        // حساب المسار الصحيح لـ workspace.html
        var href = window.location.href.split('?')[0];
        var base = href.substring(0, href.lastIndexOf('/') + 1);
        window.open(base + 'workspace.html', '_blank');
        return;
      }
      _origShowPage.call(this, page, btn);
    };
  }
})();

// Fallback: لو showPage مش موجودة بعد
window.openWorkspace = function() {
  var href = window.location.href.split('?')[0];
  var base = href.substring(0, href.lastIndexOf('/') + 1);
  window.open(base + 'workspace.html', '_blank');
};

// ── stub renderWorkspace عشان متكسرش لو اتنادى
function renderWorkspace() {
  window.openWorkspace();
}

console.log('[Ordo] app_patch2.js loaded ✓ — delClient enhanced + Workspace (workspace.html)');
try{ if(window.OrdoPlugins) window.OrdoPlugins.register('workspace', function(){}); }catch(e){}

/* ===== END APP PATCH 2 ===== */


/* ===== BEGIN CURRENCY PATCH (currency_patch.js) ===== */
// ═══════════════════════════════════════════════════════════════════════
// ORDO — currency_patch.js  (v1.0)
// ─────────────────────────────────────────────────────────────────────
// 1) تفعيل العملة من الإعدادات في كل أنحاء النظام (داش بورد، تاسكات،
//    عملاء، فواتير، ماليه...) لما تتغير العملة كل الشاشات بتتحدّث.
// 2) إضافة عملة مخصّصة لكل مهمة (Task) — كل مهمة تقدر يكون ليها عملة
//    مختلفة عن العملة الافتراضية للنظام أو عن عملة المشروع.
// 3) كل مهمة بتستخدم العملة من نفسها، أو من المشروع المرتبط بيها،
//    أو من إعدادات النظام (بهذا الترتيب).
//
// طريقة التطبيق:
//   <script src="app.js"></script>
//   <script src="app_patch.js"></script>
//   <script src="customization_patch.js"></script>
//   <script src="ordo_integration_layer.js"></script>
//   <script src="team_roles_patch.js"></script>
//   <script src="app_patch2.js"></script>
//   <script src="currency_patch.js"></script>   <!-- ← أضف هذا -->
// ═══════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  // v2 wallet/currency behavior lives in OrdoCurrencyPatch + OrdoFinance.
  // Keep this legacy file loaded for compatibility, but skip its old hooks so
  // it does not override enabled-currency selects or task currency saving.
  if (window.OrdoCurrencyPatch && window.OrdoFinance) {
    console.log('[Ordo] currency_patch.js legacy hooks skipped; OrdoCurrencyPatch is active');
    return;
  }

  // ── العملات المدعومة (نفس قائمة الإعدادات + إضافات شائعة) ──
  var CURRENCY_OPTIONS = [
    { val: 'ج.م', label: '🇪🇬 ج.م — جنيه مصري' },
    { val: 'ر.س', label: '🇸🇦 ر.س — ريال سعودي' },
    { val: '$',    label: '🇺🇸 $ — دولار' },
    { val: '€',    label: '🇪🇺 € — يورو' },
    { val: 'AED', label: '🇦🇪 AED — درهم إماراتي' },
    { val: 'KWD', label: '🇰🇼 KWD — دينار كويتي' },
    { val: 'QAR', label: '🇶🇦 QAR — ريال قطري' },
    { val: 'GBP', label: '🇬🇧 £ — جنيه إسترليني' }
  ];

  // ── خريطة لتطبيع العملات (مثلا USD → $) ──
  var _CUR_NORM = {
    'EGP': 'ج.م',
    'ج':   'ج.م',
    'USD': '$',
    'SAR': 'ر.س',
    'EUR': '€',
    'GBP': '£'
  };

  // ════════════════════════════════════════════════
  // 1) HELPERS — حسابات العملة
  // ════════════════════════════════════════════════
  function _curGlobal() {
    return (window.S && S.settings && S.settings.currency) || 'ج.م';
  }
  function _normCur(c) {
    if (!c) return '';
    return _CUR_NORM[c] || c;
  }
  function _curForTask(t) {
    if (!t) return _curGlobal();
    if (t.currency) return _normCur(t.currency);
    if (t.project_id && window.S) {
      var p = (S.projects||[]).find(function(x){return String(x.id)===String(t.project_id);});
      if (p && p.budgetCurrency) return _normCur(p.budgetCurrency);
    }
    return _curGlobal();
  }
  function _curForPtask(t) {
    if (!t) return _curGlobal();
    if (t.currency) return _normCur(t.currency);
    if (t.project_id && window.S) {
      var p = (S.projects||[]).find(function(x){return String(x.id)===String(t.project_id);});
      if (p && p.budgetCurrency) return _normCur(p.budgetCurrency);
    }
    return _curGlobal();
  }
  function _curForProj(p) {
    if (!p) return _curGlobal();
    return _normCur(p.budgetCurrency || p.currency) || _curGlobal();
  }
  function _curForInv(inv) {
    if (!inv) return _curGlobal();
    return _normCur(inv.currency) || _curGlobal();
  }

  // expose globally
  window._curGlobal   = _curGlobal;
  window._curForTask  = _curForTask;
  window._curForPtask = _curForPtask;
  window._curForProj  = _curForProj;
  window._curForInv   = _curForInv;
  window._normCur     = _normCur;

  // ════════════════════════════════════════════════
  // 2) UI INJECTION — حقن قائمة العملة في فورم المهمة
  // ════════════════════════════════════════════════
  function injectTaskCurrencyUI() {
    var valRow = document.getElementById('t-value-row');
    if (!valRow) return false;
    if (document.getElementById('t-currency')) return true; // already injected

    var groups = valRow.querySelectorAll('.form-group');
    if (groups.length < 2) return false;
    var origValGroup = groups[0];
    var origPayGroup = groups[1];

    // إزالة "(ج)" من label قيمة المشروع
    var valLbl = origValGroup.querySelector('.form-label');
    if (valLbl) valLbl.innerHTML = '<i class="fa-solid fa-coins" style="color:#f7c948"></i> قيمة المشروع';

    // بناء options
    var opts = '<option value="">— حسب الافتراضي —</option>' +
      CURRENCY_OPTIONS.map(function(o){
        return '<option value="'+o.val+'">'+o.label+'</option>';
      }).join('');

    // حقن المجموعة الجديدة (عملة) بين القيمة وحالة الدفع
    var curGroup = document.createElement('div');
    curGroup.className = 'form-group';
    curGroup.innerHTML =
      '<label class="form-label" style="display:flex;align-items:center;justify-content:space-between">' +
        '<span><i class="fa-solid fa-money-bill-wave" style="color:var(--accent3)"></i> العملة</span>' +
        '<span id="t-cur-hint" style="font-size:9px;color:var(--text3);font-weight:400">افتراضي</span>' +
      '</label>' +
      '<select class="form-select" id="t-currency" onchange="window._onTaskCurrencyChange()">' + opts + '</select>';

    valRow.insertBefore(curGroup, origPayGroup);
    valRow.style.gridTemplateColumns = '1fr 140px 1fr';

    // تحديث label العربون لإزالة "(ج)"
    var depRow = document.getElementById('deposit-row');
    if (depRow) {
      var depLbl = depRow.querySelector('.form-label');
      if (depLbl) depLbl.innerHTML = '<i class="fa-solid fa-heart" style="color:var(--accent2)"></i> قيمة العربون المدفوع';
    }

    return true;
  }

  // تحديث الـ hint عند تغيير العملة
  window._onTaskCurrencyChange = function() {
    var sel  = document.getElementById('t-currency');
    var hint = document.getElementById('t-cur-hint');
    if (!sel || !hint) return;
    if (!sel.value) {
      hint.textContent = 'افتراضي ('+_curGlobal()+')';
      hint.style.color = 'var(--text3)';
    } else {
      hint.textContent = 'مخصصة';
      hint.style.color = 'var(--accent3)';
    }
  };

  // ── تحديث dropdown الـ project budget currency ليتطابق مع الإعدادات ──
  function syncProjectBudgetCurrencyOptions() {
    var sel = document.getElementById('proj-budget-currency');
    if (!sel) return false;
    if (sel._curSynced) return true;
    var savedVal = sel.value;
    sel.innerHTML = CURRENCY_OPTIONS.map(function(o){
      return '<option value="'+o.val+'">'+o.label+'</option>';
    }).join('');
    if (savedVal) sel.value = _normCur(savedVal);
    sel._curSynced = true;
    return true;
  }

  // ── تحديث dropdown الـ ptask currency بنفس الطريقة ──
  function syncPtaskCurrencyOptions() {
    var sel = document.getElementById('ptask-currency');
    if (!sel) return false;
    if (sel._curSynced) return true;
    var savedVal = sel.value;
    sel.innerHTML = CURRENCY_OPTIONS.map(function(o){
      return '<option value="'+o.val+'">'+o.label+'</option>';
    }).join('');
    if (savedVal) sel.value = _normCur(savedVal);
    sel._curSynced = true;
    return true;
  }

  // ════════════════════════════════════════════════
  // 3) SAVE/LOAD HOOKS — حفظ وتحميل العملة
  // ════════════════════════════════════════════════
  function hookSaveTask() {
    if (typeof window.saveTask !== 'function') return false;
    if (window.saveTask._curHooked) return true;
    var orig = window.saveTask;
    window.saveTask = function() {
      var curEl    = document.getElementById('t-currency');
      var explicit = curEl ? (curEl.value || '') : '';
      var eid      = +(document.getElementById('task-eid')||{value:0}).value;

      var preLen = (window.S && S.tasks) ? S.tasks.length : 0;
      var result = orig.apply(this, arguments);

      if (!eid) {
        // مهمة جديدة — آخر واحدة في الـ array
        if (window.S && S.tasks && S.tasks.length > preLen) {
          var newT = S.tasks[S.tasks.length-1];
          if (newT) {
            newT.currency = explicit || '';
            try { if (typeof lsSave === 'function') lsSave(); } catch(e){}
            try { if (typeof cloudSave === 'function') cloudSave(S); } catch(e){}
          }
        }
      } else {
        // تعديل — find by id
        var t = (window.S && S.tasks) ? S.tasks.find(function(x){return +x.id === eid;}) : null;
        if (t) {
          t.currency = explicit || '';
          try { if (typeof lsSave === 'function') lsSave(); } catch(e){}
          try { if (typeof cloudSave === 'function') cloudSave(S); } catch(e){}
        }
      }
      return result;
    };
    window.saveTask._curHooked = true;
    return true;
  }

  function hookOpenTaskModal() {
    if (typeof window.openTaskModal !== 'function') return false;
    if (window.openTaskModal._curHooked) return true;
    var orig = window.openTaskModal;
    window.openTaskModal = function(id) {
      var r = orig.apply(this, arguments);
      setTimeout(function() {
        injectTaskCurrencyUI();
        var sel = document.getElementById('t-currency');
        if (!sel) return;
        if (id && window.S) {
          var t = (S.tasks||[]).find(function(x){return x.id===id;});
          sel.value = (t && t.currency) ? t.currency : '';
        } else {
          sel.value = '';
        }
        if (typeof window._onTaskCurrencyChange === 'function') window._onTaskCurrencyChange();
      }, 60);
      return r;
    };
    window.openTaskModal._curHooked = true;
    return true;
  }

  // عند فتح modal الـ project task — اعمل sync للـ options + اضبط القيمة الافتراضية
  function hookOpenProjTaskModal() {
    if (typeof window.openProjTaskModal !== 'function') return false;
    if (window.openProjTaskModal._curHooked) return true;
    var orig = window.openProjTaskModal;
    window.openProjTaskModal = function(projId, taskId) {
      var r = orig.apply(this, arguments);
      setTimeout(function() {
        syncPtaskCurrencyOptions();
        var sel = document.getElementById('ptask-currency');
        if (!sel) return;
        // لو مهمة جديدة (مش taskId) — استخدم عملة المشروع كافتراضي
        if (!taskId && projId && window.S) {
          var p = (S.projects||[]).find(function(x){return String(x.id)===String(projId);});
          var defCur = (p && p.budgetCurrency) ? _normCur(p.budgetCurrency) : _curGlobal();
          sel.value = defCur;
        } else if (taskId && window.S) {
          var t = (S.project_tasks||[]).find(function(x){return String(x.id)===String(taskId);});
          if (t && t.currency) sel.value = _normCur(t.currency);
        }
      }, 60);
      return r;
    };
    window.openProjTaskModal._curHooked = true;
    return true;
  }

  // عند فتح modal المشروع — sync للعملة
  function hookOpenProjectModal() {
    if (typeof window.openProjectModal !== 'function') return false;
    if (window.openProjectModal._curHooked) return true;
    var orig = window.openProjectModal;
    window.openProjectModal = function(id) {
      var r = orig.apply(this, arguments);
      setTimeout(function() {
        syncProjectBudgetCurrencyOptions();
        var sel = document.getElementById('proj-budget-currency');
        if (!sel) return;
        // لو مشروع جديد — استخدم العملة الافتراضية
        if (!id) sel.value = _curGlobal();
      }, 60);
      return r;
    };
    window.openProjectModal._curHooked = true;
    return true;
  }

  // ════════════════════════════════════════════════
  // 4) DOM POST-PROCESSING — استبدال "ج" المُحفّز بالعملة الصحيحة
  // ════════════════════════════════════════════════
  // Regex بيتعامل مع: "1,000 ج" / "1,000 ج.م" / "1,000 EGP"
  // ولا يلامس كلمات عربية فيها "ج" (مثل: جديد، نتائج، إلخ)
  function _replaceTextCur(root, newCur) {
    if (!root || !newCur) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function(tn) {
      var v = tn.nodeValue;
      if (!v) return;
      if (!/ج|EGP/i.test(v)) return;
      var nv = v
        .replace(/(\d[\d,٬٫.]*)\s+ج\.م(?![\u0621-\u064A])/g, '$1 '+newCur)
        .replace(/(\d[\d,٬٫.]*)\s+ج(?!\.م)(?![\u0621-\u064A])/g, '$1 '+newCur)
        .replace(/(\d[\d,٬٫.]*)\s+EGP\b/gi, '$1 '+newCur);
      if (nv !== v) tn.nodeValue = nv;
    });
  }

  function _fixAllCurrencyDOM() {
    if (!window.S) return;

    // 1) كروت/صفوف المهام العادية
    document.querySelectorAll('[data-task-id]').forEach(function(el) {
      var id = el.getAttribute('data-task-id');
      if (!id) return;
      var t = (S.tasks||[]).find(function(x){return String(x.id)===String(id);});
      if (!t) return;
      var cur = _curForTask(t);
      el.setAttribute('data-cur-fixed', cur);
      _replaceTextCur(el, cur);
    });

    // [data-tid] بدون [data-pid] = مهمة عادية (في table view مثلاً)
    document.querySelectorAll('[data-tid]:not([data-pid])').forEach(function(el) {
      if (el.hasAttribute('data-cur-fixed')) return;
      var id = el.getAttribute('data-tid');
      if (!id || isNaN(+id)) return;
      var t = (S.tasks||[]).find(function(x){return String(x.id)===String(id);});
      if (!t) return;
      var cur = _curForTask(t);
      el.setAttribute('data-cur-fixed', cur);
      _replaceTextCur(el, cur);
    });

    // 2) project_tasks (عندها data-tid + data-pid)
    document.querySelectorAll('[data-tid][data-pid]').forEach(function(el) {
      if (el.hasAttribute('data-cur-fixed')) return;
      var tid = el.getAttribute('data-tid');
      var pid = el.getAttribute('data-pid');
      var t = (S.project_tasks||[]).find(function(x){
        return String(x.id)===String(tid) && String(x.project_id)===String(pid);
      });
      if (!t) return;
      var cur = _curForPtask(t);
      el.setAttribute('data-cur-fixed', cur);
      _replaceTextCur(el, cur);
    });

    // 3) كروت المشاريع (عندها onclick="openProjectDetail('...')" — مش بنعتمد عليه)
    //    بنعتمد على class='proj-card' لو فيها onclick بيشير لـ openProjectDetail
    document.querySelectorAll('.proj-card').forEach(function(el) {
      if (el.hasAttribute('data-cur-fixed')) return;
      // استخراج الـ project id من onclick
      var oc = el.getAttribute('onclick') || '';
      var m = oc.match(/openProjectDetail\(['"]?([^'")\s]+)/);
      if (!m) return;
      var pid = m[1];
      var p = (S.projects||[]).find(function(x){return String(x.id)===String(pid);});
      if (!p) return;
      var cur = _curForProj(p);
      el.setAttribute('data-cur-fixed', cur);
      _replaceTextCur(el, cur);
    });

    // 4) لو العملة الافتراضية مش "ج.م" — استبدل في باقي الصفحات (داش بورد، ماليه، فواتير...)
    var globalCur = _curGlobal();
    if (globalCur && globalCur !== 'ج' && globalCur !== 'ج.م') {
      var pages = [
        '#dash-page', '#finance-page', '#invoices-page',
        '#tasks-page', '#clients-page', '#projects-page',
        '#proposals-page', '#reviews-page', '#contracts-page',
        '.modal-overlay'  // modal-task-detail والمشابه
      ];
      pages.forEach(function(sel) {
        document.querySelectorAll(sel).forEach(function(pg) {
          // نمشي على text nodes ونتجاهل العناصر المُعلَّمة بـ data-cur-fixed
          var walker = document.createTreeWalker(pg, NodeFilter.SHOW_TEXT, {
            acceptNode: function(node) {
              var p = node.parentElement;
              while (p && p !== pg) {
                if (p.hasAttribute && p.hasAttribute('data-cur-fixed')) return NodeFilter.FILTER_REJECT;
                p = p.parentElement;
              }
              return NodeFilter.FILTER_ACCEPT;
            }
          });
          var ns = [];
          while (walker.nextNode()) ns.push(walker.currentNode);
          ns.forEach(function(tn) {
            var v = tn.nodeValue;
            if (!v || !/ج|EGP/i.test(v)) return;
            var nv = v
              .replace(/(\d[\d,٬٫.]*)\s+ج\.م(?![\u0621-\u064A])/g, '$1 '+globalCur)
              .replace(/(\d[\d,٬٫.]*)\s+ج(?!\.م)(?![\u0621-\u064A])/g, '$1 '+globalCur)
              .replace(/(\d[\d,٬٫.]*)\s+EGP\b/gi, '$1 '+globalCur);
            if (nv !== v) tn.nodeValue = nv;
          });
        });
      });
    }
  }

  // النسخة المُؤجَّلة (لتقليل عدد التشغيلات)
  var _fixTimer = null;
  function _scheduleFix() {
    if (_fixTimer) clearTimeout(_fixTimer);
    _fixTimer = setTimeout(_fixAllCurrencyDOM, 60);
  }
  window._fixAllCurrencyDOM = _fixAllCurrencyDOM;
  window._scheduleFix       = _scheduleFix;

  // ════════════════════════════════════════════════
  // 5) RENDER HOOKS — تشغيل DOM fix بعد كل render
  // ════════════════════════════════════════════════
  function hookRender(fn) {
    if (typeof window[fn] !== 'function') return false;
    if (window[fn]._curHooked) return true;
    var orig = window[fn];
    window[fn] = function() {
      var r = orig.apply(this, arguments);
      _scheduleFix();
      return r;
    };
    window[fn]._curHooked = true;
    return true;
  }

  function installRenderHooks() {
    var fns = [
      'renderTasks', '_renderTasksTable', '_renderAllTasksList',
      '_renderProjectTasksList', 'renderProjectDetail', 'renderProjects',
      'renderClients', 'renderInvoices', 'renderFinance',
      'updateDash', 'renderDashTeamTasks', 'renderDashTeamPay',
      'renderDashKanbanMini', 'renderDashMeetings',
      'renderTimeTracker', 'renderSchedule', 'renderGoals', 'renderTeams',
      'renderMeetings', 'renderSalaryReminders', 'renderFollowupReminders',
      'renderContractsList', 'renderProposals', 'renderReviewsPage',
      'renderAll'
    ];
    fns.forEach(hookRender);
  }

  // hook فتح تفاصيل المهمة العادية
  function hookOpenTaskDetail() {
    if (typeof window.openTaskDetail !== 'function') return false;
    if (window.openTaskDetail._curHooked) return true;
    var orig = window.openTaskDetail;
    window.openTaskDetail = function(id) {
      var r = orig.apply(this, arguments);
      setTimeout(function() {
        if (!window.S) return;
        var t = (S.tasks||[]).find(function(x){return x.id===id;});
        if (!t) return;
        var cur = _curForTask(t);
        var body = document.getElementById('td-body');
        if (body) {
          body.setAttribute('data-cur-fixed', cur);
          _replaceTextCur(body, cur);
        }
      }, 70);
      return r;
    };
    window.openTaskDetail._curHooked = true;
    return true;
  }

  // hook فتح تفاصيل project task
  function hookOpenProjTaskDetail() {
    if (typeof window.openProjTaskDetail !== 'function') return false;
    if (window.openProjTaskDetail._curHooked) return true;
    var orig = window.openProjTaskDetail;
    window.openProjTaskDetail = function(tid, pid) {
      var r = orig.apply(this, arguments);
      setTimeout(function() {
        if (!window.S) return;
        var t = (S.project_tasks||[]).find(function(x){return String(x.id)===String(tid);});
        if (!t) return;
        var cur = _curForPtask(t);
        // ابحث عن الـ modal بأي اسم
        ['modal-proj-task-detail','modal-ptask-detail','modal-project-task-detail'].forEach(function(mid) {
          var m = document.getElementById(mid);
          if (m) {
            m.setAttribute('data-cur-fixed', cur);
            _replaceTextCur(m, cur);
          }
        });
      }, 70);
      return r;
    };
    window.openProjTaskDetail._curHooked = true;
    return true;
  }

  // hook فتح profile العميل — يعمل re-fix لما الصفحة تتفتح
  function hookOpenClientProfile() {
    if (typeof window.openClientProfile !== 'function') return false;
    if (window.openClientProfile._curHooked) return true;
    var orig = window.openClientProfile;
    window.openClientProfile = function() {
      var r = orig.apply(this, arguments);
      _scheduleFix();
      [200, 500, 1000].forEach(function(d){ setTimeout(_fixAllCurrencyDOM, d); });
      return r;
    };
    window.openClientProfile._curHooked = true;
    return true;
  }

  // hook فتح project detail — re-fix بعد render
  function hookOpenProjectDetail() {
    if (typeof window.openProjectDetail !== 'function') return false;
    if (window.openProjectDetail._curHooked) return true;
    var orig = window.openProjectDetail;
    window.openProjectDetail = function() {
      var r = orig.apply(this, arguments);
      _scheduleFix();
      [200, 500].forEach(function(d){ setTimeout(_fixAllCurrencyDOM, d); });
      return r;
    };
    window.openProjectDetail._curHooked = true;
    return true;
  }

  // ════════════════════════════════════════════════
  // 6) SETTINGS HOOK — لما العملة تتغير اعمل refresh لكل حاجة
  // ════════════════════════════════════════════════
  function hookSaveSettings() {
    if (typeof window.saveSettings !== 'function') return false;
    if (window.saveSettings._curHooked) return true;
    var orig = window.saveSettings;
    window.saveSettings = function() {
      var oldCur = _curGlobal();
      var r = orig.apply(this, arguments);
      var newCur = _curGlobal();
      if (oldCur !== newCur) {
        // امسح كل علامات data-cur-fixed علشان نعيد التطبيق بالعملة الجديدة
        document.querySelectorAll('[data-cur-fixed]').forEach(function(el){
          el.removeAttribute('data-cur-fixed');
        });
        setTimeout(function() {
          if (typeof renderAll === 'function') {
            try { renderAll(); } catch(e){}
          }
          _scheduleFix();
          [250, 600, 1200].forEach(function(d){ setTimeout(_fixAllCurrencyDOM, d); });
        }, 80);
        if (typeof toast === 'function') {
          setTimeout(function(){
            toast('<i class="fa-solid fa-coins" style="color:var(--accent3)"></i> تم تحديث العملة في كل الشاشات');
          }, 400);
        }
      } else {
        _scheduleFix();
      }
      return r;
    };
    window.saveSettings._curHooked = true;
    return true;
  }

  // ════════════════════════════════════════════════
  // 7) MUTATION OBSERVER — يكتشف أي render جديد ويصلّح العملة
  // ════════════════════════════════════════════════
  function setupMutationObserver() {
    if (window._curObserver) return;
    if (typeof MutationObserver === 'undefined') return;
    var obs = new MutationObserver(function(muts) {
      var hasNew = false;
      for (var i=0; i<muts.length; i++) {
        var m = muts[i];
        if (m.type === 'childList' && m.addedNodes.length) {
          for (var j=0; j<m.addedNodes.length; j++) {
            var n = m.addedNodes[j];
            if (n.nodeType === 1 && (
              (n.querySelector && (n.querySelector('[data-task-id], [data-tid], .proj-card') )) ||
              (n.matches && n.matches('[data-task-id], [data-tid], .proj-card'))
            )) {
              hasNew = true; break;
            }
          }
          if (hasNew) break;
        }
      }
      if (hasNew) _scheduleFix();
    });
    obs.observe(document.body, { childList: true, subtree: true });
    window._curObserver = obs;
  }

  // ════════════════════════════════════════════════
  // 8) INITIALIZATION
  // ════════════════════════════════════════════════
  function init() {
    // محاولة حقن الـ UI الآن (لو الـ modal موجود في الـ DOM)
    injectTaskCurrencyUI();
    syncProjectBudgetCurrencyOptions();
    syncPtaskCurrencyOptions();

    // تثبيت كل الـ hooks
    hookSaveTask();
    hookOpenTaskModal();
    hookOpenTaskDetail();
    hookOpenProjTaskModal();
    hookOpenProjTaskDetail();
    hookOpenProjectModal();
    hookOpenProjectDetail();
    hookOpenClientProfile();
    hookSaveSettings();
    installRenderHooks();
    setupMutationObserver();

    // Initial fix + repeated attempts (للـ delayed renders)
    _scheduleFix();
    [200, 500, 1500, 3000, 5000].forEach(function(d){ setTimeout(_fixAllCurrencyDOM, d); });

    console.log('[Ordo] currency_patch.js v1.0 loaded ✓ — global cur:', _curGlobal());
  }

  function tryInit() {
    if (typeof window.S === 'undefined' || !window.S) {
      return setTimeout(tryInit, 200);
    }
    init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInit);
  } else {
    tryInit();
  }

  // إعادة محاولة حقن الـ UI لما المهمة تتفتح (ضمان)
  document.addEventListener('click', function(e) {
    var target = e.target;
    if (!target || !target.closest) return;
    var trigger = target.closest('[onclick*="openTaskModal"]');
    if (trigger) {
      setTimeout(injectTaskCurrencyUI, 60);
      setTimeout(injectTaskCurrencyUI, 250);
    }
  }, true);

})();

try{ if(window.OrdoPlugins) window.OrdoPlugins.register('currency', function(){}); }catch(e){}

/* ===== END CURRENCY PATCH ===== */


/* ===== BEGIN WALLETS USER PATCH + REDESIGN (wallets_user_patch.js) ===== */
(function(){
  'use strict';

  var DEFAULT_CURRENCIES = [
    {code:'EGP', symbol:'ج.م', label:'جنيه مصري', enabled:true},
    {code:'USD', symbol:'$', label:'دولار أمريكي', enabled:true},
    {code:'SAR', symbol:'ر.س', label:'ريال سعودي', enabled:false},
    {code:'AED', symbol:'AED', label:'درهم إماراتي', enabled:false},
    {code:'EUR', symbol:'€', label:'يورو', enabled:false},
    {code:'KWD', symbol:'د.ك', label:'دينار كويتي', enabled:false},
    {code:'QAR', symbol:'ر.ق', label:'ريال قطري', enabled:false}
  ];

  function st(){ return window.S || (window.S = {}); }
  function now(){ return new Date().toISOString(); }
  function num(v){ return Number(v || 0) || 0; }
  function esc(v){
    if(window.escapeHtml) return window.escapeHtml(v);
    return String(v == null ? '' : v).replace(/[&<>"']/g, function(ch){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]; });
  }
  function uid(p){ return (p || 'id') + '_' + Date.now() + '_' + Math.random().toString(16).slice(2,8); }
  function allCurrencies(){
    var s = st();
    var saved = s.settings && Array.isArray(s.settings.enabled_currencies) ? s.settings.enabled_currencies : [];
    var map = {};
    DEFAULT_CURRENCIES.forEach(function(c){ map[c.code] = Object.assign({}, c); });
    saved.forEach(function(c){
      var code = c.code || c.currency_code;
      if(code) map[code] = Object.assign({}, map[code] || {}, c, {code:code});
    });
    return Object.keys(map).map(function(k){ return map[k]; });
  }
  function meta(value){
    var s = st();
    var v = value || (s.settings && (s.settings.base_currency_code || s.settings.base_currency || s.settings.currency)) || 'EGP';
    return allCurrencies().find(function(c){ return c.code === v || c.symbol === v || c.label === v; }) || DEFAULT_CURRENCIES[0];
  }
  function enabledCurrencies(includeWalletBalance){
    var list = allCurrencies().filter(function(c){ return c.enabled !== false; });
    if(includeWalletBalance){
      (st().wallets || []).forEach(function(w){
        if(num(w.balance) !== 0 && !list.some(function(c){ return c.code === w.currency_code; })) list.push(meta(w.currency_code));
      });
    }
    return list;
  }
  function baseCurrency(){ return meta(st().settings && (st().settings.base_currency_code || st().settings.base_currency || st().settings.currency)); }
  function fmt(amount, currencyOrEntity){
    var c = typeof currencyOrEntity === 'string' ? meta(currencyOrEntity) : meta(currencyOrEntity && (currencyOrEntity.currency_code || currencyOrEntity.currency || currencyOrEntity.currency_symbol));
    return num(amount).toLocaleString() + ' ' + c.symbol;
  }
  function options(selected, includeWalletBalance){
    var sel = meta(selected || baseCurrency().code).code;
    return enabledCurrencies(!!includeWalletBalance).map(function(c){
      return '<option value="'+c.code+'" '+(c.code === sel ? 'selected' : '')+'>'+c.label+' ('+c.symbol+')</option>';
    }).join('');
  }
  function ensureState(){
    var s = st();
    s.settings = s.settings || {};
    if(!Array.isArray(s.settings.enabled_currencies)) s.settings.enabled_currencies = DEFAULT_CURRENCIES.map(function(c){ return Object.assign({}, c); });
    if(!s.settings.base_currency_code){
      var b = meta(s.settings.base_currency || s.settings.currency || 'EGP');
      s.settings.base_currency_code = b.code;
      s.settings.base_currency = b.symbol;
      s.settings.currency = s.settings.currency || b.symbol;
    }
    s.wallets = Array.isArray(s.wallets) ? s.wallets : [];
    s.wallet_transfers = Array.isArray(s.wallet_transfers) ? s.wallet_transfers : [];
    s.temp_todo_lists = Array.isArray(s.temp_todo_lists) ? s.temp_todo_lists : [];
    enabledCurrencies(false).forEach(function(c){ ensureWallet(c.code); });
    (s.tasks || []).forEach(function(t){ normalizeMoney(t); });
    (s.transactions || []).forEach(function(t){ normalizeMoney(t); });
  }
  function normalizeMoney(entity){
    if(!entity) return entity;
    var c = meta(entity.currency_code || entity.currency || entity.currency_symbol || baseCurrency().code);
    entity.currency_code = c.code;
    entity.currency_symbol = c.symbol;
    entity.currency = c.code;
    return entity;
  }
  function ensureWallet(code){
    var s = st(), c = meta(code);
    s.wallets = Array.isArray(s.wallets) ? s.wallets : [];
    var w = s.wallets.find(function(x){ return x.currency_code === c.code; });
    if(!w){
      w = {id:uid('wallet'), currency_code:c.code, currency_symbol:c.symbol, currency_label:c.label, balance:0, createdAt:now(), updatedAt:now(), _dirty:true};
      s.wallets.push(w);
    } else {
      w.currency_symbol = c.symbol;
      w.currency_label = c.label;
    }
    return w;
  }
  function touch(type, entity){
    if(!entity) return;
    entity.updatedAt = now();
    entity._dirty = true;
    if(window.OrdoData && OrdoData.markDirty) OrdoData.markDirty(type, entity.id);
  }
  function save(){
    recalcWallets();
    if(window.OrdoData && OrdoData.saveDirty) OrdoData.saveDirty();
    else {
      if(typeof window.lsSave === 'function') window.lsSave();
      if(typeof window.cloudSave === 'function') window.cloudSave(st());
    }
  }
  function groupTotals(txs){
    var totals = {};
    (txs || []).forEach(function(tx){
      var c = meta(tx.currency_code || tx.currency || tx.currency_symbol || baseCurrency().code);
      if(!totals[c.code]) totals[c.code] = {currency_code:c.code, currency_symbol:c.symbol, currency_label:c.label, income:0, expense:0, balance:0};
      var amount = num(tx.amount);
      if(tx.type === 'expense') totals[c.code].expense += amount;
      else totals[c.code].income += amount;
      totals[c.code].balance = totals[c.code].income - totals[c.code].expense;
    });
    return totals;
  }
  function recalcWallets(){
    ensureState();
    var s = st();
    var totals = groupTotals((s.transactions || []).filter(function(tx){ return tx.source_type !== 'wallet_transfer'; }));
    (s.wallet_transfers || []).forEach(function(tr){
      var from = meta(tr.from_currency), to = meta(tr.to_currency);
      totals[from.code] = totals[from.code] || {currency_code:from.code, currency_symbol:from.symbol, currency_label:from.label, income:0, expense:0, balance:0};
      totals[to.code] = totals[to.code] || {currency_code:to.code, currency_symbol:to.symbol, currency_label:to.label, income:0, expense:0, balance:0};
      totals[from.code].expense += num(tr.from_amount);
      totals[to.code].income += num(tr.to_amount);
      totals[from.code].balance = totals[from.code].income - totals[from.code].expense;
      totals[to.code].balance = totals[to.code].income - totals[to.code].expense;
    });
    Object.keys(totals).forEach(function(code){
      var w = ensureWallet(code);
      w.balance = totals[code].balance;
      w.updatedAt = now();
    });
  }
  function walletSummary(code){
    recalcWallets();
    var c = meta(code);
    var totals = groupTotals((st().transactions || []).filter(function(tx){ return tx.source_type !== 'wallet_transfer' && meta(tx.currency_code || tx.currency || tx.currency_symbol).code === c.code; }));
    var s = totals[c.code] || {income:0, expense:0, balance:0};
    var w = (st().wallets || []).find(function(x){ return x.currency_code === c.code; });
    return Object.assign({}, s, {balance:w ? num(w.balance) : 0});
  }

  function fillTaskCurrency(){
    ensureState();
    var sel = document.getElementById('t-currency');
    if(!sel) return;
    var eid = document.getElementById('task-eid') && document.getElementById('task-eid').value;
    var task = eid ? (st().tasks || []).find(function(t){ return String(t.id) === String(eid); }) : null;
    var current = task ? (task.currency_code || task.currency || task.currency_symbol) : baseCurrency().code;
    sel.innerHTML = options(current, false);
    sel.onchange = updateTaskLabels;
    updateTaskLabels();
  }
  function updateTaskLabels(){
    var c = meta(document.getElementById('t-currency') && document.getElementById('t-currency').value);
    var valueLabel = document.getElementById('t-value-label');
    var depositLabel = document.getElementById('t-deposit-label');
    if(valueLabel) valueLabel.textContent = 'قيمة المشروع (' + c.symbol + ')';
    if(depositLabel) depositLabel.textContent = 'قيمة العربون المدفوع (' + c.symbol + ')';
  }
  function renderSettings(){
    ensureState();
    var base = document.getElementById('studio-base-currency');
    var checks = document.getElementById('studio-enabled-currencies');
    if(base) base.innerHTML = allCurrencies().map(function(c){
      return '<option value="'+c.code+'" '+(c.code === baseCurrency().code ? 'selected' : '')+'>'+c.label+' ('+c.symbol+')</option>';
    }).join('');
    var legacy = document.getElementById('set-currency');
    if(legacy) legacy.value = baseCurrency().symbol;
    if(checks) checks.innerHTML = allCurrencies().map(function(c){
      return '<label class="ordo-currency-check"><input type="checkbox" value="'+c.code+'" '+(c.enabled !== false ? 'checked' : '')+'> <span>'+c.label+'</span><b>'+c.symbol+'</b></label>';
    }).join('');
  }
  window.saveStudioCurrencies = function(){
    ensureState();
    var base = document.getElementById('studio-base-currency') && document.getElementById('studio-base-currency').value || 'EGP';
    var enabled = Array.prototype.slice.call(document.querySelectorAll('#studio-enabled-currencies input:checked')).map(function(i){ return i.value; });
    if(enabled.indexOf(base) === -1) enabled.push(base);
    st().settings.enabled_currencies = DEFAULT_CURRENCIES.map(function(c){ return Object.assign({}, c, {enabled:enabled.indexOf(c.code) > -1}); });
    var b = meta(base);
    st().settings.base_currency_code = b.code;
    st().settings.base_currency = b.symbol;
    st().settings.currency = b.symbol;
    var legacy = document.getElementById('set-currency');
    if(legacy) legacy.value = b.symbol;
    enabledCurrencies(false).forEach(function(c){ ensureWallet(c.code); });
    st().settings.updatedAt = now();
    st().settings._dirty = true;
    save();
    renderSettings();
    fillTaskCurrency();
    renderWallets();
    if(typeof window.toast === 'function') window.toast('تم حفظ العملات والمحافظ');
  };
  function renderWallets(){
    ensureState();
    recalcWallets();
    var grid = document.getElementById('wallets-grid') || document.getElementById('ordo-wallets-grid');
    if(!grid) return;
    var wallets = (st().wallets || []).filter(function(w){
      var c = meta(w.currency_code);
      return c.enabled !== false || num(w.balance) !== 0;
    });
    grid.innerHTML = wallets.length ? wallets.map(function(w){
      var s = walletSummary(w.currency_code);
      return '<div class="ordo-wallet-card">'+
        '<div style="font-size:13px;font-weight:900">'+(w.currency_label || w.currency_code)+'</div>'+
        '<div style="font-size:11px;color:var(--text3);margin-top:2px">'+w.currency_code+' · '+w.currency_symbol+'</div>'+
        '<div class="ordo-wallet-balance">'+fmt(s.balance, w.currency_code)+'</div>'+
        '<div class="ordo-wallet-lines"><span>الداخل: <b style="color:var(--accent3)">'+fmt(s.income, w.currency_code)+'</b></span><span>الخارج: <b style="color:var(--accent4)">'+fmt(s.expense, w.currency_code)+'</b></span></div>'+
      '</div>';
    }).join('') : '<div class="empty" style="padding:18px">لا توجد محافظ بعد</div>';
  }
  function ensureTransferModal(){
    if(document.getElementById('wallet-transfer-modal')) return;
    var div = document.createElement('div');
    div.className = 'modal-overlay';
    div.id = 'wallet-transfer-modal';
    div.innerHTML = '<div class="modal" style="max-width:560px">'+
      '<div class="modal-header"><div class="modal-title"><i class="fa-solid fa-right-left"></i> تسوية / تحويل بين المحافظ</div><button class="close-btn" onclick="closeM(\'wallet-transfer-modal\')"><i class="fa-solid fa-xmark"></i></button></div>'+
      '<div class="form-row"><div class="form-group"><label class="form-label">من محفظة</label><select class="form-select" id="wtr-from"></select></div><div class="form-group"><label class="form-label">إلى محفظة</label><select class="form-select" id="wtr-to"></select></div></div>'+
      '<div class="form-row"><div class="form-group"><label class="form-label">المبلغ الخارج</label><input class="form-input" type="number" id="wtr-from-amount" placeholder="0"></div><div class="form-group"><label class="form-label">المبلغ الداخل</label><input class="form-input" type="number" id="wtr-to-amount" placeholder="0"></div></div>'+
      '<div class="form-group"><label class="form-label">ملاحظة</label><textarea class="form-textarea" id="wtr-note" rows="2"></textarea></div>'+
      '<div style="display:flex;gap:10px;justify-content:flex-end"><button class="btn btn-ghost" onclick="closeM(\'wallet-transfer-modal\')">إلغاء</button><button class="btn btn-success" onclick="saveWalletTransfer()">حفظ التحويل</button></div>'+
    '</div>';
    document.body.appendChild(div);
  }
  window.openWalletTransferModal = function(){
    ensureState();
    ensureTransferModal();
    document.getElementById('wtr-from').innerHTML = options(baseCurrency().code, true);
    document.getElementById('wtr-to').innerHTML = options(enabledCurrencies(true)[1] && enabledCurrencies(true)[1].code || baseCurrency().code, true);
    ['wtr-from-amount','wtr-to-amount','wtr-note'].forEach(function(id){ var el = document.getElementById(id); if(el) el.value = ''; });
    if(typeof window.openM === 'function') window.openM('wallet-transfer-modal');
  };
  window.saveWalletTransfer = function(){
    ensureState();
    var from = meta(document.getElementById('wtr-from').value);
    var to = meta(document.getElementById('wtr-to').value);
    var out = num(document.getElementById('wtr-from-amount').value);
    var inc = num(document.getElementById('wtr-to-amount').value);
    if(from.code === to.code) return alert('اختر محفظتين مختلفتين');
    if(!out || !inc) return alert('أدخل المبلغ الخارج والداخل');
    var tr = {id:uid('wtr'), from_currency:from.code, to_currency:to.code, from_amount:out, to_amount:inc, exchange_rate:inc/out, note:document.getElementById('wtr-note').value || '', createdAt:now(), updatedAt:now(), _dirty:true};
    st().wallet_transfers.push(tr);
    st().transactions = Array.isArray(st().transactions) ? st().transactions : [];
    st().transactions.push({id:uid('tx'), type:'expense', amount:out, currency_code:from.code, currency_symbol:from.symbol, source_type:'wallet_transfer', source_id:tr.id, desc:'تحويل بين المحافظ', createdAt:now(), updatedAt:now(), _dirty:true});
    st().transactions.push({id:uid('tx'), type:'income', amount:inc, currency_code:to.code, currency_symbol:to.symbol, source_type:'wallet_transfer', source_id:tr.id, desc:'تحويل بين المحافظ', createdAt:now(), updatedAt:now(), _dirty:true});
    save();
    if(typeof window.closeM === 'function') window.closeM('wallet-transfer-modal');
    renderWallets();
  };

  var CP1256 = {"\u20ac":128,"\u067e":129,"\u201a":130,"\u0192":131,"\u201e":132,"\u2026":133,"\u2020":134,"\u2021":135,"\u02c6":136,"\u2030":137,"\u0679":138,"\u2039":139,"\u0152":140,"\u0686":141,"\u0698":142,"\u0688":143,"\u06af":144,"\u2018":145,"\u2019":146,"\u201c":147,"\u201d":148,"\u2022":149,"\u2013":150,"\u2014":151,"\u06a9":152,"\u2122":153,"\u0691":154,"\u203a":155,"\u0153":156,"\u200c":157,"\u200d":158,"\u06ba":159,"\u00a0":160,"\u060c":161,"\u00a2":162,"\u00a3":163,"\u00a4":164,"\u00a5":165,"\u00a6":166,"\u00a7":167,"\u00a8":168,"\u00a9":169,"\u06be":170,"\u00ab":171,"\u00ac":172,"\u00ad":173,"\u00ae":174,"\u00af":175,"\u00b0":176,"\u00b1":177,"\u00b2":178,"\u00b3":179,"\u00b4":180,"\u00b5":181,"\u00b6":182,"\u00b7":183,"\u00b8":184,"\u00b9":185,"\u061b":186,"\u00bb":187,"\u00bc":188,"\u00bd":189,"\u00be":190,"\u061f":191,"\u06c1":192,"\u0621":193,"\u0622":194,"\u0623":195,"\u0624":196,"\u0625":197,"\u0626":198,"\u0627":199,"\u0628":200,"\u0629":201,"\u062a":202,"\u062b":203,"\u062c":204,"\u062d":205,"\u062e":206,"\u062f":207,"\u0630":208,"\u0631":209,"\u0632":210,"\u0633":211,"\u0634":212,"\u0635":213,"\u0636":214,"\u00d7":215,"\u0637":216,"\u0638":217,"\u0639":218,"\u063a":219,"\u0640":220,"\u0641":221,"\u0642":222,"\u0643":223,"\u00e0":224,"\u0644":225,"\u00e2":226,"\u0645":227,"\u0646":228,"\u0647":229,"\u0648":230,"\u00e7":231,"\u00e8":232,"\u00e9":233,"\u00ea":234,"\u00eb":235,"\u0649":236,"\u064a":237,"\u00ee":238,"\u00ef":239,"\u064b":240,"\u064c":241,"\u064d":242,"\u064e":243,"\u00f4":244,"\u064f":245,"\u0650":246,"\u00f7":247,"\u0651":248,"\u00f9":249,"\u0652":250,"\u00fb":251,"\u00fc":252,"\u200e":253,"\u200f":254,"\u06d2":255};
  var MOJI_MARKERS = /[طظآâںگڈ€¦œکï¸]/;
  function _mojiScore(str){
    var m = str.match(/[طظآâںگڈ€¦œکï¸]/g);
    return m ? m.length : 0;
  }
  function _decodeCp1256Utf8(str){
    try{
      var bytes = [];
      for(var i=0;i<str.length;i++){
        var ch = str.charAt(i);
        var code = str.charCodeAt(i);
        if(code < 128) bytes.push(code);
        else if(CP1256[ch] !== undefined) bytes.push(CP1256[ch]);
        else return null;
      }
      var decoded = new TextDecoder('utf-8', {fatal:true}).decode(new Uint8Array(bytes));
      if(!/[\u0600-\u06FF]/.test(decoded)) return null;
      if(_mojiScore(decoded) >= _mojiScore(str)) return null;
      return decoded;
    }catch(e){ return null; }
  }
  function fixMojibakeText(str){
    if(!str) return str;
    var out = String(str);
    if(MOJI_MARKERS.test(out)){
      out = out.replace(/[^\x00-\x7F<>{}$`"']+/g, function(part){ return _decodeCp1256Utf8(part) || part; });
    }
    var pairs = [
      ['\u00c3\u00a2\u00e2\u201a\u00ac\u00e2\u20ac\u0153','\u2014'], ['\u00c3\u00a2\u00e2\u20ac\u00a0\u00e2\u20ac\u2122','\u2192'], ['\u00c3\u00a2\u00e2\u201a\u00ac\u00c2\u00a2','\u2022'], ['\u00c3\u00a2\u0152\u2026','\u2705'],
      ['\u00c3\u00a2\u00c2\u00ad\u0639\u00af','\u2605'], ['\u00c3\u00a2\u0639\u00a9\u00e2\u20ac\u00a6','\u2605'], ['\u00c3\u00a2\u0639\u00a9\u00e2\u20ac\u00a0','\u2606'], ['\u00c3\u00a2\u0639\u02c6\u00c2\u00b3','\u23f3'],
      ['\u00c3\u00a2\u0639\u2018\u00d8\u0152','\u26a1'], ['\u00c3\u00a2\u00e2\u20ac\u00a0\u00c2\u00a9','\u21a9'], ['\u00d8\u00a2\u00c2\u00b7','\u00b7'], ['\u00d8\u00a2\u00c2\u00ab','\u00ab'], ['\u00d8\u00a2\u00c2\u00bb','\u00bb'],
      ['\u00e2\u00ad\u06af','\u2605'], ['\u00e2\u0691\u060c','\u26a1'], ['\u00e2\u0691\u00a0','\u26a0'], ['\u00e2\u00ac\u2020','\u2b06'], ['\u00e2\u2013\u00bc','\u25bc'], ['\u00e2\u2013\u00be','\u25be'],
      ['\u00e2\u06a9\u2026','\u2705'], ['\u00e2\u06a9\u2020','\u2713'], ['\u00e2\u0688\u00b3','\u23f3'], ['\u00e2\u2020\u00a9','\u21a9'], ['\u00e2\u2020\u2019','\u2192'],
      ['\u00e2\u20ac\u201d','\u2014'], ['\u00e2\u20ac\u201c','\u2013'], ['\u00e2\u20ac\u00a2','\u2022'], ['\u00e2\u0153\u2026','\u2705'], ['\u00c2\u00b7','\u00b7'], ['\u00c2\u00ab','\u00ab'], ['\u00c2\u00bb','\u00bb']
    ];
    pairs.forEach(function(pair){ out = out.split(pair[0]).join(pair[1]); });
    return out;
  }
  function fixMojibakeDom(root){
    root = root || document.body;
    if(!root) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode:function(node){
        if(!node.nodeValue || !MOJI_MARKERS.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
        var p = node.parentElement;
        if(p && /^(SCRIPT|STYLE|TEXTAREA|INPUT)$/i.test(p.tagName)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [], n;
    while(n = walker.nextNode()) nodes.push(n);
    nodes.forEach(function(node){
      var fixed = fixMojibakeText(node.nodeValue);
      if(fixed !== node.nodeValue) node.nodeValue = fixed;
    });
    Array.prototype.slice.call(root.querySelectorAll('[title],[placeholder],[aria-label]')).forEach(function(el){
      ['title','placeholder','aria-label'].forEach(function(attr){
        var v = el.getAttribute(attr);
        var fixed = fixMojibakeText(v);
        if(fixed !== v) el.setAttribute(attr, fixed);
      });
    });
  }

  function ensureTempTodoState(){
    var s = st();
    s.temp_todo_lists = Array.isArray(s.temp_todo_lists) ? s.temp_todo_lists : [];
  }
  function tempListById(id){
    return (st().temp_todo_lists || []).find(function(list){ return String(list.id) === String(id); });
  }
  function touchTemp(list){
    if(!list) return;
    list.updatedAt = now();
    list._dirty = true;
    if(window.OrdoData && OrdoData.markDirty) OrdoData.markDirty('temp_todo_lists', list.id);
  }
  function injectTempTodoPage(){
    ensureTempTodoState();
    var old = document.getElementById('temp-todo-page-section');
    if(old) old.remove();
    return;
    var page = document.getElementById('page-tasks');
    if(!page || document.getElementById('temp-todo-page-section')) return;
    var header = page.querySelector('.page-header');
    var section = document.createElement('div');
    section.className = 'card';
    section.id = 'temp-todo-page-section';
    section.style.marginBottom = '16px';
    section.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">'+
        '<div><div class="section-title" style="margin:0"><i class="fa-solid fa-list-check" style="color:var(--accent)"></i> مهام مؤقتة / Todo Lists</div>'+
        '<div style="font-size:12px;color:var(--text3);margin-top:4px">قوائم سريعة مستقلة عن العملاء والفواتير والمشاريع</div></div>'+
        '<button class="btn btn-primary btn-sm" onclick="createTempTodoList()"><i class="fa-solid fa-plus"></i> قائمة مؤقتة جديدة</button>'+
      '</div>'+
      '<div id="temp-todo-page-list"></div>';
    if(header && header.nextSibling) page.insertBefore(section, header.nextSibling);
    else page.insertBefore(section, page.firstChild);
    renderTempTodoPage();
  }
  function renderTempTodoPage(){
    ensureTempTodoState();
    var el = document.getElementById('temp-todo-page-list');
    if(!el) return;
    var lists = (st().temp_todo_lists || []).slice().sort(function(a,b){
      return Number(!!a.archived) - Number(!!b.archived) || String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''));
    });
    if(!lists.length){
      el.innerHTML = '<div class="empty" style="padding:20px">لا توجد قوائم مؤقتة بعد</div>';
      return;
    }
    el.innerHTML = lists.map(function(list){
      var items = Array.isArray(list.items) ? list.items : [];
      var done = items.filter(function(item){ return item.done; }).length;
      var pct = items.length ? Math.round(done / items.length * 100) : 0;
      return '<div class="ordo-temp-list '+(list.archived?'is-archived':'')+'">'+
        '<div class="ordo-temp-head"><div><div style="font-weight:900">'+esc(list.title || 'قائمة مؤقتة')+'</div>'+
        '<div style="font-size:11px;color:var(--text3);margin-top:3px">سجل: إنشاء '+String(list.createdAt||'').slice(0,10)+' · آخر تعديل '+String(list.updatedAt||list.createdAt||'').slice(0,10)+' · '+items.length+' عناصر · '+done+' مكتمل · '+pct+'%</div></div>'+
        '<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-ghost btn-sm" onclick="addTempTodoItem(\''+list.id+'\')"><i class="fa-solid fa-plus"></i> عنصر</button><button class="btn btn-ghost btn-sm" onclick="renameTempTodoList(\''+list.id+'\')"><i class="fa-solid fa-pen"></i></button><button class="btn btn-ghost btn-sm" onclick="archiveTempTodoList(\''+list.id+'\','+(!list.archived)+')">'+(list.archived?'إعادة فتح':'أرشفة')+'</button><button class="btn btn-danger btn-sm" onclick="deleteTempTodoList(\''+list.id+'\')"><i class="fa-solid fa-trash"></i></button></div></div>'+
        '<div class="ordo-temp-progress"><span style="width:'+pct+'%"></span></div>'+
        '<div class="ordo-temp-items">'+(items.length ? items.map(function(item){
          return '<div class="ordo-temp-item '+(item.done?'done':'')+'"><label><input type="checkbox" '+(item.done?'checked':'')+' onchange="toggleTempTodoItem(\''+list.id+'\',\''+item.id+'\')"> <span>'+esc(item.text||'')+'</span></label><div><button class="icon-btn" onclick="editTempTodoItem(\''+list.id+'\',\''+item.id+'\')" title="تعديل"><i class="fa-solid fa-pen"></i></button><button class="icon-btn" onclick="deleteTempTodoItem(\''+list.id+'\',\''+item.id+'\')" title="حذف"><i class="fa-solid fa-xmark"></i></button></div></div>';
        }).join('') : '<div style="font-size:12px;color:var(--text3);padding:8px 0">لا توجد عناصر داخل القائمة</div>')+'</div>'+
      '</div>';
    }).join('');
    fixMojibakeDom(el);
  }

  var REDESIGN_PAGE_LABELS = {
    dashboard: 'لوحة التحكم',
    tasks: 'المهام',
    projects: 'المشاريع',
    schedule: 'تنظيم اليوم',
    meetings: 'الميتنج',
    clients: 'قاعدة العملاء',
    finance: 'المالية',
    invoices: 'الفواتير والعقود',
    proposals: 'عروض الأسعار',
    services: 'متجري',
    support: 'الدعم والرسائل',
    team: 'فريق العمل',
    timetracker: 'تتبع الوقت',
    'freelancer-goals': 'الأهداف والإنجازات',
    vault: 'حساباتي',
    workspace: 'المساحة الحرة',
    reviews: 'التقييمات',
    settings: 'إعدادات النظام'
  };
  var REDESIGN_SECTION_LABELS = [
    'الرئيسية',
    'المال والعملاء',
    'خدماتي',
    'الفريق',
    'أدوات الفريلانسر',
    'الإعدادات'
  ];
  function pageFromOnclick(oc){
    var m = String(oc || '').match(/showPage\(['"]([^'"]+)['"]/);
    return m ? m[1] : '';
  }
  function applyRedesignRuntime(){
    if(!document.body) return;
    document.body.classList.remove('ordo-redesign-v2');
    document.documentElement.classList.remove('ordo-redesign-v2');
    return;
    var active = document.querySelector('.page.active');
    if(active && active.id) document.body.setAttribute('data-current-page', active.id.replace('page-',''));

    Array.prototype.slice.call(document.querySelectorAll('.nav-section-label')).forEach(function(el, i){
      if(REDESIGN_SECTION_LABELS[i]) el.textContent = REDESIGN_SECTION_LABELS[i];
    });
    Array.prototype.slice.call(document.querySelectorAll('.nav-item')).forEach(function(item){
      var page = pageFromOnclick(item.getAttribute('onclick'));
      if(!page || !REDESIGN_PAGE_LABELS[page]) return;
      var label = item.querySelector('.nav-label') || item.querySelector('span:not(.nav-icon):not(.nav-badge)');
      if(label) label.textContent = REDESIGN_PAGE_LABELS[page];
      item.setAttribute('title', REDESIGN_PAGE_LABELS[page]);
    });
    var headerTitle = document.getElementById('header-page-title');
    var current = document.body.getAttribute('data-current-page') || 'dashboard';
    if(headerTitle && REDESIGN_PAGE_LABELS[current]) headerTitle.textContent = REDESIGN_PAGE_LABELS[current];

    var brandSub = document.getElementById('_sidebar-logo-sub');
    if(brandSub) brandSub.textContent = 'Studio OS';
    var newTaskBtns = Array.prototype.slice.call(document.querySelectorAll('[onclick="openTaskModal()"]'));
    newTaskBtns.forEach(function(btn){
      if(btn && /ظ|ط|â/.test(btn.textContent || '')) btn.innerHTML = '<i class="fa-solid fa-plus" style="margin-left:4px"></i> مهمة جديدة';
    });
  }
  window.createTempTodoList = function(){
    ensureTempTodoState();
    var title = prompt('اسم القائمة المؤقتة');
    if(!title || !title.trim()) return;
    var t = now();
    st().temp_todo_lists.push({id:uid('tmp'), title:title.trim(), description:'', items:[], archived:false, createdAt:t, updatedAt:t, _dirty:true});
    save(); renderTempTodoPage();
  };
  window.renameTempTodoList = function(id){
    var list = tempListById(id); if(!list) return;
    var title = prompt('اسم القائمة', list.title || '');
    if(title === null) return;
    list.title = title.trim() || list.title;
    touchTemp(list); save(); renderTempTodoPage();
  };
  window.addTempTodoItem = function(id){
    var list = tempListById(id); if(!list) return;
    var text = prompt('نص عنصر Todo');
    if(!text || !text.trim()) return;
    list.items = Array.isArray(list.items) ? list.items : [];
    list.items.push({id:uid('item'), text:text.trim(), done:false, createdAt:now(), completedAt:null});
    touchTemp(list); save(); renderTempTodoPage();
  };
  window.toggleTempTodoItem = function(listId,itemId){
    var list = tempListById(listId); if(!list) return;
    var item = (list.items || []).find(function(x){ return String(x.id) === String(itemId); });
    if(!item) return;
    item.done = !item.done;
    item.completedAt = item.done ? now() : null;
    touchTemp(list); save(); renderTempTodoPage();
  };
  window.editTempTodoItem = function(listId,itemId){
    var list = tempListById(listId); if(!list) return;
    var item = (list.items || []).find(function(x){ return String(x.id) === String(itemId); });
    if(!item) return;
    var text = prompt('تعديل العنصر', item.text || '');
    if(text === null) return;
    item.text = text.trim();
    touchTemp(list); save(); renderTempTodoPage();
  };
  window.deleteTempTodoItem = function(listId,itemId){
    var list = tempListById(listId); if(!list) return;
    list.items = (list.items || []).filter(function(x){ return String(x.id) !== String(itemId); });
    touchTemp(list); save(); renderTempTodoPage();
  };
  window.archiveTempTodoList = function(id, archived){
    var list = tempListById(id); if(!list) return;
    list.archived = !!archived;
    touchTemp(list); save(); renderTempTodoPage();
  };
  window.deleteTempTodoList = function(id){
    if(!confirm('حذف القائمة المؤقتة؟')) return;
    st().temp_todo_lists = (st().temp_todo_lists || []).filter(function(list){ return String(list.id) !== String(id); });
    save(); renderTempTodoPage();
  };

  function installHooks(){
    if(window.__walletsUserPatchInstalled) return;
    window.__walletsUserPatchInstalled = true;
    if(typeof window.openTaskModal === 'function'){
      var oldOpenTaskModal = window.openTaskModal;
      window.openTaskModal = function(){
        var r = oldOpenTaskModal.apply(this, arguments);
        setTimeout(fillTaskCurrency, 20);
        return r;
      };
    }
    if(typeof window.saveTask === 'function'){
      var oldSaveTask = window.saveTask;
      window.saveTask = function(){
        var before = (st().tasks || []).map(function(t){ return String(t.id); });
        var eid = document.getElementById('task-eid') && document.getElementById('task-eid').value;
        var selected = document.getElementById('t-currency') && document.getElementById('t-currency').value || baseCurrency().code;
        var r = oldSaveTask.apply(this, arguments);
        setTimeout(function(){
          var task = eid ? (st().tasks || []).find(function(t){ return String(t.id) === String(eid); }) : (st().tasks || []).find(function(t){ return before.indexOf(String(t.id)) === -1; });
          if(!task && st().tasks && st().tasks.length) task = st().tasks[st().tasks.length - 1];
          if(task){
            var c = meta(selected);
            task.currency_code = c.code;
            task.currency_symbol = c.symbol;
            task.currency = c.code;
            touch('tasks', task);
            save();
          }
        }, 50);
        return r;
      };
    }
    if(typeof window.renderFinance === 'function'){
      var oldRenderFinance = window.renderFinance;
      window.renderFinance = function(){
        var r = oldRenderFinance.apply(this, arguments);
        setTimeout(renderWallets, 20);
        return r;
      };
    }
    if(typeof window.renderAll === 'function'){
      var oldRenderAll = window.renderAll;
      window.renderAll = function(){
        var r = oldRenderAll.apply(this, arguments);
        setTimeout(function(){ renderSettings(); fillTaskCurrency(); renderWallets(); injectTempTodoPage(); fixMojibakeDom(document.body); }, 40);
        return r;
      };
    }
    if(typeof window.showPage === 'function'){
      var oldShowPage = window.showPage;
      window.showPage = function(id, el){
        var r = oldShowPage.apply(this, arguments);
        setTimeout(function(){
          if(id) document.body.setAttribute('data-current-page', id);
          fixMojibakeDom(document.body);
        }, 20);
        return r;
      };
    }
  }
  function init(){
    ensureState();
    installHooks();
    renderSettings();
    fillTaskCurrency();
    renderWallets();
    injectTempTodoPage();
    fixMojibakeDom(document.body);
    if(window.MutationObserver){
      var mo = new MutationObserver(function(muts){
        muts.forEach(function(m){
          Array.prototype.slice.call(m.addedNodes || []).forEach(function(node){
            if(node.nodeType === 1) fixMojibakeDom(node);
            else if(node.nodeType === 3 && MOJI_MARKERS.test(node.nodeValue || '')) node.nodeValue = fixMojibakeText(node.nodeValue);
          });
        });
      });
      mo.observe(document.body, {childList:true, subtree:true});
    }
    console.log('[Ordo] wallets_user_patch loaded');
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.OrdoWalletsUserPatch = {ensureState:ensureState, renderWallets:renderWallets, fillTaskCurrency:fillTaskCurrency, formatMoney:fmt, fixText:fixMojibakeText, fixDom:fixMojibakeDom, renderTempTodos:renderTempTodoPage, applyRedesign:applyRedesignRuntime};
})();

/* ===== END WALLETS USER PATCH + REDESIGN ===== */


/* ===== BEGIN CURRENCY DISPLAY + TEXT REPAIR PATCH ===== */
(function(){
  function state(){ return window.S || {}; }
  function meta(value){
    if(window.OrdoData && typeof OrdoData.getCurrencyMeta === 'function') return OrdoData.getCurrencyMeta(value);
    var list = (state().settings && state().settings.enabled_currencies) || [];
    var v = value || (state().settings && (state().settings.base_currency_code || state().settings.base_currency || state().settings.currency)) || 'EGP';
    var found = list.find(function(c){ return c.code === v || c.symbol === v || c.currency_code === v; });
    return found ? {code:found.code, symbol:found.symbol || found.code, label:found.label || found.code} : {code:String(v), symbol:String(v), label:String(v)};
  }
  function taskCurrency(task){
    task = task || {};
    var project = null;
    if(task.project_id && state().projects){ project = state().projects.find(function(p){ return String(p.id) === String(task.project_id); }); }
    return meta(task.currency_code || task.currency || task.currency_symbol || (project && (project.currency_code || project.currency || project.budgetCurrency)) || (state().settings && (state().settings.base_currency_code || state().settings.base_currency || state().settings.currency)) || 'EGP');
  }
  function money(amount, entity){
    if(window.OrdoData && typeof OrdoData.formatMoney === 'function') return OrdoData.formatMoney(amount || 0, entity || 'EGP');
    var c = typeof entity === 'string' ? meta(entity) : taskCurrency(entity);
    return Number(amount || 0).toLocaleString() + ' ' + c.symbol;
  }
  function touch(type, obj){
    if(!obj) return;
    obj.updatedAt = new Date().toISOString();
    obj._dirty = true;
    if(window.OrdoData && OrdoData.markDirty) OrdoData.markDirty(type, obj.id);
  }
  function normalizeTask(task){
    if(!task) return task;
    var c = taskCurrency(task);
    task.currency_code = c.code;
    task.currency_symbol = c.symbol;
    task.currency = c.code;
    return task;
  }
  function patchCardAmounts(root){
    root = root || document;
    Array.prototype.slice.call(root.querySelectorAll('[data-task-id]')).forEach(function(card){
      var id = card.getAttribute('data-task-id');
      var task = (state().tasks || []).find(function(t){ return String(t.id) === String(id); });
      if(!task || !task.value) return;
      normalizeTask(task);
      var wanted = money(task.value, task);
      Array.prototype.slice.call(card.querySelectorAll('span,div')).forEach(function(el){
        var txt = (el.textContent || '').trim();
        if(!txt) return;
        var compact = txt.replace(/,/g,'');
        if((/\d/.test(compact) && (/\s?\.???$|\s?$|EGP|USD|SAR|AED|\$|?\.?/.test(txt))) || txt === String(task.value) || txt === Number(task.value).toLocaleString()){
          if(el.children.length === 0 && compact.indexOf(String(Number(task.value))) !== -1){ el.textContent = wanted; }
        }
      });
    });
  }
  function patchTaskDetail(id){
    var task = (state().tasks || []).find(function(t){ return String(t.id) === String(id); });
    if(!task) return;
    normalizeTask(task);
    var body = document.getElementById('td-body');
    if(!body) return;
    Array.prototype.slice.call(body.querySelectorAll('.td-info-cell')).forEach(function(cell){
      var lbl = cell.querySelector('.lbl');
      var val = cell.querySelector('.val');
      var l = lbl ? lbl.textContent : '';
      if(!val) return;
      if(l.indexOf('????') > -1 || l.indexOf('???????') > -1){ val.textContent = money(task.value, task); }
      if(l.indexOf('???????') > -1){ val.textContent = money(task.deposit, task); }
      if(l.indexOf('?????') > -1){ val.textContent = money(task.workerAmount, task); }
      if(l.indexOf('??????') > -1){ val.textContent = money((task.value||0)-(task.workerAmount||0), task); }
    });
  }
  function patchCompleteModal(task){
    if(!task) return;
    normalizeTask(task);
    var remaining = (Number(task.value)||0) - (task.pay === 'deposit' ? (Number(task.deposit)||0) : 0);
    var cv = document.getElementById('complete-value');
    var cd = document.getElementById('complete-deposit-paid');
    var cr = document.getElementById('complete-remaining');
    if(cv) cv.textContent = task.value ? money(task.value, task) : '??? ????';
    if(cd) cd.textContent = money(task.deposit || 0, task);
    if(cr) cr.textContent = money(remaining, task);
  }
  function patchNewestTransactions(task, beforeLen){
    if(!task) return;
    normalizeTask(task);
    var c = taskCurrency(task);
    (state().transactions || []).slice(beforeLen || 0).forEach(function(tx){
      if(String(tx.linkedTaskId || tx.task_id || '') === String(task.id) || (tx.desc || '').indexOf(task.title || '') > -1){
        tx.currency_code = c.code;
        tx.currency_symbol = c.symbol;
        tx.currency = c.code;
        touch('transactions', tx);
      }
    });
    if(window.OrdoFinance && OrdoFinance.recalculateWallets) OrdoFinance.recalculateWallets();
  }

  var oldRenderTasks = window.renderTasks;
  if(typeof oldRenderTasks === 'function'){
    window.renderTasks = function(){
      var r = oldRenderTasks.apply(this, arguments);
      setTimeout(function(){ (state().tasks || []).forEach(normalizeTask); patchCardAmounts(document); }, 20);
      return r;
    };
  }
  var oldOpenTaskDetail = window.openTaskDetail;
  if(typeof oldOpenTaskDetail === 'function'){
    window.openTaskDetail = function(id){
      var r = oldOpenTaskDetail.apply(this, arguments);
      setTimeout(function(){ patchTaskDetail(id); if(window.OrdoWalletsUserPatch && OrdoWalletsUserPatch.fixDom) OrdoWalletsUserPatch.fixDom(document.body); }, 20);
      return r;
    };
  }
  var oldCompleteTask = window.completeTask;
  if(typeof oldCompleteTask === 'function'){
    window.completeTask = function(id){
      var r = oldCompleteTask.apply(this, arguments);
      var task = (state().tasks || []).find(function(t){ return String(t.id) === String(id); });
      setTimeout(function(){ patchCompleteModal(task); }, 20);
      return r;
    };
  }
  var oldConfirmComplete = window.confirmComplete;
  if(typeof oldConfirmComplete === 'function'){
    window.confirmComplete = function(){
      var id = document.getElementById('complete-task-id') && document.getElementById('complete-task-id').value;
      var task = (state().tasks || []).find(function(t){ return String(t.id) === String(id); });
      var before = (state().transactions || []).length;
      var r = oldConfirmComplete.apply(this, arguments);
      setTimeout(function(){ patchNewestTransactions(task, before); if(typeof window.renderFinance === 'function') window.renderFinance(); if(typeof window.lsSave === 'function') window.lsSave(); if(typeof window.cloudSave === 'function') window.cloudSave(state()); }, 40);
      return r;
    };
  }
  var oldPrompt = window._showPaymentIncomePrompt;
  if(typeof oldPrompt === 'function'){
    window._showPaymentIncomePrompt = function(opts){
      opts = opts || {};
      var task = (state().tasks || []).find(function(t){ return String(t.id) === String(opts.taskId); });
      var before = (state().transactions || []).length;
      var r = oldPrompt.apply(this, arguments);
      setTimeout(function(){
        var c = taskCurrency(task || {});
        var amountBox = document.querySelector('#_pay-income-modal div[style*="font-size:28px"]');
        if(amountBox) amountBox.textContent = money(opts.amount || 0, task || c.code);
        var yes = document.getElementById('_pim-yes');
        if(yes && !yes.__ordoCurrencyPatched){
          yes.__ordoCurrencyPatched = true;
          yes.addEventListener('click', function(){ setTimeout(function(){ patchNewestTransactions(task, before); }, 30); }, true);
        }
      }, 20);
      return r;
    };
  }
  var oldSaveTask = window.saveTask;
  if(typeof oldSaveTask === 'function' && !oldSaveTask.__ordoCurrencyDisplayPatch){
    window.saveTask = function(){
      var r = oldSaveTask.apply(this, arguments);
      setTimeout(function(){ (state().tasks || []).forEach(normalizeTask); if(typeof window.renderAll === 'function') window.renderAll(); }, 80);
      return r;
    };
    window.saveTask.__ordoCurrencyDisplayPatch = true;
  }
  var oldConfirmCollect = window._confirmCollect;
  if(typeof oldConfirmCollect === 'function'){
    window._confirmCollect = function(clientId, totalOwed){
      var before = (state().transactions || []).length;
      var r = oldConfirmCollect.apply(this, arguments);
      setTimeout(function(){
        var c = meta(state().settings && (state().settings.base_currency_code || state().settings.base_currency || state().settings.currency));
        (state().transactions || []).slice(before).forEach(function(tx){ tx.currency_code = tx.currency_code || c.code; tx.currency_symbol = tx.currency_symbol || c.symbol; tx.currency = tx.currency || c.code; touch('transactions', tx); });
        if(window.OrdoFinance && OrdoFinance.recalculateWallets) OrdoFinance.recalculateWallets();
      }, 30);
      return r;
    };
  }
  function repairStaticText(){
    var curTab = document.getElementById('stab-currencies');
    if(curTab) curTab.innerHTML = '<i class="fa-solid fa-wallet"></i> ??????? ????????';
    Array.prototype.slice.call(document.querySelectorAll('*')).forEach(function(el){
      if(el.children.length) return;
      var txt = (el.textContent || '').trim();
      if(/^\?{3,}/.test(txt)){
        if(el.closest('#stabp-currencies') || el.id === 'stab-currencies') el.textContent = '??????? ????????';
      }
    });
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', repairStaticText);
  else repairStaticText();
  setTimeout(function(){ (state().tasks || []).forEach(normalizeTask); patchCardAmounts(document); repairStaticText(); }, 300);
  window.OrdoCurrencyDisplayPatch = {money:money, taskCurrency:taskCurrency, patchCards:patchCardAmounts, patchDetail:patchTaskDetail};
})();
/* ===== END CURRENCY DISPLAY + TEXT REPAIR PATCH ===== */

/* ===== BEGIN FINAL ARABIC + ENTITY CURRENCY HOTFIX ===== */
(function(){
  'use strict';

  var CP1256_BYTES={'\u20ac':128,'\u067e':129,'\u201a':130,'\u0192':131,'\u201e':132,'\u2026':133,'\u2020':134,'\u2021':135,'\u02c6':136,'\u2030':137,'\u0679':138,'\u2039':139,'\u0152':140,'\u0686':141,'\u0698':142,'\u0688':143,'\u06af':144,'\u2018':145,'\u2019':146,'\u201c':147,'\u201d':148,'\u2022':149,'\u2013':150,'\u2014':151,'\u06a9':152,'\u2122':153,'\u0691':154,'\u203a':155,'\u0153':156,'\u200c':157,'\u200d':158,'\u06ba':159,'\xa0':160,'\u060c':161,'\xa2':162,'\xa3':163,'\xa4':164,'\xa5':165,'\xa6':166,'\xa7':167,'\xa8':168,'\xa9':169,'\u06be':170,'\xab':171,'\xac':172,'\xad':173,'\xae':174,'\xaf':175,'\xb0':176,'\xb1':177,'\xb2':178,'\xb3':179,'\xb4':180,'\xb5':181,'\xb6':182,'\xb7':183,'\xb8':184,'\xb9':185,'\u061b':186,'\xbb':187,'\xbc':188,'\xbd':189,'\xbe':190,'\u061f':191,'\u06c1':192,'\u0621':193,'\u0622':194,'\u0623':195,'\u0624':196,'\u0625':197,'\u0626':198,'\u0627':199,'\u0628':200,'\u0629':201,'\u062a':202,'\u062b':203,'\u062c':204,'\u062d':205,'\u062e':206,'\u062f':207,'\u0630':208,'\u0631':209,'\u0632':210,'\u0633':211,'\u0634':212,'\u0635':213,'\u0636':214,'\xd7':215,'\u0637':216,'\u0638':217,'\u0639':218,'\u063a':219,'\u0640':220,'\u0641':221,'\u0642':222,'\u0643':223,'\xe0':224,'\u0644':225,'\xe2':226,'\u0645':227,'\u0646':228,'\u0647':229,'\u0648':230,'\xe7':231,'\xe8':232,'\xe9':233,'\xea':234,'\xeb':235,'\u0649':236,'\u064a':237,'\xee':238,'\xef':239,'\u064b':240,'\u064c':241,'\u064d':242,'\u064e':243,'\xf4':244,'\u064f':245,'\u0650':246,'\xf7':247,'\u0651':248,'\xf9':249,'\u0652':250,'\xfb':251,'\xfc':252,'\u200e':253,'\u200f':254,'\u06d2':255};
  var AR = /[\u0600-\u06ff]/g;
  var BAD = /[\u0637\u0638\u201a\u201e\u2020\u2021\u2030\u0152\u0686\u0698\u06af\u201c\u201d\u2022\u2122\u00a7\u00ab\u00bb]|â|Â|ï¿½|\?{4,}/;
  var decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;
  var CURRENCIES = [
    {code:'EGP', symbol:'\u062c.\u0645', label:'\u062c\u0646\u064a\u0647 \u0645\u0635\u0631\u064a', enabled:true},
    {code:'USD', symbol:'$', label:'\u062f\u0648\u0644\u0627\u0631 \u0623\u0645\u0631\u064a\u0643\u064a', enabled:true},
    {code:'SAR', symbol:'\u0631.\u0633', label:'\u0631\u064a\u0627\u0644 \u0633\u0639\u0648\u062f\u064a', enabled:false},
    {code:'AED', symbol:'AED', label:'\u062f\u0631\u0647\u0645 \u0625\u0645\u0627\u0631\u0627\u062a\u064a', enabled:false},
    {code:'EUR', symbol:'\u20ac', label:'\u064a\u0648\u0631\u0648', enabled:false},
    {code:'KWD', symbol:'\u062f.\u0643', label:'\u062f\u064a\u0646\u0627\u0631 \u0643\u0648\u064a\u062a\u064a', enabled:false},
    {code:'QAR', symbol:'\u0631.\u0642', label:'\u0631\u064a\u0627\u0644 \u0642\u0637\u0631\u064a', enabled:false}
  ];

  function S(){ return window.S || (window.S = {}); }
  function n(v){ return Number(v || 0) || 0; }
  function arScore(v){ return ((String(v || '').match(AR) || []).length); }
  function decode1256(v){
    if(!decoder || !BAD.test(String(v || ''))) return v;
    var out = [], ok = false, s = String(v);
    for(var i=0;i<s.length;i++){
      var ch = s.charAt(i), code = s.charCodeAt(i);
      if(CP1256_BYTES[ch] != null){ out.push(CP1256_BYTES[ch]); ok = true; }
      else if(code <= 255){ out.push(code); }
      else { return v; }
    }
    if(!ok) return v;
    try {
      var fixed = decoder.decode(new Uint8Array(out));
      fixed = fixed.replace(/â€”/g,'\u2014').replace(/â€“/g,'\u2013').replace(/â†©/g,'\u21a9').replace(/âœ“/g,'\u2713').replace(/Â·/g,'\u00b7');
      return arScore(fixed) >= arScore(v) ? fixed : v;
    } catch(e){ return v; }
  }
  function fixText(v){
    if(v == null) return v;
    var x = decode1256(String(v));
    return x.replace(/\?{4,}/g,'').replace(/ط¢/g,'').replace(/â€”/g,'\u2014').replace(/â€“/g,'\u2013').replace(/â†©/g,'\u21a9').replace(/âœ“/g,'\u2713').replace(/Â·/g,'\u00b7');
  }
  function fixDom(root){
    root = root || document.body;
    if(!root) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode:function(node){
        if(!node.nodeValue || !BAD.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
        var p = node.parentElement;
        if(p && /SCRIPT|STYLE|TEXTAREA|INPUT/.test(p.tagName)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [], node;
    while((node = walker.nextNode())) nodes.push(node);
    nodes.forEach(function(t){ t.nodeValue = fixText(t.nodeValue); });
    Array.prototype.slice.call(root.querySelectorAll ? root.querySelectorAll('[placeholder],[title],[aria-label],option,label,button') : []).forEach(function(el){
      ['placeholder','title','aria-label'].forEach(function(attr){
        if(el.hasAttribute && el.hasAttribute(attr)){
          var cur = el.getAttribute(attr);
          var next = fixText(cur);
          if(next !== cur) el.setAttribute(attr, next);
        }
      });
      if(el.tagName === 'OPTION' || el.tagName === 'LABEL' || el.tagName === 'BUTTON'){
        Array.prototype.slice.call(el.childNodes || []).forEach(function(ch){
          if(ch.nodeType === 3) ch.nodeValue = fixText(ch.nodeValue);
        });
      }
    });
    var tab = document.getElementById('stab-currencies');
    if(tab) tab.innerHTML = '<i class="fa-solid fa-wallet"></i> \u0627\u0644\u0639\u0645\u0644\u0627\u062a \u0648\u0627\u0644\u0645\u062d\u0627\u0641\u0638';
  }
  function storedCurrencies(){
    var s = S();
    s.settings = s.settings || {};
    var saved = Array.isArray(s.settings.enabled_currencies) ? s.settings.enabled_currencies : [];
    var byCode = {};
    CURRENCIES.forEach(function(c){ byCode[c.code] = Object.assign({}, c); });
    saved.forEach(function(c){
      var code = meta(c.code || c.currency_code || c.symbol || c.label).code;
      byCode[code] = Object.assign({}, byCode[code] || {}, c, {
        code:code,
        symbol:meta(code).symbol,
        label:meta(code).label,
        enabled:c.enabled !== false
      });
    });
    s.settings.enabled_currencies = Object.keys(byCode).map(function(code){ return byCode[code]; });
    return s.settings.enabled_currencies;
  }
  function meta(value){
    var raw = fixText(value || '');
    var key = String(raw || '').trim();
    var compactKey = key.replace(/\s+/g,'');
    var isRepeatedEgp = /^ج(?:\.?م)+$/.test(compactKey) || /^م(?:\.?م)*(?:\.?ج)$/.test(compactKey);
    var found = CURRENCIES.find(function(c){ return c.code === key || c.symbol === key || c.label === key; });
    if(found) return Object.assign({}, found);
    if(isRepeatedEgp) return Object.assign({}, CURRENCIES[0]);
    if(key === '\u062c' || key === '\u062c.\u0645' || key === 'EGP' || key === 'ط¬' || key === 'ط¬.ظ…') return Object.assign({}, CURRENCIES[0]);
    if(key === '$' || key === 'USD') return Object.assign({}, CURRENCIES[1]);
    if(key === '\u0631.\u0633' || key === 'SAR' || key === 'ط±.ط³') return Object.assign({}, CURRENCIES[2]);
    if(key === 'AED') return Object.assign({}, CURRENCIES[3]);
    if(key === '\u20ac' || key === 'EUR' || key === 'â‚¬') return Object.assign({}, CURRENCIES[4]);
    if(key === '\u062f.\u0643' || key === 'KWD') return Object.assign({}, CURRENCIES[5]);
    if(key === '\u0631.\u0642' || key === 'QAR') return Object.assign({}, CURRENCIES[6]);
    var s = S();
    var base = (s.settings && (s.settings.base_currency_code || s.settings.base_currency || s.settings.currency)) || 'EGP';
    if(value && String(value) !== String(base)) return {code:key || 'EGP', symbol:key || '\u062c.\u0645', label:key || '\u062c\u0646\u064a\u0647 \u0645\u0635\u0631\u064a', enabled:true};
    return Object.assign({}, CURRENCIES[0]);
  }
  function enabledCurrencies(includeBalances){
    var list = storedCurrencies().filter(function(c){ return c.enabled !== false; }).map(function(c){ return meta(c.code); });
    if(includeBalances){
      (S().wallets || []).forEach(function(w){
        var m = meta(w.currency_code);
        if(n(w.balance) !== 0 && !list.some(function(c){ return c.code === m.code; })) list.push(m);
      });
    }
    return list;
  }
  function baseCurrency(){
    var s = S();
    return meta(s.settings && (s.settings.base_currency_code || s.settings.base_currency || s.settings.currency) || 'EGP');
  }
  function projectFor(entity){
    if(!entity || !entity.project_id) return null;
    return (S().projects || []).find(function(p){ return String(p.id) === String(entity.project_id); }) || null;
  }
  function entityCurrency(entity){
    entity = entity || {};
    if(entity.currency_code || entity.currency || entity.currency_symbol) return meta(entity.currency_code || entity.currency || entity.currency_symbol);
    var p = projectFor(entity);
    if(p) return meta(p.currency_code || p.currency || p.budgetCurrency || p.budget_currency);
    return baseCurrency();
  }
  function money(amount, entityOrCurrency){
    var c = typeof entityOrCurrency === 'string' ? meta(entityOrCurrency) : entityCurrency(entityOrCurrency);
    return n(amount).toLocaleString('ar-EG') + ' ' + c.symbol;
  }
  function ensureState(){
    var s = S(), base = baseCurrency();
    s.settings = s.settings || {};
    storedCurrencies();
    s.settings.base_currency_code = base.code;
    s.settings.base_currency = base.symbol;
    s.wallets = Array.isArray(s.wallets) ? s.wallets : [];
    s.wallet_transfers = Array.isArray(s.wallet_transfers) ? s.wallet_transfers : [];
    enabledCurrencies(false).forEach(function(c){ ensureWallet(c.code); });
    (s.tasks || []).forEach(normalizeEntityCurrency);
    (s.project_tasks || []).forEach(normalizeEntityCurrency);
    (s.transactions || []).forEach(normalizeEntityCurrency);
  }
  function ensureWallet(code){
    var s = S(), c = meta(code);
    var w = (s.wallets || []).find(function(x){ return meta(x.currency_code).code === c.code; });
    if(!w){
      w = {id:'wallet_'+c.code, currency_code:c.code, currency_symbol:c.symbol, currency_label:c.label, balance:0, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), _dirty:true};
      s.wallets.push(w);
    }
    w.currency_code = c.code;
    w.currency_symbol = c.symbol;
    w.currency_label = c.label;
    return w;
  }
  function normalizeEntityCurrency(entity){
    if(!entity) return entity;
    var c = entityCurrency(entity);
    entity.currency_code = c.code;
    entity.currency_symbol = c.symbol;
    entity.currency = c.code;
    return entity;
  }
  function recalcWallets(){
    ensureState();
    var totals = {};
    function row(code){ var c = meta(code); return totals[c.code] || (totals[c.code] = {income:0, expense:0, balance:0, meta:c, last:null}); }
    (S().transactions || []).forEach(function(tx){
      var c = entityCurrency(tx), r = row(c.code), amount = n(tx.amount);
      if(tx.type === 'expense') r.expense += amount; else if(tx.type === 'income') r.income += amount;
      r.balance = r.income - r.expense;
      r.last = tx;
    });
    Object.keys(totals).forEach(function(code){
      var w = ensureWallet(code), r = totals[code];
      w.balance = r.balance;
      w.updatedAt = new Date().toISOString();
    });
    enabledCurrencies(false).forEach(function(c){ ensureWallet(c.code); });
    return S().wallets;
  }
  function walletSummary(code){
    recalcWallets();
    var c = meta(code), txs = (S().transactions || []).filter(function(tx){ return entityCurrency(tx).code === c.code; });
    var income = 0, expense = 0;
    txs.forEach(function(tx){ if(tx.type === 'expense') expense += n(tx.amount); else if(tx.type === 'income') income += n(tx.amount); });
    var w = (S().wallets || []).find(function(x){ return meta(x.currency_code).code === c.code; });
    return {currency_code:c.code, currency_symbol:c.symbol, currency_label:c.label, income:income, expense:expense, balance:w ? n(w.balance) : income-expense, last:txs[txs.length-1] || null};
  }
  function patchOrdoApis(){
    window.OrdoData = window.OrdoData || {};
    Object.assign(window.OrdoData, {
      getCurrencyMeta:meta,
      getEnabledCurrencies:enabledCurrencies,
      resolveCurrency:function(entity){ return entityCurrency(entity).code; },
      formatMoney:money
    });
    window.OrdoFinance = window.OrdoFinance || {};
    Object.assign(window.OrdoFinance, {
      getWallets:function(){ return recalcWallets().filter(function(w){ var c = meta(w.currency_code); return c.enabled !== false || n(w.balance) !== 0 || enabledCurrencies(false).some(function(x){ return x.code === c.code; }); }); },
      getWalletBalance:function(code){ var w = recalcWallets().find(function(x){ return meta(x.currency_code).code === meta(code).code; }); return w ? n(w.balance) : 0; },
      getWalletSummary:walletSummary,
      recalculateWallets:recalcWallets,
      groupTotalsByCurrency:function(txs){
        var out = {};
        (txs || []).forEach(function(tx){
          var c = entityCurrency(tx);
          out[c.code] = out[c.code] || {currency_code:c.code, currency_symbol:c.symbol, currency_label:c.label, income:0, expense:0, balance:0};
          if(tx.type === 'expense') out[c.code].expense += n(tx.amount); else if(tx.type === 'income') out[c.code].income += n(tx.amount);
          out[c.code].balance = out[c.code].income - out[c.code].expense;
        });
        return out;
      }
    });
  }
  function renderCurrencySettingsPanel(){
    ensureState();
    var panel = document.getElementById('stabp-currencies');
    if(!panel) return;
    panel.innerHTML =
      '<div class="card" id="studio-currency-wallet-settings" style="margin-bottom:16px">'+
        '<div class="section-title" style="margin-bottom:12px"><i class="fa-solid fa-coins" style="color:var(--accent2)"></i> \u0627\u0644\u0639\u0645\u0644\u0627\u062a \u0648\u0627\u0644\u0645\u062d\u0627\u0641\u0638</div>'+
        '<div class="form-row">'+
          '<div class="form-group">'+
            '<label class="form-label">\u0627\u0644\u0639\u0645\u0644\u0629 \u0627\u0644\u0623\u0633\u0627\u0633\u064a\u0629 \u0644\u0644\u062d\u0633\u0627\u0628</label>'+
            '<select class="form-select" id="studio-base-currency"></select>'+
          '</div>'+
        '</div>'+
        '<div class="form-group">'+
          '<label class="form-label">\u0627\u0644\u0639\u0645\u0644\u0627\u062a \u0627\u0644\u062a\u064a \u0623\u062a\u0639\u0627\u0645\u0644 \u0628\u0647\u0627</label>'+
          '<div id="studio-enabled-currencies" class="ordo-currency-checks"></div>'+
        '</div>'+
        '<button class="btn btn-success" onclick="saveStudioCurrencies()"><i class="fa-solid fa-floppy-disk"></i> \u062d\u0641\u0638 \u0627\u0644\u0639\u0645\u0644\u0627\u062a</button>'+
      '</div>';
    fillCurrencySettingsControls();
  }
  function fillCurrencySettingsControls(){
    var base = document.getElementById('studio-base-currency');
    var checks = document.getElementById('studio-enabled-currencies');
    var current = baseCurrency().code;
    var all = storedCurrencies();
    if(base){
      base.innerHTML = all.map(function(c){
        var m = meta(c.code);
        return '<option value="'+m.code+'" '+(m.code === current ? 'selected' : '')+'>'+m.label+' ('+m.symbol+')</option>';
      }).join('');
    }
    if(checks){
      checks.innerHTML = all.map(function(c){
        var m = meta(c.code);
        return '<label class="ordo-currency-check"><input type="checkbox" value="'+m.code+'" '+(c.enabled !== false ? 'checked' : '')+'> <span>'+m.label+'</span><b>'+m.symbol+'</b></label>';
      }).join('');
    }
  }
  window.saveStudioCurrencies = function(){
    ensureState();
    var base = (document.getElementById('studio-base-currency') || {}).value || baseCurrency().code;
    var enabled = Array.prototype.slice.call(document.querySelectorAll('#studio-enabled-currencies input:checked')).map(function(i){ return i.value; });
    if(enabled.indexOf(base) === -1) enabled.push(base);
    S().settings.enabled_currencies = CURRENCIES.map(function(c){ return Object.assign({}, c, {enabled:enabled.indexOf(c.code) > -1}); });
    var b = meta(base);
    S().settings.base_currency_code = b.code;
    S().settings.base_currency = b.symbol;
    S().settings.currency = b.symbol;
    S().settings.updatedAt = new Date().toISOString();
    S().settings._dirty = true;
    enabled.forEach(ensureWallet);
    recalcWallets();
    if(typeof window.lsSave === 'function') window.lsSave();
    if(typeof window.cloudSave === 'function') window.cloudSave(S());
    fillCurrencySettingsControls();
    var taskCur = document.getElementById('t-currency');
    if(taskCur) fillTaskCurrencySelect(taskCur, taskCur.value || b.code);
    if(typeof window.toast === 'function') window.toast('\u062a\u0645 \u062d\u0641\u0638 \u0627\u0644\u0639\u0645\u0644\u0627\u062a \u0648\u0627\u0644\u0645\u062d\u0627\u0641\u0638');
  };
  function fillTaskCurrencySelect(sel, selected){
    if(!sel) return;
    var cur = meta(selected || sel.value || baseCurrency().code).code;
    sel.innerHTML = enabledCurrencies(false).map(function(c){
      return '<option value="'+c.code+'" '+(c.code === cur ? 'selected' : '')+'>'+c.label+' ('+c.symbol+')</option>';
    }).join('');
  }
  function readForm(id){ var el = document.getElementById(id); return el ? el.value : ''; }
  function fallbackSaveTask(selectedCurrency, beforeIds, eid){
    var title = readForm('t-title').trim();
    if(!title) return false;
    var client = readForm('t-client');
    var oldTask = eid ? (S().tasks || []).find(function(t){ return String(t.id) === String(eid); }) : null;
    var c = meta(selectedCurrency || readForm('t-currency') || (oldTask && (oldTask.currency_code || oldTask.currency)) || baseCurrency().code);
    var task = Object.assign({}, oldTask || {}, {
      id: oldTask ? oldTask.id : Date.now(),
      title:title,
      client:client,
      priority:readForm('t-priority') || 'med',
      status:readForm('t-status') || 'new',
      value:n(readForm('t-value')),
      orderDate:readForm('t-order'),
      deadline:readForm('t-deadline'),
      pay:readForm('t-pay') || 'none',
      deposit:n(readForm('t-deposit')),
      notes:readForm('t-notes'),
      done:oldTask ? !!oldTask.done : false,
      currency_code:c.code,
      currency_symbol:c.symbol,
      currency:c.code,
      updatedAt:new Date().toISOString(),
      _dirty:true
    });
    if(oldTask){
      var idx = (S().tasks || []).findIndex(function(t){ return String(t.id) === String(oldTask.id); });
      if(idx >= 0) S().tasks[idx] = task;
    } else {
      S().tasks = Array.isArray(S().tasks) ? S().tasks : [];
      if(!(S().tasks || []).some(function(t){ return beforeIds.indexOf(String(t.id)) === -1; })) S().tasks.push(task);
    }
    if(typeof window.lsSave === 'function') window.lsSave();
    if(typeof window.cloudSave === 'function') window.cloudSave(S());
    if(typeof window.closeM === 'function') window.closeM('modal-task');
    if(typeof window.renderAll === 'function') window.renderAll();
    return true;
  }
  window.OrdoTaskSafeSave = function(){
    var selected = document.getElementById('t-currency') && document.getElementById('t-currency').value;
    var beforeIds = (S().tasks || []).map(function(t){ return String(t.id); });
    var eid = document.getElementById('task-eid') && document.getElementById('task-eid').value;
    try {
      if(typeof window._beforeSaveTask === 'function') window._beforeSaveTask();
    } catch(e) {
      console.warn('[Ordo] _beforeSaveTask skipped', e);
    }
    var beforeLen = (S().tasks || []).length;
    try {
      if(typeof window.saveTask === 'function') window.saveTask();
    } catch(err) {
      console.error('[Ordo] safe save fallback after saveTask error', err);
      fallbackSaveTask(selected, beforeIds, eid);
      return false;
    }
    setTimeout(function(){
      var saved = eid ? (S().tasks || []).find(function(t){ return String(t.id) === String(eid); }) : (S().tasks || []).find(function(t){ return beforeIds.indexOf(String(t.id)) === -1; });
      if(!saved && (S().tasks || []).length === beforeLen) saved = fallbackSaveTask(selected, beforeIds, eid);
      if(saved && typeof saved === 'object'){
        var c = meta(selected || saved.currency_code || saved.currency || baseCurrency().code);
        saved.currency_code = c.code;
        saved.currency_symbol = c.symbol;
        saved.currency = c.code;
        saved.updatedAt = new Date().toISOString();
        saved._dirty = true;
        if(typeof window.lsSave === 'function') window.lsSave();
        if(typeof window.cloudSave === 'function') window.cloudSave(S());
      }
      if(typeof window.renderAll === 'function') window.renderAll();
      patchTaskCards(document);
      fixDom(document.body);
    }, 220);
    return false;
  };
  function hideRemovedSections(){
    var ws = document.getElementById('nav-workspace');
    if(ws) ws.style.display = 'none';
    var wsp = document.getElementById('page-workspace');
    if(wsp) wsp.style.display = 'none';
    Array.prototype.slice.call(document.querySelectorAll('[onclick*="workspace"], #temp-todo-page-section, [id*="temp-todo"], [class*="temp-todo"]')).forEach(function(el){
      if(el.id === 'nav-workspace' || el.id === 'page-workspace' || el.id === 'temp-todo-page-section' || /workspace/.test(el.getAttribute('onclick') || '') || /temp-todo/.test(el.id || '') || /temp-todo/.test(el.className || '')) el.style.display = 'none';
    });
  }
  function patchTaskCards(root){
    root = root || document;
    Array.prototype.slice.call(root.querySelectorAll('[data-task-id]')).forEach(function(card){
      var id = card.getAttribute('data-task-id');
      var task = (S().tasks || []).concat(S().project_tasks || []).find(function(t){ return String(t.id) === String(id); });
      if(!task || !n(task.value)) return;
      normalizeEntityCurrency(task);
      var wanted = money(task.value, task);
      Array.prototype.slice.call(card.querySelectorAll('span,div,b,strong')).forEach(function(el){
        if(el.children.length) return;
        var txt = (el.textContent || '').trim(), plain = txt.replace(/[,\u066c]/g,'');
        if(/\d/.test(txt) && plain.indexOf(String(n(task.value))) > -1 && /(EGP|USD|SAR|AED|KWD|QAR|\$|\u062c|ج|ر\.س|ج\.م|ط¬|\?)/.test(txt)){
          el.textContent = wanted;
        }
      });
    });
  }
  function patchTaskDetail(id){
    var task = (S().tasks || []).find(function(t){ return String(t.id) === String(id); });
    if(!task) return;
    normalizeEntityCurrency(task);
    var body = document.getElementById('td-body');
    if(!body) return;
    fixDom(body);
    Array.prototype.slice.call(body.querySelectorAll('.td-info-cell')).forEach(function(cell, idx){
      var lbl = fixText((cell.querySelector('.lbl') || {}).textContent || '');
      var val = cell.querySelector('.val');
      if(!val) return;
      if(lbl.indexOf('\u0642\u064a\u0645\u0629') > -1 || idx === 0) val.textContent = money(task.value, task);
      else if(lbl.indexOf('\u0639\u0631\u0628\u0648\u0646') > -1) val.textContent = money(task.deposit, task);
      else if(lbl.indexOf('\u0645\u0633\u062a\u062d\u0642') > -1) val.textContent = money(task.workerAmount, task);
      else if(lbl.indexOf('\u0631\u0628\u062d') > -1) val.textContent = money(n(task.value)-n(task.workerAmount), task);
    });
  }
  function patchCompleteModal(task){
    if(!task) return;
    normalizeEntityCurrency(task);
    var remaining = n(task.value) - (task.pay === 'deposit' ? n(task.deposit) : 0);
    var set = function(id, value){ var el = document.getElementById(id); if(el) el.textContent = value; };
    set('complete-value', task.value ? money(task.value, task) : '\u063a\u064a\u0631 \u0645\u062d\u062f\u062f');
    set('complete-deposit-paid', money(task.deposit || 0, task));
    set('complete-remaining', money(remaining, task));
    var amount = document.getElementById('complete-income-amount');
    if(amount){
      var label = amount.closest('.form-group') && amount.closest('.form-group').querySelector('.form-label');
      if(label) label.textContent = '\u0627\u0644\u0645\u0628\u0644\u063a \u0627\u0644\u0645\u0631\u0627\u062f \u062a\u0633\u062c\u064a\u0644\u0647 \u0643\u0625\u064a\u0631\u0627\u062f (' + entityCurrency(task).symbol + ')';
    }
  }
  function patchNewTransactions(task, beforeLen){
    if(!task) return;
    normalizeEntityCurrency(task);
    var c = entityCurrency(task);
    (S().transactions || []).slice(beforeLen || 0).forEach(function(tx){
      if(String(tx.linkedTaskId || tx.task_id || tx.linkedProjTaskId || '') === String(task.id) || String(tx.desc || '').indexOf(task.title || '') > -1){
        tx.currency_code = c.code;
        tx.currency_symbol = c.symbol;
        tx.currency = c.code;
        tx.updatedAt = new Date().toISOString();
        tx._dirty = true;
      }
    });
    recalcWallets();
  }
  function patchFinanceDom(){
    recalcWallets();
    var tbody = document.getElementById('fin-tbody');
    if(tbody){
      var txs = typeof window.filterTransactions === 'function' ? window.filterTransactions(S().transactions || []) : (S().transactions || []);
      txs = txs.slice().sort(function(a,b){ return String(b.isoDate || '').localeCompare(String(a.isoDate || '')); });
      Array.prototype.slice.call(tbody.querySelectorAll('tr')).forEach(function(tr, i){
        var tx = txs[i], cells = tr.children;
        if(tx && cells && cells[3]) cells[3].textContent = money(tx.amount, tx);
      });
    }
    var grid = document.getElementById('wallets-grid') || document.getElementById('ordo-wallets-grid');
    if(grid){
      var wallets = (window.OrdoFinance.getWallets ? window.OrdoFinance.getWallets() : S().wallets || []);
      grid.innerHTML = wallets.map(function(w){
        var sum = walletSummary(w.currency_code), c = meta(w.currency_code);
        return '<div class="ordo-wallet-card"><div style="font-size:13px;font-weight:900">'+c.label+'</div><div style="font-size:11px;color:var(--text3);margin-top:2px">'+c.code+' · '+c.symbol+'</div><div class="ordo-wallet-balance">'+money(sum.balance,c.code)+'</div><div class="ordo-wallet-lines"><span>\u0627\u0644\u062f\u0627\u062e\u0644: <b style="color:var(--accent3)">'+money(sum.income,c.code)+'</b></span><span>\u0627\u0644\u062e\u0627\u0631\u062c: <b style="color:var(--accent4)">'+money(sum.expense,c.code)+'</b></span></div></div>';
      }).join('') || '<div class="empty" style="padding:18px">\u0644\u0627 \u062a\u0648\u062c\u062f \u0645\u062d\u0627\u0641\u0638 \u0628\u0639\u062f</div>';
    }
  }
  function install(){
    if(window.__ordoFinalArabicCurrencyHotfix) return;
    window.__ordoFinalArabicCurrencyHotfix = true;
    patchOrdoApis();
    ensureState();
    renderCurrencySettingsPanel();
    hideRemovedSections();
    if(typeof window.switchSettingsTab === 'function'){
      var oldSwitchSettingsTab = window.switchSettingsTab;
      window.switchSettingsTab = function(tab){
        var r = oldSwitchSettingsTab.apply(this, arguments);
        if(tab === 'currencies') setTimeout(function(){ renderCurrencySettingsPanel(); fixDom(document.getElementById('stabp-currencies') || document.body); }, 20);
        return r;
      };
    }
    if(typeof window.renderTasks === 'function'){
      var oldRenderTasks = window.renderTasks;
      window.renderTasks = function(){ var r = oldRenderTasks.apply(this, arguments); setTimeout(function(){ ensureState(); patchTaskCards(document); fixDom(document.body); }, 30); return r; };
    }
    if(typeof window.openTaskDetail === 'function'){
      var oldOpenTaskDetail = window.openTaskDetail;
      window.openTaskDetail = function(id){ var r = oldOpenTaskDetail.apply(this, arguments); setTimeout(function(){ patchTaskDetail(id); }, 30); return r; };
    }
    if(typeof window.completeTask === 'function'){
      var oldCompleteTask = window.completeTask;
      window.completeTask = function(id){ var r = oldCompleteTask.apply(this, arguments); var task = (S().tasks || []).find(function(t){ return String(t.id) === String(id); }); setTimeout(function(){ patchCompleteModal(task); fixDom(document.body); }, 30); return r; };
    }
    if(typeof window.confirmComplete === 'function'){
      var oldConfirmComplete = window.confirmComplete;
      window.confirmComplete = function(){
        var id = document.getElementById('complete-task-id') && document.getElementById('complete-task-id').value;
        var task = (S().tasks || []).find(function(t){ return String(t.id) === String(id); });
        var before = (S().transactions || []).length;
        var r = oldConfirmComplete.apply(this, arguments);
        setTimeout(function(){ patchNewTransactions(task, before); patchFinanceDom(); if(typeof window.lsSave === 'function') window.lsSave(); if(typeof window.cloudSave === 'function') window.cloudSave(S()); }, 80);
        return r;
      };
    }
    if(typeof window._showPaymentIncomePrompt === 'function'){
      var oldPaymentPrompt = window._showPaymentIncomePrompt;
      window._showPaymentIncomePrompt = function(opts){
        opts = opts || {};
        var task = (S().tasks || []).find(function(t){ return String(t.id) === String(opts.taskId); });
        var before = (S().transactions || []).length;
        var r = oldPaymentPrompt.apply(this, arguments);
        setTimeout(function(){
          if(task){
            var amountBox = document.querySelector('#_pay-income-modal div[style*="font-size:28px"]');
            if(amountBox) amountBox.textContent = money(opts.amount || 0, task);
          }
          var yes = document.getElementById('_pim-yes');
          if(yes && !yes.__ordoFinalCurrencyClick){
            yes.__ordoFinalCurrencyClick = true;
            yes.addEventListener('click', function(){
              setTimeout(function(){
                patchNewTransactions(task, before);
                patchFinanceDom();
                fixDom(document.body);
              }, 70);
            }, true);
          }
        }, 20);
        return r;
      };
    }
    if(typeof window.markTaskPaymentCollected === 'function'){
      var oldMarkPaymentCollected = window.markTaskPaymentCollected;
      window.markTaskPaymentCollected = function(taskId){
        var task = (S().tasks || []).find(function(t){ return String(t.id) === String(taskId); }) ||
          (S().project_tasks || []).find(function(t){ return String(t.id) === String(taskId); });
        var before = (S().transactions || []).length;
        var r = oldMarkPaymentCollected.apply(this, arguments);
        setTimeout(function(){
          if(task){
            patchNewTransactions(task, before);
            var cur = entityCurrency(task);
            var sel = document.getElementById('in-currency');
            if(sel){ sel.value = cur.code; }
          }
          patchFinanceDom();
          fixDom(document.body);
        }, 90);
        return r;
      };
    }
    if(typeof window.renderFinance === 'function'){
      var oldRenderFinance = window.renderFinance;
      window.renderFinance = function(){ var r = oldRenderFinance.apply(this, arguments); setTimeout(function(){ patchFinanceDom(); fixDom(document.body); }, 40); return r; };
    }
    if(typeof window.renderAll === 'function'){
      var oldRenderAll = window.renderAll;
      window.renderAll = function(){ var r = oldRenderAll.apply(this, arguments); setTimeout(function(){ ensureState(); renderCurrencySettingsPanel(); hideRemovedSections(); patchTaskCards(document); patchFinanceDom(); fixDom(document.body); }, 80); return r; };
    }
    if(typeof window.saveTask === 'function'){
      var oldSaveTask = window.saveTask;
      window.saveTask = function(){
        var selected = document.getElementById('t-currency') && document.getElementById('t-currency').value;
        var beforeIds = (S().tasks || []).map(function(t){ return String(t.id); });
        var eid = document.getElementById('task-eid') && document.getElementById('task-eid').value;
        var r;
        try { r = oldSaveTask.apply(this, arguments); }
        catch(err) {
          console.error('[Ordo] saveTask legacy failed, using fallback', err);
          fallbackSaveTask(selected, beforeIds, eid);
          return false;
        }
        setTimeout(function(){
          var task = eid ? (S().tasks || []).find(function(t){ return String(t.id) === String(eid); }) : (S().tasks || []).find(function(t){ return beforeIds.indexOf(String(t.id)) === -1; });
          if(!task) fallbackSaveTask(selected, beforeIds, eid);
          task = eid ? (S().tasks || []).find(function(t){ return String(t.id) === String(eid); }) : (S().tasks || []).find(function(t){ return beforeIds.indexOf(String(t.id)) === -1; });
          if(task && selected){ var c = meta(selected); task.currency_code = c.code; task.currency_symbol = c.symbol; task.currency = c.code; }
          ensureState(); patchTaskCards(document);
        }, 80);
        return r;
      };
    }
    if(typeof window.openTaskModal === 'function'){
      var oldFinalOpenTaskModal = window.openTaskModal;
      window.openTaskModal = function(id){
        var r = oldFinalOpenTaskModal.apply(this, arguments);
        setTimeout(function(){
          var task = id ? (S().tasks || []).find(function(t){ return String(t.id) === String(id); }) : null;
          var sel = document.getElementById('t-currency');
          if(sel) fillTaskCurrencySelect(sel, task ? (task.currency_code || task.currency || task.currency_symbol) : baseCurrency().code);
          var label = document.querySelector('#t-currency-wrap .form-label');
          if(label) label.textContent = '\u0639\u0645\u0644\u0629 \u0627\u0644\u0645\u0647\u0645\u0629';
          fixDom(document.getElementById('modal-task') || document.body);
        }, 80);
        return r;
      };
    }
    setTimeout(function(){
      if(typeof window.saveTask !== 'function' || window.saveTask.__ordoLateSaveGuard) return;
      var currentSaveTask = window.saveTask;
      window.saveTask = function(){
        var selected = document.getElementById('t-currency') && document.getElementById('t-currency').value;
        var beforeIds = (S().tasks || []).map(function(t){ return String(t.id); });
        var eid = document.getElementById('task-eid') && document.getElementById('task-eid').value;
        var r;
        try { r = currentSaveTask.apply(this, arguments); }
        catch(err) {
          console.error('[Ordo] saveTask late guard fallback', err);
          fallbackSaveTask(selected, beforeIds, eid);
          return false;
        }
        setTimeout(function(){
          var saved = eid ? (S().tasks || []).find(function(t){ return String(t.id) === String(eid); }) : (S().tasks || []).find(function(t){ return beforeIds.indexOf(String(t.id)) === -1; });
          if(!saved) fallbackSaveTask(selected, beforeIds, eid);
          else {
            var c = meta(selected || saved.currency_code || saved.currency);
            saved.currency_code = c.code;
            saved.currency_symbol = c.symbol;
            saved.currency = c.code;
            saved.updatedAt = new Date().toISOString();
            saved._dirty = true;
            if(typeof window.lsSave === 'function') window.lsSave();
            if(typeof window.cloudSave === 'function') window.cloudSave(S());
          }
          patchTaskCards(document);
          fixDom(document.body);
        }, 180);
        return r;
      };
      window.saveTask.__ordoLateSaveGuard = true;
    }, 1800);
    if(window.MutationObserver && document.body){
      new MutationObserver(function(muts){
        muts.forEach(function(m){ Array.prototype.slice.call(m.addedNodes || []).forEach(function(node){ if(node.nodeType === 1){ fixDom(node); patchTaskCards(node); } }); });
      }).observe(document.body, {childList:true, subtree:true});
    }
    fixDom(document.body);
    renderCurrencySettingsPanel();
    hideRemovedSections();
    patchTaskCards(document);
    patchFinanceDom();
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
  window.OrdoCurrencyFix = {meta:meta, money:money, entityCurrency:entityCurrency, fixText:fixText, fixDom:fixDom, patchFinance:patchFinanceDom};
})();
/* ===== END FINAL ARABIC + ENTITY CURRENCY HOTFIX ===== */
