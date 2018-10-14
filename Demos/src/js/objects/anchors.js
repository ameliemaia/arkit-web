import {
  Mesh,
  DoubleSide,
  Group,
  Matrix4,
  PlaneBufferGeometry,
  ShaderMaterial,
  Object3D
} from 'three';

export const AR_ANCHOR = 'ARAnchor';
export const AR_PLANE_ANCHOR = 'ARPlaneAnchor';

class Anchor {
  constructor(identifier, type) {
    this.type = type;
    this.identifier = identifier;
  }
}

export class ARAnchor extends Anchor {
  constructor(anchor) {
    super(anchor.identifier, AR_ANCHOR);
    this.group = new Object3D();
    this.group.matrixAutoUpdate = false;
    this.update(anchor);
  }

  update(anchor) {
    this.group.matrix.fromArray(anchor.transform);
  }
}

// Use same geometry for all planes
const planeGeometry = new PlaneBufferGeometry(1, 1, 10, 10);
planeGeometry.applyMatrix(new Matrix4().makeRotationX(Math.PI / 2));

export class ARAnchorPlane extends Anchor {
  constructor(anchor) {
    super(anchor.identifier, AR_PLANE_ANCHOR);
    this.group = new Group();
    this.group.matrixAutoUpdate = false;
    this.mesh = new Mesh(
      planeGeometry,
      new ShaderMaterial({
        wireframe: true,
        transparent: true,
        side: DoubleSide,
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec2 vUv;

          // https://stackoverflow.com/questions/43970170/bordered-rounded-rectangle-in-glsl
          float roundedFrame (vec2 pos, vec2 size, float radius, float thickness)
          {
            float d = length(max(abs(vUv - pos),size) - size) - radius;
            return smoothstep(0.55, 0.0, d / thickness * 5.0);
          }

          void main() {
            float rect = roundedFrame(vec2(0.5), vec2(0.25), 0.225, 0.25);
            gl_FragColor = vec4(vec3(1.0), rect * 0.15);
          }
        `
      })
    );
    this.group.add(this.mesh);
    this.update(anchor);
  }

  update(anchor) {
    this.group.matrix.fromArray(anchor.transform);
    this.mesh.position.fromArray(anchor.center);
    this.mesh.scale.x = anchor.extent[0];
    this.mesh.scale.z = anchor.extent[2];
  }

  getPosition() {
    return [
      this.group.matrix.elements[12],
      this.group.matrix.elements[13],
      this.group.matrix.elements[14]
    ];
  }
}
