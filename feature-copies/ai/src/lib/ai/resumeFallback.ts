import type { ParsedResume, ParsedExperience } from "@/types/ai.types";
import type { InterviewType } from "@/types/session.types";

export interface ResumeTalkingPoints {
  intro: string;
  skills_summary: string;
  project_highlights: string[];
  experience_points: string[];
  education_line: string | null;
  interview_tips: string[];
}

export interface ResumeContext {
  skills_count: number;
  experience_count: number;
  total_years: number | null;
  top_skills: string[];
  summary: string | null;
}

export function buildResumeContext(parsed: ParsedResume | null): ResumeContext | null {
  if (!parsed) return null;

  const allSkills = [...new Set([...(parsed.skills ?? []), ...(parsed.tech_stack ?? [])])];

  return {
    skills_count: allSkills.length,
    experience_count: parsed.experience?.length ?? 0,
    total_years: parsed.total_years_experience,
    top_skills: allSkills.slice(0, 8),
    summary: parsed.summary,
  };
}

export function generateResumeTalkingPoints(
  parsed: ParsedResume | null,
  sessionConfig?: { company?: string | null; role?: string | null; interview_type?: InterviewType }
): ResumeTalkingPoints | null {
  if (!parsed) return null;

  const allSkills = [...new Set([...(parsed.skills ?? []), ...(parsed.tech_stack ?? [])])];
  const company = sessionConfig?.company;
  const role = sessionConfig?.role;
  const interviewType = sessionConfig?.interview_type ?? "mixed";

  const intro = buildIntro(parsed, company, role);
  const skills_summary = buildSkillsSummary(allSkills);
  const project_highlights = buildProjectHighlights(parsed);
  const experience_points = buildExperiencePoints(parsed.experience ?? []);
  const education_line = buildEducationLine(parsed);
  const interview_tips = buildInterviewTips(interviewType, allSkills, parsed);

  return {
    intro,
    skills_summary,
    project_highlights,
    experience_points,
    education_line,
    interview_tips,
  };
}

export function formatTalkingPointsAsHint(points: ResumeTalkingPoints): string {
  const sections: string[] = [];

  sections.push("📋 Your Talking Points");
  sections.push("");
  sections.push("**Introduction:**");
  sections.push(points.intro);

  if (points.skills_summary) {
    sections.push("");
    sections.push("**Key Skills:**");
    sections.push(points.skills_summary);
  }

  if (points.experience_points.length > 0) {
    sections.push("");
    sections.push("**Experience Highlights:**");
    points.experience_points.forEach((p) => sections.push(`• ${p}`));
  }

  if (points.project_highlights.length > 0) {
    sections.push("");
    sections.push("**Notable Projects:**");
    points.project_highlights.forEach((p) => sections.push(`• ${p}`));
  }

  if (points.education_line) {
    sections.push("");
    sections.push(`**Education:** ${points.education_line}`);
  }

  if (points.interview_tips.length > 0) {
    sections.push("");
    sections.push("**Quick Tips:**");
    points.interview_tips.forEach((t) => sections.push(`• ${t}`));
  }

  return sections.join("\n");
}

function buildIntro(
  parsed: ParsedResume,
  company?: string | null,
  role?: string | null
): string {
  const parts: string[] = [];

  const name = parsed.full_name;
  const years = parsed.total_years_experience;
  const latestRole = parsed.experience?.[0]?.title;
  const latestCompany = parsed.experience?.[0]?.company;

  if (name) parts.push(`"Hi, I'm ${name}.`);
  else parts.push(`"Hi.`);

  if (years && latestRole) {
    parts.push(`I'm a ${latestRole} with ${years}+ years of experience.`);
  } else if (latestRole) {
    parts.push(`I'm a ${latestRole}.`);
  }

  if (latestCompany) {
    parts.push(`Most recently, I worked at ${latestCompany}.`);
  }

  if (company && role) {
    parts.push(`I'm excited about the ${role} opportunity at ${company}."`);
  } else if (company) {
    parts.push(`I'm excited about this opportunity at ${company}."`);
  } else if (role) {
    parts.push(`I'm excited about the ${role} position."`);
  } else {
    parts.push(`I'm looking forward to discussing how I can contribute."`);
  }

  return parts.join(" ");
}

function buildSkillsSummary(skills: string[]): string {
  if (skills.length === 0) return "No skills listed — mention your core technical competencies.";
  const top = skills.slice(0, 10);
  return top.join(", ");
}

function buildProjectHighlights(parsed: ParsedResume): string[] {
  const projects = parsed.projects ?? [];
  return projects.slice(0, 3).map((p) => {
    const parts = [p.name];
    if (p.role) parts.push(`(${p.role})`);
    if (p.tech_stack?.length) parts.push(`— ${p.tech_stack.slice(0, 3).join(", ")}`);
    if (p.impact_metric) parts.push(`→ ${p.impact_metric}`);
    return parts.join(" ");
  });
}

function buildExperiencePoints(experience: ParsedExperience[]): string[] {
  return experience.slice(0, 3).map((exp) => {
    const parts = [`${exp.title} at ${exp.company}`];
    if (exp.impact_bullets?.length) {
      parts.push(`— ${exp.impact_bullets[0]}`);
    }
    return parts.join(" ");
  });
}

function buildEducationLine(parsed: ParsedResume): string | null {
  const edu = parsed.education?.[0];
  if (!edu) return null;
  const parts: string[] = [];
  if (edu.degree) parts.push(edu.degree);
  if (edu.field) parts.push(`in ${edu.field}`);
  if (edu.institution) parts.push(`from ${edu.institution}`);
  if (edu.graduation_year) parts.push(`(${edu.graduation_year})`);
  return parts.length > 0 ? parts.join(" ") : null;
}

function buildInterviewTips(
  interviewType: InterviewType,
  skills: string[],
  parsed: ParsedResume
): string[] {
  const tips: string[] = [];

  if (interviewType === "behavioural" || interviewType === "mixed") {
    if (parsed.experience?.[0]?.impact_bullets?.length) {
      tips.push("Use your impact bullets in STAR answers — you have quantified results ready");
    }
  }

  if (interviewType === "technical" || interviewType === "mixed") {
    if (skills.length > 0) {
      tips.push(`Mention proficiency in: ${skills.slice(0, 5).join(", ")}`);
    }
  }

  if (interviewType === "system_design") {
    const techUsed = parsed.experience?.flatMap((e) => e.tech_used ?? []) ?? [];
    const unique = [...new Set(techUsed)].slice(0, 5);
    if (unique.length > 0) {
      tips.push(`Reference technologies you've used: ${unique.join(", ")}`);
    }
  }

  if (parsed.projects?.length) {
    tips.push(`You have ${parsed.projects.length} project(s) to reference as concrete examples`);
  }

  return tips;
}
