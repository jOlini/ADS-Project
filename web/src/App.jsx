import { useState } from 'react';
import './App.css';
import { validarCredenciais } from './validacao';

// Credencial fixa exigida pelo enunciado da Somativa 1 de Tecnologias Para Desenvolvimento Web. Os valores são fictícios de propósito.
const CREDENCIAL = {
  email: 'usuario@pessoalfinance.com',
  senha: 'financeiro123',
};

function App() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mensagem, setMensagem] = useState('');

  function acessar() {
    setMensagem(validarCredenciais(email, senha, CREDENCIAL));
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