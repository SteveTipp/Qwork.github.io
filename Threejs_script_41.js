


// Config
const HALF_BITS  = 5;                 // 5 per axis
const TOTAL_BITS = 2 * HALF_BITS;     // 10
const GRID       = 1 << HALF_BITS;    // 32
const MOD        = GRID;              // 32

// Nonlocal Ridge Encryption params 
const K_PRIME  = 19;                  // cipher slope (attacker sees) k'
const R_MASK   = 6;                   // one-time mask r
const K_SECRET = ((K_PRIME - R_MASK) % MOD + MOD) % MOD; // 13

// Load JSON
async function loadQuantumData() {
  const res  = await fetch('Nonlocal_Ridge_Encryption_n5_0.json'); 
  const data = await res.json();
  return data.counts; // bitstring -> count
}

// Three.js setup
const scene    = new THREE.Scene();
const camera   = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Controls and lighting
const controls = new THREE.OrbitControls(camera, renderer.domElement);
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(10, 10, 10);
scene.add(light);

// Camera
camera.position.set(0, 30, 60);
camera.lookAt(0, 0, 0);

// Globals
let mesh;
let dots = [];
let time = 0;

// Helpers
const padN = (s, n) => s.padStart(n, '0').slice(-n);
const rev  = s => s.split('').reverse().join(''); // mirror Python's bs[::-1]
const mod  = (x, m) => ((x % m) + m) % m;

// Parse into classical (a,b) matching Python bit ordering
function parseEntries(counts) {
  const entries = [];
  for (const [bit, cRaw] of Object.entries(counts)) {
    const b10 = padN(String(bit).replace(/\s+/g, ""), TOTAL_BITS);
    const left  = b10.slice(0, HALF_BITS);    // raw left 5
    const right = b10.slice(HALF_BITS);       // raw right 5

    // Python mapping: a = int(right[::-1],2), b = int(left[::-1],2)
    const a = parseInt(rev(right), 2);
    const b = parseInt(rev(left),  2);

    entries.push({ bit, a, b, count: Number(cRaw) });
  }
  return entries;
}

// Build matrix as heat[a][b] (rows=a, cols=b) 
function buildHeat(entries) {
  const heat = Array.from({ length: GRID }, () => Array(GRID).fill(0));
  let maxCount = 0;
  for (const e of entries) {
    heat[e.a][e.b] = e.count;
    if (e.count > maxCount) maxCount = e.count;
  }
  return { heat, maxCount };
}

// Build surface and dots 
function createWaveSurface(heat, maxCount) {
  const WIDTH    = GRID * 2;
  const SEGMENTS = WIDTH;
  const STEP     = WIDTH / (GRID - 1);

  const geometry = new THREE.PlaneGeometry(WIDTH, WIDTH, SEGMENTS, SEGMENTS);
  const colors   = [];
  const gridX    = SEGMENTS + 1;
  const gridY    = SEGMENTS + 1;

  for (let y = 0; y < gridY; y++) {
    for (let x = 0; x < gridX; x++) {
      // Map geometry samples -> discrete lattice. x-axis = b (cols), y-axis = a (rows)
      const b = Math.min(GRID - 1, Math.floor(x / (gridX / GRID)));
      const a = Math.min(GRID - 1, Math.floor(y / (gridY / GRID)));

      const c   = heat[a]?.[b] ?? 0;
      const amp = maxCount > 0 ? (c / maxCount) : 0;

      // Ridge: a ≡ k' * b (mod 32) 
      const isRidge = mod(a - (K_PRIME * b), MOD) === 0;

      // Ridge lattice points
      const color = isRidge
        ? new THREE.Color(0x0000ff) // ridge cells (blue)
        : new THREE.Color(0x00ff00); // background (green)

      colors.push(color.r, color.g, color.b);
    }
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, wireframe: true });

  mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;

  // Store for animation
  mesh.userData = { heat, maxCount, GRID, STEP, gridX, gridY };
  scene.add(mesh);

  // Red dots ONLY where count > 0 
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  for (let a = 0; a < GRID; a++) {
    for (let b = 0; b < GRID; b++) {
      const c = heat[a][b];
      if (!c || c <= 0) continue;

      const amp = maxCount > 0 ? (c / maxCount) : 0;

      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 10), dotMat);
      dot.userData = { a, b, amp };

      // x=b, z=a 
      dot.position.set(
        (b - (GRID - 1) / 2) * STEP,
        amp * 20 + 0.6,
        (a - (GRID - 1) / 2) * STEP
      );

      dots.push(dot);
      scene.add(dot);
    }
  }

  console.log(`Nonlocal Ridge Encryption: k'=${K_PRIME}, r=${R_MASK}, k=${K_SECRET}`);
}

// Animate
function animate() {
  requestAnimationFrame(animate);
  time += 0.2;
  if (!mesh) return;

  const { heat, maxCount, GRID, gridX, gridY } = mesh.userData;
  const pos = mesh.geometry.attributes.position;

  for (let i = 0; i < pos.count; i++) {
    const x = i % gridX;
    const y = Math.floor(i / gridX);

    const b = Math.min(GRID - 1, Math.floor(x / (gridX / GRID)));
    const a = Math.min(GRID - 1, Math.floor(y / (gridY / GRID)));

    const c   = heat[a]?.[b] ?? 0;
    const amp = maxCount > 0 ? (c / maxCount) : 0;

    // Wave motion
    const wave = Math.sin((x + time) * 0.4) * Math.cos((y + time) * 0.4);
    pos.setZ(i, amp * wave * 20);
  }

  // Keep dots floating at their amplitude height 
  dots.forEach(dot => {
    dot.position.y = dot.userData.amp * 20 + 0.6;
  });

  pos.needsUpdate = true;
  controls.update();
  renderer.render(scene, camera);
}

// Main
loadQuantumData().then(counts => {
  const entries = parseEntries(counts);
  const { heat, maxCount } = buildHeat(entries);

  createWaveSurface(heat, maxCount);
  animate();
});
