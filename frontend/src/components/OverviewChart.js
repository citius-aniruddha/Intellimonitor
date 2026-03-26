import React, { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { systemDataAPI } from '../utils/api';

export default function OverviewChart({ overviewData, onDataUpdate }) {
  const [history,      setHistory]      = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);
  const [lastUpdate,   setLastUpdate]   = useState(null);
  const [chartType,    setChartType]    = useState('area');
  const [activeMetric, setActiveMetric] = useState('all');

  // ── Fetch ALL historical records and bucket into hourly averages ──
  const fetchHistory = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await systemDataAPI.getData();
      if (!res.success) throw new Error(res.message);

      const allPCs = res.data?.latest ?? [];
      if (allPCs.length === 0) { setHistory([]); return; }

      const historicalResults = await Promise.all(
        allPCs.map(pc =>
          systemDataAPI.getData({ pcId: pc.pcId, hours: 24 })
            .then(r => r.success ? (r.data?.historical ?? []) : [])
            .catch(() => [])
        )
      );

      const allRecords = historicalResults.flat();

      if (allRecords.length === 0) {
        const now = new Date();
        const point = {
          h:    now.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12:false }),
          cpu:  allPCs.reduce((s,p) => s + (p.cpu ?? p.cpu_utilization ?? 0), 0) / allPCs.length,
          ram:  allPCs.reduce((s,p) => s + (p.ram ?? p.memory_usage    ?? 0), 0) / allPCs.length,
          disk: allPCs.reduce((s,p) => s + (p.disk ?? 0), 0) / allPCs.length,
        };
        setHistory([point]);
        setLastUpdate(new Date());
        return;
      }

      const now = new Date();
      const buckets = [];

      for (let i = 23; i >= 0; i--) {
        const slotStart = new Date(now - i * 3600000);
        const slotEnd   = new Date(now - (i - 1) * 3600000);
        const pts       = allRecords.filter(r => {
          const t = new Date(r.createdAt);
          return t >= slotStart && t < slotEnd;
        });

        if (pts.length > 0) {
          const avg = arr => Math.round(
            arr.filter(v => v != null).reduce((a, b) => a + b, 0) /
            arr.filter(v => v != null).length * 10
          ) / 10;

          buckets.push({
            h:    slotStart.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', hour12:false }),
            cpu:  avg(pts.map(p => p.cpu_utilization ?? p.cpu  ?? null)),
            ram:  avg(pts.map(p => p.memory_usage    ?? p.ram  ?? null)),
            disk: avg(pts.map(p => p.disk ?? null)),
          });
        }
      }

      setHistory(buckets);
      setLastUpdate(new Date());
    } catch (e) {
      console.error('Chart fetch error:', e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
    const t = setInterval(fetchHistory, 60000);
    return () => clearInterval(t);
  }, [fetchHistory]);

  if (!overviewData) return (
    <div className="card" style={{ height:200, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div className="spin" />
    </div>
  );

  const avg = {
    cpu:  overviewData.avgCpu  ?? 0,
    ram:  overviewData.avgRam  ?? 0,
    disk: overviewData.avgDisk ?? 0,
  };

  const metrics = [
    { key:'cpu',  label:'CPU',    color:'#3b82f6', val: avg.cpu  },
    { key:'ram',  label:'Memory', color:'#8b5cf6', val: avg.ram  },
    { key:'disk', label:'Disk',   color:'#f59e0b', val: avg.disk },
  ];

  // ── Pie data (Avg CPU / Memory / Disk) ──
  const pieData = [
    { name:'Avg CPU',    value: parseFloat(avg.cpu.toFixed(1)),  color:'#3b82f6' },
    { name:'Avg Memory', value: parseFloat(avg.ram.toFixed(1)),  color:'#8b5cf6' },
    { name:'Avg Disk',   value: parseFloat(avg.disk.toFixed(1)), color:'#f59e0b' },
  ].filter(d => d.value > 0);

  const pieTotal = pieData.length
    ? (avg.cpu + avg.ram + avg.disk) / 3
    : 0;

  // Custom tooltip for area/split
  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const valid = payload.filter(p => p.value != null);
    if (!valid.length) return null;
    return (
      <div style={{
        background:'#1c1c1c', border:'1px solid #333', borderRadius:10,
        padding:'12px 16px', boxShadow:'0 8px 32px rgba(0,0,0,0.5)',
        minWidth:130,
      }}>
        <div style={{ fontSize:11, color:'#666', marginBottom:8 }}>{label}</div>
        {valid.map((p, i) => (
          <div key={i} style={{
            display:'flex', alignItems:'center', justifyContent:'space-between',
            gap:16, marginBottom: i < valid.length-1 ? 5 : 0,
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:p.color }} />
              <span style={{ fontSize:12, color:'#888' }}>{p.dataKey.toUpperCase()}</span>
            </div>
            <span style={{ fontSize:13, fontWeight:600, color:p.color }}>
              {p.value?.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    );
  };

  // Custom tooltip for pie
  const PieTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const { name, value, color } = payload[0].payload;
    return (
      <div style={{
        background:'#1c1c1c', border:'1px solid #333', borderRadius:8,
        padding:'8px 12px', fontSize:11,
      }}>
        <div style={{ color, fontWeight:600, marginBottom:3 }}>{name}</div>
        <div style={{ color:'#aaa' }}>{value}%</div>
      </div>
    );
  };

  // Percentage label inside pie slices
  const PieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    if (percent < 0.08) return null;
    const RADIAN = Math.PI / 180;
    const r = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + r * Math.cos(-midAngle * RADIAN);
    const y = cy + r * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central"
        style={{ fontSize:11, fontWeight:600 }}>
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  const axisStyle = { fill:'#555', fontSize:10 };
  const gridStyle = { stroke:'rgba(255,255,255,0.04)', strokeDasharray:'3 8' };

  return (
    <div className="card">

      {/* ── Header ── */}
      <div style={{
        display:'flex', justifyContent:'space-between', alignItems:'center',
        padding:'16px 20px', borderBottom:'1px solid var(--border)',
      }}>
        <div>
          <div style={{ fontSize:14, fontWeight:600, color:'var(--txt)', letterSpacing:'-0.01em' }}>
            24-Hour System Trends
          </div>
          <div style={{ fontSize:12, color:'var(--txt3)', marginTop:2 }}>
            Average across {overviewData.totalPCs ?? 0} system{overviewData.totalPCs !== 1 ? 's' : ''}
            {overviewData.anomalyCount > 0 && (
              <span style={{ color:'var(--red)', marginLeft:10 }}>
                · {overviewData.anomalyCount} anomal{overviewData.anomalyCount === 1 ? 'y' : 'ies'}
              </span>
            )}
          </div>
        </div>

        {/* Chart type switcher — Area | Pie | Split */}
        <div style={{ display:'flex', gap:4, background:'var(--bg3)', padding:'4px', borderRadius:'var(--r)' }}>
          {[['area','Area'],['pie','Pie'],['split','Split']].map(([t, lbl]) => (
            <button key={t} onClick={() => setChartType(t)} style={{
              fontSize:12, fontWeight:500, padding:'5px 12px',
              borderRadius:6, border:'none', cursor:'pointer',
              background: chartType === t ? 'var(--card2)' : 'transparent',
              color:      chartType === t ? 'var(--txt)'   : 'var(--txt3)',
              boxShadow:  chartType === t ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
              transition:'all 0.15s',
            }}>{lbl}</button>
          ))}
        </div>
      </div>

      {/* ── Metric selector tabs (hidden in pie mode) ── */}
      {chartType !== 'pie' && (
        <div style={{ display:'flex', borderBottom:'1px solid var(--border)' }}>
          <MetricTab label="All" value={null} color="#666" active={activeMetric === 'all'} onClick={() => setActiveMetric('all')} />
          {metrics.map(m => (
            <MetricTab key={m.key} label={m.label} value={m.val} color={m.color}
              active={activeMetric === m.key} onClick={() => setActiveMetric(m.key)} />
          ))}
        </div>
      )}

      {/* ── Chart area ── */}
      <div style={{ padding:'20px 16px 10px' }}>
        {loading ? (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:280, gap:10 }}>
            <div className="spin" />
            <span style={{ fontSize:12, color:'var(--txt3)' }}>Loading chart data…</span>
          </div>
        ) : error ? (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:280, gap:10 }}>
            <span style={{ fontSize:12, color:'var(--red)' }}>{error}</span>
            <button onClick={fetchHistory} style={{
              fontSize:12, fontWeight:500, color:'var(--blue)', background:'none',
              border:'1px solid var(--border2)', padding:'5px 12px',
              borderRadius:'var(--r)', cursor:'pointer',
            }}>Retry</button>
          </div>
        ) : (

          /* ── PIE view ── */
          chartType === 'pie' ? (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center' }}>
              {pieData.length === 0 ? (
                <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:280 }}>
                  <span style={{ fontSize:13, color:'var(--txt4)' }}>No data yet</span>
                </div>
              ) : (
                <>
                  <div style={{ position:'relative', width:'100%' }}>
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={72}
                          outerRadius={110}
                          paddingAngle={4}
                          dataKey="value"
                          labelLine={false}
                          label={<PieLabel />}
                        >
                          {pieData.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip content={<PieTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>

                    {/* Centre donut label */}
                    <div style={{
                      position:'absolute', top:'50%', left:'50%',
                      transform:'translate(-50%, -50%)',
                      textAlign:'center', pointerEvents:'none',
                    }}>
                      <div style={{ fontSize:22, fontWeight:700, color:'var(--txt)', lineHeight:1 }}>
                        {pieTotal.toFixed(0)}%
                      </div>
                      <div style={{ fontSize:10, color:'var(--txt4)', marginTop:3 }}>avg load</div>
                    </div>
                  </div>

                  {/* Pie legend with actual values */}
                  <div style={{ display:'flex', gap:24, justifyContent:'center', marginTop:4, marginBottom:8 }}>
                    {pieData.map(({ name, value, color }) => (
                      <div key={name} style={{ display:'flex', alignItems:'center', gap:7 }}>
                        <div style={{ width:11, height:11, borderRadius:3, background:color, flexShrink:0 }} />
                        <div>
                          <div style={{ fontSize:11, color:'var(--txt3)' }}>{name}</div>
                          <div style={{ fontSize:14, fontWeight:600, color, lineHeight:1.2 }}>{value}%</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

          /* ── SPLIT view ── */
          ) : chartType === 'split' ? (
            <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
              {metrics.map(m => (
                <div key={m.key}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <div style={{ width:12, height:3, background:m.color, borderRadius:2 }} />
                      <span style={{ fontSize:12, fontWeight:500, color:'var(--txt2)' }}>{m.label}</span>
                    </div>
                    <span style={{ fontSize:11, color:'var(--txt3)' }}>avg {m.val?.toFixed(1)}%</span>
                  </div>
                  <ResponsiveContainer width="100%" height={80}>
                    <AreaChart data={history} margin={{ top:2, right:4, bottom:0, left:-30 }}>
                      <defs>
                        <linearGradient id={`sg-${m.key}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"   stopColor={m.color} stopOpacity="0.3"/>
                          <stop offset="100%" stopColor={m.color} stopOpacity="0"/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid {...gridStyle} vertical={false} />
                      <XAxis dataKey="h" tick={axisStyle} axisLine={false} tickLine={false} hide />
                      <YAxis domain={[0, 100]} tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                      <Tooltip content={<CustomTooltip />} />
                      <Area type="monotone" dataKey={m.key}
                        stroke={m.color} strokeWidth={2}
                        fill={`url(#sg-${m.key})`}
                        connectNulls dot={false} activeDot={{ r:4, fill:m.color }} />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div style={{ height:1, background:'var(--border)' }} />
                </div>
              ))}
            </div>

          /* ── AREA view ── */
          ) : history.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={history} margin={{ top:4, right:4, bottom:0, left:-10 }}>
                <defs>
                  <linearGradient id="g-cpu"  x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#3b82f6" stopOpacity="0.25"/>
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity="0"/>
                  </linearGradient>
                  <linearGradient id="g-ram"  x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#8b5cf6" stopOpacity="0.25"/>
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0"/>
                  </linearGradient>
                  <linearGradient id="g-disk" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#f59e0b" stopOpacity="0.15"/>
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity="0"/>
                  </linearGradient>
                </defs>
                <CartesianGrid {...gridStyle} vertical={false} />
                <XAxis dataKey="h" tick={axisStyle} axisLine={false} tickLine={false}
                  interval={Math.max(0, Math.floor(history.length / 6) - 1)} />
                <YAxis domain={[0, 100]} tick={axisStyle} axisLine={false} tickLine={false}
                  tickFormatter={v => `${v}%`} width={36} />
                <Tooltip content={<CustomTooltip />} />
                {(activeMetric === 'all' || activeMetric === 'disk') && (
                  <Area type="monotone" dataKey="disk" name="DISK"
                    stroke="#f59e0b" strokeWidth={1.5} fill="url(#g-disk)"
                    connectNulls dot={false} activeDot={{ r:4, fill:'#f59e0b' }} />
                )}
                {(activeMetric === 'all' || activeMetric === 'cpu') && (
                  <Area type="monotone" dataKey="cpu" name="CPU"
                    stroke="#3b82f6" strokeWidth={2} fill="url(#g-cpu)"
                    connectNulls dot={false} activeDot={{ r:4, fill:'#3b82f6' }} />
                )}
                {(activeMetric === 'all' || activeMetric === 'ram') && (
                  <Area type="monotone" dataKey="ram" name="RAM"
                    stroke="#8b5cf6" strokeWidth={2} fill="url(#g-ram)"
                    connectNulls dot={false} activeDot={{ r:4, fill:'#8b5cf6' }} />
                )}
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:280, gap:8 }}>
              <span style={{ fontSize:22 }}>📊</span>
              <span style={{ fontSize:13, color:'var(--txt3)' }}>No historical data yet</span>
              <span style={{ fontSize:11, color:'var(--txt4)' }}>Appears after the first client reading</span>
            </div>
          )
        )}
      </div>

      {/* ── Legend + footer ── */}
      <div style={{
        display:'flex', justifyContent:'space-between', alignItems:'center',
        padding:'10px 20px', borderTop:'1px solid var(--border)', background:'var(--bg2)',
      }}>
        <div style={{ display:'flex', gap:16 }}>
          {metrics.map(m => (
            <button key={m.key}
              onClick={() => chartType !== 'pie' && setActiveMetric(activeMetric === m.key ? 'all' : m.key)}
              style={{ display:'flex', alignItems:'center', gap:5, background:'none', border:'none',
                cursor: chartType === 'pie' ? 'default' : 'pointer', padding:0 }}>
              <div style={{ width:16, height:3, borderRadius:2, background:m.color,
                opacity: chartType === 'pie' || activeMetric === 'all' || activeMetric === m.key ? 1 : 0.3 }} />
              <span style={{ fontSize:11,
                color: chartType === 'pie' || activeMetric === 'all' || activeMetric === m.key ? 'var(--txt3)' : 'var(--txt4)' }}>
                {m.label}
              </span>
            </button>
          ))}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontSize:11, color:'var(--txt4)' }}>
            {lastUpdate ? `Updated ${lastUpdate.toLocaleTimeString()}` : '—'}
          </span>
          <button onClick={fetchHistory} disabled={loading} style={{
            fontSize:12, fontWeight:500, color: loading ? 'var(--txt3)' : 'var(--blue)',
            background:'none', border:'none', cursor:'pointer',
          }}>
            {loading ? 'Refreshing…' : '↻ Refresh'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Metric tab ── */
function MetricTab({ label, value, color, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      flex:1, minWidth:80, padding:'12px 16px',
      background: active ? 'rgba(255,255,255,0.03)' : 'transparent',
      border:'none', borderBottom: `2px solid ${active ? color : 'transparent'}`,
      borderRight:'1px solid var(--border)',
      cursor:'pointer', transition:'all 0.15s', textAlign:'left',
    }}>
      <div style={{ fontSize:11, fontWeight:500, color: active ? 'var(--txt2)' : 'var(--txt3)', marginBottom: value != null ? 4 : 0 }}>
        {label}
      </div>
      {value != null && (
        <div style={{ fontSize:18, fontWeight:600, letterSpacing:'-0.02em', lineHeight:1, color: active ? color : 'var(--txt4)' }}>
          {value.toFixed(1)}<span style={{ fontSize:11, fontWeight:400, color:'var(--txt4)', marginLeft:1 }}>%</span>
        </div>
      )}
    </button>
  );
}