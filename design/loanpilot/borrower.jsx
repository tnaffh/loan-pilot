/* global React, LP, Icon, Badge, Progress, STATUS_LABEL, TENANT */
const { useState: useStateBP, useEffect: useEffectBP } = React;

function BPayModal({ kind, loan, close }) {
  const [done, setDone] = useStateBP(false);
  const amount = kind === 'settle' ? loan.balance : loan.instalment;
  return (
    <div className="modal-mask" onClick={close}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        {!done ? <>
          <h3>{kind === 'settle' ? 'Settle loan early' : 'Make a payment'}</h3>
          <p>{kind === 'settle' ? 'Pay the full outstanding balance now and close this loan — no early-settlement penalty.' : 'Pay your next instalment towards loan ' + loan.id + '.'}</p>
          <div className="field"><label>Amount</label><input defaultValue={LP.n$(amount)} /></div>
          <div className="field"><label>Pay from</label><select><option>Bank Windhoek · Savings ···· 4421</option><option>Add a new method…</option></select></div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}><button className="btn btn-ghost" onClick={close}>Cancel</button><button className="btn btn-accent btn-block" onClick={() => setDone(true)}>Pay {LP.n$(amount)}</button></div>
        </> : <div style={{ textAlign: 'center' }}>
          <div className="tick"><Icon name="check" size={28} /></div>
          <h3>Payment successful</h3>
          <p>{LP.n$(amount)} received. {kind === 'settle' ? 'Your loan is now settled — thank you!' : 'Your balance has been updated.'}</p>
          <button className="btn btn-accent btn-block" onClick={close}>Done</button>
        </div>}
      </div>
    </div>
  );
}

function BorrowerApp({ onLogout }) {
  const b = LP.borrower('B-1042');
  const loan = LP.loans.find(l => l.id === 'L-20451');
  const [tab, setTab] = useStateBP(() => localStorage.getItem('lp_bp_tab') || 'overview');
  const [modal, setModal] = useStateBP(null);
  useEffectBP(() => { localStorage.setItem('lp_bp_tab', tab); }, [tab]);
  const pct = (loan.paid / loan.of) * 100;

  return (
    <div style={{ minHeight: '100vh' }}>
      <div className="topbar" style={{ paddingLeft: 22, paddingRight: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13 }}>{TENANT.short}</div>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{TENANT.name}</span>
        </div>
        <div className="spacer"></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--accent-soft)', color: 'var(--accent-deep)', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 13 }}>{b.initials}</div>
          <button className="icon-btn" onClick={onLogout} title="Sign out"><Icon name="logout" size={18} /></button>
        </div>
      </div>

      <div style={{ maxWidth: 940, margin: '0 auto', padding: 24 }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 25, fontWeight: 700, letterSpacing: '-0.02em' }}>Hello, {b.first}</div>
          <div className="sub" style={{ color: 'var(--ink-soft)' }}>Here's where your loan stands today.</div>
        </div>

        {/* Hero */}
        <div style={{ background: 'linear-gradient(150deg, var(--accent), var(--accent-deep))', color: '#fff', borderRadius: 'var(--r-xl)', padding: '26px 28px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.06) 1px, transparent 1px)', backgroundSize: '34px 34px' }}></div>
          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: 12, opacity: .8, textTransform: 'uppercase', letterSpacing: '.08em' }}>Balance remaining</div>
            <div className="num" style={{ fontSize: 42, fontWeight: 800, letterSpacing: '-0.03em', margin: '4px 0 2px' }}>{LP.n$(loan.balance)}</div>
            <div style={{ fontSize: 14, opacity: .85 }}>of {LP.n$(loan.total)} total · {LP.typeLabel[loan.type]} loan {loan.id}</div>
            <div style={{ height: 7, borderRadius: 99, background: 'rgba(255,255,255,.22)', overflow: 'hidden', margin: '16px 0 8px' }}><i style={{ display: 'block', height: '100%', width: pct + '%', background: '#fff', borderRadius: 99 }}></i></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, opacity: .85 }}><span>{loan.paid} of {loan.of} instalments paid</span><span>Next due {loan.nextDue}</span></div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, margin: '16px 0' }}>
          {[['wallet', 'Make a payment', () => setModal('pay')], ['check', 'Settle early', () => setModal('settle')], ['download', 'Statements', () => setTab('documents')]].map((a, i) => (
            <button key={i} className="panel" style={{ padding: 16, textAlign: 'center', border: 'none', cursor: 'pointer' }} onClick={a[2]}>
              <div style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--accent-soft)', color: 'var(--accent-deep)', display: 'grid', placeItems: 'center', margin: '0 auto 9px' }}><Icon name={a[0]} /></div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{a[1]}</div>
            </button>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 18, borderBottom: '1px solid var(--line)', margin: '22px 0 18px', overflowX: 'auto' }}>
          {['overview', 'schedule', 'documents', 'profile'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ background: 'none', border: 'none', padding: '12px 0', fontSize: 14, fontWeight: 600, color: tab === t ? 'var(--accent-deep)' : 'var(--ink-faint)', borderBottom: '2px solid ' + (tab === t ? 'var(--accent)' : 'transparent'), whiteSpace: 'nowrap', cursor: 'pointer' }}>{t[0].toUpperCase() + t.slice(1)}</button>
          ))}
        </div>

        {tab === 'overview' && <div className="cols-2">
          <div className="panel"><div className="ph"><h3>Loan details</h3><Badge status="active">On track</Badge></div>
            <div className="pb" style={{ padding: 18 }}><div className="kv">
              <div><div className="k">Instalment</div><div className="v lg">{LP.n$(loan.instalment)}</div></div>
              <div><div className="k">Next payment</div><div className="v lg">{loan.nextDue}</div></div>
              <div><div className="k">Principal</div><div className="v">{LP.n$(loan.principal)}</div></div>
              <div><div className="k">Total repayable</div><div className="v">{LP.n$(loan.total)}</div></div>
              <div><div className="k">Term</div><div className="v">{loan.term} months</div></div>
              <div><div className="k">Disbursed</div><div className="v">{loan.disbursed}</div></div>
            </div></div>
          </div>
          <div className="panel"><div className="ph"><h3>Recent activity</h3></div>
            <div className="pb" style={{ padding: '4px 18px 14px' }}>{LP.activity.map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: i < LP.activity.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, display: 'grid', placeItems: 'center', background: a.dir === 'in' ? 'var(--ok-soft)' : a.dir === 'out' ? 'var(--accent-soft)' : 'var(--bg)', color: a.dir === 'in' ? 'var(--ok)' : a.dir === 'out' ? 'var(--accent-deep)' : 'var(--ink-faint)' }}><Icon name={a.dir === 'in' ? 'down' : a.dir === 'out' ? 'up' : 'check'} size={16} /></div>
                <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{a.label}</div><div className="sub" style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{a.date}</div></div>
                {a.amount != null && <div className="num" style={{ fontWeight: 600, color: a.dir === 'in' ? 'var(--ok)' : 'var(--ink)' }}>{a.dir === 'in' ? '+' : '−'}{LP.n$(a.amount)}</div>}
              </div>))}</div>
          </div>
        </div>}

        {tab === 'schedule' && <div className="panel"><div className="ph"><h3>Repayment schedule</h3><span className="sub" style={{ color: 'var(--ink-faint)', fontSize: 13 }}>{loan.id}</span></div>
          <div className="pb" style={{ padding: '4px 18px 16px' }}>{LP.schedule.map(s => (
            <div key={s.no} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: '1px solid var(--line-soft)' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'grid', placeItems: 'center', flex: 'none', background: s.status === 'paid' ? 'var(--ok-soft)' : 'var(--warn-soft)', color: s.status === 'paid' ? 'var(--ok)' : 'var(--warn)' }}><Icon name={s.status === 'paid' ? 'check' : 'clock'} size={16} /></div>
              <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}>Instalment {s.no}</div><div className="sub" style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{s.status === 'paid' ? 'Paid ' + s.paidOn : 'Due ' + s.due}</div></div>
              <div style={{ textAlign: 'right' }}><div className="num" style={{ fontWeight: 600 }}>{LP.n$(s.amount)}</div><Badge status={s.status === 'paid' ? 'paid' : 'due'}>{s.status === 'paid' ? 'Paid' : 'Due'}</Badge></div>
            </div>))}
            <button className="btn btn-accent" style={{ marginTop: 16 }} onClick={() => setModal('pay')}><Icon name="wallet" size={16} />Pay next instalment</button>
          </div>
        </div>}

        {tab === 'documents' && <div className="panel"><div className="ph"><h3>Documents &amp; statements</h3></div>
          <div className="pb" style={{ padding: '4px 18px 14px' }}>{[['Loan agreement', 'Signed 24 May 2026'], ['Statement — June 2026', 'PDF · 84 KB'], ['Payslip (uploaded)', 'Verified'], ['Certified ID copy', 'Verified']].map((d, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: i < 3 ? '1px solid var(--line-soft)' : 'none' }}>
              <div style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--accent-soft)', color: 'var(--accent-deep)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon name="file" size={18} /></div>
              <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{d[0]}</div><div className="sub" style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{d[1]}</div></div>
              <button className="btn btn-ghost btn-sm"><Icon name="download" size={15} />Download</button>
            </div>))}</div>
        </div>}

        {tab === 'profile' && <div className="cols-2 even">
          <div className="panel"><div className="ph"><h3>Personal details</h3></div><div className="pb gap" style={{ padding: 18 }}>
            <div className="field"><label>Full name</label><input defaultValue={b.first + ' ' + b.last} /></div>
            <div className="field"><label>I.D. number</label><input defaultValue={b.idNo} disabled /></div>
            <div className="field"><label>Mobile</label><input defaultValue={b.phone} /></div>
            <div className="field"><label>Email</label><input defaultValue={b.email} /></div>
            <div className="field"><label>Residential address</label><input defaultValue={b.address} /></div>
          </div></div>
          <div className="panel"><div className="ph"><h3>Banking</h3></div><div className="pb gap" style={{ padding: 18 }}>
            <div className="field"><label>Bank</label><input defaultValue={b.bank} /></div>
            <div className="field"><label>Account type</label><input defaultValue={b.acct} /></div>
            <div className="field"><label>Employer</label><input defaultValue={b.employer} /></div>
            <div className="field"><label>Net monthly income</label><input defaultValue={LP.n$(b.income)} /></div>
            <button className="btn btn-accent" style={{ marginTop: 4 }}>Save changes</button>
          </div></div>
        </div>}

        <p className="sub" style={{ textAlign: 'center', color: 'var(--ink-faint)', fontSize: 12, margin: '28px 0' }}>Powered by LoanPilot · This is a design concept — no real payments are processed.</p>
      </div>

      {modal && <BPayModal kind={modal} loan={loan} close={() => setModal(null)} />}
    </div>
  );
}

window.BorrowerApp = BorrowerApp;
