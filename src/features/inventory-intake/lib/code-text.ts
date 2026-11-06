// The API sends some survey values as codes (AIR_CONDITIONER, ON_SITE) and names terms by their field (monthlyRent). The
// intake reads them as words rather than keep a second list of the survey's values. A list can mix codes with free text,
// so free text stays as written unless it has the exact shape of a code: a one-word name in lower case reads capitalised.

const ENUM = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;
const FIELD = /^[a-z]+(?:[A-Z][a-z0-9]*)*$/;
/** `spaceFees:<name>`: the name is free text; "gas: yes" is not one of these. */
const NAMED = /^[a-z][A-Za-z]*:(\S.*)$/;
/** `<space code>.<term>`, the term a name or a named fee: "12.5 triệu" is a number, not a space. */
const OF_SPACE = /^(.+)\.([a-z][A-Za-z0-9]*(?::.+)?)$/;

/** TV, AC: a name in capitals this short is an owner's word, not a code. */
const SHORT_NAME = 2;

const sentence = (words: string): string => words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();

export function codeText(value: string): string {
  const ofSpace = OF_SPACE.exec(value);
  if (ofSpace !== null) return `${ofSpace[1]} · ${codeText(ofSpace[2])}`;
  const named = NAMED.exec(value);
  if (named !== null) return named[1];
  if (ENUM.test(value) && (value.length > SHORT_NAME || value.includes("_"))) return sentence(value.replaceAll("_", " "));
  if (FIELD.test(value)) return sentence(value.replace(/([A-Z])/g, " $1"));
  return value;
}
