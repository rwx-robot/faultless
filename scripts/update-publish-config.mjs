#!/usr/bin/env node
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const REPO_URL = "https://github.com/nofault-framework/nofault";

const keywordMap = {
  auth: ["auth", "jwt", "authentication", "authorization", "rbac", "api-key"],
  breaker: ["circuit-breaker", "fault-tolerance", "resilience"],
  cache: ["cache", "redis", "lru", "distributed-cache"],
  cli: ["cli", "command-line", "scaffolding"],
  config: ["config", "configuration", "env", "dotenv", "yaml"],
  core: ["core", "base", "utilities", "decorators", "ioc", "di"],
  discovery: ["service-discovery", "etcd", "consul", "registry"],
  gateway: ["api-gateway", "gateway", "proxy", "routing"],
  governance: ["governance", "rate-limit", "flow-control", "load-balance"],
  http: ["http", "fastify", "rest", "api", "server"],
  limit: ["rate-limit", "throttle", "token-bucket", "sliding-window"],
  log: ["logger", "logging", "structured", "pino"],
  metrics: ["metrics", "prometheus", "monitoring", "observability"],
  queue: ["queue", "message-queue", "bull", "amqp"],
  resilience: ["resilience", "retry", "timeout", "fallback", "bulkhead"],
  rpc: ["rpc", "grpc", "protobuf", "microservice"],
  store: ["store", "database", "orm", "repository", "data-access"],
  tracing: ["tracing", "opentelemetry", "jaeger", "distributed-tracing"],
  validation: ["validation", "schema", "zod", "joi", "class-validator"],
};

const repoInfo = {
  type: "git",
  url: `git+${REPO_URL}.git`,
};
const homepage = `${REPO_URL}#readme`;
const bugs = { url: `${REPO_URL}/issues` };

const packagesDir = join(import.meta.dirname, "..", "packages");

const result = execSync("ls -1", { cwd: packagesDir, encoding: "utf-8" })
  .trim()
  .split("\n");

let updated = 0;
let skipped = 0;

for (const dir of result) {
  const pkgPath = join(packagesDir, dir, "package.json");
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  } catch {
    console.log(`  SKIP  ${dir}/package.json not found`);
    skipped++;
    continue;
  }

  const keywords = keywordMap[dir] || [dir];

  pkg.publishConfig = { access: "public", registry: "https://registry.npmjs.org/" };
  pkg.repository = repoInfo;
  pkg.homepage = homepage;
  pkg.bugs = bugs;

  if (!pkg.keywords || pkg.keywords.length === 0) {
    pkg.keywords = ["nofault", ...keywords];
  } else {
    const merged = new Set(["nofault", ...pkg.keywords, ...keywords]);
    pkg.keywords = [...merged];
  }

  if (!pkg.license) pkg.license = "MIT";

  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`  OK    ${dir}/package.json`);
  updated++;
}

console.log(`\nDone: ${updated} updated, ${skipped} skipped`);
