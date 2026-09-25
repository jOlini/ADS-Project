import { useEffect, useId, useRef, useState } from 'react';
import Icone from './Icone';
import {
  ANOS_POR_PAGINA,
  DIAS_DA_SEMANA,
  NOMES_DOS_MESES,
  anosDaPagina,
  dataPorExtenso,
  dentroDoLimite,
  diasNoMes,
  fimDaSemana,
  inicioDaSemana,
  limitar,
  mesForaDoLimite,
  paraIso,
  partesDe,
  semanasDoMes,
  somarDias,
  somarMeses,
} from '../regras/calendario';
import { hojeIso } from '../regras/datas';

const COLUNAS_DA_GRADE = 3;

const emLinhas = (itens, porLinha) =>
  Array.from({ length: Math.ceil(itens.length / porLinha) }, (_, linha) => itens.slice(linha * porLinha, (linha + 1) * porLinha));

function anoForaDoLimite(ano, min, max) {
  return Boolean((max && paraIso(ano, 1, 1) > max) || (min && paraIso(ano, 12, 31) < min));
}

// Calendário do projeto, no lugar do seletor de data do navegador. Três
// visões: os dias do mês, os 12 meses de um ano e 12 anos por página. Clicar
// no nome do mês ou no ano, no topo, leva direto à escolha dele: ir de 2026 a
// 1990 são dois cliques, não 400 setas. Com modo="mes", a escolha termina no
// mês (extrato mês a mês) e aoEscolher recebe { ano, mes }; no modo "dia",
// recebe a data ISO.
//
// Teclado (padrão do date picker do WAI-ARIA): setas andam pela grade; Page
// Up/Down trocam de mês (com Shift, de ano); Home/End vão ao começo e ao fim
// da semana; Enter ou espaço escolhem; Esc chama aoCancelar.
export default function Calendario({ modo = 'dia', valor, aoEscolher, aoCancelar, min, max, visaoInicial }) {
  const idDoTitulo = useId();
  const grade = useRef(null);
  // Mover o foco para a célula do cursor só quando a pessoa está na grade (ou
  // acabou de abrir/trocar de visão): as setas do topo guardam o foco nelas.
  const focarNaGrade = useRef(true);
  const [cursor, setCursor] = useState(() => {
    if (modo === 'mes') {
      return paraIso(valor.ano, valor.mes, 1);
    }
    return partesDe(valor) ? valor : limitar(hojeIso(), min, max);
  });
  const [visao, setVisao] = useState(visaoInicial ?? (modo === 'mes' ? 'meses' : 'dias'));
  const { ano, mes } = partesDe(cursor);
  const hoje = hojeIso();

  useEffect(() => {
    if (focarNaGrade.current) {
      focarNaGrade.current = false;
      grade.current?.querySelector('[data-cursor="true"]')?.focus({ preventScroll: true });
    }
  }, [cursor, visao]);

  function trocarVisao(nova) {
    focarNaGrade.current = true;
    setVisao(nova);
  }

  function moverCursor(evento, novo) {
    evento.preventDefault();
    focarNaGrade.current = true;
    setCursor(limitar(novo, min, max));
  }

  function escolherMes(numero) {
    if (modo === 'mes') {
      aoEscolher({ ano, mes: numero });
      return;
    }
    focarNaGrade.current = true;
    setCursor(limitar(paraIso(ano, numero, Math.min(partesDe(cursor).dia, diasNoMes(ano, numero))), min, max));
    setVisao('dias');
  }

  function escolherAno(numero) {
    focarNaGrade.current = true;
    setCursor(limitar(paraIso(numero, mes, Math.min(partesDe(cursor).dia, diasNoMes(numero, mes))), min, max));
    setVisao('meses');
  }

  function teclar(evento) {
    const { key, shiftKey } = evento;
    if (key === 'Escape') {
      evento.preventDefault();
      evento.stopPropagation();
      aoCancelar?.();
      return;
    }
    const passos = {
      dias: {
        ArrowLeft: () => somarDias(cursor, -1),
        ArrowRight: () => somarDias(cursor, 1),
        ArrowUp: () => somarDias(cursor, -7),
        ArrowDown: () => somarDias(cursor, 7),
        Home: () => inicioDaSemana(cursor),
        End: () => fimDaSemana(cursor),
        PageUp: () => somarMeses(cursor, shiftKey ? -12 : -1),
        PageDown: () => somarMeses(cursor, shiftKey ? 12 : 1),
      },
      meses: {
        ArrowLeft: () => somarMeses(cursor, -1),
        ArrowRight: () => somarMeses(cursor, 1),
        ArrowUp: () => somarMeses(cursor, -COLUNAS_DA_GRADE),
        ArrowDown: () => somarMeses(cursor, COLUNAS_DA_GRADE),
        Home: () => paraIso(ano, 1, 1),
        End: () => paraIso(ano, 12, 1),
        PageUp: () => somarMeses(cursor, -12),
        PageDown: () => somarMeses(cursor, 12),
      },
      anos: {
        ArrowLeft: () => somarMeses(cursor, -12),
        ArrowRight: () => somarMeses(cursor, 12),
        ArrowUp: () => somarMeses(cursor, -12 * COLUNAS_DA_GRADE),
        ArrowDown: () => somarMeses(cursor, 12 * COLUNAS_DA_GRADE),
        Home: () => paraIso(anosDaPagina(ano)[0], mes, 1),
        End: () => paraIso(anosDaPagina(ano).at(-1), mes, 1),
        PageUp: () => somarMeses(cursor, -12 * ANOS_POR_PAGINA),
        PageDown: () => somarMeses(cursor, 12 * ANOS_POR_PAGINA),
      },
    }[visao][key];
    if (passos && grade.current?.contains(evento.target)) {
      moverCursor(evento, passos());
    }
  }

  // Topo: setas de página e os atalhos para a escolha de mês e de ano.
  const pagina = {
    dias: { anterior: 'Mês anterior', proximo: 'Próximo mês', passo: 1 },
    meses: { anterior: 'Ano anterior', proximo: 'Próximo ano', passo: 12 },
    anos: { anterior: 'Anos anteriores', proximo: 'Próximos anos', passo: 12 * ANOS_POR_PAGINA },
  }[visao];
  const anos = anosDaPagina(ano);
  const titulo = { dias: `${NOMES_DOS_MESES[mes - 1]} de ${ano}`, meses: String(ano), anos: `${anos[0]} a ${anos.at(-1)}` }[visao];

  return (
    <div className="calendario" onKeyDown={teclar}>
      <div className="topo-do-calendario">
        <button type="button" className="botao-icone" aria-label={pagina.anterior}
          onClick={() => setCursor(limitar(somarMeses(cursor, -pagina.passo), min, max))}>
          <Icone nome="anterior" tamanho={16} />
        </button>
        <p id={idDoTitulo} className="apenas-leitor" aria-live="polite">
          {titulo}
        </p>
        <div className="atalhos-do-calendario">
          {visao === 'dias' && (
            <button type="button" className="atalho" aria-label={`Escolher o mês (${NOMES_DOS_MESES[mes - 1]})`}
              onClick={() => trocarVisao('meses')}>
              {NOMES_DOS_MESES[mes - 1]}
            </button>
          )}
          {visao !== 'anos' ? (
            <button type="button" className="atalho" aria-label={`Escolher o ano (${ano})`} onClick={() => trocarVisao('anos')}>
              {ano}
              <Icone nome="seta" tamanho={14} />
            </button>
          ) : (
            <span className="atalho parado" aria-hidden="true">
              {titulo}
            </span>
          )}
        </div>
        <button type="button" className="botao-icone" aria-label={pagina.proximo}
          onClick={() => setCursor(limitar(somarMeses(cursor, pagina.passo), min, max))}>
          <Icone nome="proximo" tamanho={16} />
        </button>
      </div>

      <div ref={grade} role="grid" aria-labelledby={idDoTitulo} className={`grade-do-calendario ${visao}`}>
        {visao === 'dias' && (
          <>
            <div role="row" className="linha-da-grade">
              {DIAS_DA_SEMANA.map((dia) => (
                <span key={dia.nome} role="columnheader" aria-label={dia.nome} className="dia-da-semana">
                  <span aria-hidden="true">{dia.curto}</span>
                </span>
              ))}
            </div>
            {semanasDoMes(ano, mes).map((semana) => (
              <div key={semana[0].iso} role="row" className="linha-da-grade">
                {semana.map((dia) => (
                  <span key={dia.iso} role="gridcell" aria-selected={dia.iso === valor}>
                    <button
                      type="button"
                      tabIndex={dia.iso === cursor ? 0 : -1}
                      data-cursor={dia.iso === cursor}
                      className={`dia-do-calendario${dia.doMes ? '' : ' fora-do-mes'}${dia.iso === valor ? ' escolhido' : ''}`}
                      aria-label={dataPorExtenso(dia.iso)}
                      aria-current={dia.iso === hoje ? 'date' : undefined}
                      disabled={!dentroDoLimite(dia.iso, min, max)}
                      onClick={() => aoEscolher(dia.iso)}
                    >
                      {dia.dia}
                    </button>
                  </span>
                ))}
              </div>
            ))}
          </>
        )}

        {visao === 'meses' &&
          emLinhas(NOMES_DOS_MESES, COLUNAS_DA_GRADE).map((linha, indiceDaLinha) => (
            <div key={linha[0]} role="row" className="linha-da-grade">
              {linha.map((nome, coluna) => {
                const numero = indiceDaLinha * COLUNAS_DA_GRADE + coluna + 1;
                const escolhido = modo === 'mes' ? valor.ano === ano && valor.mes === numero : partesDe(valor)?.ano === ano && partesDe(valor)?.mes === numero;
                return (
                  <span key={nome} role="gridcell" aria-selected={escolhido}>
                    <button
                      type="button"
                      tabIndex={numero === mes ? 0 : -1}
                      data-cursor={numero === mes}
                      className={`mes-da-grade${escolhido ? ' escolhido' : ''}`}
                      aria-label={`${nome} de ${ano}`}
                      aria-current={hoje.startsWith(paraIso(ano, numero, 1).slice(0, 8)) ? 'date' : undefined}
                      disabled={mesForaDoLimite(ano, numero, min, max)}
                      onClick={() => escolherMes(numero)}
                    >
                      {nome}
                    </button>
                  </span>
                );
              })}
            </div>
          ))}

        {visao === 'anos' &&
          emLinhas(anos, COLUNAS_DA_GRADE).map((linha) => (
            <div key={linha[0]} role="row" className="linha-da-grade">
              {linha.map((numero) => {
                const escolhido = modo === 'mes' ? valor.ano === numero : partesDe(valor)?.ano === numero;
                return (
                  <span key={numero} role="gridcell" aria-selected={escolhido}>
                    <button
                      type="button"
                      tabIndex={numero === ano ? 0 : -1}
                      data-cursor={numero === ano}
                      className={`ano-da-grade${escolhido ? ' escolhido' : ''}`}
                      aria-current={hoje.startsWith(`${numero}-`) ? 'date' : undefined}
                      disabled={anoForaDoLimite(numero, min, max)}
                      onClick={() => escolherAno(numero)}
                    >
                      {numero}
                    </button>
                  </span>
                );
              })}
            </div>
          ))}
      </div>

      <div className="rodape-do-calendario">
        {modo === 'dia' ? (
          <button type="button" className="discreto-botao" disabled={!dentroDoLimite(hoje, min, max)} onClick={() => aoEscolher(hoje)}>
            Hoje
          </button>
        ) : (
          <button type="button" className="discreto-botao"
            onClick={() => aoEscolher({ ano: Number(hoje.slice(0, 4)), mes: Number(hoje.slice(5, 7)) })}>
            Este mês
          </button>
        )}
      </div>
    </div>
  );
}
