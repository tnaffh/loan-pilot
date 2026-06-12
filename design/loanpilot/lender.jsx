/* global React, LP, Icon, Badge, Progress, StatCard, STATUS_LABEL */
const { useState: useStateLD, useEffect: useEffectLD } = React;
const TENANT = LP.tenant('rfs'); // active workspace = Raccoons

function LenderSidebar({ section, setSection, open, close, pending }) {
  const items = [
    { id: 'overview', label: 'Overview', icon: 'grid' },
    { id: 'applications', label: 'Applications', icon: 'inbox', badge: pending },
    { id: 'loans', label: 'Loans', icon: 'doc' },
    { id: 'borrowers', label: 'Borrowers', icon: 'users' },
    { id: 'repayments', label: 'Repayments', icon: 'wallet' }
  ];
  const acct = [
    { id: 'billing', label: 'Billing', icon: 'card' },
    { id: 'settings', label: 'Settings', icon: 'cog' }
  ];
  return (
    <aside className={"sidebar" + (open ? " open" : "")}>
      <div className="brand">
        <span style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--lp)', display: 'grid', placeItems: 'center' }}><Icon name="plane" size={16} /></span>
        <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.03em' }}>Loan<span style={{ color: 'var(--lp)' }}>Pilot</span></span>
      </div>
      <div className="ws"><div className="ws-card"><div className="logo">{TENANT.short}</div><div><div className="nm">{TENANT.name}</div><div className="pl">{LP.plans[TENANT.plan].name} plan</div></div></div></div>
      <nav>
        <div className="navgrp">Lending</div>
        {items.map(it => <button key={it.id} className={"navitem" + (section === it.id ? " active" : "")} onClick={() => { setSection(it.id); close(); }}><Icon name={it.icon} />{it.label}{it.badge ? <span className="badge-count">{it.badge}</span> : null}</button>)}
        <div className="navgrp">Account</div>
        {acct.map(it => <button key={it.id} className={"navitem" + (section === it.id ? " active" : "")} onClick={() => { setSection(it.id); close(); }}><Icon name={it.icon} />{it.label}</button>)}
      </nav>
      <div className="who"><div className="av">EN</div><div><div className="nm">Eufemia N.</div><div className="rl">Principal Officer</div></div></div>
    </aside>
  );
}

function LOverview({ openLoan, setSection }) {
  const k = LP.lender;
  const recent = LP.applications.slice(0, 4);
  const watch = LP.loans.filter(l => l.status === 'arrears' || (l.status === 'active' && l.nextDue <= '2026-07-20')).slice(0, 5);
  return (
    <div className="content">
      <div className="page-head"><div><div className="pt">Good morning, Eufemia</div><div className="ps">Here's how {TENANT.name} looks today — 11 June 2026.</div></div>
        <div className="actions"><button className="btn btn-ghost btn-sm"><Icon name="download" size={16} />Export</button><button className="btn btn-accent btn-sm" onClick={() => setSection('applications')}><Icon name="inbox" size={16} />Review applications</button></div></div>
      <div className="stat-grid">
        <StatCard label="Active book size" value={LP.n$(k.bookSize)} icon="money" foot="outstanding balance" />
        <StatCard label="Active loans" value={k.activeCount} icon="doc" tone="green" foot={k.borrowers + ' borrowers'} />
        <StatCard label="In arrears" value={LP.n$(k.arrearsAmt)} icon="alert" tone="red" delta={k.arrearsCount + ' overdue'} deltaDir="down" />
        <StatCard label="Disbursed in June" value={LP.n$(k.disbursedMonth)} icon="up" foot="1 new loan funded" />
      </div>
      <div className="cols-2">
        <div className="panel">
          <div className="ph"><h3>Loans needing attention</h3><a href="#" onClick={e => { e.preventDefault(); setSection('loans'); }}>View all</a></div>
          <div className="table-scroll"><table className="tbl">
            <thead><tr><th>Borrower</th><th>Type</th><th>Next due</th><th className="right">Balance</th><th>Status</th></tr></thead>
            <tbody>{watch.map(l => { const b = LP.borrower(l.borrowerId); return (
              <tr key={l.id} className="clickable" onClick={() => openLoan(l.id)}>
                <td><div className="who"><div className="av">{b.initials}</div><div><div className="nm">{b.first} {b.last}</div><div className="sub">{l.id}</div></div></div></td>
                <td><span className="chip">{LP.typeLabel[l.type]}</span></td>
                <td className="mono">{l.nextDue}{l.daysLate ? <div className="sub" style={{ color: 'var(--bad)' }}>{l.daysLate}d late</div> : null}</td>
                <td className="right mono">{LP.n$(l.balance)}</td>
                <td><Badge status={l.status}>{STATUS_LABEL[l.status]}</Badge></td>
              </tr>); })}</tbody>
          </table></div>
        </div>
        <div className="panel">
          <div className="ph"><h3>Latest applications</h3><a href="#" onClick={e => { e.preventDefault(); setSection('applications'); }}>Queue</a></div>
          <div className="pb" style={{ paddingTop: 6 }}>{recent.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: '1px solid var(--line-soft)' }}>
              <div className="av" style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--accent-soft)', color: 'var(--accent-deep)', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 12 }}>{a.initials}</div>
              <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{a.name}</div><div className="sub" style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{LP.typeLabel[a.type]} · {LP.n$(a.amount)}</div></div>
              <Badge status={a.status}>{STATUS_LABEL[a.status]}</Badge>
            </div>))}</div>
        </div>
      </div>
    </div>
  );
}

function LApplications({ apps, act, openApp }) {
  const [f, setF] = useStateLD('all');
  const segs = ['all', 'pending', 'review', 'approved', 'declined'];
  const rows = apps.filter(a => f === 'all' || a.status === f);
  return (
    <div className="content">
      <div className="page-head"><div><div className="pt">Applications</div><div className="ps">Review, approve or decline incoming applications.</div></div></div>
      <div className="filters"><div className="seg">{segs.map(s => <button key={s} className={f === s ? 'active' : ''} onClick={() => setF(s)}>{s === 'all' ? 'All' : STATUS_LABEL[s]}</button>)}</div></div>
      <div className="panel"><div className="table-scroll"><table className="tbl">
        <thead><tr><th>Applicant</th><th>Type</th><th className="right">Amount</th><th>Term</th><th>Affordability</th><th>Status</th><th></th></tr></thead>
        <tbody>{rows.map(a => (
          <tr key={a.id} className="clickable" onClick={() => openApp(a.id)}>
            <td><div className="who"><div className="av">{a.initials}</div><div><div className="nm">{a.name}</div><div className="sub">{a.id} · {a.date}</div></div></div></td>
            <td><span className="chip">{LP.typeLabel[a.type]}</span></td>
            <td className="right mono">{LP.n$(a.amount)}</td>
            <td>{a.term}</td>
            <td><Badge status={a.affordability}>{a.affordability === 'pass' ? 'Pass' : a.affordability === 'fail' ? 'Review pay' : 'Check'}</Badge></td>
            <td><Badge status={a.status}>{STATUS_LABEL[a.status]}</Badge></td>
            <td className="right">{(a.status === 'pending' || a.status === 'review') ?
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                <button className="btn btn-soft btn-sm" onClick={() => act(a.id, 'approved')}>Approve</button>
                <button className="btn btn-danger btn-sm" onClick={() => act(a.id, 'declined')}>Decline</button>
              </div> : <span className="sub">—</span>}</td>
          </tr>))}
          {rows.length === 0 && <tr><td colSpan="7"><div className="empty">No applications here.</div></td></tr>}
        </tbody>
      </table></div></div>
    </div>
  );
}

function LLoans({ openLoan }) {
  const [f, setF] = useStateLD('all');
  const [ty, setTy] = useStateLD('all');
  const segs = ['all', 'active', 'arrears', 'settled'];
  const types = ['all', 'payday', 'business', 'collateral'];
  const rows = LP.loans.filter(l => (f === 'all' || l.status === f) && (ty === 'all' || l.type === ty));
  return (
    <div className="content">
      <div className="page-head"><div><div className="pt">Loans</div><div className="ps">{LP.loans.length} loans · {LP.n$(LP.lender.bookSize)} outstanding.</div></div>
        <div className="actions"><button className="btn btn-accent btn-sm"><Icon name="plus" size={16} />New loan</button></div></div>
      <div className="filters">
        <div className="seg">{segs.map(s => <button key={s} className={f === s ? 'active' : ''} onClick={() => setF(s)}>{s === 'all' ? 'All statuses' : STATUS_LABEL[s]}</button>)}</div>
        <div className="seg">{types.map(t => <button key={t} className={ty === t ? 'active' : ''} onClick={() => setTy(t)}>{t === 'all' ? 'All types' : LP.typeLabel[t]}</button>)}</div>
      </div>
      <div className="panel"><div className="table-scroll"><table className="tbl">
        <thead><tr><th>Loan</th><th>Borrower</th><th>Type</th><th className="right">Principal</th><th className="right">Balance</th><th>Progress</th><th>Status</th></tr></thead>
        <tbody>{rows.map(l => { const b = LP.borrower(l.borrowerId); return (
          <tr key={l.id} className="clickable" onClick={() => openLoan(l.id)}>
            <td className="mono nm">{l.id}</td>
            <td><div className="who"><div className="av">{b.initials}</div><div><div className="nm">{b.first} {b.last}</div><div className="sub">{b.id}</div></div></div></td>
            <td><span className="chip">{LP.typeLabel[l.type]}</span></td>
            <td className="right mono">{LP.n$(l.principal)}</td>
            <td className="right mono">{LP.n$(l.balance)}</td>
            <td style={{ minWidth: 120 }}><Progress className="sm" value={(l.paid / l.of) * 100} /><div className="sub" style={{ marginTop: 5 }}>{l.paid} of {l.of} paid</div></td>
            <td><Badge status={l.status}>{STATUS_LABEL[l.status]}</Badge></td>
          </tr>); })}</tbody>
      </table></div></div>
    </div>
  );
}

function LBorrowers({ openBorrower }) {
  const [q, setQ] = useStateLD('');
  const rows = LP.borrowers.filter(b => (b.first + ' ' + b.last + ' ' + b.id).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="content">
      <div className="page-head"><div><div className="pt">Borrowers</div><div className="ps">{LP.borrowers.length} registered borrowers.</div></div>
        <div className="actions"><div className="search" style={{ position: 'relative' }}><Icon name="search" size={16} /><input style={{ paddingLeft: 34, border: '1px solid var(--line)', borderRadius: 9, padding: '9px 14px 9px 36px', font: 'inherit', fontSize: 14, background: 'var(--card)' }} placeholder="Search name or ID" value={q} onChange={e => setQ(e.target.value)} /></div></div></div>
      <div className="panel"><div className="table-scroll"><table className="tbl">
        <thead><tr><th>Borrower</th><th>ID number</th><th>Employer</th><th className="right">Net income</th><th>Loans</th><th>Status</th></tr></thead>
        <tbody>{rows.map(b => { const ls = LP.loansFor(b.id).filter(l => l.status !== 'settled'); return (
          <tr key={b.id} className="clickable" onClick={() => openBorrower(b.id)}>
            <td><div className="who"><div className="av">{b.initials}</div><div><div className="nm">{b.first} {b.last}</div><div className="sub">{b.id} · {b.phone}</div></div></div></td>
            <td className="mono">{b.idNo}</td>
            <td>{b.employer}<div className="sub">{b.occupation}</div></td>
            <td className="right mono">{LP.n$(b.income)}</td>
            <td className="mono">{ls.length}</td>
            <td><Badge status={b.status}>{STATUS_LABEL[b.status]}</Badge></td>
          </tr>); })}</tbody>
      </table></div></div>
    </div>
  );
}

function LRepayments() {
  const txns = [
    { date: '2026-06-24', borrower: 'Helena Kapenda', loan: 'L-20451', amount: 5200, method: 'EFT', dir: 'in' },
    { date: '2026-06-20', borrower: 'Maria Shikongo', loan: 'L-20467', amount: 2925, method: 'Debit order', dir: 'in' },
    { date: '2026-06-15', borrower: 'Shateni Amukwa', loan: 'L-20399', amount: 0, method: 'Failed debit', dir: 'fail' },
    { date: '2026-06-12', borrower: 'Lukas Iipinge', loan: 'L-20412', amount: 11700, method: 'EFT', dir: 'in' },
    { date: '2026-06-10', borrower: 'Petrus Haufiku', loan: 'L-20470', amount: 30000, method: 'EFT', dir: 'in' }
  ];
  const inflow = txns.filter(t => t.dir === 'in').reduce((s, t) => s + t.amount, 0);
  return (
    <div className="content">
      <div className="page-head"><div><div className="pt">Repayments &amp; collections</div><div className="ps">Recent transactions across the book.</div></div></div>
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <StatCard label="Collected in June" value={LP.n$(inflow)} icon="down" tone="green" foot="5 transactions" />
        <StatCard label="Expected this week" value={LP.n$(13325)} icon="cal" foot="3 instalments due" />
        <StatCard label="Failed / missed" value={LP.n$(15600)} icon="alert" tone="red" foot="1 debit failed" />
      </div>
      <div className="panel"><div className="table-scroll"><table className="tbl">
        <thead><tr><th>Date</th><th>Borrower</th><th>Loan</th><th>Method</th><th className="right">Amount</th></tr></thead>
        <tbody>{txns.map((t, i) => (
          <tr key={i}><td className="mono">{t.date}</td><td className="nm">{t.borrower}</td><td className="mono">{t.loan}</td>
            <td>{t.dir === 'fail' ? <Badge status="arrears">{t.method}</Badge> : t.method}</td>
            <td className="right mono" style={{ color: t.dir === 'in' ? 'var(--ok)' : 'var(--bad)', fontWeight: 600 }}>{t.dir === 'in' ? '+' : ''}{LP.n$(t.amount)}</td>
          </tr>))}</tbody>
      </table></div></div>
    </div>
  );
}

function LBilling() {
  const plan = LP.plans[TENANT.plan];
  const usagePct = Math.round((TENANT.borrowers / 1000) * 100);
  return (
    <div className="content">
      <div className="page-head"><div><div className="pt">Billing &amp; subscription</div><div className="ps">Manage your LoanPilot plan, usage and invoices.</div></div></div>
      <div className="cols-2">
        <div className="gap">
          <div className="panel"><div className="ph"><h3>Current plan</h3><Badge status="active">Active</Badge></div>
            <div className="pb" style={{ padding: '4px 20px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}><span style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em' }}>{plan.name}</span><span className="sub" style={{ color: 'var(--ink-faint)' }}>{LP.n$(plan.price)}/mo</span></div>
              <div className="sub" style={{ color: 'var(--ink-soft)', margin: '6px 0 16px' }}>{plan.borrowers} · {plan.seats}. Renews 1 July 2026.</div>
              <div style={{ display: 'flex', gap: 10 }}><button className="btn btn-accent btn-sm">Upgrade to Pro</button><button className="btn btn-ghost btn-sm">Change plan</button></div>
            </div>
          </div>
          <div className="panel"><div className="ph"><h3>Usage</h3></div>
            <div className="pb" style={{ padding: '4px 20px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 8 }}><span className="sub" style={{ color: 'var(--ink-soft)' }}>Borrowers</span><span style={{ fontWeight: 600 }}>{TENANT.borrowers} / 1,000</span></div>
              <Progress value={usagePct} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, margin: '18px 0 8px' }}><span className="sub" style={{ color: 'var(--ink-soft)' }}>Staff seats</span><span style={{ fontWeight: 600 }}>4 / 10</span></div>
              <Progress value={40} />
            </div>
          </div>
        </div>
        <div className="gap">
          <div className="panel"><div className="ph"><h3>Payment method</h3><a href="#">Update</a></div>
            <div className="pb" style={{ padding: '4px 20px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--bg)', borderRadius: 'var(--r)', padding: 16 }}>
                <div style={{ width: 44, height: 30, borderRadius: 6, background: 'var(--ink)', color: '#fff', display: 'grid', placeItems: 'center' }}><Icon name="card" size={18} /></div>
                <div><div style={{ fontWeight: 600, fontSize: 14 }}>Bank Windhoek ···· 4421</div><div className="sub" style={{ color: 'var(--ink-faint)', fontSize: 12 }}>Debit order · next charge 1 Jul</div></div>
              </div>
            </div>
          </div>
          <div className="panel"><div className="ph"><h3>Invoices</h3></div>
            <div className="table-scroll"><table className="tbl">
              <thead><tr><th>Invoice</th><th>Period</th><th className="right">Amount</th><th></th></tr></thead>
              <tbody>{LP.lenderInvoices.map(i => (
                <tr key={i.id}><td className="mono nm">{i.id}</td><td className="sub">{i.plan}</td><td className="right mono">{LP.n$(i.amount)}</td>
                  <td className="right"><button className="btn btn-ghost btn-sm"><Icon name="download" size={14} />PDF</button></td></tr>))}</tbody>
            </table></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LSettings() {
  return (
    <div className="content">
      <div className="page-head"><div><div className="pt">Settings</div><div className="ps">Your workspace, brand and lending rules.</div></div></div>
      <div className="cols-2 even">
        <div className="panel"><div className="ph"><h3>Workspace &amp; brand</h3></div><div className="pb gap" style={{ padding: 18 }}>
          <div className="field"><label>Lender name</label><input defaultValue={TENANT.name} /></div>
          <div className="field"><label>NAMFISA licence</label><input defaultValue="25/11/1471" disabled /></div>
          <div className="field"><label>Brand accent colour</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 38, height: 38, borderRadius: 9, background: TENANT.accent, flex: 'none' }}></span>
              <input defaultValue={TENANT.accent} />
            </div>
          </div>
        </div></div>
        <div className="panel"><div className="ph"><h3>Lending rules</h3></div><div className="pb gap" style={{ padding: 18 }}>
          <div className="field"><label>Payday finance charge</label><input defaultValue="30%" /></div>
          <div className="field"><label>Minimum take-home protected</label><input defaultValue="50% of gross pay" disabled /></div>
          <div className="field"><label>Max payday term</label><input defaultValue="5 months" /></div>
          <p className="sub" style={{ fontSize: 12, color: 'var(--ink-faint)' }}>Changes here are illustrative in this prototype.</p>
        </div></div>
      </div>
    </div>
  );
}

Object.assign(window, { TENANT, LenderSidebar, LOverview, LApplications, LLoans, LBorrowers, LRepayments, LBilling, LSettings });
