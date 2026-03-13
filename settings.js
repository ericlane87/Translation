import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  getDoc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db } from "./firebase-client.js";

const els = {
  logoutBtn: byId("logoutBtn"),
  settingsEmail: byId("settingsEmail"),
  settingsCallId: byId("settingsCallId"),
  languageSelect: byId("languageSelect"),
  incomingLanguageSelect: byId("incomingLanguageSelect"),
  saveSettingsBtn: byId("saveSettingsBtn"),
  settingsStatus: byId("settingsStatus"),
};

let currentUid = "";

els.logoutBtn?.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "auth.html";
});

els.saveSettingsBtn?.addEventListener("click", saveSettings);

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "auth.html";
    return;
  }

  currentUid = user.uid;
  els.settingsEmail.textContent = user.email || "-";
  await loadProfile(user.uid);
});

async function loadProfile(uid) {
  setStatus("Loading your settings...");

  try {
    const profileSnap = await getDoc(doc(db, "users", uid));
    if (!profileSnap.exists()) {
      setStatus("Profile not found. Finish setup from the dashboard first.");
      return;
    }

    const profile = profileSnap.data();
    const language = profile.language === "es" ? "es" : "en";
    const incomingLanguage = profile.translateIncomingTo === "es" ? "es" : "en";

    els.settingsCallId.textContent = `ID: ${profile.callId || "-"}`;
    els.languageSelect.value = language;
    els.incomingLanguageSelect.value = incomingLanguage;
    setStatus("Review your preferences and save any changes.");
  } catch (err) {
    setStatus(`Could not load settings: ${err?.message || "unknown error"}`);
  }
}

async function saveSettings() {
  if (!currentUid) {
    setStatus("You must be signed in to update settings.");
    return;
  }

  const language = els.languageSelect.value === "es" ? "es" : "en";
  const translateIncomingTo = els.incomingLanguageSelect.value === "es" ? "es" : "en";

  setStatus("Saving settings...");

  try {
    await updateDoc(doc(db, "users", currentUid), {
      language,
      translateIncomingTo,
    });
    setStatus("Settings saved.");
  } catch (err) {
    setStatus(`Could not save settings: ${err?.message || "unknown error"}`);
  }
}

function byId(id) {
  return document.getElementById(id);
}

function setStatus(message) {
  if (els.settingsStatus) {
    els.settingsStatus.textContent = message;
  }
}
