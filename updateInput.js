const fs = require('fs');

const path = 'src/core/InputManager.js';
let content = fs.readFileSync(path, 'utf8');

content = content.replace('this.sensitivity = 1;', \
    const savedSens = localStorage.getItem('sensitivity');
    this.sensitivity = savedSens ? Number(savedSens) : 1;
    this.invertY = localStorage.getItem('invertY') === 'true';
    this.bindings = JSON.parse(localStorage.getItem('bindings')) || {
      forward: 'KeyW',
      backward: 'KeyS',
      left: 'KeyA',
      right: 'KeyD',
      jump: 'Space',
      sprint: 'ShiftLeft',
      reload: 'KeyR'
    };
\);

content = content.replace('this.mouseDelta.y += movementY * this.sensitivity;', 'this.mouseDelta.y += movementY * this.sensitivity * (this.invertY ? -1 : 1);');

content = content.replace(/getMovement\\(\\)\\s*\\{[\\s\\S]*?\\}/, \getMovement() {
    const x = Number(this.isActionDown('right')) - Number(this.isActionDown('left'));
    const z = Number(this.isActionDown('forward')) - Number(this.isActionDown('backward'));
    const length = Math.hypot(x, z);
    return length > 1 ? { x: x / length, z: z / length } : { x, z };
  }\);

content = content.replace(/clear\\(\\)\\s*\\{/, \
  setBinding(action, code) {
    this.bindings[action] = code;
    localStorage.setItem('bindings', JSON.stringify(this.bindings));
  }

  setInvertY(invert) {
    this.invertY = invert;
    localStorage.setItem('invertY', invert);
  }

  setSensitivity(value) {
    this.sensitivity = value;
    localStorage.setItem('sensitivity', value);
  }

  isActionDown(action) {
    return this.isDown(this.bindings[action]);
  }

  wasActionPressed(action) {
    return this.wasPressed(this.bindings[action]);
  }

  clear() {\);

fs.writeFileSync(path, content);
console.log('InputManager updated');
