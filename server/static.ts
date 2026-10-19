import { CSP } from "./security";
import express from 'express';
import type { Express } from 'express';
import fs from "node:fs";
import path from "node:path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // file di /assets punya hash di namanya -> aman di-cache lama
  app.use("/assets", express.static(path.join(distPath, "assets"), { immutable: true, maxAge: "1y" }));
  const htmlHeaders = (res: any) => {
    res.setHeader("Content-Security-Policy", CSP);
    res.setHeader("Cache-Control", "no-cache");
  };
  app.use(express.static(distPath, { maxAge: 0, setHeaders: (res, file) => { if (file.endsWith(".html")) htmlHeaders(res); } }));

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", (_req, res) => {
    htmlHeaders(res);
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
