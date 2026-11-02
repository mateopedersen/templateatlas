# TemplateAtlas yönetim rehberi

## Yerel kurulumu açma

Bu sürüm seçilen Mac'te yerel Cloudflare Workers motoruyla çalışır. Tarayıcıda [TemplateAtlas](http://localhost:4321/) adresini açın. Taşınabilir özel kurulum ZIP’ini açtıysanız kök klasördeki **TemplateAtlas Baslat.command** dosyasını çift tıklayın. Terminal açık kaldığı sürece site çalışır. Kapatmak için o pencerede Control-C kullanın.

İlk kurulum Node.js 24, npm ve ağ üzerinden indirilen açık kaynak paketlerini kullanır. Yerel depoların kurulumu için bir Cloudflare hesabı veya token gerekmez. PDF ve JPEG dönüştürme için Python 3, pypdf, LibreOffice ve Poppler gerekir. Başlatıcı bu Mac’teki Codex çalışma ortamını keşfeder. Başka bir sistemde aynı araçları PATH'e ekleyin ve gerekirse TEMPLATEATLAS_PYTHON değişkenini uygun Python çalıştırıcısına ayarlayın. Kod deposunu tek başına indiren kişinin özel katalog dosyalarını da ayrıca temin etmesi gerekir.

## Kataloğu kullanma

Şablonları **Templates** üzerinden veya arama alanından açın. Konu sayfasında düzenleme kontrolleri soldadır. **Download template** doğrulanmış orijinali indirir. **Customize this template** belgenin gerçek alanlarını açar. Kullanıcı dosyaları ayrı bir özel depoya yazılır. Düzenlemeden önceki katalog sürümü, kişisel belgenin kaydında tutulur.

**Chart Studio** içinde veriyi tabloya yazabilir veya bir CSV/TSV ya da desteklenen XLSX veri sayfasını içe aktarabilirsiniz. Sağdaki grafik ve veri tablosu aynı veriyi kullanır. **Review** adımında yalnız seçilen grafik için üretilen biçimler listelenir. **Form Studio** alan türü, zorunluluk, seçenek ve sıra bilgilerini koruyan bir yazdırılabilir form üretir.

## Yerel hesap ve e-posta denemesi

Bir test adresiyle kayıt olun, örneğin **reader@example.test**. Bu modda mesajlar bilgisayardaki şifreli test posta kutusuna düşer. ZIP içindeki **Test Posta Kutusu.command** dosyasını açın. İlgili mesajdan doğrulamayı tamamlayın. Üretim posta kutularına e-posta gönderilmez. Parola sıfırlamayı da aynı yolla deneyebilirsiniz.

Bir misafir beş farklı mantıksal kaynak seçebilir. Bir belgenin farklı biçimleri ve yeniden indirilmesi aynı seçimi kullanır. Doğrulanan hesapta 30 × 24 saatlik deneme sunucu saatinde bir defa başlar. İlk ücretsiz seçimler korunur. Denemenin bitmesi otomatik tahsilat başlatmaz. Hesap ayarlarından kişisel verileri alma ve hesap kapatma abonelikten bağımsızdır.

## Yerel yönetici erişimi

İlk açılıştan sonra **Yonetici Kur.command** dosyasını çalıştırın. Özel kurulum sayfasındaki anahtarı zaman tabanlı doğrulayıcınıza ekleyin. Anahtarı güvenli yerde saklayın. Kurulum sayfasını kapatıp geçici kayıt dosyasını yönergede gösterildiği şekilde kaldırın. Önizlemeyi durdurup yeniden başlatın. **Yonetim Panelini Ac.command** dosyasını açıp doğrulayıcıdaki altı haneli kodu girin.

Aynı işlemlerin kaynak klasöründeki karşılıkları `node scripts/local-operator.mjs setup` ve `node scripts/local-operator.mjs open` komutlarıdır. Yönetim ekranı Catalog, Jobs, Members ve Audit bölümlerini içerir. Bir dosyanın teslimini durdurduğunuzda gerekçe girilir. Tekrar açarken sistem R2 içeriğini ve sürümünü kontrol eder. Destek talepleri yerel veritabanına yazılır. Jobs üzerinden izlenir. Üretim yönetimi için ayrı Cloudflare Access yapılandırması ve ikinci faktör gerekir.

## Yeni içerik veya revizyon

1. Özel üretim alanında konu kimliğini, konu ve ayrıntı adreslerini belirleyin. Aynı konuya yeni dosya biçimi eklendiğinde şablon kimliğini koruyun.
2. Ana dosyayı konuya uygun native uygulamada üretin. Gerekli formülleri, tarihleri, veri kaynağını ve düzenlenebilir öğeleri kontrol edin.
3. PDF ve önizlemeyi aynı ana dosyadan oluşturun. Her dosyanın MIME, boyut ve SHA-256 değerini özel kayıt dosyasına yazın. Hatalı çıktı varsa bu sürümü yayına açmayın.
4. Kayıtların gizli olmayan bölümünü `python3 scripts/prepare-release.py /tam/yol/index.json` ile üretin. İlgili kaynağı, baskı boyutunu ve yerleşim bilgisini doğrulayın. Kaynak briefi, takip edilen özel özgün dosya ve kullanıcı verisi public depoya konmaz.
5. Önce `npm run local:load -- /tam/yol/index.json` ile yerel nesneleri ve veritabanını güncelleyin. Arama indeksini `node src/search/load-local.mjs /tam/yol/paper.json` ile oluşturun. `npm run check`, `npm test` ve `npm run build` çalıştırın. Başlatıcıyı yeniden açın.
6. Dosya ve sayfa kanıtını doğrulayın. `node scripts/verify-store.mjs .wrangler/state sonuc.json` bütün etkin dosyaları özel depodan okuyup boyut, MIME ve içerik özetini karşılaştırır. `node scripts/crawl-local.mjs http://localhost:4321 yollar.json` sabit sayfaları ve tek atımlı yönlendirmeleri kontrol eder.

## Yedek ve geri dönüş

Kişisel belge, hesap, deneme hakkı, yönetim oturumu ve özel dosyalar aynı yayın sınırında ele alınır. Önizlemeyi durdurun. Uygulama klasöründe `python3 scripts/checkpoint.py backup /ozel/yol/templateatlas-backup.zip .wrangler` çalıştırın. Yedek oturum anahtarlarını ve kullanıcı verisini içerir. Erişimi kısıtlı ve tercihen şifreli bir alanda saklayın.

Geri yüklemeyi yeni bir klasöre yapın. `python3 scripts/checkpoint.py restore /ozel/yol/templateatlas-backup.zip /ozel/yol/yeni-kurulum/.wrangler` arşivdeki her dosyanın özetini denetler. Aynı uygulama sürümüyle yeni klasörü çalıştırıp dosyaları tekrar doğrulayın. Mevcut durum dizinine geri yükleme yapılmaz. Yerel provada ayrı depoya geri yüklenen 2.508 dosyanın tamamı doğrulandı.

Kod sürümünü geri alırken önceki Git commitini ve o sürümün katalog manifestini ayrı klasörde açın. Şema uyumunu ve seçilmiş bir dosyanın baytlarını sınayın. İnceleme bitmeden eski kopyayı asıl çalışma klasörünün yerine koymayın. Üretim ödemesi açılırsa geri yükleme sonrası sağlayıcının güncel abonelik durumuyla yeniden eşitleme gerekir.

## Canlı işletim

### Ek tasarım koleksiyonları

R-134a ek koleksiyonu `src/data/imported-collections.json` içinde 100 sabit tasarım kimliğiyle tanımlıdır. Ana konu adresi korunur; her tasarımın kendi ayrıntı adresi, İngilizce başlığı ve açıklaması bulunur. PDF ve Image biçimleri aynı kimliği kullandığı için aynı tasarımın ikinci biçimi yeni ücretsiz seçim sayılmaz.

Dosyaların tamamı R2'dedir. `assets.templateatlas.com` yalnız manifestte açıkça listelenen küçük önizlemeleri ve yöntem/lisans belgelerini sunar. PDF ve tam boy WebP asılları özel katalog alanında kalır ve imzalı indirme akışıyla verilir. Public kod deposu orijinal dosyaları içermez.

Ek aktarım, mevcut 1.146 konuluk katalog sürümünü değiştirmeden yeni dosyaları ve yeni arama sürümünü hazırlar. Üretim dağıtımı önce tüm ek dosya kayıtlarını ve hazırlanmış arama sürümünü doğrular; Worker başarıyla yayımlandıktan sonra aramayı karşılaştırmalı güncellemeyle etkinleştirir. Önceki dosyalar ve arama sürümü geri dönüş için korunur. Özel aktarım alanındaki kaynak ZIP, SHA-256 kayıtları ve tamamlanmış R2 doğrulama makbuzları korunmalı; aynı dosyalar yeniden üretilmemelidir.

Ana adres [templateatlas.com](https://templateatlas.com/). `www` aynı yolu koruyarak ana adrese 301 ile yönlenir. Canlı servis bilgisayar kapalıyken de çalışır. Ana Worker `templateatlas`, veritabanı `templateatlas-production`. Asıl dosyalar `templateatlas-production-originals`, kişisel belgeler `templateatlas-production-documents` adlı özel R2 alanındadır. Genel dosya URL’leri kapalıdır. Şablonlar yalnızca uygulamanın imzalı indirme bağlantılarıyla teslim edilir.

1. Sağlığı `/api/health` üzerinden izleyin. Dağıtım geçmişi Cloudflare Workers içindeki TemplateAtlas ekranındadır. Beş dakikalık zamanlayıcı bekleyen işleri ve saklama sürelerini işler.
2. Yeni sürüm için `main` dalını açın. Node 24 ile `npm ci`, `npm run check` ve `npm test` çalıştırın. Kaynak ve dosya deposu aynı sürümü gösterdiğinde yetkili oturumla `npm run deploy:production` çalıştırın. Bu komut uzaktaki katalog özeti ve dosya sayıları eşleşmeden dağıtıma geçmez. GitHub bağlantısı mevcuttur. Otomatik Cloudflare Builds kapalıdır.
3. Canlı sürümü `node scripts/smoke-production.mjs /ozel/yol/indirme.json` ve `node scripts/crawl-local.mjs https://templateatlas.com /ozel/yol/adresler.json` ile doğrulayın. Kişisel grafik ve önizleme için `renderer/smoke-release.py` kullanılır. Dönüştürücünün tek örneği boşta kalınca uyur. Ayrıntılar [dönüştürücü rehberinde](renderer/README.md).
4. E-posta göndereni `accounts@notify.templateatlas.com`. SPF, DKIM ve DMARC bu alt alandadır. Gelen kutusu kontrolü için kendi adresinizle [kayıt](https://templateatlas.com/signup/) sayfasını açıp doğrulama bağlantısını izleyin. Deneme süresi ilk doğrulamadan itibaren 30 gündür. Ödeme kapalı olduğundan deneme sonunda tahsilat yapılmaz. Yönetim ekranı ve API erişimi de kapalıdır.
5. Geri dönüşte önceki Worker sürümünün aynı katalog ve şemayla uyumlu olduğunu doğrulayın. Cloudflare Deployments bölümünden uyumlu sürüme dönüp sağlık ve indirme testlerini çalıştırın. D1 Time Travel kurtarma işaretini ve özel katalog arşivini ayrı koruyun. Veritabanını geçmişe döndürmek o tarihten sonraki üyelikleri ve belge değişikliklerini de etkiler. Katalog geri yükleme adımları özel işletim paketinde bulunur.
6. Worker sırlarını Cloudflare Secrets içinde yönetin. Üretim imza anahtarlarının sahip kopyasını güvenli, çevrimdışı yedekte saklayın. Genel depoya ve müşteri destek kayıtlarına anahtar eklemeyin. Yönetim ekranı kapalıyken gelen destek talepleri Cloudflare D1 içindeki `support_requests` tablosundan yetkili hesapla incelenebilir.

## Yerel denemeler ve katalog güvenliği

Katalog açılmadan önce kurulumun doğrulama özeti uygulamanın beklediği sürümle eşleşmelidir. Yarım kalan veya yanlış sürümdeki bir aktarım sırasında katalog erişimi durur. Aynı özel indeksle yükleme yeniden başlatıldığında eşleşen nesneler tekrar yazılmaz. Arama indeksinin etkinleşmesi ayrı bir sürüm kontrolünden geçer.

Form Studio'nun PDF çıktısında gerçek doldurulabilir alanlar bulunur. Venn aracında düzenlenebilir PowerPoint çıktısı, program aracında Excel ve takvim etkinlikleri için ICS desteği vardır. Kişisel belgeler üzerinde yaptığınız değişikliğin ilk sayfasını önizlemek için düzenleme panelindeki önizleme eylemini kullanın. Bu düşük çözünürlüklü önizleme indirme hakkı tüketmez.

Yeni kurulumda yönetici ikinci faktörünü kendiniz eşleyin. Çalışır kurulum yedeği ayrı bir işlemdir. Dağıtılan özel ZIP mevcut hesapları, özel kullanıcı belgelerini veya yönetici sırlarını içermez. Teknik kanıtların ve üretim durumunun ayrıntıları **TemplateAtlas-Kabul-Raporu.html** dosyasındadır.
