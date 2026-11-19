// Ortak hesaplar: hem telefondaki app hem sunucudaki sabah bildirimi bunu kullanır.

export const KOLEKSIYONLAR = ["araclar", "kalemler", "kayitlar", "kmKayitlari"];

const AYLAR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

export function bugunISO(simdi = new Date()) {
  return simdi.toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
}

function utc(iso) {
  const [y, a, g] = iso.split("-").map(Number);
  return Date.UTC(y, a - 1, g);
}

export function gunFarki(aISO, bISO) {
  return Math.round((utc(bISO) - utc(aISO)) / 864e5);
}

export function gunEkle(iso, n) {
  return new Date(utc(iso) + n * 864e5).toISOString().slice(0, 10);
}

export function ayEkle(iso, n) {
  const [y, a, g] = iso.split("-").map(Number);
  const hedef = new Date(Date.UTC(y, a - 1 + n, 1));
  const sonGun = new Date(Date.UTC(hedef.getUTCFullYear(), hedef.getUTCMonth() + 1, 0)).getUTCDate();
  hedef.setUTCDate(Math.min(g, sonGun));
  return hedef.toISOString().slice(0, 10);
}

export function tarihYaz(iso, yilla = true) {
  if (!iso) return "";
  const [y, a, g] = iso.split("-").map(Number);
  return `${g} ${AYLAR[a - 1]}${yilla ? " " + y : ""}`;
}

export function sayi(n) {
  return Math.round(n).toLocaleString("tr-TR");
}

export function aktifler(liste) {
  return (liste || []).filter((o) => !o.silindi);
}

// Aracın km kayıtlarından son km, günlük ortalama ve bugün için tahmin
export function kmBilgisi(durum, aracId, bugun = bugunISO()) {
  const kayitlar = aktifler(durum.kmKayitlari)
    .filter((k) => k.aracId === aracId && k.km > 0 && k.tarih)
    // Aynı gün birden fazla girildiyse en son girilen geçerli (yanlış yazılan düzeltilebilsin)
    .sort((a, b) => (a.tarih === b.tarih ? (a.guncelleme || "").localeCompare(b.guncelleme || "") : a.tarih < b.tarih ? -1 : 1));
  if (!kayitlar.length) return { sonKm: null, sonTarih: null, hiz: null, tahmini: null };
  const son = kayitlar[kayitlar.length - 1];
  const baslangic = kayitlar.find((k) => gunFarki(k.tarih, son.tarih) <= 400) || kayitlar[0];
  const gun = gunFarki(baslangic.tarih, son.tarih);
  let hiz = gun >= 14 ? (son.km - baslangic.km) / gun : null;
  if (hiz !== null && hiz <= 0) hiz = null;
  const gecen = Math.max(0, gunFarki(son.tarih, bugun));
  const tahmini = hiz ? Math.round(son.km + hiz * gecen) : son.km;
  return { sonKm: son.km, sonTarih: son.tarih, hiz, tahmini };
}

// Bir kontrol kaleminin bugünkü durumu
// seviye: gecikti | yaklasiyor | eksik | tamam
export function kalemDurum(kalem, km, bugun = bugunISO()) {
  const sonuc = { seviye: "tamam", metin: "", gunKaldi: null, kmKaldi: null, tahminiTarih: null };
  const parcalar = [];
  let enYakinGun = Infinity;

  if (kalem.sonrakiTarih) {
    const g = gunFarki(bugun, kalem.sonrakiTarih);
    sonuc.gunKaldi = g;
    enYakinGun = Math.min(enYakinGun, g);
    parcalar.push(g < 0 ? `${-g} gün gecikti` : g === 0 ? "Bugün" : `${g} gün kaldı`);
  }
  if (kalem.sonrakiKm && km && km.tahmini !== null) {
    const kalan = kalem.sonrakiKm - km.tahmini;
    sonuc.kmKaldi = kalan;
    let metin = kalan < 0 ? `~${sayi(-kalan)} km geçti` : `~${sayi(kalan)} km kaldı`;
    if (km.hiz && kalan > 0) {
      const gun = Math.round(kalan / km.hiz);
      sonuc.tahminiTarih = gunEkle(bugun, gun);
      enYakinGun = Math.min(enYakinGun, gun);
      metin += ` (tahmini ${tarihYaz(sonuc.tahminiTarih)})`;
    } else if (kalan <= 0) {
      enYakinGun = Math.min(enYakinGun, -1);
    }
    parcalar.push(metin);
  } else if (kalem.sonrakiKm && !kalem.sonrakiTarih) {
    // Aracın km'si hiç girilmemiş: ne kadar kaldığı bilinemez
    return { ...sonuc, seviye: "eksik", metin: `${sayi(kalem.sonrakiKm)} km'de · aracın km'si girilmedi`, sira: 2e6 };
  } else if (kalem.sonrakiKm) {
    parcalar.push(`${sayi(kalem.sonrakiKm)} km'de`);
  }

  if (!parcalar.length) {
    sonuc.seviye = "eksik";
    sonuc.metin = "Tarih / km girilmedi";
    sonuc.sira = 2e6;
    return sonuc;
  }
  const gecikti = (sonuc.gunKaldi !== null && sonuc.gunKaldi < 0) || (sonuc.kmKaldi !== null && sonuc.kmKaldi < 0);
  const yakin = (sonuc.gunKaldi !== null && sonuc.gunKaldi <= 30) || (sonuc.kmKaldi !== null && sonuc.kmKaldi <= 1000);
  sonuc.seviye = gecikti ? "gecikti" : yakin ? "yaklasiyor" : "tamam";
  sonuc.metin = parcalar.join(" · ");
  const taban = { gecikti: 0, yaklasiyor: 1e6, tamam: 3e6 }[sonuc.seviye];
  sonuc.sira = taban + (Number.isFinite(enYakinGun) ? enYakinGun : 5e5);
  return sonuc;
}

// "Yapıldı" denince bir sonrakini aralığa göre hesapla
export function sonrakiHesapla(kalem, tarih, km) {
  const s = { sonrakiTarih: null, sonrakiKm: null };
  if (tarih && kalem.aralikAy) s.sonrakiTarih = ayEkle(tarih, Number(kalem.aralikAy));
  else if (tarih && kalem.aralikGun) s.sonrakiTarih = gunEkle(tarih, Number(kalem.aralikGun));
  if (km && kalem.aralikKm) s.sonrakiKm = Number(km) + Number(kalem.aralikKm);
  return s;
}

export function aracKalemleri(durum, aracId) {
  return aktifler(durum.kalemler).filter((k) => k.aracId === aracId);
}

// Sabah bildirimi: bugün söylenecekler. Aynı km eşiği iki kez söylenmesin diye
// "gonderilen" kümesine bakar, yenilerini "yeniAnahtarlar"a koyar.
export function bildirimListesi(durum, bugun = bugunISO(), gonderilen = {}) {
  const satirlar = [];
  const yeniAnahtarlar = [];
  const haftaninGunu = new Date(utc(bugun)).getUTCDay(); // 1 = Pazartesi
  const pazartesi = haftaninGunu === 1;
  const ayinIlkPazartesi = pazartesi && Number(bugun.slice(8)) <= 7;

  for (const arac of aktifler(durum.araclar).filter((a) => !a.arsiv)) {
    const km = kmBilgisi(durum, arac.id, bugun);
    const kalemler = aracKalemleri(durum, arac.id);
    let eksikSayisi = 0;

    for (const kalem of kalemler) {
      if (kalem.tur === "sorun") {
        if (!kalem.cozuldu && pazartesi) satirlar.push(`${arac.ad}: açık sorun, ${kalem.ad}`);
        continue;
      }
      const d = kalemDurum(kalem, km, bugun);
      if (d.seviye === "eksik") {
        eksikSayisi++;
        continue;
      }
      if (d.gunKaldi !== null) {
        const g = d.gunKaldi;
        if (g < 0) {
          if (pazartesi) satirlar.push(`${arac.ad}: ${kalem.ad}, ${-g} gün gecikti`);
        } else {
          // Eşik atlanırsa (sabah çalışmadıysa, tarih geç girildiyse) bir sonraki sabah yine söylenir
          const esikler = [0, 1, 7, 30];
          const esik = esikler.find((e) => g <= e);
          const anahtar = (e) => `${kalem.id}|${kalem.sonrakiTarih}|g${e}`;
          if (esik !== undefined && !gonderilen[anahtar(esik)]) {
            satirlar.push(g === 0 ? `${arac.ad}: ${kalem.ad}, son gün bugün` : `${arac.ad}: ${kalem.ad}, ${g} gün kaldı`);
            yeniAnahtarlar.push(...esikler.filter((e) => e >= esik).map(anahtar));
          }
        }
      }
      if (d.kmKaldi !== null) {
        const a1000 = `${kalem.id}|${kalem.sonrakiKm}|1000`;
        const a0 = `${kalem.id}|${kalem.sonrakiKm}|0`;
        if (d.kmKaldi <= 0) {
          if (!gonderilen[a0]) {
            satirlar.push(`${arac.ad}: ${kalem.ad} km'si geldi (${sayi(kalem.sonrakiKm)} km)`);
            yeniAnahtarlar.push(a0, a1000);
          } else if (pazartesi) {
            satirlar.push(`${arac.ad}: ${kalem.ad}, tahminen ${sayi(-d.kmKaldi)} km geçti`);
          }
        } else if (d.kmKaldi <= 1000 && !gonderilen[a1000]) {
          satirlar.push(`${arac.ad}: ${kalem.ad}, tahminen ${sayi(d.kmKaldi)} km kaldı`);
          yeniAnahtarlar.push(a1000);
        }
      }
    }
    if (eksikSayisi && ayinIlkPazartesi) satirlar.push(`${arac.ad}: ${eksikSayisi} kontrolün tarihi girilmemiş`);
    if (pazartesi && (!km.sonTarih || gunFarki(km.sonTarih, bugun) >= 30)) {
      satirlar.push(`${arac.ad}: km ${km.sonTarih ? gunFarki(km.sonTarih, bugun) + " gündür" : "hiç"} girilmedi`);
    }
  }
  return { satirlar, yeniAnahtarlar };
}
