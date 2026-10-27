import createDOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

const purify = createDOMPurify(new JSDOM('').window);

// No scripts, no embedded HTML, and no links out: a drawing can only draw.
purify.addHook('afterSanitizeAttributes', (node) => {
  for (const attr of ['href', 'xlink:href']) {
    const value = node.getAttribute(attr);
    if (value && !value.startsWith('#')) node.removeAttribute(attr);
  }
});

/** True when the bytes look like an SVG document (text that opens an <svg> element). */
export function looksLikeSvg(buf: Buffer) {
  const head = buf.subarray(0, 1024).toString('utf8').trimStart().toLowerCase();
  return (
    (head.startsWith('<?xml') || head.startsWith('<svg') || head.startsWith('<!--')) &&
    head.includes('<svg')
  );
}

/**
 * A user's drawing, cleaned for display (SPEC A4): SVG elements only, no scripts, event
 * handlers, foreignObject or external references. Returns null when nothing drawable is left.
 */
export function sanitizeSvg(source: string): string | null {
  const clean = purify.sanitize(source, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['foreignObject', 'script', 'style', 'image', 'use'],
    FORBID_ATTR: ['style'],
  });
  return /<svg[\s>]/i.test(clean) ? clean : null;
}
