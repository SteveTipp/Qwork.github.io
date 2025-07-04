
// Load JSON Data
async function loadQuantumData() {
    const response = await fetch('Twistor_Repetition_0.json');  // relative path for local testing
    const data = await response.json();
    return data.raw_counts;
}

// Setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Controls
const controls = new THREE.OrbitControls(camera, renderer.domElement);

// Lighting
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(10, 10, 10);
scene.add(light);

// Camera
camera.position.set(0, 25, 45);
camera.lookAt(0, 0, 0);

// Noise + Time
const noise = new SimplexNoise();
let time = 0;
let planes = [];

function createWavePanel(bitstring, count, maxCount, index) {
    const planeSize = 8;
    const gridSize = 30;
    const geometry = new THREE.PlaneGeometry(planeSize, planeSize, gridSize, gridSize);
    const material = new THREE.MeshStandardMaterial({ color: 0x00ff00, wireframe: true });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;

    // Arrange in 2 rows of 4 with gaps
    const gap = 3;
    const col = index % 4;
    const row = Math.floor(index / 4);
    mesh.position.x = (col - 1.5) * (planeSize + gap);
    mesh.position.z = (row === 0) ? - (planeSize + gap) / 2 : (planeSize + gap) / 2;

    scene.add(mesh);

    return {
        mesh,
        bitstring,
        count,
        maxCount
    };
}

async function init() {
    const counts = await loadQuantumData();
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]); // descending

    const maxCount = Math.max(...entries.map(entry => entry[1]));

    planes = entries.map(([bitstring, count], i) =>
        createWavePanel(bitstring, count, maxCount, i)
    );
}

function animate() {
    requestAnimationFrame(animate);
    time += 0.05;

    for (const { mesh, count, maxCount } of planes) {
        const positions = mesh.geometry.attributes.position.array;
        const gridX = mesh.geometry.parameters.widthSegments + 1;
        const gridY = mesh.geometry.parameters.heightSegments + 1;

        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const y = positions[i + 1];
            const amplitude = count / maxCount;
            positions[i + 2] = amplitude * Math.sin(x * 2 + time) * Math.cos(y * 2 + time) * 4;
        }

        mesh.geometry.attributes.position.needsUpdate = true;
    }

    controls.update();
    renderer.render(scene, camera);
}

init().then(() => animate());
