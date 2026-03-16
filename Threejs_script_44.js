

// Config
const HALF_BITS = 6;                 // 6 per axis
const TOTAL_BITS = 2 * HALF_BITS;    // 12
const GRID = 1 << HALF_BITS;         // 64
const MOD = GRID;                    // 64
const MAX_WAVE_HEIGHT = 20;
const MIN_SECTOR_WAVE_HEIGHT = 0.8;  // low floor inside the active sector
const PANEL_K = 42;                  // true key ridge for Method 6 visual
const TOP_POINTS_PER_PANEL = 8;
const PANEL_SIZE = 24;
const FLOW_SPEED = 0.78;
const FLOW_STRENGTH = 0.11;
const FLOW_FREQ_X = 0.55;
const FLOW_FREQ_Y = 0.48;

// build a connected display surface from the sparse Method 6 grid
const CONNECTED_SURFACE_BLUR_PASSES = 14;
const OUTSIDE_SECTOR_ATTENUATION = 0.92;

// Load JSON
async function loadQuantumData() {
  const res = await fetch('Shors_ECC_6_Bit_Key_0_Method6_Postprocessed.json');
  const data = await res.json();
  return data;
}

// Three.js setup
const scene    = new THREE.Scene();
const camera   = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMappingExposure = 1.9;
document.body.appendChild(renderer.domElement);

// Controls & lighting
const controls = new THREE.OrbitControls(camera, renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xffffff, 2.25);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x506070, 1.9);
hemiLight.position.set(0, 30, 0);
scene.add(hemiLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
keyLight.position.set(10, 16, 12);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xffffff, 1.6);
fillLight.position.set(-12, 10, 8);
scene.add(fillLight);

const rimLight = new THREE.PointLight(0xffffff, 1.8, 140);
rimLight.position.set(0, 20, -10);
scene.add(rimLight);

const frontLight = new THREE.PointLight(0xffffff, 1.35, 160);
frontLight.position.set(0, 12, 22);
scene.add(frontLight);

// Camera
camera.position.set(0, 18, 30);
camera.lookAt(0, 6, 0);
controls.target.set(0, 6, 0);
controls.update();

// Globals
let mesh;
let redDots = [];
let whiteDots = [];
let whiteGlows = [];
let time = 0;

// Helpers
const padBits = s => s.padStart(TOTAL_BITS, '0').slice(-TOTAL_BITS);

function makeGlowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2
  );

  g.addColorStop(0.0, 'rgba(255,255,255,1.0)');
  g.addColorStop(0.22, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  g.addColorStop(0.72, 'rgba(255,255,255,0.12)');
  g.addColorStop(1.0, 'rgba(255,255,255,0.0)');

  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

const glowTexture = makeGlowTexture();

// Parse into classical (a,b) and use those as display (u,v)
// 6-bit recommended mapping:
// split left/right 6-bit halves
// reverse each half
// no swap
function parseEntries(counts) {
  const entries = [];
  for (const [bit, cRaw] of Object.entries(counts)) {
    const b12   = padBits(bit);
    const left  = b12.slice(0, HALF_BITS);
    const right = b12.slice(HALF_BITS);

    const a = parseInt(left.split('').reverse().join(''), 2);
    const b = parseInt(right.split('').reverse().join(''), 2);

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

function inEvenOddSector(a, b) {
  return (a % 2 === 0) && (b % 2 === 1);
}

function quantileFromSorted(values, q) {
  if (!values.length) return 0;
  const idx = Math.min(values.length - 1, Math.max(0, Math.round(q * (values.length - 1))));
  return values[idx];
}

// Method 4 helper: capped-weight even-odd sector grid
function cappedEvenOddSectorGrid(smoothed) {
  const weights = [];
  for (let a = 0; a < GRID; a++) {
    for (let b = 0; b < GRID; b++) {
      if (inEvenOddSector(a, b)) {
        const w = smoothed[a][b] ** 2;
        if (w > 0) weights.push(w);
      }
    }
  }

  weights.sort((x, y) => x - y);
  const capWeight = quantileFromSorted(weights, 0.90);

  const capped = Array.from({ length: GRID }, () => Array(GRID).fill(0));
  for (let a = 0; a < GRID; a++) {
    for (let b = 0; b < GRID; b++) {
      if (!inEvenOddSector(a, b)) continue;
      capped[a][b] = Math.min(smoothed[a][b] ** 2, capWeight);
    }
  }

  return { capped, capWeight };
}

// Method 6 processed grid:
// toroidal smoothing -> even-odd sector -> cap p^2 at q90 -> subtract row mean -> clip at 0
function rowCenteredEvenOddPositiveResidualGrid(smoothed) {
  const { capped, capWeight } = cappedEvenOddSectorGrid(smoothed);
  const processed = Array.from({ length: GRID }, () => Array(GRID).fill(0));

  for (let a = 0; a < GRID; a += 2) {
    let rowSum = 0;
    let rowCount = 0;
    for (let b = 1; b < GRID; b += 2) {
      rowSum += capped[a][b];
      rowCount += 1;
    }
    const rowMean = rowCount ? rowSum / rowCount : 0;

    for (let b = 1; b < GRID; b += 2) {
      processed[a][b] = Math.max(capped[a][b] - rowMean, 0);
    }
  }

  return { processed, capWeight };
}

function extractProcessedGrid(data) {
  const processedRep = data.processed_representation || {};

  if (Array.isArray(processedRep.grid_values) && processedRep.grid_values.length === GRID) {
    return processedRep.grid_values;
  }

  if (Array.isArray(data.grid_values) && data.grid_values.length === GRID) {
    return data.grid_values;
  }

  if (processedRep.nonzero_cell_table && Array.isArray(processedRep.nonzero_cell_table)) {
    const grid = Array.from({ length: GRID }, () => Array(GRID).fill(0));
    for (const row of processedRep.nonzero_cell_table) {
      const a = Number(row.a);
      const b = Number(row.b);
      const value =
        Number(row.processed_value ?? row.value ?? row.grid_value ?? row.weight ?? 0);
      if (
        Number.isFinite(a) && Number.isFinite(b) &&
        a >= 0 && a < GRID && b >= 0 && b < GRID
      ) {
        grid[a][b] = value;
      }
    }
    return grid;
  }

  if (data.counts && typeof data.counts === 'object') {
    const entries = parseEntries(data.counts);
    const { probMatrix } = buildMatrix(entries);
    const smoothed = toroidalBoxSmooth3x3(probMatrix);
    const { processed } = rowCenteredEvenOddPositiveResidualGrid(smoothed);
    return processed;
  }

  throw new Error('Could not extract Method 6 processed grid from JSON.');
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

// Method 6 exact-line score uses the already-processed grid values directly
function processedExactLineScore(processedGrid, k) {
  let s = 0;
  for (const [a, b] of ridgePointsForK(k)) {
    s += processedGrid[a][b];
  }
  return s;
}

function colorFromValue(value, vmin, vmax) {
  const stops = [
    [0.0, [18, 16, 110]],
    [0.28, [40, 56, 190]],
    [0.52, [40, 145, 120]],
    [0.75, [30, 220, 95]],
    [1.0, [90, 255, 120]],
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

// Build a connected display surface from the sparse Method 6 grid.
// The saved processed values stay fixed at their original cells.
// Cancelled cells are filled by repeated toroidal averaging 
function buildConnectedDisplayGrid(processedGrid) {
  const seedMask = Array.from({ length: GRID }, () => Array(GRID).fill(false));
  const display = Array.from({ length: GRID }, () => Array(GRID).fill(0));

  let maxProcessed = 0;
  for (let a = 0; a < GRID; a++) {
    for (let b = 0; b < GRID; b++) {
      if (processedGrid[a][b] > maxProcessed) maxProcessed = processedGrid[a][b];
    }
  }
  const floorValue = maxProcessed * (MIN_SECTOR_WAVE_HEIGHT / MAX_WAVE_HEIGHT);

  for (let a = 0; a < GRID; a++) {
    for (let b = 0; b < GRID; b++) {
      if (processedGrid[a][b] > 0) {
        display[a][b] = processedGrid[a][b];
        seedMask[a][b] = true;
      } else if (inEvenOddSector(a, b)) {
        display[a][b] = floorValue;
      } else {
        display[a][b] = 0;
      }
    }
  }

  for (let pass = 0; pass < CONNECTED_SURFACE_BLUR_PASSES; pass++) {
    const next = Array.from({ length: GRID }, () => Array(GRID).fill(0));

    for (let a = 0; a < GRID; a++) {
      for (let b = 0; b < GRID; b++) {
        if (seedMask[a][b]) {
          next[a][b] = processedGrid[a][b];
          continue;
        }

        let acc = 0;
        let wsum = 0;

        for (let da = -1; da <= 1; da++) {
          for (let db = -1; db <= 1; db++) {
            const aa = (a + da + GRID) % GRID;
            const bb = (b + db + GRID) % GRID;
            const isCenter = (da === 0 && db === 0);
            const w = isCenter ? 4.0 : 1.0;
            let neighbor = display[aa][bb];

            // Slightly damp outside-sector spread so the active structure stays readable
            if (!inEvenOddSector(aa, bb)) {
              neighbor *= OUTSIDE_SECTOR_ATTENUATION;
            }

            acc += w * neighbor;
            wsum += w;
          }
        }

        next[a][b] = wsum > 0 ? acc / wsum : 0;
      }
    }

    for (let a = 0; a < GRID; a++) {
      for (let b = 0; b < GRID; b++) {
        display[a][b] = next[a][b];
      }
    }
  }

  return { display, maxProcessed, floorValue };
}

function buildRidgeInfo(processedGrid, displayGrid) {
  const displayValues = [];
  for (let a = 0; a < GRID; a++) {
    for (let b = 0; b < GRID; b++) {
      if (displayGrid[a][b] > 0) displayValues.push(displayGrid[a][b]);
    }
  }

  const vmin = displayValues.length ? Math.min(...displayValues) : 0;
  const vmax = displayValues.length ? Math.max(...displayValues) : 1e-12;

  const ridge = ridgePointsForK(PANEL_K);
  const contribs = ridge
    .map(([a, b]) => [a, b, processedGrid[a][b]])
    .filter(([, , c]) => c > 0)
    .sort((x, y) => y[2] - x[2]);

  return {
    vmin,
    vmax,
    ridge,
    top: contribs.slice(0, TOP_POINTS_PER_PANEL),
    score: processedExactLineScore(processedGrid, PANEL_K)
  };
}

// Build surface
function createWaveSurface(processedGrid, displayGrid, ridgeMeta) {
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

    const value = displayGrid[a][b];
    let color;
    let z;

    if (value <= 0) {
      color = new THREE.Color('rgb(244,244,245)');
      z = 0;
    } else {
      color = colorFromValue(value, ridgeMeta.vmin, ridgeMeta.vmax);
      z = (value / safeMax) * MAX_WAVE_HEIGHT;
    }

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
  const redDotMat = new THREE.MeshBasicMaterial({ color: 0xff3a3a });

  for (let a = 0; a < GRID; a++) {
    for (let b = 0; b < GRID; b++) {
      const dot = new THREE.Mesh(redDotGeo, redDotMat);

      const x = ((b / (GRID - 1)) - 0.5) * PANEL_SIZE;
      const z = ((a / (GRID - 1)) - 0.5) * PANEL_SIZE;
      const baseY = (displayGrid[a][b] / safeMax) * MAX_WAVE_HEIGHT;

      dot.position.set(x, baseY, z);
      dot.userData = { a, b, baseY };

      redDots.push(dot);
      scene.add(dot);
    }
  }

  // White dots on every exact ridge point for a + 42b ≡ 0 (mod 64)
  const whiteDotGeo = new THREE.SphereGeometry(0.07, 8, 8);
  const whiteDotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  const glowMatBase = new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xffffff,
    transparent: true,
    opacity: 1.0,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending
  });

  for (const [a, b] of ridgeMeta.ridge) {
    const x = ((b / (GRID - 1)) - 0.5) * PANEL_SIZE;
    const z = ((a / (GRID - 1)) - 0.5) * PANEL_SIZE;
    const baseY = (displayGrid[a][b] / safeMax) * MAX_WAVE_HEIGHT;

    const dot = new THREE.Mesh(whiteDotGeo, whiteDotMat);
    dot.position.set(x, baseY, z);
    dot.userData = { a, b, baseY };
    whiteDots.push(dot);
    scene.add(dot);

    const glowMat = glowMatBase.clone();
    const glow = new THREE.Sprite(glowMat);
    glow.position.set(x, baseY, z);
    glow.scale.set(0.72, 0.72, 0.72);
    glow.userData = { a, b, baseY };
    whiteGlows.push(glow);
    scene.add(glow);
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

  redDots.forEach(dot => {
    const { a, b, baseY } = dot.userData;
    const localAmp = baseY / MAX_WAVE_HEIGHT;

    const flow =
      Math.sin(b * FLOW_FREQ_X + time) *
      Math.cos(a * FLOW_FREQ_Y + time * 0.85);

    dot.position.y = baseY + flow * FLOW_STRENGTH * MAX_WAVE_HEIGHT * localAmp;
  });

  whiteDots.forEach(dot => {
    const { a, b, baseY } = dot.userData;
    const localAmp = baseY / MAX_WAVE_HEIGHT;

    const flow =
      Math.sin(b * FLOW_FREQ_X + time) *
      Math.cos(a * FLOW_FREQ_Y + time * 0.85);

    dot.position.y = baseY + flow * FLOW_STRENGTH * MAX_WAVE_HEIGHT * localAmp;
  });

  whiteGlows.forEach((glow, idx) => {
    const { a, b, baseY } = glow.userData;
    const localAmp = baseY / MAX_WAVE_HEIGHT;

    const flow =
      Math.sin(b * FLOW_FREQ_X + time) *
      Math.cos(a * FLOW_FREQ_Y + time * 0.85);

    glow.position.y = baseY + flow * FLOW_STRENGTH * MAX_WAVE_HEIGHT * localAmp;

    const pulse = 1.0 + 0.1 * Math.sin(time * 5.0 + idx * 0.35);
    glow.scale.set(0.72 * pulse, 0.72 * pulse, 0.72 * pulse);
    glow.material.opacity = 0.95 + 0.05 * Math.sin(time * 4.0 + idx * 0.21);
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
loadQuantumData().then(data => {
  const processedGrid = extractProcessedGrid(data);
  const { display } = buildConnectedDisplayGrid(processedGrid);
  const ridgeMeta = buildRidgeInfo(processedGrid, display);

  createWaveSurface(processedGrid, display, ridgeMeta);
  animate();
});
