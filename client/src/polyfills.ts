import { Buffer } from "buffer";
import process from "process";

type BrowserGlobals = typeof globalThis & {
  Buffer: typeof Buffer;
  process: typeof process;
};

const browserGlobals = globalThis as BrowserGlobals;
browserGlobals.Buffer = Buffer;
browserGlobals.process = process;
