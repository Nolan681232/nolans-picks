import { COLUMN, DECK_Y, GATE_HALF, WALL_H, WALL_OUTER, getSolids } from "./course.js";

// INNER is not exported. Recompute from the same numbers course.js uses.
const INNER = WALL_OUTER - 1.9;

function mat(THREE, color, map, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    map: map || null,
    roughness: opts.roughness ?? 0.9,
    metalness: 0,
    flatShading: false,
    ...opts,
  });
}

function box(THREE, w, h, d, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function createWorld(THREE, scene, textures) {
  scene.background = new THREE.Color(0x8ecff6);
  scene.fog = new THREE.Fog(0xb9e6fb, 55, 130);

  const hemi = new THREE.HemisphereLight(0xe7f6ff, 0xd7b07a, 0.72);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff3d4, 1.45);
  sun.position.set(32, 48, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 120;
  sun.shadow.camera.left = -45;
  sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 45;
  sun.shadow.camera.bottom = -45;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);
  sun.target.position.set(0, 6, 0);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(190, 24, 16),
    new THREE.MeshBasicMaterial({ map: textures.sky, side: THREE.BackSide, fog: false })
  );
  scene.add(sky);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(78, 48),
    mat(THREE, 0xffffff, textures.grass, { roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.castShadow = false;
  scene.add(ground);

  const court = new THREE.Mesh(
    new THREE.PlaneGeometry(INNER * 2 - 0.4, INNER * 2 - 0.4),
    mat(THREE, 0xffffff, textures.court, { roughness: 1 })
  );
  court.rotation.x = -Math.PI / 2;
  court.position.y = 0.02;
  court.receiveShadow = true;
  scene.add(court);

  const path = new THREE.Mesh(
    new THREE.PlaneGeometry(8.2, 16),
    mat(THREE, 0xffffff, textures.court, { roughness: 1 })
  );
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.03, -WALL_OUTER - 4);
  path.receiveShadow = true;
  scene.add(path);

  const card = mat(THREE, 0xffffff, textures.card);
  const cardDark = mat(THREE, 0xc48a46, textures.card);
  const cardDeep = mat(THREE, 0xa86d38, textures.card);
  const stairMat = mat(THREE, 0xf0c98a, textures.card);
  const padMat = mat(THREE, 0xe7b56a, textures.card);
  const towerMat = mat(THREE, 0xd9a15c, textures.card);
  const crateMat = mat(THREE, 0xefd2a0, textures.card);

  const kindMat = {
    wall: cardDark,
    lintel: cardDeep,
    stair: stairMat,
    pad: padMat,
    tower: towerMat,
    crown: cardDeep,
    crate: crateMat,
  };

  for (const s of getSolids()) {
    const w = s.maxX - s.minX;
    const h = s.maxY - s.minY;
    const d = s.maxZ - s.minZ;
    const mesh = box(THREE, w, h, d, kindMat[s.kind] || card);
    mesh.position.set((s.minX + s.maxX) / 2, (s.minY + s.maxY) / 2, (s.minZ + s.maxZ) / 2);
    scene.add(mesh);
  }

  // Gold lip on the roof so the goal reads from the courtyard.
  const lip = box(THREE, COLUMN * 2 + 0.4, 0.18, COLUMN * 2 + 0.4, mat(THREE, 0xf2c14e));
  lip.position.set(0, DECK_Y + 0.02, 0);
  scene.add(lip);

  addCrenellations(THREE, scene, card);
  addGate(THREE, scene, textures, cardDeep);
  addSigns(THREE, scene, textures);
  addTrees(THREE, scene);
  const clouds = addClouds(THREE, scene);
  const flag = addFlag(THREE, scene, textures);
  addTapeLine(THREE, scene);
  addWindows(THREE, scene);

  return {
    update(time) {
      flag.rotation.y = Math.sin(time * 1.4) * 0.35;
      clouds.forEach((c, i) => {
        c.position.x += Math.sin(time * 0.15 + i) * 0.004;
      });
    },
  };
}

function addCrenellations(THREE, scene, material) {
  const spots = [];
  const y = WALL_H;
  const o = WALL_OUTER - 0.7;
  for (let x = -WALL_OUTER + 2; x <= WALL_OUTER - 2; x += 2.5) {
    if (Math.abs(x) < GATE_HALF + 1.2) continue;
    spots.push([x, y, -o], [x, y, o]);
  }
  for (let z = -WALL_OUTER + 2; z <= WALL_OUTER - 2; z += 2.5) {
    spots.push([-o, y, z], [o, y, z]);
  }
  const geo = new THREE.BoxGeometry(1.15, 0.72, 1.15);
  const mesh = new THREE.InstancedMesh(geo, material, spots.length);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const dummy = new THREE.Object3D();
  spots.forEach((p, i) => {
    dummy.position.set(p[0], p[1] + 0.36, p[2]);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  });
  scene.add(mesh);
}

function addGate(THREE, scene, textures, material) {
  const postGeo = new THREE.BoxGeometry(0.7, 5.1, 1.7);
  for (const x of [-GATE_HALF - 0.15, GATE_HALF + 0.15]) {
    const post = new THREE.Mesh(postGeo, material);
    post.position.set(x, 2.55, -WALL_OUTER + 0.95);
    post.castShadow = true;
    post.receiveShadow = true;
    scene.add(post);
  }
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(6.2, 1.45),
    new THREE.MeshStandardMaterial({ map: textures.castle, roughness: 0.85, side: THREE.DoubleSide })
  );
  sign.position.set(0, 4.7, -WALL_OUTER + 0.2);
  sign.rotation.y = Math.PI;
  scene.add(sign);
}

function addSigns(THREE, scene, textures) {
  const g = new THREE.Mesh(
    new THREE.PlaneGeometry(5.2, 1.3),
    new THREE.MeshStandardMaterial({ map: textures.guards, roughness: 0.8 })
  );
  g.position.set(-8, 2.15, -18);
  g.rotation.y = Math.PI;
  scene.add(g);

  const z = new THREE.Mesh(
    new THREE.PlaneGeometry(6.4, 1.5),
    new THREE.MeshStandardMaterial({ map: textures.zombies, roughness: 0.8, side: THREE.DoubleSide })
  );
  z.position.set(0, 1.7, -31.5);
  scene.add(z);
}

function addTrees(THREE, scene) {
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0xa86b3c, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x5aaa3e, roughness: 0.85 });
  const leafMat2 = new THREE.MeshStandardMaterial({ color: 0x7bc85a, roughness: 0.85 });
  const spots = [
    [-20, -38], [18, -40], [-38, -12], [40, -8], [-34, 22], [30, 30],
    [-14, 40], [16, 42], [42, 16], [-42, 6], [24, -18], [-28, -28],
  ];
  for (const [x, z] of spots) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.4, 1.8, 6), trunkMat);
    trunk.position.set(x, 0.9, z);
    trunk.castShadow = true;
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.55, 2.6, 6), Math.random() > 0.5 ? leafMat : leafMat2);
    leaf.position.set(x, 2.7, z);
    leaf.castShadow = true;
    scene.add(trunk, leaf);
  }
}

function addClouds(THREE, scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.92 });
  const clouds = [];
  const spots = [[-20, 32, -10], [24, 30, 16], [-8, 36, 30], [36, 33, -24], [-40, 31, 8]];
  for (const [x, y, z] of spots) {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(2.2 + i * 0.3, 8, 6), mat);
      puff.position.set(i * 2.4 - 2, (i % 2) * 0.6, 0);
      puff.scale.y = 0.55;
      g.add(puff);
    }
    g.position.set(x, y, z);
    scene.add(g);
    clouds.push(g);
  }
  return clouds;
}

function addFlag(THREE, scene, textures) {
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.1, 4.2, 6),
    new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.8 })
  );
  pole.position.set(0, 24.2, 0);
  pole.castShadow = true;
  scene.add(pole);
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(2.3, 1.35),
    new THREE.MeshStandardMaterial({ map: textures.flag, roughness: 0.7, side: THREE.DoubleSide })
  );
  flag.position.set(1.25, 25.6, 0);
  scene.add(flag);
  return flag;
}

function addTapeLine(THREE, scene) {
  const blue = new THREE.MeshStandardMaterial({ color: 0x2f62e0, roughness: 0.7 });
  const green = new THREE.MeshStandardMaterial({ color: 0x3e8f28, roughness: 0.7 });
  const thickness = 0.28;
  const y = 0.05;
  const o = WALL_OUTER + 0.15;
  const i = WALL_OUTER - 2.2;
  const len = WALL_OUTER * 2;
  const strips = [
    [0, -o, len, thickness, green],
    [0, o, len, thickness, green],
    [-o, 0, thickness, len, green],
    [o, 0, thickness, len, green],
    [0, -i, len - 6, thickness, blue],
    [0, i, len - 6, thickness, blue],
    [-i, 0, thickness, len - 6, blue],
    [i, 0, thickness, len - 6, blue],
  ];
  for (const [x, z, w, d, m] of strips) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), m);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
}

function addWindows(THREE, scene) {
  const frame = new THREE.MeshStandardMaterial({ color: 0x2a2118, roughness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xc9ecff, roughness: 0.25, emissive: 0x8fd4f5, emissiveIntensity: 0.18 });
  const faces = [
    [0, 0, COLUMN + 0.06, 0],
    [0, 0, -COLUMN - 0.06, Math.PI],
    [COLUMN + 0.06, 0, 0, Math.PI / 2],
    [-COLUMN - 0.06, 0, 0, -Math.PI / 2],
  ];
  for (const [x, , z, rot] of faces) {
    for (const y of [4.2, 8.2, 12.2]) {
      const g = new THREE.Group();
      const hole = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.35), glass);
      const barH = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.08, 0.05), frame);
      const barV = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.35, 0.05), frame);
      barH.position.z = 0.02;
      barV.position.z = 0.02;
      g.add(hole, barH, barV);
      g.position.set(x, y, z);
      g.rotation.y = rot;
      scene.add(g);
    }
  }
}

export { INNER };
