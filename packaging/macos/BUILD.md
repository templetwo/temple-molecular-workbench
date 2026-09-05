# Build a standalone macOS app

From the project root, run `npm ci`, `npm run build`, then `npm run bundle:mac`. The icon at `packaging/macos/AppIcon.icns` must already exist; `npm run icons` regenerates the logo assets and icon when their source files are available.

The builder requires macOS, Node.js 22.12 or newer, and the standard macOS `ditto`, `plutil`, and `otool` tools. It copies the **currently running Node executable** into the app, checks that its dynamic libraries are system libraries, and reads its minimum macOS version. An official standalone Node distribution is appropriate; a Homebrew runtime linked to libraries outside `/usr/lib` or `/System/Library` is rejected.

The complete Node license is discovered beside its installation or in `share/doc/node`. For a nonstandard installation, set `TEMPLE_NODE_LICENSE` to the complete license file for that exact runtime. The builder validates that bundled dependency notices are present. It does not download a runtime or invoke npm inside the finished app.

Outputs appear in `release/`: `Temple Lab.app`, an architecture-specific ZIP, `QUICK-START.md`, `LICENSE`, and `bundle-manifest.json`. The ZIP contains an enclosing `Temple Lab` folder with the app and the two readable documents. Its app manifest records the runtime version, architecture, hashes, and packaging method.

Rebuilding preserves previously generated outputs under `release/.previous/` before publishing the new files. If existing output lacks this builder's ownership marker, the builder stops rather than replacing it. Temporary staging directories are also inside `release/`; a failed stage is retained for inspection.

This local packaging workflow does not sign with a Developer ID, notarize, install a login item, require administrator privileges, or publish the app. Validate on the target architecture before sharing. On a downloaded copy, macOS may require the user to approve the app.

`Contents/MacOS/TempleLab` is a quoted shell launcher. It starts the bundled runtime and waits for the server's private readiness file, so startup failures appear in the launcher log. The launcher then exits; subsequent Finder openings perform the server's health check and reopen the browser without leaving a duplicate server behind.
