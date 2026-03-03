import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBnjN4tk9agXnZz0-h4rDmieNWSnk3YFxA",
  authDomain: "translator-17aa3.firebaseapp.com",
  projectId: "translator-17aa3",
  storageBucket: "translator-17aa3.firebasestorage.app",
  messagingSenderId: "195252961215",
  appId: "1:195252961215:web:fc244a48b5cc1e886a2b0a",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
