import { replayFixture } from "./lib/release-calendar-replay.mjs";

const fixtureRoot = process.env.RELEASE_CALENDAR_REPLAY_FIXTURES || undefined;
const editions = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
const selectedEditions = editions.length ? editions : ["daily18", "daily19"];

const results = [];
for (const edition of selectedEditions) results.push(await replayFixture(edition, fixtureRoot));

console.log(JSON.stringify({ mode: "offline", fetched: false, fixtures: results }, null, 2));
