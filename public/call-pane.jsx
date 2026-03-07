const { useMemo } = React;

function formatDuration(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}

export function CallPane({ call, canUseCall, notify, isNativeApp, me, selected }) {
  const counterpartLabel = useMemo(() => {
    if (!selected) return '';
    if (me?.role === 'PATIENT') return selected?.doctorId?.name ? `Doctor ${selected.doctorId.name}` : 'Doctor';
    if (me?.role === 'DOCTOR') return selected?.patientId?.name ? `Patient ${selected.patientId.name}` : 'Patient';
    return 'Participant';
  }, [me?.role, selected]);

  if (!isNativeApp) {
    return (
      <section className="pane full call-pane">
        <h3>Video Call</h3>
        <p className="meta-line">Tap Call to ring the other person. They can accept or decline.</p>
        <div className="video-grid">
          <div>
            <label>Local</label>
            <video ref={call.localVideoRef} autoPlay muted playsInline></video>
          </div>
          <div>
            <label>Remote</label>
            <video ref={call.remoteVideoRef} autoPlay playsInline></video>
          </div>
        </div>
        {call.incomingCall && (
          <div className="call-incoming">
            <strong>Incoming call</strong>
            <span>{call.incomingCall.fromRole} is calling</span>
          </div>
        )}
        <div className="actions-inline">
          {!call.incomingCall && !call.localMediaActive && !call.remoteConnected ? (
            <button className="btn primary" disabled={!canUseCall} onClick={() => call.startCall().catch((e) => notify(e.message, true))}>Call</button>
          ) : (
            <>
              {call.incomingCall ? <button className="btn primary" disabled={!canUseCall} onClick={() => call.acceptIncomingCall().catch((e) => notify(e.message, true))}>Accept</button> : null}
              {call.incomingCall ? <button className="btn" disabled={!canUseCall} onClick={() => call.declineIncomingCall().catch((e) => notify(e.message, true))}>Decline</button> : null}
            </>
          )}
          <button className="btn ghost" disabled={!call.localMediaActive && !call.remoteConnected && !call.incomingCall} onClick={() => call.endCall(true).catch((e) => notify(e.message, true))}>End</button>
        </div>
        <div className="actions-inline">
          <button className="btn tiny" disabled={!call.localMediaActive} onClick={() => call.toggleMic().catch((e) => notify(e.message, true))}>
            {call.micOn ? 'Mute Mic' : 'Unmute Mic'}
          </button>
          <button className="btn tiny" disabled={!call.localMediaActive} onClick={() => call.toggleCamera().catch((e) => notify(e.message, true))}>
            {call.cameraOn ? 'Turn Camera Off' : 'Turn Camera On'}
          </button>
          <button className="btn tiny" disabled={!call.localMediaActive} onClick={() => call.switchCamera().catch((e) => notify(e.message, true))}>
            Switch Camera ({call.cameraFacing === 'user' ? 'Front' : 'Back'})
          </button>
        </div>
        <p className="meta-line">{call.callStatus}</p>
      </section>
    );
  }

  const fullscreen = Boolean(call?.isPhoneActiveCall);

  return (
    <section className={`pane full call-pane call-pane-native${fullscreen ? ' call-fullscreen' : ''}`}>
      {!fullscreen ? <h3>Video Call</h3> : null}
      {!fullscreen ? <p className="meta-line">Call {counterpartLabel}. Previous calls show below.</p> : null}

      <div className="call-stage">
        <video className="call-remote" ref={call.remoteVideoRef} autoPlay playsInline></video>
        <video className="call-local" ref={call.localVideoRef} autoPlay muted playsInline></video>

        {call.incomingCall && (
          <div className="call-incoming-overlay">
            <strong>Incoming call</strong>
            <span>{call.incomingCall.fromRole} is calling</span>
            <div className="actions-inline">
              <button className="btn primary" disabled={!canUseCall} onClick={() => call.acceptIncomingCall().catch((e) => notify(e.message, true))}>Accept</button>
              <button className="btn" disabled={!canUseCall} onClick={() => call.declineIncomingCall().catch((e) => notify(e.message, true))}>Decline</button>
            </div>
          </div>
        )}

        {!call.incomingCall && !call.localMediaActive && !call.remoteConnected ? (
          <div className="call-idle-overlay">
            <button className="btn primary" disabled={!canUseCall} onClick={() => call.startCall().catch((e) => notify(e.message, true))}>
              Call {counterpartLabel}
            </button>
            <div className="meta-line">{call.callStatus}</div>
          </div>
        ) : (
          <div className="call-controls">
            <button className="btn tiny" disabled={!call.localMediaActive} onClick={() => call.toggleMic().catch((e) => notify(e.message, true))}>
              {call.micOn ? 'Mute' : 'Unmute'}
            </button>
            <button className="btn tiny" disabled={!call.localMediaActive} onClick={() => call.toggleCamera().catch((e) => notify(e.message, true))}>
              {call.cameraOn ? 'Camera Off' : 'Camera On'}
            </button>
            <button className="btn tiny" disabled={!call.localMediaActive} onClick={() => call.switchCamera().catch((e) => notify(e.message, true))}>
              Switch ({call.cameraFacing === 'user' ? 'Front' : 'Back'})
            </button>
            <button className="btn ghost" disabled={!call.localMediaActive && !call.remoteConnected && !call.incomingCall} onClick={() => call.endCall(true).catch((e) => notify(e.message, true))}>
              End
            </button>
          </div>
        )}
      </div>

      {!call.localMediaActive && !call.remoteConnected && !call.incomingCall && (
        <div className="call-history">
          <div className="list-head">
            <h3>Previous Calls</h3>
          </div>
          <div className="list compact">
            {(call.callHistory || []).length === 0 ? (
              <div className="item"><div className="meta">No previous calls yet.</div></div>
            ) : (
              (call.callHistory || []).map((h) => (
                <div className="item" key={h.id}>
                  <div className="title">{new Date(h.startedAt).toLocaleString()}</div>
                  <div className="meta">Duration: {formatDuration(h.durationMs || 0)}</div>
                  <div className="row">
                    <button className="btn tiny ghost" onClick={() => call.deleteHistoryEntry(h.id)}>Delete</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </section>
  );
}
