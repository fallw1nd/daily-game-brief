import { resolve } from "node:path";
import { replayFixture, replayHoldoutDirectory } from "./lib/release-calendar-replay.mjs";

const fixtureRoot = process.env.RELEASE_CALENDAR_REPLAY_FIXTURES || undefined;
const arguments_ = process.argv.slice(2);
const editions = arguments_.filter((argument) => !argument.startsWith("--"));
const holdout = arguments_.find((argument) => argument.startsWith("--holdout="))?.slice("--holdout=".length);
const selectedEditions = editions.length ? editions : holdout ? [] : ["daily18", "daily19"];

const results = [];
for (const edition of selectedEditions) results.push(await replayFixture(edition, fixtureRoot));
if (holdout) results.push(await replayHoldoutDirectory(resolve(holdout)));

console.log(JSON.stringify({ mode: "offline", fetched: false, fixtures: results }, null, 2));
