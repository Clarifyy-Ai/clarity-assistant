/**
 * Saved authorized sample HTML fixtures for official government exam listing pages.
 * Used for testing semantic link extraction, multiple selector strategies,
 * and missing expected link detection.
 */

export const UPSC_PREVIOUS_PAPERS_HTML_SAMPLE = `
<!DOCTYPE html>
<html lang="en">
<head><title>Previous Year Question Papers | UPSC</title></head>
<body>
  <div class="view-content">
    <table class="views-table cols-4">
      <thead>
        <tr>
          <th>Exam Name</th>
          <th>Subject / Paper</th>
          <th>Year</th>
          <th>Download</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Civil Services (Preliminary) Examination, 2024</td>
          <td>General Studies Paper - I</td>
          <td>2024</td>
          <td><a href="/sites/default/files/CSP_2024_GS_P1.pdf">Download (2.4 MB)</a></td>
        </tr>
        <tr>
          <td>Civil Services (Preliminary) Examination, 2024</td>
          <td>General Studies Paper - II (CSAT)</td>
          <td>2024</td>
          <td><a href="https://documents.upsc.gov.in/files/CSP_2024_CSAT_P2.pdf">Download (1.8 MB)</a></td>
        </tr>
        <tr>
          <td>Civil Services (Preliminary) Examination, 2024</td>
          <td>Official Answer Key Paper I</td>
          <td>2024</td>
          <td><a href="https://static.upsc.gov.in/files/CSP_2024_Answer_Key_P1.pdf">Answer Key (350 KB)</a></td>
        </tr>
        <tr>
          <td>Civil Services (Preliminary) Examination, 2023</td>
          <td>General Studies Paper - I</td>
          <td>2023</td>
          <td><a href="https://upsc.gov.in/files/CSP_2023_GS_P1.pdf">Download (2.1 MB)</a></td>
        </tr>
      </tbody>
    </table>
  </div>
</body>
</html>
`.trim();

export const SSC_CGL_PAPERS_HTML_SAMPLE = `
<!DOCTYPE html>
<html lang="en">
<head><title>Staff Selection Commission | Tentative Answer Keys & Question Papers</title></head>
<body>
  <div class="main-body">
    <div class="notice-list">
      <div class="notice-item">
        <h3>Combined Graduate Level Examination (Tier-I), 2024: Uploading of Tentative Answer Keys along with Candidates' Response Sheet(s)</h3>
        <span class="publish-date">15/10/2024</span>
        <p>Candidates can access their response sheets and official question paper below:</p>
        <a class="btn-download" href="https://ssc.gov.in/notice_files/CGL_2024_Tier1_Official_Paper.pdf">
          CGL 2024 Tier-I Official Question Paper (PDF 4.2 MB)
        </a>
      </div>
      <div class="notice-item">
        <h3>Combined Graduate Level Examination (Tier-II), 2023 Final Answer Key</h3>
        <span class="publish-date">18/01/2024</span>
        <a href="https://ssc.gov.in/notice_files/CGL_2023_Tier2_Final_Key.pdf">
          CGL 2023 Tier-II Final Answer Key (PDF 1.1 MB)
        </a>
      </div>
    </div>
  </div>
</body>
</html>
`.trim();

export const NTA_EXAM_DOWNLOADS_HTML_SAMPLE = `
<!DOCTYPE html>
<html lang="en">
<head><title>National Testing Agency | Downloads</title></head>
<body>
  <div class="container">
    <ul class="download-list">
      <li>
        <span class="exam-title">JEE (Main) 2024 Session 1 (January) - Paper 1 (B.E./B.Tech) Shift 1</span>
        <a href="https://cdnbbsr.s3waas.gov.in/s3waas/jee_main_2024_jan_shift1.pdf" target="_blank">Download Question Paper</a>
      </li>
      <li>
        <span class="exam-title">JEE (Main) 2024 Session 1 (January) - Official Final Answer Key</span>
        <a href="https://nta.ac.in/Download/Notice/Notice_2024_JEE_Answer_Key.pdf">Answer Key PDF</a>
      </li>
    </ul>
  </div>
</body>
</html>
`.trim();

export const EMPTY_OR_UNEXPECTED_HTML_SAMPLE = `
<!DOCTYPE html>
<html>
<body>
  <p>No notices or examination papers found in this category.</p>
</body>
</html>
`.trim();
