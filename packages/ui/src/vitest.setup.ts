import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// RTL auto-cleanup relies on a global afterEach, which is not exposed when
// vitest runs with globals disabled — register it explicitly.
afterEach(() => {
  cleanup();
});

// jsdom ships HTMLDialogElement without showModal/close — minimal polyfill so
// the native-<dialog>-based Dialog primitive can be exercised in tests.
if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}
