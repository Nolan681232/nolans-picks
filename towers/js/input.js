import { wishVector } from "./controls.js";

export function createInput(canvas) {
  const keys = new Set();
  const state = {
    keys,
    yaw: Math.PI,
    pitch: 0.08,
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
    // Pointer lock reports movement with no button held. Do not require e.buttons.
    if (!state.locked) return;
    state.yaw -= e.movementX * 0.0022;
    state.pitch -= e.movementY * 0.0018;
    state.pitch = Math.max(-0.95, Math.min(1.05, state.pitch));
  });
  canvas.addEventListener("click", () => {
    if (canvas.dataset.play === "1" && document.pointerLockElement !== canvas) {
      canvas.requestPointerLock?.();
    }
  });

  return state;
}

export function wishDir(input) {
  return wishVector(input.yaw, {
    forward: input.keys.has("KeyW") || input.keys.has("ArrowUp"),
    back: input.keys.has("KeyS") || input.keys.has("ArrowDown"),
    left: input.keys.has("KeyA") || input.keys.has("ArrowLeft"),
    right: input.keys.has("KeyD") || input.keys.has("ArrowRight"),
  });
}
