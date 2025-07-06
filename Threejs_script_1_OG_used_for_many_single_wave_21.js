
// Load JSON data
async function loadQuantumData() {
  const response = await fetch('Shors_ECC_5_Bit_Key_0.json');
  const data = await response.json();
  return data.counts;
}

// Three.js Setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Orbit controls
const controls = new THREE.OrbitControls(camera, renderer.domElement);

// Lighting
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(10, 10, 10);
scene.add(light);

// Camera Position
camera.position.set(0, 30, 60);
camera.lookAt(0, 0, 0);

// Globals
let mesh, redDots = [];
let time = 0;

// Parse data into 2D matrix
function parseCountsToGrid(counts) {
  const gridSize = 32;
  const matrix = Array.from({ length: gridSize }, () => Array(gridSize).fill(0));
  let maxCount = 0;

  for (const [bitstring, count] of Object.entries(counts)) {
      const u = parseInt(bitstring.slice(5), 2); // rightmost 5 bits
      const v = parseInt(bitstring.slice(0, 5), 2); // leftmost 5 bits
      matrix[u][v] = count;
      if (count > maxCount) maxCount = count;
  }

  return { matrix, maxCount };
}

// Build surface mesh + red dots
function createWaveSurface(matrix, maxCount) {
  const width = 64;
  const segments = 64;
  const geometry = new THREE.PlaneGeometry(width, width, segments, segments);

  // Vertex color setup
  const colors = [];
  const gridX = segments + 1;
  const gridY = segments + 1;

  for (let y = 0; y < gridY; y++) {
      for (let x = 0; x < gridX; x++) {
          const u = Math.floor(x / (gridX / 32));
          const v = Math.floor(y / (gridY / 32));
          const isDiagonal = (u + 7 * v) % 32 === 0;
          const color = isDiagonal ? new THREE.Color(0x0000ff) : new THREE.Color(0x00ff00);
          colors.push(color.r, color.g, color.b);
      }
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const material = new THREE.MeshBasicMaterial({ vertexColors: true, wireframe: true });
  mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  scene.add(mesh);

  // Add red dots
  const dotMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  for (let x = 0; x < 32; x++) {
      for (let y = 0; y < 32; y++) {
          const dotGeo = new THREE.SphereGeometry(0.15, 8, 8);
          const dot = new THREE.Mesh(dotGeo, dotMaterial);
          dot.position.set(x - 15.5, 0, y - 15.5); // Centered
          redDots.push(dot);
          scene.add(dot);
      }
  }

  mesh.userData = { matrix, maxCount };
}

// Animate wave surface
function animate() {
  requestAnimationFrame(animate);
  time += 0.2;

  if (!mesh || !mesh.geometry || !mesh.geometry.attributes.position) return;

  const { matrix, maxCount } = mesh.userData;
  const pos = mesh.geometry.attributes.position;
  const gridX = mesh.geometry.parameters.widthSegments + 1;
  const gridY = mesh.geometry.parameters.heightSegments + 1;

  for (let i = 0; i < pos.count; i++) {
      const x = i % gridX;
      const y = Math.floor(i / gridX);
      const u = Math.floor(x / (gridX / 32));
      const v = Math.floor(y / (gridY / 32));

      const amp = (matrix[u] && matrix[u][v]) ? matrix[u][v] / maxCount : 0;
      const wave = Math.sin((x + time) * 0.4) * Math.cos((y + time) * 0.4);

      pos.setZ(i, amp * wave * 20);
  }

  // Update red dots
  redDots.forEach((dot, i) => {
      const u = i % 32;
      const v = Math.floor(i / 32);
      const amp = (matrix[u] && matrix[u][v]) ? matrix[u][v] / maxCount : 0;
      dot.position.y = amp * 20 + 0.5;
  });

  pos.needsUpdate = true;
  controls.update();
  renderer.render(scene, camera);
}

// Main
loadQuantumData().then(data => {
  const { matrix, maxCount } = parseCountsToGrid(data);
  createWaveSurface(matrix, maxCount);
  animate();
});
