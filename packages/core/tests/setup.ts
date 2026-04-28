import { performance as nodePerformance } from "node:perf_hooks";

// const dom = new JSDOM("<!doctype html><html><body></body></html>", {
//   url: "https://example.test/",
// });

// const { window } = dom;

// for (const key of [
//   "window",
//   "document",
//   "navigator",
//   "location",
//   "MutationObserver",
//   "CustomEvent",
//   "Event",
//   "MouseEvent",
//   "KeyboardEvent",
//   "FocusEvent",
//   "SubmitEvent",
//   "HTMLElement",
//   "HTMLInputElement",
//   "HTMLTextAreaElement",
//   "HTMLSelectElement",
//   "HTMLButtonElement",
//   "HTMLFormElement",
//   "Element",
//   "Node",
//   "ShadowRoot",
//   "DOMParser",
//   "CSS",
// ] as const) {
//   Object.defineProperty(globalThis, key, {
//     value: (window as never)[key],
//     configurable: true,
//   });
// }

Object.defineProperty(globalThis, "performance", {
  value: nodePerformance,
  configurable: true,
});

Object.defineProperty(globalThis, "CSS", {
  value: globalThis.CSS ?? {
    escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "\\$&"),
  },
  configurable: true,
});

// Object.defineProperty(globalThis, "getComputedStyle", {
//   value: window.getComputedStyle.bind(window),
//   configurable: true,
// });

// Object.defineProperty(globalThis, "requestAnimationFrame", {
//   value: window.requestAnimationFrame?.bind(window) ?? ((cb: FrameRequestCallback) => window.setTimeout(cb, 16)),
//   configurable: true,
// });

// Object.defineProperty(globalThis, "cancelAnimationFrame", {
//   value: window.cancelAnimationFrame?.bind(window) ?? ((id: number) => window.clearTimeout(id)),
//   configurable: true,
// });
