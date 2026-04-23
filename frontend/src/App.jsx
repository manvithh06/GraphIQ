import { useState, useEffect, useRef, useCallback } from "react";

const API = "https://graphiq-0sd7.onrender.com";

const TYPE_META = {
  person:       { color: "#a78bfa", glyph: "PE" },
  organization: { color: "#00f5d4", glyph: "OR" },
  location:     { color: "#34d399", glyph: "LO" },
  date:         { color: "#fbbf24", glyph: "DT" },
  event:        { color: "#f87171", glyph: "EV" },
  financial:    { color: "#60a5fa", glyph: "FI" },
  document:     { color: "#fb923c", glyph: "DO" },
  other:        { color: "#94a3b8", glyph: "OT" },
};

function getMeta(type) { return TYPE_META[type] || TYPE_META.other; }

function initPositions(nodes, w, h) {
  const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.38;
  return nodes.map((n, i) => {
    const angle = (i / nodes.length) * 2 * Math.PI;
    return { ...n, x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle), vx: 0, vy: 0, visible: false };
  });
}

function tick(nodes, edges, w, h) {
  const REPULSE = 7000, SPRING_K = 0.025, REST = 180, DAMP = 0.78, GRAVITY = 0.012;
  const cx = w / 2, cy = h / 2;
  const next = nodes.map(n => ({ ...n, fx: 0, fy: 0 }));
  for (let i = 0; i < next.length; i++) {
    if (!next[i].visible) continue;
    for (let j = i + 1; j < next.length; j++) {
      if (!next[j].visible) continue;
      const dx = next[j].x - next[i].x || 0.1;
      const dy = next[j].y - next[i].y || 0.1;
      const d2 = dx * dx + dy * dy;
      const d = Math.sqrt(d2) || 1;
      const f = REPULSE / d2;
      next[i].fx -= (dx / d) * f; next[i].fy -= (dy / d) * f;
      next[j].fx += (dx / d) * f; next[j].fy += (dy / d) * f;
    }
  }
  edges.forEach(e => {
    const a = next.find(n => n.id === e.source && n.visible);
    const b = next.find(n => n.id === e.target && n.visible);
    if (!a || !b) return;
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const f = SPRING_K * (d - REST);
    a.fx += (dx / d) * f; a.fy += (dy / d) * f;
    b.fx -= (dx / d) * f; b.fy -= (dy / d) * f;
  });
  return next.map(n => {
    if (n.pinned || !n.visible) return n;
    let vx = (n.vx + n.fx) * DAMP + (cx - n.x) * GRAVITY;
    let vy = (n.vy + n.fy) * DAMP + (cy - n.y) * GRAVITY;
    const speed = Math.sqrt(vx * vx + vy * vy);
    if (speed > 6) { vx = (vx / speed) * 6; vy = (vy / speed) * 6; }
    return { ...n, vx, vy, x: Math.max(60, Math.min(w - 60, n.x + vx)), y: Math.max(60, Math.min(h - 60, n.y + vy)) };
  });
}

export default function App() {
  const [tab, setTab]               = useState("graph");
  const [allNodes, setAllNodes]     = useState([]);
  const [nodes, setNodes]           = useState([]);
  const [edges, setEdges]           = useState([]);
  const [visibleEdges, setVisibleEdges] = useState([]);
  const [selected, setSelected]     = useState(null);
  const [query, setQuery]           = useState("");
  const [answer, setAnswer]         = useState("");
  const [loading, setLoading]       = useState(false);
  const [health, setHealth]         = useState({});
  const [pulsing, setPulsing]       = useState(new Set());
  const [svgSize, setSvgSize]       = useState({ w: 700, h: 500 });
  const [uploading, setUploading]   = useState(false);
  const [uploadMsg, setUploadMsg]   = useState("");
  const [sources, setSources]       = useState([]);
  const [deleting, setDeleting]     = useState(null);
  const [confirm, setConfirm]       = useState(null);
  const [isPlaying, setIsPlaying]   = useState(false);
  const [revealIdx, setRevealIdx]   = useState(0);
  const [speed, setSpeed]           = useState(800);

  const nodesRef    = useRef([]);
  const animRef     = useRef(null);
  const svgRef      = useRef(null);
  const wrapRef     = useRef(null);
  const dragId      = useRef(null);
  const frameRef    = useRef(0);
  const revealTimer = useRef(null);

  const fetchGraph = useCallback(async () => {
    try {
      const res  = await fetch(`${API}/graph`);
      const data = await res.json();
      const positioned = initPositions(data.nodes || [], svgSize.w, svgSize.h);
      setAllNodes(positioned);
      nodesRef.current = positioned.map(n => ({ ...n, visible: false }));
      setNodes([]);
      setEdges(data.edges || []);
      setVisibleEdges([]);
      setRevealIdx(0);
      setIsPlaying(false);
    } catch (e) { console.error(e); }
  }, [svgSize.w, svgSize.h]);

  const fetchSources = async () => {
    try {
      const res  = await fetch(`${API}/sources`);
      const data = await res.json();
      setSources(data.sources || []);
    } catch {}
  };

  useEffect(() => {
    fetch(`${API}/health`).then(r => r.json()).then(setHealth).catch(() => {});
    fetchGraph();
    fetchSources();
  }, []);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([e]) => {
      setSvgSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  // Physics loop — only runs on visible nodes
  useEffect(() => {
    const loop = () => {
      nodesRef.current = tick(nodesRef.current, edges, svgSize.w, svgSize.h);
      if (++frameRef.current % 2 === 0) {
        setNodes([...nodesRef.current.filter(n => n.visible)]);
      }
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [edges, svgSize]);

  // Sequential node reveal — like a video
  useEffect(() => {
    if (!isPlaying) return;
    if (revealIdx >= allNodes.length) {
      setIsPlaying(false);
      // Reveal all edges after all nodes are shown
      setVisibleEdges([...edges]);
      return;
    }
    revealTimer.current = setTimeout(() => {
      const nodeId = allNodes[revealIdx].id;
      nodesRef.current = nodesRef.current.map(n =>
        n.id === nodeId ? { ...n, visible: true } : n
      );
      // Reveal edges connected to this node if both endpoints are visible
      const visibleIds = new Set(nodesRef.current.filter(n => n.visible).map(n => n.id));
      setVisibleEdges(edges.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target)));
      setRevealIdx(i => i + 1);
    }, speed);
    return () => clearTimeout(revealTimer.current);
  }, [isPlaying, revealIdx, allNodes, edges, speed]);

  const handlePlay = () => {
    // Reset and replay
    nodesRef.current = allNodes.map(n => ({ ...n, visible: false }));
    setNodes([]);
    setVisibleEdges([]);
    setRevealIdx(0);
    setIsPlaying(true);
  };

  const handleShowAll = () => {
    setIsPlaying(false);
    clearTimeout(revealTimer.current);
    nodesRef.current = allNodes.map(n => ({ ...n, visible: true }));
    setRevealIdx(allNodes.length);
    setVisibleEdges([...edges]);
  };

  const handleReset = () => {
    setIsPlaying(false);
    clearTimeout(revealTimer.current);
    nodesRef.current = allNodes.map(n => ({ ...n, visible: false }));
    setNodes([]);
    setVisibleEdges([]);
    setRevealIdx(0);
  };

  const onMouseDown = useCallback((e, id) => {
    e.preventDefault(); e.stopPropagation();
    dragId.current = id;
    nodesRef.current = nodesRef.current.map(n => n.id === id ? { ...n, pinned: true } : n);
    setSelected(id === selected ? null : id);
  }, [selected]);

  const onMouseMove = useCallback((e) => {
    if (!dragId.current || !svgRef.current) return;
    const r = svgRef.current.getBoundingClientRect();
    nodesRef.current = nodesRef.current.map(n =>
      n.id === dragId.current ? { ...n, x: e.clientX - r.left, y: e.clientY - r.top, vx: 0, vy: 0 } : n
    );
  }, []);

  const onMouseUp = useCallback(() => {
    if (dragId.current) {
      nodesRef.current = nodesRef.current.map(n =>
        n.id === dragId.current ? { ...n, pinned: false } : n
      );
      dragId.current = null;
    }
  }, []);

  const handleQuery = async () => {
    if (!query.trim() || loading) return;
    setLoading(true); setAnswer("");
    try {
      const res  = await fetch(`${API}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (data.answer) {
        setAnswer(data.answer);
        const mentioned = nodes
          .filter(n => data.answer.toLowerCase().includes(n.label.toLowerCase()))
          .map(n => n.id);
        if (mentioned.length) {
          setPulsing(new Set(mentioned));
          setTimeout(() => setPulsing(new Set()), 5000);
        }
      } else {
        setAnswer(data.detail || "No response.");
      }
    } catch { setAnswer("Connection error — is the API server running?"); }
    setLoading(false);
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true); setUploadMsg("");
    const form = new FormData();
    form.append("file", file);
    try {
      const res  = await fetch(`${API}/ingest`, { method: "POST", body: form });
      const data = await res.json();
      setUploadMsg(`✓ ${data.message} — ${data.entities_found} entities, ${data.relations_found} relations`);
      fetchGraph(); fetchSources();
    } catch { setUploadMsg("Upload failed — check the API server."); }
    setUploading(false);
    e.target.value = "";
  };

  const handleDelete = async (source) => {
    setDeleting(source); setConfirm(null);
    try {
      const res  = await fetch(`${API}/delete`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      });
      const data = await res.json();
      setUploadMsg(source === "ALL" ? "✓ Entire graph cleared" : `✓ ${data.message}`);
      fetchGraph(); fetchSources();
    } catch { setUploadMsg("Delete failed."); }
    setDeleting(null);
  };

  const selectedNode = nodes.find(n => n.id === selected);
  const progress     = allNodes.length ? Math.round((revealIdx / allNodes.length) * 100) : 0;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=JetBrains+Mono:wght@300;400;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        body{overflow:hidden;background:#020818}
        ::-webkit-scrollbar{width:3px;background:transparent}
        ::-webkit-scrollbar-thumb{background:#00f5d430;border-radius:2px}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        @keyframes ring{0%{r:18px;opacity:0.7}100%{r:32px;opacity:0}}
        @keyframes fadeup{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes scan{0%{top:-2px}100%{top:100%}}
        @keyframes nodeIn{from{opacity:0;transform:scale(0.3)}to{opacity:1;transform:scale(1)}}
        @keyframes edgeIn{from{opacity:0}to{opacity:1}}
        .giq-root{font-family:'JetBrains Mono',monospace;background:#020818;color:#c8daea;height:100vh;display:flex;flex-direction:column;overflow:hidden;position:relative}
        .giq-root::before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,245,212,0.008) 3px,rgba(0,245,212,0.008) 4px);pointer-events:none;z-index:100}
        .scan{position:absolute;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,rgba(0,245,212,0.12),transparent);animation:scan 8s linear infinite;pointer-events:none;z-index:99}
        .header{background:linear-gradient(90deg,#030d22,#04112a);border-bottom:1px solid rgba(0,245,212,0.15);height:52px;display:flex;align-items:center;justify-content:space-between;padding:0 20px;flex-shrink:0;position:relative;z-index:10}
        .logo{font-family:'Orbitron',sans-serif;font-size:20px;font-weight:900;letter-spacing:3px;background:linear-gradient(90deg,#00f5d4,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
        .nav-btn{background:none;border:none;cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:2px;padding:4px 0;border-bottom:1px solid transparent;transition:all 0.2s}
        .nav-btn.active{color:#00f5d4;border-bottom-color:#00f5d4}
        .nav-btn.inactive{color:#3a5570}
        .nav-btn:hover{color:#00f5d4}
        .dot{width:5px;height:5px;border-radius:50%;background:#34d399;animation:pulse 1.8s infinite}
        .layout{flex:1;display:flex;overflow:hidden}
        .sidebar{width:210px;flex-shrink:0;background:#03091c;border-right:1px solid rgba(0,245,212,0.07);padding:14px 12px;display:flex;flex-direction:column;gap:14px;overflow-y:auto}
        .sec-title{font-size:8px;letter-spacing:3px;color:#00f5d4;opacity:0.6;margin-bottom:8px}
        .metric{display:flex;justify-content:space-between;align-items:center;padding:5px 8px;margin-bottom:3px;background:rgba(255,255,255,0.015);border-left:2px solid;border-radius:0 3px 3px 0}
        .metric-label{font-size:9px;color:#4a6278}
        .metric-val{font-size:13px;font-weight:600}
        .legend-item{display:flex;align-items:center;gap:8px;margin-bottom:5px}
        .legend-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
        .main{flex:1;display:flex;flex-direction:column;overflow:hidden}
        .graph-wrap{flex:1;position:relative;overflow:hidden}
        .grid-svg{position:absolute;inset:0;width:100%;height:100%;opacity:0.08}
        .panel{flex:1;padding:18px 20px;overflow-y:auto;animation:fadeup 0.3s ease}
        .right{width:300px;flex-shrink:0;background:#03091c;border-left:1px solid rgba(0,245,212,0.07);display:flex;flex-direction:column;padding:14px;gap:10px}
        .query-box{width:100%;height:72px;background:rgba(0,245,212,0.04);border:1px solid rgba(0,245,212,0.2);border-radius:5px;color:#c8daea;font-family:'JetBrains Mono',monospace;font-size:11px;padding:10px;resize:none;outline:none;line-height:1.6}
        .query-box:focus{border-color:rgba(0,245,212,0.4)}
        .query-box::placeholder{color:#2a4058}
        .exec-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:9px 0;border-radius:5px;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:2px;cursor:pointer;border:1px solid rgba(0,245,212,0.3);background:linear-gradient(135deg,rgba(0,245,212,0.1),rgba(167,139,250,0.1));color:#00f5d4;transition:all 0.2s}
        .exec-btn:hover:not(:disabled){background:linear-gradient(135deg,rgba(0,245,212,0.18),rgba(167,139,250,0.18))}
        .exec-btn:disabled{opacity:0.4;cursor:not-allowed}
        .spinner{width:12px;height:12px;border:2px solid rgba(0,245,212,0.2);border-top-color:#00f5d4;border-radius:50%;animation:spin 0.7s linear infinite}
        .answer-box{background:rgba(0,245,212,0.03);border:1px solid rgba(0,245,212,0.12);border-radius:5px;padding:12px;font-size:11px;line-height:1.8;color:#9ab8cc;white-space:pre-wrap;overflow-y:auto;flex:1;animation:fadeup 0.3s ease}
        .answer-box strong{color:#00f5d4;font-weight:600}
        .node-card{position:absolute;bottom:60px;left:14px;background:rgba(2,8,24,0.96);border-radius:6px;padding:10px 14px;min-width:180px;animation:fadeup 0.2s ease;z-index:10}
        .status-bar{height:26px;background:#010610;border-top:1px solid rgba(0,245,212,0.07);display:flex;align-items:center;padding:0 18px;gap:20px;flex-shrink:0}
        .st-key{font-size:8px;color:#253040;letter-spacing:1px}
        .st-val{font-size:8px;letter-spacing:1px}
        .entity-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px}
        .entity-card{background:rgba(255,255,255,0.018);border-radius:6px;padding:12px;border-left:3px solid;cursor:pointer;transition:transform 0.15s,background 0.15s}
        .entity-card:hover{transform:translateY(-2px);background:rgba(255,255,255,0.03)}
        .upload-zone{border:1px dashed rgba(0,245,212,0.2);border-radius:6px;padding:16px;text-align:center;cursor:pointer;transition:all 0.2s;display:block}
        .upload-zone:hover{border-color:rgba(0,245,212,0.4);background:rgba(0,245,212,0.03)}
        .upload-input{display:none}
        .rel-chip{display:inline-block;font-size:8px;padding:2px 6px;border-radius:2px;border:1px solid;margin:2px}
        .file-row{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:rgba(255,255,255,0.018);border:1px solid rgba(0,245,212,0.08);border-radius:5px;margin-bottom:6px;gap:8px}
        .del-btn{font-size:9px;padding:3px 8px;border-radius:3px;border:1px solid rgba(241,87,87,0.3);background:rgba(241,87,87,0.08);color:#f15757;cursor:pointer;font-family:'JetBrains Mono',monospace;letter-spacing:1px;transition:all 0.15s;white-space:nowrap;flex-shrink:0}
        .del-btn:hover{background:rgba(241,87,87,0.18)}
        .del-btn:disabled{opacity:0.4;cursor:not-allowed}
        .clear-all-btn{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:8px 0;border-radius:5px;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:2px;cursor:pointer;border:1px solid rgba(241,87,87,0.3);background:rgba(241,87,87,0.06);color:#f15757;transition:all 0.2s;margin-top:6px}
        .clear-all-btn:hover{background:rgba(241,87,87,0.14)}
        .clear-all-btn:disabled{opacity:0.4;cursor:not-allowed}
        .confirm-box{background:rgba(241,87,57,0.08);border:1px solid rgba(241,87,57,0.25);border-radius:5px;padding:12px;margin-top:8px}
        .confirm-yes{padding:4px 12px;border-radius:3px;border:1px solid rgba(241,87,87,0.4);background:rgba(241,87,87,0.15);color:#f15757;cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:1px}
        .confirm-no{padding:4px 12px;border-radius:3px;border:1px solid rgba(0,245,212,0.2);background:rgba(0,245,212,0.06);color:#00f5d4;cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:1px}
        .ctrl-btn{font-family:'JetBrains Mono',monospace;font-size:9px;letter-spacing:1px;padding:5px 12px;border-radius:4px;cursor:pointer;transition:all 0.15s;border:1px solid}
        .ctrl-btn:disabled{opacity:0.35;cursor:not-allowed}
        .rel-table{width:100%;border-collapse:collapse;font-size:10px}
        .rel-table th{font-size:8px;letter-spacing:2px;color:#00f5d4;opacity:0.6;padding:6px 8px;text-align:left;border-bottom:1px solid rgba(0,245,212,0.1);font-weight:400}
        .rel-table td{padding:7px 8px;border-bottom:1px solid rgba(255,255,255,0.04);vertical-align:middle;color:#9ab8cc}
        .rel-table tr:hover td{background:rgba(0,245,212,0.04)}
        .rel-table tr:last-child td{border-bottom:none}
        .node-pill{display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:10px;font-size:9px;font-weight:600;border:1px solid}
        .rel-badge{display:inline-block;padding:2px 7px;border-radius:3px;font-size:9px;background:rgba(167,139,250,0.1);border:1px solid rgba(167,139,250,0.25);color:#a78bfa;letter-spacing:0.5px}
        .node-reveal-tag{position:absolute;top:10px;left:50%;transform:translateX(-50%);background:rgba(2,8,24,0.9);border:1px solid rgba(0,245,212,0.2);border-radius:4px;padding:3px 10px;font-size:9px;color:#00f5d4;letter-spacing:1px;pointer-events:none;z-index:20}
      `}</style>

      <div className="giq-root">
        <div className="scan" />

        {/* Header */}
        <header className="header">
          <div style={{ display:"flex", alignItems:"center", gap:14 }}>
            <svg width="28" height="28" viewBox="0 0 28 28">
              <circle cx="14" cy="14" r="12" fill="none" stroke="#00f5d4" strokeWidth="0.8" opacity="0.2"/>
              <circle cx="14" cy="14" r="4" fill="#00f5d4" opacity="0.9"/>
              <circle cx="4" cy="9"  r="2.5" fill="#a78bfa"/>
              <circle cx="24" cy="9"  r="2.5" fill="#fbbf24"/>
              <circle cx="4" cy="19" r="2.5" fill="#34d399"/>
              <circle cx="24" cy="19" r="2.5" fill="#f87171"/>
              <line x1="14" y1="10" x2="6"  y2="10" stroke="#00f5d4" strokeWidth="0.7" opacity="0.5"/>
              <line x1="14" y1="10" x2="22" y2="10" stroke="#00f5d4" strokeWidth="0.7" opacity="0.5"/>
              <line x1="14" y1="18" x2="6"  y2="18" stroke="#00f5d4" strokeWidth="0.7" opacity="0.5"/>
              <line x1="14" y1="18" x2="22" y2="18" stroke="#00f5d4" strokeWidth="0.7" opacity="0.5"/>
            </svg>
            <span className="logo">GRAPHIQ</span>
            <span style={{ fontSize:8, color:"#1e3048", letterSpacing:3 }}>AI KNOWLEDGE GRAPH</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:18 }}>
            {["graph","relations","entities","ingest"].map(t => (
              <button key={t} className={`nav-btn ${tab===t?"active":"inactive"}`}
                onClick={() => { setTab(t); if(t==="ingest") fetchSources(); }}>
                {t.toUpperCase()}
              </button>
            ))}
            <div style={{ display:"flex", alignItems:"center", gap:6, padding:"3px 10px",
              background:"rgba(52,211,153,0.08)", border:"1px solid rgba(52,211,153,0.3)",
              borderRadius:3, fontSize:9, letterSpacing:2, color:"#34d399" }}>
              <div className="dot"/> LIVE
            </div>
          </div>
        </header>

        <div className="layout">

          {/* Sidebar */}
          <aside className="sidebar">
            <div>
              <div className="sec-title">▸ GRAPH METRICS</div>
              {[
                { label:"Total nodes", val:allNodes.length,  color:"#00f5d4" },
                { label:"Visible",     val:nodes.length,     color:"#34d399" },
                { label:"Edges",       val:edges.length,     color:"#a78bfa" },
                { label:"Files",       val:sources.length,   color:"#fbbf24" },
                { label:"API",   val:health.api==="ok"?"online":"offline",   color:health.api==="ok"?"#34d399":"#f87171" },
                { label:"Neo4j", val:health.neo4j==="ok"?"online":"offline", color:health.neo4j==="ok"?"#34d399":"#f87171" },
              ].map(m => (
                <div className="metric" key={m.label} style={{ borderLeftColor:m.color }}>
                  <span className="metric-label">{m.label}</span>
                  <span className="metric-val" style={{ color:m.color }}>{m.val}</span>
                </div>
              ))}
            </div>

            <div>
              <div className="sec-title">▸ ENTITY TYPES</div>
              {Object.entries(TYPE_META).map(([type, meta]) => {
                const count = allNodes.filter(n => n.type === type).length;
                if (!count) return null;
                return (
                  <div className="legend-item" key={type}>
                    <div className="legend-dot" style={{ background:meta.color, boxShadow:`0 0 5px ${meta.color}80` }}/>
                    <span style={{ fontSize:9, color:"#4a6278", textTransform:"uppercase", letterSpacing:1 }}>{type}</span>
                    <span style={{ fontSize:9, color:meta.color, marginLeft:"auto" }}>{count}</span>
                  </div>
                );
              })}
            </div>

            <div>
              <div className="sec-title">▸ QUICK ACTIONS</div>
              <button className="del-btn" style={{ width:"100%", marginBottom:4, textAlign:"center", color:"#00f5d4", borderColor:"rgba(0,245,212,0.3)", background:"rgba(0,245,212,0.06)" }}
                onClick={() => { fetchGraph(); fetchSources(); }}>↺ REFRESH</button>
              <button className="del-btn" style={{ width:"100%", textAlign:"center", color:"#a78bfa", borderColor:"rgba(167,139,250,0.3)", background:"rgba(167,139,250,0.06)" }}
                onClick={() => setTab("ingest")}>+ INGEST DOC</button>
            </div>
          </aside>

          <main className="main">

            {/* ── GRAPH TAB ── */}
            {tab === "graph" && (
              <div style={{ display:"flex", flexDirection:"column", flex:1, overflow:"hidden" }}>

                {/* Playback controls bar */}
                <div style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 14px",
                  background:"rgba(3,9,28,0.95)", borderBottom:"1px solid rgba(0,245,212,0.08)",
                  flexShrink:0 }}>

                  <button className="ctrl-btn"
                    style={{ background:"rgba(0,245,212,0.1)", borderColor:"rgba(0,245,212,0.3)", color:"#00f5d4" }}
                    onClick={handlePlay} disabled={isPlaying || allNodes.length === 0}>
                    ▶ PLAY
                  </button>

                  <button className="ctrl-btn"
                    style={{ background:"rgba(251,191,36,0.08)", borderColor:"rgba(251,191,36,0.25)", color:"#fbbf24" }}
                    onClick={() => setIsPlaying(false)} disabled={!isPlaying}>
                    ⏸ PAUSE
                  </button>

                  <button className="ctrl-btn"
                    style={{ background:"rgba(167,139,250,0.08)", borderColor:"rgba(167,139,250,0.25)", color:"#a78bfa" }}
                    onClick={handleShowAll} disabled={allNodes.length === 0}>
                    ⏭ SHOW ALL
                  </button>

                  <button className="ctrl-btn"
                    style={{ background:"rgba(241,87,87,0.06)", borderColor:"rgba(241,87,87,0.25)", color:"#f87171" }}
                    onClick={handleReset} disabled={allNodes.length === 0}>
                    ↺ RESET
                  </button>

                  {/* Speed slider */}
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginLeft:8 }}>
                    <span style={{ fontSize:8, color:"#3a5268", letterSpacing:1 }}>SPEED</span>
                    <input type="range" min="200" max="2000" step="100"
                      value={2200 - speed}
                      onChange={e => setSpeed(2200 - Number(e.target.value))}
                      style={{ width:80 }}/>
                    <span style={{ fontSize:8, color:"#00f5d4", minWidth:30 }}>
                      {speed < 400 ? "FAST" : speed < 900 ? "MED" : "SLOW"}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div style={{ flex:1, height:4, background:"rgba(255,255,255,0.05)",
                    borderRadius:2, overflow:"hidden", marginLeft:4 }}>
                    <div style={{ height:"100%", width:`${progress}%`,
                      background:"linear-gradient(90deg,#00f5d4,#a78bfa)",
                      borderRadius:2, transition:"width 0.3s ease" }}/>
                  </div>
                  <span style={{ fontSize:9, color:"#3a5268", minWidth:40 }}>
                    {nodes.length}/{allNodes.length}
                  </span>
                </div>

                {/* Graph canvas */}
                <div ref={wrapRef} className="graph-wrap"
                  onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>

                  <svg className="grid-svg">
                    <defs>
                      <pattern id="g40" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M40 0L0 0 0 40" fill="none" stroke="#0f2040" strokeWidth="0.5"/>
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#g40)"/>
                  </svg>

                  {/* Reveal tag */}
                  {isPlaying && revealIdx > 0 && revealIdx <= allNodes.length && (
                    <div className="node-reveal-tag">
                      MAPPING: {allNodes[revealIdx - 1]?.label}
                    </div>
                  )}

                  <svg ref={svgRef} style={{ width:"100%", height:"100%", cursor:"crosshair" }}>
                    <defs>
                      <marker id="arr" viewBox="0 0 10 10" refX="24" refY="3"
                        markerWidth="5" markerHeight="5" orient="auto">
                        <path d="M0 0L10 3L0 6z" fill="rgba(0,245,212,0.4)"/>
                      </marker>
                    </defs>

                    {/* Edges */}
                    {visibleEdges.map((e, i) => {
                      const s = nodes.find(n => n.id === e.source);
                      const t = nodes.find(n => n.id === e.target);
                      if (!s || !t) return null;
                      const active = selected === s.id || selected === t.id;
                      const mx = (s.x + t.x) / 2, my = (s.y + t.y) / 2;
                      return (
                        <g key={i} style={{ animation:"edgeIn 0.4s ease" }}>
                          <line x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                            stroke={active ? "rgba(0,245,212,0.75)" : "rgba(0,245,212,0.2)"}
                            strokeWidth={active ? 2 : 1}
                            markerEnd="url(#arr)"/>
                          {active && (
                            <g>
                              <rect x={mx-(e.label.length*3.2)-4} y={my-14}
                                width={e.label.length*6.4+8} height={14}
                                fill="rgba(2,8,24,0.92)" rx="3"/>
                              <text x={mx} y={my-4} textAnchor="middle"
                                fill="#00f5d4" fontSize="9"
                                fontFamily="JetBrains Mono" fontWeight="600">
                                {e.label}
                              </text>
                            </g>
                          )}
                        </g>
                      );
                    })}

                    {/* Nodes */}
                    {nodes.map(n => {
                      const meta    = getMeta(n.type);
                      const isSel   = selected === n.id;
                      const isPulse = pulsing.has(n.id);
                      const r       = isSel ? 18 : 14;
                      const labelW  = n.label.length * 6.2 + 10;
                      return (
                        <g key={n.id} style={{ cursor:"pointer", animation:"nodeIn 0.5s ease" }}
                          onMouseDown={e => onMouseDown(e, n.id)}>
                          {isPulse && (
                            <circle cx={n.x} cy={n.y} r={r+8} fill="none"
                              stroke={meta.color} strokeWidth="1.5" opacity="0"
                              style={{ animation:"ring 1.5s ease-out infinite" }}/>
                          )}
                          {isSel && (
                            <circle cx={n.x} cy={n.y} r={r+12} fill="none"
                              stroke={meta.color} strokeWidth="1" opacity="0.2"
                              style={{ animation:"pulse 2s ease-in-out infinite" }}/>
                          )}
                          {isSel && (
                            <circle cx={n.x} cy={n.y} r={r+4}
                              fill={`${meta.color}15`} stroke="none"/>
                          )}
                          <circle cx={n.x} cy={n.y} r={r}
                            fill={`${meta.color}22`}
                            stroke={meta.color}
                            strokeWidth={isSel ? 2.5 : 1.2}/>
                          <text x={n.x} y={n.y+1} textAnchor="middle"
                            dominantBaseline="central"
                            fill={isSel ? meta.color : "rgba(255,255,255,0.85)"}
                            fontSize={isSel ? 9 : 8}
                            fontFamily="JetBrains Mono" fontWeight="700"
                            style={{ pointerEvents:"none", userSelect:"none" }}>
                            {meta.glyph}
                          </text>
                          <rect x={n.x-labelW/2} y={n.y+r+4} width={labelW} height={15}
                            fill="rgba(2,8,24,0.88)"
                            stroke={isSel ? `${meta.color}60` : "rgba(0,245,212,0.12)"}
                            strokeWidth="0.5" rx="3"
                            style={{ pointerEvents:"none" }}/>
                          <text x={n.x} y={n.y+r+14} textAnchor="middle"
                            fill={isSel ? meta.color : "#c8daea"}
                            fontSize={isSel ? 10 : 9}
                            fontFamily="JetBrains Mono"
                            fontWeight={isSel ? "600" : "500"}
                            style={{ pointerEvents:"none", userSelect:"none" }}>
                            {n.label}
                          </text>
                        </g>
                      );
                    })}
                  </svg>

                  {/* Node info card */}
                  {selectedNode && (() => {
                    const meta  = getMeta(selectedNode.type);
                    const conns = visibleEdges.filter(e => e.source === selectedNode.id || e.target === selectedNode.id);
                    return (
                      <div className="node-card" style={{ border:`1px solid ${meta.color}40` }}>
                        <div style={{ fontSize:8, color:meta.color, letterSpacing:2, marginBottom:6 }}>▸ NODE DETAILS</div>
                        <div style={{ fontSize:13, fontWeight:600, color:"#e2e8f0", marginBottom:3 }}>{selectedNode.label}</div>
                        <div style={{ fontSize:9, marginBottom:4 }}>
                          <span style={{ color:"#4a6278" }}>TYPE: </span>
                          <span style={{ color:meta.color, letterSpacing:1 }}>{selectedNode.type?.toUpperCase()}</span>
                        </div>
                        <div style={{ fontSize:9, color:"#4a6278", marginBottom:6 }}>{conns.length} CONNECTIONS</div>
                        <div>
                          {conns.map((e, i) => {
                            const other = e.source === selectedNode.id ? e.target : e.source;
                            const dir   = e.source === selectedNode.id ? "→" : "←";
                            return (
                              <div key={i} style={{ fontSize:9, color:"#3a5870", marginBottom:3 }}>
                                <span style={{ color:meta.color }}>{dir}</span>
                                <span style={{ color:"#a78bfa", margin:"0 4px" }}>[{e.label}]</span>
                                <span style={{ color:"#c8daea" }}>{other}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  <div style={{ position:"absolute", top:10, right:12, fontSize:8, color:"#1e3048", letterSpacing:1 }}>
                    DRAG TO MOVE · CLICK TO INSPECT
                  </div>
                </div>
              </div>
            )}

            {/* ── RELATIONS TAB ── */}
            {tab === "relations" && (
              <div className="panel">
                <div className="sec-title" style={{ marginBottom:14 }}>
                  ▸ ALL RELATIONSHIPS — {edges.length} TOTAL
                </div>

                {edges.length === 0 ? (
                  <div style={{ fontSize:11, color:"#1e3048", textAlign:"center", marginTop:40 }}>
                    No relationships found. Ingest a document first.
                  </div>
                ) : (
                  <table className="rel-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>FROM</th>
                        <th>RELATION</th>
                        <th>TO</th>
                      </tr>
                    </thead>
                    <tbody>
                      {edges.map((e, i) => {
                        const srcNode = allNodes.find(n => n.id === e.source);
                        const tgtNode = allNodes.find(n => n.id === e.target);
                        const srcMeta = getMeta(srcNode?.type);
                        const tgtMeta = getMeta(tgtNode?.type);
                        return (
                          <tr key={i} style={{ cursor:"pointer" }}
                            onClick={() => { setTab("graph"); setSelected(e.source); handleShowAll(); }}>
                            <td style={{ color:"#1e3048", fontSize:9 }}>{i + 1}</td>
                            <td>
                              <span className="node-pill"
                                style={{ color:srcMeta.color, borderColor:`${srcMeta.color}40`, background:`${srcMeta.color}12` }}>
                                <span style={{ fontSize:7, opacity:0.7 }}>{srcMeta.glyph}</span>
                                {e.source}
                              </span>
                            </td>
                            <td>
                              <span className="rel-badge">{e.label}</span>
                            </td>
                            <td>
                              <span className="node-pill"
                                style={{ color:tgtMeta.color, borderColor:`${tgtMeta.color}40`, background:`${tgtMeta.color}12` }}>
                                <span style={{ fontSize:7, opacity:0.7 }}>{tgtMeta.glyph}</span>
                                {e.target}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* ── ENTITIES TAB ── */}
            {tab === "entities" && (
              <div className="panel">
                <div className="sec-title" style={{ marginBottom:12 }}>▸ EXTRACTED ENTITIES — {allNodes.length} TOTAL</div>
                <div className="entity-grid">
                  {allNodes.map(n => {
                    const meta  = getMeta(n.type);
                    const conns = edges.filter(e => e.source === n.id || e.target === n.id);
                    return (
                      <div key={n.id} className="entity-card" style={{ borderLeftColor:meta.color }}
                        onClick={() => { setTab("graph"); setSelected(n.id); handleShowAll(); }}>
                        <div style={{ fontSize:12, fontWeight:600, color:"#e2e8f0", marginBottom:3 }}>{n.label}</div>
                        <div style={{ fontSize:9, color:meta.color, letterSpacing:1, marginBottom:4 }}>{n.type?.toUpperCase()}</div>
                        <div style={{ fontSize:9, color:"#3a5268", marginBottom:6 }}>{conns.length} link{conns.length!==1?"s":""}</div>
                        <div>
                          {conns.slice(0,3).map((e,i) => (
                            <span key={i} className="rel-chip"
                              style={{ color:meta.color, borderColor:`${meta.color}28`, background:`${meta.color}08`, fontSize:8 }}>
                              {e.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── INGEST TAB ── */}
            {tab === "ingest" && (
              <div className="panel" style={{ maxWidth:540 }}>
                <div className="sec-title" style={{ marginBottom:16 }}>▸ DOCUMENT MANAGER</div>
                <label className="upload-zone">
                  <input className="upload-input" type="file"
                    accept=".pdf,.txt,.csv,.md"
                    onChange={handleUpload} disabled={uploading}/>
                  <div style={{ fontSize:20, marginBottom:6 }}>📄</div>
                  <div style={{ fontSize:12, color:"#00f5d4", marginBottom:4 }}>
                    {uploading ? "Processing..." : "Click to upload document"}
                  </div>
                  <div style={{ fontSize:10, color:"#3a5268" }}>PDF · TXT · CSV · MD</div>
                </label>

                {uploadMsg && (
                  <div style={{ marginTop:10, padding:"10px 12px", background:"rgba(52,211,153,0.08)",
                    border:"1px solid rgba(52,211,153,0.2)", borderRadius:5,
                    fontSize:11, color:"#34d399", lineHeight:1.6 }}>
                    {uploadMsg}
                  </div>
                )}

                <div style={{ marginTop:20 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                    <div className="sec-title" style={{ marginBottom:0 }}>▸ INGESTED FILES ({sources.length})</div>
                    <button style={{ fontSize:9, color:"#3a5570", background:"none", border:"none", cursor:"pointer" }}
                      onClick={fetchSources}>↺ refresh</button>
                  </div>

                  {sources.length === 0 ? (
                    <div style={{ fontSize:10, color:"#1e3048", padding:"12px", textAlign:"center" }}>No files ingested yet</div>
                  ) : (
                    sources.map(src => (
                      <div key={src.filename} className="file-row">
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:11, color:"#c8daea", marginBottom:2,
                            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                            📄 {src.filename}
                          </div>
                          <div style={{ fontSize:9, color:"#3a5268" }}>{src.nodes} nodes</div>
                        </div>
                        <button className="del-btn" disabled={deleting === src.filename}
                          onClick={() => setConfirm(src.filename)}>
                          {deleting === src.filename ? "..." : "DELETE"}
                        </button>
                      </div>
                    ))
                  )}

                  {confirm && confirm !== "ALL" && (
                    <div className="confirm-box">
                      <div style={{ fontSize:11, color:"#f1a070", marginBottom:10 }}>
                        Delete all nodes from <strong style={{ color:"#f15757" }}>{confirm}</strong>?
                      </div>
                      <div style={{ display:"flex", gap:8 }}>
                        <button className="confirm-yes" onClick={() => handleDelete(confirm)}>YES, DELETE</button>
                        <button className="confirm-no" onClick={() => setConfirm(null)}>CANCEL</button>
                      </div>
                    </div>
                  )}

                  {sources.length > 0 && (
                    <button className="clear-all-btn" disabled={deleting === "ALL"}
                      onClick={() => setConfirm("ALL")}>
                      {deleting === "ALL" ? <><div className="spinner"/> CLEARING...</> : "⚠ CLEAR ENTIRE GRAPH"}
                    </button>
                  )}

                  {confirm === "ALL" && (
                    <div className="confirm-box">
                      <div style={{ fontSize:11, color:"#f1a070", marginBottom:10 }}>
                        Delete <strong style={{ color:"#f15757" }}>ALL nodes and relationships</strong>?
                      </div>
                      <div style={{ display:"flex", gap:8 }}>
                        <button className="confirm-yes" onClick={() => handleDelete("ALL")}>YES, CLEAR ALL</button>
                        <button className="confirm-no" onClick={() => setConfirm(null)}>CANCEL</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </main>

          {/* Right panel — Query Engine */}
          <aside className="right">
            <div className="sec-title">▸ AI QUERY ENGINE</div>
            <textarea className="query-box" value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); handleQuery(); }}}
              placeholder={"Ask anything about the graph...\nPress Enter to query"}/>
            <button className="exec-btn" onClick={handleQuery} disabled={loading || !query.trim()}>
              {loading ? <><div className="spinner"/> REASONING...</> : "⚡ EXECUTE QUERY"}
            </button>

            <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column" }}>
              {answer ? (
                <div className="answer-box">
                  <div style={{ fontSize:8, color:"#00f5d4", letterSpacing:2, marginBottom:8, opacity:0.7 }}>
                    ▸ REASONING OUTPUT
                  </div>
                  {answer.split(/(\*\*.*?\*\*)/).map((part, i) =>
                    part.startsWith("**") && part.endsWith("**")
                      ? <strong key={i}>{part.slice(2,-2)}</strong>
                      : part
                  )}
                </div>
              ) : (
                <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center",
                  justifyContent:"center", opacity:0.2, gap:10 }}>
                  <svg width="40" height="40" viewBox="0 0 40 40">
                    <circle cx="20" cy="20" r="16" fill="none" stroke="#00f5d4"
                      strokeWidth="0.8" strokeDasharray="4 3"/>
                    <circle cx="20" cy="20" r="4" fill="#00f5d4" opacity="0.6"/>
                  </svg>
                  <div style={{ fontSize:9, color:"#1e3048", textAlign:"center", letterSpacing:1, lineHeight:1.7 }}>
                    QUERY ENGINE STANDBY<br/>AWAITING INPUT
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>

        {/* Status bar */}
        <div className="status-bar">
          {[
            { k:"API",   v:"localhost:8000",          c:"#34d399" },
            { k:"NEO4J", v:"localhost:7687",           c:"#00f5d4" },
            { k:"MODEL", v:"llama-3.3-70b",            c:"#a78bfa" },
            { k:"NODES", v:`${allNodes.length} total`, c:"#fbbf24" },
            { k:"FILES", v:`${sources.length} ingested`, c:"#fb923c" },
          ].map(s => (
            <div key={s.k} style={{ display:"flex", gap:5, alignItems:"center" }}>
              <span className="st-key">{s.k}:</span>
              <span className="st-val" style={{ color:s.c }}>{s.v}</span>
            </div>
          ))}
          <div style={{ marginLeft:"auto", fontSize:8, color:"#0f1e2a" }}>
            GRAPHIQ v1.0 · AM2001-1 · NNM24
          </div>
        </div>
      </div>
    </>
  );
}
