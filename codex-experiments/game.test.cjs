"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const html = fs.readFileSync(`${__dirname}/game.html`, "utf8");
const coreSource = html.match(
  /<script id="orbit-core">([\s\S]*?)<\/script>/,
)[1];
const gameSource = html.match(
  /<script id="orbit-game">([\s\S]*?)<\/script>/,
)[1];
const C = vm.runInNewContext(`${coreSource}\nOrbitCore;`);

// Exercise the actual controller with only its platform boundaries stubbed.
// Rendering and DOM interaction are checked separately in a real browser.
function campaign() {
  const elements = new Map();
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
    document,
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    matchMedia: () => ({ matches: false }),
    localStorage: { getItem: () => "{}", setItem() {} },
    requestAnimationFrame() {},
    addEventListener() {},
  };
  sandbox.window = sandbox;
  const exposed = `\nwindow.testGame = { startRun, update, fire, reloadWeapon, emp, damage, interact, pause, setPlaying,
    get player() { return player; }, get level() { return level; }, get enemies() { return enemies; },
    get pickups() { return pickups; }, get bullets() { return bullets; },
    get state() { return { mode, deck, cardTaken, reloadTimer, empTimer, dashTimer, mapOpen, runSeed }; },
    get interaction() { return interaction; }, set interaction(v) { interaction = v; },
    get keys() { return keys; }, toggleMap };\n})();`;
  vm.runInNewContext(
    `${coreSource}\n${gameSource.replace(/\}\)\(\);\s*$/, exposed)}`,
    sandbox,
  );
  return {
    game: sandbox.testGame,
    element,
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
          C.fits(level.map, p.x, p.z),
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

test("full campaign requires each keycard, applies two upgrades, and ends in victory", () => {
  const { game: g, element, tick } = campaign();
  g.startRun();
  for (let deck = 0; deck < 3; deck++) {
    assert.equal(g.state.deck, deck);
    assert.equal(g.state.cardTaken, false);
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
    g.player.x = g.level.card.x;
    g.player.z = g.level.card.z;
    tick(0.05);
    assert.equal(g.state.cardTaken, true);
    g.player.x = g.level.exit.x;
    g.player.z = g.level.exit.z;
    tick(0.05);
    g.interact();
    if (deck < 2) {
      assert.equal(g.state.mode, "upgrade");
      element(`upgrade-${deck === 0 ? "shield" : "damage"}`).onclick();
      assert.equal(g.player.health, g.player.maxHealth);
    }
  }
  assert.equal(g.state.mode, "victory");
  assert.equal(g.player.upgrades.length, 2);
  assert.ok(g.player.score >= 3750);
});

test("death and retry reset inventory, abilities, deck, upgrades and score", () => {
  const { game: g } = campaign();
  g.startRun();
  C.upgrade(g.player, "shield");
  g.emp();
  g.player.score = 900;
  g.damage(9999);
  assert.equal(g.state.mode, "dead");
  g.startRun();
  assert.equal(g.state.mode, "playing");
  assert.equal(g.state.deck, 0);
  assert.equal(g.player.maxShield, 60);
  assert.equal(g.player.upgrades.length, 0);
  assert.equal(g.player.ammo, 24);
  assert.equal(g.player.score, 0);
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
