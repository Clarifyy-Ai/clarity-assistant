/**
 * Apply gov exam practice bank seeds via service role (idempotent).
 * Usage: node --use-system-ca scripts/apply-gov-practice-seeds.mjs
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[trimmed.slice(0, eq).trim()] = val;
  }
  return out;
}

const env = { ...loadEnv(".env"), ...loadEnv(".env.local") };
const url = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || "").replace(/\/$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!url || !key) {
  console.error("Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

const meta = {
  official_pyq: false,
  ai_generated: false,
  language: "en",
  disclaimer: "Approved practice-bank item. Not an official previous-year question.",
};

const rows = [
  ["If the cost price of an article is Rs.480 and the profit is 12.5%, the selling price is:", [{"label":"A","text":"Rs.520"},{"label":"B","text":"Rs.540"},{"label":"C","text":"Rs.560"},{"label":"D","text":"Rs.500"}], "B", "SP = 480 x 1.125 = 540.", "Quantitative Aptitude", "Profit and Loss", "EASY", 1, 0.25, "Banking (IBPS/SBI/RBI)"],
  ["A sum becomes Rs.1210 in 2 years at 10% p.a. compound interest. The principal is:", [{"label":"A","text":"Rs.1000"},{"label":"B","text":"Rs.1050"},{"label":"C","text":"Rs.1100"},{"label":"D","text":"Rs.980"}], "A", "P(1.1)^2 = 1210 => P = 1000.", "Quantitative Aptitude", "Compound Interest", "MEDIUM", 1, 0.25, "Banking (IBPS/SBI/RBI)"],
  ["The average of 5 numbers is 42. If one number 50 is removed, the new average is:", [{"label":"A","text":"40"},{"label":"B","text":"41"},{"label":"C","text":"39"},{"label":"D","text":"38"}], "A", "Sum was 210; after removal 160; 160/4 = 40.", "Quantitative Aptitude", "Average", "EASY", 1, 0.25, "Banking (IBPS/SBI/RBI)"],
  ["What is 15% of 240?", [{"label":"A","text":"24"},{"label":"B","text":"30"},{"label":"C","text":"36"},{"label":"D","text":"40"}], "C", "0.15x240 = 36.", "Quantitative Aptitude", "Percentage", "EASY", 1, 0.25, "Banking (IBPS/SBI/RBI)"],
  ["Simple interest on Rs.2000 at 8% p.a. for 3 years is:", [{"label":"A","text":"Rs.400"},{"label":"B","text":"Rs.480"},{"label":"C","text":"Rs.520"},{"label":"D","text":"Rs.360"}], "B", "SI = PRT/100 = 480.", "Quantitative Aptitude", "Simple Interest", "EASY", 1, 0.25, "Banking (IBPS/SBI/RBI)"],
  ["Two pipes fill a tank in 12 and 18 hours. Together they fill it in:", [{"label":"A","text":"6 hours"},{"label":"B","text":"7.2 hours"},{"label":"C","text":"8 hours"},{"label":"D","text":"9 hours"}], "B", "1/12+1/18=5/36 => 7.2 hours.", "Quantitative Aptitude", "Pipes and Cisterns", "MEDIUM", 1, 0.25, "Banking (IBPS/SBI/RBI)"],
  ["A train 180 m long crosses a pole in 9 seconds. Its speed is:", [{"label":"A","text":"54 km/h"},{"label":"B","text":"72 km/h"},{"label":"C","text":"60 km/h"},{"label":"D","text":"90 km/h"}], "B", "180/9=20 m/s = 72 km/h.", "Quantitative Aptitude", "Time Speed Distance", "EASY", 1, 0.25, "Banking (IBPS/SBI/RBI)"],
  ["If 8 men can complete a work in 12 days, 6 men will complete it in:", [{"label":"A","text":"14 days"},{"label":"B","text":"16 days"},{"label":"C","text":"18 days"},{"label":"D","text":"15 days"}], "B", "96/6=16 days.", "Quantitative Aptitude", "Work and Time", "EASY", 1, 0.25, "Banking (IBPS/SBI/RBI)"],
  ["The ratio of two numbers is 3:5 and their sum is 64. The larger number is:", [{"label":"A","text":"24"},{"label":"B","text":"40"},{"label":"C","text":"36"},{"label":"D","text":"48"}], "B", "5x=40.", "Quantitative Aptitude", "Ratio", "EASY", 1, 0.25, "Banking (IBPS/SBI/RBI)"],
  ["The LCM of 12, 15 and 20 is:", [{"label":"A","text":"60"},{"label":"B","text":"120"},{"label":"C","text":"180"},{"label":"D","text":"240"}], "A", "LCM=60.", "Quantitative Aptitude", "Number System", "EASY", 1, 0.25, "Banking (IBPS/SBI/RBI)"],
  ["In a certain code, ROSE is written as TQUG. How is MINT written?", [{"label":"A","text":"OKPV"},{"label":"B","text":"OLPV"},{"label":"C","text":"NKPV"},{"label":"D","text":"OKPU"}], "A", "Each letter +2.", "Reasoning Ability", "Coding-Decoding", "EASY", 1, 0.25, "Banking (IBPS/SBI/RBI)"],
  ["Which comes next: AZ, BY, CX, ?", [{"label":"A","text":"DW"},{"label":"B","text":"EV"},{"label":"C","text":"DU"},{"label":"D","text":"DV"}], "A", "First +1, second -1.", "Reasoning Ability", "Letter Series", "EASY", 1, 0.25, "Banking (IBPS/SBI/RBI)"],
  ["A is taller than B but shorter than C. D is shorter than B. Who is the tallest?", [{"label":"A","text":"A"},{"label":"B","text":"B"},{"label":"C","text":"C"},{"label":"D","text":"D"}], "C", "C > A > B > D.", "Reasoning Ability", "Ordering", "EASY", 1, 0.25, "Banking (IBPS/SBI/RBI)"],
  ["Find the odd one out: 3, 5, 11, 14, 17, 21", [{"label":"A","text":"14"},{"label":"B","text":"11"},{"label":"C","text":"17"},{"label":"D","text":"21"}], "A", "14 is composite.", "Reasoning Ability", "Odd One Out", "EASY", 1, 0.25, "Banking (IBPS/SBI/RBI)"],
  ["Complete the analogy: Book : Reading :: Fork : ?", [{"label":"A","text":"Drawing"},{"label":"B","text":"Writing"},{"label":"C","text":"Eating"},{"label":"D","text":"Cooking"}], "C", "Object-activity pair.", "Reasoning Ability", "Analogy", "EASY", 1, 0.25, "Banking (IBPS/SBI/RBI)"],
  ["Choose the synonym of Rapid:", [{"label":"A","text":"Slow"},{"label":"B","text":"Swift"},{"label":"C","text":"Lazy"},{"label":"D","text":"Dull"}], "B", "Rapid means swift.", "English Language", "Vocabulary", "EASY", 1, 0.25, "Banking (IBPS/SBI/RBI)"],
  ["Choose the antonym of Scarce:", [{"label":"A","text":"Rare"},{"label":"B","text":"Abundant"},{"label":"C","text":"Limited"},{"label":"D","text":"Sparse"}], "B", "Opposite is abundant.", "English Language", "Vocabulary", "EASY", 1, 0.25, "Banking (IBPS/SBI/RBI)"],
  ["Identify the correctly spelled word:", [{"label":"A","text":"Accomodate"},{"label":"B","text":"Accommodate"},{"label":"C","text":"Acommodate"},{"label":"D","text":"Acomodate"}], "B", "Accommodate.", "English Language", "Spelling", "EASY", 1, 0.25, "Banking (IBPS/SBI/RBI)"],
  ["Fill in the blank: She has been working here _____ 2019.", [{"label":"A","text":"for"},{"label":"B","text":"since"},{"label":"C","text":"from"},{"label":"D","text":"at"}], "B", "Since + point in time.", "English Language", "Grammar", "EASY", 1, 0.25, "Banking (IBPS/SBI/RBI)"],
  ["The idiom hit the nail on the head means:", [{"label":"A","text":"To fight"},{"label":"B","text":"To be exactly right"},{"label":"C","text":"To dig"},{"label":"D","text":"To hide"}], "B", "Exactly right.", "English Language", "Idioms", "EASY", 1, 0.25, "Banking (IBPS/SBI/RBI)"],
  ["If 40% of a number is 240, the number is:", [{"label":"A","text":"500"},{"label":"B","text":"600"},{"label":"C","text":"650"},{"label":"D","text":"700"}], "B", "x=600.", "Quantitative Aptitude", "Percentage", "EASY", 2, 0.5, "SSC Exams (CGL/CHSL)"],
  ["Who is known as the Missile Man of India?", [{"label":"A","text":"Vikram Sarabhai"},{"label":"B","text":"A.P.J. Abdul Kalam"},{"label":"C","text":"Homi Bhabha"},{"label":"D","text":"C.V. Raman"}], "B", "Abdul Kalam.", "General Awareness", "Static GK", "EASY", 2, 0.5, "SSC Exams (CGL/CHSL)"],
  ["The currency of Japan is:", [{"label":"A","text":"Yuan"},{"label":"B","text":"Won"},{"label":"C","text":"Yen"},{"label":"D","text":"Ringgit"}], "C", "Yen.", "General Awareness", "Economy", "EASY", 2, 0.5, "SSC Exams (CGL/CHSL)"],
  ["If CLOCK is coded as 34635, how is LOCK coded?", [{"label":"A","text":"4635"},{"label":"B","text":"4536"},{"label":"C","text":"4356"},{"label":"D","text":"4653"}], "A", "Same mapping.", "Reasoning", "Coding", "EASY", 2, 0.5, "SSC Exams (CGL/CHSL)"],
  ["Antonym of Ancient:", [{"label":"A","text":"Old"},{"label":"B","text":"Modern"},{"label":"C","text":"Historic"},{"label":"D","text":"Past"}], "B", "Modern.", "English", "Vocabulary", "EASY", 2, 0.5, "SSC Exams (CGL/CHSL)"],
  ["The square root of 2025 is:", [{"label":"A","text":"35"},{"label":"B","text":"45"},{"label":"C","text":"55"},{"label":"D","text":"65"}], "B", "45^2=2025.", "Quantitative Aptitude", "Squares", "EASY", 2, 0.5, "SSC Exams (CGL/CHSL)"],
  ["Which Article deals with the Right to Equality?", [{"label":"A","text":"Article 14"},{"label":"B","text":"Article 19"},{"label":"C","text":"Article 21"},{"label":"D","text":"Article 32"}], "A", "Article 14.", "General Awareness", "Polity", "MEDIUM", 2, 0.5, "SSC Exams (CGL/CHSL)"],
  ["Odd one out: Square, Circle, Triangle, Cuboid", [{"label":"A","text":"Square"},{"label":"B","text":"Circle"},{"label":"C","text":"Triangle"},{"label":"D","text":"Cuboid"}], "D", "Cuboid is 3D.", "Reasoning", "Odd One Out", "EASY", 2, 0.5, "SSC Exams (CGL/CHSL)"],
  ["15 workers finish a job in 20 days. 10 workers will finish in:", [{"label":"A","text":"25 days"},{"label":"B","text":"30 days"},{"label":"C","text":"35 days"},{"label":"D","text":"40 days"}], "B", "300/10=30.", "Quantitative Aptitude", "Work", "EASY", 2, 0.5, "SSC Exams (CGL/CHSL)"],
  ["Which river is known as the Dakshin Ganga?", [{"label":"A","text":"Krishna"},{"label":"B","text":"Godavari"},{"label":"C","text":"Kaveri"},{"label":"D","text":"Narmada"}], "B", "Godavari.", "General Awareness", "Geography", "MEDIUM", 2, 0.5, "SSC Exams (CGL/CHSL)"],
];

let inserted = 0;
let skipped = 0;
for (const r of rows) {
  const [question_text, options, correct_answer, explanation, subject, topic, difficulty, marks_positive, marks_negative, exam_type] = r;
  const { data: existing } = await db
    .from("questions")
    .select("id")
    .eq("question_text", question_text)
    .eq("exam_type", exam_type)
    .maybeSingle();
  if (existing) {
    skipped += 1;
    continue;
  }
  const { error } = await db.from("questions").insert({
    question_text,
    question_type: "MCQ",
    options,
    correct_answer,
    explanation,
    subject,
    topic,
    difficulty,
    marks_positive,
    marks_negative,
    exam_type,
    source_year: 2025,
    source: "ORIGINAL",
    source_type: "approved_bank",
    is_verified: true,
    is_public: true,
    latex_present: false,
    publish_status: "published",
    review_status: "approved",
    license_type: "ORIGINAL",
    copyright_status: "ORIGINAL",
    metadata: meta,
  });
  if (error) {
    console.error("FAIL", question_text.slice(0, 40), error.message);
    process.exitCode = 1;
  } else {
    inserted += 1;
  }
}

const { count: banking } = await db
  .from("questions")
  .select("id", { count: "exact", head: true })
  .eq("exam_type", "Banking (IBPS/SBI/RBI)")
  .eq("is_public", true)
  .eq("is_verified", true);

const { count: ssc } = await db
  .from("questions")
  .select("id", { count: "exact", head: true })
  .eq("exam_type", "SSC Exams (CGL/CHSL)")
  .eq("is_public", true)
  .eq("is_verified", true);

console.log(JSON.stringify({ inserted, skipped, bankingVerifiedPublic: banking, sscVerifiedPublic: ssc }));
