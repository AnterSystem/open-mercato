# Anter System — prototyp etapów 0–6

Statyczny, przedwdrożeniowy prototyp wyprowadzony z `docs/anter-system-architektura-docelowa.md`.

- **Źródło wymagań:** `docs/anter-system-architektura-docelowa.md` (2026-09-18, Jakub Zygadło)
- **Drugie źródło:** działająca aplikacja Anter Site Configurator, odczytana z `localhost:5173` oraz z repozytorium `~/Documents/github-repo/anter-site-configurator`
- **Story mapa:** `story-map.md` w tym katalogu — **wygenerowana propozycja**, nie zatwierdzone wymaganie
- **Zakres:** wszystkie etapy wdrożenia 0–6 z tabeli „Etapy wdrożenia i zależności" (ekrany 1–24), odtworzenie stanu bieżącego konfiguratora (ekrany 25–32) pogłębiona ścieżka zamawiania w portalu dystrybutora (ekrany 33–39) oraz zwolnienie do wysyłki z obsługą wysyłki częściowej (ekrany 40–41)
- **Data:** 2026-09-19 · rewizja 2 · poprzednia rewizja: commit `bbdab8545` (rewizja 1, 32 ekrany)

## Co przybyło w rewizji 2

Siedem ekranów portalu dystrybutora (33–39): domknięta droga od logowania do złożonego
zamówienia i jego śledzenia. Powód: rewizja 1 pokazywała panel B2B czterema ekranami
szkicowymi, w których zamawianie zaczynało się od razu w konfiguratorze. Dokument
uzasadnia jednak panel „drobnymi, powtarzalnymi zamówieniami", a te konfiguratora nie
potrzebują — potrzebują katalogu i koszyka.

Portal ma teraz dwie drogi do zamówienia: **katalog → karta produktu → koszyk → potwierdzenie**
dla pozycji cennikowych oraz **konfigurator** (ekran 13, bez zmian) dla realizacji niestandardowych.
Ekran 35 pokazuje granicę między nimi: brama przesuwna nie ma ceny katalogowej i kieruje do konfiguratora.

Pasek nawigacji na górze dokumentu jest podzielony na trzy grupy, bo ekrany należą do trzech
różnych powierzchni i mieszanie ich w jednej liście zacierało granicę:

| Grupa | Ekrany | Co to jest |
| --- | --- | --- |
| Backoffice Anter | 25 | Wnętrze firmy: CRM, baza produktów, konfigurator wewnętrzny, ERP, transport |
| Portal dystrybutora | 13 | Powierzchnia partnerska — jedyne ekrany widziane spoza Anter System (wyróżnione obwódką) |
| Stan bieżący | 8 | Odtworzenie działającej aplikacji Anter Site Configurator, nie propozycja projektowa |

**Pasek śledzi bieżący ekran.** Wpis odpowiadający oglądanemu ekranowi jest podświetlony
(`aria-current="page"`), więc przy 41 ekranach widać, gdzie się jest. Podświetlenie nadąża za
wszystkimi trzema sposobami nawigacji: kliknięciem w pasku, przejściem wewnątrz mockupu
(przyciski i wiersze z `data-goto`) oraz zwykłym przewijaniem dokumentu. Działa też w trybie
prezentacji, gdzie widoczny jest tylko jeden ekran.

Ekrany 29 i 30 („Współpraca B2B") zostały w grupie „Stan bieżący", mimo że dotyczą relacji
z partnerem. Powód: są zapisem tego, co już działa, a nie projektem portalu — i są
powierzchnią współdzieloną, na której handlowiec Anter i partner pracują na tym samym
dokumencie. Przypisanie ich do portalu sugerowałoby, że partner widzi tam wszystko.

### Szkolenia rozdzielone od sprzedaży

Decyzja właściciela produktu podjęta w rewizji 2: **moduł szkoleniowy nie ma wpływu na rabat,
cennik ani typ konta.** Z prototypu zniknęły poziomy certyfikacji partnera (srebrny, złoty),
bo sama gradacja sugeruje korzyść handlową, nawet gdy nigdzie nie napisano, że rabat od niej
zależy.

Co konkretnie się zmieniło:

| Miejsce | Przed | Po |
| --- | --- | --- |
| Ekran 24, tytuł | „Moduł learning i sygnał do CRM" | „Moduł szkoleniowy" — samodzielny moduł wiedzy |
| Ekran 24, pasek górny | Odznaka „Poziom: srebrny" | usunięta |
| Ekran 24, postęp firmy | „Poziom certyfikacji: Srebrny", „Do poziomu złotego: 2 szkolenia" | postęp osób plus zdanie, że nie przekłada się na warunki |
| Ekran 24, co trafia do CRM | „Poziom certyfikacji firmy · Natychmiast" | wiersz usunięty; ukończone szkolenie przeklasyfikowane na zdarzenie **lekkie** (agregowane) |
| Ekran 24, „Otwarta kwestia" | pytanie, czy wiązać certyfikację z cennikiem | „Granica modułu" — rozstrzygnięcie, że rabat wynika wyłącznie z umowy |
| Ekran 16, karta w CRM | „Moduł learning" z poziomem certyfikacji firmy | „Postęp szkoleniowy" — sama kompetencja zespołu |
| Ekran 34, pulpit | pasek postępu certyfikacji | karta usunięta w całości |

### Wysyłka częściowa (ekrany 40–41)

Nowa reguła: **zamówienie gotowe w komplecie jedzie do wysyłki automatycznie, gotowe
częściowo zatrzymuje się i czeka na decyzję pracownika Anter System.** Decydujący ręcznie
wskazuje, które pozycje wysłać teraz.

Dwa ekrany:

- **40 — kolejka zwolnień.** Rozdziela obie ścieżki: komplet pokazuje się jako „zwolnione automatem" (zapis, nie zadanie), gotowe częściowo jako „czeka na decyzję" z przyciskiem. Planista widzi wyłącznie to, w czym naprawdę ma coś rozstrzygnąć.
- **41 — wybór pozycji.** Tabela pozycji z zaznaczeniem i ilością; pozycja niegotowa jest zablokowana i opisana terminem. Obok: waga i liczba paczek przesyłki, co zostaje w zamówieniu, oraz to, co zobaczy partner.

Trzy rzeczy, które ten przepływ wymusił:

1. **Koszt podziału jest pokazany przed decyzją.** Dwie przesyłki kosztują więcej niż jedna (w prototypie 720 + 890 wobec 1 420 w ofercie). Bez tej liczby „wyślijmy część" wygląda na darmową uprzejmość. Kto pokrywa różnicę — nierozstrzygnięte (A-24).
2. **Potrzebny jest nowy status „wysłane częściowo"** — dopisany do tabeli widoczności statusów na ekranie 19. Lista sześciu statusów z dokumentu go nie ma, a „wysłane" nieprawdziwie sugerowałoby komplet (A-25).
3. **Zamówienie pozostaje otwarte** do wysłania ostatniej pozycji i dopiero wtedy przechodzi w „dostarczone".

Partner widzi skutek, nie decyzję: status, numer przesyłki wysłanej części i termin reszty —
nigdy informacji, którego komponentu brakuje (CC-2). Czy powinien być pytany o zgodę zamiast
tylko informowany, pozostaje otwarte (A-23).

**Skutek po stronie partnera jest już narysowany.** Ekrany 15, 34 i 39 pokazują
ZAM-2026-1140 po decyzji z ekranu 41: status „wysłane częściowo" w kolorze ostrzegawczym,
numer pierwszej przesyłki, pozycje wysłane 19.09 i jedna czekająca na komponent z terminem
06.10. Szczegóły zamówienia rozbijają dostawę na dwie przesyłki, każdą z własnym numerem
i listem przewozowym.

**Dlaczego „wysłane" jest tu pomarańczowe.** Przy podziale na więcej niż jedną wysyłkę
wysyłka przestaje być stanem końcowym: część towaru jedzie, reszta czeka. Zielone „wysłane"
sugerowałoby domknięcie, którego nie ma. Oś realizacji ma więc teraz siedem kroków —
„wysłane częściowo" (ostrzegawcze, osiągnięte) i „wysłane w całości" (neutralne, przed nami).

**Momenty w czasie.** Ekrany 40 i 41 pokazują moment decyzji (zlecenie czeka na
rozstrzygnięcie), a 15, 34 i 39 jej skutek kilka dni później. To celowe przed/po na tym samym
zamówieniu, nie rozjazd danych. Ekran 21 trzyma status sprzed wysyłki (17.09), bo ilustruje
kolejkę zdarzeń zablokowanych przez zerwaną integrację.

### Obieg akceptacji zamówienia z konfiguratora

**Liczba kroków zależy od tego, czy konfiguracja miała cenę.**

| Tor | Kroki |
| --- | --- |
| Konfiguracja **z ceną** (konto pełne) | rewizja techniczna → zamówienie |
| Konfiguracja **bez ceny** (konto bez cen) | rewizja techniczna → wycena w backoffice → oferta → zamówienie |

Konto pełne rysuje po swoim cenniku, więc wartość jest znana w chwili złożenia i nie ma czego
wyceniać. Konto bez cen wysyła specyfikację — wycena jest osobnym krokiem, a jej wynikiem jest
oferta, na którą partner odpowiada zamówieniem.

**Rewizja techniczna jest w obu torach.** Konfigurator liczy ilości z geometrii, ale nie
rozstrzyga, czy rozwiązanie da się wykonać w danym miejscu: mocowanie do posadzki, kolizja
z instalacją, dostęp do serwisu. Dlatego konstruktor potwierdza każdy projekt — także ten,
który ma już cenę.

Kolejność w torze bez ceny jest celowa: **najpierw technika, potem pieniądze**. Wycena
projektu, który konstruktor i tak każe przerysować, jest pracą do wyrzucenia.

Ekran 46 pokazuje kolejkę obu torów. To rozstrzygnięcie luki odnotowanej przy pierwszej
rewizji prototypu — dokument architektury wskazywał obieg akceptacji jako rzecz do
doprecyzowania (A-29). Otwarte zostaje, co dzieje się z zamówieniem złożonym z ceną, gdy
konstruktor odrzuci rewizję.

### Konfigurator rysuje po planie obiektu

**Zamówienie powstaje z rysunku, nie z formularza.** Partner wgrywa rzut swojego obiektu,
klika produkt z katalogu i rysuje nim po planie; długości i liczby sztuk wynikają z geometrii.
Ta funkcja istnieje już w działającej aplikacji Anter Site Configurator (ekran 26) — prototyp
ścieżki docelowej pokazywał ją dotąd jako formularz z polami „produkt / ilość / szerokość / RAL",
co było sprzeczne z tym, jak konfigurator naprawdę działa.

Ekrany 9 i 13 zostały przebudowane na **to samo narzędzie**: ten sam podkład, ten sam rzut,
te same tryby rysowania (linia / punkt / wstawka), to samo liczenie zestawienia z geometrii.

**Konfigurator jest jeden. Różnice między trybami są dokładnie dwie:**

| | Tryb wewnętrzny (9) | Tryb partnerski (13) |
| --- | --- | --- |
| Ceny | katalogowa, koszt własny, marża przy cenie katalogowej i po rabacie | wyłącznie cena partnerska |
| Produkty | pełny katalog wewnętrzny | tylko pozycje z cennika partnera |
| Wyjście | przekazanie do oferty | dodanie do koszyka |

Reszta jest identyczna — i tak ma być, bo to jeden silnik obsługujący różne uprawnienia.
Na ekranie 9 widać to wprost: element 5 (bariera zewnętrzna H2) jest narysowany linią
przerywaną, bo jest poza cennikiem Stalmont. Pracownik może go dodać; partner otwierając ten
sam projekt zobaczy pozycję do wyceny, nie cenę.

**Trzeci tryb — konto bez cen — ma pełny dostęp do konfiguratora** (ekran 14) i do katalogu
(ekran 45). Partner rysuje po planie, dostaje to samo zestawienie z geometrii i tę samą listę
produktów; znika wyłącznie kolumna z ceną i wartość projektu, a zamiast koszyka jest zapytanie
o wycenę. Terminy dostępności zostają widoczne, bo nie ujawniają cennika — ukrycie ich
utrudniłoby partnerowi planowanie, nie chroniąc żadnej informacji handlowej.

Katalog bez cen (45) to ten sam katalog co ekran 35 z usuniętymi dwiema kolumnami cenowymi.
W ich miejsce wchodzi kolumna **Parametry**: bez cen partner potrzebuje innego kryterium
porównania produktów. Wariant z cenami pozostaje bez zmian.

**Widoczność cen i wysokość rabatu ustawia opiekun na karcie partnera** — ekran 17, sekcje
„Typ konta i widoczność cen" (pełne / bez cen / podgląd) oraz „Rabaty per grupa produktowa"
z datą obowiązywania. Przełączenie konta na „pełne" odsłania kolumny cenowe i koszyk, nie
zmieniając niczego innego: to ten sam katalog i ten sam konfigurator.

**Podkład pochodzi z planów testowych** (`plany-testowe/`, trzy rysunki AS-TEST-01…03:
magazyn wysokiego składowania, hala produkcyjna, terminal cross-dock). Każdy ma sekcję
**„punkty do analizy (test konfiguratora)"** — naroża regałów przy drogach roboczych, słupy
w ciągach komunikacyjnych, stanowiska przy dokach, przejścia piesze, wejścia techniczne —
i adnotację, że barier ani odbojnic na planie nie naniesiono. To jest materiał wejściowy:
plan mówi, gdzie zabezpieczenia są potrzebne, konfigurator pozwala je tam postawić.

Karta „Punkty wykryte z planu" pokazuje pokrycie: 48/48 naroży, 20/20 słupów, 4/4 przejścia
zabezpieczone, a doki, wejścia techniczne i stacja ładowania jeszcze nie. Konfigurator
pokazuje, czego partner nie objął, ale nie zmusza do kompletu — zakres jest jego decyzją.

Rzut w prototypie jest schematycznym SVG wzorowanym na AS-TEST-01, nie odczytem pliku.
Rysowanie, przyciąganie do siatki i przeliczanie są zilustrowane, nie zaimplementowane.

### Zamówienia i Produkcja: podział według perspektywy

Backoffice ma dwa widoki na tę samą rzeczywistość, rozdzielone tym, **kto i po co patrzy**:

| | Zamówienia (43) | Produkcja (18 tablica, 44 lista) |
| --- | --- | --- |
| Pytanie | kto zamówił, za ile, skąd i na jakim etapie | co wytworzyć, czy mamy z czego |
| Jednostka wiersza | **zamówienie** | **pozycja zamówienia** |
| Zakres | wszystkie zamówienia | pozycje: produkcyjne i magazynowe |
| Kto pracuje | sprzedaż, obsługa | planista produkcji |

Ekran 43 nie rozbija zamówień na pozycje — pokazuje numer, kontrahenta, datę, liczbę pozycji,
wartość, źródło i status. Rozbicie jest w produkcji, bo tam ma znaczenie operacyjne.

Produkcja ma dwa widoki przełączane u góry: **tablica** (18) układa zlecenia według etapu
wytwarzania, **lista** (44) układa pozycje zamówień według tego, co je blokuje. Pozycje
magazynowe są na liście widoczne, ale wyciszone — planista ich nie wytwarza, natomiast bez
nich nie odpowie na pytanie, czy całe zamówienie da się zwolnić do wysyłki (ekran 40).

Co z tego widać na przykładach w prototypie:

| Zamówienie | Rozbicie |
| --- | --- |
| ZAM-2026-1190 (z katalogu) | trzy pozycje, wszystkie z magazynu — nie powstaje żadne zlecenie produkcyjne |
| ZAM-2026-1164 | mieszane: brama do produkcji, napęd z magazynu |
| ZAM-2026-1140 | bariera do produkcji (czeka na komponent), słupki i osłony z magazynu — stąd wysyłka częściowa |
| ZAM-2026-1203 | pozycja wymaga produkcji, ale zlecenia jeszcze nie ma — „czeka na zlecenie" |

Sposób realizacji nie jest osobną listą utrzymywaną ręcznie: wynika z rekordu w bazie
produktów, który ma albo stan magazynowy pokrywający zamówioną ilość, albo strukturę
wykonawczą (CC-1, CC-7).

**Nazewnictwo:** pozycja „Zlecenia" w nawigacji backoffice nazywa się teraz **„Produkcja"**
(ekrany 18 i 19, wszystkie paski boczne). Zlecenie pozostaje obiektem — produkcja jest
obszarem, w którym się nim zarządza. Do pasków obszaru realizacji doszła pozycja „Zamówienia".

Otwarte: czy zlecenie ma powstawać automatycznie przy przyjęciu zamówienia, czy świadomie
ręcznie (A-27). Automat przyspiesza, ale odbiera kontrolę nad kolejnością i terminami.

### Oferta tylko poza ścieżką katalogową

**Zamówienie złożone bezpośrednio z katalogu nie generuje pliku z ofertą.** Partner zamawia
po cenie cennikowej wynikającej ze swojego rabatu, więc nie ma czego wyceniać ani zatwierdzać.
Oferta powstaje wyłącznie tam, gdzie cena wymaga ustalenia: konfiguracja niestandardowa,
wycena konstruktora, zapytanie z konta bez cen, temat prowadzony przez handlowca.

W prototypie widać to na ekranie 39: zamówienie oznaczone jako „z katalogu" ma w dokumentach
fakturę i listy przewozowe, bez oferty. Potwierdzenie idzie mailem przy złożeniu.

Dokument architektury wymienia ofertę wśród dokumentów zamówienia bez rozróżnienia ścieżki,
więc sam go nie rozstrzyga — **to decyzja właściciela produktu z 2026-09-19.** Jeśli ma być
trwała, warto dopisać rozróżnienie do dokumentu.

### Ponowienie zamówienia jako akcja koszyka

**„Ponów zamówienie" dodaje pozycje zamówienia do koszyka** w tych samych ilościach i przenosi
tam partnera — nie składa zamówienia od razu. Powód: ceny mogły się zmienić od poprzedniego
razu, a ilości przy kolejnym zamówieniu bywają inne. Koszyk jest miejscem, gdzie partner to
sprawdza i koryguje, zanim potwierdzi.

Akcja jest w dwóch miejscach, zgodnie z tym, skąd partner do niej sięga:

| Miejsce | Zasięg akcji |
| --- | --- |
| Lista zamówień (ekran 15) | przycisk „Ponów" przy każdym wierszu — całe zamówienie |
| Szczegóły zamówienia (ekran 39) | główna akcja ekranu — całe zamówienie |
| Pulpit, „Zamów ponownie" (ekran 34) | pojedyncze, regularnie zamawiane pozycje |

Na liście jest dostępna przy każdym zamówieniu, także tym w produkcji i oczekującym na
komponent — powtórzenie nie zależy od tego, czy poprzednie zostało dostarczone.

**Potwierdzenie zamówienia zniknęło ze szczegółów** (ekran 39): z nagłówka i z listy
dokumentów. Idzie mailem przy złożeniu i tyle wystarczy; komunikat na liście zamówień odsyła
teraz do maila, a nie do panelu. W dokumentach zamówienia zostają oferta, faktura i list
przewozowy.

### Filtr po kategorii produktu, bez limitu kupieckiego

**Filtrowanie w katalogu jest teraz jawnie po kategorii produktu.** Wcześniejszy przycisk
„Filtry" z licznikiem nie mówił, po czym filtruje, a aktywny chip deklarował kategorię
„zabezpieczenia wewnętrzne", której nie było wśród kategorii w tabeli — te brzmią Bramki,
Bramy, Bariery, Słupki, Osłony, Akcesoria. Filtr i dane się więc rozjeżdżały.

Zastąpił je wybór kategorii z listy pokrywającej dokładnie te sześć wartości, obecny w obu
widokach katalogu (ekran 35 i 42), domyślnie „Wszystkie kategorie".

**Limit kupiecki został usunięty z prototypu w całości** — z koszyka (ekran 37) i z warunków
handlowych w CRM (ekran 17). Zostawienie go po jednej stronie, gdy druga go nie pokazuje,
byłoby niespójne. Blokada konta za przeterminowane płatności zostaje: ona wynika wprost
z dokumentu źródłowego, limit był założeniem prototypu (A-22, wycofane).

### Katalog w widoku kafli (ekran 42)

Przełącznik Lista / Kafle na ekranie 35 był dotąd martwy. Teraz prowadzi do ekranu 42 i z
powrotem, więc oba widoki da się porównać na tych samych sześciu produktach i tych samych cenach.

Kafel niesie mniej niż wiersz listy i to jest jego sens: kategoria, nazwa, indeks, cena
partnerska wyróżniona rozmiarem, cena katalogowa jako odniesienie, termin dostępności oraz
dwie akcje — „Szczegóły" i „Do koszyka". Ostatni kafel pokazuje tę samą granicę co ostatni
wiersz listy: brama przesuwna nie ma ceny cennikowej i kieruje do konfiguratora.

**Warunek sensowności tego widoku:** zdjęcia. Prototyp nie ładuje żadnych obrazów, więc
miejsce na zdjęcie jest oznaczone symbolem — ale kafel bez zdjęcia niesie mniej informacji
niż wiersz listy przy większym zużyciu miejsca. Zdjęcia pochodziłyby z bazy produktów, z tego
samego rekordu co cena i struktura wykonawcza. Ile rekordów ma je dziś, pozostaje do
sprawdzenia (A-26).

Wybór widoku nie jest zapamiętywany między wejściami.

### Faktura zamiast kolumny dokumentów (ekran 15)

Lista zamówień miała kolumnę „Dokumenty" z przyciskiem innym w każdym wierszu — raz
potwierdzeniem, raz ofertą, raz listem przewozowym. Zastąpiła ją kolumna **Faktura**:
przycisk pojawia się wyłącznie tam, gdzie faktura istnieje, czyli po wysyłce, a wcześniej
komórka zostaje pusta (`—`), zamiast oferować pobranie dokumentu, którego jeszcze nie ma.

Reguła jest spójna z ekranem 39, gdzie faktura i list przewozowy są opisane jako dostępne
„po wysyłce". Komplet dokumentów zamówienia pozostaje w jego szczegółach.

**To odejście od dokumentu źródłowego.** Tabela „Informacje zwrotne z panelu B2B do CRM"
wiąże ukończone szkolenie z „certyfikacją partnera i poziomem konta" i klasyfikuje je jako
zdarzenie natychmiastowe. Prototyp już tego nie odwzorowuje. Jeśli decyzja ma być trwała,
dokument architektury wymaga poprawki w tym wierszu — inaczej oba źródła będą się rozjeżdżać.

Moduł szkoleniowy pozostaje w nawigacji głównej portalu jako samodzielna pozycja (ekran 24),
razem z materiałami przy produkcie.

Zmienione istniejące ekrany: nawigacja boczna w ekranach 13 i 15 została uspójniona z nowymi
ekranami (doszły pozycje Pulpit, Katalog i Koszyk; Zamówienia zmieniły ikonę, bo koszyk przejął
poprzednią), a wiersz ZAM-2026-1140 na ekranie 15 prowadzi teraz do szczegółów zamówienia.
Poza tym treść rewizji 1 pozostała nietknięta.

## Jak otworzyć

Otwórz `index.html` bezpośrednio w przeglądarce albo wystaw katalog na localhost, gdy
automatyzacja przeglądarki wymaga HTTP:

```bash
python3 -m http.server 8899 --bind 127.0.0.1
```

Serwer trzymaj przy bieżącej sesji terminala i zatrzymaj go zaraz po przeglądzie.

Pasek narzędzi obsługuje tryb klikania, tryb prezentacji i tryb komentarzy. Komentarze
nie są współpracą na żywo: zostają w tej przeglądarce, dopóki recenzent nie wybierze
**Export for repository**, nie podmieni `comments.js` i nie zacommituje wyniku.

## Skąd wzięła się story mapa

Dokument źródłowy nie zawierał user stories ani kryteriów akceptacji — opisuje warstwy
systemów, ścieżki procesu, źródła prawdy i kolejność wdrożenia. Skill wymaga historyjek
przed rysowaniem ekranów, więc story mapa została **wygenerowana** i zatwierdzona do
wygenerowania przez użytkownika w trakcie sesji, z zapowiedzią iteracji nad szczegółami.

Story mapa nie rozstrzyga żadnego z sześciu pytań otwartych dokumentu. Miejsca, w których
historyjka dotyka nierozstrzygniętej kwestii, są w niej oznaczone `[DO ROZSTRZYGNIĘCIA]`.

## Mapa ekranów

| # | Powierzchnia | Ekran | Etap | Pokrywa | Prowadzi do |
| --- | --- | --- | --- | --- | --- |
| s1 | backoffice | Leady — jeden punkt wejścia | 0 | US-0.1 | s2, s3, s4, s16 |
| s2 | backoffice | Szczegóły leada: prekwalifikacja agenta, decyzja kwalifikatora | 0 | US-0.1, US-0.3 | s1, s3 |
| s3 | backoffice | Szansa inwestycyjna z materiałem poaudytowym | 0 | US-0.2 | s9 |
| s4 | backoffice | Baza produktów — lista | 1 | US-1.1 | s5, s6, s9 |
| s5 | backoffice | Karta produktu — osiem warstw danych | 1 | US-1.1, US-1.4 | s4, s6, s7 |
| s6 | backoffice | Reguły i wykluczenia, konflikt reguł | 1 | US-1.2 | s5 |
| s7 | backoffice | Struktura wykonawcza wariantu | 1 | US-1.3, CC-7 | s5 |
| s8 | backoffice | Pusta baza produktów (pierwsze uruchomienie) | 1 | US-1.1, stan pusty | s5 |
| s9 | backoffice | Konfigurator w trybie wewnętrznym (ten sam co s13) | 2 | US-2.1, US-2.2, CC-1 | s11, s3 |
| s10 | backoffice | Przypadek nietypowy do wyceny konstruktora | 2 | US-2.3, CC-5 | s9, s11 |
| s11 | backoffice | Wycena i wyjście konfiguratora | 2 | US-2.4, CC-4 | s3, s9 |
| s12 | backoffice | Wycena bez uprawnienia do kosztu i marży | 2 | US-2.2, brak uprawnień | — |
| s13 | portal | Panel B2B — konfigurator na planie obiektu | 3 | US-3.1, US-2.1, CC-1 | s37, s34, s35 |
| s14 | portal | Panel B2B — konto bez cen (konfigurator bez wyceny) | 3 | US-3.2, CC-6 | s15, s45 |
| s15 | portal | Panel B2B — zamówienia i statusy z ERP | 3 | US-3.3, CC-2 | s13 |
| s16 | backoffice | Karta partnera w CRM — pętla zwrotna | 3 | US-3.4, US-3.5, CC-6 | s17 |
| s17 | backoffice | Warunki handlowe — z CRM do panelu | 3 | US-3.6, CC-3 | s16 |
| s18 | backoffice | Produkcja — kolejka zleceń | 4 | US-4.1, CC-1 | s19, s20, s22 |
| s19 | backoffice | Produkcja — zlecenie i braki komponentów | 4 | US-4.2, CC-7 | s18, s20 |
| s20 | backoffice | Zapotrzebowanie zakupowe | 4 | US-4.3 | s18 |
| s21 | backoffice | Zerwana integracja z ERP | 4 | US-4.4, stan błędu | s16 |
| s22 | backoffice | Wycena transportu i zlecenie przewozu | 5 | US-5.1, US-5.2, CC-5 | s23 |
| s23 | backoffice | Przesyłki i statusy dostawy | 5 | US-5.3 | s22 |
| s24 | portal | Moduł szkoleniowy (samodzielny, bez wpływu na warunki) | 6 | US-6.1, US-6.2 | s13, s15, s16 |
| s25 | stan bieżący | Konfigurator: warsztat, panel „Projekt" | stan bieżący | US-0.2 | s26, s27, s28 |
| s26 | stan bieżący | Konfigurator: plan, produkty i zestawienie | stan bieżący | US-2.1, CC-1 | s27, s31 |
| s27 | stan bieżący | Konfigurator: raport techniczny i BOM | stan bieżący | US-2.4, CC-4 | s26 |
| s28 | stan bieżący | Konfigurator: projekty terenowe | stan bieżący | US-0.2 | s25 |
| s29 | stan bieżący | Współpraca B2B: akceptacje techniczne | stan bieżący | US-3.2 | s30 |
| s30 | stan bieżący | Współpraca B2B: wyceny i zamówienia | stan bieżący | US-3.1, US-2.4 | s29 |
| s31 | stan bieżący | Konfigurator: biblioteka techniczna i konta | stan bieżący | US-1.1, US-1.3 | s26 |
| s32 | stan bieżący | Konfigurator: kalkulator energii uderzenia | stan bieżący | US-1.2 | s26 |
| s33 | portal | Portal dystrybutora — logowanie | 3 | US-3.1, A-16 | s34 |
| s34 | portal | Portal dystrybutora — pulpit | 3 | US-3.1, US-3.3, US-3.7 | s35, s37, s13, s15, s24, s39 |
| s35 | portal | Portal dystrybutora — katalog z cenami partnerskimi | 3 | US-3.7, CC-1, CC-3 | s36, s37, s13 |
| s36 | portal | Portal dystrybutora — karta produktu | 3 | US-3.7, US-1.1 | s35, s37 |
| s37 | portal | Portal dystrybutora — koszyk i podsumowanie | 3 | US-3.7, CC-5 | s35, s38 |
| s38 | portal | Portal dystrybutora — zamówienie złożone | 3 | US-3.1, US-3.4, CC-6 | s39, s15, s35 |
| s39 | portal | Portal dystrybutora — szczegóły zamówienia | 3 | US-3.3, CC-2 | s15 |
| s40 | backoffice | Zwolnienie do wysyłki — kolejka | 5 | US-5.3, US-5.4 | s41, s22 |
| s41 | backoffice | Wysyłka częściowa — wybór pozycji | 5 | US-5.4, CC-2, CC-5 | s22, s40 |
| s42 | portal | Katalog w widoku kafli | 3 | US-3.7, CC-1, CC-3 | s35, s36, s37, s13 |
| s45 | portal | Katalog na koncie bez cen | 3 | US-3.2, CC-3 | s14, s36 |
| s43 | backoffice | Backoffice — zamówienia (nagłówki) | 4 | US-4.1, US-4.5 | s44 |
| s44 | backoffice | Produkcja — lista zamówień z pozycjami | 4 | US-4.1, US-4.5, CC-1, CC-7 | s18, s19, s41 |
| s46 | backoffice | Zgłoszenia z konfiguratora: akceptacja i wycena | 2 | US-2.3, US-3.2, US-4.6, CC-5 | s13, s14, s11, s43 |

Stany brzegowe rozłożone na ekranach: pusty (s8), brak uprawnień (s12), konflikt reguł
(s6, s9), wyjście poza automatyzację (s10, s22, s35 w wierszu bramy przesuwnej), błąd
integracji (s21), blokada konta (s17), konto bez dostępu do konfiguratora (s14, blok
porównawczy), opóźnienie realizacji z terminem bez przyczyny (s39).

**Czego ścieżka zamawiania jeszcze nie pokazuje.** Rewizja 2 objęła rdzeń ścieżki, świadomie
bez stanów brzegowych portalu. Nie narysowano: pustego koszyka, konta zablokowanego za
przeterminowane płatności w momencie próby złożenia zamówienia, produktu poza cennikiem
danego partnera, przekroczenia limitu kupieckiego, niedostępności wybranego wariantu
i katalogu widzianego oczami konta bez cen (ekran 14 pokazuje tylko konfigurator w tym
trybie). Blokada konta jest z tych braków najważniejsza, bo dokument wymienia ją wprost
jako daną płynącą z CRM do panelu.

## Granica: powierzchnia portalowa

Ekrany s13, s14, s15, s24, s33–s39 oraz s42 są widokiem dystrybutora, czyli powierzchnią portalową,
a nie backoffice. Repo-lokalna instrukcja skilla normalnie odsyła taką pracę do wytycznych
właściwych dla tej powierzchni. Znalazły się tutaj, bo etap 3 i 6 należą do zamówionego
zakresu „wszystkie etapy" — decyzja użytkownika podjęta w trakcie sesji. Ich powłoka jest
celowo odróżnialna: marka konta partnera zamiast marki Anter System, inne pozycje
nawigacji, brak jakiegokolwiek wejścia do ERP.

Traktuj te dwanaście ekranów jako szkic przepływu, nie jako wytyczną wizualną dla portalu.
Rewizja 2 pogłębiła przepływ, nie warstwę wizualną: ścieżka zamawiania jest tu rozstrzygnięta
co do sekwencji, etykiet i momentów decyzji, ale układ, typografia i komponenty portalu
pozostają do zaprojektowania zgodnie z wytycznymi powierzchni portalowej.

## Ekrany 25–32: odtworzenie stanu bieżącego

Osiem ostatnich ekranów to **odwzorowanie istniejącej, działającej aplikacji**, a nie propozycja
projektowa. Dokument architektury wspominał tylko, że „wstępny draft konfiguratora jest gotowy" —
w rzeczywistości jest to narzędzie znacznie dalej posunięte, niż zakłada plan etapów.

Jak zostały odczytane: aplikacja działała pod `localhost:5173` i serwuje HTML renderowany po
stronie serwera, więc stan początkowy odczytałem bezpośrednio z odpowiedzi serwera. Widoki
ukryte za stanem klienta (modale, panele, zakładki) odczytałem z kodu źródłowego w
`~/Documents/github-repo/anter-site-configurator`, głównie `app/site-configurator.tsx`,
`app/partner-panel.tsx` i `app/library-manager.tsx`. **Nie była to sesja w przeglądarce** —
nie klikałem po interfejsie, więc animacje, zachowania przejściowe i responsywność pozostają
niesprawdzone.

### Co konfigurator już ma, a czego plan etapów nie przewidywał

| Funkcja w działającej aplikacji | Odpowiednik w architekturze docelowej | Wniosek |
| --- | --- | --- |
| Rysowanie zabezpieczeń na rzucie hali z automatycznym BOM, łącznie ze słupkami i kotwami | Etap 2 zakładał konfigurator atrybutowy, nie geometryczny | Wycena powstaje z geometrii, nie z formularza wariantów — to inny model danych niż zakładał etap 1 |
| Wersjonowanie dokumentu: numer, rewizja, status, „Sprawdził", blokada „dokument niekompletny" | Brak — obieg akceptacji oferty to rzecz do doprecyzowania | Obieg akceptacji częściowo już istnieje; warto go opisać, a nie projektować od zera |
| Zgłoszenie rewizji do konstruktora z komentarzem zakotwiczonym w pozycji rysunku | Brak odpowiednika | Akceptacja techniczna jest osobnym krokiem między projektem a ofertą |
| Blokada: nowa rewizja unieważnia akceptację i ofertę, nie da się zamówić na nieaktualnym rysunku | Brak odpowiednika | Działająca blokada optymistyczna — warto zachować przy integracji z CRM |
| Wycena partnerska: ceny pozycji, waluta, rabat, transport, termin ważności, zgłoszenie zamówienia | Etap 3, panel B2B | Znaczna część etapu 3 jest już zaimplementowana poza panelem B2B |
| Cztery role: właściciel, handlowiec, konstruktor, podgląd | Trzy typy kont B2B | Dwa różne modele uprawnień, które trzeba pogodzić |
| Biblioteka techniczna z obiegiem szkic → weryfikacja → zatwierdzenie | Etap 1, baza produktów | Baza produktów de facto już powstaje, w silniku konfiguratora |
| Kalkulator energii kinetycznej uderzenia | Brak odpowiednika | Parametry badań (energia, kąt, wysokość) to warstwa danych produktu, której dokument nie wymienia |
| Notatki głosowe, dyktowanie, porządkowanie notatki przez AI, zdjęcia z aparatu | „Szkice i zdjęcia poaudytowe" jako pliki | Materiał poaudytowy jest już ustrukturyzowany, nie jest luźnym zbiorem plików |

### Czego bibliotece konfiguratora brakuje do roli bazy produktów

Odczytane z `lib/product-library.ts` — biblioteka opisuje kod, kategorię, typ rysowania,
jednostkę, moduł standardowy, parametry badań, słupek, kotwę i liczbę kotew na słupek,
warunki mocowania, linki i status. **Nie ma** ceny bazowej, waluty, grupy rabatowej, wagi,
gabarytu, liczby paczek ani reguł wykluczeń między atrybutami. Bez tych warstw nie ruszy
wycena partnerska (etap 3), wycena transportu (etap 5) ani konfigurator regułowy z ekranu 6.

**Najważniejszy wniosek dla pytania otwartego „gdzie mieszka baza produktów":** dziś mieszka
w silniku konfiguratora. Ta decyzja nie została podjęta świadomie — zapadła przez implementację.
Warto rozstrzygnąć, czy ją usankcjonować i rozszerzyć bibliotekę o warstwę handlową
i logistyczną, czy wyprowadzić bazę na zewnątrz i sprowadzić bibliotekę do odczytu.

Jeden dodatek na ekranie 32 jest **rozszerzeniem, nie odtworzeniem**: tabela doboru produktu
z porównaniem energii. Działający kalkulator liczy samą energię i nie zestawia jej
z odpornością produktów z biblioteki.

## Co prototyp rozstrzyga, a co jest propozycją do odrzucenia

**Rozstrzyga** (wprost z dokumentu źródłowego, zachowane bez zmian):

- każda pozycja trafiająca na produkcję pochodzi z bazy produktów (CC-1),
- ERP jest wyłącznie wewnętrzny, na zewnątrz wychodzi tylko status (CC-2),
- jedno miejsce edycji per rodzaj danych; warunki handlowe powstają w CRM, panel je czyta (CC-3),
- zdarzenia handlowe z panelu tworzą obiekt w CRM natychmiast, lekkie są agregowane (CC-6),
- ERP czyta strukturę wykonawczą z bazy produktów i nie trzyma własnej definicji produktu (CC-7),
- standard idzie automatem, przypadek nietypowy świadomie wypada do człowieka (CC-5),
- trzy typy kont B2B i trzy tryby konfiguratora oraz to, co każdy widzi i może zrobić,
- sześć statusów zwrotnych i ich różna widoczność w CRM oraz w panelu B2B.

**Jest propozycją, którą można odrzucić** — założenia prototypu, nie ustalenia:

| ID | Założenie | Dlaczego było potrzebne | Jak je sprawdzić |
| --- | --- | --- | --- |
| A-1 | Rabaty są mieszane: per grupa produktowa, przypisane per partner (s17) | Ekran warunków handlowych musiał pokazać jakiś model | Dokument wskazuje strukturę rabatów jako rzecz do doprecyzowania — decyzja sprzedaży |
| A-2 | Zlecenie utrwala strukturę wykonawczą z dnia wystawienia (s19) | Trzeba było rozstrzygnąć, co się dzieje przy późniejszej zmianie rekordu produktu | Dokument mówi tylko, że ERP czyta strukturę z bazy; zachowanie przy zmianie nie jest opisane |
| A-3 | Rozstrzygnięcie toru leada jest cofalne do momentu powstania szansy (s2) | Bez tego kwalifikacja jest nieodwracalna przy pierwszym kliknięciu | Do potwierdzenia przy konfiguracji Pipedrive |
| A-4 | Blokada konta zatrzymuje zamówienia, ale zostawia dostęp do dokumentów i statusów (s17) | Dokument mówi „blokada konta", nie precyzuje zakresu | Decyzja sprzedaży i finansów |
| A-5 | Progi automatyzacji (spadek obrotu 18%, 15 dni bez ruchu, wartość porzuconej konfiguracji) (s16) | KPI i alerty musiały pokazać konkretne liczby | Dokument nie podaje progów — decyzja sprzedaży |
| A-6 | Materiał poaudytowy ma strukturę „strefy do zabezpieczenia" wyprowadzoną z notatki (s3) | Trzeba było pokazać, jak materiał staje się pozycjami konfiguratora | Do potwierdzenia z konstruktorami i audytorem |
| ~~A-7~~ | ~~Poziomy certyfikacji partnera (srebrny, złoty) (s16, s24)~~ | **Wycofane w rewizji 2** — decyzja właściciela produktu: szkolenia są rozdzielone od sprzedaży i nie wpływają na rabat. Szczegóły niżej | — |
| A-8 | Różnica między wyceną wstępną transportu a stawką rzeczywistą jest widoczna, ale nikomu nieprzypisana (s22) | Wycena w ofercie i stawka przewoźnika muszą się różnić | Kto pokrywa różnicę — decyzja sprzedaży |
| A-9 | Rola „obsługa zapytań" nie widzi kosztu i marży (s12) | Dokument dzieli tryby konfiguratora, ale nie definiuje ról wewnętrznych | Do ustalenia przy projektowaniu uprawnień |
| A-10 | Nazwy, indeksy, numery i wszystkie dane liczbowe | Ekrany potrzebowały treści | Wszystkie dane są fikcyjne; żadna liczba nie pochodzi z Anter System |
| A-11 | Agent prekwalifikuje, ale nigdy nie przypisuje toru samodzielnie (s1, s2) | Trzeba było rozstrzygnąć, czy rekomendacja bywa wiążąca | Decyzja procesowa: od toru zależy cennik, właściciel i dostęp do panelu B2B |
| A-12 | Pewność jest podawana jakościowo (wysoka / średnia / brak rekomendacji), nie procentem (s1, s2) | Lista i ekran szczegółów potrzebowały jednej skali | Do sprawdzenia z kwalifikatorem: czy progi mają być jawne i ile stopni jest użytecznych |
| A-13 | Powód zmiany toru jest wymagany i wraca do przeglądu skuteczności agenta (s2) | Bez tego nie ma z czego poprawiać prekwalifikacji | Decyzja procesowa: kto i jak często przegląda rozbieżności |
| A-14 | Zgodność historyczna agenta jest pokazywana w rozbiciu na tor (s2) | Zbiorcza liczba ukrywałaby słabszą kategorię | Wymaga pomiaru na realnych danych; 82% i 61% są przykładowe |
| A-15 | Agent oznacza „brak rekomendacji" zamiast zgadywać (s1, wiersz Nordgate) | Zgłoszenia obcojęzyczne i ubogie w dane muszą mieć jakiś stan | Do potwierdzenia: kiedy agent ma się wstrzymać i czy obsługuje inne języki |
| A-16 | Nie ma samodzielnej rejestracji; konto partnerskie zakłada opiekun Anter (s33) | Ekran logowania musiał rozstrzygnąć, co widzi ktoś bez konta | Wynika z logiki typów kont: dostęp do cennika zależy od umowy. Decyzja sprzedaży |
| A-17 | Partner widzi własny obrót narastająco i odległość do kolejnego progu rabatowego (s34) | Pulpit potrzebował treści odpowiadającej na „ile już wziąłem" | Dokument mówi o realizacji warunków umowy, ale nie o pokazywaniu progu partnerowi. Silny bodziec, ale ujawnia strukturę cennika — decyzja sprzedaży |
| A-18 | Cena katalogowa stoi obok ceny partnerskiej w katalogu i na karcie produktu (s35, s36) | Trzeba było rozstrzygnąć, czy uwidaczniać wartość rabatu | Alternatywa: wyłącznie cena partnera. Decyzja sprzedaży i polityki cenowej |
| A-19 | Partner podaje własny numer zamówienia, który trafia na wszystkie dokumenty (s37, s38, s39) | Bez tego partner nie połączy dostawy z własnym zleceniem u swojego klienta | Do potwierdzenia z dystrybutorami; wpływa na numerację dokumentów i ERP |
| A-20 | Zamówienie pokazuje status pojedynczej pozycji, nie tylko status całości (s39) | Zamówienie częściowo gotowe musiało jakoś wyglądać | Ujawnia więcej niż status zamówienia i może naruszać granicę wewnętrzności ERP (CC-2). Do rozstrzygnięcia razem z zakresem statusów zwrotnych |
| A-21 | Ścieżka katalogowa istnieje obok konfiguratora, a pozycja bez ceny katalogowej kieruje do konfiguratora (s35, s37) | Dokument opisuje panel przez konfigurator, ale uzasadnia go zamówieniami powtarzalnymi | Do potwierdzenia: ile pozycji realnie da się sprzedać z cennika bez konfiguracji. Wiąże się z pytaniem otwartym o liczbę produktów na start |
| ~~A-22~~ | ~~Limit kupiecki widoczny partnerowi~~ | **Wycofane** — decyzja właściciela produktu: limit kupiecki znika z prototypu w całości (koszyk i warunki handlowe w CRM) | — |
| A-23 | Decyzję o wysyłce częściowej podejmuje wyłącznie pracownik Anter System; partner nie jest o nią pytany (s41) | Ktoś musi rozstrzygać, a pytanie partnera wydłuża proces o rundę oczekiwania | Decyzja procesowa: kto ponosi skutek, gdy partner wolałby komplet w jednej dostawie |
| A-24 | Różnica kosztu drugiej przesyłki jest pokazana, ale nikomu nieprzypisana (s41) | Dwie wysyłki kosztują więcej niż jedna i decydujący musi to widzieć | Kto pokrywa różnicę — decyzja sprzedaży i finansów, ta sama luka co A-8 |
| A-25 | Status „wysłane częściowo" rozszerza listę sześciu statusów zwrotnych (s19, s41) | „Wysłane" nieprawdziwie sugerowałoby komplet | Wymaga decyzji przy projektowaniu integracji ERP i uzgodnienia z dokumentem |
| A-26 | Widok kafli ma sens tylko przy kompletnych zdjęciach produktów (s42) | Kafel bez zdjęcia niesie mniej informacji niż wiersz listy, więc traci rację bytu | Ile rekordów w bazie produktów ma dziś zdjęcia — do sprawdzenia przed decyzją o tym widoku |
| A-27 | Zlecenie produkcyjne dla pozycji wymagającej produkcji nie powstaje automatycznie — jest stan „czeka na zlecenie" (s43) | Trzeba było rozstrzygnąć, czy przyjęcie zamówienia od razu tworzy zlecenie | Decyzja produkcji i IT: automat przyspiesza, ale odbiera kontrolę nad kolejnością i terminami |
| A-28 | Zamówienia partnera są dostępne przez filtr kontrahenta na liście zamówień, a nie jako sekcja na karcie partnera (s16, s43) | Karta partnera pokazuje obrót i liczbę zamówień, ale nie ich listę | Do rozstrzygnięcia, czy opiekun ma widzieć zamówienia bez opuszczania karty partnera |
| A-29 | Obieg akceptacji: konfiguracja z ceną przechodzi tylko rewizję techniczną, bez ceny dodatkowo wycenę (s46) | Dokument wskazywał obieg akceptacji jako rzecz do doprecyzowania i nie mówił, kto zatwierdza konfigurację | **Rozstrzygnięte przez właściciela produktu.** Otwarte zostaje, co przy odrzuceniu rewizji dla zamówienia złożonego z ceną |

## Sprzeczności i braki wykryte przy rysowaniu przepływu

- **Obieg akceptacji oferty nie istnieje w dokumencie.** Ekran 11 pokazuje moment, w którym oferta powstaje, ale nie ma czego narysować dalej: dokument wskazuje ten obieg jako rzecz do doprecyzowania. Ścieżka inwestycyjna ma przez to lukę między ofertą a zamówieniem.
- **Wariant mieszany nie ma modelu rozliczenia.** Dokument mówi, że wystarczy powiązanie szansy z kontem dystrybutora, ale nie rozstrzyga, czy taka sprzedaż liczy się do obrotu partnera i realizacji warunków umowy. Ekran 2 pokazuje powiązanie, nie jego skutek.
- **Status „oczekuje na komponent" ujawnia informację produkcyjną.** Tabela statusów z dokumentu dopuszcza go w panelu „opcjonalnie, z terminem", co jest w napięciu z zasadą, że ERP jest wyłącznie wewnętrzny. Ekrany 15 i 19 pokazują wariant z terminem bez przyczyny.
- **IT Cube nie ma miejsca w architekturze docelowej.** Dokument pyta, czy zostaje, więc żaden ekran go nie zawiera. Jeśli zostaje, brakuje decyzji o granicy między nim a konfiguratorem.
- **Liczba produktów na start warunkuje etap 1**, ale ekran 8 (pusta baza) nie może zasugerować żadnej liczby, bo to pytanie otwarte.
- **Prekwalifikacja przez agenta nie występuje w dokumencie architektury.** Dokument mówi, że rozdzielenie leada następuje „w CRM, na podstawie formularza ze strony, źródła leada i istniejącej umowy partnerskiej", i nie rozstrzyga, kto lub co tego dokonuje. Ekran 2 zakłada agenta jako warstwę rekomendacji przed człowiekiem — to rozszerzenie zakresu, nie odczyt z dokumentu. Wymaga decyzji: czy agent działa na wszystkich kanałach wejścia, czy tylko na formularzu www.
- **Rola „kwalifikator leadów" nie jest opisana w dokumencie.** Tabela segmentów wymienia po stronie Anter „obsługę zapytań i wycen" oraz audytora, konstruktorów i handlowca. Czy kwalifikacja to osobna rola, czy zadanie opiekuna, pozostaje do ustalenia.

## Interakcje zilustrowane, nie zaimplementowane

- Przeciąganie kart na tablicy zleceń (s18) i wynikająca z niego zmiana statusu w CRM oraz panelu.
- Optymistyczny zapis rekordu produktu i wycofanie przy niepowodzeniu (s5).
- Cofnięcie usunięcia reguły (s6) — komunikat z akcją Cofnij jest widoczny, ale nieaktywny.
- Przeliczanie ceny partnerskiej po zmianie rabatu (s13, s17).
- Wysyłka i niepowodzenie wysyłki plików poaudytowych (s3).
- Przełącznik wariantu zmieniający całą strukturę wykonawczą (s7).
- Realne pobieranie dokumentów, ofert, faktur i listów przewozowych.
- Kolejkowanie i ponowna synchronizacja zdarzeń po awarii integracji (s21).
- Uruchomienie agenta prekwalifikacji, przeliczenie pewności i uwidocznienie pola „Powód innej decyzji" po zmianie toru (s2).
- Wiersze tabel mają styl najechania w wielu listach, ale tylko wiersze na ścieżce głównej prowadzą dalej. Pozostałe są nieaktywne.
- Dodanie pozycji do koszyka (s34, s35, s36) przenosi do koszyka, ale nie zmienia jego zawartości — koszyk ma stałe trzy pozycje. Licznik przy pozycji „Koszyk" jest taki sam na każdym ekranie.
- Zmiana ilości w koszyku (s37) nie przelicza podsumowania; przycisk „Przelicz" jest nieaktywny.
- Wybór wariantu i przełącznik samozamykacza na karcie produktu (s36) nie zmieniają ceny ani terminu.
- Usunięcie pozycji z koszyka (s37).
- Logowanie (s33) przechodzi do pulpitu niezależnie od treści pól; nie ma walidacji ani stanu błędnych danych.
- Wyszukiwanie, filtry i stronicowanie katalogu (s35) są statyczne.
- „Ponów zamówienie" (s15, s39) i „Zamów ponownie" (s34) przenoszą do koszyka, ale nie podmieniają jego zawartości — koszyk ma stałe trzy pozycje, więc nie odzwierciedla ponowionego zamówienia.

## Weryfikacja

**Kontrole statyczne — wykonane, wszystkie przeszły:**

| Kontrola | Wynik |
| --- | --- |
| Zbilansowanie znaczników HTML (parser stosowy) | OK |
| 39 sekcji `.screen` ze stabilnymi, unikalnymi identyfikatorami | OK |
| Wszystkie cele `data-goto` wskazują na istniejące ekrany | OK, 0 błędnych |
| Wszystkie odnośniki `href="#sN"` wskazują na istniejące ekrany | OK, 0 błędnych |
| Nawigacja paska pokrywa komplet 39 ekranów, bez duplikatów | OK |
| Pasek podzielony na trzy grupy (25 + 13 + 8 = 46) | OK |
| Podświetlenie bieżącego ekranu: wejście z adresu, przejście w mockupie, przewijanie | OK |
| Brak poziomów certyfikacji i sugestii wpływu szkoleń na rabat | OK |
| Status wysyłki częściowej spójny w liście, pulpicie i szczegółach zamówienia | OK |
| Konfigurator wewnętrzny i partnerski: ten sam plan i narzędzia, różne ceny i dostępność | OK |
| Wszystkie użyte ikony mają definicję w sprite, brak nieużywanych | OK |
| Wszystkie użyte zmienne CSS istnieją w `tokens.css` | OK, 0 brakujących |
| Brak wartości hex/rgb w znacznikach | OK |
| Brak twardych kolorów statusowych Tailwind | OK |
| Brak nadpisań `dark:` | OK |
| Style inline używają wyłącznie tokenów semantycznych | OK |
| `tokens.css` zsynchronizowany z `globals.css` | OK (`sync-tokens.mjs --check`) |

**Odczyt działającej aplikacji — wykonany bez przeglądarki.** Stan początkowy pobrany z
odpowiedzi SSR serwera `localhost:5173`, widoki za stanem klienta odczytane z kodu źródłowego.
Nie klikałem po interfejsie, więc przejścia, animacje i responsywność aplikacji źródłowej
pozostają niesprawdzone.

**Renderowanie w przeglądarce — zweryfikowane w rewizji 2, częściowo.** Playwright nadal nie
jest dostępny (brak `node_modules`), więc weryfikację przeprowadzono zainstalowanym lokalnie
Chrome w trybie headless, na katalogu wystawionym pod `http://127.0.0.1:8899`. Zrzuty leżą
w `evidence/` i pokazują stan po naprawach.

Ta metoda renderuje stronę, ale **nie klika po niej**. Żeby wyizolować pojedynczy ekran,
zrzuty powstały z tymczasowej kopii bez `prototype.js` i `comments.js`, z regułą CSS
pokazującą jeden ekran. Kopia została usunięta po weryfikacji.

| Sprawdzone zrzutem | Wynik |
| --- | --- |
| Renderowanie ekranów 33–39 w motywie jasnym | OK, po naprawie trzech usterek |
| Ekran 13 po uspójnieniu nawigacji | OK |
| Brak przycinania kart, tabel i paneli bocznych | OK |
| Czytelność notatek pod ekranami | OK, po naprawie kolizji `<b>` |

**Usterki znalezione i naprawione dzięki tym zrzutom:**

1. **Ikony w przyciskach `btn-icon` w ogóle się nie renderowały** — klasa nie dziedziczy po `.btn`, więc reguła `.btn svg { width: 1rem }` jej nie obejmowała, a SVG bez wymiarów rozpychał wiersze tabeli. Dotyczyło **41 przycisków w całym prototypie, także w rewizji 1**. Naprawione jedną regułą w `components.css` (`.btn-icon` dostał własny wymiar, wyrównanie i rozmiar ikony) zamiast zmiany 41 miejsc w HTML. Ekran 13 skorzystał na tym tak samo jak nowe.
2. **`<b>` w treści notatki kolidowało ze stylem numeratora** `.note b`, przez co wyróżnione słowo zamieniało się w czarne kółko i zasłaniało tekst. Pięć wystąpień zamienione na `<span class="strong">`.
3. **`.stack-2` nie układa pionowo elementów inline** — to tylko marginesy, więc `<span>` w karcie opiekuna (s34) i przyciski w karcie „Co dalej" (s38) sklejały się w jedną linię. Naprawione elementami blokowymi.

**Nadal niezweryfikowane, bo ta metoda tego nie obejmuje:** klikalność przejść i poprawność
`data-goto` w działaniu, tryb prezentacji, tryb komentarzy wraz z utrwalaniem i eksportem,
nawigacja klawiaturą, motyw ciemny, zachowanie przy wąskim oknie, przycinanie szuflady (s2)
i okna modalnego (s10). Do ich domknięcia nadal potrzebna jest sesja w przeglądarce
z Playwrightem.

## Ograniczenia

- HTML ilustruje przepływ i układ; to nie jest implementacja produkcyjna.
- Ikony używają wbudowanego sprite'a SVG zamiast `lucide-react` — wzorzec zakazany w kodzie produkcyjnym.
- Teksty są wpisane na sztywno zamiast przechodzić przez `useT()` — również zakazane w produkcji.
- Wszystkie rekordy są fikcyjne. Żadna nazwa firmy, osoby, indeks, numer ani kwota nie pochodzi z Anter System.
- `tokens.css` jest generowany. Odświeżaj go skryptem `sync-tokens.mjs`, nie ręcznie.
- Ani prototyp, ani jego akceptacja nie dowodzą zapotrzebowania użytkowników i nie spełniają Definition of Ready.
- Zrzuty w `evidence/` dokumentują renderowanie, nie działanie. Powstały bez skryptów prototypu, więc nie dowodzą, że przejścia, tryb prezentacji ani tryb komentarzy działają.
- Komentarze w prototypie nie są współpracą na żywo.
