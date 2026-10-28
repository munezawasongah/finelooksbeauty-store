/**
 * One start command for both Railway services:
 *   SERVICE_ROLE=worker → background worker (webhooks, Clover sync, emails, schedules)
 *   otherwise           → apply migrations + base data, then serve the website
 */
import { spawn } from "node:child_process";

const run = (cmd, args) =>
  new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`))));
  });

const role = process.env.SERVICE_ROLE ?? "web";
try {
  if (role === "worker") {
    await run("npx", ["tsx", "src/worker/index.ts"]);
  } else {
    await run("npx", ["tsx", "scripts/migrate.ts"]);
    await run("npx", ["tsx", "scripts/seed.ts"]);
    await run("npx", ["next", "start", "-p", process.env.PORT ?? "3000"]);
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
