import type { BienDto } from '@patrimonio/shared';
import { describe, expect, it } from 'vitest';
import {
  agregarLectura,
  asegurarIds,
  buscarEnEsperados,
  marcarEnviados,
  nuevoLote,
  quitarItem,
  relevamientosPorEnviar,
  resolverPendiente,
  resumir,
  textoResumen,
  type Lote,
} from './lote';

const bien = (numero: string, descripcion = 'Silla', ubicacion: string | null = 'Oficina 1'): BienDto => ({
  id: `id-${numero}`,
  numeroInventario: numero,
  descripcion,
  estadoCodigo: 'legible',
  estadoBien: 'Bueno',
  ubicacionFisica: ubicacion,
  areaResponsable: null,
  catalogo: null,
});

const B1 = bien('00333013');
const B2 = bien('00333014', 'Mesa');
const B3 = bien('00333015', 'Armario');
const OTRO = bien('00999999', 'Escritorio', 'Oficina 2');

const AHORA = new Date('2026-10-30T12:00:00Z');
const generador = () => {
  let n = 0;
  return () => `id-${++n}`;
};
const lote = (): Lote => nuevoLote('Oficina 1', [B1, B2, B3], 'lote-1', AHORA);

describe('nuevoLote', () => {
  it('arranca vacío y con la ubicación y lo esperado', () => {
    const l = lote();
    expect(l).toMatchObject({ id: 'lote-1', ubicacion: 'Oficina 1', items: [], enviados: [], iniciadoEn: AHORA.toISOString() });
    expect(l.esperados).toHaveLength(3);
  });
});

describe('buscarEnEsperados', () => {
  it('encuentra por el número exacto', () => {
    expect(buscarEnEsperados(lote(), 'code128', '00333013')).toBe(B1);
  });
  it('acepta el número con otro relleno de ceros y los asteriscos de Code 39', () => {
    expect(buscarEnEsperados(lote(), 'code39', '*333014*')).toBe(B2);
    expect(buscarEnEsperados(lote(), 'ean13', '0000000333015')).toBe(B3);
  });
  it('devuelve undefined si no es de la ubicación', () => {
    expect(buscarEnEsperados(lote(), 'code128', '00999999')).toBeUndefined();
  });
});

describe('agregarLectura', () => {
  it('suma un bien esperado con su identificador y la hora', () => {
    const r = agregarLectura(lote(), { simbologia: 'code128', valor: '00333013' }, { estado: 'encontrado', bien: B1 }, generador(), AHORA);
    expect(r.repetido).toBe(false);
    expect(r.item).toMatchObject({ idCliente: 'id-1', clave: 'bien:00333013', estado: 'encontrado', enEsperados: true, veces: 1, hora: AHORA.toISOString() });
    expect(r.lote.items).toEqual([r.item]);
  });

  it('marca como "otra ubicación" al bien que el catálogo ubica en otro lado', () => {
    const r = agregarLectura(lote(), { simbologia: 'code128', valor: '00999999' }, { estado: 'encontrado', bien: OTRO }, generador());
    expect(r.item.enEsperados).toBe(false);
  });

  it('pone los más recientes primero', () => {
    const id = generador();
    const a = agregarLectura(lote(), { simbologia: 'code128', valor: '00333013' }, { estado: 'encontrado', bien: B1 }, id);
    const b = agregarLectura(a.lote, { simbologia: 'code128', valor: '00333014' }, { estado: 'encontrado', bien: B2 }, id);
    expect(b.lote.items.map((i) => i.bien?.numeroInventario)).toEqual(['00333014', '00333013']);
  });

  it('un bien leído dos veces no se duplica: suma una vez más y avisa que es repetido', () => {
    const id = generador();
    const a = agregarLectura(lote(), { simbologia: 'code128', valor: '00333013' }, { estado: 'encontrado', bien: B1 }, id);
    // Aunque la segunda lectura venga con otra simbología o relleno, es el mismo bien.
    const b = agregarLectura(a.lote, { simbologia: 'ean13', valor: '0000000333013' }, { estado: 'encontrado', bien: B1 }, id);
    expect(b.repetido).toBe(true);
    expect(b.lote.items).toHaveLength(1);
    expect(b.item.veces).toBe(2);
    expect(b.item.idCliente).toBe('id-1');
  });

  it('un código fuera del catálogo se repite por su lectura normalizada', () => {
    const id = generador();
    const a = agregarLectura(lote(), { simbologia: 'code39', valor: '*abc*' }, { estado: 'no_encontrado' }, id);
    const b = agregarLectura(a.lote, { simbologia: 'code39', valor: 'ABC' }, { estado: 'no_encontrado' }, id);
    expect(a.item.estado).toBe('no_encontrado');
    expect(a.item.enEsperados).toBe(false);
    expect(b.repetido).toBe(true);
    expect(b.lote.items).toHaveLength(1);
  });

  it('no modifica el lote original', () => {
    const original = lote();
    agregarLectura(original, { simbologia: 'code128', valor: '00333013' }, { estado: 'encontrado', bien: B1 }, generador());
    expect(original.items).toEqual([]);
  });
});

describe('quitarItem', () => {
  it('saca el ítem indicado', () => {
    const a = agregarLectura(lote(), { simbologia: 'code128', valor: '00333013' }, { estado: 'encontrado', bien: B1 }, generador());
    expect(quitarItem(a.lote, a.item.clave).items).toEqual([]);
  });
});

describe('resolverPendiente', () => {
  const sinVerificar = () => agregarLectura(lote(), { simbologia: 'code128', valor: '00333013' }, { estado: 'sin_verificar' }, generador());

  it('un ítem sin verificar que resulta ser un bien esperado pasa a encontrado', () => {
    const { lote: l, item } = sinVerificar();
    const r = resolverPendiente(l, item.clave, { estado: 'encontrado', bien: B1 });
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ clave: 'bien:00333013', estado: 'encontrado', enEsperados: true, idCliente: item.idCliente });
    expect(r.items[0]?.bien).toBe(B1);
  });

  it('si resulta no estar en el catálogo, pasa a no encontrado', () => {
    const { lote: l, item } = sinVerificar();
    const r = resolverPendiente(l, item.clave, { estado: 'no_encontrado' });
    expect(r.items[0]).toMatchObject({ estado: 'no_encontrado', enEsperados: false });
  });

  it('si el bien ya estaba en el lote, se juntan y se suman las veces', () => {
    const id = generador();
    const a = agregarLectura(lote(), { simbologia: 'code128', valor: '00333013' }, { estado: 'encontrado', bien: B1 }, id);
    const b = agregarLectura(a.lote, { simbologia: 'qr', valor: 'otro-codigo' }, { estado: 'sin_verificar' }, id);
    const c = agregarLectura(b.lote, { simbologia: 'qr', valor: 'otro-codigo' }, { estado: 'sin_verificar' }, id);
    const r = resolverPendiente(c.lote, c.item.clave, { estado: 'encontrado', bien: B1 });
    expect(r.items).toHaveLength(1);
    expect(r.items[0]?.veces).toBe(3);
  });

  it('sigue igual si vuelve a no poder verificarse, si el ítem no existe o no estaba pendiente', () => {
    const { lote: l, item } = sinVerificar();
    expect(resolverPendiente(l, item.clave, { estado: 'sin_verificar' })).toBe(l);
    expect(resolverPendiente(l, 'no-existe', { estado: 'no_encontrado' })).toBe(l);
    const hecho = resolverPendiente(l, item.clave, { estado: 'encontrado', bien: B1 });
    expect(resolverPendiente(hecho, hecho.items[0]!.clave, { estado: 'no_encontrado' })).toBe(hecho);
  });
});

describe('asegurarIds', () => {
  it('completa lo que le falta a un lote guardado por una versión anterior', () => {
    const viejo = {
      ubicacion: 'Oficina 1',
      iniciadoEn: AHORA.toISOString(),
      esperados: [],
      items: [{ clave: 'bien:1', leido: '1', simbologia: 'code128', estado: 'encontrado', veces: 1, enEsperados: true, hora: AHORA.toISOString() }],
    } as unknown as Lote;
    const r = asegurarIds(viejo, generador());
    expect(r.id).toBe('id-1');
    expect(r.enviados).toEqual([]);
    expect(r.items[0]?.idCliente).toBe('id-2');
  });

  it('no cambia los identificadores que ya existen', () => {
    const a = agregarLectura(lote(), { simbologia: 'code128', valor: '00333013' }, { estado: 'encontrado', bien: B1 }, () => 'fijo');
    const r = asegurarIds(a.lote, () => 'nuevo');
    expect(r.id).toBe('lote-1');
    expect(r.items[0]?.idCliente).toBe('fijo');
  });
});

describe('relevamientosPorEnviar y marcarEnviados', () => {
  const armado = () => {
    const id = generador();
    let l = lote();
    l = agregarLectura(l, { simbologia: 'code128', valor: '00333013' }, { estado: 'encontrado', bien: B1 }, id, AHORA).lote;
    l = agregarLectura(l, { simbologia: 'qr', valor: 'xyz' }, { estado: 'no_encontrado' }, id, AHORA).lote;
    l = agregarLectura(l, { simbologia: 'code128', valor: '00333014' }, { estado: 'sin_verificar' }, id, AHORA).lote;
    return l;
  };

  it('arma los relevamientos con el lote y la ubicación, sin lo que quedó sin verificar', () => {
    const r = relevamientosPorEnviar(armado());
    expect(r).toHaveLength(2);
    const encontrado = r.find((x) => x.resultado === 'encontrado')!;
    expect(encontrado).toMatchObject({ idCliente: 'id-1', loteId: 'lote-1', numeroInventario: '00333013', simbologia: 'code128', valorLeido: '00333013', ubicacionObservada: 'Oficina 1', relevadoEnDispositivo: AHORA.toISOString() });
    const fuera = r.find((x) => x.resultado === 'no_encontrado')!;
    expect(fuera.numeroInventario).toBeUndefined();
    expect(fuera.valorLeido).toBe('xyz');
  });

  it('suma la jornada a cada relevamiento solo si el lote pertenece a una', () => {
    expect(relevamientosPorEnviar(armado()).every((x) => x.jornadaId === undefined)).toBe(true);
    const conJornada = { ...armado(), jornadaId: 'jornada-1' };
    expect(relevamientosPorEnviar(conJornada).every((x) => x.jornadaId === 'jornada-1')).toBe(true);
  });

  it('nuevoLote recuerda la jornada', () => {
    expect(nuevoLote('Oficina 1', [], 'l', AHORA, 'j-9').jornadaId).toBe('j-9');
    expect(nuevoLote('Oficina 1', [], 'l', AHORA).jornadaId).toBeUndefined();
  });

  it('no repite lo que el servidor ya confirmó', () => {
    const l = marcarEnviados(armado(), ['id-1']);
    expect(relevamientosPorEnviar(l).map((x) => x.idCliente)).toEqual(['id-2']);
  });

  it('marcarEnviados no repite identificadores', () => {
    const l = marcarEnviados(marcarEnviados(lote(), ['a', 'b']), ['b', 'c']);
    expect(l.enviados).toEqual(['a', 'b', 'c']);
  });
});

describe('resumir', () => {
  it('separa lo encontrado, lo de otra ubicación, lo desconocido, lo sin verificar y los faltantes', () => {
    const id = generador();
    let l = lote();
    l = agregarLectura(l, { simbologia: 'code128', valor: '00333013' }, { estado: 'encontrado', bien: B1 }, id).lote;
    l = agregarLectura(l, { simbologia: 'code128', valor: '00333013' }, { estado: 'encontrado', bien: B1 }, id).lote; // repetido
    l = agregarLectura(l, { simbologia: 'code128', valor: '00999999' }, { estado: 'encontrado', bien: OTRO }, id).lote;
    l = agregarLectura(l, { simbologia: 'qr', valor: 'xyz' }, { estado: 'no_encontrado' }, id).lote;
    l = agregarLectura(l, { simbologia: 'code128', valor: '00333014' }, { estado: 'sin_verificar' }, id).lote;
    const r = resumir(l);
    expect(r.esperados).toBe(3);
    expect(r.encontrados).toHaveLength(1);
    expect(r.otraUbicacion).toHaveLength(1);
    expect(r.noEncontrados).toHaveLength(1);
    expect(r.sinVerificar).toHaveLength(1);
    expect(r.repetidos).toBe(1);
    // Faltan B2 y B3: B2 quedó "sin verificar" y todavía no cuenta como visto.
    expect(r.faltantes.map((b) => b.numeroInventario)).toEqual(['00333014', '00333015']);
  });

  it('un lote vacío tiene todo por faltante', () => {
    expect(resumir(lote()).faltantes).toHaveLength(3);
  });
});

describe('textoResumen', () => {
  it('lleva la cabecera, los totales y la aclaración final', () => {
    const t = textoResumen(lote(), '30/10/2026');
    expect(t).toContain('Relevamiento por lote — Oficina 1');
    expect(t).toContain('Fecha: 30/10/2026');
    expect(t).toContain('Esperados en el catálogo: 3');
    expect(t).toContain('Encontrados en esta ubicación: 0 de 3');
    expect(t).toContain('Faltantes (3):');
    expect(t).toContain('- 00333013 Silla');
    expect(t).toContain('no modifica SIU Diaguita');
  });

  it('solo menciona "sin verificar" si hay ítems así', () => {
    expect(textoResumen(lote(), 'hoy')).not.toContain('Sin verificar');
    const a = agregarLectura(lote(), { simbologia: 'code128', valor: '00333014' }, { estado: 'sin_verificar' }, generador());
    expect(textoResumen(a.lote, 'hoy')).toContain('Sin verificar (sin conexión): 1');
  });

  it('indica dónde figura lo encontrado en otra ubicación', () => {
    const a = agregarLectura(lote(), { simbologia: 'code128', valor: '00999999' }, { estado: 'encontrado', bien: OTRO }, generador());
    expect(textoResumen(a.lote, 'hoy')).toContain('00999999 Escritorio (figura en: Oficina 2)');
  });

  it('recorta las listas largas a 200 líneas e informa cuántas más hay', () => {
    const muchos = Array.from({ length: 250 }, (_, i) => bien(String(i + 1).padStart(8, '0')));
    const t = textoResumen(nuevoLote('Depósito', muchos, 'l', AHORA), 'hoy');
    expect(t).toContain('Faltantes (250):');
    expect(t).toContain('… y 50 más');
    expect(t.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(200);
  });

  it('recorta las descripciones largas', () => {
    const largo = bien('00000001', 'x'.repeat(200));
    const t = textoResumen(nuevoLote('Depósito', [largo], 'l', AHORA), 'hoy');
    const linea = t.split('\n').find((l) => l.startsWith('- 00000001'))!;
    expect(linea.endsWith('…')).toBe(true);
    expect(linea.length).toBeLessThan(100);
  });
});
