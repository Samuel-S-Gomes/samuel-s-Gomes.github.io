# Portfólio Digital — Samuel Santana Gomes

Portfólio pessoal em HTML/CSS estático, publicado no GitHub Pages.

## Estrutura

```
index.html               Início
projetos.html             Projetos
depoimentos.html          Depoimentos
certificacoes.html        Certificações
assets/css/style.css
assets/js/main.js         apenas o menu do mobile
assets/img/               imagens do site
demos/                    snapshots estáticos autocontidos de ferramentas
                           internas, com dados fictícios, embutidos via
                           iframe em projetos.html
```

Sem build, sem dependências. Abrir `index.html` no navegador já funciona.

## Design

Cores e tipografia ficam em `:root` no topo de `assets/css/style.css`:

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#14111B` | fundo geral |
| `--bg-elev` | `#1C1725` | topo dos cards de depoimento |
| `--accent` | `#8600DD` | destaques e botões |
| `--accent-soft` | `#683D83` | base dos gradientes, fundo da foto |
| `--text` | `#F9F9F9` | texto |

Fonte: **Lato**, via Google Fonts.

## GitHub Pages

Publicado a partir da branch `main`, raiz do repositório. O site fica em
`https://samuel-s-gomes.github.io`, e cada `push` republica.
