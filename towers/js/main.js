import * as THREE from "https://unpkg.com/three@0.170.0/build/three.module.js";
import { createActor } from "./actors.js";
import { createAudio } from "./audio.js";
import {
  CLIMB,
  GUARD_SPAWNS,
  ZOMBIE_SPAWNS,
  createBody,
  floorAt,
  moveBody,
  nextSpawn,
  resetSpawns,
  zoneAt,
} from "./course.js";
import { createInput, wishDir } from "./input.js";
import { createNetwork, sendBots, sendEvent, sendSnap } from "./net.js";
import {
  applyDelta,
  assignTeams,
  formatClock,
  guardOutOfBounds,
  modeLabel,
  normalizeSettings,
  pointsWinner,
  resolveTouch,
  teamName,
  winnerFromScores,
  zombieReachedGoal,
} from "./rules.js";
import { createTextures } from "./textures.js";
import { createWorld } from "./world.js";

const canvas = document.querySelector("#view");
const $ = (id) => document.querySelector(id);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 250);
const textures = createTextures(THREE);
const world = createWorld(THREE, scene, textures);
const input = createInput(canvas);
const audio = createAudio();
const net = createNetwork();

let myName = loadName();
let pref = "either";
let gameApi = null;
let remote = null;
let session = null;
let listed = false;
let decor = [];
const camPos = new THREE.Vector3(24, 15, -36);
const look = new THREE.Vector3();

const GUARD_BOT_NAMES = ["Sir Tape", "Captain Crayon"];
const ZOMBIE_BOT_NAMES = ["Wobble", "Nibbles"];

function loadName() {
  try {
    const saved = localStorage.getItem("towers-name");
    if (saved) return cleanName(saved);
  } catch { /* private mode */ }
  return `Player${Math.floor(10 + Math.random() * 89)}`;
}

function cleanName(value) {
  const text = String(value || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 16);
  return text || "Player";
}

function saveName(value) {
  myName = cleanName(value);
  try { localStorage.setItem("towers-name", myName); } catch { /* ignore */ }
  $("#name-input").value = myName;
  if (gameApi) gameApi.who.set({ name: myName, pref });
}

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  for (const b of bytes) code += alphabet[b % alphabet.length];
  return code;
}

function settingsFromForm() {
  const mode = $("#mode-timer").classList.contains("on") ? "timer" : "points";
  return normalizeSettings({
    mode,
    pointsToWin: $("#points-input").value,
    minutes: $("#minutes-input").value,
    useBots: $("#bots").checked,
  });
}

function settingsFromState(state) {
  return normalizeSettings({
    mode: state.mode,
    pointsToWin: state.pointsToWin,
    minutes: (state.durationSec || 180) / 60,
    useBots: state.useBots,
  });
}

function show(screen) {
  for (const id of ["#screen-home", "#screen-create", "#screen-room", "#screen-end"]) {
    $(id).classList.toggle("hidden", id !== screen);
  }
  $("#overlay").classList.toggle("hidden", screen == null);
  $("#hud").classList.toggle("hidden", screen != null && screen !== "#screen-end");
  if (screen === "#screen-end") $("#hud").classList.remove("hidden");
}

function toast(text) {
  const el = $("#callout");
  el.textContent = text;
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
}

function spawnFor(team, index) {
  const list = team === "zombies" ? ZOMBIE_SPAWNS : GUARD_SPAWNS;
  return list[index % list.length];
}

function addBody(id, team, name, spot, local) {
  const body = createBody({
    id,
    team,
    name,
    x: spot.x,
    y: spot.y || 0,
    z: spot.z,
    yaw: spot.yaw,
    bot: id.startsWith("bot-"),
  });
  body.local = local;
  body.wp = 0;
  body.patrol = 0;
  body.phase = Math.random() * 6;
  body.safeX = spot.x;
  body.safeZ = spot.z;
  body.dashCd = 0;
  body.actor = createActor(THREE, team, name);
  body.actor.group.position.set(body.x, body.y, body.z);
  scene.add(body.actor.group);
  session.bodies.set(id, body);
  session.names[id] = name;
  if (local) input.yaw = spot.yaw;
  return body;
}

function removeBody(id) {
  const body = session?.bodies.get(id);
  if (!body) return;
  scene.remove(body.actor.group);
  session.bodies.delete(id);
}

function clearSessionBodies() {
  if (!session) return;
  for (const id of [...session.bodies.keys()]) removeBody(id);
}

function fillBots(teams) {
  const counts = { guards: 0, zombies: 0 };
  for (const team of Object.values(teams)) counts[team] += 1;
  const bots = [];
  for (const team of ["guards", "zombies"]) {
    let n = 0;
    const names = team === "guards" ? GUARD_BOT_NAMES : ZOMBIE_BOT_NAMES;
    while (counts[team] + n < 2) {
      bots.push({
        id: `bot-${team}-${n + 1}`,
        team,
        name: names[n] || (team === "guards" ? `Guard ${n + 1}` : `Zombie ${n + 1}`),
      });
      n += 1;
    }
  }
  return bots;
}

function rosterOf() {
  const rows = [];
  for (const [id, team] of Object.entries(session.teams)) {
    rows.push({ id, team, name: session.names[id] || "Player", bot: false });
  }
  for (const body of session.bodies.values()) {
    if (body.bot) rows.push({ id: body.id, team: body.team, name: body.name, bot: true });
  }
  return rows;
}

function pack() {
  return {
    phase: session.phase,
    hostId: session.hostId,
    code: session.code,
    mode: session.settings.mode,
    pointsToWin: session.settings.pointsToWin,
    durationSec: session.settings.durationSec,
    useBots: session.settings.useBots,
    startEpoch: session.startEpoch,
    scores: { guards: session.scores.guards, zombies: session.scores.zombies },
    winner: session.winner,
    teams: { ...session.teams },
    roster: rosterOf(),
    seq: session.seq,
    hostNow: Date.now(),
  };
}

async function publish() {
  if (!session?.online || !session.isHost || !gameApi) return;
  session.seq += 1;
  remote = pack();
  try {
    await gameApi.match.set(remote);
  } catch (err) {
    console.warn(err);
  }
}

function enterPlay() {
  for (const prop of decor) scene.remove(prop.actor.group);
  decor = [];
  show(null);
  canvas.dataset.play = "1";
  if (document.activeElement && document.activeElement !== canvas) document.activeElement.blur();
  $("#you-line").textContent = `You are ${teamName(session.teams[session.selfId] || "guards")} · ${myName}`;
  updateHud();
}

function teardownPlay() {
  if (document.pointerLockElement === canvas) document.exitPointerLock?.();
  canvas.dataset.play = "0";
  clearSessionBodies();
  session = null;
  if (!decor.length) addDecor();
}

function beginMatch({ online, isHost, selfId, settings, code, teams, startEpoch, hostId }) {
  resetSpawns();
  session = {
    online,
    isHost,
    selfId,
    settings,
    code,
    phase: "play",
    startEpoch,
    scores: { guards: 0, zombies: 0 },
    winner: null,
    teams: { ...teams },
    names: {},
    bodies: new Map(),
    seq: 1,
    hostId: hostId || selfId,
    snapAcc: 0,
    botAcc: 0,
    ended: false,
  };
}

function spawnRoster(people, bots) {
  people.forEach((person, index) => {
    const spot = spawnFor(person.team, index);
    addBody(person.id, person.team, person.name, spot, person.id === session.selfId);
  });
  bots.forEach((bot, index) => {
    const spot = spawnFor(bot.team, index + 3);
    addBody(bot.id, bot.team, bot.name, { ...spot, y: 0.1 }, false);
  });
}

async function startOnline() {
  if (!gameApi || !remote || remote.hostId !== gameApi.selfId) return;
  const who = gameApi.who.getAll() || {};
  const people = Object.entries(who).map(([id, row]) => ({
    id,
    pref: row?.pref || "either",
    name: cleanName(row?.name || "Player"),
  }));
  if (!people.some((p) => p.id === gameApi.selfId)) {
    people.push({ id: gameApi.selfId, pref, name: myName });
  }
  if (!remote.useBots && people.length < 2) {
    toast("Need another player, or turn bots on.");
    return;
  }
  const assigned = assignTeams(people);
  const teams = {};
  const humans = [];
  for (const person of people) {
    const row = assigned[person.id];
    teams[person.id] = row.team;
    humans.push({ ...person, team: row.team, moved: row.moved });
  }
  const settings = settingsFromState(remote);
  const bots = settings.useBots ? fillBots(teams) : [];
  beginMatch({
    online: true,
    isHost: true,
    selfId: gameApi.selfId,
    settings,
    code: remote.code,
    teams,
    startEpoch: Date.now() + 2500,
    hostId: gameApi.selfId,
  });
  humans.forEach((p) => { session.names[p.id] = p.name; });
  spawnRoster(humans, bots);
  enterPlay();
  session.seq += 1;
  const started = pack();
  remote = started;
  sendEvent(gameApi, {
    kind: "begin",
    state: started,
    moved: Object.fromEntries(humans.filter((p) => p.moved).map((p) => [p.id, p.team])),
  });
  try { await gameApi.match.set(started); } catch (err) { console.warn(err); }
  const me = humans.find((p) => p.id === gameApi.selfId);
  if (me?.moved) toast(`Teams were uneven, so you're on the ${teamName(me.team)}.`);
  audio.go();
}

function startPractice(settings) {
  const selfId = "you";
  const teams = { you: "guards" };
  const bots = fillBots(teams);
  beginMatch({
    online: false,
    isHost: true,
    selfId,
    settings,
    code: "",
    teams,
    startEpoch: Date.now() + 1200,
    hostId: selfId,
  });
  session.names.you = myName;
  spawnRoster([{ id: selfId, team: "guards", name: myName }], bots);
  enterPlay();
  audio.go();
}

function endMatch(winner) {
  if (!session || session.ended) return;
  session.ended = true;
  session.phase = "end";
  session.winner = winner;
  if (document.pointerLockElement === canvas) document.exitPointerLock?.();
  canvas.dataset.play = "0";
  const title = winner === "tie" ? "It's a tie" : `${teamName(winner)} win`;
  $("#end-title").textContent = title;
  $("#end-detail").textContent = winner === "tie"
    ? `Same score when the clock ran out. Guards ${session.scores.guards}, Zombies ${session.scores.zombies}.`
    : `Guards ${session.scores.guards} · Zombies ${session.scores.zombies}. ${modeLabel(session.settings)}.`;
  $("#end-again").classList.toggle("hidden", session.online && !session.isHost);
  show("#screen-end");
  audio.win();
  if (session.online && session.isHost) void publish();
}

function applyScores(guardsDelta, zombiesDelta) {
  session.scores = applyDelta(session.scores, "guards", guardsDelta);
  session.scores = applyDelta(session.scores, "zombies", zombiesDelta);
}

function punish(type, ids, now) {
  const subject = session.bodies.get(ids.zombieId || ids.guardId);
  const other = session.bodies.get(type === "guard-tag" ? ids.guardId : ids.zombieId);
  if (type === "guard-tag") {
    applyScores(1, -1);
    respawn(ids.zombieId, "zombies", now);
    toast(`${nameOf(ids.guardId)} tagged ${nameOf(ids.zombieId)}. Guards +1, Zombies −1.`);
    audio.tag();
    audio.score();
  } else if (type === "zombie-tag") {
    applyScores(-1, 0);
    respawn(ids.guardId, "guards", now);
    toast(`${nameOf(ids.zombieId)} tagged ${nameOf(ids.guardId)}. Guards −1.`);
    audio.bad();
  } else if (type === "oob") {
    applyScores(-1, 0);
    respawn(ids.guardId, "guards", now);
    toast(`${nameOf(ids.guardId)} stepped onto zombie land. Guards −1.`);
    audio.bad();
  } else if (type === "goal") {
    applyScores(0, 1);
    respawn(ids.zombieId, "zombies", now);
    const z = session.bodies.get(ids.zombieId);
    if (z) z.wp = 0;
    toast(`${nameOf(ids.zombieId)} reached the top. Zombies +1.`);
    audio.score();
  }
  void subject;
  void other;
  void publish();
  if (session.settings.mode === "points") {
    const winner = pointsWinner(session.scores, session.settings.pointsToWin);
    if (winner) endMatch(winner);
  }
}

function nameOf(id) {
  return session.names[id] || session.bodies.get(id)?.name || "Someone";
}

function respawn(id, team, now) {
  const spot = nextSpawn(team);
  const body = session.bodies.get(id);
  if (!body) return;
  body.x = spot.x;
  body.y = 0.1;
  body.z = spot.z;
  body.yaw = spot.yaw;
  body.vy = 0;
  body.grounded = true;
  body.invulnUntil = now + 2500;
  body.holdUntil = now + 600;
  body.wp = 0;
  if (body.local) input.yaw = spot.yaw;
  if (session.online && session.isHost) {
    sendEvent(gameApi, {
      kind: "spawn",
      id,
      x: spot.x,
      y: 0.1,
      z: spot.z,
      yaw: spot.yaw,
      invulnUntil: body.invulnUntil,
    });
  }
}

function hostRules(now) {
  if (!session?.isHost || session.phase !== "play" || now < session.startEpoch) return;
  const list = [...session.bodies.values()];
  const handled = new Set();
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const event = resolveTouch(list[i], list[j], now);
      if (!event) continue;
      punish(event.type, event, now);
      handled.add(event.guardId);
      handled.add(event.zombieId);
      if (session.phase !== "play") return;
    }
  }
  for (const body of list) {
    if (handled.has(body.id)) continue;
    if (guardOutOfBounds(body, now)) {
      punish("oob", { guardId: body.id }, now);
      handled.add(body.id);
      if (session.phase !== "play") return;
    }
  }
  for (const body of list) {
    if (handled.has(body.id)) continue;
    if (zombieReachedGoal(body, now)) {
      punish("goal", { zombieId: body.id }, now);
      if (session.phase !== "play") return;
    }
  }
  if (session.settings.mode === "timer" && now >= session.startEpoch + session.settings.durationSec * 1000) {
    endMatch(winnerFromScores(session.scores));
  }
}

function steerBot(body, dt, now) {
  const target = body.team === "zombies" ? zombieAim(body) : guardAim(body);
  let dx = target.x - body.x;
  let dz = target.z - body.z;
  const dist = Math.hypot(dx, dz) || 1;
  dx /= dist;
  dz /= dist;
  const sway = Math.sin(now / 380 + body.phase) * 0.28;
  const ahead = floorAt(body.x + dx * 0.8, body.z + dz * 0.8, body.y + 0.3);
  const jump = body.grounded && ahead > body.y + 0.34;
  const prevX = body.x;
  const prevZ = body.z;
  moveBody(body, dt, dx - dz * sway, dz + dx * sway, jump, { speed: 5.65 });
  const moved = Math.hypot(body.x - prevX, body.z - prevZ);
  body.stuck = moved < 0.006 ? (body.stuck || 0) + dt : 0;
  if (body.stuck > 0.55) {
    body.stuck = 0;
    if (body.team === "zombies") body.wp = (body.wp || 0) + 1;
    moveBody(body, dt, -dz, dx, true, { speed: 5.65 });
  }
  if (body.team === "zombies" && Math.hypot(target.x - body.x, target.z - body.z) < 0.95) body.wp = (body.wp || 0) + 1;
  body.yaw = Math.atan2(-dx, -dz);
  if (body.team === "guards" && zoneAt(body.x, body.z) === "ground" && body.y < 2) {
    body.x = body.safeX;
    body.z = body.safeZ;
    body.vy = 0;
  } else if (body.team === "guards" && zoneAt(body.x, body.z) === "castle") {
    body.safeX = body.x;
    body.safeZ = body.z;
  }
}

function zombieAim(body) {
  const index = Math.max(0, Math.min(CLIMB.length - 1, body.wp || 0));
  body.wp = index;
  return CLIMB[index];
}

function guardAim(body) {
  let best = null;
  let bestD = Infinity;
  for (const other of session.bodies.values()) {
    if (other.team !== "zombies" || other.invulnUntil > Date.now()) continue;
    if (zoneAt(other.x, other.z) !== "castle") continue;
    const d = (other.x - body.x) ** 2 + (other.z - body.z) ** 2 + (other.y - body.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = other;
    }
  }
  if (best && best.y > body.y + 1.5) {
    let pick = 0;
    let pickD = Infinity;
    CLIMB.forEach((point, index) => {
      const d = (point.x - body.x) ** 2 + (point.z - body.z) ** 2;
      if (d < pickD) {
        pickD = d;
        pick = index;
      }
    });
    return CLIMB[Math.min(CLIMB.length - 1, pick + 1)];
  }
  if (best) return best;
  const patrol = [
    { x: -10, z: -13 },
    { x: 11, z: -11 },
    { x: 9, z: 12 },
    { x: -12, z: 10 },
    { x: 0, z: -16 },
  ];
  const point = patrol[(body.patrol || 0) % patrol.length];
  if (Math.hypot(point.x - body.x, point.z - body.z) < 1.3) body.patrol = (body.patrol || 0) + 1;
  return point;
}

function syncMesh(body, dt, time) {
  const group = body.actor.group;
  if (body.local || body.bot && session.isHost) {
    group.position.set(body.x, body.y, body.z);
  } else {
    const k = 1 - Math.exp(-14 * dt);
    group.position.x += (body.x - group.position.x) * k;
    group.position.y += (body.y - group.position.y) * k;
    group.position.z += (body.z - group.position.z) * k;
  }
  const speed = body.prev ? Math.hypot(body.x - body.prev.x, body.z - body.prev.z) / Math.max(dt, 0.001) : 0;
  body.prev = { x: body.x, z: body.z };
  body.actor.update(time, speed, body.yaw);
  const blinking = body.invulnUntil > Date.now();
  group.visible = !blinking || Math.floor(time * 10) % 2 === 0;
}

function updateCamera(dt) {
  const me = session.bodies.get(session.selfId);
  if (!me) return;
  const yaw = input.yaw;
  const pitch = input.pitch;
  const dist = 6.5;
  const tx = me.x + Math.sin(yaw) * dist;
  const ty = me.y + 2.25 + pitch * 2.4;
  const tz = me.z + Math.cos(yaw) * dist;
  const k = 1 - Math.exp(-8 * dt);
  camPos.x += (tx - camPos.x) * k;
  camPos.y += (ty - camPos.y) * k;
  camPos.z += (tz - camPos.z) * k;
  camera.position.copy(camPos);
  look.set(me.x, me.y + 1.35, me.z);
  camera.lookAt(look);
}

function updateHud() {
  if (!session) return;
  $("#score-g").textContent = String(session.scores.guards);
  $("#score-z").textContent = String(session.scores.zombies);
  const count = Math.ceil((session.startEpoch - Date.now()) / 1000);
  if (count > 0) {
    $("#clock").textContent = String(count);
    $("#mode-line").textContent = "Get ready";
  } else if (session.settings.mode === "timer") {
    const left = (session.startEpoch + session.settings.durationSec * 1000 - Date.now()) / 1000;
    $("#clock").textContent = formatClock(left);
    $("#mode-line").textContent = modeLabel(session.settings);
    $("#clock").classList.toggle("urgent", left <= 10 && session.phase === "play");
  } else {
    $("#clock").textContent = `First to ${session.settings.pointsToWin}`;
    $("#mode-line").textContent = "Points game";
    $("#clock").classList.remove("urgent");
  }
  const team = session.teams[session.selfId];
  $("#you-line").textContent = `${myName} · ${teamName(team || "guards")}`;
  $("#capture").classList.toggle("hidden", input.locked || session.phase !== "play");
}

function step(dt, now, time) {
  if (!session || (session.phase !== "play" && session.phase !== "end")) return;
  const me = session.bodies.get(session.selfId);
  if (me && session.phase === "play") {
    const dir = wishDir(input);
    if (input.dash && me.dash <= 0 && me.dashCd <= 0) {
      me.dash = 0.18;
      me.dashCd = 0.85;
    }
    input.dash = false;
    if (me.dashCd > 0) me.dashCd -= dt;
    const jump = input.jump;
    input.jump = false;
    if (jump && me.grounded) audio.jump();
    moveBody(me, dt, dir.x, dir.z, jump && me.grounded, { speed: 7.6 });
    me.yaw = input.yaw;
  } else {
    input.jump = false;
    input.dash = false;
  }

  if (session.isHost && session.phase === "play") {
    for (const body of session.bodies.values()) {
      if (body.bot) steerBot(body, dt, now);
    }
    hostRules(now);
  }

  for (const body of session.bodies.values()) syncMesh(body, dt, time);
  if (session.phase === "play") updateCamera(dt);
  updateHud();

  if (session.online && session.phase === "play") {
    session.snapAcc += dt;
    if (session.snapAcc >= 1 / 15 && me) {
      session.snapAcc = 0;
      sendSnap(gameApi, { x: round(me.x), y: round(me.y), z: round(me.z), yaw: round(me.yaw), g: me.grounded ? 1 : 0 });
    }
    if (session.isHost) {
      session.botAcc += dt;
      if (session.botAcc >= 0.1) {
        session.botAcc = 0;
        const payload = [];
        for (const body of session.bodies.values()) {
          if (!body.bot) continue;
          payload.push({ id: body.id, name: body.name, team: body.team, x: round(body.x), y: round(body.y), z: round(body.z), yaw: round(body.yaw) });
        }
        if (payload.length) sendBots(gameApi, payload);
      }
    }
  }
}

function round(n) {
  return Math.round(n * 100) / 100;
}

function ensureRemote(id, team, name) {
  if (!session || session.bodies.has(id)) return session?.bodies.get(id);
  const index = session.bodies.size;
  return addBody(id, team, name, spawnFor(team, index), id === session.selfId);
}

function onMatch(state) {
  if (!state || typeof state !== "object") return;
  // A late copy of the lobby can arrive after the start message. Don't let it
  // kick everyone out of a match that already began.
  if (remote && typeof state.seq === "number" && typeof remote.seq === "number" && state.seq < remote.seq) return;
  const fromUs = session?.isHost && state.hostId === session.selfId && state.seq <= session.seq;
  remote = state;
  renderRoom();
  if (state.phase === "lobby") {
    if (session && !fromUs) teardownPlay();
    if (gameApi) show("#screen-room");
    return;
  }
  if (!session && (state.phase === "play" || state.phase === "end")) {
    beginMatch({
      online: true,
      isHost: state.hostId === gameApi?.selfId,
      selfId: gameApi.selfId,
      settings: settingsFromState(state),
      code: state.code,
      teams: state.teams || {},
      startEpoch: state.startEpoch || Date.now(),
      hostId: state.hostId,
    });
    session.scores = { guards: state.scores?.guards || 0, zombies: state.scores?.zombies || 0 };
    session.winner = state.winner || null;
    session.phase = state.phase;
    session.seq = state.seq || 1;
    for (const member of state.roster || []) {
      session.names[member.id] = member.name;
      if (!session.bodies.has(member.id)) {
        addBody(member.id, member.team, member.name, spawnFor(member.team, session.bodies.size), member.id === session.selfId);
      }
    }
    enterPlay();
  } else if (session && !fromUs) {
    session.phase = state.phase;
    session.scores = { guards: state.scores?.guards || 0, zombies: state.scores?.zombies || 0 };
    session.winner = state.winner || null;
    session.hostId = state.hostId;
    session.isHost = state.hostId === session.selfId;
    session.startEpoch = state.startEpoch || session.startEpoch;
    session.teams = state.teams || session.teams;
    for (const member of state.roster || []) {
      session.names[member.id] = member.name;
      if (!session.bodies.has(member.id)) {
        addBody(member.id, member.team, member.name, spawnFor(member.team, session.bodies.size), member.id === session.selfId);
      }
    }
    if (state.phase === "end" && !session.ended) {
      session.ended = true;
      $("#end-title").textContent = state.winner === "tie" ? "It's a tie" : `${teamName(state.winner)} win`;
      $("#end-detail").textContent = $("#end-title").textContent === "It's a tie"
        ? `Same score when the clock ran out. Guards ${session.scores.guards}, Zombies ${session.scores.zombies}.`
        : `Guards ${session.scores.guards} · Zombies ${session.scores.zombies}.`;
      $("#end-again").classList.toggle("hidden", !session.isHost);
      show("#screen-end");
    }
  }
  if (state.phase === "play") {
    const movedTeam = state.moved && state.moved[gameApi?.selfId];
    if (movedTeam) toast(`Teams were uneven, so you're on the ${teamName(movedTeam)}.`);
  }
}

function onWho() {
  renderRoom();
}

function onSnap(id, data) {
  if (!session || id === session.selfId || !data) return;
  const team = session.teams[id] || "guards";
  const body = ensureRemote(id, team, session.names[id] || "Player");
  if (!body || Date.now() < (body.holdUntil || 0)) return;
  body.x = data.x;
  body.y = data.y;
  body.z = data.z;
  body.yaw = data.yaw;
  body.grounded = !!data.g;
}

function onBots(id, data) {
  if (!session || !Array.isArray(data)) return;
  if (session.isHost && id !== session.hostId) return;
  for (const row of data) {
    const body = ensureRemote(row.id, row.team, row.name);
    if (!body || body.local) continue;
    if (session.isHost) continue;
    body.x = row.x;
    body.y = row.y;
    body.z = row.z;
    body.yaw = row.yaw;
    body.bot = true;
    session.names[row.id] = row.name;
  }
}

function onEvent(id, data) {
  if (!data) return;
  if (data.kind === "begin" && data.state) onMatch(data.state);
  if (!session) return;
  if (data.kind === "spawn") {
    const body = session.bodies.get(data.id);
    if (!body) return;
    body.x = data.x;
    body.y = data.y;
    body.z = data.z;
    body.yaw = data.yaw;
    body.vy = 0;
    body.invulnUntil = data.invulnUntil || 0;
    body.holdUntil = Date.now() + 400;
    if (body.local) input.yaw = data.yaw;
  }
  if (data.kind === "begin" && data.moved && data.moved[session.selfId]) {
    toast(`Teams were uneven, so you're on the ${teamName(data.moved[session.selfId])}.`);
  }
  void id;
}

function onJoin(info) {
  renderRoom();
  if (!session?.isHost || session.phase !== "play" || !info?.userId) return;
  setTimeout(() => lateJoin(info.userId), 600);
}

function lateJoin(userId) {
  if (!session?.isHost || session.phase !== "play" || session.bodies.has(userId) || !gameApi) return;
  const who = gameApi.who.getAll() || {};
  if (!who[userId]) return;
  const counts = { guards: 0, zombies: 0 };
  for (const team of Object.values(session.teams)) counts[team] += 1;
  const team = counts.guards <= counts.zombies ? "guards" : "zombies";
  const name = cleanName(who[userId].name || "Player");
  session.teams[userId] = team;
  const spot = spawnFor(team, counts[team]);
  addBody(userId, team, name, spot, false);
  sendEvent(gameApi, {
    kind: "spawn",
    id: userId,
    x: spot.x,
    y: spot.y || 0.1,
    z: spot.z,
    yaw: spot.yaw,
    invulnUntil: Date.now() + 1500,
  });
  void publish();
  toast(`${name} joined the ${teamName(team)}.`);
}

function onLeave(info) {
  if (session) removeBody(info.userId);
  if (!remote || !gameApi) {
    renderRoom();
    return;
  }
  if (info.userId === remote.hostId && session) {
    const ids = [gameApi.selfId, ...Object.keys(gameApi.room.getUsers?.() || {})].sort();
    if (ids[0] === gameApi.selfId) {
      session.isHost = true;
      session.hostId = gameApi.selfId;
      toast("Host left. You're the host now.");
      void publish();
    }
  }
  renderRoom();
}

const handlers = { onMatch, onWho, onSnap, onEvent, onBots, onJoin, onLeave, onError: (err) => console.warn(err) };

async function createOnline(settings) {
  const code = makeCode();
  $("#room-status").textContent = "Opening the game…";
  show("#screen-room");
  try {
    gameApi = await net.joinGame(code, handlers);
    gameApi.who.set({ name: myName, pref });
    remote = {
      phase: "lobby",
      hostId: gameApi.selfId,
      code,
      mode: settings.mode,
      pointsToWin: settings.pointsToWin,
      durationSec: settings.durationSec,
      useBots: settings.useBots,
      startEpoch: 0,
      scores: { guards: 0, zombies: 0 },
      winner: null,
      teams: {},
      roster: [],
      seq: 1,
      hostNow: Date.now(),
    };
    await gameApi.match.set(remote);
    listed = true;
    publishListing();
    renderRoom();
  } catch (err) {
    console.warn(err);
    toast("Couldn't open the online game. The public relay may be blocked.");
    show("#screen-create");
  }
}

async function joinListed(ad) {
  $("#room-status").textContent = `Joining ${ad.code}…`;
  show("#screen-room");
  try {
    gameApi = await net.joinGame(ad.code, handlers);
    gameApi.who.set({ name: myName, pref });
    renderRoom();
  } catch (err) {
    console.warn(err);
    toast("Couldn't join that game.");
    show("#screen-home");
  }
}

function publishListing() {
  if (!listed || !remote) return;
  const humans = gameApi ? Object.keys(gameApi.who.getAll() || {}).length : 1;
  net.publishAd({
    code: remote.code,
    name: myName,
    mode: remote.mode,
    pointsToWin: remote.pointsToWin,
    durationSec: remote.durationSec,
    useBots: remote.useBots,
    phase: session?.phase || remote.phase || "lobby",
    players: Math.max(1, humans),
    maxPlayers: 8,
  });
}

function renderList(games) {
  const list = $("#game-list");
  list.replaceChildren();
  if (!games.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No games in the lobby right now.";
    list.append(empty);
    return;
  }
  for (const game of games) {
    const item = document.createElement("li");
    const info = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = `${game.name || "Player"}'s game`;
    const mode = document.createElement("span");
    mode.textContent = modeLabel(game);
    const meta = document.createElement("span");
    const phase = game.phase === "play" ? "Playing" : game.phase === "end" ? "Game over" : "In the lobby";
    meta.textContent = `${game.players || 1} player${game.players === 1 ? "" : "s"} · ${phase}`;
    info.append(title, mode, meta);
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Join";
    button.disabled = (game.players || 1) >= (game.maxPlayers || 8);
    button.addEventListener("click", () => joinListed(game));
    item.append(info, button);
    list.append(item);
  }
}

function renderRoom() {
  if (!gameApi) return;
  const state = remote;
  $("#room-code").textContent = state?.code || "····";
  $("#room-mode").textContent = state ? modeLabel(state) : "Waiting for the host…";
  $("#room-bots").textContent = state?.useBots === false ? "No bots" : "Bots fill empty spots";
  const who = gameApi.who.getAll() || {};
  const teams = state?.teams || {};
  const ids = [...new Set([...Object.keys(who), ...Object.keys(teams), gameApi.selfId])];
  const ul = $("#room-players");
  ul.replaceChildren();
  for (const id of ids) {
    const li = document.createElement("li");
    const row = who[id];
    const name = cleanName(row?.name || (id === gameApi.selfId ? myName : "Player"));
    const team = teams[id];
    const choice = team ? teamName(team) : row?.pref === "guards" ? "Wants guards" : row?.pref === "zombies" ? "Wants zombies" : "Either side";
    li.textContent = `${name}${id === gameApi.selfId ? " (you)" : ""} — ${choice}`;
    ul.append(li);
  }
  const host = state && state.hostId === gameApi.selfId;
  const lobby = !state || state.phase === "lobby";
  $("#room-start").classList.toggle("hidden", !host || !lobby);
  $("#room-wait").classList.toggle("hidden", host || !lobby);
  $("#room-status").textContent = lobby ? (host ? "Pick sides, then start." : "Waiting for the host to start.") : "Match in progress.";
  for (const [id, value] of [["#side-guards", "guards"], ["#side-zombies", "zombies"], ["#side-either", "either"]]) {
    $(id).classList.toggle("on", pref === value);
  }
}

function setPref(next) {
  pref = next;
  if (gameApi) gameApi.who.set({ name: myName, pref });
  renderRoom();
}

function addDecor() {
  const spots = [
    { team: "guards", name: "Sir Tape", x: -2.2, z: -14, yaw: Math.PI },
    { team: "zombies", name: "Wobble", x: 5, z: -33, yaw: Math.PI },
    { team: "zombies", name: "Nibbles", x: CLIMB[7].x, z: CLIMB[7].z, yaw: Math.PI / 2 },
  ];
  for (const spot of spots) {
    const y = floorAt(spot.x, spot.z, spot.team === "guards" ? 0 : 6);
    const actor = createActor(THREE, spot.team, spot.name);
    actor.group.position.set(spot.x, y, spot.z);
    scene.add(actor.group);
    decor.push({ actor, ...spot, y });
  }
}

function attract(time) {
  const ang = -0.65 + Math.sin(time * 0.18) * 0.22;
  camera.position.set(Math.sin(ang) * 38, 14.5, -Math.cos(ang) * 36);
  camera.lookAt(0, 6.5, -1);
  for (const prop of decor) prop.actor.update(time, 0.4, prop.yaw + Math.sin(time + prop.x) * 0.2);
}

let rafId = 0;
let timerId = 0;
function schedule() {
  // A hidden tab never fires requestAnimationFrame, and that callback is the
  // only place the next frame gets queued. Cancel it and keep simulating.
  if (document.hidden) {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    if (!timerId) timerId = setTimeout(() => { timerId = 0; loop(performance.now()); }, 80);
  } else {
    if (timerId) {
      clearTimeout(timerId);
      timerId = 0;
    }
    if (!rafId) rafId = requestAnimationFrame((t) => { rafId = 0; loop(t); });
  }
}
document.addEventListener("visibilitychange", schedule);

function loop(stamp) {
  const now = stamp;
  if (!loop.last) loop.last = now;
  let raw = Math.min(0.2, (now - loop.last) / 1000);
  loop.last = now;
  const time = now / 1000;
  if (!session) attract(time);
  else {
    // Catch up a few slices after a hitch so the match doesn't go into slow motion.
    const slice = 1 / 60;
    let n = 0;
    while (raw > 0.0001 && n < 6) {
      step(Math.min(slice, raw), Date.now(), time);
      raw -= slice;
      n += 1;
    }
  }
  world.update(time);
  if (!document.hidden) renderer.render(scene, camera);
  if (!window.__towers) window.__towers = {};
  window.__towers.ready = true;
  window.__towers.playing = Boolean(session && session.phase === "play");
  window.__towers.scores = session ? { ...session.scores } : null;
  const me = session?.bodies.get(session.selfId);
  window.__towers.me = me ? { x: me.x, y: me.y, z: me.z, team: me.team } : null;
  schedule();
}

function bind() {
  $("#name-input").value = myName;
  $("#name-input").addEventListener("change", (e) => saveName(e.target.value));
  $("#btn-to-create").addEventListener("click", () => show("#screen-create"));
  $("#btn-back").addEventListener("click", () => show("#screen-home"));
  $("#btn-practice").addEventListener("click", () => startPractice(normalizeSettings({ mode: "points", pointsToWin: 3, minutes: 3, useBots: true })));
  $("#btn-host").addEventListener("click", () => {
    saveName($("#name-input").value);
    createOnline(settingsFromForm());
  });
  $("#btn-practice-setup").addEventListener("click", () => {
    saveName($("#name-input").value);
    startPractice(settingsFromForm());
  });
  $("#mode-points").addEventListener("click", () => setMode("points"));
  $("#mode-timer").addEventListener("click", () => setMode("timer"));
  document.querySelectorAll("[data-points]").forEach((button) => {
    button.addEventListener("click", () => { $("#points-input").value = button.dataset.points; });
  });
  document.querySelectorAll("[data-min]").forEach((button) => {
    button.addEventListener("click", () => { $("#minutes-input").value = button.dataset.min; });
  });
  $("#side-guards").addEventListener("click", () => setPref("guards"));
  $("#side-zombies").addEventListener("click", () => setPref("zombies"));
  $("#side-either").addEventListener("click", () => setPref("either"));
  $("#room-start").addEventListener("click", () => startOnline());
  $("#room-leave").addEventListener("click", () => leaveMatch());
  $("#btn-leave").addEventListener("click", () => leaveMatch());
  $("#end-leave").addEventListener("click", () => leaveMatch());
  $("#end-again").addEventListener("click", () => {
    if (session?.online && session.isHost) {
      const settings = session.settings;
      const code = session.code;
      teardownPlay();
      remote = {
        ...(remote || {}),
        phase: "lobby",
        scores: { guards: 0, zombies: 0 },
        winner: null,
        teams: {},
        roster: [],
        startEpoch: 0,
        code,
        mode: settings.mode,
        pointsToWin: settings.pointsToWin,
        durationSec: settings.durationSec,
        useBots: settings.useBots,
        hostId: gameApi.selfId,
      };
      gameApi.match.set(remote);
      show("#screen-room");
      renderRoom();
    } else if (!session?.online) {
      const settings = session.settings;
      teardownPlay();
      startPractice(settings);
    }
  });
  $("#btn-mute").addEventListener("click", () => {
    const muted = audio.toggle();
    $("#btn-mute").textContent = muted ? "Sound off" : "Sound on";
  });
  window.addEventListener("pointerdown", () => audio.unlock(), { once: true });
}

function setMode(mode) {
  $("#mode-points").classList.toggle("on", mode === "points");
  $("#mode-timer").classList.toggle("on", mode === "timer");
  $("#points-opts").classList.toggle("hidden", mode !== "points");
  $("#timer-opts").classList.toggle("hidden", mode !== "timer");
}

async function leaveMatch() {
  listed = false;
  net.clearAd();
  teardownPlay();
  remote = null;
  const api = gameApi;
  gameApi = null;
  if (api) {
    try { await api.room.leave(); } catch { /* already gone */ }
  }
  show("#screen-home");
}

function boot() {
  bind();
  addDecor();
  show("#screen-home");
  const params = new URLSearchParams(location.search);
  if (params.get("name")) saveName(params.get("name"));
  net.openLobby((games) => renderList(games), (status) => {
    const el = $("#lobby-status");
    const peers = status.startsWith("online:") ? Number(status.slice(7)) : 0;
    el.textContent = status.startsWith("online")
      ? (peers > 0 ? `Public lobby connected. ${peers} other player${peers === 1 ? "" : "s"} here.` : "Public lobby connected.")
      : status === "connecting"
        ? "Connecting to the public lobby…"
        : status.startsWith("error")
          ? "Lobby relay hit a snag. Practice with bots still works."
          : "Lobby relay unreachable. Practice with bots still works.";
    el.dataset.status = status.startsWith("online") ? "online" : status.startsWith("error") ? "offline" : status;
  });
  setInterval(() => {
    if (!session) renderList(net.refreshAds());
    if (listed) publishListing();
  }, 2000);
  if (params.has("play")) startPractice(normalizeSettings({ mode: "points", pointsToWin: 3, minutes: 3, useBots: true }));
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  schedule();
}

boot();
