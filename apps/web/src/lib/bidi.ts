/**
 * Wraps interpolated text (a serial, a supplier's name) in a first-strong isolate, so an English
 * name keeps its order inside a Hebrew sentence and the other way round.
 */
export const isolate = (s: string) => `⁨${s}⁩`;
