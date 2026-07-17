import { getEnabledBibFields } from './config.js';

// Champs obligatoires : toujours affichés, non désactivables.
export const MANDATORY_FIELDS = [
  { key: 'titre',  id: 'f-titre',  label: 'Titre',     notionProp: 'Nom',    notionType: 'title' },
  { key: 'auteur', id: 'f-auteur', label: 'Auteur(s)', notionProp: 'Auteur', notionType: 'rich_text' },
];

// Champs bibliographiques configurables — cochables/décochables dans le panneau dédié.
export const BIB_FIELDS = [
  { key: 'editeur',     id: 'f-editeur',       label: 'Éditeur',               notionProp: 'Éditeur',      notionType: 'rich_text',    defaultOn: true },
  { key: 'collection',  id: 'f-collection-ed', label: 'Collection',            notionProp: 'Collection',   notionType: 'rich_text',    defaultOn: true },
  { key: 'dateed',      id: 'f-dateed',        label: 'Date de cette édition', notionProp: 'Date édition', notionType: 'rich_text',    defaultOn: true },
  { key: 'pages',       id: 'f-pages',         label: 'Nombre de pages',       notionProp: 'Pages',        notionType: 'number',       defaultOn: true },
  { key: 'couverture',  id: 'cover-img',       label: 'Couverture',            notionProp: null,           notionType: null,           defaultOn: true, isCover: true },
  { key: 'categories',  id: 'f-genre',         label: 'Genre',                 notionProp: 'Genre',        notionType: 'multi_select', defaultOn: false },
  { key: 'description', id: 'f-resume',        label: 'Résumé',                notionProp: 'Résumé',       notionType: 'rich_text',    defaultOn: false },
  { key: 'language',    id: 'f-langue',        label: 'Langue',                notionProp: 'Langue',       notionType: 'rich_text',    defaultOn: false },
];

export function getActiveBibFields() {
  const enabled = getEnabledBibFields() ?? BIB_FIELDS.filter(f => f.defaultOn).map(f => f.key);
  return BIB_FIELDS.filter(f => enabled.includes(f.key));
}
