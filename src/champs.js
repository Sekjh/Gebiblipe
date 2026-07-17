import { getEnabledBibFields } from './config.js';

// Champs obligatoires : toujours affichés, non désactivables.
// circle: 1 à titre documentaire (socle) — sans effet, ces champs restent verrouillés quoi qu'il arrive.
export const MANDATORY_FIELDS = [
  { key: 'titre',  id: 'f-titre',  label: 'Titre',     notionProp: 'Nom',    notionType: 'title', circle: 1 },
  { key: 'auteur', id: 'f-auteur', label: 'Auteur(s)', notionProp: 'Auteur', notionType: 'rich_text', circle: 1 },
];

// Champs bibliographiques configurables — cochables/décochables dans le panneau dédié.
// circle regroupe les champs par taux de complétion/valeur d'usage observés sur les API ISBN :
// 1 = socle quasi universel, 2 = très utile à bonne complétion, 3 = forte valeur mais complétion variable.
// Le tableau est ordonné par circle croissant : cet ordre pilote aussi bien la grille de saisie
// que la checklist de configuration, sans logique de tri supplémentaire.
export const BIB_FIELDS = [
  { key: 'editeur',     id: 'f-editeur',       label: 'Éditeur',               notionProp: 'Éditeur',      notionType: 'rich_text',    defaultOn: true,  circle: 1 },
  { key: 'dateed',      id: 'f-dateed',        label: 'Date de cette édition', notionProp: 'Date édition', notionType: 'rich_text',    defaultOn: true,  circle: 1 },
  { key: 'language',    id: 'f-langue',        label: 'Langue',                notionProp: 'Langue',       notionType: 'rich_text',    defaultOn: true,  circle: 1 },
  { key: 'pages',       id: 'f-pages',         label: 'Nombre de pages',       notionProp: 'Pages',        notionType: 'number',       defaultOn: true,  circle: 2 },
  { key: 'couverture',  id: 'cover-img',       label: 'Couverture',            notionProp: null,           notionType: null,           defaultOn: true,  circle: 2, isCover: true },
  { key: 'format',      id: 'f-format',        label: 'Format / reliure',      notionProp: 'Format',       notionType: 'rich_text',    defaultOn: false, circle: 2 },
  { key: 'collection',  id: 'f-collection-ed', label: 'Collection',            notionProp: 'Collection',   notionType: 'rich_text',    defaultOn: true,  circle: 3 },
  { key: 'categories',  id: 'f-genre',         label: 'Genre',                 notionProp: 'Genre',        notionType: 'multi_select', defaultOn: false, circle: 3 },
  { key: 'description', id: 'f-resume',        label: 'Résumé',                notionProp: 'Résumé',       notionType: 'rich_text',    defaultOn: false, circle: 3 },
];

// Identifiants pivots techniques collectés en best-effort par les fetchers (src/fetchers.js) dans
// b.sourceIds{} pour un recroisement futur entre sources. Non configurables (pas de checkbox, pas
// de cercle) : affichés en lecture seule dans le popover de sources, et envoyés à Notion dès qu'ils
// sont disponibles (voir buildProps() dans notion.js).
export const PIVOT_FIELDS = [
  { key: 'ark',            label: 'ARK (BnF)',          notionProp: 'ARK BnF',          notionType: 'rich_text' },
  { key: 'olid',           label: 'OLID (OpenLibrary)', notionProp: 'OLID',              notionType: 'rich_text' },
  { key: 'googleVolumeId', label: 'Google Volume ID',   notionProp: 'Google Volume ID', notionType: 'rich_text' },
  { key: 'oclc',           label: 'OCLC',               notionProp: 'OCLC',              notionType: 'rich_text' },
  { key: 'ppn',            label: 'PPN (SUDOC)',        notionProp: 'PPN SUDOC',        notionType: 'rich_text' },
];
export const PIVOT_IDENTIFIER_KEYS = PIVOT_FIELDS.map(f => f.key);

export function getActiveBibFields() {
  const enabled = getEnabledBibFields() ?? BIB_FIELDS.filter(f => f.defaultOn).map(f => f.key);
  return BIB_FIELDS.filter(f => enabled.includes(f.key));
}
