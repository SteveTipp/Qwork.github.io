// Robinson Congruence


// script.js
// Assumes Three.js & OrbitControls are loaded in your HTML.

let scene, camera, renderer, controls;
const flows = []; // { material, speed }

init();
animate();

function init() {
  // Scene & camera
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(
    60, window.innerWidth / window.innerHeight, 0.1, 500
  );
  camera.position.set(0, 20, 80);
  camera.lookAt(0, 0, 0);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  // Controls
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0); // 👈 Add this line
  controls.update();            // 👈 Add this too

  // Light
  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(10, 10, 10);
  scene.add(light);

  // Build the twistor tubes + flowing glow
  buildFlowTubes();

  window.addEventListener("resize", onWindowResize);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// The Robinson‐congruence field at t=0 (eq. 4.2 up to scale)
function robinsonField(x, y, z) {
  return new THREE.Vector3(
    2 * (y - x * z),
    -2 * (x + y * z),
    x*x + y*y - z*z - 1
  );
}

// One RK4 step
function rk4Step(p, h) {
  const k1 = robinsonField(p.x,p.y,p.z).multiplyScalar(h);
  const p2 = p.clone().addScaledVector(k1, 0.5);
  const k2 = robinsonField(p2.x,p2.y,p2.z).multiplyScalar(h);
  const p3 = p.clone().addScaledVector(k2, 0.5);
  const k3 = robinsonField(p3.x,p3.y,p3.z).multiplyScalar(h);
  const p4 = p.clone().add(k3);
  const k4 = robinsonField(p4.x,p4.y,p4.z).multiplyScalar(h);

  return p.clone().add(
    k1.addScaledVector(k2,2).addScaledVector(k3,2).add(k4).multiplyScalar(1/6)
  );
}

// Integrate closed loop: forward + backward
function integrateLoop(seed, h=0.05, steps=400) {
  const fwd = [], bwd = [];
  let p = seed.clone();
  for (let i=0; i<steps; i++){
    fwd.push(p.clone());
    p = rk4Step(p, +h);
  }
  p = seed.clone();
  for (let i=0; i<steps; i++){
    p = rk4Step(p, -h);
    bwd.push(p.clone());
  }
  return bwd.reverse().concat(fwd.slice(1));
}

// Build tubes + glow‐shader materials
function buildFlowTubes() {
  const radii   = [0.6, 1.0, 1.4, 1.8];
  const zLevels = [-0.8, -0.3, 0.3, 0.8];
  const nAngles = 24;
  const total   = radii.length * zLevels.length * nAngles;
  let idx = 0;

  // Simple HSL → RGB in GLSL
  const hsl2rgb = `
    vec3 hsl2rgb(vec3 c) {
      vec3 rgb = clamp(
        abs(mod(c.x*6. + vec3(0.,4.,2.), 6.) - 3.) - 1.,
        0., 1.
      );
      return c.z + c.y*(rgb - 0.5)*(1. - abs(2.*c.z - 1.));
    }
  `;

  // Vertex & fragment for flowing pulses
  const vertexShader = `
    varying vec2 vUv;
    void main(){
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.);
    }
  `;
  const fragmentShader = `
    uniform float time;
    uniform float hue;
    uniform float speed;
    varying vec2 vUv;
    ${hsl2rgb}
    void main(){
      // repeat 5 pulses per loop
      float pct = fract(vUv.y*5. - time*speed);
      // narrow Gaussian-ish pulse
      float glow = smoothstep(0.48, 0.5, pct) - smoothstep(0.5, 0.52, pct);
      vec3 col = hsl2rgb(vec3(hue,1.0,0.5));
      gl_FragColor = vec4(col*glow, glow);
    }
  `;

  for (const r of radii) {
    for (const z of zLevels) {
      for (let a=0; a<nAngles; a++) {
        const θ = (a/nAngles)*Math.PI*2;
        const seed = new THREE.Vector3(
          r*Math.cos(θ),
          r*Math.sin(θ),
          z
        );
        const pts = integrateLoop(seed);
        const curve = new THREE.CatmullRomCurve3(pts, true);

        // Tube geometry (UVs along length)
        const geo = new THREE.TubeGeometry(curve, 600, 0.04, 8, true);

        // Flow‐shader material
        const hue = idx/total;
        const mat = new THREE.ShaderMaterial({
          uniforms: {
            time:  { value: 0 },
            hue:   { value: hue },
            speed: { value: 0.3 + 0.2*Math.random() }
          },
          vertexShader,
          fragmentShader,
          transparent: true,
          side: THREE.DoubleSide,
          depthWrite: false
        });

        // Mesh and store its material for animation
        scene.add(new THREE.Mesh(geo, mat));
        flows.push({ material: mat });

        idx++;
      }
    }
  }
}

function animate() {
  requestAnimationFrame(animate);

  // Advance each shader’s time → makes pulses flow
  for (const obj of flows) {
    obj.material.uniforms.time.value += 0.01;
  }

  controls.update();
  renderer.render(scene, camera);
}


