import { Link } from 'react-router-dom';
import Icone from './Icone';

// Padrão de todo aviso que depende de outro cadastro ou módulo (importar sem
// conta, pagar fatura sem conta, lançar sem categoria): diz o que falta e
// oferece os dois caminhos, sempre os dois:
// 1. o atalho (ação principal), que leva direto à tela do que falta, já com
//    o formulário certo aberto (atalho.para leva o ?cadastrar=...);
// 2. fechar (ação secundária), que sai sem mudar a tela atual.
// Numa página, fora de janela, não há o que fechar: sem aoFechar, só o
// atalho aparece. Dentro de um formulário que já tem o próprio Cancelar,
// também dá para omitir aoFechar.
export default function AvisoComAtalho({ icone = 'alerta', titulo, children, atalho, aoFechar, rotuloDeFechar = 'Cancelar', compacto = false }) {
  return (
    <div className={`aviso-com-atalho${compacto ? ' compacto' : ''}`} role="status">
      <span className="simbolo" aria-hidden="true">
        <Icone nome={icone} tamanho={compacto ? 16 : 20} />
      </span>
      <div className="texto-do-aviso">
        {titulo && <h3>{titulo}</h3>}
        <div className="discreto">{children}</div>
      </div>
      <div className="acoes-do-aviso">
        {aoFechar && (
          <button type="button" className="secundario" onClick={aoFechar}>
            {rotuloDeFechar}
          </button>
        )}
        <Link className="botao" to={atalho.para}>
          <Icone nome={atalho.icone ?? 'mais'} tamanho={16} />
          {atalho.rotulo}
        </Link>
      </div>
    </div>
  );
}
