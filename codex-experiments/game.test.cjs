"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const html = fs.readFileSync(`${__dirname}/game.html`, "utf8");
const coreSource = html.match(
  /<script id="orbit-core">([\s\S]*?)<\/script>/,
)[1];
const musicSource = html.match(
  /<script id="orbit-music">([\s\S]*?)<\/script>/,
)[1];
const M = vm.runInNewContext(`${musicSource}\nOrbitMusic;`);
const gameSource = html.match(
  /<script id="orbit-game">([\s\S]*?)<\/script>/,
)[1];
const C = vm.runInNewContext(`${coreSource}\nOrbitCore;`);

// Exercise the actual controller with only its platform boundaries stubbed.
// Rendering and DOM interaction are checked separately in a real browser.
function campaign(initialSave = {}) {
  const elements = new Map();
  const storage = new Map([["dead-orbit-v1", JSON.stringify(initialSave)]]);
  const gl = new Proxy(
    {},
    {
      get: (_, key) => {
        if (/^get(ShaderParameter|ProgramParameter)$/.test(key))
          return () => true;
        if (/^create/.test(key)) return () => ({});
        if (key === "getUniformLocation") return (_, name) => name;
        if (key === "getAttribLocation") return () => 0;
        return /^[A-Z_0-9]+$/.test(key) ? 1 : () => {};
      },
    },
  );
  function element(id) {
    if (!elements.has(id)) {
      const el = {
        id,
        hidden: false,
        style: {},
        dataset: {},
        value: "",
        textContent: "",
        classList: { toggle() {}, add() {}, remove() {} },
        addEventListener() {},
        setAttribute() {},
        focus() {},
        append() {},
        setPointerCapture() {},
        showModal() {
          this.open = true;
        },
        close() {
          this.open = false;
        },
        getContext: (type) =>
          type === "webgl" ? gl : new Proxy({}, { get: () => () => {} }),
        requestPointerLock: async () => {},
        querySelector: () => element("first-button"),
        querySelectorAll: () =>
          ["damage", "shield", "pulse"].map((type) => {
            const b = element(`upgrade-${type}`);
            b.dataset.upgrade = type;
            return b;
          }),
      };
      Object.defineProperty(el, "firstElementChild", {
        get: () => element(`${id}-child`),
      });
      elements.set(id, el);
    }
    return elements.get(id);
  }
  const document = {
    getElementById: element,
    createElement: element,
    querySelectorAll: () => [],
    addEventListener() {},
    body: element("body"),
    documentElement: element("html"),
    pointerLockElement: null,
    exitPointerLock() {},
  };
  const sandbox = {
    console,
    Math: Object.assign(Object.create(Math), { random: C.rng(12345) }),
    document,
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    matchMedia: () => ({ matches: false }),
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    requestAnimationFrame() {},
    addEventListener() {},
  };
  sandbox.window = sandbox;
  const exposed = `\nwindow.testGame = { startRun, update, updateHUD, fire, reloadWeapon, emp, damage, interact, pause, setPlaying, dash, enemyHit, robot, bladeMesh,
    get player() { return player; }, get level() { return level; }, get enemies() { return enemies; },
    get pickups() { return pickups; }, get bullets() { return bullets; },
    get state() { return { mode, deck, cardTaken, reloadTimer, empTimer, dashTimer, mapOpen, runSeed, bladeStep, bladeTimer, floorRecords }; },
    get interaction() { return interaction; }, set interaction(v) { interaction = v; },
    get keys() { return keys; }, toggleMap };\n})();`;
  vm.runInNewContext(
    `${coreSource}\n${musicSource}\n${gameSource.replace(/\}\)\(\);\s*$/, exposed)}`,
    sandbox,
  );
  return {
    game: sandbox.testGame,
    element,
    get saved() {
      return JSON.parse(storage.get("dead-orbit-v1"));
    },
    tick(seconds) {
      for (let i = 0; i < Math.ceil(seconds * 60); i++) {
        if (
          sandbox.testGame.state.mode === "playing" &&
          !sandbox.testGame.state.mapOpen
        )
          sandbox.testGame.update(1 / 60);
      }
    },
  };
}

test("300 generated decks have fully reachable rooms, enemies, supplies and distinct objectives", () => {
  for (let seed = 0; seed < 100; seed++)
    for (let deck = 0; deck < 3; deck++) {
      const level = C.generateDeck(seed, deck);
      const d = C.distances(
        level.map,
        Math.floor(level.start.x / C.CELL),
        Math.floor(level.start.z / C.CELL),
      );
      for (let z = 0; z < C.SIZE; z++)
        for (let x = 0; x < C.SIZE; x++) {
          if (!level.map[z][x])
            assert.ok(
              d[z * C.SIZE + x] >= 0,
              `unreachable floor: ${seed}/${deck}/${x}/${z}`,
            );
        }
      for (const p of [
        level.start,
        level.card,
        level.exit,
        ...level.enemies,
        ...level.pickups,
      ]) {
        assert.ok(
          C.fits(level.map, p.x, p.z, p.collisionRadius ?? 0.28, level.props),
          `blocked object: ${seed}/${deck}`,
        );
        assert.ok(
          d[Math.floor(p.z / C.CELL) * C.SIZE + Math.floor(p.x / C.CELL)] >= 0,
        );
      }
      assert.notEqual(level.card.room, level.exit.room);
      assert.ok(level.card.room > 0 && level.exit.room > 0);
    }
});

test("map seeds reproduce a run and later decks change layout", () => {
  assert.equal(
    JSON.stringify(C.generateDeck(77)),
    JSON.stringify(C.generateDeck(77)),
  );
  assert.notEqual(
    JSON.stringify(C.generateDeck(77).map),
    JSON.stringify(C.generateDeck(78).map),
  );
  assert.notEqual(
    JSON.stringify(C.generateDeck(77).map),
    JSON.stringify(C.generateDeck(77, 1).map),
  );
});

test("collision substeps prevent dash tunnelling, and allow sliding along walls", () => {
  const map = Array.from({ length: C.SIZE }, () => Array(C.SIZE).fill(1));
  for (let z = 2; z < 8; z++) for (let x = 2; x < 8; x++) map[z][x] = 0;
  const body = { x: 10, z: 10 };
  C.move(map, body, 100, 3);
  assert.ok(body.x < 20 - 0.28);
  assert.ok(body.z > 12.9);
  assert.ok(C.fits(map, body.x, body.z));
  C.move(map, body, -100, -100);
  assert.ok(body.x > 5.27 && body.z > 5.27);
});

test("wall rays handle cardinal directions, diagonal rays and occupied origins", () => {
  const map = Array.from({ length: C.SIZE }, () => Array(C.SIZE).fill(1));
  map[3][3] = 0;
  for (const [x, z] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ])
    assert.equal(C.rayWall(map, 8.75, 8.75, x, z), 1.25);
  assert.ok(
    Math.abs(
      C.rayWall(map, 8.75, 8.75, Math.SQRT1_2, Math.SQRT1_2) -
        1.25 * Math.SQRT2,
    ) < 1e-9,
  );
  assert.equal(C.rayWall(map, 1, 1, 1, 0), 0);
  assert.equal(C.rayWall(map, 8.75, 8.75, 1, 0, 0.5), 0.5);
});

test("continuous projectile collision detects crossings and respects the nearest wall", () => {
  const origin = { x: 0, y: 1, z: 0 },
    dir = { x: 1, y: 0, z: 0 },
    target = { x: 5, y: 1, z: 0 };
  assert.equal(C.segmentSphere(origin, dir, target, 0.5, 10), 4.5);
  assert.equal(C.segmentSphere(origin, dir, target, 0.5, 4), null);
  assert.equal(C.segmentSphere(origin, dir, { x: -5, y: 1, z: 0 }, 0.5), null);
  assert.equal(C.segmentSphere(origin, dir, origin, 0.5), 0);
});

test("shields absorb damage before health and damage cannot make health negative", () => {
  const p = C.newPlayer();
  assert.equal(C.hurt(p, 75), false);
  assert.equal(p.shield, 0);
  assert.equal(p.health, 85);
  assert.equal(C.hurt(p, 1000), true);
  assert.equal(p.health, 0);
});

test("faulty lights have sparse, independent voltage dips and stay steady with reduced motion", () => {
  const lamp = { seed: 47, phase: 3.2, period: 12.5 },
    other = { seed: 81, phase: 9.1, period: 17 };
  let dips = 0,
    minimum = 1,
    different = false;
  for (let step = 0; step < 6000; step++) {
    const time = step / 100,
      value = C.lightIntensity(lamp, time);
    assert.ok(Number.isFinite(value) && value >= 0.049 && value <= 1);
    assert.equal(
      value,
      C.lightIntensity(lamp, time),
      "stable at the same simulation time",
    );
    assert.equal(C.lightIntensity(lamp, time, true), 1);
    assert.equal(C.lightIntensity(null, time), 1);
    if (value < 0.99) dips++;
    minimum = Math.min(minimum, value);
    if (value !== C.lightIntensity(other, time)) different = true;
  }
  assert.ok(minimum < 0.3, "a failing tube visibly dims");
  assert.ok(
    dips > 0 && dips < 600,
    "most of the time the light remains steady",
  );
  assert.ok(different, "nearby faulty lamps do not blink in unison");
});

test("partial reload conserves ammo and resupply preserves upgrades", () => {
  const p = C.newPlayer();
  p.ammo = 20;
  p.reserve = 3;
  assert.equal(C.reload(p), 3);
  assert.equal(p.ammo, 23);
  assert.equal(p.reserve, 0);
  C.upgrade(p, "shield");
  C.upgrade(p, "damage");
  C.upgrade(p, "pulse");
  C.resupply(p);
  assert.equal(p.maxShield, 95);
  assert.equal(p.shield, 95);
  assert.equal(p.health, 125);
  assert.equal(p.damage, 34);
  assert.equal(p.ammo, 24);
  assert.equal(p.reserve, 96);
  assert.ok(p.empMax < 7 && p.dashMax < 2);
});

test("rifle fire, reload timing and melee with no ammunition use the live controller", () => {
  const { game: g, tick } = campaign();
  g.startRun();
  g.fire();
  assert.equal(g.player.ammo, 23);
  g.fire();
  assert.equal(g.player.ammo, 23, "cooldown prevents double fire");
  g.reloadWeapon();
  tick(0.5);
  assert.equal(g.player.ammo, 23, "reload is not instantaneous");
  tick(1);
  assert.equal(g.player.ammo, 24);
  assert.equal(g.player.reserve, 95);
  g.player.ammo = g.player.reserve = 0;
  g.player.weapon = 1;
  const e = g.enemies[0];
  e.x = g.player.x + 1.5;
  e.z = g.player.z;
  e.health = 40;
  g.player.yaw = Math.PI / 2;
  g.fire();
  assert.ok(e.health <= 0);
  assert.equal(g.player.kills, 1);
});

test("EMP stuns visible enemies, clears bolts and cannot fire during cooldown", () => {
  const { game: g } = campaign();
  g.startRun();
  const e = g.enemies[0];
  e.x = g.player.x + 1;
  e.z = g.player.z;
  e.health = 100;
  g.bullets.push({ x: g.player.x + 2, y: 1, z: g.player.z });
  g.emp();
  assert.equal(e.health, 66);
  assert.ok(e.stun > 3);
  assert.equal(g.bullets.length, 0);
  g.emp();
  assert.equal(e.health, 66);
  assert.equal(g.state.empTimer, g.player.empMax);
});

test("shield regeneration has a five-second damage delay", () => {
  const { game: g, tick } = campaign();
  g.startRun();
  g.enemies.forEach((e) => (e.health = 0));
  g.damage(30);
  const shield = g.player.shield;
  tick(4);
  assert.equal(g.player.shield, shield);
  tick(2);
  assert.ok(g.player.shield > shield);
});

test("map and pause clear held inputs and suspend the simulation", () => {
  const { game: g, tick } = campaign();
  g.startRun();
  g.keys.add("KeyW");
  g.toggleMap();
  const time = g.player.elapsed;
  tick(2);
  assert.equal(g.player.elapsed, time);
  assert.equal(g.keys.size, 0);
  g.toggleMap();
  tick(0.1);
  assert.ok(g.player.elapsed > time);
  g.keys.add("KeyJ");
  g.pause();
  assert.equal(g.state.mode, "paused");
  assert.equal(g.keys.size, 0);
});

test("endless runs require each keycard, count each cleared floor once, and continue past floor three", () => {
  const session = campaign({ best: 98765, musicVolume: 0.3 }),
    { game: g, element, tick } = session;
  g.startRun();
  assert.equal(
    g.state.floorRecords.standard,
    0,
    "legacy points are not floor records",
  );
  for (let deck = 0; deck < 16; deck++) {
    assert.equal(g.state.deck, deck);
    assert.equal(g.player.floorsCompleted, deck);
    assert.equal(g.state.cardTaken, false);
    g.updateHUD();
    assert.equal(
      element("deck-number").textContent,
      String(deck + 1).padStart(2, "0"),
    );
    assert.ok(element("deck-name").textContent);
    assert.match(
      element("run-progress").textContent,
      new RegExp(`^${deck} CLEARED`),
    );
    g.enemies.forEach((e) => (e.health = 0));
    g.player.x = g.level.exit.x;
    g.player.z = g.level.exit.z;
    tick(0.05);
    g.interact();
    assert.equal(
      g.state.mode,
      "playing",
      "a locked lift must not advance the campaign",
    );
    assert.equal(g.player.floorsCompleted, deck);
    g.player.x = g.level.card.x;
    g.player.z = g.level.card.z;
    tick(0.05);
    assert.equal(g.state.cardTaken, true);
    assert.equal(
      g.player.floorsCompleted,
      deck,
      "a card alone does not clear a floor",
    );
    g.player.x = g.level.exit.x;
    g.player.z = g.level.exit.z;
    tick(0.05);
    g.interact();
    assert.equal(g.state.mode, "upgrade");
    assert.equal(g.player.floorsCompleted, deck + 1);
    g.interact();
    assert.equal(
      g.player.floorsCompleted,
      deck + 1,
      "held use cannot count a lift twice",
    );
    assert.equal(
      session.saved.floorRecords.standard,
      deck + 1,
      "record saves before the next floor",
    );
    const choose = element(
      `upgrade-${deck % 2 === 0 ? "shield" : "damage"}`,
    ).onclick;
    choose();
    choose();
    assert.equal(
      g.state.deck,
      deck + 1,
      "repeated upgrade clicks cannot skip a floor",
    );
    assert.equal(g.player.upgrades.length, deck + 1);
    assert.equal(g.player.health, g.player.maxHealth);
  }
  assert.equal(g.state.mode, "playing");
  g.damage(1e9);
  assert.equal(g.state.mode, "dead");
  assert.equal(
    g.player.floorsCompleted,
    16,
    "dying on floor 17 still scores 16",
  );
  assert.match(element("menu-content").innerHTML, /Floors completed/);
  assert.match(element("menu-content").innerHTML, /New personal best/);
  assert.equal(session.saved.floorRecords.standard, 16);
  assert.equal(
    session.saved.musicVolume,
    0.3,
    "settings survive record writes",
  );
  const restored = campaign(session.saved);
  assert.equal(restored.game.state.floorRecords.standard, 16);
  assert.match(restored.element("best").textContent, /16 FLOORS/);
});

test("death and retry reset inventory, abilities, deck, upgrades and score", () => {
  const { game: g } = campaign();
  g.startRun();
  C.upgrade(g.player, "shield");
  g.emp();
  g.player.floorsCompleted = 9;
  g.damage(9999);
  assert.equal(g.state.mode, "dead");
  g.startRun();
  assert.equal(g.state.mode, "playing");
  assert.equal(g.state.deck, 0);
  assert.equal(g.player.maxShield, 60);
  assert.equal(g.player.upgrades.length, 0);
  assert.equal(g.player.ammo, 24);
  assert.equal(g.player.floorsCompleted, 0);
  assert.equal(g.state.floorRecords.standard, 9);
  assert.equal(g.state.empTimer, 0);
});

test("Explorer damage reduction survives retry without a difficulty selector", () => {
  const { game: g, element } = campaign();
  element("difficulty").value = "explorer";
  g.startRun();
  g.damage(20);
  assert.equal(g.player.shield, 50);
  g.damage(9999);
  element("difficulty").value = "";
  g.startRun();
  g.damage(20);
  assert.equal(g.player.shield, 50);
});

test("floor records stay separate by difficulty, never decrease, and reject invalid saved values", () => {
  const { game: g, element } = campaign({
    floorRecords: { standard: 12, explorer: 3 },
  });
  element("difficulty").onchange({ target: { value: "explorer" } });
  element("difficulty").value = "explorer";
  assert.match(element("best").textContent, /EXPLORER BEST \/ 3 FLOORS/);
  g.startRun();
  g.player.floorsCompleted = 5;
  g.damage(1e9);
  assert.equal(g.state.floorRecords.explorer, 5);
  assert.equal(g.state.floorRecords.standard, 12);
  g.startRun();
  g.damage(1e9);
  assert.equal(g.player.floorsCompleted, 0);
  assert.equal(g.state.floorRecords.explorer, 5);
  const corrupt = campaign({ floorRecords: { standard: -5, explorer: "900" } });
  assert.equal(corrupt.game.state.floorRecords.standard, 0);
  assert.equal(corrupt.game.state.floorRecords.explorer, 0);
});

test("late floors grow lethal while spawns, enemy movement and upgrade rates remain valid", () => {
  const tank = C.newPlayer(),
    gunner = C.newPlayer();
  for (let i = 0; i < 100; i++) {
    C.upgrade(tank, "shield");
    C.upgrade(gunner, "damage");
    C.upgrade(gunner, "pulse");
  }
  assert.ok(gunner.fireRate >= 0.065);
  assert.equal(gunner.empMax, 4);
  assert.equal(gunner.dashMax, 0.8);
  const lethal = C.makeEnemy(C.rng(42), "sentry", 100);
  assert.ok(
    lethal.damage * 0.5 > tank.maxHealth + tank.maxShield,
    "enemy damage eventually beats even an Explorer tank build",
  );
  assert.ok(
    lethal.maxHealth > gunner.damage * gunner.magSize,
    "late armor outpaces rifle upgrades",
  );
  let previousHealth = 0,
    previousDamage = 0;
  for (const deck of [0, 1, 2, 3, 9, 24, 99, 9999]) {
    const e = C.makeEnemy(C.rng(42), "sentry", deck);
    assert.ok(e.maxHealth > previousHealth && e.damage > previousDamage);
    previousHealth = e.maxHealth;
    previousDamage = e.damage;
    for (let seed = 0; seed < 12; seed++) {
      const level = C.generateDeck(seed, deck);
      assert.ok(level.enemies.length >= 8 && level.enemies.length <= 48);
      for (const enemy of level.enemies) {
        assert.ok(
          C.fits(
            level.map,
            enemy.x,
            enemy.z,
            enemy.collisionRadius,
            level.props,
          ),
          `blocked enemy spawn ${seed}/${deck}`,
        );
        assert.ok(
          enemy.speed < 10 && enemy.interval >= 0.42 && enemy.boltSpeed < 24,
        );
        for (const value of Object.values(enemy))
          if (typeof value === "number") assert.ok(Number.isFinite(value));
      }
      checkPassageClearance(level, `late ${seed}/${deck}`);
    }
  }
});

test("cabinets block walking, sprinting and dashing without trapping the player", () => {
  const { game: g, tick } = campaign();
  g.startRun();
  g.enemies.forEach((e) => (e.health = 0));
  const start = { x: g.player.x, z: g.player.z },
    cabinet = {
      type: "cabinet",
      x: start.x + 1.5,
      y: 1.18,
      z: start.z,
      w: 0.52,
      h: 2.35,
      d: 0.9,
    };
  g.level.props = [cabinet];
  g.player.yaw = Math.PI / 2;
  g.keys.add("KeyW");
  tick(1);
  assert.ok(g.player.x <= cabinet.x - cabinet.w / 2 - 0.28 + 0.001);
  g.keys.add("ShiftLeft");
  g.dash();
  tick(0.4);
  assert.ok(g.player.x <= cabinet.x - cabinet.w / 2 - 0.28 + 0.001);
  g.keys.clear();
  g.keys.add("KeyD");
  tick(0.5);
  g.keys.clear();
  g.keys.add("KeyW");
  tick(1);
  assert.ok(g.player.x > cabinet.x + 1, "can walk around the cabinet");
  assert.ok(C.fits(g.level.map, g.player.x, g.player.z, 0.28, g.level.props));
});

test("all cabinets and cases share blocking bounds with height-aware rays", () => {
  const level = C.generateDeck(72);
  const map = level.map;
  for (const p of level.props) {
    assert.equal(C.fits(map, p.x, p.z, 0.28, level.props), false);
    const origin = { x: p.x - 2, y: p.y, z: p.z },
      dir = { x: 1, y: 0, z: 0 };
    assert.ok(Math.abs(C.rayBox(origin, dir, p, 5) - (2 - p.w / 2)) < 1e-8);
    assert.equal(
      C.rayBox({ ...origin, y: p.y + p.h / 2 + 0.1 }, dir, p, 5),
      null,
    );
    assert.equal(C.rayBox(origin, { x: 0, y: 1, z: 0 }, p, 5), null);
    assert.equal(C.rayBox(p, dir, p, 5), 0);
  }
});

test("furniture blocks the rifle, blade, EMP and incoming enemy bolts", () => {
  const { game: g, tick } = campaign();
  g.startRun();
  g.enemies.forEach((e) => (e.health = 0));
  const p = g.player,
    x = p.x,
    z = p.z;
  g.level.props = [{ x: x + 1, y: 1.18, z, w: 0.52, h: 2.35, d: 1.4 }];
  const e = g.enemies[0];
  e.x = x + 2;
  e.z = z;
  e.y = 1.2;
  e.health = 200;
  e.stun = 100;
  p.yaw = Math.PI / 2;
  g.fire();
  assert.equal(e.health, 200);
  tick(0.2);
  p.weapon = 1;
  g.fire();
  assert.equal(e.health, 200);
  g.emp();
  assert.equal(e.health, 200);
  const shield = p.shield;
  g.bullets.push({
    x: x + 2,
    y: 1.2,
    z,
    dx: -1,
    dy: 0,
    dz: 0,
    speed: 9,
    life: 3,
    damage: 20,
  });
  tick(0.4);
  assert.equal(p.shield, shield);
  assert.equal(g.bullets.length, 0);
});

test("a connected route through cell centers still fits the player after furnishing 300 decks", () => {
  for (let seed = 0; seed < 100; seed++)
    for (let deck = 0; deck < 3; deck++) {
      const l = C.generateDeck(seed, deck),
        walkable = l.map.map((row, z) =>
          row.map((wall, x) =>
            wall ||
            !C.fits(
              l.map,
              (x + 0.5) * C.CELL,
              (z + 0.5) * C.CELL,
              0.28,
              l.props,
            )
              ? 1
              : 0,
          ),
        );
      const distance = C.distances(
        walkable,
        Math.floor(l.start.x / C.CELL),
        Math.floor(l.start.z / C.CELL),
      );
      for (const target of [l.card, l.exit, ...l.pickups])
        assert.ok(
          distance[
            Math.floor(target.z / C.CELL) * C.SIZE +
              Math.floor(target.x / C.CELL)
          ] >= 0,
          `blocked route ${seed}/${deck}`,
        );
    }
});

function checkPassageClearance(level, label) {
  const { map, rooms, props } = level;
  const roomAt = (x, z) =>
    rooms.find((r) => x >= r.x && x < r.x + r.w && z >= r.z && z < r.z + r.h);
  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  let crossings = 0;
  for (let z = 0; z < C.SIZE; z++)
    for (let x = 0; x < C.SIZE; x++) {
      if (map[z][x] !== 0) continue;
      const room = roomAt(x, z);
      const passage =
        !room ||
        directions.some(
          ([dx, dz]) =>
            map[z + dz]?.[x + dx] === 0 && roomAt(x + dx, z + dz) !== room,
        );
      if (!passage) continue;
      for (const p of props)
        assert.ok(
          p.x + p.w / 2 <= x * C.CELL ||
            p.x - p.w / 2 >= (x + 1) * C.CELL ||
            p.z + p.d / 2 <= z * C.CELL ||
            p.z - p.d / 2 >= (z + 1) * C.CELL,
          `${label}: furniture intrudes into passage ${x},${z}`,
        );
      for (const [dx, dz] of directions) {
        if (map[z + dz]?.[x + dx] !== 0) continue;
        if (room && roomAt(x + dx, z + dz) === room) continue;
        // Walk both edges and the center with the largest enemy's body radius.
        for (const lane of [-0.8, 0, 0.8]) {
          const body = {
            x: (x + 0.5) * C.CELL - dz * lane,
            z: (z + 0.5) * C.CELL + dx * lane,
          };
          const target = { x: body.x + dx * C.CELL, z: body.z + dz * C.CELL };
          assert.ok(
            C.fits(map, body.x, body.z, 0.44, props),
            `${label}: blocked approach`,
          );
          C.move(map, body, dx * C.CELL, dz * C.CELL, 0.44, props);
          assert.ok(
            Math.hypot(body.x - target.x, body.z - target.z) < 1e-8,
            `${label}: snag at ${x},${z} toward ${dx},${dz}, lane ${lane}`,
          );
          crossings++;
        }
      }
    }
  return crossings;
}

test("furniture leaves entrances clear on every room edge, including corner openings", () => {
  const room = { x: 4, z: 4, w: 4, h: 4 };
  for (const side of ["west", "east", "north", "south"])
    for (let slot = 0; slot < 4; slot++) {
      const map = Array.from({ length: C.SIZE }, () => Array(C.SIZE).fill(1));
      for (let z = 4; z < 8; z++) for (let x = 4; x < 8; x++) map[z][x] = 0;
      if (side === "west") map[4 + slot][3] = 0;
      if (side === "east") map[4 + slot][8] = 0;
      if (side === "north") map[3][4 + slot] = 0;
      if (side === "south") map[8][4 + slot] = 0;
      const props = C.stationProps(map, [room], () => 0);
      assert.ok(
        props.length > 0,
        "safe wall positions still receive furniture",
      );
      assert.ok(
        checkPassageClearance(
          { map, rooms: [room], props },
          `${side}/${slot}`,
        ) > 0,
      );
    }
});

test("300 furnished decks retain the full width of every hallway and doorway", () => {
  for (let seed = 0; seed < 100; seed++)
    for (let deck = 0; deck < 3; deck++)
      assert.ok(
        checkPassageClearance(C.generateDeck(seed, deck), `${seed}/${deck}`) >
          0,
        `exercise passages on deck ${seed}/${deck}`,
      );
});

test("enemy classes and traits are varied, bounded and deterministic", () => {
  const types = new Set(),
    traits = new Set(),
    health = new Set();
  for (let seed = 0; seed < 40; seed++)
    for (let deck = 0; deck < 3; deck++) {
      const l = C.generateDeck(seed, deck);
      assert.equal(
        JSON.stringify(l.enemies),
        JSON.stringify(C.generateDeck(seed, deck).enemies),
      );
      if (deck > 0) assert.equal(new Set(l.enemies.map((e) => e.type)).size, 6);
      for (const e of l.enemies) {
        types.add(e.type);
        traits.add(e.trait);
        health.add(e.maxHealth);
        assert.ok(e.health >= 25 && e.health < 340);
        assert.ok(e.speed > 0.4 && e.speed < 5);
        assert.ok(e.interval > 0.6 && e.interval < 4);
        assert.ok(e.scale > 0.65 && e.scale < 1.4);
      }
    }
  assert.equal(types.size, 6);
  assert.equal(traits.size, 4);
  assert.ok(health.size > 30);
});

test("bulwark armor resists frontal rifle fire and has flank, EMP and blade counters", () => {
  const e = {
    ...C.makeEnemy(C.rng(1), "bulwark"),
    x: 0,
    z: 0,
    angle: 0,
    stun: 0,
  };
  assert.equal(C.enemyDamage(e, 100, { x: 0, z: 2 }), 45);
  assert.equal(C.enemyDamage(e, 100, { x: 0, z: -2 }), 100);
  assert.equal(C.enemyDamage(e, 100, { x: 0, z: 2 }, true), 100);
  e.stun = 1;
  assert.equal(C.enemyDamage(e, 100, { x: 0, z: 2 }), 100);
});

test("the blade chains two cuts into a stronger finisher, then resets after a pause", () => {
  const { game: g, tick } = campaign();
  g.startRun();
  g.enemies.forEach((e) => (e.health = 0));
  g.player.weapon = 1;
  const e = g.enemies[0];
  const place = () => {
    e.x = g.player.x + 1.5;
    e.z = g.player.z;
    e.health = 1000;
    e.stun = 99;
  };
  g.player.yaw = Math.PI / 2;
  place();
  g.fire();
  assert.equal(e.health, 954);
  assert.equal(g.state.bladeStep, 0);
  tick(0.36);
  place();
  g.fire();
  assert.equal(e.health, 948);
  assert.equal(g.state.bladeStep, 1);
  tick(0.36);
  place();
  g.fire();
  assert.equal(e.health, 922);
  assert.equal(g.state.bladeStep, 2);
  assert.ok(e.stun >= 1.2);
  tick(1.1);
  place();
  g.fire();
  assert.equal(e.health, 954);
  assert.equal(g.state.bladeStep, 0);
});

test("blade parries return projectiles to enemies and cannot reflect bolts behind the pilot", () => {
  const { game: g, tick } = campaign();
  g.startRun();
  g.enemies.forEach((e) => (e.health = 0));
  g.player.weapon = 1;
  g.player.yaw = Math.PI / 2;
  g.player.x -= 1.25;
  const x = g.player.x,
    z = g.player.z,
    e = g.enemies[0];
  e.x = x + 4;
  e.z = z;
  e.y = 1.2;
  e.health = 50;
  e.stun = 99;
  g.bullets.push({
    x: x + 2,
    y: 1.2,
    z,
    dx: -1,
    dy: 0,
    dz: 0,
    speed: 9,
    life: 3,
    damage: 15,
  });
  g.bullets.push({
    x: x - 2,
    y: 1.2,
    z,
    dx: 1,
    dy: 0,
    dz: 0,
    speed: 1,
    life: 3,
    damage: 15,
  });
  const shield = g.player.shield;
  g.fire();
  assert.equal(g.bullets[0].friendly, true);
  assert.ok(!g.bullets[1].friendly);
  tick(0.2);
  assert.ok(e.health <= 0);
  assert.equal(g.player.shield, shield);
});

test("prism casters fire three distinct directions after a telegraphed windup", () => {
  const { game: g, tick } = campaign();
  g.startRun();
  g.enemies.forEach((e) => (e.health = 0));
  const e = g.enemies[0];
  Object.assign(e, C.makeEnemy(C.rng(4), "prism"), {
    x: g.player.x + 3,
    z: g.player.z,
    y: 1.2,
    alert: true,
    cooldown: 0,
    charge: 0,
    stun: 0,
  });
  tick(0.1);
  assert.ok(e.charge > 0);
  assert.equal(g.bullets.length, 0);
  tick(e.windup + 0.02);
  assert.equal(g.bullets.length, 3);
  assert.equal(new Set(g.bullets.map((b) => b.dz.toFixed(4))).size, 3);
});

test("all six enemy models and every cutlass combo pose produce finite geometry", () => {
  const { game: g, tick } = campaign();
  g.startRun();
  g.enemies.forEach((e) => (e.health = 0));
  const counts = new Set();
  for (const type of Object.keys(C.enemyTypes)) {
    const mesh = [],
      e = {
        ...C.makeEnemy(C.rng(8), type),
        x: 5,
        y: 1.2,
        z: 5,
        angle: 0.5,
        phase: 1,
        charge: 0.5,
        hit: 0,
        stun: 1,
      };
    g.robot(mesh, e, 2);
    assert.ok(mesh.length > 0 && mesh.length % 12 === 0);
    assert.ok(mesh.every(Number.isFinite));
    counts.add(mesh.length);
  }
  assert.ok(counts.size >= 5);
  g.player.weapon = 1;
  for (let i = 0; i < 3; i++) {
    g.fire();
    for (let j = 0; j < 3; j++) {
      tick(0.1);
      const mesh = g.bladeMesh(2);
      assert.ok(mesh.length > 0 && mesh.length % 12 === 0);
      assert.ok(mesh.every(Number.isFinite));
    }
    tick(0.07);
  }
});

class FakeAudio {
  constructor() {
    this.currentTime = 0;
    this.sampleRate = 8000;
    this.state = "running";
    this.sources = [];
    this.starts = [];
  }
  node() {
    const param = () => ({
      value: 0,
      setValueAtTime() {},
      linearRampToValueAtTime() {},
      exponentialRampToValueAtTime() {},
      setTargetAtTime() {},
      cancelScheduledValues() {},
    });
    return {
      connect() {},
      disconnect() {},
      gain: param(),
      frequency: param(),
      Q: param(),
      pan: param(),
      delayTime: param(),
    };
  }
  createGain() {
    return this.node();
  }
  createDelay() {
    return this.node();
  }
  createStereoPanner() {
    return this.node();
  }
  createBiquadFilter() {
    return this.node();
  }
  createPeriodicWave(real, imag) {
    assert.equal(real.length, imag.length);
    return {};
  }
  createBuffer(_, size) {
    const data = new Float32Array(size);
    return { getChannelData: () => data };
  }
  source() {
    const node = this.node();
    node.start = (time) => {
      assert.ok(Number.isFinite(time));
      this.starts.push(time);
    };
    node.stop = (time) => (node.stopTime = time);
    node.setPeriodicWave = () => {};
    this.sources.push(node);
    return node;
  }
  createOscillator() {
    return this.source();
  }
  createBufferSource() {
    return this.source();
  }
  advance(seconds) {
    this.currentTime += seconds;
    for (const source of this.sources)
      if (!source.ended && source.stopTime <= this.currentTime) {
        source.ended = true;
        source.onended?.();
      }
  }
}

test("the original 32-bar score contains bass, lead, arpeggios, drums and sectional variation", () => {
  const voices = new Set(),
    bars = [];
  for (let bar = 0; bar < 32; bar++) {
    const events = [];
    for (let i = 0; i < 16; i++)
      for (const note of M.score(bar * 16 + i, 2, false)) {
        events.push(note);
        voices.add(note.voice);
        assert.ok(note.volume > 0 && note.volume <= 0.5);
        assert.ok(note.length > 0 && note.length <= 4);
        assert.ok(note.note === 0 || (note.note >= 36 && note.note <= 100));
      }
    bars.push(JSON.stringify(events));
  }
  assert.equal(voices.size, 7);
  assert.ok(new Set(bars).size > 12);
  assert.ok(M.score(6, 0, true).length > M.score(6, 0, false).length);
  assert.equal(JSON.stringify(M.score(0)), JSON.stringify(M.score(512)));
});

test("music scheduling pauses, resumes without catch-up bursts, and cleans up voices", () => {
  const c = new FakeAudio(),
    music = new M.Player(c, c.node()),
    state = { enabled: true, deck: 0, volume: 0.55 };
  for (let i = 0; i < 400; i++) {
    music.tick(state);
    c.advance(0.025);
    assert.ok(music.voices.size < 70);
  }
  const step = music.step;
  music.tick({ ...state, enabled: false });
  c.advance(0.1);
  assert.equal(music.voices.size, 0);
  music.tick({ ...state, enabled: false });
  assert.equal(music.step, step);
  c.advance(60);
  const before = c.starts.length;
  music.tick(state);
  assert.ok(c.starts.length - before < 20);
  assert.ok(c.starts.slice(before).every((t) => t >= c.currentTime));
  c.advance(20);
  const count = c.starts.length;
  music.tick(state);
  assert.ok(c.starts.length - count < 20);
  music.tick({ ...state, enabled: false });
  c.advance(1);
  assert.equal(music.voices.size, 0);
});

test("the soundtrack keeps a playable tempo even on extremely late floors", () => {
  const audio = new FakeAudio(),
    music = new M.Player(audio, audio.node());
  const steps = new Set();
  music.note = (_, time, stepLength) => {
    assert.ok(stepLength > 0.08 && stepLength < 0.16);
    steps.add(time);
  };
  for (let i = 0; i < 400; i++) {
    music.tick({ enabled: true, deck: 1000000 });
    audio.advance(0.025);
  }
  assert.ok(steps.size > 0);
  const times = [...steps].sort((a, b) => a - b);
  for (let i = 1; i < times.length; i++)
    assert.ok(
      times[i] - times[i - 1] > 0.08,
      "notes keep audible spacing between steps",
    );
});
