export function CallPane({ call, canUseCall, notify }) {
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
