// WebXR for the Quest browser. Desktop play never calls into an active session:
// the rig, controllers, and first-person camera exist only while a headset is presenting.

import { createBody, moveBody } from "./course.js";
import { deadstick, stickToWorld } from "./vrmath.js";

const STORAGE = "towers-vr-comfort";

export function createVR({ THREE, renderer, scene, camera, onStart }) {
  renderer.xr.setReferenceSpaceType("local-floor");
  renderer.xr.setFramebufferScaleFactor(1);

  const rig = new THREE.Group();
  rig.name = "vr-rig";
  scene.add(rig);

  const rayL = renderer.xr.getController(0);
  const rayR = renderer.xr.getController(1);
  const gripL = renderer.xr.getControllerGrip(0);
  const gripR = renderer.xr.getControllerGrip(1);
  rig.add(rayL, rayR, gripL, gripR);

  const handMat = new THREE.MeshStandardMaterial({ color: 0x2f62e0, roughness: 0.75 });
  const tipMat = new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.6, emissive: 0x3a2a10, emissiveIntensity: 0.2 });
  for (const grip of [gripL, gripR]) {
    const mitt = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.14), handMat);
    mitt.position.z = -0.04;
    mitt.castShadow = true;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), tipMat);
    tip.position.z = -0.14;
    tip.name = "tip";
    grip.add(mitt, tip);
  }

  const board = makeBoard(THREE);
  scene.add(board.mesh);

  const vignette = new THREE.Mesh(
    new THREE.PlaneGeometry(1.35, 1.35),
    new THREE.MeshBasicMaterial({
      map: vignetteMap(THREE),
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
    })
  );
  vignette.position.set(0, 0, -0.42);
  vignette.renderOrder = 1000;
  vignette.visible = false;
  camera.add(vignette);

  const roam = createBody({ id: "vr-roam", x: 0, y: 0, z: -16, yaw: Math.PI });
  roam.dashCd = 0;
  let active = false;
  let driving = false;
  let rigYaw = Math.PI;
  let snapLatch = false;
  let jumpWas = false;
  let dashWas = false;
  let jumpEdge = false;
  let dashEdge = false;
  let moveX = 0;
  let moveZ = 0;
  let moving = 0;
  let flash = 0;
  let team = "guards";
  const settings = loadSettings();
  const handPoints = [];
  const forward = new THREE.Vector3();
  const tip = new THREE.Vector3();
  const headPos = new THREE.Vector3();
  let boardKey = "";

  function applySettings(next) {
    settings.turn = next.turn === "smooth" ? "smooth" : "snap";
    settings.angle = [30, 45, 90].includes(next.angle) ? next.angle : 45;
    settings.vignette = next.vignette !== false;
    try { localStorage.setItem(STORAGE, JSON.stringify(settings)); } catch { /* private mode */ }
    paintSettings();
  }

  function paintSettings() {
    const turn = document.querySelector("#vr-turn");
    const angle = document.querySelector("#vr-angle");
    const vig = document.querySelector("#vr-vignette");
    if (turn) turn.value = settings.turn;
    if (angle) angle.value = String(settings.angle);
    if (vig) vig.checked = settings.vignette;
  }

  function readDom() {
    const turn = document.querySelector("#vr-turn");
    const angle = document.querySelector("#vr-angle");
    const vig = document.querySelector("#vr-vignette");
    if (!turn) return;
    applySettings({
      turn: turn.value,
      angle: Number(angle.value),
      vignette: vig.checked,
    });
  }

  function setSupported(ok) {
    for (const button of document.querySelectorAll(".btn-vr")) {
      button.disabled = !ok;
      button.title = ok ? "Put the castle on in a headset" : "This browser has no VR headset";
    }
    const note = document.querySelector("#vr-support");
    if (note) {
      note.textContent = ok
        ? "Quest Browser can enter VR. Left stick moves, right stick turns, A or X jumps, the trigger dashes. Touch someone with a controller to tag them."
        : "Enter VR needs a headset browser, such as the Meta Quest Browser. Keyboard play is unchanged.";
    }
  }

  async function enter() {
    if (!navigator.xr) {
      setSupported(false);
      return;
    }
    readDom();
    driving = true;
    renderer.xr.enabled = true;
    renderer.setAnimationLoop(onXrFrame);
    let session;
    try {
      session = await navigator.xr.requestSession("immersive-vr", {
        requiredFeatures: ["local-floor"],
        optionalFeatures: ["bounded-floor", "hand-tracking"],
      });
    } catch (err) {
      try {
        session = await navigator.xr.requestSession("immersive-vr", {
          optionalFeatures: ["local-floor", "bounded-floor", "hand-tracking"],
        });
      } catch (err2) {
        driving = false;
        renderer.xr.enabled = false;
        renderer.setAnimationLoop(null);
        console.warn(err2 || err);
        const note = document.querySelector("#vr-support");
        if (note) note.textContent = "The headset did not start VR. Stay in the Quest Browser and try Enter VR again.";
        if (typeof window.__towersResume === "function") window.__towersResume();
        return;
      }
    }
    try {
      await renderer.xr.setSession(session);
    } catch (err) {
      driving = false;
      renderer.xr.enabled = false;
      renderer.setAnimationLoop(null);
      console.warn(err);
      try { session.end(); } catch { /* already shut */ }
      if (typeof window.__towersResume === "function") window.__towersResume();
    }
  }

  function onXrFrame(t) {
    if (typeof window.__towersFrame === "function") window.__towersFrame(t);
  }

  renderer.xr.addEventListener("sessionstart", () => {
    active = true;
    driving = true;
    camera.position.set(0, 0, 0);
    camera.quaternion.identity();
    rig.add(camera);
    vignette.visible = settings.vignette;
    handMat.color.set(team === "zombies" ? 0x78c44a : 0x2f62e0);
    if (window.__towers) window.__towers.vr = true;
    if (onStart) onStart();
  });

  renderer.xr.addEventListener("sessionend", () => {
    active = false;
    driving = false;
    camera.removeFromParent();
    vignette.visible = false;
    board.mesh.visible = false;
    renderer.xr.enabled = false;
    renderer.setAnimationLoop(null);
    if (window.__towers) window.__towers.vr = false;
    if (typeof window.__towersResume === "function") window.__towersResume();
  });

  function pads() {
    const out = [];
    const session = renderer.xr.getSession();
    if (!session) return out;
    for (const source of session.inputSources || []) {
      if (source.gamepad) out.push(source);
    }
    return out;
  }

  function poll(dt) {
    if (!active) return;
    let lx = 0;
    let ly = 0;
    let rx = 0;
    let rawRx = 0;
    let jump = false;
    let dash = false;
    let stickClick = false;
    let seen = 0;
    for (const source of pads()) {
      const pad = source.gamepad;
      const standard = pad.mapping === "xr-standard" || pad.axes.length > 3;
      const ax = standard ? (pad.axes[2] || 0) : (pad.axes[0] || 0);
      const ay = standard ? (pad.axes[3] || 0) : (pad.axes[1] || 0);
      const primary = !!(pad.buttons[4] && pad.buttons[4].pressed);
      const trigger = !!(pad.buttons[0] && pad.buttons[0].pressed);
      const extra = !!(pad.buttons[5] && pad.buttons[5].pressed);
      const hand = source.handedness || (seen === 0 ? "left" : "right");
      seen += 1;
      if (hand === "right") {
        rx = deadstick(ax, 0).x;
        rawRx = ax;
        if (pad.buttons[3] && pad.buttons[3].pressed) stickClick = true;
      } else {
        const stick = deadstick(ax, ay);
        lx = stick.x;
        ly = stick.y;
      }
      if (primary) jump = true;
      if (trigger || extra) dash = true;
    }
    if (stickClick && !poll.stickWas) {
      applySettings({ ...settings, turn: settings.turn === "snap" ? "smooth" : "snap" });
    }
    poll.stickWas = stickClick;

    const xrCam = renderer.xr.getCamera();
    forward.set(0, 0, -1).applyQuaternion(xrCam.quaternion);
    forward.y = 0;
    if (forward.lengthSq() < 1e-5) forward.set(-Math.sin(rigYaw), 0, -Math.cos(rigYaw));
    else forward.normalize();
    // Head forward is in reference space. Rotate it by the rig's snap yaw into the world.
    const wx = forward.x * Math.cos(rigYaw) + forward.z * Math.sin(rigYaw);
    const wz = -forward.x * Math.sin(rigYaw) + forward.z * Math.cos(rigYaw);
    const world = stickToWorld(wx, wz, lx, ly);
    moveX = world.x;
    moveZ = world.z;
    moving = Math.min(1, Math.hypot(lx, ly) + Math.abs(rx));

    if (settings.turn === "smooth") {
      rigYaw += rx * 1.7 * dt;
    } else if (Math.abs(rawRx) > 0.6) {
      if (!snapLatch) {
        rigYaw += Math.sign(rawRx) * (settings.angle * Math.PI / 180);
        snapLatch = true;
        flash = Math.max(flash, 0.22);
      }
    } else if (Math.abs(rawRx) < 0.25) {
      snapLatch = false;
    }

    jumpEdge = jumpEdge || (jump && !jumpWas);
    dashEdge = dashEdge || (dash && !dashWas);
    jumpWas = jump;
    dashWas = dash;
  }

  function movement() {
    const jump = jumpEdge;
    const dash = dashEdge;
    jumpEdge = false;
    dashEdge = false;
    return { x: moveX, z: moveZ, jump, dash };
  }

  function lookYaw() {
    const xrCam = renderer.xr.getCamera();
    forward.set(0, 0, -1).applyQuaternion(xrCam.quaternion);
    const wx = forward.x * Math.cos(rigYaw) + forward.z * Math.sin(rigYaw);
    const wz = -forward.x * Math.sin(rigYaw) + forward.z * Math.cos(rigYaw);
    return Math.atan2(-wx, -wz);
  }

  function collectHands() {
    handPoints.length = 0;
    for (const grip of [gripL, gripR]) {
      if (!grip.visible) continue;
      const marker = grip.getObjectByName("tip");
      if (!marker) continue;
      marker.getWorldPosition(tip);
      handPoints.push({ x: tip.x, y: tip.y, z: tip.z });
    }
  }

  function placeBoard() {
    camera.getWorldPosition(headPos);
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
    forward.normalize();
    board.mesh.visible = true;
    board.mesh.position.set(
      headPos.x + forward.x * 2.1,
      headPos.y - 0.28,
      headPos.z + forward.z * 2.1
    );
    board.mesh.lookAt(headPos.x, board.mesh.position.y, headPos.z);
  }

  function syncBoard() {
    const clock = document.querySelector("#clock")?.textContent || "";
    const mode = document.querySelector("#mode-line")?.textContent || "";
    const guards = document.querySelector("#score-g")?.textContent || "0";
    const zombies = document.querySelector("#score-z")?.textContent || "0";
    const you = document.querySelector("#you-line")?.textContent || "";
    const callout = document.querySelector("#callout")?.textContent || "";
    const turn = settings.turn === "snap" ? `Snap ${settings.angle}°` : "Smooth turn";
    const key = [clock, mode, guards, zombies, you, callout, turn].join("|");
    if (key === boardKey) return;
    boardKey = key;
    drawBoard(board.ctx, board.tex, { clock, mode, guards, zombies, you, callout, turn });
  }

  function follow(dt, me) {
    if (!active) return;
    if (!me) {
      const jump = jumpEdge;
      const dash = dashEdge;
      jumpEdge = false;
      dashEdge = false;
      if (dash && roam.dash <= 0 && roam.dashCd <= 0) {
        roam.dash = 0.18;
        roam.dashCd = 0.85;
      }
      if (roam.dashCd > 0) roam.dashCd -= dt;
      moveBody(roam, dt, moveX, moveZ, jump && roam.grounded, { speed: 7.6 });
      rig.position.set(roam.x, roam.y, roam.z);
    } else {
      rig.position.set(me.x, me.y, me.z);
    }
    rig.rotation.y = rigYaw;
    rig.updateMatrixWorld(true);
    collectHands();
    syncBoard();
    placeBoard();
    const want = settings.vignette ? Math.min(0.72, moving * 0.62 + flash) : flash;
    vignette.visible = want > 0.02;
    vignette.material.opacity += (want - vignette.material.opacity) * 0.35;
    if (flash > 0) flash = Math.max(0, flash - dt);
  }

  return {
    get active() { return active; },
    get driving() { return driving; },
    hands: handPoints,
    async boot() {
      paintSettings();
      for (const button of document.querySelectorAll(".btn-vr")) {
        button.addEventListener("click", () => enter());
      }
      for (const id of ["#vr-turn", "#vr-angle", "#vr-vignette"]) {
        document.querySelector(id)?.addEventListener("change", readDom);
      }
      if (!navigator.xr || !navigator.xr.isSessionSupported) {
        setSupported(false);
        return;
      }
      try {
        setSupported(await navigator.xr.isSessionSupported("immersive-vr"));
      } catch {
        setSupported(false);
      }
    },
    poll,
    movement,
    lookYaw,
    follow,
    face(yaw) {
      if (!active) return;
      rigYaw = yaw;
      flash = Math.max(flash, 0.45);
    },
    setTeam(next) {
      team = next === "zombies" ? "zombies" : "guards";
      handMat.color.set(team === "zombies" ? 0x78c44a : 0x2f62e0);
    },
  };
}

function vignetteMap(THREE) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(256, 256, 70, 256, 256, 250);
  g.addColorStop(0, "rgba(18,14,10,0)");
  g.addColorStop(0.42, "rgba(18,14,10,0)");
  g.addColorStop(1, "rgba(18,14,10,1)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) || "{}");
    return {
      turn: saved.turn === "smooth" ? "smooth" : "snap",
      angle: [30, 45, 90].includes(saved.angle) ? saved.angle : 45,
      vignette: saved.vignette !== false,
    };
  } catch {
    return { turn: "snap", angle: 45, vignette: true };
  }
}

function makeBoard(THREE) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 384;
  const ctx = canvas.getContext("2d");
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.64), mat);
  mesh.renderOrder = 999;
  mesh.visible = false;
  mesh.name = "vr-board";
  return { mesh, ctx, tex };
}

function drawBoard(ctx, tex, info) {
  const w = 1024;
  const h = 384;
  ctx.clearRect(0, 0, w, h);
  roundRect(ctx, 8, 8, w - 16, h - 16, 36, "#fff8ea", "#241c14");
  ctx.fillStyle = "#2f62e0";
  roundRect(ctx, 36, 36, 250, 200, 24, "#fff8ea", "#241c14");
  ctx.fillStyle = "#5aaa32";
  roundRect(ctx, 738, 36, 250, 200, 24, "#fff8ea", "#241c14");
  ctx.fillStyle = "#241c14";
  ctx.font = "700 36px Nunito, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("GUARDS", 161, 86);
  ctx.fillText("ZOMBIES", 863, 86);
  ctx.font = "700 92px Fredoka, Nunito, sans-serif";
  ctx.fillStyle = "#2f62e0";
  ctx.fillText(info.guards, 161, 190);
  ctx.fillStyle = "#3d8a28";
  ctx.fillText(info.zombies, 863, 190);
  ctx.fillStyle = "#241c14";
  ctx.font = "700 64px Fredoka, Nunito, sans-serif";
  ctx.fillText(info.clock, 512, 130);
  ctx.font = "800 32px Nunito, sans-serif";
  ctx.fillText(info.mode, 512, 180);
  ctx.font = "800 30px Nunito, sans-serif";
  ctx.fillText(info.you, 512, 250);
  ctx.fillStyle = "#6a4a28";
  ctx.font = "700 26px Nunito, sans-serif";
  const line = info.callout || `${info.turn} · right stick switches · A/X jump · trigger dash`;
  ctx.fillText(line.slice(0, 64), 512, 320);
  tex.needsUpdate = true;
}

function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}
