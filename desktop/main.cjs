// ===================== BALL VS KEEPER — تطبيق سطح المكتب =====================
// يشغّل السيرفر المصغّر داخل التطبيق عند فتح اللعبة، ويطفيه عند إغلاقها.
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

let win = null;
let api = null;
let quitting = false;

async function boot() {
  // السيرفر المصغّر: يبدأ مع اللعبة (المنفذ 3000، أو التالي إن كان مشغولاً)
  api = await import(pathToFileURL(path.join(__dirname, 'app', 'server.js')).href);
  const info = await api.startServer(3000);

  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    width: 1280,
    height: 720,
    backgroundColor: '#020617',
    title: 'BALL VS KEEPER',
    autoHideMenuBar: true,
    webPreferences: {
      // يبقى اللعب والأيدي شغّالة حتى لو النافذة بالخلفية
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') win.setFullScreen(!win.isFullScreen());
  });
  await win.loadURL(info.localUrl);
}

app.whenReady().then(boot).catch((e) => {
  console.error(e);
  app.exit(1);
});

app.on('window-all-closed', () => app.quit());

// إغلاق اللعبة = إيقاف السيرفر المصغّر
app.on('before-quit', (e) => {
  if (quitting) return;
  quitting = true;
  e.preventDefault();
  Promise.resolve(api ? api.stopServer() : null).finally(() => app.exit(0));
});
