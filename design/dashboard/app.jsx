/* global React, ReactDOM, Icon, StaffApp, BorrowerApp */
const { useState: useStateApp } = React;

function Login({ onEnter }) {
  const [role, setRole] = useStateApp('staff');
  const creds = {
    staff: { email: 'eufemia@raccoonsfinance.com', label: 'Staff member', desc: 'Manage loans & borrowers' },
    borrower: { email: 'helena.k@email.na', label: 'Borrower', desc: 'Manage my loan & profile' }
  };
  return (
    <div className="login-wrap">
      <div className="login-side">
        <div className="gridbg"></div>
        <img src="assets/rfs-lockup-white.png" alt="Raccoons Financial Services" />
        <div className="pitch">
          <h1>Loan management,<br />the Raccoons way.</h1>
          <p>One place to manage applications, loans and borrowers — and for clients to track and repay, anytime.</p>
        </div>
        <svg className="arrow" viewBox="0 0 220 170" fill="none" stroke="#d7df21" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round"><polyline points="16,150 72,104 116,128 198,46" /><polyline points="158,48 200,44 196,88" /></svg>
        <div className="foot">Regulated by NAMFISA · Licence 25/11/1471 · Windhoek, Namibia</div>
      </div>
      <div className="login-main">
        <div className="login-card">
          <h2>Sign in</h2>
          <div className="sub">Choose how you'd like to sign in to the portal.</div>
          <div className="role-toggle">
            {['staff', 'borrower'].map(r => (
              <button key={r} className={"rt" + (role === r ? ' sel' : '')} onClick={() => setRole(r)}>
                <div className="rt-t"><Icon name={r === 'staff' ? 'shield' : 'user'} size={16} />{creds[r].label}</div>
                <div className="rt-d">{creds[r].desc}</div>
              </button>
            ))}
          </div>
          <form onSubmit={e => { e.preventDefault(); onEnter(role); }}>
            <label>Email</label>
            <input type="email" defaultValue={creds[role].email} key={role} />
            <label>Password</label>
            <input type="password" defaultValue="demo1234" />
            <button className="btn btn-primary btn-block" type="submit" style={{ padding: '13px' }}>Sign in as {creds[role].label.toLowerCase()}</button>
          </form>
          <div className="login-hint">Demo prototype — credentials are pre-filled. Just click Sign in.</div>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [screen, setScreen] = useStateApp(() => localStorage.getItem('rfs_screen') || 'login');
  function enter(role) { localStorage.setItem('rfs_screen', role); setScreen(role); }
  function logout() { localStorage.setItem('rfs_screen', 'login'); setScreen('login'); }
  if (screen === 'staff') return <StaffApp onLogout={logout} />;
  if (screen === 'borrower') return <BorrowerApp onLogout={logout} />;
  return <Login onEnter={enter} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
