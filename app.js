import {
  aktifler, aracKalemleri, bugunISO, kalemDurum, kmBilgisi, sayi, sonrakiHesapla, tarihYaz,
} from "./hesap.js";

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const yeniId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
// "141.949" → 141949, "20,86" → 20.86, "20.86" → 20.86
const sayiOku = (v) => {
  let s = String(v ?? "").replace(/\s|tl|km|lt|₺/gi, "");
  if (!s) return null;
  if (/^\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, ""); // "141,949" km → binlik
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const tl = (n) => (n ? sayi(n) + " TL" : "");

// suzunn.github.io başka projelerle ortak, anahtarlar karışmasın diye önek
const yerel = {
  al(k) { try { return localStorage.getItem("arac:" + k); } catch { return null; } },
  koy(k, v) { try { v === null ? localStorage.removeItem("arac:" + k) : localStorage.setItem("arac:" + k, v); } catch {} },
};

// Ekranlar GitHub Pages'te, veri ve bildirim Netlify'da
const API = location.hostname.endsWith("github.io") ? "https://araclarimiz-aile.netlify.app/api/" : "/api/";

const KAYIT_TURLERI = {
  bakim: "Bakım",
  tamir: "Tamir / arıza",
  odeme: "Ödeme (sigorta, vergi, ceza)",
  yakit: "Yakıt ölçümü",
  not: "Not",
};

const SIMGE = {
  ayar: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  kapat: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  ok: '<svg class="ok" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
};

// ---------- durum ----------
let anahtar = anahtarAl();
let kim = yerel.al("kim");
let durum = null;
let vapid = null;
let cevrimdisi = false;
let aktifArac = yerel.al("aktifArac");
let kurulumIstegi = null;
let gecmisHepsi = false;
let bekliyor = false;
let linkGecersiz = false;
let geriAlAktif = false;
let aiVar = false;

function anahtarAl() {
  const m = location.hash.match(/k=([\w-]+)/);
  if (m) {
    yerel.koy("aile", m[1]);
    history.replaceState(null, "", location.pathname);
  }
  return yerel.al("aile");
}

async function api(yol, govde, sure = 20000) {
  let r;
  try {
    r = await fetch(API + yol, {
      method: govde ? "POST" : "GET",
      headers: { "x-aile": anahtar || "", "content-type": "application/json" },
      body: govde ? JSON.stringify(govde) : undefined,
      signal: AbortSignal.timeout(sure),
    });
  } catch {
    throw new Error(navigator.onLine === false ? "İnternet yok" : "Sunucuya ulaşılamadı, tekrar dene");
  }
  const v = await r.json().catch(() => ({}));
  if (!r.ok) {
    const hata = new Error(v.hata || "Sunucuya ulaşılamadı, tekrar dene");
    hata.kod = r.status;
    throw hata;
  }
  return v;
}

// Kaydettikten sonra, kayıttan önce yola çıkmış eski bir okuma ekrana yazılmasın
let surum = 0;

async function yukle() {
  const basSurum = surum;
  try {
    const v = await api("veri");
    if (basSurum !== surum) return;
    durum = v.durum;
    vapid = v.vapid;
    aiVar = Boolean(v.ai);
    cevrimdisi = false;
    linkGecersiz = false;
    yerel.koy("onbellek", JSON.stringify({ durum, vapid }));
  } catch (e) {
    if (e.kod === 401) {
      // Anahtarı silme: sunucuda geçici bir sorun olabilir, link tekrar açılınca düzelir
      linkGecersiz = true;
    } else {
      if (!durum) {
        const eski = yerel.al("onbellek");
        if (eski) ({ durum, vapid } = JSON.parse(eski));
      }
      cevrimdisi = true;
    }
  }
  if ($("#tabaka").hidden) ciz(); // açık bir pencerenin altındaki ekranı değiştirme
}

// Biri bir şey girince diğer telefonlarda da görünsün: açıkken 15 sn'de bir bak, değiştiyse yeniden çiz
async function tazele() {
  if (document.visibilityState !== "visible" || !anahtar || !durum || bekliyor || !$("#tabaka").hidden) return;
  const basSurum = surum;
  try {
    const v = await api("veri");
    if (basSurum !== surum || JSON.stringify(v.durum) === JSON.stringify(durum)) return;
    if (!$("#tabaka").hidden || bekliyor) return; // bu arada pencere açıldıysa bozma
    durum = v.durum;
    aiVar = Boolean(v.ai);
    cevrimdisi = false;
    yerel.koy("onbellek", JSON.stringify({ durum, vapid }));
    ciz();
  } catch {}
}

async function kaydet(islemler, mesaj, geriAl, pencereyiKapat = true) {
  if (bekliyor) return false;
  bekliyor = true;
  surum++;
  try {
    const v = await api("veri", { islemler, kim, ben: benimEndpoint });
    surum++;
    durum = v.durum;
    yerel.koy("onbellek", JSON.stringify({ durum, vapid }));
    cevrimdisi = false;
    if (pencereyiKapat && !geriAlAktif) kapat();
    ciz();
    if (mesaj) bilgi(mesaj, geriAl);
    return true;
  } catch (e) {
    bilgi(e.message + " (kaydedilmedi)");
    return false;
  } finally {
    bekliyor = false;
  }
}

// Bu telefonun bildirim adresi: kendi bildirdiği arıza kendisine bildirim olarak gelmesin
let benimEndpoint = "";

let bilgiZamani;
function bilgi(metin, geriAl) {
  const el = $("#bilgi");
  el.innerHTML = `<span>${esc(metin)}</span>${geriAl ? '<button type="button">Geri al</button>' : ""}`;
  // Geri al açık bir pencereyi kapatmasın
  if (geriAl) el.querySelector("button").onclick = () => { el.classList.remove("gorunur"); geriAlAktif = true; Promise.resolve(geriAl()).finally(() => (geriAlAktif = false)); };
  el.classList.add("gorunur");
  clearTimeout(bilgiZamani);
  bilgiZamani = setTimeout(() => el.classList.remove("gorunur"), geriAl ? 6000 : 3000);
}

const araclar = () => aktifler(durum.araclar).filter((a) => !a.arsiv);
const arac = (id) => aktifler(durum.araclar).find((a) => a.id === id);

// ---------- ana ekran ----------
function ciz() {
  const kok = $("#uygulama");
  if (!anahtar) return (kok.innerHTML = girisEkrani());
  if (linkGecersiz) return (kok.innerHTML = `<div class="giris"><h1>Link açılamadı</h1><p>WhatsApp grubundaki aile linkine tekrar dokun. Düzelmezse Süleyman'a haber ver.</p></div>`);
  if (!durum) return (kok.innerHTML = `<div class="giris"><h1>Bağlanılamadı</h1><p>İnternet bağlantısını kontrol edip sayfayı yenile.</p></div>`);
  if (!kim || !(durum.kisiler || []).includes(kim)) return kimsinEkrani(kok);

  const liste = araclar();
  if (!liste.find((a) => a.id === aktifArac)) aktifArac = liste[0]?.id;
  const a = arac(aktifArac);
  // Yeniden çizince açık kutular kapanmasın
  const acikKutular = new Set([...kok.querySelectorAll("details[open][data-k]")].map((d) => d.dataset.k));

  kok.innerHTML = `
    <header class="ust">
      <h1>Araçlarımız</h1>
      <button class="simge-dugme" id="ayarDugme" aria-label="Ayarlar">${SIMGE.ayar}</button>
    </header>
    <nav class="araclar" role="tablist" aria-label="Araç seç">
      ${liste.map((x) => {
        const acil = acilSayisi(x);
        return `<button class="arac-kart" role="tab" data-arac="${esc(x.id)}" aria-selected="${x.id === aktifArac}" aria-label="${esc(x.ad)}${acil ? `, ${acil} acil iş` : ""}">
          ${x.foto ? `<img src="${esc(x.foto)}" alt="">` : `<span class="arac-ad">${esc(x.ad)}</span>`}
          ${acil ? `<span class="rozet">${acil}</span>` : ""}
        </button>`;
      }).join("")}
    </nav>
    ${cevrimdisi ? '<div class="cevrimdisi">İnternet yok: son kaydedilen bilgiler gösteriliyor</div>' : ""}
    <main>${a ? aracEkrani(a) : '<p>Henüz araç yok. Ayarlar\'dan ekleyebilirsin.</p>'}</main>
    ${a ? `<div class="alt-bar">
      <button class="dugme buyuk" id="ekleDugme">+ Kayıt ekle</button>
      <button class="dugme buyuk kirmizi" id="sorunDugme">⚠ Sorun bildir</button>
    </div>` : ""}`;

  kok.querySelectorAll("[data-arac]").forEach((b) => (b.onclick = () => {
    aktifArac = b.dataset.arac;
    yerel.koy("aktifArac", aktifArac);
    gecmisHepsi = false;
    ciz();
    scrollTo(0, 0);
  }));
  $("#ayarDugme").onclick = ayarlarPenceresi;
  if (!a) return;
  kok.querySelectorAll("details[data-k]").forEach((d) => { if (acikKutular.has(d.dataset.k)) d.open = true; });
  $("#ekleDugme").onclick = () => eklePenceresi(a);
  $("#sorunDugme").onclick = () => arizaBildirPenceresi(a);
  $("#kmDugme").onclick = () => kmPenceresi(a);
  $("#bildirimAc")?.addEventListener("click", bildirimAc);
  $("#bildirimGec")?.addEventListener("click", () => { yerel.koy("bildirimGec", bugunISO()); ciz(); });
  $("#tumGecmis")?.addEventListener("click", () => { gecmisHepsi = true; ciz(); });
  $("#aracDuzenle").onclick = () => aracPenceresi(a);
  $("#kontrolEkle").onclick = () => kalemDuzenlePenceresi(a, null);
  const bul = (id) => aracKalemleri(durum, a.id).find((x) => x.id === id);
  kok.querySelectorAll("[data-kalem]").forEach((b) => (b.onclick = () => kalemPenceresi(a, b.dataset.kalem)));
  kok.querySelectorAll("[data-yap]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); yapildiPenceresi(a, bul(b.dataset.yap)); }));
  kok.querySelectorAll("[data-coz]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); cozulduPenceresi(a, bul(b.dataset.coz)); }));
  kok.querySelectorAll("[data-gir]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); kalemDuzenlePenceresi(a, bul(b.dataset.gir)); }));
  kok.querySelectorAll("[data-kayit]").forEach((b) => (b.onclick = () => kayitPenceresi(a, b.dataset.kayit)));
}

// Acil = gecikmiş kontrol + açık sorun (araç kartındaki kırmızı sayı)
function aracDurumu(a, bugun = bugunISO()) {
  const km = kmBilgisi(durum, a.id, bugun);
  const kalemler = aracKalemleri(durum, a.id);
  const acik = kalemler.filter((k) => k.tur === "sorun" && !k.cozuldu).sort((x, y) => (x.acilis || "").localeCompare(y.acilis || "")).reverse();
  // Aciliyeti girilmemiş eski sorunlar acil sayılır
  const sorunlar = acik.filter((k) => (k.aciliyet || "acil") === "acil");
  const hafifSorunlar = acik.filter((k) => (k.aciliyet || "acil") !== "acil");
  const kontroller = kalemler.filter((k) => k.tur !== "sorun").map((k) => ({ k, d: kalemDurum(k, km, bugun) })).sort((x, y) => x.d.sira - y.d.sira);
  const grup = (s) => kontroller.filter((x) => x.d.seviye === s);
  return { km, sorunlar, hafifSorunlar, gecikti: grup("gecikti"), yaklasiyor: grup("yaklasiyor"), eksik: grup("eksik"), tamam: grup("tamam") };
}

function acilSayisi(a) {
  const d = aracDurumu(a);
  return d.sorunlar.length + d.gecikti.length;
}

function girisEkrani() {
  return `<div class="giris">
    <img src="ikon/192.png" alt="">
    <h1>Araçlarımız</h1>
    <p>Bu uygulama aile linkiyle açılıyor. WhatsApp grubundaki linke dokun, otomatik giriş yapılır.</p>
  </div>`;
}

function kimsinEkrani(kok) {
  const kisiler = durum.kisiler || [];
  kok.innerHTML = `<div class="giris">
    <img src="ikon/192.png" alt="">
    <h1>Hoş geldin!</h1>
    <p>Sen kimsin? Yaptığın kayıtlarda adın görünecek.</p>
    <div class="secim-liste">
      ${kisiler.map((k) => `<button class="dugme ikincil" data-kim="${esc(k)}">${esc(k)}</button>`).join("")}
    </div>
  </div>`;
  const sec = (ad) => {
    if (!ad) return;
    kim = ad;
    yerel.koy("kim", ad);
    ciz();
    aboneligiTazele();
  };
  kok.querySelectorAll("[data-kim]").forEach((b) => (b.onclick = () => sec(b.dataset.kim)));
}

function aracEkrani(a) {
  const bugun = bugunISO();
  const { km, sorunlar, hafifSorunlar, gecikti, yaklasiyor, eksik, tamam } = aracDurumu(a, bugun);
  const kayitlar = aktifler(durum.kayitlar)
    .filter((k) => k.aracId === a.id)
    .sort((x, y) => (x.tarih < y.tarih ? 1 : x.tarih > y.tarih ? -1 : (y.guncelleme || "").localeCompare(x.guncelleme || "")));
  const yil = bugun.slice(0, 4);
  const yilToplam = kayitlar.filter((k) => k.tarih?.startsWith(yil)).reduce((t, k) => t + (Number(k.tutar) || 0), 0);
  const gosterilen = gecmisHepsi ? kayitlar : kayitlar.slice(0, 8);
  const yakitlar = kayitlar.filter((k) => k.tur === "yakit" && k.gidilenKm && k.litre);
  const yakitOrt = yakitlar.length
    ? (yakitlar.reduce((t, k) => t + Number(k.litre), 0) / yakitlar.reduce((t, k) => t + Number(k.gidilenKm), 0)) * 100
    : null;

  let kmAlt = "Km henüz girilmedi";
  if (km.sonKm) {
    kmAlt = `${tarihYaz(km.sonTarih)} tarihinde girildi`;
    if (km.tahmini !== km.sonKm) kmAlt += ` · bugün tahmini ~${sayi(km.tahmini)}`;
    if (km.hiz) kmAlt += ` · günde ~${sayi(km.hiz)} km`;
  }

  // Her iş bir kart: kartın kendisi ayrıntıyı açar, sağdaki büyük düğme işi bitirir
  const isKarti = (sinif, k, alt, dugme) => `<div class="is ${sinif}" data-kalem="${esc(k.id)}" role="button" tabindex="0">
      <div class="is-govde"><div class="is-ad">${esc(k.ad)}</div><div class="is-alt">${esc(alt)}</div></div>
      ${dugme}
    </div>`;
  const acilVar = sorunlar.length || gecikti.length;

  return `
    ${bildirimBandi()}

    ${acilVar ? `<section>
      <h2 class="baslik-acil">⚠ Acil (${sorunlar.length + gecikti.length})</h2>
      ${sorunlar.map((k) => isKarti("acil", k, "Sorun · " + (k.acilis ? tarihYaz(k.acilis) + " tarihinden beri" : "açık"),
        `<button class="is-dugme" data-coz="${esc(k.id)}">Çözüldü</button>`)).join("")}
      ${gecikti.map(({ k, d }) => isKarti("acil", k, d.metin, `<button class="is-dugme" data-yap="${esc(k.id)}">Yapıldı</button>`)).join("")}
    </section>` : `<section><div class="hepsi-iyi">✓ Acil bir iş yok</div></section>`}

    ${yaklasiyor.length || hafifSorunlar.length ? `<section>
      <h2 class="baslik-yakin">Yakında (${yaklasiyor.length + hafifSorunlar.length})</h2>
      ${hafifSorunlar.map((k) => isKarti("yakin", k, "Sorun · " + (k.acilis ? tarihYaz(k.acilis) + " tarihinden beri" : "açık"),
        `<button class="is-dugme" data-coz="${esc(k.id)}">Çözüldü</button>`)).join("")}
      ${yaklasiyor.map(({ k, d }) => isKarti("yakin", k, d.metin, `<button class="is-dugme" data-yap="${esc(k.id)}">Yapıldı</button>`)).join("")}
    </section>` : ""}

    <section>
      <div class="km-kart">
        <div>
          <div class="km-etiket">Kilometre</div>
          <div class="km-sayi">${km.sonKm ? sayi(km.sonKm) : "?"}</div>
          <div class="km-alt">${esc(kmAlt)}</div>
        </div>
        <button class="dugme buyuk" id="kmDugme">Km gir</button>
      </div>
    </section>

    ${eksik.length ? `<section>
      <h2>Bilgisi eksik (${eksik.length}) <small>bilen girsin</small></h2>
      ${eksik.map(({ k }) => isKarti("eksik", k, "Tarih / km girilmedi", `<button class="is-dugme" data-gir="${esc(k.id)}">Gir</button>`)).join("")}
    </section>` : ""}

    <section>
      <details class="kart katlanir" data-k="tamam">
        <summary><span>✓ Yolunda olanlar (${tamam.length})</span>${SIMGE.ok}</summary>
        <div class="katlanir-ic">
          ${tamam.map(({ k, d }) => isKarti("tamam", k, d.metin, "")).join("") || '<p class="toplam">Yok</p>'}
          <button class="dugme ikincil genis" id="kontrolEkle" style="margin-top:10px">+ Yeni kontrol ekle</button>
        </div>
      </details>
    </section>

    <section>
      <details class="kart katlanir" data-k="gecmis" ${gecmisHepsi ? "open" : ""}>
        <summary><span>Geçmiş (${kayitlar.length})</span>${SIMGE.ok}</summary>
      <ul class="liste">
        ${gosterilen.map((k) => `<li>
          <button class="satir" data-kayit="${esc(k.id)}">
            <span class="satir-govde"><span class="satir-ad">${esc(k.baslik || KAYIT_TURLERI[k.tur] || "Kayıt")}</span>
            <span class="satir-alt">${esc([tarihYaz(k.tarih), k.km ? sayi(k.km) + " km" : "", k.kim].filter(Boolean).join(" · "))}</span></span>
            <span class="satir-sag">${k.tur === "yakit" && k.gidilenKm && k.litre ? esc(((k.litre / k.gidilenKm) * 100).toFixed(1).replace(".", ",") + " lt") : esc(tl(k.tutar))}</span>
          </button></li>`).join("") || '<li><p class="toplam">Henüz kayıt yok</p></li>'}
        ${kayitlar.length > gosterilen.length ? `<li><button class="metin-dugme" id="tumGecmis">Tümünü göster (${kayitlar.length})</button></li>` : ""}
      </ul>
      <div class="toplam">${yilToplam ? `${yil} masrafı: <b>${sayi(yilToplam)} TL</b>` : ""}${yakitOrt ? `${yilToplam ? "<br>" : ""}Ortalama yakıt: <b>${yakitOrt.toFixed(1).replace(".", ",")} lt / 100 km</b>` : ""}</div>
      </details>
    </section>

    <section>
      <details class="kart katlanir" data-k="bilgi">
        <summary><span>Araç bilgileri</span>${SIMGE.ok}</summary>
        <dl class="bilgi-tablo">
          ${[["Marka", a.marka], ["Model", a.model], ["Model yılı", a.yil], ["Motor", a.motor], ["Yakıt", a.yakit], ["Şanzıman", a.sanziman], ["Plaka", a.plaka], ["Şasi no", a.sasi], ["Renk", a.renk], ["İlk tescil", tarihYaz(a.ilkTescil)], ["Alındı", tarihYaz(a.alis)], ["Not", a.not]]
            .filter(([, v]) => v).map(([b, v]) => `<div><dt>${b}</dt><dd>${esc(v)}</dd></div>`).join("")}
        </dl>
        <div style="padding:0 14px 14px"><button class="dugme ikincil genis" id="aracDuzenle">Bilgileri düzenle</button></div>
      </details>
    </section>`;
}

function bildirimBandi() {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return "";
  if (Notification.permission === "granted" && yerel.al("abone") === "1") return "";
  if (yerel.al("bildirimGec") === bugunISO()) return "";
  const engelli = Notification.permission === "denied";
  return `<div class="uyari-bant">
    <p>${engelli ? "🔕 Bildirimler kapalı. Chrome'da adresin solundaki simgeye dokunup <b>Bildirimler: İzin ver</b> de." : "🔔 <b>Bildirimleri aç</b><br>Bakım, sigorta, muayene zamanı gelince telefonun haber versin."}</p>
    ${engelli ? '<button class="simge-dugme" id="bildirimGec" aria-label="Kapat">' + SIMGE.kapat + "</button>" : '<div class="bant-dugmeler"><button class="dugme buyuk koyu" id="bildirimAc">Aç</button><button class="metin-dugme" id="bildirimGec">Sonra</button></div>'}
  </div>`;
}

// ---------- pencereler ----------
function pencere(baslik, icerik, kurulum) {
  const t = $("#tabaka");
  t.innerHTML = `<div class="pencere" role="dialog" aria-modal="true" aria-label="${esc(baslik)}">
    <div class="pencere-bas"><h3>${esc(baslik)}</h3><button class="simge-dugme" data-kapat aria-label="Kapat">${SIMGE.kapat}</button></div>
    ${icerik}</div>`;
  // Android geri tuşu app'i değil pencereyi kapatsın
  if (t.hidden) history.pushState({ pencere: true }, "");
  t.hidden = false;
  document.body.style.overflow = "hidden";
  t.onclick = (e) => { if (e.target === t || e.target.closest("[data-kapat]")) kapat(); };
  const p = t.firstElementChild;
  kurulum?.(p);
  return p;
}

function kapat(geriTusuyla = false) {
  const t = $("#tabaka");
  if (t.hidden) return;
  try { aktifTanima?.abort(); } catch {} // pencere kapanınca mikrofon dinlemeye devam etmesin
  aktifTanima = null;
  t.hidden = true;
  t.innerHTML = "";
  document.body.style.overflow = "";
  if (!geriTusuyla && history.state?.pencere) history.back();
}
window.addEventListener("popstate", () => kapat(true));

const alan = (etiket, ad, deger, ek = "") =>
  `<label class="alan">${etiket}<input name="${ad}" value="${esc(deger ?? "")}" ${ek}></label>`;
const tarihAlani = (etiket, ad, deger) => alan(etiket, ad, deger, 'type="date"');
const sayiAlani = (etiket, ad, deger, ek = "") => alan(etiket, ad, deger ?? "", `inputmode="decimal" ${ek}`);
const notAlani = (deger) => `<label class="alan">Not<textarea name="not">${esc(deger ?? "")}</textarea></label>`;

function formVerisi(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function eklePenceresi(a) {
  pencere(`${a.ad}: ne eklemek istiyorsun?`, `<div class="secim-liste">
    <button class="dugme ikincil" data-sec="km">Km gir</button>
    <button class="dugme ikincil" data-sec="bakim">Bakım / tamir / masraf kaydı</button>
    <button class="dugme ikincil" data-sec="yakit">Yakıt ölçümü</button>
    <button class="dugme ikincil" data-sec="sorun">Sorun bildir (ışık yandı, ses var…)</button>
    <button class="dugme ikincil" data-sec="kontrol">Yeni rutin kontrol</button>
  </div>`, (p) => {
    p.querySelectorAll("[data-sec]").forEach((b) => (b.onclick = () => {
      const s = b.dataset.sec;
      if (s === "km") kmPenceresi(a);
      else if (s === "bakim") kayitPenceresi(a, null, "bakim");
      else if (s === "yakit") kayitPenceresi(a, null, "yakit");
      else if (s === "sorun") arizaBildirPenceresi(a);
      else kalemDuzenlePenceresi(a, null);
    }));
  });
}

function kmIslemi(a, km, tarih) {
  const bilgi = kmBilgisi(durum, a.id);
  if (!km || (bilgi.sonKm && km <= bilgi.sonKm && tarih >= (bilgi.sonTarih || ""))) return [];
  return [{ op: "kaydet", koleksiyon: "kmKayitlari", oge: { id: yeniId(), aracId: a.id, tarih, km, kim } }];
}

function kmPenceresi(a) {
  const km = kmBilgisi(durum, a.id);
  const sonKmler = aktifler(durum.kmKayitlari).filter((k) => k.aracId === a.id)
    .sort((x, y) => (x.tarih === y.tarih ? (y.guncelleme || "").localeCompare(x.guncelleme || "") : x.tarih < y.tarih ? 1 : -1)).slice(0, 5);
  pencere(`${a.ad}: km gir`, `<form>
    <p class="aciklama">Göstergedeki toplam km'yi yaz. ${km.sonKm ? `Son girilen: ${sayi(km.sonKm)} km (${tarihYaz(km.sonTarih)}).` : ""}</p>
    ${sayiAlani("Km", "km", "", 'required autofocus placeholder="' + (km.tahmini ? sayi(km.tahmini) : "") + '"')}
    ${tarihAlani("Tarih", "tarih", bugunISO())}
    <button class="dugme genis" style="margin-top:16px">Kaydet</button>
    ${sonKmler.length ? `<h2 style="margin-top:22px">Son girilenler <small>(yanlışsa sil)</small></h2>
    <ul class="liste kart">${sonKmler.map((k) => `<li><div class="satir"><span class="satir-govde"><span class="satir-ad">${sayi(k.km)} km</span>
      <span class="satir-alt">${esc([tarihYaz(k.tarih), k.kim].filter(Boolean).join(" · "))}</span></span>
      <button type="button" class="dugme tehlike" data-kmsil="${esc(k.id)}">Sil</button></div></li>`).join("")}</ul>` : ""}
  </form>`, (p) => {
    p.querySelectorAll("[data-kmsil]").forEach((b) => (b.onclick = () => {
      if (!confirm("Bu km kaydı silinsin mi?")) return;
      kaydet([{ op: "sil", koleksiyon: "kmKayitlari", id: b.dataset.kmsil }], "Km kaydı silindi", () =>
        kaydet([{ op: "kaydet", koleksiyon: "kmKayitlari", oge: { id: b.dataset.kmsil, silindi: false } }], "Geri alındı"));
    }));
    p.querySelector("form").onsubmit = (e) => {
      e.preventDefault();
      const v = formVerisi(e.target);
      const deger = sayiOku(v.km);
      if (!deger) return bilgi("Km'yi yaz");
      if (km.sonKm && deger < km.sonKm && v.tarih >= km.sonTarih && !confirm(`Son girilen km ${sayi(km.sonKm)}. Daha düşük bir km yazdın, yine de kaydedilsin mi?`)) return;
      if (km.tahmini && deger > km.tahmini + 20000 && !confirm(`${sayi(deger)} km, beklenenden çok yüksek (tahmin ~${sayi(km.tahmini)}). Doğru mu?`)) return;
      kaydet([{ op: "kaydet", koleksiyon: "kmKayitlari", oge: { id: yeniId(), aracId: a.id, tarih: v.tarih || bugunISO(), km: deger, kim } }], "Km kaydedildi");
    };
  });
}

function aralikMetni(k) {
  const p = [];
  if (k.aralikKm) p.push(`${sayi(k.aralikKm)} km'de`);
  if (k.aralikAy) p.push(k.aralikAy % 12 === 0 ? `${k.aralikAy / 12} yılda` : `${k.aralikAy} ayda`);
  if (k.aralikGun) p.push(k.aralikGun === 7 ? "haftada" : `${k.aralikGun} günde`);
  return p.length ? "Her " + p.join(" ya da ") + " bir" : "";
}

function kalemPenceresi(a, id) {
  const k = aracKalemleri(durum, a.id).find((x) => x.id === id);
  if (!k) return;
  if (k.tur === "sorun") return sorunPenceresi(a, k);
  const d = kalemDurum(k, kmBilgisi(durum, a.id));
  const satirlar = [
    ["Durum", `<span class="etiket ${d.seviye}">${esc(d.metin)}</span>`],
    ["Sıradaki", esc([k.sonrakiTarih && tarihYaz(k.sonrakiTarih), k.sonrakiKm && sayi(k.sonrakiKm) + " km"].filter(Boolean).join(" ya da ") || "Girilmedi")],
    ["Son yapılan", esc([k.sonTarih && tarihYaz(k.sonTarih), k.sonKm && sayi(k.sonKm) + " km"].filter(Boolean).join(" · ") || "Bilinmiyor")],
    ["Ne sıklıkla", esc(aralikMetni(k) || "Belirtilmedi")],
    ["Not", esc(k.not || "")],
  ].filter(([, v]) => v);
  pencere(k.ad, `
    <dl class="bilgi-tablo" style="padding:0">${satirlar.map(([b, v]) => `<div><dt>${b}</dt><dd>${v}</dd></div>`).join("")}</dl>
    ${k.guncelleyen ? `<p class="aciklama" style="margin-top:8px">Son değiştiren: ${esc(k.guncelleyen)}</p>` : ""}
    <div class="dugme-sira">
      <button class="dugme" data-yap>✓ Yapıldı</button>
      <button class="dugme ikincil" data-duzenle>Düzenle</button>
    </div>`, (p) => {
    p.querySelector("[data-yap]").onclick = () => yapildiPenceresi(a, k);
    p.querySelector("[data-duzenle]").onclick = () => kalemDuzenlePenceresi(a, k);
  });
}

function yapildiPenceresi(a, k) {
  const km = kmBilgisi(durum, a.id);
  const bugun = bugunISO();
  const ilk = sonrakiHesapla(k, bugun, km.tahmini);
  pencere(`${k.ad}: yapıldı`, `<form>
    <div class="yan-yana">${tarihAlani("Ne zaman", "tarih", bugun)}${sayiAlani("Kaçıncı km'de", "km", "", km.tahmini ? `placeholder="~${sayi(km.tahmini)}"` : "")}</div>
    ${km.tahmini ? `<p class="aciklama" style="margin:6px 0 0">Göstergeye bakıp yaz. Boş bırakırsan tahmini ~${sayi(km.tahmini)} km sayılır.</p>` : ""}
    ${sayiAlani('Tutar <small>(TL, isteğe bağlı)</small>', "tutar", "")}
    ${notAlani("")}
    <fieldset><legend>Bir sonraki</legend>
      <div class="yan-yana">${tarihAlani("Tarih", "sonrakiTarih", ilk.sonrakiTarih)}${sayiAlani("Km", "sonrakiKm", ilk.sonrakiKm)}</div>
      <p class="aciklama" style="margin:8px 0 0">${esc(aralikMetni(k) ? aralikMetni(k) + " diye hesaplandı, istersen değiştir." : "Bir sonrakini biliyorsan yaz.")}</p>
    </fieldset>
    <button class="dugme genis" style="margin-top:16px">Kaydet</button>
  </form>`, (p) => {
    const f = p.querySelector("form");
    const yenile = () => {
      const v = formVerisi(f);
      const s = sonrakiHesapla(k, v.tarih, sayiOku(v.km) ?? km.tahmini);
      if (s.sonrakiTarih) f.sonrakiTarih.value = s.sonrakiTarih;
      if (s.sonrakiKm) f.sonrakiKm.value = s.sonrakiKm;
    };
    f.tarih.onchange = yenile;
    f.km.oninput = yenile;
    f.onsubmit = (e) => {
      e.preventDefault();
      const v = formVerisi(f);
      const tarih = v.tarih || bugun;
      const kmDeger = sayiOku(v.km);
      // Boş bırakılan km tahminden gelir ama gerçek km kaydı sayılmaz
      const kmTahmin = kmDeger ?? (tarih === bugun ? km.tahmini : null);
      const islemler = [
        { op: "kaydet", koleksiyon: "kayitlar", oge: { id: yeniId(), aracId: a.id, kalemId: k.id, tur: "bakim", tarih, km: kmDeger, baslik: k.ad, tutar: sayiOku(v.tutar), not: v.not.trim() || null, kim } },
        { op: "kaydet", koleksiyon: "kalemler", oge: { id: k.id, sonTarih: tarih, sonKm: kmTahmin, sonrakiTarih: v.sonrakiTarih || null, sonrakiKm: sayiOku(v.sonrakiKm) } },
        ...kmIslemi(a, kmDeger, tarih),
      ];
      const eski = { id: k.id, sonTarih: k.sonTarih ?? null, sonKm: k.sonKm ?? null, sonrakiTarih: k.sonrakiTarih ?? null, sonrakiKm: k.sonrakiKm ?? null };
      const kayitId = islemler[0].oge.id;
      const kmIdleri = islemler.filter((i) => i.koleksiyon === "kmKayitlari").map((i) => i.oge.id);
      kaydet(islemler, `${k.ad} kaydedildi`, () => kaydet([
        { op: "sil", koleksiyon: "kayitlar", id: kayitId },
        { op: "kaydet", koleksiyon: "kalemler", oge: eski },
        ...kmIdleri.map((id) => ({ op: "sil", koleksiyon: "kmKayitlari", id })),
      ], "Geri alındı"));
    };
  });
}

function kalemDuzenlePenceresi(a, k) {
  const yeni = !k;
  k = k || {};
  pencere(yeni ? "Yeni rutin kontrol" : "Kontrolü düzenle", `<form>
    ${alan("Adı", "ad", k.ad, 'required placeholder="ör. Klima bakımı"')}
    <fieldset><legend>Bir sonraki</legend>
      <div class="yan-yana">${tarihAlani("Tarih", "sonrakiTarih", k.sonrakiTarih)}${sayiAlani("Km", "sonrakiKm", k.sonrakiKm)}</div>
    </fieldset>
    <fieldset><legend>Ne sıklıkla <small>(ikisinden hangisi önce gelirse)</small></legend>
      <div class="yan-yana">${sayiAlani("Her kaç km'de", "aralikKm", k.aralikKm)}${sayiAlani("Her kaç ayda", "aralikAy", k.aralikAy)}</div>
      ${k.aralikGun ? sayiAlani("Her kaç günde", "aralikGun", k.aralikGun) : ""}
    </fieldset>
    <fieldset><legend>Son yapılan</legend>
      <div class="yan-yana">${tarihAlani("Tarih", "sonTarih", k.sonTarih)}${sayiAlani("Km", "sonKm", k.sonKm)}</div>
    </fieldset>
    ${notAlani(k.not)}
    <button class="dugme genis" style="margin-top:16px">Kaydet</button>
    ${yeni ? "" : '<button type="button" class="dugme tehlike genis" style="margin-top:10px" data-sil>Bu kontrolü sil</button>'}
  </form>`, (p) => {
    const f = p.querySelector("form");
    f.onsubmit = (e) => {
      e.preventDefault();
      const v = formVerisi(f);
      const oge = {
        id: k.id || yeniId(), aracId: a.id, ad: v.ad.trim(),
        sonrakiTarih: v.sonrakiTarih || null, sonrakiKm: sayiOku(v.sonrakiKm),
        aralikKm: sayiOku(v.aralikKm), aralikAy: sayiOku(v.aralikAy),
        sonTarih: v.sonTarih || null, sonKm: sayiOku(v.sonKm), not: v.not.trim() || null,
      };
      if ("aralikGun" in v) oge.aralikGun = sayiOku(v.aralikGun);
      if (!oge.sonrakiTarih && !oge.sonrakiKm && (oge.sonTarih || oge.sonKm)) Object.assign(oge, sonrakiHesapla(oge, oge.sonTarih, oge.sonKm));
      kaydet([{ op: "kaydet", koleksiyon: "kalemler", oge }], "Kaydedildi");
    };
    p.querySelector("[data-sil]")?.addEventListener("click", () => {
      if (!confirm(`"${k.ad}" kontrolü silinsin mi?`)) return;
      kaydet([{ op: "sil", koleksiyon: "kalemler", id: k.id }], "Silindi", () =>
        kaydet([{ op: "kaydet", koleksiyon: "kalemler", oge: { id: k.id, silindi: false } }], "Geri alındı"));
    });
  });
}

const SURUS = { guvenli: "✅ Kullanılabilir", dikkatli: "⚠️ Dikkatli kullanın", surmeyin: "⛔ Kullanmayın" };
const ACILIYET = { acil: "Acil", yakinda: "Yakında bakılmalı", bilgi: "Takip yeterli" };

// Yapay zekanın hazırladığı kaydın okunur hali (önizlemede ve sorun ayrıntısında aynı)
function aiOzeti(ai) {
  if (!ai) return "";
  return `<div class="ai-kutu">
    <p class="ai-ozet">${esc(ai.ozet)}</p>
    ${ai.surus ? `<p class="ai-surus ${esc(ai.surus)}">${SURUS[ai.surus] || ""}: ${esc(ai.surus_aciklama || "")}</p>` : ""}
    ${ai.ne_yapmali?.length ? `<h4>Ne yapmalı?</h4><ol>${ai.ne_yapmali.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>` : ""}
    ${ai.olasi_nedenler?.length ? `<h4>Olası nedenler</h4><ul>${ai.olasi_nedenler.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
    <p class="ai-not">Yapay zeka önerisidir, ustaya da danışın.</p>
  </div>`;
}

function sorunPenceresi(a, k) {
  pencere(k.ad, `
    <p class="aciklama">${esc([k.acilis && "Açılış: " + tarihYaz(k.acilis) + (k.guncelleyen ? " · " + k.guncelleyen : ""), ACILIYET[k.aciliyet || "acil"]].filter(Boolean).join(" · "))}</p>
    ${aiOzeti(k.ai)}
    ${k.anlatim ? `<p class="aciklama"><b>Anlatılan:</b> ${esc(k.anlatim)}</p>` : ""}
    ${!k.ai && k.not ? `<p class="aciklama">${esc(k.not)}</p>` : ""}
    ${k.fotolar?.length ? `<div class="fotolar" data-fotolar></div>` : ""}
    <div class="dugme-sira">
      <button class="dugme" data-coz>✓ Çözüldü</button>
      <button class="dugme ikincil" data-duzenle>Düzenle</button>
    </div>`, (p) => {
    p.querySelector("[data-duzenle]").onclick = () => sorunDuzenlePenceresi(a, k);
    p.querySelector("[data-coz]").onclick = () => cozulduPenceresi(a, k);
    const kutu = p.querySelector("[data-fotolar]");
    if (kutu) for (const id of k.fotolar) {
      const img = document.createElement("img");
      img.alt = "Arıza fotoğrafı";
      kutu.append(img);
      api("foto?id=" + encodeURIComponent(id)).then((v) => (img.src = v.veri)).catch(() => img.remove());
    }
  });
}

// ---------- fotoğraf / video ----------
const zamanAsimi = (ms, mesaj) => new Promise((_, hata) => setTimeout(() => hata(new Error(mesaj)), ms));

async function resimKucult(kaynak, enFazla = 1280) {
  let bmp = kaynak;
  if (kaynak instanceof Blob) {
    try {
      bmp = await createImageBitmap(kaynak);
    } catch {
      throw new Error("Bu fotoğraf açılamadı. Kameradan yeniden çek ya da ekran görüntüsü al.");
    }
  }
  const w = bmp.videoWidth || bmp.width, h = bmp.videoHeight || bmp.height;
  if (!w || !h) throw new Error("Bu dosya okunamadı");
  const oran = Math.min(1, enFazla / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * oran);
  c.height = Math.round(h * oran);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return c.toDataURL("image/jpeg", 0.82);
}

// Claude video okumuyor: videodan 3 kare alıp fotoğraf gibi gönderiyoruz
async function videoKareleri(dosya, adet = 3) {
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.preload = "auto";
  const adres = URL.createObjectURL(dosya);
  const hataMesaji = "Bu video açılamadı. Videodan ekran görüntüsü alıp fotoğraf olarak ekleyebilirsin.";
  try {
    v.src = adres;
    await Promise.race([
      new Promise((ok, hata) => { v.onloadeddata = ok; v.onerror = () => hata(new Error(hataMesaji)); }),
      zamanAsimi(15000, hataMesaji),
    ]);
    const sure = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 1;
    const kareler = [];
    for (let i = 1; i <= adet; i++) {
      await Promise.race([
        new Promise((ok, hata) => { v.onseeked = ok; v.onerror = () => hata(new Error(hataMesaji)); v.currentTime = sure * (i / (adet + 1)); }),
        zamanAsimi(8000, hataMesaji),
      ]);
      kareler.push(await resimKucult(v));
    }
    return kareler;
  } finally {
    URL.revokeObjectURL(adres);
    v.removeAttribute("src");
  }
}

// Konuşma tanıma: sadece kesinleşen cümleler; bitirirken son cümleyi bekler
let aktifTanima = null;
function dinlemeyiBitir() {
  const t = aktifTanima;
  if (!t) return Promise.resolve();
  return new Promise((ok) => {
    const once = t.onend;
    t.onend = (e) => { once?.(e); ok(); };
    try { t.stop(); } catch { ok(); }
    setTimeout(ok, 2500);
  });
}

function arizaBildirPenceresi(a, taslak = {}) {
  const Tanima = window.SpeechRecognition || window.webkitSpeechRecognition;
  const fotolar = [...(taslak.fotolar || [])];
  let isleniyor = 0;
  pencere(`${a.ad}: sorun bildir`, `
    <p class="aciklama">${aiVar ? "Ne olduğunu konuşarak ya da yazarak anlat, varsa fotoğraf/video ekle. Yapay zeka kaydı hazırlar, sen onaylarsın." : "Ne olduğunu anlat, varsa fotoğraf ekle."}</p>
    ${Tanima ? '<button type="button" class="dugme buyuk genis mikrofon" data-mikrofon>🎤 Konuşarak anlat</button>' : ""}
    <label class="alan">Ne oldu?<textarea name="metin" data-metin placeholder="ör. Göstergede sarı bir motor ışığı yandı, araba normal gidiyor">${esc(taslak.anlatim || "")}</textarea></label>
    <label class="dugme ikincil buyuk genis dosya-dugme">📷 Fotoğraf / video ekle
      <input type="file" accept="image/*,video/*" multiple hidden data-dosya>
    </label>
    <div class="fotolar" data-onizleme></div>
    <button type="button" class="dugme buyuk genis" data-gonder style="margin-top:14px">${aiVar ? "✨ Yapay zekaya gönder" : "Devam"}</button>
    <button type="button" class="metin-dugme" data-elle style="text-align:center">Kendim yazacağım</button>
  `, (p) => {
    const metin = p.querySelector("[data-metin]");
    const onizleme = p.querySelector("[data-onizleme]");
    const gonderDugmesi = p.querySelector("[data-gonder]");
    const gonderYazisi = gonderDugmesi.textContent;
    const onizlemeCiz = () => {
      onizleme.innerHTML = fotolar.map((f, i) => `<div class="foto-kutu"><img src="${f}" alt=""><button type="button" data-cikar="${i}" aria-label="Çıkar">×</button></div>`).join("")
        + (isleniyor ? '<div class="foto-kutu isleniyor">Hazırlanıyor…</div>' : "");
      onizleme.querySelectorAll("[data-cikar]").forEach((b) => (b.onclick = () => { fotolar.splice(Number(b.dataset.cikar), 1); onizlemeCiz(); }));
      gonderDugmesi.disabled = isleniyor > 0;
    };
    onizlemeCiz();
    p.querySelector("[data-dosya]").onchange = async (e) => {
      const dosyalar = [...e.target.files];
      e.target.value = "";
      for (const dosya of dosyalar) {
        if (fotolar.length >= 4) { bilgi("En fazla 4 fotoğraf"); break; }
        isleniyor++;
        onizlemeCiz();
        try {
          if (dosya.type.startsWith("video/")) fotolar.push(...(await videoKareleri(dosya)).slice(0, 4 - fotolar.length));
          else fotolar.push(await resimKucult(dosya));
        } catch (hata) {
          bilgi(hata.message);
        } finally {
          isleniyor--;
          if (p.isConnected) onizlemeCiz();
        }
      }
    };
    const mik = p.querySelector("[data-mikrofon]");
    if (mik) mik.onclick = () => {
      if (aktifTanima) { dinlemeyiBitir(); return; }
      const t = new Tanima();
      aktifTanima = t;
      t.lang = "tr-TR";
      t.continuous = true;
      t.interimResults = false;
      const bas = metin.value ? metin.value.trimEnd() + " " : "";
      t.onresult = (ev) => {
        const kesin = [...ev.results].filter((r) => r.isFinal).map((r) => r[0].transcript.trim());
        metin.value = bas + kesin.join(" ");
      };
      t.onerror = (ev) => { if (ev.error !== "aborted" && ev.error !== "no-speech") bilgi(ev.error === "not-allowed" ? "Mikrofon izni verilmedi" : "Ses anlaşılamadı, tekrar dene"); };
      t.onend = () => { if (aktifTanima === t) aktifTanima = null; mik.textContent = "🎤 Konuşarak anlat"; mik.classList.remove("dinliyor"); };
      t.start();
      mik.textContent = "⏹ Bitirdim";
      mik.classList.add("dinliyor");
    };
    p.querySelector("[data-elle]").onclick = async () => {
      await dinlemeyiBitir();
      sorunDuzenlePenceresi(a, null, { not: metin.value.trim(), fotolar });
    };
    gonderDugmesi.onclick = async () => {
      await dinlemeyiBitir();
      const anlatim = metin.value.trim();
      if (!anlatim && !fotolar.length) return bilgi("Bir şey anlat ya da fotoğraf ekle");
      if (!aiVar) return sorunDuzenlePenceresi(a, null, { not: anlatim, fotolar });
      gonderDugmesi.disabled = true;
      gonderDugmesi.textContent = "Yapay zeka inceliyor… (yarım dakika sürebilir)";
      try {
        const v = await api("ariza", { aracId: a.id, metin: anlatim, fotolar }, 65000);
        if (p.isConnected) arizaOnizlemePenceresi(a, v.kayit, anlatim, fotolar);
      } catch (hata) {
        if (!p.isConnected) return;
        gonderDugmesi.disabled = false;
        gonderDugmesi.textContent = gonderYazisi;
        bilgi(hata.message);
      }
    };
  });
}

// Aynı kimliklerle yükler: yeniden denemede ikinci kopya oluşmaz
async function fotolariYukle(fotolar, idler) {
  while (idler.length < fotolar.length) idler.push(yeniId());
  for (let i = 0; i < fotolar.length; i++) await api("foto", { id: idler[i], veri: fotolar[i] }, 30000);
  return idler.slice(0, fotolar.length);
}

function arizaOnizlemePenceresi(a, ai, anlatim, fotolar) {
  const sorunId = yeniId();
  const fotoIdleri = [];
  pencere("Yapay zeka şöyle anladı", `
    <label class="alan">Başlık<input name="baslik" value="${esc(ai.baslik)}" data-baslik></label>
    <label class="alan">Ne kadar acil?<select data-aciliyet>${Object.entries(ACILIYET).map(([d, ad]) => `<option value="${d}" ${d === ai.aciliyet ? "selected" : ""}>${ad}</option>`).join("")}</select></label>
    ${aiOzeti(ai)}
    ${fotolar.length ? `<div class="fotolar">${fotolar.map((f) => `<img src="${f}" alt="">`).join("")}</div>` : ""}
    <button type="button" class="dugme buyuk genis" data-ekle style="margin-top:12px">✓ Ekle, herkes görsün</button>
    <button type="button" class="dugme ikincil genis" data-geri style="margin-top:10px">Anlatımı düzelt</button>
  `, (p) => {
    p.querySelector("[data-geri]").onclick = () => arizaBildirPenceresi(a, { anlatim, fotolar });
    p.querySelector("[data-ekle]").onclick = async (e) => {
      const b = e.currentTarget;
      b.disabled = true;
      b.textContent = "Kaydediliyor…";
      try {
        const idler = await fotolariYukle(fotolar, fotoIdleri);
        const aciliyet = p.querySelector("[data-aciliyet]").value;
        const ad = p.querySelector("[data-baslik]").value.trim() || ai.baslik;
        const tamam = await kaydet([{ op: "kaydet", koleksiyon: "kalemler", oge: {
          id: sorunId, aracId: a.id, tur: "sorun", ad, aciliyet, acilis: bugunISO(),
          anlatim: anlatim || null, ai: { ...ai, aciliyet }, fotolar: idler, not: ai.ozet,
        } }], "Sorun eklendi, herkese haber verildi");
        if (!tamam) throw new Error("Kaydedilemedi, tekrar dene");
      } catch (hata) {
        if (!p.isConnected) return;
        b.disabled = false;
        b.textContent = "✓ Ekle, herkes görsün";
        bilgi(hata.message);
      }
    };
  });
}

function sorunDuzenlePenceresi(a, k, taslak = {}) {
  const yeni = !k;
  k = k || { id: yeniId(), not: taslak.not };
  const fotoIdleri = [];
  pencere(yeni ? "Sorun bildir" : "Sorunu düzenle", `<form>
    ${alan("Kısaca ne oldu?", "ad", k.ad, 'required placeholder="ör. Motor ışığı yandı"')}
    <label class="alan">Ne kadar acil?<select name="aciliyet">${Object.entries(ACILIYET).map(([d, ad]) => `<option value="${d}" ${d === (k.aciliyet || "acil") ? "selected" : ""}>${ad}</option>`).join("")}</select></label>
    ${tarihAlani("Ne zamandan beri", "acilis", k.acilis || bugunISO())}
    ${notAlani(k.not)}
    ${taslak.fotolar?.length ? `<p class="aciklama" style="margin-top:8px">${taslak.fotolar.length} fotoğraf eklenecek.</p>` : ""}
    <button class="dugme genis" style="margin-top:16px">Kaydet</button>
    ${yeni ? "" : '<button type="button" class="dugme tehlike genis" style="margin-top:10px" data-sil>Sil</button>'}
  </form>`, (p) => {
    p.querySelector("form").onsubmit = async (e) => {
      e.preventDefault();
      const v = formVerisi(e.target);
      const oge = { id: k.id, aracId: a.id, tur: "sorun", ad: v.ad.trim(), aciliyet: v.aciliyet, acilis: v.acilis || bugunISO(), not: v.not.trim() || null };
      if (k.ai) oge.ai = { ...k.ai, aciliyet: v.aciliyet };
      try {
        if (taslak.fotolar?.length) oge.fotolar = await fotolariYukle(taslak.fotolar, fotoIdleri);
      } catch (hata) { return bilgi(hata.message); }
      kaydet([{ op: "kaydet", koleksiyon: "kalemler", oge }], yeni ? "Sorun eklendi, herkese haber verildi" : "Kaydedildi");
    };
    p.querySelector("[data-sil]")?.addEventListener("click", () => {
      if (!confirm("Bu sorun silinsin mi? (Çözüldüyse 'Çözüldü' de, geçmişe yazılsın.)")) return;
      kaydet([{ op: "sil", koleksiyon: "kalemler", id: k.id }], "Silindi", () =>
        kaydet([{ op: "kaydet", koleksiyon: "kalemler", oge: { id: k.id, silindi: false } }], "Geri alındı"));
    });
  });
}

function kayitPenceresi(a, id, varsayilanTur = "bakim") {
  const k = id ? aktifler(durum.kayitlar).find((x) => x.id === id) : { tur: varsayilanTur, tarih: bugunISO() };
  if (!k) return;
  const yeni = !id;
  pencere(yeni ? (k.tur === "yakit" ? "Yakıt ölçümü" : "Yeni kayıt") : "Kaydı düzenle", `<form>
    <label class="alan">Tür<select name="tur">${Object.entries(KAYIT_TURLERI).map(([d, ad]) => `<option value="${d}" ${d === k.tur ? "selected" : ""}>${ad}</option>`).join("")}</select></label>
    ${alan("Ne yapıldı?", "baslik", k.baslik, 'placeholder="ör. Ön lastikler değişti"')}
    <div class="yan-yana">${tarihAlani("Tarih", "tarih", k.tarih)}${sayiAlani("Km <small>(gösterge)</small>", "km", k.km)}</div>
    <div data-yakit class="yan-yana">${sayiAlani("Gidilen km", "gidilenKm", k.gidilenKm)}${sayiAlani("Alınan litre", "litre", k.litre)}</div>
    <p data-yakit class="aciklama" style="margin:8px 0 0">Depoyu full doldur, sonraki full dolumda aldığın litreyi ve aradaki km'yi yaz.</p>
    ${sayiAlani('Tutar <small>(TL)</small>', "tutar", k.tutar)}
    ${notAlani(k.not)}
    ${!yeni && k.kim ? `<p class="aciklama" style="margin-top:8px">Kaydeden: ${esc(k.kim)}</p>` : ""}
    <button class="dugme genis" style="margin-top:16px">Kaydet</button>
    ${yeni ? "" : '<button type="button" class="dugme tehlike genis" style="margin-top:10px" data-sil>Kaydı sil</button>'}
  </form>`, (p) => {
    const f = p.querySelector("form");
    const turGoster = () => p.querySelectorAll("[data-yakit]").forEach((el) => (el.hidden = f.tur.value !== "yakit"));
    f.tur.onchange = turGoster;
    turGoster();
    f.onsubmit = (e) => {
      e.preventDefault();
      const v = formVerisi(f);
      const tarih = v.tarih || bugunISO();
      const kmDeger = sayiOku(v.km);
      const oge = {
        id: k.id || yeniId(), aracId: a.id, tur: v.tur, tarih, km: kmDeger,
        baslik: v.baslik.trim() || (v.tur === "yakit" ? "Yakıt ölçümü" : KAYIT_TURLERI[v.tur]),
        tutar: sayiOku(v.tutar), not: v.not.trim() || null,
        gidilenKm: v.tur === "yakit" ? sayiOku(v.gidilenKm) : null,
        litre: v.tur === "yakit" ? sayiOku(v.litre) : null,
      };
      if (yeni) oge.kim = kim;
      if (oge.tur === "yakit" && (!oge.gidilenKm || !oge.litre)) return bilgi("Gidilen km ve litreyi yaz");
      kaydet([{ op: "kaydet", koleksiyon: "kayitlar", oge }, ...kmIslemi(a, kmDeger, tarih)], "Kaydedildi");
    };
    p.querySelector("[data-sil]")?.addEventListener("click", () => {
      if (!confirm("Bu kayıt silinsin mi?")) return;
      kaydet([{ op: "sil", koleksiyon: "kayitlar", id: k.id }], "Silindi", () =>
        kaydet([{ op: "kaydet", koleksiyon: "kayitlar", oge: { id: k.id, silindi: false } }], "Geri alındı"));
    });
  });
}

const ARAC_ALANLARI = [
  ["ad", "Kısa adı (sekmede görünür)"], ["marka", "Marka"], ["model", "Model"], ["yil", "Model yılı"],
  ["motor", "Motor"], ["yakit", "Yakıt"], ["sanziman", "Şanzıman"], ["plaka", "Plaka"], ["sasi", "Şasi no"], ["renk", "Renk"],
];

function aracPenceresi(a) {
  const yeni = !a;
  a = a || {};
  pencere(yeni ? "Araç ekle" : `${a.ad}: bilgiler`, `<form>
    ${ARAC_ALANLARI.map(([ad, etiket]) => alan(etiket, ad, a[ad], ad === "ad" ? "required" : "")).join("")}
    <div class="yan-yana">${tarihAlani("İlk tescil", "ilkTescil", a.ilkTescil)}${tarihAlani("Bizde ne zamandan beri", "alis", a.alis)}</div>
    ${notAlani(a.not)}
    <button class="dugme genis" style="margin-top:16px">Kaydet</button>
    ${yeni ? "" : `<button type="button" class="dugme tehlike genis" style="margin-top:10px" data-arsiv>Arşive al (satıldı)</button>`}
  </form>`, (p) => {
    p.querySelector("form").onsubmit = (e) => {
      e.preventDefault();
      const v = formVerisi(e.target);
      const oge = { id: a.id || yeniId() };
      for (const [ad] of ARAC_ALANLARI) oge[ad] = v[ad].trim() || null;
      Object.assign(oge, { ilkTescil: v.ilkTescil || null, alis: v.alis || null, not: v.not.trim() || null });
      if (yeni) aktifArac = oge.id;
      kaydet([{ op: "kaydet", koleksiyon: "araclar", oge }], yeni ? "Araç eklendi" : "Kaydedildi");
    };
    p.querySelector("[data-arsiv]")?.addEventListener("click", () => {
      if (!confirm(`${a.ad} arşive alınsın mı? Kayıtları silinmez, Ayarlar'dan geri alınabilir.`)) return;
      kaydet([{ op: "kaydet", koleksiyon: "araclar", oge: { id: a.id, arsiv: true } }], "Arşive alındı");
    });
  });
}

function ayarlarPenceresi() {
  const arsivdekiler = aktifler(durum.araclar).filter((a) => a.arsiv);
  const izin = "Notification" in window ? Notification.permission : "yok";
  const bildirimDurumu = izin === "granted" && yerel.al("abone") === "1" ? "Açık" : izin === "denied" ? "Engelli (Chrome ayarlarından aç)" : "Kapalı";
  const link = `${location.origin}${location.pathname}#k=${anahtar}`;
  pencere("Ayarlar", `
    <dl class="bilgi-tablo" style="padding:0">
      <div><dt>Sen</dt><dd>${esc(kim)}</dd></div>
      <div><dt>Bildirimler</dt><dd>${esc(bildirimDurumu)}</dd></div>
    </dl>
    <div class="secim-liste">
      ${bildirimDurumu === "Açık" ? '<button class="dugme ikincil" data-test>Deneme bildirimi gönder</button>' : '<button class="dugme" data-bildirim>Bildirimleri aç</button>'}
      ${kurulumIstegi ? '<button class="dugme" data-kur>Ana ekrana ekle</button>' : ""}
      <button class="dugme ikincil" data-paylas>Aile linkini paylaş</button>
      <button class="dugme ikincil" data-kim>Adımı değiştir</button>
      <button class="dugme ikincil" data-arac>Araç ekle</button>
      ${arsivdekiler.map((a) => `<button class="dugme ikincil" data-geri="${esc(a.id)}">Arşivden çıkar: ${esc(a.ad)}</button>`).join("")}
    </div>
    <p class="aciklama">Her sabah 09:00'da yaklaşan işler için tek bir bildirim gelir: tarihe 30, 7 ve 1 gün kala, km'ye ~1.000 km kala. Pazartesileri gecikenler ve açık sorunlar hatırlatılır.</p>`, (p) => {
    p.querySelector("[data-bildirim]")?.addEventListener("click", bildirimAc);
    p.querySelector("[data-test]")?.addEventListener("click", testBildirimi);
    p.querySelector("[data-kur]")?.addEventListener("click", async () => {
      kurulumIstegi.prompt();
      await kurulumIstegi.userChoice;
      kurulumIstegi = null;
      kapat();
    });
    p.querySelector("[data-paylas]").onclick = async () => {
      const metin = "Araçlarımız: Auris ve i20'nin bakım takibi. Linke dokun, açılınca menüden 'Ana ekrana ekle' de ve bildirimlere izin ver.";
      if (navigator.share) {
        try { await navigator.share({ title: "Araçlarımız", text: metin, url: link }); } catch {}
      } else {
        try { await navigator.clipboard.writeText(link); bilgi("Link kopyalandı"); } catch { prompt("Linki kopyala:", link); }
      }
    };
    p.querySelector("[data-kim]").onclick = () => { kim = null; yerel.koy("kim", null); kapat(); ciz(); };
    p.querySelector("[data-arac]").onclick = () => aracPenceresi(null);
    p.querySelectorAll("[data-geri]").forEach((b) => (b.onclick = () =>
      kaydet([{ op: "kaydet", koleksiyon: "araclar", oge: { id: b.dataset.geri, arsiv: false } }], "Arşivden çıkarıldı")));
  });
}

// ---------- bildirimler ----------
function anahtarDonustur(b64) {
  const dolgu = "=".repeat((4 - (b64.length % 4)) % 4);
  const ham = atob((b64 + dolgu).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(ham, (c) => c.charCodeAt(0));
}

async function bildirimAc() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return bilgi("Bu tarayıcı bildirim desteklemiyor. Chrome ile aç.");
  if (!vapid) return bilgi("İnternet yok, sonra tekrar dene");
  const izin = await Notification.requestPermission();
  if (izin !== "granted") { ciz(); return bilgi("İzin verilmedi"); }
  try {
    const kayit = await navigator.serviceWorker.ready;
    let sub = await kayit.pushManager.getSubscription();
    if (!sub) sub = await kayit.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: anahtarDonustur(vapid) });
    await api("abone", { sub: sub.toJSON(), kim });
    benimEndpoint = sub.endpoint;
    yerel.koy("abone", "1");
    kapat();
    ciz();
    bilgi("Bildirimler açıldı 👍");
  } catch (e) {
    bilgi("Bildirim açılamadı: " + e.message);
  }
}

async function aboneligiTazele() {
  if (!anahtar || !kim || !("serviceWorker" in navigator) || !("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const kayit = await navigator.serviceWorker.ready;
    const sub = await kayit.pushManager.getSubscription();
    if (sub) { benimEndpoint = sub.endpoint; await api("abone", { sub: sub.toJSON(), kim }); yerel.koy("abone", "1"); }
    else yerel.koy("abone", null);
  } catch {}
}

async function testBildirimi() {
  try {
    const kayit = await navigator.serviceWorker.ready;
    const sub = await kayit.pushManager.getSubscription();
    if (!sub) return bildirimAc();
    await api("bildirim", { mod: "test", endpoint: sub.endpoint });
    bilgi("Gönderildi, birkaç saniye içinde gelir");
  } catch (e) {
    bilgi(e.message);
  }
}

// ---------- başlat ----------
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); kurulumIstegi = e; });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") kapat(); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && anahtar && $("#tabaka").hidden) yukle(); });
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
yukle().then(aboneligiTazele);
setInterval(tazele, 15000);
