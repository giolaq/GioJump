export const LEVEL_END = 173;
export const PLAYER_START = Object.freeze({ x: 2.5, y: 2.4 });

export const PLATFORMS = Object.freeze([
  { x: 10, y: 0, width: 24, depth: 6, style: "mint" },
  { x: 29, y: 2.2, width: 7, depth: 5, style: "lemon" },
  { x: 39, y: 0, width: 13, depth: 6, style: "mint" },
  { x: 49, y: 3.5, width: 6, depth: 4.6, style: "berry" },
  { x: 59, y: 0, width: 16, depth: 6, style: "mint" },
  { x: 69, y: 3.1, width: 5, depth: 4.6, style: "lemon" },
  { x: 78, y: 1.2, width: 10, depth: 5.4, style: "berry" },
  { x: 90, y: 0, width: 21, depth: 6, style: "mint" },
  { x: 99, y: 4.4, width: 5, depth: 4.4, style: "lemon" },
  { x: 107.5, y: 0, width: 14, depth: 6, style: "mint" },
  { x: 108, y: 2.1, width: 8, depth: 5.2, style: "berry" },
  { x: 120, y: 0, width: 12, depth: 6, style: "mint" },
  { x: 130, y: 3.4, width: 5, depth: 4.4, style: "lemon" },
  { x: 138, y: 0, width: 28, depth: 6, style: "mint" },
  { x: 139, y: 1.5, width: 9, depth: 5.4, style: "berry" },
  { x: 149, y: 4.9, width: 5, depth: 4.2, style: "lemon" },
  { x: 160, y: 0, width: 16, depth: 6, style: "mint" },
  { x: 174, y: 0, width: 12, depth: 6, style: "mint" },
]);

export const COLLECTIBLES = Object.freeze([
  { x: 5, y: 2.2 },
  { x: 10, y: 3.1 },
  { x: 18, y: 2.3 },
  { x: 29, y: 4.2 },
  { x: 39, y: 2.4 },
  { x: 49, y: 5.6 },
  { x: 58, y: 2.3 },
  { x: 69, y: 5.2 },
  { x: 78, y: 3.4 },
  { x: 90, y: 2.3 },
  { x: 99, y: 6.5 },
  { x: 108, y: 4.3 },
  { x: 120, y: 2.4 },
  { x: 130, y: 5.5 },
  { x: 139, y: 3.7 },
  { x: 149, y: 7 },
  { x: 160, y: 2.5 },
  { x: 169, y: 3.2 },
]);

export const ENEMIES = Object.freeze([
  { x: 15, y: 1, minX: 12, maxX: 20, speed: 1.3 },
  { x: 57, y: 1, minX: 53, maxX: 64, speed: 1.45 },
  { x: 160, y: 1, minX: 155, maxX: 166.5, speed: 1.75 },
]);

export const CHECKPOINTS = Object.freeze([
  { x: 61.5, y: 1.2 },
  { x: 121, y: 1.2 },
]);

export const DECORATIONS = Object.freeze([
  { type: "flower", x: 7, y: 0.25, color: "pink" },
  { type: "bush", x: 20, y: 0.28, color: "mint" },
  { type: "flower", x: 37, y: 0.25, color: "yellow" },
  { type: "bush", x: 43, y: 0.28, color: "pink" },
  { type: "flower", x: 56, y: 0.25, color: "white" },
  { type: "bush", x: 64, y: 0.28, color: "mint" },
  { type: "flower", x: 77, y: 1.45, color: "yellow" },
  { type: "bush", x: 92, y: 0.28, color: "pink" },
  { type: "flower", x: 106, y: 2.35, color: "white" },
  { type: "bush", x: 119, y: 0.28, color: "mint" },
  { type: "flower", x: 139, y: 1.75, color: "pink" },
  { type: "bush", x: 162, y: 0.28, color: "pink" },
  { type: "flower", x: 169, y: 0.25, color: "yellow" },
]);

export function platformBounds(platform) {
  return {
    left: platform.x - platform.width / 2,
    right: platform.x + platform.width / 2,
    top: platform.y,
  };
}

export function progressForX(x) {
  return Math.max(0, Math.min(1, (x - PLAYER_START.x) / (LEVEL_END - PLAYER_START.x)));
}
