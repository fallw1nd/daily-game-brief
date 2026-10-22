// GitHub search tokenizes dates. Never use its first result as an edition key.
let text = "";
for await (const chunk of process.stdin) text += chunk;
const [title, field] = process.argv.slice(2);
if (!title || !["url", "number"].includes(field)) throw new Error("exact title and url|number are required");
const match = JSON.parse(text).find(issue => issue.title === title);
if (match) process.stdout.write(String(match[field]));
