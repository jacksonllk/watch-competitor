import { describe, expect, it } from "vitest";
import { supportUrl } from "@/lib/links";

describe("SUPPORT_URL", () => {
  it("links a web page or an email, and is off when unset or not a link", () => {
    expect(supportUrl({ SUPPORT_URL: "https://acme.example/help" })).toBe("https://acme.example/help");
    expect(supportUrl({ SUPPORT_URL: " help@acme.example " })).toBe("mailto:help@acme.example");
    expect(supportUrl({ SUPPORT_URL: "mailto:help@acme.example" })).toBe("mailto:help@acme.example");
    expect(supportUrl({ SUPPORT_URL: "" })).toBeNull();
    expect(supportUrl({})).toBeNull();
    expect(supportUrl({ SUPPORT_URL: "javascript:alert(1)" })).toBeNull();
    expect(supportUrl({ SUPPORT_URL: "call us" })).toBeNull();
  });
});
