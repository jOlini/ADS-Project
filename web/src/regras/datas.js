// Datas trafegam como texto ISO "AAAA-MM-DD": é o valor do <input type="date">,
// é o que fica gravado no Firestore e não sofre com fuso horário.

const FORMATO_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

// "2000-05-10" -> "10/05/2000". Valor fora do formato vira texto vazio.
export function formatarData(iso) {
  const partes = FORMATO_ISO.exec(iso ?? '');
  if (!partes) {
    return '';
  }
  const [, ano, mes, dia] = partes;
  return `${dia}/${mes}/${ano}`;
}

// Confere se a data existe de verdade: "2023-02-30" casa com o formato,
// mas não é um dia do calendário.
export function dataExiste(iso) {
  const partes = FORMATO_ISO.exec(iso ?? '');
  if (!partes) {
    return false;
  }
  const [, ano, mes, dia] = partes.map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

// Data local de hoje em ISO. Recebe a data como parâmetro para os testes
// poderem fixar o "hoje".
export function hojeIso(agora = new Date()) {
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${agora.getFullYear()}-${mes}-${dia}`;
}
