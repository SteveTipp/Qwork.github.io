
// 1. Load JSON data
async function loadQuantumData() {
  const response = await fetch('Dynamic_Casimir_Cavity_Chain_0.json');
  const data = await response.json();
  return data.raw_counts;
}

// 2. Three.js Setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// 3. Orbit controls
const controls = new THREE.OrbitControls(camera, renderer.domElement);

// 4. Lighting
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(10, 10, 10);
scene.add(light);

// 5. Camera Position
camera.position.set(0, 20, 40);
camera.lookAt(0, 0, 0);

// 6. Globals
let mesh, redDots = [];
let time = 0;

// 7. Parse symmetric |11⟩ pairs into a 30×30 grid
function parseCountsToGrid(counts) {
  const gridSize = 30;
  const matrix = Array.from({ length: gridSize }, () => Array(gridSize).fill(0));
  let maxCount = 0;

  for (const [bitstring, count] of Object.entries(counts)) {
      for (let i = 0; i < 30; i++) {
          const b1 = bitstring[i] === '1';
          const b2 = bitstring[59 - i] === '1';
          if (b1 && b2) {
              matrix[i][29 - i] += count;
              if (matrix[i][29 - i] > maxCount) {
                  maxCount = matrix[i][29 - i];
              }
          }
      }
  }

  return { matrix, maxCount };
}

// 8. Build surface mesh + red dots
function createWaveSurface(matrix, maxCount) {
  const width = 30;
  const segments = 60;
  const geometry = new THREE.PlaneGeometry(width, width, segments, segments);

  // 9. Vertex color setup
  const colors = [];
  const gridX = segments + 1;
  const gridY = segments + 1;

  for (let y = 0; y < gridY; y++) {
      for (let x = 0; x < gridX; x++) {
          const u = Math.floor(x / (gridX / 30));
          const v = Math.floor(y / (gridY / 30));
          const isDiagonal = u === 29 - v;
          const color = isDiagonal ? new THREE.Color(0xff00ff) : new THREE.Color(0x00ff00);
          colors.push(color.r, color.g, color.b);
      }
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const material = new THREE.MeshBasicMaterial({ vertexColors: true, wireframe: true });
  mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  scene.add(mesh);

  // 10. Add red dots at grid points
  const dotMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  for (let x = 0; x < 30; x++) {
      for (let y = 0; y < 30; y++) {
          const dotGeo = new THREE.SphereGeometry(0.15, 8, 8);
          const dot = new THREE.Mesh(dotGeo, dotMaterial);
          dot.position.set(x - 15, 0, y - 15); // Center grid
          redDots.push(dot);
          scene.add(dot);
      }
  }

  mesh.userData = { matrix, maxCount };
}

// 11. Animate wave surface
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
      const u = Math.floor(x / (gridX / 30));
      const v = Math.floor(y / (gridY / 30));

      const amp = (matrix[u] && matrix[u][v]) ? matrix[u][v] / maxCount : 0;
      const wave = Math.sin((x + time) * 0.4) * Math.cos((y + time) * 0.4);

      pos.setZ(i, amp * wave * 12); // Amplified wave
  }

  // 12. Update red dot height to show photon intensity
  redDots.forEach((dot, i) => {
      const u = i % 30;
      const v = Math.floor(i / 30);
      const amp = (matrix[u] && matrix[u][v]) ? matrix[u][v] / maxCount : 0;
      dot.position.y = amp * 12 + 0.5;
  });

  pos.needsUpdate = true;
  controls.update();
  renderer.render(scene, camera);
}

// 13. Main
loadQuantumData().then(data => {
  const { matrix, maxCount } = parseCountsToGrid(data);
  createWaveSurface(matrix, maxCount);
  animate();
});



