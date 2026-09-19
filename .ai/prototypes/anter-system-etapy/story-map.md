# Anter System — story mapa dla etapów 0–6

Propozycja wygenerowana na potrzeby prototypu `.ai/prototypes/anter-system-etapy/`.
Źródło faktów produktowych: `docs/anter-system-architektura-docelowa.md`.

Dokument architektury nie zawierał user stories ani kryteriów akceptacji. Ta mapa
jest **propozycją do iteracji**, nie zatwierdzonym wymaganiem. Nic w niej nie
rozstrzyga pytań otwartych z sekcji „Pytania otwarte" dokumentu źródłowego —
tam, gdzie historyjka dotyka nierozstrzygniętej kwestii, jest to oznaczone jako
`[DO ROZSTRZYGNIĘCIA]`.

Epiki są zorientowane na podróż użytkownika i odpowiadają etapom wdrożenia
z tabeli „Etapy wdrożenia i zależności".

## Reguły przekrojowe

Obowiązują w każdej historyjce; kryteria akceptacji poszczególnych historyjek
ich nie powtarzają.

| ID | Reguła | Źródło |
| --- | --- | --- |
| CC-1 | Każda pozycja, która ma trafić na produkcję, pochodzi z bazy produktów, a nie z opisu w mailu | §Architektura docelowa |
| CC-2 | ERP jest wyłącznie wewnętrzny; na zewnątrz wychodzi wyłącznie status | §Architektura docelowa, §ERP |
| CC-3 | Każdy rodzaj danych ma dokładnie jedno miejsce powstawania i edycji; reszta czyta | §Integracje |
| CC-4 | Wspólne identyfikatory: indeks produktu z wariantem, numer kontrahenta, numer oferty, numer zamówienia, numer zlecenia produkcyjnego | §Integracje |
| CC-5 | Standard idzie automatem, przypadek nietypowy świadomie wypada do człowieka zamiast blokować narzędzie | §Konfigurator, §Logistyka |
| CC-6 | Zdarzenia handlowe z panelu tworzą obiekt w CRM natychmiast; zdarzenia lekkie są agregowane | §Platforma B2B |
| CC-7 | ERP nie przechowuje własnej definicji produktu; czyta strukturę wykonawczą z bazy produktów | §ERP |

## EP-0 · Segmentacja leada i prowadzenie szansy (etap 0)

Cel etapu: koniec obsługi sprzedaży w skrzynce. CRM, a nie skrzynka, rozstrzyga,
którym torem idzie lead.

**US-0.1** · Jako handlowiec chcę zobaczyć przychodzące leady z ich źródłem, żeby
rozdzielić je na tor dystrybutorski i inwestycyjny, zanim ktokolwiek zacznie liczyć wycenę.

- Lista pokazuje źródło leada (strona www, targi, polecenie, inne aktywności promocyjne) i datę wpływu.
- Lead od firmy z podpisaną umową partnerską jest domyślnie proponowany jako tor dystrybutorski; propozycja jest widoczna i odrzucalna, nie automatyczna.
- Stan pusty: brak leadów w wybranym okresie pokazuje komunikat i akcję zmiany zakresu dat, nie pustą tabelę.
- Stan bez wyników: filtr niedający trafień pokazuje aktywne filtry i akcję ich wyczyszczenia.
- Rozstrzygnięcie toru jest cofalne dopóki nie powstała szansa; cofnięcie przywraca lead do kolejki kwalifikacji.
- Cała lista jest obsługiwalna z klawiatury, a ognisko po zamknięciu szuflady wraca do wiersza, z którego ją otwarto.

**US-0.2** · Jako handlowiec chcę prowadzić szansę inwestycyjną z materiałem
poaudytowym podpiętym do niej, żeby konstruktor pracował na komplecie danych, a nie na załącznikach z maila.

- Szansa trzyma szkice, zdjęcia i notatki poaudytowe jako materiał przy szansie, nie w osobnym katalogu.
- Widok pokazuje właściciela tematu i historię zmian statusu.
- Brak materiału poaudytowego jest widoczny jako brakujący warunek przejścia do projektu konstruktorów, nie jako cicha pustka.
- Błąd wysyłki pliku pozostawia pozostałe pliki nienaruszone i daje ponowienie dla tego jednego.

**US-0.3** · Jako handlowiec chcę powiązać szansę inwestycyjną z kontem dystrybutora,
żeby obsłużyć wariant mieszany bez zakładania osobnego procesu.

- Szansa może wskazywać konto dystrybutora jako stronę współpracującą przy zachowaniu toru inwestycyjnego.
- Powiązanie jest widoczne po obu stronach: na szansie i na karcie partnera.
- `[DO ROZSTRZYGNIĘCIA]` Wpływ takiego powiązania na rozliczenie warunków umowy partnerskiej nie jest opisany w dokumencie źródłowym.

## EP-1 · Baza produktów jako źródło prawdy (etap 1)

Cel etapu: fundament dla konfiguratora, panelu B2B i ERP. Warunek wejścia:
decyzja, gdzie fizycznie mieszka baza produktów.

**US-1.1** · Jako konstruktor chcę opisać rekord produktu przez wszystkie warstwy
danych, żeby jeden rekord obsłużył konfigurator, ERP, wycenę transportu i treści na www.

- Rekord obejmuje: identyfikację, atrybuty i warianty, reguły, akcesoria i zależności, strukturę wykonawczą, dane handlowe, logistykę, treści.
- Wartości domyślne są wypełnione dla rodziny produktu; pola pozostawione domyślnie są wizualnie odróżnialne od uzupełnionych ręcznie.
- Zapis jest optymistyczny: pozycja pojawia się na liście natychmiast, a niepowodzenie zapisu przywraca poprzedni stan wraz z komunikatem.
- Niekompletna struktura wykonawcza blokuje wyłącznie odbiorcę ERP, nie zapis rekordu.

**US-1.2** · Jako konstruktor chcę zdefiniować dopuszczalne kombinacje wariantów,
wykluczenia, minima i maksima, żeby konfigurator odrzucał niemożliwe do wykonania złożenia.

- Reguła opisuje: dopuszczalne kombinacje, wykluczenia, wartości domyślne, minima i maksima.
- Reguła sprzeczna z inną jest sygnalizowana przy zapisie ze wskazaniem konkretnej pary, nie ogólnym komunikatem.
- Podgląd pokazuje, ile wariantów przechodzi przez komplet reguł.
- Usunięcie reguły jest cofalne w obrębie sesji edycji.

**US-1.3** · Jako konstruktor chcę opisać listę komponentów i materiałów dla wariantu,
żeby ERP rozbił zamówienie na zapotrzebowanie bez ręcznego przepisywania.

- Struktura wykonawcza jest przypisana do wariantu, nie do rodziny produktu.
- Komponent bez indeksu jest oznaczony jako pozycja wymagająca uzupełnienia przed przekazaniem do ERP.

**US-1.4** · Jako osoba odpowiedzialna za cennik chcę ustawić cenę bazową, walutę,
jednostkę i grupę rabatową, żeby cena partnerska powstawała z umowy, a nie z arkusza.

- Produkt należy do grupy rabatowej; rabat wynika z umowy partnera przypisanej po stronie konta.
- Waluta i rynek są osobnym wymiarem, bo część dystrybutorów działa poza Polską.
- Brak uprawnień do cennika ukrywa pola cenowe zamiast pokazywać je jako wyszarzone.
- `[DO ROZSTRZYGNIĘCIA]` Struktura rabatów per partner, per grupa produktowa czy mieszana — dokument wskazuje to jako rzecz do doprecyzowania.

## EP-2 · Konfigurator w trybie wewnętrznym (etap 2)

Cel etapu: wyceny liczone szybciej i spójnie. Warunek wejścia: etap 1.

**US-2.1** · Jako pracownik Anter System chcę złożyć konfigurację z pozycji bazy
produktów, żeby specyfikacja i wycena powstały w jednym kroku zamiast ręcznego liczenia.

- Każda pozycja wyniku ma indeks z wariantem pochodzący z bazy produktów (CC-1, CC-4).
- Wybór niezgodny z regułą jest blokowany w miejscu wyboru z podaniem reguły, która go wyklucza.
- Akcesoria wymagane dobierają się automatycznie i są oznaczone jako dobrane, nie wybrane ręcznie.
- Konfiguracja jest zapisywalna i odtwarzalna bez utraty kroków.

**US-2.2** · Jako pracownik chcę widzieć cenę bazową, koszt i marżę, żeby świadomie
zejść z ceny w granicach, które znam.

- Tryb wewnętrzny pokazuje cenę bazową, koszt i marżę; tryb partnerski ich nie pokazuje.
- Rola bez uprawnienia do marży widzi wycenę bez kosztu i marży, z jawną informacją o ograniczeniu widoku, nie z pustym miejscem.

**US-2.3** · Jako pracownik chcę świadomie wyprowadzić przypadek nietypowy do wyceny
przez konstruktora, żeby brak reguły nie blokował całego narzędzia (CC-5).

- Pozycja bez pokrycia regułami jest oznaczana jako „do wyceny przez konstruktora" i nie wchodzi do sumy automatycznej.
- Konfiguracja zawierająca taką pozycję nadal daje się zapisać i przekazać dalej, z jawnym oznaczeniem wyceny niepełnej.
- Wymuszenie wariantu niestandardowego wymaga potwierdzenia i zostaje odnotowane przy konfiguracji.

**US-2.4** · Jako pracownik chcę przekazać wynik konfiguratora do oferty albo do szansy
w CRM, żeby zamówienie i zlecenie produkcyjne były pochodną oferty, a nie nowym dokumentem.

- Wyjście obejmuje: specyfikację techniczną, wycenę (cena bazowa, rabat, cena po rabacie, suma, waluta), dokument oferty lub zapytania, dane do przekazania dalej.
- Numer oferty jest nadawany raz i towarzyszy pozycji przez zamówienie i zlecenie (CC-4).
- Niedostępność CRM nie gubi konfiguracji: zostaje zapisana lokalnie z oznaczeniem oczekiwania na przekazanie.

## EP-3 · Panel B2B i pętla zwrotna do CRM (etap 3)

Cel etapu: drobne zamówienia schodzą z pracowników. Warunek wejścia: etap 2.
Ekrany partnerskie są powierzchnią portalową, nie backoffice.

**US-3.1** · Jako dystrybutor z kontem pełnym chcę złożyć zamówienie w panelu bez maila,
żeby nie czekać na ręczną wycenę drobnego tematu.

- Konto pełne widzi cenę partnerską wynikającą ze swojej umowy i składa zamówienie bezpośrednio.
- Konfiguracja zapisana bez zamówienia pozostaje dostępna do późniejszego użycia.
- Zamówienie złożone natychmiast tworzy obiekt w CRM (CC-6).

**US-3.2** · Jako dystrybutor z kontem bez cen chcę wysłać zapytanie o wycenę na
podstawie złożonej specyfikacji, żeby handlowiec nie odtwarzał jej z opisu.

- Konto bez cen składa konfigurację i wysyła zapytanie; ceny pozostają ukryte w całym widoku.
- Zapytanie tworzy aktywność lub szansę w CRM z przypisaniem do opiekuna (CC-6).
- Konto typu podgląd nie ma dostępu do konfiguratora; próba wejścia pokazuje, czego brakuje i do kogo się zwrócić.

**US-3.3** · Jako dystrybutor chcę śledzić statusy zamówień i pobrać dokumenty,
żeby nie pytać mailem „gdzie jest".

- Widoczne statusy: przyjęte, w produkcji, gotowe do wysyłki, wysłane z numerem przesyłki, dostarczone.
- Status „oczekuje na komponent" jest opcjonalny w panelu i pokazywany z terminem.
- Dokumenty przy zamówieniu: oferta, potwierdzenie, faktura, dokumenty przewozowe.

**US-3.4** · Jako opiekun partnera chcę widzieć na karcie kontrahenta, co partner
robił w panelu, żeby nie stracić widoczności, którą dziś daje skrzynka.

- Karta pokazuje: datę ostatniego zamówienia i logowania, obrót narastająco i liczbę zamówień w okresie, porzucone konfiguracje z wartością, postęp w module learning, otwarte zgłoszenia i statusy realizacji.
- Zdarzenia lekkie (logowania, pobrania plików) są podsumowane, nie wypisane pojedynczo (CC-6).
- Kluczem łączącym obie strony jest numer kontrahenta (CC-4).

**US-3.5** · Jako opiekun chcę dostać zadanie, gdy partner cichnie, żeby nie polegać
na tym, że ktoś sam zauważy ciszę.

- Zadanie powstaje przy: spadku obrotu względem poprzedniego okresu, braku logowania przez ustaloną liczbę dni, porzuconej konfiguracji powyżej progu wartości.
- Zadanie wskazuje powód i konkretny obiekt, którego dotyczy.
- `[DO ROZSTRZYGNIĘCIA]` Progi liczbowe nie są ustalone w dokumencie źródłowym.

**US-3.6** · Jako administrator warunków handlowych chcę zmienić rabat, typ konta
albo zablokować konto w CRM, żeby zmiana obowiązywała w panelu natychmiast i w jednym miejscu.

- Z CRM do panelu idą: warunki handlowe i rabaty, typ konta z widocznością cen, przypisany opiekun, dane do faktur, blokada konta przy przeterminowanych płatnościach.
- Blokada konta zatrzymuje składanie zamówień, ale pozostawia dostęp do dokumentów i statusów już złożonych.
- Zmiana warunków jest widoczna w panelu bez ponownego logowania partnera.

## EP-4 · ERP/MES: od zamówienia do statusu (etap 4)

Cel etapu: produkcja i magazyn pod kontrolą. Warunek wejścia: etap 1 i decyzja o Enovie.

**US-4.1** · Jako planista chcę przyjąć zamówienie i zamienić je na zlecenie produkcyjne,
żeby produkcja nie startowała z maila.

- Zamówienie wchodzi z panelu B2B albo z CRM; obie drogi dają to samo zlecenie.
- Zlecenie dziedziczy numer zamówienia i numer oferty (CC-4).
- Pozycja spoza bazy produktów nie może utworzyć zlecenia (CC-1).

**US-4.2** · Jako planista chcę zobaczyć rozbicie zlecenia na komponenty i materiały,
żeby wiedzieć, czego brakuje, zanim obiecam termin.

- Rozbicie następuje według struktury wykonawczej wariantu czytanej z bazy produktów (CC-7).
- Brakujący komponent jest widoczny przy pozycji wraz ze stanem magazynowym.
- Zlecenie z brakiem przechodzi w status „oczekuje na komponent" i ten status jest widoczny w CRM.

**US-4.3** · Jako zaopatrzenie chcę dostać zapotrzebowanie zakupowe wynikające z braków,
żeby zakupy nie były szacowane ręcznie.

- Zapotrzebowanie agreguje braki z wielu zleceń na ten sam komponent.
- Pozycja zapotrzebowania wskazuje zlecenia, które jej wymagają.

**US-4.4** · Jako handlowiec i jako dystrybutor chcę widzieć status realizacji,
żeby nie pytać produkcji.

- Statusy zwrotne: zamówienie przyjęte, w produkcji, oczekuje na komponent, gotowe do wysyłki, wysłane, dostarczone.
- Widoczność w CRM jest pełna; widoczność w panelu B2B odpowiada tabeli statusów z dokumentu.
- Zerwana integracja nie gubi statusu: kolejkuje go i pokazuje, że dane są nieaktualne, zamiast wyświetlać stary status jako bieżący.

## EP-5 · Transport i domknięcie do dostawy (etap 5)

Cel etapu: zamknięcie procesu do dostawy. Warunek wejścia: etap 4.

**US-5.1** · Jako handlowiec chcę mieć koszt transportu w ofercie, żeby klient nie
dostawał wyceny bez przewozu.

- Wycena przewozu powstaje z wagi, gabarytu i liczby paczek z bazy produktów oraz adresu dostawy.
- Koszt transportu wchodzi do oferty i do zamówienia jako osobna pozycja.

**US-5.2** · Jako handlowiec chcę, żeby ładunek nietypowy poszedł do spedycji jako
zapytanie, zamiast dostać fikcyjną stawkę z tabeli (CC-5).

- Ładunek niestandardowy, dostawa na plac budowy, rozładunek i montaż wypadają do zapytania ręcznego.
- Oferta z pozycją oczekującą na wycenę spedycji jest jawnie oznaczona jako niepełna.
- `[DO ROZSTRZYGNIĘCIA]` Czy montaż i usługi są pozycjami wycenianymi w konfiguratorze — dokument wskazuje to jako rzecz do doprecyzowania.

**US-5.3** · Jako dystrybutor chcę zobaczyć numer przesyłki i status dostawy,
żeby przestać pytać o przesyłkę mailem.

- Zlecenie przewozu powstaje po zwolnieniu towaru przez ERP.
- Numer przesyłki i statusy są widoczne w CRM i w panelu B2B; dokumenty przewozowe są dostępne przy zamówieniu.

## EP-6 · Moduł learning (etap 6)

Cel etapu: mniej pytań do działu handlowego, lepsze zapytania partnerów.
Warunek wejścia: etap 3. Nie blokuje niczego i może powstawać stopniowo.

**US-6.1** · Jako osoba u partnera chcę przejść szkolenie produktowe i mieć dostęp do
kart, rysunków i certyfikatów, żeby nie pytać handlowca o podstawy.

- Materiały są powiązane bezpośrednio z rekordem w bazie produktów, żeby treści nie żyły osobnym życiem.
- Postęp jest zapisywany per osoba i widoczny dla firmy partnera.

**US-6.2** · Jako opiekun chcę widzieć postęp szkoleniowy partnera w CRM, żeby oprzeć
na nim poziom konta i certyfikację.

- Ukończone szkolenie trafia do CRM jako postęp osoby i firmy.
- Pobranie karty produktu lub rysunku jest sygnałem sprzedażowym widocznym na karcie partnera (agregowanym, CC-6).
- `[DO ROZSTRZYGNIĘCIA]` Powiązanie poziomu certyfikacji z typem konta i cennikiem nie jest opisane w dokumencie źródłowym.

## Luki w pokryciu, które warto domknąć w iteracji

- Obieg akceptacji oferty: dokument wskazuje go jako rzecz do doprecyzowania, więc żadna historyjka go nie opisuje.
- Migracja danych historycznych o zamówieniach i partnerach jest poza zakresem dokumentu źródłowego.
- Rola IT Cube w architekturze docelowej nie jest rozstrzygnięta, więc nie ma dla niej epiki.
- Liczba produktów i wariantów do opisania na start warunkuje pracochłonność EP-1 i pozostaje pytaniem otwartym.
