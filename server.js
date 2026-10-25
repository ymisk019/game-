// =====================================================================
//  BALL VS KEEPER — السيرفر المحلي
//  يقدّم ملفات اللعبة (dist/) ويدير غرف WebSocket بين الكونسل والتلفونات.
//  السيرفر يمرّر المدخلات فقط؛ الفيزياء كلها تُحسب على شاشة الكونسل.
//  شبكة محلية فقط (نفس الواي فاي) — لا يوجد وضع إنترنت عام.
//  التشغيل: npm install ثم npm run build ثم node server.js
//  وضع السيرفر المصغّر:  node server.js --auto
//    يشتغل مع اللعبة ويطفي نفسه تلقائياً عند إغلاق اللعبة (نافذة المتصفح).
// =====================================================================
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let PORT = Number(process.env.PORT) || 3000;
const AUTO_EXIT = process.argv.includes('--auto') || process.env.BVK_AUTO_EXIT === '1';
const DIST = path.join(__dirname, 'dist');
const PUBLIC = path.join(__dirname, 'public');

// ---------- عنوان IP المحلي ----------
function localIPs() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === 'IPv4' && !i.internal) out.push(i.address);
    }
  }
  // تفضيل عناوين الشبكات المنزلية
  const score = (ip) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : ip.startsWith('172.') ? 2 : 3);
  return out.sort((a, b) => score(a) - score(b));
}
const IPS = localIPs();
const IP = IPS[0] || 'localhost';
const baseUrl = () => `http://${IP}:${PORT}`; // دائماً عنوان الشبكة المحلية (وليس localhost) ليعمل مع التلفونات

// ---------- تقديم الملفات الثابتة ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function sendFile(res, file) {
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 — not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

function resolveFile(urlPath) {
  // صفحة اليد تعمل حتى بدون بناء (من public/)
  if (urlPath === '/pad' || urlPath === '/pad/' || urlPath === '/pad.html') {
    const p = path.join(DIST, 'pad.html');
    return fs.existsSync(p) ? p : path.join(PUBLIC, 'pad.html');
  }
  if (urlPath === '/' || urlPath === '') return path.join(DIST, 'index.html');
  const safe = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  const p = path.join(DIST, safe);
  if (!p.startsWith(DIST)) return null;
  return p;
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ip: IP, port: PORT, url: baseUrl() }));
    return;
  }
  const file = resolveFile(urlPath);
  if (!file) {
    res.writeHead(403);
    res.end();
    return;
  }
  if (urlPath === '/' && !fs.existsSync(file)) {
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1 dir="rtl">لم يتم بناء اللعبة بعد. شغّل: <code>npm run build</code> ثم أعد تشغيل السيرفر.</h1>');
    return;
  }
  sendFile(res, file);
});

// ---------- إدارة الغرف ----------
/** @type {Map<string, {code:string, host:any, pads:Map<string, any>, emptySince:number}>} */
const rooms = new Map();
let everHadHost = false;
let noHostSince = 0; // وقت آخر مرة اختفى فيها الكونسل (للإطفاء التلقائي)

function newCode() {
  let code;
  do code = String(Math.floor(1000 + Math.random() * 9000));
  while (rooms.has(code));
  return code;
}

function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.role = null; // 'host' | 'pad'
  ws.on('pong', () => (ws.isAlive = true));

  ws.on('message', (raw) => {
    let m;
    try {
      m = JSON.parse(raw.toString());
    } catch {
      return;
    }
    // ===== الكونسل =====
    if (m.t === 'host') {
      let room = m.code && rooms.get(String(m.code));
      if (room && room.host && room.host !== ws && room.host.readyState === 1) room = null; // الغرفة مستخدمة
      if (!room) {
        const code = newCode();
        room = { code, host: null, pads: new Map(), emptySince: 0 };
        rooms.set(code, room);
      }
      room.host = ws;
      room.emptySince = 0;
      everHadHost = true;
      noHostSince = 0;
      ws.role = 'host';
      ws.room = room;
      send(ws, { t: 'room', code: room.code, ip: IP, url: baseUrl() });
      // أبلغ الكونسل بالتلفونات المتصلة مسبقاً (بعد إعادة تحميل الصفحة)
      for (const [id, p] of room.pads) {
        send(ws, { t: 'pad-join', id, name: p.padName, role: p.padRole || null });
        send(p, { t: 'host-back' });
      }
      console.log(`🖥️  Console connected — room ${room.code}`);
      return;
    }
    if (m.t === 'to' && ws.role === 'host') {
      const p = ws.room.pads.get(String(m.id));
      send(p, m.msg);
      return;
    }

    // ===== التلفون =====
    if (m.t === 'join') {
      const room = rooms.get(String(m.code));
      if (!room) {
        send(ws, { t: 'error', reason: 'room' });
        return;
      }
      const id = String(m.id || Math.random().toString(36).slice(2));
      const old = room.pads.get(id);
      if (old && old !== ws) {
        old.replaced = true;
        try {
          old.close();
        } catch {
          /* تجاهل */
        }
      }
      ws.role = 'pad';
      ws.room = room;
      ws.padId = id;
      ws.padName = String(m.name || 'Phone').slice(0, 20);
      ws.padRole = m.role || null;
      room.pads.set(id, ws);
      send(ws, { t: 'joined', code: room.code, host: !!(room.host && room.host.readyState === 1) });
      send(room.host, { t: 'pad-join', id, name: ws.padName, role: ws.padRole });
      console.log(`📱 Phone "${ws.padName}" joined room ${room.code}`);
      return;
    }
    if (ws.role === 'pad' && ws.room) {
      if (m.t === 'role') ws.padRole = m.role;
      // تمرير المدخلات وأي رسالة أخرى للكونسل مع هوية التلفون
      m.id = ws.padId;
      send(ws.room.host, m);
    }
  });

  ws.on('close', () => {
    const room = ws.room;
    if (!room) return;
    if (ws.role === 'host' && room.host === ws) {
      room.host = null;
      room.emptySince = Date.now();
      noHostSince = Date.now();
      for (const p of room.pads.values()) send(p, { t: 'host-lost' });
      console.log(`🖥️  Console left room ${room.code}`);
    } else if (ws.role === 'pad' && room.pads.get(ws.padId) === ws) {
      room.pads.delete(ws.padId);
      if (!ws.replaced) send(room.host, { t: 'pad-leave', id: ws.padId });
      console.log(`📱 Phone "${ws.padName}" left room ${room.code}`);
    }
  });
});

// نبض دوري لاكتشاف الاتصالات الميتة (تلفون نائم مثلاً) وتنظيف الغرف القديمة
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {
      /* تجاهل */
    }
  }
  const now = Date.now();
  if (AUTO_EXIT) {
    const hasHost = [...rooms.values()].some((r) => r.host && r.host.readyState === 1);
    if (hasHost) noHostSince = 0;
    else if (!noHostSince) noHostSince = now;
    // بعد إغلاق اللعبة بـ 8 ثوانٍ (مهلة لإعادة تحميل الصفحة) أو لو ما فتحت اللعبة أصلاً خلال دقيقتين
    const grace = everHadHost ? 8000 : 120000;
    if (!hasHost && now - noHostSince > grace) {
      console.log('🛑 اللعبة أُغلقت — إيقاف السيرفر المصغّر.');
      stopServer().then(() => process.exit(0));
    }
  }
  for (const [code, r] of rooms) {
    if (!r.host && r.emptySince && now - r.emptySince > 10 * 60 * 1000) rooms.delete(code);
  }
}, 4000);


function logBanner() {
  console.log('\n⚽🧤  BALL VS KEEPER — الكرة ضد الحارس');
  console.log('──────────────────────────────────────────');
  console.log(`🖥️  افتح اللعبة على الشاشة الكبيرة:  ${baseUrl()}`);
  console.log(`📱  رابط اليد للتلفون:              ${baseUrl()}/pad`);
  if (IPS.length > 1) console.log(`ℹ️   عناوين أخرى: ${IPS.slice(1).join(', ')}`);
  console.log(`💻  على نفس الجهاز:                http://localhost:${PORT}`);
  if (!fs.existsSync(path.join(DIST, 'index.html'))) {
    console.log('\n⚠️  مجلد dist غير موجود — شغّل: npm run build');
  }
  if (AUTO_EXIT) console.log('🔌 وضع السيرفر المصغّر: يتوقف تلقائياً عند إغلاق اللعبة.');
  console.log('──────────────────────────────────────────\n');
}

/** تشغيل السيرفر. إذا كان المنفذ مشغولاً يجرّب المنفذ التالي تلقائياً. */
export function startServer(port = PORT) {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const attempt = (p) => {
      const onError = (err) => {
        if (err.code === 'EADDRINUSE' && tries < 20) {
          tries++;
          attempt(p + 1);
        } else reject(err);
      };
      server.once('error', onError);
      server.listen(p, '0.0.0.0', () => {
        server.off('error', onError);
        PORT = p;
        logBanner();
        resolve({ port: PORT, url: baseUrl(), localUrl: `http://localhost:${PORT}` });
      });
    };
    attempt(port);
  });
}

/** إيقاف السيرفر وقطع كل الاتصالات. */
export function stopServer() {
  return new Promise((resolve) => {
    for (const ws of wss.clients) {
      try {
        ws.terminate();
      } catch {
        /* تجاهل */
      }
    }
    rooms.clear();
    clearInterval(heartbeat);
    server.close(() => resolve());
    setTimeout(resolve, 1500);
  });
}

// تشغيل مباشر من سطر الأوامر: node server.js
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
function openBrowser(url) {
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try {
    spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  } catch {
    /* تجاهل */
  }
}

if (isMain) {
  startServer()
    .then((info) => {
      if (process.argv.includes('--open')) openBrowser(info.localUrl);
    })
    .catch((e) => {
      console.error('تعذّر تشغيل السيرفر:', e.message);
      process.exit(1);
    });
  process.on('SIGINT', () => stopServer().then(() => process.exit(0)));
  process.on('SIGTERM', () => stopServer().then(() => process.exit(0)));
}
