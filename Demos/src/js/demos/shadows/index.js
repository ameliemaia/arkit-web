import {
  WebGLRenderer,
  Scene,
  PerspectiveCamera,
  Object3D,
  Vector2,
  Vector3,
  GridHelper,
  AxisHelper,
  PCFSoftShadowMap,
  AmbientLight,
  DirectionalLight,
  SpotLight,
  Matrix4
} from 'three';
import OrbitControls from '../../lib/OrbitControls';
import ARKit from '../../arkit/arkit';
import ARConfig from '../../arkit/config';
import ARCamera from '../../arkit/camera';
import {
  ARAnchorPlane,
  ARAnchor,
  AR_PLANE_ANCHOR,
  AR_ANCHOR
} from '../../objects/anchors';
import { IS_NATIVE, ARTrackingStates } from '../../arkit/constants';
import RenderStats from '../../lib/render-stats';
import stats from '../../lib/stats';
import TouchControls from '../../lib/touch-controls';
import ARPlaneIndicator from '../../objects/plane-indicator';

// Objects
import Floor from './objects/floor/floor';
import Primitive from './objects/primitive/primitive';
import { controller } from '../gui';

// Constants
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
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(this.renderer.domElement);

    // Scene
    this.scene = new Scene();

    // Cameras
    const fov = 70;
    const ratio = window.innerWidth / window.innerHeight;
    const near = 0.1;
    const far = 1000;
    const zoom = 1;
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
      directional: new DirectionalLight(0xffffff, 1),
      spot: new SpotLight(0xffffff, 1)
    };

    this.lights.spot.position.set(0.25, 0.95, 0.25);

    this.lights.spot.castShadow = true;
    this.lights.spot.shadow.mapSize.width = 1024;
    this.lights.spot.shadow.mapSize.height = 1024;

    this.lights.spot.shadow.camera.near = 1;
    this.lights.spot.shadow.camera.far = 500;
    this.lights.spot.shadow.camera.fov = 60;

    this.scene.add(this.lights.ambient);
    this.scene.add(this.lights.directional);
    this.scene.add(this.lights.spot);

    // Plane indicator
    this.planeIndicator = new ARPlaneIndicator();
    this.scene.add(this.planeIndicator.mesh);

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

    this.floorVector = new Vector3(0, Infinity, 0);
    this.floorPositionY = Infinity;
    this.container = new Object3D();
    this.container.visible = false;
    this.scene.add(this.container);

    this.addObjects();
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

  addObjects() {
    const floor = new Floor(this.container); // eslint-disable-line no-unused-vars

    const data = [
      { type: 'box', position: new Vector2(0, 0), scale: 1.4 },
      { type: 'sphere', position: new Vector2(-0.4, -0.4), scale: 4 },
      { type: 'sphere', position: new Vector2(0.2, -0.4), scale: 1.5 },
      { type: 'box', position: new Vector2(-0.5, 0.4), scale: 2.5 },
      { type: 'cone', position: new Vector2(0.5, 0.4), scale: 2.5 }
    ];

    for (let i = 0; i < data.length; i += 1) {
      const primitive = new Primitive( // eslint-disable-line no-unused-vars
        this.container,
        data[i].type,
        data[i].position,
        data[i].scale,
        i / data.length - 1
      );
    }
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

  removeAnchors = () => {
    console.log('remove all anchors'); // eslint-disable-line no-console
    const identifiers = Object.keys(this.anchors);
    ARKit.removeAnchors(identifiers);
  };

  onARAnchorsAdded = data => {
    console.log('onAnchorsAdded', data); // eslint-disable-line no-console
  };

  onARAnchorsRemoved = data => {
    data.anchors.forEach(anchor => {
      if (this.anchors[anchor.identifier]) {
        this.scene.remove(this.anchors[anchor.identifier]);
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

  addARAnchor(anchor) {
    switch (anchor.type) {
      case AR_PLANE_ANCHOR: {
        this.anchors[anchor.identifier] = new ARAnchorPlane(anchor);
        // Hide the grid mesh
        this.anchors[anchor.identifier].group.visible = false;
        break;
      }
      default: {
        this.anchors[anchor.identifier] = new ARAnchor(anchor);
        this.anchors[anchor.identifier].group.add(this.container);
        this.container.visible = true;
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
