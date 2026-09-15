// Frequency word lists, curated code snippets, medical/legal/kids/quote corpora.
// All content is bundled — the tool ships offline and never fetches a corpus.

export type Language = 'english' | 'spanish' | 'french' | 'german' | 'italian' | 'portuguese' | 'dutch';
export type LayoutId = 'qwerty' | 'dvorak' | 'colemak' | 'workman' | 'azerty' | 'qwertz' | 'bapo';
export type CorpusMode =
  | 'words-200'
  | 'words-1000'
  | 'words-5000'
  | 'punctuation'
  | 'numbers'
  | 'code'
  | 'medical'
  | 'legal'
  | 'kids'
  | 'quote'
  | 'zen'
  | 'custom';

export interface CodeSnippet { language: string; label: string; text: string }
export interface Quote { text: string; source: string; length: 'short' | 'medium' | 'long' | 'thicc' }

// --------------------------------------------------------------------
// English frequency-curated word tiers (top-200 / top-1000 / top-5000).
// --------------------------------------------------------------------
const ENGLISH_TIER1 = 'the be to of and a in that have i it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take people into year your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because any these give day most us are was were is has had been am own such very where why many much more little thought right used mean same said tell asked told feel felt known left great small large next last few big long high place old point set part turn move need show try call ask kind case fact hand week home real world life word thing man woman child school state group face help sound often though never begin friend low far side while form under name still change music write until night walk under close air line word rest write food kids page eyes book stand fine ready city miss story hard fell rock cold soft ago sing round arrive dark below open water start voice country ever number white boys eyes fast rain green mind wait wind hair blue rest king pull cool dance easy game love learn heart sing wake';

const ENGLISH_TIER2_EXTRA = 'light paper letter problem question answer idea money power water river ocean mountain forest garden street city country history nature science future planet friend family voice memory picture window silver golden shadow morning evening winter summer spring autumn breakfast dinner journey teacher doctor student engineer artist musician traveler builder farmer scientist neighbor citizen leader driver dancer runner reader writer thinker maker helper healer guardian keeper master pilot sailor soldier officer worker parent partner client customer manager director founder inventor developer designer tester reviewer editor speaker listener follower explorer painter sculptor cyclist skater climber swimmer skier surfer kayaker glider hiker gardener beekeeper carpenter blacksmith goldsmith mechanic electrician plumber locksmith tailor cobbler baker brewer confectioner butcher grocer dairyman rancher shepherd fisherman whaler hunter tracker ranger warden marshal sheriff bailiff constable magistrate judge lawyer barrister solicitor counselor analyst consultant broker banker trader auditor accountant treasurer secretary receptionist archivist librarian curator historian anthropologist archaeologist geologist biologist chemist physicist astronomer cartographer surveyor architect draftsman modeler animator producer cinematographer engineer composer conductor arranger lyricist librettist singer guitarist pianist violinist drummer bassist cellist flautist trumpeter saxophonist ensemble orchestra quartet quintet symphony sonata concerto ballad rondo overture prelude finale movement bridge chorus refrain verse anthem lullaby carol chant hymn spiritual gospel folk blues jazz swing bebop soul funk reggae ska punk indie alternative electronic ambient techno house trance dubstep hiphop rap metal thrash death doom industrial goth glam grunge synthpop postrock mathrock chillwave concept concern concert conclude conclusion concrete condition conductor confer conference confidence confidential confirm confirmation conflict confront confused congestion connection consciousness consensus consequence conservation conservative consider considerable consideration consistency consistent constant constellation construct construction consultant contact contain container contamination contempt content contest contestant continuation continue continuous contract contractor contrast contribute contribution convention conversation convert convey conviction convince cooperate cooperation coordinate corridor cosmetic costume cottage counsel countless country countryside courage courageous courier courtesy courthouse cousin coverage crackle craftsman creative creativity credit creek crescent crimson critic criticize crossword crusader crystalline curator curiosity current curtain custody customer cushion cyclone';

const ENGLISH_TIER3_EXTRA = 'accept access accident accompany accomplish account accurate achievement acknowledge acquire activity actual addition additional address adequate adjust administration admission adult advance advantage adventure advertisement advice advise affair afford afraid after afternoon afterward again against agency agenda agent aggressive agree agreement agriculture ahead aircraft airline airport alarm album alcohol alien alive alliance allow ally almost alone along alongside already alternative although altogether always amateur amazing ambassador ambiguous ambition amend amount analysis analyst ancient anger angle angry animal anniversary announce annoy annual another anxiety anxious anybody anyone anything anyway anywhere apart apartment apologize apparent appeal appear appearance apple application apply appoint appointment appreciate approach appropriate approval approve approximate architect architecture archive area argue argument arise armed army arrange arrangement arrest arrival arrive article artificial artistic artwork ashamed aside asleep aspect aspire assemble assembly assert assess assessment asset assign assignment assist assistance assistant associate association assume assumption assure asterisk astronaut astronomy athlete athletic atmosphere attach attachment attack attempt attend attention attitude attract attraction attractive attribute auction audience audit auditor automatic autumn available average avoid award awake awareness awful awkward baby background backup backyard bacon badge badly baggage balance balcony ball ballet balloon banana bandage bank banner banquet baseball basement basic basin basket bathtub battery battlefield beach bearing beautiful beauty become bedroom beef beehive before beforehand beggar begin beginner behalf behave behavior behind beige believe belong beneath beneficial benefit beside besides between beyond bicycle bilateral binary biography biology biotech birthday biscuit blackboard blanket blend blessing blueprint blueberry blur board boarding boardroom bodyguard boiling bonus bookmark bookkeeper bookkeeping bookstore boredom borrow bottom boundary boutique boyfriend braille brainstorm brand brandish brave breach breakdown breakfast breathe breathing breeze bridge briefcase briefing brilliant broadband broadcast broaden brochure broker brotherhood browser bubble bucket buffer buffet builder building bulletin bullhorn bumper bureau burial burner burrow business butcher butter butterfly button buyer bypass byproduct cabin cabinet cable cactus cafeteria caffeine calamity calculate calculator calendar calibrate callback camera campaign campfire campground camping campus canal cancel cancer candidate candle candlestick candor canister cannery canvas canyon capacity capital captain caption capture caramel carbon cardboard cardigan career careful careless cargo carpenter carpentry carpet carriage carrier carry cartoon cascade cashier casual catalog category caterpillar cathedral catholic causeway cautious cavity ceiling celebrate celebration cellular censorship century ceramic ceremony certificate certification chairman chairperson chairwoman chalkboard challenge challenger chamber champion championship chandelier changeable channel chapter character characteristic charcoal charity charming chartered chauffeur checkbook checkout checkpoint chemical cherished chestnut childhood chimney chocolate choir cholesterol choose christmas chronic chuckle church cigarette cinema circle circuit circular circumstance citizen civilian civilization claim clamor clarity classic classical classify classroom clatter cleaner cleansing clearance clearing clever client climate clinic clipboard clockwise closest closet clothing clothesline cluster coalition coastal coastline cocktail coconut cocoon coefficient coherent collaborate colleague collection collector college colonial colony coloring column combination combustion comedy comfort comfortable commander commemorate commercial commissioner commitment committee commodity communicate community commute companion company compare comparison compartment compatible compensate compensation competent competition competitor complain complaint complement complete completion complex complexity compliance complicated compliment component composed composer composition compound comprehension compress computer';

function toWordArray(text: string): string[] {
  return text.split(/\s+/).map((w) => w.trim()).filter((w) => w.length > 0);
}

export const ENGLISH_TOP_200: string[] = Array.from(new Set(toWordArray(ENGLISH_TIER1))).slice(0, 200);
export const ENGLISH_TOP_1000: string[] = Array.from(new Set([...toWordArray(ENGLISH_TIER1), ...toWordArray(ENGLISH_TIER2_EXTRA)])).slice(0, 1000);
export const ENGLISH_TOP_5000: string[] = Array.from(new Set([
  ...toWordArray(ENGLISH_TIER1),
  ...toWordArray(ENGLISH_TIER2_EXTRA),
  ...toWordArray(ENGLISH_TIER3_EXTRA),
]));

// --------------------------------------------------------------------
// Other-language pools (curated common-word practice sets).
// --------------------------------------------------------------------
export const LANGUAGE_POOLS: Record<Language, string[]> = {
  english: ENGLISH_TOP_1000,
  spanish: toWordArray('de la que el en y a los se del las un por con no una su para es al lo como más pero sus le ya o este sí porque esta entre cuando muy sin sobre también me hasta hay donde quien desde todo nos durante todos uno les ni contra otros ese eso ante ellos e esto mí antes algunos qué unos yo otro otras otra él tanto esa estos mucho quienes nada muchos cual poco ella estar estas algunas algo nosotros mi mis tú te ti tu tus ellas nosotras vosotros vosotras os mío mía tuyo tuya suyo suya nuestro nuestra vuestro vuestra estoy estás está estamos estáis están fue fueron ser hacer decir tiempo día año casa vida mundo persona hombre mujer niño niña familia trabajo puerta camino cielo agua fuego tierra viento libro papel palabra idea pensamiento memoria historia música arte ciencia viaje ciudad campo montaña río mar bosque jardín escuela hospital iglesia mercado tienda calle avenida plaza puente estación aeropuerto amigo amiga hermano hermana padre madre hijo hija abuelo abuela primo prima tío tía sobrino sobrina esposo esposa novio novia'),
  french: toWordArray('de le la et à un être est en que il pour dans ce qui pas plus par sur je avec ne se on ou son au aux ces cet cette leur leurs mon ma mes ton ta tes notre nos votre vos suis es sommes êtes sont était étais étaient serai seras sera serons serez seront ai as avons avez ont avais avait avions aviez avaient aurai auras aura aurons aurez auront fais fait faisons faites font pouvais pouvait pouvions pouviez pouvaient devrai devras devra devrons devrez devront voulais voulait voulions vouliez voulaient allais allait allions alliez allaient parlais parlait parlions parliez parlaient maison porte fenêtre chemin rue ville village campagne montagne rivière mer forêt jardin école hôpital église magasin marché place pont gare aéroport ami amie frère soeur père mère fils fille grandpère grandmère cousin cousine oncle tante neveu nièce mari femme travail livre papier stylo idée pensée mémoire histoire musique art science voyage matin soir jour nuit semaine mois année vie temps monde personne enfant garçon fille'),
  german: toWordArray('der die und in den von zu das mit sich des auf für ist im dem nicht ein eine als auch es an werden aus er hat dass sie nach wird bei einer um am sind noch wie einem über einen so zum haben nur oder aber vor zur bis mehr durch man sein wurde sei seine seines seinem seinen ihrer ihres ihrem ihren unser unsere unseren unseres euer eure euren eures ihr ihre selbst jene jener jenes jenen dieser diese dieses diesen jeder jedes jedem jeden solche solcher solches solchen alle aller alles allem einige einiger einiges einigen manche mancher manches manchen wenige weniger weniges wenigen haus tür fenster weg strasse stadt dorf land berg fluss meer wald garten schule krankenhaus kirche markt geschäft platz brücke bahnhof flughafen freund freundin bruder schwester vater mutter sohn tochter grossvater grossmutter cousin cousine onkel tante ehemann ehefrau arbeit buch papier stift idee gedanke gedächtnis geschichte musik kunst wissenschaft reise morgen abend tag nacht woche monat jahr leben zeit welt person kind junge mädchen'),
  italian: toWordArray('di che è e la il un a per non in una con si le mi ma da su del al lo ci gli come sono più ha ho hai abbiamo avete hanno essere avere fare fatto detto andare andato venire venuto vedere visto sapere saputo dare dato stare stato dovere dovuto potere potuto volere voluto trovare trovato prendere preso mettere messo lasciare lasciato guardare guardato pensare pensato credere creduto sentire sentito parlare parlato passare passato tornare tornato entrare entrato uscire uscito arrivare arrivato partire partito ricevere ricevuto rispondere risposto cominciare cominciato finire finito continuare continuato aspettare aspettato aiutare aiutato incontrare incontrato ricordare ricordato dimenticare dimenticato casa porta finestra strada città paese montagna fiume mare bosco giardino scuola ospedale chiesa mercato negozio piazza ponte stazione aeroporto amico amica fratello sorella padre madre figlio figlia nonno nonna cugino cugina zio zia nipote marito moglie lavoro libro carta penna idea pensiero memoria storia musica arte scienza viaggio mattina sera giorno notte settimana mese anno vita tempo mondo persona bambino bambina ragazzo ragazza'),
  portuguese: toWordArray('de a o que e do da em um para é com não uma os no se na por mais as dos como mas foi ao ele das tem à seu sua ou ser quando muito há nos já está eu também só pelo pela até isso ela entre era depois sem mesmo aos ter seus quem nas me esse eles estão você tinha foram essa num nem suas meu às minha têm numa pelos elas havia seja qual será nós tenho lhe deles essas esses pelas este dele tu te vocês vos lhes casa porta janela caminho rua cidade vila campo montanha rio mar floresta jardim escola hospital igreja mercado loja praça ponte estação aeroporto amigo amiga irmão irmã pai mãe filho filha avô avó primo prima tio tia sobrinho sobrinha marido esposa trabalho livro papel caneta ideia pensamento memória história música arte ciência viagem manhã noite dia semana mês ano vida tempo mundo pessoa criança menino menina'),
  dutch: toWordArray('de van en het een dat is in op te zijn met voor niet aan er maar dan bij ook wel als naar had heeft hebben werd worden zou zouden ben bent was waren wij jullie zij hem haar hun hen deze dit die welke welk elk ieder alle sommige veel weinig meer minder meeste minste enkel enige beide over onder tussen naast achter tegen binnen buiten vanuit tijdens gedurende ondanks tenzij hoewel omdat doordat zodat waardoor waarmee waarin waarvoor waarom hoeveel hoezeer hoezo wanneer welkom huis deur raam weg straat stad dorp land berg rivier zee bos tuin school ziekenhuis kerk markt winkel plein brug station vliegveld vriend vriendin broer zus vader moeder zoon dochter grootvader grootmoeder neef nicht oom tante man vrouw werk boek papier pen idee gedachte geheugen geschiedenis muziek kunst wetenschap reis ochtend avond dag nacht week maand jaar leven tijd wereld persoon kind jongen meisje'),
};

// --------------------------------------------------------------------
// Keyboard layouts.
// --------------------------------------------------------------------
export interface LayoutRow { keys: string[] }
export interface LayoutDefinition {
  id: LayoutId;
  label: string;
  rows: LayoutRow[];
  fingers: Record<string, string>;
}

const QWERTY_FINGERS: Record<string, string> = {
  '`': 'l5', '1': 'l5', '2': 'l4', '3': 'l3', '4': 'l2', '5': 'l2',
  '6': 'r2', '7': 'r2', '8': 'r3', '9': 'r4', '0': 'r5', '-': 'r5', '=': 'r5',
  q: 'l5', w: 'l4', e: 'l3', r: 'l2', t: 'l2', y: 'r2', u: 'r2', i: 'r3', o: 'r4', p: 'r5',
  '[': 'r5', ']': 'r5', '\\': 'r5',
  a: 'l5', s: 'l4', d: 'l3', f: 'l2', g: 'l2', h: 'r2', j: 'r2', k: 'r3', l: 'r4',
  ';': 'r5', "'": 'r5',
  z: 'l5', x: 'l4', c: 'l3', v: 'l2', b: 'l2', n: 'r2', m: 'r2', ',': 'r3', '.': 'r4', '/': 'r5',
  ' ': 'thumb',
};

export const LAYOUTS: LayoutDefinition[] = [
  {
    id: 'qwerty', label: 'QWERTY',
    rows: [
      { keys: ['`','1','2','3','4','5','6','7','8','9','0','-','='] },
      { keys: ['q','w','e','r','t','y','u','i','o','p','[',']','\\'] },
      { keys: ['a','s','d','f','g','h','j','k','l',';',"'"] },
      { keys: ['z','x','c','v','b','n','m',',','.','/'] },
      { keys: [' '] },
    ],
    fingers: QWERTY_FINGERS,
  },
  {
    id: 'dvorak', label: 'Dvorak',
    rows: [
      { keys: ['`','1','2','3','4','5','6','7','8','9','0','[',']'] },
      { keys: ["'",',','.','p','y','f','g','c','r','l','/','=','\\'] },
      { keys: ['a','o','e','u','i','d','h','t','n','s','-'] },
      { keys: [';','q','j','k','x','b','m','w','v','z'] },
      { keys: [' '] },
    ],
    fingers: QWERTY_FINGERS,
  },
  {
    id: 'colemak', label: 'Colemak',
    rows: [
      { keys: ['`','1','2','3','4','5','6','7','8','9','0','-','='] },
      { keys: ['q','w','f','p','g','j','l','u','y',';','[',']','\\'] },
      { keys: ['a','r','s','t','d','h','n','e','i','o',"'"] },
      { keys: ['z','x','c','v','b','k','m',',','.','/'] },
      { keys: [' '] },
    ],
    fingers: QWERTY_FINGERS,
  },
  {
    id: 'workman', label: 'Workman',
    rows: [
      { keys: ['`','1','2','3','4','5','6','7','8','9','0','-','='] },
      { keys: ['q','d','r','w','b','j','f','u','p',';','[',']','\\'] },
      { keys: ['a','s','h','t','g','y','n','e','o','i',"'"] },
      { keys: ['z','x','m','c','v','k','l',',','.','/'] },
      { keys: [' '] },
    ],
    fingers: QWERTY_FINGERS,
  },
  {
    id: 'azerty', label: 'AZERTY',
    rows: [
      { keys: ['²','&','é','"',"'",'(','-','è','_','ç','à',')','='] },
      { keys: ['a','z','e','r','t','y','u','i','o','p','^','$'] },
      { keys: ['q','s','d','f','g','h','j','k','l','m','ù'] },
      { keys: ['w','x','c','v','b','n',',',';',':','!'] },
      { keys: [' '] },
    ],
    fingers: QWERTY_FINGERS,
  },
  {
    id: 'qwertz', label: 'QWERTZ',
    rows: [
      { keys: ['^','1','2','3','4','5','6','7','8','9','0','ß','´'] },
      { keys: ['q','w','e','r','t','z','u','i','o','p','ü','+'] },
      { keys: ['a','s','d','f','g','h','j','k','l','ö','ä'] },
      { keys: ['y','x','c','v','b','n','m',',','.','-'] },
      { keys: [' '] },
    ],
    fingers: QWERTY_FINGERS,
  },
  {
    id: 'bapo', label: 'BR-Nativo (BAPO)',
    rows: [
      { keys: ['`','1','2','3','4','5','6','7','8','9','0','-','='] },
      { keys: ['b','é','p','o','ê','v','d','l','j','z','[',']','\\'] },
      { keys: ['a','u','i','e','ç','t','s','r','n','m',"'"] },
      { keys: ['ú','à','ó','y','x','k','w','h','q','?'] },
      { keys: [' '] },
    ],
    fingers: QWERTY_FINGERS,
  },
];

export function findLayout(id: LayoutId): LayoutDefinition {
  const found = LAYOUTS.find((l) => l.id === id);
  if (!found) throw new Error(`Unknown layout: ${id}`);
  return found;
}

// --------------------------------------------------------------------
// Punctuation and number pools.
// --------------------------------------------------------------------
export const PUNCTUATION_SEEDS = [
  'Hello, world! How are you today?',
  'The quick brown fox jumps over the lazy dog.',
  'Well, it depends: sometimes yes, sometimes no.',
  '"Where," she asked, "did you find that book?"',
  'Please review the following items: apples, oranges, and pears.',
  'It was the best of times; it was the worst of times.',
  'She said, "I can\'t believe it!" and then walked away.',
  'The results (as expected) confirmed the hypothesis.',
  'Meet me at 10:15 a.m. sharp — do not be late!',
  'One small step for man, one giant leap for mankind.',
];

export const NUMBER_SEEDS = [
  '3.14159 2.71828 1.41421 1.73205 2.23606',
  '2024 2025 2026 2027 2028 2029 2030',
  '100 200 300 400 500 600 700 800 900',
  '$1,234.56 $9,876.54 $12,345.67 $98,765.43',
  '3+4=7 12-5=7 6*8=48 81/9=9 2^10=1024',
  '(415) 555-0142 (212) 555-0193 (312) 555-0184',
  '2026-09-15 08:30:00 UTC-5 14:45:00',
  '#42 #128 #256 #512 #1024 #2048 #4096',
];

// --------------------------------------------------------------------
// Code snippets for programmer mode.
// --------------------------------------------------------------------
export const CODE_SNIPPETS: CodeSnippet[] = [
  {
    language: 'javascript', label: 'Array reduce (JS)',
    text: 'const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);\nconsole.log(`total: ${total.toFixed(2)}`);',
  },
  {
    language: 'javascript', label: 'Debounce (JS)',
    text: 'function debounce(fn, wait) {\n  let t;\n  return (...args) => {\n    clearTimeout(t);\n    t = setTimeout(() => fn(...args), wait);\n  };\n}',
  },
  {
    language: 'typescript', label: 'Discriminated union (TS)',
    text: 'type Shape =\n  | { kind: "circle"; radius: number }\n  | { kind: "square"; size: number };\n\nfunction area(s: Shape): number {\n  switch (s.kind) {\n    case "circle": return Math.PI * s.radius ** 2;\n    case "square": return s.size * s.size;\n  }\n}',
  },
  {
    language: 'python', label: 'List comprehension (Py)',
    text: 'squares = [x * x for x in range(1, 11) if x % 2 == 0]\nprint(squares)',
  },
  {
    language: 'python', label: 'Class + dataclass (Py)',
    text: 'from dataclasses import dataclass\n\n@dataclass\nclass Point:\n    x: float\n    y: float\n    def distance_to(self, other: "Point") -> float:\n        return ((self.x - other.x) ** 2 + (self.y - other.y) ** 2) ** 0.5',
  },
  {
    language: 'cpp', label: 'Templated max (C++)',
    text: 'template <typename T>\nT max(const T& a, const T& b) {\n    return (a > b) ? a : b;\n}',
  },
  {
    language: 'rust', label: 'Ownership + trait (Rust)',
    text: 'trait Greeter {\n    fn greet(&self) -> String;\n}\n\nstruct Person { name: String }\n\nimpl Greeter for Person {\n    fn greet(&self) -> String {\n        format!("Hello, {}!", self.name)\n    }\n}',
  },
  {
    language: 'sql', label: 'Aggregation with join (SQL)',
    text: 'SELECT c.name, COUNT(o.id) AS orders, SUM(o.total) AS revenue\nFROM customers c\nJOIN orders o ON o.customer_id = c.id\nWHERE o.created_at >= DATE_TRUNC(\'month\', CURRENT_DATE)\nGROUP BY c.name\nORDER BY revenue DESC\nLIMIT 25;',
  },
  {
    language: 'html', label: 'Semantic page (HTML)',
    text: '<article class="post">\n  <header>\n    <h1>Local Tools</h1>\n    <time datetime="2026-09-15">September 15, 2026</time>\n  </header>\n  <p>Everything runs in the browser.</p>\n</article>',
  },
  {
    language: 'css', label: 'Grid layout (CSS)',
    text: '.grid {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));\n  gap: 1rem;\n  padding: 1.5rem;\n}',
  },
];

// --------------------------------------------------------------------
// Medical transcription (curated terminology sentences).
// --------------------------------------------------------------------
export const MEDICAL_SENTENCES = [
  'The patient reports intermittent epigastric discomfort, radiating to the left shoulder, unrelieved by antacids.',
  'Auscultation revealed bilateral crepitations at the lung bases; SpO2 was 92% on room air.',
  'Impression: acute exacerbation of chronic obstructive pulmonary disease with suspected community-acquired pneumonia.',
  'CBC showed hemoglobin 11.2 g/dL, WBC 14,300/mm3 with left shift, and platelets 245,000/mm3.',
  'Ordered ceftriaxone 1 g IV q24h, azithromycin 500 mg PO daily, and nebulized ipratropium/albuterol q6h.',
  'PMH: hypertension, hyperlipidemia, type 2 diabetes mellitus, and rheumatoid arthritis in remission.',
  'The abdominal ultrasound demonstrated cholelithiasis without evidence of cholecystitis or biliary ductal dilation.',
  'Neurological examination was nonfocal; cranial nerves II through XII grossly intact; strength 5/5 throughout.',
  'Follow up in the anticoagulation clinic in two weeks for INR check; target INR 2.0 to 3.0 on warfarin 5 mg daily.',
  'Discharge diagnoses include NSTEMI, paroxysmal atrial fibrillation, and stage 3a chronic kidney disease.',
];

// --------------------------------------------------------------------
// Legal transcription (citations, latin maxims, contract prose).
// --------------------------------------------------------------------
export const LEGAL_SENTENCES = [
  'Pursuant to Fed. R. Civ. P. 12(b)(6), the defendant moves to dismiss the complaint for failure to state a claim.',
  'The court held in Marbury v. Madison, 5 U.S. (1 Cranch) 137 (1803), that it is the duty of the judiciary to say what the law is.',
  'Res ipsa loquitur applies when the instrumentality was under the exclusive control of the defendant.',
  'The parties agree that any dispute arising under this Agreement shall be resolved by binding arbitration in accordance with the AAA Commercial Rules.',
  'Neither party shall be liable for any indirect, incidental, consequential, or punitive damages arising out of this Agreement.',
  'Stare decisis compels adherence to prior decisions absent extraordinary justification for departure.',
  'The mens rea element required by the statute is knowing conduct; strict liability is expressly rejected in the legislative history.',
  'Consideration exists where each party incurs a legal detriment bargained for in exchange for the other\'s promise.',
  'The trial court did not abuse its discretion by admitting the disputed exhibits under Fed. R. Evid. 803(6).',
  'This indenture, dated as of the fifteenth day of September, 2026, is by and between the Grantor and the Trustee.',
];

// --------------------------------------------------------------------
// Kids mode: short cheerful sentences with common phonemes.
// --------------------------------------------------------------------
export const KIDS_SENTENCES = [
  'The red fox ran fast in the sun.',
  'A big dog and a small cat went to the park.',
  'I like to eat apples and read fun books.',
  'The stars in the sky are very bright at night.',
  'My mom bakes the best cookies on a sunny day.',
  'A tiny bee flew from a rose to a tulip.',
  'We can jump and run and skip and play all day.',
  'The frog by the pond likes to sing a song.',
  'Every kid can learn to type with a little practice.',
  'Ready, set, go! We are off to the races again.',
];

// --------------------------------------------------------------------
// Quotes (public-domain sourced, short/medium/long/thicc).
// --------------------------------------------------------------------
export const QUOTES: Quote[] = [
  { text: 'To be, or not to be: that is the question.', source: 'William Shakespeare — Hamlet', length: 'short' },
  { text: 'The only thing we have to fear is fear itself.', source: 'Franklin D. Roosevelt — First Inaugural Address', length: 'short' },
  { text: 'It was the best of times, it was the worst of times.', source: 'Charles Dickens — A Tale of Two Cities', length: 'short' },
  { text: 'Ask not what your country can do for you; ask what you can do for your country.', source: 'John F. Kennedy — Inaugural Address', length: 'short' },
  { text: 'Happy families are all alike; every unhappy family is unhappy in its own way. All was confusion in the Oblonskys\' house. The wife had discovered that the husband was carrying on an intrigue with a French girl.', source: 'Leo Tolstoy — Anna Karenina', length: 'medium' },
  { text: 'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife. However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered the rightful property of some one or other of their daughters.', source: 'Jane Austen — Pride and Prejudice', length: 'long' },
  { text: 'We hold these truths to be self-evident, that all men are created equal, that they are endowed by their Creator with certain unalienable Rights, that among these are Life, Liberty and the pursuit of Happiness. That to secure these rights, Governments are instituted among Men, deriving their just powers from the consent of the governed. That whenever any Form of Government becomes destructive of these ends, it is the Right of the People to alter or to abolish it, and to institute new Government, laying its foundation on such principles and organizing its powers in such form, as to them shall seem most likely to effect their Safety and Happiness.', source: 'United States Declaration of Independence (1776)', length: 'thicc' },
  { text: 'Call me Ishmael. Some years ago — never mind how long precisely — having little or no money in my purse, and nothing particular to interest me on shore, I thought I would sail about a little and see the watery part of the world. It is a way I have of driving off the spleen and regulating the circulation.', source: 'Herman Melville — Moby-Dick', length: 'long' },
  { text: 'Two roads diverged in a yellow wood, And sorry I could not travel both And be one traveler, long I stood And looked down one as far as I could To where it bent in the undergrowth.', source: 'Robert Frost — The Road Not Taken', length: 'medium' },
  { text: 'When in the Course of human events, it becomes necessary for one people to dissolve the political bands which have connected them with another, and to assume among the powers of the earth, the separate and equal station to which the Laws of Nature and of Nature\'s God entitle them, a decent respect to the opinions of mankind requires that they should declare the causes which impel them to the separation.', source: 'Declaration of Independence — Preamble', length: 'long' },
];

export function quotesByLength(length: Quote['length']): Quote[] {
  return QUOTES.filter((q) => q.length === length);
}

export function poolForMode(mode: CorpusMode, language: Language): string[] {
  if (mode === 'words-200') return language === 'english' ? ENGLISH_TOP_200 : LANGUAGE_POOLS[language].slice(0, 200);
  if (mode === 'words-1000') return language === 'english' ? ENGLISH_TOP_1000 : LANGUAGE_POOLS[language];
  if (mode === 'words-5000') return language === 'english' ? ENGLISH_TOP_5000 : LANGUAGE_POOLS[language];
  return LANGUAGE_POOLS[language];
}
