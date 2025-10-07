

async function loadQuantumData() {
  const url = 'E_mc2_4_bit_Run_8k_0.json'; 
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: ${resp.status} ${resp.statusText}`);
  }
  const data = await resp.json();
  return data.counts; // bitstring -> frequency
}

//  Three.js setup 
const scene    = new THREE.Scene();
const camera   = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
const controls = new THREE.OrbitControls(camera, renderer.domElement);
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(10, 10, 10);
scene.add(light);
camera.position.set(0, 20, 40);
camera.lookAt(0, 0, 0);

// handle resize (helps avoid blank viewports)
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

//  Globals 
let mesh;
let redDots = [];
let highlightSphere = null;
let time = 0;

//--- Helpers 
function parseCountsToGrid(counts) {
  const sampleKey = Object.keys(counts)[0];
  const halfBits  = sampleKey.length / 2;        // 8 bits -> 4+4
  const gridSize  = 1 << halfBits;               // N = 16
  const matrix    = Array.from({ length: gridSize }, () => Array(gridSize).fill(0));
  let   maxCount  = 0;
  for (const [bit, cnt] of Object.entries(counts)) {
    const u = parseInt(bit.slice(halfBits), 2);  // right half = a (u)
    const v = parseInt(bit.slice(0, halfBits), 2); // left half = b (v)
    matrix[u][v] = cnt;
    if (cnt > maxCount) maxCount = cnt;
  }
  return { matrix, maxCount, gridSize, halfBits };
}

function getAllCorrectSet(counts, halfBits, K) {
  const mod = 1 << halfBits;
  const set = new Set();
  for (const bit of Object.keys(counts)) {
    const u = parseInt(bit.slice(halfBits), 2);
    const v = parseInt(bit.slice(0, halfBits), 2);
    if ((u + K * v) % mod === 0) set.add(`${u},${v}`);
  }
  return set;
}

function getBestCorrectPoint(counts, halfBits, K) {
  const mod = 1 << halfBits;
  let bestKey = null, bestCnt = -1;
  for (const [bit, cnt] of Object.entries(counts)) {
    const u = parseInt(bit.slice(halfBits), 2);
    const v = parseInt(bit.slice(0, halfBits), 2);
    if ((u + K * v) % mod === 0 && cnt > bestCnt) {
      bestCnt = cnt;
      bestKey = `${u},${v}`;
    }
  }
  return bestKey;
}

//  Build mesh/dots/highlight
function createWaveSurface(matrix, maxCount, gridSize, correctSet, bestKey) {
  const WIDTH = gridSize * 2;
  const SEGMENTS = WIDTH;
  const STEP = WIDTH / (gridSize - 1);

  const geometry = new THREE.PlaneGeometry(WIDTH, WIDTH, SEGMENTS, SEGMENTS);
  const colors = [];
  const gridX = SEGMENTS + 1;
  const gridY = SEGMENTS + 1;

  for (let y = 0; y < gridY; y++) {
    for (let x = 0; x < gridX; x++) {
      const u = Math.floor(x / (gridX / gridSize));
      const v = Math.floor(y / (gridY / gridSize));
      const key = `${u},${v}`;
      let color = new THREE.Color(0x00ff00);        // green wire
      if (correctSet.has(key)) color = new THREE.Color(0x0000ff); // ridge cells blue
      colors.push(color.r, color.g, color.b);
    }
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, wireframe: true });

  mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.userData = { matrix, maxCount, gridSize, STEP };
  scene.add(mesh);

  // red dots at each (u,v)
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  for (let v = 0; v < gridSize; v++) {
    for (let u = 0; u < gridSize; u++) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), dotMat);
      dot.position.set((u - (gridSize - 1) / 2) * STEP, 0, (v - (gridSize - 1) / 2) * STEP);
      redDots.push(dot);
      scene.add(dot);
    }
  }

  // single yellow highlight at the best ridge point
  if (bestKey) {
    const [uStr, vStr] = bestKey.split(',');
    const u = parseInt(uStr, 10);
    const v = parseInt(vStr, 10);
    const amp = matrix[u][v] / maxCount;
    const hMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    highlightSphere = new THREE.Mesh(new THREE.SphereGeometry(0.8, 20, 20), hMat);
    highlightSphere.position.set(
      (u - (gridSize - 1) / 2) * STEP,
      amp * 25 + 1.2,
      (v - (gridSize - 1) / 2) * STEP
    );
    highlightSphere.userData = { u, v };
    scene.add(highlightSphere);
  }
}

//  Animate 
function animate() {
  requestAnimationFrame(animate);
  time += 0.2;
  if (!mesh) return;

  const { matrix, maxCount, gridSize } = mesh.userData;
  const pos   = mesh.geometry.attributes.position;
  const gridX = mesh.geometry.parameters.widthSegments + 1;
  const gridY = mesh.geometry.parameters.heightSegments + 1;

  for (let i = 0; i < pos.count; i++) {
    const x = i % gridX;
    const y = Math.floor(i / gridX);
    const u = Math.floor(x / (gridX / gridSize));
    const v = Math.floor(y / (gridY / gridSize));
    const amp = matrix[u]?.[v] ? matrix[u][v] / maxCount : 0;
    const wave = Math.sin((x + time) * 0.4) * Math.cos((y + time) * 0.4);
    pos.setZ(i, amp * wave * 25);
  }

  redDots.forEach((dot, idx) => {
    const u = idx % gridSize;
    const v = Math.floor(idx / gridSize);
    const amp = matrix[u]?.[v] ? matrix[u][v] / maxCount : 0;
    dot.position.y = amp * 25 + 0.6;
  });

  if (highlightSphere) {
    const { u, v } = highlightSphere.userData;
    const amp = matrix[u]?.[v] ? matrix[u][v] / maxCount : 0;
    highlightSphere.position.y = amp * 25 + 1.2;
  }

  pos.needsUpdate = true;
  controls.update();
  renderer.render(scene, camera);
}

//  Main 
loadQuantumData()
  .then(counts => {
    const K = 9; // highlight only k=9 ridge
    const { matrix, maxCount, gridSize, halfBits } = parseCountsToGrid(counts);
    const correctSet = getAllCorrectSet(counts, halfBits, K);
    const bestKey    = getBestCorrectPoint(counts, halfBits, K);
    createWaveSurface(matrix, maxCount, gridSize, correctSet, bestKey);
    animate();
  })
  .catch(err => {
    console.error(err);
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;top:10px;left:10px;background:#200;color:#fff;padding:10px;font-family:monospace;z-index:9999;';
    div.textContent = 'Error: ' + err.message;
    document.body.appendChild(div);
  });
