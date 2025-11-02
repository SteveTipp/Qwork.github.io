

// Updated to highlight the top three states with yellow spheres
// Config 
const HALF_BITS = 5;                 // 5 per axis
const TOTAL_BITS = 2 * HALF_BITS;    // 10
const GRID = 1 << HALF_BITS;         // 32
const MOD = GRID;                    // 32
const K = 7;                         // ridge slope (u + K v ≡ 0 mod 32)
const TOP_N = 100;                   // global top N to consider

// Load JSON
async function loadQuantumData() {
  const res = await fetch('Shors_ECC_5_Bit_Key_0.json'); // or 5_Bit_Key_Empty.json.    Shors_ECC_5_Bit_Key_0.json.     5_Bit_Key_Perfect.json.
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
let highlightSpheres = [];
let time = 0;

// Helpers 
const pad10 = s => s.padStart(TOTAL_BITS, '0').slice(-TOTAL_BITS);

// returns array of {bit, padded, u, v, count}
function parseEntries(counts) {
  const entries = [];
  for (const [bit, c] of Object.entries(counts)) {
    const b = pad10(bit);
    const v = parseInt(b.slice(0, HALF_BITS), 2);     // left 5 bits
    const u = parseInt(b.slice(HALF_BITS),    2);     // right 5 bits
    entries.push({ bit, padded: b, u, v, count: Number(c) });
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

// Ridge entries within the global top-N, then keep the top 3 by count
function ridgeTop3FromGlobalTopN(counts, K = 7, N = 100) {
  const entries = parseEntries(counts);

  const topGlobal = entries.sort((a, b) => b.count - a.count).slice(0, N);
  const ridgeInTop = topGlobal.filter(e => ((e.u + K * e.v) % MOD) === 0);

  // Deduplicate by (u,v) in case of variant keys; keep the highest count per (u,v)
  const bestPerUV = new Map();
  for (const e of ridgeInTop) {
    const key = `${e.u},${e.v}`;
    const prev = bestPerUV.get(key);
    if (!prev || e.count > prev.count) bestPerUV.set(key, e);
  }

  const top3 = [...bestPerUV.values()].sort((a, b) => b.count - a.count).slice(0, 3);
  console.log('Selected ridge top-3 within global top-100:', top3);
  return new Set(top3.map(e => `${e.u},${e.v}`));
}

// Build surface + dots + highlights 
function createWaveSurface(matrix, maxCount, ridgeTopSet) {
  const WIDTH    = GRID * 2;            
  const SEGMENTS = WIDTH;
  const STEP     = WIDTH / (GRID - 1);

  const geometry = new THREE.PlaneGeometry(WIDTH, WIDTH, SEGMENTS, SEGMENTS);
  const colors   = [];
  const gridX    = SEGMENTS + 1;
  const gridY    = SEGMENTS + 1;

  const threshold = 0.1;
  for (let y = 0; y < gridY; y++) {
    for (let x = 0; x < gridX; x++) {
      const u = Math.floor(x / (gridX / GRID));
      const v = Math.floor(y / (gridY / GRID));
      const amp = matrix[u]?.[v] ? matrix[u][v] / maxCount : 0;
      const isRidge = ((u + K * v) % MOD) === 0;

      const color = (isRidge && amp > threshold)
        ? new THREE.Color(0x0000ff) // ridge cells (blue)
        : new THREE.Color(0x00ff00); // default grid (green)
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

  // Yellow spheres (updated to show no yellow spheres when no keys are found or empty json)
const hMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
ridgeTopSet.forEach(key => {
  const [uStr, vStr] = key.split(',');
  const u = parseInt(uStr, 10);
  const v = parseInt(vStr, 10);

  // Skip if matrix entry is missing or amplitude is zero / invalid
  if (!matrix[u] || !isFinite(matrix[u][v]) || matrix[u][v] <= 0) return;

  const amp = matrix[u][v] / maxCount;
  if (!isFinite(amp) || amp <= 0) return; // second layer of safety

  const sph = new THREE.Mesh(new THREE.SphereGeometry(0.8, 20, 20), hMat);
  sph.position.set(
    (u - (GRID - 1) / 2) * STEP,
    amp * 20 + 1.0,
    (v - (GRID - 1) / 2) * STEP
  );
  sph.userData = { u, v };
  highlightSpheres.push(sph);
  scene.add(sph);
});

// If no valid highlights found, clear list & log message
if (highlightSpheres.length === 0) {
  console.log("No valid ridge highlights found — skipping yellow spheres.");
}
}

// Animate 
function animate() {
  requestAnimationFrame(animate);
  time += 0.2;
  if (!mesh) return;

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

  // Move dots/spheres with amplitude
  redDots.forEach((dot, idx) => {
    const u = idx % GRID;
    const v = Math.floor(idx / GRID);
    const amp = matrix[u]?.[v] ? matrix[u][v] / maxCount : 0;
    dot.position.y = amp * 20 + 0.5;
  });

  highlightSpheres.forEach(sph => {
    const { u, v } = sph.userData;
    const amp = matrix[u]?.[v] ? matrix[u][v] / maxCount : 0;
    sph.position.y = amp * 20 + 1.0;
  });

  pos.needsUpdate = true;
  controls.update();
  renderer.render(scene, camera);
}

// Main 
loadQuantumData().then(counts => {
  // select exactly three ridge states within the global top-100
  const ridgeTopSet = ridgeTop3FromGlobalTopN(counts, K, TOP_N);

  // build surface from all counts
  const entries = parseEntries(counts);
  const { matrix, maxCount } = buildMatrix(entries);

  createWaveSurface(matrix, maxCount, ridgeTopSet);
  animate();
});

