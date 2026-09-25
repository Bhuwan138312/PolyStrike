import * as THREE from 'three';

export class EffectPool {
  constructor(scene) {
    this.scene = scene;
    this.effects = [];
    this.particleGeometry = new THREE.TetrahedronGeometry(0.075, 0);
    this.flashGeometry = new THREE.SphereGeometry(0.11, 6, 4);
    this.ringGeometry = new THREE.RingGeometry(0.35, 0.48, 12);
    this.tracerGeometry = new THREE.CylinderGeometry(0.016, 0.016, 1, 4, 1, true);
    this.materials = {
      spark: new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true }),
      dust: new THREE.MeshBasicMaterial({ color: 0xdfb67a, transparent: true }),
      enemy: new THREE.MeshBasicMaterial({ color: 0x72d5df, transparent: true }),
      danger: new THREE.MeshBasicMaterial({ color: 0xff755c, transparent: true }),
      ring: new THREE.MeshBasicMaterial({ color: 0xff755c, transparent: true, side: THREE.DoubleSide }),
      tracerPlayer: new THREE.MeshBasicMaterial({ color: 0xffe8a3, transparent: true, opacity: 0.78 }),
      tracerPlayerADS: new THREE.MeshBasicMaterial({ color: 0xfff0bd, transparent: true, opacity: 0.96, depthWrite: false }),
      tracerEnemy: new THREE.MeshBasicMaterial({ color: 0xff745c, transparent: true, opacity: 0.64 }),
    };
    this.maxEffects = 180;
  }

  impact(position, normal = null, material = 'dust') {
    if (this.effects.length + 2 > this.maxEffects) return;
    const mesh = new THREE.Mesh(this.particleGeometry, this.materials[material]);
    mesh.position.copy(position);
    this.scene.add(mesh);
    this.effects.push({
      type: 'particle', object: mesh, age: 0, life: 0.28,
      velocity: randomDirection(normal),
    });

    const flash = new THREE.Mesh(this.flashGeometry, this.materials.spark);
    flash.position.copy(position);
    flash.scale.set(0.6, 0.6, 0.6);
    this.scene.add(flash);
    this.effects.push({ type: 'flash', object: flash, age: 0, life: 0.09 });
  }

  hit(position, headshot = false) {
    this.burst(position, headshot ? 8 : 5, headshot ? 'spark' : 'enemy', 2.4);
  }

  tracer(start, end, enemy = false, ads = false) {
    if (this.effects.length >= this.maxEffects) return;
    const direction = new THREE.Vector3().subVectors(end, start);
    const length = direction.length();
    if (length < 0.05) return;
    const mesh = new THREE.Mesh(
      this.tracerGeometry,
      enemy ? this.materials.tracerEnemy : ads ? this.materials.tracerPlayerADS : this.materials.tracerPlayer,
    );
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    mesh.scale.set(1, length, 1);
    this.scene.add(mesh);
    this.effects.push({ type: 'tracer', object: mesh, age: 0, life: enemy ? 0.09 : ads ? 0.12 : 0.075 });
  }

  death(position) {
    this.burst(position.clone().add(new THREE.Vector3(0, 1, 0)), 16, 'enemy', 4.3);
    if (this.effects.length >= this.maxEffects) return;
    const ringMaterial = this.materials.ring.clone();
    const ring = new THREE.Mesh(this.ringGeometry, ringMaterial);
    ring.position.copy(position).add(new THREE.Vector3(0, 0.12, 0));
    ring.rotation.x = -Math.PI / 2;
    this.scene.add(ring);
    this.effects.push({
      type: 'ring', object: ring, age: 0, life: 0.42, disposeMaterial: ringMaterial,
    });
  }

  burst(position, count, material, speed) {
    for (let i = 0; i < count; i += 1) {
      if (this.effects.length >= this.maxEffects) break;
      const mesh = new THREE.Mesh(this.particleGeometry, this.materials[material]);
      mesh.position.copy(position);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      this.scene.add(mesh);
      const direction = new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 1.5,
        Math.random() * 2 - 1,
      ).normalize().multiplyScalar(speed * (0.45 + Math.random() * 0.65));
      this.effects.push({ type: 'particle', object: mesh, age: 0, life: 0.3 + Math.random() * 0.25, velocity: direction });
    }
  }

  update(delta) {
    for (let i = this.effects.length - 1; i >= 0; i -= 1) {
      const effect = this.effects[i];
      effect.age += delta;
      const progress = effect.age / effect.life;
      if (progress >= 1) {
        this.scene.remove(effect.object);
        effect.disposeMaterial?.dispose();
        this.effects.splice(i, 1);
        continue;
      }
      if (effect.type === 'particle') {
        effect.velocity.y -= 8.5 * delta;
        effect.object.position.addScaledVector(effect.velocity, delta);
        effect.object.rotation.x += delta * 9;
        effect.object.rotation.z += delta * 7;
        effect.object.scale.setScalar(1 - progress * 0.72);
      } else if (effect.type === 'flash') {
        effect.object.scale.setScalar(0.6 + progress * 1.8);
      } else if (effect.type === 'ring') {
        effect.object.scale.setScalar(1 + progress * 4.2);
        effect.object.material.opacity = 1 - progress;
      }
    }
  }

  clear() {
    for (const effect of this.effects) {
      this.scene.remove(effect.object);
      effect.disposeMaterial?.dispose();
    }
    this.effects.length = 0;
  }
}

function randomDirection(normal) {
  const direction = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 1.2, Math.random() * 2 - 1);
  if (normal) direction.addScaledVector(normal, 1.2);
  return direction.normalize().multiplyScalar(1.4 + Math.random() * 1.5);
}
