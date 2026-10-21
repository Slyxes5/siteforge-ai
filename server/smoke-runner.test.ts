import { expect, test } from "vitest";
import { observerSelection } from "../scripts/run-smoke-observer";
test("only explicit mock or explicit live approval plus one PID can select a run", () => {
  expect(observerSelection(["--mock"])).toEqual({ mode: "mock" });
  expect(observerSelection(["--live-approved", "--pid=1234"])).toEqual({
    mode: "live-approved",
    pid: 1234,
  });
});
test("coffee scenario selection is explicit and does not relax live/PID gates", () => {
  expect(observerSelection(["--mock", "--scenario=coffee-shop"])).toEqual({
    mode: "mock",
    scenario: "coffee-shop",
  });
  expect(
    observerSelection([
      "--live-approved",
      "--pid=1234",
      "--scenario=coffee-shop",
    ]),
  ).toEqual({ mode: "live-approved", pid: 1234, scenario: "coffee-shop" });
  for (const args of [
    ["--scenario=coffee-shop"],
    ["--mock", "--scenario=other"],
    ["--mock", "--scenario=coffee-shop", "--scenario=coffee-shop"],
    ["--live-approved", "--scenario=coffee-shop"],
    ["--live-approved", "--pid=0", "--scenario=coffee-shop"],
  ])
    expect(() => observerSelection(args)).toThrow();
});
test("no argument stays disabled; malformed selections are refused", () => {
  expect(observerSelection([])).toBeNull();
  for (const args of [
    ["--live-approved"],
    ["--mock", "--live-approved"],
    ["--live-approved", "--pid=0"],
    ["--live-approved", "--pid=12x"],
    ["--live-approved", "--pid=1234", "--retry"],
    ["--unknown"],
  ])
    expect(() => observerSelection(args)).toThrow();
});
