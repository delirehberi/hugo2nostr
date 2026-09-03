# hugo2nostr

[![nostr.org.tr](https://img.shields.io/badge/nostr.org.tr-Una%20iniciativa%20comunitaria%20de%20nostr.org.tr-7057ff?logo=nostr)](https://nostr.org.tr)
[![Tests](https://github.com/delirehberi/hugo2nostr/actions/workflows/test.yml/badge.svg)](https://github.com/delirehberi/hugo2nostr/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org)

[English](README.md) • [Türkçe](README.tr.md) • [Español](README.es.md)

Publica entradas de blog estático de [Hugo](https://gohugo.io) en la red [Nostr](https://nostr.com) como artículos de formato largo NIP-23 (`kind:30023`), sincroniza publicaciones desde los relays y gestiona eliminaciones — todo desde una única CLI.

## Características

- 🚀 **Publicar en Nostr**: Convierte publicaciones de Hugo (Markdown + frontmatter YAML/TOML) en artículos NIP-23.
- 🔄 **Sincronización Bidireccional**: Descarga artículos publicados en relays de Nostr de vuelta al contenido de Hugo.
- 🌐 **Multi-Sitio**: Gestiona múltiples publicaciones de Hugo desde una sola configuración.
- 🖼️ **Gestión de Medios**: Sube automáticamente imágenes de portada a nostr.build mediante autenticación NIP-98.
- 🧩 **Conversión de Shortcodes**: Resuelve shortcodes de Hugo (`youtube`, `figure`, personalizados) a Markdown/HTML.
- 🗑️ **Gestión del Ciclo de Vida**: Marca publicaciones para eliminación o purga todos los eventos publicados.

## Inicio Rápido

### Requisitos previos
- Node.js 22+
- Un blog en Hugo y una clave privada de Nostr (`nsec1...`)

```bash
git clone https://github.com/delirehberi/hugo2nostr.git
cd hugo2nostr
make install

# 1. Configuración interactiva (rutas de sitios, relays y clave privada)
make init

# 2. Vista previa o ejecución en seco (Dry-Run)
make preview
make dry-run

# 3. Publicar en relays
make publish
```

## Configuración

La configuración se guarda en `~/.config/hugo2nostr/config.yaml` y los secretos en `~/.config/hugo2nostr/secrets` (permisos `0600`).

```yaml
default_site: myblog
sites:
  myblog:
    posts_dir: ~/blog/content/posts
    blog_url: https://example.com
relays:
  - wss://relay.damus.io
  - wss://nos.lol
  - wss://relay.primal.net
image_host: nostr.build
author_id: you@example.com   # Soporta identificador NIP-05, npub o clave pública hex
```

> **Alternativa CI/CD**: También puedes configurar mediante variables de entorno: `POSTS_DIR`, `RELAY_LIST`, `BLOG_URL`, `NOSTR_PRIVATE_KEY` y `DRY_RUN=1`.

## Comandos Comunes

| Comando | Acción |
|---|---|
| `make publish` | Publica entradas en los relays configurados (recompila automáticamente) |
| `make dry-run` | Simula la publicación sin transmitir eventos |
| `make preview` | Muestra una vista previa en HTML formateado en la terminal |
| `make sync` | Sincroniza artículos remotos de Nostr hacia markdown de Hugo |
| `make delete` | Elimina publicaciones marcadas con `delete: true` en el frontmatter |
| `make delete-all` | Purga todos los artículos publicados de los relays |
| `make debug-sync` | Diagnostica la conectividad de relays y resolución de clave pública NIP-05 |

**Opciones de CLI** (pasar mediante `ARGS="..."`, ej.: `make publish ARGS="--site notes -v"`):
`--site <nombre>`, `--all`, `-v` (detallado), `-q` (silencioso), `-y` (confirmar todo automáticamente), `--delay=<ms>`.

## Referencia de Frontmatter

`hugo2nostr` reconoce y escribe los siguientes campos de frontmatter:

```yaml
---
title: Título de Mi Artículo
slug: slug-de-mi-articulo      # Identificador de etiqueta 'd' de Nostr
date: 2024-01-15               # Marca de tiempo de publicación
tags: [nostr, bitcoin]        # Convertidos a etiquetas 't' de Nostr
description: Texto de resumen  # Resumen del artículo
hero_image: /images/cover.jpg  # Subida automática a nostr.build
nostr_id: nevent1...          # (Auto-escrito) ID del evento Nostr
nostr_image: https://...       # (Auto-escrito) URL de la imagen alojada
delete: false                  # Establecer en true para eliminar con `make delete`
---
```

## Desarrollo

```bash
make test          # Ejecutar suite de pruebas (Jest)
make test-watch    # Ejecutar pruebas en modo de observación
make dev           # Ejecutar código fuente TypeScript directamente con ts-node
make rebuild       # Limpiar dist/ y compilar TypeScript
```

## Contribuir

1. Haz un fork del repositorio y crea una rama para tu función (`git checkout -b feat/mi-funcion`).
2. Ejecuta las pruebas y verifica que la compilación sea limpia (`make test && make rebuild`).
3. Envía un pull request.

## Enlaces Rápidos

- 🌐 [nostr.org.tr](https://nostr.org.tr)
- 📄 [Especificación NIP-23: Contenido de Formato Largo](https://github.com/nostr-protocol/nips/blob/master/23.md)
- 📦 [Repositorio en GitHub](https://github.com/delirehberi/hugo2nostr)

## Licencia

[MIT](LICENSE)
