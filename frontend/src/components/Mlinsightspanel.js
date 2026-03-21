import React from 'react';

export default function MLInsightsPanel({ pcs }) {
  if (!pcs?.length) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300 }}>
      <span style={{ fontSize:13, color:'var(--txt3)' }}>No PC data available</span>
    </div>
  );

  const withML    = pcs.filter(p => p.mlResults?.mlStatus === 'success');
  const anomalies = withML.filter(p => p.mlResults?.isAnomaly === true);
  const avgSev    = withML.length
    ? withML.reduce((s,p) => s + (p.mlResults?.severity?.score ?? 0), 0) / withML.length : 0;

  const bnk = { CPU_Bound:0, Memory_Bound:0, Disk_Bound:0, Normal:0 };
  withML.forEach(p => { const l = p.mlResults?.bottleneck?.label; if (l in bnk) bnk[l]++; });

  const pctOf = n => withML.length ? ((n/withML.length)*100).toFixed(0) : 0;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* ML Coverage */}
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <span style={{ fontSize:12, color:'var(--txt3)', whiteSpace:'nowrap' }}>ML coverage</span>
        <div className="bar-bg" style={{ flex:1 }}>
          <div className="bar-fill" style={{ width: pcs.length ? `${(withML.length/pcs.length)*100}%` : '0%', background:'var(--blue)' }} />
        </div>
        <span style={{ fontSize:12, fontWeight:500, color:'var(--blue)', whiteSpace:'nowrap' }}>
          {withML.length}/{pcs.length}
        </span>
        {withML.length < pcs.length && (
          <span className="badge b-amber">{pcs.length - withML.length} pending</span>
        )}
      </div>

      {/* Summary row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:12 }}>
        {[
          { l:'Anomalies',      v:anomalies.length,    sub:`of ${withML.length} analyzed`,  c:'var(--red)',    dim:anomalies.length===0 },
          { l:'Avg Severity',   v:avgSev.toFixed(1),   sub: avgSev>67?'High risk':avgSev>40?'Moderate':'Low risk', c: avgSev>67?'var(--red)':avgSev>40?'var(--amber)':'var(--green)', unit:'/100' },
          { l:'CPU Bottleneck', v:bnk.CPU_Bound,       sub:`${pctOf(bnk.CPU_Bound)}% of systems`,  c:'var(--blue)'   },
          { l:'Normal',         v:bnk.Normal,          sub:`${pctOf(bnk.Normal)}% of systems`,      c:'var(--green)'  },
        ].map((s,i) => (
          <div key={i} className="card" style={{ padding:'16px 18px', borderColor: s.c === 'var(--red)' && !s.dim ? 'rgba(239,68,68,0.25)' : 'var(--border)' }}>
            <div style={{ fontSize:12, color:'var(--txt3)', marginBottom:10 }}>{s.l}</div>
            <div style={{ fontSize:28, fontWeight:600, letterSpacing:'-0.02em', lineHeight:1, marginBottom:4, color: s.dim ? 'var(--green)' : s.c }}>
              {s.v}<span style={{ fontSize:13, color:'var(--txt4)', fontWeight:400 }}>{s.unit??''}</span>
            </div>
            <div style={{ fontSize:11, color:'var(--txt4)' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* ML Results table */}
      <div className="card" style={{ overflow:'hidden' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 18px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontSize:14, fontWeight:600, color:'var(--txt)', letterSpacing:'-0.01em' }}>ML Results</div>
          <span style={{ fontSize:11, color:'var(--txt4)' }}>{pcs.length} systems</span>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table className="tbl">
            <thead>
              <tr>
                {['System','Status','Severity','Bottleneck','Confidence','Action'].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pcs.map(pc => {
                const ml      = pc.mlResults || {};
                const pending = ml.mlStatus !== 'success';
                const sev     = ml.severity?.level;
                const sevCol  = sev==='High'?'var(--red)':sev==='Medium'?'var(--amber)':'var(--green)';
                const bnkCol  = ml.bottleneck?.label==='CPU_Bound'   ?'var(--blue)'  :
                                ml.bottleneck?.label==='Memory_Bound'?'var(--purple)':
                                ml.bottleneck?.label==='Disk_Bound'  ?'var(--amber)' :'var(--green)';
                return (
                  <tr key={pc.pcId}>
                    <td style={{ fontWeight:600, color:'var(--txt)' }}>{pc.pcId}</td>
                    <td>
                      {pending
                        ? <span className="badge b-dim">Pending</span>
                        : ml.isAnomaly
                        ? <span className="badge b-red">⚠ Anomaly</span>
                        : <span className="badge b-green">Normal</span>}
                    </td>
                    <td>
                      {!pending && ml.severity?.score != null
                        ? <span style={{ fontWeight:600, color:sevCol }}>{ml.severity.score.toFixed(1)} <span style={{ color:'var(--txt4)', fontWeight:400, fontSize:11 }}>({sev})</span></span>
                        : <span style={{ color:'var(--txt4)' }}>—</span>}
                    </td>
                    <td>
                      {!pending && ml.bottleneck?.label
                        ? <span style={{ fontWeight:500, color:bnkCol }}>{ml.bottleneck.label.replace(/_/g,' ')}</span>
                        : <span style={{ color:'var(--txt4)' }}>—</span>}
                    </td>
                    <td style={{ color:'var(--txt2)' }}>
                      {!pending && ml.bottleneck?.confidence != null
                        ? `${ml.bottleneck.confidence.toFixed(1)}%`
                        : <span style={{ color:'var(--txt4)' }}>—</span>}
                    </td>
                    <td style={{ color:'var(--txt2)', fontSize:12 }}>
                      {!pending && ml.severity?.action
                        ? ml.severity.action
                        : <span style={{ color:'var(--txt4)' }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottleneck distribution */}
      <div className="card" style={{ padding:'16px 20px' }}>
        <div style={{ fontSize:14, fontWeight:600, color:'var(--txt)', letterSpacing:'-0.01em', marginBottom:16 }}>
          Bottleneck Distribution
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {[
            { l:'CPU Bound',    n:bnk.CPU_Bound,    c:'var(--blue)'   },
            { l:'Memory Bound', n:bnk.Memory_Bound, c:'var(--purple)' },
            { l:'Disk Bound',   n:bnk.Disk_Bound,   c:'var(--amber)'  },
            { l:'Normal',       n:bnk.Normal,       c:'var(--green)'  },
          ].map(item => {
            const p = withML.length ? (item.n/withML.length)*100 : 0;
            return (
              <div key={item.l}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:8, height:8, borderRadius:2, background:item.c }} />
                    <span style={{ fontSize:13, color:'var(--txt2)' }}>{item.l}</span>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:14, fontWeight:600, color:item.c }}>{item.n}</span>
                    <span style={{ fontSize:11, color:'var(--txt4)' }}>{p.toFixed(0)}%</span>
                  </div>
                </div>
                <div className="bar-bg" style={{ height:5 }}>
                  <div className="bar-fill" style={{ width:`${p}%`, background:item.c }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}