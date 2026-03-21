const express = require('express');
const router  = express.Router();
const axios   = require('axios');
const SystemInfo = require('../models/SystemInfo');

const ML_API_URL = process.env.ML_API_URL || 'http://localhost:8000';
const ML_TIMEOUT = parseInt(process.env.ML_TIMEOUT) || 10000;

/**
 * Call Python ML API with 10 features.
 * Returns Model 1 (anomaly) + Model 3 (bottleneck) + Model 5 (severity).
 * If ML API is offline, returns mlStatus: 'unavailable' — data still saves.
 */
async function getMLPredictions(features) {
  try {
    const response = await axios.post(`${ML_API_URL}/predict`, features, {
      timeout: ML_TIMEOUT,
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.status === 200 && response.data) {
      return {
        // Model 1 — Isolation Forest
        isAnomaly:    response.data.isAnomaly    ?? null,
        anomalyScore: response.data.anomalyScore ?? null,

        // Model 3 — Bottleneck
        bottleneck: {
          label:      response.data.bottleneck?.label      ?? null,
          confidence: response.data.bottleneck?.confidence ?? null,
        },

        // Model 5 — Severity
        severity: {
          score:  response.data.severity?.score  ?? null,
          level:  response.data.severity?.level  ?? null,
          action: response.data.severity?.action ?? null,
        },

        mlStatus:      'success',
        mlProcessedAt: new Date(),
        mlError:       null,
      };
    }
    throw new Error(`ML API returned status ${response.status}`);

  } catch (error) {
    console.warn('⚠️  ML API unavailable:', error.message);
    return {
      mlStatus:      'unavailable',
      mlError:       error.message,
      mlProcessedAt: new Date(),
    };
  }
}

// ─────────────────────────────────────────────────────────
// POST /api/systemdata
// ─────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const {
      pcId, os, uptime,
      // NEW fields
      ipAddress, runningProcesses,
      // Legacy fields (kept for backward compat)
      cpu, ram, disk,
      // 10 ML features
      cpu_utilization, memory_usage, disk_io,
      network_latency, process_count, thread_count,
      context_switches, cache_miss_rate, temperature, power_consumption,
    } = req.body;

    if (!pcId) {
      return res.status(400).json({ success: false, message: 'Missing required field: pcId' });
    }

    // Prefer new field names, fall back to legacy
    const cpuVal  = cpu_utilization ?? cpu ?? 0;
    const ramVal  = memory_usage    ?? ram ?? 0;
    const diskVal = disk ?? 0;

    if (cpuVal < 0 || cpuVal > 100 || ramVal < 0 || ramVal > 100) {
      return res.status(400).json({
        success: false,
        message: 'Invalid range: cpu/ram must be 0–100',
      });
    }

    // ML feature object — sent to Python API
    const mlFeatures = {
      cpu_utilization:   cpuVal,
      memory_usage:      ramVal,
      disk_io:           disk_io          ?? 0,
      network_latency:   network_latency  ?? 100,
      process_count:     process_count    ?? 500,
      thread_count:      thread_count     ?? 1500,
      context_switches:  context_switches ?? 1000,
      cache_miss_rate:   cache_miss_rate  ?? 0.1,
      temperature:       temperature      ?? 55,
      power_consumption: power_consumption ?? 150,
    };

    // Save to DB immediately with mlStatus: 'pending'
    const systemData = new SystemInfo({
      pcId,
      os:               os || 'Unknown',
      uptime:           uptime || 0,
      ipAddress:        ipAddress   || 'Unknown',
      runningProcesses: runningProcesses || [],
      // Legacy
      cpu:  cpuVal,
      ram:  ramVal,
      disk: diskVal,
      // ML features
      ...mlFeatures,
      mlResults: { mlStatus: 'pending' },
    });

    await systemData.save();

    // Respond to client right away — don't make client wait for ML
    res.status(201).json({
      success: true,
      message: 'Data saved. ML processing in background.',
      data: {
        id:        systemData._id,
        pcId:      systemData.pcId,
        timestamp: systemData.createdAt,
        mlStatus:  'pending',
      },
    });

    // Run ML async — update record when done
    getMLPredictions(mlFeatures).then(async (mlResults) => {
      try {
        await SystemInfo.findByIdAndUpdate(systemData._id, {
          $set: { mlResults },
        });
        console.log(`✅ ML done for ${pcId} — anomaly: ${mlResults.isAnomaly}, severity: ${mlResults.severity?.level ?? '—'}`);
      } catch (updateErr) {
        console.error('Failed to update ML results:', updateErr.message);
      }
    });

  } catch (error) {
    console.error('Error saving system data:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/systemdata
// ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { pcId, hours = 24 } = req.query;
    const hoursNum = parseInt(hours);

    if (isNaN(hoursNum) || hoursNum < 1 || hoursNum > 168) {
      return res.status(400).json({ success: false, message: 'Invalid hours (1–168)' });
    }

    if (pcId) {
      const [latestData, historicalData] = await Promise.all([
        SystemInfo.findOne({ pcId }).sort({ createdAt: -1 }),
        SystemInfo.getHistoricalData(pcId, hoursNum),
      ]);
      return res.json({
        success: true,
        data: { pcId, latest: latestData, historical: historicalData, timeRange: `${hoursNum} hours` },
      });
    }

    const [latestData, overviewStats] = await Promise.all([
      SystemInfo.getLatestData(),
      SystemInfo.getOverviewStats(),
    ]);

    res.json({
      success: true,
      data: {
        latest:   latestData,
        overview: overviewStats[0] || {
          avgCpu: 0, avgRam: 0, avgDisk: 0,
          avgNetworkLatency: 0, avgTemperature: 0, avgPower: 0,
          totalPCs: 0, anomalyCount: 0,
        },
        timeRange: '24 hours',
      },
    });

  } catch (error) {
    console.error('Error fetching system data:', error);
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/systemdata/pcs
// ─────────────────────────────────────────────────────────
router.get('/pcs', async (req, res) => {
  try {
    const pcs = await SystemInfo.getLatestData();
    res.json({ success: true, data: pcs, count: pcs.length });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/systemdata/ml/:pcId
// Returns only the latest ML results for a specific PC
// ─────────────────────────────────────────────────────────
router.get('/ml/:pcId', async (req, res) => {
  try {
    const { pcId } = req.params;
    const latest = await SystemInfo
      .findOne({ pcId })
      .sort({ createdAt: -1 })
      .select('pcId mlResults createdAt cpu_utilization memory_usage disk_io temperature');

    if (!latest) {
      return res.status(404).json({ success: false, message: `PC '${pcId}' not found` });
    }
    res.json({ success: true, data: latest });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
});

// ─────────────────────────────────────────────────────────
// DELETE /api/systemdata/cleanup
// ─────────────────────────────────────────────────────────
router.delete('/cleanup', async (req, res) => {
  try {
    const { hours = 24 } = req.query;
    const hoursNum = parseInt(hours);
    if (isNaN(hoursNum) || hoursNum < 1) {
      return res.status(400).json({ success: false, message: 'Invalid hours parameter' });
    }
    const result = await SystemInfo.cleanupOldData(hoursNum);
    res.json({ success: true, message: `Deleted ${result.deletedCount} old records`, deletedCount: result.deletedCount });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/systemdata/health
// ─────────────────────────────────────────────────────────
router.get('/health', (req, res) => {
  res.json({ success: true, message: 'API healthy', timestamp: new Date().toISOString() });
});

module.exports = router;