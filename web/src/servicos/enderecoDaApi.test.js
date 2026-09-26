// Testes do endereço da API quando a página é aberta pela rede local ou pelo túnel.
import { describe, expect, it } from 'vitest';
import { enderecoDaApi } from './enderecoDaApi';

describe('enderecoDaApi', () => {
  it('na própria máquina, usa o endereço do web/.env sem a barra do fim', () => {
    expect(enderecoDaApi('http://localhost:8081/', 'localhost')).toBe('http://localhost:8081');
    expect(enderecoDaApi('http://localhost:8081', '127.0.0.1')).toBe('http://localhost:8081');
  });

  it('aberta pela rede, troca localhost pelo IP de onde a página veio', () => {
    expect(enderecoDaApi('http://localhost:8081', '192.0.2.10')).toBe('http://192.0.2.10:8081');
    expect(enderecoDaApi('http://127.0.0.1:8081/api', '192.168.0.12')).toBe('http://192.168.0.12:8081/api');
  });

  it('aberta pelo túnel da Cloudflare, usa o proxy do Vite no mesmo endereço da página', () => {
    const tunel = 'palavras-de-exemplo.trycloudflare.com';
    expect(enderecoDaApi('http://localhost:8081', tunel, '/ADS-Project/')).toBe('/ADS-Project/api');
    expect(enderecoDaApi('http://127.0.0.1:8081/', tunel, '/')).toBe('/api');
    expect(enderecoDaApi('https://api.exemplo.com', tunel, '/ADS-Project/')).toBe('https://api.exemplo.com');
    expect(enderecoDaApi('', tunel, '/ADS-Project/')).toBe('');
  });

  it('não mexe numa API hospedada, nem em endereço vazio ou inválido', () => {
    expect(enderecoDaApi('https://api.exemplo.com', '192.0.2.10')).toBe('https://api.exemplo.com');
    expect(enderecoDaApi('', '192.0.2.10')).toBe('');
    expect(enderecoDaApi('não é url', '192.0.2.10')).toBe('não é url');
  });
});
