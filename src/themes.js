import { getActiveBibFields, PIVOT_FIELDS } from './champs.js';

export const THEMES = {
  "Philosophie": ["Esthétique","Éthique","Épistémologie","Métaphysique","Philosophie politique","Philosophie du langage","Logique","Philosophie des sciences","Histoire de la philosophie","Phénoménologie","Philosophie morale","Philosophie orientale"],
  "Littérature": ["Roman","Nouvelle","Poésie","Théâtre","Essai littéraire","Autobiographie","Correspondance","Conte","Aphorisme"],
  "Histoire": ["Histoire ancienne","Histoire médiévale","Histoire moderne","Histoire contemporaine","Histoire de France","Biographie","Mémoires","Histoire des idées","Histoire de l'art"],
  "Sciences humaines & sociales": ["Sociologie","Anthropologie","Linguistique","Sémiologie","Géographie humaine","Ethnologie"],
  "Sciences & techniques": ["Mathématiques","Physique","Biologie","Informatique","Sciences cognitives","Médecine"],
  "Arts": ["Musique","Peinture","Sculpture","Architecture","Cinéma","Photographie","Design"],
  "Religion & spiritualité": ["Christianisme","Islam","Bouddhisme","Judaïsme","Mystique","Théologie","Mythologie"],
  "Droit & politique": ["Droit constitutionnel","Droit international","Science politique","Géopolitique","Théorie politique"],
  "Économie": ["Économie politique","Histoire économique","Économie comportementale","Finance"],
  "Psychologie": ["Psychanalyse","Psychologie sociale","Psychologie cognitive","Neuropsychologie"],
  "Presse & périodiques": ["Quotidien généraliste","Presse internationale","Hebdomadaire d'actualité","Revue littéraire","Revue scientifique","Magazine culturel","Presse économique","Presse spécialisée"],
  "Autre": ["—"]
};

// Propriétés Notion toujours présentes, indépendamment des champs bibliographiques configurables.
const CORE_EXPECTED_PROPS = {
  'Auteur':                'rich_text',
  'ISBN':                  'rich_text',
  'Date de lecture':       'rich_text',
  'Fiche de lecture':      'rich_text',
  'Commentaire':           'rich_text',
  'Thème':                 'select',
  'Sous-thème':            'select',
  'Statut':                'select',
  'Priorité':              'select',
  'Note':                  'select',
  'État':                  'select',
  'Collection (livre)':    'checkbox',
  'Citations':             'rich_text',
  'Version GEBIBLIPE':     'rich_text',
  'Saisie manuelle':       'checkbox',
};

// Fusionne les propriétés toujours présentes avec celles des champs bibliographiques
// actuellement activés (voir src/champs.js) — reflète l'état courant de la configuration.
// Les identifiants pivots (PIVOT_FIELDS) sont toujours inclus : non configurables, ils sont
// envoyés à Notion dès qu'ils sont disponibles (voir buildProps() dans notion.js).
export function getExpectedProps() {
  const props = { ...CORE_EXPECTED_PROPS };
  for (const f of getActiveBibFields()) {
    if (f.notionProp) props[f.notionProp] = f.notionType;
  }
  for (const f of PIVOT_FIELDS) props[f.notionProp] = f.notionType;
  return props;
}

export function propSchema(type) {
  if (type === 'rich_text')    return { rich_text: {} };
  if (type === 'number')       return { number: { format: 'number' } };
  if (type === 'select')       return { select: {} };
  if (type === 'checkbox')     return { checkbox: {} };
  if (type === 'multi_select') return { multi_select: {} };
  return { rich_text: {} };
}
