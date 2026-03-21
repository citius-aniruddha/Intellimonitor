const mongoose = require('mongoose');

/**
 * SystemInfo Schema
 * Stores all 10 ML input features + results from Model 1, 3, 5.
 */
const SystemInfoSchema = new mongoose.Schema(
  {
    // ── Identity ──────────────────────────────────
    pcId:      { type: String, required: true, trim: true, index: true },
    os:        { type: String, default: 'Unknown' },
    uptime:    { type: Number, default: 0 },
    ipAddress: { type: String, default: 'Unknown' },

    // Top 10 processes by CPU usage
    runningProcesses: [{
      pid:    { type: Number },
      name:   { type: String },
      cpu:    { type: Number },  // % CPU
      mem:    { type: Number },  // % RAM
      status: { type: String },
    }],

    // ── Legacy display fields (kept for UI backward compat) ──
    cpu:  { type: Number, default: 0, min: 0, max: 100 }, // = cpu_utilization
    ram:  { type: Number, default: 0, min: 0, max: 100 }, // = memory_usage
    disk: { type: Number, default: 0, min: 0, max: 100 }, // disk % used

    // ── 10 ML Input Features ──────────────────────
    cpu_utilization:   { type: Number, default: 0 },
    memory_usage:      { type: Number, default: 0 },
    disk_io:           { type: Number, default: 0 },  // 0–50 range
    network_latency:   { type: Number, default: 0 },  // ms
    process_count:     { type: Number, default: 0 },
    thread_count:      { type: Number, default: 0 },
    context_switches:  { type: Number, default: 0 },
    cache_miss_rate:   { type: Number, default: 0 },  // 0.0–1.0
    temperature:       { type: Number, default: 0 },  // °C
    power_consumption: { type: Number, default: 0 },  // Watts

    // ── ML Results (Model 1, 3, 5 only) ───────────
    mlResults: {
      // Model 1 — Isolation Forest
      isAnomaly:    { type: Boolean, default: null },
      anomalyScore: { type: Number,  default: null },

      // Model 3 — Bottleneck Classification
      bottleneck: {
        label:      { type: String, default: null }, // CPU_Bound / Memory_Bound / Disk_Bound / Normal
        confidence: { type: Number, default: null }, // 0–100 %
      },

      // Model 5 — Severity Score
      severity: {
        score:  { type: Number, default: null }, // 0–100
        level:  { type: String, default: null }, // Low / Medium / High
        action: { type: String, default: null }, // Monitor only / Investigate soon / Act immediately!
      },

      // ML processing status
      mlStatus: {
        type: String,
        enum: ['pending', 'success', 'unavailable', 'error'],
        default: 'pending',
      },
      mlError:       { type: String, default: null },
      mlProcessedAt: { type: Date,   default: null },
    },
  },
  {
    timestamps:  true,   // createdAt, updatedAt
    versionKey:  false,
  }
);

// ── Indexes ────────────────────────────────────────────────
// Auto-delete records older than 24 hours
SystemInfoSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

// Fast queries: latest record per PC
SystemInfoSchema.index({ pcId: 1, createdAt: -1 });

// ── Static Methods ─────────────────────────────────────────

/**
 * Latest reading for every unique PC
 */
SystemInfoSchema.statics.getLatestData = function () {
  return this.aggregate([
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id:               '$pcId',
        pcId:              { $first: '$pcId' },
        os:                { $first: '$os' },
        uptime:            { $first: '$uptime' },
        ipAddress:         { $first: '$ipAddress' },
        runningProcesses:  { $first: '$runningProcesses' },
        cpu:               { $first: '$cpu' },
        ram:               { $first: '$ram' },
        disk:              { $first: '$disk' },
        cpu_utilization:   { $first: '$cpu_utilization' },
        memory_usage:      { $first: '$memory_usage' },
        disk_io:           { $first: '$disk_io' },
        network_latency:   { $first: '$network_latency' },
        process_count:     { $first: '$process_count' },
        thread_count:      { $first: '$thread_count' },
        context_switches:  { $first: '$context_switches' },
        cache_miss_rate:   { $first: '$cache_miss_rate' },
        temperature:       { $first: '$temperature' },
        power_consumption: { $first: '$power_consumption' },
        mlResults:         { $first: '$mlResults' },
        createdAt:         { $first: '$createdAt' },
      },
    },
  ]);
};

/**
 * Historical readings for one PC (last N hours)
 */
SystemInfoSchema.statics.getHistoricalData = function (pcId, hours = 24) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  return this.find({ pcId, createdAt: { $gte: since } })
    .sort({ createdAt: 1 })
    .select('cpu ram disk cpu_utilization memory_usage disk_io network_latency temperature power_consumption mlResults createdAt')
    .lean();
};

/**
 * Overview stats across all PCs in last 24h
 */
SystemInfoSchema.statics.getOverviewStats = function () {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return this.aggregate([
    { $match: { createdAt: { $gte: since } } },
    {
      $group: {
        _id:               null,
        avgCpu:            { $avg: '$cpu_utilization' },
        avgRam:            { $avg: '$memory_usage' },
        avgDisk:           { $avg: '$disk' },
        avgNetworkLatency: { $avg: '$network_latency' },
        avgTemperature:    { $avg: '$temperature' },
        avgPower:          { $avg: '$power_consumption' },
        totalPCs:          { $addToSet: '$pcId' },
        anomalyCount:      { $sum: { $cond: [{ $eq: ['$mlResults.isAnomaly', true] }, 1, 0] } },
      },
    },
    {
      $project: {
        avgCpu:            { $round: ['$avgCpu',            1] },
        avgRam:            { $round: ['$avgRam',            1] },
        avgDisk:           { $round: ['$avgDisk',           1] },
        avgNetworkLatency: { $round: ['$avgNetworkLatency', 1] },
        avgTemperature:    { $round: ['$avgTemperature',    1] },
        avgPower:          { $round: ['$avgPower',          1] },
        totalPCs:          { $size: '$totalPCs' },
        anomalyCount:      1,
      },
    },
  ]);
};

/**
 * Delete records older than N hours
 */
SystemInfoSchema.statics.cleanupOldData = function (hours = 24) {
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  return this.deleteMany({ createdAt: { $lt: cutoff } });
};

module.exports = mongoose.model('SystemInfo', SystemInfoSchema);