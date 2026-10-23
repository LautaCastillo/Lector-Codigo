/** Simbologías soportadas por expo-camera (SDK 57). Los valores coinciden con BarcodeType. */
export const SIMBOLOGIAS = [
  'code39',
  'code93',
  'code128',
  'ean13',
  'ean8',
  'upc_a',
  'upc_e',
  'itf14',
  'codabar',
  'qr',
  'datamatrix',
  'pdf417',
  'aztec',
] as const;

export type Simbologia = (typeof SIMBOLOGIAS)[number];

/** Conjunto por defecto: códigos lineales habituales en etiquetas de inventario más QR. */
export const SIMBOLOGIAS_POR_DEFECTO: readonly Simbologia[] = [
  'code39',
  'code128',
  'ean13',
  'qr',
];

export function esSimbologia(valor: string): valor is Simbologia {
  return (SIMBOLOGIAS as readonly string[]).includes(valor);
}

/** Interpreta una lista separada por comas; descarta valores inválidos y duplicados. */
export function parsearSimbologias(texto: string | undefined): Simbologia[] {
  if (!texto?.trim()) return [...SIMBOLOGIAS_POR_DEFECTO];
  const lista = [
    ...new Set(
      texto
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(esSimbologia),
    ),
  ];
  return lista.length ? lista : [...SIMBOLOGIAS_POR_DEFECTO];
}
