import { PerspectiveCamera } from 'three';

export default class ARCamera extends PerspectiveCamera {
  update(data) {
    this.quaternion.fromArray(data.quaternion);
    this.position.fromArray(data.position);
    this.projectionMatrix.fromArray(data.projection);
    this.updateMatrix();
  }
}
