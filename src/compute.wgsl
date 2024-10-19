@group(0) @binding(0) var<uniform> grid: vec2f;
@group(0) @binding(1) var<storage, read> stateIn: array<u32>;
@group(0) @binding(2) var<storage, read_write> stateOut: array<u32>;

override workgroupSize: u32;

fn toLinear (cell: vec2u) -> u32 {
    return (cell.x % u32(grid.x)) + (cell.y % u32(grid.y)) * u32(grid.x);
}

fn isActive (cell: vec2u) -> u32 {
    return stateIn[toLinear(cell)];
}

@compute
@workgroup_size(workgroupSize, workgroupSize)
fn compute (@builtin(global_invocation_id) cell: vec3u) {
    let n = toLinear(cell.xy);
    let neighbours = isActive(vec2(cell.x - 1, cell.y - 1))
                    + isActive(vec2(cell.x, cell.y - 1))
                    + isActive(vec2(cell.x + 1, cell.y - 1))
                    + isActive(vec2(cell.x - 1, cell.y))
                    + isActive(vec2(cell.x + 1, cell.y))
                    + isActive(vec2(cell.x - 1, cell.y + 1))
                    + isActive(vec2(cell.x, cell.y + 1))
                    + isActive(vec2(cell.x + 1, cell.y + 1));
    var out = stateIn[n];

    if (neighbours < 2 || neighbours > 3) {
        out = 0;
    } else if (neighbours == 3) {
        out = 1; 
    }

    stateOut[n] = out;
}
