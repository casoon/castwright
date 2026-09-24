// Importing a *.terminal.yaml runs it through the castwright Vite plugin at
// build time: `cast` is the compiled asciicast, `finalFrame` its end state as
// plain text for the accessibility fallback.
import demo from './demo.terminal.yaml';
import '@casoon/castwright-player';

const el = document.querySelector('#demo') as HTMLElement & { cast?: unknown };
el.cast = demo.cast;

const fallback = document.createElement('pre');
fallback.textContent = demo.finalFrame;
el.prepend(fallback);
