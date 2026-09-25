"""Endpoints REST do livro-caixa do cliente final.

Tudo fica sob /espacos/{espaco_id}: o espaço é o dono dos dados, e a
dependência espaco_do_cliente barra quem não é membro antes de qualquer
consulta. Lançamento não tem PUT: correção de valor é por estorno, que deixa
o histórico; DELETE apaga de vez (erro de digitação, duplicata). O extrato do
banco (CSV) entra por /importacoes, sem duplicar linha já importada.
"""

from datetime import date

from fastapi import APIRouter, Depends, Query, Request, Response, status

from app.financeiro.acesso import cliente_autenticado, espaco_do_cliente, obter_livro_caixa
from app.financeiro.modelos import (
    AtualizacaoCategoria,
    AtualizacaoConta,
    CategoriaResposta,
    ContaResposta,
    Espaco,
    EspacoResposta,
    EstruturaResposta,
    ImportacaoResposta,
    LancamentoResposta,
    LinhaDoArquivoResposta,
    MapeamentoDoExtrato,
    NovaCategoria,
    NovaConta,
    NovaImportacao,
    NovoLancamento,
    PedidoDeEstrutura,
)
from app.financeiro.repositorio import RepositorioLivroCaixa
from app.financeiro.servicos import ServicoLivroCaixa
from app.firebase import ClienteFirebase

ERRO_400 = {400: {"description": "Campo inválido ou incoerente (erro de cada campo em `campos`)"}}
ERRO_404 = {404: {"description": "Espaço (ou recurso dentro dele) não encontrado, ou de outra pessoa"}}
ERRO_409 = {409: {"description": "Lançamento já estornado, ou estorno de um estorno"}}

rotas_livro_caixa = APIRouter(
    prefix="/espacos",
    tags=["Livro-caixa"],
    responses={
        401: {"description": "ID token do Firebase ausente, inválido ou expirado"},
        503: {"description": "Validação do login do cliente indisponível"},
    },
)


def obter_servico(livro_caixa: RepositorioLivroCaixa = Depends(obter_livro_caixa)) -> ServicoLivroCaixa:
    return ServicoLivroCaixa(livro_caixa)


# --- Espaços -------------------------------------------------------------------


@rotas_livro_caixa.get("", response_model=list[EspacoResposta], summary="Listar meus espaços")
def listar_espacos(
    cliente: ClienteFirebase = Depends(cliente_autenticado),
    servico: ServicoLivroCaixa = Depends(obter_servico),
):
    """No primeiro acesso, cria o espaço pessoal com as categorias iniciais."""
    return [EspacoResposta.de(espaco, cliente.uid) for espaco in servico.espacos_do_cliente(cliente.uid)]


@rotas_livro_caixa.get(
    "/{espaco_id}", response_model=EspacoResposta, summary="Consultar um espaço", responses=ERRO_404
)
def buscar_espaco(
    espaco: Espaco = Depends(espaco_do_cliente),
    cliente: ClienteFirebase = Depends(cliente_autenticado),
):
    return EspacoResposta.de(espaco, cliente.uid)


# --- Contas --------------------------------------------------------------------


@rotas_livro_caixa.get(
    "/{espaco_id}/contas",
    response_model=list[ContaResposta],
    summary="Listar contas com o saldo de cada uma",
    responses=ERRO_404,
)
def listar_contas(espaco: Espaco = Depends(espaco_do_cliente), servico: ServicoLivroCaixa = Depends(obter_servico)):
    return [ContaResposta.de(conta, saldo) for conta, saldo in servico.contas_com_saldo(espaco)]


@rotas_livro_caixa.post(
    "/{espaco_id}/contas",
    response_model=ContaResposta,
    status_code=status.HTTP_201_CREATED,
    summary="Criar conta",
    responses={**ERRO_400, **ERRO_404},
)
def criar_conta(
    dados: NovaConta,
    requisicao: Request,
    resposta: Response,
    espaco: Espaco = Depends(espaco_do_cliente),
    servico: ServicoLivroCaixa = Depends(obter_servico),
):
    conta = servico.criar_conta(espaco, dados)
    resposta.headers["Location"] = str(requisicao.url_for("buscar_conta", espaco_id=espaco.id, conta_id=conta.id))
    return ContaResposta.de(conta, conta.saldo_inicial_centavos)


@rotas_livro_caixa.get(
    "/{espaco_id}/contas/{conta_id}", response_model=ContaResposta, summary="Consultar conta", responses=ERRO_404
)
def buscar_conta(
    conta_id: str, espaco: Espaco = Depends(espaco_do_cliente), servico: ServicoLivroCaixa = Depends(obter_servico)
):
    return ContaResposta.de(*servico.conta_com_saldo(espaco, conta_id))


@rotas_livro_caixa.put(
    "/{espaco_id}/contas/{conta_id}",
    response_model=ContaResposta,
    summary="Renomear, trocar o tipo, desativar ou reativar conta",
    responses={**ERRO_400, **ERRO_404},
)
def atualizar_conta(
    conta_id: str,
    dados: AtualizacaoConta,
    espaco: Espaco = Depends(espaco_do_cliente),
    servico: ServicoLivroCaixa = Depends(obter_servico),
):
    servico.atualizar_conta(espaco, conta_id, dados)
    return ContaResposta.de(*servico.conta_com_saldo(espaco, conta_id))


# --- Categorias ----------------------------------------------------------------


@rotas_livro_caixa.get(
    "/{espaco_id}/categorias", response_model=list[CategoriaResposta], summary="Listar categorias", responses=ERRO_404
)
def listar_categorias(
    espaco: Espaco = Depends(espaco_do_cliente), servico: ServicoLivroCaixa = Depends(obter_servico)
):
    return [CategoriaResposta.de(categoria) for categoria in servico.categorias(espaco)]


@rotas_livro_caixa.post(
    "/{espaco_id}/categorias",
    response_model=CategoriaResposta,
    status_code=status.HTTP_201_CREATED,
    summary="Criar categoria",
    responses={**ERRO_400, **ERRO_404},
)
def criar_categoria(
    dados: NovaCategoria,
    requisicao: Request,
    resposta: Response,
    espaco: Espaco = Depends(espaco_do_cliente),
    servico: ServicoLivroCaixa = Depends(obter_servico),
):
    categoria = servico.criar_categoria(espaco, dados)
    resposta.headers["Location"] = str(
        requisicao.url_for("buscar_categoria", espaco_id=espaco.id, categoria_id=categoria.id)
    )
    return CategoriaResposta.de(categoria)


@rotas_livro_caixa.get(
    "/{espaco_id}/categorias/{categoria_id}",
    response_model=CategoriaResposta,
    summary="Consultar categoria",
    responses=ERRO_404,
)
def buscar_categoria(
    categoria_id: str, espaco: Espaco = Depends(espaco_do_cliente), servico: ServicoLivroCaixa = Depends(obter_servico)
):
    return CategoriaResposta.de(servico.categoria(espaco, categoria_id))


@rotas_livro_caixa.put(
    "/{espaco_id}/categorias/{categoria_id}",
    response_model=CategoriaResposta,
    summary="Renomear, recolorir, desativar ou reativar categoria",
    responses={**ERRO_400, **ERRO_404},
)
def atualizar_categoria(
    categoria_id: str,
    dados: AtualizacaoCategoria,
    espaco: Espaco = Depends(espaco_do_cliente),
    servico: ServicoLivroCaixa = Depends(obter_servico),
):
    return CategoriaResposta.de(servico.atualizar_categoria(espaco, categoria_id, dados))


# --- Lançamentos ---------------------------------------------------------------


@rotas_livro_caixa.get(
    "/{espaco_id}/lancamentos",
    response_model=list[LancamentoResposta],
    summary="Listar lançamentos, do mais recente ao mais antigo",
    responses={**ERRO_400, **ERRO_404},
)
def listar_lancamentos(
    de: date | None = Query(None, description="Data inicial (AAAA-MM-DD), inclusive"),
    ate: date | None = Query(None, description="Data final (AAAA-MM-DD), inclusive"),
    limite: int = Query(200, ge=1, le=1000, description="Máximo de lançamentos na resposta"),
    espaco: Espaco = Depends(espaco_do_cliente),
    servico: ServicoLivroCaixa = Depends(obter_servico),
):
    return [LancamentoResposta.de(lancamento) for lancamento in servico.lancamentos(espaco, de, ate, limite)]


@rotas_livro_caixa.post(
    "/{espaco_id}/lancamentos",
    response_model=LancamentoResposta,
    status_code=status.HTTP_201_CREATED,
    summary="Lançar receita, despesa ou transferência",
    responses={**ERRO_400, **ERRO_404},
)
def lancar(
    dados: NovoLancamento,
    requisicao: Request,
    resposta: Response,
    espaco: Espaco = Depends(espaco_do_cliente),
    cliente: ClienteFirebase = Depends(cliente_autenticado),
    servico: ServicoLivroCaixa = Depends(obter_servico),
):
    lancamento = servico.lancar(espaco, dados, cliente.uid)
    resposta.headers["Location"] = str(
        requisicao.url_for("buscar_lancamento", espaco_id=espaco.id, lancamento_id=lancamento.id)
    )
    return LancamentoResposta.de(lancamento)


@rotas_livro_caixa.get(
    "/{espaco_id}/lancamentos/{lancamento_id}",
    response_model=LancamentoResposta,
    summary="Consultar lançamento",
    responses=ERRO_404,
)
def buscar_lancamento(
    lancamento_id: str,
    espaco: Espaco = Depends(espaco_do_cliente),
    servico: ServicoLivroCaixa = Depends(obter_servico),
):
    return LancamentoResposta.de(servico.lancamento(espaco, lancamento_id))


@rotas_livro_caixa.post(
    "/{espaco_id}/lancamentos/{lancamento_id}/estorno",
    response_model=LancamentoResposta,
    status_code=status.HTTP_201_CREATED,
    summary="Estornar lançamento (cria o lançamento inverso, com a data de hoje)",
    responses={**ERRO_404, **ERRO_409},
)
def estornar(
    lancamento_id: str,
    requisicao: Request,
    resposta: Response,
    espaco: Espaco = Depends(espaco_do_cliente),
    cliente: ClienteFirebase = Depends(cliente_autenticado),
    servico: ServicoLivroCaixa = Depends(obter_servico),
):
    estorno = servico.estornar(espaco, lancamento_id, cliente.uid)
    resposta.headers["Location"] = str(
        requisicao.url_for("buscar_lancamento", espaco_id=espaco.id, lancamento_id=estorno.id)
    )
    return LancamentoResposta.de(estorno)


@rotas_livro_caixa.delete(
    "/{espaco_id}/lancamentos/{lancamento_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Excluir lançamento (apaga de vez, junto com o estorno dele)",
    responses=ERRO_404,
)
def excluir_lancamento(
    lancamento_id: str,
    espaco: Espaco = Depends(espaco_do_cliente),
    servico: ServicoLivroCaixa = Depends(obter_servico),
):
    """Para erro de digitação ou lançamento duplicado: some do extrato e do
    saldo, sem deixar histórico. Para desfazer mantendo o registro, use o
    estorno. Excluir um estorno devolve o original ao normal. Uma linha de
    extrato importada e depois excluída volta se o arquivo for importado de novo."""
    servico.excluir(espaco, lancamento_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@rotas_livro_caixa.get(
    "/{espaco_id}/pessoas",
    response_model=list[str],
    summary="Listar as pessoas já usadas em divisões (rachas)",
    responses=ERRO_404,
)
def listar_pessoas(espaco: Espaco = Depends(espaco_do_cliente), servico: ServicoLivroCaixa = Depends(obter_servico)):
    return servico.pessoas(espaco)


# --- Importação de extrato ----------------------------------------------------


@rotas_livro_caixa.post(
    "/{espaco_id}/importacoes",
    response_model=ImportacaoResposta,
    summary="Importar extrato do banco em CSV (ou simular a importação)",
    responses={**ERRO_400, **ERRO_404},
)
def importar_extrato(
    dados: NovaImportacao,
    espaco: Espaco = Depends(espaco_do_cliente),
    cliente: ClienteFirebase = Depends(cliente_autenticado),
    servico: ServicoLivroCaixa = Depends(obter_servico),
):
    """Sem `mapeamento`, as colunas são reconhecidas pelo nome (data, descrição e valor
    com sinal; ou entrada e saída separadas; ou valor com coluna D/C), separadas por
    `;`, `,`, tabulação ou `|`. Com `mapeamento`, valem as colunas indicadas (ver
    `/importacoes/estrutura`). Cada linha vira uma receita ou despesa na conta
    escolhida. Linha já importada antes é pulada (`JA_IMPORTADA`), e linha ilegível
    volta com o motivo (`INVALIDA`), sem barrar as outras. Com `simular: true`, nada é
    gravado e as linhas que entrariam voltam como `NOVA`."""
    resultados = servico.importar(espaco, dados, cliente.uid)
    return ImportacaoResposta.de(resultados, simulacao=dados.simular)


@rotas_livro_caixa.post(
    "/{espaco_id}/importacoes/estrutura",
    response_model=EstruturaResposta,
    summary="Mostrar o começo do CSV e sugerir as colunas (nada é gravado)",
    responses={**ERRO_400, **ERRO_404},
)
def estrutura_do_extrato(
    dados: PedidoDeEstrutura,
    espaco: Espaco = Depends(espaco_do_cliente),
    servico: ServicoLivroCaixa = Depends(obter_servico),
):
    """As primeiras linhas do arquivo já separadas em células e, quando os nomes das
    colunas são reconhecidos, o `mapeamento` pronto para `/importacoes`. Com `mapeamento`
    nulo, a tela pede que a pessoa indique as colunas."""
    resultado = servico.estrutura(dados)
    return EstruturaResposta(
        delimitador=resultado.delimitador,
        linhas=[LinhaDoArquivoResposta(numero=linha.numero, celulas=linha.celulas) for linha in resultado.linhas],
        mapeamento=MapeamentoDoExtrato(**vars(resultado.mapeamento)) if resultado.mapeamento else None,
    )
