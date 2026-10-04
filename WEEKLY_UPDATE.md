# Wöchentliche Aktualisierung

Die öffentliche Seite liegt in `dist/`. Der GitHub-Workflow läuft montags um 12:15 Uhr in `Europe/Vienna`. Er liest die zehn letzten abgeschlossenen Kriegswochen und die aktuelle Mitgliederliste aus der offiziellen Clash-Royale-API, berechnet Punkte und gespielte Decks neu, speichert den Datenstand und veröffentlicht `dist/` über GitHub Pages. Die Verbindung läuft über den von RoyaleAPI dokumentierten Proxy für GitHub-Runner ohne feste IP-Adresse. Die Analytics-Webseite und deren CSV-Download werden nicht automatisiert abgerufen.

## Einrichtung

1. Einen **neutral benannten GitHub-Account oder eine Organisation** und ein Repository für die Clan-Seite wählen. Ohne eigene Domain lautet der öffentliche Link `https://BENUTZERNAME.github.io/REPOSITORY/`; deshalb darf der Accountname keinen Firmennamen enthalten.
2. Auf [developer.clashroyale.com](https://developer.clashroyale.com/) anmelden und einen API-Schlüssel für die IP-Adresse `45.79.218.79` erstellen. Diese IP nennt [RoyaleAPI in der Proxy-Dokumentation](https://docs.royaleapi.com/proxy.html). Den Schlüssel nicht in einen Chat und nicht in den Repository-Quellcode kopieren.
3. Im GitHub-Repository unter **Settings → Secrets and variables → Actions → New repository secret** den Schlüssel als `CLASH_ROYALE_API_TOKEN` speichern.
4. Unter **Settings → Pages → Build and deployment → Source** die Option **GitHub Actions** wählen. Das Repository mit dem vorbereiteten Code veröffentlichen.
5. Unter **Actions → Clankrieg aktualisieren → Run workflow** zunächst `verify_only` aktiviert lassen. Der Abruf vergleicht die gemeinsamen Kriegswochen mit dem bisherigen CSV-Stand, ohne die Seite zu verändern. Erst bei bestandenem Vergleich den regulären Lauf verwenden. Falls eine neue Woche bereits vorliegt, `verify_only` deaktivieren und manuell ausführen.

## Fehlerverhalten

Fehlen API-Felder oder aktuelle Mitglieder, sind Werte unplausibel, fehlt mehr als eine Woche oder ändern sich die Summen der Vorwoche unerwartet, bricht der Workflow ab und der veröffentlichte Stand bleibt erhalten. Zeigt die API um 12:15 Uhr noch die alte Woche, gibt es zwei weitere Versuche mit je zehn Minuten Abstand. Bleibt die Woche alt, meldet der Workflow einen Fehler. Bei Verzögerungen im GitHub-Zeitplan kann der Start später erfolgen.

Neue Mitglieder beginnen ab ihrer ersten eindeutig spielbaren Woche; bei einer ersten Nullrunde wird ab der folgenden vollen Woche gewertet. Ein Austritt, der zwischen zwei wöchentlichen Momentaufnahmen erfolgt und vor der nächsten Aufnahme rückgängig gemacht wird, ist aus der wöchentlichen Mitgliederliste nicht erkennbar. Dafür wären häufigere Mitglieder-Snapshots erforderlich.

## Stündlicher Mitgliederabgleich

`roster-sync.yml` prüft zur Minute 37 jeder Stunde die aktuellen Mitglieder über die offizielle API und veröffentlicht den aktuellen Mitgliederstand. Beim ersten Lauf wird der aktuelle Clan als Ausgangsbasis gespeichert. Für die bestehenden Mitglieder werden keine rückwirkenden Beitrittsdaten erfunden.

Später neu erkannte Spielertags erhalten das Datum ihrer ersten Erkennung in Europe/Vienna. Der automatische Eintrag wird im zentralen Speicherdienst hinterlegt und erscheint als „Beitritt erkannt“. Manuell gespeicherte Angaben werden nicht überschrieben. Rückkehrer behalten den ursprünglichen Eintrag; `roster-state.json` enthält dafür die bereits gesehenen Tags und eine begrenzte Kriegshistorie. Die gewerteten CW sowie Clan-Wochensummen werden weiterhin aus dem wöchentlichen Datenstand übernommen. Die stündliche Prüfung verändert nur den aktuellen Mitgliederstand und Eintrittsangaben.

Eintrittszeitpunkte bleiben Näherungen zwischen zwei Prüfungen. Sehr kurze Mitgliedschaften zwischen zwei Abrufen können nicht erkannt werden. GitHub kann geplante Läufe verzögert ausführen. Der Zeitpunkt des letzten erfolgreichen Abrufs steht auf der Seite. Bei API-Fehlern bleiben der bisherige Datenstand und die letzte erfolgreiche Abrufzeit erhalten.

## Aktueller CW

`live-war.yml` ruft Donnerstag bis Montag jeweils 12:15 Uhr (Europe/Vienna, Sommer-/Winterzeit automatisch) den aktuellen River Race ab. Die Seite zeigt den Zwischenstand mit Punkten und Decks je Teilnehmer getrennt vom abgeschlossenen Zehn-Wochen-Ranking. Am Montag nach dem Wechsel zur Trainingswoche wird der letzte abgeschlossene CW aus dem Log angezeigt. Mitgliederprüfung bleibt stündlich. Alle drei Workflows teilen eine Concurrency-Gruppe und lesen den aktuellen main-Stand vor Änderungen. GitHub kann geplante Starts verzögern.
