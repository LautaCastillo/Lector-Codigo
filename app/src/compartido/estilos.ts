// Estilos que se repetían en varias pantallas. Cada pantalla los suma al principio de su `fabrica` con `...comunes(c)`
// y puede pisar cualquiera declarando el suyo después.
import { radio, type Paleta } from './tema';

export const comunes = (c: Paleta) => ({
  /** Texto secundario debajo de un título o una lista. */
  ayuda: { fontSize: 14, color: c.suave },
  error: { fontSize: 15, color: c.error },
  /** Pantalla de lista: encabezado (`columna`) y lista (`listaExterna` + `lista`), centrados con ancho máximo. */
  contenedor: { flex: 1, alignItems: 'center' },
  columna: { width: '100%', maxWidth: 720, paddingHorizontal: 20, paddingTop: 20, gap: 10 },
  listaExterna: { width: '100%' },
  lista: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 20, gap: 12 },
  /** Caja de búsqueda con ícono (`campoBusqueda`) y el texto que se escribe adentro (`entradaBusqueda`). */
  campoBusqueda: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 14,
    borderRadius: radio,
    borderWidth: 1.5,
    borderColor: c.borde,
    backgroundColor: c.superficie,
  },
  entradaBusqueda: { flex: 1, fontSize: 16, color: c.texto, minHeight: 48 },
});
