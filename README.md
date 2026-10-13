# Riverbend

A slow, calm 3D fly fishing game. You stand on the bank of a trout stream (a fast riffle, a boulder garden and a long glassy flat), read the water, spot fish, build your rig and cast.

Play it: https://fishing-game.thim-alvestad.workers.dev

## How it plays

- **Look and walk.** Drag to look around; zoom with the mouse wheel or the 🔍 button. Tap a circle on the minimap to walk to another stand on the bank.
- **Spot fish for points.** Trout hold where they would in a real river: seams, pockets behind boulders, the drop-off below the riffle, the head of the pool, an undercut bank, the flat and the tailout. Tap a dark shape, the flash of a feeding fish, or a rise ring to spot it. Bigger fish are worth more. Polarized glasses (🕶) cut the surface glare.
- **Aim and cast.** Tap the water to place the aim marker. It names the lie and the distance. Cast to watch the back cast, the forward cast and the line unrolling onto the water. Land the fly upstream of a fish and let the current carry it down. A fly that slaps down on a fish's head, or line falling across it, sends the fish bolting.
- **Build the rig** in the Fly box: leader length (7.5–15 ft), tippet (3X–6X), dry fly, nymph or dry dropper, and size (#18, #14, #10).
- **The take.** Fish rise up through the water to inspect your fly. They take it, or turn away with a hint about why. On a dry fly the nose breaks the surface; on a nymph the indicator dips. Hit *Strike!*
- **The fight.** The rod bends with the line tension. Hold *Reel* to bring the fish in and use **Drag − / +** to set the reel's drag against your tippet's breaking strength. If the drag is too tight, the tippet snaps. If it's too loose, the fish takes line and reaches the rocks or roots. Slack line lets the hook fall out. Rainbows jump.
- **Conditions.** Each day draws its own weather, water clarity and insect hatches (morning duns, small olives, hoppers, evening caddis, spinner fall), and the light changes from dawn mist to dusk. A rig that suits the water and the moment brings more takes and bigger fish, and is rated with ★ on the catch card.
- **Rewards.** Points for spotting and catching, achievements, ranks and a logbook, all saved in your browser.

Nature sounds (river, wind, birdsong, rain, rising fish, reel clicks) are generated live with the Web Audio API.

## Where the game data lives

All the rules are plain JSON in `public/data/`, so you can tweak the game without touching code:

| File | What it holds |
| --- | --- |
| `river.json` | River shape, sections, rocks, the stands on the bank, and every lie, with depth, description, fish sizes, trophy chance and snag risk |
| `water.json` | How each leader, tippet, fly type and fly size scores in each kind of water, plus feeding activity through the day |
| `conditions.json` | Weather, water clarity, insect hatches (time, size, chance per weather) and river-note texts |
| `gear.json` | Leaders, tippets (with breaking strength), fly types and sizes |

## Code

- `public/js/sim.js`: the rules (rig scoring, take chance, fish sizes, hints). No DOM; tested with `node --test`.
- `public/js/world.js`: terrain, water shader, rocks, trees, sky and light.
- `public/js/fish.js`: trout models and behaviour.
- `public/js/tackle.js`: rod (bending under load), reel, fly line and the cast.
- `public/js/fx.js`: rings, splashes, insects, rain, mist, the aim marker.
- `public/js/main.js`: game flow and UI.
- `public/vendor/`: three.js r169 (MIT), bundled so the game needs no CDN.

```
npm test                 # rule tests
npm run dev              # local server via wrangler
npm run deploy           # deploy with static assets
npm run deploy:embedded  # deploy as a single Worker with the files bundled in
```
