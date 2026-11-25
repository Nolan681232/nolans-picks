import assert from "node:assert/strict";
import {
  CLIMB,
  DECK_Y,
  createBody,
  floorAt,
  isBlocked,
  moveBody,
  onGoal,
  zoneAt,
} from "../js/course.js";
import { deadstick, stickToWorld } from "../js/vrmath.js";
import {
  applyDelta,
  assignTeams,
  modeLabel,
  normalizeSettings,
  pointsWinner,
  resolveTouch,
  scoreEvent,
  winnerFromScores,
  zombieReachedGoal,
  guardOutOfBounds,
} from "../js/rules.js";

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const settings = normalizeSettings({ mode: "points", pointsToWin: 3, minutes: 3, useBots: true });
assert.equal(settings.pointsToWin, 3);
assert.equal(settings.mode, "points");
assert.equal(normalizeSettings({ mode: "timer", minutes: 99 }).durationSec, 30 * 60);
assert.equal(normalizeSettings({ mode: "timer", minutes: 0 }).durationSec, 60);
assert.equal(normalizeSettings({ pointsToWin: 0 }).pointsToWin, 1);
assert.equal(modeLabel(normalizeSettings({ mode: "timer", minutes: 5 })), "Timer · 5 min");
assert.equal(modeLabel(settings), "Points · first to 3");

assert.deepEqual(applyDelta({ guards: 0, zombies: 0 }, "zombies", -1), { guards: 0, zombies: 0 });
assert.deepEqual(applyDelta({ guards: 2, zombies: 1 }, "guards", -1), { guards: 1, zombies: 1 });
assert.equal(winnerFromScores({ guards: 2, zombies: 2 }), "tie");
assert.equal(winnerFromScores({ guards: 3, zombies: 1 }), "guards");
assert.equal(pointsWinner({ guards: 2, zombies: 3 }, 3), "zombies");
assert.equal(pointsWinner({ guards: 2, zombies: 2 }, 3), null);

{
  const even = assignTeams(
    [
      { id: "a", pref: "guards" },
      { id: "b", pref: "guards" },
      { id: "c", pref: "zombies" },
      { id: "d", pref: "zombies" },
    ],
    mulberry32(1)
  );
  assert.equal(even.a.team, "guards");
  assert.equal(even.a.moved, false);
  assert.equal(even.c.team, "zombies");
  const counts = { guards: 0, zombies: 0 };
  for (const row of Object.values(even)) counts[row.team] += 1;
  assert.equal(counts.guards, 2);
  assert.equal(counts.zombies, 2);
}

{
  const piled = assignTeams(
    [
      { id: "a", pref: "zombies" },
      { id: "b", pref: "zombies" },
      { id: "c", pref: "zombies" },
      { id: "d", pref: "zombies" },
      { id: "e", pref: "zombies" },
    ],
    mulberry32(4)
  );
  const counts = { guards: 0, zombies: 0, moved: 0 };
  for (const row of Object.values(piled)) {
    counts[row.team] += 1;
    if (row.moved) counts.moved += 1;
  }
  assert.ok(Math.abs(counts.guards - counts.zombies) <= 1);
  assert.equal(counts.guards + counts.zombies, 5);
  assert.ok(counts.moved >= 2);
}

{
  const flex = assignTeams(
    [
      { id: "a", pref: "either" },
      { id: "b", pref: "either" },
      { id: "c", pref: "guards" },
    ],
    mulberry32(9)
  );
  const counts = { guards: 0, zombies: 0 };
  for (const row of Object.values(flex)) counts[row.team] += 1;
  assert.ok(Math.abs(counts.guards - counts.zombies) <= 1);
  assert.equal(flex.c.moved, false);
}

assert.equal(zoneAt(0, -15), "castle");
assert.equal(zoneAt(0, -34), "ground");
assert.equal(zoneAt(0, -25), "castle");
assert.equal(isBlocked(0, -25, 0), false, "gate should be walkable");
assert.equal(isBlocked(10, -25, 0), true, "south wall should block");
assert.equal(onGoal(0, DECK_Y, 0), true);
assert.equal(onGoal(0, 2, 0), false);
assert.equal(zoneAt(0, 0), "castle");

{
  let y = 0;
  let prev = null;
  for (const p of CLIMB) {
    const floor = floorAt(p.x, p.z, y + 0.05);
    if (prev) {
      assert.ok(
        floor <= y + 0.62 + 0.02,
        `climb jump at ${p.x},${p.z}: floor ${floor.toFixed(2)} from ${y.toFixed(2)}`
      );
    }
    y = floor;
    prev = p;
    assert.equal(isBlocked(p.x, p.z, y + 0.05), false, `waypoint blocked ${p.x},${p.z} y ${y}`);
  }
  const last = CLIMB[CLIMB.length - 1];
  assert.ok(onGoal(last.x, y, last.z), `final waypoint should be the roof, y=${y}`);
}

{
  const body = createBody({ x: 0, y: 0, z: -32, team: "zombies" });
  for (let i = 0; i < 180; i++) moveBody(body, 1 / 60, 0, 1, false);
  assert.ok(body.z > -22, `should walk through the gate, z=${body.z}`);
  assert.equal(zoneAt(body.x, body.z), "castle");
}

{
  const guard = { id: "g", team: "guards", x: 0, y: 1, z: 0, invulnUntil: 0, hands: [{ x: 4.2, y: 1.1, z: 0.2 }] };
  const zombie = { id: "z", team: "zombies", x: 4.5, y: 0, z: 0, invulnUntil: 0 };
  const poked = resolveTouch(guard, zombie, 0);
  assert.equal(poked.type, "guard-tag");
  assert.equal(resolveTouch({ ...guard, hands: null }, zombie, 0), null);
}

{
  const guard = { id: "g", team: "guards", x: 0, y: 1, z: -10, invulnUntil: 0 };
  const zombie = { id: "z", team: "zombies", x: 0.4, y: 1, z: -10.2, invulnUntil: 0 };
  const inside = resolveTouch(guard, zombie, 0);
  assert.equal(inside.type, "guard-tag");
  zombie.z = -34;
  guard.z = -34.2;
  const outside = resolveTouch(guard, zombie, 0);
  assert.equal(outside.type, "zombie-tag");
  assert.deepEqual(
    scoreEvent("guard-tag"),
    { guards: 1, zombies: -1, text: "tagged a zombie inside the castle" }
  );
}

{
  const guard = createBody({ id: "g", team: "guards", x: 0, y: 0, z: -34, grounded: true });
  assert.equal(guardOutOfBounds(guard, 0), true);
  guard.invulnUntil = 100;
  assert.equal(guardOutOfBounds(guard, 50), false);
  const zombie = createBody({ id: "z", team: "zombies", x: -2, y: DECK_Y, z: -2, grounded: true });
  assert.equal(zombieReachedGoal(zombie, 0), true);
}

{
  const fwd = stickToWorld(0, 1, 0, -1);
  assert.ok(Math.abs(fwd.x) < 1e-6 && Math.abs(fwd.z - 1) < 1e-6);
  // Facing +Z, pushing the stick right is screen-right, which is -X.
  const right = stickToWorld(0, 1, 1, 0);
  assert.ok(Math.abs(right.x + 1) < 1e-6 && Math.abs(right.z) < 1e-6);
  const rightSouth = stickToWorld(0, -1, 1, 0);
  assert.ok(Math.abs(rightSouth.x - 1) < 1e-6 && Math.abs(rightSouth.z) < 1e-6);
  const stopped = deadstick(0.05, -0.05);
  assert.equal(stopped.x, 0);
  assert.equal(stopped.y, 0);
}

console.log("rules tests ok");
