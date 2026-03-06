import { useCallEngine } from './call-engine.js';
import { CallPane } from './call-pane.jsx';
const { useEffect, useMemo, useRef, useState } = React;
const DEFAULT_API_BASE = 'https://doctor-patient-ai-app.onrender.com';
function App() {
  const isNativeApp = Boolean(window.Capacitor && (window.Capacitor.isNativePlatform?.() ?? true));
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const apiBase = DEFAULT_API_BASE;
  const [me, setMe] = useState(null);
  const [consultations, setConsultations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [adminStats, setAdminStats] = useState(null);
  const [pendingDoctors, setPendingDoctors] = useState([]);
  const [adminDoctors, setAdminDoctors] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [authTab, setAuthTab] = useState('login');
  const [login, setLogin] = useState({ email: '', password: '' });
  const [register, setRegister] = useState({ name: '', email: '', password: '', role: 'PATIENT', specialization: '' });
  const [booking, setBooking] = useState({ doctorId: '', scheduledAt: '' });
  const [creating, setCreating] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [page, setPage] = useState('home');
  const [detailTab, setDetailTab] = useState('chat');
  const [manualPrescription, setManualPrescription] = useState('');
  const [toast, setToast] = useState({ show: false, message: '', bad: false });
  const [modal, setModal] = useState({ show: false, title: '', message: '' });
  const isLoggedIn = Boolean(token && me);
  const isAdmin = me?.role === 'ADMIN';
  const isDoctor = me?.role === 'DOCTOR';
  const isPatient = me?.role === 'PATIENT';
  const flags = useMemo(() => {
    const s = selected?.status || '';
    const p = selected?.paymentStatus || '';
    return {
      inProgress: s === 'IN_PROGRESS',
      schedOrReq: s === 'SCHEDULED' || s === 'REQUESTED',
      paid: p === 'PAID'
    };
  }, [selected]);
  const apiStatus = isLoggedIn ? `Connected as ${me.role}` : 'Not connected';
  const patientLockedByPayment = isPatient && selected && selected.paymentStatus !== 'PAID';
  const canUseCall = Boolean(selected && (isDoctor || isPatient) && flags.inProgress && flags.paid);
  const seenConsultationStateRef = useRef(new Map());
  const lastSignalNoticeRef = useRef('');
  const nativeNotificationPlugin = window.Capacitor?.Plugins?.LocalNotifications;

  async function sendSystemNotification(title, body) {
    if (!isNativeApp) return;
    if (nativeNotificationPlugin?.schedule) {
      try {
        await nativeNotificationPlugin.requestPermissions();
        await nativeNotificationPlugin.schedule({
          notifications: [{ id: Date.now() % 2147483647, title, body, schedule: { at: new Date(Date.now() + 60) } }]
        });
        return;
      } catch {
        // Fall through to in-app toast only.
      }
    }
  }
  function notify(message, bad = false) {
    setToast({ show: true, message, bad });
    window.clearTimeout(notify.t);
    notify.t = window.setTimeout(() => setToast((p) => ({ ...p, show: false })), 3000);
  }
  async function api(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (!(options.body instanceof FormData) && options.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    const base = apiBase.trim().replace(/\/$/, '');
    const absolute = /^https?:\/\//i.test(path);
    if (!absolute && !base) throw new Error('API Base URL is not configured');
    const finalUrl = absolute ? path : base ? `${base}${path}` : path;
    const capacitorHttp = window.Capacitor?.Plugins?.CapacitorHttp;
    const isForm = options.body instanceof FormData;
    if (isNativeApp && capacitorHttp && !isForm) {
      const method = String(options.method || 'GET').toUpperCase();
      let data = undefined;
      if (options.body) {
        if (typeof options.body === 'string') {
          try {
            data = JSON.parse(options.body);
          } catch {
            data = options.body;
          }
        } else {
          data = options.body;
        }
      }
      const resp = await capacitorHttp.request({
        url: finalUrl,
        method,
        headers,
        data
      });
      let payload = resp?.data;
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch {
          payload = {};
        }
      }
      const status = Number(resp?.status || 0);
      if (status < 200 || status >= 300 || payload?.success === false) {
        throw new Error(payload?.message || `Request failed (${status || 'native'})`);
      }
      return payload;
    }
    const res = await fetch(finalUrl, { ...options, headers });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) {
      throw new Error(json.message || `Request failed (${res.status})`);
    }
    return json;
  }
  const call = useCallEngine({ api, notify, selected, canUseCall, me, isNativeApp, sendSystemNotification });
  function personLabel(v) {
    if (!v) return 'N/A';
    if (typeof v === 'string') return v;
    return v.name ? `${v.name}${v.email ? ` (${v.email})` : ''}` : v._id || 'N/A';
  }
  async function refreshProfile() {
    const r = await api('/api/users/me');
    if (!r || typeof r !== 'object' || !r.data) {
      throw new Error('Invalid profile response from server');
    }
    setMe(r.data);
  }
  async function refreshConsultations() {
    const r = await api('/api/consultations/my');
    setConsultations(Array.isArray(r.data) ? r.data : []);
  }
  async function refreshDoctors() {
    const r = await api('/api/users/doctors');
    const list = Array.isArray(r.data) ? r.data : [];
    setDoctors(list);
    if (!booking.doctorId && list[0]?._id) {
      setBooking((p) => ({ ...p, doctorId: list[0]._id }));
    }
  }
  async function refreshAdmin() {
    const [stats, pending, doctorsList] = await Promise.all([
      api('/api/users/admin/stats'),
      api('/api/users/pending-doctors'),
      api('/api/users/admin/doctors')
    ]);
    setAdminStats(stats.data || null);
    setPendingDoctors(Array.isArray(pending.data) ? pending.data : []);
    setAdminDoctors(Array.isArray(doctorsList.data) ? doctorsList.data : []);
  }
  async function refreshPrescriptions() {
    if (isAdmin) return;
    const r = await api('/api/consultations/my/prescriptions');
    setPrescriptions(Array.isArray(r.data) ? r.data : []);
  }
  async function bootstrap() {
    if (!token) return;
    try {
      await call.loadRtcConfig();
      await refreshProfile();
      await refreshConsultations();
    } catch (e) {
      logout();
      notify(e.message || 'Session expired', true);
    }
  }
  useEffect(() => {
    bootstrap();
  }, [token]);
  useEffect(() => {
    call.loadRtcConfig().catch(() => {
      // Keep defaults when API is not reachable yet.
    });
  }, []);
  useEffect(() => {
    if (!me) return;
    if (me.role === 'PATIENT') refreshDoctors().catch((e) => notify(e.message, true));
    if (me.role === 'ADMIN') refreshAdmin().catch((e) => notify(e.message, true));
    if (me.role !== 'ADMIN') refreshPrescriptions().catch((e) => notify(e.message, true));
  }, [me]);
  useEffect(() => {
    if (!isNativeApp || !me) return;
    if (me.role === 'PATIENT' || me.role === 'DOCTOR') {
      setPage('consultations');
      return;
    }
    if (me.role === 'ADMIN') setPage('home');
  }, [isNativeApp, me?.role]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [page, detailTab, selected?._id]);
  useEffect(() => {
    if (!isLoggedIn || !isNativeApp) return;
    const timer = window.setInterval(async () => {
      try {
        const r = await api('/api/consultations/my');
        const next = Array.isArray(r.data) ? r.data : [];
        setConsultations(next);
        for (const c of next) {
          const key = String(c._id);
          const sig = `${c.status}|${c.paymentStatus}`;
          const prev = seenConsultationStateRef.current.get(key);
          if (!prev) {
            seenConsultationStateRef.current.set(key, sig);
            continue;
          }
          if (prev !== sig) {
            seenConsultationStateRef.current.set(key, sig);
            notify(`Consultation updated: ${c.status} / ${c.paymentStatus}`);
            await sendSystemNotification('Consultation Updated', `${c.status} / ${c.paymentStatus}`);
          }
        }
      } catch {
        // Keep app responsive if polling fails.
      }
    }, 9000);
    return () => window.clearInterval(timer);
  }, [isLoggedIn, isNativeApp, token]);
  async function loginSubmit(e) {
    e.preventDefault();
    try {
      const r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(login) });
      const nextToken = r?.data?.token;
      if (!nextToken) {
        throw new Error('Login response missing token');
      }
      localStorage.setItem('token', nextToken);
      setToken(nextToken);
      setPage(isNativeApp ? 'consultations' : 'consultations');
      setLogin({ email: '', password: '' });
      notify('Login successful');
    } catch (err) {
      notify(err.message, true);
    }
  }
  async function registerSubmit(e) {
    e.preventDefault();
    try {
      const r = await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: register.name,
          email: register.email,
          password: register.password,
          role: register.role,
          specialization: register.role === 'DOCTOR' ? register.specialization : undefined
        })
      });
      const nextToken = r?.data?.token;
      if (!nextToken) {
        throw new Error('Registration response missing token');
      }
      localStorage.setItem('token', nextToken);
      setToken(nextToken);
      setPage(isNativeApp ? 'consultations' : 'consultations');
      setRegister({ name: '', email: '', password: '', role: 'PATIENT', specialization: '' });
      notify('Registration successful');
    } catch (err) {
      notify(err.message, true);
    }
  }
  function logout() {
    void call.endCall(false, false);
    localStorage.removeItem('token');
    setToken('');
    setMe(null);
    setConsultations([]);
    setSelected(null);
    setDoctors([]);
    setAdminStats(null);
    setPendingDoctors([]);
    setAdminDoctors([]);
    setPrescriptions([]);
    setBooking({ doctorId: '', scheduledAt: '' });
    setPage('home');
    setDetailTab('chat');
    setManualPrescription('');
    seenConsultationStateRef.current.clear();
    lastSignalNoticeRef.current = '';
  }
  async function openConsultation(id) {
    const existing = consultations.find((c) => c._id === id);
    if (isPatient && existing && existing.status !== 'IN_PROGRESS') {
      notify('You can open this only after doctor approval', true);
      return;
    }
    try {
      await call.onConsultationSwitch(id);
      const r = await api(`/api/consultations/${id}`);
      setSelected(r.data);
      call.setCallStatus('Call not started.');
      setPage('detail');
      if (isNativeApp) setDetailTab('chat');
      notify('Consultation loaded');
    } catch (err) {
      const msg = String(err?.message || '');
      if (msg.includes('Failed to fetch')) {
        notify(`Network fetch failed. API URL: ${apiBase}`, true);
      } else {
        notify(msg, true);
      }
    }
  }
  async function createConsultation(e) {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    try {
      const r = await api('/api/consultations', {
        method: 'POST',
        body: JSON.stringify({
          doctorId: booking.doctorId,
          scheduledAt: booking.scheduledAt || undefined
        })
      });
      await refreshConsultations();
      setBooking((p) => ({ ...p, scheduledAt: '' }));
      notify('Consultation created');
      if (r.data?.status === 'SCHEDULED') {
        setModal({
          show: true,
          title: 'Consultation Scheduled',
          message: 'Your consultation has been scheduled. Please wait for the doctor to approve and then complete payment.'
        });
      }
    } catch (err) {
      notify(err.message, true);
    } finally {
      setCreating(false);
    }
  }
  async function postMessage(e) {
    e.preventDefault();
    if (!selected || !chatMessage.trim()) return;
    try {
      await api(`/api/consultations/${selected._id}/messages`, { method: 'POST', body: JSON.stringify({ message: chatMessage }) });
      setChatMessage('');
      await openConsultation(selected._id);
    } catch (err) {
      const msg = String(err?.message || '');
      if (msg.includes('Failed to fetch')) {
        notify(`Network fetch failed. API URL: ${apiBase}`, true);
      } else {
        notify(msg, true);
      }
    }
  }
  async function uploadReport(e) {
    e.preventDefault();
    if (!selected) return;
    const file = e.target.file.files[0];
    if (!file) return notify('Please select a file', true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      await api(`/api/consultations/${selected._id}/reports`, { method: 'POST', body: fd });
      e.target.reset();
      await openConsultation(selected._id);
      notify('Report uploaded');
    } catch (err) {
      notify(err.message, true);
    }
  }
  async function doAction(path, success) {
    if (!selected) return;
    try {
      await api(path, { method: 'POST' });
      await refreshConsultations();
      await openConsultation(selected._id);
      if (!isAdmin) await refreshPrescriptions();
      if (path.includes('/ai/prescription')) {
        setDetailTab('prescription');
      }
      notify(success);
    } catch (err) {
      notify(err.message, true);
    }
  }
  async function markDoneDelete() {
    if (!selected) return;
    try {
      await api(`/api/consultations/${selected._id}/doctor/complete-delete`, { method: 'POST' });
      await call.endCall(false, false);
      setSelected(null);
      await refreshConsultations();
      if (!isAdmin) await refreshPrescriptions();
      notify('Consultation marked done and deleted');
    } catch (err) {
      notify(err.message, true);
    }
  }
  async function saveManualPrescription(e) {
    e.preventDefault();
    if (!selected) return;
    if (!manualPrescription.trim()) return notify('Prescription text is required', true);
    try {
      await api(`/api/consultations/${selected._id}/doctor/prescription`, {
        method: 'POST',
        body: JSON.stringify({ text: manualPrescription.trim() })
      });
      setManualPrescription('');
      await refreshConsultations();
      await openConsultation(selected._id);
      await refreshPrescriptions();
      setDetailTab('prescription');
      notify('Prescription saved');
      await sendSystemNotification('Prescription Saved', 'Doctor has saved a prescription');
    } catch (err) {
      notify(err.message, true);
    }
  }
  async function approveDoctor(id) {
    try {
      await api(`/api/users/approve-doctor/${id}`, { method: 'PATCH' });
      await refreshAdmin();
      notify('Doctor approved');
    } catch (err) {
      notify(err.message, true);
    }
  }
  async function setDoctorFee(id, consultationFee) {
    try {
      await api(`/api/users/admin/doctors/${id}/consultation-fee`, {
        method: 'PATCH',
        body: JSON.stringify({ consultationFee: Number(consultationFee) })
      });
      await refreshAdmin();
      notify('Doctor consultation fee updated');
    } catch (err) {
      notify(err.message, true);
    }
  }
  const selectedDoctorFee = useMemo(() => {
    const d = doctors.find((x) => x._id === booking.doctorId);
    return d?.consultationFee || 0;
  }, [doctors, booking.doctorId]);
  const selectedPrescriptionList = useMemo(() => {
    if (!selected?._id) return [];
    return prescriptions.filter((p) => String(p.consultationId?._id || p.consultationId) === String(selected._id));
  }, [prescriptions, selected?._id]);
  return (
    <>
      <div className="bg-orb orb-a"></div>
      <div className="bg-orb orb-b"></div>
      <div className="bg-grid"></div>
      <header className="topbar">
        <div>
          <p className="eyebrow">Doctor + Patient AI Platform</p>
          <h1>MediFlow Console</h1>
        </div>
        <div className="status-wrap">
          <span className={`pill ${isLoggedIn ? 'good' : 'neutral'}`}>{apiStatus}</span>
        </div>
      </header>
      {isLoggedIn && (
        <div className="segmented app-nav">
          {isNativeApp && isPatient ? (
            <>
              <button className={page === 'consultations' ? 'active' : ''} onClick={() => setPage('consultations')}>Consultations</button>
              <button className={page === 'book' ? 'active' : ''} onClick={() => setPage('book')}>Book</button>
              <button className={page === 'prescriptions' ? 'active' : ''} onClick={() => setPage('prescriptions')}>Prescriptions</button>
              <button className={page === 'home' ? 'active' : ''} onClick={() => setPage('home')}>Profile</button>
            </>
          ) : isNativeApp && isDoctor ? (
            <>
              <button className={page === 'consultations' ? 'active' : ''} onClick={() => setPage('consultations')}>Consultations</button>
              <button className={page === 'prescriptions' ? 'active' : ''} onClick={() => setPage('prescriptions')}>Prescriptions</button>
              <button className={page === 'home' ? 'active' : ''} onClick={() => setPage('home')}>Profile</button>
            </>
          ) : (
            <>
              <button className={page === 'home' ? 'active' : ''} onClick={() => setPage('home')}>Home</button>
              <button className={page === 'consultations' ? 'active' : ''} onClick={() => setPage('consultations')}>Consultations</button>
              <button className={page === 'detail' ? 'active' : ''} onClick={() => setPage('detail')} disabled={!selected}>Detail</button>
              {!isAdmin ? <button className={page === 'prescriptions' ? 'active' : ''} onClick={() => setPage('prescriptions')}>Prescriptions</button> : null}
            </>
          )}
        </div>
      )}
      <main className="layout">
        <section className="stack left">
          {!isLoggedIn && (
            <>
              <article className="card">
                <div className="card-head">
                  <h2>Authentication</h2>
                  <p>Login or register to continue.</p>
                </div>
                <div className="segmented">
                  <button className={authTab === 'login' ? 'active' : ''} onClick={() => setAuthTab('login')}>Login</button>
                  <button className={authTab === 'register' ? 'active' : ''} onClick={() => setAuthTab('register')}>Register</button>
                </div>
                {authTab === 'login' ? (
                  <form className="form" onSubmit={loginSubmit}>
                    <label>Email <input type="email" value={login.email} onChange={(e) => setLogin((p) => ({ ...p, email: e.target.value }))} required /></label>
                    <label>Password <input type="password" value={login.password} onChange={(e) => setLogin((p) => ({ ...p, password: e.target.value }))} required /></label>
                    <button className="btn primary" type="submit">Login</button>
                  </form>
                ) : (
                  <form className="form" onSubmit={registerSubmit}>
                    <label>Name <input value={register.name} onChange={(e) => setRegister((p) => ({ ...p, name: e.target.value }))} required /></label>
                    <label>Email <input type="email" value={register.email} onChange={(e) => setRegister((p) => ({ ...p, email: e.target.value }))} required /></label>
                    <label>Password <input type="password" value={register.password} onChange={(e) => setRegister((p) => ({ ...p, password: e.target.value }))} required /></label>
                    <label>
                      Role
                      <select value={register.role} onChange={(e) => setRegister((p) => ({ ...p, role: e.target.value }))}>
                        <option value="PATIENT">PATIENT</option>
                        <option value="DOCTOR">DOCTOR</option>
                      </select>
                    </label>
                    {register.role === 'DOCTOR' && (
                      <label>Specialization <input value={register.specialization} onChange={(e) => setRegister((p) => ({ ...p, specialization: e.target.value }))} /></label>
                    )}
                    <button className="btn primary" type="submit">Create Account</button>
                  </form>
                )}
              </article>
            </>
          )}
          {isLoggedIn && page === 'home' && (
            <article className="card">
              <div className="card-head">
                <h2>Session</h2>
                <p>{me.name} ({me.email})</p>
              </div>
              <div className="stats-grid mini">
                <div className="stat"><span>ID</span><strong>{me.id || me._id}</strong></div>
                <div className="stat"><span>Role</span><strong>{me.role}</strong></div>
              </div>
              <button className="btn ghost" onClick={logout}>Logout</button>
            </article>
          )}
          {isPatient && (isNativeApp ? page === 'book' : page === 'home') && (
            <article className="card">
              <div className="card-head">
                <h2>Book Consultation</h2>
                <p>Create a new appointment request.</p>
              </div>
              <form className="form" onSubmit={createConsultation}>
                <label>
                  Doctor
                  <select value={booking.doctorId} onChange={(e) => setBooking((p) => ({ ...p, doctorId: e.target.value }))} required>
                    {doctors.length === 0 ? <option value="">No approved doctors yet</option> : null}
                    {doctors.map((d) => (
                      <option key={d._id} value={d._id}>{d.name} ({d.specialization || 'General'})</option>
                    ))}
                  </select>
                </label>
                <label>Schedule (optional) <input type="datetime-local" value={booking.scheduledAt} onChange={(e) => setBooking((p) => ({ ...p, scheduledAt: e.target.value }))} /></label>
                <p className="meta-line">Consultation Fee: <strong>INR {selectedDoctorFee}</strong></p>
                <button className="btn primary" disabled={creating} type="submit">{creating ? 'Creating...' : 'Create Consultation'}</button>
              </form>
            </article>
          )}
          {isAdmin && page === 'home' && (
            <article className="card">
              <div className="card-head">
                <h2>Admin Control</h2>
                <p>Platform overview and doctor approval.</p>
              </div>
              {adminStats && (
                <div className="stats-grid">
                  <div className="stat"><span>Users</span><strong>{adminStats.usersTotal}</strong></div>
                  <div className="stat"><span>Doctors</span><strong>{adminStats.doctorsTotal}</strong></div>
                  <div className="stat"><span>Pending</span><strong>{adminStats.doctorsPending}</strong></div>
                  <div className="stat"><span>Patients</span><strong>{adminStats.patientsTotal}</strong></div>
                </div>
              )}
              <div className="list-head"><h3>Pending Doctors</h3><button className="btn tiny" onClick={() => refreshAdmin().catch((e) => notify(e.message, true))}>Refresh</button></div>
              <div className="list">
                {pendingDoctors.length === 0 ? <div className="item"><div className="meta">No pending doctors.</div></div> : pendingDoctors.map((d) => (
                  <div className="item" key={d._id}>
                    <div className="title">{d.name}</div>
                    <div className="meta">{d.email} • {d.specialization || 'N/A'}</div>
                    <div className="row"><button className="btn tiny" onClick={() => approveDoctor(d._id)}>Approve</button></div>
                  </div>
                ))}
              </div>
              <div className="list-head"><h3>Doctor Fees</h3></div>
              <div className="list">
                {adminDoctors.length === 0 ? <div className="item"><div className="meta">No doctors found.</div></div> : adminDoctors.map((d) => (
                  <DoctorFeeRow key={d._id} doctor={d} onSave={setDoctorFee} />
                ))}
              </div>
            </article>
          )}
        </section>
        <section className="stack right">
          {isLoggedIn && page === 'consultations' && (
          <article className="card">
            <div className="list-head">
              <div><h2>Consultations</h2><p>Pick one to open details.</p></div>
              <button className="btn tiny" onClick={() => refreshConsultations().catch((e) => notify(e.message, true))}>Refresh</button>
            </div>
            <div className="list">
              {consultations.length === 0 ? <div className="item"><div className="meta">No consultations yet.</div></div> : consultations.map((c) => {
                const locked = isPatient && c.status !== 'IN_PROGRESS';
                return (
                  <div className="item" key={c._id}>
                    <div className="title">{c.status} • {c.paymentStatus}</div>
                    <div className="meta">ID: {c._id}</div>
                    <div className="meta">Doctor: {personLabel(c.doctorId)} | Patient: {personLabel(c.patientId)}</div>
                    <div className="meta">When: {c.scheduledAt ? new Date(c.scheduledAt).toLocaleString() : 'Not scheduled'}</div>
                    {locked ? <div className="meta">Waiting for doctor approval. Open unlocks after approval.</div> : null}
                    {isPatient && locked && isNativeApp ? null : (
                      <div className="row"><button className="btn tiny" disabled={locked} onClick={() => openConsultation(c._id)}>Open</button></div>
                    )}
                  </div>
                );
              })}
            </div>
          </article>
          )}
          {isLoggedIn && page === 'detail' && !selected && (
            <article className="card">
              <div className="item">
                <div className="meta">Select a consultation first from the Consultations page.</div>
              </div>
            </article>
          )}
          {isLoggedIn && page === 'detail' && selected && (
            <article className="card">
              <div className="list-head">
                <div>
                  <h2>Consultation Detail</h2>
                  <p>Status: {selected.status} | Payment: {selected.paymentStatus} | ID: {selected._id}</p>
                </div>
              </div>
              {isNativeApp && (
                <div className="segmented detail-nav">
                  {!patientLockedByPayment ? <button className={detailTab === 'chat' ? 'active' : ''} onClick={() => setDetailTab('chat')}>Chat</button> : null}
                  <button className={detailTab === 'actions' ? 'active' : ''} onClick={() => setDetailTab('actions')}>Actions</button>
                  {!patientLockedByPayment ? <button className={detailTab === 'call' ? 'active' : ''} onClick={() => setDetailTab('call')}>Call</button> : null}
                  <button className={detailTab === 'ai' ? 'active' : ''} onClick={() => setDetailTab('ai')}>AI</button>
                  <button className={detailTab === 'prescription' ? 'active' : ''} onClick={() => setDetailTab('prescription')}>Prescription</button>
                </div>
              )}
              <div className="detail-grid">
                {!patientLockedByPayment && (!isNativeApp || detailTab === 'chat') && (
                  <section className="pane">
                    <h3>Chat</h3>
                    <div className="chat">
                      {(selected.chat || []).length === 0 ? <div className="item"><div className="meta">No messages yet.</div></div> : selected.chat.map((m, i) => (
                        <div className="chat-msg" key={`${m.createdAt}-${i}`}>
                          <b>{m.senderRole}</b>
                          <p>{m.message}</p>
                          <span>{new Date(m.createdAt).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                    <form className="inline-form" onSubmit={postMessage}>
                      <input value={chatMessage} onChange={(e) => setChatMessage(e.target.value)} placeholder="Type your message" required />
                      <button className="btn primary" type="submit">Send</button>
                    </form>
                  </section>
                )}
                {(!isNativeApp || detailTab === 'actions') && (
                <section className="pane">
                  <h3>Actions</h3>
                  {isPatient && (
                    <div className="actions">
                      <button className="btn" disabled={!flags.inProgress} onClick={() => doAction(`/api/consultations/${selected._id}/payment/mock/create-order`, 'Order created')}>Create Payment Order</button>
                      <button className="btn" disabled={!flags.inProgress} onClick={() => doAction(`/api/consultations/${selected._id}/payment/mock/verify`, 'Payment verified')}>Verify Mock Payment</button>
                      <form className="inline-form" onSubmit={uploadReport}>
                        <input name="file" type="file" required />
                        <button className="btn" type="submit">Upload Report</button>
                      </form>
                    </div>
                  )}
                  {(isDoctor || isAdmin) && (
                    <div className="actions">
                      <button className="btn" onClick={() => doAction(`/api/consultations/${selected._id}/ai/summary`, 'AI summary generated')}>Generate AI Summary</button>
                      <button className="btn" onClick={() => doAction(`/api/consultations/${selected._id}/ai/suggestions`, 'AI suggestions generated')}>Generate AI Suggestions</button>
                    </div>
                  )}
                  {isDoctor && (
                    <div className="actions">
                      <button className="btn" disabled={!flags.schedOrReq} onClick={() => doAction(`/api/consultations/${selected._id}/doctor/approve`, 'Consultation approved')}>Approve Consultation</button>
                      <button className="btn accent" disabled={!flags.inProgress || !flags.paid} onClick={() => doAction(`/api/consultations/${selected._id}/ai/prescription`, 'Prescription generated')}>Generate Prescription</button>
                      <button className="btn ghost" onClick={markDoneDelete}>Mark Done And Delete</button>
                    </div>
                  )}
                  <h4>Reports</h4>
                  <div className="list compact">
                    {(selected.reports || []).length === 0 ? <div className="item"><div className="meta">No reports uploaded.</div></div> : selected.reports.map((r, i) => (
                      <div className="item" key={`${r.path}-${i}`}>
                        <div className="title">{r.originalName}</div>
                        <div className="meta">{r.mimeType} • {Math.round((r.size || 0) / 1024)} KB</div>
                        <div className="row"><a className="btn tiny" target="_blank" rel="noreferrer" href={r.path.startsWith('/') ? r.path : `/${r.path}`}>Open file</a></div>
                      </div>
                    ))}
                  </div>
                </section>
                )}
                {!patientLockedByPayment && (!isNativeApp || detailTab === 'call') ? <CallPane call={call} canUseCall={canUseCall} notify={notify} /> : null}
                {(!isNativeApp || detailTab === 'ai') && (
                <section className="pane full">
                  <h3>AI Output</h3>
                  <div className="text-output">
                    <label>Summary</label>
                    <textarea readOnly value={selected.ai?.summary || 'No AI summary generated yet.'}></textarea>
                  </div>
                  <div className="text-output">
                    <label>Suggestions</label>
                    <textarea readOnly value={selected.ai?.suggestions || 'No AI suggestions generated yet.'}></textarea>
                  </div>
                </section>
                )}
                {(!isNativeApp || detailTab === 'prescription') && (
                <section className="pane full">
                  <h3>Prescription</h3>
                  {isDoctor && (
                    <form className="form" onSubmit={saveManualPrescription}>
                      <label>Write Prescription
                        <textarea value={manualPrescription} onChange={(e) => setManualPrescription(e.target.value)} placeholder="Write prescription details..." required />
                      </label>
                      <button className="btn primary" disabled={!flags.inProgress || !flags.paid} type="submit">Save Prescription</button>
                    </form>
                  )}
                  <div className="list">
                    {selectedPrescriptionList.length === 0 ? <div className="item"><div className="meta">No prescription saved for this consultation yet.</div></div> : selectedPrescriptionList.map((p) => (
                      <div className="item" key={p._id}>
                        <div className="meta">Created: {new Date(p.createdAt).toLocaleString()}</div>
                        <pre>{p.text}</pre>
                      </div>
                    ))}
                  </div>
                </section>
                )}
              </div>
            </article>
          )}
          {isLoggedIn && !isAdmin && page === 'prescriptions' && (
            <article className="card">
              <div className="list-head">
                <div><h2>Prescriptions</h2><p>Issued or received prescriptions.</p></div>
                <button className="btn tiny" onClick={() => refreshPrescriptions().catch((e) => notify(e.message, true))}>Refresh</button>
              </div>
              <div className="list">
                {prescriptions.length === 0 ? <div className="item"><div className="meta">No prescriptions yet.</div></div> : prescriptions.map((p) => (
                  <div className="item" key={p._id}>
                    <div className="title">Consultation: {String(p.consultationId)}</div>
                    <div className="meta">Created: {new Date(p.createdAt).toLocaleString()}</div>
                    <pre>{p.text}</pre>
                  </div>
                ))}
              </div>
            </article>
          )}
        </section>
      </main>
      {toast.show && <aside className={`toast ${toast.bad ? 'bad' : 'good'}`}>{toast.message}</aside>}
      {modal.show && (
        <div className="modal-backdrop" onClick={(e) => e.target.className === 'modal-backdrop' && setModal((m) => ({ ...m, show: false }))}>
          <div className="modal-card">
            <h3>{modal.title}</h3>
            <p>{modal.message}</p>
            <button className="btn primary" onClick={() => setModal((m) => ({ ...m, show: false }))}>OK</button>
          </div>
        </div>
      )}
    </>
  );
}
function DoctorFeeRow({ doctor, onSave }) {
  const [fee, setFee] = useState(doctor.consultationFee || 499);
  return (
    <div className="item">
      <div className="title">{doctor.name} ({doctor.approved ? 'Approved' : 'Pending'})</div>
      <div className="meta">{doctor.email} • {doctor.specialization || 'N/A'}</div>
      <div className="row">
        <input type="number" min="1" value={fee} onChange={(e) => setFee(e.target.value)} />
        <button className="btn tiny" onClick={() => onSave(doctor._id, fee)}>Set Fee</button>
      </div>
    </div>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
