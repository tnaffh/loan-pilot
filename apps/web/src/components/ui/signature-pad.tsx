'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Eraser, PenLine, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Internal drawing surface size; CSS scales it to the container width. */
const CANVAS_W = 600;
const CANVAS_H = 200;
/** Longest edge of an uploaded signature photo, so the payload stays small. */
const MAX_UPLOAD_EDGE = 1000;

export interface SignaturePadProps {
  /** The current signature as a PNG data-URL, or null when empty. */
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  className?: string;
}

/**
 * Capture a handwritten signature (draw on a canvas) OR upload a photo of one.
 * Both modes normalize to a PNG data-URL via `onChange`, so the server always
 * receives the same shape. No external library — pointer events cover mouse and
 * touch/stylus (tablets).
 */
export const SignaturePad = ({ value, onChange, className }: SignaturePadProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [mode, setMode] = useState<'draw' | 'upload'>('draw');

  /** Map a pointer event to canvas coordinates (canvas is CSS-scaled). */
  const toCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const exportPng = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL('image/png'));
  }, [onChange]);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode !== 'draw') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    lastPoint.current = toCanvasPoint(event);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || mode !== 'draw') return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
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
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    onChange(null);
  }, [onChange]);

  // Clearing the value from the parent (e.g. a form reset) wipes the canvas.
  useEffect(() => {
    if (value === null) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
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
          width={CANVAS_W}
          height={CANVAS_H}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endStroke}
          onPointerLeave={endStroke}
          className="h-40 w-full touch-none rounded-xl border bg-white"
        />
      ) : (
        <div className="rounded-xl border p-4">
          {hasUpload ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value ?? ''} alt="Signature preview" className="mx-auto max-h-36" />
          ) : (
            <label className="flex cursor-pointer flex-col items-center gap-2 py-6 text-sm text-muted-foreground">
              <Upload className="size-6" />
              <span>Tap to upload a photo of your signature (JPG or PNG)</span>
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
          ? 'Sign above with your finger, stylus or mouse.'
          : 'Upload a clear photo of your handwritten signature.'}
      </p>
    </div>
  );
};
