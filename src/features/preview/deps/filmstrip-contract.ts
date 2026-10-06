/**
 * Opt-in cross-feature browser hook contract. Keep outside generic timeline
 * and preview barrels: the thumbnail worker needs a browser on import.
 */
export { useFilmstrip } from '@/features/timeline/contracts/filmstrip'
export type { FilmstripFrame } from '@/features/timeline/contracts/filmstrip'
