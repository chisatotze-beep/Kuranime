// PM2: pm2 start ecosystem.config.cjs
module.exports = {
  apps: [{
    name: "kura",
    script: "dist/index.cjs",
    instances: 1, // SQLite + timer sinkron -> wajib 1 instance
    env: { NODE_ENV: "production", PORT: 5000, DB_FILE: "data.db", TRUST_PROXY: 1 },
    max_memory_restart: "300M",
  }],
};
