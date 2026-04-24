const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store');
const AutoLaunch = require('auto-launch');
const parseCurl = require('parse-curl');
const axios = require('axios');
const { machineIdSync } = require('node-machine-id');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config();

const store = new Store();
const curliflowerAutoLauncher = new AutoLaunch({
  name: 'Curliflower',
  path: app.getPath('exe'),
});

// --- Supabase Auth Settings ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const hwid = machineIdSync();
// ------------------------------

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile('index.html');
  
  // Open DevTools in development if needed
  // win.webContents.openDevTools();
}

app.whenReady().then(() => {
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
    const response = await axios({
      url: cmd.url,
      method: cmd.method,
      headers: {
        ...cmd.headers,
        // Ensure User-Agent is sent as provided in curl, bypassing browser restrictions
        'User-Agent': cmd.headers['User-Agent'] || cmd.headers['user-agent'] || 'Mozilla/5.0'
      },
      data: cmd.method !== 'GET' ? cmd.body : undefined,
      validateStatus: () => true, // Don't throw on error status
      timeout: 10000,
      responseType: 'text'
    });

    const duration = Date.now() - startTime;
    return {
      success: true,
      status: response.status,
      data: response.data,
      duration: duration
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

// Manual Run IPC if needed (usually handled in renderer but for logs/persistence main can help)
ipcMain.on('log-to-terminal', (event, msg) => {
  console.log('[Renderer Log]:', msg);
});

// Authentication Handlers
ipcMain.handle('auth-check', async (event, cafeId) => {
  try {
    const { data, error } = await supabase
      .from('licenses')
      .select('*')
      .eq('cafe_id', cafeId)
      .eq('hwid', hwid)
      .single();

    if (error || !data) {
      return { status: 'NOT_FOUND', hwid };
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

ipcMain.handle('auth-request', async (event, cafeId) => {
  try {
    const { data, error } = await supabase
      .from('licenses')
      .upsert([{ cafe_id: cafeId, hwid: hwid, is_approved: false }], { onConflict: 'cafe_id,hwid' });
    
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
    hwid: hwid
  };
});

ipcMain.handle('logout-auth', () => {
  store.delete('is_authorized');
  store.delete('cafe_id');
  return { success: true };
});
