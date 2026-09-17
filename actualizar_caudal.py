# -*- coding: utf-8 -*-
"""Actualiza datos/caudal_externo.json, el respaldo del bloque de caudal del visor. Lo corre a diario la tarea programada de GitHub
(.github/workflows/caudal.yml). El visor consulta además las dos fuentes desde el navegador y sólo usa este archivo si esa consulta falla.
  - Observado: último caudal medio diario de Puente Sánchez Cerro en el Observatorio del Agua de la ANA (SNIRH). Si no responde (no
    responde a los servidores de GitHub desde el 17-sep-2026), se conserva el anterior.
  - Pronóstico GloFAS v4 a 30 días (Open-Meteo), con la misma corrección de cuantiles y el mismo desfase que se probaron en 2014–2026
    (datos/glofas_correccion.json, de glofas_sesgo.py). Si no responde, se conserva el anterior.
Sólo escribe si algo cambió."""
import json, re, sys, time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
import requests

AQUI = Path(__file__).resolve().parent
ARCHIVO = AQUI / "datos" / "caudal_externo.json"
CORR = AQUI / "datos" / "glofas_correccion.json"
URL = "https://snirh.ana.gob.pe/visorPorCuenca/Principal.asmx/CaudalSerie"
OM = "https://flood-api.open-meteo.com/v1/flood"
VARS = ("river_discharge_median", "river_discharge_p25", "river_discharge_p75", "river_discharge_min", "river_discharge_max")
ESTACION, OPERADOR = 1212, 63          # Puente Sánchez Cerro (201201), Proyecto Especial Chira Piura
CAB = {"Content-Type": "application/json; charset=UTF-8", "User-Agent": "Mozilla/5.0 (visor Bajo Piura; uso academico)"}
LIMA = timezone(timedelta(hours=-5))


def ultimo():
    for intento in range(3):
        try:
            r = requests.post(URL, data=json.dumps({"pIdEstacion": ESTACION, "pIdOperador": OPERADOR}), headers=CAB, timeout=25)
            r.raise_for_status()
            leer = lambda s: json.loads(re.sub(r'"data":\s*}', '"data":[]}', s))   # el servicio devuelve `"data":}` en un año vacío
            d = leer(r.text)["d"]; d = leer(d) if isinstance(d, str) else d
            break
        except Exception as e:
            print("intento", intento + 1, "falló:", repr(e)[:150]); time.sleep(10)
    else:
        return None
    cfg = d[0] if isinstance(d, list) else d
    mejor = None
    for s in cfg["series"]:
        m = re.match(r"^(\d{4})-(\d{4})$", str(s.get("name", "")))
        if not m:
            continue
        for i, v in enumerate(s["data"]):
            if v is not None:
                f = date(int(m.group(1)), 9, 1) + timedelta(days=i)
                if mejor is None or f > mejor[0]:
                    mejor = (f, float(v))
    return mejor


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


def glofas():
    if not CORR.exists():
        print("sin tabla de corrección de GloFAS"); return None
    c = json.loads(CORR.read_text(encoding="utf-8"))
    try:
        r = requests.get(OM, params={"latitude": c["celda"][0], "longitude": c["celda"][1], "cell_selection": "nearest", "models": "seamless_v4",
                                     "forecast_days": 30, "daily": ",".join(VARS)}, headers={"User-Agent": CAB["User-Agent"]}, timeout=60)
        r.raise_for_status(); d = r.json()["daily"]
    except Exception as e:
        print("GloFAS (Open-Meteo) no respondió:", repr(e)[:150]); return None
    hoy = datetime.now(LIMA).date(); serie = []
    for i, f in enumerate(d["time"]):
        g = date.fromisoformat(f) + timedelta(days=c["desfase_dias"])      # mismo desfase que en la prueba
        if g < hoy:
            continue
        e = {"f": g.isoformat()}
        for k, v in zip(("med", "p25", "p75", "min", "max"), VARS):
            x = d[v][i]; e[k] = None if x is None else round(interp(x, c["qg"], c["qo"]), 1)
        if e["med"] is not None:
            serie.append(e)
    if not serie:
        return None
    return {"clave": "glofas", "fuente": "GloFAS v4 (Copernicus CEMS) vía Open-Meteo, corregido con 2014–2020", "consultado": hoy.isoformat(), "serie": serie}


def main():
    previo = json.loads(ARCHIVO.read_text(encoding="utf-8")) if ARCHIVO.exists() else {}
    obs = previo.get("observado")
    u = ultimo()
    if u is None:
        print("sin respuesta del SNIRH; el observado no cambia")
    else:
        obs = {"fuente": "ANA, SNIRH, estación Puente Sánchez Cerro", "fecha": u[0].isoformat(), "Q": round(u[1], 2), "tipo": "medio diario",
               "modo": "servicio web del SNIRH (actualización diaria automática)"}
    pron_previos = previo.get("pronosticos", [])
    pg = glofas()
    pron = [p for p in pron_previos if p.get("clave") != "glofas"] + ([pg] if pg else [p for p in pron_previos if p.get("clave") == "glofas"])
    if obs == previo.get("observado") and pron == pron_previos:
        print("sin cambios"); return 0
    salida = {"generado": datetime.now(LIMA).strftime("%Y-%m-%dT%H:%M"), "observado": obs, "pronosticos": pron}
    ARCHIVO.write_text(json.dumps(salida, ensure_ascii=False, indent=1), encoding="utf-8")
    print("actualizado:", obs, "| GloFAS:", f"{len(pg['serie'])} días, máximo de la mediana {max(e['med'] for e in pg['serie'])}" if pg else "sin cambio")
    return 0


if __name__ == "__main__":
    sys.exit(main())
