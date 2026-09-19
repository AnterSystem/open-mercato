# Anter System — prototyp etapów 0–6

Statyczny, przedwdrożeniowy prototyp wyprowadzony z `docs/anter-system-architektura-docelowa.md`.

- **Źródło wymagań:** `docs/anter-system-architektura-docelowa.md` (2026-09-18, Jakub Zygadło)
- **Drugie źródło:** działająca aplikacja Anter Site Configurator, odczytana z `localhost:5173` oraz z repozytorium `~/Documents/github-repo/anter-site-configurator`
- **Story mapa:** `story-map.md` w tym katalogu — **wygenerowana propozycja**, nie zatwierdzone wymaganie
- **Zakres:** wszystkie etapy wdrożenia 0–6 z tabeli „Etapy wdrożenia i zależności" (ekrany 1–24) plus odtworzenie stanu bieżącego konfiguratora (ekrany 25–32)
- **Data:** 2026-09-18 · rewizja 1 · brak poprzedniej rewizji

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

| # | Ekran | Etap | Pokrywa | Prowadzi do |
| --- | --- | --- | --- | --- |
| s1 | Leady — jeden punkt wejścia | 0 | US-0.1 | s2, s3, s4, s16 |
| s2 | Szczegóły leada: prekwalifikacja agenta, decyzja kwalifikatora | 0 | US-0.1, US-0.3 | s1, s3 |
| s3 | Szansa inwestycyjna z materiałem poaudytowym | 0 | US-0.2 | s9 |
| s4 | Baza produktów — lista | 1 | US-1.1 | s5, s6, s9 |
| s5 | Karta produktu — osiem warstw danych | 1 | US-1.1, US-1.4 | s4, s6, s7 |
| s6 | Reguły i wykluczenia, konflikt reguł | 1 | US-1.2 | s5 |
| s7 | Struktura wykonawcza wariantu | 1 | US-1.3, CC-7 | s5 |
| s8 | Pusta baza produktów (pierwsze uruchomienie) | 1 | US-1.1, stan pusty | s5 |
| s9 | Konfigurator wewnętrzny | 2 | US-2.1, US-2.2 | s10, s11, s3 |
| s10 | Przypadek nietypowy do wyceny konstruktora | 2 | US-2.3, CC-5 | s9, s11 |
| s11 | Wycena i wyjście konfiguratora | 2 | US-2.4, CC-4 | s3, s9 |
| s12 | Wycena bez uprawnienia do kosztu i marży | 2 | US-2.2, brak uprawnień | — |
| s13 | Panel B2B — konto pełne składa zamówienie | 3 | US-3.1 | s15, s24 |
| s14 | Panel B2B — konto bez cen, zapytanie o wycenę | 3 | US-3.2 | s24 |
| s15 | Panel B2B — zamówienia i statusy z ERP | 3 | US-3.3, CC-2 | s13 |
| s16 | Karta partnera w CRM — pętla zwrotna | 3 | US-3.4, US-3.5, CC-6 | s17 |
| s17 | Warunki handlowe — z CRM do panelu | 3 | US-3.6, CC-3 | s16 |
| s18 | ERP — kolejka zleceń produkcyjnych | 4 | US-4.1, CC-1 | s19, s20, s22 |
| s19 | Zlecenie — rozbicie na komponenty i braki | 4 | US-4.2, CC-7 | s18, s20 |
| s20 | Zapotrzebowanie zakupowe | 4 | US-4.3 | s18 |
| s21 | Zerwana integracja z ERP | 4 | US-4.4, stan błędu | s16 |
| s22 | Wycena transportu i zlecenie przewozu | 5 | US-5.1, US-5.2, CC-5 | s23 |
| s23 | Przesyłki i statusy dostawy | 5 | US-5.3 | s22 |
| s24 | Moduł learning i sygnał do CRM | 6 | US-6.1, US-6.2 | s13, s15, s16 |
| s25 | Konfigurator: warsztat, panel „Projekt" | stan bieżący | US-0.2 | s26, s27, s28 |
| s26 | Konfigurator: plan, produkty i zestawienie | stan bieżący | US-2.1, CC-1 | s27, s31 |
| s27 | Konfigurator: raport techniczny i BOM | stan bieżący | US-2.4, CC-4 | s26 |
| s28 | Konfigurator: projekty terenowe | stan bieżący | US-0.2 | s25 |
| s29 | Współpraca B2B: akceptacje techniczne | stan bieżący | US-3.2 | s30 |
| s30 | Współpraca B2B: wyceny i zamówienia | stan bieżący | US-3.1, US-2.4 | s29 |
| s31 | Konfigurator: biblioteka techniczna i konta | stan bieżący | US-1.1, US-1.3 | s26 |
| s32 | Konfigurator: kalkulator energii uderzenia | stan bieżący | US-1.2 | s26 |

Stany brzegowe rozłożone na ekranach: pusty (s8), brak uprawnień (s12), konflikt reguł
(s6, s9), wyjście poza automatyzację (s10, s22), błąd integracji (s21), blokada konta (s17),
konto bez dostępu do konfiguratora (s14, blok porównawczy).

## Granica: powierzchnia portalowa

Ekrany s13, s14, s15 i s24 są widokiem dystrybutora, czyli powierzchnią portalową, a nie
backoffice. Repo-lokalna instrukcja skilla normalnie odsyła taką pracę do wytycznych
właściwych dla tej powierzchni. Znalazły się tutaj, bo etap 3 i 6 należą do zamówionego
zakresu „wszystkie etapy" — decyzja użytkownika podjęta w trakcie sesji. Ich powłoka jest
celowo odróżnialna: marka konta partnera zamiast marki Anter System, inne pozycje
nawigacji, brak jakiegokolwiek wejścia do ERP.

Traktuj te cztery ekrany jako szkic przepływu, nie jako wytyczną wizualną dla portalu.

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
| A-7 | Poziomy certyfikacji partnera (srebrny, złoty) (s16, s24) | Moduł learning musiał pokazać, do czego prowadzi postęp | Dokument nie wiąże certyfikacji z typem konta ani cennikiem |
| A-8 | Różnica między wyceną wstępną transportu a stawką rzeczywistą jest widoczna, ale nikomu nieprzypisana (s22) | Wycena w ofercie i stawka przewoźnika muszą się różnić | Kto pokrywa różnicę — decyzja sprzedaży |
| A-9 | Rola „obsługa zapytań" nie widzi kosztu i marży (s12) | Dokument dzieli tryby konfiguratora, ale nie definiuje ról wewnętrznych | Do ustalenia przy projektowaniu uprawnień |
| A-10 | Nazwy, indeksy, numery i wszystkie dane liczbowe | Ekrany potrzebowały treści | Wszystkie dane są fikcyjne; żadna liczba nie pochodzi z Anter System |
| A-11 | Agent prekwalifikuje, ale nigdy nie przypisuje toru samodzielnie (s1, s2) | Trzeba było rozstrzygnąć, czy rekomendacja bywa wiążąca | Decyzja procesowa: od toru zależy cennik, właściciel i dostęp do panelu B2B |
| A-12 | Pewność jest podawana jakościowo (wysoka / średnia / brak rekomendacji), nie procentem (s1, s2) | Lista i ekran szczegółów potrzebowały jednej skali | Do sprawdzenia z kwalifikatorem: czy progi mają być jawne i ile stopni jest użytecznych |
| A-13 | Powód zmiany toru jest wymagany i wraca do przeglądu skuteczności agenta (s2) | Bez tego nie ma z czego poprawiać prekwalifikacji | Decyzja procesowa: kto i jak często przegląda rozbieżności |
| A-14 | Zgodność historyczna agenta jest pokazywana w rozbiciu na tor (s2) | Zbiorcza liczba ukrywałaby słabszą kategorię | Wymaga pomiaru na realnych danych; 82% i 61% są przykładowe |
| A-15 | Agent oznacza „brak rekomendacji" zamiast zgadywać (s1, wiersz Nordgate) | Zgłoszenia obcojęzyczne i ubogie w dane muszą mieć jakiś stan | Do potwierdzenia: kiedy agent ma się wstrzymać i czy obsługuje inne języki |

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

## Weryfikacja

**Kontrole statyczne — wykonane, wszystkie przeszły:**

| Kontrola | Wynik |
| --- | --- |
| Zbilansowanie znaczników HTML (parser stosowy) | OK |
| 32 sekcje `.screen` ze stabilnymi, unikalnymi identyfikatorami | OK |
| Wszystkie cele `data-goto` wskazują na istniejące ekrany | OK, 0 błędnych |
| Wszystkie odnośniki `href="#sN"` wskazują na istniejące ekrany | OK, 0 błędnych |
| Nawigacja paska narzędzi pokrywa komplet 24 ekranów | OK |
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

**Przejście w przeglądarce — nie wykonane.** Skonfigurowany dostawca to Playwright
(`.ai/agentic.config.json` → `browser.provider`), ale w repozytorium nie ma zainstalowanego
`node_modules` ani pakietu Playwright, a instalacja zależności wykracza poza to, co ta sesja
może zrobić bez decyzji użytkownika. **Nie zweryfikowano zatem w przeglądarce:** renderowania
w obu motywach, braku przycinania szuflady (s2) i okna modalnego (s10), klikalności przejść,
nawigacji klawiaturą, działania trybu komentarzy, utrwalania komentarzy po przeładowaniu,
kotwiczenia pinezek, eksportu ani izolacji magazynu przeglądarki.

Żeby to domknąć, wystarczy zainstalować zależności i uruchomić przegląd na
`http://127.0.0.1:8899` po wystawieniu tego katalogu.

## Ograniczenia

- HTML ilustruje przepływ i układ; to nie jest implementacja produkcyjna.
- Ikony używają wbudowanego sprite'a SVG zamiast `lucide-react` — wzorzec zakazany w kodzie produkcyjnym.
- Teksty są wpisane na sztywno zamiast przechodzić przez `useT()` — również zakazane w produkcji.
- Wszystkie rekordy są fikcyjne. Żadna nazwa firmy, osoby, indeks, numer ani kwota nie pochodzi z Anter System.
- `tokens.css` jest generowany. Odświeżaj go skryptem `sync-tokens.mjs`, nie ręcznie.
- Ani prototyp, ani jego akceptacja nie dowodzą zapotrzebowania użytkowników i nie spełniają Definition of Ready.
- Komentarze w prototypie nie są współpracą na żywo.
