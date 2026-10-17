# acidum

En let, uafhængig webchat til Acium, bygget med almindelig HTML, CSS og JavaScript. Ingen framework-runtime, tredjepartsscripts, tracking, database eller serverkode.

**Åbn: https://jonasrappy.github.io/acium-webchat/**

## Forbind

1. Start Acium på computeren og aktivér webchat som normalt.
2. Log ind på https://acium.app/ og åbn din webchat.
3. Kopiér webchat-linket og indsæt det i acidum.

Dit link huskes automatisk på denne enhed. Næste gang du åbner siden, forbindes chatten igen. “Afbryd og fjern login” sletter det gemte link.

Login hos Acium er stadig nødvendigt. Der er ikke implementeret et officielt OAuth-login eller automatisk retur fra deres login. acidum erstatter browserens webchat; Acium-programmet er fortsat broen til Netstationen. Vi er ikke tilknyttet Acium eller Netstationen.

## Funktioner

- Alle samtaler samlet eller én bruger ad gangen.
- Aciums markerede hændelser i en separat log.
- Søgning i den indlæste historik og hændelsesfilter. Tallet ved hver bruger tæller kun ulæste navneomtaler eller beskeder, Acium har markeret med `log`/`notify`. Almindelige rumbeskeder, egne beskeder og ind-/udgange tæller ikke med. Selve triggerlisten indlæses ikke.
- Automatisk lazy load ved scroll mod toppen, med bevaret scrollplacering.
- Valgfri lokal historik i IndexedDB: op til 10.000 beskeder pr. webchat-login på denne enhed.
- Vælg hvilken af dine brugere du skriver som.
- Privatbeskeder og rumskift vises; der er ingen separat brugerflade til at starte hvisken eller skifte rum.
- Automatisk genforbindelse med stigende ventetid og tilfældig variation.
- Mobilvisning med bundnavigation, hurtige brugerfaner, store trykfelter og separate rum- og indstillingspaneler.
- Visning af rum og observerede brugere separat for hver konto. Det er ikke en fuld deltagerliste: den bygges af almindelige beskeder og ind-/udgange, nulstilles ved rumskift og ignorerer hvisken og gamle genafspillede hændelser. Hvis serverens begrænsede historik ikke indeholder et rumskift, vises “Rumnavn afventes” kun i rumoversigten.
- Layoutet tilpasser højden til browserens synlige viewport, når skærmtastaturet ændrer pladsen. Tastaturbetjening og `/` som søge-genvej.
- Eksempeltilstand uden netværksforbindelse til Acium.

## Forbrug og privatliv

Højst 700 beskeder pr. bruger gemmes i hukommelsen. Den aktive visning tegner først de nyeste 250; ældre beholdte beskeder kan hentes frem med en knap. Live-opdateringer samles med mindst 120 ms mellem tegninger og tegnes i browserens animation frame, og skjulte faner tegnes først, når de bliver synlige. Genforbindelse beder om historik efter det senest modtagne tidsstempel og fjerner gentagelser blandt de beholdte beskeder.

Gamle beskeder falder ud af hukommelsen. Som standard gemmes historik ikke på disk. Vælg “Gem historik” for at gemme beskeder lokalt i browserens IndexedDB. Når du scroller op, hentes ældre beskeder i portioner på 250, og din placering bevares. Den første visning har højst 250 beskeder; flere DOM-rækker tilføjes kun, når du selv læser længere tilbage. Mens du læser ældre beskeder, tegnes samtalen ikke igen for hver ny besked. Arkivet holder højst 10.000 beskeder pr. webchat-login, adskilt efter en SHA-256-identifikator for tokenet; selve tokenet gemmes ikke i arkivet. Ved et nyt token starter et separat arkiv. “Slet historik” sletter arkivet for det aktuelle login; “Gem historik” kan slås fra for at stoppe ny lagring. “Afbryd” sletter tokenet, men bevarer et eventuelt lokalt arkiv.

Den observerede serverprotokol har en `lastLine`-forespørgsel efter nyere beskeder. Der er ikke fundet en forespørgsel efter vilkårligt ældre serverhistorik. Lazy load kan derfor vise den historik, Acium har leveret, og den historik du selv har valgt at gemme fremover. Søgning viser først matches i indlæst historik; scroll op eller brug knappen for at søge videre i det lokale arkiv. Der er ikke målt en bestemt CPU-besparelse sammenlignet med den officielle webchat.

Chat-token opbevares i hukommelsen og i browserens `localStorage`, så det huskes efter lukning af faner og browser. Tidligere gemte sessioner overføres automatisk. Midlertidige forbindelsesfejl sletter ikke tokenet. Efter tre serverlukninger uden data (kode 1005) vises indtastningsfeltet igen med mulighed for at prøve det gemte link; linket bevares, fordi serveren ikke giver en entydig forklaring. Hvis vedvarende lagring er blokeret af browseren, forsøges lagring kun for fanens session. “Afbryd” sletter det. Link og beskeder sendes direkte til Aciums WebSocket-server over TLS. Token skal behandles som en adgangsnøgle. Indsæt aldrig din Acium-adgangskode her. GitHub leverer kun de statiske filer; ingen loginoplysninger eller chatindhold skal ligge i repoet.

Protokollen er observeret fra den eksisterende webchat den 17. oktober 2026. Det er en uofficiel integration, som kan kræve tilpasning, hvis Acium ændrer server eller adgangsregler. acidum omgår ingen adgangskontrol og kræver et gyldigt token.

## Udvikling

Kræver Node.js til test og Python 3 til den valgfrie lokale server. Selve siden kræver ingen installation eller byggetrin.

```sh
npm test
npm run serve
```

Åbn http://127.0.0.1:8765. Eksempeltilstanden findes på http://127.0.0.1:8765/#demo uden et gemt login. Alle filer til hosting findes i `dist/`.

## Udgiv på GitHub Pages

Pages bruger roden af grenen `gh-pages`. Fra en opdateret `main`:

```sh
npm test
git push origin main
git subtree push --prefix dist origin gh-pages
```

Repoets Pages-indstilling peger på `gh-pages` og `/`. GitHub bygger og udgiver automatisk efter push.

## Test

Node-tests dækker tokenvalidering, 20.000 indgående beskeder med begrænset historik, gentagelser, genoptagelsestidsstempel, adskilte brugere, filtre, ugyldige beskeder og ventetider ved genforbindelse. Browserkontrol er udført på desktop og mobil, inkl. tekstindsættelse uden HTML-fortolkning. Live forbindelse til to eksisterende Acium-brugerfaner er kontrolleret uden at sende chatbeskeder. Lokal historik testes også i en rigtig browser med syntetiske WebSocket-beskeder: første indlæsning, lazy load fra hukommelse og IndexedDB, bevaret scrollplacering, genindlæsning, adskilte login og sletning.

For den valgfrie browsertest: installér `playwright-core` lokalt som udviklingsværktøj, start den lokale server, og kør `tests/history.browser.cjs` med `BROWSER_EXECUTABLE` sat til en Chromium-browser. Testen bruger udelukkende syntetiske beskeder og en simuleret WebSocket; den kontakter ikke Acium. `STUEN_TEST_URL` kan ændre testserverens adresse (roden af siden).

Mobiltesten `tests/mobile.browser.cjs` kontrollerer seks skærmstørrelser fra 320 pixels til tablet og liggende mobil samt brugerskift, rumoversigt, indstillinger, søgning og navigation tilbage fra loggen.

`tests/login.browser.cjs` kontrollerer den minimale forside, genåbning af faner, gendannelse af browserlagring, migration fra sessionslagring, manuel fjernelse af login og bevarelse af linket ved netværksfejl eller gentagne serverlukninger. Kun syntetiske tokens bruges i testen.
