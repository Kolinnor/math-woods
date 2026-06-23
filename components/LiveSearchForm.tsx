"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, ReactNode, useRef, useTransition } from "react";

type LiveSearchFormProps = {
  action?: string;
  children: ReactNode;
  className?: string;
  debounceMs?: number;
};

export function LiveSearchForm({ action, children, className, debounceMs = 250 }: LiveSearchFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

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
        {isPending ? "Updating results" : ""}
      </span>
    </form>
  );
}
