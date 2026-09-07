# Dead Orbit

A standalone first-person space-station survival game, inspired by the game in
`claude-experiments/game.html`. Open `game.html` in a modern browser, or serve the
repository with `python3 -m http.server` and visit `/codex-experiments/game.html`.
There is no build step, dependency, asset download, or network requirement.

Recover a gold access card and reach the green lift on each procedural floor.
There is no final floor: survive as long as you can. A lift counts one completed
floor, then offers a permanent upgrade and restores health, shields, and ammo.
Your score is floors completed, saved at each lift; dying on floor 7 scores 6.
Standard and Explorer have separate local records. Old point-based records
are not reused as floor counts, and audio/accessibility preferences carry over.

Enemy health and damage grow cubically, eventually outpacing linear suit
upgrades. Squads grow to six enemies per room; movement, fire cadence, and
projectile speed increase within bounds to keep simulation costs predictable.
Rifle fire rate and EMP/dash cooldowns have minimums. Six station themes repeat
with new layouts, increasing difficulty, and continued floor numbering.

Collect supplies and scrap hostile machines. The Storm Cutlass chains three cuts into a heavy finisher, ignores
frontal armor, and reflects incoming bolts. Cabinets and equipment cases block
movement and attacks, with height-aware projectile collision.
Furniture stays inside rooms and leaves full-width doorways, room-side
approaches, and hallways clear.

Six enemy classes have distinct silhouettes and behavior: patrol drones, heavy
sentries, melee stalkers, strafing skimmers, spread-shot prism casters, and
bulwarks with frontal armor. Seeded traits vary size, health, speed, damage, and
firing cadence. Swift, reinforced, and overclocked variants have visible accents
and tradeoffs. Flank bulwarks, stun them with EMP, or use the blade.

Explorer mode reduces incoming damage. The field guide contains
controls, sensitivity, and reduced-motion settings.

- **Move:** WASD or up/down arrows; Shift to sprint; Space to dash.
- **Look:** mouse; drag if mouse capture is unavailable; left/right arrows.
- **Combat:** click or J to fire; R to reload; 1/2 to switch blade/rifle.
- **EMP:** F or right click. Stuns nearby visible enemies and clears nearby bolts.
- **Interact:** E. Gold cards and supplies are collected on contact.
- **Map:** M or click/tap the radar. **Pause:** Escape, P, or the pause button.
- **Touch:** movement joystick, drag to look, and dedicated action buttons.

**Music:** “Ion Runner” is an original 32-bar chiptune, synthesized with pulse
leads, arpeggios, triangle bass, and LFSR noise drums. Combat adds layers; later
floors increase the tempo up to 164 BPM. Music has independent enable/volume controls in the
field guide. The master mute affects music and effects. Playback begins after a
user gesture and pauses with the game or when the page is hidden.

All geometry, lighting, effects, signage, and Web Audio sound are generated in
`game.html`. Station geometry is batched into a WebGL mesh; simulation uses a
bounded delta time, collision substeps, and grid pathfinding. Only preferences
and the personal best floor counts are saved in local storage. A run stays in memory.

Run the dependency-free tests with Node.js:

```sh
node --test codex-experiments/game.test.cjs
```

Tests cover 300 generated decks and furnished routes, full-width passage
clearance for players and enemies, cabinet collision and
cover, ammo, shields, EMP, cutlass combos and parries, enemy traits and attacks,
finite model geometry, music scheduling and voice cleanup, pause, death/retry,
and repeated floor transitions beyond the old ending, record persistence,
difficulty scaling, and valid spawns including floor 10,000. The
controller tests stub the browser platform; visual and input checks require a
real browser.
