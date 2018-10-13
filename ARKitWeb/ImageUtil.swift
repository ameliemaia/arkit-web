//
//  ImageUtil.swift
//  ARKitWeb
//
//  Created by Amelie Rosser on 27/07/2017.
//  Copyright © 2017 Stink Studios. All rights reserved.
//

import UIKit
import Metal
import MetalKit
import ARKit
import WebKit

class ImageUtil {

    var context: CIContext = CIContext()
    let jpegCompressionQuality: CGFloat = 0.5
    let scale: CGFloat = 0.25;

    func getImageFromSampleBuffer (pixelBuffer: CVPixelBuffer, uiOrientation: UIInterfaceOrientation) -> UIImage? {
        let ciImage = CIImage(cvPixelBuffer: pixelBuffer)
        var resizedCIImage = ciImage.transformed(by: CGAffineTransform(scaleX: scale, y: scale))

        if(uiOrientation == .portrait){
          resizedCIImage = resizedCIImage.transformed(by: CGAffineTransform.init(rotationAngle:.pi * -0.5));
        }else if(uiOrientation == .landscapeLeft){
          resizedCIImage = resizedCIImage.transformed(by: CGAffineTransform.init(rotationAngle:.pi));
        }

        if let image = context.createCGImage(resizedCIImage, from: resizedCIImage.extent) {
            return UIImage(cgImage: image)
        }
        return nil;
    }

    func getImageData(pixelBuffer: CVPixelBuffer, uiOrientation: UIInterfaceOrientation) -> String {
        let image = getImageFromSampleBuffer(pixelBuffer: pixelBuffer, uiOrientation: uiOrientation)

        if let base64String = UIImageJPEGRepresentation(image!, jpegCompressionQuality)?.base64EncodedString() {
            return base64String;
        }
        return ""
    }
}
