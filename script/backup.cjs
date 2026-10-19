// Backup database: npm run backup  -> backups/kura-YYYY-MM-DD-HH-MM.db (14 terakhir disimpan)
//   Docker: docker compose exec kura node script/backup.cjs
require("dotenv/config");
const Database = require("better-sqlite3");
const fs = require("node:fs");
const path = require("node:path");

const src = process.env.DB_FILE || "data.db";
const dir = process.env.BACKUP_DIR || path.join(path.dirname(path.resolve(src)), "backups");
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
const out = path.join(dir, `kura-${stamp}.db`);
const db = new Database(src, { readonly: true });
db.backup(out).then(() => {
  db.close();
  const files = fs.readdirSync(dir).filter((f) => /^kura-.*\.db$/.test(f)).sort();
  for (const f of files.slice(0, Math.max(0, files.length - 14))) fs.unlinkSync(path.join(dir, f));
  console.log("Backup tersimpan:", out);
});
