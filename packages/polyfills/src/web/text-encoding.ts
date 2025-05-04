import { TextDecoder, TextEncoder } from "@sinonjs/text-encoding";

declare const global: {
  TextDecoder: typeof TextDecoder;
  TextEncoder: typeof TextEncoder;
};

global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;
