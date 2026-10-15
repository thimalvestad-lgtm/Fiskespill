# Riverbend

A slow, calm 3D fly fishing game. You stand on the bank of a trout stream (a fast riffle, a boulder garden and a long glassy flat), read the water, spot fish, build your rig and cast.

Play it: https://fishing-game.thim-alvestad.workers.dev

Pushes to `main` are deployed automatically by Cloudflare Workers Builds.

## Install it as an app

Riverbend is a Progressive Web App: install it and it gets its own icon, opens full screen and plays offline.

- **iPhone / iPad:** open the game in Safari, tap **Share**, then **Add to Home Screen**.
- **Android:** tap **📲** in the game (or Chrome's menu **⋮ → Install app**).
- **Computer:** click the install icon in Chrome's or Edge's address bar.

`public/manifest.webmanifest` describes the app, `public/sw.js` caches the game for offline play (network first, so you always get the newest version when online), and `public/icons/` holds the app icons. `npm test` checks that the service worker caches every file in `public/`, so add new files to its list.

## How it plays

- **Look and walk.** Drag to look around; zoom with the mouse wheel or the 🔍 button. Tap a circle on the minimap to walk to another stand on the bank.
- **Spot fish for points.** Trout hold where they would in a real river: seams, pockets behind boulders, the drop-off below the riffle, the head of the pool, an undercut bank, the flat and the tailout. Tap a dark shape, the flash of a feeding fish, or a rise ring to spot it. Bigger fish are worth more. Put on the polarized glasses (🕶) to cut the surface glare and see into the water.
- **Aim and cast.** Tap the water to place the aim marker. It names the lie and the distance. **Hold Cast** (or Space) to false cast: the rod swings back and forth and line shoots out on every forward stroke. Let go when the line out reaches the marker and the rhythm dot is in the green, at the end of the forward stroke. Good timing gives a tight, accurate loop; too little or too much line lands short or long. Boulders are solid: a fly that hits a rock spoils the cast, and line on the water wraps around rocks. Land the fly upstream of a fish and let the current carry it down. A fly that slaps down on a fish's head, or fly line landing across it, sends the fish bolting; it hides for a while and then swims back into its lie.
- **The fly box.** An open box of illustrated flies in three compartments: dry flies (Parachute Adams #18, Elk Hair Caddis #14, Foam Hopper #10), nymphs (Zebra Midge, Pheasant Tail, Tungsten Stonefly) and dry droppers (pre-tied pairs). Tap a fly to tie it on.
- **Build the leader.** Pick a tapered leader (7.5–12 ft, 3X–6X tip), add a tippet section (size and length), and set the indicator depth (nymphs) or dropper length (dry droppers). A live drawing shows the rig, and a side view of the water compares where your nymph will fish with the depth of the lie you're aiming at. Tippet thicker than the leader's tip won't turn over.
- **A floating fly line.** While the fly drifts, the line is simulated as a rope: it hangs from the rod tip, lies on the surface, gets bellied by the current and starts to drag the fly. Trout refuse a dragging fly, so **Mend** (or press M) to lift the belly and lay it back upstream. The rod tip follows the fly low over the water. Nymphs sink as they drift (heavy ones fast, light ones slowly), so cast far enough upstream, and a nymph set deeper than the river snags the bottom.
- **The take.** Fish rise up through the water to inspect your fly. They take it, or turn away with a hint about why. On a dry fly the nose breaks the surface; on a nymph the indicator dips. Hit *Strike!*
- **The fight.** A hooked fish shakes its head for a moment before it does anything, giving you time to set the drag. Runs are telegraphed by tail kicks; ease the drag, and if the line creaks, ease it more. A tired fish comes close: keep the line gently tight until its head is up, then **Net it**.
- **Fight controls.** The rod bends with the line tension. Tap **Reel** (or Space) to crank line in; it only gains when the fish pulls less than the drag, set with **Drag − / +** against your tippet's breaking strength. If the drag is too tight, the tippet snaps. If it's too loose, the fish takes line and reaches the rocks or roots. Drag sideways on the river (or A/D) to lean the rod for side pressure and steer the fish away from cover. Slack line lets the hook fall out.
- **Jumps.** Many trout jump when hooked and during runs. You can see it coming: the fish surges up, the surface bulges and swirls, and a ⚠ JUMP cue appears. Hold **Bow** (or B) to drop the rod tip through the jump. Keep the line tight while it's in the air and the fish throws the hook.
- **Tackle shop (🛒).** Points you earn are also money. Buy rods (Orvis Clearwater, Scott G Series, Guideline Elevation), reels (Orvis Battenkill, Guideline Halo, Orvis Mirage), fly lines (Orvis Hydros, RIO Gold, Scientific Anglers Amplitude MPX) and more flies (Royal Wulff, CDC Emerger, Copper John, Perdigon). Each piece changes how you fish: casting reach and accuracy, how softly the line lands, how well it mends, how much the rod cushions fine tippet, the reel's drag strength and smoothness. Your rank counts everything you've earned, so spending never lowers it.
- **Check the water (🪰).** Crouch at the edge to see which insects are on the surface (with a drawing and size), what's drifting underneath, and whether your fly matches.
- **Learning.** A short guided tutorial on your first day (replay it from the field guide), and plain-language explanations of flies, hook sizes, leaders and tippet X numbers in the fly box and Rig panel.
- **Wildlife and weather.** Songbirds sing from the trees and fly between them, dippers bob on the rocks, swallows hunt over the water, flocks pass overhead, and a deer wanders down to drink on the far bank. Rain showers roll in on some days, with rain on the water and on the leaves.
- **Rises.** Rising trout send out rings, and the splash is louder the bigger the fish.
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
| `gear.json` | Rods, reels and lines (stats, colours, prices), tapered leaders, tippets (with breaking strength), slider ranges, the flies in the fly box, and the beginner help texts |

## Code

- `public/js/sim.js`: the rules (rig scoring, take chance, fish sizes, hints). No DOM; tested with `node --test`.
- `public/js/world.js`: terrain, water shader, rocks, trees, sky and light.
- `public/js/fish.js`: trout models and behaviour.
- `public/js/tackle.js`: rod (bending under load), reel, the cast, the rope-simulated fly line, and the 3D flies.
- `public/js/rig.js`, `public/js/flies.js`: the rig model, the fly box and leader builder, and the fly illustrations.
- `public/js/fx.js`: rings, splashes, insects, rain, mist, the aim marker.
- `public/js/wildlife.js`: birds, dippers, swallows, flocks and the deer.
- `public/js/insects.js`, `public/js/tutorial.js`: the "Check the water" report and the guided tutorial.
- `public/js/install.js`: registers the service worker and runs the install button.
- `public/js/main.js`: game flow and UI.
- `public/vendor/`: three.js r169 (MIT), bundled so the game needs no CDN.

```
npm test                 # rule tests
npm run dev              # local server via wrangler
npm run deploy           # deploy with static assets
npm run deploy:embedded  # deploy as a single Worker with the files bundled in
```
