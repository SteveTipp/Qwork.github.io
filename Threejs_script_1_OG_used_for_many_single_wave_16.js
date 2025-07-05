

async function loadQuantumData() {

  const url =
    'GU_Chimeric_Spinor_Projection_Test_32768_0.json';

  const res  = await fetch(url);
  if (!res.ok) {
    throw new Error(`Quantum-data load failed: ${res.status} ${res.statusText}`);
  }
  return await res.json();        // returns ONE object
}


const scene     = new THREE.Scene();
const camera    = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
const renderer  = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

/* lighting */
const light = new THREE.DirectionalLight(0xffffff, 1.0);
light.position.set(10, 15, 12);
scene.add(light);

/* camera */
camera.position.set(60, 20, 0);    // zoom out (x = 60), tilt down from a height (y = 20)
camera.lookAt(0, 0, 0); 

/* orbit controls (non-module global) */
const controls = new THREE.OrbitControls(camera, renderer.domElement);


const COL_BITS = 3;                     // first 3 bits  → column (0-7)
const ROW_BITS = 4;                     // next 4 bits  → row    (0-15)
const COLS     = 1 << COL_BITS;         // 8
const ROWS     = 1 << ROW_BITS;         // 16

const PLANE_SIZE  = 6;                  // width & depth in world units
const GRID_DIV    = 20;                 // segments per side
const PLANE_SPACE = PLANE_SIZE + 1.5;   // gap between panels

const noise = new SimplexNoise();
let   time  = 0;
const panels = [];                      // store metadata for animation


function makeWavePlane(panelInfo, colIdx, rowIdx) {
  const geo = new THREE.PlaneGeometry(PLANE_SIZE, PLANE_SIZE, GRID_DIV, GRID_DIV);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x00ff00,
    wireframe: true
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;

  mesh.position.x = (colIdx - (COLS - 1) / 2) * PLANE_SPACE;
  mesh.position.z = (rowIdx - (ROWS - 1) / 2) * PLANE_SPACE;

  scene.add(mesh);

  panels.push({
    mesh,
    total: panelInfo.total,           // for amplitude scaling
  });
}


async function init() {
  const data         = await loadQuantumData();
  const raw          = data.raw_counts;                 // big histogram
  const panelBuckets = new Array(COLS * ROWS)
    .fill(null)
    .map(() => ({ counts: {}, total: 0 }));

  /* bucket every bit-string ------------------------------------------- */
  let globalMaxPanelTotal = 0;

  for (const [bitStr, count] of Object.entries(raw)) {
    if (bitStr.length !== 7) continue;                  // sanity

    const col = parseInt(bitStr.slice(0, COL_BITS), 2);           // 0-7
    const row = parseInt(bitStr.slice(COL_BITS),     2);          // 0-15
    const idx = row * COLS + col;

    const bucket = panelBuckets[idx];
    bucket.counts[bitStr] = count;
    bucket.total         += count;

    if (bucket.total > globalMaxPanelTotal)
      globalMaxPanelTotal = bucket.total;
  }

  /* create one plane for every *non-empty* bucket --------------------- */
  panelBuckets.forEach((bucket, idx) => {
    if (bucket.total === 0) return;                     // skip empties
    const col = idx % COLS;
    const row = Math.floor(idx / COLS);
    makeWavePlane(bucket, col, row);
  });

  /* stash global max for anim scaling */
  panels.forEach(p => (p.norm = p.total / globalMaxPanelTotal));
}

/* --------------------------------------------------------------------- */
/* 6.  Animation loop                                                    */
/* --------------------------------------------------------------------- */
function animate() {
  requestAnimationFrame(animate);
  time += 0.003;

  panels.forEach(p => {
    const { mesh, norm } = p;
    const pos  = mesh.geometry.attributes.position;
    const arr  = pos.array;

    for (let i = 0; i < arr.length; i += 3) {
      // vertex local coordinates after PlaneGeometry creation
      const x = arr[i];
      const y = arr[i + 1];

      // simplex noise for organic ripple
      const n = noise.noise3D(x * 0.25, y * 0.25, time);

      // z-displacement
      arr[i + 2] = n * 3 * norm;   // scale by panel “heat”
    }
    pos.needsUpdate = true;
  });

  controls.update();
  renderer.render(scene, camera);
}

/* --------------------------------------------------------------------- */
/* 7. Kick everything off                                                */
/* --------------------------------------------------------------------- */
init().then(animate).catch(err => console.error(err));

/* --------------------------------------------------------------------- */


