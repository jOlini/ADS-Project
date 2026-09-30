import { useState } from 'react';
import Campo from './Campo';
import Icone from './Icone';
import Seletor from './Seletor';
import SeletorDeData from './SeletorDeData';
import { useToast } from './toast/useToast';
import { primeiroCampoComErro } from '../regras/cadastro';
import { valorParaCampo } from '../regras/dinheiro';
import { errosDaApi } from '../regras/livroCaixa';
import {
  corpoDoColaborador,
  MAXIMO_DE_BENEFICIOS,
  ORDEM_DO_COLABORADOR,
  TAMANHO_DO_NOME,
  validarColaborador,
  VINCULOS,
} from '../olifine/regras/folha';
import { editarColaborador, incluirColaborador } from '../servicos/livroCaixa';

function paraFormulario(pessoa) {
  return {
    nome: pessoa?.nome ?? '',
    vinculo: pessoa?.vinculo ?? '',
    cargo: pessoa?.cargo ?? '',
    salario: pessoa ? valorParaCampo(pessoa.salario_centavos) : '',
    dia_pagamento: String(pessoa?.dia_pagamento ?? 5),
    admissao: pessoa?.admissao ?? '',
    ativo: pessoa?.ativo ?? true,
    beneficios: (pessoa?.beneficios ?? []).map((beneficio) => ({ nome: beneficio.nome, valor: valorParaCampo(beneficio.valor_centavos) })),
  };
}

// Formulário da pessoa da folha (aba Pessoal): nome, vínculo (CLT, PJ ou
// pró-labore), cargo, o valor mensal (salário, contrato ou pró-labore), o dia
// do pagamento, a admissão e os benefícios (vale-refeição, transporte, plano
// de saúde), cada um com o valor por mês. Desativar tira a pessoa da próxima
// folha sem apagar as já lançadas.
export default function FormularioDeColaborador({ espacoId, pessoas, sugestoesDeNome = [], emEdicao = null, aoSalvar, aoCancelar, aoMudarOcupado }) {
  const toast = useToast();
  const [formulario, setFormulario] = useState(() => paraFormulario(emEdicao));
  const [erros, setErros] = useState({});
  const [enviando, setEnviando] = useState(false);

  function mudar(campo, valor) {
    setFormulario((atual) => ({ ...atual, [campo]: valor }));
    setErros((atuais) => ({ ...atuais, [campo]: undefined }));
  }

  function mudarBeneficio(indice, campo, valor) {
    setFormulario((atual) => ({
      ...atual,
      beneficios: atual.beneficios.map((beneficio, posicao) => (posicao === indice ? { ...beneficio, [campo]: valor } : beneficio)),
    }));
    setErros((atuais) => ({ ...atuais, [`beneficios.${indice}.${campo}`]: undefined }));
  }

  async function enviar(evento) {
    evento.preventDefault();
    const elementos = evento.currentTarget.elements;
    const encontrados = validarColaborador(formulario, pessoas, emEdicao?.id ?? null);
    setErros(encontrados);
    const primeiro = primeiroCampoComErro(encontrados, [...ORDEM_DO_COLABORADOR, ...Object.keys(encontrados)]);
    if (primeiro) {
      elementos[primeiro]?.focus();
      return;
    }
    setEnviando(true);
    aoMudarOcupado?.(true);
    try {
      const corpo = corpoDoColaborador(formulario);
      const salvo = emEdicao ? await editarColaborador(espacoId, emEdicao.id, corpo) : await incluirColaborador(espacoId, corpo);
      toast.sucesso(emEdicao ? 'A próxima folha já usa os valores novos.' : 'Entra na próxima folha lançada.', {
        titulo: emEdicao ? `Dados de ${salvo.nome} atualizados` : `${salvo.nome} entrou na folha`,
      });
      aoSalvar(salvo);
    } catch (erro) {
      const campos = errosDaApi(erro.campos);
      setErros({ ...campos, salario: campos.salario_centavos ?? campos.salario });
      toast.erro(erro.message, { titulo: emEdicao ? 'Pessoa não atualizada' : 'Pessoa não incluída' });
      setEnviando(false);
      aoMudarOcupado?.(false);
    }
  }

  const rotuloDoValor = formulario.vinculo === 'PJ' ? 'Valor do contrato (R$)' : formulario.vinculo === 'PRO_LABORE' ? 'Pró-labore (R$)' : 'Salário bruto (R$)';

  return (
    <form onSubmit={enviar} noValidate>
      <div className="duas-colunas">
        <Campo rotulo="Nome" name="nome" mascara="texto" autoComplete="off" maxLength={TAMANHO_DO_NOME} placeholder="Ex.: Carla Costa"
          data-foco-inicial list={sugestoesDeNome.length > 0 ? 'socios-da-empresa' : undefined}
          value={formulario.nome} onChange={(evento) => mudar('nome', evento.target.value)} erro={erros.nome} />
        <Campo elemento={Seletor} rotulo="Vínculo" name="vinculo" placeholder="Escolha o vínculo"
          opcoes={VINCULOS.map(({ valor, rotulo, descricao }) => ({ valor, rotulo, descricao }))}
          value={formulario.vinculo} onChange={(evento) => mudar('vinculo', evento.target.value)} erro={erros.vinculo} />
      </div>
      {sugestoesDeNome.length > 0 && (
        <datalist id="socios-da-empresa">
          {sugestoesDeNome.map((nome) => (
            <option key={nome} value={nome} />
          ))}
        </datalist>
      )}

      <div className="duas-colunas">
        <Campo rotulo={<>Cargo <span className="rotulo-opcional">(opcional)</span></>} name="cargo" mascara="texto" autoComplete="off"
          maxLength={TAMANHO_DO_NOME} placeholder="Ex.: Costureira"
          value={formulario.cargo} onChange={(evento) => mudar('cargo', evento.target.value)} erro={erros.cargo} />
        <Campo rotulo={rotuloDoValor} name="salario" mascara="moeda" autoComplete="off" placeholder="0,00"
          value={formulario.salario} onChange={(evento) => mudar('salario', evento.target.value)} erro={erros.salario} />
      </div>

      <div className="duas-colunas">
        <Campo rotulo="Dia do pagamento" name="dia_pagamento" mascara="inteiro" digitos={2} autoComplete="off"
          dica="No mês seguinte ao trabalhado."
          value={formulario.dia_pagamento} onChange={(evento) => mudar('dia_pagamento', evento.target.value)} erro={erros.dia_pagamento} />
        <Campo elemento={SeletorDeData} rotulo={<>Admissão <span className="rotulo-opcional">(opcional)</span></>} name="admissao"
          value={formulario.admissao} onChange={(evento) => mudar('admissao', evento.target.value)} erro={erros.admissao} />
      </div>

      <fieldset className="campo of-beneficios">
        <legend className="rotulo-do-campo">Benefícios por mês</legend>
        {formulario.beneficios.map((beneficio, indice) => (
          <div key={indice} className="of-beneficio">
            <Campo rotulo="Benefício" name={`beneficios.${indice}.nome`} mascara="texto" autoComplete="off" maxLength={60}
              placeholder="Ex.: Vale-refeição" value={beneficio.nome}
              onChange={(evento) => mudarBeneficio(indice, 'nome', evento.target.value)} erro={erros[`beneficios.${indice}.nome`]} />
            <Campo rotulo="Valor (R$)" name={`beneficios.${indice}.valor`} mascara="moeda" autoComplete="off" placeholder="0,00"
              value={beneficio.valor} onChange={(evento) => mudarBeneficio(indice, 'valor', evento.target.value)}
              erro={erros[`beneficios.${indice}.valor`]} />
            <button type="button" className="botao-icone" aria-label={`Tirar o benefício ${beneficio.nome || indice + 1}`}
              onClick={() => mudar('beneficios', formulario.beneficios.filter((_, posicao) => posicao !== indice))}>
              <Icone nome="excluir" tamanho={16} />
            </button>
          </div>
        ))}
        {formulario.beneficios.length < MAXIMO_DE_BENEFICIOS && (
          <button type="button" className="secundario compacto" onClick={() => mudar('beneficios', [...formulario.beneficios, { nome: '', valor: '' }])}>
            <Icone nome="mais" tamanho={14} />
            Incluir benefício
          </button>
        )}
      </fieldset>

      {emEdicao && (
        <label className="caixa-de-marcar">
          <input type="checkbox" checked={formulario.ativo} onChange={(evento) => mudar('ativo', evento.target.checked)} />
          Na folha (desmarque quando a pessoa sair: as folhas lançadas ficam)
        </label>
      )}

      <div className="acoes-do-formulario">
        <button type="button" className="secundario" onClick={aoCancelar} disabled={enviando}>
          Cancelar
        </button>
        <button type="submit" disabled={enviando} aria-busy={enviando}>
          {enviando ? 'Salvando…' : emEdicao ? 'Salvar' : 'Incluir na folha'}
        </button>
      </div>
    </form>
  );
}
