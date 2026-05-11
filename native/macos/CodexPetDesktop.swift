import AppKit
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler {
    private var window: NSWindow?
    private var webView: WKWebView?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let url = CommandLine.arguments.dropFirst().first ?? "http://127.0.0.1:4177/?desktop=1"
        let screenFrame = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let width: CGFloat = 760
        let height: CGFloat = 460
        let origin = NSPoint(x: screenFrame.maxX - width - 28, y: screenFrame.minY + 64)

        let config = WKWebViewConfiguration()
        config.userContentController.add(self, name: "petWindow")
        let webView = WKWebView(frame: NSRect(x: 0, y: 0, width: width, height: height), configuration: config)
        webView.setValue(false, forKey: "drawsBackground")
        webView.allowsMagnification = false

        let window = NSWindow(
            contentRect: NSRect(origin: origin, size: NSSize(width: width, height: height)),
            styleMask: [.borderless],
            backing: .buffered,
            defer: false
        )
        window.contentView = webView
        window.backgroundColor = .clear
        window.isOpaque = false
        window.hasShadow = false
        window.level = .floating
        window.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary]
        window.ignoresMouseEvents = false
        window.isMovableByWindowBackground = true
        window.title = "Codex Pet"
        window.makeKeyAndOrderFront(nil)

        NSApp.setActivationPolicy(.accessory)
        NSApp.activate(ignoringOtherApps: false)

        if let parsed = URL(string: url) {
            webView.load(URLRequest(url: parsed))
        }

        self.webView = webView
        self.window = window
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "petWindow",
              let body = message.body as? [String: Any],
              let type = body["type"] as? String else {
            return
        }

        if type == "dragBy" {
            let dx = body["dx"] as? CGFloat ?? 0
            let dy = body["dy"] as? CGFloat ?? 0
            moveWindowBy(dx: dx, dy: dy)
        } else if type == "close" {
            NSApp.terminate(nil)
        }
    }

    private func moveWindowBy(dx: CGFloat, dy: CGFloat) {
        guard let window else { return }
        var frame = window.frame
        frame.origin.x += dx
        frame.origin.y -= dy

        if let screenFrame = window.screen?.visibleFrame ?? NSScreen.main?.visibleFrame {
            frame.origin.x = min(max(frame.origin.x, screenFrame.minX - frame.width + 80), screenFrame.maxX - 80)
            frame.origin.y = min(max(frame.origin.y, screenFrame.minY - frame.height + 80), screenFrame.maxY - 80)
        }

        window.setFrame(frame, display: true)
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
