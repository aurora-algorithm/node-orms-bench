// Demo runs only (DEMO=1): counts requests so the live dashboard can draw requests per second. Never on in a
// measured run.
import { createServer } from "node:http";
import type { Express } from "express";

export function countRequests(app: Express): void {
  let count = 0;
  app.use((_req, _res, next) => {
    count++;
    next();
  });
  createServer((_req, res) => {
    res.setHeader("content-type", "text/plain; version=0.0.4");
    res.end(`# TYPE requests_total counter\nrequests_total ${count}\n`);
  }).listen(9257, "127.0.0.1");
}
