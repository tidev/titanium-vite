interface TextEncoderEncodeIntoResult {
  read: number;
  written: number;
}

interface TextEncoder {
  readonly encoding: string;
  encode(input?: string): Uint8Array;
  encodeInto(
    input: string,
    destination: Uint8Array,
  ): TextEncoderEncodeIntoResult;
}

interface TextDecoderOptions {
  fatal?: boolean;
  ignoreBOM?: boolean;
}

interface TextDecodeOptions {
  stream?: boolean;
}

interface TextDecoder {
  readonly encoding: string;
  readonly fatal: boolean;
  readonly ignoreBOM: boolean;
  decode(input?: BufferSource, options?: TextDecodeOptions): string;
}

declare module "@sinonjs/text-encoding" {
  export class TextEncoder implements TextEncoder {
    readonly encoding: string;
    encode(input?: string): Uint8Array;
    encodeInto(
      input: string,
      destination: Uint8Array,
    ): TextEncoderEncodeIntoResult;
  }

  export class TextDecoder implements TextDecoder {
    readonly encoding: string;
    readonly fatal: boolean;
    readonly ignoreBOM: boolean;
    constructor(label?: string, options?: TextDecoderOptions);
    decode(input?: BufferSource, options?: TextDecodeOptions): string;
  }
}
