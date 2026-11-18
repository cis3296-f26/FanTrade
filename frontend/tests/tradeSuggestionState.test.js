import assert from "node:assert/strict";
import test from "node:test";
import { matchingPreview, mergePartnerPage, selectionKey } from "../src/components/league/tradeSuggestionState.js";

const request = { league_id: "123", your_roster_id: "1", position: "ANY", min_gain_percent: 4, max_gain_percent: 12, trade_style: "any" };
const ready = {
  roster_id: 2, verification_status: "ready",
  suggestion_result: { status: "ok", preferences: { min_gain_percent: 4, max_gain_percent: 12, trade_style: "any" }, suggestion: { target_position: "RB" } },
};

test("cached results are isolated by both teams, league, position, range, and style", () => {
  const original = selectionKey(request, "2");
  for (const change of [{ league_id: "456" }, { your_roster_id: "3" }, { position: "RB" },
    { min_gain_percent: 3 }, { max_gain_percent: 15 }, { trade_style: "balanced" }]) {
    assert.notEqual(selectionKey({ ...request, ...change }, "2"), original);
  }
  assert.notEqual(selectionKey(request, "3"), original);
  assert.equal(selectionKey(request, 2), original);
});

test("later pages preserve checked previews but replace newly checked partners", () => {
  const unchecked = { roster_id: 3, verification_status: "not_checked" };
  const noMatch = { roster_id: 3, verification_status: "no_match" };
  const result = mergePartnerPage([ready, unchecked], [
    { roster_id: 2, verification_status: "not_checked" }, noMatch,
  ]);
  assert.deepEqual(result, [ready, noMatch]);
  assert.equal(unchecked.verification_status, "not_checked");
  assert.deepEqual(mergePartnerPage([ready], [noMatch]), [noMatch]);
});

test("an ANY preview remains reusable after autofilling its actual position", () => {
  assert.equal(matchingPreview(ready, request), ready.suggestion_result);
  assert.equal(matchingPreview(ready, { ...request, position: "RB" }), ready.suggestion_result);
  assert.equal(matchingPreview(ready, { ...request, position: "FLEX" }), ready.suggestion_result);
  assert.equal(matchingPreview(ready, { ...request, position: "WR" }), null);
});

test("changed settings and unverified results cannot reuse a preview", () => {
  for (const change of [{ min_gain_percent: 1 }, { max_gain_percent: 35 }, { trade_style: "trade_up" }]) {
    assert.equal(matchingPreview(ready, { ...request, ...change }), null);
  }
  for (const status of ["no_match", "not_checked", "unavailable", "search_limited"]) {
    assert.equal(matchingPreview({ ...ready, verification_status: status }, request), null);
  }
  assert.equal(matchingPreview(null, request), null);
  assert.equal(matchingPreview({ ...ready, suggestion_result: { status: "no_match" } }, request), null);
});
