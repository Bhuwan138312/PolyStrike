import * as THREE from 'three';

export class UIManager {
  constructor({ audio, weaponConfig }) {
    this.audio = audio;
    this.weaponConfig = weaponConfig;
    this.screens = {
      loading: document.querySelector('#loading-screen'),
      menu: document.querySelector('#main-menu'),
      how: document.querySelector('#how-screen'),
      pause: document.querySelector('#pause-screen'),
      end: document.querySelector('#end-screen'),
      quit: document.querySelector('#quit-screen'),
    };
    this.hud = document.querySelector('#hud');
    this.healthValue = document.querySelector('#health-value');
    this.healthFill = document.querySelector('#health-fill');
    this.enemiesValue = document.querySelector('#enemies-value');
    this.ammoLabel = document.querySelector('.ammo-label');
    this.reloadFill = document.querySelector('#reload-fill');
    this.reloadCopy = document.querySelector('#reload-copy');
    this.reloadPrompt = document.querySelector('#reload-prompt');
    this.damageVignette = document.querySelector('#damage-vignette');
    this.crosshair = document.querySelector('#crosshair');
    this.hitMarker = document.querySelector('#hit-marker');
    this.weaponOutlines = [
      document.querySelector('#weapon-outline-0'),
      document.querySelector('#weapon-outline-1')
    ];
    this.killFeed = document.querySelector('#kill-feed');
    this.captureHint = document.querySelector('#capture-hint');
    this.moveState = document.querySelector('#move-state');
    this.sensitivity = document.querySelector('#sensitivity');
    this.sensitivityValue = document.querySelector('#sensitivity-value');
    this.controlsOverlay = document.querySelector('#controls-overlay');
    this.fpsCounter = document.querySelector('#fps-counter');
    this.difficulty = 'normal';
    this.callbacks = {};
    this.hitMarkerTimer = 0;
    this.killTimers = new Set();
    this.bindButtons();
  }

  setCallbacks(callbacks) {
    this.callbacks = callbacks;
  }

  bindButtons() {
    document.querySelectorAll('.difficulty-button[data-difficulty]').forEach((button) => {
      button.addEventListener('click', () => {
        this.audio.resume();
        this.audio.play('ui');
        this.difficulty = button.dataset.difficulty;
        document.querySelectorAll('.difficulty-button[data-difficulty]').forEach((item) => item.classList.toggle('active', item === button));
      });
    });



    const actions = [
      ['#play-button', () => this.callbacks.startMatch?.(this.difficulty, 'arena')],
      ['#how-button', () => this.show('how')],
      ['#how-back-button', () => this.show('menu')],
      ['#quit-button', () => this.callbacks.quit?.()],
      ['#quit-back-button', () => this.callbacks.showMenu?.()],
      ['#resume-button', () => this.callbacks.resume?.()],
      ['#restart-button', () => this.callbacks.restart?.()],
      ['#pause-menu-button', () => this.callbacks.showMenu?.()],
      ['#again-button', () => this.callbacks.restart?.()],
      ['#end-menu-button', () => this.callbacks.showMenu?.()],
    ];
    actions.forEach(([selector, callback]) => {
      const button = document.querySelector(selector);
      button.addEventListener('click', () => {
        this.audio.resume();
        this.audio.play('ui');
        callback();
      });
    });

    this.sensitivity.addEventListener('input', () => {
      const value = Number(this.sensitivity.value);
      this.sensitivityValue.value = value.toFixed(1);
      this.callbacks.setSensitivity?.(value);
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyH' && !e.repeat) {
        this.controlsOverlay?.classList.toggle('is-hidden');
      }
    });
  }

  finishLoading() {
    this.screens.loading.classList.add('is-hidden');
    this.show('menu');
  }

  show(name) {
    Object.entries(this.screens).forEach(([key, screen]) => {
      screen.classList.toggle('is-hidden', key !== name);
    });
    this.hud.classList.toggle('is-hidden', name !== null && name !== 'pause');
    if (name !== 'pause' && name !== null) this.hud.classList.add('is-hidden');
  }

  showHud() {
    Object.values(this.screens).forEach((screen) => screen.classList.add('is-hidden'));
    this.hud.classList.remove('is-hidden');
  }

  setHealth(current, maximum) {
    const rounded = Math.ceil(current);
    this.healthValue.textContent = String(rounded).padStart(3, '0');
    this.healthFill.style.transform = `scaleX(${Math.max(0, current / maximum)})`;
    this.healthFill.classList.toggle('critical', current / maximum < 0.3);
  }

  setEnemies(count) {
    this.enemiesValue.textContent = String(count).padStart(2, '0');
  }

  setAmmo(magazine, reserve, reloading = false, elapsed = 0, currentWeaponConfig = null) {
    const config = currentWeaponConfig || this.weaponConfig;
    this.ammoLabel.childNodes[0].nodeValue = `${magazine} / `;
    const span = this.ammoLabel.querySelector('span');
    if (span) span.textContent = String(reserve);
    this.ammoLabel.classList.toggle('low', magazine <= 7);
    const hasReserve = reserve > 0;
    this.reloadPrompt.classList.toggle('visible', !reloading && magazine === 0 && hasReserve);
    this.reloadCopy.textContent = reloading
      ? 'RELOADING'
      : magazine === 0
        ? (hasReserve ? 'MAGAZINE EMPTY' : 'NO AMMO')
        : 'R  RELOAD';
    this.reloadFill.style.transform = `scaleX(${reloading ? Math.min(1, elapsed / config.reloadDuration) : magazine / config.magazineSize})`;
  }

  setActiveWeaponIcon(index) {
    this.weaponOutlines.forEach((icon, i) => {
      if (icon) icon.classList.toggle('active', i === index);
    });
  }

  setMoveState(state) {
    if (this.moveState.textContent !== state) this.moveState.textContent = state;
  }

  setSpread(spread) {
    const pixels = 4 + spread * 650;
    this.crosshair.style.setProperty('--cross-gap', `${pixels.toFixed(1)}px`);
  }

  setADS(amount) {
    const ads = THREE.MathUtils.clamp(amount, 0, 1);
    this.hud.classList.toggle('aim-mode', ads > 0.45);
  }

  setDamageFlash(amount) {
    this.damageVignette.style.opacity = String(Math.min(1, amount));
  }

  setFPS(fps) {
    if (this.fpsCounter) this.fpsCounter.textContent = Math.round(fps);
  }

  setCaptureHint(visible) {
    this.captureHint.classList.toggle('is-hidden', !visible);
  }

  showHitMarker(headshot = false) {
    clearTimeout(this.hitMarkerTimer);
    this.hitMarker.classList.remove('active', 'headshot');
    void this.hitMarker.offsetWidth;
    this.hitMarker.classList.add('active');
    if (headshot) this.hitMarker.classList.add('headshot');
    this.hitMarkerTimer = setTimeout(() => this.hitMarker.classList.remove('active', 'headshot'), 150);
  }

  announceKill(typeName = 'HOSTILE') {
    const item = document.createElement('div');
    item.className = 'kill-item';
    item.innerHTML = `<span>ELIMINATED</span><strong>${typeName}</strong>`;
    this.killFeed.prepend(item);
    requestAnimationFrame(() => item.classList.add('visible'));
    const removeTimer = setTimeout(() => {
      item.classList.remove('visible');
      const detachTimer = setTimeout(() => {
        item.remove();
        this.killTimers.delete(detachTimer);
      }, 220);
      this.killTimers.add(detachTimer);
      this.killTimers.delete(removeTimer);
    }, 1900);
    this.killTimers.add(removeTimer);
    while (this.killFeed.children.length > 4) this.killFeed.lastElementChild.remove();
  }

  resetMatchHud() {
    clearTimeout(this.hitMarkerTimer);
    this.killTimers.forEach((timer) => clearTimeout(timer));
    this.killTimers.clear();
    this.killFeed.replaceChildren();
    this.hitMarker.classList.remove('active', 'headshot');
    this.reloadPrompt.classList.remove('visible');
    this.damageVignette.style.opacity = '0';
    this.captureHint.classList.add('is-hidden');
    this.setADS(0);
  }

  showEnd(won, kills, total, health) {
    const title = document.querySelector('#end-title');
    const subtitle = document.querySelector('#end-subtitle');
    const kicker = document.querySelector('#end-kicker');
    title.textContent = won ? 'MISSION COMPLETE' : 'MISSION FAILED';
    subtitle.textContent = won ? 'ARENA SECURED' : 'OPERATIVE DOWN';
    kicker.textContent = won ? 'MISSION REPORT // SUCCESS' : 'MISSION REPORT // FAILURE';
    document.querySelector('#end-kills').textContent = `${kills} / ${total}`;
    document.querySelector('#end-health').textContent = `${Math.ceil(health)}%`;
    document.querySelector('#again-button span').textContent = won ? 'PLAY AGAIN' : 'TRY AGAIN';
    document.querySelector('#end-screen').classList.toggle('victory', won);
    this.show('end');
  }
}
