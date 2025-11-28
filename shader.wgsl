struct Uniforms { 
      model: mat4x4<f32>,
      normalMatrix: mat4x4<f32>,
      view_proj: mat4x4<f32>,
 }

struct LightingUniforms {
    kd       : vec3f, pad0 : f32,
    ks       : vec3f, shininess : f32,
    le       : vec3f, pad1 : f32,
    la       : vec3f, freq : f32,
    eyePos   : vec3f, hf : f32,
    lightDir : vec3f, lf : f32,
};

//chatGPT noise
fn hash3(p: vec3<f32>) -> f32 {
    let dotp = dot(p, vec3<f32>(12.9898, 78.233, 45.164));
    return fract(sin(dotp) * 43758.5453);
}

fn noise3(p: vec3<f32>) -> f32 {
    let i = floor(p);
    let f = fract(p);

    // Corners
    let n000 = hash3(i + vec3<f32>(0.0, 0.0, 0.0));
    let n100 = hash3(i + vec3<f32>(1.0, 0.0, 0.0));
    let n010 = hash3(i + vec3<f32>(0.0, 1.0, 0.0));
    let n110 = hash3(i + vec3<f32>(1.0, 1.0, 0.0));
    let n001 = hash3(i + vec3<f32>(0.0, 0.0, 1.0));
    let n101 = hash3(i + vec3<f32>(1.0, 0.0, 1.0));
    let n011 = hash3(i + vec3<f32>(0.0, 1.0, 1.0));
    let n111 = hash3(i + vec3<f32>(1.0, 1.0, 1.0));

    // Smoothstep for interpolation
    let u = f * f * (3.0 - 2.0 * f);

    // Trilinear interpolation
    let nx00 = mix(n000, n100, u.x);
    let nx10 = mix(n010, n110, u.x);
    let nx01 = mix(n001, n101, u.x);
    let nx11 = mix(n011, n111, u.x);

    let nxy0 = mix(nx00, nx10, u.y);
    let nxy1 = mix(nx01, nx11, u.y);

    return mix(nxy0, nxy1, u.z);
}
fn fbm(p: vec3<f32>) -> f32 {
    var f = 0.0;
    var amp = 0.5;
    var freq = 1.0;
    for (var i = 0; i < 4; i = i + 1) {
        f += amp * noise3(p * freq);
        freq *= 2.0;
        amp *= 0.5;
    }
    return f; // still ~0..1-ish
}



@group(0) @binding(0) var<uniform> uniforms : Uniforms;
@group(0) @binding(1) var<uniform> lighting : LightingUniforms;
@group(0) @binding(2) var samp : sampler;
@group(0) @binding(3) var tex  : texture_2d<f32>;

struct VSIn {
  @location(0) pos : vec4<f32>,
  @location(1) normal: vec4<f32>,
  @location(2) uv  : vec2<f32>
};
struct VSOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) world_pos : vec3<f32>,
  @location(1) uv : vec2<f32>,
  @location(2) world_normal: vec3<f32>
};


@vertex
fn main_vs(in : VSIn) -> VSOut {
  var out : VSOut;
  let world_pos = uniforms.model * in.pos;
  out.world_pos = world_pos.xyz;

  let transformedNormal = (uniforms.normalMatrix * vec4f(in.normal.xyz, 0.0)).xyz;
  out.world_normal = normalize(transformedNormal);

  out.clip = uniforms.view_proj * world_pos;

  out.uv = in.uv;
  return out;
}

@fragment
fn main_fs(in : VSOut) -> @location(0) vec4<f32> {
  // 3D wood core: radial distance in XZ
  let p = in.world_pos;
  // Warp rings
  let n1 = noise3(p * lighting.lf * vec3<f32>(8.0, 1.5, 8.0));
  let n2 = noise3(-p * lighting.lf * vec3<f32>(8.0, 1.5, 8.0) + vec3<f32>(4.5678));
  let warped = p.xz + vec2<f32>(n1, n2) * .2;

  // Base ring pattern
  let r = length(warped);
  let ring = sin((r) * lighting.freq) * 0.5 + 0.5;  // adjust freq

  // Additional large-scale variation
  let big = noise3(p * 1.1); //was 2
  let ti = pow(clamp(ring - big * 0.6, 0.0, 1.0), 4.0);

  // --- high-frequency detail (grain) ---
  // stretch along the trunk axis (say y) to make streaks
  let grainCoord = vec3<f32>(p.x * 80.0, p.y * 350.0, p.z * 80.0);
  let grain = fbm(grainCoord) + 0.1;        // 0..1-ish
  let grainOffset = (grain - 0.5) * lighting.hf;  // +/- 0.15

  let t = clamp(ti + grainOffset, 0.0, 1.0);

  // Wood colors
  let dark  = vec3<f32>(0.3, 0.19, 0.075);
  let light = vec3<f32>(1.0, 0.73, 0.426) * 0.4;



  let woodout =  mix(light, dark, t);
  // end random wood thing


  let texSam = textureSample(tex, samp, in.uv);


  let N = normalize(in.world_normal);
  let wi = normalize(lighting.lightDir);
  let wo = normalize(lighting.eyePos - in.world_pos);

  let nDotL = max(dot(N, wi), 0.0);


  // replace kd with the wood colour
  let diffuse = woodout * lighting.le * nDotL;
  let ambient = lighting.la * woodout;

  let reflected = reflect(-wi, N);
  let specFactor = pow(max(dot(reflected, wo), 0.0), lighting.shininess);
  // gate specular by nDotL so we don't get highlights on the dark side
  let specular = lighting.ks * lighting.le * specFactor * nDotL;

  let out = ambient + diffuse + specular;

  return vec4(out, 1.0);
}

