import { URL, URLSearchParams } from "whatwg-url";

declare const global: {
  URL: typeof URL;
  URLSearchParams: typeof URLSearchParams;
};

global.URL = URL;
global.URLSearchParams = URLSearchParams;
