const fs = require('fs');

function getBounds(path) {
    const buffer = fs.readFileSync(path);
    const chunk0Length = buffer.readUInt32LE(12);
    const chunk0Data = buffer.subarray(20, 20 + chunk0Length);
    const gltf = JSON.parse(chunk0Data.toString());
    let min = [Infinity, Infinity, Infinity];
    let max = [-Infinity, -Infinity, -Infinity];
    for (const acc of gltf.accessors) {
        if (acc.min && acc.max) {
            for(let i=0; i<3; i++) {
                if (acc.min[i] < min[i]) min[i] = acc.min[i];
                if (acc.max[i] > max[i]) max[i] = acc.max[i];
            }
        }
    }
    console.log(path, "Size:", [max[0]-min[0], max[1]-min[1], max[2]-min[2]]);
}

getBounds('public/models/m416rifle.glb');
getBounds('public/models/ar15.glb');
