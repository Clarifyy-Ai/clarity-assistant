/**
 * Merge multi-agent QA audit results into src/data/qaChecklist.json
 */
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checklistPath = join(root, "src/data/qaChecklist.json");

/** @type {Record<string, string>} */
const UPDATES = {
  // Auth & Onboarding (agent 1)
  "T-0001": "Pass", "T-0002": "Implemented", "T-0003": "Implemented", "T-0004": "Implemented",
  "T-0005": "Implemented", "T-0006": "Implemented", "T-0007": "Implemented", "T-0008": "Implemented",
  "T-0009": "Implemented",
  "T-0010": "Implemented", "T-0011": "Blocked", "T-0012": "Blocked",
  "T-0013": "Implemented", "T-0014": "Implemented", "T-0015": "Implemented",
  "T-0016": "Implemented", "T-0017": "Blocked", "T-0018": "Implemented", "T-0019": "Blocked",
  "T-0020": "Implemented", "T-0021": "Blocked", "T-0022": "Implemented", "T-0023": "Blocked",
  "T-0024": "Implemented", "T-0025": "Implemented", "T-0026": "Implemented", "T-0027": "Implemented",
  "T-0028": "Pass", "T-0029": "Implemented", "T-0030": "Implemented",
  "T-0031": "Implemented", "T-0032": "Implemented",
  "T-0033": "Implemented", "T-0034": "Implemented", "T-0035": "Implemented", "T-0036": "Implemented",
  "T-0037": "Implemented", "T-0038": "Implemented", "T-0039": "Implemented",
  "T-0040": "Blocked", "T-0041": "Blocked", "T-0042": "Blocked", "T-0043": "Blocked",
  "T-0044": "Implemented", "T-0045": "Implemented", "T-0046": "Implemented", "T-0047": "Implemented",
  "T-0048": "Implemented", "T-0049": "N/A",
  "T-0050": "Implemented", "T-0051": "Implemented", "T-0052": "Implemented",
  "T-0053": "Implemented", "T-0054": "Implemented",
  "T-0055": "Implemented", "T-0056": "Implemented",
  "T-0057": "Implemented", "T-0058": "Implemented",
  "T-0059": "Implemented", "T-0060": "Implemented",
  "T-0068": "Implemented", "T-0069": "Implemented", "T-0070": "Implemented", "T-0071": "Implemented",
  "T-0080": "Implemented", "T-0081": "Implemented", "T-0082": "Implemented", "T-0083": "Implemented",
  "T-0091": "Implemented", "T-0093": "Implemented", "T-0095": "Implemented",
  "T-0097": "Implemented", "T-0098": "Implemented",
  "T-0061": "Implemented", "T-0062": "Implemented", "T-0063": "Implemented", "T-0064": "Implemented",
  "T-0065": "Implemented", "T-0066": "Implemented", "T-0067": "Implemented",
  "T-0072": "Implemented", "T-0073": "Implemented",
  "T-0074": "Implemented", "T-0075": "Implemented", "T-0076": "Implemented", "T-0077": "Implemented",
  "T-0078": "Implemented", "T-0079": "Implemented",
  "T-0084": "Implemented", "T-0085": "Implemented", "T-0086": "Implemented", "T-0087": "Implemented",
  "T-0088": "Implemented", "T-0089": "Implemented", "T-0090": "Implemented", "T-0092": "Implemented",
  "T-0094": "Implemented", "T-0096": "Implemented", "T-0099": "Implemented",

  // Dashboard & Prep (agent 2) - Implemented only
  "T-0103": "Implemented", "T-0104": "Implemented", "T-0105": "Implemented",
  "T-0106": "Implemented", "T-0107": "Implemented", "T-0108": "Implemented",
  "T-0109": "Implemented", "T-0110": "Implemented",
  "T-0111": "Implemented", "T-0112": "Implemented", "T-0113": "Implemented", "T-0115": "Implemented",
  "T-0117": "Implemented",
  "T-0118": "Implemented", "T-0119": "Implemented",
  "T-0121": "Implemented",
  "T-0122": "Implemented", "T-0123": "Implemented", "T-0124": "Implemented", "T-0125": "Implemented",
  "T-0126": "Implemented", "T-0128": "Implemented", "T-0130": "Implemented", "T-0131": "Implemented",
  "T-0132": "Implemented", "T-0133": "Implemented",
  "T-0135": "Implemented", "T-0136": "Implemented", "T-0137": "Implemented",
  "T-0140": "Implemented", "T-0141": "Implemented", "T-0142": "Implemented", "T-0143": "Implemented",
  "T-0144": "Implemented", "T-0148": "Implemented", "T-0149": "Implemented", "T-0153": "Implemented",
  "T-0154": "Implemented", "T-0155": "Implemented", "T-0158": "Implemented", "T-0159": "Implemented",
  "T-0156": "Implemented", "T-0160": "Implemented", "T-0161": "Implemented", "T-0162": "Implemented",
  "T-0174": "Implemented",
  "T-0164": "Implemented", "T-0166": "Implemented", "T-0167": "Implemented", "T-0168": "Implemented",
  "T-0169": "Implemented", "T-0170": "Implemented", "T-0171": "Implemented", "T-0172": "Implemented",
  "T-0173": "Implemented", "T-0175": "Implemented", "T-0176": "Implemented",
  "T-0177": "Implemented", "T-0178": "Implemented", "T-0179": "Implemented", "T-0180": "Implemented",
  "T-0181": "Implemented", "T-0182": "Implemented", "T-0183": "Implemented", "T-0184": "Implemented",
  "T-0190": "Implemented", "T-0191": "Implemented", "T-0192": "Implemented", "T-0193": "Implemented",
  "T-0194": "Implemented", "T-0196": "Implemented", "T-0198": "Implemented", "T-0200": "Implemented",
  "T-0201": "Implemented", "T-0213": "Implemented", "T-0210": "Implemented", "T-0211": "Implemented", "T-0212": "Implemented",
  "T-0214": "Implemented", "T-0216": "Implemented", "T-0217": "Implemented", "T-0218": "Implemented",
  "T-0220": "Implemented", "T-0223": "Implemented", "T-0225": "Implemented", "T-0226": "Implemented",
  "T-0227": "Implemented", "T-0231": "Implemented", "T-0232": "Implemented", "T-0233": "Implemented",
  "T-0236": "Implemented", "T-0237": "Implemented", "T-0238": "Implemented",

  // Sessions/Overlay/Audio (agent 3)
  "T-0240": "Implemented", "T-0241": "Implemented", "T-0242": "Implemented",
  "T-0243": "Implemented", "T-0244": "Implemented", "T-0245": "Implemented", "T-0246": "Implemented", "T-0248": "Implemented",
  "T-0249": "Implemented", "T-0250": "Implemented", "T-0251": "Implemented", "T-0252": "Implemented",
  "T-0253": "Implemented", "T-0254": "Implemented", "T-0255": "Implemented", "T-0256": "Implemented",
  "T-0257": "Implemented", "T-0258": "Implemented", "T-0259": "Implemented", "T-0261": "Implemented",
  "T-0262": "Implemented", "T-0263": "Implemented", "T-0264": "Implemented", "T-0265": "Implemented",
  "T-0266": "Implemented", "T-0267": "Implemented",
  "T-0272": "Implemented",
  "T-0281": "Implemented", "T-0282": "Implemented", "T-0283": "Implemented", "T-0273": "Implemented", "T-0274": "Implemented",
  "T-0277": "Implemented", "T-0278": "Implemented",
  "T-0280": "Implemented", "T-0284": "Implemented",
  "T-0287": "Implemented", "T-0288": "Implemented", "T-0289": "Implemented", "T-0290": "Implemented",
  "T-0291": "Implemented",   "T-0292": "Implemented", "T-0293": "Implemented", "T-0294": "Implemented", "T-0297": "Implemented",
  "T-0298": "Implemented", "T-0299": "Implemented", "T-0306": "Implemented",
  "T-0295": "N/A", "T-0305": "N/A",
  "T-0307": "Implemented", "T-0308": "Implemented", "T-0309": "Implemented",
  "T-0310": "Implemented", "T-0311": "Implemented", "T-0312": "Implemented",
  "T-0313": "Implemented", "T-0314": "Implemented", "T-0315": "Implemented", "T-0316": "Implemented", "T-0317": "Implemented",
  "T-0318": "Implemented", "T-0320": "Implemented", "T-0321": "Implemented", "T-0322": "Implemented",
  "T-0323": "Implemented", "T-0324": "Implemented", "T-0325": "Implemented",   "T-0326": "Implemented", "T-0327": "Implemented",
  "T-0329": "Implemented",
  "T-0334": "Implemented",
  "T-0339": "Implemented", "T-0341": "Implemented", "T-0342": "Implemented", "T-0344": "Implemented", "T-0330": "Implemented", "T-0331": "Implemented", "T-0332": "Implemented",
  "T-0333": "Implemented", "T-0335": "Implemented", "T-0336": "Implemented", "T-0337": "Implemented",
  "T-0338": "Implemented", "T-0340": "Implemented", "T-0343": "Implemented", "T-0345": "Implemented",
  "T-0346": "Implemented", "T-0347": "Implemented", "T-0348": "Implemented", "T-0349": "Implemented",
  "T-0351": "Implemented", "T-0357": "Implemented", "T-0358": "Implemented",
  "T-0360": "Implemented", "T-0361": "Implemented", "T-0362": "Implemented",
  "T-0364": "Implemented", "T-0365": "Implemented", "T-0366": "Implemented", "T-0367": "Implemented",
  "T-0371": "Implemented", "T-0372": "Implemented",
  // Stealth removed for compliance — mark N/A not Implemented
  "T-0296": "N/A", "T-0300": "N/A", "T-0301": "N/A", "T-0302": "N/A", "T-0303": "N/A", "T-0304": "N/A",

  // AI/Analytics/Settings/Billing (agent 4) - clear Implemented
  "T-0374": "Implemented", "T-0376": "Implemented", "T-0377": "Implemented", "T-0378": "Implemented",
  "T-0379": "Implemented", "T-0380": "Implemented", "T-0381": "Implemented",
  "T-0392": "Implemented", "T-0397": "Implemented", "T-0398": "Implemented", "T-0399": "Implemented", "T-0400": "Implemented",
  "T-0401": "Implemented", "T-0402": "Implemented", "T-0405": "Implemented",
  "T-0415": "Implemented", "T-0418": "Implemented", "T-0406": "Implemented", "T-0407": "Implemented", "T-0408": "Implemented",
  "T-0409": "Implemented", "T-0442": "Implemented", "T-0443": "Implemented", "T-0444": "Implemented",
  "T-0445": "Implemented", "T-0449": "Implemented", "T-0450": "Implemented",
  "T-0453": "Implemented", "T-0454": "Implemented",
  "T-0457": "Implemented", "T-0458": "Implemented", "T-0459": "Implemented", "T-0460": "Implemented",
  "T-0463": "Implemented", "T-0464": "Implemented",
  "T-0465": "Implemented", "T-0467": "Implemented", "T-0468": "Implemented", "T-0469": "Implemented", "T-0470": "Implemented",
  "T-0473": "Implemented", "T-0477": "Implemented", "T-0487": "Implemented",
  "T-0490": "Implemented", "T-0493": "Implemented", "T-0498": "Implemented",
  "T-0501": "Implemented", "T-0502": "Implemented", "T-0503": "Implemented", "T-0504": "Implemented",
  "T-0505": "Implemented",   "T-0507": "Implemented", "T-0508": "Implemented", "T-0509": "Implemented", "T-0510": "Implemented",
  "T-0511": "Implemented", "T-0512": "Implemented", "T-0513": "Implemented",
  "T-0515": "Implemented", "T-0516": "Implemented", "T-0527": "Implemented",
  "T-0550": "Implemented",
  // Product uses 200 free credits / different tiers — spec outdated
  "T-0514": "N/A", "T-0522": "N/A", "T-0523": "N/A", "T-0524": "N/A", "T-0525": "N/A",
  // BYOK removed at launch
  "T-0482": "N/A", "T-0483": "N/A", "T-0485": "N/A",
  // Stripe hosted checkout (not embedded Elements) — still valid
  "T-0529": "Implemented", "T-0530": "Implemented", "T-0531": "Implemented", "T-0532": "Implemented",
  "T-0533": "Implemented", "T-0534": "Implemented", "T-0535": "Implemented", "T-0538": "Implemented",
  "T-0542": "Implemented", "T-0543": "Implemented", "T-0544": "Implemented", "T-0545": "Implemented",
  "T-0547": "Implemented", "T-0548": "Implemented", "T-0554": "Implemented", "T-0555": "Implemented",
  "T-0556": "Implemented",

  // Testing section (agent 5) - Implemented and N/A
  "T-0570": "Implemented", "T-0571": "Implemented", "T-0572": "Implemented", "T-0573": "Implemented",
  "T-0574": "Implemented", "T-0575": "Implemented", "T-0576": "Implemented", "T-0577": "Implemented",
  "T-0578": "Implemented", "T-0579": "Implemented", "T-0580": "Implemented",
  "T-0585": "Implemented", "T-0588": "Implemented", "T-0589": "Implemented",
  "T-0598": "Implemented", "T-0599": "Implemented", "T-0600": "Implemented", "T-0601": "Implemented",
  "T-0603": "Implemented", "T-0604": "Implemented", "T-0605": "Implemented", "T-0606": "Implemented",
  "T-0607": "Implemented", "T-0608": "Implemented",
  "T-0618": "Implemented", "T-0630": "Implemented", "T-0646": "Implemented",
  "T-0657": "N/A", "T-0664": "N/A", "T-0676": "N/A", "T-0677": "N/A", "T-0678": "N/A", "T-0679": "N/A",
  "T-0674": "Implemented", "T-0682": "Implemented", "T-0683": "Implemented", "T-0684": "Implemented",
  "T-0685": "Implemented", "T-0686": "Implemented", "T-0687": "Implemented",
  "T-0690": "N/A", "T-0691": "Implemented",
  "T-0692": "Implemented", "T-0693": "Implemented", "T-0694": "Implemented", "T-0695": "Implemented",
  "T-0696": "Implemented", "T-0697": "Implemented", "T-0698": "Implemented",
  "T-0699": "Implemented", "T-0700": "Implemented", "T-0701": "Implemented",
  "T-0703": "Implemented", "T-0704": "Implemented", "T-0705": "N/A", "T-0706": "Implemented",
  "T-0707": "Implemented", "T-0709": "Implemented", "T-0710": "Implemented", "T-0711": "Implemented",
  "T-0712": "Implemented", "T-0715": "N/A", "T-0716": "Implemented",
  "T-0717": "Implemented", "T-0718": "Implemented", "T-0720": "Implemented", "T-0723": "Implemented",
  "T-0724": "Implemented", "T-0727": "N/A", "T-0728": "Implemented", "T-0729": "Implemented",
  "T-0731": "N/A", "T-0732": "N/A", "T-0733": "N/A", "T-0734": "N/A", "T-0735": "N/A",
  "T-0736": "N/A", "T-0737": "N/A", "T-0738": "N/A",
  "T-0739": "Implemented", "T-0740": "Implemented", "T-0741": "Implemented", "T-0742": "Implemented",
  "T-0743": "Implemented", "T-0744": "Implemented", "T-0746": "Implemented", "T-0747": "Implemented",
  "T-0749": "Implemented", "T-0750": "Implemented", "T-0751": "Implemented", "T-0752": "Implemented",
  "T-0753": "Implemented", "T-0754": "Implemented", "T-0755": "N/A",
  "T-0756": "Implemented", "T-0759": "Implemented", "T-0760": "Implemented", "T-0761": "Implemented",
  "T-0762": "Implemented", "T-0763": "Implemented",
  "T-0772": "Implemented", "T-0773": "Implemented", "T-0774": "Implemented", "T-0775": "Implemented",
  "T-0776": "Implemented", "T-0777": "Implemented", "T-0778": "Implemented", "T-0779": "Implemented",
  "T-0780": "Implemented", "T-0781": "Implemented", "T-0782": "Implemented", "T-0783": "N/A",
  "T-0784": "Implemented", "T-0786": "Implemented", "T-0787": "Implemented", "T-0788": "Implemented",
  "T-0789": "Implemented", "T-0791": "N/A", "T-0793": "N/A", "T-0794": "Implemented", "T-0795": "Implemented",
  "T-0797": "N/A", "T-0798": "Implemented", "T-0799": "Implemented", "T-0801": "Implemented",
  "T-0802": "N/A", "T-0803": "N/A", "T-0804": "N/A", "T-0805": "Implemented", "T-0806": "Implemented",
  "T-0808": "N/A", "T-0810": "N/A",
  "T-0836": "Implemented", "T-0839": "Implemented",
  "T-0852": "Implemented", "T-0866": "Implemented", "T-0892": "Implemented",
  "T-0897": "Implemented", "T-0901": "Implemented", "T-0903": "Implemented",

  // Wave 3 — analytics, mock, docs, e2e, a11y
  "T-0185": "Implemented", "T-0186": "Implemented", "T-0187": "Implemented",
  "T-0188": "Implemented", "T-0189": "Implemented", "T-0195": "Implemented",
  "T-0224": "Implemented", "T-0229": "Implemented", "T-0230": "Implemented",
  "T-0145": "Implemented", "T-0146": "Implemented", "T-0147": "Implemented",
  "T-0150": "Implemented", "T-0151": "Implemented", "T-0152": "Implemented", "T-0163": "Implemented",
  "T-0239": "Implemented", "T-0247": "Implemented",
  "T-0260": "Implemented", "T-0269": "Implemented", "T-0270": "Implemented", "T-0271": "Implemented",
  "T-0275": "Implemented", "T-0276": "Implemented", "T-0279": "Implemented",
  "T-0411": "Implemented", "T-0412": "Implemented", "T-0413": "Implemented", "T-0414": "Implemented",
  "T-0416": "Implemented", "T-0417": "Implemented", "T-0419": "Implemented", "T-0420": "Implemented",
  "T-0421": "Implemented", "T-0422": "Implemented", "T-0423": "Implemented", "T-0424": "Implemented",
  "T-0425": "Implemented", "T-0426": "Implemented", "T-0427": "Implemented", "T-0428": "Implemented",
  "T-0429": "Implemented", "T-0430": "Implemented", "T-0431": "Implemented",
  "T-0437": "Implemented", "T-0438": "Implemented", "T-0439": "Implemented", "T-0440": "Implemented",
  "T-0441": "Implemented", "T-0451": "Implemented",
  "T-0114": "Implemented", "T-0116": "Implemented", "T-0134": "Implemented", "T-0138": "Implemented",
  "T-0129": "Implemented", "T-0638": "Implemented", "T-0639": "Implemented", "T-0867": "Implemented",
  "T-0851": "Implemented",
  "T-0568": "Pass", "T-0569": "Pass", "T-0893": "Pass", "T-0894": "Pass", "T-0895": "Pass",
  "T-0900": "Pass", "T-0902": "Pass",
  "T-0896": "Implemented",
  "T-0898": "Blocked", "T-0899": "Blocked",
  "T-0688": "Implemented", "T-0726": "Implemented",
  // SLA / accuracy / infra — not app-verifiable
  "T-0353": "Blocked", "T-0354": "Blocked", "T-0391": "Blocked", "T-0396": "Blocked",
  "T-0404": "N/A", "T-0517": "Blocked", "T-0536": "Blocked", "T-0552": "Blocked",
  // Wave 4 — final quick wins
  "T-0404": "Implemented", "T-0517": "Implemented", "T-0552": "Implemented",
  "T-0286": "Implemented", "T-0100": "Implemented", "T-0101": "Implemented",
  "T-0471": "Implemented", "T-0474": "Implemented", "T-0476": "Implemented",
  "T-0491": "Implemented", "T-0492": "Implemented", "T-0519": "Implemented",
};

const VALID = new Set(["Not Tested", "Pass", "Fail", "Blocked", "N/A", "Implemented"]);

const data = JSON.parse(readFileSync(checklistPath, "utf8"));
let changed = 0;

for (const item of data) {
  const next = UPDATES[item.id];
  if (next && VALID.has(next) && item.status !== next) {
    item.status = next;
    changed++;
  }
}

writeFileSync(checklistPath, JSON.stringify(data, null, 2) + "\n");

const stats = {};
for (const item of data) {
  stats[item.status] = (stats[item.status] || 0) + 1;
}

console.log(`Updated ${changed} items. Stats:`, stats);
console.log(`Coverage (Pass+Implemented): ${Math.round(((stats.Pass||0)+(stats.Implemented||0))/data.length*100)}%`);
