// Jest setup provided by Grafana scaffolding
import './.config/jest-setup';

// jsdom lacks MessageChannel, which react-dom/server (pulled in by @grafana/ui) needs at import time
// (worker_threads' MessageChannel would keep jest's event loop alive, so use a minimal in-process shim).
// Only `onmessage`/`postMessage` are supported -- enough for React's scheduler; extend if a dependency
// needs addEventListener.
if (typeof global.MessageChannel === 'undefined') {
  global.MessageChannel = class MessageChannel {
    constructor() {
      const makePort = () => ({ onmessage: null, postMessage: undefined, close() {}, start() {} });
      this.port1 = makePort();
      this.port2 = makePort();
      const link = (from, to) => {
        from.postMessage = (data) => setTimeout(() => to.onmessage && to.onmessage({ data }), 0);
      };
      link(this.port1, this.port2);
      link(this.port2, this.port1);
    }
  };
}

// jsdom lacks IntersectionObserver, which @grafana/ui's Select menu (ScrollIndicators) uses when opened
if (typeof global.IntersectionObserver === 'undefined') {
  global.IntersectionObserver = class IntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  };
}
