// Robinson Congruence

let scene, camera, renderer, controls;
const flows = [];
let container;

init();
animate();

function init() {
  // Find the container this script was injected into
  container = document.currentScript.closest('.visual-container') || document.body;

  // Scene & camera
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
  camera.position.set(0, 2, 10);
  camera.lookAt(0, 0, 0);

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  // Initial sizing
  resizeRendererToContainer();

  // Resize observer (dynamic, works on mobile too)
  new ResizeObserver(resizeRendererToContainer).observe(container);
  window.addEventListener("resize", resizeRendererToContainer);

  // Controls
  controls = new THREE.OrbitControls(camera, renderer.domElement);

  // Light
  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(10, 10, 10);
  scene.add(light);

  // Build the twistor tubes
  buildFlowTubes();
}

function resizeRendererToContainer() {
  if (!container) return;
  const width = container.clientWidth;
  const height = container.clientHeight;
  renderer.setSize(width, height, false); // don't auto-adjust canvas style
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function robinsonField(x, y, z) {
  return new THREE.Vector3(
    2 * (y - x * z),
    -2 * (x + y * z),
    x * x + y * y - z * z - 1
  );
}

function rk4Step(p, h) {
  const k1 = robinsonField(p.x, p.y, p.z).multiplyScalar(h);
  const p2 = p.clone().addScaledVector(k1, 0.5);
  const k2 = robinsonField(p2.x, p2.y, p2.z).multiplyScalar(h);
  const p3 = p.clone().addScaledVector(k2, 0.5);
  const k3 = robinsonField(p3.x, p3.y, p3.z).multiplyScalar(h);
  const p4 = p.clone().add(k3);
  const k4 = robinsonField(p4.x, p4.y, p4.z).multiplyScalar(h);

  return p.clone().add(
    k1.addScaledVector(k2, 2).addScaledVector(k3, 2).add(k4).multiplyScalar(1 / 6)
  );
}

function integrateLoop(seed, h = 0.05, steps = 400) {
  const fwd = [], bwd = [];
  let p = seed.clone();
  for (let i = 0; i < steps; i++) {
    fwd.push(p.clone());
    p = rk4Step(p, +h);
  }
  p = seed.clone();
  for (let i = 0; i < steps; i++) {
    p = rk4Step(p, -h);
    bwd.push(p.clone());
  }
  return bwd.reverse().concat(fwd.slice(1));
}

function buildFlowTubes() {
  const radii = [0.6, 1.0, 1.4, 1.8];
  const zLevels = [-0.8, -0.3, 0.3, 0.8];
  const nAngles = 24;
  const total = radii.length * zLevels.length * nAngles;
  let idx = 0;

  const hsl2rgb = `
    vec3 hsl2rgb(vec3 c) {
      vec3 rgb = clamp(
        abs(mod(c.x*6. + vec3(0.,4.,2.), 6.) - 3.) - 1.,
        0., 1.
      );
      return c.z + c.y*(rgb - 0.5)*(1. - abs(2.*c.z - 1.));
    }
  `;

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
      float pct = fract(vUv.y*5. - time*speed);
      float glow = smoothstep(0.48, 0.5, pct) - smoothstep(0.5, 0.52, pct);
      vec3 col = hsl2rgb(vec3(hue,1.0,0.5));
      gl_FragColor = vec4(col*glow, glow);
    }
  `;

  for (const r of radii) {
    for (const z of zLevels) {
      for (let a = 0; a < nAngles; a++) {
        const θ = (a / nAngles) * Math.PI * 2;
        const seed = new THREE.Vector3(
          r * Math.cos(θ),
          r * Math.sin(θ),
          z
        );
        const pts = integrateLoop(seed);
        const curve = new THREE.CatmullRomCurve3(pts, true);

        const geo = new THREE.TubeGeometry(curve, 600, 0.04, 8, true);
        const hue = idx / total;

        const mat = new THREE.ShaderMaterial({
          uniforms: {
            time: { value: 0 },
            hue: { value: hue },
            speed: { value: 0.3 + 0.2 * Math.random() }
          },
          vertexShader,
          fragmentShader,
          transparent: true,
          side: THREE.DoubleSide,
          depthWrite: false
        });

        scene.add(new THREE.Mesh(geo, mat));
        flows.push({ material: mat });
        idx++;
      }
    }
  }
}

function animate() {
  requestAnimationFrame(animate);
  for (const obj of flows) {
    obj.material.uniforms.time.value += 0.01;
  }
  controls.update();
  renderer.render(scene, camera);
}
