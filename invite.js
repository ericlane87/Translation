const params = new URLSearchParams(window.location.search);
const invite = normalizeCallId(params.get("invite") || "");

const els = {
  invitePageTitle: byId("invitePageTitle"),
  invitePageText: byId("invitePageText"),
  inviteLoginLink: byId("inviteLoginLink"),
  inviteSignupLink: byId("inviteSignupLink"),
};

const loginHref = invite ? `auth.html?invite=${encodeURIComponent(invite)}` : "auth.html";
const signupHref = invite ? `signup.html?invite=${encodeURIComponent(invite)}` : "signup.html";

if (els.inviteLoginLink) els.inviteLoginLink.href = loginHref;
if (els.inviteSignupLink) els.inviteSignupLink.href = signupHref;

if (invite) {
  if (els.invitePageTitle) {
    els.invitePageTitle.textContent = `${invite} invited you to connect on VoiceBridge.`;
  }
  if (els.invitePageText) {
    els.invitePageText.textContent =
      "Log in or create your account to call them right away or save them to your contacts.";
  }
}

function byId(id) {
  return document.getElementById(id);
}

function normalizeCallId(input) {
  const cleaned = String(input || "").trim().toLowerCase();
  if (!/^[a-z0-9_-]{3,24}$/.test(cleaned)) return "";
  return cleaned;
}
