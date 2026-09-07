# Dead Orbit

A standalone first-person space-station escape game, inspired by the game in
`claude-experiments/game.html`. Open `game.html` in a modern browser, or serve the
repository with `python3 -m http.server` and visit `/codex-experiments/game.html`.
There is no build step, dependency, asset download, or network requirement.

Recover a gold access card and reach the green lift on each of three procedural
decks. Collect supplies, scrap hostile machines, and choose permanent upgrades
between decks. The Storm Cutlass chains three cuts into a heavy finisher, ignores
frontal armor, and reflects incoming bolts. Cabinets and equipment cases block
movement and attacks, with height-aware projectile collision.

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
decks increase the tempo. Music has independent enable/volume controls in the
field guide. The master mute affects music and effects. Playback begins after a
user gesture and pauses with the game or when the page is hidden.

All geometry, lighting, effects, signage, and Web Audio sound are generated in
`game.html`. Station geometry is batched into a WebGL mesh; simulation uses a
bounded delta time, collision substeps, and grid pathfinding. Only preferences
and the personal best score are saved in local storage. A run stays in memory.

Run the dependency-free tests with Node.js:

```sh
node --test codex-experiments/game.test.cjs
```

Tests cover 300 generated decks and furnished routes, cabinet collision and
cover, ammo, shields, EMP, cutlass combos and parries, enemy traits and attacks,
finite model geometry, music scheduling and voice cleanup, pause, death/retry,
and all three campaign transitions. The
controller tests stub the browser platform; visual and input checks require a
real browser.
