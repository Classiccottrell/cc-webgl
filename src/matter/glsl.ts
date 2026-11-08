/** GLSL shared by the matter materials. Simplex noise is Ashima Arts' 3D simplex
 * (MIT). Everything else is matter-specific: a three-channel flow field, the cursor
 * reach falloff, rotation helpers, and the liquid body (`liquidAt`). */
export const MATTER_GLSL = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;
vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
i=mod289(i);vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}
vec3 field(vec3 p,float t){return vec3(snoise(p+vec3(0.,0.,t)),snoise(p+vec3(31.4,0.,t)),snoise(p+vec3(0.,47.2,t)));}
float reachAt(vec2 ndc,vec2 ptr,float aspect,float k){vec2 q=ndc-ptr;q.x*=aspect;return exp(-dot(q,q)*k);}
vec3 rotY(vec3 v,float a){float c=cos(a),s=sin(a);return vec3(c*v.x+s*v.z,v.y,-s*v.x+c*v.z);}
vec3 rotAxis(vec3 v,vec3 a,float ang){return v*cos(ang)+cross(a,v)*sin(ang)+a*dot(a,v)*(1.-cos(ang));}
// Liquid body in object space: slumps under its own weight, runs into smooth drips on the
// lower half and spreads into a pool at floorY. In the last stretch of Disperse it stops
// moving and slumps flat: a puddle is the end state.
vec3 liquidAt(vec3 p,float e,float t,float floorY){
  float settle=smoothstep(.6,1.,e);
  vec3 q=p+field(p*1.1,t*.25)*.14*e*(1.-.45*e)*(1.-.9*settle);
  float sag=.5+.5*snoise(p*1.3+7.);
  q.y-=e*(.6+sag*.7)*(1.+(1.-p.y)*.3);
  q.y-=smoothstep(.2,.7,snoise(vec3(p.xz*1.8,4.2)))*smoothstep(.3,-.9,p.y)*e*.9;
  q.y-=settle*1.6;
  // Below the floor, matter spreads outward; what arrives last sits highest, so the
  // puddle domes slightly.
  if(q.y<floorY){float over=floorY-q.y;q.xz*=1.+over*.45;q.y=floorY+.2*(1.-smoothstep(0.,2.6,over))+sin(over*9.+t*2.)*.01*(1.-settle);}
  return q;
}
`;
