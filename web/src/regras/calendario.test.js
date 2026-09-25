// Testes do calendário: grade do mês, navegação e o que se digita no campo.
import { describe, expect, it } from 'vitest';
import {
  anosDaPagina,
  dataPorExtenso,
  dentroDoLimite,
  diaDaSemana,
  fimDaSemana,
  inicioDaSemana,
  lerDataDigitada,
  limitar,
  mascararData,
  mesForaDoLimite,
  nomeDoMes,
  partesDe,
  semanasDoMes,
  somarDias,
  somarMeses,
} from './calendario';

describe('grade do mês', () => {
  it('tem sempre seis semanas de domingo a sábado', () => {
    const semanas = semanasDoMes(2026, 9);

    expect(semanas).toHaveLength(6);
    expect(semanas.every((semana) => semana.length === 7)).toBe(true);
    // 1º de setembro de 2026 é uma terça: a grade começa no domingo, 30 de agosto.
    expect(semanas[0][0]).toEqual({ iso: '2026-08-30', dia: 30, doMes: false });
    expect(semanas[0][2]).toEqual({ iso: '2026-09-01', dia: 1, doMes: true });
    expect(semanas[5][6]).toEqual({ iso: '2026-10-10', dia: 10, doMes: false });
  });

  it('atravessa o ano e o fevereiro bissexto', () => {
    expect(semanasDoMes(2028, 2).flat().filter((dia) => dia.doMes)).toHaveLength(29);
    expect(semanasDoMes(2027, 1)[0][0].iso).toBe('2026-12-27');
  });
});

describe('navegação', () => {
  it('soma dias atravessando mês e ano', () => {
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('soma meses e fica no último dia quando o dia não existe', () => {
    expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(somarMeses('2028-03-31', -1)).toBe('2028-02-29');
    expect(somarMeses('2026-09-15', -12)).toBe('2025-09-15');
    expect(somarMeses('2026-01-10', -1)).toBe('2025-12-10');
  });

  it('acha o começo e o fim da semana', () => {
    expect(diaDaSemana('2026-09-24')).toBe(4);
    expect(inicioDaSemana('2026-09-24')).toBe('2026-09-20');
    expect(fimDaSemana('2026-09-24')).toBe('2026-09-26');
  });

  it('pagina os anos de doze em doze', () => {
    expect(anosDaPagina(2026)).toEqual([2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027]);
    expect(anosDaPagina(1990)[0]).toBe(1980);
  });
});

describe('limites', () => {
  it('confere e prende a data entre min e max', () => {
    expect(dentroDoLimite('2026-09-24', '1900-01-01', '2026-09-24')).toBe(true);
    expect(dentroDoLimite('2026-09-25', undefined, '2026-09-24')).toBe(false);
    expect(limitar('2030-01-01', '1900-01-01', '2026-09-24')).toBe('2026-09-24');
    expect(limitar('1800-01-01', '1900-01-01')).toBe('1900-01-01');
  });

  it('desliga o mês inteiro fora do limite', () => {
    expect(mesForaDoLimite(2026, 10, undefined, '2026-09-24')).toBe(true);
    expect(mesForaDoLimite(2026, 9, undefined, '2026-09-24')).toBe(false);
    expect(mesForaDoLimite(1899, 12, '1900-01-01')).toBe(true);
  });
});

describe('campo de data', () => {
  it('põe as barras enquanto a pessoa digita só números', () => {
    expect(mascararData('0')).toBe('0');
    expect(mascararData('0509')).toBe('05/09');
    expect(mascararData('05092026')).toBe('05/09/2026');
    expect(mascararData('050920261')).toBe('05/09/2026');
    expect(mascararData('ab05-09')).toBe('05/09');
  });

  it('respeita as barras digitadas', () => {
    expect(mascararData('5/')).toBe('5/');
    expect(mascararData('5/9/2026')).toBe('5/9/2026');
    expect(mascararData('123/456/78901')).toBe('12/45/7890');
  });

  it('lê a data completa e recusa a incompleta ou inexistente', () => {
    expect(lerDataDigitada('05/09/2026')).toBe('2026-09-05');
    expect(lerDataDigitada(' 5/9/2026 ')).toBe('2026-09-05');
    expect(lerDataDigitada('31/02/2026')).toBeNull();
    expect(lerDataDigitada('05/09/26')).toBeNull();
    expect(lerDataDigitada('')).toBeNull();
  });

  it('escreve a data e o mês por extenso', () => {
    expect(dataPorExtenso('2026-09-05')).toBe('sábado, 5 de setembro de 2026');
    expect(nomeDoMes({ ano: 2026, mes: 3 })).toBe('março de 2026');
    expect(partesDe('2026-02-30')).toBeNull();
  });
});
