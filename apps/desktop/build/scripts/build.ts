import { join, resolve } from "node:path";

const desktopRoot = resolve(import.meta.dir, "../..");
const frontendRoot = join(desktopRoot, "frontend");
const buildRoot = join(desktopRoot, "build");
const binRoot = join(desktopRoot, "bin");
const appName = "SurveyController";
const arch = process.env.GOARCH || "amd64";

type Command = string[];

function run(command: Command, cwd = desktopRoot, env?: Record<string, string>) {
  console.log(`> ${command.join(" ")}`);
  const result = Bun.spawnSync(command, {
    cwd,
    env: { ...process.env, ...env },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  if (result.exitCode !== 0) {
    throw new Error(`Command failed with exit code ${result.exitCode}: ${command[0]}`);
  }
}

function bunCommand(args: string[]) {
  return [process.execPath, ...args];
}

function installFrontend() {
  run(bunCommand(["install", "--frozen-lockfile"]), frontendRoot);
}

function generateBindings() {
  run(["wails3", "generate", "bindings", "-clean=true", "-ts", "-i"]);
}

function syncResources() {
  run(["go", "run", "./build/scripts/sync_version", "-root", "."]);
  run(["go", "run", "./build/scripts/sync_icons", "-root", "."]);
}

function generateSyso(targetArch: string) {
  run([
    "wails3",
    "generate",
    "syso",
    "-arch",
    targetArch,
    "-icon",
    "build/windows/icon.ico",
    "-manifest",
    "build/windows/wails.exe.manifest",
    "-info",
    "build/windows/info.json",
    "-out",
    `wails_windows_${targetArch}.syso`,
  ]);
}

function buildFrontend(dev: boolean) {
  installFrontend();
  generateBindings();
  run(bunCommand(["run", dev ? "build:dev" : "build"]), frontendRoot, {
    PRODUCTION: dev ? "false" : "true",
  });
}

function buildDesktop(dev: boolean, targetArch: string) {
  buildFrontend(dev);
  syncResources();
  generateSyso(targetArch);

  const output = join(binRoot, `${appName}.exe`);
  const args = ["build", "-buildvcs=false", "-o", output];
  if (dev) {
    args.splice(1, 0, "-gcflags=all=-l");
  } else {
    args.splice(1, 0, "-tags", "production", "-trimpath", "-ldflags=-w -s -H windowsgui");
  }
  run(["go", ...args], desktopRoot, {
    GOOS: "windows",
    GOARCH: targetArch,
    CGO_ENABLED: process.env.CGO_ENABLED || "0",
  });
}

function packageDesktop(targetArch: string) {
  buildDesktop(false, targetArch);
  run(["wails3", "generate", "webview2bootstrapper", "-dir", "build/windows/nsis"]);
  const architecture = targetArch === "amd64" ? "AMD64" : "ARM64";
  run([
    "makensis",
    "-DWAILS_INSTALL_SCOPE=user",
    "-DREQUEST_EXECUTION_LEVEL=user",
    `-DARG_WAILS_${architecture}_BINARY=${join(desktopRoot, "bin", `${appName}.exe`)}`,
    "project.nsi",
  ], join(buildRoot, "windows", "nsis"));
}

async function cleanGeneratedSyso(targetArch: string) {
  const path = join(desktopRoot, `wails_windows_${targetArch}.syso`);
  try {
    await Bun.file(path).delete();
  } catch {
    // Cleanup is best effort; the build result is already reported above.
  }
}

const command = process.argv[2] || "build";
try {
  if (command === "bindings") {
    generateBindings();
  } else if (command === "build") {
    buildDesktop(false, arch);
  } else if (command === "dev-build") {
    buildDesktop(true, arch);
  } else if (command === "package") {
    packageDesktop(arch);
  } else {
    throw new Error(`Unknown build command: ${command}`);
  }
} finally {
  await cleanGeneratedSyso(arch);
}
