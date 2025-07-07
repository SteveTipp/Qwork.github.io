// script 1 (OG) used for many results (single wave)
// 1. Load JSON Data
async function loadQuantumData() {
    const response = await fetch('Entanglement_Dynamics_Curved_Spacetime_SF_0.1.json'); 
    const data = await response.json();
    return data.raw_counts;
}

// 2. Three.js scene 
const scene    = new THREE.Scene();
const camera   = new THREE.PerspectiveCamera(
  75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 20, 40);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias : true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.DirectionalLight(0xffffff, 1).position.set(10,10,10));

// 3. Globals 
let waveMesh, redDots = [];
let blochSphere, arrowHelper;
let t = 0;

// 4. Utility 
function asGrid(counts) {
  const M = Array.from({ length: 8 }, () => Array(8).fill(0));
  let max = 0;
  for (const [bits, n] of Object.entries(counts)) {
    const u = parseInt(bits.slice(3), 2);
    const v = parseInt(bits.slice(0, 3), 2);
    M[u][v] = n;
    if (n > max) max = n;
  }
  return { M, max };
}

// 5. Generate a wave-like geometry
const gridSize = 50;
const planeGeometry = new THREE.PlaneGeometry(10, 10, gridSize, gridSize);
const planeMaterial = new THREE.MeshStandardMaterial({ color: 0x00FF00, wireframe: true });
const plane = new THREE.Mesh(planeGeometry, planeMaterial);
plane.rotation.x = -Math.PI / 2; // Rotate to lay flat
scene.add(plane);

// 6. Lighting
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5, 5, 5);
scene.add(light);

// 7. Camera position
camera.position.set(0, 5, 10);
camera.lookAt(0, 0, 0);

// 8. Noise function for wave effect
const noise = new SimplexNoise();
let time = 0;

// 9. Load Quantum Data and Map It
async function applyQuantumWavefunction() {
    const bitstringCounts = await loadQuantumData();
    const bitstrings = Object.keys(bitstringCounts);
    
    // 10. Normalize counts to scale heights
    const maxCount = Math.max(...Object.values(bitstringCounts));
    
    // 11. Apply wave heights based on quantum bitstring frequencies
    const positions = plane.geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i];
        const y = positions[i + 1];

        // 12. Map bitstring to a position
        const bitIndex = (i / 3) % bitstrings.length;
        const bitstring = bitstrings[bitIndex];
        const amplitude = (bitstringCounts[bitstring] / maxCount) * 1.5; // Scale amplitude

        positions[i + 2] = amplitude * Math.sin(x * 2 + time) * Math.cos(y * 2 + time);
    }
    plane.geometry.attributes.position.needsUpdate = true;
}

// 13. Animate the wave dynamically
function animate() {
    requestAnimationFrame(animate);
    time += 0.05;
    applyQuantumWavefunction();
    renderer.render(scene, camera);
}

    // 14. After updating the Z positions:
    plane.geometry.computeBoundingBox();
    const box = plane.geometry.boundingBox;
    const center = new THREE.Vector3();
    box.getCenter(center);
    
    // 15. Recenter camera on the updated mesh center
    camera.lookAt(center);
    controls.target.copy(center);  // Also fix OrbitControls center

// 16. Start animation
animate();
