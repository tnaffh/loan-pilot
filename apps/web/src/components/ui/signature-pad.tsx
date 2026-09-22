'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, PenLine, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Internal drawing surface size per variant; CSS scales it to the container width. */
const CANVAS: Record<SignatureVariant, { width: number; height: number; className: string }> = {
  // A full signature: wide and short.
  signature: { width: 600, height: 200, className: 'h-40 w-full' },
  // Initials: a smaller, squarer box so they come out compact on the page.
  initials: { width: 300, height: 150, className: 'h-32 w-64 max-w-full' },
};
/** Longest edge of an uploaded signature photo, so the payload stays small. */
const MAX_UPLOAD_EDGE = 1000;

export type SignatureVariant = 'signature' | 'initials';

export interface SignaturePadProps {
  /** The current signature as a PNG data-URL, or null when empty. */
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  /** What is being captured — sizes the canvas and words the hint. */
  variant?: SignatureVariant;
  className?: string;
}

/**
 * Capture a handwritten signature or initials (draw on a canvas) OR upload a
 * photo of one. Both modes normalize to a PNG data-URL via `onChange`, so the
 * server always receives the same shape. No external library — pointer events
 * cover mouse and touch/stylus (tablets).
 */
export const SignaturePad = ({
  value,
  onChange,
  variant = 'signature',
  className,
}: SignaturePadProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [mode, setMode] = useState<'draw' | 'upload'>('draw');
  const canvas = CANVAS[variant];
  const noun = variant === 'initials' ? 'initials' : 'signature';

  /** Map a pointer event to canvas coordinates (canvas is CSS-scaled). */
  const toCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const element = canvasRef.current;
    if (!element) return { x: 0, y: 0 };
    const rect = element.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * element.width,
      y: ((event.clientY - rect.top) / rect.height) * element.height,
    };
  };

  const exportPng = useCallback(() => {
    const element = canvasRef.current;
    if (element) onChange(element.toDataURL('image/png'));
  }, [onChange]);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode !== 'draw') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    lastPoint.current = toCanvasPoint(event);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || mode !== 'draw') return;
    const element = canvasRef.current;
    const ctx = element?.getContext('2d');
    const point = toCanvasPoint(event);
    if (ctx && lastPoint.current) {
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }
    lastPoint.current = point;
  };

  const endStroke = () => {
    if (!drawing.current) return;
    drawing.current = false;
    lastPoint.current = null;
    exportPng();
  };

  const clear = useCallback(() => {
    const element = canvasRef.current;
    const ctx = element?.getContext('2d');
    if (element && ctx) ctx.clearRect(0, 0, element.width, element.height);
    onChange(null);
  }, [onChange]);

  // Clearing the value from the parent (e.g. a form reset) wipes the canvas.
  useEffect(() => {
    if (value === null) {
      const element = canvasRef.current;
      const ctx = element?.getContext('2d');
      if (element && ctx) ctx.clearRect(0, 0, element.width, element.height);
    }
  }, [value]);

  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, MAX_UPLOAD_EDGE / Math.max(image.width, image.height));
        const off = document.createElement('canvas');
        off.width = Math.round(image.width * scale);
        off.height = Math.round(image.height * scale);
        const ctx = off.getContext('2d');
        if (ctx) {
          ctx.drawImage(image, 0, 0, off.width, off.height);
          onChange(off.toDataURL('image/png'));
        }
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const switchMode = (nextMode: 'draw' | 'upload') => {
    if (nextMode === mode) return;
    clear();
    setMode(nextMode);
  };

  const hasUpload = mode === 'upload' && Boolean(value);

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={mode === 'draw' ? 'default' : 'outline'}
          onClick={() => switchMode('draw')}
        >
          <PenLine className="size-4" /> Draw
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === 'upload' ? 'default' : 'outline'}
          onClick={() => switchMode('upload')}
        >
          <Upload className="size-4" /> Upload photo
        </Button>
        {value && (
          <Button type="button" size="sm" variant="ghost" onClick={clear} className="ml-auto">
            <Eraser className="size-4" /> Clear
          </Button>
        )}
      </div>

      {mode === 'draw' ? (
        <canvas
          ref={canvasRef}
          width={canvas.width}
          height={canvas.height}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endStroke}
          onPointerLeave={endStroke}
          className={cn('touch-none rounded-xl border bg-white', canvas.className)}
        />
      ) : (
        <div className="rounded-xl border p-4">
          {hasUpload ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value ?? ''} alt={`${noun} preview`} className="mx-auto max-h-36" />
          ) : (
            <label className="flex cursor-pointer flex-col items-center gap-2 py-6 text-sm text-muted-foreground">
              <Upload className="size-6" />
              <span>Tap to upload a photo of your {noun} (JPG or PNG)</span>
              <input
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={handleUpload}
              />
            </label>
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {mode === 'draw'
          ? variant === 'initials'
            ? 'Write your initials above with your finger, stylus or mouse.'
            : 'Sign above with your finger, stylus or mouse.'
          : `Upload a clear photo of your handwritten ${noun}.`}
      </p>
    </div>
  );
};
