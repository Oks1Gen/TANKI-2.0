// Smoke-тест: гоняем движок без WebGL, проверяем отсутствие исключений
import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const realThree = path.join(root, 'node_modules/three/build/three.module.js');

const stubPost = `
export class EffectComposer { constructor(){ this.passes=[]; } addPass(){} setSize(){} render(){} dispose(){} }
export class RenderPass { constructor(){} }
export class UnrealBloomPass { constructor(){} }
`;
const wrapperThree = `
export * from ${JSON.stringify(realThree)};
export class WebGLRenderer {
  constructor(){ this.shadowMap={}; this.domElement={}; }
  setPixelRatio(){} setSize(){} render(){} dispose(){} getContext(){ return {}; }
}
`;

const plugin = {
  name: 'stubs',
  setup(b) {
    b.onResolve({ filter: /postprocessing\// }, () => ({ path: 'post-stub', namespace: 'stub' }));
    b.onResolve({ filter: /^three$/ }, (args) => (args.importer.includes('wrapper') ? { path: realThree } : { path: 'three-wrapper', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => ({ contents: args.path === 'post-stub' ? stubPost : wrapperThree, loader: 'js', resolveDir: root }));
  },
};

await build({
  entryPoints: [path.join(root, 'test/entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: path.join(root, 'test/out.mjs'),
  plugins: [plugin],
  logLevel: 'error',
});

// ---- DOM-заглушки ----
const noop = () => {};
const ctx2d = new Proxy({}, { get: (_, k) => (k === 'canvas' ? {} : k === 'measureText' ? () => ({ width: 10 }) : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : noop), set: () => true });
const makeCanvas = () => ({
  width: 256, height: 256, clientWidth: 1280, clientHeight: 720, style: {},
  getContext: (t) => (t === '2d' ? ctx2d : {}),
  addEventListener: noop, removeEventListener: noop, requestPointerLock: () => Promise.resolve(), setPointerCapture: noop,
  parentElement: { clientWidth: 1280, clientHeight: 720 },
});
globalThis.window = { addEventListener: noop, removeEventListener: noop, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720, AudioContext: undefined };
globalThis.document = { createElement: () => makeCanvas(), addEventListener: noop, removeEventListener: noop, pointerLockElement: null, exitPointerLock: noop, createElementNS: () => makeCanvas() };
globalThis.self = globalThis;
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
let rafCb = null;
globalThis.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
globalThis.cancelAnimationFrame = noop;
globalThis.localStorage = { getItem: () => null, setItem: noop };

const { run } = await import(path.join(root, 'test/out.mjs'));
await run(makeCanvas(), () => rafCb);
fs.unlinkSync(path.join(root, 'test/out.mjs'));
console.log('SMOKE OK');
