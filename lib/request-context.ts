import "server-only";

import { headers } from "next/headers";
import { clientAddressFromHeaders } from "@/lib/request-security";

export async function currentClientAddress() {
  return clientAddressFromHeaders(await headers());
}
