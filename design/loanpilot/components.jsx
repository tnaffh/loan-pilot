/* global React */
// LoanPilot — shared icons & UI atoms

const LPI = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  inbox: <><path d="M3 12h5l2 3h4l2-3h5"/><path d="M5 5h14l2 7v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z"/></>,
  doc: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8M8 17h5"/></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/></>,
  wallet: <><path d="M3 7h15a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 7V5a2 2 0 0 1 2-2h11"/><circle cx="16.5" cy="13" r="1.3"/></>,
  card: <><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></>,
  cog: <><circle cx="12" cy="12" r="3"/><path d="M19.4 13a7.9 7.9 0 0 0 0-2l2-1.5-2-3.4-2.3 1a7.9 7.9 0 0 0-1.7-1l-.3-2.6H10.9l-.3 2.6a7.9 7.9 0 0 0-1.7 1l-2.3-1-2 3.4 2 1.5a7.9 7.9 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7.9 7.9 0 0 0 1.7 1l.3 2.6h4l.3-2.6a7.9 7.9 0 0 0 1.7-1l2.3 1 2-3.4z"/></>,
  building: <><path d="M3 21V7l8-4 8 4v14"/><path d="M9 21v-6h4v6"/><path d="M3 21h18"/></>,
  chart: <><path d="M3 3v18h18"/><path d="M7 14l4-4 3 3 5-6"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></>,
  bell: <><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></>,
  menu: <><path d="M3 6h18M3 12h18M3 18h18"/></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></>,
  check: <><path d="M20 6L9 17l-5-5"/></>,
  x: <><path d="M18 6L6 18M6 6l12 12"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></>,
  up: <><path d="M12 19V5M5 12l7-7 7 7"/></>,
  down: <><path d="M12 5v14M5 12l7 7 7-7"/></>,
  trend: <><path d="M3 17l6-6 4 4 8-8"/><path d="M17 7h4v4"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>,
  download: <><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/></>,
  shield: <><path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z"/></>,
  phone: <><path d="M21 16.5v3a2 2 0 0 1-2.2 2A19 19 0 0 1 3 5.2 2 2 0 0 1 5 3h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8.8 10.8a16 16 0 0 0 4.4 4.4l1.4-1.3a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2z"/></>,
  cal: <><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></>,
  money: <><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h3.5a1.8 1.8 0 0 1 0 3.5h-2a1.8 1.8 0 0 0 0 3.5H14"/></>,
  alert: <><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  file: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></>,
  layers: <><path d="M12 2l9 5-9 5-9-5z"/><path d="M3 12l9 5 9-5M3 17l9 5 9-5"/></>,
  plane: <><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></>,
  globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z"/></>,
  ext: <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14L21 3"/></>
};

function Icon({ name, size }) {
  return (
    <svg width={size || 20} height={size || 20} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      {LPI[name] || null}
    </svg>
  );
}

function Badge({ status, children }) { return <span className={"badge " + status}>{children || status}</span>; }
function Progress({ value, className }) { return <div className={"prog " + (className || "")}><i style={{ width: Math.max(0, Math.min(100, value)) + "%" }}></i></div>; }

function StatCard({ label, value, icon, tone, deltaDir, delta, foot }) {
  return (
    <div className="stat">
      <div className="top"><span className="lbl">{label}</span><span className={"ic " + (tone || "")}><Icon name={icon} size={18} /></span></div>
      <div className="val num">{value}</div>
      {(delta || foot) && <div className="delta">{delta && <span className={deltaDir === 'down' ? 'down' : 'up'}>{delta}</span>}{foot}</div>}
    </div>
  );
}

// Apply a tenant accent to the document (white-label theming)
function applyAccent(hex, ink) {
  function mix(hex, p) {
    const c = hex.replace('#', '');
    const r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
    const m = (x) => Math.round(x + (255 - x) * p);
    const d = (x) => Math.round(x * (1 - p));
    return { soft: `rgb(${m(r)},${m(g)},${m(b)})`, deep: `rgb(${d(r)},${d(g)},${d(b)})` };
  }
  const root = document.documentElement.style;
  if (!hex) { // reset to platform indigo
    root.setProperty('--accent', '#4f46e5');
    root.setProperty('--accent-deep', '#4036c9');
    root.setProperty('--accent-soft', '#eef0fe');
    root.setProperty('--accent-ink', '#ffffff');
    return;
  }
  const t = mix(hex, 0.90), d = mix(hex, 0.18);
  root.setProperty('--accent', hex);
  root.setProperty('--accent-deep', d.deep);
  root.setProperty('--accent-soft', t.soft);
  root.setProperty('--accent-ink', ink || '#ffffff');
}

const STATUS_LABEL = {
  active: 'Active', arrears: 'In arrears', settled: 'Settled', pending: 'Pending', review: 'Review',
  approved: 'Approved', declined: 'Declined', trial: 'Trial', suspended: 'Suspended', overdue: 'Overdue', paid: 'Paid'
};

Object.assign(window, { Icon, Badge, Progress, StatCard, applyAccent, STATUS_LABEL });
