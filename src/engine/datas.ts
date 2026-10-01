// ============================================================
// DATAS — sempre no fuso de quem está usando (São Paulo)
//
// new Date().toISOString().slice(0, 10) devolve a data em UTC: em São
// Paulo, das 21h à meia-noite, "hoje" já virava AMANHÃ — exatamente a
// hora em que a cozinha começa a produção da madrugada. Toda conta de
// "que dia é" passa por aqui.
// ============================================================

/** Data ISO (AAAA-MM-DD) de uma Date, no fuso local. */
export function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Hoje + offset dias, no fuso local. */
export function diaLocal(offset = 0, base: Date = new Date()): string {
  return isoLocal(new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset))
}

export function hojeLocal(): string {
  return diaLocal(0)
}
