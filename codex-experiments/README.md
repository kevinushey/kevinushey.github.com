# Dead Orbit

A standalone first-person space-station survival game, inspired by the game in
`claude-experiments/game.html`. Open `game.html` in a modern browser, or serve the
repository with `python3 -m http.server` and visit `/codex-experiments/game.html`.
There is no build step, dependency, asset download, or network requirement.

Recover a gold access card and defeat the guardian at each floor's lift.
Both conditions activate its swirling transit portal. Walk through its opening from
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

**Portal guardians:** Every lift room has one boss, replacing an ordinary squad
member so the population cap stays unchanged. Three forms rotate with the floors;
the seed determines the first form and a small health variation. The armored
**Bastion** fires paired cannon bolts and exposes its core during wind-up and
recovery. The floating **Prism Sovereign** fires five-bolt fans with gaps to dodge
or parry. The **Rift Reaver** locks its aim before a fast, straight charge: dash
sideways and strike during recovery. All three enter an enraged phase below half
health, adding projectiles or faster charges, and scale with floor difficulty
and lockdown. Their distinct crowns, weapons, and colors identify each form.

Boss fights have a dedicated health bar, attack warnings, combat music, and a
red seal across the portal. Guardians resist cutlass stagger; EMP interrupts
them for 1.4 seconds, and cutlass hits and reflected bolts bypass frontal armor.
They stay in their lift room, respect walls and furniture, and never heal when
you retreat. Defeat releases the seal, but the gold card is still required.
The card and boss can be handled in either order. Walking, dashing, and Use all
check both conditions. Bosses award one kill and contract progress; the score
still increases only when you complete the floor.

Each floor also offers an optional contract: scrap a squad, earn cutlass kills,
or salvage two crew caches. Progress appears below the main objective. Finish
the contract to earn two permanent upgrade choices at the lift instead of one;
you can always leave without completing it. The lift report shows floor time,
machines scrapped, and contract progress. **Arc welder** adds 12 damage to each
cut and 16 damage to reflected bolts, alongside the rifle, armor, and ability
upgrades. Contracts and their rewards reset each floor; upgrades last for the run.

**Floor lockdown:** A visible countdown gives you three minutes per floor
(four in Explorer). At zero, every surviving machine begins hunting you and
gains health, damage, speed, and firing cadence. Another overclock surge arrives
every 45 seconds. Health and damage keep increasing; movement and attack rates
stay bounded. Wounded enemies retain their health percentage. A warning plays
30 seconds before lockdown, and the music gains its combat layers. The lift
remains usable: the deadline adds pressure rather than ending the run. The
countdown and production pause with the game, tactical map, and hidden tab;
each new floor gets a fresh timer.

**Breach nodes:** Two violet energy cores occupy reserved room centers, away
from the starting room, card, and lift. Their floor emitters and projections
are passable, preserving all furnished routes. Each node starts producing after
30–43 seconds, then waits 35 seconds between spawn charges. Lockdown shortens
that interval to a minimum of ten seconds. A visible marker charges for 2.4
seconds before each reinforcement arrives, followed by a short attack delay.
Spawn positions are checked again at arrival, stay inside rooms, clear of walls,
furniture, actors, and supplies, and at least four meters from the player.
Blocked pads retry later without accumulating a backlog. Population stays
capped at 48 live machines, and old corpses are pruned to bound storage.

Shoot or slash a core to seal its breach permanently; reflected bolts work too.
EMP cancels the pending spawn and disables production for eight seconds before
the node resumes its cooldown. Nodes have health bars, status labels, local
lighting, and explored-map icons. Sealing every breach stops reinforcements but
does not stop the lockdown clock. Destroying a node does not award enemy kills
or contract progress. Reinforcements count toward combat contracts, but carry
no ammo drops, keeping supplies scarce.

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

Collect supplies and scrap hostile machines. The Storm Cutlass chains a diagonal
cut, a returning backhand, and a wide horizontal finisher, with a visible gauntlet and
forearm driving each swing forward. Wind-up, contact, and follow-through have
distinct poses; the edge trail follows the blade. Damage, sound, and bolt parries
occur at contact, after the short wind-up. Switching weapons cancels a pending
cut. Reduced motion uses a small forward gesture with the same combat timing.
The blade ignores frontal armor and reflects incoming bolts. Cabinets and equipment cases block
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

**Music:** Four original 32-bar chiptunes rotate with the floors: “Ion Runner,”
the airy “Glass Orbit,” the driving “Reactor Run,” and “Last Transmission.”
They have distinct melodies, rhythms, and chord progressions, synthesized with
pulse leads, arpeggios, triangle bass, drifting sine pads, and LFSR noise drums.
Combat adds layers, and collecting the card intensifies the extraction music.
Tempo stays capped at 172 BPM. The field guide lets you choose a particular
track or automatic rotation, with independent music enable/volume controls.
Track changes wait for a bar boundary. The master mute affects music and
effects. Playback begins after a user gesture and pauses with the game or
when the page is hidden.

The headlamp has a broad spill and a brighter central beam, with subtle metallic
highlights and restrained bloom. Soft contact shadows ground enemies on the
floor. Explosions, muzzle flashes, impacts, bolts, EMP, and the cutlass cast
colored light onto nearby surfaces. Fixture lights have reserved slots so
passing bolts do not displace them, and wall checks reject sources behind solid
walls relative to the viewer. These are local light effects and contact shadows,
not full shadow mapping. Transient lights have a fixed budget and expire; reduced
motion disables their flashes while keeping steady blade and projectile glow.

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

Additional tests cover achievable contracts, exactly-once rewards, two-stage
fabrication, cutlass upgrades, bounded light effects, four complete soundtracks,
and track changes and cleanup. Browser checks include portrait/landscape menus,
native Web Audio rendering, and the lighting shaders.

Lockdown tests cover both deadlines, successive surges, wounded/dead enemies,
pause and reset behavior, extraction during lockdown, and bounded attack rates.
Breach tests cover 300 deterministic layouts, spawn clearance and revalidation,
population/storage limits, spawn warnings, all weapon interactions, EMP and cover,
ammo farming prevention, and finite visual geometry with reduced motion.

Guardian tests cover 600 generated arenas including late floors, rotating forms,
telegraphed volleys and dodgable rushes, half-health phases, armor openings,
EMP interruption, cutlass and reflected-bolt damage, collision and arena limits,
both portal-unlock orders, pause/reset behavior, and finite boss geometry.
