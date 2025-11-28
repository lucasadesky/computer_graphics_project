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


    const import_scale = 0.07;

    let spin = true;

    //load model in
    // https://free3d.com/3d-model/airplane-v1--592360.html plane source
    const plane_filename = "plane.obj";
    const potato_filename = "potato.obj";
    const pawn_filename = "pawn.obj";
    const plane = await readOBJFile(plane_filename, import_scale, true);
    const potato = await readOBJFile(potato_filename, import_scale, true);
    const pawn = await readOBJFile(pawn_filename, import_scale, true);

    // const 

    

    let buffer_size = 90000;

    // Position buffer
    
    const positionBuffer = device.createBuffer({
        size: buffer_size*sizeof['vec4'],
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

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

    const texBuffer = device.createBuffer({
        size: buffer_size*sizeof['vec4'],
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    })
        


    // make sure im looking at the center of the world
    var center = vec3(0);

    const ksSlider = document.getElementById('k_s');
    const shininessSlider = document.getElementById('s');
    const lerSlider = document.getElementById('l_er');
    const legSlider = document.getElementById('l_eg');
    const lebSlider = document.getElementById('l_eb');
    const laSlider = document.getElementById('l_a');

    const fSlider = document.getElementById('r_freq');
    const hfSlider = document.getElementById('hf');
    const lfSlider = document.getElementById('lf');

    const Le_BG = document.getElementById("incoming");

    const selector = document.getElementById("object");

    const spin_button = document.getElementById('spin');

    function onSpinButtonPressed() {
        spin = !spin;
    }

    spin_button?.addEventListener('click', onSpinButtonPressed);
    // set reasonable defaults for the sliders
    // if (!kdSliderR.value) kdSliderR.value = "0.6";
    // if (!kdSliderG.value) kdSliderG.value = "0.6";
    // if (!kdSliderB.value) kdSliderB.value = "0.6";
    if (!ksSlider.value) ksSlider.value = "0.2";
    if (!shininessSlider.value) shininessSlider.value = "16";
    if (!lerSlider.value) lerSlider.value = "255";
    if (!legSlider.value) legSlider.value = "255";
    if (!lebSlider.value) lebSlider.value = "255";
    if (!laSlider.value) laSlider.value = "0.2";

    if (!fSlider.value) fSlider.value = "0";
    if (!hfSlider.value) hfSlider.value = "0";
    if (!lfSlider.value) lfSlider.value = "0";

    function getLightingUniformData(eye, lightDir) {
        const kdR = 0.0; //empty cause tex colour is used
        const kdG = 0.0; //empty cause tex colour is used
        const kdB = 0.0; //empty cause tex colour is used
        const ks = parseFloat(ksSlider.value) || 0.0;
        const shininess = parseFloat(shininessSlider.value) || 1.0;
        const leR = parseFloat(lerSlider.value) || 0.0;
        const leG = parseFloat(legSlider.value) || 0.0;
        const leB = parseFloat(lebSlider.value) || 0.0;

        //get noise for wood pattern too
        const f = parseFloat(fSlider.value) || 0.0;
        const hf = parseFloat(hfSlider.value) || 0.0;
        const lf = parseFloat(lfSlider.value) || 0.0;
        // console.log(leR, leG, leB);
        const la = parseFloat(laSlider.value) || 0.0;

        const light = normalize(lightDir);

        Le_BG.style.backgroundColor = `rgb(${Math.round(leR*255)}, ${Math.round(leG*255)}, ${Math.round(leB*255)})`;


        return new Float32Array([
            kdR, kdG, kdB, 0.0,
            ks, ks, ks, shininess,
            leR, leG, leB, 0.0,
            la, la, la, f,
            eye[0], eye[1], eye[2], hf,
            light[0], light[1], light[2], lf,
        ]);
    }



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
    size: 3*sizeof['mat4'],
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const normalBuffer = device.createBuffer({
        size: buffer_size*sizeof['vec4'],
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    // Depth texture
    const depthTexture = device.createTexture({
        size: { width: canvas.width, height: canvas.height },
        format: 'depth24plus',
        sampleCount: 1,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
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

    const normalBufferLayout = {
        arrayStride: sizeof['vec4'],
        attributes: [{
            format: 'float32x4',
            offset: 0,
            shaderLocation: 1, // Normal, see vertex shader
        }],
    };

    const texBufferLayout = {
        arrayStride: sizeof['vec2'],
        attributes: [{
            format: 'float32x2',
            offset: 0,
            shaderLocation: 2, 
        }]
    }

    const lightingUniformBuffer = device.createBuffer({
        size: 6*sizeof['vec4'],
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Render pipeline
    const pipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {   module: wgsl,
                    entryPoint: 'main_vs',
                    buffers: [positionBufferLayout, normalBufferLayout, texBufferLayout], },
        fragment: { module: wgsl,
                    entryPoint: 'main_fs',
                    targets: [{ format: canvasFormat }], },
                    primitive: { topology: 'triangle-list', frontFace:'ccw', cullMode: 'back'},
        depthStencil: {
                    depthWriteEnabled: true,
                    depthCompare: 'less',
                    format: 'depth24plus'
                    },
    });


    const sampler = device.createSampler({
        addressModeU: "repeat",
        addressModeV: "repeat",
        minFilter: "nearest",
        magFilter: "nearest",
        mipmapFilter: "nearest",
    });

    const texView = texture.createView();

    const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: 
        [
            { binding: 0, resource: { buffer: uniformBuffer } },
            { binding: 1, resource: { buffer: lightingUniformBuffer }},
            {
                binding: 2,
                resource: sampler
            },
            {
                binding: 3,
                resource: texView
            }
        ],
    });

    

    var theta = 0;

    function render(time)
    {
        //plane default
        var positions = plane.vertices;
        var normals =   plane.normals;
        var indices =   plane.indices;
        
        if(selector.value == "potato"){
            positions = potato.vertices;
            normals =   potato.normals;
            indices =   potato.indices;
        }

        if(selector.value == "pawn"){
            positions = pawn.vertices;
            normals =   pawn.normals;
            indices =   pawn.indices;
        }

        

        if (spin)
        {
            theta += 0.01;
        }
        // theta = 0;
        //eye pos
        var eye = vec3(Math.cos(2*theta), Math.sin(theta), Math.sin(2*theta));
        const lightDirection = vec3(0.1, 0.1, 0.1);
        
        //eye looking at what coords
        var lookat = center;

        //whats up
        //nm wbu
        var up = vec3(0,1,0);

        // const fovy = 20+20*(Math.sin(time*0.001) + 1);    //vertical fov in degrees
        const fovy = 45;
        const aspect = 1;   // aspect ratio (w/h)
        const near = 0.01;     //near clip
        const far = 10;      //far clip
        
        var P = perspective(fovy, aspect, near, far);

        const view = lookAt(eye, lookat, up);

        // const rotateMat = rotateY(time*0.05);
        let rotateMat = rotateX(90);
        let scaleMat = scalem(vec3(1, 1, 1));
        let transformMat = translate(0,-0.15,0);

        if(selector.value == "pawn"){
            transformMat = translate(0, 0, 0);
            rotateMat = rotateX(0);
        }

        if(selector.value == "potato"){
            transformMat = translate(0, 0.3, 0);
            rotateMat = rotateX(0);
        }

        var model_matrix = mult(mult(transformMat, rotateMat), scaleMat);

        //model-view-projection matrix - convert model space to clip space
        const inverse_model = inverse(model_matrix);
        const normal_matrix = transpose(inverse_model);
        const viewProjection = mult(P, view);

        const uniformData = new Float32Array(16 * 3);
        uniformData.set(flatten(model_matrix), 0);
        uniformData.set(flatten(normal_matrix), 16);
        uniformData.set(flatten(viewProjection), 32);
        device.queue.writeBuffer(uniformBuffer, 0, uniformData)

        const lightingData = getLightingUniformData(eye, lightDirection);
        device.queue.writeBuffer(lightingUniformBuffer, 0, lightingData);

        device.queue.writeBuffer(texBuffer, 0, flatten(texCoords));
        device.queue.writeBuffer(positionBuffer, /*bufferOffset=*/0, flatten(positions));
        device.queue.writeBuffer(normalBuffer, /*bufferOffset=*/0, flatten(normals));


        const indexBuffer = device.createBuffer({
            size: indices.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(indexBuffer, 0, indices);


        // Create a render pass in a command buffer and submit it
        const encoder = device.createCommandEncoder();
        const depthView = depthTexture.createView();

        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: context.getCurrentTexture().createView(),
                loadOp: 'clear',
                storeOp: 'store',
                clearValue: { r: 0.3, g: 0.3, b: 1, a: 1 },
            }],
            depthStencilAttachment: {
                view: depthView,
                depthLoadOp: "clear",
                depthClearValue: 1.0,
                depthStoreOp: "store",
            }
        });

        // Insert render pass commands here
        pass.setBindGroup(0, bindGroup);
        pass.setPipeline(pipeline);
        pass.setVertexBuffer(0, positionBuffer);
        pass.setVertexBuffer(1, normalBuffer);
        pass.setVertexBuffer(2, texBuffer);
        pass.setIndexBuffer(indexBuffer, 'uint32');
        pass.drawIndexed(indices.length);
        pass.end();
        device.queue.submit([encoder.finish()]);  

        requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
    
}
