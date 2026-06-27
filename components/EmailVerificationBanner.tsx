"use client";

import { useEffect, useState } from "react";

const CHANNEL_NAME = "math-woods-email-verification";

function verifiedKey(userId: number) {
  return `math-woods-email-verified-user:${userId}`;
}

function announceVerified(userId: number) {
  try {
    window.localStorage.setItem(verifiedKey(userId), String(Date.now()));
  } catch {}

  window.dispatchEvent(new CustomEvent("math-woods-email-verified", { detail: { userId } }));

  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({ type: "verified", userId });
    channel.close();
  } catch {}
}

export function EmailVerificationSuccessSync({ userId }: { userId: number }) {
  useEffect(() => {
    announceVerified(userId);
  }, [userId]);

  return null;
}

export function EmailVerificationBanner({
  userId,
  resendAction
}: {
  userId: number;
  resendAction: () => Promise<void>;
}) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const shouldHide = () => {
      try {
        return Boolean(window.localStorage.getItem(verifiedKey(userId)));
      } catch {
        return false;
      }
    };

    if (shouldHide()) {
      setHidden(true);
    }

    const hideForUser = (eventUserId: unknown) => {
      if (eventUserId === userId) setHidden(true);
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === verifiedKey(userId) && event.newValue) setHidden(true);
    };

    const handleCustomEvent = (event: Event) => {
      hideForUser((event as CustomEvent<{ userId?: number }>).detail?.userId);
    };
    const handleFocus = () => {
      if (shouldHide()) setHidden(true);
    };

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event) => {
        if (event.data?.type === "verified") hideForUser(event.data.userId);
      };
    } catch {}

    window.addEventListener("storage", handleStorage);
    window.addEventListener("math-woods-email-verified", handleCustomEvent);
    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("math-woods-email-verified", handleCustomEvent);
      window.removeEventListener("focus", handleFocus);
      channel?.close();
    };
  }, [userId]);

  if (hidden) return null;

  return (
    <div className="email-verification-banner">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4">
        <p>Verify your email to solve, vote, discuss, and contribute.</p>
        <form action={resendAction}>
          <button type="submit" className="secondary">
            Resend verification email
          </button>
        </form>
      </div>
    </div>
  );
}
