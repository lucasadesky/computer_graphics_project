struct Uniforms { mvp: mat4x4<f32> }
@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var samp : sampler;
@group(0) @binding(2) var tex  : texture_2d<f32>;

struct VSIn {
  @location(0) pos : vec4<f32>,
  @location(1) uv  : vec2<f32>
};
struct VSOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) worldPos : vec3<f32>,
  @location(1) uv : vec2<f32>
};

// @vertex
// fn main_vs(in : VSIn) -> VSOut {
//   var out : VSOut;
//   out.clip = uniforms.mvp * in.pos;
//   let r = length(in.pos.xz);     // imagine the tree standing along +Y
//   let rings = sin(r * 10);
//   out.rings = vec2(rings, rings);
//   out.uv = in.uv;
//   return out;
// }

@vertex
fn main_vs(in : VSIn) -> VSOut {
  var out : VSOut;
  out.clip = uniforms.mvp * in.pos;

  // use object-space pos if you don’t have model separate
  out.worldPos = in.pos.xyz;

  out.uv = in.uv;
  return out;
}

@fragment
fn main_fs(in : VSOut) -> @location(0) vec4<f32> {
  // 3D wood core: radial distance in XZ
  let p = in.worldPos;
  let r = length(p.xz );// in.worldPos.x/in.worldPos.z);          // distance from “trunk axis”

  let freq = 100.0;                // try tweaking this
  let rings = sin(r * freq);     // -1..1

  let t = 0.5 * (rings + 1.0);   // 0..1

  let darkWood = vec3(86,50,50) / 255.0;
  let lightWood  = vec3( 255,193,140) / 255.0;
  let x = textureSample(tex, samp, in.uv); 

  let color = mix(lightWood, darkWood, t);
  let out = mix(color, x.rgb, t);
  return vec4(out, 1.0);
}
// @fragment
// fn main_fs(in : VSOut) -> @location(0) vec4<f32> {
//   let t = 0.5 * (in.rings.x + 1.0); // -1..1 → 0..1

//   let lightWood = vec3(199.0, 199.0, 199.0) / 255.0;
//   let darkWood  = vec3( 99.0,  99.0,  99.0) / 255.0;
//   let x = textureSample(tex, samp, in.uv); 
//   let color = mix(lightWood, darkWood, t);
//   return vec4(color, 1.0);
// }



