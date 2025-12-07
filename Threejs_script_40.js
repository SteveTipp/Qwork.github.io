



// Config 
const HALF_BITS = 5;                 // 5 per axis
const TOTAL_BITS = 2 * HALF_BITS;    // 10
const GRID = 1 << HALF_BITS;         // 32
const MOD = GRID;                    // 32

// Load JSON
async function loadQuantumData() {
  const res = await fetch('Shors_ECC_5_Bit_SingleQFT_RealOracle_0_Cancel.json');
  const data = await res.json();
  return data.counts;
}

// Three.js setup
const scene    = new THREE.Scene();
const camera   = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Controls & lighting
const controls = new THREE.OrbitControls(camera, renderer.domElement);
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(10, 10, 10);
scene.add(light);

// Camera
camera.position.set(0, 30, 60);
camera.lookAt(0, 0, 0);

// Globals
let mesh;
let redDots = [];
let time = 0;

// Helpers 
const pad10 = s => s.padStart(TOTAL_BITS, '0').slice(-TOTAL_BITS);
const rev   = s => s.split('').reverse().join('');     // mirror Python's bs[::-1]

// Parse into classical (a,b) and use those as display (u,v)
function parseEntries(counts) {
  const entries = [];
  for (const [bit, cRaw] of Object.entries(counts)) {
    const b10   = pad10(bit);
    const left  = b10.slice(0, HALF_BITS);    // raw left 5
    const right = b10.slice(HALF_BITS);       // raw right 5

    const a = parseInt(rev(right), 2);        // a = int(right[::-1], 2)
    const b = parseInt(rev(left),  2);        // b = int(left[::-1],  2)

    const u = a;
    const v = b;

    entries.push({ bit, a, b, u, v, count: Number(cRaw) });
  }
  return entries;
}

function buildMatrix(entries) {
  const matrix = Array.from({ length: GRID }, () => Array(GRID).fill(0));
  let maxCount = 0;
  for (const e of entries) {
    matrix[e.u][e.v] = e.count;
    if (e.count > maxCount) maxCount = e.count;
  }
  return { matrix, maxCount };
}

// Build surface + dots
function createWaveSurface(matrix, maxCount) {
  const WIDTH    = GRID * 2;
  const SEGMENTS = WIDTH;
  const STEP     = WIDTH / (GRID - 1);

  const geometry = new THREE.PlaneGeometry(WIDTH, WIDTH, SEGMENTS, SEGMENTS);
  const colors   = [];
  const gridX    = SEGMENTS + 1;
  const gridY    = SEGMENTS + 1;

  for (let y = 0; y < gridY; y++) {
    for (let x = 0; x < gridX; x++) {
      const color = new THREE.Color(0x00ff00); // uniform green mesh
      colors.push(color.r, color.g, color.b);
    }
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, wireframe: true });

  mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.userData   = { matrix, maxCount, GRID, STEP };
  scene.add(mesh);

  // Red dots at every (u,v)
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  for (let v = 0; v < GRID; v++) {
    for (let u = 0; u < GRID; u++) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), dotMat);
      dot.position.set(
        (u - (GRID - 1) / 2) * STEP,
        0,
        (v - (GRID - 1) / 2) * STEP
      );
      redDots.push(dot);
      scene.add(dot);
    }
  }
}

// Animate 
function animate() {
  requestAnimationFrame(animate);
  time += 0.2;
  if (!mesh) {
    renderer.render(scene, camera);
    return;
  }

  const { matrix, maxCount, GRID } = mesh.userData;
  const pos   = mesh.geometry.attributes.position;
  const gridX = mesh.geometry.parameters.widthSegments + 1;
  const gridY = mesh.geometry.parameters.heightSegments + 1;

  for (let i = 0; i < pos.count; i++) {
    const x = i % gridX;
    const y = Math.floor(i / gridX);
    const u = Math.floor(x / (gridX / GRID));
    const v = Math.floor(y / (gridY / GRID));
    const amp  = matrix[u]?.[v] ? matrix[u][v] / maxCount : 0;
    const wave = Math.sin((x + time) * 0.4) * Math.cos((y + time) * 0.4);
    pos.setZ(i, amp * wave * 20);
  }

  // Move dots with amplitude
  redDots.forEach((dot, idx) => {
    const u = idx % GRID;
    const v = Math.floor(idx / GRID);
    const amp = matrix[u]?.[v] ? matrix[u][v] / maxCount : 0;
    dot.position.y = amp * 20 + 0.5;
  });

  pos.needsUpdate = true;
  controls.update();
  renderer.render(scene, camera);
}

// Main 
loadQuantumData().then(counts => {
  const entries = parseEntries(counts);
  const { matrix, maxCount } = buildMatrix(entries);

  createWaveSurface(matrix, maxCount);
  animate();
});
