import test from "node:test";
import assert from "node:assert/strict";
import {
  ACTIONS,
  InputController,
  actionFromKeyboardEvent,
} from "../../src/input.js";

test("maps television remote key codes to directional actions", () => {
  assert.equal(actionFromKeyboardEvent({ key: "", keyCode: 37 }), ACTIONS.LEFT);
  assert.equal(actionFromKeyboardEvent({ key: "", keyCode: 38 }), ACTIONS.UP);
  assert.equal(actionFromKeyboardEvent({ key: "", keyCode: 39 }), ACTIONS.RIGHT);
  assert.equal(actionFromKeyboardEvent({ key: "", keyCode: 40 }), ACTIONS.DOWN);
  assert.equal(actionFromKeyboardEvent({ key: "", keyCode: 13 }), ACTIONS.CONFIRM);
  assert.equal(actionFromKeyboardEvent({ key: "GoBack", keyCode: 27 }), ACTIONS.BACK);
  assert.equal(actionFromKeyboardEvent({ key: "", keyCode: 461 }), ACTIONS.BACK);
  assert.equal(actionFromKeyboardEvent({ key: "", keyCode: 10009 }), ACTIONS.BACK);
});

test("records one pressed edge while preserving held input", () => {
  const input = new InputController();
  input.keyDown(ACTIONS.RIGHT);
  input.keyDown(ACTIONS.RIGHT);

  assert.equal(input.isDown(ACTIONS.RIGHT), true);
  assert.equal(input.consumePressed(ACTIONS.RIGHT), true);
  assert.equal(input.consumePressed(ACTIONS.RIGHT), false);
  assert.equal(input.isDown(ACTIONS.RIGHT), true);

  input.keyUp(ACTIONS.RIGHT);
  assert.equal(input.isDown(ACTIONS.RIGHT), false);
  assert.equal(input.consumeReleased(ACTIONS.RIGHT), true);
});
