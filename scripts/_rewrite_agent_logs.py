from pathlib import Path
import re

p = Path("src/components/gov-exam/ExamSearchCombobox.tsx")
lines = p.read_text(encoding="utf-8").splitlines(keepends=True)
out = []
n = 0
for line in lines:
    if "7572/ingest/ea82b87b-41ef-4cec-a41d-f9c122e76fc2" not in line:
        out.append(line)
        continue
    m = re.search(
        r"hypothesisId:'([^']+)',location:'([^']+)',message:'([^']+)',data:(\{.*\}),timestamp:Date\.now\(\)",
        line,
    )
    if not m:
        print("NO_MATCH", line[:120])
        out.append(line)
        continue
    indent = line[: len(line) - len(line.lstrip(" "))]
    hyp, loc, msg, data = m.group(1), m.group(2), m.group(3), m.group(4)
    out.append(
        f"{indent}agentDebugLog({{hypothesisId:'{hyp}',location:'{loc}',message:'{msg}',data:{data}}});\n"
    )
    n += 1

p.write_text("".join(out), encoding="utf-8")
print("replacements", n)
