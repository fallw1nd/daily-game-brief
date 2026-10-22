import { runPublicationBuild } from "./lib/publication-build.mjs";
await runPublicationBuild(["scripts/publish-editorial-decision.mjs"], process.env.EDITORIAL_VALIDATION_PATH || "artifacts/editorial-validation.json");
