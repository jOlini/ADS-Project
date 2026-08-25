import { useState } from 'react';
import './App.css';

const EMAIL_CORRETO = 'joaopedroolini22@gmail.com';
const SENHA_CORRETA = '123456';

function App() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mensagem, setMensagem] = useState('');

  function acessar() {
    if (email === EMAIL_CORRETO && senha === SENHA_CORRETA) {
      setMensagem('Acessado com sucesso!');
    } else {
      setMensagem('Usuário ou senha incorretos!');
    }
  }

  return (
    <div className="login">
      <h1>Login</h1>

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <input
        type="password"
        placeholder="Senha"
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
      />

      <button onClick={acessar}>Acessar</button>

      <label className="mensagem">{mensagem}</label>
    </div>
  );
}

export default App;