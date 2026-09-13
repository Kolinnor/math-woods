import { jsxGraphFrameDocument } from "../lib/jsxgraph-frame";

export function mountHtmlFigure(
  holder: HTMLElement,
  html: string,
  isCancelled: () => boolean,
  onRuntimeError: (message: string) => void
): Promise<{ dispose: () => void } | null> {
  if (isCancelled()) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.title = "Figure mathématique interactive";
    frame.setAttribute("sandbox", "allow-scripts");
    frame.referrerPolicy = "no-referrer";
    frame.style.cssText = "display:block;width:100%;height:480px;border:0;";
    let disposed = false, settled = false, ready = false, inView = true;
    let timeout = 0, cancellation = 0;
    const appearance = window.matchMedia("(prefers-color-scheme: dark)");
    const currentTheme = (): "light" | "dark" => {
      const scheme = getComputedStyle(document.documentElement).colorScheme;
      return scheme === "dark" ? "dark" : scheme === "light" ? "light" : appearance.matches ? "dark" : "light";
    };
    const send = (type: string, payload: Record<string, unknown> = {}) => {
      if (!disposed && ready) frame.contentWindow?.postMessage({ channel: "mathwoods-figure", type, ...payload }, "*");
    };
    const syncTheme = () => send("theme", { theme: currentTheme() });
    const syncActivity = () => send("visibility", { visible: inView && !document.hidden });
    const themeObserver = new MutationObserver(syncTheme);
    const visibilityObserver = typeof IntersectionObserver === "function" ? new IntersectionObserver(([entry]) => {
      if (!entry) return;
      inView = entry.isIntersecting;
      syncActivity();
    }) : null;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      window.clearTimeout(timeout);
      window.clearInterval(cancellation);
      window.removeEventListener("message", message);
      document.removeEventListener("visibilitychange", syncActivity);
      appearance.removeEventListener("change", syncTheme);
      themeObserver.disconnect();
      visibilityObserver?.disconnect();
      frame.remove();
      if (!settled) { settled = true; resolve(null); }
    };
    const fail = (detail: string) => {
      if (disposed) return;
      const wasReady = ready;
      settled = true;
      dispose();
      if (wasReady) onRuntimeError(detail);
      else reject(new Error(detail));
    };
    const message = (event: MessageEvent) => {
      if (disposed || event.source !== frame.contentWindow || !event.data || typeof event.data !== "object" || event.data.channel !== "mathwoods-figure") return;
      if (isCancelled()) { dispose(); return; }
      if (event.data.type === "error") {
        fail(typeof event.data.message === "string" ? event.data.message.slice(0, 400) : "La figure n’a pas pu être chargée.");
      } else if (event.data.type === "size" && Number.isFinite(event.data.height)) {
        const height = `${Math.min(1400, Math.max(220, Math.ceil(event.data.height)))}px`;
        if (frame.style.height !== height) frame.style.height = height;
      } else if (event.data.type === "ready" && !settled) {
        ready = true;
        settled = true;
        window.clearTimeout(timeout);
        window.clearInterval(cancellation);
        holder.setAttribute("aria-busy", "false");
        syncTheme();
        syncActivity();
        resolve({ dispose });
      }
    };
    window.addEventListener("message", message);
    document.addEventListener("visibilitychange", syncActivity);
    appearance.addEventListener("change", syncTheme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
    visibilityObserver?.observe(holder);
    timeout = window.setTimeout(() => fail("Le chargement de la figure a dépassé le délai prévu."), 10_000);
    cancellation = window.setInterval(() => { if (isCancelled()) dispose(); }, 200);
    frame.srcdoc = jsxGraphFrameDocument(html, currentTheme());
    holder.replaceChildren(frame);
  });
}
