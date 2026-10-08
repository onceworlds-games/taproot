import { Canvas2DBackend } from '@onceworlds/engine/modules';

// A canvas for tests that has no pixels but is strict. It records every call, throws on a number that isn't finite (a NaN in a canvas
// call silently poisons the transform in a real browser), on `restore` without a `save`, and reports a `save` left open.
// `canvas.ctx` has what was drawn: `calls` ({ m, a }), `placed` (where each text landed in device pixels), `sets`, `depth`.

const METHODS = new Set([
  'save', 'restore', 'setTransform', 'transform', 'translate', 'scale', 'rotate', 'resetTransform', 'drawImage', 'fillRect', 'strokeRect', 'clearRect',
  'rect', 'roundRect', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'ellipse', 'quadraticCurveTo', 'bezierCurveTo', 'fill', 'stroke',
  'clip', 'fillText', 'strokeText', 'setLineDash', 'putImageData',
]);
const NUMERIC_PROPS = new Set(['globalAlpha', 'lineWidth', 'miterLimit', 'shadowBlur', 'shadowOffsetX', 'shadowOffsetY', 'lineDashOffset']);

export class FakeCanvas {
  constructor(width = 800, height = 600) {
    this.width = width;
    this.height = height;
    this.style = {};
    const calls = [];
    const sets = [];
    const stack = [];
    const state = { calls, sets, depth: 0, maxDepth: 0, font: '10px sans-serif', matrix: [1, 0, 0, 1, 0, 0], placed: [] };
    const mul = (m, a, b, c, d, e, f) => [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]];
    this.ctx = state;
    const fail = (message) => {
      throw new Error(`fake canvas: ${message}`);
    };
    const finite = (method, value, where) => {
      if (typeof value === 'number' && !Number.isFinite(value)) fail(`${method} got ${String(value)} for ${where}`);
      if (Array.isArray(value)) value.forEach((v, i) => finite(method, v, `${where}[${i}]`));
    };
    this.proxy = new Proxy(state, {
      get: (target, prop) => {
        if (prop === 'canvas') return this;
        if (prop === 'measureText') {
          return (text) => {
            const size = Number(/(\d+(?:\.\d+)?)px/.exec(String(target.font))?.[1] ?? 10);
            return { width: String(text).length * size * 0.5 };
          };
        }
        if (prop === 'getLineDash') return () => [];
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop() {} });
        if (METHODS.has(prop)) {
          return (...args) => {
            args.forEach((a, i) => finite(prop, a, `argument ${i + 1}`));
            if (prop === 'save') {
              stack.push(target.matrix.slice());
              target.depth++;
              target.maxDepth = Math.max(target.maxDepth, target.depth);
            }
            if (prop === 'restore') {
              if (target.depth === 0) fail('restore() without a matching save()');
              target.depth--;
              target.matrix = stack.pop();
            }
            if (prop === 'setTransform' && args.length === 6) target.matrix = args.slice();
            if (prop === 'resetTransform') target.matrix = [1, 0, 0, 1, 0, 0];
            if (prop === 'transform') target.matrix = mul(target.matrix, ...args);
            if (prop === 'translate') target.matrix = mul(target.matrix, 1, 0, 0, 1, args[0], args[1]);
            if (prop === 'scale') target.matrix = mul(target.matrix, args[0], 0, 0, args[1], 0, 0);
            if (prop === 'rotate') {
              const r = args[0];
              target.matrix = mul(target.matrix, Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0);
            }
            if (prop === 'fillText' || prop === 'strokeText') {
              const [text, x, y] = args;
              const m = target.matrix;
              target.placed.push({ m: prop, text, x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
            }
            if (prop === 'drawImage') {
              const image = args[0];
              if (!image || typeof image.width !== 'number') fail('drawImage got something that is not an image');
              if (args.length === 9) {
                if (args[3] < 0 || args[4] < 0) fail('drawImage got a negative source size');
                if (args[7] < 0 || args[8] < 0) fail('drawImage got a negative destination size');
              }
            }
            if (prop === 'setTransform' && args.length === 6) {
              const [a, b, c, d] = args;
              if (a * d - b * c === 0) fail('setTransform got a singular matrix');
            }
            calls.push({ m: prop, a: args });
          };
        }
        return target[prop];
      },
      set: (target, prop, value) => {
        if (NUMERIC_PROPS.has(prop)) {
          if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${prop} was set to ${String(value)}`);
        }
        if ((prop === 'fillStyle' || prop === 'strokeStyle' || prop === 'shadowColor') && typeof value === 'string' && /nan|infinity|undefined/i.test(value)) fail(`${prop} was set to ${value}`);
        if (prop === 'font' && /nan|infinity|undefined/i.test(String(value))) fail(`font was set to ${String(value)}`);
        sets.push({ p: prop, v: value });
        target[prop] = value;
        return true;
      },
    });
  }

  getContext() {
    return this.proxy;
  }

  /** How many times a method was called. */
  count(method) {
    return this.ctx.calls.filter((c) => c.m === method).length;
  }

  /** The arguments of every call to a method. */
  args(method) {
    return this.ctx.calls.filter((c) => c.m === method).map((c) => c.a);
  }

  /** Forget what was recorded (not the state). */
  reset() {
    this.ctx.calls.length = 0;
    this.ctx.sets.length = 0;
    this.ctx.placed.length = 0;
  }

  /** Throws if a save() is still open. */
  assertBalanced() {
    if (this.ctx.depth !== 0) throw new Error(`fake canvas: ${this.ctx.depth} save() call(s) without a restore()`);
  }
}

export const fakeCanvas = (width = 800, height = 600) => new FakeCanvas(width, height);

/** A picture that is only a size: all a fake canvas needs to draw one. */
export const fakeImage = (width = 16, height = 16) => ({ width, height });

/** A Canvas 2D backend that throws on any command it can't draw (production skips it), so a bad number or a closed image fails the test. */
export const strictBackend = (canvas, options = {}) => new Canvas2DBackend(canvas, { createSurface: (w, h) => new FakeCanvas(w, h), ...options, strict: true });
