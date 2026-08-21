import { observabilityMetrics } from "@/lib/observability-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const registry = observabilityMetrics().registry;
  return new Response(await registry.metrics(), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": registry.contentType
    }
  });
}
