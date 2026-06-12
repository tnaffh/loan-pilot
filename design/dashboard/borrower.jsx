/* global React, RFS, Icon, Badge, Progress */
const { useState: useStateBP, useEffect: useEffectBP } = React;

function PayModal({ kind, loan, close }) {
  const [done, setDone] = useStateBP(false);
  const amount = kind === 'settle' ? loan.balance : loan.instalment;
  return (
    <div className="modal-mask" onClick={close}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        {!done ? <>
          <h3>{kind === 'settle' ? 'Settle loan early' : 'Make a payment'}</h3>
          <p>{kind === 'settle' ? 'Pay the full outstanding balance now and close this loan — no early-settlement penalty.' : 'Pay your next instalment towards loan ' + loan.id + '.'}</p>
          <div className="field"><label>Amount</label><input defaultValue={RFS.n$(amount)} /></div>
          <div className="field"><label>Pay from</label><select><option>Bank Windhoek · Savings ••• 4421</option><option>Add a new method…</option></select></div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button className="btn btn-ghost" onClick={close}>Cancel</button>
            <button className="btn btn-primary btn-block" onClick={() => setDone(true)}>Pay {RFS.n$(amount)}</button>
          </div>
        </> : <div style={{ textAlign: 'center' }}>
          <div className="modal-tick"><Icon name="check" size={30} /></div>
          <h3>Payment successful</h3>
          <p>{RFS.n$(amount)} received. {kind === 'settle' ? 'Your loan is now settled — thank you!' : 'Your balance has been updated.'}</p>
          <button className="btn btn-primary btn-block" onClick={close}>Done</button>
        </div>}
      </div>
    </div>
  );
}

function BorrowerApp({ onLogout }) {
  const b = RFS.borrower('B-1042');
  const loan = RFS.loans.find(l => l.id === 'L-20451');
  const [tab, setTab] = useStateBP(() => localStorage.getItem('rfs_borrower_tab') || 'overview');
  const [modal, setModal] = useStateBP(null);
  useEffectBP(() => { localStorage.setItem('rfs_borrower_tab', tab); }, [tab]);
  const pct = (loan.paid / loan.of) * 100;

  return (
    <div style={{ minHeight: '100vh' }}>
      <div className="topbar" style={{ paddingLeft: 24, paddingRight: 24 }}>
        <img src="assets/rfs-lockup.png" alt="Raccoons Financial Services" style={{ height: 34 }} />
        <div className="search" style={{ marginLeft: 'auto' }}></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--info-bg)', color: 'var(--navy)', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 13 }}>{b.initials}</div>
          <button className="icon-btn" onClick={onLogout} title="Sign out"><Icon name="logout" size={18} /></button>
        </div>
      </div>

      <div className="bp">
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 26, fontWeight: 600 }}>Hello, {b.first}</div>
          <div className="sub" style={{ color: 'var(--ink-soft)' }}>Here's where your loan stands today.</div>
        </div>

        {/* Hero */}
        <div className="bp-hero">
          <div className="gridbg"></div>
          <div className="lbl">Balance remaining</div>
          <div className="bal num">{RFS.n$(loan.balance)}</div>
          <div className="sub">of {RFS.n$(loan.total)} total · {RFS.typeLabel[loan.type]} loan {loan.id}</div>
          <div className="prog"><i style={{ width: pct + '%' }}></i></div>
          <div className="prow"><span>{loan.paid} of {loan.of} instalments paid</span><span>Next due {loan.nextDue}</span></div>
        </div>

        {/* Actions */}
        <div className="bp-actions">
          <button className="bp-action" onClick={() => setModal('pay')}><div className="ic"><Icon name="wallet" /></div><div className="t">Make a payment</div></button>
          <button className="bp-action" onClick={() => setModal('settle')}><div className="ic"><Icon name="check" /></div><div className="t">Settle early</div></button>
          <button className="bp-action" onClick={() => setTab('documents')}><div className="ic"><Icon name="download" /></div><div className="t">Statements</div></button>
        </div>

        {/* Tabs */}
        <div className="bp-tabs">
          {['overview', 'schedule', 'documents', 'profile'].map(t =>
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}
        </div>

        {tab === 'overview' && <div className="cols-2">
          <div className="panel"><div className="ph"><h3>Loan details</h3><Badge status={loan.status}>On track</Badge></div>
            <div className="pb" style={{ padding: 18 }}><div className="kv">
              <div><div className="k">Instalment</div><div className="v lg">{RFS.n$(loan.instalment)}</div></div>
              <div><div className="k">Next payment</div><div className="v lg">{loan.nextDue}</div></div>
              <div><div className="k">Principal</div><div className="v">{RFS.n$(loan.principal)}</div></div>
              <div><div className="k">Total repayable</div><div className="v">{RFS.n$(loan.total)}</div></div>
              <div><div className="k">Term</div><div className="v">{loan.term} months</div></div>
              <div><div className="k">Disbursed</div><div className="v">{loan.disbursed}</div></div>
            </div></div>
          </div>
          <div className="panel"><div className="ph"><h3>Recent activity</h3></div>
            <div className="pb" style={{ padding: '6px 18px 14px' }}>
              {RFS.activity.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: i < RFS.activity.length - 1 ? '1px solid var(--line-soft)' : 'none' }}>
                  <div className="di" style={{ width: 34, height: 34, borderRadius: 9, display: 'grid', placeItems: 'center', background: a.dir === 'in' ? 'var(--ok-bg)' : a.dir === 'out' ? 'var(--info-bg)' : '#eef0f4', color: a.dir === 'in' ? 'var(--ok)' : a.dir === 'out' ? 'var(--navy)' : 'var(--ink-faint)' }}>
                    <Icon name={a.dir === 'in' ? 'down' : a.dir === 'out' ? 'up' : 'check'} size={16} />
                  </div>
                  <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{a.label}</div><div className="sub" style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{a.date}</div></div>
                  {a.amount != null && <div className="num" style={{ fontWeight: 600, color: a.dir === 'in' ? 'var(--ok)' : 'var(--ink)' }}>{a.dir === 'in' ? '+' : '−'}{RFS.n$(a.amount)}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>}

        {tab === 'schedule' && <div className="panel"><div className="ph"><h3>Repayment schedule</h3><span className="sub" style={{ color: 'var(--ink-faint)', fontSize: 13 }}>{loan.id}</span></div>
          <div className="pb" style={{ padding: '6px 18px 14px' }}>
            {RFS.schedule.map(s => (
              <div className="sched-item" key={s.no}>
                <div className={"mk " + (s.status === 'paid' ? 'paid' : 'due')}><Icon name={s.status === 'paid' ? 'check' : 'clock'} size={16} /></div>
                <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}>Instalment {s.no}</div><div className="sub" style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{s.status === 'paid' ? 'Paid ' + s.paidOn : 'Due ' + s.due}</div></div>
                <div style={{ textAlign: 'right' }}><div className="num" style={{ fontWeight: 600 }}>{RFS.n$(s.amount)}</div><Badge status={s.status === 'paid' ? 'settled' : 'pending'}>{s.status === 'paid' ? 'Paid' : 'Due'}</Badge></div>
              </div>
            ))}
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setModal('pay')}><Icon name="wallet" size={16} />Pay next instalment</button>
          </div>
        </div>}

        {tab === 'documents' && <div className="panel"><div className="ph"><h3>Documents &amp; statements</h3></div>
          <div className="pb" style={{ padding: '6px 18px 14px' }}>
            {[['Loan agreement', 'Signed 24 May 2026', 'file'], ['Statement — June 2026', 'PDF · 84 KB', 'download'], ['Payslip (uploaded)', 'Verified', 'check'], ['Certified ID copy', 'Verified', 'check']].map((d, i) => (
              <div className="doc-row" key={i}>
                <div className="di"><Icon name={d[2] === 'check' ? 'check' : 'file'} size={18} /></div>
                <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{d[0]}</div><div className="sub" style={{ fontSize: 12, color: 'var(--ink-faint)' }}>{d[1]}</div></div>
                <button className="btn btn-ghost btn-sm"><Icon name="download" size={15} />Download</button>
              </div>
            ))}
          </div>
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
            <div className="field"><label>Net monthly income</label><input defaultValue={RFS.n$(b.income)} /></div>
            <button className="btn btn-primary" style={{ marginTop: 4 }}>Save changes</button>
          </div></div>
        </div>}

        <p className="sub" style={{ textAlign: 'center', color: 'var(--ink-faint)', fontSize: 12, margin: '28px 0' }}>This is a design concept — figures are illustrative and no real payments are processed.</p>
      </div>

      {modal && <PayModal kind={modal} loan={loan} close={() => setModal(null)} />}
    </div>
  );
}

window.BorrowerApp = BorrowerApp;
