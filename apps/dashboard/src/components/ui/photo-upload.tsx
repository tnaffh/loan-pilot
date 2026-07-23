'use client';

import { useEffect, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PhotoUploadProps {
  value: File[];
  onChange: (files: File[]) => void;
  /** Maximum number of photos. */
  max?: number;
  className?: string;
}

/** Multi-image picker with thumbnail previews (JPG/PNG). Used for collateral photos. */
export const PhotoUpload = ({ value, onChange, max = 8, className }: PhotoUploadProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);

  // Object URLs for the current files, revoked when the set changes/unmounts.
  useEffect(() => {
    const urls = value.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [value]);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const next = [...value, ...Array.from(files)].slice(0, max);
    onChange(next);
    if (inputRef.current) inputRef.current.value = '';
  };

  const removeAt = (index: number) => onChange(value.filter((_, i) => i !== index));

  return (
    <div className={cn('space-y-2', className)}>
      {value.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {value.map((file, index) => (
            <div key={`${file.name}-${index}`} className="group relative aspect-square overflow-hidden rounded-lg border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previews[index]} alt={file.name} className="h-full w-full object-cover" />
              <button
                type="button"
                aria-label={`Remove photo ${index + 1}`}
                onClick={() => removeAt(index)}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      {value.length < max && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png"
            multiple
            className="sr-only"
            onChange={(event) => addFiles(event.target.files)}
          />
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start font-normal text-muted-foreground"
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus className="size-4" /> Add photos (JPG or PNG)
          </Button>
        </>
      )}
    </div>
  );
};
