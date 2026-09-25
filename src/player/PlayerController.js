import * as THREE from 'three';
import { GAME_CONFIG } from '../config.js';
import { HealthSystem } from './HealthSystem.js';

// Depenetration search: ring distances in metres, tried nearest first.
const ESCAPE_RINGS = [0.12, 0.24, 0.38, 0.55, 0.75, 1.0, 1.3, 1.7];
const ESCAPE_DIRECTIONS = 16;
const ESCAPE_OFFSETS = [
  [0.45, 0], [-0.45, 0], [0, 0.45], [0, -0.45],
  [0.32, 0.32], [-0.32, 0.32], [0.32, -0.32], [-0.32, -0.32],
  [0.75, 0], [-0.75, 0], [0, 0.75], [0, -0.75],
];
// Cancels the collision world's floor skin while descending, so a body resting
// on a surface is stopped by it instead of quietly sinking through it.
const DESCEND_TOLERANCE = -0.04;
const ASCEND_TOLERANCE = 0.02;

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
    // Gravity is integrated once, inside applyGravity, together with the
    // substepped vertical sweep. Applying it here as well halved the jump arc.

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
    const radius = this.config.radius;
    const height = this.config.height;

    // Anything short enough to step onto is not a wall, so a body walks over
    // kerbs, crates and low barriers instead of being stopped by them.
    const stepTolerance = this.grounded ? this.config.stepHeight : 0.04;
    const tentative = this.root.position.clone();
    tentative[axis] += amount;

    if (this.arena.canPlayerOccupy(tentative, radius, height, this, stepTolerance)) {
      this.root.position[axis] = tentative[axis];
      // The step tolerance let the body move into something low, so lift it onto
      // that surface now. Without this the body would end up embedded in a step
      // it is allowed to pass, because the ground query only looks downwards.
      if (this.grounded) this.liftOntoStep(tentative);
      return;
    }

    if (!this.grounded) return;
    // Still blocked even after allowing a step: try climbing onto a ledge.
    if (this.arena.tryStepMove(this.root.position, axis === 'x' ? amount : 0, axis === 'z' ? amount : 0, radius, height, this.config.stepHeight, this)) {
      return;
    }

    // Last resort, slide along the wall.
    if (this.arena.canPlayerOccupy(tentative, radius, height, this, 0)) {
      this.root.position[axis] = tentative[axis];
    }
  }

  /**
   * Raises the body onto whatever it just stepped into.
   *
   * A step tolerance deliberately lets a body move into a low obstacle, so the
   * lift has to happen as part of that move. The surface being stepped onto is
   * *above* the current position, so the search starts above the head and walks
   * down; looking only downwards would miss it and leave the body embedded in
   * the very obstacle it was allowed to pass.
   */
  liftOntoStep(tentative) {
    const radius = this.config.radius;
    const height = this.config.height;
    const baseY = this.root.position.y;
    // Only lift when the body is genuinely inside something at this level.
    if (this.arena.canPlayerOccupy(tentative, radius, height, this, 0.02)) return;

    const surface = this.arena.getGroundHeight(
      tentative,
      radius,
      baseY + this.config.stepHeight + 0.35,
      baseY + this.config.stepHeight + 0.35,
      this.config.stepHeight + 0.55,
    );
    const climb = surface - baseY;
    if (climb <= 0.02 || climb > this.config.stepHeight) return;
    const lifted = tentative.clone();
    lifted.y = surface;
    if (!this.arena.canPlayerOccupy(lifted, radius, height, this, ASCEND_TOLERANCE)) return;
    this.root.position.copy(lifted);
  }

  applyGravity(delta) {
    const radius = this.config.radius;
    const height = this.config.height;
    const substep = this.config.verticalSubstep;
    const startY = this.root.position.y;

    this.velocity.y -= this.config.gravity * delta;
    if (this.velocity.y < -this.config.maxFallSpeed) this.velocity.y = -this.config.maxFallSpeed;
    let remaining = this.velocity.y * delta;

    this.grounded = false;
    let currentY = startY;
    let hitCeiling = false;
    let landed = false;

    // Integrated in small substeps so a fast drop can never skip a thin floor.
    while (Math.abs(remaining) > 1e-4) {
      const step = THREE.MathUtils.clamp(remaining, -substep, substep);
      remaining -= step;
      const nextY = currentY + step;
      const tentative = this.root.position.clone();
      tentative.y = nextY;

      if (this.arena.canPlayerOccupy(tentative, radius, height, this, DESCEND_TOLERANCE)) {
        currentY = nextY;
        this.root.position.y = nextY;
        continue;
      }
      if (step > 0) {
        hitCeiling = true;
        break;
      }

      // Blocked on the way down. Rest on whatever stopped the body, which is
      // more reliable than trusting a single point ray for the surface.
      for (let k = 7; k >= 1; k -= 1) {
        const candidate = currentY - (currentY - nextY) * (k / 8);
        tentative.y = candidate;
        if (!this.arena.canPlayerOccupy(tentative, radius, height, this, DESCEND_TOLERANCE)) continue;
        this.root.position.y = candidate;
        currentY = candidate;
        break;
      }
      landed = true;
      break;
    }

    if (hitCeiling) this.velocity.y = 0;

    if (landed) {
      this.velocity.y = 0;
      this.grounded = true;
    } else if (this.velocity.y <= 0) {
      // Snap onto the floor when it is within a few centimetres. This is what
      // keeps the body grounded while standing still and while walking down
      // steps, instead of sinking a little further every frame.
      //
      // The search starts from head height and walks down, so a body that is
      // already below a ledge (having stepped off it, for instance) still finds
      // the surface it is really standing on.
      const snap = this.arena.getGroundHeight(
        this.root.position,
        radius,
        currentY + 0.6,
        currentY + 0.6,
        0.6 + substep * 2 + 0.1,
      );
      const drop = currentY - snap;
      if (drop <= 0.09 && drop >= -0.35) {
        const settled = this.root.position.clone();
        settled.y = snap;
        if (this.arena.canPlayerOccupy(settled, radius, height, this, ASCEND_TOLERANCE)) {
          this.root.position.y = snap;
          this.velocity.y = 0;
          this.grounded = true;
        }
      }
    }

    if (!this.grounded) this.depenetrate();
  }

  /**
   * Pushes the body back out of anything it ended up inside. Without this a
   * body that clips a ledge edge on the way down would stay wedged in it.
   *
   * The search fans out over directions and distances rather than a fixed ring,
   * so a body that has worked its way into a narrow crack between two props can
   * always find the way back out instead of being stuck there permanently.
   */
  depenetrate() {
    const radius = this.config.radius;
    const height = this.config.height;
    const base = this.root.position;
    if (this.arena.canPlayerOccupy(base, radius, height, this, 0.02)) return false;

    // Closest fit first: short nudges before long relocations.
    for (let ring = 0; ring < ESCAPE_RINGS.length; ring += 1) {
      const distance = ESCAPE_RINGS[ring];
      for (let i = 0; i < ESCAPE_DIRECTIONS; i += 1) {
        const angle = (i / ESCAPE_DIRECTIONS) * Math.PI * 2;
        const probe = new THREE.Vector3(
          base.x + Math.cos(angle) * distance,
          base.y,
          base.z + Math.sin(angle) * distance,
        );
        if (!this.arena.canPlayerOccupy(probe, radius, height, this, 0.02)) continue;
        base.copy(probe);
        return true;
      }
    }

    // Nothing to the side: lift clear of the floor instead.
    const ground = this.arena.getGroundHeight(base, radius, base.y, base.y, 8);
    const baseY = Number.isFinite(ground) ? ground : base.y;
    for (let lift = 0.12; lift <= 2.4; lift += 0.12) {
      const probe = new THREE.Vector3(base.x, baseY + lift, base.z);
      if (!this.arena.canPlayerOccupy(probe, radius, height, this, 0.02)) continue;
      base.copy(probe);
      return true;
    }
    return false;
  }

  /** Nudges the body sideways to get out from under a too low ceiling. */
  escapeFromCrouch(target) {
    const radius = this.config.radius;
    const height = this.config.height;
    for (let i = 0; i < ESCAPE_OFFSETS.length; i += 1) {
      const probe = target.clone();
      probe.x += ESCAPE_OFFSETS[i][0];
      probe.z += ESCAPE_OFFSETS[i][1];
      if (!this.arena.canPlayerOccupy(probe, radius, height, this, 0.02)) continue;
      this.root.position.copy(probe);
      return true;
    }
    return false;
  }

  getAimDirection(target = new THREE.Vector3()) {
    this.camera.updateWorldMatrix(true, false);
    return this.camera.getWorldDirection(target);
  }

  getEyePosition(target = new THREE.Vector3()) {
    return this.camera.getWorldPosition(target);
  }
}
