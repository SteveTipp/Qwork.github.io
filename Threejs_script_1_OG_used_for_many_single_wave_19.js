
//   script.js  
/* global THREE, fetch, window */

//   PARAMETERS  
const JSON_PATH  = 'Dyn_Twistor_Casimir_10x10_0.json';   // run data
const GRID       = 10;          // 10 × 10 lattice
const SPACING    = 2.0;         // physical width of one cell
const SEGMENTS   = 64;          // plane resolution
const BASE_COLOR = 0x00ff00;    // wire‑frame green
const MAX_ORB_R  = 0.6;         // max red‑orb radius
const MAX_ORB_H  = 4.0;         // max orb hover height

//   THREE.JS SET‑UP 
const scene    = new THREE.Scene();
const camera   = new THREE.PerspectiveCamera(
  75, window.innerWidth / window.innerHeight, 0.1, 1000
);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
const light    = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(10, 15, 10);
scene.add(light);

camera.position.set(0, 12, 22);
camera.lookAt(0, 0, 0);

//   GLOBALS 
let waveMesh;
let pairAmps = [];       // ρ_c normalised 0‒1 for 10 columns
let time     = 0;

//   BUILD WAVE + ORBS 
function createVisuals(pairRates) {
  //  green wire‑frame plane 
  const size = GRID * SPACING;
  const geo  = new THREE.PlaneGeometry(size, size, SEGMENTS, SEGMENTS);
  const mat  = new THREE.MeshStandardMaterial({
    color: BASE_COLOR,
    wireframe: true,
    side: THREE.DoubleSide
  });
  waveMesh = new THREE.Mesh(geo, mat);
  waveMesh.rotation.x = -Math.PI / 2;
  scene.add(waveMesh);

  //  normalise ρ_c 
  const ρvals = Object.values(pairRates);
  const ρmax  = Math.max(...ρvals, 1e-6);
  for (let c = 0; c < GRID; c++) {
    pairAmps[c] = (pairRates[c.toString()] || 0) / ρmax;
  }

  //  glowing red “orbs” 
  const orbGroup = new THREE.Group();
  const orbMat   = new THREE.MeshBasicMaterial({ color: 0xff0000 });

  for (let c = 0; c < GRID; c++) {
    const amp   = pairAmps[c];
    const radius = 0.15 + amp * MAX_ORB_R;        // min radius so even dim columns visible
    const height = 0.5 + amp * MAX_ORB_H;         // hover height above plane centre

    const orbGeo = new THREE.SphereGeometry(radius, 16, 16);
    const orb    = new THREE.Mesh(orbGeo, orbMat);
    orb.position.set(
      (c - (GRID - 1) / 2) * SPACING,   // x: centre of column
      height,
      (GRID / 2) * SPACING + 0.5        // z: just behind back row
    );
    orbGroup.add(orb);
  }
  scene.add(orbGroup);
}

//   ANIMATE LOOP 
function animate() {
  requestAnimationFrame(animate);
  time += 0.05;

  if (waveMesh) {
    const pos  = waveMesh.geometry.attributes.position;
    const half = (GRID * SPACING) / 2;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);

      // column index 0‒9
      const col = Math.floor((x + half) / SPACING);
      const amp = pairAmps[col] || 0;

      // standing‑wave modulated by ρ_c
      const z = amp * Math.sin(x + time) * Math.cos(y + time);
      pos.setZ(i, z);
    }
    pos.needsUpdate = true;
  }

  controls.update();
  renderer.render(scene, camera);
}

//   MAIN 
(async () => {
  try {
    const res  = await fetch(JSON_PATH);
    const data = await res.json();
    createVisuals(data.boundary_pair_rates);
    animate();
  } catch (err) {
    console.error(`Couldn’t load ${JSON_PATH}:`, err);
  }
})();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
