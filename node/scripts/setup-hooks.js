"use strict";

// Runs automatically via npm's `prepare` lifecycle (`npm install`/`npm ci`
// in node/) so a fresh clone gets the pre-commit hook wired up without a
// manual step. Points git at the repo-tracked .githooks/ directory instead
// of the untracked (and un-distributable) .git/hooks/.

const { execFileSync } = require("node:child_process");

const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

execFileSync("git", ["config", "core.hooksPath", ".githooks"], {
  cwd: repoRoot,
});
