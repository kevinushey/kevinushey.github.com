# Dead Orbit

A standalone first-person space-station survival game, inspired by the game in
`claude-experiments/game.html`. Open `game.html` in a modern browser, or serve the
repository with `python3 -m http.server` and visit `/codex-experiments/game.html`.
There is no build step, dependency, asset download, or network requirement.

Recover a gold access card and reach the green lift on each procedural floor.
The card activates a swirling transit portal. Walk through its opening from
either side to leave the floor, or use E / the touch Use button nearby. A brief
warp effect and sound lead into the upgrade screen. Reduced motion keeps the
portal animation steady and uses a simple fade for transit. Crossing detection
checks the entire movement segment, including dashes, and awards each floor once.
There is no final floor: survive as long as you can. A lift counts one completed
floor, then offers a permanent upgrade, restores health and shields, and supplies
24 rounds up to your carry limit.
Your score is floors completed, saved at each lift; dying on floor 7 scores 6.
Standard and Explorer have separate local records. Old point-based records
are not reused as floor counts, and audio/accessibility preferences carry over.

**Ammo:** 24 rounds loaded, at most 48 in reserve (72 total). Runs start with
24 loaded and one spare magazine. Each floor has two 12-round stashes; machines
have a 20% chance to drop six rounds, and crew caches supply eight. Pickups and
caches leave excess ammunition behind when your reserve is full. Reloading
conserves rounds, and lift resupply adds only one magazine.

Enemy health and damage grow cubically, eventually outpacing linear suit
upgrades. Squads grow to six enemies per room; movement, fire cadence, and
projectile speed increase within bounds to keep simulation costs predictable.
Rifle fire rate and EMP/dash cooldowns have minimums. Six station themes repeat
with new layouts, increasing difficulty, and continued floor numbering.

Every floor mixes long galleries, tall hangars, rooms with stepped corners,
L-shaped chambers, cross-shaped junctions, and halls with solid columns.
Room orientations and connections vary by seed. Ceilings range from 3.6 to
6 meters, with overhead beams and bulkheads at height transitions. New walls
provide cover and flanking routes; enemies, supplies, and objectives occupy
separate clear floor tiles. Furniture also keeps narrow interior aisles clear.

Collect supplies and scrap hostile machines. The Storm Cutlass chains three cuts into a heavy finisher, ignores
frontal armor, and reflects incoming bolts. Cabinets and equipment cases block
movement and attacks, with height-aware projectile collision.
Furniture stays inside rooms and leaves full-width doorways, room-side
approaches, and hallways clear.
Wall clearance keeps the camera outside protruding consoles and structural
supports, including during dashes and when sliding along a wall.
About 7% of ceiling lights have occasional, independently timed voltage dips.
The tube and its cast light dim together; reduced motion keeps them steady.

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
- **Resume:** Escape resumes on release; click the game to capture the mouse
  again. P or the Resume button resumes and requests mouse capture immediately.
- **Touch:** movement joystick, drag to look, and dedicated action buttons.

**Music:** “Ion Runner” is an original 32-bar chiptune, synthesized with pulse
leads, arpeggios, triangle bass, and LFSR noise drums. Combat adds layers; later
floors increase the tempo up to 164 BPM. Music has independent enable/volume controls in the
field guide. The master mute affects music and effects. Playback begins after a
user gesture and pauses with the game or when the page is hidden.

Destroyed enemies burst with a layered blast, low thump, and metallic crackle.
Heavy machines have deeper explosions; pitch varies between kills, and sounds
fade with distance and pan toward the enemy. All effects respect master mute.

All geometry, lighting, effects, signage, and Web Audio sound are generated in
`game.html`. Station geometry is batched into a WebGL mesh; simulation uses a
bounded delta time, collision substeps, and grid pathfinding. Only preferences
and the personal best floor counts are saved in local storage. A run stays in memory.

Run the dependency-free tests with Node.js:

```sh
node --test codex-experiments/game.test.cjs
```

Tests cover varied room silhouettes and heights, clear and separate spawns,
300 generated decks and furnished routes, full-width passage
clearance for players and enemies, cabinet collision and
cover, ammo, shields, EMP, cutlass combos and parries, enemy traits and attacks,
finite model geometry, music scheduling and voice cleanup, pause, death/retry,
and repeated floor transitions beyond the old ending, record persistence,
difficulty scaling, and valid spawns including floor 10,000. The
controller tests stub the browser platform; visual and input checks require a
real browser.
