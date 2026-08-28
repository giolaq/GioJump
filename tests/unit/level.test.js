import test from "node:test";
import assert from "node:assert/strict";
import {
  LEVEL_END,
  PLAYER_START,
  platformBounds,
  progressForX,
} from "../../src/level.js";

test("level progress is clamped to the course", () => {
  assert.equal(progressForX(PLAYER_START.x - 20), 0);
  assert.equal(progressForX(LEVEL_END + 20), 1);
  assert.ok(progressForX((PLAYER_START.x + LEVEL_END) / 2) > 0.49);
});

test("platform bounds preserve top-surface coordinates", () => {
  assert.deepEqual(
    platformBounds({ x: 10, y: 2, width: 8 }),
    { left: 6, right: 14, top: 2 },
  );
});
