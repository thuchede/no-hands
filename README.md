# No Hands 🖐️

A slide deck about camera body detection **that is its own demo**: the presentation explains
how ML models detect body and hand positions from a webcam, showcases it live inside the
slides, and ends with the presenter navigating the deck by gestures alone.

Built with [Astro](https://astro.build) + [Reveal.js](https://revealjs.com)
(from [jsulpis/slides-template](https://github.com/jsulpis/slides-template)) and
[MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision) — all
inference runs on-device in the browser (WASM/WebGPU), no video ever leaves the machine.

## The deck

| # | Slide | What happens |
|---|-------|--------------|
| 1 | No Hands | title + hook |
| 2 | How does a computer see a body? | pixels → CNNs → landmark regression |
| 3 | Under the hood: MediaPipe | two-stage pipeline, 21/33 landmarks, on-device |
| 4 | 🎥 See what the model sees | live hand + pose skeleton overlay |
| 5 | From landmarks to meaning | normalize 63-dim vectors, tiny kNN classifier |
| 6 | 🎥 Fingerspelling → subtitles | ASL letters typed live as subtitles |
| 7 | From meaning to control | temporal gestures, state machines, cooldowns |
| 8 | 🎥 Watch it watch you | live gesture recognition + practice toggle |
| 9–10 | 1 / 2 | big-number slides to make gesture navigation visible |
| 11 | 🎥 No hands. | enable gesture mode, drive the deck hands-free |
| 12 | Questions? | Q&A, still gesture-navigable |
| 13 | Thanks! | credits: jsulpis template, MediaPipe, Reveal.js, Astro |

## Commands

```sh
pnpm install
pnpm dev      # http://localhost:4321/no-hands
pnpm build    # static build in dist/
```

## Before presenting

1. **Calibrate fingerspelling** (once per presenter/laptop): open
   `http://localhost:4321/no-hands/calibrate`, record ~15–20 samples per letter
   (Space to capture). Samples persist in localStorage; **Export JSON** and commit it as
   `public/samples/asl-samples.json` to bundle them as the fallback.
2. Letters **J and Z need motion** and are not supported (static classifier) — pick demo
   words without them.
3. Rehearse in venue lighting. Camera requires HTTPS (or localhost).

## Controls

| Input | Action |
|-------|--------|
| `g` | toggle gesture mode (HUD appears bottom-right) |
| 🖐️ open palm, swipe left/right | next / previous slide |
| 🤏 pinch spread / close | zoom in / out |
| ✊ fist, hold | overview / escape |
| 🙌 two open palms, hold | fullscreen (browser may require `f` instead) |
| `c` (on the fingerspelling slide) | clear subtitles |
| `s` | speaker notes |

The keyboard always stays active — gesture mode is additive, never a trap.

## How it works

- `src/lib/camera.ts` — one shared, refcounted `getUserMedia` stream
- `src/lib/vision.ts` — one rAF inference loop; lazy MediaPipe task singletons
  (HandLandmarker, PoseLandmarker, GestureRecognizer), subscriber model so hidden slides
  cost nothing
- `src/lib/fingerspell.ts` — landmark normalization (wrist origin, scale, mirror), kNN
  classifier, letter debouncing into words
- `src/lib/gestures.ts` — temporal state machine (swipe velocity, hold timers, pinch
  trends, 900 ms cooldowns) → deck commands
- `src/lib/deck.ts` — Reveal.js wrapper: slide-visibility lifecycle + navigation/zoom
- models self-hosted in `public/models/`, WASM runtime in `public/wasm/`

## Deploy

The GitHub Actions workflow deploys to GitHub Pages on push. Set `site` in
`astro.config.mjs` to your Pages origin first (base is already `/no-hands`).
