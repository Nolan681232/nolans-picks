// Camera-relative controls. Yaw 0 looks down -Z. Positive pitch looks up.
// W follows the camera's horizontal forward. D strafes to the camera's right.

export function viewBasis(yaw, pitch = 0) {
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const flatForward = { x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) };
  const forward = { x: flatForward.x * cp, y: sp, z: flatForward.z * cp };
  const right = { x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) };
  return { forward, flatForward, right };
}

export function wishVector(yaw, keys) {
  const { flatForward, right } = viewBasis(yaw, 0);
  let x = 0;
  let z = 0;
  if (keys.forward) { x += flatForward.x; z += flatForward.z; }
  if (keys.back) { x -= flatForward.x; z -= flatForward.z; }
  if (keys.right) { x += right.x; z += right.z; }
  if (keys.left) { x -= right.x; z -= right.z; }
  return { x, z };
}

// Camera sits behind the look direction and aims ahead of the player,
// so the center of the screen is where W will take you.
export function cameraAim(yaw, pitch, origin, distance = 6.4, eye = 1.5) {
  const { forward } = viewBasis(yaw, pitch);
  const y = Math.max(origin.y + 0.55, origin.y + eye - forward.y * distance);
  return {
    position: {
      x: origin.x - forward.x * distance,
      y,
      z: origin.z - forward.z * distance,
    },
    target: {
      x: origin.x + forward.x * 2.2,
      y: origin.y + eye + forward.y * 2.2,
      z: origin.z + forward.z * 2.2,
    },
  };
}
