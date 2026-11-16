const sessionEvent = "eneba:session-change";

// Only an invalidation signal crosses tabs. Credentials and protected data stay
// out of browser storage; the server remains the authority for the next read.
export function announceSessionChange() {
  window.dispatchEvent(new Event(sessionEvent));
  try {
    localStorage.setItem(sessionEvent, crypto.randomUUID());
  } catch {
    /* Storage may be disabled. Focus revalidation still works. */
  }
}

export function watchSessionChanges(invalidate: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === sessionEvent || event.key === null) invalidate();
  };
  window.addEventListener(sessionEvent, invalidate);
  window.addEventListener("storage", storage);
  window.addEventListener("focus", invalidate);
  window.addEventListener("pageshow", invalidate);
  document.addEventListener("visibilitychange", invalidate);
  return () => {
    window.removeEventListener(sessionEvent, invalidate);
    window.removeEventListener("storage", storage);
    window.removeEventListener("focus", invalidate);
    window.removeEventListener("pageshow", invalidate);
    document.removeEventListener("visibilitychange", invalidate);
  };
}
