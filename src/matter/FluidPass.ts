import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { createMatterLiquidMaterials, type MatterLiquidUniforms, type MatterUniforms } from './materials.js';

const QUAD_VS = /* glsl */ `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`;

export interface FluidPassOptions {
  /** Fraction of the composer size the liquid depth is rendered at (default 1).
   * Below 1 the surface shows stair-steps; use it only as a quality fallback. */
  resolution?: number;
  /** Rounds of the separable edge-aware blur (default 5). Fewer is faster and lumpier. */
  blurRounds?: number;
}

/** Screen-space liquid, as an EffectComposer pass placed after the scene render.
 *
 * Particles are drawn as spheres into a float depth target; an edge-aware blur merges
 * neighbouring spheres into one surface; a composite shades that surface as clear
 * liquid: it refracts the scene behind it, reflects at grazing angles, catches
 * highlights (faded at the silhouette, where depth-edge normals are unreliable) and
 * absorbs light by thickness, so a pool reads dense while drops and thin edges stay
 * clear. The particle positions come from the same uniforms as the sprites, so the
 * liquid crossfades with Solid and Gas through `mix`.
 *
 * Disable the pass (`enabled = false`) when no Liquid is showing; it costs several
 * full-screen passes. */
export class FluidPass extends Pass {
  readonly liquidUniforms: MatterLiquidUniforms;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly depthMaterial: THREE.ShaderMaterial;
  private readonly thicknessMaterial: THREE.ShaderMaterial;
  private readonly depthRT: THREE.WebGLRenderTarget;
  private readonly blurA: THREE.WebGLRenderTarget;
  private readonly blurB: THREE.WebGLRenderTarget;
  private readonly thickRT: THREE.WebGLRenderTarget;
  private readonly liquidScene = new THREE.Scene();
  private readonly thickScene = new THREE.Scene();
  private readonly liquidPoints: THREE.Points;
  private readonly thickPoints: THREE.Points;
  private readonly blurMaterial: THREE.ShaderMaterial;
  private readonly compositeMaterial: THREE.ShaderMaterial;
  private readonly quad = new FullScreenQuad();
  private readonly clearColor = new THREE.Color();
  private readonly texel = new THREE.Vector2(1, 1);
  private resolution: number;
  private blurRounds: number;
  private width = 1;
  private height = 1;

  constructor(camera: THREE.PerspectiveCamera, uniforms: MatterUniforms, opts: FluidPassOptions = {}) {
    super();
    this.camera = camera;
    this.resolution = opts.resolution ?? 1;
    this.blurRounds = opts.blurRounds ?? 5;
    const liquid = createMatterLiquidMaterials(uniforms);
    this.liquidUniforms = liquid.uniforms;
    this.depthMaterial = liquid.depth;
    this.thicknessMaterial = liquid.thickness;

    // Full float for depth: half float terraces depth at viewing distance into stripes.
    const nearest = { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
    this.depthRT = new THREE.WebGLRenderTarget(1, 1, { ...nearest, depthBuffer: true });
    this.blurA = new THREE.WebGLRenderTarget(1, 1, { ...nearest, depthBuffer: false });
    this.blurB = new THREE.WebGLRenderTarget(1, 1, { ...nearest, depthBuffer: false });
    this.thickRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });

    this.liquidPoints = new THREE.Points(new THREE.BufferGeometry(), this.depthMaterial);
    this.thickPoints = new THREE.Points(new THREE.BufferGeometry(), this.thicknessMaterial);
    this.liquidPoints.frustumCulled = false;
    this.thickPoints.frustumCulled = false;
    this.liquidScene.add(this.liquidPoints);
    this.thickScene.add(this.thickPoints);

    this.blurMaterial = new THREE.ShaderMaterial({
      uniforms: { tIn: { value: null }, uStep: { value: new THREE.Vector2() }, uFalloff: { value: 6 } },
      vertexShader: QUAD_VS,
      // R: depth averaged only with samples at a similar depth (keeps silhouettes); G: coverage.
      fragmentShader: /* glsl */ `uniform sampler2D tIn; uniform vec2 uStep; uniform float uFalloff; varying vec2 vUv;
void main(){
  float d0=texture2D(tIn,vUv).r; float cov=0.,cw=0.,ds=0.,dw=0.;
  for(int i=-7;i<=7;i++){
    vec4 s=texture2D(tIn,vUv+uStep*float(i)); float g=exp(-float(i*i)/24.);
    cov+=s.g*g; cw+=g;
    if(s.r>0. && d0>0.){ float k=(s.r-d0)*uFalloff; float w=g*exp(-k*k); ds+=s.r*w; dw+=w; }
  }
  gl_FragColor=vec4(d0>0.&&dw>0.?ds/dw:0.,cov/cw,0.,1.);
}`,
    });

    this.compositeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, tFluid: { value: null }, tThick: { value: null },
        uTexel: { value: new THREE.Vector2() }, uTan: { value: new THREE.Vector2(1, 1) },
        uMix: { value: 0 }, uTime: { value: 0 }, uShimmer: { value: 0 },
        uTint: { value: new THREE.Color(0x958cd6) }, uSkyLo: { value: new THREE.Color(0x1d1a36) }, uSkyHi: { value: new THREE.Color(0x888599) },
      },
      vertexShader: QUAD_VS,
      fragmentShader: /* glsl */ `uniform sampler2D tDiffuse,tFluid,tThick; uniform vec2 uTexel,uTan; uniform float uMix,uTime,uShimmer; uniform vec3 uTint,uSkyLo,uSkyHi; varying vec2 vUv;
vec3 vpos(vec2 uv,float d){ return vec3((uv*2.-1.)*uTan,-1.)*d; }
vec3 edge(vec2 uv,vec3 P,vec2 o){
  float a=texture2D(tFluid,uv+o).r, b=texture2D(tFluid,uv-o).r;
  vec3 f=a>0.?vpos(uv+o,a)-P:vec3(0.), r=b>0.?P-vpos(uv-o,b):vec3(0.);
  if(a<=0.) return r; if(b<=0.) return f; return abs(r.z)<abs(f.z)?r:f;
}
void main(){
  vec4 scene=texture2D(tDiffuse,vUv); vec4 fl=texture2D(tFluid,vUv);
  float cov=smoothstep(.3,.62,fl.g)*uMix;
  if(fl.r<=0.||cov<=0.){ gl_FragColor=scene; return; }
  vec3 P=vpos(vUv,fl.r);
  // A lone droplet pixel has no neighbours to take a slope from: face it at the camera
  // rather than normalising a zero vector (NaN, which a glow pass would spread).
  vec3 cr=cross(edge(vUv,P,vec2(uTexel.x,0.)),edge(vUv,P,vec2(0.,uTexel.y)));
  vec3 N=dot(cr,cr)>1e-12?normalize(cr):vec3(0.,0.,1.);
  if(N.z<0.) N=-N;
  // A settled puddle shimmers: slow crossing ripples tilt the normals of up-facing liquid.
  if(uShimmer>0.){
    float up=smoothstep(.3,.8,N.y);
    vec2 w=vec2(sin(vUv.x*95.+uTime*1.6+sin(vUv.y*55.+uTime*.9)*1.6),sin(vUv.y*120.-uTime*1.3+sin(vUv.x*65.-uTime*.7)*1.4));
    N=normalize(N+vec3(w.x,0.,w.y)*.08*uShimmer*up);
  }
  vec3 V=normalize(-P); float ndv=max(dot(N,V),0.);
  float fres=.03+.97*pow(1.-ndv,5.);
  float th=texture2D(tThick,vUv).r;
  vec3 behind=texture2D(tDiffuse,clamp(vUv+N.xy*.09,0.,1.)).rgb;
  vec3 absorb=exp(-(vec3(1.)-uTint)*th*2.6);
  vec3 body=behind*absorb+uTint*(1.-exp(-th*1.4))*.36;
  vec3 refl=mix(uSkyLo,uSkyHi,N.y*.5+.5)*1.4;
  vec3 L1=normalize(vec3(-.45,.75,.55)), L2=normalize(vec3(.6,.2,.8));
  float inner=smoothstep(.62,.95,fl.g);
  float spec=(pow(max(dot(N,normalize(L1+V)),0.),90.)*1.8+pow(max(dot(N,normalize(L2+V)),0.),28.)*.35)*inner;
  vec3 col=mix(body,refl,fres*inner)+spec+uTint*pow(1.-ndv,3.)*.3;
  if(any(isnan(col))||any(isinf(col))) col=scene.rgb;
  gl_FragColor=vec4(mix(scene.rgb,col,cov),scene.a);
}`,
    });
  }

  /** The particle geometry from `sampleMatter` (shared with the sprite Points). */
  setGeometry(geometry: THREE.BufferGeometry): void {
    this.liquidPoints.geometry = geometry;
    this.thickPoints.geometry = geometry;
  }

  /** How much of the frame is liquid: the Liquid form weight (0..1). */
  set mix(v: number) { (this.compositeMaterial.uniforms.uMix as { value: number }).value = v; }
  get mix(): number { return (this.compositeMaterial.uniforms.uMix as { value: number }).value; }

  /** 0..1: ripple shimmer on a settled puddle. */
  set shimmer(v: number) { (this.compositeMaterial.uniforms.uShimmer as { value: number }).value = v; }

  set time(v: number) { (this.compositeMaterial.uniforms.uTime as { value: number }).value = v; }

  /** Liquid tint, and the low/high colours of what it reflects. */
  setPalette(tint: THREE.ColorRepresentation, skyLow: THREE.ColorRepresentation, skyHigh: THREE.ColorRepresentation): void {
    const u = this.compositeMaterial.uniforms;
    (u.uTint!.value as THREE.Color).set(tint);
    (u.uSkyLo!.value as THREE.Color).set(skyLow);
    (u.uSkyHi!.value as THREE.Color).set(skyHigh);
  }

  setQuality(opts: FluidPassOptions): void {
    if (opts.resolution !== undefined) this.resolution = opts.resolution;
    if (opts.blurRounds !== undefined) this.blurRounds = opts.blurRounds;
    this.setSize(this.width, this.height);
  }

  override setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    const rw = Math.max(1, Math.round(width * this.resolution));
    const rh = Math.max(1, Math.round(height * this.resolution));
    this.depthRT.setSize(rw, rh);
    this.blurA.setSize(rw, rh);
    this.blurB.setSize(rw, rh);
    this.thickRT.setSize(Math.max(1, Math.round(rw / 2)), Math.max(1, Math.round(rh / 2)));
    this.texel.set(1 / rw, 1 / rh);
    (this.compositeMaterial.uniforms.uTexel!.value as THREE.Vector2).copy(this.texel);
    this.updateCamera(rh);
  }

  private updateCamera(targetHeight: number): void {
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    (this.compositeMaterial.uniforms.uTan!.value as THREE.Vector2).set(tanHalf * this.camera.aspect, tanHalf);
    this.liquidUniforms.uDepthScale.value = targetHeight / (2 * tanHalf);
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.liquidUniforms.uProj.value.copy(this.camera.projectionMatrix);
    this.updateCamera(this.depthRT.height);
    renderer.getClearColor(this.clearColor);
    const clearAlpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(this.depthRT); renderer.clear(); renderer.render(this.liquidScene, this.camera);
    renderer.setRenderTarget(this.thickRT); renderer.clear(); renderer.render(this.thickScene, this.camera);
    let src = this.depthRT;
    const step = this.blurMaterial.uniforms.uStep!.value as THREE.Vector2;
    this.quad.material = this.blurMaterial;
    for (let i = 0; i < this.blurRounds; i++) {
      for (const [dst, dx, dy] of [[this.blurA, 1, 0], [this.blurB, 0, 1]] as const) {
        this.blurMaterial.uniforms.tIn!.value = src.texture;
        // Dense taps: skipping pixels between taps aliases into a fine checker.
        step.set(dx * this.texel.x * 1.4, dy * this.texel.y * 1.4);
        renderer.setRenderTarget(dst); this.quad.render(renderer); src = dst;
      }
    }
    renderer.setClearColor(this.clearColor, clearAlpha);
    const u = this.compositeMaterial.uniforms;
    u.tDiffuse!.value = readBuffer.texture; u.tFluid!.value = src.texture; u.tThick!.value = this.thickRT.texture;
    this.quad.material = this.compositeMaterial;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  override dispose(): void {
    for (const rt of [this.depthRT, this.blurA, this.blurB, this.thickRT]) rt.dispose();
    for (const m of [this.depthMaterial, this.thicknessMaterial, this.blurMaterial, this.compositeMaterial]) m.dispose();
    this.quad.dispose();
  }
}
