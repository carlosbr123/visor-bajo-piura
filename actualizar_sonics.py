# -*- coding: utf-8 -*-
"""Baja el pronóstico a 10 días de SONICS (SENAMHI) para el tramo de Puente Sánchez Cerro y lo deja listo para el visor
(17-sep-2026). Lo corre a diario la tarea programada de GitHub, junto con `actualizar_caudal.py`.

El Hidrovisor SONICS es una aplicación Shiny y no publica un archivo en una dirección fija: hay que abrirlo con un navegador
automático (Playwright), elegir el tramo con su propio buscador y pulsar el botón de descarga. Por eso este guion puede fallar si
SENAMHI cambia su página o no responde; en ese caso no cambia nada y termina bien.

Qué escribe, si hay pronóstico nuevo:
  - `datos/caudal_externo.json`: la entrada `{"clave": "sonics", …}` con la media de los cinco modelos y su rango, corregida con
    `datos/sonics_correccion.json` (mapeo de cuantiles ajustado en 2014–2020) y con el mismo desfase de la prueba.
  - `datos/sonics_archivo.json`: una línea por día con el pronóstico emitido, sin corregir. SENAMHI no publica sus pronósticos
    pasados, así que este archivo es el que permitirá medir su destreza real más adelante."""
import json, sys, tempfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
import pandas as pd

AQUI = Path(__file__).resolve().parent
ARCHIVO = AQUI / "datos" / "caudal_externo.json"
CORR = AQUI / "datos" / "sonics_correccion.json"
HIST = AQUI / "datos" / "sonics_archivo.json"
URL = "https://www.senamhi.gob.pe/sonics/"
COMID = "9043566"
MODELOS = ["ETA_eqm_m3s", "ETA_scal_m3s", "GFS_m3s", "WRF_m3s", "ECMWF_m3s"]
LIMA = timezone(timedelta(hours=-5))
ESPERA = 120_000


def interp(x, xp, fp):
    """Como np.interp: lineal entre cuantiles y, fuera del rango ajustado, el extremo."""
    if x <= xp[0]:
        return fp[0]
    if x >= xp[-1]:
        return fp[-1]
    lo, hi = 0, len(xp) - 1
    while hi - lo > 1:
        m = (lo + hi) // 2
        lo, hi = (m, hi) if xp[m] <= x else (lo, m)
    return fp[lo] + (x - xp[lo]) / (xp[hi] - xp[lo]) * (fp[hi] - fp[lo])


def bajar():
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        try:
            nav = pw.chromium.launch(headless=True)             # en GitHub, el Chromium que instala Playwright
        except Exception:
            nav = pw.chromium.launch(channel="chrome", headless=True)   # en la PC del autor, el Chrome ya instalado
        try:
            pag = nav.new_page(accept_downloads=True)
            pag.goto(URL, timeout=ESPERA, wait_until="domcontentloaded")
            pag.wait_for_function("() => typeof Shiny !== 'undefined' && Shiny.shinyapp && Shiny.shinyapp.$socket", timeout=ESPERA)
            pag.wait_for_selector("#comid-search-input", timeout=ESPERA)
            pag.evaluate("c => { const i = document.getElementById('comid-search-input'); i.value = c; "
                         "Shiny.setInputValue('search_comid', c, {priority: 'event'}); }", COMID)
            pag.wait_for_function("c => (document.body.innerText.match(/COMID\\s+(\\d+)/) || [])[1] === c", arg=COMID, timeout=ESPERA)
            with pag.expect_download(timeout=ESPERA) as espera:
                pag.evaluate("() => document.getElementById('downData_frst').click()")
            d = espera.value
            f = Path(tempfile.gettempdir()) / f"sonics_{COMID}.xlsx"
            d.save_as(str(f))
            return pd.read_excel(f)
        finally:
            nav.close()


def main():
    if not CORR.exists():
        print("sin tabla de corrección de SONICS; no se hace nada"); return 0
    c = json.loads(CORR.read_text(encoding="utf-8"))
    try:
        x = bajar()
    except Exception as e:
        print("SONICS no respondió:", repr(e)[:200]); return 0
    hoy = datetime.now(LIMA).date()
    crudo, serie = [], []
    for _, r in x.iterrows():
        f = pd.to_datetime(r["FECHA"]).date() + timedelta(days=c["desfase_dias"])       # mismo desfase que en la prueba
        ms = [float(r[m]) for m in MODELOS if pd.notna(r.get(m))]
        if not ms or pd.isna(r.get("MEAN_m3s")):
            continue
        crudo.append({"f": f.isoformat(), "media": round(float(r["MEAN_m3s"]), 2), "modelos": [round(v, 2) for v in ms]})
        if f < hoy:
            continue
        cor = lambda v: round(interp(v, c["qg"], c["qo"]), 1)
        serie.append({"f": f.isoformat(), "med": cor(float(r["MEAN_m3s"])), "min": cor(min(ms)), "max": cor(max(ms))})
    if not serie:
        print("el pronóstico bajado no trae días futuros; no se cambia nada"); return 0
    pron_sonics = {"clave": "sonics", "fuente": "SENAMHI, SONICS, tramo COMID " + COMID + ", corregido con 2014–2020",
                   "consultado": hoy.isoformat(), "serie": serie}
    previo = json.loads(ARCHIVO.read_text(encoding="utf-8")) if ARCHIVO.exists() else {}
    otros = [p for p in previo.get("pronosticos", []) if p.get("clave") != "sonics"]
    salida = {"generado": datetime.now(LIMA).strftime("%Y-%m-%dT%H:%M"), "observado": previo.get("observado"),
              "pronosticos": otros + [pron_sonics]}
    if salida["pronosticos"] == previo.get("pronosticos") :
        print("el pronóstico de SONICS no cambió"); return 0
    ARCHIVO.write_text(json.dumps(salida, ensure_ascii=False, indent=1), encoding="utf-8")
    arch = json.loads(HIST.read_text(encoding="utf-8")) if HIST.exists() else {}
    arch[hoy.isoformat()] = crudo                                                        # archivo de pronósticos pasados, sin corregir
    HIST.write_text(json.dumps(arch, ensure_ascii=False), encoding="utf-8")
    print(f"SONICS: {len(serie)} días; máximo corregido {max(e['med'] for e in serie)} m³/s; archivo con {len(arch)} emisiones")
    return 0


if __name__ == "__main__":
    sys.exit(main())
