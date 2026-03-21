"""
ML API Server — PC Monitoring System
Models: 1 (Isolation Forest), 3 (Rule-Based Bottleneck), 5 (Severity)

Note on Model 3:
  The trained bottleneck_random_forest.pkl has a version mismatch issue.
  Replaced with a rule-based function using the EXACT same label rules
  the model was trained on. Results are identical to a perfect model.
"""

import os
import numpy as np
import pandas as pd
from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import datetime
import traceback

MODEL_DIR = os.environ.get("MODEL_DIR", "./models")

MODEL_PATHS = {
    "isolation_forest": os.path.join(MODEL_DIR, "isolation_forest_model.joblib"),
    "scaler":           os.path.join(MODEL_DIR, "scaler.joblib"),
    "severity_minmax":  os.path.join(MODEL_DIR, "severity_minmax_scaler.pkl"),
}

ML_FEATURE_NAMES = [
    "cpu_utilization", "memory_usage", "disk_io", "network_latency",
    "process_count", "thread_count", "context_switches",
    "cache_miss_rate", "temperature", "power_consumption",
]

FEATURE_DEFAULTS = {
    "cpu_utilization":   52.10,
    "memory_usage":      55.31,
    "disk_io":           25.52,
    "network_latency":   100.24,
    "process_count":     507.06,
    "thread_count":      1744.43,
    "context_switches":  1037.44,
    "cache_miss_rate":   0.11,
    "temperature":       62.41,
    "power_consumption": 174.83,
}

# ─────────────────────────────────────────────
# MODEL LOADER
# ─────────────────────────────────────────────
models = {}

def load_models():
    global models
    print("\n📦 Loading ML models...")
    for name, path in MODEL_PATHS.items():
        try:
            models[name] = joblib.load(path)
            print(f"  ✅ {name}")
        except FileNotFoundError:
            print(f"  ⚠️  Not found: {name} → {path}")
            models[name] = None
        except Exception as e:
            print(f"  ❌ Error: {name}: {e}")
            models[name] = None

    print("  ✅ bottleneck → rule-based (Model 3 replacement)")
    print("\n✅ Model loading complete.\n")


# ─────────────────────────────────────────────
# MODEL 3 — RULE-BASED BOTTLENECK
# Exact same rules the RF model was trained on.
# ─────────────────────────────────────────────
def predict_bottleneck(cpu, memory, disk_io):
    """
    Rule-based bottleneck classifier.
    Replicates training label logic exactly:
      cpu  > 80  → CPU_Bound
      ram  > 80  → Memory_Bound
      disk > 40  → Disk_Bound   (disk_io range is 0–50!)
      else       → Normal

    Returns label + confidence (100% since rules are deterministic).
    Priority order: CPU > Memory > Disk > Normal
    """
    if cpu > 80:
        label, confidence = "CPU_Bound",    100.0
    elif memory > 80:
        label, confidence = "Memory_Bound", 100.0
    elif disk_io > 40:
        label, confidence = "Disk_Bound",   100.0
    else:
        label, confidence = "Normal",       100.0

    return {"label": label, "confidence": confidence}


# ─────────────────────────────────────────────
# MODEL 1 + 5 — ISOLATION FOREST + SEVERITY
# ─────────────────────────────────────────────
def predict_anomaly_and_severity(features_10):
    iso    = models.get("isolation_forest")
    scaler = models.get("scaler")
    minmax = models.get("severity_minmax")

    if iso is None or scaler is None:
        return {
            "isAnomaly": None, "anomalyScore": None,
            "severity": {"score": None, "level": None, "action": None},
            "error": "isolation_forest or scaler not loaded",
        }

    try:
        # Pass DataFrame with column names — fixes sklearn warning
        df       = pd.DataFrame([features_10], columns=ML_FEATURE_NAMES)
        X_scaled = scaler.transform(df)

        prediction = iso.predict(X_scaled)[0]
        raw_score  = float(iso.decision_function(X_scaled)[0])
        is_anomaly = bool(prediction == -1)
        flipped    = -raw_score

        # Severity 0–100
        if minmax is not None:
            sev_score = float(minmax.transform([[flipped]])[0][0]) * 100
        else:
            sev_score = ((flipped - (-0.15)) / (0.20 - (-0.15))) * 100

        sev_score = round(max(0.0, min(100.0, sev_score)), 2)

        # Cap severity at 66 when not an anomaly — prevents contradictions
        if not is_anomaly and sev_score > 66:
            sev_score = 66.0

        if sev_score < 40:   level, action = "Low",    "Monitor only"
        elif sev_score < 67: level, action = "Medium", "Investigate soon"
        else:                level, action = "High",   "Act immediately!"

        return {
            "isAnomaly":    is_anomaly,
            "anomalyScore": round(flipped, 6),
            "severity":     {"score": sev_score, "level": level, "action": action},
        }

    except Exception as e:
        return {
            "isAnomaly": None, "anomalyScore": None,
            "severity":  {"score": None, "level": None, "action": None},
            "error": str(e), "trace": traceback.format_exc(),
        }


# ─────────────────────────────────────────────
# FLASK APP
# ─────────────────────────────────────────────
app = Flask(__name__)
CORS(app)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "healthy",
        "models_loaded": {
            "isolation_forest": models.get("isolation_forest") is not None,
            "scaler":           models.get("scaler")           is not None,
            "severity_minmax":  models.get("severity_minmax")  is not None,
            "bottleneck":       "rule-based (active)",
        },
        "active_models": [
            "Model 1 - Isolation Forest",
            "Model 3 - Bottleneck (rule-based)",
            "Model 5 - Severity",
        ],
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
    }), 200


@app.route("/predict", methods=["POST"])
def predict():
    try:
        data = request.get_json(force=True)
        if not data:
            return jsonify({"error": "No JSON body received"}), 400

        features_10 = [
            float(data.get(f, FEATURE_DEFAULTS[f]))
            for f in ML_FEATURE_NAMES
        ]

        cpu     = features_10[0]
        memory  = features_10[1]
        disk_io = features_10[2]

        anomaly    = predict_anomaly_and_severity(features_10)
        bottleneck = predict_bottleneck(cpu, memory, disk_io)

        response = {
            "isAnomaly":    anomaly.get("isAnomaly"),
            "anomalyScore": anomaly.get("anomalyScore"),
            "bottleneck":   bottleneck,
            "severity": {
                "score":  anomaly["severity"].get("score"),
                "level":  anomaly["severity"].get("level"),
                "action": anomaly["severity"].get("action"),
            },
        }

        if "error" in anomaly:
            response["warnings"] = {"model1_5": anomaly["error"]}

        # Clean terminal log
        icon = "🔴" if response["isAnomaly"] else "🟢"
        print(f"\n{icon} [{datetime.datetime.now().strftime('%H:%M:%S')}] "
              f"CPU={cpu:.1f}% RAM={memory:.1f}% Disk={disk_io:.1f}")
        print(f"   Anomaly  : {response['isAnomaly']}  |  "
              f"Severity : {response['severity']['score']} ({response['severity']['level']})")
        print(f"   Bottleneck: {bottleneck['label']}  |  "
              f"Confidence: {bottleneck['confidence']}%")

        return jsonify(response), 200

    except Exception as e:
        print("❌ /predict error:\n", traceback.format_exc())
        return jsonify({"error": str(e)}), 500


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 55)
    print("  PC Monitoring — ML API Server")
    print("  Model 1: Isolation Forest")
    print("  Model 3: Rule-Based Bottleneck (deterministic)")
    print("  Model 5: Severity Score")
    print(f"  Model directory: {MODEL_DIR}")
    print("=" * 55)

    load_models()

    port  = int(os.environ.get("ML_PORT", 8000))
    debug = os.environ.get("FLASK_DEBUG", "false").lower() == "true"

    print(f"🚀 Running on http://localhost:{port}\n")
    app.run(host="0.0.0.0", port=port, debug=debug)