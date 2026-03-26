import React, { useState, useEffect, useCallback } from 'react';
import PCCard from './PCCard';
import OverviewChart from './OverviewChart';
import MLInsightsPanel from './Mlinsightspanel'
import { systemDataAPI, errorUtils } from '../utils/api';

// PC is offline if no data received in last 5 minutes
const OFFLINE_MINUTES = 3;

const isOnline = (pc) => {
  // Try createdAt first (from aggregate), then updatedAt
  const ts = pc?.createdAt || pc?.updatedAt;
  if (!ts) return false;
  const diffMs = Date.now() - new Date(ts).getTime();
  return diffMs / 60000 < OFFLINE_MINUTES;
};

const NAV = [
  { id:'overview', label:'Overview',    icon:<IconGrid />    },
  { id:'pcs',      label:'PC Status',   icon:<IconMonitor /> },
  { id:'ml',       label:'ML Insights', icon:<IconBrain />   },
  { id:'alerts',   label:'Alerts',      icon:<IconAlert />   },
];

export default function Dashboard() {
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [lastUpdate,  setLastUpdate]  = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [nav,         setNav]         = useState('overview');
  const [now,         setNow]         = useState(new Date());

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const res = await systemDataAPI.getData();
      if (res.success) {
        setData(res.data);
        setLastUpdate(new Date());
      } else throw new Error(res.message);
    } catch (e) { setError(errorUtils.getErrorMessage(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(fetchData, 30000);
    return () => clearInterval(t);
  }, [autoRefresh, fetchData]);

  const pcs          = data?.latest   ?? [];
  const ov           = data?.overview ?? {};
  const onlinePCs    = pcs.filter(isOnline);
  const offlinePCs   = pcs.filter(pc => !isOnline(pc));
  const onlineCount  = onlinePCs.length;
  const anomalyCount = onlinePCs.filter(p => p.mlResults?.isAnomaly).length;

  if (loading && !data) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:14 }}>
        <div className="spin" />
        <span style={{ fontSize:13, color:'var(--txt3)' }}>Loading PC Monitor…</span>
      </div>
    );
  }

  return (
    <div style={{ display:'flex', minHeight:'100vh' }}>

      {/* ── SIDEBAR ── */}
      <aside style={{
        width:220, flexShrink:0, position:'fixed', top:0, left:0, height:'100vh', zIndex:50,
        display:'flex', flexDirection:'column',
        background:'var(--bg2)', borderRight:'1px solid var(--border)',
      }}>
        {/* Logo */}
        <div style={{ padding:'18px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
          <div style={{
            width:32, height:32, borderRadius:8, flexShrink:0,
            background:'linear-gradient(135deg,#3b82f6,#8b5cf6)',
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="5" width="6" height="7" rx="1.5" fill="white" opacity="0.9"/>
              <rect x="9" y="1" width="6" height="11" rx="1.5" fill="white" opacity="0.6"/>
              <rect x="1" y="14" width="14" height="1.5" rx="0.75" fill="white" opacity="0.5"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize:14, fontWeight:600, color:'var(--txt)', letterSpacing:'-0.01em' }}>IntelliMonitor</div>
            <div style={{ fontSize:11, color:'var(--txt3)' }}>ML Edition</div>
          </div>
        </div>

        {/* Quick stats */}
        <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          <MiniStat label="Online"  value={onlineCount}       color="green" />
          <MiniStat label="Offline" value={offlinePCs.length} color={offlinePCs.length > 0 ? 'red' : 'green'} />
        </div>

        {/* Nav */}
        <nav style={{ flex:1, padding:'10px 8px', display:'flex', flexDirection:'column', gap:2 }}>
          {NAV.map(item => (
            <button key={item.id} className={`nav-item ${nav === item.id ? 'on' : ''}`}
              onClick={() => setNav(item.id)}>
              <span style={{ opacity:0.7, display:'flex', alignItems:'center' }}>{item.icon}</span>
              {item.label}
              {item.id === 'alerts' && anomalyCount > 0 && (
                <span style={{
                  marginLeft:'auto', background:'var(--red)', color:'white',
                  fontSize:10, fontWeight:600, padding:'1px 6px', borderRadius:99,
                  animation:'pulse 1.5s infinite',
                }}>{anomalyCount}</span>
              )}
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div style={{ padding:'14px 16px', borderTop:'1px solid var(--border)' }}>
          <div style={{ fontSize:22, fontWeight:300, color:'var(--txt)', letterSpacing:'0.02em', lineHeight:1, marginBottom:2 }}>
            {now.toLocaleTimeString('en-US', { hour12:false, hour:'2-digit', minute:'2-digit' })}
          </div>
          <div style={{ fontSize:12, color:'var(--txt3)', marginBottom:14 }}>
            {now.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })}
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <span style={{ fontSize:12, color:'var(--txt3)' }}>Auto-refresh</span>
            <Toggle on={autoRefresh} onChange={setAutoRefresh} />
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span className={`dot ${error ? 'd-red' : 'd-green'}`} />
            <span style={{ fontSize:12, color: error ? 'var(--red)' : 'var(--green)' }}>
              {error ? 'Disconnected' : 'Connected'}
            </span>
          </div>
          {lastUpdate && (
            <div style={{ fontSize:11, color:'var(--txt4)', marginTop:3 }}>
              Updated {lastUpdate.toLocaleTimeString()}
            </div>
          )}
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main style={{ marginLeft:220, flex:1, display:'flex', flexDirection:'column' }}>

        {/* Topbar */}
        <header style={{
          height:54, display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'0 28px', background:'var(--bg2)', borderBottom:'1px solid var(--border)',
          position:'sticky', top:0, zIndex:40,
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            <h1 style={{ fontSize:16, fontWeight:600, color:'var(--txt)', letterSpacing:'-0.01em' }}>
              {NAV.find(n => n.id === nav)?.label}
            </h1>
            <div style={{ width:1, height:16, background:'var(--border2)' }} />
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span className={`dot ${onlineCount > 0 ? 'd-green' : 'd-dim'}`} />
              <span style={{ fontSize:12, color:'var(--txt3)' }}>{onlineCount} online</span>
            </div>
            {offlinePCs.length > 0 && (
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span className="dot d-dim" />
                <span style={{ fontSize:12, color:'var(--txt4)' }}>{offlinePCs.length} offline</span>
              </div>
            )}
            {anomalyCount > 0 && (
              <span className="badge b-red">⚠ {anomalyCount} anomal{anomalyCount === 1 ? 'y' : 'ies'}</span>
            )}
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {error && <span style={{ fontSize:12, color:'var(--red)' }}>{error}</span>}
            <button onClick={() => { setLoading(true); fetchData(); }} disabled={loading}
              style={{
                fontSize:13, fontWeight:500,
                color: loading ? 'var(--txt3)' : 'var(--txt)',
                background:'var(--bg3)', border:'1px solid var(--border2)',
                padding:'6px 14px', borderRadius:'var(--r)', cursor: loading ? 'default' : 'pointer',
                transition:'all 0.15s', display:'flex', alignItems:'center', gap:6,
              }}
              onMouseEnter={e => { if(!loading) e.currentTarget.style.borderColor='var(--txt3)'; }}
              onMouseLeave={e => e.currentTarget.style.borderColor='var(--border2)'}
            >
              <RefreshIcon spin={loading} />
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </header>

        {/* Content */}
        <div style={{ padding:'28px', flex:1 }} className="fade-up">

          {/* OVERVIEW */}
          {nav === 'overview' && (
            <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
              <StatGrid ov={ov} onlineCount={onlineCount} offlineCount={offlinePCs.length} anomalyCount={anomalyCount} />
              <OverviewChart overviewData={ov} onDataUpdate={fetchData} />
            </div>
          )}

          {/* PC STATUS */}
          {nav === 'pcs' && (
            pcs.length > 0 ? (
              <div style={{ display:'flex', flexDirection:'column', gap:24 }}>
                {onlinePCs.length > 0 && (
                  <div>
                    <SectionLabel dot="d-green" text={`ONLINE — ${onlinePCs.length} system${onlinePCs.length !== 1 ? 's' : ''}`} />
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(380px,1fr))', gap:16 }}>
                      {onlinePCs.map((pc, i) => (
                        <div key={pc.pcId} className="fade-up" style={{ animationDelay:`${i*0.05}s` }}>
                          <PCCard pcId={pc.pcId} latestData={pc} onDataUpdate={fetchData} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {offlinePCs.length > 0 && (
                  <div>
                    <SectionLabel dot="d-dim" text={`OFFLINE — ${offlinePCs.length} system${offlinePCs.length !== 1 ? 's' : ''} · last data shown`} dim />
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(380px,1fr))', gap:16 }}>
                      {offlinePCs.map((pc, i) => (
                        <div key={pc.pcId} className="fade-up" style={{ animationDelay:`${i*0.05}s` }}>
                          <PCCard pcId={pc.pcId} latestData={pc} onDataUpdate={fetchData} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : <Empty msg="No systems connected. Start the client script." />
          )}

          {nav === 'ml'     && <MLInsightsPanel pcs={onlinePCs} />}
          {nav === 'alerts' && <AlertsView pcs={onlinePCs} />}
        </div>
      </main>
    </div>
  );
}

/* ── Section label ─────────────────────────────────── */
function SectionLabel({ dot, text, dim }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
      <span className={`dot ${dot}`} />
      <span style={{ fontSize:12, fontWeight:500, color: dim ? 'var(--txt4)' : 'var(--txt3)', letterSpacing:'0.03em' }}>
        {text}
      </span>
    </div>
  );
}

/* ── Mini sidebar stat ─────────────────────────────── */
function MiniStat({ label, value, color }) {
  const cols = { green:'var(--green)', red:'var(--red)', dim:'var(--txt3)' };
  return (
    <div style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:8, padding:'7px 10px' }}>
      <div style={{ fontSize:10, color:'var(--txt4)', marginBottom:2, fontWeight:500 }}>{label}</div>
      <div style={{ fontSize:20, fontWeight:600, color: cols[color] || 'var(--txt)', lineHeight:1 }}>{value}</div>
    </div>
  );
}

/* ── Stat grid ─────────────────────────────────────── */
function StatGrid({ ov, onlineCount, offlineCount, anomalyCount }) {
  const stats = [
    { label:'Online',         value: onlineCount,                                  unit:'',   sub: offlineCount > 0 ? `${offlineCount} offline` : 'All active',  color:'#22c55e' },
    { label:'Avg CPU',        value: ov.avgCpu?.toFixed(1)            ?? '—',       unit:'%',  sub:'Utilization',     color:'#3b82f6' },
    { label:'Avg Memory',     value: ov.avgRam?.toFixed(1)            ?? '—',       unit:'%',  sub:'Usage',           color:'#8b5cf6' },
    { label:'Anomalies',      value: anomalyCount,                                  unit:'',   sub: anomalyCount > 0 ? 'Action needed' : 'All clear', color: anomalyCount > 0 ? '#ef4444' : '#22c55e' },
    { label:'Avg Temp',       value: ov.avgTemperature?.toFixed(1)    ?? '—',       unit:'°C', sub:'CPU temperature', color:'#f59e0b' },
    { label:'Avg Latency',    value: ov.avgNetworkLatency?.toFixed(0) ?? '—',       unit:'ms', sub:'Network',         color:'#22c55e' },
    { label:'Avg Power',      value: ov.avgPower?.toFixed(0)          ?? '—',       unit:'W',  sub:'Consumption',     color:'#a855f7' },
  ];

  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:12 }}>
      {stats.map((s, i) => (
        <div key={i} className="card fade-up" style={{ padding:'16px 18px', animationDelay:`${i*0.04}s` }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
            <span style={{ fontSize:12, fontWeight:500, color:'var(--txt3)' }}>{s.label}</span>
            <div style={{ width:8, height:8, borderRadius:99, background:s.color, opacity:0.8 }} />
          </div>
          <div style={{ fontSize:28, fontWeight:600, color:s.color, letterSpacing:'-0.02em', lineHeight:1, marginBottom:6 }}>
            {s.value}<span style={{ fontSize:14, fontWeight:400, color:'var(--txt3)', marginLeft:2 }}>{s.unit}</span>
          </div>
          <div style={{ fontSize:11, color:'var(--txt4)' }}>{s.sub}</div>
        </div>
      ))}
    </div>
  );
}

/* ── Alerts ────────────────────────────────────────── */
function AlertsView({ pcs }) {
  const alerts = pcs.filter(p => p.mlResults?.isAnomaly || p.mlResults?.severity?.level === 'High');
  if (!alerts.length) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:320, gap:12 }}>
      <div style={{ width:52, height:52, borderRadius:'50%', background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.2)', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>
      <div style={{ fontSize:15, fontWeight:600, color:'var(--txt)' }}>All systems normal</div>
      <div style={{ fontSize:13, color:'var(--txt3)' }}>No anomalies across {pcs.length} online system{pcs.length !== 1 ? 's' : ''}</div>
    </div>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ fontSize:13, color:'var(--txt3)' }}>{alerts.length} active alert{alerts.length !== 1 ? 's' : ''}</div>
      {alerts.map(pc => {
        const ml  = pc.mlResults || {};
        const sev = ml.severity?.level;
        return (
          <div key={pc.pcId} className="card" style={{ padding:20, borderColor: sev === 'High' ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span className={`dot ${sev === 'High' ? 'd-red' : 'd-amber'}`} />
                <span style={{ fontSize:15, fontWeight:600, color:'var(--txt)' }}>{pc.pcId}</span>
              </div>
              <span className={`badge ${sev === 'High' ? 'b-red' : 'b-amber'}`}>{sev ?? 'Anomaly'}</span>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:14 }}>
              {[
                { l:'CPU',  v:`${pc.cpu_utilization?.toFixed(1) ?? '—'}%`,  c:'var(--blue)'   },
                { l:'RAM',  v:`${pc.memory_usage?.toFixed(1)    ?? '—'}%`,  c:'var(--purple)' },
                { l:'Temp', v:`${pc.temperature?.toFixed(1)     ?? '—'}°C`, c:'var(--amber)'  },
              ].map(m => (
                <div key={m.l} style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:'10px 12px' }}>
                  <div style={{ fontSize:11, color:'var(--txt3)', marginBottom:4 }}>{m.l}</div>
                  <div style={{ fontSize:18, fontWeight:600, color:m.c }}>{m.v}</div>
                </div>
              ))}
            </div>
            {ml.bottleneck?.label && (
              <div style={{ fontSize:12, color:'var(--amber)', marginBottom:5 }}>
                Bottleneck: {ml.bottleneck.label.replace(/_/g,' ')} ({ml.bottleneck.confidence?.toFixed(1)}%)
              </div>
            )}
            {ml.severity?.action && (
              <div style={{ fontSize:13, fontWeight:600, color:'var(--red)' }}>→ {ml.severity.action}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Helpers ───────────────────────────────────────── */
function Toggle({ on, onChange }) {
  return (
    <button onClick={() => onChange(!on)} style={{
      width:36, height:20, borderRadius:99, border:'none', cursor:'pointer',
      background: on ? 'var(--blue)' : 'var(--bg3)',
      border: `1px solid ${on ? 'var(--blue)' : 'var(--border2)'}`,
      position:'relative', transition:'all 0.2s',
    }}>
      <span style={{
        position:'absolute', top:3, left: on ? 18 : 3,
        width:12, height:12, borderRadius:'50%', background:'white',
        transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </button>
  );
}

function RefreshIcon({ spin }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ animation: spin ? 'spin 0.7s linear infinite' : 'none' }}>
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </svg>
  );
}

function Empty({ msg }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300 }}>
      <span style={{ fontSize:13, color:'var(--txt3)' }}>{msg}</span>
    </div>
  );
}

function IconGrid()    { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>; }
function IconMonitor() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>; }
function IconBrain()   { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>; }
function IconAlert()   { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>; }