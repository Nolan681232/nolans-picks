// Castle layout and the kinematic body. Pure data + math so the rules can be tested
// without WebGL. The tower is a fat cardboard column; stairs wrap the outside and
// meet a top deck. Inside the outer walls is guards' land. Outside is zombies' land.

export const STEP = 0.62;
export const BODY_R = 0.42;
export const BODY_H = 1.62;
export const TAG_R = 1.28;
export const TAG_H = 2.05;

export const WALL_OUTER = 26;
export const WALL_THICK = 1.9;
export const WALL_H = 3.6;
export const GATE_HALF = 3.75;
export const DECK_Y = 16.2;
export const COLUMN = 4.58;
export const STAIR_OUTER = 8.35;

const INNER = WALL_OUTER - WALL_THICK;

const FLOORS = [];
const SOLIDS = [];

function addSolid(minX, maxX, minY, maxY, minZ, maxZ, kind, walk = true) {
  const s = { minX, maxX, minY, maxY, minZ, maxZ, kind };
  SOLIDS.push(s);
  if (walk) FLOORS.push({ x0: minX, x1: maxX, z0: minZ, z1: maxZ, y: maxY, kind });
  return s;
}

function addPad(x0, x1, z0, z1, y) {
  addSolid(Math.min(x0, x1), Math.max(x0, x1), Math.max(0, y - 0.5), y, Math.min(z0, z1), Math.max(z0, z1), "pad");
}

function addRamp(axis, a0, a1, b0, b1, y0, y1) {
  const n = Math.max(2, Math.round(Math.abs(a1 - a0) / 0.7));
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const s0 = a0 + (a1 - a0) * t0;
    const s1 = a0 + (a1 - a0) * t1;
    const y = y0 + (y1 - y0) * t1;
    const x0 = axis === "x" ? Math.min(s0, s1) : Math.min(b0, b1);
    const x1 = axis === "x" ? Math.max(s0, s1) : Math.max(b0, b1);
    const z0 = axis === "z" ? Math.min(s0, s1) : Math.min(b0, b1);
    const z1 = axis === "z" ? Math.max(s0, s1) : Math.max(b0, b1);
    addSolid(x0, x1, 0, y, z0, z1, "stair");
  }
}

function sampleRamp(axis, a0, a1, b0, b1, y0, y1) {
  const mid = (b0 + b1) / 2;
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 1.1));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = a0 + (a1 - a0) * t;
    pts.push(axis === "x" ? { x: a, z: mid } : { x: mid, z: a });
  }
  return pts;
}

function build() {
  // Walls. South wall is split by the gate.
  addSolid(-WALL_OUTER, -GATE_HALF, 0, WALL_H, -WALL_OUTER, -INNER, "wall");
  addSolid(GATE_HALF, WALL_OUTER, 0, WALL_H, -WALL_OUTER, -INNER, "wall");
  addSolid(-WALL_OUTER, WALL_OUTER, 0, WALL_H, INNER, WALL_OUTER, "wall");
  addSolid(-WALL_OUTER, -INNER, 0, WALL_H, -WALL_OUTER, WALL_OUTER, "wall");
  addSolid(INNER, WALL_OUTER, 0, WALL_H, -WALL_OUTER, WALL_OUTER, "wall");
  // Lintel over the gate. High enough to walk under, too high to hop over.
  addSolid(-GATE_HALF - 0.4, GATE_HALF + 0.4, 3.2, 4.25, -WALL_OUTER, -INNER, "lintel");

  // Central tower column. Its roof is the goal platform.
  addSolid(-COLUMN, COLUMN, 0, DECK_Y, -COLUMN, COLUMN, "tower");
  // Crown on the roof so the tower reads as tall. Not the whole roof.
  addSolid(-1.45, 1.45, DECK_Y, 22.4, -1.45, 1.45, "crown");

  // Spiral stairs up the outside of the column. Each run rises, pads turn the corner.
  // South, low. Starts near the ground so the first step is short.
  addRamp("x", -7.6, 5.5, -STAIR_OUTER, -COLUMN - 0.02, 0.12, 4.15);
  addPad(5.15, STAIR_OUTER, -STAIR_OUTER, -COLUMN - 0.02, 4.15);
  // East.
  addRamp("z", -5.6, 5.5, COLUMN + 0.02, STAIR_OUTER, 4.15, 8.15);
  addPad(COLUMN + 0.02, STAIR_OUTER, 5.15, STAIR_OUTER, 8.15);
  // North.
  addRamp("x", 5.5, -7.6, COLUMN + 0.02, STAIR_OUTER, 8.15, 12.15);
  addPad(-STAIR_OUTER, -5.15, COLUMN + 0.02, STAIR_OUTER, 12.15);
  // West, up to the roof.
  addRamp("z", 5.6, -5.55, -STAIR_OUTER, -COLUMN - 0.02, 12.15, DECK_Y);
  // Landing bridges the west stairs onto the column roof. A slab, not a pillar,
  // so it does not wall off the lower stairs that pass underneath.
  addPad(-STAIR_OUTER, -1.7, -STAIR_OUTER, -4.45, DECK_Y);

  // Courtyard crates. Clear of the gate and the stair ring.
  addSolid(-14.2, -12.2, 0, 1.05, -16.5, -14.5, "crate");
  addSolid(12.4, 14.2, 0, 0.85, 8.5, 10.4, "crate");
  addSolid(-15.2, -13.4, 0, 1.25, 11.2, 13.2, "crate");
  addSolid(11.6, 13.5, 0, 0.7, -16.2, -14.4, "crate");
}

build();

export function getSolids() {
  return SOLIDS;
}

export function getFloors() {
  return FLOORS;
}

// Waypoints from zombie land, through the gate, up the stairs, onto the deck.
// Shared by bots and the climb test. Samples follow the stair centerlines.
export const CLIMB = [
  { x: 0, z: -36 },
  { x: 0, z: -30 },
  { x: 0, z: -22 },
  { x: -2, z: -16 },
  { x: -6.4, z: -12 },
  ...sampleRamp("x", -7.4, 5.3, -STAIR_OUTER, -COLUMN - 0.02, 0.12, 4.15),
  { x: 6.8, z: -6.5 },
  ...sampleRamp("z", -5.3, 5.3, COLUMN + 0.02, STAIR_OUTER, 4.15, 8.15),
  { x: 6.5, z: 6.8 },
  ...sampleRamp("x", 5.2, -7.3, COLUMN + 0.02, STAIR_OUTER, 8.15, 12.15),
  { x: -6.8, z: 6.4 },
  ...sampleRamp("z", 5.3, -5.3, -STAIR_OUTER, -COLUMN - 0.02, 12.15, DECK_Y),
  { x: -6.2, z: -6.6 },
  { x: -3.4, z: -4.7 },
];

export function zoneAt(x, z) {
  if (Math.abs(x) <= WALL_OUTER + 0.02 && Math.abs(z) <= WALL_OUTER + 0.02) return "castle";
  return "ground";
}

export function onGoal(x, y, z) {
  return y >= DECK_Y - 0.3 && y < DECK_Y + 2.8 && Math.abs(x) <= STAIR_OUTER + 0.3 && Math.abs(z) <= STAIR_OUTER + 0.3;
}

export function floorAt(x, z, feetY) {
  let best = 0;
  const limit = feetY + STEP;
  for (const f of FLOORS) {
    if (x < f.x0 - 0.14 || x > f.x1 + 0.14 || z < f.z0 - 0.14 || z > f.z1 + 0.14) continue;
    if (f.y <= limit + 0.02 && f.y >= best) best = f.y;
  }
  return best;
}

function blocksBody(solid, feet) {
  const top = solid.maxY;
  if (top <= feet + STEP) return false;
  const head = feet + BODY_H;
  if (solid.minY >= head - 0.05) return false;
  return true;
}

function pushCircle(px, pz, s) {
  const minX = s.minX - BODY_R;
  const maxX = s.maxX + BODY_R;
  const minZ = s.minZ - BODY_R;
  const maxZ = s.maxZ + BODY_R;
  // Expand the box by the radius and treat the player as a point. Accurate enough
  // for these axis-aligned walls, and it handles being fully inside.
  if (px < minX || px > maxX || pz < minZ || pz > maxZ) return null;
  const left = px - minX;
  const right = maxX - px;
  const back = pz - minZ;
  const front = maxZ - pz;
  const m = Math.min(left, right, back, front);
  if (m === left) return { x: minX - 0.001, z: pz };
  if (m === right) return { x: maxX + 0.001, z: pz };
  if (m === back) return { x: px, z: minZ - 0.001 };
  return { x: px, z: maxZ + 0.001 };
}

export function isBlocked(x, z, feet) {
  for (const s of SOLIDS) {
    if (!blocksBody(s, feet)) continue;
    if (pushCircle(x, z, s)) return true;
  }
  return false;
}

export function createBody(partial = {}) {
  return {
    id: "p",
    name: "Player",
    team: "guards",
    bot: false,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    vy: 0,
    grounded: true,
    dash: 0,
    invulnUntil: 0,
    ...partial,
  };
}

export function moveBody(body, dt, dirX, dirZ, jump, opts = {}) {
  const speed = (opts.speed ?? 7.5) * (body.dash > 0 ? 1.7 : 1);
  const gravity = 30;
  const jumpV = 9.15;
  dt = Math.min(Math.max(dt, 0), 0.05);

  if (jump && body.grounded) {
    body.vy = jumpV;
    body.grounded = false;
  }
  body.vy -= gravity * dt;
  if (body.vy < -32) body.vy = -32;
  body.y += body.vy * dt;
  if (body.y < 0) {
    body.y = 0;
    if (body.vy < 0) body.vy = 0;
  }

  // Bonk a ceiling (the gate lintel, the crown).
  if (body.vy > 0) {
    const head = body.y + BODY_H;
    for (const s of SOLIDS) {
      if (head < s.minY || body.y > s.minY) continue;
      if (body.x < s.minX - BODY_R || body.x > s.maxX + BODY_R) continue;
      if (body.z < s.minZ - BODY_R || body.z > s.maxZ + BODY_R) continue;
      body.y = s.minY - BODY_H - 0.01;
      body.vy = 0;
      break;
    }
  }

  let mx = 0;
  let mz = 0;
  const len = Math.hypot(dirX, dirZ);
  if (len > 0.01) {
    mx = (dirX / len) * speed * dt;
    mz = (dirZ / len) * speed * dt;
  }
  sweep(body, mx, 0);
  sweep(body, 0, mz);

  body.x = Math.max(-58, Math.min(58, body.x));
  body.z = Math.max(-58, Math.min(58, body.z));

  const floor = floorAt(body.x, body.z, body.y);
  if (body.vy <= 0 && floor >= body.y - 0.02 && body.y <= floor + 0.04) {
    body.y = floor;
    body.vy = 0;
    body.grounded = true;
  } else if (body.vy <= 0 && floor > body.y && floor <= body.y + STEP) {
    body.y = floor;
    body.vy = 0;
    body.grounded = true;
  } else {
    body.grounded = false;
  }
  if (body.dash > 0) body.dash = Math.max(0, body.dash - dt);
}

function sweep(body, dx, dz) {
  body.x += dx;
  body.z += dz;
  for (let n = 0; n < 4; n++) {
    let hit = false;
    for (const s of SOLIDS) {
      if (!blocksBody(s, body.y)) continue;
      const pushed = pushCircle(body.x, body.z, s);
      if (!pushed) continue;
      body.x = pushed.x;
      body.z = pushed.z;
      hit = true;
    }
    if (!hit) break;
  }
}

export const GUARD_SPAWNS = [
  { x: 0, z: -15, yaw: Math.PI },
  { x: -8, z: -14, yaw: Math.PI },
  { x: 8, z: -14, yaw: Math.PI },
  { x: -12, z: 8, yaw: 0 },
  { x: 12, z: 10, yaw: 0 },
];

export const ZOMBIE_SPAWNS = [
  { x: -6, z: -34, yaw: Math.PI },
  { x: 7, z: -36, yaw: Math.PI },
  { x: -34, z: -4, yaw: -Math.PI / 2 },
  { x: 34, z: 6, yaw: Math.PI / 2 },
  { x: -8, z: 36, yaw: 0 },
  { x: 10, z: 34, yaw: 0 },
];

let spawnCursor = { guards: 0, zombies: 0 };

export function resetSpawns() {
  spawnCursor = { guards: 0, zombies: 0 };
}

export function nextSpawn(team) {
  const list = team === "zombies" ? ZOMBIE_SPAWNS : GUARD_SPAWNS;
  const key = team === "zombies" ? "zombies" : "guards";
  const s = list[spawnCursor[key] % list.length];
  spawnCursor[key] += 1;
  return { ...s, y: 0.1 };
}
