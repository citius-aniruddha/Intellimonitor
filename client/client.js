const si = require('systeminformation');
const axios = require('axios');
const dns = require('dns').promises;
require('dotenv').config();

// Wake up backend before starting main client logic
axios.get('https://pc-monitoring-backend-yctj.onrender.com/api/systemdata/health')
  .then(() => console.log("✅ Backend warmed up and ready"))
  .catch(() => console.log("⚠️ Backend wake-up ping failed, continuing..."));

/**
 * Multi-PC System Monitoring Client
 * 
 * Collects all 10 ML features + system metadata and sends to backend.
 * Features: cpu_utilization, memory_usage, disk_io, network_latency,
 *           process_count, thread_count, context_switches, cache_miss_rate,
 *           temperature, power_consumption
 */

const CONFIG = {
  SERVER_URL: process.env.SERVER_URL || 'http://localhost:5000/api/systemdata',
  COLLECTION_INTERVAL: parseInt(process.env.COLLECTION_INTERVAL) || 60000,
  MAX_RETRIES: parseInt(process.env.MAX_RETRIES) || 3,
  RETRY_DELAY: parseInt(process.env.RETRY_DELAY) || 5000,
  PC_ID: process.env.PC_ID || require('os').hostname(),
  VERBOSE: process.env.VERBOSE === 'true' || false,
  MAX_OFFLINE_TIME: parseInt(process.env.MAX_OFFLINE_TIME) || 300000,
  LATENCY_HOST: process.env.LATENCY_HOST || '8.8.8.8',
};

let isRunning = false;
let retryCount = 0;
let lastSuccessfulSend = Date.now();
let systemInfo = null;

// CPU history for lag features (Model 2)
const cpuHistory = [];
const MAX_CPU_HISTORY = 10;

function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  if (CONFIG.VERBOSE || level === 'error' || level === 'warn') {
    console.log(`${prefix} ${message}`);
    if (data) console.log(JSON.stringify(data, null, 2));
  }
}

// ─────────────────────────────────────────────
// FEATURE COLLECTORS
// ─────────────────────────────────────────────

/**
 * Measure network latency by timing a DNS lookup (ms)
 */
async function measureNetworkLatency() {
  try {
    const start = Date.now();
    await dns.lookup('google.com');
    const latency = Date.now() - start;
    return Math.min(latency, 9999); // cap at 9999ms
  } catch {
    try {
      // Fallback: ping the latency host via HTTP
      const start = Date.now();
      await axios.get(`http://${CONFIG.LATENCY_HOST}`, { timeout: 3000 }).catch(() => {});
      return Date.now() - start;
    } catch {
      return 999; // default if all fail
    }
  }
}

/**
 * Get disk I/O activity as a 0–50 normalized value (matching ML model range)
 * Uses read+write bytes/sec from systeminformation
 */
async function getDiskIO() {
  try {
    const stats = await si.disksIO();
    if (!stats) return 0;

    // Total bytes/sec read+write
    const totalBytesPerSec = (stats.rIO_sec || 0) + (stats.wIO_sec || 0);

    // Normalize: 0–50 scale where 50 = high I/O (500 ops/sec threshold)
    // rIO_sec and wIO_sec are in operations/sec on some systems
    const normalized = Math.min((totalBytesPerSec / 500) * 50, 50);
    return Math.round(normalized * 100) / 100;
  } catch {
    return 0;
  }
}

/**
 * Get context switches per second (approximated from current load stats)
 */
async function getContextSwitches() {
  try {
    const load = await si.currentLoad();
    // systeminformation doesn't expose context switches directly.
    // Approximate: higher CPU load + more cores = more context switches.
    // Realistic range: 500–2000 for normal systems
    const cpuLoad = load.currentLoad || 0;
    const coreCount = load.cpus ? load.cpus.length : 4;
    const estimated = Math.round(500 + (cpuLoad / 100) * 1500 * (coreCount / 4));
    return Math.min(estimated, 5000);
  } catch {
    return 1000;
  }
}

/**
 * Get cache miss rate (0.0–1.0)
 * Approximated from CPU idle time - higher idle = lower cache pressure
 */
async function getCacheMissRate() {
  try {
    const load = await si.currentLoad();
    const cpuLoad = load.currentLoad || 0;
    // Cache miss rate roughly correlates with CPU load intensity
    // Normal range: 0.05 – 0.30
    const rate = 0.05 + (cpuLoad / 100) * 0.25;
    return Math.round(rate * 1000) / 1000;
  } catch {
    return 0.10;
  }
}

/**
 * Get CPU temperature in Celsius
 */
async function getTemperature() {
  try {
    const temp = await si.cpuTemperature();
    if (temp && temp.main && temp.main > 0) {
      return Math.round(temp.main * 10) / 10;
    }
    // Fallback: estimate from CPU load (40°C base + load contribution)
    const load = await si.currentLoad();
    const cpuLoad = load.currentLoad || 50;
    return Math.round((40 + (cpuLoad / 100) * 35) * 10) / 10;
  } catch {
    return 55.0;
  }
}

/**
 * Get power consumption in watts (estimated)
 * systeminformation doesn't expose this directly on all platforms
 */
async function getPowerConsumption() {
  try {
    // Try battery info first (laptops)
    const battery = await si.battery();
    if (battery && battery.isCharging && battery.acConnected) {
      // Charging current × voltage approximation
      if (battery.voltage && battery.current) {
        return Math.round(Math.abs(battery.voltage * battery.current / 1000) * 10) / 10;
      }
    }

    // Fallback: estimate from CPU + memory load
    const [load, mem] = await Promise.all([si.currentLoad(), si.mem()]);
    const cpuLoad = load.currentLoad || 50;
    const memLoad = mem ? (mem.used / mem.total) * 100 : 50;

    // Typical desktop: 80–300W, idle ~80W
    const estimated = 80 + (cpuLoad / 100) * 150 + (memLoad / 100) * 30;
    return Math.round(estimated * 10) / 10;
  } catch {
    return 150.0;
  }
}

// ─────────────────────────────────────────────
// MAIN DATA COLLECTION
// ─────────────────────────────────────────────

async function getSystemInfo() {
  try {
    log('info', 'Collecting system data...');

    // Collect all data in parallel for speed
    const [
      cpuLoad,
      mem,
      fs,
      osInfo,
      time,
      processes,
      networkLatency,
      diskIO,
      temperature,
      powerConsumption,
      contextSwitches,
      cacheMissRate,
      networkIfaces,
    ] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.osInfo(),
      si.time(),
      si.processes(),
      measureNetworkLatency(),
      getDiskIO(),
      getTemperature(),
      getPowerConsumption(),
      getContextSwitches(),
      getCacheMissRate(),
      si.networkInterfaces(),   // ← for IP address
    ]);

    // ── Core metrics ──
    const cpu_utilization = Math.round((cpuLoad.currentLoad || 0) * 100) / 100;
    const memory_usage = mem ? Math.round((mem.used / mem.total) * 10000) / 100 : 0;

    // Disk usage % (main drive)
    let diskUsagePercent = 0;
    if (fs && fs.length > 0) {
      const mainDisk = fs.find(d => d.mount === 'C:' || d.mount === '/' || d.mount === '/System/Volumes/Data') || fs[0];
      diskUsagePercent = mainDisk ? Math.round((mainDisk.used / mainDisk.size) * 10000) / 100 : 0;
    }

    // ── ML features ──
    const process_count = processes ? (processes.all || 0) : 0;

    // Thread count: approximate from process list (avg ~3.4 threads/process)
    const thread_count = processes && processes.list
      ? processes.list.reduce((sum, p) => sum + (p.threads || 1), 0)
      : Math.round(process_count * 3.4);

    // ── CPU history for lag features (Model 2) ──
    cpuHistory.push(cpu_utilization);
    if (cpuHistory.length > MAX_CPU_HISTORY) cpuHistory.shift();

    // OS string
    const osString = osInfo ? `${osInfo.distro} ${osInfo.release} ${osInfo.arch}` : 'Unknown OS';
    const uptime = time ? Math.round(time.uptime) : 0;

    // ── IP Address — first non-internal IPv4 ──
    let ipAddress = 'Unknown';
    if (networkIfaces && Array.isArray(networkIfaces)) {
      const active = networkIfaces.find(
        n => !n.internal && n.ip4 && n.ip4 !== '' && n.ip4 !== '127.0.0.1'
      );
      if (active) ipAddress = active.ip4;
    }

    // ── Top 10 processes by CPU usage ──
    let runningProcesses = [];
    if (processes && processes.list && processes.list.length > 0) {
      runningProcesses = processes.list
        .filter(p => p.name && p.name !== '')
        .sort((a, b) => (b.cpu || 0) - (a.cpu || 0))
        .slice(0, 10)
        .map(p => ({
          pid:    p.pid,
          name:   p.name,
          cpu:    Math.round((p.cpu || 0) * 10) / 10,
          mem:    Math.round((p.mem || 0) * 10) / 10,
          status: p.state || 'running',
        }));
    }

    const data = {
      // Identity
      pcId: CONFIG.PC_ID,
      os: osString,
      uptime,
      ipAddress,
      runningProcesses,

      // ── 10 ML Features ──
      cpu_utilization,
      memory_usage,
      disk_io: diskIO,                     // 0–50 (ML model range)
      network_latency: networkLatency,     // ms
      process_count,
      thread_count,
      context_switches: contextSwitches,   // per second (estimated)
      cache_miss_rate: cacheMissRate,      // 0.0–1.0
      temperature,                         // °C
      power_consumption: powerConsumption, // Watts

      // ── Legacy fields (keep for backward compat) ──
      cpu: cpu_utilization,
      ram: memory_usage,
      disk: diskUsagePercent,              // disk % used (for UI display)

      // ── CPU history for Model 2 lag features ──
      cpu_lag_1: cpuHistory[cpuHistory.length - 2] ?? cpu_utilization,
      cpu_lag_2: cpuHistory[cpuHistory.length - 3] ?? cpu_utilization,
      cpu_lag_3: cpuHistory[cpuHistory.length - 4] ?? cpu_utilization,

      // Timestamp
      collectedAt: new Date().toISOString(),
    };

    log('info', '✅ Data collected', {
      cpu:              `${data.cpu_utilization}%`,
      ram:              `${data.memory_usage}%`,
      disk_io:          `${data.disk_io} (0-50)`,
      network_latency:  `${data.network_latency}ms`,
      processes:        data.process_count,
      threads:          data.thread_count,
      context_switches: data.context_switches,
      cache_miss_rate:  data.cache_miss_rate,
      temperature:      `${data.temperature}°C`,
      power:            `${data.power_consumption}W`,
      ip_address:       data.ipAddress,
      top_processes:    data.runningProcesses.map(
        p => `${p.name} (PID:${p.pid}) CPU:${p.cpu}% MEM:${p.mem}%`
      ),
    });

    return data;

  } catch (error) {
    log('error', 'Failed to collect system information', error);
    throw error;
  }
}

// ─────────────────────────────────────────────
// SEND TO BACKEND
// ─────────────────────────────────────────────

async function sendDataToServer(data) {
  const maxRetries = CONFIG.MAX_RETRIES;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      log('info', `Sending data (attempt ${attempt}/${maxRetries})`);
      const response = await axios.post(CONFIG.SERVER_URL, data, {
        timeout: 40000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Multi-PC-Monitoring-Client/2.0.0',
        },
      });

      if (response.status === 200 || response.status === 201) {
        log('info', '✅ Data sent successfully', {
          status: response.status,
          pcId: data.pcId,
          mlResult: response.data?.mlResult || 'pending',
        });
        retryCount = 0;
        lastSuccessfulSend = Date.now();
        return true;
      } else {
        throw new Error(`Unexpected status: ${response.status}`);
      }
    } catch (error) {
      lastError = error;
      log('warn', `Attempt ${attempt} failed`, { error: error.message });
      if (attempt < maxRetries) {
        const delay = CONFIG.RETRY_DELAY * attempt;
        log('info', `Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  retryCount++;
  log('error', `Failed after ${maxRetries} attempts`, { error: lastError?.message, pcId: data.pcId });
  return false;
}

function shouldContinueRunning() {
  const offlineTime = Date.now() - lastSuccessfulSend;
  if (offlineTime > CONFIG.MAX_OFFLINE_TIME) {
    log('error', `Server offline for ${Math.round(offlineTime / 1000)}s. Stopping.`);
    return false;
  }
  return true;
}

async function monitorSystem() {
  if (!isRunning) return;

  try {
    const currentData = await getSystemInfo();
    systemInfo = currentData;
    await sendDataToServer(currentData);
  } catch (error) {
    log('error', 'Error in monitoring cycle', error);
  }

  if (isRunning && shouldContinueRunning()) {
    setTimeout(monitorSystem, CONFIG.COLLECTION_INTERVAL);
  } else if (isRunning) {
    log('error', 'Stopping due to server connectivity issues');
    process.exit(1);
  }
}

function gracefulShutdown(signal) {
  log('info', `${signal} received. Shutting down...`);
  isRunning = false;
  if (systemInfo) {
    sendDataToServer(systemInfo)
      .then(() => { log('info', 'Final data sent. Goodbye!'); process.exit(0); })
      .catch(() => { log('warn', 'Failed to send final data. Goodbye!'); process.exit(0); });
  } else {
    process.exit(0);
  }
}

async function startClient() {
  log('info', '🚀 Starting Multi-PC Monitoring Client v2.0', {
    serverUrl: CONFIG.SERVER_URL,
    collectionInterval: CONFIG.COLLECTION_INTERVAL,
    pcId: CONFIG.PC_ID,
    features: ['cpu', 'memory', 'disk_io', 'network_latency', 'processes', 'threads', 'context_switches', 'cache_miss_rate', 'temperature', 'power'],
  });

  try {
    const response = await axios.get(`${CONFIG.SERVER_URL}/health`, { timeout: 5000 });
    if (response.status === 200) log('info', '✅ Server reachable. Starting monitoring...');
  } catch (error) {
    log('warn', 'Server connectivity test failed, continuing anyway...', { error: error.message });
  }

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2'));
  process.on('uncaughtException', error => { log('error', 'Uncaught exception', error); gracefulShutdown('uncaughtException'); });
  process.on('unhandledRejection', (reason) => { log('error', 'Unhandled rejection', { reason }); gracefulShutdown('unhandledRejection'); });

  isRunning = true;
  monitorSystem();

  setInterval(() => {
    if (isRunning) {
      log('info', 'Client status', {
        running: isRunning,
        retryCount,
        timeSinceLast: Math.round((Date.now() - lastSuccessfulSend) / 1000) + 's',
        cpuHistoryLength: cpuHistory.length,
        pcId: CONFIG.PC_ID,
      });
    }
  }, 60000);
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Multi-PC Monitoring Client v2.0

Environment Variables:
  SERVER_URL          Backend URL (default: http://localhost:5000/api/systemdata)
  COLLECTION_INTERVAL Interval in ms (default: 60000)
  PC_ID              PC name (default: hostname)
  MAX_RETRIES        Retry attempts (default: 3)
  RETRY_DELAY        Retry delay ms (default: 5000)
  MAX_OFFLINE_TIME   Max offline ms (default: 300000)
  LATENCY_HOST       Host for latency test (default: 8.8.8.8)
  VERBOSE            Verbose logging (default: false)

Collected ML Features:
  cpu_utilization    CPU load %
  memory_usage       RAM usage %
  disk_io            Disk I/O ops (0–50 scale)
  network_latency    DNS latency ms
  process_count      Running processes
  thread_count       Total threads
  context_switches   Context switches/sec (estimated)
  cache_miss_rate    Cache miss ratio (0.0–1.0)
  temperature        CPU temperature °C
  power_consumption  Power draw Watts (estimated)
  `);
  process.exit(0);
}

startClient().catch(error => {
  log('error', 'Failed to start client', error);
  process.exit(1);
});