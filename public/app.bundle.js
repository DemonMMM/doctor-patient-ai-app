"use strict";
(() => {
  // public/call-engine.js
  var { useEffect, useRef, useState } = React;
  var DEFAULT_ICE_SERVERS = [
    {
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
        "stun:stun2.l.google.com:19302",
        "stun:stun3.l.google.com:19302",
        "stun:stun4.l.google.com:19302"
      ]
    },
    {
      urls: ["turn:openrelay.metered.ca:80", "turn:openrelay.metered.ca:443", "turn:openrelay.metered.ca:443?transport=tcp"],
      username: "openrelayproject",
      credential: "openrelayproject"
    }
  ];
  function useCallEngine({ api, notify, selected, canUseCall, me, isNativeApp }) {
    const [callJoined, setCallJoined] = useState(false);
    const [callStatus, setCallStatus] = useState("Call not started.");
    const [incomingCall, setIncomingCall] = useState(null);
    const [remoteConnected, setRemoteConnected] = useState(false);
    const [localMediaActive, setLocalMediaActive] = useState(false);
    const [micOn, setMicOn] = useState(true);
    const [cameraOn, setCameraOn] = useState(true);
    const [cameraFacing, setCameraFacing] = useState("user");
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
    const preferredFacingModeRef = useRef("user");
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
      var _a;
      const id = consultationId || callConsultationIdRef.current || ((_a = selectedRef.current) == null ? void 0 : _a._id);
      const user = meRef.current;
      if (!id || !user || user.role !== "DOCTOR" && user.role !== "PATIENT") return;
      const toRole = user.role === "DOCTOR" ? "PATIENT" : "DOCTOR";
      await api(`/api/consultations/${id}/call/signal`, {
        method: "POST",
        body: JSON.stringify({ type, payload, toRole })
      });
    }
    async function restartIceNegotiation(trigger) {
      if (!callJoinedRef.current) return;
      const pc = pcRef.current;
      if (!pc) return;
      if (reconnectInProgressRef.current) return;
      if (pc.signalingState !== "stable") return;
      const now = Date.now();
      if (now - lastRestartAtRef.current < 8e3) return;
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
        await sendCallSignal("offer", offer);
      } catch (err) {
        console.error("ICE restart failed", trigger, err);
        setCallStatus("Connection unstable. Trying to recover...");
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
        bundlePolicy: "max-bundle",
        rtcpMuxPolicy: "require"
      });
      pc.onicecandidate = async (event) => {
        if (!event.candidate) return;
        try {
          await sendCallSignal("ice-candidate", event.candidate);
        } catch (err) {
          notify(err.message, true);
        }
      };
      pc.ontrack = (event) => {
        var _a;
        const stream = (_a = event.streams) == null ? void 0 : _a[0];
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream || null;
        setRemoteConnected(true);
        setCallStatus("Connected");
      };
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === "failed") {
          setRemoteConnected(false);
          setCallStatus("Call network failed. Reconnecting...");
          void restartIceNegotiation("connection-failed");
        } else if (state === "disconnected") {
          setRemoteConnected(false);
          setCallStatus("Connection unstable...");
          clearReconnectTimer();
          reconnectTimerRef.current = window.setTimeout(() => {
            if (!pcRef.current) return;
            const s = pcRef.current.connectionState;
            if (s === "disconnected" || s === "failed") {
              void restartIceNegotiation("connection-disconnected");
            }
          }, 6500);
        } else if (state === "connected") {
          clearReconnectTimer();
          reconnectAttemptsRef.current = 0;
          setRemoteConnected(true);
          setCallStatus("Connected");
        }
      };
      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        if (state === "failed") {
          setCallStatus("ICE failed. Reconnecting...");
          void restartIceNegotiation("ice-failed");
        } else if (state === "disconnected") {
          clearReconnectTimer();
          reconnectTimerRef.current = window.setTimeout(() => {
            if (!pcRef.current) return;
            const s = pcRef.current.iceConnectionState;
            if (s === "disconnected" || s === "failed") {
              void restartIceNegotiation("ice-disconnected");
            }
          }, 6500);
        } else if (state === "connected" || state === "completed") {
          clearReconnectTimer();
          reconnectAttemptsRef.current = 0;
        }
      };
      pcRef.current = pc;
      return pc;
    }
    async function ensureLocalStream() {
      var _a;
      if (localStreamRef.current) return localStreamRef.current;
      if (!((_a = navigator.mediaDevices) == null ? void 0 : _a.getUserMedia)) {
        throw new Error("This browser does not support video calling");
      }
      let stream;
      try {
        const videoConstraints = isNativeApp ? {
          facingMode: { ideal: preferredFacingModeRef.current },
          width: { ideal: 960, max: 1280 },
          height: { ideal: 540, max: 720 },
          frameRate: { ideal: 24, max: 30 }
        } : { facingMode: { ideal: preferredFacingModeRef.current } };
        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
      } catch (err) {
        const name = (err == null ? void 0 : err.name) || "MediaError";
        if (name === "NotAllowedError" || name === "PermissionDeniedError") {
          throw new Error("Camera/microphone permission denied. Please allow permissions and try again.");
        }
        if (name === "NotFoundError" || name === "DevicesNotFoundError") {
          throw new Error("No camera or microphone found on this device.");
        }
        if (name === "NotReadableError" || name === "TrackStartError") {
          throw new Error("Camera/microphone is busy in another app. Close other apps and retry.");
        }
        throw new Error((err == null ? void 0 : err.message) || "Unable to access camera/microphone");
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
        notify("Microphone track not available", true);
        return;
      }
      track.enabled = !track.enabled;
      setMicOn(track.enabled);
    }
    async function toggleCamera() {
      const stream = await ensureLocalStream();
      const track = stream.getVideoTracks()[0];
      if (!track) {
        notify("Camera track not available", true);
        return;
      }
      track.enabled = !track.enabled;
      setCameraOn(track.enabled);
    }
    async function switchCamera() {
      var _a;
      if (!((_a = navigator.mediaDevices) == null ? void 0 : _a.getUserMedia)) {
        throw new Error("Camera switch is not supported on this device");
      }
      const stream = await ensureLocalStream();
      const nextFacing = preferredFacingModeRef.current === "user" ? "environment" : "user";
      let replacement;
      try {
        const replacementStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: nextFacing } },
          audio: false
        });
        replacement = replacementStream.getVideoTracks()[0];
        if (!replacement) throw new Error("No replacement camera track");
      } catch (err) {
        throw new Error((err == null ? void 0 : err.message) || "Unable to switch camera");
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
        const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
        if (sender) {
          await sender.replaceTrack(replacement);
        } else {
          pc.addTrack(replacement, stream);
        }
      }
      preferredFacingModeRef.current = nextFacing;
      setCameraFacing(nextFacing);
      setCallStatus(nextFacing === "user" ? "Front camera active" : "Back camera active");
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
    }
    async function handleIncomingSignal(signal) {
      var _a, _b, _c, _d;
      const pc = ensurePeerConnection();
      const meRole = (_a = meRef.current) == null ? void 0 : _a.role;
      const polite = meRole === "PATIENT";
      if (signal.type === "offer") {
        const hasLocalTracks = Boolean((_c = (_b = localStreamRef.current) == null ? void 0 : _b.getTracks) == null ? void 0 : _c.call(_b).length);
        if (!hasLocalTracks) {
          pendingOfferRef.current = signal.payload;
          setIncomingCall({
            consultationId: callConsultationIdRef.current || ((_d = selectedRef.current) == null ? void 0 : _d._id) || null,
            fromRole: signal.fromRole || "Other participant"
          });
          setCallStatus("Incoming call. Accept to connect.");
          return;
        }
        await attachLocalTracks();
        const offerCollision = makingOfferRef.current || pc.signalingState !== "stable";
        ignoreOfferRef.current = !polite && offerCollision;
        if (ignoreOfferRef.current) return;
        if (offerCollision && pc.signalingState !== "stable") {
          try {
            await pc.setLocalDescription({ type: "rollback" });
          } catch {
          }
        }
        await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
        await flushPendingIceCandidates();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendCallSignal("answer", answer);
        setIncomingCall(null);
        setCallStatus("Incoming call accepted");
        return;
      }
      if (signal.type === "answer") {
        if (pc.signalingState !== "have-local-offer") return;
        await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
        await flushPendingIceCandidates();
        setCallStatus("Call established");
        return;
      }
      if (signal.type === "ice-candidate" && signal.payload) {
        if (ignoreOfferRef.current) return;
        try {
          if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.payload));
          } else {
            pendingIceCandidatesRef.current.push(signal.payload);
          }
        } catch {
        }
        return;
      }
      if (signal.type === "hangup") {
        await endCall(false);
        setIncomingCall(null);
        setCallStatus("Other participant ended the call");
      }
    }
    async function ensureSignalPolling() {
      var _a;
      if (!(selected == null ? void 0 : selected._id) || !canUseCall) return;
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
        const latest = Number(((_a = r == null ? void 0 : r.data) == null ? void 0 : _a.lastId) || 0);
        lastSignalIdRef.current = Number.isFinite(latest) ? latest : 0;
        signalCursorReadyRef.current = true;
        setCallStatus("Ready for calls");
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
      if (typeof data.lastId === "number") lastSignalIdRef.current = data.lastId;
      const signals = Array.isArray(data.signals) ? data.signals : [];
      for (const signal of signals) {
        try {
          await handleIncomingSignal(signal);
        } catch (err) {
          console.error("Signal handling failed", signal == null ? void 0 : signal.type, err);
          setCallStatus("Call sync issue detected. Retrying...");
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
      await sendCallSignal("offer", offer);
      setCallStatus("Calling...");
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
      await sendCallSignal("answer", answer);
      setIncomingCall(null);
      setCallStatus("Connecting...");
    }
    async function declineIncomingCall() {
      pendingOfferRef.current = null;
      setIncomingCall(null);
      await sendCallSignal("hangup", { reason: "declined" });
      setCallStatus("Call declined");
    }
    async function endCall(sendHangup = true, keepListening = true) {
      var _a;
      if (sendHangup && callJoinedRef.current) {
        try {
          await sendCallSignal("hangup", { reason: "ended" });
        } catch {
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
      setCallStatus("Call ended");
      if (keepListening && ((_a = selectedRef.current) == null ? void 0 : _a._id) && canUseCall) {
        await ensureSignalPolling();
        setCallStatus("Ready for calls");
      } else {
        callJoinedRef.current = false;
        setCallJoined(false);
        callConsultationIdRef.current = null;
        lastSignalIdRef.current = 0;
      }
    }
    async function loadRtcConfig() {
      var _a;
      try {
        const r = await api("/api/config/rtc");
        const list = (_a = r == null ? void 0 : r.data) == null ? void 0 : _a.iceServers;
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
      if ((selected == null ? void 0 : selected._id) && canUseCall && !callJoined) {
        ensureSignalPolling().catch((e) => notify(e.message, true));
        return;
      }
      if ((!(selected == null ? void 0 : selected._id) || !canUseCall) && callJoined) {
        stopPolling();
        callJoinedRef.current = false;
        setCallJoined(false);
        callConsultationIdRef.current = null;
        lastSignalIdRef.current = 0;
        signalCursorReadyRef.current = false;
        pendingOfferRef.current = null;
        setIncomingCall(null);
        setCallStatus("Call not available");
      }
    }, [selected == null ? void 0 : selected._id, canUseCall, callJoined]);
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

  // public/call-pane.jsx
  function CallPane({ call, canUseCall, notify }) {
    return /* @__PURE__ */ React.createElement("section", { className: "pane full call-pane" }, /* @__PURE__ */ React.createElement("h3", null, "Video Call"), /* @__PURE__ */ React.createElement("p", { className: "meta-line" }, "Tap Call to ring the other person. They can accept or decline."), /* @__PURE__ */ React.createElement("div", { className: "video-grid" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Local"), /* @__PURE__ */ React.createElement("video", { ref: call.localVideoRef, autoPlay: true, muted: true, playsInline: true })), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", null, "Remote"), /* @__PURE__ */ React.createElement("video", { ref: call.remoteVideoRef, autoPlay: true, playsInline: true }))), call.incomingCall && /* @__PURE__ */ React.createElement("div", { className: "call-incoming" }, /* @__PURE__ */ React.createElement("strong", null, "Incoming call"), /* @__PURE__ */ React.createElement("span", null, call.incomingCall.fromRole, " is calling")), /* @__PURE__ */ React.createElement("div", { className: "actions-inline" }, !call.incomingCall && !call.localMediaActive && !call.remoteConnected ? /* @__PURE__ */ React.createElement("button", { className: "btn primary", disabled: !canUseCall, onClick: () => call.startCall().catch((e) => notify(e.message, true)) }, "Call") : /* @__PURE__ */ React.createElement(React.Fragment, null, call.incomingCall ? /* @__PURE__ */ React.createElement("button", { className: "btn primary", disabled: !canUseCall, onClick: () => call.acceptIncomingCall().catch((e) => notify(e.message, true)) }, "Accept") : null, call.incomingCall ? /* @__PURE__ */ React.createElement("button", { className: "btn", disabled: !canUseCall, onClick: () => call.declineIncomingCall().catch((e) => notify(e.message, true)) }, "Decline") : null), /* @__PURE__ */ React.createElement("button", { className: "btn ghost", disabled: !call.localMediaActive && !call.remoteConnected && !call.incomingCall, onClick: () => call.endCall(true).catch((e) => notify(e.message, true)) }, "End")), /* @__PURE__ */ React.createElement("div", { className: "actions-inline" }, /* @__PURE__ */ React.createElement("button", { className: "btn tiny", disabled: !call.localMediaActive, onClick: () => call.toggleMic().catch((e) => notify(e.message, true)) }, call.micOn ? "Mute Mic" : "Unmute Mic"), /* @__PURE__ */ React.createElement("button", { className: "btn tiny", disabled: !call.localMediaActive, onClick: () => call.toggleCamera().catch((e) => notify(e.message, true)) }, call.cameraOn ? "Turn Camera Off" : "Turn Camera On"), /* @__PURE__ */ React.createElement("button", { className: "btn tiny", disabled: !call.localMediaActive, onClick: () => call.switchCamera().catch((e) => notify(e.message, true)) }, "Switch Camera (", call.cameraFacing === "user" ? "Front" : "Back", ")")), /* @__PURE__ */ React.createElement("p", { className: "meta-line" }, call.callStatus));
  }

  // public/app.jsx
  var { useEffect: useEffect2, useMemo, useState: useState2 } = React;
  var DEFAULT_API_BASE = "https://doctor-patient-ai-app.onrender.com";
  function App() {
    var _a, _b, _c, _d, _e;
    const isNativeApp = Boolean(window.Capacitor && ((_c = (_b = (_a = window.Capacitor).isNativePlatform) == null ? void 0 : _b.call(_a)) != null ? _c : true));
    const [token, setToken] = useState2(localStorage.getItem("token") || "");
    const apiBase = DEFAULT_API_BASE;
    const [me, setMe] = useState2(null);
    const [consultations, setConsultations] = useState2([]);
    const [selected, setSelected] = useState2(null);
    const [doctors, setDoctors] = useState2([]);
    const [adminStats, setAdminStats] = useState2(null);
    const [pendingDoctors, setPendingDoctors] = useState2([]);
    const [adminDoctors, setAdminDoctors] = useState2([]);
    const [prescriptions, setPrescriptions] = useState2([]);
    const [authTab, setAuthTab] = useState2("login");
    const [login, setLogin] = useState2({ email: "", password: "" });
    const [register, setRegister] = useState2({ name: "", email: "", password: "", role: "PATIENT", specialization: "" });
    const [booking, setBooking] = useState2({ doctorId: "", scheduledAt: "" });
    const [creating, setCreating] = useState2(false);
    const [chatMessage, setChatMessage] = useState2("");
    const [page, setPage] = useState2("home");
    const [toast, setToast] = useState2({ show: false, message: "", bad: false });
    const [modal, setModal] = useState2({ show: false, title: "", message: "" });
    const isLoggedIn = Boolean(token && me);
    const isAdmin = (me == null ? void 0 : me.role) === "ADMIN";
    const isDoctor = (me == null ? void 0 : me.role) === "DOCTOR";
    const isPatient = (me == null ? void 0 : me.role) === "PATIENT";
    const flags = useMemo(() => {
      const s = (selected == null ? void 0 : selected.status) || "";
      const p = (selected == null ? void 0 : selected.paymentStatus) || "";
      return {
        inProgress: s === "IN_PROGRESS",
        schedOrReq: s === "SCHEDULED" || s === "REQUESTED",
        paid: p === "PAID"
      };
    }, [selected]);
    const apiStatus = isLoggedIn ? `Connected as ${me.role}` : "Not connected";
    const patientLockedByPayment = isPatient && selected && selected.paymentStatus !== "PAID";
    const canUseCall = Boolean(selected && (isDoctor || isPatient) && flags.inProgress && flags.paid);
    function notify(message, bad = false) {
      setToast({ show: true, message, bad });
      window.clearTimeout(notify.t);
      notify.t = window.setTimeout(() => setToast((p) => ({ ...p, show: false })), 3e3);
    }
    async function api(path, options = {}) {
      var _a2, _b2;
      const headers = { ...options.headers || {} };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (!(options.body instanceof FormData) && options.body && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
      }
      const base = apiBase.trim().replace(/\/$/, "");
      const absolute = /^https?:\/\//i.test(path);
      if (!absolute && !base) throw new Error("API Base URL is not configured");
      const finalUrl = absolute ? path : base ? `${base}${path}` : path;
      const capacitorHttp = (_b2 = (_a2 = window.Capacitor) == null ? void 0 : _a2.Plugins) == null ? void 0 : _b2.CapacitorHttp;
      const isForm = options.body instanceof FormData;
      if (isNativeApp && capacitorHttp && !isForm) {
        const method = String(options.method || "GET").toUpperCase();
        let data = void 0;
        if (options.body) {
          if (typeof options.body === "string") {
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
        let payload = resp == null ? void 0 : resp.data;
        if (typeof payload === "string") {
          try {
            payload = JSON.parse(payload);
          } catch {
            payload = {};
          }
        }
        const status = Number((resp == null ? void 0 : resp.status) || 0);
        if (status < 200 || status >= 300 || (payload == null ? void 0 : payload.success) === false) {
          throw new Error((payload == null ? void 0 : payload.message) || `Request failed (${status || "native"})`);
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
    const call = useCallEngine({ api, notify, selected, canUseCall, me, isNativeApp });
    function personLabel(v) {
      if (!v) return "N/A";
      if (typeof v === "string") return v;
      return v.name ? `${v.name}${v.email ? ` (${v.email})` : ""}` : v._id || "N/A";
    }
    async function refreshProfile() {
      const r = await api("/api/users/me");
      if (!r || typeof r !== "object" || !r.data) {
        throw new Error("Invalid profile response from server");
      }
      setMe(r.data);
    }
    async function refreshConsultations() {
      const r = await api("/api/consultations/my");
      setConsultations(Array.isArray(r.data) ? r.data : []);
    }
    async function refreshDoctors() {
      var _a2;
      const r = await api("/api/users/doctors");
      const list = Array.isArray(r.data) ? r.data : [];
      setDoctors(list);
      if (!booking.doctorId && ((_a2 = list[0]) == null ? void 0 : _a2._id)) {
        setBooking((p) => ({ ...p, doctorId: list[0]._id }));
      }
    }
    async function refreshAdmin() {
      const [stats, pending, doctorsList] = await Promise.all([
        api("/api/users/admin/stats"),
        api("/api/users/pending-doctors"),
        api("/api/users/admin/doctors")
      ]);
      setAdminStats(stats.data || null);
      setPendingDoctors(Array.isArray(pending.data) ? pending.data : []);
      setAdminDoctors(Array.isArray(doctorsList.data) ? doctorsList.data : []);
    }
    async function refreshPrescriptions() {
      if (isAdmin) return;
      const r = await api("/api/consultations/my/prescriptions");
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
        notify(e.message || "Session expired", true);
      }
    }
    useEffect2(() => {
      bootstrap();
    }, [token]);
    useEffect2(() => {
      call.loadRtcConfig().catch(() => {
      });
    }, []);
    useEffect2(() => {
      if (!me) return;
      if (me.role === "PATIENT") refreshDoctors().catch((e) => notify(e.message, true));
      if (me.role === "ADMIN") refreshAdmin().catch((e) => notify(e.message, true));
      if (me.role !== "ADMIN") refreshPrescriptions().catch((e) => notify(e.message, true));
    }, [me]);
    async function loginSubmit(e) {
      var _a2;
      e.preventDefault();
      try {
        const r = await api("/api/auth/login", { method: "POST", body: JSON.stringify(login) });
        const nextToken = (_a2 = r == null ? void 0 : r.data) == null ? void 0 : _a2.token;
        if (!nextToken) {
          throw new Error("Login response missing token");
        }
        localStorage.setItem("token", nextToken);
        setToken(nextToken);
        setPage("consultations");
        setLogin({ email: "", password: "" });
        notify("Login successful");
      } catch (err) {
        notify(err.message, true);
      }
    }
    async function registerSubmit(e) {
      var _a2;
      e.preventDefault();
      try {
        const r = await api("/api/auth/register", {
          method: "POST",
          body: JSON.stringify({
            name: register.name,
            email: register.email,
            password: register.password,
            role: register.role,
            specialization: register.role === "DOCTOR" ? register.specialization : void 0
          })
        });
        const nextToken = (_a2 = r == null ? void 0 : r.data) == null ? void 0 : _a2.token;
        if (!nextToken) {
          throw new Error("Registration response missing token");
        }
        localStorage.setItem("token", nextToken);
        setToken(nextToken);
        setPage("consultations");
        setRegister({ name: "", email: "", password: "", role: "PATIENT", specialization: "" });
        notify("Registration successful");
      } catch (err) {
        notify(err.message, true);
      }
    }
    function logout() {
      void call.endCall(false, false);
      localStorage.removeItem("token");
      setToken("");
      setMe(null);
      setConsultations([]);
      setSelected(null);
      setDoctors([]);
      setAdminStats(null);
      setPendingDoctors([]);
      setAdminDoctors([]);
      setPrescriptions([]);
      setBooking({ doctorId: "", scheduledAt: "" });
      setPage("home");
    }
    async function openConsultation(id) {
      const existing = consultations.find((c) => c._id === id);
      if (isPatient && existing && existing.status !== "IN_PROGRESS") {
        notify("You can open this only after doctor approval", true);
        return;
      }
      try {
        await call.onConsultationSwitch(id);
        const r = await api(`/api/consultations/${id}`);
        setSelected(r.data);
        call.setCallStatus("Call not started.");
        setPage("detail");
        notify("Consultation loaded");
      } catch (err) {
        const msg = String((err == null ? void 0 : err.message) || "");
        if (msg.includes("Failed to fetch")) {
          notify(`Network fetch failed. API URL: ${apiBase}`, true);
        } else {
          notify(msg, true);
        }
      }
    }
    async function createConsultation(e) {
      var _a2;
      e.preventDefault();
      if (creating) return;
      setCreating(true);
      try {
        const r = await api("/api/consultations", {
          method: "POST",
          body: JSON.stringify({
            doctorId: booking.doctorId,
            scheduledAt: booking.scheduledAt || void 0
          })
        });
        await refreshConsultations();
        setBooking((p) => ({ ...p, scheduledAt: "" }));
        notify("Consultation created");
        if (((_a2 = r.data) == null ? void 0 : _a2.status) === "SCHEDULED") {
          setModal({
            show: true,
            title: "Consultation Scheduled",
            message: "Your consultation has been scheduled. Please wait for the doctor to approve and then complete payment."
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
        await api(`/api/consultations/${selected._id}/messages`, { method: "POST", body: JSON.stringify({ message: chatMessage }) });
        setChatMessage("");
        await openConsultation(selected._id);
      } catch (err) {
        const msg = String((err == null ? void 0 : err.message) || "");
        if (msg.includes("Failed to fetch")) {
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
      if (!file) return notify("Please select a file", true);
      const fd = new FormData();
      fd.append("file", file);
      try {
        await api(`/api/consultations/${selected._id}/reports`, { method: "POST", body: fd });
        e.target.reset();
        await openConsultation(selected._id);
        notify("Report uploaded");
      } catch (err) {
        notify(err.message, true);
      }
    }
    async function doAction(path, success) {
      if (!selected) return;
      try {
        await api(path, { method: "POST" });
        await refreshConsultations();
        if (path.includes("/ai/prescription")) {
          setSelected(null);
        } else {
          await openConsultation(selected._id);
        }
        if (!isAdmin) await refreshPrescriptions();
        notify(success);
      } catch (err) {
        notify(err.message, true);
      }
    }
    async function markDoneDelete() {
      if (!selected) return;
      try {
        await api(`/api/consultations/${selected._id}/doctor/complete-delete`, { method: "POST" });
        await call.endCall(false, false);
        setSelected(null);
        await refreshConsultations();
        if (!isAdmin) await refreshPrescriptions();
        notify("Consultation marked done and deleted");
      } catch (err) {
        notify(err.message, true);
      }
    }
    async function approveDoctor(id) {
      try {
        await api(`/api/users/approve-doctor/${id}`, { method: "PATCH" });
        await refreshAdmin();
        notify("Doctor approved");
      } catch (err) {
        notify(err.message, true);
      }
    }
    async function setDoctorFee(id, consultationFee) {
      try {
        await api(`/api/users/admin/doctors/${id}/consultation-fee`, {
          method: "PATCH",
          body: JSON.stringify({ consultationFee: Number(consultationFee) })
        });
        await refreshAdmin();
        notify("Doctor consultation fee updated");
      } catch (err) {
        notify(err.message, true);
      }
    }
    const selectedDoctorFee = useMemo(() => {
      const d = doctors.find((x) => x._id === booking.doctorId);
      return (d == null ? void 0 : d.consultationFee) || 0;
    }, [doctors, booking.doctorId]);
    return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "bg-orb orb-a" }), /* @__PURE__ */ React.createElement("div", { className: "bg-orb orb-b" }), /* @__PURE__ */ React.createElement("div", { className: "bg-grid" }), /* @__PURE__ */ React.createElement("header", { className: "topbar" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("p", { className: "eyebrow" }, "Doctor + Patient AI Platform"), /* @__PURE__ */ React.createElement("h1", null, "MediFlow Console")), /* @__PURE__ */ React.createElement("div", { className: "status-wrap" }, /* @__PURE__ */ React.createElement("span", { className: `pill ${isLoggedIn ? "good" : "neutral"}` }, apiStatus))), isLoggedIn && /* @__PURE__ */ React.createElement("div", { className: "segmented app-nav" }, /* @__PURE__ */ React.createElement("button", { className: page === "home" ? "active" : "", onClick: () => setPage("home") }, "Home"), /* @__PURE__ */ React.createElement("button", { className: page === "consultations" ? "active" : "", onClick: () => setPage("consultations") }, "Consultations"), /* @__PURE__ */ React.createElement("button", { className: page === "detail" ? "active" : "", onClick: () => setPage("detail"), disabled: !selected }, "Detail"), !isAdmin ? /* @__PURE__ */ React.createElement("button", { className: page === "prescriptions" ? "active" : "", onClick: () => setPage("prescriptions") }, "Prescriptions") : null), /* @__PURE__ */ React.createElement("main", { className: "layout" }, /* @__PURE__ */ React.createElement("section", { className: "stack left" }, !isLoggedIn && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("article", { className: "card" }, /* @__PURE__ */ React.createElement("div", { className: "card-head" }, /* @__PURE__ */ React.createElement("h2", null, "Authentication"), /* @__PURE__ */ React.createElement("p", null, "Login or register to continue.")), /* @__PURE__ */ React.createElement("div", { className: "segmented" }, /* @__PURE__ */ React.createElement("button", { className: authTab === "login" ? "active" : "", onClick: () => setAuthTab("login") }, "Login"), /* @__PURE__ */ React.createElement("button", { className: authTab === "register" ? "active" : "", onClick: () => setAuthTab("register") }, "Register")), authTab === "login" ? /* @__PURE__ */ React.createElement("form", { className: "form", onSubmit: loginSubmit }, /* @__PURE__ */ React.createElement("label", null, "Email ", /* @__PURE__ */ React.createElement("input", { type: "email", value: login.email, onChange: (e) => setLogin((p) => ({ ...p, email: e.target.value })), required: true })), /* @__PURE__ */ React.createElement("label", null, "Password ", /* @__PURE__ */ React.createElement("input", { type: "password", value: login.password, onChange: (e) => setLogin((p) => ({ ...p, password: e.target.value })), required: true })), /* @__PURE__ */ React.createElement("button", { className: "btn primary", type: "submit" }, "Login")) : /* @__PURE__ */ React.createElement("form", { className: "form", onSubmit: registerSubmit }, /* @__PURE__ */ React.createElement("label", null, "Name ", /* @__PURE__ */ React.createElement("input", { value: register.name, onChange: (e) => setRegister((p) => ({ ...p, name: e.target.value })), required: true })), /* @__PURE__ */ React.createElement("label", null, "Email ", /* @__PURE__ */ React.createElement("input", { type: "email", value: register.email, onChange: (e) => setRegister((p) => ({ ...p, email: e.target.value })), required: true })), /* @__PURE__ */ React.createElement("label", null, "Password ", /* @__PURE__ */ React.createElement("input", { type: "password", value: register.password, onChange: (e) => setRegister((p) => ({ ...p, password: e.target.value })), required: true })), /* @__PURE__ */ React.createElement("label", null, "Role", /* @__PURE__ */ React.createElement("select", { value: register.role, onChange: (e) => setRegister((p) => ({ ...p, role: e.target.value })) }, /* @__PURE__ */ React.createElement("option", { value: "PATIENT" }, "PATIENT"), /* @__PURE__ */ React.createElement("option", { value: "DOCTOR" }, "DOCTOR"))), register.role === "DOCTOR" && /* @__PURE__ */ React.createElement("label", null, "Specialization ", /* @__PURE__ */ React.createElement("input", { value: register.specialization, onChange: (e) => setRegister((p) => ({ ...p, specialization: e.target.value })) })), /* @__PURE__ */ React.createElement("button", { className: "btn primary", type: "submit" }, "Create Account")))), isLoggedIn && page === "home" && /* @__PURE__ */ React.createElement("article", { className: "card" }, /* @__PURE__ */ React.createElement("div", { className: "card-head" }, /* @__PURE__ */ React.createElement("h2", null, "Session"), /* @__PURE__ */ React.createElement("p", null, me.name, " (", me.email, ")")), /* @__PURE__ */ React.createElement("div", { className: "stats-grid mini" }, /* @__PURE__ */ React.createElement("div", { className: "stat" }, /* @__PURE__ */ React.createElement("span", null, "ID"), /* @__PURE__ */ React.createElement("strong", null, me.id || me._id)), /* @__PURE__ */ React.createElement("div", { className: "stat" }, /* @__PURE__ */ React.createElement("span", null, "Role"), /* @__PURE__ */ React.createElement("strong", null, me.role))), /* @__PURE__ */ React.createElement("button", { className: "btn ghost", onClick: logout }, "Logout")), isPatient && page === "home" && /* @__PURE__ */ React.createElement("article", { className: "card" }, /* @__PURE__ */ React.createElement("div", { className: "card-head" }, /* @__PURE__ */ React.createElement("h2", null, "Book Consultation"), /* @__PURE__ */ React.createElement("p", null, "Create a new appointment request.")), /* @__PURE__ */ React.createElement("form", { className: "form", onSubmit: createConsultation }, /* @__PURE__ */ React.createElement("label", null, "Doctor", /* @__PURE__ */ React.createElement("select", { value: booking.doctorId, onChange: (e) => setBooking((p) => ({ ...p, doctorId: e.target.value })), required: true }, doctors.length === 0 ? /* @__PURE__ */ React.createElement("option", { value: "" }, "No approved doctors yet") : null, doctors.map((d) => /* @__PURE__ */ React.createElement("option", { key: d._id, value: d._id }, d.name, " (", d.specialization || "General", ")")))), /* @__PURE__ */ React.createElement("label", null, "Schedule (optional) ", /* @__PURE__ */ React.createElement("input", { type: "datetime-local", value: booking.scheduledAt, onChange: (e) => setBooking((p) => ({ ...p, scheduledAt: e.target.value })) })), /* @__PURE__ */ React.createElement("p", { className: "meta-line" }, "Consultation Fee: ", /* @__PURE__ */ React.createElement("strong", null, "INR ", selectedDoctorFee)), /* @__PURE__ */ React.createElement("button", { className: "btn primary", disabled: creating, type: "submit" }, creating ? "Creating..." : "Create Consultation"))), isAdmin && page === "home" && /* @__PURE__ */ React.createElement("article", { className: "card" }, /* @__PURE__ */ React.createElement("div", { className: "card-head" }, /* @__PURE__ */ React.createElement("h2", null, "Admin Control"), /* @__PURE__ */ React.createElement("p", null, "Platform overview and doctor approval.")), adminStats && /* @__PURE__ */ React.createElement("div", { className: "stats-grid" }, /* @__PURE__ */ React.createElement("div", { className: "stat" }, /* @__PURE__ */ React.createElement("span", null, "Users"), /* @__PURE__ */ React.createElement("strong", null, adminStats.usersTotal)), /* @__PURE__ */ React.createElement("div", { className: "stat" }, /* @__PURE__ */ React.createElement("span", null, "Doctors"), /* @__PURE__ */ React.createElement("strong", null, adminStats.doctorsTotal)), /* @__PURE__ */ React.createElement("div", { className: "stat" }, /* @__PURE__ */ React.createElement("span", null, "Pending"), /* @__PURE__ */ React.createElement("strong", null, adminStats.doctorsPending)), /* @__PURE__ */ React.createElement("div", { className: "stat" }, /* @__PURE__ */ React.createElement("span", null, "Patients"), /* @__PURE__ */ React.createElement("strong", null, adminStats.patientsTotal))), /* @__PURE__ */ React.createElement("div", { className: "list-head" }, /* @__PURE__ */ React.createElement("h3", null, "Pending Doctors"), /* @__PURE__ */ React.createElement("button", { className: "btn tiny", onClick: () => refreshAdmin().catch((e) => notify(e.message, true)) }, "Refresh")), /* @__PURE__ */ React.createElement("div", { className: "list" }, pendingDoctors.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "item" }, /* @__PURE__ */ React.createElement("div", { className: "meta" }, "No pending doctors.")) : pendingDoctors.map((d) => /* @__PURE__ */ React.createElement("div", { className: "item", key: d._id }, /* @__PURE__ */ React.createElement("div", { className: "title" }, d.name), /* @__PURE__ */ React.createElement("div", { className: "meta" }, d.email, " \u2022 ", d.specialization || "N/A"), /* @__PURE__ */ React.createElement("div", { className: "row" }, /* @__PURE__ */ React.createElement("button", { className: "btn tiny", onClick: () => approveDoctor(d._id) }, "Approve"))))), /* @__PURE__ */ React.createElement("div", { className: "list-head" }, /* @__PURE__ */ React.createElement("h3", null, "Doctor Fees")), /* @__PURE__ */ React.createElement("div", { className: "list" }, adminDoctors.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "item" }, /* @__PURE__ */ React.createElement("div", { className: "meta" }, "No doctors found.")) : adminDoctors.map((d) => /* @__PURE__ */ React.createElement(DoctorFeeRow, { key: d._id, doctor: d, onSave: setDoctorFee }))))), /* @__PURE__ */ React.createElement("section", { className: "stack right" }, isLoggedIn && page === "consultations" && /* @__PURE__ */ React.createElement("article", { className: "card" }, /* @__PURE__ */ React.createElement("div", { className: "list-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", null, "Consultations"), /* @__PURE__ */ React.createElement("p", null, "Pick one to open details.")), /* @__PURE__ */ React.createElement("button", { className: "btn tiny", onClick: () => refreshConsultations().catch((e) => notify(e.message, true)) }, "Refresh")), /* @__PURE__ */ React.createElement("div", { className: "list" }, consultations.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "item" }, /* @__PURE__ */ React.createElement("div", { className: "meta" }, "No consultations yet.")) : consultations.map((c) => {
      const locked = isPatient && c.status !== "IN_PROGRESS";
      return /* @__PURE__ */ React.createElement("div", { className: "item", key: c._id }, /* @__PURE__ */ React.createElement("div", { className: "title" }, c.status, " \u2022 ", c.paymentStatus), /* @__PURE__ */ React.createElement("div", { className: "meta" }, "ID: ", c._id), /* @__PURE__ */ React.createElement("div", { className: "meta" }, "Doctor: ", personLabel(c.doctorId), " | Patient: ", personLabel(c.patientId)), /* @__PURE__ */ React.createElement("div", { className: "meta" }, "When: ", c.scheduledAt ? new Date(c.scheduledAt).toLocaleString() : "Not scheduled"), locked ? /* @__PURE__ */ React.createElement("div", { className: "meta" }, "Waiting for doctor approval. Open unlocks after approval.") : null, /* @__PURE__ */ React.createElement("div", { className: "row" }, /* @__PURE__ */ React.createElement("button", { className: "btn tiny", disabled: locked, onClick: () => openConsultation(c._id) }, "Open")));
    }))), isLoggedIn && page === "detail" && !selected && /* @__PURE__ */ React.createElement("article", { className: "card" }, /* @__PURE__ */ React.createElement("div", { className: "item" }, /* @__PURE__ */ React.createElement("div", { className: "meta" }, "Select a consultation first from the Consultations page."))), isLoggedIn && page === "detail" && selected && /* @__PURE__ */ React.createElement("article", { className: "card" }, /* @__PURE__ */ React.createElement("div", { className: "list-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", null, "Consultation Detail"), /* @__PURE__ */ React.createElement("p", null, "Status: ", selected.status, " | Payment: ", selected.paymentStatus, " | ID: ", selected._id))), /* @__PURE__ */ React.createElement("div", { className: "detail-grid" }, !patientLockedByPayment && /* @__PURE__ */ React.createElement("section", { className: "pane" }, /* @__PURE__ */ React.createElement("h3", null, "Chat"), /* @__PURE__ */ React.createElement("div", { className: "chat" }, (selected.chat || []).length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "item" }, /* @__PURE__ */ React.createElement("div", { className: "meta" }, "No messages yet.")) : selected.chat.map((m, i) => /* @__PURE__ */ React.createElement("div", { className: "chat-msg", key: `${m.createdAt}-${i}` }, /* @__PURE__ */ React.createElement("b", null, m.senderRole), /* @__PURE__ */ React.createElement("p", null, m.message), /* @__PURE__ */ React.createElement("span", null, new Date(m.createdAt).toLocaleString())))), /* @__PURE__ */ React.createElement("form", { className: "inline-form", onSubmit: postMessage }, /* @__PURE__ */ React.createElement("input", { value: chatMessage, onChange: (e) => setChatMessage(e.target.value), placeholder: "Type your message", required: true }), /* @__PURE__ */ React.createElement("button", { className: "btn primary", type: "submit" }, "Send"))), /* @__PURE__ */ React.createElement("section", { className: "pane" }, /* @__PURE__ */ React.createElement("h3", null, "Actions"), isPatient && /* @__PURE__ */ React.createElement("div", { className: "actions" }, /* @__PURE__ */ React.createElement("button", { className: "btn", disabled: !flags.inProgress, onClick: () => doAction(`/api/consultations/${selected._id}/payment/mock/create-order`, "Order created") }, "Create Payment Order"), /* @__PURE__ */ React.createElement("button", { className: "btn", disabled: !flags.inProgress, onClick: () => doAction(`/api/consultations/${selected._id}/payment/mock/verify`, "Payment verified") }, "Verify Mock Payment"), /* @__PURE__ */ React.createElement("form", { className: "inline-form", onSubmit: uploadReport }, /* @__PURE__ */ React.createElement("input", { name: "file", type: "file", required: true }), /* @__PURE__ */ React.createElement("button", { className: "btn", type: "submit" }, "Upload Report"))), (isDoctor || isAdmin) && /* @__PURE__ */ React.createElement("div", { className: "actions" }, /* @__PURE__ */ React.createElement("button", { className: "btn", onClick: () => doAction(`/api/consultations/${selected._id}/ai/summary`, "AI summary generated") }, "Generate AI Summary"), /* @__PURE__ */ React.createElement("button", { className: "btn", onClick: () => doAction(`/api/consultations/${selected._id}/ai/suggestions`, "AI suggestions generated") }, "Generate AI Suggestions")), isDoctor && /* @__PURE__ */ React.createElement("div", { className: "actions" }, /* @__PURE__ */ React.createElement("button", { className: "btn", disabled: !flags.schedOrReq, onClick: () => doAction(`/api/consultations/${selected._id}/doctor/approve`, "Consultation approved") }, "Approve Consultation"), /* @__PURE__ */ React.createElement("button", { className: "btn accent", disabled: !flags.inProgress || !flags.paid, onClick: () => doAction(`/api/consultations/${selected._id}/ai/prescription`, "Prescription generated") }, "Generate Prescription"), /* @__PURE__ */ React.createElement("button", { className: "btn ghost", onClick: markDoneDelete }, "Mark Done And Delete")), /* @__PURE__ */ React.createElement("h4", null, "Reports"), /* @__PURE__ */ React.createElement("div", { className: "list compact" }, (selected.reports || []).length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "item" }, /* @__PURE__ */ React.createElement("div", { className: "meta" }, "No reports uploaded.")) : selected.reports.map((r, i) => /* @__PURE__ */ React.createElement("div", { className: "item", key: `${r.path}-${i}` }, /* @__PURE__ */ React.createElement("div", { className: "title" }, r.originalName), /* @__PURE__ */ React.createElement("div", { className: "meta" }, r.mimeType, " \u2022 ", Math.round((r.size || 0) / 1024), " KB"), /* @__PURE__ */ React.createElement("div", { className: "row" }, /* @__PURE__ */ React.createElement("a", { className: "btn tiny", target: "_blank", rel: "noreferrer", href: r.path.startsWith("/") ? r.path : `/${r.path}` }, "Open file")))))), !patientLockedByPayment ? /* @__PURE__ */ React.createElement(CallPane, { call, canUseCall, notify }) : null, /* @__PURE__ */ React.createElement("section", { className: "pane full" }, /* @__PURE__ */ React.createElement("h3", null, "AI Output"), /* @__PURE__ */ React.createElement("div", { className: "text-output" }, /* @__PURE__ */ React.createElement("label", null, "Summary"), /* @__PURE__ */ React.createElement("textarea", { readOnly: true, value: ((_d = selected.ai) == null ? void 0 : _d.summary) || "No AI summary generated yet." })), /* @__PURE__ */ React.createElement("div", { className: "text-output" }, /* @__PURE__ */ React.createElement("label", null, "Suggestions"), /* @__PURE__ */ React.createElement("textarea", { readOnly: true, value: ((_e = selected.ai) == null ? void 0 : _e.suggestions) || "No AI suggestions generated yet." }))))), isLoggedIn && !isAdmin && page === "prescriptions" && /* @__PURE__ */ React.createElement("article", { className: "card" }, /* @__PURE__ */ React.createElement("div", { className: "list-head" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("h2", null, "Prescriptions"), /* @__PURE__ */ React.createElement("p", null, "Issued or received prescriptions.")), /* @__PURE__ */ React.createElement("button", { className: "btn tiny", onClick: () => refreshPrescriptions().catch((e) => notify(e.message, true)) }, "Refresh")), /* @__PURE__ */ React.createElement("div", { className: "list" }, prescriptions.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "item" }, /* @__PURE__ */ React.createElement("div", { className: "meta" }, "No prescriptions yet.")) : prescriptions.map((p) => /* @__PURE__ */ React.createElement("div", { className: "item", key: p._id }, /* @__PURE__ */ React.createElement("div", { className: "title" }, "Consultation: ", String(p.consultationId)), /* @__PURE__ */ React.createElement("div", { className: "meta" }, "Created: ", new Date(p.createdAt).toLocaleString()), /* @__PURE__ */ React.createElement("pre", null, p.text))))))), toast.show && /* @__PURE__ */ React.createElement("aside", { className: `toast ${toast.bad ? "bad" : "good"}` }, toast.message), modal.show && /* @__PURE__ */ React.createElement("div", { className: "modal-backdrop", onClick: (e) => e.target.className === "modal-backdrop" && setModal((m) => ({ ...m, show: false })) }, /* @__PURE__ */ React.createElement("div", { className: "modal-card" }, /* @__PURE__ */ React.createElement("h3", null, modal.title), /* @__PURE__ */ React.createElement("p", null, modal.message), /* @__PURE__ */ React.createElement("button", { className: "btn primary", onClick: () => setModal((m) => ({ ...m, show: false })) }, "OK"))));
  }
  function DoctorFeeRow({ doctor, onSave }) {
    const [fee, setFee] = useState2(doctor.consultationFee || 499);
    return /* @__PURE__ */ React.createElement("div", { className: "item" }, /* @__PURE__ */ React.createElement("div", { className: "title" }, doctor.name, " (", doctor.approved ? "Approved" : "Pending", ")"), /* @__PURE__ */ React.createElement("div", { className: "meta" }, doctor.email, " \u2022 ", doctor.specialization || "N/A"), /* @__PURE__ */ React.createElement("div", { className: "row" }, /* @__PURE__ */ React.createElement("input", { type: "number", min: "1", value: fee, onChange: (e) => setFee(e.target.value) }), /* @__PURE__ */ React.createElement("button", { className: "btn tiny", onClick: () => onSave(doctor._id, fee) }, "Set Fee")));
  }
  ReactDOM.createRoot(document.getElementById("root")).render(/* @__PURE__ */ React.createElement(App, null));
})();
