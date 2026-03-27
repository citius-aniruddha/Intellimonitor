# 🖥️ IntelliMonitor — ML Edition

> Real-time, multi-PC health monitoring dashboard powered by machine learning.  
> Detects anomalies, identifies bottlenecks, and scores severity — automatically, every 60 seconds.

**Status: ✅ Fully Deployed & Running**

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [System Architecture](#system-architecture)
- [Tech Stack](#tech-stack)
- [Machine Learning Models](#machine-learning-models)
- [Dataset](#dataset)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [API Reference](#api-reference)
- [Dashboard](#dashboard)
- [Known Issues](#known-issues)
- [Roadmap](#roadmap)

---

## Overview

IntelliMonitor watches your computers in real time. A lightweight agent runs on each machine, collects 10 system metrics every 60 seconds, and sends them to a central backend. Three ML models then analyse the data and surface results on a live React dashboard — so you always know what's happening, even before a problem becomes serious.

**The problem it solves:** Most people only find out something is wrong *after* it has happened — a crash, a slowdown, or a dead server. IntelliMonitor catches issues early using anomaly detection, so you get a warning instead of a surprise.

---

## Features

- 📡 **Continuous monitoring** — collects 10 metrics per PC every 60 seconds
- 🤖 **3 active ML models** — anomaly detection, bottleneck classification, severity scoring
- 📊 **Live React dashboard** — charts, alerts, per-PC health cards
- 🖥️ **Unlimited PCs** — all machines on one screen, online/offline auto-tracked
- 🔔 **Severity alerts** — colour-coded Low / Medium / High with action guidance
- 🗑️ **Auto data cleanup** — 24-hour TTL keeps the database lean and fast
- 🔄 **Self-healing client** — retries on failure, graceful shutdown, cold-start ping

---

## System Architecture

```
┌─────────────────┐     POST /api/systemdata      ┌──────────────────────┐
│   client.js     │ ────────────────────────────► │   Node.js Backend    │
│  (each PC)      │                               │   Express + Mongoose │
│  10 metrics/60s │                               └──────────┬───────────┘
└─────────────────┘                                          │ async ML call
                                                             ▼
                                                  ┌──────────────────────┐
                                                  │   Python ML API      │
                                                  │   Flask + scikit-learn│
                                                  └──────────┬───────────┘
                                                             │ results
                                                             ▼
┌─────────────────┐     GET /api/systemdata       ┌──────────────────────┐
│  React Frontend │ ◄──────────────────────────── │   MongoDB Atlas      │
│  (dashboard)    │       polls every 30s          │   24h TTL on records │
└─────────────────┘                               └──────────────────────┘
```

Each service is independently deployable and can scale separately.

**Data flow:**
1. `client.js` collects metrics and POSTs to the backend
2. Backend saves to MongoDB immediately (`mlStatus: "pending"`)
3. Backend asynchronously calls the Python ML API
4. ML results update the MongoDB record (`isAnomaly`, `bottleneck`, `severity`)
5. React frontend polls every 30s and renders live results

---

## Tech Stack

| Layer      | Technology                                      |
|------------|-------------------------------------------------|
| Frontend   | React (Create React App), Recharts, Inline Styles |
| Backend    | Node.js, Express, Mongoose, Axios               |
| Database   | MongoDB Atlas (Mongoose ODM, 24h TTL)           |
| ML API     | Python, Flask, scikit-learn, joblib, pandas, numpy |
| Client     | Node.js, systeminformation, axios, dotenv       |
| Deployment | Vercel (frontend), Render (backend + ML API)    |

---

## Machine Learning Models

### ✅ Model 1 — Isolation Forest (Anomaly Detection)

Detects whether a system reading is anomalous based on all 10 input features.

| Property | Detail |
|----------|--------|
| Algorithm | Isolation Forest |
| Training data | 10,000 rows, 5% anomaly rate |
| Scaler | StandardScaler |
| Output | `isAnomaly` (bool), `anomalyScore` (float) |
| Files | `isolation_forest_model.joblib`, `scaler.joblib` |

### ⚠️ Model 3 — Bottleneck Classifier (Rule-Based)

Classifies the primary system bottleneck. The original Random Forest model had a sklearn version mismatch and has been temporarily replaced with deterministic rules.

| Rule | Result |
|------|--------|
| `cpu_utilization > 80%` | `CPU_Bound` |
| `memory_usage > 80%` | `Memory_Bound` |
| `disk_io > 40` | `Disk_Bound` |
| Otherwise | `Normal` |

> **Note:** `disk_io` range is 0–50, not 0–100. The Random Forest `.pkl` is loaded but not active — fix: retrain with sklearn 1.8.0.

### ✅ Model 5 — Severity Scorer

Produces a 0–100 severity score from Model 1's output via MinMaxScaler. Capped at 66 when `isAnomaly` is false.

| Score | Level | Action |
|-------|-------|--------|
| 0–39 | Low | Monitor only |
| 40–66 | Medium | Investigate soon |
| 67–100 | High | Act immediately! |

### 📋 Models Awaiting Integration

| Model | Description | Status |
|-------|-------------|--------|
| Model 2 | CPU Forecasting (Linear Regression + Random Forest) | Files ready |
| Model 4 | K-Means Clustering | Files ready |
| Model 6 | Trend Detection (sliding window) | Not yet built |
| Model 7 | Composite Health Score 0–100 | Not yet built |

---

## Dataset

| Property | Value |
|----------|-------|
| Total rows | 10,000 |
| Anomaly rate | 5% (500 anomalous rows) |
| Normal rows | 9,500 |
| Features | 10 input columns |

### Input Features

| Feature | Description | Range |
|---------|-------------|-------|
| `cpu_utilization` | CPU load % | 0–100 |
| `memory_usage` | RAM usage % | 0–100 |
| `disk_io` | Disk I/O activity | 0–50 ⚠️ (not 0–100) |
| `network_latency` | DNS latency | ms |
| `process_count` | Running processes | count |
| `thread_count` | Total threads | count |
| `context_switches` | Context switches/sec | ~500–2000 |
| `cache_miss_rate` | Cache miss ratio | 0.0–1.0 |
| `temperature` | CPU temperature | °C |
| `power_consumption` | Power draw estimate | Watts |

---

## Project Structure

```
pc-monitoring-system/
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── Dashboard.js
│       │   ├── PCCard.js
│       │   ├── OverviewChart.js
│       │   └── MLInsightsPanel.js
│       └── utils/
│           └── api.js
├── backend/
│   ├── server.js
│   ├── routes/
│   │   └── systemData.js
│   └── models/
│       └── SystemInfo.js
├── ml_api/
│   ├── ml_api.py
│   └── models/
│       ├── isolation_forest_model.joblib
│       ├── scaler.joblib
│       ├── severity_minmax_scaler.pkl
│       ├── bottleneck_random_forest.pkl
│       ├── cpu_linear_regression_model.pkl
│       ├── cpu_random_forest_model.pkl
│       └── kmeans_model.pkl
└── client/
    └── client.js
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.10+ with pip
- MongoDB Atlas account (or local MongoDB)

### Installation

```bash
# Clone the repository
git clone https://github.com/Vedas18/pc-monitoring-system.git
cd pc-monitoring-system

# Install dependencies
cd backend  && npm install && cd ..
cd frontend && npm install && cd ..
cd client   && npm install && cd ..
cd ml_api   && pip install flask flask-cors scikit-learn joblib pandas numpy
```

### Environment Variables

**`backend/.env`**
```env
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/pcmonitoring
PORT=5000
ML_API_URL=http://localhost:8000
ML_TIMEOUT=10000
NODE_ENV=development
```

**`client/.env`**
```env
SERVER_URL=http://localhost:5000/api/systemdata
PC_ID=MyPC-001
COLLECTION_INTERVAL=60000
VERBOSE=true
```

**`frontend` (Vercel environment variable)**
```env
REACT_APP_API_URL=https://your-backend.onrender.com
```

### Running Locally

Open four terminals and start in this order:

```bash
# Terminal 1 — ML API (wait for "Model loading complete")
cd ml_api && python ml_api.py

# Terminal 2 — Backend
cd backend && node server.js

# Terminal 3 — Client (starts sending data from this PC)
cd client && node client.js

# Terminal 4 — Frontend
cd frontend && npm start
# Opens at http://localhost:3000
```

### Verification

```bash
# Check ML API — shows which models are loaded
curl localhost:8000/health

# Check backend — shows MongoDB connection status
curl localhost:5000/health

# Test data collection without sending to server
node test_client.js

# Verify ML models
python test_model1_model5.py
python test_bottleneck.py
```

---

## API Reference

### Backend Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/systemdata` | Save reading from client; triggers async ML processing |
| `GET` | `/api/systemdata` | All PCs latest readings + overview stats |
| `GET` | `/api/systemdata?pcId=X` | Specific PC latest + 24hr historical readings |
| `GET` | `/api/systemdata/pcs` | List all PC IDs with latest data |
| `GET` | `/api/systemdata/ml/:pcId` | ML results only for one PC |
| `GET` | `/api/systemdata/health` | Health check — returns uptime + DB status |
| `DELETE` | `/api/systemdata/cleanup` | Delete records older than N hours |

### ML API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Model load status for all 3 active models |
| `POST` | `/predict` | Accepts 10 features, returns full prediction object |

**Prediction response schema:**
```json
{
  "isAnomaly": true,
  "anomalyScore": 0.82,
  "bottleneck": {
    "label": "Memory_Bound",
    "confidence": 100
  },
  "severity": {
    "score": 74,
    "level": "High",
    "action": "Act immediately!"
  }
}
```

---

## Dashboard

The dashboard has four tabs:

| Tab | Contents |
|-----|----------|
| **Overview** | Summary stat cards, 24-hour area chart, bottleneck pie chart |
| **PC Status** | Card per monitored PC — online/offline, CPU/RAM bars, top processes |
| **ML Insights** | Anomaly table, severity scores, bottleneck distribution, actions |
| **Alerts** | Only visible when anomalies exist — green tick when all clear |

**Colour system:** Green = normal · Amber = watch · Red = act now

**Offline detection:** A PC is marked offline if no data arrives within 3 minutes. The card greys out and shows when data was last received.

---

## Known Issues

| Issue | Details | Fix |
|-------|---------|-----|
| Model 3 sklearn mismatch | `bottleneck_random_forest.pkl` trained on sklearn 1.3.0, server runs 1.8.0 | Retrain in Jupyter with sklearn 1.8.0 |
| Severity scaler range | `severity_minmax_scaler.pkl` fitted on anomaly rows only — scores cluster below 66 | Run `retrain_severity_scaler.py` on full 10K dataset |
| Thread count = Process count | Windows sometimes returns equal values for both | Minor cosmetic issue |
| Render cold starts | Free-tier services sleep after ~15 min inactivity (~30s first request delay) | Mitigated by health ping on startup + UptimeRobot |

---

## Roadmap

### Priority 1 — Fixes
- [ ] Retrain Model 3 (bottleneck Random Forest) with sklearn 1.8.0
- [ ] Run `retrain_severity_scaler.py` on full dataset to fix severity score distribution

### Priority 2 — New Model Integrations
- [ ] **Model 2:** CPU Forecasting — integrate into `/predict` + add forecast card to PCCard
- [ ] **Model 4:** K-Means Clustering — surface cluster name in MLInsightsPanel
- [ ] **Model 6:** Sliding-window trend detection (Increasing / Decreasing / Stable)
- [ ] **Model 7:** Composite health score 0–100 from all active model outputs

### Priority 3 — Feature Improvements
- [ ] Email / webhook notification on anomaly detection
- [ ] CSV data export — download 24-hour readings per PC
- [ ] Per-PC historical comparison charts — overlay multiple PCs
- [ ] Deploy `client.js` as a Windows Service (auto-start on boot via NSSM)

---

*IntelliMonitor — Built for people, powered by AI.*