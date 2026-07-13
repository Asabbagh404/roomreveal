// Vitest global setup (jsdom). Polyfills browser APIs jsdom lacks but that some
// components (radix Slider → useSize) require at mount. Kept minimal.

if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver;
}
