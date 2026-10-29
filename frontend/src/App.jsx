import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, ArrowDown, ArrowLeftRight, ArrowRight, Check, ChevronDown, CircleAlert, CircleCheck, CircleHelp, Clock3, Cpu, Database, GitBranch, Layers3, Play, Plus, RotateCcw, ShieldCheck, Sparkles, Trash2, TriangleAlert, Waypoints, X } from 'lucide-react'

const API = '/api'
const colorFor = (id) => ['#eb7b57', '#478b8a', '#7c6dba', '#d5a343', '#6b8c65'][Math.max(0, [...id].reduce((s, c) => s + c.charCodeAt(0), 0) % 5)]

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options })
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || 'Something went wrong. Try again.')
  return body
}

function App() {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [tab, setTab] = useState('overview')
  const [modal, setModal] = useState('')
  const [form, setForm] = useState({ name: '', total: 1, process: 'P1', resource: 'R1', units: 1, action: 'allocate' })
  const [preview, setPreview] = useState(null)
  const [algorithm, setAlgorithm] = useState(null)

  const refresh = useCallback(async () => {
    try { setData(await api('/state')) } catch (error) { setMessage(error.message) }
  }, [])
  useEffect(() => { refresh() }, [refresh])
  useEffect(() => { if (message) { const timeout = setTimeout(() => setMessage(''), 3600); return () => clearTimeout(timeout) } }, [message])

  const run = async (fn, success) => {
    setBusy(true)
    try { await fn(); await refresh(); if (success) setMessage(success) }
    catch (error) { setMessage(error.message) }
    finally { setBusy(false) }
  }
  const state = data?.state
  const processes = state?.processes || []
  const resources = state?.resources || []
  const detection = data?.detection
  const graph = data?.graph || { nodes: [], edges: [] }
  const totalUnits = resources.reduce((sum, r) => sum + r.total, 0)
  const allocatedUnits = resources.reduce((sum, r) => sum + r.total - r.available, 0)

  const onScenario = () => run(async () => {
    const n = { processes: [{id:'P1',name:'P1',status:'waiting'},{id:'P2',name:'P2',status:'waiting'},{id:'P3',name:'P3',status:'running'}], resources: [{id:'R1',name:'R1',total:1,available:0},{id:'R2',name:'R2',total:1,available:0},{id:'R3',name:'R3',total:1,available:1}], allocations:{P1:{R1:1,R2:0,R3:0},P2:{R1:0,R2:1,R3:0},P3:{R1:0,R2:0,R3:0}}, requests:{P1:{R1:0,R2:1,R3:0},P2:{R1:1,R2:0,R3:0},P3:{R1:0,R2:0,R3:0}}, maximum:{P1:{R1:1,R2:1,R3:0},P2:{R1:1,R2:1,R3:0},P3:{R1:0,R2:0,R3:1}} }
    setData(await api('/state', { method:'PUT', body:JSON.stringify(n) }))
  }, 'Classic two-process deadlock loaded')

  const addEntity = async (event) => {
    event.preventDefault()
    const path = modal === 'process' ? '/processes' : '/resources'
    await run(async () => { await api(path, { method:'POST', body:JSON.stringify(form) }); await refresh(); setModal(''); setForm({ ...form, name:'' }) }, `${modal === 'process' ? 'Process' : 'Resource'} added`)
  }
  const transact = async (event) => {
    event.preventDefault()
    const route = form.action === 'allocate' ? '/allocate' : form.action === 'request' ? '/request' : '/release'
    await run(() => api(route, { method:'POST', body:JSON.stringify(form) }), `${form.process} ${form.action}d ${form.units} ${form.resource}`)
    setModal('')
  }
  const showRecovery = async () => {
    try { setPreview(await api('/recovery/preview')); setModal('recovery') } catch (error) { setMessage(error.message) }
  }
  const recover = async (strategy) => {
    setModal('')
    await run(async () => { const res = await api('/recovery', { method:'POST', body:JSON.stringify({ strategy }) }); setAlgorithm(res.result) }, `${strategy[0].toUpperCase()+strategy.slice(1)} recovery applied`)
  }
  const detectNow = async () => run(async () => { const result = await api('/detect', { method:'POST', body:'{}' }); setAlgorithm(result) }, 'Detection complete')
  const bankersNow = async () => run(async () => { const result = await api('/bankers', { method:'POST', body:'{}' }); setAlgorithm(result) }, 'Banker’s safety check complete')

  if (!data) return <div className="loading"><div className="loader-mark"><Waypoints size={24}/></div><strong>Opening Deadlock Lab</strong><span>{message || 'Connecting to the simulation engine…'}</span></div>

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-icon"><Waypoints size={20}/></div><div><strong>deadlock<span>lab</span></strong><small>OPERATING SYSTEMS</small></div></div>
      <div className="side-label">WORKSPACE</div>
      <nav>
        <button className={tab==='overview'?'active':''} onClick={()=>setTab('overview')}><Layers3 size={17}/> Overview <span className="nav-count">01</span></button>
        <button className={tab==='graph'?'active':''} onClick={()=>setTab('graph')}><GitBranch size={17}/> Resource graph</button>
        <button className={tab==='history'?'active':''} onClick={()=>setTab('history')}><Clock3 size={17}/> Event history <span className="history-badge">{data.history.length}</span></button>
      </nav>
      <div className="side-label tools-label">SIMULATION TOOLS</div>
      <nav>
        <button onClick={detectNow}><CircleAlert size={17}/> Run detection <ArrowRight className="nav-arrow" size={15}/></button>
        <button onClick={bankersNow}><ShieldCheck size={17}/> Banker’s algorithm <ArrowRight className="nav-arrow" size={15}/></button>
        <button onClick={showRecovery}><RotateCcw size={17}/> Recovery strategies <ArrowRight className="nav-arrow" size={15}/></button>
      </nav>
      <div className="sidebar-bottom"><div className="online"><span/> ENGINE ONLINE</div><div className="sidebar-note">Learn by experimenting.<br/>Every action is reversible.</div><div className="sidebar-foot"><span>DEADLOCK LAB</span><span>v1.0</span></div></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="crumb"><span>Simulator</span><span className="slash">/</span><b>{tab==='overview'?'Overview':tab==='graph'?'Resource graph':'Event history'}</b></div><div className="top-actions"><div className="mode-pill"><span/> Live simulation</div><button className="avatar" title="Deadlock Lab">DL</button></div></header>
      <div className="page-wrap">
        <div className="page-heading"><div><div className="eyebrow">OPERATING SYSTEMS · INTERACTIVE LAB</div><h1>{tab==='overview'?'See the deadlock. Break the cycle.':tab==='graph'?'Resource allocation graph':'Simulation history'}</h1><p>{tab==='overview'?'Build a resource scenario, spot a deadlock, then explore what recovery looks like.':tab==='graph'?'Follow allocations and requests between processes and resource instances.':'A replayable record of each state change, detection, and recovery.'}</p></div><button className="btn btn-quiet" onClick={onScenario}><Sparkles size={15}/> Load example scenario</button></div>
        {message && <div className="toast"><CircleCheck size={16}/>{message}<button onClick={()=>setMessage('')}><X size={14}/></button></div>}
        {tab==='overview' && <>
          <section className="stats-grid">
            <Stat icon={<Cpu/>} label="PROCESSES" value={processes.length} sub={`${processes.filter(p=>p.status==='running').length} running · ${processes.filter(p=>p.status==='waiting').length} waiting`} color="coral"/>
            <Stat icon={<Database/>} label="RESOURCE TYPES" value={resources.length} sub={`${totalUnits} total instances`} color="teal"/>
            <Stat icon={<ArrowLeftRight/>} label="ALLOCATED" value={`${allocatedUnits}/${totalUnits}`} sub={`${totalUnits ? Math.round(allocatedUnits/totalUnits*100) : 0}% of all instances`} color="violet"/>
            <Stat icon={detection?.deadlocked?<TriangleAlert/>:<Activity/>} label="SYSTEM STATUS" value={detection?.deadlocked?'Deadlock':'Clear'} sub={detection?.deadlocked?`${detection.processes.join(', ')} in a cycle`:'No blocked cycle found'} color={detection?.deadlocked?'red':'green'} status/>
          </section>
          <section className="main-grid">
            <div className="panel graph-panel"><div className="panel-head"><div><div className="panel-title">Resource allocation graph</div><div className="panel-sub">A live view of who holds and requests what</div></div><button className="icon-btn" onClick={()=>setTab('graph')} aria-label="Open full graph"><ArrowRight size={16}/></button></div><Graph state={state} graph={graph}/><div className="graph-legend"><span><i className="line allocation"/>Allocated</span><span><i className="line request"/>Requesting</span><span><i className="dot resource-dot"/>Resource</span></div><div className="graph-footer"><span><b>{graph.nodes.length}</b> nodes</span><span><b>{graph.edges.length}</b> connections</span><button onClick={detectNow}><Play size={13}/> Analyze graph</button></div></div>
            <div className="panel status-panel"><div className="panel-head"><div><div className="panel-title">System analysis</div><div className="panel-sub">Detection and safety checks</div></div><span className="live-tag"><span/> LIVE</span></div>
              <div className={`deadlock-callout ${detection?.deadlocked?'has-deadlock':''}`}>{detection?.deadlocked?<><div className="callout-icon warning"><TriangleAlert size={17}/></div><div><strong>Deadlock detected</strong><span>{detection.processes.join(' & ')} are waiting on each other</span></div></>:<><div className="callout-icon success"><Check size={17}/></div><div><strong>No deadlock detected</strong><span>The system can make progress</span></div></>}</div>
              {detection?.deadlocked && <div className="cycle-box"><div className="mini-label">WAIT-FOR CYCLE</div><div className="cycle-flow">{detection.processes.map((p,i)=><span key={p}>{i>0&&<ArrowRight size={13}/>}<b>{p}</b></span>)}<ArrowRight size={13}/><b>{detection.processes[0]}</b></div></div>}
              <div className="banker-card"><div className="banker-icon"><ShieldCheck size={17}/></div><div className="banker-copy"><strong>Banker’s safety check</strong><span>{data.bankers.safe?'State is safe':'State is unsafe'}</span></div><button className="text-btn" onClick={bankersNow}>Run check <ArrowRight size={14}/></button></div>
              <div className="safe-seq"><span>SAFE SEQUENCE</span>{data.bankers.safe&&data.bankers.sequence.length?<div>{data.bankers.sequence.map((p,i)=><span key={p}><b>{p}</b>{i<data.bankers.sequence.length-1&&<ArrowRight size={12}/>}</span>)}</div>:<em>{data.bankers.safe?'Run Banker’s Algorithm to find a sequence':'No safe sequence found'}</em>}</div>
              <button disabled={busy||!detection?.deadlocked} className="btn btn-primary recover-btn" onClick={showRecovery}><RotateCcw size={15}/> Compare recovery options <ArrowRight size={15}/></button>
            </div>
          </section>
          <section className="panel management-panel"><div className="panel-head management-head"><div><div className="panel-title">Process & resource manager</div><div className="panel-sub">Adjust allocations and watch the system respond</div></div><div className="manage-actions"><button className="btn btn-outline" onClick={()=>{setForm({...form,name:''});setModal('resource')}}><Plus size={15}/> Add resource</button><button className="btn btn-outline" onClick={()=>{setForm({...form,name:''});setModal('process')}}><Plus size={15}/> Add process</button><button className="btn btn-primary" onClick={()=>{setForm({...form,process:processes.find(p=>p.status!=='completed')?.id||'',resource:resources[0]?.id||''});setModal('transaction')}}><ArrowLeftRight size={15}/> Manage allocation</button></div></div>
            <div className="tables-wrap"><div className="table-section"><div className="table-label"><span className="table-dot proc-dot"/>PROCESSES <span className="count-chip">{processes.length}</span></div><table><thead><tr><th>PROCESS</th><th>STATUS</th><th>HOLDS</th><th>WAITING FOR</th></tr></thead><tbody>{processes.map(p=><ProcessRow key={p.id} p={p} state={state}/>)}</tbody></table></div><div className="table-section"><div className="table-label"><span className="table-dot res-dot"/>RESOURCES <span className="count-chip">{resources.length}</span></div><table><thead><tr><th>RESOURCE</th><th>INSTANCES</th><th>ALLOCATED</th><th>AVAILABLE</th></tr></thead><tbody>{resources.map(r=><tr key={r.id}><td><span className="resource-name"><i style={{background:colorFor(r.id)}}/> {r.name}</span></td><td>{r.total}</td><td>{r.total-r.available}</td><td><span className={`available ${r.available===0?'empty':''}`}>{r.available} free</span></td></tr>)}</tbody></table></div></div>
          </section>
          <div className="bottom-grid"><section className="panel recent-panel"><div className="panel-head"><div><div className="panel-title">Recent activity</div><div className="panel-sub">Latest events in this simulation</div></div><button className="text-btn" onClick={()=>setTab('history')}>View all <ArrowRight size={14}/></button></div><HistoryList history={data.history.slice(0,4)}/></section><section className="tip-card"><div className="tip-icon"><CircleHelp size={17}/></div><div className="eyebrow">QUICK CONCEPT</div><h3>What makes a deadlock?</h3><p>A cycle of processes each waiting for a resource held by the next. A cycle is necessary for deadlock, and with single-instance resources, it’s also sufficient.</p><button onClick={()=>setMessage('Try loading the example scenario, then compare the three recovery strategies.')}>Try the example <ArrowRight size={14}/></button></section></div>
        </>}
        {tab==='graph' && <section className="panel full-graph"><div className="panel-head"><div><div className="panel-title">Resource allocation graph</div><div className="panel-sub">Resources point to holders; processes point to requested resources.</div></div><button className="btn btn-outline" onClick={detectNow}><Play size={14}/> Run detection</button></div><Graph state={state} graph={graph} large/><div className="graph-legend"><span><i className="line allocation"/>Allocated</span><span><i className="line request"/>Requesting</span><span><i className="dot resource-dot"/>Resource</span></div></section>}
        {tab==='history' && <section className="panel history-page"><div className="panel-head"><div><div className="panel-title">Event history</div><div className="panel-sub">{data.history.length} most recent events</div></div><button disabled={busy||!data.history.length} className="btn btn-outline" onClick={()=>run(()=>api('/history',{method:'DELETE'}),'History cleared')}><Trash2 size={14}/> Clear history</button></div><HistoryList history={data.history} expanded/></section>}
        {algorithm && <section className="result-banner"><div className={algorithm.deadlocked||algorithm.safe===false?'result-icon warn':'result-icon'}>{algorithm.deadlocked||algorithm.safe===false?<TriangleAlert size={17}/>:<CircleCheck size={17}/>}</div><div><strong>{algorithm.deadlocked!==undefined?(algorithm.deadlocked?'Deadlock found':'System is clear'):algorithm.safe!==undefined?(algorithm.safe?'Safe state':'Unsafe state'):'Recovery result'}</strong><span>{algorithm.processes?.length?`Affected processes: ${algorithm.processes.join(', ')}`:algorithm.sequence?.length?`Safe sequence: ${algorithm.sequence.join(' → ')}`:algorithm.resolved!==undefined?(algorithm.resolved?`Resolved by terminating ${algorithm.victims.join(', ')}`:`Still deadlocked: ${algorithm.remainingDeadlock.join(', ')}`):'No additional details'}</span></div><button onClick={()=>setAlgorithm(null)}><X size={16}/></button></section>}
        <footer className="page-footer"><span><Waypoints size={14}/> Deadlock Lab</span><span>Explore safely. Every scenario is a sandbox.</span><span>React · Flask · SQLite</span></footer>
      </div>
    </main>
    {modal && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setModal('')}}><div className="modal" role="dialog" aria-modal="true"><div className="modal-head"><div><span className="eyebrow">SIMULATION CONTROL</span><h2>{modal==='process'?'Add a process':modal==='resource'?'Add a resource':modal==='transaction'?'Manage allocation':'Compare recovery strategies'}</h2></div><button className="icon-btn" onClick={()=>setModal('')}><X size={17}/></button></div>
      {(modal==='process'||modal==='resource')&&<form onSubmit={addEntity}><label>{modal==='process'?'Process ID':'Resource ID'}<input autoFocus placeholder={modal==='process'?'e.g. P4':'e.g. R4'} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>{modal==='resource'&&<label>Number of instances<input type="number" min="1" max="99" value={form.total} onChange={e=>setForm({...form,total:e.target.value})}/></label>}<div className="modal-actions"><button type="button" className="btn btn-quiet" onClick={()=>setModal('')}>Cancel</button><button disabled={busy} className="btn btn-primary"><Plus size={14}/> Add {modal}</button></div></form>}
      {modal==='transaction'&&<form onSubmit={transact}><label>Action<select value={form.action} onChange={e=>setForm({...form,action:e.target.value})}><option value="allocate">Allocate available units</option><option value="request">Request units (wait if busy)</option><option value="release">Release held units</option></select></label><div className="form-row"><label>Process<select value={form.process} onChange={e=>setForm({...form,process:e.target.value})}>{processes.filter(p=>p.status!=='completed').map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Resource<select value={form.resource} onChange={e=>setForm({...form,resource:e.target.value})}>{resources.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label></div><label>Units<input type="number" min="1" max="99" value={form.units} onChange={e=>setForm({...form,units:e.target.value})}/></label><div className="form-hint"><CircleHelp size={14}/> Requests that cannot be granted immediately remain pending.</div><div className="modal-actions"><button type="button" className="btn btn-quiet" onClick={()=>setModal('')}>Cancel</button><button disabled={busy||!processes.some(p=>p.status!=='completed')||!resources.length} className="btn btn-primary"><ArrowRight size={14}/> Apply action</button></div></form>}
      {modal==='recovery'&&<div className="recovery-options"><p className="modal-intro">Preview the consequences first, then choose a strategy to apply to the current simulation.</p>{['victim','stepwise','all'].map(strategy=>{const item=preview?.[strategy];return <div className="strategy-card" key={strategy}><div className={`strategy-icon ${item?.resolved?'ok':''}`}>{item?.resolved?<Check size={16}/>:<RotateCcw size={16}/>}</div><div className="strategy-main"><div className="strategy-name">{strategy==='victim'?'Terminate one victim':strategy==='stepwise'?'Terminate step by step':'Terminate all deadlocked'}</div><div className="strategy-desc">{strategy==='victim'?'Choose the process holding the fewest instances and release its resources.':strategy==='stepwise'?'Terminate victims one at a time, rechecking after each.':'Stop every process in the detected deadlock.'}</div><div className="strategy-meta"><span>{item?.victims.length||0} victim{item?.victims.length===1?'':'s'}</span><span className={item?.resolved?'resolved':'unresolved'}>{item?.resolved?'Resolves deadlock':'Deadlock remains'}</span>{item?.victims.length>0&&<span>{item.victims.join(', ')}</span>}</div></div><button disabled={busy||!item?.victims.length} className="btn btn-outline" onClick={()=>recover(strategy)}>Apply <ArrowRight size={13}/></button></div>})}<button className="btn btn-quiet modal-close" onClick={()=>setModal('')}>Close preview</button></div>}
    </div></div>}
  </div>
}

function Stat({icon,label,value,sub,color,status}) { return <div className="stat-card"><div className={`stat-icon ${color}`}>{icon}</div><div className="stat-label">{label}</div><div className={`stat-value ${status&&color==='red'?'danger-text':''}`}>{value}</div><div className="stat-sub">{status&&<span className={`status-dot ${color}`} />}{sub}</div></div> }
function ProcessRow({p,state}) { const holdings=Object.entries(state.allocations[p.id]||{}).filter(([,n])=>n>0);const waiting=Object.entries(state.requests[p.id]||{}).filter(([,n])=>n>0);return <tr><td><span className="process-avatar" style={{'--person-color':colorFor(p.id)}}>{p.id}</span><b className="process-name">{p.name}</b></td><td><span className={`status-tag ${p.status}`}>{p.status==='running'?'Running':p.status==='completed'?'Completed':'Waiting'}</span></td><td>{holdings.length?holdings.map(([id,n])=><span className="matrix-chip" key={id}>{id}<b>×{n}</b></span>):<span className="muted">—</span>}</td><td>{waiting.length?waiting.map(([id,n])=><span className="matrix-chip waiting-chip" key={id}>{id}<b>×{n}</b></span>):<span className="muted">—</span>}</td></tr> }
function HistoryList({history,expanded=false}) { if(!history?.length)return <div className="empty-state"><Clock3 size={19}/><span>No events yet. Try changing an allocation or running a check.</span></div>;return <div className={`history-list ${expanded?'expanded':''}`}>{history.map(e=><div className="history-item" key={e.id}><div className={`history-icon ${e.kind}`}>{e.kind==='detection'?<CircleAlert size={15}/>:e.kind==='recovery'?<RotateCcw size={15}/>:e.kind==='bankers'?<ShieldCheck size={15}/>:e.kind==='allocate'||e.kind==='request'||e.kind==='release'?<ArrowLeftRight size={15}/>:<Activity size={15}/>}</div><div className="history-copy"><strong>{e.message}</strong>{expanded&&<span>{e.kind} {e.details&&Object.keys(e.details).length?`· ${JSON.stringify(e.details)}`:''}</span>}</div><time>{new Date(e.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</time></div>)}</div> }

function Graph({state,graph,large=false}) {
  const width=large?1050:650,height=large?470:300
  const processes=state.processes,resources=state.resources
  const pNodes=processes.map((p,i)=>({ ...p, x: width*.21, y: height*(i+1)/(processes.length+1), type:'process' }))
  const rNodes=resources.map((r,i)=>({ ...r, x: width*.78, y: height*(i+1)/(resources.length+1), type:'resource' }))
  const nodes=[...pNodes,...rNodes],byId=Object.fromEntries(nodes.map(n=>[n.id,n]))
  const edges=graph.edges.map((e,i)=>({ ...e, from:byId[e.from], to:byId[e.to], i })).filter(e=>e.from&&e.to)
  const scale=large?1.08:.74
  return <div className={`graph-canvas ${large?'large':''}`}><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Resource allocation graph"><defs><marker id="arrow-allocation" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#478b8a"/></marker><marker id="arrow-request" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#e17f5d"/></marker></defs>
    <text className="graph-column-label" x={pNodes[0]?.x||width*.21} y="23" textAnchor="middle">PROCESSES</text><text className="graph-column-label" x={rNodes[0]?.x||width*.78} y="23" textAnchor="middle">RESOURCES</text>
    {edges.map(e=>{const start=e.from,end=e.to;const dx=end.x-start.x,dy=end.y-start.y,offset=(e.i%3-1)*8;const sx=start.x+(start.type==='process'?25:-24),ex=end.x+(end.type==='process'?-25:24);return <g key={e.from.id+e.to.id+e.type}><path className={`graph-edge ${e.type}`} d={`M ${sx} ${start.y+offset} C ${sx+dx*.48} ${start.y+offset}, ${ex-dx*.48} ${end.y+offset}, ${ex} ${end.y+offset}`} markerEnd={`url(#arrow-${e.type})`}/><text className="edge-units" x={(sx+ex)/2} y={(start.y+end.y)/2+offset-5}>×{e.units}</text></g>})}
    {pNodes.map(p=><g key={p.id} className="graph-node process-node"><circle cx={p.x} cy={p.y} r={24*scale} fill={colorFor(p.id)}/><text x={p.x} y={p.y+4*scale} textAnchor="middle">{p.name}</text><text className="node-sub" x={p.x} y={p.y+40*scale} textAnchor="middle">{p.status}</text></g>)}
    {rNodes.map(r=><g key={r.id} className="graph-node resource-node"><rect x={r.x-32*scale} y={r.y-27*scale} width={64*scale} height={54*scale} rx="10" fill="#f0f4f3" stroke="#cddbd8"/><text x={r.x} y={r.y-2*scale} textAnchor="middle">{r.name}</text><text className="node-sub" x={r.x} y={r.y+13*scale} textAnchor="middle">{r.available}/{r.total} free</text><g>{Array.from({length:Math.min(r.total,7)},(_,i)=><circle key={i} cx={r.x-10*scale+i*8*scale-(Math.min(r.total,7)-1)*4*scale} cy={r.y-34*scale} r={2.6*scale} fill={i<r.total-r.available?colorFor(r.id):'#d5dedc'}/>)}</g></g>)}
  </svg>{!edges.length&&<div className="graph-empty">No allocations or requests yet. Use <b>Manage allocation</b> to add a connection.</div>}</div>
}

export default App
