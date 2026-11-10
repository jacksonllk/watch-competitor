import { describe, expect, it } from "vitest";
import { accepts, findPage, findPages, isPrivateAddress, resolve, type FetchHop, type Hop } from "@/lib/find-pages";

/** A made-up web: address -> answer. Anything not listed answers 404. */
function fakeWeb(routes: Record<string, Hop | null>): FetchHop {
  return async (url) => (url.href in routes ? routes[url.href] : { status: 404, location: null });
}
const ok: Hop = { status: 200, location: null };
const redirect = (location: string): Hop => ({ status: 301, location });

describe("findPages", () => {
  it("finds the pricing page and changelog on the main site", async () => {
    const web = fakeWeb({ "https://acme.example/pricing": ok, "https://acme.example/changelog": ok });
    expect(await findPages("acme.example", web)).toEqual({
      pricing: { url: "https://acme.example/pricing", others: [] },
      changelog: { url: "https://acme.example/changelog", others: [] },
    });
  });

  it("follows redirects and keeps the final address (like e2b.dev/changelog -> /product-updates)", async () => {
    const web = fakeWeb({
      "https://acme.example/changelog": redirect("/product-updates"),
      "https://acme.example/product-updates": ok,
    });
    expect((await findPages("acme.example", web)).changelog).toEqual({ url: "https://acme.example/product-updates", others: [] });
  });

  it("follows a redirect to www", async () => {
    const web = fakeWeb({
      "https://acme.example/pricing": redirect("https://www.acme.example/pricing"),
      "https://www.acme.example/pricing": ok,
    });
    expect((await findPages("acme.example", web)).pricing?.url).toBe("https://www.acme.example/pricing");
  });

  it("rejects a changelog address that lands on the home page (like changelog.daytona.io)", async () => {
    const web = fakeWeb({
      "https://changelog.acme.example/": redirect("https://www.acme.example/"),
      "https://www.acme.example/": ok,
    });
    expect((await findPages("acme.example", web)).changelog).toBeNull();
  });

  it("accepts a changelog site of its own", async () => {
    const web = fakeWeb({ "https://changelog.acme.example/": ok });
    expect((await findPages("acme.example", web)).changelog?.url).toBe("https://changelog.acme.example/");
  });

  it("rejects a page on another site", async () => {
    const web = fakeWeb({
      "https://acme.example/pricing": redirect("https://other.example/pricing"),
      "https://other.example/pricing": ok,
    });
    expect((await findPages("acme.example", web)).pricing).toBeNull();
  });

  it("lists one page once when several addresses land on it", async () => {
    const web = fakeWeb({
      "https://acme.example/changelog": redirect("/product-updates"),
      "https://changelog.acme.example/": redirect("https://acme.example/product-updates/"),
      "https://acme.example/product-updates": ok,
      "https://acme.example/product-updates/": ok,
    });
    expect((await findPages("acme.example", web)).changelog).toEqual({ url: "https://acme.example/product-updates", others: [] });
  });

  it("prefers the main site and offers the docs changelog as another choice (like E2B)", async () => {
    const web = fakeWeb({
      "https://acme.example/docs/changelog": redirect("https://docs.acme.example/changelog"),
      "https://docs.acme.example/changelog": ok,
      "https://acme.example/product-updates": ok,
    });
    expect((await findPages("acme.example", web)).changelog).toEqual({
      url: "https://acme.example/product-updates",
      others: ["https://docs.acme.example/changelog"],
    });
  });

  it("finds nothing when every address is missing or blocked", async () => {
    const blocked = fakeWeb({ "https://acme.example/pricing": null, "https://acme.example/plans": { status: 403, location: null } });
    expect(await findPages("acme.example", blocked)).toEqual({ pricing: null, changelog: null });
  });

  it("treats www. in the input as the same site", async () => {
    const web = fakeWeb({ "https://acme.example/pricing": ok });
    expect((await findPages("www.acme.example", web)).pricing?.url).toBe("https://acme.example/pricing");
  });
});

describe("resolve", () => {
  it("gives up on a redirect loop", async () => {
    const web = fakeWeb({ "https://acme.example/a": redirect("/b"), "https://acme.example/b": redirect("/a") });
    expect(await resolve(new URL("https://acme.example/a"), web)).toBeNull();
  });
});

describe("accepts", () => {
  it("needs the last part of the address to name the page", () => {
    expect(accepts("pricing", new URL("https://acme.example/en/pricing"), "acme.example")).toBe(true);
    expect(accepts("pricing", new URL("https://acme.example/blog/our-pricing-story"), "acme.example")).toBe(false);
    expect(accepts("changelog", new URL("https://acme.example/blog/tags/release-notes/2"), "acme.example")).toBe(false);
  });
});

describe("isPrivateAddress", () => {
  it("blocks local and private addresses", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.1", "169.254.169.254", "::1", "fd00::1"]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
    expect(isPrivateAddress("93.184.216.34")).toBe(false);
  });
});

describe("pricing in the docs", () => {
  it("finds docs.<domain>/pricing when the main site has none, and prefers the main site's page", async () => {
    const only = async (live: string[]) => async (url: URL) =>
      live.includes(url.href) ? { status: 200, location: null } : { status: 404, location: null };
    const docsOnly = await findPage("pricing", "boat.example", await only(["https://docs.boat.example/pricing"]));
    expect(docsOnly).toEqual({ url: "https://docs.boat.example/pricing", others: [] });
    const both = await findPage("pricing", "boat.example", await only(["https://boat.example/pricing", "https://docs.boat.example/pricing"]));
    expect(both).toEqual({ url: "https://boat.example/pricing", others: ["https://docs.boat.example/pricing"] });
  });
});
