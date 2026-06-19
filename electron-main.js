const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const child_process = require('child_process');
const fs = require('fs');
const os = require('os');

let mainWindow;
let backendProcess;
let frontendProcess;

// Helper to kill child processes
function killProcesses() {
  if (backendProcess) {
    console.log('Stopping NestJS Backend...');
    backendProcess.kill();
    backendProcess = null;
  }
  if (frontendProcess) {
    console.log('Stopping Next.js Frontend...');
    frontendProcess.kill();
    frontendProcess = null;
  }
}

// 1. Initialize SQLite Database using Prisma
function initDatabase() {
  console.log('Initializing SQLite Database...');
  try {
    // Ensure user data directory exists and set DATABASE_URL
    const userDataPath = app.getPath('userData');
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    const dbPath = path.join(userDataPath, 'dev.db').replace(/\\/g, '/');
    process.env.DATABASE_URL = `file:${dbPath}`;
    console.log(`Using database URL: ${process.env.DATABASE_URL}`);

    const schemaSqlite = path.join(__dirname, 'backend', 'prisma', 'schema.sqlite.prisma');
    const schemaDest = path.join(__dirname, 'backend', 'prisma', 'schema.prisma');
    
    // Copy the sqlite schema if different and destination is writable
    try {
      let shouldCopy = true;
      if (fs.existsSync(schemaSqlite) && fs.existsSync(schemaDest)) {
        const sqliteContent = fs.readFileSync(schemaSqlite, 'utf8');
        const destContent = fs.readFileSync(schemaDest, 'utf8');
        if (sqliteContent === destContent) {
          shouldCopy = false;
        }
      }
      if (shouldCopy && fs.existsSync(schemaSqlite)) {
        fs.copyFileSync(schemaSqlite, schemaDest);
        console.log('Prisma schema updated to SQLite.');
      } else {
        console.log('Prisma schema already set to SQLite.');
      }
    } catch (copyErr) {
      console.warn('Unable to copy/verify Prisma schema (read-only filesystem). Continuing with packaged schema:', copyErr.message);
    }

    // Run prisma db push to sync the database
    const prismaCli = path.join(__dirname, 'backend', 'node_modules', 'prisma', 'build', 'index.js');
    console.log('Running database migrations via Prisma...');
    const result = child_process.spawnSync(process.execPath, [prismaCli, 'db', 'push', '--accept-data-loss'], {
      cwd: path.join(__dirname, 'backend'),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: 'inherit'
    });

    if (result.status !== 0) {
      console.error('Database migration failed:', result.error || 'Unknown error');
    } else {
      console.log('Database initialized successfully.');
    }
  } catch (error) {
    console.error('Error during database initialization:', error);
  }
}

// 2. Start NestJS Backend
function startBackend() {
  console.log('Starting NestJS Backend...');
  const backendMain = path.join(__dirname, 'backend', 'dist', 'main.js');

  backendProcess = child_process.spawn(process.execPath, [backendMain], {
    cwd: path.join(__dirname, 'backend'),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  });

  backendProcess.stdout.on('data', (data) => {
    console.log(`[Backend]: ${data}`);
  });

  backendProcess.stderr.on('data', (data) => {
    console.error(`[Backend Error]: ${data}`);
  });

  backendProcess.on('error', (err) => {
    console.error('[Backend Spawn Error]:', err);
  });

  backendProcess.on('exit', (code, signal) => {
    console.log(`[Backend Process Exited] code: ${code}, signal: ${signal}`);
  });
}

// 3. Start Next.js Frontend
function startFrontend() {
  console.log('Starting Next.js Frontend...');
  const nextCli = path.join(__dirname, 'frontend', 'node_modules', 'next', 'dist', 'bin', 'next');

  frontendProcess = child_process.spawn(process.execPath, [nextCli, 'start', '-H', '0.0.0.0'], {
    cwd: path.join(__dirname, 'frontend'),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  });

  frontendProcess.stdout.on('data', (data) => {
    console.log(`[Frontend]: ${data}`);
  });

  frontendProcess.stderr.on('data', (data) => {
    console.error(`[Frontend Error]: ${data}`);
  });

  frontendProcess.on('error', (err) => {
    console.error('[Frontend Spawn Error]:', err);
  });

  frontendProcess.on('exit', (code, signal) => {
    console.log(`[Frontend Process Exited] code: ${code}, signal: ${signal}`);
  });
}

// 4. Detect local network IP addresses
function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ipAddresses = [];

  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        let type = 'Other Network';
        const lowercaseName = name.toLowerCase();
        if (lowercaseName.startsWith('docker') || lowercaseName.startsWith('br-') || lowercaseName.startsWith('veth') || lowercaseName.startsWith('virbr')) {
          type = 'Virtual/Docker';
        } else if (lowercaseName.startsWith('wlan') || lowercaseName.startsWith('wlp') || lowercaseName.startsWith('wl') || lowercaseName.startsWith('ap')) {
          type = 'Wi-Fi / Hotspot';
        } else if (lowercaseName.startsWith('eth') || lowercaseName.startsWith('enp') || lowercaseName.startsWith('en')) {
          type = 'Ethernet / Wired';
        }
        ipAddresses.push({ interface: name, address: net.address, type });
      }
    }
  }
  return ipAddresses;
}

function createMenu() {
  const ipAddresses = getLocalIPs();
  
  const ipSubmenu = ipAddresses.map(ip => ({
    label: `${ip.type} (${ip.interface}): http://${ip.address}:3000/exams`,
    click: () => {
      require('electron').shell.writeText(`http://${ip.address}:3000/exams`);
    }
  }));

  if (ipSubmenu.length === 0) {
    ipSubmenu.push({ label: 'No active local networks found', enabled: false });
  } else {
    ipSubmenu.unshift({ label: 'Click on any URL to copy it to clipboard:', enabled: false }, { type: 'separator' });
  }

  const template = [
    {
      label: 'File',
      submenu: [
        { role: 'quit' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Student Portal URLs (LAN)',
      submenu: ipSubmenu
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Troubleshooting: Connection Issues',
          click: async () => {
            const { dialog } = require('electron');
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Connection & LAN Troubleshooting',
              message: 'If students cannot connect to the server from their devices:\n\n' +
                '1. AP / Wi-Fi Isolation (Very common on Hostel/Public Wi-Fi):\n' +
                '   Public/shared networks usually block local devices from communicating with each other. ' +
                'To bypass this, turn on your laptop\'s Mobile Hotspot and connect the student devices/phones directly to it.\n\n' +
                '2. Firewall Settings:\n' +
                '   Ensure your computer allows incoming traffic on ports 3000 and 3002.\n' +
                '   - Linux: sudo ufw allow 3000/tcp && sudo ufw allow 3002/tcp\n' +
                '   - Windows: Allow Node.js/Electron through Windows Defender Firewall, or allow ports 3000 & 3002.',
              buttons: ['OK']
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Codexa Lecturer Portal',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Load Next.js server page
  mainWindow.loadURL('http://localhost:3000');

  // Next.js server can take longer to boot up, so retry on connection failure
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.log(`[Electron]: Failed to load URL "${validatedURL}": ${errorDescription} (${errorCode})`);
    if (validatedURL.startsWith('http://localhost:3000')) {
      console.log('[Electron]: Next.js server not ready yet. Retrying in 1 second...');
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL('http://localhost:3000');
        }
      }, 1000);
    }
  });

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

// Lifecycle events
app.on('ready', () => {
  initDatabase();
  startBackend();
  startFrontend();

  console.log('\n=============================================');
  console.log('Codexa Host is active!');
  console.log('Lecturer Dashboard: http://localhost:3000');
  console.log('Available LAN IP addresses for students:');
  const ips = getLocalIPs();
  ips.forEach(ip => {
    console.log(` - ${ip.type} (${ip.interface}): http://${ip.address}:3000/exams`);
  });
  console.log('=============================================\n');

  createMenu();

  // Give servers 4 seconds to spin up before showing UI
  setTimeout(createWindow, 4000);
});

app.on('window-all-closed', () => {
  killProcesses();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  killProcesses();
});
