# CLAUDE.md — GEBIBLIPE

## Règle de branche

Travailler TOUJOURS sur la branche `dev`.
Ne jamais modifier ni pousser sur `main` sauf lors d'une release explicitement demandée.

---

## Versioning — SemVer + Keep a Changelog

### Format de version

- **SemVer `0.MINOR.PATCH`** (projet pre-1.0, MAJOR reste 0)
- MINOR (+1) : nouvelle fonctionnalité visible par l'utilisateur
- PATCH (+1) : correction de bug, refactor, chore, amélioration config/UX sans ajout fonctionnel
- MAJOR (0→1) : uniquement sur décision explicite du mainteneur

### Messages de commit (Conventional Commits)

Format : `<type>(<scope optionnel>): <description en français>`

Types autorisés :
- `feat:` → MINOR
- `fix:` → PATCH
- `refactor:` → PATCH
- `chore:` → PATCH
- `docs:` → PATCH
- `style:` → PATCH
- `perf:` → PATCH
- `release:` → commit de release uniquement

Exemples valides :
```
feat(isbn): validation par checksum avant recherche
fix(notion): timeout AbortController sur requêtes silencieuses
refactor: modularisation en 8 modules ES
chore: mise à jour CLAUDE.md protocole versioning
release: v0.50.1
```

### Fichiers touchés par le versioning

| Fichier | Quand modifier |
|---|---|
| `CHANGELOG.md` | À chaque commit sur `dev` — section `[Unreleased]` |
| `index.html` ligne 12 | Uniquement lors d'une release |
| `index.html` `#devlog` | Uniquement lors d'une release |
| `src/version.js` (`APP_VERSION`) | Uniquement lors d'une release — synchroniser avec `index.html` ligne 12 |
| `index.html` `#doc-panel` | À chaque `feat:`, `### Changed` ou `### Removed` — mettre à jour la section Fonctionnalités |
| Git tag | Uniquement lors d'une release sur `main` |

> **Documentation in-app** : chaque commit de type `feat:` ou contenant une entrée `### Changed` / `### Removed` dans `CHANGELOG.md` doit s'accompagner d'une mise à jour de la section `Fonctionnalités` du panneau `#doc-panel` dans `index.html`.

---

## Protocole — Développement ordinaire (branche dev)

Pour chaque tâche de développement, dans cet ordre :

**1. Coder le changement**

**1b. Auto-contrôle qualité/RGAA/sécurité** — avant de passer au CHANGELOG, parcourir les checklists qui s'appliquent :

> **Si HTML modifié ou ajouté :**
> - [ ] Chaque `<button>` avec uniquement un symbole/emoji a un `aria-label`
> - [ ] Chaque `<input>`, `<select>`, `<textarea>` a un `<label for="...">` associé
> - [ ] Chaque `<img>` a un `alt` descriptif (ou `alt=""` si décoratif)
> - [ ] Tout panneau masqué initialement par `display:none` a `aria-hidden="true"`
> - [ ] Tout élément de statut dynamique a `aria-live="polite" aria-atomic="true"`
>
> **Si JavaScript DOM modifié ou ajouté :**
> - [ ] Toute fonction qui affiche/masque un panneau synchronise `aria-hidden` (`setAttribute('aria-hidden', 'true'/'false')`)
> - [ ] Tout élément interactif créé dynamiquement a un nom accessible (texte visible ou `aria-label`)
> - [ ] Après injection d'éléments focusables dans le DOM, le focus est déplacé sur le premier élément pertinent (`.focus()`)
>
> **Si `fetch()` vers une API externe modifié ou ajouté :**
> - [ ] Les valeurs utilisateur dans l'URL sont encodées avec `encodeURIComponent()`
> - [ ] La réponse est validée (`res.ok`) avant d'accéder à ses propriétés
> - [ ] Les propriétés imbriquées sont accédées avec `?.` ou une vérification préalable
>
> **Si nouvelle fonction ou nouveau module :**
> - [ ] Pas de `var`, pas d'`eval` / `Function()` / `innerHTML` sur contenu externe
> - [ ] Si un ID ou une chaîne répétée apparaît 3+ fois, la centraliser

**2. Mettre à jour `CHANGELOG.md`** — section `[Unreleased]`, catégorie appropriée :
- `### Added` : nouveauté
- `### Changed` : modification de comportement existant
- `### Fixed` : correction de bug
- `### Removed` : suppression
- `### Security` : correction de sécurité

**3. Committer et pousser**
```
git add .
git commit -m "feat(scope): description courte en français"
git push origin dev
```

Ne pas modifier `index.html` version ni créer de tag git.

---

## Protocole — Release (sur demande explicite uniquement)

Déclenché quand le mainteneur dit « release », « mettre en production », « merger sur main » ou « créer une version ».

**0. Vérification avant release** ← exécuter en premier, avant toute autre étape

```bash
npm run test:coverage   # 0 échec requis — ouvrir coverage/index.html si régression
npm run lint            # 0 erreur ESLint requise (warnings acceptables)
npm audit --audit-level=high  # 0 vulnérabilité high ou critical
```

> `npm test` inclut `accessibility.test.js` — vérifier que les 5 tests RGAA passent.
>
> **Critères bloquants :** si une commande échoue, corriger sur `dev`, committer, relancer l'étape 0 intégralement.
>
> **Revue manuelle :**
> - [ ] Tout bouton dynamique créé depuis la release précédente a un nom accessible
> - [ ] Tout nouveau panneau masqué a `aria-hidden="true"` + toggle synchronisé
> - [ ] Toute valeur passée dans une URL d'API externe est encodée avec `encodeURIComponent`
> - [ ] Les réponses d'API externe sont validées avant accès aux propriétés

**1. Déterminer le prochain numéro**
- Au moins un `feat:` dans `[Unreleased]` → MINOR (+1), PATCH revient à 0
- Sinon → PATCH (+1)

**2. Mettre à jour `CHANGELOG.md`**
- Renommer `[Unreleased]` → `[X.Y.Z] — YYYY-MM-DD` (date du jour ISO 8601)
- Ajouter une nouvelle section `## [Unreleased]` vide au-dessus
- Mettre à jour le lien de comparaison en bas du fichier

**3. Mettre à jour `index.html`**
- Ligne 12 : `vX.Y.Z — YYYY-MM-DD` (ISO 8601)
- Section `#devlog` : synchroniser les 3 dernières versions depuis `CHANGELOG.md`
- Dates du devlog HTML aussi en format `YYYY-MM-DD`

**3b. Mettre à jour `src/version.js`**
- `APP_VERSION` doit correspondre exactement à la version de `index.html` ligne 12 (c'est cette valeur qui est envoyée à Notion)

**4. Commit de release sur dev**
```
git add CHANGELOG.md index.html src/version.js
git commit -m "release: vX.Y.Z"
git push origin dev
```

**5. Merger sur main**
```
git checkout main
git merge dev --no-edit
git push origin main
```

**6. Créer le tag sur main**
```
git tag -a vX.Y.Z -m "vX.Y.Z — résumé en une ligne"
git push origin vX.Y.Z
```

**7. Revenir sur dev**
```
git checkout dev
```

---

## Tests

Stack : **Vitest + jsdom** (`npm install` requis une fois après clone).

### Avant chaque commit `feat:` ou `fix:`

```
npm test
```

### En cours de développement

```
npm run test:watch
```

### Couverture

```
npm run test:coverage
# Ouvrir coverage/index.html pour inspecter
```

### Règles

- Fonctions pures (`isbn.js`, `themes.js`, `config.js`) : env `node`, pas de DOM.
- Fonctions avec DOM (`ui.js`, `notion.js` → `doSend`) : `// @vitest-environment jsdom` en tête de fichier.
- Tout nouveau module → `tests/unit/<module>.test.js`.
- Fixtures JSON/XML dans `tests/fixtures/`.
- Préférer `vi.stubGlobal('fetch', vi.fn())` plutôt que `vi.mock()` un module entier — les parsers réels restent couverts.
- Ne jamais committer `node_modules/` ni `coverage/` (dans `.gitignore`).

---

## Standards qualité, accessibilité RGAA, sécurité

Ces règles s'appliquent à **chaque modification de code**. Les checklists détaillées sont dans la section `## Protocole — Développement ordinaire` (étape 1b). Résumé des principes :

### Qualité du code

- **Pas de `var`** — utiliser `const` ou `let`.
- **Égalité stricte** — `===` et `!==` uniquement.
- **Pas d'`eval`, `Function()`, `innerHTML` sur contenu externe** — risque d'injection.
- **Lint avant commit** : `npm run lint` — zéro erreur requise.
- **Variables et imports** : supprimer tout ce qui est déclaré mais inutilisé.

### Accessibilité RGAA

- Tout `<button>` avec symbole/emoji uniquement → `aria-label` obligatoire.
- Tout `<input>`, `<select>`, `<textarea>` → `<label for="...">` associé.
- Tout élément de statut dynamique → `aria-live="polite" aria-atomic="true"`.
- Tout panneau masqué (`display:none`) → `aria-hidden="true"` + sync dans les toggles JS.
- Éléments focusables injectés dynamiquement → déplacer le focus (`.focus()`).
- Éléments dans ce projet à maintenir : voir liste dans `index.html` (commentaires inline).

### Sécurité

- Valeurs utilisateur dans les URLs d'API → `encodeURIComponent()` obligatoire.
- Réponses API externes → valider `res.ok` et l'existence des propriétés avant accès.
- Clés API et tokens → `localStorage` uniquement, jamais logguées en console.

---

## Git — Exécutable

```powershell
$git = "C:\Users\gauth\AppData\Local\GitHubDesktop\app-3.6.2\resources\app\git\cmd\git.exe"
```
