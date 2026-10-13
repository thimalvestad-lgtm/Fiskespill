# Riverbend

A slow, calm fly fishing game. You're given a stretch of trout stream (a fast riffle, a boulder garden and a long glassy flat), pick where to fish, build your rig, and try to fool a trout.

Play it: https://fishing-game.thim-alvestad.workers.dev

## How it plays

- **Choose a spot.** Eleven lies sit where trout really hold: a bucket in the riffle, the riffle edge seam, the drop-off below the riffle, the pocket behind a big boulder, the seam beside it, a plunge pocket, an undercut bank, the head of the pool, a foam-line eddy, the glassy flat and the tailout. The best lies hold the biggest fish.
- **Build your rig:** leader length (7.5–15 ft), tippet (3X–6X), fly type (dry, nymph or dry dropper) and fly size (#18, #14, #10).
- **Read the conditions.** Each day draws its own weather (sun, overcast or drizzle), water clarity and insect hatches (morning duns, small olives, hoppers, evening caddis, spinner fall). The river notes describe what you see.
- **Cast, strike, land.** When a fish takes, tap *Strike!*. While playing it, hold to reel and ease off when it runs. Too much pressure snaps fine tippet. In rocky water, though, a fish given free line will wrap you round a rock.
- **Rewards.** A rig that suits the water and the moment brings more takes, bigger fish and bonus points (rated with ★). You also get achievements, ranks and a logbook. Progress is saved in the browser.

Nature sounds (river, wind, birdsong, rain) are generated live with the Web Audio API, so there are no audio files.

## Where the game data lives

All the rules are plain JSON in `public/data/`, so you can tweak the game without touching code:

| File | What it holds |
| --- | --- |
| `river.json` | River shape, sections, rocks and every fishing spot, with depth, description, fish sizes, trophy chance, snag risk |
| `water.json` | How each leader, tippet, fly type and fly size scores in each kind of water, plus feeding activity through the day |
| `conditions.json` | Weather, water clarity, insect hatches (time, size, chance per weather) and river-note texts |
| `gear.json` | The leaders, tippets (with breaking strength), fly types and sizes |

The fish placement follows standard trout-stream lore. Trout hold where they get shelter from the current and food delivered to them: seams, pockets behind boulders, drop-offs below riffles, the head of pools and undercut banks. Flats and tailouts are mainly feeding water during hatches and low light.

## Code

- `public/js/sim.js`: the rules (rig scoring, take chance, fish size, hints). No DOM.
- `public/js/render.js`: canvas drawing of the river.
- `public/js/audio.js`: procedural ambience.
- `public/js/main.js`: game flow and UI.

```
npm test        # rule tests (node --test)
npm run dev     # local server via wrangler
npm run deploy  # deploy to Cloudflare
```

It's served as static assets on Cloudflare (`wrangler.jsonc`), with no build step.
