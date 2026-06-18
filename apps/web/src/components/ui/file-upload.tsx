'use client';

import { useId, useRef } from 'react';
import { FileText, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FileUploadProps {
  value: File | null;
  onChange: (file: File | null) => void;
  /** Accept attribute, defaults to PDF + images. */
  accept?: string;
  className?: string;
}

const PRETTY_SIZE = (bytes: number): string =>
  bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Minimal styled file picker: a choose button, then a selected-file chip. */
export const FileUpload = ({
  value,
  onChange,
  accept = 'application/pdf,image/png,image/jpeg',
  className,
}: FileUploadProps) => {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  if (value) {
    return (
      <div className={cn('flex items-center gap-2 rounded-md border bg-muted/40 p-2 text-sm', className)}>
        <FileText className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{value.name}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{PRETTY_SIZE(value.size)}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-label="Remove file"
          onClick={() => {
            onChange(null);
            if (inputRef.current) inputRef.current.value = '';
          }}
        >
          <X className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className={className}>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
      <Button
        type="button"
        variant="outline"
        className="w-full justify-start font-normal text-muted-foreground"
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="size-4" /> Choose a file (PDF, JPG or PNG)
      </Button>
    </div>
  );
};
