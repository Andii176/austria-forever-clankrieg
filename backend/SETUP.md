# Direkte Clanbeitritte ohne Anmeldung

Diese Version ist für eine Bereitstellung des zentralen Speicherdienstes vorbereitet. Die bisherige GitHub-Pages-Seite wird erst nach der Bereitstellung umgestellt.

## Hosting einrichten

1. Ein Cloudflare-Konto einrichten bzw. ein bestehendes nutzen.
2. Im Verzeichnis `backend` mit der offiziellen Cloudflare-CLI anmelden und bereitstellen:

   ```sh
   npx wrangler@latest login
   npx wrangler@latest deploy
   ```

   `wrangler.json` richtet die SQLite-Durable-Object-Datenbank automatisch ein. Es werden keine Zugangsschlüssel oder Passwörter für die Clanmitglieder benötigt. Gebühren und Limits richten sich nach dem ausgewählten Cloudflare-Tarif.
3. Die ausgegebene Worker-Adresse als `window.CLAN_API` in `dist/config.js` eintragen. Die Adresse benötigt keinen abschließenden Schrägstrich.
4. Die vorbereitete Version in `main` übernehmen und GitHub Pages veröffentlichen lassen. Die bisherige öffentliche Clanadresse bleibt gleich.

`ALLOWED_ORIGIN` ist die Origin der öffentlichen Clanwebseite (ohne Unterverzeichnis). `SNAPSHOT_URL` verweist auf den wöchentlich erzeugten Datenstand. Die Adresse des Speicherdienstes hat keinen Bezug zum Firmen-ChatGPT-Konto.

## Verhalten

- Öffentliche Bearbeitung ohne Registrierung, Passwort oder Weiterleitung.
- Eintrittsdaten werden zentral gespeichert und überschreiben die vorbelegten Angaben.
- Neue Spieler lassen sich vor dem ersten CW per Spielertag hinterlegen.
- Die zentrale Wertung wird bei jedem Abruf anhand des aktuellen wöchentlichen Datenstands berechnet. Ein Wochenupdate überschreibt die manuellen Daten nicht.
- Die zwei bekannten Wiedereintritt-Ausnahmen behalten ihre durchgehende Wertung.
- Jeder Besucher kann Angaben ändern. Der Verlauf speichert die letzten 20 Änderungen pro Spieler. Angaben lassen sich über das Formular erneut überschreiben.
- Gleichzeitige Änderungen überschreiben einander nicht stillschweigend: Eine veraltete Formularversion wird mit einer Aufforderung zum Neuladen abgelehnt.
- Fehlgeschlagene Anfragen werden nicht als gespeichert bestätigt.
- Kein Browser-Speicher wird als zentrale Datenbank verwendet. `sessionStorage` hält ausschließlich die einmalige Speicherbestätigung beim Neuladen.
- Der Speicherdienst begrenzt Änderungen je gehashter IP-Adresse auf 120 pro Stunde; rohe IP-Adressen werden nicht in der Datenbank gespeichert. Das verhindert keine absichtlichen Falschangaben durch Besucher.

## Prüfung vor dem Umschalten

```sh
node --test backend/worker.test.mjs
node --check dist/app.js
```

Nach Bereitstellung: Ein gültiges Datum über die Webseite speichern, im zweiten Browser abrufen, überschreiben und erneut abrufen. Danach prüfen, dass beide Wiedereintritt-Ausnahmen weiter durchgehend gewertet werden. Es wurde bisher kein Cloudflare-Dienst bereitgestellt; dieser Live-Test steht deshalb noch aus.
