window.VOICEBRIDGE_CONFIG = Object.assign(
  {
    // Leave blank to run browser-only (STUN fallback, no backend API dependency).
    API_BASE_URL: "",
  },
  window.VOICEBRIDGE_CONFIG || {}
);
