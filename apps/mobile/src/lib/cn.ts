import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Join class names, letting later Tailwind classes override earlier ones (the web's `cn`). */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
