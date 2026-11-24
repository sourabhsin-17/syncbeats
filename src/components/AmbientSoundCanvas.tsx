import { useEffect, useRef } from 'react';

interface AmbientSoundCanvasProps {
  active?: boolean;
}

export function AmbientSoundCanvas({ active = false }: AmbientSoundCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointerRef = useRef({ x: -999, y: -999 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let rafId = 0;
    let width = 0;
    let height = 0;

    interface Dot {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      hue: 'cyan' | 'violet' | 'flame';
      alpha: number;
    }

    let dots: Dot[] = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.min(48, Math.max(20, Math.floor((width * height) / 36000)));
      const hues: Array<'cyan' | 'violet' | 'flame'> = ['cyan', 'violet', 'flame'];
      dots = Array.from({ length: count }, (_, idx) => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.28,
        vy: (Math.random() - 0.5) * 0.24,
        r: 1.1 + Math.random() * 1.6,
        hue: hues[idx % hues.length],
        alpha: 0.22 + Math.random() * 0.35,
      }));
    };

    const drawFrame = () => {
      ctx.clearRect(0, 0, width, height);

      // Faint subtle studio coordinate grid
      ctx.strokeStyle = 'rgba(167, 163, 199, 0.035)';
      ctx.lineWidth = 1;
      const step = 72;
      ctx.beginPath();
      for (let gx = 0; gx < width; gx += step) {
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, height);
      }
      for (let gy = 0; gy < height; gy += step) {
        ctx.moveTo(0, gy);
        ctx.lineTo(width, gy);
      }
      ctx.stroke();

      const px = pointerRef.current.x;
      const py = pointerRef.current.y;
      const speedBoost = active ? 1.8 : 1;

      for (let i = 0; i < dots.length; i += 1) {
        const d = dots[i];
        if (!reducedMotion) {
          d.x += d.vx * speedBoost;
          d.y += d.vy * speedBoost;
          if (d.x < -10) d.x = width + 10;
          if (d.x > width + 10) d.x = -10;
          if (d.y < -10) d.y = height + 10;
          if (d.y > height + 10) d.y = -10;
        }

        const dist = Math.hypot(d.x - px, d.y - py);
        const boost = dist < 140 ? (1 - dist / 140) * 0.45 : 0;

        if (d.hue === 'cyan') {
          ctx.fillStyle = `rgba(103, 232, 249, ${Math.min(0.85, d.alpha + boost)})`;
        } else if (d.hue === 'violet') {
          ctx.fillStyle = `rgba(139, 92, 246, ${Math.min(0.85, d.alpha + boost)})`;
        } else {
          ctx.fillStyle = `rgba(255, 77, 28, ${Math.min(0.85, d.alpha + boost)})`;
        }

        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r + boost * 1.4, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!reducedMotion) {
        rafId = window.requestAnimationFrame(drawFrame);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      pointerRef.current.x = e.clientX;
      pointerRef.current.y = e.clientY;
    };

    resize();
    drawFrame();
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointerMove);
    };
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 opacity-90"
    />
  );
}
