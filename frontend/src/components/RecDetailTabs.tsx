import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Props = {
  courseworkDescription?: string;
  rationale?: string;
  className?: string;
};

/**
 * Detail panels stay closed until the faculty picks a tab.
 */
export default function RecDetailTabs({ courseworkDescription, rationale, className }: Props) {
  const [tab, setTab] = useState("");
  const coursework = (courseworkDescription || "").trim();
  const why = (rationale || "").trim();
  if (!coursework && !why) return null;

  return (
    <Tabs
      value={tab}
      onValueChange={setTab}
      className={className ?? "rec-detail-tabs"}
    >
      <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-[rgba(243,247,249,0.95)] p-1">
        <TabsTrigger
          value="coursework"
          className="data-[state=active]:bg-white data-[state=active]:text-[var(--phact-navy)]"
          disabled={!coursework}
        >
          CourseWork Description
        </TabsTrigger>
        <TabsTrigger
          value="why"
          className="data-[state=active]:bg-white data-[state=active]:text-[var(--phact-navy)]"
          disabled={!why}
        >
          Why This Matters
        </TabsTrigger>
      </TabsList>
      {tab === "coursework" && coursework && (
        <TabsContent value="coursework" className="rec-detail-panel coursework-panel mt-3">
          <p>{coursework}</p>
        </TabsContent>
      )}
      {tab === "why" && why && (
        <TabsContent value="why" className="rec-detail-panel rationale-panel mt-3">
          <p>{why}</p>
        </TabsContent>
      )}
      {!tab && (
        <p className="rec-detail-hint muted small">
          Choose a tab to read the coursework description or why this change matters.
        </p>
      )}
    </Tabs>
  );
}
