import path from "path";
import fs from "fs";

function getRepoRoot(): string {
  const cwd = process.cwd();
  // If we are in apps/server, the root is two levels up
  if (path.basename(cwd) === "server" && path.basename(path.dirname(cwd)) === "apps") {
    return path.resolve(cwd, "../..");
  }
  return cwd;
}

export function normalizeGoogleCredentials() {
  const creds = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (creds && !path.isAbsolute(creds)) {
    const absolutePath = path.resolve(getRepoRoot(), creds);
    if (fs.existsSync(absolutePath)) {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = absolutePath;
    }
  }
}
