import type { DragEvent } from 'react';

/** The drag type an equipment item carries, so a tile knows it isn't a file. */
export const ITEM_MIME = 'application/x-fleethub-item';

export const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files');
export const hasItem = (e: DragEvent) => Array.from(e.dataTransfer.types).includes(ITEM_MIME);
