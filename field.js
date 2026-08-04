// Flowing bluish/purple field behind every page.
//
// A full-screen WebGL canvas runs domain-warped fbm noise, so the colour drifts
// and folds on its own. The cursor bends the field toward itself and drags a soft
// glow along with it, easing behind the real pointer so the motion feels liquid
// rather than glued to the mouse.
//
// Injects its own canvas + styles, so a page only needs: <script src="field.js"></script>
// Falls back to animated CSS gradients when WebGL is unavailable, and holds still
// for anyone who asks for reduced motion.
(function () {
  var reduced = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- canvas + base styles -------------------------------------------------
  var style = document.createElement("style");
  style.textContent =
    "#field,#field-fallback{position:fixed;inset:0;width:100%;height:100%;z-index:-1;" +
    "display:block;pointer-events:none}" +
    "#field{background:#0b0a19}" +
    // fallback: layered gradients, the cursor one tracked via --mx/--my.
    // Selected by id, not class, or the rule above would win on specificity.
    "#field-fallback{background:" +
    "radial-gradient(45vmax 45vmax at var(--mx,50%) var(--my,50%)," +
    "rgba(140,108,255,0.55),transparent 65%)," +
    "radial-gradient(60vmax 48vmax at 16% 20%,rgba(96,66,220,0.75),transparent 70%)," +
    "radial-gradient(55vmax 55vmax at 84% 80%,rgba(48,84,215,0.7),transparent 68%)," +
    "radial-gradient(70vmax 50vmax at 60% 55%,rgba(72,50,170,0.6),transparent 72%)," +
    "#150f33}";
  document.head.appendChild(style);

  var canvas = document.createElement("canvas");
  canvas.id = "field";
  canvas.setAttribute("aria-hidden", "true");
  function mount() {
    document.body.insertBefore(canvas, document.body.firstChild);
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);

  // ---- pointer tracking -----------------------------------------------------
  // `target` is where the pointer actually is; `eased` trails it, which is what
  // the shader reads. Both in CSS pixels.
  var target = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  var eased = { x: target.x, y: target.y };
  var idle = true;          // no real pointer yet -> drift on our own
  var idleTimer = 0;

  function onMove(e) {
    var p = e.touches ? e.touches[0] : e;
    if (!p) return;
    target.x = p.clientX;
    target.y = p.clientY;
    idle = false;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () { idle = true; }, 4000);
  }
  window.addEventListener("pointermove", onMove, { passive: true });
  window.addEventListener("touchmove", onMove, { passive: true });

  // ---- WebGL ----------------------------------------------------------------
  var gl = null;
  try {
    gl = canvas.getContext("webgl", { antialias: false, alpha: false, depth: false }) ||
         canvas.getContext("experimental-webgl", { antialias: false, alpha: false, depth: false });
  } catch (err) { gl = null; }

  if (!gl) { startFallback(); return; }

  var VERT =
    "attribute vec2 a;void main(){gl_Position=vec4(a,0.0,1.0);}";

  var FRAG = [
    "precision highp float;",
    "uniform vec2 u_res;",
    "uniform vec2 u_mouse;",
    "uniform float u_time;",

    "float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}",

    "float noise(vec2 p){",
    "  vec2 i=floor(p),f=fract(p);",
    "  vec2 u=f*f*(3.0-2.0*f);",
    "  return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),u.x),",
    "             mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),u.x),u.y);",
    "}",

    // 5 octaves, rotating each one so the layers don't line up into grid artefacts
    "float fbm(vec2 p){",
    "  float v=0.0,a=0.5;",
    "  mat2 rot=mat2(0.80,0.60,-0.60,0.80);",
    "  for(int i=0;i<5;i++){v+=a*noise(p);p=rot*p*2.02;a*=0.5;}",
    "  return v;",
    "}",

    "void main(){",
    "  float s=min(u_res.x,u_res.y);",
    "  vec2 uv=(gl_FragCoord.xy-0.5*u_res)/s;",
    "  vec2 m=(u_mouse-0.5*u_res)/s;",

    "  float t=u_time*0.055;",

    // Bend space around the cursor: pull inward and swirl. Both fall off smoothly
    // to zero at the centre, so there is no singularity where the pointer sits.
    "  vec2 d=uv-m;",
    "  float dist=length(d);",
    "  float pull=exp(-dist*2.4);",
    "  float ang=pull*1.5;",
    "  float ca=cos(ang),sa=sin(ang);",
    "  vec2 rel=mat2(ca,-sa,sa,ca)*d;",
    "  vec2 p=m+rel*(1.0-0.42*pull);",

    // two rounds of domain warping -> the folding, liquid look
    "  vec2 q=vec2(fbm(p*2.3+t),fbm(p*2.3+vec2(5.2,1.3)-t));",
    "  vec2 r=vec2(fbm(p*2.3+3.6*q+vec2(1.7,9.2)+t*1.25),",
    "              fbm(p*2.3+3.6*q+vec2(8.3,2.8)-t*1.05));",
    "  float f=fbm(p*2.3+3.6*r);",

    "  vec3 base=vec3(0.031,0.027,0.078);",  // near-black indigo
    "  vec3 violet=vec3(0.267,0.129,0.545);",
    "  vec3 blue=vec3(0.114,0.267,0.694);",
    "  vec3 lilac=vec3(0.663,0.588,0.988);",

    // smoothstep instead of raw mixes -> real light and shadow, not a flat wash
    "  vec3 col=base;",
    "  col=mix(col,violet,smoothstep(0.22,0.80,f));",
    "  col=mix(col,blue,smoothstep(0.30,0.95,length(q)));",
    "  col=mix(col,lilac,pow(smoothstep(0.35,0.95,r.x),2.0)*0.85);",

    // bright filaments where the warp folds back on itself
    "  float fil=pow(smoothstep(0.55,1.0,length(r)),3.0);",
    "  col+=vec3(0.35,0.28,0.62)*fil*0.55;",

    // glow riding along with the cursor
    "  float glow=exp(-dist*2.6);",
    "  col+=vec3(0.34,0.24,0.62)*glow*0.55;",

    // vignette keeps the edges quiet so page text stays readable
    "  col*=1.0-0.42*dot(uv,uv);",

    // ordered dither: kills banding across these very low-contrast ramps
    "  float dth=(hash(gl_FragCoord.xy)-0.5)/255.0;",
    "  gl_FragColor=vec4(col+dth,1.0);",
    "}"
  ].join("\n");

  function compile(type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  var vs = compile(gl.VERTEX_SHADER, VERT);
  var fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) { startFallback(); return; }

  var prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { startFallback(); return; }
  gl.useProgram(prog);

  // one big triangle covering the viewport
  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, "a");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  var uRes = gl.getUniformLocation(prog, "u_res");
  var uMouse = gl.getUniformLocation(prog, "u_mouse");
  var uTime = gl.getUniformLocation(prog, "u_time");

  // The field is all soft gradients, so rendering well under 1 device pixel per
  // screen pixel is free quality-wise and keeps the fan quiet on laptops.
  var RES = 0.55;
  var w = 0, h = 0;

  function resize() {
    var cw = window.innerWidth, ch = window.innerHeight;
    var nw = Math.max(1, Math.floor(cw * RES));
    var nh = Math.max(1, Math.floor(ch * RES));
    if (nw === w && nh === h) return;
    w = nw; h = nh;
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
  }
  resize();
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", resize);

  var running = true;
  var dead = false;   // context lost for good; the CSS fallback has taken over

  // a dropped context would otherwise leave a black rectangle behind the text
  canvas.addEventListener("webglcontextlost", function (e) {
    e.preventDefault();
    running = false;
    dead = true;
    startFallback();
  });

  document.addEventListener("visibilitychange", function () {
    if (dead) return;
    running = !document.hidden;
    if (running) { last = performance.now(); requestAnimationFrame(frame); }
  });

  var t0 = performance.now();
  var last = t0;

  function frame(now) {
    if (!running) return;
    resize();

    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    // with no pointer around, wander on a slow Lissajous path
    if (idle && !reduced) {
      var a = (now - t0) / 1000;
      target.x = window.innerWidth * (0.5 + 0.28 * Math.cos(a * 0.21));
      target.y = window.innerHeight * (0.5 + 0.24 * Math.sin(a * 0.17));
    }

    // frame-rate independent easing -> the trailing feel is the same at 60 or 144Hz
    var k = 1 - Math.pow(0.001, dt);
    eased.x += (target.x - eased.x) * k;
    eased.y += (target.y - eased.y) * k;

    gl.uniform2f(uRes, w, h);
    // flip Y: CSS pixels grow downward, gl_FragCoord grows upward
    gl.uniform2f(uMouse, eased.x * RES, h - eased.y * RES);
    gl.uniform1f(uTime, reduced ? 0 : (now - t0) / 1000);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---- CSS fallback ---------------------------------------------------------
  // Uses its own element rather than the canvas, so it works both when WebGL was
  // never available and when a live context is lost mid-session.
  function startFallback() {
    if (document.getElementById("field-fallback")) return;
    // the canvas is opaque and paints over the fallback (same z-index, later in
    // tree order), so it has to go before the gradients can show
    canvas.style.display = "none";
    var el = document.createElement("div");
    el.id = "field-fallback";
    el.setAttribute("aria-hidden", "true");
    document.body.insertBefore(el, document.body.firstChild);
    if (reduced) return;
    window.addEventListener("pointermove", function (e) {
      el.style.setProperty("--mx", (e.clientX / window.innerWidth) * 100 + "%");
      el.style.setProperty("--my", (e.clientY / window.innerHeight) * 100 + "%");
    }, { passive: true });
  }
})();
