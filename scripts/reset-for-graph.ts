import { getDb } from "../src/db.js";
const db = getDb();
db.prepare("UPDATE files SET file_hash = ?").run("force-reindex-graph");
const r = db.prepare("SELECT COUNT(*) as c FROM files").get() as {c:number};
console.log("Files marked for re-ingest:", r.c);
