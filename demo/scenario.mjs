// The README demos, recorded from the live demo. Two parts, one GIF each (one GIF of both is over 3 MB):
//   PART=overview  the timeline (7 to 60 days, the history window dragged back to mid-August, Today, the card for
//                  9 Nov), then the E2B Hobby plan change in Assess: two tasks ticked into the prompt, Copy prompt
//   PART=add       adding a competitor (Blaxel): what matters to you, one more monitor, Start watching
// Recorded with demo/record.mjs and demo/encode.mjs (see demo/README.md). DEMO_URL: the app to record.
// The demo's company search and preview for Blaxel spend 2 to 4 credits once, then come from its 24-hour cache.
const URL = process.env.DEMO_URL ?? "http://localhost:3000/";
const PART = process.env.PART ?? "overview";

/** Waits in the page until `test` (a JavaScript expression) is true, up to `ms`. */
const until = (d, test, ms = 20_000) =>
  d.js(`(async () => { for (let t = 0; t < ${ms}; t += 100) { if (${test}) return true; await new Promise((r) => setTimeout(r, 100)); } return false; })()`);
/** The centre of the first element matching `selector` whose text includes `text`. */
const at = (d, selector, text = "") =>
  d.js(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => e.textContent.includes(${JSON.stringify(text)}));
    if (!el) throw new Error(${JSON.stringify(`Not found: ${selector} ${text}`)}); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
/** Smoothly scrolls the open panel's body so `text` sits `offset` px below its top. */
const panelTo = async (d, text, offset = 90) => {
  await d.js(`(() => { const body = document.querySelector(".ui-sheet .overflow-y-auto"); const all = [...body.querySelectorAll("h3, h4, button, p, span, label")]; const el = all.find((e) => e.textContent.trim() === ${JSON.stringify(text)}) ?? all.find((e) => e.textContent.trim().startsWith(${JSON.stringify(text)}));
    body.scrollTo({ top: body.scrollTop + el.getBoundingClientRect().top - body.getBoundingClientRect().top - ${offset}, behavior: "smooth" }); })()`);
  await d.wait(800);
};

export default async function demo(d) {
  await d.goto(URL, 3500);
  if (PART === "add") return addCompetitor(d);
  // Start on the 7-day view (the Overview opens on 30 days): set before recording.
  await d.js(`document.querySelector('button[aria-label="7 days"]').click()`);
  await d.wait(1200);
  await d.showPointer('button[aria-label="60 days"]', -160, 90);
  await d.start();
  await d.wait(500);

  // The timeline: 60 days, then drag the history window back so it starts in mid-August, then Today.
  await d.pointAt('button[aria-label="60 days"]', 500);
  await d.wait(150);
  await d.click();
  await d.wait(800);
  const range = await at(d, '[role="group"][aria-label^="Showing"]');
  // The window's centre when its left edge sits halfway between the Aug and Sep labels of the history strip.
  const midAugust = await d.js(`(() => { const w = document.querySelector('[role="group"][aria-label^="Showing"]').getBoundingClientRect();
    const label = (month) => [...document.querySelectorAll("body *")].find((e) => { if (e.children.length || e.textContent.trim() !== month) return false;
      const r = e.getBoundingClientRect(); return r.top >= w.top - 4 && r.bottom <= w.bottom + 4; }).getBoundingClientRect().left;
    return { x: (label("Aug") + label("Sep")) / 2 + w.width / 2, y: w.top + w.height / 2 }; })()`);
  await d.pointAt(range, 400, { cursor: "grab" });
  await d.wait(150);
  await d.drag(midAugust, 1100);
  await d.wait(1050);
  await d.pointAt(await at(d, "button", "Today"), 500);
  await d.wait(100);
  await d.click();
  await d.wait(900);

  // Mon 9 Nov: E2B's pricing change on the timeline, with its card.
  await d.pointAt('button[aria-label*="Hobby plan"]', 600);
  await d.wait(1750);

  // In the Feed: the same pricing change, and its Assess panel.
  await d.pointAt({ x: 560, y: 600 }, 400);
  await d.scrollTo({ text: "Hobby plan concurrent sandbox limit reduced", within: "a" }, { offset: 300, waitMs: 900 });
  const assess = await d.js(`(() => { const row = [...document.querySelectorAll('[id^="event-"]')].find((r) => r.textContent.includes("Hobby plan concurrent"));
    const b = [...row.querySelectorAll("button")].find((x) => x.textContent.trim() === "Assess"); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await d.pointAt({ x: assess.x - 520, y: assess.y }, 500);
  await d.wait(650);
  await d.pointAt(assess, 500);
  await d.wait(100);
  await d.click();
  await d.wait(1600);
  for (const task of ["Update our comparison with E2B", "Write talking points for sales"]) {
    await d.pointAt(await at(d, ".ui-sheet li label", task), 500, { dx: -110 });
    await d.wait(100);
    await d.click();
    await d.wait(500);
  }
  await d.wait(250);
  await panelTo(d, "Prompt", 40);
  await d.wait(1300);
  await d.pointAt(await at(d, ".ui-sheet button", "Copy prompt"), 500);
  await d.wait(100);
  await d.click();
  await d.wait(1450);
  await d.hidePointer();
  await d.wait(250);
}

/** Part 2: find the company, say what matters, add one more page, start watching. */
async function addCompetitor(d) {
  // Load Blaxel's logo before recording, so it shows the moment the result appears. The search is cached: no credits.
  const loaded = await d.js(`(async () => {
    const res = await fetch("/api/companies", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: "blaxel.ai" }) });
    const logo = JSON.stringify(await res.json()).match(/"logo":"([^"]+)"/)?.[1];
    if (!logo) return "no logo";
    await new Promise((ok) => { const img = new Image(); img.onload = img.onerror = ok; img.src = logo; });
    return "logo loaded";
  })()`);
  if (loaded !== "logo loaded") throw new Error(`Blaxel's logo: ${loaded}`);
  // In the recording only: the focus box starts empty (the typing fills it), and the public demo's
  // "Watch your own competitors" card never shows, so the GIF ends on Start watching.
  await d.js(`new MutationObserver(() => {
    for (const t of document.querySelectorAll(".ui-sheet textarea")) t.placeholder = "";
    for (const m of document.querySelectorAll('[role="dialog"]')) if (m.textContent.includes("Watch your own competitors")) m.closest(".fixed")?.style.setProperty("display", "none");
  }).observe(document.body, { childList: true, subtree: true })`);
  await d.showPointer({ text: "Add competitor", within: "button" }, -220, 160);
  await d.start();
  await d.wait(450);
  await d.pointAt({ text: "Add competitor", within: "button" }, 600);
  await d.click();
  await d.wait(650);
  await d.pointAt(".ui-sheet input", 400);
  await d.click();
  await d.type("blaxel.ai", 63);
  await d.wait(250);
  await d.js(`document.querySelector(".ui-sheet input").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))`);
  await until(d, `[...document.querySelectorAll(".ui-sheet li button")].some((b) => b.textContent.includes("blaxel.ai"))`);
  await d.wait(450);
  await d.pointAt(await at(d, ".ui-sheet li button", "blaxel.ai"), 500);
  await d.click();
  await until(d, `document.querySelector(".ui-sheet")?.textContent.includes("About Blaxel")`);
  await d.wait(600);

  // What matters to you: typed into the empty box.
  await d.pointAt(".ui-sheet textarea", 500);
  await d.click();
  await d.type("Only report changes about sandboxes.", 44);
  await d.wait(600);

  // One more page to watch, from Add more monitors.
  await panelTo(d, "What we will watch");
  await d.wait(450);
  await d.pointAt(await at(d, ".ui-sheet button", "Add monitors"), 600);
  await d.click();
  await until(d, `document.querySelector('[role="dialog"] ul.ui-fade-in label') || /no other pages/.test(document.body.textContent)`);
  await d.wait(600);
  await d.pointAt(await at(d, '[role="dialog"] ul.ui-fade-in label'), 500, { dx: -150 });
  await d.click();
  await d.wait(400);
  await d.pointAt(await at(d, '[role="dialog"] button', "Add 1 monitor"), 600);
  await d.click();
  await d.wait(1050);

  // Start watching. The recording ends on the press.
  await d.pointAt(await at(d, ".ui-sheet button", "Start watching"), 700);
  await d.wait(350);
  await d.click();
  await d.wait(600);
  await d.hidePointer();
  await d.wait(250);
}
