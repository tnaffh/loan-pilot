/* global React, LP, Icon, Badge, Progress, STATUS_LABEL, TENANT, LenderSidebar, LOverview, LApplications, LLoans, LBorrowers, LRepayments, LBilling, LSettings */
const { useState: useStateLA, useEffect: useEffectLA } = React;

function LLoanDrawer({ id, close, openBorrower }) {
  const l = LP.loans.find(x => x.id === id);
  const b = LP.borrower(l.borrowerId);
  return (
    <div className="drawer-mask" onClick={close}>
      <div className="drawer" onClick={e => e.stopPropagation()}>
        <div className="dh">
          <div className="row"><span className="badge">{LP.typeLabel[l.type]}</span><button className="x" onClick={close}>✕</button></div>
          <h2>{LP.n$(l.principal)} loan</h2>
          <div className="meta"><span>{l.id}</span><span>·</span><span>{b.first} {b.last}</span><Badge status={l.status}>{STATUS_LABEL[l.status]}</Badge></div>
        </div>
        <div className="db">
          <div className="panel"><div className="pb" style={{ padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}><span className="sub" style={{ color: 'var(--ink-faint)', fontSize: 13 }}>Repayment progress</span><span style={{ fontWeight: 600, fontSize: 13 }}>{l.paid} of {l.of} instalments</span></div>
            <Progress value={(l.paid / l.of) * 100} />
            <div className="kv" style={{ marginTop: 18 }}>
              <div><div className="k">Outstanding balance</div><div className="v lg">{LP.n$(l.balance)}</div></div>
              <div><div className="k">Total repayable</div><div className="v lg">{LP.n$(l.total)}</div></div>
              <div><div className="k">Instalment</div><div className="v">{LP.n$(l.instalment)}</div></div>
              <div><div className="k">Term</div><div className="v">{l.term} month{l.term > 1 ? 's' : ''}</div></div>
              <div><div className="k">Disbursed</div><div className="v">{l.disbursed}</div></div>
              <div><div className="k">Next due</div><div className="v">{l.nextDue}{l.daysLate ? <span style={{ color: 'var(--bad)' }}> · {l.daysLate}d late</span> : ''}</div></div>
              {l.collateral && <div style={{ gridColumn: '1 / -1' }}><div className="k">Collateral</div><div className="v">{l.collateral}</div></div>}
            </div>
          </div></div>
          <div className="panel"><div className="ph"><h3>Borrower</h3><a href="#" onClick={e => { e.preventDefault(); close(); openBorrower(b.id); }}>View profile</a></div>
            <div className="pb" style={{ padding: 18 }}><div className="kv">
              <div><div className="k">Name</div><div className="v">{b.first} {b.last}</div></div>
              <div><div className="k">Phone</div><div className="v">{b.phone}</div></div>
              <div><div className="k">Employer</div><div className="v">{b.employer}</div></div>
              <div><div className="k">Net income</div><div className="v">{LP.n$(b.income)}</div></div>
            </div></div>
          </div>
          <div className="act-bar"><button className="btn btn-accent btn-block"><Icon name="wallet" size={16} />Record payment</button><button className="btn btn-ghost"><Icon name="download" size={16} />Statement</button></div>
        </div>
      </div>
    </div>
  );
}

function LBorrowerDrawer({ id, close, openLoan }) {
  const b = LP.borrower(id);
  const loans = LP.loansFor(id);
  return (
    <div className="drawer-mask" onClick={close}>
      <div className="drawer" onClick={e => e.stopPropagation()}>
        <div className="dh">
          <div className="row"><div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,.2)', display: 'grid', placeItems: 'center', fontWeight: 700 }}>{b.initials}</div><div><div style={{ fontSize: 22, fontWeight: 700 }}>{b.first} {b.last}</div><div className="meta" style={{ marginTop: 0 }}>{b.id}</div></div></div><button className="x" onClick={close}>✕</button></div>
        </div>
        <div className="db">
          <div className="panel"><div className="ph"><h3>Personal &amp; KYC</h3><Badge status={b.status}>{STATUS_LABEL[b.status]}</Badge></div>
            <div className="pb" style={{ padding: 18 }}><div className="kv">
              <div><div className="k">I.D. number</div><div className="v">{b.idNo}</div></div>
              <div><div className="k">Phone</div><div className="v">{b.phone}</div></div>
              <div><div className="k">Email</div><div className="v" style={{ fontSize: 13 }}>{b.email}</div></div>
              <div><div className="k">Client since</div><div className="v">{b.since}</div></div>
              <div style={{ gridColumn: '1 / -1' }}><div className="k">Residential address</div><div className="v" style={{ fontSize: 14 }}>{b.address}</div></div>
            </div></div>
          </div>
          <div className="panel"><div className="ph"><h3>Employment &amp; banking</h3></div>
            <div className="pb" style={{ padding: 18 }}><div className="kv">
              <div><div className="k">Employer</div><div className="v">{b.employer}</div></div>
              <div><div className="k">Occupation</div><div className="v">{b.occupation}</div></div>
              <div><div className="k">Employment</div><div className="v">{b.empType}</div></div>
              <div><div className="k">Net income</div><div className="v">{LP.n$(b.income)}</div></div>
              <div><div className="k">Bank</div><div className="v">{b.bank}</div></div>
              <div><div className="k">Account</div><div className="v">{b.acct}</div></div>
            </div></div>
          </div>
          <div className="panel"><div className="ph"><h3>Loans ({loans.length})</h3></div>
            <div className="table-scroll"><table className="tbl">
              <thead><tr><th>Loan</th><th>Type</th><th className="right">Balance</th><th>Status</th></tr></thead>
              <tbody>{loans.map(l => (
                <tr key={l.id} className="clickable" onClick={() => { close(); openLoan(l.id); }}>
                  <td className="mono nm">{l.id}</td><td><span className="chip">{LP.typeLabel[l.type]}</span></td>
                  <td className="right mono">{LP.n$(l.balance)}</td><td><Badge status={l.status}>{STATUS_LABEL[l.status]}</Badge></td>
                </tr>))}</tbody>
            </table></div>
          </div>
          <div className="act-bar"><button className="btn btn-accent btn-block"><Icon name="phone" size={16} />Contact</button><button className="btn btn-ghost"><Icon name="plus" size={16} />New loan</button></div>
        </div>
      </div>
    </div>
  );
}

function LAppDrawer({ id, apps, act, close }) {
  const a = apps.find(x => x.id === id);
  if (!a) return null;
  const aff = a.affordability;
  return (
    <div className="drawer-mask" onClick={close}>
      <div className="drawer" onClick={e => e.stopPropagation()}>
        <div className="dh">
          <div className="row"><span className="badge">{LP.typeLabel[a.type]}</span><button className="x" onClick={close}>✕</button></div>
          <h2>{a.name}</h2>
          <div className="meta"><span>{a.id}</span><span>·</span><span>Applied {a.date}</span><Badge status={a.status}>{STATUS_LABEL[a.status]}</Badge></div>
        </div>
        <div className="db">
          <div className="panel"><div className="pb" style={{ padding: 18 }}><div className="kv">
            <div><div className="k">Amount requested</div><div className="v lg">{LP.n$(a.amount)}</div></div>
            <div><div className="k">Term</div><div className="v lg">{a.term}</div></div>
            <div><div className="k">Declared income</div><div className="v">{LP.n$(a.income)}</div></div>
            <div><div className="k">Loan type</div><div className="v">{LP.typeLabel[a.type]}</div></div>
          </div></div></div>
          <div className="panel"><div className="ph"><h3>Affordability check</h3><Badge status={aff}>{aff === 'pass' ? 'Pass' : aff === 'fail' ? 'Review pay' : 'Needs check'}</Badge></div>
            <div className="pb" style={{ padding: 18 }}><p className="sub" style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
              {aff === 'pass' ? 'After estimated deductions the applicant retains more than 50% of gross pay. Within responsible-lending limits.'
                : aff === 'fail' ? 'Estimated repayment would leave the applicant with less than 50% of gross pay. Reduce the amount or decline.'
                  : 'Income documents need manual verification before a decision.'}
            </p></div>
          </div>
          {(a.status === 'pending' || a.status === 'review') &&
            <div className="act-bar"><button className="btn btn-accent btn-block" onClick={() => { act(a.id, 'approved'); close(); }}><Icon name="check" size={16} />Approve</button><button className="btn btn-danger" onClick={() => { act(a.id, 'declined'); close(); }}><Icon name="x" size={16} />Decline</button></div>}
        </div>
      </div>
    </div>
  );
}

function LenderApp({ onLogout }) {
  const [section, setSection] = useStateLA(() => localStorage.getItem('lp_ld_section') || 'overview');
  const [apps, setApps] = useStateLA(LP.applications.map(a => Object.assign({}, a)));
  const [drawer, setDrawer] = useStateLA(null);
  const [sidebar, setSidebar] = useStateLA(false);
  useEffectLA(() => { localStorage.setItem('lp_ld_section', section); }, [section]);

  const pending = apps.filter(a => a.status === 'pending' || a.status === 'review').length;
  function act(id, status) { setApps(prev => prev.map(a => a.id === id ? Object.assign({}, a, { status }) : a)); }
  const openLoan = id => setDrawer({ t: 'loan', id });
  const openBorrower = id => setDrawer({ t: 'borrower', id });
  const openApp = id => setDrawer({ t: 'app', id });
  const titles = { overview: 'Overview', applications: 'Applications', loans: 'Loans', borrowers: 'Borrowers', repayments: 'Repayments', billing: 'Billing', settings: 'Settings' };

  return (
    <div className="shell">
      {sidebar && <div className="sidebar-mask" onClick={() => setSidebar(false)}></div>}
      <LenderSidebar section={section} setSection={setSection} open={sidebar} close={() => setSidebar(false)} pending={pending} />
      <div className="main">
        <div className="topbar">
          <button className="menu-btn" onClick={() => setSidebar(true)}><Icon name="menu" size={20} /></button>
          <h1>{titles[section]}</h1>
          <div className="spacer"></div>
          <div className="search"><Icon name="search" /><input placeholder="Search loans, borrowers…" /></div>
          <button className="icon-btn"><Icon name="bell" size={18} /><span className="dot"></span></button>
          <button className="icon-btn" onClick={onLogout} title="Sign out"><Icon name="logout" size={18} /></button>
        </div>
        {section === 'overview' && <LOverview openLoan={openLoan} setSection={setSection} />}
        {section === 'applications' && <LApplications apps={apps} act={act} openApp={openApp} />}
        {section === 'loans' && <LLoans openLoan={openLoan} />}
        {section === 'borrowers' && <LBorrowers openBorrower={openBorrower} />}
        {section === 'repayments' && <LRepayments />}
        {section === 'billing' && <LBilling />}
        {section === 'settings' && <LSettings />}
      </div>
      {drawer && drawer.t === 'loan' && <LLoanDrawer id={drawer.id} close={() => setDrawer(null)} openBorrower={openBorrower} />}
      {drawer && drawer.t === 'borrower' && <LBorrowerDrawer id={drawer.id} close={() => setDrawer(null)} openLoan={openLoan} />}
      {drawer && drawer.t === 'app' && <LAppDrawer id={drawer.id} apps={apps} act={act} close={() => setDrawer(null)} />}
    </div>
  );
}

window.LenderApp = LenderApp;
