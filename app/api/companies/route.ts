import { loadCompetitors } from "@/lib/competitors";
import { searchCompanies } from "@/lib/preview";
import { jsonBody, setup, setupError, text } from "@/lib/server";

/**
 * Company search for the Add panel. 1 credit per new search on the Free plan, cached for 24 hours.
 * Also says which results are already watched, by domain, with their slug.
 */
export async function POST(request: Request) {
  const ready = setup();
  if (!ready.ok) return setupError(ready.problem);
  const body = await jsonBody(request);
  const [result, competitors] = await Promise.all([searchCompanies(ready.store, ready.api, text(body?.query, 100)), loadCompetitors(ready.store)]);
  const watching = Object.fromEntries(competitors.filter((c) => c.status === "watching").map((c) => [c.domain, c.slug]));
  return Response.json({ ...result, watching });
}
