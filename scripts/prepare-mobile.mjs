// ينسخ صفحة يد التحكم إلى mobile/www لتصير واجهة تطبيق الجوال
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const www = path.join(root, 'mobile', 'www');
fs.mkdirSync(www, { recursive: true });
fs.copyFileSync(path.join(root, 'public', 'pad.html'), path.join(www, 'index.html'));
console.log('✅ mobile/www/index.html جاهز');
