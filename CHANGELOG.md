# Changelog

Toutes les modifications notables de GEBIBLIPE sont documentées ici.
Format : [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/)
Versioning : [SemVer](https://semver.org/lang/fr/)

## [Unreleased]

### Added
- Résumé complété automatiquement via OpenLibrary (`entry.details.description`) en plus de Google Books, avec repli sur la zone Unimarc 330 (résumé/note de contenu) des notices BnF/SUDOC quand elle existe (vérifié en direct : quasi jamais présente pour un livre de commerce courant, mais sans coût à extraire) ; champ activé par défaut dans les champs bibliographiques configurables (`defaultOn: true`)
- Notifications ponctuelles façon pop-up (haut droite de l'écran, empilables, fermeture par croix ou touche Échap) pour les confirmations d'envoi/mise à jour Notion et de sauvegarde de configuration — accessibles (`role="status"`/`"alert"` selon la gravité, `aria-live` adapté, focus jamais volé à l'utilisateur) ; les indicateurs de progression (recherche ISBN, import en masse, génération IA) restent affichés en ligne, inchangés

### Changed
- Carte « Données bibliographiques » (Titre, Auteur, Éditeur, Date édition, Langue, Pages, Format, Collection, Genre, Résumé, Couverture) : la teinte de fond appliquée aux champs auto-remplis est retirée, seul le badge de source (ISBN générique ou BnF/OpenLibrary/Google Books/SUDOC selon la provenance réelle) reste affiché — inchangé pour les autres cartes (IA, Notion)

### Fixed
- Badge de source (BnF/OpenLibrary/Google Books/SUDOC) jamais affiché sur le champ Résumé une fois rempli : le sélecteur CSS ne révélait le badge que pour un `input.prefilled`, alors que Résumé est le seul champ bibliographique rendu en `<textarea>` — seule la couleur de fond apparaissait, sans l'étiquette de source

---

## [0.60.1] — 2026-07-18

### Fixed
- Numéro de version GEBIBLIPE envoyé à Notion (`src/version.js`) resté figé à `0.58.0` alors que l'application était déjà en v0.60.0 — l'étape de release ne mettait à jour que `index.html`, pas cette source dédiée ; corrigé et ajouté au protocole de release (`CLAUDE.md`) pour que les deux restent synchronisés

---

## [0.60.0] — 2026-07-18

### Added
- Recherche bibliographique par ISSN français (BnF, SUDOC) en plus de l'ISBN : le champ de recherche existant détecte automatiquement le type d'identifiant (8 chiffres = ISSN, 10/13 = ISBN) ; OpenLibrary et Google Books, qui n'indexent pas l'ISSN, sont exclus de la recherche dans ce cas, de même que la recherche de couverture
- En-tête : mise en évidence du support ISBN (13 et 10) et ISSN (FR), et des sources bibliographiques disponibles (BnF, OpenLibrary, Google Books, SUDOC), sous le titre de l'application
- Nouveau thème « Presse & périodiques » (Quotidien généraliste, Presse internationale, Hebdomadaire d'actualité, Revue littéraire, Revue scientifique, Magazine culturel, Presse économique, Presse spécialisée) pour classer les revues et journaux catalogués via ISSN ; la suggestion de thème par IA couvre désormais explicitement les périodiques

### Changed
- La couverture envoyée comme cover de page Notion privilégie désormais l'image OpenLibrary haute résolution (`-L`) reconstruite depuis l'OLID de l'édition (repli sur l'ISBN, puis sur la vignette affichée si aucune des deux n'est une couverture OpenLibrary)

### Fixed
- Couvertures OpenLibrary fréquemment vides : l'ancienne heuristique de validation (`Content-Length > 1000`) ne détectait jamais l'absence de couverture, `covers.openlibrary.org` ne renvoyant jamais cet en-tête (réponses `chunked`) — remplacée par une vérification `Content-Type`, seul discriminant fiable entre une vraie image et le placeholder 1×1 renvoyé en HTTP 200 quand aucune couverture n'existe ; en l'absence de couverture, le formulaire reste maintenant entièrement vierge (ni image ni badge résiduel)
- Recherche ISSN : le champ « Date de cette édition » affichait la plage de publication du périodique avec un tiret final trompeur (ex. « 1944- »), et le champ « Pages » récupérait une notation de volumes (ex. « vol. ») sans rapport avec un nombre de pages — la date est désormais nettoyée de son tiret final, et le champ Pages n'est plus renseigné pour un périodique (vérifié en direct sur plusieurs titres BnF/SUDOC)

---

## [0.59.1] — 2026-07-17

### Changed
- Règle de champs obligatoires avant l'envoi Notion revue : l'ISBN devient obligatoire en mode recherche (Titre/Auteur redeviennent optionnels), et seul le Titre est obligatoire en mode « Nouveau sans ISBN » — l'import en masse ne vérifie plus que la validité de l'ISBN (déjà garantie par le parsing de la liste collée)

### Fixed
- Recherche bibliographique (BnF, OpenLibrary, SUDOC, couverture) incomplète pour les livres anciens identifiés par leur seul ISBN-10 : la conversion ne fonctionnait que dans le sens ISBN-13 → ISBN-10, jamais l'inverse — ajout de `isbn10to13()` et centralisation dans `isbnVariants()`, utilisé par l'import en masse comme par la recherche unitaire

---

## [0.59.0] — 2026-07-17

### Added
- Import en masse d'ISBN via un champ de texte libre (un ISBN par ligne) : chaque ISBN est vérifié dans Notion, les champs bibliographiques vides sont complétés via les 4 sources existantes, les identifiants techniques (ARK BnF, Google Volume ID, OCLC, OLID, PPN SUDOC) et la version GEBIBLIPE sont systématiquement rafraîchis, puis un tableau récapitulatif (statut, champs modifiés) permet de décocher des entrées avant l'envoi groupé vers Notion — la case « Saisie manuelle » est cochée dès qu'aucune source bibliographique n'a retrouvé le livre, y compris pour une fiche déjà présente dans Notion (règle volontairement différente du flux unitaire)

### Fixed
- `Format` (champ bibliographique) n'était jamais relu depuis Notion lors du chargement d'une fiche existante, ce qui pouvait effacer silencieusement sa valeur réelle au renvoi — corrigé

---

## [0.58.0] — 2026-07-17

### Added
- Propriété technique « Version GEBIBLIPE » (texte), envoyée automatiquement à Notion à chaque création/mise à jour de page, reflétant une constante unique `APP_VERSION` (`src/version.js`) — colonne créée automatiquement au premier envoi (schéma dynamique)
- Nouvelle source bibliographique SUDOC (catalogue collectif universitaire français, SRU/UNIMARC) — 4e source de fallback, positionnée après BnF/OpenLibrary/Google Books par défaut, sélectionnable comme moteur préféré dans la configuration
- Identifiant pivot PPN (SUDOC) collecté en best-effort, affiché dans le popover de sources et envoyé à Notion (colonne « PPN SUDOC » créée automatiquement)
- Coloration des badges de source par champ (Titre, Auteur, Éditeur, etc.) selon la source bibliographique réelle ayant rempli le champ (BnF, OpenLibrary, Google Books, SUDOC), distincte de la palette catégorie existante (ISBN générique / IA / Notion)
- Bouton « Ajouter sans ISBN » sur l'écran de recherche, ouvrant un formulaire vide et éditable (cercles bibliographiques inchangés) — utile pour les livres sans ISBN (anciens, manuscrits, etc.)
- Case à cocher technique « Saisie manuelle », envoyée à Notion et cochée automatiquement dès qu'aucune source bibliographique n'a contribué à la fiche (ajout via « Nouveau sans ISBN », ou recherche ISBN infructueuse) — permet de filtrer/trier dans Notion les fiches sans origine API

### Changed
- La fiche « Données bibliographiques » affiche désormais des séparateurs visuels entre les groupes de champs par cercle d'intérêt (Socle, Très utile, Valeur variable), reprenant le même habillage que le panneau de configuration des champs bibliographiques
- Bouton « Ajouter sans ISBN » renommé en « Nouveau sans ISBN »
- Le bouton « Compléter les champs avec les sources bibliothéquaires » (après chargement d'une fiche Notion) est désormais positionné dans le cadre du titre de l'œuvre plutôt que dans la zone de statut

### Fixed
- L'envoi vers Notion est désormais bloqué avec un message explicite si le Titre ou l'Auteur est vide, plutôt que de créer silencieusement une page incomplète

---

## [0.57.0] — 2026-07-17

### Added
- Champ bibliographique « Format / reliure » (cercle 2, saisie manuelle)
- Identifiants pivots (ARK BnF, OLID, Google Volume ID, OCLC) collectés en best-effort par les sources bibliographiques — affichés en lecture seule dans le popover de sources (section « Identifiants techniques ») et envoyés à Notion dès qu'ils sont disponibles (colonnes créées automatiquement)
- Extraction de la Langue depuis BnF (zone Unimarc 101$a) et OpenLibrary, en plus de Google Books — normalisation des codes langue vers ISO 639-1

### Changed
- Le panneau « Champs bibliographiques » et la fiche de saisie sont réorganisés par cercle d'intérêt du champ (Socle, Très utile, Valeur variable) selon le taux de complétion observé sur les API ISBN
- Titre et Auteur (champs obligatoires) apparaissent désormais dans le panneau de configuration, sous Cercle 1, affichés comme toujours actifs (non décochables)
- La Langue passe en champ coché par défaut (cercle 1, socle)

---

## [0.56.1] — 2026-07-17

### Changed
- Le fallback multi-API (BnF → OpenLibrary → Google Books) continue désormais d'interroger les sources suivantes tant qu'un champ bibliographique sélectionné manque (et plus seulement titre/auteur/éditeur/pages) — utile pour Genre, Résumé, Langue qui ne sont fournis que par Google Books

---

## [0.56.0] — 2026-07-17

### Added
- Panneau dédié "champs bibliographiques" pour choisir les champs affichés dans la fiche (Éditeur, Collection, Date édition, Pages, Couverture, Genre, Résumé, Langue) — préférence enregistrée localement, appliquée immédiatement sans rechargement
- Nouveaux champs extraits automatiquement via Google Books : Genre (`multi_select` Notion), Résumé, Langue
- L'enregistrement Notion crée automatiquement les colonnes correspondant aux champs bibliographiques actuellement activés (schéma dynamique)

### Changed
- Le bâtisseur de propriétés Notion (`buildProps`) n'envoie que les champs bibliographiques actifs — un champ décoché est omis de l'envoi plutôt que vidé, pour ne pas écraser une donnée déjà présente dans Notion

### Removed
- Champs personnalisés "Nationalité de l'auteur" et "Publication originale" (jamais alimentés par une recherche ISBN, remplacés par le mécanisme de champs configurables)

---

## [0.55.0] — 2026-07-17

### Added
- Avertissement discret (pastille + `aria-label`) sur le bouton "⚙ configuration" quand le token Notion, la database ID ou l'URL du proxy ne sont pas renseignés, dès le chargement de la page

---

## [0.54.1] — 2026-07-04

### Added
- ESLint 9 (flat config) : lint du code source avec `npm run lint` — règles qualité, sécurité statique (no-eval, no-implied-eval, eqeqeq, prefer-const, no-var, no-unused-vars)
- axe-core : tests d'accessibilité RGAA automatisés via Vitest/jsdom (`tests/unit/accessibility.test.js`, 5 tests WCAG 2.0/2.1 AA)

### Fixed
- Accessibilité (RGAA) : `aria-live="polite" aria-atomic="true"` sur les 5 zones de statut dynamique
- Accessibilité (RGAA) : `aria-hidden="true"` initial sur les panneaux masqués (`#config-panel`, `#devlog`, `#doc-panel`) et synchronisation dans les fonctions toggle JS
- Accessibilité (RGAA) : attribut `for` ajouté sur tous les labels de formulaire (23 champs)
- Accessibilité (RGAA) : `aria-label` sur les boutons ✕ et `aria-haspopup` + `aria-label` sur `#source-badge`
- Accessibilité (RGAA) : focus déplacé sur le premier bouton après injection dynamique (`showNotionChoice`, `showDuplicateOnSendChoice`)
- Sécurité : `encodeURIComponent()` sur le paramètre ISBN dans l'URL Google Books

---

## [0.54.0] — 2026-06-28

### Added
- Vérification des doublons Notion au moment du clic sur "Envoyer dans Notion" : si un livre avec le même ISBN existe déjà dans la base, l'utilisateur peut choisir entre mettre à jour la fiche existante, créer une nouvelle entrée, ou annuler

---

## [0.53.0] — 2026-06-20

### Added
- Panneau de documentation in-app accessible via le bouton `[doc]` dans la barre de navigation bas de page : liste des fonctionnalités, schéma d'architecture (APIs bibliographiques, Claude, Cloudflare, Notion), guide d'initialisation pas-à-pas
- Exclusion mutuelle des panneaux de navigation (changelog, configuration, doc) : l'ouverture de l'un ferme les autres

---

## [0.52.0] — 2026-06-20

### Added
- Bouton "Compléter les champs avec les sources bibliothéquaires" affiché après chargement depuis Notion : recherche les sources et remplit uniquement les champs encore vides sans écraser les données Notion
- `complementFromSources(isbn)` dans `ui.js` : recherche bibliographique non-destructive (ne touche qu'aux champs vides du formulaire)
- Pré-vérification Notion avant la recherche bibliographique : à chaque scan d'ISBN, l'app interroge d'abord la base Notion pour détecter une fiche existante
- Choix utilisateur quand un ISBN est trouvé dans Notion : "Charger depuis Notion" ou "Rechercher les sources" (affichage dans la zone de statut, sans modal)
- Chargement complet depuis Notion : tous les champs sont pré-remplis (titre, auteur, statut, thème, fiche, note, etc.) avec la classe `.notion-filled` (teinte ambrée) et le badge "Notion" dans les labels
- `lookupFromNotion(isbn, cfg)` dans `notion.js` : requête Notion par ISBN, retourne le plus ancien résultat si plusieurs trouvés (`created_time` ASC)
- `updatePageFull(pageId, cfg, sync)` dans `notion.js` : mise à jour PATCH de tous les champs d'une page Notion existante
- État `_currentPageId` dans `notion.js` avec `setCurrentPageId` / `clearCurrentPageId` pour router entre création et mise à jour
- `fillFormFromNotion(b)` dans `ui.js` : remplit le formulaire depuis une fiche Notion avec la classe `.notion-filled` sur chaque champ non vide
- `setFieldNotion(id, val)` dans `ui.js` : variante de `setField` qui applique `.notion-filled` au lieu de `.prefilled`
- `setLastIsbn(isbn)` dans `ui.js` : setter public pour synchroniser l'état du bouton "Rechercher" quand Notion répond avant le lookup
- `startSearch(isbn)` dans `main.js` : point d'entrée unique du lookup — pré-vérifie Notion puis lance le lookup bibliographique si nécessaire
- Classe CSS `.notion-filled` (teinte ambrée `#d97706`) et `.lbl-src--notion` (badge ambre dans les labels)
- Badges "Notion" ajoutés dans les labels de tous les champs pouvant être chargés depuis Notion (14 champs)
- 20 nouveaux tests couvrant `lookupFromNotion`, `updatePageFull`, routage `sendToNotion`, `setFieldNotion`, `fillFormFromNotion`
- 2 nouvelles fixtures : `notion-query-found.json` (page complète), `notion-query-two-results.json` (tri par ancienneté)

### Changed
- Bouton "Rechercher les sources" renommé "Ajouter une nouvelle entrée" dans le choix Notion
- Badge de couverture orange (#d97706) quand la couverture provient de Notion (était bleu)
- `fillForm(b)` efface toutes les classes `.notion-filled` résiduelles en début d'appel
- `suggestTheme()` et `generateFiche()` retirent `.notion-filled` avant d'appliquer `.ai-filled`
- Tous les champs du formulaire ont désormais un listener qui retire `.notion-filled` à la modification (statut, priorité, note, état, date de lecture, nationalité, date pub, citations, commentaire)
- `sendToNotion()` : route vers `updatePageFull` si `_currentPageId` défini, vers `doSend` sinon ; le contrôle doublon est supprimé
- Bouton "Envoyer dans Notion" devient "Mettre à jour dans Notion" quand une fiche est chargée depuis Notion
- `main.js` : tous les déclencheurs du lookup (bouton, Enter, URL param) passent par `startSearch()` au lieu d'appeler `lookup()` directement
- Retrait des classes `.notion-filled` en plus de `.prefilled` dans les listeners de modification utilisateur
- Test d'intégration `duplicate-flow.test.js` réécrit pour le nouveau flux (lookup Notion + modes création/mise à jour)

### Removed
- `checkDuplicate()` (remplacée par `lookupFromNotion`)
- `confirmSend()` (plus de dialog doublon)
- `updateStatutLecture()` (remplacée par `updatePageFull` qui met à jour tous les champs)

---

## [0.51.0] — 2026-06-20

### Added
- Badge source par champ : le badge "ISBN" dans chaque label affiche désormais la source exacte du champ (ex. "BnF 13", "OL 13", "Google") plutôt que le texte générique "ISBN"
- Popover sources : cliquer sur le badge source du bandeau ouvre un panneau détaillant chaque source consultée (✓ Importé · champs, — Aucun résultat, ✗ Erreur, · Non consulté)
- Couverture agrandie (90 px) avec badge source conditionnel (visible uniquement si la couverture a été importée)
- `searchLog` et `fieldSources` dans le modèle de données de `lookup()` pour tracer l'origine de chaque champ et le résultat par source
- Indicateurs visuels d'origine des champs : badge `ISBN` (bleu) sur les champs auto-remplis par lookup, badge `IA` (violet) sur les champs pouvant être générés par IA (thème, sous-thème, fiche)
- Classe CSS `ai-filled` (fond violacé) appliquée aux champs remplis par IA après génération de fiche ou suggestion de thème ; retirée à chaque nouveau lookup
- Enrichissement multi-sources : si des champs restent vides après la source principale, les sources suivantes sont interrogées pour les compléter (sans écraser les valeurs existantes)
- Source détaillée dans le badge : distingue désormais `BnF ISBN-13`, `BnF ISBN-10`, `OpenLibrary ISBN-13`, etc. ; affiche toutes les sources ayant contribué (ex. `BnF ISBN-13 • OpenLibrary ISBN-13`)

### Changed
- Fiche de lecture générée avec `claude-sonnet-4-6` (au lieu de Haiku) pour une meilleure qualité d'analyse littéraire ; `max_tokens` porté à 600
- Prompt de la fiche enrichi : l'éditeur et la collection sont passés en contexte pour calibrer le registre (Pléiade, collection académique, etc.)
- `callClaude()` accepte désormais `{ model, maxTokens }` en second paramètre (défauts : Haiku, 400) — la suggestion de thème continue d'utiliser Haiku
- Reset complet du formulaire à chaque nouveau lookup (thème, statut, note, état, commentaire inclus) ; bouton "Rechercher" grisé tant que l'ISBN saisi correspond au dernier ISBN recherché

---

## [0.50.3] — 2026-06-20

### Added
- Suite de tests automatisés avec Vitest + jsdom : 107 tests couvrant les 7 modules (`isbn`, `themes`, `config`, `claude`, `fetchers`, `ui`, `notion`) et 2 flows d'intégration (lookup fallback BnF→OL→Google, détection de doublons Notion)
- `package.json` avec scripts `npm test`, `npm run test:watch`, `npm run test:coverage`
- `vitest.config.js`, `.gitignore`, `tests/fixtures/` (9 fichiers XML/JSON de bouchonnage), `tests/helpers/localStorage.js`
- Section **Tests** dans `CLAUDE.md` : règles, commandes, stratégie de stub

---

## [0.50.2] — 2026-06-19

### Changed
- Sélecteur de moteur de recherche (BnF / OpenLibrary / Google Books) déplacé dans le panneau ⚙ configuration, persisté en `localStorage`
- Saisie manuelle d'ISBN conservée (input + bouton "Rechercher") ; lance un nouveau lookup et réinitialise le formulaire si une fiche était déjà affichée

---

## [0.50.1] — 2026-06-19

### Changed
- Modularisation de l'application en 8 modules ES (`src/main.js`, `src/ui.js`, `src/notion.js`, `src/fetchers.js`, `src/isbn.js`, `src/claude.js`, `src/themes.js`, `src/config.js`)

### Fixed
- Renommage de l'UI de configuration et sécurisation de l'affichage des champs secrets

---

## [0.50.0] — 2026-06-13

### Added
- Validation ISBN par checksum (algorithme de Luhn) — erreur affichée avant toute recherche si le numéro est invalide
- Raccourci Cmd+Entrée / Ctrl+Entrée pour envoyer dans Notion depuis n'importe quel champ du formulaire

### Changed
- Timeout 5 s par source (BnF, OpenLibrary, Google Books) via AbortController — plus de blocage en cas d'API silencieuse
- `max_tokens` IA 256 → 400 pour éviter les fiches tronquées

### Fixed
- Champs pré-remplis par l'API mis en évidence visuellement (fond légèrement contrasté)

---

## [0.49.0] — 2026-06-13

### Added
- Bloc "Citations" — saisie libre des extraits marquants, synchronisé dans Notion (propriété rich_text "Citations"), créé automatiquement dans la base si absent

### Changed
- Nouveau prompt universel pour la fiche de lecture — 3 points structurés (propos, enjeux, singularité), adapté à tout type d'œuvre (roman, essai, poésie, traité…)
- Prompt contextualise le thème et sous-thème sélectionnés
- Format bullet homogène, plus court et plus lisible

---

## [0.48.0] — 2026-05-31

### Added
- Saisie manuelle ISBN-13 ou ISBN-10
- Moteur préférentiel configurable (BnF par défaut) — fallback automatique sur OpenLibrary puis Google Books
- BnF via API SRU UNIMARC — meilleure couverture livres français
- Conversion ISBN-13 → ISBN-10 automatique pour les livres anciens
- Couverture récupérée depuis OpenLibrary Covers en fallback
- Détection du paramètre `?isbn=` dans l'URL — lookup automatique (compatible Raccourcis iOS)
- 11 thèmes et sous-thèmes contextuels avec cases vides par défaut
- Bouton "Suggérer via IA" pour le thème/sous-thème (Claude Haiku)
- Statuts : À lire, En cours, Lu, Étude, Collection, Néant
- Priorité de lecture, date de lecture (mois/année), note ★
- Fiche de lecture avec génération IA (Claude Haiku) et prompt adapté selon le thème
- État physique du livre (Neuf / Très bon / Bon / Correct / Abîmé)
- Livre de collection (checkbox) avec détection automatique (Pléiade, Bouquins, Quarto…)
- Commentaire libre
- Sync automatique des propriétés Notion avant chaque envoi — création des champs manquants, détection des conflits de type
- Couverture envoyée comme image de couverture de la page Notion
- Contrôle doublon sur ISBN — trois options (Ajouter / Mettre à jour / Annuler)
- Token, Database ID, proxy Cloudflare et clé API Anthropic stockés en localStorage (jamais dans le code)
- Mode clair / sombre automatique (préférences système)

---

[Unreleased]: https://github.com/Sekjh/Biblioth-que/compare/v0.60.1...HEAD
[0.60.1]: https://github.com/Sekjh/Biblioth-que/compare/v0.60.0...v0.60.1
[0.60.0]: https://github.com/Sekjh/Biblioth-que/compare/v0.59.1...v0.60.0
[0.59.1]: https://github.com/Sekjh/Biblioth-que/compare/v0.59.0...v0.59.1
[0.59.0]: https://github.com/Sekjh/Biblioth-que/compare/v0.58.0...v0.59.0
[0.58.0]: https://github.com/Sekjh/Biblioth-que/compare/v0.57.0...v0.58.0
[0.57.0]: https://github.com/Sekjh/Biblioth-que/compare/v0.56.1...v0.57.0
[0.56.1]: https://github.com/Sekjh/Biblioth-que/compare/v0.56.0...v0.56.1
[0.56.0]: https://github.com/Sekjh/Biblioth-que/compare/v0.55.0...v0.56.0
[0.55.0]: https://github.com/Sekjh/Biblioth-que/compare/v0.54.1...v0.55.0
[0.54.1]: https://github.com/Sekjh/Biblioth-que/compare/v0.54.0...v0.54.1
[0.54.0]: https://github.com/Sekjh/Biblioth-que/compare/v0.53.0...v0.54.0
[0.53.0]: https://github.com/Sekjh/Biblioth-que/compare/v0.52.0...v0.53.0
[0.52.0]: https://github.com/Sekjh/Biblioth-que/compare/v0.51.0...v0.52.0
[0.51.0]: https://github.com/Sekjh/Biblioth-que/compare/v0.50.3...v0.51.0
[0.50.3]: https://github.com/Sekjh/Biblioth-que/compare/v0.50.2...v0.50.3
[0.50.2]: https://github.com/Sekjh/Biblioth-que/compare/v0.50.1...v0.50.2
[0.50.1]: https://github.com/Sekjh/Biblioth-que/compare/v0.50.0...v0.50.1
[0.50.0]: https://github.com/Sekjh/Biblioth-que/compare/v0.49.0...v0.50.0
[0.49.0]: https://github.com/Sekjh/Biblioth-que/compare/v0.48.0...v0.49.0
[0.48.0]: https://github.com/Sekjh/Biblioth-que/releases/tag/v0.48.0
