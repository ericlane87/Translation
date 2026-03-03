import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection,
  addDoc,
  doc,
  deleteDoc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db } from "./firebase-client.js";

const runtimeConfig = window.VOICEBRIDGE_CONFIG || {};
const apiBaseUrl = normalizeApiBaseUrl(String(runtimeConfig.API_BASE_URL || ""));

const els = {
  userEmail: byId("userEmail"),
  myIdLabel: byId("myIdLabel"),
  setupPanel: byId("setupPanel"),
  setupCallIdInput: byId("setupCallIdInput"),
  setupProfileBtn: byId("setupProfileBtn"),
  setupStatus: byId("setupStatus"),
  incomingModal: byId("incomingModal"),
  incomingCallerLabel: byId("incomingCallerLabel"),
  outgoingModal: byId("outgoingModal"),
  outgoingTargetLabel: byId("outgoingTargetLabel"),
  cancelOutgoingBtn: byId("cancelOutgoingBtn"),
  callModal: byId("callModal"),
  logoutBtn: byId("logoutBtn"),
  dialIdInput: byId("dialIdInput"),
  callBtn: byId("callBtn"),
  devPreviewBtn: byId("devPreviewBtn"),
  answerBtn: byId("answerBtn"),
  rejectBtn: byId("rejectBtn"),
  endCallBtn: byId("endCallBtn"),
  incomingStatus: byId("incomingStatus"),
  callStatus: byId("callStatus"),
  roomStatus: byId("roomStatus"),
  roomParticipants: byId("roomParticipants"),
  callLogList: byId("callLogList"),
  localVideo: byId("localVideo"),
  remoteVideo: byId("remoteVideo"),
  remoteAvatar: byId("remoteAvatar"),
  toggleMuteBtn: byId("toggleMuteBtn"),
  toggleCameraBtn: byId("toggleCameraBtn"),
  translationFeed: byId("translationFeed"),
  createRoomBtn: byId("createRoomBtn"),
  copyRoomLinkBtn: byId("copyRoomLinkBtn"),
  roomLinkInput: byId("roomLinkInput"),
  joinRoomInput: byId("joinRoomInput"),
  joinRoomBtn: byId("joinRoomBtn"),
  leaveRoomBtn: byId("leaveRoomBtn"),
  remoteAudioBucket: byId("remoteAudioBucket"),
};

const state = {
  user: null,
  profile: null,
  currentCallId: null,
  incomingCall: null,
  localStream: null,
  remoteStream: null,
  pc: null,
  dataChannel: null,
  micMuted: false,
  cameraOff: false,
  logsCaller: [],
  logsReceiver: [],
  unsubIncoming: null,
  unsubCall: null,
  unsubCandidatesA: null,
  unsubCandidatesB: null,
  unsubLogsA: null,
  unsubLogsB: null,
  activeIncomingAlertId: null,
  ringtoneCtx: null,
  ringtoneTimer: null,
  incomingNotification: null,
  notifiedIncomingId: null,
  ringbackTimer: null,
  remotePeerId: "",
  autoTranslateOn: false,
  mediaRecorder: null,
  transcribeBusy: false,
  lastTranscript: "",
  devCallPreview: false,
  ringingTimeoutTimer: null,
  currentRoomId: null,
  roomRole: null,
  roomPeers: new Map(),
  roomParticipants: new Map(),
  unsubRoomParticipants: null,
  unsubRoomSignals: null,
  participantDocRef: null,
  mediaReady: false,
  vadContext: null,
  vadSource: null,
  vadAnalyser: null,
  vadTimer: null,
  vadSampleBuffer: null,
  lastSpeechAt: 0,
  turnIceServers: null,
  turnExpiresAtMs: 0,
  turnFetchPromise: null,
};

const defaultIceServers = [{ urls: ["stun:stun.l.google.com:19302"] }];

els.logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "auth.html";
});
els.callBtn.addEventListener("click", startCall);
els.devPreviewBtn.addEventListener("click", toggleDevCallPreview);
els.answerBtn.addEventListener("click", answerIncomingCall);
els.rejectBtn.addEventListener("click", rejectIncomingCall);
els.endCallBtn.addEventListener("click", endCall);
els.toggleMuteBtn.addEventListener("click", toggleMute);
els.toggleCameraBtn.addEventListener("click", toggleCamera);
els.setupProfileBtn.addEventListener("click", setupMissingProfileFromForm);
els.cancelOutgoingBtn.addEventListener("click", cancelOutgoingCall);
els.createRoomBtn?.addEventListener("click", createRoom);
els.copyRoomLinkBtn?.addEventListener("click", copyRoomLink);
els.joinRoomBtn?.addEventListener("click", joinRoomFromInput);
els.leaveRoomBtn?.addEventListener("click", leaveCurrentRoom);
els.remoteVideo.addEventListener("loadeddata", updateRemoteAvatarVisibility);
els.remoteVideo.addEventListener("playing", updateRemoteAvatarVisibility);
els.remoteVideo.addEventListener("pause", updateRemoteAvatarVisibility);
els.remoteVideo.muted = true;
els.remoteVideo.volume = 0;
resetAllModals();

onAuthStateChanged(auth, async (user) => {
  await cleanupAuthScoped();
  resetAllModals();

  if (!user) {
    window.location.href = "auth.html";
    return;
  }

  state.user = user;
  els.userEmail.textContent = user.email || "";
  updateDevPreviewButton();

  const profileSnap = await getDoc(doc(db, "users", user.uid));
  if (!profileSnap.exists()) {
    els.setupPanel.style.display = "grid";
    els.myIdLabel.textContent = "ID: -";
    setStatus(els.callStatus, "Finish profile setup to enable calling.");
    return;
  } else {
    state.profile = profileSnap.data();
    els.setupPanel.style.display = "none";
  }
  els.myIdLabel.textContent = `ID: ${state.profile.callId}`;

  ensureTurnIceServers().catch(() => {
    setStatus(els.callStatus, "TURN unavailable, using fallback connectivity.");
  });
  ensureNotificationPermission();
  watchIncomingCalls();
  watchCallLogs();
  maybeJoinRoomFromUrl();
});

async function setupMissingProfileFromForm() {
  if (!state.user) return;
  const email = state.user.email || "";
  const callId = normalizeCallId(els.setupCallIdInput.value || "");
  if (!callId) {
    setStatus(els.setupStatus, "Invalid call ID. Use 3-24 chars: a-z, 0-9, _, -");
    return false;
  }

  const userRef = doc(db, "users", state.user.uid);
  const callIdRef = doc(db, "callIds", callId);
  setStatus(els.setupStatus, "Saving...");

  try {
    await runTransaction(db, async (txn) => {
      const existingId = await txn.get(callIdRef);
      if (existingId.exists()) {
        throw new Error("That call ID is already taken.");
      }
      txn.set(callIdRef, { uid: state.user.uid, createdAt: serverTimestamp() });
      txn.set(userRef, {
        email,
        callId,
        language: "en",
        translateIncomingTo: "en",
        createdAt: serverTimestamp(),
      });
    });
    const newSnap = await getDoc(userRef);
    state.profile = newSnap.data();
    els.myIdLabel.textContent = `ID: ${callId}`;
    els.setupPanel.style.display = "none";
    setStatus(els.callStatus, "Profile ready. You can call now.");
    return;
  } catch (err) {
    // Fallback write path.
    try {
      const idSnap = await getDoc(callIdRef);
      if (idSnap.exists()) {
        setStatus(els.setupStatus, "Call ID already taken. Try another.");
        return;
      }
      await setDoc(callIdRef, { uid: state.user.uid, createdAt: serverTimestamp() });
      await setDoc(userRef, {
        email,
        callId,
        language: "en",
        translateIncomingTo: "en",
        createdAt: serverTimestamp(),
      });
      const newSnap = await getDoc(userRef);
      state.profile = newSnap.data();
      els.myIdLabel.textContent = `ID: ${callId}`;
      els.setupPanel.style.display = "none";
      setStatus(els.callStatus, "Profile ready. You can call now.");
      return;
    } catch (err2) {
      setStatus(els.setupStatus, `Profile setup failed: ${err2.message}`);
      return;
    }
  }
}

function watchIncomingCalls() {
  const q = query(collection(db, "calls"), where("receiverUid", "==", state.user.uid));

  state.unsubIncoming = onSnapshot(q, (snap) => {
    if (state.currentRoomId) {
      state.incomingCall = null;
      setStatus(els.incomingStatus, "In room mode");
      hideIncomingModal();
      stopRingtone();
      closeIncomingNotification();
      return;
    }

    const previousIncomingId = state.activeIncomingAlertId;
    const ringing = snap.docs.find((d) => d.data().status === "ringing");
    state.incomingCall = ringing ? { id: ringing.id, ...ringing.data() } : null;
    setStatus(
      els.incomingStatus,
      state.incomingCall ? `Incoming from ${state.incomingCall.callerId}` : "No incoming calls"
    );

    if (state.incomingCall) {
      state.activeIncomingAlertId = state.incomingCall.id;
      els.incomingCallerLabel.textContent = state.incomingCall.callerId || "Unknown caller";
      showIncomingModal();
      if (previousIncomingId !== state.incomingCall.id) {
        startRingtone();
        notifyIncomingCall(state.incomingCall.callerId || "Unknown caller", state.incomingCall.id);
      }
    } else {
      state.activeIncomingAlertId = null;
      hideIncomingModal();
      stopRingtone();
      closeIncomingNotification();
    }
  });
}

function watchCallLogs() {
  const qCaller = query(collection(db, "calls"), where("callerUid", "==", state.user.uid));
  const qReceiver = query(collection(db, "calls"), where("receiverUid", "==", state.user.uid));

  state.unsubLogsA = onSnapshot(qCaller, (snap) => {
    state.logsCaller = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderCallLogs();
  });

  state.unsubLogsB = onSnapshot(qReceiver, (snap) => {
    state.logsReceiver = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderCallLogs();
  });
}

function renderCallLogs() {
  const all = new Map();

  [...state.logsCaller, ...state.logsReceiver].forEach((item) => {
    all.set(item.id, item);
  });

  const rows = [...all.values()]
    .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
    .slice(0, 50);

  els.callLogList.innerHTML = "";

  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No calls yet";
    els.callLogList.appendChild(empty);
    return;
  }

  rows.forEach((call) => {
    const outgoing = call.callerUid === state.user.uid;
    const counterpartId = outgoing ? call.receiverId : call.callerId;
    const badge = getHistoryBadge(call, outgoing);
    const whenText = formatCallDateTime(call.createdAt);

    const btn = document.createElement("button");
    btn.className = "log-item";
    btn.innerHTML = `
      <span>${outgoing ? "Outgoing" : "Incoming"} • ${counterpartId}</span>
      <span class="log-meta">
        <span class="badge ${badge.className}">${badge.label}</span>
        <span>${whenText}</span>
      </span>
    `;
    btn.addEventListener("click", () => {
      els.dialIdInput.value = counterpartId;
      startCall();
    });
    els.callLogList.appendChild(btn);
  });
}

async function startCall() {
  if (state.currentRoomId) {
    setStatus(els.callStatus, "You are in a room. Leave room mode to place a direct call.");
    return;
  }

  if (!state.profile?.callId) {
    setStatus(els.callStatus, "Your profile has no call ID");
    return;
  }

  const targetId = normalizeCallId(els.dialIdInput.value);
  if (!targetId) {
    setStatus(els.callStatus, "Enter a valid recipient ID");
    return;
  }

  try {
    const targetSnap = await getDoc(doc(db, "callIds", targetId));
    if (!targetSnap.exists()) {
      setStatus(els.callStatus, "Recipient ID not found");
      return;
    }

    const receiverUid = targetSnap.data().uid;
    if (receiverUid === state.user.uid) {
      setStatus(els.callStatus, "Cannot call yourself");
      return;
    }

    await setupPeer(true);
    state.remotePeerId = targetId;
    setRemoteAvatarLabel(targetId);
    showOutgoingModal(targetId);
    startRingback();

    const callRef = await addDoc(collection(db, "calls"), {
      callerUid: state.user.uid,
      callerId: state.profile.callId,
      receiverUid,
      receiverId: targetId,
      status: "ringing",
      createdAt: serverTimestamp(),
    });

    state.currentCallId = callRef.id;
    startRingingTimeout(callRef.id, targetId);

    const offerCandidatesRef = collection(db, "calls", callRef.id, "offerCandidates");
    const answerCandidatesRef = collection(db, "calls", callRef.id, "answerCandidates");

    state.pc.onicecandidate = async (event) => {
      if (event.candidate) {
        await addDoc(offerCandidatesRef, event.candidate.toJSON());
      }
    };

    const offer = await state.pc.createOffer();
    await state.pc.setLocalDescription(offer);

    await updateDoc(callRef, {
      offer: { type: offer.type, sdp: offer.sdp },
      status: "ringing",
    });

    state.unsubCall = onSnapshot(callRef, async (snap) => {
      const data = snap.data();
      if (!data || !state.pc) return;

      if (data.status === "ringing") {
        setStatus(els.callStatus, `Ringing ${targetId}...`);
      }

      if (data.answer && !state.pc.currentRemoteDescription) {
        await state.pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        setStatus(els.callStatus, "Connected");
        clearRingingTimeout();
        stopRingback();
        hideOutgoingModal();
        showCallModal();
      }

      if (data.status === "ended" || data.status === "rejected") {
        setStatus(els.callStatus, `Call ${data.status}`);
        clearRingingTimeout();
        stopRingback();
        hideOutgoingModal();
        await teardownCall();
      }
    });

    state.unsubCandidatesA = onSnapshot(answerCandidatesRef, (snap) => {
      snap.docChanges().forEach(async (change) => {
        if (change.type !== "added" || !state.pc) return;
        try {
          await state.pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
        } catch {
          // ignore transient ICE failures
        }
      });
    });

    setStatus(els.callStatus, `Ringing ${targetId}...`);
  } catch (err) {
    setStatus(els.callStatus, `Call failed: ${err.message}`);
    await teardownCall();
  }
}

async function answerIncomingCall() {
  if (!state.incomingCall) {
    setStatus(els.callStatus, "No incoming call");
    return;
  }

  const callRef = doc(db, "calls", state.incomingCall.id);

  try {
    stopRingtone();
    closeIncomingNotification();
    await setupPeer(false);
    state.remotePeerId = state.incomingCall.callerId || "Remote";
    setRemoteAvatarLabel(state.remotePeerId);

    const offerCandidatesRef = collection(db, "calls", state.incomingCall.id, "offerCandidates");
    const answerCandidatesRef = collection(db, "calls", state.incomingCall.id, "answerCandidates");

    state.pc.onicecandidate = async (event) => {
      if (event.candidate) {
        await addDoc(answerCandidatesRef, event.candidate.toJSON());
      }
    };

    const current = await getDoc(callRef);
    const data = current.data();

    await state.pc.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await state.pc.createAnswer();
    await state.pc.setLocalDescription(answer);

    await updateDoc(callRef, {
      answer: { type: answer.type, sdp: answer.sdp },
      status: "active",
      answeredAt: serverTimestamp(),
    });

    state.currentCallId = state.incomingCall.id;

    state.unsubCandidatesB = onSnapshot(offerCandidatesRef, (snap) => {
      snap.docChanges().forEach(async (change) => {
        if (change.type !== "added" || !state.pc) return;
        try {
          await state.pc.addIceCandidate(new RTCIceCandidate(change.doc.data()));
        } catch {
          // ignore transient ICE failures
        }
      });
    });

    state.unsubCall = onSnapshot(callRef, async (snap) => {
      const d = snap.data();
      if (!d) return;
      if (d.status === "ended" || d.status === "rejected") {
        setStatus(els.callStatus, `Call ${d.status}`);
        await teardownCall();
      }
    });

    setStatus(els.callStatus, "Connected");
    hideIncomingModal();
    hideOutgoingModal();
    showCallModal();
  } catch (err) {
    setStatus(els.callStatus, `Answer failed: ${err.message}`);
    await teardownCall();
  }
}

async function rejectIncomingCall() {
  if (!state.incomingCall) {
    setStatus(els.callStatus, "No incoming call");
    return;
  }

  await updateDoc(doc(db, "calls", state.incomingCall.id), {
    status: "rejected",
    rejectedAt: serverTimestamp(),
  });

  setStatus(els.callStatus, "Rejected");
  hideIncomingModal();
  stopRingtone();
  closeIncomingNotification();
}

async function cancelOutgoingCall() {
  if (!state.currentCallId) {
    hideOutgoingModal();
    stopRingback();
    return;
  }

  try {
    await updateDoc(doc(db, "calls", state.currentCallId), {
      status: "ended",
      endedAt: serverTimestamp(),
      endedReason: "caller_canceled",
    });
  } catch {
    // Ignore cancellation update failures.
  }

  stopRingback();
  hideOutgoingModal();
  await teardownCall();
  setStatus(els.callStatus, "Call canceled");
}

async function endCall() {
  if (state.devCallPreview) {
    state.devCallPreview = false;
    hideCallModal();
    setStatus(els.callStatus, "Dev preview closed");
    updateDevPreviewButton();
    return;
  }

  if (!state.currentCallId) {
    if (state.currentRoomId) {
      await leaveCurrentRoom();
      setStatus(els.callStatus, "Left room");
      return;
    }
    setStatus(els.callStatus, "No active call");
    return;
  }

  await updateDoc(doc(db, "calls", state.currentCallId), {
    status: "ended",
    endedAt: serverTimestamp(),
    endedReason: "manual_end",
  });

  await teardownCall();
  setStatus(els.callStatus, "Ended");
}

async function setupPeer(isCaller) {
  await teardownCall();
  await ensureTurnIceServers();

  state.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
  state.remoteStream = new MediaStream();

  els.localVideo.srcObject = state.localStream;
  els.remoteVideo.srcObject = state.remoteStream;

  state.pc = new RTCPeerConnection({
    iceServers: state.turnIceServers || defaultIceServers,
  });
  state.localStream.getTracks().forEach((track) => state.pc.addTrack(track, state.localStream));

  state.pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => state.remoteStream.addTrack(track));
    if (event.track.kind === "video") {
      event.track.onmute = updateRemoteAvatarVisibility;
      event.track.onunmute = updateRemoteAvatarVisibility;
      event.track.onended = updateRemoteAvatarVisibility;
    }
    updateRemoteAvatarVisibility();
  };

  if (isCaller) {
    state.dataChannel = state.pc.createDataChannel("translation");
    setupDataChannel(state.dataChannel);
  } else {
    state.pc.ondatachannel = (event) => {
      state.dataChannel = event.channel;
      setupDataChannel(state.dataChannel);
    };
  }
}

function setupDataChannel(channel) {
  channel.onopen = () => {
    setStatus(els.callStatus, "Connected • Voice translation active");
  };
  channel.onmessage = async (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.type !== "translation" || !payload.original) return;

      const sender = payload.sender || "Remote";
      const from = payload.from === "es" ? "es" : "en";
      const incomingTarget = resolveIncomingTargetLanguage(from);
      const translated = await translateText(payload.original, from, incomingTarget);

      appendFeed(sender, `${payload.original} -> ${translated}`);
      speak(translated, incomingTarget);
    } catch {
      // ignore bad payload
    }
  };
}

function getOpenDataChannels() {
  const channels = [];

  if (state.dataChannel && state.dataChannel.readyState === "open") {
    channels.push(state.dataChannel);
  }

  state.roomPeers.forEach((peer) => {
    if (peer.channel && peer.channel.readyState === "open") {
      channels.push(peer.channel);
    }
  });

  return channels;
}

async function ensureLocalMedia() {
  if (state.localStream && state.localStream.getTracks().length) {
    return;
  }
  state.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
  els.localVideo.srcObject = state.localStream;
}

async function createRoom() {
  if (!state.user || !state.profile?.callId) {
    setStatus(els.roomStatus, "Complete profile setup first.");
    return;
  }

  const roomId = generateRoomId();
  await joinRoomById(roomId, true);
}

async function copyRoomLink() {
  const roomLink = els.roomLinkInput.value || "";
  if (!roomLink) {
    setStatus(els.roomStatus, "No active room link to copy.");
    return;
  }
  try {
    await navigator.clipboard.writeText(roomLink);
    setStatus(els.roomStatus, "Room link copied.");
  } catch {
    setStatus(els.roomStatus, "Clipboard blocked. Copy the link manually.");
  }
}

async function joinRoomFromInput() {
  const raw = (els.joinRoomInput.value || "").trim();
  const roomId = parseRoomId(raw);
  if (!roomId) {
    setStatus(els.roomStatus, "Enter a valid room link or room ID.");
    return;
  }
  await joinRoomById(roomId, false);
}

function maybeJoinRoomFromUrl() {
  const roomId = parseRoomId(window.location.href);
  if (!roomId) return;
  joinRoomById(roomId, false).catch((err) => {
    setStatus(els.roomStatus, `Join failed: ${err.message}`);
  });
}

async function joinRoomById(roomId, isCreator) {
  if (!state.user || !state.profile?.callId) {
    setStatus(els.roomStatus, "Complete profile setup first.");
    return;
  }
  if (state.currentRoomId === roomId) {
    setStatus(els.roomStatus, `Already in room ${roomId}.`);
    return;
  }

  await teardownCall();
  await ensureLocalMedia();

  const roomRef = doc(db, "rooms", roomId);
  if (isCreator) {
    await setDoc(roomRef, {
      createdByUid: state.user.uid,
      createdById: state.profile.callId,
      status: "active",
      createdAt: serverTimestamp(),
    });
  } else {
    const roomSnap = await getDoc(roomRef);
    if (!roomSnap.exists()) {
      throw new Error("Room not found");
    }
  }

  state.currentRoomId = roomId;
  state.roomRole = isCreator ? "host" : "guest";
  state.participantDocRef = doc(db, "rooms", roomId, "participants", state.user.uid);

  await setDoc(state.participantDocRef, {
    uid: state.user.uid,
    callId: state.profile.callId,
    joinedAt: serverTimestamp(),
  });

  state.roomPeers = new Map();
  state.roomParticipants = new Map();
  attachRoomWatchers(roomId);
  updateRoomLink(roomId);
  setStatus(els.callStatus, "Room open. Waiting for participants...");
  setStatus(els.roomStatus, `Joined room ${roomId}`);
  showCallModal();
}

async function leaveCurrentRoom() {
  if (!state.currentRoomId) {
    setStatus(els.roomStatus, "Not in a room.");
    return;
  }
  await teardownCall();
  clearRoomFromUrl();
}

function attachRoomWatchers(roomId) {
  const participantsRef = collection(db, "rooms", roomId, "participants");
  const signalsRef = query(
    collection(db, "rooms", roomId, "signals"),
    where("toUid", "==", state.user.uid)
  );

  state.unsubRoomParticipants = onSnapshot(participantsRef, (snap) => {
    const nextParticipants = new Map();

    snap.docs.forEach((d) => {
      const item = d.data();
      nextParticipants.set(d.id, item);
    });

    state.roomParticipants = nextParticipants;
    updateRoomParticipantsUi();
    syncRoomPeers();
  });

  state.unsubRoomSignals = onSnapshot(signalsRef, (snap) => {
    snap.docChanges().forEach(async (change) => {
      if (change.type !== "added") return;
      const data = change.doc.data();
      try {
        await handleRoomSignal(data);
      } catch {
        // Ignore malformed signal messages.
      } finally {
        deleteDoc(change.doc.ref).catch(() => {});
      }
    });
  });
}

function syncRoomPeers() {
  if (!state.currentRoomId || !state.localStream) return;
  const remoteUids = [...state.roomParticipants.keys()].filter((uid) => uid !== state.user.uid);

  remoteUids.forEach((remoteUid) => {
    if (state.roomPeers.has(remoteUid)) return;
    const isOfferer = state.user.uid.localeCompare(remoteUid) < 0;
    createRoomPeer(remoteUid, isOfferer);
  });

  state.roomPeers.forEach((_, remoteUid) => {
    if (remoteUids.includes(remoteUid)) return;
    removeRoomPeer(remoteUid);
  });
}

async function createRoomPeer(remoteUid, isOfferer) {
  await ensureTurnIceServers();
  const pc = new RTCPeerConnection({
    iceServers: state.turnIceServers || defaultIceServers,
  });
  const remoteStream = new MediaStream();
  const remoteAudioEl = document.createElement("audio");
  remoteAudioEl.autoplay = true;
  remoteAudioEl.playsInline = true;
  remoteAudioEl.srcObject = remoteStream;
  els.remoteAudioBucket?.appendChild(remoteAudioEl);

  const peer = {
    uid: remoteUid,
    pc,
    channel: null,
    remoteStream,
    audioEl: remoteAudioEl,
  };
  state.roomPeers.set(remoteUid, peer);

  state.localStream.getTracks().forEach((track) => pc.addTrack(track, state.localStream));

  pc.onicecandidate = (event) => {
    if (!event.candidate || !state.currentRoomId) return;
    sendRoomSignal(remoteUid, {
      type: "candidate",
      candidate: event.candidate.toJSON(),
    });
  };

  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      peer.remoteStream.addTrack(track);
      if (track.kind === "video" && !els.remoteVideo.srcObject) {
        els.remoteVideo.srcObject = peer.remoteStream;
        setRemoteAvatarLabel(state.roomParticipants.get(remoteUid)?.callId || remoteUid);
      }
    });
    updateRemoteAvatarVisibility();
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed" || pc.connectionState === "closed") {
      removeRoomPeer(remoteUid);
    }
  };

  if (isOfferer) {
    peer.channel = pc.createDataChannel("translation");
    setupDataChannel(peer.channel);
  } else {
    pc.ondatachannel = (event) => {
      peer.channel = event.channel;
      setupDataChannel(peer.channel);
    };
  }

  if (isOfferer) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await sendRoomSignal(remoteUid, {
      type: "offer",
      sdp: { type: offer.type, sdp: offer.sdp },
    });
  }
}

async function handleRoomSignal(signal) {
  const fromUid = signal?.fromUid;
  if (!fromUid || fromUid === state.user?.uid) return;
  if (!state.roomParticipants.has(fromUid)) return;

  let peer = state.roomPeers.get(fromUid);
  if (!peer) {
    const shouldOffer = state.user.uid.localeCompare(fromUid) < 0;
    await createRoomPeer(fromUid, shouldOffer);
    peer = state.roomPeers.get(fromUid);
  }
  if (!peer) return;

  if (signal.type === "offer") {
    await peer.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
    const answer = await peer.pc.createAnswer();
    await peer.pc.setLocalDescription(answer);
    await sendRoomSignal(fromUid, {
      type: "answer",
      sdp: { type: answer.type, sdp: answer.sdp },
    });
    return;
  }

  if (signal.type === "answer") {
    if (!peer.pc.currentRemoteDescription) {
      await peer.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
    }
    return;
  }

  if (signal.type === "candidate" && signal.candidate) {
    try {
      await peer.pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
    } catch {
      // Ignore ICE races.
    }
  }
}

async function sendRoomSignal(toUid, payload) {
  if (!state.currentRoomId) return;
  await addDoc(collection(db, "rooms", state.currentRoomId, "signals"), {
    fromUid: state.user.uid,
    toUid,
    ...payload,
    createdAt: serverTimestamp(),
  });
}

function removeRoomPeer(remoteUid) {
  const peer = state.roomPeers.get(remoteUid);
  if (!peer) return;
  try {
    peer.pc.close();
  } catch {
    // Ignore close failures.
  }
  if (peer.audioEl) {
    peer.audioEl.srcObject = null;
    peer.audioEl.remove();
  }
  state.roomPeers.delete(remoteUid);

  if (els.remoteVideo.srcObject === peer.remoteStream) {
    const fallback = [...state.roomPeers.values()][0];
    if (fallback) {
      els.remoteVideo.srcObject = fallback.remoteStream;
      setRemoteAvatarLabel(state.roomParticipants.get(fallback.uid)?.callId || fallback.uid);
    } else {
      els.remoteVideo.srcObject = null;
      setRemoteAvatarLabel("Remote");
    }
  }
  updateRemoteAvatarVisibility();
}

function updateRoomParticipantsUi() {
  if (!state.currentRoomId) {
    setStatus(els.roomParticipants, "Participants: -");
    return;
  }

  const labels = [...state.roomParticipants.values()].map((item) => item.callId || item.uid);
  const participantsText = labels.length ? labels.join(", ") : "(only you)";
  setStatus(els.roomParticipants, `Participants: ${participantsText}`);
}

function updateRoomLink(roomId) {
  const roomUrl = new URL(window.location.href);
  roomUrl.searchParams.set("room", roomId);
  roomUrl.hash = "";
  els.roomLinkInput.value = roomUrl.toString();
  window.history.replaceState({}, "", `${window.location.pathname}?room=${encodeURIComponent(roomId)}`);
}

function clearRoomFromUrl() {
  window.history.replaceState({}, "", window.location.pathname);
}

function parseRoomId(input) {
  const raw = (input || "").trim();
  if (!raw) return "";

  try {
    const url = new URL(raw);
    const param = normalizeCallId(url.searchParams.get("room") || "");
    if (param) return param;
  } catch {
    // Non-URL input.
  }

  if (raw.includes("room=")) {
    const q = raw.split("room=")[1] || "";
    const id = normalizeCallId(q.split("&")[0]);
    if (id) return id;
  }

  return normalizeCallId(raw);
}

function generateRoomId() {
  return `room-${Math.random().toString(36).slice(2, 10)}`;
}

function toggleMute() {
  if (!state.localStream) return;
  state.micMuted = !state.micMuted;
  state.localStream.getAudioTracks().forEach((track) => {
    track.enabled = !state.micMuted;
  });
  els.toggleMuteBtn.textContent = state.micMuted ? "Unmute" : "Mute";
}

function toggleCamera() {
  if (!state.localStream) return;
  state.cameraOff = !state.cameraOff;
  state.localStream.getVideoTracks().forEach((track) => {
    track.enabled = !state.cameraOff;
  });
  els.toggleCameraBtn.textContent = state.cameraOff ? "Camera On" : "Camera Off";
}

async function teardownCall() {
  if (state.participantDocRef) {
    try {
      await deleteDoc(state.participantDocRef);
    } catch {
      // Ignore participant cleanup failures.
    }
  }

  if (state.unsubRoomParticipants) state.unsubRoomParticipants();
  if (state.unsubRoomSignals) state.unsubRoomSignals();
  state.unsubRoomParticipants = null;
  state.unsubRoomSignals = null;
  state.participantDocRef = null;

  state.roomPeers.forEach((peer) => {
    try {
      if (peer.audioEl) {
        peer.audioEl.srcObject = null;
        peer.audioEl.remove();
      }
      peer.pc?.close();
    } catch {
      // Ignore room peer teardown failures.
    }
  });
  state.roomPeers.clear();
  state.roomParticipants.clear();
  state.currentRoomId = null;
  state.roomRole = null;

  if (state.localStream) {
    state.localStream.getTracks().forEach((t) => t.stop());
  }

  if (state.remoteStream) {
    state.remoteStream.getTracks().forEach((t) => t.stop());
  }

  if (state.pc) {
    state.pc.close();
  }

  if (state.unsubCall) state.unsubCall();
  if (state.unsubCandidatesA) state.unsubCandidatesA();
  if (state.unsubCandidatesB) state.unsubCandidatesB();

  state.localStream = null;
  state.remoteStream = null;
  state.pc = null;
  state.dataChannel = null;
  state.currentCallId = null;
  state.remotePeerId = "";
  clearRingingTimeout();
  state.unsubCall = null;
  state.unsubCandidatesA = null;
  state.unsubCandidatesB = null;
  state.mediaReady = false;

  els.localVideo.srcObject = null;
  els.remoteVideo.srcObject = null;
  if (els.remoteAudioBucket) {
    els.remoteAudioBucket.innerHTML = "";
  }
  clearRoomFromUrl();
  setStatus(els.roomStatus, "Not in a room");
  setStatus(els.roomParticipants, "Participants: -");
  els.roomLinkInput.value = "";
  stopAutoTranslate();
  stopRingback();
  hideOutgoingModal();
  setRemoteAvatarLabel("Remote");
  updateRemoteAvatarVisibility();
  hideCallModal();
}

async function cleanupAuthScoped() {
  if (state.unsubIncoming) state.unsubIncoming();
  if (state.unsubLogsA) state.unsubLogsA();
  if (state.unsubLogsB) state.unsubLogsB();
  stopRingtone();
  stopRingback();
  hideOutgoingModal();
  closeIncomingNotification();
  clearRingingTimeout();
  state.unsubIncoming = null;
  state.unsubLogsA = null;
  state.unsubLogsB = null;
  state.turnIceServers = null;
  state.turnExpiresAtMs = 0;
  state.turnFetchPromise = null;
  await teardownCall();
}

function setStatus(el, text) {
  el.textContent = text;
}

function showCallModal() {
  setModalVisible(els.callModal, true);
  updateRemoteAvatarVisibility();
  if (!state.devCallPreview) {
    startAutoTranslate();
  }
}

function hideCallModal() {
  setModalVisible(els.callModal, false);
  if (!state.devCallPreview) {
    stopAutoTranslate();
  }
}

function showOutgoingModal(targetId) {
  els.outgoingTargetLabel.textContent = targetId || "Unknown";
  setModalVisible(els.outgoingModal, true);
}

function hideOutgoingModal() {
  setModalVisible(els.outgoingModal, false);
}

function getHistoryBadge(call, outgoing) {
  if (call.status === "rejected") {
    return { label: "Declined", className: "badge-declined" };
  }

  if (!outgoing && call.status === "ended" && !call.answeredAt) {
    return { label: "Missed", className: "badge-missed" };
  }

  if (call.status === "ringing") {
    return { label: "Ringing", className: "badge-ringing" };
  }

  if (call.status === "active" || call.answeredAt) {
    return { label: "Connected", className: "badge-connected" };
  }

  return { label: "Ended", className: "badge-ended" };
}

function ensureNotificationPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "default") return;
  Notification.requestPermission().catch(() => {
    // Ignore permission prompt failures.
  });
}

function notifyIncomingCall(callerId, callId) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (state.notifiedIncomingId === callId) return;

  closeIncomingNotification();
  state.incomingNotification = new Notification("Incoming VoiceBridge call", {
    body: `${callerId} is calling you`,
    tag: `incoming-${callId}`,
  });
  state.notifiedIncomingId = callId;
  state.incomingNotification.onclick = () => {
    window.focus();
  };
}

function closeIncomingNotification() {
  if (state.incomingNotification) {
    state.incomingNotification.close();
  }
  state.incomingNotification = null;
  state.notifiedIncomingId = null;
}

function startRingtone() {
  if (state.ringtoneTimer) return;
  try {
    state.ringtoneCtx = state.ringtoneCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (state.ringtoneCtx.state === "suspended") {
      state.ringtoneCtx.resume().catch(() => {});
    }

    const ringOnce = () => {
      if (!state.ringtoneCtx) return;
      const now = state.ringtoneCtx.currentTime;
      const osc = state.ringtoneCtx.createOscillator();
      const gain = state.ringtoneCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
      osc.connect(gain);
      gain.connect(state.ringtoneCtx.destination);
      osc.start(now);
      osc.stop(now + 0.26);
    };

    ringOnce();
    state.ringtoneTimer = window.setInterval(ringOnce, 1200);
  } catch {
    // If audio autoplay is blocked, UI popup still handles incoming call.
  }
}

function stopRingtone() {
  if (state.ringtoneTimer) {
    window.clearInterval(state.ringtoneTimer);
    state.ringtoneTimer = null;
  }
}

function appendFeed(sender, text) {
  if (!els.translationFeed) return;
  const p = document.createElement("p");
  p.textContent = `${sender}: ${text}`;
  els.translationFeed.prepend(p);
}

async function performTranslationFromText(spoken) {
  const channels = getOpenDataChannels();
  if (!channels.length) {
    setStatus(els.callStatus, "Translation channel not ready");
    return;
  }

  const from = state.profile?.language === "es" ? "es" : "en";
  const payload = {
    type: "translation",
    sender: state.profile?.callId || "You",
    from,
    original: spoken,
  };

  channels.forEach((channel) => {
    try {
      channel.send(JSON.stringify(payload));
    } catch {
      // Ignore channel send failures.
    }
  });
  appendFeed("You", `${spoken} -> (sent)`);
}

function startRingback() {
  if (state.ringbackTimer) return;
  try {
    state.ringtoneCtx = state.ringtoneCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (state.ringtoneCtx.state === "suspended") {
      state.ringtoneCtx.resume().catch(() => {});
    }

    const ring = () => {
      if (!state.ringtoneCtx) return;
      const now = state.ringtoneCtx.currentTime;
      const osc1 = state.ringtoneCtx.createOscillator();
      const osc2 = state.ringtoneCtx.createOscillator();
      const gain = state.ringtoneCtx.createGain();
      osc1.type = "sine";
      osc2.type = "sine";
      osc1.frequency.setValueAtTime(440, now);
      osc2.frequency.setValueAtTime(480, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.07, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(state.ringtoneCtx.destination);
      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.46);
      osc2.stop(now + 0.46);
    };

    ring();
    state.ringbackTimer = window.setInterval(ring, 1500);
  } catch {
    // Ignore autoplay restrictions.
  }
}

function stopRingback() {
  if (state.ringbackTimer) {
    window.clearInterval(state.ringbackTimer);
    state.ringbackTimer = null;
  }
}

function startSpeechGate() {
  stopSpeechGate();
  if (!state.localStream || !state.localStream.getAudioTracks().length) return;
  if (typeof AudioContext === "undefined" && typeof webkitAudioContext === "undefined") return;

  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const source = ctx.createMediaStreamSource(state.localStream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.86;
    source.connect(analyser);

    const samples = new Uint8Array(analyser.fftSize);
    state.vadContext = ctx;
    state.vadSource = source;
    state.vadAnalyser = analyser;
    state.vadSampleBuffer = samples;
    state.lastSpeechAt = Date.now();

    state.vadTimer = window.setInterval(() => {
      if (!state.autoTranslateOn || !state.vadAnalyser || !state.vadSampleBuffer) return;
      state.vadAnalyser.getByteTimeDomainData(state.vadSampleBuffer);

      let sumSquares = 0;
      for (let i = 0; i < state.vadSampleBuffer.length; i += 1) {
        const centered = (state.vadSampleBuffer[i] - 128) / 128;
        sumSquares += centered * centered;
      }

      const rms = Math.sqrt(sumSquares / state.vadSampleBuffer.length);
      if (rms > 0.02) {
        state.lastSpeechAt = Date.now();
      }
    }, 140);
  } catch {
    // If audio analysis fails, fallback to current behavior.
  }
}

function stopSpeechGate() {
  if (state.vadTimer) {
    window.clearInterval(state.vadTimer);
    state.vadTimer = null;
  }

  if (state.vadSource) {
    try {
      state.vadSource.disconnect();
    } catch {
      // Ignore disconnect errors.
    }
  }

  if (state.vadAnalyser) {
    try {
      state.vadAnalyser.disconnect();
    } catch {
      // Ignore disconnect errors.
    }
  }

  if (state.vadContext) {
    state.vadContext.close().catch(() => {});
  }

  state.vadContext = null;
  state.vadSource = null;
  state.vadAnalyser = null;
  state.vadSampleBuffer = null;
  state.lastSpeechAt = 0;
}

function shouldSendAudioChunkForTranscription() {
  if (!state.vadAnalyser) return true;
  const now = Date.now();
  return now - state.lastSpeechAt <= 900;
}

function startAutoTranslate() {
  if (state.autoTranslateOn) return;
  if (!state.localStream || !state.localStream.getAudioTracks().length) {
    setStatus(els.callStatus, "No microphone stream available for auto translation.");
    return;
  }
  if (typeof MediaRecorder === "undefined") {
    setStatus(els.callStatus, "Auto translation unavailable in this browser.");
    return;
  }
  const mimeType = pickRecorderMimeType();
  if (!mimeType) {
    setStatus(els.callStatus, "MediaRecorder format not supported in this browser.");
    return;
  }

  state.autoTranslateOn = true;
  setStatus(els.callStatus, "Connected • Auto translation on (server STT)");
  startSpeechGate();

  const recorder = new MediaRecorder(state.localStream, { mimeType });
  recorder.ondataavailable = async (event) => {
    if (!state.autoTranslateOn) return;
    if (!event.data || event.data.size < 1200) return;
    if (!shouldSendAudioChunkForTranscription()) return;
    if (state.transcribeBusy) return;

    state.transcribeBusy = true;
    try {
      const spoken = await transcribeAudioBlob(event.data);
      if (!spoken) return;
      if (spoken === state.lastTranscript) return;
      state.lastTranscript = spoken;
      await performTranslationFromText(spoken);
    } catch {
      // Ignore per-chunk failures.
    } finally {
      state.transcribeBusy = false;
    }
  };
  recorder.onerror = () => {
    setStatus(els.callStatus, "Auto translation recorder error. Try reconnecting call.");
  };

  state.mediaRecorder = recorder;
  try {
    recorder.start(2400);
  } catch {
    state.autoTranslateOn = false;
    state.mediaRecorder = null;
    setStatus(els.callStatus, "Auto translation failed to start.");
  }
}

function stopAutoTranslate() {
  state.autoTranslateOn = false;
  state.lastTranscript = "";
  state.transcribeBusy = false;
  stopSpeechGate();
  if (state.mediaRecorder) {
    try {
      if (state.mediaRecorder.state !== "inactive") {
        state.mediaRecorder.stop();
      }
    } catch {
      // Ignore stop errors.
    }
  }
  state.mediaRecorder = null;
}

function toggleDevCallPreview() {
  if (state.currentCallId) {
    setStatus(els.callStatus, "Already in a live call");
    return;
  }

  if (state.devCallPreview) {
    state.devCallPreview = false;
    hideCallModal();
    setStatus(els.callStatus, "Dev preview closed");
    updateDevPreviewButton();
    return;
  }

  state.devCallPreview = true;
  setRemoteAvatarLabel("Remote");
  updateRemoteAvatarVisibility();
  showCallModal();
  setStatus(els.callStatus, "Dev preview open");
  updateDevPreviewButton();
}

function updateDevPreviewButton() {
  if (!els.devPreviewBtn) return;
  els.devPreviewBtn.textContent = state.devCallPreview ? "Close In-Call (Dev)" : "Open In-Call (Dev)";
}

function resetAllModals() {
  hideIncomingModal();
  hideOutgoingModal();
  setModalVisible(els.callModal, false);
}

function showIncomingModal() {
  setModalVisible(els.incomingModal, true);
}

function hideIncomingModal() {
  setModalVisible(els.incomingModal, false);
}

function setModalVisible(el, visible) {
  if (!el) return;
  el.classList.toggle("hidden", !visible);
  el.style.display = visible ? "grid" : "none";
}

function startRingingTimeout(callId, targetId) {
  clearRingingTimeout();
  state.ringingTimeoutTimer = window.setTimeout(async () => {
    if (!state.currentCallId || state.currentCallId !== callId) return;
    try {
      await updateDoc(doc(db, "calls", callId), {
        status: "ended",
        endedAt: serverTimestamp(),
        endedReason: "no_answer_timeout",
      });
      setStatus(els.callStatus, `No answer from ${targetId}. Call ended.`);
    } catch {
      // Ignore timeout update errors.
    }
  }, 10000);
}

function clearRingingTimeout() {
  if (state.ringingTimeoutTimer) {
    window.clearTimeout(state.ringingTimeoutTimer);
    state.ringingTimeoutTimer = null;
  }
}

function setRemoteAvatarLabel(peerId) {
  const label = (peerId || "Remote").slice(0, 18);
  els.remoteAvatar.textContent = label;
}

function updateRemoteAvatarVisibility() {
  const activeStream = state.remoteStream || els.remoteVideo.srcObject;
  const hasVideo = Boolean(
    activeStream &&
      typeof activeStream.getVideoTracks === "function" &&
      activeStream.getVideoTracks().some((t) => t.readyState === "live" && t.enabled)
  );
  const videoReady = els.remoteVideo.readyState >= 2 && els.remoteVideo.videoWidth > 0;
  const shouldShowAvatar = !hasVideo || !videoReady;
  els.remoteAvatar.classList.toggle("hidden", !shouldShowAvatar);
}

function byId(id) {
  return document.getElementById(id);
}

function normalizeCallId(input) {
  const cleaned = (input || "").trim().toLowerCase();
  if (!/^[a-z0-9_-]{3,24}$/.test(cleaned)) return "";
  return cleaned;
}

function toMillis(timestamp) {
  if (!timestamp) return 0;
  if (typeof timestamp.toMillis === "function") return timestamp.toMillis();
  if (timestamp.seconds) return timestamp.seconds * 1000;
  return 0;
}

function formatTime(timestamp) {
  const ms = toMillis(timestamp);
  if (!ms) return "pending";
  return new Date(ms).toLocaleString();
}

function formatCallDateTime(timestamp) {
  const ms = toMillis(timestamp);
  if (!ms) return "pending";
  const d = new Date(ms);
  return d.toLocaleString([], {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

function pickRecorderMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
  ];

  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

async function transcribeAudioBlob(blob) {
  const form = new FormData();
  const ext = blob.type.includes("mp4") ? "m4a" : "webm";
  form.append("audio", blob, `chunk.${ext}`);
  form.append("lang", state.profile?.language || "en");

  const headers = await getAuthHeaders();
  const resp = await fetch(apiUrl("/api/transcribe"), {
    method: "POST",
    headers,
    body: form,
  });

  if (!resp.ok) {
    throw new Error("Transcription endpoint failed");
  }

  const data = await resp.json();
  return String(data?.text || "").trim();
}

async function translateText(text, from, to) {
  try {
    const headers = await getAuthHeaders();
    headers["content-type"] = "application/json";
    const resp = await fetch(apiUrl("/api/translate"), {
      method: "POST",
      headers,
      body: JSON.stringify({ text, from, to }),
    });
    if (!resp.ok) throw new Error("Translation request failed");
    const data = await resp.json();
    return String(data?.translatedText || text);
  } catch {
    return text;
  }
}

function speak(text, lang) {
  if (!window.speechSynthesis || !text) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang === "es" ? "es-ES" : "en-US";
  window.speechSynthesis.speak(utterance);
}

function resolveIncomingTargetLanguage(sourceLang) {
  const preferred = state.profile?.translateIncomingTo === "es" ? "es" : "en";
  if (preferred === sourceLang) {
    return preferred === "en" ? "es" : "en";
  }
  return preferred;
}

async function getAuthHeaders() {
  const user = auth.currentUser || state.user;
  if (!user) {
    throw new Error("Not authenticated");
  }

  const token = await user.getIdToken();
  return {
    authorization: `Bearer ${token}`,
  };
}

async function ensureTurnIceServers() {
  const now = Date.now();
  if (state.turnIceServers?.length && now < state.turnExpiresAtMs - 60_000) {
    return state.turnIceServers;
  }

  if (state.turnFetchPromise) {
    return state.turnFetchPromise;
  }

  state.turnFetchPromise = (async () => {
    const headers = await getAuthHeaders();
    const resp = await fetch(apiUrl("/api/turn-credentials"), { headers });
    if (!resp.ok) {
      throw new Error("TURN fetch failed");
    }
    const data = await resp.json();
    const servers = Array.isArray(data?.iceServers) ? data.iceServers : [];
    if (!servers.length) {
      throw new Error("TURN payload invalid");
    }
    state.turnIceServers = servers;
    state.turnExpiresAtMs = Math.max(now + 60_000, Number(data?.expiresAt || 0) * 1000);
    return servers;
  })();

  try {
    return await state.turnFetchPromise;
  } catch {
    if (!state.turnIceServers?.length) {
      state.turnIceServers = defaultIceServers;
      state.turnExpiresAtMs = now + 120_000;
    }
    return state.turnIceServers;
  } finally {
    state.turnFetchPromise = null;
  }
}

function normalizeApiBaseUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return trimmed.replace(/\/+$/, "");
}

function apiUrl(pathname) {
  if (!apiBaseUrl) return pathname;
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${apiBaseUrl}${path}`;
}
