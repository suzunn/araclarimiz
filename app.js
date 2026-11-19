import {
  aktifler, aracKalemleri, bugunISO, kalemDurum, kmBilgisi, sayi, sonrakiHesapla, tarihYaz,
} from "./hesap.js";

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const yeniId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
// "141.949" → 141949, "20,86" → 20.86, "20.86" → 20.86
const sayiOku = (v) => {
  let s = String(v ?? "").replace(/\s|tl|km|lt/gi, "");
  if (!s) return null;
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

function anahtarAl() {
  const m = location.hash.match(/k=([\w-]+)/);
  if (m) {
    yerel.koy("aile", m[1]);
    history.replaceState(null, "", location.pathname);
  }
  return yerel.al("aile");
}

async function api(yol, govde) {
  const r = await fetch(API + yol, {
    method: govde ? "POST" : "GET",
    headers: { "x-aile": anahtar || "", "content-type": "application/json" },
    body: govde ? JSON.stringify(govde) : undefined,
  });
  const v = await r.json().catch(() => ({}));
  if (!r.ok) {
    const hata = new Error(v.hata || "Sunucuya ulaşılamadı");
    hata.kod = r.status;
    throw hata;
  }
  return v;
}

async function yukle() {
  try {
    const v = await api("veri");
    durum = v.durum;
    vapid = v.vapid;
    cevrimdisi = false;
    yerel.koy("onbellek", JSON.stringify({ durum, vapid }));
  } catch (e) {
    if (e.kod === 401) {
      // Anahtarı silme: sunucuda geçici bir sorun olabilir, link tekrar açılınca düzelir
      linkGecersiz = true;
    } else {
      const eski = yerel.al("onbellek");
      if (eski) ({ durum, vapid } = JSON.parse(eski));
      cevrimdisi = true;
    }
  }
  ciz();
}

async function kaydet(islemler, mesaj, geriAl, pencereyiKapat = true) {
  if (bekliyor) return false;
  bekliyor = true;
  try {
    const v = await api("veri", { islemler, kim });
    durum = v.durum;
    yerel.koy("onbellek", JSON.stringify({ durum, vapid }));
    cevrimdisi = false;
    if (pencereyiKapat && !geriAlAktif) kapat();
    ciz();
    if (mesaj) bilgi(mesaj, geriAl);
    return true;
  } catch (e) {
    bilgi(e.message === "Failed to fetch" ? "İnternet yok, kaydedilemedi" : e.message);
    return false;
  } finally {
    bekliyor = false;
  }
}

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

  kok.innerHTML = `
    <header class="ust">
      <div class="ust-satir">
        <h1>Araçlarımız</h1>
        <button class="simge-dugme" id="ayarDugme" aria-label="Ayarlar">${SIMGE.ayar}</button>
      </div>
      <nav class="sekmeler" role="tablist">
        ${liste.map((x) => `<button class="sekme" role="tab" data-arac="${esc(x.id)}" aria-selected="${x.id === aktifArac}">${esc(x.ad)}</button>`).join("")}
      </nav>
    </header>
    ${cevrimdisi ? '<div class="cevrimdisi">İnternet yok: son kaydedilen bilgiler gösteriliyor</div>' : ""}
    <main>${a ? aracEkrani(a) : '<p>Henüz araç yok. Ayarlar\'dan ekleyebilirsin.</p>'}</main>
    ${a ? '<button class="fab" id="ekleDugme">+ Ekle</button>' : ""}`;

  kok.querySelectorAll("[data-arac]").forEach((b) => (b.onclick = () => {
    aktifArac = b.dataset.arac;
    yerel.koy("aktifArac", aktifArac);
    gecmisHepsi = false;
    ciz();
    scrollTo(0, 0);
  }));
  $("#ayarDugme").onclick = ayarlarPenceresi;
  if (!a) return;
  $("#ekleDugme").onclick = () => eklePenceresi(a);
  $("#kmDugme").onclick = () => kmPenceresi(a);
  $("#bildirimAc")?.addEventListener("click", bildirimAc);
  $("#bildirimGec")?.addEventListener("click", () => { yerel.koy("bildirimGec", bugunISO()); ciz(); });
  $("#tumGecmis")?.addEventListener("click", () => { gecmisHepsi = true; ciz(); });
  $("#aracDuzenle").onclick = () => aracPenceresi(a);
  $("#kontrolEkle").onclick = () => kalemDuzenlePenceresi(a, null);
  kok.querySelectorAll("[data-kalem]").forEach((b) => (b.onclick = () => kalemPenceresi(a, b.dataset.kalem)));
  kok.querySelectorAll("[data-kayit]").forEach((b) => (b.onclick = () => kayitPenceresi(a, b.dataset.kayit)));
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
  const km = kmBilgisi(durum, a.id, bugun);
  const kalemler = aracKalemleri(durum, a.id);
  const sorunlar = kalemler.filter((k) => k.tur === "sorun" && !k.cozuldu);
  const kontroller = kalemler
    .filter((k) => k.tur !== "sorun")
    .map((k) => ({ k, d: kalemDurum(k, km, bugun) }))
    .sort((x, y) => x.d.sira - y.d.sira);
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

  return `
    ${bildirimBandi()}
    <section>
      <div class="kart km-kart">
        <div>
          <div class="km-sayi">${km.sonKm ? sayi(km.sonKm) + " km" : "?"}</div>
          <div class="km-alt">${esc(kmAlt)}</div>
        </div>
        <button class="dugme ikincil" id="kmDugme">Km gir</button>
      </div>
    </section>

    ${sorunlar.length ? `<section>
      <h2>Açık sorunlar</h2>
      <ul class="liste kart">${sorunlar.map((k) => `<li class="sorun">
        <button class="satir" data-kalem="${esc(k.id)}"><span class="nokta"></span>
          <span class="satir-govde"><span class="satir-ad">${esc(k.ad)}</span>
          <span class="satir-alt">${k.acilis ? "Açılış: " + tarihYaz(k.acilis) : "Açık"}</span></span>${SIMGE.ok}</button></li>`).join("")}
      </ul></section>` : ""}

    <section>
      <h2>Kontroller</h2>
      <ul class="liste kart">
        ${kontroller.map(({ k, d }) => `<li class="${d.seviye}">
          <button class="satir" data-kalem="${esc(k.id)}"><span class="nokta"></span>
            <span class="satir-govde"><span class="satir-ad">${esc(k.ad)}</span>
            <span class="satir-alt">${esc(d.metin)}</span></span>${SIMGE.ok}</button></li>`).join("")}
        <li><button class="metin-dugme" id="kontrolEkle">+ Kontrol ekle</button></li>
      </ul>
    </section>

    <section>
      <h2>Geçmiş</h2>
      <ul class="liste kart">
        ${gosterilen.map((k) => `<li>
          <button class="satir" data-kayit="${esc(k.id)}">
            <span class="satir-govde"><span class="satir-ad">${esc(k.baslik || KAYIT_TURLERI[k.tur] || "Kayıt")}</span>
            <span class="satir-alt">${esc([tarihYaz(k.tarih), k.km ? sayi(k.km) + " km" : "", k.kim].filter(Boolean).join(" · "))}</span></span>
            <span class="satir-sag">${k.tur === "yakit" && k.gidilenKm && k.litre ? esc(((k.litre / k.gidilenKm) * 100).toFixed(1).replace(".", ",") + " lt") : esc(tl(k.tutar))}</span>
          </button></li>`).join("") || '<li><p class="toplam">Henüz kayıt yok</p></li>'}
        ${kayitlar.length > gosterilen.length ? `<li><button class="metin-dugme" id="tumGecmis">Tümünü göster (${kayitlar.length})</button></li>` : ""}
      </ul>
      <div class="km-alt" style="margin:8px 2px 0">${yilToplam ? `${yil} masrafı: <b>${sayi(yilToplam)} TL</b>` : ""}${yakitOrt ? `${yilToplam ? " · " : ""}Ortalama yakıt: <b>${yakitOrt.toFixed(1).replace(".", ",")} lt / 100 km</b>` : ""}</div>
    </section>

    <section>
      <details class="kart">
        <summary>Araç bilgileri ${SIMGE.ok}</summary>
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
    <p>${engelli ? "Bildirimler kapalı. Chrome'da adres çubuğundaki kilide dokunup bildirimlere izin ver." : "<b>Bildirimleri aç:</b> yaklaşan bakım, sigorta ve muayeneleri telefonuna haber verelim."}</p>
    ${engelli ? '<button class="simge-dugme" id="bildirimGec" aria-label="Kapat">' + SIMGE.kapat + "</button>" : '<button class="dugme" id="bildirimAc">Aç</button>'}
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
      else if (s === "sorun") sorunDuzenlePenceresi(a, null);
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

function sorunPenceresi(a, k) {
  pencere(k.ad, `
    <p class="aciklama">${esc([k.acilis && "Açılış: " + tarihYaz(k.acilis), k.not].filter(Boolean).join("\n"))}</p>
    <div class="dugme-sira">
      <button class="dugme" data-coz>✓ Çözüldü</button>
      <button class="dugme ikincil" data-duzenle>Düzenle</button>
    </div>`, (p) => {
    p.querySelector("[data-duzenle]").onclick = () => sorunDuzenlePenceresi(a, k);
    p.querySelector("[data-coz]").onclick = () => pencere(`Çözüldü: ${k.ad}`, `<form>
      ${tarihAlani("Ne zaman", "tarih", bugunISO())}
      ${sayiAlani('Tutar <small>(TL, isteğe bağlı)</small>', "tutar", "")}
      ${notAlani("")}
      <button class="dugme genis" style="margin-top:16px">Kaydet</button>
    </form>`, (p2) => {
      p2.querySelector("form").onsubmit = (e) => {
        e.preventDefault();
        const v = formVerisi(e.target);
        const tarih = v.tarih || bugunISO();
        const kayitId = yeniId();
        kaydet([
          { op: "kaydet", koleksiyon: "kalemler", oge: { id: k.id, cozuldu: tarih } },
          { op: "kaydet", koleksiyon: "kayitlar", oge: { id: kayitId, aracId: a.id, kalemId: k.id, tur: "tamir", tarih, baslik: `Çözüldü: ${k.ad}`, tutar: sayiOku(v.tutar), not: v.not.trim() || null, kim } },
        ], "Sorun kapatıldı", () => kaydet([
          { op: "kaydet", koleksiyon: "kalemler", oge: { id: k.id, cozuldu: null } },
          { op: "sil", koleksiyon: "kayitlar", id: kayitId },
        ], "Geri alındı"));
      };
    });
  });
}

function sorunDuzenlePenceresi(a, k) {
  const yeni = !k;
  k = k || {};
  pencere(yeni ? "Sorun bildir" : "Sorunu düzenle", `<form>
    ${alan("Ne oldu?", "ad", k.ad, 'required placeholder="ör. Motor ışığı yandı"')}
    ${tarihAlani("Ne zamandan beri", "acilis", k.acilis || bugunISO())}
    ${notAlani(k.not)}
    <button class="dugme genis" style="margin-top:16px">Kaydet</button>
    ${yeni ? "" : '<button type="button" class="dugme tehlike genis" style="margin-top:10px" data-sil>Sil</button>'}
  </form>`, (p) => {
    p.querySelector("form").onsubmit = (e) => {
      e.preventDefault();
      const v = formVerisi(e.target);
      kaydet([{ op: "kaydet", koleksiyon: "kalemler", oge: { id: k.id || yeniId(), aracId: a.id, tur: "sorun", ad: v.ad.trim(), acilis: v.acilis || bugunISO(), not: v.not.trim() || null } }],
        yeni ? "Sorun eklendi, herkes görecek" : "Kaydedildi");
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
        await navigator.clipboard?.writeText(link);
        bilgi("Link kopyalandı");
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
    if (sub) { await api("abone", { sub: sub.toJSON(), kim }); yerel.koy("abone", "1"); }
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
