"""
test_model1_model5.py

Tests Model 1 (Isolation Forest) and Model 5 (Severity Score).
Run this in your ml_api/ folder:
    python test_model1_model5.py
"""

import os
import joblib
import numpy as np
import pandas as pd

MODEL_DIR = "./models"

print("=" * 60)
print("  MODEL 1 + MODEL 5 — DIAGNOSTIC TEST")
print("=" * 60)

# ── Load models ──────────────────────────────────────────────
print("\n📦 Loading models...")

try:
    iso    = joblib.load(os.path.join(MODEL_DIR, "isolation_forest_model.joblib"))
    print("  ✅ isolation_forest_model.joblib")
except Exception as e:
    print(f"  ❌ FAILED: {e}"); iso = None

try:
    scaler = joblib.load(os.path.join(MODEL_DIR, "scaler.joblib"))
    print("  ✅ scaler.pkl")
except Exception as e:
    print(f"  ❌ FAILED: {e}"); scaler = None

try:
    minmax = joblib.load(os.path.join(MODEL_DIR, "severity_minmax_scaler.pkl"))
    print("  ✅ severity_minmax_scaler.pkl")
except Exception as e:
    print(f"  ⚠️  severity_minmax_scaler.pkl not found — will use manual normalization")
    minmax = None

if iso is None or scaler is None:
    print("\n❌ Cannot run — critical models missing."); exit(1)

# ── Scaler info ──────────────────────────────────────────────
print("\n🔍 Scaler info...")
if hasattr(scaler, 'feature_names_in_'):
    print(f"  Trained with feature names: {list(scaler.feature_names_in_)}")
else:
    print("  No feature_names_in_ (trained with plain arrays — use numpy)")
if hasattr(scaler, 'n_features_in_'):
    print(f"  Expects {scaler.n_features_in_} features")

print("\n🔍 Isolation Forest info...")
print(f"  Contamination : {iso.contamination}")
print(f"  n_estimators  : {iso.n_estimators}")
if hasattr(iso, 'offset_'):
    print(f"  Decision threshold (offset_): {iso.offset_:.6f}")

# ── Feature names ────────────────────────────────────────────
ML_FEATURES = [
    "cpu_utilization", "memory_usage", "disk_io", "network_latency",
    "process_count", "thread_count", "context_switches",
    "cache_miss_rate", "temperature", "power_consumption",
]

# Dataset averages for normal rows
NORMAL_AVGS = {
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

def predict(features_dict, label=None):
    """Run Model 1 + Model 5 on a feature dict."""
    values = [features_dict.get(f, NORMAL_AVGS[f]) for f in ML_FEATURES]

    try:
        # Use DataFrame if scaler has feature names, else numpy
        if hasattr(scaler, 'feature_names_in_'):
            df       = pd.DataFrame([values], columns=ML_FEATURES)
            X_scaled = scaler.transform(df)
        else:
            X_scaled = scaler.transform(np.array([values]))

        # Model 1
        prediction = iso.predict(X_scaled)[0]
        raw_score  = float(iso.decision_function(X_scaled)[0])
        is_anomaly = bool(prediction == -1)
        flipped    = -raw_score

        # Model 5
        if minmax is not None:
            sev_score = float(minmax.transform([[flipped]])[0][0]) * 100
        else:
            sev_score = ((flipped - (-0.15)) / (0.20 - (-0.15))) * 100
        sev_score = round(max(0.0, min(100.0, sev_score)), 2)

        # Cap severity if not anomaly (prevents status/severity contradiction)
        if not is_anomaly and sev_score > 66:
            sev_score = 66.0

        if sev_score < 40:   level = "🟢 Low"
        elif sev_score < 67: level = "🟡 Medium"
        else:                level = "🔴 High"

        # Result display
        anomaly_icon = "🔴 ANOMALY" if is_anomaly else "🟢 Normal"
        match_icon   = ""
        if label is not None:
            match_icon = "✅" if (is_anomaly == label) else "❌"

        key_vals = {k: features_dict[k] for k in features_dict}
        print(f"\n  {match_icon} Input: {key_vals}")
        print(f"     Model 1 → {anomaly_icon}  |  raw_score={raw_score:.6f}  |  flipped={flipped:.6f}")
        print(f"     Model 5 → Severity {sev_score:.1f}/100  {level}")

        return is_anomaly, sev_score

    except Exception as e:
        print(f"\n  ❌ ERROR: {e}")
        import traceback; traceback.print_exc()
        return None, None


# ── TEST CASES ───────────────────────────────────────────────
print("\n" + "=" * 60)
print("  TEST CASES")
print("  is_anomaly expected value: True=anomaly, False=normal")
print("=" * 60)

# 1. All average values → should be Normal, Low severity
print("\n── Test 1: All dataset average values (should be Normal, Low) ──")
predict(NORMAL_AVGS, label=False)

# 2. Your screenshot values (CPU=73, RAM=91)
print("\n── Test 2: Your current PC (CPU=73%, RAM=91%, Disk=44%) ──")
predict({
    "cpu_utilization": 73,
    "memory_usage":    91,
    "disk_io":         3.1,
    "network_latency": 670,
    "process_count":   407,
    "thread_count":    407,
    "cache_miss_rate": 0.232,
    "temperature":     73.4,
    "power_consumption": 224,
}, label=False)

# 3. Critical — all maxed out → should be Anomaly, High severity
print("\n── Test 3: All critical values (should be Anomaly, High) ──")
predict({
    "cpu_utilization":   99,
    "memory_usage":      99,
    "disk_io":           49,
    "network_latency":   5000,
    "process_count":     2000,
    "thread_count":      8000,
    "context_switches":  4000,
    "cache_miss_rate":   0.95,
    "temperature":       99,
    "power_consumption": 500,
}, label=True)

# 4. Slightly elevated — borderline
print("\n── Test 4: Borderline elevated values ──")
predict({
    "cpu_utilization": 75,
    "memory_usage":    75,
    "disk_io":         30,
    "network_latency": 200,
    "process_count":   700,
    "thread_count":    2000,
    "context_switches": 1500,
    "cache_miss_rate": 0.20,
    "temperature":     72,
    "power_consumption": 200,
})

# 5. CPU spike only
print("\n── Test 5: CPU spike only (cpu=95, rest normal) ──")
predict({**NORMAL_AVGS, "cpu_utilization": 95})

# 6. Memory spike only
print("\n── Test 6: Memory spike only (memory=95, rest normal) ──")
predict({**NORMAL_AVGS, "memory_usage": 95})

# 7. High latency only
print("\n── Test 7: High network latency (5000ms, rest normal) ──")
predict({**NORMAL_AVGS, "network_latency": 5000})

# 8. High temperature only
print("\n── Test 8: High temperature (95°C, rest normal) ──")
predict({**NORMAL_AVGS, "temperature": 95})

# ── Raw score range check ────────────────────────────────────
print("\n" + "=" * 60)
print("  RAW SCORE RANGE — checking min/max from MinMaxScaler")
print("=" * 60)
if minmax is not None:
    print(f"  MinMaxScaler data_min_  : {minmax.data_min_}")
    print(f"  MinMaxScaler data_max_  : {minmax.data_max_}")
    print(f"  MinMaxScaler data_range_: {minmax.data_range_}")
    print(f"\n  → Severity 0   = raw flipped score of {minmax.data_min_[0]:.6f}")
    print(f"  → Severity 100 = raw flipped score of {minmax.data_max_[0]:.6f}")
    print(f"  → Natural split at ~66.8 severity")
else:
    print("  MinMaxScaler not loaded — manual bounds used: min=-0.15, max=0.20")
    print("  If severity seems off, check these bounds match your training data")

print("\n" + "=" * 60)
print("  TEST COMPLETE")
print("=" * 60)
print("""
WHAT TO LOOK FOR:
  ✅ Test 1 → Normal, severity < 40 (Low)
  ✅ Test 2 → Normal (high RAM is not anomaly by itself)
  ✅ Test 3 → Anomaly, severity > 67 (High)
  ⚠️  If Test 3 shows Normal → contamination/threshold issue
  ⚠️  If severity is always 100 → MinMaxScaler bounds mismatch
  ⚠️  If severity is always 0  → same issue, other direction
""")