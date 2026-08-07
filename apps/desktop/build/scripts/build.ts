import { resolve } from "node:path";

const desktopRoot = resolve(import.meta.dir, "../..");

function run(args: string[]) {
  console.log(`> ${args.join(" ")}`);
  const result = Bun.spawnSync(args, {
    cwd: desktopRoot,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  if (result.exitCode !== 0) {
    throw new Error(`Command failed with exit code ${result.exitCode}: ${args[0]}`);
  }
}

const command = process.argv[2] || "build";
if (command === "build") {
  run(["pwsh", "-NoProfile", "-File", "build/native.ps1", "-Action", "build", "-Configuration", "Release"]);
} else if (command === "package") {
  run(["pwsh", "-NoProfile", "-File", "build/native.ps1", "-Action", "package", "-Configuration", "Release"]);
} else {
  throw new Error(`Unknown native build command: ${command}`);
}
