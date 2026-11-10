import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { addCompetitor } from "@/lib/add-competitor";
import { checksPerDay, readSchedule } from "@/lib/config";
import { alignMonitors, isDue } from "@/lib/refresh";
import { createMemoryStore } from "@/lib/store/memory";
import { monitorParams } from "@/lib/watches";
import { firstTime, loadSecrets, verifySignature, webhookUrl } from "@/lib/webhook";
import { fakeContext } from "./helpers/fake-context";

const sign = (body: string, secret: string, t: number) => `t=${t},v1=${createHmac("sha256", secret).update(`${t}.`).update(body).digest("hex")}`;

describe("webhook address", () => {
  it("is on only for a public https APP_URL", () => {
    expect(webhookUrl({ APP_URL: "https://watch.example.com/" })).toBe("https://watch.example.com/api/webhooks/context-dev");
    expect(webhookUrl({})).toBeNull();
    expect(webhookUrl({ APP_URL: "http://watch.example.com" })).toBeNull();
    expect(webhookUrl({ APP_URL: "https://localhost:3000" })).toBeNull();
    expect(webhookUrl({ APP_URL: "not a url" })).toBeNull();
  });
});

describe("verifySignature", () => {
  const body = '{"event":"run.completed"}';
  const now = 1_762_700_000;
  it("accepts a fresh signature from any known secret", () => {
    expect(verifySignature(body, sign(body, "whsec_b", now), ["whsec_a", "whsec_b"], now + 10)).toBe(true);
  });
  it("rejects a wrong secret, a changed body, an old timestamp and a missing header", () => {
    expect(verifySignature(body, sign(body, "whsec_x", now), ["whsec_a"], now)).toBe(false);
    expect(verifySignature(body + " ", sign(body, "whsec_a", now), ["whsec_a"], now)).toBe(false);
    expect(verifySignature(body, sign(body, "whsec_a", now), ["whsec_a"], now + 301)).toBe(false);
    expect(verifySignature(body, null, ["whsec_a"], now)).toBe(false);
    expect(verifySignature(body, "t=1,v1=zz", ["whsec_a"], now)).toBe(false);
  });
  it("handles each event once", async () => {
    const store = createMemoryStore();
    expect(await firstTime(store, "evt_1")).toBe(true);
    expect(await firstTime(store, "evt_1")).toBe(false);
  });
});

describe("schedule setting", () => {
  it("keeps 1 to 7 days, else once a day", () => {
    expect(readSchedule({ every: 3, unit: "days" })).toEqual({ every: 3, unit: "days" });
    expect(readSchedule({ every: 7, unit: "days" })).toEqual({ every: 7, unit: "days" });
    expect(readSchedule({ every: 8, unit: "days" })).toEqual({ every: 1, unit: "days" });
    expect(readSchedule({ every: 6, unit: "hours" })).toEqual({ every: 1, unit: "days" });
    expect(readSchedule(undefined)).toEqual({ every: 1, unit: "days" });
    expect(checksPerDay({ every: 2, unit: "days" })).toBe(0.5);
  });

  it("creates monitors with the schedule and, when public, the webhook", () => {
    const record = {
      slug: "acme",
      name: "Acme",
      domain: "acme.example",
      logo: null,
      description: null,
      focus: null,
      addedAt: "",
      status: "watching" as const,
      removedAt: null,
      watches: {},
    };
    const params = monitorParams(record, "pricing", "https://acme.example/pricing", {
      schedule: { every: 3, unit: "days" },
      webhookUrl: "https://w.example/api/webhooks/context-dev",
    });
    expect(params.schedule).toEqual({ type: "interval", frequency: 3, unit: "days" });
    expect(params.webhook).toEqual({ url: "https://w.example/api/webhooks/context-dev", events: ["run.completed"], retry: {} });
    expect(monitorParams(record, "pricing", "https://acme.example/pricing").webhook).toBeUndefined();
  });
});

describe("alignMonitors", () => {
  const settings = { webhookUrl: "https://w.example/api/webhooks/context-dev", schedule: { every: 1, unit: "days" as const } };
  it("adds the webhook and saves its secret, and leaves matching monitors alone", async () => {
    const store = createMemoryStore();
    const { api, updated } = fakeContext();
    const monitors = [
      { id: "mon_a", schedule: { frequency: 1, unit: "days" }, webhook: null },
      { id: "mon_b", schedule: { frequency: 1, unit: "days" }, webhook: { url: settings.webhookUrl, secret: "whsec_b" } },
    ];
    expect(await alignMonitors(store, api.monitors, monitors, settings)).toBe(1);
    expect(updated).toEqual([{ id: "mon_a", body: { webhook: { url: settings.webhookUrl, events: ["run.completed"], retry: {} } } }]);
    expect(await loadSecrets(store)).toEqual({ mon_a: "whsec_mon_a", mon_b: "whsec_b" });
  });

  it("applies a changed schedule, and adds no webhook without a public address", async () => {
    const { api, updated } = fakeContext();
    await alignMonitors(createMemoryStore(), api.monitors, [{ id: "mon_a", schedule: { frequency: 1, unit: "days" }, webhook: null }], {
      webhookUrl: null,
      schedule: { every: 2, unit: "days" },
    });
    expect(updated).toEqual([{ id: "mon_a", body: { schedule: { type: "interval", frequency: 2, unit: "days" } } }]);
  });

  it("makes a read due when the settings change", () => {
    const saved = { at: "2026-11-09T10:00:00Z", states: {}, failedAt: null, settings: JSON.stringify([null, 1, "days"]) };
    const now = new Date("2026-11-09T10:30:00Z");
    expect(isDue(saved, now, { webhookUrl: null, schedule: { every: 1, unit: "days" } })).toBe(false);
    expect(isDue(saved, now, settings)).toBe(true);
  });
});

describe("addCompetitor with a webhook", () => {
  it("saves each new monitor's signing secret", async () => {
    const store = createMemoryStore();
    const { api } = fakeContext();
    const web = async (url: URL) =>
      url.href === "https://acme-notes.example/pricing" ? { status: 200, location: null } : { status: 404, location: null };
    await addCompetitor(store, api, { domain: "acme-notes.example" }, { fetchHop: web, webhookUrl: "https://w.example/api/webhooks/context-dev" });
    expect(await loadSecrets(store)).toEqual({ mon_1: "whsec_mon_1" });
  });
});
