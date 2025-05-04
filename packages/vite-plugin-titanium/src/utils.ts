import type { Platform } from "./types.js";

/**
 * Prefix for resolved fs paths, since windows paths may not be valid as URLs.
 */
export const FS_PREFIX = `/@fs/`;

export const otherPlatform: Record<Platform, Platform> = {
  android: "ios",
  ios: "android",
};

const queryRE = /\?.*$/;
const hashRE = /#.*$/;

export const bareImportRE = /^(?![a-zA-Z]:)[\w@](?!.*:\/\/)/

export const cleanUrl = (url: string) =>
  url.replace(hashRE, "").replace(queryRE, "");
