// Match rules for Towers.
// Scores never drop below 0.
// On castle ground, a touching guard and zombie counts as the guard's tag.
// Outside, the same touch counts as the zombie's tag.
// A guard who is simply standing on zombie land loses a point (separate from a tag).
// Reaching the top platform is checked after tags, so a guard camping the roof can stop a score.

import { TAG_H, TAG_R, onGoal, zoneAt } from "./course.js";

export function normalizeSettings(input = {}) {
  const mode = input.mode === "timer" ? "timer" : "points";
  let pointsToWin = Math.round(Number(input.pointsToWin));
  if (!Number.isFinite(pointsToWin)) pointsToWin = 3;
  pointsToWin = Math.min(20, Math.max(1, pointsToWin));
  let minutes = Number(input.minutes);
  if (!Number.isFinite(minutes)) minutes = 3;
  minutes = Math.min(30, Math.max(1, Math.round(minutes)));
  return {
    mode,
    pointsToWin,
    durationSec: minutes * 60,
    useBots: input.useBots !== false,
  };
}

export function modeLabel(settings) {
  if (!settings) return "";
  if (settings.mode === "timer") {
    const minutes = Math.round(settings.durationSec / 60);
    return `Timer · ${minutes} min`;
  }
  return `Points · first to ${settings.pointsToWin}`;
}

export function formatClock(seconds) {
  const sec = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function applyDelta(scores, team, delta) {
  const next = { guards: scores.guards | 0, zombies: scores.zombies | 0 };
  if (team !== "guards" && team !== "zombies") return next;
  next[team] = Math.max(0, next[team] + delta);
  return next;
}

export function winnerFromScores(scores) {
  if (scores.guards > scores.zombies) return "guards";
  if (scores.zombies > scores.guards) return "zombies";
  return "tie";
}

export function pointsWinner(scores, pointsToWin) {
  const g = scores.guards >= pointsToWin;
  const z = scores.zombies >= pointsToWin;
  if (g && z) return winnerFromScores(scores);
  if (g) return "guards";
  if (z) return "zombies";
  return null;
}

function shuffle(list, rng) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Honor side picks. If that would leave the teams uneven by more than one player,
// move random extras off the bigger side. `moved` is true when a specific pick was overridden.
export function assignTeams(players, rng = Math.random) {
  const guards = [];
  const zombies = [];
  const either = [];
  for (const p of shuffle(players, rng)) {
    const pref = p.pref === "guards" || p.pref === "zombies" ? p.pref : "either";
    const row = { id: p.id, pref, moved: false };
    if (pref === "guards") guards.push(row);
    else if (pref === "zombies") zombies.push(row);
    else either.push(row);
  }
  for (const row of either) {
    (guards.length <= zombies.length ? guards : zombies).push(row);
  }
  while (guards.length > zombies.length + 1) {
    const i = Math.floor(rng() * guards.length);
    const [row] = guards.splice(i, 1);
    row.moved = row.pref === "guards";
    zombies.push(row);
  }
  while (zombies.length > guards.length + 1) {
    const i = Math.floor(rng() * zombies.length);
    const [row] = zombies.splice(i, 1);
    row.moved = row.pref === "zombies";
    guards.push(row);
  }
  const out = {};
  for (const row of guards) out[row.id] = { team: "guards", moved: row.moved };
  for (const row of zombies) out[row.id] = { team: "zombies", moved: row.moved };
  return out;
}

export function touching(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  const dy = a.y - b.y;
  return dx * dx + dz * dz <= TAG_R * TAG_R && Math.abs(dy) <= TAG_H;
}

export function guardOutOfBounds(p, now) {
  if (p.team !== "guards") return false;
  if (p.invulnUntil && now < p.invulnUntil) return false;
  if (!p.grounded) return false;
  if (p.y > 2.4) return false;
  return zoneAt(p.x, p.z) === "ground";
}

export function zombieReachedGoal(p, now) {
  if (p.team !== "zombies") return false;
  if (p.invulnUntil && now < p.invulnUntil) return false;
  return onGoal(p.x, p.y, p.z);
}

// One resolution per touch so a single bump cannot apply both tag rules.
export function resolveTouch(a, b, now) {
  if (!a || !b || a.id === b.id) return null;
  if (a.team === b.team) return null;
  if ((a.invulnUntil && now < a.invulnUntil) || (b.invulnUntil && now < b.invulnUntil)) return null;
  if (!touching(a, b)) return null;
  const guard = a.team === "guards" ? a : b;
  const zombie = a.team === "zombies" ? a : b;
  if (zoneAt(zombie.x, zombie.z) === "castle") {
    return { type: "guard-tag", guardId: guard.id, zombieId: zombie.id };
  }
  return { type: "zombie-tag", guardId: guard.id, zombieId: zombie.id };
}

export function scoreEvent(type) {
  if (type === "guard-tag") {
    return { guards: 1, zombies: -1, text: "tagged a zombie inside the castle" };
  }
  if (type === "zombie-tag") {
    return { guards: -1, zombies: 0, text: "tagged a guard" };
  }
  if (type === "oob") {
    return { guards: -1, zombies: 0, text: "stepped onto zombie land" };
  }
  if (type === "goal") {
    return { guards: 0, zombies: 1, text: "reached the top" };
  }
  return { guards: 0, zombies: 0, text: "" };
}

export function teamName(team) {
  return team === "zombies" ? "Zombies" : "Guards";
}
