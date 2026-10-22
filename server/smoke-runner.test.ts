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
  expect(
    observerSelection([
      "--live-approved",
      "--pid=1234",
      "--scenario=premium-cafe",
    ]),
  ).toEqual({ mode: "live-approved", pid: 1234, scenario: "premium-cafe" });
  for (const args of [
    ["--scenario=coffee-shop"],
    ["--mock", "--scenario=other"],
    ["--mock", "--scenario=coffee-shop", "--scenario=coffee-shop"],
    ["--mock", "--scenario=premium-cafe", "--scenario=premium-cafe"],
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

test("routed profile requires explicit mock selection or fresh live approval and PID", () => {
  expect(
    observerSelection(["--mock-routed", "--scenario=premium-cafe"]),
  ).toEqual({ mode: "mock-routed", scenario: "premium-cafe" });
  expect(
    observerSelection([
      "--live-routed-approved",
      "--pid=1234",
      "--scenario=premium-cafe",
    ]),
  ).toEqual({
    mode: "live-routed-approved",
    pid: 1234,
    scenario: "premium-cafe",
  });
  for (const args of [
    ["--live-routed-approved"],
    ["--live-routed-approved", "--pid=0"],
    ["--mock-routed", "--live-approved"],
    ["--live-approved", "--pid=1234", "--mock-routed"],
    ["--mock-routed", "--live-routed-approved", "--pid=1234"],
  ])
    expect(() => observerSelection(args)).toThrow();
});
