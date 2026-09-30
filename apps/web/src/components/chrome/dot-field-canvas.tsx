import { useEffect, useRef } from "react";

const cell = 8;
const frameMs = 1000 / 30;

function intensity(x: number, y: number, t: number): number {
  const band = x * 0.62 + y * 0.38 - 0.18 - Math.sin(t * 0.00018) * 0.08;
  const ribbon = Math.exp(-(band * band) / 0.018);
  const ripple = 0.5 + 0.5 * Math.sin(x * 9 - y * 5 + t * 0.0009);
  const drift = 0.5 + 0.5 * Math.sin(y * 13 + t * 0.0006 + x * 3);
  return Math.min(1, ribbon * (0.55 + 0.45 * ripple) + 0.08 * drift * (1 - x));
}

function paint(context: CanvasRenderingContext2D, width: number, height: number, t: number): void {
  const image = context.createImageData(width, height);
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const value = Math.round(255 * intensity(col / width, row / height, t));
      const offset = (row * width + col) * 4;
      image.data[offset] = value;
      image.data[offset + 1] = value;
      image.data[offset + 2] = value;
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
}

export default function DotFieldCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d") ?? null;
    if (canvas === null || context === null) {
      return;
    }
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let last = 0;

    const resize = (): void => {
      canvas.width = Math.max(1, Math.ceil(window.innerWidth / cell));
      canvas.height = Math.max(1, Math.ceil(window.innerHeight / cell));
      paint(context, canvas.width, canvas.height, performance.now());
    };

    const tick = (now: number): void => {
      frame = requestAnimationFrame(tick);
      if (document.hidden || now - last < frameMs) {
        return;
      }
      last = now;
      paint(context, canvas.width, canvas.height, now);
    };

    resize();
    window.addEventListener("resize", resize);
    if (!still) {
      frame = requestAnimationFrame(tick);
    }
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="dot-field-canvas absolute inset-0 h-full w-full" />;
}
