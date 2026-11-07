// The sky shader of Light.tsx, on the CPU, for when there is no WebGL (or it was lost). It paints a small image once;
// the browser scales it up, and the window's blur hides the low resolution. Same palettes, same noise, same beam.

type Vec3 = [number, number, number];

const fract = (x: number) => x - Math.floor(x);
const hash = (x: number, y: number) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function noise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  return mix(mix(hash(ix, iy), hash(ix + 1, iy), fx), mix(hash(ix, iy + 1), hash(ix + 1, iy + 1), fx), fy);
}

function fbm(x: number, y: number) {
  let value = 0, amplitude = 0.5;
  for (let octave = 0; octave < 5; octave++) {
    value += amplitude * noise(x, y);
    x = x * 2.02 + 3.1;
    y = y * 2.02 + 1.7;
    amplitude *= 0.5;
  }
  return value;
}

const mix3 = (a: Vec3, b: Vec3, t: number): Vec3 => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
function palette(x: number, a: Vec3, b: Vec3, c: Vec3, g: Vec3): Vec3 {
  return x < 0.33 ? mix3(a, b, x / 0.33) : x < 0.66 ? mix3(b, c, (x - 0.33) / 0.33) : mix3(c, g, (x - 0.66) / 0.34);
}

/** The color of one point, `u` and `v` from 0 to 1 with `v` going up, as in the shader. */
export function skyColor(u: number, v: number, aspect: number, t: number, d: number): Vec3 {
  const px = u * aspect * 1.5, py = v * 1.5, s = t * 0.035;
  const qx = fbm(px + s, py + s), qy = fbm(px + 5.2 - s, py + 1.3 - s);
  const kx = fbm(px + 2.6 * qx + 1.7 + s * 0.7, py + 2.6 * qy + 9.2 + s * 0.7);
  const ky = fbm(px + 2.6 * qx + 8.3 - s * 0.6, py + 2.6 * qy + 2.8 - s * 0.6);
  const f = Math.min(1, Math.max(0, fbm(px + 2.4 * kx, py + 2.4 * ky) * 1.15 + v * 0.2 - 0.14));
  const dawn = palette(f, [0.04, 0.14, 0.5], [0.1, 0.36, 0.82], [0.5, 0.72, 0.95], [1, 0.87, 0.74]);
  const noon = palette(f, [0.02, 0.2, 0.72], [0.1, 0.52, 0.95], [0.56, 0.84, 0.97], [0.95, 0.98, 1]);
  const night = palette(f, [0.005, 0.012, 0.04], [0.015, 0.05, 0.14], [0.04, 0.14, 0.34], [0.16, 0.3, 0.6]);
  const color = d < 1 ? mix3(dawn, noon, d) : mix3(noon, night, d - 1);
  // The lighthouse beam from the top right.
  const ox = 0.86 + 0.05 * Math.sin(t * 0.1), oy = 1.08;
  const vx = (u - ox) * aspect, vy = v - oy;
  const angle = Math.atan2(vy, vx);
  const sweep = Math.sin(t * 0.16) * 0.55 - 1.75;
  const length = Math.hypot(vx, vy);
  const edge = Math.min(1, Math.max(0, (length - 1.8) / (0.1 - 1.8)));
  const beam = Math.exp(-(((angle - sweep) * 3.2) ** 2)) * edge * edge * (3 - 2 * edge);
  const glow = beam * (0.26 + (d > 1 ? 0.1 : 0));
  return [color[0] + glow, color[1] + 0.72 * glow, color[2] + 0.36 * glow];
}

/** Paints the sky into a 2D canvas of the given size. */
export function paintSky(canvas: HTMLCanvasElement, width: number, height: number, t: number, d: number) {
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return false;
  const image = context.createImageData(width, height);
  const aspect = width / height;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = skyColor((x + 0.5) / width, 1 - (y + 0.5) / height, aspect, t, d);
      const at = (y * width + x) * 4;
      image.data[at] = Math.min(255, r * 255);
      image.data[at + 1] = Math.min(255, g * 255);
      image.data[at + 2] = Math.min(255, b * 255);
      image.data[at + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return true;
}
