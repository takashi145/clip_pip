# clip_pip

A Chrome extension that temporarily shows a selected region or selected text in a
Picture-in-Picture window. Nothing is saved — close it and it's gone.

## Features

- **Area Pin** — drag-select a rectangle on the page and show that screenshot in PiP.
- **Text Pin** — select text, right-click, and show it in PiP as plain text.
- Starts from the toolbar popup or the right-click context menu.
- Only one Document PiP can be open at a time, so opening a new one closes the existing PiP. Confirming before it closes can be enabled in the popup (off by default).
- Captured images and text are never sent anywhere. They are held in browser memory (`chrome.storage.session`) to hand off to the PiP window and are gone once the browser closes. Only the preference is written to disk.
