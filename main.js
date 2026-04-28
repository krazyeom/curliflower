const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store');
const AutoLaunch = require('auto-launch');
const parseCurl = require('parse-curl');
const axios = require('axios');
const { machineIdSync } = require('node-machine-id');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent');
const { createClient } = require('@supabase/supabase-js');

const store = new Store();
const curliflowerAutoLauncher = new AutoLaunch({
  name: 'Curliflower',
  path: app.getPath('exe'),
});

const hwid = machineIdSync();

// --- Supabase Auth Settings ---
const SUPABASE_URL = 'https://fdcmiqwbihbubsrjhwxy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_BeiX5hATlw17EqyFw0aiBw_8twbWoYa';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
// ------------------------------

// --- Proxy Setup (Boot time) ---
const initialProxy = store.get('proxy-url');
if (initialProxy) {
  app.commandLine.appendSwitch('proxy-server', initialProxy);
}

function applyProxy(proxyUrl) {
  const { session } = require('electron');
  if (proxyUrl) {
    session.defaultSession.setProxy({ proxyRules: proxyUrl });
    console.log(`Proxy applied to session: ${proxyUrl}`);
  } else {
    session.defaultSession.setProxy({ proxyRules: '' });
    console.log('Proxy disabled for session');
  }
}
// ------------------------------

// Disable Hardware Acceleration for stability on some Windows machines
app.disableHardwareAcceleration();

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    show: false, // Start hidden to prevent white flash
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Show window only when it is ready to be painted
  win.once('ready-to-show', () => {
    win.show();
  });

  // Use absolute path for loading file to avoid Windows path issues
  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  applyProxy(store.get('proxy-url'));
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Store Handlers
ipcMain.handle('get-commands', () => {
  return store.get('commands', []);
});

ipcMain.handle('save-commands', (event, commands) => {
  store.set('commands', commands);
  return { success: true };
});

// Auto-launch Handlers
ipcMain.handle('get-autolaunch', async () => {
  return await curliflowerAutoLauncher.isEnabled();
});

ipcMain.handle('set-autolaunch', async (event, enabled) => {
  if (enabled) {
    await curliflowerAutoLauncher.enable();
  } else {
    await curliflowerAutoLauncher.disable();
  }
  return { success: true };
});

ipcMain.handle('parse-curl', (event, curlString) => {
  try {
    // Pre-process for Chrome/Safari compatibility
    let processed = curlString
      .replace(/--data-raw/g, '--data')
      .replace(/--data-binary/g, '--data');

    const parsed = parseCurl(processed);
    
    let method = parsed.method || 'GET';
    // If there's data but method is GET, it's likely a POST
    if (method === 'GET' && (processed.includes('--data') || processed.includes('-d '))) {
      method = 'POST';
    }

    // Standardize the object for our renderer
    return { 
      success: true, 
      data: {
        url: parsed.url,
        method: method,
        headers: parsed.header || {},
        body: parsed.body
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('open-external', (event, url) => {
  const { shell } = require('electron');
  shell.openExternal(url);
  return { success: true };
});

ipcMain.handle('execute-request', async (event, cmd) => {
  try {
    const startTime = Date.now();
    
    // axios configuration
    const config = {
      method: cmd.method,
      url: cmd.url,
      headers: {
        ...cmd.headers,
        'User-Agent': cmd.headers['User-Agent'] || cmd.headers['user-agent'] || 'Mozilla/5.0'
      },
      data: cmd.method !== 'GET' ? cmd.body : undefined,
      validateStatus: () => true,
      timeout: 30000,
      responseType: 'text'
    };

    // Apply Proxy if set in settings
    const proxyUrl = store.get('proxy-url');
    if (proxyUrl) {
      try {
        config.httpsAgent = new HttpsProxyAgent(proxyUrl);
        config.httpAgent = new HttpProxyAgent(proxyUrl);
        config.proxy = false; // Disable axios default proxy handling
      } catch (e) {
        console.error('Proxy parse error for axios:', e);
      }
    }

    const response = await axios(config);
    const duration = Date.now() - startTime;
    return {
      success: true,
      status: response.status,
      data: typeof response.data === 'object' ? JSON.stringify(response.data) : response.data,
      duration: duration
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

ipcMain.handle('get-proxy', () => {
  return store.get('proxy-url', '');
});

ipcMain.handle('set-proxy', (event, url) => {
  store.set('proxy-url', url);
  applyProxy(url);
  return { success: true };
});

// Manual Run IPC if needed (usually handled in renderer but for logs/persistence main can help)
ipcMain.on('log-to-terminal', (event, msg) => {
  console.log('[Renderer Log]:', msg);
});

// Authentication Handlers
ipcMain.handle('auth-check', async (event, cafeId, hwidOverride) => {
  try {
    const currentHwid = hwidOverride || store.get('hwid') || hwid;
    if (hwidOverride) store.set('hwid', hwidOverride);

    // Bypass for master user
    if (cafeId === 'krazyeom그래염') {
      store.set('is_authorized', true);
      store.set('cafe_id', cafeId);
      return { status: 'APPROVED', data: { cafe_id: cafeId, hwid: currentHwid, is_approved: true } };
    }

    const { data, error } = await supabase
      .from('licenses')
      .select('*')
      .eq('cafe_id', cafeId)
      .eq('hwid', currentHwid)
      .single();

    if (error || !data) {
      return { status: 'NOT_FOUND', hwid: currentHwid };
    }
    
    if (data.is_approved) {
      store.set('is_authorized', true);
      store.set('cafe_id', cafeId);
      return { status: 'APPROVED', data };
    }
    
    return { status: 'PENDING', data };
  } catch (err) {
    return { status: 'ERROR', message: err.message };
  }
});

ipcMain.handle('auth-request', async (event, cafeId, hwidOverride) => {
  try {
    const currentHwid = hwidOverride || store.get('hwid') || hwid;
    if (hwidOverride) store.set('hwid', hwidOverride);

    // Bypass for master user
    if (cafeId === 'krazyeom그래염') {
      store.set('is_authorized', true);
      store.set('cafe_id', cafeId);
      return { success: true };
    }

    const { data, error } = await supabase
      .from('licenses')
      .upsert([{ cafe_id: cafeId, hwid: currentHwid, is_approved: false }], { onConflict: 'cafe_id,hwid' });
    
    if (error) return { success: false, message: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

ipcMain.handle('get-stored-auth', () => {
  return {
    isAuthorized: store.get('is_authorized', false),
    cafeId: store.get('cafe_id', ''),
    hwid: store.get('hwid') || hwid
  };
});

ipcMain.handle('logout-auth', () => {
  store.delete('is_authorized');
  store.delete('cafe_id');
  return { success: true };
});
