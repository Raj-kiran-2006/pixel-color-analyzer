# ColorSpectrum Pro

A browser-only pixel color analyzer built with plain HTML, CSS, and JavaScript. It needs no build step, package install, or backend.

## Run it

Open `index.html` in a modern browser. Camera access needs a secure origin, such as `https://` or `localhost`. Wikimedia photo search and URL loading require an internet connection; a remote image host must allow CORS for pixel sampling.

## Features

- Upload or drag in an image, use a camera, search Wikimedia Commons for photos, or load an image URL.
- Click an image to inspect a pixel in HEX, RGB, and HSL.
- Analyze the image for up to six dominant colors and their share of the sampled pixels.
- Convert HEX, RGB, and HSL values, copy results, and revisit recent colors.

## Code map

- `index.html` contains the page structure and tool controls.
- `styles.css` contains the responsive layout and visual styling.
- `app.js` wires up the tools, samples pixels, converts color formats, and renders results.
- `app.js` draws the example image and favicon locally, and searches Wikimedia Commons directly without an API key or third-party library.

Dominant-color analysis resizes the image to a thumbnail no larger than 160 pixels on its longest edge, groups similar RGB values, then reports the six most distinct color groups. This bounds the work for large images. The displayed preview is also capped at 2,400 pixels per edge; pixel clicks sample that preview.
