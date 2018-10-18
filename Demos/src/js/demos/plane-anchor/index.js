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
  Mesh,
  MeshNormalMaterial
} from 'three';
import OrbitControls from '../../lib/OrbitControls';
import ARKit from '../../arkit/arkit';
import ARConfig from '../../arkit/config';
import ARCamera from '../../arkit/camera';
import {
  ARAnchorPlane,
  ARAnchor,
  AR_ANCHOR,
  AR_PLANE_ANCHOR
} from '../../objects/anchors';
import ARPlaneIndicator from '../../objects/plane-indicator';
import { IS_NATIVE, ARTrackingStates } from '../../arkit/constants';
import RenderStats from '../../lib/render-stats';
import stats from '../../lib/stats';
import TouchControls from '../../lib/touch-controls';
import { controller } from '../gui';

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
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(this.renderer.domElement);

    // Scene
    this.scene = new Scene();

    // Cameras
    const fov = 70;
    const ratio = window.innerWidth / window.innerHeight;
    const near = 0.1;
    const far = 1000;
    const zoom = 0.5;
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

    // Plane indicator
    this.planeIndicator = new ARPlaneIndicator();
    this.scene.add(this.planeIndicator.mesh);

    this.lights.directional.position.set(1, 1, 1);
    this.scene.add(this.lights.ambient);
    this.scene.add(this.lights.directional);

    // Use same geometry for all cubes
    const anchorSize = 0.1; // 10cm
    const geometry = new BoxBufferGeometry(anchorSize, anchorSize, anchorSize);
    geometry.applyMatrix(new Matrix4().makeTranslation(0, anchorSize / 2, 0));

    this.anchorMesh = new Mesh(geometry, new MeshNormalMaterial());
    this.anchorMesh.visible = false;
    this.scene.add(this.anchorMesh);

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
    ARKit.on('trackingStateChange', this.onARTrackingStateChange);
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

    this.planeIndicator.update(this.cameras.ar, Object.values(this.anchors));
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

  onARTrackingStateChange = trackingState => {
    controller.trackingState = trackingState;
    switch (trackingState) {
      case ARTrackingStates.normal:
        console.log('Tracking normal'); // eslint-disable-line no-console
        break;
      case ARTrackingStates.notAvailable:
        console.log('Tracking not available'); // eslint-disable-line no-console
        break;
      case ARTrackingStates.excessiveMotion:
        console.log('Too much camera motion'); // eslint-disable-line no-console
        break;
      case ARTrackingStates.insufficientFeatures:
        console.log('Not enough features'); // eslint-disable-line no-console
        break;
      case ARTrackingStates.initializing:
        console.log('Initialising'); // eslint-disable-line no-console
        break;
      case ARTrackingStates.relocalizing:
        console.log('Relocalising'); // eslint-disable-line no-console
        break;
      default:
        break;
    }
  };

  onTouch = () => {
    if (this.planeIndicator.tracking) {
      const position = this.planeIndicator.getPosition();
      const anchors = Object.values(this.anchors).filter(
        anchor => anchor.type === AR_ANCHOR
      );
      const identifiers = anchors.map(anchor => anchor.identifier);
      ARKit.removeAnchors(identifiers);
      const transform = new Matrix4();
      transform.makeTranslation(position.x, position.y, position.z);
      ARKit.addAnchor(transform.toArray());
    }
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

  addARAnchor(anchor) {
    switch (anchor.type) {
      case AR_PLANE_ANCHOR: {
        this.anchors[anchor.identifier] = new ARAnchorPlane(anchor);
        break;
      }
      default: {
        this.anchors[anchor.identifier] = new ARAnchor(anchor);
        this.anchorMesh.visible = true;
        this.anchors[anchor.identifier].group.add(this.anchorMesh);
        break;
      }
    }

    console.log('adding', anchor.identifier); // eslint-disable-line
    this.scene.add(this.anchors[anchor.identifier].group);
  }

  updateARAnchor(anchor) {
    this.anchors[anchor.identifier].update(anchor);
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
