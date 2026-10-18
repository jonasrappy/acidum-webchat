# acidum-webchat

**[Åbn acidum](https://jonasrappy.github.io/acidum-webchat/)**

En let webchat med mobilnavigation og flere brugere. Bygget med Svelte 5 og Vite, uden tracking eller egen backend.

## Forbind

1. Start acidum på computeren og aktivér webchat.
2. Log ind hos [acidum](https://acium.app/) og åbn webchatten.
3. Kopiér hele webchat-linket fra adresselinjen og indsæt det i acidum.

Token-linkets tekniske format er `https://acium.app/chat?token=…`. Linket huskes på enheden, så chatten åbner automatisk næste gang. Midlertidige netværksfejl sletter det ikke. Ved gentagne serverlukninger uden data vises muligheden for at prøve det gemte link igen. “Afbryd og fjern login” fjerner det fra browseren. Programmet på computeren skal fortsat køre.

## Funktioner

- Samlet samtale eller én bruger ad gangen, med kompakt mobilnavigation. Navne vises uden gentagne felter med initialer i navigation, deltagerlister og beskedblokke.
- Filteret “Kun hvisken” ligger sammen med søgningen. Det åbnes via lup-ikonet, som markeres, når et filter er aktivt. Søg i indlæst tekst eller filtrér på en bestemt afsender.
- Mere/Indstillinger viser indstillinger og handlinger med forklaringer bag spørgsmålstegn. Forbindelsesstatus, genforbindelse og afbrydelse er samlet nederst.
- Beskedtekst på 16 px som standard. Under Mere/Indstillinger → Visning kan størrelsen justeres fra 10 til 30 px med forhåndsvisning under spørgsmålstegnet; valget huskes på enheden.
- I Alle samles kopier af samme rumbesked fra flere af dine brugere til én besked med tags for de berørte brugere. Rumkonteksten gemmes ved modtagelsen. Sammenligningen bruger afsender, type, tekst og tidspunkt; kendte fælles rum tillader op til ét sekunds forskel mellem kopierne. Gentagelser fra samme brugerfane, forskellige kendte rum og private beskeder sammenlægges ikke.
- Sammenhængende indgange, udgange og tekst fra samme person samles i én blok med afsenderen øverst til venstre og tidsstempler i en fast kolonne til højre. I det samlede overblik vises dine egne brugere som separate tags på boksens øverste højre hjørne. Hver linje beholder sit tidspunkt og sine beskedhandlinger. Grøn højrepil viser indgang; rød venstrepil viser udgang eller at personen har forladt chatten. Baggrunden skifter mellem blokkene. En anden person, brugerfane, dato eller et rumskift starter en ny blok; hvisken holdes separat fra almindelige rumbeskeder.
- Triggerord styres i programmet. Webchatten følger de medsendte `log`-/`notify`-markeringer og markerer også brugernavnet uden forskel på store og små bogstaver. Tællere reagerer på disse markeringer og navneomtaler; almindelig rumtrafik tæller ikke. Programmarkeringer respekteres også på egne beskeder.
- Nye `notify`-markeringer kan give et banner, en valgfri lyd og systemnotifikationer efter dit samtykke. Historik og gamle gentagelser udløser ikke beskedalarmer.
- Hændelsesloggen gemmer altid de seneste 100 hændelser lokalt pr. login, uden tidsudløb og uafhængigt af den valgfrie chathistorik. Samlede rumkopier tæller som én hændelse. Gamle gentagelser erstatter ikke nyere hændelser, og gendannelse udløser ingen beskedalarmer.
- Superbrugere vises med orange navn, kant og varm baggrund på beskedblokken, også ved hvisken og samlede rumkopier. Identifikationen bruger medsendte `superuser`-felter og navnene i panic-hændelser. Mangler begge oplysninger, vises personen almindeligt; beskedtekst bruges ikke til at gætte rollen.
- Deltagerliste fra rumskiftets `users`-data, opdateret med ind- og udgange. Når et rumsnapshot ikke er modtaget, bruges observeret aktivitet. Efter forbindelsesbrud markeres listen igen som observeret, indtil et nyt snapshot modtages.
- Tryk på en “er gået til …”-besked eller dens tidspunkt og vælg “Følg efter”, når hændelsen indeholder et rum-id. Handlingen sender `/goto <id>` som den valgte bruger i skrivefeltet; navnet vises på knappen. Kladder bevares, og serveren afgør, om brugeren kan komme ind i rummet.
- Tryk på et navn for at omtale personen eller se personens beskeder. Det sender ikke automatisk en besked. Skriv `@` og begyndelsen af navnet for valgfri autocomplete med deltagerne i den valgte brugers rum. Valg af et forslag indsætter kun brugernavnet og fjerner `@`. Enter vælger kun et forslag, hvis du selv har markeret det med piletasterne.
- Separate lokale kladder for hver bruger. Der gemmes ingen lokal triggerkonfiguration i webchatten.
- Tryk på et tidspunkt for at kopiere eller gemme en besked. Op til 200 gemte beskeder bevares separat fra den rullende historik.
- Eksportér den aktuelt indlæste og filtrerede samtale som en tekstfil. Filen oprettes direkte i browseren.
- Skriv som den valgte bruger med grænse på 100 tegn og tæller nær grænsen.
- Lazy load ved scroll op, med bevaret læseposition. Valgfrit lokalt arkiv med op til 10.000 beskeder pr. login.
- Automatisk genforbindelse med stigende ventetid og tilfældig variation.

## Data og privatliv

Alt, acidum selv gemmer, ligger i browseren: login-link, kladder, gemte beskeder, de seneste 100 loghændelser, tekststørrelse, indstillinger for beskedalarmer og eventuelt historik. Data tilknyttes det aktuelle login via en SHA-256-identifikator, så kladder, loghændelser og gemte beskeder fra forskellige login ikke blandes. Selve tokenet gemmes separat i browserens `localStorage`; tidligere sessionslagring overføres automatisk. Hvis browseren blokerer vedvarende lagring, forsøges sessionslagring i stedet.

For at chatten virker, sendes token og beskeder direkte til chatserveren over en krypteret WebSocket. GitHub Pages leverer kun sidens statiske filer. Ingen chatdata eller adgangskoder skal ligge i repoet. Del ikke dit token-link med andre.

“Gem historik” er som standard slået fra. “Slet gemt historik” sletter det rullende arkiv for det aktuelle login; hændelsesloggen, manuelt gemte beskeder og kladder bevares. “Afbryd og fjern login” fjerner tokenet, men bevarer lokale data. Browserens sletning af webstedsdata fjerner alle lokale data.

## Forbrug og begrænsninger

Hukommelsen beholder op til 700 indgående beskeder pr. bruger. Den aktive visning tegner først de seneste 250; flere tilføjes, når du selv læser længere tilbage. Live-opdateringer samles med mindst 80 ms mellem tegninger. Keyed Svelte-komponenter genbruger uændrede beskedrækker og afsenderblokke. Beskeddata bruger rå reaktiv tilstand uden dybe proxies. Rumoversigt og indstillinger hentes først, når de bruges; arkivkoden hentes først, når lokal historik bruges. Tastatur- og viewportændringer ændrer kun layout og læseposition. Aktivitet i andre samtaler tegner ikke den aktuelle beskedliste igen. Skjulte faner tegnes først, når de bliver synlige. Mens du læser ældre beskeder, tegnes samtalen ikke igen for hver ny besked.

Serverprotokollens `lastLine` henter nyere beskeder. Der er ikke fundet en forespørgsel efter vilkårligt gammel serverhistorik. Lazy load bruger derfor allerede leverede beskeder og det arkiv, du har valgt at gemme lokalt. Søgning og eksport omfatter indlæste beskeder; scroll op for at hente flere fra arkivet.

Deltagerlisten er fra det seneste modtagne rumskift og de efterfølgende hændelser. Ved manglende data kan den være ufuldstændig. “Følg efter” kræver et gyldigt destinations-id i rumskiftehændelsen; id'et gættes ikke ud fra rumnavnet. En hvisken, som modtages, kan læses og filtreres.

Systemnotifikationer aktiveres under Mere/Indstillinger. På iPhone skal acidum tilføjes til hjemmeskærmen og åbnes derfra, før notifikationer kan aktiveres. Beskedalarmer kræver, at siden stadig kan modtage data på sin chatforbindelse. Der er ingen push-backend til at vække en lukket eller suspenderet app. Den lille service worker viser kun notifikationer fra den aktive side og åbner den relevante bruger; den cacher ikke chats eller login-link.

Integrationen bygger på observeret protokol og kan kræve tilpasning ved ændringer på serveren. Der er ikke målt en bestemt CPU-besparelse.

## Udvikling og test

```sh
npm ci
npm run check
npm test
npm run dev
```

Åbn http://127.0.0.1:8765. Uden gemt login findes eksempeldata på http://127.0.0.1:8765/#demo. Kildekoden ligger i `src/`, komponenternes CSS ligger ved komponenterne, og fælles tema/layout ligger i `src/style.css`. `public/` indeholder ikon, manifest og service worker. `npm run build` skriver den aktuelle produktion til `dist/` og fjerner tidligere byggefiler. `npm run preview` viser det færdige build lokalt.

Node-tests kontrollerer historikgrænser, dubletter, brugeradskillelse, omtaler, programmarkeringer, beskedalarmer, gruppering, deltagerlister og lokal lagring. `npm run test:browser` kører `tests/*.browser.cjs` mod en startet preview-server med `playwright-core` og Chromium. Sæt `BROWSER_EXECUTABLE` til browserens sti. `ACIDUM_TEST_URL` kan ændre den lokale testadresse. Browsertest bruger syntetiske data. Tastaturtesten simulerer ændringer i viewporthøjde og forskydning, kontrollerer at skrivefelt og samtale forbliver synlige, og måler at uændrede beskedrækker bevares. Et fysisk iPhone-tastatur er ikke tilgængeligt i testmiljøet.

## Udgivelse

Pages bruger roden af grenen `gh-pages`:

```sh
npm run check
npm test
npm run build
git push origin main
git subtree push --prefix dist origin gh-pages
```
