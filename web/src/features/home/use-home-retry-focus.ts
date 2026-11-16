import { useEffect, useRef } from "react";

// Preserve keyboard focus when a failed homepage section is retried.
// Section content and request lifecycles remain feature-owned.
export function useHomeRetryFocus(status: "loading" | "ready" | "failed", retry: () => void) {
  const sectionRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusAfterRetry = useRef(false);

  useEffect(() => {
    if (!focusAfterRetry.current) return;
    if (status === "loading") {
      sectionRef.current?.focus();
    } else {
      headingRef.current?.focus();
      focusAfterRetry.current = false;
    }
  }, [status]);

  function retrySection() {
    focusAfterRetry.current = true;
    retry();
  }

  return { sectionRef, headingRef, retrySection };
}
