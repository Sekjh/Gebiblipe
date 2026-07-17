// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from 'vitest';
import { detectCollection, setField, setFieldNotion, toggleLu, fillFormFromNotion, fillForm, renderBibFieldsCard, renderBibFieldsChecklist, toggleSourcePopover, getSourceIds, CIRCLE_LABELS, startManualEntry, isManualEntry } from '../../src/ui.js';

// ─── detectCollection ─────────────────────────────────────────────────────────

describe('detectCollection', () => {
  test("détecte 'pléiade' dans le champ collection", () => {
    const r = detectCollection({ collection: 'Bibliothèque de la Pléiade', editeur: '' });
    expect(r.detected).toBe(true);
    expect(r.reason).toMatch(/pléiade/i);
  });

  test("détecte 'bouquins' dans le champ collection", () => {
    const r = detectCollection({ collection: 'Bouquins', editeur: '' });
    expect(r.detected).toBe(true);
  });

  test("détecte 'quarto' dans le titre", () => {
    const r = detectCollection({ collection: '', titre: 'Quarto Gallimard', editeur: '' });
    expect(r.detected).toBe(true);
  });

  test("détecte 'folio classique' mais PAS 'folio' seul", () => {
    expect(detectCollection({ collection: 'Folio classique', editeur: '' }).detected).toBe(true);
    expect(detectCollection({ collection: 'Folio', editeur: '' }).detected).toBe(false);
  });

  test("détecte 'édition originale' dans le champ collection", () => {
    const r = detectCollection({ collection: 'Édition originale numérotée', editeur: '' });
    expect(r.detected).toBe(true);
  });

  test('détecte Gallimard avec date < 1900 (via dateed)', () => {
    const r = detectCollection({ collection: '', editeur: 'Gallimard', dateed: '1890' });
    expect(r.detected).toBe(true);
    expect(r.reason).toContain('1890');
  });

  test('ne détecte PAS Gallimard post-1900', () => {
    const r = detectCollection({ collection: '', editeur: 'Gallimard', dateed: '1955' });
    expect(r.detected).toBe(false);
  });

  test('retourne { detected: false } pour un livre moderne ordinaire', () => {
    const r = detectCollection({ titre: 'Guerre et Paix', collection: 'Folio', editeur: 'Gallimard', dateed: '2010' });
    expect(r.detected).toBe(false);
    expect(r.reason).toBe('');
  });

  test("détecte 'classiques garnier' dans la collection", () => {
    const r = detectCollection({ collection: 'Classiques Garnier', editeur: '' });
    expect(r.detected).toBe(true);
  });
});

// ─── setField ────────────────────────────────────────────────────────────────

describe('setField', () => {
  beforeEach(() => {
    document.body.innerHTML = '<input id="f-titre" />';
  });

  test('définit la valeur et ajoute la classe prefilled quand la valeur est truthy', () => {
    setField('f-titre', 'Guerre et Paix');
    const el = document.getElementById('f-titre');
    expect(el.value).toBe('Guerre et Paix');
    expect(el.classList.contains('prefilled')).toBe(true);
  });

  test('vide la valeur et retire la classe prefilled quand la valeur est falsy', () => {
    document.getElementById('f-titre').classList.add('prefilled');
    document.getElementById('f-titre').value = 'old';
    setField('f-titre', '');
    const el = document.getElementById('f-titre');
    expect(el.value).toBe('');
    expect(el.classList.contains('prefilled')).toBe(false);
  });

  test('gère null sans erreur (positionne value à chaîne vide)', () => {
    setField('f-titre', null);
    expect(document.getElementById('f-titre').value).toBe('');
  });

  test('gère undefined sans erreur', () => {
    setField('f-titre', undefined);
    expect(document.getElementById('f-titre').value).toBe('');
  });
});

// ─── toggleLu ────────────────────────────────────────────────────────────────

describe('toggleLu', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <select id="f-statut">
        <option value="À lire">À lire</option>
        <option value="En cours">En cours</option>
        <option value="Lu">Lu</option>
        <option value="Étude">Étude</option>
        <option value="Collection">Collection</option>
        <option value="Néant">Néant</option>
      </select>
      <div id="datelu-block" class="hidden"></div>
      <div id="note-block" class="hidden"></div>
      <div id="priorite-block" class="hidden"></div>
    `;
  });

  test("statut 'Lu' → date/note visibles, priorité cachée", () => {
    document.getElementById('f-statut').value = 'Lu';
    toggleLu();
    expect(document.getElementById('datelu-block').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('note-block').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('priorite-block').classList.contains('hidden')).toBe(true);
  });

  test("statut 'Étude' → même comportement que Lu", () => {
    document.getElementById('f-statut').value = 'Étude';
    toggleLu();
    expect(document.getElementById('datelu-block').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('note-block').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('priorite-block').classList.contains('hidden')).toBe(true);
  });

  test("statut 'À lire' → priorité visible, date/note cachées", () => {
    document.getElementById('f-statut').value = 'À lire';
    toggleLu();
    expect(document.getElementById('priorite-block').classList.contains('hidden')).toBe(false);
    expect(document.getElementById('datelu-block').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('note-block').classList.contains('hidden')).toBe(true);
  });

  test("statut 'En cours' → priorité visible", () => {
    document.getElementById('f-statut').value = 'En cours';
    toggleLu();
    expect(document.getElementById('priorite-block').classList.contains('hidden')).toBe(false);
  });

  test("statut 'Collection' → tout caché", () => {
    document.getElementById('f-statut').value = 'Collection';
    toggleLu();
    expect(document.getElementById('datelu-block').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('note-block').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('priorite-block').classList.contains('hidden')).toBe(true);
  });

  test("statut 'Néant' → tout caché", () => {
    document.getElementById('f-statut').value = 'Néant';
    toggleLu();
    expect(document.getElementById('datelu-block').classList.contains('hidden')).toBe(true);
    expect(document.getElementById('priorite-block').classList.contains('hidden')).toBe(true);
  });
});

// ─── setFieldNotion ──────────────────────────────────────────────────────────

describe('setFieldNotion', () => {
  beforeEach(() => {
    document.body.innerHTML = '<input id="f-titre" />';
  });

  test('définit la valeur et ajoute la classe notion-filled quand la valeur est truthy', () => {
    setFieldNotion('f-titre', 'Le Capital');
    const el = document.getElementById('f-titre');
    expect(el.value).toBe('Le Capital');
    expect(el.classList.contains('notion-filled')).toBe(true);
    expect(el.classList.contains('prefilled')).toBe(false);
  });

  test('vide la valeur et retire notion-filled quand la valeur est falsy', () => {
    document.getElementById('f-titre').classList.add('notion-filled');
    setFieldNotion('f-titre', '');
    const el = document.getElementById('f-titre');
    expect(el.value).toBe('');
    expect(el.classList.contains('notion-filled')).toBe(false);
  });

  test('retire prefilled et ai-filled lors du set', () => {
    const el = document.getElementById('f-titre');
    el.classList.add('prefilled', 'ai-filled');
    setFieldNotion('f-titre', 'Valeur');
    expect(el.classList.contains('prefilled')).toBe(false);
    expect(el.classList.contains('ai-filled')).toBe(false);
    expect(el.classList.contains('notion-filled')).toBe(true);
  });

  test('gère null sans erreur', () => {
    setFieldNotion('f-titre', null);
    expect(document.getElementById('f-titre').value).toBe('');
    expect(document.getElementById('f-titre').classList.contains('notion-filled')).toBe(false);
  });
});

// ─── fillFormFromNotion ───────────────────────────────────────────────────────

const FULL_DOM = `
  <p id="status"></p>
  <div id="form-section" style="display:none">
    <div class="field"><label>Titre</label><input id="f-titre" /></div>
    <div class="field"><label>Auteur</label><input id="f-auteur" /></div>
    <div class="field"><label>Éditeur <span class="lbl-src">ISBN</span></label><input id="f-editeur" /></div>
    <div class="field"><label>Collection</label><input id="f-collection-ed" /></div>
    <div class="field"><label>ISBN</label><input id="f-isbn" /></div>
    <div class="field"><label>Date éd.</label><input id="f-dateed" /></div>
    <div class="field"><label>Pages</label><input id="f-pages" /></div>
    <div class="field"><label>Thème</label>
      <select id="f-theme">
        <option value="">—</option>
        <option value="Histoire">Histoire</option>
      </select>
    </div>
    <div class="field"><label>Sous-thème</label>
      <select id="f-soustheme">
        <option value="">—</option>
      </select>
    </div>
    <div class="field"><label>Statut</label>
      <select id="f-statut">
        <option value="À lire">À lire</option>
        <option value="Lu">Lu</option>
      </select>
    </div>
    <div class="field" id="priorite-block"><label>Priorité</label>
      <select id="f-priorite"><option value="">—</option><option value="Haute">Haute</option></select>
    </div>
    <div class="field" id="datelu-block" class="hidden"><label>Date lecture</label>
      <select id="f-datelu-mois"><option value="">—</option><option value="Juin">Juin</option></select>
      <select id="f-datelu-annee"><option value="">—</option><option value="2024">2024</option></select>
    </div>
    <div class="field" id="note-block" class="hidden"><label>Note</label>
      <select id="f-note"><option value="">—</option><option value="★★★★★">★★★★★</option></select>
    </div>
    <div class="field"><label>État</label>
      <select id="f-etat"><option value="">—</option><option value="Neuf">Neuf</option></select>
    </div>
    <div class="field"><input type="checkbox" id="f-collection" /></div>
    <p id="collection-hint"></p>
    <div class="field"><label>Fiche</label><textarea id="f-fiche"></textarea></div>
    <div class="field"><label>Citations</label><textarea id="f-citations"></textarea></div>
    <div class="field"><label>Commentaire</label><textarea id="f-comment"></textarea></div>
    <p id="theme-ai-status"></p>
    <p id="fiche-ai-status"></p>
  </div>
  <p id="found-title"></p>
  <button class="source-badge" id="source-badge"></button>
  <div id="cover-wrap">
    <img id="cover-img" style="display:none" src="" />
    <span id="cover-src-badge"></span>
  </div>
  <button id="btn-send-notion">Envoyer dans Notion</button>
`;

const NOTION_BOOK = {
  isbn: '9782070360024',
  titre: 'Le Capital',
  auteur: 'Karl Marx',
  editeur: 'Éditions Sociales',
  collection: '',
  dateed: '1969',
  pages: '900',
  theme: 'Histoire',
  soustheme: '',
  statut: 'Lu',
  priorite: '',
  datem: 'Juin',
  datey: '2024',
  note: '★★★★★',
  etat: '',
  fcollection: false,
  fiche: 'Ma fiche de lecture.',
  citations: '',
  commentaire: '',
  couverture: 'https://covers.example.com/img.jpg',
  fromNotion: true,
  notionPageId: 'page-abc-123',
  source: 'Notion',
  searchLog: [],
  fieldSources: {},
};

describe('fillFormFromNotion', () => {
  beforeEach(() => {
    document.body.innerHTML = FULL_DOM;
  });

  test('remplit les champs bibliographiques avec notion-filled', () => {
    fillFormFromNotion(NOTION_BOOK);
    expect(document.getElementById('f-titre').value).toBe('Le Capital');
    expect(document.getElementById('f-titre').classList.contains('notion-filled')).toBe(true);
    expect(document.getElementById('f-auteur').classList.contains('notion-filled')).toBe(true);
    expect(document.getElementById('f-pages').value).toBe('900');
  });

  test('remplit les champs lecture avec notion-filled', () => {
    fillFormFromNotion(NOTION_BOOK);
    expect(document.getElementById('f-statut').value).toBe('Lu');
    expect(document.getElementById('f-statut').classList.contains('notion-filled')).toBe(true);
    expect(document.getElementById('f-datelu-mois').value).toBe('Juin');
    expect(document.getElementById('f-datelu-mois').classList.contains('notion-filled')).toBe(true);
    expect(document.getElementById('f-datelu-annee').value).toBe('2024');
    expect(document.getElementById('f-note').value).toBe('★★★★★');
    expect(document.getElementById('f-note').classList.contains('notion-filled')).toBe(true);
  });

  test('remplit les champs texte libres avec notion-filled', () => {
    fillFormFromNotion(NOTION_BOOK);
    expect(document.getElementById('f-fiche').value).toBe('Ma fiche de lecture.');
    expect(document.getElementById('f-fiche').classList.contains('notion-filled')).toBe(true);
  });

  test('met le thème avec notion-filled', () => {
    fillFormFromNotion(NOTION_BOOK);
    expect(document.getElementById('f-theme').value).toBe('Histoire');
    expect(document.getElementById('f-theme').classList.contains('notion-filled')).toBe(true);
  });

  test('ne met pas notion-filled sur un champ vide', () => {
    fillFormFromNotion(NOTION_BOOK);
    expect(document.getElementById('f-collection-ed').classList.contains('notion-filled')).toBe(false);
    expect(document.getElementById('f-etat').classList.contains('notion-filled')).toBe(false);
  });

  test('affiche la couverture avec la classe notion-filled', () => {
    fillFormFromNotion(NOTION_BOOK);
    const img = document.getElementById('cover-img');
    expect(img.style.display).toBe('block');
    expect(img.classList.contains('notion-filled')).toBe(true);
    expect(img.classList.contains('prefilled')).toBe(false);
  });

  test("change le texte du bouton en 'Mettre à jour dans Notion'", () => {
    fillFormFromNotion(NOTION_BOOK);
    expect(document.getElementById('btn-send-notion').textContent).toBe('Mettre à jour dans Notion');
  });

  test('affiche le titre dans found-title', () => {
    fillFormFromNotion(NOTION_BOOK);
    expect(document.getElementById('found-title').textContent).toBe('Le Capital');
  });

  test('affiche la section formulaire', () => {
    fillFormFromNotion(NOTION_BOOK);
    expect(document.getElementById('form-section').style.display).toBe('block');
  });

  test('retire prefilled existant avant de positionner notion-filled', () => {
    document.getElementById('f-titre').classList.add('prefilled');
    fillFormFromNotion(NOTION_BOOK);
    const el = document.getElementById('f-titre');
    expect(el.classList.contains('prefilled')).toBe(false);
    expect(el.classList.contains('notion-filled')).toBe(true);
  });

  test('réinitialise les identifiants pivots (getSourceIds)', () => {
    fillFormFromNotion(NOTION_BOOK);
    expect(getSourceIds()).toEqual({});
  });
});

// ─── renderBibFieldsChecklist ─────────────────────────────────────────────────

describe('renderBibFieldsChecklist', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="bib-fields-checklist"></div>';
    localStorage.clear();
  });

  test('affiche Titre et Auteur en tête du Cercle 1, verrouillés (coché + disabled)', () => {
    renderBibFieldsChecklist();
    const titre = document.getElementById('bibcfg-mandatory-titre');
    const auteur = document.getElementById('bibcfg-mandatory-auteur');
    expect(titre.checked).toBe(true);
    expect(titre.disabled).toBe(true);
    expect(auteur.checked).toBe(true);
    expect(auteur.disabled).toBe(true);
  });

  test('affiche un intitulé de groupe par cercle (3 groupes)', () => {
    renderBibFieldsChecklist();
    const headings = document.querySelectorAll('#bib-fields-checklist .section-title');
    expect(headings.length).toBe(3);
    expect(headings[0].textContent).toContain('Cercle 1');
  });

  test('les champs bibliographiques configurables restent cochables (non disabled)', () => {
    renderBibFieldsChecklist();
    expect(document.getElementById('bibcfg-editeur').disabled).toBe(false);
  });
});

// ─── renderBibFieldsCard — séparateurs de cercles ─────────────────────────────

describe('renderBibFieldsCard — séparateurs de cercles', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div class="grid2" id="bib-fields-dynamic"></div>';
    localStorage.clear();
  });

  test('affiche un séparateur par cercle représenté (3 cercles avec la config par défaut)', () => {
    renderBibFieldsCard();
    const headings = document.querySelectorAll('#bib-fields-dynamic .bib-circle-title');
    expect(headings.length).toBe(3);
    expect(headings[0].textContent).toBe(CIRCLE_LABELS[1]);
    expect(headings[1].textContent).toBe(CIRCLE_LABELS[2]);
    expect(headings[2].textContent).toBe(CIRCLE_LABELS[3]);
  });

  test("n'affiche pas de séparateur en double entre deux champs consécutifs du même cercle", () => {
    localStorage.setItem('bib_fields', JSON.stringify(['editeur', 'dateed', 'language']));
    renderBibFieldsCard();
    const headings = document.querySelectorAll('#bib-fields-dynamic .bib-circle-title');
    expect(headings.length).toBe(1);
    expect(headings[0].textContent).toBe(CIRCLE_LABELS[1]);
  });

  test('chaque séparateur précède directement le premier champ de son cercle', () => {
    renderBibFieldsCard();
    const container = document.getElementById('bib-fields-dynamic');
    const firstHeading = container.querySelector('.bib-circle-title');
    expect(firstHeading.nextElementSibling.classList.contains('field')).toBe(true);
  });
});

// ─── fillForm — couleurs de badge par source réelle ───────────────────────────

describe('fillForm — couleurs de badge par source réelle', () => {
  beforeEach(() => {
    document.body.innerHTML = FULL_DOM;
    localStorage.clear();
  });

  test('applique la classe lbl-src--bnf quand le champ vient de BnF', () => {
    fillForm({ isbn: '9782070360024', titre: 'Le Capital', auteur: 'Karl Marx', editeur: 'Éditions Sociales', source: 'BnF ISBN-13', searchLog: [], fieldSources: { editeur: 'BnF ISBN-13' } });
    const badge = document.getElementById('f-editeur').closest('.field').querySelector('.lbl-src');
    expect(badge.classList.contains('lbl-src--bnf')).toBe(true);
  });

  test('applique la classe lbl-src--sudoc quand le champ vient de SUDOC', () => {
    fillForm({ isbn: '9782070360024', titre: "L'étranger", auteur: 'Albert Camus', editeur: 'Gallimard', source: 'SUDOC ISBN-13', searchLog: [], fieldSources: { editeur: 'SUDOC ISBN-13' } });
    const badge = document.getElementById('f-editeur').closest('.field').querySelector('.lbl-src');
    expect(badge.classList.contains('lbl-src--sudoc')).toBe(true);
  });

  test('applique la classe lbl-src--google quand le champ vient de Google Books', () => {
    fillForm({ isbn: '9782070360024', titre: 'Le Capital', auteur: 'Karl Marx', editeur: 'Éditions Sociales', source: 'Google Books', searchLog: [], fieldSources: { editeur: 'Google Books' } });
    const badge = document.getElementById('f-editeur').closest('.field').querySelector('.lbl-src');
    expect(badge.classList.contains('lbl-src--google')).toBe(true);
  });

  test('applique la classe lbl-src--openlibrary quand le champ vient d\'OpenLibrary', () => {
    fillForm({ isbn: '9782070360024', titre: 'Le Capital', auteur: 'Karl Marx', editeur: 'Éditions Sociales', source: 'OpenLibrary ISBN-13', searchLog: [], fieldSources: { editeur: 'OpenLibrary ISBN-13' } });
    const badge = document.getElementById('f-editeur').closest('.field').querySelector('.lbl-src');
    expect(badge.classList.contains('lbl-src--openlibrary')).toBe(true);
  });

  test('retire une classe de couleur obsolète lors d\'un nouveau remplissage (pas d\'accumulation)', () => {
    fillForm({ isbn: '9782070360024', titre: 'Le Capital', auteur: 'Karl Marx', editeur: 'Éditions Sociales', source: 'BnF ISBN-13', searchLog: [], fieldSources: { editeur: 'BnF ISBN-13' } });
    fillForm({ isbn: '9782070360024', titre: 'Le Capital', auteur: 'Karl Marx', editeur: 'Éditions Sociales', source: 'Google Books', searchLog: [], fieldSources: { editeur: 'Google Books' } });
    const badge = document.getElementById('f-editeur').closest('.field').querySelector('.lbl-src');
    expect(badge.classList.contains('lbl-src--bnf')).toBe(false);
    expect(badge.classList.contains('lbl-src--google')).toBe(true);
  });

  test("n'applique aucune classe de couleur quand le champ n'a pas de source suivie (badge 'ISBN' générique)", () => {
    fillForm({ isbn: '9782070360024', titre: 'Le Capital', auteur: 'Karl Marx', editeur: 'Éditions Sociales', source: '', searchLog: [], fieldSources: {} });
    const badge = document.getElementById('f-editeur').closest('.field').querySelector('.lbl-src');
    expect(badge.textContent).toBe('ISBN');
    expect(badge.className).toBe('lbl-src');
  });
});

// ─── startManualEntry ──────────────────────────────────────────────────────────

describe('startManualEntry', () => {
  beforeEach(() => {
    document.body.innerHTML = FULL_DOM;
    localStorage.clear();
  });

  test('vide les champs titre et auteur', () => {
    document.getElementById('f-titre').value = 'Ancien titre';
    document.getElementById('f-auteur').value = 'Ancien auteur';
    startManualEntry();
    expect(document.getElementById('f-titre').value).toBe('');
    expect(document.getElementById('f-auteur').value).toBe('');
  });

  test("affiche 'Saisie manuelle' dans le badge de source", () => {
    startManualEntry();
    expect(document.getElementById('source-badge').textContent).toBe('Saisie manuelle');
  });

  test('affiche la section formulaire', () => {
    startManualEntry();
    expect(document.getElementById('form-section').style.display).toBe('block');
  });

  test('déplace le focus sur le champ Titre', () => {
    startManualEntry();
    expect(document.activeElement.id).toBe('f-titre');
  });

  test('isManualEntry() devient vrai (aucune source bibliographique)', () => {
    startManualEntry();
    expect(isManualEntry()).toBe(true);
  });
});

// ─── isManualEntry ─────────────────────────────────────────────────────────────

describe('isManualEntry', () => {
  beforeEach(() => {
    document.body.innerHTML = FULL_DOM;
    localStorage.clear();
  });

  test('vrai après fillForm() avec un livre sans source (recherche ISBN infructueuse)', () => {
    fillForm({ isbn: '9999999999999', titre: '', auteur: '', source: '', searchLog: [], fieldSources: {} });
    expect(isManualEntry()).toBe(true);
  });

  test('faux après fillForm() avec un livre trouvé via une source bibliographique', () => {
    fillForm({ isbn: '9782070360024', titre: 'Le Capital', auteur: 'Karl Marx', source: 'BnF ISBN-13', searchLog: [], fieldSources: {} });
    expect(isManualEntry()).toBe(false);
  });

  test('faux après fillFormFromNotion() (chargement depuis Notion, pas une saisie manuelle)', () => {
    fillForm({ isbn: '', titre: '', auteur: '', source: '', searchLog: [], fieldSources: {} });
    expect(isManualEntry()).toBe(true);
    fillFormFromNotion(NOTION_BOOK);
    expect(isManualEntry()).toBe(false);
  });
});

// ─── toggleSourcePopover — identifiants pivots ────────────────────────────────

describe('toggleSourcePopover — identifiants pivots', () => {
  beforeEach(() => {
    document.body.innerHTML = FULL_DOM + '<div id="source-popover" hidden></div>';
    localStorage.clear();
  });

  test("affiche la section « Identifiants techniques » quand des sourceIds sont présents", () => {
    fillForm({ isbn: '9782070360024', titre: 'Le Capital', auteur: 'Karl Marx', source: 'BnF ISBN-13', searchLog: [], fieldSources: {}, sourceIds: { ark: 'ark:/12148/cb31570438x' } });
    toggleSourcePopover();
    const pop = document.getElementById('source-popover');
    expect(pop.textContent).toContain('Identifiants techniques');
    expect(pop.textContent).toContain('ark:/12148/cb31570438x');
  });

  test("n'affiche pas la section pivots quand aucun sourceId n'est présent", () => {
    fillForm({ isbn: '9782070360024', titre: 'Le Capital', auteur: 'Karl Marx', source: 'BnF ISBN-13', searchLog: [], fieldSources: {} });
    toggleSourcePopover();
    const pop = document.getElementById('source-popover');
    expect(pop.textContent).not.toContain('Identifiants techniques');
  });
});
