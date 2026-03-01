

## خطة التحسينات الأربعة قبل النشر

### 1. تحسين صفحة 404
- إعادة تصميم `src/pages/NotFound.tsx` بتصميم متناسق مع المتجر
- دعم ثنائي اللغة (عربي/إنجليزي) باستخدام `useTranslation`
- إضافة أيقونة وأنيميشن خفيف مع زر العودة للرئيسية

### 2. إضافة Error Boundary
- إنشاء `src/components/ErrorBoundary.tsx` (React class component)
- يعرض رسالة خطأ ثنائية اللغة مع زر "إعادة المحاولة" بدل انهيار الصفحة
- لفّ التطبيق بالكامل في `App.tsx` بـ ErrorBoundary

### 3. إضافة Sitemap وتحديث robots.txt
- إنشاء `public/sitemap.xml` يحتوي على جميع الصفحات العامة
- تحديث `public/robots.txt` بإضافة رابط الـ Sitemap

### 4. إضافة Loading Skeletons
- إنشاء `src/components/ProductCardSkeleton.tsx` بتصميم يطابق شكل كارت المنتج
- استبدال spinner التحميل في `ProductsSection.tsx` بشبكة من الـ skeletons

