// Thumbstick axes in the flat world. stickY is negative when the stick is pushed forward
// (xr-standard). forward is the horizontal look direction. Right is to the player's right.
export function stickToWorld(forwardX, forwardZ, stickX, stickY) {
  const len = Math.hypot(forwardX, forwardZ) || 1;
  const fx = forwardX / len;
  const fz = forwardZ / len;
  const rx = -fz;
  const rz = fx;
  const fwd = -stickY;
  return {
    x: fx * fwd + rx * stickX,
    z: fz * fwd + rz * stickX,
  };
}

export function deadstick(x, y, dead = 0.18) {
  const m = Math.hypot(x, y);
  if (m < dead) return { x: 0, y: 0 };
  const s = (m - dead) / (1 - dead);
  return { x: (x / m) * s, y: (y / m) * s };
}
