/* global React, RFS, Icon, Badge, Avatar, Progress, StatCard, STATUS_LABEL */
const { useState } = React;

// ---- Sidebar ----
function StaffSidebar({ section, setSection, open, close, pendingCount }) {
  const items = [
    { id: 'overview', label: 'Overview', icon: 'grid' },
    { id: 'applications', label: 'Applications', icon: 'inbox', badge: pendingCount },
    { id: 'loans', label: 'Loans', icon: 'doc' },
    { id: 'borrowers', label: 'Borrowers', icon: 'users' },
    { id: 'repayments', label: 'Repayments', icon: 'wallet' }
  ];
  return (
    <aside className={"sidebar" + (open ? " open" : "")}>
      <div className="brand"><img src="assets/rfs-lockup-white.png" alt="Raccoons Financial Services" /></div>
      <nav>
        <div className="navgrp">Lending</div>
        {items.map(it => (
          <button key={it.id} className={"navitem" + (section === it.id ? " active" : "")}
            onClick={() => { setSection(it.id); close(); }}>
            <Icon name={it.icon} />{it.label}
            {it.badge ? <span className="badge-count">{it.badge}</span> : null}
          </button>
        ))}
        <div className="navgrp">Account</div>
        <button className={"navitem" + (section === 'settings' ? " active" : "")} onClick={() => { setSection('settings'); close(); }}>
          <Icon name="cog" />Settings
        </button>
      </nav>
      <div className="who">
        <div className="av">EN</div>
        <div><div className="nm">Eufemia N.</div><div className="rl">Principal Officer</div></div>
      </div>
    </aside>
  );
}

// ---- Overview ----
function Overview({ openLoan, setSection }) {
  const k = RFS.kpis;
  const recentApps = RFS.applications.slice(0, 4);
  const watch = RFS.loans.filter(l => l.status === 'arrears' || (l.status === 'active' && l.nextDue <= '2026-07-20')).slice(0, 5);
  return (
    <div className="content">
      <div className="page-head">
        <div><div className="pt">Good morning, Eufemia</div><div className="ps">Here's how the book looks today — 11 June 2026.</div></div>
        <div className="actions"><button className="btn btn-ghost btn-sm"><Icon name="download" size={16} />Export</button><button className="btn btn-primary btn-sm" onClick={() => setSection('applications')}><Icon name="inbox" size={16} />Review applications</button></div>
      </div>
      <div className="stat-grid">
        <StatCard label="Active book size" value={RFS.n$(k.bookSize)} icon="money" tone="" delta="Outstanding balance" />
        <StatCard label="Active loans" value={k.activeCount} icon="doc" tone="green" delta={k.borrowers + " borrowers"} />
        <StatCard label="In arrears" value={RFS.n$(k.arrearsAmt)} icon="alert" tone="red" delta={k.arrearsCount + " loan(s) overdue"} deltaDir="down" />
        <StatCard label="Disbursed in June" value={RFS.n$(k.disbursedMonth)} icon="up" tone="" delta="1 new loan funded" />
      </div>
      <div className="cols-2">
        <div className="panel">
          <div className="ph"><h3>Loans needing attention</h3><a href="#" onClick={e => { e.preventDefault(); setSection('loans'); }}>View all</a></div>
          <div className="table-scroll">
            <table className="tbl">
              <thead><tr><th>Borrower</th><th>Loan</th><th>Next due</th><th className="right">Balance</th><th>Status</th></tr></thead>
              <tbody>
                {watch.map(l => {
                  const b = RFS.borrower(l.borrowerId);
                  return (
                    <tr key={l.id} className="clickable" onClick={() => openLoan(l.id)}>
                      <td><div className="who"><div className="av">{b.initials}</div><div><div className="nm">{b.first} {b.last}</div><div className="sub">{l.id}</div></div></div></td>
                      <td><span className="chip">{RFS.typeLabel[l.type]}</span></td>
                      <td className="mono">{l.nextDue}{l.daysLate ? <div className="sub" style={{ color: 'var(--bad)' }}>{l.daysLate} days late</div> : null}</td>
                      <td className="right mono">{RFS.n$(l.balance)}</td>
                      <td><Badge status={l.status}>{STATUS_LABEL[l.status]}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="panel">
          <div className="ph"><h3>Latest applications</h3><a href="#" onClick={e => { e.preventDefault(); setSection('applications'); }}>Queue</a></div>
          <div className="pb">
            {recentApps.map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--line-soft)' }}>
                <div className="av" style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--info-bg)', color: 'var(--navy)', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 12 }}>{a.initials}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{a.name}</div>
                  <div className="sub" style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{RFS.typeLabel[a.type]} · {RFS.n$(a.amount)}</div>
                </div>
                <Badge status={a.status}>{STATUS_LABEL[a.status]}</Badge>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Applications ----
function Applications({ apps, act, openApp }) {
  const [filter, setFilter] = useState('all');
  const segs = ['all', 'pending', 'review', 'approved', 'declined'];
  const rows = apps.filter(a => filter === 'all' ? true : a.status === filter);
  return (
    <div className="content">
      <div className="page-head"><div><div className="pt">Applications</div><div className="ps">Review, approve or decline incoming loan applications.</div></div></div>
      <div className="filters"><div className="seg">{segs.map(s => <button key={s} className={filter === s ? 'active' : ''} onClick={() => setFilter(s)}>{s === 'all' ? 'All' : STATUS_LABEL[s]}</button>)}</div></div>
      <div className="panel"><div className="table-scroll"><table className="tbl">
        <thead><tr><th>Applicant</th><th>Type</th><th className="right">Amount</th><th>Term</th><th>Affordability</th><th>Applied</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {rows.map(a => (
            <tr key={a.id} className="clickable" onClick={() => openApp(a.id)}>
              <td><div className="who"><div className="av">{a.initials}</div><div><div className="nm">{a.name}</div><div className="sub">{a.id}</div></div></div></td>
              <td><span className="chip">{RFS.typeLabel[a.type]}</span></td>
              <td className="right mono">{RFS.n$(a.amount)}</td>
              <td>{a.term}</td>
              <td><Badge status={a.affordability}>{a.affordability === 'pass' ? 'Pass' : a.affordability === 'fail' ? 'Review pay' : 'Check'}</Badge></td>
              <td className="mono">{a.date}</td>
              <td><Badge status={a.status}>{STATUS_LABEL[a.status]}</Badge></td>
              <td className="right">{(a.status === 'pending' || a.status === 'review') ?
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                  <button className="btn btn-lime btn-sm" onClick={() => act(a.id, 'approved')}>Approve</button>
                  <button className="btn btn-danger btn-sm" onClick={() => act(a.id, 'declined')}>Decline</button>
                </div> : <span className="sub">—</span>}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan="8"><div className="empty">No applications in this view.</div></td></tr>}
        </tbody>
      </table></div></div>
    </div>
  );
}

// ---- Loans ----
function Loans({ openLoan }) {
  const [filter, setFilter] = useState('all');
  const [type, setType] = useState('all');
  const segs = ['all', 'active', 'arrears', 'settled'];
  const types = ['all', 'payday', 'business', 'collateral'];
  const rows = RFS.loans.filter(l => (filter === 'all' || l.status === filter) && (type === 'all' || l.type === type));
  return (
    <div className="content">
      <div className="page-head"><div><div className="pt">Loans</div><div className="ps">{RFS.loans.length} loans · {RFS.n$(RFS.kpis.bookSize)} outstanding.</div></div>
        <div className="actions"><button className="btn btn-ghost btn-sm"><Icon name="download" size={16} />Export</button></div></div>
      <div className="filters">
        <div className="seg">{segs.map(s => <button key={s} className={filter === s ? 'active' : ''} onClick={() => setFilter(s)}>{s === 'all' ? 'All statuses' : STATUS_LABEL[s]}</button>)}</div>
        <div className="seg">{types.map(t => <button key={t} className={type === t ? 'active' : ''} onClick={() => setType(t)}>{t === 'all' ? 'All types' : RFS.typeLabel[t]}</button>)}</div>
      </div>
      <div className="panel"><div className="table-scroll"><table className="tbl">
        <thead><tr><th>Loan</th><th>Borrower</th><th>Type</th><th className="right">Principal</th><th className="right">Balance</th><th>Progress</th><th>Next due</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map(l => {
            const b = RFS.borrower(l.borrowerId);
            return (
              <tr key={l.id} className="clickable" onClick={() => openLoan(l.id)}>
                <td className="mono"><span className="nm">{l.id}</span></td>
                <td><div className="who"><div className="av">{b.initials}</div><div><div className="nm">{b.first} {b.last}</div><div className="sub">{b.id}</div></div></div></td>
                <td><span className="chip">{RFS.typeLabel[l.type]}</span></td>
                <td className="right mono">{RFS.n$(l.principal)}</td>
                <td className="right mono">{RFS.n$(l.balance)}</td>
                <td style={{ minWidth: 120 }}><Progress className="sm" value={(l.paid / l.of) * 100} /><div className="sub" style={{ marginTop: 5 }}>{l.paid} of {l.of} paid</div></td>
                <td className="mono">{l.nextDue}{l.daysLate ? <div className="sub" style={{ color: 'var(--bad)' }}>{l.daysLate}d late</div> : null}</td>
                <td><Badge status={l.status}>{STATUS_LABEL[l.status]}</Badge></td>
              </tr>
            );
          })}
        </tbody>
      </table></div></div>
    </div>
  );
}

// ---- Borrowers ----
function Borrowers({ openBorrower }) {
  const [q, setQ] = useState('');
  const rows = RFS.borrowers.filter(b => (b.first + ' ' + b.last + ' ' + b.id).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="content">
      <div className="page-head"><div><div className="pt">Borrowers</div><div className="ps">{RFS.borrowers.length} registered borrowers.</div></div>
        <div className="actions"><div className="search" style={{ position: 'relative' }}><Icon name="search" size={16} /><input style={{ paddingLeft: 34, border: '1px solid var(--line)', borderRadius: 9, padding: '9px 14px 9px 36px', font: 'inherit', fontSize: 14 }} placeholder="Search name or ID" value={q} onChange={e => setQ(e.target.value)} /></div></div></div>
      <div className="panel"><div className="table-scroll"><table className="tbl">
        <thead><tr><th>Borrower</th><th>ID number</th><th>Employer</th><th className="right">Net income</th><th>Active loans</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map(b => {
            const ls = RFS.loansFor(b.id).filter(l => l.status !== 'settled');
            return (
              <tr key={b.id} className="clickable" onClick={() => openBorrower(b.id)}>
                <td><div className="who"><div className="av">{b.initials}</div><div><div className="nm">{b.first} {b.last}</div><div className="sub">{b.id} · {b.phone}</div></div></div></td>
                <td className="mono">{b.idNo}</td>
                <td>{b.employer}<div className="sub">{b.occupation}</div></td>
                <td className="right mono">{RFS.n$(b.income)}</td>
                <td className="mono">{ls.length}</td>
                <td><Badge status={b.status}>{STATUS_LABEL[b.status]}</Badge></td>
              </tr>
            );
          })}
        </tbody>
      </table></div></div>
    </div>
  );
}

// ---- Repayments ----
function Repayments() {
  const txns = [
    { date: '2026-06-24', borrower: 'Helena Kapenda', loan: 'L-20451', amount: 5200, method: 'EFT', dir: 'in' },
    { date: '2026-06-20', borrower: 'Maria Shikongo', loan: 'L-20467', amount: 2925, method: 'Debit order', dir: 'in' },
    { date: '2026-06-15', borrower: 'Shateni Amukwa', loan: 'L-20399', amount: 0, method: 'Failed debit', dir: 'fail' },
    { date: '2026-06-12', borrower: 'Lukas Iipinge', loan: 'L-20412', amount: 11700, method: 'EFT', dir: 'in' },
    { date: '2026-06-10', borrower: 'Petrus Haufiku', loan: 'L-20470', amount: 30000, method: 'EFT', dir: 'in' },
    { date: '2026-06-02', borrower: 'Trofimus Nangolo', loan: 'L-20448', amount: 8000, method: 'Disbursement', dir: 'out' }
  ];
  const inflow = txns.filter(t => t.dir === 'in').reduce((s, t) => s + t.amount, 0);
  return (
    <div className="content">
      <div className="page-head"><div><div className="pt">Repayments &amp; collections</div><div className="ps">Recent transactions across the book.</div></div></div>
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <StatCard label="Collected in June" value={RFS.n$(inflow)} icon="down" tone="green" delta="6 transactions" />
        <StatCard label="Expected this week" value={RFS.n$(13325)} icon="cal" tone="" delta="3 instalments due" />
        <StatCard label="Failed / missed" value={RFS.n$(15600)} icon="alert" tone="red" delta="1 debit failed" deltaDir="down" />
      </div>
      <div className="panel"><div className="table-scroll"><table className="tbl">
        <thead><tr><th>Date</th><th>Borrower</th><th>Loan</th><th>Method</th><th className="right">Amount</th></tr></thead>
        <tbody>
          {txns.map((t, i) => (
            <tr key={i}>
              <td className="mono">{t.date}</td>
              <td className="nm">{t.borrower}</td>
              <td className="mono">{t.loan}</td>
              <td>{t.dir === 'fail' ? <Badge status="arrears">{t.method}</Badge> : t.dir === 'out' ? <span className="chip">{t.method}</span> : t.method}</td>
              <td className="right mono" style={{ color: t.dir === 'in' ? 'var(--ok)' : t.dir === 'out' ? 'var(--ink)' : 'var(--bad)', fontWeight: 600 }}>
                {t.dir === 'in' ? '+' : t.dir === 'out' ? '−' : ''}{RFS.n$(t.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table></div></div>
    </div>
  );
}

function Settings() {
  return (
    <div className="content">
      <div className="page-head"><div><div className="pt">Settings</div><div className="ps">Organisation &amp; lending configuration.</div></div></div>
      <div className="cols-2 even">
        <div className="panel"><div className="ph"><h3>Organisation</h3></div><div className="pb gap" style={{ paddingTop: 14 }}>
          <div className="field"><label>Trading name</label><input defaultValue="Raccoons Financial Services" /></div>
          <div className="field"><label>NAMFISA licence</label><input defaultValue="25/11/1471" disabled /></div>
          <div className="field"><label>Branch address</label><input defaultValue="Erf 863, Otjomuise Lifestyle, Stockholm Street, Windhoek" /></div>
        </div></div>
        <div className="panel"><div className="ph"><h3>Lending rules</h3></div><div className="pb gap" style={{ paddingTop: 14 }}>
          <div className="field"><label>Max payday finance charge</label><input defaultValue="30%" /></div>
          <div className="field"><label>Minimum take-home protected</label><input defaultValue="50% of gross pay" disabled /></div>
          <div className="field"><label>Max payday term</label><input defaultValue="5 months" /></div>
          <p className="sub" style={{ fontSize: 12, color: 'var(--ink-faint)' }}>Changes here are illustrative in this prototype.</p>
        </div></div>
      </div>
    </div>
  );
}

Object.assign(window, { StaffSidebar, Overview, Applications, Loans, Borrowers, Repayments, Settings });
