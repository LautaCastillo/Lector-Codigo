import { describe, expect, it } from 'vitest';
import { parsearFilasSiu } from './siu-excel.js';

const encabezado = [
  'Nro. patrimonial', 'Descripción', 'Catálogo', 'Ubicación física', 'Área responsable', 'Motivo de alta',
  'Estado', 'Valor bienes', 'Fecha incorporación', 'Número de serie', 'Número anterior', 'Expediente',
];

describe('parsearFilasSiu', () => {
  it('convierte una fila del listado de SIU', () => {
    const { bienes, omitidas } = parsearFilasSiu([
      encabezado,
      ['NUI:00006349', ' FICHERO  DE MESA ', '4.3.7.00036 - FICHERO', 'ADMINCENTRAL', '1-9 Patrimonio', 'Otros ingresos', 'Bueno', 512, '11/09/1990', null, '400 -461 -15901  -  ', '0      /0   '],
      [null, null, null, null, null, null, null, 1234],
    ]);
    expect(omitidas).toBe(1);
    expect(bienes).toHaveLength(1);
    expect(bienes[0]).toMatchObject({
      numeroInventario: '00006349',
      descripcion: 'FICHERO DE MESA',
      estadoBien: 'Bueno',
      valorUnitario: 512,
      numeroSerie: null,
      numeroAnterior: '400 -461 -15901 -',
      expediente: null,
    });
    expect(bienes[0]?.fechaIncorporacion?.toISOString()).toBe('1990-09-11T00:00:00.000Z');
  });

  it('rechaza un archivo que no es un listado de SIU', () => {
    expect(() => parsearFilasSiu([['a', 'b'], ['1', '2']])).toThrow(/Nro. patrimonial/);
  });
});
