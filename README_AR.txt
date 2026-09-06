# Ordo Vercel Clean

دي نسخة مستقلة ونظيفة للرفع على GitHub والنشر على Vercel.

القديم والباك أب المحلي خارج هذا الفولدر لم يتم تعديلهم.

## الملفات المهمة

- `index.html`: يحول تلقائياً إلى التطبيق.
- `HTML/index.html`: واجهة Ordo.
- `HTML/admin.html`: لوحة الإدارة.
- `api/index.js`: API للحسابات والحفظ والاشتراكات.
- `database/schema.sql`: إنشاء جداول Postgres.
- `docs/VERCEL_SETUP_AR.md`: خطوات الرفع والإعداد.

## التشغيل المحلي

```bash
npm run dev
```

افتح:

```text
http://127.0.0.1:8090/HTML/index.html
```

محلياً يتم استخدام `.local-data/ordo-dev-db.json` لو مفيش `DATABASE_URL`.

## قبل الرفع

1. ارفع محتويات هذا الفولدر على GitHub.
2. اعمل Import Project من Vercel.
3. اربط Postgres من Vercel Marketplace مثل Neon.
4. نفذ `database/schema.sql`.
5. اعمل Redeploy.

أول حساب يتم إنشاؤه من صفحة التسجيل يصبح Admin تلقائياً.

## استيراد داتاك القديمة

ملف الداتا المستخرجة موجود هنا:

```text
import/ordo_data_import.json
```

بعد ما تسجل دخول بالحساب الحقيقي على النسخة المنشورة، شغل:

```bash
ORDO_URL=https://your-vercel-domain.vercel.app ORDO_EMAIL=you@example.com ORDO_PASSWORD=your-password node tools/import-backup.mjs
```

محلياً تم اختبار الاستيراد على:

```text
admin@ordo.test
```
