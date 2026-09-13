// This policy precedes all authored markup. Later meta policies can only restrict it.
// Scripts run in an opaque-origin iframe; never grant allow-same-origin.
const CDN_SOURCES = "https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://jsxgraph.org";
export const FIGURE_CSP = `default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' ${CDN_SOURCES}; style-src 'unsafe-inline' ${CDN_SOURCES}; img-src data: blob:; font-src data: ${CDN_SOURCES}; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;

export function jsxGraphFrameDocument(source: string, theme: "light" | "dark") {
  // Leave head open: full documents can contribute their head metadata, while a
  // fragment's first body element closes it implicitly. Keep authored script order.
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${FIGURE_CSP}">
<meta name="referrer" content="no-referrer">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>html{color-scheme:${theme}}body{margin:0}</style>
<script>
(() => {
  const send = (type, detail = {}) => parent.postMessage({channel:'mathwoods-figure', type, ...detail}, '*');
  let failed = false, scheduled = false, lastHeight = 0;
  function reportError(message) {
    if (failed) return;
    failed = true;
    send('error', {message: String(message).slice(0, 400)});
  }
  addEventListener('error', event => {
    if (event.target instanceof HTMLScriptElement || event.target instanceof HTMLLinkElement) {
      reportError('Une ressource de la figure n’a pas pu être chargée. Vérifiez son adresse et la connexion.');
    } else if (event.message) reportError(event.message);
  }, true);
  addEventListener('unhandledrejection', event => reportError(event.reason instanceof Error ? event.reason.message : 'Une erreur JavaScript empêche la figure de fonctionner.'));
  addEventListener('message', event => {
    if (event.source !== parent || !event.data || event.data.channel !== 'mathwoods-figure') return;
    if (event.data.type === 'theme' && (event.data.theme === 'light' || event.data.theme === 'dark')) {
      document.documentElement.style.colorScheme = event.data.theme;
    }
    if (event.data.type === 'visibility' && typeof event.data.visible === 'boolean') {
      dispatchEvent(new CustomEvent('mathwoodsvisibilitychange', {detail:{visible:event.data.visible}}));
    }
  });
  function measure() {
    scheduled = false;
    const body = document.body;
    if (!body) return;
    const rect = body.getBoundingClientRect();
    const margin = parseFloat(getComputedStyle(body).marginBottom) || 0;
    const height = Math.min(1400, Math.max(220, Math.ceil(Math.max(rect.bottom + scrollY + margin, body.offsetTop + body.scrollHeight))));
    if (height !== lastHeight) { lastHeight = height; send('size', {height}); }
  }
  function schedule() { if (!scheduled) { scheduled = true; requestAnimationFrame(measure); } }
  addEventListener('load', () => {
    if (failed) return;
    measure();
    if (typeof ResizeObserver === 'function') new ResizeObserver(schedule).observe(document.body);
    addEventListener('resize', schedule);
    send('ready');
  }, {once:true});
})();
</script>
${source}
</body></html>`;
}
