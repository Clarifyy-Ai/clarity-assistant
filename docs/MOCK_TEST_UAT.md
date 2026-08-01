# Mock Test / Gov Exam UAT

## Smoke

1. Open `/app/mock-test` — search hero visible; disclaimer present  
2. Search `CGL` — SSC Combined Graduate Level appears  
3. Search `APPSC` — APPSC Group-II Screening appears (State PSC pilot; verify on psc.ap.gov.in)  
4. Open exam detail — pattern marks / negative marking / official link  
5. Routes: `/app/mock-test/exam/APPSC_GROUP2`, `/app/mock-test/generate`  
6. Generate → Quick practice (25Q) — job stages advance; mock session opens when bank has ≥5 public questions  
7. Full simulation with empty bank — fails with `INSUFFICIENT_APPROVED_QUESTIONS` (no silent shrink)  
8. Timed session — autosave + submit still works via existing TestSession; paper class / disclaimer visible in session header and results  
9. Results lead with one “Next focus” insight when weak topics / section breakdown exist  
10. Hindi / Telugu label options available where configured on generate step  

## Accessibility

- Search input labeled  
- Stepper stages text + color  
- Palette states not color-only (existing runner)
