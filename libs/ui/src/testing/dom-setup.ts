import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom lacks what Radix popper and cmdk measure with.
globalThis.ResizeObserver = class {
  observe = () => undefined;
  unobserve = () => undefined;
  disconnect = () => undefined;
};
Element.prototype.scrollIntoView = () => undefined;
globalThis.scrollTo = () => undefined;
Element.prototype.hasPointerCapture = () => false;
Element.prototype.releasePointerCapture = () => undefined;

Object.defineProperty(globalThis, 'matchMedia', {
  configurable: true,
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }),
});

// The 1000 ms default fails the first render of a big page when CI runs four workers.
// Stay under vitest's 5000 ms test timeout so a stuck wait reports its own error.
configure({ asyncUtilTimeout: 4000 });

afterEach(cleanup);
