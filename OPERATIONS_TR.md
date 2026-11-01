# TemplateAtlas yönetim rehberi

## Kurulumu açma

Bu sürüm seçilen Mac'te yerel Cloudflare Workers motoruyla çalışır. Tarayıcıda [TemplateAtlas](http://localhost:4321/) adresini açın. Taşınabilir özel kurulum ZIP’ini açtıysanız kök klasördeki **TemplateAtlas Baslat.command** dosyasını çift tıklayın. Terminal açık kaldığı sürece site çalışır. Kapatmak için o pencerede Control-C kullanın.

İlk kurulum Node.js 24, npm ve ağ üzerinden indirilen açık kaynak paketlerini kullanır. Yerel depoların kurulumu için bir Cloudflare hesabı veya token gerekmez. PDF ve JPEG dönüştürme için Python 3, pypdf, LibreOffice ve Poppler gerekir. Başlatıcı bu Mac’teki Codex çalışma ortamını keşfeder. Başka bir sistemde aynı araçları PATH'e ekleyin ve gerekirse TEMPLATEATLAS_PYTHON değişkenini uygun Python çalıştırıcısına ayarlayın. Kod deposunu tek başına indiren kişinin özel katalog dosyalarını da ayrıca temin etmesi gerekir.

## Kataloğu kullanma

Şablonları **Templates** üzerinden veya arama alanından açın. Konu sayfasında düzenleme kontrolleri soldadır. **Download template** doğrulanmış orijinali indirir. **Customize this template** belgenin gerçek alanlarını açar. Kullanıcı dosyaları ayrı bir özel depoya yazılır. Düzenlemeden önceki katalog sürümü, kişisel belgenin kaydında tutulur.

**Chart Studio** içinde veriyi tabloya yazabilir veya bir CSV/TSV ya da desteklenen XLSX veri sayfasını içe aktarabilirsiniz. Sağdaki grafik ve veri tablosu aynı veriyi kullanır. **Review** adımında yalnız seçilen grafik için üretilen biçimler listelenir. **Form Studio** alan türü, zorunluluk, seçenek ve sıra bilgilerini koruyan bir yazdırılabilir form üretir.

## Yerel hesap ve e-posta denemesi

Bir test adresiyle kayıt olun, örneğin **reader@example.test**. Bu modda mesajlar bilgisayardaki şifreli test posta kutusuna düşer. ZIP içindeki **Test Posta Kutusu.command** dosyasını açın. İlgili mesajdan doğrulamayı tamamlayın. Üretim posta kutularına e-posta gönderilmez. Parola sıfırlamayı da aynı yolla deneyebilirsiniz.

Bir misafir beş farklı mantıksal kaynak seçebilir. Bir belgenin farklı biçimleri ve yeniden indirilmesi aynı seçimi kullanır. Doğrulanan hesapta 30 × 24 saatlik deneme sunucu saatinde bir defa başlar. İlk ücretsiz seçimler korunur. Denemenin bitmesi otomatik tahsilat başlatmaz. Hesap ayarlarından kişisel verileri alma ve hesap kapatma abonelikten bağımsızdır.

## Yönetici erişimi

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

## Canlı yayın koşulları

Seçilen Cloudflare hesabının R2 yazma, R2 depolama ve Workers işlem süresi kullanımı dahil kotayı geçmişti. Bu nedenle çalışır sistem, e-posta testleri ve dosyalar yerelde tutuldu. İki özel R2 alanı ile bir ön yayın D1 veritabanı ayrıldı. Üretim alan adına yönlendirme ve uzakta ücret doğurabilecek dosya yüklemesi yapılmadı.

Canlıya geçiş için önce maliyet koşulu çözülmeli. Ardından ayrı ortam veritabanı, özel R2 alanları, yetkili yönetim, doğrulanmış bir e-posta göndereni, çalışan özel dönüştürücü ve destek/işletme bilgileri gerekir. Canlı üyelik fiyatı ve ödeme sağlayıcısı tanımlandığında gerçek USD Price kimliklerini kullanın. Bu çalışmada fiyat belirlenmedi ve canlı tahsilat açılmadı. DNS/MX kayıtlarını, SSL’i, alan adı yönlendirmelerini, webhook imzalarını ve gerçek dosya teslimini o ortamda yeniden test edin.

## Yerel denemeler ve katalog güvenliği

Katalog açılmadan önce kurulumun doğrulama özeti uygulamanın beklediği sürümle eşleşmelidir. Yarım kalan veya yanlış sürümdeki bir aktarım sırasında katalog erişimi durur. Aynı özel indeksle yükleme yeniden başlatıldığında eşleşen nesneler tekrar yazılmaz. Arama indeksinin etkinleşmesi ayrı bir sürüm kontrolünden geçer.

Form Studio'nun PDF çıktısında gerçek doldurulabilir alanlar bulunur. Venn aracında düzenlenebilir PowerPoint çıktısı, program aracında Excel ve takvim etkinlikleri için ICS desteği vardır. Kişisel belgeler üzerinde yaptığınız değişikliğin ilk sayfasını önizlemek için düzenleme panelindeki önizleme eylemini kullanın. Bu düşük çözünürlüklü önizleme indirme hakkı tüketmez.

Yeni kurulumda yönetici ikinci faktörünü kendiniz eşleyin. Çalışır kurulum yedeği ayrı bir işlemdir. Dağıtılan özel ZIP mevcut hesapları, özel kullanıcı belgelerini veya yönetici sırlarını içermez. Teknik kanıtların ve üretim durumunun ayrıntıları **TemplateAtlas-Kabul-Raporu.html** dosyasındadır.

Alan adı ve yeni bir üretim Worker'ı için sıfır ek maliyet koşulu henüz sağlanmadı. GitHub deposunun denetim iş akışı production'a dağıtım yapmaz. Cloudflare'ın otomatik Git bağlantısı için [Workers Builds belgesine](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/) bakılabilir. Canlı planı değiştirirken aylık ve yıllık fiyat kimlikleri, USD yinelenen fiyat ve doğru test/canlı ortamı kontrol edilir. Kullanıcı adına gerçek ödeme testi gerçekleştirilmez.
