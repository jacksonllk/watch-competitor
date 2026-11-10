import { checkAddress } from "@/lib/find-pages";
import { jsonBody, text } from "@/lib/server";

/** Checks an address the user typed for a watch. Free: plain requests to that site, no context.dev call. */
export async function POST(request: Request) {
  const body = await jsonBody(request);
  const url = await checkAddress(text(body?.url, 2000));
  return Response.json(url ? { status: "ok", url } : { status: "not_found" });
}
