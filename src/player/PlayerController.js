import * as THREE from 'three';
import { GAME_CONFIG } from '../config.js';
import { HealthSystem } from './HealthSystem.js';

export class PlayerController {
  constructor({ scene, camera, input, arena, audio }) {
    this.scene = scene;
    this.camera = camera;
    this.input = input;
    this.arena = arena;
    this.audio = audio;
    this.config = GAME_CONFIG.player;

    this.root = new THREE.Group();
    this.root.name = 'Player';
    this.root.add(camera);
    this.scene.add(this.root);

    this.velocity = new THREE.Vector3();
    this.weaponSway = new THREE.Vector2();
    this.yaw = 0;
    this.pitch = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.recoilVelocity = 0;
    this.shake = 0;
    this.grounded = true;
    this.bobDistance = 0;
    this.lastFootstepDistance = 0;
    this.currentSpeed = 0;
    this.sprinting = false;
    this.adsAmount = 0;
    this.forceNoAds = false;
    this.adsTarget = 0;
    this.adsActive = false;
    this.damageFlash = 0;
    this.lastDamageDirection = 0;
    this.weapon = null;
    this.onHealthChanged = null;
    this.onDeath = null;

    this.health = new HealthSystem(
      this.config.health,
      (amount, current) => {
        this.damageFlash = 1;
        this.shake = Math.min(1.2, this.shake + 0.5);
        this.audio.play('damage');
        this.onHealthChanged?.(current, amount);
      },
      () => this.onDeath?.(),
    );
  }

  reset(spawn) {
    this.root.position.copy(spawn);
    this.root.rotation.set(0, 0, 0);
    this.camera.position.set(0, this.config.eyeHeight, 0);
    this.camera.rotation.set(0, 0, 0);
    this.camera.fov = 90;
    this.camera.updateProjectionMatrix();
    this.velocity.set(0, 0, 0);
    this.weaponSway.set(0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.recoilVelocity = 0;
    this.shake = 0;
    this.damageFlash = 0;
    this.bobDistance = 0;
    this.adsAmount = 0;
    this.adsTarget = 0;
    this.adsActive = false;
    this.grounded = true;
    this.health.reset();
    this.weapon?.reset();
  }

  look(deltaX, deltaY) {
    this.weaponSway.x += deltaX;
    this.weaponSway.y += deltaY;
    const sensitivity = 0.00205 * THREE.MathUtils.lerp(1, this.config.ads.lookMultiplier, this.adsAmount);
    this.yaw -= deltaX * sensitivity;
    this.pitch -= deltaY * sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.47, 1.47);
  }

  addRecoil(pitch, yaw) {
    const adsScale = THREE.MathUtils.lerp(1, this.config.ads.recoilMultiplier, this.adsAmount);
    this.recoilVelocity += pitch * adsScale;
    this.recoilYaw += yaw * adsScale;
  }

  addShake(amount) {
    const adsScale = THREE.MathUtils.lerp(1, this.config.ads.shakeMultiplier, this.adsAmount);
    this.shake = Math.min(1.4, this.shake + amount * adsScale);
  }

  updateAimState(delta) {
    this.adsTarget = this.input.ads ? 1 : 0;
    // Override: force hip fire during reload etc.
    if (this.forceNoAds) this.adsTarget = 0;
    const response = 1 - Math.exp(-delta / (this.config.ads.transition * 0.32));
    this.adsAmount = THREE.MathUtils.lerp(this.adsAmount, this.adsTarget, response);
    this.adsActive = this.adsAmount > 0.5;
  }

  update(delta, aimStateAlreadyUpdated = false) {
    if (!aimStateAlreadyUpdated) this.updateAimState(delta);
    const movement = this.input.getMovement();
    const moving = movement.x !== 0 || movement.z !== 0;
    this.sprinting = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wishDirection = right.multiplyScalar(movement.x).addScaledVector(forward, movement.z);
    if (wishDirection.lengthSq() > 0) wishDirection.normalize();

    const movementSpeed = this.sprinting && moving ? this.config.sprintSpeed : this.config.walkSpeed;
    const targetSpeed = movementSpeed * THREE.MathUtils.lerp(1, this.config.ads.movementMultiplier, this.adsAmount);
    const targetVelocity = wishDirection.multiplyScalar(moving ? targetSpeed : 0);
    const acceleration = this.grounded
      ? (moving ? this.config.acceleration : this.config.groundDamping)
      : (moving ? this.config.airAcceleration : this.config.airDamping);
    const response = 1 - Math.exp(-acceleration * delta / Math.max(4, targetSpeed));
    this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, targetVelocity.x, response);
    this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, targetVelocity.z, response);

    if (this.input.wasPressed('Space') && this.grounded) {
      this.velocity.y = this.config.jumpSpeed;
      this.grounded = false;
      this.audio.play('jump');
    }
    this.velocity.y -= this.config.gravity * delta;

    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (horizontalSpeed > targetSpeed) {
      const scale = targetSpeed / horizontalSpeed;
      this.velocity.x *= scale;
      this.velocity.z *= scale;
    }

    const steps = Math.max(1, Math.ceil(horizontalSpeed * delta / 0.22));
    const stepDelta = delta / steps;
    for (let step = 0; step < steps; step += 1) {
      this.moveHorizontal('x', this.velocity.x * stepDelta);
      this.moveHorizontal('z', this.velocity.z * stepDelta);
    }
    this.applyGravity(delta);

    this.currentSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (this.grounded && this.currentSpeed > 1.2) {
      this.bobDistance += this.currentSpeed * delta;
      
      // A single step is exactly half of a full stride (5.585 / 2 = ~2.7925 meters)
      if (this.bobDistance - this.lastFootstepDistance >= 2.7925) {
        this.audio.play('footstep', null, { speed: this.currentSpeed });
        this.lastFootstepDistance = this.bobDistance;
      }
    } else {
      // Ready to play step immediately when starting to move again
      this.lastFootstepDistance = this.bobDistance - 2.7925;
    }

    // Krunker-style: fast recoil snap-back
    this.recoilPitch += this.recoilVelocity;
    this.recoilVelocity *= Math.exp(-20 * delta);
    this.recoilPitch *= Math.exp(-14 * delta);
    this.recoilYaw *= Math.exp(-16 * delta);
    this.weaponSway.multiplyScalar(Math.exp(-14 * delta));
    this.shake *= Math.exp(-12 * delta);
    this.damageFlash *= Math.exp(-5.2 * delta);

    const bobAmount = this.grounded
      ? Math.min(this.currentSpeed / this.config.sprintSpeed, 1)
        * THREE.MathUtils.lerp(1, this.config.ads.swayMultiplier, this.adsAmount)
      : 0;
    const bobY = Math.sin(this.bobDistance * 2.25) * 0.035 * bobAmount;
    const bobX = Math.sin(this.bobDistance * 1.125) * 0.022 * bobAmount;
    const shakeX = this.shake > 0.002 ? (Math.random() - 0.5) * this.shake * 0.018 : 0;
    const shakeY = this.shake > 0.002 ? (Math.random() - 0.5) * this.shake * 0.018 : 0;
    const strafeRoll = -movement.x * 0.012 * bobAmount;

    this.camera.position.set(bobX, this.config.eyeHeight + bobY, 0);
    this.camera.rotation.set(
      this.pitch + this.recoilPitch + shakeY,
      this.yaw + this.recoilYaw + shakeX,
      strafeRoll + Math.sin(this.bobDistance * 1.125) * 0.004 * bobAmount,
      'YXZ',
    );

    // Constant 90 FOV base, no zoom out on sprint
    const baseFov = 90;
    const targetFov = THREE.MathUtils.lerp(baseFov, this.config.ads.fov, this.adsAmount);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 1 - Math.exp(-14 * delta));
    this.camera.updateProjectionMatrix();
  }

  moveHorizontal(axis, amount) {
    if (Math.abs(amount) < 0.000001) return;
    const tentative = this.root.position.clone();
    tentative[axis] += amount;
    if (this.arena.canPlayerOccupy(tentative, this.config.radius, this.config.height, this)) {
      this.root.position[axis] = tentative[axis];
      return;
    }

    if (!this.grounded) return;
    for (let lift = 0.08; lift <= this.config.stepHeight + 0.0001; lift += 0.08) {
      const stepped = tentative.clone();
      stepped.y += lift;
      if (this.arena.canPlayerOccupy(stepped, this.config.radius, this.config.height, this)) {
        this.root.position[axis] = stepped[axis];
        this.root.position.y = stepped.y;
        return;
      }
    }
  }

  applyGravity(delta) {
    const nextY = this.root.position.y + this.velocity.y * delta;
    const ground = this.arena.getGroundHeight(
      this.root.position,
      this.config.radius,
      this.root.position.y,
      nextY,
    );
    if (this.velocity.y <= 0 && nextY <= ground + 0.001) {
      const landing = this.root.position.clone();
      landing.y = ground;
      if (this.arena.canPlayerOccupy(landing, this.config.radius, this.config.height, this)) {
        this.root.position.y = ground;
        this.velocity.y = 0;
        this.grounded = true;
      } else {
        this.velocity.y = 0;
        this.grounded = false;
      }
      return;
    }

    if (this.velocity.y > 0) {
      const ceiling = this.arena.getCeilingHeight(
        this.root.position,
        this.config.radius,
        this.root.position.y,
        nextY,
        this.config.height,
      );
      if (Number.isFinite(ceiling) && nextY + this.config.height > ceiling) {
        this.root.position.y = ceiling - this.config.height;
        this.velocity.y = 0;
        this.grounded = false;
        return;
      }
    }

    const tentative = this.root.position.clone();
    tentative.y = nextY;
    if (this.arena.canPlayerOccupy(tentative, this.config.radius, this.config.height, this)) {
      this.root.position.y = nextY;
      this.grounded = false;
    } else {
      this.velocity.y = 0;
      this.grounded = false;
    }
  }

  getAimDirection(target = new THREE.Vector3()) {
    this.camera.updateWorldMatrix(true, false);
    return this.camera.getWorldDirection(target);
  }

  getEyePosition(target = new THREE.Vector3()) {
    return this.camera.getWorldPosition(target);
  }
}
