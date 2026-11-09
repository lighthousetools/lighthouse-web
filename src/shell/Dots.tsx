import { useEffect, useRef } from "react";
import { useLook } from "./look";

/** The edge of a cell in CSS pixels. */
const CELL = 5;
const FRAME_MS = 1000 / 30;
/** How fast the pointer's gust fades, per frame, and how much a pixel of movement adds. */
const GUST_FADE = 0.93;
const GUST_GAIN = 0.006;
const FOLLOW = 0.08;

const VERTEX = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";

// A grid of squares. Wind is noise that drifts and warps itself, with long streaks for the gusts. Each square grows
// and brightens with the wind at its center, and the pointer pushes the field aside and lights up around it.
const FRAGMENT = `precision highp float;uniform vec2 r,m;uniform float t,g,c,k;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*n(p);p=p*2.03+vec2(3.1,1.7);a*=.5;}return v;}
void main(){vec2 id=floor(gl_FragCoord.xy/c);vec2 f=fract(gl_FragCoord.xy/c)-.5;
vec2 u=(id+.5)*c/r.y;vec2 d=((id+.5)*c-m)/r.y;float l=dot(d,d);float near=exp(-l*30.);
u+=d*near*(.06+.25*g);
vec2 w=vec2(t*.065,t*.018);
vec2 q=vec2(fbm(u*1.5-w),fbm(u*1.5+vec2(5.2,1.3)-w*.8));
float s=fbm(u*2.1+q*2.-w*1.7);
float streak=fbm(vec2(u.x*1.1-t*.16,u.y*8.+q.x*3.));
float body=smoothstep(.3,.82,s);
float v=pow(body,1.4)*.72+smoothstep(.56,.84,streak)*.38;
v+=near*(.08+.3*g);
v=clamp(v,0.,1.);
float size=mix(.12,.32,v);
float a=smoothstep(size+1./c,size-1./c,max(abs(f.x),abs(f.y)));
float b=.06+.5*v*v;float ink=a*b;gl_FragColor=vec4(vec3(mix(ink,1.-ink*.62,k)),1.);}`;

function program(gl: WebGLRenderingContext) {
  const shader = (type: number, source: string) => {
    const made = gl.createShader(type)!;
    gl.shaderSource(made, source);
    gl.compileShader(made);
    return made;
  };
  const linked = gl.createProgram()!;
  gl.attachShader(linked, shader(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(linked, shader(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(linked);
  if (!gl.getProgramParameter(linked, gl.LINK_STATUS)) return null;
  gl.useProgram(linked);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(linked, "p");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  return linked;
}

/**
 * The background: squares in the ink of the look, moved by wind across the whole page and stirred by the pointer. With
 * reduced motion it draws a still frame, and without WebGL it stays black.
 */
export function Dots() {
  const ref = useRef<HTMLCanvasElement>(null);
  const light = useLook() === "light";
  useEffect(() => {
    const canvas = ref.current!;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
    if (!gl) return undefined;
    const linked = program(gl);
    if (!linked) return undefined;
    const at = (name: string) => gl.getUniformLocation(linked, name);
    const [size, pointer, time, gust, cell] = [at("r"), at("m"), at("t"), at("g"), at("c")];
    gl.uniform1f(at("k"), light ? 1 : 0);
    const still = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const ratio = () => Math.min(globalThis.devicePixelRatio || 1, 2);
    // Starts off the page, so nothing lights up before the pointer moves.
    const aim = { x: -9999, y: -9999 };
    const eased = { x: -9999, y: -9999 };
    let strength = 0;
    let frame = 0;
    let last = 0;
    const start = performance.now();

    const draw = (now: number) => {
      eased.x = eased.x < -999 ? aim.x : eased.x + (aim.x - eased.x) * FOLLOW;
      eased.y = eased.y < -999 ? aim.y : eased.y + (aim.y - eased.y) * FOLLOW;
      strength *= GUST_FADE;
      gl.uniform2f(pointer, eased.x * ratio(), canvas.height - eased.y * ratio());
      gl.uniform1f(gust, strength);
      gl.uniform1f(time, still ? 40 : (now - start) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const resize = () => {
      canvas.width = Math.round(globalThis.innerWidth * ratio());
      canvas.height = Math.round(globalThis.innerHeight * ratio());
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(size, canvas.width, canvas.height);
      gl.uniform1f(cell, CELL * ratio());
      if (still) draw(performance.now());
    };
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      if (document.hidden || now - last < FRAME_MS) return;
      last = now;
      draw(now);
    };
    const move = (event: PointerEvent) => {
      const moved = aim.x < -999 ? 0 : Math.hypot(event.clientX - aim.x, event.clientY - aim.y);
      aim.x = event.clientX;
      aim.y = event.clientY;
      strength = Math.min(1, strength + moved * GUST_GAIN);
    };

    resize();
    globalThis.addEventListener("resize", resize);
    if (!still) {
      globalThis.addEventListener("pointermove", move, { passive: true });
      frame = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(frame);
      globalThis.removeEventListener("resize", resize);
      globalThis.removeEventListener("pointermove", move);
    };
  }, [light]);
  return <canvas ref={ref} className="dots" aria-hidden="true" />;
}
