# NexPDV Desktop Auto Update

O canal estavel do desktop usa provider generico do `electron-updater`.

## Variaveis

```env
AUTO_UPDATE_ENABLED=true
UPDATE_CHANNEL=stable
UPDATE_PROVIDER_URL=https://updates.nexpdv.com.br/desktop/stable
NEXPDV_LICENSE_CHECK_INTERVAL_MINUTES=15
NEXPDV_LICENSE_OFFLINE_GRACE_HOURS=72
```

Se `UPDATE_PROVIDER_URL` nao for informado em build empacotado, o app usa `https://updates.nexpdv.com.br/desktop/stable`.

Configuracao tecnica de API Cloud fica oculta no app do cliente. Para atendimento tecnico controlado, inicie o desktop com `NEXPDV_TECH_SUPPORT_MODE=true`.

## Onde hospedar

Hospede estes arquivos no mesmo diretorio publico configurado em `UPDATE_PROVIDER_URL`:

- `latest.yml`
- `NexPDV_Installer_v1.0.2.exe`
- `NexPDV_Installer_v1.0.2.exe.blockmap`

Exemplo final:

```text
https://updates.nexpdv.com.br/desktop/stable/latest.yml
https://updates.nexpdv.com.br/desktop/stable/NexPDV_Installer_v1.0.2.exe
https://updates.nexpdv.com.br/desktop/stable/NexPDV_Installer_v1.0.2.exe.blockmap
```

O `latest.yml` gerado pelo `electron-builder` aponta para o instalador e o `.blockmap`. Mantenha os tres arquivos juntos e publicos.

## Fluxo de validacao

1. Instale a versao anterior em um PC secundario.
2. Publique os tres arquivos da nova versao no provider.
3. Abra o NexPDV.
4. O app verifica atualizacao ao iniciar e tambem em `Configuracoes > Atualizacao`.
5. Ao baixar, o app pede para reiniciar e instalar.

O NSIS atualiza por cima e preserva `userData`, banco local, configuracao em `ProgramData`, licenca e demais dados locais.
