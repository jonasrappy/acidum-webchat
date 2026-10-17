# acidum-webchat

**[Åbn acidum](https://jonasrappy.github.io/acidum-webchat/)**

En let webchat med mobilnavigation og flere brugere. Almindelig HTML, CSS og JavaScript, uden framework, tracking eller egen backend.

## Forbind

1. Start acidum på computeren og aktivér webchat.
2. Log ind hos [acidum](https://acium.app/) og åbn webchatten.
3. Kopiér hele webchat-linket fra adresselinjen og indsæt det i acidum.

Token-linkets tekniske format er `https://acium.app/chat?token=…`. Linket huskes på enheden, så chatten åbner automatisk næste gang. Midlertidige netværksfejl sletter det ikke. Ved gentagne serverlukninger uden data vises muligheden for at prøve det gemte link igen. “Afbryd og fjern login” fjerner det fra browseren. Programmet på computeren skal fortsat køre.

## Funktioner

- Samlet samtale eller én bruger ad gangen, med kompakt mobilnavigation.
- Filtre til omtaler, hvisken, links og gemte beskeder. Søg i indlæst tekst eller filtrér på en bestemt afsender.
- Tællere ved brugerne reagerer kun på navneomtaler, egne lokale triggerord og medsendte markeringer. Almindelige rumbeskeder og egne beskeder tæller ikke med.
- Deltagerliste fra rumskiftets `users`-data, opdateret med ind- og udgange. Når et rumsnapshot ikke er modtaget, bruges observeret aktivitet. Efter forbindelsesbrud markeres listen igen som observeret, indtil et nyt snapshot modtages.
- Tryk på et navn for at omtale personen eller se personens beskeder. Det sender ikke automatisk en besked.
- Separate lokale kladder og ekstra triggerord for hver bruger.
- Tryk på et tidspunkt for at kopiere eller gemme en besked. Op til 200 gemte beskeder bevares separat fra den rullende historik.
- Eksportér den aktuelt indlæste og filtrerede samtale som en tekstfil. Filen oprettes direkte i browseren.
- Skriv som den valgte bruger med grænse på 100 tegn og tæller nær grænsen.
- Lazy load ved scroll op, med bevaret læseposition. Valgfrit lokalt arkiv med op til 10.000 beskeder pr. login.
- Automatisk genforbindelse med stigende ventetid og tilfældig variation.

## Data og privatliv

Alt, acidum selv gemmer, ligger i browseren: login-link, kladder, triggerord, gemte beskeder og eventuelt historik. Data tilknyttes det aktuelle login via en SHA-256-identifikator, så kladder og gemte beskeder fra forskellige login ikke blandes. Selve tokenet gemmes separat i browserens `localStorage`; tidligere sessionslagring overføres automatisk. Hvis browseren blokerer vedvarende lagring, forsøges sessionslagring i stedet.

For at chatten virker, sendes token og beskeder direkte til chatserveren over en krypteret WebSocket. GitHub Pages leverer kun sidens statiske filer. Ingen chatdata eller adgangskoder skal ligge i repoet. Del ikke dit token-link med andre.

“Gem historik” er som standard slået fra. “Slet gemt historik” sletter det rullende arkiv for det aktuelle login; manuelt gemte beskeder og kladder bevares. “Afbryd og fjern login” fjerner tokenet, men bevarer lokale data. Browserens sletning af webstedsdata fjerner alle lokale data.

## Forbrug og begrænsninger

Hukommelsen beholder op til 700 indgående beskeder pr. bruger. Den aktive visning tegner først de seneste 250; flere tilføjes, når du selv læser længere tilbage. Live-opdateringer samles med mindst 120 ms mellem tegninger. Skjulte faner tegnes først, når de bliver synlige. Mens du læser ældre beskeder, tegnes samtalen ikke igen for hver ny besked.

Serverprotokollens `lastLine` henter nyere beskeder. Der er ikke fundet en forespørgsel efter vilkårligt gammel serverhistorik. Lazy load bruger derfor allerede leverede beskeder og det arkiv, du har valgt at gemme lokalt. Søgning og eksport omfatter indlæste beskeder; scroll op for at hente flere fra arkivet. Gemte beskeder kan findes gennem deres eget filter.

Deltagerlisten er fra det seneste modtagne rumskift og de efterfølgende hændelser. Ved manglende data kan den være ufuldstændig. Der er ingen udokumenterede kommandoer til at flytte brugere eller starte hvisken. En hvisken, som modtages, kan læses og filtreres.

Integrationen bygger på observeret protokol og kan kræve tilpasning ved ændringer på serveren. Der er ikke målt en bestemt CPU-besparelse.

## Udvikling og test

```sh
npm test
npm run serve
```

Åbn http://127.0.0.1:8765. Uden gemt login findes eksempeldata på http://127.0.0.1:8765/#demo. Filerne til hosting ligger i `dist/`; der er intet byggetrin.

Node-tests kontrollerer historikgrænser, dubletter, brugeradskillelse, omtaler, lokale triggerord, deltagerlister og lokal lagring. De valgfrie `tests/*.browser.cjs` bruger `playwright-core` og Chromium, med `BROWSER_EXECUTABLE` sat til browserens sti. `ACIDUM_TEST_URL` kan ændre den lokale testadresse. Browsertest bruger syntetiske data.

## Udgivelse

Pages bruger roden af grenen `gh-pages`:

```sh
npm test
git push origin main
git subtree push --prefix dist origin gh-pages
```
