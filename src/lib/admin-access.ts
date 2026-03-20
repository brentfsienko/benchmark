import { getRequestActor } from "@/src/lib/request-auth";

export async function isRequestAdmin(): Promise<boolean> {
  const actor = await getRequestActor();
  return Boolean(actor?.isAdmin);
}
