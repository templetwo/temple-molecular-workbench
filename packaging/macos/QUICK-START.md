# Temple Lab

A little curiosity. A whole world of molecules.

## Open your workbench

1. Extract the ZIP completely.
2. Double-click **Temple Lab.app**. Your default browser opens the workbench.
3. You can move the app to Applications, Desktop, or another folder. Keep the app bundle intact.

No Node.js, npm, terminal command, account, or internet connection is needed to run the bundled workbench. A browser with WebGL 2 enables the 3D canvas.

This build is for **__ARCH_LABEL__** running **macOS __MIN_MACOS__ or later**. It is a native **__NODE_ARCH__** build, not a universal app. Runtime: Node.js __NODE_VERSION__.

## Keep exploring

Choose a molecule from the collection, drag empty space to orbit, and scroll to zoom. Use Move, Bond, and Erase to edit. The guide inside the workbench explains the controls and model assumptions.

The workspace saves in this browser when browser storage is available. Export a JSON workspace for a portable copy. Browser profiles and different local ports have separate storage, so export before changing browsers or moving to a different computer.

Opening the app again reopens the running workbench. Its small local server listens only on **127.0.0.1**, usually port **5178**. If another application uses that port, Temple Lab opens an available local port instead. It does not expose your workbench on the network.

Closing the browser tab leaves this small background server available for reopening. It stops when you log out or restart your Mac. To stop it sooner, use Activity Monitor to quit the `node` process whose open files refer to `Temple Lab.app/Contents/Resources/serve.mjs`. Do not quit unrelated Node processes.

## If the app does not open

This is a **local build without an Apple Developer ID signature or notarization**. A downloaded copy may be blocked by macOS until you explicitly approve it through **System Settings → Privacy & Security**. Approve only a copy you trust. No system security setting needs to be disabled.

Startup details are saved in `~/Library/Logs/Temple Lab/launcher.log`. A startup failure opens that log in TextEdit. For a missing resource or incompatible runtime, re-extract the complete app and check the architecture above.

If 3D is unavailable, enable browser hardware acceleration or try another browser. The molecule library, inspector, and export remain available.

## Credits and model scope

Temple Lab is an educational structure editor. Atom sizes and bond thicknesses are illustrative; the workbench does not simulate reactions, energies, or quantum behavior.

Copyright © 2026 The Temple of Two. The project license is included in `LICENSE`. Bundled Node.js and its third-party licenses are preserved in the app's `Contents/Resources/licenses/NODE-LICENSE.txt`; frontend dependency notices are under `Contents/Resources/licenses/web/`.
