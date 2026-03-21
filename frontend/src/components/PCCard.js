import React, { useState, useEffect, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { systemDataAPI, dataUtils } from '../utils/api';

const OFFLINE_THRESHOLD_MINUTES = 5;

function getOnlineStatus(lastSeenStr) {
  if (!lastSeenStr) return { isOffline: true, lastSeenText: 'Never' };
  const lastSeen  = new Date(lastSeenStr);
  const diffMs    = Date.now() - lastSeen.getTime();
  const diffMins  = Math.floor(diffMs / 60000);
  const isOffline = diffMins >= OFFLINE_THRESHOLD_MINUTES;

  let lastSeenText;
  if (diffMins < 1)       lastSeenText = 'Just now';
  else if (diffMins < 60) lastSeenText = `${diffMins}m ago`;
  else                    lastSeenText = `${Math.floor(diffMins/60)}h ${diffMins%60}m ago`;

  return { isOffline, lastSeenText, diffMins };
}

export default function PCCard({ pcId, latestData, onDataUpdate }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab,     setTab]     = useState('metrics');

  // Re-render every 30s so "X mins ago" text updates live
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const fetchHistory = useCallback(async () => {
    if (!pcId) return;
    setLoading(true);
    try {
      const res = await systemDataAPI.getData({ pcId, hours: 24 });
      if (res.success) setHistory(res.data.historical || []);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }, [pcId]);

  useEffect(() => {
    fetchHistory();
    const t = setInterval(fetchHistory, 30000);
    return () => clearInterval(t);
  }, [fetchHistory]);

  const chartData = history.map(d => ({
    t:    new Date(d.createdAt).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }),
    cpu:  d.cpu_utilization ?? d.cpu  ?? 0,
    ram:  d.memory_usage    ?? d.ram  ?? 0,
    temp: d.temperature     ?? 0,
  })).slice(-24);

  if (!latestData) return null;

  // Use createdAt from latestData (comes from aggregate $first)
  const { isOffline, lastSeenText } = getOnlineStatus(latestData.createdAt);

  const ml        = latestData.mlResults || {};
  const isAnomaly = !isOffline && ml.isAnomaly === true;
  const sev       = ml.severity?.level;
  const sevScore  = ml.severity?.score;
  const pending   = !ml.mlStatus || ml.mlStatus === 'pending';

  const cpu  = latestData.cpu_utilization ?? latestData.cpu  ?? 0;
  const ram  = latestData.memory_usage    ?? latestData.ram  ?? 0;
  const disk = latestData.disk ?? 0;

  const metricColor = v => v > 80 ? 'var(--red)' : v > 60 ? 'var(--amber)' : 'var(--txt2)';
  const barColor    = v => v > 80 ? '#ef4444'     : v > 60 ? '#f59e0b'      : '#3b82f6';

  const borderColor = isOffline
    ? 'rgba(80,80,80,0.25)'
    : isAnomaly
    ? (sev === 'High' ? 'rgba(239,68,68,0.4)' : 'rgba(245,158,11,0.3)')
    : 'var(--border)';

  // Chart tooltip
  const ChartTip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background:'#1c1c1c', border:'1px solid #333', borderRadius:8, padding:'8px 12px', fontSize:11 }}>
        <div style={{ color:'#666', marginBottom:5 }}>{label}</div>
        {payload.map((p, i) => (
          <div key={i} style={{ display:'flex', justifyContent:'space-between', gap:12, color:p.color, marginBottom:2 }}>
            <span>{p.name}</span>
            <span style={{ fontWeight:600 }}>{p.value?.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="card" style={{ borderColor, opacity: isOffline ? 0.65 : 1, transition:'opacity 0.3s' }}>

      {/* ── Header ── */}
      <div style={{ padding:'16px 16px 14px', borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
          <div style={{ display:'flex', alignItems:'center', gap:9 }}>
            <span className={`dot ${isOffline ? 'd-dim' : isAnomaly ? (sev==='High'?'d-red':'d-amber') : 'd-green'}`} />
            <div>
              <div style={{ fontSize:14, fontWeight:600, color: isOffline ? 'var(--txt3)' : 'var(--txt)', letterSpacing:'-0.01em' }}>
                {pcId}
              </div>
              <div style={{ fontSize:11, color:'var(--txt4)', marginTop:1 }}>
                {latestData.os?.substring(0,36) ?? '—'}
              </div>
              {/* IP Address */}
              {latestData.ipAddress && latestData.ipAddress !== 'Unknown' && (
                <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:3 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--txt4)" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="2" y1="12" x2="22" y2="12"/>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                  </svg>
                  <span style={{ fontSize:11, color:'var(--txt4)', fontFamily:'monospace' }}>
                    {latestData.ipAddress}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:5 }}>
            {isOffline
              ? <span className="badge b-dim">● Offline</span>
              : pending
              ? <span className="badge b-dim">ML pending</span>
              : isAnomaly
              ? <span className={`badge ${sev==='High'?'b-red':'b-amber'}`}>⚠ {sev??'Anomaly'}</span>
              : <span className="badge b-green">● Online</span>}
            <span style={{ fontSize:11, color: isOffline ? 'var(--red)' : 'var(--txt4)' }}>
              {isOffline ? `Offline · ${lastSeenText}` : dataUtils.formatUptime(latestData.uptime)}
            </span>
          </div>
        </div>

        {/* CPU / RAM / Disk bars */}
        <div style={{ display:'flex', flexDirection:'column', gap:8, opacity: isOffline ? 0.5 : 1 }}>
          {[
            { l:'CPU',    v:cpu,  c: barColor(cpu)  },
            { l:'Memory', v:ram,  c: barColor(ram)  },
            { l:'Disk',   v:disk, c: barColor(disk) },
          ].map(m => (
            <div key={m.l} style={{ display:'grid', gridTemplateColumns:'52px 1fr 42px', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:12, color:'var(--txt3)' }}>{m.l}</span>
              <div className="bar-bg">
                <div className="bar-fill" style={{ width:`${Math.min(m.v,100)}%`, background: isOffline ? 'var(--txt4)' : m.c }} />
              </div>
              <span style={{ fontSize:12, fontWeight:500, color: isOffline ? 'var(--txt4)' : metricColor(m.v), textAlign:'right' }}>
                {m.v.toFixed(0)}%
              </span>
            </div>
          ))}
        </div>

        {/* Offline warning banner */}
        {isOffline && (
          <div style={{
            marginTop:12, padding:'8px 12px',
            background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.2)',
            borderRadius:'var(--r)', fontSize:12, color:'var(--red)',
            display:'flex', alignItems:'center', gap:6,
          }}>
            ⚠ Last data received {lastSeenText} — client may have stopped
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <div style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)', background:'var(--bg2)' }}>
        <div className="tabs">
          {[['metrics','Metrics'],['ml','ML Insights'],['chart','History']].map(([id,lbl]) => (
            <button key={id} className={`tab-btn ${tab===id?'on':''}`} onClick={() => setTab(id)}>{lbl}</button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ padding:'14px 16px' }}>

        {/* METRICS */}
        {tab === 'metrics' && (
          <div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:10 }}>
              {[
                { l:'Temperature', v:`${latestData.temperature?.toFixed(1)       ?? '—'}`, u:'°C', c: isOffline?'var(--txt4)':'var(--amber)'   },
                { l:'Latency',     v:`${latestData.network_latency?.toFixed(0)   ?? '—'}`, u:'ms', c: isOffline?'var(--txt4)':'var(--green)'   },
                { l:'Power',       v:`${latestData.power_consumption?.toFixed(0) ?? '—'}`, u:'W',  c: isOffline?'var(--txt4)':'var(--purple)'  },
              ].map(s => (
                <div key={s.l} style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:'10px 10px 8px' }}>
                  <div style={{ fontSize:11, color:'var(--txt3)', marginBottom:4 }}>{s.l}</div>
                  <div style={{ fontSize:20, fontWeight:600, letterSpacing:'-0.02em', color:s.c, lineHeight:1 }}>
                    {s.v}<span style={{ fontSize:11, fontWeight:400, color:'var(--txt3)', marginLeft:2 }}>{s.u}</span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'var(--r)', overflow:'hidden' }}>
              {[
                { l:'Processes',  v: latestData.process_count?.toLocaleString()  ?? '—' },
                { l:'Threads',    v: latestData.thread_count?.toLocaleString()   ?? '—' },
                { l:'Cache miss', v: latestData.cache_miss_rate?.toFixed(4)      ?? '—' },
              ].map((r, i, arr) => (
                <div key={r.l} style={{
                  display:'flex', justifyContent:'space-between', alignItems:'center',
                  padding:'9px 12px', borderBottom: i < arr.length-1 ? '1px solid var(--border)' : 'none',
                }}>
                  <span style={{ fontSize:12, color:'var(--txt3)' }}>{r.l}</span>
                  <span style={{ fontSize:13, fontWeight:500, color: isOffline ? 'var(--txt4)' : 'var(--txt)' }}>{r.v}</span>
                </div>
              ))}
            </div>

            {/* Running Processes */}
            {latestData.runningProcesses && latestData.runningProcesses.length > 0 && (
              <div style={{ marginTop:10 }}>
                <div style={{ fontSize:11, fontWeight:500, color:'var(--txt3)', marginBottom:6, letterSpacing:'0.03em' }}>
                  TOP PROCESSES BY CPU
                </div>
                <div style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'var(--r)', overflow:'hidden' }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 48px 48px', padding:'6px 12px', borderBottom:'1px solid var(--border)', background:'var(--bg2)' }}>
                    {['Process','CPU','MEM'].map(h => (
                      <span key={h} style={{ fontSize:10, fontWeight:500, color:'var(--txt4)', textAlign: h==='Process'?'left':'right' }}>{h}</span>
                    ))}
                  </div>
                  {latestData.runningProcesses.slice(0, 8).map((proc, i, arr) => (
                    <div key={proc.pid ?? i} style={{
                      display:'grid', gridTemplateColumns:'1fr 48px 48px',
                      padding:'7px 12px', alignItems:'center',
                      borderBottom: i < arr.length-1 ? '1px solid var(--border)' : 'none',
                    }}>
                      <div>
                        <span style={{ fontSize:12, color: isOffline?'var(--txt4)':'var(--txt)', fontWeight:500 }}>
                          {proc.name?.length > 22 ? proc.name.substring(0,22)+'…' : proc.name}
                        </span>
                        <span style={{ fontSize:10, color:'var(--txt4)', marginLeft:6 }}>{proc.pid}</span>
                      </div>
                      <span style={{ fontSize:12, fontWeight:500, textAlign:'right',
                        color: isOffline?'var(--txt4)': proc.cpu>20?'var(--red)':proc.cpu>5?'var(--amber)':'var(--txt2)' }}>
                        {proc.cpu?.toFixed(1)}%
                      </span>
                      <span style={{ fontSize:12, color:'var(--txt3)', textAlign:'right' }}>
                        {proc.mem?.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop:10, display:'flex', justifyContent:'space-between' }}>
              <span style={{ fontSize:11, color:'var(--txt4)' }}>Last data: {lastSeenText}</span>
              <span style={{ fontSize:11, color: isOffline?'var(--red)':'var(--green)' }}>
                {isOffline ? '● Offline' : '● Live'}
              </span>
            </div>
          </div>
        )}

        {/* ML INSIGHTS */}
        {tab === 'ml' && (
          <div>
            {isOffline ? (
              <div style={{ textAlign:'center', padding:'20px 0', color:'var(--txt3)', fontSize:13 }}>
                ML data unavailable — PC is offline
              </div>
            ) : pending ? (
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10, padding:'20px 0' }}>
                <div className="spin spin-sm" />
                <span style={{ fontSize:12, color:'var(--txt3)' }}>Processing ML models…</span>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {sevScore != null && (
                  <div style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:'12px 14px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                      <span style={{ fontSize:12, color:'var(--txt3)' }}>Severity Score</span>
                      <span style={{ fontSize:20, fontWeight:600, letterSpacing:'-0.02em',
                        color: sev==='High'?'var(--red)':sev==='Medium'?'var(--amber)':'var(--green)' }}>
                        {sevScore.toFixed(1)}<span style={{ fontSize:12, color:'var(--txt3)', fontWeight:400 }}>/100</span>
                      </span>
                    </div>
                    <div style={{ height:6, borderRadius:99, background:'var(--bg)', overflow:'hidden', position:'relative' }}>
                      <div style={{ position:'absolute', left:0,   width:'40%', top:0, bottom:0, background:'rgba(34,197,94,0.15)' }} />
                      <div style={{ position:'absolute', left:'40%', width:'27%', top:0, bottom:0, background:'rgba(245,158,11,0.15)' }} />
                      <div style={{ position:'absolute', left:'67%', right:0, top:0, bottom:0, background:'rgba(239,68,68,0.15)' }} />
                      <div style={{
                        position:'absolute', left:0, top:0, bottom:0, borderRadius:99,
                        width:`${sevScore}%`,
                        background: sev==='High'?'var(--red)':sev==='Medium'?'var(--amber)':'var(--green)',
                        transition:'width 1s cubic-bezier(0.16,1,0.3,1)',
                      }} />
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', marginTop:5 }}>
                      {[['Low','var(--green)'],['Medium','var(--amber)'],['High','var(--red)']].map(([l,c])=>(
                        <span key={l} style={{ fontSize:10, color:c, opacity:0.6 }}>{l}</span>
                      ))}
                    </div>
                    {ml.severity?.action && (
                      <div style={{ fontSize:12, color:'var(--txt2)', marginTop:8 }}>→ {ml.severity.action}</div>
                    )}
                  </div>
                )}

                <div style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:'var(--r)', overflow:'hidden' }}>
                  {[
                    { l:'Bottleneck',    v: ml.bottleneck?.label ? `${ml.bottleneck.label.replace(/_/g,' ')} (${ml.bottleneck.confidence?.toFixed(1)}%)` : '—',
                      c: ml.bottleneck?.label==='CPU_Bound'?'var(--blue)':ml.bottleneck?.label==='Memory_Bound'?'var(--purple)':ml.bottleneck?.label==='Disk_Bound'?'var(--amber)':'var(--green)' },
                    { l:'Anomaly score', v: ml.anomalyScore?.toFixed(5) ?? '—', c: isAnomaly?'var(--red)':'var(--green)' },
                    { l:'ML status',     v: ml.mlStatus ?? '—', c:'var(--txt2)' },
                  ].map((r,i,arr)=>(
                    <div key={r.l} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 12px', borderBottom: i<arr.length-1?'1px solid var(--border)':'none' }}>
                      <span style={{ fontSize:12, color:'var(--txt3)' }}>{r.l}</span>
                      <span style={{ fontSize:12, fontWeight:500, color:r.c }}>{r.v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* HISTORY CHART */}
        {tab === 'chart' && (
          <div>
            <div style={{ display:'flex', gap:14, marginBottom:12 }}>
              {[['CPU','#3b82f6'],['RAM','#8b5cf6'],['Temp','#f59e0b']].map(([l,c])=>(
                <div key={l} style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <div style={{ width:14, height:3, background: isOffline?'#444':c, borderRadius:2 }} />
                  <span style={{ fontSize:11, color:'var(--txt3)' }}>{l}</span>
                </div>
              ))}
              {isOffline && (
                <span style={{ marginLeft:'auto', fontSize:11, color:'var(--red)' }}>● Last known data</span>
              )}
            </div>

            {loading ? (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:180 }}>
                <div className="spin spin-sm" />
              </div>
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={chartData} margin={{ top:4, right:0, bottom:0, left:-26 }}>
                  <defs>
                    <linearGradient id={`cpu-${pcId}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={isOffline?'#444':'#3b82f6'} stopOpacity="0.2"/>
                      <stop offset="100%" stopColor={isOffline?'#444':'#3b82f6'} stopOpacity="0"/>
                    </linearGradient>
                    <linearGradient id={`ram-${pcId}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={isOffline?'#444':'#8b5cf6'} stopOpacity="0.2"/>
                      <stop offset="100%" stopColor={isOffline?'#444':'#8b5cf6'} stopOpacity="0"/>
                    </linearGradient>
                    <linearGradient id={`temp-${pcId}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={isOffline?'#444':'#f59e0b'} stopOpacity="0.15"/>
                      <stop offset="100%" stopColor={isOffline?'#444':'#f59e0b'} stopOpacity="0"/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 8" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="t" tick={{ fill:'#444', fontSize:9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis domain={[0,100]} tick={{ fill:'#444', fontSize:9 }} axisLine={false} tickLine={false} tickFormatter={v=>`${v}%`} />
                  <Tooltip content={<ChartTip />} />
                  <Area type="monotone" dataKey="temp" name="Temp"
                    stroke={isOffline?'#444':'#f59e0b'} strokeWidth={1.5}
                    fill={`url(#temp-${pcId})`} connectNulls dot={false} />
                  <Area type="monotone" dataKey="cpu" name="CPU"
                    stroke={isOffline?'#555':'#3b82f6'} strokeWidth={2}
                    fill={`url(#cpu-${pcId})`} connectNulls dot={false} />
                  <Area type="monotone" dataKey="ram" name="RAM"
                    stroke={isOffline?'#555':'#8b5cf6'} strokeWidth={2}
                    fill={`url(#ram-${pcId})`} connectNulls dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:180 }}>
                <span style={{ fontSize:12, color:'var(--txt3)' }}>No history data yet</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}