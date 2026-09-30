import assert from "node:assert/strict";
import test from "node:test";
import { KeyboardState } from "../webapp/src/lib/keyboardState.ts";

test("closing the keyboard restores the header even while the input stays focused", () => {
  const state = new KeyboardState(780);
  state.focus(780);
  state.viewport(460, true);
  assert.equal(state.open, true);
  state.viewport(780, true);
  assert.equal(state.open, false);
  state.focus(780);
  state.viewport(460, true);
  assert.equal(state.open, true);
});

test("switching inputs does not flash the header while the keyboard is still visible", () => {
  const state = new KeyboardState(780);
  state.focus(780);
  state.viewport(460, true);
  state.viewport(460, false);
  state.focus(460);
  assert.equal(state.open, true);
  state.viewport(750, false);
  assert.equal(state.open, false);
});

test("browser bars and desktop focus do not leave the header stuck after blur", () => {
  const state = new KeyboardState(780);
  state.viewport(730, false);
  assert.equal(state.open, false);
  state.focus(730);
  state.viewport(730, true);
  assert.equal(state.open, true);
  state.viewport(730, false);
  assert.equal(state.open, false);
});
