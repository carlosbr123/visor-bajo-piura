/* app.js — Visor coherente del Bajo Piura (16-sep-2026). Regla del autor: un solo color para lo que puede inundarse con el caudal
   elegido; las comparaciones con otras fuentes van en una pestaña aparte, una a la vez, en rojo.
   Cifras y mapa por caudal sólo de la llanura con curva (A). El mapa muestra lo que PUEDE inundarse: cota alta U del intervalo sellado
   ≥ 0,5 (decisión del autor: sin niveles); la estimación central p va en letra pequeña; una sola exclusión (río bajo o cauce activo); nada por debajo de 100 m³/s. Entre nodos,
   interpolación lineal en ln(Q+1). Fuentes de comparación: Copernicus EMSR199 (2017), agua vista en crecidas ≥ 700 fuera de A
   (exportar_capas_referencia.py) y mapas por fecha (servidor_visor.py). */
'use strict';
const UTM = '+proj=utm +zone=17 +south +datum=WGS84 +units=m +no_defs', WGS = '+proj=longlat +datum=WGS84 +no_defs';
const $ = id => document.getElementById(id);
const fmt = x => (x == null || !isFinite(x)) ? '–' : Math.round(x).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
let EXT = null;   // caudal externo (observado del día y pronósticos con sesgo comprobado), `datos/caudal_externo.json`
let OBS = null;   // índice de pases prerenderizados (sólo en la versión publicada; con el servidor local se leen al vuelo)
let M, ID, A8, ATR, HAB, POP, FUENTE, INDEX, BASE, BASE_D, RB, V0, N, NN, KB, LUG, VEC, IDX, CRE, PASES, mapa, capa, grupoCP, capaDist, capaRio;
const RADIO_CERCA = 10;   // D23: «cerca del agua» = a 1 km o menos (10 celdas de 100 m, distancia de tablero), medida sólo desde celdas pintadas con curva propia y sin cauce activo
const ST = { Q: 900, nivel: 'U', perm: true, cpTodos: false, comp: 'ninguna', pase: null };   // el mapa muestra lo que PUEDE inundarse: cota alta U del intervalo
const V = { L: null, p: null, U: null };
// Umbral de dibujo (autor, 16-sep-2026: «no ser tan estricto con 50 %»): la zona que puede inundarse es la cota alta U ≥ 30 %, con la misma
// exclusión al 30 % (p en 83,9 m³/s ≥ 0,3) más el cauce activo. 30 % es el valor más bajo en que más de la mitad de lo pintado a 2 204 m³/s
// estuvo dentro de la inundación de Copernicus 2017 (56 %; cubre el 73 % de ella); con 20 % sólo el 41 % (revision/umbral_dibujo_variante_visor.csv).
// La estimación central del artículo (p ≥ 0,5, exclusión al 50 %) se sigue mostrando en letra pequeña.
const UMBRAL = 0.30;
const bloques = new Map();
const TRAMOS = [[0, 0], [150, 100], [500, 900], [620, 1290], [780, 1900], [880, 2204], [1000, 3016]];
const NOMBRE = { L: 'Seguro', p: 'Probable', U: 'Posible' };
const AYUDA = { L: 'Sólo las zonas que se inundan aun en la estimación más baja.', p: 'La estimación central: la que publica el artículo.',
  U: 'También las zonas que podrían inundarse en la estimación más alta.' };
// ---------- idioma (español / inglés; pedido del autor, 17-sep-2026) ----------
let LANG = (() => { const u = new URLSearchParams(location.search).get('lang'); if (u === 'es' || u === 'en') return u;
  try { const s = localStorage.getItem('visor_idioma'); if (s === 'es' || s === 'en') return s; } catch (e) { } return 'es'; })();
let NOTA_FECHAS = null;   // [n, n0] en la versión publicada; 'local' con el servidor local
const TX = {
  es: {
    titulo: 'Inundaciones del Bajo Piura', sub: 'Qué zonas de la llanura se inundan según el caudal del río Piura en Puente Sánchez Cerro',
    tab_pred: 'Por caudal', tab_curva: 'Curva de la llanura', tab_comp: 'Comparar', etq_caudal: 'Caudal del río', aria_caudal: 'Caudal',
    rap_900: '900 amarilla', rap_1290: '1 290 naranja', rap_1900: '1 900 roja',
    diques: '<b>Tramo con diques.</b> Entre Piura y Cura Mori el río va entre diques y este mapa supone que resisten. No representa desbordes dentro de la ciudad ni roturas de diques. En 2017 hubo ambos: el río se desbordó en Piura y Castilla el 27 de marzo y los diques de Pedregal Chico, Narihualá y Cura Mori se rompieron el 3 de abril.',
    b_ver2017: 'Comparar con la inundación de 2017', etq_resumen: 'Lo que puede inundarse con este caudal',
    nom_ha: 'hectáreas de la llanura', nom_cult: 'hectáreas de cultivo', nom_hab: 'personas', nom_cp: 'centros poblados con su terreno en la zona', ver_lista: 'Ver la lista',
    capa_perm: 'Río, lagunas y agua permanente', capa_cp: 'Centros poblados afectados', capa_cp_todos: 'Todos los centros poblados', capa_dist: 'Límites de distritos',
    ayuda_curva: 'Hectáreas de la llanura que pueden inundarse según el caudal (azul) y estimación central del artículo (línea oscura). La línea discontinua marca el caudal elegido en «Por caudal»; las líneas de color, los niveles de alerta del COER; el rayado, la extrapolación.',
    ayuda_comp: 'El mapa azul del caudal elegido se mantiene. Elija una fuente para verla encima, en rojo; donde coinciden se ve morado.',
    comp_ninguna: 'Ninguna', comp_emsr: 'Inundación de marzo de 2017, cartografiada por Copernicus con otros satélites',
    comp_crecidas: 'Agua vista por el satélite en las crecidas grandes (2017, 2023 y 2026) en las lagunas y la llanura sin estimación', comp_fecha: 'Agua vista por el satélite en una fecha',
    b_leer: 'Cómo leer este mapa', b_lista: 'Lista de centros poblados', b_img: 'Descargar imagen',
    nota_pie: 'Producto de investigación, no oficial. Para alertas, consulte al COER Piura, al SENAMHI o a la ANA.', cerrar: 'Cerrar',
    al_bajo: 'Caudal bajo', al_ex: 'Más de lo observado', al_ro: 'Alerta roja', al_na: 'Alerta naranja', al_am: 'Alerta amarilla', al_sin: 'Sin alerta',
    aviso_bajo: 'Con menos de 100 m³/s el río no desborda. El agua que se ve en esa época es de riego, drenes o lagunas y no se cuenta como inundación.',
    aviso_ex: 'Más de 2 204 m³/s no se ha observado con satélite: el mapa es una extrapolación (rayado) y sus cifras son menos seguras.',
    eje_q: 'caudal (m³/s)', curva_30: '30 %: se pinta si la sombra lo alcanza',
    curva_nota: 'Línea: probabilidad central · sombra: margen del 90 % · rojo: caudal elegido · rayado: extrapolación.',
    puede: 'puede inundarse', central_lin: 'estimación central',
    curva_sin: q => `Con ${q} m³/s el río no desborda.`, curva_info: (q, ha, det) => `Con ${q} m³/s pueden inundarse ${ha} ha (${det} ha).`,
    ext_obs: (f, q, tipo, dias) => `<b>Caudal observado</b> el ${f}: <b>${q} m³/s</b> (${tipo})${dias > 2 ? ` <span class="rango">· último dato, de hace ${dias} días</span>` : ''}`,
    ext_ver: 'ver en el mapa', ext_esc: 'ver escenario',
    ext_pro: (fu, em, h, q, fm, qb, qa) => `<b>Pronóstico ${fu}</b> (emitido el ${em}, ${h} días): máximo <b>${q} m³/s</b> el ${fm} <span class="rango">(entre ${qb} y ${qa})</span>`,
    ext_nota: fu => `El mapa muestra lo que puede inundarse si ocurre ese caudal; no es un pronóstico de inundación.${fu ? ' Observado: ' + fu + '.' : ''}`,
    tipo: t => t,
    central: v => `estimación central: ${v}`, sin_desborde: 'Caudal sin desborde',
    cult_det: (c, wc) => `${c}<br>MIDAGRI 2024 · WorldCover: ${wc} ha`,
    hab_det: (c, n) => `${c}<br><b>${n}</b> viven a 1 km o menos del agua<br>WorldPop 2020`,
    cp_det_sin: n => `de ${n} en la zona de estudio`, cp_det: n => `y ${n} más con agua a 1 km o menos · ver lista`,
    ley_puede: q => `puede inundarse con ${q} m³/s`, ley_extr: 'estimación extrapolada', ley_perm: 'río, lagunas y agua permanente',
    ley_emsr: 'inundación de marzo de 2017 (Copernicus)', ley_crec: 'agua vista en crecidas grandes', ley_fecha: f => `agua vista el ${f}`, ley_coinc: 'coinciden',
    ley_cp2: 'centro poblado con su terreno inundado', ley_cp1: 'con agua a 1 km o menos', ley_cp0: 'sin agua cerca',
    cp_estado: ['sin agua cerca', 'agua a 1 km o menos', 'su terreno puede inundarse'],
    distrito: d => `Distrito de ${d}`, mapa: 'Mapa', sat: 'Satélite',
    pop_base: 'Aquí hay agua aun con el río bajo (cauce, drenes o agua de temporada); no se cuenta como inundación.',
    pop_prob: (q, p, l, u) => `Con ${q} m³/s, probabilidad de que esta hectárea esté inundada: <b>${p}</b> (margen del 90 %: ${l} a ${u}).<br>`,
    pop_ambas: '<b>Puede inundarse</b>; también en la estimación central.', pop_u: '<b>Puede inundarse</b>: el margen alto llega al 30 %.',
    pop_no: 'Fuera de la zona que puede inundarse: ni el margen alto llega al 30 %.', pop_extr: '<br>(extrapolación)',
    pop_sinA: 'Zona sin estimación por caudal (lagunas y depresiones del sur o llanura sin curva). Lo que el satélite vio aquí en las crecidas grandes está en la pestaña «Comparar».',
    pop_emsr_si: d => `Copernicus la marcó inundada en marzo de 2017 (${d}).`, pop_emsr_no: 'Copernicus no la marcó inundada en 2017.', emsr_fechas: ['26-mar', '30-mar', '26 y 30-mar'],
    pop_crec_si: 'El satélite vio agua aquí en las crecidas grandes.', pop_crec_no: 'El satélite no vio agua aquí en las crecidas grandes.',
    pop_fecha_si: 'Con agua en la fecha elegida.', pop_fecha_no: 'Sin agua en la fecha elegida.',
    lista_tit: q => `Centros poblados con ${q} m³/s`, lista_hab: n => `${n} hab. en 500 m a la redonda`,
    lista_zona: n => `Con su terreno en la zona que puede inundarse (${n})`, lista_cerca: n => `Con agua a 1 km o menos (${n})`, ninguno: 'Ninguno.',
    lista_nota: 'Se evalúa la llanura con estimación por caudal. El radar no ve el agua dentro de las ciudades; por eso cada pueblo se evalúa por su hectárea y su entorno. Toque un nombre para ir al lugar.',
    info_emsr: 'Inundación de los días 26 y 30 de marzo de 2017 cartografiada por el servicio Copernicus con los satélites Radarsat y COSMO-SkyMed, independientes del que usa este mapa. Aquel evento incluyó el desborde en Piura y Castilla del 27 de marzo, roturas de diques el 3 de abril y lluvias intensas.',
    info_crecidas: 'Píxeles con agua en al menos la mitad de las nueve imágenes con caudal de 700 m³/s o más (seis de 2017, una de 2023 y dos de 2026), fuera de la llanura con estimación: lagunas y depresiones del sur y llanura sin curva. No cambia con el caudal.',
    info_fecha: 'Agua detectada por el radar Sentinel-1 en la fecha elegida (probabilidad calibrada ≥ 0,5).',
    info_fecha_parcial: (n, n0) => ` En esta versión en línea hay ${n} de las ${n0} fechas.`, info_fecha_local: ' Todas las fechas se leen del servidor local del visor.',
    info_crec_tot: (ha, hab, cu) => ` En total ${ha} ha, con ${hab} personas y ${cu} ha de cultivo MIDAGRI; no entran en las cifras del caudal.`,
    op_sinq: 'sin caudal', op_km2: 'km² de agua',
    cap_sub: (q, al) => `Caudal ${q} m³/s · ${al} · lo que puede inundarse`,
    cap_pie: 'Producto de investigación, no oficial · Sentinel-1 2017–2026 · WorldPop 2020 · MIDAGRI 2024 · Copernicus EMS (EMSR199) · © OpenStreetMap',
    cap_arch: q => `inundacion_piura_${q}m3s.png`, error: m => `Error al cargar: ${m}`,
    meses: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'], coma: ','
  },
  en: {
    titulo: 'Lower Piura floods', sub: 'Which parts of the floodplain flood depending on the Piura River discharge at Puente Sánchez Cerro',
    tab_pred: 'By discharge', tab_curva: 'Floodplain curve', tab_comp: 'Compare', etq_caudal: 'River discharge', aria_caudal: 'Discharge',
    rap_900: '900 yellow', rap_1290: '1 290 orange', rap_1900: '1 900 red',
    diques: '<b>Embanked reach.</b> Between Piura and Cura Mori the river runs between embankments, and this map assumes they hold. It does not represent overflows inside the city or embankment breaches. Both happened in 2017: the river overflowed in Piura and Castilla on 27 March, and the embankments at Pedregal Chico, Narihualá and Cura Mori broke on 3 April.',
    b_ver2017: 'Compare with the 2017 flood', etq_resumen: 'What can flood at this discharge',
    nom_ha: 'hectares of floodplain', nom_cult: 'hectares of cropland', nom_hab: 'people', nom_cp: 'settlements with their land in the zone', ver_lista: 'See the list',
    capa_perm: 'River, lakes and permanent water', capa_cp: 'Affected settlements', capa_cp_todos: 'All settlements', capa_dist: 'District boundaries',
    ayuda_curva: 'Hectares of floodplain that can flood at each discharge (blue) and central estimate of the article (dark line). The dashed line marks the discharge chosen in “By discharge”; the coloured lines, the COER alert levels; the hatching, the extrapolation.',
    ayuda_comp: 'The blue map of the chosen discharge stays. Choose a source to see it on top, in red; where both coincide it shows purple.',
    comp_ninguna: 'None', comp_emsr: 'March 2017 flood, mapped by Copernicus with other satellites',
    comp_crecidas: 'Water seen by the satellite in the large floods (2017, 2023 and 2026) in the lakes and the floodplain without an estimate', comp_fecha: 'Water seen by the satellite on a date',
    b_leer: 'How to read this map', b_lista: 'List of settlements', b_img: 'Download image',
    nota_pie: 'Research product, not official. For warnings, consult COER Piura, SENAMHI or ANA.', cerrar: 'Close',
    al_bajo: 'Low flow', al_ex: 'Beyond observed', al_ro: 'Red alert', al_na: 'Orange alert', al_am: 'Yellow alert', al_sin: 'No alert',
    aviso_bajo: 'Below 100 m³/s the river does not overflow. The water seen at that time comes from irrigation, drains or lakes and is not counted as flooding.',
    aviso_ex: 'Discharges above 2 204 m³/s have not been observed by satellite: the map is an extrapolation (hatched) and its figures are less certain.',
    eje_q: 'discharge (m³/s)', curva_30: '30 %: drawn if the band reaches it',
    curva_nota: 'Line: central probability · shading: 90 % margin · red: chosen discharge · hatching: extrapolation.',
    puede: 'can flood', central_lin: 'central estimate',
    curva_sin: q => `At ${q} m³/s the river does not overflow.`, curva_info: (q, ha, det) => `At ${q} m³/s, ${ha} ha can flood (${det} ha).`,
    ext_obs: (f, q, tipo, dias) => `<b>Observed discharge</b> on ${f}: <b>${q} m³/s</b> (${tipo})${dias > 2 ? ` <span class="rango">· latest value, ${dias} days old</span>` : ''}`,
    ext_ver: 'show on map', ext_esc: 'show scenario',
    ext_pro: (fu, em, h, q, fm, qb, qa) => `<b>${fu} forecast</b> (issued ${em}, ${h} days): peak <b>${q} m³/s</b> on ${fm} <span class="rango">(between ${qb} and ${qa})</span>`,
    ext_nota: fu => `The map shows what can flood if that discharge occurs; it is not a flood forecast.${fu ? ' Observed: ' + fu.replace('estación', 'station') + '.' : ''}`,
    tipo: t => t === 'medio diario' ? 'daily mean' : t,
    central: v => `central estimate: ${v}`, sin_desborde: 'No overflow at this discharge',
    cult_det: (c, wc) => `${c}<br>MIDAGRI 2024 · WorldCover: ${wc} ha`,
    hab_det: (c, n) => `${c}<br><b>${n}</b> live within 1 km of the water<br>WorldPop 2020`,
    cp_det_sin: n => `of ${n} in the study area`, cp_det: n => `and ${n} more with water within 1 km · see list`,
    ley_puede: q => `can flood at ${q} m³/s`, ley_extr: 'extrapolated estimate', ley_perm: 'river, lakes and permanent water',
    ley_emsr: 'March 2017 flood (Copernicus)', ley_crec: 'water seen in large floods', ley_fecha: f => `water seen on ${f}`, ley_coinc: 'both',
    ley_cp2: 'settlement with its land flooded', ley_cp1: 'with water within 1 km', ley_cp0: 'no water nearby',
    cp_estado: ['no water nearby', 'water within 1 km', 'its land can flood'],
    distrito: d => `${d} district`, mapa: 'Map', sat: 'Satellite',
    pop_base: 'There is water here even with the river low (channel, drains or seasonal water); it is not counted as flooding.',
    pop_prob: (q, p, l, u) => `At ${q} m³/s, probability that this hectare is flooded: <b>${p}</b> (90 % margin: ${l} to ${u}).<br>`,
    pop_ambas: '<b>Can flood</b>; also in the central estimate.', pop_u: '<b>Can flood</b>: the upper margin reaches 30 %.',
    pop_no: 'Outside the zone that can flood: not even the upper margin reaches 30 %.', pop_extr: '<br>(extrapolation)',
    pop_sinA: 'Area without a discharge-based estimate (southern lakes and depressions, or floodplain without a curve). What the satellite saw here during the large floods is in the “Compare” tab.',
    pop_emsr_si: d => `Copernicus mapped it as flooded in March 2017 (${d}).`, pop_emsr_no: 'Copernicus did not map it as flooded in 2017.', emsr_fechas: ['26 Mar', '30 Mar', '26 and 30 Mar'],
    pop_crec_si: 'The satellite saw water here during the large floods.', pop_crec_no: 'The satellite did not see water here during the large floods.',
    pop_fecha_si: 'Water on the chosen date.', pop_fecha_no: 'No water on the chosen date.',
    lista_tit: q => `Settlements at ${q} m³/s`, lista_hab: n => `${n} inhabitants within 500 m`,
    lista_zona: n => `With their land in the zone that can flood (${n})`, lista_cerca: n => `With water within 1 km (${n})`, ninguno: 'None.',
    lista_nota: 'Only the floodplain with a discharge-based estimate is assessed. The radar does not see water inside towns, so each settlement is assessed by its hectare and its surroundings. Tap a name to go to the place.',
    info_emsr: 'Flood of 26 and 30 March 2017 mapped by the Copernicus service with the Radarsat and COSMO-SkyMed satellites, independent of the one used for this map. That event included the overflow in Piura and Castilla on 27 March, embankment breaches on 3 April and heavy rain.',
    info_crecidas: 'Pixels with water in at least half of the nine images with discharge of 700 m³/s or more (six from 2017, one from 2023 and two from 2026), outside the floodplain with an estimate: southern lakes and depressions and floodplain without a curve. It does not change with discharge.',
    info_fecha: 'Water detected by the Sentinel-1 radar on the chosen date (calibrated probability ≥ 0.5).',
    info_fecha_parcial: (n, n0) => ` This online version has ${n} of the ${n0} dates.`, info_fecha_local: ' All dates are read from the local viewer server.',
    info_crec_tot: (ha, hab, cu) => ` In total ${ha} ha, with ${hab} people and ${cu} ha of MIDAGRI cropland; they are not included in the discharge figures.`,
    op_sinq: 'no discharge', op_km2: 'km² of water',
    cap_sub: (q, al) => `Discharge ${q} m³/s · ${al} · what can flood`,
    cap_pie: 'Research product, not official · Sentinel-1 2017–2026 · WorldPop 2020 · MIDAGRI 2024 · Copernicus EMS (EMSR199) · © OpenStreetMap',
    cap_arch: q => `lower_piura_flood_${q}m3s.png`, error: m => `Loading error: ${m}`,
    meses: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], coma: '.'
  }
};
const tr = (k, ...a) => { const v = TX[LANG][k] !== undefined ? TX[LANG][k] : TX.es[k]; return typeof v === 'function' ? v(...a) : v; };
function aplicarIdioma() {
  document.documentElement.lang = LANG; document.title = tr('titulo');
  document.querySelectorAll('[data-i18n]').forEach(el => { el.innerHTML = tr(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = tr(el.dataset.i18nTitle); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', tr(el.dataset.i18nAria)); });
  document.querySelectorAll('.idioma button').forEach(b => b.classList.toggle('activa', b.dataset.lang === LANG));
}
function cambiarIdioma(l) {
  if (l === LANG) return; LANG = l; try { localStorage.setItem('visor_idioma', l); } catch (e) { }
  aplicarIdioma(); if (!M || !mapa) return;
  controlCapas(); llenarFechas(); mostrarCaudalExterno(); fijarComp(ST.comp); fijarQ(ST.Q);
  if (!$('modal').classList.contains('oculto')) $('modal').classList.add('oculto');
}
document.querySelectorAll('.idioma button').forEach(b => { b.onclick = () => cambiarIdioma(b.dataset.lang); });
aplicarIdioma();
const AZUL = [21, 101, 192, 205], AZUL_EX = [120, 170, 230, 205], PERM = [110, 140, 175, 150], ROJO = [229, 57, 53, 150], MORADO = [125, 79, 122, 220];

async function bin(u, T) {
  if (OBS && typeof DecompressionStream !== 'undefined') {   // versión publicada: binarios en gzip (19 MB → 3 MB)
    try {
      const r = await fetch(u + '.gz');
      if (r.ok) {
        const buf = new Uint8Array(await r.arrayBuffer());
        if (buf[0] === 0x1f && buf[1] === 0x8b) {            // si el alojamiento ya lo descomprimió, se usa tal cual
          const s = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
          return new T(await new Response(s).arrayBuffer());
        }
        return new T(buf.buffer);
      }
    } catch (e) { /* se cae al binario sin comprimir */ }
  }
  const r = await fetch(u); if (!r.ok) throw new Error(u); return new T(await r.arrayBuffer());
}
async function js(u) { const r = await fetch(u); if (!r.ok) throw new Error(u); return r.json(); }

async function cargar() {
  [M, LUG, VEC, IDX, CRE, PASES] = await Promise.all([js('datos/nodos.json'), js('datos/lugares.json'), js('datos/vectores.json'), js('bloques/indice.json'), js('datos/crecidas.json'), js('datos/pases.json')]);
  OBS = await fetch('obs/indice.json').then(r => r.ok ? r.json() : null).catch(() => null);
  EXT = await fetch('datos/caudal_externo.json?t=' + Date.now()).then(r => r.ok ? r.json() : null).catch(() => null);   // lo escribe el guion diario
  if (OBS) { for (const k in OBS) OBS[k] = new Set(OBS[k]); const n0 = PASES.length; PASES = PASES.filter(p => OBS[p.pase]); if (PASES.length < n0) NOTA_FECHAS = [PASES.length, n0]; }
  else NOTA_FECHAS = 'local';
  const [id, p8, l8, u8, atr, hab, pob] = await Promise.all([bin('datos/celdas_id.bin', Int32Array), bin('datos/celdas_p.bin', Uint8Array), bin('datos/celdas_L.bin', Uint8Array),
    bin('datos/celdas_U.bin', Uint8Array), bin('datos/celdas_atrib.bin', Uint8Array), bin('datos/celdas_hab.bin', Float32Array), bin('datos/poblacion_100m.bin', Float32Array)]);
  ID = id; A8 = { p: p8, L: l8, U: u8 }; ATR = atr; HAB = hab; POP = pob; N = ID.length; NN = M.nodos.length;
  FUENTE = new Uint8Array(N); for (let i = 0; i < N; i++) FUENTE[i] = ATR[i * 6 + 4] === 0 && !(ATR[i * 6] & 8) ? 1 : 0;   // curva propia y sin cauce: puede irradiar «cerca del agua»
  KB = M.nodos.findIndex(n => Math.abs(n.Q - M.nodo_base) < 1e-6);
  BASE = new Uint8Array(N); RB = new Uint8Array(N); V0 = new Float32Array(N);
  BASE_D = new Uint8Array(N);
  for (let i = 0; i < N; i++) { BASE[i] = ATR[i * 6] & 1; V0[i] = A8.p[i * NN + KB] / 250; RB[i] = V0[i] >= UMBRAL - 1e-7;
    const cauce = BASE[i] && !(A8.p[i * NN + KB] >= 125); BASE_D[i] = cauce || RB[i]; }   // BASE: exclusión del artículo (50 %); BASE_D: la del dibujo (30 %)   // exclusión única; agua con el río bajo sólo para dibujar
  INDEX = new Int32Array(M.malla.H * M.malla.W).fill(-1); for (let i = 0; i < N; i++) INDEX[ID[i]] = i;
  IDX.sets = {}; for (const k of ['mascara', 'crecidas', 'emsr']) IDX.sets[k] = new Set(IDX[k]);
  VEC.rio_lagunas.features = VEC.rio_lagunas.features.filter(f => !(f.properties && f.properties.name === 'Laguna La Niña'));   // efímera: no es agua permanente
  const W = M.malla.W, H = M.malla.H;
  for (const c of LUG.centros_poblados) {
    if (c.fila !== undefined) { c.r = c.fila; c.c = c.col; }   // celda exacta exportada (evita el error de redondeo en los bordes)
    else { const [x, y] = proj4(WGS, UTM, [c.lon, c.lat]); c.r = Math.floor((M.malla.y0 - y) / 100); c.c = Math.floor((x - M.malla.x0) / 100); }
    c.celdaA = INDEX[c.r * W + c.c]; c.celdasA = [];
    for (let dr = -RADIO_CERCA; dr <= RADIO_CERCA; dr++) for (let dc = -RADIO_CERCA; dc <= RADIO_CERCA; dc++) { const r = c.r + dr, cc = c.c + dc; if (r < 0 || cc < 0 || r >= H || cc >= W) continue; const j = INDEX[r * W + cc]; if (j >= 0 && FUENTE[j]) c.celdasA.push(j); }
  }
  curvaLlanuraDatos(); construirMapa(); controles(); mostrarCaudalExterno(); fijarQ(900);
}

// ---------- caudal y nivel ----------
function qDeBarra(v) { for (let i = 1; i < TRAMOS.length; i++) { const [a, qa] = TRAMOS[i - 1], [b, qb] = TRAMOS[i]; if (v <= b) return Math.round(qa + (v - a) / (b - a) * (qb - qa)); } return 3016; }
function barraDeQ(q) { for (let i = 1; i < TRAMOS.length; i++) { const [a, qa] = TRAMOS[i - 1], [b, qb] = TRAMOS[i]; if (q <= qb) return a + (q - qa) / (qb - qa) * (b - a); } return 1000; }
function interp(A, k, w) { const v = new Float32Array(N); for (let i = 0; i < N; i++) v[i] = (w === 0 ? A[i * NN + k] : (1 - w) * A[i * NN + k] + w * A[i * NN + k + 1]) / 250; return v; }
function fijarQ(q, desdeBarra) {
  ST.Q = q = Math.max(0, Math.min(3016, Math.round(q))); $('q-valor').textContent = fmt(q); if (!desdeBarra) $('q-barra').value = barraDeQ(q);
  const qs = M.nodos.map(n => n.Q); let k = 0, w = 0;
  if (q >= qs[NN - 1]) k = NN - 1; else if (q > 0) { while (k < NN - 2 && q >= qs[k + 1]) k++; w = (Math.log(q + 1) - Math.log(qs[k] + 1)) / (Math.log(qs[k + 1] + 1) - Math.log(qs[k] + 1)); if (w < 1e-12) w = 0; }
  for (const n of ['L', 'p', 'U']) V[n] = interp(A8[n], k, w);
  const n_ = M.niveles, ch = $('q-alerta');
  const [txt, cls] = q < 100 ? [tr('al_bajo'), 'ba'] : q > 2204 ? [tr('al_ex'), 'ex'] : q >= n_.rojo ? [tr('al_ro'), 'ro'] : q >= n_.naranja ? [tr('al_na'), 'na'] : q >= n_.amarillo ? [tr('al_am'), 'am'] : [tr('al_sin'), ''];
  ch.textContent = txt; ch.className = 'chip ' + cls;
  const av = $('aviso-q');
  if (q < 100) { av.className = 'aviso'; av.textContent = tr('aviso_bajo'); }
  else if (q > 2204) { av.className = 'aviso ex'; av.textContent = tr('aviso_ex'); }
  else av.className = 'aviso oculto';
  $('aviso-diques').classList.toggle('oculto', q < n_.rojo);   // tramo con diques: desde el nivel rojo (1 900 m³/s)
  actualizar();
}
let tmr = null;
function actualizar() { resumen(); leyenda(); dibujarCurvaLlanura(); clearTimeout(tmr); tmr = setTimeout(() => capa && capa.redraw(), 40); }

// ---------- curvas ----------
const QT = [0, 10, 100, 300, 900, 2204, 3016];
function marco(W, H, ml, mb, mt, ymax, yfmt) {   // ejes en ln(Q+1), rayado de extrapolación y marcas
  const X = q => ml + Math.log(q + 1) / Math.log(3017) * (W - 6 - ml), Y = v => mt + (1 - v / ymax) * (H - mb - mt);
  let s = '<defs><pattern id="rx" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0,6 l6,-6" stroke="#aaa" stroke-width="1"/></pattern></defs>';
  s += `<rect x="${ml}" y="${mt}" width="${W - 6 - ml}" height="${H - mb - mt}" fill="#fafbfc" stroke="#ccd"/>`;
  s += `<rect x="${X(2204).toFixed(1)}" y="${mt}" width="${(W - 6 - X(2204)).toFixed(1)}" height="${H - mb - mt}" fill="url(#rx)"/>`;
  for (const q of QT) s += `<text x="${X(q).toFixed(1)}" y="${H - mb + 11}" font-size="9" text-anchor="middle" fill="#555">${fmt(q)}</text>`;
  s += `<text x="${(ml + W) / 2}" y="${H - 2}" font-size="9" text-anchor="middle" fill="#555">${tr('eje_q')}</text>`;
  for (const f of [0, 0.5, 1]) { const v = f * ymax; s += `<text x="${ml - 3}" y="${(Y(v) + 3).toFixed(1)}" font-size="9" text-anchor="end" fill="#555">${yfmt(v)}</text>`; }
  return { s, X, Y };
}
function curvaHectarea(i) {
  const W = 300, H = 150, ml = 32, mb = 26, mt = 6;
  const { s: s0, X, Y } = marco(W, H, ml, mb, mt, 1, v => Math.round(v * 100) + ' %');
  const pts = A => M.nodos.map((n, k) => `${X(n.Q).toFixed(1)},${Y(A[i * NN + k] / 250).toFixed(1)}`);
  let s = s0 + `<polygon points="${pts(A8.U).concat(pts(A8.L).reverse()).join(' ')}" fill="#90b8e8" opacity=".55"/>`;
  s += `<polyline points="${pts(A8.p).join(' ')}" fill="none" stroke="#0d47a1" stroke-width="1.8"/>`;
  s += `<line x1="${ml}" x2="${W - 6}" y1="${Y(UMBRAL)}" y2="${Y(UMBRAL)}" stroke="#1565c0" stroke-dasharray="2 2"/>`;
  s += `<text x="${ml + 3}" y="${Y(UMBRAL) - 3}" font-size="8" fill="#1565c0">${tr('curva_30')}</text>`;
  if (ST.Q >= 1) s += `<line x1="${X(ST.Q).toFixed(1)}" x2="${X(ST.Q).toFixed(1)}" y1="${mt}" y2="${H - mb}" stroke="#d6322c" stroke-width="1.2"/>`;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${s}</svg><span class="nota">${tr('curva_nota')}</span>`;
}
let CURVA = null;
function curvaLlanuraDatos() {   // hectáreas por nodo: puede inundarse (U ≥ 30 %, exclusión de dibujo) y central (p ≥ 50 %, exclusión del artículo)
  const hU = new Float64Array(NN), hP = new Float64Array(NN);
  for (let k = 0; k < NN; k++) {
    if (M.nodos[k].Q < M.q_corte) continue;
    for (let i = 0; i < N; i++) {
      const a = ATR[i * 6 + 1] / 100;
      if (A8.U[i * NN + k] / 250 >= UMBRAL - 1e-7 && !BASE_D[i]) hU[k] += a;
      if (A8.p[i * NN + k] >= 125 && !BASE[i]) hP[k] += a;
    }
  }
  CURVA = { hU, hP, max: Math.max(...hU) };
}
function dibujarCurvaLlanura() {
  if (!CURVA) return;
  const W = 340, H = 220, ml = 46, mb = 28, mt = 8, ymax = Math.ceil(CURVA.max / 5000) * 5000;
  const { s: s0, X, Y } = marco(W, H, ml, mb, mt, ymax, v => fmt(v));
  const linea = (hh, col, w) => `<polyline points="${M.nodos.map((n, k) => `${X(n.Q).toFixed(1)},${Y(hh[k]).toFixed(1)}`).join(' ')}" fill="none" stroke="${col}" stroke-width="${w}"/>`;
  let s = s0;
  for (const [q, col] of [[900, '#f2c230'], [1290, '#f08a24'], [1900, '#d6322c']]) s += `<line x1="${X(q).toFixed(1)}" x2="${X(q).toFixed(1)}" y1="${mt}" y2="${H - mb}" stroke="${col}" stroke-width="1"/>`;
  s += linea(CURVA.hU, '#1565c0', 2.4) + linea(CURVA.hP, '#1d2733', 1.4);
  s += `<line x1="${X(ST.Q).toFixed(1)}" x2="${X(ST.Q).toFixed(1)}" y1="${mt}" y2="${H - mb}" stroke="#7a1f1f" stroke-dasharray="3 2"/>`;
  s += `<text x="${ml + 4}" y="${mt + 12}" font-size="9" fill="#1565c0">${tr('puede')}</text><text x="${ml + 4}" y="${mt + 24}" font-size="9" fill="#1d2733">${tr('central_lin')}</text>`;
  s += `<text x="4" y="${mt + 10}" font-size="9" fill="#555">ha</text>`;
  $('curva-llanura').innerHTML = `<svg viewBox="0 0 ${W} ${H}">${s}</svg>`;
  $('curva-info').textContent = ST.Q < M.q_corte ? tr('curva_sin', fmt(ST.Q)) : tr('curva_info', fmt(ST.Q), $('r-ha').textContent, $('r-ha-det').textContent);
}


// ---------- cifras (sólo llanura con curva) ----------
const umb = n => n === 'U' ? UMBRAL : 0.5, exc = n => n === 'U' ? BASE_D : BASE;
const inund = (n, i) => i >= 0 && ST.Q >= M.q_corte && V[n][i] >= umb(n) - 1e-7 && !exc(n)[i];
function cuenta(n) { const r = { ha: 0, mnsa: 0, wc: 0, hab: 0 }; if (ST.Q < M.q_corte) return r;
  const v = V[n], t = umb(n) - 1e-7, B = exc(n); for (let i = 0; i < N; i++) if (v[i] >= t && !B[i]) { r.ha += ATR[i * 6 + 1] / 100; r.mnsa += ATR[i * 6 + 2] / 100; r.wc += ATR[i * 6 + 3] / 100; r.hab += HAB[i]; } return r; }
function estadoCP(c, n) { if (ST.Q < M.q_corte) return 0; if (inund(n, c.celdaA)) return 2; if (c.celdasA.some(i => inund(n, i))) return 1; return 0; }
// ---------- caudal externo: observado del día y pronósticos (sólo los que tienen el sesgo comprobado frente a Sánchez Cerro) ----------
const fmtFecha = s => { const [a, m, d] = String(s).slice(0, 10).split('-'); return `${+d}-${tr('meses')[+m - 1]}-${a}`; };
const fmtQ = q => q == null || !isFinite(q) ? '–' : q < 10 ? q.toFixed(1).replace('.', tr('coma')) : fmt(q);
function mostrarCaudalExterno() {
  const el = $('caudal-ext'), o = EXT && EXT.observado, pr = ((EXT && EXT.pronosticos) || []).filter(p => p.sesgo_verificado === true);
  if (!o && !pr.length) { el.classList.add('oculto'); return; }
  let h = '';
  if (o) { const dias = Math.floor((Date.now() - Date.parse(o.fecha + 'T12:00:00-05:00')) / 864e5);
    h += `<div>${tr('ext_obs', fmtFecha(o.fecha), fmtQ(o.Q), tr('tipo', o.tipo), dias)}<button data-qext="${o.Q}">${tr('ext_ver')}</button></div>`; }
  for (const p of pr)
    h += `<div>${tr('ext_pro', p.fuente, fmtFecha(p.emitido), p.horizonte_dias, fmtQ(p.Q_max), fmtFecha(p.fecha_max), fmtQ(p.Q_bajo), fmtQ(p.Q_alto))}<button data-qext="${p.Q_max}">${tr('ext_esc')}</button></div>`;
  h += `<div class="rango">${tr('ext_nota', o ? o.fuente : '')}</div>`;
  el.innerHTML = h; el.classList.remove('oculto');
  el.querySelectorAll('button[data-qext]').forEach(b => b.onclick = () => fijarQ(Number(b.dataset.qext)));
}

// personas a 1 km o menos (D23): WorldPop de las celdas pintadas y de las que están a ≤ RADIO_CERCA celdas de una celda fuente pintada
function cercaAgua(n) {
  if (ST.Q < M.q_corte) return 0;
  const H = M.malla.H, W = M.malla.W, R = RADIO_CERCA, zona = new Uint8Array(H * W), src = new Uint8Array(H * W), fil = new Uint8Array(H * W);
  for (let i = 0; i < N; i++) if (inund(n, i)) { zona[ID[i]] = 1; if (FUENTE[i]) src[ID[i]] = 1; }
  for (let y = 0; y < H; y++) { const o = y * W; let s = 0;                       // pasada por filas (ventana deslizante de 2R+1)
    for (let x = 0; x < Math.min(W, R + 1); x++) s += src[o + x];
    for (let x = 0; x < W; x++) { fil[o + x] = s > 0 ? 1 : 0; if (x + R + 1 < W) s += src[o + x + R + 1]; if (x - R >= 0) s -= src[o + x - R]; } }
  let tot = 0;
  for (let x = 0; x < W; x++) { let s = 0;                                          // pasada por columnas
    for (let y = 0; y < Math.min(H, R + 1); y++) s += fil[y * W + x];
    for (let y = 0; y < H; y++) { const k = y * W + x; if (s > 0 || zona[k]) tot += POP[k]; if (y + R + 1 < H) s += fil[(y + R + 1) * W + x]; if (y - R >= 0) s -= fil[(y - R) * W + x]; } }
  return tot;
}
function resumen() {
  const n = ST.nivel, r = cuenta('U'), c = cuenta('p'), sin = ST.Q < M.q_corte;
  const central = f => tr('central', fmt(c[f]));
  $('r-ha').textContent = fmt(r.ha); $('r-ha-det').textContent = sin ? tr('sin_desborde') : central('ha');
  $('r-cult').textContent = fmt(r.mnsa); $('r-cult-det').innerHTML = sin ? '' : tr('cult_det', central('mnsa'), fmt(r.wc));
  const cerca = sin ? 0 : cercaAgua(n);
  $('r-hab').textContent = fmt(r.hab); $('r-hab-det').innerHTML = sin ? '' : tr('hab_det', central('hab'), fmt(cerca));
  let n2 = 0, n1 = 0; for (const c of LUG.centros_poblados) { c.estado = estadoCP(c, n); if (c.estado === 2) n2++; else if (c.estado === 1) n1++; }
  $('r-cp').textContent = fmt(n2); $('r-cp-det').innerHTML = sin ? tr('cp_det_sin', LUG.centros_poblados.length) : tr('cp_det', fmt(n1));
  marcadores();
}
function marcadores() {
  const col = ['#c3c9cf', '#f5a623', '#d6322c'];
  grupoCP.eachLayer(m => { const e = m.cp.estado || 0; const ver = e ? $('c-cp').checked : ST.cpTodos;
    m.setStyle({ fillColor: col[e], radius: e === 2 ? 7 : e === 1 ? 5 : 2.5, weight: e ? 1 : 0.3, fillOpacity: ver ? (e ? 0.95 : 0.7) : 0, opacity: ver ? 1 : 0 });
    if (e && ver) m.bringToFront(); });
}
const textoComp = () => ({ emsr: tr('ley_emsr'), crecidas: tr('ley_crec'), fecha: tr('ley_fecha', fmtFecha(ST.pase || '')) }[ST.comp]);
function leyenda() {
  let h = `<div><span class="cj agua"></span> ${tr('ley_puede', fmt(ST.Q))}</div>`;
  if (ST.Q > 2204) h += `<div><span class="cj agua rayas"></span> ${tr('ley_extr')}</div>`;
  if (ST.perm) h += `<div><span class="cj perm"></span> ${tr('ley_perm')}</div>`;
  if (ST.comp !== 'ninguna') h += `<div><span class="cj comp"></span> ${textoComp()}</div><div><span class="cj ambos"></span> ${tr('ley_coinc')}</div>`;
  if ($('c-cp').checked) h += `<div><span class="pt rojo"></span> ${tr('ley_cp2')}</div><div><span class="pt nar"></span> ${tr('ley_cp1')}</div>`;
  if (ST.cpTodos) h += `<div><span class="pt gris"></span> ${tr('ley_cp0')}</div>`;
  $('leyenda').innerHTML = h;
}

// ---------- mapa ----------
function cargarBloque(capaN, nom) {
  const key = capaN + '/' + nom; if (bloques.has(key)) return bloques.get(key);
  const esObs = capaN.startsWith('obs/');
  const existe = esObs ? (!OBS || (OBS[capaN.slice(4)] && OBS[capaN.slice(4)].has(nom))) : IDX.sets[capaN].has(nom);   // versión publicada: sólo los bloques prerenderizados
  const pr = !existe ? Promise.resolve(null) : fetch((esObs ? '' : 'bloques/') + key + '.png').then(async r => {
    if (!r.ok) return null; const bm = await createImageBitmap(await r.blob()); const cv = new OffscreenCanvas(bm.width, bm.height); const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(bm, 0, 0); const d = cx.getImageData(0, 0, bm.width, bm.height).data; const out = new Uint8Array(512 * 512).fill(esObs ? 255 : 0);
    for (let y = 0; y < bm.height; y++) for (let x = 0; x < bm.width; x++) out[y * 512 + x] = d[(y * bm.width + x) * 4]; return out; }).catch(() => null);
  bloques.set(key, pr); return pr;
}
const nomB = (r, c) => `r${String(r >> 9).padStart(2, '0')}c${String(c >> 9).padStart(2, '0')}`;
function capaComp() { return ST.comp === 'emsr' ? 'emsr' : ST.comp === 'crecidas' ? 'crecidas' : ST.comp === 'fecha' && ST.pase ? 'obs/' + ST.pase : null; }
const Capa = L.GridLayer.extend({
  createTile(coords, done) {
    const tile = document.createElement('canvas'); tile.width = tile.height = 256;
    const b = this._tileCoordsToBounds(coords); const esq = [b.getNorthWest(), b.getNorthEast(), b.getSouthWest(), b.getSouthEast()].map(ll => proj4(WGS, UTM, [ll.lng, ll.lat]));
    const m = M.malla, xs = esq.map(e => e[0]), ys = esq.map(e => e[1]);
    const c0 = Math.max(0, Math.floor((Math.min(...xs) - m.x0) / 10)), c1 = Math.min(m.W10 - 1, Math.floor((Math.max(...xs) - m.x0) / 10));
    const r0 = Math.max(0, Math.floor((m.y0 - Math.max(...ys)) / 10)), r1 = Math.min(m.H10 - 1, Math.floor((m.y0 - Math.min(...ys)) / 10));
    if (c0 > c1 || r0 > r1) { setTimeout(() => done(null, tile), 0); return tile; }
    const noms = []; for (let br = r0 >> 9; br <= r1 >> 9; br++) for (let bc = c0 >> 9; bc <= c1 >> 9; bc++) noms.push(`r${String(br).padStart(2, '0')}c${String(bc).padStart(2, '0')}`);
    const capas = ['mascara']; const cc_ = capaComp(); if (cc_) capas.push(cc_);
    const pend = []; for (const cp of capas) for (const n of noms) pend.push(cargarBloque(cp, n).then(a => [cp + '/' + n, a]));
    Promise.all(pend).then(res => { this.pintar(tile, esq, new Map(res), cc_); done(null, tile); }).catch(e => done(e, tile));
    return tile;
  },
  pintar(tile, esq, bl, cc_) {
    const cx = tile.getContext('2d'), img = cx.createImageData(256, 256), d = img.data, m = M.malla, [nw, ne, sw, se] = esq;
    const v = V[ST.nivel], hayQ = ST.Q >= M.q_corte, extr = ST.Q > 2204, esObs = cc_ && cc_.startsWith('obs/');
    const get = (cp, r, c) => { const a = bl.get(cp + '/' + nomB(r, c)); return a ? a[(r & 511) * 512 + (c & 511)] : (cp.startsWith('obs/') ? 255 : 0); };
    for (let py = 0; py < 256; py++) { const fy = (py + .5) / 256;
      for (let px = 0; px < 256; px++) { const fx = (px + .5) / 256;
        const X = (1 - fx) * (1 - fy) * nw[0] + fx * (1 - fy) * ne[0] + (1 - fx) * fy * sw[0] + fx * fy * se[0];
        const Y = (1 - fx) * (1 - fy) * nw[1] + fx * (1 - fy) * ne[1] + (1 - fx) * fy * sw[1] + fx * fy * se[1];
        const c10 = Math.floor((X - m.x0) / 10), r10 = Math.floor((m.y0 - Y) / 10); if (c10 < 0 || r10 < 0 || c10 >= m.W10 || r10 >= m.H10) continue;
        const o = (py * 256 + px) * 4; let col = null;
        const mraw = get('mascara', r10, c10), cauce = mraw >= 80; let mk = mraw % 20; const est = mk >> 2, dom = mk & 3;
        const habitual = est === 1 || est === 2 || cauce; let perm = ST.perm && habitual && dom > 0;
        if (!habitual && dom === 1 && (hayQ || ST.perm)) {
          const gx = (X - m.x0) / 100 - .5, gy = (m.y0 - Y) / 100 - .5, cc = Math.floor(gx), rr = Math.floor(gy), ax = gx - cc, ay = gy - rr;
          let s = 0, s0 = 0, ws = 0, iN = -1, wN = -1;
          for (let dr = 0; dr <= 1; dr++) for (let dc = 0; dc <= 1; dc++) { const R = rr + dr, C = cc + dc; if (R < 0 || C < 0 || R >= m.H || C >= m.W) continue;
            const i = INDEX[R * m.W + C]; if (i < 0) continue; const wg = (dr ? ay : 1 - ay) * (dc ? ax : 1 - ax); s += wg * v[i]; s0 += wg * V0[i]; ws += wg; if (wg > wN) { wN = wg; iN = i; } }
          if (hayQ && ws > 0 && s / ws >= UMBRAL - 1e-7 && iN >= 0 && !BASE_D[iN]) col = (extr && ((px + py) % 8) < 3) ? AZUL_EX : AZUL;
          else if (ST.perm && ws > 0 && s0 / ws >= UMBRAL - 1e-7 && iN >= 0 && RB[iN]) perm = true;
        }
        if (perm && !col) col = PERM;
        if (cc_) {   // comparación: una fuente a la vez, en rojo; morado donde coincide con el azul
          const a = get(cc_, r10, c10); const hit = esObs ? (a !== 255 && a >= 125 && !habitual) : a > 0;
          if (hit) col = (col && col !== PERM) ? MORADO : ROJO;
        }
        if (col) { d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = col[3]; }
      } }
    cx.putImageData(img, 0, 0);
  }
});
const FONDOS = {}; let ctlCapas = null;
function controlCapas() {   // el selector de fondo se rehace al cambiar de idioma
  if (ctlCapas) ctlCapas.remove();
  ctlCapas = L.control.layers({ [tr('mapa')]: FONDOS.osm, [tr('sat')]: FONDOS.sat }, null, { position: 'topright' }).addTo(mapa);
}
function construirMapa() {
  mapa = L.map('mapa', { zoomControl: false, minZoom: 9, maxZoom: 16 }); L.control.zoom({ position: 'topright' }).addTo(mapa);
  FONDOS.osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap', crossOrigin: true }).addTo(mapa);
  FONDOS.sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, attribution: 'Esri', crossOrigin: true });
  capa = new Capa({ tileSize: 256, updateWhenZooming: false, keepBuffer: 1, opacity: 0.92, attribution: 'Sentinel-1 · WorldPop · MIDAGRI · Copernicus EMS' }).addTo(mapa);
  capaRio = L.geoJSON(VEC.rio_lagunas, { style: f => ({ color: '#4a6d96', weight: f.geometry.type.includes('Line') ? 1.6 : 1, fillColor: '#6e8caf', fillOpacity: 0.15 }),
    onEachFeature: (f, l) => { if (f.properties && f.properties.name) l.bindTooltip(f.properties.name, { sticky: true }); } }).addTo(mapa);
  const area = L.geoJSON(VEC.area, { style: { color: '#34495e', weight: 1.2, fill: false, dashArray: '5 4' }, interactive: false }).addTo(mapa);
  capaDist = L.geoJSON(VEC.distritos, { style: { color: '#7f8c8d', weight: 0.8, fill: false }, onEachFeature: (f, l) => l.bindTooltip(() => tr('distrito', f.properties.distrito.toLowerCase().replace(/(^|\s)\S/g, s => s.toUpperCase())), { sticky: true }) });
  grupoCP = L.layerGroup().addTo(mapa);
  for (const c of LUG.centros_poblados) { const mk = L.circleMarker([c.lat, c.lon], { radius: 2.5, color: '#2c3e50', weight: 0.3, fillColor: '#c3c9cf', fillOpacity: 0 }); mk.cp = c;
    mk.bindTooltip(() => `<b>${c.nombre}</b> (${c.distrito})<br>${tr('cp_estado')[c.estado || 0]}`); mk.addTo(grupoCP); }
  controlCapas();
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(mapa);
  mapa.fitBounds(area.getBounds(), { paddingTopLeft: [380, 10] });
  mapa.on('click', clic);
}
async function clic(e) {
  const [X, Y] = proj4(WGS, UTM, [e.latlng.lng, e.latlng.lat]), m = M.malla; const cc = Math.floor((X - m.x0) / 100), rr = Math.floor((m.y0 - Y) / 100);
  if (cc < 0 || rr < 0 || cc >= m.W || rr >= m.H) return; const i = INDEX[rr * m.W + cc]; let h;
  const c10 = Math.floor((X - m.x0) / 10), r10 = Math.floor((m.y0 - Y) / 10);
  if (i >= 0) {
    const pc = x => Math.round(x * 100) + ' %';
    if (BASE_D[i]) h = tr('pop_base');
    else if (ST.Q < M.q_corte) h = tr('sin_desborde') + '.';
    else { h = tr('pop_prob', fmt(ST.Q), pc(V.p[i]), pc(V.L[i]), pc(V.U[i])) +
      (inund('U', i) ? (inund('p', i) ? tr('pop_ambas') : tr('pop_u')) : tr('pop_no')) + (ST.Q > 2204 ? tr('pop_extr') : ''); }
    h += curvaHectarea(i);
  } else h = tr('pop_sinA');
  const cc_ = capaComp();
  if (cc_) { const a = await cargarBloque(cc_, nomB(r10, c10)); const val = a ? a[(r10 & 511) * 512 + (c10 & 511)] : 0;
    const hit = cc_.startsWith('obs/') ? (val !== 255 && val >= 125) : val > 0;
    h += '<br>' + { emsr: hit ? tr('pop_emsr_si', tr('emsr_fechas')[val === 1 ? 0 : val === 2 ? 1 : 2]) : tr('pop_emsr_no'),
      crecidas: hit ? tr('pop_crec_si') : tr('pop_crec_no'),
      fecha: hit ? tr('pop_fecha_si') : tr('pop_fecha_no') }[ST.comp]; }
  L.popup({ maxWidth: 330 }).setLatLng(e.latlng).setContent(h).openOn(mapa);
}

// ---------- panel ----------
function modal(html) { $('m-cuerpo').innerHTML = html; $('modal').classList.remove('oculto'); }
function lista() {
  const g = [[], []]; for (const c of LUG.centros_poblados) if (c.estado) g[2 - c.estado].push(c);
  const fila = c => `<div data-lat="${c.lat}" data-lon="${c.lon}"><b>${c.nombre}</b> · ${c.distrito} · ${tr('lista_hab', fmt(c.hab_500m))}</div>`;
  const nada = `<p class="nota">${tr('ninguno')}</p>`;
  let h = `<h2>${tr('lista_tit', fmt(ST.Q))}</h2><div class="lista-cp">`;
  h += `<h3>${tr('lista_zona', g[0].length)}</h3>` + (g[0].map(fila).join('') || nada);
  h += `<h3>${tr('lista_cerca', g[1].length)}</h3>` + (g[1].map(fila).join('') || nada) + '</div>';
  h += `<p class="nota">${tr('lista_nota')}</p>`;
  modal(h); document.querySelectorAll('.lista-cp div[data-lat]').forEach(d => d.onclick = () => { $('modal').classList.add('oculto'); mapa.setView([+d.dataset.lat, +d.dataset.lon], 14); });
}
function fijarComp(v) {
  ST.comp = v; document.querySelectorAll('input[name=comp]').forEach(r => r.checked = r.value === v);
  const info = { ninguna: '', emsr: tr('info_emsr'), crecidas: tr('info_crecidas') + tr('info_crec_tot', fmt(CRE.total_ha), fmt(CRE.total_hab), fmt(CRE.total_mnsa_ha)),
    fecha: tr('info_fecha') + (NOTA_FECHAS === 'local' ? tr('info_fecha_local') : NOTA_FECHAS ? tr('info_fecha_parcial', NOTA_FECHAS[0], NOTA_FECHAS[1]) : '') }[v];
  $('comp-fecha').classList.toggle('oculto', v !== 'fecha'); $('comp-info').textContent = info;
  leyenda(); capa.redraw();
}
function llenarFechas() {   // opciones de la lista de fechas, en el idioma elegido; conserva la fecha seleccionada
  const sf = $('comp-fecha'), sel = sf.value; sf.innerHTML = '';
  PASES.slice().sort((a, b) => (b.Q ?? -1) - (a.Q ?? -1)).forEach(p => { const o = document.createElement('option'); o.value = p.pase;
    o.textContent = `${fmtFecha(p.fecha)} · ${p.Q == null ? tr('op_sinq') : fmt(p.Q) + ' m³/s'} · ${p.km2_total == null ? '–' : fmt(p.km2_total)} ${tr('op_km2')}`; sf.appendChild(o); });
  if (sel) sf.value = sel;
}
function controles() {
  document.querySelectorAll('.tab').forEach(b => b.onclick = () => { document.querySelectorAll('.tab').forEach(x => x.classList.toggle('activa', x === b));
    document.querySelectorAll('.tab-cuerpo').forEach(s => s.classList.toggle('oculto', s.id !== 'tab-' + b.dataset.tab)); });
  $('q-barra').oninput = e => fijarQ(qDeBarra(+e.target.value), true);
  document.querySelectorAll('.rapidos button').forEach(b => b.onclick = () => fijarQ(+b.dataset.q));
  $('c-perm').onchange = e => { ST.perm = e.target.checked; ST.perm ? capaRio.addTo(mapa) : mapa.removeLayer(capaRio); actualizar(); };
  $('c-cp').onchange = () => { marcadores(); leyenda(); };
  $('c-cp-todos').onchange = e => { ST.cpTodos = e.target.checked; marcadores(); leyenda(); };
  $('c-dist').onchange = e => e.target.checked ? capaDist.addTo(mapa) : mapa.removeLayer(capaDist);
  const sf = $('comp-fecha'); llenarFechas();
  ST.pase = sf.value; sf.onchange = () => { ST.pase = sf.value; leyenda(); capa.redraw(); };
  document.querySelectorAll('input[name=comp]').forEach(r => r.onchange = () => fijarComp(r.value));
  $('b-ver2017').onclick = () => { document.querySelector('.tab[data-tab=comp]').click(); fijarComp('emsr'); };
  $('b-leer').onclick = () => modal($(LANG === 'en' ? 't-leer-en' : 't-leer').innerHTML); $('b-lista').onclick = lista; $('caja-cp').onclick = lista;
  $('m-cerrar').onclick = () => $('modal').classList.add('oculto'); $('modal').onclick = e => { if (e.target.id === 'modal') $('modal').classList.add('oculto'); };
  $('b-img').onclick = async () => { const cv = await captura(); const a = document.createElement('a'); a.download = tr('cap_arch', ST.Q); a.href = cv.toDataURL('image/png'); a.click(); };
}

// ---------- imagen ----------
async function esperarCarga(ms) { const t0 = performance.now(); let c = true; while (c && performance.now() - t0 < (ms || 25000)) { c = false; mapa.eachLayer(l => { if (l instanceof L.GridLayer && l.isLoading()) c = true; }); if (c) await new Promise(r => setTimeout(r, 200)); } await new Promise(r => setTimeout(r, 250)); return !c; }
async function captura() {
  await esperarCarga(); const W = window.innerWidth, H = window.innerHeight, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const cx = cv.getContext('2d');
  cx.fillStyle = '#e8e8e8'; cx.fillRect(0, 0, W, H); const cont = mapa.getContainer(), org = cont.getBoundingClientRect();
  for (const el of cont.querySelectorAll('img.leaflet-tile-loaded, canvas.leaflet-tile')) { const r = el.getBoundingClientRect(); try { cx.drawImage(el, r.left - org.left, r.top - org.top, r.width, r.height); } catch (e) { } }
  const anillos = g => g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : [];
  const traza = (cs, cerrar) => { cx.beginPath(); cs.forEach(([lo, la], j) => { const p = mapa.latLngToContainerPoint([la, lo]); j ? cx.lineTo(p.x, p.y) : cx.moveTo(p.x, p.y); }); if (cerrar) { cx.closePath(); cx.fill(); } cx.stroke(); };
  if (ST.perm) { cx.save(); cx.strokeStyle = '#4a6d96'; cx.fillStyle = 'rgba(110,140,175,.15)';
    for (const f of VEC.rio_lagunas.features) { const g = f.geometry; if (!g) continue;
      if (g.type === 'LineString') { cx.lineWidth = 1.6; traza(g.coordinates, false); } else if (g.type === 'MultiLineString') { cx.lineWidth = 1.6; g.coordinates.forEach(c => traza(c, false)); }
      else { cx.lineWidth = 1; anillos(g).forEach(c => traza(c, true)); } }
    cx.restore(); }
  cx.save(); cx.setLineDash([6, 5]); cx.strokeStyle = '#34495e'; cx.lineWidth = 1.3;
  for (const f of VEC.area.features) for (const an of anillos(f.geometry)) traza(an, false);
  cx.restore();
  const col = ['#c3c9cf', '#f5a623', '#d6322c'];
  for (const e of [0, 1, 2]) for (const c of LUG.centros_poblados) { if ((c.estado || 0) !== e || !(e ? $('c-cp').checked : ST.cpTodos)) continue; const p = mapa.latLngToContainerPoint([c.lat, c.lon]); if (p.x < 0 || p.y < 0 || p.x > W || p.y > H) continue;
    cx.beginPath(); cx.arc(p.x, p.y, e === 2 ? 7 : e === 1 ? 5 : 2.5, 0, 2 * Math.PI); cx.fillStyle = col[e]; cx.fill(); cx.lineWidth = e ? 1 : 0.3; cx.strokeStyle = '#2c3e50'; cx.stroke(); }
  const caja = (x, y, w, h) => { cx.fillStyle = 'rgba(255,255,255,.95)'; cx.beginPath(); cx.roundRect(x, y, w, h, 10); cx.fill(); };
  const s = [[$('r-ha').textContent, tr('nom_ha')], [$('r-cult').textContent, tr('nom_cult')], [$('r-hab').textContent, tr('nom_hab')], [$('r-cp').textContent, tr('nom_cp')]];
  caja(12, 12, 390, 152); cx.fillStyle = '#1d2733'; cx.font = 'bold 18px Segoe UI, Arial'; cx.fillText(tr('titulo'), 26, 40);
  cx.font = '14px Segoe UI, Arial'; cx.fillText(tr('cap_sub', fmt(ST.Q), $('q-alerta').textContent), 26, 62);
  s.forEach(([v, n], j) => { const x = 26 + (j % 2) * 190, y = 96 + Math.floor(j / 2) * 52; cx.fillStyle = '#1565c0'; cx.font = 'bold 22px Segoe UI, Arial'; cx.fillText(v, x, y); cx.fillStyle = '#5b6673'; cx.font = '11px Segoe UI, Arial'; cx.fillText(n, x, y + 15); });
  const items = [['#1565c0', tr('ley_puede', fmt(ST.Q))]];
  if (ST.Q > 2204) items.push(['#78aae6', tr('ley_extr')]); if (ST.perm) items.push(['#6e8caf', tr('ley_perm')]);
  if (ST.comp !== 'ninguna') items.push(['#e53935', textoComp()], ['#7d4f7a', tr('ley_coinc')]);
  if ($('c-cp').checked) items.push(['p#d6322c', tr('ley_cp2')], ['p#f5a623', tr('ley_cp1')]);
  const lx = W - 300, ly = H - 34 - items.length * 21; caja(lx, ly, 288, items.length * 21 + 14); cx.font = '12px Segoe UI, Arial';
  items.forEach(([c, t], j) => { const y = ly + 22 + j * 21; if (c.startsWith('p')) { cx.beginPath(); cx.arc(lx + 20, y - 4, 5, 0, 2 * Math.PI); cx.fillStyle = c.slice(1); cx.fill(); cx.strokeStyle = '#2c3e50'; cx.lineWidth = 1; cx.stroke(); }
    else { cx.fillStyle = c; cx.globalAlpha = .8; cx.fillRect(lx + 12, y - 9, 16, 11); cx.globalAlpha = 1; } cx.fillStyle = '#1d2733'; cx.fillText(t, lx + 36, y); });
  cx.fillStyle = 'rgba(255,255,255,.9)'; cx.fillRect(0, H - 22, W, 22); cx.fillStyle = '#5b6673'; cx.font = '11px Segoe UI, Arial';
  cx.fillText(tr('cap_pie'), 10, H - 7);
  return cv;
}
async function enviarCaptura(nombre) { const cv = await captura(); const b = await new Promise(r => cv.toBlob(r, 'image/png')); return (await fetch('captura/' + nombre + '.png', { method: 'POST', body: b })).status; }

cargar().catch(e => { document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;bottom:0;left:0;background:#fee;padding:6px;z-index:5000">${tr('error', e.message)}</div>`); console.error(e); });
