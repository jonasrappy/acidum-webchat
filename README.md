# Stuen

En let, uafhængig webchat til Acium, bygget med almindelig HTML, CSS og JavaScript. Ingen framework-runtime, tredjepartsscripts, tracking, database eller serverkode.

**Åbn: https://jonasrappy.github.io/stuen-webchat/**

## Forbind

1. Start Acium på computeren og aktivér webchat som normalt.
2. Log ind på https://acium.app/ og åbn din webchat.
3. Kopiér webchat-linket og indsæt det i Stuen.

Du kan også trække “Åbn i Stuen” fra startsiden til din bogmærkelinje. Klik på bogmærket, mens du står på din Acium-webchat. Det åbner Stuen med dit chat-token i URL-fragmentet og fjerner fragmentet igen straks efter indlæsning.

Login hos Acium er stadig nødvendigt. Der er ikke implementeret et officielt OAuth-login eller automatisk retur fra deres login. Stuen erstatter browserens webchat; Acium-programmet er fortsat broen til Netstationen. Vi er ikke tilknyttet Acium eller Netstationen.

## Funktioner

- Alle samtaler samlet eller én bruger ad gangen.
- Aciums markerede hændelser i en separat log.
- Søgning i den indlæste historik, hændelsesfilter og ulæste markeringer.
- Vælg hvilken af dine brugere du skriver som.
- Privatbeskeder og rumskift vises; der er ingen separat brugerflade til at starte hvisken eller skifte rum.
- Automatisk genforbindelse med stigende ventetid og tilfældig variation.
- Responsivt layout, tastaturbetjening og `/` som søge-genvej.
- Eksempeltilstand uden netværksforbindelse til Acium.

## Forbrug og privatliv

Højst 700 beskeder pr. bruger gemmes i hukommelsen. Den aktive visning tegner først de nyeste 250; ældre beholdte beskeder kan hentes frem med en knap. Nye beskeder samles i browserens animation frame, og skjulte faner tegnes først, når de bliver synlige. Genforbindelse beder om historik efter det senest modtagne tidsstempel og fjerner gentagelser blandt de beholdte beskeder.

Gamle beskeder falder ud af hukommelsen. Historik gemmes ikke på disk, og en genindlæsning afhænger af den historik, Acium stiller til rådighed. Der er ikke målt en bestemt CPU-besparelse sammenlignet med den officielle webchat.

Chat-token opbevares i hukommelsen og i `sessionStorage` for den aktuelle browsersession, så siden kan genindlæses. “Afbryd” sletter det. Link og beskeder sendes direkte til Aciums WebSocket-server over TLS. Token skal behandles som en adgangsnøgle. Indsæt aldrig din Acium-adgangskode her. GitHub leverer kun de statiske filer; ingen loginoplysninger eller chatindhold skal ligge i repoet.

Protokollen er observeret fra den eksisterende webchat den 17. oktober 2026. Det er en uofficiel integration, som kan kræve tilpasning, hvis Acium ændrer server eller adgangsregler. Stuen omgår ingen adgangskontrol og kræver et gyldigt token.

## Udvikling

Kræver Node.js til test og Python 3 til den valgfrie lokale server. Selve siden kræver ingen installation eller byggetrin.

```sh
npm test
npm run serve
```

Åbn http://127.0.0.1:8765 og brug eksempeltilstanden. Alle filer til hosting findes i `dist/`.

## Udgiv på GitHub Pages

Pages bruger roden af grenen `gh-pages`. Fra en opdateret `main`:

```sh
npm test
git push origin main
git subtree push --prefix dist origin gh-pages
```

Repoets Pages-indstilling peger på `gh-pages` og `/`. GitHub bygger og udgiver automatisk efter push.

## Test

Node-tests dækker tokenvalidering, 20.000 indgående beskeder med begrænset historik, gentagelser, genoptagelsestidsstempel, adskilte brugere, filtre, ugyldige beskeder og ventetider ved genforbindelse. Browserkontrol er udført på desktop og mobil, inkl. tekstindsættelse uden HTML-fortolkning. Live forbindelse til to eksisterende Acium-brugerfaner er kontrolleret uden at sende chatbeskeder.
