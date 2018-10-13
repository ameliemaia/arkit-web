//
//  FullscreenWKWebView.swift
//  KikkAR
//
//  Created by Amelie Rosser on 06/10/2018.
//  Copyright © 2018. All rights reserved.
//

import Foundation
import WebKit

// https://stackoverflow.com/questions/47244002/make-wkwebview-real-fullscreen-on-iphone-x-remove-safe-area-from-wkwebview

class FullScreenWKWebView: WKWebView {
    override var safeAreaInsets: UIEdgeInsets {
        return UIEdgeInsets(top: 0, left: 0, bottom: 0, right: 0)
    }
}

