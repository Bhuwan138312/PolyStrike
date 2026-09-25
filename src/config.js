export const GAME_CONFIG = Object.freeze({
  arenaHalfSize: 34,
  player: {
    health: 100,
    radius: 0.38,
    height: 1.78,
    eyeHeight: 1.62,
    walkSpeed: 5.2,
    sprintSpeed: 9.5,
    acceleration: 48,
    airAcceleration: 12,
    groundDamping: 12,
    airDamping: 1.2,
    gravity: 22,
    jumpSpeed: 7.25,
    stepHeight: 0.56,
    // Vertical movement is integrated in small substeps and the fall speed is
    // capped, so a fast drop can never pass through a thin floor or ledge.
    maxFallSpeed: 32,
    verticalSubstep: 0.16,
    ads: {
      transition: 0.18,
      fov: 68,
      movementMultiplier: 0.72,
      lookMultiplier: 0.68,
      swayMultiplier: 0.28,
      recoilMultiplier: 0.72,
      shakeMultiplier: 0.62,
      spreadMultiplier: 0.2,
    },
  },
  weapon: {
    magazineSize: 30,
    reserveSize: 120,
    maxReserve: 120,
    fireInterval: 0.095,
    reloadDuration: 1.25,
    bodyDamage: 34,
    headDamage: 68,
    range: 120,
    baseSpread: 0.0025,
    moveSpread: 0.012,
    recoilPitch: 0.024,
    recoilYaw: 0.01,
    mechanics: {
      projectile: {
        speed: 220,
        range: 120,
        length: 0.24,
        radius: 0.009,
        maxActive: 24,
        maxStepDistance: 2.5,
      },
      bolt: {
        duration: 0.082,
        travel: 0.42,
      },
      trigger: {
        duration: 0.055,
        travel: 0.16,
      },
      magazine: {
        removeStart: 0.15,
        removeEnd: 0.25,
        insertStart: 0.55,
        insertEnd: 0.85,
        cockStart: 0.88,
        cockEnd: 0.98,
        downDistance: 1.4,
        backwardDistance: 0.6,
      },
      shell: {
        speed: 1.35,
        lift: 1.05,
        backwardSpeed: 0.34,
        gravity: 9.8,
        lifetime: 1.8, // Shorter lifetime so they despawn faster
        maxActive: 16, // Heavily reduced active shells
      },
    },
  },
  secondaryWeapon: {
    magazineSize: 12,
    reserveSize: 60,
    maxReserve: 60,
    fireInterval: 0.18, // 220ms gap (approx 4.5 shots per second)
    reloadDuration: 1.25,
    bodyDamage: 25,
    headDamage: 50,
    range: 60,
    baseSpread: 0.005,
    moveSpread: 0.015,
    recoilPitch: 0.018,
    recoilYaw: 0.008,
    mechanics: {
      projectile: {
        speed: 150,
        range: 60,
        length: 0.15,
        radius: 0.007,
        maxActive: 12,
        maxStepDistance: 2.0,
      },
      bolt: { // For pistol slide
        duration: 0.1, // Set to 100ms as requested
        travel: 0.06, // Reduced travel distance
      },
      trigger: {
        duration: 0.055,
        travel: 0.05,
      },
      magazine: {
        removeStart: 0.1,
        removeEnd: 0.2,
        insertStart: 0.5,
        insertEnd: 0.8,
        cockStart: 0.85,
        cockEnd: 0.95,
        downDistance: 0.5,
        backwardDistance: 0.0,
      },
      shell: {
        speed: 1.0,
        lift: 1.2,
        backwardSpeed: 0.1,
        gravity: 9.8,
        lifetime: 1.5,
        maxActive: 8,
      },
    },
  },
  difficulties: {
    training: {
      label: 'TRAINING', count: 0, accuracy: 0,
      reactionMultiplier: 1, damageMultiplier: 1,
    },
    easy: {
      label: 'EASY', count: 15, accuracy: -0.08,
      reactionMultiplier: 1.35, damageMultiplier: 0.75,
    },
    normal: {
      label: 'NORMAL', count: 20, accuracy: 0,
      reactionMultiplier: 1, damageMultiplier: 1,
    },
    hard: {
      label: 'HARD', count: 25, accuracy: 0.07,
      reactionMultiplier: 0.74, damageMultiplier: 1.12,
    },
  },
});

export const BOT_TYPES = Object.freeze({
  normal: {
    name: 'RIFLEMAN', color: 0x3c91a8, accent: 0x8bd9e8,
    health: 100, speed: 2.85, detection: 39, attackRange: 29,
    preferredRange: 15, reaction: [0.42, 0.72], fireInterval: [0.72, 1.02],
    accuracy: [0.70, 0.80], burst: [2, 4], damage: [8, 11], coverChance: 0.42,
  },
  aggressive: {
    name: 'BREACHER', color: 0xd7683f, accent: 0xffb05c,
    health: 88, speed: 4.05, detection: 37, attackRange: 18,
    preferredRange: 6.5, reaction: [0.32, 0.58], fireInterval: [0.58, 0.84],
    accuracy: [0.59, 0.69], burst: [2, 3], damage: [6, 9], coverChance: 0.2,
  },
  defensive: {
    name: 'SENTINEL', color: 0xc5a73d, accent: 0xffef86,
    health: 115, speed: 2.55, detection: 43, attackRange: 34,
    preferredRange: 23, reaction: [0.58, 0.88], fireInterval: [0.82, 1.2],
    accuracy: [0.77, 0.87], burst: [2, 3], damage: [10, 13], coverChance: 0.72,
  },
});
