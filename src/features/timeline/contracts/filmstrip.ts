/** Narrow opt-in filmstrip contract; do not re-export from broad timeline barrels.
 * FilmstripCache starts browser workers at import, unlike pure timeline state.
 */
export { useFilmstrip } from '../hooks/use-filmstrip'
export type { FilmstripFrame } from '../hooks/use-filmstrip'
