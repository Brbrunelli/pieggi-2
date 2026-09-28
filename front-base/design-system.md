# PIEGGI — Design System
### Catering, Coffee & Eventos · App & Web Experience
**Versão:** 1.0 · **Base:** Rebranding PIEGGI 2025 (Apresentação Rebranding + Institucional + Assets)

---

## 0. Filosofia

> **"Silêncio visual + gesto preciso."**

A Pieggi é uma marca **monocromática, editorial e cirúrgica**. Ela não grita cor —
ela grita **escala, contraste e vazio**. A comida é o único elemento colorido na tela.

Três leis que governam TODA decisão de interface:

**Lei 1 — A cor vem do prato.**
A UI é preto, branco e slate. Saturação existe apenas dentro de fotografias de alimentos.
Nunca coloque um botão colorido ao lado de um prato.

**Lei 2 — Tipografia é arquitetura, não decoração.**
O wordmark é um grotesco pesado e condensado. O contraponto é uma Didone itálica.
A tensão entre **peso brutal** e **elegância cursiva** É a marca.

**Lei 3 — Movimento é serviço, não espetáculo.**
Cada animação imita o gesto de um garçom: antecipação leve, entrega suave, nunca ricochete.
Sem bounce elástico. Sem confete. Tudo em `expo.out` / `power3.out`.

---

## 1. Fundação de Marca

| Item | Valor |
|---|---|
| Nome | **PIEGGI** (sempre caixa alta, com `®`) |
| Assinatura | `CATERING, COFFEE & EVENTOS` |
| Assinatura alt. | `CATERING · EVENTOS & CAFETERIA` |
| Tagline | *Seu evento com sabor e excelência* |
| Promessa | *Transformar seu evento em uma experiência única* |
| Desde | 2019 |
| Web | pieggi.com.br · @pieggieventos |

### Marcas gráficas (assets disponíveis no Drive)

| Asset | Uso na UI |
|---|---|
| `PIEGGI-LOGO-PRETO / BRANCO.png` | Wordmark — header, splash, footer |
| `PIEGGI-SELO-01…06.png` | Selo circular com micro-texto — loaders, badges, watermark |
| Monograma **PG** (ligadura serif) | App icon, avatar, favicon, marca d'água XL |
| Monograma **P.®** | Marca de canto, favicon compacto, stamp de confirmação |
| `PIEGGI-TEXTO-02.png` | Lockup tipográfico da assinatura |

**Regra de ouro:** o **PG** é a única forma "orgânica" do sistema. Ele é a joia.
Use no máximo **um PG visível por tela** (o resto vira watermark a ≤6% opacidade).

---

## 2. Tokens de Cor

Paleta intencionalmente estreita. **Nenhum azul de sistema. Nenhum verde de sucesso genérico.**

```css
:root {
  /* ---- Núcleo (Ink) ---- */
  --pg-ink-900:  #000000;  /* preto absoluto — hero, packaging, splash */
  --pg-ink-800:  #0A0A0A;  /* superfície escura base do app */
  --pg-ink-700:  #141414;  /* cards elevados no dark */
  --pg-ink-600:  #1F1F1F;  /* bordas no dark */

  /* ---- Slate (a cor "assinatura" do rebranding) ---- */
  --pg-slate-700: #4E555F;
  --pg-slate-600: #646C78;  /* ★ SLATE PIEGGI — cor de fundo institucional */
  --pg-slate-500: #7C848F;
  --pg-slate-400: #9AA1AA;
  --pg-slate-300: #BFC4CB;
  --pg-slate-200: #D8DBDF;

  /* ---- Bone (brancos quentes de papel) ---- */
  --pg-bone-100: #F4F3F0;  /* fundo light — papel institucional */
  --pg-bone-050: #FAFAF8;
  --pg-white:    #FFFFFF;

  /* ---- Acento único ---- */
  --pg-emerald:  #0F6E5A;  /* verde profundo — usado com PARCIMÔNIA extrema */
  --pg-emerald-soft: #14806A;

  /* ---- Semânticos (dessaturados de propósito) ---- */
  --pg-success: #0F6E5A;
  --pg-warning: #8A6A2F;
  --pg-danger:  #7A2F2F;
  --pg-info:    var(--pg-slate-600);
}
```

### Distribuição obrigatória (regra 60/30/8/2)

| Peso | Cor | Papel |
|---|---|---|
| 60% | Ink / Bone | Superfície |
| 30% | Slate | Estrutura, seções, chips |
| 8% | Fotografia | Comida = a cor real |
| 2% | Emerald | 1 elemento por jornada, no máximo |

### Gradientes permitidos (apenas 3)

```css
--pg-grad-veil:  linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,.88) 100%);
--pg-grad-slate: linear-gradient(135deg, #7C848F 0%, #4E555F 100%);
--pg-grad-sheen: linear-gradient(100deg,
                 transparent 0%, rgba(255,255,255,.16) 45%,
                 rgba(255,255,255,.16) 55%, transparent 100%);
```

`--pg-grad-veil` é **obrigatório** sob qualquer texto que apoie em foto.

---

## 3. Tipografia

O Drive traz um kit tipográfico completo. Mapeamento funcional:

```css
:root {
  /* Display grotesco — o wordmark e headlines brutais */
  --pg-font-display: "Neue Machine", "Heidrich Sans", "Herokid",
                     "Archivo Expanded", system-ui, sans-serif;

  /* Serif editorial itálica — a alma elegante ("Sobre", "Abrir aqui") */
  --pg-font-editorial: "Magdalena", "Bellise", "Clagio",
                       "Playfair Display", Georgia, serif;

  /* Serif de leitura — corpo institucional */
  --pg-font-serif: "Ethic Serif", "Glory", "EB Garamond", Georgia, serif;

  /* Sans de interface — UI, dados, labels */
  --pg-font-ui: "PGF Elyss Sans Pro", "Heidrich Sans", "Inter",
                -apple-system, sans-serif;

  /* Mono — códigos de pedido, horários */
  --pg-font-mono: "Sarun Mono", "JetBrains Mono", monospace;
}
```

### Escala tipográfica (fluida, clamp)

```css
--pg-t-hero:   clamp(3.5rem, 14vw, 11rem);   /* PIEGGI em tela cheia */
--pg-t-d1:     clamp(2.75rem, 8vw, 6rem);
--pg-t-d2:     clamp(2rem, 5.5vw, 3.75rem);
--pg-t-h1:     clamp(1.75rem, 4vw, 2.5rem);
--pg-t-h2:     1.5rem;
--pg-t-h3:     1.25rem;
--pg-t-body:   1rem;      /* 16px — line-height 1.65 */
--pg-t-sm:     .875rem;
--pg-t-cap:    .75rem;    /* tracking .14em, uppercase */
--pg-t-micro:  .625rem;   /* tracking .22em — micro-labels do selo */
```

### Regras de composição — o "Pieggi Headline Pair"

O padrão editorial mais forte da marca: **palavra leve + palavra display itálica**.

```
Nossa                    ← serif regular, peso 400, escala menor
HISTÓRIA                 ← Didone itálica, escala 1.9×, ligadura/swash
```

```css
.pg-headline__lead {
  font-family: var(--pg-font-serif);
  font-weight: 400;
  font-size: .46em;
  letter-spacing: .01em;
  display: block;
  opacity: .82;
}
.pg-headline__hero {
  font-family: var(--pg-font-editorial);
  font-style: italic;
  font-weight: 500;
  font-size: 1em;
  letter-spacing: -.015em;
  display: block;
  margin-top: -.12em;   /* sobreposição óptica — assinatura da marca */
}
```

Aplicações canônicas: `Sobre o projeto` · `Nossa HISTÓRIA` · `Tipos de SERVIÇO` ·
`Serviço em FEIRAS & CONGRESSOS` · `Cardápios EXCLUSIVOS` · `Abrir aqui`

### Wordmark tipográfico

```css
.pg-wordmark {
  font-family: var(--pg-font-display);
  font-weight: 800;
  letter-spacing: -.045em;     /* muito fechado, quase colidindo */
  text-transform: uppercase;
  font-feature-settings: "ss01" 1;
}
.pg-wordmark sup { font-size: .28em; vertical-align: super; margin-left: .06em; }
```

---

## 4. Espaço, Grid & Forma

```css
/* Escala de espaço base-4 */
--pg-s-1: 4px;   --pg-s-2: 8px;   --pg-s-3: 12px;  --pg-s-4: 16px;
--pg-s-5: 24px;  --pg-s-6: 32px;  --pg-s-7: 48px;  --pg-s-8: 64px;
--pg-s-9: 96px;  --pg-s-10: 128px; --pg-s-11: 192px;

/* Raio — quase reto. A marca é caixa, é embalagem. */
--pg-r-none: 0;
--pg-r-xs:   2px;
--pg-r-sm:   4px;
--pg-r-md:   8px;    /* padrão de cards */
--pg-r-lg:   14px;   /* sheets, modais */
--pg-r-pill: 999px;  /* chips e CTA-pill */

/* Sombras — suaves, difusas, nunca duras */
--pg-sh-1: 0 1px 2px rgba(0,0,0,.06), 0 1px 1px rgba(0,0,0,.04);
--pg-sh-2: 0 4px 16px rgba(0,0,0,.08);
--pg-sh-3: 0 12px 40px rgba(0,0,0,.14);
--pg-sh-4: 0 28px 80px rgba(0,0,0,.22);
--pg-sh-glow-ink: 0 0 0 1px rgba(255,255,255,.08),
                  0 20px 60px rgba(0,0,0,.55);

/* Grid */
--pg-grid-cols: 12;
--pg-gutter: 24px;
--pg-max: 1440px;
--pg-content: 1160px;
--pg-prose: 68ch;
```

**Breakpoints:** `sm 480` · `md 768` · `lg 1024` · `xl 1280` · `2xl 1536`

### O "Split Canvas" — layout assinatura

Metade da apresentação usa **divisão vertical exata em 2 (ou 40/60)** com um lado
Ink e outro Bone/Slate. É o DNA de layout da Pieggi.

```css
.pg-split { display: grid; grid-template-columns: 1fr 1fr; min-height: 100svh; }
.pg-split--offset { grid-template-columns: 4fr 6fr; }
.pg-split > *:first-child { background: var(--pg-ink-900); }
.pg-split > *:last-child  { background: var(--pg-bone-100); }
@media (max-width: 768px) { .pg-split { grid-template-columns: 1fr; } }
```

---

## 5. Padrões Gráficos Nativos

### 5.1 Pattern de Marca (papel de embrulho)
Repetição de `PIEGGI` + `P.` + selo em grid rotacionado. É a textura da marca.

```css
.pg-pattern {
  background-image: url('/brand/pattern-tile.svg');
  background-size: 320px;
  background-repeat: repeat;
  opacity: 1;
}
.pg-pattern--ghost { opacity: .06; }          /* sobre superfícies */
.pg-pattern--ink   { filter: invert(1); }
```

### 5.2 Watermark Monogram XL
O PG gigante cortado pela borda, em 5–8% de opacidade.

```css
.pg-watermark {
  position: absolute; inset: auto auto -18% -12%;
  width: min(70vw, 900px); pointer-events: none;
  opacity: .055; color: currentColor;
}
```

### 5.3 Selo Rotativo
O selo circular gira lentamente — é o "pulso" vivo da marca (ver §7.9).

### 5.4 Kinetic Type Stack
Repetição vertical de `PIEGGI PIEGGI PIEGGI` com tracking negativo, cortada pela viewport.
Usada em hero e transições.

---

## 6. Biblioteca de Componentes

### Botões