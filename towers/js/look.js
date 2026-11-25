import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

export function initialQuality() {
  try {
    const saved = localStorage.getItem("towers-quality");
    if (saved === "low" || saved === "medium" || saved === "high") return saved;
  } catch { /* private mode */ }
  const ua = navigator.userAgent || "";
  if (/Quest|Mobile|Android/i.test(ua)) return "low";
  if ((navigator.hardwareConcurrency || 8) <= 4) return "low";
  return "medium";
}

function prepare(THREE, texture, colorSpace) {
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = colorSpace;
  return texture;
}

async function loadSet(THREE, folder, withAo) {
  const loader = new THREE.TextureLoader();
  const color = prepare(THREE, await loader.loadAsync(`assets/${folder}/color.jpg`), THREE.SRGBColorSpace);
  let normal = null;
  let roughness = null;
  let ao = null;
  try {
    normal = prepare(THREE, await loader.loadAsync(`assets/${folder}/normal.jpg`), THREE.NoColorSpace);
    roughness = prepare(THREE, await loader.loadAsync(`assets/${folder}/roughness.jpg`), THREE.NoColorSpace);
    if (withAo) ao = prepare(THREE, await loader.loadAsync(`assets/${folder}/ao.jpg`), THREE.NoColorSpace);
  } catch (err) {
    console.warn(err);
  }
  return { color, normal, roughness, ao };
}

export async function loadLook(THREE, renderer, quality) {
  const cardboard = await loadSet(THREE, "cardboard", false);
  const grass = await loadSet(THREE, "grass", true);
  const ground = await loadSet(THREE, "ground", true);
  let envMap = null;
  if (quality !== "low") {
    const hdr = await new RGBELoader().loadAsync("assets/sky.hdr");
    const pmrem = new THREE.PMREMGenerator(renderer);
    envMap = pmrem.fromEquirectangular(hdr).texture;
    hdr.dispose();
    pmrem.dispose();
  }
  return { cardboard, grass, ground, envMap };
}
