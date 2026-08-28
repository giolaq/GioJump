export const ACTIONS = Object.freeze({
  LEFT: "left",
  RIGHT: "right",
  UP: "up",
  DOWN: "down",
  CONFIRM: "confirm",
  BACK: "back",
  PAUSE: "pause",
});

const KEY_ACTIONS = new Map([
  ["ArrowLeft", ACTIONS.LEFT],
  ["Left", ACTIONS.LEFT],
  ["ArrowRight", ACTIONS.RIGHT],
  ["Right", ACTIONS.RIGHT],
  ["ArrowUp", ACTIONS.UP],
  ["Up", ACTIONS.UP],
  ["ArrowDown", ACTIONS.DOWN],
  ["Down", ACTIONS.DOWN],
  ["Enter", ACTIONS.CONFIRM],
  [" ", ACTIONS.CONFIRM],
  ["Spacebar", ACTIONS.CONFIRM],
  ["Escape", ACTIONS.BACK],
  ["BrowserBack", ACTIONS.BACK],
  ["MediaPlayPause", ACTIONS.PAUSE],
]);

const KEYCODE_ACTIONS = new Map([
  [13, ACTIONS.CONFIRM],
  [32, ACTIONS.CONFIRM],
  [37, ACTIONS.LEFT],
  [38, ACTIONS.UP],
  [39, ACTIONS.RIGHT],
  [40, ACTIONS.DOWN],
  [179, ACTIONS.PAUSE],
  [415, ACTIONS.PAUSE],
  [461, ACTIONS.BACK],
  [10009, ACTIONS.BACK],
]);

const DIRECTIONAL_ACTIONS = new Set([
  ACTIONS.LEFT,
  ACTIONS.RIGHT,
  ACTIONS.UP,
  ACTIONS.DOWN,
]);

const GAMEPAD_BINDINGS = [
  [ACTIONS.LEFT, (pad) => (pad.axes[0] ?? 0) < -0.35 || pad.buttons[14]?.pressed],
  [ACTIONS.RIGHT, (pad) => (pad.axes[0] ?? 0) > 0.35 || pad.buttons[15]?.pressed],
  [ACTIONS.UP, (pad) => (pad.axes[1] ?? 0) < -0.45 || pad.buttons[12]?.pressed],
  [ACTIONS.DOWN, (pad) => (pad.axes[1] ?? 0) > 0.45 || pad.buttons[13]?.pressed],
  [ACTIONS.CONFIRM, (pad) => pad.buttons[0]?.pressed],
  [ACTIONS.BACK, (pad) => pad.buttons[1]?.pressed],
  [ACTIONS.PAUSE, (pad) => pad.buttons[9]?.pressed],
];

export function actionFromKeyboardEvent(event) {
  return KEY_ACTIONS.get(event.key) ?? KEYCODE_ACTIONS.get(event.keyCode) ?? null;
}

export function isDirectionalAction(action) {
  return DIRECTIONAL_ACTIONS.has(action);
}

function gamepadActions(pad) {
  return new Set(
    GAMEPAD_BINDINGS
      .filter(([, isActive]) => isActive(pad))
      .map(([action]) => action),
  );
}

export class InputController {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.previousGamepad = new Set();
  }

  keyDown(action) {
    if (!action) return;
    if (!this.down.has(action)) this.pressed.add(action);
    this.down.add(action);
  }

  keyUp(action) {
    if (!action) return;
    this.down.delete(action);
    this.released.add(action);
  }

  pollGamepads(gamepads = navigator.getGamepads?.() ?? []) {
    const pad = [...gamepads].find(Boolean);
    const current = pad ? gamepadActions(pad) : new Set();
    current.forEach((action) => this.keyDown(action));
    this.previousGamepad.forEach((action) => {
      if (!current.has(action)) this.keyUp(action);
    });
    this.previousGamepad = current;
  }

  isDown(action) {
    return this.down.has(action);
  }

  wasPressed(action) {
    return this.pressed.has(action);
  }

  consumePressed(action) {
    const pressed = this.pressed.has(action);
    this.pressed.delete(action);
    return pressed;
  }

  wasReleased(action) {
    return this.released.has(action);
  }

  consumeReleased(action) {
    const released = this.released.has(action);
    this.released.delete(action);
    return released;
  }

  endFrame() {
    this.pressed.clear();
    this.released.clear();
  }

  reset() {
    this.down.clear();
    this.pressed.clear();
    this.released.clear();
    this.previousGamepad.clear();
  }
}
