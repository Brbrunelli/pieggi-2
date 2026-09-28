# Front base — largue os arquivos aqui

Jogue nesta pasta o template/design que você quer usar como base.
Pode ser pasta inteira, zip descompactado, o que for.

## O que funciona melhor (do melhor para o pior)

1. **Template em React + Tailwind** (shadcn/ui, Tailwind UI, Flowbite, Preline…)
   → é o mesmo que o sistema usa hoje; adaptação direta, quase sem retrabalho.

2. **Template em HTML + CSS** (qualquer um)
   → eu converto para componentes React mantendo o visual.

3. **Print de tela / Figma / link de um site**
   → dá para fazer, mas eu reconstruo "no olho". Fica mais lento e menos fiel.

## O que eu preciso saber junto

- Tem alguma tela que você quer **igual** (login, dashboard, tabela)?
- Cores da Pieggi: usar o preto/laranja da marca ou o que vier no template?
- Alguma tela do sistema atual que você quer **manter como está**?

## O que NÃO muda

Nada de regra de negócio. O motor fica onde está:

- `src/engine/` — cardápio, quantidades, CMV, roteamento das comandas, compras
- `src/lib/` — geração de .pptx, .docx, PDF e planilha
- as consultas ao Supabase

O front novo só troca **como as coisas aparecem**. Cálculo, regra e documento
gerado continuam exatamente os mesmos.
