// ينسخ السيرفر + اللعبة المبنية إلى desktop/app ليحزمها Electron
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'desktop', 'app');
if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
  console.error('شغّل npm run build أولاً');
  process.exit(1);
}
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.join(root, 'server.js'), path.join(out, 'server.js'));
fs.cpSync(path.join(root, 'dist'), path.join(out, 'dist'), { recursive: true });
fs.cpSync(path.join(root, 'public'), path.join(out, 'public'), { recursive: true });
fs.writeFileSync(path.join(out, 'package.json'), JSON.stringify({ type: 'module' }));
console.log('✅ desktop/app جاهز');
