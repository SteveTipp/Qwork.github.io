
// Load JSON Data
async function loadQuantumData() {
    const response = await fetch('Randomized_Gate_Stability_Results_0.json'); 
    const data = await response.json();
    return data;
}

// Three.js Setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Lighting
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(10, 10, 10);
scene.add(light);

// Camera
camera.position.set(0, 16, 32);
camera.lookAt(0, 0, 0);

// Time + Noise
let time = 0;
const noise = new SimplexNoise();
let planes = [];

// Create 2D overlay legend
function createLegend(keys) {
    const legendContainer = document.createElement('div');
    legendContainer.style.position = 'absolute';
    legendContainer.style.top = '20px';
    legendContainer.style.right = '20px';
    legendContainer.style.color = 'white';
    legendContainer.style.fontFamily = 'Arial, sans-serif';
    legendContainer.style.fontSize = '16px';  // smaller
    legendContainer.style.display = 'grid';
    legendContainer.style.gridTemplateColumns = 'auto auto auto';
    legendContainer.style.gap = '8px 16px';
    legendContainer.style.textAlign = 'right';

    keys.forEach(key => {
        const item = document.createElement('div');
        item.textContent = `Shots: ${key}`;
        legendContainer.appendChild(item);
    });

    document.body.appendChild(legendContainer);
}

// Generate wave panel
function createWavePlane(bitstringCounts, index) {
    const cols = 3;
    const planeSize = 15;
    const gridSize = 30;
    const spacing = planeSize + 3;

    const row = Math.floor(index / cols);
    const col = index % cols;

    const geometry = new THREE.PlaneGeometry(planeSize, planeSize, gridSize, gridSize);
    const material = new THREE.MeshStandardMaterial({ color: 0x00FF00, wireframe: true });
    const mesh = new THREE.Mesh(geometry, material);

    mesh.rotation.x = -Math.PI / 2;
    mesh.position.x = (col - 1) * spacing;
    mesh.position.z = (row === 0) ? -spacing / 2 : spacing / 2;

    scene.add(mesh);

    const bitstrings = Object.keys(bitstringCounts);
    const maxCount = Math.max(...Object.values(bitstringCounts));

    return {
        mesh,
        bitstrings,
        counts: { ...bitstringCounts },
        max: maxCount
    };
}

// Load and position all wave states
async function initWaves() {
    const allData = await loadQuantumData();
    const keys = Object.keys(allData);
    planes = [];

    keys.forEach((key, idx) => {
        const counts = allData[key];
        const wave = createWavePlane(counts, idx);
        planes.push(wave);
    });

   
}

// Animate wave function
function animate() {
    requestAnimationFrame(animate);
    time += 0.05;

    for (const plane of planes) {
        const { mesh, counts, max } = plane;
        const positions = mesh.geometry.attributes.position.array;
        const gridX = mesh.geometry.parameters.widthSegments + 1;
        const gridY = mesh.geometry.parameters.heightSegments + 1;

        for (let i = 0; i < positions.length; i += 3) {
            const xi = (i / 3) % gridX;
            const yi = Math.floor((i / 3) / gridX);

            // Map 2D positions to a bitstring zone
            // Divide into quadrants: 00, 01, 10, 11
            const quadrant =
                (xi < gridX / 2 ? '0' : '1') +
                (yi < gridY / 2 ? '0' : '1'); // e.g., "00", "01", "10", "11"

            const amplitude = (counts[quadrant] || 0) / max;

            const x = positions[i];
            const y = positions[i + 1];
            positions[i + 2] = amplitude * Math.sin(x * 2 + time) * Math.cos(y * 2 + time) * 3.5;
        }

        mesh.geometry.attributes.position.needsUpdate = true;
    }

    renderer.render(scene, camera);
}

// Start animation
initWaves().then(() => animate());
