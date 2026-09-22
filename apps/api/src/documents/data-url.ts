/** Decode the payload of a `data:image/png;base64,…` URL (already validated by zod). */
export const decodeDataUrl = (dataUrl: string): Buffer =>
  Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
