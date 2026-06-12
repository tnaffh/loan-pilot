/* global React, LP, Icon, Badge, Progress, StatCard, STATUS_LABEL */
const { useState: useStatePF } = React;

function PlatformSidebar({ section, setSection, open, close }) {
  const items = [
    { id: 'overview', label: 'Overview', icon: 'grid' },
    { id: 'tenants', label: 'Lenders', icon: 'building' },
    { id: 'subscriptions', label: 'Subscriptions', icon: 'card' },
    { id: 'plans', label: 'Plans', icon: 'layers' }
  ];
  return (
    <aside className={"sidebar" + (open ? " open" : "")}>
      <div className="brand">
        <span style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--lp)', display: 'grid', placeItems: 'center' }}><Icon name="plane" size={18} /><span style={{ display: 'none' }} /></span>
        <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.03em' }}>Loan<span style={{ color: 'var(--lp)' }}>Pilot</span></span>
      </div>
      <div className="ws"><div className="ws-card"><div className="logo" style={{ background: 'var(--lp)' }}><Icon name="shield" size={16} /></div><div><div className="nm">LoanPilot</div><div className="pl">Platform console</div></div></div></div>
      <nav>
        <div className="navgrp">Operate</div>
        {items.map(it => <button key={it.id} className={"navitem" + (section === it.id ? " active" : "")} onClick={() => { setSection(it.id); close(); }}><Icon name={it.icon} />{it.label}</button>)}
      </nav>
      <div className="who"><div className="av">LP</div><div><div className="nm">You</div><div className="rl">Platform owner</div></div></div>
    </aside>
  );
}

function PlatformOverview({ openTenant, setSection }) {
  const p = LP.platform;
  const watch = LP.tenants.filter(t => t.status !== 'active').concat(LP.tenants.filter(t => t.status === 'active')).slice(0, 6);
  return (
    <div className="content">
      <div className="page-head"><div><div className="pt">Platform overview</div><div className="ps">How LoanPilot is performing across all lenders.</div></div>
        <div className="actions"><button className="btn btn-ghost btn-sm"><Icon name="download" size={16} />Export</button><button className="btn btn-accent btn-sm" style={{ background: 'var(--lp)' }} onClick={() => setSection('tenants')}><Icon name="plus" size={16} />Add lender</button></div></div>
      <div className="stat-grid">
        <StatCard label="Monthly recurring revenue" value={LP.n$(p.mrr)} icon="trend" tone="green" delta="+1 this month" foot="from subscriptions" />
        <StatCard label="Active lenders" value={p.active} icon="building" delta={p.trials + ' on trial'} foot="" />
        <StatCard label="Loans under management" value={LP.k$(p.book)} icon="money" foot="across all tenants" />
        <StatCard label="Borrowers reached" value={p.borrowers.toLocaleString('en-US')} icon="users" foot="platform-wide" />
      </div>
      <div className="cols-2">
        <div className="panel">
          <div className="ph"><h3>Lenders</h3><a href="#" onClick={e => { e.preventDefault(); setSection('tenants'); }}>View all</a></div>
          <div className="table-scroll"><table className="tbl">
            <thead><tr><th>Lender</th><th>Plan</th><th className="right">Book</th><th>Status</th></tr></thead>
            <tbody>{watch.map(t => (
              <tr key={t.id} className="clickable" onClick={() => openTenant(t.id)}>
                <td><div className="who"><div className="av" style={{ background: t.accent, color: '#fff' }}>{t.short}</div><div><div className="nm">{t.name}</div><div className="sub">{t.town}</div></div></div></td>
                <td><span className="chip">{LP.plans[t.plan].name}</span></td>
                <td className="right mono">{LP.k$(t.book)}</td>
                <td><Badge status={t.status}>{STATUS_LABEL[t.status]}</Badge></td>
              </tr>))}</tbody>
          </table></div>
        </div>
        <div className="panel">
          <div className="ph"><h3>Revenue by plan</h3></div>
          <div className="pb" style={{ paddingTop: 8 }}>
            {['pro', 'growth', 'starter'].map(id => {
              const plan = LP.plans[id];
              const count = LP.tenants.filter(t => t.plan === id && t.status === 'active').length;
              const rev = count * plan.price;
              const pct = LP.platform.mrr ? (rev / LP.platform.mrr) * 100 : 0;
              return (
                <div key={id} style={{ padding: '12px 0', borderBottom: '1px solid var(--line-soft)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 14 }}><span style={{ fontWeight: 600 }}>{plan.name} <span className="sub" style={{ color: 'var(--ink-faint)' }}>· {count} lender{count !== 1 ? 's' : ''}</span></span><span className="mono" style={{ fontWeight: 600 }}>{LP.n$(rev)}/mo</span></div>
                  <Progress value={pct} className="sm" />
                </div>
              );
            })}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, fontSize: 15 }}><span style={{ fontWeight: 700 }}>Total MRR</span><span className="mono" style={{ fontWeight: 700 }}>{LP.n$(LP.platform.mrr)}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlatformTenants({ openTenant }) {
  const [f, setF] = useStatePF('all');
  const segs = ['all', 'active', 'trial', 'suspended'];
  const rows = LP.tenants.filter(t => f === 'all' || t.status === f);
  return (
    <div className="content">
      <div className="page-head"><div><div className="pt">Lenders</div><div className="ps">{LP.tenants.length} microlenders on the platform.</div></div>
        <div className="actions"><button className="btn btn-accent btn-sm" style={{ background: 'var(--lp)' }}><Icon name="plus" size={16} />Onboard lender</button></div></div>
      <div className="filters"><div className="seg">{segs.map(s => <button key={s} className={f === s ? 'active' : ''} onClick={() => setF(s)} style={f === s ? { background: 'var(--lp)' } : null}>{s === 'all' ? 'All' : STATUS_LABEL[s]}</button>)}</div></div>
      <div className="panel"><div className="table-scroll"><table className="tbl">
        <thead><tr><th>Lender</th><th>Plan</th><th className="right">Borrowers</th><th className="right">Active loans</th><th className="right">Book size</th><th>Joined</th><th>Status</th></tr></thead>
        <tbody>{rows.map(t => (
          <tr key={t.id} className="clickable" onClick={() => openTenant(t.id)}>
            <td><div className="who"><div className="av" style={{ background: t.accent, color: '#fff' }}>{t.short}</div><div><div className="nm">{t.name}</div><div className="sub">{t.town}</div></div></div></td>
            <td><span className="chip">{LP.plans[t.plan].name}</span></td>
            <td className="right mono">{t.borrowers.toLocaleString('en-US')}</td>
            <td className="right mono">{t.activeLoans.toLocaleString('en-US')}</td>
            <td className="right mono">{LP.k$(t.book)}</td>
            <td className="mono">{t.joined}</td>
            <td><Badge status={t.status}>{STATUS_LABEL[t.status]}</Badge></td>
          </tr>))}</tbody>
      </table></div></div>
    </div>
  );
}

function PlatformSubscriptions() {
  const inv = LP.platformInvoices;
  return (
    <div className="content">
      <div className="page-head"><div><div className="pt">Subscriptions</div><div className="ps">Billing across all lenders.</div></div></div>
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <StatCard label="MRR" value={LP.n$(LP.platform.mrr)} icon="trend" tone="green" foot="recurring monthly" />
        <StatCard label="Annual run-rate" value={LP.k$(LP.platform.arr)} icon="money" foot="ARR" />
        <StatCard label="Overdue" value={LP.n$(1499)} icon="alert" tone="red" foot="1 invoice" />
      </div>
      <div className="panel"><div className="ph"><h3>Recent invoices</h3><a href="#">All invoices</a></div><div className="table-scroll"><table className="tbl">
        <thead><tr><th>Invoice</th><th>Lender</th><th>Plan</th><th>Date</th><th className="right">Amount</th><th>Status</th></tr></thead>
        <tbody>{inv.map(i => (
          <tr key={i.id}>
            <td className="mono nm">{i.id}</td><td>{i.tenant}</td><td><span className="chip">{i.plan}</span></td>
            <td className="mono">{i.date}</td><td className="right mono">{LP.n$(i.amount)}</td><td><Badge status={i.status}>{STATUS_LABEL[i.status]}</Badge></td>
          </tr>))}</tbody>
      </table></div></div>
    </div>
  );
}

function PlatformPlans() {
  const order = ['starter', 'growth', 'pro'];
  return (
    <div className="content">
      <div className="page-head"><div><div className="pt">Plans</div><div className="ps">Subscription tiers offered to lenders.</div></div>
        <div className="actions"><button className="btn btn-ghost btn-sm"><Icon name="plus" size={16} />New plan</button></div></div>
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        {order.map(id => {
          const p = LP.plans[id];
          const count = LP.tenants.filter(t => t.plan === id).length;
          return (
            <div className="panel" key={id} style={{ padding: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: 17 }}>{p.name}</h3>{p.popular && <Badge status="accent">Popular</Badge>}
              </div>
              <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em', marginTop: 10 }}>{LP.n$(p.price)}<span style={{ fontSize: 14, color: 'var(--ink-faint)', fontWeight: 600 }}>/mo</span></div>
              <div className="sub" style={{ color: 'var(--ink-faint)', fontSize: 13, marginBottom: 14 }}>{p.borrowers} · {p.seats}</div>
              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14, display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span className="sub" style={{ color: 'var(--ink-faint)' }}>Active lenders</span><span style={{ fontWeight: 700 }}>{count}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TenantDrawer({ id, close }) {
  const t = LP.tenant(id);
  const plan = LP.plans[t.plan];
  return (
    <div className="drawer-mask" onClick={close}>
      <div className="drawer" onClick={e => e.stopPropagation()}>
        <div className="dh" style={{ background: t.accent }}>
          <div className="row"><div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><div style={{ width: 46, height: 46, borderRadius: 12, background: 'rgba(255,255,255,.2)', display: 'grid', placeItems: 'center', fontWeight: 800 }}>{t.short}</div><div><div style={{ fontSize: 22, fontWeight: 700 }}>{t.name}</div><div className="meta" style={{ marginTop: 2 }}>{t.town} · joined {t.joined}</div></div></div><button className="x" onClick={close}>✕</button></div>
        </div>
        <div className="db">
          <div className="panel"><div className="pb" style={{ padding: 18 }}><div className="kv">
            <div><div className="k">Subscription</div><div className="v lg">{plan.name}</div></div>
            <div><div className="k">Monthly fee</div><div className="v lg">{LP.n$(plan.price)}</div></div>
            <div><div className="k">Status</div><div className="v"><Badge status={t.status}>{STATUS_LABEL[t.status]}</Badge></div></div>
            <div><div className="k">Brand accent</div><div className="v" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 18, height: 18, borderRadius: 5, background: t.accent }}></span>{t.accent}</div></div>
          </div></div></div>
          <div className="panel"><div className="ph"><h3>Lending activity</h3></div><div className="pb" style={{ padding: 18 }}><div className="kv">
            <div><div className="k">Borrowers</div><div className="v">{t.borrowers.toLocaleString('en-US')}</div></div>
            <div><div className="k">Active loans</div><div className="v">{t.activeLoans.toLocaleString('en-US')}</div></div>
            <div><div className="k">Book size</div><div className="v">{LP.n$(t.book)}</div></div>
            <div><div className="k">Plan limit</div><div className="v" style={{ fontSize: 13 }}>{plan.borrowers}</div></div>
          </div></div></div>
          <div className="act-bar">
            <button className="btn btn-accent btn-block" style={{ background: 'var(--lp)' }}><Icon name="ext" size={16} />Open workspace</button>
            <button className="btn btn-ghost"><Icon name="cog" size={16} />Manage</button>
          </div>
          {t.status === 'suspended' && <div style={{ background: 'var(--bad-soft)', color: 'var(--bad)', padding: '12px 16px', borderRadius: 'var(--r)', fontSize: 13 }}>Workspace suspended for overdue payment. Lending is paused until billing is resolved.</div>}
        </div>
      </div>
    </div>
  );
}

function PlatformApp({ onLogout }) {
  const [section, setSection] = useStatePF(() => localStorage.getItem('lp_pf_section') || 'overview');
  const [drawer, setDrawer] = useStatePF(null);
  const [sidebar, setSidebar] = useStatePF(false);
  React.useEffect(() => { localStorage.setItem('lp_pf_section', section); }, [section]);
  const openTenant = id => setDrawer(id);
  const titles = { overview: 'Platform overview', tenants: 'Lenders', subscriptions: 'Subscriptions', plans: 'Plans' };
  return (
    <div className="shell">
      {sidebar && <div className="sidebar-mask" onClick={() => setSidebar(false)}></div>}
      <PlatformSidebar section={section} setSection={setSection} open={sidebar} close={() => setSidebar(false)} />
      <div className="main">
        <div className="topbar">
          <button className="menu-btn" onClick={() => setSidebar(true)}><Icon name="menu" size={20} /></button>
          <h1>{titles[section]}</h1>
          <div className="spacer"></div>
          <div className="search"><Icon name="search" /><input placeholder="Search lenders…" /></div>
          <button className="icon-btn"><Icon name="bell" size={18} /><span className="dot"></span></button>
          <button className="icon-btn" onClick={onLogout} title="Sign out"><Icon name="logout" size={18} /></button>
        </div>
        {section === 'overview' && <PlatformOverview openTenant={openTenant} setSection={setSection} />}
        {section === 'tenants' && <PlatformTenants openTenant={openTenant} />}
        {section === 'subscriptions' && <PlatformSubscriptions />}
        {section === 'plans' && <PlatformPlans />}
      </div>
      {drawer && <TenantDrawer id={drawer} close={() => setDrawer(null)} />}
    </div>
  );
}

window.PlatformApp = PlatformApp;
