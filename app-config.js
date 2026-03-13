(() => {
  const storageKey = "VOICEBRIDGE_API_BASE_URL";
  const existing = window.VOICEBRIDGE_CONFIG || {};

  const queryValue = (() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return String(params.get("apiBaseUrl") || "").trim();
    } catch {
      return "";
    }
  })();

  const storedValue = (() => {
    try {
      return String(window.localStorage.getItem(storageKey) || "").trim();
    } catch {
      return "";
    }
  })();

  const configValue = String(existing.API_BASE_URL || "").trim();
  const sameOriginValue = (() => {
    const host = String(window.location.hostname || "").toLowerCase();
    if (!window.location.origin || host === "localhost" || host === "127.0.0.1") {
      return "";
    }
    if (host.endsWith(".github.io")) {
      return "";
    }
    return window.location.origin;
  })();

  const apiBaseUrl = queryValue || storedValue || configValue || sameOriginValue || "";

  if (queryValue) {
    try {
      window.localStorage.setItem(storageKey, queryValue);
    } catch {
      // Ignore storage failures and keep runtime-only value.
    }
  }

  window.VOICEBRIDGE_CONFIG = Object.assign(
    {
      // For static hosting, set this to your deployed backend URL.
      API_BASE_URL: apiBaseUrl,
      API_BASE_STORAGE_KEY: storageKey,
    },
    existing
  );
})();
