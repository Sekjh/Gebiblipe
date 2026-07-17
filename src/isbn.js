export function validateIsbn(isbn) {
  if (isbn.length === 13) {
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += parseInt(isbn[i]) * (i % 2 === 0 ? 1 : 3);
    return (10 - (sum % 10)) % 10 === parseInt(isbn[12]);
  }
  if (isbn.length === 10) {
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(isbn[i]) * (10 - i);
    const check = isbn[9].toUpperCase() === 'X' ? 10 : parseInt(isbn[9]);
    return (sum + check) % 11 === 0;
  }
  return false;
}

export function isbn13to10(isbn13) {
  if (!isbn13.startsWith('978') || isbn13.length !== 13) return null;
  const core = isbn13.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (10 - i) * parseInt(core[i]);
  const check = (11 - (sum % 11)) % 11;
  return core + (check === 10 ? 'X' : check);
}

export function isbn10to13(isbn10) {
  if (isbn10.length !== 10) return null;
  const core = '978' + isbn10.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(core[i]) * (i % 2 === 0 ? 1 : 3);
  const check = (10 - (sum % 10)) % 10;
  return core + check;
}

// Variantes ISBN-10/13 d'un même livre à tester auprès d'une source bibliographique — les
// catalogues n'indexent pas tous systématiquement les deux formats (notamment pour les livres
// anciens, publiés avant l'introduction de l'ISBN-13 en 2007), d'où l'intérêt d'essayer les deux.
export function isbnVariants(raw) {
  const variants = [raw];
  const alt = raw.length === 13 ? isbn13to10(raw) : raw.length === 10 ? isbn10to13(raw) : null;
  if (alt) variants.push(alt);
  return variants;
}
