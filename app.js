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
const COMP_INFO = { ninguna: '', emsr: 'Inundación de los días 26 y 30 de marzo de 2017 cartografiada por el servicio Copernicus con los satélites Radarsat y COSMO-SkyMed, independientes del que usa este mapa. Aquel evento incluyó el desborde en Piura y Castilla del 27 de marzo, roturas de diques el 3 de abril y lluvias intensas.',
  crecidas: 'Píxeles con agua en al menos la mitad de las nueve imágenes con caudal de 700 m³/s o más (seis de 2017, una de 2023 y dos de 2026), fuera de la llanura con estimación: lagunas y depresiones del sur y llanura sin curva. No cambia con el caudal.',
  fecha: 'Agua detectada por el radar Sentinel-1 en la fecha elegida (probabilidad calibrada ≥ 0,5).' };
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
  if (OBS) { for (const k in OBS) OBS[k] = new Set(OBS[k]); const n0 = PASES.length; PASES = PASES.filter(p => OBS[p.pase]); if (PASES.length < n0) COMP_INFO.fecha += ` En esta versión en línea hay ${PASES.length} de las ${n0} fechas.`; }
  else COMP_INFO.fecha += ' Todas las fechas se leen del servidor local del visor.';
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
  const [txt, cls] = q < 100 ? ['Caudal bajo', 'ba'] : q > 2204 ? ['Más de lo observado', 'ex'] : q >= n_.rojo ? ['Alerta roja', 'ro'] : q >= n_.naranja ? ['Alerta naranja', 'na'] : q >= n_.amarillo ? ['Alerta amarilla', 'am'] : ['Sin alerta', ''];
  ch.textContent = txt; ch.className = 'chip ' + cls;
  const av = $('aviso-q');
  if (q < 100) { av.className = 'aviso'; av.textContent = 'Con menos de 100 m³/s el río no desborda. El agua que se ve en esa época es de riego, drenes o lagunas y no se cuenta como inundación.'; }
  else if (q > 2204) { av.className = 'aviso ex'; av.textContent = 'Más de 2 204 m³/s no se ha observado con satélite: el mapa es una extrapolación (rayado) y sus cifras son menos seguras.'; }
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
  s += `<text x="${(ml + W) / 2}" y="${H - 2}" font-size="9" text-anchor="middle" fill="#555">caudal (m³/s)</text>`;
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
  s += `<text x="${ml + 3}" y="${Y(UMBRAL) - 3}" font-size="8" fill="#1565c0">30 %: se pinta si la sombra lo alcanza</text>`;
  if (ST.Q >= 1) s += `<line x1="${X(ST.Q).toFixed(1)}" x2="${X(ST.Q).toFixed(1)}" y1="${mt}" y2="${H - mb}" stroke="#d6322c" stroke-width="1.2"/>`;
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${s}</svg><span class="nota">Línea: probabilidad central · sombra: margen del 90 % · rojo: caudal elegido · rayado: extrapolación.</span>`;
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
  s += `<text x="${ml + 4}" y="${mt + 12}" font-size="9" fill="#1565c0">puede inundarse</text><text x="${ml + 4}" y="${mt + 24}" font-size="9" fill="#1d2733">estimación central</text>`;
  s += `<text x="4" y="${mt + 10}" font-size="9" fill="#555">ha</text>`;
  $('curva-llanura').innerHTML = `<svg viewBox="0 0 ${W} ${H}">${s}</svg>`;
  $('curva-info').textContent = ST.Q < M.q_corte ? `Con ${fmt(ST.Q)} m³/s el río no desborda.` :
    `Con ${fmt(ST.Q)} m³/s pueden inundarse ${$('r-ha').textContent} ha (${$('r-ha-det').textContent} ha).`;
}


// ---------- cifras (sólo llanura con curva) ----------
const umb = n => n === 'U' ? UMBRAL : 0.5, exc = n => n === 'U' ? BASE_D : BASE;
const inund = (n, i) => i >= 0 && ST.Q >= M.q_corte && V[n][i] >= umb(n) - 1e-7 && !exc(n)[i];
function cuenta(n) { const r = { ha: 0, mnsa: 0, wc: 0, hab: 0 }; if (ST.Q < M.q_corte) return r;
  const v = V[n], t = umb(n) - 1e-7, B = exc(n); for (let i = 0; i < N; i++) if (v[i] >= t && !B[i]) { r.ha += ATR[i * 6 + 1] / 100; r.mnsa += ATR[i * 6 + 2] / 100; r.wc += ATR[i * 6 + 3] / 100; r.hab += HAB[i]; } return r; }
function estadoCP(c, n) { if (ST.Q < M.q_corte) return 0; if (inund(n, c.celdaA)) return 2; if (c.celdasA.some(i => inund(n, i))) return 1; return 0; }
// ---------- caudal externo: observado del día y pronósticos (sólo los que tienen el sesgo comprobado frente a Sánchez Cerro) ----------
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];
const fmtFecha = s => { const [a, m, d] = String(s).slice(0, 10).split('-'); return `${+d}-${MESES[+m - 1]}-${a}`; };
const fmtQ = q => q == null || !isFinite(q) ? '–' : q < 10 ? q.toFixed(1).replace('.', ',') : fmt(q);
function mostrarCaudalExterno() {
  const el = $('caudal-ext'), o = EXT && EXT.observado, pr = ((EXT && EXT.pronosticos) || []).filter(p => p.sesgo_verificado === true);
  if (!o && !pr.length) { el.classList.add('oculto'); return; }
  let h = '';
  if (o) { const dias = Math.floor((Date.now() - Date.parse(o.fecha + 'T12:00:00-05:00')) / 864e5);
    h += `<div><b>Caudal observado</b> el ${fmtFecha(o.fecha)}: <b>${fmtQ(o.Q)} m³/s</b> (${o.tipo})${dias > 2 ? ` <span class="rango">· último dato, de hace ${dias} días</span>` : ''}<button data-qext="${o.Q}">ver en el mapa</button></div>`; }
  for (const p of pr)
    h += `<div><b>Pronóstico ${p.fuente}</b> (emitido el ${fmtFecha(p.emitido)}, ${p.horizonte_dias} días): máximo <b>${fmtQ(p.Q_max)} m³/s</b> el ${fmtFecha(p.fecha_max)} <span class="rango">(entre ${fmtQ(p.Q_bajo)} y ${fmtQ(p.Q_alto)})</span><button data-qext="${p.Q_max}">ver escenario</button></div>`;
  h += `<div class="rango">El mapa muestra lo que puede inundarse si ocurre ese caudal; no es un pronóstico de inundación. ${o ? 'Observado: ' + o.fuente + '.' : ''}</div>`;
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
  const central = f => `estimación central: ${fmt(c[f])}`;
  $('r-ha').textContent = fmt(r.ha); $('r-ha-det').textContent = sin ? 'Caudal sin desborde' : central('ha');
  $('r-cult').textContent = fmt(r.mnsa); $('r-cult-det').innerHTML = sin ? '' : `${central('mnsa')}<br>MIDAGRI 2024 · WorldCover: ${fmt(r.wc)} ha`;
  const cerca = sin ? 0 : cercaAgua(n);
  $('r-hab').textContent = fmt(r.hab); $('r-hab-det').innerHTML = sin ? '' : `${central('hab')}<br><b>${fmt(cerca)}</b> viven a 1 km o menos del agua<br>WorldPop 2020`;
  let n2 = 0, n1 = 0; for (const c of LUG.centros_poblados) { c.estado = estadoCP(c, n); if (c.estado === 2) n2++; else if (c.estado === 1) n1++; }
  $('r-cp').textContent = fmt(n2); $('r-cp-det').innerHTML = sin ? `de ${LUG.centros_poblados.length} en la zona de estudio` : `y ${fmt(n1)} más con agua a 1 km o menos · ver lista`;
  marcadores();
}
function marcadores() {
  const col = ['#c3c9cf', '#f5a623', '#d6322c'];
  grupoCP.eachLayer(m => { const e = m.cp.estado || 0; const ver = e ? $('c-cp').checked : ST.cpTodos;
    m.setStyle({ fillColor: col[e], radius: e === 2 ? 7 : e === 1 ? 5 : 2.5, weight: e ? 1 : 0.3, fillOpacity: ver ? (e ? 0.95 : 0.7) : 0, opacity: ver ? 1 : 0 });
    if (e && ver) m.bringToFront(); });
}
function leyenda() {
  let h = `<div><span class="cj agua"></span> puede inundarse con ${fmt(ST.Q)} m³/s</div>`;
  if (ST.Q > 2204) h += '<div><span class="cj agua rayas"></span> estimación extrapolada</div>';
  if (ST.perm) h += '<div><span class="cj perm"></span> río, lagunas y agua permanente</div>';
  if (ST.comp !== 'ninguna') h += `<div><span class="cj comp"></span> ${{ emsr: 'inundación de marzo de 2017 (Copernicus)', crecidas: 'agua vista en crecidas grandes', fecha: 'agua vista el ' + (ST.pase || '').slice(0, 10) }[ST.comp]}</div><div><span class="cj ambos"></span> coinciden</div>`;
  if ($('c-cp').checked) h += '<div><span class="pt rojo"></span> centro poblado con su terreno inundado</div><div><span class="pt nar"></span> con agua a 1 km o menos</div>';
  if (ST.cpTodos) h += '<div><span class="pt gris"></span> sin agua cerca</div>';
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
function construirMapa() {
  mapa = L.map('mapa', { zoomControl: false, minZoom: 9, maxZoom: 16 }); L.control.zoom({ position: 'topright' }).addTo(mapa);
  const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap', crossOrigin: true }).addTo(mapa);
  const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, attribution: 'Esri', crossOrigin: true });
  capa = new Capa({ tileSize: 256, updateWhenZooming: false, keepBuffer: 1, opacity: 0.92, attribution: 'Sentinel-1 · WorldPop · MIDAGRI · Copernicus EMS' }).addTo(mapa);
  capaRio = L.geoJSON(VEC.rio_lagunas, { style: f => ({ color: '#4a6d96', weight: f.geometry.type.includes('Line') ? 1.6 : 1, fillColor: '#6e8caf', fillOpacity: 0.15 }),
    onEachFeature: (f, l) => { if (f.properties && f.properties.name) l.bindTooltip(f.properties.name, { sticky: true }); } }).addTo(mapa);
  const area = L.geoJSON(VEC.area, { style: { color: '#34495e', weight: 1.2, fill: false, dashArray: '5 4' }, interactive: false }).addTo(mapa);
  capaDist = L.geoJSON(VEC.distritos, { style: { color: '#7f8c8d', weight: 0.8, fill: false }, onEachFeature: (f, l) => l.bindTooltip('Distrito de ' + f.properties.distrito.toLowerCase().replace(/(^|\s)\S/g, s => s.toUpperCase()), { sticky: true }) });
  grupoCP = L.layerGroup().addTo(mapa);
  for (const c of LUG.centros_poblados) { const mk = L.circleMarker([c.lat, c.lon], { radius: 2.5, color: '#2c3e50', weight: 0.3, fillColor: '#c3c9cf', fillOpacity: 0 }); mk.cp = c;
    mk.bindTooltip(() => `<b>${c.nombre}</b> (${c.distrito})<br>${['sin agua cerca', 'agua a 1 km o menos', 'su terreno puede inundarse'][c.estado || 0]}`); mk.addTo(grupoCP); }
  L.control.layers({ 'Mapa': osm, 'Satélite': sat }, null, { position: 'topright' }).addTo(mapa);
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
    if (BASE_D[i]) h = 'Aquí hay agua aun con el río bajo (cauce, drenes o agua de temporada); no se cuenta como inundación.';
    else if (ST.Q < M.q_corte) h = 'Caudal sin desborde.';
    else { h = `Con ${fmt(ST.Q)} m³/s, probabilidad de que esta hectárea esté inundada: <b>${pc(V.p[i])}</b> (margen del 90 %: ${pc(V.L[i])} a ${pc(V.U[i])}).<br>` +
      (inund('U', i) ? (inund('p', i) ? '<b>Puede inundarse</b>; también en la estimación central.' : '<b>Puede inundarse</b>: el margen alto llega al 30 %.') : 'Fuera de la zona que puede inundarse: ni el margen alto llega al 30 %.') + (ST.Q > 2204 ? '<br>(extrapolación)' : ''); }
    h += curvaHectarea(i);
  } else h = 'Zona sin estimación por caudal (lagunas y depresiones del sur o llanura sin curva). Lo que el satélite vio aquí en las crecidas grandes está en la pestaña «Comparar».';
  const cc_ = capaComp();
  if (cc_) { const a = await cargarBloque(cc_, nomB(r10, c10)); const val = a ? a[(r10 & 511) * 512 + (c10 & 511)] : 0;
    const hit = cc_.startsWith('obs/') ? (val !== 255 && val >= 125) : val > 0;
    h += '<br>' + { emsr: hit ? `Copernicus la marcó inundada en marzo de 2017 (${val === 1 ? '26-mar' : val === 2 ? '30-mar' : '26 y 30-mar'}).` : 'Copernicus no la marcó inundada en 2017.',
      crecidas: hit ? 'El satélite vio agua aquí en las crecidas grandes.' : 'El satélite no vio agua aquí en las crecidas grandes.',
      fecha: hit ? 'Con agua en la fecha elegida.' : 'Sin agua en la fecha elegida.' }[ST.comp]; }
  L.popup({ maxWidth: 330 }).setLatLng(e.latlng).setContent(h).openOn(mapa);
}

// ---------- panel ----------
function modal(html) { $('m-cuerpo').innerHTML = html; $('modal').classList.remove('oculto'); }
function lista() {
  const g = [[], []]; for (const c of LUG.centros_poblados) if (c.estado) g[2 - c.estado].push(c);
  const fila = c => `<div data-lat="${c.lat}" data-lon="${c.lon}"><b>${c.nombre}</b> · ${c.distrito} · ${fmt(c.hab_500m)} hab. en 500 m a la redonda</div>`;
  let h = `<h2>Centros poblados con ${fmt(ST.Q)} m³/s</h2><div class="lista-cp">`;
  h += `<h3>Con su terreno en la zona que puede inundarse (${g[0].length})</h3>` + (g[0].map(fila).join('') || '<p class="nota">Ninguno.</p>');
  h += `<h3>Con agua a 1 km o menos (${g[1].length})</h3>` + (g[1].map(fila).join('') || '<p class="nota">Ninguno.</p>') + '</div>';
  h += '<p class="nota">Se evalúa la llanura con estimación por caudal. El radar no ve el agua dentro de las ciudades; por eso cada pueblo se evalúa por su hectárea y su entorno. Toque un nombre para ir al lugar.</p>';
  modal(h); document.querySelectorAll('.lista-cp div[data-lat]').forEach(d => d.onclick = () => { $('modal').classList.add('oculto'); mapa.setView([+d.dataset.lat, +d.dataset.lon], 14); });
}
function fijarComp(v) {
  ST.comp = v; document.querySelectorAll('input[name=comp]').forEach(r => r.checked = r.value === v);
  $('comp-fecha').classList.toggle('oculto', v !== 'fecha'); $('comp-info').textContent = COMP_INFO[v] + (v === 'crecidas' ? ` En total ${fmt(CRE.total_ha)} ha, con ${fmt(CRE.total_hab)} personas y ${fmt(CRE.total_mnsa_ha)} ha de cultivo MIDAGRI; no entran en las cifras del caudal.` : '');
  leyenda(); capa.redraw();
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
  const sf = $('comp-fecha'); PASES.slice().sort((a, b) => (b.Q ?? -1) - (a.Q ?? -1)).forEach(p => { const o = document.createElement('option'); o.value = p.pase; o.textContent = `${p.fecha} · ${p.Q == null ? 'sin caudal' : fmt(p.Q) + ' m³/s'} · ${p.km2_total == null ? '–' : fmt(p.km2_total)} km² de agua`; sf.appendChild(o); });
  ST.pase = sf.value; sf.onchange = () => { ST.pase = sf.value; leyenda(); capa.redraw(); };
  document.querySelectorAll('input[name=comp]').forEach(r => r.onchange = () => fijarComp(r.value));
  $('b-ver2017').onclick = () => { document.querySelector('.tab[data-tab=comp]').click(); fijarComp('emsr'); };
  $('b-leer').onclick = () => modal($('t-leer').innerHTML); $('b-lista').onclick = lista; $('caja-cp').onclick = lista;
  $('m-cerrar').onclick = () => $('modal').classList.add('oculto'); $('modal').onclick = e => { if (e.target.id === 'modal') $('modal').classList.add('oculto'); };
  $('b-img').onclick = async () => { const cv = await captura(); const a = document.createElement('a'); a.download = `inundacion_piura_${ST.Q}m3s.png`; a.href = cv.toDataURL('image/png'); a.click(); };
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
  const s = [[$('r-ha').textContent, 'hectáreas de la llanura'], [$('r-cult').textContent, 'hectáreas de cultivo'], [$('r-hab').textContent, 'personas'], [$('r-cp').textContent, 'centros poblados con su terreno en la zona']];
  caja(12, 12, 390, 152); cx.fillStyle = '#1d2733'; cx.font = 'bold 18px Segoe UI, Arial'; cx.fillText('Inundaciones del Bajo Piura', 26, 40);
  cx.font = '14px Segoe UI, Arial'; cx.fillText(`Caudal ${fmt(ST.Q)} m³/s · ${$('q-alerta').textContent} · lo que puede inundarse`, 26, 62);
  s.forEach(([v, n], j) => { const x = 26 + (j % 2) * 190, y = 96 + Math.floor(j / 2) * 52; cx.fillStyle = '#1565c0'; cx.font = 'bold 22px Segoe UI, Arial'; cx.fillText(v, x, y); cx.fillStyle = '#5b6673'; cx.font = '11px Segoe UI, Arial'; cx.fillText(n, x, y + 15); });
  const items = [['#1565c0', `puede inundarse con ${fmt(ST.Q)} m³/s`]];
  if (ST.Q > 2204) items.push(['#78aae6', 'estimación extrapolada']); if (ST.perm) items.push(['#6e8caf', 'río, lagunas y agua permanente']);
  if (ST.comp !== 'ninguna') items.push(['#e53935', { emsr: 'inundación de marzo de 2017 (Copernicus)', crecidas: 'agua vista en crecidas grandes', fecha: 'agua vista el ' + (ST.pase || '').slice(0, 10) }[ST.comp]], ['#7d4f7a', 'coinciden']);
  if ($('c-cp').checked) items.push(['p#d6322c', 'centro poblado con su terreno inundado'], ['p#f5a623', 'con agua a 1 km o menos']);
  const lx = W - 300, ly = H - 34 - items.length * 21; caja(lx, ly, 288, items.length * 21 + 14); cx.font = '12px Segoe UI, Arial';
  items.forEach(([c, t], j) => { const y = ly + 22 + j * 21; if (c.startsWith('p')) { cx.beginPath(); cx.arc(lx + 20, y - 4, 5, 0, 2 * Math.PI); cx.fillStyle = c.slice(1); cx.fill(); cx.strokeStyle = '#2c3e50'; cx.lineWidth = 1; cx.stroke(); }
    else { cx.fillStyle = c; cx.globalAlpha = .8; cx.fillRect(lx + 12, y - 9, 16, 11); cx.globalAlpha = 1; } cx.fillStyle = '#1d2733'; cx.fillText(t, lx + 36, y); });
  cx.fillStyle = 'rgba(255,255,255,.9)'; cx.fillRect(0, H - 22, W, 22); cx.fillStyle = '#5b6673'; cx.font = '11px Segoe UI, Arial';
  cx.fillText('Producto de investigación, no oficial · Sentinel-1 2017–2026 · WorldPop 2020 · MIDAGRI 2024 · Copernicus EMS (EMSR199) · © OpenStreetMap', 10, H - 7);
  return cv;
}
async function enviarCaptura(nombre) { const cv = await captura(); const b = await new Promise(r => cv.toBlob(r, 'image/png')); return (await fetch('captura/' + nombre + '.png', { method: 'POST', body: b })).status; }

cargar().catch(e => { document.body.insertAdjacentHTML('beforeend', `<div style="position:fixed;bottom:0;left:0;background:#fee;padding:6px;z-index:5000">Error al cargar: ${e.message}</div>`); console.error(e); });
