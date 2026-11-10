import { isDemo } from "@/lib/links";
import { addCompetitor, FOCUS_LIMIT } from "@/lib/add-competitor";
import { loadConfig } from "@/lib/config";
import { failureOf } from "@/lib/context";
import { checkAddress, type PageKind } from "@/lib/find-pages";
import { watchForResults } from "@/lib/refresh";
import { jsonBody, readMorePages, setup, setupError, text } from "@/lib/server";
import { webhookUrl } from "@/lib/webhook";

/**
 * Start watching. Creates a monitor per confirmed page (each first check costs 1 credit) and saves the
 * competitor with the news from its preview.
 */
export async function POST(request: Request) {
  // The public demo never creates, checks, removes or deletes anything on its key.
  if (isDemo()) return Response.json({ status: "demo" }, { status: 403 });
  const ready = setup();
  if (!ready.ok) return setupError(ready.problem);
  const body = await jsonBody(request);
  const domain = text(body?.domain, 253);
  if (!domain) return Response.json({ status: "failed" }, { status: 400 });

  // Each page: an address to check again, or null to watch without it.
  const raw = (body?.pages ?? {}) as Record<string, unknown>;
  const pages: Partial<Record<PageKind, string | null>> = {};
  for (const kind of ["pricing", "changelog"] as const) {
    if (raw[kind] === null) pages[kind] = null;
    else if (typeof raw[kind] === "string") {
      const url = await checkAddress(raw[kind] as string);
      if (!url) return Response.json({ status: "page_not_found", kind }, { status: 400 });
      pages[kind] = url;
    }
  }

  // Extra pages from Add more monitors, each checked again. A page that no longer opens stops the add.
  const read = await readMorePages(body?.more);
  if (!read.ok) return Response.json(read.label ? { status: "page_not_found", label: read.label } : { status: "failed" }, { status: 400 });
  const more = read.pages;

  try {
    const config = loadConfig();
    const result = await addCompetitor(
      ready.store,
      ready.api,
      { domain, focus: text(body?.focus, FOCUS_LIMIT), pages, more, news: body?.news !== false },
      {
        instructions: config.instructions,
        schedule: config.schedule,
        webhookUrl: webhookUrl(),
      },
    );
    // Read every 15 seconds until the first checks are done, so the competitor page shows them within seconds.
    if (result.status === "added") await watchForResults(ready.store, new Date(), { firstChecks: true });
    return Response.json(result);
  } catch (error) {
    const failure = failureOf(error);
    if (failure.status === 402) return Response.json({ status: "out_of_credits", nextRefillAt: failure.nextRefillAt }, { status: 402 });
    console.error("Add competitor failed", failure);
    return Response.json({ status: "failed" }, { status: 502 });
  }
}
