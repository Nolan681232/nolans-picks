import assert from "node:assert/strict";
import { cameraAim, viewBasis, wishVector } from "../js/controls.js";
import { stickToWorld } from "../js/vrmath.js";

function close(a, b, eps = 1e-6) {
  assert.ok(Math.abs(a - b) < eps, `${a} !== ${b}`);
}

// Looking down -Z (yaw 0): W is -Z, D is +X (screen right), mouse-up pitch looks up.
{
  const { forward, flatForward, right } = viewBasis(0, 0);
  close(flatForward.x, 0);
  close(flatForward.z, -1);
  close(right.x, 1);
  close(right.z, 0);
  const up = viewBasis(0, 0.4).forward;
  assert.ok(up.y > 0, "positive pitch looks up");
  const w = wishVector(0, { forward: true });
  close(w.x, flatForward.x);
  close(w.z, flatForward.z);
  const d = wishVector(0, { right: true });
  close(d.x, right.x);
  close(d.z, right.z);
  const a = wishVector(0, { left: true });
  close(a.x, -right.x);
  close(a.z, -right.z);
  const aim = cameraAim(0, 0, { x: 0, y: 0, z: 0 });
  const viewX = aim.target.x - aim.position.x;
  const viewZ = aim.target.z - aim.position.z;
  const vlen = Math.hypot(viewX, viewZ);
  close(viewX / vlen, flatForward.x);
  close(viewZ / vlen, flatForward.z);
}

// Looking +Z, and a couple of other yaws: keyboard strafe matches the VR stick.
for (const yaw of [0, Math.PI / 2, Math.PI, -0.7, 2.2]) {
  const { flatForward, right } = viewBasis(yaw, 0);
  const w = wishVector(yaw, { forward: true });
  const s = wishVector(yaw, { back: true });
  const d = wishVector(yaw, { right: true });
  const a = wishVector(yaw, { left: true });
  close(w.x, flatForward.x);
  close(w.z, flatForward.z);
  close(s.x, -flatForward.x);
  close(s.z, -flatForward.z);
  close(d.x, right.x);
  close(d.z, right.z);
  close(a.x, -right.x);
  close(a.z, -right.z);
  const stickW = stickToWorld(flatForward.x, flatForward.z, 0, -1);
  const stickD = stickToWorld(flatForward.x, flatForward.z, 1, 0);
  close(stickW.x, flatForward.x);
  close(stickW.z, flatForward.z);
  close(stickD.x, right.x);
  close(stickD.z, right.z);
  const aim = cameraAim(yaw, 0.2, { x: 3, y: 1, z: -4 });
  const vx = aim.target.x - aim.position.x;
  const vz = aim.target.z - aim.position.z;
  const len = Math.hypot(vx, vz);
  close(vx / len, flatForward.x);
  close(vz / len, flatForward.z);
}

console.log("controls tests ok");
