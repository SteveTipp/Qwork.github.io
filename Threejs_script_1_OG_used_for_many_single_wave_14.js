// Load JSON Data (local server access)
async function loadQuantumData() {
    const response = await fetch('Twistor_Guided_QEP_Mapping_1.json');
    const data = await response.json();
    return data;
}

// Three.js Setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(80, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Lighting
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(10, 10, 10);
scene.add(light);

// Camera Position
camera.position.set(0, 10, 20);
camera.lookAt(0, 0, 0);

// Controls (OrbitControls from global THREE)
const controls = new THREE.OrbitControls(camera, renderer.domElement);

// Noise + Time
const noise = new SimplexNoise();
let time = 0;
let planes = [];

// Generate each quantum wave panel
function createWavePlane(bitstringCounts, index) {
    const cols = 5;
    const planeSize = 13;
    const gridSize = 30;
    const spacing = planeSize + 3;

    const row = Math.floor(index / cols);
    const col = index % cols;

    const geometry = new THREE.PlaneGeometry(planeSize, planeSize, gridSize, gridSize);
    const material = new THREE.MeshStandardMaterial({ color: 0x00FF00, wireframe: true });
    const mesh = new THREE.Mesh(geometry, material);

    mesh.rotation.x = -Math.PI / 2;
    mesh.position.x = (col - (cols - 1) / 2) * spacing;
    mesh.position.z = (row === 0) ? -spacing / 2 : spacing / 2;
    mesh.position.y = (row === 0) ? 5 : 0; // lift back row up above front row

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

// Load all panels from the JSON structure
async function initWaves() {
    const dataset = await loadQuantumData();
    planes = [];

    dataset.forEach((entry, index) => {
        const counts = entry.raw_counts;
        const wave = createWavePlane(counts, index);
        planes.push(wave);
    });
}

// Animate
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

    controls.update();
    renderer.render(scene, camera);
}

// Start
initWaves().then(() => animate());
