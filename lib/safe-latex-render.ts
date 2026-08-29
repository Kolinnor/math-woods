export function withLatexRenderFallback<T>(render: () => T, fallback: (error: unknown) => T): T {
  try {
    return render();
  } catch (error) {
    return fallback(error);
  }
}
