import dat from 'dat-gui';
import ARKit from '../arkit/arkit';
import { IS_NATIVE } from '../arkit/constants';

const demos = ['anchors', 'plane-anchor', 'bubbles', 'pointcloud', 'shadows'];

const path = window.location.pathname.split('/');
let demo = path[path.length - 1].replace('.html', '').replace('/', '');

// For index
demo = demo === '' || demo === 'index' ? demos[0] : demo;

const controller = {
  framework: 'ARKit Web',
  demo,
  trackingState: ''
};

const gui = new dat.GUI();
gui.add(controller, 'framework');
gui
  .add(controller, 'trackingState')
  .name('tracking state')
  .listen();
gui.open();

gui.add(controller, 'demo', demos).onChange(value => {
  const page = value === demos[0] ? 'index' : value;
  if (IS_NATIVE) {
    ARKit.loadPage(page);
  } else {
    window.location.href = `${page}.html`;
  }
});

export default gui;
export { controller };
