import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection,
  addDoc,
  doc,
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
const locale = {
  code: "en",
};

const i18n = {
  en: {
    dashTitle: "Calls",
    logout: "Log Out",
    setupTitle: "Finish Profile Setup",
    setupHelp: "Choose your unique call ID to activate calling.",
    setupPlaceholder: "Choose call ID (e.g. eric-100)",
    saveId: "Save ID",
    callSectionTitle: "Start a Call",
    dialPlaceholder: "Enter recipient call ID",
    callBtn: "Call",
    devOpen: "Open In-Call (Dev)",
    devClose: "Close In-Call (Dev)",
    incomingIdle: "No incoming calls",
    callIdle: "Idle",
    contactsTitle: "Contacts",
    contactNamePlaceholder: "Contact name (e.g. Michael)",
    contactCallIdPlaceholder: "Contact call ID (e.g. michael-01)",
    saveContact: "Save Contact",
    contactsHint: "Add a contact to call faster.",
    historyTitle: "Call History",
    contactsEmpty: "No contacts yet",
    contactCall: "Call",
    contactAdded: "Contact saved.",
    contactMissing: "Contact ID not found in database.",
    contactInvalid: "Enter a valid contact call ID.",
    contactNameRequired: "Enter a contact name.",
  },
  es: {
    dashTitle: "Llamadas",
    logout: "Cerrar sesión",
    setupTitle: "Completa tu perfil",
    setupHelp: "Elige tu ID único para activar llamadas.",
    setupPlaceholder: "Elige ID (ej. eric-100)",
    saveId: "Guardar ID",
    callSectionTitle: "Iniciar llamada",
    dialPlaceholder: "Ingresa el ID del destinatario",
    callBtn: "Llamar",
    devOpen: "Abrir llamada (Dev)",
    devClose: "Cerrar llamada (Dev)",
    incomingIdle: "Sin llamadas entrantes",
    callIdle: "En espera",
    contactsTitle: "Contactos",
    contactNamePlaceholder: "Nombre del contacto (ej. Michael)",
    contactCallIdPlaceholder: "ID del contacto (ej. michael-01)",
    saveContact: "Guardar contacto",
    contactsHint: "Agrega un contacto para llamar más rápido.",
    historyTitle: "Historial de llamadas",
    contactsEmpty: "Aún no hay contactos",
    contactCall: "Llamar",
    contactAdded: "Contacto guardado.",
    contactMissing: "El ID del contacto no existe en la base de datos.",
    contactInvalid: "Ingresa un ID de contacto válido.",
    contactNameRequired: "Ingresa un nombre de contacto.",
  },
};

const els = {
  userEmail: byId("userEmail"),
  myIdLabel: byId("myIdLabel"),
  dashTitle: byId("dashTitle"),
  setupPanel: byId("setupPanel"),
  setupTitle: byId("setupTitle"),
  setupHelp: byId("setupHelp"),
  setupCallIdInput: byId("setupCallIdInput"),
  setupProfileBtn: byId("setupProfileBtn"),
  setupStatus: byId("setupStatus"),
  callSectionTitle: byId("callSectionTitle"),
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
  contactsTitle: byId("contactsTitle"),
  historyTitle: byId("historyTitle"),
  contactNameInput: byId("contactNameInput"),
  contactCallIdInput: byId("contactCallIdInput"),
  addContactBtn: byId("addContactBtn"),
  contactsStatus: byId("contactsStatus"),
  contactsList: byId("contactsList"),
  answerBtn: byId("answerBtn"),
  rejectBtn: byId("rejectBtn"),
  endCallBtn: byId("endCallBtn"),
  incomingStatus: byId("incomingStatus"),
  callStatus: byId("callStatus"),
  callLogList: byId("callLogList"),
  localVideo: byId("localVideo"),
  remoteVideo: byId("remoteVideo"),
  remoteAvatar: byId("remoteAvatar"),
  toggleMuteBtn: byId("toggleMuteBtn"),
  toggleCameraBtn: byId("toggleCameraBtn"),
  translationFeed: byId("translationFeed"),
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
  contacts: [],
  unsubIncoming: null,
  unsubCall: null,
  unsubCandidatesA: null,
  unsubCandidatesB: null,
  unsubLogsA: null,
  unsubLogsB: null,
  unsubContacts: null,
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
  answerApplyRetryTimer: null,
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
els.addContactBtn?.addEventListener("click", saveContact);
els.remoteVideo.addEventListener("loadeddata", updateRemoteAvatarVisibility);
els.remoteVideo.addEventListener("playing", updateRemoteAvatarVisibility);
els.remoteVideo.addEventListener("pause", updateRemoteAvatarVisibility);
els.remoteVideo.muted = true;
els.remoteVideo.volume = 0;
resetAllModals();
applyDashboardLocale();

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
  locale.code = state.profile?.language === "es" ? "es" : "en";
  applyDashboardLocale();
  els.myIdLabel.textContent = `ID: ${state.profile.callId}`;

  ensureTurnIceServers().catch(() => {
    setStatus(els.callStatus, "TURN unavailable, using fallback connectivity.");
  });
  ensureNotificationPermission();
  watchIncomingCalls();
  watchCallLogs();
  watchContacts();
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
    locale.code = state.profile?.language === "es" ? "es" : "en";
    applyDashboardLocale();
    watchContacts();
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
      locale.code = state.profile?.language === "es" ? "es" : "en";
      applyDashboardLocale();
      watchContacts();
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

function watchContacts() {
  if (!state.user) return;
  if (state.unsubContacts) state.unsubContacts();

  const contactsRef = collection(db, "users", state.user.uid, "contacts");
  state.unsubContacts = onSnapshot(contactsRef, (snap) => {
    state.contacts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderContacts();
  });
}

function renderContacts() {
  if (!els.contactsList) return;
  els.contactsList.innerHTML = "";

  const rows = [...state.contacts].sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || ""))
  );

  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = t("contactsEmpty");
    els.contactsList.appendChild(empty);
    return;
  }

  rows.forEach((contact) => {
    const item = document.createElement("div");
    item.className = "contact-item";

    const meta = document.createElement("div");
    meta.className = "contact-meta";
    meta.innerHTML = `<strong>${escapeHtml(contact.name || contact.callId || "-")}</strong><span>${escapeHtml(contact.callId || "-")}</span>`;

    const callBtn = document.createElement("button");
    callBtn.className = "btn";
    callBtn.type = "button";
    callBtn.textContent = t("contactCall");
    callBtn.addEventListener("click", () => callContact(contact.callId || ""));

    item.appendChild(meta);
    item.appendChild(callBtn);
    els.contactsList.appendChild(item);
  });
}

async function saveContact() {
  if (!state.user) return;
  const name = String(els.contactNameInput?.value || "").trim();
  const callId = normalizeCallId(els.contactCallIdInput?.value || "");

  if (!name) {
    setStatus(els.contactsStatus, t("contactNameRequired"));
    return;
  }
  if (!callId) {
    setStatus(els.contactsStatus, t("contactInvalid"));
    return;
  }

  try {
    const targetSnap = await getDoc(doc(db, "callIds", callId));
    if (!targetSnap.exists()) {
      setStatus(els.contactsStatus, t("contactMissing"));
      return;
    }

    const contactRef = doc(db, "users", state.user.uid, "contacts", callId);
    await setDoc(contactRef, {
      name,
      callId,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    els.contactNameInput.value = "";
    els.contactCallIdInput.value = "";
    setStatus(els.contactsStatus, t("contactAdded"));
  } catch (err) {
    setStatus(els.contactsStatus, `Contact save failed: ${err.message}`);
  }
}

function callContact(callId) {
  const targetId = normalizeCallId(callId);
  if (!targetId) {
    setStatus(els.callStatus, t("contactInvalid"));
    return;
  }
  els.dialIdInput.value = targetId;
  startCallById(targetId);
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
      startCallById(counterpartId);
    });
    els.callLogList.appendChild(btn);
  });
}

async function startCall() {
  const targetId = normalizeCallId(els.dialIdInput.value);
  if (!targetId) {
    setStatus(els.callStatus, "Enter a valid recipient ID");
    return;
  }

  await startCallById(targetId);
}

async function startCallById(targetId) {
  if (!state.profile?.callId) {
    setStatus(els.callStatus, "Your profile has no call ID");
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

      if (data.status === "active") {
        clearRingingTimeout();
        stopRingback();
        hideOutgoingModal();
        if (!state.devCallPreview) {
          showCallModal();
        }
      }

      if (data.answer && !state.pc.currentRemoteDescription) {
        await applyRemoteAnswerWithRetry(data.answer);
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

  state.localStream = await getLocalMediaStream();
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

async function applyRemoteAnswerWithRetry(answer) {
  if (!state.pc || state.pc.currentRemoteDescription) return;

  try {
    await state.pc.setRemoteDescription(new RTCSessionDescription(answer));
    setStatus(els.callStatus, "Connected");
    clearRingingTimeout();
    stopRingback();
    hideOutgoingModal();
    showCallModal();
    clearAnswerApplyRetry();
  } catch (err) {
    setStatus(els.callStatus, `Connection setup delayed: ${err?.message || "retrying..."}`);
    if (!state.answerApplyRetryTimer) {
      state.answerApplyRetryTimer = window.setTimeout(() => {
        state.answerApplyRetryTimer = null;
        applyRemoteAnswerWithRetry(answer).catch(() => {});
      }, 1200);
    }
  }
}

function clearAnswerApplyRetry() {
  if (state.answerApplyRetryTimer) {
    window.clearTimeout(state.answerApplyRetryTimer);
    state.answerApplyRetryTimer = null;
  }
}

async function getLocalMediaStream() {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
  } catch (err) {
    const name = String(err?.name || "");
    const message = String(err?.message || "");
    const maybePermissionIssue =
      name === "NotAllowedError" ||
      name === "NotFoundError" ||
      message.toLowerCase().includes("not allowed") ||
      message.toLowerCase().includes("permission");

    if (!maybePermissionIssue) {
      throw err;
    }

    // Mobile browsers often block camera first; keep call usable with audio-only.
    const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    setStatus(els.callStatus, "Camera unavailable. Continuing with audio only.");
    return audioOnly;
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

  return channels;
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
  clearAnswerApplyRetry();
  state.unsubCall = null;
  state.unsubCandidatesA = null;
  state.unsubCandidatesB = null;
  state.mediaReady = false;

  els.localVideo.srcObject = null;
  els.remoteVideo.srcObject = null;
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
  if (state.unsubContacts) state.unsubContacts();
  stopRingtone();
  stopRingback();
  hideOutgoingModal();
  closeIncomingNotification();
  clearRingingTimeout();
  state.unsubIncoming = null;
  state.unsubLogsA = null;
  state.unsubLogsB = null;
  state.unsubContacts = null;
  state.contacts = [];
  state.turnIceServers = null;
  state.turnExpiresAtMs = 0;
  state.turnFetchPromise = null;
  if (els.contactsList) els.contactsList.innerHTML = "";
  await teardownCall();
}

function setStatus(el, text) {
  if (!el) return;
  el.textContent = text;
}

function t(key) {
  const lang = locale.code === "es" ? "es" : "en";
  return i18n[lang][key] || i18n.en[key] || key;
}

function applyDashboardLocale() {
  if (els.dashTitle) els.dashTitle.textContent = t("dashTitle");
  if (els.logoutBtn) els.logoutBtn.textContent = t("logout");
  if (els.setupTitle) els.setupTitle.textContent = t("setupTitle");
  if (els.setupHelp) els.setupHelp.textContent = t("setupHelp");
  if (els.setupCallIdInput) els.setupCallIdInput.placeholder = t("setupPlaceholder");
  if (els.setupProfileBtn) els.setupProfileBtn.textContent = t("saveId");
  if (els.callSectionTitle) els.callSectionTitle.textContent = t("callSectionTitle");
  if (els.dialIdInput) els.dialIdInput.placeholder = t("dialPlaceholder");
  if (els.callBtn) els.callBtn.textContent = t("callBtn");
  if (els.contactsTitle) els.contactsTitle.textContent = t("contactsTitle");
  if (els.contactNameInput) els.contactNameInput.placeholder = t("contactNamePlaceholder");
  if (els.contactCallIdInput) els.contactCallIdInput.placeholder = t("contactCallIdPlaceholder");
  if (els.addContactBtn) els.addContactBtn.textContent = t("saveContact");
  if (els.historyTitle) els.historyTitle.textContent = t("historyTitle");
  if (els.incomingStatus) els.incomingStatus.textContent = t("incomingIdle");
  if (els.callStatus) els.callStatus.textContent = t("callIdle");
  if (els.contactsStatus) els.contactsStatus.textContent = t("contactsHint");
  updateDevPreviewButton();
  renderContacts();
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
  els.devPreviewBtn.textContent = state.devCallPreview ? t("devClose") : t("devOpen");
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
      const callRef = doc(db, "calls", callId);
      const snap = await getDoc(callRef);
      if (!snap.exists()) return;
      const data = snap.data() || {};
      if (data.status !== "ringing" || data.answer) {
        return;
      }

      await updateDoc(doc(db, "calls", callId), {
        status: "ended",
        endedAt: serverTimestamp(),
        endedReason: "no_answer_timeout",
      });
      setStatus(els.callStatus, `No answer from ${targetId}. Call ended.`);
    } catch {
      // Ignore timeout update errors.
    }
  }, 35000);
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}
