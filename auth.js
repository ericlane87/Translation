import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { auth, db } from "./firebase-client.js?v=20260314-1";

const els = {
  loginEmail: byId("loginEmail"),
  loginPassword: byId("loginPassword"),
  loginBtn: byId("loginBtn"),
  signupEmail: byId("signupEmail"),
  signupPassword: byId("signupPassword"),
  signupPassword2: byId("signupPassword2"),
  signupCallId: byId("signupCallId"),
  signupLanguage: byId("signupLanguage"),
  signupIncomingLanguage: byId("signupIncomingLanguage"),
  signupBtn: byId("signupBtn"),
  authStatus: byId("authStatus"),
};

onAuthStateChanged(auth, (user) => {
  if (user) {
    window.location.href = "dashboard.html";
  }
});

if (window.location.hash === "#signup") {
  window.location.href = "signup.html";
}

els.loginBtn?.addEventListener("click", login);
els.signupBtn?.addEventListener("click", signup);

async function login() {
  const email = els.loginEmail.value.trim();
  const password = els.loginPassword.value.trim();

  if (!email || !password) {
    setStatus("Enter email and password");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
    window.location.href = "dashboard.html";
  } catch (err) {
    setStatus(`Login failed: ${err.message}`);
  }
}

async function signup() {
  const email = els.signupEmail.value.trim();
  const password = els.signupPassword.value.trim();
  const password2 = els.signupPassword2.value.trim();
  const callId = normalizeCallId(els.signupCallId.value);
  const language = els.signupLanguage.value;
  const translateIncomingTo = els.signupIncomingLanguage.value;

  if (!email || !password || !password2 || !callId) {
    setStatus("Fill all signup fields including call ID");
    return;
  }

  if (password !== password2) {
    setStatus("Passwords do not match");
    return;
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = cred.user.uid;
    await cred.user.getIdToken(true);

    const userRef = doc(db, "users", uid);
    const callIdRef = doc(db, "callIds", callId);

    await createProfileAndId({
      userRef,
      callIdRef,
      uid,
      email,
      callId,
      language,
      translateIncomingTo,
    });

    window.location.href = "dashboard.html";
  } catch (err) {
    console.error("Signup failed", err);
    // Keep the auth user so we can recover manually if Firestore write fails.
    setStatus(`Signup failed: ${err.message}`);
  }
}

async function createProfileAndId(payload) {
  const {
    userRef,
    callIdRef,
    uid,
    email,
    callId,
    language,
    translateIncomingTo,
  } = payload;

  try {
    await runTransaction(db, async (txn) => {
      const callIdSnap = await txn.get(callIdRef);
      if (callIdSnap.exists()) {
        throw new Error("Call ID is already taken");
      }

      const existingUser = await txn.get(userRef);
      if (existingUser.exists()) {
        throw new Error("User profile already exists");
      }

      txn.set(callIdRef, { uid, createdAt: serverTimestamp() });
      txn.set(userRef, {
        email,
        callId,
        language,
        translateIncomingTo,
        createdAt: serverTimestamp(),
      });
    });
  } catch (err) {
    // Retry once with non-transactional writes after auth token propagation.
    if (String(err?.message || "").toLowerCase().includes("permission")) {
      await new Promise((r) => setTimeout(r, 600));
      const latestCallId = await getDoc(callIdRef);
      if (latestCallId.exists()) {
        throw new Error("Call ID is already taken");
      }

      await setDoc(callIdRef, { uid, createdAt: serverTimestamp() });
      await setDoc(userRef, {
        email,
        callId,
        language,
        translateIncomingTo,
        createdAt: serverTimestamp(),
      });
      return;
    }
    throw err;
  }
}

function byId(id) {
  return document.getElementById(id);
}

function setStatus(message) {
  els.authStatus.textContent = message;
}

function normalizeCallId(input) {
  const cleaned = (input || "").trim().toLowerCase();
  if (!/^[a-z0-9_-]{3,24}$/.test(cleaned)) return "";
  return cleaned;
}
