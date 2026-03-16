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
// END OF PATCH
// ══════════════════════════════════════════════════════════════
console.log('[Ordo Patch] ✅ All patches loaded successfully');
