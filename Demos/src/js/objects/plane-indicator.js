import {
  Mesh,
  Raycaster,
  Vector2,
  PlaneBufferGeometry,
  Matrix4,
  ShaderMaterial
} from 'three';
import { AR_PLANE_ANCHOR } from './anchors';

const size = 0.1; // 10cm
const geometry = new PlaneBufferGeometry(size, size, 1, 1);
geometry.applyMatrix(new Matrix4().makeRotationX(-Math.PI / 2));

export default class ARPlaneIndicator {
  constructor() {
    this.tracking = false;
    this.raycaster = new Raycaster();
    this.origin = new Vector2(0.5 * 2 - 1, -0.5 * 2 + 1);

    this.mesh = new Mesh(
      geometry,
      new ShaderMaterial({
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec2 vUv;

          float sdRect(vec2 uv2, vec2 tl, vec2 br) {
            vec2 d = max(tl - uv2, uv2 - br);
            return step(length(max(vec2(0.0), d)) + min(0.0, max(d.x, d.y)), 0.0);
          }

          void main() {
            float rect = 1.0 - sdRect(vUv, vec2(0.1), vec2(0.9));
            gl_FragColor = vec4(rect);
          }
        `,
        transparent: true
      })
    );
  }

  update(camera, anchors) {
    this.objects = [];

    anchors.forEach(anchor => {
      if (anchor.type === AR_PLANE_ANCHOR) {
        this.objects.push(anchor.mesh);
      }
    });

    this.raycaster.setFromCamera(this.origin, camera);

    const intersect = this.raycaster.intersectObjects(this.objects)[0];

    if (intersect) {
      this.mesh.visible = true;
      this.tracking = true;
      this.mesh.position.copy(intersect.point);
      // Add an offset to the y so the mesh doesn't clip with the AR Plane mesh
      this.mesh.position.y += 0.0001;
    } else {
      this.mesh.visible = false;
      this.tracking = false;
    }
  }

  getPosition() {
    return this.mesh.position;
  }
}
