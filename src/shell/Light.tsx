import { useEffect, useRef, useState } from "react";
import { dayPhase } from "./look";
import { paintSky } from "./sky";

const VERTEX = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";

// Domain-warped noise in three palettes (dawn, noon, night) plus the slow sweep of a lighthouse beam.
const FRAGMENT = `precision highp float;uniform vec2 r;uniform float t,d;
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(fract(sin(dot(i,vec2(127.1,311.7)))*43758.5),fract(sin(dot(i+vec2(1,0),vec2(127.1,311.7)))*43758.5),f.x),mix(fract(sin(dot(i+vec2(0,1),vec2(127.1,311.7)))*43758.5),fract(sin(dot(i+vec2(1,1),vec2(127.1,311.7)))*43758.5),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p=p*2.02+vec2(3.1,1.7);a*=.5;}return v;}
vec3 pal(float x,vec3 a,vec3 b,vec3 c,vec3 g){return x<.33?mix(a,b,x/.33):x<.66?mix(b,c,(x-.33)/.33):mix(c,g,(x-.66)/.34);}
void main(){vec2 u=gl_FragCoord.xy/r;vec2 p=u*vec2(r.x/r.y,1.)*1.5;float s=t*.035;
vec2 q=vec2(fbm(p+s),fbm(p+vec2(5.2,1.3)-s));vec2 k=vec2(fbm(p+2.6*q+vec2(1.7,9.2)+s*.7),fbm(p+2.6*q+vec2(8.3,2.8)-s*.6));
float f=clamp(fbm(p+2.4*k)*1.15+u.y*.2-.14,0.,1.);
vec3 dawn=pal(f,vec3(.04,.14,.5),vec3(.1,.36,.82),vec3(.5,.72,.95),vec3(1.,.87,.74));
vec3 noon=pal(f,vec3(.02,.2,.72),vec3(.1,.52,.95),vec3(.56,.84,.97),vec3(.95,.98,1.));
vec3 night=pal(f,vec3(.005,.012,.04),vec3(.015,.05,.14),vec3(.04,.14,.34),vec3(.16,.3,.6));
vec3 c=d<1.?mix(dawn,noon,d):mix(noon,night,d-1.);
vec2 o=vec2(.86+.05*sin(t*.1),1.08);vec2 v=u-o;v.x*=r.x/r.y;float an=atan(v.y,v.x);
float sweep=sin(t*.16)*.55-1.75;float beam=exp(-pow((an-sweep)*3.2,2.))*smoothstep(1.8,.1,length(v));
c+=vec3(1.,.72,.36)*beam*(.26+(d>1.?.1:0.));gl_FragColor=vec4(c,1.);}`;

/** Follows the clock, a minute at a time. */
function usePhase() {
  const [phase, setPhase] = useState(() => dayPhase(new Date()));
  useEffect(() => {
    const timer = setInterval(() => setPhase(dayPhase(new Date())), 60_000);
    return () => clearInterval(timer);
  }, []);
  return phase;
}

/**
 * The background: a WebGL sky that follows the time of day. Without WebGL it falls back to a gradient
 * of the same phase, and with reduced motion it draws a still frame.
 */
export function Light() {
  const ref = useRef<HTMLCanvasElement>(null);
  const phase = usePhase();
  const target = useRef(phase);
  const redraw = useRef<() => void>(() => {});
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    target.current = phase;
    redraw.current();
  }, [phase]);

  useEffect(() => {
    const canvas = ref.current!;
    let gl: WebGLRenderingContext | null = null;
    try {
      gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    } catch {
      gl = null;
    }
    if (!gl) {
      setFailed(true);
      return;
    }
    const shader = (type: number, source: string) => {
      const created = gl.createShader(type)!;
      gl.shaderSource(created, source);
      gl.compileShader(created);
      return created;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      setFailed(true);
      return;
    }
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "p");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const uniform = { r: gl.getUniformLocation(program, "r"), t: gl.getUniformLocation(program, "t"), d: gl.getUniformLocation(program, "d") };
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let shown = target.current;
    let frame = 0;
    let stopped = false;
    const draw = (ms: number) => {
      shown += (target.current - shown) * (calm ? 1 : 0.05);
      gl.uniform2f(uniform.r, canvas.width, canvas.height);
      gl.uniform1f(uniform.t, calm ? 20 : ms / 1000 + 40);
      gl.uniform1f(uniform.d, shown);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const loop = (ms: number) => {
      if (stopped) return;
      draw(ms);
      frame = requestAnimationFrame(loop);
    };
    const size = () => {
      // Half resolution: the sky is soft anyway, and this keeps the GPU cool.
      canvas.width = Math.round(innerWidth * 0.5);
      canvas.height = Math.round(innerHeight * 0.5);
      gl.viewport(0, 0, canvas.width, canvas.height);
      if (calm) draw(0);
    };
    const visibility = () => {
      cancelAnimationFrame(frame);
      if (!calm && !document.hidden && !stopped) frame = requestAnimationFrame(loop);
    };
    // A lost context (the GPU was reset, or the app was hidden for long) falls back to the painted sky.
    const lost = (event: Event) => {
      event.preventDefault();
      stopped = true;
      cancelAnimationFrame(frame);
      setFailed(true);
    };
    canvas.addEventListener("webglcontextlost", lost);
    addEventListener("resize", size);
    document.addEventListener("visibilitychange", visibility);
    size();
    // Draw one frame now: animation frames may not come while the window is hidden or occluded, and an empty
    // canvas would show the flat gradient behind it.
    draw(performance.now());
    redraw.current = () => calm && draw(0);
    if (!calm) frame = requestAnimationFrame(loop);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      removeEventListener("resize", size);
      document.removeEventListener("visibilitychange", visibility);
      canvas.removeEventListener("webglcontextlost", lost);
      redraw.current = () => {};
    };
  }, []);

  const rounded = String(Math.round(phase));
  return (
    <>
      <canvas ref={ref} className="light" data-phase={rounded} data-fallback={failed || undefined} aria-hidden="true" style={failed ? { visibility: "hidden" } : undefined} />
      {failed && <PaintedSky phase={phase} />}
    </>
  );
}

/** Without WebGL: the same sky painted once on the CPU, small, and repainted when the phase or the window changes. */
function PaintedSky({ phase }: { phase: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState(() => [innerWidth, innerHeight]);
  useEffect(() => {
    let pause = 0;
    const resize = () => {
      clearTimeout(pause);
      pause = window.setTimeout(() => setSize([innerWidth, innerHeight]), 200);
    };
    addEventListener("resize", resize);
    return () => {
      clearTimeout(pause);
      removeEventListener("resize", resize);
    };
  }, []);
  useEffect(() => {
    const width = 192;
    const height = Math.max(1, Math.round((width * size[1]!) / size[0]!));
    if (ref.current) paintSky(ref.current, width, height, 40, phase);
  }, [phase, size]);
  return <canvas ref={ref} className="light painted" data-phase={String(Math.round(phase))} aria-hidden="true" />;
}
