//
//  ViewController.swift
//  ARKitWeb
//
//  Created by Amelie Rosser on 21/07/2017.
//  Copyright © 2017 Stink Studios. All rights reserved.
//

import UIKit
import Metal
import MetalKit
import ARKit
import WebKit

extension MTKView : RenderDestinationProvider {
}

class ViewController: UIViewController, MTKViewDelegate, ARSessionDelegate, WKScriptMessageHandler {

    let DEBUG = true
    let DEFAULT_DEMO = "index"

    var session: ARSession!
    var renderer: Renderer!
    var webView: FullScreenWKWebView!
    var orientation: UIInterfaceOrientation!

    // The current viewport size
    var viewportSize: CGSize = CGSize()

    var imageUtil: ImageUtil!

    override func viewDidLoad() {
        super.viewDidLoad()

        // Set the view's delegate
        session = ARSession()
        session.delegate = self

        orientation = .portrait;
        updateOrientation()

        // Set the view to use the default device
        if let view = self.view as? MTKView {
            view.device = MTLCreateSystemDefaultDevice()
            view.backgroundColor = UIColor.clear
            view.delegate = self

            // Create web view
            let contentController = WKUserContentController();

            contentController.add(
                self,
                name: "callbackHandler"
            )

            let config = WKWebViewConfiguration()
            config.userContentController = contentController

            viewportSize = view.bounds.size

            webView = FullScreenWKWebView(frame: CGRect(origin: CGPoint.init(x: 0, y: 0), size: view.bounds.size), configuration: config)
            webView.isOpaque = false
            webView.backgroundColor = UIColor.clear
            webView.scrollView.backgroundColor = UIColor.clear
            webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            webView.scrollView.bounces = false;

            // Add the webview as a subview of MTKView
            view.addSubview(webView)

            // Load first demo
            self.loadWebPage(page: DEFAULT_DEMO)

            guard view.device != nil else {
                print("Metal is not supported on this device")
                return
            }

            // Configure the renderer to draw to the view
            renderer = Renderer(session: session, metalDevice: view.device!, renderDestination: view)

            renderer.drawRectResized(size: view.bounds.size)
        }

        imageUtil = ImageUtil()
    }

    // Hide the status bar
    override var prefersStatusBarHidden: Bool {
        return true
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)

        // Create a session configuration
        // Reference: https://developer.apple.com/documentation/arkit/arworldtrackingsessionconfiguration
        let configuration = ARWorldTrackingConfiguration()
        configuration.worldAlignment = .gravity
        configuration.planeDetection = .horizontal

        // https://developer.apple.com/documentation/arkit/arworldtrackingconfiguration/2942262-isautofocusenabled
        if #available(iOS 11.3, *) {
            configuration.isAutoFocusEnabled = true // or false
        }

        // Run the view's session
        session.run(configuration)

        updateOrientation()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)

        // Pause the view's session
        session.pause()
    }

    override func didReceiveMemoryWarning() {
        super.didReceiveMemoryWarning()
        // Release any cached data, images, etc that aren't in use.
    }

    func updateOrientation(){
      if UIDevice.current.orientation == UIDeviceOrientation.landscapeLeft {
        orientation = .landscapeRight
      } else if UIDevice.current.orientation == UIDeviceOrientation.landscapeRight {
        orientation = .landscapeLeft
      } else if UIDevice.current.orientation == UIDeviceOrientation.portraitUpsideDown {
        orientation = .portraitUpsideDown
      } else if UIDevice.current.orientation == UIDeviceOrientation.portrait {
        orientation = .portrait
      }
    }

    /**
     Add an anchor to the session
     The tap is currently initiated from the web view since it captures all guestures

     Reference: https://developer.apple.com/documentation/arkit/aranchor
     */
    func addAnchor() {
        if let currentFrame = session.currentFrame {
            // Create a transform with a translation of 0.2 meters in front of the camera
            var translation = matrix_identity_float4x4
            translation.columns.3.z = -1
            let transform = simd_mul(currentFrame.camera.transform, translation)

            // Add a new anchor to the session
            let anchor = ARAnchor(transform: transform)

            // print("addAnchor \(anchor.identifier)")

            session.add(anchor: anchor)
        }
    }

    func removeAnchors(identifiers: [NSString]) {
        // print("removeAnchors")
        // print(identifiers)

        if let currentFrame = session.currentFrame {
            for (_, anchor) in currentFrame.anchors.enumerated() {
                for (_, identifier) in identifiers.enumerated() {
                    let uuid = UUID.init(uuidString: identifier as String)
                    if (uuid == anchor.identifier) {
                        session.remove(anchor: anchor)
                    }
                }
            }
        }
    }

    func simdFloat4x4ToArray(m: simd_float4x4) -> [Float] {
        return [m.columns.0.x, m.columns.0.y, m.columns.0.z, m.columns.0.w,
                m.columns.1.x, m.columns.1.y, m.columns.1.z, m.columns.1.w,
                m.columns.2.x, m.columns.2.y, m.columns.2.z, m.columns.2.w,
                m.columns.3.x, m.columns.3.y, m.columns.3.z, m.columns.3.w]
    }

    func simdFloat3ToArray(v: simd_float3) -> [Float] {
        return [v.x, v.y, v.z]
    }

    func getCameraData(camera: ARCamera) -> Dictionary<String, Any> {
        var data = Dictionary<String, Any>()

        let viewMatrixInverse = camera.viewMatrix(for: orientation).inverse
        var modelMatrix = simdFloat4x4ToArray(m: viewMatrixInverse);
        var quat =  simd_quaternion(viewMatrixInverse);

        // Uncomment if needed (make sure to parse the data in arkit/utils.js)
        data["transform"] = simdFloat4x4ToArray(m: camera.transform)
        // The projection matrix here matches the one in Renderer.swift
        let zNear = CGFloat(ARConfig.camera.near)
        let zFar = CGFloat(ARConfig.camera.far)
        data["projection" ] = simdFloat4x4ToArray(m: camera.projectionMatrix(for: orientation, viewportSize: viewportSize, zNear: zNear, zFar: zFar))
        data["matrixWorldInverse"] = simdFloat4x4ToArray(m: simd_inverse(camera.transform))
        data["position"] = [modelMatrix[12],modelMatrix[13], modelMatrix[14]];
        data["eulerAngles"] = simdFloat3ToArray(v: camera.eulerAngles)
        data["quaternion"] = [quat.vector.x, quat.vector.y, quat.vector.z, quat.vector.w]
        return data
    }

    func getAnchorData(anchor: ARAnchor) -> Dictionary<String, Any> {
        var data = Dictionary<String, Any>()
        data["type"] = "ARAnchor"
        data["identifier"] = String(describing: anchor.identifier)
        data["transform"] = simdFloat4x4ToArray(m: anchor.transform)
        return data
    }

    func getAnchorPlaneData(anchor: ARPlaneAnchor) -> Dictionary<String, Any> {
        var data = Dictionary<String, Any>()
        data["type"] = "ARPlaneAnchor"
        data["identifier"] = String(describing: anchor.identifier)
        data["transform"] = simdFloat4x4ToArray(m: anchor.transform)
        data["center"] = simdFloat3ToArray(v: anchor.center)
        data["extent"] = simdFloat3ToArray(v: anchor.extent)
        return data
    }

    func getAnchorsData(anchors: [ARAnchor]) -> [Any] {
        var data = [Any]()
        for (_, anchor) in anchors.enumerated() {
            switch anchor {
            case let planeAnchor as ARPlaneAnchor:
                data.append(self.getAnchorPlaneData(anchor: planeAnchor))
            default:
                data.append(self.getAnchorData(anchor: anchor))
            }
        }
        return data
    }

    func getPointCloudData(frame: ARFrame) -> Dictionary<String, Any> {
        var pointCloudSize = 0

        if ((frame.rawFeaturePoints?.__count) != nil) {
            pointCloudSize = (frame.rawFeaturePoints?.__count)!
        }

        // https://stackoverflow.com/questions/45222259/arkit-how-do-you-iterate-all-detected-feature-points
        var points = [Any]()
        for index in 0..<pointCloudSize {
            let point = frame.rawFeaturePoints?.__points[index]
            points.append(simdFloat3ToArray(v: point!))
        }

        var data = Dictionary<String, Any>()
        data["points"] = points
        data["count"] = pointCloudSize

        return data
    }

    /**
     Perform a hitTest

     Reference: https://developer.apple.com/documentation/arkit/arframe/2875718-hittest
     */
    func hitTest(point: CGPoint, hitType: NSNumber) {
        if let currentFrame = session.currentFrame {
            let hitTestResults = currentFrame.hitTest(point, types: ARHitTestResult.ResultType(rawValue: ARHitTestResult.ResultType.RawValue(truncating: hitType)))

            var data = Dictionary<String, Any>()
            var results = [Any]()

            for (_, result) in hitTestResults.enumerated() {
                var hitTest = Dictionary<String, Any>()
                hitTest["type"] = result.type.rawValue

                switch(result.type) {
                case ARHitTestResult.ResultType.featurePoint:
                    hitTest["localTransform"] = simdFloat4x4ToArray(m: result.localTransform)
                    hitTest["worldTransform"] = simdFloat4x4ToArray(m: result.worldTransform)
                case ARHitTestResult.ResultType.estimatedHorizontalPlane:
                    hitTest["distance"] = result.distance
                    hitTest["localTransform"] = simdFloat4x4ToArray(m: result.localTransform)
                    hitTest["worldTransform"] = simdFloat4x4ToArray(m: result.worldTransform)
                case ARHitTestResult.ResultType.existingPlane:
                    hitTest["distance"] = result.distance
                    hitTest["localTransform"] = simdFloat4x4ToArray(m: result.localTransform)
                    hitTest["worldTransform"] = simdFloat4x4ToArray(m: result.worldTransform)
                    hitTest["anchor"] = self.getAnchorPlaneData(anchor: result.anchor! as! ARPlaneAnchor)
                case ARHitTestResult.ResultType.existingPlaneUsingExtent:
                    hitTest["distance"] = result.distance
                    hitTest["localTransform"] = simdFloat4x4ToArray(m: result.localTransform)
                    hitTest["worldTransform"] = simdFloat4x4ToArray(m: result.worldTransform)
                    hitTest["anchor"] = self.getAnchorPlaneData(anchor: result.anchor! as! ARPlaneAnchor)
                default:
                    break
                }

                results.append(hitTest)
            }

            data["results"] = results

            do {
                let json = try JSONSerialization.data(withJSONObject: data, options: JSONSerialization.WritingOptions(rawValue: 0))
                let jsonData = NSString(data: json, encoding: String.Encoding.utf8.rawValue)!

                let api = "ARKit.onHitTest('\(jsonData)\')";
                self.callClient(api: api)
            } catch {
                print("error serialising json")
            }
        }

    }

    /**
     Update the ARConfig
     */
    func updateARConfig(config: NSDictionary) {
        let camera = config["camera"] as! NSDictionary
        ARConfig.camera.far = camera["far"] as! Double
        ARConfig.camera.near = camera["near"] as! Double
        ARConfig.pointCloud = config["pointCloud"] as! Bool
        ARConfig.imageFrame = config["imageFrame"] as! Bool
    }

    /**
     Load a web page
     */
    func loadWebPage(page: String) {
        if (DEBUG) {

            let DEV_URL = Bundle.main.infoDictionary!["DEV_URL"] as! String
            let demoUrl = "\(DEV_URL)/\(page).html"

            let url = URL(string: demoUrl)!
            webView.load(URLRequest(url: url))
        } else {
            if let path = Bundle.main.path(forResource: "www/\(page)", ofType: "html") {
                webView.load(URLRequest(url: URL(fileURLWithPath: path)))
            }
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        // Handle message callbacks from javascript
        if(message.name == "callbackHandler") {

            // We send an object from the client, we receive it as a NSDictionary
            let data = message.body as! NSDictionary
            let action = data["action"] as! String

            switch(action) {
            case "config":
                let config = data["value"] as! NSDictionary
                self.updateARConfig(config: config)
            case "addAnchor":
                self.addAnchor()
            case "removeAnchors":
                let identifiers = data["value"] as! [NSString]
                self.removeAnchors(identifiers: identifiers)
            case "hitTest":
                let point = data["value"] as! NSDictionary
                let x = point["x"] as! Double
                let y = point["y"] as! Double
                let hitType = data["hitType"] as! NSNumber
                self.hitTest(point: CGPoint.init(x: x, y: y), hitType: hitType)
            case "loadPage":
                let page = data["value"] as! String
                self.loadWebPage(page: page)
            default: break
            }
        }
    }

    // MARK: - MTKViewDelegate

    // Called whenever view changes orientation or layout is changed
    func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {
        viewportSize = size
        renderer.drawRectResized(size: size)
    }

    // Called whenever the view needs to render
    func draw(in view: MTKView) {
        renderer.update()
    }

    // MARK: - ARSessionDelegate

    func session(_ session: ARSession, didFailWithError error: Error) {
        // Present an error message to the user
      let ERROR_MESSAGE = "This application needs video permission in order to use Augmented Reality"
      self.displayAlertWithMessage(message: ERROR_MESSAGE)
    }

    func displayAlertWithMessage(message: String){

      let alertController = UIAlertController(title: "Permissions", message: message, preferredStyle: .alert)
      let settingsAction = UIAlertAction(title: "Settings", style: .default) { (_) -> Void in
          guard let settingsUrl = URL(string: UIApplicationOpenSettingsURLString) else {
              return
          }
          if UIApplication.shared.canOpenURL(settingsUrl) {
              UIApplication.shared.open(settingsUrl, completionHandler: { (success) in })
          }
      }
      let cancelAction = UIAlertAction(title: "Cancel", style: .default, handler: nil)
      alertController.addAction(cancelAction)
      alertController.addAction(settingsAction)
      self.present(alertController, animated: true, completion: nil)
    }

    /**
     https://developer.apple.com/documentation/arkit/arsessiondelegate/2865611-session

     Implement this method if you provide your own display for rendering an AR experience. The provided ARFrame
     object contains the latest image captured from the device camera, which you can render as a scene background,
     as well as information about camera parameters and anchor transforms you can use for rendering virtual content on top of the camera image.
     */
    func session(_ session: ARSession, didUpdate frame: ARFrame) {
        updateOrientation()

        var ambientIntensity: Float = 1.0
        var ambientColor = [0.0, 0.0, 0.0]

        if let lightEstimate = frame.lightEstimate {
            ambientIntensity = Float(lightEstimate.ambientIntensity) / 1000.0
            ambientColor = kelvinToRGB(temperatureKelvin: frame.lightEstimate!.ambientColorTemperature)
        }

        // Store all data in dict, parse as json to send to the web view
        // floats and matrix strings need to be parsed client side
        var data = Dictionary<String, Any>()
        data["camera"] = self.getCameraData(camera: frame.camera)
        data["anchors"] = self.getAnchorsData(anchors: frame.anchors)
        data["ambientIntensity"] = ambientIntensity
        data["ambientColor"] = ambientColor

        if (ARConfig.imageFrame) {
            data["image"] = imageUtil.getImageData(pixelBuffer: frame.capturedImage, uiOrientation: orientation)
        }

        if (ARConfig.pointCloud) {
            data["pointCloud"] = self.getPointCloudData(frame: frame)
        }

        do {
            let json = try JSONSerialization.data(withJSONObject: data, options: JSONSerialization.WritingOptions(rawValue: 0))
            let jsonData = NSString(data: json, encoding: String.Encoding.utf8.rawValue)!

            let api = "ARKit.onARFrame('\(jsonData)\')";
            self.callClient(api: api);
        } catch {
            print("error serialising json")
        }
    }

    /**
     Call the WKWebView

     @param api The function containing any arguments. To keep things clean all methods are envoked through the 'ARKit' object on the window
     */
    func callClient(api: String) {
        let call = "if(window.ARKit){" + api + "}";
        self.webView.evaluateJavaScript(call, completionHandler: nil)
    }

    /**
     This is called when new anchors are added to the session.

     @param session The session being run.
     @param anchors An array of added anchors.
     */
    func session(_ session: ARSession, didAdd anchors: [ARAnchor]) {
        // print("Anchors added")
        var data = Dictionary<String, Any>()
        data["anchors"] = self.getAnchorsData(anchors: anchors)

        do {
            let json = try JSONSerialization.data(withJSONObject: data, options: JSONSerialization.WritingOptions(rawValue: 0))
            let jsonData = NSString(data: json, encoding: String.Encoding.utf8.rawValue)!

            let api = "ARKit.onAnchorsAdded('\(jsonData)')";
            self.callClient(api: api)
        } catch {
            print("error serialising json")
        }
    }

    /**
     This is called when anchors are updated.

     @param session The session being run.
     @param anchors An array of updated anchors.
     */
    func session(_ session: ARSession, didUpdate anchors: [ARAnchor]) {
        // print("Anchors updated")
        //print(anchors)
    }

    /**
     This is called when anchors are removed from the session.

     @param session The session being run.
     @param anchors An array of removed anchors.
     */
    func session(_ session: ARSession, didRemove anchors: [ARAnchor]) {
        // print("Anchors removed")
        var data = Dictionary<String, Any>()
        data["anchors"] = self.getAnchorsData(anchors: anchors)

        do {
            let json = try JSONSerialization.data(withJSONObject: data, options: JSONSerialization.WritingOptions(rawValue: 0))
            let jsonData = NSString(data: json, encoding: String.Encoding.utf8.rawValue)!

            let api = "ARKit.onAnchorsRemoved('\(jsonData)')";
            self.callClient(api: api)
        } catch {
            print("error serialising json")
        }
    }

    func sessionWasInterrupted(_ session: ARSession) {
        // Inform the user that the session has been interrupted, for example, by presenting an overlay
        // (If the user leaves the app)
        // print("sessionWasInterrupted")
        let api = "ARKit.onSessionInterupted()";
        self.callClient(api: api)
    }

    func sessionInterruptionEnded(_ session: ARSession) {
        // Reset tracking and/or remove existing anchors if consistent tracking is required
        // When the user returns to the app
        // print("sessionInterruptionEnded")
        let api = "ARKit.onSessionInteruptedEnded()";
        self.callClient(api: api)
    }
}

