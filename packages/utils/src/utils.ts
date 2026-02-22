import type { Platform } from "./types.js";

/**
 * Prefix for resolved fs paths, since windows paths may not be valid as URLs.
 */
export const FS_PREFIX = `/@fs/`;

export const otherPlatform: Record<Platform, Platform> = {
  android: "ios",
  ios: "android",
};

export const bareImportRE = /^(?![a-zA-Z]:)[\w@](?!.*:\/\/)/;

const postfixRE = /[?#].*$/;
export function cleanUrl(url: string): string {
  return url.replace(postfixRE, "");
}

export function stripBase(path: string, base: string): string {
  if (path === base) {
    return "/";
  }
  const devBase = withTrailingSlash(base);
  return path.startsWith(devBase) ? path.slice(devBase.length - 1) : path;
}

export function withTrailingSlash(path: string): string {
  if (!path.endsWith("/")) {
    return `${path}/`;
  }
  return path;
}
