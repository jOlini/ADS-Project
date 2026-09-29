// Testes das metas: cálculo do progresso, fases, plano mensal, validação e o
// limite do aporte (a meta não passa de 100%).
import { describe, expect, it } from 'vitest';
import {
  aportesRapidos,
  comAporte,
  concluida,
  faseDaMeta,
  faseDoValor,
  faltaParaOAlvo,
  guardado,
  novaMeta,
  planoMensal,
  porcentagem,
  prazoValido,
  proximaFase,
  resumoDasMetas,
  semAporte,
  sementeDaMeta,
  sequenciaDeSemanas,
  validarAporte,
  validarMeta,
  type Meta,
} from './metas';

const HOJE = '2026-09-26'; // um sábado

function meta(alvo: number, ...valores: number[]): Meta {
  return {
    id: 'm1',
    nome: 'Viagem',
    alvo,
    prazo: null,
    criadaEm: '2026-01-01',
    aportes: valores.map((valor, indice) => ({ id: `a${indice}`, valor, data: HOJE })),
  };
}

describe('guardado e progresso', () => {
  it('soma os aportes', () => {
    expect(guardado(meta(100000, 20000, 5000))).toBe(25000);
    expect(porcentagem(meta(100000, 20000, 5000))).toBe(25);
  });

  it('passar do alvo conta como completa, sem passar de 100%', () => {
    const cheia = meta(10000, 12000);
    expect(concluida(cheia)).toBe(true);
    expect(porcentagem(cheia)).toBe(100);
    expect(faltaParaOAlvo(cheia)).toBe(0);
  });
});

describe('fases da árvore', () => {
  it('começa como semente, sem aporte', () => {
    expect(faseDaMeta(meta(100000)).id).toBe('semente');
  });

  it('qualquer primeiro aporte vira broto', () => {
    expect(faseDaMeta(meta(100000, 1)).id).toBe('broto');
  });

  it('segue as frações do alvo', () => {
    expect(faseDaMeta(meta(100000, 20000)).id).toBe('muda');
    expect(faseDaMeta(meta(100000, 44999)).id).toBe('muda');
    expect(faseDaMeta(meta(100000, 45000)).id).toBe('arvoreta');
    expect(faseDaMeta(meta(100000, 75000)).id).toBe('arvore');
    expect(faseDaMeta(meta(100000, 100000)).id).toBe('frutos');
  });

  it('diz quanto falta para a próxima fase', () => {
    expect(proximaFase(meta(100000, 30000))).toEqual({ fase: expect.objectContaining({ id: 'arvoreta' }), faltam: 15000 });
    expect(proximaFase(meta(100000))?.fase.id).toBe('broto');
    expect(proximaFase(meta(100000, 100000))).toBeNull();
  });
});

describe('sequenciaDeSemanas', () => {
  const aporte = (data: string) => ({ id: data, valor: 100, data });

  it('conta semanas seguidas até esta', () => {
    // Semanas de 21/09, 14/09 e 07/09 (segunda a domingo).
    const aportes = [aporte('2026-09-22'), aporte('2026-09-15'), aporte('2026-09-07')];
    expect(sequenciaDeSemanas(aportes, HOJE)).toBe(3);
  });

  it('continua viva enquanto a semana atual não acabou', () => {
    expect(sequenciaDeSemanas([aporte('2026-09-18'), aporte('2026-09-10')], HOJE)).toBe(2);
  });

  it('zera quando uma semana ficou sem aporte', () => {
    expect(sequenciaDeSemanas([aporte('2026-09-24'), aporte('2026-09-02')], HOJE)).toBe(1);
    expect(sequenciaDeSemanas([], HOJE)).toBe(0);
  });
});

describe('planoMensal', () => {
  it('divide o que falta pelos meses até o prazo, contando o do prazo', () => {
    const comPrazo = { ...meta(120000, 20000), prazo: '2026-12-15' };
    expect(planoMensal(comPrazo, HOJE)).toEqual({ meses: 4, porMes: 25000 });
  });

  it('sem prazo, vencida ou completa, não há plano', () => {
    expect(planoMensal(meta(120000), HOJE)).toBeNull();
    expect(planoMensal({ ...meta(120000), prazo: '2026-01-10' }, HOJE)).toBeNull();
    expect(planoMensal({ ...meta(1000, 1000), prazo: '2026-12-15' }, HOJE)).toBeNull();
  });
});

describe('resumoDasMetas', () => {
  it('separa as concluídas das em andamento', () => {
    expect(resumoDasMetas([meta(1000, 1000), meta(1000, 10), meta(1000)])).toEqual({
      total: 3,
      concluidas: 1,
      emAndamento: 2,
    });
  });
});

describe('validação', () => {
  it('exige nome e valor positivo', () => {
    expect(validarMeta({ nome: '  ', alvo: null }, HOJE)).toEqual({
      nome: 'Dê um nome para a meta.',
      alvo: 'Informe quanto você quer juntar.',
    });
    expect(validarMeta({ nome: 'Carro', alvo: 0 }, HOJE).alvo).toBe('O valor precisa ser maior que zero.');
  });

  it('recusa prazo no passado', () => {
    expect(validarMeta({ nome: 'Carro', alvo: 100, prazo: '2026-09-01' }, HOJE).prazo).toBeDefined();
    expect(validarMeta({ nome: 'Carro', alvo: 100, prazo: HOJE }, HOJE)).toEqual({});
  });

  // Regressão: o campo Prazo guardava o evento inteiro ({ target }) e a meta
  // salva derrubava a tela no plano mensal (prazo.split is not a function).
  it('recusa prazo que não é uma data ISO que existe', () => {
    const evento = { target: { name: 'prazo', value: '2026-12-20' } };
    for (const prazo of [evento, '20/12', '2026-02-30', 20261220]) {
      expect(validarMeta({ nome: 'Carro', alvo: 100, prazo }, HOJE).prazo).toBe('Data inválida.');
    }
    expect(validarMeta({ nome: 'Carro', alvo: 100, prazo: '' }, HOJE)).toEqual({});
  });

  it('confere o aporte', () => {
    expect(validarAporte(null)).not.toBe('');
    expect(validarAporte(-5)).not.toBe('');
    expect(validarAporte(500)).toBe('');
  });
});

describe('limite do aporte', () => {
  it('não deixa passar do que falta para 100%', () => {
    const viagem = meta(100000, 70000);
    expect(faltaParaOAlvo(viagem)).toBe(30000);
    expect(validarAporte(30000, viagem)).toBe('');
    expect(validarAporte(29999, viagem)).toBe('');
    expect(validarAporte(30001, viagem)).toBe('Passa do que falta. Com R$ 300,00, a meta fica completa.');
  });

  it('meta completa não recebe aporte', () => {
    expect(validarAporte(100, meta(100000, 100000))).toBe('Esta meta já está completa.');
  });

  it('os botões rápidos cabem no que falta e o último completa a meta', () => {
    expect(aportesRapidos(meta(100000, 70000))).toEqual([
      { valor: 5000, completa: false },
      { valor: 10000, completa: false },
      { valor: 20000, completa: false },
      { valor: 30000, completa: true },
    ]);
    // Faltando menos que o menor botão, só o que completa.
    expect(aportesRapidos(meta(100000, 97500))).toEqual([{ valor: 2500, completa: true }]);
    // Faltando exatamente um dos valores, ele vira o "Completar".
    expect(aportesRapidos(meta(100000, 90000))).toEqual([
      { valor: 5000, completa: false },
      { valor: 10000, completa: true },
    ]);
    expect(aportesRapidos(meta(100000, 100000))).toEqual([]);
  });

  it('nenhum botão rápido leva a meta além do alvo', () => {
    for (const ja of [0, 1, 4999, 50000, 99999]) {
      const alvo = meta(100000, ja);
      for (const { valor } of aportesRapidos(alvo)) {
        expect(guardado(alvo) + valor).toBeLessThanOrEqual(alvo.alvo);
      }
    }
  });
});

describe('faseDoValor', () => {
  it('dá a fase de um valor no meio do caminho (a barra enquanto anda)', () => {
    const alvo = meta(100000);
    expect(faseDoValor(alvo, 0).id).toBe('semente');
    expect(faseDoValor(alvo, 1).id).toBe('broto');
    expect(faseDoValor(alvo, 20000).id).toBe('muda');
    expect(faseDoValor(alvo, 74999).id).toBe('arvoreta');
    expect(faseDoValor(alvo, 100000).id).toBe('frutos');
    expect(faseDoValor(alvo, 45000)).toEqual(faseDaMeta(meta(100000, 45000)));
  });
});

describe('criar, aportar e desfazer', () => {
  it('monta a meta e registra aportes sem mudar a original', () => {
    const criada = novaMeta({ nome: '  Notebook ', alvo: 500000, prazo: '' }, { id: 'n1', hoje: HOJE });
    expect(criada).toEqual({ id: 'n1', nome: 'Notebook', alvo: 500000, prazo: null, criadaEm: HOJE, aportes: [] });
    const regada = comAporte(criada, { id: 'a1', valor: 10000, data: HOJE });
    expect(criada.aportes).toHaveLength(0);
    expect(guardado(regada)).toBe(10000);
    expect(guardado(semAporte(regada, 'a1'))).toBe(0);
  });

  it('guarda só prazo ISO válido; o resto vira sem prazo', () => {
    expect(prazoValido('2026-12-20')).toBe('2026-12-20');
    expect(prazoValido({ target: { value: '2026-12-20' } })).toBeNull();
    expect(prazoValido('2026-13-01')).toBeNull();
    expect(prazoValido(null)).toBeNull();
    const criada = novaMeta({ nome: 'Carro', alvo: 100, prazo: { target: {} } }, { id: 'n2', hoje: HOJE });
    expect(criada.prazo).toBeNull();
    expect(planoMensal({ ...criada, prazo: prazoValido({}) }, HOJE)).toBeNull();
  });
});

describe('sementeDaMeta', () => {
  it('é estável para o mesmo id e muda entre ids', () => {
    expect(sementeDaMeta('abc')).toBe(sementeDaMeta('abc'));
    expect(sementeDaMeta('abc')).not.toBe(sementeDaMeta('abd'));
  });
});
