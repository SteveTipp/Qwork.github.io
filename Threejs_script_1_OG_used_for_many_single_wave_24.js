
// Code for Three-js visual from experiment JSON
// Load JSON data - 6-bit backend result
async function loadQuantumData() {
  const response = await fetch('Shors_ECC_6_Bit_Key_0.json');
  const data     = await response.json();
  return data.counts;
}

// Three.js setup
const scene    = new THREE.Scene();
const camera   = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Orbit controls
const controls = new THREE.OrbitControls(camera, renderer.domElement);

// Lighting
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(10, 10, 10);
scene.add(light);

// Camera
camera.position.set(0, 40, 90);
camera.lookAt(0, 0, 0);

// Globals
let mesh;
let redDots          = [];
let highlightSpheres = [];
let time = 0;

// Helpers 
// All ridge hits measured
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

// Top‑3 highest‑count ridge hits
function getTop3CorrectSet(counts, halfBits, K) {
  const mod = 1 << halfBits;
  return new Set(
    Object.entries(counts)
      .filter(([bit]) => {
        const u = parseInt(bit.slice(halfBits), 2);
        const v = parseInt(bit.slice(0, halfBits), 2);
        return (u + K * v) % mod === 0;
      })
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([bit]) => {
        const u = parseInt(bit.slice(halfBits), 2);
        const v = parseInt(bit.slice(0, halfBits), 2);
        return `${u},${v}`;
      })
  );
}

// Parse counts -> matrix
function parseCountsToGrid(counts) {
  const sampleKey = Object.keys(counts)[0];
  const halfBits  = sampleKey.length / 2;        
  const gridSize  = 1 << halfBits;               
  const matrix    = Array.from({ length: gridSize }, () => Array(gridSize).fill(0));
  let   maxCount  = 0;

  for (const [bit, cnt] of Object.entries(counts)) {
    const u = parseInt(bit.slice(halfBits), 2);
    const v = parseInt(bit.slice(0, halfBits), 2);
    matrix[u][v] = cnt;
    if (cnt > maxCount) maxCount = cnt;
  }
  return { matrix, maxCount, gridSize, halfBits };
}

// Build surface mesh + dots + highlight spheres
function createWaveSurface(matrix, maxCount, gridSize, correctSet, top3Set) {
  const WIDTH    = gridSize * 2;     
  const SEGMENTS = WIDTH;            
  const STEP     = WIDTH / (gridSize - 1);   

  const geometry = new THREE.PlaneGeometry(WIDTH, WIDTH, SEGMENTS, SEGMENTS);
  const colors   = [];
  const gridX    = SEGMENTS + 1;
  const gridY    = SEGMENTS + 1;

  for (let y = 0; y < gridY; y++) {
    for (let x = 0; x < gridX; x++) {
      const u = Math.floor(x / (gridX / gridSize));
      const v = Math.floor(y / (gridY / gridSize));
      const key = `${u},${v}`;

      // default green
      let color = new THREE.Color(0x00ff00);
      // ridge hits -> blue
      if (correctSet.has(key)) color = new THREE.Color(0x0000ff);

      colors.push(color.r, color.g, color.b);
    }
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, wireframe: true });

  mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.userData   = { matrix, maxCount, gridSize, STEP };
  scene.add(mesh);

  // red dots every (u,v)
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  for (let v = 0; v < gridSize; v++) {
    for (let u = 0; u < gridSize; u++) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), dotMat);
      dot.position.set(
        (u - (gridSize - 1) / 2) * STEP,
        0,
        (v - (gridSize - 1) / 2) * STEP
      );
      redDots.push(dot);
      scene.add(dot);
    }
  }

  // yellow spheres on top‑3
  const hMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
  top3Set.forEach(key => {
    const [uStr, vStr] = key.split(',');
    const u = parseInt(uStr, 10);
    const v = parseInt(vStr, 10);
    const amp = matrix[u][v] / maxCount;
    const sph = new THREE.Mesh(new THREE.SphereGeometry(0.8, 20, 20), hMat);
    sph.position.set(
      (u - (gridSize - 1) / 2) * STEP,
      amp * 25 + 1.2,
      (v - (gridSize - 1) / 2) * STEP
    );
    sph.userData = { u, v };
    highlightSpheres.push(sph);
    scene.add(sph);
  });
}

// Animate
function animate() {
  requestAnimationFrame(animate);
  time += 0.2;
  if (!mesh) return;

  const { matrix, maxCount, gridSize, STEP } = mesh.userData;
  const pos   = mesh.geometry.attributes.position;
  const gridX = mesh.geometry.parameters.widthSegments + 1;
  const gridY = mesh.geometry.parameters.heightSegments + 1;

  for (let i = 0; i < pos.count; i++) {
    const x   = i % gridX;
    const y   = Math.floor(i / gridX);
    const u   = Math.floor(x / (gridX / gridSize));
    const v   = Math.floor(y / (gridY / gridSize));
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

  highlightSpheres.forEach(sph => {
    const { u, v } = sph.userData;
    const amp = matrix[u]?.[v] ? matrix[u][v] / maxCount : 0;
    sph.position.y = amp * 25 + 1.2;
  });

  pos.needsUpdate = true;
  controls.update();
  renderer.render(scene, camera);
}

// Main
loadQuantumData().then(counts => {
  const K = 42;
  const { matrix, maxCount, gridSize, halfBits } = parseCountsToGrid(counts);

  const correctSet = getAllCorrectSet(counts, halfBits, K);
  const top3Set    = getTop3CorrectSet(counts, halfBits, K);

  createWaveSurface(matrix, maxCount, gridSize, correctSet, top3Set);
  animate();
});
