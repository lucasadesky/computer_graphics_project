"use strict";
window.onload = function() { main(); }
async function main()
{
    // Setup
    const gpu = navigator.gpu;
    const adapter = await gpu.requestAdapter();
    const device = await adapter.requestDevice();
    const canvas = document.getElementById('webgl');
    const context = canvas.getContext('webgpu');
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device: device,
        format: canvasFormat,
    });


    let buffer_size = 3000;

    // Position buffer
    
    const positionBuffer = device.createBuffer({
        size: buffer_size*sizeof['vec2'],
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    const texBuffer = device.createBuffer({
        size: buffer_size*sizeof['vec2'],
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    })
        
    // Positions per face (4 faces × 3 verts)
const positions = [
  // Front
  [-0.5, -1,  0.5, 1], [0.5, -1,  0.5, 1],  [0, -0.5, 0, 1],
  // Righ
  [0.5, -1,  0.5, 1], [0.5, -1, -0.5, 1],   [0, -0.5, 0, 1],
  // Bac
  [0.5, -1, -0.5, 1], [-0.5, -1, -0.5, 1],  [0, -0.5, 0, 1],
  // Lef
  [-0.5, -1, -0.5, 1], [-0.5, -1,  0.5, 1], [0, -0.5, 0, 1],
];

// UVs per face, matching above order so each face can have the same mapping
const texCoords = [
  // Front
  [0, 0], [1, 0], [0.5, 1],
  // Right
  [0, 0], [1, 0], [0.5, 1],
  // Back
  [0, 0], [1, 0], [0.5, 1],
  // Left
  [0, 0], [1, 0], [0.5, 1],
];


    // make sure im looking at the center of the plane
    var center = vec3(0);

    for (let i = 0; i < positions.length; ++i) {
        center[0] += positions[i][0];
        center[1] += positions[i][1];
        center[2] += positions[i][2];
    }

    center[0] /= positions.length;
    center[1] /= positions.length;
    center[2] /= positions.length;

    // Wireframe indices
    var wire_indices = new Uint32Array([
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11
    ]);



    var texSize = 128;
    const myTexels = new Uint8Array(4 * texSize * texSize); // RGBA8 data

    const ratio = 5;
    const scale = 7;

    const patchSizeX = scale;   // width of a block in pixels
    const patchSizeY = scale*ratio;  // height of a block in pixels

    function hash2(x, y) {
        // cheap integer hash → 0..1
        let n = x * 374761393 + y * 668265263;
        n = (n ^ (n >>> 13)) * 1274126177;
        n = (n ^ (n >>> 16)) >>> 0;
        return n / 4294967295;
    }

    for (let i = 0; i < texSize; ++i) {
        for (let j = 0; j < texSize; ++j) {
            // "Logical" coordinates of the patch this pixel belongs to
            const px = Math.floor(i / patchSizeX);
            const py = Math.floor(j / patchSizeY);

            const r = hash2(px, py);
            const g = r < 0.5 ? 0.3 : .7;
            const c = (64 + Math.random() * 128 ) * g;

            const idx = 4 * (i * texSize + j);
            myTexels[idx + 0] = c;
            myTexels[idx + 1] = c;
            myTexels[idx + 2] = c;
            myTexels[idx + 3] = 255;
        }
    }

    
    var texture = device.createTexture({
        format: "rgba8unorm", size: [texSize, texSize, 1],
        usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING 
    });
    
    device.queue.writeTexture(
        { texture }, myTexels,
        { offset: 0, bytesPerRow: texSize*4, rowsPerImage: texSize },
        [texSize, texSize, 1]
    );


    const uniformBuffer = device.createBuffer({
    size: sizeof['mat4'],
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Vertex and fragment renderer
    const wgslfile = document.getElementById('wgsl').src;
    const wgslcode = await fetch(wgslfile, {cache: "reload"}).then(r => r.text());
    const wgsl = device.createShaderModule({
        code: wgslcode
    });

    const positionBufferLayout = {
        arrayStride: sizeof['vec4'],
        attributes: [{
            format: 'float32x4',
            offset: 0,
            shaderLocation: 0, // Position, see vertex shader
        }],
    };

    const texBufferLayout = {
        arrayStride: sizeof['vec2'],
        attributes: [{
            format: 'float32x2',
            offset: 0,
            shaderLocation: 1, 
        }]
    }

    // Render pipeline
    const pipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {   module: wgsl,
                    entryPoint: 'main_vs',
                    buffers: [positionBufferLayout, texBufferLayout], },
        fragment: { module: wgsl,
                    entryPoint: 'main_fs',
                    targets: [{ format: canvasFormat }], },
                    primitive: { topology: 'triangle-list', frontFace:'ccw', cullMode: 'back'},
    });


    const sampler = device.createSampler({
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
        minFilter: "nearest",
        magFilter: "nearest",
        mipmapFilter: "nearest",
    });

    const texView = texture.createView();

    const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: 
        [
            {
                binding: 0,
                resource: { buffer: uniformBuffer }
            },
            {
                binding: 1,
                resource: sampler
            },
            {
                binding: 2,
                resource: texView
            }
        ],
    });

    var theta = 0;

    function render(time)
    {

            //eye pos
        var eye = vec3(0, 0, 1.3);

        //eye looking at what coords
        var lookat = center;

        //whats up
        //nm wbu
        var up = vec3(0,1,0);

        const fovy = 20+20*(Math.sin(time*0.001) + 1);    //vertical fov in degrees
        const aspect = 1;   // aspect ratio (w/h)
        const near = 0.1;     //near clip
        const far = 10;      //far clip
        
        var P = perspective(fovy, aspect, near, far);

        const view = lookAt(eye, lookat, up);

        const rotateMat = rotateY(time*0.05);
        const scaleMat = scalem(vec3(1, 1, 1));
        const transformMat = translate(0,0,0);

        var plane_transforms = mult(mult(transformMat, rotateMat), scaleMat);

        //model-view-projection matrix - convert model space to clip space
        const mvp = mult(P, mult(view, plane_transforms)); 

        device.queue.writeBuffer(texBuffer, 0, flatten(texCoords));
        device.queue.writeBuffer(uniformBuffer, 0, flatten(mvp))
        device.queue.writeBuffer(positionBuffer, /*bufferOffset=*/0, flatten(positions));
        

        const indexBuffer = device.createBuffer({
            size: wire_indices.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(indexBuffer, 0, wire_indices);


        // Create a render pass in a command buffer and submit it
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                loadOp: 'clear',
                storeOp: 'store',
                clearValue: { r: 0.3, g: 0.3, b: 1, a: 1 },
            }],
        });

        // Insert render pass commands here
        pass.setBindGroup(0, bindGroup);
        pass.setPipeline(pipeline);
        pass.setVertexBuffer(0, positionBuffer);
        pass.setVertexBuffer(1, texBuffer);
        pass.setIndexBuffer(indexBuffer, 'uint32');
        pass.drawIndexed(wire_indices.length);
        pass.end();
        device.queue.submit([encoder.finish()]);  

        requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
    
}