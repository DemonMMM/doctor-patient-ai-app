const state = {
  token: localStorage.getItem('token') || '',
  me: null,
  consultations: [],
  selectedConsultation: null,
  doctors: []
};

const callState = {
  pc: null,
  localStream: null,
  remoteStream: null,
  pollTimer: null,
  lastSignalId: 0,
  joined: false,
  consultationId: null
};

const el = {
  apiStatus: document.getElementById('api-status'),
  toast: document.getElementById('toast'),
  authCard: document.getElementById('auth-card'),
  profileCard: document.getElementById('profile-card'),
  patientCreateCard: document.getElementById('patient-create-card'),
  adminCard: document.getElementById('admin-card'),
  detailsCard: document.getElementById('details-card'),
  chatPane: document.getElementById('chat-pane'),
  videoPane: document.getElementById('video-pane'),
  prescriptionsCard: document.getElementById('prescriptions-card'),
  consultationsList: document.getElementById('consultations-list'),
  chatList: document.getElementById('chat-list'),
  detailMeta: document.getElementById('detail-meta'),
  reportList: document.getElementById('report-list'),
  aiSummary: document.getElementById('ai-summary'),
  aiSuggestions: document.getElementById('ai-suggestions'),
  meId: document.getElementById('me-id'),
  meRole: document.getElementById('me-role'),
  sessionLine: document.getElementById('session-line'),
  adminStats: document.getElementById('admin-stats'),
  pendingDoctors: document.getElementById('pending-doctors'),
  adminDoctorFees: document.getElementById('admin-doctor-fees'),
  doctorSelect: document.getElementById('doctor-select'),
  doctorFeeValue: document.getElementById('doctor-fee-value'),
  prescriptionsList: document.getElementById('prescriptions-list'),
  patientActions: document.getElementById('patient-actions'),
  doctorAdminActions: document.getElementById('doctor-admin-actions'),
  doctorActions: document.getElementById('doctor-actions'),
  localVideo: document.getElementById('local-video'),
  remoteVideo: document.getElementById('remote-video'),
  callStatus: document.getElementById('call-status'),
  joinCallBtn: document.getElementById('join-call-btn'),
  startCallBtn: document.getElementById('start-call-btn'),
  endCallBtn: document.getElementById('end-call-btn'),
  modalBackdrop: document.getElementById('modal-backdrop'),
  modalTitle: document.getElementById('modal-title'),
  modalMessage: document.getElementById('modal-message'),
  modalOkBtn: document.getElementById('modal-ok-btn')
};

function setStatus(label, good = false) {
  el.apiStatus.textContent = label;
  el.apiStatus.className = `pill ${good ? 'good' : 'neutral'}`;
}

function showToast(message, bad = false) {
  el.toast.textContent = message;
  el.toast.className = `toast ${bad ? 'bad' : 'good'}`;
  el.toast.classList.remove('hidden');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => el.toast.classList.add('hidden'), 3200);
}

function showModal(title, message) {
  el.modalTitle.textContent = title;
  el.modalMessage.textContent = message;
  el.modalBackdrop.classList.remove('hidden');
}

function hideModal() {
  el.modalBackdrop.classList.add('hidden');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function personLabel(value) {
  if (!value) return 'N/A';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const name = value.name || '';
    const email = value.email || '';
    if (name && email) return `${name} (${email})`;
    if (name) return name;
    if (value._id) return value._id;
  }
  return String(value);
}

function updateSelectedDoctorFee() {
  const selected = el.doctorSelect?.selectedOptions?.[0];
  const fee = Number(selected?.getAttribute('data-fee') || 0);
  el.doctorFeeValue.textContent = `INR ${Number.isFinite(fee) && fee > 0 ? fee : 0}`;
}

function consultationFlags(consultation) {
  const status = consultation?.status || '';
  const paymentStatus = consultation?.paymentStatus || '';
  return {
    isInProgress: status === 'IN_PROGRESS',
    isScheduledOrRequested: status === 'SCHEDULED' || status === 'REQUESTED',
    isPaid: paymentStatus === 'PAID'
  };
}

async function api(path, options = {}) {
  const config = { ...options, headers: { ...(options.headers || {}) } };

  if (state.token) {
    config.headers.Authorization = `Bearer ${state.token}`;
  }

  if (!(options.body instanceof FormData) && !config.headers['Content-Type'] && options.body) {
    config.headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(path, config);
  const json = await res.json().catch(() => ({}));

  if (!res.ok || json.success === false) {
    const message = json.message || `Request failed (${res.status})`;
    throw new Error(message);
  }

  return json;
}

function isCallUser() {
  return Boolean(state.me && (state.me.role === 'DOCTOR' || state.me.role === 'PATIENT'));
}

function callTargetRole() {
  if (!state.me) return null;
  return state.me.role === 'DOCTOR' ? 'PATIENT' : 'DOCTOR';
}

function setCallStatus(message) {
  el.callStatus.textContent = message;
}

function clearRemoteMedia() {
  if (el.remoteVideo) el.remoteVideo.srcObject = null;
  callState.remoteStream = null;
}

function cleanupPeerConnection() {
  if (callState.pc) {
    callState.pc.onicecandidate = null;
    callState.pc.ontrack = null;
    callState.pc.close();
    callState.pc = null;
  }
}

function stopSignalPolling() {
  if (callState.pollTimer) {
    window.clearInterval(callState.pollTimer);
    callState.pollTimer = null;
  }
}

function updateCallButtons() {
  const flags = consultationFlags(state.selectedConsultation);
  const canUse = Boolean(state.selectedConsultation && isCallUser() && flags.isInProgress && flags.isPaid);
  el.joinCallBtn.disabled = !canUse;
  el.startCallBtn.disabled = !canUse || !callState.joined;
  el.endCallBtn.disabled = !canUse || (!callState.joined && !callState.localStream);
}

async function sendCallSignal(type, payload = null) {
  if (!state.selectedConsultation || !isCallUser()) return;
  const toRole = callTargetRole();
  await api(`/api/consultations/${state.selectedConsultation._id}/call/signal`, {
    method: 'POST',
    body: JSON.stringify({ type, payload, toRole })
  });
}

async function ensureLocalStream() {
  if (callState.localStream) return callState.localStream;
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser does not support video calling');
  }

  callState.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  el.localVideo.srcObject = callState.localStream;
  return callState.localStream;
}

function ensurePeerConnection() {
  if (callState.pc) return callState.pc;

  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
  });

  pc.onicecandidate = async (event) => {
    if (!event.candidate) return;
    try {
      await sendCallSignal('ice-candidate', event.candidate);
    } catch (err) {
      showToast(err.message, true);
    }
  };

  pc.ontrack = (event) => {
    const stream = event.streams?.[0];
    if (!stream) return;
    callState.remoteStream = stream;
    el.remoteVideo.srcObject = stream;
    setCallStatus('Connected');
  };

  callState.pc = pc;
  return pc;
}

async function attachLocalTracks() {
  const stream = await ensureLocalStream();
  const pc = ensurePeerConnection();
  const existing = pc.getSenders().map((s) => s.track).filter(Boolean);

  for (const track of stream.getTracks()) {
    if (!existing.includes(track)) {
      pc.addTrack(track, stream);
    }
  }
}

async function handleCallSignal(signal) {
  const pc = ensurePeerConnection();

  if (signal.type === 'offer') {
    await attachLocalTracks();
    await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await sendCallSignal('answer', answer);
    setCallStatus('Incoming call accepted');
    return;
  }

  if (signal.type === 'answer') {
    await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
    setCallStatus('Call established');
    return;
  }

  if (signal.type === 'ice-candidate') {
    if (signal.payload) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(signal.payload));
      } catch {
        // Ignore out-of-order ICE candidates while negotiation settles.
      }
    }
    return;
  }

  if (signal.type === 'hangup') {
    await endCall(false);
    setCallStatus('Other participant ended the call');
  }
}

async function pollCallSignals() {
  if (!state.selectedConsultation || !callState.joined) return;

  const result = await api(`/api/consultations/${state.selectedConsultation._id}/call/signals?since=${callState.lastSignalId}`);
  const data = result.data || {};
  const signals = Array.isArray(data.signals) ? data.signals : [];

  if (typeof data.lastId === 'number') {
    callState.lastSignalId = data.lastId;
  }

  for (const signal of signals) {
    await handleCallSignal(signal);
  }
}

function startSignalPolling() {
  stopSignalPolling();
  callState.pollTimer = window.setInterval(() => {
    pollCallSignals().catch((err) => {
      showToast(err.message, true);
    });
  }, 1200);
}

async function joinCall() {
  if (!state.selectedConsultation || !isCallUser()) return;

  await attachLocalTracks();
  callState.joined = true;
  callState.consultationId = state.selectedConsultation._id;
  callState.lastSignalId = 0;
  startSignalPolling();
  setCallStatus('Joined. Waiting for call...');
  updateCallButtons();
}

async function startCall() {
  if (!state.selectedConsultation || !isCallUser()) return;

  if (!callState.joined) {
    await joinCall();
  }

  const pc = ensurePeerConnection();
  await attachLocalTracks();
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await sendCallSignal('offer', offer);
  setCallStatus('Calling...');
}

async function endCall(sendHangup = true) {
  if (sendHangup && callState.joined && state.selectedConsultation && isCallUser()) {
    try {
      await sendCallSignal('hangup', { reason: 'ended' });
    } catch {
      // Best-effort signal during teardown.
    }
  }

  stopSignalPolling();
  cleanupPeerConnection();

  if (callState.localStream) {
    for (const track of callState.localStream.getTracks()) {
      track.stop();
    }
    callState.localStream = null;
  }

  if (el.localVideo) el.localVideo.srcObject = null;
  clearRemoteMedia();

  callState.joined = false;
  callState.consultationId = null;
  callState.lastSignalId = 0;
  setCallStatus('Call not started.');
  updateCallButtons();
}

function updateSessionUI() {
  const isLoggedIn = Boolean(state.token && state.me);

  el.authCard.classList.toggle('hidden', isLoggedIn);
  el.profileCard.classList.toggle('hidden', !isLoggedIn);
  el.detailsCard.classList.toggle('hidden', !state.selectedConsultation);
  el.prescriptionsCard.classList.toggle('hidden', !isLoggedIn || state.me.role === 'ADMIN');

  const isPatient = isLoggedIn && state.me.role === 'PATIENT';
  const isAdmin = isLoggedIn && state.me.role === 'ADMIN';
  const isDoctor = isLoggedIn && state.me.role === 'DOCTOR';

  el.patientCreateCard.classList.toggle('hidden', !isPatient);
  el.adminCard.classList.toggle('hidden', !isAdmin);

  if (isLoggedIn) {
    el.sessionLine.textContent = `${state.me.name} (${state.me.email})`;
    el.meId.textContent = state.me.id || state.me._id || '-';
    el.meRole.textContent = state.me.role;
  }

  if (state.selectedConsultation) {
    const flags = consultationFlags(state.selectedConsultation);
    const patientLockedByPayment = isPatient && !flags.isPaid;
    el.patientActions.classList.toggle('hidden', !isPatient);
    el.doctorAdminActions.classList.toggle('hidden', !(isDoctor || isAdmin));
    el.doctorActions.classList.toggle('hidden', !isDoctor);
    el.chatPane.classList.toggle('hidden', patientLockedByPayment);
    el.videoPane.classList.toggle('hidden', patientLockedByPayment);
    const createOrderBtn = document.getElementById('create-order-btn');
    const verifyPaymentBtn = document.getElementById('verify-payment-btn');
    const generatePrescriptionBtn = document.getElementById('generate-prescription-btn');
    const approveConsultationBtn = document.getElementById('approve-consultation-btn');
    const messageInput = document.getElementById('message-input');
    const messageSubmitBtn = document.querySelector('#message-form button[type=\"submit\"]');
    if (createOrderBtn) createOrderBtn.disabled = !isPatient || !flags.isInProgress;
    if (verifyPaymentBtn) verifyPaymentBtn.disabled = !isPatient || !flags.isInProgress;
    if (generatePrescriptionBtn) generatePrescriptionBtn.disabled = !isDoctor || !flags.isInProgress || !flags.isPaid;
    if (approveConsultationBtn) approveConsultationBtn.disabled = !isDoctor || !flags.isScheduledOrRequested;
    if (messageInput) messageInput.disabled = patientLockedByPayment;
    if (messageSubmitBtn) messageSubmitBtn.disabled = patientLockedByPayment;
  } else {
    el.chatPane.classList.remove('hidden');
    el.videoPane.classList.remove('hidden');
  }

  updateCallButtons();
}

function renderConsultationList() {
  if (!state.consultations.length) {
    el.consultationsList.innerHTML = '<div class="item"><div class="meta">No consultations yet.</div></div>';
    return;
  }

  el.consultationsList.innerHTML = state.consultations
    .map((c) => {
      const doctor = personLabel(c.doctorId);
      const patient = personLabel(c.patientId);
      const when = c.scheduledAt ? new Date(c.scheduledAt).toLocaleString() : 'Not scheduled';
      const isPatientLocked = state.me?.role === 'PATIENT' && c.status !== 'IN_PROGRESS';
      return `
        <div class="item">
          <div class="title">${escapeHtml(c.status)} • ${escapeHtml(c.paymentStatus)}</div>
          <div class="meta">ID: ${escapeHtml(c._id)}</div>
          <div class="meta">Doctor: ${escapeHtml(doctor)} | Patient: ${escapeHtml(patient)}</div>
          <div class="meta">When: ${escapeHtml(when)}</div>
          ${
            isPatientLocked
              ? '<div class="meta">Waiting for doctor approval. Open will unlock after approval.</div>'
              : ''
          }
          <div class="row">
            <button class="btn tiny" data-open-id="${escapeHtml(c._id)}" ${isPatientLocked ? 'disabled' : ''}>Open</button>
          </div>
        </div>
      `;
    })
    .join('');

  for (const button of el.consultationsList.querySelectorAll('[data-open-id]')) {
    button.addEventListener('click', () => openConsultation(button.getAttribute('data-open-id')));
  }
}

function renderSelectedConsultation() {
  const c = state.selectedConsultation;
  if (!c) {
    el.detailsCard.classList.add('hidden');
    return;
  }

  el.detailMeta.textContent = `Status: ${c.status} | Payment: ${c.paymentStatus} | ID: ${c._id}`;

  const chat = Array.isArray(c.chat) ? c.chat : [];
  el.chatList.innerHTML = chat.length
    ? chat
        .map(
          (m) => `<div class="chat-msg"><b>${escapeHtml(m.senderRole)}</b><p>${escapeHtml(m.message)}</p><span>${escapeHtml(
            new Date(m.createdAt).toLocaleString()
          )}</span></div>`
        )
        .join('')
    : '<div class="item"><div class="meta">No messages yet.</div></div>';

  const reports = Array.isArray(c.reports) ? c.reports : [];
  el.reportList.innerHTML = reports.length
    ? reports
        .map((r) => {
          const href = r.path.startsWith('/') ? r.path : `/${r.path}`;
          return `<div class="item"><div class="title">${escapeHtml(r.originalName)}</div><div class="meta">${escapeHtml(
            r.mimeType
          )} • ${escapeHtml(Math.round((r.size || 0) / 1024))} KB</div><div class="row"><a class="btn tiny" href="${escapeHtml(
            href
          )}" target="_blank" rel="noreferrer">Open file</a></div></div>`;
        })
        .join('')
    : '<div class="item"><div class="meta">No reports uploaded.</div></div>';

  el.aiSummary.value = c.ai?.summary || 'No AI summary generated yet.';
  el.aiSuggestions.value = c.ai?.suggestions || 'No AI suggestions generated yet.';

  if (!callState.joined) {
    setCallStatus('Call not started.');
  }

  updateSessionUI();
}

async function refreshProfile() {
  const me = await api('/api/users/me');
  state.me = me.data;
  setStatus(`Connected as ${state.me.role}`, true);
  updateSessionUI();
}

async function refreshConsultations() {
  if (!state.token) return;
  const result = await api('/api/consultations/my');
  state.consultations = Array.isArray(result.data) ? result.data : [];
  renderConsultationList();
}

async function openConsultation(id) {
  try {
    if (state.me?.role === 'PATIENT') {
      const existing = state.consultations.find((c) => c._id === id);
      if (existing && existing.status !== 'IN_PROGRESS') {
        showToast('You can open this only after doctor approval', true);
        return;
      }
    }

    if (callState.joined && state.selectedConsultation && state.selectedConsultation._id !== id) {
      await endCall(true);
    }

    const result = await api(`/api/consultations/${id}`);
    state.selectedConsultation = result.data;
    renderSelectedConsultation();
    showToast('Consultation loaded');
  } catch (err) {
    showToast(err.message, true);
  }
}

async function refreshDoctors() {
  const result = await api('/api/users/doctors');
  state.doctors = Array.isArray(result.data) ? result.data : [];

  if (!state.doctors.length) {
    el.doctorSelect.innerHTML = '<option value="">No approved doctors yet</option>';
    updateSelectedDoctorFee();
    return;
  }

  el.doctorSelect.innerHTML = state.doctors
    .map(
      (d) =>
        `<option value="${escapeHtml(d._id)}" data-fee="${escapeHtml(d.consultationFee || 499)}">${escapeHtml(d.name)} (${escapeHtml(
          d.specialization || 'General'
        )})</option>`
    )
    .join('');
  updateSelectedDoctorFee();
}

async function refreshAdmin() {
  if (!state.me || state.me.role !== 'ADMIN') return;

  const [statsRes, pendingRes, doctorsRes] = await Promise.all([
    api('/api/users/admin/stats'),
    api('/api/users/pending-doctors'),
    api('/api/users/admin/doctors')
  ]);

  const stats = statsRes.data || {};
  el.adminStats.innerHTML = [
    ['Users', stats.usersTotal || 0],
    ['Doctors', stats.doctorsTotal || 0],
    ['Pending', stats.doctorsPending || 0],
    ['Patients', stats.patientsTotal || 0]
  ]
    .map(([k, v]) => `<div class="stat"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`)
    .join('');

  const pending = Array.isArray(pendingRes.data) ? pendingRes.data : [];
  el.pendingDoctors.innerHTML = pending.length
    ? pending
        .map(
          (d) => `
        <div class="item">
          <div class="title">${escapeHtml(d.name)}</div>
          <div class="meta">${escapeHtml(d.email)} • ${escapeHtml(d.specialization || 'N/A')}</div>
          <div class="row"><button class="btn tiny" data-approve-id="${escapeHtml(d._id)}">Approve</button></div>
        </div>
      `
        )
        .join('')
    : '<div class="item"><div class="meta">No pending doctors.</div></div>';

  for (const button of el.pendingDoctors.querySelectorAll('[data-approve-id]')) {
    button.addEventListener('click', async () => {
      const id = button.getAttribute('data-approve-id');
      try {
        await api(`/api/users/approve-doctor/${id}`, { method: 'PATCH' });
        showToast('Doctor approved');
        await refreshAdmin();
      } catch (err) {
        showToast(err.message, true);
      }
    });
  }

  const doctors = Array.isArray(doctorsRes.data) ? doctorsRes.data : [];
  el.adminDoctorFees.innerHTML = doctors.length
    ? doctors
        .map(
          (d) => `
        <div class="item">
          <div class="title">${escapeHtml(d.name)} (${escapeHtml(d.approved ? 'Approved' : 'Pending')})</div>
          <div class="meta">${escapeHtml(d.email)} • ${escapeHtml(d.specialization || 'N/A')}</div>
          <div class="row">
            <input type="number" min="1" value="${escapeHtml(d.consultationFee || 499)}" data-fee-input-id="${escapeHtml(d._id)}" />
            <button class="btn tiny" data-fee-save-id="${escapeHtml(d._id)}">Set Fee</button>
          </div>
        </div>
      `
        )
        .join('')
    : '<div class="item"><div class="meta">No doctors found.</div></div>';

  for (const button of el.adminDoctorFees.querySelectorAll('[data-fee-save-id]')) {
    button.addEventListener('click', async () => {
      const doctorId = button.getAttribute('data-fee-save-id');
      const input = el.adminDoctorFees.querySelector(`[data-fee-input-id="${doctorId}"]`);
      const consultationFee = Number(input?.value || 0);
      try {
        await api(`/api/users/admin/doctors/${doctorId}/consultation-fee`, {
          method: 'PATCH',
          body: JSON.stringify({ consultationFee })
        });
        showToast('Doctor consultation fee updated');
        await refreshAdmin();
      } catch (err) {
        showToast(err.message, true);
      }
    });
  }
}

async function refreshPrescriptions() {
  if (!state.me || state.me.role === 'ADMIN') return;
  const result = await api('/api/consultations/my/prescriptions');
  const items = Array.isArray(result.data) ? result.data : [];

  el.prescriptionsList.innerHTML = items.length
    ? items
        .map(
          (p) => `
      <div class="item">
        <div class="title">Consultation: ${escapeHtml(p.consultationId)}</div>
        <div class="meta">Created: ${escapeHtml(new Date(p.createdAt).toLocaleString())}</div>
        <pre>${escapeHtml(p.text)}</pre>
      </div>
    `
        )
        .join('')
    : '<div class="item"><div class="meta">No prescriptions yet.</div></div>';
}

function clearSession() {
  void endCall(false);
  state.token = '';
  state.me = null;
  state.consultations = [];
  state.doctors = [];
  state.selectedConsultation = null;
  localStorage.removeItem('token');
  document.getElementById('login-form')?.reset();
  document.getElementById('register-form')?.reset();
  const roleSelect = document.getElementById('register-role');
  const specializationWrap = document.getElementById('specialization-wrap');
  const specializationInput = specializationWrap?.querySelector('input');
  if (roleSelect) roleSelect.value = 'PATIENT';
  if (specializationInput) specializationInput.value = '';
  specializationWrap?.classList.add('hidden');
  document.getElementById('create-consultation-form')?.reset();
  document.getElementById('upload-report-form')?.reset();
  document.getElementById('message-form')?.reset();
  el.detailMeta.textContent = '-';
  el.aiSummary.value = '';
  el.aiSuggestions.value = '';
  el.pendingDoctors.innerHTML = '';
  el.adminDoctorFees.innerHTML = '';
  el.adminStats.innerHTML = '';
  el.prescriptionsList.innerHTML = '';
  el.doctorSelect.innerHTML = '';
  el.doctorFeeValue.textContent = 'INR 0';
  setStatus('Not connected', false);
  updateSessionUI();
  renderConsultationList();
  el.chatList.innerHTML = '';
  el.reportList.innerHTML = '';
}

async function initializeSession() {
  if (!state.token) {
    updateSessionUI();
    return;
  }

  try {
    await refreshProfile();
    await refreshConsultations();

    if (state.me.role === 'PATIENT') await refreshDoctors();
    if (state.me.role === 'ADMIN') await refreshAdmin();
    if (state.me.role !== 'ADMIN') await refreshPrescriptions();
  } catch (err) {
    clearSession();
    showToast(err.message || 'Session expired', true);
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);

  try {
    const result = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: form.get('email'), password: form.get('password') })
    });

    state.token = result.data.token;
    localStorage.setItem('token', state.token);

    await initializeSession();
    showToast('Login successful');
  } catch (err) {
    showToast(err.message, true);
  }
}

async function handleRegister(event) {
  event.preventDefault();
  const formEl = event.currentTarget;
  const form = new FormData(formEl);
  const payload = {
    name: form.get('name'),
    email: form.get('email'),
    password: form.get('password'),
    role: form.get('role'),
    specialization: form.get('specialization') || undefined
  };

  try {
    const result = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    state.token = result.data.token;
    localStorage.setItem('token', state.token);
    formEl.reset();
    const specializationWrap = document.getElementById('specialization-wrap');
    const roleSelect = document.getElementById('register-role');
    if (roleSelect) roleSelect.value = 'PATIENT';
    specializationWrap?.classList.add('hidden');

    await initializeSession();
    showToast('Registration successful');
  } catch (err) {
    showToast(err.message, true);
  }
}

async function handleCreateConsultation(event) {
  event.preventDefault();
  const formEl = event.currentTarget;
  const form = new FormData(formEl);
  const scheduledAt = form.get('scheduledAt');
  const submitBtn = formEl.querySelector('button[type="submit"]');

  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating...';
    }

    const created = await api('/api/consultations', {
      method: 'POST',
      body: JSON.stringify({
        doctorId: form.get('doctorId'),
        scheduledAt: scheduledAt ? scheduledAt : undefined
      })
    });

    showToast('Consultation created');
    formEl.reset();
    await refreshConsultations();
    const status = created?.data?.status;
    if (status === 'SCHEDULED') {
      showModal('Consultation Scheduled', 'Your consultation has been scheduled. Please wait for the doctor to start.');
    }
  } catch (err) {
    showToast(err.message, true);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Consultation';
    }
  }
}

async function handleMessage(event) {
  event.preventDefault();
  if (!state.selectedConsultation) return;
  const input = document.getElementById('message-input');

  try {
    await api(`/api/consultations/${state.selectedConsultation._id}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message: input.value })
    });

    input.value = '';
    await openConsultation(state.selectedConsultation._id);
  } catch (err) {
    showToast(err.message, true);
  }
}

async function handleUploadReport(event) {
  event.preventDefault();
  if (!state.selectedConsultation) return;
  const formEl = event.currentTarget;

  const fileInput = document.getElementById('report-file');
  if (!fileInput.files.length) {
    showToast('Please select a file', true);
    return;
  }

  const data = new FormData();
  data.append('file', fileInput.files[0]);

  try {
    await api(`/api/consultations/${state.selectedConsultation._id}/reports`, {
      method: 'POST',
      body: data
    });

    showToast('Report uploaded');
    formEl.reset();
    await openConsultation(state.selectedConsultation._id);
  } catch (err) {
    showToast(err.message, true);
  }
}

async function runConsultationAction(path, successMessage) {
  if (!state.selectedConsultation) return;

  try {
    const result = await api(path, { method: 'POST' });
    showToast(successMessage || result.message || 'Done');
    await openConsultation(state.selectedConsultation._id);
    await refreshConsultations();
    await refreshPrescriptions();
  } catch (err) {
    showToast(err.message, true);
  }
}

async function handleMarkDoneAndDelete() {
  if (!state.selectedConsultation) return;
  const consultationId = state.selectedConsultation._id;

  try {
    await api(`/api/consultations/${consultationId}/doctor/complete-delete`, { method: 'POST' });
    await endCall(false);
    state.selectedConsultation = null;
    renderSelectedConsultation();
    updateSessionUI();
    await refreshConsultations();
    await refreshPrescriptions();
    showToast('Consultation marked done and deleted');
  } catch (err) {
    showToast(err.message, true);
  }
}

async function handleDoctorApproveConsultation() {
  if (!state.selectedConsultation) return;

  try {
    await api(`/api/consultations/${state.selectedConsultation._id}/doctor/approve`, { method: 'POST' });
    showToast('Consultation approved. Patient can proceed to payment.');
    await openConsultation(state.selectedConsultation._id);
    await refreshConsultations();
  } catch (err) {
    showToast(err.message, true);
  }
}

function setupEvents() {
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');

  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    loginForm.classList.remove('hidden');
    registerForm.classList.add('hidden');
  });

  tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    registerForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
  });

  document.getElementById('register-role').addEventListener('change', (event) => {
    const wrap = document.getElementById('specialization-wrap');
    const isDoctor = event.target.value === 'DOCTOR';
    wrap.classList.toggle('hidden', !isDoctor);
  });
  document.getElementById('doctor-select').addEventListener('change', updateSelectedDoctorFee);

  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('register-form').addEventListener('submit', handleRegister);
  document.getElementById('logout-btn').addEventListener('click', () => {
    clearSession();
    showToast('Logged out');
  });

  document.getElementById('refresh-consultations-btn').addEventListener('click', () =>
    refreshConsultations().catch((err) => showToast(err.message, true))
  );
  document.getElementById('create-consultation-form').addEventListener('submit', handleCreateConsultation);
  document.getElementById('message-form').addEventListener('submit', handleMessage);
  document.getElementById('upload-report-form').addEventListener('submit', handleUploadReport);

  document.getElementById('create-order-btn').addEventListener('click', () =>
    runConsultationAction(`/api/consultations/${state.selectedConsultation?._id}/payment/mock/create-order`, 'Order created')
  );
  document.getElementById('verify-payment-btn').addEventListener('click', () =>
    runConsultationAction(`/api/consultations/${state.selectedConsultation?._id}/payment/mock/verify`, 'Payment verified')
  );
  document.getElementById('ai-summary-btn').addEventListener('click', () =>
    runConsultationAction(`/api/consultations/${state.selectedConsultation?._id}/ai/summary`, 'AI summary generated')
  );
  document.getElementById('ai-suggestions-btn').addEventListener('click', () =>
    runConsultationAction(`/api/consultations/${state.selectedConsultation?._id}/ai/suggestions`, 'AI suggestions generated')
  );
  document.getElementById('generate-prescription-btn').addEventListener('click', () =>
    runConsultationAction(`/api/consultations/${state.selectedConsultation?._id}/ai/prescription`, 'Prescription generated')
  );
  document.getElementById('approve-consultation-btn').addEventListener('click', handleDoctorApproveConsultation);
  document.getElementById('mark-done-btn').addEventListener('click', handleMarkDoneAndDelete);

  document.getElementById('refresh-prescriptions-btn').addEventListener('click', () =>
    refreshPrescriptions().catch((err) => showToast(err.message, true))
  );

  document.getElementById('refresh-admin-btn').addEventListener('click', () =>
    refreshAdmin().catch((err) => showToast(err.message, true))
  );
  el.modalOkBtn.addEventListener('click', hideModal);
  el.modalBackdrop.addEventListener('click', (event) => {
    if (event.target === el.modalBackdrop) hideModal();
  });

  el.joinCallBtn.addEventListener('click', async () => {
    try {
      await joinCall();
      showToast('Joined video call');
    } catch (err) {
      showToast(err.message, true);
    }
  });

  el.startCallBtn.addEventListener('click', async () => {
    try {
      await startCall();
    } catch (err) {
      showToast(err.message, true);
    }
  });

  el.endCallBtn.addEventListener('click', async () => {
    await endCall(true);
    showToast('Call ended');
  });
}

setupEvents();
renderConsultationList();
updateCallButtons();
initializeSession();
