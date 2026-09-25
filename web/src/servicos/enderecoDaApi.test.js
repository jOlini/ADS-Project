// Testes do endereço da API quando a página é aberta pela rede local.
import { describe, expect, it } from 'vitest';
import { enderecoDaApi } from './enderecoDaApi';

describe('enderecoDaApi', () => {
  it('na própria máquina, usa o endereço do web/.env sem a barra do fim', () => {
    expect(enderecoDaApi('http://localhost:8081/', 'localhost')).toBe('http://localhost:8081');
    expect(enderecoDaApi('http://localhost:8081', '127.0.0.1')).toBe('http://localhost:8081');
  });

  it('aberta pela rede, troca localhost pelo IP de onde a página veio', () => {
    expect(enderecoDaApi('http://localhost:8081', '10.50.122.74')).toBe('http://10.50.122.74:8081');
    expect(enderecoDaApi('http://127.0.0.1:8081/api', '192.168.0.12')).toBe('http://192.168.0.12:8081/api');
  });

  it('não mexe numa API hospedada, nem em endereço vazio ou inválido', () => {
    expect(enderecoDaApi('https://api.exemplo.com', '10.50.122.74')).toBe('https://api.exemplo.com');
    expect(enderecoDaApi('', '10.50.122.74')).toBe('');
    expect(enderecoDaApi('não é url', '10.50.122.74')).toBe('não é url');
  });
});
