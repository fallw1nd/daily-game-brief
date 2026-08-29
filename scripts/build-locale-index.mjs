import { buildEnglishLocaleIndex } from "./lib/locale-index.mjs";

const index = await buildEnglishLocaleIndex();
const available = index.editions.filter((item) => item.status === "available").length;
console.log(`Generated English locale index: ${available}/${index.editions.length} editions available.`);
