// Auto-categorization rules. Each rule matches against a combined text blob of
// title + description + source category, and maps to one or more category slugs.
// Rules are checked in order; multiple rules can match the same event.

const RULES = [
  // ── Sports audience type ──────────────────────────────────────────────────
  // Source-based: school scrapers → youth sports
  { sources: ["harlem", "hononegah", "guilford", "east", "auburn", "jefferson", "lutheran-hs", "boylan"], slugs: ["youth-sports", "sports"] },
  // Rivets = ticketed semi-pro baseball you watch
  { sources: ["rivets"], slugs: ["live-sports", "sports"] },
  // Inter Soccer adult leagues
  { sources: ["intersoccer-saturday", "intersoccer-sunday"], slugs: ["adult-leagues", "sports"] },
  // Keyword-based: youth sports
  { pattern: /\bJV\b|\bvarsity\b|\bIHSA\b|\bNIC-10\b|\bjunior\s*high\b|\bfreshman\b|\b9th.grade\b/i, slugs: ["youth-sports", "sports"] },
  // Youth sports — must pair a youth signal WITH a sport signal to avoid false positives on story times, art classes, etc.
  { pattern: /\b(youth|kids?|children'?s?|junior|toddler)\s+(sports?|soccer|baseball|softball|basketball|football|volleyball|hockey|swim(?:ming)?|tennis|golf|wrestling|lacrosse|cheer(?:leading)?|track|fitness|athletic(?:s)?)\b/i, slugs: ["youth-sports", "sports"] },
  { pattern: /\b(soccer|baseball|softball|basketball|football|volleyball|hockey|swim(?:ming)?|tennis|golf|wrestling|lacrosse|cheer(?:leading)?|track)\s+(camp|clinic|league|team|program|practice|tryout)\b/i, slugs: ["youth-sports", "sports"] },
  { pattern: /\bU\d{1,2}\s+(soccer|baseball|basketball|football|hockey|volleyball|lacrosse)\b/i, slugs: ["youth-sports", "sports"] },
  { pattern: /\bsports?\s+camp\b|\bsummer\s+sports?\s+camp\b|\bpre-?season\s+camp\b/i, slugs: ["youth-sports", "sports"] },

  // Keyword-based: adult leagues / recreational participation
  { pattern: /\badult\s+(league|soccer|basketball|baseball|softball|volleyball|hockey|swim|tennis|golf|wrestling|lacrosse|football|flag\s*football|kickball|dodgeball)\b/i, slugs: ["adult-leagues", "sports"] },
  { pattern: /\b(men'?s|women'?s|co-?ed|mixed)\s+(league|team|soccer|basketball|softball|volleyball|hockey|tennis|golf|lacrosse)\b/i, slugs: ["adult-leagues", "sports"] },
  { pattern: /\bpickup\s+(game|soccer|basketball|hockey|volleyball)\b|\bopen\s+(gym|skate|swim|run)\b|\bdrop.?in\b/i, slugs: ["adult-leagues", "sports"] },
  { pattern: /\brecreational\s+league\b|\brec\s+league\b|\bsandlot\b|\bslow.?pitch\b/i, slugs: ["adult-leagues", "sports"] },

  // Keyword-based: live/spectator sports (ticketed professional or semi-pro)
  { pattern: /\bIceHogs\b|\bRockford\s+IceHogs\b/i, slugs: ["live-sports", "hockey", "sports"] },

  // ── Sports subcategories ─────────────────────────────────────────────────
  // Every sport event also gets "family-kids" as a for-who tag since games are
  // predominantly family/parent-attended.
  { pattern: /\bbaseball\b/i,                              slugs: ["baseball-softball", "family-kids"] },
  { pattern: /\bsoftball\b/i,                              slugs: ["baseball-softball", "family-kids"] },
  { pattern: /\bbasketball\b/i,                            slugs: ["basketball", "family-kids"] },
  { pattern: /\bsoccer\b/i,                                slugs: ["soccer", "family-kids"] },
  { pattern: /\bfootball\b/i,                              slugs: ["football", "family-kids"] },
  { pattern: /\bswimming\b|\bswim\b|\bdiving\b/i,          slugs: ["swimming-diving", "family-kids"] },
  { pattern: /\bvolleyball\b/i,                            slugs: ["volleyball", "family-kids"] },
  { pattern: /\bwrestling\b/i,                             slugs: ["wrestling", "family-kids"] },
  { pattern: /\btennis\b/i,                                slugs: ["tennis", "family-kids"] },
  { pattern: /\bgolf\b/i,                                  slugs: ["golf", "friends-groups"] },
  { pattern: /\btrack\b.*\bfield\b|\btrack &amp; field\b/i, slugs: ["track-field", "family-kids"] },
  { pattern: /\bcross.?country\b/i,                        slugs: ["cross-country", "family-kids"] },
  { pattern: /\bcheer(leading)?\b/i,                       slugs: ["cheerleading", "family-kids"] },
  { pattern: /\bhockey\b|\bicehogs\b/i,                    slugs: ["hockey", "family-kids"] },
  { pattern: /\blacrosse\b/i,                              slugs: ["lacrosse", "family-kids"] },
  { pattern: /\bpickleball\b/i,                            slugs: ["pickleball", "friends-groups"] },

  // ── Boylan HS athletics abbreviations (BTN/TN=tennis, BVB=volleyball,
  //    BTR/GTR/TR=track, VBS/JVBS/BS=baseball, VSC/GSC/SC=soccer) ──────────
  { pattern: /\b(?:BTN|TN)\s+(?:@|vs\b)|\b(?:IHSA|NIC-10)\s+BTN\b/i,                slugs: ["tennis", "family-kids"] },
  { pattern: /\bBVB\b(?:\s*\(V\))?\s+(?:@|vs\b)|\bIHSA\s+BVB\b/i,                   slugs: ["volleyball", "family-kids"] },
  { pattern: /\b(?:BTR|GTR)\s+(?:@|vs\b)|\b(?:IHSA|NIC-10)\s+(?:BTR|GTR)\b|\bB\s*&\s*G\s+TR\b/i, slugs: ["track-field", "family-kids"] },
  { pattern: /\b(?:VBS|JVBS)\b|\b(?:JV|FS\/V)\s+BS\b/i,                             slugs: ["baseball-softball", "family-kids"] },
  { pattern: /\b(?:VSC|GSC)\s+(?:@|vs\b)|\bJV\/V\s+G?SC\b/i,                        slugs: ["soccer", "family-kids"] },

  // ── Minor-league baseball team names (opponent form "X vs Y") ─────────────
  { pattern: /\bSky Carp\b|\bRockford Rivets\b|\bTimber Rattlers\b|\bRiver Bandits\b|\bPeoria Chiefs\b|\bSouth Bend Cubs\b|\bLake County Captains\b|\bCedar Rapids Kernels\b|\bGreat Lakes Loons\b|\bQuad Cities\b/i, slugs: ["baseball-softball", "live-sports", "sports"] },
  { pattern: /\bRockford\s+FC\b|\bRiverdawgs\b|\bRockford\s+Ravens\b/i, slugs: ["live-sports", "sports"] },
  { pattern: /\bRockford\s+Raptors\b.*\bUSL\b|\bUSL\b.*\bRockford\s+Raptors\b/i, slugs: ["live-sports", "soccer", "sports"] },
  { pattern: /\bRockford\s+Raptors\b|\bRaptors\s+(FC|vs\b|U\d)/i, slugs: ["youth-sports", "soccer", "sports"] },

  // ── Motorsports ──────────────────────────────────────────────────────────
  { pattern: /\bNASCAR\b|\bARCA\b|\bspeedway\b|\bmotor\s*speedway\b|\bIndyCar\b|\bF1\b|\bgrand prix\b|\bauto racing\b/i, slugs: ["motorsports", "family-kids"] },

  { pattern: /\bbowling\b/i,                               slugs: ["bowling", "friends-groups"] },
  { pattern: /\bskate\b|\bskating\b/i,                     slugs: ["sports", "family-kids"] },
  { pattern: /\bultimate\b/i,                              slugs: ["sports", "friends-groups"] }, // Ultimate frisbee
  { pattern: /\bkickball\b|\bmma\b|\bmixed martial arts\b/i, slugs: ["sports", "friends-groups"] },
  // RPD sports venue names in category field imply sports context
  { pattern: /\bsportscore\b|\bsports factory\b|\bindoor sports center\b/i, slugs: ["sports", "family-kids"] },
  { pattern: /\b5[- ]?k\b|\bfun run\b|\bfishing\b|\brun.{0,5}walk\b/i, slugs: ["sports", "friends-groups"] },

  // ── Outdoors ─────────────────────────────────────────────────────────────
  { pattern: /\bhike\b|\bhiking\b|\bnature walk\b|\bwildflower\b|\bnaturalist\b|\bbirding\b|\bbird walk\b|\bbird watching\b|\bbirds of prey\b|\bcreek walk\b|\btranquility walk\b/i, slugs: ["outdoors", "family-kids"] },
  { pattern: /\bgardens?\b|\bbotanical\b|\bpollinator\b|\bnative plant\b|\bsteward\b|\bearth day\b|\bplant swap\b|\bsaplings?\b|\bbulbs?\b|\bplanting\b/i, slugs: ["outdoors", "family-kids"] },
  // RPD park venue names in category field imply outdoors context
  { pattern: /\blockwood park\b|\batwood\b/i, slugs: ["outdoors", "family-kids"] },

  // ── Music ────────────────────────────────────────────────────────────────
  { pattern: /\bconcert\b|\blive music\b|\bjazz\b|\bchoir\b|\bchoral\b|\bsymphony\b|\borchestra\b|\brecital\b|\bband\b|\bmusic\b/i, slugs: ["music", "nightlife", "date-night"] },
  { pattern: /\ban evening with\b/i, slugs: ["music", "nightlife", "date-night"] },
  { pattern: /\blive entertainment\b|\bhard rock live\b|\bat hard rock\b/i, slugs: ["music", "performances", "nightlife", "date-night"] },

  // ── Performances ─────────────────────────────────────────────────────────
  { pattern: /\btheater\b|\btheatre\b|\bplay\b|\bmusical\b|\bballet\b|\bdance\b|\bperformance\b|\bshow\b|\bstandup\b|\bstand-up\b|\bcirque\b|\bmagic\b|\bpuppet\b|\bopera\b|\btribute\b|\bbingo\b|\bmurder\b|\blive on stage\b|\bbroadway\b/i, slugs: ["performances", "nightlife", "date-night"] },
  { pattern: /\bcomedy\b|\bcomedian\b|\bimprov\b/i, slugs: ["comedy", "performances", "nightlife", "date-night"] },

  // ── Festivals ────────────────────────────────────────────────────────────
  { pattern: /\bfestival\b|\bfair\b|\bparade\b|\bfest\b|\bmarket\b|\bfarmers market\b|\bblock party\b/i, slugs: ["festivals", "date-night", "friends-groups"] },
  { pattern: /\bgraduation\b|\bcommencement\b/i, slugs: ["family-kids", "friends-groups", "school"] },
  { pattern: /\begg hunt\b/i, slugs: ["festivals", "family-kids"] },
  { pattern: /\btrivia\b/i, slugs: ["friends-groups", "nightlife"] },
  { pattern: /\bnetworking\b|\bmixer\b/i, slugs: ["friends-groups"] },
  { pattern: /\bscavenger hunt\b/i, slugs: ["friends-groups", "family-kids"] },
  { pattern: /\bbrunch\b/i, slugs: ["date-night", "friends-groups"] },
  { pattern: /\bgame night\b|\bboard game\b/i, slugs: ["friends-groups", "date-night"] },
  { pattern: /\btasting\b|\btap takeover\b/i, slugs: ["date-night", "nightlife"] },
  { pattern: /\bpop.?up\b|\bgrand opening\b|\breopening\b/i, slugs: ["friends-groups"] },
  { pattern: /\bexhibits?\b|\bexhibition\b/i, slugs: ["classes", "date-night"] },
  { pattern: /\bfood truck\b/i, slugs: ["festivals", "friends-groups", "family-kids"] },
  { pattern: /\bscreening\b/i, slugs: ["performances", "date-night"] },
  { pattern: /\bexpo\b/i, slugs: ["classes", "friends-groups"] },
  { pattern: /\bgala\b/i, slugs: ["performances", "nightlife", "date-night", "friends-groups"] },
  { pattern: /\bopen house\b/i, slugs: ["friends-groups"] },

  // ── Classes ──────────────────────────────────────────────────────────────
  { pattern: /\bclass\b|\bclasses\b|\bworkshop\b|\blesson\b|\blessons\b|\btraining\b|\bcourse\b|\bseminar\b|\bclinic\b|\btutorial\b|\blecture\b|\bbook club\b|\bwatercolor\b|\bpottery\b|\bknitting\b|\bsewing\b/i, slugs: ["classes", "friends-groups"] },
  { pattern: /\bpaint.{0,5}sip\b|\bsip.{0,5}paint\b|\bpaint\s*(night|nite|party)\b|\bpainting\s*party\b/i, slugs: ["classes", "date-night", "friends-groups"] },
  { pattern: /\bstorytime\b|\bstory time\b/i, slugs: ["classes", "family-kids"] },
  { pattern: /\bcamp\b/i, slugs: ["classes", "family-kids"] },
  { pattern: /\bscience\b/i, slugs: ["classes"] },
  { pattern: /\byoga\b|\bmeditation\b|\bsound bath\b|\bwellness\b/i, slugs: ["classes", "friends-groups"] },
  { pattern: /\bcraft\b|\bcrafts\b|\barts\b/i, slugs: ["classes", "friends-groups"] },
  { pattern: /\bmobile library\b|\binstruction\b|\bleadership\b/i, slugs: ["classes", "friends-groups"] },
  { pattern: /\bconferences?\b|\bsummit\b|\bconvention\b|\bsymposium\b|\bconvening\b/i, slugs: ["classes", "friends-groups"] },
  { pattern: /\bbook\s*(signing|sale|reading|launch|release)s?\b|\bauthor\s*(talk|reading|visit|event)s?\b/i, slugs: ["classes", "friends-groups"] },
  { pattern: /\b(guided|walking|kayak|farm|sanctuary|historic(al)?|coffee|audio|boutique|ghost|pub|winery|brewery|food)\s*(tours?|crawls?)\b|\bbutterfl(y|ies)\b/i, slugs: ["outdoors", "classes"] },
  { pattern: /\btalks?\b|\bspeakers?\b|\bpanel discussion\b|\bcoffee with\b|\bdialogue\b|\bpresentations?\b|\bintroduction to\b|\bfinancial literacy\b|\bQ&A\b/i, slugs: ["classes", "friends-groups"] },
  { pattern: /\bmuseums?\b|\bhistor(y|ic|ical)\b|\bheritage\b|\bburpee\b|\btinker\b|\bellwood\b|\bmidway village\b|\bconservator(y|ium)\b/i, slugs: ["classes", "family-kids"] },
  { pattern: /\b(summer|winter|spring|fall)\s*reading\b/i, slugs: ["classes", "family-kids"] },

  // ── Fundraisers & community benefit ──────────────────────────────────────
  { pattern: /\bfundraisers?\b|\bbenefit\b|\bcharity\b|\bnonprofit\b|\bfor veterans\b|\bfor CASA\b|\bsupport the troops\b|\bvolunteer\b|\bawareness\b|\bdrive\b/i, slugs: ["friends-groups"] },

  // ── Zoo / farm visits / aquarium → family-kids ──────────────────────────
  { pattern: /\bzoo\b|\baquarium\b|\bfarm\s*(visit|sanctuary|day|and)\b/i, slugs: ["family-kids", "outdoors"] },

  // ── Pride events ─────────────────────────────────────────────────────────
  { pattern: /\bpride\s*(festival|parade)\b/i, slugs: ["festivals", "friends-groups"] },
  { pattern: /\bpride\s*(event|month)?\b/i, slugs: ["friends-groups"] },

  // ── Dinner events (annual dinners, themed dinners) ──────────────────────
  { pattern: /\bwine\s*dinner\b|\bdinner\s*(on|with|at|in)\s+the\b|\bannual\s*dinner\b|\bvegan\s*dinner\b/i, slugs: ["date-night", "nightlife"] },

  // ── Miscellaneous gathering/party patterns ──────────────────────────────
  { pattern: /\b(release|welcome|gathering|summer|holiday|viewing|watch)\s*party\b/i, slugs: ["friends-groups"] },
  { pattern: /\bshowcase\b/i, slugs: ["performances", "date-night"] },
  { pattern: /\bteatime\b|\btea\s*party\b|\bhigh tea\b/i, slugs: ["classes", "date-night", "family-kids"] },
  { pattern: /\bpipe organ\b|\borgan encounter\b/i, slugs: ["music", "performances", "date-night"] },
  { pattern: /\bmother[\u0027\u2019]?s day\b|\bfather[\u0027\u2019]?s day\b/i, slugs: ["family-kids", "date-night"] },
  { pattern: /\b5k\b|\b10k\b|\bhalf marathon\b|\bmarathon\b|\bbig run\b/i, slugs: ["sports", "friends-groups"] },
  { pattern: /\bstroll\b/i, slugs: ["outdoors", "date-night"] },
  { pattern: /\bswap\b|\bexchange\b/i, slugs: ["friends-groups"] },
  { pattern: /\bD&D\b|\bdungeons? (&|and) dragons?\b|\brole.?play(ing)?\b/i, slugs: ["friends-groups"] },
  { pattern: /\bride\b|\briders?\b/i, slugs: ["sports", "friends-groups"] },
  { pattern: /\bdrivers? registration\b/i, slugs: ["motorsports", "friends-groups"] },
  { pattern: /\bkubb\b|\brodeo\b|\bcoleadero\b/i, slugs: ["sports", "family-kids"] },
  { pattern: /\bchess\b/i, slugs: ["friends-groups", "classes"] },
  { pattern: /\bfilm\b|\bcelluloid\b|\bcinema\b/i, slugs: ["performances", "date-night"] },
  { pattern: /\btrampoline\b|\badventure\s*park\b|\bjumper(oo)?\b|\bbounce\s*park\b/i, slugs: ["family-kids"] },
  { pattern: /\bfondue\b|\bfish fry\b|\ball you can eat\b|\bbuffet\b|\bwine pairing\b/i, slugs: ["date-night", "friends-groups"] },
  { pattern: /\bgetaway\b|\bretreat\b/i, slugs: ["classes", "friends-groups"] },
  { pattern: /\bart\s*(show|on|walk|fair|crawl)\b/i, slugs: ["festivals", "date-night"] },

  // ── Professional ────────────────────────────────────────────────────────
  // Certification acronyms that only appear in professional training titles
  { pattern: /\b(?:PMP|CAPM|CSM|CBAP|LSSGB|LSSBB|PMI-ACP|PMI-CPMAI|CEH)\b/, slugs: ["professional"] },
  // Lean Six Sigma (appears spelled-out as well as abbreviated above)
  { pattern: /\blean six sigma\b/i, slugs: ["professional"] },
  // Scrum / Agile certification courses
  { pattern: /\bcertified\s+scrum\b|\bscrum\b.*\bcertif|\bagile\b.*\bcertif/i, slugs: ["professional"] },
  // Explicit "certification training/course/bootcamp" phrasing in title
  { pattern: /\bcertification\s+(?:training|course|bootcamp|program)\b/i, slugs: ["professional"] },
  // Project management as a training/development topic
  { pattern: /\bproject management\b/i, slugs: ["professional"] },
  // Career and job fairs
  { pattern: /\bcareer\s+fair\b|\bjob\s+fair\b/i, slugs: ["professional"] },
  // Workforce development events
  { pattern: /\bworkforce\s+(?:development|empowerment|initiative|training)\b/i, slugs: ["professional"] },
  // Business-specific networking (INCROWD815 is a local business networking group)
  { pattern: /\bincrowd815\b|\bbusiness\b.*\bnetwork|\bprofessional\b.*\bnetwork/i, slugs: ["professional"] },
  // Nonprofit management certificate series
  { pattern: /\bnonprofit\s+management\b/i, slugs: ["professional"] },
  // Women in Business and similar professional women's events
  { pattern: /\bwomen in business\b/i, slugs: ["professional", "friends-groups"] },
  // Workplace skills training (sales, employee engagement, conflict resolution)
  { pattern: /\bsales\s+(?:skills|training|closing)\b|\bemployee\s+engagement\b|\bworkplace\s+conflict\b/i, slugs: ["professional"] },
  // Data/tech certification training (distinct from general data talks)
  { pattern: /\bdata\s+analytics?\s+certif|\bdata\s+science\b.*\bcertif|\bethical\s+hacking\b/i, slugs: ["professional"] },

  // ── Nightlife ───────────────────────────────────────────────────────────
  { pattern: /\bnight\s*club\b|\bclub night\b|\bdj\b|\bdance party\b|\bbar crawl\b|\bpub crawl\b|\blate.?night\b|\bafter.?dark\b/i, slugs: ["nightlife", "friends-groups"] },
  { pattern: /\bhappy hour\b|\bkaraoke\b/i, slugs: ["nightlife", "friends-groups"] },
  { pattern: /\blounge\b|\bcocktail\b|\bmixology\b|\btap\s*room\b|\bbrew(ery)?\s*(night|tour)\b/i, slugs: ["nightlife", "date-night"] },

  // ── Date Night ──────────────────────────────────────────────────────────
  { pattern: /\bdate\s*night\b|\bcouples?\s*(night|event|class|workshop)\b|\bromantic\b|\bvalentine\b/i, slugs: ["date-night"] },
  { pattern: /\bwine\s*(tasting|pairing|night|event)\b|\bdinner\s*(theater|theatre|show|event)\b/i, slugs: ["date-night", "nightlife"] },

  // ── Friends & Groups ───────────────────────────────────────────────────
  { pattern: /\bgroup\s*(event|activity|outing)\b|\bfriends?\s*(night|event)\b|\bteam.?building\b/i, slugs: ["friends-groups"] },
  { pattern: /\bopen\s*mic\b|\bopen\s*skate\b|\bopen\s*swim\b|\bopen\s*gym\b/i, slugs: ["friends-groups"] },
  { pattern: /\bpickup\b.*\b(game|basketball|soccer|volleyball)\b/i, slugs: ["friends-groups"] },
  { pattern: /\bbowling\b/i, slugs: ["friends-groups"] },

  // ── Family & Kids ──────────────────────────────────────────────────────
  { pattern: /\bfamily\b|\bkids?\b|\bchildren\b|\bchild\b|\byouth\b|\bjunior\b|\btween\b|\bteen\b/i, slugs: ["family-kids"] },
  { pattern: /\bages?\s*\d/i, slugs: ["family-kids"] },
  { pattern: /\bpetting\s*zoo\b|\bface\s*paint\b|\bbounce\s*house\b|\binflatab\b|\bplayground\b/i, slugs: ["family-kids"] },
  { pattern: /\bpuppet\b|\bmagic\s*show\b|\bstory\s*time\b|\bstorytime\b/i, slugs: ["family-kids"] },
  { pattern: /\blego\b|\bcraft\s*(for|with)\s*(kids|children|families)\b/i, slugs: ["family-kids"] },
];

// Returns the rules in a serializable format for display in the UI.
export function getRulesForDisplay() {
  return RULES
    .filter((r) => r.pattern)
    .map(({ pattern, slugs }) => ({
      slugs,
      keywords: pattern.source
        .split("\\|")
        .map((term) => term.replace(/\\b/g, "").replace(/\(.*?\)\??/g, "").replace(/\\/g, "").replace(/\.\?/g, " ").trim())
        .filter(Boolean),
    }));
}

// Normalize tag strings: decode URL-encoded + as space so "Health+and+Wellness" matches \bwellness\b
function normalizeTags(tags) {
  return tags ? tags.replace(/\+/g, " ") : tags;
}

// Given an event row, return an array of category slugs that match.
// Only returns medium/high confidence matches (title or category/tags) to avoid false positives
// from broad keywords appearing incidentally in descriptions.
export function suggestCategorySlugs(event) {
  return suggestCategoriesWithConfidence(event)
    .filter((m) => m.confidence !== "low")
    .map((m) => m.slug);
}

// Like suggestCategorySlugs but also returns a confidence per slug:
//   high   — rule matched in the event title
//   medium — rule matched in the source category field or tags
//   low    — rule matched only in the description
export function suggestCategoriesWithConfidence(event) {
  const titleText = event.title || "";
  const categoryText = [event.category, normalizeTags(event.tags)].filter(Boolean).join(" ");
  const descText = event.description || "";
  const eventSources = (event.sources || "").split(",").map((s) => s.trim()).filter(Boolean);
  const PRIORITY = { high: 3, medium: 2, low: 1 };
  const slugConfidence = {};
  const slugMatchedKeyword = {};

  for (const rule of RULES) {
    let confidence = null;
    let matchedText = null;

    if (rule.sources) {
      if (rule.sources.some((s) => eventSources.includes(s))) {
        confidence = "high";
        matchedText = eventSources.find((s) => rule.sources.includes(s));
      }
    } else {
      let titleMatch, catMatch, descMatch;
      if ((titleMatch = titleText.match(rule.pattern))) { confidence = "high"; matchedText = titleMatch[0]; }
      else if ((catMatch = categoryText.match(rule.pattern))) { confidence = "medium"; matchedText = catMatch[0]; }
      else if ((descMatch = descText.match(rule.pattern))) { confidence = "low"; matchedText = descMatch[0]; }
    }

    if (confidence) {
      for (const slug of rule.slugs) {
        if (!slugConfidence[slug] || PRIORITY[confidence] > PRIORITY[slugConfidence[slug]]) {
          slugConfidence[slug] = confidence;
          slugMatchedKeyword[slug] = matchedText;
        }
      }
    }
  }

  return Object.entries(slugConfidence).map(([slug, confidence]) => ({ slug, confidence, matched: slugMatchedKeyword[slug] }));
}
