"use strict";

// Two small (16x16) PNGs, embedded as base64 so the boundary integration
// test doesn't depend on external fixture files. `gradient` is a smooth
// diagonal ramp; `noise` is deterministic pseudo-random per-pixel noise —
// about as visually unlike `gradient` as two images get. Both were
// generated once via the Rust core's own test-fixture PNG encoder.

const gradient = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAC5ElEQVR4Ae3AA6AkWZbG8f937o3IzKdyS2Oubdu2bdu2bdu2bWmMnpZKr54yMyLu+Xa3anqmhztr1a8Cs9lsPp/P5/P5fD6fz+fz+Xw+n8/n8/l8Pp/P5/P5fD6fz+fz+Xw+r7PZbD6fz+fz+Xw+n8/n8/l8Pp/P5/P5fD6fz+fz+Xw+n8/n8/l8Pp/P53U+n8/n8/l8Pp/P5/P5fD6fz+fz+Xw+n8/n8/l8Pp/P5/P5fD6fz+fz+bzO5/P5fD6fz+fz+Xw+n8/n8/l8Pp/P5/P5fD6fz+fz+Xw+n8/n8/l8Pp/X+Xw+n8/n8/l8Pp/P5/P5fD6fz+fz+Xw+n8/n8/l8Pp/P5/P5fD6fz+fzOp/P5/P5fD6fz+fz+Xw+n8/n8/l8Pp/P5/P5fD6fz+fz+Xw+n8/n8/l8Xufz+Xw+n8/n8/l8Pp/P5/P5fD6fz+fz+Xw+n8/n8/l8Pp/P5/P5fD6fz+t8Pp/P5/P5fD6fz+fz+Xw+n8/n8/l8Pp/P5/P5fD6fz+fz+Xw+n8/n83mdz+fz+Xw+n8/n8/l8Pp/P5/P5fD6fz+fz+Xw+n8/n8/l8Pp/P5/P5fD6v8/l8Pp/P5/P5fD6fz+fz+Xw+n8/n8/l8Pp/P5/P5fD6fz+fz+Xw+n8/ndT6fz+fz+Xw+n8/n8/l8Pp/P5/P5fD6fz+fz+Xw+n8/n8/l8Pp/P5/P5vM7n8/l8Pp/P5/P5fD6fz+fz+Xw+n8/n8/l8Pp/P5/P5fD6fz+fz+Xw+n9f5fD6fz+fz+Xw+n8/n8/l8Pp/P5/P5fD6fz+fz+Xw+n8/n8/l8Pp/P5/M6n8/n8/l8Pp/P5/P5fD6fz+fz+Xw+n8/n8/l8Pp/P5/P5fD6fz+fz+Xxe5/P5fD6fz+fz+Xw+n8/n8/l8Pp/P5/P5fD6fz+fz+Xw+n8/n8/l8Pp/P63w+n8/n8/l8Pp/P5/P5fD6fz+fz+Xw+n8/n8/l8Pp/P5/P5fD6fz+fz+T8C0kQYIxi530MAAAAASUVORK5CYII=",
  "base64",
);

const noise = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAADG0lEQVR4AQEQA+/8AAAAALGxsWJiYhMTE8TExHV1dSYmJtfX14iIiDk5Oerq6pubm0xMTP39/a6url9fXwA3Nzfo6OiZmZlKSkr7+/usrKxdXV0ODg6/v79wcHAhISHS0tKDg4M0NDTl5eWWlpYAbm5uHx8f0NDQgYGBMjIy4+PjlJSURUVF9vb2p6enWFhYCQkJurq6a2trHBwczc3NAKWlpVZWVgcHB7i4uGlpaRoaGsvLy3x8fC0tLd7e3o+Pj0BAQPHx8aKiolNTUwQEBADc3NyNjY0+Pj7v7++goKBRUVECAgKzs7NkZGQVFRXGxsZ3d3coKCjZ2dmKioo7OzsAExMTxMTEdXV1JiYm19fXiIiIOTk56urqm5ubTExM/f39rq6uX19fEBAQwcHBcnJyAEpKSvv7+6ysrF1dXQ4ODr+/v3BwcCEhIdLS0oODgzQ0NOXl5ZaWlkdHR/j4+KmpqQCBgYEyMjLj4+OUlJRFRUX29vanp6dYWFgJCQm6urpra2scHBzNzc1+fn4vLy/g4OAAuLi4aWlpGhoay8vLfHx8LS0t3t7ej4+PQEBA8fHxoqKiU1NTBAQEtbW1ZmZmFxcXAO/v76CgoFFRUQICArOzs2RkZBUVFcbGxnd3dygoKNnZ2YqKijs7O+zs7J2dnU5OTgAmJibX19eIiIg5OTnq6uqbm5tMTEz9/f2urq5fX18QEBDBwcFycnIjIyPU1NSFhYUAXV1dDg4Ov7+/cHBwISEh0tLSg4ODNDQ05eXllpaWR0dH+Pj4qampWlpaCwsLvLy8AJSUlEVFRfb29qenp1hYWAkJCbq6umtraxwcHM3NzX5+fi8vL+Dg4JGRkUJCQvPz8wDLy8t8fHwtLS3e3t6Pj49AQEDx8fGioqJTU1MEBAS1tbVmZmYXFxfIyMh5eXkqKioAAgICs7OzZGRkFRUVxsbGd3d3KCgo2dnZioqKOzs77OzsnZ2dTk5O////sLCwYWFhADk5Oerq6pubm0xMTP39/a6url9fXxAQEMHBwXJyciMjI9TU1IWFhTY2Nufn55iYmAXXgBCAkbJQAAAAAElFTkSuQmCC",
  "base64",
);

module.exports = { gradient, noise };
