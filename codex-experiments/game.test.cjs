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
  const documentListeners = new Map(),
    windowListeners = new Map();
  const listen = (listeners, type, callback) => {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(callback);
  };
  let eventTime = 0,
    lockRequests = 0;
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
        requestPointerLock: async () => {
          lockRequests++;
        },
        querySelector: () => element("first-button"),
        querySelectorAll: () =>
          ["damage", "shield", "pulse", "blade"].map((type) => {
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
    addEventListener: (type, callback) =>
      listen(documentListeners, type, callback),
    body: element("body"),
    documentElement: element("html"),
    pointerLockElement: null,
    exitPointerLock() {
      document.pointerLockElement = null;
    },
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
    addEventListener: (type, callback) =>
      listen(windowListeners, type, callback),
  };
  sandbox.window = sandbox;
  const exposed = `\nwindow.testGame = { startRun, update, updatePressure, updateGuardian, moveGuardian, portalReady, guardianCrest, updateHUD, fire, reloadWeapon, emp, damage, interact, pause, setPlaying, dash, enemyHit, spawnerHit, breachMesh, robot, staffMesh, rifleMesh, portalMesh, sceneLights, lightBurst, staffPose, staffTransform,
    projectWaypoint, updateWaypoint, perspective, view, multiply, render, frame, empVisual, empMesh,
    get currentVP() { return currentVP; },
    get player() { return player; }, get level() { return level; }, get enemies() { return enemies; },
    get pickups() { return pickups; }, get bullets() { return bullets; },
    get spawners() { return spawners; },
    get guardian() { return guardian; },
    get state() { return { mode, deck, cardTaken, portalCharge, transitTimer, reloadTimer, empTimer, pulseTimer, empWave, dashTimer, mapOpen, runSeed, bladeStep, bladeTimer, floorRecords, contract, floorStats, upgradePicks, lightBursts, lockdownTier, lastDamage }; },
    get interaction() { return interaction; }, set interaction(v) { interaction = v; },
    get keys() { return keys; }, toggleMap };\n})();`;
  vm.runInNewContext(
    `${coreSource}\n${musicSource}\n${gameSource.replace(/\}\)\(\);\s*$/, exposed)}`,
    sandbox,
  );
  return {
    game: sandbox.testGame,
    element,
    get lockRequests() {
      return lockRequests;
    },
    viewport(w, h, dpr = 1) {
      sandbox.innerWidth = w;
      sandbox.innerHeight = h;
      sandbox.devicePixelRatio = dpr;
      this.event("resize", {}, "window");
    },
    event(type, properties = {}, target = "document") {
      eventTime = properties.timeStamp ?? eventTime + 10;
      const event = {
        timeStamp: eventTime,
        repeat: false,
        preventDefault() {},
        ...properties,
      };
      for (const callback of (target === "window"
        ? windowListeners
        : documentListeners
      ).get(type) ?? [])
        callback(event);
    },
    pointerLock(locked, properties = {}) {
      document.pointerLockElement = locked ? element("world") : null;
      this.event("pointerlockchange", properties);
    },
    setHidden(hidden) {
      document.hidden = hidden;
      this.event("visibilitychange");
    },
    get saved() {
      return JSON.parse(storage.get("dead-orbit-v1"));
    },
    tick(seconds) {
      for (let i = 0; i < Math.ceil(seconds * 60); i++) {
        if (
          (sandbox.testGame.state.mode === "playing" &&
            !sandbox.testGame.state.mapOpen) ||
          sandbox.testGame.state.mode === "transit"
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
      const stashes = level.pickups.filter((p) => p.type === "ammo");
      assert.equal(stashes.length, 2, "only two ammo stashes per floor");
      assert.ok(stashes.every((p) => p.amount === 12));
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

test("every floor mixes connected room silhouettes, proportions and ceiling heights", () => {
  for (let seed = 0; seed < 100; seed++) {
    const level = C.generateDeck(seed, seed % 11),
      silhouettes = new Set();
    for (const room of level.rooms) {
      const rows = level.map
        .slice(room.z, room.z + room.h)
        .map((row) => row.slice(room.x, room.x + room.w));
      silhouettes.add(rows.map((row) => row.join("")).join("/"));
      const reached = new Set(),
        queue = [[room.cx - room.x, room.cz - room.z]];
      for (let i = 0; i < queue.length; i++) {
        const [x, z] = queue[i],
          key = `${x}/${z}`;
        if (rows[z]?.[x] !== 0 || reached.has(key)) continue;
        reached.add(key);
        queue.push([x - 1, z], [x + 1, z], [x, z - 1], [x, z + 1]);
      }
      assert.equal(
        reached.size,
        rows.flat().filter((cell) => cell === 0).length,
        `room ${seed}/${room.index} has an isolated alcove`,
      );
    }
    assert.ok(
      silhouettes.size >= 5,
      "at least five actual floor shapes on every deck",
    );
    assert.ok(new Set(level.rooms.map((room) => room.ceiling)).size >= 3);
    assert.ok(
      level.rooms.some(
        (room) => Math.max(room.w / room.h, room.h / room.w) >= 2,
      ),
      "a long gallery breaks up the square rooms",
    );
  }
});

test("shaped rooms keep spawns separate and furniture out of walls and interior aisles", () => {
  for (let seed = 0; seed < 100; seed++) {
    const level = C.generateDeck(seed, 99);
    const positions = [
      level.start,
      level.card,
      level.exit,
      ...level.enemies,
      ...level.pickups,
    ];
    assert.equal(
      new Set(positions.map((p) => `${p.x}/${p.z}`)).size,
      positions.length,
      "spawns never share a floor tile with each other or objectives",
    );
    for (const prop of level.props)
      for (
        let z = Math.floor((prop.z - prop.d / 2) / C.CELL);
        z <= Math.floor((prop.z + prop.d / 2) / C.CELL);
        z++
      )
        for (
          let x = Math.floor((prop.x - prop.w / 2) / C.CELL);
          x <= Math.floor((prop.x + prop.w / 2) / C.CELL);
          x++
        ) {
          assert.equal(
            level.map[z][x],
            0,
            "no furniture inside cutaway corners or columns",
          );
          assert.ok(
            level.map[z][x - 1] === 0 || level.map[z][x + 1] === 0,
            "one-tile vertical aisles stay clear",
          );
          assert.ok(
            level.map[z - 1][x] === 0 || level.map[z + 1][x] === 0,
            "one-tile horizontal aisles stay clear",
          );
        }
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

test("wall clearance excludes protruding consoles on every face without enlarging furniture collision", () => {
  const map = Array.from({ length: C.SIZE }, () => Array(C.SIZE).fill(1));
  for (let z = 2; z < 8; z++) for (let x = 2; x < 8; x++) map[z][x] = 0;
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const point = (distance) => ({
      x: dx ? (dx > 0 ? 20 - distance : 5 + distance) : 10,
      z: dz ? (dz > 0 ? 20 - distance : 5 + distance) : 10,
    });
    const clipped = point(0.3),
      safe = point(0.45);
    assert.equal(
      C.fits(map, clipped.x, clipped.z),
      false,
      "old clearance put the camera inside a console's 0.315 m projection",
    );
    assert.equal(C.fits(map, safe.x, safe.z), true);
    assert.equal(
      C.fits(map, safe.x, safe.z, 0.75),
      false,
      "larger bodies still respect their own radius",
    );
  }
  const cabinet = { x: 10, z: 10, w: 0.5, d: 1 };
  assert.equal(C.fits(map, 10.55, 10, 0.28, [cabinet]), true);
  assert.equal(C.fits(map, 10.5, 10, 0.28, [cabinet]), false);
});

test("walking, sprinting and dashing stop outside wall decorations and still slide", () => {
  const { game: g, tick } = campaign();
  g.startRun();
  g.enemies.forEach((e) => (e.health = 0));
  g.level.props = [];
  g.level.map = Array.from({ length: C.SIZE }, () => Array(C.SIZE).fill(1));
  for (let z = 2; z < 8; z++) for (let x = 2; x < 8; x++) g.level.map[z][x] = 0;
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    g.keys.clear();
    tick(3);
    g.player.x = dx ? (dx > 0 ? 19.25 : 5.75) : 10;
    g.player.z = dz ? (dz > 0 ? 19.25 : 5.75) : 10;
    g.player.yaw = Math.atan2(dx, -dz);
    g.keys.add("KeyW");
    const clearance = () =>
      dx
        ? dx > 0
          ? 20 - g.player.x
          : g.player.x - 5
        : dz > 0
          ? 20 - g.player.z
          : g.player.z - 5;
    for (const action of [
      () => {},
      () => g.keys.add("ShiftLeft"),
      () => g.dash(),
    ]) {
      action();
      tick(0.4);
      assert.ok(clearance() >= 0.44 - 1e-8);
      assert.ok(
        clearance() - 0.315 > 0.12,
        "camera remains clear of the console face",
      );
    }
    const before = { x: g.player.x, z: g.player.z };
    g.keys.add("KeyD");
    tick(0.4);
    assert.ok(
      Math.hypot(g.player.x - before.x, g.player.z - before.z) > 1,
      "pressing into the wall still allows movement along it",
    );
    assert.ok(C.fits(g.level.map, g.player.x, g.player.z));
  }
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
  assert.equal(
    p.reserve,
    23,
    "the fabricator adds one magazine, not a full reserve",
  );
  assert.ok(p.empMax < 7 && p.dashMax < 2);
});

test("ammo grants and lift supplies respect two spare magazines without destroying carried rounds", () => {
  const start = C.newPlayer();
  assert.equal(start.ammo + start.reserve, 48);
  for (let loaded = 0; loaded <= 24; loaded++)
    for (let reserve = 0; reserve <= 48; reserve++) {
      const p = { ...start, ammo: loaded, reserve };
      const total = loaded + reserve;
      C.resupply(p);
      assert.equal(p.ammo + p.reserve, Math.min(72, total + 24));
      assert.ok(p.ammo <= 24 && p.reserve <= 48);
      const before = p.ammo + p.reserve;
      C.reload(p);
      assert.equal(p.ammo + p.reserve, before);
      const gained = C.addAmmo(p, 100);
      assert.equal(gained, 48 - (before - p.ammo));
      assert.equal(p.reserve, 48);
      assert.equal(C.addAmmo(p, 8), 0);
    }
});

test("partial pickups retain excess ammo and report only the rounds collected", () => {
  const { game: g, element, tick } = campaign();
  g.startRun();
  g.enemies.forEach((e) => (e.health = 0));
  const stash = {
    x: g.player.x,
    z: g.player.z,
    type: "ammo",
    amount: 12,
    taken: false,
  };
  g.pickups.push(stash);
  g.player.reserve = 47;
  tick(0.05);
  assert.equal(g.player.reserve, 48);
  assert.equal(stash.amount, 11);
  assert.equal(stash.taken, false);
  assert.match(element("toast").textContent, /^\+1 PULSE CELLS/);
  tick(0.1);
  assert.equal(stash.amount, 11, "a full reserve leaves the pickup alone");
  for (let i = 0; i < 4; i++) {
    g.fire();
    tick(0.2);
  }
  g.reloadWeapon();
  tick(1.5);
  assert.equal(g.player.ammo, 24);
  assert.equal(g.player.reserve, 48);
  assert.equal(
    stash.amount,
    7,
    "reload space is filled without losing the remainder",
  );
  g.updateHUD();
  assert.match(element("ammo").innerHTML, /48 \/ 48/);
});

test("crew caches cannot bypass the ammo cap or be collected twice", () => {
  const { game: g } = campaign();
  g.startRun();
  const cache = { x: g.player.x, z: g.player.z, type: "cache", taken: false };
  g.pickups.push(cache);
  g.interaction = { type: "cache", item: cache };
  g.player.reserve = 48;
  g.interact();
  assert.equal(
    cache.taken,
    false,
    "leave a cache when both health and ammo are full",
  );
  g.player.reserve = 47;
  g.player.health = 90;
  g.interact();
  assert.equal(g.player.reserve, 48);
  assert.equal(g.player.health, 100);
  assert.equal(g.player.caches, 1);
  const remainder = g.pickups.at(-1);
  assert.equal(remainder.type, "ammo");
  assert.equal(remainder.amount, 7);
  assert.equal(remainder.taken, false);
  g.interact();
  assert.equal(g.player.caches, 1);
  assert.equal(g.pickups.at(-1), remainder);
});

test("enemy ammo drops are uncommon six-round pickups", () => {
  const { game: g } = campaign();
  g.startRun();
  const enemy = g.enemies[0];
  for (let i = 0; i < 200; i++) {
    enemy.health = 1;
    g.enemyHit(enemy, 100, true);
  }
  const drops = g.pickups.filter((p) => p.drop);
  assert.ok(
    drops.length >= 20 && drops.length <= 60,
    `expected infrequent drops, got ${drops.length}/200`,
  );
  assert.ok(drops.every((p) => p.amount === 6));
  assert.equal(g.player.reserve, 24, "kills do not refill the gun directly");
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
  assert.equal(g.player.reserve, 23);
  g.player.ammo = g.player.reserve = 0;
  g.player.weapon = 1;
  const e = g.enemies[0];
  e.x = g.player.x + 1.5;
  e.z = g.player.z;
  e.health = 40;
  g.player.yaw = Math.PI / 2;
  g.fire();
  assert.equal(e.health, 40, "wind-up does not deal damage");
  tick(0.15);
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

test("EMP discharge links only affected targets and snapshots the cast position", () => {
  const { game: g } = campaign();
  g.startRun();
  g.level.map = Array.from({ length: C.SIZE }, (_, z) =>
    Array.from({ length: C.SIZE }, (_, x) =>
      x > 1 && x < 20 && z > 1 && z < 20 ? 0 : 1,
    ),
  );
  g.level.props = [{ x: 12, y: 1, z: 13.5, w: 1, h: 2, d: 0.25 }];
  Object.assign(g.player, { x: 12, z: 12 });
  g.enemies.forEach((e) => (e.health = 0));
  g.spawners.forEach((e) => (e.health = 0));
  const [near, covered, far] = g.enemies;
  Object.assign(near, { x: 14, y: 1.1, z: 12, health: 100 });
  Object.assign(covered, { x: 12, y: 1, z: 15, health: 100 });
  Object.assign(far, { x: 22, y: 1, z: 12, health: 100 });
  const [node, coveredNode] = g.spawners;
  Object.assign(node, { x: 15, y: 0.6, z: 11, health: 100 });
  Object.assign(coveredNode, { x: 12, y: 0.6, z: 16, health: 100 });
  g.emp();
  const wave = g.state.empWave;
  assert.deepEqual(
    Array.from(wave.targets, (p) => ({ ...p })),
    [
      { x: 14, y: 1.1, z: 12 },
      { x: 15, y: 0.6, z: 11 },
    ],
  );
  assert.equal(near.health, 66);
  assert.equal(node.health, 66);
  assert.equal(covered.health, 100);
  assert.equal(coveredNode.health, 100);
  assert.equal(far.health, 100);
  g.player.x += 1;
  near.x += 1;
  g.emp();
  assert.equal(g.state.empWave, wave, "cooldown cannot replace an active wave");
  assert.equal(g.empVisual().x, 12, "moving does not drag the sphere");
  assert.equal(
    wave.targets[0].x,
    14,
    "discharge endpoints stay at the hit location",
  );
  assert.ok(
    g
      .sceneLights([13, 1.55, 12])
      .some((l) => l.x === 12 && l.y === 1 && l.z === 12 && l.power === 5),
    "the flash stays at the cast origin too",
  );
});

test("EMP wave pauses with simulation, expires, and clears through transit and retry", () => {
  const s = campaign(),
    g = s.game;
  g.startRun();
  g.enemies.forEach((e) => (e.health = 0));
  g.spawners.forEach((e) => (e.health = 0));
  g.emp();
  s.tick(0.2);
  const radius = g.empVisual().radius;
  g.toggleMap();
  s.tick(2);
  g.emp();
  assert.equal(g.empVisual().radius, radius);
  g.toggleMap();
  g.pause();
  s.tick(2);
  assert.equal(g.empVisual().radius, radius);
  g.setPlaying(false);
  s.setHidden(true);
  s.tick(2);
  assert.equal(g.empVisual().radius, radius);
  s.setHidden(false);
  g.setPlaying(false);
  s.tick(0.81);
  assert.equal(g.empVisual(), null);
  assert.equal(g.state.empWave, null);
  s.tick(12);
  Object.assign(g.player, g.level.card);
  s.tick(0.05);
  Object.assign(g.player, g.level.exit);
  s.tick(0.05);
  g.emp();
  assert.ok(g.state.empWave);
  g.interact();
  assert.equal(g.state.mode, "transit");
  assert.equal(g.state.empWave, null);
  s.tick(C.PORTAL.duration + 0.05);
  s.element("upgrade-blade").onclick();
  assert.equal(g.empVisual(), null);
  g.emp();
  assert.ok(g.empVisual());
  g.damage(1e9);
  g.startRun();
  assert.equal(g.empVisual(), null);
  assert.equal(g.state.empWave, null);
});

test("EMP geometry stays finite and bounded, with a stationary reduced-motion halo", () => {
  for (const reduced of [false, true]) {
    const { game: g } = campaign({ reduced });
    g.startRun();
    g.enemies.forEach((e) => (e.health = 0));
    g.spawners.forEach((e) => (e.health = 0));
    // More targets than the visual budget must not change the gameplay hit budget.
    const template = g.enemies[0];
    g.enemies.length = 0;
    for (let i = 0; i < 20; i++)
      g.enemies.push({
        ...template,
        x: g.player.x + 1,
        z: g.player.z,
        y: 1,
        health: 100,
      });
    const idle = [];
    g.empMesh(idle);
    assert.equal(idle.length, 0);
    g.emp();
    assert.equal(g.state.empWave.targets.length, 12);
    assert.ok(g.enemies.every((e) => e.health === 66));
    g.enemies.forEach((e) => (e.health = 0));
    let previousRadius = 0,
      previousAlpha = 1;
    for (let i = 0; i < 25; i++) {
      const wave = g.empVisual(),
        mesh = [];
      assert.ok(wave.radius >= previousRadius && wave.radius <= 9);
      assert.ok(wave.alpha >= 0 && wave.alpha <= 1);
      if (reduced) {
        assert.equal(wave.radius, 2.4);
        assert.ok(wave.alpha <= previousAlpha && wave.alpha <= 0.35);
      }
      previousRadius = wave.radius;
      previousAlpha = wave.alpha;
      g.empMesh(mesh);
      assert.equal(mesh.length % 36, 0);
      assert.ok(
        mesh.length / 12 < 7000,
        "bounded vertices independent of crowd size",
      );
      assert.ok(mesh.every(Number.isFinite));
      if (i > 0 || reduced) assert.ok(mesh.length > 0);
      for (let j = 0; j < mesh.length; j += 12) {
        assert.ok(
          Math.abs(Math.hypot(mesh[j + 3], mesh[j + 4], mesh[j + 5]) - 1) <
            1e-8,
        );
        if (reduced)
          assert.ok(
            Math.abs(mesh[j + 1] - 0.055) < 0.02,
            "no vertical cage or target arcs in reduced motion",
          );
      }
      g.update(0.04);
    }
    assert.equal(g.empVisual(), null);
    const expired = [];
    g.empMesh(expired);
    assert.equal(expired.length, 0);
  }
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

test("Escape toggles once despite native unlock ordering and delayed release notifications", async () => {
  for (const order of ["unlocked", "key-first", "unlock-first"]) {
    const s = campaign(),
      g = s.game;
    g.startRun();
    await new Promise(setImmediate);
    if (order !== "unlocked") s.pointerLock(true);
    if (order === "unlock-first") s.pointerLock(false);
    s.event("keydown", { code: "Escape" });
    if (order === "key-first") s.pointerLock(false);
    for (let i = 0; i < 4; i++)
      s.event("keydown", { code: "Escape", repeat: true });
    s.event("keyup", { code: "Escape" });
    assert.equal(g.state.mode, "paused", `${order}: first gesture pauses`);
    const requests = s.lockRequests;
    s.event("keydown", { code: "Escape" });
    assert.equal(
      g.state.mode,
      "paused",
      "wait until the unlock key is released",
    );
    for (let i = 0; i < 4; i++)
      s.event("keydown", { code: "Escape", repeat: true });
    s.event("keyup", { code: "Escape" });
    s.pointerLock(false);
    assert.equal(
      g.state.mode,
      "playing",
      `${order}: releasing Escape must not reopen pause`,
    );
    assert.equal(
      s.lockRequests,
      requests,
      "Escape does not race another pointer-lock request",
    );
    g.pause();
    s.element("resume").onclick();
    assert.ok(
      s.lockRequests > requests,
      "the resume button can still capture the mouse",
    );
  }
});

test("native unlock still pauses when keyboard events are swallowed, without eating a later Escape", async () => {
  const s = campaign(),
    g = s.game;
  g.startRun();
  await new Promise(setImmediate);
  s.pointerLock(true);
  g.keys.add("KeyW");
  s.pointerLock(false);
  assert.equal(g.state.mode, "paused");
  assert.equal(g.keys.size, 0);
  s.event("keydown", { code: "Escape", timeStamp: 1000 });
  s.event("keyup", { code: "Escape" });
  assert.equal(g.state.mode, "playing");
});

test("P ignores repeats, and Escape closes the map without recapturing on the unlock gesture", async () => {
  const s = campaign(),
    g = s.game;
  g.startRun();
  await new Promise(setImmediate);
  s.pointerLock(true);
  g.toggleMap();
  const requests = s.lockRequests;
  s.event("keydown", { code: "Escape" });
  s.event("keydown", { code: "Escape", repeat: true });
  s.event("keyup", { code: "Escape" });
  s.pointerLock(false);
  assert.equal(g.state.mapOpen, false);
  assert.equal(g.state.mode, "playing");
  assert.equal(s.lockRequests, requests);
  for (const mode of ["paused", "playing"]) {
    s.event("keydown", { code: "KeyP" });
    for (let i = 0; i < 4; i++)
      s.event("keydown", { code: "KeyP", repeat: true });
    s.event("keyup", { code: "KeyP" });
    assert.equal(g.state.mode, mode);
  }
});

test("focus loss cancels a pending Escape resume and late capture cannot steal a menu's pointer", async () => {
  for (const loss of ["blur", "visibility"]) {
    const s = campaign(),
      g = s.game;
    g.startRun();
    await new Promise(setImmediate);
    g.pause();
    s.pointerLock(true); // A request started before pausing arrives late.
    s.pointerLock(false);
    s.event("keydown", { code: "Escape" });
    if (loss === "blur") s.event("blur", {}, "window");
    else s.setHidden(true);
    s.event("keyup", { code: "Escape" });
    assert.equal(g.state.mode, "paused");
    if (loss === "visibility") s.setHidden(false);
    s.event("keydown", { code: "Escape" });
    s.event("keyup", { code: "Escape" });
    assert.equal(g.state.mode, "playing");
  }
});

test("portal crossings use the swept opening, including reverse and diagonal movement", () => {
  const portal = { x: 5, z: 8 };
  for (const [from, to, expected] of [
    [{ x: 5, z: 10 }, { x: 5, z: 6 }, true],
    [{ x: 5, z: 6 }, { x: 5, z: 10 }, true],
    [{ x: 4, z: 10 }, { x: 6, z: 6 }, true],
    [{ x: 3, z: 10 }, { x: 5, z: 6 }, false],
    [{ x: 5.8, z: 10 }, { x: 5.8, z: 6 }, false],
    [{ x: 4, z: 8 }, { x: 6, z: 8 }, false],
    [{ x: 5, z: 8 }, { x: 5, z: 8 }, false],
    [{ x: 5, z: 8.1 }, { x: 5, z: 8.05 }, false],
  ])
    assert.equal(C.crossesPortal(from, to, portal), expected);
});

test("walking or dashing through an unlocked portal safely completes exactly one floor", () => {
  for (const direction of [-1, 1])
    for (const boost of [false, true]) {
      const session = campaign(),
        { game: g, tick, element } = session;
      g.startRun();
      g.enemies.forEach((e) => (e.health = 0));
      Object.assign(g.player, g.level.card);
      tick(0.05);
      assert.equal(g.state.cardTaken, true);
      g.player.x = g.level.exit.x;
      g.player.z = g.level.exit.z + direction * 0.12;
      g.player.yaw = direction === 1 ? 0 : Math.PI;
      g.keys.add("KeyW");
      if (boost) g.dash();
      tick(0.05);
      assert.equal(g.state.mode, "transit");
      assert.equal(g.player.floorsCompleted, 1);
      assert.equal(session.saved.floorRecords.standard, 1);
      assert.equal(element("hud").hidden, true);
      const health = g.player.health,
        ammo = g.player.ammo;
      g.damage(1e9);
      g.fire();
      g.interact();
      assert.equal(
        g.player.health,
        health,
        "transit is safe from incoming damage",
      );
      assert.equal(g.player.ammo, ammo);
      assert.equal(g.player.floorsCompleted, 1);
      tick(C.PORTAL.duration + 0.05);
      assert.equal(g.state.mode, "upgrade");
      element("upgrade-shield").onclick();
      assert.equal(g.state.mode, "playing");
      assert.equal(g.state.deck, 1);
      assert.equal(g.state.cardTaken, false);
      assert.equal(g.state.portalCharge, 0);
      assert.equal(g.state.transitTimer, 0);
      assert.equal(element("hud").hidden, false);
    }
});

test("locked portals, standing nearby and passing beside the frame never clear a floor", () => {
  const { game: g, tick } = campaign();
  g.startRun();
  g.enemies.forEach((e) => (e.health = 0));
  g.player.x = g.level.exit.x;
  g.player.z = g.level.exit.z + 0.12;
  g.player.yaw = 0;
  g.keys.add("KeyW");
  tick(0.1);
  assert.equal(g.player.floorsCompleted, 0);
  assert.equal(g.state.mode, "playing");
  g.keys.clear();
  Object.assign(g.player, g.level.card);
  tick(0.05);
  g.player.x = g.level.exit.x + 0.8;
  g.player.z = g.level.exit.z + 0.12;
  g.keys.add("KeyW");
  tick(0.1);
  assert.equal(g.player.floorsCompleted, 0);
  g.keys.clear();
  g.player.x = g.level.exit.x;
  g.player.z = g.level.exit.z + 0.1;
  tick(0.3);
  assert.equal(g.state.mode, "playing");
  g.toggleMap();
  g.keys.add("KeyW");
  tick(0.2);
  assert.equal(g.player.floorsCompleted, 0);
});

test("portal meshes remain finite and reduced motion keeps their animation steady", () => {
  for (const reduced of [false, true]) {
    const { game: g, tick } = campaign({ reduced });
    g.startRun();
    g.enemies.forEach((e) => (e.health = 0));
    for (const unlocked of [false, true]) {
      if (unlocked) {
        Object.assign(g.player, g.level.card);
        tick(1);
      }
      const first = [],
        later = [];
      g.portalMesh(first, 1);
      g.portalMesh(later, 4);
      assert.ok(first.length > 0 && first.length % 12 === 0);
      assert.ok(first.every(Number.isFinite) && later.every(Number.isFinite));
      if (reduced) assert.deepEqual(first, later);
      else if (unlocked) assert.notDeepEqual(first, later);
    }
  }
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
    assert.equal(g.state.mode, "transit");
    tick(C.PORTAL.duration + 0.05);
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
  tick(0.15);
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
      for (const e of l.enemies.filter((enemy) => !enemy.boss)) {
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

test("the staff chains two strikes into a stronger finisher, then resets after a pause", () => {
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
  assert.equal(e.health, 1000);
  tick(0.15);
  assert.equal(e.health, 954);
  assert.equal(g.state.bladeStep, 0);
  tick(0.36);
  place();
  g.fire();
  assert.equal(e.health, 1000);
  tick(0.15);
  assert.equal(e.health, 948);
  assert.equal(g.state.bladeStep, 1);
  tick(0.36);
  place();
  g.fire();
  assert.equal(e.health, 1000);
  tick(0.24);
  assert.equal(e.health, 922);
  assert.equal(g.state.bladeStep, 2);
  assert.ok(
    e.stun > 1.16,
    "finisher stun has only advanced one simulation frame",
  );
  tick(1.1);
  place();
  g.fire();
  tick(0.15);
  assert.equal(e.health, 954);
  assert.equal(g.state.bladeStep, 0);
});

test("blade contact fires once, pauses during wind-up, and cancels when switching weapons", () => {
  for (const reduced of [false, true]) {
    const s = campaign({ reduced }),
      { game: g, tick } = s;
    g.startRun();
    g.enemies.forEach((e) => (e.health = 0));
    g.player.weapon = 1;
    g.player.yaw = Math.PI / 2;
    const e = g.enemies[0];
    Object.assign(e, {
      x: g.player.x + 1.5,
      z: g.player.z,
      health: 1000,
      stun: 99,
    });
    g.fire();
    tick(0.1);
    assert.equal(e.health, 1000);
    g.pause();
    tick(1);
    assert.equal(e.health, 1000);
    g.setPlaying(false);
    tick(0.05);
    assert.equal(e.health, 954);
    tick(0.4);
    assert.equal(e.health, 954, "follow-through cannot strike again");
    g.fire();
    s.event("keydown", { code: "Digit2" });
    s.event("keydown", { code: "Digit1" });
    tick(0.4);
    assert.equal(
      e.health,
      954,
      "switching away cancels even if immediately re-equipped",
    );
  }
});

test("staff swings extend forward with finite geometry, unit normals and camera clearance", () => {
  for (const [w, h] of [
    [1280, 720],
    [390, 680],
  ]) {
    for (const reduced of [false, true]) {
      const harness = campaign({ reduced }),
        { game: g, tick } = harness;
      harness.viewport(w, h);
      g.startRun();
      g.enemies.forEach((e) => (e.health = 0));
      g.player.weapon = 1;
      const idle = g.staffMesh(2);
      const depth = (mesh) => {
        let z = 0;
        for (let i = 2; i < mesh.length; i += 12) z = Math.min(z, mesh[i]);
        return z;
      };
      for (let step = 0; step < 3; step++) {
        g.fire();
        let furthest = 0;
        while (g.state.bladeTimer > 0) {
          tick(1 / 60);
          const mesh = g.staffMesh(2);
          assert.ok(mesh.every(Number.isFinite));
          furthest = Math.min(furthest, depth(mesh));
          for (let i = 0; i < mesh.length; i += 12) {
            assert.ok(
              mesh[i + 2] < -0.04,
              "weapon stays in front of the camera near plane",
            );
            assert.ok(
              Math.abs(Math.hypot(mesh[i + 3], mesh[i + 4], mesh[i + 5]) - 1) <
                1e-8,
              "3D transforms preserve lighting normals",
            );
          }
        }
        assert.ok(
          furthest < depth(idle) - (reduced ? 0.15 : 0.6),
          "each strike reaches forward instead of only rotating on screen",
        );
      }
    }
  }
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
  assert.ok(!g.bullets[0].friendly, "parry occurs as the blade swings through");
  tick(0.15);
  assert.equal(g.bullets[0].friendly, true);
  assert.ok(!g.bullets[1].friendly);
  tick(0.3);
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

test("all six enemy models and every staff combo pose produce finite geometry", () => {
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
      const mesh = g.staffMesh(2);
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

test("side contracts are deterministic, achievable and award completion once", () => {
  const kinds = new Set();
  for (let seed = 0; seed < 80; seed++) {
    const level = C.generateDeck(seed, seed % 6);
    const args = [
      seed,
      seed % 6,
      level.enemies.length,
      level.pickups.filter((p) => p.type === "cache").length,
    ];
    const contract = C.makeContract(...args);
    assert.equal(
      JSON.stringify(contract),
      JSON.stringify(C.makeContract(...args)),
    );
    kinds.add(contract.kind);
    assert.ok(
      contract.target > 0 &&
        contract.target <= (contract.kind === "caches" ? args[3] : args[2]),
    );
    assert.equal(C.advanceContract(contract, "unrelated"), false);
    assert.equal(contract.progress, 0);
    for (let i = 1; i <= contract.target; i++)
      assert.equal(
        C.advanceContract(contract, contract.kind),
        i === contract.target,
      );
    assert.equal(C.advanceContract(contract, contract.kind), false);
    assert.equal(contract.progress, contract.target);
  }
  assert.equal(kinds.size, 3);
});

test("a completed contract grants exactly two upgrade choices, then resets on the next floor", () => {
  const { game: g, tick, element } = campaign();
  g.startRun();
  const target = g.state.contract.target;
  for (let i = 0; i < target; i++) {
    g.enemies[i].health = 1;
    g.enemyHit(g.enemies[i], 10, true);
    g.enemyHit(g.enemies[i], 10, true);
  }
  assert.equal(
    g.state.contract.progress,
    target,
    "corpses cannot farm progress",
  );
  assert.equal(g.state.floorStats.kills, target);
  g.updateHUD();
  assert.match(element("contract-label").textContent, /SECURED/);
  g.enemies.forEach((e) => (e.health = 0));
  Object.assign(g.player, g.level.card);
  tick(0.05);
  Object.assign(g.player, g.level.exit);
  tick(0.05);
  g.interact();
  tick(C.PORTAL.duration + 0.05);
  assert.equal(g.state.upgradePicks, 2);
  assert.equal(g.player.floorsCompleted, 1);
  const firstChoice = element("upgrade-blade").onclick;
  firstChoice();
  firstChoice();
  assert.equal(
    g.state.upgradePicks,
    1,
    "stale clicks cannot consume the bonus selection",
  );
  assert.equal(g.player.bladeDamage, 12);
  assert.equal(g.player.parryDamage, 80);
  assert.equal(g.player.upgrades.length, 1);
  assert.equal(g.state.mode, "upgrade");
  element("upgrade-shield").onclick();
  assert.equal(g.state.mode, "playing");
  assert.equal(g.state.deck, 1);
  assert.equal(g.player.floorsCompleted, 1);
  assert.equal(g.player.upgrades.length, 2);
  assert.equal(g.player.health, g.player.maxHealth);
  assert.ok(g.player.ammo + g.player.reserve <= 72);
  assert.equal(g.state.contract.progress, 0);
  assert.equal(g.state.floorStats.kills, 0);
  g.damage(1e9);
  g.startRun();
  assert.equal(g.player.bladeDamage, 0);
  assert.equal(g.player.parryDamage, 64);
  assert.equal(g.state.upgradePicks, 0);
});

test("staff contracts count lethal staff strikes and arc upgrades increase their damage", () => {
  const { game: g, tick } = campaign();
  g.startRun();
  Object.assign(g.state.contract, {
    kind: "blade",
    target: 2,
    progress: 0,
    completed: false,
  });
  g.enemies.forEach((e) => (e.health = 0));
  g.player.weapon = 1;
  g.player.yaw = Math.PI / 2;
  C.upgrade(g.player, "blade");
  const e = g.enemies[0];
  Object.assign(e, {
    x: g.player.x + 1.5,
    z: g.player.z,
    health: 58,
    stun: 99,
  });
  g.fire();
  tick(0.15);
  assert.equal(e.health, 0);
  assert.equal(g.state.contract.progress, 1);
  e.health = 1;
  g.enemyHit(e, 2, true, "parry");
  assert.equal(
    g.state.contract.progress,
    1,
    "reflected and rifle kills are not blade kills",
  );
});

test("cache contracts advance only when supplies are actually salvaged", () => {
  const { game: g } = campaign();
  g.startRun();
  Object.assign(g.state.contract, {
    kind: "caches",
    target: 2,
    progress: 0,
    completed: false,
  });
  const cache = g.pickups.find((p) => p.type === "cache");
  g.interaction = { type: "cache", item: cache };
  g.player.reserve = C.AMMO.reserve;
  g.interact();
  assert.equal(g.state.contract.progress, 0);
  g.player.reserve -= 8;
  g.interact();
  g.interact();
  assert.equal(g.state.contract.progress, 1);
  assert.equal(g.state.floorStats.caches, 1);
});

test("transient lighting stays bounded, expires, and respects reduced motion", () => {
  for (const reduced of [false, true]) {
    const { game: g, tick } = campaign({ reduced });
    g.startRun();
    g.enemies.forEach((e) => (e.health = 0));
    for (let i = 0; i < 40; i++)
      g.lightBurst(g.player.x, 1.2, g.player.z, [1, 0.4, 0.1], 4, 0.3);
    assert.equal(g.state.lightBursts.length, reduced ? 0 : 12);
    const sources = g.sceneLights([g.player.x, 1.55, g.player.z]);
    assert.ok(sources.length > 0 && sources.length <= 10);
    assert.ok(
      sources.every((l) =>
        [l.x, l.y, l.z, l.power, ...l.color].every(Number.isFinite),
      ),
    );
    tick(0.4);
    assert.equal(g.state.lightBursts.length, 0);
  }
});

test("four distinct soundtracks contain complete, finite arrangements", () => {
  const arrangements = new Set();
  assert.equal(M.tracks.length, 4);
  for (let track = 0; track < 4; track++) {
    const notes = [],
      voices = new Set();
    for (let step = 0; step < 512; step++) {
      for (const event of M.score(step, 3, step >= 256, track)) {
        assert.ok(
          [event.note, event.length, event.volume, event.pan].every(
            Number.isFinite,
          ),
        );
        assert.ok(event.note === 0 || (event.note >= 36 && event.note <= 100));
        assert.ok(event.volume > 0 && event.volume <= 0.5);
        assert.ok(event.length > 0 && event.length <= 7);
        voices.add(event.voice);
        notes.push(event);
      }
    }
    assert.ok(
      voices.has("lead") &&
        voices.has("bass") &&
        voices.has("arp") &&
        voices.has("kick") &&
        voices.has("snare"),
    );
    arrangements.add(JSON.stringify(notes));
    assert.equal(M.trackFor(track), track);
    assert.equal(M.trackFor(track + 4), track);
  }
  assert.equal(arrangements.size, 4);
});

test("radio changes tracks on bar boundaries and cleans up every arrangement on pause", () => {
  const c = new FakeAudio(),
    music = new M.Player(c, c.node());
  music.tick({ enabled: true, track: 0 });
  assert.ok(music.step > 0 && music.step < 16);
  music.tick({ enabled: true, track: 1 });
  assert.equal(music.track, 0, "manual selection waits for the bar line");
  for (let i = 0; i < 100; i++) {
    c.advance(0.025);
    music.tick({ enabled: true, track: 1 });
  }
  assert.equal(music.track, 1);
  for (let track = 0; track < 4; track++) {
    music.stop();
    c.advance(2);
    for (let i = 0; i < 180; i++) {
      music.tick({ enabled: true, track, extraction: true, deck: 8 });
      c.advance(0.025);
      assert.ok(music.voices.size < 70);
    }
    assert.equal(music.track, track);
    music.tick({ enabled: false });
    c.advance(2);
    assert.equal(music.voices.size, 0);
  }
});

test("soundtrack selection persists safely before the audio context exists", () => {
  const s = campaign();
  s.element("music-track").onchange({ target: { value: "2" } });
  assert.equal(s.saved.musicTrack, 2);
  assert.equal(s.element("music-title").textContent, "REACTOR RUN");
  const restored = campaign(s.saved);
  assert.equal(restored.element("music-track").value, "2");
  restored.element("music-track").onchange({ target: { value: "1000" } });
  assert.equal(restored.saved.musicTrack, -1);
  assert.equal(restored.element("music-title").textContent, "ION RUNNER");
});

test("lockdown starts after one minute, surges every thirty seconds, and bounds cadence but not strength", () => {
  for (const difficulty of ["standard", "explorer"]) {
    assert.equal(C.floorClock(0, difficulty).next, 60);
    assert.equal(C.floorClock(59.99, difficulty).tier, 0);
    assert.equal(C.floorClock(60, difficulty).tier, 1);
    assert.equal(C.floorClock(60, difficulty).next, 30);
    assert.equal(C.floorClock(89.99, difficulty).tier, 1);
    assert.equal(C.floorClock(90, difficulty).tier, 2);
    assert.equal(C.floorClock(90, difficulty).next, 30);
    assert.equal(C.floorClock(120, difficulty).tier, 3);
  }
  for (const type of Object.keys(C.enemyTypes)) {
    const e = C.makeEnemy(C.rng(99), type, 4),
      original = { ...e };
    e.health = e.maxHealth / 2;
    C.strengthenEnemy(e, 1);
    assert.ok(e.maxHealth > original.maxHealth);
    assert.ok(e.damage > original.damage);
    assert.ok(e.speed > original.speed);
    assert.ok(e.interval < original.interval);
    assert.equal(
      e.health / e.maxHealth,
      0.5,
      "wounds are retained proportionally",
    );
    assert.equal(e.alert, true);
    const first = { ...e };
    C.strengthenEnemy(e, 1);
    assert.deepEqual({ ...e }, first, "same tier never compounds stats");
    C.strengthenEnemy(e, 1000);
    assert.ok(e.maxHealth > first.maxHealth * 100);
    assert.ok(e.speed <= 7 && e.boltSpeed <= 26 && e.interval >= 0.3);
    assert.ok(e.windup === 0 || e.windup >= 0.22);
    e.health = 0;
    C.strengthenEnemy(e, 1001);
    assert.equal(e.health, 0, "dead enemies are never resurrected");
  }
});

test("every floor has two reproducible, passable breach pads away from objectives and actors", () => {
  for (let seed = 1; seed <= 300; seed++) {
    const deck = seed % 30,
      level = C.generateDeck(seed, deck);
    assert.equal(level.spawners.length, 2);
    assert.deepEqual(level.spawners, C.generateDeck(seed, deck).spawners);
    assert.equal(new Set(level.spawners.map((s) => s.room)).size, 2);
    for (const node of level.spawners) {
      assert.ok(![0, level.exit.room, level.card.room].includes(node.room));
      assert.ok(C.fits(level.map, node.x, node.z, 0.75, level.props));
      for (const item of [
        ...level.enemies,
        ...level.pickups,
        level.start,
        level.card,
        level.exit,
      ])
        assert.ok(Math.hypot(item.x - node.x, item.z - node.z) >= C.CELL);
      const enemy = C.makeEnemy(C.rng(seed), "bulwark", deck),
        point = C.reinforcementSpot(
          level,
          node,
          enemy,
          level.start,
          level.enemies,
        );
      assert.ok(
        point,
        `clear reinforcement location: seed ${seed}, room ${node.room}`,
      );
      assert.ok(
        C.validReinforcementSpot(
          level,
          point,
          enemy,
          level.start,
          level.enemies,
          node,
        ),
      );
      assert.equal(
        C.validReinforcementSpot(
          level,
          point,
          enemy,
          point,
          level.enemies,
          node,
        ),
        false,
      );
      assert.equal(
        C.validReinforcementSpot(
          level,
          point,
          enemy,
          level.start,
          [...level.enemies, { ...enemy, ...point }],
          node,
        ),
        false,
      );
      const blocked = {
        ...level,
        props: [...level.props, { ...point, y: 1, w: 1, h: 2, d: 1 }],
      };
      assert.equal(
        C.validReinforcementSpot(blocked, point, enemy, level.start, [], node),
        false,
      );
    }
  }
});

test("floor clock and node production pause together and reset after lockdown extraction", () => {
  const s = campaign(),
    g = s.game;
  g.startRun();
  g.updateHUD();
  assert.equal(s.element("pressure-time").textContent, "01:00");
  g.enemies.forEach((e) => {
    e.stun = 1e6;
  });
  s.tick(1);
  const seconds = g.state.floorStats.seconds,
    cooldown = g.spawners[0].cooldown;
  g.pause();
  g.update(10);
  s.tick(2);
  assert.equal(g.state.floorStats.seconds, seconds);
  g.setPlaying(false);
  g.toggleMap();
  g.update(10);
  s.tick(2);
  assert.equal(g.state.floorStats.seconds, seconds);
  assert.equal(g.spawners[0].cooldown, cooldown);
  g.toggleMap();
  s.setHidden(true);
  s.tick(2);
  assert.equal(g.state.floorStats.seconds, seconds);
  s.setHidden(false);
  g.setPlaying(false);
  g.state.floorStats.seconds = 59.99;
  s.tick(0.05);
  assert.equal(g.state.lockdownTier, 1);
  assert.ok(g.enemies.every((e) => e.lockdownTier === 1 && e.alert));
  g.updateHUD();
  assert.equal(s.element("pressure-time").textContent, "00:30");
  const health = g.enemies[0].maxHealth;
  g.state.floorStats.seconds = 89.99;
  s.tick(0.05);
  assert.equal(g.state.lockdownTier, 2);
  assert.ok(g.enemies[0].maxHealth > health);
  g.updateHUD();
  assert.match(s.element("pressure-label").textContent, /LOCKDOWN 2/);
  assert.equal(s.element("pressure-time").textContent, "00:30");
  g.enemies.forEach((e) => (e.health = 0));
  g.spawners.forEach((node) => g.spawnerHit(node, 1e6));
  Object.assign(g.player, g.level.card);
  s.tick(0.05);
  Object.assign(g.player, g.level.exit);
  s.tick(0.05);
  g.interact();
  assert.equal(g.state.mode, "transit", "lockdown never seals the lift");
  const exitTime = g.state.floorStats.seconds;
  s.tick(C.PORTAL.duration + 0.05);
  assert.equal(g.state.floorStats.seconds, exitTime);
  assert.equal(g.state.mode, "upgrade");
  s.element("upgrade-blade").onclick();
  assert.equal(g.state.lockdownTier, 0);
  assert.equal(g.state.floorStats.seconds, 0);
  g.updateHUD();
  assert.equal(s.element("pressure-time").textContent, "01:00");
  assert.ok(
    g.spawners.every((node) => node.health === node.maxHealth && !node.pending),
  );
  assert.ok(g.enemies.every((e) => !e.lockdownTier));
  g.damage(1e9);
  g.startRun();
  assert.equal(g.state.floorStats.seconds, 0);
  assert.equal(g.state.lockdownTier, 0);
});

test("nodes telegraph individual reinforcements, inherit lockdown, and revalidate moving blockers", () => {
  const { game: g } = campaign();
  g.startRun();
  g.enemies.forEach((e) => (e.health = 0));
  const node = g.spawners[0],
    second = g.spawners[1];
  second.health = 0;
  node.cooldown = 0;
  g.updatePressure(0.01);
  assert.ok(node.pending);
  assert.equal(node.charge, C.BREACH.charge);
  const point = { ...node.pending.point },
    count = g.enemies.length;
  g.updatePressure(C.BREACH.charge / 2);
  assert.equal(g.enemies.length, count, "no early materialization");
  Object.assign(g.player, point);
  g.updatePressure(C.BREACH.charge);
  assert.equal(g.enemies.length, count, "player moved into marked pad");
  assert.equal(node.pending, null);
  assert.equal(node.cooldown, 3);
  Object.assign(g.player, g.level.start);
  g.state.floorStats.seconds = 90;
  node.cooldown = 0;
  g.updatePressure(0.01);
  assert.equal(g.state.lockdownTier, 2);
  assert.ok(node.pending);
  g.updatePressure(C.BREACH.charge);
  const e = g.enemies.at(-1);
  assert.equal(e.reinforcement, true);
  assert.equal(e.lockdownTier, 2);
  assert.ok(
    e.alert && e.stun > 0 && e.cooldown >= 1,
    "new enemies cannot attack on arrival",
  );
  assert.ok(
    node.cooldown < C.BREACH.interval,
    "lockdown accelerates production",
  );
  const pickups = g.pickups.length;
  for (let i = 0; i < 10; i++) {
    e.health = 1;
    g.enemyHit(e, 1e8, true);
  }
  assert.equal(
    g.pickups.length,
    pickups,
    "reinforcements cannot farm unlimited ammo",
  );
});

test("spawning obeys the live cap, prunes corpses, and never releases a backlog", () => {
  const { game: g } = campaign();
  g.startRun();
  const sample = g.enemies[0],
    node = g.spawners[0];
  g.spawners[1].health = 0;
  g.enemies.forEach((e) =>
    Object.assign(e, { x: g.level.start.x, z: g.level.start.z }),
  );
  while (g.enemies.length < C.BREACH.activeCap)
    g.enemies.push({ ...sample, id: 1000 + g.enemies.length });
  node.cooldown = 0;
  g.updatePressure(1000);
  assert.equal(g.enemies.length, C.BREACH.activeCap);
  assert.equal(node.pending, null);
  g.enemies.forEach((e) => (e.health = 0));
  while (g.enemies.length < C.BREACH.historyCap)
    g.enemies.push({ ...sample, health: 0 });
  for (let i = 0; i < 80; i++) {
    g.enemies.forEach((e) => (e.health = 0));
    node.cooldown = 0;
    g.updatePressure(0.01);
    assert.ok(node.pending);
    g.updatePressure(C.BREACH.charge);
    assert.equal(g.enemies.filter((e) => e.health > 0).length, 1);
    assert.ok(g.enemies.length <= C.BREACH.historyCap);
    assert.equal(new Set(g.enemies.map((e) => e.id)).size, g.enemies.length);
  }
  assert.ok(g.enemies.at(-1).id >= 80);
});

function stageBreach(g) {
  g.startRun();
  g.enemies.forEach((e) => (e.health = 0));
  const node = g.spawners[0];
  Object.assign(node, { x: g.player.x + 2, z: g.player.z });
  Object.assign(g.player, { yaw: Math.PI / 2, pitch: 0 });
  return node;
}

test("rifle, timed staff, and reflected bolts destroy nodes without awarding enemy kills", () => {
  for (const weapon of ["rifle", "blade", "reflected"]) {
    const { game: g, tick, element } = campaign(),
      node = stageBreach(g);
    const startX = node.x,
      startZ = node.z,
      health = node.health;
    g.updateHUD();
    assert.match(element("target-name").textContent, /BREACH NODE/);
    if (weapon === "rifle") {
      g.player.weapon = 2;
      g.fire();
      assert.equal(node.health, health - g.player.damage);
    } else if (weapon === "blade") {
      g.player.weapon = 1;
      g.fire();
      assert.equal(node.health, health);
      tick(0.15);
      assert.equal(node.health, health - 46);
      assert.equal(node.x, startX);
      assert.equal(node.z, startZ);
    } else {
      g.bullets.push({
        x: g.player.x,
        y: node.y,
        z: node.z,
        dx: 1,
        dy: 0,
        dz: 0,
        speed: 30,
        damage: 64,
        life: 1,
        friendly: true,
      });
      tick(0.1);
      assert.equal(node.health, health - 64);
    }
    const pickups = g.pickups.length,
      progress = g.state.contract.progress;
    g.spawnerHit(node, 1e6);
    g.spawnerHit(node, 1e6);
    g.updatePressure(1000);
    assert.equal(node.health, 0);
    assert.equal(node.pending, null);
    assert.equal(g.state.floorStats.kills, 0);
    assert.equal(g.player.kills, 0);
    assert.equal(g.state.contract.progress, progress);
    assert.equal(g.pickups.length, pickups);
  }
});

test("EMP cancels production for eight seconds, while walls protect breach cores", () => {
  const { game: g, tick } = campaign(),
    node = stageBreach(g);
  node.pending = {
    point: { x: node.x + 2, z: node.z },
    enemy: C.makeEnemy(C.rng(1), "drone"),
  };
  node.charge = 1;
  node.cooldown = 0;
  g.emp();
  assert.equal(node.health, node.maxHealth - 34);
  assert.equal(node.pending, null);
  assert.equal(node.stun, 8);
  g.updatePressure(7.9);
  assert.ok(node.stun > 0);
  assert.equal(node.cooldown, 8);
  tick(0.2);
  assert.equal(node.stun, 0);
  assert.equal(node.pending, null);
  g.level.props.push({
    x: g.player.x + 1,
    z: g.player.z,
    y: 1,
    w: 0.25,
    d: 2,
    h: 2,
  });
  const health = node.health;
  g.player.weapon = 2;
  g.fire();
  g.player.weapon = 1;
  tick(0.2);
  g.fire();
  tick(0.2);
  assert.equal(node.health, health, "cover blocks gun and blade");
  tick(12);
  g.emp();
  assert.equal(node.health, health, "cover blocks EMP");
});

test("breach core and spawn warning geometry stay finite through charge, EMP, destruction and reduced motion", () => {
  for (const reduced of [false, true]) {
    const { game: g } = campaign({ reduced });
    g.startRun();
    const node = g.spawners[0];
    node.cooldown = 0;
    g.updatePressure(0.01);
    assert.ok(node.pending);
    for (const state of [
      { charge: 2.4 },
      { charge: 1.2 },
      { charge: 0 },
      { stun: 8 },
      { health: 0 },
    ]) {
      Object.assign(node, state);
      const mesh = [];
      g.breachMesh(mesh, node, 10);
      assert.ok(mesh.length > 100 && mesh.length < 50000);
      assert.ok(mesh.every(Number.isFinite));
    }
  }
});

test("every generated floor reserves one reachable guardian beside its portal, with rotating forms", () => {
  for (let seed = 0; seed < 100; seed++) {
    let previous;
    for (const deck of [0, 1, 2, 3, 12, 10000]) {
      const level = C.generateDeck(seed, deck),
        bosses = level.enemies.filter((e) => e.boss);
      assert.equal(bosses.length, 1);
      const boss = bosses[0];
      assert.equal(boss.room, level.exit.room);
      assert.ok(Math.hypot(boss.x - level.exit.x, boss.z - level.exit.z) <= 5);
      assert.ok(
        C.fits(level.map, boss.x, boss.z, boss.collisionRadius, level.props),
      );
      assert.ok(boss.health > 250 && Number.isFinite(boss.health));
      assert.equal(boss.health, boss.maxHealth);
      assert.ok(level.enemies.length <= 48);
      for (const item of [
        ...level.pickups,
        level.card,
        level.exit,
        ...level.enemies.filter((e) => e !== boss),
      ])
        assert.ok(Math.hypot(boss.x - item.x, boss.z - item.z) >= C.CELL);
      if (deck > 0 && deck <= 3) assert.notEqual(boss.boss, previous);
      previous = boss.boss;
    }
  }
});

function guardianArena(kind, reduced = false) {
  const session = campaign({ reduced }),
    g = session.game;
  g.startRun();
  g.enemies.forEach((e) => (e.health = 0));
  g.spawners.forEach((e) => (e.health = 0));
  const boss = g.guardian,
    room = g.level.rooms[boss.room],
    seed = C.guardianTypes.findIndex((spec) => spec.boss === kind);
  Object.assign(room, { x: 2, z: 2, w: 8, h: 8, cx: 6, cz: 6 });
  g.level.map = Array.from({ length: C.SIZE }, () => Array(C.SIZE).fill(1));
  for (let z = 2; z < 10; z++)
    for (let x = 2; x < 10; x++) g.level.map[z][x] = 0;
  g.level.props = [];
  Object.assign(g.level.start, { x: 10, z: 10 });
  Object.assign(g.level.card, { x: 23, z: 23 });
  Object.assign(g.level.exit, { x: 20, z: 20 });
  Object.assign(boss, C.makeGuardian(seed, 0), {
    x: 12,
    y: 1.2,
    z: 12,
    homeX: 12,
    homeZ: 12,
    encountered: true,
    enraged: false,
    charge: 0,
    cooldown: 0,
    recover: 0,
    stun: 0,
    hit: 0,
    rush: 0,
    angle: Math.PI / 2,
  });
  Object.assign(g.player, {
    x: 17,
    z: 12,
    yaw: -Math.PI / 2,
    health: 1e6,
    maxHealth: 1e6,
    shield: 0,
    maxShield: 0,
  });
  return session;
}

test("guardian volleys have distinct patterns, a locked wind-up, and a stronger half-health phase", () => {
  for (const [kind, normal, enraged] of [
    ["bastion", 2, 3],
    ["sovereign", 5, 7],
  ]) {
    const { game: g, element } = guardianArena(kind),
      boss = g.guardian;
    g.updateGuardian(boss, 0.01);
    assert.ok(boss.charge >= 0.65);
    assert.equal(g.bullets.length, 0);
    const aim = { ...boss.aim };
    g.player.z += 2;
    g.updateGuardian(boss, boss.charge / 2);
    assert.deepEqual(
      { ...boss.aim },
      aim,
      "telegraphed aim does not track the dodge",
    );
    assert.equal(g.bullets.length, 0);
    g.updateGuardian(boss, boss.charge + 0.01);
    assert.equal(g.bullets.length, normal);
    assert.equal(new Set(g.bullets.map((b) => b.dz.toFixed(5))).size, normal);
    assert.ok(boss.recover > 0);
    assert.ok(
      g.bullets.every((b) => Math.abs(Math.hypot(b.dx, b.dy, b.dz) - 1) < 1e-8),
    );
    g.bullets.length = 0;
    Object.assign(boss, {
      health: boss.maxHealth / 2,
      recover: 0,
      cooldown: 0,
    });
    g.updateGuardian(boss, 0.01);
    assert.equal(boss.enraged, true);
    g.updateGuardian(boss, boss.charge + 0.01);
    assert.equal(g.bullets.length, enraged);
    g.updateHUD();
    assert.equal(element("boss-banner").hidden, false);
    assert.match(element("boss-name").textContent, /50%/);
    assert.match(element("boss-status").textContent, /ENRAGED/);
  }
});

test("the Reaver telegraphs a straight rush that can be sidestepped and hits only once", () => {
  for (const dodge of [false, true]) {
    const { game: g } = guardianArena("reaver"),
      boss = g.guardian;
    g.updateGuardian(boss, 0.01);
    const origin = { x: boss.x, z: boss.z },
      health = g.player.health;
    assert.ok(boss.charge > 0);
    if (dodge) g.player.z += 3;
    g.updateGuardian(boss, boss.charge + 0.01);
    assert.equal(g.bullets.length, 0);
    assert.ok(boss.rush > 0);
    for (let i = 0; i < 50; i++) g.updateGuardian(boss, 1 / 60);
    assert.ok(boss.x > origin.x + 5 && Math.abs(boss.z - origin.z) < 0.01);
    assert.equal(g.player.health, dodge ? health : health - boss.damage);
    if (!dodge)
      assert.ok(
        Math.abs(g.state.lastDamage.bearing + Math.PI / 2) < 1e-8,
        "the rush indicator points toward the impact origin after the boss passes the player",
      );
    else assert.equal(g.state.lastDamage, null);
    assert.equal(boss.rush, 0);
    assert.ok(boss.recover > 0);
  }
});

test("guardian movement and rushes respect props, walls and the lift-room boundary", () => {
  const { game: g } = guardianArena("reaver"),
    boss = g.guardian,
    health = boss.health;
  g.level.props.push({ x: 14, z: 12, y: 1, w: 0.5, h: 2, d: 3 });
  g.moveGuardian(boss, 10, 0);
  assert.ok(boss.x <= 13.75 - boss.collisionRadius + 1e-8);
  assert.ok(
    C.fits(g.level.map, boss.x, boss.z, boss.collisionRadius, g.level.props),
  );
  g.level.props = [];
  g.moveGuardian(boss, 100, -100);
  assert.ok(
    boss.x <= 25 - boss.collisionRadius && boss.z >= 5 + boss.collisionRadius,
  );
  assert.equal(boss.health, health, "leaving combat does not reset health");
  Object.assign(boss, { x: 12, z: 12, rush: 0.75, rushX: -1, rushZ: 0 });
  for (let i = 0; i < 60; i++) g.updateGuardian(boss, 1 / 60);
  assert.ok(
    C.fits(g.level.map, boss.x, boss.z, boss.collisionRadius, g.level.props),
  );
  assert.ok(boss.x >= 5 + boss.collisionRadius);
});

test("Bastion armor opens during attacks and recovery, while EMP interrupts all guardian forms", () => {
  for (const spec of C.guardianTypes) {
    const { game: g, tick } = guardianArena(spec.boss),
      boss = g.guardian;
    if (spec.boss === "bastion") {
      assert.equal(C.enemyDamage(boss, 100, g.player), 45);
      boss.charge = 1;
      assert.equal(C.enemyDamage(boss, 100, g.player), 100);
      boss.charge = 0;
      boss.recover = 1;
      assert.equal(C.enemyDamage(boss, 100, g.player), 100);
      boss.recover = 0;
    }
    boss.charge = 1;
    boss.aim = { x: g.player.x, y: 1.2, z: g.player.z };
    boss.rush = 0.75;
    g.emp();
    assert.equal(boss.charge, 0);
    assert.equal(boss.rush, 0);
    assert.equal(boss.stun, 1.4);
    tick(1);
    assert.ok(boss.stun > 0);
    assert.equal(g.bullets.length, 0);
    tick(0.5);
    assert.equal(boss.stun, 0);
  }
});

test("guardians resist staff stagger, but strikes and returned projectiles still damage them", () => {
  const { game: g, tick } = guardianArena("bastion"),
    boss = g.guardian;
  Object.assign(g.player, { x: 13.5, z: 12, weapon: 1 });
  Object.assign(boss, { charge: 1, aim: { x: 13.5, y: 1.2, z: 12 } });
  const health = boss.health;
  g.fire();
  tick(0.15);
  assert.equal(boss.health, health - 46);
  assert.equal(boss.stun, 0);
  assert.ok(
    boss.charge > 0,
    "light attacks cannot repeatedly cancel the boss wind-up",
  );
  boss.charge = 0;
  boss.cooldown = 10;
  g.bullets.push({
    x: 13.5,
    y: 1.2,
    z: 12,
    dx: -1,
    dy: 0,
    dz: 0,
    friendly: true,
    damage: 64,
    speed: 20,
    life: 2,
  });
  tick(0.1);
  assert.equal(
    boss.health,
    health - 110,
    "returned bolts bypass frontal armor",
  );
});

test("both card and guardian defeat are required for transit, in either order, and reset next floor", () => {
  for (const cardFirst of [true, false]) {
    const { game: g, tick, element } = campaign();
    g.startRun();
    g.enemies.forEach((e) => {
      if (!e.boss) e.health = 0;
    });
    g.spawners.forEach((e) => (e.health = 0));
    const guardianKind = g.guardian.boss;
    if (cardFirst) {
      Object.assign(g.player, g.level.card);
      tick(0.05);
      Object.assign(g.player, g.level.exit);
      tick(0.05);
      g.interact();
      assert.equal(g.state.mode, "playing");
      assert.equal(g.portalReady(), false);
      assert.equal(g.state.portalCharge, 0);
      g.player.z = g.level.exit.z - 1;
      g.player.yaw = Math.PI;
      g.keys.add("KeyW");
      g.dash();
      tick(0.1);
      g.keys.clear();
      assert.equal(
        g.player.floorsCompleted,
        0,
        "dashing through the seal cannot bypass a living guardian",
      );
    }
    const kills = g.player.kills;
    g.enemyHit(g.guardian, 1e9, true);
    g.enemyHit(g.guardian, 1e9, true);
    assert.equal(g.player.kills, kills + 1);
    if (!cardFirst) {
      Object.assign(g.player, g.level.exit);
      tick(0.05);
      g.interact();
      assert.equal(g.state.mode, "playing");
      assert.equal(g.portalReady(), false);
      Object.assign(g.player, g.level.card);
      tick(0.05);
    }
    assert.equal(g.portalReady(), true);
    Object.assign(g.player, g.level.exit);
    tick(0.05);
    g.interact();
    assert.equal(g.state.mode, "transit");
    assert.equal(g.player.floorsCompleted, 1);
    tick(C.PORTAL.duration + 0.05);
    element("upgrade-blade").onclick();
    assert.equal(g.state.mode, "playing");
    assert.ok(g.guardian.health > 0);
    assert.notEqual(g.guardian.boss, guardianKind);
    assert.equal(g.guardian.encountered, false);
    assert.equal(g.portalReady(), false);
    g.damage(1e9);
    g.startRun();
    assert.equal(g.state.deck, 0);
    assert.ok(g.guardian.health > 0 && !g.guardian.encountered);
  }
});

test("guardian wind-ups pause with the map, and lockdown preserves wounds", () => {
  const { game: g, tick } = guardianArena("sovereign"),
    boss = g.guardian;
  g.updateGuardian(boss, 0.01);
  const charge = boss.charge;
  g.toggleMap();
  tick(4);
  assert.equal(boss.charge, charge);
  g.toggleMap();
  boss.health = boss.maxHealth * 0.4;
  const damage = boss.damage;
  g.state.floorStats.seconds = 60;
  tick(0.02);
  assert.ok(boss.damage > damage);
  assert.ok(Math.abs(boss.health / boss.maxHealth - 0.4) < 1e-10);
  assert.equal(boss.enraged, true);
});

test("all guardian silhouettes and sealed portal geometry remain finite in normal and reduced motion", () => {
  for (const reduced of [false, true])
    for (const spec of C.guardianTypes) {
      const { game: g } = guardianArena(spec.boss, reduced),
        boss = g.guardian;
      for (const state of [
        { charge: 0 },
        { charge: 1 },
        { enraged: true },
        { stun: 1 },
      ]) {
        Object.assign(boss, state);
        const mesh = [];
        g.robot(mesh, boss, reduced ? 0 : 2);
        g.guardianCrest(mesh, boss, 2);
        g.portalMesh(mesh, 2);
        assert.ok(mesh.length > 0 && mesh.length % 12 === 0);
        assert.ok(mesh.every(Number.isFinite));
      }
    }
});

test("standing inside the Reaver cannot neutralize its charge or cause repeated impact damage", () => {
  const { game: g } = guardianArena("reaver"),
    boss = g.guardian;
  Object.assign(g.player, { x: boss.x, z: boss.z });
  const health = g.player.health;
  g.updateGuardian(boss, 0.01);
  g.updateGuardian(boss, boss.charge + 0.01);
  assert.ok(Math.hypot(boss.rushX, boss.rushZ) > 0.99);
  g.updateGuardian(boss, 0.01);
  g.updateGuardian(boss, 0.01);
  assert.equal(g.player.health, health - boss.damage);
  assert.ok([boss.x, boss.z, boss.rushX, boss.rushZ].every(Number.isFinite));
});

test("the latest damage arc distinguishes all four directions and follows camera turns", () => {
  const { game: g, element } = campaign();
  g.startRun();
  g.player.yaw = 0;
  const health = g.player.health;
  const rotation = () =>
    Number(
      element("damage-bearing").style.transform.match(/rotate\((.*)rad\)/)[1],
    );
  for (const [x, z, expected] of [
    [0, -2, 0],
    [2, 0, Math.PI / 2],
    [0, 2, Math.PI],
    [-2, 0, -Math.PI / 2],
  ]) {
    g.damage(5, { x: g.player.x + x, z: g.player.z + z });
    g.updateHUD();
    assert.equal(element("damage-direction").hidden, false);
    assert.ok(Math.abs(rotation() - expected) < 1e-8);
    assert.equal(
      g.state.lastDamage.life,
      1.4,
      "a new hit replaces and refreshes the cue",
    );
  }
  assert.equal(
    g.player.health,
    health,
    "shield-only hits still give direction",
  );
  const source = { x: g.player.x + 5, z: g.player.z };
  g.damage(5, source);
  source.x = g.player.x - 5;
  g.player.yaw = Math.PI / 2;
  g.updateHUD();
  assert.ok(
    Math.abs(rotation()) < 1e-8,
    "facing the hit origin moves the arc to the front",
  );
  g.player.yaw = -Math.PI / 2;
  g.updateHUD();
  assert.ok(Math.abs(Math.abs(rotation()) - Math.PI) < 1e-8);
});

test("damage direction fades on game time, survives reduced motion, and resets after transit or retry", () => {
  for (const reduced of [false, true]) {
    const { game: g, tick, element } = campaign({ reduced });
    g.startRun();
    g.enemies.forEach((e) => (e.health = 0));
    g.damage(10, { x: g.player.x - 2, z: g.player.z });
    tick(1);
    g.updateHUD();
    assert.ok(Number(element("damage-direction").style.opacity) > 0);
    assert.ok(Number(element("damage-direction").style.opacity) < 1);
    if (reduced) assert.equal(element("damage").style.opacity, "0");
    const life = g.state.lastDamage.life;
    g.toggleMap();
    tick(3);
    assert.equal(g.state.lastDamage.life, life);
    g.toggleMap();
    g.pause();
    tick(3);
    assert.equal(g.state.lastDamage.life, life);
    g.setPlaying(false);
    tick(0.5);
    g.updateHUD();
    assert.equal(g.state.lastDamage, null);
    assert.equal(element("damage-direction").hidden, true);
    Object.assign(g.player, g.level.card);
    tick(0.05);
    Object.assign(g.player, g.level.exit);
    tick(0.05);
    g.damage(5, { x: g.player.x, z: g.player.z - 2 });
    g.interact();
    assert.equal(g.state.mode, "transit");
    assert.equal(g.state.lastDamage, null);
    tick(C.PORTAL.duration + 0.05);
    element("upgrade-blade").onclick();
    assert.equal(g.state.lastDamage, null);
    assert.equal(element("damage-direction").hidden, true);
    g.damage(1e9, { x: g.player.x + 2, z: g.player.z });
    g.startRun();
    assert.equal(g.state.lastDamage, null);
  }
});

test("incoming bolts and stalker attacks supply direction, while cover and friendly bolts do not", () => {
  const { game: g, tick } = campaign();
  g.startRun();
  g.enemies.forEach((e) => (e.health = 0));
  const origin = { x: g.player.x, z: g.player.z };
  const bolt = (friendly = false) => ({
    x: origin.x + 2,
    y: 1.2,
    z: origin.z,
    dx: -1,
    dy: 0,
    dz: 0,
    speed: 40,
    damage: 5,
    life: 1,
    friendly,
  });
  g.bullets.push(bolt(true));
  tick(0.1);
  assert.equal(g.state.lastDamage, null);
  g.level.props.push({
    x: origin.x + 1,
    y: 1,
    z: origin.z,
    w: 0.3,
    h: 2,
    d: 2,
  });
  g.bullets.push(bolt());
  tick(0.1);
  assert.equal(
    g.state.lastDamage,
    null,
    "a bolt stopped by cover is not a hit",
  );
  g.level.props.pop();
  g.bullets.push(bolt());
  tick(0.1);
  assert.ok(Math.abs(g.state.lastDamage.bearing - Math.PI / 2) < 1e-8);
  const e = g.enemies.find((enemy) => !enemy.boss);
  Object.assign(e, C.makeEnemy(C.rng(8), "stalker"), {
    x: origin.x - 1.4,
    z: origin.z,
    cooldown: 0,
    stun: 0,
    alert: true,
  });
  tick(0.02);
  assert.ok(Math.abs(g.state.lastDamage.bearing + Math.PI / 2) < 1e-8);
});

test("invalid hits and hits without a known direction cannot create misleading damage arcs", () => {
  const { game: g } = campaign();
  g.startRun();
  const source = { x: g.player.x + 2, z: g.player.z },
    shield = g.player.shield;
  for (const amount of [0, -1, NaN, Infinity]) g.damage(amount, source);
  assert.equal(g.player.shield, shield);
  assert.equal(g.state.lastDamage, null);
  g.toggleMap();
  g.damage(10, source);
  assert.equal(g.state.lastDamage, null);
  g.toggleMap();
  g.damage(5, source);
  assert.ok(g.state.lastDamage);
  g.damage(5);
  assert.equal(g.state.lastDamage, null);
  g.damage(5, { x: g.player.x, z: g.player.z });
  assert.equal(
    g.state.lastDamage,
    null,
    "overlapping origins have no meaningful horizontal bearing",
  );
});

test("objective waypoints match perspective at different viewports and dash fields of view", () => {
  const { game: g } = campaign();
  for (const [w, h] of [
    [1280, 720],
    [390, 844],
    [844, 390],
  ])
    for (const fov of [74, 88, 102]) {
      const focal = 1 / Math.tan((fov * Math.PI) / 360),
        v = g.multiply(
          g.perspective((fov * Math.PI) / 180, w / h),
          g.view([0, 1.55, 0], 0, 0),
        );
      for (const x of [-1, 0, 1]) {
        const marker = g.projectWaypoint(v, { x, z: -20 }, w, h);
        assert.ok(
          Math.abs(marker.x - (w / 2 + ((x / 20) * focal * h) / 2)) < 0.001,
        );
        assert.ok(
          Math.abs(marker.y - (h / 2 - ((0.05 / 20) * focal * h) / 2)) < 0.001,
        );
        assert.equal(marker.arrow, 0, "a visible objective keeps its diamond");
      }
    }
});

test("objective waypoints stay continuous through screen edges, the camera plane, and directly behind", () => {
  const { game: g } = campaign();
  for (const [w, h] of [
    [1280, 720],
    [320, 640],
    [390, 844],
    [844, 390],
  ])
    for (const pitch of [-0.9, 0, 0.9]) {
      let previous;
      for (let step = 0; step <= 1440; step++) {
        const yaw = (step * Math.PI) / 720,
          v = g.multiply(
            g.perspective((74 * Math.PI) / 180, w / h),
            g.view([12, 1.55, 8], yaw, pitch),
          ),
          marker = g.projectWaypoint(v, { x: 12, z: -12 }, w, h);
        assert.ok(Object.values(marker).every(Number.isFinite));
        assert.ok(marker.x >= w * 0.14 - 0.001 && marker.x <= w * 0.86 + 0.001);
        assert.ok(
          marker.x >= 80 - 0.001 && marker.x <= w - 80 + 0.001,
          "the longest label retains horizontal clearance on phones",
        );
        assert.ok(marker.y >= h * 0.3 - 0.001 && marker.y <= h * 0.66 + 0.001);
        if (previous) {
          assert.ok(
            Math.hypot(
              (marker.x - previous.x) / w,
              (marker.y - previous.y) / h,
            ) < 0.015,
            `waypoint jumped at yaw ${yaw}, pitch ${pitch}, viewport ${w}×${h}`,
          );
          assert.ok(
            Math.abs(marker.arrow - previous.arrow) < 0.3,
            "edge glyph crossfades without a pop",
          );
        }
        if (step === 720) {
          assert.ok(Math.abs(marker.x - w / 2) < 0.001);
          assert.ok(Math.abs(marker.y - h * 0.66) < 0.001);
          assert.ok(Math.abs(marker.angle - Math.PI / 2) < 0.001);
          assert.equal(
            marker.arrow,
            1,
            "a target behind stays on the lower rim",
          );
        }
        previous = marker;
      }
    }
});

test("objective waypoints update on every rendered frame using its camera, including after resize", () => {
  const harness = campaign({ reduced: true }),
    { game: g, element } = harness;
  g.startRun();
  g.enemies.forEach((e) => (e.health = 0));
  Object.assign(g.level.card, { x: g.player.x + 2, z: g.player.z - 20 });
  g.player.yaw = 0;
  const position = () =>
    element("waypoint")
      .style.transform.match(/translate3d\(([^p]+)px, ([^p]+)px/)
      .slice(1)
      .map(Number);
  const check = (w, h) => {
    const expected = g.projectWaypoint(g.currentVP, g.level.card, w, h),
      [x, y] = position();
    assert.ok(Math.abs(x - expected.x) < 0.0001);
    assert.ok(Math.abs(y - expected.y) < 0.0001);
  };
  g.frame(1000);
  let last = position();
  for (let i = 1; i <= 5; i++) {
    g.player.yaw += 0.015;
    g.player.pitch += 0.005;
    g.frame(1000 + i * 8);
    check(1280, 720);
    assert.notDeepEqual(
      position(),
      last,
      "120 Hz camera turns must not wait for the 20 Hz HUD timer",
    );
    last = position();
  }
  harness.viewport(390, 844, 3);
  g.frame(1048);
  check(390, 844);
  assert.equal(
    element("world").width,
    585,
    "CSS pixels remain independent of render resolution",
  );
});

test("objective waypoints fade smoothly on approach and immediately select card, guardian, or lift", () => {
  const { game: g, element, tick } = campaign({ reduced: true });
  g.startRun();
  g.enemies.filter((e) => !e.boss).forEach((e) => (e.health = 0));
  g.player.yaw = 0;
  const start = { x: g.player.x, z: g.player.z };
  let previous = 0;
  for (const distance of [2, 2.5, 2.99, 3, 3.01, 3.5, 4]) {
    Object.assign(g.level.card, { x: start.x, z: start.z - distance });
    g.render(0);
    g.updateWaypoint();
    const opacity = Number(element("waypoint").style.opacity);
    assert.ok(opacity >= previous && opacity <= 0.85);
    if (Math.abs(distance - 3) <= 0.01)
      assert.ok(Math.abs(opacity - 0.425) < 0.01);
    previous = opacity;
  }
  assert.equal(element("waypoint-label").textContent, "CARD · 4m");
  Object.assign(g.player, g.level.card);
  tick(0.02);
  Object.assign(g.player, start);
  g.render(0);
  g.updateWaypoint();
  assert.match(element("waypoint-label").textContent, /^GUARDIAN · /);
  assert.equal(element("waypoint").style.color, "#ff9388");
  g.guardian.health = 0;
  g.updateWaypoint();
  assert.match(element("waypoint-label").textContent, /^LIFT · /);
  assert.equal(element("waypoint").style.color, "#9af5d3");
  g.startRun();
  g.frame(1000);
  assert.match(element("waypoint-label").textContent, /^CARD · /);
  assert.equal(element("waypoint").style.color, "#ffad66");
});

test("staff strikes alternate impact heads and keep the finisher a wide horizontal sweep", () => {
  const { game: g } = campaign();
  const head = (step, progress, end) =>
    g.staffTransform(g.staffPose(step, progress, false), 0, end * 1.335, 0);
  for (const [step, end] of [
    [0, 1],
    [1, -1],
  ]) {
    const tip = head(step, 0.42, end),
      butt = head(step, 0.42, -end);
    assert.ok(
      tip[2] < butt[2] - 1.5,
      "the correct impact head leads into the strike",
    );
    assert.ok(tip[2] < -2.4, "contact extends forward into the fight");
    assert.ok(
      Math.abs(tip[0]) < 0.3 && Math.abs(tip[1]) < 0.25,
      "the striking end travels toward the aim point",
    );
  }
  const start = head(2, 0.2, 1),
    finish = head(2, 0.64, 1);
  assert.ok(
    start[0] > 1 && finish[0] < -1,
    "the finisher crosses from right to left",
  );
  assert.ok(
    Math.abs(start[1] - finish[1]) < 0.05,
    "the sweep stays level instead of chopping downward",
  );
});

test("detailed rifle geometry stays finite and clear of the camera through recoil and reload", () => {
  for (const [w, h] of [
    [1280, 720],
    [390, 680],
  ])
    for (const reduced of [false, true]) {
      const harness = campaign({ reduced }),
        { game: g, tick } = harness;
      harness.viewport(w, h);
      g.startRun();
      g.enemies.forEach((e) => (e.health = 0));
      g.spawners.forEach((e) => (e.health = 0));
      const check = () => {
        const mesh = g.rifleMesh(2);
        assert.ok(mesh.length > 0 && mesh.length % 12 === 0);
        assert.ok(mesh.every(Number.isFinite));
        for (let i = 0; i < mesh.length; i += 12) {
          assert.ok(
            mesh[i + 2] < -0.04,
            "hands, display, and moving parts remain in front of the near plane",
          );
          assert.ok(
            Math.abs(Math.hypot(mesh[i + 3], mesh[i + 4], mesh[i + 5]) - 1) <
              1e-8,
            "lighting normals remain normalized through the whole rifle transform",
          );
          if (mesh[i + 9] === 0.85) {
            const focal = 1 / Math.tan((65 * Math.PI) / 360),
              x = w / 2 + ((mesh[i] / -mesh[i + 2]) * focal * h) / 2,
              y = h / 2 - ((mesh[i + 1] / -mesh[i + 2]) * focal * h) / 2;
            assert.ok(
              x > 8 && x < w - 8 && y > 8 && y < h - 16,
              "the physical ammo digits stay in view during recoil and reload",
            );
          }
        }
        return mesh;
      };
      const idle = check();
      g.fire();
      const shot = check();
      assert.equal(g.player.ammo, 23);
      if (!reduced)
        assert.notEqual(
          shot.length,
          idle.length,
          "a fired pulse adds a muzzle ring and flare",
        );
      else
        assert.equal(
          shot.length,
          idle.length,
          "reduced motion suppresses the firing flash",
        );
      tick(0.2);
      g.reloadWeapon();
      for (let i = 0; i < 14; i++) {
        check();
        tick(0.1);
      }
      assert.equal(g.player.ammo, 24);
      assert.equal(
        g.player.reserve,
        23,
        "the makeover preserves ammunition accounting",
      );
    }
});

test("the rifle's physical counter and charge strip reflect loaded, low, empty, and reloading ammo", () => {
  const { game: g, tick } = campaign({ reduced: true });
  g.startRun();
  g.enemies.forEach((e) => (e.health = 0));
  const readout = () => {
    const mesh = g.rifleMesh(0),
      digits = [],
      bars = [];
    for (let i = 0; i < mesh.length; i += 12) {
      if (mesh[i + 9] === 0.85) digits.push(mesh.slice(i, i + 12));
      if (mesh[i + 9] === 0.65) bars.push(mesh.slice(i, i + 12));
    }
    return { digits, bars };
  };
  for (const [ammo, segments, bars] of [
    [24, 9, 12],
    [23, 10, 12],
    [6, 12, 3],
    [3, 11, 2],
    [0, 12, 0],
  ]) {
    g.player.ammo = ammo;
    const result = readout(),
      color = ammo <= 6 ? [1, 0.15, 0.09] : [0.24, 0.93, 0.75];
    assert.equal(
      result.digits.length,
      segments * 6,
      `physical digits show ${String(ammo).padStart(2, "0")}`,
    );
    assert.equal(result.bars.length, bars * 6);
    assert.ok(
      result.digits.every((v) =>
        color.every((c, i) => Math.abs(v[i + 6] - c) < 1e-8),
      ),
    );
  }
  g.player.ammo = 3;
  g.reloadWeapon();
  tick(g.player.reloadDuration / 2);
  const midway = readout();
  assert.equal(
    g.player.ammo,
    3,
    "digits keep showing real loaded rounds until the reload completes",
  );
  assert.equal(midway.digits.length, 11 * 6);
  assert.ok(
    midway.digits.every(
      (v) => Math.abs(v[6] - 1) < 1e-8 && Math.abs(v[7] - 0.44) < 1e-8,
    ),
  );
  assert.ok(
    midway.bars.length > 0 && midway.bars.length < 12 * 6,
    "the strip indicates reload progress",
  );
  tick(g.player.reloadDuration);
  assert.equal(g.player.ammo, 24);
  assert.equal(readout().digits.length, 9 * 6);
  assert.equal(readout().bars.length, 12 * 6);
});
