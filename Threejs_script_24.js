


// 6_bit_ECC_break_visual_Interference_Repeat.js
// Config 
const HALF_BITS   = 6;                 // 6 per axis
const TOTAL_BITS  = 2 * HALF_BITS;     // 12
const GRID        = 1 << HALF_BITS;    // 64
const MOD         = GRID;              // 64
const K           = 42;                // ridge slope (u + K v ≡ 0 mod 64)
const TOP_N       = 100;               // global top N to consider

// Load JSON
async function loadQuantumData() {
  const res  = await fetch('Shors_ECC_6_Bit_Key_0.json');
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
const light    = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(10, 10, 10);
scene.add(light);

// Camera
camera.position.set(0, 40, 75);
camera.lookAt(0, 0, 0);

// Globals
let mesh;
let redDots = [];
let highlightSpheres = [];
let time = 0;

// Helpers 
const padBits = s => s.padStart(TOTAL_BITS, '0').slice(-TOTAL_BITS);
const rev     = s => s.split('').reverse().join(''); 

// Build uses raw halves 
function parseEntries(counts) {
  const entries = [];
  for (const [bit, c] of Object.entries(counts)) {
    const b = padBits(bit);
    const v = parseInt(b.slice(0, HALF_BITS), 2);     // left 6 bits -> display v
    const u = parseInt(b.slice(HALF_BITS),    2);     // right 6 bits -> display u
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

// modular inverse for odd v modulo 2^n via Newton iteration
function invModPow2(v, nBits = HALF_BITS) {
  if ((v & 1) === 0) return null;
  const mask = (1 << nBits) - 1;
  let x = 1;
  for (let i = 0; i < nBits; i++) x = (x * (2 - (v * x))) & mask;
  return x & mask;
}

// Parse into classical (a,b) 
function parseEntriesClassical(counts, nBits = HALF_BITS) {
  const TOTAL = 2 * nBits;
  const out   = [];
  for (const [bit, cRaw] of Object.entries(counts)) {
    const bN    = bit.padStart(TOTAL, '0').slice(-TOTAL);
    const left  = bN.slice(0, nBits);
    const right = bN.slice(nBits);
    const a = parseInt(rev(right), 2); // a = int(right[::-1], 2)
    const b = parseInt(rev(left),  2); // b = int(left[::-1],  2)
    out.push({ a, b, count: Number(cRaw) });
  }
  return out;
}

// Return a Set of "u,v" strings where (u,v) = (a,b) for placement
function selectTop3ByClassical_identity(counts, targetK = K, nBits = HALF_BITS) {
  const MOD = 1 << nBits;
  const classical = parseEntriesClassical(counts, nBits);

  // Sort all by count (desc), then walk to collect invertible b
  const sortedAll = [...classical].sort((x, y) => y.count - x.count);

  const topInvertibles = [];
  for (const e of sortedAll) {
    if ((e.b & 1) === 0) continue;     // keep only invertible b (odd)
    const bInv = invModPow2(e.b, nBits);
    if (bInv == null) continue;
    const k = ((MOD - (e.a % MOD)) * bInv) % MOD;  // k ≡ −a·b⁻¹ (mod 2^n)
    topInvertibles.push({ ...e, k });
    if (topInvertibles.length === TOP_N) break;
  }

  // First three with k == targetK (already count-desc)
  const picks = topInvertibles.filter(e => e.k === targetK).slice(0, 3);

  // Place at (u,v) = (a,b) directly 
  const uvKeys = new Set(picks.map(e => `${e.a},${e.b}`));
  console.log('Top-3 (a,b) chosen; placing at (u,v)=(a,b):', [...uvKeys]);
  return uvKeys;
}

// Build surface + dots + highlights 
function createWaveSurface(matrix, maxCount, ridgeTopSet) {
  const WIDTH    = GRID * 2;     // visual (Interference) repeat 
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
        : new THREE.Color(0x00ff00); // grid (green)
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

  // Yellow spheres 
  const hMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
  ridgeTopSet.forEach(key => {
    const [uStr, vStr] = key.split(',');
    const u = parseInt(uStr, 10);
    const v = parseInt(vStr, 10);

    if (!matrix[u] || !isFinite(matrix[u][v]) || matrix[u][v] <= 0) return;
    const amp = matrix[u][v] / maxCount;
    if (!isFinite(amp) || amp <= 0) return;

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

  if (highlightSpheres.length === 0) {
    console.log("No valid highlights found - skipping yellow spheres.");
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
  const ridgeTopSet = selectTop3ByClassical_identity(counts, K, HALF_BITS);

  // Build surface from all counts with files mapping (raw halves -> u,v)
  const entries = parseEntries(counts);
  const { matrix, maxCount } = buildMatrix(entries);

  createWaveSurface(matrix, maxCount, ridgeTopSet);
  animate();
});
