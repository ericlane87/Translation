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
const apiBaseStorageKey = String(runtimeConfig.API_BASE_STORAGE_KEY || "VOICEBRIDGE_API_BASE_URL");
let apiBaseUrl = normalizeApiBaseUrl(String(runtimeConfig.API_BASE_URL || ""));
const debugMode = new URLSearchParams(window.location.search).get("debug") === "1";
const defaultApiBaseUrl = normalizeApiBaseUrl(String(runtimeConfig.DEFAULT_API_BASE_URL || ""));
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
  apiBaseInput: byId("apiBaseInput"),
  saveApiBaseBtn: byId("saveApiBaseBtn"),
  clearApiBaseBtn: byId("clearApiBaseBtn"),
  apiBaseStatus: byId("apiBaseStatus"),
  backendPanel: byId("backendPanel"),
  devPreviewBtn: byId("devPreviewBtn"),
  contactsTitle: byId("contactsTitle"),
  historyTitle: byId("historyTitle"),
  contactNameInput: byId("contactNameInput"),
  contactCallIdInput: byId("contactCallIdInput"),
  addContactBtn: byId("addContactBtn"),
  toggleContactFormBtn: byId("toggleContactFormBtn"),
  contactForm: byId("contactForm"),
  contactDrawer: byId("contactDrawer"),
  contactDrawerBackdrop: byId("contactDrawerBackdrop"),
  closeContactDrawerBtn: byId("closeContactDrawerBtn"),
  contactsStatus: byId("contactsStatus"),
  contactsList: byId("contactsList"),
  answerBtn: byId("answerBtn"),
  rejectBtn: byId("rejectBtn"),
  endCallBtn: byId("endCallBtn"),
  enablePermissionsBtn: byId("enablePermissionsBtn"),
  incomingStatus: byId("incomingStatus"),
  callStatus: byId("callStatus"),
  callLogList: byId("callLogList"),
  localVideo: byId("localVideo"),
  remoteVideo: byId("remoteVideo"),
  remoteAudio: byId("remoteAudio"),
  remoteAvatar: byId("remoteAvatar"),
  subtitleOverlay: byId("subtitleOverlay"),
  subtitleOverlayLabel: byId("subtitleOverlayLabel"),
  subtitleOverlayText: byId("subtitleOverlayText"),
  mobileSubtitleBar: byId("mobileSubtitleBar"),
  mobileSubtitleLabel: byId("mobileSubtitleLabel"),
  mobileSubtitleText: byId("mobileSubtitleText"),
  toggleMuteBtn: byId("toggleMuteBtn"),
  toggleCameraBtn: byId("toggleCameraBtn"),
  translationFeed: byId("translationFeed"),
  translationLegend: byId("translationLegend"),
  debugFeed: byId("debugFeed"),
  clearDebugBtn: byId("clearDebugBtn"),
};

const state = {
  user: null,
  profile: null,
  remoteProfile: null,
  currentCallId: null,
  incomingCall: null,
  localStream: null,
  remoteStream: null,
  remoteAudioStream: null,
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
  captureContext: null,
  captureSource: null,
  captureProcessor: null,
  captureFlushTimer: null,
  captureSampleRate: 16_000,
  captureChunks: [],
  captureChunkSamples: 0,
  lastSpeechAt: 0,
  turnIceServers: null,
  turnExpiresAtMs: 0,
  turnFetchPromise: null,
  turnDisabledUntilMs: 0,
  turnFailureNotified: false,
  answerApplyRetryTimer: null,
  presenceHeartbeatTimer: null,
  audioUnlocked: false,
  audioUnlockHintShown: false,
  debugEntries: [],
  subtitleOverlayTimer: null,
};
const DASH_SESSION_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const defaultIceServers = [{ urls: ["stun:stun.l.google.com:19302"] }];

els.logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "auth.html";
});
els.callBtn.addEventListener("click", startCall);
els.saveApiBaseBtn?.addEventListener("click", saveApiBaseUrlFromForm);
els.clearApiBaseBtn?.addEventListener("click", clearApiBaseUrl);
els.devPreviewBtn.addEventListener("click", toggleDevCallPreview);
els.answerBtn.addEventListener("click", answerIncomingCall);
els.rejectBtn.addEventListener("click", rejectIncomingCall);
els.endCallBtn.addEventListener("click", endCall);
els.enablePermissionsBtn?.addEventListener("click", () => {
  requestMediaPermissions().catch((err) => {
    setStatus(els.callStatus, `Permission request failed: ${err?.message || "unknown error"}`);
  });
});
els.toggleMuteBtn.addEventListener("click", toggleMute);
els.toggleCameraBtn.addEventListener("click", () => {
  toggleCamera().catch((err) => {
    setStatus(els.callStatus, `Camera toggle failed: ${err?.message || "unknown error"}`);
  });
});
els.setupProfileBtn.addEventListener("click", setupMissingProfileFromForm);
els.cancelOutgoingBtn.addEventListener("click", cancelOutgoingCall);
els.addContactBtn?.addEventListener("click", saveContact);
els.toggleContactFormBtn?.addEventListener("click", toggleContactForm);
els.contactDrawerBackdrop?.addEventListener("click", () => setContactFormVisible(false));
els.closeContactDrawerBtn?.addEventListener("click", () => setContactFormVisible(false));
els.clearDebugBtn?.addEventListener("click", clearDebugFeed);
els.remoteVideo.addEventListener("loadeddata", updateRemoteAvatarVisibility);
els.remoteVideo.addEventListener("playing", updateRemoteAvatarVisibility);
els.remoteVideo.addEventListener("pause", updateRemoteAvatarVisibility);
document.addEventListener("visibilitychange", () => {
  syncPresence().catch(() => {});
});
document.addEventListener("pointerdown", unlockAudioContextFromGesture, { passive: true });
document.addEventListener("touchstart", unlockAudioContextFromGesture, { passive: true });
document.addEventListener("keydown", unlockAudioContextFromGesture, { passive: true });
window.addEventListener("online", () => {
  syncPresence().catch(() => {});
});
window.addEventListener("offline", () => {
  syncPresence().catch(() => {});
});
window.addEventListener("beforeunload", () => {
  markPresenceBestEffort("background");
});
els.remoteVideo.muted = true;
els.remoteVideo.volume = 0;
if (els.remoteAudio) {
  els.remoteAudio.muted = false;
  els.remoteAudio.volume = 1;
}
resetAllModals();
applyDashboardLocale();
initializeApiBaseControls();
initializeDebugVisibility();

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

  startDashboardRealtime();
});

function startDashboardRealtime() {
  updateApiBaseStatus();
  logDebug(
    `profile loaded • language=${state.profile?.language || "en"} incoming=${state.profile?.translateIncomingTo || "en"}`
  );
  updateTranslationLegend();
  ensureTurnIceServers().catch(() => {
    setStatus(els.callStatus, "TURN unavailable, using fallback connectivity.");
  });
  ensureNotificationPermission();
  watchIncomingCalls();
  watchCallLogs();
  watchContacts();
  startPresenceHeartbeat();
}

function initializeApiBaseControls() {
  if (els.backendPanel) {
    els.backendPanel.classList.toggle("hidden", !debugMode);
  }
  if (els.apiBaseInput) {
    els.apiBaseInput.value = apiBaseUrl;
  }
  updateApiBaseStatus();
}

function updateApiBaseStatus(message) {
  if (!els.apiBaseStatus) return;
  if (message) {
    setStatus(els.apiBaseStatus, message);
    return;
  }
  if (apiBaseUrl) {
    setStatus(els.apiBaseStatus, `Backend configured: ${apiBaseUrl}`);
    return;
  }
  setStatus(
    els.apiBaseStatus,
    "No backend URL set. Calls will be STUN-only, and transcription/translation will not work."
  );
}

async function saveApiBaseUrlFromForm() {
  const nextValue = normalizeApiBaseUrl(String(els.apiBaseInput?.value || ""));
  if (!nextValue) {
    updateApiBaseStatus("Enter a valid backend URL.");
    return;
  }

  apiBaseUrl = nextValue;
  window.VOICEBRIDGE_CONFIG = Object.assign({}, window.VOICEBRIDGE_CONFIG, {
    API_BASE_URL: apiBaseUrl,
  });
  resetTurnConfigurationCache();

  try {
    window.localStorage.setItem(apiBaseStorageKey, apiBaseUrl);
  } catch {
    // Ignore storage failures and keep the runtime value.
  }

  updateApiBaseStatus("Checking backend...");
  const probe = await probeBackendHealth();
  updateApiBaseStatus(probe.message);
}

function clearApiBaseUrl() {
  apiBaseUrl = defaultApiBaseUrl || "";
  window.VOICEBRIDGE_CONFIG = Object.assign({}, window.VOICEBRIDGE_CONFIG, {
    API_BASE_URL: apiBaseUrl,
  });
  resetTurnConfigurationCache();
  if (els.apiBaseInput) {
    els.apiBaseInput.value = apiBaseUrl;
  }
  try {
    if (apiBaseUrl) {
      window.localStorage.setItem(apiBaseStorageKey, apiBaseUrl);
    } else {
      window.localStorage.removeItem(apiBaseStorageKey);
    }
  } catch {
    // Ignore storage failures.
  }
  updateApiBaseStatus();
}

function resetTurnConfigurationCache() {
  state.turnIceServers = null;
  state.turnExpiresAtMs = 0;
  state.turnFetchPromise = null;
  state.turnDisabledUntilMs = 0;
  state.turnFailureNotified = false;
}

async function probeBackendHealth() {
  try {
    const resp = await fetch(apiUrl("/api/health"));
    if (!resp.ok) {
      return { ok: false, message: `Backend check failed (${resp.status}).` };
    }

    const data = await resp.json();
    const turn = data?.features?.turn ? "TURN ready" : "TURN missing";
    const stt = data?.features?.transcribe ? "transcribe ready" : "transcribe missing";
    const translate = data?.features?.translate ? "translate ready" : "translate missing";
    return {
      ok: true,
      message: `Backend configured: ${apiBaseUrl} (${turn}, ${stt}, ${translate})`,
    };
  } catch {
    return {
      ok: false,
      message: `Saved ${apiBaseUrl}, but the backend health check could not be reached.`,
    };
  }
}

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
    startDashboardRealtime();
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
      startDashboardRealtime();
      return;
    } catch (err2) {
      setStatus(els.setupStatus, `Profile setup failed: ${err2.message}`);
      return;
    }
  }
}

function watchIncomingCalls() {
  if (state.unsubIncoming) state.unsubIncoming();
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
        markIncomingSeen(state.incomingCall.id);
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
  if (state.unsubLogsA) state.unsubLogsA();
  if (state.unsubLogsB) state.unsubLogsB();
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
    setContactFormVisible(false);
    setStatus(els.contactsStatus, t("contactAdded"));
  } catch (err) {
    setStatus(els.contactsStatus, `Contact save failed: ${err.message}`);
  }
}

function toggleContactForm() {
  setContactFormVisible(els.contactForm?.classList.contains("hidden"));
}

function setContactFormVisible(visible) {
  if (!els.contactDrawer) return;
  els.contactDrawer.classList.toggle("hidden", !visible);
  els.contactDrawer.setAttribute("aria-hidden", visible ? "false" : "true");
  if (els.toggleContactFormBtn) {
    els.toggleContactFormBtn.textContent = visible ? "Close" : "Create Contact";
  }
  if (visible) {
    window.setTimeout(() => {
      els.contactNameInput?.focus();
    }, 40);
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
    primeRemotePlayback();
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

    await loadRemoteProfile(receiverUid);

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
    startRingingTimeout(callRef.id, targetId, receiverUid);

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

    let outcomeNotified = false;
    state.unsubCall = onSnapshot(callRef, async (snap) => {
      const data = snap.data();
      if (!data || !state.pc) return;

      if (data.status === "ringing") {
        setStatus(els.callStatus, `Ringing ${targetId}...`);
      }

      if (data.status === "connecting") {
        setStatus(els.callStatus, `${targetId} accepted. Connecting media...`);
        stopRingback();
        hideOutgoingModal();
        if (!state.devCallPreview) {
          showCallModal();
        }
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
        if (!outcomeNotified) {
          maybeShowCallerOutcomePopup(targetId, data);
          outcomeNotified = true;
        }
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

  const acceptedCall = { ...state.incomingCall };
  const callRef = doc(db, "calls", acceptedCall.id);

  try {
    primeRemotePlayback();
    hideIncomingModal();
    hideOutgoingModal();
    showCallModal();
    setStatus(els.callStatus, "Connecting...");
    stopRingtone();
    closeIncomingNotification();
    await updateDoc(callRef, {
      status: "connecting",
      receiverAcceptedAt: serverTimestamp(),
      receiverAcceptedSessionId: DASH_SESSION_ID,
    });
    await loadRemoteProfile(acceptedCall.callerUid);
    await setupPeer(false);
    state.remotePeerId = acceptedCall.callerId || "Remote";
    setRemoteAvatarLabel(state.remotePeerId);

    const offerCandidatesRef = collection(db, "calls", acceptedCall.id, "offerCandidates");
    const answerCandidatesRef = collection(db, "calls", acceptedCall.id, "answerCandidates");

    state.pc.onicecandidate = async (event) => {
      if (event.candidate) {
        await addDoc(answerCandidatesRef, event.candidate.toJSON());
      }
    };

    const offer = await waitForOffer(callRef, 7000);
    await state.pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await state.pc.createAnswer();
    await state.pc.setLocalDescription(answer);

    await updateDoc(callRef, {
      answer: { type: answer.type, sdp: answer.sdp },
      status: "active",
      answeredAt: serverTimestamp(),
      receiverMediaReadyAt: serverTimestamp(),
    });

    state.currentCallId = acceptedCall.id;

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
      if (d.status === "active") {
        showCallModal();
      }
      if (d.status === "ended" || d.status === "rejected") {
        setStatus(els.callStatus, `Call ${d.status}`);
        await teardownCall();
      }
    });

    setStatus(els.callStatus, "Connected");
  } catch (err) {
    try {
      await updateDoc(callRef, {
        status: "rejected",
        rejectedAt: serverTimestamp(),
        endedReason: classifyAnswerFailureReason(err),
      });
    } catch {
      // Ignore update failures; caller timeout fallback still applies.
    }
    setStatus(els.callStatus, `Answer failed: ${err.message}`);
    const reason = classifyAnswerFailureReason(err);
    if (reason === "receiver_media_denied") {
      window.alert("Could not join call: Camera/Microphone permission was denied on this device.");
    } else {
      const details = String(err?.message || "unknown error");
      window.alert(`Could not join call. ${details}`);
    }
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
    endedReason: "receiver_declined",
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
  state.micMuted = false;
  state.cameraOff = false;
  if (els.toggleMuteBtn) els.toggleMuteBtn.textContent = "Mute";
  if (els.toggleCameraBtn) els.toggleCameraBtn.textContent = "Camera Off";
  state.remoteStream = new MediaStream();
  state.remoteAudioStream = new MediaStream();

  els.localVideo.srcObject = state.localStream;
  els.localVideo.play().catch(() => {});
  els.remoteVideo.srcObject = state.remoteStream;
  if (els.remoteAudio) {
    els.remoteAudio.srcObject = state.remoteAudioStream;
  }

  state.pc = new RTCPeerConnection({
    iceServers: state.turnIceServers || defaultIceServers,
  });
  state.localStream.getTracks().forEach((track) => state.pc.addTrack(track, state.localStream));

  state.pc.ontrack = (event) => {
    const track = event.track;
    if (track.kind === "video") {
      if (!state.remoteStream.getTracks().some((t) => t.id === track.id)) {
        state.remoteStream.addTrack(track);
      }
    } else if (track.kind === "audio") {
      if (
        state.remoteAudioStream &&
        !state.remoteAudioStream.getTracks().some((t) => t.id === track.id)
      ) {
        state.remoteAudioStream.addTrack(track);
      }
    }
    playRemoteMedia();
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

function classifyAnswerFailureReason(err) {
  const name = String(err?.name || "");
  const msg = String(err?.message || "").toLowerCase();
  const permissionDenied =
    name === "NotAllowedError" ||
    msg.includes("permission denied") ||
    msg.includes("not allowed") ||
    msg.includes("blocked media");
  if (permissionDenied) return "receiver_media_denied";
  return "receiver_answer_failed";
}

async function waitForOffer(callRef, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const snap = await getDoc(callRef);
    const data = snap.data() || {};
    if (data.offer?.type && data.offer?.sdp) {
      return data.offer;
    }
    await sleep(250);
  }
  throw new Error("Caller offer not ready yet. Please try again.");
}

function maybeShowCallerOutcomePopup(targetId, data) {
  const reason = String(data?.endedReason || "");
  const peer = targetId || "The other person";
  let message = "";

  if (reason === "receiver_media_denied") {
    message = `${peer} accepted, but camera/microphone permission was denied.`;
  } else if (reason === "receiver_media_setup_failed") {
    message = `${peer} accepted, but media setup failed before joining.`;
  } else if (reason === "receiver_no_action") {
    message = `${peer} saw the incoming call but did not answer.`;
  } else if (reason === "receiver_offline_or_background") {
    message = `${peer} appears offline or in the background and could not answer.`;
  } else if (data?.status === "rejected") {
    message = `${peer} declined the call.`;
  } else if (reason === "no_answer_timeout") {
    message = `${peer} did not answer the call.`;
  } else if (reason === "receiver_answer_failed") {
    message = `${peer} could not join the call.`;
  }

  if (message) {
    window.alert(message);
  }
}

async function getLocalMediaStream() {
  const highQualityVideo = {
    facingMode: "user",
    width: { ideal: 1280 },
    height: { ideal: 720 },
  };
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: highQualityVideo,
    });
  } catch (err) {
    const name = String(err?.name || "");
    const message = String(err?.message || "");
    const maybePermissionIssue =
      name === "NotAllowedError" ||
      name === "NotFoundError" ||
      message.toLowerCase().includes("not allowed") ||
      message.toLowerCase().includes("permission");

    // iPhone/older devices can reject stricter constraints even when camera is available.
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    } catch (relaxedErr) {
      if (!maybePermissionIssue) {
        throw relaxedErr;
      }
    }

    const iosInsecureContext = isIosDevice() && isLikelyInsecureOrigin();
    if (iosInsecureContext) {
      setStatus(
        els.callStatus,
        "iPhone media blocked: use HTTPS (or localhost) and allow Camera/Microphone in browser settings."
      );
    }

    // Mobile browsers often block camera first; keep call usable with audio-only.
    try {
      const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      setStatus(els.callStatus, "Camera unavailable. Continuing with audio only.");
      return audioOnly;
    } catch (audioErr) {
      if (iosInsecureContext) {
        throw new Error("iPhone blocked media on insecure origin. Open this app over HTTPS and try again.");
      }
      throw audioErr;
    }
  }
}

async function requestMediaPermissions() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Browser does not support camera/microphone access.");
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    stream.getTracks().forEach((t) => t.stop());
    state.audioUnlockHintShown = false;
    setStatus(els.callStatus, "Camera and microphone permissions are enabled.");
  } catch (err) {
    const name = String(err?.name || "");
    const message = String(err?.message || "").toLowerCase();
    const denied =
      name === "NotAllowedError" ||
      message.includes("permission") ||
      message.includes("denied") ||
      message.includes("not allowed");

    if (!denied) {
      throw err;
    }

    const help = isIosDevice()
      ? "Permission denied. On iPhone: Settings > Chrome > Camera/Microphone = Allow, then reopen Chrome and retry."
      : "Permission denied. Enable Camera/Microphone for this site in browser settings, then retry.";

    setStatus(els.callStatus, help);
    window.alert(help);
  }
}

function isIosDevice() {
  const ua = String(navigator.userAgent || "");
  return /iPhone|iPad|iPod/i.test(ua);
}

function isLikelyInsecureOrigin() {
  if (window.isSecureContext) return false;
  const host = String(window.location.hostname || "").toLowerCase();
  return host !== "localhost" && host !== "127.0.0.1" && host !== "::1" && host !== "[::1]";
}

function setupDataChannel(channel) {
  channel.onopen = () => {
    logDebug("data channel open");
    setStatus(els.callStatus, "Connected • Translation captions active");
  };
  channel.onmessage = async (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.type !== "translation" || !payload.original) return;

      const sender = payload.sender || "Remote";
      const from = payload.from === "es" ? "es" : "en";
      const incomingTarget = resolveIncomingTargetLanguage(from);
      logDebug(
        `translation payload received • from=${from} target=${incomingTarget} text="${String(payload.original).slice(0, 80)}"`
      );
      const translated = await translateText(payload.original, from, incomingTarget);
      const rendered = translated || "[translation unavailable]";
      appendFeed("incoming", rendered);
      showSubtitleOverlay(rendered);
      logDebug(`translation rendered • "${rendered.slice(0, 80)}"`);
      if (!translated) {
        setStatus(
          els.callStatus,
          "Live translation unavailable right now (backend offline). Captions will show original text."
        );
      }
    } catch (err) {
      logDebug(`data channel message failed • ${err?.message || "bad payload"}`);
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

function primeRemotePlayback() {
  playRemoteMedia();
}

function playRemoteMedia() {
  if (els.remoteVideo) {
    els.remoteVideo.muted = true;
    els.remoteVideo.volume = 0;
    els.remoteVideo.play().catch(() => {});
  }
  if (els.remoteAudio) {
    els.remoteAudio.muted = false;
    els.remoteAudio.volume = 1;
    els.remoteAudio.play().catch(() => {});
  }
}

function toggleMute() {
  if (!state.localStream) return;
  state.micMuted = !state.micMuted;
  state.localStream.getAudioTracks().forEach((track) => {
    track.enabled = !state.micMuted;
  });
  els.toggleMuteBtn.textContent = state.micMuted ? "Unmute" : "Mute";
}

async function toggleCamera() {
  if (!state.localStream) return;

  const currentVideoTracks = state.localStream.getVideoTracks();
  const hasLiveVideoTrack = currentVideoTracks.some((t) => t.readyState === "live");

  // Turn camera on: if no live video track exists (audio-only call), request one now.
  if (state.cameraOff || !hasLiveVideoTrack) {
    if (!hasLiveVideoTrack) {
      const camStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      const newTrack = camStream.getVideoTracks()[0];
      if (!newTrack) {
        throw new Error("No camera track available");
      }

      state.localStream.addTrack(newTrack);
      if (state.pc) {
        const videoSender = state.pc.getSenders().find((s) => s.track && s.track.kind === "video");
        if (videoSender) {
          await videoSender.replaceTrack(newTrack);
        } else {
          state.pc.addTrack(newTrack, state.localStream);
        }
      }
      els.localVideo.srcObject = state.localStream;
      els.localVideo.play().catch(() => {});
    }

    state.cameraOff = false;
    state.localStream.getVideoTracks().forEach((track) => {
      track.enabled = true;
    });
    els.toggleCameraBtn.textContent = "Camera Off";
    setStatus(els.callStatus, "Camera on");
    return;
  }

  // Turn camera off.
  state.cameraOff = true;
  state.localStream.getVideoTracks().forEach((track) => {
    track.enabled = false;
  });
  els.toggleCameraBtn.textContent = "Camera On";
  setStatus(els.callStatus, "Camera off");
}

async function teardownCall() {
  if (state.localStream) {
    state.localStream.getTracks().forEach((t) => t.stop());
  }

  if (state.remoteStream) {
    state.remoteStream.getTracks().forEach((t) => t.stop());
  }
  if (state.remoteAudioStream) {
    state.remoteAudioStream.getTracks().forEach((t) => t.stop());
  }

  if (state.pc) {
    state.pc.close();
  }

  if (state.unsubCall) state.unsubCall();
  if (state.unsubCandidatesA) state.unsubCandidatesA();
  if (state.unsubCandidatesB) state.unsubCandidatesB();

  state.localStream = null;
  state.remoteStream = null;
  state.remoteAudioStream = null;
  state.pc = null;
  state.dataChannel = null;
  state.currentCallId = null;
  state.remotePeerId = "";
  state.remoteProfile = null;
  clearRingingTimeout();
  clearAnswerApplyRetry();
  state.unsubCall = null;
  state.unsubCandidatesA = null;
  state.unsubCandidatesB = null;
  state.mediaReady = false;

  els.localVideo.srcObject = null;
  els.remoteVideo.srcObject = null;
  if (els.remoteAudio) {
    els.remoteAudio.srcObject = null;
  }
  stopAutoTranslate();
  hideSubtitleOverlay();
  stopRingback();
  hideOutgoingModal();
  setRemoteAvatarLabel("Remote");
  updateRemoteAvatarVisibility();
  hideCallModal();
}

async function loadRemoteProfile(uid) {
  state.remoteProfile = null;
  if (!uid) {
    updateTranslationLegend();
    return;
  }

  try {
    const snap = await getDoc(doc(db, "users", uid));
    state.remoteProfile = snap.exists() ? snap.data() : null;
  } catch {
    state.remoteProfile = null;
  }
  updateTranslationLegend();
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
  await stopPresenceHeartbeat();
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
  resetTranslationUi();
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
  resetTranslationUi();
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
      if (!state.audioUnlockHintShown) {
        setStatus(els.callStatus, "Tap anywhere once to enable ringtone audio on this device.");
        state.audioUnlockHintShown = true;
      }
      return;
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

function appendFeed(kind, primaryText, secondaryText = "") {
  if (!els.translationFeed) return;
  const key = kind === "incoming" ? "incoming" : "outgoing";
  let row = els.translationFeed.querySelector(`[data-caption-key="${key}"]`);
  if (!row) {
    row = document.createElement("div");
    row.dataset.captionKey = key;
    row.className = `caption-row ${key}`;

    const title = document.createElement("strong");
    title.className = "caption-title";
    row.appendChild(title);

    const primary = document.createElement("span");
    primary.className = "caption-primary";
    row.appendChild(primary);

    const secondary = document.createElement("span");
    secondary.className = "caption-secondary";
    row.appendChild(secondary);

    els.translationFeed.appendChild(row);
  }
  const title = row.querySelector(".caption-title");
  const primary = row.querySelector(".caption-primary");
  const secondary = row.querySelector(".caption-secondary");
  if (title) {
    title.textContent = kind === "incoming" ? translatedForYouLabel() : localSpeakerLabel();
  }
  if (primary) {
    primary.textContent = primaryText || "";
  }
  if (secondary) {
    secondary.textContent = secondaryText || "";
    secondary.style.display = secondaryText ? "block" : "none";
  }
}

function logDebug(message) {
  if (!debugMode) return;
  const stamp = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  state.debugEntries.unshift(`${stamp} • ${message}`);
  state.debugEntries = state.debugEntries.slice(0, 40);
  renderDebugFeed();
}

function renderDebugFeed() {
  if (!els.debugFeed) return;
  els.debugFeed.innerHTML = "";

  if (!state.debugEntries.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No debug events yet.";
    els.debugFeed.appendChild(empty);
    return;
  }

  state.debugEntries.forEach((entry) => {
    const row = document.createElement("p");
    row.textContent = entry;
    els.debugFeed.appendChild(row);
  });
}

function clearDebugFeed() {
  state.debugEntries = [];
  renderDebugFeed();
}

function showSubtitleOverlay(text) {
  if (els.subtitleOverlayLabel) {
    els.subtitleOverlayLabel.textContent = translatedForYouLabel();
  }
  if (els.subtitleOverlayText) {
    els.subtitleOverlayText.textContent = text || "";
  }
  if (els.subtitleOverlay) {
    els.subtitleOverlay.classList.remove("hidden");
  }
  if (els.mobileSubtitleLabel) {
    els.mobileSubtitleLabel.textContent = translatedForYouLabel();
  }
  if (els.mobileSubtitleText) {
    els.mobileSubtitleText.textContent = text || "";
  }
  if (els.mobileSubtitleBar) {
    els.mobileSubtitleBar.classList.remove("hidden");
  }
  if (state.subtitleOverlayTimer) {
    window.clearTimeout(state.subtitleOverlayTimer);
  }
  state.subtitleOverlayTimer = window.setTimeout(() => {
    hideSubtitleOverlay();
  }, 4200);
}

function hideSubtitleOverlay() {
  if (state.subtitleOverlayTimer) {
    window.clearTimeout(state.subtitleOverlayTimer);
    state.subtitleOverlayTimer = null;
  }
  if (els.subtitleOverlay) {
    els.subtitleOverlay.classList.add("hidden");
  }
  if (els.subtitleOverlayText) {
    els.subtitleOverlayText.textContent = "";
  }
  if (els.mobileSubtitleBar) {
    els.mobileSubtitleBar.classList.add("hidden");
  }
  if (els.mobileSubtitleText) {
    els.mobileSubtitleText.textContent = "";
  }
}

function resetTranslationUi() {
  if (els.translationFeed) {
    els.translationFeed.innerHTML = "";
  }
  hideSubtitleOverlay();
}

function initializeDebugVisibility() {
  const shell = els.clearDebugBtn?.closest(".debug-feed-shell");
  if (!shell) return;
  shell.classList.toggle("hidden", !debugMode);
  if (debugMode) {
    renderDebugFeed();
  }
}

async function performTranslationFromText(spoken) {
  const channels = getOpenDataChannels();
  if (!channels.length) {
    logDebug("translation send skipped • data channel not ready");
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
      logDebug(`translation payload sent • from=${from} text="${spoken.slice(0, 80)}"`);
    } catch {
      logDebug("translation payload send failed");
    }
  });
  const previewTarget = resolveRemoteIncomingLanguage(from);
  const preview =
    previewTarget && previewTarget !== from
      ? await translateText(spoken, from, previewTarget)
      : null;
  appendFeed(
    "outgoing",
    spoken,
    preview ? `Sent to them in ${labelForLanguage(previewTarget)}: ${preview}` : ""
  );
}

function updateTranslationLegend() {
  if (!els.translationLegend) return;
  const myLanguage = state.profile?.language === "es" ? "Spanish" : "English";
  const incomingLanguage = state.profile?.translateIncomingTo === "es" ? "Spanish" : "English";
  const remoteIncomingLanguage = labelForLanguage(resolveRemoteIncomingLanguage());
  const remoteLine = state.remoteProfile
    ? ` The other person should receive your captions in ${remoteIncomingLanguage}.`
    : "";
  els.translationLegend.textContent =
    `You speak ${myLanguage}. Incoming translated captions appear here in ${incomingLanguage}.${remoteLine}`;
}

function translatedForYouLabel() {
  return locale.code === "es" ? "Traducido para ti" : "Translated for you";
}

function localSpeakerLabel() {
  const source = state.profile?.callId || state.user?.email || "You";
  return formatPeerDisplayName(source);
}

function resolveRemoteIncomingLanguage(sourceLang = state.profile?.language === "es" ? "es" : "en") {
  const configured = state.remoteProfile?.translateIncomingTo;
  if (configured === "es" || configured === "en") return configured;
  return sourceLang === "es" ? "en" : "es";
}

function labelForLanguage(code) {
  return code === "es" ? "Spanish" : "English";
}

function startRingback() {
  if (state.ringbackTimer) return;
  try {
    state.ringtoneCtx = state.ringtoneCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (state.ringtoneCtx.state === "suspended") {
      if (!state.audioUnlockHintShown) {
        setStatus(els.callStatus, "Tap anywhere once to enable call tones.");
        state.audioUnlockHintShown = true;
      }
      return;
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
    logDebug("auto translation start failed • no microphone track");
    setStatus(els.callStatus, "No microphone stream available for auto translation.");
    return;
  }
  try {
    state.autoTranslateOn = true;
    startSpeechGate();
    startAudioCapture();
    logDebug(`auto translation started • wav capture @ ${state.captureSampleRate}Hz`);
    setStatus(els.callStatus, "Connected • Auto translation on (server STT)");
  } catch (err) {
    state.autoTranslateOn = false;
    stopAudioCapture();
    logDebug(`auto translation failed to start capture • ${err?.message || "unknown error"}`);
    setStatus(els.callStatus, "Auto translation failed to start.");
  }
}

function stopAutoTranslate() {
  state.autoTranslateOn = false;
  logDebug("auto translation stopped");
  state.lastTranscript = "";
  state.transcribeBusy = false;
  stopSpeechGate();
  stopAudioCapture();
}

function startAudioCapture() {
  stopAudioCapture();
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) {
    throw new Error("AudioContext unavailable");
  }

  const ctx = new Ctx({ sampleRate: state.captureSampleRate });
  const source = ctx.createMediaStreamSource(new MediaStream(state.localStream.getAudioTracks()));
  const processor = ctx.createScriptProcessor(4096, 1, 1);

  state.captureContext = ctx;
  state.captureSource = source;
  state.captureProcessor = processor;
  state.captureChunks = [];
  state.captureChunkSamples = 0;
  state.captureSampleRate = ctx.sampleRate || 16_000;

  processor.onaudioprocess = (event) => {
    if (!state.autoTranslateOn) return;
    const input = event.inputBuffer.getChannelData(0);
    const copy = new Float32Array(input.length);
    copy.set(input);
    state.captureChunks.push(copy);
    state.captureChunkSamples += copy.length;
  };

  source.connect(processor);
  processor.connect(ctx.destination);

  state.captureFlushTimer = window.setInterval(() => {
    flushCapturedAudioChunk().catch((err) => {
      logDebug(`stt/translation pipeline failed • ${err?.message || "unknown error"}`);
      state.transcribeBusy = false;
    });
  }, 2400);
}

function stopAudioCapture() {
  if (state.captureFlushTimer) {
    window.clearInterval(state.captureFlushTimer);
    state.captureFlushTimer = null;
  }
  if (state.captureProcessor) {
    try {
      state.captureProcessor.disconnect();
    } catch {
      // Ignore disconnect errors.
    }
    state.captureProcessor.onaudioprocess = null;
  }
  if (state.captureSource) {
    try {
      state.captureSource.disconnect();
    } catch {
      // Ignore disconnect errors.
    }
  }
  if (state.captureContext) {
    state.captureContext.close().catch(() => {});
  }

  state.captureContext = null;
  state.captureSource = null;
  state.captureProcessor = null;
  state.captureChunks = [];
  state.captureChunkSamples = 0;
}

async function flushCapturedAudioChunk() {
  if (!state.autoTranslateOn) return;
  if (!state.captureChunks.length || state.captureChunkSamples < 2048) {
    logDebug(`audio chunk skipped • too small (${state.captureChunkSamples} samples)`);
    state.captureChunks = [];
    state.captureChunkSamples = 0;
    return;
  }
  if (!shouldSendAudioChunkForTranscription()) {
    logDebug("audio chunk skipped • no recent speech detected");
    state.captureChunks = [];
    state.captureChunkSamples = 0;
    return;
  }
  if (state.transcribeBusy) {
    logDebug("audio chunk skipped • STT already in progress");
    state.captureChunks = [];
    state.captureChunkSamples = 0;
    return;
  }

  const pcm = mergeFloat32Chunks(state.captureChunks, state.captureChunkSamples);
  state.captureChunks = [];
  state.captureChunkSamples = 0;

  const wavBlob = encodeWavBlob(pcm, state.captureSampleRate);
  state.transcribeBusy = true;
  try {
    logDebug(`stt request started • wav=${wavBlob.size} bytes`);
    const spokenRaw = await transcribeAudioBlob(wavBlob);
    const spoken = sanitizeTranscript(spokenRaw, state.profile?.language || "en");
    if (!spoken) {
      logDebug("stt returned empty text");
      return;
    }
    logDebug(`stt response text • "${spoken.slice(0, 80)}"`);
    if (spoken === state.lastTranscript) {
      logDebug("stt duplicate ignored");
      return;
    }
    state.lastTranscript = spoken;
    await performTranslationFromText(spoken);
  } finally {
    state.transcribeBusy = false;
  }
}

function mergeFloat32Chunks(chunks, totalLength) {
  const merged = new Float32Array(totalLength);
  let offset = 0;
  chunks.forEach((chunk) => {
    merged.set(chunk, offset);
    offset += chunk.length;
  });
  return merged;
}

function sanitizeTranscript(text, lang) {
  const value = String(text || "").trim();
  if (!value) return "";

  const normalizedLang = lang === "es" ? "es" : "en";
  const hasLatin = /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/.test(value);
  const hasCjk = /[\u3400-\u9FFF]/.test(value);
  const hasHangul = /[\uAC00-\uD7AF]/.test(value);
  const hasKana = /[\u3040-\u30FF]/.test(value);

  if ((hasCjk || hasHangul || hasKana) && !hasLatin) {
    logDebug(`stt transcript ignored • unexpected script for ${normalizedLang}: "${value.slice(0, 40)}"`);
    return "";
  }

  return value;
}

function encodeWavBlob(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function writeAscii(view, offset, text) {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
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

function startRingingTimeout(callId, targetId, receiverUid) {
  clearRingingTimeout();
  state.ringingTimeoutTimer = window.setTimeout(async () => {
    if (!state.currentCallId || state.currentCallId !== callId) return;
    try {
      const callRef = doc(db, "calls", callId);
      const snap = await getDoc(callRef);
      if (!snap.exists()) return;
      const data = snap.data() || {};
      if (!["ringing", "connecting"].includes(String(data.status || "")) || data.answer) {
        return;
      }

      let endedReason = "no_answer_timeout";
      try {
        const receiverSnap = await getDoc(doc(db, "users", receiverUid));
        endedReason = inferNoAnswerReason(data, receiverSnap.exists() ? receiverSnap.data() : null);
      } catch {
        endedReason = inferNoAnswerReason(data, null);
      }

      await updateDoc(doc(db, "calls", callId), {
        status: "ended",
        endedAt: serverTimestamp(),
        endedReason,
      });
      setStatus(els.callStatus, `${targetId} did not connect in time. Call ended.`);
    } catch {
      // Ignore timeout update errors.
    }
  }, 35000);
}

function inferNoAnswerReason(callData, receiverProfile) {
  if (callData?.receiverAcceptedAt && !callData?.answer) {
    return "receiver_media_setup_failed";
  }
  if (callData?.receiverSeenAt && !callData?.receiverAcceptedAt) {
    return "receiver_no_action";
  }

  const presenceState = String(receiverProfile?.presenceState || "");
  const lastSeenMs = toMillis(receiverProfile?.lastSeenAt || receiverProfile?.presenceUpdatedAt);
  const stale = !lastSeenMs || Date.now() - lastSeenMs > 45000;
  if (presenceState === "offline" || presenceState === "background" || stale) {
    return "receiver_offline_or_background";
  }
  return "no_answer_timeout";
}

function markIncomingSeen(callId) {
  if (!state.user || !callId) return;
  updateDoc(doc(db, "calls", callId), {
    receiverSeenAt: serverTimestamp(),
    receiverSeenSessionId: DASH_SESSION_ID,
    receiverPresenceState: getPresenceState(),
  }).catch(() => {});
}

function getPresenceState() {
  if (!navigator.onLine) return "offline";
  return document.visibilityState === "visible" ? "online" : "background";
}

async function syncPresence() {
  if (!state.user) return;
  await setDoc(
    doc(db, "users", state.user.uid),
    {
      presenceState: getPresenceState(),
      presenceUpdatedAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
      presenceSessionId: DASH_SESSION_ID,
      presenceUserAgent: String(navigator.userAgent || "").slice(0, 160),
    },
    { merge: true }
  );
}

function startPresenceHeartbeat() {
  stopPresenceHeartbeat().catch(() => {});
  syncPresence().catch(() => {});
  state.presenceHeartbeatTimer = window.setInterval(() => {
    syncPresence().catch(() => {});
  }, 20000);
}

async function stopPresenceHeartbeat() {
  if (state.presenceHeartbeatTimer) {
    window.clearInterval(state.presenceHeartbeatTimer);
    state.presenceHeartbeatTimer = null;
  }
  if (!state.user) return;
  await setDoc(
    doc(db, "users", state.user.uid),
    {
      presenceState: "background",
      presenceUpdatedAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
      presenceSessionId: DASH_SESSION_ID,
    },
    { merge: true }
  );
}

function markPresenceBestEffort(presenceState) {
  if (!state.user) return;
  setDoc(
    doc(db, "users", state.user.uid),
    {
      presenceState,
      presenceUpdatedAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
      presenceSessionId: DASH_SESSION_ID,
    },
    { merge: true }
  ).catch(() => {});
}

function clearRingingTimeout() {
  if (state.ringingTimeoutTimer) {
    window.clearTimeout(state.ringingTimeoutTimer);
    state.ringingTimeoutTimer = null;
  }
}

function setRemoteAvatarLabel(peerId) {
  const label = formatPeerDisplayName(peerId).slice(0, 18);
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

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function formatPeerDisplayName(peerId) {
  const raw = String(peerId || "").trim();
  if (!raw) return "Remote";

  const contact = state.contacts.find((c) => normalizeCallId(c.callId || "") === normalizeCallId(raw));
  const source = String(contact?.name || raw).trim();
  const first = source.split(/[\s._-]+/).filter(Boolean)[0] || source;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function unlockAudioContextFromGesture() {
  try {
    state.ringtoneCtx = state.ringtoneCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (state.ringtoneCtx.state === "suspended") {
      state.ringtoneCtx.resume().catch(() => {});
    }
    if (state.ringtoneCtx.state === "running") {
      state.audioUnlocked = true;
    }
  } catch {
    // Ignore gesture unlock failures.
  }
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

async function transcribeAudioBlob(blob) {
  if (!apiBaseUrl) {
    throw new Error("Backend API URL is not configured");
  }
  const form = new FormData();
  const ext = blob.type.includes("wav") ? "wav" : blob.type.includes("mp4") ? "m4a" : "webm";
  form.append("audio", blob, `chunk.${ext}`);
  form.append("lang", state.profile?.language || "en");

  const headers = await getAuthHeaders();
  const resp = await fetch(apiUrl("/api/transcribe"), {
    method: "POST",
    headers,
    body: form,
  });

  if (!resp.ok) {
    let details = "";
    try {
      const data = await resp.json();
      details = String(data?.error || "").trim();
    } catch {
      details = "";
    }
    throw new Error(
      `Transcription endpoint failed (${resp.status})${details ? `: ${details}` : ""}`
    );
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
    if (!resp.ok) {
      let details = "";
      try {
        const data = await resp.json();
        details = String(data?.error || "").trim();
      } catch {
        details = "";
      }
      throw new Error(
        `Translation request failed (${resp.status})${details ? `: ${details}` : ""}`
      );
    }
    const data = await resp.json();
    const out = String(data?.translatedText || "").trim();
    if (!out) return null;
    return out;
  } catch (err) {
    logDebug(`translation request failed • ${err?.message || "unknown error"}`);
    return null;
  }
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
  if (!apiBaseUrl) {
    state.turnIceServers = defaultIceServers;
    state.turnExpiresAtMs = now + 10 * 60_000;
    return state.turnIceServers;
  }
  if (state.turnIceServers?.length && now < state.turnExpiresAtMs - 60_000) {
    return state.turnIceServers;
  }
  if (now < state.turnDisabledUntilMs) {
    if (!state.turnIceServers?.length) {
      state.turnIceServers = defaultIceServers;
      state.turnExpiresAtMs = state.turnDisabledUntilMs;
    }
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
    state.turnFailureNotified = false;
    return servers;
  })();

  try {
    return await state.turnFetchPromise;
  } catch (err) {
    const msg = String(err?.message || "").toLowerCase();
    const likelyNetworkOrCors =
      msg.includes("failed to fetch") ||
      msg.includes("cors") ||
      msg.includes("networkerror") ||
      msg.includes("certificate") ||
      msg.includes("ssl");

    // Back off retries after CORS/TLS/network failures from remote TURN endpoints.
    state.turnDisabledUntilMs = now + (likelyNetworkOrCors ? 10 * 60_000 : 2 * 60_000);
    if (!state.turnIceServers?.length) {
      state.turnIceServers = defaultIceServers;
      state.turnExpiresAtMs = now + 120_000;
    }
    if (!state.turnFailureNotified) {
      setStatus(els.callStatus, "TURN unavailable right now. Using fallback connectivity.");
      state.turnFailureNotified = true;
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
