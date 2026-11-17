import { useEffect, useState } from 'react';
import { api, saveSession, clearSession, loadUser, isLoggedIn } from './api';
import './styles.css';

function todayString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const SLOTS_FALLBACK = [
  'Morning (fasting)',
  'After breakfast',
  'After lunch',
  'After dinner',
];

// ---------------- Auth screen ----------------
function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const data =
        mode === 'login'
          ? await api.login(email, password)
          : await api.register(name, email, password);
      saveSession(data);
      onAuth(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <h1 className="logo">Sweety</h1>
        <p className="tagline">Your blood glucose tracker — up to 4 readings a day, with daily and monthly reports.</p>
        <div className="tabs">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')} type="button">Log in</button>
          <button className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')} type="button">Sign up</button>
        </div>
        <form onSubmit={submit}>
          {mode === 'signup' && (
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
            </label>
          )}
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="primary" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>
        <p className="demo-hint">
          Just looking around? Log in with the demo account — <b>demo@sweety.app</b> / <b>demo1234</b> (run <code>npm run seed</code> in the server folder first).
        </p>
      </div>
    </div>
  );
}

// ---------------- Reading form (add + edit) ----------------
function ReadingForm({ slots, initial, onCancel, onSaved }) {
  const [date, setDate] = useState(initial?.date || todayString());
  const [slot, setSlot] = useState(initial?.slot || slots[0]);
  const [value, setValue] = useState(initial?.value ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const payload = { date, slot, value: value === '' ? '' : Number(value) };
      if (initial?.id) {
        await api.updateReading(initial.id, payload);
      } else {
        await api.addReading(payload);
      }
      onSaved();
      if (!initial?.id) {
        setValue('');
        setSlot(slots[0]);
      }
    } catch (err) {
      // The server returns the exact validation message — show it as-is.
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="reading-form" onSubmit={submit}>
      <div className="form-row">
        <label>
          Date
          <input type="date" value={date} max={todayString()} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Time slot
          <select value={slot} onChange={(e) => setSlot(e.target.value)}>
            {slots.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Glucose (mg/dl)
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. 120"
            min="40"
            max="600"
          />
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : initial?.id ? 'Save changes' : 'Add reading'}
        </button>
        {onCancel && (
          <button className="secondary" type="button" onClick={onCancel}>Cancel</button>
        )}
      </div>
      <p className="hint">One reading per slot per day, up to 4 a day. Value must be a whole number between 40 and 600 mg/dl.</p>
    </form>
  );
}

// ---------------- One report card ----------------
function ReportCard({ title, subtitle, report }) {
  return (
    <div className="card report-card">
      <h3>{title}</h3>
      <p className="report-range">{subtitle}</p>
      {!report || report.count === 0 ? (
        <p className="empty">No readings in this period yet — add a reading above and it will show up here.</p>
      ) : (
        <>
          <div className="stats">
            <div><span>Highest</span><b>{report.highest} <small>mg/dl</small></b></div>
            <div><span>Lowest</span><b>{report.lowest} <small>mg/dl</small></b></div>
            <div><span>Average</span><b>{report.average} <small>mg/dl</small></b></div>
            <div><span>Readings</span><b>{report.count}</b></div>
          </div>
          {report.readings && (
            <ul className="report-list">
              {report.readings.map((r) => (
                <li key={r.id}><span>{r.slot}</span><b>{r.value} mg/dl</b></li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

// ---------------- Dashboard ----------------
function Dashboard({ user, onLogout }) {
  const [slots, setSlots] = useState(SLOTS_FALLBACK);
  const [readings, setReadings] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [editing, setEditing] = useState(null);
  const [reportDate, setReportDate] = useState(todayString());
  const [reports, setReports] = useState({ daily: null, 'month-to-date': null, monthly: null });
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  async function loadReadings(p = page) {
    try {
      const data = await api.listReadings(p, 20);
      setReadings(data.readings);
      setTotalPages(data.totalPages);
      setTotal(data.total);
      setPage(data.page);
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadReports() {
    try {
      const [daily, mtd, monthly] = await Promise.all([
        api.getReport('daily', reportDate),
        api.getReport('month-to-date', reportDate),
        api.getReport('monthly', reportDate),
      ]);
      setReports({ daily, 'month-to-date': mtd, monthly });
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    api.getSlots().then((d) => setSlots(d.slots)).catch(() => {});
  }, []);

  useEffect(() => {
    loadReadings();
    loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, reportDate]);

  function refresh() {
    setEditing(null);
    setRefreshKey((k) => k + 1);
  }

  async function removeReading(id) {
    if (!window.confirm('Delete this reading?')) return;
    try {
      await api.deleteReading(id);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="dashboard">
      <header className="topbar">
        <div>
          <h1 className="logo small">Sweety</h1>
          <p className="welcome">Hi, {user.name} — track up to 4 readings a day.</p>
        </div>
        <button className="secondary" onClick={onLogout}>Log out</button>
      </header>

      {error && <p className="error">{error}</p>}

      <section className="card">
        <h2>Add a reading</h2>
        <ReadingForm slots={slots} onSaved={refresh} />
      </section>

      <section>
        <h2>Reports for <input type="date" className="date-inline" value={reportDate} max={todayString()} onChange={(e) => setReportDate(e.target.value)} /></h2>
        <div className="reports-grid">
          <ReportCard title="Daily" subtitle={reports.daily?.range.label || reportDate} report={reports.daily} />
          <ReportCard title="Month to date" subtitle={reports['month-to-date']?.range.label || ''} report={reports['month-to-date']} />
          <ReportCard title="Previous month" subtitle={reports.monthly?.range.label || ''} report={reports.monthly} />
        </div>
      </section>

      <section className="card">
        <h2>Your readings ({total})</h2>
        {editing && (
          <div className="edit-box">
            <h3>Edit reading</h3>
            <ReadingForm slots={slots} initial={editing} onCancel={() => setEditing(null)} onSaved={refresh} />
          </div>
        )}
        {readings.length === 0 ? (
          <p className="empty">No readings yet. Add your first one above.</p>
        ) : (
          <ul className="reading-list">
            {readings.map((r) => (
              <li key={r.id}>
                <div>
                  <b>{r.value} mg/dl</b>
                  <span>{r.slot}</span>
                </div>
                <div className="reading-meta">
                  <span>{r.date}</span>
                  <button className="link" onClick={() => setEditing(r)}>Edit</button>
                  <button className="link danger" onClick={() => removeReading(r.id)}>Delete</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {totalPages > 1 && (
          <div className="pagination">
            <button className="secondary" disabled={page <= 1} onClick={() => { setPage(page - 1); setRefreshKey((k) => k + 1); }}>← Previous</button>
            <span>Page {page} of {totalPages}</span>
            <button className="secondary" disabled={page >= totalPages} onClick={() => { setPage(page + 1); setRefreshKey((k) => k + 1); }}>Next →</button>
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------- App ----------------
export default function App() {
  const [user, setUser] = useState(() => (isLoggedIn() ? loadUser() : null));

  function logout() {
    clearSession();
    setUser(null);
  }

  return (
    <div className="app">
      {user ? <Dashboard user={user} onLogout={logout} /> : <AuthScreen onAuth={setUser} />}
      <footer className="footer">Sweety — a simple blood glucose tracker. Built for the Kenpath assessment.</footer>
    </div>
  );
}
