# تشغيل Ordo على GitHub + Vercel

هذه النسخة مخصصة للرفع على GitHub ثم النشر على Vercel.

## التشغيل المحلي

```bash
npm run dev
```

افتح:

```text
http://127.0.0.1:8090/HTML/index.html
```

في التشغيل المحلي بدون `DATABASE_URL` يتم استخدام ملف:

```text
.local-data/ordo-dev-db.json
```

أول حساب يتم إنشاؤه يصبح Admin تلقائياً.

## الداتابيز على Vercel

1. ارفع الفولدر على GitHub.
2. من Vercel اختر Import Project واربط الريبو.
3. أضف Postgres من Marketplace مثل Neon.
4. تأكد أن Vercel أضاف `DATABASE_URL` أو `POSTGRES_URL` في Environment Variables.
5. نفذ SQL الموجود في `database/schema.sql` على قاعدة البيانات.
6. اعمل Redeploy.

## استيراد داتا النسخة المحلية

الداتا المستخرجة من النسخة المحلية موجودة في:

```text
import/ordo_data_import.json
```

بعد إنشاء حسابك الحقيقي على الموقع المنشور، شغل الأمر التالي من داخل فولدر المشروع:

```bash
ORDO_URL=https://your-vercel-domain.vercel.app ORDO_EMAIL=you@example.com ORDO_PASSWORD=your-password node tools/import-backup.mjs
```

استبدل `ORDO_URL` برابط Vercel الحقيقي، والإيميل وكلمة السر ببيانات حسابك.

## ملاحظات

- تسجيل جوجل مخفي حالياً، والتسجيل الحالي بالإيميل وكلمة المرور.
- أول مستخدم يسجل بعد ربط الداتابيز يصبح Admin.
- الاشتراكات والسريال نمبر والجداول العامة موجودة في الـ schema وجاهزة للتطوير.
