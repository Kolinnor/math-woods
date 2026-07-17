"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, ReactNode, useEffect, useRef, useTransition } from "react";

type LiveSearchFormProps = {
  action?: string;
  children: ReactNode;
  className?: string;
  debounceMs?: number;
  persistKey?: string;
  updatingLabel?: string;
};

export function LiveSearchForm({
  action,
  children,
  className,
  debounceMs = 250,
  persistKey,
  updatingLabel = "Updating results"
}: LiveSearchFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const restoredRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!persistKey || restoredRef.current) return;
    restoredRef.current = true;

    const storageKey = `math-woods:filters:${persistKey}`;
    const currentQuery = searchParams.toString();
    if (currentQuery) {
      sessionStorage.setItem(storageKey, currentQuery);
      return;
    }

    const savedQuery = sessionStorage.getItem(storageKey);
    if (!savedQuery) return;
    const targetPath = action || pathname;
    startTransition(() => router.replace(`${targetPath}?${savedQuery}` as never, { scroll: false }));
  }, [action, pathname, persistKey, router, searchParams]);

  useEffect(() => {
    if (!persistKey) return;
    const currentQuery = searchParams.toString();
    if (currentQuery) sessionStorage.setItem(`math-woods:filters:${persistKey}`, currentQuery);
  }, [persistKey, searchParams]);

  const updateUrl = () => {
    const form = formRef.current;
    if (!form) return;

    const targetPath = action || pathname;
    const nextParams = targetPath === pathname ? new URLSearchParams(searchParams.toString()) : new URLSearchParams();
    const namedControls = Array.from(form.elements).filter((element): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement => {
      return "name" in element && Boolean(element.name) && element instanceof HTMLElement;
    });
    const names = new Set(namedControls.map((element) => element.name));
    for (const name of names) nextParams.delete(name);
    if (!names.has("page")) nextParams.delete("page");

    const data = new FormData(form);
    for (const [name, value] of data.entries()) {
      const stringValue = String(value).trim();
      if (stringValue) nextParams.append(name, stringValue);
    }

    const query = nextParams.toString();
    const nextUrl = query ? `${targetPath}?${query}` : targetPath;
    if (persistKey) {
      const storageKey = `math-woods:filters:${persistKey}`;
      if (query) sessionStorage.setItem(storageKey, query);
      else sessionStorage.removeItem(storageKey);
    }
    startTransition(() => router.replace(nextUrl as never, { scroll: false }));
  };

  const scheduleUpdate = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(updateUrl, debounceMs);
  };

  const submitNow = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (timerRef.current) clearTimeout(timerRef.current);
    updateUrl();
  };

  return (
    <form
      ref={formRef}
      action={action}
      aria-busy={isPending}
      className={className}
      onChange={scheduleUpdate}
      onInput={scheduleUpdate}
      onSubmit={submitNow}
    >
      {children}
      <span className="sr-only" role="status" aria-live="polite">
        {isPending ? updatingLabel : ""}
      </span>
    </form>
  );
}
