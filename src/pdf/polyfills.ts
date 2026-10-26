// The PDF reader (pdf.js) is written for browsers. React Native's JavaScript engine lacks four things
// it needs, so they are added here when missing (a browser already has them, and nothing is replaced).
// Found by running pdf.js in a context stripped down to what React Native has.
import { ReadableStream } from "web-streams-polyfill";
import structuredClone from "@ungap/structured-clone";

const g = globalThis as Record<string, unknown>;

if (typeof g.DOMException === "undefined") {
  g.DOMException = class DOMException extends Error {
    constructor(message?: string, name?: string) {
      super(message);
      this.name = name ?? "Error";
    }
  };
}

if (typeof Promise.withResolvers !== "function") {
  Promise.withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

if (typeof g.structuredClone === "undefined") g.structuredClone = structuredClone;
if (typeof g.ReadableStream === "undefined") g.ReadableStream = ReadableStream;
