# clip_pip

A Chrome extension that temporarily shows a selected region or selected text in a Picture-in-Picture window.

## Features

- **Area Pin** — drag-select a region on the page and show that screenshot in PiP.
- **Live Pin** — drag-select a region and show it as live video that keeps up with the page. Unlike the other two, it ends when you close the source tab. It uses the `tabCapture` permission, which is optional and asked for the first time you use it.
- **Text Pin** — select text, right-click, and show it in PiP as plain text. New selections are appended to what's already there instead of replacing it (toggle this off in the popup to go back to overwriting). Each appended entry shows where it came from — click the heading to jump to and highlight that exact text on the source page (doesn't work on every site, since some sites reset the scroll position themselves).
- Starts from the toolbar popup, the right-click context menu, or a keyboard shortcut (none is assigned by default).
