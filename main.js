import { Pane } from 'tweakpane';
import * as PluginEssentials from '@tweakpane/plugin-essentials';

import renderShader from './render.wgsl?raw';
import computeShader from './compute.wgsl?raw';

const canvas = document.querySelector('canvas');
canvas.width = 512;
canvas.height = 512;
console.log(canvas);

const ctx = canvas.getContext('webgpu');
console.log(ctx);

if (!navigator.gpu) {
    throw new Error("WebGPU not supported on this browser.");
}

const adapter = await navigator.gpu.requestAdapter();
console.log(adapter);

if (!adapter) {
    throw new Error("No appropriate GPUAdapter found.");
}

const device = await adapter.requestDevice();
console.log(device);

const format = navigator.gpu.getPreferredCanvasFormat();
console.log(format);

ctx.configure({ device, format });

const options = {
    width: 64,
    height: 64,
    workgroupSize: 8,
    cycle: 0,
    format,
    workgroupSize: 8,
};

function start () {
    const vertices = new Float32Array([
        // Triangle 1
        -0.8, 0.8,
        0.8, 0.8,
        -0.8, -0.8,
        // Triangle 2
        -0.8, -0.8,
        0.8, 0.8,
        0.8, -0.8,
    ]);
    const vertexBuffer = device.createBuffer({
        label: 'Cell vertices',
        size: vertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(vertexBuffer, 0, vertices);
    
    const uniform = new Float32Array([options.width, options.height]);
    const uniformBuffer = device.createBuffer({
        label: 'Grid uniforms',
        size: uniform.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(uniformBuffer, 0, uniform);
    
    const state = Uint32Array.from({ length: options.width * options.height }, () => Math.random() > 0.5 ? 1 : 0);
    const stateBuffer = [
        device.createBuffer({
            label: 'Cell state A',
            size: state.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        }),
        device.createBuffer({
            label: 'Cell state B',
            size: state.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        }),
    ];
    device.queue.writeBuffer(stateBuffer[0], 0, state);

    const shader = device.createShaderModule({
        label: 'Cell shader',
        code: renderShader,
    });
    const simulation = device.createShaderModule({
        label: 'Cell shader',
        code: computeShader,
    });

    const bindGroupLayout = device.createBindGroupLayout({
        label: 'Cell bind group layout',
        entries: [{
            binding: 0,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
            buffer: { type: 'uniform' }, // Grid uniform buffer
        }, {
            binding: 1,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
            buffer: { type: 'read-only-storage' }, // Cell state input buffer
        }, {
            binding: 2,
            visibility: GPUShaderStage.COMPUTE,
            buffer: { type: 'storage' }, // Cell state output buffer
        }],
    });
    const groups = [
        device.createBindGroup({
            label: 'Cell bind group A',
            layout: bindGroupLayout,
            entries: [{
                binding: 0,
                resource: {
                    buffer: uniformBuffer,
                },
            }, {
                binding: 1,
                resource: {
                    buffer: stateBuffer[0],
                },
            }, {
                binding: 2,
                resource: {
                    buffer: stateBuffer[1],
                },
            }],
        }),
        device.createBindGroup({
            label: 'Cell bind group B',
            layout: bindGroupLayout,
            entries: [{
                binding: 0,
                resource: {
                    buffer: uniformBuffer,
                },
            }, {
                binding: 1,
                resource: {
                    buffer: stateBuffer[1],
                },
            }, {
                binding: 2,
                resource: {
                    buffer: stateBuffer[0],
                },
            }],
        }),
    ];

    const pipelineLayout = device.createPipelineLayout({
        label: 'Cell pipeline layout',
        bindGroupLayouts: [bindGroupLayout],
    });
    const renderPipeline = device.createRenderPipeline({
        label: 'Render pipeline',
        layout: pipelineLayout,
        vertex: {
            module: shader,
            entryPoint: 'vertex',
            buffers: [{
                arrayStride: 8,
                attributes: [{
                    format: 'float32x2',
                    offset: 0,
                    shaderLocation: 0,
                }],
            }],
        },
        fragment: {
            module: shader,
            entryPoint: 'fragment',
            targets: [{
                format,
            }],
        },
    });
    const computePipeline = device.createComputePipeline({
        label: 'Compute pipeline',
        layout: pipelineLayout,
        compute: {
            module: simulation,
            entryPoint: 'compute',
            constants: {
                workgroupSize: options.workgroupSize,
            },
        },
    });

    options.cycle = 0;

    return function () {
        const encoder = device.createCommandEncoder();
        const compute = encoder.beginComputePass();
        compute.setPipeline(computePipeline);
        compute.setBindGroup(0, groups[options.cycle % 2]); // in <-> out
        compute.dispatchWorkgroups(
            Math.ceil(options.width / options.workgroupSize),
            Math.ceil(options.height / options.workgroupSize),
        );
        compute.end();
    
        options.cycle += 1;
    
        const render = encoder.beginRenderPass({
            colorAttachments: [{
                view: ctx.getCurrentTexture().createView(),
                loadOp: 'clear',
                clearValue: { r: 0.1, g: 0.1, b: 0.1, a: 1 },
                storeOp: 'store',
            }],
        });
        render.setPipeline(renderPipeline);
        render.setBindGroup(0, groups[options.cycle % 2]); // compute's `out` becomes render's `in`
        render.setVertexBuffer(0, vertexBuffer);
        render.draw(vertices.length / 2, options.width * options.height); // 2D with no additional attribute
        render.end();
    
        device.queue.submit([encoder.finish()]);
    };
}

function main () {
    const pane = new Pane();
    pane.registerPlugin(PluginEssentials);
    
    pane.addBinding(options, 'cycle', {
        format: (value) => value.toFixed(),
        readonly: true,
    });
    pane.addBinding(options, 'format', {
        readonly: true,
    });
    pane.addBinding(options, 'workgroupSize').on('change', () => {
        render = start();
    });
    const fps = pane.addBlade({
        view: 'fpsgraph',
        label: 'fps',
    });
    pane.addButton({
        title: 'Reset',
    }).on('click', () => {
        render = start();
    });

    let render = start();

    function callback () {
        fps.begin();
        render();
        fps.end();
        requestAnimationFrame(callback);
    }

    requestAnimationFrame(callback);
}

main();
