// Plainpen lexicon, knowledge as data. Add rows here; no engine changes needed.
// Everything is plain JS, no network, no model.

const S = (s) => new Set(s.split(' '));

/* ------------------------------------------------------------ regional English */
// Variant families are *generated* from a few stems + suffix tables and then
// kept only when BOTH spellings exist in the dictionary. That is the trick:
// small tables, large coverage, no garbage pairs.

const OUR_STEMS = 'color honor favor neighbor humor labor flavor behavior harbor rumor savior vapor odor armor clamor endeavor parlor tumor valor vigor glamor splendor rigor ardor fervor demeanor candor'.split(' ');
const OUR_SUFFIX = ['', 's', 'ed', 'ing', 'ful', 'less', 'able', 'ably', 'ite', 'ites', 'ist', 'ists', 'y', 'ier', 'iest', 'al', 'ally', 'ed'];
const RE_STEMS = 'center theater fiber liter caliber meager saber somber specter luster'.split(' ');
const RE_SUFFIX = ['', 's', 'd', 'ing'];
const DOUBLE_L = 'travel cancel label model fuel level marvel signal total tunnel channel counsel quarrel dial pencil shovel swivel duel equal rival libel panel kennel medal'.split(' ');
const PAIRS = `defense defence|defenses defences|offense offence|offenses offences|pretense pretence|catalog catalogue|catalogs catalogues|cataloged catalogued|cataloging cataloguing|gray grey|grayer greyer|grays greys|jewelry jewellery|aluminum aluminium|pajamas pyjamas|plow plough|plows ploughs|plowed ploughed|mold mould|molds moulds|molded moulded|molding moulding|skeptic sceptic|skeptics sceptics|skeptical sceptical|skepticism scepticism|sulfur sulphur|cozy cosy|ax axe|mom mum|moms mums|esthetic aesthetic|esthetics aesthetics|anemia anaemia|anemic anaemic|pediatric paediatric|pediatrician paediatrician|fetus foetus|maneuver manoeuvre|maneuvers manoeuvres|maneuvered manoeuvred|diarrhea diarrhoea|edema oedema|estrogen oestrogen|orthopedic orthopaedic|leukemia leukaemia|hemoglobin haemoglobin|hemorrhage haemorrhage|artifact artefact|artifacts artefacts|donut doughnut|donuts doughnuts|mustache moustache|smolder smoulder|enrollment enrolment|fulfillment fulfilment|installment instalment|skillful skilful|willful wilful|fulfill fulfil|fulfills fulfils|enroll enrol|enrolls enrols|aging ageing|tidbit titbit`.split('|').map((p) => p.split(' ')).filter(([a, b]) => !(a === 'cheque'));

/** Build {us2uk, uk2us, ize} maps restricted to words present in `dict`. */
export function buildRegionMaps(dict) {
  const us2uk = new Map(), uk2us = new Map(), oxford = new Set();
  const link = (us, uk, ox) => {
    if (us === uk || !dict.has(us) || !dict.has(uk)) return;
    us2uk.set(us, uk); uk2us.set(uk, us);
    if (ox) oxford.add(us), oxford.add(uk);
  };
  for (const s of OUR_STEMS) for (const x of OUR_SUFFIX) link(s + x, s.replace(/or$/, 'our') + x);
  for (const s of RE_STEMS) for (const x of RE_SUFFIX) link(s + x, s.replace(/er$/, 're') + x);
  for (const s of DOUBLE_L) for (const [a, b] of [['ed', 'led'], ['ing', 'ling'], ['er', 'ler'], ['ers', 'lers']]) link(s + a, s + 'l' + b.slice(1) === s + 'l' + b.slice(1) ? s + b : s + b);
  for (const [us, uk] of PAIRS) link(us, uk);
  // -ize/-ise and -yze/-yse families (Oxford spelling makes -ize legitimate in UK/IN)
  const SKIP = S('prise prised prises prising');
  for (const w of dict) {
    let m;
    if ((m = /^(.{3,}?)iz(e|es|ed|ing|er|ers|ation|ations|able)$/.exec(w))) {
      const uk = m[1] + 'is' + m[2];
      if (!SKIP.has(uk)) link(w, uk, true);
    } else if ((m = /^(.{3,}?)yz(e|es|ed|ing|er|ers|able)$/.exec(w))) {
      link(w, m[1] + 'ys' + m[2]);
    }
  }
  return { us2uk, uk2us, oxford };
}

/* ------------------------------------------------------------- Indian English */
export const INDIAN_ACCEPT = S('lakh lakhs crore crores rupee rupees paise prepone preponed preponing updation cantonment dharna gherao panchayat sarkar tehsil taluka zilla chai masala dal roti naan paneer ghee lassi diwali holi dussehra pooja puja mandir gurdwara sari saree kurta dupatta salwar lehenga churidar bindi mehndi sangeet shaadi darshan yoga guru ashram karma mantra swami namaste jugaad kirana dhaba tiffin');
export const IN_IDIOMS = [
  ['do the needful', 'take the necessary action'], ['kindly revert', 'please reply'], ['revert back', 'reply'], ['revert to me', 'reply to me'],
  ['out of station', 'out of town'], ['cousin brother', 'cousin'], ['cousin sister', 'cousin'], ['passed out of', 'graduated from'],
  ['prepone', 'move earlier'], ['preponed', 'moved earlier'], ['timepass', 'pastime'], ['good name', 'name'], ['please do the needful', 'please take the necessary action'],
];

/* --------------------------------------------------- encyclopedia: proper nouns */
// Words that are (almost) always capitalised. Ambiguous words (china, turkey,
// march, may, august, polish, jordan, chile, nice, reading) are deliberately absent.
export const PROPER = S([
  'january february april june july september october november december',
  'monday tuesday wednesday thursday friday saturday sunday',
  'english hindi bengali tamil telugu marathi gujarati punjabi urdu kannada malayalam sanskrit french spanish german italian portuguese russian chinese japanese korean arabic dutch swedish greek turkish hebrew persian swahili',
  'indian american british european african asian australian canadian chinese japanese korean german french spanish italian russian brazilian mexican egyptian pakistani bangladeshi nepali',
  'india usa america canada mexico brazil argentina peru colombia venezuela england scotland wales ireland france germany spain italy portugal netherlands belgium switzerland austria sweden norway denmark finland poland ukraine russia greece egypt nigeria kenya ethiopia ghana morocco algeria pakistan bangladesh nepal bhutan srilanka afghanistan iran iraq israel saudi qatar kuwait oman yemen jordan japan korea vietnam thailand malaysia indonesia singapore philippines australia zealand europe asia africa antarctica',
  'london paris berlin rome madrid moscow beijing tokyo seoul bangkok singapore sydney melbourne toronto vancouver chicago boston seattle houston dallas atlanta miami',
  'delhi mumbai kolkata chennai bangalore bengaluru hyderabad pune ahmedabad jaipur lucknow kanpur nagpur indore bhopal patna surat chandigarh kochi guwahati noida gurgaon gurugram',
  'maharashtra gujarat rajasthan punjab haryana kerala karnataka tamilnadu telangana bengal bihar odisha assam uttarakhand himachal',
  'google microsoft amazon apple facebook instagram whatsapp youtube linkedin twitter netflix tesla openai github',
  'internet christmas easter ramadan diwali holi eid hanuman',
].join(' ').replace(/\s+/g, ' ').trim().split(' ').filter((w) => !['english'].includes(w) || true).join(' '));
// "english" is always capitalised; "internet" is lowercase in modern style, so remove it:
['internet','apple','amazon','tesla','netflix'].forEach((w) => PROPER.delete(w));

/* ---------------------------------------------------- extra grammar families */
// Compact builder: R(id, precision, 'tok|alt tok2', [spanFrom, spanTo], fix, message)
// fix: string | 'KEEP:n' (replace span with matched token n) | {map} keyed by matched token 1 low
const R = (id, p, m, span, fix, msg, type = 'grammar') => ({ id, p, type, m: m.split(' '), span, fix, msg });

const IRR_PAST = { went: 'go', saw: 'see', came: 'come', took: 'take', gave: 'give', ate: 'eat', ran: 'run', wrote: 'write', began: 'begin', knew: 'know', did: 'do', drank: 'drink', flew: 'fly', spoke: 'speak', broke: 'break', chose: 'choose' };
const IRR_PP = { went: 'gone', saw: 'seen', came: 'come', took: 'taken', gave: 'given', ate: 'eaten', ran: 'run', wrote: 'written', began: 'begun', knew: 'known', did: 'done', drank: 'drunk', flew: 'flown', spoke: 'spoken', broke: 'broken', chose: 'chosen' };
const PAST_KEYS = Object.keys(IRR_PAST).join('|');

export const EXTRA_PATTERNS = [
  // irregular verbs: "did went" -> "did go", "have took" -> "have taken"
  R('IRR_AFTER_DO', .9, `did|didn't|does|doesn't|do|don't|can|could|will|would|should|must|might ${PAST_KEYS}`, [1, 1], (m) => IRR_PAST[m[1].low], 'After this verb, use the base form.'),
  R('IRR_AFTER_HAVE', .93, `have|has|had|having|haven't|hasn't|hadn't ${PAST_KEYS}`, [1, 1], (m) => IRR_PP[m[1].low], 'Use the past participle after "have".'),
  R('IRR_AFTER_BE', .88, `is|are|was|were|been|be ${PAST_KEYS.replace(/\|did/, '')}`, [1, 1], (m) => IRR_PP[m[1].low], 'Passive and perfect forms need the past participle.'),
  // double comparatives
  R('DOUBLE_COMPARATIVE', .9, 'more|most better|best|worse|worst|easier|easiest|bigger|biggest|faster|fastest|smaller|smallest|larger|largest', [0, 1], (m) => m[1].t, 'Double comparison, drop "more/most".'),
  // countable / uncountable
  R('FEWER_LESS', .85, 'less people|items|things|errors|mistakes|cars|students|users|words|options|problems|friends|books|files|days|hours', [0, 0], 'fewer', 'Use "fewer" with countable nouns.'),
  R('MUCH_MANY_UNCOUNT', .9, 'many information|advice|furniture|equipment|luggage|homework|knowledge|news|traffic|feedback|research', [0, 0], 'much', 'This noun is uncountable, use "much".'),
  R('MUCH_MANY_COUNT', .85, 'much people|things|friends|books|cars|items|students|times|problems|questions|ideas|ways|days', [0, 0], 'many', 'This noun is countable, use "many".'),
  // between you and I
  R('BETWEEN_YOU_AND_I', .9, 'between|for|with|to|from you|him|her|them|us and i', [3, 3], 'me', 'After a preposition use "me".'),
  // their / they're / your / you're
  R('THEIR_THEYRE', .88, 'their going|coming|doing|being|not|here|always|very|so|really|too|never|just|still', [0, 0], "they're", 'Did you mean "they\'re" (they are)?'),
  R('THEYRE_THEIR', .85, "they're own|house|car|friends|team|company|family|work|name|phone", [0, 0], 'their', 'Possessive "their" has no apostrophe.'),
  R('YOUR_YOURE', .88, 'your going|being|not|very|so|really|doing|coming|too|a|the|an|my|right|wrong|late|here', [0, 0], "you're", 'Did you mean "you\'re" (you are)?'),
  R('YOURE_YOUR', .85, "you're own|name|house|car|friends|book|phone|team|company|email|account|family", [0, 0], 'your', 'Possessive "your" has no apostrophe.'),
  // affect/effect, advice/advise, breath/breathe, lead/led
  R('AFFECT_EFFECT', .8, 'the|an|a|no|any|this|that|side|positive|negative|adverse|little|great|big affect', [1, 1], 'effect', 'The noun is "effect".'),
  R('ADVISE_VERB', .9, 'to|will|would|can|could|should|must advice', [1, 1], 'advise', 'The verb is "advise".'),
  R('ADVICE_NOUN', .9, 'an|the|some|my|your|good|bad|any|his|her|our|their advise', [1, 1], 'advice', 'The noun is "advice".'),
  R('BREATHE_VERB', .85, 'to|can|will|cannot|could|must breath', [1, 1], 'breathe', 'The verb is "breathe".'),
  R('LED_LEAD', .78, 'has|have|had|was|were|been lead', [1, 1], 'led', 'Past tense of "lead" is "led".'),
  // single-token glued words
  R('INCASE', .93, 'incase', [0, 0], 'in case', 'Two words: "in case".'),
  R('INFACT', .93, 'infact', [0, 0], 'in fact', 'Two words: "in fact".'),
  R('ASWELL', .93, 'aswell', [0, 0], 'as well', 'Two words: "as well".'),
  R('EACHOTHER', .93, 'eachother', [0, 0], 'each other', 'Two words: "each other".'),
  R('ATLEAST', .93, 'atleast', [0, 0], 'at least', 'Two words: "at least".'),
  R('THANKYOU', .93, 'thankyou', [0, 0], 'thank you', 'Two words: "thank you".'),
  R('NOONE', .9, 'noone', [0, 0], 'no one', 'Write "no one" (or "nobody").'),
  R('ALRIGHT_ALL_RIGHT', .0, 'xxxxxxxx', [0, 0], 'x', 'x'),
].filter((r) => r.p > 0);

// Phrase-level malapropisms / eggcorns (multi-word, substring matched)
export const MALAPROPS = [
  ['for all intensive purposes', 'for all intents and purposes'], ['per say', 'per se'], ['sneak peak', 'sneak peek'], ['peaked my interest', 'piqued my interest'],
  ['peak my interest', 'pique my interest'], ['wreck havoc', 'wreak havoc'], ['wreaking havoc', 'wreaking havoc'], ['free reign', 'free rein'], ['tow the line', 'toe the line'],
  ['baited breath', 'bated breath'], ['one in the same', 'one and the same'], ['mute point', 'moot point'], ['hone in on', 'home in on'], ['deep seeded', 'deep-seated'],
  ['case and point', 'case in point'], ['nip it in the butt', 'nip it in the bud'], ['should of', 'should have'], ['supposably', 'supposedly'], ['expresso', 'espresso'],
  ['could care less', "couldn't care less"], ['on accident', 'by accident'], ['statue of limitations', 'statute of limitations'], ['most importantly', 'most important'],
];

const FORMS = { usa: 'USA', whatsapp: 'WhatsApp', youtube: 'YouTube', linkedin: 'LinkedIn', github: 'GitHub', openai: 'OpenAI', tiktok: 'TikTok' };
/** Correct casing for a built-in proper noun (london -> London). */
export const properForm = (w) => FORMS[w] || w.charAt(0).toUpperCase() + w.slice(1);

/* ------------------------------------------------ dialects (plain data, no code) */
// A dialect is data: words to accept, proper nouns with exact casing, preferred spellings.
// Banglish = romanised Bengali as used in Bengali-English writing.
export const DIALECTS = {
  bn: {
    label: 'Banglish',
    accept: `ami tumi apni tui amra tomra ekdom khub bhalo bhalobasha bhalobashi kemon achho acho achi thik hobe hoyeche kothay kothai keno kichu kichhu nei nai ache achhe chai dao dibo jabo jabi jai ashbo asbo esho eso bolo bolchi bolbo dekho dekhi dekhbo shono shunbo khabo khabar khelam kheyechi gelo gechi gelam ghor ghumo ghumao rastay rasta bondhu bandhobi baba dida dadu dadi thakuma thakur boudi boro choto mama mami pishi mashi kaka kakima jethu jethima bhai bon didi dada babu mashai adda para paray bari barir bou bor kaaj kaj jol mishti misti rosogolla rasgulla sandesh sondesh luchi aloo posto ilish hilsa chingri maach bhaat bhat daal jhal jhalmuri phuchka puchka kobiraji nolen gur payesh pithe puli patishapta ghugni kochuri shingara singara bhorta bhaja bhapa kosha mangsho paturi tangra katla bhetki torkari shukto begun beguni pujo pujor pujos pandel pandels dhak dhaki dhunuchi arati aarti anjali sindoor khela bisorjon bijoya shubho subho nabami navami ashtami ashtomi shoptomi saptami dashami dosomi mahalaya boishakh baishakh noboborsho phota rabindrasangeet baul kaku jamai shoshur shashuri bhabi nonod pagol pagla pagli chhele meye bhodro lok shundor sundor bhalobasi dhonnobad dhanyabad dhonyobad abar aar tobe kintu jodi tahole karon sheshe shesh prothom dwitiyo tritiyo`.split(/\s+/),
    proper: 'Durga Kali Saraswati Lakshmi Laxmi Ganesh Kartik Kolkata Howrah Siliguri Darjeeling Durgapur Asansol Bardhaman Nadia Santiniketan Shantiniketan Dhaka Sylhet Chattogram Bengal Bangla Bengali Banglish Rabindranath Tagore Nazrul Satyajit Poila Hooghly Ganga Sundarbans Midnapore Murshidabad Jalpaiguri Kalimpong Bankura Purulia Birbhum'.split(' '),
    // [from, to, note]; case and plurals follow the text
    prefer: [
      ['puja', 'pujo', 'Bengali spelling'], ['pujas', 'pujos', 'Bengali spelling'],
      ['pandal', 'pandel', 'Bengali spelling'], ['pandals', 'pandels', 'Bengali spelling'],
    ],
  },
};

/* --------------------------------------------- ASD-STE100 (Simplified Technical English) */
// Seed list of common words STE replaces with simpler ones. This is NOT ASD's official
// dictionary (that is licensed by ASD). Load your approved-word list with setApproved().
export const STE_WORDS = [
  ['utilize', 'use'], ['utilise', 'use'], ['commence', 'start'], ['initiate', 'start'], ['terminate', 'end'], ['perform', 'do'], ['ensure', 'make sure'],
  ['approximately', 'about'], ['prior to', 'before'], ['subsequent to', 'after'], ['assist', 'help'], ['require', 'need'], ['requires', 'needs'], ['purchase', 'buy'],
  ['provide', 'give'], ['obtain', 'get'], ['indicate', 'show'], ['demonstrate', 'show'], ['additional', 'more'], ['sufficient', 'enough'], ['remainder', 'rest'],
  ['modify', 'change'], ['attempt', 'try'], ['inform', 'tell'], ['locate', 'find'], ['numerous', 'many'], ['frequently', 'often'], ['immediately', 'at once'],
  ['however', 'but'], ['therefore', 'so'], ['whereas', 'but'], ['verify', 'check'], ['activate', 'start'], ['deactivate', 'stop'], ['illuminate', 'light'],
];
