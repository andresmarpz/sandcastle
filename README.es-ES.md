

# Sandcastle

Una aplicación de escritorio para gestionar worktrees de git y espacios de trabajo de agentes basados en terminal. Construida con Electron, React y TypeScript en un monorepo pnpm + Turborepo.

## Descarga e instalación

Obtén la última versión para tu plataforma desde la página de [**Lanzamientos**](https://github.com/andresmarpz/sandcastle/releases/latest).

| Plataforma | Archivo |
| --- | --- |
| macOS (Apple Silicon) | `sandcastle-<version>-arm64.dmg` |
| macOS (Intel) | `sandcastle-<version>-x64.dmg` |
| Windows | `sandcastle-<version>-setup-*.exe` |
| Linux | `sandcastle-<version>-*.AppImage` o `.deb` |

### macOS — primer inicio

Estas compilaciones **aún no están firmadas con una Apple Developer ID**, por lo que Gatekeeper de macOS bloqueará el primer inicio. Para abrirlo una vez:

1. Abre el archivo `.dmg` y arrastra **Sandcastle** a **Aplicaciones**.
2. En Finder, haz **clic derecho** (o Control+clic) en `Sandcastle.app` → **Abrir**, y luego confirma **Abrir** en el cuadro de diálogo.

   Si macOS indica que la aplicación está *"dañada"* (esto ocurre con aplicaciones descargadas y sin firmar), elimina el atributo de cuarentena una vez:

   ```bash
   xattr -dr com.apple.quarantine /Applications/Sandcastle.app
   ```

Tras el primer inicio, se abrirá normalmente. La firma y notificación ya están configuradas y eliminarán este paso por completo una vez que se agreguen las credenciales de Apple Developer (ver [Publicación](#releasing)).

## Desarrollo

```bash
pnpm install
pnpm dev          # run the desktop app with HMR
pnpm quality      # typecheck + biome check
pnpm build        # production build
```

## Publicación

Las versiones se generan mediante GitHub Actions (`.github/workflows/release.yml`):

1. Actualiza la versión en el `package.json` raíz y en `apps/desktop/package.json`.
2. Etiqueta y sube los cambios: `git tag v<version> && git push origin v<version>`.
3. El flujo de trabajo compila los instaladores para macOS (arm64 + x64), Windows y Linux, los sube a un borrador de GitHub Release y luego los publica.

### Habilitar la firma de código + notificación para macOS

El flujo de publicación ya pasa las variables de entorno de firma. Para generar compilaciones aprobadas por Gatekeeper, agrega estos secretos del repositorio:

| Secreto | Descripción |
| --- | --- |
| `MAC_CSC_LINK` | certificado `.p12` de Developer ID Application codificado en base64 |
| `MAC_CSC_KEY_PASSWORD` | contraseña para ese `.p12` |
| `APPLE_ID` | correo electrónico de Apple ID |
| `APPLE_APP_SPECIFIC_PASSWORD` | contraseña específica para la app para la notificación |
| `APPLE_TEAM_ID` | ID de equipo de Apple Developer |

Luego establece `mac.notarize: true` en `apps/desktop/electron-builder.yml`. No se requieren otros cambios.
