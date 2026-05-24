# NexPDV Desktop Auto Update

O canal estavel do desktop usa GitHub Releases com `electron-updater`.

## Variaveis

```env
AUTO_UPDATE_ENABLED=true
UPDATE_CHANNEL=stable
GH_OWNER=ZEROH16
GH_REPO=nexpdv-system
NEXPDV_LICENSE_CHECK_INTERVAL_MINUTES=15
NEXPDV_LICENSE_OFFLINE_GRACE_HOURS=72
```

Se `GH_OWNER` ou `GH_REPO` nao forem informados, o app usa `ZEROH16/nexpdv-system`.

Configuracao tecnica de API Cloud fica oculta no app do cliente. Para atendimento tecnico controlado, inicie o desktop com `NEXPDV_TECH_SUPPORT_MODE=true`.

## Onde publicar

Publique estes arquivos como assets da release publica do GitHub:

- `latest.yml`
- `NexPDV_Installer_v1.0.2.exe`
- `NexPDV_Installer_v1.0.2.exe.blockmap`

Exemplo final:

```text
https://github.com/ZEROH16/nexpdv-system/releases/latest/download/latest.yml
https://github.com/ZEROH16/nexpdv-system/releases/latest/download/NexPDV_Installer_v1.0.2.exe
https://github.com/ZEROH16/nexpdv-system/releases/latest/download/NexPDV_Installer_v1.0.2.exe.blockmap
```

O `latest.yml` gerado pelo `electron-builder` aponta para o instalador e o `.blockmap`. Mantenha os tres arquivos na mesma release e publicos. Para o canal estavel, o arquivo esperado pelo GitHub provider continua sendo `latest.yml`.

Se uma versao ja foi publicada e o instalador foi regerado com a mesma versao, substitua os tres assets da release. O `latest.yml` precisa ter o mesmo `sha512` e `size` do instalador publicado.

Instalacoes antigas que foram empacotadas apontando para outro provider continuam tentando o provider antigo ate receberem um build corrigido. Para atualizar essas maquinas sem instalacao manual, mantenha um redirecionamento/servidor temporario no provider antigo apontando para os mesmos assets do GitHub, ou instale uma vez o build corrigido.

## Fluxo de validacao

1. Instale a versao anterior em um PC secundario.
2. Publique os tres arquivos da nova versao em GitHub Releases.
3. Abra o NexPDV.
4. O app verifica atualizacao ao iniciar e tambem em `Configuracoes > Atualizacao`.
5. Ao baixar, o app instala e reinicia automaticamente.

O NSIS atualiza por cima e preserva `userData`, banco local, configuracao em `ProgramData`, licenca e demais dados locais.
