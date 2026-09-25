import * as THREE from 'three';
import { GAME_CONFIG } from '../config.js';
import { InputManager } from './InputManager.js';
import { AudioManager } from './AudioManager.js';
import { EffectPool } from './EffectPool.js';
import { ArenaMap } from '../world/ArenaMap.js';
import { NavigationGrid } from '../navigation/NavigationGrid.js';
import { PlayerController } from '../player/PlayerController.js';
import { WeaponSystem } from '../player/WeaponSystem.js';
import { BotSpawner } from '../enemies/BotSpawner.js';
import { UIManager } from '../ui/UIManager.js';

export class Game {
  constructor(container) {
    this.container = container;
    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.state = 'LOADING';
    this.difficultyKey = 'normal';
    this.difficulty = GAME_CONFIG.difficulties.normal;
    this.kills = 0;
    this.outcome = null;
    this.outcomeTimer = 0;
    this.pointerLockPending = false;
    this.pointerLockWasActive = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xffc599);
    this.scene.fog = new THREE.Fog(0xffc599, 40, 110);

    this.camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.045, 150);
    this.camera.rotation.order = 'YXZ';
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.id = 'game-canvas';
    this.renderer.domElement.setAttribute('aria-label', 'Poly Strike 3D arena');
    container.querySelector('#viewport').appendChild(this.renderer.domElement);

    this.audio = new AudioManager();
    this.effects = new EffectPool(this.scene);
    this.arena = new ArenaMap(this.scene);
    this.navigation = new NavigationGrid(this.arena);
    this.input = new InputManager(this.renderer.domElement);
    this.player = new PlayerController({
      scene: this.scene,
      camera: this.camera,
      input: this.input,
      arena: this.arena,
      audio: this.audio,
    });

    this.player.onHealthChanged = (health) => this.ui.setHealth(health, this.player.health.maxHealth);
    this.player.onDeath = () => this.queueOutcome(false);
    const createWeaponCallbacks = (getWeapon) => ({
      getBotHitMeshes: () => this.spawner.getHitMeshes(),
      onBotHit: (bot, damage, point, headshot) => this.handleBotHit(bot, damage, point, headshot),
      onAmmoChange: (magazine, reserve, reloading, elapsed) => {
        if (this.activeWeapon === getWeapon()) this.ui.setAmmo(magazine, reserve, reloading, elapsed, getWeapon().config);
      },
      onSpread: (spread) => {
        if (this.activeWeapon === getWeapon()) this.ui.setSpread(spread);
      },
      onReloadStart: () => {
        if (this.activeWeapon === getWeapon()) this.ui.setAmmo(getWeapon().magazine, getWeapon().reserve, true, 0, getWeapon().config);
      },
      onReloadProgress: (magazine, reserve, elapsed) => {
        if (this.activeWeapon === getWeapon()) this.ui.setAmmo(magazine, reserve, true, elapsed, getWeapon().config);
      },
      onReloadEnd: () => {
        if (this.activeWeapon === getWeapon()) this.ui.setAmmo(getWeapon().magazine, getWeapon().reserve, false, 0, getWeapon().config);
      },
      onDry: () => {
        if (this.activeWeapon === getWeapon()) this.ui.setAmmo(getWeapon().magazine, getWeapon().reserve, false, 0, getWeapon().config);
      },
    });

    this.primaryWeapon = new WeaponSystem({
      scene: this.scene, camera: this.camera, player: this.player, arena: this.arena, effects: this.effects, audio: this.audio,
      config: GAME_CONFIG.weapon, modelUrl: '/models/m416rifle.glb', displayName: 'M416', targetLength: 1.25, viewScale: 1.3,
      callbacks: createWeaponCallbacks(() => this.primaryWeapon),
    });

    this.secondaryWeapon = new WeaponSystem({
      scene: this.scene, camera: this.camera, player: this.player, arena: this.arena, effects: this.effects, audio: this.audio,
      config: GAME_CONFIG.secondaryWeapon, modelUrl: '/models/Pistol.glb', displayName: 'Pistol', targetLength: 0.42, viewScale: 1.0,
      basePosition: new THREE.Vector3(0.24, -0.24, -0.50), // Moved right and down for less dominant idle view
      callbacks: createWeaponCallbacks(() => this.secondaryWeapon),
    });

    this.weapons = [this.primaryWeapon, this.secondaryWeapon];
    this.activeWeaponIndex = 0;
    this.activeWeapon = this.primaryWeapon;
    this.player.weapon = this.activeWeapon;
    this.secondaryWeapon.model.visible = false;
    this.primaryWeapon.model.visible = false;

    this.input.onDigit1 = () => this.switchWeapon(0);
    this.input.onDigit2 = () => this.switchWeapon(1);
    this.input.onScrollUp = () => this.switchWeapon(this.activeWeaponIndex === 0 ? 1 : 0);
    this.input.onScrollDown = () => this.switchWeapon(this.activeWeaponIndex === 0 ? 1 : 0);

    // Weapon switch animation state
    this.weaponSwitching = false;
    this.switchElapsed = 0;
    this.switchDuration = 0.3;        // total switch time
    this.switchHalfTime = 0.15;       // halfway point: old weapon fully down
    this.switchTargetIndex = -1;
    this.switchPhase = 'none';        // 'down', 'up', 'none'
    this.switchOffsetY = 0;           // vertical offset applied to weapon holder

    this.spawner = new BotSpawner({
      scene: this.scene,
      arena: this.arena,
      navigation: this.navigation,
      effects: this.effects,
      audio: this.audio,
      onDeath: (bot) => this.handleBotDeath(bot),
    });

    this.ui = new UIManager({ audio: this.audio, weaponConfig: GAME_CONFIG.weapon });
    this.ui.setCallbacks({
      startMatch: (difficulty, map) => this.startMatch(difficulty, map),
      resume: () => this.resume(),
      restart: () => this.startMatch(this.difficultyKey, this.currentMapName),
      showMenu: () => this.showMenu(),
      quit: () => this.quit(),
      setSensitivity: (value) => { this.input.sensitivity = value; },
    });

    this.input.onEscape = () => {
      if (this.state === 'PLAYING' && !this.outcome) this.pause();
    };
    this.input.onPointerLockChange = (locked) => this.handlePointerLock(locked);
    this.input.onPointerLockError = () => this.handlePointerLockError();
    this.input.onBlur = () => {
      if (this.state === 'PLAYING' && !this.outcome) this.pause();
    };
    this.input.onAnyInteraction = () => this.audio.resume();

    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'PLAYING' && !this.outcome) this.pause();
    });

    this.player.reset(this.arena.getPlayerSpawn());
    this.ui.setHealth(this.player.health.current, this.player.health.maxHealth);
    this.ui.setAmmo(this.activeWeapon.magazine, this.activeWeapon.reserve, false, 0, this.activeWeapon.config);
    this.ui.setEnemies(0);
    this.bindLoop();
  }

  async init() {
    await this.arena.loadMapModel('arena');
    this.navigation.build(this.arena);
    this.currentMapName = 'arena';

    await Promise.all([this.primaryWeapon.ready, this.secondaryWeapon.ready]);
    requestAnimationFrame(() => {
      if (this.state === 'LOADING') {
        this.showMenu();
        this.ui.finishLoading();
      }
    });
  }

  async startMatch(difficultyKey = 'normal', mapName = 'arena') {
    this.audio.resume();
    this.difficultyKey = difficultyKey in GAME_CONFIG.difficulties ? difficultyKey : 'normal';
    this.difficulty = GAME_CONFIG.difficulties[this.difficultyKey];

    if (this.currentMapName !== mapName) {
      this.ui.screens.loading.classList.remove('is-hidden');
      await this.arena.loadMapModel(mapName);
      this.navigation.build();
      this.currentMapName = mapName;
      this.ui.screens.loading.classList.add('is-hidden');
    }

    this.kills = 0;
    this.outcome = null;
    this.outcomeTimer = 0;
    this.effects.clear();
    this.ui.resetMatchHud();
    this.arena.setDynamicActors([]);
    this.player.reset(this.arena.getPlayerSpawn());
    this.activeWeaponIndex = 0;
    this.activeWeapon = this.primaryWeapon;
    this.player.weapon = this.activeWeapon;
    this.weapons.forEach(w => {
      w.clearTransientEffects();
      w.model.visible = false;
      w.reset();
    });
    this.activeWeapon.model.visible = true;
    this.spawner.spawnMatch(this.player.root.position, this.difficulty);
    this.updateDynamicActors();
    this.ui.setHealth(this.player.health.current, this.player.health.maxHealth);
    this.ui.setAmmo(this.activeWeapon.magazine, this.activeWeapon.reserve, false, 0, this.activeWeapon.config);
    this.ui.setEnemies(this.spawner.getAlive());
    this.ui.setActiveWeaponIcon(this.activeWeaponIndex);
    this.ui.showHud();
    this.state = 'PLAYING';
    this.input.clear();
    this.input.setEnabled(true);
    this.requestPlayablePointerLock();
  }

  switchWeapon(index) {
    if (this.state !== 'PLAYING' || this.outcome || index === this.activeWeaponIndex || index < 0 || index >= this.weapons.length) return;
    if (this.weaponSwitching) return; // Already switching
    if (this.activeWeapon.reloading) return; // Can't switch during reload

    this.weaponSwitching = true;
    this.switchElapsed = 0;
    this.switchTargetIndex = index;
    this.switchPhase = 'down';
    this.switchOffsetY = 0;
  }

  updateWeaponSwitch(delta) {
    if (!this.weaponSwitching) return;

    this.switchElapsed += delta;

    if (this.switchPhase === 'down') {
      // Dropping old weapon down
      const t = Math.min(this.switchElapsed / this.switchHalfTime, 1);
      const eased = t * t; // ease-in: accelerate down
      this.switchOffsetY = -eased * 0.45;

      if (t >= 1) {
        // Halfway: swap the actual weapon
        this.activeWeapon.model.visible = false;
        this.activeWeaponIndex = this.switchTargetIndex;
        this.activeWeapon = this.weapons[this.switchTargetIndex];
        this.player.weapon = this.activeWeapon;
        this.activeWeapon.model.visible = true;
        this.ui.setAmmo(this.activeWeapon.magazine, this.activeWeapon.reserve, this.activeWeapon.reloading, this.activeWeapon.reloadElapsed, this.activeWeapon.config);
        this.ui.setActiveWeaponIcon(this.activeWeaponIndex);

        this.switchPhase = 'up';
        this.switchElapsed = 0;
        this.switchOffsetY = -0.45;
      }
    } else if (this.switchPhase === 'up') {
      // Bringing new weapon up
      const t = Math.min(this.switchElapsed / this.switchHalfTime, 1);
      const eased = 1 - (1 - t) * (1 - t); // ease-out: decelerate as it arrives
      this.switchOffsetY = -0.45 * (1 - eased);

      if (t >= 1) {
        this.weaponSwitching = false;
        this.switchPhase = 'none';
        this.switchOffsetY = 0;
      }
    }

    // Apply offset to the active weapon holder
    this.activeWeapon.weaponHolder.position.y += this.switchOffsetY;
  }

  requestPlayablePointerLock() {
    if (this.state !== 'PLAYING' || this.outcome) return;
    clearTimeout(this.pointerLockTimeout);
    this.pointerLockPending = true;
    this.ui.setCaptureHint(true);
    this.input.requestPointerLock();
    this.pointerLockTimeout = setTimeout(() => {
      if (this.state === 'PLAYING' && this.pointerLockPending && document.pointerLockElement !== this.renderer.domElement) {
        this.pointerLockPending = false;
        this.pause();
      }
    }, 1200);
  }

  pause() {
    if (this.state !== 'PLAYING' || this.outcome) return;
    this.state = 'PAUSED';
    clearTimeout(this.pointerLockTimeout);
    this.pointerLockPending = false;
    this.pointerLockWasActive = false;
    this.input.setEnabled(false);
    this.input.releasePointerLock();
    this.ui.setCaptureHint(false);
    this.ui.setADS(0);
    this.ui.show('pause');
  }

  resume() {
    if (this.state !== 'PAUSED') return;
    this.audio.resume();
    this.state = 'PLAYING';
    this.ui.showHud();
    this.input.clear();
    this.input.setEnabled(true);
    this.requestPlayablePointerLock();
  }

  showMenu() {
    this.state = 'MENU';
    this.outcome = null;
    clearTimeout(this.pointerLockTimeout);
    this.pointerLockPending = false;
    this.pointerLockWasActive = false;
    this.input.setEnabled(false);
    this.input.releasePointerLock();
    this.spawner.clear();
    this.arena.setDynamicActors([]);
    this.effects.clear();
    this.weapons.forEach(w => w.clearTransientEffects());
    this.ui.resetMatchHud();
    this.weapons.forEach(w => w.model.visible = false);
    this.player.root.position.set(34, 9, 34);
    this.camera.fov = 56;
    this.camera.updateProjectionMatrix();
    this.ui.setCaptureHint(false);
    this.ui.show('menu');
  }

  quit() {
    this.state = 'QUIT';
    this.outcome = null;
    clearTimeout(this.pointerLockTimeout);
    this.pointerLockPending = false;
    this.pointerLockWasActive = false;
    this.input.setEnabled(false);
    this.input.releasePointerLock();
    this.spawner.clear();
    this.arena.setDynamicActors([]);
    this.effects.clear();
    this.weapons.forEach(w => w.clearTransientEffects());
    this.ui.resetMatchHud();
    this.weapons.forEach(w => w.model.visible = false);
    this.ui.setCaptureHint(false);
    this.ui.show('quit');
  }

  handlePointerLock(locked) {
    if (locked) {
      clearTimeout(this.pointerLockTimeout);
      this.pointerLockPending = false;
      this.pointerLockWasActive = true;
      if (this.state === 'PLAYING' && !this.outcome) {
        this.ui.setCaptureHint(false);
      } else {
        this.pointerLockWasActive = false;
        this.input.releasePointerLock();
      }
      return;
    }

    this.pointerLockPending = false;
    this.pointerLockWasActive = false;
    if (this.state === 'PLAYING' && this.input.enabled && !this.outcome) {
      this.pause();
    }
  }

  handlePointerLockError() {
    clearTimeout(this.pointerLockTimeout);
    this.pointerLockPending = false;
    this.pointerLockWasActive = false;
    if (this.state === 'PLAYING' && this.input.enabled && !this.outcome) {
      this.pause();
    } else if (this.state === 'PLAYING') {
      this.ui.setCaptureHint(true);
    } else {
      this.ui.setCaptureHint(false);
    }
  }

  handleBotHit(bot, damage, point, headshot) {
    const killed = bot.takeDamage(
      damage,
      point,
      headshot,
      this.player.root.position,
      { player: this.player, elapsed: this.elapsed },
    );
    this.ui.showHitMarker(headshot);
    if (!killed) this.audio.play(headshot ? 'headshot' : 'hit', bot.root.position);
  }

  handleBotDeath(bot) {
    this.kills += 1;
    this.ui.announceKill(bot.type.name);
    this.ui.setEnemies(this.spawner.getAlive());
    if (this.spawner.getAlive() === 0) this.queueOutcome(true);
  }

  queueOutcome(won) {
    if (this.outcome !== null) return;
    this.outcome = won ? 'victory' : 'defeat';
    this.outcomeTimer = won ? 0.82 : 0.68;
    this.pointerLockPending = false;
    this.pointerLockWasActive = false;
    this.input.setEnabled(false);
    this.input.releasePointerLock();
    this.ui.setCaptureHint(false);
  }

  finishOutcome() {
    const won = this.outcome === 'victory';
    this.state = won ? 'WON' : 'LOST';
    this.ui.showEnd(won, this.kills, this.difficulty.count, this.player.health.current);
    this.audio.play(won ? 'victory' : 'defeat');
  }

  updateMenuCamera(delta) {
    const angle = this.elapsed * 0.035 + 0.8;
    const radius = 39;
    this.player.root.position.set(Math.cos(angle) * radius, 10.5, Math.sin(angle) * radius);
    this.player.root.rotation.y = 0;
    this.camera.position.set(0, 4.2, 0);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, 56, 1 - Math.exp(-3 * delta));
    this.camera.updateProjectionMatrix();
    this.player.root.updateMatrixWorld(true);
    this.camera.lookAt(0, 1.8, 0);
  }

  updateDynamicActors() {
    const actors = [{
      owner: this.player,
      position: this.player.root.position,
      radius: this.player.config.radius,
      height: this.player.config.height,
    }];
    for (const bot of this.spawner.bots) {
      if (bot.dead || bot.removed) continue;
      actors.push({ owner: bot, position: bot.root.position, radius: 0.43, height: 1.85 });
    }
    this.arena.setDynamicActors(actors);
  }

  updateMatch(delta) {
    this.updateDynamicActors();
    if (!this.outcome) {
      // Drop ADS during reload or weapon switch
      this.player.forceNoAds = this.activeWeapon.reloading || this.weaponSwitching;
      this.player.updateAimState(delta);
      const look = this.input.consumeMouseDelta();
      this.player.look(look.x, look.y);
      this.player.update(delta, true);
      if (this.outcome) return;
      this.activeWeapon.update(delta);
      if (this.outcome) return;
      this.updateWeaponSwitch(delta);
      this.spawner.update(delta, { player: this.player, elapsed: this.elapsed });
      this.activeWeapon.updateTransientEffects(delta);
      this.ui.setADS(this.player.adsAmount);
      this.ui.setMoveState(this.player.adsActive ? 'AIM' : this.player.sprinting && this.player.currentSpeed > 4.5 ? 'SPRINT' : this.player.grounded ? 'READY' : 'AIRBORNE');
    } else {
      this.outcomeTimer -= delta;
      for (const bot of this.spawner.bots) {
        if (bot.dead && !bot.removed) bot.update(delta, { player: this.player, elapsed: this.elapsed });
      }
      if (this.spawner.bots.some((bot) => bot.removed)) {
        this.spawner.bots = this.spawner.bots.filter((bot) => !bot.removed);
      }
      if (this.outcomeTimer <= 0) this.finishOutcome();
    }
    this.ui.setDamageFlash(this.player.damageFlash);
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  bindLoop() {
    const frame = () => {
      const delta = Math.min(this.clock.getDelta(), 0.04);
      this.elapsed += delta;
      if (this.state === 'MENU' || this.state === 'QUIT') this.updateMenuCamera(delta);
      if (this.state === 'PLAYING') this.updateMatch(delta);

      this.arena.update(delta, this.elapsed);
      this.effects.update(delta);
      this.audio.updateListener(this.camera);
      this.input.endFrame();
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}
