@group(0) @binding(0) var<uniform> grid: vec2f;
@group(0) @binding(1) var<storage> state: array<u32>;

struct Input {
    @location(0) position: vec2f,
    @builtin(instance_index) instance: u32
}

struct Output {
    @builtin(position) position: vec4f,
    @location(0) cell: vec2f,
    @location(1) state: f32,
}

@vertex
fn vertex (input: Input) -> Output {
    var out: Output;
    let n = f32(input.instance);
    let cell = vec2f(n % grid.x, floor(n / grid.y));
    let unit = vec2f(2 / grid); // -1 <-> 1 = 2

    out.position = vec4f((input.position + 1) / grid - 1 + (cell * unit), 0, 1);
    out.cell = cell;
    out.state = f32(state[input.instance]);

    return out;
}

@fragment
fn fragment (out: Output) -> @location(0) vec4f {
    if (out.state == 0) {
        discard;
    }

    return vec4f(
        out.cell.x / grid.x,
        out.cell.y / grid.y,
        1 - out.cell.x / grid.x,
        1,
    );
}
