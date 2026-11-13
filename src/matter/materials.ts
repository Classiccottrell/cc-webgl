import * as THREE from 'three';
import { MATTER_GLSL } from './glsl.js';

/** Cursor behaviours. Push, Attract and Vortex move particles on screen (and loosen a
 * solid a little); Scatter breaks the form apart under the cursor in its current Form;
 * Wake does that along a fading trail of recent pointer positions. */
export const MatterCursor = { push: 0, attract: 1, vortex: 2, scatter: 3, wake: 4, off: 5 } as const;
export type MatterCursorMode = (typeof MatterCursor)[keyof typeof MatterCursor];

/** Number of pointer marks the Wake trail keeps. */
export const WAKE_TRAIL_LENGTH = 16;

type U<T> = { value: T };
/** Uniforms shared by every matter material. One object drives the sprite, depth and
 * thickness passes, so the three always agree on where each particle is. */
export interface MatterUniforms {
  [name: string]: U<unknown>;
  uTime: U<number>;
  /** 0 Solid, 1 Liquid, 2 Gas; fractional values crossfade. */
  uState: U<number>;
  /** 0 held together, 1 fully apart. */
  uDisperse: U<number>;
  /** Rotation about Y applied to the form before any Form maths, in radians. */
  uSpin: U<number>;
  /** Liquid pools on this object-space height. */
  uFloor: U<number>;
  /** Sprite size in world units, before per-particle variation. */
  uSize: U<number>;
  /** Pixels per world unit at distance 1: viewport height / (2 tan(fov / 2)). */
  uScale: U<number>;
  uPixelRatio: U<number>;
  uAspect: U<number>;
  /** Pointer in normalized device coordinates. */
  uPointer: U<THREE.Vector2>;
  /** 0..1 presence of the pointer (ease it in and out rather than snapping). */
  uPush: U<number>;
  uMode: U<number>;
  uStrength: U<number>;
  /** Falloff constant: 1 / radius², with radius in normalized device units. */
  uReachK: U<number>;
  /** Wake marks: xy in NDC, z strength 0..1 (newest first). */
  uTrail: U<THREE.Vector3[]>;
  uOpacity: U<number>;
  /** A screen-space flow for dispersed matter to ride (see `MatterFlow`): xy directions
   * encoded 0..1, x right and y up. */
  uFlow: U<THREE.Texture>;
  /** How far matter travels along the flow, in viewport heights. 0 turns the flow off. */
  uFlowGain: U<number>;
  /** Journeys along the flow per second, before per-particle variation. */
  uFlowRate: U<number>;
  uColA: U<THREE.Color>;
  uColB: U<THREE.Color>;
  uColC: U<THREE.Color>;
}

/** Still water: what `uFlow` holds until a consumer supplies a flow. Shared, never disposed. */
let stillWater: THREE.DataTexture | null = null;
function stillFlow(): THREE.DataTexture {
  if (!stillWater) {
    stillWater = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    stillWater.needsUpdate = true;
  }
  return stillWater;
}

export function createMatterUniforms(): MatterUniforms {
  return {
    uFlow: { value: stillFlow() }, uFlowGain: { value: 0 }, uFlowRate: { value: 0.11 },
    uTime: { value: 0 }, uState: { value: 0 }, uDisperse: { value: 0 }, uSpin: { value: 0 }, uFloor: { value: -1.5 },
    uSize: { value: 0.022 }, uScale: { value: 400 }, uPixelRatio: { value: 1 }, uAspect: { value: 1 },
    uPointer: { value: new THREE.Vector2(9, 9) }, uPush: { value: 0 }, uMode: { value: MatterCursor.push },
    uStrength: { value: 1 }, uReachK: { value: 1 / (0.22 * 0.22) },
    uTrail: { value: Array.from({ length: WAKE_TRAIL_LENGTH }, () => new THREE.Vector3(9, 9, 0)) },
    uOpacity: { value: 1 }, uColA: { value: new THREE.Color() }, uColB: { value: new THREE.Color() }, uColC: { value: new THREE.Color() },
  };
}

/** One vertex program places every particle for every Form.
 * - Solid: cracks into mixed-size fragments that tumble outward, then crumble; each
 *   particle has its own detach point (earlier near a fragment's edge) after which it
 *   drifts as grit on the Gas currents.
 * - Liquid: follows `liquidAt`; about one particle in twenty falls as a drop that
 *   rejoins the pool, until the body has settled.
 * - Gas: diffuses outward, curls into fine wisps, rises and thins.
 * With DEPTH_PASS the same positions are emitted as spheres for the liquid surface. */
export const MATTER_VERTEX = /* glsl */ `
uniform float uTime,uDisperse,uState,uSpin,uFloor,uSize,uScale,uPixelRatio,uAspect,uPush,uStrength,uReachK;
uniform int uMode; uniform vec2 uPointer; uniform vec3 uTrail[${WAKE_TRAIL_LENGTH}];
uniform sampler2D uFlow; uniform float uFlowGain,uFlowRate;
attribute float aSeed; attribute vec3 aNormal; attribute vec3 aChunkC; attribute vec4 aChunkR;
varying float vAlpha; varying float vSeed; varying float vDepth; varying float vBoost;
#ifdef DEPTH_PASS
uniform float uRadius, uDepthScale; varying vec3 vCenter; varying float vRad;
#endif
${MATTER_GLSL}
void main(){
  float t=uTime;
  vec3 p=rotY(position,uSpin);
  // Scatter and Wake break the form apart locally: the cursor's reach, measured on the
  // undisturbed form, adds to Disperse for the particles under it.
  vec4 c0=projectionMatrix*modelViewMatrix*vec4(p,1.); vec2 n0=c0.xy/c0.w;
  float wS=clamp(1.-uState,0.,1.); float wG=clamp(uState-1.,0.,1.); float wL=1.-wS-wG;
  // Liquid reacts to a tighter cursor (about 0.6x the radius) so a touch disturbs less of the body.
  float reachK=uReachK*mix(1.,2.8,wL);
  float local=0.;
  if(uMode<4) local=reachAt(n0,uPointer,uAspect,reachK)*uPush*(uMode==3?1.:.45);
  if(uMode==4){for(int i=0;i<${WAKE_TRAIL_LENGTH};i++){local=max(local,reachAt(n0,uTrail[i].xy,uAspect,reachK*1.4)*uTrail[i].z);}}
  local*=uStrength;
  float d=clamp(uDisperse+local,0.,1.); float e=d*d*(3.-2.*d); vec3 n=rotY(aNormal,uSpin); vec3 cc=rotY(aChunkC,uSpin);
  vec3 idle=n*snoise(p*2.+t*.4)*.02;
  // solid
  vec3 axis=normalize(aChunkR.xyz+1e-4);
  vec3 sp=cc+rotAxis(p-cc,axis,e*(1.2+aChunkR.w*3.5))+normalize(cc+1e-4)*e*(.7+aChunkR.w*2.);
  sp.y-=e*e*.5;
  float th=.15+aSeed*.85-min(length(position-aChunkC),.6)*.45;
  float er=smoothstep(th,th+.3,e);
  vec3 dust=sp+field(p*1.3+aSeed*2.,t*.14)*e*.8+normalize(p+1e-4)*e*aSeed*.5;
  dust.y+=e*aSeed*.35;
  sp=mix(sp,dust,er);
  // liquid
  float drop=step(.94,aSeed);
  vec3 lp=rotY(liquidAt(position,e,t,uFloor),uSpin);
  float dropOn=drop*(1.-smoothstep(.6,1.,e));
  lp+=n*dropOn*e*(.06+aSeed*.18);
  lp.y-=dropOn*e*fract(t*.22+aSeed*7.)*1.3; lp.y=max(lp.y,uFloor);
  // gas
  vec3 gp=p+normalize(p+1e-4)*e*(.3+aSeed*1.)+field(p*.7+aSeed,t*.12)*e*.85;
  gp+=field(p*2.4+aSeed*3.,t*.35)*e*.32;
  gp.y+=e*aSeed*.9;
  gp+=field(p*1.6,t*.3)*.035*(1.-e);
  vec3 pos=sp*wS+lp*wL+gp*wG+idle*(1.-e);
  vec4 mv=modelViewMatrix*vec4(pos,1.);
  vec4 clip=projectionMatrix*mv;
  vec2 ndc=clip.xy/clip.w; vec2 dv=ndc-uPointer; dv.x*=uAspect;
  float fall=(uMode<3?exp(-dot(dv,dv)*reachK):0.)*uPush*uStrength;
  vec2 dir=dv/max(length(dv),1e-4); vec2 tang=vec2(-dir.y,dir.x); dir.x/=uAspect; tang.x/=uAspect;
  if(uMode==0) mv.xy+=dir*fall*.55*(.4+aSeed);
  if(uMode==1) mv.xy-=dir*fall*.5*(.4+aSeed)*smoothstep(0.,.12,length(dv));
  if(uMode==2) mv.xy+=(tang*.75-dir*.15)*fall*(.4+aSeed);
  // Riding the page's flow: gas, and solid matter once it has crumbled to dust, travel
  // along it. Positions are stateless, so each particle makes the journey on a loop of
  // its own length and phase, fading out at the far end and back in at its place.
  float flowFade=1.;
  if(uFlowGain>0.){
    float ride=clamp(e*(wG+wS*er),0.,1.);
    if(ride>.001){
      float life=fract(t*uFlowRate*(.6+aSeed*.8)+aSeed*7.31);
      vec2 q=ndc; float stepLen=uFlowGain*ride*life*2./5.;
      for(int i=0;i<5;i++){ vec2 f=texture2D(uFlow,clamp(q*.5+.5,0.,1.)).xy*(255./127.)-(128./127.); f.x/=uAspect; q+=f*stepLen; }
      mv.xy+=(q-ndc)*vec2(1./projectionMatrix[0][0],1./projectionMatrix[1][1])*(-mv.z);
      flowFade=mix(1.,sin(3.14159265*life),ride);
    }
  }
  gl_Position=projectionMatrix*mv;
#ifdef DEPTH_PASS
  float rad=uRadius*(.75+aSeed*.5)*mix(1.,.85,drop);
  gl_PointSize=2.*rad*uDepthScale/-mv.z; vCenter=mv.xyz; vRad=rad;
#else
  float size=uSize*(1.-wG*.45)*(1.-wS*er*.4)*(1.+fall*1.2)*(.55+aSeed*.9);
  gl_PointSize=size*uPixelRatio*uScale/-mv.z;
#endif
  // Sprites are hidden in Liquid: the FluidPass draws the liquid from the same particles.
  vAlpha=mix(.6,1.,e)*(1.-wG*e*.5)*(1.-wL)*flowFade; vSeed=aSeed; vDepth=-mv.z;
  vBoost=1.+min(local,1.)*5.+fall*1.5;
}`;

/** Glowing sprites for Solid and Gas. Additive, so set `uOpacity` lower as the count
 * rises (the prototype used sqrt(25000 / count)). */
export function createMatterMaterial(uniforms: MatterUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: MATTER_VERTEX,
    fragmentShader: /* glsl */ `
uniform vec3 uColA,uColB,uColC; uniform float uOpacity;
varying float vAlpha; varying float vSeed; varying float vDepth; varying float vBoost;
void main(){
  vec2 c=gl_PointCoord-.5; float r=dot(c,c)*4.; if(r>1.)discard;
  float a=exp(-r*3.2)*vAlpha*uOpacity*vBoost;
  vec3 col=mix(uColA,uColB,smoothstep(.2,.95,vSeed));
  col=mix(col,uColC,smoothstep(6.5,9.5,vDepth)*.6);
  gl_FragColor=vec4(col,a);
}`,
  });
}

export interface MatterLiquidUniforms extends MatterUniforms {
  /** Sphere radius per particle, world units. */
  uRadius: U<number>;
  /** Target pixels per world unit at distance 1 (set by FluidPass.setSize). */
  uDepthScale: U<number>;
  uProj: U<THREE.Matrix4>;
}

/** The two liquid passes. Their uniforms extend (and share values with) `uniforms`. */
export function createMatterLiquidMaterials(uniforms: MatterUniforms): {
  uniforms: MatterLiquidUniforms; depth: THREE.ShaderMaterial; thickness: THREE.ShaderMaterial;
} {
  const liquid: MatterLiquidUniforms = { ...uniforms, uRadius: { value: 0.062 }, uDepthScale: { value: 300 }, uProj: { value: new THREE.Matrix4() } };
  // Spheres written as linear view depth (R) and coverage (G), with true sphere depth.
  const depth = new THREE.ShaderMaterial({
    uniforms: liquid, defines: { DEPTH_PASS: '' }, vertexShader: MATTER_VERTEX,
    fragmentShader: /* glsl */ `uniform mat4 uProj; varying vec3 vCenter; varying float vRad;
void main(){
  vec2 c=gl_PointCoord*2.-1.; c.y=-c.y; float r2=dot(c,c); if(r2>1.)discard;
  vec3 vp=vCenter+vec3(c,sqrt(1.-r2))*vRad;
  vec4 cp=uProj*vec4(vp,1.); gl_FragDepth=(cp.z/cp.w)*.5+.5;
  gl_FragColor=vec4(-vp.z,1.,0.,1.);
}`,
  });
  // Summed sphere thickness, for absorption.
  const thickness = new THREE.ShaderMaterial({
    uniforms: liquid, defines: { DEPTH_PASS: '' }, vertexShader: MATTER_VERTEX,
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    fragmentShader: /* glsl */ `varying vec3 vCenter; varying float vRad;
void main(){ vec2 c=gl_PointCoord*2.-1.; float r2=dot(c,c); if(r2>1.)discard; gl_FragColor=vec4(2.*sqrt(1.-r2)*vRad,0.,0.,1.); }`,
  });
  return { uniforms: liquid, depth, thickness };
}

/** Form weights as the shader computes them, for consumers deciding what to show. */
export function matterFormWeights(state: number): { solid: number; liquid: number; gas: number } {
  const solid = Math.min(1, Math.max(0, 1 - state));
  const gas = Math.min(1, Math.max(0, state - 1));
  return { solid, liquid: 1 - solid - gas, gas };
}
