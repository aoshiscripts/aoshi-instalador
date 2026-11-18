# Aoshi Pro Desktop

Navegador para Windows com o Aoshi Pro já embutido.

- **Abas com proxy próprio:** cada aba usa um perfil (HTTP, HTTPS ou SOCKS5, com usuário e senha opcionais). Perfis diferentes têm cookies e login separados.
- **Aoshi Pro sempre atualizado:** o script é baixado do repositório privado com o seu token de leitura do GitHub (guardado cifrado só no seu computador). A cada 5 minutos o programa confere se há versão nova.
- **Programa atualizado sozinho:** novas versões publicadas em Releases são baixadas e instaladas automaticamente.

## Instalar

Baixe `AoshiPro-Setup-x.y.z.exe` na página **Releases** do repositório aoshiscripts/aoshi-instalador e execute.

Na primeira abertura, cole o token de leitura do GitHub (o mesmo do instalador do Tampermonkey).

## Atalhos

- `Ctrl+T` nova aba · `Ctrl+W` fecha a aba · `F5` recarrega · `F12` ferramentas de desenvolvedor
- Clique com o botão direito numa aba (ou no proxy, ao lado do endereço) para trocar o proxy dela.

## Publicar uma versão nova do programa

Suba a versão em `package.json` e crie a tag correspondente (ex.: `v1.0.1`). O GitHub Actions gera o instalador e publica em Releases.
