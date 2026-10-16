import { describe, expect, it } from 'vitest';
import { dataRelatorio, processarRelatorio } from '../../src/importacao/processar.js';
import { linhasDaPagina, type ItemTexto, type LinhaRelatorio } from '../../src/importacao/relatorio.js';

// Posições x reais do cabeçalho do relatório do Gestor da Franquia.
const CAB: [number, string][] = [
  [28, 'Nome do Cliente'],
  [166, 'Endereço'],
  [326, 'Bairro'],
  [397, 'Cidade'],
  [468, 'Telefone'],
  [532, 'Celular'],
  [607, 'Cep'],
  [652, 'Tam'],
  [673, 'Ult. Compra'],
  [717, 'Vendedor(a)'],
];

function pagina(linhas: [number, string][][]): ItemTexto[] {
  const itens: ItemTexto[] = [
    { x: 341, y: 580, texto: 'LISTAGEM DOS CLIENTES' },
    ...CAB.map(([x, texto]) => ({ x, y: 534, texto })),
  ];
  linhas.forEach((l, i) => {
    for (const [x, texto] of l) itens.push({ x, y: 517 - i * 14.5, texto });
  });
  itens.push({ x: 30, y: 40, texto: '09/10/2026 13:35:40' }, { x: 700, y: 40, texto: 'Page 1 of 130' });
  return itens;
}

describe('linhasDaPagina', () => {
  it('separa as colunas pela posição do cabeçalho e ignora rodapé', () => {
    const linhas = linhasDaPagina(
      pagina([
        [
          [30, 'Natalia Pessin Boechat'],
          [166, 'Avenida Hugo Musso, 1500'],
          [399, 'Vila Velha/ES'],
          [532, '(28) 9999767298'],
          [607, '29101287'],
          [673, '10/12/2024'],
          [717, 'Maria Vitória Brito Tavo'],
        ],
        [
          [28, 'Bruna Pickert'],
          [469, '(27) 98832-9965'],
          [532, '()'],
          [673, '02/07/2024'],
          [717, 'Vinicius Moreno Cabral'],
        ],
      ]),
      1,
    );
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toMatchObject({
      nome: 'Natalia Pessin Boechat',
      cidade: 'Vila Velha/ES',
      celular: '(28) 9999767298',
      ultimaCompra: '10/12/2024',
      vendedora: 'Maria Vitória Brito Tavo',
    });
    expect(linhas[1]).toMatchObject({ nome: 'Bruna Pickert', telefone: '(27) 98832-9965', celular: '()' });
  });

  it('página sem cabeçalho não gera linhas', () => {
    expect(linhasDaPagina([{ x: 30, y: 500, texto: 'qualquer coisa' }], 1)).toEqual([]);
  });
});

const linha = (p: Partial<LinhaRelatorio>): LinhaRelatorio => ({
  pagina: 1,
  nome: 'Cliente Teste',
  endereco: '',
  bairro: '',
  cidade: 'Vila Velha/ES',
  telefone: '',
  celular: '(27) 999887766',
  cep: '',
  ultimaCompra: '09/01/2026',
  vendedora: 'Isabely Divina Santos d',
  ...p,
});

describe('processarRelatorio', () => {
  const HOJE = '2026-10-14';

  it('datas MM/DD/AAAA', () => {
    expect(dataRelatorio('12/24/2024')).toBe('2024-12-24');
    expect(dataRelatorio('')).toBeNull();
  });

  it('une duplicados da mesma pessoa e mantém a compra mais recente', () => {
    const r = processarRelatorio(
      [
        linha({ nome: 'Beatriz Bastos', ultimaCompra: '08/11/2023', vendedora: 'Larissa Rodrigues Gon' }),
        linha({ nome: 'Beatriz Bastos', ultimaCompra: '09/30/2026' }),
      ],
      HOJE,
    );
    expect(r.clientes).toHaveLength(1);
    expect(r.duplicadosUnificados).toBe(1);
    expect(r.clientes[0]?.ultimaCompra).toBe('2026-09-30');
    expect(r.clientes[0]?.segmento).toBe('RECENTE');
  });

  it('telefone compartilhado por pessoas diferentes não é enviado', () => {
    const r = processarRelatorio(
      [linha({ nome: 'Graziela' }), linha({ nome: 'Caroline Rodrigues Reis' }), linha({ nome: 'Outra', celular: '(27) 988887777' })],
      HOJE,
    );
    expect(r.clientes.map((c) => c.primeiroNome)).toEqual(['Outra']);
    expect(r.rejeitados.filter((x) => x.motivo === 'TELEFONE_COMPARTILHADO')).toHaveLength(2);
  });

  it('rejeita funcionária, empresa e telefones ruins com o motivo', () => {
    const r = processarRelatorio(
      [
        linha({ nome: 'Isabelly Divina Santos De Freitas', celular: '(27) 911112222' }),
        linha({ nome: 'Iq Industria E Comercio Ltda', celular: '(27) 922223333' }),
        linha({ nome: 'Fixo', celular: '(27) 3299-0758' }),
        linha({ nome: 'Vazio', celular: '()' }),
      ],
      HOJE,
    );
    expect(r.clientes).toHaveLength(0);
    expect(r.rejeitados.map((x) => x.motivo)).toEqual(['FUNCIONARIA', 'EMPRESA', 'TELEFONE_FIXO', 'TELEFONE_VAZIO']);
  });

  it('usa a coluna Telefone quando o celular está vazio', () => {
    const r = processarRelatorio([linha({ celular: '()', telefone: '(27) 98832-9965' })], HOJE);
    expect(r.clientes[0]?.telefone).toBe('5527988329965');
  });

  it('vendedora só assina se vendeu recentemente; "Venda Funcionario" nunca', () => {
    const r = processarRelatorio(
      [
        linha({ nome: 'Ana', celular: '(27) 911110001', vendedora: 'Isabely Divina Santos d', ultimaCompra: '09/01/2026' }),
        linha({ nome: 'Bia', celular: '(27) 911110002', vendedora: 'Larissa Rodrigues Gon', ultimaCompra: '09/05/2023' }),
        linha({ nome: 'Cris', celular: '(27) 911110003', vendedora: 'Venda Funcionario', ultimaCompra: '09/01/2026' }),
      ],
      HOJE,
    );
    const v = Object.fromEntries(r.clientes.map((c) => [c.primeiroNome, c.vendedora]));
    expect(v).toEqual({ Ana: 'Isabely', Bia: null, Cris: null });
  });

  it('ordena por prioridade: recente da Grande Vitória primeiro, fora do ES por último', () => {
    const r = processarRelatorio(
      [
        linha({ nome: 'Fora', celular: '(31) 911110001', cidade: 'Belo Horizonte/MG', ultimaCompra: '10/01/2026' }),
        linha({ nome: 'Antiga', celular: '(27) 911110002', ultimaCompra: '01/10/2025' }),
        linha({ nome: 'Recente', celular: '(27) 911110003', ultimaCompra: '10/01/2026' }),
        linha({ nome: 'Semddd', celular: '() 91111-0004', ultimaCompra: '10/02/2026' }),
      ],
      HOJE,
    );
    expect(r.clientes.map((c) => c.primeiroNome)).toEqual(['Recente', 'Semddd', 'Antiga', 'Fora']);
  });
});
