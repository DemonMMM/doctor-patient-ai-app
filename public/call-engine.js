const { useEffect, useRef, useState } = React;

const DEFAULT_ICE_SERVERS = [
  {
    urls: [
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302',
      'stun:stun2.l.google.com:19302',
      'stun:stun3.l.google.com:19302',
      'stun:stun4.l.google.com:19302'
    ]
  },
  {
    urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'],
    username: 'openrelayproject',
    credential: 'openrelayproject'
  }
];

export function useCallEngine({ api, notify, selected, canUseCall, me, isNativeApp }) {
  const [callJoined, setCallJoined] = useState(false);
  const [callStatus, setCallStatus] = useState('Call not started.');
  const [incomingCall, setIncomingCall] = useState(null);
  const [remoteConnected, setRemoteConnected] = useState(false);
  const [localMediaActive, setLocalMediaActive] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [cameraFacing, setCameraFacing] = useState('user');

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const pollTimerRef = useRef(null);
  const lastSignalIdRef = useRef(0);
  const callConsultationIdRef = useRef(null);
  const callJoinedRef = useRef(false);
  const selectedRef = useRef(null);
  const meRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const iceServersRef = useRef(DEFAULT_ICE_SERVERS);
  const makingOfferRef = useRef(false);
  const ignoreOfferRef = useRef(false);
  const pendingIceCandidatesRef = useRef([]);
  const reconnectTimerRef = useRef(null);
  const reconnectInProgressRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const lastRestartAtRef = useRef(0);
  const preferredFacingModeRef = useRef('user');
  const pendingOfferRef = useRef(null);
  const signalCursorReadyRef = useRef(false);

  const isPhoneActiveCall = Boolean(isNativeApp && (incomingCall || localMediaActive || remoteConnected));

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    meRef.current = me;
  }, [me]);

  function stopPolling() {
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }

  function clearReconnectTimer() {
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }

  function cleanupPeer() {
    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    makingOfferRef.current = false;
    ignoreOfferRef.current = false;
    pendingIceCandidatesRef.current = [];
    pendingOfferRef.current = null;
    signalCursorReadyRef.current = false;
    reconnectInProgressRef.current = false;
    reconnectAttemptsRef.current = 0;
    clearReconnectTimer();
  }

  async function sendCallSignal(type, payload = null, consultationId = null) {
    const id = consultationId || callConsultationIdRef.current || selectedRef.current?._id;
    const user = meRef.current;
    if (!id || !user || (user.role !== 'DOCTOR' && user.role !== 'PATIENT')) return;

    const toRole = user.role === 'DOCTOR' ? 'PATIENT' : 'DOCTOR';
    await api(`/api/consultations/${id}/call/signal`, {
      method: 'POST',
      body: JSON.stringify({ type, payload, toRole })
    });
  }

  async function restartIceNegotiation(trigger) {
    if (!callJoinedRef.current) return;
    const pc = pcRef.current;
    if (!pc) return;
    if (reconnectInProgressRef.current) return;
    if (pc.signalingState !== 'stable') return;
    const now = Date.now();
    if (now - lastRestartAtRef.current < 8000) return;

    reconnectInProgressRef.current = true;
    lastRestartAtRef.current = now;
    reconnectAttemptsRef.current += 1;
    setCallStatus(`Reconnecting call (${reconnectAttemptsRef.current})...`);

    try {
      makingOfferRef.current = true;
      const offer = await pc.createOffer({
        iceRestart: true,
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await pc.setLocalDescription(offer);
      await sendCallSignal('offer', offer);
    } catch (err) {
      console.error('ICE restart failed', trigger, err);
      setCallStatus('Connection unstable. Trying to recover...');
    } finally {
      makingOfferRef.current = false;
      reconnectInProgressRef.current = false;
    }
  }

  function ensurePeerConnection() {
    if (pcRef.current) return pcRef.current;

    const pc = new RTCPeerConnection({
      iceServers: iceServersRef.current,
      iceCandidatePoolSize: 10,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    });

    pc.onicecandidate = async (event) => {
      if (!event.candidate) return;
      try {
        await sendCallSignal('ice-candidate', event.candidate);
      } catch (err) {
        notify(err.message, true);
      }
    };

    pc.ontrack = (event) => {
      const stream = event.streams?.[0];
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream || null;
      setRemoteConnected(true);
      setCallStatus('Connected');
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'failed') {
        setRemoteConnected(false);
        setCallStatus('Call network failed. Reconnecting...');
        void restartIceNegotiation('connection-failed');
      } else if (state === 'disconnected') {
        setRemoteConnected(false);
        setCallStatus('Connection unstable...');
        clearReconnectTimer();
        reconnectTimerRef.current = window.setTimeout(() => {
          if (!pcRef.current) return;
          const s = pcRef.current.connectionState;
          if (s === 'disconnected' || s === 'failed') {
            void restartIceNegotiation('connection-disconnected');
          }
        }, 6500);
      } else if (state === 'connected') {
        clearReconnectTimer();
        reconnectAttemptsRef.current = 0;
        setRemoteConnected(true);
        setCallStatus('Connected');
      }
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      if (state === 'failed') {
        setCallStatus('ICE failed. Reconnecting...');
        void restartIceNegotiation('ice-failed');
      } else if (state === 'disconnected') {
        clearReconnectTimer();
        reconnectTimerRef.current = window.setTimeout(() => {
          if (!pcRef.current) return;
          const s = pcRef.current.iceConnectionState;
          if (s === 'disconnected' || s === 'failed') {
            void restartIceNegotiation('ice-disconnected');
          }
        }, 6500);
      } else if (state === 'connected' || state === 'completed') {
        clearReconnectTimer();
        reconnectAttemptsRef.current = 0;
      }
    };

    pcRef.current = pc;
    return pc;
  }

  async function ensureLocalStream() {
    if (localStreamRef.current) return localStreamRef.current;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser does not support video calling');
    }

    let stream;
    try {
      const videoConstraints = isNativeApp
        ? {
            facingMode: { ideal: preferredFacingModeRef.current },
            width: { ideal: 960, max: 1280 },
            height: { ideal: 540, max: 720 },
            frameRate: { ideal: 24, max: 30 }
          }
        : { facingMode: { ideal: preferredFacingModeRef.current } };

      stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
    } catch (err) {
      const name = err?.name || 'MediaError';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        throw new Error('Camera/microphone permission denied. Please allow permissions and try again.');
      }
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        throw new Error('No camera or microphone found on this device.');
      }
      if (name === 'NotReadableError' || name === 'TrackStartError') {
        throw new Error('Camera/microphone is busy in another app. Close other apps and retry.');
      }
      throw new Error(err?.message || 'Unable to access camera/microphone');
    }

    localStreamRef.current = stream;
    const audioTrack = stream.getAudioTracks()[0];
    const videoTrack = stream.getVideoTracks()[0];
    setLocalMediaActive(true);
    setMicOn(audioTrack ? audioTrack.enabled !== false : true);
    setCameraOn(videoTrack ? videoTrack.enabled !== false : true);
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    return stream;
  }

  async function toggleMic() {
    const stream = await ensureLocalStream();
    const track = stream.getAudioTracks()[0];
    if (!track) {
      notify('Microphone track not available', true);
      return;
    }
    track.enabled = !track.enabled;
    setMicOn(track.enabled);
  }

  async function toggleCamera() {
    const stream = await ensureLocalStream();
    const track = stream.getVideoTracks()[0];
    if (!track) {
      notify('Camera track not available', true);
      return;
    }
    track.enabled = !track.enabled;
    setCameraOn(track.enabled);
  }

  async function switchCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera switch is not supported on this device');
    }

    const stream = await ensureLocalStream();
    const nextFacing = preferredFacingModeRef.current === 'user' ? 'environment' : 'user';

    let replacement;
    try {
      const replacementStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: nextFacing } },
        audio: false
      });
      replacement = replacementStream.getVideoTracks()[0];
      if (!replacement) throw new Error('No replacement camera track');
    } catch (err) {
      throw new Error(err?.message || 'Unable to switch camera');
    }

    const oldVideoTrack = stream.getVideoTracks()[0];
    if (oldVideoTrack) {
      stream.removeTrack(oldVideoTrack);
      oldVideoTrack.stop();
    }

    replacement.enabled = cameraOn;
    stream.addTrack(replacement);

    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    setLocalMediaActive(true);

    const pc = pcRef.current;
    if (pc) {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (sender) {
        await sender.replaceTrack(replacement);
      } else {
        pc.addTrack(replacement, stream);
      }
    }

    preferredFacingModeRef.current = nextFacing;
    setCameraFacing(nextFacing);
    setCallStatus(nextFacing === 'user' ? 'Front camera active' : 'Back camera active');
  }

  async function flushPendingIceCandidates() {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription) return;
    if (!pendingIceCandidatesRef.current.length) return;

    const queue = [...pendingIceCandidatesRef.current];
    pendingIceCandidatesRef.current = [];

    for (const candidate of queue) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        // Ignore stale candidates from previous negotiation rounds.
      }
    }
  }

  async function attachLocalTracks() {
    const stream = await ensureLocalStream();
    const pc = ensurePeerConnection();
    const senders = pc.getSenders();

    for (const track of stream.getTracks()) {
      const sender = senders.find((s) => s.track && s.track.kind === track.kind);
      if (sender) {
        await sender.replaceTrack(track);
      } else {
        pc.addTrack(track, stream);
      }
    }

    // Let browser adapt bitrate dynamically for better long-call stability.
  }

  async function handleIncomingSignal(signal) {
    const pc = ensurePeerConnection();
    const meRole = meRef.current?.role;
    const polite = meRole === 'PATIENT';

    if (signal.type === 'offer') {
      const hasLocalTracks = Boolean(localStreamRef.current?.getTracks?.().length);
      if (!hasLocalTracks) {
        pendingOfferRef.current = signal.payload;
        setIncomingCall({
          consultationId: callConsultationIdRef.current || selectedRef.current?._id || null,
          fromRole: signal.fromRole || 'Other participant'
        });
        setCallStatus('Incoming call. Accept to connect.');
        return;
      }

      await attachLocalTracks();

      const offerCollision = makingOfferRef.current || pc.signalingState !== 'stable';
      ignoreOfferRef.current = !polite && offerCollision;
      if (ignoreOfferRef.current) return;

      if (offerCollision && pc.signalingState !== 'stable') {
        try {
          await pc.setLocalDescription({ type: 'rollback' });
        } catch {
          // If rollback fails, continue and let setRemoteDescription report a clearer error.
        }
      }

      await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
      await flushPendingIceCandidates();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendCallSignal('answer', answer);
      setIncomingCall(null);
      setCallStatus('Incoming call accepted');
      return;
    }

    if (signal.type === 'answer') {
      if (pc.signalingState !== 'have-local-offer') return;
      await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
      await flushPendingIceCandidates();
      setCallStatus('Call established');
      return;
    }

    if (signal.type === 'ice-candidate' && signal.payload) {
      if (ignoreOfferRef.current) return;
      try {
        if (pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(signal.payload));
        } else {
          pendingIceCandidatesRef.current.push(signal.payload);
        }
      } catch {
        // Ignore out-of-order ICE candidates while negotiation settles.
      }
      return;
    }

    if (signal.type === 'hangup') {
      await endCall(false);
      setIncomingCall(null);
      setCallStatus('Other participant ended the call');
    }
  }

  async function ensureSignalPolling() {
    if (!selected?._id || !canUseCall) return;

    const nextId = selected._id;
    if (callConsultationIdRef.current !== nextId) {
      callConsultationIdRef.current = nextId;
      lastSignalIdRef.current = 0;
      signalCursorReadyRef.current = false;
    }

    if (!callJoinedRef.current) {
      callJoinedRef.current = true;
      setCallJoined(true);
    }

    if (!signalCursorReadyRef.current) {
      const r = await api(`/api/consultations/${nextId}/call/signals?since=${Number.MAX_SAFE_INTEGER}`);
      const latest = Number(r?.data?.lastId || 0);
      lastSignalIdRef.current = Number.isFinite(latest) ? latest : 0;
      signalCursorReadyRef.current = true;
      setCallStatus('Ready for calls');
    }

    if (pollTimerRef.current) return;

    await pollSignals();
    pollTimerRef.current = window.setInterval(() => {
      pollSignals().catch((err) => notify(err.message, true));
    }, 1200);
  }

  async function pollSignals() {
    const id = callConsultationIdRef.current;
    if (!id || !callJoinedRef.current || !signalCursorReadyRef.current) return;

    const r = await api(`/api/consultations/${id}/call/signals?since=${lastSignalIdRef.current}`);
    const data = r.data || {};
    if (typeof data.lastId === 'number') lastSignalIdRef.current = data.lastId;
    const signals = Array.isArray(data.signals) ? data.signals : [];

    for (const signal of signals) {
      try {
        await handleIncomingSignal(signal);
      } catch (err) {
        console.error('Signal handling failed', signal?.type, err);
        setCallStatus('Call sync issue detected. Retrying...');
      }
    }
  }

  async function startCall() {
    if (!canUseCall) return;
    await ensureSignalPolling();
    await attachLocalTracks();

    const pc = ensurePeerConnection();
    reconnectAttemptsRef.current = 0;
    let offer;
    makingOfferRef.current = true;

    try {
      offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await pc.setLocalDescription(offer);
    } finally {
      makingOfferRef.current = false;
    }

    await sendCallSignal('offer', offer);
    setCallStatus('Calling...');
  }

  async function acceptIncomingCall() {
    if (!canUseCall || !pendingOfferRef.current) return;

    await ensureSignalPolling();
    await attachLocalTracks();
    const pc = ensurePeerConnection();

    const incomingOffer = pendingOfferRef.current;
    pendingOfferRef.current = null;

    await pc.setRemoteDescription(new RTCSessionDescription(incomingOffer));
    await flushPendingIceCandidates();
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await sendCallSignal('answer', answer);
    setIncomingCall(null);
    setCallStatus('Connecting...');
  }

  async function declineIncomingCall() {
    pendingOfferRef.current = null;
    setIncomingCall(null);
    await sendCallSignal('hangup', { reason: 'declined' });
    setCallStatus('Call declined');
  }

  async function endCall(sendHangup = true, keepListening = true) {
    if (sendHangup && callJoinedRef.current) {
      try {
        await sendCallSignal('hangup', { reason: 'ended' });
      } catch {
        // Best effort during teardown.
      }
    }

    stopPolling();
    clearReconnectTimer();
    cleanupPeer();

    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        track.stop();
      }
      localStreamRef.current = null;
    }

    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;

    setIncomingCall(null);
    setRemoteConnected(false);
    setLocalMediaActive(false);
    setMicOn(true);
    setCameraOn(true);
    setCallStatus('Call ended');

    if (keepListening && selectedRef.current?._id && canUseCall) {
      await ensureSignalPolling();
      setCallStatus('Ready for calls');
    } else {
      callJoinedRef.current = false;
      setCallJoined(false);
      callConsultationIdRef.current = null;
      lastSignalIdRef.current = 0;
    }
  }

  async function loadRtcConfig() {
    try {
      const r = await api('/api/config/rtc');
      const list = r?.data?.iceServers;
      iceServersRef.current = Array.isArray(list) && list.length > 0 ? list : DEFAULT_ICE_SERVERS;
    } catch {
      iceServersRef.current = DEFAULT_ICE_SERVERS;
    }
  }

  async function onConsultationSwitch(nextConsultationId) {
    if (callJoined && callConsultationIdRef.current && callConsultationIdRef.current !== nextConsultationId) {
      await endCall(false, false);
    }
  }

  useEffect(() => {
    if (selected?._id && canUseCall && !callJoined) {
      ensureSignalPolling().catch((e) => notify(e.message, true));
      return;
    }

    if ((!selected?._id || !canUseCall) && callJoined) {
      stopPolling();
      callJoinedRef.current = false;
      setCallJoined(false);
      callConsultationIdRef.current = null;
      lastSignalIdRef.current = 0;
      signalCursorReadyRef.current = false;
      pendingOfferRef.current = null;
      setIncomingCall(null);
      setCallStatus('Call not available');
    }
  }, [selected?._id, canUseCall, callJoined]);

  useEffect(() => {
    return () => {
      void endCall(false, false);
    };
  }, []);

  return {
    callJoined,
    callStatus,
    incomingCall,
    remoteConnected,
    localMediaActive,
    micOn,
    cameraOn,
    cameraFacing,
    isPhoneActiveCall,
    localVideoRef,
    remoteVideoRef,
    loadRtcConfig,
    startCall,
    acceptIncomingCall,
    declineIncomingCall,
    endCall,
    toggleMic,
    toggleCamera,
    switchCamera,
    onConsultationSwitch,
    setCallStatus
  };
}
