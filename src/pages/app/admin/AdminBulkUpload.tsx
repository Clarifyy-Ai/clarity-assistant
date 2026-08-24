import { useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { BulkPdfUploadPanel } from "@/components/admin/BulkPdfUploadPanel";
import ExcelImportTab from "@/pages/app/mock-test/ExcelImportTab";
import {
  Upload,
  FileSpreadsheet,
  FileText,
  Download,
  ExternalLink,
  Info,
} from "lucide-react";

export default function AdminBulkUpload() {
  const [refreshKey, setRefreshKey] = useState(0);

  function handleImported() {
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="space-y-6 max-w-5xl pb-20">
      <PageHeader
        title="Bulk Upload Questions"
      description="Import questions and answers for validation and review before publication."
        actions={
          <Link
            to="/app/admin/questions"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            Question editor
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        }
      />

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4 flex gap-3 text-sm">
          <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1 text-muted-foreground">
            <p>
              <strong className="text-foreground">Spreadsheet:</strong> Use the template for bulk
              MCQs with options A–D, correct answer, explanation, subject, and exam type.
            </p>
            <p>
              <strong className="text-foreground">PDF:</strong> Upload official exam papers — AI
              extracts questions automatically (may take 30–60 seconds per file).
            </p>
            <p>
              Imports enter review-required status. They are not public or official until an authorized reviewer approves and publishes them.
            </p>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="spreadsheet" className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="spreadsheet" className="gap-2">
            <FileSpreadsheet className="w-4 h-4" />
            Excel / CSV
          </TabsTrigger>
          <TabsTrigger value="pdf" className="gap-2">
            <FileText className="w-4 h-4" />
            PDF papers
          </TabsTrigger>
        </TabsList>

        <TabsContent value="spreadsheet">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-lg">Spreadsheet bulk import</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Supported formats: <code className="text-xs">.xlsx</code>,{" "}
                <code className="text-xs">.xls</code>, <code className="text-xs">.csv</code> (max 5
                MB). Preview and edit rows before publishing.
              </p>

              <div className="flex flex-wrap gap-2">
                <a href="/Clarify AI_Question_Template.csv" download>
                  <span className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-secondary/60 transition-colors">
                    <Download className="w-4 h-4" />
                    Download CSV template
                  </span>
                </a>
              </div>

              <ExcelImportTab
                key={refreshKey}
                adminMode
                onImported={handleImported}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pdf">
          <Card className="border-primary/20">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-lg">PDF bulk extraction</h3>
              </div>
              <BulkPdfUploadPanel onImported={handleImported} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground text-center">
        Automated scraping pipelines live under{" "}
        <Link to="/app/admin/seed-questions" className="text-primary hover:underline">
          Seed / Import
        </Link>
        .
      </p>
    </div>
  );
}
