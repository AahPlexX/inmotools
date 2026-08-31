import type { AcademyLesson, AcademyTrack } from './regex-types';

const lesson = (id: string, title: string, objective: string, guide: string, starter: string, flags: string, cases: AcademyLesson['cases'], hint: string): AcademyLesson => ({ id, title, objective, guide, starter, flags, hint, cases });
const yes = (value: string): AcademyLesson['cases'][number] => ({ value, shouldMatch: true });
const no = (value: string): AcademyLesson['cases'][number] => ({ value, shouldMatch: false });

export const ACADEMY_TRACKS: AcademyTrack[] = [
  { id: 'fundamentals', title: 'Fundamentals', lessons: [
    lesson('literal-text','Literal Text','Match the exact word cat.','Ordinary characters match themselves.','cat','',["cat","bobcat"].map(yes).concat([no('dog')]),'Start with the text you want to find.'),
    lesson('digit-class','Digit Class','Match a three-digit code.','\\d matches a decimal digit; braces repeat a token a fixed number of times.','^\\d{3}$','',[yes('204'),yes('999'),no('20a'),no('1200')],'Anchor both ends when the whole string must conform.'),
    lesson('word-class','Word Characters','Match simple identifiers.','\\w covers ASCII word characters in JavaScript.','^\\w+$','',[yes('alpha_2'),no('two words')],'Whitespace is not a word character.'),
    lesson('character-range','Character Ranges','Accept lowercase hex digits only.','A character class chooses one character from the set.','^[0-9a-f]+$','',[yes('0af9'),no('0AG9')],'Put ranges inside square brackets.'),
    lesson('basic-quantifiers','Basic Quantifiers','Match one or more lowercase letters.','+ means one or more repetitions of the previous atom.','^[a-z]+$','',[yes('regex'),no(''),no('Regex')],'The quantifier applies only to the atom immediately before it.'),
    lesson('anchors','Anchors','Match exactly yes or no.','^ and $ constrain the start and end of the input.','^(yes|no)$','i',[yes('yes'),yes('NO'),no('maybe')],'Use alternation inside a group.'),
  ]},
  { id: 'intermediate', title: 'Intermediate', lessons: [
    lesson('capture-groups','Capture Groups','Capture an area code and local number.','Parentheses both group tokens and capture matched text.','^(\\d{3})-(\\d{4})$','',[yes('401-5555'),no('4015555')],'Keep separators outside captures when you do not need them.'),
    lesson('named-groups','Named Groups','Name year and month captures.','Named captures make downstream extraction readable.','^(?<year>\\d{4})-(?<month>\\d{2})$','',[yes('2026-08'),no('26-08')],'Use (?<name>...) in ECMAScript.'),
    lesson('non-capturing','Non-Capturing Groups','Group alternatives without adding a capture.','(?:...) groups syntax without storing a numbered capture.','^(?:cat|dog)s?$','i',[yes('cats'),yes('DOG'),no('bird')],'Use non-capturing groups for structure-only branches.'),
    lesson('lazy-quantifier','Lazy Quantifiers','Capture the shortest angle-bracketed segment.','A ? after a quantifier makes it reluctant.','<.+?>','g',[yes('<one> <two>'),no('plain')],'Compare .+ with .+? on repeated delimiters.'),
    lesson('word-boundary','Word Boundaries','Find cat as a complete word.','\\b asserts a transition between word and non-word characters.','\\bcat\\b','gi',[yes('a cat naps'),no('concatenate')],'A boundary consumes no characters.'),
    lesson('negative-lookahead','Negative Lookahead','Match user handles that do not begin with admin.','(?!...) asserts that the next characters must not match its inner pattern.','^(?!admin)[a-z0-9_]{5,12}$','i',[no('administrator'),no('admin_root'),yes('sarah_connor'),yes('johndoe123')],'Put the assertion immediately after the start anchor.'),
  ]},
  { id: 'advanced', title: 'Advanced', lessons: [
    lesson('positive-lookahead','Positive Lookahead','Require at least one digit without consuming it.','(?=...) checks ahead while leaving the cursor in place.','^(?=.*\\d)[a-z0-9]+$','i',[yes('user7'),no('username')],'Use a lookahead for a requirement independent of the main consuming pattern.'),
    lesson('negative-lookbehind','Negative Lookbehind','Match USD amounts not preceded by a minus sign.','(?<!...) asserts what must not appear immediately before the current position.','(?<!-)\\$\\d+','g',[yes('$25'),no('-$25')],'Lookbehind support varies by target flavor.'),
    lesson('backreference','Backreferences','Detect a duplicated adjacent word.','A backreference requires later text to repeat a captured value.','\\b(\\w+)\\s+\\1\\b','gi',[yes('go go'),no('go now')],'Backreferences are unsupported by linear RE2/Rust-style engines.'),
    lesson('alternation-precedence','Alternation Precedence','Match either a full .jpg or .png filename.','Alternation has low precedence, so group complete alternatives carefully.','^[\\w-]+\\.(?:jpg|png)$','i',[yes('photo.jpg'),yes('icon.PNG'),no('photo.jpg.exe')],'Anchor the entire filename.'),
    lesson('unicode-property','Unicode Properties','Match a run of Unicode letters.','Unicode property escapes classify characters by Unicode properties when u mode is enabled.','^\\p{L}+$','u',[yes('Crème'),yes('東京'),no('abc123')],'Use the u flag with property escapes.'),
    lesson('tempered-token','Tempered Token','Match content until END without crossing it.','A negative lookahead can guard each consumed position.','^(?:(?!END).)+','s',[yes('alpha beta END'),no('END first')],'This technique is expressive but can be expensive; profile it.'),
  ]},
  { id: 'production', title: 'Production Scenarios', lessons: [
    lesson('semantic-version','Semantic Version','Match a practical major.minor.patch version.','Production regexes should define what they accept rather than imply an entire external specification.','^\\d+\\.\\d+\\.\\d+$','',[yes('2.14.3'),no('v2.14'),no('2.14.3-beta')],'Add prerelease syntax only if your product needs it.'),
    lesson('iso-date','ISO Date Shape','Match a YYYY-MM-DD shaped date.','Regex validates shape; calendar validity belongs to date logic.','^\\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01])$','',[yes('2026-08-31'),no('2026-13-01')],'Do not claim calendar validation from pattern shape alone.'),
    lesson('log-level','Log Level','Extract a timestamp and log level.','Named groups turn semi-structured log text into explicit fields.','^(?<time>\\d{2}:\\d{2}:\\d{2})\\s+(?<level>INFO|WARN|ERROR)\\s+','m',[yes('14:05:01 ERROR failed'),no('ERROR only')],'Anchor to each line with m mode.'),
    lesson('url-scheme','URL Scheme','Accept only http or https scheme prefixes.','Keep URL regexes scoped to the part you actually need.','^https?:\\/\\/','i',[yes('https://inmotools.dev'),yes('http://localhost'),no('ftp://host')],'Use URL parsing APIs for full URL validation.'),
    lesson('email-shape','Email-Shaped Input','Match a deliberately pragmatic email shape.','This lesson teaches product-scoped validation, not complete RFC mail grammar.','^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$','i',[yes('team@example.com'),no('missing-at.example.com')],'Complex address standards should not be reduced to a misleading one-liner.'),
    lesson('api-key-redaction','API Key Redaction','Find a prefixed token for replacement.','Capture only the stable prefix and match the secret body separately.','\\b(api[_-]?key[=:]\\s*)[A-Za-z0-9_-]{8,}\\b','gi',[yes('api_key=abcDEF12345'),no('api_key=short')],'Test false positives before applying redaction to incident data.'),
  ]},
];

export const validateAcademySolution = (lessonInput: AcademyLesson, pattern: string, flags: string) => {
  try {
    const expression = new RegExp(pattern, flags.replace(/g/g, ''));
    const cases = lessonInput.cases.map((item) => { expression.lastIndex = 0; const matched = expression.test(item.value); return { ...item, matched, passed: matched === item.shouldMatch }; });
    return { complete: cases.every((item) => item.passed), cases, error: null as string | null };
  } catch (error) {
    return { complete: false, cases: lessonInput.cases.map((item) => ({ ...item, matched: false, passed: false })), error: error instanceof Error ? error.message : String(error) };
  }
};
