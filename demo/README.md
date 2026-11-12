# Demo

The two GIFs in the README, recorded from the live demo at https://watch-competitor.vercel.app:

- `part1.gif`: the Overview timeline (7 to 60 days, the history window dragged back to mid-August, Today, the change card for 9 Nov), then E2B's Hobby plan pricing change in Assess: two tasks added to the prompt, then Copy prompt.
- `part2.gif`: adding a competitor (Blaxel): its pages and news, a focus typed into "What matters to you?", one more monitor from Add monitors, then Start watching.

Each is 1100 × 720 at 50 frames a second. To make them again (Chrome and ffmpeg needed; `npm install --no-save ffmpeg-static` works):

```bash
PART=overview DEMO_URL=https://watch-competitor.vercel.app/ node demo/record.mjs demo/scenario.mjs demo/frames 1100 720
COLORS=96 node demo/encode.mjs demo/frames demo/part1.gif 50

PART=add DEMO_URL=https://watch-competitor.vercel.app/ node demo/record.mjs demo/scenario.mjs demo/frames 1100 720
node demo/encode.mjs demo/frames demo/part2.gif 50
```

- `scenario.mjs` is the demo: what to click, drag, type and point at, for each part.
- `record.mjs` plays it in headless Chrome, draws the cursor (a pointing finger, and a hand while dragging) and saves timed frames to `demo/frames/` (git-ignored). Set `CHROME_PATH` if Chrome is not at its macOS path.
- `encode.mjs` turns the frames into a GIF with ffmpeg. `COLORS=96` keeps part 1 under 3 MB.

Part 2 looks up Blaxel on the demo, which spends the demo's context.dev credits (about 2: the company search and the news search) unless that lookup ran in the last 24 hours. The recording clears the focus box's example text before typing and hides the demo's "Watch your own competitors" card, so the GIF ends on Start watching.

The cursor shapes are Lucide's `pointer`, `hand` and `grab` icons (ISC licence, https://lucide.dev).
