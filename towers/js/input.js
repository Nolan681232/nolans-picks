export function createInput(canvas) {
  const keys = new Set();
  const state = {
    keys,
    yaw: Math.PI,
    pitch: 0.28,
    locked: false,
    jump: false,
    dash: false,
  };

  const onKey = (e, down) => {
    const tag = e.target && e.target.tagName;
    const typing = (tag === "INPUT" || tag === "TEXTAREA") && !e.target.closest("#overlay.hidden");
    if (typing) return;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    if (down) {
      if (!keys.has(e.code)) {
        if (e.code === "Space") state.jump = true;
        if (e.code === "ShiftLeft" || e.code === "ShiftRight" || e.code === "KeyF") state.dash = true;
      }
      keys.add(e.code);
    } else {
      keys.delete(e.code);
    }
  };
  window.addEventListener("keydown", (e) => onKey(e, true));
  window.addEventListener("keyup", (e) => onKey(e, false));
  window.addEventListener("blur", () => keys.clear());

  document.addEventListener("pointerlockchange", () => {
    state.locked = document.pointerLockElement === canvas;
  });
  document.addEventListener("mousemove", (e) => {
    if (!state.locked) return;
    state.yaw -= e.movementX * 0.0022;
    state.pitch -= e.movementY * 0.0018;
    state.pitch = Math.max(-0.35, Math.min(0.85, state.pitch));
  });
  canvas.addEventListener("click", () => {
    if (canvas.dataset.play === "1" && document.pointerLockElement !== canvas) {
      canvas.requestPointerLock?.();
    }
  });

  return state;
}

export function wishDir(input) {
  const yaw = input.yaw;
  const lookX = -Math.sin(yaw);
  const lookZ = -Math.cos(yaw);
  const rightX = -Math.cos(yaw);
  const rightZ = Math.sin(yaw);
  let x = 0;
  let z = 0;
  const k = input.keys;
  if (k.has("KeyW") || k.has("ArrowUp")) { x += lookX; z += lookZ; }
  if (k.has("KeyS") || k.has("ArrowDown")) { x -= lookX; z -= lookZ; }
  if (k.has("KeyD") || k.has("ArrowRight")) { x += rightX; z += rightZ; }
  if (k.has("KeyA") || k.has("ArrowLeft")) { x -= rightX; z -= rightZ; }
  return { x, z };
}
