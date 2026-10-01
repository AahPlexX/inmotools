/**
 * Draws an SVG document onto a canvas at a fixed pixel size and returns it as a
 * PNG. This is the one export step that needs a browser (an image decoder and a
 * canvas), so it sits apart from the text exporters, which run anywhere.
 */

/**
 * @param svg A complete SVG document.
 * @param width Output width in pixels.
 * @param height Output height in pixels.
 * @returns The PNG file.
 * @throws {Error} When the browser cannot decode the SVG or cannot encode a PNG.
 */
export const svgToPngBlob = (svg: string, width: number, height: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const image = new Image();
    // The blob address is released once the picture has been drawn or has failed, whichever comes first.
    const release = () => URL.revokeObjectURL(url);
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('This browser cannot draw the image.');
        context.drawImage(image, 0, 0, width, height);
        canvas.toBlob((blob) => {
          release();
          if (blob) resolve(blob);
          else reject(new Error('This browser could not encode the PNG.'));
        }, 'image/png');
      } catch (error) {
        release();
        reject(error instanceof Error ? error : new Error('Could not draw the image.'));
      }
    };
    image.onerror = () => {
      release();
      reject(new Error('This browser could not read the SVG.'));
    };
    image.src = url;
  });
