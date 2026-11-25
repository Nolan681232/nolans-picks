export function createFx(THREE, scene) {
  const bursts = [];
  return {
    burst(x, y, z, color) {
      const count = 22;
      const positions = new Float32Array(count * 3);
      const velocities = [];
      for (let i = 0; i < count; i++) {
        positions[i * 3] = x;
        positions[i * 3 + 1] = y + 1;
        positions[i * 3 + 2] = z;
        velocities.push({
          x: (Math.random() - 0.5) * 5,
          y: Math.random() * 4 + 1.2,
          z: (Math.random() - 0.5) * 5,
        });
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const material = new THREE.PointsMaterial({
        color,
        size: 0.16,
        transparent: true,
        opacity: 1,
        depthWrite: false,
      });
      const points = new THREE.Points(geo, material);
      scene.add(points);
      bursts.push({ points, velocities, life: 0.7 });
    },
    update(dt) {
      for (let i = bursts.length - 1; i >= 0; i--) {
        const burst = bursts[i];
        burst.life -= dt;
        const attr = burst.points.geometry.attributes.position;
        for (let p = 0; p < burst.velocities.length; p++) {
          const v = burst.velocities[p];
          v.y -= 9 * dt;
          attr.setX(p, attr.getX(p) + v.x * dt);
          attr.setY(p, attr.getY(p) + v.y * dt);
          attr.setZ(p, attr.getZ(p) + v.z * dt);
        }
        attr.needsUpdate = true;
        burst.points.material.opacity = Math.max(0, burst.life / 0.7);
        if (burst.life <= 0) {
          scene.remove(burst.points);
          burst.points.geometry.dispose();
          burst.points.material.dispose();
          bursts.splice(i, 1);
        }
      }
    },
  };
}
