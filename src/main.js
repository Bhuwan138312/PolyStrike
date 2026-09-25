import './styles.css';
import { Game } from './core/Game.js';

const container = document.querySelector('#game');

try {
  const game = new Game(container);
  game.init();
  window.__LOW_POLY_STRIKE__ = game;
} catch (error) {
  console.error(error);
  const loading = document.querySelector('#loading-screen');
  loading.innerHTML = `
    <div class="panel quit-panel">
      <div class="panel-kicker">SYSTEM CHECK // FAILED</div>
      <h2>WEBGL UNAVAILABLE</h2>
      <p>Enable hardware acceleration or open this game in a modern browser.</p>
    </div>`;
  loading.classList.remove('is-hidden');
}
