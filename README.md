# ServiceAudit

ServiceAudit, çok lokasyonlu işletmelerin bakım ve servis kayıtlarını analiz ederek insan incelemesini gerektirebilecek harcamaları belirleyen açıklanabilir bir karar destek MVP'sidir.

Çalışan ve doğrulanmış bir MVP / kontrollü pilot için hazırlanmış prototiptir. (Üretim ortamına hazır bir SaaS değildir.)

## Problem

Bakım ve servis verileri genellikle Excel veya CSV dosyalarında dağınık haldedir. Bu karmaşıklık içinde olası mükerrer servisler, tekrarlayan arızalar, anormal derecede yüksek servis fiyatları ve garanti süresi içindeki ücretli servis işlemleri gözden kaçabilir.

## Çözüm

**ServiceAudit kesin tasarruf, kayıp veya dolandırıcılık iddia ETMEZ.**

İnceleme adaylarını, kanıtları ve kaynak satırlarıyla birlikte sunar. Nihai karar ve eylem kullanıcıya aittir.

## Nasıl Çalışır?

Kullanıcılar bakım, servis veya garanti verilerini yükler (CSV/XLSX). Sütun eşleştirme ve veritabanına aktarım sonrası, önceden tanımlanmış deterministik kurallar işletilerek "inceleme adayları" (bulgular) oluşturulur. İnsan denetçiler bu bulguları inceleyip durumlarını günceller (İncelenecek -> Doğrulandı veya Geçersiz).

### Önemli Yetenekler

- CSV ve XLSX dosya yükleme
- Çok sayfalı XLSX (Excel) dosyalarından sayfa seçimi
- Sütun eşleştirme ve satır doğrulaması
- Servis ve garanti verilerini birlikte işleyebilme
- Analize hazırlık / veri kalitesi uygunluk kontrolü
- Açıklanabilir bulgu kanıtları (kaynak verilere izlenebilirlik)
- İnsan inceleme iş akışı: İncelenecek / Doğrulandı / Geçersiz
- Yönetici özeti ve dashboard
- Bulgu filtreleri ve Excel'e dışa aktarma (export)
- İçe aktarma (import) geçmişi
- Geri döndürülebilir "Analizden Çıkar / Geri Al" işlevi
- Kuruluş (organization) düzeyinde izole veriler
- Otomatik doğrulama / Playwright QA entegrasyonu
- Pilot dağıtım (deployment) temeli, yedekleme ve geri yükleme dokümantasyonu

## Analizler

Mevcut MVP sürümü aşağıdaki deterministik analiz kurallarını içerir:

1. **Tekrarlayan arıza:** Aynı ekipman ve sorunun kısa süre içinde tekrar etmesi.
2. **Mükerrer servis kaydı:** Aynı veya çok yakın tarihli, kopyalanmış veya mükerrer girilmiş servis kayıtları.
3. **Anormal servis fiyatı:** Şirketin kendi geçmiş benzer kayıtlarına (aynı işlem/parça) göre anormal derecede yüksek servis fiyatları.
4. **Garanti süresinde ücretli servis:** Devam eden garanti süresi içerisinde alınan ve faturalandırılan servis işlemleri.

## Demo Senaryosu

Sistem içerisinde, test ve gösterim amacıyla tamamen **sentetik** bir NovaRetail demosu bulunmaktadır:

- 31 sentetik servis kaydı
- 4 sentetik garanti kaydı
- 4 inceleme adayı (bulgu)
- 41.400 TRY incelenecek toplam servis tutarı

> **Önemli Not:** 41.400 TRY doğrulanmış tasarruf veya kayıp değildir; incelemeye alınan servis kayıtlarının toplamıdır.

## Teknoloji

- Next.js 16
- TypeScript
- PostgreSQL 17
- Drizzle ORM
- Tailwind CSS
- ExcelJS
- Playwright
- Docker / Podman + Caddy dağıtım temeli

## Yerel Çalıştırma

Podman ve yerel PostgreSQL veritabanı gerektirir.

```powershell
.\scripts\dev-start.ps1
```

Bu betik veritabanını başlatır, taşıma (migration) işlemlerini yapar ve [http://localhost:3000](http://localhost:3000) adresinde uygulamayı ayağa kaldırır.

## Doğrulama / Test

Hızlı kod seviyesi doğrulama (Lint, TypeScript, Build):
```powershell
.\scripts\verify.ps1
```

Tam QA süreci (Veritabanı kontrolü, Lint, E2E Testler):
```powershell
.\scripts\qa.ps1
```

## Proje Kapsamı ve Sınırlar

ServiceAudit bir ERP veya CMMS yedeği değildir. Jenerik bir iş akışı oluşturucu veya veri ambarı aracı değildir. Öncelikli hedefi, servis ve bakım maliyetleri içindeki "insan incelemesini hak eden" durumları deterministik olarak gün yüzüne çıkarmaktır.

## Dokümantasyon

Daha detaylı teknik ve operasyonel bilgiler için aşağıdaki dokümanları inceleyebilirsiniz:

- [Ürün Dokümantasyonu (PRODUCT.md)](docs/PRODUCT.md)
- [Mimari (ARCHITECTURE.md)](docs/ARCHITECTURE.md)
- [Dağıtım (DEPLOYMENT.md)](docs/DEPLOYMENT.md)
- [Operasyonlar (OPERATIONS.md)](docs/OPERATIONS.md)
- [Yol Haritası (ROADMAP.md)](docs/ROADMAP.md)

## Demo Videosu

[Demo videosu bağlantısı teslim sonrası buraya eklenecektir.]
