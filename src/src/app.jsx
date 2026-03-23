import { useState, useEffect, useCallback, useRef } from "react";

// ── Quarterly AI Summary ─────────────────────────────────────────────────────
const QUARTERS = [
  { label: "Q1", months: [0,1,2], color: "#29b6f6", name: "Jan – Mar" },
  { label: "Q2", months: [3,4,5], color: "#00e676", name: "Apr – Jun" },
  { label: "Q3", months: [6,7,8], color: "#ffc200", name: "Jul – Sep" },
  { label: "Q4", months: [9,10,11], color: "#ce93d8", name: "Oct – Dec" },
];

function buildQuarterStats(journal, paperBalance, realBalance, paperStartBalance, realStartBalance, year, quarterMonths) {
  let wins=0, losses=0, neutral=0, totalPnl=0, tradeDays=0;
  const notes = [];
  for (const [dateStr, entry] of Object.entries(journal)) {
    const d = new Date(dateStr);
    if (d.getFullYear() !== year) continue;
    if (!quarterMonths.includes(d.getMonth())) continue;
    tradeDays++;
    if (entry.result==="green") wins++;
    else if (entry.result==="red") losses++;
    else neutral++;
    totalPnl += entry.pnl || 0;
    if (entry.note) notes.push(entry.note);
  }
  const winRate = tradeDays > 0 ? ((wins/tradeDays)*100).toFixed(1) : 0;
  return { wins, losses, neutral, totalPnl, tradeDays, winRate, notes: notes.slice(0,10) };
}

async function fetchAISummary(stats, quarterLabel, year, realBalance, paperBalance, milestoneIdx) {
  const prevMilestone = milestoneIdx <= 0 ? 0 : MILESTONES[Math.max(0, milestoneIdx-1)];
  const nextMilestone = MILESTONES[milestoneIdx] || MILESTONES[MILESTONES.length-1];
  const prompt = `You are a professional trading coach reviewing a trader's quarterly performance report. Be specific, insightful, encouraging but honest. Use a coaching tone.

QUARTERLY PERFORMANCE — ${quarterLabel} ${year}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Trading Days Logged: ${stats.tradeDays}
Winning Days: ${stats.wins}
Losing Days: ${stats.losses}
Neutral/No Trade Days: ${stats.neutral}
Win Rate: ${stats.winRate}%
Total P&L: $${stats.totalPnl.toFixed(2)}
Real Account Balance: $${realBalance.toFixed(2)}
Paper Money Balance: $${paperBalance.toFixed(2)}
Current Milestone: $${prevMilestone} → $${nextMilestone}
Milestone Progress: ${realBalance >= nextMilestone ? "ACHIEVED ✓" : `$${(nextMilestone - realBalance).toFixed(2)} remaining`}
${stats.notes.length ? `\nSelected Trade Notes:\n${stats.notes.map((n,i)=>`${i+1}. ${n}`).join("\n")}` : ""}

Please write a quarterly earnings summary with these sections:
1. **Quarter Overview** — 2-3 sentence summary of overall performance
2. **What Went Well** — 2-3 specific strengths based on the data
3. **Areas to Improve** — 2-3 honest, actionable coaching points
4. **Milestone Update** — Progress toward financial goals, celebrate wins
5. **Focus for Next Quarter** — 3 specific, prioritized goals

Keep it under 400 words. Be direct and motivating.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }]
    })
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return data.content.map(b => b.text || "").join("");
}

function QuarterlyAISummary({ state }) {
  const now = new Date();
  const currentQ = QUARTERS.findIndex(q => q.months.includes(now.getMonth()));
  const [selectedQ, setSelectedQ] = useState(currentQ >= 0 ? currentQ : 0);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [summaries, setSummaries] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const q = QUARTERS[selectedQ];
  const key = `${selectedYear}-Q${selectedQ+1}`;
  const existing = summaries[key];

  const stats = buildQuarterStats(
    state.tradeJournal || {}, state.paperBalance||0, state.realBalance||0,
    state.paperStartBalance||0, state.realStartBalance||0, selectedYear, q.months
  );
  const milestoneIdx = MILESTONES.findIndex(m => (state.realBalance||0) < m);

  async function generate() {
    setLoading(true);
    setError("");
    try {
      const summary = await fetchAISummary(stats, q.label, selectedYear, state.realBalance||0, state.paperBalance||0, milestoneIdx);
      setSummaries(prev => ({ ...prev, [key]: { text: summary, generated: new Date().toLocaleString(), stats } }));
    } catch(e) {
      setError("Failed to generate summary. Please try again.");
    }
    setLoading(false);
  }

  // Format markdown-like bold
  function renderText(text) {
    return text.split("\n").map((line, i) => {
      const bold = line.replace(/\*\*(.*?)\*\*/g, (_, m) => `<strong style="color:${q.color};font-weight:700">${m}</strong>`);
      return <div key={i} style={{ marginBottom: line.startsWith("**") || line.match(/^\d\./) ? 6 : 2 }}
        dangerouslySetInnerHTML={{ __html: bold }} />;
    });
  }

  return (
    <div style={{ background: G.card, border: `1px solid ${q.color}44`, borderRadius: 12, padding: 16 }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14, flexWrap:"wrap" }}>
        <span className="orb" style={{ fontSize:11, color:q.color, letterSpacing:2 }}>🤖 QUARTERLY AI REVIEW</span>
        <div style={{ display:"flex", gap:6, marginLeft:"auto" }}>
          {/* Year selector */}
          <select value={selectedYear} onChange={e=>setSelectedYear(Number(e.target.value))}
            style={{ padding:"4px 8px", fontSize:12 }}>
            {[now.getFullYear()-1, now.getFullYear(), now.getFullYear()+1].map(y=>(
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {/* Quarter selector */}
          {QUARTERS.map((qq,i)=>(
            <button key={i} onClick={()=>setSelectedQ(i)} style={{
              background: selectedQ===i ? qq.color+"33":"transparent",
              border:`1px solid ${selectedQ===i?qq.color:G.border}`,
              color: selectedQ===i?qq.color:G.muted,
              borderRadius:6, padding:"4px 10px", fontSize:11, fontWeight:700, cursor:"pointer"
            }}>{qq.label}</button>
          ))}
        </div>
      </div>

      {/* Quick stats bar */}
      <div style={{ display:"flex", gap:10, marginBottom:14, flexWrap:"wrap" }}>
        {[
          ["📅 Days",stats.tradeDays,G.text],
          ["🟢 Wins",stats.wins,G.green],
          ["🔴 Losses",stats.losses,G.red],
          ["📊 Win Rate",`${stats.winRate}%`,q.color],
          ["💰 P&L",`${stats.totalPnl>=0?"+":""}${fmtDollar(stats.totalPnl)}`,stats.totalPnl>=0?G.green:G.red],
        ].map(([l,v,c])=>(
          <div key={l} style={{ background:G.card2, border:`1px solid ${G.border}`, borderRadius:8, padding:"6px 12px", flex:"0 0 auto" }}>
            <div style={{ fontSize:9, color:G.muted, marginBottom:2 }}>{l}</div>
            <div className="mono" style={{ fontSize:14, fontWeight:700, color:c }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Summary display */}
      {existing ? (
        <div style={{ background:G.card2, border:`1px solid ${q.color}33`, borderRadius:10, padding:16, marginBottom:12 }}>
          <div style={{ fontSize:10, color:G.muted, marginBottom:10, fontFamily:"JetBrains Mono" }}>
            Generated: {existing.generated}
          </div>
          <div style={{ fontSize:13, lineHeight:1.75, color:G.text }}>
            {renderText(existing.text)}
          </div>
        </div>
      ) : (
        <div style={{ textAlign:"center", padding:"20px 0", color:G.muted, fontSize:13, marginBottom:12 }}>
          {stats.tradeDays === 0
            ? `No trades logged for ${q.label} ${selectedYear} yet. Start logging to generate a review.`
            : `Click below to generate your AI-powered ${q.label} ${selectedYear} performance review.`}
        </div>
      )}

      {error && <div style={{ color:G.red, fontSize:12, marginBottom:8, textAlign:"center" }}>{error}</div>}

      <div style={{ display:"flex", gap:8, justifyContent:"center" }}>
        <button onClick={generate} disabled={loading || stats.tradeDays===0} style={{
          background: loading ? "transparent" : `linear-gradient(135deg, ${q.color}33, ${q.color}11)`,
          border:`1px solid ${q.color}`, color:q.color, borderRadius:8,
          padding:"10px 24px", fontSize:12, fontWeight:700, letterSpacing:1,
          cursor: loading||stats.tradeDays===0 ? "not-allowed":"pointer", opacity: stats.tradeDays===0?0.4:1,
          display:"flex", alignItems:"center", gap:8
        }}>
          {loading ? (
            <>
              <span style={{ display:"inline-block", width:12, height:12, border:`2px solid ${q.color}`, borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
              Analyzing {q.label} {selectedYear}...
            </>
          ) : existing ? `🔄 Regenerate ${q.label} Review` : `✨ Generate ${q.label} ${selectedYear} Review`}
        </button>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Constants ────────────────────────────────────────────────────────────────
const MILESTONES = [100,200,500,1000,2500,5000,10000,25000,50000,100000,250000,500000,1000000,2500000,5000000,10000000];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const SHORT_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DOW = ["Su","Mo","Tu","We","Th","Fr","Sa"];
const TIME_BLOCKS = [
  { id: "morning", label: "Day 1", time: "5:00 AM – 12:00 PM", icon: "🌅" },
  { id: "afternoon", label: "Day 2", time: "12:00 PM – 6:00 PM", icon: "☀️" },
  { id: "evening", label: "Day 3", time: "6:00 PM – 9:00 PM", icon: "🌆" },
];
const WORKOUT_DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

const STORAGE_KEY = "trader_dashboard_v1";

// ── Helpers ──────────────────────────────────────────────────────────────────
function getDaysInMonth(year, month) { return new Date(year, month + 1, 0).getDate(); }
function getFirstDayOfMonth(year, month) { return new Date(year, month, 1).getDay(); }
function fmt(n) { return n >= 1e6 ? `$${(n/1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n/1e3).toFixed(0)}K` : `$${n}`; }
function fmtDollar(n) {
  if (!n && n !== 0) return "$0.00";
  return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n);
}

// ── Default state ────────────────────────────────────────────────────────────
function defaultState() {
  return {
    username: "",
    usernameSet: false,
    activePage: "trading",
    activeTradeTab: "paper",
    selectedYear: new Date().getFullYear(),
    selectedMonth: new Date().getMonth(),
    // Trade journal: { "YYYY-MM-DD": { result: "green"|"red"|"neutral", note, pnl } }
    tradeJournal: {},
    paperBalance: 0,
    paperStartBalance: 0,
    realBalance: 0,
    realStartBalance: 0,
    accountGoal: 10000000,
    news: [],
    tasks: { morning: [], afternoon: [], evening: [] },
    workouts: { 0:{done:false,exercises:[],notes:""}, 1:{done:false,exercises:[],notes:""}, 2:{done:false,exercises:[],notes:""}, 3:{done:false,exercises:[],notes:""}, 4:{done:false,exercises:[],notes:""}, 5:{done:false,exercises:[],notes:""}, 6:{done:false,exercises:[],notes:""} },
    weight: { current: 0, goal: 0, start: 0 },
    balanceHistory: [],
  };
}

// ── Storage ──────────────────────────────────────────────────────────────────
async function loadState(username) {
  try {
    const key = `${STORAGE_KEY}:${username}`;
    const r = await window.storage.get(key, true);
    if (r) return { ...defaultState(), ...JSON.parse(r.value), usernameSet: true, username };
  } catch {}
  return null;
}
async function saveState(state) {
  try {
    if (!state.username) return;
    const key = `${STORAGE_KEY}:${state.username}`;
    await window.storage.set(key, JSON.stringify(state), true);
  } catch {}
}

// ── CSS-in-JS styles ─────────────────────────────────────────────────────────
const G = {
  bg: "#03080d", card: "#07111a", card2: "#0b1a27", border: "#152433",
  green: "#00e676", red: "#ff1744", gold: "#ffc200", blue: "#29b6f6",
  purple: "#ce93d8", text: "#cce3f5", muted: "#4a7090", accent: "#00bcd4",
};

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=JetBrains+Mono:wght@400;600&family=Syne:wght@400;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body, #root { background: ${G.bg}; min-height: 100vh; font-family: 'Syne', sans-serif; color: ${G.text}; }
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: ${G.bg}; }
  ::-webkit-scrollbar-thumb { background: ${G.border}; border-radius: 2px; }
  input, textarea, select {
    background: ${G.card}; border: 1px solid ${G.border}; color: ${G.text};
    border-radius: 6px; padding: 8px 12px; font-family: inherit; font-size: 13px;
    outline: none; transition: border .2s;
  }
  input:focus, textarea:focus, select:focus { border-color: ${G.accent}; }
  button { cursor: pointer; font-family: inherit; transition: all .15s; }
  .mono { font-family: 'JetBrains Mono', monospace; }
  .orb { font-family: 'Orbitron', monospace; }
  @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
  @keyframes scan { 0%{transform:translateY(-100%)} 100%{transform:translateY(100vh)} }
  .fade-in { animation: fadeIn .3s ease forwards; }
`;

// ── UI Primitives ─────────────────────────────────────────────────────────────
const Card = ({ children, style, className="" }) => (
  <div className={`fade-in ${className}`} style={{
    background: G.card, border: `1px solid ${G.border}`, borderRadius: 12,
    padding: 16, ...style
  }}>{children}</div>
);

const Btn = ({ children, onClick, color=G.accent, small, style, disabled }) => (
  <button onClick={onClick} disabled={disabled} style={{
    background: "transparent", border: `1px solid ${color}`, color,
    borderRadius: 6, padding: small?"5px 10px":"8px 16px", fontSize: small?11:13,
    fontWeight: 600, letterSpacing: 1, opacity: disabled ? .4 : 1, ...style
  }} onMouseEnter={e=>{ if(!disabled) e.target.style.background=color+"22"; }}
     onMouseLeave={e=>{ e.target.style.background="transparent"; }}>
    {children}
  </button>
);

const Tag = ({ c, label }) => (
  <span style={{ background: c+"22", color: c, border:`1px solid ${c}44`, borderRadius:4, padding:"2px 7px", fontSize:11, fontWeight:600 }}>{label}</span>
);

// ── Username Gate ────────────────────────────────────────────────────────────
function UsernameGate({ onSet }) {
  const [val, setVal] = useState("");
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"100vh", gap:24 }}>
      <div className="orb" style={{ fontSize:28, color:G.accent, letterSpacing:4 }}>TRADER HQ</div>
      <div style={{ color:G.muted, fontSize:13 }}>Enter a username to sync your data across devices</div>
      <div style={{ display:"flex", gap:8 }}>
        <input value={val} onChange={e=>setVal(e.target.value)} placeholder="your_username"
          style={{ width:220 }} onKeyDown={e=>e.key==="Enter"&&val.trim()&&onSet(val.trim())} />
        <Btn onClick={()=>val.trim()&&onSet(val.trim())} color={G.green}>ENTER</Btn>
      </div>
      <div style={{ color:G.muted, fontSize:11, maxWidth:300, textAlign:"center" }}>
        Same username on any device = synced data ✓
      </div>
    </div>
  );
}

// ── Nav ───────────────────────────────────────────────────────────────────────
function Nav({ activePage, setPage, username }) {
  const pages = [
    { id:"trading", label:"📈 Trading", },
    { id:"growth", label:"🧠 Personal Growth", },
    { id:"fitness", label:"💪 Fitness", },
  ];
  return (
    <div style={{ position:"sticky", top:0, zIndex:100, background:G.bg+"ee", backdropFilter:"blur(12px)",
      borderBottom:`1px solid ${G.border}`, padding:"10px 16px", display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
      <div className="orb" style={{ color:G.accent, fontSize:14, letterSpacing:3, marginRight:8 }}>TRADER HQ</div>
      {pages.map(p=>(
        <button key={p.id} onClick={()=>setPage(p.id)} style={{
          background: activePage===p.id ? G.accent+"22" : "transparent",
          border: `1px solid ${activePage===p.id ? G.accent : G.border}`,
          color: activePage===p.id ? G.accent : G.muted, borderRadius:6,
          padding:"6px 14px", fontSize:12, fontWeight:600, letterSpacing:.5
        }}>{p.label}</button>
      ))}
      <div style={{ marginLeft:"auto", color:G.muted, fontSize:11, fontFamily:"JetBrains Mono" }}>@{username}</div>
    </div>
  );
}

// ── Trading Page ──────────────────────────────────────────────────────────────
function TradingPage({ state, setState }) {
  const [calModal, setCalModal] = useState(null); // { date, existing }
  const [modalForm, setModalForm] = useState({ result:"neutral", pnl:"", note:"" });
  const [newsForm, setNewsForm] = useState({ title:"", type:"news", ticker:"" });
  const [showNewsForm, setShowNewsForm] = useState(false);
  const [balForm, setBalForm] = useState({ paper:"", real:"" });
  const [showBalForm, setShowBalForm] = useState(false);
  const [activeTradeTab, setActiveTradeTab] = useState("paper");

  const year = state.selectedYear;
  const month = state.selectedMonth;

  function openDay(dateStr) {
    const existing = state.tradeJournal[dateStr] || {};
    setModalForm({ result: existing.result||"neutral", pnl: existing.pnl||"", note: existing.note||"" });
    setCalModal({ date: dateStr });
  }

  function saveDay() {
    const updated = { ...state.tradeJournal, [calModal.date]: { result:modalForm.result, pnl:parseFloat(modalForm.pnl)||0, note:modalForm.note } };
    // also update real/paper balance history
    const balHistory = [...(state.balanceHistory||[])];
    if (activeTradeTab==="real") {
      const existing = balHistory.find(b=>b.date===calModal.date);
      if (existing) existing.real=parseFloat(modalForm.pnl)||0;
      else balHistory.push({ date:calModal.date, real:parseFloat(modalForm.pnl)||0 });
    }
    setState(s=>({ ...s, tradeJournal:updated, balanceHistory:balHistory }));
    setCalModal(null);
  }

  function saveBalance() {
    setState(s=>({
      ...s,
      paperBalance: balForm.paper!=""?parseFloat(balForm.paper):s.paperBalance,
      realBalance: balForm.real!=""?parseFloat(balForm.real):s.realBalance,
      paperStartBalance: s.paperStartBalance||parseFloat(balForm.paper)||0,
      realStartBalance: s.realStartBalance||parseFloat(balForm.real)||0,
    }));
    setShowBalForm(false);
  }

  function addNews() {
    if (!newsForm.title.trim()) return;
    setState(s=>({ ...s, news:[{ ...newsForm, id:Date.now(), date:new Date().toLocaleDateString() }, ...s.news].slice(0,30) }));
    setNewsForm({ title:"", type:"news", ticker:"" });
    setShowNewsForm(false);
  }

  // Calendar render
  const firstDay = getFirstDayOfMonth(year, month);
  const daysInMonth = getDaysInMonth(year, month);
  const dayCells = [];
  for (let i=0;i<firstDay;i++) dayCells.push(null);
  for (let d=1;d<=daysInMonth;d++) dayCells.push(d);

  const journal = state.tradeJournal || {};
  const dayColor = (d) => {
    if (!d) return "transparent";
    const key = `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const e = journal[key];
    if (!e||e.result==="neutral") return G.card2;
    return e.result==="green" ? G.green+"33" : G.red+"33";
  };
  const dayBorder = (d) => {
    if (!d) return "transparent";
    const key = `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const e = journal[key];
    if (!e||e.result==="neutral") return G.border;
    return e.result==="green" ? G.green+"88" : G.red+"88";
  };

  // P&L stats for current month
  let monthPnl=0, wins=0, losses=0, neutral=0;
  for (let d=1;d<=daysInMonth;d++) {
    const key=`${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const e=journal[key];
    if(e){ monthPnl+=e.pnl||0; if(e.result==="green")wins++; else if(e.result==="red")losses++; else neutral++; }
  }

  // Milestone calc
  const realBal = state.realBalance || 0;
  const curMilestoneIdx = MILESTONES.findIndex(m=>realBal<m);
  const prevMilestone = curMilestoneIdx<=0 ? 0 : MILESTONES[Math.max(0,curMilestoneIdx-1)];
  const nextMilestone = MILESTONES[curMilestoneIdx] || MILESTONES[MILESTONES.length-1];
  const progress = curMilestoneIdx<0 ? 100 : ((realBal-prevMilestone)/(nextMilestone-prevMilestone))*100;

  return (
    <div style={{ padding:16, display:"flex", flexDirection:"column", gap:16 }}>

      {/* Top row: Market Map + News */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 320px", gap:16 }}>
        {/* Finviz */}
        <Card style={{ padding:0, overflow:"hidden" }}>
          <div style={{ padding:"10px 14px", borderBottom:`1px solid ${G.border}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <span className="orb" style={{ fontSize:11, color:G.accent, letterSpacing:2 }}>MARKET HEATMAP</span>
            <a href="https://finviz.com/map.ashx" target="_blank" rel="noreferrer"
              style={{ color:G.muted, fontSize:11, textDecoration:"none" }}>Open Finviz ↗</a>
          </div>
          <iframe
            src="https://finviz.com/publish/072014/map.ashx?t=sec&st=ytd"
            style={{ width:"100%", height:320, border:"none", display:"block" }}
            title="Finviz Map"
          />
          <div style={{ padding:"8px 14px", background:G.card2, borderTop:`1px solid ${G.border}`, fontSize:11, color:G.muted }}>
            ⚠ If map doesn't load: <a href="https://finviz.com/map.ashx" target="_blank" rel="noreferrer" style={{ color:G.accent }}>click here to open Finviz</a>
          </div>
        </Card>

        {/* News & Earnings */}
        <Card style={{ display:"flex", flexDirection:"column", gap:10, padding:14 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <span className="orb" style={{ fontSize:11, color:G.gold, letterSpacing:2 }}>NEWS & EARNINGS</span>
            <Btn small color={G.gold} onClick={()=>setShowNewsForm(!showNewsForm)}>+ ADD</Btn>
          </div>
          {showNewsForm && (
            <div style={{ display:"flex", flexDirection:"column", gap:6, padding:10, background:G.card2, borderRadius:8, border:`1px solid ${G.border}` }}>
              <input placeholder="Headline / Event" value={newsForm.title} onChange={e=>setNewsForm(f=>({...f,title:e.target.value}))} />
              <input placeholder="Ticker (optional)" value={newsForm.ticker} onChange={e=>setNewsForm(f=>({...f,ticker:e.target.value}))} />
              <select value={newsForm.type} onChange={e=>setNewsForm(f=>({...f,type:e.target.value}))}>
                <option value="news">📰 News</option>
                <option value="earnings">💰 Earnings</option>
                <option value="release">🚀 New Release</option>
                <option value="macro">🌐 Macro</option>
              </select>
              <div style={{ display:"flex", gap:6 }}>
                <Btn small color={G.gold} onClick={addNews}>Save</Btn>
                <Btn small color={G.muted} onClick={()=>setShowNewsForm(false)}>Cancel</Btn>
              </div>
            </div>
          )}
          <div style={{ overflowY:"auto", maxHeight:280, display:"flex", flexDirection:"column", gap:6 }}>
            {(state.news||[]).length===0 && <div style={{ color:G.muted, fontSize:12, textAlign:"center", padding:20 }}>No entries yet</div>}
            {(state.news||[]).map(n=>(
              <div key={n.id} style={{ padding:"8px 10px", background:G.card2, borderRadius:7, border:`1px solid ${G.border}` }}>
                <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:3 }}>
                  <Tag c={n.type==="earnings"?G.gold:n.type==="release"?G.purple:n.type==="macro"?G.blue:G.accent}
                    label={n.type==="earnings"?"EARN":n.type==="release"?"RELE":n.type==="macro"?"MACRO":"NEWS"} />
                  {n.ticker && <Tag c={G.muted} label={n.ticker} />}
                </div>
                <div style={{ fontSize:12 }}>{n.title}</div>
                <div style={{ fontSize:10, color:G.muted, marginTop:2 }}>{n.date}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Balance Cards */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        {[
          { key:"paper", label:"PAPER MONEY", bal:state.paperBalance||0, start:state.paperStartBalance||0, color:G.blue },
          { key:"real", label:"REAL ACCOUNT", bal:state.realBalance||0, start:state.realStartBalance||0, color:G.green },
        ].map(acc=>{
          const pnl = acc.bal - acc.start;
          const pct = acc.start ? ((pnl/acc.start)*100).toFixed(1) : 0;
          return (
            <Card key={acc.key} style={{ padding:14 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                <span className="orb" style={{ fontSize:11, color:acc.color, letterSpacing:2 }}>{acc.label}</span>
                <Btn small color={acc.color} onClick={()=>setShowBalForm(true)}>UPDATE</Btn>
              </div>
              <div className="mono" style={{ fontSize:26, fontWeight:700, color:acc.color }}>{fmtDollar(acc.bal)}</div>
              <div style={{ marginTop:4, fontSize:12 }}>
                <span style={{ color:pnl>=0?G.green:G.red, fontFamily:"JetBrains Mono" }}>
                  {pnl>=0?"▲":"▼"} {fmtDollar(Math.abs(pnl))} ({pct}%)
                </span>
                <span style={{ color:G.muted, marginLeft:8 }}>vs start</span>
              </div>
            </Card>
          );
        })}
      </div>

      {showBalForm && (
        <div style={{ position:"fixed", inset:0, background:"#000a", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={()=>setShowBalForm(false)}>
          <Card onClick={e=>e.stopPropagation()} style={{ width:320, padding:20, display:"flex", flexDirection:"column", gap:10 }}>
            <div className="orb" style={{ fontSize:12, color:G.accent, letterSpacing:2 }}>UPDATE BALANCES</div>
            <input placeholder="Paper Money Balance" type="number" value={balForm.paper} onChange={e=>setBalForm(f=>({...f,paper:e.target.value}))} />
            <input placeholder="Real Account Balance" type="number" value={balForm.real} onChange={e=>setBalForm(f=>({...f,real:e.target.value}))} />
            <div style={{ display:"flex", gap:8 }}>
              <Btn color={G.green} onClick={saveBalance}>Save</Btn>
              <Btn color={G.muted} onClick={()=>setShowBalForm(false)}>Cancel</Btn>
            </div>
          </Card>
        </div>
      )}

      {/* Trade Journal Calendar */}
      <Card style={{ padding:14 }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12, flexWrap:"wrap" }}>
          <span className="orb" style={{ fontSize:11, color:G.accent, letterSpacing:2 }}>TRADE JOURNAL</span>
          <div style={{ display:"flex", gap:6, marginLeft:"auto", alignItems:"center" }}>
            <Btn small color={G.muted} onClick={()=>setState(s=>({ ...s, selectedMonth:(s.selectedMonth-1+12)%12, selectedYear:s.selectedMonth===0?s.selectedYear-1:s.selectedYear }))}>‹</Btn>
            <span className="mono" style={{ fontSize:13, minWidth:120, textAlign:"center" }}>{MONTHS[month]} {year}</span>
            <Btn small color={G.muted} onClick={()=>setState(s=>({ ...s, selectedMonth:(s.selectedMonth+1)%12, selectedYear:s.selectedMonth===11?s.selectedYear+1:s.selectedYear }))}>›</Btn>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <Tag c={G.green} label={`✓ ${wins}`} />
            <Tag c={G.red} label={`✗ ${losses}`} />
            <Tag c={G.muted} label={`– ${neutral}`} />
            <Tag c={monthPnl>=0?G.green:G.red} label={fmtDollar(monthPnl)} />
          </div>
        </div>
        {/* DOW headers */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4, marginBottom:4 }}>
          {DOW.map(d=><div key={d} style={{ textAlign:"center", fontSize:11, color:G.muted, fontWeight:600 }}>{d}</div>)}
        </div>
        {/* Day cells */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4 }}>
          {dayCells.map((d,i)=>{
            if (!d) return <div key={`e${i}`} />;
            const key=`${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
            const e=journal[key];
            const today=new Date(); const isToday=today.getDate()===d&&today.getMonth()===month&&today.getFullYear()===year;
            return (
              <div key={key} onClick={()=>openDay(key)} style={{
                background:dayColor(d), border:`1px solid ${isToday?G.accent:dayBorder(d)}`,
                borderRadius:6, padding:"6px 4px", textAlign:"center", cursor:"pointer",
                minHeight:44, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
                transition:"all .15s"
              }}
              onMouseEnter={e=>e.currentTarget.style.transform="scale(1.05)"}
              onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
                <div className="mono" style={{ fontSize:12, fontWeight:isToday?700:400, color:isToday?G.accent:G.text }}>{d}</div>
                {e && e.pnl!==0 && <div style={{ fontSize:9, color:e.result==="green"?G.green:G.red, fontFamily:"JetBrains Mono" }}>
                  {e.pnl>0?"+":""}{e.pnl}
                </div>}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Day Modal */}
      {calModal && (
        <div style={{ position:"fixed", inset:0, background:"#000b", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={()=>setCalModal(null)}>
          <Card onClick={e=>e.stopPropagation()} style={{ width:340, padding:20, display:"flex", flexDirection:"column", gap:12 }}>
            <div className="orb" style={{ fontSize:12, color:G.accent, letterSpacing:2 }}>LOG TRADE — {calModal.date}</div>
            <div style={{ display:"flex", gap:8 }}>
              {[["green","🟢 PROFIT",G.green],["red","🔴 LOSS",G.red],["neutral","⚪ NO TRADE",G.muted]].map(([v,l,c])=>(
                <button key={v} onClick={()=>setModalForm(f=>({...f,result:v}))} style={{
                  flex:1, padding:"8px 4px", borderRadius:6, fontSize:11, fontWeight:700,
                  background:modalForm.result===v?c+"33":"transparent",
                  border:`1px solid ${modalForm.result===v?c:G.border}`, color:modalForm.result===v?c:G.muted
                }}>{l}</button>
              ))}
            </div>
            <input type="number" placeholder="P&L amount (e.g. 42.50 or -25)" value={modalForm.pnl}
              onChange={e=>setModalForm(f=>({...f,pnl:e.target.value}))} />
            <textarea placeholder="Trade notes..." rows={3} value={modalForm.note}
              onChange={e=>setModalForm(f=>({...f,note:e.target.value}))}
              style={{ resize:"vertical" }} />
            <div style={{ display:"flex", gap:8 }}>
              <Btn color={G.green} onClick={saveDay}>Save</Btn>
              <Btn color={G.muted} onClick={()=>setCalModal(null)}>Cancel</Btn>
            </div>
          </Card>
        </div>
      )}

      {/* Quarterly AI Summary */}
      <QuarterlyAISummary state={state} />

      {/* Milestones */}
      <Card style={{ padding:14 }}>
        <div style={{ marginBottom:12 }}>
          <span className="orb" style={{ fontSize:11, color:G.gold, letterSpacing:2 }}>MILESTONE GOALS</span>
          <span className="mono" style={{ marginLeft:12, fontSize:13, color:G.green }}>{fmtDollar(realBal)}</span>
        </div>
        {/* Current milestone progress */}
        <div style={{ marginBottom:16, padding:12, background:G.card2, borderRadius:8, border:`1px solid ${G.gold}33` }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
            <span style={{ fontSize:12, color:G.muted }}>Current: {fmt(prevMilestone)}</span>
            <span style={{ fontSize:12, color:G.gold }}>Next: {fmt(nextMilestone)}</span>
          </div>
          <div style={{ background:G.border, borderRadius:99, height:12, overflow:"hidden" }}>
            <div style={{ width:`${Math.min(100,Math.max(0,progress))}%`, height:"100%", background:`linear-gradient(90deg,${G.green},${G.gold})`, borderRadius:99, transition:"width .5s" }} />
          </div>
          <div style={{ textAlign:"right", marginTop:4, fontSize:11, color:G.gold }}>{progress.toFixed(1)}%</div>
        </div>
        {/* All milestones */}
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {MILESTONES.map((m,i)=>{
            const prev = i===0?0:MILESTONES[i-1];
            const achieved = realBal >= m;
            const active = !achieved && realBal >= prev;
            const pct = active ? Math.min(100,((realBal-prev)/(m-prev))*100) : achieved?100:0;
            return (
              <div key={m} style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:72, textAlign:"right", fontSize:11, fontFamily:"JetBrains Mono",
                  color:achieved?G.gold:active?G.green:G.muted }}>{fmt(m)}</div>
                <div style={{ flex:1, background:G.border, borderRadius:99, height:7, overflow:"hidden" }}>
                  <div style={{ width:`${pct}%`, height:"100%", borderRadius:99,
                    background:achieved?`linear-gradient(90deg,${G.gold},${G.gold}88)`:active?`linear-gradient(90deg,${G.green},${G.accent})`:G.border,
                    transition:"width .5s"
                  }} />
                </div>
                <div style={{ width:36, fontSize:10, fontFamily:"JetBrains Mono",
                  color:achieved?G.gold:active?G.green:G.muted }}>{achieved?"✓":active?`${pct.toFixed(0)}%`:""}</div>
              </div>
            );
          })}
        </div>
      </Card>

    </div>
  );
}

// ── Personal Growth Page ──────────────────────────────────────────────────────
function GrowthPage({ state, setState }) {
  const [newTask, setNewTask] = useState({ morning:"", afternoon:"", evening:"" });

  function addTask(block) {
    if (!newTask[block].trim()) return;
    setState(s=>{
      const tasks = { ...s.tasks };
      tasks[block] = [...(tasks[block]||[]), { id:Date.now(), text:newTask[block], done:false }];
      return { ...s, tasks };
    });
    setNewTask(f=>({...f,[block]:""}));
  }

  function toggleTask(block, id) {
    setState(s=>{
      const tasks = { ...s.tasks };
      tasks[block] = tasks[block].map(t=>t.id===id?{...t,done:!t.done}:t);
      return { ...s, tasks };
    });
  }

  function deleteTask(block, id) {
    setState(s=>{
      const tasks = { ...s.tasks };
      tasks[block] = tasks[block].filter(t=>t.id!==id);
      return { ...s, tasks };
    });
  }

  const colors = [G.blue, G.gold, G.purple];

  return (
    <div style={{ padding:16, display:"flex", flexDirection:"column", gap:16 }}>
      <div className="orb" style={{ fontSize:13, color:G.text, letterSpacing:3 }}>DAILY STRUCTURE</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))", gap:16 }}>
        {TIME_BLOCKS.map((block,bi)=>{
          const c = colors[bi];
          const tasks = state.tasks?.[block.id]||[];
          const done = tasks.filter(t=>t.done).length;
          return (
            <Card key={block.id} style={{ padding:14, border:`1px solid ${c}33` }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
                <span style={{ fontSize:24 }}>{block.icon}</span>
                <div>
                  <div className="orb" style={{ fontSize:11, color:c, letterSpacing:2 }}>{block.label}</div>
                  <div style={{ fontSize:12, color:G.muted }}>{block.time}</div>
                </div>
                <div style={{ marginLeft:"auto", fontSize:11, color:c, fontFamily:"JetBrains Mono" }}>{done}/{tasks.length}</div>
              </div>
              {/* Progress */}
              <div style={{ background:G.border, borderRadius:99, height:5, marginBottom:12 }}>
                <div style={{ width:tasks.length?`${(done/tasks.length)*100}%`:"0%", height:"100%", background:c, borderRadius:99, transition:"width .3s" }} />
              </div>
              {/* Tasks */}
              <div style={{ display:"flex", flexDirection:"column", gap:5, marginBottom:10, maxHeight:200, overflowY:"auto" }}>
                {tasks.map(t=>(
                  <div key={t.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 8px", background:G.card2, borderRadius:6 }}>
                    <input type="checkbox" checked={t.done} onChange={()=>toggleTask(block.id,t.id)}
                      style={{ width:14, height:14, accentColor:c, background:"transparent", border:"none", padding:0 }} />
                    <span style={{ flex:1, fontSize:12, color:t.done?G.muted:G.text, textDecoration:t.done?"line-through":"none" }}>{t.text}</span>
                    <button onClick={()=>deleteTask(block.id,t.id)} style={{ background:"transparent", border:"none", color:G.muted, fontSize:14, padding:"0 2px" }}>×</button>
                  </div>
                ))}
                {tasks.length===0 && <div style={{ color:G.muted, fontSize:11, textAlign:"center", padding:8 }}>No tasks — add one below</div>}
              </div>
              {/* Add task */}
              <div style={{ display:"flex", gap:6 }}>
                <input placeholder="Add task..." value={newTask[block.id]}
                  onChange={e=>setNewTask(f=>({...f,[block.id]:e.target.value}))}
                  onKeyDown={e=>e.key==="Enter"&&addTask(block.id)}
                  style={{ flex:1, fontSize:12, padding:"6px 10px" }} />
                <Btn small color={c} onClick={()=>addTask(block.id)}>+</Btn>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Weekly summary */}
      <Card style={{ padding:14 }}>
        <div className="orb" style={{ fontSize:11, color:G.accent, letterSpacing:2, marginBottom:10 }}>WEEKLY TASK OVERVIEW</div>
        <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
          {TIME_BLOCKS.map((block,bi)=>{
            const c=colors[bi];
            const tasks=state.tasks?.[block.id]||[];
            const done=tasks.filter(t=>t.done).length;
            const pct=tasks.length?(done/tasks.length)*100:0;
            return (
              <div key={block.id} style={{ flex:1, minWidth:140 }}>
                <div style={{ fontSize:12, color:c, marginBottom:4 }}>{block.icon} {block.label}</div>
                <div style={{ background:G.border, borderRadius:99, height:8 }}>
                  <div style={{ width:`${pct}%`, height:"100%", background:c, borderRadius:99, transition:"width .3s" }} />
                </div>
                <div style={{ fontSize:11, color:G.muted, marginTop:3 }}>{done}/{tasks.length} tasks</div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// ── Fitness Page ──────────────────────────────────────────────────────────────
function FitnessPage({ state, setState }) {
  const [activeDay, setActiveDay] = useState(0);
  const [exInput, setExInput] = useState("");
  const [weightForm, setWeightForm] = useState({ current:"", start:"", goal:"" });
  const [showWeightForm, setShowWeightForm] = useState(false);

  const workouts = state.workouts || {};
  const weight = state.weight || {};

  function toggleDayDone(d) {
    setState(s=>{
      const w={...s.workouts};
      w[d]={...(w[d]||{}), done:!(w[d]?.done)};
      return {...s,workouts:w};
    });
  }

  function addExercise(d) {
    if (!exInput.trim()) return;
    setState(s=>{
      const w={...s.workouts};
      w[d]={...(w[d]||{}), exercises:[...(w[d]?.exercises||[]), { id:Date.now(), text:exInput, sets:"", reps:"" }]};
      return {...s,workouts:w};
    });
    setExInput("");
  }

  function removeExercise(d, id) {
    setState(s=>{
      const w={...s.workouts};
      w[d]={...(w[d]||{}), exercises:(w[d]?.exercises||[]).filter(e=>e.id!==id)};
      return {...s,workouts:w};
    });
  }

  function updateExField(d, id, field, val) {
    setState(s=>{
      const w={...s.workouts};
      w[d]={...(w[d]||{}), exercises:(w[d]?.exercises||[]).map(e=>e.id===id?{...e,[field]:val}:e)};
      return {...s,workouts:w};
    });
  }

  function saveWeight() {
    setState(s=>({ ...s, weight:{
      current:parseFloat(weightForm.current)||s.weight?.current||0,
      start:parseFloat(weightForm.start)||s.weight?.start||0,
      goal:parseFloat(weightForm.goal)||s.weight?.goal||0,
    }}));
    setShowWeightForm(false);
  }

  const doneCount = Object.values(workouts).filter(w=>w?.done).length;
  const weightPct = (weight.start&&weight.goal&&weight.current) ?
    Math.min(100,Math.max(0,((weight.current-weight.start)/(weight.goal-weight.start))*100)) : 0;
  const losing = weight.goal < weight.start;
  const adjustedPct = losing ? 100-weightPct : weightPct;

  return (
    <div style={{ padding:16, display:"flex", flexDirection:"column", gap:16 }}>
      {/* Weight tracker */}
      <Card style={{ padding:14 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
          <span className="orb" style={{ fontSize:11, color:G.purple, letterSpacing:2 }}>WEIGHT PROGRESS</span>
          <Btn small color={G.purple} onClick={()=>setShowWeightForm(!showWeightForm)}>UPDATE</Btn>
        </div>
        {showWeightForm && (
          <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
            <input type="number" placeholder="Start (lbs)" value={weightForm.start} onChange={e=>setWeightForm(f=>({...f,start:e.target.value}))} style={{ width:110 }} />
            <input type="number" placeholder="Current (lbs)" value={weightForm.current} onChange={e=>setWeightForm(f=>({...f,current:e.target.value}))} style={{ width:120 }} />
            <input type="number" placeholder="Goal (lbs)" value={weightForm.goal} onChange={e=>setWeightForm(f=>({...f,goal:e.target.value}))} style={{ width:110 }} />
            <Btn small color={G.purple} onClick={saveWeight}>Save</Btn>
          </div>
        )}
        <div style={{ display:"flex", gap:16, marginBottom:10 }}>
          {[["START",weight.start||"—",G.muted],["CURRENT",weight.current||"—",G.purple],["GOAL",weight.goal||"—",G.green]].map(([l,v,c])=>(
            <div key={l}>
              <div style={{ fontSize:10, color:G.muted, marginBottom:2 }}>{l}</div>
              <div className="mono" style={{ fontSize:20, color:c, fontWeight:700 }}>{v}{v!=="—"?" lbs":""}</div>
            </div>
          ))}
          {weight.current&&weight.goal&&<div style={{ marginLeft:"auto" }}>
            <div style={{ fontSize:10, color:G.muted, marginBottom:2 }}>REMAINING</div>
            <div className="mono" style={{ fontSize:20, color:G.gold, fontWeight:700 }}>{Math.abs(weight.goal-weight.current).toFixed(1)} lbs</div>
          </div>}
        </div>
        <div style={{ background:G.border, borderRadius:99, height:14, overflow:"hidden" }}>
          <div style={{ width:`${Math.min(100,adjustedPct)}%`, height:"100%",
            background:`linear-gradient(90deg,${G.purple},${G.accent})`, borderRadius:99, transition:"width .5s",
            position:"relative", display:"flex", alignItems:"center", justifyContent:"flex-end", paddingRight:6 }}>
            {adjustedPct>10&&<span style={{ fontSize:9, color:"#fff", fontWeight:700 }}>{adjustedPct.toFixed(0)}%</span>}
          </div>
        </div>
      </Card>

      {/* Weekly workout grid */}
      <Card style={{ padding:14 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
          <span className="orb" style={{ fontSize:11, color:G.green, letterSpacing:2 }}>WEEKLY WORKOUTS</span>
          <Tag c={G.green} label={`${doneCount}/7 Days`} />
        </div>
        <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:4 }}>
          {WORKOUT_DAYS.map((day,d)=>{
            const w=workouts[d]||{};
            return (
              <button key={d} onClick={()=>setActiveDay(d)} style={{
                flex:"0 0 auto", width:72, padding:"10px 6px", borderRadius:8,
                background:activeDay===d?(w.done?G.green+"33":G.card2):(w.done?G.green+"22":"transparent"),
                border:`1px solid ${activeDay===d?(w.done?G.green:G.accent):(w.done?G.green+"55":G.border)}`,
                color:activeDay===d?(w.done?G.green:G.accent):(w.done?G.green:G.muted),
                fontSize:11, fontWeight:700, cursor:"pointer", textAlign:"center",
              }}>
                <div style={{ fontSize:16, marginBottom:3 }}>{w.done?"✅":"⬜"}</div>
                <div style={{ fontSize:10 }}>{day.slice(0,3)}</div>
                <div style={{ fontSize:9, marginTop:2, color:G.muted }}>{(w.exercises||[]).length} ex</div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Active day workout */}
      <Card style={{ padding:14 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
          <span className="orb" style={{ fontSize:11, color:G.green, letterSpacing:2 }}>{WORKOUT_DAYS[activeDay].toUpperCase()}</span>
          <Btn small color={(workouts[activeDay]?.done)?G.green:G.muted}
            onClick={()=>toggleDayDone(activeDay)}>
            {workouts[activeDay]?.done?"✓ DONE":"MARK DONE"}
          </Btn>
        </div>
        {/* Exercises */}
        <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:10 }}>
          {(workouts[activeDay]?.exercises||[]).map(ex=>(
            <div key={ex.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", background:G.card2, borderRadius:7, border:`1px solid ${G.border}` }}>
              <span style={{ flex:1, fontSize:13 }}>{ex.text}</span>
              <input value={ex.sets} onChange={e=>updateExField(activeDay,ex.id,"sets",e.target.value)}
                placeholder="Sets" style={{ width:52, fontSize:11, padding:"4px 6px", textAlign:"center" }} />
              <input value={ex.reps} onChange={e=>updateExField(activeDay,ex.id,"reps",e.target.value)}
                placeholder="Reps" style={{ width:52, fontSize:11, padding:"4px 6px", textAlign:"center" }} />
              <button onClick={()=>removeExercise(activeDay,ex.id)} style={{ background:"transparent",border:"none",color:G.muted,fontSize:16,cursor:"pointer" }}>×</button>
            </div>
          ))}
          {!(workouts[activeDay]?.exercises?.length) && (
            <div style={{ color:G.muted, fontSize:12, textAlign:"center", padding:12 }}>No exercises logged for this day</div>
          )}
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <input placeholder="Add exercise (e.g. Bench Press)" value={exInput}
            onChange={e=>setExInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addExercise(activeDay)}
            style={{ flex:1 }} />
          <Btn color={G.green} onClick={()=>addExercise(activeDay)}>+ ADD</Btn>
        </div>
        {/* Notes */}
        <textarea placeholder="Workout notes..." rows={2} value={workouts[activeDay]?.notes||""}
          onChange={e=>setState(s=>{ const w={...s.workouts}; w[activeDay]={...(w[activeDay]||{}),notes:e.target.value}; return {...s,workouts:w}; })}
          style={{ width:"100%", marginTop:10, resize:"vertical", fontSize:12 }} />
      </Card>

    </div>
  );
}

// ── Root App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [state, setStateRaw] = useState(null);
  const [loading, setLoading] = useState(true);
  const saveTimer = useRef(null);

  function setState(updater) {
    setStateRaw(prev=>{
      const next = typeof updater==="function" ? updater(prev) : updater;
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(()=>saveState(next), 800);
      return next;
    });
  }

  async function handleUsername(username) {
    setLoading(true);
    const loaded = await loadState(username);
    if (loaded) setStateRaw(loaded);
    else setStateRaw({ ...defaultState(), username, usernameSet:true });
    setLoading(false);
  }

  useEffect(()=>{ setLoading(false); },[]);

  if (loading) return (
    <div style={{ display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",flexDirection:"column",gap:12 }}>
      <div className="orb" style={{ color:G.accent,fontSize:18,letterSpacing:4 }}>TRADER HQ</div>
      <div style={{ color:G.muted,fontSize:12 }}>Loading...</div>
    </div>
  );

  if (!state || !state.usernameSet) return (
    <>
      <style>{css}</style>
      <UsernameGate onSet={handleUsername} />
    </>
  );

  return (
    <>
      <style>{css}</style>
      <Nav activePage={state.activePage} setPage={p=>setState(s=>({...s,activePage:p}))} username={state.username} />
      {state.activePage==="trading" && <TradingPage state={state} setState={setState} />}
      {state.activePage==="growth" && <GrowthPage state={state} setState={setState} />}
      {state.activePage==="fitness" && <FitnessPage state={state} setState={setState} />}
    </>
  );
}
