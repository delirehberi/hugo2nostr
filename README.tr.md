# hugo2nostr

[![nostr.org.tr](https://img.shields.io/badge/nostr.org.tr-Bir%20nostr.org.tr%20topluluk%20giri%C5%9Fimidir-7057ff?logo=nostr)](https://nostr.org.tr)
[![Tests](https://github.com/delirehberi/hugo2nostr/actions/workflows/test.yml/badge.svg)](https://github.com/delirehberi/hugo2nostr/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org)

[English](README.md) • [Türkçe](README.tr.md) • [Español](README.es.md)

[Hugo](https://gohugo.io) statik blog yazılarınızı [Nostr](https://nostr.com) ağına NIP-23 (`kind:30023`) uzun formatlı makaleler olarak yayınlayın, rölelerden yazıları geri senkronize edin ve silme işlemlerini tek bir CLI arayüzünden yönetin.

## Özellikler

- 🚀 **Nostr'a Yayınlama**: Hugo yazılarını (Markdown + YAML/TOML frontmatter) NIP-23 makalelerine dönüştürür.
- 🔄 **Çift Yönlü Senkronizasyon**: Nostr rölelerinde yayınlanmış makaleleri Hugo içeriğinize geri çeker.
- 🌐 **Çoklu Site**: Tek bir yapılandırmadan birden fazla Hugo yayını yönetin.
- 🖼️ **Medya Yönetimi**: Kapak görsellerini NIP-98 kimlik doğrulamasıyla otomatik olarak nostr.build'e yükler.
- 🧩 **Shortcode Dönüştürme**: Hugo shortcode'larını (`youtube`, `figure`, özel) Markdown/HTML biçimine dönüştürür.
- 🗑️ **Yaşam Döngüsü Yönetimi**: Yazıları silinmek üzere işaretleyin veya yayınlanan tüm etkinlikleri temizleyin.

## Hızlı Başlangıç

### Gereksinimler
- Node.js 22+
- Bir Hugo blogu ve Nostr gizli anahtarı (`nsec1...`)

```bash
git clone https://github.com/delirehberi/hugo2nostr.git
cd hugo2nostr
make install

# 1. Etkileşimli kurulum (site yolları, röleler ve gizli anahtar yapılandırması)
make init

# 2. Önizleme veya Test Çalıştırması (Dry-Run)
make preview
make dry-run

# 3. Rölelere yayınlama
make publish
```

## Yapılandırma

Yapılandırma dosyası `~/.config/hugo2nostr/config.yaml` konumunda ve gizli anahtarlar `~/.config/hugo2nostr/secrets` konumunda saklanır (izin: `0600`).

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
author_id: you@example.com   # NIP-05 tanımlayıcısı, npub veya hex açık anahtar desteklenir
```

> **CI/CD Alternatifi**: Ortam değişkenleri ile de yapılandırabilirsiniz: `POSTS_DIR`, `RELAY_LIST`, `BLOG_URL`, `NOSTR_PRIVATE_KEY` ve `DRY_RUN=1`.

## Sık Kullanılan Komutlar

| Komut | Açıklama |
|---|---|
| `make publish` | Yazıları yapılandırılmış rölelere yayınlar (otomatik derler) |
| `make dry-run` | Etkinlikleri yayınlamadan simülasyon yapar |
| `make preview` | Terminalde biçimlendirilmiş HTML önizlemesi sunar |
| `make sync` | Uzaktaki Nostr makalelerini Hugo markdown dosyalarına geri senkronize eder |
| `make delete` | Frontmatter'da `delete: true` olarak işaretlenen yazıları siler |
| `make delete-all` | Yayınlanan tüm makaleleri rölelerden temizler |
| `make debug-sync` | Röle bağlantısını ve NIP-05 açık anahtar çözümlemesini test eder |

**CLI Bayrakları** (`ARGS="..."` ile iletilir, örn: `make publish ARGS="--site notes -v"`):
`--site <ad>`, `--all`, `-v` (ayrıntılı), `-q` (sessiz), `-y` (onayları otomatik geç), `--delay=<ms>`.

## Frontmatter Referansı

`hugo2nostr` aşağıdaki frontmatter alanlarını tanır ve yazar:

```yaml
---
title: Makale Başlığım
slug: makale-basligim          # Nostr 'd' etiketi tanımlayıcısı
date: 2024-01-15               # Yayınlanma zaman damgası
tags: [nostr, bitcoin]        # Nostr 't' etiketlerine dönüştürülür
description: Özet metni        # Makale özeti
hero_image: /images/cover.jpg  # Otomatik olarak nostr.build'e yüklenir
nostr_id: nevent1...          # (Otomatik yazılır) Nostr etkinlik kimliği
nostr_image: https://...       # (Otomatik yazılır) Barındırılan görsel URL'si
delete: false                  # `make delete` ile silmek için true yapın
---
```

## Geliştirme

```bash
make test          # Test paketini çalıştırır (Jest)
make test-watch    # Testleri izleme modunda çalıştırır
make dev           # ts-node üzerinden TypeScript kaynak kodunu doğrudan çalıştırır
make rebuild       # dist/ klasörünü temizler ve TypeScript'i derler
```

## Katkıda Bulunma

1. Depoyu forklayın ve bir özellik dalı oluşturun (`git checkout -b feat/ozellik-adi`).
2. Testleri çalıştırın ve sorunsuz derlendiğinden emin olun (`make test && make rebuild`).
3. Bir pull request gönderin.

## Hızlı Bağlantılar

- 🌐 [nostr.org.tr](https://nostr.org.tr)
- 📄 [NIP-23: Uzun Formatlı İçerik Belirtimi](https://github.com/nostr-protocol/nips/blob/master/23.md)
- 📦 [GitHub Deposu](https://github.com/delirehberi/hugo2nostr)

## Lisans

[MIT](LICENSE)
