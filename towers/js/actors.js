import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

let library = null;

export async function loadCharacterLibrary() {
  const loader = new GLTFLoader();
  library = await loader.loadAsync("assets/characters/AnimationLibrary_Godot_Standard.gltf");
  return library;
}

function standard(THREE, color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0 });
}

function part(THREE, w, h, d, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function createActor(THREE, team, name) {
  if (library) return skinnedActor(THREE, team, name);
  return boxActor(THREE, team, name);
}

function skinnedActor(THREE, team, name) {
  const root = new THREE.Group();
  const model = SkeletonUtils.clone(library.scene);
  model.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
    obj.material = obj.material.clone();
    obj.material.color = new THREE.Color(team === "zombies" ? 0x86a86a : 0x3158b8);
    obj.material.roughness = 0.62;
    obj.material.metalness = 0.04;
    obj.material.envMapIntensity = 0.7;
  });
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const height = Math.max(0.01, bounds.max.y - bounds.min.y);
  model.scale.setScalar(1.72 / height);
  model.position.y -= bounds.min.y * model.scale.y;
  root.add(model);

  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const clip of library.animations) {
    actions[clip.name] = mixer.clipAction(clip, model);
  }
  let current = "";
  function play(clipName, timeScale = 1) {
    const next = actions[clipName] || actions.Idle_Loop;
    if (!next || current === clipName) {
      if (next) next.setEffectiveTimeScale(timeScale);
      return;
    }
    const prev = actions[current];
    current = clipName;
    next.reset().setEffectiveTimeScale(timeScale).fadeIn(0.12).play();
    if (prev) prev.fadeOut(0.12);
  }
  play("Idle_Loop");

  const sprite = nameSprite(THREE, name, team);
  sprite.position.y = 2.05;
  root.add(sprite);
  const head = new THREE.Group();
  head.add(sprite);

  return {
    group: root,
    head,
    label: sprite,
    team,
    update(_time, speed, yaw, dt = 1 / 60, state = {}) {
      mixer.update(dt);
      const moving = speed > 0.45;
      if (state.dash) play("Punch_Jab", 1.15);
      else if (state.grounded === false) play("Jump_Loop", 1);
      else if (team === "zombies") play(moving ? "Walk_Loop" : "Idle_Loop", moving ? 0.72 : 1);
      else if (speed > 5.4) play("Jog_Fwd_Loop", 1.05);
      else if (moving) play("Walk_Loop", 1);
      else play("Idle_Loop");
      root.rotation.y = yaw + Math.PI;
    },
  };
}

function boxActor(THREE, team, name) {
  const root = new THREE.Group();
  const card = standard(THREE, 0xe7c089);
  const ink = standard(THREE, 0x241c14);
  const guardBlue = standard(THREE, 0x2f62e0);
  const guardGold = standard(THREE, 0xf2c14e);
  const zGreen = standard(THREE, 0x78c44a);
  const zDark = standard(THREE, 0x3f7a32);
  const white = standard(THREE, 0xfff8ee);
  const hip = new THREE.Group();
  hip.position.y = 0.78;
  const leftLeg = part(THREE, 0.24, 0.62, 0.26, card);
  leftLeg.position.set(-0.16, -0.28, 0);
  const rightLeg = part(THREE, 0.24, 0.62, 0.26, card);
  rightLeg.position.set(0.16, -0.28, 0);
  hip.add(leftLeg, rightLeg);
  const torso = part(THREE, 0.72, 0.72, 0.4, team === "zombies" ? zGreen : guardBlue);
  torso.position.y = 1.2;
  const belt = part(THREE, 0.76, 0.12, 0.44, team === "zombies" ? zDark : guardGold);
  belt.position.y = 0.92;
  const shoulder = new THREE.Group();
  shoulder.position.y = 1.48;
  const leftArm = part(THREE, 0.18, 0.52, 0.2, card);
  leftArm.position.set(-0.48, -0.18, 0);
  const rightArm = part(THREE, 0.18, 0.52, 0.2, card);
  rightArm.position.set(0.48, -0.18, 0);
  shoulder.add(leftArm, rightArm);
  const head = new THREE.Group();
  head.position.y = 1.82;
  const skull = part(THREE, 0.5, 0.48, 0.48, team === "zombies" ? zGreen : card);
  head.add(skull);
  const eyeWhiteL = new THREE.Mesh(new THREE.SphereGeometry(team === "zombies" ? 0.09 : 0.075, 8, 8), white);
  const eyeWhiteR = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), white);
  eyeWhiteL.position.set(-0.12, 0.06, 0.22);
  eyeWhiteR.position.set(0.12, 0.05, 0.22);
  const pupilL = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), ink);
  const pupilR = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), ink);
  pupilL.position.set(-0.12, 0.05, 0.29);
  pupilR.position.set(0.13, 0.04, 0.29);
  head.add(eyeWhiteL, eyeWhiteR, pupilL, pupilR);
  if (team === "zombies") {
    head.rotation.z = 0.22;
    const smile = part(THREE, 0.22, 0.06, 0.04, ink);
    smile.position.set(0.02, -0.12, 0.24);
    smile.rotation.z = 0.2;
    head.add(smile);
    rightArm.rotation.x = -0.8;
    leftArm.rotation.x = -0.55;
  } else {
    const helm = part(THREE, 0.56, 0.16, 0.54, guardBlue);
    helm.position.y = 0.28;
    head.add(helm);
  }
  root.add(hip, torso, belt, shoulder, head);
  const sprite = nameSprite(THREE, name, team);
  sprite.position.y = 2.35;
  root.add(sprite);
  return {
    group: root,
    head,
    label: sprite,
    team,
    update(time, speed, yaw) {
      const swing = Math.sin(time * 10) * Math.min(0.7, speed * 0.12);
      leftLeg.rotation.x = swing;
      rightLeg.rotation.x = -swing;
      if (team !== "zombies") {
        leftArm.rotation.x = -swing * 0.6;
        rightArm.rotation.x = swing * 0.6;
      }
      root.rotation.y = yaw + Math.PI;
    },
  };
}

function nameSprite(THREE, name, team) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, 256, 64);
  ctx.font = "700 32px Nunito, Fredoka, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#2a2118";
  ctx.strokeText(name, 128, 34);
  ctx.fillStyle = team === "zombies" ? "#d8ffb0" : "#e7f0ff";
  ctx.fillText(name, 128, 34);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false }));
  sprite.scale.set(2.2, 0.55, 1);
  return sprite;
}
