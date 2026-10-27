'use client';

import { useId, useRef } from 'react';
import { FileText, Plus, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FileUploadProps {
  value: File[];
  onChange: (files: File[]) => void;
  /** Most files this field holds (e.g. a statement sent as one PDF per month). */
  max?: number;
  /** Accept attribute, defaults to PDF + images. */
  accept?: string;
  className?: string;
}

const PRETTY_SIZE = (bytes: number): string =>
  bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Styled file picker holding one or more files: chips for each, then "add another". */
export const FileUpload = ({
  value,
  onChange,
  max = 1,
  accept = 'application/pdf,image/png,image/jpeg',
  className,
}: FileUploadProps) => {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const room = max - value.length;

  return (
    <div className={cn('space-y-2', className)}>
      {value.map((file, index) => (
        <div
          key={`${file.name}-${file.size}-${index}`}
          className="flex items-center gap-2 rounded-md border bg-muted/40 p-2 text-sm"
        >
          <FileText className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{file.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{PRETTY_SIZE(file.size)}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            aria-label={`Remove ${file.name}`}
            onClick={() => onChange(value.filter((_file, other) => other !== index))}
          >
            <X className="size-4" />
          </Button>
        </div>
      ))}
      {room > 0 ? (
        <>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={accept}
            multiple={max > 1}
            className="sr-only"
            onChange={(event) => {
              const picked = Array.from(event.target.files ?? []).slice(0, room);

              event.target.value = '';

              if (picked.length > 0) onChange([...value, ...picked]);
            }}
          />
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start font-normal text-muted-foreground"
            onClick={() => inputRef.current?.click()}
          >
            {value.length === 0 ? (
              <>
                <Upload className="size-4" /> Choose {max > 1 ? 'files' : 'a file'} (PDF, JPG or
                PNG)
              </>
            ) : (
              <>
                <Plus className="size-4" /> Add another file
              </>
            )}
          </Button>
        </>
      ) : null}
    </div>
  );
};
