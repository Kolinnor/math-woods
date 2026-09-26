// Runs once when a Next.js server starts.
export async function register() {
  // The test must wrap the import: Next.js then leaves the Node.js-only code out of the Edge bundle.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Compute the concept maps in the background, so that the first visitor of /concepts
    // does not wait for the layout.
    const { warmConceptMaps } = await import("./lib/concept-map-data");
    void warmConceptMaps();
  }
}
