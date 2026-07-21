import { join, resolve } from "node:path";

const desktopRoot = resolve(import.meta.dir, "../..");
const frontendRoot = join(desktopRoot, "frontend");
const binPath = join(desktopRoot, "bin", "SurveyController.exe");

function run(command: string[], cwd = desktopRoot) {
  const result = Bun.spawnSync(command, {
    cwd,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  if (result.exitCode !== 0) {
    throw new Error(`Command failed with exit code ${result.exitCode}: ${command[0]}`);
  }
}

function spawn(command: string[], cwd = desktopRoot) {
  return Bun.spawn(command, {
    cwd,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
}

const command = process.argv[2] || "run";
const port = process.env.VITE_PORT || "9245";

try {
  if (command === "frontend-dev") {
    const processHandle = spawn([process.execPath, "run", "dev", "--", "--port", port, "--strictPort"], frontendRoot);
    process.exit(await processHandle.exited);
  } else if (command === "dev-build") {
    run([process.execPath, "build/scripts/build.ts", "dev-build"]);
  } else if (command === "run") {
    const processHandle = spawn([binPath]);
    process.exit(await processHandle.exited);
  } else {
    throw new Error(`Unknown dev command: ${command}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
