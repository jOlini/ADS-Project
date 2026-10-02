import { useState } from 'react';
import Campo from './Campo';
import Seletor from './Seletor';
import SeletorDeCorHex from './SeletorDeCorHex';
import { useToast } from './toast/useToast';
import { primeiroCampoComErro } from '../regras/cadastro';
import { COR_DO_TIPO_DE_CONTA, corDoPlastico, SUGESTOES_DE_PLASTICO } from '../regras/cores';
import { formatarBRL, lerValor } from '../regras/dinheiro';
import { errosDaApi, ORDEM_DA_CONTA, TIPOS_DE_CONTA, validarConta } from '../regras/livroCaixa';
import { atualizarConta, criarConta } from '../servicos/livroCaixa';

// cor vazia: a do tipo da conta (COR_DO_TIPO_DE_CONTA), até a pessoa escolher.
const NOVA = { nome: '', tipo: 'CORRENTE', saldoInicial: '', ativa: true, cor: '' };

// Formulário de conta bancária (no modal "Nova conta" ou "Editar conta"):
// nome, tipo, a cor do card dela (como a do cartão) e, na criação, o saldo de
// hoje. O saldo inicial não muda depois de criado, para não reescrever o
// saldo dos dias passados; na edição, a conta pode ser desativada. aoSalvar
// recebe a conta salva.
export default function FormularioDeConta({ espacoId, emEdicao = null, aoSalvar, aoCancelar, aoMudarOcupado }) {
  const toast = useToast();
  const [formulario, setFormulario] = useState(() =>
    emEdicao ? { nome: emEdicao.nome, tipo: emEdicao.tipo, saldoInicial: '', ativa: emEdicao.ativa, cor: emEdicao.cor ?? '' } : NOVA,
  );
  const [erros, setErros] = useState({});
  const [enviando, setEnviando] = useState(false);

  function mudar(campo, valor) {
    setFormulario((atual) => ({ ...atual, [campo]: valor }));
    setErros((atuais) => ({ ...atuais, [campo]: undefined }));
  }

  async function salvar() {
    if (emEdicao) {
      const salva = await atualizarConta(espacoId, emEdicao.id, {
        nome: formulario.nome.trim(),
        tipo: formulario.tipo,
        ativa: formulario.ativa,
        ...(formulario.cor ? { cor: formulario.cor } : {}),
      });
      toast.sucesso(salva.ativa ? 'Os lançamentos continuam iguais.' : 'Ela sai das opções de novos lançamentos.', {
        titulo: `Conta "${salva.nome}" salva`,
      });
      return salva;
    }
    const criada = await criarConta(espacoId, {
      nome: formulario.nome.trim(),
      tipo: formulario.tipo,
      saldo_inicial_centavos: formulario.saldoInicial.trim() ? lerValor(formulario.saldoInicial, { permitirNegativo: true }) : 0,
      ...(formulario.cor ? { cor: formulario.cor } : {}),
    });
    toast.sucesso(`Saldo inicial de ${formatarBRL(criada.saldo_inicial_centavos)}.`, { titulo: `Conta "${criada.nome}" criada` });
    return criada;
  }

  async function enviar(evento) {
    evento.preventDefault();
    const elementos = evento.currentTarget.elements;
    const encontrados = validarConta(emEdicao ? { ...formulario, saldoInicial: '' } : formulario);
    setErros(encontrados);
    const primeiro = primeiroCampoComErro(encontrados, ORDEM_DA_CONTA);
    if (primeiro) {
      elementos[primeiro]?.focus();
      return;
    }

    setEnviando(true);
    aoMudarOcupado?.(true);
    try {
      aoSalvar(await salvar());
    } catch (erro) {
      setErros(errosDaApi(erro.campos));
      toast.erro(erro.message, { titulo: 'Conta não salva' });
      setEnviando(false);
      aoMudarOcupado?.(false);
    }
  }

  return (
    <form onSubmit={enviar} noValidate>
      <Campo rotulo="Nome" name="nome" mascara="texto" autoComplete="off" maxLength={60} placeholder="Ex.: Conta do banco" data-foco-inicial
        value={formulario.nome} onChange={(evento) => mudar('nome', evento.target.value)} erro={erros.nome} />

      <Campo elemento={Seletor} rotulo="Tipo" name="tipo" value={formulario.tipo} opcoes={TIPOS_DE_CONTA}
        onChange={(evento) => mudar('tipo', evento.target.value)} erro={erros.tipo} />

      <SeletorDeCorHex rotulo="Cor do card" name="cor" valor={formulario.cor || COR_DO_TIPO_DE_CONTA[formulario.tipo]}
        sugestoes={SUGESTOES_DE_PLASTICO} cssDaSugestao={corDoPlastico} aoMudar={(cor) => mudar('cor', cor)} erro={erros.cor} />

      {emEdicao ? (
        <p className="dica-do-campo">
          Saldo inicial: {formatarBRL(emEdicao.saldo_inicial_centavos)}. Ele não muda depois de criado, para não reescrever o
          saldo dos dias passados; para corrigir, lance um ajuste.
        </p>
      ) : (
        <Campo rotulo="Saldo de hoje (R$)" name="saldoInicial" mascara="moeda-com-sinal" autoComplete="off" placeholder="0,00"
          dica="Quanto já está na conta. Use -150,00 se estiver no vermelho."
          value={formulario.saldoInicial} onChange={(evento) => mudar('saldoInicial', evento.target.value)}
          erro={erros.saldoInicial} />
      )}

      {emEdicao && (
        <label className="caixa-de-marcar">
          <input type="checkbox" name="ativa" checked={formulario.ativa} onChange={(evento) => mudar('ativa', evento.target.checked)} />
          <span>
            <b>Conta ativa</b>
            <small>Desativada, sai das opções de novos lançamentos e mantém o histórico.</small>
          </span>
        </label>
      )}

      <div className="acoes-do-formulario">
        <button type="button" className="secundario" onClick={aoCancelar} disabled={enviando}>
          Cancelar
        </button>
        <button type="submit" disabled={enviando} aria-busy={enviando}>
          {enviando ? 'Salvando…' : emEdicao ? 'Salvar' : 'Criar conta'}
        </button>
      </div>
    </form>
  );
}
