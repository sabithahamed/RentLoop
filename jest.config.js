/**
 * Tests for the pure logic only.
 *
 * `src/data/ledger.ts` holds the rules the entire rent ledger rests on — how a
 * period's status is derived and how periods are generated — and they are pure
 * functions with no React, no React Native and no data source. That means they
 * need no RN preset, which is just as well: jest-expo pins a React version this
 * SDK does not use.
 *
 * Screens are verified by driving the running app instead.
 */
module.exports = {
  testEnvironment: "node",
  testMatch: ["**/*.test.ts"],
  transform: { "^.+\.tsx?$": ["babel-jest", { presets: ["babel-preset-expo"] }] },
  collectCoverageFrom: ["src/data/ledger.ts"],
};
