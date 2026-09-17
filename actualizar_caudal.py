# -*- coding: utf-8 -*-
"""Actualiza datos/caudal_externo.json con el último caudal medio diario de la estación Puente Sánchez Cerro publicado por el
Observatorio del Agua de la ANA (SNIRH). Lo corre a diario la tarea programada de GitHub (.github/workflows/caudal.yml).
El visor consulta además el SNIRH desde el navegador; este archivo es el respaldo que muestra cuando esa consulta falla.
Conserva los pronósticos que ya tenga el archivo. Si el servicio no responde, no cambia nada."""
import json, re, sys, time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
import requests

ARCHIVO = Path(__file__).resolve().parent / "datos" / "caudal_externo.json"
URL = "https://snirh.ana.gob.pe/visorPorCuenca/Principal.asmx/CaudalSerie"
ESTACION, OPERADOR = 1212, 63          # Puente Sánchez Cerro (201201), Proyecto Especial Chira Piura
CAB = {"Content-Type": "application/json; charset=UTF-8", "User-Agent": "Mozilla/5.0 (visor Bajo Piura; uso academico)"}


def ultimo():
    for intento in range(3):
        try:
            r = requests.post(URL, data=json.dumps({"pIdEstacion": ESTACION, "pIdOperador": OPERADOR}), headers=CAB, timeout=90)
            r.raise_for_status()
            leer = lambda s: json.loads(re.sub(r'"data":\s*}', '"data":[]}', s))   # el servicio devuelve `"data":}` en un año vacío
            d = leer(r.text)["d"]; d = leer(d) if isinstance(d, str) else d
            break
        except Exception as e:
            print("intento", intento + 1, "falló:", repr(e)[:150]); time.sleep(30)
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


def main():
    u = ultimo()
    if u is None:
        print("sin respuesta del SNIRH; el archivo no cambia"); return 0
    previo = json.loads(ARCHIVO.read_text(encoding="utf-8")) if ARCHIVO.exists() else {}
    obs = {"fuente": "ANA, SNIRH, estación Puente Sánchez Cerro", "fecha": u[0].isoformat(), "Q": round(u[1], 2), "tipo": "medio diario",
           "modo": "servicio web del SNIRH (actualización diaria automática)"}
    if previo.get("observado", {}).get("fecha") == obs["fecha"] and previo["observado"].get("Q") == obs["Q"]:
        print("sin dato nuevo:", obs["fecha"]); return 0
    salida = {"generado": datetime.now(timezone(timedelta(hours=-5))).strftime("%Y-%m-%dT%H:%M"), "observado": obs,
              "pronosticos": previo.get("pronosticos", [])}
    ARCHIVO.write_text(json.dumps(salida, ensure_ascii=False, indent=1), encoding="utf-8")
    print("actualizado:", obs)
    return 0


if __name__ == "__main__":
    sys.exit(main())
