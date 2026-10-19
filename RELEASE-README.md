# Jarvis Linux candidate 20261018-project-goals-r49-r1

Archive version: 20261018-project-goals-r49-r1
Selected runtime build: 20261018-project-goals-r49-r1
Source commit: 03a1c8be794102b908479c4f9890d6bcc714c3f7

This is a local candidate archive. Linux has not been installed or started by this packager. It is not production acceptance. Archive version and runtime build are recorded separately. A managed release requires both to match the selected release and separately verified installation, recovery and health evidence. This archive does not itself perform deployment. It contains committed public source, explicitly selected compiled API/web files and API runtime resources. release-manifest.json records every payload file size and SHA-256; the manifest excludes itself. The adjacent ZIP.sha256 binds the whole archive.

Linux needs the compatible Node runtime and its own dependency installation (npm ci using the lockfile, or an already verified matching dependency set). A source rebuild uses npm run build. These commands are not executed by this packager. Existing HTTPS certificates, node role/configuration, credentials, private databases, node_modules and voice models are not included. Python voice/OCR dependencies, native audio tools and model paths must be configured and verified on Linux separately. Local synthetic ASR evidence does not verify 112, a real microphone, or a room terminal.

The chosen source commit is checked against all currently tracked raw bytes. API source-map paths, release identity and build timestamps are checked; web entry timestamps and the current offline manifest/worker/asset fingerprints are checked. These are source/artifact association checks, not a reproducible-build proof or a new full test run. Historical generated record folders are omitted. File admission uses explicit text/build extensions, committed theme preview JPGs, and one exact fingerprint-pinned public development-node ZIP. Audio/video/model/runtime-data file types are refused. This checks admitted types and source provenance; it does not identify private content inside text or images.

The public offline page is /offline-capture.html. Each intended browser must first prepare that exact trusted HTTPS origin online. Localhost preparation does not prepare a production origin. Its encrypted backup migration remains an explicit user action.

Deployment, exact staged readback, bound previous-release/configuration/data recovery material, 112 health and 101 cold-standby checks remain separate operations. No SSH, network access, installation, service startup, production change or rollback is performed by this archive.
