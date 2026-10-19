// Darurat (lupa password / HP 2FA hilang):
//   npm run reset-owner -- <username> <password-baru>
//   Docker: docker compose exec kura node script/reset-owner.cjs <username> <password-baru>
// Reset password, matikan 2FA, dan keluarkan semua sesi akun tsb.
require("dotenv/config");
const Database = require("better-sqlite3");
const crypto = require("node:crypto");

const db = new Database(process.env.DB_FILE || "data.db");
const [username, pw] = process.argv.slice(2);
if (!username || !pw) {
  console.log("Pakai: npm run reset-owner -- <username> <password-baru>");
  console.log("Akun:", db.prepare("SELECT username, role FROM users").all().map((u) => `${u.username} (${u.role})`).join(", ") || "-");
  process.exit(1);
}
if (pw.length < 8) { console.error("Password minimal 8 karakter"); process.exit(1); }
const u = db.prepare("SELECT id, username FROM users WHERE username = ?").get(username.toLowerCase());
if (!u) { console.error("User tidak ditemukan"); process.exit(1); }
const salt = crypto.randomBytes(16).toString("hex");
const hash = `${salt}:${crypto.scryptSync(pw, salt, 64).toString("hex")}`;
db.prepare("UPDATE users SET password = ?, totp_secret = NULL, totp_enabled = 0, password_changed_at = ? WHERE id = ?").run(hash, Date.now(), u.id);
db.prepare("DELETE FROM sessions WHERE user_id = ?").run(u.id);
db.prepare("INSERT INTO audit (user_id, username, action, detail, ip, at) VALUES (?, ?, 'password.change', 'Reset lewat terminal server (2FA dimatikan)', 'server', ?)").run(u.id, u.username, Date.now());
console.log(`OK: password ${u.username} diganti, 2FA dimatikan, semua sesi dikeluarkan.`);
