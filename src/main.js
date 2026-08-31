import {
  createIcons,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Flag,
  Heart,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  Star,
  Sun,
  Volume2,
  VolumeX,
} from "lucide";
import "./style.css";
import { AudioManager } from "./audio.js";
import { GioJumpGame } from "./game.js";
import { ACTIONS, actionFromKeyboardEvent, isDirectionalAction } from "./input.js";

const iconSet = {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Flag,
  Heart,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  Star,
  Sun,
  Volume2,
  VolumeX,
};

function renderIcons() {
  createIcons({
    icons: iconSet,
    attrs: {
      "aria-hidden": "true",
    },
  });
}

renderIcons();

const elements = {
  canvas: document.querySelector("#game-canvas"),
  hud: document.querySelector("#hud"),
  starCount: document.querySelector("#star-count"),
  starTotal: document.querySelector("#star-total"),
  heartCount: document.querySelector("#heart-count"),
  progressFill: document.querySelector("#progress-fill"),
  progressGio: document.querySelector("#progress-gio"),
  announcer: document.querySelector("#announcer"),
  soundButton: document.querySelector("#sound-button"),
  fullscreenButton: document.querySelector("#fullscreen-button"),
  pauseButton: document.querySelector("#pause-button"),
  playButton: document.querySelector("#play-button"),
  resumeButton: document.querySelector("#resume-button"),
  restartButton: document.querySelector("#restart-button"),
  tryAgainButton: document.querySelector("#try-again-button"),
  playAgainButton: document.querySelector("#play-again-button"),
  winStars: document.querySelector("#win-stars"),
  screens: {
    start: document.querySelector("#start-screen"),
    paused: document.querySelector("#pause-screen"),
    gameover: document.querySelector("#game-over-screen"),
    won: document.querySelector("#win-screen"),
    error: document.querySelector("#error-screen"),
  },
};

const audio = new AudioManager();
const STATE_SCREENS = Object.freeze({
  playing: null,
  paused: "paused",
  gameover: "gameover",
  won: "won",
});
const MENU_STEPS = new Map([
  [ACTIONS.UP, -1],
  [ACTIONS.LEFT, -1],
  [ACTIONS.DOWN, 1],
  [ACTIONS.RIGHT, 1],
]);
const PAUSE_ACTIONS = new Set([ACTIONS.BACK, ACTIONS.PAUSE]);
const NATIVE_EXIT_MESSAGE = "giojump:exit";
let activeScreen = "start";
let muted = false;
let game;
let displayedProgress = -1;

function focusFirstMenuItem() {
  const screen = elements.screens[activeScreen];
  const firstItem = screen?.querySelector("[data-menu-item]");
  window.setTimeout(() => firstItem?.focus({ preventScroll: true }), 30);
}

function showScreen(name = null) {
  Object.entries(elements.screens).forEach(([screenName, screen]) => {
    const visible = screenName === name;
    screen.classList.toggle("is-visible", visible);
    screen.setAttribute("aria-hidden", String(!visible));
  });
  activeScreen = name;
  const playing = name === null;
  elements.hud.setAttribute("aria-hidden", String(!playing));
  if (name) focusFirstMenuItem();
  else document.activeElement?.blur();
}

function menuItems() {
  return [
    ...(elements.screens[activeScreen]?.querySelectorAll("[data-menu-item]") ?? []),
  ].filter((item) => !item.disabled);
}

function handleMenuAction(action) {
  if (!activeScreen) return;
  if (action === ACTIONS.BACK && activeScreen === "paused") {
    game.resume();
    return;
  }

  const items = menuItems();
  if (!items.length) return;
  const currentIndex = Math.max(0, items.indexOf(document.activeElement));
  const step = MENU_STEPS.get(action);
  if (isDirectionalAction(action) && step) {
    const nextIndex = (currentIndex + step + items.length) % items.length;
    items[nextIndex].focus({ preventScroll: true });
  } else if (action === ACTIONS.CONFIRM) {
    items[currentIndex].click();
  }
}

function requestNativeExit() {
  const bridge = window.ReactNativeWebView;
  if (typeof bridge?.postMessage !== "function") return false;
  bridge.postMessage(NATIVE_EXIT_MESSAGE);
  return true;
}

function setIconButton(button, icon, label, pressed) {
  button.innerHTML = `<i data-lucide="${icon}"></i>`;
  button.setAttribute("aria-label", label);
  if (pressed !== undefined) {
    button.setAttribute("aria-pressed", String(pressed));
  }
  renderIcons();
}

function updateSoundButton() {
  setIconButton(
    elements.soundButton,
    muted ? "volume-x" : "volume-2",
    muted ? "Unmute sound" : "Mute sound",
    muted,
  );
}

function updateFullscreenButton() {
  const fullscreen = Boolean(document.fullscreenElement);
  setIconButton(
    elements.fullscreenButton,
    fullscreen ? "minimize" : "maximize",
    fullscreen ? "Exit fullscreen" : "Enter fullscreen",
  );
}

function handleGameState(state) {
  if (state === "won") {
    const snapshot = game.snapshot();
    elements.winStars.textContent = `${snapshot.stars} / ${snapshot.totalStars}`;
    audio.stopMusic();
  }
  showScreen(STATE_SCREENS[state]);
}

try {
  game = new GioJumpGame(elements.canvas, {
    onState: handleGameState,
    onStats({ stars, totalStars, lives }) {
      elements.starCount.textContent = stars;
      elements.starTotal.textContent = totalStars;
      elements.heartCount.textContent = lives;
    },
    onProgress(progress) {
      const roundedProgress = Math.round(progress * 1000) / 10;
      if (roundedProgress === displayedProgress) return;
      displayedProgress = roundedProgress;
      const percentage = `${roundedProgress}%`;
      elements.progressFill.style.width = percentage;
      elements.progressGio.style.left = percentage;
    },
    onSound(sound) {
      audio.play(sound);
    },
    onAnnounce(message) {
      elements.announcer.textContent = message;
    },
    onMenuAction: handleMenuAction,
  });
} catch (error) {
  console.error(error);
  showScreen("error");
}

async function startGame() {
  await audio.enable();
  audio.startMusic();
  game.start();
}

[
  elements.playButton,
  elements.tryAgainButton,
  elements.playAgainButton,
  elements.restartButton,
].forEach((button) => button.addEventListener("click", startGame));
elements.resumeButton.addEventListener("click", () => game.resume());
elements.pauseButton.addEventListener("click", () => game.pause());

elements.soundButton.addEventListener("click", async () => {
  await audio.enable();
  muted = !muted;
  audio.setMuted(muted);
  updateSoundButton();
});

elements.fullscreenButton.addEventListener("click", async () => {
  if (document.fullscreenElement) await document.exitFullscreen?.();
  else await document.documentElement.requestFullscreen?.();
});

document.addEventListener("fullscreenchange", updateFullscreenButton);

window.addEventListener("keydown", (event) => {
  const action = actionFromKeyboardEvent(event);
  if (!action || !game) return;

  event.preventDefault();
  if (activeScreen) {
    if (!event.repeat) {
      if (action === ACTIONS.BACK && activeScreen !== "paused" && requestNativeExit()) {
        return;
      }
      handleMenuAction(action);
    }
    return;
  }

  if (PAUSE_ACTIONS.has(action)) {
    if (!event.repeat) game.pause();
    return;
  }
  game.input.keyDown(action);
});

window.addEventListener("keyup", (event) => {
  const action = actionFromKeyboardEvent(event);
  if (!action || !game) return;
  event.preventDefault();
  game.input.keyUp(action);
});

window.addEventListener("resize", () => game?.resize(), { passive: true });

document.addEventListener("visibilitychange", () => {
  if (document.hidden && game?.state === "playing") game.pause();
});

window.addEventListener("blur", () => {
  game?.input.reset();
});

window.__GIO_JUMP__ = {
  get state() {
    return game?.snapshot() ?? null;
  },
  start: startGame,
  pause: () => game?.pause(),
  resume: () => game?.resume(),
  nativeBack() {
    if (game?.state === "playing") {
      game.pause();
      return true;
    }
    return false;
  },
};

showScreen("start");
