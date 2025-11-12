



// Config 
const HALF_BITS = 5;                 // 5 per axis
const TOTAL_BITS = 2 * HALF_BITS;    // 10
const GRID = 1 << HALF_BITS;         // 32
const MOD = GRID;                    // 32
const K = 7;                         // target k and ridge slope (u + K v ≡ 0 mod 32)
const TOP_N = 100;                   // classical top-100 window 

// Load JSON
async function loadQuantumData() {
  const res = await fetch('5_Bit_Idealized.json'); // or 5_Bit_Key_Empty.json, 5_Bit_Idealized.json, Shors_ECC_5_Bit_Key_0.json.
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
const rev   = s => s.split('').reverse().join('');     // mirror Python's bs[::-1]

// Parse into classical (a,b) and use those as display (u,v) to keep everything consistent
function parseEntries(counts) {
  const entries = [];
  for (const [bit, cRaw] of Object.entries(counts)) {
    const b10   = pad10(bit);
    const left  = b10.slice(0, HALF_BITS);    // raw left 5
    const right = b10.slice(HALF_BITS);       // raw right 5

    // Classical, matching Python:
    const a = parseInt(rev(right), 2);        // a = int(right[::-1], 2)
    const b = parseInt(rev(left),  2);        // b = int(left[::-1],  2)

    // Display coordinates 
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

// modular inverse for odd v modulo 2^n 
function invModPow2(v, nBits = 5) {
  if ((v & 1) === 0) return null;     // no inverse if even
  const mask = (1 << nBits) - 1;      // 0b11111
  let x = 1;
  for (let i = 0; i < nBits; i++) {
    x = (x * (2 - (v * x))) & mask;
  }
  return x & mask;
}

// Reproduce the circuits top 100 invertible (a,b) pairs and recovered k
function selectTop3ByClassical(counts, targetK = K, nBits = 5) {
  const MOD = 1 << nBits;
  const entries = parseEntries(counts);

  // Sort all by count (desc) - Python: top = sorted(..., reverse=True)
  const sortedAll = [...entries].sort((a,b)=> b.count - a.count);

  // Walk down, keep only invertible b, compute k, take first 100, then filter k==targetK
  const topInvertibles = [];
  for (const e of sortedAll) {
    if ((e.b & 1) === 0) continue;                 // gcd(b,32)!=1 -> skip
    const bInv = invModPow2(e.b, nBits);
    if (bInv == null) continue;
    const k = ((MOD - (e.a % MOD)) * bInv) % MOD;  // k ≡ -(a)*b^{-1} mod 32
    topInvertibles.push({ ...e, k });
    if (topInvertibles.length === TOP_N) break;    // mirror Python limit
  }

  // First three with k == targetK (already in count-desc order)
  const picks = topInvertibles.filter(e => e.k === targetK).slice(0, 3);

  console.log('Selected from classical top-100:', picks.map(e => ({
    a:e.a, b:e.b, k:e.k, count:e.count, pos:`(u=${e.u}, v=${e.v})`
  })));

  // Return (u,v) to highlight
  return new Set(picks.map(e => `${e.u},${e.v}`));
}

// Build surface + dots + highlights 
function createWaveSurface(matrix, maxCount, highlightSet) {
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

  // Yellow spheres at the classically selected (u,v)
  const hMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
  highlightSet.forEach(key => {
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
  const highlightSet = selectTop3ByClassical(counts, K, HALF_BITS);

  // Build surface from all counts using (u,v)
  const entries = parseEntries(counts);
  const { matrix, maxCount } = buildMatrix(entries);

  createWaveSurface(matrix, maxCount, highlightSet);
  animate();
});
