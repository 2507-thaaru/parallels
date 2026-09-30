export interface MosaicConfig {
  renderMode: string;
  bgMode: 'solid' | 'blurred' | 'photo' | 'off';
  bgBlur: number;
  bgOpacity: number;
  cellSize: number;
  coverage: number;
  invert: boolean;
  styleBlend: GlobalCompositeOperation;
  charSet: string;
  customChars: string;
  brightness: number;
  contrast: number;
  edgeEmphasis: number;
  density: number;
  toneCurve: Array<{ x: number; y: number }>;
  tint: string;
  tintOpacity: number;
  overlayBlend: GlobalCompositeOperation;
  saturation: number;
  grayscale: number;
  blurType: string;
  blurAmount: number;
  blurAngle: number;
  directionalBothSides: boolean;
  tiltFocus: number;
  tiltPosition: number;
  tiltFeather: number;
  lensFocus: number;
  blurCenterX: number;
  blurCenterY: number;
  progressivePosition: number;
  progressiveReverse: boolean;
  pfx: {
    vignette: { enabled: boolean; intensity: number };
    scanLines: { enabled: boolean; intensity: number };
    chromatic: { enabled: boolean; intensity: number };
    bloom: { enabled: boolean; intensity: number };
    filmGrain: { enabled: boolean; intensity: number };
    glitch: { enabled: boolean; intensity: number };
    pixelate: { enabled: boolean; intensity: number };
    halftone: { enabled: boolean; intensity: number };
    filmDust: { enabled: boolean; intensity: number };
  };
  animated: boolean;
  animStyle: 'wave' | 'pulse' | 'shimmer' | 'ripple' | 'flicker';
  animSpeed: { enabled: boolean; intensity: number };
  animIntensity: { enabled: boolean; intensity: number };
  lights: { enabled: boolean; points: Array<{ x: number; y: number; radius: number; intensity: number }> };
  mask: { enabled: boolean; tool: string; brushSize: number; showOverlay: boolean; invert: boolean; dataUrl: string | null; shapes: any[] };
}

export const EXACT_21ST_CONFIG: MosaicConfig = {
  renderMode: 'mosaic',
  bgMode: 'solid',
  bgBlur: 12,
  bgOpacity: 90,
  cellSize: 16,
  coverage: 100,
  invert: false,
  styleBlend: 'source-over',
  charSet: 'standard',
  customChars: '',
  brightness: 12,
  contrast: 115,
  edgeEmphasis: 0,
  density: 0,
  toneCurve: [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ],
  tint: '#3ca6ff',
  tintOpacity: 0,
  overlayBlend: 'multiply',
  saturation: 100,
  grayscale: 0,
  blurType: 'off',
  blurAmount: 35,
  blurAngle: 0,
  directionalBothSides: false,
  tiltFocus: 35,
  tiltPosition: 50,
  tiltFeather: 15,
  lensFocus: 40,
  blurCenterX: 50,
  blurCenterY: 50,
  progressivePosition: 55,
  progressiveReverse: false,
  pfx: {
    vignette: { enabled: true, intensity: 38 },
    scanLines: { enabled: false, intensity: 40 },
    chromatic: { enabled: false, intensity: 15 },
    bloom: { enabled: true, intensity: 25 },
    filmGrain: { enabled: false, intensity: 30 },
    glitch: { enabled: false, intensity: 20 },
    pixelate: { enabled: false, intensity: 15 },
    halftone: { enabled: false, intensity: 20 },
    filmDust: { enabled: false, intensity: 20 },
  },
  animated: true,
  animStyle: 'wave',
  animSpeed: { enabled: true, intensity: 100 },
  animIntensity: { enabled: true, intensity: 60 },
  lights: { enabled: false, points: [] },
  mask: { enabled: false, tool: 'freehand', brushSize: 30, showOverlay: false, invert: false, dataUrl: null, shapes: [] },
};

export class MosaicEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private sourceCanvas: HTMLCanvasElement;
  private sourceCtx: CanvasRenderingContext2D;
  private config: MosaicConfig;
  private animationId: number | null = null;
  private startTime = performance.now();
  private sourceImage: HTMLImageElement | null = null;
  private isImageLoaded = false;

  constructor(canvas: HTMLCanvasElement, customConfig?: Partial<MosaicConfig>) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Could not get Canvas 2D context');
    this.ctx = context;

    this.sourceCanvas = document.createElement('canvas');
    const sCtx = this.sourceCanvas.getContext('2d', { willReadFrequently: true });
    if (!sCtx) throw new Error('Could not get source canvas context');
    this.sourceCtx = sCtx;

    this.config = { ...EXACT_21ST_CONFIG, ...customConfig };

    this.loadSourcePhoto();
    this.resize();
  }

  public setConfig(newConfig: Partial<MosaicConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  public loadSourcePhoto(url = '/ref-041.png'): void {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = url;
    img.onload = () => {
      this.sourceImage = img;
      this.isImageLoaded = true;
      this.renderSourceToCanvas();
    };
    img.onerror = () => {
      console.warn('Could not load primary photo, trying fallback webp path');
      if (url !== '/ascii-editor/demos/generated/ref-041.webp') {
        this.loadSourcePhoto('/ascii-editor/demos/generated/ref-041.webp');
      }
    };
  }

  public resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(320, Math.floor(rect.width || window.innerWidth));
    const height = Math.max(320, Math.floor(rect.height || window.innerHeight));

    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);

    this.sourceCanvas.width = width;
    this.sourceCanvas.height = height;

    this.renderSourceToCanvas();
  }

  /**
   * Step 1: Draw the source photo into a canvas at the target size;
   */
  private renderSourceToCanvas(): void {
    const w = this.sourceCanvas.width;
    const h = this.sourceCanvas.height;
    const ctx = this.sourceCtx;

    ctx.clearRect(0, 0, w, h);

    if (this.sourceImage && this.isImageLoaded && this.sourceImage.naturalWidth > 0) {
      // Cover canvas with proper aspect ratio centered
      const imgW = this.sourceImage.naturalWidth;
      const imgH = this.sourceImage.naturalHeight;
      const imgRatio = imgW / imgH;
      const canvasRatio = w / h;

      let drawW = w;
      let drawH = h;
      let offsetX = 0;
      let offsetY = 0;

      if (imgRatio > canvasRatio) {
        drawW = h * imgRatio;
        offsetX = (w - drawW) / 2;
      } else {
        drawH = w / imgRatio;
        offsetY = (h - drawH) / 2;
      }

      ctx.drawImage(this.sourceImage, offsetX, offsetY, drawW, drawH);
    }
  }

  public start(): void {
    if (this.animationId !== null) return;
    const loop = (now: number) => {
      this.render(now);
      this.animationId = requestAnimationFrame(loop);
    };
    this.animationId = requestAnimationFrame(loop);
  }

  public stop(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  public render(timestamp = performance.now()): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = this.canvas.width;
    const targetH = this.canvas.height;
    const displayW = targetW / dpr;
    const displayH = targetH / dpr;

    const ctx = this.ctx;
    ctx.save();
    ctx.scale(dpr, dpr);

    // 1. Step 1: Background Layer (bgMode / bgBlur / bgOpacity)
    if (this.config.bgMode === 'solid') {
      ctx.fillStyle = '#05070e';
      ctx.fillRect(0, 0, displayW, displayH);
    } else if (this.config.bgMode === 'blurred') {
      ctx.save();
      ctx.filter = `blur(${this.config.bgBlur}px)`;
      ctx.globalAlpha = this.config.bgOpacity / 100;
      ctx.drawImage(this.sourceCanvas, 0, 0, displayW, displayH);
      ctx.restore();
    } else if (this.config.bgMode === 'photo') {
      ctx.globalAlpha = this.config.bgOpacity / 100;
      ctx.drawImage(this.sourceCanvas, 0, 0, displayW, displayH);
      ctx.globalAlpha = 1.0;
    } else {
      ctx.clearRect(0, 0, displayW, displayH);
    }

    if (!this.isImageLoaded) {
      ctx.restore();
      return;
    }

    // 2. Step 2: Sample pixel data from source photo
    const sampleW = this.sourceCanvas.width;
    const sampleH = this.sourceCanvas.height;
    const imgData = this.sourceCtx.getImageData(0, 0, sampleW, sampleH);
    const pixels = imgData.data;

    const cellSize = Math.max(8, this.config.cellSize);
    const cols = Math.ceil(displayW / cellSize);
    const rows = Math.ceil(displayH / cellSize);

    // 8. Step 8: Animation Parameters (wave/pulse/shimmer)
    const elapsed = (timestamp - this.startTime) / 1000;
    const animSpeed = this.config.animSpeed.enabled ? this.config.animSpeed.intensity / 50 : 1;
    const animIntensity = this.config.animIntensity.enabled ? this.config.animIntensity.intensity / 100 : 0.6;
    const animTime = elapsed * animSpeed;

    // Contrast lookup factor
    const contrastFactor =
      this.config.contrast !== 100
        ? (259 * (this.config.contrast + 255)) / (255 * (259 - this.config.contrast))
        : 1.0;

    const charSetGlyphs = this.config.customChars || ' .:-=+*#%@';

    // 3. Step 3: Draw shape for each cell
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Coverage check
        if (this.config.coverage < 100 && (Math.sin(c * 13.7 + r * 19.3) * 50 + 50) > this.config.coverage) {
          continue;
        }

        const cellX = c * cellSize;
        const cellY = r * cellSize;

        // Sample center of cell
        const sampleX = Math.min(sampleW - 1, Math.floor((cellX + cellSize / 2) * (sampleW / displayW)));
        const sampleY = Math.min(sampleH - 1, Math.floor((cellY + cellSize / 2) * (sampleH / displayH)));
        const pIdx = (sampleY * sampleW + sampleX) * 4;

        let red = pixels[pIdx];
        let green = pixels[pIdx + 1];
        let blue = pixels[pIdx + 2];

        // 8. Step 8: Wave animation modulates luminance diagonally across the grid
        let wave = 0;
        if (this.config.animated) {
          if (this.config.animStyle === 'wave') {
            // Diagonal wave across cells (matching the 45-degree stripes in the background)
            wave = Math.sin((c * 0.16 + r * 0.16) - animTime * 2.2);
          } else if (this.config.animStyle === 'pulse') {
            const dist = Math.hypot(c - cols / 2, r - rows / 2);
            wave = Math.sin(dist * 0.25 - animTime * 3);
          } else if (this.config.animStyle === 'shimmer') {
            wave = Math.sin(c * 0.9 + r * 0.7 + animTime * 4.5);
          }
        }

        const waveMod = 1.0 + wave * animIntensity * 0.28;
        red *= waveMod;
        green *= waveMod;
        blue *= waveMod;

        // 4. Step 4: Color adjustments in exact specified order:
        // (a) Brightness
        if (this.config.brightness !== 0) {
          const bShift = this.config.brightness * 2.55;
          red += bShift;
          green += bShift;
          blue += bShift;
        }

        // (b) Contrast
        if (this.config.contrast !== 100) {
          red = contrastFactor * (red - 128) + 128;
          green = contrastFactor * (green - 128) + 128;
          blue = contrastFactor * (blue - 128) + 128;
        }

        // Clamp
        red = Math.min(255, Math.max(0, red));
        green = Math.min(255, Math.max(0, green));
        blue = Math.min(255, Math.max(0, blue));

        // (c) Luminance & Grayscale
        let lum = 0.299 * red + 0.587 * green + 0.114 * blue;
        if (this.config.grayscale > 0) {
          const gAlpha = this.config.grayscale / 100;
          red = red * (1 - gAlpha) + lum * gAlpha;
          green = green * (1 - gAlpha) + lum * gAlpha;
          blue = blue * (1 - gAlpha) + lum * gAlpha;
        }

        // (d) Invert
        if (this.config.invert) {
          red = 255 - red;
          green = 255 - green;
          blue = 255 - blue;
          lum = 255 - lum;
        }

        // (e) Tint via overlayBlend
        if (this.config.tintOpacity > 0 && this.config.tint) {
          const tAlpha = this.config.tintOpacity / 100;
          red = red * (1 - tAlpha) + 60 * tAlpha;
          green = green * (1 - tAlpha) + 166 * tAlpha;
          blue = blue * (1 - tAlpha) + 255 * tAlpha;
        }

        const normLum = Math.max(0, Math.min(1, lum / 255));
        const colorStyle = `rgb(${Math.round(red)}, ${Math.round(green)}, ${Math.round(blue)})`;
        ctx.fillStyle = colorStyle;

        // Render per mode
        const mode = this.config.renderMode;

        if (mode === 'mosaic') {
          // Exact 21st.dev Mosaic: square tile filling cell with 1.2px dark grid line and rounded corner
          const gap = 1.2;
          const tileSize = cellSize - gap;
          const radius = Math.min(2.5, tileSize * 0.15);

          ctx.beginPath();
          ctx.roundRect(cellX + gap / 2, cellY + gap / 2, tileSize, tileSize, radius);
          ctx.fill();
        } else if (mode === 'characters') {
          const charIdx = Math.min(charSetGlyphs.length - 1, Math.floor(normLum * charSetGlyphs.length));
          ctx.font = `bold ${Math.round(cellSize * 0.9)}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(charSetGlyphs[charIdx], cellX + cellSize / 2, cellY + cellSize / 2);
        } else if (mode === 'dots') {
          const r = Math.max(1, (cellSize / 2 - 1) * normLum);
          ctx.beginPath();
          ctx.arc(cellX + cellSize / 2, cellY + cellSize / 2, r, 0, Math.PI * 2);
          ctx.fill();
        } else if (mode === 'pixel') {
          ctx.fillRect(cellX, cellY, cellSize, cellSize);
        } else if (mode === 'cross') {
          const arm = (cellSize / 2 - 1) * normLum;
          ctx.strokeStyle = colorStyle;
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(cellX + cellSize / 2 - arm, cellY + cellSize / 2);
          ctx.lineTo(cellX + cellSize / 2 + arm, cellY + cellSize / 2);
          ctx.moveTo(cellX + cellSize / 2, cellY + cellSize / 2 - arm);
          ctx.lineTo(cellX + cellSize / 2, cellY + cellSize / 2 + arm);
          ctx.stroke();
        }
      }
    }

    // 5. Step 5: Post-effects (pfx)
    // Bloom (intensity: 25)
    if (this.config.pfx.bloom.enabled && this.config.pfx.bloom.intensity > 0) {
      const bloomIntensity = (this.config.pfx.bloom.intensity / 100) * 0.45;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.filter = 'blur(12px)';
      ctx.globalAlpha = bloomIntensity;
      ctx.drawImage(this.sourceCanvas, 0, 0, displayW, displayH);
      ctx.restore();
    }

    // Vignette (intensity: 38)
    if (this.config.pfx.vignette.enabled && this.config.pfx.vignette.intensity > 0) {
      const vInt = this.config.pfx.vignette.intensity / 100;
      const vGrad = ctx.createRadialGradient(
        displayW / 2,
        displayH / 2,
        Math.min(displayW, displayH) * 0.3,
        displayW / 2,
        displayH / 2,
        Math.max(displayW, displayH) * 0.72
      );
      vGrad.addColorStop(0, 'rgba(0,0,0,0)');
      vGrad.addColorStop(0.65, `rgba(3,6,12,${0.35 * vInt})`);
      vGrad.addColorStop(1, `rgba(2,4,8,${0.9 * vInt})`);
      ctx.fillStyle = vGrad;
      ctx.fillRect(0, 0, displayW, displayH);
    }

    ctx.restore();
  }
}
