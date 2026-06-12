/* global React, ReactDOM, LP, Icon, applyAccent, TENANT, PlatformApp, LenderApp, BorrowerApp */
const { useState: useStateRoot, useEffect: useEffectRoot } = React;

const ROLES = {
  platform: { label: 'Platform owner', desc: 'Operate LoanPilot & all lenders', icon: 'shield', email: 'you@loanpilot.app' },
  lender: { label: 'Lender staff', desc: 'Manage loans & borrowers', icon: 'building', email: 'eufemia@raccoonsfinance.com' },
  borrower: { label: 'Borrower', desc: 'Track & repay my loan', icon: 'user', email: 'helena.k@email.na' }
};

function Login({ onEnter }) {
  const [role, setRole] = useStateRoot('platform');
  return (
    <div style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: '1.05fr .95fr' }} className="login-wrap">
      <div className="login-side">
        <div className="gridbg"></div>
        <a className="logo" href="index.html" style={{ position: 'relative', color: '#fff', fontSize: 21 }}>
          <span className="mk" style={{ background: 'rgba(255,255,255,.16)' }}><svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4z" /></svg></span>
          <b>Loan<span style={{ color: '#fff' }}>Pilot</span></b>
        </a>
        <div className="pitch">
          <h1>Lending,<br />on autopilot.</h1>
          <p>One platform for Namibian microlenders — applications, loans, repayments and a branded borrower portal.</p>
        </div>
        <div className="foot">© 2026 LoanPilot · Windhoek, Namibia</div>
      </div>
      <div className="login-main">
        <div className="login-card">
          <h2>Sign in</h2>
          <div className="sub">Choose a role to explore the demo.</div>
          <div className="role-stack">
            {Object.keys(ROLES).map(r => (
              <button key={r} className={"rt" + (role === r ? ' sel' : '')} onClick={() => setRole(r)}>
                <span className="rt-ic"><Icon name={ROLES[r].icon} size={18} /></span>
                <span><span className="rt-t">{ROLES[r].label}</span><span className="rt-d">{ROLES[r].desc}</span></span>
                {role === r && <span className="rt-check"><Icon name="check" size={16} /></span>}
              </button>
            ))}
          </div>
          <form onSubmit={e => { e.preventDefault(); onEnter(role); }}>
            <label>Email</label>
            <input type="email" defaultValue={ROLES[role].email} key={role} />
            <label>Password</label>
            <input type="password" defaultValue="demo1234" />
            <button className="btn btn-block" type="submit" style={{ padding: 13, background: 'var(--lp)', color: '#fff' }}>Sign in</button>
          </form>
          <div className="login-hint">Demo prototype — credentials are pre-filled. Just click Sign in.</div>
        </div>
      </div>
    </div>
  );
}

function Root() {
  const [screen, setScreen] = useStateRoot(() => localStorage.getItem('lp_screen') || 'login');

  useEffectRoot(() => {
    // Theme: platform owner & login use LoanPilot indigo; lender/borrower use the tenant accent
    if (screen === 'lender' || screen === 'borrower') applyAccent(TENANT.accent, '#ffffff');
    else applyAccent(null);
  }, [screen]);

  function enter(role) { localStorage.setItem('lp_screen', role); setScreen(role); }
  function logout() { localStorage.setItem('lp_screen', 'login'); setScreen('login'); }

  if (screen === 'platform') return <PlatformApp onLogout={logout} />;
  if (screen === 'lender') return <LenderApp onLogout={logout} />;
  if (screen === 'borrower') return <BorrowerApp onLogout={logout} />;
  return <Login onEnter={enter} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(<Root />);
