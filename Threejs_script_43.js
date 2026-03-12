

// Config
const HALF_BITS = 5;                 // 5 per axis
const TOTAL_BITS = 2 * HALF_BITS;    // 10
const GRID = 1 << HALF_BITS;         // 32
const MOD = GRID;                    // 32
const MAX_WAVE_HEIGHT = 20;          // same height scale used in animation
const PANEL_K = 7;
const TOP_POINTS_PER_PANEL = 8;
const PANEL_SIZE = 24;
const FLOW_SPEED = 0.78;
const FLOW_STRENGTH = 0.11;
const FLOW_FREQ_X = 0.55;
const FLOW_FREQ_Y = 0.48;

// Load JSON
async function loadQuantumData() {
  const res = await fetch('postprocessed_visualizer_result.json');
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
camera.position.set(0, 18, 30);
camera.lookAt(0, 6, 0);
controls.target.set(0, 6, 0);
controls.update();

// Globals
let mesh;
let redDots = [];
let whiteDots = [];
let time = 0;

// Helpers
const pad10 = s => s.padStart(TOTAL_BITS, '0').slice(-TOTAL_BITS);

// Parse into classical (a,b) and use those as display (u,v)
// Codex Reanalysis mapping:
// split into left/right 5-bit halves
// swap halves
// no bit reversal
function parseEntries(counts) {
  const entries = [];
  for (const [bit, cRaw] of Object.entries(counts)) {
    const b10   = pad10(bit);
    const left  = b10.slice(0, HALF_BITS);    // raw left 5
    const right = b10.slice(HALF_BITS);       // raw right 5

    // Swap halves, no reversal
    const a = parseInt(right, 2);
    const b = parseInt(left,  2);

    const u = a;
    const v = b;

    entries.push({ bit, a, b, u, v, count: Number(cRaw) });
  }
  return entries;
}

function buildMatrix(entries) {
  const matrix = Array.from({ length: GRID }, () => Array(GRID).fill(0));
  let maxCount = 0;
  let totalCount = 0;

  for (const e of entries) {
    matrix[e.u][e.v] += e.count;
    if (matrix[e.u][e.v] > maxCount) maxCount = matrix[e.u][e.v];
    totalCount += e.count;
  }

  const safeTotal = totalCount || 1;
  const probMatrix = Array.from({ length: GRID }, (_, a) =>
    Array.from({ length: GRID }, (_, b) => matrix[a][b] / safeTotal)
  );

  return { matrix, probMatrix, maxCount, totalCount: safeTotal };
}

function toroidalBoxSmooth3x3(gridProbs) {
  const smoothed = Array.from({ length: GRID }, () => Array(GRID).fill(0));

  for (let a = 0; a < GRID; a++) {
    for (let b = 0; b < GRID; b++) {
      let acc = 0;
      for (let da = -1; da <= 1; da++) {
        for (let db = -1; db <= 1; db++) {
          const aa = (a + da + GRID) % GRID;
          const bb = (b + db + GRID) % GRID;
          acc += gridProbs[aa][bb];
        }
      }
      smoothed[a][b] = acc / 9.0;
    }
  }

  return smoothed;
}

function ridgePointsForK(k) {
  const pts = [];
  for (let a = 0; a < GRID; a++) {
    for (let b = 0; b < GRID; b++) {
      if (((a + k * b) % MOD) === 0) {
        pts.push([a, b]);
      }
    }
  }
  return pts;
}

function weightedExactLineScore(gridProbs, k) {
  let s = 0;
  for (const [a, b] of ridgePointsForK(k)) {
    s += gridProbs[a][b] ** 2;
  }
  return s;
}

function colorFromValue(value, vmin, vmax) {
  const stops = [
    [0.0, [8, 6, 70]],
    [0.28, [20, 24, 130]],
    [0.52, [28, 90, 80]],
    [0.75, [0, 170, 70]],
    [1.0, [0, 255, 65]],
  ];

  let t = 0;
  if (vmax > vmin) {
    t = (value - vmin) / (vmax - vmin);
  }
  t = THREE.MathUtils.clamp(t, 0, 1);

  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (t >= t0 && t <= t1) {
      const u = (t1 === t0) ? 0 : (t - t0) / (t1 - t0);
      const r = Math.round(c0[0] + u * (c1[0] - c0[0]));
      const g = Math.round(c0[1] + u * (c1[1] - c0[1]));
      const b = Math.round(c0[2] + u * (c1[2] - c0[2]));
      return new THREE.Color(`rgb(${r},${g},${b})`);
    }
  }

  const [r, g, b] = stops[stops.length - 1][1];
  return new THREE.Color(`rgb(${r},${g},${b})`);
}

function buildRidgeInfo(smoothed) {
  const allValues = [];
  for (let a = 0; a < GRID; a++) {
    for (let b = 0; b < GRID; b++) {
      allValues.push(smoothed[a][b]);
    }
  }

  const vmin = Math.min(...allValues);
  const vmax = Math.max(...allValues);

  const ridge = ridgePointsForK(PANEL_K);
  const contribs = ridge
    .map(([a, b]) => [a, b, smoothed[a][b] ** 2])
    .sort((x, y) => y[2] - x[2]);

  return {
    vmin,
    vmax,
    ridge,
    top: contribs.slice(0, TOP_POINTS_PER_PANEL),
    score: weightedExactLineScore(smoothed, PANEL_K)
  };
}

// Build surface
function createWaveSurface(smoothed, ridgeMeta) {
  const geometry = new THREE.PlaneGeometry(PANEL_SIZE, PANEL_SIZE, GRID - 1, GRID - 1);
  const pos = geometry.attributes.position;
  const colors = [];
  const safeMax = Math.max(ridgeMeta.vmax || 0, 1e-12);
  const baseHeights = new Float32Array(pos.count);

  for (let i = 0; i < pos.count; i++) {
    const xIdx = i % GRID;
    const yIdx = Math.floor(i / GRID);

    const a = yIdx;
    const b = xIdx;

    const value = smoothed[a][b];
    const color = colorFromValue(value, ridgeMeta.vmin, ridgeMeta.vmax);
    const z = (value / safeMax) * MAX_WAVE_HEIGHT;

    pos.setZ(i, z);
    baseHeights[i] = z;
    colors.push(color.r, color.g, color.b);
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  pos.needsUpdate = true;

  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    wireframe: true
  });

  mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, 0, 0);
  mesh.userData = { ridgeMeta, baseHeights, safeMax };

  scene.add(mesh);

  // Red dots for all grid points
  const redDotGeo = new THREE.SphereGeometry(0.055, 6, 6);
  const redDotMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });

  for (let a = 0; a < GRID; a++) {
    for (let b = 0; b < GRID; b++) {
      const dot = new THREE.Mesh(redDotGeo, redDotMat);

      const x = ((b / (GRID - 1)) - 0.5) * PANEL_SIZE;
      const z = ((a / (GRID - 1)) - 0.5) * PANEL_SIZE;
      const baseY = (smoothed[a][b] / safeMax) * MAX_WAVE_HEIGHT;

      dot.position.set(x, baseY, z);
      dot.userData = { a, b, baseY };

      redDots.push(dot);
      scene.add(dot);
    }
  }

  // White dots on every exact ridge point for a + 7b ≡ 0 (mod 32)
  const whiteDotGeo = new THREE.SphereGeometry(0.07, 8, 8);
  const whiteDotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  for (const [a, b] of ridgeMeta.ridge) {
    const dot = new THREE.Mesh(whiteDotGeo, whiteDotMat);

    const x = ((b / (GRID - 1)) - 0.5) * PANEL_SIZE;
    const z = ((a / (GRID - 1)) - 0.5) * PANEL_SIZE;
    const baseY = (smoothed[a][b] / safeMax) * MAX_WAVE_HEIGHT;

    dot.position.set(x, baseY, z);
    dot.userData = { a, b, baseY };

    whiteDots.push(dot);
    scene.add(dot);
  }
}

// Animate
function animate() {
  requestAnimationFrame(animate);
  time += FLOW_SPEED * 0.01;

  if (!mesh) {
    renderer.render(scene, camera);
    return;
  }

  const pos = mesh.geometry.attributes.position;
  const baseHeights = mesh.userData.baseHeights;

  for (let i = 0; i < pos.count; i++) {
    const xIdx = i % GRID;
    const yIdx = Math.floor(i / GRID);

    const baseZ = baseHeights[i];
    const localAmp = baseZ / MAX_WAVE_HEIGHT;

    const flow =
      Math.sin(xIdx * FLOW_FREQ_X + time) *
      Math.cos(yIdx * FLOW_FREQ_Y + time * 0.85);

    const z = baseZ + flow * FLOW_STRENGTH * MAX_WAVE_HEIGHT * localAmp;
    pos.setZ(i, z);
  }

  // Keep red grid dots on the flowing surface
  redDots.forEach(dot => {
    const { a, b, baseY } = dot.userData;
    const localAmp = baseY / MAX_WAVE_HEIGHT;

    const flow =
      Math.sin(b * FLOW_FREQ_X + time) *
      Math.cos(a * FLOW_FREQ_Y + time * 0.85);

    dot.position.y = baseY + flow * FLOW_STRENGTH * MAX_WAVE_HEIGHT * localAmp;
  });

  // Keep white ridge dots on the flowing surface
  whiteDots.forEach(dot => {
    const { a, b, baseY } = dot.userData;
    const localAmp = baseY / MAX_WAVE_HEIGHT;

    const flow =
      Math.sin(b * FLOW_FREQ_X + time) *
      Math.cos(a * FLOW_FREQ_Y + time * 0.85);

    dot.position.y = baseY + flow * FLOW_STRENGTH * MAX_WAVE_HEIGHT * localAmp;
  });

  pos.needsUpdate = true;

  controls.update();
  renderer.render(scene, camera);
}

// Resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Main
loadQuantumData().then(counts => {
  const entries = parseEntries(counts);
  const { probMatrix } = buildMatrix(entries);
  const smoothed = toroidalBoxSmooth3x3(probMatrix);
  const ridgeMeta = buildRidgeInfo(smoothed);

  createWaveSurface(smoothed, ridgeMeta);
  animate();
});
