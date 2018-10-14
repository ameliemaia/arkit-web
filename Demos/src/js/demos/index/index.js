import {
  WebGLRenderer,
  Scene,
  PerspectiveCamera,
  Vector3,
  GridHelper,
  AxisHelper,
  AmbientLight,
  DirectionalLight,
  Matrix4,
  BoxBufferGeometry,
  MeshLambertMaterial,
  Color,
  Mesh
} from 'three';
import '../gui';
import OrbitControls from '../../lib/OrbitControls';
import ARKit from '../../arkit/arkit';
import ARConfig from '../../arkit/config';
import ARCamera from '../../arkit/camera';
import {
  ARAnchor,
  ARAnchorPlane,
  AR_PLANE_ANCHOR
} from '../../objects/anchors';
import { IS_NATIVE } from '../../arkit/constants';
import RenderStats from '../../lib/render-stats';
import stats from '../../lib/stats';
import TouchControls from '../../lib/touch-controls';

// Use same geometry for all cubes
const anchorSize = 0.1; // 10cm
const anchorGeometry = new BoxBufferGeometry(
  anchorSize,
  anchorSize,
  anchorSize
);
anchorGeometry.applyMatrix(new Matrix4().makeTranslation(0, anchorSize / 2, 0));

const SHOW_STATS = false;

class App {
  constructor() {
    // Set the config
    ARConfig.imageFrame = false;
    ARConfig.pointCloud = false;

    // Renderer
    this.renderer = new WebGLRenderer({
      alpha: true
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(this.renderer.domElement);

    // Scene
    this.scene = new Scene();

    // Cameras
    const fov = 70;
    const ratio = window.innerWidth / window.innerHeight;
    const near = 0.1;
    const far = 1000;
    const zoom = 10;
    this.cameras = {
      dev: new PerspectiveCamera(fov, ratio, near, far),
      ar: new ARCamera()
    };
    this.cameras.main = IS_NATIVE ? this.cameras.ar : this.cameras.dev;

    this.cameras.dev.position.set(1 * zoom, 0.75 * zoom, 1 * zoom);
    this.cameras.dev.lookAt(new Vector3());

    // UI
    this.ui = {
      interruptedOverlay: document.querySelector('.overlay-session-interupted')
    };

    // Lights
    this.lights = {
      ambient: new AmbientLight(0xd4d4d4),
      directional: new DirectionalLight(0xffffff, 0.6)
    };

    this.lights.directional.position.set(1, 1, 1);
    this.scene.add(this.lights.ambient);
    this.scene.add(this.lights.directional);

    // Stats
    if (SHOW_STATS) {
      this.renderStats = new RenderStats();
      this.renderStats.domElement.style.position = 'absolute';
      this.renderStats.domElement.style.left = '0px';
      this.renderStats.domElement.style.top = '48px';
      document.body.appendChild(this.renderStats.domElement);
      document.body.appendChild(stats.domElement);
    }

    // Controls
    this.touchControls = new TouchControls(this.renderer.domElement);

    // Resize timeout id
    this.resizeTimeout = 0;

    // Map of anchors
    // identifier is the key
    this.anchors = {};

    this.bindListeners();
    this.onResize();

    if (!IS_NATIVE) {
      this.orbitControls = new OrbitControls(
        this.cameras.dev,
        this.renderer.domElement
      );
      this.scene.add(new GridHelper());
      this.scene.add(new AxisHelper());
    }
    this.render();
  }

  bindListeners() {
    window.addEventListener('resize', this.onResize, false);
    this.touchControls.on('end', this.onTouch);

    ARKit.on('frame', this.onARFrame);
    ARKit.on('anchorsAdded', this.onARAnchorsAdded);
    ARKit.on('anchorsRemoved', this.onARAnchorsRemoved);
    ARKit.on('sessionInterupted', this.onARSessionInterupted);
    ARKit.on('sessionInteruptedEnded', this.onARSessionInteruptedEnded);
  }

  onARFrame = data => {
    this.lights.ambient.intensity = data.ambientIntensity;
    this.cameras.ar.update(data.camera);

    data.anchors.forEach(anchor => {
      if (this.anchors[anchor.identifier] === undefined) {
        this.addARAnchor(anchor);
      } else {
        this.updateARAnchor(anchor);
      }
    });
  };

  onARAnchorsAdded = data => {
    console.log('onAnchorsAdded', data); // eslint-disable-line no-console
  };

  onARAnchorsRemoved = data => {
    data.anchors.forEach(anchor => {
      if (this.anchors[anchor.identifier]) {
        this.scene.remove(this.anchors[anchor.identifier].group);
      }
    });
  };

  addARAnchor(anchor) {
    switch (anchor.type) {
      case AR_PLANE_ANCHOR: {
        this.anchors[anchor.identifier] = new ARAnchorPlane(anchor);
        break;
      }
      default: {
        const mesh = new Mesh(
          anchorGeometry,
          new MeshLambertMaterial({
            color: new Color().setHSL(Math.random(), 0.5, 0.7)
          })
        );
        this.anchors[anchor.identifier] = new ARAnchor(anchor);
        this.anchors[anchor.identifier].group.add(mesh);
        break;
      }
    }

    console.log('adding', anchor.identifier); // eslint-disable-line
    this.scene.add(this.anchors[anchor.identifier].group);
  }

  updateARAnchor(anchor) {
    this.anchors[anchor.identifier].update(anchor);
  }

  onARSessionInterupted = () => {
    this.ui.interruptedOverlay.classList.add(
      'overlay-session-interrupted--active'
    );
  };

  onARSessionInteruptedEnded = () => {
    this.ui.interruptedOverlay.classList.remove(
      'overlay-session-interrupted--active'
    );
  };

  onTouch = () => {
    const transform = new Matrix4();
    transform.compose(
      this.cameras.main.position,
      this.cameras.main.quaternion,
      new Vector3(1, 1, 1)
    );
    const forward = new Matrix4();
    // Position in front of camera 50cm
    forward.setPosition(new Vector3(0, 0, -0.5));
    transform.multiply(forward);
    ARKit.addAnchor(transform.toArray());
  };

  update() {
    if (SHOW_STATS) {
      stats.begin();
    }

    this.renderer.render(this.scene, this.cameras.ar);

    if (SHOW_STATS) {
      this.renderStats.update(this.renderer);
      stats.end();
    }
  }

  render = () => {
    requestAnimationFrame(this.render);
    if (SHOW_STATS) {
      stats.begin();
    }

    this.renderer.render(this.scene, this.cameras.main);

    if (SHOW_STATS) {
      this.renderStats.update(this.renderer);
      stats.end();
    }
  };

  onResize = () => {
    // Add a delay as the screen dimensions are not changed straight away
    clearTimeout(this.resizeTimeout);
    this.resizeTimeout = setTimeout(() => {
      this.resize();
    }, 300);
  };

  resize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.cameras.dev.aspect = window.innerWidth / window.innerHeight;
    this.cameras.dev.updateProjectionMatrix();
  }
}

export default new App();
